// A message sent from a session's box shows at once, before the server has it: in the conversation with the agent at
// work under it (Timeline.tsx), or with the messages waiting for the turn to end (QueueList.tsx), as it will show once
// it is there. The server can take a moment or more to hand a message to its agent (the notes memory has for it, an
// agent that has to start again), and the session's own copy shows only then: it takes this one's place as it shows.
// One that did not go comes off again, and its box has it back (Composer.tsx). Nothing here reaches the browser's
// own APIs, so a script test runs it as it is (outgoing-test.ts).
import { create } from 'zustand';
import type { QueuedMessage, TimelineItem, UserItem } from '@shared/types';

/** A sent message lists its other files (not pictures) at its end; split them off for display. */
export function splitAttachedFiles(text: string): { text: string; files: string[] } {
  const m = /(?:^|\n+)Attached files:\n((?:- [^\n]+\n?)+)$/.exec(text);
  if (!m) return { text, files: [] };
  return { text: text.slice(0, m.index), files: m[1].trim().split('\n').map((l) => l.slice(2)) };
}

/** A message on its way from this page. */
export interface Outgoing {
  id: string;
  /** Its words, as sent. */
  text: string;
  /** The names of its files (not its pictures). */
  files: string[];
  /** How many pictures went with it. */
  images: number;
  /** Its pictures as its box had them, to show while it waits in the queue (the conversation has them from lib/attachments.ts). */
  pictures: string[];
  /** When it was sent. */
  at: number;
  /** How many items the session's transcript had when it was sent: its copy there comes after them (null: not loaded then). */
  after: number | null;
  /** The messages the conversation had outside the transcript (the agent's live copies) when it was sent: not its copy. */
  before: string[];
  /** The messages waiting in the queue when it was sent: not its copy. */
  waiting: string[];
  /** It went to the queue, or the server put it there: it shows with the messages waiting, not in the conversation. */
  queued: boolean;
  /** When the server took it. */
  went?: number;
  /** Its copy has shown: it shows no more, and only keeps a later message with the same words from taking that copy. */
  shown?: boolean;
}

/** By session. */
export const useOutgoing = create<{ byKey: Record<string, Outgoing[]> }>(() => ({ byKey: {} }));

const change = (key: string, f: (list: Outgoing[]) => Outgoing[]) =>
  useOutgoing.setState((s) => {
    const list = f(s.byKey[key] ?? []);
    const byKey = { ...s.byKey };
    if (list.length) byKey[key] = list;
    else delete byKey[key];
    return { byKey };
  });

/** How long a message the server took waits for its copy to show (a connection back after a drop): then it goes, shown or not. */
const WAIT_MS = 20_000;
/** How far this device's clock and the server's may be apart: a message sent before the conversation loaded has its copy among the transcript's messages from that long before it on. */
const CLOCKS_MS = 60_000;
/** How long one whose copy showed stays on the list, so that a later message with the same words does not take that copy. */
const KEEP_MS = 3 * 60_000;

let nextId = 1;

/**
 * Session `key`'s box sends a message: it shows from now. The result is told how it went: `went` false, it did not go
 * and comes off; `queued`, the server put it in the queue instead of handing it to the agent.
 */
export function sendingMessage(key: string, m: Omit<Outgoing, 'id' | 'at' | 'went' | 'shown'>): (went: boolean, queued?: boolean) => void {
  const id = `sending-${nextId++}`;
  change(key, (l) => [...l, { ...m, id, at: Date.now() }]);
  return (went, queued) => {
    if (!went) return change(key, (l) => l.filter((o) => o.id !== id));
    change(key, (l) => l.map((o) => (o.id === id ? { ...o, went: Date.now(), queued: o.queued || !!queued } : o)));
    setTimeout(() => change(key, (l) => l.filter((o) => o.id !== id || o.shown)), WAIT_MS);
  };
}

/** The copies of these messages (by their ids) show now: the messages themselves show no more. */
export function sentShown(key: string, ids: string[]) {
  if (!useOutgoing.getState().byKey[key]?.some((o) => !o.shown && ids.includes(o.id))) return;
  change(key, (l) => l.map((o) => (!o.shown && ids.includes(o.id) ? { ...o, shown: true } : o)));
  setTimeout(() => change(key, (l) => l.filter((o) => !ids.includes(o.id))), KEEP_MS);
}

/** A message's words as the conversation shows them. */
const wordsOf = (text: string) => splitAttachedFiles(text).text.trim();

/**
 * Which messages of a conversation are the copies of those sent from here: the copy's id by the sent one's. In the order
 * they were sent, each takes the first message with its words (and pictures, if it had any) that no earlier one took and
 * that came after it was sent: in the transcript after the items it had then (`after`), or outside it (the agent's live
 * copy) and not there then (`before`). One sent to the queue may show here too, once it went out: those sent to the agent
 * choose first, since their copies come now. `items`: the conversation, the first `saved` of them the transcript's.
 */
export function copiesInConversation(list: Outgoing[] | undefined, items: TimelineItem[], saved: number): Map<string, string> {
  const out = new Map<string, string>();
  if (!list?.length) return out;
  const taken = new Set<number>();
  for (const o of [...list.filter((o) => !o.queued), ...list.filter((o) => o.queued)]) {
    const before = new Set(o.before);
    const earlier = (it: TimelineItem) => (o.after == null ? (it.ts ?? 0) < o.at - CLOCKS_MS : it.seq < o.after);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind !== 'user' || taken.has(i) || (i < saved ? earlier(it) : before.has(it.id))) continue;
      if (!!it.images !== o.images > 0 || wordsOf(it.text) !== o.text) continue;
      taken.add(i);
      out.set(o.id, it.id);
      break;
    }
  }
  return out;
}

/** Those sent to the agent whose copy does not show yet (`copies`, copiesInConversation), as the conversation will show them. */
export function sendingItems(list: Outgoing[] | undefined, copies: Map<string, string>): UserItem[] {
  const out: UserItem[] = [];
  for (const o of list ?? []) {
    if (o.queued || o.shown || copies.has(o.id)) continue;
    // Its files listed at its end, as the server lists them: the message shows them as it will once it is there.
    const text = o.files.length ? `${o.text ? `${o.text}\n\n` : ''}Attached files:\n${o.files.map((f) => `- ${f}`).join('\n')}` : o.text;
    out.push({ kind: 'user', id: o.id, seq: 0, ts: o.at, text, images: o.images || undefined, sending: true });
  }
  return out;
}

/** Which messages waiting in the queue are the copies of those sent there from here: the copy's id by the sent one's. */
export function copiesInQueue(list: Outgoing[] | undefined, queue: QueuedMessage[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const o of list ?? []) {
    if (!o.queued) continue;
    const m = queue.find((m) => !taken.has(m.id) && !o.waiting.includes(m.id) && !!m.images === o.images > 0 && m.text.trim() === o.text);
    if (!m) continue;
    taken.add(m.id);
    out.set(o.id, m.id);
  }
  return out;
}

/** Those sent to the queue whose copy does not show there yet (`copies`, copiesInQueue). */
export const sendingQueued = (list: Outgoing[] | undefined, copies: Map<string, string>): Outgoing[] =>
  (list ?? []).filter((o) => o.queued && !o.shown && !copies.has(o.id));

/** How long after the server took a message the agent shows at work under it, should its session not say so by then. */
const SETTLE_MS = 1500;

/**
 * Whether a message sent from here to the agent is on its way, or the server took it a moment ago: the agent shows at
 * work under it already, as under a session just started (StartingSession.tsx), until its session says so itself.
 * `workedAt`: when the session was last seen at work; a message sent before that was taken up already.
 */
export const onItsWay = (list: Outgoing[] | undefined, now = Date.now(), workedAt = 0) =>
  !!list?.some((o) => !o.queued && workedAt < o.at && (o.went == null || now - o.went < SETTLE_MS));

/**
 * When onItsWay stops holding, once the server took each of them; null while none was sent, or one is still on its way
 * (its answer changes the list, and this is asked again then).
 */
export function settlesAt(list: Outgoing[] | undefined): number | null {
  const mine = (list ?? []).filter((o) => !o.queued);
  if (!mine.length || mine.some((o) => o.went == null)) return null;
  return Math.max(...mine.map((o) => o.went! + SETTLE_MS));
}
