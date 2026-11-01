// What the pages know of spaces: the list (with each one's sessions counted), loaded once and kept up to date
// by the server's news.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { SpaceView } from '@shared/spaces';
import { api } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';

export const useSpacesStore = create<{ list: SpaceView[] | null }>(() => ({ list: null }));

let listening = false;
export function loadSpaces() {
  if (!listening) {
    listening = true;
    onFeatureEvent('spaces', () => loadSpaces());
  }
  api<{ spaces: SpaceView[] }>('/api/spaces')
    .then((r) => useSpacesStore.setState({ list: r.spaces }))
    .catch(() => {});
}

/** The spaces (null until known), loaded on first use. */
export function useSpaces(): SpaceView[] | null {
  const list = useSpacesStore((s) => s.list);
  useEffect(() => {
    if (!list) loadSpaces();
  }, [list]);
  return list;
}
