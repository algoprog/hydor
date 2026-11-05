// A folder of this computer brought into the Library (New → Import a folder): a LaTeX project (a folder whose top holds
// a whole document: \documentclass and \begin{document}) becomes one LaTeX document, its files and pictures in their
// folders (latex.ts texFromFolder: the files it uses first, within a document's limits); any other folder becomes a
// folder of the Library with its documents, spreadsheets, notebooks and LaTeX documents brought in as things in it,
// each as Open a file brings one in, and its folders as folders in it (a LaTeX project among them as one document). A
// folder that brings nothing in makes no folder. What is left out is said, file by file.
import fs from 'node:fs';
import path from 'node:path';
import type { FolderImport, FolderSkip } from '../../shared/pages.ts';
import { uncommented } from '../../shared/latex.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { resolvePath } from '../files.ts';
import { makeFolder, placeFor } from './folders.ts';
import { kindForFile, mustKind } from './kinds.ts';
import { texFromFolder, textOf } from './latex.ts';
import { createPage } from './store.ts';

/** At most this many things come in from one folder, each file this large at most, from folders this deep. */
const MAX_ITEMS = 300;
const MAX_FILE = 30 * 1024 * 1024;
const MAX_DEPTH = 6;
const MAX_LISTED = 4000;

const SKIP_DIRS = new Set(['node_modules', '__MACOSX', '__pycache__']);

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Why a file of no kind the Library keeps is left out, in a word. */
function whyNot(name: string): FolderSkip {
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|heic|heif|tiff?|ico|eps)$/i.test(name)) return 'picture';
  if (/\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(name)) return 'video';
  if (/\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(name)) return 'audio';
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (/\.(pptx?|pptm|potx|ppsx|odp|key)$/i.test(name)) return 'slides';
  return 'kind';
}

/** A LaTeX source that is a whole document (not a part of one: a chapter, a subfile). */
function wholeDocument(text: string): boolean {
  const t = text.slice(0, 400_000).split('\n').map(uncommented).join('\n');
  return /\\documentclass/.test(t) && /\\begin\s*\{document\}/.test(t) && !/\\documentclass\s*(\[[^\]]*\])?\s*\{subfiles\}/.test(t);
}

/** Whether a folder is a LaTeX project: a .tex file at its top that is a whole document. */
function texProjectAt(dir: string, files: string[]): boolean {
  for (const n of files) {
    if (!/\.(tex|ltx)$/i.test(n)) continue;
    const st = fs.statSync(path.join(dir, n), { throwIfNoEntry: false });
    if (st?.isFile() && st.size <= 2 * 1024 * 1024 && wholeDocument(textOf(fs.readFileSync(path.join(dir, n))))) return true;
  }
  return false;
}

/**
 * Brings a folder of this computer into the Library, into a folder of it (`folder`) or the top of a place (`space`: a
 * project's id, or none). The folders it makes are named as the folders were (with a number where a folder there has
 * the name).
 */
export async function importFolder(db: DB, dirIn: string, o: { space: string | null; folder: string | null; sessionKey?: string }): Promise<FolderImport> {
  const dir = resolvePath(dirIn);
  const st = fs.statSync(dir, { throwIfNoEntry: false });
  if (!st?.isDirectory()) throw new HttpError(404, `There is no folder ${dir}`);
  const top = placeFor(db, o.folder, o.space);
  const out: FolderImport = { pages: [], folders: 0, skipped: [], notes: [] };
  let listed = 0;
  const skip = (rel: string, why: FolderSkip) => out.skipped.length < 2000 && out.skipped.push({ path: rel, why });

  /** A LaTeX project's folder as one document, in the Library folder `parent` gives. */
  const texDocument = async (abs: string, rel: string, parent: () => string | null) => {
    if (out.pages.length >= MAX_ITEMS) return skip(rel || path.basename(abs), 'limit');
    let got: Awaited<ReturnType<typeof texFromFolder>>;
    try {
      got = await texFromFolder(abs);
    } catch (e) {
      out.notes.push(`${rel || path.basename(abs)}: ${(e as Error).message}`);
      return skip(rel || path.basename(abs), 'unreadable');
    }
    const page = createPage(db, { title: path.basename(abs), kind: 'tex', model: got.doc, by: 'made', sessionKey: o.sessionKey, space: top.space, folder: parent() });
    out.pages.push(page);
    for (const n of got.notes) out.notes.push(rel ? `${rel}: ${n}` : n);
  };

  /** A file as a thing of the Library, in the folder `parent` gives (made when the first thing comes). */
  const file = async (abs: string, rel: string, parent: () => string | null) => {
    const name = path.basename(abs);
    const kind = /\.zip$/i.test(name) ? null : kindForFile(name);
    if (!kind) return skip(rel, whyNot(name));
    if (out.pages.length >= MAX_ITEMS) return skip(rel, 'limit');
    const size = fs.statSync(abs).size;
    if (size > MAX_FILE) return skip(rel, 'large');
    const data = await fs.promises.readFile(abs);
    if (kind === 'tex' && !wholeDocument(textOf(data))) return skip(rel, 'part');
    let got: { model: unknown; notes?: string[] };
    try {
      got = await mustKind(kind).fromFile!(data, name);
    } catch {
      return skip(rel, 'unreadable');
    }
    const page = createPage(db, { title: name.replace(/\.[^.]+$/, '') || name, kind, model: got.model, by: 'made', sessionKey: o.sessionKey, space: top.space, folder: parent() });
    out.pages.push(page);
    for (const n of got.notes ?? []) out.notes.push(`${rel}: ${n}`);
  };

  /** A folder: one LaTeX document when it is a project, else a Library folder (made when something comes in) with what is in it. */
  const folder = async (abs: string, rel: string, depth: number, parent: () => string | null) => {
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return skip(rel || path.basename(abs), 'unreadable');
    }
    list = list.filter((e) => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)).sort((a, b) => natural(a.name, b.name));
    listed += list.length;
    const isDir = (e: fs.Dirent) => e.isDirectory() || (e.isSymbolicLink() && !!fs.statSync(path.join(abs, e.name), { throwIfNoEntry: false })?.isDirectory());
    const files = list.filter((e) => !isDir(e)).map((e) => e.name);
    if (texProjectAt(abs, files)) return texDocument(abs, rel, parent);
    let made: string | null = null;
    const mine = () => {
      if (made) return made;
      const f = makeFolder(db, { name: path.basename(abs), parent: parent(), space: top.space }, 'number');
      out.folders++;
      if (!rel) out.folder = f;
      return (made = f.id);
    };
    for (const n of files) {
      const p = path.join(abs, n);
      if (!fs.statSync(p, { throwIfNoEntry: false })?.isFile()) continue;
      await file(p, rel ? `${rel}/${n}` : n, mine);
    }
    for (const e of list.filter(isDir)) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (depth >= MAX_DEPTH || listed >= MAX_LISTED) {
        skip(`${r}/`, 'limit');
        continue;
      }
      await folder(path.join(abs, e.name), r, depth + 1, mine);
    }
  };

  await folder(dir, '', 0, () => top.folder);
  return out;
}
