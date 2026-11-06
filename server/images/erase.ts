// Erasing part of a picture: what is under a mask (or in boxes) taken away and filled in as the surroundings continue,
// the rest of the picture as it was. On this computer when the picture tools are set up (LaMa, local.ts: free and
// private, every pixel outside the mask kept), else through OpenRouter: an image model is shown where to change
// (make.ts), and its answer is put in only there (here for an agent's boxes, by the editors for a painted mask).
// POST /api/images/erase for the editors, and the agents' erase_from_image (which asks for the OpenRouter key on a card
// when it has to go that way and none is set; skipped, it does not run).
import path from 'node:path';
import type { EraseAsk, PictureAnswer } from '../../shared/images.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { RunTool } from '../features/types.ts';
import { loadConfig } from '../models/config.ts';
import { isPng, readPng, writePng, type Rgba } from '../signatures/png.ts';
import { checkPicture, dataUrl, doneHow, failedHere, fromDataUrl, keepMade, keptBytes, keyForCloud, localNote, MAX_PNG, readPicture, saveForAgent, savedLines, sessionPicture, viaOpenRouter, wayFor, type Here, type Way } from './cutout.ts';
import { cloudTools } from './hooks.ts';
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

/** POST /api/images/erase: what is under the mask taken away; `prompt`, what to put there instead, goes through OpenRouter. */
export async function erasePicture(db: DB, ask: EraseAsk, signal: AbortSignal | undefined, here: Here): Promise<PictureAnswer> {
  const img = readPicture(db, ask?.src);
  const maskUrl = typeof ask.mask === 'string' ? ask.mask.trim() : '';
  const mask = maskUrl ? fromDataUrl(maskUrl) : null;
  if (!mask) throw new HttpError(400, 'mask: a PNG data: address, white where to erase.');
  checkPicture(mask, 'The mask');
  const instead = words(ask.prompt);
  let way: Way;
  if (instead) {
    if (ask.how === 'local') throw new HttpError(400, 'On this computer it can only erase, not put something else there: leave out what to put there, or let it go through OpenRouter.');
    if (!loadConfig().openrouter.apiKey) throw new HttpError(400, 'Putting something you describe in its place goes through OpenRouter: add an OpenRouter key in Settings → Models, or leave the words out to erase it.');
    way = wayFor('cloud', here, 'Erasing');
  } else way = wayFor(ask.how, here, 'Erasing');
  if (way === 'local') return keepMade(db, await here.erase(img, { mask }, { maxBytes: MAX_PNG, signal }));
  const a = await cloudTools()!.edit(db, { src: String(ask.src).trim(), mask: maskUrl, prompt: instead ? insteadPrompt(instead) : ERASE_PROMPT }, signal);
  return { ...a, how: 'cloud' };
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
  return {
    name: 'erase_from_image',
    // It writes a file, and may ask a service outside.
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Erase things from a picture (a person in the background, a sign, a watermark, a stain, a cable): what is in the boxes you give is taken away and filled in as the surroundings continue, and the rest of the picture stays as it was. A PNG saved in the session’s folder (images/).',
      'Give boxes in the picture’s pixels, from its top-left corner (open the picture first to see where things are; its size is in the answers of the tools that made it).',
      'On this computer, once the user has set up the picture tools (Settings → Images, video and audio), it is free and private: a few seconds, and the first time it downloads its model (about 210 MB).',
      'Otherwise, or when you only say what to take away in prompt (no boxes), it goes through OpenRouter at a small cost (about $0.01 to $0.05), where an image model finds it and draws the picture again, so small details may differ; without an OpenRouter key the user is asked for one, and if they skip it, nothing is done.',
      'The picture is shown to the user with your reply.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The picture (PNG, JPEG, WebP or GIF), in the session’s folder.' },
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
        prompt: { type: 'string', description: 'What to take away, in words ("the man on the left", "the watermark"), when you give no boxes: then it goes through OpenRouter. With boxes, what is in them.' },
        name: { type: 'string', description: 'A short file name for the result, without extension (default: the picture’s name and "-erased").' },
        openrouter: { type: 'boolean', description: 'true: through OpenRouter even though the picture tools are set up here, only when the user asks for that (when this computer is short of memory, say).' },
      },
      required: ['path'],
    },
    async run(a, ctx) {
      const { file, data } = sessionPicture(ctx, a.path);
      const boxes = readBoxes(a.boxes);
      const what = words(a.prompt, 300);
      if (!boxes.length && !what) throw new Error('Give boxes around what to take away, or say what it is in prompt.');
      const name = (typeof a.name === 'string' && a.name.trim()) || `${path.basename(file, path.extname(file))}-erased`;
      const n = boxes.length;
      const onThisComputer = here.ready() && !viaOpenRouter(a);
      if (n && onThisComputer) {
        try {
          const made = await here.erase(data, { boxes }, { maxBytes: MAX_PNG, signal: ctx.signal });
          const f = await saveForAgent(ctx, made.png, name);
          return [`Erased ${n === 1 ? 'the box' : `${n} boxes`} ${doneHow('local', made.model)}:`, ...savedLines(f, made.scaled ? 'It was made smaller to stay under 12 MB.' : undefined)].join('\n');
        } catch (e) {
          if (ctx.signal?.aborted) return { isError: true, text: 'Stopped before anything was erased.' };
          return { isError: true, text: failedHere(e, 'Nothing was erased') };
        }
      }
      // Words alone need a model to find what they say: with the picture tools here and no key, boxes do it free instead.
      if (!n && onThisComputer && !loadConfig().openrouter.apiKey)
        return { isError: true, text: 'Erasing by a description goes through OpenRouter, and no OpenRouter key is set: give boxes around what to take away instead, to erase it on this computer, free.' };
      const key = await keyForCloud(ctx, here, {
        why: 'Erasing something from a picture through OpenRouter costs about $0.01 to $0.05: an image model draws the picture again without it.',
        what: 'the image model that would erase it',
        doing: 'Erasing',
      });
      if (!key.ok) return key.answer;
      const free = localNote(here);
      try {
        const cloud = cloudTools()!;
        if (!n) {
          const r = await cloud.edit(db, { src: dataUrl(data), prompt: takeAwayPrompt(what) }, ctx.signal);
          const f = await saveForAgent(ctx, keptBytes(db, r.src), name);
          return [`Took away ${what} ${doneHow('cloud', r.model, r.cost)}:`, ...savedLines(f, ['The model drew the picture again, so small details may differ from the original.', free].filter(Boolean).join(' '))].join('\n');
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
        return [`Erased ${n === 1 ? 'the box' : `${n} boxes`} ${doneHow('cloud', r.model, r.cost)}:`, ...savedLines(f, [note, free].filter(Boolean).join(' ') || undefined)].join('\n');
      } catch (e) {
        if (ctx.signal?.aborted) return { isError: true, text: 'Stopped before anything was erased.' };
        return { isError: true, text: `Nothing was erased: ${(e as Error).message}` };
      }
    },
  };
}
