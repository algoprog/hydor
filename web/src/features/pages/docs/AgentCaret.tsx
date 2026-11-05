// Where an agent's words are arriving in a document it is writing a new version of (live.ts): a caret of the app's
// "busy" colour with a small flag, as a collaborator's cursor shows in Google Docs, at the place its mark names. The
// document scrolls to keep it in view as it moves, unless the reader scrolled themselves in the last few seconds.
import { useLayoutEffect, useState, type RefObject } from 'react';
import type { DraftMark } from '@shared/page-drafts';
import { keepInView, useOwnScroll } from '../live';
import type { DocEngine } from './engine';

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
