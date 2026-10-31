// Rate limits for what anyone may call (the public page, API keys): how many times a name (an
// address, a key) was let through within a window, kept in memory. A restart forgets them; the daily
// caps, counted from the runs in the database, do not.

export class Limiter {
  private hits = new Map<string, number[]>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
    setInterval(() => this.sweep(), 10 * 60_000).unref?.();
  }

  /** Lets one more through for `name` if fewer than `limit` passed in the last `windowMs`; returns whether it did. */
  take(name: string, limit: number, windowMs: number): boolean {
    const t = this.now();
    const list = (this.hits.get(name) ?? []).filter((x) => x > t - windowMs);
    if (list.length >= limit) {
      this.hits.set(name, list);
      return false;
    }
    list.push(t);
    this.hits.set(name, list);
    return true;
  }

  /** How long until `name` may go again, in ms (0: now). */
  wait(name: string, limit: number, windowMs: number): number {
    const t = this.now();
    const list = (this.hits.get(name) ?? []).filter((x) => x > t - windowMs);
    return list.length < limit ? 0 : Math.max(0, list[list.length - limit] + windowMs - t);
  }

  /** Gives back the last one let through (the run did not start after all). */
  undo(name: string) {
    this.hits.get(name)?.pop();
  }

  private sweep() {
    const t = this.now();
    for (const [k, list] of this.hits) if (!list.length || list[list.length - 1] < t - 24 * 3600_000) this.hits.delete(k);
  }
}

/** "in 12 min", for a refusal. */
export function waitText(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m <= 1) return 'in a minute';
  if (m < 60) return `in ${m} min`;
  const h = Math.ceil(m / 60);
  return `in ${h} hour${h > 1 ? 's' : ''}`;
}
