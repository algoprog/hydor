// What a session started and still has going, as one list (the work tray above its message box, features/session/WorkTray):
// its child sessions and its background tasks (agents of its own, commands, monitors), each in a state, in the order the
// tray shows them, with the words that sum them up. Plain functions, so tests need no page (work-test.ts).
import { leadsSwarm } from '@shared/swarm';
import type { BackgroundTask, SessionSummary } from '@shared/types';
import { activityOf, isWorking } from './activity';

/** needs: a child waits for you; running: at work; the rest ended. */
export type WorkState = 'needs' | 'running' | 'done' | 'stopped' | 'failed';

export type TaskKind = 'subagent' | 'command' | 'monitor' | 'workflow' | 'task';

export type WorkItem =
  | { type: 'child'; id: string; state: WorkState; /** When it began, or when it last did something once it ended: what the order goes by. */ at: number; s: SessionSummary }
  | { type: 'task'; id: string; state: WorkState; at: number; t: BackgroundTask };

/** The kind of a background task, from the CLI's task types (local_bash, local_agent, …). */
export function taskKindOf(kind?: string): TaskKind {
  const k = (kind ?? '').toLowerCase();
  if (k.includes('bash') || k.includes('shell') || k === 'command') return 'command';
  if (k.includes('agent')) return 'subagent';
  if (k.includes('monitor')) return 'monitor';
  if (k.includes('workflow')) return 'workflow';
  return 'task';
}

/** "Subagent", "Command", "Monitor", "Workflow", or "Background task" for one that is none of those. */
export function taskKindLabel(kind?: string): string {
  switch (taskKindOf(kind)) {
    case 'subagent':
      return 'Subagent';
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

/** The child sessions of one session, oldest first; none for a swarm's or a campaign's lead, whose board shows them. */
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
  /** The tray's line: "2 helper sessions and 1 background task running", or, with none running, "3 helper sessions · 2 background tasks · all done". */
  text: string;
  /** Child sessions waiting for you. */
  needs: number;
  /** What runs: child sessions (those waiting for you too) and tasks. */
  children: number;
  tasks: number;
}

export function workSummary(items: WorkItem[]): WorkSummary {
  const kids = items.filter((i) => i.type === 'child');
  const tasks = items.filter((i) => i.type === 'task');
  const k = kids.filter((i) => i.state === 'running' || i.state === 'needs').length;
  const t = tasks.filter((i) => i.state === 'running').length;
  const needs = kids.filter((i) => i.state === 'needs').length;
  let text: string;
  if (k && t) text = `${k} helper session${k === 1 ? '' : 's'} and ${t} background task${t === 1 ? '' : 's'} running`;
  else if (k) text = `${k} helper session${k === 1 ? '' : 's'} running`;
  else if (t) text = `${t} background task${t === 1 ? '' : 's'} running`;
  else if (kids.length && tasks.length) text = `${kids.length} helper session${kids.length === 1 ? '' : 's'} · ${tasks.length} background task${tasks.length === 1 ? '' : 's'} · all done`;
  else if (kids.length) text = `${kids.length} helper session${kids.length === 1 ? '' : 's'} · all done`;
  else text = `${tasks.length} background task${tasks.length === 1 ? '' : 's'} · all done`;
  return { text, needs, children: k, tasks: t };
}

/** "1 needs you", "2 need you". */
export const needsLine = (n: number) => `${n} need${n === 1 ? 's' : ''} you`;

/**
 * What the message box's Stop button stops, in words: the line under "Stop" in its title (none when it stops only the turn)
 * and its label for screen readers. Each case is a sentence of its own, so each translates as it reads in the language.
 */
export function stopWords(turn: boolean, tasks: number, helpers: number): { note: string | null; label: string } {
  const t = tasks;
  const h = helpers;
  if (turn && t && h)
    return {
      note: `Stops this turn, ${t} background task${t === 1 ? '' : 's'} and ${h} helper session${h === 1 ? '' : 's'}`,
      label: `Stop this turn, ${t} background task${t === 1 ? '' : 's'} and ${h} helper session${h === 1 ? '' : 's'}`,
    };
  if (turn && t) return { note: `Stops this turn and ${t} background task${t === 1 ? '' : 's'}`, label: `Stop this turn and ${t} background task${t === 1 ? '' : 's'}` };
  if (turn && h) return { note: `Stops this turn and ${h} helper session${h === 1 ? '' : 's'}`, label: `Stop this turn and ${h} helper session${h === 1 ? '' : 's'}` };
  if (turn) return { note: null, label: 'Stop the current turn' };
  if (t && h)
    return {
      note: `Stops ${t} background task${t === 1 ? '' : 's'} and ${h} helper session${h === 1 ? '' : 's'}`,
      label: `Stop ${t} background task${t === 1 ? '' : 's'} and ${h} helper session${h === 1 ? '' : 's'}`,
    };
  if (t) return { note: `Stops ${t} background task${t === 1 ? '' : 's'}`, label: `Stop ${t} background task${t === 1 ? '' : 's'}` };
  return { note: `Stops ${h} helper session${h === 1 ? '' : 's'}`, label: `Stop ${h} helper session${h === 1 ? '' : 's'}` };
}
