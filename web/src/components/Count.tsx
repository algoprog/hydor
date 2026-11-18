import { useEffect, useRef, useState } from 'react';
import { motionOn } from '../lib/motion';

const whole = (n: number) => String(Math.round(n));

/**
 * A number that counts to its new value over 300 ms when it changes in place (the Inbox count, the start page's
 * numbers, a usage percentage). Never from nothing on first sight, and at once under Motion: Off. `format` writes the
 * number as it shows (money, a percent): it is given each step, so give it the unrounded value to round itself.
 * It renders text only, so it takes the place of the number it shows.
 */
export function Count({ value, format = whole }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const at = useRef(value);
  useEffect(() => {
    const from = at.current;
    if (from === value || !motionOn() || !Number.isFinite(value) || !Number.isFinite(from)) {
      at.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 300);
      at.current = from + (value - from) * (1 - (1 - p) ** 3);
      setShown(at.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      // Interrupted by a newer value: the next count starts from where this one got to.
    };
  }, [value]);
  return <>{format(shown)}</>;
}
