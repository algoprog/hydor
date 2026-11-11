// What the Files page keeps of the text files open in its tabs while the app is open. A file's editor is made again
// whenever you go to another file's tab and back, so what it holds is kept here when it goes: the text with its
// changes, the places you can undo to, where the cursor and the page were. Back on that file, it is as you left it. A
// file with changes not saved shows a dot on its tab, and closing its tab (or leaving it with Back on a phone) asks
// first: Save, Don't save or Cancel. Nothing is written to disk until you save; reloading the page loses what was not
// saved (the browser asks before it does).
import { create } from 'zustand';
import { ApiError, put } from '../../lib/api';
import { basename } from '../../lib/format';
import { toast, toastError, useUI } from '../../lib/store';
import type { Eol } from './lineends';

/** A file's editor as it was left. `text` is as the editor held it (lines end with \n), `base` what the file held when last read or saved. */
export interface Draft {
  text: string;
  base: string;
  /** The file's modified time when `base` was read, so a change made elsewhere since is noticed on saving. */
  mtime: number;
  eol: Eol;
  baseEol: Eol;
  /** The editor's undo history and selection (CodeMirror's state as JSON), and how far it was scrolled. */
  state: unknown;
  scroll: number;
}

interface FilesState {
  /** The paths of the files with changes not saved. */
  dirty: Record<string, true>;
  /** The question being asked about a file's changes, until it is answered. */
  asking: { path: string; resolve: (answer: 'save' | 'discard' | 'cancel') => void } | null;
}
export const useFiles = create<FilesState>(() => ({ dirty: {}, asking: null }));

const drafts = new Map<string, Draft>();
/** The open editors' own way to save, by file: they know the text as it is now. */
const savers = new Map<string, () => Promise<boolean>>();

export const getDraft = (path: string) => drafts.get(path);
export const keepDraft = (path: string, d: Draft) => void drafts.set(path, d);
export const dropDraft = (path: string) => void drafts.delete(path);
export const isDirty = (path: string) => !!useFiles.getState().dirty[path];

export function setDirty(path: string, on: boolean) {
  if (on === isDirty(path)) return;
  useFiles.setState((s) => {
    const dirty = { ...s.dirty };
    if (on) dirty[path] = true;
    else delete dirty[path];
    return { dirty };
  });
}

/** An open editor says how it saves; the returned function takes it back when the editor goes. */
export function registerSaver(path: string, save: () => Promise<boolean>): () => void {
  savers.set(path, save);
  return () => {
    if (savers.get(path) === save) savers.delete(path);
  };
}

/** Saves a file's changes: by its open editor, or (its tab is not the one shown) from what was kept. */
export async function saveFile(path: string): Promise<boolean> {
  const open = savers.get(path);
  if (open) return open();
  const d = drafts.get(path);
  if (!d) return true;
  try {
    const content = d.eol === 'crlf' ? d.text.replace(/\r?\n/g, '\r\n') : d.text;
    const r = await put<{ mtime: number }>('/api/fs/write', { path, content, expectedMtime: d.mtime });
    drafts.set(path, { ...d, base: d.text, baseEol: d.eol, mtime: r.mtime });
    setDirty(path, false);
    toast(`Saved ${basename(path)}`, 'ok');
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) toast(`${basename(path)} changed on disk: open it to choose which to keep`, 'error');
    else toastError(e);
    return false;
  }
}

/**
 * Whether a file can be left now: when it has changes not saved, asks (the dialog is UnsavedDialog) to save them, leave
 * them out, or stay. Saved or left out, its kept state goes; false when the person stays or the saving failed.
 */
export async function leaveFile(path: string): Promise<boolean> {
  if (!isDirty(path)) return true;
  const answer = await new Promise<'save' | 'discard' | 'cancel'>((resolve) => useFiles.setState({ asking: { path, resolve } }));
  useFiles.setState({ asking: null });
  if (answer === 'cancel') return false;
  if (answer === 'save' && !(await saveFile(path))) return false;
  drafts.delete(path);
  setDirty(path, false);
  return true;
}

/** Closes a file's tab, asking first when it has changes not saved. True when it closed. */
export async function closeFileTab(id: string): Promise<boolean> {
  const tab = useUI.getState().tabs.find((t) => t.id === id);
  if (tab && !(await leaveFile(tab.ref))) return false;
  useUI.getState().closeTab(id);
  return true;
}

/** Anything not saved in any file (the browser asks before the page goes). */
export const anyDirty = () => Object.keys(useFiles.getState().dirty).length > 0;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (anyDirty()) e.preventDefault();
  });
  // A tab that goes (more than a dozen are open, or a folder was opened in its place) takes what was kept with it,
  // except while there are changes not saved: those keep their tab.
  useUI.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return;
    for (const path of Object.keys(useFiles.getState().dirty)) {
      if (!s.tabs.some((t) => t.id === `f:${path}`)) queueMicrotask(() => useUI.getState().openTab({ id: `f:${path}`, kind: 'file', ref: path }));
    }
    for (const path of [...drafts.keys()]) if (!isDirty(path) && !s.tabs.some((t) => t.id === `f:${path}`)) drafts.delete(path);
  });
}
