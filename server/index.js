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
import { cleDuJour, ajouterJours, enMinutes, enTexte } from './dates.js';

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

// « AAAA-MM-JJ » -> la même clé, après vérification. Surtout pas toISOString() :
// il passe en UTC et, à Paris, minuit devient la veille à 22h ou 23h.
function jourDepuis(texte) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texte || ''))) return null;
  const [a, m, j] = texte.split('-').map(Number);
  return cleDuJour(new Date(a, m - 1, j));
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

// Carte A : une réunion du jour sans arrivée signalée, commencée depuis au moins
// CONFIG.liberationMinutes et pas encore finie, est libérée : la salle redevient disponible.
function estLiberee(r, ici) {
  if (r.type !== 'salle' || r.arrivee_le || r.jour !== cleDuJour(ici)) return false;
  const minutes = ici.getHours() * 60 + ici.getMinutes();
  return minutes >= enMinutes(r.debut) + CONFIG.liberationMinutes && minutes < enMinutes(r.fin);
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
          lignes.map((r) => ({ ...r, qui: `${r.first_name} ${r.last_name[0]}.`, liberee: estLiberee(r, maintenant()) })),
        );
      }

      if (req.method === 'POST' && p === '/api/reservations') {
        const corps = await lireCorps(req);
        const { type, ressource, employe } = corps;
        if (!['poste', 'salle'].includes(type)) return json(res, 400, { erreur: 'Type de réservation inconnu.' });
        const qui = db.prepare('SELECT id FROM employees WHERE id = ?').get(employe || '');
        if (!qui) return json(res, 400, { erreur: 'Qui êtes-vous ? Choisissez votre nom en haut de la page.' });

        const aujourdhui = cleDuJour(maintenant());
        const jour = corps.jour ? jourDepuis(corps.jour) : aujourdhui;
        if (!jour) return json(res, 400, { erreur: 'Jour invalide.' });
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
        if (nb > salle.capacite) return json(res, 409, { erreur: `Trop de monde pour la salle ${salle.name} (${salle.capacite} places).` });
        const existantes = db
          .prepare("SELECT type, jour, debut, fin, arrivee_le FROM reservations WHERE type = 'salle' AND ressource = ? AND jour = ?")
          .all(ressource, jour)
          .filter((e) => !estLiberee(e, maintenant()));
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

      if (req.method === 'GET' && p === '/api/salles-libres') {
        // « Salle libre maintenant » : les salles libres pendant l'heure qui vient, assez grandes,
        // la plus petite d'abord (pour ne pas bloquer une grande salle pour deux personnes).
        const personnes = Math.max(1, Number(url.searchParams.get('personnes')) || 1);
        const equipement = url.searchParams.get('equipement');
        const ici = maintenant();
        const debut = ici.getHours() * 60 + ici.getMinutes();
        const fin = Math.min(debut + 60, CONFIG.fermeture * 60);
        if (debut < CONFIG.ouverture * 60 || debut >= CONFIG.fermeture * 60) {
          return json(res, 200, { salles: [], message: `L'étage est fermé : il ouvre de ${CONFIG.ouverture}h à ${CONFIG.fermeture}h.` });
        }
        const reunions = db
          .prepare("SELECT type, ressource, jour, debut, fin, arrivee_le FROM reservations WHERE type = 'salle' AND jour = ?")
          .all(cleDuJour(ici))
          .filter((r) => !estLiberee(r, ici));
        const libre = (salle) =>
          !reunions.some((r) => r.ressource === salle.id && enMinutes(r.debut) < fin && debut < enMinutes(r.fin));
        const salles = plan.salles
          .filter((salle) => salle.capacite >= personnes)
          .filter((salle) => !equipement || salle.equipements.includes(equipement))
          .filter(libre)
          .sort((a, b) => a.capacite - b.capacite || a.name.localeCompare(b.name, 'fr'))
          .map(({ id, name, capacite, equipements }) => ({ id, name, capacite, equipements }));
        return json(res, 200, { salles, debut: enTexte(debut), fin: enTexte(fin) });
      }

      if (req.method === 'GET' && p === '/api/mes-reservations') {
        const employe = url.searchParams.get('employe') || '';
        const lignes = db
          .prepare(
            `SELECT id, type, ressource, jour, debut, fin, nb_personnes, arrivee_le
             FROM reservations WHERE employe_id = ? AND jour >= ? ORDER BY jour, id`,
          )
          .all(employe, cleDuJour(maintenant()));
        return json(res, 200, lignes.map((r) => ({ ...r, liberee: estLiberee(r, maintenant()) })));
      }

      const annulation = /^\/api\/mes-reservations\/(\d+)$/.exec(p);
      if (req.method === 'DELETE' && annulation) {
        // La position est celle de la réservation dans MA liste (même ordre que /api/mes-reservations).
        const employe = url.searchParams.get('employe') || '';
        const position = Number(annulation[1]);
        const miennes = db
          .prepare('SELECT id FROM reservations WHERE employe_id = ? AND jour >= ? ORDER BY jour, id')
          .all(employe, cleDuJour(maintenant()));
        const r = miennes[position];
        if (!r) return json(res, 404, { erreur: 'Réservation introuvable.' });
        db.prepare('DELETE FROM reservations WHERE id = ?').run(r.id);
        return json(res, 200, { ok: true });
      }

      const arrivee = /^\/api\/reservations\/(\d+)\/arrivee$/.exec(p);
      if (req.method === 'POST' && arrivee) {
        const corps = await lireCorps(req);
        const r = db
          .prepare('SELECT id, employe_id, type, jour, ressource, debut, fin, arrivee_le FROM reservations WHERE id = ?')
          .get(Number(arrivee[1]));
        if (!r) return json(res, 404, { erreur: 'Réservation introuvable.' });
        if (corps.employe && corps.employe !== r.employe_id) {
          return json(res, 403, { erreur: "Ce n'est pas votre réservation." });
        }
        const ici = maintenant();
        if (r.jour !== cleDuJour(ici)) {
          return json(res, 409, { erreur: "On ne signale son arrivée que le jour de la réservation." });
        }
        if (r.type === 'salle') {
          const minutes = ici.getHours() * 60 + ici.getMinutes();
          if (minutes < enMinutes(r.debut) - 15 || minutes >= enMinutes(r.fin)) {
            return json(res, 409, { erreur: 'On signale son arrivée pendant la réunion, au plus tôt 15 minutes avant.' });
          }
          if (estLiberee(r, ici)) {
            const autres = db.prepare(
              'SELECT type, jour, ressource, debut, fin, arrivee_le FROM reservations WHERE id != ? AND type = ? AND jour = ? AND ressource = ?',
            ).all(r.id, 'salle', r.jour, r.ressource);
            if (autres.some((autre) => chevauche(r, autre) && !estLiberee(autre, ici))) {
              return json(res, 409, { erreur: 'La salle libérée a été réservée par une autre personne.' });
            }
          }
        }
        db.prepare('UPDATE reservations SET arrivee_le = ? WHERE id = ?').run(maintenant().toISOString(), r.id);
        return json(res, 200, { ok: true });
      }

      if (req.method === 'GET' && p === '/api/export.csv') {
        // Pas de données personnelles dans un export (CLAUDE.md) : l'identifiant et l'équipe suffisent.
        const lignes = db
          .prepare(
            `SELECT r.jour, r.type, r.ressource, r.debut, r.fin, r.employe_id, e.team
             FROM reservations r JOIN employees e ON e.id = r.employe_id ORDER BY r.jour, r.id`,
          )
          .all();
        const csv = [
          'jour;type;ressource;debut;fin;employe;equipe',
          ...lignes.map((r) =>
            [r.jour, r.type, r.ressource, r.debut ?? '', r.fin ?? '', r.employe_id, r.team].join(';'),
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
