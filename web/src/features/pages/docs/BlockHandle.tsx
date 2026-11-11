// The handle by each block, as Notion has one: pointing at a paragraph, a list item, a table or a picture shows ⋮⋮ in
// the margin to its left; dragged up or down, a line shows where the block will go, and letting go moves it there (one
// step to undo). Pressed without dragging (or with Enter), it opens a menu for the block: turn it into another style,
// duplicate it, delete it, move it up or down, comment on it, copy a link to a heading (the editor says what it
// offers). Not on phones, where there is no pointing (the Edit menu and a long press have the same).
import { useEffect, useRef, useState, type RefObject } from 'react';
import { GripVertical } from 'lucide-react';
import { ContextMenu, type ContextMenuAt, type MenuEntry } from '../common/menus';
import type { DocEngine } from './engine';

export function BlockHandle({
  engine,
  host,
  paper,
  tick,
  menu,
}: {
  engine: DocEngine;
  host: RefObject<HTMLDivElement | null>;
  paper: RefObject<HTMLDivElement | null>;
  tick: unknown;
  /** The rows of the menu a click on the handle opens, for the block it is by. */
  menu?: (id: string) => MenuEntry[];
}) {
  const [at, setAt] = useState<{ id: string; x: number; y: number } | null>(null);
  const [open, setOpen] = useState<{ at: ContextMenuAt; id: string } | null>(null);
  const [line, setLine] = useState<{ x: number; y: number; w: number } | null>(null);
  const dragging = useRef(false);
  // The block under the pointer: its handle at its first line, in the paper's left margin.
  useEffect(() => {
    const h = host.current;
    if (!h) return;
    const move = (e: PointerEvent) => {
      if (dragging.current || e.pointerType !== 'mouse') return;
      const t = e.target as HTMLElement;
      if (t.closest?.('[data-handle]')) return;
      const el = (t.closest?.('.nd-ed > [data-b]') as HTMLElement | null) ?? null;
      if (!el || !paper.current?.contains(el)) return setAt(null);
      const hr = h.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const pr = paper.current.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(paper.current).paddingLeft) || 40;
      setAt({ id: el.dataset.b!, x: pr.left - hr.left + Math.max(4, pad * (pr.width / paper.current.offsetWidth) - 30), y: r.top - hr.top + Math.min(lh, r.height) / 2 });
    };
    const leave = () => !dragging.current && setAt(null);
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerleave', leave);
    return () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerleave', leave);
    };
  }, [host, paper]);
  useEffect(() => setAt(null), [tick]);
  const menuNode = <ContextMenu at={open?.at ?? null} items={open && menu ? menu(open.id) : []} onClose={() => (setOpen(null), engine.refocusSoon())} />;
  if (!at) return menuNode;

  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const h = host.current;
    const p = paper.current;
    if (!h || !p) return;
    dragging.current = true;
    const id = at.id;
    const handle = e.currentTarget.getBoundingClientRect();
    const [x0, y0] = [e.clientX, e.clientY];
    let moved = false;
    let to = -1;
    const kids = () => Array.from(p.children) as HTMLElement[];
    const move = (ev: PointerEvent) => {
      // A press that hardly moves is a click, not a drag.
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      moved = true;
      const hr = h.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      const list = kids();
      // The gap nearest the pointer: before the first block whose middle is below it.
      let k = list.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (k < 0) k = list.length;
      to = k;
      const ref = list[k]?.getBoundingClientRect() ?? list[list.length - 1]?.getBoundingClientRect();
      const y = list[k] ? ref!.top - 3 : ref!.bottom + 3;
      const pad = (parseFloat(getComputedStyle(p).paddingLeft) || 40) * (pr.width / p.offsetWidth);
      setLine({ x: pr.left - hr.left + pad, y: y - hr.top, w: pr.width - 2 * pad });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      dragging.current = false;
      setLine(null);
      if (!moved) return setOpen({ at: { x: handle.right + 4, y: handle.top }, id });
      setAt(null);
      if (to >= 0) engine.moveBlock(id, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  return (
    <>
      <button
        type="button"
        data-handle
        data-keeps-editing
        title="Drag to move, click for more"
        aria-label="Drag to move, click for more"
        aria-haspopup="menu"
        onPointerDown={drag}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setOpen({ at: { x: r.right + 4, y: r.top, keyed: true }, id: at.id });
          }
        }}
        onMouseDown={(e) => e.preventDefault()}
        className="absolute z-10 flex h-6 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded text-[#9aa0a6] hover:bg-black/5 hover:text-[#5f6368] active:cursor-grabbing"
        style={{ left: at.x, top: at.y, touchAction: 'none' }}
      >
        <GripVertical size={15} />
      </button>
      {line && <span className="pointer-events-none absolute z-20 h-[3px] rounded-full bg-[#1a73e8]" style={{ left: line.x, top: line.y, width: line.w }} />}
      {menuNode}
    </>
  );
}
