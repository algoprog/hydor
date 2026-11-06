// A slide's narration made with AI: the words (its speaker notes, or its own words when it has none) read by the voice
// model of Settings → Images, video and audio, through OpenRouter, and kept as the deck's sounds are (pages/sounds.ts).
// What it will cost is said first (the editor shows it before anything is made); without an OpenRouter key nothing is
// made and the editor asks for one, as its other AI tools do.
import type { AudioModel } from '../../shared/media.ts';
import { HttpError } from '../auth.ts';
import { kvGet, type DB } from '../db.ts';
import { audioCost, audioModels, defaultVoice, describedInput, estimateSeconds, generateChatAudio, generateSpeech, PREFERRED_SPEECH, readAloud, type AudioWish, type MadeAudio } from '../images/audio.ts';
import { loadConfig } from '../models/config.ts';
import { OPENROUTER_URL } from '../models/openrouter.ts';
import { putSound } from '../pages/sounds.ts';

/** The longest words read at once (a few minutes of speech). */
export const MAX_WORDS = 4000;
/** How a voice that takes a description (Seed Audio) is told to read, unless the user says otherwise. */
const NARRATOR = 'A clear, warm narrator, at an easy, even pace';

/** The voice model the settings pick (or the app's choice), and what OpenRouter says of it. */
async function voiceModel(db: DB): Promise<{ id: string; info?: AudioModel }> {
  let picked = '';
  try {
    const s = JSON.parse(kvGet(db, 'audio') ?? '{}');
    if (typeof s.speech === 'string') picked = s.speech;
  } catch {}
  const list = await audioModels(OPENROUTER_URL).catch(() => [] as AudioModel[]);
  const id = picked || PREFERRED_SPEECH.find((p) => list.some((m) => m.id === p)) || PREFERRED_SPEECH[0];
  return { id, info: list.find((m) => m.id === id) };
}

/** What the editor shows before narrating: the voice model, its voices, whether a key is set, and the cost of each text. */
export interface NarrationEstimate {
  model: string;
  label: string;
  /** Its own voices, by id (none for one that takes a description of the voice instead). */
  voices: string[];
  voice?: string;
  /** It takes a description of how to read (Seed Audio's way) rather than a voice by name. */
  described: boolean;
  /** It takes directions for the delivery beside a voice. */
  directions: boolean;
  keySet: boolean;
  /** What each text would cost and how long it would be (seconds), when OpenRouter's prices say; and in all. */
  each: { cost?: number; seconds: number; tooLong?: boolean }[];
  cost?: number;
  seconds: number;
  /** The longest it makes at once (seconds), when it has a limit. */
  maxSeconds?: number;
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : '';

const wishOf = (text: string, how: string, described: boolean): AudioWish => ({ kind: 'speech', prompt: text, instructions: how || (described ? NARRATOR : undefined) });

/** The cost and length of reading each text with the voice model. */
export async function estimateNarration(db: DB, body: unknown): Promise<NarrationEstimate> {
  const b = (body && typeof body === 'object' ? body : {}) as { texts?: unknown; how?: unknown };
  if (!Array.isArray(b.texts) || b.texts.length > 300) throw new HttpError(400, 'texts: the words of each slide to read (at most 300)');
  const how = clean(b.how, 300);
  const { id, info } = await voiceModel(db);
  const described = !!info?.prompted;
  const each = b.texts.map((t) => {
    const w = wishOf(clean(t, MAX_WORDS), how, described);
    const seconds = Math.round(estimateSeconds(undefined, w) * 10) / 10;
    const cost = audioCost(info, w, seconds);
    return { ...(cost !== undefined ? { cost } : {}), seconds, ...(info?.maxSeconds && seconds > info.maxSeconds ? { tooLong: true } : {}) };
  });
  const priced = each.every((e) => e.cost !== undefined);
  return {
    model: id,
    label: info?.label ?? id,
    voices: described ? [] : (info?.voices ?? []),
    ...(!described && defaultVoice(info?.voices) ? { voice: defaultVoice(info?.voices) } : {}),
    described,
    directions: !!info?.instructions,
    keySet: !!loadConfig().openrouter.apiKey,
    each,
    ...(priced && info ? { cost: each.reduce((t, e) => t + (e.cost ?? 0), 0) } : {}),
    seconds: Math.round(each.reduce((t, e) => t + e.seconds, 0) * 10) / 10,
    ...(info?.maxSeconds ? { maxSeconds: info.maxSeconds } : {}),
  };
}

/** What a narration made with AI gives the editor: the kept sound, its length, what it cost, the words read and the voice. */
export interface MadeNarration {
  src: string;
  seconds: number;
  cost?: number;
  text: string;
  model: string;
  voice?: string;
}

/** One slide's narration: the words read aloud by the voice model, in the voice asked (or its own first), kept. */
export async function makeNarration(db: DB, body: unknown, signal?: AbortSignal): Promise<MadeNarration> {
  const b = (body && typeof body === 'object' ? body : {}) as { text?: unknown; voice?: unknown; how?: unknown };
  const text = clean(b.text, MAX_WORDS + 1);
  if (!text) throw new HttpError(400, 'Nothing to read: write the words in the speaker notes, or on the slide');
  if (text.length > MAX_WORDS) throw new HttpError(400, `That is over ${MAX_WORDS.toLocaleString('en')} characters: make the words shorter`);
  const key = loadConfig().openrouter.apiKey;
  if (!key) throw new HttpError(400, 'Add an OpenRouter key in Settings → Models');
  const { id, info } = await voiceModel(db);
  if (info?.kind === 'music') throw new HttpError(400, `${info.label} makes music, not a voice: pick a voice model in Settings → Images, video and audio`);
  const described = !!info?.prompted;
  const how = clean(b.how, 300);
  const w = wishOf(text, how, described);
  if (info?.maxSeconds && estimateSeconds(undefined, w) > info.maxSeconds)
    throw new HttpError(
      400,
      `${info.label} reads at most ${Math.round(info.maxSeconds / 60) >= 1 ? `${Math.round(info.maxSeconds / 60)} minute${Math.round(info.maxSeconds / 60) === 1 ? '' : 's'}` : `${info.maxSeconds} seconds`} at once: make the words shorter, or pick another voice model in Settings → Images, video and audio`,
    );
  const asked = clean(b.voice, 120);
  const voice = described ? undefined : (info?.voices?.find((v) => v.toLowerCase() === asked.toLowerCase()) ?? (asked && !info?.voices?.length ? asked : defaultVoice(info?.voices)));
  const timeout = AbortSignal.timeout(240_000);
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let made: MadeAudio;
  try {
    made =
      (info?.via ?? 'speech') === 'speech'
        ? await generateSpeech({
            base: OPENROUTER_URL,
            key,
            model: id,
            input: described ? describedInput(w) : text,
            ...(voice ? { voice } : {}),
            ...(info?.instructions && how ? { instructions: how } : {}),
            format: info && !info.formats.includes('mp3') ? 'pcm' : 'mp3',
            signal: sig,
          })
        : await generateChatAudio({ base: OPENROUTER_URL, key, model: id, prompt: text, system: readAloud(how || undefined), ...(voice ? { voice } : {}), format: info && !info.formats.includes('mp3') ? 'wav' : 'mp3', signal: sig });
  } catch (e) {
    if (timeout.aborted) throw new HttpError(504, `${info?.label ?? id} took over four minutes, so it was stopped: try again, or with fewer words`);
    if (signal?.aborted) throw new HttpError(499, 'Stopped before the narration was made');
    throw new HttpError(502, `The narration was not made: ${(e as Error).message}`);
  }
  const kept = await putSound(db, made.data);
  const cost = made.cost ?? audioCost(info, w, kept.seconds || undefined);
  return { src: kept.src, seconds: kept.seconds || Math.round(estimateSeconds(undefined, w) * 10) / 10, ...(cost !== undefined ? { cost } : {}), text, model: id, ...(voice ? { voice } : {}) };
}
