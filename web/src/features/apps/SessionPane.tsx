// An app's run in its session's page: the result the app shows, with what was asked and the follow-ups,
// in place of the conversation until you switch to it. The session's own message box asks for changes,
// and what the agent needs from you (an approval) shows here too.
import { useEffect, useRef } from 'react';
import { Hand, MessagesSquare } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { ago } from '../../lib/format';
import { go } from '../../lib/nav';
import { useLive } from '../../lib/store';
import { Button, Empty, Throbber } from '../../components/ui';
import { ApprovalCard } from '../session/Approval';
import { useSessionShow } from '../session/show';
import { appPath, SOURCE_LABEL, useRunDetail } from './api';
import { AppIcon } from './AppIcon';
import { RunView } from './RunPage';

/** The app run a session was started for, if it was. */
export const runOfSession = (s: SessionSummary) => (s.extra?.app as { run?: string } | undefined)?.run;

export function AppSessionPane({ s }: { s: SessionSummary }) {
  const { d, err, load } = useRunDetail(runOfSession(s)!);
  const approvals = useLive((x) => x.byKey[s.key]?.overlay?.approvals) ?? [];
  const status = useLive((x) => x.byKey[s.key]?.live?.status);
  const scroller = useRef<HTMLDivElement>(null);
  const conversation = () => useSessionShow.getState().show(s.key, 'conversation');
  // The run's own news comes over the live connection; the session going to work or stopping, and a
  // message sent from the box below, are worth a look of their own.
  const was = useRef(status);
  useEffect(() => {
    if (was.current === status) return;
    was.current = status;
    load();
  }, [status, load]);
  useEffect(() => {
    const sent = () => [500, 2000].forEach((ms) => setTimeout(load, ms));
    window.addEventListener('wa:follow', sent);
    return () => window.removeEventListener('wa:follow', sent);
  }, [load]);
  // A follow-up sent from the box below (or one more waiting its turn): the end, where it shows.
  const count = d ? d.asks.length + d.queued.length : -1;
  const seen = useRef(-1);
  useEffect(() => {
    if (count < 0) return;
    if (seen.current >= 0 && count > seen.current) requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }));
    seen.current = count;
  }, [count]);
  if (err && !d)
    return (
      <Empty title="This run could not be opened">
        {err}
        <div className="mt-3">
          <Button size="sm" icon={<MessagesSquare size={14} />} onClick={conversation}>
            Show the conversation
          </Button>
        </div>
      </Empty>
    );
  if (!d)
    return (
      <div className="flex flex-1 items-center justify-center text-fg-3">
        <Throbber size={30} />
      </div>
    );
  const app = d.slug || d.run.app.startsWith('tpl:') ? appPath(d.run.app) : null;
  // Waiting with nothing to approve here: a question, which the conversation answers.
  const question = d.run.status === 'waiting' && !approvals.length;
  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable_both-edges]">
      {/* As wide as the session's message box under it, like the conversation (Timeline). */}
      <div className="mx-auto w-full max-w-[848px] space-y-3 px-3 pt-4 pb-8 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 px-0.5">
          <AppIcon icon={d.recipe.icon} color={d.recipe.color} size={22} />
          {app ? (
            <button onClick={() => go(app)} className="min-w-0 truncate text-[13.5px] font-semibold transition-colors hover:text-accent" title="Open the app">
              {d.recipe.name}
            </button>
          ) : (
            <span className="min-w-0 truncate text-[13.5px] font-semibold">{d.recipe.name}</span>
          )}
          <span className="shrink-0 truncate text-[12.5px] text-fg-3">
            · {SOURCE_LABEL[d.run.source]} · {ago(d.run.createdAt)}
          </span>
        </div>
        <RunView d={d} />
        {approvals.map((a) => (
          <ApprovalCard key={a.id} a={a} sessionKey={s.key} agent={s.agent} id={`approval-${a.id}`} />
        ))}
        {question && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-warn/40 bg-panel px-4 py-3">
            <Hand size={16} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1 text-[13.5px]">It has a question for you.</span>
            <Button size="sm" variant="primary" onClick={conversation}>
              Answer it
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
