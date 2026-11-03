// Above a session's message box while its browser is open: what the agent is doing there, a live
// view to watch (full screen on a phone), taking over to log in or pass a check, and handing back.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronUp, CreditCard, Ellipsis, FileDown, Globe, Hand, Keyboard, Maximize2, Minimize2, RotateCw, Server, X } from 'lucide-react';
import type { BrowserAsk, BrowserView } from '@shared/browser';
import type { SessionSummary } from '@shared/types';
import { Button, cx, IconButton, inputCls, MenuItem, MenuLabel, MenuSep, Popover, useIsMobile } from '../../components/ui';
import { openFile } from '../../lib/nav';
import { browserCall, hostOf, listenBrowser, loadBrowser, useBrowser } from './store';
import { LiveView, type LiveViewApi } from './LiveView';
import { SessionSites, ProfilePicker } from './Options';

/** Opens a session's browser view from elsewhere (a card in the conversation, the session's menu). */
export const showBrowser = (key: string) => window.dispatchEvent(new CustomEvent('hydor:browser', { detail: { key } }));

/** The user takes the wheel: on a phone, the page is laid out for its screen meanwhile. */
export function takeOver(key: string, phone: boolean) {
  const fit = phone ? { w: window.innerWidth, h: Math.max(320, window.innerHeight - 150), scale: Math.min(2, window.devicePixelRatio || 1) } : undefined;
  return browserCall(key, '/takeover', { on: true, fit });
}
export const handBack = (key: string) => browserCall(key, '/takeover', { on: false });
export const answerAsk = (key: string, id: string, outcome: 'done' | 'skipped') => browserCall(key, `/asks/${id}`, { outcome });

/** What waits for the user, with its buttons. */
export function AskLine({ k, ask, phone, onTake }: { k: string; ask: BrowserAsk; phone: boolean; onTake?: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const take = () =>
    run(async () => {
      await takeOver(k, phone);
      onTake?.();
    });
  const head =
    ask.kind === 'local' ? (
      <>
        Wants to open <span className="font-mono text-[12.5px]">{ask.text}</span>, on this machine or its network
      </>
    ) : ask.kind === 'payment' ? (
      <>Stopped before paying or ordering: {ask.text}. That is yours to do.</>
    ) : (
      <>Needs you in the browser: {ask.text}</>
    );
  const Icon = ask.kind === 'local' ? Server : ask.kind === 'payment' ? CreditCard : Hand;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Icon size={15} className="shrink-0 text-warn" />
      <div className="min-w-[min(100%,220px)] flex-1 text-[13.5px] leading-snug">{head}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {ask.kind === 'local' ? (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => answerAsk(k, ask.id, 'skipped'))}>
              Don’t allow
            </Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => answerAsk(k, ask.id, 'done'))}>
              Allow for this session
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => answerAsk(k, ask.id, 'skipped'))}>
              {ask.kind === 'payment' ? 'Not now' : 'Can’t'}
            </Button>
            {onTake && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={take}>
                Take over
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => answerAsk(k, ask.id, 'done'))}>
              Done
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** A JavaScript dialog the page opened, over the live view: only the user answers it. */
function DialogCard({ k, view }: { k: string; view: BrowserView }) {
  const d = view.dialog!;
  const [text, setText] = useState(d.defaultPrompt ?? '');
  const [busy, setBusy] = useState(false);
  const answer = async (accept: boolean) => {
    setBusy(true);
    await browserCall(k, '/dialog', { accept, text: d.type === 'prompt' ? text : undefined });
    setBusy(false);
  };
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 p-3">
      <div className="anim-pop w-full max-w-[380px] rounded-2xl border border-line bg-elevated p-4 shadow-lg">
        <div className="text-[12px] text-fg-3">{hostOf(d.url) || 'The page'} {d.type === 'beforeunload' ? 'asks whether to leave' : 'says'}</div>
        <div className="mt-1 max-h-[30vh] overflow-y-auto text-[14px] leading-relaxed break-words whitespace-pre-wrap">{d.message || (d.type === 'beforeunload' ? 'Leave this page? Changes may not be saved.' : '')}</div>
        {d.type === 'prompt' && <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className={cx(inputCls, 'mt-3')} />}
        <div className="mt-4 flex justify-end gap-2">
          {d.type !== 'alert' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => answer(false)}>
              {d.type === 'beforeunload' ? 'Stay' : 'Cancel'}
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={busy} onClick={() => answer(true)}>
            {d.type === 'beforeunload' ? 'Leave' : 'OK'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Back, reload and the address, for the user while they drive. */
function AddressBar({ k, view, driving }: { k: string; view: BrowserView; driving: boolean }) {
  const tab = view.tabs.find((t) => t.active);
  const [url, setUrl] = useState(tab?.url ?? '');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setUrl(tab?.url ?? '');
  }, [tab?.url, editing]);
  if (!driving) return null;
  const go = async () => {
    setEditing(false);
    if (url.trim() && url !== tab?.url) await browserCall(k, '/navigate', { url });
  };
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Back" size="sm" onClick={() => browserCall(k, '/nav', { do: 'back' })}>
        <ArrowLeft size={15} />
      </IconButton>
      <IconButton label="Reload" size="sm" onClick={() => browserCall(k, '/nav', { do: 'reload' })}>
        <RotateCw size={14} />
      </IconButton>
      <input
        value={url}
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onBlur={() => setEditing(false)}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void go()}
        aria-label="Address"
        className="h-8 min-w-0 flex-1 rounded-lg border border-line-2 bg-bg-1 px-2.5 font-mono text-[12px] outline-none focus:border-accent/60"
      />
    </div>
  );
}

/** The free area for the live view, measured: the page keeps its shape inside it. */
function FitBox({ children }: { children: (w: number, h: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox((b) => (b && b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
      {box && children(box.w, box.h)}
    </div>
  );
}

/** While a phone drives, the page is laid out for the area it shows in (once that is known). */
function useFitPage(key: string, view: BrowserView, on: boolean, area: { w: number; h: number } | null) {
  const done = useRef<string>('');
  useEffect(() => {
    if (!on || !area) {
      if (!on) done.current = '';
      return;
    }
    const w = Math.floor(area.w - 16);
    const h = Math.floor(area.h - 16);
    const id = `${w}x${h}`;
    if (done.current === id || (view.viewport.mobile && Math.abs(view.viewport.w - w) < 24 && Math.abs(view.viewport.h - h) < 24)) return;
    done.current = id;
    void browserCall(key, '/takeover', { on: true, fit: { w, h, scale: Math.min(2, window.devicePixelRatio || 1) } });
  }, [key, on, area?.w, area?.h, view.viewport.mobile, view.viewport.w, view.viewport.h]);
}

const KEYS: { label: ReactNode; key: string }[] = [
  { label: 'Tab', key: 'Tab' },
  { label: 'Enter', key: 'Enter' },
  { label: 'Esc', key: 'Escape' },
  { label: '⌫', key: 'Backspace' },
  { label: '←', key: 'ArrowLeft' },
  { label: '→', key: 'ArrowRight' },
  { label: '↑', key: 'ArrowUp' },
  { label: '↓', key: 'ArrowDown' },
];

/** The browser's menu: its tabs, the profile it uses, sites, files it saved, closing it. */
function BrowserMenu({ s, view, close }: { s: SessionSummary; view: BrowserView; close: () => void }) {
  const [sites, setSites] = useState(false);
  return (
    <>
      {view.tabs.length > 1 && (
        <>
          <MenuLabel>Tabs</MenuLabel>
          {view.tabs.map((t) => (
            <MenuItem
              key={t.id}
              icon={<Globe size={14} />}
              checked={t.active}
              onClick={() => {
                void browserCall(s.key, '/tab', { id: t.id });
                close();
              }}
            >
              {t.title || hostOf(t.url) || 'New tab'}
            </MenuItem>
          ))}
          <MenuSep />
        </>
      )}
      {view.downloads.filter((d) => d.done && !d.failed).length > 0 && (
        <>
          <MenuLabel>Saved in the session’s folder</MenuLabel>
          {view.downloads
            .filter((d) => d.done && !d.failed)
            .slice(0, 4)
            .map((d) => (
              <MenuItem key={d.path} icon={<FileDown size={14} />} onClick={() => (openFile(d.path), close())}>
                {d.name}
              </MenuItem>
            ))}
          <MenuSep />
        </>
      )}
      <ProfilePicker k={s.key} onPicked={close} />
      <MenuItem icon={<Globe size={14} />} onClick={() => setSites(true)}>
        Sites for this session
      </MenuItem>
      <MenuSep />
      <MenuItem
        danger
        icon={<X size={14} />}
        onClick={() => {
          void browserCall(s.key, '/close');
          close();
        }}
      >
        Close the browser
      </MenuItem>
      <SessionSites k={s.key} open={sites} onClose={() => (setSites(false), close())} />
    </>
  );
}

function FitPage({ k, view, on, area }: { k: string; view: BrowserView; on: boolean; area: { w: number; h: number } }) {
  useFitPage(k, view, on, area);
  return null;
}

export function BrowserDock({ s }: { s: SessionSummary }) {
  const key = s.key;
  useEffect(() => {
    listenBrowser();
    void loadBrowser(key);
  }, [key]);
  const view = useBrowser((x) => x.views[key]);
  const mobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [full, setFull] = useState(false);
  const [menu, setMenu] = useState(false);
  // Full screen shows the header a second time: each copy of the menu's button has its own ref, as the
  // copy that closes empties its ref (a shared one left the menu with nothing to open from).
  const menuRef = useRef<HTMLButtonElement>(null);
  const fullMenuRef = useRef<HTMLButtonElement>(null);
  const live = useRef<LiveViewApi>(null);
  const asks = view?.asks.length ?? 0;
  // What needs the page itself (a login, a payment, a dialog) opens the live view; allowing an address does not.
  const needsPage = view?.asks.filter((a) => a.kind !== 'local').length ?? 0;
  const dialog = !!view?.dialog;

  // Shown when asked for from a card or the menu; what needs the user opens it on a computer.
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail?.key !== key) return;
      if (mobile) setFull(true);
      else setExpanded(true);
    };
    window.addEventListener('hydor:browser', h);
    return () => window.removeEventListener('hydor:browser', h);
  }, [key, mobile]);
  // Opened for what needed the user: closed again once it is settled (unless they opened it themselves).
  const auto = useRef(false);
  useEffect(() => {
    if ((needsPage || dialog) && !mobile && !expanded) {
      auto.current = true;
      setExpanded(true);
    } else if (!needsPage && !dialog && auto.current && view?.driver !== 'user') {
      auto.current = false;
      setExpanded(false);
    }
  }, [needsPage, dialog, mobile, view?.driver]);
  useEffect(() => {
    if (!view?.open) setFull(false);
  }, [view?.open]);

  if (!view || (!view.open && !asks)) return null;
  const tab = view.tabs.find((t) => t.active) ?? view.tabs[0];
  const driving = view.driver === 'user';
  const waiting = view.asks.filter((a) => a.kind !== 'local');
  const status = driving ? 'You are driving: the agent waits' : waiting.length ? 'Waiting for you' : view.busy;
  const take = async () => {
    await takeOver(key, mobile);
    if (mobile) setFull(true);
    else setExpanded(true);
  };
  const back = () => handBack(key);

  const header = (inFull: boolean) => (
    <div className="flex items-center gap-2.5 px-3 py-2">
      {!inFull && !expanded && view.open && (
        <button onClick={() => (mobile ? setFull(true) : setExpanded(true))} className="w-[76px] shrink-0 overflow-hidden rounded-md border border-line" aria-label="Show the browser">
          <LiveView k={key} view={view} driving={false} small />
        </button>
      )}
      {(inFull || expanded || !view.open) && <Globe size={16} className={cx('shrink-0', view.busy ? 'text-busy' : 'text-fg-3')} />}
      <button className="min-w-0 flex-1 text-left" onClick={() => (inFull ? undefined : mobile ? setFull(true) : setExpanded((x) => !x))}>
        <div className="truncate text-[13.5px] font-medium">{!tab || tab.url === 'about:blank' ? 'Blank page' : tab.title || hostOf(tab.url) || 'Browser'}</div>
        <div className="flex items-center gap-1.5 truncate text-[12px] text-fg-3">
          {view.profileName && <span className="shrink-0 rounded bg-bg-2 px-1.5 text-[11px]">{view.profileName}</span>}
          {status ? <span className={cx('truncate', !driving && view.busy && 'shine', (driving || waiting.length > 0) && 'text-warn')}>{status}</span> : <span className="truncate">{hostOf(tab?.url ?? '') || 'Agent’s browser'}</span>}
          {view.tabs.length > 1 && <span className="shrink-0">· {view.tabs.length} tabs</span>}
        </div>
      </button>
      {view.open &&
        (driving ? (
          <Button size="sm" variant="primary" onClick={back} title="Give the browser back to the agent">
            Hand back
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<Hand size={14} />} onClick={take} title="Use the browser yourself; the agent waits">
            Take over
          </Button>
        ))}
      {!inFull && !mobile && view.open && (
        <IconButton label="Full screen" size="sm" onClick={() => setFull(true)}>
          <Maximize2 size={14} />
        </IconButton>
      )}
      {inFull ? (
        <IconButton label="Close full screen" size="sm" onClick={() => setFull(false)}>
          {mobile ? <X size={17} /> : <Minimize2 size={14} />}
        </IconButton>
      ) : (
        !mobile && (
          <IconButton label={expanded ? 'Hide the live view' : 'Show the live view'} size="sm" onClick={() => ((auto.current = false), setExpanded((x) => !x))}>
            {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </IconButton>
        )
      )}
      {view.open && (
        <IconButton ref={inFull ? fullMenuRef : menuRef} label="Browser options" size="sm" active={menu} onClick={() => setMenu((m) => !m)}>
          <Ellipsis size={15} />
        </IconButton>
      )}
    </div>
  );

  const askList = view.asks.length > 0 && (
    <div className="space-y-2 border-b border-line bg-warn/8 px-3 py-2.5">
      {view.asks.map((a) => (
        <AskLine key={a.id} k={key} ask={a} phone={mobile} onTake={driving ? undefined : () => (mobile ? setFull(true) : setExpanded(true))} />
      ))}
    </div>
  );

  return (
    <div className="shrink-0 px-3 sm:px-6">
      <div className="mx-auto mb-2 max-w-[800px]">
        <div data-tip="browser" className={cx('anim-expand overflow-hidden rounded-2xl border bg-panel', asks || driving ? 'border-warn/50' : 'border-line-2')}>
          {askList}
          {header(false)}
          {expanded && !full && view.open && (
            <div className="space-y-2 px-3 pb-3">
              <AddressBar k={key} view={view} driving={driving} />
              <div className="relative">
                <LiveView ref={live} k={key} view={view} driving={driving} maxH="44vh" className="rounded-lg border border-line" />
                {view.dialog && <DialogCard k={key} view={view} />}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Over the whole app, like the other full-screen layers: inside the page, the sidebar's group
          headings showed through it. */}
      {full &&
        view.open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-bg pt-[var(--safe-top,0px)]">
            <div className="border-b border-line">
              {header(true)}
              {askList}
              {driving && (
                <div className="px-3 pb-2">
                  <AddressBar k={key} view={view} driving={driving} />
                </div>
              )}
            </div>
            <FitBox>
              {(w, h) => (
                <>
                  <FitPage k={key} view={view} on={driving && mobile} area={{ w, h }} />
                  <LiveView ref={live} k={key} view={view} driving={driving} maxH={`${Math.max(120, h - 16)}px`} className="rounded-lg border border-line" />
                  {view.dialog && <DialogCard k={key} view={view} />}
                </>
              )}
            </FitBox>
            {driving && mobile && (
              <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-line bg-bg-1 px-1.5 py-1.5 pb-[max(6px,var(--safe-bottom))] [&::-webkit-scrollbar]:hidden">
                <button onClick={() => live.current?.keyboard()} aria-label="Keyboard" className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg">
                  <Keyboard size={15} /> Type
                </button>
                {KEYS.map((x) => (
                  <button key={x.key} onClick={() => live.current?.press(x.key)} className="h-9 min-w-9 shrink-0 rounded-md bg-bg-3 px-2.5 font-mono text-[12.5px] text-fg">
                    {x.label}
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
      {/* One menu, from the button on screen (after the full-screen one, so that one's ref is set). */}
      <Popover anchor={full ? fullMenuRef : menuRef} open={menu && view.open} onClose={() => setMenu(false)} align="end" width={270} prefer="above">
        <BrowserMenu s={s} view={view} close={() => setMenu(false)} />
      </Popover>
    </div>
  );
}

