// The page editor's Comments tab: the comments on the page's blocks, kept with the page outside its HTML
// (shared/page-comments.ts), in the order of their blocks on the page, each with its replies, Reply, Resolve and its menu
// (Edit, Delete); a new one written at the top, on the block (and words) picked; the resolved ones under a switch. A
// comment picked here outlines its block in the page; a mark beside a block in the page picks its comment here. Agents
// read them with get_page and answer or resolve them with save_page.
import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { PageComment } from '@shared/page-comments';
import { cx, IconButton } from '../../../components/ui';
import { CommentBox, CommentThread } from '../common/Comments';

/** Comments in the order of their blocks on the page (by where the blocks are), those on no block last. */
const byPlace = (a: PageComment, b: PageComment) => {
  const p = a.on?.path ?? [];
  const q = b.on?.path ?? [];
  if (!p.length || !q.length) return q.length - p.length || a.at - b.at;
  for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i] !== q[i]) return p[i] - q[i];
  return p.length - q.length || a.at - b.at;
};

export function PageComments({
  comments,
  active,
  draft,
  readOnly,
  onAdd,
  onDraftDone,
  onDraftCancel,
  onPick,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  className,
}: {
  comments: PageComment[];
  active: string | null;
  /** A new comment being written: the words it is on. */
  draft: { quote: string } | null;
  readOnly?: boolean;
  /** A new comment on the block picked in the page. */
  onAdd: () => void;
  onDraftDone: (text: string) => void;
  onDraftCancel: () => void;
  onPick: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}) {
  const [resolved, setResolved] = useState(false);
  const list = [...comments].sort(byPlace);
  const open = list.filter((c) => !c.resolved);
  const done = list.filter((c) => c.resolved);
  const box = useRef<HTMLDivElement>(null);
  // The comment picked in the page comes into sight here.
  useEffect(() => {
    if (active) box.current?.querySelector(`[data-comment="${CSS.escape(active)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const thread = (c: PageComment) => (
    <div key={c.id} data-comment={c.id}>
      <CommentThread comment={c} active={c.id === active} readOnly={readOnly} onFocus={() => onPick(c.id)} onReply={(t) => onReply(c.id, t)} onResolve={(r) => onResolve(c.id, r)} onEdit={(t) => onEdit(c.id, t)} onDelete={() => onDelete(c.id)} />
    </div>
  );
  return (
    <div ref={box} className={cx('flex min-h-0 flex-col', className)}>
      <div className="flex h-9 shrink-0 items-center gap-1 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-2">{open.length ? `${open.length} open comment${open.length === 1 ? '' : 's'}` : 'Comments'}</span>
        {!readOnly && (
          <IconButton label="Comment on the block picked (Ctrl+Alt+M)" size="sm" onClick={onAdd}>
            <MessageSquarePlus size={15} />
          </IconButton>
        )}
      </div>
      <div className="space-y-2 px-2 pb-3">
        {draft && (
          <div className="rounded-xl border border-accent/60 bg-elevated p-2.5">
            {draft.quote && (
              <div translate="no" className="mb-1.5 line-clamp-2 border-l-2 border-accent/50 pl-2 text-[12px] text-fg-3">
                {draft.quote}
              </div>
            )}
            <CommentBox autoFocus onSubmit={onDraftDone} onCancel={onDraftCancel} />
          </div>
        )}
        {open.map(thread)}
        {!open.length && !draft && (
          <p className="px-1 py-2 text-[12.5px] leading-relaxed text-fg-3">
            {readOnly ? 'No comments on this page.' : 'No comments yet. Pick a block (or words in it), then Comment in its ⋮⋮ menu or on the bar over the words (Ctrl+Alt+M): an agent asked about the page reads them and can answer.'}
          </p>
        )}
        {done.length > 0 && (
          <button type="button" onClick={() => setResolved((r) => !r)} className="block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
            {resolved ? 'Hide the resolved ones' : `${done.length} resolved`}
          </button>
        )}
        {resolved && done.map(thread)}
      </div>
    </div>
  );
}
