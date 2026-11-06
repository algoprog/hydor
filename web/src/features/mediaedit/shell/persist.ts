// The editors' shell remembers how it was laid out (which panel tab was open, which sections were folded, how wide the
// dock is) in this browser's storage, per key: usePersisted is useState that survives a reload.
import { useCallback, useState } from 'react';

const PREFIX = 'hydor.editor.';

export function readPersisted<T>(key: string, init: T): T {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? init : (JSON.parse(v) as T);
  } catch {
    return init;
  }
}

export function writePersisted(key: string, v: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(v));
  } catch {
    // Storage full or off: it is only how the editor was laid out.
  }
}

/** State kept in this browser under `key` (the editor's name first: "picture.dock.width"). */
export function usePersisted<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => readPersisted(key, init));
  const set = useCallback(
    (x: T | ((p: T) => T)) =>
      setV((p) => {
        const next = typeof x === 'function' ? (x as (p: T) => T)(p) : x;
        writePersisted(key, next);
        return next;
      }),
    [key],
  );
  return [v, set];
}
