// The Pages library and published sites as the app keeps them: loaded once, refreshed when the server
// says they changed ({ t: 'feature', id: 'pages' }), and which pages of a conversation were kept.
import { create } from 'zustand';
import type { PageInfo, PagesEvent, PublishRequest, SiteInfo } from '@shared/pages';
import { api, enc } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';

interface PagesState {
  pages: PageInfo[] | null;
  sites: SiteInfo[] | null;
  /** By session: which of its show_html calls were kept, as which page. */
  kept: Record<string, Record<string, string>>;
  /** Publish requests by id, as last heard. */
  requests: Record<string, PublishRequest>;
  loadPages(): Promise<void>;
  loadSites(): Promise<void>;
  loadKept(key: string): Promise<void>;
  setKept(key: string, item: string, page: string): void;
  setRequest(r: PublishRequest): void;
}

export const usePagesStore = create<PagesState>((set, get) => ({
  pages: null,
  sites: null,
  kept: {},
  requests: {},
  loadPages: () => api<{ pages: PageInfo[] }>('/api/pages').then((r) => set({ pages: r.pages })),
  loadSites: () => api<{ sites: SiteInfo[] }>('/api/sites').then((r) => set({ sites: r.sites })),
  loadKept: (key) => api<{ items: Record<string, string> }>(`/api/pages/kept?key=${enc(key)}`).then((r) => set({ kept: { ...get().kept, [key]: r.items } })),
  setKept: (key, item, page) => set({ kept: { ...get().kept, [key]: { ...get().kept[key], [item]: page } } }),
  setRequest: (r) => set({ requests: { ...get().requests, [r.id]: r } }),
}));

// What the server says changed: whatever is loaded is loaded again.
onFeatureEvent('pages', ({ data }) => {
  const e = data as PagesEvent;
  const s = usePagesStore.getState();
  if (e?.what === 'pages') {
    if (s.pages) s.loadPages().catch(() => {});
    for (const key of Object.keys(s.kept)) s.loadKept(key).catch(() => {});
  } else if (e?.what === 'sites') {
    if (s.sites) s.loadSites().catch(() => {});
  } else if (e?.what === 'request' && e.request?.id) s.setRequest(e.request);
});

/** A link of this app, as the browser reaches it. */
export const absolute = (p: string) => `${location.origin}${p}`;

/** The page that a save_page call saved, from what the tool answered: "(page <id>, version <n>)". */
export function savedRef(output?: string): { id: string; version: number } | null {
  const m = /\(page ([a-f0-9]{10}), version (\d+)\)/.exec(output ?? '');
  return m ? { id: m[1], version: Number(m[2]) } : null;
}

/** The request a publish_site call made, from what the tool answered: "(request <id>)". */
export const requestRef = (output?: string): string | null => /\(request ([a-f0-9]{16})\)/.exec(output ?? '')?.[1] ?? null;
