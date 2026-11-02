// The Library's images and videos as the pages keep them: loaded once, kept current by the server's news
// ({ t: 'feature', id: 'media' }): one kept, its title and description written, one deleted.
import { create } from 'zustand';
import type { MediaEvent, MediaItem } from '@shared/media';
import { api, enc } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';

interface MediaState {
  items: MediaItem[] | null;
  loading: boolean;
  load(): Promise<void>;
  /** Loads the list once, for a card that needs to know what is kept. */
  ensure(): void;
  put(item: MediaItem): void;
  drop(id: string): void;
}

export const useMedia = create<MediaState>((set, get) => ({
  items: null,
  loading: false,
  load: () => {
    set({ loading: true });
    return api<{ items: MediaItem[] }>('/api/media')
      .then((r) => set({ items: r.items }))
      .finally(() => set({ loading: false }));
  },
  ensure: () => {
    if (!get().items && !get().loading) get().load().catch(() => {});
  },
  put: (item) => {
    const l = get().items;
    if (!l) return;
    set({ items: l.some((x) => x.id === item.id) ? l.map((x) => (x.id === item.id ? item : x)) : [item, ...l] });
  },
  drop: (id) => set({ items: get().items?.filter((x) => x.id !== id) ?? null }),
}));

onFeatureEvent('media', ({ data }) => {
  const e = data as MediaEvent;
  if (e.item) useMedia.getState().put(e.item);
  if (e.removed) useMedia.getState().drop(e.removed);
});

/** The item kept from a file, by its path. */
export const keptFrom = (items: MediaItem[] | null, path: string) => items?.find((m) => m.source === path);

export const mediaUrl = (m: Pick<MediaItem, 'id'>, what: 'file' | 'still' | 'frames' = 'file') => `/api/media/${enc(m.id)}/${what}`;
