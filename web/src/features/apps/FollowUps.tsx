// Follow-ups that refine a run's result: what the person asked after the task (on the run's page or in its
// session), what the agent said back and whether it handed in a new result; and the box on the run's page
// to ask for the next change. The session's own message box does the same on the session's page.
import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Clock, Hand } from 'lucide-react';
import type { RunAsk, RunProgress } from '@shared/apps';
import { isActive } from '@shared/apps';
import { enc, post } from '../../lib/api';
import { clockTime } from '../../lib/format';
import { toastError } from '../../lib/store';
import { Markdown } from '../../components/Markdown';
import { cx, Throbber } from '../../components/ui';
import type { RunDetail } from './api';

function Bubble({ text, at, note }: { text: string; at?: number; note?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[88%] rounded-[18px] bg-bg-2 px-3.5 py-2 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap sm:max-w-[78%]">{text || 'An image'}</div>
      <div className="mr-2 text-[11.5px] text-fg-3">
        {note}
        {note && at ? ' · ' : ''}
        {clockTime(at)}
      </div>
    </div>
  );
}

/** The agent's side of one follow-up: at work on it, or its reply and whether the result changed. */
function Answer({ a, working, progress, results }: { a: RunAsk; working: boolean; progress?: RunProgress; results: boolean }) {
  const step = progress?.steps.at(-1);
  return (
    <div className="space-y-1.5">
      {a.updated && results && (
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ok">
          <Check size={14} strokeWidth={2.6} /> Updated the result
        </div>
      )}
      {working ? (
        progress?.waiting ? (
          <div className="flex items-center gap-2 text-[13px] text-warn">
            <Hand size={14} /> {progress.waiting}
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-fg-2">
            <Throbber className="shrink-0 text-[15px]" />
            <span className={cx('min-w-0 truncate', step?.status === 'running' && 'shine')}>{step?.title ?? 'Working on it…'}</span>
          </div>
        )
      ) : a.reply ? (
        <Markdown text={a.reply} className="text-[14px]" />
      ) : (
        !a.updated && <div className="text-[13px] text-fg-3">No reply</div>
      )}
    </div>
  );
}

/** The follow-ups after the task, oldest first, then those waiting for the turn running now. */
export function FollowUps({ d }: { d: RunDetail }) {
  const active = isActive(d.run.status);
  if (!d.asks.length && !d.queued.length) return null;
  const results = d.recipe.answer.length > 0;
  return (
    <section className="space-y-5 pt-2">
      <div className="flex items-center gap-3 text-[12px] font-medium text-fg-3">
        <span className="h-px flex-1 bg-line" />
        Follow-ups
        <span className="h-px flex-1 bg-line" />
      </div>
      {d.asks.map((a, i) => (
        <div key={a.id} className="space-y-2.5">
          <Bubble text={a.text} at={a.at} />
          <Answer a={a} working={active && i === d.asks.length - 1} progress={d.progress} results={results} />
        </div>
      ))}
      {d.queued.map((q) => (
        <div key={q.id} className="space-y-2.5">
          <Bubble text={q.text} at={q.at} note="waiting its turn" />
          <div className="flex items-center gap-2 text-[13px] text-fg-3">
            <Clock size={14} /> Goes to the agent when the turn running now ends
          </div>
        </div>
      ))}
    </section>
  );
}

/** The run page's box for the next follow-up; the draft is the session's own, so it carries over there. */
export function AskBox({ d, onSent }: { d: RunDetail; onSent: () => void }) {
  const key = d.run.key!;
  const draft = `wa.draft.${key}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draft) ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const active = isActive(d.run.status);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const put = (t: string) => {
    setText(t);
    try {
      if (t) localStorage.setItem(draft, t);
      else localStorage.removeItem(draft);
    } catch {}
  };
  // The box grows with its text, up to a third of the screen.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.33))}px`;
  }, [text]);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await post(`/api/apps/runs/${enc(d.run.id)}/ask`, { text: t });
      put('');
      onSent();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const can = !!text.trim() && !busy;
  return (
    <div className="shrink-0 px-3 pt-2 pb-[max(10px,var(--safe-bottom))] sm:px-6 sm:pb-4">
      <div className="mx-auto flex max-w-[860px] items-end gap-1 rounded-[22px] border border-line-2 bg-panel py-1.5 pr-1.5 pl-4 shadow-[0_8px_30px_rgba(0,0,0,0.10)] transition-colors focus-within:border-accent/50">
        <textarea
          ref={ta}
          rows={1}
          value={text}
          autoComplete="off"
          data-1p-ignore=""
          data-lpignore="true"
          onChange={(e) => put(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (!touch || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={active ? 'Ask for another change…' : d.recipe.answer.length ? 'Ask for a change to the result…' : 'Ask for a change…'}
          className="block max-h-[33vh] min-h-[40px] min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed outline-none placeholder:text-fg-3 focus-visible:outline-none"
        />
        <button
          onClick={send}
          disabled={!can}
          title="Send (Enter)"
          aria-label="Send"
          className={cx('group mb-px inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-200 active:scale-90', can ? 'bg-accent text-accent-fg hover:opacity-90' : 'bg-bg-3 text-fg-3')}
        >
          {busy ? <Throbber /> : <ArrowUp size={16} strokeWidth={2.4} />}
        </button>
      </div>
    </div>
  );
}
