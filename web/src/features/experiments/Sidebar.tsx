// The Experiments page's sidebar, and the pieces the Overview shares with it: the queue line, this computer's GPUs as
// small meters, the box to find an experiment, and the experiments themselves (one entry for each group the runs
// share, with its title, description and category) listed by category, the newest first. The sidebar shows on
// screens 1024px wide and up; the Overview shows the same pieces itself on narrower ones.
import { useMemo } from 'react';
import { Home as HomeIcon, Search, X } from 'lucide-react';
import type { ExperimentGroup, GpuNow, QueueNow, RunRecord } from '@shared/experiments';
import { LOCALE } from '../../i18n/locale';
import { timeAgo } from '../../lib/format';
import { Meter } from '../../components/charts';
import { cx, inputCls } from '../../components/ui';

/** One experiment as the page lists it: the group its runs share, what it is, and its runs counted. */
export interface Entry {
  /** The group's name ('' for the runs without one). */
  group: string;
  /** Its title, else the group's name ('' reads as "Runs without an experiment" where it is shown). */
  title: string;
  description: string;
  category: string;
  /** Its runs that are loaded (this computer's and other machines'), in the order they came. */
  runs: RunRecord[];
  /** How many runs it has: the loaded ones, and the older of this computer's that are not loaded (the group's own count). */
  total: number;
  going: number;
  waiting: number;
  /** When its latest run was made, started or ended. */
  lastAt: number;
}

/** "1 run", "23 runs". */
export const runsWords = (n: number) => (n === 1 ? '1 run' : `${n} runs`);
/** "2h ago", "just now". */
export const agoWords = (ts: number) => (timeAgo(ts) === 'just now' ? 'just now' : `${timeAgo(ts)} ago`);
/** The full date of a time, for a tooltip. */
export const fullDate = (ts: number) => new Date(ts).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** The latest moment of a run: when it was made, started or ended. */
export const lastOf = (r: RunRecord) => Math.max(r.createdAt, r.startedAt ?? 0, r.endedAt ?? 0);

/** The experiments the runs make up, the one with the newest run first; also those whose runs are all older than the ones loaded (the groups' own counts). */
export function entriesOf(runs: RunRecord[], groups: Map<string, ExperimentGroup>): Entry[] {
  const by = new Map<string, RunRecord[]>();
  for (const r of runs) {
    const k = r.group ?? '';
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(r);
  }
  const unloaded: Entry[] = [];
  for (const [group, info] of groups) {
    if (group && !by.has(group) && info.runs > 0) {
      unloaded.push({ group, title: info.title?.trim() || group, description: info.description?.trim() ?? '', category: info.category?.trim() ?? '', runs: [], total: info.runs, going: 0, waiting: 0, lastAt: info.lastAt });
    }
  }
  const loaded = [...by.entries()]
    .map(([group, rs]) => {
      const info = groups.get(group);
      const own = rs.filter((r) => !r.machine).length;
      return {
        group,
        title: info?.title?.trim() || group,
        description: info?.description?.trim() ?? '',
        category: info?.category?.trim() ?? '',
        runs: rs,
        total: rs.length + Math.max(0, (info?.runs ?? 0) - own),
        going: rs.filter((r) => r.status === 'running' || r.status === 'starting').length,
        waiting: rs.filter((r) => r.status === 'queued' || r.status === 'waiting').length,
        lastAt: Math.max(...rs.map(lastOf)),
      } satisfies Entry;
    });
  return [...loaded, ...unloaded].sort((a, b) => b.lastAt - a.lastAt);
}

/** An entry that matched a search, and how many of its runs did when only they did. */
export type Found = Entry & { viaRuns?: number };

/** The experiments that match what was typed: by title, description, category, group name, and the names and commands of their runs (an experiment matched only by its runs says how many). */
export function findEntries(entries: Entry[], text: string): Found[] {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  const out: Found[] = [];
  for (const e of entries) {
    const own = e.group ? [e.title, e.description, e.category, e.group].join('\n').toLowerCase() : '';
    if (own && words.every((w) => own.includes(w))) {
      out.push(e);
      continue;
    }
    const n = e.runs.filter((r) => {
      const t = [r.name, r.command, r.id].join('\n').toLowerCase();
      return words.every((w) => t.includes(w) || own.includes(w));
    }).length;
    if (n) out.push({ ...e, viaRuns: n });
  }
  return out;
}

/** The experiments by category: the category with the newest run first, those without one under "Other experiments"; no headings at all when no experiment has a category. The runs without an experiment come last, apart. */
export function byCategory<T extends Entry>(entries: T[]): { blocks: { label: string | null; items: T[] }[]; none: T | null } {
  const none = entries.find((e) => e.group === '') ?? null;
  const named = entries.filter((e) => e.group !== '');
  if (!named.some((e) => e.category)) return { blocks: named.length ? [{ label: null, items: named }] : [], none };
  const cats = new Map<string, { label: string; items: T[]; at: number }>();
  for (const e of named) {
    const k = e.category.toLowerCase();
    const c = cats.get(k) ?? { label: e.category, items: [], at: 0 };
    c.items.push(e);
    c.at = Math.max(c.at, e.lastAt);
    cats.set(k, c);
  }
  const rest = cats.get('');
  cats.delete('');
  const blocks = [...cats.values()].sort((a, b) => b.at - a.at).map((c) => ({ label: c.label as string | null, items: c.items }));
  // Those without a category: a heading of the page's own words, written below.
  if (rest) blocks.push({ label: null, items: rest.items });
  return { blocks, none };
}

/** What runs now and what waits, as a line: "1 running · 2 waiting". */
export function QueueLine({ runs }: { runs: RunRecord[] }) {
  const going = runs.filter((r) => r.status === 'running' || r.status === 'starting').length;
  const waiting = runs.filter((r) => r.status === 'queued' || r.status === 'waiting').length;
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-fg-2">
      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', going ? 'bg-accent' : waiting ? 'bg-warn' : 'bg-fg-3')} />
      {going || waiting ? (
        <span className="min-w-0 truncate">
          {going > 0 && <span>{`${going} running`}</span>}
          {going > 0 && waiting > 0 && <span> · </span>}
          {waiting > 0 && <span>{`${waiting} waiting`}</span>}
        </span>
      ) : (
        <span>Nothing running now</span>
      )}
    </div>
  );
}

/** This computer's GPUs as small meters (memory in use; the ones your runs hold in the accent colour); one that a run holds opens that run. */
export function GpuMeters({ gpus, runs, onOpen, className }: { gpus: GpuNow[]; runs: RunRecord[]; onOpen: (id: string) => void; className?: string }) {
  if (!gpus.length) return null;
  return (
    <div className={cx('grid grid-cols-2 gap-x-3 gap-y-2', className)}>
      {gpus.map((g) => {
        const p = g.memTotal ? (g.memUsed / g.memTotal) * 100 : 0;
        // The run that holds it by its name (it may be one not listed any more).
        const holder = g.run ? runs.find((r) => r.id === g.run && !r.machine) : undefined;
        return (
          <button key={g.index} type="button" disabled={!g.run} onClick={() => g.run && onOpen(g.run)} title={`${g.name} · ${g.util}% busy${g.run ? ` · ${holder ? (holder.name ?? holder.id) : 'one of your runs holds it'}` : ''}`} className="min-w-0 rounded text-left disabled:cursor-default">
            <div className="mb-0.5 flex justify-between gap-2 text-[11px] text-fg-3">
              <span className={g.run ? 'font-medium text-fg-2' : ''}>GPU {g.index}</span>
              <span className="tnum whitespace-nowrap">
                {(g.memUsed / 1024).toFixed(0)}/{(g.memTotal / 1024).toFixed(0)} GB
              </span>
            </div>
            <Meter percent={p} height={4} color={g.run ? 'var(--accent)' : undefined} />
          </button>
        );
      })}
    </div>
  );
}

/** The box that finds an experiment. */
export function FindBox({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && value && onChange('')}
        placeholder="Find an experiment"
        aria-label="Find an experiment"
        spellCheck={false}
        className={cx(inputCls, 'h-8 pr-7 pl-8 text-[13px]')}
      />
      {value && (
        <button type="button" aria-label="Clear" onClick={() => onChange('')} className="absolute top-1/2 right-1 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg-2">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/** An experiment in the list: its title, and under it how many runs and what is going (or when the last was). */
function Item({ e, selected, onOpen }: { e: Found; selected: boolean; onOpen: () => void }) {
  const active = e.going + e.waiting > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'page' : undefined}
      title={e.group && e.title !== e.group ? `${e.title}\n${e.group}` : e.title || undefined}
      className={cx('block w-full min-w-0 rounded-lg px-2.5 py-1.5 text-left transition-colors', selected ? 'bg-bg-2' : 'hover:bg-bg-1')}
    >
      <div translate="no" className="truncate text-[13px] font-medium text-fg">
        {e.group ? e.title : <span translate="yes">Runs without an experiment</span>}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
        {e.viaRuns ? (
          <span className="truncate">{`${e.viaRuns} ${e.viaRuns === 1 ? 'run matches' : 'runs match'}`}</span>
        ) : (
          <>
            {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
            <span className="truncate">
              <span>{runsWords(e.total)}</span>
              <span> · </span>
              {active ? (
                <>
                  {e.going > 0 && <span>{`${e.going} running`}</span>}
                  {e.going > 0 && e.waiting > 0 && <span> · </span>}
                  {e.waiting > 0 && <span>{`${e.waiting} waiting`}</span>}
                </>
              ) : (
                <span title={fullDate(e.lastAt)}>{agoWords(e.lastAt)}</span>
              )}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

/**
 * The sidebar: the queue and the GPUs, a box to find an experiment, the Overview, and the experiments by category.
 * `current` is the experiment open (its group, '' for the runs without one), null on the Overview.
 */
export function Sidebar({ runs, entries, queue, q, onQ, current, onOverview, onOpen, onOpenRun }: { runs: RunRecord[] | null; entries: Entry[]; queue: QueueNow | null; q: string; onQ: (q: string) => void; current: string | null; onOverview: () => void; onOpen: (group: string) => void; onOpenRun: (id: string) => void }) {
  const found = useMemo(() => findEntries(entries, q), [entries, q]);
  const { blocks, none } = useMemo(() => byCategory(found), [found]);
  const hasCategories = blocks.some((b) => b.label !== null);
  return (
    <aside className="hidden min-h-0 w-[232px] shrink-0 flex-col border-r border-line lg:flex xl:w-[256px]">
      <div className="shrink-0 space-y-3 px-3 pt-3.5 pb-2">
        <div className="px-1 space-y-2.5">
          <QueueLine runs={runs ?? []} />
          {queue && <GpuMeters gpus={queue.gpus} runs={runs ?? []} onOpen={onOpenRun} />}
        </div>
        <FindBox value={q} onChange={onQ} />
      </div>
      <nav aria-label="Experiments" className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-4">
        <button type="button" onClick={onOverview} aria-current={current === null ? 'page' : undefined} className={cx('mb-2 flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors', current === null ? 'bg-bg-2 text-fg' : 'text-fg-2 hover:bg-bg-1')}>
          <HomeIcon size={14} className="shrink-0 text-fg-3" />
          Overview
        </button>
        {runs === null ? (
          <div className="space-y-2 px-2.5 pt-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-4/5 animate-pulse rounded bg-bg-2" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-bg-1" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {blocks.map((b, i) => (
              <div key={b.label ?? `other${i}`} className="mb-2">
                {hasCategories &&
                  (b.label !== null ? (
                    <div translate="no" className="truncate px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
                      {b.label}
                    </div>
                  ) : (
                    <div className="truncate px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Other experiments</div>
                  ))}
                {b.items.map((e) => (
                  <Item key={e.group} e={e} selected={current === e.group} onOpen={() => onOpen(e.group)} />
                ))}
              </div>
            ))}
            {none && <Item e={none} selected={current === ''} onOpen={() => onOpen('')} />}
            {!found.length && q.trim() && <p className="px-2.5 py-3 text-[12.5px] text-fg-3">No experiment is like that.</p>}
          </>
        )}
      </nav>
    </aside>
  );
}
