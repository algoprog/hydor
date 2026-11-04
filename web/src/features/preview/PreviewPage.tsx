// Preview: the web apps running on this machine (a dev server: Vite, Next, a Python server…), each with its
// page's title and project, to look at inside the app at a computer's, tablet's or phone's size, with an
// address bar, back, forward and reload. Where this browser can't reach the preview port (the app behind a
// tunnel with one hostname), the page runs in the app's own browser on this computer instead and streams
// here, live: clicks, keys, scrolling and touch go to it. It shows as pictures on request. A screen can open
// in a tab of its own, be saved as a picture, or go to an agent with a question.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { ArrowLeft, ArrowRight, Camera, ChevronDown, ChevronRight, Ellipsis, ExternalLink, Globe, Image as ImageIcon, MessageSquarePlus, Monitor, MonitorSmartphone, RotateCw, Server, Smartphone, Tablet } from 'lucide-react';
import type { BrowserView } from '@shared/browser';
import { api, post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { startSessionWith } from '../../lib/startFiles';
import { live as socket } from '../../lib/ws';
import { tr } from '../../i18n/runtime';
import { toastError, useApp } from '../../lib/store';
import { Button, cx, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Segmented, Throbber, useIsMobile } from '../../components/ui';
import { SystemHeader } from '../system/SystemHeader';
import { RefreshIcon } from '../../components/RefreshIcon';
import { DialogCard, KeyRow } from '../browser/Dock';
import { LiveView, type LiveViewApi } from '../browser/LiveView';
import { browserCall, listenBrowser, useBrowser } from '../browser/store';

interface DevServer {
  port: number;
  program: string;
  command: string;
  cwd?: string;
  web?: boolean;
  title?: string;
  project?: string;
  framework?: string;
}

interface Info {
  servers: DevServer[];
  port: number | null;
  origin: string | null;
}

type Device = 'desktop' | 'tablet' | 'phone';
const WIDTH: Record<Device, number> = { desktop: 0, tablet: 820, phone: 390 };
const DEVICES: { value: Device; label: string; icon: ReactNode }[] = [
  { value: 'desktop', label: 'Computer', icon: <Monitor size={14} /> },
  { value: 'tablet', label: 'Tablet', icon: <Tablet size={14} /> },
  { value: 'phone', label: 'Phone', icon: <Smartphone size={14} /> },
];

type Reach = 'checking' | 'yes' | 'no';

const nameOf = (s: DevServer) => s.project ?? s.title ?? s.program;
const pathOf = (href: string) => {
  try {
    const u = new URL(href);
    return u.pathname + u.search + u.hash;
  } catch {
    return '/';
  }
};
/** Where the streamed page is: its path on the dev server, or the whole address on another site. */
const shownAt = (href: string, port: number) => {
  try {
    const u = new URL(href);
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) && Number(u.port) === port ? u.pathname + u.search + u.hash : u.href;
  } catch {
    return '/';
  }
};

/** The page's square: what serves it, as its first letter. */
function Tile({ s, active }: { s: DevServer; active?: boolean }) {
  return (
    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-semibold', s.web ? 'bg-accent-soft text-accent' : 'bg-bg-2 text-fg-3', active && 'ring-1 ring-accent/50')}>
      {s.web ? (s.framework ?? s.title ?? 'W')[0].toUpperCase() : <Server size={15} />}
    </span>
  );
}

function ServerRow({ s, active, onOpen }: { s: DevServer; active: boolean; onOpen: () => void }) {
  const home = useApp((x) => x.boot?.home);
  return (
    <button type="button" onClick={onOpen} className={cx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors', active ? 'bg-bg-3' : 'hover:bg-bg-2')}>
      <Tile s={s} active={active} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">
            {nameOf(s)}
          </span>
          <span className="shrink-0 font-mono text-[11.5px] text-fg-3">:{s.port}</span>
        </span>
        <span translate="no" className="block truncate text-[12px] text-fg-3" title={s.command}>
          {[s.title && s.title !== nameOf(s) ? s.title : null, s.framework, s.cwd ? tildify(s.cwd, home) : null].filter(Boolean).join(' · ') || s.program}
        </span>
      </span>
    </button>
  );
}

/** The frame (or the picture) at a device's width, scaled down to fit. `onFit` hears the page's size in CSS pixels. */
function Stage({ device, children, onFit }: { device: Device; children: ReactNode; onFit?: (fit: { w: number; h: number }) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const want = WIDTH[device];
  const scale = want && size.w ? Math.min(1, (size.w - 32) / want) : 1;
  const fitW = want || size.w;
  const fitH = Math.round(want ? (size.h - 32) / scale : size.h);
  useEffect(() => {
    if (size.w > 0 && size.h > 0) onFit?.({ w: fitW, h: fitH });
  }, [fitW, fitH, size.w, size.h, onFit]);
  if (!want)
    return (
      <div ref={box} className="relative h-full w-full bg-white dark:bg-[#151412]">
        {children}
      </div>
    );
  return (
    <div ref={box} className="relative h-full w-full overflow-hidden bg-bg-2">
      {size.w > 0 && (
        <div
          className="absolute top-4 left-1/2 overflow-hidden rounded-[16px] bg-white dark:bg-[#151412] shadow-[0_0_0_1px_var(--line-2),0_10px_30px_rgba(0,0,0,.2)]"
          style={{ width: want, height: (size.h - 32) / scale, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Device pixels per CSS pixel for the streamed page: sharp on this screen, its frames at most 1600 pixels wide. */
const scaleFor = (w: number) => Math.max(1, Math.min(2, window.devicePixelRatio || 1, 1600 / Math.max(1, w)));

/**
 * The page in the app's own browser on this computer, streaming: opened while `on`, laid out at `fit` (as
 * Preview shows it), where it was left when Preview comes back to it.
 */
function useStream(port: number, on: boolean, device: Device, fit: { w: number; h: number } | null) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const view = useBrowser((x) => (key ? x.views[key] : undefined));
  const open = !!view?.open;
  const url = view?.tabs.find((t) => t.active)?.url;
  // A path to go to once; and where the page was, to open there again once its browser has closed (unwatched for a while).
  const goTo = useRef<string | undefined>(undefined);
  const last = useRef('/');
  if (open && url && /^https?:/.test(url)) last.current = shownAt(url, port);
  const closed = !!key && !!view && !open;
  useEffect(() => listenBrowser(), []);
  useEffect(() => (key ? socket.sub(key) : undefined), [key]);
  useEffect(() => {
    // Closed after a while with nobody looking: it opens again once someone looks (not from a tab in the background).
    if (!on || !fit || (closed && !visible)) return;
    if (closed && goTo.current === undefined && last.current.startsWith('/')) goTo.current = last.current;
    let alive = true;
    const t = window.setTimeout(
      () => {
        const at = goTo.current;
        goTo.current = undefined;
        post<{ key: string; view: BrowserView }>('/api/preview/live', { port, device, w: fit.w, h: fit.h, scale: scaleFor(fit.w), ...(at !== undefined ? { path: at } : {}) })
          .then((r) => {
            useBrowser.setState((st) => ({ views: { ...st.views, [r.key]: r.view } }));
            if (!alive) return;
            setKey(r.key);
            setError(null);
          })
          .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
      },
      // At once the first time; a resize settles first.
      key && !closed ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, port, device, fit?.w, fit?.h, n, closed, closed && visible]);
  return {
    key: open ? key : null,
    view: open ? view : undefined,
    url: open ? url : undefined,
    error,
    /** Goes to a path on the dev server. */
    go: (at: string) => {
      goTo.current = at;
      setN((x) => x + 1);
    },
    /** Back, forward or reload; with no page yet, tries to open it again. */
    nav: (to: 'back' | 'forward' | 'reload') => {
      if (key && open) void browserCall(key, '/nav', { do: to });
      else setN((x) => x + 1);
    },
  };
}

/**
 * One web app: the page itself in a frame when this browser reaches the preview port; else streamed from
 * the app's own browser on this computer, which the user drives; or, on request, as pictures taken here.
 */
function Viewer({ s, origin, reach, onBack }: { s: DevServer; origin: string | null; reach: Reach; onBack?: () => void }) {
  const mobile = useIsMobile();
  const [device, setDevice] = useState<Device>(() => (localStorage.getItem('wa.preview.device') as Device) || 'desktop');
  const [path, setPath] = useState('/');
  const [field, setField] = useState('/');
  const [src, setSrc] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [picture, setPicture] = useState(false);
  const [shotN, setShotN] = useState(0);
  const [shotState, setShotState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState(false);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const pageRef = useRef<LiveViewApi>(null);
  const mode: 'checking' | 'frame' | 'stream' | 'picture' = picture ? 'picture' : reach === 'checking' ? 'checking' : reach === 'yes' && origin ? 'frame' : 'stream';
  const live = mode === 'frame';
  const stream = useStream(s.port, mode === 'stream', device, fit);
  useEffect(() => localStorage.setItem('wa.preview.device', device), [device]);

  // The address bar follows the streamed page.
  useEffect(() => {
    if (mode !== 'stream' || !stream.url || !/^https?:/.test(stream.url)) return;
    const p = shownAt(stream.url, s.port);
    setPath(p);
    setField(p);
  }, [mode, stream.url, s.port]);

  // A fresh entry link each time the server or the way to look at it changes.
  useEffect(() => {
    setSrc(null);
    setTitle(null);
    if (!live) return;
    let alive = true;
    post<{ token: string }>('/api/preview/link', { port: s.port })
      .then((r) => alive && setSrc(`${origin}/__ac/open?t=${encodeURIComponent(r.token)}&to=${encodeURIComponent(path)}`))
      .catch(toastError);
    return () => {
      alive = false;
    };
    // The path is where it opens; moving inside it after that goes through the frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.port, live, origin]);

  // Where the page is now, as its helper says (the address bar follows clicks inside it).
  useEffect(() => {
    if (!live || !origin) return;
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== new URL(origin).origin) return;
      const d = e.data;
      if (!d || d.type !== 'naget-preview' || typeof d.href !== 'string') return;
      const p = pathOf(d.href);
      setPath(p);
      setField(p);
      setTitle(typeof d.title === 'string' ? d.title.slice(0, 200) : null);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [live, origin]);

  const goTo = (e?: FormEvent) => {
    e?.preventDefault();
    // The streamed page went to another site: its address goes as typed.
    if (mode === 'stream' && stream.key && /^https?:\/\//i.test(field.trim())) return void browserCall(stream.key, '/navigate', { url: field.trim() });
    const p = field.trim().startsWith('/') ? field.trim() : `/${field.trim()}`;
    setPath(p);
    setField(p);
    if (live && origin) setSrc(`${origin}${p}`);
    else if (mode === 'stream') stream.go(p);
    else setShotN((n) => n + 1);
  };
  const nav = (to: 'back' | 'forward' | 'reload') => {
    if (mode === 'stream') return stream.nav(to);
    if (!live) return setShotN((n) => n + 1);
    const w = frame.current?.contentWindow;
    if (w && origin) w.postMessage({ type: 'naget-preview-go', go: to }, new URL(origin).origin);
    // A page without the helper (another site's, a file) still reloads.
    if (to === 'reload' && src) setSrc(src.includes('/__ac/open') ? `${origin}${path}` : src);
  };
  const shotUrl = `/api/preview/shot?port=${s.port}&path=${encodeURIComponent(path)}&device=${device}&n=${shotN}`;
  useEffect(() => setShotState('loading'), [shotUrl]);
  // Saved or handed to an agent: the streamed page as it is now; else a picture taken afresh.
  const nowLive = mode === 'stream' && !!stream.key;

  const openTab = async () => {
    setMenu(false);
    if (!origin) return;
    const w = window.open('about:blank', '_blank');
    try {
      const r = await post<{ token: string }>('/api/preview/link', { port: s.port });
      const url = `${origin}/__ac/open?t=${encodeURIComponent(r.token)}&to=${encodeURIComponent(path)}`;
      if (w) w.location.href = url;
      else location.href = url;
    } catch (e) {
      w?.close();
      toastError(e);
    }
  };
  const savePicture = async () => {
    setMenu(false);
    try {
      const r = await fetch(nowLive ? `${shotUrl}&live=1` : shotUrl, { credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'No picture');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(s.project ?? `port-${s.port}`).replace(/[^\w.-]+/g, '-')}${path === '/' ? '' : path.replace(/[^\w.-]+/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toastError(e);
    }
  };
  const ask = async () => {
    setMenu(false);
    setAsking(true);
    try {
      const r = await post<{ path: string; size: number }>('/api/preview/shot', { port: s.port, path, device, live: nowLive });
      const where = path.startsWith('/') ? `localhost:${s.port}${path}` : path;
      startSessionWith([{ path: r.path, size: r.size }], `/?prompt=${encodeURIComponent(`${tr(`About this screen of ${nameOf(s)} (${where}):`)} `)}${s.cwd ? `&cwd=${encodeURIComponent(s.cwd)}` : ''}`);
    } catch (e) {
      toastError(e);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-12 shrink-0 items-center gap-1 border-b border-line px-2 py-1.5 pt-[max(6px,var(--safe-top))]">
        {onBack && (
          <IconButton label="All servers" onClick={onBack}>
            <ArrowLeft size={18} />
          </IconButton>
        )}
        <IconButton label="Back" size="sm" disabled={mode !== 'frame' && mode !== 'stream'} onClick={() => nav('back')} className="max-sm:hidden">
          <ArrowLeft size={15} />
        </IconButton>
        <IconButton label="Forward" size="sm" disabled={mode !== 'frame' && mode !== 'stream'} onClick={() => nav('forward')} className="max-sm:hidden">
          <ArrowRight size={15} />
        </IconButton>
        <IconButton label={mode === 'picture' ? 'Take a new picture' : 'Reload'} size="sm" onClick={() => nav('reload')}>
          <RotateCw size={15} />
        </IconButton>
        <form onSubmit={goTo} className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-bg-1 px-2.5 focus-within:border-accent/60">
          <span className="shrink-0 font-mono text-[12px] text-fg-3">:{s.port}</span>
          <input value={field} onChange={(e) => setField(e.target.value)} spellCheck={false} aria-label="Address" className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none" translate="no" />
        </form>
        <Segmented size="sm" value={device} onChange={setDevice} options={DEVICES.map((d) => ({ value: d.value, label: <span title={d.label}>{d.icon}</span> }))} />
        <IconButton ref={menuRef} label="More" size="sm" active={menu} onClick={() => setMenu((m) => !m)}>
          {asking ? <Throbber /> : <Ellipsis size={15} />}
        </IconButton>
        <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={250}>
          {origin && reach === 'yes' && (
            <MenuItem icon={<ExternalLink size={14} />} onClick={openTab}>
              Open in a tab of its own
            </MenuItem>
          )}
          <MenuItem icon={<MessageSquarePlus size={14} />} onClick={ask}>
            Ask an agent about this screen
          </MenuItem>
          <MenuItem icon={<Camera size={14} />} onClick={savePicture}>
            Save a picture of it
          </MenuItem>
          {reach !== 'checking' && (
            <>
              <MenuSep />
              <MenuItem icon={picture ? <Globe size={14} /> : <ImageIcon size={14} />} onClick={() => (setMenu(false), setPicture((p) => !p))}>
                {picture ? 'Show it live' : 'Show it as a picture'}
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
      <div className="relative min-h-0 flex-1">
        <Stage device={device} onFit={setFit}>
          {live ? (
            src ? (
              <iframe ref={frame} key={`${s.port}`} src={src} title={title ?? nameOf(s)} className="block h-full w-full border-0 bg-white dark:bg-[#151412]" allow="clipboard-read; clipboard-write; fullscreen" />
            ) : (
              <div className="flex h-full items-center justify-center text-fg-3">
                <Throbber size={26} />
              </div>
            )
          ) : mode === 'stream' ? (
            stream.key && stream.view ? (
              <>
                <LiveView ref={pageRef} k={stream.key} view={stream.view} driving plain className="h-full w-full" />
                {stream.view.dialog && <DialogCard k={stream.key} view={stream.view} />}
              </>
            ) : stream.error ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[13px] text-fg-3">
                <p translate="no">{stream.error}</p>
                <Button size="sm" variant="secondary" onClick={() => stream.nav('reload')}>
                  Try again
                </Button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-fg-3">
                <Throbber size={26} />
              </div>
            )
          ) : mode === 'checking' ? (
            <div className="flex h-full items-center justify-center text-fg-3">
              <Throbber size={26} />
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <img
                key={shotUrl}
                src={shotUrl}
                alt={`The page at :${s.port}${path}`}
                onLoad={() => setShotState('ok')}
                onError={() => setShotState('failed')}
                className={cx('block w-full', shotState !== 'ok' && 'hidden')}
              />
              {shotState === 'loading' && (
                <div className="flex h-full items-center justify-center gap-2 text-[13px] text-fg-3">
                  <Throbber /> Taking a picture of the page…
                </div>
              )}
              {shotState === 'failed' && <p className="px-6 py-10 text-center text-[13px] text-fg-3">No picture: nothing answers there, or there is no browser on this computer to take one with (Settings → Browser).</p>}
            </div>
          )}
        </Stage>
      </div>
      {mode === 'stream' && mobile && stream.key && <KeyRow live={pageRef} />}
    </div>
  );
}

export function PreviewPage() {
  const search = useSearch();
  const mobile = useIsMobile();
  const [info, setInfo] = useState<Info | null>(null);
  const [reach, setReach] = useState<Reach>('checking');
  const [other, setOther] = useState('');
  const [others, setOthers] = useState(false);
  const selected = Number(new URLSearchParams(search).get('port')) || null;
  const origin = info?.port ? (info.origin ?? `${location.protocol}//${location.hostname}:${info.port}`) : null;

  const load = () =>
    api<Info>('/api/preview')
      .then(setInfo)
      .catch(toastError);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  // Whether this browser reaches the preview port: as it did last time at once, checked again meanwhile. An
  // address it can't reach may never answer (a tunnel's), so the check gives up after three seconds.
  const loaded = !!info;
  useEffect(() => {
    if (!loaded) return;
    if (!origin) {
      setReach('no');
      return;
    }
    const k = `wa.preview.reach:${origin}`;
    const known = localStorage.getItem(k);
    setReach(known === 'yes' || known === 'no' ? known : 'checking');
    let alive = true;
    fetch(`${origin}/__ac/ping`, { mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(3000) })
      .then(
        (r): Reach => (r.ok ? 'yes' : 'no'),
        (): Reach => 'no',
      )
      .then((v) => {
        localStorage.setItem(k, v);
        if (alive) setReach(v);
      });
    return () => {
      alive = false;
    };
  }, [origin, loaded]);

  const pick = (port: number | null) => go(port ? `/preview?port=${port}` : '/preview', !mobile);
  const webs = info?.servers.filter((s) => s.web) ?? [];
  const rest = info?.servers.filter((s) => !s.web) ?? [];
  const current = info?.servers.find((s) => s.port === selected) ?? (selected ? { port: selected, program: 'port', command: '' } : null);
  // On a computer the first web app shows at once.
  useEffect(() => {
    if (!mobile && !selected && webs.length) pick(webs[0].port);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, selected, webs.length]);

  const list = !info ? (
    <div className="flex justify-center py-10 text-fg-3">
      <Throbber size={26} />
    </div>
  ) : !info.port ? (
    <Empty icon={<MonitorSmartphone size={22} />} title="Previews are off">
      The server was started with PREVIEW_PORT=0.
    </Empty>
  ) : (
    <div className="space-y-4 p-2">
      <div>
        <div className="px-2.5 pt-1 pb-1.5 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">Web apps</div>
        {webs.length ? (
          webs.map((s) => <ServerRow key={s.port} s={s} active={s.port === selected} onOpen={() => pick(s.port)} />)
        ) : (
          <p className="px-2.5 text-[12.5px] leading-relaxed text-fg-3">None running. Start one in a terminal (npm run dev, say) or ask an agent to, and it shows here.</p>
        )}
      </div>
      {rest.length > 0 && (
        <div>
          <button type="button" onClick={() => setOthers((o) => !o)} className="flex w-full items-center gap-1 px-2.5 py-1 text-left text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">
            {others ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Other servers · {rest.length}
          </button>
          {others && rest.map((s) => <ServerRow key={s.port} s={s} active={s.port === selected} onOpen={() => pick(s.port)} />)}
        </div>
      )}
      <form
        className="flex items-center gap-2 px-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          const p = Number(other);
          if (Number.isInteger(p) && p > 0 && p < 65536) {
            setOther('');
            pick(p);
          }
        }}
      >
        <input value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Another port" className={cx(inputCls, 'h-8 min-w-0 flex-1 text-[13px]')} />
        <Button size="sm" variant="ghost" type="submit" disabled={!other}>
          Open
        </Button>
      </form>
    </div>
  );

  if (mobile && current)
    return (
      <div className="h-full min-h-0">
        <Viewer key={current.port} s={current} origin={origin} reach={reach} onBack={() => go('/preview')} />
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SystemHeader
        tab="preview"
        actions={
          <IconButton label="Refresh" onClick={load}>
            <RefreshIcon size={15} />
          </IconButton>
        }
      />
      {mobile ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-[300px] shrink-0 overflow-y-auto border-r border-line bg-bg-1">{list}</div>
          <div className="min-w-0 flex-1">
            {current ? (
              <Viewer key={current.port} s={current} origin={origin} reach={reach} />
            ) : (
              <Empty icon={<MonitorSmartphone size={22} />} title="Nothing to show yet">
                Start a web app’s dev server (npm run dev, say) or ask an agent to, then pick it on the left.
              </Empty>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
