// The comments panel (View → Comments; Insert → Comment, Ctrl+Alt+M or a right click's Comment on a cell): every thread
// of the sheet's comments, the open ones first, each under its cell (a click goes there), to read, answer, resolve or
// reopen, change and delete, with who wrote each part (you, or an agent) and when; and the field for a new comment on
// the cell picked, when it has none. The thread of the cell picked is raised, its reply field open. Comments are the
// shared ones of the editors (CommentThread, CommentBox); what people and agents wrote is shown as written.
import { useEffect, useRef } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { SheetComment } from '@shared/sheets';
import { cx } from '../../../components/ui';
import { CommentBox, CommentThread } from '../common/Comments';
import { SidePanel } from './Panel';

export function CommentsPanel({
  comments,
  cell,
  draft,
  narrow,
  readOnly,
  onGo,
  onAdd,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  onDraft,
  onClose,
}: {
  comments: SheetComment[];
  /** The cell picked ("B3"): its thread is raised. */
  cell: string;
  /** A new comment is being written on the cell picked. */
  draft: boolean;
  narrow: boolean;
  readOnly?: boolean;
  onGo: (cell: string) => void;
  onAdd: (text: string) => void;
  onReply: (id: string, text: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onDraft: (on: boolean) => void;
  onClose: () => void;
}) {
  const list = [...comments.filter((c) => !c.resolved), ...comments.filter((c) => c.resolved)];
  const here = comments.find((c) => c.cell === cell);
  const box = useRef<HTMLDivElement>(null);
  // The thread of the cell picked comes into view.
  useEffect(() => {
    box.current?.querySelector('[data-here]')?.scrollIntoView({ block: 'nearest' });
  }, [cell]);
  return (
    <SidePanel title="Comments" narrow={narrow} onClose={onClose}>
      <div ref={box} className="flex flex-col gap-2.5 p-3">
        {!readOnly &&
          !here &&
          (draft ? (
            <div className="rounded-xl border border-accent/60 bg-elevated p-2.5 shadow-lg">
              <div translate="no" className="mb-1.5 text-[12px] font-medium text-fg-3">
                {cell}
              </div>
              <CommentBox autoFocus onSubmit={(t) => onAdd(t)} onCancel={() => onDraft(false)} />
            </div>
          ) : (
            <button type="button" onClick={() => onDraft(true)} className="flex h-9 items-center gap-2 rounded-lg border border-dashed border-line-2 px-3 text-[13px] text-fg-2 hover:border-accent hover:text-fg">
              <MessageSquarePlus size={15} />
              <span>{`Comment on ${cell}`}</span>
            </button>
          ))}
        {!list.length && <p className="px-1 py-2 text-[13px] leading-relaxed text-fg-3">No comments on this sheet yet. Pick a cell and add one, or ask the agent to look at the sheet and comment where something needs you.</p>}
        {list.map((c) => (
          <div key={c.id} data-here={c.cell === cell ? '' : undefined}>
            <button type="button" translate="no" onClick={() => onGo(c.cell)} className={cx('mb-1 px-1 text-[12px] font-medium hover:text-accent', c.cell === cell ? 'text-accent' : 'text-fg-3')}>
              {c.cell}
            </button>
            <CommentThread
              comment={c}
              active={c.cell === cell}
              readOnly={readOnly}
              onFocus={() => onGo(c.cell)}
              onReply={(t) => onReply(c.id, t)}
              onResolve={(on) => onResolve(c.id, on)}
              onEdit={(t) => onEdit(c.id, t)}
              onDelete={() => onDelete(c.id)}
            />
          </div>
        ))}
      </div>
    </SidePanel>
  );
}
