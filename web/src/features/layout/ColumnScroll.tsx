import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { cx } from '../../components/ui';

/**
 * A column's list that scrolls (the sessions, the Library's places, Settings' sections, the Browser's tabs…): its
 * scroll bar shows whenever it holds more than fits, not only while it scrolls (macOS and phones hide theirs until
 * then), and its foot fades into the column while more is below, so you can see there is more. The fade lifts at the
 * end and leaves the scroll bar clear. Props go to the scrolling box itself.
 */
export function ColumnScroll({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);
  const [bar, setBar] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setBelow(el.scrollHeight - el.clientHeight - el.scrollTop > 2);
      setBar(el.offsetWidth - el.clientWidth);
    };
    const check = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // Its own size, and each of its children's: what it holds grows and shrinks without a scroll (a group opened, a
    // session added), and a child that comes or goes is watched or let go.
    const sizes = new ResizeObserver(check);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(el);
      for (const child of Array.from(el.children)) sizes.observe(child);
      check();
    };
    const kids = new MutationObserver(watch);
    kids.observe(el, { childList: true });
    el.addEventListener('scroll', check, { passive: true });
    watch();
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      kids.disconnect();
      el.removeEventListener('scroll', check);
    };
  }, []);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} {...rest} className={cx('scroll-shown min-h-0 flex-1 overflow-y-auto', className)}>
        {children}
      </div>
      <div aria-hidden data-on={below || undefined} className="scroll-fade" style={{ right: bar }} />
    </div>
  );
}
