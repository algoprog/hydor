// The editor's undo and redo: each change a step, and a drag or a slider one step however far it went (begin it, change
// as it moves, end it).
import { useCallback, useRef, useState } from 'react';

const MOST = 100;

export function useHistory<T>(first: T) {
  const [s, setS] = useState<{ past: T[]; now: T; future: T[] }>({ past: [], now: first, future: [] });
  // Where a drag began: one step back to it when it ends.
  const began = useRef<T | null>(null);
  const set = useCallback((next: T | ((now: T) => T)) => {
    setS((x) => {
      const now = typeof next === 'function' ? (next as (now: T) => T)(x.now) : next;
      if (now === x.now) return x;
      if (began.current !== null) return { ...x, now };
      return { past: [...x.past, x.now].slice(-MOST), now, future: [] };
    });
  }, []);
  const begin = useCallback(() => {
    setS((x) => {
      if (began.current === null) began.current = x.now;
      return x;
    });
  }, []);
  const end = useCallback(() => {
    setS((x) => {
      const from = began.current;
      began.current = null;
      return from === null || from === x.now ? x : { past: [...x.past, from].slice(-MOST), now: x.now, future: [] };
    });
  }, []);
  const undo = useCallback(() => setS((x) => (x.past.length ? { past: x.past.slice(0, -1), now: x.past[x.past.length - 1], future: [x.now, ...x.future] } : x)), []);
  const redo = useCallback(() => setS((x) => (x.future.length ? { past: [...x.past, x.now], now: x.future[0], future: x.future.slice(1) } : x)), []);
  return { now: s.now, set, begin, end, undo, redo, canUndo: s.past.length > 0, canRedo: s.future.length > 0 };
}
