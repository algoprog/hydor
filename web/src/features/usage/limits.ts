// When an account's usage comes back, and which of several comes back first: what the limit notice says when every
// account of an agent is at its limit and Switch accounts at a limit carries sessions on with the first one back.
import type { AgentUsage } from '@shared/types';

/** When an account's usage comes back, as it last said: once the last of its used-up limits resets; null when not known. */
export function backAt(u: AgentUsage | null | undefined): number | null {
  if (!u?.ok) return null;
  const times = [...(u.limited ? [u.limited.resetsAt] : []), ...u.windows.filter((w) => (w.usedPercent ?? 0) >= 100).map((w) => w.resetsAt)];
  return times.length && times.every((t): t is number => typeof t === 'number') ? Math.max(...times) : null;
}

/** Of the accounts given, the one whose usage comes back first (after `now`), and when; null when none says when. */
export function firstBack(pool: { name: string; u: AgentUsage | null | undefined }[], now = Date.now()): { name: string; at: number } | null {
  let first: { name: string; at: number } | null = null;
  for (const a of pool) {
    const at = backAt(a.u);
    if (at && at > now && (!first || at < first.at)) first = { name: a.name, at };
  }
  return first;
}
