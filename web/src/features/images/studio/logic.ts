// What the editors' AI tools work out and say apart from their screens (so it is tested without a browser): what a
// picture, a change, a drawing or a video costs in words, the kinds of picture and drawing with their examples, the
// shapes, a table's cells as CSV, what a piece of data holds, and how long a video has been on its way.
import type { DrawingKind, ImageTier, PictureKind, TierChoice, TierModel, TiersInfo } from '@shared/images';
import { drawingTierFor, tierFor } from '@shared/image-tier';

/** Dollars as the app writes prices: two decimals from ten cents, else two figures ("$0.04", "$0.012"). */
export const money = (n: number) => (n >= 0.095 ? `$${n.toFixed(2)}` : `$${Number(n.toPrecision(2))}`);

/** What a tool would cost: the line under it, and the words of the button that spends it. */
export interface Price {
  /** US dollars, when the price is known; 0 when free. */
  cost?: number;
  line: string;
  button: string;
  /** The button's words once something was made: to make it again, at the same price. */
  again?: string;
  /** It cannot be made as asked now (the line says why, and what to do). */
  blocked?: boolean;
}

/** The tier a picture gets: the one picked, or on Auto the one its words and kind call for. */
export const pictureTier = (choice: TierChoice, o: { prompt: string; kind?: PictureKind; refs?: number }): ImageTier => tierFor(choice, { prompt: o.prompt, kind: o.kind, refs: o.refs });

/**
 * New pictures: the tier's model, so many of them. A see-through background comes from what the tier says makes one
 * (`seeThrough`): its own model, another that can, or its own on a plain background with the background then taken
 * out on this computer for nothing; nothing at all, and it cannot be made so now.
 */
export function picturePrice(t: TiersInfo, o: { tier: ImageTier; count: number; transparent?: boolean }): Price {
  const n = Math.max(1, Math.min(4, o.count));
  const verb = n > 1 ? 'Make them' : 'Make it';
  const see = o.transparent ? t[o.tier].seeThrough : undefined;
  if (o.transparent && !see) return { line: 'Nothing here makes see-through backgrounds now: set up the picture tools in Settings → Images, video and audio, or turn it off.', button: verb, again: 'Make again', blocked: true };
  const here = !!see?.cutout;
  const m: TierModel = see ?? t[o.tier];
  if (m.perImage == null) return { line: `With ${m.label}, through OpenRouter: it does not list its price`, button: verb, again: 'Make again' };
  const cost = m.perImage * n;
  const line =
    n > 1
      ? here
        ? `About ${money(cost)} for ${n} with ${m.label}, their backgrounds then taken out on this computer for nothing`
        : `About ${money(cost)} for ${n} with ${m.label}`
      : here
        ? `About ${money(cost)} with ${m.label}, its background then taken out on this computer for nothing`
        : `About ${money(cost)} with ${m.label}`;
  return { cost, line, button: n > 1 ? `Make them (about ${money(cost)})` : `Make it (about ${money(cost)})`, again: `Make again (about ${money(cost)})` };
}

/** A change with AI (always the Best model). */
export function changePrice(t: TiersInfo): Price {
  const m = t.best;
  if (m.perImage == null) return { line: `With ${m.label}, through OpenRouter: it does not list its price`, button: 'Change it' };
  return { cost: m.perImage, line: `About ${money(m.perImage)} with ${m.label}`, button: `Change it (about ${money(m.perImage)})` };
}

/** The models the picture tools on this computer download the first time each is used, about so large. */
export const LOCAL_MODEL_MB: Record<'cutout' | 'erase', number> = { cutout: 220, erase: 210 };

/** Taking a picture's background out, or erasing part of it: on this computer for nothing, or through OpenRouter. */
export function toolPrice(t: TiersInfo, tool: 'cutout' | 'erase', how: 'local' | 'cloud'): Price {
  const button = tool === 'cutout' ? 'Remove the background' : 'Erase it';
  if (how === 'local') {
    const first = !t.local.downloaded.includes(tool);
    return {
      cost: 0,
      line: first ? `On this computer, for nothing, and the picture stays here. The first time, it downloads its model (about ${LOCAL_MODEL_MB[tool]} MB).` : 'On this computer, for nothing, and the picture stays here.',
      button: `${button} (free)`,
    };
  }
  const m = cloudModel(t, tool);
  if (m.perImage == null) return { line: `Through OpenRouter with ${m.label}: it does not list its price`, button };
  return { cost: m.perImage, line: `Through OpenRouter: about ${money(m.perImage)} with ${m.label}`, button: `${button} (about ${money(m.perImage)})` };
}

/**
 * The model a tool goes to through OpenRouter: a cutout is a change that keeps the subject on a see-through background
 * (Best's maker of those, when it is a model), erasing a change only under the paint (Best's own).
 */
function cloudModel(t: TiersInfo, tool: 'cutout' | 'erase'): TierModel {
  if (tool === 'erase') return t.best;
  const see = t.best.seeThrough;
  return see && !see.cutout ? see : t.transparent;
}

/** "Do it with AI instead (about $0.01)": a cutout or erasing made here, done again by an image model through OpenRouter. */
export function aiInsteadButton(t: TiersInfo, tool: 'cutout' | 'erase'): string {
  const m = cloudModel(t, tool);
  return m.perImage == null ? 'Do it with AI instead' : `Do it with AI instead (about ${money(m.perImage)})`;
}

/** A model's name as the app shows it: its label where the tiers know it, else its id without its maker. */
export function modelLabel(t: TiersInfo | null, id: string | undefined): string {
  if (!id) return 'OpenRouter';
  const known = t && [t.quick, t.best, t.quick.seeThrough, t.best.seeThrough, t.transparent, t.vector].find((m) => m?.id === id);
  return known ? known.label : id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
}

/** What a picture made through OpenRouter says of itself: "Made with GPT Image 1 Mini, $0.01". */
export const madeWith = (t: TiersInfo | null, model: string | undefined, cost?: number) => (cost != null ? `Made with ${modelLabel(t, model)}, ${money(cost)}` : `Made with ${modelLabel(t, model)}`);

/** "Use OpenRouter instead: about $0.01", for a tool the picture tools would do here. */
export function insteadLine(t: TiersInfo, tool: 'cutout' | 'erase'): string {
  const m = cloudModel(t, tool);
  return m.perImage == null ? 'Use OpenRouter instead' : `Use OpenRouter instead: about ${money(m.perImage)}`;
}

/** The tier a drawing gets on Auto: Best (a vector model) for illustrations and detailed asks, else Quick (written as SVG). */
export const drawingTier = (choice: TierChoice, o: { prompt: string; kind?: DrawingKind }): ImageTier => drawingTierFor(choice, o);

/** A drawing: Quick is written as SVG by a model (Claude, or the helper model), Best drawn by a vector model, priced. */
export function drawingPrice(t: TiersInfo, tier: ImageTier): Price {
  if (tier === 'quick') return { line: `Written by ${t.writer}: no picture model is paid for`, button: 'Draw it', again: 'Draw again' };
  const m = t.vector;
  if (m.perImage == null) return { line: `Drawn by ${m.label}, through OpenRouter: it does not list its price`, button: 'Draw it', again: 'Draw again' };
  return { cost: m.perImage, line: `Drawn by ${m.label}: about ${money(m.perImage)}`, button: `Draw it (about ${money(m.perImage)})`, again: `Draw again (about ${money(m.perImage)})` };
}

/** A video: so many seconds at what a second costs, the cheapest way it is sold to the dearest (sound, a sharper picture). */
export function videoPrice(t: TiersInfo, seconds: number, perSecondMax?: number): Price {
  const v = t.video;
  if (v.perSecond == null) return { line: `With ${v.label}, through OpenRouter: it does not list its price. Videos cost far more than pictures.`, button: 'Make the video' };
  const lo = v.perSecond * seconds;
  const hi = perSecondMax && perSecondMax > v.perSecond * 1.05 ? perSecondMax * seconds : lo;
  const line = hi > lo ? `About ${money(lo)} to ${money(hi)} for ${seconds} seconds with ${v.label}. Videos cost far more than pictures.` : `About ${money(lo)} for ${seconds} seconds with ${v.label}. Videos cost far more than pictures.`;
  return { cost: hi, line, button: `Make the video (about ${money(hi)})` };
}

/** An error in words a person can act on (a lost connection's own words, "Failed to fetch", are not). */
export function errorWords(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|load failed|network request failed/i.test(m) ? 'The app could not be reached: check the connection, then try again.' : m;
}

/** Whether a tool's error is that there is no OpenRouter key (its way out: Settings → Models). */
export const needsKey = (message: string) => /openrouter key|no key|api key/i.test(message);

// ---- what pictures and drawings are for -----------------------------------------------------------------------

export const PICTURE_KINDS: { value: PictureKind; label: string; hint: string; examples: string[] }[] = [
  { value: 'picture', label: 'Picture', hint: 'Anything: a scene, an object, an idea', examples: ['A lighthouse on a cliff at dusk', 'A cosy reading corner by a rainy window', 'A team planning around a whiteboard'] },
  { value: 'photo', label: 'Photo', hint: 'As if taken with a camera', examples: ['A cup of coffee on a wooden table, morning light', 'A city street after rain at night', 'Fresh vegetables on a market stall'] },
  { value: 'illustration', label: 'Illustration', hint: 'Drawn or painted, with some detail', examples: ['A fox reading a book under a tree', 'A rocket over a sleepy town', 'Hands holding a seedling'] },
  { value: 'background', label: 'Background', hint: 'Behind words: calm, nothing at its edges', examples: ['Soft blue waves', 'Warm abstract shapes, out of focus', 'Calm mountains at dawn, plenty of empty sky'] },
  { value: 'icon', label: 'Icon', hint: 'One simple thing in the middle', examples: ['A paper plane', 'A shield with a tick', 'A steaming coffee cup'] },
  { value: 'diagram', label: 'Diagram', hint: 'Explains something, with labels', examples: ['The water cycle, labelled', 'How a seed becomes a tree, in four steps', 'The parts of a bicycle'] },
  { value: 'texture', label: 'Texture', hint: 'A surface that repeats', examples: ['Recycled paper', 'Light marble', 'Linen fabric'] },
  { value: 'logo', label: 'Logo', hint: 'A mark for a name', examples: ['A bakery called “Crumb”, warm and simple', 'A cycling club: a wheel and a mountain', 'A start-up called “Nimbus”'] },
];

/** The looks a picture can have (said to the model in its words). */
export const LOOKS: { value: string; label: string }[] = [
  { value: '', label: 'Any look' },
  { value: 'photograph, natural light', label: 'Photograph' },
  { value: 'watercolour painting', label: 'Watercolour' },
  { value: 'flat vector illustration, clean shapes', label: 'Flat' },
  { value: '3D render, soft studio light', label: '3D render' },
  { value: 'clean line drawing', label: 'Line drawing' },
  { value: 'pencil sketch', label: 'Pencil sketch' },
  { value: 'oil painting', label: 'Oil painting' },
];

export const DRAWING_KINDS: { value: DrawingKind; label: string; hint: string; examples: string[] }[] = [
  { value: 'icon', label: 'Icon', hint: 'One simple thing, sharp at any size', examples: ['A lightbulb', 'A rocket taking off', 'A house with a heart'] },
  { value: 'illustration', label: 'Illustration', hint: 'A scene in flat shapes', examples: ['A city skyline at night', 'A desk with a laptop and a plant', 'Mountains and a winding road'] },
  { value: 'diagram', label: 'Diagram', hint: 'Boxes, arrows and steps', examples: ['Three steps from idea to launch', 'A cycle of plan, do, check, act', 'A funnel in four stages'] },
  { value: 'pattern', label: 'Pattern', hint: 'A tile that repeats', examples: ['Small dots and waves', 'Leaves scattered at angles', 'Soft hexagons'] },
  { value: 'logo', label: 'Logo', hint: 'A simple mark', examples: ['A leaf in a circle', 'The letter N as a mountain', 'A cup and a book'] },
  { value: 'shape', label: 'Shape', hint: 'A badge, a banner, a frame', examples: ['A ribbon banner', 'A rounded badge with a star', 'A speech bubble'] },
];

/** The kind of drawing nearest to what a picture was for (a picture made as a drawing instead). */
export function drawingKindOf(k: PictureKind): DrawingKind {
  return k === 'icon' || k === 'logo' || k === 'diagram' ? k : k === 'background' || k === 'texture' ? 'pattern' : 'illustration';
}

/** Colours to draw with when the editor has none of its own. */
export const DEFAULT_COLORS = ['#1f3a5f', '#2a78d6', '#f2a541', '#f4f1ea'];

// ---- shapes ------------------------------------------------------------------------------------------------------

export const SHAPES: { value: string; label: string }[] = [
  { value: '1:1', label: 'Square (1:1)' },
  { value: '3:2', label: 'Landscape' },
  { value: '16:9', label: 'Wide' },
  { value: '2:3', label: 'Portrait' },
  { value: '9:16', label: 'Tall' },
];

/** Width over height of "16:9" (1 for what is not a shape). */
export function ratioOf(a: string | undefined): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/.exec(a ?? '');
  return m && +m[1] > 0 && +m[2] > 0 ? +m[1] / +m[2] : 1;
}

/** A width and height as a shape ("16:9", "4:3"), the nearest of the common ones when it is close to one. */
export function aspectOf(w: number, h: number): string {
  if (!(w > 0 && h > 0)) return '1:1';
  const r = w / h;
  const common = ['1:1', '5:4', '4:3', '3:2', '16:10', '16:9', '2:1', '21:9', '3:1', '4:1', '4:5', '3:4', '2:3', '9:16', '1:2'];
  const near = common.reduce((a, b) => (Math.abs(Math.log(ratioOf(b) / r)) < Math.abs(Math.log(ratioOf(a) / r)) ? b : a));
  if (Math.abs(Math.log(ratioOf(near) / r)) < 0.03) return near;
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const W = Math.round(w);
  const H = Math.round(h);
  const d = g(W, H) || 1;
  return `${W / d}:${H / d}`;
}

/** Of shapes a model takes, the nearest to the one wanted. */
export function nearestAspect(want: string | undefined, list: string[]): string | undefined {
  if (!list.length) return want;
  if (!want) return list[0];
  const r = ratioOf(want);
  return list.reduce((a, b) => (Math.abs(Math.log(ratioOf(b) / r)) < Math.abs(Math.log(ratioOf(a) / r)) ? b : a));
}

/** A plot's size in pixels for a shape, from its width. */
export function plotSize(aspect: string, w = 960): { w: number; h: number } {
  return { w: Math.round(w), h: Math.round(w / ratioOf(aspect)) };
}

// ---- data for plots ------------------------------------------------------------------------------------------------

/** The most data a plot is sent (the server takes up to 200 KB). */
export const MAX_DATA = 200_000;

/** Cells as CSV: quoted where they hold a comma, a quote or a line break. */
export function csvOf(rows: string[][]): string {
  const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return rows.map((r) => r.map((c) => cell(c.trim())).join(',')).join('\n');
}

/** What a piece of data holds, in words ("4 rows, 3 columns"), or null when it is empty. */
export function describeData(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^[[{]/.test(t)) {
    try {
      const v = JSON.parse(t) as unknown;
      const list = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as object).find(Array.isArray) : null;
      if (Array.isArray(list)) {
        const first = list[0];
        const cols = Array.isArray(first) ? first.length : first && typeof first === 'object' ? Object.keys(first).length : 1;
        return `${list.length} row${list.length === 1 ? '' : 's'}, ${cols} column${cols === 1 ? '' : 's'}`;
      }
      return 'JSON data';
    } catch {
      return 'Data that is not valid JSON';
    }
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const cols = splitRow(lines[0], sep).length;
  return `${lines.length} row${lines.length === 1 ? '' : 's'}, ${cols} column${cols === 1 ? '' : 's'}`;
}

/** One line of CSV (quotes kept together), its cells. */
function splitRow(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') ((cur += '"'), i++);
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) (out.push(cur), (cur = ''));
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// ---- pictures inside pages ---------------------------------------------------------------------------------------

/** The longest side a picture keeps inside a page, and about the most bytes it takes there (as the server's page-pictures.ts). */
export const PAGE_SIDE = 1600;
export const PAGE_BYTES = 450_000;

/** The size a picture takes inside a page: no side over PAGE_SIDE, its shape kept. */
export function pageSize(w: number, h: number, side = PAGE_SIDE): { w: number; h: number } {
  const k = Math.min(1, side / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// ---- time ------------------------------------------------------------------------------------------------------------

/** How long, in words a clock would say: "40 s", "1 min 20 s", "12 min". */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m >= 10 || s % 60 === 0 ? `${m} min` : `${m} min ${s % 60} s`;
}
