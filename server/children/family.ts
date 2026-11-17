// Who started whom: a child session keeps its parent's key in its settings (extra.parent).
import type { BackgroundTask, LiveState, SessionSummary } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import { parseExtra, sessionExtra } from '../sessionExtra.ts';

/** The session that started this one, when it is a child session. */
export function parentOf(db: DB, key: string): string | undefined {
  const p = sessionExtra(db, key).parent;
  return typeof p === 'string' && p ? p : undefined;
}

/** A session's child sessions, oldest first. */
export function childKeys(db: DB, key: string): string[] {
  const rows = db.prepare('select key, extra from app_sessions where instr(extra, ?) > 0 order by created_at, key').all(`"parent":${JSON.stringify(key)}`) as { key: string; extra: string }[];
  return rows.filter((r) => parseExtra(r.extra).parent === key).map((r) => r.key);
}

/** A child session's live statuses that mean it is running: its turn is going, starting or waiting for an answer. */
const RUNNING_STATUSES = new Set(['starting', 'working', 'waiting']);

export const isRunningStatus = (status: string | undefined) => !!status && RUNNING_STATUSES.has(status);

type LiveWork = Pick<LiveState, 'status' | 'backgroundTasks'>;

/** The background tasks of a live session still running (none once its process has ended or failed). */
const runningTasks = (live?: LiveWork | null): BackgroundTask[] =>
  live && live.status !== 'exited' && live.status !== 'error' ? (live.backgroundTasks ?? []).filter((t) => t.status === 'running') : [];

/**
 * A live session's status as its parent counts it: "working" also while it is between turns with background tasks
 * still running (its program's own subagents, commands, monitors, workflows), since it is not finished until they end.
 */
export const workStatus = (live: LiveWork): string => (live.status === 'idle' && runningTasks(live).length ? 'working' : live.status);

/**
 * What a session still has at work besides its own turn, in words for an agent: "2 subagents and 1 background task it
 * started are still running" (subagents: its program's own and its Hydor subagents), or '' when nothing is.
 */
export function stillRunning(s: Pick<SessionSummary, 'live' | 'helpers'>): string {
  const tasks = runningTasks(s.live);
  const agents = tasks.filter((t) => (t.kind ?? '').toLowerCase().includes('agent')).length;
  const subs = agents + (s.helpers ?? 0);
  const other = tasks.length - agents;
  const parts = [subs ? `${subs} subagent${subs === 1 ? '' : 's'}` : '', other ? `${other} background task${other === 1 ? '' : 's'}` : ''].filter(Boolean);
  if (!parts.length) return '';
  return `${parts.join(' and ')} it started ${subs + other === 1 ? 'is' : 'are'} still running`;
}

/** The session that started this one, and the one that started that, and so on (never the same session twice). */
export function ancestorsOf(db: DB, key: string): string[] {
  const out: string[] = [];
  const seen = new Set([key]);
  for (let cur = parentOf(db, key); cur && !seen.has(cur); cur = parentOf(db, cur)) {
    out.push(cur);
    seen.add(cur);
  }
  return out;
}

/**
 * For each session, which of its child sessions are running. A child is running when its own status says so
 * (`statuses`: what is live now, by key, as workStatus gives it, so one between turns whose background tasks still run
 * counts), or when it is itself kept working by running children of its own, so a lead whose helper waits on a helper
 * of its own is still at work. Works from the live ones upwards, so it needs no search of every session, and it holds
 * when a parent's own process has stopped between turns.
 */
export function runningChildren(db: DB, statuses: Iterable<[string, string | undefined]>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [key, status] of statuses) {
    if (!isRunningStatus(status)) continue;
    // Each step up: this session is running, so its parent has a running child, and so on up the family.
    let child = key;
    for (const parent of ancestorsOf(db, key)) {
      let set = out.get(parent);
      if (!set) out.set(parent, (set = new Set()));
      set.add(child);
      child = parent;
    }
  }
  return out;
}

/**
 * Everything running below a session that "Stop all" stops: its running child sessions, theirs in turn, and so on
 * (`running`: runningChildren's answer). Each comes after the one that started it, once, whatever loops the settings
 * hold; the session itself is not in the list.
 */
export function runningBelow(running: Map<string, Set<string>>, key: string): string[] {
  const out: string[] = [];
  const seen = new Set([key]);
  const walk = (parent: string) => {
    for (const child of running.get(parent) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      walk(child);
    }
  };
  walk(key);
  return out;
}
