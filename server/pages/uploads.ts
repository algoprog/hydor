// Files dropped on the Library, or picked with Upload files, each made what it is: a document, a spreadsheet, slides, a
// LaTeX document or a notebook as the import makes them (POST /api/pages/import, called in this process, so it takes
// what that route takes, a PowerPoint file once it takes one); a picture, a video or a sound kept as the Library's media
// (the same bytes kept once); any other file, dropped on a project, put in the project's folder, where Files shows it.
//
// A browser sends a file's bytes as they are, a piece at a time and in order (no proxy's limit on a request's size stops
// a large one): POST /api/library/uploads says what is coming and gets the upload's id, each PUT …/:id?offset= adds a
// piece, and the last one answers what the file became. Nothing is taken that cannot be kept: a file's kind and size are
// checked before its first byte, and the room on the disk.
//
// The desktop app moves a dropped file in by its path instead (POST /api/library/move), as a move between folders
// does: a picture, a video or a sound into the Library's own folder, another file into the project's folder (renamed on
// the same disk, else copied, checked whole and removed: server/filemove.ts), and a file the Library made a page of to
// the app's Trash, where Put back brings it back; unless the page could not keep all of it, when the original stays and
// the answer says why. A file of the app's own data, of the system or of a project's folder is not moved: the page sends
// a copy instead. Nothing is written outside the app's data and the project's folder.
//
//   POST   /api/library/uploads           { name, size, space?, rel? }        → UploadStarted
//   PUT    /api/library/uploads/:id?offset=  a piece's bytes                  → { received } | { done: FileAdded }
//   DELETE /api/library/uploads/:id                                           → { ok }
//   POST   /api/library/move              { path, space?, rel?, root? }       → FileAdded
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyRequest } from 'fastify';
import type { FileAdded, FileBecomes, FileRefused, MoveRefused, UploadStarted } from '../../shared/library-files.ts';
import type { PageInfo } from '../../shared/pages.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT, config } from '../config.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { claimName, fileHash, moveWhole } from '../filemove.ts';
import { deletePath, invalidateGit, trashCopy } from '../files.ts';
import { internalHeaders } from '../internal.ts';
import { keepFile, MAX_MEDIA, mediaTypeOf } from '../media/index.ts';
import { isAbsPath } from '../platform.ts';
import { spaceChoice } from '../spaces/choice.ts';
import { allSpaces, spaceById } from '../spaces/index.ts';
import { readDoc, wordLosses } from './docs.ts';
import { kindForFile, kindOf, type PageKind } from './kinds.ts';
import { importBook } from './sheets.ts';
import { pageSource } from './store.ts';

const MB = 1024 * 1024;
/** The most a piece of an upload carries: well under the 100 MB a proxy such as Cloudflare's lets through. */
export const PIECE = 32 * MB;
/** The largest file the import makes a page of (what POST /api/pages/import reads). */
export const IMPORT_MAX = 30 * MB;
/** Uploads open at once, across every page and device. */
const MAX_OPEN = 200;
/** An upload no piece came to for this long is dropped (the page was closed meanwhile). */
const IDLE = 60 * 60_000;

const dir = () => path.join(config.dataDir, 'library-uploads');

// ---- names and what a file becomes ----------------------------------------------------------------------------

/** A file's name as it may be written to a disk here: no folders, no control characters, and nothing Windows forbids there. */
function cleanName(v: unknown): string {
  let s = String(v ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 200);
  if (process.platform === 'win32') s = s.replace(/[<>:"|?*]/g, '_').replace(/[. ]+$/, '');
  return s === '.' || s === '..' ? '' : s;
}

function fileName(v: unknown): string {
  const name = cleanName(v);
  if (!name) throw new HttpError(400, 'name: the file’s name');
  return name;
}

/** Where a file goes in a project's folder: its place in the folder it was dropped in ("Receipts/june.pdf"), or its name. */
function relPath(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v.trim()) return name;
  const parts = v.split(/[\\/]+/).filter(Boolean);
  if (parts.length > 32 || parts.some((p) => p === '..')) throw new HttpError(400, 'rel: the file’s place in the folder it was dropped in, inside it');
  const clean = parts.slice(0, -1).map(cleanName).filter((p) => p && p !== '.');
  return [...clean, name].join('/');
}

interface Plan {
  as: FileBecomes;
  kind?: PageKind;
}

const isPptx = (name: string) => /\.pptx$/i.test(name);

/** The kinds of file the Library keeps, in words (PowerPoint's once the import takes it). */
function keptKinds(): string {
  const slides = kindForFile('a.pptx') === 'slides' ? ' slides (PowerPoint),' : '';
  return `The Library keeps documents (Word, Markdown, text, web pages), spreadsheets (Excel, OpenDocument, CSV),${slides} LaTeX, Jupyter notebooks, pictures, videos and sounds`;
}

const refused = (status: number, message: string, why: FileRefused) => new HttpError(status, message, { why });

/**
 * What a file becomes, by its name and size: a page of its kind (a PowerPoint file too: the import says at the end
 * whether it takes one), a picture, a video or a sound, or in a project a file in its folder (also one too large to
 * become a page); out of a project, anything else is refused.
 */
function planFor(name: string, size: number, space: string | null): Plan {
  const kind = kindForFile(name) ?? (isPptx(name) ? 'slides' : null);
  if (kind && size <= IMPORT_MAX) return { as: 'page', kind };
  const media = mediaTypeOf(name);
  if (media && size <= MAX_MEDIA) return { as: media.kind };
  if (space) return { as: 'file' };
  const elsewhere = 'Drop it on a project to keep it in the project’s folder.';
  if (kind) throw refused(413, `It is over ${IMPORT_MAX / MB} MB, more than the Library takes to make a ${kindOf(kind)?.noun ?? 'page'} of. ${elsewhere}`, 'size');
  if (media) throw refused(413, `It is over ${MAX_MEDIA / MB / 1024} GB, more than the Library keeps of a picture, a video or a sound. ${elsewhere}`, 'size');
  throw refused(415, `${keptKinds()}. To keep another kind of file, drop it on a project: it goes in the project’s folder.`, 'kind');
}

/** The folder itself, or the nearest folder holding it that is there (a project's folder may not be made yet). */
function nearest(p: string): string {
  let d = path.resolve(p);
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  return d;
}

/** Refuses a file the disk where `at` is has no room for (with some to spare). */
async function roomFor(size: number, at: string) {
  const st = await fs.promises.statfs(nearest(at)).catch(() => null);
  if (!st) return;
  const free = Number(st.bavail) * Number(st.bsize);
  if (size + 64 * MB > free) throw refused(507, `There is not enough room for it on this computer’s disk (${Math.max(0, Math.floor(free / MB))} MB free).`, 'room');
}

/** Refuses a file moving to `to` from another disk that has no room for it there (on its own disk it is only renamed). */
async function roomToMove(file: string, size: number, to: string) {
  const a = fs.statSync(file, { throwIfNoEntry: false })?.dev;
  const b = fs.statSync(nearest(to), { throwIfNoEntry: false })?.dev;
  if (a === undefined || a !== b) await roomFor(size, to);
}

// ---- what a file becomes, once it is here ----------------------------------------------------------------------

/** The import route, in this process: a page of the file at `file`, or why not (its status and words). */
async function importPage(d: Deps, file: string, space: string | null): Promise<{ page: PageInfo; notes: string[] } | { status: number; error: string }> {
  const r = await d.app.inject({
    method: 'POST',
    url: '/api/pages/import',
    payload: JSON.stringify({ path: file, space }),
    headers: { ...internalHeaders(), 'content-type': 'application/json' },
  });
  let body: { page?: PageInfo; notes?: string[]; error?: string } = {};
  try {
    body = r.json();
  } catch {}
  if (r.statusCode >= 400 || !body.page) return { status: r.statusCode, error: body.error ?? `The import answered ${r.statusCode}` };
  return { page: body.page, notes: Array.isArray(body.notes) ? body.notes.map(String) : [] };
}

/**
 * A file the import would not make a page of: in a project, it goes in the project's folder like any other file (with
 * the import's words when it could not read it; a .zip that is no LaTeX project, or a kind it does not take, needs none).
 */
function notPage(name: string, r: { status: number; error: string }, space: string | null): string[] {
  if (!space) {
    if (r.status === 400) throw refused(415, `${keptKinds()}. To keep another kind of file, drop it on a project: it goes in the project’s folder.`, 'kind');
    if (/\.zip$/i.test(name)) throw refused(415, 'The Library keeps a .zip as a LaTeX project, and this one holds no LaTeX document. To keep it as it is, drop it on a project: it goes in the project’s folder.', 'kind');
    throw new HttpError(r.status === 413 ? 413 : 422, r.error);
  }
  return r.status === 400 || /\.zip$/i.test(name) ? [] : [r.error];
}

/** Puts a file in a project's folder (at its place in the folder it was dropped in), under a name nothing there has yet. */
async function intoProject(db: DB, file: string, space: string, rel: string): Promise<string> {
  const s = spaceById(db, space);
  if (!s) throw new HttpError(404, 'That project is gone');
  const root = path.resolve(s.folder);
  const want = path.resolve(root, rel);
  if (!want.startsWith(root + path.sep)) throw new HttpError(400, 'rel: a place inside the folder it was dropped in');
  await fs.promises.mkdir(path.dirname(want), { recursive: true });
  // Nor through a link in the project's folder to a folder elsewhere.
  if (!within(real(root), real(path.dirname(want)))) throw new HttpError(400, 'That place in the project’s folder is a link to a folder outside it');
  const to = await claimName(path.dirname(want), path.basename(want));
  await moveWhole(file, to);
  invalidateGit(to);
  return to;
}

interface Upload {
  id: string;
  name: string;
  rel: string;
  size: number;
  space: string | null;
  plan: Plan;
  got: number;
  at: number;
  busy: boolean;
}

const uploads = new Map<string, Upload>();
const partOf = (id: string) => path.join(dir(), `${id}.part`);

/** An upload whose bytes are all here, at `file` (named as it was), made what it is. */
async function finishUpload(d: Deps, u: Upload, file: string): Promise<FileAdded> {
  const space = u.space ?? undefined;
  if (u.plan.as === 'page') {
    const r = await importPage(d, file, u.space);
    if ('page' in r) return { as: 'page', page: r.page, space, notes: r.notes };
    const notes = notPage(u.name, r, u.space);
    return { as: 'file', path: await intoProject(d.db, file, u.space!, u.rel), space, notes };
  }
  if (u.plan.as !== 'file') {
    const { item, existed } = await keepFile(d, { path: file, space: u.space }, { move: true, source: u.name });
    return { as: 'media', item, existed, space: item.space, notes: [] };
  }
  return { as: 'file', path: await intoProject(d.db, file, u.space!, u.rel), space, notes: [] };
}

// ---- moving a file in by its path (the desktop app) --------------------------------------------------------------

const folded = process.platform === 'darwin' || process.platform === 'win32';
const fold = (p: string) => (folded ? p.toLowerCase() : p);
/** Whether `p` is `root` or inside it. */
const within = (root: string, p: string) => {
  const r = fold(root.replace(/[\\/]+$/, ''));
  const q = fold(p);
  return q === r || q.startsWith(r + path.sep);
};
const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/** Folders of the system and of programs: what they hold is not the user's to move. */
function systemRoots(): string[] {
  if (process.platform === 'win32') {
    const e = process.env;
    return [e.SystemRoot || 'C:\\Windows', e.ProgramFiles || 'C:\\Program Files', e['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', e.ProgramData || 'C:\\ProgramData'];
  }
  const roots = ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib32', '/lib64', '/libx32', '/opt', '/proc', '/root', '/run', '/sbin', '/snap', '/srv', '/sys', '/usr', '/var'];
  return process.platform === 'darwin' ? [...roots, '/System', '/Library', '/Applications', '/cores', '/private/etc', '/private/var'] : roots;
}

/** Why a file here is not moved (it gets copied instead): it is in a project's folder, the app's own, or the system's; or none. */
function placeRefused(db: DB, p: string): MoveRefused | null {
  if (allSpaces(db).some((s) => s.folder && within(real(s.folder), p))) return 'project';
  const app = process.env.HYDOR_DESKTOP_APP;
  const own = [config.dataDir, APP_ROOT, ...(app ? [process.platform === 'win32' ? path.dirname(app) : app] : [])];
  if (own.some((r) => within(real(r), p))) return 'data';
  // A home folder is the user's, wherever the system keeps it (/var/home on some Linux systems).
  if (within(real(os.homedir()), p)) return null;
  if (process.platform !== 'win32' && path.dirname(p) === '/') return 'system';
  // Linux's shared memory folder is a folder for files of the moment, as /tmp is.
  if (process.platform === 'linux' && within('/dev/shm', p)) return null;
  return systemRoots().some((r) => within(real(r), p)) ? 'system' : null;
}

const NOT_MOVED: Record<MoveRefused, string> = {
  project: 'It is in a project’s folder, so it stays there: a copy goes into the Library instead.',
  data: 'It is in the app’s own folders, so it stays there: a copy goes into the Library instead.',
  system: 'It is in a folder of the system’s, so it stays there: a copy goes into the Library instead.',
  link: 'It is a link to a file, so it stays where it is: a copy of the file goes into the Library instead.',
};

/** The file at an absolute path, as it may be moved in: one that is there, a file (not a folder or a link), not in a place refused. */
async function movable(db: DB, v: unknown): Promise<string> {
  if (typeof v !== 'string' || !v.trim() || !isAbsPath(v.trim())) throw new HttpError(400, 'path: the file’s absolute path on this computer');
  const p = path.resolve(v.trim());
  const st = await fs.promises.lstat(p).catch(() => null);
  if (!st) throw new HttpError(404, `Not found: ${p}`);
  if (st.isSymbolicLink()) throw new HttpError(403, NOT_MOVED.link, { copy: 'link' });
  if (!st.isFile()) throw new HttpError(400, 'Only a file is moved in: send each file of a folder by its own path');
  const file = path.join(real(path.dirname(p)), path.basename(p));
  const why = placeRefused(db, file);
  if (why) throw new HttpError(403, NOT_MOVED[why], { copy: why });
  return file;
}

/** Folders a person keeps things in, which stay even when a drop emptied them (their own Downloads, Desktop…). */
const KEEP = new Set(['desktop', 'documents', 'downloads', 'pictures', 'photos', 'movies', 'music', 'videos', 'public', 'templates', 'library', 'applications', 'dropbox', 'onedrive', 'google drive', 'icloud drive']);

/** The folder a dropped file came in (to remove once the drop emptied it), checked as `movable` checks a file; null to keep it. */
async function droppedFolder(db: DB, v: unknown, file: string): Promise<string | null> {
  if (typeof v !== 'string' || !v.trim() || !isAbsPath(v.trim())) return null;
  const root = real(path.resolve(v.trim()));
  if (!within(root, file) || fold(root) === fold(file) || !(await fs.promises.stat(root).catch(() => null))?.isDirectory()) return null;
  if (fold(root) === fold(real(os.homedir())) || path.parse(root).root === root || KEEP.has(path.basename(root).toLowerCase()) || placeRefused(db, root)) return null;
  return root;
}

/** What a folder may still hold and be taken for empty: what systems leave in folders by themselves. */
const LEFT_BY_SYSTEMS = (n: string) => n === '.DS_Store' || n === 'Thumbs.db' || n === 'desktop.ini' || n === '.localized' || n.startsWith('._');

/** A folder of a drop, from the one a file left up to the folder dropped: each goes once it holds nothing of the user's. */
async function dropEmpty(from: string, root: string) {
  for (let d = from; within(root, d); d = path.dirname(d)) {
    const names = await fs.promises.readdir(d).catch(() => null);
    if (!names || names.some((n) => !LEFT_BY_SYSTEMS(n))) return;
    for (const n of names) await fs.promises.rm(path.join(d, n), { force: true }).catch(() => {});
    if (!(await fs.promises.rmdir(d).then(() => true, () => false))) return;
    if (fold(d) === fold(root)) return;
  }
}

/**
 * The original of a file the Library made a page of, to the app's Trash (where Put back brings it back): moved there,
 * or from another disk copied there, checked whole, and removed. Returns where it is in the Trash.
 */
async function toTrash(file: string): Promise<string> {
  try {
    const r = await deletePath(file);
    if (r.trashed) return r.trashed;
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e;
  }
  const copy = await trashCopy(file);
  if ((await fileHash(copy)) !== (await fileHash(file))) {
    await fs.promises.rm(copy, { force: true });
    throw new Error('The copy in the Trash did not come out whole');
  }
  await fs.promises.rm(file);
  return copy;
}

/** A LaTeX file that reads others of its folder: its chapters, pictures, bibliography, styles. */
const readsOthers = (tex: string) => /\\(?:input|include|subfile|import|subimport|includegraphics|includepdf|lstinputlisting|bibliography|addbibresource|usepackage\{\.)/.test(tex.replace(/(^|[^\\])%.*$/gm, '$1'));

/** A Markdown or HTML file that shows pictures of its folder (by a path, not an address on the web or inside it). */
const showsOwnPictures = (text: string) => /!\[[^\]]*\]\(\s*<?(?!https?:|data:)[^)\s]+/.test(text) || /<img\b[^>]*\bsrc\s*=\s*["']?(?!https?:|data:)[^"'\s>]+/i.test(text);

/**
 * What the page made of a file could not keep of it, as Files' editors name it (a Word file's "headers", "footnotes"…,
 * an Excel file's "charts"…), and 'cut' (it did not all fit), 'files' or 'pictures' (it reads others of its folder).
 * When it cannot tell, 'cut': the original is better kept.
 */
async function lostOf(db: DB, file: string, page: PageInfo): Promise<string[]> {
  const name = path.basename(file);
  try {
    if (page.kind === 'doc' && /\.(docx|docm|dotx)$/i.test(name)) {
      const w = wordLosses(await fs.promises.readFile(file), readDoc(pageSource(db, page.id)!.text));
      return [...w.loses, ...(w.cut ? ['cut'] : [])];
    }
    if (page.kind === 'doc' && /\.(md|markdown|html?)$/i.test(name)) return showsOwnPictures(await fs.promises.readFile(file, 'utf8')) ? ['pictures'] : [];
    if (page.kind === 'sheet') {
      const b = importBook(await fs.promises.readFile(file), name);
      return [...(b.loses ?? []), ...(b.cut ? ['cut'] : [])];
    }
    if (page.kind === 'tex' && /\.(tex|ltx)$/i.test(name)) return readsOthers(await fs.promises.readFile(file, 'utf8')) ? ['files'] : [];
  } catch {
    return ['cut'];
  }
  return [];
}

/** Whether a file moved left its place: a copy to another disk whose original could not be removed did not (and says so). */
function left(file: string, done: FileAdded): FileAdded {
  if (!fs.existsSync(file)) return { ...done, moved: true };
  return { ...done, moved: false, stayed: true, notes: [...done.notes, 'It was copied, but the original could not be removed from where it was.'] };
}

/** A file moved in by its path, made what it is; the original goes where the file went, or to the Trash, or stays (and why). */
async function moveIn(d: Deps, file: string, plan: Plan, space: string | null, rel: string): Promise<FileAdded> {
  const sp = space ?? undefined;
  if (plan.as === 'page') {
    const r = await importPage(d, file, space);
    if ('page' in r) {
      const lost = await lostOf(d.db, file, r.page);
      if (r.notes.length || lost.length) return { as: 'page', page: r.page, space: sp, notes: r.notes, stayed: true, lost };
      // The page is made: if the original cannot go to the Trash it stays, and the page with it.
      try {
        return { as: 'page', page: r.page, space: sp, notes: [], moved: true, trashed: await toTrash(file) };
      } catch (e) {
        return { as: 'page', page: r.page, space: sp, notes: [`The original could not go to the Trash: ${(e as Error).message}`], stayed: true, lost: [] };
      }
    }
    const notes = notPage(path.basename(file), r, space);
    return left(file, { as: 'file', path: await intoProject(d.db, file, space!, rel), space: sp, notes });
  }
  if (plan.as !== 'file') {
    const { item, existed } = await keepFile(d, { path: file, space }, { move: true, source: file });
    const done: FileAdded = { as: 'media', item, existed, space: item.space, notes: [] };
    return existed ? done : left(file, done);
  }
  return left(file, { as: 'file', path: await intoProject(d.db, file, space!, rel), space: sp, notes: [] });
}

// ---- the routes -----------------------------------------------------------------------------------------------------

/**
 * A piece's bytes added to the upload's file, counted as they come: no more than `limit` in all (the piece's share, the
 * file's size). What comes past it is read and let go a little way, so the refusal reaches the page rather than a broken
 * connection; much more, and the request is cut.
 */
async function takePiece(body: Readable, file: string, offset: number, limit: number, size: number): Promise<number> {
  const out = fs.createWriteStream(file, { flags: 'a' });
  let got = offset;
  try {
    for await (const chunk of body as AsyncIterable<Buffer>) {
      got += chunk.length;
      if (got > limit) {
        if (got > limit + 8 * MB) break;
        continue;
      }
      if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
    }
  } finally {
    await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
  }
  if (got > limit) throw new HttpError(413, got > size ? 'The file is larger than its upload said' : `A piece carries at most ${PIECE / MB} MB`, { received: offset });
  return got;
}

/** Uploads left behind: those idle an hour, and (at a start) every part from before. */
function sweep(all: boolean) {
  const old = Date.now() - IDLE;
  for (const u of uploads.values()) {
    if (u.busy || (!all && u.at > old)) continue;
    uploads.delete(u.id);
    fs.rmSync(partOf(u.id), { force: true });
  }
  if (!all) return;
  try {
    for (const n of fs.readdirSync(dir())) if (!uploads.has(n.replace(/\.part$/, ''))) fs.rmSync(path.join(dir(), n), { recursive: true, force: true });
  } catch {}
}

export function uploadRoutes(d: Deps) {
  const { app, db } = d;
  const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
  sweep(true);
  setInterval(() => sweep(false), 10 * 60_000).unref();

  /** A file about to be sent: what it will become, or why the Library cannot take it, before any of its bytes come. */
  app.post('/api/library/uploads', async (req): Promise<UploadStarted> => {
    const b = B(req);
    const name = fileName(b.name);
    const size = Number(b.size);
    if (!Number.isSafeInteger(size) || size < 0) throw new HttpError(400, 'size: the file’s size in bytes');
    const space = spaceChoice(db, b.space);
    const rel = relPath(b.rel, name);
    const plan = planFor(name, size, space);
    if (uploads.size >= MAX_OPEN) throw new HttpError(429, 'Too many files are on their way at once: send more once some have arrived');
    await fs.promises.mkdir(dir(), { recursive: true, mode: 0o700 });
    await roomFor(size, dir());
    // A file for a project's folder is copied there at the end when that folder is on another disk.
    const s = plan.as === 'file' && space ? spaceById(db, space) : null;
    if (s) await roomToMove(dir(), size, s.folder);
    const id = crypto.randomBytes(12).toString('hex');
    await fs.promises.writeFile(partOf(id), '');
    uploads.set(id, { id, name, rel, size, space, plan, got: 0, at: Date.now(), busy: false });
    return { upload: id, becomes: plan.as, ...(plan.kind ? { kind: plan.kind } : {}), piece: PIECE };
  });

  /** A piece of an upload, the bytes themselves, where the last one ended (`offset`); the last piece makes the file what it is. */
  app.put('/api/library/uploads/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    const u = uploads.get(id);
    if (!u) throw new HttpError(404, 'That upload is not here any more (it was cancelled, it finished, or the app restarted): send the file again');
    if (u.busy) throw new HttpError(409, 'A piece of it is still on its way', { received: u.got });
    const offset = Number((req.query as { offset?: string }).offset);
    if (offset !== u.got) throw new HttpError(409, `The pieces are out of step: ${u.got} bytes came before this one`, { received: u.got });
    const body = req.body as Readable | undefined;
    if (!body || typeof body.pipe !== 'function') throw new HttpError(400, 'Send the file’s bytes (application/octet-stream), a piece at a time');
    u.busy = true;
    u.at = Date.now();
    let got: number;
    try {
      got = await takePiece(body, partOf(id), offset, Math.min(u.size, offset + PIECE), u.size);
    } catch (e) {
      // What came of the broken piece goes, so it can be sent again from where the last whole one ended.
      await fs.promises.truncate(partOf(id), offset).catch(() => {});
      u.busy = false;
      throw e instanceof HttpError ? e : new HttpError(499, `The piece was cut off: ${(e as Error).message}`, { received: offset });
    }
    u.busy = false;
    u.got = got;
    u.at = Date.now();
    if (got < u.size) return { received: got };
    // All here: under its own name, in a folder of its own (the import names a page after its file).
    uploads.delete(id);
    const folder = path.join(dir(), id);
    try {
      await fs.promises.mkdir(folder, { recursive: true });
      const file = path.join(folder, u.name);
      await fs.promises.rename(partOf(id), file);
      return { done: await finishUpload(d, u, file) };
    } finally {
      await fs.promises.rm(folder, { recursive: true, force: true });
      await fs.promises.rm(partOf(id), { force: true });
    }
  });

  /** An upload given up on: what came of it goes. */
  app.delete('/api/library/uploads/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    if (uploads.delete(id)) await fs.promises.rm(partOf(id), { force: true });
    return { ok: true };
  });

  /**
   * A file the desktop app dropped, moved in by its path: what it became, and where the original went. Refused (403 with
   * `copy`, why) for a file the page should send a copy of instead.
   */
  app.post('/api/library/move', async (req): Promise<FileAdded> => {
    const b = B(req);
    const file = await movable(db, b.path);
    const space = spaceChoice(db, b.space);
    const name = path.basename(file);
    const rel = relPath(b.rel, name);
    const st = await fs.promises.stat(file);
    const plan = planFor(name, st.size, space);
    // Where it goes may be on another disk, which must have room for it: the Library's own folder, or the project's.
    const s = space ? spaceById(db, space) : null;
    if (plan.as !== 'page') await roomToMove(file, st.size, plan.as === 'file' ? s!.folder : config.dataDir);
    const root = await droppedFolder(db, b.root, file);
    const done = await moveIn(d, file, plan, space, rel);
    if (root && !fs.existsSync(file)) await dropEmpty(path.dirname(file), root);
    return done;
  });
}

