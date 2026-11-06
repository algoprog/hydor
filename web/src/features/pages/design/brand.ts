// The user's brand kit, as designs use it: their colours, a heading and a body font, and their logos (kept by the app,
// on every device: GET and PUT /api/brand). Pickers offer them first, and Apply my brand puts them on a whole design.
import { create } from 'zustand';
import { useEffect } from 'react';
import type { BrandKit } from '@shared/design-brand';
import { api, put } from '../../../lib/api';

export const useBrandStore = create<{ kit: BrandKit | null; loaded: boolean; load: () => Promise<void>; save: (k: BrandKit) => Promise<void> }>((set) => ({
  kit: null,
  loaded: false,
  load: async () => {
    const r = await api<{ brand: BrandKit | null }>('/api/brand');
    set({ kit: r.brand, loaded: true });
  },
  save: async (k) => {
    const r = await put<{ brand: BrandKit | null }>('/api/brand', k);
    set({ kit: r.brand, loaded: true });
  },
}));

/** The brand kit (loaded the first time it is asked for), or null while there is none. */
export function useBrand(): BrandKit | null {
  const kit = useBrandStore((s) => s.kit);
  const loaded = useBrandStore((s) => s.loaded);
  useEffect(() => {
    if (!loaded) useBrandStore.getState().load().catch(() => {});
  }, [loaded]);
  return kit && (kit.colours.length || kit.fonts.some(Boolean) || kit.logos.length) ? kit : null;
}
