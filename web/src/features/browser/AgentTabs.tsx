// The agents' browsers beside yours: the list is in the tab column (TabColumn), and one of them shows in the page's place
// (AgentBody), with its conversation in the right column (AgentView). What is shared here: keeping the list current, what
// each is doing in a few words, and the dialog its page opens.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BrowserView } from '@shared/browser';
import { onFeatureEvent } from '../../lib/featureEvents';
import { Throbber, useIsMobile } from '../../components/ui';
import { live as socket } from '../../lib/ws';
import { AskLine, DialogCard, KeyRow, takeOver } from './Dock';
import type { LiveViewApi } from './LiveView';
import { PageView } from './PageView';
import { loadBrowser, useBrowser } from './store';
import { isNative, KEY, loadAgentBrowsers, type AgentBrowser } from './browsing';

/** Keeps the list of the agents' browsers current: now, every 10 seconds, and when one of them has news. */
export function useAgentsRefresh() {
  useEffect(() => {
    void loadAgentBrowsers();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void loadAgentBrowsers(), 10_000);
    let soon = 0;
    const off = onFeatureEvent('browser', (e) => {
      if (!e.key || e.key === KEY) return;
      window.clearTimeout(soon);
      soon = window.setTimeout(() => void loadAgentBrowsers(), 800);
    });
    return () => {
      window.clearInterval(t);
      window.clearTimeout(soon);
      off();
    };
  }, []);
}

export const titleOf = (b: AgentBrowser, fallback?: string) => b.title || fallback || 'Session';

/** What an agent's browser is doing, in a few words. */
export function statusOf(b: AgentBrowser): { text: string; warn?: boolean } {
  if (b.driver === 'user') return { text: 'You are driving: the agent waits', warn: true };
  if (b.asks > 0) return { text: 'Waiting for you', warn: true };
  return { text: typeof b.busy === 'string' ? b.busy : b.busy ? 'Working' : 'Idle' };
}

/** The free area, measured: what is shown in it keeps its shape within. */
function Measured({ children }: { children: (w: number, h: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox((b) => (b && b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
      {box && children(box.w, box.h)}
    </div>
  );
}

/**
 * An agent's browser in the page's place: what waits for you above (its questions and dialogs), the page itself filling
 * the rest, ringed while the agent waits for you (warn) or you drive (accent).
 */
export function AgentBody({ k, onBack }: { k: string; onBack: () => void }) {
  const mobile = useIsMobile();
  const view = useBrowser((s) => s.views[k]);
  const live = useRef<LiveViewApi>(null);
  useEffect(() => void loadBrowser(k), [k]);
  // The agent's browser's news (its tabs, what it does, its pictures), while it shows here.
  useEffect(() => socket.sub(k), [k]);
  // It closed (the agent finished, or you closed it): back to your own tabs. (One just started has no browser for a moment.)
  const seen = useRef(false);
  useEffect(() => {
    if (view?.open) seen.current = true;
    else if (view && seen.current) onBack();
  }, [view?.open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view?.open) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[13px] text-fg-3">
        <Throbber size={26} />
        {view && !view.open && 'Its browser is starting'}
      </div>
    );
  }
  const driving = view.driver === 'user';
  const native = isNative(view);
  const waiting = view.asks.some((a) => a.kind !== 'local');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {view.asks.length > 0 && (
        <div className="space-y-2 border-b border-line bg-warn/8 px-3 py-2.5">
          {view.asks.map((a) => (
            <AskLine key={a.id} k={k} ask={a} phone={mobile} onTake={driving ? undefined : () => void takeOver(k, mobile)} />
          ))}
        </div>
      )}
      {native && !driving && <div className="border-b border-line px-3 py-1 text-[12px] text-fg-3">Click into the page to use it yourself</div>}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Measured>
          {(_w, h) => (
            <>
              <PageView ref={live} k={k} view={view} driving={driving} fit="scale" maxH={`${Math.max(120, h - (mobile ? 8 : 16))}px`} className="rounded-lg border border-line" />
              <AgentDialog k={k} view={view} />
            </>
          )}
        </Measured>
        {(driving || waiting) && <div className={`pointer-events-none absolute inset-0 ring-2 ring-inset ${driving ? 'ring-accent' : 'ring-warn'}`} />}
      </div>
      {driving && mobile && !native && <KeyRow live={live} />}
    </div>
  );
}

/** A dialog the agent's page opened: over the whole app when the page is a native view (nothing sits over that), else over the picture. */
export function AgentDialog({ k, view }: { k: string; view: BrowserView }) {
  if (!view.dialog) return null;
  if (!isNative(view)) return <DialogCard k={k} view={view} />;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <DialogCard k={k} view={view} />
    </div>,
    document.body,
  );
}
