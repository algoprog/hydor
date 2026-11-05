// What can be done with files and folders, on the Files page and wherever else they show (a file's window
// over a session, an agent's file cards): add them to a space (a file copied into its folder, a folder joining
// those it works with), keep a notebook, a document, a spreadsheet or a LaTeX file in the Library (its own copy, in
// the editor of its kind), start a session with them, move or copy them into a folder, duplicate or rename one,
// download (a folder, or several, as one .zip), copy their paths, and delete them (to the trash, with Undo;
// something on another disk is deleted for good only once you say so). Moving rows by dragging them is here too.
import type { DragEvent } from 'react';
import type { Space } from '@shared/spaces';
import { api, ApiError, patch, post } from '../../lib/api';
import { basename, dirname, joinPath } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go } from '../../lib/nav';
import { startSessionWith } from '../../lib/startFiles';
import { toast, toastError, useToasts } from '../../lib/store';
import { entriesFromDrop, pickedFromInput, startUpload, walkEntries } from '../../lib/upload';
import { loadSpaces } from '../spaces/state';
import { forgetRecent } from './prefs';

/** A file or folder something is done with. */
export interface Item {
  path: string;
  name: string;
  dir: boolean;
  size?: number;
}

export const itemOf = (path: string, dir = false, size?: number): Item => ({ path, name: basename(path), dir, size });

const done = (text: string, action?: { label: string; run: () => void }) => useToasts.getState().push('ok', text, action);

/** The Files page at a folder, with `select` picked in it (Show in its folder). */
export const goFolder = (dir: string, select?: string, replace = false) => go(`/files?dir=${encodeURIComponent(dir)}${select ? `&sel=${encodeURIComponent(select)}` : ''}`, replace);

/**
 * Adds them to a space: files are copied into its folder; folders join the folders it works with, where they
 * are (copying a whole project would make two of it). What is in it already stays as it is. Show opens the
 * space's files.
 */
export async function addToSpace(items: Item[], space: Pick<Space, 'id' | 'name' | 'folder'>) {
  const show = { label: 'Show', run: () => go(`/projects/${space.id}/files`) };
  let cur: Space;
  try {
    cur = (await api<{ space: Space }>(`/api/projects/${encodeURIComponent(space.id)}`)).space;
  } catch (e) {
    return toastError(e);
  }
  const roots = [cur.folder, ...(cur.folders ?? [])];
  const inIt = (p: string) => roots.some((r) => p === r || p.startsWith(`${r}/`));
  const todo = items.filter((i) => !inIt(i.path));
  if (!todo.length) return void done(items.length === 1 ? `${items[0].name} is in ${space.name} already` : `They are in ${space.name} already`, show);
  const added: Item[] = [];
  const folders = todo.filter((i) => i.dir);
  if (folders.length) {
    try {
      await patch(`/api/projects/${encodeURIComponent(space.id)}`, { folders: [...(cur.folders ?? []), ...folders.map((f) => f.path)] });
      added.push(...folders);
      loadSpaces();
    } catch (e) {
      toastError(e);
    }
  }
  const files = todo.filter((i) => !i.dir);
  // Big files take a moment to copy.
  if (files.some((i) => (i.size ?? 0) > 50 * 1024 * 1024)) toast(files.length === 1 ? `Copying ${files[0].name} to ${space.name}…` : `Copying ${files.length} files to ${space.name}…`);
  for (const i of files) {
    try {
      await post('/api/fs/copy', { from: i.path, into: cur.folder });
      added.push(i);
    } catch (e) {
      toastError(e);
    }
  }
  if (!added.length) return;
  // A sentence of its own for one and for several, so each is translated whole.
  const one = added.length === 1 ? added[0].name : null;
  done(
    added.every((i) => i.dir)
      ? one
        ? `${space.name} works with ${one} now`
        : `${space.name} works with ${added.length} folders now`
      : one
        ? `Added ${one} to ${space.name}`
        : `Added ${added.length} items to ${space.name}`,
    show,
  );
}

/** The start page, with them in its message box: the new session gets them with its first message. */
/**
 * The files the Library keeps a copy of, in its editor of their kind: Jupyter notebooks, PowerPoint decks, Word and
 * Markdown documents, spreadsheets (Excel, OpenDocument, CSV, TSV) and LaTeX files. An HTML file stays a file (it opens
 * as a page beside a conversation); a .zip is not taken for a LaTeX project.
 */
export const LIBRARY_FILE = /\.(ipynb|pptx|ppsx|potx|pptm|docx|docm|dotx|md|markdown|txt|xlsx|ods|csv|tsv|tex|ltx)$/i;

/** Keeps a copy of a file in the Library, in the project picked (null: none; left out: the session's), and offers to open it. */
export async function saveToLibrary(item: Item, sessionKey?: string, space?: string | null) {
  try {
    const r = await post<{ page: { id: string; title: string }; notes?: string[] }>('/api/pages/import', { path: item.path, ...(sessionKey ? { sessionKey } : {}), ...(space !== undefined ? { space } : {}) });
    done(`Saved to the Library: “${r.page.title}”`, { label: 'Open', run: () => go(`/pages/${r.page.id}`) });
    for (const n of r.notes ?? []) toast(n);
  } catch (e) {
    toastError(e);
  }
}

export function startSession(items: Item[]) {
  startSessionWith(items.slice(0, 20).map((i) => ({ path: i.path, size: i.dir ? undefined : i.size, dir: i.dir })));
}

/** The start page, with the session to work in this folder. */
export const newSessionIn = (dir: string) => go(`/?cwd=${encodeURIComponent(dir)}`);

export async function rename(item: Item, name: string, after?: () => void) {
  const n = name.trim();
  if (!n || n === item.name) return;
  if (n.includes('/')) return toast('A name can’t have a slash in it', 'error');
  const to = joinPath(dirname(item.path), n);
  try {
    await post('/api/fs/rename', { from: item.path, to });
    forgetRecent(item.path, to);
  } catch (e) {
    toastError(e);
  }
  after?.();
}

/** A copy beside it, as "name copy". */
export async function duplicate(item: Item, after?: () => void) {
  try {
    const r = await post<{ path: string }>('/api/fs/copy', { from: item.path, into: dirname(item.path) });
    after?.();
    done(`Made a copy: ${basename(r.path)}`);
  } catch (e) {
    toastError(e);
  }
}

/** Moves them into a folder; Undo moves them back. */
export async function moveInto(items: Item[], dir: string, after?: () => void) {
  const moved: { from: string; to: string }[] = [];
  for (const i of items) {
    if (dirname(i.path) === dir) continue;
    if (dir === i.path || dir.startsWith(`${i.path}/`)) {
      toast(`${i.name} can’t go into itself`, 'error');
      continue;
    }
    const to = joinPath(dir, i.name);
    try {
      await post('/api/fs/rename', { from: i.path, to });
      moved.push({ from: i.path, to });
      forgetRecent(i.path, to);
    } catch (e) {
      toastError(e);
    }
  }
  after?.();
  if (!moved.length) return;
  const to = basename(dir) || dir;
  done(moved.length === 1 ? `Moved ${basename(moved[0].from)} to ${to}` : `Moved ${moved.length} items to ${to}`, {
    label: 'Undo',
    run: async () => {
      for (const m of [...moved].reverse()) await post('/api/fs/rename', { from: m.to, to: m.from }).then(() => forgetRecent(m.to, m.from), toastError);
      after?.();
    },
  });
}

/** Copies them into a folder (a free name for each that is taken there); Show opens the folder. */
export async function copyInto(items: Item[], dir: string, after?: () => void) {
  const copied: Item[] = [];
  for (const i of items) {
    try {
      await post('/api/fs/copy', { from: i.path, into: dir });
      copied.push(i);
    } catch (e) {
      toastError(e);
    }
  }
  after?.();
  const to = basename(dir) || dir;
  if (copied.length) done(copied.length === 1 ? `Copied ${copied[0].name} to ${to}` : `Copied ${copied.length} items to ${to}`, { label: 'Show', run: () => goFolder(dir) });
}

type Ask = (o: { title: string; body?: string; confirm?: string; danger?: boolean }) => Promise<boolean>;

/** Moves them to the trash; Undo puts them back. One on another disk is deleted for good, once `ask` says so. */
export async function trash(items: Item[], ask: Ask, after?: () => void) {
  const gone: string[] = [];
  const went: Item[] = [];
  for (const i of items) {
    try {
      const r = await post<{ trashed: string | null }>('/api/fs/delete', { path: i.path });
      if (r.trashed) (gone.push(r.trashed), went.push(i));
      forgetRecent(i.path);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409 && /another disk/.test(e.message))) {
        toastError(e);
        continue;
      }
      if (!(await ask({ title: `Delete ${i.name} for good?`, body: 'It is on another disk than the trash, so it can’t be put back afterwards.', confirm: 'Delete for good', danger: true }))) continue;
      await post('/api/fs/delete', { path: i.path, forGood: true }).then(() => forgetRecent(i.path), toastError);
    }
  }
  after?.();
  if (!gone.length) return;
  done(went.length === 1 ? `Moved ${went[0].name} to the Trash` : `Moved ${went.length} items to the Trash`, {
    label: 'Undo',
    run: async () => {
      for (const g of gone) await post('/api/fs/trash/restore', { path: g }).catch(toastError);
      after?.();
    },
  });
}

/** A file as itself; a folder, or several things, as one .zip (once the server says it can make it). */
export async function download(items: Item[]) {
  if (!items.length) return;
  const one = items.length === 1 && !items[0].dir;
  const query = items.map((i) => `path=${encodeURIComponent(i.path)}`).join('&');
  const href = one ? mu(`/api/fs/raw?download=1&path=${encodeURIComponent(items[0].path)}`) : mu(`/api/fs/zip?${query}`);
  if (href.length > 8000) return toast('Too many to download at once: download their folder instead', 'error');
  if (!one) {
    try {
      await api(`/api/fs/zip?check=1&${query}`);
    } catch (e) {
      return toastError(e);
    }
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function copyPaths(items: Item[]) {
  navigator.clipboard.writeText(items.map((i) => i.path).join('\n')).then(
    () => toast(items.length === 1 ? 'Path copied' : 'Paths copied', 'ok'),
    () => toast('Could not copy: the browser said no', 'error'),
  );
}

// ---- dragging -----------------------------------------------------------------------------------------

/** What a row carries while dragged: the paths of what moves. */
export const DRAG = 'application/x-naget-paths';

export function dragStart(e: DragEvent, items: Item[]) {
  e.dataTransfer.setData(DRAG, JSON.stringify(items.map((i) => ({ path: i.path, dir: i.dir }))));
  // Out of the app (to the desktop, another tab), the first one as a link.
  e.dataTransfer.setData('text/plain', items.map((i) => i.path).join('\n'));
  e.dataTransfer.effectAllowed = 'copyMove';
}

/** Whether a drag over a folder is something it takes: rows from here, or files from the computer. */
export function takesDrop(e: DragEvent): boolean {
  const t = e.dataTransfer.types;
  if (!t.includes(DRAG) && !t.includes('Files')) return false;
  e.preventDefault();
  e.stopPropagation();
  // Holding Alt (Option) copies rows instead of moving them.
  e.dataTransfer.dropEffect = t.includes(DRAG) ? (e.altKey ? 'copy' : 'move') : 'copy';
  return true;
}

/** Something dropped on folder `dir`: rows move there (or are copied, with Alt), files from the computer upload. */
export async function dropInto(e: DragEvent, dir: string, after?: () => void) {
  e.preventDefault();
  e.stopPropagation();
  const raw = e.dataTransfer.getData(DRAG);
  if (raw) {
    let list: { path: string; dir: boolean }[] = [];
    try {
      list = JSON.parse(raw);
    } catch {}
    const items = list.map((x) => itemOf(x.path, x.dir));
    return e.altKey ? copyInto(items, dir, after) : moveInto(items, dir, after);
  }
  // Entries are readable only during the drop.
  const entries = entriesFromDrop(e.dataTransfer);
  if (entries.length) {
    const { files, emptyDirs } = await walkEntries(entries);
    await startUpload(dir, files, emptyDirs, after);
  } else if (e.dataTransfer.files.length) await startUpload(dir, pickedFromInput(e.dataTransfer.files), [], after);
}
