// The slides runtime as the app uses it: one for the app's window, pictures and kept videos from this server (the
// app's own pages load no picture from the web, so pictures on the web come through it too), Google's fonts through it,
// KaTeX for equations (loaded when a deck has one), and dates written as the app's language writes them.
import { useEffect, useState } from 'react';
import { deckFonts, everyEl, FONT_TABLE, FONTS, type Deck } from '@shared/slides';
import { slidesRuntime, type DrawOpts } from '@shared/slides-runtime';
import { tr } from '../../../i18n/runtime';
import { LOCALE } from '../../../i18n/locale';
import { mu } from '../../../lib/machine';
import { loadKatex } from '../common/katex';

export const RT = slidesRuntime(window, FONT_TABLE);
RT.style();

/** Where the app finds a deck's pictures and videos, and what draws its equations once loaded. */
export const PICS: Pick<DrawOpts, 'asset' | 'web' | 'video' | 'hint' | 'katex' | 'locale'> = {
  asset: (sha) => mu(`/api/pages/assets/${sha}`),
  video: (sha) => mu(`/api/pages/videos/${sha}`),
  web: (url) => mu(`/api/pages/picture?url=${encodeURIComponent(url)}`),
  hint: tr,
  locale: LOCALE,
};

/** Whether a deck has equations. */
const hasMath = (d: Deck) => d.slides.some((s) => everyEl(s.els).some((e) => e.type === 'math'));

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

/**
 * The deck's fonts loaded (and KaTeX, when it has equations); a number that changes as they arrive (draw again then:
 * words take more or less room, equations draw).
 */
export function useDeckFonts(deck: Deck | null): number {
  const [n, setN] = useState(0);
  const key = deck ? deckFonts(deck).join('|') : '';
  const math = !!deck && hasMath(deck);
  useEffect(() => {
    if (!key) return;
    loadFonts(key.split('|'));
    const on = () => setN((x) => x + 1);
    document.fonts?.addEventListener?.('loadingdone', on);
    return () => document.fonts?.removeEventListener?.('loadingdone', on);
  }, [key]);
  useEffect(() => {
    if (!math || PICS.katex) return;
    let alive = true;
    loadKatex()
      .then((k) => {
        PICS.katex = k as unknown as NonNullable<DrawOpts['katex']>;
        if (alive) setN((x) => x + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [math]);
  return n;
}
