// A child session's card in its parent's conversation, under the turn that started it: its title, the agent of
// yours it works as (if one), its program, model and tier, what it is doing now, when it last did something, and a
// way in. Stop while it works.
import { ChevronRight, Square } from 'lucide-react';
import { usd } from '@shared/budget';
import type { ChildNote } from '@shared/children';
import type { SessionNote } from '@shared/features';
import { researchOf } from '@shared/research';
import { tierLabel } from '@shared/tiers';
import { AgentIcon } from '../../components/AgentIcon';
import { cx, IconButton } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { enc, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { ActivityText, StatusDot } from '../sessions/SessionList';

export function ChildCard({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const d = note.data as ChildNote;
  const s = useSessions((x) => x.byKey[d.child]);
  // In a deep research, the children are its researchers.
  const researcher = useSessions((x) => !!researchOf(x.byKey[sessionKey]?.extra));
  const a = activityOf(s);
  const busy = isBusy(a);
  const cost = s?.stats.costUsd;
  return (
    <div className="mt-3 flex items-stretch overflow-hidden rounded-2xl border border-line bg-panel">
      <button type="button" onClick={() => openSession(d.child)} className="flex min-w-0 flex-1 items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-2">
        <span className="relative mt-0.5 shrink-0">
          <AgentIcon agent={d.agent} name={s?.acpName ?? d.acpName} size={17} spinning={busy} />
          {s && <StatusDot s={s} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-panel" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-[13.5px] font-medium text-fg">{s?.title ?? d.title}</span>
            {d.tier && <span className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[11px] text-fg-2">{tierLabel(d.tier)}</span>}
            {d.as ? (
              <span translate="no" className="shrink-0 text-[11.5px] text-fg-3">
                {d.as}
              </span>
            ) : (
              <span className="shrink-0 text-[11.5px] text-fg-3">{researcher ? 'Researcher' : 'Child session'}</span>
            )}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-fg-3">
            <span className="truncate">{d.label}</span>
            <span>·</span>
            {!s ? <span>Removed</span> : a ? <ActivityText s={s} className="min-w-0" /> : <span>{s.live?.error ? 'Stopped with an error' : 'Not running'}</span>}
            {s?.updatedAt ? <span className="max-sm:hidden">· last active {ago(s.updatedAt)}</span> : null}
            {cost ? <span className="tnum">· {usd(cost)}</span> : null}
          </span>
        </span>
        <span className={cx('flex shrink-0 items-center gap-0.5 self-center text-[12.5px] font-medium text-accent')}>
          Open
          <ChevronRight size={14} />
        </span>
      </button>
      {busy && (
        <IconButton size="sm" label="Stop this child's turn" className="mr-1.5 self-center" onClick={() => post(`/api/sessions/${enc(d.child)}/interrupt`).catch(toastError)}>
          <Square size={12} />
        </IconButton>
      )}
    </div>
  );
}
