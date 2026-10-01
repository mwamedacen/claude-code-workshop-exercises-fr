import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../../server/index.js';

// Cartes A et B fusionnées : une salle libérée par la carte A compte comme libre
// pour la suggestion de la carte B.
const JOUR = '2026-10-07';

// « 9h30 » ou « 09:30 » -> 570
function minutes(heure) {
  const m = /^(\d{1,2})[h:](\d{2})$/.exec(String(heure));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

test('« La bonne taille » propose une salle libérée par la carte A', { todo: 'Cartes A et B : retirez ce todo quand les deux cartes sont fusionnées' }, async () => {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant: `${JOUR}T14:15` });
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(s.url + chemin, {
      method: methode,
      headers: corps ? { 'Content-Type': 'application/json' } : {},
      body: corps ? JSON.stringify(corps) : undefined,
    });
    return { statut: r.status, donnees: await r.json() };
  };
  try {
    const plan = (await appel('GET', '/api/plan')).donnees;
    // Pour 3 personnes, la Garonne (8 places) est trop grande : les candidates ont de 3 à 7 places.
    const candidates = plan.salles.filter((x) => x.capacite >= 3 && x.capacite < 8);
    // Une réunion de 14h00 à 15h00 sans arrivée signalée dans chaque candidate : à 14h15, elle est libérée.
    let reservees = 0;
    for (const salle of candidates) {
      const r = await appel('POST', '/api/reservations', { type: 'salle', ressource: salle.id, employe: 'e002', jour: JOUR, debut: '14h00', fin: '15h00', nb: 1 });
      if (r.statut === 201) reservees += 1;
    }
    assert.ok(reservees > 0, 'au moins une candidate porte une réunion libérée (sinon le test ne prouve rien)');
    const reunions = (await appel('GET', `/api/reservations?jour=${JOUR}`)).donnees.filter((x) => x.type === 'salle');
    // Les candidates libres de 14h30 à 15h00, en comptant ou non les réunions libérées.
    const libres = (avecLiberees) => candidates.filter((salle) => !reunions.some((x) =>
      x.ressource === salle.id && (avecLiberees || !x.liberee) && minutes(x.debut) < 15 * 60 && 14 * 60 + 30 < minutes(x.fin)));
    const plusPetite = (salles) => (salles.length ? Math.min(...salles.map((x) => x.capacite)) : null);
    const attendues = libres(false);
    assert.notEqual(plusPetite(attendues), plusPetite(libres(true)), 'compter les réunions libérées changerait la réponse');
    const r = await appel('GET', `/api/bonne-taille?salle=garonne&jour=${JOUR}&debut=14h30&fin=15h00&personnes=3`);
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.tropGrande, true);
    const { suggestion } = r.donnees;
    assert.ok(
      attendues.some((x) => x.id === suggestion?.id && x.capacite === plusPetite(attendues)),
      `${JSON.stringify(suggestion)} au lieu d'une salle libérée de ${plusPetite(attendues)} places`,
    );
  } finally {
    await s.fermer();
  }
});
