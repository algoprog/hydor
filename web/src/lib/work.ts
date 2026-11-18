// What a session started and still has going, as one list (the work tray above its message box, features/session/WorkTray):
// its Hydor subagents (child sessions), its program's own subagents (Claude Code's, Codex's) and its background tasks
// (commands, monitors), each in a state, in the order the tray shows them, with the words that sum them up. Plain
// functions, so tests need no page (work-test.ts).
import { leadsSwarm } from '@shared/swarm';
import type { Agent, BackgroundTask, SessionSummary, TimelineItem } from '@shared/types';
import { activityOf, isWorking, taskKindOf, type TaskKind } from './activity';

export { taskKindOf, type TaskKind };

/** needs: a child waits for you; running: at work; the rest ended. */
export type WorkState = 'needs' | 'running' | 'done' | 'stopped' | 'failed';

export type WorkItem =
  | { type: 'child'; id: string; state: WorkState; /** When it began, or when it last did something once it ended: what the order goes by. */ at: number; s: SessionSummary }
  | { type: 'task'; id: string; state: WorkState; at: number; t: BackgroundTask }
  | { type: 'sub'; id: string; state: WorkState; at: number; sub: ProgramSub };

/** A subagent of the session's own program (a "Claude Code subagent", a "Codex subagent"), as its call and its task tell. */
export interface ProgramSub {
  /** Its own conversation's key, once its id is known: claude:agent-<id>, codex:<thread id>. */
  key?: string;
  id?: string;
  /** The id of the call that started it (its task names the call). */
  toolUseId?: string;
  title: string;
  type?: string;
  model?: string;
  state: WorkState;
  startedAt?: number;
  endedAt?: number;
}

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

/** A program subagent's own conversation key, made from its id: claude:agent-<id>, codex:<thread id>. */
export const programSubKey = (agent: Agent, id: string): string | undefined => (agent === 'claude' ? `claude:agent-${id}` : agent === 'codex' ? `codex:${id}` : undefined);

/**
 * The subagents of the session's own program: one for each call that started one (the timeline's `tool.subagent`), and
 * one for each subagent task no call matched (a call not loaded yet). A task matches a call by its id or by the call's id.
 * Its task, while there is one, says how it stands; without one the call's own state stands, except that a subagent
 * still running when the program no longer runs (`alive` false) has ended: stopped (Claude Code), done (Codex, whose older
 * rollouts do not say when one finished).
 */
export function programSubs(agent: Agent, items: TimelineItem[], tasks: BackgroundTask[], alive: boolean): ProgramSub[] {
  const agents = tasks.filter((t) => taskKindOf(t.kind) === 'subagent');
  const used = new Set<BackgroundTask>();
  const out: ProgramSub[] = [];
  for (const it of items) {
    if (it.kind !== 'tool' || !it.tool.subagent) continue;
    const sa = it.tool.subagent;
    const t = agents.find((x) => (sa.id && x.id === sa.id) || x.toolUseId === it.id);
    // Tasks listed twice (running, then ended) are one: the first stands.
    for (const x of agents) if (t && x.id === t.id) used.add(x);
    const id = sa.id ?? t?.id;
    const key = sa.key ?? (id ? programSubKey(agent, id) : undefined);
    let state: WorkState;
    if (t) state = taskState(t);
    // Its program no longer runs, yet nothing says it ended. Claude Code writes how each of its agents ended, so one with
    // nothing written died with it; Codex's older rollouts never wrote that a subagent finished, so it most likely did.
    else state = sa.state === 'running' && !alive ? (agent === 'codex' ? 'done' : 'stopped') : sa.state;
    out.push({
      ...(key ? { key } : {}),
      ...(id ? { id } : {}),
      toolUseId: it.id,
      title: sa.title,
      ...(sa.type ? { type: sa.type } : {}),
      ...(sa.model ? { model: sa.model } : {}),
      state,
      ...((t?.startedAt ?? it.ts) ? { startedAt: t?.startedAt ?? it.ts } : {}),
      ...((t?.endedAt ?? sa.endedAt) ? { endedAt: t?.endedAt ?? sa.endedAt } : {}),
    });
  }
  const seen = new Set<string>();
  for (const t of agents) {
    if (used.has(t) || seen.has(t.id)) continue;
    seen.add(t.id);
    const key = programSubKey(agent, t.id);
    out.push({ ...(key ? { key } : {}), id: t.id, ...(t.toolUseId ? { toolUseId: t.toolUseId } : {}), title: t.description, state: taskState(t), ...(t.startedAt ? { startedAt: t.startedAt } : {}), ...(t.endedAt ? { endedAt: t.endedAt } : {}) });
  }
  return out;
}

/** The subagent task that stands for a program subagent (by its id, or its call's id), when the program lists one. */
export const taskOfSub = (sub: ProgramSub, tasks: BackgroundTask[]): BackgroundTask | undefined =>
  tasks.find((t) => taskKindOf(t.kind) === 'subagent' && ((!!sub.id && t.id === sub.id) || (!!sub.toolUseId && t.toolUseId === sub.toolUseId)));

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
 * the newest first. A task listed as running and as ended (one that just ended) is one row, as it stands now. The
 * program's own subagents (`subs`, programSubs) are rows of their own, in place of the subagent tasks they cover.
 */
export function workItems(children: SessionSummary[], tasks: BackgroundTask[], subs: ProgramSub[] = []): WorkItem[] {
  const items: WorkItem[] = children.map((s) => {
    const state = childState(s);
    return { type: 'child', id: s.key, state, s, at: state === 'running' || state === 'needs' ? (s.live?.turnStartedAt ?? s.createdAt ?? 0) : (s.updatedAt ?? 0) };
  });
  const seen = new Set<string>();
  const covered = (t: BackgroundTask) => taskKindOf(t.kind) === 'subagent' && subs.some((x) => x.id === t.id || (!!t.toolUseId && x.toolUseId === t.toolUseId));
  for (const sub of subs) {
    const id = sub.key ?? sub.id ?? sub.toolUseId ?? sub.title;
    if (seen.has(`sub:${id}`)) continue;
    seen.add(`sub:${id}`);
    items.push({ type: 'sub', id, state: sub.state, sub, at: sub.state === 'running' ? (sub.startedAt ?? 0) : (sub.endedAt ?? sub.startedAt ?? 0) });
  }
  for (const t of tasks) {
    if (seen.has(t.id) || covered(t)) continue;
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
  /** What runs of background tasks and of the program's own subagents. */
  tasks: number;
}

export function workSummary(items: WorkItem[]): WorkSummary {
  const kids = items.filter((i) => i.type === 'child');
  // The program's own subagents, as their rows (sub) or as tasks that no row covers.
  const tasks = items.filter((i) => i.type !== 'child');
  const running = tasks.filter((i) => i.state === 'running');
  const isAgent = (i: WorkItem) => i.type === 'sub' || (i.type === 'task' && taskKindOf(i.t.kind) === 'subagent');
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

/** A state that is still going: waiting for you, or at work. */
export const isLiveState = (state: WorkState): boolean => state === 'needs' || state === 'running';

/** The states a group's header counts, in the order it shows them. */
const COUNT_ORDER: WorkState[] = ['needs', 'running', 'done', 'stopped', 'failed'];

/** How many of a group's subagents stand in each state, only the states that have any, in the order the header shows them. */
export function groupCounts(states: WorkState[]): { state: WorkState; n: number }[] {
  return COUNT_ORDER.map((state) => ({ state, n: states.filter((x) => x === state).length })).filter((c) => c.n > 0);
}

/**
 * The rows of an open group, in the order it lists them: `live` (what needs you first, then what runs, each the one that
 * started first on top, so rows keep their places), `failed` (in start order too), and `ended` (done or stopped, the one
 * that ended last first). Rows that tie keep the order they came in.
 */
export function groupOrder<T extends { state: WorkState; startedAt?: number; endedAt?: number }>(rows: T[]): { live: T[]; failed: T[]; ended: T[] } {
  const at = (r: T) => r.startedAt ?? 0;
  const indexed = rows.map((r, i) => ({ r, i }));
  const by = (keep: (r: T) => boolean, cmp: (a: T, b: T) => number) =>
    indexed
      .filter((x) => keep(x.r))
      .sort((a, b) => cmp(a.r, b.r) || a.i - b.i)
      .map((x) => x.r);
  return {
    live: by((r) => isLiveState(r.state), (a, b) => Number(b.state === 'needs') - Number(a.state === 'needs') || at(a) - at(b)),
    failed: by((r) => r.state === 'failed', (a, b) => at(a) - at(b)),
    ended: by((r) => r.state === 'done' || r.state === 'stopped', (a, b) => (b.endedAt ?? b.startedAt ?? 0) - (a.endedAt ?? a.startedAt ?? 0)),
  };
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
