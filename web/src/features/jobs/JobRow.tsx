// One job as a row of the Jobs page, compact: its kind's icon with a dot for its state, its name and tags, how long it
// has run (or what it waits for, or how it ended) with its session and project, the last line of its output, and on the
// right (below, on a phone) its progress and time left, or when it should start. The whole row opens its panel; ⋯ has
// what else can be done with it.
import { useRef, useState, type ReactNode } from 'react';
import { Activity, Bot, CircleStop, FlaskConical, Hourglass, MoreHorizontal, PanelRight, Server, SquareArrowOutUpRight, SquareTerminal, Tag, X, type LucideIcon } from 'lucide-react';
import type { JobEntry, JobKind } from '@shared/jobs';
import { agentName } from '../../components/AgentIcon';
import { Meter } from '../../components/charts';
import { cx, IconButton, MenuItem, MenuSep, Popover } from '../../components/ui';
import { ago } from '../../lib/format';
import { go, openProject, openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import { LOCALE } from '../../i18n/locale';
import { TagPills } from './TagPill';
import { projectOf } from './tags';
import { endedReason, endedWords, kindLabel, percent, progressText, queuePlace, runClock, startsIn, timeLeft, tookTime, waitingWords, type TimeLeft } from './words';

const ICONS: Record<JobKind, LucideIcon> = { command: SquareTerminal, monitor: Activity, subagent: Bot, 'hydor-subagent': Bot, experiment: FlaskConical, job: Hourglass, server: Server, task: SquareTerminal };

export function JobIcon({ kind, size = 17, className }: { kind: JobKind; size?: number; className?: string }) {
  const Icon = ICONS[kind] ?? SquareTerminal;
  return <Icon size={size} className={cx('shrink-0', className)} aria-hidden />;
}

/** A job's state for its colour: one that ended with nobody seeing how is neither done nor failed. */
export const toneState = (job: JobEntry): JobEntry['state'] => (job.exitUnknown ? 'stopped' : job.state);

/** The dot of a state: blue and breathing while it runs, hollow while it waits. */
export function JobDot({ state, className }: { state: JobEntry['state']; className?: string }) {
  const tone = state === 'running' ? 'bg-busy breathe' : state === 'done' ? 'bg-ok' : state === 'failed' ? 'bg-err' : state === 'queued' ? 'border border-fg-3 bg-panel' : 'bg-fg-3';
  return <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', tone, className)} aria-hidden />;
}

/** A job's kind in words; a subagent's names its session's program ("Claude Code subagent"). */
export function useKindLabel(job: JobEntry): string {
  const program = useSessions((s) => {
    if (job.kind !== 'subagent' || !job.session) return undefined;
    const x = s.byKey[job.session.key];
    if (x) return agentName(x.agent, x.acpName);
    // A session not in the list loaded: its key says whose it is, for the two programs that name it.
    const from = job.session.key.split(':')[0];
    return from === 'claude' || from === 'codex' ? agentName(from) : undefined;
  });
  return kindLabel(job.kind, program);
}

/** Where Open goes: the job's own page, else its session; nothing when it has neither. */
export function openJob(job: JobEntry): (() => void) | undefined {
  if (job.href) return () => go(job.href!);
  if (job.session) return () => openSession(job.session!.key);
  return undefined;
}

export const openWords = (job: JobEntry): string => (job.kind === 'experiment' ? 'Open run' : 'Open session');

export const isEnded = (job: JobEntry): boolean => job.state !== 'running' && job.state !== 'queued';

/** Whether tags can be given to it: a job of the `job` command, or work of a session (whose tags it then sets). */
export const taggable = (job: JobEntry): boolean => job.id.startsWith('job:') || !!job.session;

export const linkCls = 'min-w-0 truncate rounded text-left hover:text-fg hover:underline';

/** Names of other jobs, each a way to its row. */
export function JobLinks({ jobs, onShow }: { jobs: JobEntry[]; onShow: (id: string) => void }) {
  return (
    <>
      {jobs.map((j, i) => (
        <span key={j.id} className="inline-flex min-w-0 items-baseline">
          <button type="button" translate="no" onClick={() => onShow(j.id)} className="min-w-0 truncate rounded text-left font-medium text-fg hover:underline">
            {j.name}
          </button>
          {i < jobs.length - 1 && <span translate="no">,</span>}
        </span>
      ))}
    </>
  );
}

type Items = (ReactNode | false | null | undefined)[];

/** Facts with a dot between them (those that are nothing left out): how it stands, then where it is from. On a phone each
 *  of the two is a line of its own; on a computer they run on as one. */
function Facts({ how, where }: { how: Items; where: Items }) {
  const first = how.filter(Boolean);
  const second = where.filter(Boolean);
  const line = (items: ReactNode[], more: boolean) => (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 sm:contents">
      {items.map((x, i) => (
        <span key={i} className="inline-flex max-w-full min-w-0 items-baseline gap-1.5">
          {x}
          {/* After each but the last, so a line that wraps does not begin with a dot. */}
          {i < items.length - 1 ? <span aria-hidden>·</span> : more && <span aria-hidden className="max-sm:hidden">·</span>}
        </span>
      ))}
    </div>
  );
  return (
    <div className="mt-0.5 min-w-0 text-[12px] leading-[18px] text-fg-3 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-1.5">
      {first.length > 0 && line(first, second.length > 0)}
      {second.length > 0 && line(second, false)}
    </div>
  );
}

/** A session's title and a project (by default, the session's; null: none), each a link; either may be left out. */
export function sessionLinks(session: JobEntry['session'], project: JobEntry['project'] | null = session?.project): ReactNode[] {
  return [
    session && (
      <button type="button" title="Open this session" onClick={() => openSession(session.key)} className={linkCls}>
        {session.title ? <span translate="no">{session.title}</span> : <span>Session</span>}
      </button>
    ),
    project && (
      <button type="button" translate="no" onClick={() => openProject(project.id)} className={linkCls}>
        {project.name}
      </button>
    ),
  ].filter(Boolean);
}

/** The same, as a line with a dot between them (a group's header); `noProject` when the page says the project already. */
export function SessionLinks({ session, noProject }: { session: NonNullable<JobEntry['session']>; noProject?: boolean }) {
  return (
    <>
      {sessionLinks(session, noProject ? null : session.project).map((x, i) => (
        <span key={i} className="inline-flex min-w-0 items-baseline gap-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          {x}
        </span>
      ))}
    </>
  );
}

export const fullDate = (t: number) => new Date(t).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** How it stands: how long it has run; what it waits for; or how it ended, when, and how long it took. */
function standing(job: JobEntry, now: number, waits: JobEntry[], onShow: (id: string) => void): ReactNode[] {
  if (job.state === 'running') {
    return [job.startedAt ? <span className="tnum shrink-0">{`running for ${runClock(now - job.startedAt)}`}</span> : <span>Running</span>];
  }
  if (job.state === 'queued') {
    const place = queuePlace(job);
    const other = waitingWords(job, waits.length);
    return [
      waits.length > 0 && (
        <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1">
          <span>Waits for</span>
          <JobLinks jobs={waits} onShow={onShow} />
        </span>
      ),
      place && <span>{place}</span>,
      other && <span>{other}</span>,
    ];
  }
  const reason = endedReason(job);
  const tone = job.state === 'failed' ? 'text-err' : toneState(job) === 'done' ? 'text-ok' : 'text-fg-2';
  // How it ended, then why, as facts of their own ("Never started · Waited for X, which failed").
  return [
    <span className={cx('shrink-0', tone)}>{endedWords(job)}</span>,
    reason && <span className="min-w-0 break-words">{reason}</span>,
    job.endedAt && <span title={fullDate(job.endedAt)}>{ago(job.endedAt, now)}</span>,
    job.state !== 'cancelled' && job.startedAt && job.endedAt ? <span className="tnum">{`took ${tookTime(job.endedAt - job.startedAt)}`}</span> : null,
  ];
}

function Left({ left }: { left: TimeLeft }) {
  return (
    <span className={cx('tnum', left.over ? 'text-warn' : 'text-fg-2')} title={left.source}>
      <span>{left.text}</span>
      {left.guess && <span className="ml-1 text-fg-3">(a guess)</span>}
    </span>
  );
}

/** The right of a row at work: progress and time left, or when a waiting one should start. Nothing when neither is known. */
function Ahead({ job, now }: { job: JobEntry; now: number }) {
  // Beside the text on a computer, under it on a phone.
  const box = 'mt-1.5 text-[12px] sm:mt-0 sm:w-40 sm:shrink-0 sm:self-center sm:text-right';
  if (job.state === 'queued') {
    const starts = startsIn(job, now);
    return starts ? (
      <div className={cx(box, 'tnum text-fg-3 max-sm:mt-0.5')} title={job.estimate || !job.startsAt ? undefined : fullDate(job.startsAt)}>
        {starts}
      </div>
    ) : null;
  }
  if (job.state !== 'running') return null;
  const pct = percent(job);
  const left = timeLeft(job, now);
  const detail = left ? null : progressText(job);
  if (pct == null && !left && !detail) return null;
  return (
    <div className={cx(box, 'max-sm:flex max-sm:max-w-80 max-sm:items-center max-sm:gap-3')}>
      {pct != null && (
        <div className="flex items-center gap-2 max-sm:min-w-0 max-sm:flex-1">
          <div className="min-w-0 flex-1" role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            {/* The job's own count ("6,200/10,000") on hover, as it wrote it. */}
            <div translate="no" title={progressText(job) ?? undefined}>
              <Meter percent={pct} height={5} color="var(--busy)" />
            </div>
          </div>
          <span className="tnum w-8 shrink-0 text-right text-fg-2">{pct}%</span>
        </div>
      )}
      {(left || detail) && (
        <div className={cx('text-fg-3 max-sm:shrink-0', pct != null && 'sm:mt-1')}>
          {left ? (
            <Left left={left} />
          ) : (
            <span translate="no" title={detail!} className="tnum block truncate">
              {detail}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface RowActions {
  onShow: (id: string) => void;
  onDetails: (job: JobEntry) => void;
  onTags: (job: JobEntry) => void;
  onStop: (job: JobEntry) => void;
  onRemove: (job: JobEntry) => void;
}

function RowMenu({ job, actions }: { job: JobEntry; actions: RowActions }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const link = openJob(job);
  const ended = isEnded(job);
  const pick = (run: () => void) => () => {
    setOpen(false);
    run();
  };
  return (
    <>
      <IconButton ref={btn} size="sm" label="More" aria-haspopup aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cx('hover:!bg-bg-3', open && 'bg-bg-3 text-fg')}>
        <MoreHorizontal size={16} />
      </IconButton>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={230}>
        <MenuItem icon={<PanelRight size={15} />} onClick={pick(() => actions.onDetails(job))}>
          Details and output
        </MenuItem>
        {link && (
          <MenuItem icon={<SquareArrowOutUpRight size={15} />} onClick={pick(link)}>
            {openWords(job)}
          </MenuItem>
        )}
        {taggable(job) && (
          <MenuItem icon={<Tag size={15} />} onClick={pick(() => actions.onTags(job))}>
            Edit tags…
          </MenuItem>
        )}
        {!ended && job.stoppable && (
          <>
            <MenuSep />
            <MenuItem danger icon={<CircleStop size={15} />} onClick={pick(() => actions.onStop(job))}>
              Stop
            </MenuItem>
          </>
        )}
        {ended && (
          <>
            <MenuSep />
            <MenuItem icon={<X size={15} />} onClick={pick(() => actions.onRemove(job))}>
              Remove from this list
            </MenuItem>
          </>
        )}
      </Popover>
    </>
  );
}

export function JobRow({
  job,
  now,
  waits,
  then,
  marked,
  grouped,
  sessionShown,
  projectShown,
  actions,
}: {
  job: JobEntry;
  now: number;
  /** Waiting: the jobs it still waits for. */
  waits: JobEntry[];
  /** The waiting jobs that wait for it. */
  then: JobEntry[];
  /** It was just pointed at from another row. */
  marked: boolean;
  /** It sits under its first tag's header, which says that tag already. */
  grouped?: boolean;
  /** Its group's header names its session (all of the group comes from it). */
  sessionShown?: boolean;
  /** It is on its project's page, which says the project already. */
  projectShown?: boolean;
  actions: RowActions;
}) {
  const kind = useKindLabel(job);
  const ended = isEnded(job);
  const tags = (job.tags ?? []).slice(grouped ? 1 : 0);
  const { session } = job;
  const nameId = `job-name-${job.id}`;
  return (
    <div
      id={`job-${job.id}`}
      data-job={job.id}
      role="button"
      tabIndex={0}
      aria-labelledby={nameId}
      onClick={(e) => {
        const at = e.target as HTMLElement;
        // Its links and buttons do their own thing; so does its menu, which is drawn outside the row.
        if (!e.currentTarget.contains(at) || at.closest('button') || window.getSelection()?.toString()) return;
        actions.onDetails(job);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        actions.onDetails(job);
      }}
      className={cx(
        'flex cursor-pointer items-start gap-3 py-2.5 pr-2 pl-3.5 transition-colors outline-none hover:bg-bg-2/50 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset',
        marked && 'find-flash',
      )}
    >
      <span className="relative mt-0.5 block shrink-0 text-fg-2" title={kind}>
        <JobIcon kind={job.kind} />
        <JobDot state={toneState(job)} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-panel" />
      </span>
      <div className="min-w-0 flex-1 sm:flex sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span id={nameId} translate="no" title={job.command ? `${job.name}\n${job.command}` : job.name} className="max-w-full min-w-0 truncate text-[13.5px] leading-5 font-medium text-fg">
              {job.name}
            </span>
            <TagPills tags={tags} />
          </div>
          <Facts
            how={standing(job, now, waits, actions.onShow)}
            where={sessionShown ? [] : sessionLinks(session, projectShown ? null : projectOf(job))}
          />
          {job.lastLine && (!ended || job.state === 'failed') && (
            <div translate="no" title={job.lastLine} className="mt-0.5 truncate font-mono text-[11.5px] leading-[18px] text-fg-3">
              {job.lastLine}
            </div>
          )}
          {then.length > 0 && (
            <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12px] leading-[18px] text-fg-3">
              <span>Then:</span>
              <JobLinks jobs={then} onShow={actions.onShow} />
            </div>
          )}
        </div>
        <Ahead job={job} now={now} />
      </div>
      <div className="shrink-0 self-center max-sm:self-start">
        <RowMenu job={job} actions={actions} />
      </div>
    </div>
  );
}
