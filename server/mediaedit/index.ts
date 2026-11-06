// The picture editor's saves, and edit_image for agents. The editor in the app (web/src/features/mediaedit) makes the
// picture in the browser and keeps it where it belongs with one route; agents make the same edits from a recipe on the
// server (image.ts), the same recipe the editor uses (shared/mediaedit.ts).
//   POST /api/mediaedit/image   { data, to, format?, quality? } → { src?, media?, path?, w, h, mime, bytes, replaced?, note? }
//     to: { asset: true }                          kept for a deck, document or page ("naget-asset:<sha>")
//         { media?: id, as: 'replace' | 'copy' }   over a Library picture (its place, title and folder kept), or a new one
//         { file: path, as: 'replace' | 'copy' }   over a file (its old version to the Trash), or a copy beside it
// Files are written as Files writes them, nowhere inside the app's own data folder.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MediaItem } from '../../shared/media.ts';
import { boxToUpright, colorOf, FILTERS, IMAGE_FORMATS, LIMITS, normalizeRecipe, toUpright, type Box, type ImageFormat, type ImageRecipe, type Mark, type Quarter, type SaveImageAnswer } from '../../shared/mediaedit.ts';
import { ASSET } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { Deps, Feature, RunCtx, RunTool } from '../features/types.ts';
import { freeName, resolvePath, trashCopy, writeFile } from '../files.ts';
import { agentPicture, inPlace, saveForAgent, savedLines } from '../images/cutout.ts';
import { dimensions } from '../images/openrouter.ts';
import { still } from '../media/frames.ts';
import { keepFile } from '../media/index.ts';
import { filesOf, getMedia, MEDIA_DIR, mustMedia } from '../media/store.ts';
import { putInFolder } from '../pages/folders.ts';
import { MAX_ASSET, putAsset } from '../pages/assets.ts';
import { convert, decode, EditError, encode, extOf, formatOfData, MIMES, PLACES, render, type Place, type Words } from './image.ts';

/** The largest picture the editor saves. */
const MAX_PICTURE = 60 * 1024 * 1024;
const LABEL: Record<ImageFormat, string> = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP' };

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const fmtOf = (v: unknown): ImageFormat | undefined => (v === 'jpg' ? 'jpeg' : IMAGE_FORMATS.some((f) => f.id === v) ? (v as ImageFormat) : undefined);
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
/** A file's name says what kind of picture it holds. */
const formatOfPath = (p: string): ImageFormat | null => fmtOf(path.extname(p).slice(1).toLowerCase()) ?? null;

/** Within the app's own data (its database, the Library's copies, the Trash): written only through their own routes. */
function appsOwn(file: string): boolean {
  const real = (p: string) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const data = real(config.dataDir);
  const at = real(fs.existsSync(file) ? file : path.dirname(file));
  return at === data || at.startsWith(data + path.sep);
}

function pictureOf(v: unknown): Buffer {
  const m = typeof v === 'string' ? /^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(v.trim()) : null;
  if (!m) throw new HttpError(400, 'data: the picture as a data: address (PNG, JPEG or WebP)');
  const b = Buffer.from(m[1], 'base64');
  if (b.length > MAX_PICTURE) throw new HttpError(413, `That picture is over ${MAX_PICTURE / 1048576} MB: make it smaller, or save it as JPEG or WebP`);
  if (!formatOfData(b)) throw new HttpError(415, 'That is not a PNG, JPEG or WebP picture');
  return b;
}

/** A Library picture's file written over: its place in the Library, its title and description and folder kept; its still made again. */
async function replaceInLibrary(d: Deps, id: string, data: Buffer, fmt: ImageFormat): Promise<MediaItem> {
  const m = mustMedia(d.db, id);
  if (m.kind !== 'image') throw new HttpError(400, 'Only a picture in the Library can be written over with a picture');
  const name = `${m.id}.${extOf(fmt)}`;
  const dest = path.join(MEDIA_DIR, name);
  const tmp = path.join(MEDIA_DIR, `.${name}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  await fs.promises.mkdir(MEDIA_DIR, { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(tmp, data, { mode: 0o600 });
  await fs.promises.rename(tmp, dest);
  if (path.resolve(m.file) !== path.resolve(dest)) await fs.promises.rm(m.file, { force: true });
  const dim = dimensions(data);
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  d.db.prepare('update media set file = ?, mime = ?, bytes = ?, width = ?, height = ?, sha = ?, updated_at = ? where id = ?').run(name, MIMES[fmt], data.length, dim?.w ?? null, dim?.h ?? null, sha, Date.now(), id);
  const f = filesOf({ id, file: dest });
  await fs.promises.rm(f.still, { force: true });
  if (data.length > 400 * 1024 || (dim?.w ?? 0) > 1200) await still(dest, f.still, { width: 720 });
  const item = getMedia(d.db, id)!;
  d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', item } });
  return item;
}

/** A new Library picture: from a Library item (its project and folder kept, "(edited)" after its name), or simply named. */
async function copyToLibrary(d: Deps, data: Buffer, fmt: ImageFormat, from: MediaItem | null, title: string): Promise<MediaItem> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-edited-'));
  try {
    const stem =
      (from?.title || title || 'Picture')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
        .trim()
        .slice(0, 80) || 'Picture';
    const file = path.join(dir, `${stem.replace(/\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i, '')} (edited).${extOf(fmt)}`);
    fs.writeFileSync(file, data);
    const { item } = await keepFile(d, { path: file, ...(from?.space ? { space: from.space } : {}) }, { move: true });
    if (from?.folder && !item.folder) {
      putInFolder(d.db, 'media', item.id, from.folder);
      const moved = getMedia(d.db, item.id)!;
      d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', item: moved } });
      return moved;
    }
    return item;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** POST /api/mediaedit/image. */
async function saveEdited(d: Deps, b: Record<string, unknown>): Promise<SaveImageAnswer & { item?: MediaItem }> {
  let data = pictureOf(b.data);
  let fmt = formatOfData(data)!;
  let note: string | undefined;
  const want = fmtOf(b.format);
  if (want && want !== fmt) {
    try {
      data = (await convert(data, want, num(b.quality) ?? 90)).data;
      fmt = want;
    } catch (e) {
      note = `It is saved as ${LABEL[fmt]}, not ${LABEL[want]}: ${(e as Error).message}`;
    }
  }
  const dim = dimensions(data) ?? { w: 0, h: 0 };
  const base = { w: dim.w, h: dim.h, mime: MIMES[fmt], bytes: data.length, ...(note ? { note } : {}) };
  const to = (b.to && typeof b.to === 'object' ? b.to : null) as Record<string, unknown> | null;
  if (!to) throw new HttpError(400, 'to: where it goes: { asset: true }, { media, as } or { file, as }');
  if (to.asset === true) {
    if (data.length > MAX_ASSET) throw new HttpError(413, `That picture is ${size(data.length)}: a deck, document or page keeps pictures of up to ${MAX_ASSET / 1048576} MB. Save it as JPEG or WebP, or make it smaller.`);
    return { src: ASSET + putAsset(d.db, data), ...base };
  }
  const as = to.as === 'replace' ? 'replace' : to.as === 'copy' ? 'copy' : null;
  if (!as) throw new HttpError(400, 'to.as: replace (write over it) or copy (keep it beside)');
  if (typeof to.file === 'string') {
    const file = resolvePath(to.file);
    if (appsOwn(file)) throw new HttpError(403, 'That file is part of the app’s own data: it is not written from here.');
    const st = fs.statSync(file, { throwIfNoEntry: false });
    if (as === 'replace') {
      if (!st?.isFile()) throw new HttpError(404, `No such file: ${file}`);
      const kind = formatOfPath(file);
      if (kind !== fmt) throw new HttpError(400, `${path.basename(file)} is ${kind ? `a ${LABEL[kind]} file` : 'not a PNG, JPEG or WebP file'}: save it as ${kind ? LABEL[kind] : 'one of those'}, or as a copy beside it.`);
      try {
        fs.accessSync(file, fs.constants.W_OK);
      } catch {
        throw new HttpError(403, `${path.basename(file)} cannot be written: it is read-only.`);
      }
      await trashCopy(file);
      await writeFile(file, data, {});
      return { path: file, replaced: true, ...base };
    }
    const dir = st?.isDirectory() ? file : path.dirname(file);
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new HttpError(404, `No such folder: ${dir}`);
    const stem = st?.isDirectory() ? 'picture' : path.basename(file, path.extname(file));
    const dest = freeName(dir, `${stem} (edited).${extOf(fmt)}`);
    await writeFile(dest, data, { create: true });
    return { path: dest, replaced: false, ...base };
  }
  const id = typeof to.media === 'string' && to.media ? to.media : null;
  if (as === 'replace') {
    if (!id) throw new HttpError(400, 'to.media: the Library picture to write over');
    const item = await replaceInLibrary(d, id, data, fmt);
    return { media: item.id, replaced: true, item, ...base };
  }
  const from = id ? mustMedia(d.db, id) : null;
  const item = await copyToLibrary(d, data, fmt, from, typeof to.title === 'string' ? to.title : '');
  return { media: item.id, replaced: false, item, ...base };
}

// ---- edit_image --------------------------------------------------------------------------------------------------

const XY = { x: { type: 'number' }, y: { type: 'number' } };
const BOX = { type: 'object', properties: { ...XY, w: { type: 'number' }, h: { type: 'number' } }, required: ['x', 'y', 'w', 'h'] };

const flipOf = (v: unknown) => (v === 'horizontal' || v === 'h' || v === 'mirror' ? { flipH: true } : v === 'vertical' || v === 'v' ? { flipV: true } : v === 'both' ? { flipH: true, flipV: true } : {});
const quarterOf = (v: unknown): Quarter => {
  const n = num(v) ?? 0;
  const q = (((Math.round(n / 90) * 90) % 360) + 360) % 360;
  return q as Quarter;
};
const boxOf = (v: unknown, what: string): Box => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const [x, y, w, h] = [num(o.x), num(o.y), num(o.w ?? o.width), num(o.h ?? o.height)];
  if (x === undefined || y === undefined || w === undefined || h === undefined) throw new Error(`${what}: x, y, w and h, in the picture’s pixels.`);
  return { x, y, w, h };
};
const list = (v: unknown, what: string, max: number): Record<string, unknown>[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`${what}: a list.`);
  if (v.length > max) throw new Error(`${what}: at most ${max}.`);
  return v.map((x) => (x && typeof x === 'object' ? x : {})) as Record<string, unknown>[];
};

/** What the agent asked, as words for the first line of its answer. */
function saying(a: Record<string, any>, r: ImageRecipe, n: { words: number; arrows: number; boxes: number; hidden: number }): string {
  const s: string[] = [];
  if (r.crop) s.push('cropped');
  if (r.rotate) s.push(`turned ${r.rotate}°`);
  if (r.flipH && r.flipV) s.push('flipped both ways');
  else if (r.flipH) s.push('flipped left to right');
  else if (r.flipV) s.push('flipped upside down');
  for (const [k, v] of Object.entries(r.adjust ?? {})) s.push(`${k} ${v > 0 ? '+' : ''}${v}`);
  if (r.filter) s.push(`the ${FILTERS.find((f) => f.id === r.filter!.id)?.label ?? r.filter.id} filter${r.filter.strength !== undefined ? ` at ${r.filter.strength}%` : ''}`);
  if (n.hidden) s.push(`${n.hidden} area${n.hidden === 1 ? '' : 's'} hidden`);
  if (n.boxes) s.push(`${n.boxes} box${n.boxes === 1 ? '' : 'es'}`);
  if (n.arrows) s.push(`${n.arrows} arrow${n.arrows === 1 ? '' : 's'}`);
  if (n.words) s.push(`${n.words} line${n.words === 1 ? '' : 's'} of words`);
  if (r.resize) s.push(`made ${r.resize.w} × ${r.resize.h}`);
  if (a.format) s.push(`as ${LABEL[r.format ?? 'png']}`);
  return s.length ? s.join(', ') : 'saved again';
}

export function editImageTool(d: Deps): RunTool {
  return {
    name: 'edit_image',
    annotations: { readOnlyHint: false, openWorldHint: false },
    description: [
      'Quick edits to a picture, for slides, documents and pages or for the user: crop, turn, flip, resize, adjust (brightness, contrast, saturation, warmth, exposure, sharpness, blur…), a filter, words, arrows and boxes drawn on it, and areas blurred or pixelated to hide faces, names or numbers.',
      'It runs on this computer (ffmpeg, or the picture tools’ Python), costs nothing and takes a second or two; the picture is never sent anywhere.',
      'It gives back a new file in the session’s images/ folder (the original stays as it was), shown to the user with your reply.',
      'Every coordinate (crop, words, arrows, boxes, areas) is in the picture’s own pixels as it was given, before cropping or turning: open the picture first to see where things are.',
      'For changes only AI can make (take something out, change what is in it, a new background) use erase_from_image, remove_background or generate_image; the user can edit any picture by hand in the app’s picture editor (Edit on a picture).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The picture: a file in the session’s folder (PNG, JPEG, WebP or GIF), or one in a deck, document or page as get_page shows it (naget-asset:…).' },
        library: { type: 'string', description: 'Instead of path: a picture of the user’s Library, by its id (app_api GET /api/media lists them).' },
        save_to_library: { type: 'string', enum: ['replace', 'copy'], description: 'With library: put the result in the Library over that picture (replace: its title, project and folder kept, as the editor’s Save does) or beside it as a new one (copy). Left out, only the file in your folder is made.' },
        crop: { ...BOX, description: 'The part to keep: its top left (x, y), width and height.' },
        rotate: { type: 'integer', enum: [90, 180, 270], description: 'Turn it clockwise by this many degrees.' },
        flip: { type: 'string', enum: ['horizontal', 'vertical', 'both'], description: 'Mirror it left to right (horizontal) or upside down (vertical).' },
        resize: {
          type: 'object',
          properties: { w: { type: 'integer', minimum: 1, maximum: LIMITS.side }, h: { type: 'integer', minimum: 1, maximum: LIMITS.side } },
          description: 'The size of the result, in pixels (give w or h alone to keep its shape).',
        },
        adjust: {
          type: 'object',
          description: 'Each from −100 to 100 (0 leaves it), sharpness and blur from 0 to 100.',
          properties: Object.fromEntries(['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'saturation', 'vibrance', 'warmth', 'tint', 'sharpness', 'blur', 'vignette'].map((k) => [k, { type: 'number' }])),
        },
        filter: { type: 'string', enum: FILTERS.map((f) => f.id), description: `A look: ${FILTERS.map((f) => `${f.id} (${f.label})`).join(', ')}.` },
        filter_strength: { type: 'number', minimum: 0, maximum: 100, description: 'How strong the filter is, 0 to 100 (default 100).' },
        text: {
          type: 'array',
          maxItems: 20,
          description: 'Words written on it. Place each by x, y (the top left of the words) or by place (in the result, after cropping: a caption at the bottom, a title at the top).',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              ...XY,
              place: { type: 'string', enum: [...PLACES] },
              size: { type: 'number', description: 'Letter height in pixels (default: a sixteenth of the picture’s longer side).' },
              color: { type: 'string', description: 'A colour: #rrggbb, or white, black, red… (default white).' },
              background: { type: 'string', description: 'A box behind the words, its colour (#rrggbbaa for see-through, as #000000b3); none for no box (default: a dark box).' },
            },
            required: ['text'],
          },
        },
        arrows: {
          type: 'array',
          maxItems: 30,
          description: 'Arrows from (x1, y1) to the point they show (x2, y2).',
          items: { type: 'object', properties: { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' }, color: { type: 'string' }, width: { type: 'number' } }, required: ['x1', 'y1', 'x2', 'y2'] },
        },
        boxes: {
          type: 'array',
          maxItems: 30,
          description: 'Rectangles (or ovals) drawn round things.',
          items: { type: 'object', properties: { ...BOX.properties, color: { type: 'string' }, width: { type: 'number' }, shape: { type: 'string', enum: ['rectangle', 'oval'] } }, required: ['x', 'y', 'w', 'h'] },
        },
        blur_areas: {
          type: 'array',
          maxItems: 50,
          description: 'Areas to hide (faces, number plates, names, numbers): blurred, or pixelated.',
          items: { type: 'object', properties: { ...BOX.properties, pixelate: { type: 'boolean' }, strength: { type: 'number', minimum: 20, maximum: 100 } }, required: ['x', 'y', 'w', 'h'] },
        },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'], description: 'The kind of file (default: the picture’s own; a GIF becomes a PNG).' },
        quality: { type: 'integer', minimum: 1, maximum: 100, description: 'JPEG and WebP: 1 to 100 (default 90).' },
        name: { type: 'string', description: 'A short file name for the result, without extension (default: the picture’s name and "-edited").' },
      },
    },
    async run(a, ctx: RunCtx) {
      // A Library picture by its id, or a file or a kept picture by its path.
      const libId = typeof a.library === 'string' && a.library.trim() ? a.library.trim() : '';
      const libItem = libId ? mustMedia(d.db, libId) : null;
      if (libItem && libItem.kind !== 'image') return { isError: true, text: `${libId} is not a picture of the Library (it is a ${libItem.kind}).` };
      if (!libItem && a.save_to_library) return { isError: true, text: 'save_to_library goes with library: the Library picture’s id.' };
      const pic = libItem ? { name: path.basename(libItem.file, path.extname(libItem.file)), data: fs.readFileSync(libItem.file) } : agentPicture(d.db, ctx, a.path);
      let src;
      try {
        src = await decode(pic.data);
      } catch (e) {
        return { isError: true, text: (e as Error).message };
      }
      const rotate = quarterOf(a.rotate);
      const { flipH, flipV } = flipOf(a.flip) as { flipH?: boolean; flipV?: boolean };
      const up = (x: number, y: number) => toUpright(x, y, src.w, src.h, rotate, flipH, flipV);
      const upBox = (b: Box) => boxToUpright(b, src.w, src.h, rotate, flipH, flipV);
      const r: ImageRecipe = { ...(rotate ? { rotate } : {}), ...(flipH ? { flipH } : {}), ...(flipV ? { flipV } : {}) };
      try {
        if (a.crop) r.crop = upBox(boxOf(a.crop, 'crop'));
        if (a.adjust && typeof a.adjust === 'object') r.adjust = a.adjust;
        if (a.filter) {
          if (!FILTERS.some((f) => f.id === a.filter)) throw new Error(`filter: one of ${FILTERS.map((f) => f.id).join(', ')}.`);
          r.filter = { id: a.filter, ...(num(a.filter_strength) !== undefined ? { strength: num(a.filter_strength) } : {}) };
        }
        const marks: Mark[] = [];
        for (const h of list(a.blur_areas, 'blur_areas', 50)) marks.push({ type: h.pixelate === true ? 'pixelate' : 'blur', ...upBox(boxOf(h, 'blur_areas')), ...(num(h.strength) !== undefined ? { strength: num(h.strength) } : {}) });
        const boxes = list(a.boxes, 'boxes', 30);
        for (const b of boxes) marks.push({ type: b.shape === 'oval' ? 'ellipse' : 'rect', ...upBox(boxOf(b, 'boxes')), color: String(b.color ?? '#ef4444'), width: num(b.width) ?? 0 });
        const arrows = list(a.arrows, 'arrows', 30);
        for (const w of arrows) {
          const [x1, y1, x2, y2] = [num(w.x1), num(w.y1), num(w.x2), num(w.y2)];
          if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) throw new Error('arrows: x1, y1, x2 and y2 for each, in the picture’s pixels.');
          const [ux1, uy1] = up(x1, y1);
          const [ux2, uy2] = up(x2, y2);
          marks.push({ type: 'arrow', x1: ux1, y1: uy1, x2: ux2, y2: uy2, color: String(w.color ?? '#ef4444'), width: num(w.width) ?? 0 });
        }
        // Widths left out are worked out from the picture's size, as the editor's are.
        for (const m of marks) if ('width' in m && !m.width) delete (m as { width?: number }).width;
        r.marks = marks;
        r.format = fmtOf(a.format) ?? undefined;
        if (num(a.quality) !== undefined) r.quality = num(a.quality);
        if (a.resize && typeof a.resize === 'object') r.resize = { w: num(a.resize.w) ?? 0, h: num(a.resize.h) ?? 0 } as { w: number; h: number };
      } catch (e) {
        return { isError: true, text: (e as Error).message };
      }
      // Words: placed by x, y in the picture as given, or by place in the result.
      const texts = list(a.text, 'text', 20).filter((t) => typeof t.text === 'string' && t.text.trim());
      let recipe: ImageRecipe;
      try {
        recipe = normalizeRecipe(r, src.w, src.h);
      } catch (e) {
        return { isError: true, text: (e as Error).message };
      }
      const out = render(src, recipe);
      const W = out.p.w;
      const H = out.p.h;
      const long = Math.max(W, H);
      const words: Words[] = texts.map((t) => {
        const sizePx = Math.max(6, Math.min(1200, num(t.size) ?? Math.round(long / 16)));
        const bg = t.background === 'none' ? undefined : colorOf(t.background, '#000000b3');
        const at = { x: recipe.crop?.x ?? 0, y: recipe.crop?.y ?? 0 };
        const given = num(t.x) !== undefined && num(t.y) !== undefined;
        // Placed in the result (a caption at the bottom), unless a point of the picture is given.
        const place: Place | undefined = typeof t.place === 'string' && (PLACES as readonly string[]).includes(t.place) ? (t.place as Place) : given ? undefined : 'bottom';
        const [ux, uy] = given && !place ? up(num(t.x)!, num(t.y)!) : [at.x, at.y];
        return { text: String(t.text).slice(0, LIMITS.text), x: ux - at.x, y: uy - at.y, size: sizePx, color: colorOf(t.color, '#ffffff'), ...(bg ? { bg } : {}), ...(place ? { place } : {}) };
      });
      const format = recipe.format ?? formatOfData(pic.data) ?? 'png';
      let made;
      try {
        made = await encode(out.p, { format, quality: recipe.quality, words, resize: recipe.resize });
      } catch (e) {
        return { isError: true, text: e instanceof EditError ? e.message : `The picture could not be made: ${(e as Error).message}` };
      }
      const name = (typeof a.name === 'string' && a.name.trim()) || `${pic.name}-edited`;
      const f = await saveForAgent(ctx, made.data, name);
      const what = saying(a, recipe, {
        words: words.length,
        arrows: (recipe.marks ?? []).filter((m) => m.type === 'arrow').length,
        boxes: (recipe.marks ?? []).filter((m) => m.type === 'rect' || m.type === 'ellipse').length,
        hidden: (recipe.marks ?? []).filter((m) => m.type === 'blur' || m.type === 'pixelate').length,
      });
      // Put in the Library as the editor's Save or Save a copy does.
      let kept = '';
      if (libItem && (a.save_to_library === 'replace' || a.save_to_library === 'copy')) {
        const fmt = formatOfData(made.data);
        if (!fmt) return { isError: true, text: 'The edited picture is not a PNG, JPEG or WebP: it was not put in the Library.' };
        const item = a.save_to_library === 'replace' ? await replaceInLibrary(d, libItem.id, made.data, fmt) : await copyToLibrary(d, made.data, fmt, libItem, '');
        kept = a.save_to_library === 'replace' ? `It is in the Library in place of “${libItem.title}” (${item.id}).` : `It is in the Library as a new picture beside “${libItem.title}” (${item.id}).`;
      }
      return [`Edited the picture (${src.w}×${src.h}): ${what}:`, ...savedLines(f, ...out.notes, inPlace(pic.kept)), ...(kept ? [kept] : [])].join('\n');
    },
  };
}

export const mediaEdit: Feature = {
  id: 'mediaedit',
  routes(d) {
    d.app.post('/api/mediaedit/image', { bodyLimit: Math.ceil(MAX_PICTURE * 1.37) + 65536 }, async (req) => {
      try {
        return await saveEdited(d, (req.body ?? {}) as Record<string, unknown>);
      } catch (e) {
        if (e instanceof EditError) throw new HttpError(422, e.message);
        throw e;
      }
    });
  },
  tools: ({ deps }) => [editImageTool(deps)],
};
