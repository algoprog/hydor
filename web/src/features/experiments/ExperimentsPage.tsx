// System → Experiments: jobs that wait for a free GPU on any of your machines (or a cluster's queue), run on their
// own, and are kept so you can compare them. Above the list, the queue now and this computer's GPUs; the list,
// grouped by experiment (the one with the newest run first; each folds, and shows its first 10 runs), with a search
// and filters in one menu. A row is the run's name, then its status (how long it took, how far it is), its key
// metrics and where it runs; ticked runs (the boxes show when you point at a row) can be compared or made into a
// results table. A run opens beside the list on a wide screen, over it on a narrow one
// (/system/experiments/<id>). Addresses open things too: ?new=1 (or sweep), ?sweep=<id>, ?table=<id> (or new),
// ?places=1, ?cluster=new.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { ChevronDown, ChevronRight, FlaskConical, MoreHorizontal, Plus, Server, SlidersHorizontal, Table2, Waypoints, X } from 'lucide-react';
import type { ClusterSpec, GpuNow, ResultsTable, RunRecord } from '@shared/experiments';
import { api } from '../../lib/api';
import { LOCALE } from '../../i18n/locale';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast } from '../../lib/store';
import { Meter } from '../../components/charts';
import { Button, cx, Empty, IconButton, inputCls, MenuItem, MenuLabel, MenuSep, Popover, Throbber, useMediaQuery } from '../../components/ui';
import { SystemHeader } from '../system/SystemHeader';
import { endedWords, gpuWords, isActive, leftWords, metricsLine, progressOf, runPath, statusTone, useQueue, useRuns, waitKind } from './api';
import { Compare } from './Compare';
import { NewRun } from './NewRun';
import { Places } from './Places';
import { RunView } from './RunView';
import { SweepView } from './SweepView';
import { TableDialog, TablesList, type TableStart } from './TableDialog';

const keyOf = (r: RunRecord) => `${r.machine?.id ?? ''}:${r.id}`;

type Status = 'all' | 'going' | 'done' | 'failed' | 'stopped';
const STATUS: { id: Status; label: string; test: (r: RunRecord) => boolean }[] = [
  { id: 'all', label: 'Every run', test: () => true },
  { id: 'going', label: 'Running and waiting', test: isActive },
  { id: 'done', label: 'Done', test: (r) => r.status === 'done' },
  { id: 'failed', label: 'Failed or lost', test: (r) => r.status === 'failed' || r.status === 'lost' },
  { id: 'stopped', label: 'Stopped', test: (r) => r.status === 'stopped' },
];

/** This computer's GPUs as small meters: memory in use, the ones your runs hold in the accent colour. */
function GpuMeters({ gpus, runs, onOpen }: { gpus: GpuNow[]; runs: RunRecord[]; onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {gpus.map((g) => {
        const p = g.memTotal ? (g.memUsed / g.memTotal) * 100 : 0;
        // The run that holds it by its name (it may be one not listed any more).
        const holder = g.run ? runs.find((r) => r.id === g.run && !r.machine) : undefined;
        return (
          <button key={g.index} type="button" disabled={!g.run} onClick={() => g.run && onOpen(g.run)} title={`${g.name} · ${g.util}% busy${g.run ? ` · ${holder ? (holder.name ?? holder.id) : 'one of your runs holds it'}` : ''}`} className="w-[124px] text-left disabled:cursor-default">
            <div className="mb-0.5 flex justify-between gap-2 text-[11px] text-fg-3">
              <span className={g.run ? 'font-medium text-fg-2' : ''}>GPU {g.index}</span>
              <span className="tnum">
                {(g.memUsed / 1024).toFixed(0)}/{(g.memTotal / 1024).toFixed(0)} GB
              </span>
            </div>
            <Meter percent={p} height={5} color={g.run ? 'var(--accent)' : undefined} />
          </button>
        );
      })}
    </div>
  );
}

/** An experiment's menu: a table of its finished runs, its latest runs compared, all of them picked. */
function GroupMenu({ canTable, canCompare, onTable, onCompare, onPickAll }: { canTable: boolean; canCompare: boolean; onTable: () => void; onCompare: () => void; onPickAll: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <>
      <IconButton ref={ref} label="This experiment" size="sm" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={15} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={230}>
        <MenuItem icon={<Table2 size={14} />} disabled={!canTable} onClick={run(onTable)}>
          Make a table
        </MenuItem>
        <MenuItem icon={<SlidersHorizontal size={14} />} disabled={!canCompare} onClick={run(onCompare)}>
          Compare the latest 6
        </MenuItem>
        <MenuItem onClick={run(onPickAll)}>Pick them all</MenuItem>
      </Popover>
    </>
  );
}

const FULL_DATE: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/**
 * One run: its name across the row with the time of what happened last at the right, and under it its status (with
 * how long it took, or how far it is), its key metrics, where it runs (only when runs are in more than one place)
 * and the GPUs it holds. The box to pick it shows when you point at the row, or once anything is picked.
 */
function RunRow({ r, where, picked, anyPicked, onPick, onOpen, open }: { r: RunRecord; where: string | null; picked: boolean; anyPicked: boolean; onPick: () => void; onOpen: () => void; open: boolean }) {
  const m = metricsLine(r);
  const prog = progressOf(r);
  const running = r.status === 'running' || r.status === 'starting';
  const last = !isActive(r) && r.endedAt ? r.endedAt : running ? (r.startedAt ?? r.createdAt) : r.createdAt;
  const parts: { key: string; cls: string; node: React.ReactNode }[] = [
    {
      key: 'status',
      cls: 'shrink-0 whitespace-nowrap',
      node: (
        <>
          <span className={cx('mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle', statusTone(r.status))} />
          <span className="text-fg-2">{endedWords(r)}</span>
        </>
      ),
    },
  ];
  if (prog)
    parts.push({
      key: 'progress',
      cls: 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap',
      node: (
        <>
          <span className="w-12 shrink-0">
            <Meter percent={prog.pct} height={4} color="var(--accent)" />
          </span>
          <span className="tnum">{prog.pct}%</span>
          {prog.left !== undefined && <span>{leftWords(prog.left)}</span>}
        </>
      ),
    });
  if (m) parts.push({ key: 'metrics', cls: 'tnum truncate text-fg-2', node: <span translate="no">{m}</span> });
  if (where) parts.push({ key: 'where', cls: 'truncate', node: <span translate="no">{where}</span> });
  if (running && r.gpuIds?.length) parts.push({ key: 'gpus', cls: 'shrink-0 whitespace-nowrap', node: gpuWords(r.gpuIds) });
  return (
    <div className={cx('group flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors', open ? 'bg-bg-2' : 'hover:bg-bg-1')}>
      <input
        type="checkbox"
        checked={picked}
        onChange={onPick}
        aria-label="Pick this run"
        className={cx('mt-[5px] shrink-0 accent-[var(--accent)] transition-opacity', picked || anyPicked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100')}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" title={r.why}>
        <div className="flex items-baseline gap-2">
          <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">
            {r.name ?? r.id}
          </span>
          <span className="tnum min-w-9 shrink-0 text-right text-[11.5px] whitespace-nowrap text-fg-3" title={new Date(last).toLocaleString(LOCALE, FULL_DATE)}>
            {timeAgo(last)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-fg-3 sm:flex-nowrap">
          {parts.map((p, i) => (
            <span key={p.key} className={cx('min-w-0', p.cls)}>
              {i > 0 && '· '}
              {p.node}
            </span>
          ))}
        </div>
      </button>
    </div>
  );
}

/** The queue's order: running first (newest start first), then waiting (high priority, then oldest first), then ended (newest first). */
function inOrder(rs: RunRecord[]): RunRecord[] {
  const tier = (r: RunRecord) => (r.status === 'running' || r.status === 'starting' ? 0 : r.status === 'queued' || r.status === 'waiting' ? 1 : 2);
  const t = (r: RunRecord) => (tier(r) === 0 ? -(r.startedAt ?? r.createdAt) : tier(r) === 1 ? r.createdAt : -(r.endedAt ?? r.createdAt));
  return [...rs].sort((a, b) => tier(a) - tier(b) || (tier(a) === 1 ? (b.priority ?? 0) - (a.priority ?? 0) : 0) || t(a) - t(b));
}

const FOLDED_KEY = 'hydor.experiments.folded';
/** The experiments folded on this device ("" is the runs without one). */
function readFolded(): Set<string> {
  try {
    const a = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]');
    return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Runs an experiment shows before "Show N more" (the ones going or waiting always show). */
const FIRST_RUNS = 10;

export function ExperimentsPage() {
  const [loc] = useLocation();
  const search = useSearch();
  const q = new URLSearchParams(search);
  const openId = /^\/system\/experiments\/([a-z0-9]{4,32})$/.exec(loc)?.[1] ?? null;
  const openMachine = q.get('m');
  const wide = useMediaQuery('(min-width: 1180px)');
  const { runs, error } = useRuns(true);
  const queue = useQueue();
  const [clusters, setClusters] = useState<ClusterSpec[]>([]);
  const [newRun, setNewRun] = useState<{ from?: RunRecord | null; sweep?: boolean } | null>(null);
  const [compare, setCompare] = useState<RunRecord[]>([]);
  const [tableStart, setTableStart] = useState<TableStart | null>(null);
  const [places, setPlaces] = useState<{ adding?: boolean } | null>(null);
  const [tables, setTables] = useState(false);
  const [sweep, setSweep] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [folded, setFolded] = useState<Set<string>>(readFolded);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<{ q: string; status: Status; where: string }>({ q: '', status: 'all', where: 'all' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const filterRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api<{ clusters: ClusterSpec[] }>('/api/experiments/clusters')
      .then((r) => setClusters(r.clusters))
      .catch(() => {});
  }, [places]);

  // What the address asks to open (the search box's actions, a notice's link), once.
  useEffect(() => {
    const p = new URLSearchParams(search);
    let done = false;
    if (p.get('new')) {
      setNewRun({ sweep: p.get('new') === 'sweep' });
      done = true;
    }
    if (p.get('sweep')) {
      setSweep(p.get('sweep'));
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
      api<{ table: ResultsTable }>(`/api/experiments/tables/${encodeURIComponent(t)}`)
        .then((r) => setTableStart({ table: r.table }))
        .catch(() => toast('That table is no longer kept'));
      done = true;
    }
    if (done) go(loc, true);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const clusterName = (id: string) => clusters.find((c) => c.id === id)?.name ?? id;
  const whereOf = (r: RunRecord) => {
    if (r.machine) return r.machine.name;
    if (r.where?.startsWith('c:')) return clusterName(r.where.slice(2));
    if (r.where?.startsWith('m:')) return r.where.slice(2);
    // This computer by those words (its host name tells you nothing here).
    return 'This computer';
  };
  const placeOf = (r: RunRecord) => (r.machine ? `m:${r.machine.id}` : (r.where ?? 'local'));

  const places_ = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of runs ?? []) {
      const p = placeOf(r);
      if (!seen.has(p)) seen.set(p, p === 'local' ? 'This computer' : (r.machine?.name ?? (p.startsWith('c:') ? clusterName(p.slice(2)) : p.slice(2))));
    }
    return [...seen.entries()];
  }, [runs, clusters]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const words = filter.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const st = STATUS.find((s) => s.id === filter.status)!;
    return (runs ?? []).filter((r) => st.test(r) && (filter.where === 'all' || placeOf(r) === filter.where) && words.every((w) => [r.name, r.group, r.command, r.id, ...(r.tags ?? [])].some((x) => x?.toLowerCase().includes(w))));
  }, [runs, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Runs by experiment, the experiment with the newest run first. */
  const groups = useMemo(() => {
    const m = new Map<string, RunRecord[]>();
    for (const r of shown) {
      const k = r.group ?? '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()]
      .sort((a, b) => Math.max(...b[1].map((r) => r.createdAt)) - Math.max(...a[1].map((r) => r.createdAt)))
      .map(([g, rs]) => [g, inOrder(rs)] as [string, RunRecord[]]);
  }, [shown]);

  const toggleFolded = (g: string) =>
    setFolded((f) => {
      const n = new Set(f);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      try {
        localStorage.setItem(FOLDED_KEY, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  const expand = (g: string) => setExpanded((e) => new Set(e).add(g));

  const pickedRuns = (runs ?? []).filter((r) => picked.has(keyOf(r)));
  const pick = (r: RunRecord) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(keyOf(r))) n.delete(keyOf(r));
      else n.add(keyOf(r));
      return n;
    });
  const openRun = (r: Pick<RunRecord, 'id' | 'machine'>) => go(runPath(r));
  const closeRun = () => go('/system/experiments');

  const going = (runs ?? []).filter((r) => r.status === 'running' || r.status === 'starting').length;
  const waiting = (runs ?? []).filter((r) => r.status === 'queued' || r.status === 'waiting');
  const forGpu = waiting.filter((r) => waitKind(r) === 'gpu').length;
  const line = [going ? `${going} running` : '', waiting.length ? (forGpu === waiting.length ? `${waiting.length} waiting for a GPU` : `${waiting.length} waiting`) : ''].filter(Boolean).join(' · ');
  const filtered = filter.q.trim() || filter.status !== 'all' || filter.where !== 'all';
  const remotePicked = pickedRuns.some((r) => r.machine);

  const list =
    runs === null ? (
      <div className="flex justify-center py-16 text-fg-3">{error ? <p className="text-[13px]">{error}</p> : <Throbber />}</div>
    ) : !runs.length ? (
      <Empty icon={<FlaskConical size={20} />} title="No runs yet">
        <p>Experiments runs your jobs when a GPU is free, keeps a record of each (its code, settings, log and metrics) and tells you when it is done.</p>
        <div className="mt-4 flex justify-center">
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setNewRun({})}>
            New run
          </Button>
        </div>
        <p className="mt-4">or ask any agent: “train this on a free GPU and tell me when it’s done”</p>
      </Empty>
    ) : (
      <div className="space-y-5 pb-24">
        {groups.map(([g, rs]) => {
          const sweepId = rs.find((r) => r.sweep)?.sweep;
          const done = rs.filter((r) => r.status === 'done' && !r.machine);
          const isFolded = folded.has(g);
          const goingN = rs.filter((r) => r.status === 'running' || r.status === 'starting').length;
          const waitingN = rs.filter((r) => r.status === 'queued' || r.status === 'waiting').length;
          const activeN = goingN + waitingN;
          // A search or a filter shows every match; otherwise the first runs, and the ones going or waiting whatever their number.
          const limit = filtered || expanded.has(g) ? rs.length : Math.max(FIRST_RUNS, activeN);
          const more = rs.length - limit;
          return (
            <section key={g}>
              <div className="mb-1 flex items-center gap-2 px-2">
                {/* The pull to the left is the heading's: on the button it would leave the name 4px short of room. */}
                <h2 className="-ml-1 min-w-0 text-[13px] font-semibold text-fg">
                  <button type="button" onClick={() => toggleFolded(g)} aria-expanded={!isFolded} className="flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-bg-1">
                    {isFolded ? <ChevronRight size={14} className="shrink-0 text-fg-3" /> : <ChevronDown size={14} className="shrink-0 text-fg-3" />}
                    <span className="truncate" translate={g ? 'no' : undefined}>
                      {g || 'Runs without an experiment'}
                    </span>
                  </button>
                </h2>
                <span className="tnum text-[12px] text-fg-3">{rs.length}</span>
                {(goingN > 0 || waitingN > 0) && <span className="min-w-0 shrink-[4] truncate text-[12px] text-fg-3">{[goingN ? `${goingN} running` : '', waitingN ? `${waitingN} waiting` : ''].filter(Boolean).join(' · ')}</span>}
                {sweepId && (
                  <button type="button" onClick={() => setSweep(sweepId)} className="flex items-center gap-1 rounded-md px-1.5 text-[12px] text-accent hover:bg-accent-soft">
                    <Waypoints size={12} /> Sweep
                  </button>
                )}
                <span className="flex-1" />
                <GroupMenu canTable={!!done.length && !!g} canCompare={rs.length > 1} onTable={() => setTableStart({ group: g })} onCompare={() => setCompare([...rs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6))} onPickAll={() => setPicked(new Set(rs.map(keyOf)))} />
              </div>
              {!isFolded && (
                <div>
                  {rs.slice(0, limit).map((r) => (
                    <RunRow key={keyOf(r)} r={r} where={places_.length > 1 ? whereOf(r) : null} picked={picked.has(keyOf(r))} anyPicked={picked.size > 0} onPick={() => pick(r)} onOpen={() => openRun(r)} open={openId === r.id && (openMachine ?? null) === (r.machine?.id ?? null)} />
                  ))}
                  {more > 0 && (
                    <button type="button" onClick={() => expand(g)} className="mt-0.5 rounded-lg px-2 py-1.5 text-[12.5px] text-fg-3 hover:bg-bg-1 hover:text-fg-2">
                      {`Show ${more} more`}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {!groups.length && <p className="px-2 py-8 text-center text-[13px] text-fg-3">No run is like that.</p>}
      </div>
    );

  const top = (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-fg-2">
        <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', going ? 'bg-accent' : waiting.length ? 'bg-warn' : 'bg-fg-3')} />
        {line || 'Nothing running now'}
      </div>
      {queue && queue.gpus.length > 0 && <GpuMeters gpus={queue.gpus} runs={runs ?? []} onOpen={(id) => openRun({ id })} />}
      <span className="flex-1" />
      <div className="flex items-center gap-1">
        {filtered && (
          <button type="button" onClick={() => setFilter({ q: '', status: 'all', where: 'all' })} className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-accent hover:bg-accent-soft">
            <X size={13} /> {shown.length} shown
          </button>
        )}
        <Button ref={filterRef} size="sm" variant="ghost" icon={<SlidersHorizontal size={14} />} onClick={() => setFilterOpen((o) => !o)}>
          Find
        </Button>
        <Popover anchor={filterRef} open={filterOpen} onClose={() => setFilterOpen(false)} align="end" width={280} title="Find runs" sheet>
          <div className="p-1.5">
            <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Name, experiment, command" autoFocus className={cx(inputCls, 'h-8.5 text-[13px]')} />
          </div>
          <MenuLabel>Status</MenuLabel>
          {STATUS.map((s) => (
            <MenuItem key={s.id} checked={filter.status === s.id} onClick={() => setFilter({ ...filter, status: s.id })}>
              {s.label}
            </MenuItem>
          ))}
          {places_.length > 1 && (
            <>
              <MenuSep />
              <MenuLabel>Where</MenuLabel>
              <MenuItem checked={filter.where === 'all'} onClick={() => setFilter({ ...filter, where: 'all' })}>
                Everywhere
              </MenuItem>
              {places_.map(([p, name]) => (
                <MenuItem key={p} checked={filter.where === p} onClick={() => setFilter({ ...filter, where: p })}>
                  <span translate={p === 'local' ? undefined : 'no'}>{name}</span>
                </MenuItem>
              ))}
            </>
          )}
        </Popover>
      </div>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setNewRun({})}>
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
            setNewRun({ sweep: true });
          }}
        >
          New sweep
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

  const runPane = openId && <RunView key={`${openMachine ?? ''}:${openId}`} id={openId} machine={openMachine} wide={wide} onClose={closeRun} onAgain={(r) => setNewRun({ from: r })} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {(wide || !openId) && <SystemHeader tab="experiments" actions={actions} />}
      <div className="flex min-h-0 flex-1">
        {(wide || !openId) && (
          <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1100px] px-3 py-4 sm:px-5">
              {runs && runs.length > 0 && top}
              {list}
            </div>
            {picked.size > 0 && (
              <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line bg-bg px-4 py-2.5 pb-[max(10px,var(--safe-bottom))]">
                <span className="text-[13px] text-fg-2">{picked.size} picked</span>
                <span className="flex-1" />
                <Button size="sm" variant="secondary" disabled={pickedRuns.length < 2} onClick={() => setCompare(pickedRuns.slice(0, 8))}>
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
        )}
        {openId && (wide ? <aside className="flex min-h-0 w-[52%] max-w-[880px] shrink-0 flex-col border-l border-line bg-bg">{runPane}</aside> : <div className="flex min-h-0 flex-1 flex-col">{runPane}</div>)}
      </div>
      <NewRun open={!!newRun} from={newRun?.from} sweep={newRun?.sweep} onClose={() => setNewRun(null)} onStarted={(r) => r.run && openRun(r.run)} />
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
      <SweepView
        id={sweep}
        onClose={() => setSweep(null)}
        onTable={(g) => {
          setSweep(null);
          setTableStart({ group: g });
        }}
        onCompare={(rs) => {
          setSweep(null);
          setCompare(rs);
        }}
      />
    </div>
  );
}
