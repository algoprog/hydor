// Search by meaning: a Python worker (embed_worker.py) runs the embedding model, lightonai/mDenseOn, on this
// computer's CPU through ONNX Runtime, in its 8-bit build (algoprog/mDenseOn-ONNX: 310 MB, about 1 GB once loaded, a
// second or two to start). It is on unless Settings → Memory turns it off (or, never set there, HYDOR_EMBED=off), so
// memory, the Library and the rest are searched by words and meaning together. It sets itself up once: a private Python
// environment in the data folder with ONNX Runtime, Hugging Face's tokenizer and NumPy (about 100 MB; an older one with
// PyTorch is replaced), then the model's files, each checked against its SHA-256, into a cache beside Hugging Face's;
// on its own a minute after the app first starts, at once when someone turns it on. The worker starts when needed, only
// when enough memory is free, and quits after a few idle minutes, so a computer with 8 GB is never short. Until it
// answers, memory is searched by words alone, and notes get their vectors in the background once it does.
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { MeaningHeld, MeaningState } from '../../shared/memory.ts';
import { APP_ROOT, config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { which } from '../documents/tools.ts';
import { availableMemory } from '../models/machine.ts';
import { onEntriesChanged } from './store.ts';
import { DIM, MODEL, missingVectors, setVectors, vectorCounts } from './vectors.ts';

export type Kind = 'query' | 'document';

const dir = () => path.join(config.dataDir, 'memory');
const venv = () => path.join(dir(), 'venv');
/** The Python that runs the worker: one given (HYDOR_EMBED_PYTHON, with ONNX Runtime, tokenizers and NumPy), else the private one. */
const python = () => process.env.HYDOR_EMBED_PYTHON || path.join(venv(), ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
/** What the environment holds: another list means setting it up again (an environment with PyTorch, from before, is replaced). */
const PACKAGES = 'onnxruntime>=1.23 tokenizers>=0.20 numpy';
const WORKER = path.join(APP_ROOT, 'server/memory/embed_worker.py');

/**
 * The model's files, from its repository on Hugging Face at a fixed revision, each with its size and SHA-256: lightonai/mDenseOn
 * exported to ONNX (exactly: cosine 1.000000 to PyTorch in float32), its layers' weights and word table in 8 bits.
 */
export const MODEL_REPO = 'algoprog/mDenseOn-ONNX';
export const MODEL_REVISION = '8a1e5c530bd2c19f8fe94a01bf0dfcc373081db7';
export const MODEL_FILES: ModelFile[] = [
  { from: 'onnx/model_q8.onnx', name: 'model_q8.onnx', bytes: 323_365_939, sha256: '1497725b22a972db3df43eadf0c4227849a4b5ff2493e1bf3a1b667cf4965cdd' },
  { from: 'tokenizer.json', name: 'tokenizer.json', bytes: 34_363_287, sha256: 'a086e6a7efb90bbab8e379a63f3463fb13e6256ebec3343c1f1612cab693935b' },
  { from: 'tokenizer_config.json', name: 'tokenizer_config.json', bytes: 662, sha256: '469d2116d060fdd319728c3e5ba42697daab30568dc751b49b11fbd86ebb3a60' },
];
const MODEL_MB = Math.round(MODEL_FILES.reduce((n, f) => n + f.bytes, 0) / 2 ** 20);
/** Free memory needed to start the worker (measured: about 0.55 GB loaded, 1.04 GB at most with long texts). */
const NEED_MB = 1536;
/** Free disk needed to set up: the environment (about 100 MB) and the model. */
const DISK_GB = 1;
/** The worker quits after this long without work. */
const IDLE_MS = 5 * 60_000;

/** Turned on or off in Settings → Memory; never set there, on unless HYDOR_EMBED=off (a test's or a demo's app). */
const meaningChosen = (db: DB): boolean | null => {
  const v = kvGet(db, 'memory.meaning');
  return v === '1' ? true : v === '0' ? false : null;
};
export const meaningOn = (db: DB) => meaningChosen(db) ?? process.env.HYDOR_EMBED !== 'off';
const packagesReady = () => (process.env.HYDOR_EMBED_PYTHON ? fs.existsSync(python()) : fs.existsSync(python()) && readText(path.join(venv(), '.packages')) === PACKAGES);
const envReady = () => packagesReady() && modelReady();

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

/**
 * Where the model's files are kept: HYDOR_EMBED_MODEL_DIR, else a cache of the user's beside Hugging Face's (so the app's
 * other data folders, a test's or a second copy's, share one download), in the data folder inside a container (so it lasts).
 */
export function modelDir(): string {
  if (process.env.HYDOR_EMBED_MODEL_DIR) return process.env.HYDOR_EMBED_MODEL_DIR;
  const folder = `mDenseOn-ONNX-${MODEL_REVISION.slice(0, 12)}`;
  if (fs.existsSync('/.dockerenv')) return path.join(dir(), 'model', folder);
  const cache =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'hydor', 'cache')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'hydor')
        : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'hydor');
  return path.join(cache, folder);
}

/** The model's files are all there, as downloaded and checked (a mark written last says so). */
const modelReady = () => readText(path.join(modelDir(), '.complete')) === MODEL_REVISION && MODEL_FILES.every((f) => fs.existsSync(path.join(modelDir(), f.name)));

// ---- the worker ---------------------------------------------------------------------------------

interface Pending {
  resolve(v: Float32Array[]): void;
  reject(e: Error): void;
  timer: NodeJS.Timeout;
}

interface Worker {
  proc: ChildProcess;
  ready: boolean;
  rss?: number;
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

function workerEnv(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT', 'HYDOR_EMBED_THREADS'];
  const env: NodeJS.ProcessEnv = Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
  return Object.assign(env, { PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', HYDOR_EMBED_MODEL_DIR: modelDir() });
}

/** Too little memory was free the last time the worker was wanted: how much, and how much it needs (MB). */
let short: { free: number; need: number } | null = null;

/** The worker, started when it is not running (and memory allows); null when it cannot be now. */
function ensureWorker(db: DB): Promise<Worker | null> {
  if (worker?.ready) return Promise.resolve(worker);
  if (starting) return starting;
  if (!meaningOn(db) || !envReady() || status === 'failed') return Promise.resolve(null);
  starting = (async () => {
    const need = NEED_MB;
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
    status = 'starting';
    detail = 'Loading the model';
    const proc = spawn(python(), ['-I', WORKER], { stdio: ['pipe', 'pipe', 'pipe'], env: workerEnv() });
    const w: Worker = { proc, ready: false, pending: new Map(), seq: 0 };
    worker = w;
    const began = (loadStarted = Date.now());
    const giveUp = setTimeout(() => (fail(w, 'The model took too long to load'), resolve(null)), 3 * 60_000);
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
        // How long a load takes here, for the next one's estimate.
        kvSet(db, LOAD_MS_KEY, String(Date.now() - began));
        if (loadStarted === began) loadStarted = 0;
        Object.assign(w, { ready: true, rss: m.rss });
        status = 'ready';
        detail = undefined;
        idleLater(w);
        resolve(w);
      } else if (m.status === 'loading') detail = 'Loading the model';
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

/** The worker quits when it has had nothing to do for a while. */
function idleLater(w: Worker) {
  clearTimeout(w.idle);
  w.idle = setTimeout(() => {
    if (w.pending.size) return idleLater(w);
    if (worker === w) worker = null;
    w.proc.stdin?.end();
    setTimeout(() => w.proc.kill('SIGTERM'), 5000).unref();
  }, IDLE_MS);
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
 * by then. Loading takes a second or two (more on a busy machine), which no one should wait for at the start of a
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
  const took = Number(kvGet(db, LOAD_MS_KEY)) || 4000;
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

export interface ModelFile {
  /** Its path in the repository. */
  from: string;
  /** Its name in the model's folder. */
  name: string;
  bytes: number;
  sha256: string;
}

/** A file's address on Hugging Face (or the mirror HF_ENDPOINT names), at the model's fixed revision. */
const fileUrl = (from: string) => `${(process.env.HF_ENDPOINT || 'https://huggingface.co').replace(/\/+$/, '')}/${MODEL_REPO}/resolve/${MODEL_REVISION}/${from}`;

async function sha256Of(file: string): Promise<string> {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

/**
 * Downloads the files that are not in `to` yet, each into a part file first (a download cut short goes on from where it
 * stopped), checked against its SHA-256 before it takes its name; `mark` is written last, to say they are complete.
 * `progress` hears the bytes there are of all of them.
 */
export async function downloadFiles(to: string, files: ModelFile[], o: { url: (from: string) => string; mark: string; progress?: (done: number, total: number) => void }) {
  fs.mkdirSync(to, { recursive: true });
  const total = files.reduce((n, f) => n + f.bytes, 0);
  let done = files.filter((f) => fs.existsSync(path.join(to, f.name))).reduce((n, f) => n + f.bytes, 0);
  for (const f of files) {
    const dest = path.join(to, f.name);
    if (fs.existsSync(dest)) continue;
    const part = `${dest}.part`;
    let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (have >= f.bytes) fs.rmSync(part, { force: true }), (have = 0);
    const res = await fetch(o.url(f.from), { headers: have ? { Range: `bytes=${have}-` } : {}, redirect: 'follow', signal: AbortSignal.timeout(60 * 60_000) });
    if (!res.ok || !res.body) throw new Error(`The model could not be downloaded (${f.from}: HTTP ${res.status})`);
    // A server that sends the whole file again: start it over.
    if (have && res.status !== 206) have = 0;
    done += have;
    o.progress?.(done, total);
    const count = new Transform({
      transform(chunk: Buffer, _e, next) {
        done += chunk.length;
        o.progress?.(done, total);
        next(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body as never), count, fs.createWriteStream(part, { flags: have ? 'a' : 'w' }));
    if ((await sha256Of(part)) !== f.sha256) {
      fs.rmSync(part, { force: true });
      throw new Error(`The model's ${f.name} did not arrive whole (its checksum differs): try again`);
    }
    fs.renameSync(part, dest);
  }
  fs.writeFileSync(path.join(to, '.complete'), o.mark);
}

/** The model's files, from its repository, into its folder. */
const downloadModel = () =>
  downloadFiles(modelDir(), MODEL_FILES, {
    url: fileUrl,
    mark: MODEL_REVISION,
    progress: (done, total) => (detail = done >= total ? 'Checking the model' : `Downloading the model: ${Math.round(done / 2 ** 20)} of ${Math.round(total / 2 ** 20)} MB, once`),
  });

/**
 * Makes the private environment with ONNX Runtime, tokenizers and NumPy (once; again when the list changes: one with
 * PyTorch, from before, is removed first), then downloads the model.
 */
function setup(db: DB): Promise<void> {
  if (settingUp) return settingUp;
  settingUp = (async () => {
    status = 'setting-up';
    detail = 'Getting ready';
    try {
      fs.mkdirSync(dir(), { recursive: true });
      // What an older version set up: PyTorch's environment (gigabytes) and, in a container, its copy of the model.
      if (!process.env.HYDOR_EMBED_PYTHON && fs.existsSync(venv()) && readText(path.join(venv(), '.packages')) !== PACKAGES) {
        detail = 'Removing the environment an older version made';
        fs.rmSync(venv(), { recursive: true, force: true });
      }
      fs.rmSync(path.join(dir(), 'hf'), { recursive: true, force: true });
      const disk = freeDiskGb(dir());
      if (!packagesReady() && disk < DISK_GB) throw new Error(`Not enough disk space: ${disk.toFixed(1)} GB free, setting up needs about ${DISK_GB} GB.`);
      if (!packagesReady()) {
        const uv = which('uv', [path.join(os.homedir(), '.local/bin/uv'), path.join(os.homedir(), '.cargo/bin/uv')]);
        if (uv) {
          // (On a Mac, a Python of uv's own: Apple's stand-in asks to install its developer tools.)
          const own = process.platform === 'darwin' ? ['--python-preference', 'only-managed'] : [];
          if (!fs.existsSync(python())) await run(uv, ['venv', '--quiet', ...own, '--python', '>=3.10', venv()], 'Making a private Python environment');
          await run(uv, ['pip', 'install', '--quiet', '--python', python(), ...PACKAGES.split(' ')], 'Installing ONNX Runtime and the tokenizer');
        } else {
          // Windows: python.exe from python.org, else its py launcher.
          const sys = systemPython();
          if (!sys && process.platform === 'win32') throw new Error('Python 3 is not installed on this computer, and search by meaning needs it (python.org, or: winget install Python.Python.3.12).');
          if (!sys && process.platform === 'darwin') throw new Error('Python 3 is not installed on this computer, and search by meaning needs it (python.org, or Homebrew: brew install python).');
          if (!sys) throw new Error('Python 3 is not installed on this computer, and search by meaning needs it (Debian/Ubuntu: sudo apt install python3 python3-venv).');
          if (!fs.existsSync(python())) await run(sys, ['-c', 'import sys, venv; sys.exit(0 if sys.version_info >= (3, 10) else 1)'], 'Checking Python (3.10 or newer)');
          if (!fs.existsSync(python())) await run(sys, ['-m', 'venv', venv()], 'Making a private Python environment');
          await run(python(), ['-m', 'pip', 'install', '--quiet', ...PACKAGES.split(' ')], 'Installing ONNX Runtime and the tokenizer');
        }
        if (!process.env.HYDOR_EMBED_PYTHON) fs.writeFileSync(path.join(venv(), '.packages'), PACKAGES);
      }
      if (!modelReady()) {
        if (freeDiskGb(path.dirname(modelDir())) < MODEL_MB / 1024 + 0.2) throw new Error(`Not enough disk space for the model (${MODEL_MB} MB).`);
        await downloadModel();
      }
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
  scheduleBackfill(db, 0);
}

function stopWorker() {
  const w = worker;
  if (!w) return;
  worker = null;
  fail(w, null);
}

/** Turns search by meaning on or off, or tries again after it failed. */
export function setMeaning(db: DB, p: { on?: boolean; retry?: boolean }) {
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
  if (on && s === 'ready' && !d) d = worker?.ready ? 'Loaded' : 'Starts when needed, and stops after a few idle minutes';
  return { on, status: s, detail: d, model: MODEL, ...counted.v };
}

/**
 * Why search by meaning cannot make vectors now, for what waits on them (a knowledge base's passages): it is setting
 * itself up (downloading its model the first time), its model is starting, too little memory is free, or it stopped. Nothing when
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
