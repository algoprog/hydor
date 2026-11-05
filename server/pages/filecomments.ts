// Comments on LaTeX files of this computer, opened from Files: a file keeps only its text, so the app keeps its
// comments in its own data, by the file's path, each on words of that file as a Library document's are (where they
// are, the words they quote, replies, resolved). Files opened in the editor get the comments of their project's files
// (the document and the chapters it reads), and saving keeps them again, merged with what an agent did meanwhile
// (an answer or a new comment comes in, what the user deleted stays deleted). Files moves them along when it renames
// or moves a file or a folder. Agents read them with get_page's path and answer, resolve or add them with
// save_latex's path; the editor hears of it and takes them in.
import path from 'node:path';
import { cleanComment, type Comment } from '../../shared/comments.ts';
import { cleanTexComments, mergeTexComments, TEX_MAIN, type TexComment, type TexDoc } from '../../shared/latex.ts';
import type { DB } from '../db.ts';

/** A comment as the app keeps it for a file: on words of that file (its `file` is the model's name, not kept). */
type Kept = Comment & { from: number; to: number };

let made = false;
function table(db: DB) {
  if (made) return;
  db.exec('create table if not exists file_comments (path text primary key, data text not null, at integer not null)');
  made = true;
}

/** The comments kept for a file, by its absolute path. */
export function fileComments(db: DB, abs: string): Kept[] {
  table(db);
  const row = db.prepare('select data from file_comments where path = ?').get(abs) as { data: string } | undefined;
  if (!row) return [];
  try {
    const list = JSON.parse(row.data) as unknown[];
    return Array.isArray(list)
      ? list.flatMap((x) => {
          const c = cleanComment(x);
          const o = x as { from?: unknown; to?: unknown };
          return c ? [{ ...c, from: Number(o.from) || 0, to: Number(o.to) || 0 }] : [];
        })
      : [];
  } catch {
    return [];
  }
}

/** Keeps a file's comments (none: forgets the file). */
export function keepFileComments(db: DB, abs: string, list: Kept[]) {
  table(db);
  if (!list.length) db.prepare('delete from file_comments where path = ?').run(abs);
  else db.prepare('insert into file_comments (path, data, at) values (?, ?, ?) on conflict(path) do update set data = excluded.data, at = excluded.at').run(abs, JSON.stringify(list), Date.now());
}

/** Files renamed or moved: their comments go with them (a folder's files' too). */
export function moveFileComments(db: DB, from: string, to: string) {
  table(db);
  if (!from || !to || from === to) return;
  const rows = db.prepare("select path from file_comments where path = ? or path like ? escape '\\'").all(from, `${from.replace(/[\\%_]/g, (c) => `\\${c}`)}${path.sep === '\\' ? '\\\\' : path.sep}%`) as { path: string }[];
  const move = db.prepare('update or replace file_comments set path = ? where path = ?');
  for (const r of rows) move.run(to + r.path.slice(from.length), r.path);
}

/** Where a project's file is on disk: main.tex is the document's own file. */
const absOf = (folder: string, mainRel: string, name: string) => path.resolve(folder, name === TEX_MAIN ? mainRel : name);

/** A project's comments as the editor's model has them (each on its file by the model's name), placed again on their words. */
export function projectComments(db: DB, doc: TexDoc, folder: string, mainRel: string): TexComment[] {
  const all: unknown[] = [];
  for (const name of [TEX_MAIN, ...doc.files.map((f) => f.name)]) for (const c of fileComments(db, absOf(folder, mainRel, name))) all.push({ ...c, file: name });
  return cleanTexComments(all, doc);
}

/**
 * A project's comments kept after a save: the editor's (`mine`), merged with what changed in the app's data since
 * the editor had them (`base`), so an agent's answer meanwhile stays; each file's kept apart. Files the project no
 * longer has (`gone`: removed or renamed in the editor) are forgotten. Returns them as the model has them.
 */
export function saveProjectComments(db: DB, doc: TexDoc, folder: string, mainRel: string, base: unknown, gone: string[] = []): TexComment[] {
  const stored = projectComments(db, doc, folder, mainRel);
  const merged = cleanTexComments(mergeTexComments(Array.isArray(base) ? cleanTexComments(base, doc) : stored, doc.comments ?? [], stored), doc);
  const names = [TEX_MAIN, ...doc.files.map((f) => f.name)];
  for (const name of names)
    keepFileComments(
      db,
      absOf(folder, mainRel, name),
      merged.filter((c) => c.file === name).map(({ file: _file, ...c }) => c),
    );
  for (const rel of gone) if (!names.includes(rel) && rel !== mainRel) keepFileComments(db, path.resolve(folder, rel), []);
  return merged;
}
