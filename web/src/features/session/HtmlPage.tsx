// A page an agent showed with show_html (the app's own MCP tool): rendered in the conversation in a
// sandboxed frame of its own origin, fitted to its height, with a full-screen view.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Expand, FileCode2, X } from 'lucide-react';
import type { ToolItem } from '@shared/types';
import { Throbber, IconButton } from '../../components/ui';

// The server was called agent-console in older sessions.
export const isPageTool = (name: string) => /^mcp__(naget-agent|agent-console)__show_html$/.test(name);

function PageFrame({ html, onHeight }: { html: string; onHeight?: (h: number) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      if (e.data?.type === 'wa-html-ready') ref.current?.contentWindow?.postMessage({ type: 'wa-html-page', html }, '*');
      else if (e.data?.type === 'wa-html-size' && typeof e.data.h === 'number') onHeight?.(e.data.h);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [html, onHeight]);
  return (
    <iframe
      ref={ref}
      src="/htmlframe"
      title="Page"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
      className="block h-full w-full border-0 bg-white"
    />
  );
}

export function HtmlPage({ item }: { item: ToolItem }) {
  const input = (item.tool.input ?? {}) as { html?: string; title?: string };
  const html = typeof input.html === 'string' ? input.html : '';
  const title = input.title?.trim() || 'Page';
  const [height, setHeight] = useState(0);
  const [full, setFull] = useState(false);
  const running = item.tool.status === 'running' || item.tool.status === 'pending';
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [full]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'page'}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="tl-item my-1 overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <FileCode2 size={14} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">{title}</span>
        {html && (
          <>
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
          <PageFrame html={html} onHeight={setHeight} />
          {height > 900 && (
            <button onClick={() => setFull(true)} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent pt-8 pb-2 text-[12.5px] font-medium text-white">
              See the whole page
            </button>
          )}
        </div>
      )}
      {full &&
        createPortal(
          <div className="anim-overlay scrim fixed inset-0 z-50 flex flex-col p-0 sm:p-6 [--scrim:0.6]" onPointerDown={(e) => e.target === e.currentTarget && setFull(false)}>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel sm:rounded-2xl">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2 pt-[max(8px,var(--safe-top))]">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{title}</span>
                <IconButton label="Close" size="sm" onClick={() => setFull(false)}>
                  <X size={16} />
                </IconButton>
              </div>
              <div className="min-h-0 flex-1">
                <PageFrame html={html} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
