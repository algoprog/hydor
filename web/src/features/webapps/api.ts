// Web apps in the web app: where their pages are, the list as the server gives it (live: the server says when it changes, and
// while an app builds or starts the page asks again), and opening one in a tab of its own.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebApp, WebAppOpen, WebAppsList } from '@shared/webapps';
import { api, ApiError, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';

/** `backups` and `versions` are pages of the simple view (Technical details off); with it on they are Run and Overview. */
export type WebTab = 'overview' | 'preview' | 'flows' | 'data' | 'checks' | 'keys' | 'launch' | 'run' | 'backups' | 'versions';
export const WEB_TABS: WebTab[] = ['overview', 'preview', 'flows', 'data', 'checks', 'keys', 'launch', 'run', 'backups', 'versions'];

/** Where a web app's page is (and its tab: the first one is the address itself). */
export const webAppPath = (id: string, tab?: WebTab) => `/apps/web/${enc(id)}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`;

/** What one of an app's pages reads from the server: null until the first answer, kept current when anything about web apps changes. */
export interface Loaded<T> {
  data: T | null;
  /** Why it could not be read (the server's words), when it could not. */
  error: string | null;
  reload: () => Promise<void>;
}

/** Reads `path` (null: nothing to read), again when it changes and whenever the server says something about web apps changed. */
export function useLoaded<T>(path: string | null): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const at = useRef(path);
  at.current = path;
  const reload = useCallback(async () => {
    const p = at.current;
    if (!p) return;
    try {
      const r = await api<T>(p);
      if (at.current === p) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (at.current === p) setError((e as Error).message);
    }
  }, []);
  // What was read before stays until the new answer (a page that asks for more of the same does not blink).
  useEffect(() => {
    if (!path) setData(null);
    void reload();
  }, [path, reload]);
  useFeatureEvent('webapps', () => void reload());
  return { data, error, reload };
}

/** Whether an app is changing by itself: the page asks again until it is not. */
export const busy = (a: WebApp) => a.build.state === 'building' || a.run.state === 'starting';

export interface WebApps {
  /** Null until the first answer. */
  list: WebAppsList | null;
  /** Web apps are turned off on this computer. */
  off: boolean;
  /** Why the list could not be read (when it could not, and it is not off). */
  error: string | null;
  reload: () => Promise<void>;
}

/** The web apps, kept current while the page is open. */
export function useWebApps(): WebApps {
  const [list, setList] = useState<WebAppsList | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(
    () =>
      api<WebAppsList>('/api/webapps').then(
        (x) => {
          if (!alive.current) return;
          setList(x);
          setOff(false);
          setError(null);
        },
        (e: unknown) => {
          if (!alive.current) return;
          if (e instanceof ApiError && e.data?.off) {
            setOff(true);
            setList(null);
          } else setError((e as Error).message);
        },
      ),
    [],
  );
  useEffect(() => void reload(), [reload]);
  useFeatureEvent('webapps', () => void reload());
  const going = !!list?.apps.some(busy);
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => void reload(), 2000);
    return () => clearInterval(t);
  }, [going, reload]);
  return { list, off, error, reload };
}

/** Said where a person meets it: through a tunnel with one hostname an app has no address of its own. */
export const NO_ADDRESS = () => tr('Hydor is reached at one address only (a tunnel), so apps have no address of their own: links and cookies inside an app may not work. APPS_DOMAIN gives apps an address (see the configuration docs).');

/**
 * Opens the app in a tab of its own, signed in (the server starts it first, which can take a while: the tab is opened at once, while
 * the person's click counts, and is sent to the address when it comes). Says why when it could not.
 */
export async function openWebApp(id: string, path?: string, side?: 'launched' | 'preview'): Promise<void> {
  const tab = window.open('about:blank', '_blank');
  try {
    const r = await post<WebAppOpen>(`/api/webapps/${enc(id)}/open`, { ...(path ? { path } : {}), ...(side ? { side } : {}) });
    if (tab) {
      // The app is not Hydor's to be reached by: the tab it opens cannot reach back.
      tab.opener = null;
      tab.location.href = r.url;
    } else window.open(r.url, '_blank', 'noopener');
    if (r.way === 'path') toast(NO_ADDRESS(), 'info');
  } catch (e) {
    tab?.close();
    toastError(e);
  }
}
