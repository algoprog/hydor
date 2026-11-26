// The Experiments Overview: what runs and waits now (a card each, with its progress and its key metric's curve), the
// experiments as cards (what each tests, how many runs, its best result), and the latest runs in a table. On a narrow
// screen it also shows the queue, the GPUs and the box to find an experiment, which a wide screen has in its sidebar.
import { useMemo, useState } from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import type { QueueNow, RunRecord } from '@shared/experiments';
import type { EvaluationListed } from '@shared/evaluations';
import type { Evolution } from '@shared/evolve';
import { Meter } from '../../components/charts';
import { Button, cx, Empty, inputCls } from '../../components/ui';
import { bestRun, keyMetricOf, runKey, valueOf } from './analysis';
import { gpuWords, isActive, keyMetrics, leftWords, num, progressOf, statusTone, statusWords, useSeries } from './api';
import { Sparkline } from './Charts';
import { RunsTable, type RunsSort } from './RunsTable';
import { agoWords, byCategory, type Entry, EvaluationLine, findEntries, FindBox, fullDate, GpuMeters, lastOf, QueueLine, runsWords } from './Sidebar';

/** Cards of runs going or waiting shown before "Show all". */
const FIRST_GOING = 12;
/** Latest runs shown before "Show all N runs". */
const FIRST_LATEST = 10;
const NO_COLUMNS = { metrics: [], params: [] };

/** A run going or waiting: its status, name, experiment, progress, key metric with its curve, and GPUs. */
function GoingCard({ r, title, series, onOpen }: { r: RunRecord; title: string; series: [number, number][] | undefined; onOpen: () => void }) {
  const prog = progressOf(r);
  const waiting = r.status === 'queued' || r.status === 'waiting';
  const metric = keyMetrics(r, 1)[0];
  const value = metric ? r.metrics?.last?.[metric] : undefined;
  return (
    <button type="button" onClick={onOpen} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-panel p-3 text-left transition-colors hover:bg-bg-1">
      <div className="flex items-center gap-1.5 text-[12px] text-fg-2">
        <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', statusTone(r.status))} />
        <span className="truncate">{statusWords(r)}</span>
      </div>
      <div translate="no" className="line-clamp-2 text-[13px] leading-snug font-medium break-words text-fg">
        {r.name ?? r.id}
      </div>
      {title && (
        <div translate="no" className="truncate text-[12px] text-fg-3">
          {title}
        </div>
      )}
      {waiting && r.why && (
        <div translate="no" className="line-clamp-2 text-[12px] text-fg-3">
          {r.why}
        </div>
      )}
      {prog && (
        <div>
          <Meter percent={prog.pct} height={4} color="var(--accent)" />
          <div className="tnum mt-1 text-[12px] text-fg-3">
            {prog.pct}%{prog.left !== undefined && <span>{` · ${leftWords(prog.left)}`}</span>}
          </div>
        </div>
      )}
      {metric && value !== undefined && (
        <div>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span translate="no" className="min-w-0 truncate text-fg-3">
              {metric}
            </span>
            <span className="tnum shrink-0 font-semibold text-fg">{num(value)}</span>
          </div>
          {series && series.length > 1 && <Sparkline points={series} height={28} className="mt-1" />}
        </div>
      )}
      {r.status === 'running' && r.gpuIds && r.gpuIds.length > 0 && <div className="text-[12px] text-fg-3">{gpuWords(r.gpuIds)}</div>}
    </button>
  );
}

/** An experiment: its category, title, description, and how its runs are going and did. */
function ExperimentCard({ e, onOpen }: { e: Entry & { viaRuns?: number }; onOpen: () => void }) {
  const metric = useMemo(() => keyMetricOf(e.runs), [e.runs]);
  const best = useMemo(() => (metric ? bestRun(e.runs, metric, 'best') : undefined), [e.runs, metric]);
  const bestValue = best && metric ? valueOf(best, metric, 'best') : undefined;
  const active = e.going + e.waiting > 0;
  return (
    <button type="button" onClick={onOpen} className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-panel p-3.5 text-left transition-colors hover:bg-bg-1">
      {e.category && (
        <div translate="no" className="truncate text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          {e.category}
        </div>
      )}
      <div translate="no" className="line-clamp-2 text-[14px] leading-snug font-semibold break-words text-fg">
        {e.group ? e.title : <span translate="yes">Runs without an experiment</span>}
      </div>
      {e.description && (
        <div translate="no" className="line-clamp-3 text-[12.5px] leading-snug text-fg-2">
          {e.description}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-1.5 text-[12px] text-fg-3">
        {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
        <span>{runsWords(e.total)}</span>
        {e.going > 0 && (
          <>
            <span>·</span>
            <span>{`${e.going} running`}</span>
          </>
        )}
        {e.waiting > 0 && (
          <>
            <span>·</span>
            <span>{`${e.waiting} waiting`}</span>
          </>
        )}
        <span>·</span>
        <span title={fullDate(e.lastAt)}>{agoWords(e.lastAt)}</span>
      </div>
      {/* The best on a line of its own: after the counts it would wrap with a separator left hanging. */}
      {metric && bestValue !== undefined && (
        <div className="text-[12px] text-fg-3">
          Best{' '}
          <span translate="no" className="text-fg-2">
            {metric}
          </span>{' '}
          <span className="tnum font-medium text-fg-2">{num(bestValue)}</span>
        </div>
      )}
    </button>
  );
}

/** On a narrow screen, which has no column: the evaluations as cards. */
function Evaluations({ evaluations, scoring, evolving, onOpen }: { evaluations: EvaluationListed[]; scoring: Set<string>; evolving: Map<string, Evolution>; onOpen: (id: string) => void }) {
  if (!evaluations.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold text-fg">Evaluations</h2>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
        {evaluations.map((ev) => (
          <button key={ev.id} type="button" onClick={() => onOpen(ev.id)} className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-panel p-3.5 text-left transition-colors hover:bg-bg-1">
            <div translate="no" className="line-clamp-2 text-[14px] leading-snug font-semibold break-words text-fg">
              {ev.name}
            </div>
            <div translate="no" className="truncate font-mono text-[12px] text-fg-3">
              {ev.metric}
            </div>
            <EvaluationLine ev={ev} scoring={scoring.has(ev.id)} evolving={evolving.get(ev.id)} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function Home({
  runs,
  evaluations,
  scoring,
  evolving,
  onOpenEvaluation,
  error,
  entries,
  queue,
  q,
  onQ,
  narrow,
  picked,
  onPick,
  onPickMany,
  onOpenRun,
  onOpenExperiment,
  onNewRun,
  placeOf,
}: {
  /** null while they load. */
  runs: RunRecord[] | null;
  error: string | null;
  entries: Entry[];
  queue: QueueNow | null;
  /** What the Find box says (the sidebar's, on a wide screen). */
  q: string;
  onQ: (q: string) => void;
  /** Under 1024px: the queue, the GPUs and the Find box show here. */
  narrow: boolean;
  picked: Set<string>;
  onPick: (r: RunRecord) => void;
  onPickMany: (rs: RunRecord[], on: boolean) => void;
  onOpenRun: (r: Pick<RunRecord, 'id' | 'machine'>) => void;
  onOpenExperiment: (group: string) => void;
  onNewRun: () => void;
  placeOf: (r: RunRecord) => { id: string; name: string };
  evaluations: EvaluationListed[];
  /** The ids of those being scored now. */
  scoring: Set<string>;
  /** The evolution working on each evaluation. */
  evolving: Map<string, Evolution>;
  onOpenEvaluation: (id: string) => void;
}) {
  const [sort, setSort] = useState<RunsSort>(null);
  const [allGoing, setAllGoing] = useState(false);
  const [allLatest, setAllLatest] = useState(false);
  const [findRun, setFindRun] = useState('');
  const all = runs ?? [];
  const titleOf = useMemo(() => new Map(entries.map((e) => [e.group, e.group ? e.title : ''])), [entries]);

  const now = useMemo(() => all.filter(isActive).sort((a, b) => (a.status === 'running' || a.status === 'starting' ? 0 : 1) - (b.status === 'running' || b.status === 'starting' ? 0 : 1) || b.createdAt - a.createdAt), [all]);
  const goingShown = allGoing ? now : now.slice(0, FIRST_GOING);
  const series = useSeries(useMemo(() => goingShown.filter((r) => r.status === 'running' || r.status === 'starting'), [goingShown]));

  const found = useMemo(() => findEntries(entries, q), [entries, q]);
  const cards = useMemo(() => {
    const { blocks, none } = byCategory(found);
    return [...blocks.flatMap((b) => b.items), ...(none ? [none] : [])];
  }, [found]);

  const latest = useMemo(() => [...all].sort((a, b) => lastOf(b) - lastOf(a)), [all]);
  const latestShown = useMemo(() => {
    if (!allLatest) return latest.slice(0, FIRST_LATEST);
    const words = findRun.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return latest;
    return latest.filter((r) => {
      const t = [r.name, r.command, r.id, r.group ? (titleOf.get(r.group) ?? r.group) : '', r.group, ...(r.tags ?? [])].join('\n').toLowerCase();
      return words.every((w) => t.includes(w));
    });
  }, [latest, allLatest, findRun, titleOf]);
  const places = useMemo(() => new Set(all.map((r) => placeOf(r).id)), [all, placeOf]);

  if (runs && !runs.length) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-4">
        {narrow && <Top runs={runs} queue={queue} q={q} onQ={onQ} onOpenRun={onOpenRun} />}
        {narrow && <Evaluations evaluations={evaluations} scoring={scoring} evolving={evolving} onOpen={onOpenEvaluation} />}
        <Empty icon={<FlaskConical size={20} />} title="No runs yet">
          <p>Experiments runs your jobs when a GPU is free, keeps a record of each (its code, settings, log and metrics) and tells you when it is done.</p>
          <div className="mt-4 flex justify-center">
            <Button variant="primary" icon={<Plus size={15} />} onClick={onNewRun}>
              New run
            </Button>
          </div>
          <p className="mt-4">or ask any agent: “train this on a free GPU and tell me when it’s done”</p>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-7 px-5 py-4">
      {narrow && <Top runs={all} queue={queue} q={q} onQ={onQ} onOpenRun={onOpenRun} />}
      {runs === null && error && <p className="text-[13px] text-fg-3">{error}</p>}

      {now.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-fg">Running now</h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {goingShown.map((r) => (
              <GoingCard key={runKey(r)} r={r} title={r.group ? (titleOf.get(r.group) ?? r.group) : ''} series={metricPoints(r, series[runKey(r)])} onOpen={() => onOpenRun(r)} />
            ))}
          </div>
          {now.length > FIRST_GOING && (
            <button type="button" onClick={() => setAllGoing((a) => !a)} className="mt-2 text-[12.5px] text-accent hover:underline">
              {allGoing ? 'Show fewer' : `Show all ${now.length}`}
            </button>
          )}
        </section>
      )}

      {narrow && <Evaluations evaluations={evaluations} scoring={scoring} evolving={evolving} onOpen={onOpenEvaluation} />}

      {/* With a sidebar, the page's tour lights its list instead. */}
      <section data-intro={narrow && cards.length ? 'exp-list' : undefined}>
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Experiments</h2>
        {runs === null ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[112px] animate-pulse rounded-xl border border-line bg-bg-1" />
            ))}
          </div>
        ) : cards.length ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {cards.map((e) => (
              <ExperimentCard key={e.group} e={e} onOpen={() => onOpenExperiment(e.group)} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-[13px] text-fg-3">No experiment is like that.</p>
        )}
      </section>

      {(runs === null || all.length > 0) && (
        <section data-intro="exp-runs">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[13px] font-semibold text-fg">Latest runs</h2>
            {allLatest && <input value={findRun} onChange={(e) => setFindRun(e.target.value)} placeholder="Find a run" aria-label="Find a run" spellCheck={false} className={cx(inputCls, 'h-8 w-52 text-[13px]')} />}
          </div>
          {runs === null ? (
            <div className="h-40 animate-pulse rounded-xl border border-line bg-bg-1" aria-hidden />
          ) : (
            <>
              <RunsTable
                runs={latestShown}
                columns={NO_COLUMNS}
                experiment={(r) => (r.group ? (titleOf.get(r.group) ?? r.group) : null)}
                summary
                where={places.size > 1 ? (r) => placeOf(r).name : undefined}
                picked={picked}
                onPick={onPick}
                onPickAll={(rs, on) => onPickMany(rs, on)}
                onOpen={onOpenRun}
                sort={sort}
                onSort={setSort}
                limit={allLatest ? 50 : FIRST_LATEST}
              />
              {allLatest && !latestShown.length && <p className="py-3 text-[13px] text-fg-3">No run is like that.</p>}
              {!allLatest && all.length > FIRST_LATEST && (
                <button type="button" onClick={() => setAllLatest(true)} className="mt-2 rounded-lg px-1 py-1 text-[12.5px] text-accent hover:underline">
                  {`Show all ${all.length} runs`}
                </button>
              )}
              {allLatest && (
                <button
                  type="button"
                  onClick={() => {
                    setAllLatest(false);
                    setFindRun('');
                  }}
                  className="mt-2 rounded-lg px-1 py-1 text-[12.5px] text-fg-3 hover:text-fg-2"
                >
                  Show only the latest
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** The curve of a run's key metric (the one its card shows), from the series read for it. */
function metricPoints(r: RunRecord, s: Record<string, [number, number][]> | undefined): [number, number][] | undefined {
  const k = keyMetrics(r, 1)[0];
  return k ? s?.[k] : undefined;
}

/** On a narrow screen: the queue, the GPUs and the Find box, as the sidebar has them. */
function Top({ runs, queue, q, onQ, onOpenRun }: { runs: RunRecord[]; queue: QueueNow | null; q: string; onQ: (q: string) => void; onOpenRun: (r: Pick<RunRecord, 'id' | 'machine'>) => void }) {
  return (
    <div className="mb-5 space-y-3">
      <div data-intro="exp-queue" className="space-y-3">
        <QueueLine runs={runs} />
        {queue && queue.gpus.length > 0 && <GpuMeters gpus={queue.gpus} runs={runs} onOpen={(id) => onOpenRun({ id })} className="sm:grid-cols-4" />}
      </div>
      <FindBox value={q} onChange={onQ} />
    </div>
  );
}
