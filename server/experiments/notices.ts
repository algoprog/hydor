// The message a session gets when runs it started with report end. One message, however many ended close together:
// those that end within a few seconds of each other, or while the session is busy and its message still waits in its
// queue, are a line each in it, the latest last. A run the session's agent has read since it ended (experiment_get,
// experiment_wait) is left out. It starts with its head on a line of its own, which the conversation draws as one
// quiet row (shared/experiments.ts experimentNoticeOf), and ends by saying who sent it, as the goal loop's messages do.
import type { Deps } from '../features/types.ts';

export const NOTICE_HEAD = '[Experiments · runs ended]';
export const NOTICE_FOOT = '(This notice is from Experiments, not typed by the user. Nothing to answer unless it changes what you are doing.)';
/** The most lines in one message. */
const LINES = 20;
/** A session at rest waits this long for more runs to end before it is told (the tests make it short). */
export const gather = { ms: 4000 };

/** One line of the message: a run that ended, or a sweep. */
export interface Ending {
  /** The runs the line tells of: it is left out once the session's agent has read them all. */
  runs: string[];
  line: string;
  at: number;
}

interface Box {
  pending: Ending[];
  timer?: NodeJS.Timeout;
  sending?: boolean;
  /** The message that waits in the session's queue, which later endings are added to. */
  waiting?: { id: string; text: string; entries: Ending[] };
}

const boxes = new Map<string, Box>();
/** "<session> <run>": runs a session's agent has read since they ended. */
const seen = new Set<string>();
const SEEN_MAX = 5000;
const BUSY = new Set(['starting', 'working', 'waiting']);

const unread = (key: string, e: Ending) => !e.runs.every((id) => seen.has(`${key} ${id}`));

export function noticeText(entries: Ending[]): string {
  const all = [...entries].sort((a, b) => a.at - b.at);
  const lines = all.slice(0, LINES).map((e) => `- ${e.line.replace(/\s*\n\s*/g, ' ')}`);
  if (all.length > LINES) lines.push(`and ${all.length - LINES} more (experiment_list lists them)`);
  return [NOTICE_HEAD, ...lines, 'experiment_get reads a run’s record and the end of its log.', NOTICE_FOOT].join('\n');
}

/** The box's message while it is still in the queue as it was written (not sent, removed or rewritten by the person). */
function stillWaiting(d: Deps, key: string, box: Box) {
  const w = box.waiting;
  if (w && d.sessions.summary(key)?.queue?.some((m) => m.id === w.id && m.text === w.text)) return w;
  box.waiting = undefined;
  return undefined;
}

/** The waiting message written again with these lines (taken off the queue with none left). False when it has just gone out. */
function rewrite(d: Deps, key: string, box: Box, entries: Ending[]): boolean {
  const id = box.waiting!.id;
  try {
    if (!entries.length) {
      d.sessions.dropQueued(key, id);
      box.waiting = undefined;
    } else {
      const text = noticeText(entries);
      d.sessions.editQueued(key, id, { text });
      box.waiting = { id, text, entries };
    }
    return true;
  } catch {
    box.waiting = undefined;
    return false;
  }
}

async function flush(d: Deps, key: string): Promise<void> {
  const box = boxes.get(key);
  if (!box || box.sending) return;
  box.sending = true;
  try {
    // What ends while a message is being handed over goes round again (and into the queue, the session being at work then).
    while (box.pending.length) {
      const fresh = box.pending.splice(0).filter((e) => unread(key, e));
      if (!fresh.length) continue;
      const waiting = stillWaiting(d, key, box);
      if (waiting && rewrite(d, key, box, [...waiting.entries, ...fresh])) continue;
      const text = noticeText(fresh);
      await d.sessions.deliverOrQueue(key, text).catch(() => {});
      const queued = d.sessions.summary(key)?.queue?.find((m) => m.text === text);
      if (queued) box.waiting = { id: queued.id, text, entries: fresh };
    }
  } catch (e) {
    console.error('[experiments] telling a session:', (e as Error)?.message ?? e);
  } finally {
    box.sending = false;
    if (!box.pending.length && !box.waiting && !box.timer) boxes.delete(key);
  }
}

/** Tells a session that runs it started have ended: now into its queue when it is at work, else after a moment for more. */
export function tellEnded(d: Deps, key: string, e: Ending): void {
  const s = d.sessions.summary(key);
  if (!s) return;
  let box = boxes.get(key);
  if (!box) boxes.set(key, (box = { pending: [] }));
  box.pending.push(e);
  if (box.sending || box.timer) return;
  box.timer = setTimeout(
    () => {
      box.timer = undefined;
      void flush(d, key);
    },
    BUSY.has(s.live?.status ?? '') ? 0 : gather.ms,
  );
  box.timer.unref?.();
}

/** The session's agent has read these runs since they ended: they are not told again, and leave the message that waits. */
export function sawEnded(d: Deps, key: string, ids: string[]): void {
  for (const id of ids) seen.add(`${key} ${id}`);
  for (const old of seen) {
    if (seen.size <= SEEN_MAX) break;
    seen.delete(old);
  }
  const box = boxes.get(key);
  if (!box) return;
  const waiting = stillWaiting(d, key, box);
  if (!waiting) return;
  const left = waiting.entries.filter((e) => unread(key, e));
  if (left.length < waiting.entries.length) rewrite(d, key, box, left);
}
