// The Jobs page (/jobs): long work that sessions run in the background. What runs, what waits (and for what) and what
// finished lately, as a list or, for the first two, as a timeline; each job's output in a panel, the way to its session or
// page, and Stop. The list is read again as things change (store.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChartGantt, Hourglass, List } from 'lucide-react';
import type { JobEntry } from '@shared/jobs';
import { del, enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, Empty, Segmented, Throbber, useConfirm } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { JobRow, openJob } from './JobRow';
import { OutputPanel } from './OutputPanel';
import { loadJobs, useJobs, useJobsLive, useNow } from './store';
import { Timeline } from './Timeline';
import { summaryLine, waitedBy, waitsFor } from './words';

type View = 'list' | 'timeline';
const VIEW_KEY = 'hydor.jobs.view';
/** Finished jobs shown before "Show all". */
const FIRST_ENDED = 10;

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'timeline' ? 'timeline' : 'list';
  } catch {
    return 'list';
  }
}

function Section({ title, count, actions, children }: { title: string; count: number; actions?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex min-h-8 items-center gap-2">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        <span className="tnum text-[12px] text-fg-3">{count}</span>
        <span className="flex-1" />
        {actions}
      </div>
      {children}
    </section>
  );
}

const Rows = ({ children }: { children: ReactNode }) => <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">{children}</div>;

export function JobsPage() {
  const [view, setView] = useState<View>(savedView);
  const [all, setAll] = useState(false);
  useJobsLive(all);
  const list = useJobs((s) => s.list);
  const error = useJobs((s) => s.error);
  const now = useNow();
  const [confirm, confirmNode] = useConfirm();

  const running = list?.running ?? [];
  const queued = list?.queued ?? [];
  const ended = list?.ended ?? [];
  // Servers sessions left running: listed apart, as they run until stopped (an older server's list has none).
  const servers = list?.servers ?? [];
  const byId = useMemo(() => new Map([...(list?.running ?? []), ...(list?.queued ?? []), ...(list?.servers ?? []), ...(list?.ended ?? [])].map((j) => [j.id, j])), [list]);

  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // The job whose output is open, as it stands now; it keeps the last seen if it leaves the list.
  const [shown, setShown] = useState<JobEntry | null>(null);
  const showing = shown ? (byId.get(shown.id) ?? shown) : null;

  // A row pointed at from another one ("Waits for …", "Then: …"): scrolled to and lit for a moment.
  const [marked, setMarked] = useState<string | null>(null);
  const unmark = useRef(0);
  useEffect(() => () => window.clearTimeout(unmark.current), []);
  const show = (id: string) => {
    const el = document.getElementById(`job-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.clearTimeout(unmark.current);
    setMarked(id);
    unmark.current = window.setTimeout(() => setMarked(null), 1700);
  };

  const stop = async (job: JobEntry) => {
    const waiting = job.state === 'queued';
    const others = waitedBy(job, queued).length > 0;
    const ok = await confirm({
      title: waiting ? 'Stop this queued job?' : 'Stop this job?',
      body: (
        <>
          <b translate="no" className="font-medium break-words text-fg">
            {job.name}
          </b>
          <p className="mt-1">{waiting ? 'It will not start.' : 'It stops now and does not finish. What it has done so far stays.'}</p>
          {others && <p className="mt-1">Jobs that wait for it will not start either.</p>}
        </>
      ),
      confirm: 'Stop job',
      danger: true,
    });
    if (!ok) return;
    await post(`/api/jobs/${enc(job.id)}/stop`).catch(toastError);
    await loadJobs();
  };

  const remove = async (job: JobEntry) => {
    await del(`/api/jobs/${enc(job.id)}`).catch(toastError);
    await loadJobs();
  };

  const clear = async () => {
    const ok = await confirm({ title: 'Clear the finished jobs?', body: 'They leave this list. Their sessions and runs of Experiments stay.', confirm: 'Clear', danger: true });
    if (!ok) return;
    await del('/api/jobs/ended').catch(toastError);
    await loadJobs();
  };

  const row = (job: JobEntry) => (
    <JobRow
      key={job.id}
      job={job}
      now={now}
      waits={job.state === 'queued' ? waitsFor(job, byId) : []}
      then={waitedBy(job, queued)}
      marked={marked === job.id}
      onShow={show}
      onOutput={() => setShown(job)}
      onStop={() => void stop(job)}
      onRemove={() => void remove(job)}
    />
  );

  const summary = list ? summaryLine(list, now) : null;
  const idle = !running.length && !queued.length;

  return (
    // data-i18n: words that mean something else elsewhere ("Output", "Queued") as they mean here.
    <div data-i18n="jobs" className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Jobs"
        actions={
          <Segmented<View>
            size="sm"
            value={view}
            onChange={pickView}
            options={[
              { value: 'list', label: 'List', icon: <List size={13} /> },
              { value: 'timeline', label: 'Timeline', icon: <ChartGantt size={13} /> },
            ]}
          />
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 pt-4 pb-[max(24px,var(--safe-bottom))] sm:px-6">
          <div>
            <p className="text-[13px] leading-relaxed text-fg-3">Long work your sessions run in the background: what runs, how long it has left, and what waits for what.</p>
            {summary && <p className="tnum mt-2 text-[14px] font-medium text-fg">{summary}</p>}
            {list && error && <p className="mt-2 text-[12.5px] text-warn">This list could not be read again. It shows what was there before.</p>}
          </div>

          {!list ? (
            error ? (
              <Empty icon={<Hourglass size={20} />} title="The jobs could not be read">
                <p>{error}</p>
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" onClick={() => void loadJobs()}>
                    Try again
                  </Button>
                </div>
              </Empty>
            ) : (
              <div className="flex justify-center py-14 text-fg-3">
                <Throbber size={28} />
              </div>
            )
          ) : (
            <>
              {idle && (
                <Empty icon={<Hourglass size={20} />} title="Nothing runs in the background now.">
                  When an agent starts long work (a build, a training run, an index), it shows here with how long it has left. You can ask an agent to run something as a job after another one.
                </Empty>
              )}
              {!idle && view === 'timeline' && <Timeline list={list} now={now} onOpen={(j) => (j.output && j.state !== 'queued' ? setShown(j) : openJob(j)?.())} />}
              {view === 'list' && running.length > 0 && (
                <Section title="Running" count={running.length}>
                  <Rows>{running.map(row)}</Rows>
                </Section>
              )}
              {view === 'list' && queued.length > 0 && (
                <Section title="Queued" count={queued.length}>
                  <Rows>{queued.map(row)}</Rows>
                </Section>
              )}
              {view === 'list' && servers.length > 0 && (
                <Section title="Servers" count={servers.length}>
                  <p className="-mt-1 mb-2 text-[12.5px] text-fg-3">Servers your sessions left running. They run until you stop them, so they have no time left.</p>
                  <Rows>{servers.map(row)}</Rows>
                </Section>
              )}
              {ended.length > 0 && (
                <Section
                  title="Finished"
                  count={ended.length}
                  actions={
                    <Button size="sm" variant="ghost" onClick={() => void clear()}>
                      Clear
                    </Button>
                  }
                >
                  <Rows>{(all ? ended : ended.slice(0, FIRST_ENDED)).map(row)}</Rows>
                  {ended.length > FIRST_ENDED && (
                    <div className="mt-2 flex justify-center">
                      <Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)}>
                        {all ? 'Show fewer' : 'Show all'}
                      </Button>
                    </div>
                  )}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
      {showing && <OutputPanel key={showing.id} job={showing} now={now} onStop={() => void stop(showing)} onClose={() => setShown(null)} />}
      {confirmNode}
    </div>
  );
}
