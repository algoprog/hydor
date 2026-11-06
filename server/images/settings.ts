// The settings an image, video or audio model takes (its shape, resolution, length, sound, voice…), as the form the
// user fills in before anything is made: only the ones the model offers, as short choices, filled in with what the
// agent gave, what the user picked earlier in the session, or the app's defaults; and what the result would cost.
// Its words are the app's own, in the user's language (`tr`, the app's dictionaries: npm run i18n:extract reads
// them from this file); the answers come back as the labels shown, which formContent maps to their values.
import type { ImageModel } from '../../shared/images.ts';
import type { AudioModel, MediaParam, VideoModel } from '../../shared/media.ts';
import { defaultVoice, lengthWords, voiceLabel } from './audio.ts';
import { height, perSecondFor } from './video.ts';

type Json = Record<string, any>;

export interface ImageChoice {
  aspect?: string;
  size?: string;
  quality?: string;
  /** "transparent", or nothing. */
  background?: string;
  count?: number;
}

export interface VideoChoice {
  duration?: number;
  resolution?: string;
  aspect?: string;
  audio?: boolean;
}

export interface AudioChoice {
  format?: 'mp3' | 'wav';
  voice?: string;
  instrumental?: boolean;
  /** About how long, in seconds: a song that can be long, a sound. */
  seconds?: number;
}

/** What generate_audio makes: music, words said aloud, or other sound. */
export type AudioKind = 'music' | 'speech' | 'sound';

/** Each shape's label, whole, for the dictionaries. */
const SHAPES: Record<string, string> = {
  '1:1': 'Square (1:1)',
  '16:9': 'Wide (16:9)',
  '9:16': 'Tall (9:16)',
  '4:3': 'Landscape (4:3)',
  '3:4': 'Portrait (3:4)',
  '3:2': 'Photo, wide (3:2)',
  '2:3': 'Photo, tall (2:3)',
  '5:4': 'Nearly square (5:4)',
  '4:5': 'Nearly square, tall (4:5)',
  '21:9': 'Very wide (21:9)',
  '9:21': 'Very tall (9:21)',
};
/** The shapes the form offers, at most these (a model may list two dozen). */
const COMMON = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21'];

/** The form's title and button. */
export const FORM = {
  image: 'Your picture',
  imageChanged: 'Your picture, changed',
  drawing: 'Your drawing',
  video: 'Your video',
  videoChanged: 'Your video, changed',
  music: 'Your music',
  speech: 'Your voice-over',
  sound: 'Your sound',
  submit: 'Make it',
};

type Tr = (s: string) => string;
const same: Tr = (s) => s;

const shapeLabel = (tr: Tr) => (a: string) => (a === 'auto' ? tr('As the model sees fit') : SHAPES[a] ? tr(SHAPES[a]) : a);
const QUALITY: Record<string, string> = { auto: 'Automatic', low: 'Low quality', medium: 'Medium quality', high: 'High quality', xhigh: 'Higher quality', max: 'Highest quality' };

const param = (params: MediaParam[] | undefined, id: string) => params?.find((p) => p.id === id);

/** A field of choices, labelled; the value given first when it is one of them. */
function choices(title: string, values: (string | number)[], label: (v: any) => string, def: unknown, description?: string): Json {
  return {
    title,
    ...(description ? { description } : {}),
    oneOf: values.map((v) => ({ const: v, title: label(v) })),
    ...(values.includes(def as never) ? { default: def } : {}),
  };
}

// ---- images ------------------------------------------------------------------------------------------------

/** The shapes to offer: the common ones the model takes, and the one given. */
function shapes(values: string[], given?: string): string[] {
  const out = COMMON.filter((a) => values.includes(a));
  if (given && values.includes(given) && !out.includes(given)) out.push(given);
  if (values.includes('auto')) out.push('auto');
  return out.length ? out : values.slice(0, 9);
}

/** What the model takes of each setting, with the app's default. */
export function imageDefaults(m: ImageModel | undefined): ImageChoice {
  const p = m?.params;
  const aspects = param(p, 'aspect_ratio')?.values ?? [];
  const sizes = param(p, 'resolution')?.values ?? [];
  const quality = param(p, 'quality')?.values ?? [];
  return {
    ...(aspects.length ? { aspect: aspects.includes('1:1') ? '1:1' : (aspects.find((a) => a !== 'auto') ?? aspects[0]) } : {}),
    ...(sizes.length ? { size: sizes.includes('1K') ? '1K' : sizes[0] } : {}),
    ...(quality.length ? { quality: quality.includes('auto') ? 'auto' : quality.includes('medium') ? 'medium' : quality[0] } : {}),
    ...(param(p, 'n') && (param(p, 'n')!.max ?? 1) > 1 ? { count: 1 } : {}),
  };
}

/** The form's fields for an image: only what the model takes. */
export function imageForm(m: ImageModel | undefined, v: ImageChoice, tr: Tr = same): Json {
  const p = m?.params;
  const props: Json = {};
  const aspects = param(p, 'aspect_ratio')?.values ?? [];
  if (aspects.length > 1) props.aspect = choices(tr('Shape'), shapes(aspects, v.aspect), shapeLabel(tr), v.aspect);
  const sizes = param(p, 'resolution')?.values ?? [];
  if (sizes.length > 1) props.size = choices(tr('Resolution'), sizes, String, v.size, tr('Larger is sharper, slower and dearer.'));
  const quality = (param(p, 'quality')?.values ?? []).filter((q) => QUALITY[q]);
  if (quality.length > 1) props.quality = choices(tr('Quality'), quality, (q) => tr(QUALITY[q]), v.quality, tr('Higher costs more.'));
  const n = param(p, 'n');
  if (n && (n.max ?? 1) > 1) props.count = { title: tr('How many pictures'), type: 'integer', minimum: 1, maximum: Math.min(4, n.max ?? 4), default: v.count ?? 1 };
  if (param(p, 'background')?.values?.includes('transparent')) props.transparent = { title: tr('Transparent background'), type: 'boolean', default: v.background === 'transparent', description: tr('For a logo or an icon to put on something else.') };
  return props;
}

/** The form's answers as settings. */
export function imageAnswers(c: Record<string, unknown>, v: ImageChoice): ImageChoice {
  return {
    ...v,
    ...(typeof c.aspect === 'string' ? { aspect: c.aspect } : {}),
    ...(typeof c.size === 'string' ? { size: c.size } : {}),
    ...(typeof c.quality === 'string' ? { quality: c.quality } : {}),
    ...(typeof c.count === 'number' ? { count: Math.max(1, Math.min(4, Math.round(c.count))) } : {}),
    ...(typeof c.transparent === 'boolean' ? { background: c.transparent ? 'transparent' : undefined } : {}),
  };
}

/** A setting the agent gave that the model does not take: what to say instead of making it. */
export function imageMismatch(m: ImageModel | undefined, v: ImageChoice): string | null {
  const p = m?.params;
  if (!m || !p) return null;
  const off = (id: string, value: string | undefined) => {
    const values = param(p, id)?.values;
    return value && values && !values.includes(value) ? values.join(', ') : null;
  };
  const shapes = off('aspect_ratio', v.aspect);
  if (shapes) return `${m.label} does not take the shape ${v.aspect}: give one of ${shapes}.`;
  const sizes = off('resolution', v.size);
  if (sizes) return `${m.label} does not take the resolution ${v.size}: give one of ${sizes}.`;
  const levels = off('quality', v.quality);
  if (levels) return `${m.label} does not take the quality ${v.quality}: give one of ${levels}.`;
  if (v.background === 'transparent' && !param(p, 'background')?.values?.includes('transparent')) return `${m.label} does not make transparent backgrounds: leave transparent out, or the user can pick a model that does.`;
  return null;
}

/** What the model can make of the settings: as many images as it makes at once, a background it offers. */
export function imageFits(m: ImageModel | undefined, v: ImageChoice): ImageChoice {
  if (!m?.params) return v;
  const n = param(m.params, 'n');
  const most = n ? (n.max ?? 1) : 1;
  return {
    ...v,
    ...(v.count && v.count > most ? { count: most } : {}),
    ...(v.background && !param(m.params, 'background')?.values?.includes(v.background) ? { background: undefined } : {}),
  };
}

// ---- videos ------------------------------------------------------------------------------------------------

/** Lengths read as a list of choices (a few) or a number between two (many in a row). */
const run = (d: number[]) => d.length > 6 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);

export function videoDefaults(m: VideoModel | undefined): VideoChoice {
  if (!m) return {};
  const res = m.resolutions;
  return {
    ...(m.durations.length ? { duration: m.durations.find((d) => d >= 5) ?? m.durations[m.durations.length - 1] } : {}),
    ...(res.length ? { resolution: res.includes('720p') ? '720p' : (res.find((r) => height(r) >= 720) ?? res[0]) } : {}),
    ...(m.aspects.length ? { aspect: m.aspects.includes('16:9') ? '16:9' : m.aspects[0] } : {}),
    ...(m.audio ? { audio: true } : {}),
  };
}

export function videoForm(m: VideoModel | undefined, v: VideoChoice, tr: Tr = same): Json {
  const props: Json = {};
  if (!m) return props;
  const d = m.durations;
  if (d.length > 1)
    props.duration = run(d)
      ? { title: tr('Length, in seconds'), type: 'integer', minimum: d[0], maximum: d[d.length - 1], default: v.duration ?? d[0] }
      : choices(tr('Video length'), d.slice(0, 8), (s: number) => tr(`${s} seconds`), v.duration);
  if (m.aspects.length > 1) props.aspect = choices(tr('Shape'), shapes(m.aspects, v.aspect), shapeLabel(tr), v.aspect);
  if (m.resolutions.length > 1) props.resolution = choices(tr('Resolution'), m.resolutions, String, v.resolution, tr('Higher is sharper and dearer.'));
  if (m.audio) props.audio = { title: tr('Sound'), type: 'boolean', default: v.audio !== false, description: tr('Voices, music and noises made with the picture.') };
  return props;
}

export function videoAnswers(c: Record<string, unknown>, v: VideoChoice): VideoChoice {
  return {
    ...v,
    ...(typeof c.duration === 'number' ? { duration: Math.round(c.duration) } : {}),
    ...(typeof c.aspect === 'string' ? { aspect: c.aspect } : {}),
    ...(typeof c.resolution === 'string' ? { resolution: c.resolution } : {}),
    ...(typeof c.audio === 'boolean' ? { audio: c.audio } : {}),
  };
}

export function videoMismatch(m: VideoModel | undefined, v: VideoChoice): string | null {
  if (!m) return null;
  const list = (xs: (string | number)[]) => (xs.length > 8 && run(xs as number[]) ? `${xs[0]} to ${xs[xs.length - 1]}` : xs.join(', '));
  if (v.duration !== undefined && m.durations.length && !m.durations.includes(v.duration)) return `${m.label} makes videos of ${list(m.durations)} seconds: give one of those.`;
  if (v.resolution && m.resolutions.length && !m.resolutions.includes(v.resolution)) return `${m.label} makes ${list(m.resolutions)}: give one of those.`;
  if (v.aspect && m.aspects.length && !m.aspects.includes(v.aspect)) return `${m.label} makes the shapes ${list(m.aspects)}: give one of those.`;
  return null;
}

// ---- audio -------------------------------------------------------------------------------------------------

/** What the model makes unless asked otherwise: MP3 where it can, its first voice of the language, with singing. */
export function audioDefaults(m: AudioModel | undefined, kind: AudioKind): AudioChoice {
  return {
    format: !m || m.formats.includes('mp3') ? 'mp3' : m.formats[0],
    ...(kind === 'speech' && m?.voices?.length && !m.prompted ? { voice: defaultVoice(m.voices) } : {}),
    ...(kind === 'music' ? { instrumental: false } : {}),
    ...(kind === 'sound' && m?.prompted ? { seconds: 10 } : {}),
  };
}

/** Each voice's label, the same one twice made plain by its id. */
function voiceLabels(voices: string[]): Map<string, string> {
  const seen = new Map<string, number>();
  for (const v of voices) seen.set(voiceLabel(v), (seen.get(voiceLabel(v)) ?? 0) + 1);
  return new Map(voices.map((v) => [v, (seen.get(voiceLabel(v)) ?? 0) > 1 ? v : voiceLabel(v)]));
}

/**
 * The form's fields for audio: for music, singing or not and (a model that makes long songs) about how long; for a
 * sound, how long; for speech, the voice (`voices`: false when the voice comes from samples, turns or a description);
 * the file, where the model makes more than one kind.
 */
export function audioForm(m: AudioModel | undefined, kind: AudioKind, v: AudioChoice, tr: Tr = same, o: { voices?: boolean } = {}): Json {
  const props: Json = {};
  if (!m) return props;
  if (kind === 'music') {
    props.instrumental = { title: tr('Instrumental, no singing'), type: 'boolean', default: v.instrumental === true };
    if ((m.maxSeconds ?? 0) > 30)
      props.seconds = { title: tr('Length, in seconds'), type: 'integer', minimum: 10, maximum: m.maxSeconds, ...(v.seconds ? { default: v.seconds } : {}), description: tr('Leave it empty for the song to take as long as it needs.') };
  }
  if (kind === 'sound' && m.prompted)
    props.seconds = { title: tr('Length, in seconds'), type: 'integer', minimum: 1, maximum: m.maxSeconds ?? 120, default: v.seconds ?? 10, ...(m.perSecond ? { description: tr('It is paid by the second.') } : {}) };
  if (kind === 'speech' && o.voices !== false && (m.voices?.length ?? 0) > 1) {
    const labels = voiceLabels(m.voices!);
    props.voice = choices(tr('Voice'), m.voices!, (x: string) => labels.get(x) ?? x, v.voice);
  }
  if (m.formats.length > 1) props.format = choices(tr('File'), m.formats, (f: string) => tr(f === 'mp3' ? 'MP3, smaller' : 'WAV, uncompressed'), v.format);
  return props;
}

/** The form's answers as settings; a length emptied on it is left to the model. */
export function audioAnswers(c: Record<string, unknown>, v: AudioChoice, fields: Json = {}): AudioChoice {
  const out: AudioChoice = {
    ...v,
    ...(c.format === 'mp3' || c.format === 'wav' ? { format: c.format } : {}),
    ...(typeof c.voice === 'string' ? { voice: c.voice } : {}),
    ...(typeof c.instrumental === 'boolean' ? { instrumental: c.instrumental } : {}),
    ...(typeof c.seconds === 'number' ? { seconds: Math.round(c.seconds) } : {}),
  };
  if ('seconds' in fields && typeof c.seconds !== 'number') delete out.seconds;
  return out;
}

/** A setting the agent gave that the model does not take: what to say instead of making it. */
export function audioMismatch(m: AudioModel | undefined, v: AudioChoice): string | null {
  if (!m) return null;
  if (v.voice && m.voices?.length && !m.prompted && !m.voices.includes(v.voice))
    return `${m.label} has no voice “${v.voice}”: give one of ${m.voices.slice(0, 40).join(', ')}${m.voices.length > 40 ? ', …' : ''}, or leave voice out.`;
  if (v.seconds && m.maxSeconds && v.seconds > m.maxSeconds) return `${m.label} makes at most ${lengthWords(m.maxSeconds)} at once: give a shorter duration, or make it in parts.`;
  return null;
}

// ---- what it costs -----------------------------------------------------------------------------------------

export const money = (n: number) => (n >= 0.095 ? `$${n.toFixed(2)}` : `$${Number(n.toPrecision(2))}`);

/** About what a video costs with these settings, when OpenRouter's prices say. */
export function videoCost(m: VideoModel | undefined, v: VideoChoice): number | undefined {
  if (!m) return undefined;
  const s = perSecondFor(m, v.resolution, m.audio ? v.audio !== false : undefined);
  const secs = v.duration ?? m.durations[0];
  return s !== undefined && secs ? s * secs : undefined;
}

/** The line above the form: the model, and what it costs (with these settings, for a video), in the user's language. */
export function priceLine(kind: 'image' | 'drawing' | 'video', m: ImageModel | VideoModel | undefined, id: string, tr: Tr = same, cost?: number): string {
  const name = m ? `**${m.label}**${m.org ? ` (${m.org})` : ''}` : `**${id}**`;
  if (kind === 'image' || kind === 'drawing') {
    const per = (m as ImageModel | undefined)?.perImage;
    if (!per) return tr(`${name}, through OpenRouter.`);
    return kind === 'drawing' ? tr(`${name}, through OpenRouter: about ${money(per)} a drawing.`) : tr(`${name}, through OpenRouter: about ${money(per)} an image.`);
  }
  const vm = m as VideoModel | undefined;
  const then = cost ? ` ${tr(`With the settings below, about ${money(cost)}.`)}` : '';
  if (!vm?.perSecond) return `${tr(`${name}, through OpenRouter.`)}${then}`;
  const lo = money(vm.perSecond);
  const hi = vm.perSecondMax ? money(vm.perSecondMax) : lo;
  const range =
    hi === lo
      ? tr(`${name}, through OpenRouter: about ${lo} a second.`)
      : vm.audio
        ? tr(`${name}, through OpenRouter: ${lo} to ${hi} a second, by resolution and sound.`)
        : tr(`${name}, through OpenRouter: ${lo} to ${hi} a second, by resolution.`);
  return `${range}${then}`;
}

/** The line above an audio form: the model, and what it costs (a song, a second, a thousand characters, a minute of speech), in the user's language. */
export function audioPriceLine(m: AudioModel | undefined, id: string, tr: Tr = same, cost?: number): string {
  const name = m ? `**${m.label}**${m.org ? ` (${m.org})` : ''}` : `**${id}**`;
  const then = cost && !m?.perSong ? ` ${tr(`With the settings below, about ${money(cost)}.`)}` : '';
  if (!m) return tr(`${name}, through OpenRouter.`);
  if (m.free) return tr(`${name}, through OpenRouter: free.`);
  if (m.perSong) return m.maxSeconds && m.maxSeconds <= 30 ? tr(`${name}, through OpenRouter: ${money(m.perSong)} a clip of ${m.maxSeconds} seconds.`) : tr(`${name}, through OpenRouter: ${money(m.perSong)} a song.`);
  if (m.perSecond) return `${tr(`${name}, through OpenRouter: ${money(m.perSecond)} a second of sound.`)}${then}`;
  if (m.perChar) return `${tr(`${name}, through OpenRouter: ${money(m.perChar * 1000)} for 1,000 characters.`)}${then}`;
  if (m.perMinute) return `${tr(`${name}, through OpenRouter: about ${money(m.perMinute)} a minute of speech.`)}${then}`;
  return `${tr(`${name}, through OpenRouter.`)}${then}`;
}

/** The line on an audio form when the model picked cannot make what is asked: the one that makes it instead. */
export const insteadLine = (picked: string, used: string, tr: Tr = same) => tr(`${picked} cannot make this, so it is made with ${used}.`);

/** The line on an image form when the see-through background is made by taking the background out on this computer. */
export const cutoutLine = (tr: Tr = same) => tr('Its background is then taken out on this computer, at no cost.');

/** How much of what is made a form quotes: all of it, unless it is longer than a card can show (a long script). */
const QUOTE_ROOM = 4000;
/** What Markdown, or the app's maths, would read as marks: anywhere in a line, and at its start. */
const MARKS = /[\\`*_[\]<>&$~|#]/g;
const LEADING = /^([-+=])|^(\d+)([.)])/;
const asItself = (c: string) => `&#${c.charCodeAt(0)};`;

/**
 * What is made (a picture's description, the words read aloud), quoted under the form's price line whole and as it
 * was written: its line breaks and paragraphs kept, and a *, $, [ or # in it shown as it is rather than read as
 * Markdown or maths (each written as a reference to itself). Only a text longer than a card can show is cut, at a
 * word, with "…".
 */
export function promptQuote(text: string): string {
  let s = text.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > QUOTE_ROOM) s = `${s.slice(0, QUOTE_ROOM).replace(/\s+\S*$/, '')}…`;
  const lines = s.split('\n').map((l) => l.replace(MARKS, asItself).replace(LEADING, (_m, lead?: string, n?: string, p?: string) => (lead ? asItself(lead) : `${n}${asItself(p!)}`)));
  // A line break stays one (a backslash ending its line); an empty line starts another paragraph.
  return lines.map((l, i) => (l ? `> ${l}${lines[i + 1] ? '\\' : ''}` : '>')).join('\n');
}

type Choice = ImageChoice | VideoChoice | AudioChoice;

/** Settings the session picked before, by kind and model: asked once, used again. */
const picked = new Map<string, { at: number; v: Choice }>();

export const pickedKey = (session: string, kind: 'image' | 'video' | 'audio', model: string) => `${session}\n${kind}\n${model}`;
export const pickedFor = <T extends Choice>(k: string): T | undefined => picked.get(k)?.v as T | undefined;
export function rememberPicked(k: string, v: Choice) {
  picked.set(k, { at: Date.now(), v });
  // A day is long enough for one session's work.
  if (picked.size > 500) for (const [key, x] of picked) if (Date.now() - x.at > 86_400_000) picked.delete(key);
}

