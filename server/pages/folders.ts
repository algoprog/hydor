// Folders in the Library, to sort what it keeps: pages, slides, documents, spreadsheets, LaTeX documents and notebooks
// (the pages table), and the pictures, videos and sounds kept (the media table). A folder is in one place, a project or
// none, at its top or in another folder of that place (eight deep at most); what is in a folder is in its place too, so
// a folder moved to another project takes what it holds along, and something put in a folder of another project moves
// to that project. Deleting a folder deletes nothing it holds: its things and folders go up a level. Names are told
// apart in a folder without minding capitals: a new one by a name there is refused, one moved or brought in there gets
// a number ("Drafts 2"). Agents name folders by path ("Thesis/Drafts"): folderForAgent finds it, or makes it.
import crypto from 'node:crypto';
import { FOLDER_LIMITS, type LibFolder } from '../../shared/pages.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { spaceById } from '../spaces/index.ts';

/** The tables whose rows go in folders: the Library's pages, and the pictures, videos and sounds it keeps. */
export type ItemTable = 'pages' | 'media';

export function initFolders(db: DB) {
  db.exec(`
    create table if not exists library_folders (
      id text primary key,
      name text not null,
      parent text,
      space text,
      created_at integer not null
    );
    create index if not exists library_folders_parent on library_folders(parent);
  `);
}

/** The column that says which folder a row is in, made where it is missing (a table made before folders were). */
function folderColumn(db: DB, table: ItemTable): boolean {
  const cols = (db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.length) return false;
  if (!cols.includes('folder')) db.exec(`alter table ${table} add column folder text`);
  return true;
}

interface Row {
  id: string;
  name: string;
  parent: string | null;
  space: string | null;
  created_at: number;
}

const toFolder = (r: Row): LibFolder => ({ id: r.id, name: r.name, ...(r.parent ? { parent: r.parent } : {}), ...(r.space ? { space: r.space } : {}), createdAt: r.created_at });

const rows = (db: DB) => db.prepare('select * from library_folders order by created_at').all() as Row[];

/**
 * Every folder, oldest first. One whose project is gone is in no project now (as the things it held are), and one whose
 * folder is gone is at its place's top.
 */
export function listFolders(db: DB): LibFolder[] {
  initFolders(db);
  const list = rows(db);
  const ids = new Set(list.map((r) => r.id));
  const fix = db.prepare('update library_folders set parent = ?, space = ? where id = ?');
  for (const r of list) {
    const space = r.space && !spaceById(db, r.space) ? null : r.space;
    const parent = r.parent && !ids.has(r.parent) ? null : r.parent;
    if (space !== r.space || parent !== r.parent) {
      fix.run(parent, space, r.id);
      r.space = space;
      r.parent = parent;
    }
  }
  return list.map(toFolder);
}

export function folderById(db: DB, id: string): LibFolder | null {
  initFolders(db);
  const r = db.prepare('select * from library_folders where id = ?').get(String(id)) as Row | undefined;
  return r ? toFolder(r) : null;
}

export function mustFolder(db: DB, id: unknown): LibFolder {
  const f = typeof id === 'string' ? folderById(db, id) : null;
  if (!f) throw new HttpError(404, 'There is no such folder in the Library (GET /api/pages lists them)');
  return f;
}

/** A folder's name as kept: one line, no slashes (they part a path), not too long. */
export function cleanFolderName(v: unknown): string {
  const s = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FOLDER_LIMITS.name)
    .trim();
  if (!s) throw new HttpError(400, 'A folder needs a name');
  return s;
}

/** The folders in a place's top (parent null) or in a folder. */
const childrenOf = (db: DB, parent: string | null, space: string | null) =>
  (parent ? db.prepare('select * from library_folders where parent = ?').all(parent) : db.prepare('select * from library_folders where parent is null and space is ?').all(space)) as Row[];

/** Whether a name is taken among a folder's folders (or a place's top), not minding capitals. */
const taken = (db: DB, name: string, parent: string | null, space: string | null, but?: string) => childrenOf(db, parent, space).some((r) => r.id !== but && r.name.toLowerCase() === name.toLowerCase());

/** `name`, or "name 2", "name 3"… when a folder there has it. */
function freeName(db: DB, name: string, parent: string | null, space: string | null, but?: string): string {
  if (!taken(db, name, parent, space, but)) return name;
  for (let i = 2; ; i++) {
    const n = `${name.slice(0, FOLDER_LIMITS.name - String(i).length - 1)} ${i}`;
    if (!taken(db, n, parent, space, but)) return n;
  }
}

/** How deep a folder is (one at its place's top: 1). */
function depthOf(db: DB, id: string): number {
  let n = 0;
  for (let f = folderById(db, id); f && n < 50; f = f.parent ? folderById(db, f.parent) : null) n++;
  return n;
}

/** A folder and every folder in it, at any depth (its own id first). */
function subtree(db: DB, id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length && out.length < 5000; i++) for (const r of db.prepare('select id from library_folders where parent = ?').all(out[i]) as { id: string }[]) out.push(r.id);
  return out;
}

/** How many levels of folders a folder holds below it (none: 0). */
function heightOf(db: DB, id: string): number {
  const kids = db.prepare('select id from library_folders where parent = ?').all(id) as { id: string }[];
  return kids.length ? 1 + Math.max(...kids.map((k) => heightOf(db, k.id))) : 0;
}

const placeName = (db: DB, space: string | null) => (space ? `in ${spaceById(db, space)?.name ?? 'that project'}` : 'outside any project');

/**
 * A new folder: in a folder (`parent`, whose place it takes), or at the top of a place (`space`: a project's id, or
 * none). 409 when a folder there has the name.
 */
export function makeFolder(db: DB, o: { name: unknown; parent?: string | null; space?: string | null }, how: 'refuse' | 'number' = 'refuse'): LibFolder {
  initFolders(db);
  let name = cleanFolderName(o.name);
  const parent = o.parent ? mustFolder(db, o.parent) : null;
  const space = parent ? (parent.space ?? null) : (o.space ?? null);
  if (parent && depthOf(db, parent.id) >= FOLDER_LIMITS.depth) throw new HttpError(400, `Folders go ${FOLDER_LIMITS.depth} deep at most`);
  if ((db.prepare('select count(*) as n from library_folders').get() as { n: number }).n >= FOLDER_LIMITS.count) throw new HttpError(409, `The Library holds ${FOLDER_LIMITS.count} folders at most`);
  if (how === 'number') name = freeName(db, name, parent?.id ?? null, space);
  else if (taken(db, name, parent?.id ?? null, space)) throw new HttpError(409, `There is a folder “${name}” there already`);
  let id = crypto.randomBytes(5).toString('hex');
  while (folderById(db, id)) id = crypto.randomBytes(5).toString('hex');
  db.prepare('insert into library_folders (id, name, parent, space, created_at) values (?, ?, ?, ?, ?)').run(id, name, parent?.id ?? null, space, Date.now());
  return folderById(db, id)!;
}

/**
 * A folder renamed, and/or moved: into another folder (`parent`: its id, whose place it takes), to the top of its place
 * (`parent: null`), or to the top of another place (`space`: a project's id or null, with no parent). Moved to another
 * project, the folders and things in it go along. A name taken where it goes gets a number; renaming to a name taken
 * there is refused (409). Returns the folder, and whether things of the media table changed place (to tell the pages).
 */
export function changeFolder(db: DB, id: string, o: { name?: unknown; parent?: string | null; space?: string | null }): { folder: LibFolder; media: boolean } {
  const f = mustFolder(db, id);
  let parent = f.parent ?? null;
  let space = f.space ?? null;
  if (o.parent !== undefined) {
    if (o.parent) {
      const to = mustFolder(db, o.parent);
      if (subtree(db, f.id).includes(to.id)) throw new HttpError(400, 'A folder cannot go inside itself');
      if (depthOf(db, to.id) + 1 + heightOf(db, f.id) > FOLDER_LIMITS.depth) throw new HttpError(400, `Folders go ${FOLDER_LIMITS.depth} deep at most`);
      parent = to.id;
      space = to.space ?? null;
    } else {
      parent = null;
      if (o.space !== undefined) space = o.space;
    }
  } else if (o.space !== undefined && o.space !== space) {
    parent = null;
    space = o.space;
  }
  let name = f.name;
  if (o.name !== undefined) {
    name = cleanFolderName(o.name);
    if (taken(db, name, parent, space, f.id)) throw new HttpError(409, `There is a folder “${name}” there already`);
  } else if (parent !== (f.parent ?? null) || space !== (f.space ?? null)) name = freeName(db, name, parent, space, f.id);
  let media = false;
  db.transaction(() => {
    db.prepare('update library_folders set name = ?, parent = ?, space = ? where id = ?').run(name, parent, space, f.id);
    if (space !== (f.space ?? null)) media = setSubtreeSpace(db, subtree(db, f.id), space);
  })();
  return { folder: folderById(db, f.id)!, media };
}

/** The folders given and what is in them put in a project (or none): whether any picture, video or sound moved. */
function setSubtreeSpace(db: DB, ids: string[], space: string | null): boolean {
  const marks = ids.map(() => '?').join(',');
  db.prepare(`update library_folders set space = ? where id in (${marks})`).run(space, ...ids);
  if (folderColumn(db, 'pages')) db.prepare(`update pages set space = ? where folder in (${marks})`).run(space, ...ids);
  return folderColumn(db, 'media') && db.prepare(`update media set space = ? where folder in (${marks})`).run(space, ...ids).changes > 0;
}

/**
 * A folder deleted: the things and folders in it go up a level (to its folder, or its place's top), a folder's name
 * taken there getting a number. Nothing it holds is deleted. Returns how many things and folders moved, and whether
 * pictures, videos or sounds were among them.
 */
export function deleteFolder(db: DB, id: string): { moved: number; media: boolean } {
  const f = mustFolder(db, id);
  const up = f.parent ?? null;
  let moved = 0;
  let media = false;
  db.transaction(() => {
    for (const k of db.prepare('select * from library_folders where parent = ?').all(f.id) as Row[]) {
      db.prepare('update library_folders set parent = ?, name = ? where id = ?').run(up, freeName(db, k.name, up, f.space ?? null, k.id), k.id);
      moved++;
    }
    if (folderColumn(db, 'pages')) moved += db.prepare('update pages set folder = ? where folder = ?').run(up, f.id).changes;
    if (folderColumn(db, 'media')) {
      const n = db.prepare('update media set folder = ? where folder = ?').run(up, f.id).changes;
      moved += n;
      media = n > 0;
    }
    db.prepare('delete from library_folders where id = ?').run(f.id);
  })();
  return { moved, media };
}

/**
 * Something of the Library put in a folder (its place becomes the folder's), or (null) out of any, at its place's top.
 * An app's screen stays with its app.
 */
export function putInFolder(db: DB, table: ItemTable, id: string, folder: string | null) {
  if (!folderColumn(db, table)) throw new HttpError(404, 'Not found');
  const row = db.prepare(`select * from ${table} where id = ?`).get(id) as { app?: string | null } | undefined;
  if (!row) throw new HttpError(404, table === 'pages' ? 'No saved page with that id' : 'There is no such item in the Library');
  if (row.app) throw new HttpError(400, 'An app’s screen stays with its app');
  if (folder === null) {
    db.prepare(`update ${table} set folder = null where id = ?`).run(id);
    return;
  }
  const f = mustFolder(db, folder);
  db.prepare(`update ${table} set folder = ?, space = ? where id = ?`).run(f.id, f.space ?? null, id);
}

/** After something moved to another project (or out of one): out of its folder, unless the folder is in that place. */
export function fitFolder(db: DB, table: ItemTable, id: string) {
  if (!folderColumn(db, table)) return;
  const row = db.prepare(`select folder, space from ${table} where id = ?`).get(id) as { folder: string | null; space: string | null } | undefined;
  if (!row?.folder) return;
  const f = folderById(db, row.folder);
  if (!f || (f.space ?? null) !== (row.space ?? null)) db.prepare(`update ${table} set folder = null where id = ?`).run(id);
}

/** Where something new goes: the folder asked for (its place with it), or the place asked for at its top. */
export function placeFor(db: DB, folder: unknown, space: string | null): { space: string | null; folder: string | null } {
  if (typeof folder !== 'string' || !folder) return { space, folder: null };
  const f = mustFolder(db, folder);
  return { space: f.space ?? null, folder: f.id };
}

/** A folder's path from its place's top, its names between slashes: "Thesis/Drafts". */
export function folderPath(db: DB, id: string, all?: Map<string, LibFolder>): string {
  const names: string[] = [];
  for (let f = all ? all.get(id) : folderById(db, id); f && names.length < 50; f = f.parent ? (all ? all.get(f.parent) : folderById(db, f.parent)) : undefined) names.unshift(f.name);
  return names.join('/');
}

/**
 * The folder an agent names: a name or a path ("Thesis/Drafts"). Its first name is looked for in the place given first
 * (the session's project, or none), then in the others (the least deep, the newest); the rest from there. What is not
 * there is made (the first at the top of the place given). Its id; null for no name.
 */
export function folderForAgent(db: DB, path: unknown, space: string | null): string | null {
  if (typeof path !== 'string') return null;
  const parts = path
    .split(/[/\\]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const all = listFolders(db);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const depth = new Map<string, number>();
  const depthIn = (f: LibFolder): number => {
    if (depth.has(f.id)) return depth.get(f.id)!;
    const p = f.parent ? all.find((x) => x.id === f.parent) : undefined;
    const d = p ? depthIn(p) + 1 : 1;
    depth.set(f.id, d);
    return d;
  };
  const first = all
    .filter((f) => same(f.name, cleanFolderName(parts[0])))
    .sort((a, b) => Number((b.space ?? null) === space) - Number((a.space ?? null) === space) || depthIn(a) - depthIn(b) || b.createdAt - a.createdAt)[0];
  let cur = first ?? makeFolder(db, { name: parts[0], space });
  for (const part of parts.slice(1)) {
    const name = cleanFolderName(part);
    const had = (db.prepare('select * from library_folders where parent = ?').all(cur.id) as Row[]).find((r) => same(r.name, name));
    cur = had ? toFolder(had) : makeFolder(db, { name, parent: cur.id });
  }
  return cur.id;
}

/** Where an agent's save goes: the folder it names (and that folder's project), else its session's project at the top. */
export function agentPlace(db: DB, folder: unknown, space: string | null): { space: string | null; folder: string | null } {
  const id = folderForAgent(db, folder, space);
  if (!id) return { space, folder: null };
  const f = folderById(db, id)!;
  return { space: f.space ?? null, folder: f.id };
}

/** Words for where a folder is, for an agent: "the folder “Thesis/Drafts” in Dissertation". */
export function folderWords(db: DB, id: string, all?: Map<string, LibFolder>): string {
  const f = all?.get(id) ?? folderById(db, id);
  return f ? `the folder “${folderPath(db, id, all)}” ${placeName(db, f.space ?? null)}` : '';
}
