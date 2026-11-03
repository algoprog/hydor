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

/**
 * Asks the message box of the session on screen (or the start page's) to add text: a choice clicked in
 * a page. With `replace`, that earlier text gives way to this one where it still is (a choice changed).
 */
export function composeInsert(text: string, key?: string, replace?: string) {
  window.dispatchEvent(new CustomEvent('hydor:compose', { detail: { text, key, replace } }));
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
