// Highlights and notes on PDFs: Files' reader (web/src/features/files/read) shows a PDF's pages with their words laid
// over them to select, and keeps the highlights made on them (words, or an area around a figure or an equation), each
// with a colour and a note, beside the file by its path (store.ts), found again by their words when the file changes
// (layer.ts). They can go into a project's knowledge as one document that follows every change (keep.ts), and into the
// PDF itself as its own annotations (annots.ts). Agents read them with pdf_notes.
//
// Routes:
//   GET  /api/pdf-notes?path=                      the highlights and notes, and where they are kept
//   POST /api/pdf-notes { path, put?, remove? }    highlights added or changed, and taken away
//   GET  /api/pdf-notes/text?path=&page=           a page's words with where they are, for the reader
//   GET  /api/pdf-notes/page?path=&page=&width=    a page's picture (without the highlights saved into the file)
//   GET  /api/pdf-notes/area?path=&page=&x=&y=&w=&h=&width=   a picture of a part of a page
//   POST /api/pdf-notes/keep { path, space }       keep them in a project's knowledge (space null: no longer)
//   POST /api/pdf-notes/save { path, replace? }    save them into the PDF (a copy beside it, or over it)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { joinLines, MAX_HIGHLIGHTS, type PdfHighlight, type PdfNotesView } from '../../shared/pdfnotes.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { extractPages, PdfError } from '../documents/pdf/index.ts';
import { renderPage } from '../documents/pdf/render.ts';
import type { Deps, Feature, RunTool, ToolOutput } from '../features/types.ts';
import { freeName, resolvePath, trashCopy, writeFile } from '../files.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { spaceById } from '../spaces/index.ts';
import { cutTo, forReader, writeHighlights } from './annots.ts';
import { dropDocument, keepIn, rewrite } from './keep.ts';
import { areaOrder, findRuns, loadPdf, type Loaded, shownRuns, titleOf, wordsIn } from './layer.ts';
import { anyGone, anyNotes, cleanHighlight, isColor, movePdfNotes, orphanFor, ordered, readNotes, type Stored, writeNotes } from './store.ts';

/** A PDF read, its errors as replies the page shows. */
function load(abs: string): Loaded {
  try {
    return loadPdf(abs);
  } catch (e) {
    const status = (e as { status?: number }).status;
    throw new HttpError(status ?? 422, (e as Error).message);
  }
}

/**
 * Highlights found again on the file as it is now, by their words: near where they were, else on the pages nearest
 * theirs. An area with words in it moves as they did; one without stays where it was. What is not found stays too,
 * marked lost.
 */
function placeAgain(l: Loaded, hs: PdfHighlight[]): PdfHighlight[] {
  const n = l.pages.length;
  return hs.map((h) => {
    const words = (h.kind === 'area' ? h.anchor?.t : h.text)?.trim();
    if (!words) return h.page > n ? { ...h, lost: true as const } : h;
    const was = h.kind === 'area' ? h.anchor! : h.rects[0];
    const order: number[] = [];
    for (let d = 0; d <= 25; d++) for (const p of d ? [h.page - d, h.page + d] : [h.page]) if (p >= 1 && p <= n) order.push(p);
    for (const p of order) {
      const found = findRuns(l.runs(p), words, p === h.page && was ? { x: was.x, y: was.y } : undefined);
      if (!found.length) continue;
      const { lost: _was, ...rest } = h;
      if (h.kind === 'text') return { ...rest, page: p, rects: found[0].rects, o: found[0].o };
      // The area moves as its words did.
      const at = found[0].rects[0];
      const box = h.rects[0];
      const moved = { x: box.x + at.x - was.x, y: box.y + at.y - was.y, w: box.w, h: box.h };
      return { ...rest, page: p, rects: [moved], anchor: { ...at, t: h.anchor!.t }, o: areaOrder(l.runs(p), moved) };
    }
    return { ...h, lost: true as const };
  });
}

/**
 * A file's notes as they stand: placed again when the file changed since (by its contents), and, for a file with none,
 * the notes it left behind where it was before something other than Files moved it.
 */
function current(db: DB, abs: string): { s: Stored; l: Loaded | null } {
  const st = fs.statSync(abs, { throwIfNoEntry: false });
  if (!st?.isFile()) throw new HttpError(404, 'Not found');
  let s = readNotes(db, abs);
  let l: Loaded | null = null;
  if (!s.highlights.length && !s.kept) {
    if (!anyGone(db)) return { s, l };
    l = load(abs);
    const from = orphanFor(db, l.hash());
    if (!from) return { s, l };
    movePdfNotes(db, from, abs);
    s = readNotes(db, abs);
  }
  const mtime = Math.floor(st.mtimeMs);
  if (s.fp && s.fp.size === st.size && s.fp.mtime === mtime) return { s, l };
  l ??= load(abs);
  const hash = l.hash();
  if (s.fp && s.fp.hash !== hash) s = { ...s, highlights: placeAgain(l, s.highlights) };
  s = { ...s, fp: { size: l.size, mtime: l.mtime, hash } };
  writeNotes(db, abs, s);
  return { s, l };
}

function view(db: DB, abs: string, s: Stored): PdfNotesView {
  return { path: abs, highlights: ordered(s.highlights), ...(s.kept ? { kept: { ...s.kept, spaceName: spaceById(db, s.kept.space)?.name } } : {}) };
}

/** The paper's title: its file's Title, else the largest words at the top of its first page, else its name. */
const paperTitle = (l: Loaded) => titleOf(l, l.infoTitle(), path.basename(l.file));

/** A highlight sent (by the reader, or an agent with only its words and page): checked, and placed where it is missing. */
function incoming(l: Loaded, v: unknown, have: PdfHighlight | undefined, i: number): PdfHighlight {
  if (!v || typeof v !== 'object') throw new HttpError(400, `put[${i}] is not a highlight`);
  const o = { ...(have ?? {}), ...(v as Record<string, unknown>) } as Record<string, unknown>;
  if (o.color !== undefined && !isColor(o.color)) throw new HttpError(400, `put[${i}].color is yellow, green, blue or pink`);
  if (typeof o.id !== 'string' || !o.id) o.id = crypto.randomBytes(6).toString('hex');
  if (o.kind === undefined) o.kind = Array.isArray(o.rects) && o.rects.length === 1 && !o.text ? 'area' : 'text';
  const page = Math.round(Number(o.page));
  if (!(page >= 1 && page <= l.pages.length)) throw new HttpError(400, `put[${i}].page: the file has ${l.pages.length} page${l.pages.length === 1 ? '' : 's'}`);
  o.page = page;
  const sent = v as Record<string, unknown>;
  // Words moved to another page without their boxes: found there by their words.
  if (have && page !== have.page && sent.rects === undefined) o.rects = [];
  if (!have || sent.rects !== undefined || sent.text !== undefined || page !== have.page) {
    const rects = Array.isArray(o.rects) ? o.rects : [];
    if (!rects.length) {
      // Words only: found on their page.
      if (o.kind !== 'text' || typeof o.text !== 'string' || !o.text.trim()) throw new HttpError(400, `put[${i}] needs its rects, or (words) its text and page`);
      const found = findRuns(l.runs(page), o.text);
      if (!found.length) {
        const elsewhere = l.pages.map((_, k) => k + 1).filter((p) => p !== page && findRuns(l.runs(p), String(o.text)).length);
        throw new HttpError(400, `“${String(o.text).slice(0, 80)}” is not on page ${page}${elsewhere.length ? `; it is on page ${elsewhere.slice(0, 6).join(', ')}` : ' (nor elsewhere in the file: a scanned page has no words to find)'}`);
      }
      Object.assign(o, { rects: found[0].rects, text: found[0].text, o: found[0].o });
    } else if (o.kind === 'area') {
      // The words inside it, and where they are (it follows them when the file changes), as the page has them.
      const h = cleanHighlight(o);
      if (h) {
        const w = wordsIn(l.runs(page), h.rects[0]);
        o.text = w.text;
        o.anchor = w.anchor;
        o.o = areaOrder(l.runs(page), h.rects[0]);
      }
    } else {
      // Boxes over words without the words themselves: the words read from under them, so they can be found again.
      const h = cleanHighlight(o);
      if (h && (typeof o.text !== 'string' || !o.text.trim())) o.text = joinLines(h.rects.map((r) => wordsIn(l.runs(page), r).text));
      if (h && typeof o.o !== 'number') o.o = areaOrder(l.runs(page), h.rects[0]);
    }
  }
  if (have && (o.note !== have.note || o.color !== have.color)) o.edited = Date.now();
  if (!have) o.at = Date.now();
  const h = cleanHighlight(o);
  if (!h) throw new HttpError(400, `put[${i}] is not a highlight: it needs a page, a kind (text or area) and where it is (rects in points from the page’s top-left)`);
  return h;
}

/** Where kept notes are written again after a change: a moment later, once for a burst of changes. */
const later = new Map<string, NodeJS.Timeout>();

/** The notes changed: their document in a project's knowledge follows, a moment later. */
export function updateKeptSoon(db: DB, abs: string, ms = 1500) {
  clearTimeout(later.get(abs));
  later.set(
    abs,
    setTimeout(() => {
      later.delete(abs);
      try {
        updateKept(db, abs);
      } catch (e) {
        console.warn(`[pdfnotes] ${abs}: ${(e as Error).message}`);
      }
    }, ms),
  );
  later.get(abs)!.unref?.();
}

export function updateKept(db: DB, abs: string) {
  const s = readNotes(db, abs);
  if (!s.kept || !fs.existsSync(abs)) return;
  const l = load(abs);
  const kept = rewrite(db, s.kept, paperTitle(l), abs, s.highlights);
  if (!kept) {
    const { kept: _gone, ...rest } = s;
    writeNotes(db, abs, rest);
  } else if (kept !== s.kept) writeNotes(db, abs, { ...s, kept });
}

/** Files moved PDFs (or their folder): their notes went with them, and their documents in projects say where they are now. */
export function movedPdfNotes(db: DB, from: string, to: string) {
  for (const p of movePdfNotes(db, from, to)) if (readNotes(db, p).kept) updateKeptSoon(db, p, 300);
}

const intOf = (v: unknown, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : d;
};

function routes(d: Deps) {
  const { app, db } = d;
  const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
  const query = (req: { query: unknown }) => (req.query ?? {}) as Record<string, string>;
  const pageOf = (l: Loaded, v: unknown) => {
    const n = intOf(v, 1);
    if (n < 1 || n > l.pages.length) throw new HttpError(400, `There is no page ${n}: the file has ${l.pages.length} page${l.pages.length === 1 ? '' : 's'}.`);
    return n;
  };
  const changed = (abs: string, from: unknown) => d.broadcast({ t: 'feature', id: 'pdfnotes', data: { path: abs, ...(typeof from === 'string' ? { from } : {}) } });

  app.get('/api/pdf-notes', async (req) => {
    const abs = resolvePath(query(req).path);
    return view(db, abs, current(db, abs).s);
  });

  app.post('/api/pdf-notes', async (req) => {
    const b = body(req);
    const abs = resolvePath(String(b.path ?? ''));
    const { s, l: was } = current(db, abs);
    const l = was ?? load(abs);
    const remove = new Set((Array.isArray(b.remove) ? b.remove : []).map(String));
    let hs = s.highlights.filter((h) => !remove.has(h.id));
    (Array.isArray(b.put) ? b.put : []).slice(0, 500).forEach((v, i) => {
      const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : undefined;
      const have = typeof id === 'string' ? hs.find((h) => h.id === id) : undefined;
      const h = incoming(l, v, have, i);
      hs = have ? hs.map((x) => (x.id === h.id ? h : x)) : [...hs, h];
    });
    if (hs.length > MAX_HIGHLIGHTS) throw new HttpError(400, `A PDF keeps at most ${MAX_HIGHLIGHTS} highlights.`);
    const next: Stored = { ...s, highlights: hs, fp: { size: l.size, mtime: l.mtime, hash: l.hash() } };
    writeNotes(db, abs, next);
    changed(abs, b.from);
    if (next.kept) updateKeptSoon(db, abs);
    return view(db, abs, next);
  });

  app.get('/api/pdf-notes/text', async (req) => {
    const q = query(req);
    const l = load(resolvePath(q.path));
    const page = pageOf(l, q.page);
    const p = l.pages[page - 1];
    return { page, width: p.width, height: p.height, runs: shownRuns(l.runs(page)) };
  });

  /** A picture: the same file (by its time) and request always look the same. */
  const picture = async (reply: { header(k: string, v: string): unknown; send(b: Buffer): unknown }, etag: string, src: Buffer, page: number, width: number) => {
    let png: Buffer;
    try {
      png = await renderPage(src, page, { width }, () => extractPages(src, [page]).data);
    } catch (e) {
      throw new HttpError(e instanceof PdfError ? 422 : 503, (e as Error).message);
    }
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'private, max-age=3600');
    reply.header('ETag', `"${etag}"`);
    return reply.send(png);
  };

  app.get('/api/pdf-notes/page', async (req, reply) => {
    const q = query(req);
    const abs = resolvePath(q.path);
    const l = load(abs);
    const page = pageOf(l, q.page);
    const width = Math.max(200, Math.min(3200, intOf(q.width, 1200)));
    // Highlights saved into the file show once: as the reader draws them, while the app keeps them here.
    const src = forReader(l.data, l.pages[page - 1], readNotes(db, abs).highlights.length > 0);
    return picture(reply, `${l.mtime}-${page}-${width}-${src === l.data ? 1 : 0}`, src, page, width);
  });

  app.get('/api/pdf-notes/area', async (req, reply) => {
    const q = query(req);
    const abs = resolvePath(q.path);
    const l = load(abs);
    const page = pageOf(l, q.page);
    const box = { x: Number(q.x), y: Number(q.y), w: Number(q.w), h: Number(q.h) };
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w < 2 || box.h < 2) throw new HttpError(400, 'Give the part of the page: x, y, w and h, in points from its top-left.');
    const width = Math.max(64, Math.min(2400, intOf(q.width, 900)));
    let src: Buffer;
    try {
      src = cutTo(l.data, page, box, readNotes(db, abs).highlights.length > 0);
    } catch (e) {
      throw new HttpError(422, (e as Error).message);
    }
    return picture(reply, `${l.mtime}-${page}-${[box.x, box.y, box.w, box.h].map((n) => Math.round(n)).join('_')}-${width}`, src, page, width);
  });

  app.post('/api/pdf-notes/keep', async (req) => {
    const b = body(req);
    const abs = resolvePath(String(b.path ?? ''));
    const { s, l: was } = current(db, abs);
    if (b.space === null || b.space === '' || b.space === undefined) {
      if (s.kept) dropDocument(db, s.kept);
      const { kept: _gone, ...rest } = s;
      writeNotes(db, abs, rest);
      changed(abs, b.from);
      return view(db, abs, rest);
    }
    if (typeof b.space !== 'string') throw new HttpError(400, 'space: the project to keep them in (null: no longer)');
    const l = was ?? load(abs);
    const r = keepIn(db, b.space, s.kept, paperTitle(l), abs, s.highlights);
    const next: Stored = { ...s, kept: r.kept, fp: s.fp ?? { size: l.size, mtime: l.mtime, hash: l.hash() } };
    writeNotes(db, abs, next);
    changed(abs, b.from);
    d.broadcast({ t: 'feature', id: 'knowledge', data: { changed: true } });
    if (r.made) d.broadcast({ t: 'feature', id: 'spaces', data: { changed: true } });
    return view(db, abs, next);
  });

  app.post('/api/pdf-notes/save', async (req) => {
    const b = body(req);
    const abs = resolvePath(String(b.path ?? ''));
    const { s, l: was } = current(db, abs);
    if (!s.highlights.length) throw new HttpError(400, 'There are no highlights to save into it.');
    const l = was ?? load(abs);
    let out: ReturnType<typeof writeHighlights>;
    try {
      out = writeHighlights(l.data, ordered(s.highlights), author());
    } catch (e) {
      throw new HttpError(e instanceof PdfError ? 422 : 500, (e as Error).message);
    }
    if (b.replace === true) {
      const trashed = await trashCopy(abs);
      await writeFile(abs, out.data, {});
      // The words stay where they were: the highlights are placed on the file as it is now (as they are now, a change
      // made while it was written included).
      const nl = load(abs);
      writeNotes(db, abs, { ...readNotes(db, abs), fp: { size: nl.size, mtime: nl.mtime, hash: nl.hash() } });
      return { path: abs, replaced: true, trashed, count: out.count, notes: out.notes };
    }
    const dest = freeName(path.dirname(abs), `${path.basename(abs, path.extname(abs))} (highlighted).pdf`);
    await writeFile(dest, out.data, { create: true });
    // The copy keeps the notes too, so it opens in the reader with them (and its saved ones drawn once).
    const cl = load(dest);
    writeNotes(db, dest, { highlights: readNotes(db, abs).highlights, fp: { size: cl.size, mtime: cl.mtime, hash: cl.hash() } });
    return { path: dest, replaced: false, count: out.count, notes: out.notes };
  });
}

/** Who the annotations say wrote them: the computer's user, as Acrobat does. */
function author(): string {
  try {
    return os.userInfo().username || 'Hydor';
  } catch {
    return 'Hydor';
  }
}

// ---- agents ----------------------------------------------------------------------------------------------

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A path an agent gave: from the session's folder, absolute, or from home (~). */
function fromSession(cwd: string, p: string): string {
  const s = p.trim();
  if (s === '~' || s.startsWith('~/')) return path.join(os.homedir(), s.slice(1));
  return path.resolve(cwd || config.defaultCwd, s);
}

const NOTES_TOOL: RunTool = {
  name: 'pdf_notes',
  annotations: { readOnlyHint: true },
  description: [
    'The highlights and notes the user made on a PDF in the app (Files → a PDF → Highlight), page by page: the words each highlight covers, or, for an area they dragged around',
    'a figure or an equation, a picture of that part and any words in it; its colour, and the note they wrote on it. Use it when they speak of their highlights, notes or annotations on a paper:',
    'to sum them up, answer from them, or check them against the paper (read_document reads the whole PDF, pdf_look shows its pages). Without path: the PDF they asked about from Files.',
    'The notes are theirs: quote them as they wrote them. To highlight words for them when they ask, app_api POST /api/pdf-notes { path, put: [{ page, text, color?, note? }] } finds the words on that page (the API guide says more).',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The PDF: in the session’s folder (relative paths start there) or absolute. Default: the PDF open in Files that the user asked from.' },
      pictures: { type: 'boolean', description: 'Pictures of the areas they picked (figures, equations), up to 6 (default true).' },
    },
  },
  async run(a, ctx): Promise<ToolOutput> {
    const db = ctx.deps.db;
    let file = typeof a.path === 'string' && a.path.trim() ? fromSession(ctx.cwd, a.path) : '';
    if (!file) {
      const asked = sessionExtra(db, ctx.key).file;
      if (typeof asked === 'string' && /\.pdf$/i.test(asked)) file = asked;
      else throw new Error('path: the PDF whose highlights to list (in the session’s folder, or absolute).');
    }
    if (!fs.existsSync(file)) throw new Error(`No such file: ${file}`);
    let s: Stored;
    let l: Loaded;
    try {
      s = current(db, file).s;
      l = loadPdf(file);
    } catch (e) {
      throw new Error((e as Error).message);
    }
    const name = path.basename(file);
    const hs = ordered(s.highlights);
    if (!hs.length) return { text: `No highlights or notes on ${name} yet. The user makes them in Files: open the PDF, press Highlight, and select words or drag a box around a figure.` };
    const pagesWith = new Set(hs.map((h) => h.page));
    const noted = hs.filter((h) => h.note?.trim()).length;
    const kept = s.kept ? spaceById(db, s.kept.space) : null;
    const out: string[] = [
      `${name} · “${paperTitle(l)}” · ${l.pages.length} page${l.pages.length === 1 ? '' : 's'}: ${hs.length} highlight${hs.length === 1 ? '' : 's'} on ${pagesWith.size} page${pagesWith.size === 1 ? '' : 's'}, ${noted} with a note.`,
    ];
    if (s.kept && kept) out.push(`Kept in the project “${kept.name}”’s knowledge as “${path.basename(s.kept.file)}”, which follows every change.`);
    const images: ToolOutput['images'] = [];
    const want = a.pictures !== false;
    let page = 0;
    let i = 0;
    for (const h of hs) {
      if (h.page !== page) {
        page = h.page;
        out.push('', `Page ${page}`);
      }
      i++;
      const words = (h.text ?? '').replace(/\s+/g, ' ').trim();
      let line: string;
      if (h.kind === 'area') {
        const r = h.rects[0];
        let pic = '';
        if (want && images.length < 6) {
          try {
            const src = cutTo(l.data, h.page, r, true);
            const png = await renderPage(src, h.page, { width: 900 }, () => extractPages(src, [h.page]).data);
            images.push({ data: png.toString('base64'), mimeType: 'image/png' });
            pic = `, picture ${images.length}`;
          } catch {}
        }
        line = `${i}. ${h.color}, an area (a figure or an equation${pic}) at x ${r1(r.x)}, y ${r1(r.y)}, ${r1(r.w)} × ${r1(r.h)} points${words ? `; the words in it: “${words}”` : ''}`;
      } else line = `${i}. ${h.color}: “${words}”`;
      if (h.lost) line += ' (the file changed and these words are no longer in it)';
      out.push(line);
      if (h.note?.trim()) out.push(...h.note.trim().split('\n').map((x, k) => `   ${k ? '' : 'Note: '}${x}`.trimEnd()));
    }
    return { text: out.join('\n'), ...(images.length ? { images } : {}) };
  },
};

export const pdfNotes: Feature = {
  id: 'pdfnotes',
  routes,
  // Only once the user has highlighted a PDF: otherwise one more tool to wade through.
  tools: (ctx) => (anyNotes(ctx.deps.db) ? [NOTES_TOOL] : []),
  spawn: (_s, d) =>
    anyNotes(d.db)
      ? { instructions: ['PDF highlights: in Files the user highlights passages, equations and figures of PDFs and writes notes on them; pdf_notes lists a PDF’s highlights and notes by page. Use it when they mention their highlights or notes on a paper.'] }
      : undefined,
};

export { NOTES_TOOL, current as currentNotes, placeAgain };
