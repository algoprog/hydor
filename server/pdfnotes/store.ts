// Where a PDF's highlights and notes are kept: in the app's own data, by the file's absolute path (the PDF itself is
// left as it is), with the fingerprint of the file they were last placed on, so a file that changed gets its
// highlights found again by their words (layer.ts), and a file moved outside Files (a terminal, an agent) finds the
// notes it left behind by its contents. Files moves them along when it renames or moves the file or its folder.
import fs from 'node:fs';
import path from 'node:path';
import { HIGHLIGHT_COLORS, MAX_HIGHLIGHT_TEXT, MAX_HIGHLIGHTS, MAX_NOTE, type HighlightColor, type PdfHighlight, type PdfNotesKept, type PdfRect } from '../../shared/pdfnotes.ts';
import type { DB } from '../db.ts';

/** What is kept for a file. */
export interface Stored {
  highlights: PdfHighlight[];
  kept?: PdfNotesKept;
  /** The file as the highlights were last placed on it. */
  fp?: { size: number; mtime: number; hash: string };
}

const made = new WeakSet<DB>();
export function notesTable(db: DB) {
  if (made.has(db)) return;
  db.exec('create table if not exists pdf_notes (path text primary key, hash text, data text not null, at integer not null)');
  db.exec('create index if not exists pdf_notes_hash on pdf_notes (hash)');
  made.add(db);
}

/** Whether any PDF has highlights or notes (agents get pdf_notes only then). */
export function anyNotes(db: DB): boolean {
  notesTable(db);
  return !!db.prepare('select 1 from pdf_notes limit 1').get();
}

export function readNotes(db: DB, abs: string): Stored {
  notesTable(db);
  const row = db.prepare('select data from pdf_notes where path = ?').get(abs) as { data: string } | undefined;
  if (!row) return { highlights: [] };
  try {
    const d = JSON.parse(row.data) as Stored;
    return { highlights: (Array.isArray(d.highlights) ? d.highlights : []).flatMap((h) => cleanHighlight(h) ?? []), ...(d.kept ? { kept: d.kept } : {}), ...(d.fp ? { fp: d.fp } : {}) };
  } catch {
    return { highlights: [] };
  }
}

/** Keeps a file's notes; with no highlights and kept nowhere, the file is forgotten. */
export function writeNotes(db: DB, abs: string, s: Stored) {
  notesTable(db);
  if (!s.highlights.length && !s.kept) {
    db.prepare('delete from pdf_notes where path = ?').run(abs);
    return;
  }
  db.prepare('insert into pdf_notes (path, hash, data, at) values (?, ?, ?, ?) on conflict(path) do update set hash = excluded.hash, data = excluded.data, at = excluded.at').run(
    abs,
    s.fp?.hash ?? null,
    JSON.stringify(s),
    Date.now(),
  );
}

/** Files renamed or moved in Files: their notes go with them (a folder's files' too). Returns the new paths. */
export function movePdfNotes(db: DB, from: string, to: string): string[] {
  notesTable(db);
  if (!from || !to || from === to) return [];
  const rows = db.prepare("select path from pdf_notes where path = ? or path like ? escape '\\'").all(from, `${from.replace(/[\\%_]/g, (c) => `\\${c}`)}${path.sep === '\\' ? '\\\\' : path.sep}%`) as { path: string }[];
  const move = db.prepare('update or replace pdf_notes set path = ? where path = ?');
  const out: string[] = [];
  for (const r of rows) {
    const next = to + r.path.slice(from.length);
    move.run(next, r.path);
    out.push(next);
  }
  return out;
}

/** The notes of a file that is no longer where they were kept, by its contents: a file moved outside Files. */
export function orphanFor(db: DB, hash: string): string | null {
  notesTable(db);
  const rows = db.prepare('select path from pdf_notes where hash = ?').all(hash) as { path: string }[];
  return rows.find((r) => !fs.existsSync(r.path))?.path ?? null;
}

/** Paths kept whose files are gone (cheap to ask before hashing a file to look for its notes). */
export function anyGone(db: DB): boolean {
  notesTable(db);
  const rows = db.prepare('select path from pdf_notes where hash is not null').all() as { path: string }[];
  return rows.some((r) => !fs.existsSync(r.path));
}


// ---- checking what pages and agents send ---------------------------------------------------------------

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

function cleanRect(v: unknown): PdfRect | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const r = { x: num(o.x), y: num(o.y), w: num(o.w), h: num(o.h) };
  if (![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0 || r.w > 20_000 || r.h > 20_000 || Math.abs(r.x) > 20_000 || Math.abs(r.y) > 20_000) return null;
  const k = (n: number) => Math.round(n * 100) / 100;
  return { x: k(r.x), y: k(r.y), w: k(r.w), h: k(r.h) };
}

export const isColor = (c: unknown): c is HighlightColor => typeof c === 'string' && (HIGHLIGHT_COLORS as string[]).includes(c);

const cleanText = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\r\n?/g, '\n').slice(0, max) : undefined);

/** A highlight as kept: its fields checked and trimmed; null when it has no page, kind or place. */
export function cleanHighlight(v: unknown): PdfHighlight | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(o.id) ? o.id : null;
  const page = Math.round(num(o.page));
  const kind = o.kind === 'area' ? 'area' : o.kind === 'text' ? 'text' : null;
  const rects = (Array.isArray(o.rects) ? o.rects : []).slice(0, 400).flatMap((r) => cleanRect(r) ?? []);
  if (!id || !(page >= 1) || !kind || !rects.length) return null;
  const text = cleanText(o.text, MAX_HIGHLIGHT_TEXT)?.trim();
  const note = cleanText(o.note, MAX_NOTE);
  return {
    id,
    page,
    kind,
    rects: kind === 'area' ? rects.slice(0, 1) : rects,
    ...(text ? { text } : {}),
    color: isColor(o.color) ? o.color : 'yellow',
    ...(note?.trim() ? { note } : {}),
    ...(Number.isFinite(num(o.o)) ? { o: Math.max(0, Math.round(num(o.o))) } : {}),
    ...(kind === 'area' && cleanRect(o.anchor) && typeof (o.anchor as { t?: unknown }).t === 'string' ? { anchor: { ...cleanRect(o.anchor)!, t: String((o.anchor as { t: string }).t).slice(0, 400) } } : {}),
    at: Number.isFinite(num(o.at)) ? num(o.at) : Date.now(),
    ...(Number.isFinite(num(o.edited)) ? { edited: num(o.edited) } : {}),
    ...(o.lost === true ? { lost: true as const } : {}),
  };
}

/** Highlights in reading order: by page, then by where they start in its words (else from the top, then the left). */
export const ordered = (hs: PdfHighlight[]) =>
  [...hs].sort((a, b) => a.page - b.page || (a.o !== undefined && b.o !== undefined ? a.o - b.o : 0) || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0) || (a.rects[0]?.x ?? 0) - (b.rects[0]?.x ?? 0));

export { MAX_HIGHLIGHTS };
