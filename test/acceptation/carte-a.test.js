import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../../server/index.js';

// Carte A « Libérer une salle restée vide » : une réunion du jour sans arrivée signalée 10 minutes
// après son début est libérée (liberee: true) et sa salle redevient disponible.
const JOUR = '2026-10-07'; // le jour de l'horloge simulée

async function avecServeur(maintenant, f) {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant });
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

// Une réunion dans la salle Seine (4 places), le jour même. Seine a déjà une réunion de démonstration
// de 13h30 à 14h30, sans arrivée signalée : la carte A la libère aussi.
const reunion = (employe, debut, fin) => ({ type: 'salle', ressource: 'seine', employe, jour: JOUR, debut, fin, nb: 2 });

async function reserver(appel, employe, debut, fin) {
  const r = await appel('POST', '/api/reservations', reunion(employe, debut, fin));
  assert.equal(r.statut, 201, `réunion de ${debut} à ${fin} : ${JSON.stringify(r.donnees)}`);
  return r.donnees.id;
}

// La ligne d'une réservation dans le planning du jour, puis dans les réservations de la personne.
const dansLeJour = async (appel, id) =>
  (await appel('GET', `/api/reservations?jour=${JOUR}`)).donnees.find((r) => r.id === id);
const dansMesReservations = async (appel, employe, id) =>
  (await appel('GET', `/api/mes-reservations?employe=${employe}`)).donnees.find((r) => r.id === id);

test('sans arrivée signalée 10 minutes après le début, la réunion est libérée et la salle se réserve de nouveau', async () => {
  await avecServeur(`${JOUR}T14:15`, async (appel) => {
    const id = await reserver(appel, 'e002', '14h00', '15h00');
    assert.equal((await dansLeJour(appel, id))?.liberee, true, 'liberee dans GET /api/reservations');
    await reserver(appel, 'e003', '14h30', '15h00');
  });
});

test('la personne qui a réservé voit sa réunion libérée dans ses réservations', async () => {
  await avecServeur(`${JOUR}T14:15`, async (appel) => {
    const id = await reserver(appel, 'e002', '14h00', '15h00');
    assert.equal((await dansMesReservations(appel, 'e002', id))?.liberee, true, 'liberee dans GET /api/mes-reservations');
  });
});

test('avant les 10 minutes, la réunion reste réservée', async () => {
  await avecServeur(`${JOUR}T14:05`, async (appel) => {
    const id = await reserver(appel, 'e002', '14h00', '15h00');
    assert.equal((await dansLeJour(appel, id))?.liberee, false, 'liberee dans GET /api/reservations');
    assert.equal((await dansMesReservations(appel, 'e002', id))?.liberee, false, 'liberee dans GET /api/mes-reservations');
    assert.equal((await appel('POST', '/api/reservations', reunion('e003', '14h30', '15h00'))).statut, 409);
  });
});

test("une réunion dont l'arrivée est signalée reste réservée", async () => {
  await avecServeur(`${JOUR}T14:15`, async (appel) => {
    const id = await reserver(appel, 'e002', '14h00', '15h00');
    assert.equal((await appel('POST', `/api/reservations/${id}/arrivee`, { employe: 'e002' })).statut, 200);
    assert.equal((await dansLeJour(appel, id))?.liberee, false, 'liberee dans GET /api/reservations');
    assert.equal((await appel('POST', '/api/reservations', reunion('e003', '14h30', '15h00'))).statut, 409);
  });
});

test('« Salle libre maintenant » propose une salle libérée', async () => {
  await avecServeur(`${JOUR}T14:15`, async (appel) => {
    await reserver(appel, 'e002', '14h00', '15h00');
    const { salles } = (await appel('GET', '/api/salles-libres?personnes=4')).donnees;
    assert.ok(salles.some((s) => s.id === 'seine'), 'Seine dans GET /api/salles-libres');
  });
});

test('une arrivée tardive est refusée si la salle libérée a été réservée entre-temps', async () => {
  await avecServeur(`${JOUR}T14:15`, async (appel) => {
    const premiere = await reserver(appel, 'e002', '14h00', '15h00');
    const seconde = await reserver(appel, 'e003', '14h30', '15h00');
    assert.equal((await appel('POST', `/api/reservations/${premiere}/arrivee`, { employe: 'e002' })).statut, 409);
    assert.equal((await dansLeJour(appel, premiere))?.liberee, true, 'la première réunion reste libérée');
    assert.equal((await dansLeJour(appel, seconde))?.liberee, false, 'la seconde réunion reste réservée');
  });
});
