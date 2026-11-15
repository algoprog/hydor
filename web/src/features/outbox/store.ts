// How many calls wait in the Outbox on this machine (the Inbox's count beside the sessions waiting): asked once,
// then kept up to date by the server's 'outbox' news.
import { create } from 'zustand';
import { api } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';

interface OutboxState {
  held: number;
  /** Bumped at every change, for lists that show held calls to load again. */
  version: number;
  load: () => Promise<void>;
}

export const useOutbox = create<OutboxState>((set) => ({
  held: 0,
  version: 0,
  load: async () => {
    try {
      const r = await api<{ held: number }>('/api/outbox');
      set({ held: r.held ?? 0 });
    } catch {}
  },
}));

onFeatureEvent('outbox', (e) => {
  const held = (e.data as { held?: number } | null)?.held;
  useOutbox.setState((s) => ({ held: typeof held === 'number' ? held : s.held, version: s.version + 1 }));
});
