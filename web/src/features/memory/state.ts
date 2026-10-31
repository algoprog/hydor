// Memory in the pages: whether it is on (for all sessions, and for one), and the server's news that
// notes changed, so open lists and notes refresh.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { MemoryEntry, MemoryScope, MemorySource, MemoryState } from '@shared/memory';
import { api, enc, patch } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toast, toastError } from '../../lib/store';

export const useMemory = create<{ state: MemoryState | null; version: number; load: () => Promise<void> }>((set) => ({
  state: null,
  /** Grows with each change the server reports. */
  version: 0,
  async load() {
    set({ state: await api<MemoryState>('/api/memory') });
  },
}));

let listening = false;
/** Memory's switches and counts, loaded on first use and kept current. */
export function useMemoryState(): MemoryState | null {
  useEffect(() => {
    if (listening) return;
    listening = true;
    useMemory
      .getState()
      .load()
      .catch(() => {});
    let t: ReturnType<typeof setTimeout> | undefined;
    onFeatureEvent('memory', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        useMemory.setState((s) => ({ version: s.version + 1 }));
        useMemory
          .getState()
          .load()
          .catch(() => {});
      }, 250);
    });
  }, []);
  return useMemory((s) => s.state);
}

/** Turns memory on or off for one session. */
export function setSessionMemory(key: string, on: boolean) {
  patch(`/api/sessions/${enc(key)}/extra`, { memory: on ? null : false })
    .then(() => toast(on ? 'Memory is on for this session' : 'Memory is off for this session: it neither reads nor writes notes'))
    .catch(toastError);
}

export const SOURCE: Record<MemorySource, string> = { auto: 'the helper', agent: 'an agent', user: 'you' };

/** The last part of a folder's path, for a project's name. */
export const folderName = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;

/** A plain name for where an entry belongs, as seen from a session (`here`). */
export function placeName(scope: MemoryScope, scopeKey: string, here?: string): string {
  if (scope === 'global') return 'About you';
  if (scope === 'repo') return `Project · ${folderName(scopeKey)}`;
  return scopeKey === here ? 'This session' : 'Another session';
}

/** Entries by id, fetched (all statuses) for a note's changes. */
export async function fetchEntries(ids: number[]): Promise<Map<number, MemoryEntry>> {
  if (!ids.length) return new Map();
  const r = await api<{ entries: MemoryEntry[] }>(`/api/memory/entries?ids=${ids.join(',')}`);
  return new Map(r.entries.map((e) => [e.id, e]));
}
