// A plugin's own setup: the Node and Python packages it needs and the files it downloads, all in its data
// folder (PLUGIN_DATA, kept across updates as Agent Plugins §9.1 asks), never for the whole computer; and
// the programs it needs looked for on this computer. npm installs without the packages' own install
// scripts. Python packages go in an environment of the plugin's own made by uv (python3 -m venv and pip
// when uv is not here); on a computer with an NVIDIA GPU, its `pipNvidia` packages too (CUDA's libraries, a GPU
// build), whose libraries its servers then find. What its servers get: its environment's commands first on PATH,
// VIRTUAL_ENV, NODE_PATH.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PluginRequires, SetupState } from '../../shared/plugins.ts';
import { hasCommand } from '../apps/env.ts';

export { hasCommand };

const SETUP_FILE = '.naget-setup.json';

/** An NVIDIA GPU with its driver: Linux's driver says its version; elsewhere nvidia-smi is there. A Mac never has one. */
let nvidia: boolean | undefined;
export function hasNvidia(): boolean {
  if (process.env.HYDOR_TEST_NVIDIA) return process.env.HYDOR_TEST_NVIDIA === '1';
  if (nvidia !== undefined) return nvidia;
  if (process.platform === 'linux') nvidia = fs.existsSync('/proc/driver/nvidia/version');
  else if (process.platform === 'win32') nvidia = fs.existsSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'nvidia-smi.exe')) || hasCommand('nvidia-smi');
  else nvidia = false;
  return nvidia;
}

/** The packages a plugin gets for an NVIDIA GPU on this computer: its `pipNvidia` when there is one, else none. */
export const gpuPip = (r: PluginRequires): string[] => (r.pip.length && r.pipNvidia?.length && hasNvidia() ? r.pipNvidia : []);

export const needsSetup = (r: PluginRequires) => !!(Object.keys(r.npm).length || r.pip.length || r.files.length);
export const setupHash = (r: PluginRequires) => {
  const gpu = gpuPip(r);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ npm: r.npm, pip: r.pip, python: r.python ?? '', files: r.files, ...(gpu.length ? { pipNvidia: gpu } : {}) }))
    .digest('hex')
    .slice(0, 16);
};

interface Saved {
  hash: string;
  ok: boolean;
  at: number;
  error?: string;
  log?: string;
}

function saved(data: string): Saved | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(data, SETUP_FILE), 'utf8')) as Saved;
  } catch {
    return null;
  }
}

function write(data: string, s: Saved) {
  try {
    fs.mkdirSync(data, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(data, SETUP_FILE), JSON.stringify(s));
  } catch {}
}

/** How a plugin's setup stands (`busy`: a job is setting it up now). */
export function setupOf(r: PluginRequires, data: string, busy: boolean): { state: SetupState; error?: string; at?: number; log?: string } {
  if (!needsSetup(r)) return { state: 'none' };
  if (busy) return { state: 'installing' };
  const s = saved(data);
  if (!s) return { state: 'outdated' };
  return { state: s.hash !== setupHash(r) ? 'outdated' : s.ok ? 'ready' : 'failed', error: s.error, at: s.at, log: s.log };
}

export const venvDir = (data: string) => path.join(data, 'venv');
export const nodeDir = (data: string) => path.join(data, 'node');
export const filesDir = (data: string) => path.join(data, 'files');

/** The environment a plugin's servers (and the commands agents run for it) get: its own commands first. */
export function setupEnv(r: PluginRequires, root: string, data: string): Record<string, string> {
  const bins: string[] = [];
  // Python writes no __pycache__ into a plugin's folder (a built-in one is the app's, and may be read-only).
  const out: Record<string, string> = { PLUGIN_ROOT: root, PLUGIN_DATA: data, PYTHONDONTWRITEBYTECODE: '1' };
  if (r.pip.length) {
    out.VIRTUAL_ENV = venvDir(data);
    bins.push(path.join(venvDir(data), 'bin'));
    // CUDA's libraries from its pipNvidia packages (nvidia/<lib>/lib, on Windows nvidia/<lib>/bin), found first.
    const libs = gpuPip(r).length ? nvidiaLibs(venvDir(data)) : [];
    if (libs.length && process.platform === 'win32') bins.push(...libs);
    else if (libs.length) out.LD_LIBRARY_PATH = [...libs, process.env.LD_LIBRARY_PATH ?? ''].filter(Boolean).join(path.delimiter);
  }
  if (Object.keys(r.npm).length) {
    out.NODE_PATH = path.join(nodeDir(data), 'node_modules');
    bins.push(path.join(nodeDir(data), 'node_modules', '.bin'));
  }
  out.PATH = [...bins, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter);
  return out;
}

/** The folders of CUDA's libraries that NVIDIA's pip packages put in an environment (nvidia/cublas/lib…). */
export function nvidiaLibs(venv: string): string[] {
  const sites: string[] = [];
  try {
    if (process.platform === 'win32') sites.push(path.join(venv, 'Lib', 'site-packages'));
    else for (const v of fs.readdirSync(path.join(venv, 'lib'))) if (v.startsWith('python')) sites.push(path.join(venv, 'lib', v, 'site-packages'));
  } catch {}
  const out: string[] = [];
  for (const site of sites) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(path.join(site, 'nvidia'));
    } catch {}
    for (const n of names.sort()) {
      const dir = path.join(site, 'nvidia', n, process.platform === 'win32' ? 'bin' : 'lib');
      if (fs.existsSync(dir)) out.push(dir);
    }
  }
  return out;
}

/** A line for agents: where a plugin's packages and files are. */
export function setupLine(title: string, r: PluginRequires, data: string): string | null {
  const parts: string[] = [];
  if (r.pip.length) parts.push(`its Python (with ${r.pip.map((p) => p.split(/[<>=!~\s[;]/)[0]).join(', ')}) is ${path.join(venvDir(data), 'bin', 'python')}`);
  if (Object.keys(r.npm).length) parts.push(`its Node packages (${Object.keys(r.npm).join(', ')}) are in ${path.join(nodeDir(data), 'node_modules')} (set NODE_PATH to that folder)`);
  if (r.files.length) parts.push(`its downloaded files are in ${filesDir(data)}`);
  return parts.length ? `The ${title} plugin is set up: ${parts.join('; ')}. Use these rather than installing the same packages again.` : null;
}

// ---- running the setup ------------------------------------------------------------------------------

export interface StepReporter {
  /** A step starts (its label as the page shows it). */
  step(label: string): void;
  /** Output to keep in the log. */
  log(text: string): void;
}

/** How setup commands are run and files fetched; a test puts stand-ins here. */
export const setupTesting: {
  run: ((cmd: string, args: string[], cwd: string) => Promise<{ code: number; out: string }>) | null;
  fetch: ((url: string) => Promise<Uint8Array>) | null;
} = { run: null, fetch: null };

function run(cmd: string, args: string[], cwd: string, onOut: (s: string) => void, timeoutMs = 30 * 60_000): Promise<{ code: number; out: string }> {
  if (setupTesting.run) return setupTesting.run(cmd, args, cwd);
  return new Promise((resolve) => {
    let out = '';
    // No GPU for installs, and no prompts: whatever would ask fails at once.
    const p = spawn(cmd, args, { cwd, env: { ...process.env, npm_config_update_notifier: 'false', PIP_DISABLE_PIP_VERSION_CHECK: '1', CUDA_VISIBLE_DEVICES: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const keep = (b: Buffer) => {
      const s = b.toString();
      out = (out + s).slice(-40_000);
      onOut(s);
    };
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 127, out: `${out}\n${e.message}` });
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out });
    });
  });
}

async function download(url: string, dest: string, sha256: string | undefined, rep: StepReporter) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.part`;
  const hash = crypto.createHash('sha256');
  if (setupTesting.fetch) {
    const b = await setupTesting.fetch(url);
    hash.update(b);
    fs.writeFileSync(tmp, b);
  } else {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60 * 60_000) });
    if (!r.ok || !r.body) throw new Error(`${url} answered ${r.status}`);
    const total = Number(r.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(tmp);
    let got = 0;
    let shown = 0;
    const reader = r.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        got += value.length;
        if (!out.write(value)) await new Promise<void>((res) => out.once('drain', () => res()));
        if (total && got / total - shown >= 0.1) {
          shown = Math.floor((got / total) * 10) / 10;
          rep.log(`  ${Math.round(shown * 100)}% of ${(total / 1e6).toFixed(1)} MB\n`);
        }
      }
    } finally {
      await new Promise<void>((res) => out.end(() => res()));
    }
  }
  const digest = hash.digest('hex');
  if (sha256 && digest !== sha256) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`${path.basename(dest)} did not match its SHA-256 (got ${digest.slice(0, 12)}…, expected ${sha256.slice(0, 12)}…)`);
  }
  fs.renameSync(tmp, dest);
}

/**
 * Sets a plugin up: its Node packages, its Python environment and packages, its files. Writes the result
 * into its data folder (state, error, the log's end); throws with the reason when a step fails.
 */
export async function runSetup(name: string, r: PluginRequires, data: string, rep: StepReporter): Promise<void> {
  fs.mkdirSync(data, { recursive: true, mode: 0o700 });
  const hash = setupHash(r);
  const log: string[] = [];
  const out = (s: string) => {
    log.push(s);
    rep.log(s);
  };
  const step = async (label: string, cmd: string, args: string[], cwd: string) => {
    rep.step(label);
    out(`$ ${[cmd, ...args].join(' ')}\n`);
    const res = await run(cmd, args, cwd, (s) => rep.log(s));
    log.push(res.out.trim());
    if (res.code !== 0) throw new Error(`${label} failed (${path.basename(cmd)} ended with ${res.code})`);
  };
  try {
    if (Object.keys(r.npm).length) {
      const dir = nodeDir(data);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: `hydor-plugin-${name.replace(/\./g, '-')}`, private: true, dependencies: r.npm }, null, 2)}\n`);
      await step(`Installing Node packages: ${Object.keys(r.npm).join(', ')}`, 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev'], dir);
    }
    if (r.pip.length) {
      const venv = venvDir(data);
      const py = path.join(venv, 'bin', 'python');
      const pkgs = r.pip.map((p) => p.split(/[<>=!~\s[;]/)[0]).join(', ');
      const uv = hasCommand('uv') || setupTesting.run;
      if (uv) {
        if (!fs.existsSync(py)) await step('Making its Python environment', 'uv', ['venv', '--allow-existing', ...(r.python ? ['--python', r.python] : []), venv], data);
        await step(`Installing Python packages: ${pkgs}`, 'uv', ['pip', 'install', '--python', py, ...r.pip], data);
      } else {
        if (!fs.existsSync(py)) await step('Making its Python environment', 'python3', ['-m', 'venv', venv], data);
        await step(`Installing Python packages: ${pkgs}`, py, ['-m', 'pip', 'install', ...r.pip], data);
      }
      // For the NVIDIA GPU: when this fails, the plugin still works, on the CPU, and the log says why.
      const gpu = gpuPip(r);
      if (gpu.length) {
        const names = gpu.map((p) => p.split(/[<>=!~\s[;]/)[0]).join(', ');
        try {
          if (uv) await step(`Installing what it needs to run on the NVIDIA GPU: ${names}`, 'uv', ['pip', 'install', '--python', py, ...gpu], data);
          else await step(`Installing what it needs to run on the NVIDIA GPU: ${names}`, py, ['-m', 'pip', 'install', ...gpu], data);
        } catch (e) {
          out(`${(e as Error).message}: it runs on the CPU.\n`);
        }
      }
    }
    for (const f of r.files) {
      const dest = path.join(filesDir(data), f.path);
      if (fs.existsSync(dest) && !f.sha256) continue;
      if (fs.existsSync(dest) && f.sha256) {
        const have = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
        if (have === f.sha256) continue;
      }
      rep.step(`Downloading ${path.basename(f.path)}`);
      out(`↓ ${f.url}\n`);
      await download(f.url, dest, f.sha256, rep);
    }
    write(data, { hash, ok: true, at: Date.now(), log: log.join('\n').slice(-8000) });
  } catch (e) {
    write(data, { hash, ok: false, at: Date.now(), error: (e as Error).message, log: log.join('\n').slice(-8000) });
    throw e;
  }
}
