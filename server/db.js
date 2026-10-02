import './tz.js';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cleDuJour, lundiDe, ajouterJours } from './dates.js';

// Ouvre la base SQLite (la crée et la remplit au premier lancement).
export function ouvrirBase(chemin, maintenant, racine) {
  if (chemin !== ':memory:') fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const db = new DatabaseSync(chemin);
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      team TEXT NOT NULL,
      email TEXT NOT NULL,
      persona INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,          -- 'poste' ou 'salle'
      ressource TEXT NOT NULL,     -- id du poste ou de la salle
      employe_id TEXT NOT NULL,
      jour TEXT NOT NULL,          -- AAAA-MM-JJ
      debut TEXT,                  -- '9h30' (salles)
      fin TEXT,                    -- '10h30' (salles)
      nb_personnes INTEGER,
      cree_le TEXT NOT NULL,
      arrivee_le TEXT
    );
  `);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM employees').get();
  if (n === 0) remplir(db, maintenant, racine);
  return db;
}

// --- remplissage de démonstration ---

function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function enTexte(minutes) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

// Jour de référence : aujourd'hui, ou le lundi suivant si on est le week-end.
export function jourDeReference(maintenant) {
  const j = maintenant.getDay();
  if (j === 6) return ajouterJours(maintenant, 2);
  if (j === 0) return ajouterJours(maintenant, 1);
  return new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
}

function remplir(db, maintenant, racine) {
  const employes = JSON.parse(fs.readFileSync(path.join(racine, 'data', 'employees.json'), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(racine, 'data', 'floor-plan.json'), 'utf8'));

  const ajoutEmploye = db.prepare(
    'INSERT INTO employees (id, first_name, last_name, team, email, persona) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const e of employes) {
    ajoutEmploye.run(e.id, e.first_name, e.last_name, e.team, e.email, e.persona ? 1 : 0);
  }

  const reference = jourDeReference(maintenant);
  const lundi = lundiDe(reference);
  const jours = [];
  for (let i = 0; i < 12; i++) {
    const d = ajouterJours(lundi, i);
    if (d.getDay() !== 0 && d.getDay() !== 6) jours.push(d);
  }
  const cleReference = cleDuJour(reference);
  // Le jour de référence d'abord : les premières réservations de la base sont celles du jour.
  jours.sort((a, b) => (cleDuJour(a) === cleReference ? -1 : cleDuJour(b) === cleReference ? 1 : a - b));

  const rand = hasard(Number(cleDuJour(lundi).replaceAll('-', '')));
  const mardiProchain = cleDuJour(ajouterJours(lundi, 8));
  const mercrediProchain = cleDuJour(ajouterJours(lundi, 9));
  const jeudiProchain = cleDuJour(ajouterJours(lundi, 10));
  const scenarios = [mercrediProchain, jeudiProchain];

  // Ressources gardées libres pour les scénarios des fiches.
  const reserve = (type, ressource, jour) =>
    (type === 'poste' && ressource === 'T07' && scenarios.includes(jour)) ||
    (type === 'poste' && ['M03', 'T02'].includes(ressource) && jour === mardiProchain) ||
    (type === 'salle' && ['seine', 'bulle-1'].includes(ressource) && scenarios.includes(jour)) ||
    (type === 'salle' && ressource === 'loire' && jour === jeudiProchain);

  const personas = employes.filter((e) => e.persona).map((e) => e.id);
  const autres = employes.filter((e) => !e.persona);
  const parEquipe = {};
  for (const e of autres) (parEquipe[e.team] ||= []).push(e.id);

  const ajout = db.prepare(`INSERT INTO reservations
    (type, ressource, employe_id, jour, debut, fin, nb_personnes, cree_le, arrivee_le)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const taux = { 1: 0.45, 2: 0.85, 3: 0.7, 4: 0.85, 5: 0.3 };
  const cleMaintenant = cleDuJour(reference);

  for (const d of jours) {
    const jour = cleDuJour(d);
    const passe = jour < cleMaintenant;
    const occupes = new Set();
    const creeLe = ajouterJours(d, -2).toISOString();
    for (const poste of plan.postes) {
      if (reserve('poste', poste.id, jour)) continue;
      if (rand() > taux[d.getDay()]) continue;
      const equipe = rand() < 0.8 ? poste.zone : ['finance', 'rh', 'tech', 'marketing'][Math.floor(rand() * 4)];
      const candidats = (parEquipe[equipe] || []).filter((id) => !occupes.has(id));
      if (candidats.length === 0) continue;
      const qui = candidats[Math.floor(rand() * candidats.length)];
      occupes.add(qui);
      const arrivee = passe && rand() < 0.75 ? `${jour}T0${8 + Math.floor(rand() * 2)}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00` : null;
      ajout.run('poste', poste.id, qui, jour, null, null, null, creeLe, arrivee);
    }
    for (const salle of plan.salles) {
      if (reserve('salle', salle.id, jour)) continue;
      let t = 8 * 60 + 30 * Math.floor(rand() * 6); // première réunion entre 8h00 et 10h30
      const nb = 1 + Math.floor(rand() * 3); // de 1 à 3 réunions par jour
      for (let k = 0; k < nb && t < 18 * 60; k++) {
        const duree = 30 * (1 + Math.floor(rand() * 4));
        const fin = Math.min(t + duree, 19 * 60);
        const qui = autres[Math.floor(rand() * autres.length)].id;
        const personnes = Math.max(1, Math.min(salle.capacite, 1 + Math.floor(rand() * salle.capacite)));
        const arrivee = passe && rand() < 0.65 ? `${jour}T${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00` : null;
        ajout.run('salle', salle.id, qui, jour, enTexte(t), enTexte(fin), personnes, creeLe, arrivee);
        t = fin + 30 * (1 + Math.floor(rand() * 3));
      }
    }
  }

  // Les personas ont déjà quelques réservations à venir.
  const [camille, hugo, lea] = personas;
  const ici = maintenant.toISOString();
  ajout.run('poste', 'M03', camille, mardiProchain, null, null, null, ici, null);
  ajout.run('salle', 'loire', camille, jeudiProchain, '14h00', '15h00', 4, ici, null);
  ajout.run('poste', 'T02', hugo, mardiProchain, null, null, null, ici, null);
  ajout.run('salle', 'loire', lea, jeudiProchain, '10h00', '11h00', 3, ici, null);
}
