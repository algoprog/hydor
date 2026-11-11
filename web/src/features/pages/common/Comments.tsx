// A comment as the editors show it, beside a document's page or in a list of comments: who wrote it (you, an agent,
// or someone named: a person a project is shared with, or a Word file's comments' author, with their initials), how
// long ago, what it says and the replies under it, with Reply, Resolve (or Reopen), and in its menu Edit and Delete.
// CommentBox is the field a new comment or a reply is written in: Ctrl+Enter sends it, Esc drops it. Who and ago say
// who did something and when, for other notes of the editors as well (a tracked change). Where an agent can be asked
// (commentAi.tsx), an open comment has Resolve with AI, says so while an agent is at work on it, and a new comment can
// go with Ask AI (Ctrl+Shift+Enter). What people and agents wrote is shown as written, never translated.
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, MoreHorizontal, Pencil, RotateCcw, Sparkles, Trash2, User } from 'lucide-react';
import type { Comment } from '@shared/comments';
import { Button, cx, IconButton, MenuItem, Popover } from '../../../components/ui';
import { LOCALE } from '../../../i18n/locale';
import { AiWorking } from './commentAi';

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

/** Who "you" are where comments show: the app's owner, or (in a shared project's portal, which sets it) that person's share. */
let me: string | null = null;
export const setCommentMe = (id: string | null) => void (me = id);

/** Whether you wrote it: the owner's own, or in a shared project's portal, that person's. */
export const isMine = (c: Pick<Comment, 'by' | 'who'>) => c.by === 'user' || (c.by === 'person' && !!me && c.who === me);

/** A named author's initials ("ML" for Maria Lopez), and a colour of their own, the same each time. */
function initials(name: string): { letters: string; hue: number } {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? `${[...words[0]][0]}${[...words[words.length - 1]][0]}` : [...name].slice(0, 2).join('')).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return { letters, hue: h };
}

/**
 * Who wrote it: you, an agent, someone the project is shared with (by their name), or someone named (a Word file's
 * comments), with their icon or initials (for a tracked change too).
 */
export function Who({ by, author, name, who }: { by: Comment['by']; author?: string; name?: string; who?: string }) {
  const named = by === 'person' ? (isMine({ by, who }) ? undefined : name || 'Someone') : author;
  if (named) {
    const { letters, hue } = initials(named);
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-fg">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white" style={{ background: `hsl(${hue} 45% 45%)` }} translate="no">
          {letters}
        </span>
        <span className="truncate" translate="no">
          {named}
        </span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-fg">
      <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', by === 'agent' ? 'bg-accent-soft text-accent' : 'bg-bg-3 text-fg-2')}>
        {by === 'agent' ? <Bot size={12} /> : <User size={12} />}
      </span>
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
  onAi,
  onCancel,
  autoFocus,
}: {
  placeholder?: string;
  initial?: string;
  /** The button's words ("Comment", "Reply", "Save"). */
  submit?: string;
  onSubmit: (text: string) => void;
  /** A new comment that goes to an agent at once (Ask AI, Ctrl+Shift+Enter): it makes the change and resolves it. */
  onAi?: (text: string) => void;
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
  const send = (ai = false) => {
    const t = text.trim();
    if (!t) return;
    if (ai && onAi) onAi(t);
    else onSubmit(t);
    setText('');
  };
  return (
    <div className="@container flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={area}
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send(e.shiftKey);
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
      {/* Ask AI on the left (its mark alone in a narrow box), Cancel and Comment on the right, on a line of their own when there is no room. */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {onAi && (
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} className="text-accent" />} disabled={!text.trim()} onClick={() => send(true)} title="Comment, and have AI make the change and resolve it (Ctrl+Shift+Enter)" aria-label="Ask AI" className="mr-auto">
            <span className="hidden @min-[16rem]:inline">Ask AI</span>
          </Button>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" disabled={!text.trim()} onClick={() => send()}>
            {submit}
          </Button>
        </div>
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
  onAi,
  aiBusy,
  readOnly,
  className,
  startEdit,
}: {
  comment: Comment;
  /** The one picked (its words are picked in the page): drawn raised, with its reply field open. */
  active?: boolean;
  onFocus?: () => void;
  onReply: (text: string) => void;
  onResolve: (resolved: boolean) => void;
  onEdit?: (text: string) => void;
  /** Left out where it may not be deleted (someone else's, in a shared project's portal). */
  onDelete?: () => void;
  /** Resolve with AI: an agent makes the change it asks for, replies and resolves it (left out where no agent can be asked). */
  onAi?: () => void;
  /** An agent is at work on it. */
  aiBusy?: boolean;
  readOnly?: boolean;
  className?: string;
  /** Changes (a time) when the comment is asked to open for editing from elsewhere (an editor's right-click menu). */
  startEdit?: number;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  // In a shared project's portal, only your own comments can be deleted (the owner's app deletes any).
  const deletable = !!onDelete && (!me || isMine(c));
  const more = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) setReplying(false);
  }, [active]);
  useEffect(() => {
    if (startEdit && onEdit && isMine(c) && !c.author) setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEdit]);
  return (
    <div
      onClick={onFocus}
      className={cx('rounded-xl border bg-elevated p-2.5 text-[13px] transition-shadow', active ? 'border-accent/60 shadow-lg' : 'border-line hover:border-line-2', c.resolved && 'opacity-70', onFocus && 'cursor-pointer', className)}
    >
      <div className="flex items-center gap-2">
        <Who by={c.by} author={c.author} name={c.name} who={c.who} />
        <span className="shrink-0 text-[11.5px] text-fg-3">{ago(c.at)}</span>
        <span className="flex-1" />
        {!readOnly && (
          <>
            {onAi && !c.resolved && !aiBusy && (
              <IconButton
                label="Resolve with AI"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAi();
                }}
              >
                <Sparkles size={14} className="text-accent" />
              </IconButton>
            )}
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
            {((onEdit && isMine(c)) || deletable) && (
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
            )}
            <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={180} title="Comment">
              {onEdit && isMine(c) && !c.author && (
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
              {deletable && (
                <MenuItem
                  icon={<Trash2 size={14} />}
                  danger
                  onClick={() => {
                    setMenu(false);
                    onDelete?.();
                  }}
                >
                  Delete
                </MenuItem>
              )}
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
            <Who by={r.by} author={r.author} name={r.name} who={r.who} />
            <span className="shrink-0 text-[11.5px] text-fg-3">{ago(r.at)}</span>
          </div>
          <div translate="no" className="mt-1 whitespace-pre-wrap break-words text-fg">
            {r.text}
          </div>
        </div>
      ))}
      {aiBusy && !c.resolved && <AiWorking className="mt-2.5" />}
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
