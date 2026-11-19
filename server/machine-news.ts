// What happened on a machine while you looked at another: the sessions that finished (or need you) there since you
// last looked at it. Pure parts only (server/machines.ts follows the other machines, server/index.ts this one), so
// machine-news-test.ts runs them on their own.
import { EventEmitter } from 'node:events';
import type { MachineCounts, MachineNews, SessionSummary } from '../shared/types.ts';

/** The most sessions a machine's news lists. */
export const NEWS_MAX = 5;

/** What of a session the news needs: its list is kept for hundreds of sessions on each machine. */
export interface Brief {
  key: string;
  title: string;
  status?: string;
  doneAt?: number;
  seenAt?: number;
  endedAt?: number;
  /** A run that ended in an error (only known while its process lives). */
  failed?: boolean;
  /** Archived, or a program subagent of another session: neither is news. */
  hidden?: boolean;
  /** Its child sessions still run: it is not done. */
  busy?: boolean;
}

export function briefOf(s: SessionSummary): Brief {
  const status = s.live?.status ?? s.external?.status;
  return {
    key: s.key,
    title: s.title,
    status,
    doneAt: s.doneAt,
    seenAt: s.seenAt,
    endedAt: s.endedAt,
    failed: status === 'error' || undefined,
    hidden: !!s.archived || !!s.subagentOf || undefined,
    busy: !!s.helpers || undefined,
  };
}

/**
 * Sessions needing you and working now, and those that finished since `lookedAt` (when you last looked at that machine;
 * Infinity while you look at it now: nothing there is news) and since you last opened the session (`seenAt`), newest first.
 */
export function newsOf(sessions: Iterable<Brief>, lookedAt: number): Required<MachineCounts> {
  let waiting = 0;
  let working = 0;
  const news: MachineNews[] = [];
  for (const s of sessions) {
    if (s.hidden) continue;
    if (s.status === 'waiting') waiting++;
    else if (s.status === 'working' || s.status === 'starting') working++;
    if (s.status === 'waiting' || s.status === 'working' || s.status === 'starting' || s.busy) continue;
    // A failed end is not a `doneAt`: its time is when the turn ended.
    const at = s.failed ? Math.max(s.doneAt ?? 0, s.endedAt ?? 0) : (s.doneAt ?? 0);
    if (at > 0 && at > Math.max(s.seenAt ?? 0, lookedAt)) news.push({ key: s.key, title: s.title, at, ...(s.failed ? { failed: true } : {}) });
  }
  news.sort((a, b) => b.at - a.at);
  return { waiting, working, finished: news.length, news: news.slice(0, NEWS_MAX) };
}

/**
 * When you last looked at each machine ('' is this server): a machine is looked at while a page shows it (its main socket
 * is open); `at` is then Infinity, and when the last page leaves, that moment is kept (and saved, so a restart does not
 * make what you saw news again). A machine with nothing kept starts from now: no backlog.
 */
export class Looked extends EventEmitter {
  private viewers = new Map<string, number>();
  private kept: Record<string, number>;

  constructor(
    saved: Record<string, number>,
    private save: (kept: Record<string, number>) => void,
    private now: () => number = Date.now,
  ) {
    super();
    this.kept = { ...saved };
  }

  /** Makes sure there is a time for `id` (a machine just added, or never looked at since this began). */
  ensure(id: string) {
    if (this.kept[id] === undefined) {
      this.kept[id] = this.now();
      this.save(this.kept);
    }
  }

  at(id: string): number {
    if ((this.viewers.get(id) ?? 0) > 0) return Infinity;
    this.ensure(id);
    return this.kept[id];
  }

  /** A page shows it now; returns what ends that (call it once). */
  enter(id: string): () => void {
    const n = (this.viewers.get(id) ?? 0) + 1;
    this.viewers.set(id, n);
    if (n === 1) this.emit('change', id);
    let left = false;
    return () => {
      if (left) return;
      left = true;
      // Forgotten meanwhile (the machine was removed).
      if (!this.viewers.has(id)) return;
      const rest = (this.viewers.get(id) ?? 1) - 1;
      if (rest > 0) return void this.viewers.set(id, rest);
      this.viewers.delete(id);
      this.kept[id] = this.now();
      this.save(this.kept);
      this.emit('change', id);
    };
  }

  forget(id: string) {
    this.viewers.delete(id);
    if (this.kept[id] === undefined) return;
    delete this.kept[id];
    this.save(this.kept);
  }

  /** The server stops: what is looked at now was seen up to now. */
  flush() {
    for (const [id, n] of this.viewers) if (n > 0) this.kept[id] = this.now();
    this.save(this.kept);
  }
}
