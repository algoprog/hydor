import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { cx } from './ui';

/**
 * One line of text that may not fit (a tab's name): what does not fit fades out at its end instead of being cut, and
 * while the pointer is on its row (the nearest `.group`) it rolls along to show the rest, waits, and rolls back. With
 * Motion off it stays still; the row's tooltip has the whole of it.
 */
export function FadeText({ text, className }: { text: string; className?: string }) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  // How far the text runs past the end of its place, in pixels (0: it fits).
  const [over, setOver] = useState(0);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => setOver(Math.max(0, Math.ceil(i.offsetWidth - o.clientWidth)));
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(o);
    sizes.observe(i);
    return () => sizes.disconnect();
  }, [text]);
  // It rolls past the fade too (28 px), so its last letters end up clear of it; at about 55 px a second.
  const run = over + 28;
  const style = over ? ({ '--roll': `-${run}px`, '--roll-time': `${Math.max(1.2, run / 55).toFixed(2)}s` } as CSSProperties) : undefined;
  return (
    // A name someone wrote (a page's title, a session's), never translated.
    <span ref={outer} translate="no" data-over={over ? '' : undefined} className={cx('fade-text', className)} style={style}>
      <span ref={inner}>{text}</span>
    </span>
  );
}
