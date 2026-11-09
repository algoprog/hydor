// Search by meaning: a Python worker (embed_worker.py) runs the embedding model, lightonai/mDenseOn, on this
// computer: on a GPU in fp16 when there is one (an NVIDIA GPU with room, or a Mac's own, Apple silicon's, through
// Metal), else on the CPU, and on the CPU too when the GPU fails its first try, saying why (Settings can keep it on
// the CPU, to leave the GPUs to other work). It is on unless Settings → Memory turns it off (or, never set there, HYDOR_EMBED=off),
// so memory, the Library and the rest are searched by words and meaning together. It sets up a private
// environment in the data folder once (PyTorch, its CPU build when there is no NVIDIA GPU, and Transformers): on
// its own a minute after the app first starts, at once when someone turns it on; the model downloads on first
// start (1.2 GB).
// On an NVIDIA GPU the worker stays loaded. On a CPU, and on a Mac's GPU (which shares the computer's memory), it
// starts when needed, only when enough memory is free, and quits after a few idle minutes, so a computer with 8 GB
// is never short. Until it answers, memory is
// searched by words alone, and notes get their vectors in the background once it does.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { MeaningHeld, MeaningState } from '../../shared/memory.ts';
import { APP_ROOT, config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { which } from '../documents/tools.ts';
import { availableMemory } from '../models/machine.ts';
import { onEntriesChanged } from './store.ts';
import { DIM, MODEL, missingVectors, setVectors, vectorCounts } from './vectors.ts';

export type Kind = 'query' | 'document';
export type MeaningDevice = 'auto' | 'cpu';

const dir = () => path.join(config.dataDir, 'memory');
const venv = () => path.join(dir(), 'venv');
/** The Python that runs the worker: one given (HYDOR_EMBED_PYTHON, with PyTorch and Transformers), else the private one. */
const python = () => process.env.HYDOR_EMBED_PYTHON || path.join(venv(), ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
/** What the environment holds: another list means setting it up again. */
const PACKAGES = 'torch transformers>=5.6,<6';
const WORKER = path.join(APP_ROOT, 'server/memory/embed_worker.py');
/** Free memory needed to start the worker: on the CPU (measured: 1.4 GB once loaded, 2.4 GB at most while loading,
 * half of that the model's file, which the system can drop), or with a GPU (its weights go to the GPU). */
const NEED_CPU_MB = 2560;
const NEED_GPU_MB = 1536;
/** Free disk needed to set up: PyTorch's CPU build or its CUDA one, with the model. */
const DISK_CPU_GB = 3;
const DISK_GPU_GB = 9;
/** On a CPU, the worker quits after this long without work. */
const IDLE_CPU_MS = 5 * 60_000;

/** Turned on or off in Settings → Memory; never set there, on unless HYDOR_EMBED=off (a test's or a demo's app). */
const meaningChosen = (db: DB): boolean | null => {
  const v = kvGet(db, 'memory.meaning');
  return v === '1' ? true : v === '0' ? false : null;
};
export const meaningOn = (db: DB) => meaningChosen(db) ?? process.env.HYDOR_EMBED !== 'off';
export const meaningDevice = (db: DB): MeaningDevice => (kvGet(db, 'memory.meaning.device') === 'cpu' ? 'cpu' : 'auto');
const hasNvidia = () => fs.existsSync('/proc/driver/nvidia/version');
/** A Mac with Apple silicon, whose own GPU the model runs on. */
const appleSilicon = () => process.platform === 'darwin' && process.arch === 'arm64';
const envReady = () => (process.env.HYDOR_EMBED_PYTHON ? fs.existsSync(python()) : fs.existsSync(python()) && readText(path.join(venv(), '.packages')) === PACKAGES);

function readText(f: string): string | null {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
}

function freeDiskGb(p: string): number {
  try {
    const s = fs.statfsSync(p);
    return (s.bavail * s.bsize) / 2 ** 30;
  } catch {
    return Infinity;
  }
}

/** Where the model is kept: Hugging Face's cache, in the data folder inside a container (so it lasts). */
function hfHome(): string | undefined {
  if (process.env.HF_HOME) return process.env.HF_HOME;
  return fs.existsSync('/.dockerenv') ? path.join(dir(), 'hf') : undefined;
}

function modelCached(): boolean {
  const hub = process.env.HF_HUB_CACHE ?? path.join(hfHome() ?? path.join(os.homedir(), '.cache', 'huggingface'), 'hub');
  const snaps = path.join(hub, `models--${MODEL.replace('/', '--')}`, 'snapshots');
  try {
    return fs.readdirSync(snaps).some((s) => fs.existsSync(path.join(snaps, s, 'model.safetensors')));
  } catch {
    return false;
  }
}

// ---- the worker ---------------------------------------------------------------------------------

interface Pending {
  resolve(v: Float32Array[]): void;
  reject(e: Error): void;
  timer: NodeJS.Timeout;
}

interface Worker {
  proc: ChildProcess;
  ready: boolean;
  device?: string;
  name?: string;
  rss?: number;
  /** Why it runs on the CPU though a GPU was there: the GPU failed its first try. */
  fallback?: string;
  pending: Map<number, Pending>;
  seq: number;
  idle?: NodeJS.Timeout;
}

let worker: Worker | null = null;
let starting: Promise<Worker | null> | null = null;
/** When the model began loading (0: it is not loading), for how soon it can answer (readyIn). */
let loadStarted = 0;
let status: MeaningState['status'] = 'off';
let detail: string | undefined;
let lastDevice: string | undefined;
let settingUp: Promise<void> | null = null;
const crashes: number[] = [];
const stderrTail: string[] = [];

/** Tests put a stand-in here: texts in, unit vectors out. */
let stub: ((texts: string[], kind: Kind) => Promise<Float32Array[]>) | null = null;
export const setEmbedderForTests = (fn: typeof stub) => {
  stub = fn;
  asked.clear();
  asking.clear();
};

function workerEnv(db: DB): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'XDG_CACHE_HOME', 'HF_HUB_CACHE', 'HF_TOKEN', 'CUDA_VISIBLE_DEVICES', 'HYDOR_EMBED_THREADS'];
  const env: NodeJS.ProcessEnv = Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
  Object.assign(env, { PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1', TOKENIZERS_PARALLELISM: 'false', TRANSFORMERS_VERBOSITY: 'error' });
  const home = hfHome();
  if (home) env.HF_HOME = home;
  if (meaningDevice(db) === 'cpu') env.HYDOR_EMBED_DEVICE = 'cpu';
  else if (process.env.HYDOR_EMBED_DEVICE) env.HYDOR_EMBED_DEVICE = process.env.HYDOR_EMBED_DEVICE;
  return env;
}

/** Too little memory was free the last time the worker was wanted: how much, and how much it needs (MB). */
let short: { free: number; need: number } | null = null;

/** The worker, started when it is not running (and memory allows); null when it cannot be now. */
function ensureWorker(db: DB): Promise<Worker | null> {
  if (worker?.ready) return Promise.resolve(worker);
  if (starting) return starting;
  if (!meaningOn(db) || !envReady() || status === 'failed') return Promise.resolve(null);
  starting = (async () => {
    const cpu = meaningDevice(db) === 'cpu' || !hasNvidia();
    const need = cpu ? NEED_CPU_MB : NEED_GPU_MB;
    const free = (await availableMemory()) / 2 ** 20;
    if (free < need) {
      short = { free, need };
      detail = `Waiting for memory: ${(free / 1024).toFixed(1)} GB free, it needs ${(need / 1024).toFixed(1)} GB. Until then notes are found by their words.`;
      return null;
    }
    short = null;
    return startWorker(db);
  })().finally(() => {
    starting = null;
  });
  return starting;
}

/** Starts the worker, which answers once its model is loaded (downloaded the first time); null when it could not. */
function startWorker(db: DB): Promise<Worker | null> {
  return new Promise<Worker | null>((resolve) => {
    const first = !modelCached();
    status = 'starting';
    detail = first ? 'Downloading the model (1.2 GB, once)' : 'Loading the model';
    const proc = spawn(python(), ['-I', WORKER], { stdio: ['pipe', 'pipe', 'pipe'], env: workerEnv(db) });
    const w: Worker = { proc, ready: false, pending: new Map(), seq: 0 };
    worker = w;
    const began = (loadStarted = Date.now());
    const giveUp = setTimeout(() => (fail(w, 'The model took too long to load'), resolve(null)), first ? 30 * 60_000 : 5 * 60_000);
    proc.stderr!.on('data', (b: Buffer) => {
      for (const l of b.toString().split('\n')) if (l.trim()) stderrTail.push(l.trim().slice(0, 300));
      stderrTail.splice(0, Math.max(0, stderrTail.length - 20));
    });
    readline.createInterface({ input: proc.stdout! }).on('line', (line) => {
      let m: any;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      if (m.ready) {
        clearTimeout(giveUp);
        // How long a load takes here (a download's first excepted), for the next one's estimate.
        if (!first) kvSet(db, LOAD_MS_KEY, String(Date.now() - began));
        if (loadStarted === began) loadStarted = 0;
        Object.assign(w, { ready: true, device: m.device, name: m.name, rss: m.rss, fallback: typeof m.fallback === 'string' ? m.fallback : undefined });
        lastDevice = m.name;
        status = 'ready';
        detail = undefined;
        idleLater(w);
        resolve(w);
      } else if (m.status === 'loading' && !first) detail = 'Loading the model';
      else if (m.id != null) {
        const p = w.pending.get(m.id);
        if (!p) return;
        w.pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.rss) w.rss = m.rss;
        if (m.error) p.reject(new Error(m.error));
        else p.resolve(vectorsOf(m.vectors, m.dim));
      }
    });
    proc.on('error', (e) => (clearTimeout(giveUp), fail(w, e.message), resolve(null)));
    proc.on('exit', (code, signal) => {
      clearTimeout(giveUp);
      const was = w.ready;
      fail(w, signal === 'SIGTERM' ? null : `The model's worker stopped (${signal ?? `exit ${code}`})${stderrTail.length ? `: ${stderrTail.slice(-2).join(' ')}` : ''}`, was);
      resolve(null);
    });
  });
}

function vectorsOf(b64: string, dim: number): Float32Array[] {
  if (dim !== DIM) throw new Error(`The model gives ${dim} numbers, not ${DIM}`);
  const buf = Buffer.from(b64 ?? '', 'base64');
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const out: Float32Array[] = [];
  for (let i = 0; i < all.length; i += DIM) out.push(all.slice(i, i + DIM));
  return out;
}

/** The worker went: what it was doing fails. A crash is tried again, unless it keeps happening. */
function fail(w: Worker, why: string | null, wasReady = false) {
  for (const p of w.pending.values()) clearTimeout(p.timer), p.reject(new Error(why ?? 'The model stopped'));
  w.pending.clear();
  clearTimeout(w.idle);
  if (worker === w) (worker = null), (loadStarted = 0);
  try {
    w.proc.kill('SIGTERM');
  } catch {}
  if (!why) return;
  const now = Date.now();
  crashes.push(now);
  while (crashes.length && crashes[0] < now - 10 * 60_000) crashes.shift();
  if (crashes.length >= 3 || !wasReady) {
    status = 'failed';
    detail = why;
  } else detail = why;
}

/** On a CPU the worker quits when it has had nothing to do for a while. */
function idleLater(w: Worker) {
  clearTimeout(w.idle);
  if (w.device?.startsWith('cuda')) return;
  w.idle = setTimeout(() => {
    if (w.pending.size) return idleLater(w);
    if (worker === w) worker = null;
    w.proc.stdin?.end();
    setTimeout(() => w.proc.kill('SIGTERM'), 5000).unref();
  }, IDLE_CPU_MS);
  w.idle.unref?.();
}

function ask(w: Worker, texts: string[], kind: Kind, timeoutMs: number): Promise<Float32Array[]> {
  return new Promise((resolve, reject) => {
    const id = ++w.seq;
    const timer = setTimeout(() => {
      w.pending.delete(id);
      reject(new Error('The model took too long'));
    }, timeoutMs);
    w.pending.set(id, { resolve, reject, timer });
    w.proc.stdin!.write(JSON.stringify({ id, kind, texts }) + '\n');
    idleLater(w);
  });
}

/**
 * Vectors for texts, or null when search by meaning cannot answer now: it is off, not set up, or (unless
 * `wait`) not running. With `wait` the worker is started when memory allows, which on a CPU takes seconds.
 */
export async function embed(db: DB, texts: string[], kind: Kind, o: { wait?: boolean; timeoutMs?: number } = {}): Promise<Float32Array[] | null> {
  if (!texts.length) return [];
  if (stub) return stub(texts, kind);
  if (!meaningOn(db)) return null;
  const w = worker?.ready ? worker : o.wait ? await ensureWorker(db) : null;
  if (!w) {
    // Not running: it starts now for what comes next (when memory allows), without keeping this one waiting.
    if (!o.wait) void ensureWorker(db);
    return null;
  }
  try {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 64) out.push(...(await ask(w, texts.slice(i, i + 64), kind, o.timeoutMs ?? 60_000)));
    return out;
  } catch {
    return null;
  }
}

/** One query's vector, or null (see embed). */
export async function queryVector(db: DB, text: string, o: { wait?: boolean; timeoutMs?: number } = {}): Promise<Float32Array | null> {
  const v = await embed(db, [text.slice(0, 2000)], 'query', o);
  return v?.[0] ?? null;
}

/** Search by meaning can answer without starting anything (stand-in included). */
export const meaningReady = () => !!stub || !!worker?.ready;

/**
 * How long what an agent starts with waits for the model, at most, and only when it is already loading and should be up
 * by then. Loading takes seconds on a CPU (12 s on a busy machine), which no one should wait for at the start of a
 * session: a model not running is started for what comes next, and this request's notes and skills are found by their
 * words. The start page asks for the model as someone begins a message (warmMeaning), and a scheduled task due soon
 * has it started first, so it is usually up.
 */
export const START_WAIT_MS = 1500;
/** Where the last load's length is kept (ms), for how soon a loading model can answer. */
const LOAD_MS_KEY = 'memory.meaning.loadMs';
/** A request's vector, or none when the model could not give it then (kept less long, so a later start asks again). */
const asked = new Map<string, { at: number; v: Float32Array | null }>();
const asking = new Map<string, Promise<Float32Array | null>>();

/** How soon the model can answer (ms): 0 when it is loaded, by the last load's length while it loads, Infinity when it is not loading. */
function readyIn(db: DB): number {
  if (stub || worker?.ready) return 0;
  if (!worker || !loadStarted) return Infinity;
  const took = Number(kvGet(db, LOAD_MS_KEY)) || 12_000;
  return Math.max(0, loadStarted + took - Date.now());
}

function keepVector(t: string, v: Float32Array | null) {
  asked.delete(t);
  asked.set(t, { at: Date.now(), v });
  if (asked.size > 20) asked.delete(asked.keys().next().value!);
}

/**
 * A request's vector, for what an agent starts with (the notes and skills that fit it): at once when the model is
 * loaded, after a short wait when it is about to be (START_WAIT_MS), else null and the model starts for what comes
 * next. Null too when search by meaning is off. The same request again soon is answered from memory, a vector for a
 * minute and none for 15 s, so its notes and its skills share one and the second never waits again.
 */
export async function requestVector(db: DB, text: string, waitMs = START_WAIT_MS): Promise<Float32Array | null> {
  const t = text.trim().slice(0, 2000);
  if (!t || (!stub && !meaningOn(db))) return null;
  const hit = asked.get(t);
  if (hit && Date.now() - hit.at < (hit.v ? 60_000 : 15_000)) return hit.v;
  const going = asking.get(t);
  if (going) return going;
  const soon = readyIn(db);
  if (soon > waitMs) {
    void ensureWorker(db);
    keepVector(t, null);
    return null;
  }
  // Loaded, or nearly: the vector itself takes tens of milliseconds, more behind a batch of notes being embedded.
  const budget = soon + 3000;
  const p = (async () => {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), budget);
      timer.unref?.();
    });
    const v = await Promise.race([queryVector(db, t, { wait: true, timeoutMs: budget }).catch(() => null), late]);
    clearTimeout(timer);
    keepVector(t, v);
    return v;
  })().finally(() => asking.delete(t));
  asking.set(t, p);
  return p;
}

/**
 * Someone is about to ask something (the start page's message box has their attention), or a scheduled task is due:
 * the model starts now, when enough memory is free, so it answers by the time the session starts; one already loaded
 * stays loaded a while longer. True when it is loaded now.
 */
export function warmMeaning(db: DB): boolean {
  if (stub) return true;
  if (!meaningOn(db)) return false;
  if (worker?.ready) {
    idleLater(worker);
    return true;
  }
  void ensureWorker(db);
  return false;
}

// ---- vectors for the notes ----------------------------------------------------------------------

let filling = false;
let again = false;
/** The counts Settings shows, read at most every few seconds (fresh after vectors are added). */
let counted: { at: number; v: { embedded: number; total: number } } | null = null;
let fillTimer: NodeJS.Timeout | undefined;
let retryTimer: NodeJS.Timeout | undefined;

/** Soon: vectors for the notes without one. */
export function scheduleBackfill(db: DB, ms = 2000) {
  if (!meaningOn(db) && !stub) return;
  clearTimeout(fillTimer);
  fillTimer = setTimeout(() => void backfill(db), ms);
  fillTimer.unref?.();
}

export async function backfill(db: DB): Promise<number> {
  if (filling) {
    again = true;
    return 0;
  }
  filling = true;
  let done = 0;
  try {
    for (;;) {
      const batch = missingVectors(db, 64);
      if (!batch.length) break;
      const vecs = await embed(db, batch.map((b) => b.text), 'document', { wait: true, timeoutMs: 180_000 });
      if (!vecs || vecs.length !== batch.length) {
        // Not now (memory, a failure): try again in a while.
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => scheduleBackfill(db, 0), 10 * 60_000);
        retryTimer.unref?.();
        break;
      }
      setVectors(
        db,
        batch.map((b, i) => ({ id: b.id, vector: vecs[i] })),
      );
      done += batch.length;
      await new Promise((r) => setImmediate(r));
    }
  } finally {
    filling = false;
    if (done) counted = null;
    if (again) {
      again = false;
      scheduleBackfill(db);
    }
  }
  return done;
}

let watching = false;
/** Once: new and changed notes get their vectors soon after. */
export function watchNotes(db: DB) {
  if (watching) return;
  watching = true;
  onEntriesChanged((d) => d === db && scheduleBackfill(db));
}

// ---- setting it up ------------------------------------------------------------------------------

function run(cmd: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    detail = label;
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });
    const tail: string[] = [];
    const take = (b: Buffer) => {
      for (const l of b.toString().split('\n')) if (l.trim()) tail.push(l.trim().slice(0, 300));
      tail.splice(0, Math.max(0, tail.length - 8));
    };
    p.stdout!.on('data', take);
    p.stderr!.on('data', take);
    p.on('error', (e) => reject(e));
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${label} failed${tail.length ? `: ${tail.slice(-3).join(' ')}` : ''}`))));
  });
}

/**
 * The system's Python 3, to make the private environment with. On a Mac, Homebrew's or python.org's before Apple's,
 * and Apple's /usr/bin/python3 only with its developer tools there: without them it asks to install them.
 */
function systemPython(): string | null {
  if (process.platform === 'win32') return which('python') ?? which('py');
  if (process.platform === 'darwin') {
    const own = ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/Library/Frameworks/Python.framework/Versions/Current/bin/python3'].find((p) => fs.existsSync(p));
    if (own) return own;
    const sys = which('python3');
    const tools = ['/Library/Developer/CommandLineTools/usr/bin/python3', '/Applications/Xcode.app/Contents/Developer/usr/bin/python3'].some((p) => fs.existsSync(p));
    return sys === '/usr/bin/python3' && !tools ? null : sys;
  }
  return which('python3');
}

/** Makes the private environment with PyTorch and Transformers (once; again when the list changes). */
function setup(db: DB): Promise<void> {
  if (settingUp) return settingUp;
  settingUp = (async () => {
    status = 'setting-up';
    detail = 'Getting ready';
    try {
      fs.mkdirSync(dir(), { recursive: true });
      const gpu = hasNvidia() && meaningDevice(db) === 'auto';
      const disk = freeDiskGb(dir());
      if (disk < (gpu ? DISK_GPU_GB : DISK_CPU_GB)) throw new Error(`Not enough disk space: ${disk.toFixed(1)} GB free, setting up needs about ${gpu ? DISK_GPU_GB : DISK_CPU_GB} GB.`);
      const uv = which('uv', [path.join(os.homedir(), '.local/bin/uv'), path.join(os.homedir(), '.cargo/bin/uv')]);
      if (uv) {
        // (On a Mac, a Python of uv's own: Apple's stand-in asks to install its developer tools. PyTorch's CPU index
        // has the very same Mac builds as PyPI, which run on the Mac's GPU through Metal.)
        const own = process.platform === 'darwin' ? ['--python-preference', 'only-managed'] : [];
        if (!fs.existsSync(python())) await run(uv, ['venv', '--quiet', ...own, '--python', '>=3.10', venv()], 'Making a private Python environment');
        await run(uv, ['pip', 'install', '--quiet', '--python', python(), `--torch-backend=${gpu ? 'auto' : 'cpu'}`, 'torch', 'transformers>=5.6,<6'], `Installing PyTorch${gpu || process.platform === 'darwin' ? '' : ' (CPU build)'} and Transformers: a few minutes`);
      } else {
        // Windows: python.exe from python.org, else its py launcher.
        const sys = systemPython();
        if (!sys && process.platform === 'win32') throw new Error('Python 3 is not installed on this computer, and search by meaning needs it (python.org, or: winget install Python.Python.3.12).');
        if (!sys && process.platform === 'darwin') throw new Error('Python 3 is not installed on this computer, and search by meaning needs it (python.org, or Homebrew: brew install python).');
        if (!sys) throw new Error('Python 3 is not installed on this computer, and search by meaning needs it (Debian/Ubuntu: sudo apt install python3 python3-venv).');
        if (!fs.existsSync(python())) await run(sys, ['-c', 'import sys, venv; sys.exit(0 if sys.version_info >= (3, 10) else 1)'], 'Checking Python (3.10 or newer)');
        if (!fs.existsSync(python())) await run(sys, ['-m', 'venv', venv()], 'Making a private Python environment');
        await run(python(), ['-m', 'pip', 'install', '--quiet', 'torch', ...(gpu ? [] : ['--index-url', 'https://download.pytorch.org/whl/cpu'])], `Installing PyTorch${gpu || process.platform === 'darwin' ? '' : ' (CPU build)'}: a few minutes`);
        await run(python(), ['-m', 'pip', 'install', '--quiet', 'transformers>=5.6,<6'], 'Installing Transformers');
      }
      fs.writeFileSync(path.join(venv(), '.packages'), PACKAGES);
      status = 'ready';
      detail = undefined;
    } catch (e) {
      status = 'failed';
      detail = (e as Error).message;
    }
  })().finally(() => {
    settingUp = null;
  });
  return settingUp;
}

/** How long after the app starts it sets up search by meaning on its own (on by default, never set up). */
const SETUP_AFTER_MS = 60_000;
let setupLater: NodeJS.Timeout | undefined;

/**
 * On: set up when needed, load the model on a GPU now, and fill in the notes' vectors. On by default and never set up,
 * it sets up a minute later (`now`: at once, as when someone turns it on), out of the way of the app's first start.
 */
export async function kick(db: DB, o: { now?: boolean } = {}) {
  if (!meaningOn(db)) return;
  if (!envReady() && !o.now && meaningChosen(db) === null && !settingUp) {
    clearTimeout(setupLater);
    setupLater = setTimeout(() => void kick(db, { now: true }).catch((e) => console.warn(`[memory] search by meaning: ${(e as Error).message}`)), SETUP_AFTER_MS);
    setupLater.unref?.();
    return;
  }
  if (!envReady()) await setup(db);
  if (!envReady()) return;
  if (status !== 'failed') status = 'ready';
  if (hasNvidia() && meaningDevice(db) === 'auto') await ensureWorker(db);
  scheduleBackfill(db, 0);
}

function stopWorker() {
  const w = worker;
  if (!w) return;
  worker = null;
  fail(w, null);
}

/** Turns search by meaning on or off, or moves it (CPU only, or the best place). */
export function setMeaning(db: DB, p: { on?: boolean; device?: MeaningDevice; retry?: boolean }) {
  if (p.device && p.device !== meaningDevice(db)) {
    kvSet(db, 'memory.meaning.device', p.device);
    stopWorker();
  }
  if (typeof p.on === 'boolean') {
    kvSet(db, 'memory.meaning', p.on ? '1' : '0');
    if (!p.on) {
      stopWorker();
      status = 'off';
      detail = undefined;
      short = null;
    }
  }
  if (p.retry || p.on) {
    if (status === 'failed') status = 'off';
    crashes.length = 0;
  }
  void kick(db, { now: true });
}

/** Search by meaning is on and set up, but its model is not running: a search now starts it, and one a few seconds later has it. */
export const meaningStarting = (db: DB) => meaningOn(db) && !stub && !worker?.ready && envReady() && status !== 'failed';

export function meaningState(db: DB): MeaningState {
  if (!counted || Date.now() - counted.at > 5000) counted = { at: Date.now(), v: vectorCounts(db) };
  const on = meaningOn(db);
  const s: MeaningState['status'] = !on ? 'off' : status === 'off' ? (envReady() ? 'ready' : 'setting-up') : status;
  let d = detail;
  if (on && s === 'ready' && !d)
    d = worker?.ready
      ? `Loaded on ${worker.name ?? worker.device}${worker.fallback ? ` (the GPU failed its first try: ${worker.fallback})` : ''}`
      : meaningDevice(db) !== 'cpu' && appleSilicon()
        ? 'Starts on this Mac’s GPU when needed, and stops after a few idle minutes'
        : meaningDevice(db) === 'cpu' || !hasNvidia()
          ? 'Starts on the CPU when needed, and stops after a few idle minutes'
          : 'Loads when needed';
  return { on, status: s, detail: d, model: MODEL, where: meaningDevice(db), device: worker?.name ?? lastDevice, ...counted.v };
}

/**
 * Why search by meaning cannot make vectors now, for what waits on them (a knowledge base's passages): it is setting
 * itself up, its model is starting (downloading the first time), too little memory is free, or it stopped. Nothing when
 * it can (or it is off).
 */
export function meaningHeld(db: DB): MeaningHeld | undefined {
  if (!meaningOn(db) || stub || worker?.ready) return undefined;
  if (status === 'failed') return { why: 'failed', detail };
  if (settingUp || !envReady()) return { why: 'setting-up', detail: settingUp ? detail : undefined };
  if (status === 'starting' && (starting || worker)) return { why: 'starting', detail };
  if (short) return { why: 'memory', freeMb: Math.round(short.free), needMb: short.need };
  return undefined;
}

/** For a clean exit (tests). */
export function stopMeaning() {
  stopWorker();
  clearTimeout(setupLater);
  clearTimeout(fillTimer);
  clearTimeout(retryTimer);
}
