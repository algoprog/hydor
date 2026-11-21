// Who started whom: a child session keeps its parent's key in its settings (extra.parent).
import type { SessionExtra } from '../../shared/features.ts';
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

/** How a lead's message to its Hydor subagent begins (message_child). */
export const FROM_LEAD = 'Message from the session that started you:';

/**
 * Whether a message is one agents send each other through the app: a lead's to its Hydor subagent (message_child), or
 * a Hydor subagent's report to its lead (its reply, how it stopped, its step up a tier).
 */
export const betweenAgents = (text: string) => text.startsWith(`${FROM_LEAD}\n`) || /^\[(Reply from the|The) Hydor subagent "/.test(text);

/**
 * Whether the queue of a session still at work when the app restarted goes out when its turn ends, as it would have
 * without the restart, instead of waiting for Resume like every other queue then: only when it holds nothing but what
 * agents sent each other (no attachments) and no Stop all came after any of it was queued. Nobody watches those queues
 * to press Resume: on 2026-11-21 a restart held a lead's next request to its subagent, which finished its turn, and the
 * two sat idle, each waiting for the other.
 */
export function queueGoesOn(queue: { text: string; at: number; attachments: number }[], extra: SessionExtra): boolean {
  if (!queue.length || !queue.every((m) => betweenAgents(m.text) && !m.attachments)) return false;
  const stopped = Math.max(Number(extra.stoppedAll) || 0, Number(extra.stoppedWithParent) || 0);
  return queue.every((m) => m.at > stopped);
}

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
