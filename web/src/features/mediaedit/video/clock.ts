// Where the video is, in seconds of the original, for the parts of the editor that follow it as it plays (the playhead,
// the time, the words that show, the fades): only they draw again, many times a second, not the whole editor.
import { useSyncExternalStore } from 'react';

export interface Clock {
  get(): number;
  set(t: number): void;
  sub(f: () => void): () => void;
}

export function makeClock(): Clock {
  let t = 0;
  const subs = new Set<() => void>();
  return {
    get: () => t,
    set(v) {
      if (v === t) return;
      t = v;
      for (const f of subs) f();
    },
    sub(f) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}

export const useClock = (c: Clock) => useSyncExternalStore(c.sub, c.get);
