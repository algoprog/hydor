// The Jobs page (/jobs): long work that sessions run in the background. Four tiles say how it stands as a whole, tag
// chips, a project menu and a search narrow it, and under them: the work in hand grouped by tag, the servers left
// running and what finished, by day; or the first of these as a timeline. A job's row opens its panel (details and
// output), and its menu the way to its session, its tags and Stop. The list is read again as things change (store.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { ChartGantt, ChevronDown, ChevronRight, Hourglass, List } from 'lucide-react';
import { useSearch } from 'wouter';
import type { JobEntry } from '@shared/jobs';
import { del } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, Empty, Segmented, Throbber } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';
import { PageHeader } from '../layout/PageHeader';
import { useSpaces } from '../spaces/state';
import { useJobActions } from './actions';
import { JobRow, SessionLinks } from './JobRow';
import { Overview } from './Overview';
import { loadJobs, useJobs, useJobsLive, useNow } from './store';
import { TagDot } from './TagPill';
import { byDay, filtering, filterList, firstTag, groupAtWork, matches, NO_PROJECT, projectCounts, sharedSession, tagChips, type JobFilter, type JobGroup } from './tags';
import { Timeline } from './Timeline';
import { Toolbar } from './Toolbar';
import { countWords, groupDoneWords, waitsFor } from './words';

type View = 'list' | 'timeline';
const VIEW_KEY = 'hydor.jobs.view';
/** The groups folded away, by tag ('' for the jobs with none). */
const FOLDED_KEY = 'hydor.jobs.folded';
/** Finished jobs shown before "Show all". */
const FIRST_ENDED = 10;
/** The most finished jobs the server sends unless all are asked for. */
const LATEST_ENDED = 100;

const dayName = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'timeline' ? 'timeline' : 'list';
  } catch {
    return 'list';
  }
}

function savedFolded(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function Section({ title, count, actions, at, children }: { title: string; count: number; actions?: ReactNode; at?: Ref<HTMLElement>; children: ReactNode }) {
  return (
    <section ref={at} className="scroll-mt-3">
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-2">
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

/** The header of a group's card: its tag, how much of it runs and waits, the session it all comes from when it is one
 *  (its links stand beside the button that folds the group, never in it), and when it should be done. */
function GroupHead({ group, now, open, onFold, projectShown }: { group: JobGroup; now: number; open: boolean; onFold?: () => void; projectShown?: boolean }) {
  const done = groupDoneWords(group.doneAt, now);
  const session = sharedSession(group);
  const head = (
    <>
      <span className="flex h-5 w-[17px] shrink-0 items-center justify-center text-fg-3">{onFold ? open ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : <TagDot tag={group.tag} />}</span>
      <span className="flex min-w-0 max-w-full items-center gap-1.5">
        {onFold && <TagDot tag={group.tag} />}
        {group.tag === null ? (
          <span className="truncate text-[13.5px] font-medium text-fg">No tag</span>
        ) : (
          <span translate="no" className="truncate text-[13.5px] font-medium text-fg">
            {group.tag}
          </span>
        )}
      </span>
      <span className="tnum shrink-0 text-[12px] text-fg-3">{countWords(group.running.length, group.queued.length)}</span>
    </>
  );
  const headCls = 'flex min-w-0 items-center gap-x-2.5 text-left leading-5';
  return (
    <div
      onClick={(e) => {
        // The rest of the header folds the group too; its links do their own thing.
        if (onFold && !(e.target as HTMLElement).closest('button')) onFold();
      }}
      className={cx('flex w-full flex-wrap items-center gap-x-2.5 gap-y-0.5 px-3.5 py-2.5', open && 'border-b border-line', onFold && 'cursor-pointer transition-colors hover:bg-bg-2/50')}
    >
      {onFold ? (
        <button type="button" aria-expanded={open} onClick={onFold} className={cx(headCls, 'rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/60')}>
          {head}
        </button>
      ) : (
        <div className={headCls}>{head}</div>
      )}
      {session && (
        <span className="flex min-w-0 items-baseline gap-1.5 text-[12px] leading-5 text-fg-3">
          <span aria-hidden>·</span>
          <SessionLinks session={session} noProject={projectShown} />
        </span>
      )}
      {done && <span className="tnum ml-auto text-[12px] leading-5 text-fg-3">{done}</span>}
    </div>
  );
}

export function JobsPage() {
  const [view, setView] = useState<View>(savedView);
  const [all, setAll] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [folded, setFolded] = useState(savedFolded);
  const params = new URLSearchParams(useSearch());
  const tag = params.get('tag') || undefined;
  const untagged = !tag && params.get('untagged') === '1';
  const project = params.get('project') || undefined;
  const spaces = useSpaces();
  // A group's jobs are those of the projects it brings together too.
  const members = project && project !== NO_PROJECT ? spaces?.find((s) => s.id === project)?.members : undefined;
  const projects = useMemo<JobFilter['projects']>(() => (!project ? undefined : project === NO_PROJECT ? NO_PROJECT : [project, ...(members ?? [])]), [project, members]);
  const filter: JobFilter = { tag, untagged, projects, query };
  // One project picked (not a group's several): its rows need not say it.
  const oneProject = !!project && project !== NO_PROJECT && !members?.length;
  const narrowed = filtering(filter);
  // A tag's, a project's or a search's older jobs are among all the finished ones, not only the latest.
  useJobsLive(all || narrowed);
  const list = useJobs((s) => s.list);
  const error = useJobs((s) => s.error);
  const now = useNow();
  const search = useRef<HTMLInputElement>(null);

  const shownList = useMemo(() => (list ? filterList(list, { tag, untagged, projects, query }) : null), [list, tag, untagged, projects, query]);
  // The chips count what the project picked has; the project menu, what each project has.
  const ofProject = useMemo(() => (list && projects ? filterList(list, { projects }) : list), [list, projects]);
  const chips = useMemo(() => (ofProject ? tagChips(ofProject) : null), [ofProject]);
  const byProject = useMemo(() => (list ? projectCounts(list) : null), [list]);
  // A job named in another row is scrolled to on this page (show, below).
  const { actions, byId, thenOf, overlays, confirm, closePanel } = useJobActions(list, now, { onShow: (id) => show(id) });

  const running = shownList?.running ?? [];
  const queued = shownList?.queued ?? [];
  const ended = shownList?.ended ?? [];
  // Servers sessions left running: listed apart, as they run until stopped.
  const servers = shownList?.servers ?? [];
  const failed = ended.filter((j) => j.state === 'failed');
  const finished = failedOnly ? failed : ended;
  const groups = groupAtWork(running, queued, now);
  const byTag = !tag && !untagged;
  // With no tag anywhere, a header saying "No tag" over everything says nothing.
  const heads = !byTag || !!chips?.tags.length;
  const atWork = running.length + queued.length;
  const idle = !list?.running.length && !list?.queued.length;
  const nothing = idle && !list?.servers?.length && !list?.ended.length;
  const noMatch = narrowed && !atWork && !servers.length && !ended.length;

  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const fold = (key: string, away: boolean) => {
    const next = away ? [...folded.filter((k) => k !== key), key] : folded.filter((k) => k !== key);
    setFolded(next);
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify(next));
    } catch {}
  };

  const showAllJobs = () => {
    setQuery('');
    go('/jobs');
  };

  // A job pointed at from elsewhere ("Waits for …", "Then: …"): whatever hides its row is undone, then it is scrolled to
  // and lit for a moment.
  const [wanted, setWanted] = useState<string | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  const unmark = useRef(0);
  useEffect(() => () => window.clearTimeout(unmark.current), []);
  const show = (id: string) => {
    const job = byId.get(id);
    if (!job) return;
    closePanel();
    if (!matches(job, filter)) showAllJobs();
    const key = firstTag(job) ?? '';
    if (folded.includes(key)) fold(key, false);
    // Only what finished is under the timeline too.
    if (job.state === 'running' || job.state === 'queued') setView('list');
    else {
      setAll(true);
      setFailedOnly(false);
    }
    setWanted(id);
  };
  useEffect(() => {
    if (!wanted) return;
    const el = document.getElementById(`job-${wanted}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.clearTimeout(unmark.current);
    setMarked(wanted);
    setWanted(null);
    unmark.current = window.setTimeout(() => setMarked(null), 1700);
  });

  const finishedAt = useRef<HTMLElement>(null);
  const showFailed = () => {
    setFailedOnly(true);
    requestAnimationFrame(() => finishedAt.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const clear = async () => {
    const ok = await confirm({
      title: 'Clear the finished jobs?',
      // Clear takes them all, whatever is shown.
      body: narrowed || failedOnly ? 'All of them leave this list, not only those shown here. Their sessions and runs of Experiments stay.' : 'They leave this list. Their sessions and runs of Experiments stay.',
      confirm: 'Clear',
      danger: true,
    });
    if (!ok) return;
    await del('/api/jobs/ended').catch(toastError);
    await loadJobs();
  };

  const row = (job: JobEntry, grouped?: boolean, sessionShown?: boolean) => (
    <JobRow
      key={job.id}
      job={job}
      now={now}
      waits={job.state === 'queued' ? waitsFor(job, byId) : []}
      then={thenOf(job)}
      marked={marked === job.id}
      grouped={grouped}
      sessionShown={sessionShown}
      projectShown={oneProject}
      actions={actions}
    />
  );

  const emptyNow = (
    <Empty icon={<Hourglass size={20} />} title="Nothing runs in the background now.">
      <p>Long work your sessions run in the background: what runs, how long it has left, and what waits for what.</p>
      <p className="mt-2">When an agent starts long work (a build, a training run, an index), it shows here with how long it has left. You can ask an agent to run something as a job after another one.</p>
    </Empty>
  );

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
          {list && error && <p className="-mb-2 text-[12.5px] text-warn">This list could not be read again. It shows what was there before.</p>}

          {!list || !shownList || !chips ? (
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
          ) : nothing ? (
            emptyNow
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <Overview list={shownList} now={now} capped={list.ended.length === LATEST_ENDED} onFailed={showFailed} />
                <Toolbar
                  chips={chips}
                  projects={byProject!}
                  atWork={(ofProject?.running.length ?? 0) + (ofProject?.queued.length ?? 0)}
                  tag={tag}
                  untagged={untagged}
                  project={project}
                  query={query}
                  onQuery={setQuery}
                  input={search}
                />
              </div>

              {noMatch ? (
                <div className="flex flex-col items-center gap-3 py-10 text-[13.5px] text-fg-3">
                  <p>No jobs match.</p>
                  <Button size="sm" variant="secondary" onClick={showAllJobs}>
                    Show all jobs
                  </Button>
                </div>
              ) : (
                idle && !narrowed && emptyNow
              )}

              {view === 'timeline' && atWork > 0 && <Timeline list={shownList} now={now} onOpen={actions.onDetails} />}
              {view === 'list' && atWork > 0 && (
                <Section title="At work" count={atWork}>
                  <div className="flex flex-col gap-2.5">
                    {groups.map((g) => {
                      const key = g.tag ?? '';
                      // A search opens every group it finds something in.
                      const foldable = heads && byTag && !query.trim();
                      const open = !foldable || !folded.includes(key);
                      // Its header names the session it all comes from: its rows need not.
                      const shared = heads && !!sharedSession(g);
                      return (
                        <div key={key} className="overflow-hidden rounded-xl border border-line bg-panel">
                          {heads && <GroupHead group={g} now={now} open={open} onFold={foldable ? () => fold(key, open) : undefined} projectShown={oneProject} />}
                          {open && (
                            <div className="divide-y divide-line">
                              {g.running.map((j) => row(j, heads, shared))}
                              {g.queued.map((j) => row(j, heads, shared))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
              {view === 'list' && servers.length > 0 && (
                <Section title="Servers" count={servers.length}>
                  <p className="-mt-1 mb-2 text-[12.5px] text-fg-3">Servers your sessions left running. They run until you stop them, so they have no time left.</p>
                  <Rows>{servers.map((j) => row(j))}</Rows>
                </Section>
              )}
              {ended.length > 0 && (
                <Section
                  at={finishedAt}
                  title="Finished"
                  count={ended.length}
                  actions={
                    <>
                      {(failed.length > 0 || failedOnly) && (
                        <Segmented<'all' | 'failed'>
                          size="sm"
                          value={failedOnly ? 'failed' : 'all'}
                          onChange={(v) => setFailedOnly(v === 'failed')}
                          options={[
                            { value: 'all', label: 'All' },
                            {
                              value: 'failed',
                              label: (
                                <>
                                  <span>Failed</span>
                                  <span className="tnum font-normal text-fg-3">{failed.length}</span>
                                </>
                              ),
                            },
                          ]}
                        />
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void clear()}>
                        Clear
                      </Button>
                    </>
                  }
                >
                  {finished.length === 0 && <p className="text-[12.5px] text-fg-3">No failed jobs.</p>}
                  <div className="flex flex-col gap-3">
                    {byDay(all ? finished : finished.slice(0, FIRST_ENDED), now).map((d) => (
                      <div key={d.day}>
                        <h3 className="mb-1.5 px-0.5 text-[12px] font-medium text-fg-3">
                          {d.label === 'today' ? <span>Today</span> : d.label === 'yesterday' ? <span>Yesterday</span> : <span translate="no">{dayName.format(d.day)}</span>}
                        </h3>
                        <Rows>{d.jobs.map((j) => row(j))}</Rows>
                      </div>
                    ))}
                  </div>
                  {finished.length > FIRST_ENDED && (
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
      {overlays}
    </div>
  );
}
