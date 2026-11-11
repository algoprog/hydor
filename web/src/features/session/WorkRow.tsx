// One row for everything a session started: a child session or a background task (a subagent, a command, a monitor, a
// workflow). The work tray above the message box lists them, and a child's card in the conversation is the same row in
// a card, so the two look alike: an icon with its status dot, the title (two lines at most), under it what it is, how
// it stands and what it cost, and on the right a way in and Stop while it runs.
import type { ReactNode } from 'react';
import { Activity, Bot, ChevronRight, Square, SquareTerminal, Workflow, type LucideIcon } from 'lucide-react';
import { usd } from '@shared/budget';
import type { BackgroundTask, SessionSummary } from '@shared/types';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { cx, IconButton } from '../../components/ui';
import { isBusy, activityOf } from '../../lib/activity';
import { enc, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { toastError } from '../../lib/store';
import { taskKindLabel, taskKindOf, taskState, type WorkState } from '../../lib/work';
import { ActivityText, StatusDot } from '../sessions/SessionList';
import { Elapsed } from './items';

const KIND_ICON: Record<ReturnType<typeof taskKindOf>, LucideIcon> = { subagent: Bot, command: SquareTerminal, monitor: Activity, workflow: Workflow, task: SquareTerminal };

/** The tones of a state, as the session header's status pill has them: working blue, needs you amber, done green. */
export const STATE_TONE: Record<WorkState, { text: string; dot: string }> = {
  needs: { text: 'text-warn', dot: 'bg-warn' },
  running: { text: 'text-busy', dot: 'bg-busy' },
  done: { text: 'text-ok', dot: 'bg-ok' },
  stopped: { text: 'text-fg-3', dot: 'bg-fg-3' },
  failed: { text: 'text-err', dot: 'bg-err' },
};

/** A small dot in a state's colour; it breathes while the work runs. */
export function StateDot({ state, small, className }: { state: WorkState; small?: boolean; className?: string }) {
  return <span className={cx('inline-block shrink-0 rounded-full', small ? 'h-1.5 w-1.5' : 'h-2 w-2', STATE_TONE[state].dot, state === 'running' && 'breathe', className)} aria-hidden />;
}

/** The icon of a kind of background task. */
export function TaskIcon({ kind, size = 16, className }: { kind?: string; size?: number; className?: string }) {
  const Icon = KIND_ICON[taskKindOf(kind)];
  return <Icon size={size} className={cx('shrink-0', className)} aria-hidden />;
}

/** How a task stands: "Working · 2m 10s", "Done · 3 min ago", "Stopped", "Failed". */
export function TaskStatus({ t, className }: { t: BackgroundTask; className?: string }) {
  const state = taskState(t);
  const tone = STATE_TONE[state].text;
  if (state === 'running')
    return (
      <span className={cx('flex min-w-0 items-center gap-1', tone, className)}>
        <span className="truncate">Working</span>
        {t.startedAt ? <span className="shrink-0">· <Elapsed since={t.startedAt} /></span> : null}
      </span>
    );
  const ended = t.endedAt ? ago(t.endedAt) : '';
  return <span className={cx('truncate', state === 'done' ? 'text-fg-3' : tone, className)}>{state === 'done' ? (ended ? `Done · ${ended}` : 'Done') : state === 'stopped' ? 'Stopped' : 'Failed'}</span>;
}

/** How a child session stands: its activity while it works or waits, else "Done · 3 min ago", "Stopped" or "Failed". */
export function ChildStatus({ s, state }: { s: SessionSummary; state: WorkState }) {
  if (state === 'running' || state === 'needs') return <ActivityText s={s} className="min-w-0" />;
  if (state === 'failed') return <span className="truncate text-err">Failed</span>;
  if (state === 'stopped') return <span className="truncate text-fg-3">Stopped</span>;
  const when = s.updatedAt ? ago(s.updatedAt) : '';
  return <span className="truncate text-fg-3">{when ? `Done · ${when}` : 'Done'}</span>;
}

/** A child session's icon: its agent's mark (turning while it works) with its status dot. */
export function ChildIcon({ s, agent, acpName }: { s?: SessionSummary; agent: SessionSummary['agent']; acpName?: string }) {
  const busy = isBusy(activityOf(s));
  return (
    <span className="relative shrink-0">
      <AgentIcon agent={agent} name={s?.acpName ?? acpName} size={17} spinning={busy} />
      {s && <StatusDot s={s} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-panel" />}
    </span>
  );
}

/** A background task's icon: its kind's, with a small dot in the colours of its state. */
export function TaskWorkIcon({ t }: { t: BackgroundTask }) {
  const state = taskState(t);
  return (
    <span className="relative shrink-0 text-fg-2">
      <TaskIcon kind={t.kind} size={17} />
      <StateDot state={state} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-panel" />
    </span>
  );
}

/** "Helper session · Claude Code · Sonnet 5.5": what a child session is (`model`: its model's name, as the model menu shows it). */
export const childKindLine = (s: SessionSummary, model?: string) => ['Helper session', agentName(s.agent, s.acpName), model].filter(Boolean).join(' · ');

export function WorkRow({
  icon,
  title,
  kind,
  status,
  cost,
  detail,
  onOpen,
  onStop,
  stopLabel,
  card,
  className,
}: {
  icon: ReactNode;
  title: string;
  /** What it is ("Command", "Helper session · Claude Code · model"), and any chip beside it (a tier). */
  kind: ReactNode;
  status: ReactNode;
  /** A child's cost, when known (US dollars). */
  cost?: number;
  /** A line under the rest (what a child stepped up from). */
  detail?: ReactNode;
  onOpen: () => void;
  /** The Stop button, while it runs. */
  onStop?: () => void;
  stopLabel?: string;
  /** In the conversation: its own card, as the rest of the page's cards are. */
  card?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('flex items-stretch', card && 'mt-3 overflow-hidden rounded-2xl border border-line bg-panel', className)}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span translate="no" className="line-clamp-2 text-[13.5px] leading-snug font-medium text-fg">
            {title}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-fg-3">
            {kind}
            <span>·</span>
            {status}
            {cost ? <span className="tnum">· {usd(cost)}</span> : null}
          </span>
          {detail}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 self-center text-[12.5px] font-medium text-accent">
          Open
          <ChevronRight size={14} />
        </span>
      </button>
      {onStop && (
        <IconButton size="sm" label={stopLabel ?? 'Stop'} className="mr-1.5 self-center" onClick={onStop}>
          <Square size={12} />
        </IconButton>
      )}
    </div>
  );
}

/** A background task as a row: it opens in its panel, and stops (asking first) while it runs. */
export function TaskItem({ t, onOpen, onStop }: { t: BackgroundTask; onOpen: () => void; onStop?: () => void }) {
  return <WorkRow icon={<TaskWorkIcon t={t} />} title={t.description} kind={<span>{taskKindLabel(t.kind)}</span>} status={<TaskStatus t={t} />} onOpen={onOpen} onStop={onStop} stopLabel="Stop this task" />;
}

/** Stops a session and everything it started: its turn, its background tasks, and its child sessions, theirs in turn (the server's stop-all). */
export const stopEverything = (key: string) => post(`/api/sessions/${enc(key)}/stop-all`).catch(toastError);
