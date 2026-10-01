#!/usr/bin/env node
// Stop hook (.claude/settings.json): Claude may end its turn only when the test suite passes.
//
// Runs the same tests as `npm test` (node --test at the project root), through process.execPath and
// an argument array: no npm, no shell, so it behaves the same on Windows, macOS and Linux.
// Exit 0: green. Exit 2: the failing tests, by name, on stderr in French; Claude reads them and keeps
// working (Claude Code stops honouring the block after eight in a row). The run is capped in time.
// The project is the repo around the hook input's cwd: in a worktree (claude --worktree), that cwd follows
// Claude while CLAUDE_PROJECT_DIR may name the main checkout. Without input (run by hand:
// node .claude/hooks/verrou-tests.mjs), CLAUDE_PROJECT_DIR or the current folder.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let entree = {};
if (!process.stdin.isTTY) {
  try {
    entree = JSON.parse(fs.readFileSync(0, 'utf8')) || {};
  } catch {
    entree = {};
  }
}

// The nearest folder holding .git (a folder in the main checkout, a file in a worktree): a cd into
// web/ or qa/ must not shrink the test run. Null outside a repo.
function racineDuRepo(depart) {
  for (let dossier = path.resolve(depart); ; dossier = path.dirname(dossier)) {
    if (fs.existsSync(path.join(dossier, '.git'))) return dossier;
    if (path.dirname(dossier) === dossier) return null;
  }
}

const depart = typeof entree.cwd === 'string' && entree.cwd ? entree.cwd : null;
// Real path: the test runner reports file locations with symbolic links resolved (macOS /var → /private/var).
const RACINE = fs.realpathSync(
  (depart && racineDuRepo(depart)) || process.env.CLAUDE_PROJECT_DIR || depart || process.cwd(),
);
const LIMITE_S = 120;

// A test runner started from inside another one would report to its parent: start clean.
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

const r = spawnSync(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap'],
  { cwd: RACINE, env, encoding: 'utf8', timeout: LIMITE_S * 1000, maxBuffer: 64 * 1024 * 1024 },
);

if (r.error || r.signal) {
  const raison = r.error?.code === 'ETIMEDOUT' || r.signal ? `n'ont pas fini en ${LIMITE_S} s` : 'ne se lancent pas';
  process.stderr.write(`Les tests ${raison} : impossible de vérifier que tout passe. Lancez npm test et corrigez avant de terminer.\n`);
  process.exit(2);
}
if (r.status === 0) process.exit(0);

// Failing tests from the TAP report: leaves only (a parent that fails because of its children is
// skipped), todo tests left out, file shown relative to the project.
const echecs = [];
const lignes = r.stdout.split('\n');
for (let i = 0; i < lignes.length; i++) {
  const m = /^(\s*)not ok \d+ - (.*)$/.exec(lignes[i]);
  if (!m || /\s#\s*TODO\b/.test(m[2])) continue;
  let parent = false;
  let lieu = '';
  for (let j = i + 1; j < lignes.length && lignes[j].startsWith(`${m[1]}  `); j++) {
    const ligne = lignes[j].trim();
    if (ligne === '...') break;
    if (ligne === "failureType: 'subtestsFailed'") parent = true;
    const l = /^location: '(.*):\d+:\d+'$/.exec(ligne);
    if (l) lieu = path.relative(RACINE, l[1]).replaceAll('\\', '/');
  }
  if (!parent) echecs.push(`- ${m[2].replace(/\s#\s*SKIP\b.*$/, '').replaceAll('\\#', '#')}${lieu ? ` (${lieu})` : ''}`);
}

process.stderr.write(
  [
    'Vous ne pouvez pas terminer : des tests échouent. Corrigez le code sans changer les assertions, relancez npm test, puis terminez.',
    ...(echecs.length ? echecs : ['- (noms introuvables : lancez npm test pour le détail)']),
  ].join('\n') + '\n',
);
process.exit(2);
