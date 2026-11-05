// The LaTeX editor's comments, beside the source (in a sheet on a phone): those on the file in view, in the order
// their words come, each with its replies, Reply, Resolve and its menu (Edit, Delete); a new one written at the top,
// on the words picked; the other files' comments a click away, and the resolved ones under a switch. Agents read the
// comments with get_page and answer or resolve them when they save the document.
import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { TexComment } from '@shared/latex';
import { cx, IconButton } from '../../../components/ui';
import { CommentBox, CommentThread } from '../common/Comments';

export interface CommentDraft {
  file: string;
  from: number;
  to: number;
  quote: string;
}

export function CommentsPanel({
  comments,
  file,
  label,
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
  onOpenFile,
  className,
}: {
  comments: TexComment[];
  /** The file in view. */
  file: string;
  /** A file's name as the tabs show it. */
  label: (name: string) => string;
  active: string | null;
  draft: CommentDraft | null;
  readOnly?: boolean;
  /** A new comment, on the words picked. */
  onAdd: () => void;
  onDraftDone: (text: string) => void;
  onDraftCancel: () => void;
  /** A comment picked: its words picked in the source. */
  onPick: (c: TexComment) => void;
  onReply: (id: string, text: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onOpenFile: (name: string) => void;
  className?: string;
}) {
  const [resolved, setResolved] = useState(false);
  const here = comments.filter((c) => c.file === file).sort((a, b) => a.from - b.from);
  const open = here.filter((c) => !c.resolved);
  const done = here.filter((c) => c.resolved);
  const elsewhere = new Map<string, number>();
  for (const c of comments) if (c.file !== file && !c.resolved) elsewhere.set(c.file, (elsewhere.get(c.file) ?? 0) + 1);
  const thread = (c: TexComment) => (
    <CommentThread
      key={c.id}
      comment={c}
      active={c.id === active}
      readOnly={readOnly}
      onFocus={() => onPick(c)}
      onReply={(t) => onReply(c.id, t)}
      onResolve={(r) => onResolve(c.id, r)}
      onEdit={(t) => onEdit(c.id, t)}
      onDelete={() => onDelete(c.id)}
    />
  );
  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-2">{open.length ? `${open.length} comment${open.length === 1 ? '' : 's'}` : 'Comments'}</span>
        {!readOnly && (
          <IconButton label="Add a comment (Ctrl+Alt+M)" size="sm" onClick={onAdd}>
            <MessageSquarePlus size={15} />
          </IconButton>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2">
        {draft && draft.file === file && (
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
          <p className="px-1 py-3 text-[12.5px] leading-relaxed text-fg-3">
            {readOnly ? 'No comments in this file.' : 'No comments in this file. Pick words in the source, then Add a comment (Ctrl+Alt+M): an agent asked about the document reads them and can answer.'}
          </p>
        )}
        {elsewhere.size > 0 && (
          <div className="space-y-1 pt-1">
            {[...elsewhere].map(([name, n]) => (
              <button key={name} type="button" onClick={() => onOpenFile(name)} className="block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg">
                {`${n} in `}
                <span translate="no" className="font-mono">
                  {label(name)}
                </span>
              </button>
            ))}
          </div>
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
