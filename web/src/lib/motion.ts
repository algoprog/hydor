// Small motion helpers: how much moves on this device (Settings → General → Appearance → Motion), numbers that count to
// their value, and whether the device asks for less motion.
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useUI, type Motion } from './store';

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

// ---- the motion level -----------------------------------------------------------------------------

/**
 * How much moves here: the Motion setting, or Off whenever the system asks for reduced motion. It is on <html> as
 * data-motion (full, calm or off) for the stylesheet's motion block, and public/theme-boot.js sets it before the first paint.
 */
export function motionLevel(): Motion {
  const v = document.documentElement.dataset.motion;
  return v === 'calm' || v === 'off' ? v : 'full';
}
/** Small motion plays (Full or Calm). */
export const motionOn = () => motionLevel() !== 'off';
/** What moves as you open things plays too (Full), and not on a phone, where it would feel slow. */
export const motionFull = () => motionLevel() === 'full' && !matchMedia('(pointer: coarse)').matches;

function applyMotion() {
  const level: Motion = reducedMotion() ? 'off' : useUI.getState().motion;
  document.documentElement.dataset.motion = level;
}

/** Keeps <html data-motion> in step with the setting and the system's Reduce motion. */
export function startMotion() {
  applyMotion();
  let last = useUI.getState().motion;
  useUI.subscribe((s) => {
    if (s.motion === last) return;
    last = s.motion;
    applyMotion();
  });
  if (typeof matchMedia !== 'undefined') matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyMotion);
}

type ViewTransitionDoc = Document & { startViewTransition?: (change: () => void) => { finished: Promise<unknown> } };

/**
 * Runs a change to the page inside a cross-fade of the two states (the View Transitions API), where the browser has it
 * and the motion is Full. `kind` sets the fade's length in the stylesheet (page 90 ms, theme 200 ms).
 */
export function crossFade(kind: 'page' | 'theme', change: () => void) {
  const doc = document as ViewTransitionDoc;
  if (!doc.startViewTransition || !motionFull() || document.visibilityState !== 'visible') return change();
  const root = document.documentElement;
  root.dataset.vt = kind;
  try {
    // The new state is drawn in full inside the callback (React flushes), so the browser can take its picture at once.
    const t = doc.startViewTransition(() => flushSync(change));
    const done = () => {
      if (root.dataset.vt === kind) delete root.dataset.vt;
    };
    t.finished.then(done, done);
  } catch {
    delete root.dataset.vt;
    change();
  }
}

/**
 * A picture that arrives: a faint sheen moves over its plate until it has loaded, then it fades in over 180 ms (the
 * stylesheet's .sheen and .img-in). Put `ref`, `onLoad` and `className` on the <img>, and `plate` on its frame
 * (which is relative and clips). `src` says which picture: a new one waits again.
 */
export function useArrival(src: string) {
  const [done, setDone] = useState<string | null>(null);
  const loaded = done === src;
  const ref = useCallback(
    (el: HTMLImageElement | null) => {
      if (el?.complete && el.naturalWidth) setDone(src);
    },
    [src],
  );
  return { ref, onLoad: () => setDone(src), className: loaded ? 'img-in' : 'opacity-0', plate: loaded ? '' : 'sheen' };
}
