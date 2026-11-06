// whisper.cpp on this machine: the program and its models, downloaded into the app's data folder only
// when speech recognition on the server is turned on. Linux gets whisper.cpp's own ready-made build (CPU,
// x64 or arm64); where that does not run (an older system) or there is none, it is built here from the
// same version's source, with this machine's compiler and CMake (downloaded too when there is none).
// A whisper-cli of your own on the PATH (one built for your GPU, say) is used as it is.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { VoiceProgress, WhisperSize } from '../../shared/voice.ts';
import { dirSize, fetchFile, run, untar, which, type Remote } from './fetch.ts';

/** The whisper.cpp release the app gets: build b5454, version 1.9.5. */
export const WHISPER_VERSION = '1.9.5';
const RELEASE = 'b5454';

/** Where things come from; tests point these elsewhere. */
export interface Sources {
  /** whisper.cpp's ready-made Linux build, by CPU. */
  prebuilt: Record<string, Remote>;
  /** The same version's source, for a build here. */
  source: Remote;
  /** CMake for a build, by CPU, when this machine has none. */
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
  /** Flags this copy knows: suppressing non-speech tokens, and voice activity detection. */
  sns: boolean;
  vad: boolean;
}

/** Folders in the app's voice folder. */
export const layout = (dir: string) => ({
  program: path.join(dir, 'whisper'),
  models: path.join(dir, 'models'),
  work: path.join(dir, 'build'),
  cmake: path.join(dir, 'cmake'),
  tmp: path.join(dir, 'tmp'),
});

/** How a whisper-cli answers: its version and the flags it knows; null when it does not run here. */
async function probe(cli: string): Promise<{ version?: string; sns: boolean; vad: boolean; error?: string }> {
  try {
    const v = await run(cli, ['--version'], { timeout: 15_000 });
    const h = await run(cli, ['--help'], { timeout: 15_000 });
    const help = h.out + h.err;
    if (!/--model/.test(help)) return { sns: false, vad: false, error: (v.err || v.out || help).trim().split('\n').pop() || `exit ${v.code}` };
    return { version: /version:?\s*([\d.]+)/i.exec(v.out + v.err)?.[1], sns: /--suppress-nst/.test(help), vad: /--vad\b/.test(help) };
  } catch (e) {
    return { sns: false, vad: false, error: (e as Error).message };
  }
}

/** whisper.cpp as it is here: your own on the PATH first, then the app's. */
export async function findProgram(dir: string): Promise<Program | null> {
  const own = which('whisper-cli');
  if (own && !own.startsWith(dir + path.sep)) {
    const p = await probe(own);
    if (!p.error) return { path: own, version: p.version, source: 'yours', sizeBytes: 0, sns: p.sns, vad: p.vad };
  }
  const L = layout(dir);
  const cli = path.join(L.program, 'whisper-cli');
  if (!fs.existsSync(cli) || !fs.existsSync(path.join(L.program, MARKER))) return null;
  let source: Program['source'] = 'prebuilt';
  try {
    source = JSON.parse(fs.readFileSync(path.join(L.program, MARKER), 'utf8')).source === 'built' ? 'built' : 'prebuilt';
  } catch {}
  const p = await probe(cli);
  if (p.error) return null;
  return { path: cli, version: p.version, source, sizeBytes: dirSize(L.program), sns: p.sns, vad: p.vad };
}

const cpu = () => (process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null);

/** What getting whisper.cpp downloads, as far as it is known before it starts. */
export function programBytes(src: Sources): number {
  const c = cpu();
  return (process.platform === 'linux' && c ? (src.prebuilt[c]?.bytes ?? 0) : 0) + (src.vad.bytes ?? 0);
}

type Report = (p: VoiceProgress) => void;

/** Gets whisper.cpp into the voice folder: the ready-made build when it runs here, else a build from source. */
export async function installProgram(dir: string, src: Sources, report: Report, signal: AbortSignal): Promise<void> {
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
  await buildProgram(dir, src, report, signal, why);
}

/** Builds whisper-cli from source (CPU), for systems the ready-made build does not run on. */
export async function buildProgram(dir: string, src: Sources, report: Report, signal: AbortSignal, why = 'Building whisper.cpp here'): Promise<void> {
  const L = layout(dir);
  const cxx = which('c++') ?? which('g++') ?? which('clang++');
  const make = which('make');
  const ninja = which('ninja');
  if (!cxx || (!make && !ninja))
    throw new Error(`${why}, and building it needs a C++ compiler and make (on Debian or Ubuntu: sudo apt install build-essential cmake). Or use an OpenAI-compatible service instead.`);
  let cmake = which('cmake');
  if (!cmake) {
    const c = cpu();
    const r = process.platform === 'linux' && c ? src.cmake[c] : undefined;
    if (!r) throw new Error(`${why}, and building it needs CMake (brew install cmake, or your package manager), then try again.`);
    const tgz = path.join(L.work, path.basename(new URL(r.url).pathname));
    await fetchFile(r, tgz, { signal, progress: (d, t) => report({ step: 'build', doneBytes: d, totalBytes: t, percent: 0, detail: 'Getting CMake to build whisper.cpp' }) });
    fs.rmSync(L.cmake, { recursive: true, force: true });
    await untar(tgz, L.cmake);
    cmake = path.join(L.cmake, 'bin', 'cmake');
  }
  const tgz = path.join(L.work, `whisper.cpp-${RELEASE}.tar.gz`);
  await fetchFile(src.source, tgz, { signal, progress: (d, t) => report({ step: 'build', doneBytes: d, totalBytes: t, percent: 0, detail: 'Getting whisper.cpp’s source' }) });
  const code = path.join(L.work, 'src');
  const out = path.join(L.work, 'out');
  fs.rmSync(code, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
  await untar(tgz, code);
  const say = (percent: number, detail: string) => report({ step: 'build', doneBytes: 0, totalBytes: 0, percent, detail });
  say(1, 'Preparing the build');
  const env = { ...process.env, CXX: cxx };
  const conf = await run(
    cmake,
    ['-S', code, '-B', out, ...(make ? [] : ['-G', 'Ninja']), '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_SERVER=OFF', '-DWHISPER_SDL2=OFF', '-DWHISPER_CURL=OFF', '-DGGML_NATIVE=ON'],
    { timeout: 10 * 60_000, signal, env },
  );
  if (conf.code !== 0) throw new Error(`Could not prepare the build of whisper.cpp: ${tail(conf.err || conf.out)}`);
  const jobs = Math.max(1, Math.min(os.availableParallelism(), 16));
  const b = await run(cmake, ['--build', out, '--config', 'Release', '-j', String(jobs), '--target', 'whisper-cli'], {
    timeout: 60 * 60_000,
    signal,
    env,
    // make prints "[ 42%] Building…", ninja "[12/80] …"
    onLine: (l) => {
      const m = /^\[\s*(\d+)%\]/.exec(l) ?? null;
      const n = /^\[(\d+)\/(\d+)\]/.exec(l);
      const pct = m ? Number(m[1]) : n ? Math.round((Number(n[1]) / Number(n[2])) * 100) : null;
      if (pct != null) say(Math.max(2, Math.min(99, pct)), 'Building whisper.cpp for this machine');
    },
  });
  const built = path.join(out, 'bin', 'whisper-cli');
  if (b.code !== 0 || !fs.existsSync(built)) throw new Error(`Could not build whisper.cpp: ${tail(b.err || b.out)}`);
  const tmp = `${L.program}.new`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  fs.copyFileSync(built, path.join(tmp, 'whisper-cli'));
  fs.chmodSync(path.join(tmp, 'whisper-cli'), 0o755);
  for (const f of ['LICENSE']) if (fs.existsSync(path.join(code, f))) fs.copyFileSync(path.join(code, f), path.join(tmp, f));
  const p = await probe(path.join(tmp, 'whisper-cli'));
  if (p.error) throw new Error(`whisper.cpp was built but does not run: ${p.error}`);
  fs.writeFileSync(path.join(tmp, MARKER), JSON.stringify({ version: p.version ?? WHISPER_VERSION, source: 'built', at: Date.now() }));
  fs.rmSync(L.program, { recursive: true, force: true });
  fs.renameSync(tmp, L.program);
  // The source, the build and CMake are only needed to build.
  fs.rmSync(L.work, { recursive: true, force: true });
  fs.rmSync(L.cmake, { recursive: true, force: true });
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

/** Threads for one transcription: whisper.cpp gains little past eight. */
const threads = () => Math.max(1, Math.min(8, os.availableParallelism() - 1));

// One transcription at a time: two at once would only share the same cores.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Turns a WAV, MP3 or FLAC file into text. `lang` is whisper's code ("de"), or "auto"; silence and
 * noise give '' when voice activity detection is at hand.
 */
export function transcribe(p: Program, o: { model: string; vad?: string; file: string; lang: string; timeout: number }): Promise<string> {
  const job = queue.then(async () => {
    const args = ['-m', o.model, '-f', o.file, '-l', o.lang || 'auto', '-t', String(threads()), '-nt', '-np'];
    if (p.sns) args.push('-sns');
    if (p.vad && o.vad && fs.existsSync(o.vad)) args.push('--vad', '-vm', o.vad);
    const r = await run(p.path, args, { timeout: o.timeout });
    if (r.code !== 0) throw new Error(`whisper.cpp could not read the recording: ${tail(r.err || r.out) || `exit ${r.code}`}`);
    return clean(r.out);
  });
  queue = job.catch(() => {});
  return job;
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

/** What whisper is told comes before, so it writes the "um"s and "uh"s it hears rather than leaving them out. */
const FILLER_PROMPT = 'Umm, let me think, like, hmm... Okay, uh, here is what I am, um, thinking.';

/** A word of a recording and when it is said (seconds). */
export interface TimedWord {
  w: string;
  a: number;
  b: number;
}

/** whisper.cpp's JSON with a word a segment (-ml 1 -sow): the words, punctuation joined to the word before. */
export function readTimedWords(json: string): TimedWord[] {
  let j: any;
  try {
    j = JSON.parse(json);
  } catch {
    return [];
  }
  const out: TimedWord[] = [];
  for (const s of Array.isArray(j?.transcription) ? j.transcription : []) {
    const text = String(s?.text ?? '').trim();
    const a = Number(s?.offsets?.from) / 1000;
    const b = Number(s?.offsets?.to) / 1000;
    if (!text || !Number.isFinite(a) || !Number.isFinite(b) || /^\[.*\]$|^\(.*\)$/.test(text)) continue;
    const last = out[out.length - 1];
    if (/^[\p{P}\p{S}]+$/u.test(text) && last) {
      last.w += text;
      last.b = Math.max(last.b, b);
      continue;
    }
    out.push({ w: text, a, b: Math.max(a + 0.01, b) });
  }
  return out;
}

/**
 * The words of a WAV file (16 kHz, one channel) and when each is said, filler words kept. `onProgress` hears how far
 * it is (0 to 1). In line with the other transcriptions: one at a time.
 */
export function transcribeWords(p: Program, o: { model: string; file: string; lang: string; timeout: number; onProgress?: (f: number) => void; signal?: AbortSignal }): Promise<TimedWord[]> {
  const job = queue.then(async () => {
    const base = o.file.replace(/\.wav$/i, '');
    const args = ['-m', o.model, '-f', o.file, '-l', o.lang || 'auto', '-t', String(threads()), '-ml', '1', '-sow', '-oj', '-of', base, '-pp', '--prompt', FILLER_PROMPT];
    if (p.sns) args.push('-sns');
    const r = await run(p.path, args, { timeout: o.timeout, signal: o.signal, onLine: (l) => {
      const m = /progress\s*=\s*(\d+)%/.exec(l);
      if (m) o.onProgress?.(Number(m[1]) / 100);
    } });
    if (r.code !== 0) throw new Error(`whisper.cpp could not read it: ${tail(r.err || r.out) || `exit ${r.code}`}`);
    try {
      return readTimedWords(fs.readFileSync(`${base}.json`, 'utf8'));
    } finally {
      fs.rmSync(`${base}.json`, { force: true });
    }
  });
  queue = job.catch(() => {});
  return job;
}
