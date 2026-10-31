// Where each of Custom's turns ends in its conversation, so a fork or "Edit from here" can cut the
// conversation there. Positions count every message the conversation has had: when it is condensed to
// fit the model's context (old tool output cleared, the start replaced by a summary), the messages
// kept are the same objects, so how far they moved tells how positions map onto the new list.
import type { ChatMessage } from './llm.ts';

export interface TurnLog {
  /** Position of messages[0] among all the messages the conversation has had. */
  offset: number;
  /** Positions before this were condensed into a summary: no exact cut there. */
  floor: number;
  /** For each turn (the app's id for its prompt), the position just after its last message. */
  ends: { id: string; at: number }[];
}

interface Tracked {
  messages: ChatMessage[];
  turnLog?: TurnLog;
}

/** The messages as they were at the last look, per session. */
const seen = new WeakMap<object, ChatMessage[]>();

/** Follows what changed in the conversation since the last call; called before each save. */
export function track(s: Tracked) {
  const log = (s.turnLog ??= { offset: 0, floor: 0, ends: [] });
  const prev = seen.get(s);
  const cur = s.messages;
  seen.set(s, cur.slice());
  // Only added to (the usual case), or first seen since the state was loaded.
  if (!prev || (prev.length <= cur.length && prev.every((m, i) => cur[i] === m))) return;
  const where = new Map(cur.map((m, i) => [m, i]));
  let moved: number | undefined;
  let first = Infinity;
  for (let i = prev.length - 1; i >= 0; i--) {
    const n = where.get(prev[i]);
    if (n === undefined) continue;
    moved ??= i - n;
    first = Math.min(first, n);
  }
  if (moved === undefined) {
    // Nothing stayed the same: the new list stands for all of it so far.
    const end = prev.length + log.offset;
    log.offset = end - cur.length;
    log.floor = end;
    return;
  }
  log.offset += moved;
  log.floor = Math.max(log.floor, first + log.offset);
}

/** The turn `id` ended: a fork from its reply starts with the conversation as it is now. */
export function endTurn(s: Tracked, id: string | undefined) {
  if (!id) return;
  track(s);
  const log = s.turnLog!;
  log.ends = [...log.ends.filter((e) => e.id !== id), { id, at: s.messages.length + log.offset }];
}

/**
 * Where to cut `length` messages to keep the turns up to and including `order[k]` (the app's order
 * of prompts), or null when that point was condensed away or never noted. A turn with no mark of its
 * own (its prompt never reached Custom) added nothing, so the one before it says where to cut.
 */
export function cutAt(log: TurnLog | undefined, order: string[], k: number, length: number): number | null {
  if (k < 0) return 0;
  if (!log) return null;
  const ends = new Map(log.ends.map((e) => [e.id, e.at]));
  for (let j = Math.min(k, order.length - 1); j >= 0; j--) {
    const at = ends.get(order[j]);
    if (at === undefined) continue;
    if (at < log.floor) return null;
    const i = at - log.offset;
    return i >= 0 && i <= length ? i : null;
  }
  return null;
}
