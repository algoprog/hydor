// What a table offers over the page: a handle on each border between two columns, dragged to make one wider and the
// other narrower (the table's width stays the paper's), its columns' shares kept in the model when the drag ends.
// And printing: the document as it prints, changes not yet saved included, put in a frame of its own and printed.
import { useLayoutEffect, useState, type RefObject } from 'react';
import type { Doc, TableBlock } from '@shared/docs';
import { post } from '../../../lib/api';
import type { DocEngine } from './engine';

/** The handles on a table's column borders, for the table `id` (the caret's, or the one under the pointer). */
export function ColumnHandles({ engine, table, host, tick }: { engine: DocEngine; table: TableBlock; host: RefObject<HTMLDivElement | null>; tick: unknown }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const n = table.rows[0]?.length ?? 0;
  const shares = table.cols ?? new Array(n).fill(1 / Math.max(1, n));
  useLayoutEffect(() => {
    const el = engine.elementOf(table.id);
    const h = host.current;
    if (!el || !h) return setBox(null);
    const a = el.getBoundingClientRect();
    const b = h.getBoundingClientRect();
    setBox({ x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height });
  }, [table, tick, engine, host]);
  if (!box || n < 2) return null;
  const drag = (k: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = engine.elementOf(table.id);
    const cols = el ? Array.from(el.querySelectorAll<HTMLElement>('colgroup col')) : [];
    const start = e.clientX;
    const next = [...shares];
    const pair = shares[k] + shares[k + 1];
    const min = Math.min(0.04, pair / 3);
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - start) / box.w;
      next[k] = Math.min(pair - min, Math.max(min, shares[k] + d));
      next[k + 1] = pair - next[k];
      cols[k]?.style.setProperty('width', `${next[k] * 100}%`);
      cols[k + 1]?.style.setProperty('width', `${next[k + 1] * 100}%`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (next[k] !== shares[k]) engine.setCols(table.id, next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  let acc = 0;
  return (
    <>
      {shares.slice(0, -1).map((s, k) => {
        acc += s;
        return (
          <span
            key={k}
            data-keeps-editing
            title="Drag to size the columns"
            onPointerDown={drag(k)}
            className="group absolute z-10 flex w-[9px] -translate-x-1/2 cursor-col-resize justify-center"
            style={{ left: box.x + acc * box.w, top: box.y, height: box.h, touchAction: 'none' }}
          >
            <span className="h-full w-[3px] rounded-full bg-[#1a73e8] opacity-0 transition-opacity group-hover:opacity-70" />
          </span>
        );
      })}
    </>
  );
}

/** The document printed as it prints from its PDF: its pages in a frame of their own, the browser's print asked for. */
export async function printDoc(doc: Doc, title: string): Promise<void> {
  const { html } = await post<{ html: string }>('/api/pages/docs/print', { model: doc, title });
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  await new Promise<void>((ok) => {
    frame.onload = () => ok();
    frame.srcdoc = html;
  });
  const w = frame.contentWindow;
  if (!w) return frame.remove();
  // Its fonts first (Google's, KaTeX's), so the pages print as they look.
  await Promise.race([w.document.fonts?.ready, new Promise((ok) => setTimeout(ok, 2500))]);
  const done = () => setTimeout(() => frame.remove(), 500);
  w.addEventListener('afterprint', done, { once: true });
  w.focus();
  w.print();
  setTimeout(done, 60_000);
}
