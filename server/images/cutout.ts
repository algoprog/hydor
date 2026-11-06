// Taking the background out of a picture, two ways: on this computer when the picture tools are set up (local.ts:
// free, private, the picture's own pixels kept, only how see-through each is changes), or by an image model through
// OpenRouter (make.ts' edit, at a small cost), which draws it again on a see-through background. On auto it is done
// here first and the result judged (judgeCutout: did it keep almost nothing, or almost everything, is it unsure where
// the subject ends, is it in scattered pieces); a poor one is done again by an image model, and the answer says which
// way made it and why. POST /api/images/cutout for the editors, and the agents' remove_background, which asks for the
// OpenRouter key on a card when it needs one and none is set (skipped, no model runs). Also what erase.ts shares with
// it: reading the picture to work on, the way to take, keeping what was made, saving it in a session's folder.
import fs from 'node:fs';
import path from 'node:path';
import type { CutoutAsk, PictureAnswer } from '../../shared/images.ts';
import { ASSET } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { noKeyText, openRouterKey, type KeyAnswer } from '../connections/openrouter-key.ts';
import type { DB } from '../db.ts';
import { inSession } from '../documents/index.ts';
import type { RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { loadConfig } from '../models/config.ts';
import { getAsset, pictureType, putAsset } from '../pages/assets.ts';
import { cloudTools } from './hooks.ts';
import type { HoleHere, MadeHere } from './local.ts';
import { saveImages, type Saved } from './openrouter.ts';
import { money } from './settings.ts';

type Where = { mask: Buffer } | { boxes: { x: number; y: number; w: number; h: number }[] };

/** The picture tools on this computer, as local.ts lends them to the routes and tools here. */
export interface Here {
  ready(): boolean;
  /** This computer can set them up (uv, or a Python 3.10 or later). */
  canSetUp(): boolean;
  cutout(img: Buffer, o: { maxBytes?: number; signal?: AbortSignal }): Promise<MadeHere>;
  erase(img: Buffer, where: Where, o: { maxBytes?: number; signal?: AbortSignal }): Promise<MadeHere>;
  /** How large a hole to fill is and how detailed things are around it. */
  measure(img: Buffer, where: Where, o: { signal?: AbortSignal }): Promise<HoleHere>;
  /** The picture made `scale` times larger (upscale.ts), a tile at a time. */
  upscale(img: Buffer, o: { scale: 2 | 4; tiles: { x: number; y: number; w: number; h: number; px: number; py: number; pw: number; ph: number }[]; signal?: AbortSignal }): Promise<MadeHere>;
}

/** The largest picture taken in (a data: address or a session's file). */
export const MAX_IN = 20 * 1024 * 1024;
/** The largest PNG made here: what the app keeps of a picture (server/pages/assets.ts). */
export const MAX_PNG = 12 * 1024 * 1024;
/** About what an image model's change to a picture costs through OpenRouter. */
export const AI_COST = 'about $0.01 to $0.04';

/** What the image model is asked when a cutout goes through OpenRouter. */
const CUTOUT_PROMPT = 'Keep the subject exactly as it is, take away everything behind it: the same subject, pose, colours, size and place in the frame, on a fully see-through background, with clean edges and nothing else changed.';

export const NO_KEY = 'Add an OpenRouter key in Settings → Models';
const SET_UP = 'set them up in Settings → Images, video and audio';

/** auto: here when the picture tools are set up (and the result looks right), else an image model; local; ai. */
export type How = 'auto' | 'local' | 'ai';
export type Way = 'local' | 'ai';

/** How a job is asked to go; cloud is the contract's word for ai. */
export function howOf(v: unknown): How {
  if (v === undefined || v === null || v === '' || v === 'auto') return 'auto';
  if (v === 'local') return 'local';
  if (v === 'ai' || v === 'cloud') return 'ai';
  throw new HttpError(400, 'how: auto, local or ai');
}

export const keySet = () => !!loadConfig().openrouter.apiKey;
/** An image model can be asked now: a key, and make.ts here. */
export const aiReady = () => keySet() && !!cloudTools();

/**
 * Which way a job starts: as asked, or on auto here when the picture tools are ready, else an image model; words a
 * person can act on when the way asked for, or both ways, cannot be taken.
 */
export function wayFor(how: How, here: Here, what: string): Way {
  if (how === 'local') {
    if (!here.ready()) throw new HttpError(400, `${what} on this computer needs the picture tools: ${SET_UP}.`);
    return 'local';
  }
  if (how === 'ai') {
    if (!keySet()) throw new HttpError(400, NO_KEY);
    if (!cloudTools()) throw new HttpError(501, 'Changing pictures through OpenRouter is not in this version of the app.');
    return 'ai';
  }
  if (here.ready()) return 'local';
  if (aiReady()) return 'ai';
  throw new HttpError(400, `${what} needs the picture tools on this computer (free and private: ${SET_UP}) or an OpenRouter key (Settings → Models).`);
}

// ---- judging a cutout ---------------------------------------------------------------------------------------------

/** A piece of a mask: how many pixels, and the box around it. */
export interface Piece {
  size: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The pieces of a mask where `on` holds (pixels touching on any of 8 sides), those of at least `min` pixels. */
export function piecesOf(m: Uint8Array, w: number, h: number, on: (v: number) => boolean, min = 1): Piece[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Piece[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !on(m[i])) continue;
    let top = 0;
    stack[top++] = i;
    seen[i] = 1;
    const p: Piece = { size: 0, x0: w, y0: h, x1: -1, y1: -1 };
    while (top) {
      const j = stack[--top];
      const x = j % w;
      const y = (j - x) / w;
      p.size++;
      if (x < p.x0) p.x0 = x;
      if (x > p.x1) p.x1 = x;
      if (y < p.y0) p.y0 = y;
      if (y > p.y1) p.y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (!seen[k] && on(m[k])) {
            seen[k] = 1;
            stack[top++] = k;
          }
        }
    }
    if (p.size >= min) out.push(p);
  }
  return out;
}

/** What judging a cutout found: whether it looks right, and if not why, in words that follow "The background remover on this computer". */
export interface CutoutVerdict {
  ok: boolean;
  why?: string;
  /** The share of the picture kept (at least half there). */
  kept: number;
  /** How wide the unsure band along its edge is, in pixels of the small mask (a sharp edge: about 1). */
  band: number;
  /** The pieces it is in, of at least 0.2% of the picture each. */
  pieces: number;
}

const KEPT_LEAST = 0.02;
const KEPT_MOST = 0.97;
/** Measured at 512 pixels across: sharp cutouts (a photo of a person, thin lines) 0.9 to 1.3; a mask blurred by 6 pixels, 9. */
const BAND_MOST = 6;
const PIECES_MOST = 6;

/**
 * Whether a cutout's mask (see-through 0 to opaque 255, at most 512 pixels across) looks right: not almost nothing kept
 * nor almost everything, a sharp edge (few pixels half see-through along it), in a few pieces at most.
 */
export function judgeCutout(a: Uint8Array, w: number, h: number): CutoutVerdict {
  const n = w * h;
  let kept = 0;
  let unsure = 0;
  let edge = 0;
  for (let i = 0; i < n; i++) {
    const v = a[i];
    if (v >= 38 && v <= 217) unsure++;
    if (v < 128) continue;
    kept++;
    const x = i % w;
    // A kept pixel with a see-through one beside it is on the edge.
    if (x === 0 || x === w - 1 || i < w || i >= n - w || a[i - 1] < 128 || a[i + 1] < 128 || a[i - w] < 128 || a[i + w] < 128) edge++;
  }
  const share = kept / Math.max(1, n);
  const band = unsure / Math.max(1, edge);
  const pieces = piecesOf(a, w, h, (v) => v >= 128, Math.max(4, Math.ceil(n * 0.002))).length;
  const v = { kept: Math.round(share * 1000) / 1000, band: Math.round(band * 100) / 100, pieces };
  if (share < KEPT_LEAST) return { ok: false, why: 'found almost nothing to keep', ...v };
  if (share > KEPT_MOST) return { ok: false, why: 'kept almost the whole picture', ...v };
  if (band > BAND_MOST) return { ok: false, why: 'was unsure where the subject ends', ...v };
  if (pieces > PIECES_MOST) return { ok: false, why: `found the subject in ${pieces} scattered pieces`, ...v };
  return { ok: true, ...v };
}

/** The verdict on a cutout made here (sure enough when there is nothing to judge it by). */
const verdictOf = (made: MadeHere): CutoutVerdict => (made.small ? judgeCutout(made.small.data, made.small.w, made.small.h) : { ok: true, kept: 0, band: 0, pieces: 0 });

// ---- pictures in, pictures out ------------------------------------------------------------------------------------

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
export function keepMade(db: DB, made: MadeHere, why?: string): PictureAnswer {
  return { src: ASSET + putAsset(db, made.png), w: made.w, h: made.h, mime: 'image/png', how: 'local', model: made.model, ...(why ? { why } : {}) };
}

/** A kept picture's bytes (what OpenRouter's model made, kept by make.ts). */
export function keptBytes(db: DB, src: string): Buffer {
  const a = src.startsWith(ASSET) ? getAsset(db, src.slice(ASSET.length)) : null;
  if (!a) throw new Error('The model’s picture was not kept.');
  return a.data;
}

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const errorOf = (e: unknown) => String((e as Error).message ?? e).replace(/\.$/, '');

/** This computer did not have the memory free for the job (local.ts says how much it needs). */
export const shortOfMemory = (e: unknown) => e instanceof HttpError && e.status === 503 && /not enough free memory/.test(e.message);

/** POST /api/images/cutout: the picture with its background taken out (on auto, here first, and again by an image model when it looks poor). */
export async function cutoutPicture(db: DB, ask: CutoutAsk, signal: AbortSignal | undefined, here: Here): Promise<PictureAnswer> {
  const img = readPicture(db, ask?.src);
  const how = howOf(ask.how);
  const src = String(ask.src).trim();
  const ai = (why?: string) =>
    cloudTools()!
      .edit(db, { src, prompt: CUTOUT_PROMPT, transparent: true }, signal)
      .then((a): PictureAnswer => ({ ...a, how: 'cloud', ...(why ? { why } : {}) }));
  if (wayFor(how, here, 'Taking the background out') === 'ai') return ai(how === 'auto' ? 'The picture tools on this computer are not set up, so an image model did it.' : undefined);
  let made: MadeHere;
  try {
    made = await here.cutout(img, { maxBytes: MAX_PNG, signal });
  } catch (e) {
    if (how === 'auto' && shortOfMemory(e) && aiReady()) return ai('This computer did not have the memory free for the background remover, so an image model did it.');
    throw e;
  }
  const v = verdictOf(made);
  if (v.ok) return keepMade(db, made);
  if (how === 'local') return keepMade(db, made, `The background remover on this computer ${v.why}: look at the edges, or try it with AI.`);
  if (!aiReady()) return keepMade(db, made, `The background remover on this computer ${v.why}: look at the edges. An image model would do it better: add an OpenRouter key in Settings → Models.`);
  try {
    return await ai(`The background remover on this computer ${v.why}, so an image model did it.`);
  } catch (e) {
    if (signal?.aborted) throw e;
    return keepMade(db, made, `The background remover on this computer ${v.why}: look at the edges. An image model could not do it either: ${errorOf(e)}.`);
  }
}

// ---- for the agents' tools ----------------------------------------------------------------------------------

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * The picture an agent names: a file of its session's, or one the app keeps (naget-asset:<sha>, as get_page shows the
 * pictures of decks, documents and pages); read and checked. `name` starts the result's file name; `kept`, the one kept.
 */
export function agentPicture(db: DB, ctx: RunCtx, p: unknown): { name: string; data: Buffer; kept?: string } {
  const given = typeof p === 'string' ? p.trim() : '';
  if (!given) throw new Error('path: the picture to work on: a file in the session’s folder, or naget-asset:… from a deck, document or page.');
  if (given.startsWith(ASSET)) {
    const a = getAsset(db, given.slice(ASSET.length));
    if (!a) throw new Error(`${given} is not a picture this app keeps: get_page shows the pictures of a deck, document or page.`);
    try {
      return { name: 'picture', data: checkPicture(a.data, given), kept: given };
    } catch (e) {
      throw new Error((e as Error).message);
    }
  }
  const file = inSession(ctx.cwd, given);
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st?.isFile()) throw new Error(`No such picture: ${file}`);
  if (st.size > MAX_IN) throw new Error(`${path.basename(file)} is over ${MAX_IN / 2 ** 20} MB: make it smaller first.`);
  try {
    return { name: path.basename(file, path.extname(file)), data: checkPicture(fs.readFileSync(file), path.basename(file)) };
  } catch (e) {
    throw new Error((e as Error).message);
  }
}

/** The way an agent asked for (auto when it gave none). */
export function agentHow(v: unknown): How {
  try {
    return howOf(v);
  } catch {
    throw new Error('how: auto, local or ai.');
  }
}

export const HOW_SCHEMA = {
  type: 'string',
  enum: ['auto', 'local', 'ai'],
  description:
    'auto (the default): on this computer when the picture tools are set up and the result looks right, else by an image model through OpenRouter; local: only on this computer; ai: by an image model through OpenRouter (when the user asks for it, or a result made here was not right).',
};

/** For a picture of a deck, document or page: how the agent puts what was made in its place. */
export const inPlace = (kept: string | undefined) => (kept ? `To put it in place of the old picture, give this path to save_slides, save_doc or save_page where ${kept} was.` : undefined);

export const SCALED = 'It was made smaller to stay under 12 MB.';
export const REDRAWN = 'The model drew the picture again, so small details may differ from the original.';

/** The answer's last line: what to do when the result is not right. */
export function lookLine(way: Way, wrong: string, here: Here): string {
  if (way === 'local') return `Look at the result: if it is not right (${wrong}), call again with how: "ai" to have an image model do it (${AI_COST}), or use generate_image with the picture and words to change it.`;
  return `Look at the result: if it is not right, call again (an image model answers differently each time)${here.ready() ? ', or with how: "local" to do it on this computer' : ''}, or use generate_image with the picture and words to change it.`;
}

export const dataUrl = (data: Buffer) => `data:${pictureType(data) ?? 'image/png'};base64,${data.toString('base64')}`;

/** What was made, saved in the session's images/ folder under a name of its own (never over a file that is there). */
export async function saveForAgent(ctx: RunCtx, data: Buffer, name: string): Promise<Saved> {
  const [f] = await saveImages([{ mime: pictureType(data) ?? 'image/png', data }], path.join(ctx.cwd, 'images'), name);
  return f;
}

/** The answer's lines for a saved picture: its path and size, as the conversation's card reads them, then any notes. */
export function savedLines(f: Saved, ...notes: (string | false | undefined)[]): string[] {
  return [
    `${f.path} (${f.w && f.h ? `${f.w}×${f.h}, ` : ''}${size(f.bytes)})`,
    'The user sees it with your reply, a tap away from full size, download and keeping it in their Library: don’t repeat it or its path. To look at it yourself, open the file.',
    ...notes.filter((x): x is string => !!x),
  ];
}

/** How it was done, for the first line of an answer. */
export const doneHow = (way: Way, model: string | undefined, cost?: number) => (way === 'local' ? `with ${model} on this computer (free and private)` : `with ${model ?? 'an image model'} through OpenRouter${cost ? ` (${money(cost)})` : ''}`);

/** For the agent, when the picture tools are not set up and this computer could set them up: they would do it free. */
export const localNote = (here: Here) => (here.ready() || !here.canSetUp() ? '' : 'The picture tools on this computer would do this free and in private once the user sets them up (Settings → Images, video and audio): you may tell them.');

/** Why no image model ran: no key (and why), or no way to one in this app. */
export type NoModel = Extract<KeyAnswer, { key: null }>['why'] | 'no-ai';

/** Why no image model ran, after a result made here, in words that follow a colon. */
export const noModelWhy = (why: NoModel): string =>
  ({
    skipped: 'the user chose not to add an OpenRouter key',
    'skipped-before': 'the user chose earlier not to add an OpenRouter key',
    nobody: 'no OpenRouter key is set (the user can add one in Settings → Models)',
    timeout: 'the user did not answer the card asking for an OpenRouter key',
    stopped: 'it was stopped',
    'no-ai': 'this app cannot reach an image model',
  })[why];

/**
 * Before an agent's picture goes through OpenRouter: the key, asked for on a card in the conversation when none is set
 * (`why`, what it costs, also says the picture tools could do it free here when this computer can set them up). Without
 * one, what to tell the agent (a plain answer when the user skipped it, an error when this app cannot go that way) and why.
 */
export async function keyForCloud(ctx: RunCtx, here: Here, o: { why: string; what: string; doing: string }): Promise<{ ok: true } | { ok: false; answer: string | ToolOutput; why: NoModel }> {
  if (!cloudTools())
    return {
      ok: false,
      why: 'no-ai',
      answer: {
        isError: true,
        text: `${o.doing} needs the picture tools on this computer here. Tell the user they can set them up in Settings → Images, video and audio (free and private: about 145 MB, and a model of about 200 MB the first time each tool is used).`,
      },
    };
  const free = !here.ready() && here.canSetUp() ? ' Or skip this and set up the picture tools in Settings → Images, video and audio: they do it free and in private on this computer.' : '';
  const k = await openRouterKey(ctx, { why: o.why + free });
  if (k.key !== null) return { ok: true };
  return { ok: false, why: k.why, answer: [sentence(noKeyText(k, o.what)), localNote(here)].filter(Boolean).join(' ') };
}

/** An agent's job on this computer failed: what to tell it (short of memory: the way through an image model, if the user agrees). */
export const failedHere = (e: unknown, start: string) => `${start}: ${(e as Error).message}${e instanceof HttpError && e.status === 503 ? ' To have an image model do it instead, call again with how: "ai", if the user agrees.' : ''}`;

/** The agents' remove_background. */
export function removeBackgroundTool(db: DB, here: Here): RunTool {
  const WRONG = 'edges cut into the subject, background left behind';
  return {
    name: 'remove_background',
    // It writes a file, and may ask a service outside.
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Take the background out of a picture, leaving its subject (a person, a product, an animal, a logo, an object) on a see-through background: a PNG saved in the session’s folder (images/), to put on slides, documents and pages.',
      'On this computer, once the user has set up the picture tools (Settings → Images, video and audio), it is free and private, and keeps the subject’s pixels exactly; it takes a few seconds to half a minute, and the first time it downloads its model (about 190 MB). Its result is checked, and when it looks poor an image model does it again.',
      `An image model through OpenRouter costs ${AI_COST} and draws the picture again without its background, so small details may differ; without an OpenRouter key the user is asked for one, and if they skip it, no model runs.`,
      'The picture is shown to the user with your reply; the answer says which way made it and why.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The picture: a file in the session’s folder (PNG, JPEG, WebP or GIF), or one in a deck, document or page as get_page shows it (naget-asset:…).' },
        name: { type: 'string', description: 'A short file name for the result, without extension (default: the picture’s name and "-cutout").' },
        how: HOW_SCHEMA,
      },
      required: ['path'],
    },
    async run(a, ctx) {
      const pic = agentPicture(db, ctx, a.path);
      const how = agentHow(a.how);
      const name = (typeof a.name === 'string' && a.name.trim()) || `${pic.name}-cutout`;
      if (how === 'local' && !here.ready()) return { isError: true, text: `Taking the background out on this computer needs the picture tools: the user can ${SET_UP}.` };
      const stopped = () => ({ isError: true, text: 'Stopped before the background was taken out.' });
      let made: MadeHere | undefined;
      let poor: string | undefined;
      let noRoom: unknown;
      if (here.ready() && how !== 'ai') {
        try {
          made = await here.cutout(pic.data, { maxBytes: MAX_PNG, signal: ctx.signal });
        } catch (e) {
          if (ctx.signal?.aborted) return stopped();
          // Short of memory here: on auto an image model can do it instead.
          if (how !== 'auto' || !shortOfMemory(e)) return { isError: true, text: failedHere(e, 'The background was not taken out') };
          noRoom = e;
        }
        if (made) {
          const v = verdictOf(made);
          if (v.ok || how === 'local') {
            const f = await saveForAgent(ctx, made.png, name);
            const first = `Took the background out ${doneHow('local', made.model)}${v.ok ? '' : `, though it ${v.why}`}:`;
            return [first, ...savedLines(f, made.scaled && SCALED, inPlace(pic.kept), lookLine('local', WRONG, here))].join('\n');
          }
          poor = v.why;
        }
      }
      const key = await keyForCloud(ctx, here, {
        why: poor
          ? `The background remover on this computer ${poor}. An image model through OpenRouter can take the background out instead, for ${AI_COST}.`
          : noRoom
            ? `This computer does not have the memory free to take the background out here. An image model through OpenRouter can do it instead, for ${AI_COST}.`
            : `Taking the background out of a picture through OpenRouter costs ${AI_COST}: an image model draws it again without its background.`,
        what: 'the image model that would take the background out',
        doing: 'Taking the background out',
      });
      // A poor result made here is still a result: given when no model can do better.
      const fallBack = async (why: string) => {
        const f = await saveForAgent(ctx, made!.png, name);
        return [`Took the background out ${doneHow('local', made!.model)}, though it ${poor}; an image model did not do it again: ${why}:`, ...savedLines(f, made!.scaled && SCALED, inPlace(pic.kept), lookLine('local', WRONG, here))].join('\n');
      };
      if (!key.ok) {
        if (key.why === 'stopped') return stopped();
        if (noRoom) return { isError: true, text: `The background was not taken out: ${(noRoom as Error).message} An image model did not do it instead: ${noModelWhy(key.why)}.` };
        return made ? fallBack(noModelWhy(key.why)) : key.answer;
      }
      try {
        const r = await cloudTools()!.edit(db, { src: dataUrl(pic.data), prompt: CUTOUT_PROMPT, transparent: true }, ctx.signal);
        const f = await saveForAgent(ctx, keptBytes(db, r.src), name);
        const because = poor ? ` The background remover on this computer ${poor}, so an image model did it.` : noRoom ? ' This computer did not have the memory free for the background remover, so an image model did it.' : '';
        return [`Took the background out ${doneHow('ai', r.model, r.cost)}:${because}`, ...savedLines(f, REDRAWN, inPlace(pic.kept), localNote(here), lookLine('ai', WRONG, here))].join('\n');
      } catch (e) {
        if (ctx.signal?.aborted) return stopped();
        if (made) return fallBack(`it failed (${errorOf(e)})`);
        return { isError: true, text: `The background was not taken out: ${(e as Error).message}` };
      }
    },
  };
}
