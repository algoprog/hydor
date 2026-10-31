// A session's spending cap in the pages: where it stands (loaded, then kept current by the server's
// `budget` events) and which session's cap dialog is open (the menu opens it; the dock shows it).
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { BudgetState } from '@shared/budget';
import { api, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';

export const useCapDialog = create<{ key: string | null; open: (key: string) => void; close: () => void }>((set) => ({
  key: null,
  open: (key) => set({ key }),
  close: () => set({ key: null }),
}));

/** Where a session stands against its cap, while `on`; `version` asks again when it changes. */
export function useBudget(key: string, on: boolean, version?: unknown): BudgetState | null {
  const [st, setSt] = useState<BudgetState | null>(null);
  useEffect(() => {
    if (!on) return setSt(null);
    let live = true;
    api<BudgetState>(`/api/budget/${enc(key)}`)
      .then((s) => live && setSt(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, on, version]);
  useFeatureEvent('budget', (e) => {
    if (on && e.key === key) setSt(e.data as BudgetState);
  });
  return st;
}
