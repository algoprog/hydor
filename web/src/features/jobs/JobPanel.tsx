// One job in a panel over the right of the page (the whole screen on a phone): its name, tags and how it stands, the
// ways to its session and to stop it, what is known of it, its command, and the end of its output, read again every
// three seconds while it runs. The newest lines stay in view unless you scroll up.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil, Square, SquareArrowOutUpRight, X } from 'lucide-react';
import type { JobEntry, JobLog } from '@shared/jobs';
import { api, enc } from '../../lib/api';
import { openProject, openSession } from '../../lib/nav';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, IconButton, Sheet, Throbber } from '../../components/ui';
import { fullDate, JobDot, JobIcon, JobLinks, linkCls, openJob, openWords, toneState, useKindLabel } from './JobRow';
import { TagPills } from './TagPill';
import { projectOf } from './tags';
import { allDoneWords, endedReason, progressText, percent, queuePlace, runClock, startsIn, stateWords, timeLeft, tookTime, waitingWords } from './words';

/** One of the details: its label and what it is; `wide` takes the whole row. */
function Detail({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cx('flex min-w-0 items-baseline gap-2', wide && 'sm:col-span-2')}>
      <dt className="w-21 shrink-0 text-fg-3">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-fg-2">{children}</dd>
    </div>
  );
}

/** What is known of a job, only what it has. */
function Details({ job, now, waits, then, onShow }: { job: JobEntry; now: number; waits: JobEntry[]; then: JobEntry[]; onShow: (id: string) => void }) {
  const { session } = job;
  const project = projectOf(job);
  const running = job.state === 'running';
  const queued = job.state === 'queued';
  const left = timeLeft(job, now);
  // "in about 25 min", after its label; one that is due says what the row says.
  const starts = queued && job.startsAt ? (allDoneWords(job.startsAt, now) ?? startsIn(job, now)) : null;
  const pct = running ? percent(job) : null;
  const text = running ? progressText(job) : null;
  const queue = queuePlace(job) ?? job.queue;
  const waiting = queued ? waitingWords(job, waits.length) : null;
  const reason = endedReason(job);
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
      {session && (
        <Detail label="Session">
          <button type="button" onClick={() => openSession(session.key)} className={cx(linkCls, 'block max-w-full')}>
            {session.title ? <span translate="no">{session.title}</span> : <span>Session</span>}
          </button>
        </Detail>
      )}
      {project && (
        <Detail label="Project">
          <button type="button" translate="no" onClick={() => openProject(project.id)} className={cx(linkCls, 'block max-w-full')}>
            {project.name}
          </button>
        </Detail>
      )}
      {job.cwd && (
        <Detail label="Folder" wide>
          <div translate="no" title={job.cwd} className="truncate font-mono text-[11.5px]">
            {job.cwd}
          </div>
        </Detail>
      )}
      {job.startedAt && (
        <Detail label="Started">
          <span translate="no" className="tnum">
            {fullDate(job.startedAt)}
          </span>
        </Detail>
      )}
      {running && job.startedAt ? (
        <Detail label="Running for">
          <span className="tnum">{runClock(now - job.startedAt)}</span>
        </Detail>
      ) : job.endedAt ? (
        <Detail label="Ended">
          <span translate="no" className="tnum">
            {fullDate(job.endedAt)}
          </span>
        </Detail>
      ) : null}
      {job.state !== 'cancelled' && job.startedAt && job.endedAt ? (
        <Detail label="Took">
          <span className="tnum">{tookTime(job.endedAt - job.startedAt)}</span>
        </Detail>
      ) : null}
      {left && (
        <Detail label="Time left" wide>
          <span className={cx('tnum', left.over ? 'text-warn' : 'text-fg')}>{left.text}</span>
          {left.guess && <span className="ml-1 text-fg-3">(a guess)</span>}
          <span className="block text-[12px] text-fg-3">{left.source}</span>
        </Detail>
      )}
      {(pct != null || text) && (
        <Detail label="Progress">
          {pct != null && <span className="tnum">{pct}%</span>}
          {pct != null && text && <span translate="no"> · </span>}
          {text && (
            <span translate="no" className="tnum">
              {text}
            </span>
          )}
        </Detail>
      )}
      {queue && (
        <Detail label="Queue">
          <span translate={queuePlace(job) ? undefined : 'no'}>{queue}</span>
        </Detail>
      )}
      {starts && (
        <Detail label="Starts">
          <span className="tnum">{starts}</span>
        </Detail>
      )}
      {(waits.length > 0 || waiting) && (
        <Detail label={queued ? 'Waits for' : 'Waited for'} wide>
          {waits.length > 0 && (
            <span className="flex min-w-0 flex-wrap gap-x-1">
              <JobLinks jobs={waits} onShow={onShow} />
            </span>
          )}
          {waiting && <span className="block">{waiting}</span>}
        </Detail>
      )}
      {then.length > 0 && (
        <Detail label="Then" wide>
          <span className="flex min-w-0 flex-wrap gap-x-1">
            <JobLinks jobs={then} onShow={onShow} />
          </span>
        </Detail>
      )}
      {job.exitCode != null && (
        <Detail label="Exit code">
          <span translate="no" className="tnum">
            {job.exitCode}
          </span>
        </Detail>
      )}
      {reason && (
        <Detail label="Reason" wide>
          <span>{reason}</span>
        </Detail>
      )}
    </dl>
  );
}

/** The end of its output. */
function Output({ job }: { job: JobEntry }) {
  const [log, setLog] = useState<JobLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const running = job.state === 'running';

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const load = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const l = await api<JobLog>(`/api/jobs/${enc(job.id)}/log`);
          if (alive) {
            setLog(l);
            setError(null);
          }
        } catch (e) {
          if (alive) setError((e as Error).message);
        }
      }
      // Once it has ended, this one last look at what it left is the whole of it.
      if (alive && running) timer = window.setTimeout(load, 3000);
    };
    void load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [job.id, running]);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <>
      <div className="flex shrink-0 items-baseline gap-2 border-t border-line px-4 py-2">
        <h3 className="text-[12.5px] font-semibold text-fg">Output</h3>
        {log?.truncated && <span className="text-[12px] text-fg-3">latest output</span>}
      </div>
      {log && error && <div className="shrink-0 px-4 pb-1.5 text-[12px] text-warn">{error}</div>}
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="min-h-40 flex-1 overflow-auto border-t border-line bg-[var(--term-bg)] pb-[var(--safe-bottom)]"
      >
        {!log ? (
          <div className="p-4 text-[13px] text-fg-3">{error ? error : <Throbber />}</div>
        ) : !log.text.trim() ? (
          <div className="p-4 text-[13px] text-fg-3">No output yet.</div>
        ) : (
          <div translate="no" className="term-out min-h-full px-4 py-3">
            {log.text}
          </div>
        )}
      </div>
    </>
  );
}

export function JobPanel({
  job,
  now,
  waits,
  then,
  onShow,
  onTags,
  onStop,
  onClose,
}: {
  job: JobEntry;
  now: number;
  /** The jobs it waits for, or waited for. */
  waits: JobEntry[];
  /** The waiting jobs that wait for it. */
  then: JobEntry[];
  /** Closes the panel and points at another job's row. */
  onShow: (id: string) => void;
  onTags: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const kind = useKindLabel(job);
  const state = toneState(job);
  const tone = state === 'running' ? 'text-busy' : state === 'done' ? 'text-ok' : state === 'failed' ? 'text-err' : 'text-fg-3';
  const link = openJob(job);
  const tags = job.tags ?? [];
  const live = job.state === 'running' || job.state === 'queued';
  const started = job.state !== 'queued' && job.state !== 'cancelled';
  return (
    <Sheet open onClose={onClose} label="Job details" width={640}>
      <div data-i18n="jobs" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-line px-4 pt-[max(12px,var(--safe-top))] pb-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-fg-2" title={kind}>
              <JobIcon kind={job.kind} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div translate="no" className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight break-words">
                {job.name}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3">
                <span className={cx('inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full bg-bg-2 px-2 text-[12px] font-medium', tone)}>
                  <JobDot state={state} className="!h-1.5 !w-1.5" />
                  <span>{stateWords(job)}</span>
                </span>
                <span>{kind}</span>
                {job.state === 'running' && job.startedAt ? <span className="tnum">{`running for ${runClock(now - job.startedAt)}`}</span> : null}
              </div>
            </div>
            <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-1.5">
              <X size={17} />
            </IconButton>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[30px]">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {tags.length ? <TagPills tags={tags} /> : <span className="text-[12px] text-fg-3">No tags</span>}
                <IconButton size="sm" label="Edit tags" onClick={onTags}>
                  <Pencil size={13} />
                </IconButton>
              </div>
              <span className="flex-1" />
              <div className="flex items-center gap-1.5">
                {link && (
                  <Button size="sm" variant="subtle" icon={<SquareArrowOutUpRight size={13} />} onClick={link}>
                    {openWords(job)}
                  </Button>
                )}
                {live && job.stoppable && (
                  <Button size="sm" variant="ghost" className="text-err hover:text-err" icon={<Square size={12} />} onClick={onStop}>
                    Stop
                  </Button>
                )}
              </div>
          </div>
        </div>
        <div className={cx('min-h-0 overflow-y-auto px-4 py-3', started ? 'max-h-[55%] shrink-0' : 'shrink')}>
          <Details job={job} now={now} waits={waits} then={then} onShow={onShow} />
          {job.command && (
            <div className="relative mt-3 rounded-lg border border-line bg-[var(--code-bg)]">
              <div translate="no" className="max-h-28 overflow-auto py-2 pr-9 pl-3 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap text-fg-2">
                {job.command}
              </div>
              <CopyButton text={job.command} label="Copy the command" className="absolute top-1 right-1" />
            </div>
          )}
        </div>
        {!started ? (
          <div className="border-t border-line px-4 py-3 text-[13px] text-fg-3">It has not started, so it has no output yet.</div>
        ) : job.output ? (
          <Output job={job} />
        ) : (
          <div className="border-t border-line px-4 py-3 text-[13px] text-fg-3">This job has no output to show.</div>
        )}
      </div>
    </Sheet>
  );
}
