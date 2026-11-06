// Free photos for slides, documents and pages (Canva's photos, Google Slides' image search): openly licensed pictures
// found through Openverse (Wikimedia Commons when it cannot answer: search.ts), kept with what shows them, each with
// its credit. The editors' Insert → Picture → Free photos searches here, shows the small pictures through this server
// (the app's pages load no picture from the web) and keeps the one picked; agents get find_photos, which saves photos
// into the session's folder with their credits.
//
// Routes, signed in:
//   GET /api/photos/search?q=&orientation=any|wide|tall|square&page=&from=openverse|wikimedia → PhotoSearch
//   GET /api/photos/thumb/:id → a photo's small picture (one this server found)
//   POST /api/photos/use { id } → PhotoUse: the photo kept ("naget-asset:<sha>"), its size and its credit
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { PHOTO_ORIENTATIONS, photoCredit, type PhotoOrientation, type PhotoSearch, type PhotoUse } from '../../shared/photos.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Feature, RunTool } from '../features/types.ts';
import { ASSET } from '../../shared/slides.ts';
import { MAX_ASSET, pictureType, putAsset } from '../pages/assets.ts';
import { imageSize } from '../pages/ooxml.ts';
import { photoById, pictureOf, searchPhotos, shown, thumbOf, type Found } from './search.ts';

const Q = (req: { query: unknown }) => (req.query ?? {}) as Record<string, string | undefined>;

const orientationOf = (v: unknown): PhotoOrientation => (PHOTO_ORIENTATIONS.includes(v as PhotoOrientation) ? (v as PhotoOrientation) : 'any');

/** A photo found kept as the app keeps pictures: its source, its size. */
async function keepPhoto(db: DB, p: Found, signal?: AbortSignal): Promise<{ src: string; w: number; h: number }> {
  const data = await pictureOf(p, MAX_ASSET, signal);
  if (!data) throw new HttpError(502, `The photo could not be fetched from ${p.from}: try another one, or again in a minute.`);
  const sz = imageSize(data);
  return { src: ASSET + putAsset(db, data), w: sz?.w ?? p.w ?? 1200, h: sz?.h ?? p.h ?? 800 };
}

function photoRoutes(app: FastifyInstance, db: DB) {
  app.get('/api/photos/search', async (req) => {
    const q = Q(req);
    const words = String(q.q ?? '').trim();
    if (!words) throw new HttpError(400, 'Say what the photos are of (q)');
    if (words.length > 200) throw new HttpError(400, 'Fewer words: at most 200 letters');
    const page = Number(q.page ?? 1);
    try {
      const r = await searchPhotos(words, { orientation: orientationOf(q.orientation), page: Number.isFinite(page) ? page : 1, from: q.from === 'wikimedia' ? 'wikimedia' : q.from === 'openverse' ? 'openverse' : undefined });
      const { found: _f, ...answer } = r;
      return answer satisfies PhotoSearch;
    } catch (e) {
      throw new HttpError(502, (e as Error).message);
    }
  });
  app.get('/api/photos/thumb/:id', async (req, reply) => {
    const p = await photoById(String((req.params as { id?: string }).id ?? ''));
    if (!p) return reply.code(404).send({ error: 'No such photo: search again' });
    const data = await thumbOf(p);
    const mime = data ? pictureType(data) : null;
    if (!data || !mime) return reply.code(404).send({ error: 'Its picture could not be fetched' });
    return reply.header('Cache-Control', 'private, max-age=86400').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox").type(mime).send(data);
  });
  app.post('/api/photos/use', async (req) => {
    const id = String(((req.body ?? {}) as { id?: unknown }).id ?? '');
    const p = await photoById(id);
    if (!p) throw new HttpError(404, 'That photo is not one a search found: search again');
    const kept = await keepPhoto(db, p);
    const photo = shown(p);
    return { src: kept.src, w: kept.w, h: kept.h, photo, credit: photoCredit(photo) } satisfies PhotoUse;
  });
}

// ---- find_photos --------------------------------------------------------------------------------------------------

/** A short file name from words: lower case, dashes, at most 40 letters. */
const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)
    .replace(/-+$/, '') || 'photo';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

const FIND_PHOTOS: RunTool = {
  name: 'find_photos',
  annotations: { readOnlyHint: false, openWorldHint: true },
  description: [
    'Find free photos for words (openly licensed, free to use and to change, commercial use too: Openverse’s catalogue of Flickr, Wikimedia Commons, museums and more; Wikimedia Commons’ own search when Openverse cannot answer) and save them into this session’s images/ folder, each with its credit (title, author, licence, link), for a slide, a document or a page.',
    'Use it for real photographs of real things (places, people at work, nature, objects, food, cities) when the user wants photos rather than pictures made with AI, or when a deck, a document or a page needs some; describe what should be in them in a few plain words ("mountain lake at dawn", "team meeting in an office"). orientation keeps to wide, tall or square ones.',
    'Free, and quick (a few seconds); it saves count photos (4 unless said, at most 10), the first the search ranks best, and images/<name>-credits.md with every photo’s credit. Look at them (read the files) before you use one: a search is by the words people gave them, so some may not fit.',
    'Credit them as their licence asks: put the credit line in the slide’s notes (or under the picture in a document or a page), and for licences other than CC0 and public domain a small caption by the photo (a text part, size 14, colour muted: "Photo: “Title” by Author, CC BY 2.0").',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What the photos are of, in a few words.' },
      count: { type: 'integer', minimum: 1, maximum: 10, description: 'How many to save (4 unless said).' },
      orientation: { type: 'string', enum: ['any', 'wide', 'tall', 'square'], description: 'Their shape: wide for a slide’s background, tall for a phone or beside words.' },
      name: { type: 'string', description: 'A short name for the files, without extension (default: from the words).' },
    },
    required: ['query'],
  },
  async run(a, ctx) {
    const query = typeof a.query === 'string' ? a.query.trim().slice(0, 200) : '';
    if (!query) throw new Error('Say what the photos are of in query.');
    const count = Math.max(1, Math.min(10, Math.round(Number(a.count) || 4)));
    const r = await searchPhotos(query, { orientation: orientationOf(a.orientation), signal: ctx.signal });
    if (!r.found.length) return `No free photos of “${query}”${r.from === 'wikimedia' ? ' (Openverse could not answer; Wikimedia Commons found none)' : ''}: try other words, fewer of them, or make a picture with generate_image.`;
    // The larger ones first, of those the search ranks highest: a slide wants about 1200 pixels across.
    const pool = r.found.slice(0, Math.max(count * 2, 8));
    const ranked = [...pool].sort((x, y) => Number((y.w ?? 0) >= 900) - Number((x.w ?? 0) >= 900));
    const dir = path.join(ctx.cwd, 'images');
    await fs.promises.mkdir(dir, { recursive: true });
    const base = slug(typeof a.name === 'string' && a.name.trim() ? a.name : query);
    const saved: { file: string; credit: string; w: number; h: number; asks: boolean }[] = [];
    const left: string[] = [];
    for (const p of ranked) {
      if (saved.length >= count) break;
      const data = await pictureOf(p, MAX_ASSET, ctx.signal).catch(() => null);
      const mime = data ? pictureType(data) : null;
      if (!data || !mime) {
        left.push(p.page);
        continue;
      }
      let n = saved.length + 1;
      let file = path.join(dir, `${base}-${n}.${EXT[mime] ?? 'jpg'}`);
      while (fs.existsSync(file)) file = path.join(dir, `${base}-${++n}.${EXT[mime] ?? 'jpg'}`);
      await fs.promises.writeFile(file, data);
      const sz = imageSize(data);
      saved.push({ file, credit: photoCredit(shown(p)), w: sz?.w ?? p.w ?? 0, h: sz?.h ?? p.h ?? 0, asks: p.attribution });
    }
    if (!saved.length) return `Found photos of “${query}”, but none could be fetched from where they are kept: try again in a minute, or other words.`;
    let credits = path.join(dir, `${base}-credits.md`);
    for (let n = 2; fs.existsSync(credits); n++) credits = path.join(dir, `${base}-credits-${n}.md`);
    await fs.promises.writeFile(credits, [`# Credits: ${query}`, '', ...saved.map((s) => `- ${path.basename(s.file)}: ${s.credit}`), ''].join('\n'));
    return [
      `Saved ${saved.length} free photo${saved.length === 1 ? '' : 's'} of “${query}” (from ${r.from === 'openverse' ? 'Openverse' : 'Wikimedia Commons'}):`,
      ...saved.map((s) => `- ${s.file} (${s.w}×${s.h})${s.asks ? '' : ' (no credit needed)'}: ${s.credit}`),
      `Their credits: ${credits}.`,
      `Use one by its path: in save_slides an image part’s src ({"type": "image", "src": "${saved[0].file}"}), its credit in that slide’s notes and, where its licence asks for credit, a caption by it; in save_doc ![what it shows](${saved[0].file}) with the credit under it; in save_page an img’s src.`,
      ...(left.length ? [`${left.length} more could not be fetched and were left out.`] : []),
    ].join('\n');
  },
};

export const photos: Feature = {
  id: 'photos',
  routes({ app, db }) {
    photoRoutes(app, db);
  },
  tools: () => [FIND_PHOTOS],
};
