// Files added to the Library by dropping them on it (or on a project, on the Projects page) or picking them with Upload
// files: a queue sending a few at a time, which the tray shows (UploadTray.tsx). In a browser each file's bytes go in
// pieces (POST /api/library/uploads, then PUT a piece at a time, resumed from where the server says when one is out of
// step, a broken piece tried again), and the server makes it what it is (server/pages/uploads.ts). In the desktop app,
// on its own computer's server, a dropped file goes by its path instead and is moved in (POST /api/library/move); one the
// server will not move (in a project's folder, the app's own, the system's, a link) is uploaded as a copy, as in a browser.
import { create } from 'zustand';
import type { FileAdded, FileBecomes, FileRefused, MoveRefused, UploadStarted } from '@shared/library-files';
import { ApiError, enc, post } from '../../lib/api';
import { machineId, mu } from '../../lib/machine';
import { entriesFromDrop, pickedFromInput, walkEntries, type PickedFile } from '../../lib/upload';

/** Where an item is: waiting its turn, its bytes on their way, the server making it what it is (or moving it), or over. */
export type UpStatus = 'waiting' | 'sending' | 'making' | 'done' | 'error' | 'cancelled';

export interface UpItem {
  id: string;
  name: string;
  /** Its place in a folder that was dropped ("Receipts/june.pdf"), or its name. */
  rel: string;
  size: number;
  /** The project it goes in, or none. */
  space: string | null;
  status: UpStatus;
  /** Bytes sent so far. */
  sent: number;
  /** What it will become (once the server said), and a page's kind. */
  becomes?: FileBecomes;
  kind?: string;
  /** Moved in by its path (the desktop app). */
  byPath?: boolean;
  /** The desktop app sent a copy instead of moving it: why. */
  copied?: MoveRefused;
  /** What it became. */
  done?: FileAdded;
  /** Why it could not be added: the server's reason, when it gave one (the words are then the tray's own), and its words. */
  why?: FileRefused;
  error?: string;
}

interface Store {
  items: UpItem[];
}

export const useLibraryUploads = create<Store>(() => ({ items: [] }));

const set = (id: string, p: Partial<UpItem>) => useLibraryUploads.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
const get = (id: string) => useLibraryUploads.getState().items.find((i) => i.id === id);

/** What each item needs besides what the tray shows: its file, the request on its way, the server's upload. */
const files = new Map<string, File>();
const xhrs = new Map<string, XMLHttpRequest>();
const started = new Map<string, string>();
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** How many files are on their way at once. */
const AT_ONCE = 3;

// ---- the desktop app ------------------------------------------------------------------------------------------------

/** The desktop app's window gives the page a dropped file's path (desktop/preload.cjs). */
type Desktop = { pathOf?: (f: File) => string };
const LOOPBACK = /^(?:127(?:\.\d{1,3}){3}|localhost|\[::1\])$/;

/**
 * A dropped file's path on this computer, when the page is the desktop app's on this computer's own server (not a page
 * of another machine, nor a server elsewhere): then the file is moved in rather than uploaded.
 */
function pathOf(f: File): string | null {
  const d = (window as unknown as { hydorDesktop?: Desktop }).hydorDesktop;
  if (!d?.pathOf || machineId || !LOOPBACK.test(location.hostname)) return null;
  try {
    const p = d.pathOf(f);
    return typeof p === 'string' && p.length > 1 ? p : null;
  } catch {
    return null;
  }
}

/** Files dropped in the desktop app are moved, not copied: what a drag shows over the Library. */
export const dropMoves = () => !!(window as unknown as { hydorDesktop?: Desktop }).hydorDesktop?.pathOf && !machineId && LOOPBACK.test(location.hostname);

/** The folder a file of a dropped folder came in: its path less its place in that folder. */
function rootOf(p: string, rel: string): string | undefined {
  const depth = rel.split('/').length - 1;
  if (depth < 1) return undefined;
  let r = p;
  for (let i = 0; i < depth; i++) r = r.slice(0, Math.max(r.lastIndexOf('/'), r.lastIndexOf('\\')));
  return r || undefined;
}

// ---- adding files ------------------------------------------------------------------------------------------------------

/** What systems leave in folders by themselves, and hidden files: a dropped folder's are left where they are. */
const LEFT_OUT = (rel: string) => {
  const name = rel.split('/').pop() ?? '';
  return rel.includes('/') && (name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini');
};

/** Adds files to the Library, in a project or none: each joins the queue, which sends a few at a time. */
export function addToLibrary(picked: PickedFile[], space: string | null) {
  const list = picked.filter((p) => !LEFT_OUT(p.rel));
  if (!list.length) return;
  const items: UpItem[] = list.map((p) => {
    const id = rid();
    files.set(id, p.file);
    return { id, name: p.file.name, rel: p.rel, size: p.file.size, space, status: 'waiting', sent: 0 };
  });
  // The newest drop first, in the order it came.
  useLibraryUploads.setState((s) => ({ items: [...items, ...s.items] }));
  pump();
}

/** Whether a drag carries files of the computer (not words, links, or the app's own rows). */
export const dragsFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes('Files');

/** The files a drop carries, folders opened: call it in the drop's own handler, which alone can read them. */
export function droppedFiles(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = entriesFromDrop(dt);
  if (entries.length) return walkEntries(entries).then((r) => r.files);
  return Promise.resolve(pickedFromInput(dt.files));
}

/** Upload files: the device's file chooser, several at once, into a project or none; `picked` hears when some were chosen. */
export function pickFiles(space: string | null, picked?: () => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = () => {
    if (!input.files?.length) return;
    addToLibrary(pickedFromInput(input.files), space);
    picked?.();
  };
  input.click();
}

// ---- the queue -------------------------------------------------------------------------------------------------------

function pump() {
  const items = useLibraryUploads.getState().items;
  let busy = items.filter((i) => i.status === 'sending' || i.status === 'making').length;
  // The oldest waiting first: the list holds the newest drops first.
  for (const it of [...items].reverse()) {
    if (busy >= AT_ONCE) break;
    if (it.status !== 'waiting') continue;
    busy++;
    set(it.id, { status: 'sending' });
    void run(it.id).finally(() => {
      files.delete(it.id);
      xhrs.delete(it.id);
      started.delete(it.id);
      pump();
    });
  }
}

function fail(id: string, e: unknown) {
  if (get(id)?.status === 'cancelled') return;
  const why = e instanceof ApiError ? (e.data?.why as FileRefused | undefined) : undefined;
  set(id, { status: 'error', why, error: e instanceof Error ? e.message : String(e) });
}

async function run(id: string) {
  const it = get(id);
  const file = files.get(id);
  if (!it || !file) return;
  const p = pathOf(file);
  if (p) {
    set(id, { status: 'making', byPath: true });
    try {
      const done = await post<FileAdded>('/api/library/move', { path: p, space: it.space, rel: it.rel, root: rootOf(p, it.rel) });
      return set(id, { status: 'done', done, sent: it.size });
    } catch (e) {
      // A file the server will not move goes as a copy, as from a browser; the original stays.
      if (!(e instanceof ApiError && e.data?.copy)) return fail(id, e);
      set(id, { status: 'sending', byPath: false, copied: e.data.copy as MoveRefused });
    }
  }
  try {
    // An upload the server lost (the app restarted meanwhile) starts once more from its first byte.
    for (let again = 0; ; again++) {
      const s = await post<UploadStarted>('/api/library/uploads', { name: it.name, size: it.size, space: it.space, rel: it.rel });
      if (get(id)?.status === 'cancelled') return void forget(s.upload);
      started.set(id, s.upload);
      set(id, { becomes: s.becomes, kind: s.kind, sent: 0 });
      try {
        const done = await sendPieces(id, file, s);
        return set(id, { status: 'done', done, sent: it.size });
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404 && again < 1)) throw e;
      }
    }
  } catch (e) {
    fail(id, e);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends a file's pieces in order: one out of step goes on from where the server says (after a moment when the one
 * before is still arriving there), a broken connection sends the same piece again, waiting longer each time (an app
 * restarting takes a while).
 */
async function sendPieces(id: string, file: File, s: UploadStarted): Promise<FileAdded> {
  let at = 0;
  let broken = 0;
  let behind = 0;
  for (;;) {
    if (get(id)?.status === 'cancelled') throw new Error('cancelled');
    const end = Math.min(file.size, at + s.piece);
    try {
      const r = await sendPiece(id, mu(`/api/library/uploads/${enc(s.upload)}?offset=${at}`), file.slice(at, end), at, end >= file.size);
      broken = behind = 0;
      if (r.done) return r.done;
      at = r.received ?? end;
      set(id, { sent: at });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && typeof e.data?.received === 'number') {
        if (e.data.received === at && ++behind > 30) throw e;
        if (e.data.received === at) await wait(1000);
        at = e.data.received;
        continue;
      }
      if (e instanceof ApiError || (e as Error).message === 'cancelled' || ++broken > 6) throw e;
      await wait([1, 2, 4, 8, 15, 30][broken - 1] * 1000);
    }
  }
}

function sendPiece(id: string, url: string, piece: Blob, at: number, last: boolean): Promise<{ received?: number; done?: FileAdded }> {
  return new Promise((ok, no) => {
    const xhr = new XMLHttpRequest();
    xhrs.set(id, xhr);
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => set(id, { sent: at + e.loaded });
    // Its bytes are there: the server now makes the file what it is, which can take a moment.
    xhr.upload.onload = () => last && get(id)?.status === 'sending' && set(id, { status: 'making', sent: at + piece.size });
    xhr.onload = () => {
      let body: { received?: number; done?: FileAdded; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) ok(body);
      else no(new ApiError(body.error ?? `HTTP ${xhr.status}`, xhr.status, body));
    };
    xhr.onerror = () => no(new Error('The connection to the app broke'));
    xhr.onabort = () => no(new Error('cancelled'));
    xhr.send(piece);
  });
}

/** An upload given up on: the server lets go of what came. */
const forget = (upload: string) => fetch(mu(`/api/library/uploads/${enc(upload)}`), { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});

/** Stops one file: waiting, it is taken off the queue; on its way, its bytes stop and what came is let go. Moving, it goes on. */
export function cancelUpload(id: string) {
  const it = get(id);
  if (!it || (it.status !== 'waiting' && it.status !== 'sending')) return;
  set(id, { status: 'cancelled' });
  xhrs.get(id)?.abort();
  const up = started.get(id);
  if (up) void forget(up);
  files.delete(id);
}

/** Stops every file not added yet. */
export function cancelAll() {
  for (const it of useLibraryUploads.getState().items) cancelUpload(it.id);
}

/** Closes the tray: what is over leaves it (what is still on its way stays). */
export function closeTray() {
  useLibraryUploads.setState((s) => ({ items: s.items.filter((i) => i.status === 'waiting' || i.status === 'sending' || i.status === 'making') }));
}
