import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../../server/index.js';

// Carte B « Proposer la bonne taille » : une salle est trop grande quand elle a plus du double des places
// nécessaires ; on propose alors la plus petite salle libre qui suffit sur le même créneau, et la salle
// choisie reste réservable.
const MAINTENANT = '2026-10-07T09:05';
const JEUDI = '2026-10-15'; // un jour à venir : la carte A n'y libère aucune réunion

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

const conseil = (appel, salle, personnes, debut, fin) =>
  appel('GET', `/api/bonne-taille?salle=${salle}&jour=${JEUDI}&debut=${debut}&fin=${fin}&personnes=${personnes}`);

// « 9h30 » ou « 09:30 » -> 570
function minutes(heure) {
  const m = /^(\d{1,2})[h:](\d{2})$/.exec(String(heure));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

// Les salles qu'aucune réunion n'occupe sur le créneau, d'après le planning du jour.
async function sallesLibres(appel, debut, fin) {
  const plan = (await appel('GET', '/api/plan')).donnees;
  const reunions = (await appel('GET', `/api/reservations?jour=${JEUDI}`)).donnees.filter((r) => r.type === 'salle');
  const occupee = (salle) =>
    reunions.some((r) => r.ressource === salle.id && minutes(r.debut) < minutes(fin) && minutes(debut) < minutes(r.fin));
  return plan.salles.filter((salle) => !occupee(salle));
}

test('une salle est trop grande au-delà du double des places nécessaires ; la suggestion est la plus petite salle libre qui suffit', { todo: 'Carte B : retirez ce todo quand la carte est réalisée' }, async () => {
  await avecServeur(async (appel) => {
    const plan = (await appel('GET', '/api/plan')).donnees;
    for (const [debut, fin] of [['15h00', '16h00'], ['10h00', '11h00']]) {
      const libres = await sallesLibres(appel, debut, fin);
      for (const salle of plan.salles) {
        for (const personnes of [1, 2, 3, 5]) {
          const cas = `${salle.id} pour ${personnes} personne(s) de ${debut} à ${fin}`;
          const r = await conseil(appel, salle.id, personnes, debut, fin);
          assert.equal(r.statut, 200, cas);
          const tropGrande = salle.capacite > 2 * personnes;
          assert.equal(r.donnees.tropGrande, tropGrande, `${cas} : tropGrande`);
          const candidates = tropGrande ? libres.filter((s) => s.capacite >= personnes && s.capacite < salle.capacite) : [];
          if (candidates.length === 0) {
            assert.equal(r.donnees.suggestion, null, `${cas} : suggestion`);
            continue;
          }
          const plusPetite = Math.min(...candidates.map((s) => s.capacite));
          const { suggestion } = r.donnees;
          const attendue = candidates.find((s) => s.id === suggestion?.id && s.capacite === plusPetite);
          assert.ok(attendue, `${cas} : ${JSON.stringify(suggestion)} au lieu d'une salle libre de ${plusPetite} places`);
          assert.equal(suggestion.name, attendue.name, `${cas} : suggestion.name`);
          assert.equal(suggestion.capacite, attendue.capacite, `${cas} : suggestion.capacite`);
        }
      }
    }
  });
});

test("pas de suggestion quand aucune salle plus petite n'est libre", { todo: 'Carte B : retirez ce todo quand la carte est réalisée' }, async () => {
  await avecServeur(async (appel) => {
    // On occupe de 15h00 à 16h00 toutes les salles de moins de 8 places encore libres.
    const plan = (await appel('GET', '/api/plan')).donnees;
    for (const salle of plan.salles.filter((s) => s.capacite < 8)) {
      await appel('POST', '/api/reservations', { type: 'salle', ressource: salle.id, employe: 'e004', jour: JEUDI, debut: '15h00', fin: '16h00', nb: 1 });
    }
    const petitesLibres = (await sallesLibres(appel, '15h00', '16h00')).filter((s) => s.capacite < 8);
    assert.deepEqual(petitesLibres.map((s) => s.id), [], 'les petites salles sont toutes occupées');
    const r = await conseil(appel, 'garonne', 2, '15h00', '16h00');
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.tropGrande, true);
    assert.equal(r.donnees.suggestion, null);
  });
});

test('la salle choisie reste réservable', { todo: 'Carte B : retirez ce todo quand la carte est réalisée' }, async () => {
  await avecServeur(async (appel) => {
    const r = await conseil(appel, 'garonne', 2, '15h00', '16h00');
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.tropGrande, true);
    const resa = await appel('POST', '/api/reservations', { type: 'salle', ressource: 'garonne', employe: 'e004', jour: JEUDI, debut: '15h00', fin: '16h00', nb: 2 });
    assert.equal(resa.statut, 201, JSON.stringify(resa.donnees));
  });
});

test('une salle inconnue donne 404, un créneau invalide 400', { todo: 'Carte B : retirez ce todo quand la carte est réalisée' }, async () => {
  await avecServeur(async (appel) => {
    assert.equal((await conseil(appel, 'garonne', 2, '15h00', '16h00')).statut, 200);
    assert.equal((await conseil(appel, 'inconnue', 2, '15h00', '16h00')).statut, 404, 'salle inconnue');
    assert.equal((await conseil(appel, 'garonne', 2, '16h00', '15h00')).statut, 400, 'fin avant le début');
    assert.equal((await conseil(appel, 'garonne', 2, 'midi', '16h00')).statut, 400, 'heure illisible');
  });
});
