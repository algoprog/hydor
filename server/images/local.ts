// The picture tools on this computer: taking the background out of a picture (BiRefNet-lite) and erasing part of one
// (LaMa), free and private, and the Python that draws plots. Setting them up (Settings → Images, video and audio) makes
// a private Python environment in the data folder once (ONNX Runtime, NumPy, Pillow and Matplotlib: about 65 MB to
// download); each model downloads the first time its tool is used (about 220 MB each), checked by its SHA-256.
//
// A worker (picture_worker.py) runs the models on the CPU, one picture at a time (others wait in line). Each model
// loads only when its tool is used and unloads after a few idle minutes; the worker quits after a few more; nothing
// loads unless enough memory is free, and when it is not the person is told how much is needed. Plots' Python runs
// apart from it, in a short-lived process of its own (runPython), with a time limit.
//   GET    /api/images/local         what is set up, downloaded and in memory (LocalToolsState)
//   POST   /api/images/local/setup   sets them up (the app asks GET again every second or so while it installs)
//   DELETE /api/images/local         removes them: the environment and the models
//   POST   /api/images/cutout        a picture with its background taken out (cutout.ts)
//   POST   /api/images/erase         a picture with part of it erased (erase.ts)
// The agents' remove_background and erase_from_image (cutout.ts, erase.ts) do the same with a session's files.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { CutoutAsk, EraseAsk, LocalToolsState } from '../../shared/images.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT, config } from '../config.ts';
import { kvGet, type DB } from '../db.ts';
import { which } from '../documents/tools.ts';
import type { Feature } from '../features/types.ts';
import { freeMemoryMb } from '../memory/embed.ts';
import { cutoutPicture, MAX_PNG, removeBackgroundTool, type Here } from './cutout.ts';
import { erasePicture, eraseTool } from './erase.ts';
import { setLocalTools, type PythonRun } from './hooks.ts';
import { dimensions } from './openrouter.ts';

export type ToolName = 'cutout' | 'erase';

const WIN = process.platform === 'win32';
const dir = () => path.join(config.dataDir, 'pictures');
const venv = () => path.join(dir(), 'venv');
const modelsDir = () => path.join(dir(), 'models');
const jobsDir = () => path.join(dir(), 'jobs');
/** The Python that runs the worker: one given (HYDOR_PICTURES_PYTHON, with these packages), else the private one. */
const python = () => process.env.HYDOR_PICTURES_PYTHON || path.join(venv(), ...(WIN ? ['Scripts', 'python.exe'] : ['bin', 'python']));
const PACKAGE_LIST = ['onnxruntime>=1.20', 'numpy>=1.26', 'pillow>=10.1', 'matplotlib>=3.8'];
/** What the environment holds: another list means setting it up again. */
const PACKAGES = PACKAGE_LIST.join(' ');
/** What setting up downloads, in MB (measured: 63 MB of wheels for Linux; about 200 MB once installed). */
const SETUP_MB = 65;
/** Free disk needed to set up: the environment and both models, with room to spare. */
const DISK_MB = 1024;
const HF = () => (process.env.HF_ENDPOINT || 'https://huggingface.co').replace(/\/+$/, '');

export interface ModelInfo {
  /** Where it is kept, in the models folder. */
  file: string;
  url: string;
  bytes: number;
  sha256: string;
  /** What it is, as people read it ("the background remover"), and its own name. */
  label: string;
  name: string;
  /** Memory it takes once loaded, and at most while it works on a picture besides, in MB (measured on a CPU with 4 threads). */
  loadMb: number;
  runMb: number;
  /** Memory each pixel of the picture takes while it is worked on, in bytes (the picture, its mask and their copies). */
  perPixel: number;
}

// Pinned to the repositories' commits, so the files are the ones checked by their SHA-256.
const MODELS_AT: Record<ToolName, ModelInfo> = {
  cutout: {
    file: 'birefnet-lite.onnx',
    url: '/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model.onnx',
    bytes: 224_005_088,
    sha256: '5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333',
    label: 'the background remover',
    name: 'BiRefNet-lite',
    // Its deformable convolutions, exported as plain operations, hold several 784 MB tensors at once at 1024 × 1024.
    loadMb: 450,
    runMb: 5600,
    perPixel: 24,
  },
  erase: {
    file: 'lama.onnx',
    url: '/Carve/LaMa-ONNX/resolve/c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx',
    bytes: 208_044_816,
    sha256: '1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6',
    label: 'the eraser',
    name: 'LaMa',
    loadMb: 350,
    runMb: 650,
    perPixel: 16,
  },
};
let models: Record<ToolName, ModelInfo> = MODELS_AT;
const modelUrl = (m: ModelInfo) => (/^https?:/.test(m.url) ? m.url : HF() + m.url);
const modelPath = (t: ToolName) => path.join(modelsDir(), models[t].file);
/** Memory kept free beside what a job needs, in MB. */
const SPARE_MB = 256;

const ms = (name: string, fallback: number) => Math.max(10, Number(process.env[name]) || fallback);
/** A model unloads after this long unused; the worker quits after this long without a job. */
const modelIdleMs = () => ms('HYDOR_PICTURES_MODEL_IDLE_MS', 3 * 60_000);
const workerIdleMs = () => ms('HYDOR_PICTURES_WORKER_IDLE_MS', 5 * 60_000);
/** How many pictures may wait in line behind the one being worked on. */
const MAX_WAITING = 8;

const WHAT: Record<ToolName, { doing: string; verb: string }> = {
  cutout: { doing: 'Taking the background out', verb: 'take the background out' },
  erase: { doing: 'Erasing', verb: 'erase part of a picture' },
};

function readText(f: string): string | null {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
}

const envReady = () => (process.env.HYDOR_PICTURES_PYTHON ? fs.existsSync(python()) : fs.existsSync(python()) && readText(path.join(venv(), '.packages')) === PACKAGES);
const modelReady = (t: ToolName) => fs.statSync(modelPath(t), { throwIfNoEntry: false })?.size === models[t].bytes;
const gb = (mb: number) => (mb / 1024).toFixed(1);

function freeDiskMb(p: string): number {
  try {
    const s = fs.statfsSync(p);
    return (s.bavail * s.bsize) / 2 ** 20;
  } catch {
    return Infinity;
  }
}

/** On a Mac, free memory counts what the system would give back at once (inactive, purgeable), as Activity Monitor does. */
function macAvailableMb(): Promise<number | null> {
  return new Promise((resolve) => {
    execFile('vm_stat', { timeout: 5000 }, (err, out) => {
      if (err) return resolve(null);
      const page = Number(/page size of (\d+) bytes/.exec(out)?.[1] ?? 4096);
      const pages = (k: string) => Number(new RegExp(`Pages ${k}:\\s+(\\d+)`).exec(out)?.[1] ?? 0);
      resolve(((pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * page) / 2 ** 20);
    });
  });
}

let freeForTests: (() => number) | null = null;
async function freeMb(): Promise<number> {
  if (freeForTests) return freeForTests();
  if (process.platform === 'darwin') return (await macAvailableMb()) ?? freeMemoryMb();
  return freeMemoryMb();
}

// ---- what this computer can do ------------------------------------------------------------------------------

let probe: { at: number; canInstall: boolean; why?: string } | null = null;
let probing: Promise<void> | null = null;

const systemPython = () => (WIN ? (which('python') ?? which('py')) : which('python3'));
const findUv = () => which('uv', [path.join(os.homedir(), '.local/bin/uv'), path.join(os.homedir(), '.cargo/bin/uv')]);
const NO_PYTHON = WIN
  ? 'Setting them up needs Python 3.10 or newer on this computer (python.org, or: winget install Python.Python.3.12), or uv.'
  : 'Setting them up needs Python 3.10 or newer on this computer (Debian/Ubuntu: sudo apt install python3 python3-venv), or uv.';

function run(cmd: string, args: string[], o: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: o.timeoutMs ?? 20_000, env: o.env ?? process.env, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof (err as any).code === 'number' ? (err as any).code : null) : 0, out: `${stdout}\n${stderr}`.trim() }),
    );
  });
}

/** Whether the set-up can run here: uv, or a Python 3.10+ with its venv module. Checked again every few minutes. */
function refreshProbe() {
  if (probing) return;
  probing = (async () => {
    if (findUv()) return void (probe = { at: Date.now(), canInstall: true });
    const sys = systemPython();
    if (!sys) return void (probe = { at: Date.now(), canInstall: false, why: NO_PYTHON });
    const r = await run(sys, ['-c', 'import sys, venv, ensurepip; sys.exit(0 if sys.version_info >= (3, 10) else 3)']);
    if (r.code === 0) probe = { at: Date.now(), canInstall: true };
    else if (r.code === 3) probe = { at: Date.now(), canInstall: false, why: `The Python on this computer is older than 3.10. ${NO_PYTHON}` };
    else probe = { at: Date.now(), canInstall: false, why: WIN ? NO_PYTHON : 'Python’s venv module is missing on this computer (Debian/Ubuntu: sudo apt install python3-venv), or install uv.' };
  })().finally(() => (probing = null));
}

function installable(): { canInstall: boolean; why?: string } {
  if (!probe || Date.now() - probe.at > 5 * 60_000) refreshProbe();
  if (probe) return probe;
  // Until the check answers: whether there is anything to set up with at all.
  return findUv() || systemPython() ? { canInstall: true } : { canInstall: false, why: NO_PYTHON };
}

// ---- setting up and removing --------------------------------------------------------------------------------

let settingUp: Promise<void> | null = null;
let setupStep: string | undefined;
let jobStep: string | undefined;
let lastError: string | undefined;
/** Aborted when the tools are removed: downloads and jobs under way stop. */
let life = new AbortController();

function install(cmd: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    setupStep = label;
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' }, windowsHide: true });
    const tail: string[] = [];
    const take = (b: Buffer) => {
      for (const l of b.toString().split('\n')) if (l.trim()) tail.push(l.trim().slice(0, 300));
      tail.splice(0, Math.max(0, tail.length - 8));
    };
    p.stdout!.on('data', take);
    p.stderr!.on('data', take);
    const late = setTimeout(() => p.kill('SIGKILL'), 20 * 60_000);
    const stop = () => p.kill('SIGKILL');
    life.signal.addEventListener('abort', stop, { once: true });
    p.on('error', (e) => (clearTimeout(late), reject(e)));
    p.on('exit', (code) => {
      clearTimeout(late);
      life.signal.removeEventListener('abort', stop);
      if (code === 0) resolve();
      else reject(new Error(`${label} failed${tail.length ? `: ${tail.slice(-3).join(' ')}` : ''}`));
    });
  });
}

/** Makes the private environment (once; again when the list of packages changes). */
export function setupLocal(): Promise<void> {
  if (settingUp) return settingUp;
  lastError = undefined;
  settingUp = (async () => {
    setupStep = 'Getting ready';
    try {
      fs.mkdirSync(dir(), { recursive: true });
      const disk = freeDiskMb(dir());
      if (disk < DISK_MB) throw new Error(`Not enough disk space: ${gb(disk)} GB free, and the picture tools need about ${gb(DISK_MB)} GB (the environment and the two models).`);
      const uv = findUv();
      const label = `Installing ONNX Runtime, NumPy, Pillow and Matplotlib (about ${SETUP_MB} MB)`;
      if (uv) {
        if (!fs.existsSync(python())) await install(uv, ['venv', '--quiet', '--python', '>=3.10,<3.15', venv()], 'Making a private Python environment');
        await install(uv, ['pip', 'install', '--quiet', '--python', python(), ...PACKAGE_LIST], label);
      } else {
        const sys = systemPython();
        if (!sys) throw new Error(NO_PYTHON);
        if (!fs.existsSync(python())) await install(sys, ['-c', 'import sys, venv, ensurepip; sys.exit(0 if sys.version_info >= (3, 10) else 1)'], 'Checking Python (3.10 or newer)');
        if (!fs.existsSync(python())) await install(sys, ['-m', 'venv', venv()], 'Making a private Python environment');
        await install(python(), ['-m', 'pip', 'install', '--quiet', ...PACKAGE_LIST], label);
      }
      fs.writeFileSync(path.join(venv(), '.packages'), PACKAGES);
      probe = null;
    } catch (e) {
      lastError = life.signal.aborted ? undefined : (e as Error).message;
    } finally {
      setupStep = undefined;
    }
  })().finally(() => {
    settingUp = null;
  });
  return settingUp;
}

/** Removes the environment and the models (stopping what runs). */
export async function removeLocal(): Promise<void> {
  life.abort();
  life = new AbortController();
  stopWorker('The picture tools were removed');
  if (settingUp) await settingUp.catch(() => {});
  if (process.env.HYDOR_PICTURES_PYTHON) {
    fs.rmSync(modelsDir(), { recursive: true, force: true });
    fs.rmSync(jobsDir(), { recursive: true, force: true });
  } else fs.rmSync(dir(), { recursive: true, force: true });
  lastError = undefined;
  jobStep = undefined;
}

// ---- the models ---------------------------------------------------------------------------------------------

const IDLE_DOWNLOAD_MS = 60_000;

/** Downloads a model to a temporary name, going on from where an earlier one stopped; kept under its own name only once its SHA-256 matches. */
async function download(t: ToolName): Promise<void> {
  const m = models[t];
  const final = modelPath(t);
  const part = `${final}.part`;
  fs.mkdirSync(modelsDir(), { recursive: true });
  let start = fs.statSync(part, { throwIfNoEntry: false })?.size ?? 0;
  if (start > m.bytes) (fs.rmSync(part, { force: true }), (start = 0));
  const disk = freeDiskMb(modelsDir());
  if (disk < (m.bytes - start) / 2 ** 20 + 64) throw new HttpError(507, `Not enough disk space to download ${m.label}: it needs ${Math.round(m.bytes / 2 ** 20)} MB, and ${Math.round(disk)} MB is free.`);
  const idle = new AbortController();
  let timer = setTimeout(() => idle.abort(), IDLE_DOWNLOAD_MS);
  const signal = AbortSignal.any([idle.signal, life.signal]);
  const total = Math.round(m.bytes / 1e6);
  const say = (done: number) => (jobStep = `Downloading ${m.label} (${total} MB, once): ${Math.floor((done / m.bytes) * 100)}%`);
  say(start);
  try {
    let r = await fetch(modelUrl(m), { headers: start ? { range: `bytes=${start}-` } : {}, signal });
    if (start && r.status === 416) {
      // What was kept cannot be gone on from: from the start again.
      await r.body?.cancel().catch(() => {});
      fs.rmSync(part, { force: true });
      start = 0;
      r = await fetch(modelUrl(m), { signal });
    }
    if (!r.ok || !r.body) throw new Error(`the server answered ${r.status}`);
    if (start && r.status !== 206) start = 0;
    const hash = crypto.createHash('sha256');
    if (start) for await (const b of fs.createReadStream(part, { end: start - 1 })) hash.update(b as Buffer);
    let done = start;
    const count = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        done += chunk.length;
        say(done);
        clearTimeout(timer);
        timer = setTimeout(() => idle.abort(), IDLE_DOWNLOAD_MS);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(r.body as any), count, fs.createWriteStream(part, { flags: start ? 'a' : 'w' }), { signal });
    const sha = hash.digest('hex');
    if (done !== m.bytes || sha !== m.sha256) {
      fs.rmSync(part, { force: true });
      throw new HttpError(502, `The download of ${m.label} came out damaged (it did not match its checksum), so it was thrown away. Try again.`);
    }
    fs.renameSync(part, final);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (life.signal.aborted) throw new HttpError(409, 'The picture tools were removed.');
    const why = idle.signal.aborted ? 'nothing came for a minute' : (e as Error).message;
    throw new HttpError(502, `The download of ${m.label} stopped (${why}). Try again: it goes on from where it stopped.`);
  } finally {
    clearTimeout(timer);
  }
}

// ---- the worker ---------------------------------------------------------------------------------------------

const WORKER_SCRIPT = path.join(APP_ROOT, 'server/images/picture_worker.py');
let workerScript = WORKER_SCRIPT;

interface Answer {
  ok?: boolean;
  error?: string;
  memory?: boolean;
  w?: number;
  h?: number;
  scaled?: boolean;
  loaded?: ToolName[];
  rss?: number;
  peak?: number;
  ms?: number;
}

interface Pending {
  resolve(a: Answer): void;
  reject(e: Error): void;
  what?: ToolName;
}

interface Worker {
  proc: ChildProcess;
  ready: Promise<void>;
  pending: Map<number, Pending>;
  seq: number;
  loaded: ToolName[];
  idle?: NodeJS.Timeout;
  unload: Partial<Record<ToolName, NodeJS.Timeout>>;
  /** When each model last worked on a picture. */
  used: Partial<Record<ToolName, number>>;
  stderr: string[];
  gone: boolean;
}

let worker: Worker | null = null;

function workerEnv(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'windir', 'HYDOR_PICTURES_THREADS'];
  const env: NodeJS.ProcessEnv = Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
  // The CPU only, on at most 4 threads (ONNX Runtime's are set by the worker; these are for NumPy's and OpenMP's).
  const threads = String(Math.max(1, Math.min(4, Number(process.env.HYDOR_PICTURES_THREADS) || os.cpus().length || 2)));
  return { ...env, CUDA_VISIBLE_DEVICES: '', OMP_NUM_THREADS: threads, OPENBLAS_NUM_THREADS: threads, MKL_NUM_THREADS: threads };
}

function startWorker(): Worker {
  fs.rmSync(jobsDir(), { recursive: true, force: true });
  const proc = spawn(python(), ['-I', '-B', '-u', workerScript], { stdio: ['pipe', 'pipe', 'pipe'], env: workerEnv(), windowsHide: true });
  let ready!: () => void;
  let failed!: (e: Error) => void;
  const w: Worker = { proc, ready: new Promise<void>((res, rej) => ((ready = res), (failed = rej))), pending: new Map(), seq: 0, loaded: [], unload: {}, used: {}, stderr: [], gone: false };
  w.ready.catch(() => {});
  // Writing to a worker that has just gone fails; its exit says why.
  proc.stdin!.on('error', () => {});
  const giveUp = setTimeout(() => (failed(new Error('The picture tools took too long to start')), endWorker(w, 'SIGKILL')), 60_000);
  proc.stderr!.on('data', (b: Buffer) => {
    for (const l of b.toString().split('\n')) if (l.trim()) w.stderr.push(l.trim().slice(0, 300));
    w.stderr.splice(0, Math.max(0, w.stderr.length - 20));
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
      return ready();
    }
    if (Array.isArray(m.loaded)) w.loaded = m.loaded;
    const p = m.id != null ? w.pending.get(m.id) : undefined;
    if (!p) return;
    if (m.status === 'loading' && p.what) jobStep = `Loading ${models[p.what].label}`;
    else if (m.status === 'working' && p.what) jobStep = `${WHAT[p.what].doing} on this computer`;
    else if (!m.status) {
      w.pending.delete(m.id);
      p.resolve(m);
    }
  });
  proc.on('error', (e) => {
    clearTimeout(giveUp);
    const why = `The picture tools could not start (${e.message}). Removing them and setting them up again may help.`;
    failed(new Error(why));
    lost(w, why);
  });
  proc.on('exit', (code, signal) => {
    clearTimeout(giveUp);
    const why = signal === 'SIGKILL' && !w.gone ? 'The picture tools stopped: this computer ran out of memory for them.' : `The picture tools stopped (${signal ?? `exit ${code}`})${w.stderr.length ? `: ${w.stderr.slice(-2).join(' ')}` : ''}`;
    failed(new Error(why));
    lost(w, w.gone ? 'The picture tools were stopped.' : why);
  });
  return w;
}

/** The worker went: what it was doing fails. */
function lost(w: Worker, why: string) {
  w.gone = true;
  for (const p of w.pending.values()) p.reject(new Error(why));
  w.pending.clear();
  clearTimeout(w.idle);
  for (const t of Object.values(w.unload)) clearTimeout(t);
  w.loaded = [];
  if (worker === w) worker = null;
}

function endWorker(w: Worker, signal: NodeJS.Signals | 'stdin') {
  w.gone = true;
  if (signal === 'stdin') {
    // Asked to end: its input closes and it quits; if it does not, it is made to.
    w.proc.stdin?.end();
    setTimeout(() => w.proc.exitCode === null && w.proc.kill('SIGKILL'), 5000).unref();
  } else
    try {
      w.proc.kill(signal);
    } catch {}
  if (worker === w) worker = null;
}

function stopWorker(why: string) {
  const w = worker;
  if (!w) return;
  lost(w, why);
  endWorker(w, 'SIGTERM');
}

function send(w: Worker, req: Record<string, unknown>, what: ToolName | undefined, timeoutMs: number): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const id = ++w.seq;
    const timer = setTimeout(() => {
      w.pending.delete(id);
      reject(new HttpError(504, 'It took too long on this computer, so it was stopped.'));
      // Whatever it was stuck on goes with it.
      lost(w, 'The picture tools were stopped: a picture took too long.');
      endWorker(w, 'SIGKILL');
    }, timeoutMs);
    w.pending.set(id, { resolve: (a) => (clearTimeout(timer), resolve(a)), reject: (e) => (clearTimeout(timer), reject(e)), what });
    w.proc.stdin!.write(JSON.stringify({ id, ...req }) + '\n');
  });
}

/** A model unloads once it has had nothing to do for a few minutes (waiting its turn behind a job, and asking again then). */
function unloadLater(w: Worker, t: ToolName) {
  clearTimeout(w.unload[t]);
  w.unload[t] = setTimeout(
    () =>
      void inLine(async () => {
        if (w !== worker || w.gone || !w.loaded.includes(t)) return;
        const since = Date.now() - (w.used[t] ?? 0);
        if (since < modelIdleMs() - 20) return unloadLater(w, t);
        await send(w, { op: 'unload', what: t }, undefined, 60_000);
      }).catch(() => {}),
    Math.max(10, modelIdleMs() - (Date.now() - (w.used[t] ?? 0))),
  );
  w.unload[t]!.unref?.();
}

/** The worker quits once it has had no job for a few minutes. */
function quitLater(w: Worker) {
  clearTimeout(w.idle);
  w.idle = setTimeout(() => {
    if (busy) return quitLater(w);
    lost(w, 'The picture tools stopped after a while with nothing to do.');
    endWorker(w, 'stdin');
  }, workerIdleMs());
  w.idle.unref?.();
}

/** After a job: the model it used unloads after a few idle minutes, the worker quits after a few more. */
function idleLater(w: Worker, used: ToolName) {
  w.used[used] = Date.now();
  for (const t of w.loaded) if (t === used || !w.unload[t]) unloadLater(w, t);
  quitLater(w);
}

// ---- jobs, one at a time ------------------------------------------------------------------------------------

let line: Promise<unknown> = Promise.resolve();
let waiting = 0;
let busy = false;

const aborted = () => Object.assign(new Error('Stopped'), { name: 'AbortError' });

function inLine<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (waiting >= MAX_WAITING) return Promise.reject(new HttpError(429, 'The picture tools are busy with other pictures: try again in a minute.'));
  waiting++;
  const job = line.then(async () => {
    waiting--;
    if (signal?.aborted) throw aborted();
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  });
  line = job.catch(() => {});
  return job;
}

export interface MadeHere {
  png: Buffer;
  w: number;
  h: number;
  /** Made smaller to stay under the size asked. */
  scaled: boolean;
  /** The model's name (BiRefNet-lite, LaMa). */
  model: string;
}

/** Enough memory for the job (the other model unloaded first if that makes room), or words saying how much it needs. */
async function roomFor(t: ToolName, pixels: number): Promise<void> {
  const m = models[t];
  const need = () => (worker?.loaded.includes(t) ? 0 : m.loadMb) + m.runMb + (pixels * m.perPixel) / 2 ** 20 + SPARE_MB;
  let free = await freeMb();
  if (free >= need()) return;
  const other = worker?.loaded.find((x) => x !== t);
  if (worker && other) {
    await send(worker, { op: 'unload', what: other }, undefined, 60_000).catch(() => {});
    await new Promise((r) => setTimeout(r, 200));
    free = await freeMb();
    if (free >= need()) return;
  }
  throw new HttpError(503, `There is not enough free memory to ${WHAT[t].verb} on this computer now: it needs about ${gb(need())} GB free, and ${gb(free)} GB is. Close some programs and try again, or do it through OpenRouter instead.`);
}

/** One picture through a model in the worker: the input (and mask) as files in a folder of the job's own, the PNG back. */
async function work(t: ToolName, files: { input: Buffer; mask?: Buffer }, o: { boxes?: number[][]; maxBytes?: number; signal?: AbortSignal }): Promise<MadeHere> {
  if (!envReady()) throw new HttpError(400, 'The picture tools on this computer are not set up: set them up in Settings → Images, video and audio.');
  const size = dimensions(files.input);
  if (size && size.w * size.h > 50_000_000) throw new HttpError(413, `The picture is ${size.w}×${size.h}: over 50 megapixels, too large to work on here. Make it smaller first.`);
  const pixels = size ? size.w * size.h : 12_000_000;
  return inLine(async () => {
    lastError = undefined;
    try {
      // Removed while this waited in line.
      if (!envReady()) throw new HttpError(400, 'The picture tools on this computer are not set up: set them up in Settings → Images, video and audio.');
      if (!modelReady(t)) {
        // Not a long download for nothing: the memory first, and again once it is here.
        await roomFor(t, pixels);
        await download(t);
      }
      if (o.signal?.aborted) throw aborted();
      await roomFor(t, pixels);
      if (o.signal?.aborted) throw aborted();
      let w = worker && !worker.gone ? worker : (worker = startWorker());
      await w.ready;
      const job = path.join(jobsDir(), crypto.randomBytes(8).toString('hex'));
      fs.mkdirSync(job, { recursive: true });
      try {
        const input = path.join(job, 'in');
        fs.writeFileSync(input, files.input);
        const mask = files.mask ? path.join(job, 'mask.png') : undefined;
        if (mask) fs.writeFileSync(mask, files.mask!);
        const output = path.join(job, 'out.png');
        jobStep = `${WHAT[t].doing} on this computer`;
        const a = await send(w, { op: t, model: modelPath(t), input, output, ...(mask ? { mask } : {}), ...(o.boxes ? { boxes: o.boxes } : {}), ...(o.maxBytes ? { max_bytes: o.maxBytes } : {}) }, t, t === 'cutout' ? 5 * 60_000 : 3 * 60_000);
        if (!w.gone) idleLater(w, t);
        if (a.error) throw new HttpError(a.memory ? 503 : 400, a.memory ? `${a.error} Close some programs and try again, or do it through OpenRouter instead.` : a.error);
        return { png: fs.readFileSync(output), w: a.w!, h: a.h!, scaled: !!a.scaled, model: models[t].name };
      } finally {
        fs.rmSync(job, { recursive: true, force: true });
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') lastError = (e as Error).message;
      throw e;
    } finally {
      jobStep = undefined;
    }
  }, o.signal);
}

/** The picture with its background taken out on this computer: a PNG with see-through parts, the picture's own pixels kept. */
export const cutoutHere = (img: Buffer, o: { maxBytes?: number; signal?: AbortSignal } = {}) => work('cutout', { input: img }, o);

/** The picture with what is under the mask (white) or in the boxes erased and filled in from around it, on this computer: a PNG. */
export function eraseHere(img: Buffer, where: { mask: Buffer } | { boxes: { x: number; y: number; w: number; h: number }[] }, o: { maxBytes?: number; signal?: AbortSignal } = {}) {
  if ('mask' in where) return work('erase', { input: img, mask: where.mask }, o);
  return work('erase', { input: img }, { ...o, boxes: where.boxes.map((b) => [b.x, b.y, b.w, b.h]) });
}

// ---- Python for plots ---------------------------------------------------------------------------------------

/** What a run gives back: the end of what it printed, and files of up to 20 MB each, 60 MB in all. */
const MAX_PRINTED = 64 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const MAX_FILES_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 64;
const NO_PLOT_PYTHON = 'Plots need Python with matplotlib: set up the picture tools in Settings → Images, video and audio';

let mplPython: { at: number; py: string | null } | null = null;

/** A Python on this computer that has matplotlib (checked every few minutes), for plots without the picture tools. */
async function pythonWithMatplotlib(): Promise<string | null> {
  if (mplPython && Date.now() - mplPython.at < 5 * 60_000) return mplPython.py;
  let found: string | null = null;
  for (const py of [...new Set([systemPython(), WIN ? null : which('python')].filter((x): x is string => !!x))]) {
    if ((await run(py, ['-I', '-c', 'import matplotlib'], { timeoutMs: 30_000 })).code === 0) {
      found = py;
      break;
    }
  }
  mplPython = { at: Date.now(), py: found };
  return found;
}

/** The files under a folder (three levels at most), each with its size and time, to tell after a run what it wrote. */
function listFiles(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string, depth: number) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const n of names) {
      if (out.size >= 2000) return;
      const f = path.join(d, n.name);
      if (n.isDirectory() && depth < 3) walk(f, depth + 1);
      else if (n.isFile()) {
        const st = fs.lstatSync(f, { throwIfNoEntry: false });
        if (st?.isFile()) out.set(path.relative(root, f).split(path.sep).join('/'), `${st.size}:${st.mtimeMs}`);
      }
    }
  };
  walk(root, 0);
  return out;
}

function kill(p: ChildProcess) {
  if (p.pid == null) return;
  try {
    if (WIN) execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], () => {});
    else process.kill(-p.pid, 'SIGKILL');
  } catch {
    try {
      p.kill('SIGKILL');
    } catch {}
  }
}

/**
 * Python code run in `cwd` (made if missing; `files` written in it first), in the picture tools' Python when they are
 * set up, else a Python on this computer that has matplotlib. A process of its own, never the worker: isolated from the
 * user's Python settings (-I), with a small environment of its own (nothing of the app's, no keys), its own home and
 * temporary folder, matplotlib drawing to files (Agg); stopped at the time limit (ok: false, and stderr says so) or when
 * `signal` aborts (it throws). What it wrote in `cwd` comes back in `files` (by path inside it).
 */
export async function runPython(code: string, o: { cwd: string; timeoutMs: number; files?: Record<string, Buffer>; signal?: AbortSignal }): Promise<PythonRun> {
  const py = envReady() ? python() : await pythonWithMatplotlib();
  if (!py) throw new HttpError(400, NO_PLOT_PYTHON);
  if (o.signal?.aborted) throw aborted();
  const cwd = path.resolve(o.cwd);
  fs.mkdirSync(cwd, { recursive: true });
  for (const [name, data] of Object.entries(o.files ?? {})) {
    const f = path.resolve(cwd, name);
    if (!f.startsWith(cwd + path.sep)) throw new Error(`${name}: files go inside the folder the code runs in`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
  }
  const before = listFiles(cwd);
  const own = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-python-'));
  try {
    for (const d of ['home', 'tmp']) fs.mkdirSync(path.join(own, d));
    const script = path.join(own, 'plot.py');
    fs.writeFileSync(script, code);
    const mpl = path.join(dir(), 'mpl');
    fs.mkdirSync(mpl, { recursive: true });
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? (WIN ? '' : '/usr/bin:/bin'),
      HOME: path.join(own, 'home'),
      USERPROFILE: path.join(own, 'home'),
      TMPDIR: path.join(own, 'tmp'),
      TEMP: path.join(own, 'tmp'),
      TMP: path.join(own, 'tmp'),
      LANG: process.env.LANG || 'C.UTF-8',
      MPLBACKEND: 'Agg',
      // Matplotlib's list of fonts, made once and kept, so later plots start at once.
      MPLCONFIGDIR: mpl,
      CUDA_VISIBLE_DEVICES: '',
      OMP_NUM_THREADS: '2',
      OPENBLAS_NUM_THREADS: '2',
      MKL_NUM_THREADS: '2',
    };
    if (WIN) for (const k of ['SystemRoot', 'SYSTEMROOT', 'windir', 'PATHEXT', 'COMSPEC']) if (process.env[k]) env[k] = process.env[k];
    const r = await new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve, reject) => {
      const p = spawn(py, ['-I', '-B', '-u', '-X', 'utf8', script], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: !WIN, windowsHide: true });
      let stdout = '';
      let stderr = '';
      const keep = (s: string, b: Buffer) => (s + b.toString('utf8')).slice(-MAX_PRINTED);
      p.stdout!.on('data', (b: Buffer) => (stdout = keep(stdout, b)));
      p.stderr!.on('data', (b: Buffer) => (stderr = keep(stderr, b)));
      let late = false;
      const timer = setTimeout(() => ((late = true), kill(p)), Math.max(1000, o.timeoutMs));
      const stop = () => kill(p);
      o.signal?.addEventListener('abort', stop, { once: true });
      p.on('error', (e) => (clearTimeout(timer), o.signal?.removeEventListener('abort', stop), reject(e)));
      p.on('close', (code) => {
        clearTimeout(timer);
        o.signal?.removeEventListener('abort', stop);
        // Anything it left running goes with it.
        if (!WIN && p.pid != null)
          try {
            process.kill(-p.pid, 'SIGKILL');
          } catch {}
        if (o.signal?.aborted) return reject(aborted());
        if (late) stderr = `${stderr}${stderr && !stderr.endsWith('\n') ? '\n' : ''}Stopped: it ran for longer than ${+(o.timeoutMs / 1000).toFixed(1)} seconds.`;
        resolve({ ok: code === 0 && !late, stdout, stderr });
      });
    });
    const files: Record<string, Buffer> = {};
    let total = 0;
    for (const [rel, stamp] of listFiles(cwd)) {
      if (before.get(rel) === stamp) continue;
      const f = path.join(cwd, ...rel.split('/'));
      const st = fs.lstatSync(f, { throwIfNoEntry: false });
      if (!st?.isFile()) continue;
      if (st.size > MAX_FILE || total + st.size > MAX_FILES_BYTES || Object.keys(files).length >= MAX_FILES) {
        r.stderr += `${r.stderr && !r.stderr.endsWith('\n') ? '\n' : ''}${rel} was left out: it is too large (files of up to 20 MB, 60 MB in all, come back).`;
        continue;
      }
      files[rel] = fs.readFileSync(f);
      total += st.size;
    }
    return { ...r, files };
  } finally {
    fs.rmSync(own, { recursive: true, force: true });
  }
}

// ---- what Settings shows ------------------------------------------------------------------------------------

export function localState(): LocalToolsState {
  const ready = envReady();
  const can = ready ? { canInstall: true } : installable();
  return {
    ready,
    installing: !!settingUp,
    ...(setupStep || jobStep ? { step: setupStep ?? jobStep } : {}),
    ...(lastError ? { error: lastError } : {}),
    canInstall: can.canInstall,
    ...(can.why ? { why: can.why } : {}),
    sizeMb: SETUP_MB,
    downloaded: (['cutout', 'erase'] as const).filter(modelReady),
    loaded: worker && !worker.gone ? [...worker.loaded] : [],
  };
}

export const localReady = () => envReady() && !settingUp;

/** What the routes and tools of cutout.ts and erase.ts are lent. */
const here: Here = { ready: localReady, canSetUp: () => envReady() || installable().canInstall, cutout: cutoutHere, erase: eraseHere };

setLocalTools({
  state: localState,
  ready: localReady,
  cutout: async (img, signal) => (await cutoutHere(img, { maxBytes: MAX_PNG, signal })).png,
  erase: async (img, mask, signal) => (await eraseHere(img, { mask }, { maxBytes: MAX_PNG, signal })).png,
  runPython,
});

// ---- for tests ----------------------------------------------------------------------------------------------

/** Tests use models and a worker of their own, and say how much memory is free. */
export function setPictureToolsForTests(o: { models?: Partial<Record<ToolName, Partial<ModelInfo>>>; worker?: string | null; freeMb?: (() => number) | null }) {
  if (o.models) models = { cutout: { ...MODELS_AT.cutout, ...o.models.cutout }, erase: { ...MODELS_AT.erase, ...o.models.erase } };
  if (o.worker !== undefined) workerScript = o.worker ?? WORKER_SCRIPT;
  if (o.freeMb !== undefined) freeForTests = o.freeMb;
}

/** The worker's process, while it runs (for tests). */
export const pictureWorkerPid = () => (worker && !worker.gone ? worker.proc.pid : undefined);

/** For a clean exit (tests). */
export function stopPictureTools() {
  stopWorker('The picture tools were stopped.');
}

// ---- the capability -----------------------------------------------------------------------------------------

/** Whether agents have the image tools (Settings → Images, video and audio). */
function imagesOn(db: DB): boolean {
  try {
    return JSON.parse(kvGet(db, 'images') ?? '{}').enabled !== false;
  } catch {
    return true;
  }
}

/** Aborted when the browser that asked goes away: a picture still waiting in line is then not worked on. */
function whileAsked(reply: { raw: NodeJS.EventEmitter & { writableFinished: boolean } }): AbortSignal {
  const ac = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || ac.abort());
  return ac.signal;
}

export const pictureTools: Feature = {
  id: 'pictureTools',
  routes({ app, db }) {
    app.get('/api/images/local', async () => localState());
    app.post('/api/images/local/setup', async () => {
      if (!envReady()) {
        const can = installable();
        if (!can.canInstall) throw new HttpError(400, can.why ?? NO_PYTHON);
        void setupLocal();
      }
      return localState();
    });
    app.delete('/api/images/local', async () => {
      await removeLocal();
      return localState();
    });
    app.post('/api/images/cutout', async (req, reply) => cutoutPicture(db, (req.body ?? {}) as CutoutAsk, whileAsked(reply), here));
    app.post('/api/images/erase', async (req, reply) => erasePicture(db, (req.body ?? {}) as EraseAsk, whileAsked(reply), here));
  },
  tools: ({ deps }) => (imagesOn(deps.db) ? [removeBackgroundTool(deps.db, here), eraseTool(deps.db, here)] : []),
};
