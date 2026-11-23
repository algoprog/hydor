// Setting word suggestions up on this computer: a private Python environment (ONNX Runtime, tokenizers, NumPy,
// safetensors; PyTorch's CPU build is added to it the first time learning needs it) in the data folder, llama.cpp's
// llama-server for this system, the language model's GGUF file and the small model's files, each downloaded once and
// checked against its SHA-256. Models go to the user's cache (shared by the app's data folders, as memory's is), the
// program and the environment stay in the data folder.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';
import { which } from '../documents/tools.ts';
import { downloadFiles, userCacheDir, type ModelFile } from '../memory/embed.ts';
import { fetchFile } from '../voice/fetch.ts';
import { tagSuits } from './gpu.ts';
import { GGUF_FILES, GGUF_REPO, GGUF_REVISION, LLAMA_ASSETS, LLAMA_TAG, llamaUrl, SMALL_MODEL, SMALL_MODEL_NEEDS, SUGGEST_PACKAGES, SUGGEST_PACKAGES_TORCH, TORCH_PACKAGE, TRAIN_PACKAGES } from './pins.ts';

export const suggestDir = () => path.join(config.dataDir, 'suggest');
const venv = () => path.join(suggestDir(), 'venv');
const EXE = process.platform === 'win32' ? '.exe' : '';
/** Free disk the suggestion environment needs (about 150 MB installed), and what PyTorch adds for learning (about 1 GB). */
const DISK_GB = 1;
const TORCH_DISK_GB = 2;

const readText = (f: string) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};
const freeDiskGb = (p: string) => {
  for (let d = p; ; d = path.dirname(d)) {
    try {
      const s = fs.statfsSync(d);
      return (s.bavail * s.bsize) / 2 ** 30;
    } catch {}
    if (d === path.dirname(d)) return Infinity;
  }
};
const mb = (n: number) => Math.round(n / 2 ** 20);

/** A download that gets no data for this long is given up (a stalled connection would hold the set-up for ever). */
export const STALL_MS = 60_000;

/**
 * Runs a download with a signal that ends when `signal` does, or when `alive` has not been called for `ms` (the download
 * calls it with every bit of progress): the error then says the connection stalled.
 */
export async function withStall<T>(signal: AbortSignal | undefined, ms: number, fn: (signal: AbortSignal, alive: () => void) => Promise<T>): Promise<T> {
  const c = new AbortController();
  let stalled = false;
  let timer: NodeJS.Timeout | undefined;
  const alive = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      c.abort();
    }, ms);
  };
  const onAbort = () => c.abort();
  if (signal?.aborted) c.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  alive();
  try {
    return await fn(c.signal, alive);
  } catch (e) {
    if (stalled) throw new Error(`The download stopped: no data came for ${Math.round(ms / 1000)} seconds. It is tried again later`);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Why word suggestions cannot run on this system, or null: ONNX Runtime and PyTorch have no wheels for an Intel Mac. A Python of one's own (HYDOR_SUGGEST_PYTHON) is used as it is. */
export function unsupportedSystem(platform: string = process.platform, arch: string = process.arch): string | null {
  if (process.env.HYDOR_SUGGEST_PYTHON) return null;
  return platform === 'darwin' && arch === 'x64' ? 'Word suggestions need a Mac with Apple silicon' : null;
}

// ---- where things are ----------------------------------------------------------------------------------------------

/** The Python that runs the engine: one given (HYDOR_SUGGEST_PYTHON, used as it is), else the private one. */
export const pythonPath = () => process.env.HYDOR_SUGGEST_PYTHON || path.join(venv(), ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
/** The suggestion environment is there: ONNX Runtime and the rest, with PyTorch or without it (an older version's has PyTorch and gets ONNX Runtime added). */
export const packagesReady = () => {
  if (!fs.existsSync(pythonPath())) return false;
  if (process.env.HYDOR_SUGGEST_PYTHON) return true;
  const have = readText(path.join(venv(), '.packages'));
  return have === SUGGEST_PACKAGES || have === SUGGEST_PACKAGES_TORCH;
};
/** PyTorch is there too, which learning on the processor needs (a Python of one's own is used as it is). */
export const torchReady = () => {
  if (!fs.existsSync(pythonPath())) return false;
  return !!process.env.HYDOR_SUGGEST_PYTHON || readText(path.join(venv(), '.packages')) === SUGGEST_PACKAGES_TORCH;
};

/** The engine's scripts, beside the bundled server (dist/server/suggest/py: scripts/build-server.mjs copies them). */
export const pyDir = () => path.join(path.dirname(fileURLToPath(import.meta.url)), 'suggest', 'py');
export const workerScript = () => path.join(pyDir(), 'worker.py');
export const trainScript = () => path.join(pyDir(), 'train.py');

/** Never set up (a test's or a demo's app). */
export const suggestDisabled = () => process.env.HYDOR_SUGGEST === 'off';

/** Where downloaded models are kept: the user's cache, in the data folder inside a container (so they last). */
const modelsRoot = () => (fs.existsSync('/.dockerenv') ? path.join(suggestDir(), 'models') : path.join(userCacheDir(), 'suggest'));

/** The small model's folder: HYDOR_SUGGEST_MODEL_DIR, else the pinned release in the cache; null when none is published. */
export function releaseDir(): string | null {
  if (process.env.HYDOR_SUGGEST_MODEL_DIR) return process.env.HYDOR_SUGGEST_MODEL_DIR;
  if (!SMALL_MODEL.revision || !SMALL_MODEL.files.length) return null;
  return path.join(modelsRoot(), `hydor-suggest-49m-${SMALL_MODEL.revision.slice(0, 12)}`);
}

/** Why the small model cannot run: it is not published, or its folder lacks a file; null when it is there. */
export function releaseProblem(): string | null {
  const dir = releaseDir();
  if (!dir) return 'The word-suggestion model is not published yet';
  if (process.env.HYDOR_SUGGEST_MODEL_DIR) {
    const miss = SMALL_MODEL_NEEDS.find((f) => !fs.existsSync(path.join(dir, f)));
    return miss ? `The model folder (HYDOR_SUGGEST_MODEL_DIR) has no ${miss}` : null;
  }
  return readText(path.join(dir, '.complete')) === SMALL_MODEL.revision && SMALL_MODEL.files.every((f) => fs.existsSync(path.join(dir, f.name))) ? null : 'The word-suggestion model is not downloaded yet';
}

const llamaKey = () => `${process.platform}-${process.arch}`;
export const llamaFolder = () => path.join(suggestDir(), 'llama', LLAMA_TAG);

/** llama-server: HYDOR_SUGGEST_LLAMA_SERVER, else the pinned build in the data folder; null when there is none yet. */
export function llamaBinary(): string | null {
  const own = process.env.HYDOR_SUGGEST_LLAMA_SERVER;
  if (own) return fs.existsSync(own) ? own : null;
  const p = path.join(llamaFolder(), `llama-server${EXE}`);
  return fs.existsSync(p) ? p : null;
}
/** Whether a prebuilt llama-server exists for this system. */
export const llamaSupported = () => !!process.env.HYDOR_SUGGEST_LLAMA_SERVER || !!LLAMA_ASSETS[llamaKey()];

const ggufDir = () => path.join(modelsRoot(), `qwen3.5-0.8b-base-${GGUF_REVISION.slice(0, 12)}`);
/** The language model's file for a size: HYDOR_SUGGEST_GGUF, else the pinned file in the cache; null when it is not there. */
export function ggufPath(quant: 'q8' | 'q4'): string | null {
  const own = process.env.HYDOR_SUGGEST_GGUF;
  if (own) return fs.existsSync(own) ? own : null;
  const p = path.join(ggufDir(), GGUF_FILES[quant].name);
  return fs.existsSync(p) ? p : null;
}

// ---- setting up ---------------------------------------------------------------------------------------------------

type Report = (detail: string) => void;

/** Ended (turned off, or no data for a while). */
const aborted = () => new Error('Stopped');

export function run(cmd: string, args: string[], label: string, report: (detail: string) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    report(label);
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });
    const stop = () => {
      try {
        p.kill('SIGTERM');
      } catch {}
    };
    signal?.addEventListener('abort', stop, { once: true });
    const tail: string[] = [];
    const take = (b: Buffer) => {
      for (const l of b.toString().split('\n')) if (l.trim()) tail.push(l.trim().slice(0, 300));
      tail.splice(0, Math.max(0, tail.length - 8));
    };
    p.stdout!.on('data', take);
    p.stderr!.on('data', take);
    p.on('error', reject);
    p.on('exit', (code) => {
      signal?.removeEventListener('abort', stop);
      if (signal?.aborted) reject(aborted());
      else if (code === 0) resolve();
      else reject(new Error(`${label} failed${tail.length ? `: ${tail.slice(-3).join(' ')}` : ''}`));
    });
  });
}

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

const PYTORCH_CPU = 'https://download.pytorch.org/whl/cpu';
const OTHERS = ['tokenizers>=0.20', 'numpy', 'safetensors>=0.4'];

/** One pip install: from which index (none: PyPI's), what, and what it is called while it runs. */
interface PipStep {
  index: string[];
  packages: string[];
  label: string;
}

/** What a private Python environment is made of: where, what goes into it, and how it says it is done. */
interface VenvPlan {
  dir: string;
  python: string;
  /** Written into the folder when everything is installed. */
  marker: string;
  /** The markers of environments that are added to rather than made again (an older version's, or this one without its extra). */
  keep: string[];
  steps: PipStep[];
  /** Free disk needed (GB). */
  diskGb: number;
  /** What an environment that is there but not this one is told when it is taken away. */
  removing: string;
}

/** Builds of one environment go one after the other (PyTorch going in while the suggestion libraries are being checked would clash). */
const venvBusy = new Map<string, Promise<unknown>>();
async function inTurn<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const before = venvBusy.get(dir) ?? Promise.resolve();
  const mine = before.catch(() => {}).then(fn);
  venvBusy.set(dir, mine);
  try {
    return await mine;
  } finally {
    if (venvBusy.get(dir) === mine) venvBusy.delete(dir);
  }
}

/** Makes the environment and installs the libraries into it (the pieces already there are kept); `ready` is asked again once it is this one's turn. */
async function buildVenv(v: VenvPlan, ready: () => boolean, report: Report, signal?: AbortSignal): Promise<void> {
  return inTurn(v.dir, async () => {
    if (ready()) return;
    fs.mkdirSync(suggestDir(), { recursive: true });
    const have = readText(path.join(v.dir, '.packages'));
    if (fs.existsSync(v.dir) && have !== v.marker && !(have && v.keep.includes(have)) && readText(path.join(v.dir, '.building')) !== v.marker) {
      report(v.removing);
      fs.rmSync(v.dir, { recursive: true, force: true });
    }
    const disk = freeDiskGb(suggestDir());
    if (disk < v.diskGb) throw new Error(`Not enough disk space: ${disk.toFixed(1)} GB free, the Python libraries need about ${v.diskGb} GB.`);
    const uv = which('uv', [path.join(os.homedir(), '.local/bin/uv'), path.join(os.homedir(), '.cargo/bin/uv')]);
    const made = () => fs.existsSync(v.python);
    // A set-up that was stopped half way carries on (what pip fetched is kept in its cache); the marker is written only at the end.
    const building = () => {
      fs.mkdirSync(v.dir, { recursive: true });
      fs.writeFileSync(path.join(v.dir, '.building'), v.marker);
    };
    if (uv) {
      const own = process.platform === 'darwin' ? ['--python-preference', 'only-managed'] : [];
      if (!made()) await run(uv, ['venv', '--quiet', ...own, '--python', '>=3.10,<3.14', v.dir], 'Making a private Python environment', report, signal);
      building();
      for (const st of v.steps) await run(uv, ['pip', 'install', '--quiet', '--python', v.python, ...st.index, ...st.packages], st.label, report, signal);
    } else {
      const sys = systemPython();
      if (!sys && process.platform === 'win32') throw new Error('Python 3 is not installed on this computer, and word suggestions need it (python.org, or: winget install Python.Python.3.12).');
      if (!sys && process.platform === 'darwin') throw new Error('Python 3 is not installed on this computer, and word suggestions need it (python.org, or Homebrew: brew install python).');
      if (!sys) throw new Error('Python 3 is not installed on this computer, and word suggestions need it (Debian/Ubuntu: sudo apt install python3 python3-venv).');
      if (!made()) await run(sys, ['-c', 'import sys; sys.exit(0 if (3, 10) <= sys.version_info < (3, 14) else 1)'], 'Checking Python (3.10 to 3.13)', report, signal);
      if (!made()) await run(sys, ['-m', 'venv', v.dir], 'Making a private Python environment', report, signal);
      building();
      for (const st of v.steps) await run(v.python, ['-m', 'pip', 'install', '--quiet', ...st.index, ...st.packages], st.label, report, signal);
    }
    fs.writeFileSync(path.join(v.dir, '.packages'), v.marker);
    fs.rmSync(path.join(v.dir, '.building'), { force: true });
  });
}

/** PyTorch's CPU build (a few hundred MB) from its own index on Linux and Windows; the Mac's PyPI build is the same size. */
const torchStep = (): PipStep => ({
  index: process.platform === 'darwin' ? [] : ['--index-url', PYTORCH_CPU],
  packages: [TORCH_PACKAGE],
  label: 'Installing PyTorch (CPU) for learning, about 200 MB',
});

/**
 * The private Python environment the engine runs in: ONNX Runtime and the rest (once; again when their list changes). One an older
 * version made (PyTorch and no ONNX Runtime) is kept, with ONNX Runtime added; one that has PyTorch keeps it.
 */
export async function setupPython(report: Report, signal?: AbortSignal): Promise<void> {
  if (packagesReady()) return;
  if (process.env.HYDOR_SUGGEST_PYTHON) throw new Error(`HYDOR_SUGGEST_PYTHON (${process.env.HYDOR_SUGGEST_PYTHON}) does not exist`);
  const hadTorch = [TRAIN_PACKAGES, SUGGEST_PACKAGES_TORCH].includes(readText(path.join(venv(), '.packages')) ?? '');
  await buildVenv(
    {
      dir: venv(),
      python: pythonPath(),
      marker: hadTorch ? SUGGEST_PACKAGES_TORCH : SUGGEST_PACKAGES,
      keep: [TRAIN_PACKAGES, SUGGEST_PACKAGES_TORCH],
      steps: [{ index: [], packages: ['onnxruntime>=1.23', ...OTHERS], label: 'Installing ONNX Runtime and the tokenizer, about 60 MB' }],
      diskGb: DISK_GB,
      removing: 'Removing the environment an older version made',
    },
    packagesReady,
    report,
    signal,
  );
}

/** PyTorch (the CPU build) into the suggestion environment, for learning on the processor: the first time learning runs, in the background. */
export async function setupTorch(report: Report, signal?: AbortSignal): Promise<void> {
  if (torchReady()) return;
  if (process.env.HYDOR_SUGGEST_PYTHON) throw new Error(`HYDOR_SUGGEST_PYTHON (${process.env.HYDOR_SUGGEST_PYTHON}) does not exist`);
  await setupPython(report, signal);
  await buildVenv(
    {
      dir: venv(),
      python: pythonPath(),
      marker: SUGGEST_PACKAGES_TORCH,
      keep: [SUGGEST_PACKAGES, TRAIN_PACKAGES],
      steps: [torchStep()],
      diskGb: TORCH_DISK_GB,
      removing: 'Removing the environment an older version made',
    },
    torchReady,
    report,
    signal,
  );
}

// ---- the graphics card's environment -------------------------------------------------------------------------------

/** The second private environment, with PyTorch's CUDA build: learning on an NVIDIA card needs it (the CPU one cannot). */
const venvGpu = () => path.join(suggestDir(), 'venv-gpu');
const GPU_DISK_GB = 8;
const gpuMarker = (tag: string) => `${TRAIN_PACKAGES} ${tag}`;

/** The CUDA environment's Python: the one given (HYDOR_SUGGEST_PYTHON, used as it is), else the private one. */
export const gpuPythonPath = () => process.env.HYDOR_SUGGEST_PYTHON || path.join(venvGpu(), ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));

/** The environment is there with a PyTorch build that suits `tag` (one built for an older CUDA than the driver's newest does too). */
export function gpuPackagesReady(tag: string): boolean {
  if (process.env.HYDOR_SUGGEST_PYTHON) return fs.existsSync(gpuPythonPath());
  const have = readText(path.join(venvGpu(), '.packages'));
  const prefix = `${TRAIN_PACKAGES} `;
  return fs.existsSync(gpuPythonPath()) && !!have && have.startsWith(prefix) && tagSuits(have.slice(prefix.length), tag);
}

/** The environment with PyTorch's CUDA build `tag` (such as cu126), for learning on a graphics card (the first time about 2.5 GB). */
export async function setupGpuPython(tag: string, report: Report, signal?: AbortSignal): Promise<void> {
  if (gpuPackagesReady(tag)) return;
  if (process.env.HYDOR_SUGGEST_PYTHON) throw new Error(`HYDOR_SUGGEST_PYTHON (${process.env.HYDOR_SUGGEST_PYTHON}) does not exist`);
  await buildVenv(
    {
      dir: venvGpu(),
      python: gpuPythonPath(),
      marker: gpuMarker(tag),
      keep: [],
      steps: [
        { index: ['--index-url', `https://download.pytorch.org/whl/${tag}`], packages: [TORCH_PACKAGE], label: 'Installing PyTorch for the graphics card, about 2.5 GB' },
        { index: [], packages: OTHERS, label: 'Installing the tokenizer and NumPy' },
      ],
      diskGb: GPU_DISK_GB,
      removing: 'Removing the graphics card environment an older version made',
    },
    () => gpuPackagesReady(tag),
    report,
    signal,
  );
}

/** Subfolders a file name names (replay/replay.u32) exist before it is downloaded. */
function withFolders(to: string, files: ModelFile[]) {
  for (const f of files) fs.mkdirSync(path.dirname(path.join(to, f.name)), { recursive: true });
}

/** The small model's release (nothing to do for a folder of one's own: HYDOR_SUGGEST_MODEL_DIR). */
export async function setupRelease(report: Report, signal?: AbortSignal): Promise<void> {
  const problem = releaseProblem();
  if (!problem) return;
  const dir = releaseDir();
  if (!dir || process.env.HYDOR_SUGGEST_MODEL_DIR) throw new Error(problem);
  const total = SMALL_MODEL.files.reduce((n, f) => n + f.bytes, 0);
  if (freeDiskGb(path.dirname(dir)) < total / 2 ** 30 + 0.2) throw new Error(`Not enough disk space for the small model (${mb(total)} MB).`);
  fs.mkdirSync(dir, { recursive: true });
  withFolders(dir, SMALL_MODEL.files);
  const base = (process.env.HF_ENDPOINT || 'https://huggingface.co').replace(/\/+$/, '');
  await withStall(signal, STALL_MS, (sig, alive) =>
    downloadFiles(dir, SMALL_MODEL.files, {
      url: (from) => `${base}/${SMALL_MODEL.repo}/resolve/${SMALL_MODEL.revision}/${from}`,
      mark: SMALL_MODEL.revision,
      signal: sig,
      progress: (done, all) => (alive(), report(done >= all ? 'Checking the small model' : `Downloading the small model: ${mb(done)} of ${mb(all)} MB`)),
    }),
  );
}

function extract(file: string, to: string): Promise<void> {
  fs.mkdirSync(to, { recursive: true });
  return new Promise((resolve, reject) =>
    execFile('tar', ['-xf', file, '-C', to], { timeout: 10 * 60_000, maxBuffer: 4 << 20 }, (e, _o, err) =>
      e ? reject(new Error(`Could not unpack ${path.basename(file)}: ${(err || e.message).trim().split('\n').pop()}`)) : resolve(),
    ),
  );
}

/** The folder under `dir` that holds `name` (at most three levels down). */
function findIn(dir: string, name: string, depth = 3): string | null {
  if (fs.existsSync(path.join(dir, name))) return dir;
  if (!depth) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const r = findIn(path.join(dir, e.name), name, depth - 1);
      if (r) return r;
    }
  }
  return null;
}

/** llama.cpp's llama-server for this system, from the pinned release (not when HYDOR_SUGGEST_LLAMA_SERVER names one). */
export async function setupLlama(report: Report, signal?: AbortSignal): Promise<void> {
  if (llamaBinary()) return;
  if (process.env.HYDOR_SUGGEST_LLAMA_SERVER) throw new Error(`HYDOR_SUGGEST_LLAMA_SERVER (${process.env.HYDOR_SUGGEST_LLAMA_SERVER}) does not exist`);
  const asset = LLAMA_ASSETS[llamaKey()];
  if (!asset) throw new Error(`llama.cpp has no ready-made build for ${process.platform} ${process.arch}: set HYDOR_SUGGEST_LLAMA_SERVER to one`);
  const root = path.join(suggestDir(), 'llama');
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, asset.name);
  await withStall(signal, STALL_MS, (sig, alive) =>
    fetchFile({ url: llamaUrl(asset), bytes: asset.bytes, sha256: asset.sha256 }, file, {
      signal: sig,
      progress: (done, total) => (alive(), report(`Downloading llama.cpp: ${mb(done)} of ${mb(total || asset.bytes)} MB`)),
    }),
  );
  report('Unpacking llama.cpp');
  const tmp = path.join(root, `${LLAMA_TAG}.partial`);
  fs.rmSync(tmp, { recursive: true, force: true });
  await extract(file, tmp);
  const at = findIn(tmp, `llama-server${EXE}`);
  if (!at) throw new Error('The llama.cpp download has no llama-server in it');
  fs.rmSync(llamaFolder(), { recursive: true, force: true });
  fs.renameSync(at, llamaFolder());
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(file, { force: true });
  if (process.platform !== 'win32') fs.chmodSync(path.join(llamaFolder(), 'llama-server'), 0o755);
}

/** The language model's GGUF file for a size. */
export async function setupGguf(quant: 'q8' | 'q4', report: Report, signal?: AbortSignal): Promise<void> {
  if (ggufPath(quant)) return;
  if (process.env.HYDOR_SUGGEST_GGUF) throw new Error(`HYDOR_SUGGEST_GGUF (${process.env.HYDOR_SUGGEST_GGUF}) does not exist`);
  const f = GGUF_FILES[quant];
  const dir = ggufDir();
  if (freeDiskGb(path.dirname(dir)) < f.bytes / 2 ** 30 + 0.2) throw new Error(`Not enough disk space for the language model (${mb(f.bytes)} MB).`);
  const base = (process.env.HF_ENDPOINT || 'https://huggingface.co').replace(/\/+$/, '');
  await withStall(signal, STALL_MS, (sig, alive) =>
    downloadFiles(dir, [f], {
      url: (from) => `${base}/${GGUF_REPO}/resolve/${GGUF_REVISION}/${from}`,
      mark: GGUF_REVISION,
      signal: sig,
      progress: (done, all) => (alive(), report(done >= all ? 'Checking the language model' : `Downloading the language model: ${mb(done)} of ${mb(all)} MB`)),
    }),
  );
}
