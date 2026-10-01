#!/usr/bin/env node
// Checks of the Ma Place workshop.
//   npm run check -- setup          is this computer ready for the course? (one line per tool)
//   npm run check -- <checkpoint>   has my repository reached this checkpoint? (the tick-list items a
//                                   machine can check: files, the app's answers through its API, the tests)
//   npm run check -- list           the checkpoints that have checks
// Exit code 0 when every mandatory check passes. Processes are started with argument arrays, never
// through a shell string, so this file runs as is on macOS, Linux and Windows (Git Bash or PowerShell).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { POINTS, git, repoState } from './checkpoint.mjs';
import { findPython, venvPython, missingModules, MODULES } from './setup-python.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The simulated clock of every API check, the same as in test/api.test.js:
// Wednesday 7 October 2026, 9h05 in Paris. Next week's Tuesday is the 13th, Thursday the 15th.
const NOW = '2026-10-07T09:05';
const DAY = { monday: '2026-10-05', today: '2026-10-07', nextTuesday: '2026-10-13', nextThursday: '2026-10-15' };

const MARK = { ok: '✔', warn: '⚠', fail: '✘' };

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

const children = new Set();

function stopAll() {
  for (const child of children) killTree(child);
}

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      // cmd.exe would not pass a kill on to npx & co: stop the whole tree.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
      setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 2000).unref();
    }
  } catch {
    /* already gone */
  }
}

// The file a command name runs, looked up in PATH (with PATHEXT on Windows), or null.
function which(command) {
  const win = process.platform === 'win32';
  const exts = win && !path.extname(command) ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const raw of (process.env.PATH || '').split(path.delimiter)) {
    const dir = raw.replace(/^"(.*)"$/, '$1');
    if (!dir) continue;
    for (const ext of exts) {
      const file = path.join(dir, command + ext);
      try {
        if (!fs.statSync(file).isFile()) continue;
        if (!win) fs.accessSync(file, fs.constants.X_OK);
        return file;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

// Runs a command and collects its output. Never rejects: { code, stdout, stderr, missing, timedOut }.
// quiet: the output is discarded unread (used for `gh auth status`, whose output names the account).
function run(command, args, { cwd = ROOT, timeout = 30_000, env = process.env, quiet = false } = {}) {
  return new Promise((resolve) => {
    let file = command;
    let argv = args;
    const options = { cwd, env, windowsHide: true, stdio: quiet ? 'ignore' : ['ignore', 'pipe', 'pipe'] };
    if (process.platform === 'win32' && !path.isAbsolute(command)) {
      file = which(command);
      if (!file) return resolve({ code: null, stdout: '', stderr: '', missing: true });
      if (/\.(cmd|bat)$/i.test(file)) {
        // Since Node 18.20.2 / 20.12.2 a .cmd or .bat file (npx, an npm-installed claude) cannot be started
        // without a shell. Go through cmd.exe the way Node's own shell option does, with constant arguments.
        if (!args.every((a) => /^[\w@.:/=+-]+$/.test(a))) {
          return resolve({ code: null, stdout: '', stderr: `argument refusé : ${args.join(' ')}` });
        }
        argv = ['/d', '/s', '/c', `""${file}" ${args.join(' ')}"`];
        file = process.env.ComSpec || 'cmd.exe';
        options.windowsVerbatimArguments = true;
      }
    }
    let child;
    try {
      child = spawn(file, argv, options);
    } catch (err) {
      return resolve({ code: null, stdout: '', stderr: err.message, missing: err.code === 'ENOENT' });
    }
    children.add(child);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let done = false;
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeout);
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      children.delete(child);
      resolve({ stdout, stderr, timedOut, ...result });
    };
    child.on('error', (err) => finish({ code: null, missing: err.code === 'ENOENT', stderr: stderr + err.message }));
    child.on('close', (code) => finish({ code }));
  });
}

// npx through the running Node when possible (no .cmd file to start on Windows).
function npxCli() {
  const options = [];
  const npm = process.env.npm_execpath; // set by `npm run`
  if (npm && /npm-cli\.js$/.test(npm)) options.push(path.join(path.dirname(npm), 'npx-cli.js'));
  const dir = path.dirname(process.execPath);
  options.push(path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js')); // Windows installer layout
  options.push(path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js')); // macOS, Linux layout
  return options.find((p) => fs.existsSync(p)) || null;
}

function npx(args, options) {
  const cli = npxCli();
  return cli ? run(process.execPath, [cli, ...args], options) : run('npx', args, options);
}

const lastLine = (text) => (text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() || '';

function versionOf(text) {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text || '');
  return m ? { text: m[0], major: Number(m[1]), minor: Number(m[2]) } : null;
}

// ---------------------------------------------------------------------------
// npm run check -- setup
// Each check returns { status: 'ok' | 'warn' | 'fail', text }; only 'fail' changes the exit code.
// ---------------------------------------------------------------------------

const ok = (text) => ({ status: 'ok', text });
const warn = (text) => ({ status: 'warn', text });
const fail = (text) => ({ status: 'fail', text });

const NO_NETWORK = /ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|network request/i;
const CERTIFICATE = /SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|CERT_HAS_EXPIRED|certificate/i;

async function checkNode() {
  const version = process.versions.node;
  const [major, minor] = version.split('.').map(Number);
  let sqlite = true;
  try {
    await import('node:sqlite');
  } catch {
    sqlite = false;
  }
  if (major < 22 || (major === 22 && minor < 13)) {
    return fail(`Node.js ${version} : il faut Node.js 22.13 ou plus récent (voir le README)`);
  }
  if (!sqlite) return fail(`Node.js ${version} : le module node:sqlite ne se charge pas, installez Node.js 22.13 ou plus récent`);
  return ok(`Node.js ${version}, avec node:sqlite`);
}

async function checkGit() {
  const r = await run('git', ['--version']);
  const v = versionOf(r.stdout);
  if (r.code !== 0 || !v) return fail('Git introuvable : installez-le (voir le README)');
  if (v.major < 2 || (v.major === 2 && v.minor < 23)) return fail(`Git ${v.text} : il faut Git 2.23 ou plus récent`);
  const repo = repoState();
  if (repo.state === 'none') return fail(`Git ${v.text}, mais ce dossier n'est pas un repo Git : clonez votre repo (git clone)`);
  if (repo.state === 'nested') return warn(`Git ${v.text} ; ce dossier est à l'intérieur d'un autre repo (${repo.top}) : ouvrez plutôt votre repo Ma Place`);
  return ok(`Git ${v.text}, dans votre repo`);
}

async function checkGh() {
  const v = await run('gh', ['--version']);
  if (v.code !== 0) return fail('GitHub CLI (gh) introuvable : installez-le (voir le README)');
  // Only the exit code counts: the output of `gh auth status` names the account and is never read.
  const auth = await run('gh', ['auth', 'status', '--hostname', 'github.com'], { quiet: true });
  if (auth.code === 0) return ok('gh est connecté à GitHub');
  if (auth.timedOut) return warn("gh ne répond pas (connexion ?) : relancez la vérification une fois connecté");
  return fail("gh n'est pas connecté à GitHub : lancez gh auth login");
}

function browsers() {
  const found = [];
  const add = (name, files) => {
    if (files.some((f) => f && fs.existsSync(f))) found.push(name);
  };
  if (process.platform === 'darwin') {
    const apps = ['/Applications', path.join(os.homedir(), 'Applications')];
    add('Google Chrome', apps.map((d) => path.join(d, 'Google Chrome.app')));
    add('Microsoft Edge', apps.map((d) => path.join(d, 'Microsoft Edge.app')));
  } else if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
    add('Google Chrome', roots.map((d) => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')));
    add('Microsoft Edge', roots.map((d) => path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')));
  } else {
    if (['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].some(which)) found.push('Google Chrome ou Chromium');
    if (['microsoft-edge', 'microsoft-edge-stable'].some(which)) found.push('Microsoft Edge');
  }
  return found;
}

async function checkBrowser() {
  const found = browsers();
  if (found.length === 0) return fail('Ni Google Chrome ni Microsoft Edge trouvé : installez Chrome (voir le README)');
  if (found[0] === 'Microsoft Edge') return ok('Navigateur : Microsoft Edge (pour Playwright, ajoutez --browser msedge)');
  return ok(`Navigateur : ${found.join(', ')}`);
}

async function checkPlaywright() {
  const r = await npx(['-y', '@playwright/mcp@latest', '--version'], { timeout: 90_000 });
  const v = versionOf(r.stdout);
  if (r.code === 0) return ok(`Playwright MCP prêt${v ? ` (${v.text})` : ''}`);
  if (r.timedOut) return warn('Playwright MCP : pas de réponse en 90 s (connexion lente ?), relancez la vérification plus tard');
  if (r.missing) return fail('npx introuvable : réinstallez Node.js (voir le README)');
  const output = `${r.stderr}\n${r.stdout}`;
  if (CERTIFICATE.test(output)) return fail("Playwright MCP : téléchargement bloqué par un certificat (proxy d'entreprise ?), voir le README");
  if (NO_NETWORK.test(output)) return warn('Playwright MCP : téléchargement impossible (hors ligne ?), relancez la vérification une fois connecté');
  return fail(`Playwright MCP ne démarre pas : ${lastLine(r.stderr) || `code ${r.code}`}`);
}

async function checkPython() {
  const { python, tooOld } = findPython();
  if (!python) {
    return tooOld.length
      ? fail(`Python ${tooOld[0].version} trouvé (${tooOld[0].label}) : il faut Python 3.10 ou plus récent`)
      : fail('Python 3.10 ou plus récent introuvable (python3, python, py -3) : installez-le (voir le README)');
  }
  const base = `Python ${python.version} (${python.label})`;
  const inVenv = venvPython();
  if (!inVenv) return warn(`${base} ; environnement de l'atelier absent : lancez npm run python`);
  const missing = missingModules(inVenv);
  if (missing.length) return warn(`${base} ; paquets manquants dans .venv (${missing.join(', ')}) : lancez npm run python`);
  return ok(`${base}, .venv prêt (${MODULES.join(', ')})`);
}

async function checkVsCode() {
  if (which('code')) return ok('VS Code : commande code disponible');
  const app = ['/Applications', path.join(os.homedir(), 'Applications')].some((d) => fs.existsSync(path.join(d, 'Visual Studio Code.app')));
  if (process.platform === 'darwin' && app) {
    return warn("VS Code est installé, mais la commande code n'est pas dans le PATH (facultatif ; palette : « Shell Command: Install 'code' command in PATH »)");
  }
  return warn('VS Code : commande code introuvable (facultatif)');
}

async function checkClaude() {
  const r = await run('claude', ['--version']);
  if (r.missing) return fail('Claude Code introuvable (commande claude) : installez-le (voir le README)');
  if (r.code !== 0) return fail(`claude --version échoue : ${lastLine(r.stderr) || `code ${r.code}`}`);
  const v = versionOf(r.stdout);
  return ok(`Claude Code ${v ? v.text : lastLine(r.stdout)}`);
}

// In this order; the slow one (a first Playwright download) last.
const SETUP = [checkNode, checkGit, checkGh, checkBrowser, checkPython, checkVsCode, checkClaude, checkPlaywright];

async function runSetup() {
  console.log("Vérification de votre poste pour l'atelier Ma Place (jusqu'à 2 minutes la première fois)");
  console.log('');
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const check of SETUP) {
    let result;
    try {
      result = await check();
    } catch (err) {
      result = fail(`vérification impossible : ${err.message}`);
    }
    counts[result.status]++;
    console.log(`${MARK[result.status]} ${result.text}`);
  }
  console.log('');
  if (counts.fail) {
    console.log(`✘ ${counts.fail} point(s) à régler avant l'atelier : voir les lignes ✘ (le README explique chaque installation).`);
    return 1;
  }
  console.log(`✔ Votre poste est prêt pour l'atelier.${counts.warn ? ` (${counts.warn} remarque(s) ⚠, non bloquante(s))` : ''}`);
  return 0;
}

// ---------------------------------------------------------------------------
// npm run check -- <checkpoint>: the context given to every check
// ---------------------------------------------------------------------------

function listFiles(dir, exts) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, exts));
    else if (!exts || exts.includes(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out.sort();
}

let startFailure = null; // once the app fails to start, the next API checks say so at once

// Starts the participant's app as `npm start` would, on a free port, with a fresh database in a
// temporary folder and the simulated clock. Resolves once it prints « … est prête : http://… ».
async function startApp({ now = NOW } = {}) {
  if (startFailure) throw new Error(startFailure);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-place-check-'));
  const child = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', path.join('server', 'index.js'), '--port', '0', '--db', path.join(dir, 'check.db'), '--maintenant', now],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  children.add(child);
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const gone = new Promise((resolve) => child.once('close', resolve));
      child.kill();
      await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 3000).unref())]);
    }
    children.delete(child);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    const url = await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => reject(new Error("l'application ne dit pas « est prête » en 20 s")), 20_000);
      child.stdout.on('data', (d) => {
        stdout += d;
        const m = /est prête\s*:\s*(https?:\/\/\S+)/.exec(stdout);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      child.stderr.on('data', (d) => (stderr += d));
      child.on('close', (code) => {
        clearTimeout(timer);
        const why = stderr.split(/\r?\n/).map((l) => l.trim()).find((l) => /Error|Erreur/.test(l)) || lastLine(stderr);
        reject(new Error(`l'application ne démarre pas (code ${code})${why ? ` : ${why}` : ''}`));
      });
    });
    const api = async (method, route, body) => {
      const r = await fetch(url + route, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      const text = await r.text();
      let data = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* not JSON: keep the text */
      }
      return { status: r.status, body: data };
    };
    return { url, stop, api };
  } catch (err) {
    await stop();
    startFailure = err.message;
    throw err;
  }
}

// Runs the participant's tests the way `npm test` does (node --test from the root of the repository).
async function runTests() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // set when this tool itself runs inside a test: it would change the output
  const r = await run(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap'], {
    env,
    timeout: 180_000,
  });
  const count = (key) => {
    const m = new RegExp(`^# ${key} (\\d+)`, 'm').exec(r.stdout);
    return m ? Number(m[1]) : null;
  };
  return { ok: r.code === 0, passed: count('pass'), failed: count('fail'), timedOut: r.timedOut, output: r.stdout + r.stderr };
}

// A fresh context per check: each one gets its own app (and so its own seeded database) if it asks for one.
function makeContext() {
  const apps = [];
  let current = null;
  const ctx = {
    root: ROOT,
    day: DAY,
    read: (rel) => {
      try {
        return fs.readFileSync(path.join(ROOT, rel), 'utf8');
      } catch {
        return null;
      }
    },
    exists: (rel) => fs.existsSync(path.join(ROOT, rel)),
    // Relative paths of the files under a folder (recursive; node_modules and dot folders skipped).
    files: (rel, exts) => listFiles(path.join(ROOT, rel), exts).map((f) => path.relative(ROOT, f)),
    git: (args) => git(args), // { code, out, err }
    startApp: async (options) => {
      const app = await startApp(options);
      apps.push(app);
      return app;
    },
    // JSON API of an app started on first use: { status, body }.
    api: async (method, route, body) => {
      current ||= await ctx.startApp();
      return current.api(method, route, body);
    },
    runTests,
  };
  ctx.cleanup = () => Promise.all(apps.map((a) => a.stop()));
  return ctx;
}

// ---------------------------------------------------------------------------
// W1's four buttons (checked at w2-depart): a static heuristic, approximate on purpose.
//
// A button counts as present when, in the front-end sources (every .html/.htm/.js/.mjs file under web/,
// comments removed first, so that w1-depart's « TODO bouton … » notes never count), EITHER
//   a. its label is the text of a clickable element: <button>…</button>, <a>…</a>, an element with
//      role="button", <input type="button|submit" value="…">, or the ~400 characters after
//      document.createElement('button' | 'a') (textContent, innerText, value…) — markup built inside JS
//      strings included;
//   b. OR the function the app already has for it (reserver, afficherMesReservations, annuler, arrivee) is
//      wired to an event: in the ~200 characters after an inline handler or an .onclick assignment
//      (onclick="annuler(' + i + ')"), or the ~300 characters after addEventListener('click', ….
//      A definition (function annuler(…)) never counts, nor does a call from other code.
// Blind spots: a label assembled from variables, or a handler found through a lookup table, is reported ✘
// although the button works; the trainer then looks at the screen.
// ---------------------------------------------------------------------------

const E = '(?:é|e|&eacute;|&#0*233;|\\\\u00e9)'; // « é » however the source writes it

const BUTTONS = [
  { label: 'Réserver', text: new RegExp(`r${E}server(?![a-z])`, 'i'), fn: 'reserver' },
  { label: 'Mes réservations', text: new RegExp(`mes\\s+r${E}servations`, 'i'), fn: 'afficherMesReservations' },
  { label: 'Annuler', text: /annuler/i, fn: 'annuler' },
  { label: 'Je suis arrivé·e', text: new RegExp(`je\\s+suis\\s+arriv${E}`, 'i'), fn: 'arrivee' },
];

const EVENTS = 'click|dblclick|mousedown|mouseup|pointerdown|pointerup|touchend|keydown|keyup|submit';
const KEYWORD_BEFORE_REGEX = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)\s*$/;

// Removes // and /* */ comments, keeping strings, template literals and regular expressions intact.
function stripJsComments(src) {
  let out = '';
  let last = ''; // the last significant character, to tell a regular expression from a division
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c && (c === '`' || src[j] !== '\n')) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      last = c;
      continue;
    }
    if (c === '/' && (last === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(last) || KEYWORD_BEFORE_REGEX.test(out.slice(-12)))) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      last = '/';
      continue;
    }
    out += c;
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return out;
}

const withoutComments = (file, source) =>
  /\.html?$/i.test(file) ? source.replace(/<!--[\s\S]*?-->/g, ' ') : stripJsComments(source);

function clickableTexts(code) {
  const texts = [];
  const inner = (s) => s.replace(/<[^>]*>/g, ' ');
  for (const m of code.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) texts.push(inner(m[2]));
  for (const m of code.matchAll(/<(\w+)\b[^>]*\brole\s*=\s*\\?["']button\\?["'][^>]*>([\s\S]*?)<\/\1\s*>/gi)) texts.push(inner(m[2]));
  for (const m of code.matchAll(/<input\b[^>]*>/gi)) if (/\btype\s*=\s*\\?["']?(?:button|submit)/i.test(m[0])) texts.push(m[0]);
  for (const m of code.matchAll(/createElement\(\s*['"`](?:button|a)['"`]\s*\)/g)) texts.push(code.slice(m.index, m.index + 400));
  return texts;
}

function wiredTo(code, fn) {
  const reference = new RegExp(`(?<!function\\s+)\\b${fn}\\b`);
  const windows = [];
  for (const m of code.matchAll(new RegExp(`\\bon(?:${EVENTS})\\s*=\\s*`, 'gi'))) {
    windows.push(code.slice(m.index + m[0].length, m.index + m[0].length + 200));
  }
  for (const m of code.matchAll(new RegExp(`addEventListener\\(\\s*['"\`](?:${EVENTS})['"\`]`, 'g'))) {
    windows.push(code.slice(m.index + m[0].length, m.index + m[0].length + 300));
  }
  return windows.some((w) => reference.test(w));
}

function buttonCheck({ label, text, fn }) {
  return {
    label: `Bouton « ${label} »`,
    run({ files, read }) {
      const sources = files('web', ['.html', '.htm', '.js', '.mjs']).map((f) => withoutComments(f, read(f) || ''));
      if (sources.length === 0) return 'aucun fichier dans web/';
      if (sources.some((code) => clickableTexts(code).some((t) => text.test(t)))) return true;
      if (sources.some((code) => wiredTo(code, fn))) return true;
      return `introuvable dans web/ : ni bouton ni lien « ${label} », ni ${fn}() appelée par un clic`;
    },
  };
}

// ---------------------------------------------------------------------------
// Checks through the app's API. Each scenario is the one a participant plays in the browser.
// run(ctx) returns true (✔), false (✘) or a message saying what is wrong (✘).
// ---------------------------------------------------------------------------

const PLAYWRIGHT_DECLARED = {
  label: 'Playwright déclaré pour le projet (.mcp.json)',
  run({ read }) {
    const raw = read('.mcp.json');
    if (raw === null) return 'pas de fichier .mcp.json à la racine du repo';
    let config;
    try {
      config = JSON.parse(raw);
    } catch {
      return ".mcp.json n'est pas un JSON valide";
    }
    const servers = Object.values(config?.mcpServers || {});
    const mentions = (s) => [s?.command, ...(Array.isArray(s?.args) ? s.args : [])].some((x) => typeof x === 'string' && x.includes('@playwright/mcp'));
    return servers.some(mentions) || 'aucun serveur @playwright/mcp dans .mcp.json';
  },
};

const ROOM_DOUBLE_BOOKING = {
  label: 'Une salle prise de 9h30 à 10h30 refuse une réunion de 10h00 à 11h00 (Seine, jeudi 15 octobre)',
  async run({ api, day }) {
    const room = { type: 'salle', ressource: 'seine', jour: day.nextThursday };
    const first = await api('POST', '/api/reservations', { ...room, employe: 'e001', debut: '9h30', fin: '10h30', nb: 3 });
    if (first.status !== 201) return `la réservation de 9h30 à 10h30 reçoit ${first.status} au lieu de 201`;
    const second = await api('POST', '/api/reservations', { ...room, employe: 'e002', debut: '10h00', fin: '11h00', nb: 2 });
    if (second.status !== 409) return `la réservation de 10h00 à 11h00 reçoit ${second.status} au lieu de 409`;
    return true;
  },
};

// Approximate: any test file that names the room of the scenario, or both of its times.
const ROOM_DOUBLE_BOOKING_TESTED = {
  label: 'Un test couvre ce cas (dans test/)',
  run({ files, read }) {
    const tests = files('test', ['.js', '.mjs', '.cjs']);
    if (tests.length === 0) return 'aucun fichier dans test/';
    const covers = (code) => /['"`]seine['"`]/i.test(code) || (/\b0?9[h:]30\b/.test(code) && /\b10[h:]00\b/.test(code));
    return tests.some((f) => covers(read(f) || '')) || 'aucun test ne rejoue la double réservation (salle Seine, 9h30 puis 10h00)';
  },
};

const ROOM_CAPACITY = {
  label: 'Une salle refuse plus de monde que de places (9 personnes dans la Bulle 1)',
  async run({ api, day }) {
    const r = await api('POST', '/api/reservations', {
      type: 'salle', ressource: 'bulle-1', employe: 'e001', jour: day.nextThursday, debut: '15h00', fin: '16h00', nb: 9,
    });
    return r.status === 409 || `9 personnes dans la Bulle 1 : réponse ${r.status} au lieu de 409`;
  },
};

const DESK_DAY = {
  label: 'Un poste réservé pour le jeudi 15 octobre apparaît bien ce jour-là',
  async run({ api, day }) {
    const r = await api('POST', '/api/reservations', { type: 'poste', ressource: 'T07', employe: 'e001', jour: day.nextThursday });
    if (r.status !== 201) return `la réservation du poste T07 reçoit ${r.status} au lieu de 201`;
    const mine = await api('GET', '/api/mes-reservations?employe=e001');
    const desk = Array.isArray(mine.body) ? mine.body.find((x) => x.ressource === 'T07') : null;
    if (!desk) return "le poste T07 n'apparaît pas dans « Mes réservations »";
    return desk.jour === day.nextThursday || `le poste T07 réservé pour le ${day.nextThursday} apparaît le ${desk.jour}`;
  },
};

// Every booking of the seeded fortnight (Monday 5 to Friday 16 October), counted day by day.
async function countBookings(api, monday) {
  const [y, m, d] = monday.split('-').map(Number);
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    const r = await api('GET', `/api/reservations?jour=${date}`);
    if (Array.isArray(r.body)) total += r.body.length;
  }
  return total;
}

const CANCEL_MINE = {
  label: "Annuler ma 2e réservation n'annule qu'elle (Camille)",
  async run({ api, day }) {
    const before = await api('GET', '/api/mes-reservations?employe=e001');
    if (!Array.isArray(before.body) || before.body.length < 2) return 'Camille devrait avoir au moins deux réservations à venir';
    const second = before.body[1];
    const totalBefore = await countBookings(api, day.monday);
    const r = await api('DELETE', '/api/mes-reservations/1?employe=e001');
    if (r.status < 200 || r.status >= 300) return `l'annulation reçoit ${r.status}`;
    const after = await api('GET', '/api/mes-reservations?employe=e001');
    const stillThere = Array.isArray(after.body) && after.body.some((x) => x.id === second.id);
    const gone = totalBefore - (await countBookings(api, day.monday));
    if (stillThere && gone > 0) return "la 2e réservation de Camille est toujours là, et celle d'un collègue a disparu";
    if (stillThere) return 'la 2e réservation de Camille est toujours là';
    return gone === 1 || `${gone} réservations ont disparu au lieu d'une seule`;
  },
};

const EARLY_CHECK_IN = {
  label: "Pas d'arrivée signalée pour un autre jour (Camille, mardi 13 octobre)",
  async run({ api, day }) {
    const mine = await api('GET', '/api/mes-reservations?employe=e001');
    const tuesday = Array.isArray(mine.body) ? mine.body.find((x) => x.jour === day.nextTuesday) : null;
    if (!tuesday) return 'la réservation de Camille du mardi 13 octobre est introuvable';
    const r = await api('POST', `/api/reservations/${tuesday.id}/arrivee`, { employe: 'e001' });
    return (r.status >= 400 && r.status < 500) || `l'arrivée du mardi 13 octobre est acceptée (réponse ${r.status}) dès le mercredi 7`;
  },
};

const TESTS_PASS = {
  label: 'Les tests passent (npm test)',
  timeout: 200_000,
  async run({ runTests }) {
    const r = await runTests();
    if (r.ok) return true;
    if (r.timedOut) return 'les tests ne se terminent pas (plus de 3 minutes)';
    return r.failed ? `${r.failed} test(s) en échec : lancez npm test pour le détail` : 'les tests échouent : lancez npm test pour le détail';
  },
};

const PROJECT_RULES = {
  label: 'CLAUDE.md explique au moins cinq règles issues des défauts observés',
  run({ read }) {
    const rules = read('CLAUDE.md');
    if (!rules) return 'CLAUDE.md absent à la racine du repo';
    const topics = [
      /heure|minute/i, /jour|date/i, /capacit|champ/i, /réservation|propriétaire/i,
      /test/i, /export|e-mail|personnel/i, /plan.*(services généraux|facilit)/i,
    ];
    const found = topics.filter((r) => r.test(rules)).length;
    return found >= 5 || `${found}/7 thèmes reconnus : heures, jours, capacité, propriétaire, tests, export, plan`;
  },
};

const EXPORT_WITHOUT_PEOPLE = {
  label: "L'export ne révèle aucun nom ni e-mail",
  async run({ api }) {
    const r = await api('GET', '/api/export.csv');
    if (r.status !== 200 || typeof r.body !== 'string') return `export inaccessible (réponse ${r.status})`;
    return !/@|Camille|Martin/i.test(r.body) || "l'export contient un nom ou une adresse e-mail";
  },
};

const FREE_ROOM_NOW = {
  label: '« Salle libre maintenant » propose des salles assez grandes, libres et triées',
  async run({ api }) {
    const r = await api('GET', '/api/salles-libres?personnes=3');
    if (r.status !== 200 || !Array.isArray(r.body?.salles)) return 'route /api/salles-libres?personnes=3 absente';
    const rooms = r.body.salles;
    if (!rooms.length) return 'aucune salle proposée à 09h05';
    if (rooms.some((room) => room.capacite < 3)) return 'une salle a moins de trois places';
    const capacities = rooms.map((room) => room.capacite);
    if (capacities.some((n, i) => i && n < capacities[i - 1])) return 'les salles ne sont pas triées par capacité';
    const occupied = await api('GET', `/api/reservations?jour=${DAY.today}`);
    if (occupied.status !== 200 || !Array.isArray(occupied.body)) return 'réservations du jour introuvables';
    const toMinutes = (value) => {
      const match = /^(\d{1,2})[h:](\d{2})$/.exec(value || '');
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const busy = occupied.body.filter((b) => b.type === 'salle' && toMinutes(b.debut) < 605 && toMinutes(b.fin) > 545);
    return rooms.every((room) => !busy.some((b) => b.ressource === room.id)) || 'une salle proposée est occupée avant 10h05';
  },
};

const FREE_ROOM_TEST = {
  label: 'Un test protège la recherche de salle libre',
  run({ files, read }) {
    return files('test', ['.js', '.mjs']).some((f) => /salles-libres|salle libre maintenant/i.test(read(f) || ''))
      || 'aucun scénario de salle libre dans test/';
  },
};

const DESIGN_SKILL = {
  label: 'Nouvelle interface et skill « charte » dans le projet',
  run({ read, exists }) {
    const css = read('web/style.css') || '';
    if (!exists('.claude/skills/charte/SKILL.md')) return 'skill charte absent';
    if (!/prefers-color-scheme:\s*dark/.test(css) || !/--fond:/.test(css)) return 'tokens et thème sombre absents de web/style.css';
    return exists('web/js/main.js') || 'modules de la nouvelle interface absents';
  },
};

const DATA_AGENT = {
  label: 'Sous-agent analyste-donnees avec le skill de données préchargé',
  run({ read }) {
    const agent = read('.claude/agents/analyste-donnees.md');
    const skill = read('.claude/skills/donnees-ma-place/SKILL.md');
    if (!agent || !skill) return 'sous-agent ou skill manquant dans .claude/';
    if (!/skills:\s*(?:\[[^\]]*donnees-ma-place|\n\s*-\s*donnees-ma-place)/.test(agent)) return 'le sous-agent ne précharge pas donnees-ma-place';
    return /bookings|réservation/i.test(skill) && /checkins|check-in/i.test(skill)
      || 'le skill ne décrit pas les réservations et les check-ins';
  },
};

const DATA_NOTEBOOK = {
  label: 'Notebook avec quatre graphiques et contrôle des réservations distinctes',
  run({ read, exists }) {
    if (!exists('analytics/ma-place-2026-09.db')) return 'base d’usage absente';
    const raw = read('analytics/septembre.ipynb');
    if (!raw) return 'analytics/septembre.ipynb absent';
    let notebook;
    try {
      notebook = JSON.parse(raw);
    } catch {
      return 'notebook JSON invalide';
    }
    const source = (notebook.cells || []).map((cell) => (cell.source || []).join('')).join('\n');
    const charts = (source.match(/plt\.subplots\s*\(/g) || []).length;
    if (charts < 4) return `${charts}/4 graphiques reconnus (plt.subplots)`;
    return /drop_duplicates|DISTINCT/i.test(source) || 'aucune règle de déduplication trouvée';
  },
};

const FOUR_DATA_CARDS = {
  label: 'Quatre cartes A–D chiffrées et vérifiables dans BACKLOG.md',
  run({ read }) {
    const backlog = read('BACKLOG.md') || '';
    for (const letter of ['A', 'B', 'C', 'D']) {
      if (!new RegExp(`^###? ${letter}\\b`, 'm').test(backlog)) return `carte ${letter} absente`;
    }
    return /[Vv]érification/.test(backlog) && /\d/.test(backlog)
      || 'les cartes doivent avoir des chiffres et une vérification';
  },
};

// ---------------------------------------------------------------------------
// Day 2 (W5–W8)
// ---------------------------------------------------------------------------

// The acceptance tests of BACKLOG.md's cards, one file each under test/acceptation/.
const ACCEPTANCE = {
  A: { file: 'test/acceptation/carte-a.test.js', name: 'carte A' },
  B: { file: 'test/acceptation/carte-b.test.js', name: 'carte B' },
  C: { file: 'test/acceptation/carte-c.test.js', name: 'carte C' },
  AB: { file: 'test/acceptation/fusion-a-b.test.js', name: 'test A×B' },
  D: { file: 'test/acceptation/carte-d.test.js', name: 'carte D' },
};

// Runs one test file and counts its tests from the TAP report: { missing } or { count, todo, failed, timedOut }.
// A test still marked todo carries the TAP directive « # TODO » (the word TODO in a test name does not count);
// a suite line (describe) is skipped, only its tests count.
async function acceptance(file) {
  if (!fs.existsSync(path.join(ROOT, file))) return { missing: true };
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = await run(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap', file], { env, timeout: 60_000 });
  const result = { count: 0, todo: 0, failed: 0, timedOut: r.timedOut };
  let previous = -1;
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^(\s*)(not )?ok \d+ - (.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    const suite = indent < previous; // printed after its own tests, one level up
    previous = indent;
    if (suite) continue;
    result.count++;
    if (/(?<!\\)#\s*TODO\b/.test(m[3])) result.todo++;
    else if (m[2]) result.failed++;
  }
  return result;
}

// true when every test of the card's file is active and passes, else what is missing.
async function cardDone(key) {
  const { file, name } = ACCEPTANCE[key];
  const r = await acceptance(file);
  if (r.missing) return `${file} absent`;
  if (r.timedOut) return `${name} : les tests ne se terminent pas`;
  if (!r.count) return `${name} : aucun test trouvé dans ${file}`;
  if (r.todo) return `${name} : ${r.todo} test(s) encore en todo`;
  if (r.failed) return `${name} : ${r.failed} test(s) en échec (node --test ${file})`;
  return true;
}

function readSettings(read) {
  const raw = read('.claude/settings.json');
  if (raw === null) return '.claude/settings.json absent';
  try {
    return JSON.parse(raw);
  } catch {
    return ".claude/settings.json n'est pas un JSON valide";
  }
}

// The command handlers declared for a hook event, with the matcher of their group.
function hooksOf(settings, event) {
  const groups = Array.isArray(settings?.hooks?.[event]) ? settings.hooks[event] : [];
  return groups.flatMap((g) => (Array.isArray(g?.hooks) ? g.hooks : []).filter((h) => h?.type === 'command' && typeof h.command === 'string').map((h) => ({ ...h, matcher: g.matcher })));
}

// Does a matcher select this tool? « * », empty or omitted: every tool; letters, digits, _, -, spaces,
// commas and | only: a list of exact names; anything else: an unanchored regular expression.
function matches(matcher, tool) {
  if (matcher === undefined || matcher === '' || matcher === '*') return true;
  if (typeof matcher !== 'string') return false;
  if (/^[\w\s,|-]+$/.test(matcher)) return matcher.split(/[|,]/).map((s) => s.trim()).includes(tool);
  try {
    return new RegExp(matcher).test(tool);
  } catch {
    return false;
  }
}

// Does a handler's `if` (one permission rule, e.g. « Edit(data/*.json) ») let it run for an Edit of rel?
function runsFor(hook, tool, rel) {
  if (!hook.if) return true;
  const m = /^\s*([\w*]+)\s*(?:\((.*)\))?\s*$/.exec(String(hook.if));
  if (!m) return true; // unknown form: run it
  if (!matches(m[1], tool)) return false;
  if (m[2] === undefined || m[2] === '' || m[2] === '*') return true;
  const pattern = m[2].replace(/^\.?\//, '');
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('?', '[^/]')
    .replaceAll('**/', '\u0000')
    .replaceAll('**', '\u0001')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '(?:.*/)?')
    .replaceAll('\u0001', '.*');
  return new RegExp(`^${regex}$`).test(rel);
}

// Runs a hook handler as Claude Code would, the event's JSON on stdin and the project as current folder.
// Exec form (`args` present): command spawned directly, ${CLAUDE_PROJECT_DIR} replaced; shell form otherwise.
function runHook(hook, input, timeout) {
  return new Promise((resolve) => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };
    delete env.NODE_TEST_CONTEXT;
    const shell = !Array.isArray(hook.args);
    const fill = (s) => String(s).replaceAll('${CLAUDE_PROJECT_DIR}', ROOT);
    let child;
    try {
      if (shell) child = spawn(hook.command, { cwd: ROOT, env, shell: true, windowsHide: true });
      else {
        const command = /^node(\.exe)?$/i.test(hook.command) ? process.execPath : fill(hook.command);
        child = spawn(command, hook.args.map(fill), { cwd: ROOT, env, windowsHide: true });
      }
    } catch (err) {
      return resolve({ code: null, stdout: '', stderr: err.message, shell });
    }
    children.add(child);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => killTree(child), timeout);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.on('error', () => {}); // a hook may exit without reading its input
    child.stdin.end(JSON.stringify(input));
    const finish = (code, error = '') => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ code, stdout, stderr: stderr + error, shell });
    };
    child.on('error', (err) => finish(null, err.message));
    child.on('close', (code) => finish(code));
  });
}

// Did the hook block? Exit code 2, or a JSON answer that denies (PreToolUse) or blocks (Stop).
function verdict(r) {
  let json = null;
  try {
    json = JSON.parse(r.stdout.trim() || 'null');
  } catch {
    /* plain text */
  }
  const denied = json?.hookSpecificOutput?.permissionDecision === 'deny' || json?.decision === 'block';
  const reason = r.stderr.trim() || json?.hookSpecificOutput?.permissionDecisionReason || json?.reason || '';
  return { blocked: r.code === 2 || denied, reason: reason.split(/\r?\n/)[0] };
}

const SHELL_FORM = ' (hook en forme shell : préférez "command": "node", "args": [...])';

const WORKTREE_BASE = {
  label: 'Chaque worktree part de votre commit (worktree.baseRef : "head" dans .claude/settings.json)',
  run({ read }) {
    const settings = readSettings(read);
    if (typeof settings === 'string') return settings;
    const value = settings?.worktree?.baseRef;
    return value === 'head' || `worktree.baseRef vaut ${value === undefined ? 'rien' : JSON.stringify(value)} au lieu de "head"`;
  },
};

const ACCEPTANCE_TODO = {
  label: "Les cinq tests d'acceptation sont là, encore en todo (test/acceptation)",
  timeout: 120_000,
  async run() {
    for (const { file, name } of Object.values(ACCEPTANCE)) {
      const r = await acceptance(file);
      if (r.missing) return `${file} absent`;
      if (!r.count) return `${name} : aucun test trouvé dans ${file}`;
      if (r.todo < r.count) return `${name} : ${r.count - r.todo} test(s) déjà actif(s) sur ${r.count}`;
    }
    return true;
  },
};

const QA_SDK = {
  label: "Le SDK de l'agent de recette est installé (qa/node_modules)",
  run({ exists }) {
    return exists('qa/node_modules/@anthropic-ai/claude-agent-sdk/package.json') || 'SDK absent : lancez npm ci --prefix qa';
  },
};

const BRANCH_PUSHED = {
  label: 'Votre branche est poussée sur GitHub',
  run({ git }) {
    return git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).code === 0
      || 'pas de branche distante : lancez git push -u origin HEAD';
  },
};

const THREE_BRIEFS = {
  label: 'Trois briefs commités dans docs/briefs (carte-a.md, carte-b.md, carte-c.md)',
  run({ exists, git }) {
    const tracked = git(['ls-files', '--', 'docs/briefs']).out.split(/\r?\n/);
    for (const card of ['carte-a', 'carte-b', 'carte-c']) {
      const file = `docs/briefs/${card}.md`;
      if (!exists(file)) return `${file} absent`;
      if (!tracked.includes(file)) return `${file} non commité`;
    }
    return true;
  },
};

const CARD_BRANCHES = {
  label: 'Une branche par carte (carte-a, carte-b, carte-c)',
  run({ git }) {
    for (const card of ['carte-a', 'carte-b', 'carte-c']) {
      const found = [card, `worktree-${card}`].some((b) => git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]).code === 0);
      if (!found) return `branche ${card} introuvable (ni ${card} ni worktree-${card})`;
    }
    return true;
  },
};

const CARDS_MERGED = {
  label: "Cartes A, B et C fusionnées : leurs tests d'acceptation sont actifs et passent",
  timeout: 120_000,
  async run() {
    for (const key of ['A', 'B', 'C']) {
      const r = await cardDone(key);
      if (r !== true) return r;
    }
    return true;
  },
};

const MERGE_A_B = {
  label: 'Le test A×B est actif et passe (cartes A et B ensemble)',
  timeout: 60_000,
  run: () => cardDone('AB'),
};

const JOURNEYS = {
  label: 'Trois parcours dans qa/parcours.md, dont une réservation un autre jour',
  run({ read, day }) {
    const text = read('qa/parcours.md');
    if (text === null) return 'qa/parcours.md absent';
    const headings = (text.match(/^#{2,4}\s+\S/gm) || []).length;
    const numbered = (text.match(/^\s*\d+[.)]\s+\S/gm) || []).length;
    const count = Math.max(headings, numbered);
    if (count < 3) return `${count} parcours trouvé(s) au lieu de 3`;
    const months = { octobre: 10, novembre: 11, 'décembre': 12 };
    const today = day.today;
    const later = [...text.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)\b/g)].some((m) => m[0] > today)
      || [...text.matchAll(/\b(\d{1,2})(?:er)?\s+(octobre|novembre|décembre)\b/gi)]
        .some((m) => `2026-${String(months[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}` > today);
    const future = later || /demain|autre jour|jour futur|à venir|prochaine?s?\b|J\s*\+\s*[1-9]/i.test(text);
    return (/réserv/i.test(text) && future) || "aucun parcours ne réserve pour un autre jour qu'aujourd'hui";
  },
};

// The `tools` field of a subagent's YAML header: a list, or null when the field is absent.
function toolsOf(header) {
  const m = /^tools:[ \t]*(.*)$/m.exec(header);
  if (!m) return null;
  const inline = m[1].trim();
  const items = inline
    ? inline.replace(/^\[|\]$/g, '').split(',')
    : header.slice(m.index + m[0].length).split(/\r?\n/).slice(1).map((l) => /^\s*-\s*(.+)$/.exec(l)).filter(Boolean).map((x) => x[1]);
  return items.map((t) => t.trim().replace(/^['"]|['"]$/g, '').replace(/\(.*$/, '').trim()).filter(Boolean);
}

const QA_AGENT = {
  label: "Le sous-agent qa-visiteur a Playwright et ne peut rien modifier (ni Edit, ni Write, ni Bash)",
  run({ read }) {
    const text = read('.claude/agents/qa-visiteur.md');
    if (text === null) return '.claude/agents/qa-visiteur.md absent';
    const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!header) return 'en-tête --- absent dans qa-visiteur.md';
    const tools = toolsOf(header[1]);
    if (!tools || tools.includes('*')) return 'pas de liste tools : le sous-agent reçoit tous les outils';
    if (!tools.some((t) => /^mcp__playwright/.test(t))) return 'Playwright absent de la liste tools';
    const forbidden = tools.filter((t) => ['Edit', 'Write', 'Bash'].includes(t));
    return !forbidden.length || `outil(s) à retirer de tools : ${forbidden.join(', ')}`;
  },
};

const QA_REPORT = {
  label: 'Le programme de recette écrit sa page de rapport (ou le skill relecture-pr existe)',
  run({ read, exists }) {
    if (exists('.claude/skills/relecture-pr/SKILL.md')) return true;
    const code = read('qa/agent-qa.mjs');
    if (code === null) return 'qa/agent-qa.mjs absent';
    return (/rapport/.test(code) && /\.html\b/.test(code) && /write/i.test(code))
      || "qa/agent-qa.mjs n'écrit pas de page qa/rapport/index.html";
  },
};

const PLAN_WALL = {
  label: 'Un hook PreToolUse protège le plan des locaux (data/floor-plan.json refusé, web/style.css accepté)',
  timeout: 60_000,
  async run({ read }) {
    const settings = readSettings(read);
    if (typeof settings === 'string') return settings;
    const declared = hooksOf(settings, 'PreToolUse');
    if (!declared.length) return 'aucun hook PreToolUse dans .claude/settings.json';
    const edit = (rel) => ({
      session_id: 'verification', transcript_path: '', cwd: ROOT, permission_mode: 'default', hook_event_name: 'PreToolUse',
      tool_name: 'Edit', tool_use_id: 'verification',
      tool_input: { file_path: path.join(ROOT, ...rel.split('/')), old_string: 'a', new_string: 'b', replace_all: false },
    });
    const play = async (rel) => {
      const results = [];
      for (const hook of declared.filter((h) => matches(h.matcher, 'Edit') && runsFor(h, 'Edit', rel))) {
        results.push({ ...verdict(await runHook(hook, edit(rel), 15_000)), shell: !Array.isArray(hook.args) });
      }
      return results;
    };
    const plan = await play('data/floor-plan.json');
    if (!plan.length) return "aucun hook PreToolUse ne s'applique à l'outil Edit";
    const shell = plan.some((r) => r.shell) ? SHELL_FORM : '';
    const blocked = plan.find((r) => r.blocked);
    if (!blocked) return `une modification de data/floor-plan.json passe${shell}`;
    if (!blocked.reason) return `le refus ne donne aucune raison à Claude (rien sur stderr)${shell}`;
    const style = (await play('web/style.css')).find((r) => r.blocked);
    return !style || `une modification de web/style.css est refusée aussi : ${style.reason || 'sans raison'}${shell}`;
  },
};

const TEST_GATE = {
  label: 'Un hook Stop laisse Claude finir quand les tests passent',
  timeout: 200_000,
  async run({ read }) {
    const settings = readSettings(read);
    if (typeof settings === 'string') return settings;
    const declared = hooksOf(settings, 'Stop').filter((h) => !h.if);
    if (!declared.length) return 'aucun hook Stop dans .claude/settings.json';
    const input = {
      session_id: 'verification', transcript_path: '', cwd: ROOT, permission_mode: 'default',
      hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: '',
    };
    for (const hook of declared) {
      const r = await runHook(hook, input, 190_000);
      const shell = Array.isArray(hook.args) ? '' : SHELL_FORM;
      const { blocked, reason } = verdict(r);
      if (blocked) return `le hook Stop bloque sur ce repo : ${reason || 'sans raison'}${shell}`;
      if (r.code !== 0) return `le hook Stop échoue (code ${r.code})${reason ? ` : ${reason}` : ''}${shell}`;
    }
    return true;
  },
};

const HOOKS_COMMITTED = {
  label: 'Les hooks sont commités (.claude/settings.json et .claude/hooks)',
  run({ read, git }) {
    const settings = readSettings(read);
    if (typeof settings === 'string') return settings;
    const tracked = git(['ls-files', '--', '.claude/settings.json', '.claude/hooks']).out.split(/\r?\n/).filter(Boolean);
    if (!tracked.includes('.claude/settings.json')) return '.claude/settings.json non commité';
    const words = [...hooksOf(settings, 'PreToolUse'), ...hooksOf(settings, 'Stop')]
      .flatMap((h) => [h.command, ...(Array.isArray(h.args) ? h.args : [])]).join(' ').replaceAll('\\', '/');
    const scripts = [...new Set([...words.matchAll(/\.claude\/hooks\/[^\s"'`]+/g)].map((m) => m[0]))];
    if (!scripts.length) return tracked.some((f) => f.startsWith('.claude/hooks/')) || 'aucun script commité dans .claude/hooks';
    const missing = scripts.find((s) => !tracked.includes(s));
    return !missing || `${missing} non commité`;
  },
};

const CARD_D_TESTS = {
  label: "Carte D : ses tests d'acceptation sont actifs et passent",
  timeout: 60_000,
  run: () => cardDone('D'),
};

const CALENDAR = {
  label: '« Ajouter à mon agenda » donne un fichier text/calendar à Camille et le refuse à Léa',
  async run({ startApp, day }) {
    const app = await startApp();
    const mine = await app.api('GET', '/api/mes-reservations?employe=e001');
    const rows = Array.isArray(mine.body) ? mine.body : [];
    const booking = rows.find((r) => r.ressource === 'loire' && r.jour === day.nextThursday) || rows[0];
    if (!booking) return 'aucune réservation de Camille (e001) trouvée';
    const get = (who) => fetch(`${app.url}/api/reservations/${booking.id}/agenda.ics?employe=${who}`, { signal: AbortSignal.timeout(10_000) });
    const own = await get('e001');
    if (own.status !== 200) return `agenda de Camille : réponse ${own.status} au lieu de 200 (GET /api/reservations/${booking.id}/agenda.ics?employe=e001)`;
    const type = own.headers.get('content-type') || '';
    if (!/^text\/calendar/i.test(type)) return `agenda de Camille : type « ${type || 'aucun'} » au lieu de text/calendar`;
    const other = await get('e003');
    return other.status === 403 || `la réservation de Camille demandée par Léa (e003) : réponse ${other.status} au lieu de 403`;
  },
};

const CARD_D_PLAN = {
  label: 'Le plan de la carte D est dans docs/carte-D.md',
  run({ exists }) {
    return exists('docs/carte-D.md') || 'docs/carte-D.md absent';
  },
};

// What a repository shows once the lab before each checkpoint is done.
// To add a checkpoint: a key named like its tag, and a list of { label (French), run: async (ctx) =>
// true | false | 'message', timeout? (ms, default 30 s) }. ctx: api, startApp, read, exists, files, git,
// runTests, day (the dates of the simulated clock). Each check gets a fresh app and database.
export const CHECKS = {
  'w2-depart': BUTTONS.map(buttonCheck),
  'w2-correctif': [PLAYWRIGHT_DECLARED, ROOM_DOUBLE_BOOKING, ROOM_DOUBLE_BOOKING_TESTED],
  'w3-depart': [ROOM_CAPACITY, DESK_DAY, CANCEL_MINE, EARLY_CHECK_IN, TESTS_PASS],
  'w3-regles': [PROJECT_RULES, EXPORT_WITHOUT_PEOPLE, TESTS_PASS],
  'w3-fonction': [PROJECT_RULES, FREE_ROOM_NOW, FREE_ROOM_TEST, TESTS_PASS],
  'w4-depart': [DESIGN_SKILL, FREE_ROOM_NOW, TESTS_PASS],
  'w4-analyses': [DATA_AGENT, DATA_NOTEBOOK, FOUR_DATA_CARDS, TESTS_PASS],
  'w5-depart': [WORKTREE_BASE, ACCEPTANCE_TODO, QA_SDK, BRANCH_PUSHED, TESTS_PASS],
  'w5-fusion': [THREE_BRIEFS, CARD_BRANCHES, TESTS_PASS],
  'w6-depart': [CARDS_MERGED, MERGE_A_B, TESTS_PASS],
  'w6-commande': [JOURNEYS, QA_AGENT, TESTS_PASS],
  'w7-depart': [QA_REPORT, TESTS_PASS],
  'w7-mur': [PLAN_WALL, TESTS_PASS],
  'w8-depart': [PLAN_WALL, TEST_GATE, HOOKS_COMMITTED, TESTS_PASS],
  'final': [CARD_D_TESTS, CALENDAR, CARD_D_PLAN, TESTS_PASS],
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`pas de réponse en ${Math.round(ms / 1000)} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function runCheckpoint(name) {
  const checks = CHECKS[name];
  const point = POINTS.find((p) => p.name === name);
  console.log(`Point de reprise ${name}${point ? ` · ${point.description}` : ''}`);
  console.log('');
  let passed = 0;
  for (const check of checks) {
    const ctx = makeContext();
    let result;
    try {
      const pending = Promise.resolve().then(() => check.run(ctx));
      pending.catch(() => {}); // a check still running after its timeout must not crash the tool
      result = await withTimeout(pending, check.timeout || 30_000);
    } catch (err) {
      result = err.message;
    } finally {
      await ctx.cleanup();
    }
    if (result === true) passed++;
    const why = result !== true && typeof result === 'string' && result ? ` — ${result}` : '';
    console.log(`${result === true ? MARK.ok : MARK.fail} ${check.label}${why}`);
  }
  console.log('');
  if (passed === checks.length) {
    console.log(`✔ ${passed}/${checks.length} : votre repo a atteint le point de reprise ${name}.`);
    return 0;
  }
  console.log(`✘ ${passed}/${checks.length} : pas encore. Bloqué ? npm run checkpoint -- ${name} vous y amène (votre travail est sauvegardé d'abord).`);
  return 1;
}

function list() {
  console.log('Vérifications disponibles :');
  const names = ['setup', ...Object.keys(CHECKS)];
  const width = Math.max(...names.map((n) => n.length));
  console.log(`  ${'setup'.padEnd(width)}  votre poste : Node, Git, gh, navigateur, Playwright, Python, VS Code, Claude Code`);
  for (const name of Object.keys(CHECKS)) {
    const point = POINTS.find((p) => p.name === name);
    console.log(`  ${name.padEnd(width)}  ${point ? point.description : ''}`);
  }
  console.log('');
  console.log('Usage : npm run check -- <nom>');
  return 0;
}

async function main(argv) {
  const [name] = argv;
  if (!name || ['-h', '--help', 'help', 'aide'].includes(name)) {
    console.log('Usage : npm run check -- setup | list | <point de reprise>');
    return name ? 0 : 2;
  }
  if (name === 'setup') return runSetup();
  if (name === 'list' || name === 'liste') return list();
  if (CHECKS[name]) return runCheckpoint(name);
  if (POINTS.some((p) => p.name === name)) {
    console.log(`⚠ Pas encore de vérification automatique pour ${name}. Voir : npm run check -- list`);
    return 2;
  }
  console.log(`✘ Point de reprise inconnu : ${name}. Voir : npm run check -- list`);
  return 2;
}

function isMain(url) {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) {
  // Never leave an app or a download running behind, even on Ctrl+C.
  process.on('exit', stopAll);
  process.on('SIGINT', () => {
    stopAll();
    process.exit(130);
  });
  process.exitCode = await main(process.argv.slice(2));
}
