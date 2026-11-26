// Experiments, a section of its own on the rail: jobs that wait for a free GPU on any of your machines (or a cluster's
// queue), run on their own, and are kept so you can compare them. The address says what shows: /experiments is the
// Overview (what runs now, the experiments as cards, the latest runs), ?e=<experiment> one experiment (its runs,
// charts and hyperparameters; ?e= alone is the runs without one), ?evaluation=<id> one evaluation (&score=<id> one of
// its scores), ?evolution=<id> one evolution (&try=<id> one of its tries), /experiments/<id> one run. A wide screen has
// a sidebar with the queue, the GPUs, the evaluations and the experiments by category; a narrow one stacks the views.
// Ticked runs (by their key) stay ticked from view to view, in a bar at the bottom to compare them or make a table.
// ?night=<date> is the Overview with that night's runs first (the morning's notice opens it).
// Addresses open things too, once: ?new=1 (or sweep, or evaluation), ?sweep=<id> (its experiment's Hyperparameters),
// ?table=<id> (or new), ?places=1, ?cluster=new.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { FlaskConical, Gauge, MoreHorizontal, Plus, Server, Table2, Waypoints, X } from 'lucide-react';
import type { ClusterSpec, ResultsTable, RunRecord, SweepSpec } from '@shared/experiments';
import type { Evaluation } from '@shared/evaluations';
import { api, enc } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast } from '../../lib/store';
import { Button, Empty, IconButton, MenuItem, Popover, useMediaQuery } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { PageTour, TourButton } from '../tips/PageTour';
import { differingParams, runKey } from './analysis';
import { experimentPath, type ExperimentTab, type RunTab, runPath, useGroups, useQueue, useRuns } from './api';
import { Compare } from './Compare';
import { evaluationPath, useEvaluations } from './evalApi';
import { EvaluationEditor, type EditorSection } from './EvaluationEditor';
import { EvaluationView } from './EvaluationView';
import { evolutionPath, useEvolutions } from './evolveApi';
import { EvolutionView } from './EvolutionView';
import { evolvingBy } from './evolveWords';
import { ExperimentView } from './Experiment';
import { Home } from './Home';
import { NewRun } from './NewRun';
import { nightDay } from './nightWords';
import { Places } from './Places';
import { RunView } from './RunView';
import { entriesOf, Sidebar } from './Sidebar';
import { TableDialog, TablesList, type TableStart } from './TableDialog';
import { EXPERIMENTS_TOUR } from './tour';

const TAB_KEY = 'hydor.experiments.tab';
const EXPERIMENT_TABS: ExperimentTab[] = ['runs', 'charts', 'params'];
const RUN_TABS: RunTab[] = ['overview', 'charts', 'log'];
/** Runs compared at once, at most (as many as the charts draw). */
const MOST_COMPARED = 8;

/** The experiment tab picked last on this device. */
function savedTab(): ExperimentTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return EXPERIMENT_TABS.find((t) => t === v) ?? 'runs';
  } catch {
    return 'runs';
  }
}

export function ExperimentsPage() {
  const [loc] = useLocation();
  const search = useSearch();
  const q = new URLSearchParams(search);
  const wide = useMediaQuery('(min-width: 1024px)');
  const { runs, error } = useRuns(true);
  const { groups } = useGroups();
  const queue = useQueue();
  const [clusters, setClusters] = useState<ClusterSpec[]>([]);
  const [newRun, setNewRun] = useState<{ from?: RunRecord | null; sweep?: boolean; group?: string } | null>(null);
  const [compare, setCompare] = useState<RunRecord[]>([]);
  const [tableStart, setTableStart] = useState<TableStart | null>(null);
  const [places, setPlaces] = useState<{ adding?: boolean } | null>(null);
  const [tables, setTables] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  // An experiment's older runs, when it has more than the newest 500 loaded: by group, read when it is opened.
  const [older, setOlder] = useState<Record<string, RunRecord[]>>({});
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  // What the address shows.
  const openId = /^\/experiments\/([a-z0-9]{4,32})$/.exec(loc)?.[1] ?? null;
  const openMachine = q.get('m');
  const evaluation = !openId ? q.get('evaluation') || null : null;
  const evolution = !openId && !evaluation ? q.get('evolution') || null : null;
  const experiment = !openId && !evaluation && !evolution && q.has('e') ? (q.get('e') ?? '') : null;
  const view: 'overview' | 'experiment' | 'evaluation' | 'evolution' | 'run' = openId ? 'run' : evaluation ? 'evaluation' : evolution ? 'evolution' : experiment !== null ? 'experiment' : 'overview';
  const { evaluations, scoring, reload: reloadEvaluations } = useEvaluations();
  const evals = evaluations ?? [];
  const evolutions = useEvolutions();
  const evolving = useMemo(() => evolvingBy(evolutions), [evolutions]);
  // The evaluation of the evolution open: the column keeps it marked.
  const evolutionOf = evolution ? (evolutions.find((e) => e.id === evolution)?.evaluation ?? null) : null;
  // New evaluation, or Edit (of one, maybe at a section); `evalSaved` has its page read again.
  const [editor, setEditor] = useState<{ evaluation?: Evaluation; section?: EditorSection } | null>(null);
  const [evalSaved, setEvalSaved] = useState(0);

  useEffect(() => {
    api<{ clusters: ClusterSpec[] }>('/api/experiments/clusters')
      .then((r) => setClusters(r.clusters))
      .catch(() => {});
  }, [places]);

  // What the address asks to open (the search box's actions, a notice's link), once; then it is taken out of the address.
  useEffect(() => {
    const p = new URLSearchParams(search);
    let done = false;
    if (p.get('new') === 'evaluation') {
      setEditor({});
      done = true;
    } else if (p.get('new')) {
      setNewRun({ sweep: p.get('new') === 'sweep', group: p.get('e') || undefined });
      done = true;
    }
    const sweep = p.get('sweep');
    if (sweep) {
      api<{ sweep: SweepSpec }>(`/api/experiments/sweeps/${enc(sweep)}`)
        .then((r) => go(experimentPath(r.sweep.group, 'params'), true))
        .catch(() => toast('That sweep is no longer kept'));
      done = true;
    }
    if (p.get('places') || p.get('cluster')) {
      setPlaces({ adding: p.get('cluster') === 'new' });
      done = true;
    }
    const t = p.get('table');
    if (t === 'new') {
      setTableStart({ group: '' });
      done = true;
    } else if (t) {
      api<{ table: ResultsTable }>(`/api/experiments/tables/${enc(t)}`)
        .then((r) => setTableStart({ table: r.table }))
        .catch(() => toast('That table is no longer kept'));
      done = true;
    }
    if (done) {
      const keep = new URLSearchParams();
      for (const k of ['e', 'tab', 'm', 'evaluation', 'score', 'evolution', 'try', 'night']) if (p.has(k) && !sweep) keep.set(k, p.get(k)!);
      const rest = keep.toString();
      go(`${loc}${rest ? `?${rest}` : ''}`, true);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Where a run runs: the id to filter by, and the name to show. */
  const placeOf = useCallback(
    (r: RunRecord) => {
      if (r.machine) return { id: `m:${r.machine.id}`, name: r.machine.name };
      const w = r.where ?? 'local';
      if (w.startsWith('c:')) return { id: w, name: clusters.find((c) => c.id === w.slice(2))?.name ?? w.slice(2) };
      if (w.startsWith('m:')) return { id: w, name: w.slice(2) };
      // This computer by those words (its host name tells you nothing here).
      return { id: 'local', name: 'This computer' };
    },
    [clusters],
  );

  const all = runs ?? [];
  const entries = useMemo(() => entriesOf(all, groups), [runs, groups]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = useMemo(() => [...new Set([...groups.values()].map((g) => g.category?.trim() ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b)), [groups]);

  // The night the address names, and its runs (this computer's; they may be older than the ones loaded).
  const night = view === 'overview' && nightDay(q.get('night')) ? q.get('night')! : null;
  const [nightRead, setNightRead] = useState<{ date: string; runs: RunRecord[] } | null>(null);
  useEffect(() => {
    if (!night) return;
    let live = true;
    api<{ runs: RunRecord[] }>(`/api/experiments/runs?night=${enc(night)}&limit=1000`)
      .then((r) => live && setNightRead({ date: night, runs: r.runs }))
      .catch(() => live && setNightRead({ date: night, runs: [] }));
    return () => {
      live = false;
    };
  }, [night]);

  // The loaded runs, and the older ones of the experiments and the night opened (those not loaded already).
  const pool = useMemo(() => {
    const have = new Set(all.map(runKey));
    const more = [...Object.values(older).flat(), ...(nightRead?.runs ?? [])].filter((r) => !have.has(runKey(r)) && !!have.add(runKey(r)));
    return more.length ? [...all, ...more] : all;
  }, [runs, older, nightRead]); // eslint-disable-line react-hooks/exhaustive-deps
  const nightRuns = night ? { date: night, runs: runs && nightRead?.date === night ? pool.filter((r) => !r.machine && r.nights?.includes(night)) : null } : null;

  // Picked runs, by key, across views; one that no longer exists is let go.
  useEffect(() => {
    if (!runs) return;
    const have = new Set(pool.map(runKey));
    setPicked((s) => (s.size && [...s].some((k) => !have.has(k)) ? new Set([...s].filter((k) => have.has(k))) : s));
  }, [pool]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickedRuns = pool.filter((r) => picked.has(runKey(r)));
  const pick = (r: RunRecord) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(runKey(r))) n.delete(runKey(r));
      else n.add(runKey(r));
      return n;
    });
  const pickMany = (rs: RunRecord[], on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      for (const r of rs) {
        if (on) n.add(runKey(r));
        else n.delete(runKey(r));
      }
      return n;
    });
  const remotePicked = pickedRuns.some((r) => r.machine);

  const overview = () => go('/experiments');
  const openRun = (r: Pick<RunRecord, 'id' | 'machine'>) => go(runPath(r));
  const openExperiment = (g: string) => go(experimentPath(g));
  const openEvaluation = (id: string, score?: string) => go(evaluationPath(id, score));

  // The experiment open: its runs, its tab (in the address, else the one picked last on this device).
  const expInfo = experiment ? groups.get(experiment) : undefined;
  const expLoaded = useMemo(() => (experiment === null ? [] : all.filter((r) => (r.group ?? '') === experiment)), [runs, experiment]); // eslint-disable-line react-hooks/exhaustive-deps
  const expOwn = expLoaded.filter((r) => !r.machine).length;
  // More runs than are loaded (the newest 500 are): the experiment's own are read, this computer's, when it is opened.
  const wantsOlder = !!experiment && !!runs && !!expInfo && expOwn < expInfo.runs;
  useEffect(() => {
    if (!wantsOlder || !experiment) return;
    let live = true;
    api<{ runs: RunRecord[] }>(`/api/experiments/runs?group=${enc(experiment)}&limit=1000`)
      .then((r) => live && setOlder((o) => ({ ...o, [experiment]: r.runs.filter((x) => !x.machine) })))
      .catch(() => live && setOlder((o) => (o[experiment] ? o : { ...o, [experiment]: [] })));
    return () => {
      live = false;
    };
  }, [wantsOlder, experiment, expInfo?.runs, expInfo?.lastAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const expRuns = useMemo(() => {
    const more = experiment ? older[experiment] : undefined;
    if (!more?.length) return expLoaded;
    const have = new Set(expLoaded.map(runKey));
    return [...expLoaded, ...more.filter((r) => !have.has(runKey(r)))].sort((a, b) => b.createdAt - a.createdAt);
  }, [expLoaded, older, experiment]);
  const expPending = wantsOlder && !!experiment && older[experiment] === undefined;
  const tabParam = q.get('tab');
  const fromAddress = EXPERIMENT_TABS.find((t) => t === tabParam);
  let expTab: ExperimentTab = fromAddress ?? savedTab();
  // The Hyperparameters tab is there for 2 runs or more whose settings differ.
  if (!fromAddress && expTab === 'params' && !(expRuns.length >= 2 && differingParams(expRuns).length)) expTab = 'runs';
  const onExpTab = (t: ExperimentTab) => {
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
    go(experimentPath(experiment ?? '', t), true);
  };

  // The run open, and the experiment it belongs to (for the way back).
  const run = openId ? all.find((r) => r.id === openId && (r.machine?.id ?? null) === (openMachine ?? null)) : undefined;
  const runGroup = run?.group ?? '';
  const runInfo = run?.group ? groups.get(run.group) : undefined;
  const runTab = RUN_TABS.find((t) => t === tabParam) ?? 'overview';

  const current = view === 'experiment' ? experiment : view === 'run' && run?.group ? runGroup : null;
  const detailOnPhone = !wide && view !== 'overview';

  const actions = (
    <div className="flex items-center gap-1">
      <TourButton id="experiments" />
      <Button data-intro="exp-new" size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setNewRun({ group: view === 'experiment' && experiment ? experiment : undefined })}>
        New run
      </Button>
      <IconButton ref={menuRef} label="More" onClick={() => setMenu((m) => !m)}>
        <MoreHorizontal size={17} />
      </IconButton>
      <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={230}>
        <MenuItem
          icon={<Waypoints size={14} />}
          onClick={() => {
            setMenu(false);
            setNewRun({ sweep: true, group: view === 'experiment' && experiment ? experiment : undefined });
          }}
        >
          New sweep
        </MenuItem>
        <MenuItem
          icon={<Gauge size={14} />}
          onClick={() => {
            setMenu(false);
            setEditor({});
          }}
        >
          New evaluation
        </MenuItem>
        <MenuItem
          icon={<Table2 size={14} />}
          onClick={() => {
            setMenu(false);
            setTables(true);
          }}
        >
          Results tables
        </MenuItem>
        <MenuItem
          icon={<Server size={14} />}
          onClick={() => {
            setMenu(false);
            setPlaces({});
          }}
        >
          Where runs go
        </MenuItem>
      </Popover>
    </div>
  );

  const body =
    view === 'run' ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <RunView
          key={`${openMachine ?? ''}:${openId}`}
          id={openId!}
          machine={openMachine}
          tab={runTab}
          onTab={(t) => go(runPath({ id: openId!, machine: openMachine ? { id: openMachine, name: run?.machine?.name ?? '' } : undefined }, t), true)}
          onBack={() => (run?.group !== undefined && run.group !== '' ? openExperiment(run.group) : overview())}
          backLabel={run?.group ? runInfo?.title?.trim() || run.group : 'Overview'}
          onAgain={(r) => setNewRun({ from: r })}
          onOpenExperiment={openExperiment}
          evaluations={evals}
          onOpenEvaluation={openEvaluation}
          info={runInfo}
          wide={wide}
        />
      </div>
    ) : (
      <div key={view === 'experiment' ? `e:${experiment}` : view === 'evaluation' ? `v:${evaluation}` : view === 'evolution' ? `ev:${evolution}` : 'overview'} className="min-h-0 flex-1 overflow-y-auto">
        {view === 'evolution' ? (
          <EvolutionView
            id={evolution!}
            open={q.get('try') ?? undefined}
            onTry={(c) => go(evolutionPath(evolution!, c ?? undefined), true)}
            onBack={wide ? undefined : (of) => (of ? openEvaluation(of) : overview())}
            onDeleted={(of) => openEvaluation(of)}
          />
        ) : view === 'evaluation' ? (
          <EvaluationView
            id={evaluation!}
            marked={q.get('score') ?? undefined}
            onBack={wide ? undefined : overview}
            onEdit={(ev, section) => setEditor({ evaluation: ev, section })}
            onOpenRun={(id) => openRun({ id })}
            onMark={(score) => go(evaluationPath(evaluation!, score), true)}
            onDeleted={() => {
              reloadEvaluations();
              overview();
            }}
            version={evalSaved}
          />
        ) : view === 'experiment' ? (
          runs && !expRuns.length && !expPending ? (
            <Empty icon={<FlaskConical size={20} />} title="No runs in this experiment">
              <p>It has no runs on this computer or its connected machines now.</p>
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={overview}>
                  Back to the Overview
                </Button>
              </div>
            </Empty>
          ) : (
            <ExperimentView
              group={experiment!}
              runs={expRuns}
              loading={runs === null || expPending}
              info={groups.get(experiment!)}
              categories={categories}
              tab={expTab}
              onTab={onExpTab}
              placeOf={placeOf}
              picked={picked}
              onPick={pick}
              onPickMany={pickMany}
              onOpenRun={openRun}
              onNewRun={(sweep) => setNewRun({ sweep, group: experiment || undefined })}
              onTable={() => setTableStart({ group: experiment! })}
              onCompare={(rs) => setCompare(rs.slice(0, MOST_COMPARED))}
              wide={wide}
              onBack={wide ? undefined : overview}
            />
          )
        ) : (
          <Home
            runs={runs}
            error={error}
            entries={entries}
            queue={queue}
            q={find}
            onQ={setFind}
            narrow={!wide}
            picked={picked}
            onPick={pick}
            onPickMany={pickMany}
            onOpenRun={openRun}
            onOpenExperiment={openExperiment}
            onNewRun={() => setNewRun({})}
            placeOf={placeOf}
            night={nightRuns}
            onLeaveNight={overview}
            evaluations={evals}
            scoring={scoring}
            evolving={evolving}
            onOpenEvaluation={openEvaluation}
          />
        )}
      </div>
    );

  return (
    // data-i18n: the page's own words where they mean something else elsewhere ("Run" is a run here, not "to run").
    <div data-i18n="experiments" className="flex h-full min-h-0 flex-col">
      {!detailOnPhone && <PageHeader title="Experiments" actions={actions} />}
      <div className="flex min-h-0 flex-1">
        {wide && (
          <Sidebar
            runs={runs}
            entries={entries}
            queue={queue}
            q={find}
            onQ={setFind}
            current={current}
            onOverview={overview}
            onOpen={openExperiment}
            onOpenRun={(id) => openRun({ id })}
            evaluations={evals}
            scoring={scoring}
            evolving={evolving}
            evaluation={evaluation ?? evolutionOf}
            onOpenEvaluation={openEvaluation}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {body}
          {picked.size > 0 && (
            <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-bg px-4 py-2.5 pb-[max(10px,var(--safe-bottom))]">
              <span className="text-[13px] text-fg-2">{picked.size} picked</span>
              <span className="flex-1" />
              <Button size="sm" variant="secondary" disabled={pickedRuns.length < 2} onClick={() => setCompare(pickedRuns.slice(0, MOST_COMPARED))}>
                Compare
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!pickedRuns.length || remotePicked}
                title={remotePicked ? 'Tables are made of this computer’s runs: open the other machine’s Experiments for its own' : undefined}
                onClick={() => setTableStart({ runs: pickedRuns })}
              >
                Make a table
              </Button>
              <IconButton label="Pick none" size="sm" onClick={() => setPicked(new Set())}>
                <X size={15} />
              </IconButton>
            </div>
          )}
        </div>
      </div>
      <NewRun
        open={!!newRun}
        from={newRun?.from}
        sweep={newRun?.sweep}
        group={newRun?.group}
        onClose={() => setNewRun(null)}
        onStarted={(r) => {
          if (r.run) openRun(r.run);
          else if (r.group) openExperiment(r.group);
        }}
      />
      <EvaluationEditor
        open={!!editor}
        evaluation={editor?.evaluation}
        section={editor?.section}
        onClose={() => setEditor(null)}
        onSaved={(ev) => {
          reloadEvaluations();
          setEvalSaved((n) => n + 1);
          openEvaluation(ev.id);
        }}
      />
      <Compare runs={compare} onClose={() => setCompare([])} />
      <TableDialog start={tableStart} onClose={() => setTableStart(null)} />
      <TablesList
        open={tables}
        onClose={() => setTables(false)}
        onOpen={(t) => {
          setTables(false);
          setTableStart({ table: t });
        }}
      />
      <Places open={!!places} adding={places?.adding} onClose={() => setPlaces(null)} />
      <PageTour id="experiments" steps={EXPERIMENTS_TOUR} ready={runs !== null} />
    </div>
  );
}
