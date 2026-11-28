// Every kept thing in a project also has a real file of its own in the project's folder, kept in step both ways: a
// page, a deck, a document, a spreadsheet, a LaTeX project, a notebook or a diagram as the file its editor reads back
// (shared/pages.ts PROJECT_FILE_EXT), a picture, a video or a sound as a copy of it. A board has none (its cards are
// live), nor does an app's screen, anything in no project, or what a confidential session kept (a file there would be
// in reach of other sessions' agents).
//
// App to file: every change (pages/store.ts onPageChange, media/store.ts onMediaChange, pages/folders.ts
// onPlaceChange) writes the file again, about 1.5 s after the last one, one thing at a time. A file named after its
// title (project_file_auto) is renamed with the title; one the user named, or one that was there before, keeps its
// name. A thing moved to another project takes its file along; one deleted or moved out of every project has its file
// put in the app's Trash. Deleting the project leaves the files as plain files (spaces/index.ts deleteSpace).
//
// A picture, video or sound kept from a file that was in the project's folder already has that file as its own
// (adopted). It is the user's: the app writes the item's changes into it, but never trashes or moves it. Where another
// file would take its place (another project or folder, another format, an outside change that cannot be read), the
// item gets a new file of the app's own and the user's is left where it is.
//
// File to app: every few seconds each file is looked at. One changed outside the app is read back in as a new version
// ("file"); when the app changed too since the file was written, both are kept as versions and the app's stays the
// current one. A file that cannot be read back is set aside as "… (changed outside Hydor)" and written anew. One that
// is gone twice in a row is forgotten, and written anew at the thing's next change. The Files routes tell this module
// what the user renamed, moved or deleted there (server/index.ts /api/fs).
//
// Columns of the pages and media tables: project_file (the path), project_file_sig ("mtime:size" right after the app
// wrote or read it; "gone" once forgotten), project_file_auto, project_file_sha (the file's bytes then; for media, the
// kept file's), project_file_title (the title it was named after), for pages project_file_version (the version it
// matches) and project_file_outside (its bytes came from outside: a copy goes to the Trash before it is written over),
// and for media project_file_adopted.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaItem } from '../../shared/media.ts';
import { PROJECT_FILE_EXT, type KeptFileRef, type PageInfo } from '../../shared/pages.ts';
import { isWebDeck } from '../../shared/slides.ts';
import { TEX_MAIN, type TexDoc } from '../../shared/latex.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { confidentialKey } from '../confidential/index.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { fileHash } from '../filemove.ts';
import { deletePath, invalidateGit, renamePath, trashCopy, type FsEntry } from '../files.ts';
import { dimensions } from '../images/openrouter.ts';
import { hasFfmpeg, probe, waveform } from '../media/frames.ts';
import { filesOf, getMedia, MEDIA_DIR, mediaChanged, onMediaChange } from '../media/store.ts';
import { keepEarlierVersion, remakeStills, restoreMediaVersion } from '../media/versions.ts';
import { exportPage, FILE_HEAD_END, FILE_HEAD_START, fileName, insideFile } from '../pages/export.ts';
import { fitFolder, onPlaceChange } from '../pages/folders.ts';
import { mustKind, type ExportFormat, type PageKind } from '../pages/kinds.ts';
import { readTex, texParts } from '../pages/latex.ts';
import { zipParts } from '../pages/ooxml.ts';
import { readDeck } from '../pages/slides.ts';
import { addVersion, checkHtml, onPageChange, pageSource } from '../pages/store.ts';
import { refreshThumbs } from '../pages/thumbs.ts';
import { allSpaces, spaceById } from './index.ts';

export type KeptType = 'page' | 'media';
type Heard = Pick<Deps, 'db' | 'broadcast'>;

export interface KeptFilesOptions {
  /** How long after the last change a file is written. */
  debounceMs?: number;
  /** How often the files are looked at (0: only when `sweep` is called). */
  sweepMs?: number;
  /** A file changed less than this long ago may still be being written: it is read at a later look. */
  settleMs?: number;
  /** How long after start things without a file are given one (0: only when `backfill` is called). */
  backfillMs?: number;
  /** A pause between two of those. */
  backfillGapMs?: number;
}

const table = (t: KeptType) => (t === 'page' ? 'pages' : 'media');
const keyOf = (t: KeptType, id: string) => `${t}:${id}`;

interface Row {
  type: KeptType;
  id: string;
  title: string;
  /** A page's kind ('page' for HTML), or the media's. */
  kind: string;
  space: string | null;
  app: string | null;
  session: string | null;
  file: string | null;
  sig: string | null;
  sha: string | null;
  auto: number | null;
  fileTitle: string | null;
  /** Pages: the current version, and the one its file matches. */
  version: number;
  fileVersion: number | null;
  outside: number | null;
  /** Media: its file was there before it was kept (the user's own). */
  adopted: number | null;
}

function readRow(db: DB, type: KeptType, id: string): Row | null {
  const sql =
    type === 'page'
      ? `select id, title, coalesce(kind, 'page') as kind, space, app, session_key as session, project_file as file, project_file_sig as sig, project_file_sha as sha,
           project_file_auto as auto, project_file_title as fileTitle, version, project_file_version as fileVersion, project_file_outside as outside, null as adopted from pages where id = ?`
      : `select id, title, kind, space, null as app, session_key as session, project_file as file, project_file_sig as sig, project_file_sha as sha,
           project_file_auto as auto, project_file_title as fileTitle, 0 as version, null as fileVersion, null as outside, project_file_adopted as adopted from media where id = ?`;
  const r = db.prepare(sql).get(id) as Omit<Row, 'type'> | undefined;
  return r ? { ...r, type } : null;
}

const COLUMNS: Record<string, string> = {
  file: 'project_file',
  sig: 'project_file_sig',
  sha: 'project_file_sha',
  auto: 'project_file_auto',
  fileTitle: 'project_file_title',
  fileVersion: 'project_file_version',
  outside: 'project_file_outside',
  adopted: 'project_file_adopted',
};

function record(db: DB, type: KeptType, id: string, f: Partial<Pick<Row, 'file' | 'sig' | 'sha' | 'auto' | 'fileTitle' | 'fileVersion' | 'outside' | 'adopted'>>) {
  const keys = Object.keys(f).filter((k) => (type === 'page' ? k !== 'adopted' : k !== 'fileVersion' && k !== 'outside'));
  if (!keys.length) return;
  db.prepare(`update ${table(type)} set ${keys.map((k) => `${COLUMNS[k]} = ?`).join(', ')} where id = ?`).run(...keys.map((k) => (f as Record<string, unknown>)[k] ?? null), id);
}

/** Forgets a thing's file (the file itself stays). `gone`: it is not written again until the thing next changes. */
const forget = (db: DB, type: KeptType, id: string, gone = false) =>
  record(db, type, id, { file: null, sig: gone ? 'gone' : null, sha: null, auto: null, fileTitle: null, fileVersion: null, outside: null, adopted: null });

function tell(d: Heard, type: KeptType, id: string) {
  if (type === 'page') d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
  else {
    const item = getMedia(d.db, id);
    if (item) d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', item } });
  }
}

// ---- places ------------------------------------------------------------------------------------------------------

const folded = process.platform === 'darwin' || process.platform === 'win32';
const fold = (p: string) => (folded ? p.toLowerCase() : p);
const withSep = (p: string) => (p.endsWith(path.sep) ? p : p + path.sep);
/** Whether `p` is `root` or inside it. */
const within = (root: string, p: string) => fold(p) === fold(root) || fold(p).startsWith(withSep(fold(root)));

const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const exists = (p: string) => !!fs.lstatSync(p, { throwIfNoEntry: false });
const real = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    // What is not there yet: where its folder really is, and its own name.
    const up = path.dirname(p);
    return up === p ? p : path.join(real(up), path.basename(p));
  }
};

/** A project's folder, when the project is there. */
function folderOf(db: DB, space: string | null): string | null {
  const s = space ? spaceById(db, space) : null;
  return s?.folder ? path.resolve(s.folder) : null;
}

/** Whether a thing is one that has a file: in a project whose folder is there, not a board, an app's screen or a confidential session's. */
function rootFor(db: DB, row: Row): string | null {
  if (row.app || (row.type === 'page' && !PROJECT_FILE_EXT[row.kind as keyof typeof PROJECT_FILE_EXT])) return null;
  const root = folderOf(db, row.space);
  if (!root || !isDir(root)) return null;
  if (row.session && confidentialKey(db, row.session)) return null;
  return root;
}

const notThere = () => new HttpError(400, 'dir: a folder that is there, the project’s folder or one inside it (its whole path)');

/**
 * The folder a request asks a thing's file to go in (`dir`), checked: the project's folder or a folder inside it
 * (400 otherwise). Undefined when none is asked.
 */
export function checkProjectDir(db: DB, space: string | null | undefined, dir: unknown): string | undefined {
  if (dir === undefined || dir === null || dir === '') return undefined;
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw notThere();
  const root = folderOf(db, space ?? null);
  if (!root) throw new HttpError(400, 'dir: this is in no project, so its file has no folder to go in');
  const at = path.resolve(dir);
  // Nor through a link in the project's folder to a folder elsewhere.
  if (!within(root, at) || !isDir(at) || !within(real(root), real(at))) throw notThere();
  return at;
}

/** An agent's `projectFolder`, checked: a path from the project's folder ("" for its top). Undefined when not given. */
export function projectFolderPath(v: unknown): string | undefined {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return undefined;
  const s = typeof v === 'string' ? v.trim() : '';
  const parts = s.split(/[/\\]+/).filter((p) => p && p !== '.');
  if (!s || path.isAbsolute(s) || /^([a-z]:|[/\\~])/i.test(s) || parts.includes('..'))
    throw new Error('projectFolder: a folder’s path from the project’s folder, such as "reports/2026" (not an absolute path, and without "..")');
  return parts.join(path.sep);
}

/** `cwd` when it is a folder inside a project's folder (not that folder itself): where an agent working there saves to. */
export function folderInProject(db: DB, space: string | null | undefined, cwd: string | undefined): string | undefined {
  const root = folderOf(db, space ?? null);
  if (!root || !cwd) return undefined;
  const at = path.resolve(cwd);
  return fold(at) !== fold(root) && within(root, at) && isDir(at) && within(real(root), real(at)) ? at : undefined;
}

/** That folder of a project, made when missing; null when the project has no folder on this computer. */
export function makeProjectFolder(db: DB, space: string | null | undefined, rel: string): string | null {
  const root = folderOf(db, space ?? null);
  if (!root || !isDir(root)) return null;
  const at = path.resolve(root, rel);
  if (!within(root, at) || !within(real(root), real(at))) throw new Error('projectFolder: that leads out of the project’s folder');
  fs.mkdirSync(at, { recursive: true });
  return at;
}

// ---- names ---------------------------------------------------------------------------------------------------------

/** The endings that are one format. */
const normalExt = (e: string) => {
  const x = e.replace(/^\./, '').toLowerCase();
  return ({ htm: 'html', jpeg: 'jpg', m4v: 'mp4', oga: 'ogg', ltx: 'tex' } as Record<string, string>)[x] ?? x;
};

/** The longest a name's stem may be, in bytes (file systems take 255). */
const MAX_STEM = 200;

/** A file's name from a title: "Title.ext", or "Title" for a folder (ext ""). */
function nameFor(title: string, ext: string): string {
  const t = ext && title.toLowerCase().endsWith(`.${ext}`) ? title.slice(0, -ext.length - 1) : title;
  let stem = fileName(t, 'x').slice(0, -2);
  while (Buffer.byteLength(stem) > MAX_STEM) stem = [...stem].slice(0, -1).join('');
  return ext ? `${stem.trim()}.${ext}` : stem.trim();
}

const sameFile = (a: string, b: string) => {
  const x = fs.statSync(a, { throwIfNoEntry: false });
  const y = fs.statSync(b, { throwIfNoEntry: false });
  return !!x && !!y && x.ino === y.ino && x.dev === y.dev;
};

const claimed = (db: DB, p: string, type?: KeptType, id?: string) =>
  (['page', 'media'] as KeptType[]).some((t) => !!db.prepare(`select 1 from ${table(t)} where project_file = ? and id != ?`).get(p, t === type ? id : ''));

/** `base` in `dir`, or "Name 2.ext", "Name 3.ext"…: one no other file (or thing) has. `own`: the thing's file now. */
function freeAt(db: DB, dir: string, base: string, ext: string, who: { type?: KeptType; id?: string; own?: string | null }): string {
  const stem = ext && base.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? base.slice(0, -ext.length - 1) : base;
  const end = base.slice(stem.length);
  for (let i = 1; i < 10_000; i++) {
    const p = path.join(dir, i === 1 ? base : `${stem} ${i}${end}`);
    if (who.own && p === who.own) return p;
    if ((!exists(p) || (who.own && sameFile(p, who.own))) && !claimed(db, p, who.type, who.id)) return p;
  }
  throw new HttpError(409, 'No free name for it there');
}

// ---- what a file holds ----------------------------------------------------------------------------------------------

interface Look {
  sig: string;
  /** The latest change, in ms. */
  mtime: number;
  dir: boolean;
}

/** The files of a LaTeX project's folder (hidden ones aside), by their path in it. */
function walk(dir: string): { name: string; file: string }[] {
  const out: { name: string; file: string }[] = [];
  const go = (at: string, rel: string, depth: number) => {
    for (const e of fs.readdirSync(at, { withFileTypes: true })) {
      if (e.name.startsWith('.') || out.length >= 2000) continue;
      const file = path.join(at, e.name);
      if (e.isDirectory() && depth < 8) go(file, `${rel}${e.name}/`, depth + 1);
      else if (e.isFile()) out.push({ name: `${rel}${e.name}`, file });
    }
  };
  go(dir, '', 0);
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** "mtime:size" of a file, or of every file in a folder (the latest change, the sizes together); null when it is not there. */
function look(p: string): Look | null {
  try {
    const st = fs.statSync(p);
    if (!st.isDirectory()) return { sig: `${Math.floor(st.mtimeMs)}:${st.size}`, mtime: st.mtimeMs, dir: false };
    let mtime = 0;
    let size = 0;
    for (const f of walk(p)) {
      const s = fs.statSync(f.file, { throwIfNoEntry: false });
      if (!s) continue;
      mtime = Math.max(mtime, s.mtimeMs);
      size += s.size;
    }
    return { sig: `${Math.floor(mtime)}:${size}`, mtime, dir: true };
  } catch {
    return null;
  }
}

async function hashOf(p: string): Promise<string> {
  if (!fs.statSync(p).isDirectory()) return fileHash(p);
  const h = crypto.createHash('sha256');
  for (const f of walk(p)) h.update(`${f.name}\0${await fileHash(f.file)}\0`);
  return h.digest('hex');
}

/** The app's Trash; on another disk than the trash a file is copied there first, and a folder stays where it is. */
async function toTrash(p: string) {
  if (!exists(p)) return;
  try {
    await deletePath(p);
  } catch (e) {
    if ((e as HttpError).status !== 409 || isDir(p)) throw e;
    await trashCopy(p);
    await fs.promises.rm(p, { force: true });
    invalidateGit(p);
  }
}

const tmpIn = (dir: string) => path.join(dir, `.hydor-${crypto.randomBytes(6).toString('hex')}.tmp`);

/** The format of a page's file now: its extension, or "" for a LaTeX project's folder. */
function extFor(db: DB, row: Row): string {
  if (row.type === 'media') return normalExt(path.extname(getMedia(db, row.id)!.file));
  if (row.kind === 'slides') return isWebDeck(readDeck(pageSource(db, row.id)!.text)) ? 'html' : 'pptx';
  if (row.kind === 'tex') {
    const doc = readTex(pageSource(db, row.id)!.text);
    if (doc.files.length || doc.pictures.length) return '';
    // Only its main text now: a folder that holds more than that (what the user or LaTeX put there) stays a folder.
    if (row.file && isDir(row.file)) {
      const before = row.fileVersion ? pageSource(db, row.id, row.fileVersion) : null;
      const was = before ? readTex(before.text) : null;
      const ours = new Set(['main.tex', ...(was ? [...was.files, ...was.pictures].map((f) => f.name) : [])]);
      return walk(row.file).some((f) => !ours.has(f.name)) ? '' : 'tex';
    }
    return 'tex';
  }
  return PROJECT_FILE_EXT[row.kind as keyof typeof PROJECT_FILE_EXT]!;
}

// ---- reading a file back ---------------------------------------------------------------------------------------------

/** Why a file is not read back: said in the server's log alone. */
class Unread extends Error {}

/** The most a file may be to be read back (as large as an import takes). */
const readMax = (kind: string) => (kind === 'slides' ? 200 : 30) * 1024 * 1024;

const ADDRESSES = /\/pg\/(?:pic|video)\/[a-f0-9]{16,64}\/[\w-]{16,64}/g;

/**
 * A page of HTML from its file: without what the app put in it on the way out (its stylesheet and scripts, between
 * their marks), and its pictures and videos at their addresses again, as the versions that were written had them.
 */
function htmlBack(db: DB, row: Row, text: string): string {
  let s = text.replace(/^﻿/, '');
  const a = s.indexOf(FILE_HEAD_START);
  const b = a < 0 ? -1 : s.indexOf(FILE_HEAD_END, a);
  if (b >= 0) s = s.slice(0, a) + s.slice(b + FILE_HEAD_END.length);
  // The marks were taken out (an editor that drops comments): what they held, by how it starts.
  else s = s.replace(/<style id="n-kit">[\s\S]*?<\/style><script>document\.documentElement\.setAttribute\('data-n-theme'[\s\S]*?<\/script>/, '');
  const from = [row.fileVersion, row.version].flatMap((v) => (v ? [pageSource(db, row.id, v)?.text ?? ''] : []));
  const addresses = new Set(from.flatMap((t) => t.match(ADDRESSES) ?? []));
  // A picture or video that could not go inside stands as "data:,": back in the order they were written.
  const left: string[] = [];
  for (const address of addresses) {
    const inside = insideFile(db, address);
    if (inside === 'data:,') left.push(address);
    else if (inside !== address) s = s.split(inside).join(address);
  }
  if (left.length) {
    const all = (from[0] ?? '').match(ADDRESSES) ?? [];
    const order = all.filter((x) => left.includes(x));
    let i = 0;
    s = s.replace(/data:,(?=["')\s>])/g, (m) => order[i++] ?? m);
  }
  return s;
}

/** A LaTeX project from its file or folder, over the current document: what a .tex file cannot say (engine, comments) stays. */
async function texBack(db: DB, row: Row, file: string, folder: boolean): Promise<TexDoc> {
  const kind = mustKind('tex');
  const cur = readTex(pageSource(db, row.id)!.text);
  if (!folder) {
    const got = (await kind.fromFile!(await fs.promises.readFile(file), 'main.tex', db)).model as TexDoc;
    return { ...cur, main: got.main };
  }
  const parts: { name: string; data: Buffer }[] = [];
  let total = 0;
  for (const f of walk(file)) {
    total += fs.statSync(f.file).size;
    if (total > 300 * 1024 * 1024) throw new Unread('the folder is too large to read back');
    parts.push({ name: f.name, data: await fs.promises.readFile(f.file) });
  }
  const got = (await kind.fromFile!(zipParts(parts), 'project.zip', db)).model as TexDoc;
  // The files and pictures it had, in their order; new ones after.
  const inOrder = <T extends { name: string }>(was: T[], now: T[]) => {
    const at = (x: T) => {
      const i = was.findIndex((w) => w.name === x.name);
      return i < 0 ? was.length : i;
    };
    return [...now].sort((a, b) => at(a) - at(b));
  };
  return { ...cur, main: got.main, files: inOrder(cur.files, got.files), pictures: inOrder(cur.pictures, got.pictures) };
}

/** A page's content as its file holds it now: HTML, or its kind's model. Throws when it cannot be read back. */
async function readBack(db: DB, row: Row, file: string, folder: boolean): Promise<{ html: string } | { model: unknown }> {
  const ext = folder ? '' : normalExt(path.extname(file));
  // A deck in the web format is never read back: its HTML file is the deck as it shows, not as it is kept.
  if (row.kind === 'slides' && ext !== 'pptx') throw new Unread('a web deck’s HTML file is not read back');
  if (row.kind === 'tex') {
    if (!folder && ext !== 'tex') throw new Unread('not a .tex file');
    return { model: await texBack(db, row, file, folder) };
  }
  if (folder || ext !== PROJECT_FILE_EXT[row.kind as keyof typeof PROJECT_FILE_EXT]) throw new Unread('not the kind of file it was');
  const size = fs.statSync(file).size;
  if (!size || size > readMax(row.kind)) throw new Unread(size ? 'it is too large to read back' : 'it is empty');
  const data = await fs.promises.readFile(file);
  if (row.kind === 'page') return { html: htmlBack(db, row, data.toString('utf8')) };
  const got = await mustKind(row.kind).fromFile!(data, path.basename(file), db);
  return { model: got.model };
}

/** What a picture, video or sound file says of itself; null when it is not one that can be read. */
async function mediaFacts(file: string, kind: MediaItem['kind']): Promise<{ width?: number; height?: number; duration?: number; peaks?: number[] } | null> {
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st?.isFile() || !st.size || st.size > 1024 * 1024 * 1024) return null;
  const head = Buffer.alloc(Math.min(st.size, 64 * 1024));
  const fd = await fs.promises.open(file, 'r');
  try {
    await fd.read(head, 0, head.length, 0);
  } finally {
    await fd.close();
  }
  if (kind === 'image') {
    const d = dimensions(head);
    if (d) return { width: d.w, height: d.h };
    // AVIF (and what dimensions does not read): ffmpeg's word, or the format's own mark without it.
    const p = await probe(file);
    if (p?.width) return { width: p.width, height: p.height };
    return head.toString('latin1', 4, 12).startsWith('ftypavi') ? {} : null;
  }
  const p = await probe(file);
  // Without ffmpeg it cannot be told: taken as it is.
  if (!p) return (await hasFfmpeg()) ? null : {};
  if (kind === 'video') return p.video ? { width: p.width, height: p.height, duration: p.duration } : null;
  if (!p.audio) return null;
  const peaks = await waveform(file);
  return { duration: p.duration, ...(peaks ? { peaks } : {}) };
}

// ---- the engine ------------------------------------------------------------------------------------------------------

type Outcome = 'written' | 'adopted' | 'none' | 'failed';

class Engine {
  readonly debounceMs: number;
  readonly sweepMs: number;
  readonly settleMs: number;
  readonly backfillMs: number;
  readonly backfillGapMs: number;
  private timers = new Map<string, NodeJS.Timeout>();
  /** Runs waiting their turn, by thing. */
  private queued = new Map<string, Promise<Outcome>>();
  private running: string | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private asked = new Map<string, string>();
  private rewrite = new Set<string>();
  private misses = new Map<string, number>();
  /** What could not be dealt with, as it looked then: not tried again at every look, only once it changes. */
  private stuck = new Map<string, string>();
  private sweeping = false;
  private intervals: NodeJS.Timeout[] = [];
  stopped = false;

  constructor(
    readonly d: Heard,
    o: KeptFilesOptions,
  ) {
    this.debounceMs = o.debounceMs ?? 1500;
    this.sweepMs = o.sweepMs ?? 5000;
    this.settleMs = o.settleMs ?? 1500;
    this.backfillMs = o.backfillMs ?? 20_000;
    this.backfillGapMs = o.backfillGapMs ?? 300;
    if (this.sweepMs > 0) this.intervals.push(setInterval(() => void this.sweep(), this.sweepMs).unref());
    if (this.backfillMs > 0) this.intervals.push(setTimeout(() => void this.backfill(), this.backfillMs).unref());
  }

  stop() {
    this.stopped = true;
    for (const t of [...this.timers.values(), ...this.intervals]) clearTimeout(t);
    this.timers.clear();
  }

  /** Something changed: its file is written again a moment after the last change. */
  changed(type: KeptType, id: string, o: { delay?: number; rewrite?: boolean } = {}) {
    if (this.stopped) return;
    const key = keyOf(type, id);
    if (o.rewrite) this.rewrite.add(key);
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => void this.run(type, id), o.delay ?? this.debounceMs),
    );
    this.timers.get(key)!.unref();
  }

  /** A deleted thing's file goes to the Trash, after whatever is being written. */
  gone(type: KeptType, id: string, file: string | undefined) {
    const key = keyOf(type, id);
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    this.asked.delete(key);
    this.rewrite.delete(key);
    if (file) void this.inTurn(async () => (claimed(this.d.db, file) ? undefined : toTrash(file))).catch(() => {});
  }

  /** The folder asked for a thing's file (checked by the caller). */
  place(type: KeptType, id: string, dir: string) {
    this.asked.set(keyOf(type, id), dir);
    this.changed(type, id);
  }

  private inTurn<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job);
    this.chain = run.catch((e) => console.error(`[kept-files] ${(e as Error)?.message ?? e}`));
    return run;
  }

  /** Brings a thing's file up to date now, in turn: one run at a time, so no two writes of it cross. */
  run(type: KeptType, id: string, o: { adopt?: boolean } = {}): Promise<Outcome> {
    const key = keyOf(type, id);
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    const waiting = this.queued.get(key);
    if (waiting) return waiting;
    const run = this.inTurn(async (): Promise<Outcome> => {
      this.queued.delete(key);
      if (this.stopped) return 'none';
      this.running = key;
      try {
        const done = await this.sync(type, id, o);
        this.stuck.delete(key);
        return done;
      } catch (e) {
        console.error(`[kept-files] ${type} ${id}: ${(e as Error)?.message ?? e}`);
        const file = readRow(this.d.db, type, id)?.file;
        if (file) this.stuck.set(key, look(file)?.sig ?? '');
        return 'failed';
      } finally {
        this.running = null;
      }
    });
    this.queued.set(key, run);
    return run;
  }

  /** Resolves once nothing waits to be written. */
  async idle(): Promise<void> {
    for (;;) {
      await this.chain;
      if (!this.timers.size && !this.queued.size && !this.running && !this.sweeping) return;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  private async sync(type: KeptType, id: string, o: { adopt?: boolean }): Promise<Outcome> {
    const { db } = this.d;
    const key = keyOf(type, id);
    let row = readRow(db, type, id);
    if (!row) return 'none';

    // Out of every project: its file goes to the Trash (what was changed in it outside is taken in first).
    if (!row.space) {
      if (!row.file) return 'none';
      if ((await this.takeIn(row)) === 'later') return this.later(type, id);
      row = readRow(db, type, id);
      if (!row?.file || row.space) return 'none';
      const { file, adopted } = row;
      forget(db, type, id);
      if (!adopted) await toTrash(file);
      tell(this.d, type, id);
      return 'none';
    }
    let root = rootFor(db, row);
    if (!root) return 'none';

    // A change made outside the app comes in before anything is written over it.
    if (row.file) {
      if ((await this.takeIn(row)) === 'later') return this.later(type, id);
      row = readRow(db, type, id);
      if (!row || !(root = rootFor(db, row))) return 'none';
    }
    if (!row.file && o.adopt && type === 'media' && (await this.adoptSource(row, root))) return 'adopted';

    const ext = extFor(db, row);
    let dirAsked = this.asked.get(key);
    if (dirAsked && (!within(root, dirAsked) || (row.file && within(row.file, dirAsked)))) dirAsked = undefined;
    const old = row.file;
    const there = !!old && exists(old);
    // A LaTeX project's folder has no ending, whatever dots its name has.
    const folderNow = !!old && (there ? isDir(old) : row.kind === 'tex' && !/\.(tex|ltx)$/i.test(old));
    const oldExt = old ? (folderNow ? '' : normalExt(path.extname(old))) : ext;
    // A page's file is written again with its new title, whether or not the file is renamed for it.
    const retitled = !!old && row.fileTitle !== null && row.fileTitle !== row.title;
    const renamed = !!row.auto && retitled;

    // The user's own file (adopted) is never moved or trashed: where it would be, the item gets a file of its own.
    const users = !!row.adopted && there;
    let target: string;
    /** The new file is named after the title (and renamed with it). */
    let auto = old ? (row.auto ?? 0) : 1;
    if (!old) target = freeAt(db, dirAsked ?? root, nameFor(row.title, ext), ext, { type, id });
    else {
      const dir = dirAsked ?? (within(root, old) ? path.dirname(old) : root);
      const stem = oldExt ? path.basename(old, path.extname(old)) : path.basename(old);
      const elsewhere = dir !== path.dirname(old);
      // A copy of the user's file in another place is the app's own, named after the title.
      if (users && elsewhere) auto = 1;
      // A file named after its title takes the title's name where it goes (a number it had here may not be needed there).
      const anew = renamed || (!!auto && elsewhere);
      const base = anew ? nameFor(row.title, ext) : oldExt !== ext ? (ext ? `${stem}.${ext}` : stem) : path.basename(old);
      target = path.join(dir, base) === old ? old : freeAt(db, dir, base, ext, { type, id, own: users ? null : old });
    }
    let moved = false;
    // The same kind of file: renamed or moved as it is.
    if (old && there && !users && target !== old && oldExt === ext) {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (sameFile(old, target)) await fs.promises.rename(old, target);
      else await renamePath(old, target);
      invalidateGit(old);
      record(db, type, id, { file: target, fileTitle: renamed ? row.title : row.fileTitle });
      row = readRow(db, type, id)!;
      moved = true;
    }

    const forced = this.rewrite.has(key);
    const media = type === 'media' ? getMedia(db, id)! : null;
    let mediaSha: string | null = null;
    if (media) {
      mediaSha = (db.prepare('select sha from media where id = ?').get(id) as { sha: string | null }).sha;
      if (!mediaSha) {
        mediaSha = await fileHash(filesOf(media).file);
        db.prepare('update media set sha = ? where id = ?').run(mediaSha, id);
      }
    }
    const stale = media ? row.sha !== mediaSha : forced || retitled || row.fileVersion !== row.version;
    if (row.file === target && exists(target) && !stale) {
      this.asked.delete(key);
      if (row.fileTitle !== row.title) record(db, type, id, { fileTitle: row.title });
      if (moved) tell(this.d, type, id);
      return 'none';
    }

    this.rewrite.delete(key);
    const done = ext ? await this.writeOne(row, target, media, mediaSha, auto) : await this.writeFolder(row, target);
    if (done === 'again') {
      if (forced) this.rewrite.add(key);
      this.changed(type, id);
      if (moved) tell(this.d, type, id);
      return 'none';
    }
    // Another kind of file now (a deck changed format, a LaTeX project grew files): the old one goes.
    if (old && there && !users && old !== done && exists(old) && !sameFile(old, done)) await toTrash(old);
    this.asked.delete(key);
    tell(this.d, type, id);
    return 'written';
  }

  private later(type: KeptType, id: string): Outcome {
    this.changed(type, id, { delay: Math.max(this.settleMs, this.debounceMs) });
    return 'none';
  }

  /** Whether the thing changed place while its file was made, or its file was changed outside meanwhile. */
  private changedMeanwhile(before: Row): boolean {
    const now = readRow(this.d.db, before.type, before.id);
    if (!now || now.space !== before.space || now.file !== before.file) return true;
    const seen = now.file ? look(now.file) : null;
    return !!seen && seen.sig !== now.sig;
  }

  /** One file: made beside where it goes, then moved over it. 'again' when the thing changed place meanwhile. */
  private async writeOne(row: Row, target: string, media: MediaItem | null, mediaSha: string | null, auto: number): Promise<string | 'again'> {
    const { db } = this.d;
    const dir = path.dirname(target);
    await fs.promises.mkdir(dir, { recursive: true });
    const tmp = tmpIn(dir);
    try {
      let version = row.version;
      let title = row.title;
      if (media) {
        await fs.promises.copyFile(filesOf(media).file, tmp);
        await fs.promises.chmod(tmp, 0o644);
      } else {
        // What is read before the first wait is what is written.
        const now = readRow(db, 'page', row.id)!;
        version = now.version;
        title = now.title;
        const ext = normalExt(path.extname(target));
        const format = ext as ExportFormat;
        const out = await exportPage(db, row.id, { format, markHead: true });
        await fs.promises.writeFile(tmp, out.data);
      }
      const sha = media ? mediaSha! : await fileHash(tmp);
      // A file whose bytes came from outside may hold more than the app keeps of them: a copy goes to the Trash.
      if (row.outside && row.file && exists(row.file) && !isDir(row.file)) await trashCopy(row.file);
      // From here to the record nothing waits, so nothing comes between.
      if (this.changedMeanwhile(row)) return 'again';
      const at = target !== row.file && exists(target) ? freeAt(db, dir, path.basename(target), path.extname(target).slice(1), { type: row.type, id: row.id }) : target;
      // Still the user's own only when it is that very file written into.
      const adopted = row.adopted && at === row.file && exists(at) ? 1 : 0;
      fs.renameSync(tmp, at);
      record(db, row.type, row.id, { file: at, sig: look(at)!.sig, sha, auto, fileTitle: title, fileVersion: version, outside: 0, adopted });
      invalidateGit(at);
      return at;
    } finally {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
    }
  }

  /** A LaTeX project's folder: its main text, files and pictures written into it; what else is in it stays. */
  private async writeFolder(row: Row, target: string): Promise<string | 'again'> {
    const { db } = this.d;
    const cur = readRow(db, 'page', row.id)!;
    const parts = texParts(db, readTex(pageSource(db, row.id)!.text));
    const before = row.fileVersion ? pageSource(db, row.id, row.fileVersion) : null;
    const was = before ? readTex(before.text) : null;
    if (this.changedMeanwhile(row)) return 'again';
    // The folder there is the thing's own, or it is made new.
    const into = row.file === target && isDir(target) ? target : null;
    const dir = into ?? tmpIn(path.dirname(target));
    fs.mkdirSync(dir, { recursive: true });
    for (const p of parts) {
      const file = path.join(dir, p.name);
      if (!within(dir, file)) continue;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (!within(real(dir), real(path.dirname(file)))) continue;
      const tmp = tmpIn(path.dirname(file));
      fs.writeFileSync(tmp, p.data);
      fs.renameSync(tmp, file);
    }
    // The parts it no longer has.
    const gone = into && was ? [...was.files, ...was.pictures].map((f) => f.name).filter((n) => !parts.some((p) => p.name === n)) : [];
    let at = target;
    if (!into) {
      if (exists(at)) at = freeAt(db, path.dirname(at), path.basename(at), '', { type: 'page', id: row.id });
      fs.renameSync(dir, at);
    }
    for (const name of gone) {
      const file = path.join(at, name);
      if (within(at, file) && exists(file)) await toTrash(file);
    }
    record(db, 'page', row.id, { file: at, sig: look(at)!.sig, sha: null, auto: row.file ? (row.auto ?? 0) : 1, fileTitle: cur.title, fileVersion: cur.version, outside: 0 });
    // After the record: a hash of what is there, for a later "changed or only touched?".
    const sha = await hashOf(at);
    if (readRow(db, 'page', row.id)?.file === at) record(db, 'page', row.id, { sha });
    invalidateGit(at);
    return at;
  }

  // ---- file to app ------------------------------------------------------------------------------------------------

  /** Reads in what was changed in a thing's file outside the app. 'later' while it may still be being written. */
  private async takeIn(row: Row): Promise<'none' | 'later' | 'done'> {
    const { db } = this.d;
    const file = row.file!;
    const seen = look(file);
    if (!seen || seen.sig === row.sig) return 'none';
    if (this.settleMs > 0 && Math.abs(Date.now() - seen.mtime) < this.settleMs) return 'later';
    const sha = await hashOf(file);
    // Only touched: the same bytes.
    if (sha === row.sha) {
      record(db, row.type, row.id, { sig: seen.sig });
      return 'none';
    }
    return row.type === 'page' ? this.takeInPage(row, seen, sha) : this.takeInMedia(row, seen, sha);
  }

  /** The outside file kept under another name; the thing's own is written anew. */
  private setAside(row: Row, why: string): 'done' {
    const { db } = this.d;
    const file = row.file!;
    // The user's own file (adopted) keeps its name and place: the item gets a new one beside it.
    if (row.adopted) {
      forget(db, row.type, row.id);
      console.warn(`[kept-files] ${file} was changed outside the app and could not be read back (${why}): left as it is`);
      this.place(row.type, row.id, path.dirname(file));
      return 'done';
    }
    const folder = isDir(file);
    const ext = folder ? '' : path.extname(file).slice(1);
    const stem = ext ? path.basename(file, `.${ext}`) : path.basename(file);
    const aside = freeAt(db, path.dirname(file), `${stem} (changed outside Hydor)${ext ? `.${ext}` : ''}`, ext, {});
    fs.renameSync(file, aside);
    invalidateGit(file);
    record(db, row.type, row.id, { sig: null, sha: null, fileVersion: null, outside: 0 });
    console.warn(`[kept-files] ${file} was changed outside the app and could not be read back (${why}): kept as ${path.basename(aside)}`);
    this.changed(row.type, row.id);
    return 'done';
  }

  private async takeInPage(row: Row, seen: Look, sha: string): Promise<'none' | 'later' | 'done'> {
    const { db } = this.d;
    let got: { html: string } | { model: unknown };
    try {
      got = await readBack(db, row, row.file!, seen.dir);
    } catch (e) {
      if (look(row.file!)?.sig !== seen.sig) return 'later';
      const now = readRow(db, 'page', row.id);
      return now?.file === row.file ? this.setAside(now, (e as Error).message) : 'none';
    }
    if (look(row.file!)?.sig !== seen.sig) return 'later';
    const now = readRow(db, 'page', row.id);
    if (!now || now.file !== row.file) return 'none';
    const cur = pageSource(db, row.id)!;
    let text: string;
    try {
      text = 'html' in got ? checkHtml(got.html) : mustKind(now.kind).keep(db, got.model).text;
    } catch (e) {
      return this.setAside(now, (e as Error).message);
    }
    const same = { sig: seen.sig, sha };
    if (text === cur.text) {
      record(db, 'page', row.id, { ...same, fileVersion: cur.version });
      return 'done';
    }
    // It says what it said when it was written: only the app has changed since.
    if (now.fileVersion && now.fileVersion !== cur.version && pageSource(db, row.id, now.fileVersion)?.text === text) {
      record(db, 'page', row.id, same);
      return 'done';
    }
    const content = (t: string) => (cur.kind === 'page' ? { html: t } : { model: mustKind(cur.kind).read(t) });
    const appChanged = now.fileVersion !== cur.version;
    let version: number;
    try {
      version = addVersion(db, row.id, { ...('html' in got ? { html: text } : { model: got.model }), by: 'file' }).version;
      // Both changed: the file's is kept as a version, and the app's goes on top of it again.
      if (appChanged) addVersion(db, row.id, { ...content(cur.text), by: 'restore' });
    } catch (e) {
      return this.setAside(now, (e as Error).message);
    }
    record(db, 'page', row.id, { ...same, outside: 1, ...(appChanged ? {} : { fileVersion: version }) });
    tell(this.d, 'page', row.id);
    refreshThumbs(this.d as Deps, [row.id]);
    if (appChanged) this.changed('page', row.id);
    return 'done';
  }

  private async takeInMedia(row: Row, seen: Look, sha: string): Promise<'none' | 'later' | 'done'> {
    const { db } = this.d;
    const m = getMedia(db, row.id)!;
    const file = row.file!;
    const ext = normalExt(path.extname(file));
    const MIME: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      avif: 'image/avif',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
      flac: 'audio/flac',
    };
    const mime = MIME[ext];
    const kind = mime?.split('/')[0];
    const facts = !seen.dir && kind === m.kind ? await mediaFacts(file, m.kind) : null;
    await fs.promises.mkdir(MEDIA_DIR, { recursive: true, mode: 0o700 });
    const tmp = path.join(MEDIA_DIR, `.${m.id}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
      if (facts) await fs.promises.copyFile(file, tmp);
      if (look(file)?.sig !== seen.sig) return 'later';
      const now = readRow(db, 'media', row.id);
      if (!now || now.file !== row.file) return 'none';
      if (!facts) return this.setAside(now, `it is not ${m.kind === 'image' ? 'a picture' : m.kind === 'video' ? 'a video' : 'a sound'} that can be read`);
      const was = (db.prepare('select sha from media where id = ?').get(m.id) as { sha: string | null }).sha ?? (await fileHash(filesOf(m).file).catch(() => null));
      if (was === sha) {
        record(db, 'media', row.id, { sig: seen.sig, sha });
        return 'done';
      }
      // The app's file changed since this one was written.
      const appChanged = !!now.sha && !!was && now.sha !== was;
      if (was) db.prepare('update media set sha = ? where id = ?').run(was, m.id);
      const before = (db.prepare('select max(version) as n from media_versions where media_id = ?').get(m.id) as { n: number | null }).n ?? 0;
      await keepEarlierVersion(db, m);
      const name = `${m.id}.${ext}`;
      const to = path.join(MEDIA_DIR, name);
      await fs.promises.rename(tmp, to);
      if (path.resolve(m.file) !== path.resolve(to)) await fs.promises.rm(m.file, { force: true });
      const { size } = await fs.promises.stat(to);
      db.prepare('update media set file = ?, mime = ?, bytes = ?, width = ?, height = ?, duration = ?, peaks = ?, sha = ?, who = null, updated_at = ? where id = ?').run(
        name,
        mime,
        size,
        facts.width ?? null,
        facts.height ?? null,
        facts.duration ?? null,
        facts.peaks?.length ? JSON.stringify(facts.peaks) : null,
        sha,
        Date.now(),
        m.id,
      );
      await remakeStills(getMedia(db, m.id)!);
      // The file holds these bytes now: when the app's are others again (below), it is written anew.
      record(db, 'media', row.id, { sig: seen.sig, sha });
      // Both changed: the file's is kept as a version, and the app's is the one shown again.
      const kept = (db.prepare('select max(version) as n from media_versions where media_id = ?').get(m.id) as { n: number | null }).n ?? 0;
      if (appChanged && kept > before) await restoreMediaVersion(this.d, m.id, kept);
      tell(this.d, 'media', m.id);
      mediaChanged(m.id);
      return 'done';
    } finally {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
    }
  }

  /** One look at every file: changed ones are read back, ones gone twice in a row forgotten. */
  async sweep(): Promise<void> {
    if (this.sweeping || this.stopped) return;
    this.sweeping = true;
    const runs: Promise<unknown>[] = [];
    try {
      const { db } = this.d;
      let n = 0;
      for (const type of ['page', 'media'] as KeptType[]) {
        const ids = db.prepare(`select id from ${table(type)} where project_file is not null`).all() as { id: string }[];
        for (const { id } of ids) {
          if (++n % 200 === 0) await new Promise((r) => setImmediate(r));
          const key = keyOf(type, id);
          if (this.timers.has(key) || this.queued.has(key) || this.running === key) continue;
          const row = readRow(db, type, id);
          if (!row?.file) continue;
          const root = folderOf(db, row.space);
          const seen = look(row.file);
          if (!seen) {
            // A project's folder that is not there (a disk not mounted): nothing is concluded from it.
            if (row.space && (!root || !isDir(root))) continue;
            const misses = (this.misses.get(key) ?? 0) + 1;
            if (misses < 2) this.misses.set(key, misses);
            else {
              this.misses.delete(key);
              forget(db, type, id, true);
              tell(this.d, type, id);
            }
            continue;
          }
          this.misses.delete(key);
          if (this.stuck.get(key) === seen.sig) continue;
          const elsewhere = !row.space || (!!root && isDir(root) && !within(root, row.file));
          const edited = seen.sig !== row.sig && (this.settleMs <= 0 || Math.abs(Date.now() - seen.mtime) >= this.settleMs);
          if (elsewhere || edited) runs.push(this.run(type, id));
        }
      }
      await Promise.all(runs);
    } catch (e) {
      console.error(`[kept-files] ${(e as Error)?.message ?? e}`);
    } finally {
      this.sweeping = false;
    }
  }

  /** A kept picture, video or sound saved from a file in its project's folder, still as it was: that file is its file. */
  private async adoptSource(row: Row, root: string): Promise<boolean> {
    const { db } = this.d;
    const m = db.prepare('select source, bytes, sha from media where id = ?').get(row.id) as { source: string | null; bytes: number; sha: string | null };
    const source = m.source && path.isAbsolute(m.source) ? path.resolve(m.source) : null;
    if (!source || !within(root, source)) return false;
    const st = fs.lstatSync(source, { throwIfNoEntry: false });
    if (!st?.isFile() || st.size !== m.bytes) return false;
    // The same size, and the same bytes: another picture written there since is not taken for it.
    const sha = await fileHash(source);
    if (sha !== (m.sha ?? (await fileHash(filesOf(getMedia(db, row.id)!).file)))) return false;
    return adopt(db, row.id, source, sha);
  }

  /** Everything that should have a file and has none gets one, one at a time; what changed while the app was off is written. */
  async backfill(): Promise<{ written: number; adopted: number; failed: number }> {
    const out = { written: 0, adopted: 0, failed: 0 };
    const { db } = this.d;
    const todo: [KeptType, string][] = [];
    try {
      const pages = db
        .prepare(
          `select id from pages where app is null and coalesce(kind, '') != 'board' and (
             (space is not null and project_file is null and coalesce(project_file_sig, '') != 'gone')
             or (project_file is not null and (space is null or project_file_version is not version or project_file_title is not title)))`,
        )
        .all() as { id: string }[];
      const media = db
        .prepare(
          `select id from media where (space is not null and project_file is null and coalesce(project_file_sig, '') != 'gone')
             or (project_file is not null and (space is null or project_file_sha is not sha or project_file_title is not title))`,
        )
        .all() as { id: string }[];
      todo.push(...pages.map((r): [KeptType, string] => ['page', r.id]), ...media.map((r): [KeptType, string] => ['media', r.id]));
    } catch (e) {
      console.error(`[kept-files] ${(e as Error)?.message ?? e}`);
    }
    for (const [type, id] of todo) {
      if (this.stopped) break;
      const r = await this.run(type, id, { adopt: true });
      if (r !== 'none') out[r]++;
      if (this.backfillGapMs > 0) await new Promise((ok) => setTimeout(ok, this.backfillGapMs).unref());
    }
    if (out.written || out.adopted || out.failed) console.log(`[kept-files] files in projects’ folders: ${out.written} written, ${out.adopted} already there, ${out.failed} could not be written`);
    return out;
  }
}

let engine: Engine | null = null;
let listening = false;

/** Starts keeping files in step (once for the app's database; the pages and media features both ask). */
export function startKeptFiles(d: Heard, o: KeptFilesOptions = {}) {
  if (engine && engine.d.db === d.db && !engine.stopped) return engine;
  engine?.stop();
  engine = new Engine(d, o);
  if (!listening) {
    listening = true;
    onPageChange((id, kind, what) => {
      if (kind === null) engine?.gone('page', id, what?.gone);
      else engine?.changed('page', id, { rewrite: what?.data });
    });
    onMediaChange((id, what) => {
      if (what && 'gone' in what) engine?.gone('media', id, what.gone);
      else engine?.changed('media', id);
    });
    onPlaceChange((t, id) => engine?.changed(t === 'pages' ? 'page' : 'media', id));
  }
  return engine;
}

/** The folder a request asked a thing's file to go in (checkProjectDir): written there, or moved there. */
export function placeKeptFile(type: KeptType, id: string, dir: string) {
  engine?.place(type, id, dir);
}

/**
 * Brings a thing's file up to date at once and waits for it, at most `waitMs`: its path, or `pending` when it is
 * still being written. Nothing of either when it has no file.
 */
export async function keptFileNow(type: KeptType, id: string, waitMs = 10_000): Promise<{ path?: string; pending?: boolean }> {
  const e = engine;
  if (!e || e.stopped) return {};
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'pending'>((r) => (timer = setTimeout(() => r('pending'), waitMs)));
  const done = await Promise.race([e.run(type, id), timeout]);
  clearTimeout(timer);
  if (done === 'pending') return { pending: true };
  const file = readRow(e.d.db, type, id)?.file;
  return file ? { path: file } : {};
}

function adopt(db: DB, id: string, file: string, sha: string): boolean {
  const row = readRow(db, 'media', id);
  if (!row || row.file) return false;
  const root = rootFor(db, row);
  const at = path.resolve(file);
  const seen = look(at);
  if (!root || !seen || seen.dir || !within(root, at) || within(config.dataDir, at) || !fs.lstatSync(at).isFile() || !within(real(root), real(at)) || claimed(db, at)) return false;
  record(db, 'media', id, { file: at, sig: seen.sig, sha, auto: 0, fileTitle: row.title, adopted: 1 });
  return true;
}

/**
 * A kept thing whose file came with its project's folder (a project sent from another machine): the file becomes its own,
 * as the app left it, so nothing is written again and later changes to it are read back in. False when the thing or the
 * file is not there. `sha`: the file's bytes' hash as the sending app recorded it (a media item's own hash; null: not known).
 */
export function attachKeptFile(db: DB, type: KeptType, id: string, f: { file: string; sha: string | null; auto: number; fileTitle: string | null; adopted?: boolean }): boolean {
  const row = readRow(db, type, id);
  const seen = look(f.file);
  if (!row || !seen) return false;
  record(db, type, id, { file: f.file, sig: seen.sig, sha: f.sha, auto: f.auto, fileTitle: f.fileTitle ?? row.title, ...(type === 'page' ? { fileVersion: row.version, outside: 0 } : { adopted: f.adopted ? 1 : 0 }) });
  return true;
}

/** A file kept from inside its project's folder is its file: no copy is made of it. */
export function adoptKeptMedia(db: DB, id: string, file: string, sha: string): boolean {
  return !!engine && !engine.stopped && adopt(db, id, file, sha);
}

// ---- what the user did in Files ------------------------------------------------------------------------------------

/** What every path inside a folder is between (SQLite compares them byte by byte). */
function insideRange(dir: string): [string, string] {
  const prefix = withSep(dir);
  return [prefix, prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)];
}

/** The things whose file is `p`, or is inside it. */
function underPath(db: DB, p: string): { type: KeptType; id: string; file: string }[] {
  return (['page', 'media'] as KeptType[]).flatMap((type) => {
    try {
      const rows = db.prepare(`select id, project_file as file from ${table(type)} where project_file = ? or (project_file >= ? and project_file < ?)`).all(p, ...insideRange(p)) as { id: string; file: string }[];
      return rows.map((r) => ({ type, ...r }));
    } catch {
      return [];
    }
  });
}

/** A LaTeX project's folder with something renamed or removed inside it is read again at the next look. */
function lookAgain(db: DB, p: string) {
  for (let dir = path.dirname(p); dir !== path.dirname(dir); dir = path.dirname(dir)) db.prepare("update pages set project_file_sig = 'changed' where project_file = ? and kind = 'tex'").run(dir);
}

function setSpace(db: DB, type: KeptType, id: string, space: string | null) {
  db.prepare(`update ${table(type)} set space = ? where id = ?`).run(space, id);
  fitFolder(db, table(type), id);
}

/** Files or folders renamed or moved in Files (`from` and `to`: whole paths): things whose files they are follow. */
export function keptFilesMoved(d: Heard, from: string, to: string) {
  const { db } = d;
  if (from === to) return;
  for (const { type, id, file } of underPath(db, from)) {
    const row = readRow(db, type, id)!;
    const at = file === from ? to : to + file.slice(from.length);
    const itself = file === from;
    const named = itself && path.basename(from) !== path.basename(to);
    const own = folderOf(db, row.space);
    let space = row.space;
    // The project's own folder moved (or one holding it): the project is as it was, only its folder is elsewhere.
    if (!(own && within(from, own)) && !(own && within(own, at))) {
      const other = allSpaces(db)
        .filter((s) => s.folder && within(path.resolve(s.folder), at))
        .sort((a, b) => path.resolve(b.folder).length - path.resolve(a.folder).length)[0];
      space = other?.id ?? null;
    }
    if (space !== row.space) setSpace(db, type, id, space);
    // Renamed to another kind of file: it is a plain file now, and the thing gets one of its own at its next change.
    const otherKind = named && !isDir(to) && normalExt(path.extname(from)) !== normalExt(path.extname(to));
    if (!space) forget(db, type, id);
    else if (otherKind) forget(db, type, id, true);
    else record(db, type, id, { file: at, ...(named ? { auto: 0 } : {}) });
    tell(d, type, id);
  }
  lookAgain(db, from);
  lookAgain(db, to);
}

/** Files or folders deleted in Files: things whose files they were leave their project (they are not deleted). */
export function keptFilesDeleted(d: Heard, p: string) {
  const { db } = d;
  for (const { type, id } of underPath(db, p)) {
    setSpace(db, type, id, null);
    forget(db, type, id);
    tell(d, type, id);
  }
}

/** A listing's entries that are kept things' files say which (one query for the folder). */
export function annotateKept(db: DB, dir: string, entries: FsEntry[]) {
  const [prefix, after] = insideRange(dir);
  let rows: { type: KeptType; id: string; title: string; kind: string; url: string | null; file: string }[];
  try {
    rows = db
      .prepare(
        `select 'page' as type, id, title, coalesce(kind, 'page') as kind, source_url as url, project_file as file from pages where project_file >= ? and project_file < ?
         union all select 'media', id, title, kind, null, project_file from media where project_file >= ? and project_file < ?`,
      )
      .all(prefix, after, prefix, after) as typeof rows;
  } catch {
    return;
  }
  const by = new Map(rows.map((r) => [r.file, r]));
  for (const e of entries) {
    const r = by.get(e.path);
    if (r) e.kept = { type: r.type, id: r.id, title: r.title, kind: (r.url ? 'web' : r.kind) as KeptFileRef['kind'] };
  }
  // Inside a LaTeX document's own folder, its main file is the document: it opens in the LaTeX editor, as the folder's
  // badge says, rather than as a file of its own (which would be an edit from outside).
  try {
    const tex = db.prepare(`select id, title from pages where kind = 'tex' and project_file = ?`).get(path.resolve(dir)) as { id: string; title: string } | undefined;
    const main = tex && entries.find((e) => e.name === TEX_MAIN && e.type === 'file');
    if (tex && main) main.kept = { type: 'page', id: tex.id, title: tex.title, kind: 'tex' };
  } catch {}
}

/** For an agent, about a page it saved in a project: its file there. */
export async function keptFileNote(page: Pick<PageInfo, 'id' | 'space'>, waitMs?: number): Promise<string[]> {
  if (!page.space) return [];
  const f = await keptFileNow('page', page.id, waitMs);
  if (f.pending) return ['Its file in the project’s folder is being written.'];
  return f.path ? [`Its file in the project’s folder: ${f.path}`] : [];
}
