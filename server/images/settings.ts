// The settings an image or video model takes (its shape, resolution, length, sound…), as the form the user fills
// in before anything is made: only the ones the model offers, as short choices, filled in with what the agent
// gave, what the user picked earlier in the session, or the app's defaults; and what the result would cost.
// Its words are the app's own, in the user's language (`tr`, the app's dictionaries: npm run i18n:extract reads
// them from this file); the answers come back as the labels shown, which formContent maps to their values.
import type { ImageModel } from '../../shared/images.ts';
import type { MediaParam, VideoModel } from '../../shared/media.ts';
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
export const FORM = { image: 'Your picture', imageChanged: 'Your picture, changed', video: 'Your video', videoChanged: 'Your video, changed', submit: 'Make it' };

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
export function priceLine(kind: 'image' | 'video', m: ImageModel | VideoModel | undefined, id: string, tr: Tr = same, cost?: number): string {
  const name = m ? `**${m.label}**${m.org ? ` (${m.org})` : ''}` : `**${id}**`;
  if (kind === 'image') {
    const per = (m as ImageModel | undefined)?.perImage;
    return per ? tr(`${name}, through OpenRouter: about ${money(per)} an image.`) : tr(`${name}, through OpenRouter.`);
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

/** Settings the session picked before, by kind and model: asked once, used again. */
const picked = new Map<string, { at: number; v: ImageChoice | VideoChoice }>();

export const pickedKey = (session: string, kind: 'image' | 'video', model: string) => `${session}\n${kind}\n${model}`;
export const pickedFor = <T extends ImageChoice | VideoChoice>(k: string): T | undefined => picked.get(k)?.v as T | undefined;
export function rememberPicked(k: string, v: ImageChoice | VideoChoice) {
  picked.set(k, { at: Date.now(), v });
  // A day is long enough for one session's work.
  if (picked.size > 500) for (const [key, x] of picked) if (Date.now() - x.at > 86_400_000) picked.delete(key);
}

