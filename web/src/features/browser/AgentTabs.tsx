// The agents' browsers beside yours: a list (what each is doing, its tabs, a tab you handed over with Take back), and
// the page of one of them shown in the page's place, with a thin bar to open its conversation or take over.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Hand, MessageSquare, Undo2 } from 'lucide-react';
import type { BrowserTab, BrowserView } from '@shared/browser';
import { openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Throbber, useIsMobile } from '../../components/ui';
import { onFeatureEvent } from '../../lib/featureEvents';
import { live as socket } from '../../lib/ws';
import { AskLine, DialogCard, handBack, KeyRow, takeOver } from './Dock';
import type { LiveViewApi } from './LiveView';
import { PageView } from './PageView';
import { Favicon } from './TabStrip';
import { hostOf, loadBrowser, useBrowser } from './store';
import { isNative, KEY, loadAgentBrowsers, tabName, takeBack, useAgentBrowsers, type AgentBrowser } from './browsing';
import { Note, Panel } from './Panel';

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

const titleOf = (b: AgentBrowser, fallback?: string) => b.title || fallback || 'Session';

/** What an agent's browser is doing, in a few words. */
function statusOf(b: AgentBrowser): { text: string; warn?: boolean } {
  if (b.driver === 'user') return { text: 'You are driving: the agent waits', warn: true };
  if (b.asks > 0) return { text: 'Waiting for you', warn: true };
  return { text: typeof b.busy === 'string' ? b.busy : b.busy ? 'Working' : 'Idle' };
}

function Tabs({ tabs }: { tabs: BrowserTab[] }) {
  return (
    <div className="mt-1.5 space-y-0.5">
      {tabs.slice(0, 6).map((t) => (
        <div key={t.id} className="flex items-center gap-2 text-[12px] text-fg-3">
          <Favicon tab={t} size={12} />
          <span translate="no" className={cx('min-w-0 flex-1 truncate', t.active && 'text-fg-2')}>
            {tabName(t)}
          </span>
        </div>
      ))}
      {tabs.length > 6 && <div className="text-[12px] text-fg-3">and {tabs.length - 6} more</div>}
    </div>
  );
}

export function AgentsPanel({ onClose, onWatch }: { onClose: () => void; onWatch: (key: string) => void }) {
  const { browsers, loaded } = useAgentBrowsers();
  const sessions = useSessions((s) => s.byKey);
  return (
    <Panel title="Agents’ tabs" onClose={onClose}>
      {!loaded ? (
        <div className="flex justify-center py-10">
          <Throbber size={24} />
        </div>
      ) : !browsers.length ? (
        <Note>No agent has a browser open now. When one does, its tabs show here, and you can watch it or take over.</Note>
      ) : (
        browsers.map((b) => {
          const st = statusOf(b);
          const s = sessions[b.key];
          const active = b.tabs.find((t) => t.active) ?? b.tabs[0];
          return (
            <div key={b.key} className="border-b border-line px-4 py-3">
              <button onClick={() => onWatch(b.key)} className="block w-full text-left">
                <div className="flex items-center gap-2">
                  {s && <AgentIcon agent={s.agent} name={s.acpName} size={14} className="shrink-0" />}
                  <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                    {titleOf(b, s?.title)}
                  </span>
                </div>
                <div className={cx('mt-0.5 text-[12.5px]', st.warn ? 'text-warn' : 'text-fg-3', !st.warn && b.busy && 'shine')}>{st.text}</div>
                <Tabs tabs={b.tabs} />
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => onWatch(b.key)}>
                  Show
                </Button>
                {b.handedFrom && active && (
                  <>
                    <span className="text-[12px] text-fg-3">Your tab from {b.handedFrom}</span>
                    <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} onClick={() => void takeBack(active.id)}>
                      Take back
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </Panel>
  );
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

/** An agent's browser in the page's place: its bar, what waits for you, and the page. */
export function AgentPane({ k, onBack }: { k: string; onBack: () => void }) {
  const mobile = useIsMobile();
  const view = useBrowser((s) => s.views[k]);
  const b = useAgentBrowsers((s) => s.browsers.find((x) => x.key === k));
  const session = useSessions((s) => s.byKey[k]);
  const live = useRef<LiveViewApi>(null);
  useEffect(() => void loadBrowser(k), [k]);
  // The agent's browser's news (its tabs, what it does, its pictures), while it shows here.
  useEffect(() => socket.sub(k), [k]);
  // It closed (the agent finished, or you closed it): back to your own tabs.
  useEffect(() => {
    if (view && !view.open) onBack();
  }, [view?.open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Throbber size={26} />
      </div>
    );
  }
  const driving = view.driver === 'user';
  const native = isNative(view);
  const tab = view.tabs.find((t) => t.active) ?? view.tabs[0];
  const status = driving ? 'You are driving: the agent waits' : view.asks.some((a) => a.kind !== 'local') ? 'Waiting for you' : view.busy;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-1 px-3">
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack}>
          {mobile ? 'Back' : 'Back to your tabs'}
        </Button>
        <div className="min-w-0 flex-1">
          <div translate="no" className="truncate text-[13px] font-medium">
            {b?.title || session?.title || 'Agent’s browser'}
          </div>
          <div className={cx('truncate text-[11.5px]', driving ? 'text-warn' : 'text-fg-3')}>{status || hostOf(tab?.url ?? '') || ''}</div>
        </div>
        {view.handedFrom && tab && (
          <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={() => void takeBack(tab.id)} title={`Your tab from ${view.handedFrom}`}>
            Take back
          </Button>
        )}
        {session && (
          <Button size="sm" variant="ghost" icon={<MessageSquare size={14} />} onClick={() => openSession(k)}>
            {mobile ? 'Chat' : 'Open the conversation'}
          </Button>
        )}
        {driving ? (
          <Button size="sm" variant="primary" onClick={() => void handBack(k)} title="Give the browser back to the agent">
            Hand back
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<Hand size={14} />} onClick={() => void takeOver(k, mobile)} title="Use the browser yourself; the agent waits">
            Take over
          </Button>
        )}
      </div>
      {view.asks.length > 0 && (
        <div className="space-y-2 border-b border-line bg-warn/8 px-3 py-2.5">
          {view.asks.map((a) => (
            <AskLine key={a.id} k={k} ask={a} phone={mobile} onTake={driving ? undefined : () => void takeOver(k, mobile)} />
          ))}
        </div>
      )}
      {native && !driving && (
        <div className="border-b border-line px-3 py-1 text-[12px] text-fg-3">Click into the page to use it yourself</div>
      )}
      <Measured>
        {(_w, h) => (
          <>
            <PageView ref={live} k={k} view={view} driving={driving} fit="scale" maxH={`${Math.max(120, h - (mobile ? 8 : 16))}px`} className="rounded-lg border border-line" />
            <AgentDialog k={k} view={view} />
          </>
        )}
      </Measured>
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
