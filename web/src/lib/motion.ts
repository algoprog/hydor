// Small motion helpers: numbers that count to their value, and whether the device asks for less motion.
import { useEffect, useRef, useState } from 'react';

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that eases to `target`: from 0 the first time, then from wherever it was. */
export function useCountUp(target: number, ms = 700): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === target || reducedMotion()) {
      current.current = target;
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const v = from + (target - from) * (1 - (1 - p) ** 3);
      current.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
