// Shared by qa/commande.mjs and qa/agent-qa.mjs: options, preconditions, verdict and exit code.
// Exit codes: 0 every journey ok, 1 one journey echec or incomplet, 2 the run itself failed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa', 'verdict.schema.json'), 'utf8'));

export function arreter(message) {
  console.error(`✘ ${message}`);
  process.exit(2);
}

// --tours 40 or --tours=40 after « -- »; npm_config_tours when the shell drops « -- » and writes --tours=40.
function option(nom, defaut) {
  const argv = process.argv.slice(2);
  const i = argv.findIndex((a) => a === `--${nom}` || a.startsWith(`--${nom}=`));
  if (i >= 0) return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
  const npm = process.env[`npm_config_${nom}`];
  if (npm === 'true') arreter(`Votre terminal a retiré le « -- » : écrivez --${nom}=valeur, avec le signe =.`);
  return npm ?? defaut;
}

export function lireOptions() {
  const tours = Number(option('tours', 30));
  const budget = Number(option('budget', 4));
  const parcours = option('parcours');
  const url = option('url', 'http://localhost:3000');
  if (!Number.isInteger(tours) || tours < 1) arreter('--tours attend un nombre entier positif.');
  if (!(budget > 0)) arreter('--budget attend un montant positif en dollars.');
  if (parcours !== undefined && !['1', '2', '3'].includes(String(parcours))) arreter('--parcours attend 1, 2 ou 3.');
  return { tours, budget, parcours, url };
}

export async function verifierPrerequis(url) {
  if (!fs.existsSync(path.join(ROOT, 'qa', 'parcours.md'))) arreter("Écrivez d'abord qa/parcours.md : étape 1 de l'atelier 6.");
  if (!fs.existsSync(path.join(ROOT, '.claude', 'agents', 'qa-visiteur.md'))) arreter("Créez d'abord l'agent qa-visiteur : étape 2.");
  const autreAdresse = "Si npm start affiche une autre adresse, ajoutez -- --url <adresse>.";
  let info;
  try {
    const reponse = await fetch(new URL('/api/info', url), { signal: AbortSignal.timeout(3000) });
    info = await reponse.json().catch(() => null);
  } catch {
    arreter(`Ma Place ne répond pas sur ${url}. Lancez l'application : npm start -- --maintenant 2026-10-07T14:15. ${autreAdresse}`);
  }
  if (!info) arreter(`${url} ne répond pas comme Ma Place. ${autreAdresse}`);
  // Another checkout's app (a W5 worktree, for example) may hold the port: compare the branches.
  const branche = brancheLocale();
  if (info.branche && branche && info.branche !== branche) {
    arreter(`L'application de ${url} tourne sur la branche ${info.branche}, ce repo est sur ${branche}. Relancez npm start ici. ${autreAdresse}`);
  }
}

function brancheLocale() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

export function consigne({ parcours, url }) {
  const quoi = parcours ? `le parcours ${parcours} de qa/parcours.md` : 'les trois parcours de qa/parcours.md';
  return `Délègue ${quoi} au sous-agent qa-visiteur. Il teste Ma Place, déjà lancée sur ${url}, avec Playwright et ne corrige rien. ` +
    'À son retour, rends le verdict dans le schéma JSON : une preuve observée par parcours ; outil ou serveur indisponible = incomplet ; ' +
    'régression observée = echec ; jamais ok sans preuve.';
}

// Checks the shape, turns an « ok » without evidence into « incomplet », writes qa/verdict.json, prints, exits.
export function conclure(verdict, { parcours }) {
  const attendus = parcours ? 1 : 3;
  if (!verdict || !Array.isArray(verdict.parcours)) arreter('Verdict structuré absent.');
  if (verdict.parcours.length !== attendus) arreter(`Verdict incomplet : ${attendus} parcours attendus, ${verdict.parcours.length} reçus.`);
  for (const p of verdict.parcours) if (p.statut === 'ok' && !String(p.preuve ?? '').trim()) p.statut = 'incomplet';
  const statuts = verdict.parcours.map((p) => p.statut);
  verdict.statut = statuts.includes('echec') ? 'echec' : statuts.every((s) => s === 'ok') ? 'ok' : 'incomplet';
  fs.writeFileSync(path.join(ROOT, 'qa', 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  console.log(`Recette : ${verdict.statut}. ${verdict.resume}`);
  for (const p of verdict.parcours) console.log(`  ${p.statut} · ${p.nom} : ${p.preuve}`);
  console.log('Verdict enregistré dans qa/verdict.json');
  process.exit(verdict.statut === 'ok' ? 0 : 1);
}
