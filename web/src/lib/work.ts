// What a session started and still has going, as one list (the work tray above its message box, features/session/WorkTray):
// its Hydor subagents (child sessions) and its background tasks (subagents of its program's own, commands, monitors), each in a state, in the order the
// tray shows them, with the words that sum them up. Plain functions, so tests need no page (work-test.ts).
import { leadsSwarm } from '@shared/swarm';
import type { BackgroundTask, SessionSummary } from '@shared/types';
import { activityOf, isWorking, taskKindOf, type TaskKind } from './activity';

export { taskKindOf, type TaskKind };

/** needs: a child waits for you; running: at work; the rest ended. */
export type WorkState = 'needs' | 'running' | 'done' | 'stopped' | 'failed';

export type WorkItem =
  | { type: 'child'; id: string; state: WorkState; /** When it began, or when it last did something once it ended: what the order goes by. */ at: number; s: SessionSummary }
  | { type: 'task'; id: string; state: WorkState; at: number; t: BackgroundTask };

/**
 * "<program> subagent" (just "Subagent" without the program's name), "Command", "Monitor", "Workflow", or "Background task"
 * for one that is none of those.
 */
export function taskKindLabel(kind?: string, program?: string): string {
  switch (taskKindOf(kind)) {
    case 'subagent':
      return program ? `${program} subagent` : 'Subagent';
    case 'command':
      return 'Command';
    case 'monitor':
      return 'Monitor';
    case 'workflow':
      return 'Workflow';
    default:
      return 'Background task';
  }
}

export function taskState(t: BackgroundTask): WorkState {
  if (t.status === 'running') return 'running';
  if (t.status === 'failed' || t.status === 'error') return 'failed';
  if (t.status === 'stopped' || t.status === 'killed' || t.status === 'cancelled') return 'stopped';
  return 'done';
}

/** How long after a Stop all a child still counts as stopped by it, rather than done, when it moves a moment later. */
const STOP_SLACK_MS = 60_000;

export function childState(s: SessionSummary): WorkState {
  const a = activityOf(s);
  if (a?.status === 'waiting') return 'needs';
  // An idle process with nothing under it is done; anything else alive (a turn, helpers of its own, stopping) is running.
  if (isWorking(a) || (a && a.status !== 'idle')) return 'running';
  if (s.live?.error || s.live?.status === 'error') return 'failed';
  const stopped = s.extra?.stoppedWithParent;
  if (typeof stopped === 'number' && (s.updatedAt ?? 0) <= stopped + STOP_SLACK_MS) return 'stopped';
  return 'done';
}

/** The Hydor subagents (child sessions) of one session, oldest first; none for a swarm's or a campaign's lead, whose board shows them. */
export function childrenOf(byKey: Record<string, SessionSummary>, key: string): SessionSummary[] {
  if (leadsSwarm(byKey[key]?.extra)) return [];
  return Object.values(byKey)
    .filter((x) => x.extra?.parent === key)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.key.localeCompare(b.key));
}

const RANK: Record<WorkState, number> = { needs: 0, running: 1, done: 2, stopped: 2, failed: 2 };

/**
 * The tray's rows: what needs you on top, then what runs (the oldest first, so rows keep their places), then what ended,
 * the newest first. A task listed as running and as ended (one that just ended) is one row, as it stands now.
 */
export function workItems(children: SessionSummary[], tasks: BackgroundTask[]): WorkItem[] {
  const items: WorkItem[] = children.map((s) => {
    const state = childState(s);
    return { type: 'child', id: s.key, state, s, at: state === 'running' || state === 'needs' ? (s.live?.turnStartedAt ?? s.createdAt ?? 0) : (s.updatedAt ?? 0) };
  });
  const seen = new Set<string>();
  for (const t of tasks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const state = taskState(t);
    items.push({ type: 'task', id: t.id, state, t, at: state === 'running' ? (t.startedAt ?? 0) : (t.endedAt ?? t.startedAt ?? 0) });
  }
  return items.sort((a, b) => {
    if (RANK[a.state] !== RANK[b.state]) return RANK[a.state] - RANK[b.state];
    // Running ones keep their places by when they began; ended ones go newest first.
    const d = RANK[a.state] === 2 ? b.at - a.at : a.at - b.at;
    return d || a.id.localeCompare(b.id);
  });
}

export interface WorkSummary {
  /** The tray's line: "2 subagents and 1 background task running", or, with none running, "3 subagents · 2 background tasks · all done". */
  text: string;
  /** Hydor subagents waiting for you. */
  needs: number;
  /** What runs of Hydor subagents (those waiting for you too). */
  children: number;
  /** What runs of background tasks (the program's own subagents too). */
  tasks: number;
}

export function workSummary(items: WorkItem[]): WorkSummary {
  const kids = items.filter((i) => i.type === 'child');
  const tasks = items.filter((i) => i.type === 'task');
  const running = tasks.filter((i) => i.state === 'running');
  const isAgent = (i: WorkItem) => i.type === 'task' && taskKindOf(i.t.kind) === 'subagent';
  const k = kids.filter((i) => i.state === 'running' || i.state === 'needs').length;
  const t = running.length;
  const needs = kids.filter((i) => i.state === 'needs').length;
  // Subagents: Hydor's and the program's own; background tasks: the other tasks.
  const subs = k + running.filter(isAgent).length;
  const bg = t - running.filter(isAgent).length;
  const allSubs = kids.length + tasks.filter(isAgent).length;
  const allBg = tasks.length - tasks.filter(isAgent).length;
  let text: string;
  if (subs && bg) text = `${subs} subagent${subs === 1 ? '' : 's'} and ${bg} background task${bg === 1 ? '' : 's'} running`;
  else if (subs) text = `${subs} subagent${subs === 1 ? '' : 's'} running`;
  else if (bg) text = `${bg} background task${bg === 1 ? '' : 's'} running`;
  else if (allSubs && allBg) text = `${allSubs} subagent${allSubs === 1 ? '' : 's'} · ${allBg} background task${allBg === 1 ? '' : 's'} · all done`;
  else if (allSubs) text = `${allSubs} subagent${allSubs === 1 ? '' : 's'} · all done`;
  else text = `${allBg} background task${allBg === 1 ? '' : 's'} · all done`;
  return { text, needs, children: k, tasks: t };
}

/** "1 needs you", "2 need you". */
export const needsLine = (n: number) => `${n} need${n === 1 ? 's' : ''} you`;

/**
 * What the message box's Stop button stops, in words: the line under "Stop" in its title (none when it stops only the turn)
 * and its label for screen readers. Subagents are Hydor's and the program's own together; tasks are the other background
 * tasks. Each case is a sentence of its own, so each translates as it reads in the language.
 */
export function stopWords(turn: boolean, subagents: number, tasks: number): { note: string | null; label: string } {
  const s = subagents;
  const t = tasks;
  if (turn && s && t)
    return {
      note: `Stops this turn, ${s} subagent${s === 1 ? '' : 's'} and ${t} background task${t === 1 ? '' : 's'}`,
      label: `Stop this turn, ${s} subagent${s === 1 ? '' : 's'} and ${t} background task${t === 1 ? '' : 's'}`,
    };
  if (turn && s) return { note: `Stops this turn and ${s} subagent${s === 1 ? '' : 's'}`, label: `Stop this turn and ${s} subagent${s === 1 ? '' : 's'}` };
  if (turn && t) return { note: `Stops this turn and ${t} background task${t === 1 ? '' : 's'}`, label: `Stop this turn and ${t} background task${t === 1 ? '' : 's'}` };
  if (turn) return { note: null, label: 'Stop the current turn' };
  if (s && t)
    return {
      note: `Stops ${s} subagent${s === 1 ? '' : 's'} and ${t} background task${t === 1 ? '' : 's'}`,
      label: `Stop ${s} subagent${s === 1 ? '' : 's'} and ${t} background task${t === 1 ? '' : 's'}`,
    };
  if (s) return { note: `Stops ${s} subagent${s === 1 ? '' : 's'}`, label: `Stop ${s} subagent${s === 1 ? '' : 's'}` };
  return { note: `Stops ${t} background task${t === 1 ? '' : 's'}`, label: `Stop ${t} background task${t === 1 ? '' : 's'}` };
}
