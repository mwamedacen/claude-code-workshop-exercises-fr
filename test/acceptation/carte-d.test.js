import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { demarrer } from '../../server/index.js';

// Carte D « Ajouter à mon agenda » : un fichier iCalendar pour sa propre réservation, avec la bonne date,
// le bon créneau et le nom de la salle ou du poste ; aucune donnée d'un collègue n'y apparaît.
const MAINTENANT = '2026-10-07T09:05';
const PERSONNES = JSON.parse(fs.readFileSync(new URL('../../data/employees.json', import.meta.url), 'utf8'));

async function avecServeur(f) {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant: MAINTENANT });
  try {
    await f((chemin) => fetch(s.url + chemin));
  } finally {
    await s.fermer();
  }
}

// Les réservations de démonstration de Camille (e001) : le poste M03 mardi 13 octobre,
// la salle Loire jeudi 15 octobre de 14h00 à 15h00.
async function reservationsDeCamille(get) {
  const miennes = await (await get('/api/mes-reservations?employe=e001')).json();
  const poste = miennes.find((r) => r.ressource === 'M03' && r.jour === '2026-10-13');
  const salle = miennes.find((r) => r.ressource === 'loire' && r.jour === '2026-10-15');
  assert.ok(poste && salle, 'les réservations de démonstration de Camille');
  return { poste, salle };
}

// Un fichier iCalendar : lignes dépliées (une ligne longue continue après un saut de ligne suivi d'un espace),
// puis les propriétés de chaque VEVENT, sans ses sous-composants (VALARM…).
function lireAgenda(ics) {
  const lignes = ics.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const evenements = [];
  let profondeur = 0;
  for (const ligne of lignes) {
    const m = /^([A-Za-z0-9-]+)([^:]*):(.*)$/.exec(ligne);
    if (!m) continue;
    const [, nom, params, valeur] = m;
    const NOM = nom.toUpperCase();
    if (NOM === 'BEGIN' && profondeur > 0) profondeur += 1;
    else if (NOM === 'BEGIN' && valeur.toUpperCase() === 'VEVENT') {
      evenements.push({});
      profondeur = 1;
    } else if (NOM === 'END' && profondeur > 0) profondeur -= 1;
    else if (profondeur === 1) evenements.at(-1)[NOM] = { params, valeur };
  }
  return { texte: lignes.join('\n'), evenements };
}

async function telecharger(get, id, employe) {
  const r = await get(`/api/reservations/${id}/agenda.ics?employe=${employe}`);
  return { statut: r.status, type: r.headers.get('content-type') || '', ...lireAgenda(await r.text()) };
}

// Un agenda valide qui contient un seul événement ; on renvoie cet événement.
function unSeulEvenement(fichier) {
  assert.equal(fichier.statut, 200);
  assert.match(fichier.type, /^text\/calendar/i, 'Content-Type');
  assert.match(fichier.texte, /^BEGIN:VCALENDAR$/im);
  assert.match(fichier.texte, /^END:VCALENDAR$/im);
  assert.equal(fichier.evenements.length, 1, 'un seul VEVENT');
  return fichier.evenements[0];
}

// Une heure de Paris (TZID=Europe/Paris) ou la même heure en UTC (suffixe Z).
const aLHeure = (propriete, paris, utc) =>
  Boolean(propriete) &&
  (propriete.valeur === utc || (propriete.valeur === paris && /;TZID="?Europe\/Paris"?(;|$)/i.test(propriete.params)));

const nomme = (evenement, nom) =>
  [evenement.SUMMARY, evenement.LOCATION].some((p) => p && p.valeur.toLowerCase().includes(nom.toLowerCase()));

// Aucune donnée d'un collègue : ni « Prénom Nom », ni « Prénom N. », ni e-mail.
function sansCollegue(texte, moi) {
  const bas = texte.toLowerCase();
  for (const p of PERSONNES.filter((x) => x.id !== moi)) {
    for (const trace of [`${p.first_name} ${p.last_name}`, `${p.first_name} ${p.last_name[0]}.`, p.email]) {
      assert.ok(!bas.includes(trace.toLowerCase()), `donnée d'un collègue dans le fichier : ${trace}`);
    }
  }
}

test("ma réunion : l'événement a la bonne date, le bon créneau et le nom de la salle", async () => {
  await avecServeur(async (get) => {
    const { salle } = await reservationsDeCamille(get);
    const fichier = await telecharger(get, salle.id, 'e001');
    const evenement = unSeulEvenement(fichier);
    // Jeudi 15 octobre 2026 de 14h00 à 15h00 à Paris (heure d'été, UTC+2), soit de 12h00 à 13h00 UTC.
    assert.ok(aLHeure(evenement.DTSTART, '20261015T140000', '20261015T120000Z'), `DTSTART ${JSON.stringify(evenement.DTSTART)}`);
    assert.ok(aLHeure(evenement.DTEND, '20261015T150000', '20261015T130000Z'), `DTEND ${JSON.stringify(evenement.DTEND)}`);
    assert.ok(nomme(evenement, 'Loire'), 'la salle Loire dans SUMMARY ou LOCATION');
    sansCollegue(fichier.texte, 'e001');
  });
});

test("mon poste : l'événement occupe toute la journée et porte le nom du poste", async () => {
  await avecServeur(async (get) => {
    const { poste } = await reservationsDeCamille(get);
    const fichier = await telecharger(get, poste.id, 'e001');
    const evenement = unSeulEvenement(fichier);
    const debut = evenement.DTSTART;
    assert.ok(debut?.valeur === '20261013' && /;VALUE=DATE(;|$)/i.test(debut.params), `DTSTART ${JSON.stringify(debut)}`);
    assert.ok(nomme(evenement, 'M03'), 'le poste M03 dans SUMMARY ou LOCATION');
    sansCollegue(fichier.texte, 'e001');
  });
});

test("la réservation d'une autre personne est refusée", async () => {
  await avecServeur(async (get) => {
    const { poste, salle } = await reservationsDeCamille(get);
    // Léa (e003) a aussi une réunion dans la salle Loire le 15 octobre.
    for (const r of [poste, salle]) {
      assert.equal((await get(`/api/reservations/${r.id}/agenda.ics?employe=e003`)).status, 403, `${r.ressource} pour e003`);
    }
  });
});

test('une réservation inconnue donne 404', async () => {
  await avecServeur(async (get) => {
    const { salle } = await reservationsDeCamille(get);
    assert.equal((await get(`/api/reservations/${salle.id}/agenda.ics?employe=e001`)).status, 200);
    assert.equal((await get('/api/reservations/999999/agenda.ics?employe=e001')).status, 404);
  });
});
