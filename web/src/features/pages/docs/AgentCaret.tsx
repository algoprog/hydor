// Where an agent's words are arriving in a document it is writing a new version of (live.ts): a caret of the app's
// "busy" colour with a small flag, as a collaborator's cursor shows in Google Docs, at the place its mark names. The
// document scrolls to keep it in view as it moves, unless the reader scrolled themselves in the last few seconds.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { DraftMark } from '@shared/page-drafts';
import type { DocEngine } from './engine';

/** How long the reader's own scrolling holds the page where they put it. */
const HOLD_MS = 4000;

/** The reader scrolled (wheel, touch, keys, the scroll bar) this recently: the page is theirs. */
export function useOwnScroll(scroller: RefObject<HTMLElement | null>): () => boolean {
  const at = useRef(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const mine = () => void (at.current = performance.now());
    const key = (e: KeyboardEvent) => ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(e.key) && mine();
    // A press on the scroller itself (not on what it holds) is its scroll bar.
    const down = (e: PointerEvent) => e.target === el && mine();
    el.addEventListener('wheel', mine, { passive: true });
    el.addEventListener('touchmove', mine, { passive: true });
    el.addEventListener('keydown', key);
    el.addEventListener('pointerdown', down);
    return () => {
      el.removeEventListener('wheel', mine);
      el.removeEventListener('touchmove', mine);
      el.removeEventListener('keydown', key);
      el.removeEventListener('pointerdown', down);
    };
  }, [scroller]);
  return () => performance.now() - at.current < HOLD_MS;
}

/** Scrolls `sc` (at once) so a box of the page (in the window's coordinates) is well in view, unless it is already. */
export function keepInView(sc: HTMLElement, top: number, bottom: number) {
  const box = sc.getBoundingClientRect();
  const margin = Math.min(96, box.height / 5);
  if (top >= box.top + margin && bottom <= box.bottom - margin) return;
  // Into the lower middle: what was just written above it, room for what comes below.
  sc.scrollTop += top - (box.top + box.height * 0.55);
}

export function AgentCaret({ engine, mark, host, scroller, tick }: { engine: DocEngine; mark: DraftMark | null; host: RefObject<HTMLDivElement | null>; scroller: RefObject<HTMLDivElement | null>; tick: string }) {
  const [at, setAt] = useState<{ x: number; y: number; h: number; block: boolean } | null>(null);
  const own = useOwnScroll(scroller);
  useLayoutEffect(() => {
    const h = host.current;
    if (!mark || mark.kind !== 'doc' || !h) return setAt(null);
    const el = engine.elementOf(mark.block);
    if (!el) return setAt(null);
    const hb = h.getBoundingClientRect();
    let r: { left: number; top: number; height: number } | null = null;
    let block = mark.at < 0;
    if (!block) {
      const p = engine.domOf({ b: mark.block, o: mark.at });
      if (p) {
        const range = document.createRange();
        range.setStart(p.node, p.offset);
        range.collapse(true);
        const rects = range.getClientRects();
        const b = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
        if (b.height > 0) r = { left: b.left, top: b.top, height: b.height };
      }
      // An empty block (or a place the browser gives no box for): its start.
      if (!r) {
        const b = el.getBoundingClientRect();
        const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
        r = { left: b.left, top: b.top, height: Math.min(b.height || line, line * 1.2) };
      }
    } else {
      const b = el.getBoundingClientRect();
      r = { left: b.left - 8, top: b.top, height: b.height };
      block = true;
    }
    setAt({ x: r.left - hb.left, y: r.top - hb.top, h: r.height, block });
    const sc = scroller.current;
    if (sc && !own()) keepInView(sc, r.top - 24, r.top + r.height + 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark, tick]);
  if (!at) return null;
  return (
    <div className="pointer-events-none absolute z-10" style={{ left: at.x - 1, top: at.y, height: at.h }} aria-hidden>
      <div className={at.block ? 'h-full w-[3px] rounded-full bg-busy' : 'h-full w-[2px] rounded-full bg-busy'} />
      <div className="absolute bottom-full left-0 mb-px rounded-[3px] bg-busy px-1 text-[10px] leading-[14px] font-semibold whitespace-nowrap text-bg">Agent</div>
    </div>
  );
}
