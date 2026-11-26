import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { ExternalLink, PanelRight, X } from 'lucide-react';
import type { WebAppDetail } from '@shared/webapps';
import type { SessionSummary, ToolItem } from '@shared/types';
import { enc, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError, useTimeline, useUI } from '../../lib/store';
import { cx, IconButton, Throbber, useMediaQuery } from '../../components/ui';
import { closeCanvas, Grip } from '../pages/Canvas';
import { CANVAS_MEDIA, useCanvas } from '../pages/state';
import { busy, useLoaded, webAppPath } from './api';
import { Preview } from './Preview';
import { SideTry } from './simple/SideTry';
import { shortState } from './simple/plain';
import { useBeingMade } from './simple/sessions';
import { latestWebApp, webAppOf, webSideTarget } from './side.ts';
import { keysCardOf } from '@shared/keys';
import { KeysCard } from '../connections/KeysCard';
import { StatusLabel } from './StatusLabel';
import { statusOf } from './status';

/** Wide enough for the app beside the conversation (as for pages). */
const WIDE = CANVAS_MEDIA;

/** What a person closed, by session: the call whose app they closed (kept on this device), so a reload does not open it again. */
const CLOSED_KEY = 'wa.webside.closed.v1';
const readClosed = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
};

export const useWebSide = create<{ open: Record<string, string>; closed: Record<string, string>; show: (key: string, app: string) => void; close: (key: string) => void }>((set, get) => ({
  open: {},
  closed: readClosed(),
  show: (key, app) => set((s) => ({ open: { ...s.open, [key]: app } })),
  close: (key) => {
    const latest = latestWebApp(useTimeline.getState().byKey[key]?.items);
    const closed = latest ? { ...get().closed, [key]: latest.item } : get().closed;
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify(Object.fromEntries(Object.entries(closed).slice(-200))));
    } catch {}
    set((s) => ({ closed, open: Object.fromEntries(Object.entries(s.open).filter(([k]) => k !== key)) }));
  },
}));

/** The app that is beside this session's conversation now (from the page's own opening, else the conversation's record), or null. */
export function useWebSideApp(key: string): string | null {
  const explicit = useWebSide((x) => x.open[key]);
  const closed = useWebSide((x) => x.closed[key]);
  const items = useTimeline((s) => s.byKey[key]?.items);
  const latest = useMemo(() => latestWebApp(items), [items]);
  return webSideTarget(explicit, latest, closed);
}

export function useWebSideOpen(key: string): boolean {
  const app = useWebSideApp(key);
  const wide = useMediaQuery(WIDE);
  return !!app && wide;
}
export const closeWebSide = (key: string) => useWebSide.getState().close(key);

/** Opens the app beside a session's conversation where there is room, else its own page. */
export function openWebSide(key: string, app: string) {
  if (!matchMedia(WIDE).matches) return go(webAppPath(app, 'preview'));
  closeCanvas(key);
  useWebSide.getState().show(key, app);
}


/** A call of the web app tools leaves this in the conversation: the app it was about, and a way to open it beside. */
export function WebAppRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const out = t.output ?? '';
  const running = t.status === 'running' || t.status === 'pending';
  const id = webAppOf(out);
  if (running || !id) return null;
  // A call that puts up a keys card brings it here.
  const keys = keysCardOf(out);
  const row = (
    <div className="my-1 flex items-center gap-2 text-[12.5px] text-fg-3">
      <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-bg-2 hover:text-fg" onClick={() => openWebSide(sessionKey, id)}>
        <PanelRight size={13} />
        Open the app beside
      </button>
    </div>
  );
  return keys ? (
    <>
      {row}
      <KeysCard key={keys} id={keys} />
    </>
  ) : (
    row
  );
}

/** The app beside the conversation: its Preview, with where it stands in a line above. */
export function WebSide({ s }: { s: SessionSummary }) {
  const id = useWebSideApp(s.key);
  const technical = useUI((x) => x.technicalDetails);
  const width = useCanvas((x) => x.width);
  const app = useLoaded<{ app: WebAppDetail }>(id ? `/api/webapps/${enc(id)}` : null);
  const going = !!app.data && busy(app.data.app);
  const making = useBeingMade(app.data?.app);
  // While it builds or starts, ask again until it is not.
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => void app.reload(), 2000);
    return () => clearInterval(t);
  }, [going, app]);
  if (!id) return null;
  const a = app.data?.app;
  return (
    <aside style={{ width: `${width * 100}%` }} className="relative flex min-h-0 shrink-0 flex-col border-l border-line bg-bg">
      <Grip />
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
        <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
          {a?.name ?? ''}
        </span>
        {a && <StatusLabel s={technical ? statusOf(a) : shortState(a, making)} />}
        <IconButton label="Open its page" size="sm" onClick={() => go(webAppPath(id))}>
          <ExternalLink size={14} />
        </IconButton>
        <IconButton label="Close" size="sm" onClick={() => closeWebSide(s.key)}>
          <X size={15} />
        </IconButton>
      </div>
      <div className={cx('min-h-0 flex-1')}>
        {a && !technical ? (
          <SideTry key={a.id} app={a} session={s.key} onBuild={() => void post(`/api/webapps/${enc(a.id)}/build`).then(() => app.reload(), toastError)} />
        ) : a ? (
          <Preview app={a} session={s.key} onBuild={() => void post(`/api/webapps/${enc(a.id)}/build`).then(() => app.reload(), toastError)} />
        ) : (
          <div className="grid h-full place-items-center text-fg-3">
            <Throbber size={24} />
          </div>
        )}
      </div>
    </aside>
  );
}

export { latestWebApp, webAppOf, webSideTarget };
