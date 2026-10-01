import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../../server/index.js';

// Carte C « S'asseoir avec son équipe » : pour le jour choisi, les postes réservés par mes collègues
// d'équipe et un poste libre conseillé, dans la zone de l'équipe quand il en reste un.
const MAINTENANT = '2026-10-07T09:05';
// Plusieurs personnes et plusieurs jours : Camille (e001) a le poste M03 le 13 ;
// le 15, des collègues du marketing sont assis hors de leur zone.
const CAS = [
  ['e001', '2026-10-07'],
  ['e001', '2026-10-13'],
  ['e001', '2026-10-15'],
  ['e002', '2026-10-13'],
  ['e003', '2026-10-15'],
];

async function avecServeur(f) {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant: MAINTENANT });
  const get = async (chemin) => {
    const r = await fetch(s.url + chemin);
    return { statut: r.status, donnees: await r.json() };
  };
  try {
    await f(get);
  } finally {
    await s.fermer();
  }
}

// L'équipe de chaque personne, d'après GET /api/employes.
const equipes = async (get) => Object.fromEntries((await get('/api/employes')).donnees.map((e) => [e.id, e.team]));

test("les présents : les postes réservés ce jour-là par mes collègues d'équipe, moi exclu", async () => {
  await avecServeur(async (get) => {
    const equipe = await equipes(get);
    for (const [employe, jour] of CAS) {
      const cas = `${employe} le ${jour}`;
      const r = await get(`/api/equipe?employe=${employe}&jour=${jour}`);
      assert.equal(r.statut, 200, cas);
      assert.equal(r.donnees.equipe, equipe[employe], `${cas} : equipe`);
      const attendus = (await get(`/api/reservations?jour=${jour}`)).donnees
        .filter((x) => x.type === 'poste' && x.team === equipe[employe] && x.employe_id !== employe)
        .map((x) => x.ressource);
      assert.deepEqual(r.donnees.presents.map((p) => p.poste).sort(), attendus.sort(), `${cas} : presents`);
      for (const p of r.donnees.presents) {
        assert.ok(typeof p.qui === 'string' && p.qui.trim() !== '', `${cas} : qui au poste ${p.poste}`);
      }
    }
  });
});

test("le poste conseillé est libre, dans la zone de l'équipe quand il en reste un", async () => {
  await avecServeur(async (get) => {
    const equipe = await equipes(get);
    const plan = (await get('/api/plan')).donnees;
    for (const [employe, jour] of CAS) {
      const cas = `${employe} le ${jour}`;
      const { conseil } = (await get(`/api/equipe?employe=${employe}&jour=${jour}`)).donnees;
      const reservations = (await get(`/api/reservations?jour=${jour}`)).donnees;
      const pris = new Set(reservations.filter((x) => x.type === 'poste').map((x) => x.ressource));
      const poste = plan.postes.find((p) => p.id === conseil);
      assert.ok(poste, `${cas} : conseil ${JSON.stringify(conseil)} n'est pas un poste du plan`);
      assert.ok(!pris.has(poste.id), `${cas} : ${poste.id} est déjà réservé`);
      if (plan.postes.some((p) => p.zone === equipe[employe] && !pris.has(p.id))) {
        assert.equal(poste.zone, equipe[employe], `${cas} : ${poste.id} est hors de la zone de l'équipe`);
      }
    }
  });
});

test('une personne inconnue donne 404', async () => {
  await avecServeur(async (get) => {
    assert.equal((await get('/api/equipe?employe=e001&jour=2026-10-07')).statut, 200);
    assert.equal((await get('/api/equipe?employe=e999&jour=2026-10-07')).statut, 404);
  });
});
