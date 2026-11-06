// The sound editor's history: each change a named step ("Delete", "Reverb", "Move a clip"), a drag or a slider one
// step however far it went (begin it, change as it moves, end it), any step gone back to with a click (the History
// panel), and the steps after it kept until something new is done.
import { useCallback, useState } from 'react';

const MOST = 200;

export interface Step<T> {
  label: string;
  now: T;
}

interface State<T> {
  steps: Step<T>[];
  at: number;
  /** A drag going on: its name, and whether its step is made yet. */
  drag: string | null;
  made: boolean;
}

export function useStepHistory<T>(first: T, firstLabel: string) {
  const [s, setS] = useState<State<T>>({ steps: [{ label: firstLabel, now: first }], at: 0, drag: null, made: false });
  const set = useCallback((label: string, next: T | ((now: T) => T)) => {
    setS((x) => {
      const cur = x.steps[x.at].now;
      const now = typeof next === 'function' ? (next as (now: T) => T)(cur) : next;
      if (now === cur) return x;
      if (x.drag && x.made) {
        const steps = x.steps.slice(0, x.at + 1);
        steps[x.at] = { label: x.drag, now };
        return { ...x, steps };
      }
      const steps = [...x.steps.slice(0, x.at + 1), { label: x.drag ?? label, now }].slice(-MOST);
      return { steps, at: steps.length - 1, drag: x.drag, made: !!x.drag };
    });
  }, []);
  const begin = useCallback((label: string) => setS((x) => ({ ...x, drag: label, made: false })), []);
  const end = useCallback(() => setS((x) => (x.drag ? { ...x, drag: null, made: false } : x)), []);
  const undo = useCallback(() => setS((x) => (x.at > 0 ? { ...x, at: x.at - 1, drag: null, made: false } : x)), []);
  const redo = useCallback(() => setS((x) => (x.at < x.steps.length - 1 ? { ...x, at: x.at + 1, drag: null, made: false } : x)), []);
  const jump = useCallback((i: number) => setS((x) => (i >= 0 && i < x.steps.length ? { ...x, at: i, drag: null, made: false } : x)), []);
  return { now: s.steps[s.at].now, steps: s.steps, at: s.at, set, begin, end, undo, redo, jump, canUndo: s.at > 0, canRedo: s.at < s.steps.length - 1 };
}
