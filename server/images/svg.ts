// Drawings (SVG) from words, for the editors (POST /api/images/svg) and agents (make_svg). Quick: written as SVG by the
// model that writes the app's code (writer.ts: the helper model picked in Settings → Models, else Claude's Sonnet,
// else Codex), with no picture model to pay; Best: drawn by a Recraft vector model through OpenRouter. Either way the
// drawing is cleaned (svg-clean.ts) before it is kept or saved, and its size read from it.
import type { DrawingKind, ImageModel, ImageTier, SvgAsk } from '../../shared/images.ts';
import { drawingTierFor } from '../../shared/image-tier.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { loadConfig } from '../models/config.ts';
import { OPENROUTER_URL } from '../models/openrouter.ts';
import { pictureType } from '../pages/assets.ts';
import { aspectsOf, choice, colours, failed, nearestAspect, NO_KEY, param, ratioOf, str, TIERS } from './make.ts';
import { generate } from './openrouter.ts';
import { cleanDrawing, svgIn } from './svg-clean.ts';
import { imageList, vectorId } from './tiers.ts';
import { writeWith } from './writer.ts';

export const DRAWING_KINDS: DrawingKind[] = ['icon', 'illustration', 'diagram', 'pattern', 'logo', 'shape'];

/** What each kind of drawing is, for the model that writes it. */
const WRITE_KIND: Record<DrawingKind, string> = {
  icon: 'An icon: one simple symbol in bold shapes with even stroke widths, clear at 24 pixels.',
  logo: 'A logo: a simple, memorable mark; a name, if one is given, in clean letters beside or under it.',
  diagram: 'A diagram: boxes, circles and arrows laid out clearly and evenly spaced, with short labels in <text> (words are wanted here).',
  pattern: 'A pattern: a tile that repeats seamlessly (what leaves one edge comes back at the opposite one), filling the whole viewBox.',
  shape: 'A shape: the shape alone, filling most of the viewBox.',
  illustration: 'A flat illustration: simple shapes, few details, no outlines unless they help.',
};

/** And for the vector model, which draws from a description. */
const DRAW_KIND: Record<DrawingKind, string> = {
  icon: 'A simple flat vector icon: one symbol, centred.',
  logo: 'A simple flat vector logo.',
  diagram: 'A clean flat vector diagram with short, correctly spelled labels.',
  pattern: 'A seamless, repeating flat vector pattern.',
  shape: 'One flat vector shape.',
  illustration: 'A flat vector illustration.',
};

const SYSTEM = [
  'You draw with SVG code. Answer with one SVG document and nothing else: no words before or after it, no Markdown.',
  'Rules:',
  '- It starts with <svg xmlns="http://www.w3.org/2000/svg" viewBox="…"> (the viewBox you are given) and ends with </svg>.',
  '- Flat shapes: path, rect, circle, ellipse, line, polyline, polygon and g, coloured with fill and stroke attributes. A few linear or radial gradients at most; no filters, blurs or shadows unless they are asked for.',
  '- Colours: the ones you are given, with white, black or none where needed; with none given, a small palette that goes together.',
  '- No words or letters unless they are asked for; then <text> with font-family="sans-serif", spelled exactly as asked.',
  '- Nothing from outside and nothing that runs: no <image>, <a>, <script>, <style>, <foreignObject> or animation, no href but to the drawing’s own #ids, no fonts or links.',
  '- Small: under 40 KB, few points to a path, coordinates rounded to whole numbers.',
  '- The subject centred with a margin, clear when it is small and when it is large.',
].join('\n');

/** The viewBox for a shape: 512 square, else 960 on its longer side. */
export function boxFor(aspect?: string): { w: number; h: number } {
  const r = (aspect && ratioOf(aspect)) || 1;
  if (Math.abs(r - 1) < 0.01) return { w: 512, h: 512 };
  return r > 1 ? { w: 960, h: Math.round(960 / r) } : { w: Math.round(960 * r), h: 960 };
}

/** A drawing made and cleaned, not kept yet. */
export interface Drawing {
  svg: string;
  w: number;
  h: number;
  /** "Claude", the helper model's name, or the vector model's OpenRouter id. */
  model: string;
  tier: ImageTier;
  cost?: number;
}

/** Written as SVG by the writer: asked once more when the first answer leaves nothing to keep. */
async function written(db: DB, ask: SvgAsk, signal?: AbortSignal): Promise<Drawing> {
  const b = boxFor(ask.aspect);
  const lines = [
    `Draw: ${ask.prompt.trim()}`,
    ask.kind ? WRITE_KIND[ask.kind] : '',
    `viewBox: 0 0 ${b.w} ${b.h}`,
    ask.colors?.length ? `Colours: ${ask.colors.join(', ')}` : 'Colours: your choice',
  ]
    .filter(Boolean)
    .join('\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await writeWith(db, {
      system: SYSTEM,
      prompt: attempt ? `${lines}\n\nYour last answer had no SVG that could be used. Answer with the SVG document alone, from <svg to </svg>.` : lines,
      timeoutMs: 240_000,
      signal,
    });
    const svg = svgIn(r.text);
    const d = svg ? cleanDrawing(svg) : null;
    if (d) return { ...d, model: r.model, tier: 'quick' };
    if (signal?.aborted) break;
  }
  throw new HttpError(502, 'The drawing came back with nothing in it that could be kept. Try saying it differently, or have it drawn with Best');
}

/** The vector model for Best drawings, and what OpenRouter says of it. */
export async function vectorModel(model?: string): Promise<{ id: string; info?: ImageModel }> {
  const list = await imageList();
  const id = model || vectorId(list);
  return { id, info: list.find((m) => m.id === id) };
}

/** Drawn by the vector model through OpenRouter. */
async function drawn(db: DB, ask: SvgAsk, o: { model?: string; signal?: AbortSignal }): Promise<Drawing> {
  const key = loadConfig().openrouter.apiKey;
  if (!key) throw new HttpError(400, NO_KEY);
  const { id, info } = await vectorModel(o.model);
  const label = info?.label ?? id;
  const words = [ask.prompt.trim(), DRAW_KIND[ask.kind ?? 'illustration'], ask.colors?.length ? `Colours: ${ask.colors.join(', ')}.` : ''].filter(Boolean).join('\n');
  const aspect = nearestAspect(ask.aspect ?? '1:1', aspectsOf(info));
  const svgOut = param(info, 'output_format')?.values?.includes('svg');
  let r;
  try {
    r = await generate({ base: OPENROUTER_URL, key, model: id, prompt: words, aspect, count: 1, outputFormat: svgOut ? 'svg' : undefined, textOut: info?.textOut, signal: o.signal });
  } catch (e) {
    throw failed(e, label);
  }
  const im = r.images[0];
  if (!im) throw new HttpError(502, `${label} answered without a drawing${r.text ? `: “${r.text.slice(0, 300)}”` : ''}. Try saying it differently`);
  if (im.mime !== 'image/svg+xml' && pictureType(im.data) !== 'image/svg+xml') throw new HttpError(502, `${label} answered with a picture, not a drawing: pick a vector model, or have it written with Quick`);
  const d = cleanDrawing(im.data.toString('utf8'));
  if (!d) throw new HttpError(502, `Nothing of ${label}’s drawing could be kept. Try again`);
  return { ...d, model: id, tier: 'best', ...(r.cost ? { cost: r.cost } : {}) };
}

/** A drawing from words: written (Quick) or drawn by a vector model (Best), as the ask's tier says or its kind and words pick. */
export async function drawSvg(db: DB, ask: SvgAsk, o: { model?: string; signal?: AbortSignal } = {}): Promise<Drawing> {
  if (!ask.prompt?.trim()) throw new HttpError(400, 'Say what to draw');
  return drawingTierFor(ask.tier, { prompt: ask.prompt, kind: ask.kind }) === 'best' ? drawn(db, ask, o) : written(db, ask, o.signal);
}

/** POST /api/images/svg's body, checked. */
export function readSvgAsk(b: any): SvgAsk {
  const prompt = str(b?.prompt, 4000);
  if (!prompt) throw new HttpError(400, 'Say what to draw in prompt');
  return {
    prompt,
    ...(choice(b?.kind, DRAWING_KINDS, 'kind') ? { kind: b.kind } : {}),
    ...(str(b?.aspect, 20) ? { aspect: str(b.aspect, 20) } : {}),
    ...(choice(b?.tier, TIERS, 'tier') ? { tier: b.tier } : {}),
    ...(colours(b?.colors) ? { colors: colours(b.colors) } : {}),
  };
}
