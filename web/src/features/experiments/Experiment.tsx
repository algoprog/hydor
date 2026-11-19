// One experiment (the group its runs share): its category, title and description at the top, with counts and a menu
// to change them, and under it three tabs: its runs as a table (find, filter, choose columns), their charts (pick
// which runs are on them, each keeping its colour while shown) and how its hyperparameters go with a metric.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckSquare, ListFilter, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Sparkles, Table2, Waypoints, X } from 'lucide-react';
import type { ExperimentGroup, RunRecord } from '@shared/experiments';
import { betterOf } from '@shared/experiments';
import { post, put } from '../../lib/api';
import { ago } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuLabel, MenuSep, Popover, Tabs, Throbber } from '../../components/ui';
import { isActive, useSeries, type ExperimentTab } from './api';
import { differingParams, keyMetricOf, MAX_SHOWN, queueOrder, RUN_COLORS, runKey, valueOf } from './analysis';
import { ChartsPanel, type PanelRun } from './ChartsPanel';
import { Params } from './Params';
import { ColumnsMenu, defaultColumns, RunsTable, type RunsColumns, type RunsSort } from './RunsTable';

// ---- kept on this device -------------------------------------------------------------------------------------------

const TAB_KEY = 'hydor.experiments.tab';
const colsKey = (g: string) => `hydor.experiments.cols.${g}`;
const shownKey = (g: string) => `hydor.experiments.shown.${g}`;

function readJson<T>(key: string, ok: (v: unknown) => v is T): T | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return ok(v) ? v : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isColumns = (v: unknown): v is RunsColumns => !!v && typeof v === 'object' && isStrings((v as RunsColumns).metrics) && isStrings((v as RunsColumns).params);

/** A run's sort of the table, kept for each experiment while the page is open. */
const SORTS = new Map<string, RunsSort>();

// ---- the runs on the charts --------------------------------------------------------------------------------------

interface Shown {
  keys: string[];
  /** Index into RUN_COLORS, by run key. */
  slots: Record<string, number>;
}
const isShown = (v: unknown): v is Shown => !!v && typeof v === 'object' && isStrings((v as Shown).keys) && !!(v as Shown).slots && typeof (v as Shown).slots === 'object';

/** Slots for the keys: one that has a valid slot keeps it, the others take the lowest free one. */
function fillSlots(keys: string[], prev: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const k of keys) {
    const s = prev[k];
    if (Number.isInteger(s) && s >= 0 && s < MAX_SHOWN && !used.has(s)) {
      out[k] = s;
      used.add(s);
    }
  }
  for (const k of keys) {
    if (k in out) continue;
    let s = 0;
    while (used.has(s)) s++;
    out[k] = s;
    used.add(s);
  }
  return out;
}

/** At first: the first 8 runs in the queue's order that have curves, else the first 8. */
function defaultKeys(runs: RunRecord[]): string[] {
  const curves = runs.filter((r) => (r.metrics?.repeated?.length ?? 0) > 0);
  return (curves.length ? curves : runs).slice(0, MAX_SHOWN).map(runKey);
}

/** Which runs show on the charts and which colour each has; kept for the experiment on this device. */
function useShown(group: string, runs: RunRecord[]) {
  const [stored, setStored] = useState<Shown | null>(() => readJson(shownKey(group), isShown));
  const auto = useRef<Record<string, number>>({});
  // With nothing stored the first runs show; which ones is worked out once the runs are there, and kept (so it does not shift as runs come and go) until you pick others.
  const first = useRef<string[] | null>(null);
  const state = useMemo<Shown>(() => {
    const live = new Set(runs.map(runKey));
    if (stored) {
      const keys = stored.keys.filter((k) => live.has(k)).slice(0, MAX_SHOWN);
      return { keys, slots: fillSlots(keys, stored.slots) };
    }
    if (!first.current && runs.length) first.current = defaultKeys(runs);
    const keys = (first.current ?? []).filter((k) => live.has(k));
    const slots = fillSlots(keys, auto.current);
    auto.current = slots;
    return { keys, slots };
  }, [stored, runs]);
  const set = (keys: string[]) => {
    const next = { keys, slots: fillSlots(keys, state.slots) };
    setStored(next);
    writeJson(shownKey(group), next);
  };
  const shownSet = useMemo(() => new Set(state.keys), [state]);
  return {
    keys: state.keys,
    has: (r: RunRecord) => shownSet.has(runKey(r)),
    colorOf: (r: RunRecord) => (shownSet.has(runKey(r)) ? RUN_COLORS[state.slots[runKey(r)]] : undefined),
    toggle: (r: RunRecord) => {
      const k = runKey(r);
      if (shownSet.has(k)) set(state.keys.filter((x) => x !== k));
      else if (state.keys.length >= MAX_SHOWN) toast(`Up to ${MAX_SHOWN} runs show at once: hide one first`);
      else set([...state.keys, k]);
    },
    setRuns: (rs: RunRecord[]) => set(rs.slice(0, MAX_SHOWN).map(runKey)),
  };
}

// ---- the edit window -----------------------------------------------------------------------------------------------

/** Title, description and category of an experiment, to change (PUT /api/experiments/groups). */
function EditInfo({ group, info, categories, open, onClose }: { group: string; info?: ExperimentGroup; categories: string[]; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = title.trim() !== (info?.title ?? '') || description.trim() !== (info?.description ?? '') || category.trim() !== (info?.category ?? '');
  const list = useId();
  useEffect(() => {
    if (!open) return;
    setTitle(info?.title ?? '');
    setDescription(info?.description ?? '');
    setCategory(info?.category ?? '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try {
      await put('/api/experiments/groups', { name: group, title: title.trim(), description: description.trim(), category: category.trim() });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit the title and description"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !changed} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-3">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={group} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-3">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className={cx(inputCls, 'h-auto resize-y py-2 leading-snug')} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-3">Category</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} list={list} className={inputCls} />
          <datalist id={list}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
    </Dialog>
  );
}

// ---- the Runs tab --------------------------------------------------------------------------------------------------

type Status = 'all' | 'going' | 'done' | 'failed' | 'stopped';
const STATUS: { id: Status; label: string; test: (r: RunRecord) => boolean }[] = [
  { id: 'all', label: 'Every run', test: () => true },
  { id: 'going', label: 'Running and waiting', test: isActive },
  { id: 'done', label: 'Done', test: (r) => r.status === 'done' },
  { id: 'failed', label: 'Failed or lost', test: (r) => r.status === 'failed' || r.status === 'lost' },
  { id: 'stopped', label: 'Stopped', test: (r) => r.status === 'stopped' },
];

function RunsTab({ group, runs, ordered, placeOf, picked, onPick, onPickMany, onOpenRun, colorOf }: {
  group: string;
  runs: RunRecord[];
  ordered: RunRecord[];
  placeOf: (r: RunRecord) => { id: string; name: string };
  picked: Set<string>;
  onPick: (r: RunRecord) => void;
  onPickMany: (rs: RunRecord[], on: boolean) => void;
  onOpenRun: (r: RunRecord) => void;
  colorOf: (r: RunRecord) => string | undefined;
}) {
  const [find, setFind] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [where, setWhere] = useState('all');
  const [menu, setMenu] = useState(false);
  const [sort, setSort] = useState<RunsSort>(() => SORTS.get(group) ?? null);
  const [custom, setCustom] = useState<RunsColumns | null>(() => readJson(colsKey(group), isColumns));
  const filterRef = useRef<HTMLButtonElement>(null);

  const places = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of runs) {
      const p = placeOf(r);
      if (!m.has(p.id)) m.set(p.id, p.name);
    }
    return [...m.entries()];
  }, [runs, placeOf]);
  const columns = useMemo(() => custom ?? defaultColumns(runs), [custom, runs]);
  const filtered = !!find.trim() || status !== 'all' || where !== 'all';
  const shown = useMemo(() => {
    const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const st = STATUS.find((s) => s.id === status)!;
    return ordered.filter((r) => st.test(r) && (where === 'all' || placeOf(r).id === where) && words.every((w) => [r.name, r.command, r.id, ...(r.tags ?? [])].some((x) => x?.toLowerCase().includes(w))));
  }, [ordered, find, status, where, placeOf]);

  const changeColumns = (c: RunsColumns | null) => {
    setCustom(c);
    writeJson(colsKey(group), c);
  };
  const changeSort = (s: RunsSort) => {
    setSort(s);
    SORTS.set(group, s);
  };

  return (
    <div className="px-5 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="relative w-full sm:w-60">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a run" className={cx(inputCls, 'h-8 pl-8 text-[13px]')} />
        </div>
        <Button ref={filterRef} size="sm" variant="ghost" icon={<ListFilter size={14} />} onClick={() => setMenu((o) => !o)}>
          Filter
        </Button>
        <Popover anchor={filterRef} open={menu} onClose={() => setMenu(false)} width={240} title="Filter" sheet>
          <MenuLabel>Status</MenuLabel>
          {STATUS.map((s) => (
            <MenuItem key={s.id} checked={status === s.id} onClick={() => setStatus(s.id)}>
              {s.label}
            </MenuItem>
          ))}
          {places.length > 1 && (
            <>
              <MenuSep />
              <MenuLabel>Where</MenuLabel>
              <MenuItem checked={where === 'all'} onClick={() => setWhere('all')}>
                Everywhere
              </MenuItem>
              {places.map(([id, name]) => (
                <MenuItem key={id} checked={where === id} onClick={() => setWhere(id)}>
                  <span translate={id === 'local' ? undefined : 'no'}>{name}</span>
                </MenuItem>
              ))}
            </>
          )}
        </Popover>
        <ColumnsMenu runs={runs} columns={columns} onChange={changeColumns} onReset={() => changeColumns(null)} />
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setFind('');
              setStatus('all');
              setWhere('all');
            }}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-accent hover:bg-accent-soft"
          >
            <X size={13} /> {`${shown.length} shown`}
          </button>
        )}
      </div>
      <RunsTable
        runs={shown}
        columns={columns}
        where={places.length > 1 ? (r) => placeOf(r).name : undefined}
        colorOf={colorOf}
        picked={picked}
        onPick={onPick}
        onPickAll={onPickMany}
        onOpen={onOpenRun}
        sort={sort}
        onSort={changeSort}
      />
    </div>
  );
}

// ---- the Charts tab ------------------------------------------------------------------------------------------------

function ChartsTab({ runs, ordered, picked, shown, wide }: { runs: RunRecord[]; ordered: RunRecord[]; picked: Set<string>; shown: ReturnType<typeof useShown>; wide: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const shownRuns = useMemo(() => ordered.filter(shown.has), [ordered, shown.keys]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useSeries(shownRuns);
  const keyMetric = useMemo(() => keyMetricOf(runs), [runs]);
  const panelRuns: PanelRun[] = shownRuns.map((r) => ({
    key: runKey(r),
    label: r.name ?? r.id,
    color: shown.colorOf(r) ?? RUN_COLORS[0],
    series: series[runKey(r)],
    better: r.better,
    last: r.metrics?.last,
    best: r.metrics?.best,
  }));
  const pickedRuns = ordered.filter((r) => picked.has(runKey(r)));
  const act = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const best = () => {
    const m = keyMetric;
    if (!m) return;
    const way = betterOf(m, runs.find((r) => r.better?.[m])?.better);
    const has = runs.filter((r) => valueOf(r, m) !== undefined).sort((a, b) => (way === 'min' ? valueOf(a, m)! - valueOf(b, m)! : valueOf(b, m)! - valueOf(a, m)!));
    shown.setRuns(has);
  };

  const heading = (
    <div className="mb-1.5 flex items-center gap-2">
      <h3 className="text-[12.5px] font-semibold">On the charts</h3>
      <span className="tnum text-[12px] text-fg-3">{`${shownRuns.length} of ${runs.length}`}</span>
      <span className="flex-1" />
      <IconButton ref={ref} label="Which runs show" size="sm" onClick={() => setMenu((o) => !o)}>
        <MoreHorizontal size={15} />
      </IconButton>
      <Popover anchor={ref} open={menu} onClose={() => setMenu(false)} align="end" width={230} title="Which runs show" sheet>
        <MenuItem onClick={act(() => shown.setRuns([...runs].sort((a, b) => b.createdAt - a.createdAt)))}>{`Show the latest ${MAX_SHOWN}`}</MenuItem>
        {keyMetric && <MenuItem onClick={act(best)}>{`Show the best ${MAX_SHOWN}`}</MenuItem>}
        {pickedRuns.length > 0 && <MenuItem onClick={act(() => shown.setRuns(pickedRuns))}>Show the picked runs</MenuItem>}
        <MenuItem onClick={act(() => shown.setRuns([]))}>Hide them all</MenuItem>
      </Popover>
    </div>
  );

  const swatch = (r: RunRecord) => {
    const c = shown.colorOf(r);
    return <span className={cx('h-3.5 w-3.5 shrink-0 rounded-full border-2', !c && 'border-line-2')} style={c ? { background: c, borderColor: c } : undefined} />;
  };
  const dot = (r: RunRecord) => <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', r.status === 'running' || r.status === 'starting' ? 'bg-accent' : r.status === 'done' ? 'bg-ok' : r.status === 'failed' || r.status === 'lost' ? 'bg-err' : r.status === 'waiting' || r.status === 'queued' ? 'bg-warn' : 'bg-fg-3')} />;

  const list = wide ? (
    <div className="max-h-[calc(100dvh-220px)] overflow-y-auto">
      {ordered.map((r) => (
        <button key={runKey(r)} type="button" onClick={() => shown.toggle(r)} aria-pressed={shown.has(r)} className="flex min-h-8 w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-bg-1">
          <span className="mt-px flex">{swatch(r)}</span>
          {/* Two lines: runs of one experiment often share the start of their names. */}
          <span translate="no" title={r.name ?? r.id} className={cx('line-clamp-2 min-w-0 flex-1 text-[12px] leading-snug break-words', shown.has(r) ? 'text-fg' : 'text-fg-2')}>
            {r.name ?? r.id}
          </span>
          <span className="mt-1.5 flex">{dot(r)}</span>
        </button>
      ))}
    </div>
  ) : (
    <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-2">
      {ordered.map((r) => (
        <button key={runKey(r)} type="button" onClick={() => shown.toggle(r)} aria-pressed={shown.has(r)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 text-[12px] hover:bg-bg-1">
          {swatch(r)}
          <span translate="no" className={cx('max-w-[160px] truncate', shown.has(r) ? 'text-fg' : 'text-fg-2')}>
            {r.name ?? r.id}
          </span>
          {dot(r)}
        </button>
      ))}
    </div>
  );

  const panel = (
    <ChartsPanel
      runs={panelRuns}
      empty={shownRuns.length ? 'None of these runs has metrics over steps yet.' : 'Pick runs to show on the charts.'}
    />
  );

  return wide ? (
    <div className="flex items-start gap-4 px-5 py-3">
      <div className="sticky top-2 w-[220px] shrink-0">
        {heading}
        {list}
      </div>
      <div className="min-w-0 flex-1">{panel}</div>
    </div>
  ) : (
    <div className="px-5 py-3">
      {heading}
      {list}
      <div className="mt-2">{panel}</div>
    </div>
  );
}

// ---- the experiment --------------------------------------------------------------------------------------------------

export function ExperimentView(props: {
  /** The experiment (its group); '' for the runs without one. */
  group: string;
  /** All of its runs. */
  runs: RunRecord[];
  /** The runs are still being read: the header shows, and a small loading mark in place of the tab's body. */
  loading?: boolean;
  /** Its title, description and category, when it has them. */
  info?: ExperimentGroup;
  /** Every category in use, for the edit window's suggestions. */
  categories: string[];
  tab: ExperimentTab;
  onTab: (t: ExperimentTab) => void;
  /** Where a run runs, as the page names it ({ id: 'local', name: 'This computer' }…). */
  placeOf: (r: RunRecord) => { id: string; name: string };
  picked: Set<string>;
  onPick: (r: RunRecord) => void;
  onPickMany: (rs: RunRecord[], on: boolean) => void;
  onOpenRun: (r: RunRecord) => void;
  /** New run, or New sweep, in this experiment. */
  onNewRun: (sweep: boolean) => void;
  /** Make a table of its finished runs. */
  onTable: () => void;
  onCompare: (rs: RunRecord[]) => void;
  /** Wide enough for columns side by side (1024px and up). */
  wide: boolean;
  /** On a phone: back to the overview. */
  onBack?: () => void;
}) {
  // Everything about one experiment starts afresh for the next.
  return <Experiment key={props.group} {...props} />;
}

function Experiment(props: Parameters<typeof ExperimentView>[0]) {
  const { group, runs, loading, info, categories, tab, onTab, placeOf, picked, onPick, onPickMany, onOpenRun, onNewRun, onTable, onCompare, wide, onBack } = props;
  const ordered = useMemo(() => queueOrder(runs), [runs]);
  const shown = useShown(group, ordered);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [writing, setWriting] = useState(false);

  const hasParams = runs.length >= 2 && differingParams(runs).length > 0;
  const at: ExperimentTab = tab === 'params' && !hasParams ? 'runs' : tab;

  const pickTab = (t: ExperimentTab) => {
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
    onTab(t);
  };

  const n = (f: (r: RunRecord) => boolean) => runs.filter(f).length;
  const counts = [
    `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}`,
    n((r) => r.status === 'running' || r.status === 'starting') ? `${n((r) => r.status === 'running' || r.status === 'starting')} running` : '',
    n((r) => r.status === 'queued' || r.status === 'waiting') ? `${n((r) => r.status === 'queued' || r.status === 'waiting')} waiting` : '',
    n((r) => r.status === 'done') ? `${n((r) => r.status === 'done')} done` : '',
    n((r) => r.status === 'failed' || r.status === 'lost') ? `${n((r) => r.status === 'failed' || r.status === 'lost')} failed` : '',
  ];
  const lastAt = runs.reduce((t, r) => Math.max(t, r.createdAt, r.startedAt ?? 0, r.endedAt ?? 0), 0);
  if (lastAt) counts.push(`last run ${ago(lastAt)}`);

  const title = group === '' ? 'Runs without an experiment' : info?.title || group;
  const description = info?.description ?? '';

  // "More" for a description longer than three lines.
  const descRef = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    const check = () => {
      if (!open) setLong(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [description, open]);

  const act = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const write = async () => {
    setWriting(true);
    try {
      await post('/api/experiments/groups/describe', { name: group });
      toast('Written');
    } catch (e) {
      toastError(e);
    } finally {
      setWriting(false);
    }
  };
  const canTable = !!group && runs.some((r) => r.status === 'done' && !r.machine);

  return (
    <div className="min-w-0">
      <div className="px-5 pt-4">
        <div className="flex items-start gap-2">
          {onBack && (
            <IconButton label="Back" onClick={onBack} className="-ml-2 shrink-0">
              <ArrowLeft size={17} />
            </IconButton>
          )}
          <div className="min-w-0 flex-1">
            {group !== '' && (
              <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-fg-3">
                {info?.category && (
                  <>
                    <span translate="no" className="truncate tracking-wide uppercase">
                      {info.category}
                    </span>
                    <span>·</span>
                  </>
                )}
                <span translate="no" className="truncate font-mono">
                  {group}
                </span>
              </div>
            )}
            <h2 translate={group === '' ? undefined : 'no'} className="text-[18px] leading-snug font-semibold">
              {title}
            </h2>
          </div>
          <IconButton ref={menuRef} label="This experiment" onClick={() => setMenu((o) => !o)}>
            <MoreHorizontal size={17} />
          </IconButton>
          <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={270} title="This experiment" sheet>
            {group !== '' && (
              <>
                <MenuItem icon={<Pencil size={14} />} onClick={act(() => setEdit(true))}>
                  Edit the title and description
                </MenuItem>
                <MenuItem icon={<Sparkles size={14} />} disabled={writing} onClick={act(write)}>
                  Write them again
                </MenuItem>
                <MenuSep />
                <MenuItem icon={<Plus size={14} />} onClick={act(() => onNewRun(false))}>
                  New run in this experiment
                </MenuItem>
                <MenuItem icon={<Waypoints size={14} />} onClick={act(() => onNewRun(true))}>
                  New sweep in this experiment
                </MenuItem>
                <MenuSep />
                <MenuItem icon={<Table2 size={14} />} disabled={!canTable} onClick={act(onTable)}>
                  Make a table
                </MenuItem>
              </>
            )}
            <MenuItem icon={<SlidersHorizontal size={14} />} disabled={runs.length < 2} onClick={act(() => onCompare([...runs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)))}>
              Compare the latest 6
            </MenuItem>
            <MenuItem icon={<CheckSquare size={14} />} onClick={act(() => onPickMany(runs, true))}>
              Pick them all
            </MenuItem>
          </Popover>
        </div>
        {description && (
          <div className={cx('mt-1', onBack && 'pl-8')}>
            <p ref={descRef} translate="no" className={cx('max-w-[820px] text-[13px] leading-snug whitespace-pre-line text-fg-2', !open && 'line-clamp-3')}>
              {description}
            </p>
            {(long || open) && (
              <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-[12px] text-accent hover:underline">
                {open ? 'Less' : 'More'}
              </button>
            )}
          </div>
        )}
        <p className={cx('mt-1.5 min-h-[18px] text-[12px] text-fg-3', onBack && 'pl-8')}>{loading ? '' : counts.filter(Boolean).join(' · ')}</p>
      </div>

      <div className="mt-2 border-b border-line px-5">
        <Tabs
          dense
          value={at}
          onChange={pickTab}
          options={[
            { value: 'runs', label: 'Runs', count: runs.length },
            { value: 'charts', label: 'Charts' },
            ...(hasParams ? [{ value: 'params' as const, label: 'Hyperparameters' }] : []),
          ]}
        />
      </div>

      {loading && (
        <div className="flex justify-center py-16 text-fg-3">
          <Throbber />
        </div>
      )}
      {!loading && at === 'runs' && <RunsTab group={group} runs={runs} ordered={ordered} placeOf={placeOf} picked={picked} onPick={onPick} onPickMany={onPickMany} onOpenRun={onOpenRun} colorOf={shown.colorOf} />}
      {!loading && at === 'charts' && <ChartsTab runs={runs} ordered={ordered} picked={picked} shown={shown} wide={wide} />}
      {!loading && at === 'params' && <Params runs={runs} onOpenRun={onOpenRun} onTable={onTable} canTable={canTable} onCompare={onCompare} />}

      <EditInfo group={group} info={info} categories={categories} open={edit} onClose={() => setEdit(false)} />
    </div>
  );
}
