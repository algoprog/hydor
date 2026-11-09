import { lazy, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Router } from 'wouter';
import type { AppTheme } from '@shared/themes';
import { api, onUnauthorized } from './lib/api';
import { endBoot } from './lib/boot';
import { machineBase, machineId } from './lib/machine';
import { currentLang } from './i18n';
import { useMachines } from './lib/machines';
import { useApp, useSessions, useUI, useUsage, type Bootstrap } from './lib/store';
import { applyTheme, setCustomThemes, useThemes } from './lib/theme';
import { handleNotify, initNotifications } from './lib/notify';
import { live, ownLive } from './lib/ws';
import { MachineDown } from './features/machines/MachineSwitcher';
import { Throbber } from './components/ui';
import { Toasts } from './components/Toasts';
import { Login, Setup } from './features/auth/AuthScreens';

// The app itself is a file of its own, asked for the moment the page loads, beside the question of who is signed in:
// a signed-in page has it as soon as before, and the sign-in screens no longer wait for all of the app to arrive.
const shell = import('./features/layout/Shell');
const Shell = lazy(() => shell.then((m) => ({ default: m.Shell })));

/** The logo shown while the page loads goes once the app has drawn (until then it stays: nothing shows in between). */
function Arrived({ children }: { children: ReactNode }) {
  useLayoutEffect(endBoot, []);
  return children;
}

export function App() {
  const auth = useApp((s) => s.auth);
  const theme = useUI((s) => s.theme);
  const darkTheme = useUI((s) => s.darkTheme);
  const lightTheme = useUI((s) => s.lightTheme);
  const custom = useThemes((s) => s.custom);
  // Another machine's page whose machine does not answer.
  const [down, setDown] = useState<string | null>(null);

  useEffect(() => {
    applyTheme();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, [theme, darkTheme, lightTheme, custom]);

  // The logo shown while the page loads stays until it is known what to show: a sign-in, or the app (once it has drawn: Arrived).
  useLayoutEffect(() => {
    if (auth === 'setup' || auth === 'login' || (auth === 'ok' && down)) endBoot();
  }, [auth, down]);

  useEffect(() => {
    api<{ setup: boolean; authenticated: boolean }>('/api/auth/state')
      .then((s) => useApp.getState().set({ auth: !s.setup ? 'setup' : s.authenticated ? 'ok' : 'login' }))
      .catch(() => useApp.getState().set({ auth: 'login' }));
    return onUnauthorized(() => {
      live.stop();
      ownLive?.stop();
      useApp.getState().set({ auth: 'login' });
    });
  }, []);

  useEffect(() => {
    if (auth !== 'ok') return;
    // The browser's time zone, so agents and schedules speak in local time.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) api('/api/me/timezone', { method: 'PUT', body: { tz } }).catch(() => {});
    // The language the pages are in, so agents reply in it.
    api('/api/me/language', { method: 'PUT', body: { lang: currentLang() } }).catch(() => {});
    api<Bootstrap>('/api/bootstrap')
      .then((b) => {
        useApp.getState().set({ boot: b, indexing: b.indexing });
        if (!machineId) setCustomThemes(b.themes ?? []);
        if (!useUI.getState().explorerRoot) useUI.getState().set({ explorerRoot: b.defaultCwd });
      })
      .catch((e) => {
        if (!machineId) return;
        // Its socket would only keep failing too.
        live.stop();
        setDown((e as Error).message);
      });
    useMachines.getState().load().catch(() => {});
    // On another machine's pages the themes are this server's, and so is the socket that brings every machine's notices.
    let offOwn = () => {};
    if (ownLive) {
      api<{ themes: AppTheme[] }>('/api/themes')
        .then((r) => setCustomThemes(r.themes))
        .catch(() => {});
      offOwn = ownLive.on((e) => {
        if (e.t === 'notify') handleNotify(e.n, true);
        else if (e.t === 'machines') useMachines.getState().load().catch(() => {});
        else if (e.t === 'themes') window.dispatchEvent(new CustomEvent('wa:themes', { detail: e.themes }));
      });
      ownLive.start();
    }
    useSessions.getState().load().catch(() => {});
    useUsage.getState().refresh().catch(() => {});
    const off = live.onStatus((up) => {
      useApp.getState().set({ connected: up });
      if (up) useSessions.getState().load().catch(() => {});
    });
    live.start();
    initNotifications();
    const t = setInterval(() => useUsage.getState().refresh().catch(() => {}), 5 * 60_000);
    return () => {
      off();
      offOwn();
      clearInterval(t);
    };
  }, [auth]);

  if (auth === 'unknown') {
    return (
      <div className="flex h-full items-center justify-center text-fg-3">
        <Throbber size={34} />
      </div>
    );
  }
  return (
    <>
      {auth === 'setup' ? (
        <Setup />
      ) : auth === 'login' ? (
        <Login />
      ) : down ? (
        <MachineDown error={down} />
      ) : (
        <Router base={machineBase}>
          <Suspense fallback={null}>
            <Arrived>
              <Shell />
            </Arrived>
          </Suspense>
        </Router>
      )}
      <Toasts />
    </>
  );
}
