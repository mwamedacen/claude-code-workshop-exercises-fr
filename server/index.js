// Ma Place — serveur HTTP, sans aucune dépendance.
// NB : ce fichier a grossi au fil des demandes ; il faudrait le découper un jour.
import './tz.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ouvrirBase, jourDeReference } from './db.js';
import { CONFIG } from './config.js';
import { cleDuJour, ajouterJours, enMinutes } from './dates.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const WEB = path.join(RACINE, 'web');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function lireArguments(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--db') opts.db = argv[++i];
    else if (a === '--maintenant') opts.maintenant = argv[++i];
  }
  return opts;
}

function brancheGit() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: RACINE,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// Encore une façon de calculer une date (voir aussi dates.js et web/app.js).
function jourDepuis(texte) {
  const [a, m, j] = texte.split('-').map(Number);
  const d = new Date(a, m - 1, j);
  return d.toISOString().slice(0, 10);
}

// Met une heure au format maison « 9h30 » (accepte aussi « 09:30 »).
function normaliserHeure(h) {
  const m = /^(\d{1,2})[h:](\d{2})$/.exec(String(h || '').trim());
  if (!m) return null;
  return `${Number(m[1])}h${m[2]}`;
}

function chevauche(a, b) {
  // Deux créneaux se chevauchent si l'un commence avant la fin de l'autre.
  // On compare des minutes : comparer les textes « 9h30 » et « 10h00 » donnait un faux résultat.
  return enMinutes(a.debut) < enMinutes(b.fin) && enMinutes(b.debut) < enMinutes(a.fin);
}

function json(res, statut, donnees) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(donnees));
}

function lireCorps(req) {
  return new Promise((ok, ko) => {
    let texte = '';
    req.on('data', (morceau) => {
      texte += morceau;
      if (texte.length > 100000) ko(new Error('corps trop gros'));
    });
    req.on('end', () => {
      try {
        ok(texte ? JSON.parse(texte) : {});
      } catch {
        ok({});
      }
    });
    req.on('error', ko);
  });
}

function servirFichier(res, chemin) {
  const cible = path.normalize(path.join(WEB, chemin === '/' ? 'index.html' : chemin));
  if (!cible.startsWith(WEB) || !fs.existsSync(cible) || fs.statSync(cible).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Page introuvable');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(cible)] || 'application/octet-stream' });
  fs.createReadStream(cible).pipe(res);
}

function ecouter(serveur, port) {
  const essayer = (p, restants) =>
    new Promise((ok, ko) => {
      serveur.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && restants > 0) ok(essayer(p + 1, restants - 1));
        else ko(err);
      });
      serveur.listen(p, () => ok(serveur.address().port));
    });
  if (Number.isInteger(port)) return essayer(port, 0);
  return essayer(3000, 20);
}

export async function demarrer(options = {}) {
  const plan = JSON.parse(fs.readFileSync(path.join(RACINE, 'data', 'floor-plan.json'), 'utf8'));
  const decalage = options.maintenant ? new Date(options.maintenant).getTime() - Date.now() : 0;
  const maintenant = () => new Date(Date.now() + decalage);
  const db = ouvrirBase(options.db || path.join(RACINE, 'data', 'ma-place.db'), maintenant(), RACINE);
  const branche = brancheGit();

  const serveur = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      if (req.method === 'GET' && p === '/api/info') {
        return json(res, 200, {
          branche,
          maintenant: maintenant().toISOString(),
          simule: decalage !== 0,
          aujourdhui: cleDuJour(maintenant()),
          reference: cleDuJour(jourDeReference(maintenant())),
        });
      }

      if (req.method === 'GET' && p === '/api/plan') return json(res, 200, plan);

      if (req.method === 'GET' && p === '/api/employes') {
        const lignes = db
          .prepare('SELECT id, first_name, last_name, team FROM employees WHERE persona = 1 ORDER BY id')
          .all();
        return json(res, 200, lignes);
      }

      if (req.method === 'GET' && p === '/api/reservations') {
        const jour = url.searchParams.get('jour') || cleDuJour(maintenant());
        const lignes = db
          .prepare(
            `SELECT r.id, r.type, r.ressource, r.jour, r.debut, r.fin, r.nb_personnes, r.employe_id,
                    r.arrivee_le, e.first_name, e.last_name, e.team
             FROM reservations r JOIN employees e ON e.id = r.employe_id
             WHERE r.jour = ? ORDER BY r.ressource, r.id`,
          )
          .all(jour);
        return json(
          res,
          200,
          lignes.map((r) => ({ ...r, qui: `${r.first_name} ${r.last_name[0]}.` })),
        );
      }

      if (req.method === 'POST' && p === '/api/reservations') {
        const corps = await lireCorps(req);
        const { type, ressource, employe } = corps;
        if (!['poste', 'salle'].includes(type)) return json(res, 400, { erreur: 'Type de réservation inconnu.' });
        const qui = db.prepare('SELECT id FROM employees WHERE id = ?').get(employe || '');
        if (!qui) return json(res, 400, { erreur: 'Qui êtes-vous ? Choisissez votre nom en haut de la page.' });

        const aujourdhui = cleDuJour(maintenant());
        // optimisation : pour aujourd'hui, pas besoin de recalculer la date
        const jour = !corps.jour || corps.jour === aujourdhui ? aujourdhui : jourDepuis(corps.jour);
        const limite = cleDuJour(ajouterJours(maintenant(), CONFIG.joursMax));
        if (jour < aujourdhui || jour > limite) {
          return json(res, 400, { erreur: `On peut réserver d'aujourd'hui à J+${CONFIG.joursMax}.` });
        }

        if (type === 'poste') {
          const poste = plan.postes.find((x) => x.id === ressource);
          if (!poste) return json(res, 404, { erreur: 'Poste inconnu.' });
          const pris = db
            .prepare("SELECT id FROM reservations WHERE type = 'poste' AND ressource = ? AND jour = ?")
            .get(ressource, jour);
          if (pris) return json(res, 409, { erreur: 'Ce poste est déjà réservé ce jour-là.' });
          const dejaUnPoste = db
            .prepare("SELECT id FROM reservations WHERE type = 'poste' AND employe_id = ? AND jour = ?")
            .get(employe, jour);
          if (dejaUnPoste) return json(res, 409, { erreur: 'Vous avez déjà un poste ce jour-là.' });
          const r = db
            .prepare('INSERT INTO reservations (type, ressource, employe_id, jour, cree_le) VALUES (?, ?, ?, ?, ?)')
            .run('poste', ressource, employe, jour, maintenant().toISOString());
          return json(res, 201, { id: Number(r.lastInsertRowid) });
        }

        const salle = plan.salles.find((x) => x.id === ressource);
        if (!salle) return json(res, 404, { erreur: 'Salle inconnue.' });
        const debut = normaliserHeure(corps.debut);
        const fin = normaliserHeure(corps.fin);
        if (!debut || !fin || enMinutes(debut) >= enMinutes(fin)) {
          return json(res, 400, { erreur: 'Créneau invalide.' });
        }
        if (enMinutes(debut) < 8 * 60 || enMinutes(fin) > 19 * 60) {
          return json(res, 400, { erreur: "L'étage est ouvert de 8h à 19h." });
        }
        const nb = Number(corps.nb || 1);
        if (nb > salle.places) return json(res, 409, { erreur: `Trop de monde pour la salle ${salle.name}.` });
        const existantes = db
          .prepare("SELECT debut, fin FROM reservations WHERE type = 'salle' AND ressource = ? AND jour = ?")
          .all(ressource, jour);
        if (existantes.some((e) => chevauche({ debut, fin }, e))) {
          return json(res, 409, { erreur: 'La salle est déjà prise sur ce créneau.' });
        }
        const r = db
          .prepare(
            `INSERT INTO reservations (type, ressource, employe_id, jour, debut, fin, nb_personnes, cree_le)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('salle', ressource, employe, jour, debut, fin, nb, maintenant().toISOString());
        return json(res, 201, { id: Number(r.lastInsertRowid) });
      }

      if (req.method === 'GET' && p === '/api/mes-reservations') {
        const employe = url.searchParams.get('employe') || '';
        const lignes = db
          .prepare(
            `SELECT id, type, ressource, jour, debut, fin, nb_personnes, arrivee_le
             FROM reservations WHERE employe_id = ? AND jour >= ? ORDER BY jour, id`,
          )
          .all(employe, cleDuJour(maintenant()));
        return json(res, 200, lignes);
      }

      const annulation = /^\/api\/mes-reservations\/(\d+)$/.exec(p);
      if (req.method === 'DELETE' && annulation) {
        const position = Number(annulation[1]);
        const toutes = db.prepare('SELECT id FROM reservations ORDER BY id').all();
        const r = toutes[position];
        if (!r) return json(res, 404, { erreur: 'Réservation introuvable.' });
        db.prepare('DELETE FROM reservations WHERE id = ?').run(r.id);
        return json(res, 200, { ok: true });
      }

      const arrivee = /^\/api\/reservations\/(\d+)\/arrivee$/.exec(p);
      if (req.method === 'POST' && arrivee) {
        const r = db.prepare('SELECT id FROM reservations WHERE id = ?').get(Number(arrivee[1]));
        if (!r) return json(res, 404, { erreur: 'Réservation introuvable.' });
        db.prepare('UPDATE reservations SET arrivee_le = ? WHERE id = ?').run(maintenant().toISOString(), r.id);
        return json(res, 200, { ok: true });
      }

      if (req.method === 'GET' && p === '/api/export.csv') {
        const lignes = db
          .prepare(
            `SELECT r.jour, r.type, r.ressource, r.debut, r.fin, e.first_name, e.last_name, e.email
             FROM reservations r JOIN employees e ON e.id = r.employe_id ORDER BY r.jour, r.id`,
          )
          .all();
        const csv = [
          'jour;type;ressource;debut;fin;prenom;nom;email',
          ...lignes.map((r) =>
            [r.jour, r.type, r.ressource, r.debut ?? '', r.fin ?? '', r.first_name, r.last_name, r.email].join(';'),
          ),
        ].join('\n');
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
        return res.end(csv);
      }

      if (p.startsWith('/api/')) return json(res, 404, { erreur: 'Route inconnue.' });
      if (req.method === 'GET') return servirFichier(res, p);
      return json(res, 405, { erreur: 'Méthode non prise en charge.' });
    } catch (err) {
      console.error(err);
      return json(res, 500, { erreur: 'Erreur interne.' });
    }
  });

  const port = await ecouter(serveur, options.port);
  return {
    url: `http://localhost:${port}`,
    port,
    fermer: () =>
      new Promise((ok) => {
        serveur.closeAllConnections?.();
        serveur.close(() => {
          db.close();
          ok();
        });
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = lireArguments(process.argv.slice(2));
  const { url } = await demarrer(opts);
  console.log(`Ma Place est prête : ${url}`);
  if (opts.maintenant) console.log(`(horloge simulée à partir de ${opts.maintenant})`);
}
