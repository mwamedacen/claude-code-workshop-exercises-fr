#!/usr/bin/env node
// npm run sabotage              plants a regression for the QA labs (W6, W7): the booking window
//                               (joursMax in server/config.js) drops to 0 days, so nothing can be booked
//                               beyond today. The previous value is kept in .sabotage.json (ignored by Git).
// npm run sabotage -- --annuler puts the remembered value back and deletes .sabotage.json.
//
// The message shown never says what changed: finding it is the QA agent's job.
// A sabotage already in place is never planted twice. If the value was repaired by hand since (the lab's
// normal path), the old .sabotage.json is stale: a new sabotage replaces it, and --annuler leaves the
// repaired value alone.
// « annuler » without dashes works too, and so does a PowerShell that drops the « -- » (npm then hands
// the flag over as npm_config_annuler).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'server', 'config.js');
const MEMO = path.join(ROOT, '.sabotage.json');
const SETTING = /(\bjoursMax\s*:\s*)(\d+)/;
const DEFAULT = 14; // the value the course ships with

function readMemo() {
  try {
    const memo = JSON.parse(fs.readFileSync(MEMO, 'utf8'));
    return Number.isInteger(memo.joursMax) ? memo : null;
  } catch {
    return null;
  }
}

function plant(source, current) {
  if (current === 0) {
    console.log('⚠ Le sabotage est déjà en place.');
    console.log('  Pour revenir en arrière : npm run sabotage -- --annuler');
    return 1;
  }
  // The memo first: if writing the config then fails, nothing is lost.
  fs.writeFileSync(
    MEMO,
    `${JSON.stringify({ fichier: 'server/config.js', joursMax: current, le: new Date().toISOString() }, null, 2)}\n`,
  );
  fs.writeFileSync(CONFIG, source.replace(SETTING, (_, head) => `${head}0`));
  console.log("⚠ Une régression vient d'être introduite quelque part dans l'application. À votre agent de recette de la trouver.");
  console.log('  Pour revenir en arrière : npm run sabotage -- --annuler');
  return 0;
}

function undo(source, current) {
  const exists = fs.existsSync(MEMO);
  const memo = readMemo();
  if (current !== 0) {
    if (exists) fs.rmSync(MEMO, { force: true });
    console.log(
      exists
        ? "✔ Déjà réparé : rien à restaurer, je laisse le code tel qu'il est (.sabotage.json supprimé)."
        : 'Rien à annuler : aucun sabotage en place.',
    );
    return 0;
  }
  const value = memo ? memo.joursMax : DEFAULT;
  fs.writeFileSync(CONFIG, source.replace(SETTING, (_, head) => `${head}${value}`));
  if (exists) fs.rmSync(MEMO, { force: true });
  console.log(
    memo
      ? "✔ Sabotage annulé : l'application est revenue à la normale."
      : "✔ Sabotage annulé : réglage remis à sa valeur d'origine.",
  );
  return 0;
}

function main(argv) {
  const cancel =
    argv.includes('--annuler') ||
    argv.includes('annuler') ||
    ['true', '1'].includes(String(process.env.npm_config_annuler || '').toLowerCase());
  const unknown = argv.filter((a) => !['--annuler', 'annuler'].includes(a));
  if (unknown.length) {
    console.log(`✘ Option inconnue : ${unknown.join(' ')}`);
    console.log('  Usage : npm run sabotage   ou   npm run sabotage -- --annuler');
    return 2;
  }
  let source;
  try {
    source = fs.readFileSync(CONFIG, 'utf8');
  } catch {
    console.log('✘ server/config.js introuvable : lancez la commande à la racine de votre repo Ma Place.');
    return 1;
  }
  const match = SETTING.exec(source);
  if (!match) {
    console.log("✘ server/config.js n'a pas de ligne joursMax : rien n'a été modifié.");
    return 1;
  }
  const current = Number(match[2]);
  return cancel ? undo(source, current) : plant(source, current);
}

function isMain(url) {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
