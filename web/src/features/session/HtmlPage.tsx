// A page an agent showed with show_html (the app's own MCP tool). While the agent writes it, it grows in
// place as it comes; done, it runs in a sandboxed frame of its own origin, fitted to its height, with a
// full-screen view. Its choices go to the message box (never sent by themselves); Keep puts it in Pages,
// with what it stored meanwhile; Edit opens it to change (beside the conversation on a wide screen). While
// pages show beside the conversation, the card here stays small.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppWindow, BookmarkCheck, BookmarkPlus, Download, Expand, PanelRight, PenLine } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import type { ToolItem } from '@shared/types';
import { api, post } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Throbber, IconButton, cx, useMediaQuery } from '../../components/ui';
import { openOver, shownStore, showBeside } from '../pages/Canvas';
import { pageFile, pageStore, PageFrame, StreamFrame, type Pick } from '../pages/frame';
import { PageOverlay } from '../pages/overlay';
import { CANVAS_MEDIA, onScreen, useCanvas, useDrafts, usePagesStore, type CanvasTarget } from '../pages/state';

// The server was called agent-console in older sessions.
export const isPageTool = (name: string) => /^mcp__(naget-agent|agent-console)__show_html$/.test(name);

/**
 * Choices go to the message box; a later pick in the same group takes the earlier one's place. While
 * the page is full screen they wait, and go in when it closes (the box is under it).
 */
export function usePicks(sessionKey: string | undefined, holding: boolean) {
  const last = useRef(new Map<string, string>());
  const held = useRef(new Map<string, string>());
  const put = (group: string, text: string) => {
    const prev = last.current.get(group);
    if (!text && !prev) return;
    composeInsert(text, sessionKey, prev);
    last.current.set(group, text);
  };
  useEffect(() => {
    if (holding) return;
    for (const [g, t] of held.current) put(g, t);
    held.current.clear();
  }, [holding]);
  if (!sessionKey) return undefined;
  return (p: Pick) => (holding ? held.current.set(p.group, p.text) : put(p.group, p.text));
}

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`);

/** A page call that just came in (Codex and other agents hand over whole calls) opens beside, as a streamed one does. */
export function useOpensBeside(sessionKey: string | undefined, item: ToolItem) {
  useEffect(() => {
    if (!sessionKey || !item.ts || Date.now() - item.ts > 20_000) return;
    const c = useCanvas.getState();
    if (!c.auto || c.open[sessionKey] || !matchMedia(CANVAS_MEDIA).matches || !onScreen(sessionKey)) return;
    if (useDrafts.getState().byKey[sessionKey]?.[item.id]) return;
    c.show(sessionKey, { kind: 'item', id: item.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Opens a page to change: beside the conversation when there is room, else over everything. */
export function editPage(sessionKey: string, t: CanvasTarget) {
  const target = { ...t, edit: true };
  if (!showBeside(sessionKey, target)) openOver(sessionKey, target);
}

/** The card a page leaves in the conversation while pages show beside it. */
export function SmallPageCard({ sessionKey, item, title, sub, writing, icon }: { sessionKey: string; item: ToolItem; title: string; sub: string; writing?: boolean; icon?: ReactNode }) {
  const here = useCanvas((x) => {
    const t = x.open[sessionKey];
    return t?.kind === 'item' && t.id === item.id;
  });
  return (
    <button
      type="button"
      onClick={() => useCanvas.getState().show(sessionKey, { kind: 'item', id: item.id })}
      className={cx(
        'tl-item my-1 flex w-full items-center gap-3 rounded-xl border bg-panel py-2 pr-3 pl-2.5 text-left transition-colors',
        here ? 'border-accent/50 shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line hover:border-line-2',
      )}
    >
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', writing ? 'bg-busy/12 text-busy' : 'bg-accent-soft text-accent')}>{icon ?? <AppWindow size={17} strokeWidth={1.8} />}</span>
      <span className="min-w-0 flex-1">
        <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
          {title}
        </span>
        <span className="flex items-center gap-1.5 truncate text-[12px] leading-4 text-fg-3">
          {writing && <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />}
          {sub}
        </span>
      </span>
      <span className={cx('flex shrink-0 items-center gap-1 text-[12px] font-medium', here ? 'text-accent' : 'text-fg-3')}>
        <PanelRight size={14} />
        {here ? 'Beside' : 'Open'}
      </span>
    </button>
  );
}

export function HtmlPage({ item, sessionKey }: { item: ToolItem; sessionKey?: string }) {
  const input = (item.tool.input ?? {}) as { html?: string; title?: string };
  const draft = useDrafts((x) => (sessionKey ? x.byKey[sessionKey]?.[item.id] : undefined));
  const html = typeof input.html === 'string' ? input.html : draft?.done ? draft.text : '';
  const title = input.title?.trim() || draft?.title?.trim() || 'Page';
  const [height, setHeight] = useState(0);
  const [full, setFull] = useState(false);
  const running = item.tool.status === 'running' || item.tool.status === 'pending';
  const writing = !html && (running || (!!draft && !draft.done));
  // Kept in Pages: the page then keeps its data there, and shows its latest version; until then, its data lasts while the app is open.
  const keptMap = usePagesStore((s) => (sessionKey ? s.kept[sessionKey] : undefined));
  const kept = keptMap?.[item.id];
  const keptInfo = usePagesStore((s) => (kept ? s.pages?.find((p) => p.id === kept) : undefined));
  const memory = useMemo(() => shownStore(item.id), [item.id]);
  const store = useMemo(() => (kept ? pageStore(kept) : memory), [kept, memory]);
  const [keeping, setKeeping] = useState(false);
  const onPick = usePicks(sessionKey, full);
  const wide = useMediaQuery(CANVAS_MEDIA);
  const besideOpen = useCanvas((x) => (sessionKey ? !!x.open[sessionKey] : false));
  useOpensBeside(sessionKey, item);
  useEffect(() => {
    if (sessionKey && !keptMap) usePagesStore.getState().loadKept(sessionKey).catch(() => {});
  }, [sessionKey, !keptMap]);
  useEffect(() => {
    if (kept && !usePagesStore.getState().pages) usePagesStore.getState().loadPages().catch(() => {});
  }, [kept]);

  if (sessionKey && wide && besideOpen) {
    const sub = writing ? `Writing the page · ${kb(draft?.text.length ?? 0)}` : kept ? `Kept in the Library${keptInfo && keptInfo.version > 1 ? ` · version ${keptInfo.version}` : ''}` : `A page · ${kb(html.length)}`;
    return <SmallPageCard sessionKey={sessionKey} item={item} title={title} sub={sub} writing={writing} />;
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([pageFile(html)], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'page'}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const keep = async () => {
    if (!sessionKey) return;
    if (kept) return go(`/pages/${kept}`);
    setKeeping(true);
    try {
      const r = await post<{ page: PageInfo }>('/api/pages', { title, html, sessionKey, item: item.id, data: memory.dump() });
      usePagesStore.getState().setKept(sessionKey, item.id, r.page.id);
      toast('Kept in the Library', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setKeeping(false);
    }
  };
  // A kept page that was changed since shows as it is now; the frame starts over when its storage moves to Pages.
  const changed = !!keptInfo && keptInfo.version > 1;
  const frameKey = `${kept ?? 'memory'}:${changed ? keptInfo!.version : 0}`;
  return (
    <div data-tip={html && !writing && sessionKey ? 'page' : undefined} className="tl-item my-1 overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        {writing ? <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" /> : <AppWindow size={14} className="shrink-0 text-fg-3" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">
          <span translate="no">{title}</span>
          {writing && <span className="ml-2 font-normal text-fg-3">Writing · {kb(draft?.text.length ?? 0)}</span>}
        </span>
        {html && (
          <>
            {sessionKey && (
              <button
                type="button"
                onClick={keep}
                disabled={keeping}
                title={kept ? 'Open it in the Library' : 'Keep this page in the Library, with its own address and storage'}
                className={cx(
                  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium transition-colors disabled:opacity-50',
                  kept ? 'text-accent hover:bg-accent-soft' : 'text-fg-3 hover:bg-bg-2 hover:text-fg',
                )}
              >
                {kept ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
                {kept ? 'Kept' : 'Keep'}
              </button>
            )}
            {sessionKey && (
              <IconButton label="Edit" size="sm" onClick={() => editPage(sessionKey, { kind: 'item', id: item.id })}>
                <PenLine size={14} />
              </IconButton>
            )}
            <IconButton label="Save as a file" size="sm" onClick={download}>
              <Download size={14} />
            </IconButton>
            <IconButton label="Full screen" size="sm" onClick={() => setFull(true)}>
              <Expand size={14} />
            </IconButton>
          </>
        )}
      </div>
      {writing ? (
        draft?.text ? (
          <div style={{ height: Math.min(Math.max(height, 120), 560) }} className="relative">
            <StreamFrame html={draft.text} title={title} onHeight={setHeight} />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-fg-3">
            <Throbber /> Writing the page…
          </div>
        )
      ) : !html ? (
        <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-fg-3">The page was too big to keep here.</div>
      ) : (
        <div style={{ height: Math.min(Math.max(height, 60), 900) }} className="relative transition-[height] duration-200">
          {!full && <KeptOrShown key={frameKey} kept={changed ? kept : undefined} html={html} title={title} store={store} onHeight={setHeight} onPick={onPick} />}
          {height > 900 && !full && (
            // The page fades into the card under the button, so its words never run behind the button's.
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-panel via-panel/85 to-transparent pt-14 pb-3">
              <button
                onClick={() => setFull(true)}
                className="pointer-events-auto rounded-full border border-line-2 bg-bg-1 px-3.5 py-1.5 text-[12.5px] font-medium text-fg shadow-sm transition-colors hover:bg-bg-2"
              >
                See the whole page
              </button>
            </div>
          )}
        </div>
      )}
      {full && (
        <PageOverlay title={title} onClose={() => setFull(false)}>
          <KeptOrShown key={frameKey} kept={changed ? kept : undefined} html={html} title={title} store={store} onPick={onPick} />
        </PageOverlay>
      )}
    </div>
  );
}

/** The page as the agent showed it, or as it is now in Pages when it was changed since. */
function KeptOrShown({ kept, html, title, store, onHeight, onPick }: { kept?: string; html: string; title: string; store: ReturnType<typeof pageStore>; onHeight?: (h: number) => void; onPick?: (p: Pick) => void }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    if (!kept) return;
    let alive = true;
    api<{ html: string }>(`/api/pages/${encodeURIComponent(kept)}`)
      .then((r) => alive && setNow(r.html))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kept]);
  if (kept && now === null) return null;
  return <PageFrame html={now ?? html} title={title} store={store} onHeight={onHeight} onPick={onPick} />;
}
