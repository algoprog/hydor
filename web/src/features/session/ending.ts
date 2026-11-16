// How a session's work ended (shared/ending.ts: the server reads it too), and how its status says so.
import type { SessionEnd } from '@shared/ending';

export { sessionEnd, type Ending, type SessionEnd } from '@shared/ending';

/** "Done · 2 files made", "Done · 3 files changed", "Stopped", "Failed". */
export function endingLabel(e: SessionEnd): string {
  const word = e.ended === 'done' ? 'Done' : e.ended === 'failed' ? 'Failed' : 'Stopped';
  if (e.ended !== 'done') return word;
  // Made and changed together count as changed: every one of them is a file the work touched.
  const n = e.made + e.changed;
  if (!n) return word;
  if (!e.changed) return e.made === 1 ? 'Done · 1 file made' : `Done · ${e.made} files made`;
  return n === 1 ? 'Done · 1 file changed' : `Done · ${n} files changed`;
}
