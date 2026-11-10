// What the Agents pages know beside the agents themselves: each one's activity (its schedules, sessions at work
// or waiting, what it spent this month), loaded on first use and kept current; the tiers (Settings → Models →
// Tiers); and the words that describe an agent in sentences.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { AgentActivity, Assistant, ToolKind } from '@shared/assistants';
import type { TaskSchedule } from '@shared/automations';
import type { SpaceView } from '@shared/spaces';
import { tierLabel, type TeamSettings, type Tier, type TierMap } from '@shared/tiers';
import { api } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { useApp } from '../../lib/store';
import { tr } from '../../i18n/runtime';

export const useActivity = create<{ byId: Record<string, AgentActivity> | null }>(() => ({ byId: null }));

let loading = false;
export function loadActivity() {
  if (loading) return;
  loading = true;
  api<{ activity: Record<string, AgentActivity> }>('/api/assistants/activity')
    .then((r) => useActivity.setState({ byId: r.activity }))
    .catch(() => {})
    .finally(() => (loading = false));
}

let listening = false;
/** Every agent's activity, loaded on first use, again when agents or tasks change, and every half minute while shown. */
export function useAgentActivity(): Record<string, AgentActivity> | null {
  useEffect(() => {
    if (!listening) {
      listening = true;
      onFeatureEvent('assistants', loadActivity);
      onFeatureEvent('automations', loadActivity);
    }
    loadActivity();
    const t = setInterval(loadActivity, 30_000);
    return () => clearInterval(t);
  }, []);
  return useActivity((s) => s.byId);
}

/** The tiers as set, and how sessions use them (the team): as the page opened with them, then as the server has them. */
export const useTiers = create<{ tiers: TierMap | null; team: TeamSettings | null }>(() => ({ tiers: useApp.getState().boot?.tiers ?? null, team: useApp.getState().boot?.team ?? null }));
let tiersAsked = false;
function askTiers() {
  if (tiersAsked) return;
  tiersAsked = true;
  const load = () => api<{ tiers: TierMap; team?: TeamSettings }>('/api/models/tiers').then((r) => useTiers.setState({ tiers: r.tiers, team: r.team ?? null }));
  load().catch(() => (tiersAsked = false));
  onFeatureEvent('assistants', () => void load().catch(() => {}));
}
/** The tiers as set (each program's model and effort for Quick, Standard, Best and Max), loaded once. */
export function useTierMap(): TierMap | null {
  useEffect(askTiers, []);
  const boot = useApp((s) => s.boot?.tiers);
  return useTiers((s) => s.tiers) ?? boot ?? null;
}
/** How sessions use the tiers (Settings → Models → Tiers): the team on or off, Max for hard problems; null on a server from before them. */
export function useTeam(): TeamSettings | null {
  useEffect(askTiers, []);
  const boot = useApp((s) => s.boot?.team);
  return useTiers((s) => s.team) ?? boot ?? null;
}

// ---- in words -------------------------------------------------------------------------------------------

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "every weekday at 08:00", "every 2 hours": when a schedule runs, inside a sentence. */
export function whenText(s: TaskSchedule): string {
  if (s.kind === 'daily') {
    const d = s.days?.length ? [...s.days].sort() : null;
    const days = !d || d.length === 7 ? 'every day' : d.join() === '1,2,3,4,5' ? 'every weekday' : d.join() === '0,6' ? 'at weekends' : `on ${d.map((x) => DAY[x]).join(', ')}`;
    return `${days} at ${s.time}`;
  }
  if (s.kind === 'every') return s.minutes % 60 === 0 ? (s.minutes === 60 ? 'every hour' : `every ${s.minutes / 60} hours`) : `every ${s.minutes} minutes`;
  if (s.kind === 'once') return 'once';
  if (s.kind === 'webhook') return 'when its webhook is called';
  if (s.kind === 'watch') return 'when something it watches changes';
  return 'on its own schedule';
}

/** When an agent works, from its schedules: "when asked", one schedule's words, or how many. */
export function schedulesText(list: { schedule: TaskSchedule; enabled: boolean }[]): string {
  const on = list.filter((s) => s.enabled);
  if (!on.length) return list.length ? 'when asked (its schedules are paused)' : 'when asked';
  return on.length === 1 ? whenText(on[0].schedule) : `on ${on.length} schedules`;
}

/** "everywhere", "in Hydor", "in Hydor and PhD", "in 3 projects". */
export function whereText(a: Pick<Assistant, 'projects'>, spaces: SpaceView[] | null): string {
  if (!a.projects?.length) return 'everywhere';
  const names = a.projects.map((id) => spaces?.find((s) => s.id === id)?.name ?? tr('a project'));
  return names.length <= 2 ? `in ${names.join(' and ')}` : `in ${names.length} projects`;
}

const DOES: Record<ToolKind, string> = { read: 'read files', edit: 'change files', run: 'run commands', web: 'use the web', mcp: 'use other tools' };

/** "read files and use the web"; "do anything" when it may use everything. */
export function toolsText(a: Pick<Assistant, 'tools'>): string {
  if (!a.tools) return 'use anything it needs';
  if (!a.tools.length) return 'only answer, with no tools';
  const xs = a.tools.map((t) => DOES[t]);
  return xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** "no other agents", "Translator", "Translator and Test runner". */
export function asksText(a: Pick<Assistant, 'canAsk'>, all: Assistant[]): string {
  const names = (a.canAsk ?? []).map((id) => all.find((x) => x.id === id)?.name).filter(Boolean) as string[];
  if (!names.length) return 'no other agents';
  return names.length <= 3 ? (names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`) : `${names.length} other agents`;
}

export const tierText = (t?: Tier) => tierLabel(t);

/** How an agent is doing, for its card: at work, waiting for you, its budget spent, or idle. */
export function statusOf(a: Assistant, act?: AgentActivity): { label: string; tone: 'work' | 'need' | 'stop' | 'idle' } {
  if (act?.waiting) return { label: 'Needs you', tone: 'need' };
  if (act?.working) return { label: act.working === 1 ? 'Working' : `Working · ${act.working}`, tone: 'work' };
  if (a.budgetUsd && act && act.monthUsd >= a.budgetUsd) return { label: 'Budget spent', tone: 'stop' };
  return { label: 'Idle', tone: 'idle' };
}

/** The next time one of its schedules runs, if any is on and timed. */
export const nextRunOf = (act?: AgentActivity): number | undefined =>
  act?.schedules
    .filter((s) => s.enabled && s.nextAt)
    .map((s) => s.nextAt!)
    .sort((x, y) => x - y)[0];
