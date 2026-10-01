#!/usr/bin/env node
// PreToolUse hook (.claude/settings.json, matcher Edit|Write|Bash|PowerShell): data/floor-plan.json
// belongs to facilities, so no tool call may write it.
//
// Input: the hook JSON on stdin (tool_name, tool_input, cwd).
// - Edit / Write: refused when tool_input.file_path designates data/floor-plan.json, relative or
//   absolute, with / or \ separators, in any case (Windows and macOS file systems ignore case).
// - Bash / PowerShell: refused when the command would write that file (redirection, sed -i, tee, mv,
//   cp onto it, rm, Set-Content, Out-File, node -e with a write…); reads go through (cat, type,
//   Get-Content, grep, git diff…). A command naming the plan that is not known to be a read is refused.
// Exit 2 + one French line on stderr: the call is blocked and Claude reads the line.
// Exit 0: allowed. Exit 1 + one French line: unreadable input (Claude Code then lets the call through).
import path from 'node:path';

const REGLE =
  "CLAUDE.md : « `data/floor-plan.json` appartient aux Services généraux : on ne le modifie jamais, on corrige le code. »";

// Commands that only read the files they name.
const LECTURES = new Set([
  'cat', 'type', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'wc', 'jq', 'diff',
  'cmp', 'file', 'stat', 'ls', 'dir', 'findstr', 'get-content', 'gc', 'select-string', 'sls',
  'get-item', 'gi', 'get-childitem', 'gci', 'test-path', 'resolve-path', 'measure-object',
  'convertfrom-json', 'echo', 'write-output', 'write-host',
]);
// Git subcommands that rewrite a file of the working tree (git diff, add, commit… leave it alone).
const GIT_ECRITURES = new Set(['rm', 'mv', 'checkout', 'restore']);
const DEPLACEMENTS = new Set(['rm', 'del', 'erase', 'rmdir', 'rd', 'remove-item', 'ri', 'mv', 'move', 'move-item', 'mi', 'rename-item', 'ren']);
const INTERPRETES = new Set(['node', 'python', 'python3', 'py', 'perl', 'ruby', 'deno', 'bun', 'awk', 'gawk']);
const COPIES = new Set(['cp', 'copy', 'copy-item', 'cpi']);
// Words that start a command without being the command (sudo, env VAR=…, PowerShell's & call operator).
const PREFIXES = new Set(['sudo', 'env', 'command', 'time', 'nohup', 'exec', '&', '.']);
// Inline code that writes, deletes or moves a file.
const ECRITURE =
  /writefile|writesync|write_text|write_bytes|writealltext|appendfile|rename|unlink|rmsync|\brm\(|copyfile|cpsync|truncate|createwritestream|open\([^)]*,\s*['"][wax+]|-i\s*inplace|>\s*["']/;

const normaliser = (p) => p.replaceAll('\\', '/').toLowerCase();

// Does this path or glob designate the plan? Compared folder by folder from the end, so
// « floor-plan.json » (from data/), « data/*.json » and an absolute path all count. With
// dossierEntier, the folder itself counts too (« data », « . », « * »): rm and mv take it whole.
function designeLePlan(mot, dossierEntier = false) {
  const p = normaliser(mot).replace(/^[(\[{@]+|[)\]},;]+$/g, '').replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (!p) return false;
  if (dossierEntier && (p === '.' || p === '*')) return true;
  const egal = (motif, nom) =>
    new RegExp(`^${motif.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')}$`).test(nom);
  const parties = p.split('/');
  const cibles = dossierEntier ? [['data', 'floor-plan.json'], ['data']] : [['data', 'floor-plan.json']];
  return cibles.some((cible) => {
    const n = Math.min(parties.length, cible.length);
    for (let i = 1; i <= n; i++) if (!egal(parties.at(-i), cible.at(-i))) return false;
    return true;
  });
}

// Splits a shell line into commands (on | ; & && || and new lines), each one a list of words.
// Quotes are kept together; redirections become their own words (« > », « >> »).
function decouper(ligne) {
  const commandes = [[]];
  let mot = '';
  let guillemet = null;
  const finirMot = () => {
    if (mot) commandes.at(-1).push(mot);
    mot = '';
  };
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (guillemet) {
      if (c === guillemet) guillemet = null;
      else if (c === '\\' && guillemet === '"' && ligne[i + 1] === '"') mot += ligne[++i];
      else mot += c;
    } else if (c === '"' || c === "'") guillemet = c;
    else if (/\s/.test(c) && c !== '\n') finirMot();
    else if ('|;&\n'.includes(c)) {
      const apresChevron = !mot && ['>', '>>'].includes(commandes.at(-1).at(-1));
      if (c === '&' && (apresChevron || ligne[i + 1] === '>')) mot += c; // 2>&1, &>
      else {
        finirMot();
        commandes.push([]);
      }
    } else if (c === '>') {
      if (/^\d*$/.test(mot) || mot === '*') mot = ''; // 2>, *> (PowerShell)
      finirMot();
      commandes.at(-1).push(ligne[i + 1] === '>' ? (i++, '>>') : '>');
    } else mot += c;
  }
  finirMot();
  return commandes.filter((m) => m.length);
}

function commandeEcrit(mots) {
  const operateur = (m) => m === '>' || m === '>>';
  // A redirection into the plan, whatever the command.
  if (mots.some((m, i) => operateur(m) && designeLePlan(mots[i + 1] || ''))) return true;
  let k = 0;
  while (k < mots.length && (PREFIXES.has(mots[k]) || /^\w+=/.test(mots[k]))) k++;
  const [premier = '', ...args] = mots.slice(k);
  const verbe = normaliser(premier).replace(/^[({@]+/, '').split('/').pop().replace(/\.exe$/, '');
  const visees = args.filter((m) => !operateur(m));
  const texte = normaliser(mots.join(' '));

  if (DEPLACEMENTS.has(verbe)) return visees.some((m) => designeLePlan(m, true));
  if (INTERPRETES.has(verbe) && (verbe.endsWith('awk') || args.some((m) => /^(-e|-p|-c|--eval|--print)$/.test(m)))) {
    const enPlace = verbe === 'perl' && args.some((m) => /^-\w*i/.test(m));
    return texte.includes('floor-plan') && (enPlace || ECRITURE.test(texte));
  }
  // Words that name the plan, including the value of an assignment (p=data/floor-plan.json).
  const nommeLePlan = mots.some((m) => !operateur(m) && designeLePlan(m.slice(m.lastIndexOf('=') + 1)));
  if (!nommeLePlan || LECTURES.has(verbe)) return false;
  if (verbe === 'git') return GIT_ECRITURES.has(normaliser(args.find((m) => !m.startsWith('-')) || ''));
  if (verbe === 'sed') return args.some((m) => /^-[a-z]*i|^--in-place/i.test(m));
  if (COPIES.has(verbe)) {
    const destination = args.findIndex((m) => /^-destination$/i.test(m));
    return designeLePlan((destination >= 0 ? args[destination + 1] : visees.at(-1)) || '');
  }
  return true; // tee, Set-Content, Out-File, touch, dd, a script run on the plan, an assignment…
}

function refuser(message) {
  process.stderr.write(`${message} ${REGLE}\n`);
  process.exit(2);
}

let entree;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  entree = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!entree || typeof entree.tool_name !== 'string') throw new Error();
} catch {
  process.stderr.write("proteger-plan : entrée illisible (JSON du hook attendu sur l'entrée standard).\n");
  process.exit(1);
}

const outil = entree.tool_name;
const params = entree.tool_input || {};
if ((outil === 'Edit' || outil === 'Write') && typeof params.file_path === 'string') {
  const base = entree.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const chemin = path.posix.resolve(normaliser(base), normaliser(params.file_path));
  if (designeLePlan(chemin)) refuser('Modification refusée.');
}
if ((outil === 'Bash' || outil === 'PowerShell') && typeof params.command === 'string') {
  if (decouper(params.command).some(commandeEcrit)) refuser('Commande refusée : elle modifierait data/floor-plan.json.');
}
process.exit(0);
