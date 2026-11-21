// What the pages know of goals: each session's goal as the app's own loop keeps it (shared/goals.ts), loaded when the
// session shows and kept up to date by the server's "goal" events, and the actions that change it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { GoalAction, GoalState } from '@shared/goals';
import { api, enc, post } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toastError } from '../../lib/store';

/** byKey: the goal of each session that was asked about; null where it has none (or it was dismissed). */
export const useGoals = create<{ byKey: Record<string, GoalState | null> }>(() => ({ byKey: {} }));

/** Events seen for each session, so a load that was slow does not replace what an event brought after it. */
const seen: Record<string, number> = {};

const put = (key: string, goal: GoalState | null) => {
  seen[key] = (seen[key] ?? 0) + 1;
  useGoals.setState((s) => ({ byKey: { ...s.byKey, [key]: goal } }));
};

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  onFeatureEvent('goal', (e) => {
    if (!e.key) return;
    const d = e.data as { goal?: GoalState | null } | null;
    put(e.key, d?.goal ?? null);
  });
}

/** Loads a session's goal (again). */
export function loadGoal(key: string) {
  listen();
  const n = seen[key] ?? 0;
  api<{ goal: GoalState | null }>(`/api/goals/${enc(key)}`)
    .then((r) => {
      if ((seen[key] ?? 0) !== n) return;
      useGoals.setState((s) => ({ byKey: { ...s.byKey, [key]: r.goal ?? null } }));
    })
    .catch(() => {});
}

/** A session's goal, loaded when it shows; undefined until the server has answered. */
export function useGoal(key: string, load = true): GoalState | null | undefined {
  const g = useGoals((s) => s.byKey[key]);
  useEffect(() => {
    if (load) loadGoal(key);
  }, [key, load]);
  return g;
}

/**
 * Does something to a session's goal: set it, agree the checks, answer, pause, stop… The answer is the goal as it stands
 * (the event brings it too). Errors show as a toast and give null.
 */
export async function act(key: string, action: GoalAction, fail?: (message: string) => void): Promise<GoalState | null | undefined> {
  // An event that came while the call was out is newer than its answer: the answer does not replace it.
  const n = seen[key] ?? 0;
  try {
    const r = await post<{ goal: GoalState | null }>(`/api/sessions/${enc(key)}/goal`, action);
    if ((seen[key] ?? 0) === n) put(key, r.goal ?? null);
    return r.goal;
  } catch (e) {
    // A caller that shows the sentence itself (under its fields) takes it; otherwise it is a toast.
    if (fail) fail(e instanceof Error ? e.message : String(e));
    else toastError(e);
    return undefined;
  }
}

/** For the tests and the development preview: a goal given as the server would, without it. */
export const showGoal = put;

/** `act` for a component: the call, and whether one is on its way (its buttons wait meanwhile). */
export function useAct(key: string) {
  const [busy, setBusy] = useState(false);
  // One call at a time: a second press (Ctrl+Enter twice) while one is out does nothing.
  const out = useRef(false);
  const run = useCallback(
    async (action: GoalAction, fail?: (message: string) => void) => {
      if (out.current) return undefined;
      out.current = true;
      setBusy(true);
      try {
        return await act(key, action, fail);
      } finally {
        out.current = false;
        setBusy(false);
      }
    },
    [key],
  );
  return [run, busy] as const;
}
