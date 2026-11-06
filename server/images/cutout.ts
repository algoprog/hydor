// Taking the background out of a picture: on this computer when the picture tools are set up (local.ts: free, private,
// the picture's own pixels kept, only how see-through each is changes), else through OpenRouter, where an image model
// draws it again on a see-through background (make.ts, at a small cost). POST /api/images/cutout for the editors, and
// the agents' remove_background, which asks for the OpenRouter key on a card when it has to go that way and none is
// set (skipped, it does not run). Also what erase.ts shares with it: reading the picture to work on, choosing the
// way, keeping what was made, and saving it in a session's folder.
import fs from 'node:fs';
import path from 'node:path';
import type { CutoutAsk, PictureAnswer } from '../../shared/images.ts';
import { ASSET } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { inSession } from '../documents/index.ts';
import { noKeyText, openRouterKey } from '../connections/openrouter-key.ts';
import type { RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { loadConfig } from '../models/config.ts';
import { getAsset, pictureType, putAsset } from '../pages/assets.ts';
import { cloudTools } from './hooks.ts';
import type { MadeHere } from './local.ts';
import { saveImages, type Saved } from './openrouter.ts';
import { money } from './settings.ts';

/** The picture tools on this computer, as local.ts lends them to the routes and tools here. */
export interface Here {
  ready(): boolean;
  /** This computer can set them up (uv, or a Python 3.10 or later). */
  canSetUp(): boolean;
  cutout(img: Buffer, o: { maxBytes?: number; signal?: AbortSignal }): Promise<MadeHere>;
  erase(img: Buffer, where: { mask: Buffer } | { boxes: { x: number; y: number; w: number; h: number }[] }, o: { maxBytes?: number; signal?: AbortSignal }): Promise<MadeHere>;
}

/** The largest picture taken in (a data: address or a session's file). */
export const MAX_IN = 20 * 1024 * 1024;
/** The largest PNG made here: what the app keeps of a picture (server/pages/assets.ts). */
export const MAX_PNG = 12 * 1024 * 1024;

/** What the image model is asked when a cutout goes through OpenRouter. */
const CUTOUT_PROMPT = 'Keep the subject exactly as it is, take away everything behind it: the same subject, pose, colours, size and place in the frame, on a fully see-through background, with clean edges and nothing else changed.';

export const NO_KEY = 'Add an OpenRouter key in Settings → Models';
const SET_UP = 'set them up in Settings → Images, video and audio';

export type Way = 'local' | 'cloud';

const keySet = () => !!loadConfig().openrouter.apiKey;

/**
 * Which way a job goes: `how` local or cloud as asked, auto on this computer when the picture tools are ready, else
 * through OpenRouter; words a person can act on when the way asked for, or both ways, cannot be taken.
 */
export function wayFor(how: unknown, here: Here, what: string): Way {
  if (how === 'local') {
    if (!here.ready()) throw new HttpError(400, `${what} on this computer needs the picture tools: ${SET_UP}.`);
    return 'local';
  }
  if (how === 'cloud') {
    if (!keySet()) throw new HttpError(400, NO_KEY);
    if (!cloudTools()) throw new HttpError(501, 'Changing pictures through OpenRouter is not in this version of the app.');
    return 'cloud';
  }
  if (how !== undefined && how !== null && how !== 'auto') throw new HttpError(400, 'how: auto, local or cloud');
  if (here.ready()) return 'local';
  if (keySet() && cloudTools()) return 'cloud';
  throw new HttpError(400, `${what} needs the picture tools on this computer (free and private: ${SET_UP}) or an OpenRouter key (Settings → Models).`);
}

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Bytes that are a picture this works on (PNG, JPEG, WebP or GIF), or words saying what is wrong. */
export function checkPicture(data: Buffer, what = 'That'): Buffer {
  if (data.length > MAX_IN) throw new HttpError(413, `${what} is over ${MAX_IN / 2 ** 20} MB: make it smaller first.`);
  const mime = pictureType(data);
  if (mime === 'image/svg+xml') throw new HttpError(415, `${what} is a drawing (SVG): this works on pictures (PNG, JPEG, WebP or GIF).`);
  if (!mime || !ACCEPTED.has(mime)) throw new HttpError(415, `${what} is not a picture (PNG, JPEG, WebP or GIF).`);
  return data;
}

/** A data: address's bytes (its words checked as a picture's), or null when it is not one. */
export function fromDataUrl(s: string): Buffer | null {
  const comma = s.indexOf(',');
  if (!s.startsWith('data:') || comma < 0 || !/^data:image\/[a-z0-9.+-]+;base64$/i.test(s.slice(0, comma))) return null;
  if ((s.length - comma) * 0.75 > MAX_IN + 1024) throw new HttpError(413, `That picture is over ${MAX_IN / 2 ** 20} MB: make it smaller first.`);
  return Buffer.from(s.slice(comma + 1), 'base64');
}

/** The picture to work on: one the app keeps ("naget-asset:<sha>") or a data: address. */
export function readPicture(db: DB, src: unknown): Buffer {
  const s = typeof src === 'string' ? src.trim() : '';
  if (!s) throw new HttpError(400, 'Which picture? Give src: a kept picture (naget-asset:…) or a data: address.');
  if (s.startsWith(ASSET)) {
    const a = getAsset(db, s.slice(ASSET.length));
    if (!a) throw new HttpError(404, 'That picture is no longer kept by the app: add it again.');
    return checkPicture(a.data);
  }
  const data = fromDataUrl(s);
  if (!data) throw new HttpError(400, 'src: a kept picture (naget-asset:…) or a data: address of a picture.');
  return checkPicture(data);
}

/** A picture made here, kept as the editors' pictures are. */
export function keepMade(db: DB, made: MadeHere): PictureAnswer {
  return { src: ASSET + putAsset(db, made.png), w: made.w, h: made.h, mime: 'image/png', how: 'local', model: made.model };
}

/** POST /api/images/cutout: the picture with its background taken out. */
export async function cutoutPicture(db: DB, ask: CutoutAsk, signal: AbortSignal | undefined, here: Here): Promise<PictureAnswer> {
  const img = readPicture(db, ask?.src);
  if (wayFor(ask.how, here, 'Taking the background out') === 'local') return keepMade(db, await here.cutout(img, { maxBytes: MAX_PNG, signal }));
  const a = await cloudTools()!.edit(db, { src: String(ask.src).trim(), prompt: CUTOUT_PROMPT, transparent: true }, signal);
  return { ...a, how: 'cloud' };
}

// ---- for the agents' tools ----------------------------------------------------------------------------------

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** A session's picture, read and checked. */
export function sessionPicture(ctx: RunCtx, p: unknown): { file: string; data: Buffer } {
  const given = typeof p === 'string' ? p.trim() : '';
  if (!given) throw new Error('path: the picture to work on, in the session’s folder.');
  const file = inSession(ctx.cwd, given);
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st?.isFile()) throw new Error(`No such picture: ${file}`);
  if (st.size > MAX_IN) throw new Error(`${path.basename(file)} is over ${MAX_IN / 2 ** 20} MB: make it smaller first.`);
  try {
    return { file, data: checkPicture(fs.readFileSync(file), path.basename(file)) };
  } catch (e) {
    throw new Error((e as Error).message);
  }
}

export const dataUrl = (data: Buffer) => `data:${pictureType(data) ?? 'image/png'};base64,${data.toString('base64')}`;

/** What was made, saved in the session's images/ folder under a name of its own (never over a file that is there). */
export async function saveForAgent(ctx: RunCtx, data: Buffer, name: string): Promise<Saved> {
  const [f] = await saveImages([{ mime: pictureType(data) ?? 'image/png', data }], path.join(ctx.cwd, 'images'), name);
  return f;
}

/** The answer's lines for a saved picture: its path and size, as the conversation's card reads them. */
export function savedLines(f: Saved, note?: string): string[] {
  return [
    `${f.path} (${f.w && f.h ? `${f.w}×${f.h}, ` : ''}${size(f.bytes)})`,
    'The user sees it with your reply, a tap away from full size, download and keeping it in their Library: don’t repeat it or its path. To look at it yourself, open the file.',
    ...(note ? [note] : []),
  ];
}

/** How it was done, for the first line of an answer. */
export const doneHow = (way: Way, model: string | undefined, cost?: number) => (way === 'local' ? `with ${model}, on this computer (free and private)` : `with ${model ?? 'an image model'} through OpenRouter${cost ? ` (${money(cost)})` : ''}`);

/** For the agent, when the picture tools are not set up and this computer could set them up: they would do it free. */
export const localNote = (here: Here) => (here.ready() || !here.canSetUp() ? '' : 'The picture tools on this computer would do this free and in private once the user sets them up (Settings → Images, video and audio): you may tell them.');

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Before an agent's picture goes through OpenRouter: the key, asked for on a card in the conversation when none is set
 * (`why`, what it costs, also says the picture tools could do it free here when this computer can set them up). Without
 * one, what to tell the agent: a plain answer when the user skipped it, an error when this app cannot go that way.
 */
export async function keyForCloud(ctx: RunCtx, here: Here, o: { why: string; what: string; doing: string }): Promise<{ ok: true } | { ok: false; answer: string | ToolOutput }> {
  if (!cloudTools())
    return {
      ok: false,
      answer: {
        isError: true,
        text: `${o.doing} needs the picture tools on this computer here. Tell the user they can set them up in Settings → Images, video and audio (free and private: about 65 MB, and a model of about 220 MB the first time each tool is used).`,
      },
    };
  const free = !here.ready() && here.canSetUp() ? ' Or skip this and set up the picture tools in Settings → Images, video and audio: they do it free and in private on this computer.' : '';
  const k = await openRouterKey(ctx, { why: o.why + free });
  if (k.key !== null) return { ok: true };
  return { ok: false, answer: [sentence(noKeyText(k, o.what)), localNote(here)].filter(Boolean).join(' ') };
}

/** An agent's job on this computer failed: what to tell it (short of memory, the way through OpenRouter, if the user agrees). */
export const failedHere = (e: unknown, start: string) => `${start}: ${(e as Error).message}${e instanceof HttpError && e.status === 503 ? ' To do it through OpenRouter instead, call again with openrouter: true, if the user agrees.' : ''}`;

/** The agent asked to go through OpenRouter even though the picture tools are here. */
export const viaOpenRouter = (a: Record<string, unknown>) => a.openrouter === true || a.openrouter === 'true';

/** A kept picture's bytes (what OpenRouter's model made, kept by make.ts). */
export function keptBytes(db: DB, src: string): Buffer {
  const a = src.startsWith(ASSET) ? getAsset(db, src.slice(ASSET.length)) : null;
  if (!a) throw new Error('The model’s picture was not kept.');
  return a.data;
}

/** The agents' remove_background. */
export function removeBackgroundTool(db: DB, here: Here): RunTool {
  return {
    name: 'remove_background',
    // It writes a file, and may ask a service outside.
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Take the background out of a picture, leaving its subject (a person, a product, an animal, a logo, an object) on a see-through background: a PNG saved in the session’s folder (images/), to put on slides, documents and pages.',
      'On this computer, once the user has set up the picture tools (Settings → Images, video and audio), it is free and private, and keeps the subject’s pixels exactly; it takes a few seconds to half a minute, and the first time it downloads its model (about 220 MB).',
      'Otherwise it goes through OpenRouter at a small cost (about $0.01 to $0.05): an image model draws the picture again without its background, so small details may differ; without an OpenRouter key the user is asked for one, and if they skip it, nothing is done.',
      'The picture is shown to the user with your reply.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The picture (PNG, JPEG, WebP or GIF), in the session’s folder.' },
        name: { type: 'string', description: 'A short file name for the result, without extension (default: the picture’s name and "-cutout").' },
        openrouter: { type: 'boolean', description: 'true: through OpenRouter even though the picture tools are set up here, only when the user asks for that (when this computer is short of memory, say).' },
      },
      required: ['path'],
    },
    async run(a, ctx) {
      const { file, data } = sessionPicture(ctx, a.path);
      const name = (typeof a.name === 'string' && a.name.trim()) || `${path.basename(file, path.extname(file))}-cutout`;
      if (here.ready() && !viaOpenRouter(a)) {
        try {
          const made = await here.cutout(data, { maxBytes: MAX_PNG, signal: ctx.signal });
          const f = await saveForAgent(ctx, made.png, name);
          return [`Took the background out ${doneHow('local', made.model)}:`, ...savedLines(f, made.scaled ? 'It was made smaller to stay under 12 MB.' : undefined)].join('\n');
        } catch (e) {
          if (ctx.signal?.aborted) return { isError: true, text: 'Stopped before the background was taken out.' };
          return { isError: true, text: failedHere(e, 'The background was not taken out') };
        }
      }
      const key = await keyForCloud(ctx, here, {
        why: 'Taking the background out of a picture through OpenRouter costs about $0.01 to $0.05: an image model draws it again without its background.',
        what: 'the image model that would take the background out',
        doing: 'Taking the background out',
      });
      if (!key.ok) return key.answer;
      try {
        const r = await cloudTools()!.edit(db, { src: dataUrl(data), prompt: CUTOUT_PROMPT, transparent: true }, ctx.signal);
        const f = await saveForAgent(ctx, keptBytes(db, r.src), name);
        const note = ['The model drew the picture again, so small details may differ from the original.', localNote(here)].filter(Boolean).join(' ');
        return [`Took the background out ${doneHow('cloud', r.model, r.cost)}:`, ...savedLines(f, note)].join('\n');
      } catch (e) {
        if (ctx.signal?.aborted) return { isError: true, text: 'Stopped before the background was taken out.' };
        return { isError: true, text: `The background was not taken out: ${(e as Error).message}` };
      }
    },
  };
}
