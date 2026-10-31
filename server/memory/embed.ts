// Search by meaning: a Python worker (embed_worker.py) runs the embedding model, lightonai/mDenseOn, on this
// computer: on a GPU in fp16 when one has room, else on the CPU (Settings can keep it on the CPU, to leave
// the GPUs to other work). Turning it on sets up a private environment in the data folder once (PyTorch,
// its CPU build when there is no NVIDIA GPU, and Transformers); the model downloads on first start (1.2 GB).
// On a GPU the worker stays loaded. On a CPU it starts when needed, only when enough memory is free, and
// quits after a few idle minutes, so a computer with 8 GB is never short. Until it answers, memory is
// searched by words alone, and notes get their vectors in the background once it does.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { MeaningState } from '../../shared/memory.ts';
import { APP_ROOT, config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { which } from '../documents/tools.ts';
import { onEntriesChanged } from './store.ts';
import { DIM, MODEL, missingVectors, setVectors, vectorCounts } from './vectors.ts';

export type Kind = 'query' | 'document';
export type MeaningDevice = 'auto' | 'cpu';

const dir = () => path.join(config.dataDir, 'memory');
const venv = () => path.join(dir(), 'venv');
/** The Python that runs the worker: one given (NAGET_EMBED_PYTHON, with PyTorch and Transformers), else the private one. */
const python = () => process.env.NAGET_EMBED_PYTHON || path.join(venv(), 'bin', 'python');
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

export const meaningOn = (db: DB) => kvGet(db, 'memory.meaning') === '1';
export const meaningDevice = (db: DB): MeaningDevice => (kvGet(db, 'memory.meaning.device') === 'cpu' ? 'cpu' : 'auto');
const hasNvidia = () => fs.existsSync('/proc/driver/nvidia/version');
const envReady = () => (process.env.NAGET_EMBED_PYTHON ? fs.existsSync(python()) : fs.existsSync(python()) && readText(path.join(venv(), '.packages')) === PACKAGES);

function readText(f: string): string | null {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
}

/** Memory the system could give a new program now, in MB. */
export function freeMemoryMb(): number {
  const m = /MemAvailable:\s+(\d+) kB/.exec(readText('/proc/meminfo') ?? '');
  return m ? Number(m[1]) / 1024 : os.freemem() / 2 ** 20;
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
  pending: Map<number, Pending>;
  seq: number;
  idle?: NodeJS.Timeout;
}

let worker: Worker | null = null;
let starting: Promise<Worker | null> | null = null;
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
};

function workerEnv(db: DB): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'XDG_CACHE_HOME', 'HF_HUB_CACHE', 'HF_TOKEN', 'CUDA_VISIBLE_DEVICES', 'NAGET_EMBED_THREADS'];
  const env: NodeJS.ProcessEnv = Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
  Object.assign(env, { PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1', TOKENIZERS_PARALLELISM: 'false', TRANSFORMERS_VERBOSITY: 'error' });
  const home = hfHome();
  if (home) env.HF_HOME = home;
  if (meaningDevice(db) === 'cpu') env.NAGET_EMBED_DEVICE = 'cpu';
  else if (process.env.NAGET_EMBED_DEVICE) env.NAGET_EMBED_DEVICE = process.env.NAGET_EMBED_DEVICE;
  return env;
}

/** The worker, started when it is not running (and memory allows); null when it cannot be now. */
function ensureWorker(db: DB): Promise<Worker | null> {
  if (worker?.ready) return Promise.resolve(worker);
  if (starting) return starting;
  if (!meaningOn(db) || !envReady() || status === 'failed') return Promise.resolve(null);
  const cpu = meaningDevice(db) === 'cpu' || !hasNvidia();
  const need = cpu ? NEED_CPU_MB : NEED_GPU_MB;
  const free = freeMemoryMb();
  if (free < need) {
    detail = `Waiting for memory: ${(free / 1024).toFixed(1)} GB free, it needs ${(need / 1024).toFixed(1)} GB. Until then notes are found by their words.`;
    return Promise.resolve(null);
  }
  starting = new Promise<Worker | null>((resolve) => {
    const first = !modelCached();
    status = 'starting';
    detail = first ? 'Downloading the model (1.2 GB, once)' : 'Loading the model';
    const proc = spawn(python(), ['-I', WORKER], { stdio: ['pipe', 'pipe', 'pipe'], env: workerEnv(db) });
    const w: Worker = { proc, ready: false, pending: new Map(), seq: 0 };
    worker = w;
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
        Object.assign(w, { ready: true, device: m.device, name: m.name, rss: m.rss });
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
  }).finally(() => {
    starting = null;
  });
  return starting;
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
  if (worker === w) worker = null;
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
        if (!fs.existsSync(python())) await run(uv, ['venv', '--quiet', '--python', '>=3.10', venv()], 'Making a private Python environment');
        await run(uv, ['pip', 'install', '--quiet', '--python', python(), `--torch-backend=${gpu ? 'auto' : 'cpu'}`, 'torch', 'transformers>=5.6,<6'], `Installing PyTorch${gpu ? '' : ' (CPU build)'} and Transformers: a few minutes`);
      } else {
        const sys = which('python3');
        if (!sys) throw new Error('Python 3 is not installed on this computer, and search by meaning needs it (Debian/Ubuntu: sudo apt install python3 python3-venv).');
        if (!fs.existsSync(python())) await run(sys, ['-c', 'import sys, venv; sys.exit(0 if sys.version_info >= (3, 10) else 1)'], 'Checking Python (3.10 or newer)');
        if (!fs.existsSync(python())) await run(sys, ['-m', 'venv', venv()], 'Making a private Python environment');
        await run(python(), ['-m', 'pip', 'install', '--quiet', 'torch', ...(gpu ? [] : ['--index-url', 'https://download.pytorch.org/whl/cpu'])], `Installing PyTorch${gpu ? '' : ' (CPU build)'}: a few minutes`);
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

/** On: set up when needed, load the model on a GPU now, and fill in the notes' vectors. */
export async function kick(db: DB) {
  if (!meaningOn(db)) return;
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
    }
  }
  if (p.retry || p.on) {
    if (status === 'failed') status = 'off';
    crashes.length = 0;
  }
  void kick(db);
}

export function meaningState(db: DB): MeaningState {
  if (!counted || Date.now() - counted.at > 5000) counted = { at: Date.now(), v: vectorCounts(db) };
  const on = meaningOn(db);
  const s: MeaningState['status'] = !on ? 'off' : status === 'off' ? (envReady() ? 'ready' : 'setting-up') : status;
  let d = detail;
  if (on && s === 'ready' && !d) d = worker?.ready ? `Loaded on ${worker.name ?? worker.device}` : meaningDevice(db) === 'cpu' || !hasNvidia() ? 'Starts on the CPU when needed, and stops after a few idle minutes' : 'Loads when needed';
  return { on, status: s, detail: d, model: MODEL, where: meaningDevice(db), device: worker?.name ?? lastDevice, ...counted.v };
}

/** For a clean exit (tests). */
export function stopMeaning() {
  stopWorker();
  clearTimeout(fillTimer);
  clearTimeout(retryTimer);
}
