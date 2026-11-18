import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motionFull } from '../lib/motion';

/**
 * The column beside a page (the Browser's right column, the Files page's Ask panel): it slides open and shut over 160 ms
 * (width, in the stylesheet's .col-slide: Full only, and not on a phone), the page beside it following each frame. While
 * it closes it keeps showing what it showed. `width` is the open width in px; what goes inside should be that wide itself,
 * so nothing reflows as it slides. Open when the page is first shown, it is simply there.
 */
export function SlideColumn({ open, width, children }: { open: boolean; width: number; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [wide, setWide] = useState(open);
  const el = useRef<HTMLDivElement>(null);
  const kept = useRef<ReactNode>(children);
  const timer = useRef(0);
  if (open && children) kept.current = children;
  useLayoutEffect(() => {
    window.clearTimeout(timer.current);
    if (open) {
      setMounted(true);
      // Drawn shut first, so opening is a change the browser can follow.
      if (!motionFull()) setWide(true);
    } else {
      setWide(false);
      if (!motionFull()) setMounted(false);
      else timer.current = window.setTimeout(() => setMounted(false), 180);
    }
    return () => window.clearTimeout(timer.current);
  }, [open]);
  useLayoutEffect(() => {
    if (mounted && open && !wide) {
      el.current?.getBoundingClientRect();
      setWide(true);
    }
  }, [mounted, open, wide]);
  if (!mounted) return null;
  return (
    <div ref={el} className="col-slide flex shrink-0 overflow-hidden" style={{ width: wide ? width : 0 }}>
      {kept.current}
    </div>
  );
}
