#!/usr/bin/env node
// npm run qa:commande [-- --tours 30 --budget 4 --parcours 1 --url http://localhost:3000]
// One bounded `claude -p` run that returns a verdict in qa/verdict.schema.json.
// The prompt delegates to the subagent: with --agent, --json-schema returns no structured_output (CLI 2.1.287).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, SCHEMA, arreter, lireOptions, verifierPrerequis, consigne, conclure } from './commun.mjs';

const options = lireOptions();
await verifierPrerequis(options.url);

const args = [
  '-p', consigne(options), // the prompt right after -p: --allowedTools takes every value that follows it
  '--output-format', 'json',
  '--json-schema', JSON.stringify(SCHEMA),
  '--max-turns', String(options.tours),
  '--max-budget-usd', String(options.budget),
  '--allowedTools', 'Agent', 'mcp__playwright__*',
  '--permission-mode', 'dontAsk',
];
const affiche = args.map((a) => (a.startsWith('{') ? '<contenu de qa/verdict.schema.json>' : /[\s*"]/.test(a) ? JSON.stringify(a) : a));
console.log(`$ claude ${affiche.join(' ')}`);
console.log('(commande abrégée : remplacez <contenu de qa/verdict.schema.json> par le JSON du fichier.)\n');

const run = spawnSync(trouverClaude(), args, {
  cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 20 * 1024 * 1024, timeout: 20 * 60 * 1000,
});
if (run.error) arreter(`claude n'a pas pu être lancé : ${run.error.message}`);

let envelope;
try { envelope = JSON.parse(run.stdout); } catch { arreter(`Réponse illisible (pas du JSON) : ${String(run.stdout).trim().slice(0, 300)}`); }
const mesure = `${envelope.num_turns ?? '?'} tours, ${envelope.total_cost_usd?.toFixed(2) ?? '?'} $`;
if (envelope.is_error || envelope.subtype !== 'success') arreter(`Recette interrompue : ${envelope.subtype} (${mesure}). Relancez avec plus de --tours ou de --budget.`);
if (!envelope.structured_output) arreter(`Pas de verdict structuré dans la réponse (${mesure}).`);
console.log(`Mesure : ${mesure}, ${Math.round(envelope.duration_ms / 1000)} s`);
conclure(envelope.structured_output, options);

// Windows: spawn without a shell runs claude.exe, never the npm shim claude.cmd.
function trouverClaude() {
  if (process.platform !== 'win32') return 'claude';
  const dossiers = (process.env.PATH || '').split(path.delimiter);
  const exe = dossiers.map((d) => path.join(d, 'claude.exe')).find((f) => fs.existsSync(f));
  if (exe) return exe;
  if (dossiers.some((d) => fs.existsSync(path.join(d, 'claude.cmd')))) arreter('Seul le raccourci npm claude.cmd est installé : lancez « claude install » pour installer la version native, puis relancez.');
  return 'claude.exe';
}
