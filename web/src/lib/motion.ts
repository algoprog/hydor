// Small motion helpers: numbers that count to their value, a session started from the start page, and
// whether the device asks for less motion.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A session started from the start page: the page becomes the session at once, while its message box goes
 * down to the session's own and the words written in it, now your message, go up to their place in the
 * conversation (styles.css, "carry"). `open` opens the session; the change waits a moment (0.8 s at most)
 * for the session to show its box and your message, so nothing shows half-loaded.
 */
export function carryToSession(open: () => void, box: HTMLElement | null, words: HTMLElement | null) {
  if (!box || !('startViewTransition' in document) || reducedMotion() || document.visibilityState !== 'visible') return open();
  const marked: HTMLElement[] = [box];
  box.style.viewTransitionName = 'carry-box';
  if (words) {
    words.style.viewTransitionName = 'carry-words';
    marked.push(words);
  }
  const root = document.documentElement;
  root.classList.add('carrying');
  const done = () => {
    root.classList.remove('carrying');
    for (const el of marked) el.style.viewTransitionName = '';
  };
  const update = async () => {
    flushSync(open);
    const until = performance.now() + 800;
    let to: HTMLElement | null = null;
    let said: HTMLElement | null = null;
    for (;;) {
      to = document.querySelector<HTMLElement>('[data-composer]');
      said = words && document.querySelector<HTMLElement>('[data-bubble]');
      if ((to && (said || !words)) || performance.now() > until) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    if (to) to.style.viewTransitionName = 'carry-box';
    if (said) said.style.viewTransitionName = 'carry-words';
    marked.push(...[to, said].filter((x): x is HTMLElement => !!x));
  };
  try {
    document.startViewTransition(update).finished.then(done, done);
  } catch {
    // Refused outright: the session opens all the same.
    done();
    open();
  }
}

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
