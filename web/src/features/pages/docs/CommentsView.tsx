// A document's comments, as Google Docs shows them: on a wide screen, a column beside the page, each thread level with
// the words it is on (the one picked right beside them, the others moved up or down to make room); on a narrow screen
// or a phone, a panel that lists them all, each with the words it was on. A new comment is written in its place in
// the column (or at the top of the panel). Each has replies, Resolve and Reopen, Edit and Delete; resolved ones show
// only when asked. A button asks the agent to answer the open comments.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Sparkles, X } from 'lucide-react';
import type { Comment } from '@shared/comments';
import { Button, IconButton, Switch } from '../../../components/ui';
import { CommentBox, CommentThread } from '../common/Comments';

export interface CommentActions {
  active: string | null;
  focus: (id: string) => void;
  reply: (id: string, text: string) => void;
  resolve: (id: string, resolved: boolean) => void;
  edit: (id: string, text: string) => void;
  remove: (id: string) => void;
  readOnly?: boolean;
}

/** The new comment being written: where its words are (in the host's coordinates), and what they say. */
export interface Draft {
  y: number;
  quote: string;
}

/** The column beside the page: threads placed level with their words, none over another. */
export function CommentsColumn({
  comments,
  tops,
  draft,
  onDraft,
  onCancelDraft,
  onAsk,
  a,
  left,
  width,
}: {
  comments: Comment[];
  /** Where each comment's words start, down the page (none: its words are gone; it goes after the others). */
  tops: Map<string, number>;
  draft: Draft | null;
  onDraft: (text: string) => void;
  onCancelDraft: () => void;
  onAsk?: () => void;
  a: CommentActions;
  left: number;
  width: number;
}) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const items = useMemo(() => {
    const list: { id: string; top: number; c: Comment | null }[] = comments.map((c, k) => ({ id: c.id, top: tops.get(c.id) ?? 1e9 + k, c }));
    if (draft) list.push({ id: '~draft', top: draft.y, c: null });
    return list.sort((x, y) => x.top - y.top);
  }, [comments, tops, draft]);
  // Measured after each render; placed again when a height changed.
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    let changed = false;
    for (const it of items) {
      const h = refs.current.get(it.id)?.offsetHeight ?? 0;
      next.set(it.id, h);
      if (heights.get(it.id) !== h) changed = true;
    }
    if (changed) setHeights(next);
  });
  const open = comments.filter((c) => !c.resolved).length;
  const askH = onAsk && open > 0 ? 40 : 0;
  // The one picked (or being written) beside its words; those above it moved up, those below moved down.
  const pos = useMemo(() => {
    const out = new Map<string, number>();
    const h = (id: string) => (heights.get(id) ?? 120) + 10;
    const pin = items.findIndex((it) => it.id === '~draft') >= 0 ? items.findIndex((it) => it.id === '~draft') : items.findIndex((it) => it.id === a.active && it.top < 1e9);
    const start = pin >= 0 ? pin : 0;
    let lastEnd = -Infinity;
    for (let k = start; k < items.length; k++) {
      const it = items[k];
      const y = Math.max(it.top < 1e9 ? it.top : lastEnd, lastEnd);
      out.set(it.id, y);
      lastEnd = y + h(it.id);
    }
    let firstTop = out.get(items[start]?.id ?? '') ?? 0;
    for (let k = start - 1; k >= 0; k--) {
      const it = items[k];
      const y = Math.min(it.top, firstTop - h(it.id));
      out.set(it.id, y);
      firstTop = y;
    }
    // Nothing above the top of the page (and the button at its top).
    const min = Math.min(askH, ...out.values());
    if (min < askH) for (const [k, v] of out) out.set(k, v + askH - min);
    return out;
  }, [items, heights, a.active, askH]);
  return (
    <div className="absolute top-0" style={{ left, width }} data-keeps-editing>
      {onAsk && open > 0 && (
        <button type="button" onClick={onAsk} className="mb-2 flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[12.5px] font-medium text-fg-2 hover:bg-bg-3 hover:text-fg">
          <Sparkles size={14} className="text-accent" />
          Ask the agent to answer the comments
        </button>
      )}
      {items.map((it) => (
        <div
          key={it.id}
          ref={(el) => {
            if (el) refs.current.set(it.id, el);
            else refs.current.delete(it.id);
          }}
          className="absolute right-0 left-0"
          style={{ top: pos.get(it.id) ?? askH }}
        >
          {it.c ? (
            <CommentThread
              comment={it.c}
              active={a.active === it.id}
              onFocus={() => a.focus(it.id)}
              onReply={(t) => a.reply(it.id, t)}
              onResolve={(r) => a.resolve(it.id, r)}
              onEdit={(t) => a.edit(it.id, t)}
              onDelete={() => a.remove(it.id)}
              readOnly={a.readOnly}
            />
          ) : (
            <div className="rounded-xl border border-accent/50 bg-elevated p-2.5 shadow-md">
              <CommentBox onSubmit={onDraft} onCancel={onCancelDraft} autoFocus />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** The panel of every comment (narrow screens and phones): the words each was on above it. */
export function CommentsPanel({
  comments,
  all,
  showResolved,
  setShowResolved,
  draft,
  onDraft,
  onCancelDraft,
  onAsk,
  onClose,
  a,
}: {
  comments: Comment[];
  all: Comment[];
  showResolved: boolean;
  setShowResolved: (on: boolean) => void;
  draft: Draft | null;
  onDraft: (text: string) => void;
  onCancelDraft: () => void;
  onAsk?: () => void;
  onClose: () => void;
  a: CommentActions;
}) {
  const open = all.filter((c) => !c.resolved).length;
  const resolved = all.length - open;
  return (
    <div className="flex h-full min-h-0 flex-col" data-keeps-editing>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <MessageSquare size={15} className="text-fg-3" />
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{`${open} open comment${open === 1 ? '' : 's'}`}</div>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {draft && (
          <div className="rounded-xl border border-accent/50 bg-elevated p-2.5">
            <p translate="no" className="mb-2 line-clamp-2 border-l-2 border-[#fbbc04] pl-2 text-[12px] text-fg-3">
              {draft.quote}
            </p>
            <CommentBox onSubmit={onDraft} onCancel={onCancelDraft} autoFocus />
          </div>
        )}
        {onAsk && open > 0 && (
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} className="text-accent" />} onClick={onAsk} className="w-full justify-start">
            Ask the agent to answer the comments
          </Button>
        )}
        {comments.map((c) => (
          <div key={c.id}>
            <CommentThread
              comment={c}
              active={a.active === c.id}
              onFocus={() => a.focus(c.id)}
              onReply={(t) => a.reply(c.id, t)}
              onResolve={(r) => a.resolve(c.id, r)}
              onEdit={(t) => a.edit(c.id, t)}
              onDelete={() => a.remove(c.id)}
              readOnly={a.readOnly}
            />
          </div>
        ))}
        {!comments.length && !draft && <p className="px-1 py-6 text-center text-[12.5px] leading-relaxed text-fg-3">Pick some words, then Comment (Ctrl+Alt+M), to leave a comment on them.</p>}
      </div>
      {resolved > 0 && (
        <label className="flex shrink-0 cursor-pointer items-center gap-2 border-t border-line px-3 py-2 text-[12.5px] text-fg-2">
          <span className="min-w-0 flex-1">{`Show resolved (${resolved})`}</span>
          <Switch on={showResolved} onChange={setShowResolved} label="Show resolved comments" />
        </label>
      )}
    </div>
  );
}
