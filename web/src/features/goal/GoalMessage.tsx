// A message the app's goal loop sent to the agent (shared/goals.ts goalMessageOf), drawn as one slim row in the conversation:
// the target icon and what it is for ("Goal · round 5 of 12"). Its text is a click away. No bubble, and nothing to edit.
import { useState } from 'react';
import { ChevronRight, Target } from 'lucide-react';
import { cx } from '../../components/ui';
import { clockTime } from '../../lib/format';

export function GoalMessage({ ts, message }: { ts?: number; message: { head: string; body: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-i18n="goal" className="tl-item">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <Target size={14} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">
          <span className="font-medium text-fg">Goal</span>
          {message.head && <span> · {message.head}</span>}
        </span>
        {ts != null && <span className="shrink-0 text-[11px] text-fg-3">{clockTime(ts)}</span>}
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-[15px] border-l border-accent/30 pl-4">
          <div className="text-[11.5px] text-fg-3">Sent by the app’s goal loop</div>
          <pre translate="no" className="mt-1 max-h-72 overflow-auto rounded-lg bg-bg-1 px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-fg-3">
            {message.body.trim()}
          </pre>
        </div>
      )}
    </div>
  );
}
