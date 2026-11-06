// A picture before and after a change, one over the other: a line across it to drag (or the arrow keys) shows the
// one before on its left and the one after on its right, each over the checkerboard, so see-through parts show.
import { useRef, useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { CHECKER } from './parts';

export function Compare({ before, after }: { before: string; after: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(50);
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el || e.button > 0) return;
    e.preventDefault();
    const to = (clientX: number) => {
      const r = el.getBoundingClientRect();
      setX(Math.max(0, Math.min(100, ((clientX - r.left) / Math.max(1, r.width)) * 100)));
    };
    to(e.clientX);
    const move = (ev: PointerEvent) => to(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Before and after: drag to compare"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(x)}
      onPointerDown={drag}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setX((v) => Math.max(0, v - 5));
        else if (e.key === 'ArrowRight') setX((v) => Math.min(100, v + 5));
      }}
      className="relative mx-auto w-fit max-w-full cursor-ew-resize touch-none overflow-hidden rounded-xl border border-line outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/50"
      style={CHECKER}
    >
      <img src={before} alt="" draggable={false} className="block max-h-[min(44dvh,420px)] max-w-full" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }} />
      <img src={after} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 0 0 ${x}%)` }} />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.3)]" style={{ left: `${x}%` }}>
        <span className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-md">
          <ChevronsLeftRight size={14} />
        </span>
      </div>
      <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">Before</span>
      <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">After</span>
    </div>
  );
}
