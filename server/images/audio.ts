// Audio through OpenRouter: its models that make sound, and one generation. OpenRouter serves them two ways:
// - speech models (output "speech": ElevenLabs, Gemini TTS, Fish Audio, MAI… and Seed Audio, which takes a
//   description of a voice, of sound effects or of ambience rather than words to read) answer its speech API
//   (/audio/speech) with the sound itself, MP3 or raw PCM (made a WAV here); a voice can be copied from short
//   samples (input_references) where the model's endpoints say they take them;
// - chat models with sound out (output "audio": Google's Lyria for songs, OpenAI's gpt-audio voices) answer a
//   streamed chat completion, the sound in base64 pieces, the lyrics or notes as text.
// What is made is saved into the session's folder (audio/), never over a file that is there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AudioModel } from '../../shared/media.ts';
import { hasFfmpeg, voiceClip } from '../media/frames.ts';
import { HEADERS, slug } from './openrouter.ts';

/** The app's choices, first one OpenRouter still lists: Google's Lyria for music; ByteDance's Seed Audio for voices and sounds, then two voices. */
export const PREFERRED_MUSIC = ['google/lyria-3-pro-preview', 'google/lyria-3-clip-preview'];
export const PREFERRED_SPEECH = ['bytedance-seed/seed-audio-1-0', 'google/gemini-3.8-flash-tts', 'elevenlabs/eleven-v3'];

/** Speech goes at about 15 characters a second (150 words a minute): for its length, and so its price. */
export const CHARS_PER_SECOND = 15;

/** OpenAI's gpt-audio voices (OpenRouter lists none for it). */
const GPT_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

/** Audio tokens in a second of sound: about 25 for Google's speech, 20 for OpenAI's gpt-audio (their prices are by the token). */
const tokensPerSecond = (id: string) => (id.startsWith('google/') ? 25 : 20);

/** How raw sound comes, when a model sends it without a header: Lyria 48 kHz stereo, the voices 24 kHz mono (16-bit). */
export const pcmOf = (id: string) => (/lyria/i.test(id) ? { rate: 48_000, channels: 2 } : { rate: 24_000, channels: 1 });

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** A chat model that makes music rather than speaks: Lyria, or one whose words say so. */
const makesMusic = (id: string, description: string) => /lyria|music|song/i.test(id) || /\b(music|songs?)\b/i.test(description.slice(0, 160));

/** "$0.08 per song", "$0.04 per clip": a price OpenRouter writes in the description only (Lyria's prices say 0). */
export function songPrice(description: string): number | undefined {
  const m = /\$\s*(\d+(?:\.\d+)?)\s*(?:per|a|an|for each|each)\s+(?:full[- ]length\s+)?(?:song|clip|track|generation)/i.exec(description);
  return m ? Number(m[1]) : undefined;
}

/** One model from OpenRouter's catalog: `via` is how it is asked (its speech API, or a chat). */
export function audioModel(m: any, via: 'speech' | 'chat'): AudioModel {
  const id = String(m.id);
  const name = String(m.name ?? id);
  const full = typeof m.description === 'string' ? m.description.replace(/\s+/g, ' ').trim() : '';
  const music = via === 'chat' && makesMusic(id, full);
  const p = m.pricing ?? {};
  const listed = Array.isArray(m.supported_voices) ? m.supported_voices.map(String).filter((v: string) => v.trim()) : [];
  const voices = listed.length ? listed : via === 'chat' && !music && /^openai\/gpt-.*audio/.test(id) ? GPT_VOICES : [];
  const google = /^google\/.*tts/.test(id);
  const fish = id.startsWith('fish-audio/');
  const out: AudioModel = {
    id,
    label: name.replace(/^[^:]+:\s*/, ''),
    org: name.includes(':') ? name.slice(0, name.indexOf(':')).trim() : undefined,
    description: full ? full.slice(0, 300) : undefined,
    created: Number(m.created) ? Number(m.created) * 1000 : undefined,
    kind: music ? 'music' : 'speech',
    via,
    // Seed Audio reads its input as a prompt (OpenRouter's docs): what to say, how, and any sound around it. (Not a
    // model that merely mentions sound effects: it would read the description aloud.)
    ...(via === 'speech' && (/seed-audio/.test(id) || /produces speech and other audio from a natural-language/i.test(full)) ? { prompted: true } : {}),
    ...(voices.length ? { voices } : {}),
    // Directions for the delivery: gpt-4o-mini-tts, Gemini's and Fish Audio's (others ignore them); gpt-audio is told them first.
    ...((via === 'speech' && (google || fish || /gpt-4o-mini-tts/.test(id))) || (via === 'chat' && !music) ? { instructions: true } : {}),
    // A conversation in turns: Gemini's and Fish Audio's, but S1.
    ...(via === 'speech' && (google || (fish && !/\/s1\b/.test(id))) ? { multiSpeaker: true } : {}),
    // Gemini and HeyGen answer only raw sound (a WAV here), MiniMax only MP3.
    formats: via === 'speech' && (google || id.startsWith('heygen/')) ? ['wav'] : via === 'speech' && id.startsWith('minimax/') ? ['mp3'] : ['mp3', 'wav'],
    ...(maxSeconds(id, full) ? { maxSeconds: maxSeconds(id, full) } : {}),
  };
  if (music) {
    const song = songPrice(full) ?? (num(p.request) || undefined);
    if (song) out.perSong = song;
    // Lyria's prices say 0 and its description says what it costs: free only when OpenRouter's id says so.
    else if (id.endsWith(':free')) out.free = true;
    return out;
  }
  const input = num(p.prompt);
  const output = via === 'chat' ? num(p.audio_output) || num(p.completion) : num(p.completion);
  const tps = tokensPerSecond(id);
  // Speech models sell by the character (prompt), by the second made (completion alone: Seed Audio) or by the token (both: Gemini's).
  if (via === 'chat' || (input && output)) {
    if (input || output) {
      out.perToken = { input, output };
      out.perMinute = (output * tps + (input * CHARS_PER_SECOND) / 4) * 60;
    }
  } else if (output) {
    out.perSecond = output;
    out.perMinute = output * 60;
  } else if (input) {
    out.perChar = input;
    out.perMinute = input * CHARS_PER_SECOND * 60;
  }
  // Nothing to pay where OpenRouter lists a price of 0 (not where it lists none).
  if (!input && !output && (p.prompt !== undefined || p.completion !== undefined || id.endsWith(':free'))) {
    out.free = true;
    out.perMinute = 0;
  }
  return out;
}

/** The longest a model makes, in seconds, when known: Lyria 3 Clip's 30, Lyria 3 Pro's 3 minutes, Seed Audio's 2. */
function maxSeconds(id: string, description: string): number | undefined {
  if (/lyria-3-clip/.test(id)) return 30;
  if (/lyria-3-pro/.test(id)) return 180;
  if (/seed-audio/.test(id)) return 120;
  const m = /(\d+)[\s-]second (?:duration )?clips?/i.exec(description);
  return m ? Number(m[1]) : undefined;
}

let cache: { at: number; list: AudioModel[] } | null = null;

/** OpenRouter's models that make sound, kept for an hour (the lists need no key): its speech models and its chat models with sound out. */
export async function audioModels(base: string): Promise<AudioModel[]> {
  if (cache && Date.now() - cache.at < 3600_000) return cache.list;
  const get = (q: string) => fetch(`${base}/models?output_modalities=${q}`, { headers: HEADERS, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const [speech, chat] = await Promise.all([get('speech'), get('audio')]);
  if (!speech?.ok && !chat?.ok) throw new Error(`OpenRouter answered ${speech?.status ?? chat?.status ?? 'nothing'}`);
  const read = async (r: Response | null, via: 'speech' | 'chat') => (r?.ok ? (((await r.json().catch(() => null)) as any)?.data ?? []) : []).filter((m: any) => m?.id && !String(m.id).startsWith('openrouter/')).map((m: any) => audioModel(m, via));
  const list: AudioModel[] = [];
  for (const m of [...(await read(speech, 'speech')), ...(await read(chat, 'chat'))]) if (!list.some((x) => x.id === m.id)) list.push(m);
  for (const m of list) apply(m);
  cache = { at: Date.now(), list };
  return list;
}

// ---- voices from samples: what each model's endpoints take ---------------------------------------------------

const details = new Map<string, { at: number; cloning: boolean; multi: boolean }>();

const apply = (m: AudioModel) => {
  const d = details.get(m.id);
  if (!d) return m;
  m.cloning = d.cloning;
  if (d.cloning) m.maxSamples = d.multi ? 3 : 1;
  else delete m.maxSamples;
  return m;
};

/** Whether a speech model copies a voice from samples, and from several at once: any of its endpoints (kept 6 hours). */
export async function audioDetails(base: string, id: string): Promise<{ cloning: boolean; multi: boolean } | null> {
  const had = details.get(id);
  if (had && Date.now() - had.at < 6 * 3600_000) return had;
  try {
    const r = await fetch(`${base}/models/${id.split('/').map(encodeURIComponent).join('/')}/endpoints`, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return had ?? null;
    const eps: any[] = ((await r.json()) as any)?.data?.endpoints ?? [];
    const d = { at: Date.now(), cloning: eps.some((e) => e?.supports_voice_cloning === true), multi: eps.some((e) => e?.supports_multiple_audio_references === true) };
    details.set(id, d);
    return d;
  } catch {
    return had ?? null;
  }
}

/** The models' voice-sample abilities filled in (speech models: a few asked at a time, those known already at once). */
export async function withDetails(base: string, list: AudioModel[]): Promise<AudioModel[]> {
  const todo = list.filter((m) => m.via === 'speech');
  for (let i = 0; i < todo.length; i += 8) await Promise.all(todo.slice(i, i + 8).map((m) => audioDetails(base, m.id)));
  for (const m of list) apply(m);
  return list;
}

// ---- what a model is asked --------------------------------------------------------------------------------------

/** One turn of a conversation: its words, and the voice and the manner they are said in. */
export interface Turn {
  text: string;
  voice?: string;
  instructions?: string;
}

/** What to make, as the agent asked for it. */
export interface AudioWish {
  kind: 'music' | 'speech' | 'sound';
  /** Music: the piece described. Speech: the words to say (or, for a model that takes a description, the scene). Sound: the sound described. */
  prompt: string;
  lyrics?: string;
  instrumental?: boolean;
  /** How the words are said. */
  instructions?: string;
  turns?: Turn[];
  /** About how long, in seconds (music, sounds). */
  seconds?: number;
  /** How many voice samples come with it (@Audio1, @Audio2…). */
  samples?: number;
}

/** "about 2 minutes", "45 seconds". */
export const lengthWords = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  if (!m) return `${r} seconds`;
  return `${m} minute${m > 1 ? 's' : ''}${r ? ` ${r} seconds` : ''}`;
};

const saysLength = (s: string) => /\b\d+(?:[.,]\d+)?[\s-]*(?:s|secs?|seconds?|min|mins|minutes?)\b|\b\d+:\d\d\b/i.test(s);

/** A song's prompt: what it is, how long, and the lyrics after a line saying they are lyrics (Lyria's way), or no singing. */
export function musicPrompt(w: Pick<AudioWish, 'prompt' | 'lyrics' | 'instrumental' | 'seconds'>): string {
  const out = [w.prompt.trim()];
  if (w.seconds && !saysLength(w.prompt)) out.push(`Make it about ${lengthWords(w.seconds)} long.`);
  if (w.instrumental) out.push('Instrumental only, no vocals.');
  else if (w.lyrics?.trim()) out.push(`Use the following lyrics:\n${w.lyrics.trim()}`);
  return out.join('\n\n');
}

const quote = (t: string) => `"${t.trim().replace(/"/g, "'")}"`;
const plain = (s?: string) => (s ?? '').trim().replace(/[.:;,\s]+$/, '');
/** Words that end as a sentence does, so another can follow. */
const sentence = (s: string) => s.trim().replace(/([^.!?…])$/, '$1.');

/**
 * What a model that takes a description is sent (Seed Audio): a sound as described; speech as who says what and how
 * ("A calm, warm male voice: "Welcome…""), a voice from a sample as @Audio1; a conversation one line a turn.
 */
export function describedInput(w: AudioWish): string {
  if (w.kind === 'music') return musicPrompt(w);
  if (w.kind === 'sound') return w.seconds && !saysLength(w.prompt) ? `${sentence(w.prompt)} About ${lengthWords(w.seconds)} long.` : w.prompt.trim();
  if (w.turns?.length) {
    const lines = w.turns.map((t) => `${plain(t.voice) || 'A voice'} says${plain(t.instructions) ? ` ${plain(t.instructions)}` : ''}: ${quote(t.text)}`);
    return [...lines, ...(w.prompt.trim() ? [w.prompt.trim()] : [])].join('\n');
  }
  const how = plain(w.instructions);
  // Written as a whole prompt already (lines in quotes, the samples named): kept, its manner first.
  if (/["“”]|@Audio\d/.test(w.prompt)) return how ? `${how}. ${w.prompt.trim()}` : w.prompt.trim();
  const who = w.samples ? '@Audio1' : '';
  if (!how && !who) return w.prompt.trim();
  return `${[who, how].filter(Boolean).join(', ')}: ${quote(w.prompt)}`;
}

/** Voice samples named in a description that are not given, or given and not named (more than one), as Seed Audio refuses them. */
export function placeholderProblem(input: string, samples: number): string | null {
  const named = [...input.matchAll(/@Audio(\d+)/g)].map((m) => Number(m[1]));
  const extra = named.find((n) => n < 1 || n > samples);
  if (extra !== undefined) return samples ? `@Audio${extra} names a voice sample that was not given (there ${samples === 1 ? 'is 1' : `are ${samples}`}).` : `@Audio${extra} names a voice sample, and none was given.`;
  if (samples > 1) for (let n = 1; n <= samples; n++) if (!named.includes(n)) return `With ${samples} voice samples, say who speaks where: @Audio${n} is not named in what to say.`;
  return null;
}

export interface Sample {
  name: string;
  mime: string;
  data: Buffer;
}

export interface SpeechAsk {
  model: string;
  input: string | Turn[];
  voice?: string;
  instructions?: string;
  format: 'mp3' | 'pcm';
  samples?: Sample[];
}

const audioUrl = (s: Sample) => `data:${s.mime};base64,${s.data.toString('base64')}`;

/** The speech API's request: only what is given, as OpenRouter names it. */
export function buildSpeechRequest(a: SpeechAsk): Record<string, unknown> {
  return {
    model: a.model,
    input: a.input,
    ...(a.voice ? { voice: a.voice } : {}),
    ...(a.instructions ? { instructions: a.instructions } : {}),
    response_format: a.format,
    ...(a.samples?.length ? { input_references: a.samples.map((s) => ({ type: 'input_audio', input_audio: { data: audioUrl(s) } })) } : {}),
  };
}

export interface ChatAudioAsk {
  model: string;
  /** What to make (music), or the words to say (a voice). */
  prompt: string;
  /** What a voice model is told first: say the words as they are, in this manner. */
  system?: string;
  voice?: string;
  format: 'mp3' | 'wav';
}

/** A chat completion asking for sound: streamed, as OpenRouter needs for sound out. */
export function buildChatAudioRequest(a: ChatAudioAsk): Record<string, unknown> {
  return {
    model: a.model,
    messages: [...(a.system ? [{ role: 'system', content: a.system }] : []), { role: 'user', content: a.prompt }],
    modalities: ['text', 'audio'],
    audio: { format: a.format, ...(a.voice ? { voice: a.voice } : {}) },
    stream: true,
    usage: { include: true },
  };
}

/** What a chat voice (gpt-audio) is told, so it reads the words rather than answers them. */
export const readAloud = (instructions?: string) =>
  `Say the user's message aloud exactly as it is written, word for word, in its own language, and nothing else: no greeting, no answer, no comment.${plain(instructions) ? ` Say it like this: ${plain(instructions)}.` : ''}`;

// ---- what it costs ------------------------------------------------------------------------------------------------

/** About how long a sound will be: a sound or a piece as asked (else 10 seconds, or the model's own length), speech by its words. */
export function estimateSeconds(m: AudioModel | undefined, w: AudioWish): number {
  const chars = speechChars(w);
  const asked = w.kind === 'speech' ? Math.max(1, chars / CHARS_PER_SECOND) : (w.seconds ?? (m?.maxSeconds && m.maxSeconds <= 30 ? m.maxSeconds : w.kind === 'music' ? 120 : 10));
  return m?.maxSeconds ? Math.min(m.maxSeconds, asked) : asked;
}

/** The characters a voice reads (what it is billed for, by the character). */
export const speechChars = (w: AudioWish) => (w.turns?.length ? w.turns.reduce((n, t) => n + t.text.length, 0) : w.prompt.length);

/** About what one generation costs, when OpenRouter's prices say: for the length it will have (estimated), or has (`seconds`). */
export function audioCost(m: AudioModel | undefined, w: AudioWish, seconds?: number): number | undefined {
  if (!m) return undefined;
  if (m.free) return 0;
  if (m.perSong) return m.perSong;
  const secs = seconds ?? estimateSeconds(m, w);
  if (m.perSecond) return m.perSecond * secs;
  // Fish Audio bills the directions too: OpenRouter writes them into the words.
  if (m.perChar) return m.perChar * (speechChars(w) + (m.id.startsWith('fish-audio/') ? (w.instructions?.length ?? 0) : 0));
  if (m.perToken) return m.perToken.output * tokensPerSecond(m.id) * secs + (m.perToken.input * speechChars(w)) / 4;
  return undefined;
}

// ---- the sound that comes back ------------------------------------------------------------------------------------

export type AudioExt = 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a';

/** What a file of sound is, by its first bytes: WAV, MP3 (a tag, or a frame), Ogg, FLAC, MP4; null for raw sound. */
export function sniffAudio(b: Buffer): AudioExt | null {
  if (b.length < 12) return null;
  const head = b.toString('latin1', 0, 4);
  if (head === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return 'wav';
  if (head.startsWith('ID3')) return 'mp3';
  // An MPEG audio frame: 11 bits of sync, then a layer that is not "reserved" (AAC's ADTS has 00 there).
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 1) & 3) !== 0 && b[1] >> 3 !== 0x1d) return 'mp3';
  if (head === 'OggS') return 'ogg';
  if (head === 'fLaC') return 'flac';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'm4a';
  return null;
}

/** Raw 16-bit sound with a WAV header, so it plays anywhere. */
export function pcmToWav(pcm: Buffer, rate = 24_000, channels = 1): Buffer {
  const block = channels * 2;
  const data = pcm.length % block ? pcm.subarray(0, pcm.length - (pcm.length % block)) : pcm;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1');
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * block, 28);
  h.writeUInt16LE(block, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36, 'latin1');
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** A WAV's length in seconds, from its header (for when ffprobe is not there). */
export function wavSeconds(b: Buffer): number | undefined {
  if (sniffAudio(b) !== 'wav') return undefined;
  let rate = 0;
  for (let i = 12; i + 8 <= b.length;) {
    const id = b.toString('latin1', i, i + 4);
    const size = b.readUInt32LE(i + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(i + 16);
    if (id === 'data') return rate ? Math.min(size, b.length - i - 8) / rate : undefined;
    i += 8 + size + (size % 2);
  }
  return undefined;
}

/** The base64 pieces a stream sent, as bytes: each piece on its own when they come padded, else all of them as one. */
export function joinBase64(chunks: string[]): Buffer {
  const clean = chunks.map((c) => c.replace(/^data:[^,]*,/, '').replace(/\s+/g, '')).filter(Boolean);
  const padded = clean.slice(0, -1).some((c) => c.endsWith('='));
  return padded ? Buffer.concat(clean.map((c) => Buffer.from(c, 'base64'))) : Buffer.from(clean.join(''), 'base64');
}

/** What a chat stream brought so far: its sound in pieces, the transcript, the text, the cost, an error. */
export interface StreamTake {
  chunks: string[];
  transcript: string;
  text: string;
  cost?: number;
  error?: string;
}

export const newTake = (): StreamTake => ({ chunks: [], transcript: '', text: '' });

const audioPart = (x: any, acc: StreamTake) => {
  if (typeof x === 'string') acc.chunks.push(x);
  else if (x && typeof x === 'object') {
    if (typeof x.data === 'string') acc.chunks.push(x.data);
    if (typeof x.transcript === 'string') acc.transcript += x.transcript;
  }
};

/** One event of a chat stream (or a whole answer): its sound, words and cost added to `acc`, in the shapes providers send them. */
export function takeChunk(j: any, acc: StreamTake) {
  if (j?.error) acc.error = String(j.error?.message ?? j.error);
  const ch = j?.choices?.[0];
  const d = ch?.delta ?? ch?.message ?? {};
  audioPart(d.audio, acc);
  const c = d.content;
  if (typeof c === 'string') acc.text += c;
  else if (Array.isArray(c))
    for (const p of c) {
      if (!p || typeof p !== 'object') continue;
      const type = String(p.type ?? '');
      if (type === 'text' || type === 'output_text') acc.text += String(p.text ?? '');
      else if (/audio/.test(type)) audioPart(p.audio ?? p.output_audio ?? p.input_audio ?? p, acc);
    }
  if (ch?.finish_reason === 'error' && !acc.error) acc.error = 'The model stopped with an error';
  const cost = Number(j?.usage?.cost);
  if (Number.isFinite(cost) && cost > 0) acc.cost = cost;
}

/** Reads a server-sent-event stream, each `data:` line's JSON to `on` (comments and [DONE] left out). */
export async function readSse(body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>, on: (j: any) => void) {
  const dec = new TextDecoder();
  let buf = '';
  const line = (l: string) => {
    const s = l.replace(/\r$/, '');
    if (!s.startsWith('data:')) return;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      on(JSON.parse(payload));
    } catch {}
  };
  for await (const part of body as AsyncIterable<Uint8Array>) {
    buf += dec.decode(part, { stream: true });
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      line(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  buf += dec.decode();
  if (buf) line(buf);
}

// ---- one generation -------------------------------------------------------------------------------------------------

export interface MadeAudio {
  data: Buffer;
  ext: AudioExt;
  /** What it cost, when OpenRouter says (a chat's last piece does; the speech API does not). */
  cost?: number;
  /** What the model wrote with it: a song's lyrics or notes, a voice's transcript. */
  words?: string;
}

/** Lyrics as Lyria writes them, each line after its time ("[0.0:3.7] Warm bread…"): the words alone. */
export const cleanLyrics = (t: string) =>
  t
    .split('\n')
    .map((l) => l.replace(/^\s*\[\d+(?:\.\d+)?\s*[:\-–]\s*\d+(?:\.\d+)?\]\s*/, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** OpenRouter's words when it refuses, as the user and the agent should read them. */
function refusal(status: number, j: any, text?: string): Error {
  const why = j?.error?.message ?? (typeof j?.error === 'string' ? j.error : text?.trim().slice(0, 300) || `OpenRouter answered ${status}`);
  return new Error(status === 401 ? `OpenRouter did not take the key (${why}). The user can check it in Settings → Models.` : status === 402 ? `The OpenRouter account is out of credits (${why}).` : String(why));
}

const formatRefused = (status: number, why: string) => status === 400 && /response_format|\b(mp3|pcm)\b|format/i.test(why);

/** Speech (or a sound) from the speech API: MP3, or raw PCM made a WAV (24 kHz mono unless its type says); asks again in the other format when one is refused. */
export async function generateSpeech(o: SpeechAsk & { base: string; key: string; signal?: AbortSignal }): Promise<MadeAudio> {
  const headers = { Authorization: `Bearer ${o.key}`, 'Content-Type': 'application/json', ...HEADERS };
  const ask = async (format: 'mp3' | 'pcm', retry: boolean): Promise<MadeAudio> => {
    const r = await fetch(`${o.base}/audio/speech`, { method: 'POST', headers, body: JSON.stringify(buildSpeechRequest({ ...o, format })), signal: o.signal });
    const type = (r.headers.get('content-type') ?? '').toLowerCase();
    if (!r.ok || type.includes('json') || type.startsWith('text/')) {
      const raw = await r.text().catch(() => '');
      let j: any = null;
      try {
        j = JSON.parse(raw);
      } catch {}
      const e = refusal(r.status, j, j ? undefined : raw);
      if (retry && formatRefused(r.status, e.message)) return ask(format === 'mp3' ? 'pcm' : 'mp3', false);
      throw r.ok && !j?.error ? new Error(`${o.model} answered without sound.`) : e;
    }
    const data = Buffer.from(await r.arrayBuffer());
    if (!data.length) throw new Error(`${o.model} answered without sound.`);
    const ext = sniffAudio(data);
    if (ext) return { data, ext };
    const fallback = pcmOf(o.model);
    const rate = Number(/rate=(\d+)/.exec(type)?.[1]) || fallback.rate;
    const channels = Number(/channels=(\d+)/.exec(type)?.[1]) || fallback.channels;
    return { data: pcmToWav(data, rate, channels), ext: 'wav' };
  };
  return ask(o.format, true);
}

/** Music (or a voice) from a streamed chat completion: the sound's pieces joined, raw sound made a WAV. */
export async function generateChatAudio(o: ChatAudioAsk & { base: string; key: string; signal?: AbortSignal }): Promise<MadeAudio> {
  const r = await fetch(`${o.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${o.key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream', ...HEADERS },
    body: JSON.stringify(buildChatAudioRequest(o)),
    signal: o.signal,
  });
  if (!r.ok) {
    const raw = await r.text().catch(() => '');
    let j: any = null;
    try {
      j = JSON.parse(raw);
    } catch {}
    throw refusal(r.status, j, j ? undefined : raw);
  }
  const acc = newTake();
  if ((r.headers.get('content-type') ?? '').includes('application/json')) takeChunk(await r.json(), acc);
  else if (r.body) await readSse(r.body, (j) => takeChunk(j, acc));
  const data = joinBase64(acc.chunks);
  const words = acc.transcript.trim() || acc.text.trim() || undefined;
  if (!data.length) throw new Error(acc.error ? `${o.model} made no sound: ${acc.error}` : `${o.model} answered without sound${words ? `: “${words.slice(0, 400)}”` : '.'}`);
  const ext = sniffAudio(data);
  const pcm = pcmOf(o.model);
  return { data: ext ? data : pcmToWav(data, pcm.rate, pcm.channels), ext: ext ?? 'wav', cost: acc.cost, words };
}

export interface SavedAudio {
  path: string;
  bytes: number;
}

/** Saves the sound into `dir` (audio/ in the session's folder) under a name from `name`, never over a file that is there. */
export async function saveAudio(made: Pick<MadeAudio, 'data' | 'ext'>, dir: string, name: string): Promise<SavedAudio> {
  await fs.promises.mkdir(dir, { recursive: true });
  const stem = slug(name, 'audio');
  for (let n = 1; n < 1000; n++) {
    const file = path.join(dir, `${stem}${n > 1 ? `-${n}` : ''}.${made.ext}`);
    try {
      await fs.promises.writeFile(file, made.data, { flag: 'wx' });
      return { path: file, bytes: made.data.length };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error('Too many files of that name in audio/');
}

// ---- voice samples ------------------------------------------------------------------------------------------------

const SAMPLE_MIME: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac' };
const MAX_SAMPLE = 30 * 1024 * 1024;
/** What OpenRouter takes inline: 15 MB of sound. */
const MAX_SENT = 15 * 1024 * 1024;

/**
 * Voice samples from the session's folder (WAV, MP3, M4A, OGG or FLAC, 3 at most, 30 MB each): with ffmpeg, the first
 * 30 seconds of each as 24 kHz mono WAV (what voice models take); without it, WAV and MP3 files as they are.
 */
export async function readSamples(files: string[]): Promise<Sample[]> {
  if (files.length > 3) throw new Error('Give at most 3 voice samples.');
  const out: Sample[] = [];
  const ff = files.length ? await hasFfmpeg() : false;
  const tmp = ff ? await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-voice-')) : '';
  try {
    for (const [i, f] of files.entries()) {
      const st = await fs.promises.stat(f).catch(() => null);
      if (!st?.isFile()) throw new Error(`No such voice sample: ${f}`);
      const ext = path.extname(f).slice(1).toLowerCase();
      if (!SAMPLE_MIME[ext]) throw new Error(`${path.basename(f)} is not a WAV, MP3, M4A, OGG or FLAC file.`);
      if (st.size > MAX_SAMPLE) throw new Error(`${path.basename(f)} is over 30 MB: cut out half a minute of the voice first.`);
      if (ff) {
        const clip = path.join(tmp, `sample-${i + 1}.wav`);
        if (!(await voiceClip(f, clip, 30))) throw new Error(`${path.basename(f)} could not be read as sound.`);
        out.push({ name: path.basename(f), mime: 'audio/wav', data: await fs.promises.readFile(clip) });
      } else {
        if (ext !== 'wav' && ext !== 'mp3') throw new Error(`${path.basename(f)} needs ffmpeg on this computer to be used as a voice sample: give a WAV or MP3 file instead.`);
        if (st.size > MAX_SENT) throw new Error(`${path.basename(f)} is over 15 MB: give half a minute of the voice.`);
        out.push({ name: path.basename(f), mime: SAMPLE_MIME[ext], data: await fs.promises.readFile(f) });
      }
    }
  } finally {
    if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  }
  return out;
}

// ---- voices ---------------------------------------------------------------------------------------------------------

/** The voice a model speaks in unless one is picked: an English one first ("en-US-Harper", "en_paul_neutral"), a neutral one before others. */
export function defaultVoice(voices: string[] | undefined): string | undefined {
  if (!voices?.length) return undefined;
  const score = (v: string) => (/(^|[-_])en([-_]|$)|^en|english/i.test(v) ? 2 : 0) + (/neutral|narrat/i.test(v) ? 1 : 0) - (/sad|angry|frustrat|whisper/i.test(v) ? 1 : 0);
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

/** How a voice's id reads: "en-US-Harper:MAI-Voice-2.1" → "Harper (en-US)", "English_radiant_girl" → "English radiant girl", "george" → "George". */
export function voiceLabel(v: string): string {
  const mai = /^([a-z]{2,3}-[A-Z]{2})-([^:]+)(?::.*)?$/.exec(v);
  if (mai) return `${mai[2]} (${mai[1]})`;
  const s = v.replace(/:.*$/, '');
  if (/[A-Z]/.test(s) && s.includes('_')) return s.replace(/_+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
