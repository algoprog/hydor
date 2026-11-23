// What word suggestions did, as counts only: every text box's controller reports into this one batch (one for the tab),
// sent with POST /api/suggest/usage every 15 seconds while there is something to send, and when the page is hidden
// (a request that outlives the page), so closing the tab loses nothing. The rules that make the counts are in logic.ts.
import type { SuggestCounts, SuggestUsage } from '@shared/suggest';
import { ApiError, api, lostOnTheWay } from '../../lib/api';
import { viaLink } from '../../lib/machine';
import { addCounts, hasCounts, noCounts, splitCounts } from './logic';
import { useSuggest } from './store';

export const FLUSH_MS = 15_000;

let pending: SuggestCounts = noCounts();
let timer: ReturnType<typeof setTimeout> | undefined;

/** A controller's counts join the batch. */
export function recordUsage(c: Partial<SuggestCounts>): void {
  if (viaLink) return;
  pending = addCounts(pending, c);
  if (!timer && hasCounts(pending)) timer = setTimeout(() => void flushUsage(), FLUSH_MS);
}

/** Forget what has not been sent yet (the numbers were reset, so it would count from before). */
export function discardUsage(): void {
  clearTimeout(timer);
  timer = undefined;
  pending = noCounts();
}

/**
 * Send what is in the batch. A request the network lost, or the server could not answer, goes back in the batch for
 * the next time; one the server refused (a version without the route) is dropped. `leaving`: the page is being hidden.
 */
export async function flushUsage(_leaving = false): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (!hasCounts(pending)) return;
  const pieces = splitCounts(pending);
  pending = noCounts();
  // Always a request that outlives the page (a few bytes, far under keepalive's limit): one on its way as the tab closes
  // or the page is left is not cut off, and what it carried is not lost.
  const sent = await Promise.allSettled(pieces.map((p) => api<{ usage: SuggestUsage }>('/api/suggest/usage', { method: 'POST', body: p, keepalive: true })));
  let again = false;
  sent.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const { usage } = r.value;
      if (usage) useSuggest.setState((s) => (s.status ? { status: { ...s.status, usage } } : s));
    } else if (lostOnTheWay(r.reason) || (r.reason instanceof ApiError && r.reason.status >= 500)) {
      pending = addCounts(pending, pieces[i]);
      again = true;
    }
  });
  if (again && !timer) timer = setTimeout(() => void flushUsage(), FLUSH_MS);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushUsage(true);
  });
  window.addEventListener('pagehide', () => void flushUsage(true));
}
