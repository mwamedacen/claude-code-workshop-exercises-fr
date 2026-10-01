import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../server/index.js';

// Horloge simulée : mercredi 7 octobre 2026, 9h05.
const MAINTENANT = '2026-10-07T09:05';
const AUJOURDHUI = '2026-10-07';

async function avecServeur(f) {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant: MAINTENANT });
  try {
    await f(s.url);
  } finally {
    await s.fermer();
  }
}

async function appel(url, methode, chemin, corps) {
  const r = await fetch(url + chemin, {
    method: methode,
    headers: corps ? { 'Content-Type': 'application/json' } : {},
    body: corps ? JSON.stringify(corps) : undefined,
  });
  return { statut: r.status, donnees: await r.json() };
}

test('le plan a 50 postes et 8 salles', async () => {
  await avecServeur(async (url) => {
    const { donnees } = await appel(url, 'GET', '/api/plan');
    assert.equal(donnees.postes.length, 50);
    assert.equal(donnees.salles.length, 8);
  });
});

test("on peut réserver un poste libre aujourd'hui", async () => {
  await avecServeur(async (url) => {
    const jour = (await appel(url, 'GET', `/api/reservations?jour=${AUJOURDHUI}`)).donnees;
    const pris = new Set(jour.map((r) => r.ressource));
    const plan = (await appel(url, 'GET', '/api/plan')).donnees;
    const libre = plan.postes.find((p) => !pris.has(p.id));
    const r = await appel(url, 'POST', '/api/reservations', { type: 'poste', ressource: libre.id, employe: 'e004', jour: AUJOURDHUI });
    assert.equal(r.statut, 201);
  });
});

test('un poste ne peut pas être réservé deux fois le même jour', async () => {
  await avecServeur(async (url) => {
    const jour = (await appel(url, 'GET', `/api/reservations?jour=${AUJOURDHUI}`)).donnees;
    const pris = jour.find((r) => r.type === 'poste');
    const r = await appel(url, 'POST', '/api/reservations', { type: 'poste', ressource: pris.ressource, employe: 'e004', jour: AUJOURDHUI });
    assert.equal(r.statut, 409);
  });
});

test('on peut réserver un poste pour la semaine prochaine', async () => {
  await avecServeur(async (url) => {
    // T07, jeudi de la semaine prochaine (15 octobre 2026), est libre dans les données de démonstration.
    const r = await appel(url, 'POST', '/api/reservations', { type: 'poste', ressource: 'T07', employe: 'e004', jour: '2026-10-15' });
    assert.equal(r.statut, 201);
  });
});

test.skip('TODO : tester les salles', () => {});
