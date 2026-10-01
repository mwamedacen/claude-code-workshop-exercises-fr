import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../server/index.js';

// Horloge simulée : mercredi 7 octobre 2026, 9h05. Jeudi de la semaine prochaine : 15 octobre.
const MAINTENANT = '2026-10-07T09:05';
const JEUDI = '2026-10-15';

async function avecServeur(f) {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant: MAINTENANT });
  try {
    await f(s.url);
  } finally {
    await s.fermer();
  }
}

async function reserverSalle(url, employe, debut, fin, nb = 2) {
  const r = await fetch(url + '/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'salle', ressource: 'seine', employe, jour: JEUDI, debut, fin, nb }),
  });
  return r.status;
}

test('deux réunions qui se chevauchent autour de 10h sont refusées', async () => {
  await avecServeur(async (url) => {
    assert.equal(await reserverSalle(url, 'e001', '9h30', '10h30'), 201);
    assert.equal(await reserverSalle(url, 'e002', '10h00', '11h00'), 409);
    assert.equal(await reserverSalle(url, 'e003', '9h00', '9h45'), 409);
  });
});

test('deux réunions qui se suivent sont acceptées', async () => {
  await avecServeur(async (url) => {
    assert.equal(await reserverSalle(url, 'e001', '9h30', '10h30'), 201);
    assert.equal(await reserverSalle(url, 'e002', '10h30', '11h30'), 201);
    assert.equal(await reserverSalle(url, 'e003', '8h30', '9h30'), 201);
  });
});
