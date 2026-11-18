// The Browser page's right column on a computer: Ask about the page, an agent's conversation while you watch it, and the
// panels (history, downloads, bookmarks, settings…). It slides open beside the page, and you drag its left edge (or move
// it with the arrow keys) to make it wider or narrower: one width for all it shows, kept on this device and bounded by
// the window, so the page beside it keeps room. Its handle is inside its edge, since the page beside it is the desktop
// app's native view, which would cover the half of a handle outside. A double-click puts back its usual width.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SlideColumn } from '../../components/SlideColumn';
import { useUI } from '../../lib/store';
import { RAIL_WIDTH } from '../layout/Rail';
import { useNavWidth } from '../layout/SideColumn';

const MIN = 340;
const USUAL = 400;
const MAX = 960;
/** What the page beside it keeps at least. */
const PAGE_MIN = 360;

/** The column's width, and how wide it may be in this window (beside the rail, the tab column when it shows, and the page). */
function useColumnWidth() {
  const stored = useUI((s) => s.browserColumnWidth);
  const sideOpen = useUI((s) => s.sideOpen);
  const { width: nav } = useNavWidth();
  const [win, setWin] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setWin(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const max = Math.max(MIN, Math.min(MAX, win - RAIL_WIDTH - (sideOpen ? nav : 0) - PAGE_MIN));
  const width = Math.max(MIN, Math.min(max, Number.isFinite(stored) ? stored : USUAL));
  const set = (w: number) => useUI.getState().set({ browserColumnWidth: Math.round(Math.max(MIN, Math.min(max, w))) });
  return { width, max, set };
}

export function RightColumn({ children }: { children: ReactNode }) {
  const { width, max, set } = useColumnWidth();
  // Where the column's right edge is, taken when a drag starts: the width is that minus where the pointer is.
  const edge = useRef(0);
  return (
    <SlideColumn open={!!children} width={width}>
      {children ? (
        <aside className="relative flex h-full shrink-0 flex-col border-l border-line bg-bg-1" style={{ width }}>
          {children}
          <div
            role="separator"
            aria-label="Resize the column"
            aria-orientation="vertical"
            aria-valuemin={MIN}
            aria-valuemax={max}
            aria-valuenow={width}
            tabIndex={0}
            className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize touch-none hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-none"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              edge.current = e.currentTarget.parentElement?.getBoundingClientRect().right ?? window.innerWidth;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) set(edge.current - e.clientX);
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onDoubleClick={() => set(USUAL)}
            onKeyDown={(e) => {
              // The handle is the column's left edge: left makes the column wider, right narrower.
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                set(width + (e.key === 'ArrowLeft' ? 10 : -10));
              }
            }}
          />
        </aside>
      ) : null}
    </SlideColumn>
  );
}
