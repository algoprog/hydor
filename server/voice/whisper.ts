// whisper.cpp on this machine: the program and its models, downloaded into the app's data folder only
// when speech recognition on the server is turned on. It runs on the GPU when there is one it can use, else on
// the processor. Linux gets whisper.cpp's own ready-made build (CPU, x64 or arm64); where that does not run (an
// older system) or there is none, it is built here from the same version's source, with this machine's compiler
// and CMake (downloaded too when there is none): on a Mac for its GPU (Metal, its shaders inside the program).
// whisper.cpp publishes no ready-made build for Linux GPUs, so with an NVIDIA GPU and NVIDIA's CUDA toolkit one is
// built here for it, in the background while the ready-made one runs (service.ts). A GPU that fails at run time (out
// of its memory, a driver that does not answer) costs one try: the recording goes to the processor (-ng).
// A whisper-cli of your own on the PATH (one built for your GPU, say) is used as it is.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BUILD_SAYS, type VoiceDevice, type VoiceProgress, type WhisperGpu, type WhisperSize } from '../../shared/voice.ts';
import { availableMemory } from '../models/machine.ts';
import { dirSize, fetchFile, run, untar, which, type Remote, type RunResult } from './fetch.ts';

/** The whisper.cpp release the app gets: build b5454, version 1.9.5. */
export const WHISPER_VERSION = '1.9.5';
const RELEASE = 'b5454';

/** Where things come from; tests point these elsewhere. */
export interface Sources {
  /** whisper.cpp's ready-made Linux build, by CPU. */
  prebuilt: Record<string, Remote>;
  /** The same version's source, for a build here. */
  source: Remote;
  /** CMake for a build, by CPU, when this machine has none (or one too old). */
  cmake: Record<string, Remote>;
  /** The models: ggml-<size>[.en].bin */
  models: (file: string) => Remote;
  /** Silero voice activity detection, so silence and noise give no words. */
  vad: Remote;
}

const MODEL_SHA: Record<string, [number, string]> = {
  'ggml-tiny.bin': [77_691_713, 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21'],
  'ggml-tiny.en.bin': [77_704_715, '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f'],
  'ggml-base.bin': [147_951_465, '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'],
  'ggml-base.en.bin': [147_964_211, 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002'],
  'ggml-small.bin': [487_601_967, '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'],
  'ggml-small.en.bin': [487_614_201, 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d'],
  'ggml-medium.bin': [1_533_763_059, '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208'],
  'ggml-medium.en.bin': [1_533_774_781, 'cc37e93478338ec7700281a7ac30a10128929eb8f427dda2e865faa8f6da4356'],
};

const GH = 'https://github.com';
export const SOURCES: Sources = {
  prebuilt: {
    x64: { url: `${GH}/ggml-org/whisper.cpp/releases/download/${RELEASE}/whisper-bin-ubuntu-x64.tar.gz`, bytes: 10_364_195, sha256: 'a72becf15d7917f990f6313867a52638b82b7f9ef237fb0c980dac56a135781c' },
    arm64: { url: `${GH}/ggml-org/whisper.cpp/releases/download/${RELEASE}/whisper-bin-ubuntu-arm64.tar.gz`, bytes: 4_608_377, sha256: '6b95ebfc60447df48e70ef00a73bdc3f41679ed2d01ef465827206a2ff325149' },
  },
  source: { url: `${GH}/ggml-org/whisper.cpp/archive/refs/tags/${RELEASE}.tar.gz` },
  cmake: {
    x64: { url: `${GH}/Kitware/CMake/releases/download/v3.31.8/cmake-3.31.8-linux-x86_64.tar.gz`, bytes: 55_012_213, sha256: '630615d8e98ac33eba7fbe472626dff5c899c85af3c024585ae109166a6909d0' },
    arm64: { url: `${GH}/Kitware/CMake/releases/download/v3.31.8/cmake-3.31.8-linux-aarch64.tar.gz`, bytes: 56_316_581, sha256: '609735983e3bdf24b6ab379d918458d64196fe72b98226f62dd5e9fe7b2997cc' },
  },
  models: (file) => ({ url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${file}`, bytes: MODEL_SHA[file]?.[0], sha256: MODEL_SHA[file]?.[1] }),
  vad: { url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin', bytes: 885_098, sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987' },
};

export const modelFile = (size: WhisperSize, english: boolean) => `ggml-${size}${english ? '.en' : ''}.bin`;
export const VAD_FILE = 'ggml-silero-v6.2.0.bin';
const MARKER = '.naget-voice.json';

export interface Program {
  path: string;
  version?: string;
  source: 'prebuilt' | 'built' | 'yours';
  sizeBytes: number;
  /** The GPU the app's copy is built for; none: the processor only (the ready-made one). Not known for your own. */
  gpu?: WhisperGpu;
  /** Flags this copy knows: suppressing non-speech tokens, voice activity detection, and keeping off the GPU (-ng). */
  sns: boolean;
  vad: boolean;
  ng: boolean;
}

/** Folders in the app's voice folder. */
export const layout = (dir: string) => ({
  program: path.join(dir, 'whisper'),
  models: path.join(dir, 'models'),
  work: path.join(dir, 'build'),
  cmake: path.join(dir, 'cmake'),
  tmp: path.join(dir, 'tmp'),
  /** A build for the NVIDIA GPU, in the background: its source and CMake, and the program until it takes the place of the other. */
  gpuWork: path.join(dir, 'build-gpu'),
  gpuProgram: path.join(dir, 'whisper-gpu'),
});

// ---- this machine -------------------------------------------------------------------------------------

/** What a build depends on: the system, and an NVIDIA GPU with NVIDIA's CUDA compiler (nvcc). */
export interface Machine {
  platform: NodeJS.Platform;
  arch: string;
  /** An NVIDIA GPU with its driver (Linux). */
  nvidia: boolean;
  /** NVIDIA's CUDA compiler, which comes with the CUDA toolkit; null without one. */
  nvcc: string | null;
}

const runnable = (p: string) => {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * NVIDIA's CUDA compiler: CMake's CUDACXX, on the PATH, under CUDA_HOME (or CUDA_PATH, CUDA_ROOT,
 * CUDAToolkit_ROOT), or where the toolkit installs itself: /usr/local/cuda (else the newest /usr/local/cuda-*),
 * /opt/cuda, Debian's and Ubuntu's packages. `root` is "/" but in tests.
 */
export function findNvcc(env: NodeJS.ProcessEnv = process.env, root = '/'): string | null {
  const at = (...p: string[]) => path.join(root, ...p);
  const versioned = (() => {
    try {
      return fs
        .readdirSync(at('usr/local'))
        .map((d) => ({ d, v: /^cuda-(\d+)\.(\d+)$/.exec(d) }))
        .filter((x) => x.v)
        .sort((a, b) => Number(b.v![1]) - Number(a.v![1]) || Number(b.v![2]) - Number(a.v![2]))
        .map((x) => at('usr/local', x.d, 'bin'));
    } catch {
      return [];
    }
  })();
  const dirs = [
    ...(env.PATH ?? '').split(path.delimiter).filter(Boolean),
    ...['CUDA_HOME', 'CUDA_PATH', 'CUDA_ROOT', 'CUDAToolkit_ROOT'].flatMap((k) => (env[k] ? [path.join(env[k]!, 'bin')] : [])),
    at('usr/local/cuda/bin'),
    ...versioned,
    at('opt/cuda/bin'),
    at('usr/lib/cuda/bin'),
    at('usr/lib/nvidia-cuda-toolkit/bin'),
  ];
  for (const c of [env.CUDACXX ?? '', ...dirs.map((d) => path.join(d, 'nvcc'))]) if (c && runnable(c)) return c;
  return null;
}

let nvccSeen: { at: number; path: string | null } | null = null;

/** This machine; the CUDA toolkit looked for at most once a minute (or again at once, `fresh`). */
export function thisMachine(fresh = false): Machine {
  const linux = process.platform === 'linux';
  if (fresh || !nvccSeen || Date.now() - nvccSeen.at > 60_000) nvccSeen = { at: Date.now(), path: linux ? findNvcc() : null };
  return { platform: process.platform, arch: process.arch, nvidia: linux && fs.existsSync('/proc/driver/nvidia/version'), nvcc: nvccSeen.path };
}

/**
 * The GPU whisper.cpp is built for when it is built while being set up: a Mac's (Metal). An NVIDIA GPU's build
 * (CUDA) comes after, in the background, since it takes long (wantsCudaBuild in service.ts).
 */
export const gpuToBuild = (m: Machine): WhisperGpu | null => (m.platform === 'darwin' ? 'metal' : null);

// ---- the program ------------------------------------------------------------------------------------

/** How a whisper-cli answers: its version and the flags it knows; null when it does not run here. */
async function probe(cli: string): Promise<{ version?: string; sns: boolean; vad: boolean; ng: boolean; error?: string }> {
  try {
    const v = await run(cli, ['--version'], { timeout: 15_000 });
    const h = await run(cli, ['--help'], { timeout: 15_000 });
    const help = h.out + h.err;
    if (!/--model/.test(help)) return { sns: false, vad: false, ng: false, error: (v.err || v.out || help).trim().split('\n').pop() || `exit ${v.code}` };
    return { version: /version:?\s*([\d.]+)/i.exec(v.out + v.err)?.[1], sns: /--suppress-nst/.test(help), vad: /--vad\b/.test(help), ng: /--no-gpu\b/.test(help) };
  } catch (e) {
    return { sns: false, vad: false, ng: false, error: (e as Error).message };
  }
}

/** whisper.cpp as it is here: your own on the PATH first, then the app's. */
export async function findProgram(dir: string): Promise<Program | null> {
  const own = which('whisper-cli');
  if (own && !own.startsWith(dir + path.sep)) {
    const p = await probe(own);
    if (!p.error) return { path: own, version: p.version, source: 'yours', sizeBytes: 0, sns: p.sns, vad: p.vad, ng: p.ng };
  }
  const L = layout(dir);
  const cli = path.join(L.program, 'whisper-cli');
  if (!fs.existsSync(cli) || !fs.existsSync(path.join(L.program, MARKER))) return null;
  let source: Program['source'] = 'prebuilt';
  let gpu: WhisperGpu | undefined;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(L.program, MARKER), 'utf8'));
    source = m.source === 'built' ? 'built' : 'prebuilt';
    gpu = m.gpu === 'metal' || m.gpu === 'cuda' ? m.gpu : undefined;
    // Built on a Mac before the marker said so: with Metal, which ggml turns on for Apple's systems by default.
    if (!('gpu' in m) && source === 'built' && process.platform === 'darwin') gpu = 'metal';
  } catch {}
  const p = await probe(cli);
  if (p.error) return null;
  return { path: cli, version: p.version, source, sizeBytes: dirSize(L.program), gpu, sns: p.sns, vad: p.vad, ng: p.ng };
}

const cpu = () => (process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null);

/** What getting whisper.cpp downloads, as far as it is known before it starts. */
export function programBytes(src: Sources): number {
  const c = cpu();
  return (process.platform === 'linux' && c ? (src.prebuilt[c]?.bytes ?? 0) : 0) + (src.vad.bytes ?? 0);
}

type Report = (p: VoiceProgress) => void;

/**
 * Gets whisper.cpp into the voice folder: the ready-made build when it runs here, else a build from source, on a Mac
 * for its GPU (and, should that build fail, for its processor).
 */
export async function installProgram(dir: string, src: Sources, report: Report, signal: AbortSignal, m: Machine = thisMachine()): Promise<void> {
  const L = layout(dir);
  const c = cpu();
  const ready = process.platform === 'linux' && c ? src.prebuilt[c] : undefined;
  let why = 'There is no ready-made whisper.cpp for this system';
  if (ready) {
    const tgz = path.join(L.work, path.basename(new URL(ready.url).pathname));
    await fetchFile(ready, tgz, { signal, progress: (d, t) => report({ step: 'program', doneBytes: d, totalBytes: t, detail: `whisper.cpp ${WHISPER_VERSION}` }) });
    const tmp = `${L.program}.new`;
    fs.rmSync(tmp, { recursive: true, force: true });
    await untar(tgz, tmp);
    // Only the command and its libraries are kept: the tests, benchmarks and servers are left out.
    for (const f of fs.readdirSync(tmp)) if (f !== 'whisper-cli' && f !== 'LICENSE' && !/^lib.*\.so/.test(f)) fs.rmSync(path.join(tmp, f), { recursive: true, force: true });
    const p = await probe(path.join(tmp, 'whisper-cli'));
    if (!p.error) {
      fs.writeFileSync(path.join(tmp, MARKER), JSON.stringify({ version: p.version ?? WHISPER_VERSION, source: 'prebuilt', at: Date.now() }));
      fs.rmSync(L.program, { recursive: true, force: true });
      fs.renameSync(tmp, L.program);
      fs.rmSync(L.work, { recursive: true, force: true });
      return;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    why = `The ready-made whisper.cpp does not run here (${p.error})`;
  }
  const gpu = gpuToBuild(m);
  if (!gpu) return buildProgram(dir, src, report, signal, { gpu: null, why });
  buildTools(why);
  try {
    await buildProgram(dir, src, report, signal, { gpu, why });
  } catch (e) {
    if (signal.aborted) throw e;
    console.error(`[voice] building whisper.cpp for ${gpu} failed, so it is built for the processor: ${(e as Error).message}`);
    await buildProgram(dir, src, report, signal, { gpu: null, why });
  }
}

/** A build's compiler and make (or ninja); an error that says what to install when they are not here. */
function buildTools(why: string): { cxx: string; make: string | null; ninja: string | null } {
  const cxx = which('c++') ?? which('g++') ?? which('clang++');
  const make = which('make');
  const ninja = which('ninja');
  if (!cxx || (!make && !ninja))
    throw new Error(`${why}, and building it needs a C++ compiler and make (on Debian or Ubuntu: sudo apt install build-essential cmake). Or use an OpenAI-compatible service instead.`);
  return { cxx, make, ninja };
}

/** CMake's version ([3, 28]), or null when it does not say. */
async function cmakeVersion(cmake: string): Promise<number[] | null> {
  try {
    const m = /version (\d+)\.(\d+)/.exec((await run(cmake, ['--version'], { timeout: 15_000 })).out);
    return m ? [Number(m[1]), Number(m[2])] : null;
  } catch {
    return null;
  }
}

const atLeast = (v: number[] | null | undefined, min: number[]) => !!v && (v[0] > min[0] || (v[0] === min[0] && v[1] >= min[1]));

/**
 * CMake's settings for a build of whisper-cli: one program (static), for this machine's processor, and for a GPU:
 * Metal with its shaders inside the program (so it needs no file beside it, nor Xcode's Metal compiler), or CUDA for
 * the GPUs here only ("native", which CMake knows from 3.24; older ones leave the choice to ggml, a longer build).
 */
export function cmakeArgs(code: string, out: string, o: { gpu: WhisperGpu | null; ninja?: boolean; nvcc?: string | null; cmake?: number[] | null }): string[] {
  const args = ['-S', code, '-B', out, ...(o.ninja ? ['-G', 'Ninja'] : []), '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_SERVER=OFF', '-DWHISPER_SDL2=OFF', '-DWHISPER_CURL=OFF', '-DGGML_NATIVE=ON'];
  args.push(...(o.gpu === 'metal' ? ['-DGGML_METAL=ON', '-DGGML_METAL_EMBED_LIBRARY=ON'] : ['-DGGML_METAL=OFF']));
  if (o.gpu === 'cuda') {
    args.push('-DGGML_CUDA=ON', '-DGGML_CUDA_NCCL=OFF');
    if (o.nvcc) args.push(`-DCMAKE_CUDA_COMPILER=${o.nvcc}`);
    if (atLeast(o.cmake, [3, 24])) args.push('-DCMAKE_CUDA_ARCHITECTURES=native');
  } else args.push('-DGGML_CUDA=OFF');
  return args;
}

/** A build of whisper-cli from its source. */
export interface Build {
  /** The GPU it is for (null: the processor only). */
  gpu: WhisperGpu | null;
  /** Why it is built here, for an error that says what is missing. */
  why?: string;
  /** NVIDIA's CUDA compiler, for a CUDA build. */
  nvcc?: string | null;
  /** Its own folders (a build in the background has its own), and the folder the program goes to (the program's own by default). */
  work?: string;
  into?: string;
  /** A build in the background: at a lower priority, leaving a core free. */
  background?: boolean;
}

/** Builds whisper-cli from source, for a GPU or the processor, into the program's folder (or `b.into`). */
export async function buildProgram(dir: string, src: Sources, report: Report, signal: AbortSignal, b: Build): Promise<void> {
  const L = layout(dir);
  const work = b.work ?? L.work;
  const cmakeDir = b.work ? path.join(b.work, 'cmake') : L.cmake;
  const into = b.into ?? L.program;
  const { cxx, make, ninja } = buildTools(b.why ?? 'Building whisper.cpp here');
  const say = (percent: number, detail: string) => report({ step: 'build', doneBytes: 0, totalBytes: 0, percent, detail });
  // This machine's CMake, unless a build for an NVIDIA GPU needs a newer one (3.24, to build for the GPUs here only).
  let cmake = which('cmake');
  let version = cmake ? await cmakeVersion(cmake) : null;
  if (!cmake || !atLeast(version, b.gpu === 'cuda' ? [3, 24] : [3, 14])) {
    const c = cpu();
    const r = process.platform === 'linux' && c ? src.cmake[c] : undefined;
    if (!r && !cmake) throw new Error(`${b.why ?? 'Building whisper.cpp here'}, and building it needs CMake (brew install cmake, or your package manager), then try again.`);
    if (r) {
      const tgz = path.join(work, path.basename(new URL(r.url).pathname));
      await fetchFile(r, tgz, { signal, progress: (d, t) => report({ step: 'build', doneBytes: d, totalBytes: t, percent: 0, detail: BUILD_SAYS.cmake }) });
      fs.rmSync(cmakeDir, { recursive: true, force: true });
      await untar(tgz, cmakeDir);
      cmake = path.join(cmakeDir, 'bin', 'cmake');
      version = await cmakeVersion(cmake);
    }
  }
  const tgz = path.join(work, `whisper.cpp-${RELEASE}.tar.gz`);
  await fetchFile(src.source, tgz, { signal, progress: (d, t) => report({ step: 'build', doneBytes: d, totalBytes: t, percent: 0, detail: BUILD_SAYS.source }) });
  const code = path.join(work, 'src');
  const out = path.join(work, 'out');
  fs.rmSync(code, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
  await untar(tgz, code);
  say(1, BUILD_SAYS.prepare);
  const env: NodeJS.ProcessEnv = { ...process.env, CXX: cxx, ...(b.gpu === 'cuda' && b.nvcc ? { CUDACXX: b.nvcc } : {}) };
  const conf = await run(cmake!, cmakeArgs(code, out, { gpu: b.gpu, ninja: !make && !!ninja, nvcc: b.nvcc, cmake: version }), { timeout: 10 * 60_000, signal, env });
  if (conf.code !== 0) throw new Error(`Could not prepare the build of whisper.cpp: ${tail(conf.err || conf.out)}`);
  // A CUDA compiler takes a GB or two a file: no more at once than memory allows.
  const cores = os.availableParallelism();
  let jobs = Math.max(1, Math.min(cores - (b.background ? 1 : 0), 16));
  if (b.gpu === 'cuda') jobs = Math.max(1, Math.min(jobs, Math.floor((await availableMemory()) / (2 * 1024 ** 3))));
  const nice = b.background ? which('nice') : null;
  const args = ['--build', out, '--config', 'Release', '-j', String(jobs), '--target', 'whisper-cli'];
  const detail = BUILD_SAYS[b.gpu ?? 'cpu'];
  const done = await run(nice ?? cmake!, nice ? ['-n', '10', cmake!, ...args] : args, {
    timeout: (b.gpu === 'cuda' ? 120 : 60) * 60_000,
    signal,
    env,
    // make prints "[ 42%] Building…", ninja "[12/80] …"
    onLine: (l) => {
      const m = /^\[\s*(\d+)%\]/.exec(l) ?? null;
      const n = /^\[(\d+)\/(\d+)\]/.exec(l);
      const pct = m ? Number(m[1]) : n ? Math.round((Number(n[1]) / Number(n[2])) * 100) : null;
      if (pct != null) say(Math.max(2, Math.min(99, pct)), detail);
    },
  });
  const built = path.join(out, 'bin', 'whisper-cli');
  if (done.code !== 0 || !fs.existsSync(built)) throw new Error(`Could not build whisper.cpp: ${tail(done.err || done.out)}`);
  const tmp = `${into}.new`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  fs.copyFileSync(built, path.join(tmp, 'whisper-cli'));
  fs.chmodSync(path.join(tmp, 'whisper-cli'), 0o755);
  for (const f of ['LICENSE']) if (fs.existsSync(path.join(code, f))) fs.copyFileSync(path.join(code, f), path.join(tmp, f));
  const p = await probe(path.join(tmp, 'whisper-cli'));
  if (p.error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`whisper.cpp was built but does not run: ${p.error}`);
  }
  fs.writeFileSync(path.join(tmp, MARKER), JSON.stringify({ version: p.version ?? WHISPER_VERSION, source: 'built', gpu: b.gpu, at: Date.now() }));
  fs.rmSync(into, { recursive: true, force: true });
  fs.renameSync(tmp, into);
  // The source, the build and CMake are only needed to build.
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(cmakeDir, { recursive: true, force: true });
}

/** Puts a program built in the background (`from`) in the place of the one that runs, between two transcriptions. */
export function swapProgram(dir: string, from: string): Promise<void> {
  return exclusive(async () => {
    const L = layout(dir);
    const old = `${L.program}.old`;
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(L.program)) fs.renameSync(L.program, old);
    fs.renameSync(from, L.program);
    fs.rmSync(old, { recursive: true, force: true });
  });
}

const tail = (s: string) => s.trim().split('\n').slice(-3).join(' ').slice(0, 400);

/** Models in the voice folder, whole ones only. */
export function localModels(dir: string): { file: string; size: WhisperSize; english: boolean; sizeBytes: number }[] {
  const out: { file: string; size: WhisperSize; english: boolean; sizeBytes: number }[] = [];
  try {
    for (const f of fs.readdirSync(layout(dir).models)) {
      const m = /^ggml-(tiny|base|small|medium)(\.en)?\.bin$/.exec(f);
      if (m) out.push({ file: f, size: m[1] as WhisperSize, english: !!m[2], sizeBytes: fs.statSync(path.join(layout(dir).models, f)).size });
    }
  } catch {}
  return out;
}

// ---- transcribing ---------------------------------------------------------------------------------------

/** Threads for one transcription: whisper.cpp gains little past eight. */
const threads = () => Math.max(1, Math.min(8, os.availableParallelism() - 1));

// One transcription at a time: two at once would only share the same cores (or GPU).
let queue: Promise<unknown> = Promise.resolve();

/** Runs `fn` once no transcription (nor a change of the program) is under way. */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const job = queue.then(fn);
  queue = job.catch(() => {});
  return job;
}

/** Whether a program may run on a GPU: the app's copy built for one, or your own (which may be). */
export const mayUseGpu = (p: Program) => !!p.gpu || p.source === 'yours';

/**
 * whisper-cli's arguments for a recording. It runs on the GPU unless told not to (`cpu`: -ng); its notes on
 * stderr (no -np) say what it ran on.
 */
export function transcribeArgs(p: Program, o: { model: string; vad?: string; file: string; lang: string; cpu?: boolean }): string[] {
  const args = ['-m', o.model, '-f', o.file, '-l', o.lang || 'auto', '-t', String(threads()), '-nt'];
  if (p.sns) args.push('-sns');
  if (p.vad && o.vad && fs.existsSync(o.vad)) args.push('--vad', '-vm', o.vad);
  if (o.cpu && p.ng) args.push('-ng');
  return args;
}

/** A transcription: its words, what it ran on, and why the GPU failed when it went to the processor instead. */
export interface Heard {
  text: string;
  device: VoiceDevice | null;
  gpuError?: string;
}

/**
 * Turns a WAV, MP3 or FLAC file into text. `lang` is whisper's code ("de"), or "auto"; silence and noise give ''
 * when voice activity detection is at hand. On the GPU unless `cpu`; when the GPU fails (out of its memory, a
 * driver that does not answer), the same recording on the processor, and `gpuError` says why.
 */
export function transcribe(p: Program, o: { model: string; vad?: string; file: string; lang: string; timeout: number; cpu?: boolean }): Promise<Heard> {
  return exclusive(async () => {
    // In its own folder, so ggml looks for its parts (libggml-*.so) there and not where the app was started.
    const opts = { timeout: o.timeout, cwd: path.dirname(p.path) };
    let r = await run(p.path, transcribeArgs(p, o), opts);
    let gpuError: string | undefined;
    if (r.code !== 0 && !r.timedOut && !o.cpu && p.ng && mayUseGpu(p)) {
      const again = await run(p.path, transcribeArgs(p, { ...o, cpu: true }), opts);
      if (again.code === 0) gpuError = whyFailed(r);
      r = again;
    }
    if (r.code !== 0) throw new Error(`whisper.cpp could not read the recording: ${whyFailed(r)}`);
    return { text: clean(r.out), device: deviceOf(r.err), gpuError };
  });
}

/** What went wrong in a run, in a line: whisper.cpp's errors (stderr is long), else its last lines. */
export function whyFailed(r: RunResult): string {
  if (r.timedOut) return 'it took too long';
  const errors = (r.err || r.out)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /error|fail|out of memory|abort/i.test(l));
  return (errors.length ? errors.slice(-2).join(' ').slice(0, 300) : tail(r.err || r.out)) || `exit ${r.code}`;
}

/** GPU backends by the names ggml gives their devices ("CUDA0", "MTL0", "Vulkan0"), and their interfaces. */
const GPU_APIS: [RegExp, string][] = [
  [/^CUDA/i, 'CUDA'],
  [/^(MTL|Metal)/i, 'Metal'],
  [/^Vulkan/i, 'Vulkan'],
  [/^(ROCm|HIP)/i, 'ROCm'],
  [/^SYCL/i, 'SYCL'],
  [/^MUSA/i, 'MUSA'],
  [/^(GPU)?OpenCL/i, 'OpenCL'],
  [/^CANN/i, 'CANN'],
  [/^WebGPU/i, 'WebGPU'],
];
/** Backends that are no GPU: the processor's own, and helpers whisper.cpp also says it uses. */
const NOT_GPU = /^(CPU|BLAS|AMX|ACCEL|RPC|ZenDNN|OpenVINO)/i;
const apiOf = (dev: string) => GPU_APIS.find(([re]) => re.test(dev))?.[1] ?? dev.replace(/\d+$/, '');

/**
 * What whisper.cpp ran on, from its notes on stderr: "whisper_backend_init_gpu: using CUDA0 backend" (older
 * versions: "using Metal backend"), the GPU named by its driver's lines; "no GPU found", or a GPU that would not
 * start, is the processor. Null when it says neither (a copy that writes less).
 */
export function deviceOf(log: string): VoiceDevice | null {
  const dev = [...log.matchAll(/using (\S+) backend/g)].map((m) => m[1]).find((n) => !NOT_GPU.test(n));
  if (dev && !log.includes(`failed to initialize ${dev} backend`)) {
    const api = apiOf(dev);
    return { on: 'gpu', api, ...(gpuName(log, dev) ? { name: gpuName(log, dev) } : {}) };
  }
  if (dev || /no GPU found/.test(log)) return { on: 'cpu' };
  // Older versions say only where the model went ("whisper_model_load:    CUDA0 total size = …").
  const held = /whisper_model_load:\s+(\S+) total size/.exec(log)?.[1];
  if (held) return NOT_GPU.test(held) ? { on: 'cpu' } : { on: 'gpu', api: apiOf(held), ...(gpuName(log, held) ? { name: gpuName(log, held) } : {}) };
  return null;
}

/** The GPU's own name, from its driver's lines: CUDA's "Device 0: NVIDIA GeForce RTX 4090, …", Metal's "GPU name:   MTL0 (Apple M2 Pro)", Vulkan's "0 = AMD Radeon … (…)". */
function gpuName(log: string, dev: string): string | undefined {
  const n = /(\d+)$/.exec(dev)?.[1] ?? '0';
  const m =
    new RegExp(`^\\s*Device ${n}: ([^,\\n]+),`, 'm').exec(log) ??
    /GPU name:\s+(?:MTL\d+ \((.+)\)|(.+))$/m.exec(log) ??
    new RegExp(`ggml_vulkan: ${n} = (.+?) \\(`).exec(log) ??
    /found device: (.+)$/m.exec(log);
  const name = (m?.[1] ?? m?.[2])?.replace(/\s*\(dev p\d+\/v\d+\)$/, '').trim();
  return name || undefined;
}

/** The words of whisper's output, without the marks it writes for silence or music ("[BLANK_AUDIO]", "(music)"). */
export function clean(out: string): string {
  return out
    .split('\n')
    .map((l) => l.replace(/\[[^\]]*\]|\((?:silence|music|applause|laughter|noise|inaudible|blank_audio)[^)]*\)|\*[^*]*\*/gi, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
