// The catalog of cards (shared/answer-ui) for the apps' pages that need it: loaded the first time one asks, as it is
// large and the pages leave it out of their first load.
import { useEffect, useState } from 'react';

type Catalog = typeof import('@shared/answer-ui');
let loaded: Catalog | null = null;
let loading: Promise<Catalog> | null = null;

/** The catalog once loaded (null until then); `want`: load it now. */
export function useCardCatalog(want = true): Catalog | null {
  const [c, setC] = useState<Catalog | null>(loaded);
  useEffect(() => {
    if (!want || c) return;
    let live = true;
    (loading ??= import('@shared/answer-ui')).then((m) => {
      loaded = m;
      if (live) setC(m);
    });
    return () => {
      live = false;
    };
  }, [want, c]);
  return c;
}

/** A card's example data, as the gallery draws it (a copy). */
export const exampleOf =
  (c: Catalog) =>
  (ui: string): Record<string, unknown> | undefined => {
    const s = c.answerUi(ui);
    return s ? (JSON.parse(JSON.stringify(s.example)) as Record<string, unknown>) : undefined;
  };
