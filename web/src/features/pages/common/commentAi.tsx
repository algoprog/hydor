// Comments resolved with AI: Resolve with AI on a comment, on all the open ones at the top of an editor's comments, or
// Ask AI as a new comment is written, sends a request at once (nothing to type) to the agent of the place the editor is
// in: Pages' Ask panel, the conversation the page is beside, or Files' Ask panel for a LaTeX file. The agent makes the
// change each comment asks for and, in the same save, replies to it saying what it changed and resolves it; a comment
// that only asks something gets an answer and stays open. The request (shared/comment-asks.ts) names each comment by
// its id, where it is, the words it is on, what it says and its replies, so the agent finds it with get_page. While the
// agent works (and while the request waits its turn behind another), the comments it is about say so, and the row at
// the top counts them.
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { Sparkles } from 'lucide-react';
import { post } from '../../../lib/api';
import { useSessions } from '../../../lib/store';
import { cx } from '../../../components/ui';

/** What an editor gets from the place it is in: how to ask an agent, and the comments an agent is at work on now. */
export interface CommentAi {
  /** Sends the request now (the place saves unsaved changes first), about the comments with these ids. */
  ask: (prompt: string, ids: string[]) => void;
  /** The ids of the comments an agent is at work on (or that wait their turn). */
  busy: ReadonlySet<string>;
}

/** Sends a message to a conversation: after its turn when its agent is at work, else now. */
export async function sendToSession(key: string, text: string) {
  const st = useSessions.getState().byKey[key]?.live?.status;
  const busy = st === 'working' || st === 'starting' || st === 'waiting';
  await post(`/api/sessions/${encodeURIComponent(key)}/${busy ? 'queue' : 'message'}`, { text });
}

/** The comments asked about, by the place they are in ("page:<id>", "file:<path>"…), and when the last ask went. */
const useAsked = create<Record<string, { ids: string[]; at: number }>>(() => ({}));

/** An ask counts as at work this long before its conversation shows it is (a session starting, a message on its way). */
const FRESH_MS = 8000;

/**
 * The place's side of it: `where` names the page or file (null: no AI here, such as an older version); `send` sends
 * the request (saving first); `session` is the conversation requests go to, `pending` true while one starts. The
 * comments asked about are at work while that conversation is (or has messages waiting), and for a few seconds after
 * an ask, before it shows; once it stops, they are forgotten.
 */
export function useCommentAi(where: string | null, send: ((prompt: string) => Promise<unknown> | void) | null, session: string | null, pending?: boolean): CommentAi | undefined {
  const s = useSessions((x) => (session ? x.byKey[session] : undefined));
  const asked = useAsked((x) => (where ? x[where] : undefined));
  const st = s?.live?.status;
  const working = !!pending || st === 'working' || st === 'starting' || st === 'waiting' || (!!s?.queue?.length && !s.queueHeld);
  const [, tick] = useState(0);
  const fresh = !!asked && Date.now() - asked.at < FRESH_MS;
  // Seen again once the fresh time is over, to drop them when nothing is at work by then.
  useEffect(() => {
    if (!asked || !fresh) return;
    const t = setTimeout(() => tick((n) => n + 1), FRESH_MS + 50 - (Date.now() - asked.at));
    return () => clearTimeout(t);
  }, [asked?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (where && asked && !working && !fresh)
      useAsked.setState((x) => {
        const { [where]: _done, ...rest } = x;
        return rest;
      });
  }, [where, asked, working, fresh]);
  const busy = useMemo(() => new Set(asked && (working || fresh) ? asked.ids : []), [asked, working, fresh]);
  return useMemo(() => {
    if (!where || !send) return undefined;
    return {
      busy,
      ask: (prompt: string, ids: string[]) => {
        useAsked.setState((x) => ({ ...x, [where]: { ids: [...new Set([...(x[where] && (working || Date.now() - x[where].at < FRESH_MS) ? x[where].ids : []), ...ids])], at: Date.now() } }));
        // Once the editor has drawn again: a comment just added is then among the changes the place saves first.
        setTimeout(() => void send(prompt), 50);
      },
    };
  }, [where, send, busy, working]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** That an agent is at work on comments: a quiet line with a breathing dot. */
export function AiWorking({ n, className }: { n?: number; className?: string }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2 text-[12.5px] leading-snug text-fg-2', className)}>
      <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />
      <span className="min-w-0">{n === undefined ? 'AI is working on this' : `AI is working on ${n} comment${n === 1 ? '' : 's'}`}</span>
    </div>
  );
}

/**
 * The top of an editor's comments: Resolve with AI for the open comments no agent is at work on (`open` of them), and
 * how many an agent is at work on (`busy`). Nothing when neither.
 */
export function AiResolveAll({ open, busy, onAsk, className }: { open: number; busy: number; onAsk?: () => void; className?: string }) {
  if (!onAsk || (open <= 0 && busy <= 0)) return null;
  return (
    <div className={cx('space-y-1.5', className)}>
      {busy > 0 && <AiWorking n={busy} className="min-h-8 px-2 py-1" />}
      {open > 0 && (
        <button
          type="button"
          onClick={onAsk}
          title="An agent makes the change each comment asks for, replies to it and resolves it"
          className="flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-accent/25 bg-accent-soft/50 px-2.5 py-1.5 text-left text-[12.5px] leading-snug font-medium text-fg transition-colors hover:border-accent/45 hover:bg-accent-soft"
        >
          <Sparkles size={14} className="shrink-0 text-accent" />
          <span className="min-w-0">{`Resolve ${open} comment${open === 1 ? '' : 's'} with AI`}</span>
        </button>
      )}
    </div>
  );
}
