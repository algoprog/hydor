// A capability's own news from the server ({ t: 'feature', id, key?, data }): a browser's frame, a
// memory update, a search provider's state. Components listen by the capability's id.
import { useEffect, useRef } from 'react';

type Handler = (e: { key?: string; data: unknown }) => void;
const handlers = new Map<string, Set<Handler>>();

export function onFeatureEvent(id: string, fn: Handler): () => void {
  let set = handlers.get(id);
  if (!set) handlers.set(id, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

export function emitFeatureEvent(id: string, e: { key?: string; data: unknown }) {
  for (const fn of handlers.get(id) ?? []) fn(e);
}

/** Listens while mounted; `fn` may change between renders. */
export function useFeatureEvent(id: string, fn: Handler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onFeatureEvent(id, (e) => ref.current(e)), [id]);
}

/** What the message box did with words given to it: sent them as a message, or put them in the box. */
export type Composed = 'sent' | 'added';

/**
 * Asks the message box of the session on screen (or the start page's) to add text: a choice clicked in
 * a page. With `replace`, that earlier text gives way to this one where it still is (a choice changed). With `send`,
 * the text is sent at once as a message of its own (a card's Send button), and whatever is being written stays in the
 * box; with `send: 'empty'` only when the box is empty (a follow-up's button), else it joins what is being written.
 * A box that cannot send now (a message still on its way, a session running elsewhere, a move to another agent
 * picked) adds it as usual. Returns what the box did with it; nothing when no message box took it.
 */
export function composeInsert(text: string, key?: string, replace?: string, opts?: { send?: boolean | 'empty' }): Composed | undefined {
  const detail: ComposeDetail = { text, key, replace, send: opts?.send };
  window.dispatchEvent(new CustomEvent('hydor:compose', { detail }));
  return detail.result;
}

/** The `hydor:compose` event's detail; the box that takes it sets `result`, and another box of the session leaves it. */
export interface ComposeDetail {
  text: string;
  key?: string;
  replace?: string;
  send?: boolean | 'empty';
  files?: unknown[];
  result?: Composed;
}

/** The same words sent again within this long (a double click) go once. */
export const RESEND_MS = 3000;

/**
 * What a message box does with words given to it: sends them as a message of their own, adds them to the box, or
 * nothing ('again': the same words it sent a moment ago, as a double click gives). `box` is what the box holds now and
 * whether it can send now; `last` the words a card sent last through it, and when.
 */
export function composeAction(d: ComposeDetail, box: { text: string; files: number; canSend: boolean }, last: { text: string; at: number }, now = Date.now()): 'send' | 'add' | 'again' {
  const t = d.text.trim();
  if (!d.send || !t || d.replace || d.files?.length) return 'add';
  if (last.text === t && now - last.at < RESEND_MS) return 'again';
  const empty = !box.text.trim() && !box.files;
  return box.canSend && (d.send === true || empty) ? 'send' : 'add';
}

/** The message box's text with `next` in: in place of `old` where that still is, else added at the end. */
export function putText(cur: string, next: string, old?: string): string {
  if (old && cur.includes(old)) {
    if (next) return cur.replace(old, next);
    // An emptied choice takes a space beside it along.
    return cur.includes(` ${old}`) ? cur.replace(` ${old}`, '') : cur.includes(`${old} `) ? cur.replace(`${old} `, '') : cur.replace(old, '');
  }
  if (!next) return cur;
  // A block of lines (a form's answers) starts on a line of its own.
  return cur.trim() ? `${cur.replace(/\s*$/, '')}${next.includes('\n') || cur.includes('\n') ? '\n' : ' '}${next}` : next;
}
