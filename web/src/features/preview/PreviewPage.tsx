// Preview: the web apps running on this machine (a dev server: Vite, Next, a Python server…), each with its
// page's title and project, to look at inside the app at a computer's, tablet's or phone's size, with an
// address bar, back, forward and reload. Where this browser can't reach the preview port (the app behind a
// tunnel with one hostname), the app shows pictures of the screen taken here instead. A screen can open in a
// tab of its own, be saved as a picture, or go to an agent with a question.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { ArrowLeft, ArrowRight, Camera, ChevronDown, ChevronRight, Ellipsis, ExternalLink, Globe, Image as ImageIcon, MessageSquarePlus, Monitor, MonitorSmartphone, RotateCw, Server, Smartphone, Tablet } from 'lucide-react';
import { api, post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { startSessionWith } from '../../lib/startFiles';
import { tr } from '../../i18n/runtime';
import { toastError, useApp } from '../../lib/store';
import { Button, cx, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Segmented, Throbber, useIsMobile } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { RefreshIcon } from '../../components/RefreshIcon';

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

const nameOf = (s: DevServer) => s.project ?? s.title ?? s.program;
const pathOf = (href: string) => {
  try {
    const u = new URL(href);
    return u.pathname + u.search + u.hash;
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

/** The frame (or the picture) at a device's width, scaled down to fit. */
function Stage({ device, children }: { device: Device; children: ReactNode }) {
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
  if (!want)
    return (
      <div ref={box} className="relative h-full w-full bg-white dark:bg-[#151412]">
        {children}
      </div>
    );
  const scale = size.w ? Math.min(1, (size.w - 32) / want) : 1;
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

/** One web app: live inside the app when the preview port is reachable, else as pictures taken here. */
function Viewer({ s, origin, reach, onBack }: { s: DevServer; origin: string | null; reach: 'checking' | 'yes' | 'no'; onBack?: () => void }) {
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
  const menuRef = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const live = reach === 'yes' && !!origin && !picture;
  useEffect(() => localStorage.setItem('wa.preview.device', device), [device]);

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
    const p = field.trim().startsWith('/') ? field.trim() : `/${field.trim()}`;
    setPath(p);
    setField(p);
    if (live && origin) setSrc(`${origin}${p}`);
    else setShotN((n) => n + 1);
  };
  const nav = (to: 'back' | 'forward' | 'reload') => {
    if (!live) return setShotN((n) => n + 1);
    const w = frame.current?.contentWindow;
    if (w && origin) w.postMessage({ type: 'naget-preview-go', go: to }, new URL(origin).origin);
    // A page without the helper (another site's, a file) still reloads.
    if (to === 'reload' && src) setSrc(src.includes('/__ac/open') ? `${origin}${path}` : src);
  };
  const shotUrl = `/api/preview/shot?port=${s.port}&path=${encodeURIComponent(path)}&device=${device}&n=${shotN}`;
  useEffect(() => setShotState('loading'), [shotUrl]);

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
      const r = await fetch(shotUrl, { credentials: 'same-origin' });
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
      const r = await post<{ path: string; size: number }>('/api/preview/shot', { port: s.port, path, device });
      const where = `localhost:${s.port}${path}`;
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
        <IconButton label="Back" size="sm" disabled={!live} onClick={() => nav('back')} className="max-sm:hidden">
          <ArrowLeft size={15} />
        </IconButton>
        <IconButton label="Forward" size="sm" disabled={!live} onClick={() => nav('forward')} className="max-sm:hidden">
          <ArrowRight size={15} />
        </IconButton>
        <IconButton label={live ? 'Reload' : 'Take a new picture'} size="sm" onClick={() => nav('reload')}>
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
          {reach === 'yes' && origin && (
            <>
              <MenuSep />
              <MenuItem icon={picture ? <Globe size={14} /> : <ImageIcon size={14} />} onClick={() => (setMenu(false), setPicture((p) => !p))}>
                {picture ? 'Show it live' : 'Show it as a picture'}
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
      {!live && reach === 'no' && <FarAway />}
      <div className="relative min-h-0 flex-1">
        <Stage device={device}>
          {live ? (
            src ? (
              <iframe ref={frame} key={`${s.port}`} src={src} title={title ?? nameOf(s)} className="block h-full w-full border-0 bg-white dark:bg-[#151412]" allow="clipboard-read; clipboard-write; fullscreen" />
            ) : (
              <div className="flex h-full items-center justify-center text-fg-3">
                <Throbber size={26} />
              </div>
            )
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
    </div>
  );
}

/** Why pictures show instead of the page itself, and how to see it live. */
function FarAway() {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 border-b border-line bg-bg-1 px-3 py-2 text-[12.5px] leading-relaxed">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 text-left text-fg-2">
        <ImageIcon size={14} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1">You see pictures of the page taken on this computer: this browser can’t reach the preview port.</span>
        {open ? <ChevronDown size={14} className="shrink-0 text-fg-3" /> : <ChevronRight size={14} className="shrink-0 text-fg-3" />}
      </button>
      {open && (
        <p className="mt-1.5 pl-5 text-fg-3">
          To use it live here: on the same network, or over a VPN such as Tailscale, open the app at this computer’s own address. Behind a tunnel or a proxy, give the preview port a hostname of its own
          (for example preview.example.com → localhost:8791) and start the app with PREVIEW_ORIGIN set to it.
        </p>
      )}
    </div>
  );
}

export function PreviewPage() {
  const search = useSearch();
  const mobile = useIsMobile();
  const [info, setInfo] = useState<Info | null>(null);
  const [reach, setReach] = useState<'checking' | 'yes' | 'no'>('checking');
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
  useEffect(() => {
    if (!origin) return;
    setReach('checking');
    fetch(`${origin}/__ac/ping`, { mode: 'cors', cache: 'no-store' })
      .then((r) => setReach(r.ok ? 'yes' : 'no'))
      .catch(() => setReach('no'));
  }, [origin]);

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
      <PageHeader
        title="Preview"
        tip="preview"
        sub="The web apps running on this computer, to look at from any device"
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
