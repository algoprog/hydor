// Speech recognition on the server, off until turned on in Settings → Voice. Turned on for whisper.cpp,
// it downloads what is missing (the program, the chosen model) with progress; a change of model while
// on downloads that one; cancelling or turning it off stops a download, and the files stay until
// removed. The other engine is any OpenAI-compatible service. Settings live in voice/config.json,
// readable by this user only (it may hold an API key).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { VoiceEngine, VoicePatch, VoiceProgress, VoiceState, WhisperSize } from '../../shared/voice.ts';
import { WHISPER_MODELS, whisperLang } from '../../shared/voice.ts';
import { HttpError } from '../auth.ts';
import { ffmpegPath, readable, sniff, toWav, viaEndpoint, viaEndpointTimed } from './audio.ts';
import { dirSize, fetchFile, freeBytes } from './fetch.ts';
import { findProgram, installProgram, layout, localModels, modelFile, programBytes, SOURCES, transcribe, transcribeTimed, transcribeWords, VAD_FILE, type Program, type Sources, type Spoken, type TimedWord } from './whisper.ts';

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

interface Job {
  id: number;
  /** The model it is getting; another choice starts a new job. */
  want: string;
  abort: AbortController;
  progress: VoiceProgress;
}

export class VoiceService {
  private dir: string;
  private src: Sources;
  private onChange: (s: VoiceState) => void;
  private cfg: Config;
  private prog: Program | null = null;
  private job: Job | null = null;
  /** The last download's end: the next one starts after it, since both would write the same folders. */
  private last: Promise<void> = Promise.resolve();
  private error?: string;
  private seq = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(o: { dir: string; sources?: Sources; onChange?: (s: VoiceState) => void }) {
    this.dir = o.dir;
    this.src = o.sources ?? SOURCES;
    this.onChange = o.onChange ?? (() => {});
    this.cfg = this.load();
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

  /** Once the server is up: what is here; a download that was under way carries on. */
  async init() {
    this.prog = await findProgram(this.dir);
    // Scratch files of transcriptions cut short by a restart.
    fs.rmSync(layout(this.dir).tmp, { recursive: true, force: true });
    if (this.cfg.engine === 'local') this.ensure();
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

  state(): VoiceState {
    const c = this.cfg;
    const status: VoiceState['local']['status'] = c.engine !== 'local' ? 'off' : this.job ? 'installing' : this.complete() ? 'ready' : 'failed';
    return {
      engine: c.engine,
      ready: c.engine === 'local' ? status === 'ready' : c.engine === 'endpoint' ? !!c.endpoint?.url : false,
      local: {
        size: c.size,
        english: c.english,
        status,
        progress: this.job?.progress,
        error: status === 'failed' ? (this.error ?? 'whisper.cpp is not downloaded yet.') : undefined,
        program: this.prog ? { version: this.prog.version, source: this.prog.source, sizeBytes: this.prog.sizeBytes } : undefined,
        models: localModels(this.dir).map(({ file: _f, ...m }) => m),
        needBytes: this.need(),
      },
      endpoint: c.endpoint ? { url: c.endpoint.url, model: c.endpoint.model, keyHint: keyHint(c.endpoint.apiKey) } : undefined,
      ffmpeg: !!ffmpegPath(),
    };
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
      if (!this.job) this.prog = await findProgram(this.dir);
      this.ensure();
    } else this.stopJob();
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
        await installProgram(this.dir, this.src, report, signal);
        this.prog = await findProgram(this.dir);
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

  /** Stops a download under way and turns recognition on the server off. */
  cancel(): VoiceState {
    this.stopJob();
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
      this.cfg.engine = 'off';
      this.save();
    }
    if (p.all) {
      this.stopJob();
      await this.last;
      for (const d of [L.program, L.models, L.work, L.cmake, L.tmp, `${L.program}.new`]) fs.rmSync(d, { recursive: true, force: true });
      this.prog = await findProgram(this.dir);
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
      const text = await transcribe(this.prog, {
        model: this.modelPath(),
        vad: this.vadPath(),
        file: readable(kind) ? raw : wav,
        lang: c.english ? 'en' : code,
        timeout: 10 * 60_000,
      });
      return { text, ms: Date.now() - t0 };
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
      return { words: await transcribeWords(this.prog, { model: this.modelPath(), file: wav, lang, timeout: 4 * 3600_000, onProgress: o.onProgress, signal: o.signal }), lang };
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
    return transcribeTimed(this.prog, { model: this.modelPath(), vad: this.vadPath(), file, lang: c.english ? 'en' : code, timeout: 30 * 60_000 });
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
