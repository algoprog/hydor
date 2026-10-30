import { useEffect } from 'react';
import { useLocation, useRoute, useSearch } from 'wouter';
import { activityOf } from '../../lib/activity';
import { useSessions, useUI } from '../../lib/store';
import { useIsMobile, useMediaQuery } from '../../components/ui';
import { FilesPage } from '../files/FilesPage';
import { QuickOpen } from '../files/FileSearch';
import { UploadsPanel } from '../files/Uploads';
import { GitPage } from '../git/GitPage';
import { HomePage } from '../home/HomePage';
import { SessionView } from '../session/SessionView';
import { isSettingsSection, SettingsPage } from '../settings/SettingsPage';
import { go } from '../../lib/nav';
import { SystemPage } from '../system/SystemPage';
import { TerminalPage, TerminalPanel } from '../terminal/TerminalPanel';
import { UsagePage } from '../usage/UsagePage';
import { Sidebar } from './Sidebar';
import { undoLast } from '../../lib/flags';
import { CommandPalette, usePalette } from '../palette/CommandPalette';
import { Lightbox } from '../../components/Lightbox';
import { HelpButton, Tour } from '../tour/Tour';
import { ReviewPage } from '../review/ReviewPage';
import { PreviewPage } from '../preview/PreviewPage';

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

/** Pages fade in when you move between sections (not when a file or folder changes inside one). */
function Routes() {
  const [loc] = useLocation();
  const section = loc.startsWith('/s/') ? loc : loc === '/file' || loc === '/search' ? '/files' : loc === '/stats' ? '/usage' : loc;
  return (
    <div key={section} className="anim-fade h-full">
      <Page />
    </div>
  );
}

function Page() {
  const [loc] = useLocation();
  const search = useSearch();
  const [isSession, params] = useRoute('/s/:key');
  const [isReview, rparams] = useRoute('/review/:key');
  if (isSession && params) return <SessionView sessionKey={decodeURIComponent(params.key)} />;
  if (isReview && rparams) return <ReviewPage sessionKey={decodeURIComponent(rparams.key)} />;
  if (loc === '/file' || loc === '/files' || loc === '/search') {
    const q = new URLSearchParams(search);
    return <FilesPage path={loc === '/file' ? q.get('path') : null} line={Number(q.get('line')) || undefined} search={loc === '/search'} />;
  }
  if (loc === '/terminal') return <TerminalPage />;
  if (loc === '/preview') return <PreviewPage />;
  if (loc === '/git') return <GitPage selected={new URLSearchParams(search).get('path')} />;
  if (loc === '/usage' || loc === '/stats') return <UsagePage tab={loc === '/stats' ? 'activity' : 'limits'} />;
  if (loc === '/system') return <SystemPage />;
  if (loc === '/settings') {
    const q = new URLSearchParams(search);
    const s = q.get('s');
    const agent = q.get('agent');
    return <SettingsPage section={isSettingsSection(s) ? s : null} cwd={q.get('cwd')} agent={agent === 'claude' || agent === 'codex' ? agent : null} />;
  }
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

/** "(2) Agent Console" while sessions wait for an approval or an answer. */
function useTitleBadge() {
  const waiting = useSessions((s) => Object.values(s.byKey).filter((x) => activityOf(x)?.status === 'waiting').length);
  useEffect(() => {
    document.title = waiting ? `(${waiting}) Agent Console` : 'Agent Console';
  }, [waiting]);
}

export function Shell() {
  const mobile = useIsMobile();
  const { sideOpen, drawerOpen, panelOpen, panelHeight } = useUI();
  const [loc] = useLocation();
  // The ? sits in the corner only where it clears a centred composer, the terminal and the panel.
  const roomy = useMediaQuery(sideOpen ? '(min-width: 1180px)' : '(min-width: 900px)');
  useTitleBadge();

  // Moving to another page closes the drawer.
  useEffect(() => {
    if (useUI.getState().drawerOpen) useUI.getState().set({ drawerOpen: false });
  }, [loc]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        useUI.getState().set({ panelOpen: !useUI.getState().panelOpen });
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !(e.target as HTMLElement)?.closest('.cm-editor')) {
        e.preventDefault();
        useUI.getState().set({ sideOpen: !useUI.getState().sideOpen });
      }
      if (e.key === 'Escape' && useUI.getState().drawerOpen) useUI.getState().set({ drawerOpen: false });
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k' && !(e.target as HTMLElement)?.closest?.('.cm-editor, .xterm')) {
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
      <div className="flex h-dvh flex-col overflow-hidden bg-bg">
        <div className="min-h-0 flex-1">
          <Routes />
        </div>
        {drawerOpen && (
          <div className="anim-overlay fixed inset-0 z-40 bg-black/45" onPointerDown={(e) => e.target === e.currentTarget && useUI.getState().set({ drawerOpen: false })}>
            <div className="anim-drawer h-full w-[86vw] max-w-[340px] shadow-lg">
              <Sidebar mobile />
            </div>
          </div>
        )}
        <UploadsPanel />
        <QuickOpen />
        <CommandPalette />
        <Lightbox />
        <Tour />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {sideOpen && (
        <div className="w-[280px] shrink-0 border-r border-line">
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
      <UploadsPanel />
      <QuickOpen />
      <CommandPalette />
      <Lightbox />
      {roomy && !panelOpen && loc !== '/terminal' && <HelpButton />}
      <Tour />
    </div>
  );
}
