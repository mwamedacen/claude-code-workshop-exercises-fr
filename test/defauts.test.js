import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../server/index.js';

// Horloge simulée : mercredi 7 octobre 2026, 9h05.
const MAINTENANT = '2026-10-07T09:05';
const MARDI = '2026-10-13';
const JEUDI = '2026-10-15';

async function avecServeur(f) {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant: MAINTENANT });
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(s.url + chemin, {
      method: methode,
      headers: corps ? { 'Content-Type': 'application/json' } : {},
      body: corps ? JSON.stringify(corps) : undefined,
    });
    return { statut: r.status, donnees: await r.json() };
  };
  try {
    await f(appel);
  } finally {
    await s.fermer();
  }
}

test("une salle refuse plus de monde qu'elle n'a de places", async () => {
  await avecServeur(async (appel) => {
    const r = await appel('POST', '/api/reservations', { type: 'salle', ressource: 'bulle-1', employe: 'e001', jour: JEUDI, debut: '15h00', fin: '16h00', nb: 9 });
    assert.equal(r.statut, 409);
    const ok = await appel('POST', '/api/reservations', { type: 'salle', ressource: 'bulle-1', employe: 'e001', jour: JEUDI, debut: '15h00', fin: '16h00', nb: 2 });
    assert.equal(ok.statut, 201);
  });
});

test('une réservation pour jeudi est enregistrée jeudi', async () => {
  await avecServeur(async (appel) => {
    await appel('POST', '/api/reservations', { type: 'poste', ressource: 'T07', employe: 'e001', jour: JEUDI });
    const mes = (await appel('GET', '/api/mes-reservations?employe=e001')).donnees;
    assert.equal(mes.find((r) => r.ressource === 'T07').jour, JEUDI);
  });
});

test("annuler ma 2e réservation annule la mienne, pas celle d'un collègue", async () => {
  await avecServeur(async (appel) => {
    const avant = (await appel('GET', '/api/mes-reservations?employe=e001')).donnees;
    const total = (await appel('GET', '/api/reservations?jour=2026-10-07')).donnees.length;
    await appel('DELETE', '/api/mes-reservations/1?employe=e001');
    const apres = (await appel('GET', '/api/mes-reservations?employe=e001')).donnees;
    assert.deepEqual(apres.map((r) => r.id), avant.filter((_, i) => i !== 1).map((r) => r.id));
    assert.equal((await appel('GET', '/api/reservations?jour=2026-10-07')).donnees.length, total);
  });
});

test("on ne signale pas son arrivée pour une réservation d'un autre jour", async () => {
  await avecServeur(async (appel) => {
    const mardi = (await appel('GET', '/api/mes-reservations?employe=e001')).donnees.find((r) => r.jour === MARDI);
    const r = await appel('POST', `/api/reservations/${mardi.id}/arrivee`, { employe: 'e001' });
    assert.equal(r.statut, 409);
  });
});

test("on signale son arrivée le jour même, sur sa propre réservation", async () => {
  await avecServeur(async (appel) => {
    const pris = new Set((await appel('GET', '/api/reservations?jour=2026-10-07')).donnees.map((r) => r.ressource));
    const plan = (await appel('GET', '/api/plan')).donnees;
    const libre = plan.postes.find((p) => !pris.has(p.id));
    const { donnees } = await appel('POST', '/api/reservations', { type: 'poste', ressource: libre.id, employe: 'e001', jour: '2026-10-07' });
    assert.equal((await appel('POST', `/api/reservations/${donnees.id}/arrivee`, { employe: 'e002' })).statut, 403);
    assert.equal((await appel('POST', `/api/reservations/${donnees.id}/arrivee`, { employe: 'e001' })).statut, 200);
  });
});
