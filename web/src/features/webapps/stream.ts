// A web app's Preview where the browser looking at Hydor cannot reach the app's own address (Hydor reached through one hostname: a
// tunnel, a proxy): the app is opened in Hydor's own browser on the server and streams here, live, driven by the person, as the Preview
// of dev servers does (features/preview/PreviewPage.tsx).
import { useEffect, useRef, useState } from 'react';
import type { BrowserView } from '@shared/browser';
import { enc, post } from '../../lib/api';
import { live as socket } from '../../lib/ws';
import { listenBrowser, useBrowser } from '../browser/store';

/** Where each app was last, by its id, kept while Hydor's page is open: it opens there again. */
const lastAt = new Map<string, string>();

/** The path and query of a page of the app (it is at a `<name>.localhost` of its own), and nothing for another site or its sign-in link. */
const appPath = (href: string | undefined): string | null => {
  try {
    const u = new URL(href ?? '');
    const at = u.pathname + u.search;
    // Only a path the server takes: otherwise every try to open there again would be refused.
    return u.hostname.endsWith('.localhost') && !u.pathname.startsWith('/__hydor/') && !at.startsWith('//') && !at.includes('\\') && at.length <= 2000 ? at : null;
  } catch {
    return null;
  }
};

/** Device pixels per CSS pixel for the streamed page, as for dev servers: sharp on this screen, its frames at most 1600 pixels wide. */
const scaleFor = (w: number) => Math.max(1, Math.min(2, window.devicePixelRatio || 1, 1600 / Math.max(1, w)));

/**
 * The app's page streaming: opened while `on`, laid out at `fit` (the area it is shown in) as a phone or a computer. Each time it
 * comes on, and when its browser has closed (unwatched for a while) and someone looks again, it goes to where it was; a change of
 * size only lays it out again. `key` and `view` are there while its browser is open. Turning `on` off and on again tries anew.
 */
export function useAppStream(appId: string, on: boolean, device: 'phone' | 'desktop', fit: { w: number; h: number } | null) {
  const [got, setGot] = useState<{ app: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => {
    const seen = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', seen);
    return () => document.removeEventListener('visibilitychange', seen);
  }, []);
  const key = got?.app === appId ? got.key : null;
  const view = useBrowser((x) => (key ? x.views[key] : undefined));
  const open = !!view?.open;
  const here = open ? appPath(view?.tabs.find((t) => t.active)?.url) : null;
  if (here) lastAt.set(appId, here);
  const closed = !!key && !!view && !open;
  /** The next opening goes to where the app was (which also loads it afresh); one for a new size leaves the page as it is. */
  const goBack = useRef(true);
  useEffect(() => listenBrowser(), []);
  useEffect(() => (key ? socket.sub(key) : undefined), [key]);
  useEffect(() => {
    if (closed) goBack.current = true;
  }, [closed]);
  useEffect(() => {
    if (!on) {
      goBack.current = true;
      setError(null);
      return;
    }
    // Closed after a while with nobody looking: it opens again once someone looks (not from a tab in the background).
    if (!fit || (closed && !visible)) return;
    let alive = true;
    const t = window.setTimeout(
      () => {
        const path = goBack.current ? lastAt.get(appId) : undefined;
        goBack.current = false;
        post<{ key: string; view: BrowserView }>(`/api/webapps/${enc(appId)}/live`, { side: 'preview', device, w: fit.w, h: fit.h, scale: scaleFor(fit.w), ...(path !== undefined ? { path } : {}) }).then(
          (r) => {
            useBrowser.setState((st) => ({ views: { ...st.views, [r.key]: r.view } }));
            if (!alive) return;
            setGot({ app: appId, key: r.key });
            setError(null);
          },
          (e: unknown) => {
            if (alive) setError(e instanceof Error ? e.message : String(e));
          },
        );
      },
      // At once the first time; a resize settles first.
      key && !closed ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, on, device, fit?.w, fit?.h, closed, closed && visible]);
  return { key: open ? key : null, view: open ? view : undefined, error };
}
