// What the pages know of swarms: each one's board (and a campaign's parts), loaded when shown and kept up to
// date by the server's events, and the swarm's size from Settings → Subagents (for the start page).
import { useEffect } from 'react';
import { create } from 'zustand';
import type { ChildSettings } from '@shared/children';
import { campaignParts, type SwarmBoard, type SwarmPost } from '@shared/swarm';
import { api, enc, put } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toastError } from '../../lib/store';

export const useBoards = create<{ byKey: Record<string, SwarmBoard> }>(() => ({ byKey: {} }));

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  onFeatureEvent('swarm', (e) => {
    const key = e.key;
    const d = e.data as { post?: SwarmPost; stopped?: string[] };
    if (!key) return;
    useBoards.setState((s) => {
      const b = s.byKey[key];
      if (!b) return s;
      // A campaign's parts take each post in as the server reads them all.
      if (d.post && !b.posts.some((p) => p.id === d.post!.id)) return { byKey: { ...s.byKey, [key]: { ...b, posts: [...b.posts, d.post].slice(-300), ...(b.mode === 'campaign' ? { parts: campaignParts([d.post], b.parts ?? []) } : {}) } } };
      if (d.stopped?.length) return { byKey: { ...s.byKey, [key]: { ...b, stopped: [...new Set([...b.stopped, ...d.stopped])] } } };
      return s;
    });
  });
}

/** Loads a swarm's board (again). */
export function loadBoard(key: string) {
  listen();
  api<SwarmBoard>(`/api/swarm/${enc(key)}`)
    .then((b) => useBoards.setState((s) => ({ byKey: { ...s.byKey, [key]: b } })))
    .catch(() => {});
}

export const useChildSettings = create<{ st: ChildSettings | null }>(() => ({ st: null }));

let asked = false;
/** Settings → Subagents: how many children, and how many swarm members, work at once. */
export function useChildSettingsState(): ChildSettings | null {
  const st = useChildSettings((s) => s.st);
  useEffect(() => {
    if (asked) return;
    asked = true;
    api<ChildSettings>('/api/children/settings')
      .then((r) => useChildSettings.setState({ st: r }))
      .catch(() => (asked = false));
  }, []);
  return st;
}

export const saveChildSettings = (patch: Partial<ChildSettings>) =>
  put<ChildSettings>('/api/children/settings', patch)
    .then((r) => useChildSettings.setState({ st: r }))
    .catch(toastError);
