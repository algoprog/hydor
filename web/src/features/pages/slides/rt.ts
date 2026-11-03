// The slides runtime as the app uses it: one for the app's window, pictures from this server (the app's own pages
// load no picture from the web, so pictures on the web come through it too), and Google's fonts through it.
import { useEffect, useState } from 'react';
import { deckFonts, FONT_TABLE, FONTS, type Deck } from '@shared/slides';
import { slidesRuntime, type DrawOpts } from '@shared/slides-runtime';
import { tr } from '../../../i18n/runtime';
import { mu } from '../../../lib/machine';

export const RT = slidesRuntime(window, FONT_TABLE);
RT.style();

/** Where the app finds a deck's pictures. */
export const PICS: Pick<DrawOpts, 'asset' | 'web' | 'hint'> = {
  asset: (sha) => mu(`/api/pages/assets/${sha}`),
  web: (url) => mu(`/api/pages/picture?url=${encodeURIComponent(url)}`),
  hint: tr,
};

const loaded = new Set<string>();

/** Loads Google's fonts a deck uses (once each), through this server. */
export function loadFonts(names: string[]) {
  for (const name of names) {
    if (loaded.has(name) || !FONTS.some((f) => f.google && f.name === name)) continue;
    loaded.add(name);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `/api/pages/fonts.css?f=${encodeURIComponent(name)}`;
    document.head.appendChild(l);
  }
}

/** The deck's fonts loaded; a number that changes as fonts arrive (draw again then: words take more or less room). */
export function useDeckFonts(deck: Deck | null): number {
  const [n, setN] = useState(0);
  const key = deck ? deckFonts(deck).join('|') : '';
  useEffect(() => {
    if (!key) return;
    loadFonts(key.split('|'));
    const on = () => setN((x) => x + 1);
    document.fonts?.addEventListener?.('loadingdone', on);
    return () => document.fonts?.removeEventListener?.('loadingdone', on);
  }, [key]);
  return n;
}
