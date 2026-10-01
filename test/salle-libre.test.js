import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../server/index.js';
import { enMinutes } from '../server/dates.js';

const AUJOURDHUI = '2026-10-07';

async function avecServeur(maintenant, f) {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant });
  const get = async (chemin) => (await fetch(s.url + chemin)).json();
  const post = async (chemin, corps) =>
    (await fetch(s.url + chemin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    })).status;
  try {
    await f(get, post);
  } finally {
    await s.fermer();
  }
}

test('« Salle libre maintenant » : assez de places, libre pendant une heure, la plus petite d’abord', async () => {
  await avecServeur(`${AUJOURDHUI}T09:05`, async (get) => {
    const plan = await get('/api/plan');
    const reunions = (await get(`/api/reservations?jour=${AUJOURDHUI}`)).filter((r) => r.type === 'salle');
    const debut = 9 * 60 + 5;
    const fin = debut + 60;
    const occupee = (salle) =>
      reunions.some((r) => r.ressource === salle.id && enMinutes(r.debut) < fin && debut < enMinutes(r.fin));
    for (const personnes of [1, 3, 5, 9]) {
      const { salles } = await get(`/api/salles-libres?personnes=${personnes}`);
      for (const s of salles) {
        assert.ok(s.capacite >= personnes, `${s.id} a assez de places`);
        assert.ok(!occupee(s), `${s.id} est libre de 9h05 à 10h05`);
      }
      const attendues = plan.salles.filter((s) => s.capacite >= personnes && !occupee(s)).map((s) => s.id);
      assert.deepEqual(salles.map((s) => s.id).sort(), attendues.sort(), `toutes les salles possibles pour ${personnes}`);
      const capacites = salles.map((s) => s.capacite);
      assert.deepEqual(capacites, [...capacites].sort((a, b) => a - b), 'la plus petite d’abord');
    }
  });
});

test('« Salle libre maintenant » : une réunion qui commence dans 25 minutes rend la salle indisponible', async () => {
  await avecServeur(`${AUJOURDHUI}T09:05`, async (get, post) => {
    const avant = (await get('/api/salles-libres?personnes=1')).salles.map((s) => s.id);
    assert.ok(avant.length > 0, 'au moins une salle libre à 9h05');
    const cible = avant[0];
    assert.equal(
      await post('/api/reservations', { type: 'salle', ressource: cible, employe: 'e002', jour: AUJOURDHUI, debut: '9h30', fin: '10h00', nb: 1 }),
      201,
    );
    const apres = (await get('/api/salles-libres?personnes=1')).salles.map((s) => s.id);
    assert.ok(!apres.includes(cible), `${cible} n’est plus proposée`);
  });
});

test('« Salle libre maintenant » : rien à proposer quand l’étage est fermé', async () => {
  await avecServeur(`${AUJOURDHUI}T20:00`, async (get) => {
    const r = await get('/api/salles-libres?personnes=2');
    assert.deepEqual(r.salles, []);
    assert.match(r.message, /fermé/);
  });
});
