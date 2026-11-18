import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motionOn } from '../lib/motion';
import { cx } from './ui';

/**
 * Words that change while you look (a session's status line: "Working" to "Done"): when `id` changes, the new ones come
 * up and the old ones go (a cross-fade, 220 ms; styles.css, .swap-in and .swap-out). Never on first sight, and not under
 * Motion: Off. What it holds is laid out as it would be without it.
 */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const last = useRef({ id, node: children });
  const timer = useRef(0);
  const [ghost, setGhost] = useState<ReactNode>(null);
  const [fresh, setFresh] = useState(false);
  useLayoutEffect(() => {
    const was = last.current;
    last.current = { id, node: children };
    if (was.id === id || !motionOn()) return;
    setGhost(was.node);
    setFresh(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => (setGhost(null), setFresh(false)), 240);
  });
  useLayoutEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <span className={cx('relative flex min-w-0 items-center gap-1', className)}>
      {ghost != null && (
        <span aria-hidden className="swap-out flex items-center gap-1">
          {ghost}
        </span>
      )}
      <span className={cx('flex min-w-0 items-center gap-1', fresh && 'swap-in')}>{children}</span>
    </span>
  );
}
