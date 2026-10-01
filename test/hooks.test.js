import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROTEGER_PLAN = path.join(RACINE, '.claude', 'hooks', 'proteger-plan.mjs');

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
