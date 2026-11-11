// A document's comments, as Google Docs shows them: on a wide screen, a column beside the page, each thread level with
// the words it is on (the one picked right beside them, the others moved up or down to make room); on a narrow screen
// or a phone, a panel that lists them all, each with the words it was on. A new comment is written in its place in
// the column (or at the top of the panel). Each has replies, Resolve and Reopen, Edit and Delete; resolved ones show
// only when asked. Where an agent can be asked, Resolve with AI at the top sends it every open comment, each comment
// has its own, and a new one can go with Ask AI (common/commentAi.tsx); the ones an agent is at work on say so.
// Suggested changes (Suggestions.tsx) show among them, each level with what it changes.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MessageSquare, X } from 'lucide-react';
import type { Comment } from '@shared/comments';
import { IconButton, Switch } from '../../../components/ui';
import { CommentBox, CommentThread } from '../common/Comments';
import { AiResolveAll } from '../common/commentAi';

export interface CommentActions {
  active: string | null;
  focus: (id: string) => void;
  reply: (id: string, text: string) => void;
  resolve: (id: string, resolved: boolean) => void;
  edit: (id: string, text: string) => void;
  remove: (id: string) => void;
  readOnly?: boolean;
  /** A comment asked to open for editing (the right-click menu's Edit): its id, and a time that changes with each ask. */
  startEdit?: { id: string; n: number } | null;
}

/** Resolve with AI: on a comment, on all the open ones, on a new one as it is written; and the ones an agent is at work on. */
export interface DocCommentAi {
  busy: ReadonlySet<string>;
  one: (id: string) => void;
  all: () => void;
  draft: (text: string) => void;
}

/** The open comments no agent is at work on, and those it is. */
const aiCounts = (list: Comment[], ai?: DocCommentAi) => {
  const open = list.filter((c) => !c.resolved);
  const busy = ai ? open.filter((c) => ai.busy.has(c.id)).length : 0;
  return { idle: open.length - busy, busy };
};

/** A card that shows among the comments (a suggested change): its id, where what it is about is down the page, and itself. */
export interface Extra {
  id: string;
  top?: number;
  node: ReactNode;
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
  extra = [],
  draft,
  onDraft,
  onCancelDraft,
  ai,
  a,
  left,
  width,
}: {
  comments: Comment[];
  /** Cards that show among the comments, each level with what it is about. */
  extra?: Extra[];
  /** Where each comment's words start, down the page (none: its words are gone; it goes after the others). */
  tops: Map<string, number>;
  draft: Draft | null;
  onDraft: (text: string) => void;
  onCancelDraft: () => void;
  ai?: DocCommentAi;
  a: CommentActions;
  left: number;
  width: number;
}) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const items = useMemo(() => {
    const list: { id: string; top: number; c: Comment | null; node?: ReactNode }[] = comments.map((c, k) => ({ id: c.id, top: tops.get(c.id) ?? 1e9 + k, c }));
    extra.forEach((x, k) => list.push({ id: x.id, top: x.top ?? 2e9 + k, c: null, node: x.node }));
    if (draft) list.push({ id: '~draft', top: draft.y, c: null });
    return list.sort((x, y) => x.top - y.top);
  }, [comments, tops, draft, extra]);
  // Measured after each render; placed again when a height changed.
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    let changed = false;
    for (const id of [...items.map((it) => it.id), '~ai']) {
      const h = refs.current.get(id)?.offsetHeight ?? 0;
      next.set(id, h);
      if ((heights.get(id) ?? 0) !== h) changed = true;
    }
    if (changed) setHeights(next);
  });
  // Resolve with AI's rows at the top (and how many an agent is at work on): the threads start under them, as tall as they are.
  const n = aiCounts(comments, ai);
  const rows = ai && !a.readOnly ? (n.idle > 0 ? 1 : 0) + (n.busy > 0 ? 1 : 0) : 0;
  const askH = rows ? (heights.get('~ai') ?? rows * 32 + (rows - 1) * 6) + 10 : 0;
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
      {rows > 0 && (
        <div
          ref={(el) => {
            if (el) refs.current.set('~ai', el);
            else refs.current.delete('~ai');
          }}
        >
          <AiResolveAll open={n.idle} busy={n.busy} onAsk={ai?.all} />
        </div>
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
          {it.node ? (
            it.node
          ) : it.c ? (
            <CommentThread
              comment={it.c}
              active={a.active === it.id}
              onFocus={() => a.focus(it.id)}
              onReply={(t) => a.reply(it.id, t)}
              onResolve={(r) => a.resolve(it.id, r)}
              onEdit={(t) => a.edit(it.id, t)}
              startEdit={a.startEdit?.id === it.id ? a.startEdit.n : undefined}
              onDelete={() => a.remove(it.id)}
              onAi={ai ? () => ai.one(it.id) : undefined}
              aiBusy={ai?.busy.has(it.id)}
              readOnly={a.readOnly}
            />
          ) : (
            <div className="rounded-xl border border-accent/50 bg-elevated p-2.5 shadow-md">
              <CommentBox onSubmit={onDraft} onAi={ai?.draft} onCancel={onCancelDraft} autoFocus />
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
  extra = [],
  showResolved,
  setShowResolved,
  draft,
  onDraft,
  onCancelDraft,
  ai,
  onClose,
  a,
}: {
  comments: Comment[];
  all: Comment[];
  /** Cards listed before the comments (suggested changes, in the order they come in the document). */
  extra?: Extra[];
  showResolved: boolean;
  setShowResolved: (on: boolean) => void;
  draft: Draft | null;
  onDraft: (text: string) => void;
  onCancelDraft: () => void;
  ai?: DocCommentAi;
  onClose: () => void;
  a: CommentActions;
}) {
  const open = all.filter((c) => !c.resolved).length;
  const n = aiCounts(all, ai);
  const resolved = all.length - open;
  return (
    <div className="flex h-full min-h-0 flex-col" data-keeps-editing>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <MessageSquare size={15} className="text-fg-3" />
        <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-[13px] font-medium text-fg">
          {(open > 0 || !extra.length) && <span>{`${open} open comment${open === 1 ? '' : 's'}`}</span>}
          {extra.length > 0 && <span className={open > 0 ? 'text-fg-3' : undefined}>{`${extra.length} suggestion${extra.length === 1 ? '' : 's'}`}</span>}
        </div>
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
            <CommentBox onSubmit={onDraft} onAi={ai?.draft} onCancel={onCancelDraft} autoFocus />
          </div>
        )}
        {ai && !a.readOnly && <AiResolveAll open={n.idle} busy={n.busy} onAsk={ai.all} />}
        {extra.map((x) => (
          <div key={x.id}>{x.node}</div>
        ))}
        {comments.map((c) => (
          <div key={c.id}>
            <CommentThread
              comment={c}
              active={a.active === c.id}
              onFocus={() => a.focus(c.id)}
              onReply={(t) => a.reply(c.id, t)}
              onResolve={(r) => a.resolve(c.id, r)}
              onEdit={(t) => a.edit(c.id, t)}
              startEdit={a.startEdit?.id === c.id ? a.startEdit.n : undefined}
              onDelete={() => a.remove(c.id)}
              onAi={ai ? () => ai.one(c.id) : undefined}
              aiBusy={ai?.busy.has(c.id)}
              readOnly={a.readOnly}
            />
          </div>
        ))}
        {!comments.length && !extra.length && !draft && <p className="px-1 py-6 text-center text-[12.5px] leading-relaxed text-fg-3">Pick some words, then Comment (Ctrl+Alt+M), to leave a comment on them.</p>}
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
