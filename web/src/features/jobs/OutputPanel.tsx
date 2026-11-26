// A job's output in a panel over the right of the page (the whole screen on a phone), as a background task's opens in a
// session: its name, how it stands, Stop while it runs, and the end of its log, read again every three seconds while it
// runs. The newest lines stay in view unless you scroll up.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Square, X } from 'lucide-react';
import type { JobEntry, JobLog } from '@shared/jobs';
import { api, enc } from '../../lib/api';
import { Button, cx, IconButton, Sheet, Throbber } from '../../components/ui';
import { JobDot, JobIcon, KindText, toneState } from './JobRow';
import { runClock, stateWords } from './words';

export function OutputPanel({ job, now, onStop, onClose }: { job: JobEntry; now: number; onStop: () => void; onClose: () => void }) {
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

  const state = toneState(job);
  const tone = state === 'running' ? 'text-busy' : state === 'done' ? 'text-ok' : state === 'failed' ? 'text-err' : 'text-fg-3';
  return (
    <Sheet open onClose={onClose} label="Output" width={640}>
      <div data-i18n="jobs" className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 pt-[max(12px,var(--safe-top))] pb-3">
          <span className="mt-0.5 shrink-0 text-fg-2">
            <JobIcon kind={job.kind} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div translate="no" className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight break-words">
              {job.name}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3">
              <KindText job={job} />
              <span className={cx('inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full bg-bg-2 px-2 text-[12px] font-medium', tone)}>
                <JobDot state={state} className="!h-1.5 !w-1.5" />
                <span>{stateWords(job)}</span>
              </span>
              {running && job.startedAt ? <span className="tnum">{`running for ${runClock(now - job.startedAt)}`}</span> : null}
              {log?.truncated && <span>latest output</span>}
            </div>
            {job.command && (
              <div translate="no" title={job.command} className="mt-1.5 line-clamp-3 font-mono text-[11.5px] break-all text-fg-3">
                {job.command}
              </div>
            )}
          </div>
          {running && job.stoppable && (
            <Button size="sm" variant="ghost" className="shrink-0 text-err" icon={<Square size={12} />} onClick={onStop}>
              Stop
            </Button>
          )}
          <IconButton label="Close" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </div>
        {log && error && <div className="shrink-0 border-b border-line px-4 py-1.5 text-[12px] text-warn">{error}</div>}
        <div
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="min-h-0 flex-1 overflow-auto"
        >
          {!log ? (
            <div className="p-4 text-fg-3">{error ? error : <Throbber />}</div>
          ) : !log.text.trim() ? (
            <div className="p-4 text-[13px] text-fg-3">No output yet.</div>
          ) : (
            <div translate="no" className="term-out min-h-full px-4 py-3">
              {log.text}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
