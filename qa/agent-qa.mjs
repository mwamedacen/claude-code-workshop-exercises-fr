#!/usr/bin/env node
// npm run qa:programme [-- --tours 30 --budget 4 --parcours 1 --url http://localhost:3000]
// The same recette as qa/commande.mjs, written as a program with the Agent SDK.
// Install once with: npm ci --prefix qa. It uses your Claude Code login.
// It also writes qa/rapport/index.html: the verdict and only the captures that really exist.
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ROOT, SCHEMA, arreter, lireOptions, verifierPrerequis, consigne, conclure } from './commun.mjs';

const RAPPORT = path.join(ROOT, 'qa', 'rapport');

const options = lireOptions();
await verifierPrerequis(options.url);

console.log(`Recette par l'agent qa-visiteur : ${options.tours} tours et ${options.budget} $ au plus.\n`);

let resultat;
try {
  for await (const message of query({
    prompt: consigne(options), // the same prompt as qa/commande.mjs: it delegates to qa-visiteur
    options: {
      cwd: ROOT,
      // No agent: 'qa-visiteur' here: with it, outputFormat returns no structured_output (SDK 0.3.287).
      settingSources: ['project'], // loads .claude/agents/ and .mcp.json from the repo
      allowedTools: ['Agent', 'mcp__playwright__*'],
      permissionMode: 'dontAsk',
      maxTurns: options.tours,
      maxBudgetUsd: options.budget,
      outputFormat: { type: 'json_schema', schema: SCHEMA },
    },
  })) if (message.type === 'result') resultat = message;
} catch (erreur) {
  arreter(`Agent SDK : ${erreur.message}`);
}

const mesure = `${resultat?.num_turns ?? '?'} tours, ${resultat?.total_cost_usd?.toFixed(2) ?? '?'} $`;
if (resultat?.subtype !== 'success') arreter(`Recette interrompue : ${resultat?.subtype ?? 'aucun résultat'} (${mesure}). Relancez avec plus de --tours ou de --budget.`);
if (!resultat.structured_output) arreter(`Pas de verdict structuré dans la réponse (${mesure}).`);
console.log(`Mesure : ${mesure}, ${Math.round(resultat.duration_ms / 1000)} s`);
ecrireRapport(resultat.structured_output);
conclure(resultat.structured_output, options);

// qa/rapport/index.html: the verdict and, per journey, only a capture that really exists under qa/rapport/.
function ecrireRapport(brut) {
  const parcours = (brut.parcours ?? []).map((p) => {
    const statut = p.statut === 'ok' && !String(p.preuve ?? '').trim() ? 'incomplet' : p.statut;
    return { ...p, statut };
  });
  const statuts = parcours.map((p) => p.statut);
  const statut = statuts.includes('echec') ? 'echec' : statuts.length && statuts.every((s) => s === 'ok') ? 'ok' : 'incomplet';
  const lignes = parcours.map((p) => `      <tr>
        <td>${escape(p.nom)}</td>
        <td class="statut ${escape(p.statut)}">${escape(p.statut)}</td>
        <td>${escape(p.preuve)}</td>
        <td>${capture(p.capture)}</td>
      </tr>`).join('\n');
  const page = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light dark">
  <title>Ma Place · rapport de recette</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; background: #fff; }
    h1 { font-size: 1.4rem; }
    .verdict { font-weight: 600; }
    table { border-collapse: collapse; margin-top: 1rem; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 0.7rem; text-align: left; vertical-align: top; }
    th { background: #f3f3f3; }
    .statut.ok { color: #1a7f37; }
    .statut.echec { color: #c22; }
    .statut.incomplet { color: #b26a00; }
    .note { margin-top: 1.5rem; color: #555; font-size: 0.9rem; }
    @media (prefers-color-scheme: dark) {
      body { color: #e6e6e6; background: #16181d; }
      th, td { border-color: #3a3f4a; }
      th { background: #22262e; }
      a { color: #8ab4f8; }
      .statut.ok { color: #4ac26b; }
      .statut.echec { color: #ff7b72; }
      .statut.incomplet { color: #e3b341; }
      .note { color: #a0a6b0; }
    }
  </style>
</head>
<body>
  <h1>Ma Place · rapport de recette</h1>
  <p class="verdict">Verdict : <span class="statut ${escape(statut)}">${escape(statut)}</span> — ${escape(brut.resume)}</p>
  <table>
    <thead>
      <tr><th>Parcours</th><th>Statut</th><th>Preuve observée</th><th>Capture</th></tr>
    </thead>
    <tbody>
${lignes}
    </tbody>
  </table>
  <p class="note">Rapport local : vérifiez chaque observation avant de le partager. Les captures sont celles enregistrées dans qa/rapport/.</p>
</body>
</html>
`;
  fs.mkdirSync(RAPPORT, { recursive: true });
  fs.writeFileSync(path.join(RAPPORT, 'index.html'), page);
}

function escape(valeur) {
  return String(valeur ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Link a capture only if the verdict names one and the file really exists under qa/rapport/.
function capture(valeur) {
  const nom = String(valeur ?? '').trim();
  if (!nom) return 'Aucune capture enregistrée';
  const cible = path.resolve(ROOT, nom);
  if (!cible.startsWith(RAPPORT + path.sep) || !fs.existsSync(cible) || !fs.statSync(cible).isFile()) return 'Aucune capture enregistrée';
  const href = path.relative(RAPPORT, cible).split(path.sep).join('/');
  return `<a href="${escape(href)}">Voir la capture</a>`;
}
