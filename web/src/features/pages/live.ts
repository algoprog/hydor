// An agent's save of a document, deck, spreadsheet or LaTeX document, shown as it comes in: the server sends the
// call's input as the model writes it (server/pages/drafts.ts), and this finds the save of the page in view (in the
// session's panel, the call itself; in the page's own editor, any session's save of it, heard of through page:<id>),
// reads what has come so far at a steady pace (a few times a second, however fast the pieces come) and makes the
// version being written over the one shown (shared/page-drafts.ts), for the editor to show until the saved version
// takes its place, or (the call failed or stopped) the version shown is back.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PageDraft } from '@shared/pages';
import { readPartial } from '@shared/partial-json';
import { DraftMemo, DRAFT_TOOLS, type DraftKind, type DraftTool, type Drafted } from '@shared/page-drafts';
import { draftDoc } from '@shared/draft-doc';
import { draftDeck } from '@shared/draft-deck';
import { normalizeDoc } from '@shared/docs';
import { normalizeDeck } from '@shared/slides';
import { newBook } from '@shared/sheets';
import { normalizeTex } from '@shared/latex';
import { live as socket } from '../../lib/ws';
import type { LiveDraft } from './kinds';
import { useDrafts } from './state';

/** How often the version being written is drawn again, at most (ms). */
const PACE = 220;
/** A call written whole whose save never says how it went (the server restarted, say) stops showing after this. */
const STALE_MS = 10 * 60_000;

export const isDraftTool = (t: string): t is DraftTool => Object.prototype.hasOwnProperty.call(DRAFT_TOOLS, t);
/** The kind of page a draft saves; null for a page of HTML or a file. */
export const draftKind = (d: PageDraft | null | undefined): DraftKind | null => (d && isDraftTool(d.tool) ? DRAFT_TOOLS[d.tool] : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILD: Partial<Record<DraftKind, (base: any, p: ReturnType<typeof readPartial>, memo: DraftMemo) => Drafted<any> | null>> = {
  doc: draftDoc,
  slides: draftDeck,
};

/** An empty one of a kind: the editor of a new one being written starts from it. */
export function emptyModel(kind: DraftKind): unknown {
  if (kind === 'doc') return normalizeDoc({ markdown: '' });
  if (kind === 'slides') return normalizeDeck({ slides: [{ layout: 'blank' }] });
  if (kind === 'sheet') return newBook();
  return normalizeTex({ main: '' });
}

/**
 * The save of a page being written now. With `item` (a call in a session's conversation), that call's draft; else the
 * newest save of `pageId` from any session, its news heard of while `watch` (the page's own editor).
 */
export function usePageDraft(pageId: string | undefined, o: { sessionKey?: string; item?: string; watch?: boolean } = {}): PageDraft | null {
  const { sessionKey, item, watch } = o;
  useEffect(() => {
    if (!watch || !pageId) return;
    const off = socket.sub(`page:${pageId}`);
    useDrafts
      .getState()
      .loadPage(pageId)
      .catch(() => {});
    return off;
  }, [watch, pageId]);
  return useDrafts((s) => {
    if (sessionKey && item) return s.byKey[sessionKey]?.[item] ?? null;
    if (!pageId) return null;
    let best: PageDraft | null = null;
    for (const m of Object.values(s.byKey)) for (const d of Object.values(m)) if (isDraftTool(d.tool) && d.pageId === pageId && (!best || d.startedAt > best.startedAt)) best = d;
    return best;
  });
}

/**
 * The version a draft is writing over `base` (the version shown, `version`; none for a new page), drawn again at most
 * every PACE ms; null when nothing is being written, the call failed, or its saved version is shown.
 */
export function useLiveDraft<M>(kind: DraftKind | null | undefined, base: M | null | undefined, version: number | undefined, draft: PageDraft | null): LiveDraft<M> | null {
  // The version shown when the draft was first seen: one newer than it means the save is in (or another came).
  const seen = useRef<{ id: string; version: number | undefined } | null>(null);
  if (draft && seen.current?.id !== draft.id) seen.current = { id: draft.id, version };
  const on =
    !!draft &&
    !!kind &&
    draftKind(draft) === kind &&
    !!BUILD[kind] &&
    !draft.failed &&
    !(draft.saved && version !== undefined && version >= draft.saved.version) &&
    !(draft.done && !draft.saved && version !== undefined && seen.current?.version !== undefined && version > seen.current.version) &&
    !(draft.done && !draft.saved && Date.now() - draft.startedAt > STALE_MS);
  const memo = useMemo(() => new DraftMemo(), [draft?.id, base]);
  const [out, setOut] = useState<{ id: string; live: LiveDraft<M> | null } | null>(null);
  const now = useRef({ draft, base, kind, memo });
  now.current = { draft, base, kind, memo };
  const last = useRef(0);
  const timer = useRef(0);
  const n = useRef(0);
  useEffect(() => {
    if (!on) {
      window.clearTimeout(timer.current);
      timer.current = 0;
      setOut(null);
      return;
    }
    const build = () => {
      timer.current = 0;
      last.current = performance.now();
      const { draft: d, base: b, kind: k, memo: m } = now.current;
      if (!d || !k) return;
      let r: Drafted<M> | null = null;
      try {
        r = BUILD[k]!(b ?? null, readPartial(d.text), m);
      } catch {
        // What cannot be shown yet waits for the next pieces.
        return;
      }
      setOut({ id: d.id, live: r ? { model: r.model, mark: d.done ? null : r.mark, done: d.done, n: ++n.current } : null });
    };
    // The first draw at once; then at the pace, the last pieces always drawn.
    const wait = PACE - (performance.now() - last.current);
    if (wait <= 0 || !n.current) build();
    else if (!timer.current) timer.current = window.setTimeout(build, wait);
  }, [on, draft?.text, draft?.done, base]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Another draft's drawing never shows for this one, even for a moment.
  return on && out?.id === draft?.id ? out.live : null;
}
