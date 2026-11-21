// What a new goal starts from (Settings → Capabilities → Goals): its rounds, how much it asks, and the minutes before it goes on
// with its own pick. Loaded once and kept; until it has loaded, the constants stand in. The start page's Goal option and the
// session's Set a goal begin from these.
import { useEffect } from 'react';
import { create } from 'zustand';
import { GOAL_ROUNDS, GOAL_SETTINGS, type GoalDefaults, type GoalSettings } from '@shared/goals';
import { api, put } from '../../lib/api';
import { toastError } from '../../lib/store';

/** What the defaults are before the server has said (and where it cannot): the constants. */
export const FALLBACK_DEFAULTS: GoalDefaults = { rounds: GOAL_ROUNDS, asks: GOAL_SETTINGS.asks, noAnswerMin: GOAL_SETTINGS.noAnswerMin };

/** The defaults as the server has them; null until it has answered. */
export const useGoalDefaultsState = create<{ d: GoalDefaults | null }>(() => ({ d: null }));

let loading = false;
export function loadGoalDefaults(force = false) {
  if (loading && !force) return;
  loading = true;
  api<GoalDefaults>('/api/goal-settings')
    .then((d) => useGoalDefaultsState.setState({ d }))
    .catch(() => {})
    .finally(() => (loading = false));
}

/** Changes any of the three; the answer is what they are now (an error shows as a toast and changes nothing). */
export async function saveGoalDefaults(patch: Partial<GoalDefaults>) {
  try {
    useGoalDefaultsState.setState({ d: await put<GoalDefaults>('/api/goal-settings', patch) });
  } catch (e) {
    toastError(e);
  }
}

/** The defaults (the constants while they load): loaded the first time anything asks. */
export function useGoalDefaults(): GoalDefaults {
  const d = useGoalDefaultsState((s) => s.d);
  useEffect(() => {
    if (!useGoalDefaultsState.getState().d) loadGoalDefaults();
  }, []);
  return d ?? FALLBACK_DEFAULTS;
}

/** The settings a new goal starts with: how much it asks and when it goes on with its own pick. */
export const settingsOfDefaults = (d: GoalDefaults): GoalSettings => ({ asks: d.asks, noAnswerMin: d.noAnswerMin });
