// What a session's page shows for now: the view a capability gives it (an app's run as its result), which
// opens first where there is one, or the conversation. Kept for the page's life, not across reloads.
import { create } from 'zustand';

export type SessionShow = 'pane' | 'conversation';

export const useSessionShow = create<{ byKey: Record<string, SessionShow>; show: (key: string, v: SessionShow) => void }>((set) => ({
  byKey: {},
  show: (key, v) => set((s) => ({ byKey: { ...s.byKey, [key]: v } })),
}));
