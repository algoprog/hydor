// Erasing part of a picture: what is under a mask (or in boxes) taken away and filled in as the surroundings continue,
// the rest of the picture as it was. Two ways: on this computer when the picture tools are set up (LaMa, local.ts:
// free and private, every pixel outside the mask kept), or by an image model through OpenRouter, shown where to change
// (make.ts), its answer put in only there (here for an agent's boxes, by the editors for a painted mask). On auto a small
// area goes to LaMa, while a large one, one reaching far across the picture, or one among detailed things (words,
// patterns) goes to an image model, as LaMa smears those (planErase); the answer says which way and why.
// POST /api/images/erase for the editors, and the agents' erase_from_image (which asks for the OpenRouter key on a card
// when it needs one and none is set; skipped, it erases here when it can, or no model runs).
import type { EraseAsk, PictureAnswer } from '../../shared/images.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { RunTool } from '../features/types.ts';
import { isPng, readPng, writePng, type Rgba } from '../signatures/png.ts';
import {
  agentHow,
  agentPicture,
  AI_COST,
  aiReady,
  checkPicture,
  dataUrl,
  doneHow,
  failedHere,
  fromDataUrl,
  HOW_SCHEMA,
  howOf,
  inPlace,
  keepMade,
  keptBytes,
  keyForCloud,
  keySet,
  localNote,
  lookLine,
  MAX_PNG,
  noModelWhy,
  piecesOf,
  readPicture,
  REDRAWN,
  shortOfMemory,
  saveForAgent,
  savedLines,
  SCALED,
  wayFor,
  type Here,
} from './cutout.ts';
import { cloudTools } from './hooks.ts';
import type { HoleHere, MadeHere } from './local.ts';
import { dimensions } from './openrouter.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the image model is asked when erasing goes through OpenRouter. */
const ERASE_PROMPT = 'Take away what is in the white area of the mask and fill it in as the surroundings continue, as if it had never been there: the same light, texture and perspective; keep everything else exactly as it is.';
const insteadPrompt = (what: string) => `Replace what is in the white area of the mask with ${what}, so that it fits the rest of the picture (its light, perspective and style); keep everything else exactly as it is.`;
const takeAwayPrompt = (what: string) => `Take away ${what} from the picture and fill in where it was as the surroundings continue, as if it had never been there; keep everything else exactly as it is.`;

const words = (v: unknown, max = 1000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const errorOf = (e: unknown) => String((e as Error).message ?? e).replace(/\.$/, '');

// ---- which way ---------------------------------------------------------------------------------------------------

/** Which way a hole is best filled, and why (words that complete "An image model filled it:"). */
export interface ErasePlan {
  way: 'local' | 'ai';
  why?: string;
  area: number;
  /** How far across the picture its widest part reaches (its width or height, whichever is the larger share). */
  widest: number;
  detail: number;
}

const AREA_MOST = 0.12;
const WIDEST_MOST = 0.4;
/** Measured (picture_worker.py): words around a hole about 0.15; walls, sky, grass, bricks, noise, a photo’s edges under 0.02. */
const DETAIL_MOST = 0.08;

/** LaMa for a small hole; an image model for a large one, one reaching far across, or one among detailed things. */
export function planErase(m: HoleHere): ErasePlan {
  const { hole } = m;
  const widest = Math.max(0, ...piecesOf(hole.data, hole.w, hole.h, (v) => v > 0).map((p) => Math.max((p.x1 - p.x0 + 1) / hole.w, (p.y1 - p.y0 + 1) / hole.h)));
  const plan = { area: m.area, widest: Math.round(widest * 1000) / 1000, detail: m.detail };
  const smears = 'and the eraser on this computer smears large areas';
  if (m.area > AREA_MOST) return { way: 'ai', why: `the area is large (${pct(m.area)} of the picture), ${smears}`, ...plan };
  if (widest > WIDEST_MOST) return { way: 'ai', why: `part of it reaches across ${pct(widest)} of the picture, ${smears}`, ...plan };
  if (m.detail > DETAIL_MOST) return { way: 'ai', why: 'there are detailed things around it (such as words), which the eraser on this computer cannot continue', ...plan };
  return { way: 'local', ...plan };
}

// ---- the editors' route ------------------------------------------------------------------------------------------

/** POST /api/images/erase: what is under the mask taken away; `prompt`, what to put there instead, takes an image model. */
export async function erasePicture(db: DB, ask: EraseAsk, signal: AbortSignal | undefined, here: Here): Promise<PictureAnswer> {
  const img = readPicture(db, ask?.src);
  const maskUrl = typeof ask.mask === 'string' ? ask.mask.trim() : '';
  const mask = maskUrl ? fromDataUrl(maskUrl) : null;
  if (!mask) throw new HttpError(400, 'mask: a PNG data: address, white where to erase.');
  checkPicture(mask, 'The mask');
  const how = howOf(ask.how);
  const instead = words(ask.prompt);
  const ai = (prompt: string, why?: string) =>
    cloudTools()!
      .edit(db, { src: String(ask.src).trim(), mask: maskUrl, prompt }, signal)
      .then((a): PictureAnswer => ({ ...a, how: 'cloud', ...(why ? { why } : {}) }));
  if (instead) {
    if (how === 'local') throw new HttpError(400, 'On this computer it can only erase, not put something else there: leave out what to put there, or let an image model do it.');
    if (!keySet()) throw new HttpError(400, 'Putting something you describe in its place takes an image model through OpenRouter: add an OpenRouter key in Settings → Models, or leave the words out to erase it.');
    wayFor('ai', here, 'Erasing');
    return ai(insteadPrompt(instead));
  }
  if (wayFor(how, here, 'Erasing') === 'ai') return ai(ERASE_PROMPT, how === 'auto' ? 'The picture tools on this computer are not set up, so an image model filled it.' : undefined);
  const erasedHere = (why?: string) => here.erase(img, { mask }, { maxBytes: MAX_PNG, signal }).then((made) => keepMade(db, made, why));
  if (how === 'local') return erasedHere();
  const plan = planErase(await here.measure(img, { mask }, { signal }));
  if (plan.way === 'local')
    return erasedHere().catch((e) => {
      // Short of memory here: an image model instead.
      if (shortOfMemory(e) && aiReady()) return ai(ERASE_PROMPT, 'This computer did not have the memory free for the eraser, so an image model filled it.');
      throw e;
    });
  if (!aiReady()) return erasedHere(`Erased on this computer, though ${plan.why}: look at it. An image model would do it better: add an OpenRouter key in Settings → Models.`);
  try {
    return await ai(ERASE_PROMPT, `An image model filled it: ${plan.why}.`);
  } catch (e) {
    if (signal?.aborted) throw e;
    return erasedHere(`Erased on this computer, though ${plan.why}: look at it. An image model could not do it: ${errorOf(e)}.`);
  }
}

/** An agent's boxes, each with a little room around what it holds (the picture's edges are the worker's to keep to). */
export function readBoxes(v: unknown): Box[] {
  if (v === undefined || v === null || (Array.isArray(v) && !v.length)) return [];
  if (!Array.isArray(v)) throw new Error('boxes: a list of { x, y, w, h } in the picture’s pixels.');
  if (v.length > 20) throw new Error('boxes: at most 20 at once.');
  return v.map((b: any, i) => {
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => Number(b?.[k]));
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error(`boxes[${i}]: x and y (its top-left corner) and w and h (its size), in the picture’s pixels.`);
    const room = Math.max(2, Math.round(Math.max(w, h) * 0.03));
    const x0 = Math.floor(x - room);
    const y0 = Math.floor(y - room);
    return { x: x0, y: y0, w: Math.ceil(x + w + room) - x0, h: Math.ceil(y + h + room) - y0 };
  });
}

/** A mask of the boxes in the picture's shape, at most 1024 pixels across (what an image model is shown): white in them. */
export function boxesMask(W: number, H: number, boxes: Box[]): Buffer {
  const s = Math.min(1, 1024 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * s));
  const h = Math.max(1, Math.round(H * s));
  const data = new Uint8Array(w * h * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x * s));
    const y0 = Math.max(0, Math.floor(b.y * s));
    const x1 = Math.min(w, Math.ceil((b.x + b.w) * s));
    const y1 = Math.min(h, Math.ceil((b.y + b.h) * s));
    for (let y = y0; y < y1; y++) data.fill(255, (y * w + x0) * 4, (y * w + x1) * 4);
  }
  return writePng({ width: w, height: h, data }, { alpha: false });
}

/** A pixel of `img` at (x, y), in its own coordinates, blended from the four around it. */
function sample(img: Rgba, x: number, y: number, out: Uint8Array, o: number) {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(y)));
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0));
  const fy = Math.max(0, Math.min(1, y - y0));
  for (let c = 0; c < 4; c++) {
    const at = (yy: number, xx: number) => img.data[(yy * img.width + xx) * 4 + c];
    out[o + c] = Math.round((at(y0, x0) * (1 - fx) + at(y0, x1) * fx) * (1 - fy) + (at(y1, x0) * (1 - fx) + at(y1, x1) * fx) * fy);
  }
}

/**
 * A model's whole picture put into the original only inside the boxes (both PNGs, up to 12 megapixels; the model's
 * may be another size): the rest of the original as it was. Null when that cannot be done here.
 */
export function putBackInBoxes(original: Buffer, answer: Buffer, boxes: Box[]): Buffer | null {
  if (!isPng(original) || !isPng(answer)) return null;
  try {
    const o = readPng(original, { maxPixels: 12_000_000 });
    const n = readPng(answer, { maxPixels: 12_000_000 });
    const out: Rgba = { width: o.width, height: o.height, data: o.data.slice() };
    const sx = n.width / o.width;
    const sy = n.height / o.height;
    for (const b of boxes)
      for (let y = Math.max(0, b.y); y < Math.min(o.height, b.y + b.h); y++) for (let x = Math.max(0, b.x); x < Math.min(o.width, b.x + b.w); x++) sample(n, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5, out.data, (y * o.width + x) * 4);
    let alpha = false;
    for (let i = 3; i < out.data.length && !alpha; i += 4) alpha = out.data[i] < 255;
    return writePng(out, { alpha });
  } catch {
    return null;
  }
}

/** The agents' erase_from_image. */
export function eraseTool(db: DB, here: Here): RunTool {
  const WRONG = 'a smear or a ghost where something was erased';
  return {
    name: 'erase_from_image',
    // It writes a file, and may ask a service outside.
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Erase things from a picture (a person in the background, a sign, a watermark, a stain, a cable): what is in the boxes you give is taken away and filled in as the surroundings continue, and the rest of the picture stays as it was. A PNG saved in the session’s folder (images/).',
      'Give boxes in the picture’s pixels, from its top-left corner (open the picture first to see where things are; its size is in the answers of the tools that made it).',
      'On this computer, once the user has set up the picture tools (Settings → Images, video and audio), small areas are erased free and in private: a few seconds, and the first time it downloads its model (about 210 MB).',
      `Large areas, ones reaching far across the picture or among detailed things (words, patterns), and what you only describe in prompt (no boxes), go to an image model through OpenRouter (${AI_COST}), which draws the picture again, so small details may differ; without an OpenRouter key the user is asked for one, and if they skip it, it is erased here when it can be.`,
      'The picture is shown to the user with your reply; the answer says which way made it and why.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The picture: a file in the session’s folder (PNG, JPEG, WebP or GIF), or one in a deck, document or page as get_page shows it (naget-asset:…).' },
        boxes: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'The left edge, in pixels from the picture’s left.' },
              y: { type: 'number', description: 'The top edge, in pixels from the picture’s top.' },
              w: { type: 'number', description: 'Its width in pixels.' },
              h: { type: 'number', description: 'Its height in pixels.' },
            },
            required: ['x', 'y', 'w', 'h'],
          },
          description: 'Boxes around what to take away, a little loose (a few pixels of room are added).',
        },
        prompt: { type: 'string', description: 'What to take away, in words ("the man on the left", "the watermark"), when you give no boxes: then an image model finds it. With boxes, what is in them.' },
        name: { type: 'string', description: 'A short file name for the result, without extension (default: the picture’s name and "-erased").' },
        how: HOW_SCHEMA,
      },
      required: ['path'],
    },
    async run(a, ctx) {
      const pic = agentPicture(db, ctx, a.path);
      const data = pic.data;
      const boxes = readBoxes(a.boxes);
      const what = words(a.prompt, 300);
      if (!boxes.length && !what) throw new Error('Give boxes around what to take away, or say what it is in prompt.');
      const how = agentHow(a.how);
      const name = (typeof a.name === 'string' && a.name.trim()) || `${pic.name}-erased`;
      const n = boxes.length;
      const erased = n === 1 ? 'the box' : `${n} boxes`;
      const stopped = () => ({ isError: true as const, text: 'Stopped before anything was erased.' });
      if (!n && how === 'local') return { isError: true, text: 'On this computer it erases what is in boxes: give boxes around what to take away.' };
      if (how === 'local' && !here.ready()) return { isError: true, text: 'Erasing on this computer needs the picture tools: the user can set them up in Settings → Images, video and audio.' };
      // Words alone need a model to find what they say: with the picture tools here and no key, boxes do it free instead.
      if (!n && here.ready() && !keySet())
        return { isError: true, text: 'Erasing by a description takes an image model through OpenRouter, and no OpenRouter key is set: give boxes around what to take away instead, to erase it on this computer, free.' };
      /** Erased here: the answer, with why it was not an image model when one would have done better. */
      let noRoom = '';
      /** Erased here; `orNoRoom`: when this computer is short of memory, null (an image model may do it instead), what it said kept in noRoom. */
      const local = async (though?: string, orNoRoom = false): Promise<string | { isError: true; text: string } | null> => {
        let made: MadeHere;
        try {
          made = await here.erase(data, { boxes }, { maxBytes: MAX_PNG, signal: ctx.signal });
        } catch (e) {
          if (ctx.signal?.aborted) return stopped();
          if (orNoRoom && shortOfMemory(e)) return (void (noRoom = (e as Error).message), null);
          return { isError: true, text: failedHere(e, 'Nothing was erased') };
        }
        const f = await saveForAgent(ctx, made.png, name);
        return [`Erased ${erased} ${doneHow('local', made.model)}${though ? `, though ${though}` : ''}:`, ...savedLines(f, made.scaled && SCALED, inPlace(pic.kept), lookLine('local', WRONG, here))].join('\n');
      };
      let plan: ErasePlan | undefined;
      if (n && here.ready() && how !== 'ai') {
        if (how === 'local') return (await local())!;
        try {
          plan = planErase(await here.measure(data, { boxes }, { signal: ctx.signal }));
        } catch (e) {
          if (ctx.signal?.aborted) return stopped();
          return { isError: true, text: `Nothing was erased: ${(e as Error).message}` };
        }
        if (plan.way === 'local') {
          const done = await local(undefined, true);
          if (done) return done;
          // Short of memory here: an image model instead.
          plan = { ...plan, way: 'ai', why: 'this computer does not have the memory free for the eraser now' };
        }
      }
      const key = await keyForCloud(ctx, here, {
        why: plan
          ? `Erasing part of a picture: ${plan.why}. An image model through OpenRouter can fill it instead, for ${AI_COST}.`
          : `Erasing something from a picture through OpenRouter costs ${AI_COST}: an image model draws the picture again without it.`,
        what: 'the image model that would erase it',
        doing: 'Erasing',
      });
      if (!key.ok) {
        if (key.why === 'stopped') return stopped();
        if (noRoom) return { isError: true, text: `Nothing was erased: ${noRoom} An image model did not do it instead: ${noModelWhy(key.why)}.` };
        // A way without a key: erased here after all.
        return plan ? (await local(`${plan.why}; an image model did not do it: ${noModelWhy(key.why)}`))! : key.answer;
      }
      const because = plan?.why ? ` ${plan.why.charAt(0).toUpperCase()}${plan.why.slice(1)}, so an image model did it.` : '';
      try {
        const cloud = cloudTools()!;
        if (!n) {
          const r = await cloud.edit(db, { src: dataUrl(data), prompt: takeAwayPrompt(what) }, ctx.signal);
          const f = await saveForAgent(ctx, keptBytes(db, r.src), name);
          return [`Took away ${what} ${doneHow('ai', r.model, r.cost)}:`, ...savedLines(f, REDRAWN, inPlace(pic.kept), localNote(here), lookLine('ai', WRONG, here))].join('\n');
        }
        const size = dimensions(data);
        if (!size) throw new Error('its size could not be read');
        const mask = boxesMask(size.w, size.h, boxes);
        const r = await cloud.edit(db, { src: dataUrl(data), mask: dataUrl(mask), prompt: what ? `${ERASE_PROMPT} (What is there: ${what}.)` : ERASE_PROMPT }, ctx.signal);
        let made = keptBytes(db, r.src);
        let note: string | undefined;
        if (r.whole) {
          const put = putBackInBoxes(data, made, boxes);
          if (put) made = put;
          else note = 'The model’s answer is its whole picture: outside the boxes it may differ slightly from the original.';
        }
        const f = await saveForAgent(ctx, made, name);
        return [`Erased ${erased} ${doneHow('ai', r.model, r.cost)}:${because}`, ...savedLines(f, note, inPlace(pic.kept), localNote(here), lookLine('ai', WRONG, here))].join('\n');
      } catch (e) {
        if (ctx.signal?.aborted) return stopped();
        if (plan && !noRoom) return (await local(`${plan.why}; an image model could not do it (${errorOf(e)})`))!;
        return { isError: true, text: `Nothing was erased: ${(e as Error).message}` };
      }
    },
  };
}
