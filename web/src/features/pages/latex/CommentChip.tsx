// The chip by the words picked in the LaTeX source, as the document editor has one: Comment opens a new comment on
// them in the comments panel (as Ctrl+Alt+M does). It sits over the start of what is picked (under it on a touch
// screen, where the system's own menu is over it), follows the source as it scrolls, and goes when nothing is picked,
// when what is picked is out of sight, or while a comment is being written.
import { useLayoutEffect, useRef, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { Code } from './code';

export function CommentChip({ code, at, onComment }: { code: Code | null; /** Changes as the cursor or what is picked does. */ at: string; onComment: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const chip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!code) return setPos(null);
    const v = code.view;
    const below = matchMedia('(pointer: coarse)').matches;
    const place = () => {
      const sel = v.state.selection.main;
      const host = v.dom.parentElement?.getBoundingClientRect();
      const a = sel.empty ? null : v.coordsAtPos(sel.from);
      const b = sel.empty || !below ? null : v.coordsAtPos(sel.to);
      const sc = v.scrollDOM.getBoundingClientRect();
      if (!host || !a || a.top < sc.top || a.bottom > sc.bottom || !v.state.sliceDoc(sel.from, sel.to).trim()) return setPos(null);
      const half = (chip.current?.offsetWidth ?? 110) / 2 + 6;
      const x = Math.min(Math.max(a.left - host.left + 40, half), host.width - half);
      setPos({ x, y: below && b ? b.bottom - host.top + 10 : a.top - host.top - 6, below });
    };
    place();
    v.scrollDOM.addEventListener('scroll', place, { passive: true });
    return () => v.scrollDOM.removeEventListener('scroll', place);
  }, [code, at]);
  if (!pos) return null;
  return (
    <div
      ref={chip}
      onMouseDown={(e) => e.preventDefault()}
      className="absolute z-20 flex h-8 items-center overflow-hidden rounded-full border border-line bg-elevated text-[12.5px] font-medium text-fg shadow-lg"
      style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.below ? '0' : '-100%'})` }}
    >
      <button type="button" onClick={onComment} title="A comment on the words picked (Ctrl+Alt+M)" className="flex h-full items-center gap-1.5 px-3 hover:bg-bg-2">
        <MessageSquarePlus size={13} className="text-fg-2" />
        Comment
      </button>
    </div>
  );
}
