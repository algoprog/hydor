// Assistants in the pages: the list and the settings beside it, loaded on first use and kept current
// when the server says they changed; the start page's last pick.
import { useEffect } from 'react';
import { create } from 'zustand';
import { DEFAULT_ASSISTANT, type Assistant, type AssistantsState } from '@shared/assistants';
import { api } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';

export const useAssistants = create<{ state: AssistantsState | null; load: () => Promise<void>; set: (s: AssistantsState) => void }>((set) => ({
  state: null,
  async load() {
    set({ state: await api<AssistantsState>('/api/assistants') });
  },
  set: (state) => set({ state }),
}));

let listening = false;
/** The assistants and their settings, loaded on first use and kept current. */
export function useAssistantsState(): AssistantsState | null {
  useEffect(() => {
    if (listening) return;
    listening = true;
    const load = () =>
      useAssistants
        .getState()
        .load()
        .catch(() => {});
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    onFeatureEvent('assistants', () => {
      clearTimeout(t);
      t = setTimeout(load, 200);
    });
  }, []);
  return useAssistants((s) => s.state);
}

export const assistantIn = (s: AssistantsState | null, id: string | undefined): Assistant | undefined => s?.assistants.find((a) => a.id === (id ?? DEFAULT_ASSISTANT));

const LAST = 'wa.lastAssistant';
/** The assistant picked last on the start page (General the first time). */
export function lastAssistant(): string {
  try {
    return localStorage.getItem(LAST) || DEFAULT_ASSISTANT;
  } catch {
    return DEFAULT_ASSISTANT;
  }
}
export function rememberAssistant(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {}
}
