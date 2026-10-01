import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROTEGER_PLAN = path.join(RACINE, '.claude', 'hooks', 'proteger-plan.mjs');
const VERROU_TESTS = path.join(RACINE, '.claude', 'hooks', 'verrou-tests.mjs');

// Lance le hook comme Claude Code : le JSON de l'événement sur l'entrée standard.
function lancer(hook, entree, env = {}) {
  const r = spawnSync(process.execPath, [hook], {
    input: typeof entree === 'string' ? entree : JSON.stringify(entree),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
  return { code: r.status, erreur: r.stderr };
}

const outil = (tool_name, tool_input) => ({ hook_event_name: 'PreToolUse', cwd: RACINE, tool_name, tool_input });

test('proteger-plan : une modification du style passe', () => {
  const r = lancer(PROTEGER_PLAN, outil('Edit', { file_path: path.join(RACINE, 'web', 'style.css') }));
  assert.equal(r.code, 0, r.erreur);
});

test('proteger-plan : une modification du plan est refusée avec la règle de CLAUDE.md', () => {
  for (const file_path of [
    path.join(RACINE, 'data', 'floor-plan.json'),
    'data/floor-plan.json',
    'C:\\Projets\\ma-place\\Data\\Floor-Plan.json',
  ]) {
    const r = lancer(PROTEGER_PLAN, outil('Write', { file_path, content: '{}' }));
    assert.equal(r.code, 2, file_path);
    assert.match(r.erreur, /appartient aux Services généraux/);
  }
});

test('proteger-plan : une écriture du plan par le shell est refusée', () => {
  for (const [tool, command] of [
    ['Bash', "sed -i 's/Seine/Loire/' data/floor-plan.json"],
    ['Bash', 'echo {} > data/floor-plan.json'],
    ['Bash', "node -e \"require('fs').writeFileSync('data/floor-plan.json', '{}')\""],
    ['PowerShell', "(Get-Content data\\floor-plan.json) -replace 'Seine','Loire' | Set-Content data\\floor-plan.json"],
  ]) {
    const r = lancer(PROTEGER_PLAN, outil(tool, { command }));
    assert.equal(r.code, 2, command);
    assert.match(r.erreur, /Services généraux/);
  }
});

test('proteger-plan : une lecture du plan par le shell passe', () => {
  for (const [tool, command] of [
    ['Bash', 'cat data/floor-plan.json'],
    ['Bash', 'grep -n Seine data/floor-plan.json'],
    ['Bash', 'git diff data/floor-plan.json'],
    ['PowerShell', 'Get-Content data\\floor-plan.json'],
  ]) {
    const r = lancer(PROTEGER_PLAN, outil(tool, { command }));
    assert.equal(r.code, 0, `${command} : ${r.erreur}`);
  }
});

test('proteger-plan : une entrée illisible donne une ligne claire, sans pile', () => {
  const r = lancer(PROTEGER_PLAN, 'pas du JSON');
  assert.equal(r.code, 1);
  assert.equal(r.erreur.trim().split('\n').length, 1);
  assert.doesNotMatch(r.erreur, /at .*\(|Error:/);
});

// Le verrou lance toute la suite : on l'essaie sur un petit projet temporaire, hors de la suite
// normale (sinon il se relancerait lui-même).
function projetTemporaire(tests) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'verrou-'));
  fs.writeFileSync(path.join(dossier, 'package.json'), '{ "type": "module" }\n');
  fs.mkdirSync(path.join(dossier, 'test'));
  fs.writeFileSync(path.join(dossier, 'test', 'exemple.test.js'), `import { test } from 'node:test';\n${tests}\n`);
  return dossier;
}

const arret = { hook_event_name: 'Stop', stop_hook_active: false };

test('verrou-tests : des tests verts laissent terminer', (t) => {
  const dossier = projetTemporaire("test('tout va bien', () => {});");
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));
  const r = lancer(VERROU_TESTS, { ...arret, cwd: dossier }, { CLAUDE_PROJECT_DIR: dossier });
  assert.equal(r.code, 0, r.erreur);
});

test('verrou-tests : un test rouge bloque et donne son nom', (t) => {
  const dossier = projetTemporaire(
    [
      "test('tout va bien', () => {});",
      "test('la salle Seine accepte 8 personnes', () => { throw new Error('6 !== 8'); });",
      "test('carte à venir', { todo: 'pas encore' }, () => { throw new Error('attendu'); });",
    ].join('\n'),
  );
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));
  const r = lancer(VERROU_TESTS, { ...arret, cwd: dossier }, { CLAUDE_PROJECT_DIR: dossier });
  assert.equal(r.code, 2);
  assert.match(r.erreur, /la salle Seine accepte 8 personnes \(test\/exemple\.test\.js\)/);
  assert.doesNotMatch(r.erreur, /tout va bien|carte à venir/);
});

test('verrou-tests : vérifie le repo où travaille Claude, depuis un sous-dossier ou un worktree', (t) => {
  const vert = projetTemporaire("test('tout va bien', () => {});");
  const rouge = projetTemporaire("test('la carte A libère la salle', () => { throw new Error('rouge'); });");
  t.after(() => [vert, rouge].forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  // Un worktree a un fichier .git à sa racine ; Claude a fait cd web.
  fs.writeFileSync(path.join(rouge, '.git'), 'gitdir: ailleurs\n');
  fs.mkdirSync(path.join(rouge, 'web'));
  const r = lancer(VERROU_TESTS, { ...arret, cwd: path.join(rouge, 'web') }, { CLAUDE_PROJECT_DIR: vert });
  assert.equal(r.code, 2);
  assert.match(r.erreur, /la carte A libère la salle/);
});
