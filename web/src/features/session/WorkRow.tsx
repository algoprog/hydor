// One row for everything a session started: a Hydor subagent (a child session) or a background task (its program's own
// subagent, a command, a monitor, a workflow). The work tray above the message box lists them, each in this row: an icon
// with its status dot, the title (two lines at most), under it what it is, how it stands and what it cost, and on the
// right a way in and Stop while it runs. In the conversation, the subagents a turn started are one compact group instead
// (features/children/SubagentGroup), with the dot, status and Stop words of a row of its own.
import type { ReactNode } from 'react';
import { Activity, Bot, ChevronRight, CircleStop, SquareTerminal, Workflow, type LucideIcon } from 'lucide-react';
import { usd } from '@shared/budget';
import type { BackgroundTask, SessionSummary } from '@shared/types';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { findModel, modelLabel, useCatalog } from '../../components/AgentPickers';
import { cx, IconButton } from '../../components/ui';
import { isBusy, activityOf } from '../../lib/activity';
import { ago } from '../../lib/format';
import { stopSession } from '../../lib/store';
import { taskKindLabel, taskKindOf, taskState, type ProgramSub, type WorkState } from '../../lib/work';
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

/** How work stands in a state: "Working · 2m 10s", "Done · 3 min ago", "Stopped", "Failed". */
function StateStatus({ state, startedAt, endedAt, className }: { state: WorkState; startedAt?: number; endedAt?: number; className?: string }) {
  const tone = STATE_TONE[state].text;
  if (state === 'running')
    return (
      <span className={cx('flex min-w-0 items-center gap-1', tone, className)}>
        <span className="truncate">Working</span>
        {startedAt ? <span className="shrink-0">· <Elapsed since={startedAt} /></span> : null}
      </span>
    );
  const ended = endedAt ? ago(endedAt) : '';
  return <span className={cx('truncate', state === 'done' ? 'text-fg-3' : tone, className)}>{state === 'done' ? (ended ? `Done · ${ended}` : 'Done') : state === 'stopped' ? 'Stopped' : 'Failed'}</span>;
}

/** How a task stands: "Working · 2m 10s", "Done · 3 min ago", "Stopped", "Failed". */
export function TaskStatus({ t, className }: { t: BackgroundTask; className?: string }) {
  return <StateStatus state={taskState(t)} startedAt={t.startedAt} endedAt={t.endedAt} className={className} />;
}

/** How a subagent of the session's own program stands: as a task does. */
export function ProgramStatus({ sub, className }: { sub: ProgramSub; className?: string }) {
  return <StateStatus state={sub.state} startedAt={sub.startedAt} endedAt={sub.endedAt} className={className} />;
}

/** How a Hydor subagent stands: its activity while it works or waits, else "Done · 3 min ago", "Stopped" or "Failed". */
export function ChildStatus({ s, state }: { s: SessionSummary; state: WorkState }) {
  if (state === 'running' || state === 'needs') return <ActivityText s={s} className="min-w-0" />;
  if (state === 'failed') return <span className="truncate text-err">Failed</span>;
  if (state === 'stopped') return <span className="truncate text-fg-3">Stopped</span>;
  const when = s.updatedAt ? ago(s.updatedAt) : '';
  return <span className="truncate text-fg-3">{when ? `Done · ${when}` : 'Done'}</span>;
}

/** A Hydor subagent's icon: its agent's mark (turning while it works) with its status dot. A block, so the dot sits at its corner (inside an inline box Chrome puts it at the top left). */
export function ChildIcon({ s, agent, acpName }: { s?: SessionSummary; agent: SessionSummary['agent']; acpName?: string }) {
  const busy = isBusy(activityOf(s));
  return (
    <span className="relative block shrink-0">
      <AgentIcon agent={agent} name={s?.acpName ?? acpName} size={17} spinning={busy} />
      {s && <StatusDot s={s} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-panel" />}
    </span>
  );
}

/** A program subagent's icon: its lead's program mark (turning while it works) with a dot in the colours of its state. */
export function ProgramIcon({ agent, acpName, state }: { agent: SessionSummary['agent']; acpName?: string; state: WorkState }) {
  return (
    <span className="relative block shrink-0">
      <AgentIcon agent={agent} name={acpName} size={17} spinning={state === 'running'} />
      <StateDot state={state} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-panel" />
    </span>
  );
}

/** A background task's icon: its kind's, with a small dot in the colours of its state. */
export function TaskWorkIcon({ t }: { t: BackgroundTask }) {
  const state = taskState(t);
  return (
    <span className="relative block shrink-0 text-fg-2">
      <TaskIcon kind={t.kind} size={17} />
      <StateDot state={state} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-panel" />
    </span>
  );
}

/** "Hydor subagent · Claude Code · Sonnet 5.5": what a Hydor subagent (a child session) is (`model`: its model's name, as the model menu shows it). */
export const childKindLine = (s: SessionSummary, model?: string) => ['Hydor subagent', agentName(s.agent, s.acpName), model].filter(Boolean).join(' · ');

/** What a Hydor subagent's kind says on hover: who runs it. */
export const HYDOR_SUBAGENT_HINT = 'Hydor started it as a session of its own: open it to watch it or talk to it';

/** What a program's subagent says on hover: who runs it. */
export const programSubagentHint = (program: string) => `${program} runs it inside this session: open it to watch it`;

/**
 * What a subagent of the session's own program is: "Claude Code subagent · Explore · Sonnet 5.5" (its kind among its
 * program's agents, its model by the name the model menu gives it when that knows it, else as it was given).
 */
export function ProgramKind({ lead, sub }: { lead: Pick<SessionSummary, 'agent' | 'acpAgent' | 'acpName'>; sub: Pick<ProgramSub, 'type' | 'model'> }) {
  const program = agentName(lead.agent, lead.acpName);
  const cat = useCatalog(lead.agent, lead.acpAgent);
  const model = sub.model ? (findModel(cat, sub.model) ? modelLabel(cat, sub.model) : sub.model) : undefined;
  // Claude Code's default kind says nothing; Explore, Plan or one of yours does.
  const type = sub.type && !/^general[- ]purpose$/i.test(sub.type) ? sub.type : undefined;
  return (
    <>
      {/* One text, so it translates as one sentence ("{0} subagent"). */}
      <span title={programSubagentHint(program)}>{`${program} subagent`}</span>
      {type && (
        <>
          <span>·</span>
          <span translate="no" className="truncate">{type}</span>
        </>
      )}
      {model && (
        <>
          <span>·</span>
          <span translate="no" className="truncate">{model}</span>
        </>
      )}
    </>
  );
}

/** A task's kind as text ("Command", "Claude Code subagent"); a subagent's says on hover that its program runs it. */
export function TaskKindText({ kind, program }: { kind?: string; program?: string }) {
  const sub = taskKindOf(kind) === 'subagent';
  return <span title={sub && program ? programSubagentHint(program) : undefined}>{taskKindLabel(kind, program)}</span>;
}

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
  className,
}: {
  icon: ReactNode;
  title: string;
  /** What it is ("Command", "Hydor subagent · Claude Code · model"), and any chip beside it (a tier). */
  kind: ReactNode;
  status: ReactNode;
  /** A child's cost, when known (US dollars). */
  cost?: number;
  /** A line under the rest (what a child stepped up from). */
  detail?: ReactNode;
  /** Without it there is nowhere to go yet: the row cannot be opened. */
  onOpen?: () => void;
  /** The Stop button, while it runs. */
  onStop?: () => void;
  stopLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx('flex items-stretch', className)}>
      <button type="button" onClick={onOpen} disabled={!onOpen} className={cx('flex min-w-0 flex-1 items-start gap-3 px-3.5 py-2.5 text-left transition-colors', onOpen && 'hover:bg-bg-2')}>
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
        {onOpen && (
          <span className="flex shrink-0 items-center gap-0.5 self-center text-[12.5px] font-medium text-accent">
            Open
            <ChevronRight size={14} />
          </span>
        )}
      </button>
      {onStop && (
        <IconButton size="sm" label={stopLabel ?? 'Stop'} className="mr-1.5 self-center" onClick={onStop}>
          <CircleStop size={13} />
        </IconButton>
      )}
    </div>
  );
}

/** A subagent of the session's own program as a row (in the work tray). */
export function ProgramSubRow({ lead, sub, onOpen, onStop }: { lead: Pick<SessionSummary, 'agent' | 'acpAgent' | 'acpName'>; sub: ProgramSub; onOpen?: () => void; onStop?: () => void }) {
  return (
    <WorkRow
      icon={<ProgramIcon agent={lead.agent} acpName={lead.acpName} state={sub.state} />}
      title={sub.title}
      kind={<ProgramKind lead={lead} sub={sub} />}
      status={<ProgramStatus sub={sub} />}
      onOpen={onOpen}
      onStop={onStop}
      stopLabel="Stop this subagent"
    />
  );
}

/** A background task as a row: it opens in its panel, and stops (asking first) while it runs. */
export function TaskItem({ t, program, onOpen, onStop }: { t: BackgroundTask; /** The session's program ("Claude Code"): who runs a subagent task. */ program?: string; onOpen: () => void; onStop?: () => void }) {
  return <WorkRow icon={<TaskWorkIcon t={t} />} title={t.description} kind={<TaskKindText kind={t.kind} program={program} />} status={<TaskStatus t={t} />} onOpen={onOpen} onStop={onStop} stopLabel={taskKindOf(t.kind) === 'subagent' ? 'Stop this subagent' : 'Stop this task'} />;
}

/** Stops a session and everything it started: its turn, its background tasks, and its Hydor subagents, theirs in turn (the server's stop-all), shown stopped at once. */
export const stopEverything = (key: string) => stopSession(key, 'all');
