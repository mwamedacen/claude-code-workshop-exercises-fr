#!/usr/bin/env node
// Checkpoints (« points de reprise ») of the Ma Place workshop: move the repository to the start of any
// lab without ever losing work.
//
//   npm run checkpoint -- list     the checkpoints in course order; ✔ marks the tags this repository has
//   npm run checkpoint -- <name>   1. saves the work in progress (tracked and untracked files, never the
//                                     ignored ones) in a commit on a new branch sauvegarde-<YYYYMMDD-HHMM>;
//                                  2. starts a new branch travail-<name> at the tag <name>.
//
// A tag missing here (a repository created with « Use this template » has none) is fetched from origin,
// then from the course repository. Nothing is ever deleted, reset, forced or pushed. Git is called with
// argument arrays, never through a shell, so this file runs as is on macOS, Linux and Windows
// (Git Bash or PowerShell).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The course repository: where the tags come from when this repository lacks them.
// MA_PLACE_COURSE_REPO replaces it (the trainer-side tests point it at a local repository).
export const COURSE_REPO = process.env.MA_PLACE_COURSE_REPO || 'https://github.com/mwamedacen/claude-code-training-fr.git';

// The original Day 1 tags remain available for existing copies. New template copies use
// additive French-guide tags so no public tag or branch history needs to be rewritten.
const FRENCH_DAY1 = new Set(['w1-depart', 'w2-depart', 'w2-correctif', 'w3-depart', 'w3-regles', 'w3-fonction', 'w4-depart', 'w4-analyses']);
export const courseTag = (name) => FRENCH_DAY1.has(name) ? `fr-${name}` : name;

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Course order, and what each checkpoint holds (design of 2026-10-01, « Checkpoints »).
// Descriptions say what you see, never how a fault was caused.
export const POINTS = [
  { name: 'w1-depart', description: "W1 · départ : l'application, sans ses quatre boutons" },
  { name: 'w2-depart', description: 'W2 · départ : les quatre boutons fonctionnent' },
  { name: 'w2-correctif', description: 'W2 · Playwright pour le projet, la double réservation de salle corrigée avec son test' },
  { name: 'w3-depart', description: 'W3 · départ : les cinq défauts du bug bash corrigés' },
  { name: 'w3-regles', description: 'W3 · les règles du projet dans CLAUDE.md, un export sans données personnelles' },
  { name: 'w3-fonction', description: 'W3 · la fonction « Salle libre maintenant »' },
  { name: 'w4-depart', description: 'W4 · départ : le nouveau look et la skill charte' },
  { name: 'w4-analyses', description: 'W4 · le subagent, la skill de données, le notebook, le piège corrigé' },
  { name: 'w5-depart', description: "W5 · départ : le kit du jour 2 (cartes A à D et leurs tests en attente, l'agent de recette à brancher, worktree.baseRef)" },
  { name: 'w5-fusion', description: 'W5 · trois briefs et trois branches de cartes prêtes à fusionner' },
  { name: 'w6-depart', description: 'W6 · départ : cartes A, B, C fusionnées, test A×B actif' },
  { name: 'w6-commande', description: "W6 · trois parcours et l'agent qa-visiteur" },
  { name: 'w7-depart', description: 'W7 · départ : le programme Agent SDK et sa page de rapport' },
  { name: 'w7-mur', description: 'W7 · le hook PreToolUse qui protège le plan' },
  { name: 'w8-depart', description: 'W8 · départ : le verrou Stop, les deux hooks commités' },
  { name: 'final', description: "Fin · la carte D, l'export vers l'agenda" },
];

// W5: the three card branches, created next to travail-w5-fusion from their tags.
const CARDS = [
  { branch: 'carte-a', tag: 'w5-carte-a' },
  { branch: 'carte-b', tag: 'w5-carte-b' },
  { branch: 'carte-c', tag: 'w5-carte-c' },
];

// Used for the backup commit only when Git has no identity configured.
const FALLBACK_IDENTITY = [
  ['user.name', 'Participant'],
  ['user.email', 'participant@ma-place.example'],
];

// A fetch must fail rather than wait for a password nobody will type.
const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

// Operations that leave the repository half-way; switching branches then would mix things up.
const IN_PROGRESS = [
  { file: 'MERGE_HEAD', what: 'Une fusion (merge)', it: 'la', next: 'git merge --continue', abort: 'git merge --abort' },
  { file: 'rebase-merge', what: 'Un rebase', it: 'le', next: 'git rebase --continue', abort: 'git rebase --abort' },
  { file: 'rebase-apply', what: 'Un rebase', it: 'le', next: 'git rebase --continue', abort: 'git rebase --abort' },
  { file: 'CHERRY_PICK_HEAD', what: 'Un cherry-pick', it: 'le', next: 'git cherry-pick --continue', abort: 'git cherry-pick --abort' },
  { file: 'REVERT_HEAD', what: 'Un revert', it: 'le', next: 'git revert --continue', abort: 'git revert --abort' },
];

// ---------------------------------------------------------------------------
// Git helpers (also used by tools/check.mjs)
// ---------------------------------------------------------------------------

export function git(args, { cwd = ROOT, env, timeout = 60_000 } = {}) {
  const r = spawnSync('git', args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  if (r.error) {
    return { code: null, out: '', err: r.error.message, missing: r.error.code === 'ENOENT' };
  }
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

export function samePath(a, b) {
  const norm = (p) => {
    let r = path.resolve(p);
    try {
      r = fs.realpathSync.native(r);
    } catch {
      /* keep the resolved path */
    }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

// Where this folder stands: 'missing' (no git command), 'none' (not in a repository), 'nested' (inside
// another repository, e.g. the course sources: the tools then refuse to commit) or 'root'.
export function repoState() {
  const r = git(['rev-parse', '--show-toplevel']);
  if (r.missing) return { state: 'missing' };
  if (r.code !== 0) return { state: 'none' };
  return { state: samePath(r.out, ROOT) ? 'root' : 'nested', top: r.out };
}

const refExists = (ref) => git(['show-ref', '--verify', '--quiet', ref]).code === 0;
export const tagExists = (tag) => refExists(`refs/tags/${tag}`);
export const branchExists = (branch) => refExists(`refs/heads/${branch}`);

// name -> commit, for every tag (annotated tags peeled to their commit).
export function localTags() {
  const r = git(['for-each-ref', '--format=%(refname:strip=2) %(objectname) %(*objectname)', 'refs/tags']);
  const tags = new Map();
  if (r.code !== 0) return tags;
  for (const line of r.out.split('\n').filter(Boolean)) {
    const [name, object, peeled] = line.split(' ');
    tags.set(name, peeled || object);
  }
  return tags;
}

function isDirty() {
  // --untracked-files=all: a status.showUntrackedFiles=no setting must not hide new files from the backup.
  return git(['status', '--porcelain', '--untracked-files=all']).out !== '';
}

function uniqueBranch(base) {
  if (!branchExists(base)) return base;
  for (let i = 2; ; i++) if (!branchExists(`${base}-${i}`)) return `${base}-${i}`;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const firstLine = (text) => (text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

// Fetches the tags when some are missing: origin first, then the course repository.
// Returns the names still missing.
function ensureTags(names) {
  let missing = names.filter((n) => !tagExists(n));
  if (missing.length === 0) return missing;
  const sources = [];
  if (git(['remote', 'get-url', 'origin']).code === 0) sources.push(['origin', 'origin']);
  sources.push(['le repo du cours', COURSE_REPO]);
  for (const [label, source] of sources) {
    console.log(`… Récupération des points de reprise depuis ${label}`);
    const r = git(['fetch', '--quiet', source, 'refs/tags/*:refs/tags/*'], { env: NO_PROMPT, timeout: 180_000 });
    missing = names.filter((n) => !tagExists(n));
    if (missing.length === 0) return missing;
    if (r.code !== 0) console.log(`  ⚠ Échec : ${firstLine(r.err) || 'pas de réponse'}`);
  }
  return missing;
}

// Commits everything in progress on a new branch sauvegarde-<date>, created at HEAD.
function save(name) {
  const branch = uniqueBranch(`sauvegarde-${stamp()}`);
  let r = git(['switch', '-c', branch]);
  if (r.code !== 0) return { error: firstLine(r.err) || 'git switch a échoué' };
  r = git(['add', '-A']);
  if (r.code !== 0) return { branch, error: firstLine(r.err) || 'git add a échoué' };
  const identity = [];
  for (const [key, value] of FALLBACK_IDENTITY) {
    if (!git(['config', '--get', key]).out) identity.push('-c', `${key}=${value}`);
  }
  // A backup must never be blocked by a commit hook or a signing setup.
  r = git([
    '-c', 'commit.gpgsign=false', ...identity,
    'commit', '--no-verify', '--quiet', '-m', `Sauvegarde avant le point de reprise ${name}`,
  ]);
  if (r.code !== 0 && isDirty()) return { branch, error: firstLine(r.err || r.out) || 'git commit a échoué' };
  return { branch };
}

function explainRepo(repo) {
  if (repo.state === 'missing') {
    console.log('✘ Git est introuvable : installez-le (voir le README), puis relancez la commande.');
  } else if (repo.state === 'none') {
    console.log("✘ Ce dossier n'est pas un repo Git : ouvrez le dossier de votre repo Ma Place (celui créé avec git clone).");
  } else {
    console.log(`✘ Ce dossier fait partie d'un autre repo Git (${repo.top}) : je ne touche à rien.`);
    console.log('  Lancez la commande à la racine de votre repo Ma Place.');
  }
}

function goTo(name) {
  if (!/^[A-Za-z0-9][\w.-]*$/.test(name)) {
    console.log(`✘ « ${name} » n'est pas un nom de point de reprise. La liste : npm run checkpoint -- list`);
    return 2;
  }
  const repo = repoState();
  if (repo.state !== 'root') {
    explainRepo(repo);
    return 1;
  }
  if (!POINTS.some((p) => p.name === name) && !tagExists(name)) {
    console.log(`✘ Point de reprise inconnu : ${name}. La liste : npm run checkpoint -- list`);
    return 2;
  }
  const op = IN_PROGRESS.find((o) => {
    const p = git(['rev-parse', '--git-path', o.file]);
    return p.code === 0 && fs.existsSync(path.resolve(ROOT, p.out));
  });
  if (op) {
    console.log(`✘ ${op.what} est en cours : terminez-${op.it} (${op.next}) ou annulez-${op.it} (${op.abort}),`);
    console.log("  puis relancez la commande. Rien n'a été modifié.");
    return 1;
  }

  const wanted = name === 'w5-fusion' ? [name, ...CARDS.map((c) => c.tag)] : [courseTag(name)];
  if (ensureTags(wanted).includes(courseTag(name))) {
    console.log(`✘ Impossible de récupérer le point de reprise ${name} : vérifiez votre connexion, puis relancez.`);
    console.log("  Rien n'a été modifié.");
    return 1;
  }

  // 1. Save the work in progress, if any.
  let saved = null;
  if (isDirty()) {
    const s = save(name);
    if (s.error) {
      console.log(`✘ La sauvegarde a échoué : ${s.error}`);
      console.log(
        s.branch
          ? `  Vos fichiers sont intacts, sur la branche ${s.branch}. Je m'arrête là.`
          : "  Vos fichiers sont intacts. Rien n'a été modifié.",
      );
      return 1;
    }
    saved = s.branch;
  }

  // 2. A new working branch at the checkpoint.
  const work = uniqueBranch(`travail-${name}`);
  const r = git(['switch', '-c', work, `refs/tags/${courseTag(name)}^{commit}`]);
  if (r.code !== 0) {
    console.log(`✘ Impossible de passer au point de reprise ${name} : ${firstLine(r.err) || 'git switch a échoué'}`);
    if (saved) console.log(`  Votre travail est sauvegardé sur la branche ${saved}.`);
    console.log("  Fermez les programmes qui utilisent les fichiers du repo, puis relancez la commande.");
    return 1;
  }

  // 3. W5: the card branches, ready to merge.
  const cards = { created: [], kept: [] };
  if (name === 'w5-fusion') {
    for (const c of CARDS) {
      if (!tagExists(c.tag)) continue;
      if (branchExists(c.branch)) cards.kept.push(c.branch);
      else if (git(['branch', c.branch, `refs/tags/${c.tag}^{commit}`]).code === 0) cards.created.push(c.branch);
    }
  }

  // 4. What happened, and what to do next.
  if (saved) {
    console.log(`✔ Votre travail en cours est sauvegardé sur la branche ${saved}.`);
    console.log(`  Pour le retrouver : git switch ${saved}`);
  } else {
    console.log('✔ Rien à sauvegarder : aucun changement en cours.');
  }
  console.log(`✔ Vous êtes au point de reprise ${name}, sur la nouvelle branche ${work}.`);
  if (cards.created.length) console.log(`✔ Branches des cartes créées : ${cards.created.join(', ')}`);
  if (cards.kept.length) console.log(`  (déjà présentes, laissées telles quelles : ${cards.kept.join(', ')})`);
  console.log('');
  if (name === 'w5-fusion') {
    console.log('Et maintenant : fusionnez carte-a, carte-b puis carte-c (par exemple : git merge carte-a),');
    console.log("puis relancez l'application : npm start");
  } else {
    console.log("Et maintenant : arrêtez l'application si elle tourne (Ctrl+C), puis relancez-la : npm start");
  }
  return 0;
}

function list() {
  const repo = repoState();
  const tags = repo.state === 'root' ? localTags() : null;
  const head = tags ? git(['rev-parse', 'HEAD']).out : null;
  const width = Math.max(...POINTS.map((p) => p.name.length));
  console.log("Points de reprise de l'atelier Ma Place, dans l'ordre du cours :");
  console.log('');
  for (const p of POINTS) {
    const commit = tags?.get(courseTag(p.name));
    const mark = !tags ? '•' : commit ? '✔' : '○';
    const here = commit && commit === head ? '   ← vous êtes ici' : '';
    console.log(`${mark} ${p.name.padEnd(width)}  ${p.description}${here}`);
  }
  console.log('');
  if (tags) console.log('✔ déjà dans votre repo    ○ récupéré au besoin depuis le repo du cours');
  else explainRepo(repo);
  console.log("Pour y aller : npm run checkpoint -- <nom>   (votre travail en cours est d'abord sauvegardé)");
  return 0;
}

function usage() {
  console.log('Usage :');
  console.log('  npm run checkpoint -- list     les points de reprise du cours');
  console.log("  npm run checkpoint -- <nom>    sauvegarde votre travail, puis vous place au point de reprise <nom>");
}

function main(argv) {
  const [command] = argv;
  if (!command || ['-h', '--help', 'help', 'aide'].includes(command)) {
    usage();
    return command ? 0 : 2;
  }
  if (command === 'list' || command === 'liste') return list();
  return goTo(command);
}

function isMain(url) {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
