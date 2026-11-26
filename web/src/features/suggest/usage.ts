// What word suggestions did, as counts only: every text box's controller reports into this one batch (one for the tab),
// sent with POST /api/suggest/usage every 15 seconds while there is something to send, and when the page is hidden
// (a request that outlives the page), so closing the tab loses nothing. The rules that make the counts are in logic.ts.
// The guesses judged (right or not, by how sure they were: never any word) go in the same batch.
import type { SuggestCounts, SuggestJudged, SuggestPlan, SuggestThresholds, SuggestUsage } from '@shared/suggest';
import { ApiError, api, lostOnTheWay } from '../../lib/api';
import { viaLink } from '../../lib/machine';
import { addCounts, addVerdict, hasCounts, hasJudged, mergeJudged, noCounts, splitCounts } from './logic';
import { useSuggest } from './store';

export const FLUSH_MS = 15_000;

let pending: SuggestCounts = noCounts();
let judged: SuggestJudged = {};
let timer: ReturnType<typeof setTimeout> | undefined;

const later = () => {
  timer ??= setTimeout(() => void flushUsage(), FLUSH_MS);
};

/** A controller's counts join the batch. */
export function recordUsage(c: Partial<SuggestCounts>): void {
  if (viaLink) return;
  pending = addCounts(pending, c);
  if (hasCounts(pending)) later();
}

/** A guess judged against what was then typed joins the batch. */
export function recordJudged(plan: SuggestPlan, conf: number, right: boolean): void {
  if (viaLink) return;
  addVerdict(judged, plan, conf, right);
  later();
}

/** Forget what has not been sent yet (the numbers were reset, so it would count from before). */
export function discardUsage(): void {
  clearTimeout(timer);
  timer = undefined;
  pending = noCounts();
  judged = {};
}

/**
 * Send what is in the batch. A request the network lost, or the server could not answer, goes back in the batch for
 * the next time; one the server refused (a version without the route) is dropped. `leaving`: the page is being hidden.
 */
export async function flushUsage(_leaving = false): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (!hasCounts(pending) && !hasJudged(judged)) return;
  // The judged guesses go with the first piece (with no counts at all, in a piece of their own).
  const pieces: (Partial<SuggestCounts> & { judged?: SuggestJudged })[] = splitCounts(pending);
  if (hasJudged(judged)) pieces[0] = { ...pieces[0], judged };
  pending = noCounts();
  judged = {};
  // Always a request that outlives the page (a few bytes, far under keepalive's limit): one on its way as the tab closes
  // or the page is left is not cut off, and what it carried is not lost.
  const sent = await Promise.allSettled(pieces.map((p) => api<{ usage: SuggestUsage; thresholds: SuggestThresholds }>('/api/suggest/usage', { method: 'POST', body: p, keepalive: true })));
  let again = false;
  sent.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const { usage, thresholds } = r.value;
      if (usage) useSuggest.setState((s) => (s.status ? { status: { ...s.status, usage, ...(thresholds ? { thresholds } : {}) } } : s));
    } else if (lostOnTheWay(r.reason) || (r.reason instanceof ApiError && r.reason.status >= 500)) {
      const { judged: j, ...counts } = pieces[i];
      pending = addCounts(pending, counts);
      if (j) mergeJudged(judged, j);
      again = true;
    }
  });
  if (again) later();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushUsage(true);
  });
  window.addEventListener('pagehide', () => void flushUsage(true));
}
