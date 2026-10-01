#!/usr/bin/env node
// npm run qa:programme [-- --tours 30 --budget 4 --parcours 1 --url http://localhost:3000]
// The same recette as qa/commande.mjs, written as a program with the Agent SDK.
// Install once with: npm ci --prefix qa. It uses your Claude Code login.
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ROOT, SCHEMA, arreter, lireOptions, verifierPrerequis, consigne, conclure } from './commun.mjs';

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
conclure(resultat.structured_output, options);
