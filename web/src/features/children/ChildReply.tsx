// A child session's reply in its parent's conversation (the message that woke the parent), as one line:
// whose it is and how it begins. It opens to what the child wrote, or the summary of a long reply, with a
// way into the child. One that was stopped or failed says so instead, and one a usage limit stopped that carries on
// (with another account, on API credit, or once the limit lifts) says how: its reply comes later, in a line of its own.
// A subagent of the program's own (Claude Code's, Codex's) coming back to its lead shows the same way (ProgramReplyRow).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, CircleAlert, CircleStop, RefreshCw, Reply } from 'lucide-react';
import type { ChildReply } from '@shared/children';
import type { SubagentReply } from '@shared/types';
import { ReplyMarkdown } from '../../components/Markdown';
import { cx, Throbber } from '../../components/ui';
import { api, enc } from '../../lib/api';
import { clockTime } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';

/** A text's first line, without Markdown's marks; past a heading such as "Summary:" when more follows. */
function firstLine(t: string) {
  const lines = t
    .split('\n')
    .map((x) =>
      x
        .replace(/^\s*(#+|[-*+>]|\d+[.)])\s+/, '')
        // A link as its words and a picture left out: the address would fill the line.
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return (lines.length > 1 && lines[0].endsWith(':') ? lines[1] : lines[0]) ?? '';
}

/** In a waiting message's place (the queue), the same words as its line here. */
export function ChildReplyLabel({ reply }: { reply: ChildReply }) {
  const title = useSessions((x) => x.byKey[reply.key]?.title) || reply.title;
  const name = <span className="font-medium text-fg">{title}</span>;
  if (reply.ended === 'replied') return <>Reply from {name}</>;
  if (reply.ended === 'continues') return <>{name} carries on after a usage limit</>;
  return reply.ended === 'stopped' ? <>{name} was stopped</> : <>{name} stopped with an error</>;
}

type Ended = ChildReply['ended'];

/** The line of a reply: how it ended, whose it is, how it begins and when; opened, `children` (what it wrote, a way in). */
function ReplyLine({ ts, ended, label, head, onOpen, children }: { ts?: number; ended: Ended; label: ReactNode; head: string; /** Called as the line opens. */ onOpen?: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const Icon = ended === 'replied' ? Reply : ended === 'stopped' ? CircleStop : ended === 'continues' ? RefreshCw : CircleAlert;
  return (
    <div className="tl-item">
      <button
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <Icon size={14} className={cx('shrink-0', ended === 'replied' ? 'text-accent' : ended === 'stopped' ? 'text-warn' : ended === 'continues' ? 'text-fg-3' : 'text-err')} />
        {/* On a phone the line has room for its name only. */}
        <span className="max-w-[60%] shrink-0 truncate text-[13px] text-fg-2 max-sm:max-w-none max-sm:min-w-0 max-sm:flex-1 max-sm:shrink">{label}</span>
        <span translate="no" className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3 max-sm:hidden">
          {!open && head && `· ${head}`}
        </span>
        {ts ? <span className="shrink-0 text-[11px] text-fg-3">{clockTime(ts)}</span> : null}
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && <div className="mt-1 mb-2 ml-[15px] border-l border-accent/30 pl-4">{children}</div>}
    </div>
  );
}

const OPEN_LINK = 'mt-2 inline-flex items-center gap-0.5 text-[12.5px] font-medium text-accent hover:underline';

/** A child's reply as a line; `ts`: when it came. */
export function ChildReplyRow({ ts, reply }: { ts?: number; reply: ChildReply }) {
  const head = useMemo(() => firstLine(reply.why ?? reply.text), [reply]);
  return (
    <ReplyLine ts={ts} ended={reply.ended} label={<ChildReplyLabel reply={reply} />} head={head}>
      {reply.summaryOf ? <div className="mb-1.5 text-[12px] text-fg-3">A summary of a long reply</div> : null}
      {reply.why && reply.text && <div className="mb-1.5 text-[12.5px] text-fg-3">{reply.why}</div>}
      {reply.ended === 'continues' ? (
        <div className="text-[13px] text-fg-3">
          {reply.why && <div translate="no">{reply.why}</div>}
          <div>Its reply comes here when it finishes.</div>
        </div>
      ) : reply.text ? (
        <ReplyMarkdown text={reply.text} breaks className="!text-[13.5px] !leading-relaxed !text-fg-2" />
      ) : (
        <div className="text-[13px] text-fg-3">{reply.why ?? 'It wrote no reply.'}</div>
      )}
      <button type="button" onClick={() => openSession(reply.key)} className={OPEN_LINK}>
        {reply.summaryOf ? 'Read the whole reply' : 'Open its session'}
        <ChevronRight size={13} />
      </button>
    </ReplyLine>
  );
}

/** The words of a program subagent's reply, as a Hydor subagent's are ("Reply from …"). */
export function ProgramReplyLabel({ reply }: { reply: SubagentReply }) {
  const name = <span translate="no" className="font-medium text-fg">{reply.title}</span>;
  if (reply.ended === 'replied') return <>Reply from {name}</>;
  return reply.ended === 'stopped' ? <>{name} was stopped</> : <>{name} stopped with an error</>;
}

/**
 * What a subagent wrote last, for one whose reply the transcript does not carry (Codex's): asked of the server the
 * first time `want` turns true, once. `undefined` while it loads.
 */
function useLastReply(key: string | undefined, want: boolean): string | undefined {
  const [text, setText] = useState<string | undefined>();
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!want || !key || asked) return;
    setAsked(true);
    api<{ text?: string }>(`/api/sessions/${enc(key)}/last-reply`)
      .then((r) => setText(r.text ?? ''))
      .catch(() => setText(''));
  }, [want, key, asked]);
  return text;
}

/** A program subagent's reply to its lead as a line, like a Hydor subagent's; `ts`: when it came. */
export function ProgramReplyRow({ ts, reply }: { ts?: number; reply: SubagentReply }) {
  const [seen, setSeen] = useState(false);
  // An empty text is Codex's: its own conversation has the reply, fetched when the line is first opened.
  const fetched = useLastReply(reply.key, seen && !reply.text && reply.ended === 'replied');
  const text = reply.text || fetched || '';
  const loading = seen && !reply.text && reply.ended === 'replied' && !!reply.key && fetched === undefined;
  const head = useMemo(() => firstLine(reply.why ?? text), [reply.why, text]);
  return (
    <ReplyLine ts={ts} ended={reply.ended} label={<ProgramReplyLabel reply={reply} />} head={head} onOpen={() => setSeen(true)}>
      {reply.why && text && <div className="mb-1.5 text-[12.5px] text-fg-3">{reply.why}</div>}
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-fg-3">
          <Throbber />
          Loading its reply
        </div>
      ) : text ? (
        <ReplyMarkdown text={text} breaks className="!text-[13.5px] !leading-relaxed !text-fg-2" />
      ) : (
        <div className="text-[13px] text-fg-3">{reply.why ?? 'It wrote no reply.'}</div>
      )}
      {reply.key && (
        <button type="button" onClick={() => openSession(reply.key!)} className={OPEN_LINK}>
          Open its session
          <ChevronRight size={13} />
        </button>
      )}
    </ReplyLine>
  );
}
