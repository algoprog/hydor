// A comment as the editors show it, beside a document's page or in a list of comments: who wrote it (you, or an
// agent), how long ago, what it says and the replies under it, with Reply, Resolve (or Reopen), and in its menu Edit
// and Delete. CommentBox is the field a new comment or a reply is written in: Ctrl+Enter sends it, Esc drops it.
// Who and ago say who did something and when, for other notes of the editors as well (a tracked change).
// What people and agents wrote is shown as written, never translated.
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, MoreHorizontal, Pencil, RotateCcw, Trash2, User } from 'lucide-react';
import type { Comment } from '@shared/comments';
import { Button, cx, IconButton, MenuItem, Popover } from '../../../components/ui';
import { LOCALE } from '../../../i18n/locale';

/** How long ago, in a few words ("now", "5 min ago", "yesterday", "12 Mar"). */
export function ago(at: number): string {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = new Date(at);
  const now = new Date();
  return d.toLocaleDateString(LOCALE, d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Who wrote it: you or an agent, with their icon (for a tracked change too). */
export function Who({ by }: { by: 'user' | 'agent' }) {
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
      <span className={cx('flex h-5 w-5 items-center justify-center rounded-full', by === 'agent' ? 'bg-accent-soft text-accent' : 'bg-bg-3 text-fg-2')}>{by === 'agent' ? <Bot size={12} /> : <User size={12} />}</span>
      {by === 'agent' ? 'Agent' : 'You'}
    </span>
  );
}

/** The field to write a comment or a reply in. */
export function CommentBox({
  placeholder = 'Add a comment',
  initial = '',
  submit = 'Comment',
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder?: string;
  initial?: string;
  /** The button's words ("Comment", "Reply", "Save"). */
  submit?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  // As tall as what it holds, up to a point.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);
  useEffect(() => {
    if (autoFocus) area.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    setText('');
  };
  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={area}
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full resize-none rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[13px] leading-snug text-fg outline-none placeholder:text-fg-3 focus:border-accent"
      />
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!text.trim()} onClick={send}>
          {submit}
        </Button>
      </div>
    </div>
  );
}

/** A comment with its replies, to read, answer, resolve, change or delete. */
export function CommentThread({
  comment: c,
  active,
  onFocus,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  readOnly,
  className,
}: {
  comment: Comment;
  /** The one picked (its words are picked in the page): drawn raised, with its reply field open. */
  active?: boolean;
  onFocus?: () => void;
  onReply: (text: string) => void;
  onResolve: (resolved: boolean) => void;
  onEdit?: (text: string) => void;
  onDelete: () => void;
  readOnly?: boolean;
  className?: string;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) setReplying(false);
  }, [active]);
  return (
    <div
      onClick={onFocus}
      className={cx('rounded-xl border bg-elevated p-2.5 text-[13px] transition-shadow', active ? 'border-accent/60 shadow-lg' : 'border-line hover:border-line-2', c.resolved && 'opacity-70', onFocus && 'cursor-pointer', className)}
    >
      <div className="flex items-center gap-2">
        <Who by={c.by} />
        <span className="text-[11.5px] text-fg-3">{ago(c.at)}</span>
        <span className="flex-1" />
        {!readOnly && (
          <>
            <IconButton
              label={c.resolved ? 'Reopen' : 'Resolve'}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onResolve(!c.resolved);
              }}
            >
              {c.resolved ? <RotateCcw size={14} /> : <Check size={15} />}
            </IconButton>
            <IconButton
              ref={more}
              label="More"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => !m);
              }}
            >
              <MoreHorizontal size={15} />
            </IconButton>
            <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={180} title="Comment">
              {onEdit && c.by === 'user' && (
                <MenuItem
                  icon={<Pencil size={14} />}
                  onClick={() => {
                    setMenu(false);
                    setEditing(true);
                  }}
                >
                  Edit
                </MenuItem>
              )}
              <MenuItem
                icon={<Trash2 size={14} />}
                danger
                onClick={() => {
                  setMenu(false);
                  onDelete();
                }}
              >
                Delete
              </MenuItem>
            </Popover>
          </>
        )}
      </div>
      {c.quote && (
        <div translate="no" className="mt-1.5 line-clamp-2 border-l-2 border-accent/50 pl-2 text-[12px] text-fg-3">
          {c.quote}
        </div>
      )}
      {editing ? (
        <div className="mt-1.5">
          <CommentBox
            initial={c.text}
            submit="Save"
            autoFocus
            onSubmit={(t) => {
              onEdit?.(t);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div translate="no" className="mt-1.5 whitespace-pre-wrap break-words text-fg">
          {c.text}
        </div>
      )}
      {c.replies?.map((r) => (
        <div key={r.id} className="mt-2.5 border-t border-line/70 pt-2">
          <div className="flex items-center gap-2">
            <Who by={r.by} />
            <span className="text-[11.5px] text-fg-3">{ago(r.at)}</span>
          </div>
          <div translate="no" className="mt-1 whitespace-pre-wrap break-words text-fg">
            {r.text}
          </div>
        </div>
      ))}
      {!readOnly && !c.resolved && !editing && (
        <div className="mt-2">
          {replying || active ? (
            <CommentBox placeholder="Reply" submit="Reply" autoFocus={replying} onSubmit={(t) => onReply(t)} onCancel={() => setReplying(false)} />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFocus?.();
                setReplying(true);
              }}
              className="text-[12.5px] text-fg-3 hover:text-fg"
            >
              Reply
            </button>
          )}
        </div>
      )}
    </div>
  );
}
