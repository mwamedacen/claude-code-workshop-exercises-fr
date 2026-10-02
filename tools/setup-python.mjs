#!/usr/bin/env node
// npm run python — the Python environment of W4 (the notebook), at the root of the repository:
//   1. finds Python 3.10 or newer (python3, python, or py -3 on Windows);
//   2. creates .venv if it is missing (ignored by Git);
//   3. installs analytics/requirements.txt with the environment's own Python (python -m pip);
//   4. checks that pandas, matplotlib, ipykernel and nbconvert import, and says what to pick in VS Code.
// Safe to run again: an existing .venv is reused, installed packages are kept. It only writes inside the
// repository (.venv); it registers nothing in your user profile. Processes are started with argument
// arrays, never through a shell.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENV = path.join(ROOT, '.venv');
const REQUIREMENTS = path.join('analytics', 'requirements.txt');

export const MODULES = ['pandas', 'matplotlib', 'ipykernel', 'nbconvert'];
export const MINIMUM = [3, 10];

const PROBE = 'import sys; print("%d.%d.%d" % tuple(sys.version_info[:3])); print(sys.executable)';
const IMPORTS = [
  'import importlib, sys',
  'missing = []',
  'for name in sys.argv[1:]:',
  '    try:',
  '        importlib.import_module(name)',
  '    except Exception:',
  '        missing.append(name)',
  'print(",".join(missing))',
].join('\n');

// pip and npm messages that mean « no network » (or a proxy in the way).
const NETWORK = /NewConnectionError|Failed to establish a new connection|Temporary failure in name resolution|getaddrinfo failed|Name or service not known|nodename nor servname|Network is unreachable|ConnectTimeoutError|ReadTimeoutError|ProxyError|No matching distribution found|Could not fetch URL/i;

// Where to look for Python, in order. On Windows the « py » launcher is the most reliable; a « python »
// that is only the Microsoft Store shortcut fails the probe and is skipped.
export function candidates() {
  return process.platform === 'win32'
    ? [
        { label: 'py -3', command: 'py', prefix: ['-3'] },
        { label: 'python', command: 'python', prefix: [] },
        { label: 'python3', command: 'python3', prefix: [] },
      ]
    : [
        { label: 'python3', command: 'python3', prefix: [] },
        { label: 'python', command: 'python', prefix: [] },
      ];
}

// { version: '3.12.4', executable } or null when that command is not a working Python.
export function probe(command, prefix = []) {
  const r = spawnSync(command, [...prefix, '-c', PROBE], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
  if (r.error || r.status !== 0) return null;
  const [version, executable] = (r.stdout || '').trim().split(/\r?\n/);
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) return null;
  return { version, executable: (executable || '').trim() || null };
}

export function recentEnough(version, [major, minor] = MINIMUM) {
  const [a, b] = version.split('.').map(Number);
  return a > major || (a === major && b >= minor);
}

// { python: { label, command, prefix, version, executable } | null, tooOld: [same, …] }
export function findPython() {
  const tooOld = [];
  for (const c of candidates()) {
    const found = probe(c.command, c.prefix);
    if (!found) continue;
    if (recentEnough(found.version)) return { python: { ...c, ...found }, tooOld };
    tooOld.push({ ...c, ...found });
  }
  return { python: null, tooOld };
}

// The interpreter inside .venv, or null when there is none.
export function venvPython(root = ROOT) {
  const dir = path.join(root, '.venv');
  const options =
    process.platform === 'win32'
      ? [path.join(dir, 'Scripts', 'python.exe'), path.join(dir, 'bin', 'python.exe')]
      : [path.join(dir, 'bin', 'python3'), path.join(dir, 'bin', 'python')];
  return options.find((p) => fs.existsSync(p)) || null;
}

// The modules that do not import with this interpreter (all of them if the interpreter does not run).
export function missingModules(python, modules = MODULES) {
  const r = spawnSync(python, ['-c', IMPORTS, ...modules], {
    encoding: 'utf8',
    timeout: 180_000, // the first matplotlib import builds its font cache
    windowsHide: true,
    env: { ...process.env, MPLBACKEND: 'Agg' },
  });
  if (r.error || r.status !== 0) return [...modules];
  const out = (r.stdout || '').trim().split(/\r?\n/).pop() || '';
  return out ? out.split(',') : [];
}

// Runs a command, showing its output as it comes (pip's progress), and keeps it for the diagnosis.
function runShown(command, args) {
  return new Promise((resolve) => {
    let output = '';
    let child;
    try {
      child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      resolve({ code: null, output: err.message });
      return;
    }
    child.stdout.on('data', (d) => {
      output += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      output += d;
      process.stderr.write(d);
    });
    child.on('error', (err) => resolve({ code: null, output: output + err.message }));
    child.on('close', (code) => resolve({ code, output }));
  });
}

function tellNoPython(tooOld) {
  if (tooOld.length) {
    const seen = tooOld.map((p) => `${p.label} ${p.version}`).join(', ');
    console.log(`✘ Python trop ancien (${seen}) : il faut Python 3.10 ou plus récent (voir le README).`);
  } else {
    const tried = candidates().map((c) => c.label).join(', ');
    console.log(`✘ Python introuvable (essayé : ${tried}) : installez Python 3.10 ou plus récent (voir le README).`);
  }
}

async function main() {
  console.log("Environnement Python de l'atelier (W4, le notebook)");
  const existed = fs.existsSync(VENV);
  let python = venvPython();
  let version;

  if (python) {
    const found = probe(python);
    if (!found) {
      console.log("✘ Le dossier .venv est cassé (son Python ne démarre plus) : supprimez-le, puis relancez npm run python.");
      return 1;
    }
    if (!recentEnough(found.version)) {
      console.log(`✘ .venv a été créé avec Python ${found.version} : supprimez-le, puis relancez npm run python.`);
      return 1;
    }
    version = found.version;
    console.log(`✔ .venv existe déjà (Python ${version}) : je le réutilise`);
  } else if (existed) {
    console.log("✘ Le dossier .venv existe mais ne contient pas de Python : supprimez-le, puis relancez npm run python.");
    return 1;
  } else {
    const { python: base, tooOld } = findPython();
    if (!base) {
      tellNoPython(tooOld);
      return 1;
    }
    console.log(`✔ Python ${base.version} trouvé (${base.label})`);
    console.log('… Création de .venv');
    const command = base.executable || base.command;
    const prefix = base.executable ? [] : base.prefix;
    const r = spawnSync(command, [...prefix, '-m', 'venv', VENV], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, windowsHide: true });
    python = venvPython();
    if (r.error || r.status !== 0 || !python) {
      // Only what this run created is removed: a half-made .venv would break the next run.
      fs.rmSync(VENV, { recursive: true, force: true, maxRetries: 3 });
      const why = `${r.stderr || ''}\n${r.stdout || ''}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      console.log(`✘ Impossible de créer .venv : ${why[0] || r.error?.message || 'raison inconnue'}`);
      if (process.platform === 'linux') console.log('  Sous Debian ou Ubuntu : sudo apt install python3-venv, puis relancez npm run python.');
      return 1;
    }
    version = base.version;
    console.log('✔ .venv créé');
  }

  if (spawnSync(python, ['-m', 'pip', '--version'], { timeout: 60_000, windowsHide: true }).status !== 0) {
    console.log('✘ pip est absent de .venv : supprimez le dossier .venv, puis relancez npm run python.');
    if (process.platform === 'linux') console.log("  Sous Debian ou Ubuntu, installez d'abord python3-venv (sudo apt install python3-venv).");
    return 1;
  }

  const hasRequirements = fs.existsSync(path.join(ROOT, REQUIREMENTS));
  const what = hasRequirements ? REQUIREMENTS.split(path.sep).join('/') : MODULES.join(', ');
  console.log(`… Installation des paquets (${what}) : une à trois minutes la première fois`);
  const install = await runShown(python, [
    '-m', 'pip', 'install', '--disable-pip-version-check',
    ...(hasRequirements ? ['-r', REQUIREMENTS] : MODULES),
  ]);
  if (install.code !== 0) {
    if (NETWORK.test(install.output)) {
      console.log("✘ Pas d'accès à Internet (ou au repo de paquets PyPI) : reconnectez-vous, puis relancez npm run python.");
      console.log("  Derrière le proxy d'une entreprise : définissez HTTPS_PROXY, puis relancez.");
    } else {
      console.log("✘ L'installation des paquets a échoué (voir les messages de pip ci-dessus), puis relancez npm run python.");
    }
    return 1;
  }

  const missing = missingModules(python);
  if (missing.length) {
    console.log(`✘ Paquets toujours introuvables dans .venv : ${missing.join(', ')}. Relancez npm run python.`);
    return 1;
  }
  console.log(`✔ Paquets prêts : ${MODULES.join(', ')}`);
  console.log('');
  console.log('Dans VS Code :');
  console.log(`  • Interpréteur : palette de commandes → « Python: Select Interpreter » → ${python}`);
  console.log(`  • Notebook : bouton « Select Kernel » → .venv (Python ${version})`);
  return 0;
}

function isMain(url) {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) process.exitCode = await main();
