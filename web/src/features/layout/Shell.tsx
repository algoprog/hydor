import { memo, useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useRoute, useSearch } from 'wouter';
import { activityOf } from '../../lib/activity';
import { useSessions, useUI } from '../../lib/store';
import { cx, useIsMobile, useMediaQuery } from '../../components/ui';
import { FilesPage } from '../files/FilesPage';
import { QuickOpen } from '../files/FileSearch';
import { UploadTrays } from '../pages/UploadTray';
import { FilePeek } from '../files/FilePeek';
import { ArxivHost } from '../pages/latex/ArxivHost';
import { StudioHost } from '../images/studio';
import { GitPage } from '../git/GitPage';
import { HomePage } from '../home/HomePage';
import { InboxPage } from '../inbox/InboxPage';
import { SessionView } from '../session/SessionView';
import { StartingSession } from '../session/StartingSession';
import { isStartingKey } from '../../lib/starting';
import { isSettingsSection, SettingsPage } from '../settings/SettingsPage';
import { go } from '../../lib/nav';
import { MonitorPage } from '../system/SystemPage';
import { SystemOverview } from '../system/SystemOverview';
import { TerminalPage, TerminalPanel } from '../terminal/TerminalPanel';
import { UsagePage } from '../usage/UsagePage';
import { Sidebar } from './Sidebar';
import { undoLast } from '../../lib/flags';
import { CommandPalette, usePalette } from '../palette/CommandPalette';
import { CountVisits } from '../palette/usage';
import { ReleaseNotes, WhatsNew } from '../settings/Releases';
import { Lightbox, VideoBox } from '../../components/Lightbox';
import { HelpButton, Tour } from '../tour/Tour';
import { Tips } from '../tips/Tips';
import { HandsFree } from '../voice/HandsFree';
import { ReviewPage } from '../review/ReviewPage';
import { PreviewPage } from '../preview/PreviewPage';
import { features } from '../registry';

/** Settings → Connections, from before it was part of the Apps page: the same place there (its sign-in coming back too). */
function ToConnected({ q }: { q: URLSearchParams }) {
  useEffect(() => {
    const find = (q.get('find') ?? '').toLowerCase();
    const to = new URLSearchParams();
    if (q.get('flow')) to.set('flow', q.get('flow')!);
    if (/key|vault|secret/.test(find)) to.set('tab', 'keys');
    else if (/market|service/.test(find)) to.set('tab', 'market');
    go(`/apps/connected${to.size ? `?${to}` : ''}`, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function useDrag(onMove: (dy: number) => void) {
  return (e: React.PointerEvent) => {
    e.preventDefault();
    let y = e.clientY;
    const move = (ev: PointerEvent) => {
      onMove(ev.clientY - y);
      y = ev.clientY;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

/** Each page shows at once, with no fade. A page is built afresh when you move to another one, but not when a
 * file or folder changes inside one or you switch its tabs (a project's, Usage's), so a tab shows at once with what
 * the page already loaded. Memoized: the shell re-rendering (a panel or the drawer toggled) never re-renders the
 * page. */
const Routes = memo(function Routes() {
  const [loc] = useLocation();
  const project = /^\/projects\/[^/]+/.exec(loc)?.[0];
  // A run of Experiments opens beside its list: the same page.
  const section = loc === '/file' || loc === '/search' ? '/files' : loc === '/stats' || loc === '/arena' ? '/usage' : loc.startsWith('/guide') ? '/guide' : loc.startsWith('/system/experiments') ? '/system/experiments' : (project ?? loc);
  return (
    <div key={section} className="h-full">
      <Page />
    </div>
  );
});

function Page() {
  const [loc] = useLocation();
  const search = useSearch();
  const [isSession, params] = useRoute('/s/:key');
  const [isReview, rparams] = useRoute('/review/:key');
  if (isSession && params) {
    const key = decodeURIComponent(params.key);
    // A session you just started, until the server has started it (lib/starting.ts).
    return isStartingKey(key) ? <StartingSession id={key} /> : <SessionView sessionKey={key} />;
  }
  if (isReview && rparams) return <ReviewPage sessionKey={decodeURIComponent(rparams.key)} />;
  if (loc === '/file' || loc === '/files' || loc === '/search') {
    const q = new URLSearchParams(search);
    return <FilesPage path={loc === '/file' ? q.get('path') : null} line={Number(q.get('line')) || undefined} search={loc === '/search'} />;
  }
  if (loc === '/terminal') return <TerminalPage />;
  if (loc === '/inbox') return <InboxPage />;
  if (loc === '/preview') return <PreviewPage />;
  if (loc === '/git') return <GitPage selected={new URLSearchParams(search).get('path')} />;
  if (loc === '/usage' || loc === '/stats' || loc === '/arena') return <UsagePage tab={loc === '/stats' ? 'activity' : loc === '/arena' ? 'arena' : 'limits'} />;
  if (loc === '/system') return <SystemOverview />;
  if (loc === '/system/monitor') return <MonitorPage />;
  if (loc === '/settings') {
    const q = new URLSearchParams(search);
    // Connections are the Apps page's Connected apps now: an old link (and a sign-in coming back) goes there.
    if (q.get('s') === 'connections') return <ToConnected q={q} />;
    // Instructions (CLAUDE.md and AGENTS.md) are part of Agent Guidelines now, and the Skill library part of Skills.
    const s = q.get('s') === 'instructions' ? 'guidelines' : q.get('s') === 'skillpack' ? 'skills' : q.get('s');
    const agent = q.get('agent');
    return <SettingsPage section={isSettingsSection(s) ? s : null} cwd={q.get('cwd')} agent={agent === 'claude' || agent === 'codex' ? agent : null} />;
  }
  // Projects' pages were at /spaces, and the Library's filter was ?space=: older links land in their place.
  const moved = movedAddress(loc);
  if (moved) return <Redirect to={moved} />;
  // The capabilities' own pages (registry.tsx).
  for (const f of features()) for (const r of f.routes ?? []) if (r.match(loc)) return <r.Page />;
  // Customize moved into Settings; old links still land in the right place.
  if (loc === '/customize') {
    const q = new URLSearchParams(search);
    q.set('s', q.get('tab') ?? 'mcp');
    q.delete('tab');
    return <Redirect to={`/settings?${q}`} />;
  }
  return <HomePage />;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => go(to, true), [to]);
  return null;
}

/** Where an older address goes now (until 5 November 2026 a project's page was /spaces/…, the Library's filter ?space=), or null. */
function movedAddress(loc: string): string | null {
  // As the address has them: wouter's own search comes unescaped.
  const { search, hash } = window.location;
  if (loc === '/spaces' || loc.startsWith('/spaces/')) return `/projects${loc.slice('/spaces'.length)}${search}${hash}`;
  const q = new URLSearchParams(search);
  if (loc !== '/library' || !q.has('space')) return null;
  q.set('project', q.get('space')!);
  q.delete('space');
  return `/library?${q}${hash}`;
}

/** "(2) Hydor" while sessions wait for an approval or an answer. */
function useTitleBadge() {
  const waiting = useSessions((s) => Object.values(s.byKey).filter((x) => activityOf(x)?.status === 'waiting').length);
  useEffect(() => {
    document.title = waiting ? `(${waiting}) Hydor` : 'Hydor';
  }, [waiting]);
}

/** The phone's drawer. It stays built, off to the side, so it opens at once and slides in and out;
 * toggling it re-renders only this (the sidebar inside is memoized). */
function MobileDrawer() {
  const open = useUI((s) => s.drawerOpen);
  // `inert` restyles every row of the drawer (a long session list), which held the slide back by a
  // few frames on phones: it follows once the drawer has come to rest, so the slide starts at once.
  const [rest, setRest] = useState(open);
  // The drawer covers the whole screen, so the scrim shows only while it slides (from its first frame:
  // a layout effect). Hidden the rest of the time, its blur costs nothing, even as the list scrolls.
  const [sliding, setSliding] = useState(false);
  useLayoutEffect(() => {
    setSliding(true);
    const t = setTimeout(() => {
      setRest(open);
      setSliding(false);
    }, 300);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <>
      <div
        aria-hidden
        onPointerDown={() => useUI.getState().set({ drawerOpen: false })}
        className={cx('scrim fixed inset-0 z-40 transition-[opacity,visibility] duration-200 motion-reduce:transition-none', open ? 'opacity-100' : 'pointer-events-none opacity-0', !sliding && 'invisible')}
      />
      <div
        inert={!rest}
        // Only `transform` changes, which the compositor animates on its own (Safari's surest path). The shadow
        // stays as it is, out of sight past the left edge while shut (fading it in repainted the drawer on every frame).
        // What moves on its own inside (a working session's breathing dot) holds still unless the drawer is open
        // and at rest: running as the slide began, it left Safari showing the drawer at once, without the slide.
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-full shadow-lg transition-transform duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform motion-reduce:transition-none',
          open ? 'transform-none' : '[transform:translateX(calc(-100%_-_64px))]',
          !(open && rest) && 'drawer-still',
        )}
      >
        <Sidebar mobile />
      </div>
    </>
  );
}

/**
 * A key an editor on screen takes for itself (Ctrl+B for bold, Ctrl+K for a link, Ctrl+` for formulas), which the
 * app's own shortcuts then leave alone: one an editor used already, one the part with the focus marks as its own
 * (data-keys="b k"), or one an editor takes while nothing has the focus (data-keys-idle: a slide's parts are picked
 * without it). Editors listening on the window hear keys after the shell, so their marks say it beforehand.
 */
function editorsKey(e: KeyboardEvent, key: string): boolean {
  if (e.defaultPrevented) return true;
  const a = document.activeElement;
  if (a && a !== document.body) return !!a.closest(`[data-keys~="${key}"]`);
  return !!document.querySelector(`[data-keys-idle~="${key}"]`);
}

export function Shell() {
  const mobile = useIsMobile();
  // Only what the shell lays out: the drawer listens for itself (MobileDrawer).
  const sideOpen = useUI((s) => s.sideOpen);
  const panelOpen = useUI((s) => s.panelOpen);
  const panelHeight = useUI((s) => s.panelHeight);
  const [loc] = useLocation();
  // With the sidebar (and its Tour tile) hidden, the ? sits in the corner where it clears a centred composer, the terminal and the panel.
  const roomy = useMediaQuery('(min-width: 900px)');
  useTitleBadge();

  // Moving to another page closes the drawer.
  useEffect(() => {
    if (useUI.getState().drawerOpen) useUI.getState().set({ drawerOpen: false });
  }, [loc]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`' && !editorsKey(e, '`')) {
        e.preventDefault();
        useUI.getState().set({ panelOpen: !useUI.getState().panelOpen });
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !(e.target as HTMLElement)?.closest('.cm-editor') && !editorsKey(e, 'b')) {
        e.preventDefault();
        useUI.getState().set({ sideOpen: !useUI.getState().sideOpen });
      }
      if (e.key === 'Escape' && useUI.getState().drawerOpen) useUI.getState().set({ drawerOpen: false });
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k' && !(e.target as HTMLElement)?.closest?.('.cm-editor, .xterm') && !editorsKey(e, 'k')) {
        e.preventDefault();
        usePalette.setState({ open: !usePalette.getState().open });
      }
      // Ctrl+Z right after a pin or archive undoes it (text fields keep their own undo).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"], .cm-editor') && undoLast()) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const dragPanel = useDrag((dy) => useUI.getState().set({ panelHeight: Math.max(140, Math.min(window.innerHeight - 160, useUI.getState().panelHeight - dy)) }));

  if (mobile) {
    return (
      <div data-shell className="flex h-dvh flex-col overflow-hidden bg-bg">
        <div className="min-h-0 flex-1">
          <Routes />
        </div>
        <MobileDrawer />
        <UploadTrays />
        <QuickOpen />
        <CommandPalette />
        <CountVisits />
        <ReleaseNotes />
        <WhatsNew />
        <FilePeek />
        <ArxivHost />
        <StudioHost />
        <Lightbox />
        <VideoBox />
        <Tour />
        <Tips />
        <HandsFree />
      </div>
    );
  }

  return (
    <div data-shell className="flex h-dvh overflow-hidden bg-bg">
      {sideOpen && (
        <div className="w-[280px] shrink-0">
          <Sidebar />
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <Routes />
        </div>
        {panelOpen && loc !== '/terminal' && (
          <>
            <div onPointerDown={dragPanel} className="h-1 shrink-0 cursor-row-resize border-t border-line hover:bg-accent/30" />
            <div style={{ height: panelHeight }} className="shrink-0">
              <TerminalPanel />
            </div>
          </>
        )}
      </main>
      <UploadTrays />
      <QuickOpen />
      <CommandPalette />
      <CountVisits />
      <ReleaseNotes />
      <WhatsNew />
      <FilePeek />
      <ArxivHost />
      <StudioHost />
      <Lightbox />
      <VideoBox />
      {!sideOpen && roomy && !panelOpen && loc !== '/terminal' && <HelpButton />}
      <Tour />
      <Tips />
      <HandsFree />
    </div>
  );
}
