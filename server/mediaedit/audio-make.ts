// Sounds made with AI in the sound editor: music (the music model of Settings → Images, video and audio, Lyria by the
// app's choice), a voice saying words, or a sound effect (the voice and sound model, Seed Audio by the app's choice),
// through OpenRouter, as generate_audio makes them for agents. What it will cost is said first (the editor shows it on
// its button before anything is made); without an OpenRouter key nothing is made and the editor asks for one, as its
// other AI tools do. What is made is kept by the editor ("naget-sound:…") and goes on a track of its own.
//   POST /api/mediaedit/audio/make/estimate { kind, prompt, seconds?, voice? } → SoundMakeEstimate
//   POST /api/mediaedit/audio/make { kind, prompt, seconds?, voice?, how?, instrumental? } → SoundMade
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyReply } from 'fastify';
import type { AudioModel } from '../../shared/media.ts';
import { HttpError } from '../auth.ts';
import { kvGet, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import {
  audioCost,
  audioModels,
  defaultVoice,
  describedInput,
  estimateSeconds,
  generateChatAudio,
  generateSpeech,
  musicPrompt,
  PREFERRED_MUSIC,
  PREFERRED_SPEECH,
  readAloud,
  type AudioWish,
  type MadeAudio,
} from '../images/audio.ts';
import { loadConfig } from '../models/config.ts';
import { OPENROUTER_URL } from '../models/openrouter.ts';
import { soundFactsOf } from './audio.ts';
import { keepSoundFile } from './audio-store.ts';

export type SoundMakeKind = 'music' | 'speech' | 'sound';

export interface SoundMakeEstimate {
  model: string;
  label: string;
  /** Its own voices (speech), and the one it starts with. */
  voices: string[];
  voice?: string;
  /** It takes a description of the voice (Seed Audio) rather than a voice by name. */
  described: boolean;
  keySet: boolean;
  cost?: number;
  seconds: number;
  maxSeconds?: number;
  /** Why it cannot make this kind, when it cannot. */
  why?: string;
}

export interface SoundMade {
  src: string;
  seconds: number;
  cost?: number;
  model: string;
  name: string;
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : '';

/** The model for a kind: the one picked in Settings, else the app's first choice OpenRouter lists; one that can make it. */
async function modelFor(db: DB, kind: SoundMakeKind): Promise<{ id: string; info?: AudioModel; why?: string }> {
  let s: { music?: string; speech?: string } = {};
  try {
    s = JSON.parse(kvGet(db, 'audio') ?? '{}');
  } catch {}
  const list = await audioModels(OPENROUTER_URL).catch(() => [] as AudioModel[]);
  const role = kind === 'music' ? 'music' : 'speech';
  const pref = role === 'music' ? PREFERRED_MUSIC : PREFERRED_SPEECH;
  const picked = (role === 'music' ? s.music : s.speech) || '';
  let id = picked || pref.find((p) => list.some((m) => m.id === p)) || pref[0];
  let info = list.find((m) => m.id === id);
  // A sound effect needs a model that takes a description (Seed Audio); music, a music model or one that does.
  const can = (m: AudioModel | undefined) => !m || (kind === 'sound' ? !!m.prompted : kind === 'music' ? m.kind === 'music' || !!m.prompted : m.kind !== 'music');
  if (!can(info)) {
    const alt = [...(kind === 'music' ? PREFERRED_MUSIC : []), ...PREFERRED_SPEECH].map((p) => list.find((m) => m.id === p)).find((m) => can(m));
    if (alt) {
      id = alt.id;
      info = alt;
    } else return { id, info, why: kind === 'sound' ? `${info?.label ?? id} only reads words aloud: pick a model that makes sounds in Settings → Images, video and audio` : `${info?.label ?? id} cannot make this` };
  }
  return { id, info };
}

const wishOf = (kind: SoundMakeKind, prompt: string, o: { seconds?: number; how?: string; instrumental?: boolean }): AudioWish => ({
  kind,
  prompt,
  ...(o.seconds ? { seconds: o.seconds } : {}),
  ...(o.how ? { instructions: o.how } : {}),
  ...(kind === 'music' && o.instrumental !== undefined ? { instrumental: o.instrumental } : {}),
});

function askOf(body: unknown) {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const kind: SoundMakeKind = b.kind === 'music' || b.kind === 'sound' ? b.kind : 'speech';
  const prompt = clean(b.prompt, 3000);
  const secs = Number(b.seconds);
  const seconds = Number.isFinite(secs) && secs >= 1 ? Math.min(300, Math.round(secs)) : undefined;
  return { kind, prompt, seconds, voice: clean(b.voice, 120), how: clean(b.how, 300), instrumental: typeof b.instrumental === 'boolean' ? b.instrumental : undefined };
}

export async function estimateSound(db: DB, body: unknown): Promise<SoundMakeEstimate> {
  const a = askOf(body);
  const { id, info, why } = await modelFor(db, a.kind);
  const described = !!info?.prompted;
  const w = wishOf(a.kind, a.prompt || 'x', a);
  const seconds = Math.round(estimateSeconds(info, w) * 10) / 10;
  const cost = audioCost(info, w, seconds);
  const voices = a.kind === 'speech' && !described ? (info?.voices ?? []) : [];
  return {
    model: id,
    label: info?.label ?? id,
    voices,
    ...(voices.length && defaultVoice(voices) ? { voice: defaultVoice(voices) } : {}),
    described,
    keySet: !!loadConfig().openrouter.apiKey,
    ...(cost !== undefined ? { cost } : {}),
    seconds,
    ...(info?.maxSeconds ? { maxSeconds: info.maxSeconds } : {}),
    ...(why ? { why } : {}),
  };
}

/** One sound made with AI and kept. */
export async function makeSound(db: DB, body: unknown, signal?: AbortSignal): Promise<SoundMade> {
  const a = askOf(body);
  if (!a.prompt) throw new HttpError(400, a.kind === 'speech' ? 'Write the words to say' : 'Describe what to make');
  const key = loadConfig().openrouter.apiKey;
  if (!key) throw new HttpError(400, 'Add an OpenRouter key in Settings → Models');
  const { id, info, why } = await modelFor(db, a.kind);
  if (why) throw new HttpError(400, why);
  const described = !!info?.prompted;
  const w = wishOf(a.kind, a.prompt, a);
  const via = info?.via ?? (a.kind === 'music' ? 'chat' : 'speech');
  const voice = a.kind === 'speech' && !described ? (info?.voices?.find((v) => v.toLowerCase() === a.voice.toLowerCase()) ?? defaultVoice(info?.voices)) : undefined;
  const limit = a.kind === 'music' ? 300_000 : 240_000;
  const timeout = AbortSignal.timeout(limit);
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let made: MadeAudio;
  try {
    if (via === 'speech') {
      const input = described ? describedInput(w) : a.kind === 'music' ? musicPrompt(w) : a.prompt;
      made = await generateSpeech({
        base: OPENROUTER_URL,
        key,
        model: id,
        input,
        ...(voice ? { voice } : {}),
        ...(!described && info?.instructions && a.how ? { instructions: a.how } : {}),
        format: info && !info.formats.includes('mp3') ? 'pcm' : 'mp3',
        signal: sig,
      });
    } else
      made = await generateChatAudio({
        base: OPENROUTER_URL,
        key,
        model: id,
        ...(info?.kind === 'speech' ? { prompt: a.prompt, system: readAloud(a.how || undefined), voice } : { prompt: musicPrompt(w) }),
        format: info && !info.formats.includes('mp3') ? 'wav' : 'mp3',
        signal: sig,
      });
  } catch (e) {
    if (timeout.aborted) throw new HttpError(504, `${info?.label ?? id} took over ${Math.round(limit / 60_000)} minutes, so it was stopped: nothing was made. Try again, or ask for something shorter`);
    if (signal?.aborted) throw new HttpError(499, 'Stopped before it was made');
    throw new HttpError(502, `It was not made: ${(e as Error).message}`);
  }
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-made-'));
  try {
    const file = path.join(tmp, `made.${made.ext}`);
    await fs.promises.writeFile(file, made.data);
    const kept = await keepSoundFile(file, { move: true, ext: made.ext });
    const f = await soundFactsOf(kept.file).catch(() => null);
    const seconds = f?.duration ?? estimateSeconds(info, w);
    const cost = made.cost ?? audioCost(info, w, seconds);
    const name = a.prompt.replace(/\s+/g, ' ').slice(0, 60);
    return { src: kept.src, seconds: Math.round(seconds * 100) / 100, ...(cost !== undefined ? { cost } : {}), model: id, name };
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** Aborted when the person asking goes before the answer (the editor's panel closed). */
function goneSignal(reply: FastifyReply): AbortSignal {
  const gone = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || gone.abort());
  return gone.signal;
}

export function soundMakeRoutes(d: Deps) {
  d.app.post('/api/mediaedit/audio/make/estimate', async (req) => estimateSound(d.db, req.body));
  d.app.post('/api/mediaedit/audio/make', async (req, reply) => makeSound(d.db, req.body, goneSignal(reply)));
}
