// The refresh mark: it turns once each time its button is clicked, and keeps turning while busy.
import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { cx } from './ui';

export function RefreshIcon({ size = 14, busy, className }: { size?: number; busy?: boolean; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = ref.current;
    const button = el?.closest('button');
    if (!el || !button) return;
    const once = () => {
      if (el.classList.contains('animate-spin')) return;
      el.classList.remove('spin-once');
      void el.getBoundingClientRect(); // so the same animation starts again
      el.classList.add('spin-once');
    };
    button.addEventListener('click', once);
    return () => button.removeEventListener('click', once);
  }, []);
  return <RefreshCw ref={ref} size={size} className={cx(busy && 'animate-spin', className)} onAnimationEnd={(e) => e.currentTarget.classList.remove('spin-once')} />;
}
