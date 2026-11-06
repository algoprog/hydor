// Pictures made through OpenRouter for the editors' AI tools: new pictures from words (POST /api/images/make) and a
// picture changed as words say (POST /api/images/edit), kept by the app as the editors' uploads are
// ("naget-asset:<sha>"). The tier (Quick or Best) is picked by what is asked (shared/image-tier.ts), the model by the
// tier (tiers.ts); what the model is asked is worded from what the picture is for and its look, the shape is the
// nearest the model makes. A change with a mask is shown to the model as the picture and the mask beside it, told to
// change only the white part; a PNG answer is put together with a PNG original here (blend.ts), else it comes back
// whole for the editor to put in. No form is shown: the editor's dialog showed the price before. The picture tools'
// cutouts through OpenRouter, and plots' drawings, reach this through hooks.ts.
import type { EditImageAsk, ImageModel, MadePicture, MakeImageAnswer, MakeImageAsk, PictureAnswer, PictureKind, TierChoice } from '../../shared/images.ts';
import { tierFor } from '../../shared/image-tier.ts';
import { ASSET } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { loadConfig } from '../models/config.ts';
import { OPENROUTER_URL } from '../models/openrouter.ts';
import { isPng, readPng } from '../signatures/png.ts';
import { getAsset, MAX_ASSET, pictureType, putAsset, takeIn } from '../pages/assets.ts';
import { putTogether, sameShape } from './blend.ts';
import { localTools, setCloudTools } from './hooks.ts';
import { ASPECTS, dimensions, generate, type Made, type Reference } from './openrouter.ts';
import { imageDefaults } from './settings.ts';
import { cleanDrawing, cleanSvg } from './svg-clean.ts';
import { tierModel } from './tiers.ts';

/** What every route that needs OpenRouter answers without a key (the editors show it with a link to Settings → Models). */
export const NO_KEY = 'Add an OpenRouter key in Settings → Models';

export const KINDS: PictureKind[] = ['picture', 'photo', 'illustration', 'background', 'icon', 'logo', 'diagram', 'texture'];
export const TIERS: TierChoice[] = ['auto', 'quick', 'best'];
export const MODEL_ID = /^[\w.~:/-]{1,120}$/;
const COLOUR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** What the model is told a picture is for, after what to make. */
const FOR: Record<PictureKind, string> = {
  picture: '',
  photo: 'A photograph: realistic, natural light, sharp focus.',
  illustration: 'An illustration.',
  background: 'A background: no words, letters or logos; nothing important near the edges, which may be cut off; calm enough for words to sit on top of it.',
  icon: 'An icon: one simple subject, centred, in flat colours and clean shapes, with space around it and no words.',
  logo: 'A logo: a simple, memorable mark in flat colours that still reads when small; any words in it spelled exactly as given.',
  diagram: 'A clear diagram: a clean layout, simple shapes and arrows, short labels spelled correctly, on a plain background.',
  texture: 'A seamless, tileable texture: even all over, no single subject, no borders and no words; its edges continue into each other.',
};

const ON_PLAIN = 'Put it on a plain, flat background of one solid colour that stands out from it (no scenery, floor or shadow), with clear space around it.';
const SEE_THROUGH = 'Give it a transparent background: nothing behind the subject.';

/** What the model is asked for a new picture: the words given, then what it is for, its look, its colours and its background. */
export function worded(o: { prompt: string; kind?: PictureKind; style?: string; colors?: string[]; background?: 'transparent' | 'plain' }): string {
  return [
    o.prompt.trim(),
    o.kind ? FOR[o.kind] : '',
    o.style?.trim() ? `Style: ${o.style.trim()}.` : '',
    o.colors?.length ? `Colours: ${o.colors.join(', ')}.` : '',
    o.background === 'transparent' ? SEE_THROUGH : o.background === 'plain' ? ON_PLAIN : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the model is asked for a change: to change only the masked part, or only what the words say, and keep the rest. */
export function changeWords(prompt: string, o: { mask?: 'sent' | 'kept'; background?: 'transparent' | 'plain'; refs?: number } = {}): string {
  const lines = [
    o.mask === 'sent' ? `Change the first picture: ${prompt.trim()}` : `Change this picture: ${prompt.trim()}`,
    o.mask === 'sent'
      ? 'The second picture is a mask of the same shape: change only the part of the first picture under its white area. Keep everything under the black area exactly as it is: the same composition, framing, colours and detail. Answer with the whole first picture, changed.'
      : o.mask === 'kept'
        ? 'Change only what the words ask for, and keep everything else exactly as it is.'
        : 'Keep everything else as it is (the composition, framing and style), unless the words say otherwise.',
    o.refs ? `The ${o.refs === 1 ? 'last picture is' : `last ${o.refs} pictures are`} for reference: follow ${o.refs === 1 ? 'it' : 'them'} as the words say.` : '',
    o.background === 'transparent' ? SEE_THROUGH : o.background === 'plain' ? ON_PLAIN : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export const ratioOf = (a: string): number | null => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)\s*$/i.exec(a);
  if (m && Number(m[1]) > 0 && Number(m[2]) > 0) return Number(m[1]) / Number(m[2]);
  const n = Number(a);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Of the shapes a model makes, the nearest to the one wanted ("16:9", "1200x628", 1.5); none when nothing is wanted. */
export function nearestAspect(want: string | number | undefined, values: string[]): string | undefined {
  const r = typeof want === 'number' ? want : want ? ratioOf(want) : null;
  const options = values.filter((v) => v !== 'auto' && ratioOf(v));
  if (!r || !options.length) return undefined;
  const off = (v: string) => Math.abs(Math.log(ratioOf(v)! / r));
  return options.reduce((best, v) => (off(v) < off(best) ? v : best));
}

export const param = (m: ImageModel | undefined, id: string) => m?.params?.find((p) => p.id === id);
/** The shapes a model makes: its own list, or for a model not listed, the common ones. */
export const aspectsOf = (m: ImageModel | undefined) => param(m, 'aspect_ratio')?.values ?? (m?.params ? [] : ASPECTS);
/** How many pictures it makes at once. */
const mostAtOnce = (m: ImageModel | undefined) => Math.max(1, param(m, 'n')?.max ?? 1);

const DATA_PICTURE = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/** A picture to change or follow: one the app keeps, a data: address, or a public https address (kept first). */
export async function pictureFrom(db: DB, src: unknown, what = 'src'): Promise<Reference & { sha?: string }> {
  const s = String(src ?? '').trim();
  let data: Buffer;
  let sha: string | undefined;
  const kept = /^(?:naget-asset:|\/api\/pages\/assets\/)([a-f0-9]{16,64})(?:[?#].*)?$/i.exec(s);
  if (kept) {
    sha = kept[1].toLowerCase();
    const a = getAsset(db, sha);
    if (!a) throw new HttpError(404, 'That picture is no longer kept: add it again');
    data = a.data;
  } else if (s.startsWith('data:')) {
    const m = DATA_PICTURE.exec(s);
    if (!m) throw new HttpError(400, `${what}: a picture as a data: address (base64)`);
    data = Buffer.from(m[2], 'base64');
  } else if (/^https:\/\//i.test(s)) {
    const notes: string[] = [];
    const got = await takeIn(db, s, { notes });
    if (!got.startsWith(ASSET)) throw new HttpError(422, notes[0] ?? 'That picture could not be fetched');
    sha = got.slice(ASSET.length);
    data = getAsset(db, sha)!.data;
  } else throw new HttpError(400, `${what}: a picture the app keeps (naget-asset:…), a data: address or an https address`);
  if (data.length > MAX_ASSET) throw new HttpError(413, `That picture is over ${MAX_ASSET / 1024 / 1024} MB: make it smaller first`);
  const mime = pictureType(data);
  if (!mime) throw new HttpError(415, 'That is not a picture (PNG, JPEG, GIF or WebP)');
  if (mime === 'image/svg+xml') throw new HttpError(415, 'That is a drawing (SVG), which picture models cannot take: use a PNG, JPEG or WebP picture');
  return { name: what, mime, data, ...(sha ? { sha } : {}) };
}

/** A failure on the way, as words the editor shows (OpenRouter's own when it refused). */
export function failed(e: unknown, label: string): HttpError {
  if (e instanceof HttpError) return e;
  const err = e as Error & { status?: number };
  if (err?.name === 'TimeoutError') return new HttpError(504, `${label} took too long, so it was stopped and nothing was made. Try again`);
  if (err?.name === 'AbortError') return new HttpError(409, 'Stopped before the picture was made');
  if (typeof err?.status === 'number') return new HttpError(err.status, err.status === 422 ? `${label} would not make it: ${err.message}` : err.message);
  return new HttpError(502, `OpenRouter could not be reached (${err?.message ?? String(e)}). Try again in a moment`);
}

const said = (texts: string[]) => texts.filter(Boolean).join('\n').trim().slice(0, 2000) || undefined;

/** A picture a model made, ready to keep: a drawing cleaned first (null when nothing safe is left of it), its size read. */
function keepable(m: Made): { data: Buffer; mime: string; w: number; h: number } | null {
  if (m.mime === 'image/svg+xml' || pictureType(m.data) === 'image/svg+xml') {
    const d = cleanDrawing(m.data.toString('utf8'));
    return d ? { data: Buffer.from(d.svg, 'utf8'), mime: 'image/svg+xml', w: d.w, h: d.h } : null;
  }
  const mime = pictureType(m.data);
  const d = dimensions(m.data);
  return mime ? { data: m.data, mime, w: d?.w ?? 0, h: d?.h ?? 0 } : null;
}

function keep(db: DB, m: { data: Buffer; mime: string; w: number; h: number }): MadePicture {
  return { src: ASSET + putAsset(db, m.data), w: m.w, h: m.h, mime: m.mime };
}

/** POST /api/images/make: one to four new pictures, kept. */
export async function makePictures(db: DB, ask: MakeImageAsk, signal?: AbortSignal): Promise<MakeImageAnswer> {
  const key = loadConfig().openrouter.apiKey;
  if (!key) throw new HttpError(400, NO_KEY);
  const prompt = String(ask.prompt ?? '').trim();
  if (!prompt) throw new HttpError(400, 'Say what to make');
  const refs = await Promise.all((ask.refs ?? []).map((r, i) => pictureFrom(db, r, `refs[${i}]`)));
  const tier = tierFor(ask.tier, { prompt, kind: ask.kind, refs: refs.length });
  const pick = await tierModel(db, tier, { model: ask.model, transparent: ask.transparent, refs: refs.length });
  const m = pick.info;
  const label = m?.label ?? pick.id;
  if (refs.length && m && !m.edits) throw new HttpError(400, `${label} does not take pictures to follow: leave them out, or pick a model that does in Settings → Images, video and audio`);
  if (refs.length && m?.maxRefs && refs.length > m.maxRefs) throw new HttpError(400, `${label} takes at most ${m.maxRefs} picture${m.maxRefs === 1 ? '' : 's'} to follow`);
  if (pick.opaque) throw new HttpError(400, `${label} cannot make see-through backgrounds: set up the picture tools in Settings → Images, video and audio to take backgrounds out, or pick a model that makes them`);
  const count = Math.max(1, Math.min(4, Math.round(Number(ask.count) || 1)));
  const d = imageDefaults(m);
  // Quick pictures at a quick model's middle quality, where it has a choice.
  const quality = tier === 'quick' && param(m, 'quality')?.values?.includes('medium') ? 'medium' : d.quality;
  const words = worded({ prompt, kind: ask.kind, style: ask.style, colors: ask.colors, background: pick.background ? 'transparent' : pick.cutout ? 'plain' : undefined });
  const aspect = nearestAspect(ask.aspect, aspectsOf(m)) ?? d.aspect;
  const per = Math.min(mostAtOnce(m), count);
  const calls = Math.ceil(count / per);
  let made;
  try {
    made = await Promise.all(
      Array.from({ length: calls }, (_, i) =>
        generate({ base: OPENROUTER_URL, key, model: pick.id, prompt: words, refs, aspect, size: d.size, quality, background: pick.background, count: Math.min(per, count - i * per), textOut: m?.textOut, signal }),
      ),
    );
  } catch (e) {
    throw failed(e, label);
  }
  const text = said(made.map((r) => r.text));
  const cost = made.reduce((s, r) => s + (r.cost ?? 0), 0);
  const pictures: MadePicture[] = [];
  for (const im of made.flatMap((r) => r.images).slice(0, count)) {
    let got = im;
    if (pick.cutout) {
      const tools = localTools();
      if (!tools?.ready()) throw new HttpError(503, 'The picture tools stopped before the background could be taken out: try again');
      got = { mime: 'image/png', data: await tools.cutout(im.data, signal) };
    }
    const k = keepable(got);
    if (k) pictures.push(keep(db, k));
  }
  if (!pictures.length) throw new HttpError(502, `${label} answered without a picture${text ? `: “${text.slice(0, 300)}”` : ''}. Try saying it differently`);
  return { pictures, model: pick.id, tier, ...(cost > 0 ? { cost } : {}), ...(text ? { text } : {}), ...(pick.cutout ? { cutout: true } : {}) };
}

/** A mask as given: a PNG (data: address), the picture's shape. */
function maskFrom(mask: unknown, pic: Buffer): Buffer {
  const m = typeof mask === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i.exec(mask.trim()) : null;
  const data = m ? Buffer.from(m[1], 'base64') : null;
  if (!data || !isPng(data)) throw new HttpError(400, 'mask: a PNG picture (a data: address), white where the picture may change and black where it stays');
  if (data.length > MAX_ASSET) throw new HttpError(413, 'The mask is too large: make it the picture’s size or smaller');
  let size;
  try {
    const r = readPng(data);
    size = { width: r.width, height: r.height };
  } catch (e) {
    throw new HttpError(400, `mask: ${(e as Error).message}`);
  }
  const d = dimensions(pic);
  if (d && !sameShape({ width: d.w, height: d.h }, size)) throw new HttpError(400, 'mask: the picture’s size, or at least its shape');
  return data;
}

/** POST /api/images/edit, and the picture tools' cutouts and erasing through OpenRouter: a picture changed, kept. */
export async function editPicture(db: DB, ask: EditImageAsk & { refs?: Reference[] }, signal?: AbortSignal): Promise<PictureAnswer> {
  const key = loadConfig().openrouter.apiKey;
  if (!key) throw new HttpError(400, NO_KEY);
  const prompt = String(ask.prompt ?? '').trim();
  if (!prompt) throw new HttpError(400, 'Say what to change');
  const pic = await pictureFrom(db, ask.src);
  const mask = ask.mask ? maskFrom(ask.mask, pic.data) : undefined;
  const extra = (ask.refs ?? []).slice(0, 4);
  const tier = tierFor(ask.tier, { prompt, edit: true });
  const wanted = 1 + (mask ? 1 : 0) + extra.length;
  // A model that makes see-through backgrounds itself first: a cutout through OpenRouter is asked for when the picture tools are not here.
  const pick = await tierModel(db, tier, { model: ask.model, transparent: ask.transparent, refs: wanted, prefer: 'model' });
  const m = pick.info;
  const label = m?.label ?? pick.id;
  if (m && !m.edits) throw new HttpError(400, `${label} does not take pictures to change: pick one that does in Settings → Images, video and audio`);
  if (pick.opaque) throw new HttpError(400, `${label} cannot make see-through backgrounds: pick a model that does in Settings → Images, video and audio, or set up the picture tools`);
  const room = m?.maxRefs ?? 16;
  // A model that takes one picture gets no mask: its answer is put in only where the mask is white all the same.
  const sendMask = !!mask && room >= 2;
  const refs: Reference[] = [pic, ...(sendMask ? [{ name: 'mask', mime: 'image/png', data: mask! }] : []), ...extra].slice(0, Math.max(1, room));
  const given = refs.length - 1 - (sendMask ? 1 : 0);
  const words = changeWords(prompt, { mask: mask ? (sendMask ? 'sent' : 'kept') : undefined, refs: given, background: pick.background ? 'transparent' : pick.cutout ? 'plain' : undefined });
  const d = dimensions(pic.data);
  const def = imageDefaults(m);
  const aspect = (d ? nearestAspect(d.w / d.h, aspectsOf(m)) : undefined) ?? def.aspect;
  // A PNG answer can be put together here.
  const outputFormat = mask && param(m, 'output_format')?.values?.includes('png') ? 'png' : undefined;
  let r;
  try {
    r = await generate({ base: OPENROUTER_URL, key, model: pick.id, prompt: words, refs, aspect, size: def.size, quality: def.quality, background: pick.background, outputFormat, textOut: m?.textOut, signal });
  } catch (e) {
    throw failed(e, label);
  }
  let out = r.images[0];
  if (!out) throw new HttpError(502, `${label} answered without a picture${r.text ? `: “${r.text.slice(0, 300)}”` : ''}. Try saying it differently`);
  if (pick.cutout) {
    const tools = localTools();
    if (!tools?.ready()) throw new HttpError(503, 'The picture tools stopped before the background could be taken out: try again');
    out = { mime: 'image/png', data: await tools.cutout(out.data, signal) };
  }
  let whole = false;
  if (mask) {
    const together = pic.mime === 'image/png' && isPng(out.data) ? putTogether(pic.data, out.data, mask) : null;
    if (together) out = { mime: 'image/png', data: together };
    else whole = true;
  }
  const k = keepable(out);
  if (!k) throw new HttpError(502, `${label} answered with something that is not a picture. Try again`);
  return { ...keep(db, k), how: 'cloud', model: pick.id, ...(r.cost ? { cost: r.cost } : {}), ...(whole ? { whole: true } : {}) };
}

// ---- what the routes take ---------------------------------------------------------------------------------------

export const str = (v: unknown, most: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, most) : undefined);

export function colours(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > 12 || v.some((c) => typeof c !== 'string' || !COLOUR.test(c.trim()))) throw new HttpError(400, 'colors: up to 12 colours, each as #hex ("#1f6feb")');
  return v.length ? v.map((c: string) => c.trim().toLowerCase()) : undefined;
}

export function choice<T extends string>(v: unknown, all: T[], what: string): T | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (!all.includes(v as T)) throw new HttpError(400, `${what}: one of ${all.join(', ')}`);
  return v as T;
}

export function modelOf(v: unknown): string | undefined {
  const m = str(v, 200);
  if (m && !MODEL_ID.test(m)) throw new HttpError(400, 'model: an OpenRouter id, like black-forest-labs/flux.2-pro');
  return m;
}

/** POST /api/images/make's body, checked. */
export function readMakeAsk(b: any): MakeImageAsk {
  const prompt = str(b?.prompt, 8000);
  if (!prompt) throw new HttpError(400, 'Say what to make in prompt');
  const refs = b?.refs ?? [];
  if (!Array.isArray(refs) || refs.length > 4 || refs.some((r: unknown) => typeof r !== 'string')) throw new HttpError(400, 'refs: up to 4 pictures, kept ones (naget-asset:…) or data: addresses');
  const count = b?.count === undefined ? undefined : Math.round(Number(b.count));
  if (count !== undefined && !(count >= 1 && count <= 4)) throw new HttpError(400, 'count: 1 to 4');
  return {
    prompt,
    ...(choice(b?.kind, KINDS, 'kind') ? { kind: b.kind } : {}),
    ...(str(b?.style, 300) ? { style: str(b.style, 300) } : {}),
    ...(str(b?.aspect, 20) ? { aspect: str(b.aspect, 20) } : {}),
    ...(choice(b?.tier, TIERS, 'tier') ? { tier: b.tier } : {}),
    ...(b?.transparent === true ? { transparent: true } : {}),
    ...(count ? { count } : {}),
    ...(refs.length ? { refs } : {}),
    ...(modelOf(b?.model) ? { model: modelOf(b.model) } : {}),
    ...(colours(b?.colors) ? { colors: colours(b.colors) } : {}),
  };
}

/** POST /api/images/edit's body, checked. */
export function readEditAsk(b: any): EditImageAsk {
  const prompt = str(b?.prompt, 8000);
  if (!prompt) throw new HttpError(400, 'Say what to change in prompt');
  if (typeof b?.src !== 'string' || !b.src.trim()) throw new HttpError(400, 'src: the picture to change (naget-asset:… or a data: address)');
  if (b?.mask !== undefined && b.mask !== null && typeof b.mask !== 'string') throw new HttpError(400, 'mask: a PNG data: address');
  return {
    src: b.src.trim(),
    prompt,
    ...(typeof b?.mask === 'string' && b.mask ? { mask: b.mask } : {}),
    ...(choice(b?.tier, TIERS, 'tier') ? { tier: b.tier } : {}),
    ...(modelOf(b?.model) ? { model: modelOf(b.model) } : {}),
    ...(b?.transparent === true ? { transparent: true } : {}),
  };
}

// The picture tools (cutouts and erasing without them) and plots (their drawings) use these.
setCloudTools({ edit: editPicture, cleanSvg });
