import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motionFull } from '../lib/motion';
import { cx } from './ui';

/**
 * The column beside a page (the Browser's right column, the Files page's Ask panel): it slides open and shut over 160 ms
 * (width, in the stylesheet's .col-slide: Full only, and not on a phone), the page beside it following each frame. While
 * it closes it keeps showing what it showed. `width` is the open width in px; what goes inside should be that wide itself,
 * so nothing reflows as it slides. Open when the page is first shown, it is simply there. It eases only while it opens or
 * shuts: a width dragged at its edge (the Browser's) follows the pointer at once.
 */
export function SlideColumn({ open, width, children }: { open: boolean; width: number; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [wide, setWide] = useState(open);
  const [moving, setMoving] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const kept = useRef<ReactNode>(children);
  const timer = useRef(0);
  if (open && children) kept.current = children;
  useLayoutEffect(() => {
    window.clearTimeout(timer.current);
    const full = motionFull();
    setMoving(full);
    if (open) {
      setMounted(true);
      // Drawn shut first, so opening is a change the browser can follow.
      if (!full) setWide(true);
      else timer.current = window.setTimeout(() => setMoving(false), 200);
    } else {
      setWide(false);
      if (!full) setMounted(false);
      else timer.current = window.setTimeout(() => (setMounted(false), setMoving(false)), 180);
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
    <div ref={el} className={cx('flex shrink-0 overflow-hidden', moving && 'col-slide')} style={{ width: wide ? width : 0 }}>
      {kept.current}
    </div>
  );
}
