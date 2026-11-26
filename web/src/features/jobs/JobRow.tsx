// One job as a row of the Jobs page: its kind's icon with a dot for its state, its name, what it is with its session and
// project, how long it has run and has left (or what it waits for, or how it ended), its progress and last line of
// output, and on the right Output, Open and Stop (Remove once it ended).
import type { ReactNode } from 'react';
import { Activity, Bot, ChevronRight, CircleStop, FlaskConical, Hourglass, Server, SquareTerminal, X, type LucideIcon } from 'lucide-react';
import type { JobEntry, JobKind } from '@shared/jobs';
import { agentName } from '../../components/AgentIcon';
import { Meter } from '../../components/charts';
import { Button, cx, IconButton } from '../../components/ui';
import { ago } from '../../lib/format';
import { go, openProject, openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import { LOCALE } from '../../i18n/locale';
import { endedReason, endedWords, kindLabel, percent, progressText, queuePlace, runClock, startsIn, timeLeft, tookTime, waitingWords } from './words';

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

/** A job's kind as text; a subagent's names its session's program ("Claude Code subagent"). */
export function KindText({ job }: { job: JobEntry }) {
  const program = useSessions((s) => {
    if (job.kind !== 'subagent' || !job.session) return undefined;
    const x = s.byKey[job.session.key];
    if (x) return agentName(x.agent, x.acpName);
    // A session not in the list loaded: its key says whose it is, for the two programs that name it.
    const from = job.session.key.split(':')[0];
    return from === 'claude' || from === 'codex' ? agentName(from) : undefined;
  });
  return <span>{kindLabel(job.kind, program)}</span>;
}

/** Where Open goes: the job's own page, else its session; nothing when it has neither. */
export function openJob(job: JobEntry): (() => void) | undefined {
  if (job.href) return () => go(job.href!);
  if (job.session) return () => openSession(job.session!.key);
  return undefined;
}

const linkCls = 'min-w-0 truncate rounded text-left hover:text-fg hover:underline';

/** Names of other jobs, each a way to its row. */
function JobLinks({ jobs, onShow }: { jobs: JobEntry[]; onShow: (id: string) => void }) {
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

/** Facts in a line, a dot between them (those that are nothing left out). */
function Facts({ items, className }: { items: (ReactNode | false | null | undefined)[]; className?: string }) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className={cx('flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5', className)}>
      {shown.map((x, i) => (
        <span key={i} className="inline-flex max-w-full min-w-0 items-baseline gap-1.5">
          {x}
          {/* After each but the last, so a line that wraps does not begin with a dot. */}
          {i < shown.length - 1 && (
            <span aria-hidden className="text-fg-3">
              ·
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

const fullDate = (t: number) => new Date(t).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** How it stands: running for and time left; what it waits for and when it should start; or how it ended, when, and how long it took. */
function Standing({ job, now, waits, onShow }: { job: JobEntry; now: number; waits: JobEntry[]; onShow: (id: string) => void }) {
  if (job.state === 'running') {
    const left = timeLeft(job, now);
    return (
      <Facts
        className="mt-1 text-[12.5px] text-fg-2"
        items={[
          job.startedAt ? (
            <span className="tnum">
              <span>{`running for ${runClock(now - job.startedAt)}`}</span>
            </span>
          ) : (
            <span>Running</span>
          ),
          left && (
            <span className={cx('tnum', left.over ? 'text-warn' : 'text-fg')} title={left.source}>
              <span>{left.text}</span>
              {left.guess && <span className="ml-1 text-fg-3">(a guess)</span>}
            </span>
          ),
        ]}
      />
    );
  }
  if (job.state === 'queued') {
    const place = queuePlace(job);
    const other = waitingWords(job, waits.length);
    const starts = startsIn(job, now);
    return (
      <Facts
        className="mt-1 text-[12.5px] text-fg-2"
        items={[
          waits.length > 0 && (
            <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1">
              <span>Waits for</span>
              <JobLinks jobs={waits} onShow={onShow} />
            </span>
          ),
          place && <span>{place}</span>,
          other && <span>{other}</span>,
          starts && (
            <span className="tnum" title={job.estimate ? undefined : fullDate(job.startsAt!)}>
              {starts}
            </span>
          ),
        ]}
      />
    );
  }
  const reason = endedReason(job);
  const tone = job.state === 'failed' ? 'text-err' : toneState(job) === 'done' ? 'text-ok' : 'text-fg-2';
  return (
    <Facts
      className="mt-1 text-[12.5px] text-fg-3"
      items={[
        // How it ended, then why, as facts of their own ("Never started · Waited for X, which failed").
        <span className={cx('shrink-0', tone)}>{endedWords(job)}</span>,
        reason && <span className="min-w-0 break-words">{reason}</span>,
        job.endedAt && <span title={fullDate(job.endedAt)}>{ago(job.endedAt, now)}</span>,
        job.state !== 'cancelled' && job.startedAt && job.endedAt ? <span className="tnum">{`took ${tookTime(job.endedAt - job.startedAt)}`}</span> : null,
      ]}
    />
  );
}

export function JobRow({
  job,
  now,
  waits,
  then,
  marked,
  onShow,
  onOutput,
  onStop,
  onRemove,
}: {
  job: JobEntry;
  now: number;
  /** Waiting: the jobs it still waits for. */
  waits: JobEntry[];
  /** The waiting jobs that wait for it. */
  then: JobEntry[];
  /** It was just pointed at from another row. */
  marked: boolean;
  onShow: (id: string) => void;
  onOutput: () => void;
  onStop: () => void;
  onRemove: () => void;
}) {
  const ended = job.state !== 'running' && job.state !== 'queued';
  const pct = job.state === 'running' ? percent(job) : null;
  const detail = job.state === 'running' ? progressText(job) : null;
  const open = openJob(job);
  const output = !!job.output && job.state !== 'queued' && job.state !== 'cancelled';
  const { session } = job;
  return (
    <div id={`job-${job.id}`} data-job={job.id} className={cx('flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-start sm:gap-3', marked && 'find-flash')}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="relative mt-0.5 block shrink-0 text-fg-2">
          <JobIcon kind={job.kind} />
          <JobDot state={toneState(job)} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-panel" />
        </span>
        <div className="min-w-0 flex-1">
          <div translate="no" title={job.command} className="line-clamp-2 text-[13.5px] leading-snug font-medium break-words text-fg">
            {job.name}
          </div>
          <Facts
            className="mt-0.5 text-[12px] text-fg-3"
            items={[
              <KindText job={job} />,
              session && (
                <button type="button" title="Open this session" onClick={() => openSession(session.key)} className={linkCls}>
                  {session.title ? <span translate="no">{session.title}</span> : <span>Session</span>}
                </button>
              ),
              session?.project && (
                <button type="button" translate="no" onClick={() => openProject(session.project!.id)} className={linkCls}>
                  {session.project.name}
                </button>
              ),
            ]}
          />
          <Standing job={job} now={now} waits={waits} onShow={onShow} />
          {(pct != null || detail) && (
            <div className="mt-1.5 flex items-center gap-2 text-[12px] text-fg-3">
              {pct != null && (
                <>
                  <div className="max-w-80 min-w-0 flex-1" role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <Meter percent={pct} height={5} color="var(--busy)" />
                  </div>
                  <span className="tnum shrink-0 text-fg-2">{pct}%</span>
                </>
              )}
              {detail && (
                <span translate="no" className="tnum min-w-0 truncate">
                  {detail}
                </span>
              )}
            </div>
          )}
          {job.lastLine && (!ended || job.state === 'failed') && (
            <div translate="no" title={job.lastLine} className="mt-1 truncate font-mono text-[11.5px] text-fg-3">
              {job.lastLine}
            </div>
          )}
          {then.length > 0 && (
            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12px] text-fg-3">
              <span>Then:</span>
              <JobLinks jobs={then} onShow={onShow} />
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 pl-7 sm:pl-0">
        {output && (
          <Button size="sm" variant="ghost" icon={<SquareTerminal size={13} />} onClick={onOutput}>
            Output
          </Button>
        )}
        {open && (
          <Button size="sm" variant="ghost" icon={<ChevronRight size={13} />} onClick={open}>
            Open
          </Button>
        )}
        {!ended && job.stoppable && (
          <Button size="sm" variant="ghost" className="text-err hover:text-err" icon={<CircleStop size={13} />} onClick={onStop}>
            Stop
          </Button>
        )}
        {ended && (
          <IconButton size="sm" label="Remove from this list" onClick={onRemove}>
            <X size={14} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
