// What the Files page keeps: how folders show (a list, or big tiles with pictures) and in what order, the files
// opened lately (in this browser, for each machine), and the folders pinned among its places (on the server,
// so on every device).
import { useEffect } from 'react';
import { create } from 'zustand';
import { api, put } from '../../lib/api';
import { machineKey } from '../../lib/machine';
import { toastError } from '../../lib/store';

export type SortBy = 'name' | 'modified' | 'size' | 'kind';

interface Prefs {
  view: 'list' | 'grid';
  sort: SortBy;
  /** The other way round: Z to A, the oldest first, the smallest first. */
  reverse: boolean;
  /** Files opened lately, the last first. */
  recent: string[];
}

const KEY = machineKey('wa.files.v1');

function load(): Prefs {
  const d: Prefs = { view: 'list', sort: 'name', reverse: false, recent: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      view: v.view === 'grid' ? 'grid' : 'list',
      sort: ['name', 'modified', 'size', 'kind'].includes(v.sort) ? v.sort : 'name',
      reverse: v.reverse === true,
      recent: Array.isArray(v.recent) ? v.recent.filter((p: unknown) => typeof p === 'string').slice(0, 40) : [],
    };
  } catch {
    return d;
  }
}

export const useFilesPrefs = create<Prefs>(() => load());
useFilesPrefs.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
});

export const setPrefs = (p: Partial<Prefs>) => useFilesPrefs.setState(p);

/** A file was opened: it leads the recent ones. */
export function noteOpened(path: string) {
  const r = useFilesPrefs.getState().recent;
  if (r[0] === path) return;
  setPrefs({ recent: [path, ...r.filter((p) => p !== path)].slice(0, 40) });
}

/** Paths that moved or went: the recent list follows (a folder moved takes the files in it along). */
export function forgetRecent(from: string, to?: string) {
  const r = useFilesPrefs.getState().recent;
  const moved = (p: string) => (p === from || p.startsWith(`${from}/`) ? (to ? to + p.slice(from.length) : null) : p);
  const next = r.map(moved).filter((p): p is string => !!p);
  if (next.join('\n') !== r.join('\n')) setPrefs({ recent: [...new Set(next)] });
}

// ---- pinned folders --------------------------------------------------------------------------------

export const usePins = create<{ pins: string[] | null }>(() => ({ pins: null }));

let asked = false;
/** The pinned folders (null until known), asked for once. */
export function usePinned(): string[] | null {
  const pins = usePins((s) => s.pins);
  useEffect(() => {
    if (asked) return;
    asked = true;
    api<{ pins: string[] }>('/api/fs/pins').then(
      (r) => usePins.setState({ pins: r.pins }),
      () => usePins.setState({ pins: [] }),
    );
  }, []);
  return pins;
}

export async function setPinned(path: string, on: boolean) {
  const cur = usePins.getState().pins ?? [];
  const next = on ? [...cur.filter((p) => p !== path), path] : cur.filter((p) => p !== path);
  usePins.setState({ pins: next });
  try {
    usePins.setState({ pins: (await put<{ pins: string[] }>('/api/fs/pins', { pins: next })).pins });
  } catch (e) {
    usePins.setState({ pins: cur });
    toastError(e);
  }
}
