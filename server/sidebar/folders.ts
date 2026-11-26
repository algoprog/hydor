// The folders you make for sessions in the sidebar (shared/sidebar.ts SessionFolder): at the top level for sessions that are
// in no project, or inside one project for that project's sessions. Kept here as JSON; a session's folder is `extra.folder`
// in its row (server/sessionExtra.ts), one folder at most. Deleting a folder, or the project it is in, keeps its sessions,
// out of any folder. Open pages hear of the folders (a 'session-folders' news) and of each session that moved (its summary).
import crypto from 'node:crypto';
import { MAX_SESSION_FOLDER_NAME, MAX_SESSION_FOLDERS, sessionFolderList, type SessionFolder } from '../../shared/sidebar.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Feature } from '../features/types.ts';
import { parseExtra, sessionExtra } from '../sessionExtra.ts';
import { spaceById } from '../spaces/index.ts';

const KEY = 'sessions.folders';

/** Every folder, in the order they were made. */
export function sessionFolders(db: DB): SessionFolder[] {
  try {
    return sessionFolderList(JSON.parse(kvGet(db, KEY) ?? '[]'));
  } catch {
    return [];
  }
}

const keep = (db: DB, folders: SessionFolder[]) => kvSet(db, KEY, JSON.stringify(folders));

/** A folder's name as given: trimmed and cut, and refused when it is empty or another folder of the same place has it. */
function nameOf(folders: SessionFolder[], name: unknown, space: string | undefined, except?: string): string {
  if (name !== undefined && name !== null && typeof name !== 'string') throw new HttpError(400, 'name: the name of the folder');
  const n = (name ?? '').trim().slice(0, MAX_SESSION_FOLDER_NAME).trim();
  if (!n) throw new HttpError(400, 'Give the folder a name');
  if (folders.some((f) => f.id !== except && (f.space ?? '') === (space ?? '') && f.name.toLowerCase() === n.toLowerCase())) throw new HttpError(400, `There is already a folder called “${n}” there`);
  return n;
}

export function createSessionFolder(db: DB, b: { name?: unknown; space?: unknown }): SessionFolder {
  const folders = sessionFolders(db);
  let space: string | undefined;
  if (b.space !== undefined && b.space !== null && b.space !== '') {
    if (typeof b.space !== 'string' || !spaceById(db, b.space)) throw new HttpError(404, 'No such project');
    space = b.space;
  }
  const name = nameOf(folders, b.name, space);
  if (folders.length >= MAX_SESSION_FOLDERS) throw new HttpError(400, `At most ${MAX_SESSION_FOLDERS} folders: delete one first`);
  const f: SessionFolder = { id: `sf${crypto.randomBytes(5).toString('hex')}`, name, ...(space ? { space } : {}), createdAt: Date.now() };
  keep(db, [...folders, f]);
  return f;
}

export function renameSessionFolder(db: DB, id: string, name: unknown): SessionFolder {
  const folders = sessionFolders(db);
  const f = folders.find((x) => x.id === id);
  if (!f) throw new HttpError(404, 'No such folder');
  const renamed = { ...f, name: nameOf(folders, name, f.space, f.id) };
  keep(db, folders.map((x) => (x.id === id ? renamed : x)));
  return renamed;
}

/**
 * Takes the sessions out of the folders `gone` names. Only rows that already name one are touched, with an update: a session
 * that no longer exists is never made again (an insert would bring a deleted session back to the sidebar). Returns their keys.
 */
function clearFolders(db: DB, gone: Set<string>): string[] {
  if (!gone.size) return [];
  const keys: string[] = [];
  const set = db.prepare('update app_sessions set extra = ? where key = ?');
  for (const r of db.prepare(`select key, extra from app_sessions where extra like '%"folder"%'`).all() as { key: string; extra: string | null }[]) {
    const x = parseExtra(r.extra);
    if (typeof x.folder !== 'string' || !gone.has(x.folder)) continue;
    delete x.folder;
    set.run(JSON.stringify(x), r.key);
    keys.push(r.key);
  }
  return keys;
}

/** Deletes a folder; its sessions stay, out of any folder. Returns their keys. */
export function deleteSessionFolder(db: DB, id: string): string[] {
  const folders = sessionFolders(db);
  if (!folders.some((f) => f.id === id)) throw new HttpError(404, 'No such folder');
  keep(db, folders.filter((f) => f.id !== id));
  return clearFolders(db, new Set([id]));
}

/** A project is gone: so are its folders, and its sessions are out of them. Returns those sessions' keys. */
export function dropSpaceFolders(db: DB, spaceId: string): string[] {
  const folders = sessionFolders(db);
  const gone = folders.filter((f) => f.space === spaceId);
  if (!gone.length) return [];
  keep(db, folders.filter((f) => f.space !== spaceId));
  return clearFolders(db, new Set(gone.map((f) => f.id)));
}

/**
 * Puts a session in a folder, or with null takes it out of its folder. The folder must be of the session's own project (a
 * session in no project: a top-level folder). `set` writes it (SessionManager.setFolder: nothing for a session that is not there).
 */
export function moveSessionToFolder(db: DB, key: string, folder: unknown, set: (folder: string | null) => void): void {
  if (folder === null || folder === undefined || folder === '') return set(null);
  if (typeof folder !== 'string') throw new HttpError(400, 'folder: the folder’s id, or null for none');
  const f = sessionFolders(db).find((x) => x.id === folder);
  if (!f) throw new HttpError(404, 'No such folder');
  const mine = sessionExtra(db, key).space || undefined;
  if ((f.space ?? '') !== (mine ?? '')) {
    if (f.space) throw new HttpError(400, `That folder is in the project “${spaceById(db, f.space)?.name ?? f.space}”: only its sessions go in it`);
    throw new HttpError(400, `That folder is outside the session’s project: make one inside “${(mine && spaceById(db, mine)?.name) || mine}”`);
  }
  set(f.id);
}

export const sessionFoldersFeature: Feature = {
  id: 'session-folders',
  routes(d) {
    const announce = (keys: string[]) => {
      for (const k of new Set(keys)) d.sessions.queueSummary(k);
    };
    const tell = () => {
      const folders = sessionFolders(d.db);
      d.broadcast({ t: 'feature', id: 'session-folders', data: { folders } });
      return folders;
    };
    d.app.get('/api/session-folders', async () => ({ folders: sessionFolders(d.db) }));
    d.app.post('/api/session-folders', async (req) => {
      const folder = createSessionFolder(d.db, (req.body ?? {}) as { name?: unknown; space?: unknown });
      return { folder, folders: tell() };
    });
    d.app.patch('/api/session-folders/:id', async (req) => {
      const folder = renameSessionFolder(d.db, (req.params as { id: string }).id, ((req.body ?? {}) as { name?: unknown }).name);
      return { folder, folders: tell() };
    });
    d.app.delete('/api/session-folders/:id', async (req) => {
      announce(deleteSessionFolder(d.db, (req.params as { id: string }).id));
      return { folders: tell() };
    });
    d.app.post('/api/sessions/:key/folder', async (req) => {
      const key = decodeURIComponent((req.params as { key: string }).key);
      if (!/^(claude|codex|acp):[A-Za-z0-9._-]{4,80}$/.test(key)) throw new HttpError(400, 'Bad session key');
      if (!d.sessions.summary(key)) throw new HttpError(404, 'Session not found');
      moveSessionToFolder(d.db, key, ((req.body ?? {}) as { folder?: unknown }).folder, (f) => d.sessions.setFolder(key, f));
      return { ok: true };
    });
  },
};

/** A project was deleted: its folders go, its sessions are announced as out of them, and open pages hear of the folders. */
export function folderNewsOfSpace(d: { db: DB; sessions: { queueSummary(key: string): void }; broadcast(e: any): void }, spaceId: string): void {
  const keys = dropSpaceFolders(d.db, spaceId);
  for (const k of keys) d.sessions.queueSummary(k);
  d.broadcast({ t: 'feature', id: 'session-folders', data: { folders: sessionFolders(d.db) } });
}
