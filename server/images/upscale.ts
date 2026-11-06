// Making a picture larger on this computer, 2× or 4× each side, its detail drawn in sharply rather than blurred:
// Real-ESRGAN's small general model (realesr-general-x4v3, BSD-3, 5 MB) in the picture tools' worker (local.ts), free and
// private, with no way through OpenRouter. The picture goes to the model a tile at a time (tilePlan: squares with a
// margin each side that the model sees but whose result is dropped, so no seam shows), so memory stays low however large
// the picture; a picture with see-through parts keeps them (made larger smoothly). The result is at most the editor's
// largest picture (8,192 pixels a side, 40 million in all).
//   POST /api/images/upscale { src, scale }   → the picture made larger, a PNG (its size in x-width and x-height)
// and the agents' upscale_image, which saves it in the session's images/ folder.
import { LIMITS } from '../../shared/mediaedit.ts';
import { ASSET } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { RunTool } from '../features/types.ts';
import { getAsset } from '../pages/assets.ts';
import { agentPicture, checkPicture, inPlace, saveForAgent, savedLines, type Here } from './cutout.ts';
import { dimensions } from './openrouter.ts';

/** A tile: the part of the picture whose result is kept (x, y, w, h), and the larger part the model is shown (px, py, pw, ph). */
export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  py: number;
  pw: number;
  ph: number;
}

/** The tiles' side and margin, in the picture's own pixels: 256 and 16 cost about 30% more work than one piece, and little memory. */
export const TILE = 256;
export const PAD = 16;

/**
 * The tiles a picture `w` × `h` goes to the model in: squares of `tile` pixels (the last of a row or column smaller)
 * that together cover it once, each shown to the model with `pad` pixels more on each side, inside the picture.
 */
export function tilePlan(w: number, h: number, tile = TILE, pad = PAD): Tile[] {
  const t = Math.max(8, Math.round(tile));
  const out: Tile[] = [];
  for (let y = 0; y < h; y += t)
    for (let x = 0; x < w; x += t) {
      const tw = Math.min(t, w - x);
      const th = Math.min(t, h - y);
      const px = Math.max(0, x - pad);
      const py = Math.max(0, y - pad);
      out.push({ x, y, w: tw, h: th, px, py, pw: Math.min(w, x + tw + pad) - px, ph: Math.min(h, y + th + pad) - py });
    }
  return out;
}

export const SCALES = [2, 4] as const;
export type Scale = (typeof SCALES)[number];

/** Why a picture cannot be made `scale` times larger (too large a result), in words, or null when it can. */
export function tooLarge(w: number, h: number, scale: number): string | null {
  const W = w * scale;
  const H = h * scale;
  if (W <= LIMITS.side && H <= LIMITS.side && W * H <= LIMITS.pixels) return null;
  const fits = SCALES.filter((s) => s < scale && w * s <= LIMITS.side && h * s <= LIMITS.side && w * s * h * s <= LIMITS.pixels);
  return `Made ${scale}× larger it would be ${W} × ${H} pixels: at most ${LIMITS.side} on a side and ${LIMITS.pixels / 1e6} million in all.${fits.length ? ` Make it ${fits[fits.length - 1]}× larger instead, or crop it first.` : ' Crop it first, or make it smaller.'}`;
}

/** The largest picture taken in (a data: address, or one the app keeps). */
const MAX_IN = 48 * 1024 * 1024;

/** The picture to make larger: one the app keeps ("naget-asset:<sha>") or a data: address. */
function pictureOf(db: DB, src: unknown): Buffer {
  const s = typeof src === 'string' ? src.trim() : '';
  if (!s) throw new HttpError(400, 'Which picture? Give src: a kept picture (naget-asset:…) or a data: address.');
  if (s.startsWith(ASSET)) {
    const a = getAsset(db, s.slice(ASSET.length));
    if (!a) throw new HttpError(404, 'That picture is no longer kept by the app: add it again.');
    return checkPicture(a.data);
  }
  const comma = s.indexOf(',');
  if (!s.startsWith('data:') || comma < 0 || !/^data:image\/[a-z0-9.+-]+;base64$/i.test(s.slice(0, comma))) throw new HttpError(400, 'src: a kept picture (naget-asset:…) or a data: address of a picture.');
  if ((s.length - comma) * 0.75 > MAX_IN + 1024) throw new HttpError(413, `That picture is over ${MAX_IN / 2 ** 20} MB: make it smaller first.`);
  const data = Buffer.from(s.slice(comma + 1), 'base64');
  if (data.length > 20 * 1024 * 1024) {
    // Larger than the other tools take: checked here by its kind alone.
    if (!dimensions(data)) throw new HttpError(415, 'That is not a picture (PNG, JPEG, WebP or GIF).');
    return data;
  }
  return checkPicture(data);
}

const SET_UP = 'Making a picture larger needs the picture tools on this computer: set them up in Settings → Images, video and audio (free and private).';

/** POST /api/images/upscale: the picture made `scale` times larger here, a PNG. */
export async function upscalePicture(db: DB, body: Record<string, unknown>, signal: AbortSignal | undefined, here: Here): Promise<{ png: Buffer; w: number; h: number; model: string }> {
  const scale = Number(body.scale);
  if (!SCALES.includes(scale as Scale)) throw new HttpError(400, 'scale: 2 or 4');
  if (!here.ready()) throw new HttpError(400, SET_UP);
  const img = pictureOf(db, body.src);
  const d = dimensions(img);
  if (!d) throw new HttpError(415, 'That picture could not be read.');
  const big = tooLarge(d.w, d.h, scale);
  if (big) throw new HttpError(413, big);
  const made = await here.upscale(img, { scale: scale as Scale, tiles: tilePlan(d.w, d.h), signal });
  return { png: made.png, w: made.w, h: made.h, model: made.model };
}

/** The agents' upscale_image. */
export function upscaleTool(db: DB, here: Here): RunTool {
  return {
    name: 'upscale_image',
    annotations: { readOnlyHint: false, openWorldHint: false },
    description: [
      'Make a picture larger, 2× or 4× each side, its detail drawn in sharply rather than blurred (a small photo for print or a slide, an old picture, a thumbnail): Real-ESRGAN on this computer, free and private, once the user has set up the picture tools (Settings → Images, video and audio). The first time, it downloads its model (about 5 MB).',
      'It takes a few seconds for a small picture, a minute or two for a large one. The result is a PNG of at most 8,192 pixels a side and 40 million in all, saved in the session’s images/ folder (the original stays as it was) and shown to the user with your reply.',
      'For a logo or an icon, a drawing (SVG) stays sharp at any size instead.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The picture: a file in the session’s folder (PNG, JPEG, WebP or GIF), or one in a deck, document or page as get_page shows it (naget-asset:…).' },
        scale: { type: 'integer', enum: [2, 4], description: 'How many times larger each side becomes (default 2).' },
        name: { type: 'string', description: 'A short file name for the result, without extension (default: the picture’s name and "-2x" or "-4x").' },
      },
      required: ['path'],
    },
    async run(a, ctx) {
      const scale = a.scale === undefined || a.scale === null ? 2 : Number(a.scale);
      if (!SCALES.includes(scale as Scale)) return { isError: true, text: 'scale: 2 or 4.' };
      if (!here.ready())
        return {
          isError: true,
          text: here.canSetUp()
            ? 'Making a picture larger needs the picture tools on this computer: the user can set them up in Settings → Images, video and audio (free and private: about 145 MB once, and about 5 MB for this model the first time).'
            : 'Making a picture larger needs the picture tools on this computer, which cannot be set up here (they need Python 3.10 or later, or uv).',
        };
      const pic = agentPicture(db, ctx, a.path);
      const d = dimensions(pic.data);
      if (!d) return { isError: true, text: 'That picture could not be read.' };
      const big = tooLarge(d.w, d.h, scale);
      if (big) return { isError: true, text: big };
      try {
        const made = await here.upscale(pic.data, { scale: scale as Scale, tiles: tilePlan(d.w, d.h), signal: ctx.signal });
        const name = (typeof a.name === 'string' && a.name.trim()) || `${pic.name}-${scale}x`;
        const f = await saveForAgent(ctx, made.png, name);
        return [`Made the picture ${scale}× larger (${d.w}×${d.h} to ${made.w}×${made.h}) with ${made.model} on this computer (free and private):`, ...savedLines(f, inPlace(pic.kept))].join('\n');
      } catch (e) {
        if (ctx.signal?.aborted) return { isError: true, text: 'Stopped before the picture was made larger.' };
        return { isError: true, text: `The picture was not made larger: ${(e as Error).message}` };
      }
    },
  };
}
