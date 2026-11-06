// The slides runtime as the app uses it: one for the app's window, pictures and kept videos from this server (the
// app's own pages load no picture from the web, so pictures on the web come through it too), Google's fonts through it,
// KaTeX for equations (loaded when a deck has one), and dates written as the app's language writes them. Live parts
// (custom code, 3D) run in frames the app makes at /partframe: sandboxed, their own opaque origin, sent their page by
// message once they say they are ready, so nothing of a deck runs in the app itself; a web page part frames its address.
import { useEffect, useState } from 'react';
import { deckFonts, everyEl, FONT_TABLE, FONTS, type Deck, type El } from '@shared/slides';
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

// ---- live parts' frames ---------------------------------------------------------------------------------------

/** What /partframe says when it is ready for its page, and what carries the page to it (server/index.ts). */
const PART_READY = 'n-part-ready';
const PART_PAGE = 'n-part-page';

/** The page each live part's frame is to show, by its frame. */
const partPages = new WeakMap<HTMLIFrameElement, string>();

// A frame that is ready (each time it loads: a frame moved in the page loads again) is sent its page, once each time.
window.addEventListener('message', (e) => {
  if (!e.source || (e.data as { type?: unknown } | null)?.type !== PART_READY) return;
  for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe[data-n-part]')) {
    if (f.contentWindow !== e.source) continue;
    const html = partPages.get(f);
    if (html !== undefined) f.contentWindow.postMessage({ type: PART_PAGE, html }, '*');
    return;
  }
});

/** A web page part's own address framed as it is, when it is not this app's: its own origin, never ours. */
function webPageFrame(url: string): HTMLIFrameElement | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.origin === location.origin) return null;
  const f = document.createElement('iframe');
  f.dataset.nPart = 'embed';
  // Its own origin (that site's) keeps its storage and sign-in; it may not move the app's page or reach into it.
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation');
  f.allow = 'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.src = u.href;
  return f;
}

/**
 * A live part's frame, for the runtime (DrawOpts.frame): /partframe, sandboxed with scripts only (its own opaque
 * origin, so it reaches nothing of the app's), sent `html` once it says it is ready. A web page part frames its own
 * address instead, unless that is this app's.
 */
export function partFrame(html: string, part: El): HTMLIFrameElement {
  if (part.type === 'embed') {
    const own = webPageFrame(part.url);
    if (own) return own;
  }
  const f = document.createElement('iframe');
  f.dataset.nPart = part.type;
  f.setAttribute('sandbox', 'allow-scripts');
  f.allow = 'fullscreen; autoplay';
  // The page's own colour scheme, so what it leaves see-through shows the slide (a frame in another scheme is opaque).
  f.style.colorScheme = 'normal';
  partPages.set(f, html);
  f.src = '/partframe';
  return f;
}

/** The runtime's options for live parts: they run, in the app's frames (the slideshow, the presenter's view, the audience's window, a part run in the editor). */
export const LIVE = { live: true, frame: partFrame } as Partial<DrawOpts>;

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
