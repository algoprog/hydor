// A page an agent showed with show_html (the app's own MCP tool): rendered in the conversation in a
// sandboxed frame of its own origin, fitted to its height, with a full-screen view. Its choices go to
// the message box (never sent by themselves); Keep puts it in Pages, with what it stored meanwhile.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkCheck, BookmarkPlus, Download, Expand, FileCode2 } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import type { ToolItem } from '@shared/types';
import { post } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Throbber, IconButton, cx } from '../../components/ui';
import { memoryStore, pageStore, PageFrame, type Pick } from '../pages/frame';
import { PageOverlay } from '../pages/overlay';
import { usePagesStore } from '../pages/state';

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

export function HtmlPage({ item, sessionKey }: { item: ToolItem; sessionKey?: string }) {
  const input = (item.tool.input ?? {}) as { html?: string; title?: string };
  const html = typeof input.html === 'string' ? input.html : '';
  const title = input.title?.trim() || 'Page';
  const [height, setHeight] = useState(0);
  const [full, setFull] = useState(false);
  const running = item.tool.status === 'running' || item.tool.status === 'pending';
  // Kept in Pages: the page then keeps its data there; until then, while it is on screen.
  const keptMap = usePagesStore((s) => (sessionKey ? s.kept[sessionKey] : undefined));
  const kept = keptMap?.[item.id];
  const memory = useMemo(() => memoryStore(), []);
  const store = useMemo(() => (kept ? pageStore(kept) : memory), [kept, memory]);
  const [keeping, setKeeping] = useState(false);
  const onPick = usePicks(sessionKey, full);
  useEffect(() => {
    if (sessionKey && !keptMap) usePagesStore.getState().loadKept(sessionKey).catch(() => {});
  }, [sessionKey, !keptMap]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
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
      toast('Kept in Pages', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setKeeping(false);
    }
  };
  // The frame starts over when the page's storage moves to Pages.
  const frameKey = kept ?? 'memory';
  return (
    <div className="tl-item my-1 overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <FileCode2 size={14} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">{title}</span>
        {html && (
          <>
            {sessionKey && (
              <button
                type="button"
                onClick={keep}
                disabled={keeping}
                title={kept ? 'Open it in Pages' : 'Keep this page in Pages, with its own address and storage'}
                className={cx(
                  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium transition-colors disabled:opacity-50',
                  kept ? 'text-accent hover:bg-accent-soft' : 'text-fg-3 hover:bg-bg-2 hover:text-fg',
                )}
              >
                {kept ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
                {kept ? 'Kept' : 'Keep'}
              </button>
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
      {!html ? (
        <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-fg-3">{running ? <Throbber /> : 'The page was too big to keep here.'}</div>
      ) : (
        <div style={{ height: Math.min(Math.max(height, 60), 900) }} className="relative transition-[height] duration-200">
          {!full && <PageFrame key={frameKey} html={html} title={title} store={store} onHeight={setHeight} onPick={onPick} />}
          {height > 900 && !full && (
            <button onClick={() => setFull(true)} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent pt-8 pb-2 text-[12.5px] font-medium text-white">
              See the whole page
            </button>
          )}
        </div>
      )}
      {full && (
        <PageOverlay title={title} onClose={() => setFull(false)}>
          <PageFrame key={frameKey} html={html} title={title} store={store} onPick={onPick} />
        </PageOverlay>
      )}
    </div>
  );
}
