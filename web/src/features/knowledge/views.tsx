// How knowledge_search shows in a conversation: one line among the agent's steps (what it looked for in your
// documents, how many passages it found), opening to the passages with their sources, each a click away.
import { useState } from 'react';
import { ChevronRight, FileText, Library } from 'lucide-react';
import type { ToolInfo, ToolItem } from '@shared/types';
import { parseKnowledge } from '@shared/knowledge';
import { openFile } from '../../lib/nav';
import { cx } from '../../components/ui';

const arg = (t: ToolInfo, k: string) => {
  const v = (t.input as Record<string, unknown> | undefined)?.[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};
export const running = (t: ToolInfo) => t.status === 'running' || t.status === 'pending';

export function KnowledgeRow({ item }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const [open, setOpen] = useState(false);
  const hits = parseKnowledge(t.output ?? '');
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}>
        <Library size={14} className="shrink-0 text-fg-3" />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]">
          <span className={cx('shrink-0', running(t) ? 'text-fg' : 'text-fg-3')}>{running(t) ? 'Searching your documents' : 'Searched your documents'}</span>
          <span className={cx('min-w-0 truncate', running(t) ? 'shine' : 'text-fg-2')}>{arg(t, 'query')}</span>
        </span>
        {!running(t) && <span className="shrink-0 text-[11.5px] text-fg-3">{hits.length ? `${hits.length} passage${hits.length === 1 ? '' : 's'}` : 'nothing found'}</span>}
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-6 space-y-1.5">
          {hits.length ? (
            hits.map((h) => (
              <button key={h.ref} onClick={() => openFile(h.path)} className="block w-full rounded-lg border border-line px-3 py-2 text-left transition-colors hover:bg-bg-2">
                <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium">
                  <FileText size={13} className="shrink-0 text-fg-3" />
                  <span className="min-w-0 truncate">{h.cite}</span>
                  <span className="shrink-0 font-normal text-fg-3">· {h.base}</span>
                </div>
                <div className="mt-1 line-clamp-3 text-[12.5px] text-fg-2">{h.text.replace(/^#+\s.*\n+/, '')}</div>
              </button>
            ))
          ) : (
            <div className="px-1 text-[12.5px] text-fg-3">{t.output?.split('\n')[0] || 'Nothing found.'}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** The step's line when folded with the others: a search, in the user's documents. */
export const knowledgeStep = (t: ToolInfo) => ({ category: 'search' as const, verb: running(t) ? 'Searching your documents' : 'Searched your documents', title: arg(t, 'query') });
