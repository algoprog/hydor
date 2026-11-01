// A child session's reply in its parent's conversation (the message that woke the parent), as one line:
// whose it is and how it begins. It opens to what the child wrote, or the summary of a long reply, with a
// way into the child. One that was stopped or failed says so instead.
import { useMemo, useState } from 'react';
import { ChevronRight, CircleAlert, CircleStop, Reply } from 'lucide-react';
import type { ChildReply } from '@shared/children';
import type { UserItem } from '@shared/types';
import { Markdown } from '../../components/Markdown';
import { cx } from '../../components/ui';
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
        .replace(/[*_`]/g, '')
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
  return reply.ended === 'stopped' ? <>{name} was stopped</> : <>{name} stopped with an error</>;
}

export function ChildReplyRow({ item, reply }: { item: UserItem; reply: ChildReply }) {
  const [open, setOpen] = useState(false);
  const head = useMemo(() => firstLine(reply.why ?? reply.text), [reply]);
  const Icon = reply.ended === 'replied' ? Reply : reply.ended === 'stopped' ? CircleStop : CircleAlert;
  return (
    <div className="tl-item">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <Icon size={14} className={cx('shrink-0', reply.ended === 'replied' ? 'text-accent' : reply.ended === 'stopped' ? 'text-warn' : 'text-err')} />
        {/* On a phone the line has room for its name only. */}
        <span className="max-w-[60%] shrink-0 truncate text-[13px] text-fg-2 max-sm:max-w-none max-sm:min-w-0 max-sm:flex-1 max-sm:shrink">
          <ChildReplyLabel reply={reply} />
        </span>
        <span translate="no" className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3 max-sm:hidden">
          {!open && head && `· ${head}`}
        </span>
        <span className="shrink-0 text-[11px] text-fg-3">{clockTime(item.ts)}</span>
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-[15px] border-l border-accent/30 pl-4">
          {reply.summaryOf ? <div className="mb-1.5 text-[12px] text-fg-3">A summary of a long reply</div> : null}
          {reply.why && reply.text && <div className="mb-1.5 text-[12.5px] text-fg-3">{reply.why}</div>}
          {reply.text ? <Markdown text={reply.text} breaks className="!text-[13.5px] !leading-relaxed !text-fg-2" /> : <div className="text-[13px] text-fg-3">{reply.why ?? 'It wrote no reply.'}</div>}
          <button type="button" onClick={() => openSession(reply.key)} className="mt-2 inline-flex items-center gap-0.5 text-[12.5px] font-medium text-accent hover:underline">
            {reply.summaryOf ? 'Read the whole reply' : 'Open its session'}
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
