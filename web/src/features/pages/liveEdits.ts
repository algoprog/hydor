// An agent's edits of a file shown beside a session's conversation (or over everything), made in it as they come: the
// server sends each Edit's input as the model writes it (server/pages/drafts.ts), and this makes the edits of the
// file shown on its text as the view read it (shared/file-edits.ts), at a steady pace, for the view to show in place of
// that text, the part being changed marked and kept in view. An edit that has run stays made over the text until the
// view has read the file again (it has the edit then), or a moment has passed; one that failed or never ran is
// dropped. A view with changes of its own not saved shows none (they stay as they are).
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PageDraft } from '@shared/pages';
import { liveFileEdit } from '@shared/file-edits';
import { useDrafts } from './state';

/** The session whose agent's edits a file shown inside follows: the panel beside its conversation, or its view over everything. */
export const EditsOf = createContext<string | null>(null);

/** What a view shows while an agent changes the file it shows. */
export interface ShownEdit {
  /** The file's text with the agent's edits made so far; null once the text the view read has them all (from..to are in it then). */
  text: string | null;
  /** The part being changed (or, while `placing`, the words it is about to change). */
  from: number;
  to: number;
  placing: boolean;
  /** An edit is still being written (else it is made, or about to run). */
  writing: boolean;
  /** Counts the changes shown: a view brings the part into view again with each. */
  n: number;
}

/** How often what is shown is made again, at most (ms). */
const PACE = 200;
/** An edit that has run stays made over the text read before it this long at most, until the view reads the file again (it looks every second while an agent works, else every three). */
const BRIDGE_MS = 5000;
/** The part just changed stays marked this long once the edits are all in the file. */
const AFTER_MS = 1600;

/** The edits of `path` in a session's drafts, oldest first. */
function editsOf(drafts: Record<string, PageDraft> | undefined, path: string | null): PageDraft[] {
  if (!drafts || !path) return [];
  return Object.values(drafts)
    .filter((d) => d.tool === 'edit' && d.path === path)
    .sort((a, b) => a.startedAt - b.startedAt);
}

/** Whether an agent's edit of the file `path` is being made now (written, or waiting to run), in a session. */
export function useEditing(sessionKey: string | null, path: string | null): boolean {
  return useDrafts((s) => (sessionKey && path ? Object.values(s.byKey[sessionKey] ?? {}).some((d) => d.tool === 'edit' && d.path === path && !d.failed && !d.ran) : false));
}

const same = (a: ShownEdit | null, b: Omit<ShownEdit, 'n'> | null) =>
  a === b || (!!a && !!b && a.text === b.text && a.from === b.from && a.to === b.to && a.placing === b.placing && a.writing === b.writing);

/**
 * The text of the file at `path` with the edits of the session's agent made over `base` (the text as the view read it,
 * `readAt` the time it did: Date.now()), at most every PACE ms; null when none is being made. `mtime`: the file's time
 * as the view read it, which says for sure whether an edit that ran is in it (else the time it was read says).
 * `html`: a page, whose tag still being written waits. `off`: the view has changes of its own not saved (nothing is
 * made over them). `sessionKey`: the session, when no EditsOf around says it.
 */
export function useAgentEdits(
  path: string | null,
  base: string | null,
  readAt: number,
  o: { mtime?: number; html?: boolean; off?: boolean; sessionKey?: string | null } = {},
): ShownEdit | null {
  const ctx = useContext(EditsOf);
  const key = o.sessionKey ?? ctx;
  const mine = useDrafts((s) => (key ? s.byKey[key] : undefined));
  const edits = useMemo(() => editsOf(mine, path), [mine, path]);
  // Each edit seen going (written, or waiting to run), and when each was first heard of as run: 0 when it had run before
  // this view saw it, so the text it read has it already.
  const seenGoing = useRef(new Set<string>());
  const ranAt = useRef(new Map<string, number>());
  for (const d of edits) {
    if (!d.ran && !d.failed) seenGoing.current.add(d.id);
    else if (d.ran && !ranAt.current.has(d.id)) ranAt.current.set(d.id, seenGoing.current.has(d.id) ? Date.now() : 0);
  }
  const [tick, setTick] = useState(0);
  const [out, setOut] = useState<ShownEdit | null>(null);
  const shown = useRef<ShownEdit | null>(null);
  const n = useRef(0);
  const last = useRef(0);
  const timer = useRef(0);
  const later = useRef(0);
  const lastMark = useRef<{ from: number; to: number; at: number; id: string } | null>(null);
  const now = useRef({ edits, base, readAt, mtime: o.mtime, html: !!o.html, off: !!o.off });
  now.current = { edits, base, readAt, mtime: o.mtime, html: !!o.html, off: !!o.off };

  useEffect(() => {
    const put = (v: Omit<ShownEdit, 'n'> | null) => {
      if (same(shown.current, v)) return;
      shown.current = v && { ...v, n: v.text === null ? n.current : ++n.current };
      setOut(shown.current);
    };
    const make = () => {
      timer.current = 0;
      last.current = performance.now();
      window.clearTimeout(later.current);
      const { edits: list, base: b, readAt: read, mtime, html, off } = now.current;
      if (b == null || off) {
        lastMark.current = null;
        return put(null);
      }
      const t = Date.now();
      let text = b;
      let mark: { from: number; to: number; placing: boolean; id: string } | null = null;
      let writing = false;
      // When something changes with time alone: an edit that ran stops being made over the text, a mark fades.
      let next = Infinity;
      for (const d of list) {
        if (d.failed) continue;
        if (d.ran) {
          const at = ranAt.current.get(d.id) ?? 0;
          // Run before this view saw it, or long enough ago that the view has it: nothing to make.
          if (!at || t - at > BRIDGE_MS) continue;
          // In the text read since it ran: by the file's time when both are known, else by when it was read.
          if (d.mtime !== undefined && mtime !== undefined ? mtime >= d.mtime : read > at) continue;
          next = Math.min(next, at + BRIDGE_MS + 1);
        }
        if (!d.done) writing = true;
        const r = liveFileEdit(text, d.text, { html });
        if (!r) continue;
        text = r.text;
        mark = { from: r.from, to: r.to, placing: r.placing, id: d.id };
      }
      if (mark) {
        lastMark.current = { from: mark.from, to: mark.to, at: t, id: mark.id };
        put({ text, from: mark.from, to: mark.to, placing: mark.placing, writing });
      } else {
        // All in the file now: the part just changed stays marked for a moment, in the text as read (not when the
        // edit that changed it failed: nothing changed there).
        const lm = lastMark.current;
        if (lm && t - lm.at < AFTER_MS && lm.to <= b.length && !list.some((d) => d.id === lm.id && d.failed)) {
          put({ text: null, from: lm.from, to: lm.to, placing: false, writing: false });
          next = Math.min(next, lm.at + AFTER_MS + 1);
        } else {
          lastMark.current = null;
          put(null);
        }
      }
      if (next < Infinity) later.current = window.setTimeout(() => setTick((x) => x + 1), Math.max(50, next - t));
    };
    const wait = PACE - (performance.now() - last.current);
    if (wait <= 0) make();
    else if (!timer.current) timer.current = window.setTimeout(make, wait);
  }, [edits, base, readAt, o.mtime, o.html, o.off, tick]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(later.current);
    },
    [],
  );
  return out;
}
