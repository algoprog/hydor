// Notes the app adds to conversations (memory updates, second opinions…), per session: loaded when a
// session opens, kept current by the server's `note` events.
import { create } from 'zustand';
import type { SessionNote } from '@shared/features';
import { api } from './api';

export const useNotes = create<{
  byKey: Record<string, SessionNote[]>;
  load: (key: string) => Promise<void>;
  apply: (key: string, note: SessionNote, removed?: boolean) => void;
}>((set, get) => ({
  byKey: {},
  async load(key) {
    const r = await api<{ notes: SessionNote[] }>(`/api/sessions/${encodeURIComponent(key)}/notes`);
    set({ byKey: { ...get().byKey, [key]: r.notes } });
  },
  apply(key, note, removed) {
    const cur = (get().byKey[key] ?? []).filter((n) => n.id !== note.id);
    const next = removed ? cur : [...cur, note].sort((a, b) => a.at - b.at);
    set({ byKey: { ...get().byKey, [key]: next } });
  },
}));
