// Speech recognition on the server, off until turned on in Settings → Voice. Turned on for whisper.cpp,
// it downloads what is missing (the program, the chosen model) with progress; a change of model while
// on downloads that one; cancelling or turning it off stops a download, and the files stay until
// removed. The other engine is any OpenAI-compatible service. Settings live in voice/config.json,
// readable by this user only (it may hold an API key).
// whisper.cpp runs on the GPU when there is one it can use, else on the processor. With an NVIDIA GPU and NVIDIA's
// CUDA toolkit, a whisper.cpp for that GPU is built in the background once the ready-made one (processor only)
// works, and takes its place when done; a build that failed is not tried again with the same toolkit until asked.
// What it ran on last is kept (voice/ran.json) and shown; a GPU that failed sends the next few minutes' recordings
// to the processor.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { VoiceDevice, VoiceEngine, VoicePatch, VoiceProgress, VoiceState, WhisperSize } from '../../shared/voice.ts';
import { BUILD_SAYS, WHISPER_MODELS, whisperLang } from '../../shared/voice.ts';
import { HttpError } from '../auth.ts';
import { ffmpegPath, readable, sniff, toWav, viaEndpoint, viaEndpointTimed } from './audio.ts';
import { dirSize, fetchFile, freeBytes } from './fetch.ts';
import {
  buildProgram,
  findProgram,
  installProgram,
  layout,
  localModels,
  modelFile,
  programBytes,
  SOURCES,
  swapProgram,
  thisMachine,
  transcribe,
  transcribeTimed,
  transcribeWords,
  VAD_FILE,
  type Heard,
  type Machine,
  type Program,
  type Sources,
  type Spoken,
  type TimedWord,
} from './whisper.ts';

interface Config {
  engine: VoiceEngine;
  size: WhisperSize;
  english: boolean;
  endpoint?: { url: string; model: string; apiKey?: string };
}

const DEFAULTS: Config = { engine: 'off', size: 'base', english: false };
const ENGINES: VoiceEngine[] = ['off', 'local', 'endpoint'];
/** OpenAI's limit too: about thirteen minutes of 16 kHz WAV. */
export const MAX_AUDIO = 25 * 1024 * 1024;
const GB = 1024 ** 3;
const human = (b: number) => (b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`);
const keyHint = (k?: string) => (k ? `${k.slice(0, 5)}…${k.slice(-4)}` : undefined);
/** After the GPU fails, recordings go straight to the processor for this long; then the GPU is tried again. */
export const GPU_RETRY_MS = 10 * 60_000;
/** Disk a build for an NVIDIA GPU takes while it runs: the source, CMake, and CUDA's objects for one GPU. */
const GPU_BUILD_BYTES = 3 * GB;
/** The CUDA build waits this long after the app starts, so the start is not slowed. */
const GPU_BUILD_DELAY_MS = 60_000;

/**
 * Whether to build whisper.cpp for this machine's NVIDIA GPU now: recognition on this machine is on, the program is
 * the app's own and for the processor only, Linux has an NVIDIA GPU and NVIDIA's CUDA compiler, nothing
 * else is being set up, and a build with that compiler has not failed already.
 */
export function wantsCudaBuild(o: { engine: VoiceEngine; prog: Program | null; machine: Machine; busy: boolean; failedWith?: string | null }): boolean {
  const p = o.prog;
  const m = o.machine;
  if (o.engine !== 'local' || o.busy || !p || p.source === 'yours' || p.gpu) return false;
  if (m.platform !== 'linux' || !m.nvidia || !m.nvcc) return false;
  return o.failedWith !== real(m.nvcc);
}

/** A path with its links followed: a CUDA toolkit's own folder (/usr/local/cuda → /usr/local/cuda-12.6). */
function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

interface Job {
  id: number;
  /** The model it is getting; another choice starts a new job. */
  want: string;
  abort: AbortController;
  progress: VoiceProgress;
}

/** A build for the NVIDIA GPU, in the background. */
interface GpuJob {
  abort: AbortController;
  percent: number;
  detail: string;
  done: Promise<void>;
}

export class VoiceService {
  private dir: string;
  private src: Sources;
  private onChange: (s: VoiceState) => void;
  private machine: (fresh?: boolean) => Machine;
  private cfg: Config;
  private prog: Program | null = null;
  /** The program as a file (its path, size and time), to tell what ran.json is about. */
  private progKey: string | null = null;
  private job: Job | null = null;
  /** The last download's end: the next one starts after it, since both would write the same folders. */
  private last: Promise<void> = Promise.resolve();
  private error?: string;
  private seq = 0;
  private timer: NodeJS.Timeout | null = null;
  /** What the program ran on the last time it was used, and which program that was. */
  private ran: { key: string; device: VoiceDevice } | null;
  /** The GPU failed (and the processor did the work) at this time, for this reason. */
  private gpuFail: { at: number; error: string } | null = null;
  private gpu: GpuJob | null = null;
  /** The last build for the NVIDIA GPU's end, stopped or not: removing everything waits for it. */
  private gpuDone: Promise<void> = Promise.resolve();
  /** The build for the NVIDIA GPU that failed: with which CUDA compiler, and why. */
  private gpuFailed: { nvcc: string; error: string; at: number } | null;
  private checking = false;

  constructor(o: { dir: string; sources?: Sources; onChange?: (s: VoiceState) => void; machine?: (fresh?: boolean) => Machine }) {
    this.dir = path.resolve(o.dir);
    this.src = o.sources ?? SOURCES;
    this.onChange = o.onChange ?? (() => {});
    this.machine = o.machine ?? thisMachine;
    this.cfg = this.load();
    this.ran = this.readJson('ran.json');
    this.gpuFailed = this.readJson('gpu-build.json');
  }

  private get file() {
    return path.join(this.dir, 'config.json');
  }

  private load(): Config {
    try {
      const c = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<Config>;
      return {
        engine: ENGINES.includes(c.engine as VoiceEngine) ? (c.engine as VoiceEngine) : 'off',
        size: WHISPER_MODELS.some((m) => m.size === c.size) ? (c.size as WhisperSize) : DEFAULTS.size,
        english: !!c.english,
        endpoint: c.endpoint?.url ? { url: c.endpoint.url, model: c.endpoint.model || 'whisper-1', apiKey: c.endpoint.apiKey } : undefined,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save() {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cfg, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  private readJson<T>(name: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private writeJson(name: string, v: unknown) {
    const f = path.join(this.dir, name);
    if (v == null) return fs.rmSync(f, { force: true });
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(f, JSON.stringify(v) + '\n');
  }

  /** Looks for whisper.cpp again (yours, or the app's). */
  private async refind() {
    this.prog = await findProgram(this.dir);
    try {
      const s = this.prog && fs.statSync(this.prog.path);
      this.progKey = s ? `${this.prog!.path}:${s.size}:${Math.round(s.mtimeMs)}` : null;
    } catch {
      this.progKey = null;
    }
  }

  /** Once the server is up: what is here; a download that was under way carries on. */
  async init() {
    await this.refind();
    // Scratch files of transcriptions cut short by a restart.
    fs.rmSync(layout(this.dir).tmp, { recursive: true, force: true });
    if (this.cfg.engine === 'local') {
      this.ensure();
      this.checkSoon();
      setTimeout(() => this.maybeBuildGpu(), GPU_BUILD_DELAY_MS).unref();
    }
    this.emit(true);
  }

  private modelPath = () => path.join(layout(this.dir).models, modelFile(this.cfg.size, this.cfg.english));
  private vadPath = () => path.join(layout(this.dir).models, VAD_FILE);

  /** Everything whisper.cpp needs for the chosen model is here. */
  private complete(): boolean {
    return !!this.prog && fs.existsSync(this.modelPath()) && (!this.prog.vad || fs.existsSync(this.vadPath()));
  }

  /** What turning it on would download now. */
  private need(): number {
    const model = fs.existsSync(this.modelPath()) ? 0 : (this.src.models(modelFile(this.cfg.size, this.cfg.english)).bytes ?? 0);
    const prog = this.prog ? (this.prog.vad && !fs.existsSync(this.vadPath()) ? (this.src.vad.bytes ?? 0) : 0) : programBytes(this.src);
    return model + prog;
  }

  /** Whether the next recording goes straight to the processor: the GPU failed a short while ago. */
  private cpuNow(): boolean {
    return !!this.gpuFail && Date.now() - this.gpuFail.at < GPU_RETRY_MS;
  }

  /** What the program ran on last; not known for another program than the one that ran. */
  private runsOn(): VoiceDevice | undefined {
    return this.ran && this.ran.key === this.progKey ? this.ran.device : undefined;
  }

  state(): VoiceState {
    const c = this.cfg;
    const status: VoiceState['local']['status'] = c.engine !== 'local' ? 'off' : this.job ? 'installing' : this.complete() ? 'ready' : 'failed';
    const p = this.prog;
    const gpuError = this.cpuNow() ? this.gpuFail?.error : undefined;
    return {
      engine: c.engine,
      ready: c.engine === 'local' ? status === 'ready' : c.engine === 'endpoint' ? !!c.endpoint?.url : false,
      local: {
        size: c.size,
        english: c.english,
        status,
        progress: this.job?.progress,
        error: status === 'failed' ? (this.error ?? 'whisper.cpp is not downloaded yet.') : undefined,
        program: p ? { version: p.version, source: p.source, sizeBytes: p.sizeBytes, gpu: p.gpu, runsOn: this.runsOn(), gpuError } : undefined,
        gpuBuild: this.gpuBuild(),
        models: localModels(this.dir).map(({ file: _f, ...m }) => m),
        needBytes: this.need(),
      },
      endpoint: c.endpoint ? { url: c.endpoint.url, model: c.endpoint.model, keyHint: keyHint(c.endpoint.apiKey) } : undefined,
      ffmpeg: !!ffmpegPath(),
    };
  }

  /** The build for the NVIDIA GPU: under way, failed, or needing the CUDA toolkit; nothing where there is no such GPU or it is not wanted. */
  private gpuBuild(): VoiceState['local']['gpuBuild'] {
    if (this.gpu) return { status: 'building', percent: this.gpu.percent, detail: this.gpu.detail };
    const p = this.prog;
    const m = this.machine();
    if (this.cfg.engine !== 'local' || !p || p.source === 'yours' || p.gpu || m.platform !== 'linux' || !m.nvidia) return undefined;
    if (!m.nvcc) return { status: 'needs-toolkit' };
    if (this.gpuFailed && this.gpuFailed.nvcc === real(m.nvcc)) return { status: 'failed', error: this.gpuFailed.error };
    return undefined;
  }

  /** Tells the pages; while a download runs, a few times a second at most. */
  private emit(now = false) {
    if (now) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      return this.onChange(this.state());
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onChange(this.state());
    }, 300);
  }

  async configure(p: VoicePatch): Promise<VoiceState> {
    const c = this.cfg;
    if (p.endpoint) {
      const url = String(p.endpoint.url ?? '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/audio\/transcriptions$/, '');
      if (!/^https?:\/\/[^\s/]+/.test(url)) throw new HttpError(400, 'Give the service’s address, like https://api.openai.com/v1');
      const key = p.endpoint.apiKey === undefined ? c.endpoint?.apiKey : p.endpoint.apiKey?.trim() || undefined;
      c.endpoint = { url, model: String(p.endpoint.model ?? '').trim() || 'whisper-1', apiKey: key };
    }
    if (p.size !== undefined) {
      if (!WHISPER_MODELS.some((m) => m.size === p.size)) throw new HttpError(400, 'Pick tiny, base, small or medium');
      c.size = p.size;
    }
    if (p.english !== undefined) c.english = !!p.english;
    if (p.engine !== undefined) {
      if (!ENGINES.includes(p.engine)) throw new HttpError(400, 'Pick off, local or endpoint');
      if (p.engine === 'endpoint' && !c.endpoint?.url) throw new HttpError(400, 'Give the service’s address first');
      c.engine = p.engine;
    }
    this.save();
    if (c.engine === 'local') {
      // Looked for again: a whisper-cli of your own may have come, or the app's copy gone, since.
      if (!this.job && !this.gpu) await this.refind();
      this.ensure();
      this.maybeBuildGpu();
      this.checkSoon();
    } else {
      this.stopJob();
      this.stopGpu();
    }
    this.emit(true);
    return this.state();
  }

  /** Downloads what the chosen model needs, once; choosing another model while it runs starts over. */
  private ensure() {
    const want = modelFile(this.cfg.size, this.cfg.english);
    if (this.job?.want === want) return;
    const prev = this.job;
    prev?.abort.abort();
    if (!prev && this.complete()) {
      this.error = undefined;
      this.job = null;
      return;
    }
    const id = ++this.seq;
    const abort = new AbortController();
    this.error = undefined;
    const job: Job = { id, want, abort, progress: { step: this.prog ? 'model' : 'program', doneBytes: 0, totalBytes: 0 } };
    this.job = job;
    this.last = this.last.then(() => this.install(job));
  }

  private async install(job: Job) {
    const signal = job.abort.signal;
    const report = (p: VoiceProgress) => {
      if (this.job !== job) return;
      job.progress = p;
      this.emit();
    };
    try {
      if (signal.aborted) return;
      const L = layout(this.dir);
      if (!this.prog) {
        this.room(programBytes(this.src), 'whisper.cpp');
        await installProgram(this.dir, this.src, report, signal, this.machine());
        await this.refind();
        if (!this.prog) throw new Error('whisper.cpp was downloaded but does not run here');
      }
      if (this.prog.vad && !fs.existsSync(this.vadPath()))
        await fetchFile(this.src.vad, this.vadPath(), { signal, progress: (d, t) => report({ step: 'program', doneBytes: d, totalBytes: t, detail: 'Voice activity detection, so silence gives no words' }) });
      const file = modelFile(this.cfg.size, this.cfg.english);
      if (file !== job.want) return;
      const dest = path.join(L.models, file);
      if (!fs.existsSync(dest)) {
        const r = this.src.models(file);
        const label = WHISPER_MODELS.find((m) => m.size === this.cfg.size)?.label ?? this.cfg.size;
        this.room(r.bytes ?? 0, `The ${label} model`);
        await fetchFile(r, dest, { signal, progress: (d, t) => report({ step: 'model', doneBytes: d, totalBytes: t, detail: `${label} model${this.cfg.english ? ', English only' : ''}` }) });
      }
    } catch (e) {
      if (this.job === job && !signal.aborted) this.error = (e as Error).message;
    } finally {
      if (this.job === job) this.job = null;
      // A download stopped on purpose leaves nothing half-done behind.
      if (signal.aborted) this.dropPartial(job.want);
      else if (this.complete()) {
        this.checkSoon();
        this.maybeBuildGpu();
      }
      this.emit(true);
    }
  }

  /** Refuses a download the disk has no room for (with some to spare). */
  private room(bytes: number, what: string) {
    const free = freeBytes(this.dir);
    if (bytes && free < bytes + 200 * 1024 ** 2) throw new Error(`Not enough disk space: ${what} needs ${human(bytes)}, and ${human(Math.max(0, free))} is free.`);
  }

  private dropPartial(want: string) {
    const L = layout(this.dir);
    fs.rmSync(path.join(L.models, `${want}.part`), { force: true });
    if (!this.prog) fs.rmSync(L.work, { recursive: true, force: true });
  }

  private stopJob() {
    if (!this.job) return;
    this.job.abort.abort();
    this.job = null;
    this.error = undefined;
  }

  // ---- whisper.cpp for an NVIDIA GPU ----------------------------------------------------------------------

  /** Starts building whisper.cpp for the NVIDIA GPU, in the background, when it is wanted (wantsCudaBuild). */
  private maybeBuildGpu() {
    const m = this.machine();
    const go = wantsCudaBuild({ engine: this.cfg.engine, prog: this.prog, machine: m, busy: !!this.job || !!this.gpu, failedWith: this.gpuFailed?.nvcc });
    if (!go || !m.nvcc) return;
    const nvcc = m.nvcc;
    const abort = new AbortController();
    const job: GpuJob = { abort, percent: 0, detail: BUILD_SAYS.cuda, done: Promise.resolve() };
    this.gpu = job;
    const report = (p: VoiceProgress) => {
      if (this.gpu !== job) return;
      job.percent = p.percent ?? 0;
      job.detail = p.detail ?? BUILD_SAYS.cuda;
      this.emit();
    };
    const L = layout(this.dir);
    const tidy = () => {
      for (const d of [L.gpuWork, L.gpuProgram, `${L.gpuProgram}.new`]) fs.rmSync(d, { recursive: true, force: true });
    };
    job.done = (async () => {
      try {
        this.room(GPU_BUILD_BYTES, 'Building whisper.cpp for the NVIDIA GPU');
        await buildProgram(this.dir, this.src, report, abort.signal, { gpu: 'cuda', nvcc, work: L.gpuWork, into: L.gpuProgram, background: true, why: 'Building whisper.cpp for the NVIDIA GPU' });
        if (abort.signal.aborted) return;
        await swapProgram(this.dir, L.gpuProgram);
        this.gpuFailed = null;
        this.writeJson('gpu-build.json', null);
        await this.refind();
        console.log('[voice] whisper.cpp is built for the NVIDIA GPU (CUDA)');
      } catch (e) {
        if (abort.signal.aborted) return;
        const error = (e as Error).message;
        console.error(`[voice] building whisper.cpp for the NVIDIA GPU failed: ${error}`);
        this.gpuFailed = { nvcc: real(nvcc), error, at: Date.now() };
        this.writeJson('gpu-build.json', this.gpuFailed);
      } finally {
        tidy();
        if (this.gpu === job) this.gpu = null;
        if (!abort.signal.aborted) this.checkSoon();
        this.emit(true);
      }
    })();
    this.gpuDone = job.done;
  }

  /** Stops a build for the NVIDIA GPU under way. */
  private stopGpu() {
    if (!this.gpu) return;
    this.gpu.abort.abort();
    this.gpu = null;
  }

  /** Builds whisper.cpp for the NVIDIA GPU again: after a build that failed, or once the CUDA toolkit is installed. */
  async retryGpu(): Promise<VoiceState> {
    this.machine(true);
    this.gpuFailed = null;
    this.writeJson('gpu-build.json', null);
    if (this.cfg.engine === 'local') this.maybeBuildGpu();
    this.emit(true);
    return this.state();
  }

  /** Stops a download under way and turns recognition on the server off. */
  cancel(): VoiceState {
    this.stopJob();
    this.stopGpu();
    if (this.cfg.engine === 'local') {
      this.cfg.engine = 'off';
      this.save();
    }
    this.emit(true);
    return this.state();
  }

  /** Removes one model, or everything downloaded (whisper.cpp too, unless it is your own). */
  async remove(p: { size?: WhisperSize; english?: boolean; all?: boolean }): Promise<VoiceState> {
    const L = layout(this.dir);
    const current = p.all || (p.size === this.cfg.size && !!p.english === this.cfg.english);
    if (current && this.cfg.engine === 'local') {
      this.stopJob();
      this.stopGpu();
      this.cfg.engine = 'off';
      this.save();
    }
    if (p.all) {
      this.stopJob();
      this.stopGpu();
      await this.gpuDone.catch(() => {});
      await this.last;
      for (const d of [L.program, L.models, L.work, L.cmake, L.tmp, L.gpuWork, L.gpuProgram, `${L.program}.new`, `${L.gpuProgram}.new`]) fs.rmSync(d, { recursive: true, force: true });
      for (const f of ['ran.json', 'gpu-build.json']) this.writeJson(f, null);
      this.ran = null;
      this.gpuFailed = null;
      this.gpuFail = null;
      await this.refind();
    } else if (p.size) {
      if (!WHISPER_MODELS.some((m) => m.size === p.size)) throw new HttpError(400, 'Which model?');
      const f = path.join(L.models, modelFile(p.size, !!p.english));
      fs.rmSync(f, { force: true });
      fs.rmSync(`${f}.part`, { force: true });
    } else throw new HttpError(400, 'Which model?');
    this.error = undefined;
    this.emit(true);
    return this.state();
  }

  // ---- transcribing ---------------------------------------------------------------------------------------

  /** The text of a recording, from the engine that is on. `lang` is the browser's ("de-DE"). */
  async transcribe(audio: Buffer, lang: string): Promise<{ text: string; ms: number }> {
    const t0 = Date.now();
    const c = this.cfg;
    if (audio.length < 64) throw new HttpError(400, 'The recording is empty');
    const code = whisperLang(lang) || 'auto';
    if (c.engine === 'endpoint' && c.endpoint) return { text: await viaEndpoint(c.endpoint, audio, code), ms: Date.now() - t0 };
    if (c.engine !== 'local') throw new HttpError(409, 'Speech recognition on the server is off: turn it on in Settings → Voice.');
    if (!this.prog || !this.complete()) throw new HttpError(409, this.job ? 'whisper.cpp is still downloading: try again in a moment.' : 'whisper.cpp is not ready: see Settings → Voice.');
    const tmp = layout(this.dir).tmp;
    fs.mkdirSync(tmp, { recursive: true });
    const id = crypto.randomUUID();
    const kind = sniff(audio);
    const raw = path.join(tmp, `${id}.${kind === 'unknown' ? 'bin' : kind}`);
    const wav = path.join(tmp, `${id}.16k.wav`);
    fs.writeFileSync(raw, audio);
    try {
      // whisper.cpp reads WAV (the browser sends it when it can), MP3 and FLAC; anything else goes through ffmpeg.
      if (!readable(kind)) await toWav(raw, wav);
      const prog = this.prog;
      const key = this.progKey;
      const cpu = this.cpuNow();
      const heard = await transcribe(prog, {
        model: this.modelPath(),
        vad: this.vadPath(),
        file: readable(kind) ? raw : wav,
        lang: c.english ? 'en' : code,
        timeout: 10 * 60_000,
        cpu,
      });
      this.heard(heard, key, cpu);
      return { text: heard.text, ms: Date.now() - t0 };
    } finally {
      fs.rmSync(raw, { force: true });
      fs.rmSync(wav, { force: true });
    }
  }

  /**
   * The words of a sound file and when each is said, with whisper.cpp on this computer (the sound editor's words):
   * read into a 16 kHz WAV first with ffmpeg. Throws, in words a person can act on, when it is not set up.
   */
  async words(file: string, o: { onProgress?: (f: number) => void; signal?: AbortSignal } = {}): Promise<{ words: TimedWord[]; lang: string }> {
    const c = this.cfg;
    if (c.engine !== 'local') throw new HttpError(409, c.engine === 'endpoint' ? 'Words over the sound need speech recognition on this computer (whisper.cpp): pick it in Settings → Voice.' : 'Speech recognition on the server is off: turn it on in Settings → Voice.');
    if (!this.prog || !this.complete()) throw new HttpError(409, this.job ? 'whisper.cpp is still downloading: try again in a moment.' : 'whisper.cpp is not ready: see Settings → Voice.');
    const tmp = layout(this.dir).tmp;
    fs.mkdirSync(tmp, { recursive: true });
    const wav = path.join(tmp, `${crypto.randomUUID()}.words.wav`);
    try {
      await toWav(file, wav, 4 * 3600_000);
      const lang = c.english ? 'en' : 'auto';
      return { words: await transcribeWords(this.prog, { model: this.modelPath(), file: wav, lang, timeout: 4 * 3600_000, cpu: this.cpuNow(), onProgress: o.onProgress, signal: o.signal }), lang };
    } finally {
      fs.rmSync(wav, { force: true });
    }
  }

  /**
   * The speech in a 16 kHz WAV file with its times, from the engine that is on (the video editor's captions). `lang` is
   * whisper's code or the browser's ("de-DE"), or '' to tell by ear.
   */
  async transcribeTimed(file: string, lang: string): Promise<Spoken[]> {
    const c = this.cfg;
    const code = whisperLang(lang) || 'auto';
    if (c.engine === 'endpoint' && c.endpoint) {
      const audio = fs.readFileSync(file);
      if (audio.length > MAX_AUDIO) throw new HttpError(413, 'The sound is too long for the transcription service in one go (about 13 minutes at most): use whisper.cpp on this computer (Settings → Voice), or make captions for a shorter part');
      return viaEndpointTimed(c.endpoint, audio, code);
    }
    if (c.engine !== 'local') throw new HttpError(409, 'Captions need speech recognition on this computer: turn it on in Settings → Voice → Speech recognition on the server (whisper.cpp, downloaded once).');
    if (!this.prog || !this.complete()) throw new HttpError(409, this.job ? 'whisper.cpp is still downloading: try again in a moment.' : 'whisper.cpp is not ready: see Settings → Voice.');
    return transcribeTimed(this.prog, { model: this.modelPath(), vad: this.vadPath(), file, lang: c.english ? 'en' : code, timeout: 30 * 60_000, cpu: this.cpuNow() });
  }

  /** Keeps what a transcription ran on, and whether the GPU failed in it (or worked again). */
  private heard(h: Heard, key: string | null, cpu: boolean) {
    const before = JSON.stringify(this.state().local.program);
    if (h.gpuError) this.gpuFail = { at: Date.now(), error: h.gpuError };
    else if (!cpu) this.gpuFail = null;
    if (h.device && key && key === this.progKey && JSON.stringify(this.ran) !== JSON.stringify({ key, device: h.device })) {
      this.ran = { key, device: h.device };
      this.writeJson('ran.json', this.ran);
    }
    if (JSON.stringify(this.state().local.program) !== before) this.emit(true);
  }

  /** Soon after whisper.cpp is ready, a second of silence through it: what it runs on shows without waiting for a recording. */
  private checkSoon() {
    if (this.checking || this.cfg.engine !== 'local' || !this.complete() || this.runsOn()) return;
    this.checking = true;
    setTimeout(() => {
      if (this.cfg.engine !== 'local' || !this.complete()) return void (this.checking = false);
      this.transcribe(silentWav(1), 'en')
        .catch((e) => console.error(`[voice] whisper.cpp did not answer: ${(e as Error).message}`))
        .finally(() => (this.checking = false));
    }, 1000).unref();
  }

  /** A second of silence through the engine that is on: whether it answers, and how fast. */
  async test(): Promise<{ ok: true; ms: number; text: string }> {
    const r = await this.transcribe(silentWav(1), 'en');
    return { ok: true, ...r };
  }

  /** Disk the voice folder takes. */
  used = () => dirSize(this.dir);
}

/** `seconds` of 16 kHz mono silence as WAV. */
export function silentWav(seconds: number): Buffer {
  const n = Math.round(16000 * seconds);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(n * 2, 40);
  return b;
}
