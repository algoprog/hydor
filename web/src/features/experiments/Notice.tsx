// The message Experiments sends a session when its runs ended, or when one still running looks wrong (shared/experiments.ts
// experimentNoticeOf), drawn as one quiet row in the conversation, as the goal loop's messages are. Its text is a click
// away: no bubble, nothing to edit.
import { useState } from 'react';
import { ChevronRight, FlaskConical } from 'lucide-react';
import { cx } from '../../components/ui';
import { clockTime } from '../../lib/format';

/** The row's words, also for the message while it waits in the queue. */
export function ExperimentNoticeLabel({ wrong }: { wrong?: boolean }) {
  return (
    <>
      <span className="font-medium text-fg">Experiments</span>
      {' · '}
      <span>{wrong ? 'A run needs a look' : 'Runs ended'}</span>
    </>
  );
}

export function ExperimentNotice({ ts, body, wrong }: { ts?: number; body: string; wrong?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-item">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <FlaskConical size={14} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">
          <ExperimentNoticeLabel wrong={wrong} />
        </span>
        {ts != null && <span className="shrink-0 text-[11px] text-fg-3">{clockTime(ts)}</span>}
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-[15px] border-l border-accent/30 pl-4">
          <div className="text-[11.5px] text-fg-3">Sent by Experiments</div>
          <pre translate="no" className="mt-1 max-h-72 overflow-auto rounded-lg bg-bg-1 px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-fg-3">
            {body.trim()}
          </pre>
        </div>
      )}
    </div>
  );
}
