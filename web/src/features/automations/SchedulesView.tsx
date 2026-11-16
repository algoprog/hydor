// Schedules (/agents/schedules, a tab of the Agents page): everything that runs by itself, in one place. A week (or a
// month) of what ran, each run coloured by how it went and opening its session or its app run, and of what will run,
// drawn faintly with its name; what repeats every few minutes, watchers and webhooks as one band a day rather than a
// block a run; each day's cost on its column. Under it, the list of every scheduled task, agent's schedule, app's
// schedule, watcher and webhook, with its last result, its next run, a switch to pause it and a link to where it is
// changed (editing stays where it was). On a phone, one day at a time (arrows, or a swipe) and the list.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { AppWindow, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Eye, LayoutDashboard, Pencil, Plus, Repeat, Webhook } from 'lucide-react';
import { OUTCOME_LABEL, TRIGGER_LABEL, type RunStatus } from '@shared/automations';
import { addDate, mondayOf, type ScheduleItem, type ScheduleWeek, type WeekBand, type WeekDay, type WeekNext, type WeekRun } from '@shared/schedules';
import { api, enc, post } from '../../lib/api';
import { money, timeAgo, untilText } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Badge, Button, cx, IconButton, Popover, Segmented, Switch, Throbber, useIsMobile } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';
import { AssistantIcon } from '../assistants/icons';
import { layLanes } from './lanes';
import { localTime, OutcomeBadge, RunDots } from './parts';

// ---- how runs look ------------------------------------------------------------------------------------------------

type Tone = 'done' | 'silent' | 'needs' | 'failed' | 'running';
const TONES: Tone[] = ['done', 'silent', 'needs', 'failed', 'running'];
const toneOf = (s: RunStatus): Tone => (s === 'done' ? 'done' : s === 'silent' ? 'silent' : s === 'partial' || s === 'blocked' ? 'needs' : s === 'running' ? 'running' : 'failed');
const TONE_LABEL: Record<Tone, string> = { done: 'Done', silent: 'Nothing new', needs: 'Needs you', failed: 'Failed', running: 'Running' };
const DOT: Record<Tone, string> = { done: 'bg-ok', silent: 'bg-fg/30', needs: 'bg-warn', failed: 'bg-err', running: 'bg-info' };
const BLOCK: Record<Tone, string> = {
  done: 'border-ok bg-ok/15',
  silent: 'border-fg/30 bg-fg/8',
  needs: 'border-warn bg-warn/15',
  failed: 'border-err bg-err/15',
  running: 'border-info bg-info/15 animate-pulse',
};
const TEXT: Record<Tone, string> = { done: 'text-ok', silent: 'text-fg-3', needs: 'text-warn', failed: 'text-err', running: 'text-info' };

/** Counts by outcome, gathered by how they look. */
function byTone(by: Partial<Record<RunStatus, number>>): Record<Tone, number> {
  const out: Record<Tone, number> = { done: 0, silent: 0, needs: 0, failed: 0, running: 0 };
  for (const [s, n] of Object.entries(by)) out[toneOf(s as RunStatus)] += n ?? 0;
  return out;
}

/** A thin bar of how runs went, a part for each outcome. */
function ToneBar({ by, className }: { by: Partial<Record<RunStatus, number>>; className?: string }) {
  const t = byTone(by);
  const total = TONES.reduce((a, k) => a + t[k], 0);
  if (!total) return null;
  return (
    <span className={cx('flex h-1.5 overflow-hidden rounded-full bg-bg-3', className)}>
      {TONES.filter((k) => t[k]).map((k) => (
        <span key={k} className={DOT[k]} style={{ flex: t[k] }} />
      ))}
    </span>
  );
}

// ---- dates and times, in the user's time zone (the server gives each run its day and minute) -----------------------

const utc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtDate = (date: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { ...o, timeZone: 'UTC' }).format(utc(date));
const fmtMin = (min: number) => new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, Math.floor(min / 60), min % 60));
const fmtHour = (h: number) => new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, h));
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);

/** The minute of the day now is in a time zone. */
function minuteIn(tz: string, at: number): number {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
        .formatToParts(at)
        .map((x) => [x.type, x.value]),
    );
    return (Number(p.hour) % 24) * 60 + Number(p.minute);
  } catch {
    return new Date(at).getHours() * 60 + new Date(at).getMinutes();
  }
}

/** A month's weeks, Monday to Sunday: its first day and how many days. */
function monthRange(month: string): { start: string; days: number } {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const start = mondayOf(first);
  return { start, days: daysBetween(start, addDate(mondayOf(last), 6)) + 1 };
}

/** A day's runs of what the filter shows: how many, how they went, what they cost, and how many are to come (and
 * how many more of what repeats every few minutes, apart). */
interface Tally {
  runs: number;
  by: Partial<Record<RunStatus, number>>;
  cost: number;
  planned: number;
  often: number;
}

function tallies(data: ScheduleWeek, shown: (id: string) => boolean): Tally[] {
  const out: Tally[] = data.days.map(() => ({ runs: 0, by: {}, cost: 0, planned: 0, often: 0 }));
  const count = (t: Tally, by: Partial<Record<RunStatus, number>>) => {
    for (const [k, v] of Object.entries(by)) t.by[k as RunStatus] = (t.by[k as RunStatus] ?? 0) + (v ?? 0);
  };
  for (const r of data.runs) {
    if (!shown(r.task)) continue;
    const t = out[r.day];
    t.runs++;
    count(t, { [r.status]: 1 });
    t.cost += r.costUsd ?? 0;
  }
  for (const b of data.bands) {
    if (!shown(b.task)) continue;
    const t = out[b.day];
    t.runs += b.runs;
    count(t, b.by);
    t.cost += b.costUsd;
    t.often += b.planned;
  }
  for (const x of data.next) if (shown(x.task)) out[x.day].planned++;
  return out;
}

// ---- what runs by itself -----------------------------------------------------------------------------------------

type Filter = 'all' | 'task' | 'agent' | 'app' | 'board' | 'watch' | 'webhook' | 'paused';
const matches = (it: ScheduleItem, f: Filter) => f === 'all' || (f === 'paused' ? !it.enabled : f === 'watch' || f === 'webhook' ? it.kind === f : it.source === f);

function KindIcon({ it, size = 15 }: { it: ScheduleItem; size?: number }) {
  if (it.kind === 'watch') return <Eye size={size} />;
  if (it.kind === 'webhook') return <Webhook size={size} />;
  if (it.band) return <Repeat size={size} />;
  if (it.agent) return <AssistantIcon icon={it.agent.icon ?? 'bot'} size={size - 3} plain />;
  if (it.source === 'app') return <AppWindow size={size} />;
  if (it.source === 'board') return <LayoutDashboard size={size} />;
  return <CalendarClock size={size} />;
}

/** "Agent · Paper scout", "App · Explore", "Task". */
function Source({ it }: { it: ScheduleItem }) {
  return it.agent ? (
    <span className="shrink-0 text-fg-3">
      Agent · <span translate="no">{it.agent.name}</span>
    </span>
  ) : it.app ? (
    <span className="shrink-0 text-fg-3">
      App · <span translate="no">{it.app.name ?? it.name}</span>
    </span>
  ) : it.board ? (
    <span className="shrink-0 text-fg-3">
      Board · <span translate="no">{it.board.name}</span>
    </span>
  ) : (
    <span className="shrink-0 text-fg-3">Task</span>
  );
}

const editTitle = (it: ScheduleItem) => (it.agent ? 'Change it on its agent’s page' : it.app ? 'Change it on its app’s page' : it.board ? 'Change it on its board' : 'Change it in Settings → Scheduled tasks');

// ---- what a click opens -----------------------------------------------------------------------------------------

type Pick =
  | { kind: 'run'; run: WeekRun }
  | { kind: 'next'; next: WeekNext }
  | { kind: 'crowd'; entries: Entry[] }
  | { kind: 'band'; item: ScheduleItem; day: WeekDay; band?: WeekBand };

type Entry = { kind: 'run'; run: WeekRun } | { kind: 'next'; next: WeekNext };

/** A block's task, minute and a key of its own. */
const entryOf = (e: Entry) => (e.kind === 'run' ? { task: e.run.task, min: e.run.min, key: e.run.id } : { task: e.next.task, min: e.next.min, key: `n${e.next.task}${e.next.at}` });

function Detail({ pick, data, items, onPick, onClose }: { pick: Pick; data: ScheduleWeek; items: Map<string, ScheduleItem>; onPick: (p: Pick) => void; onClose: () => void }) {
  const open = (f: () => void) => () => (onClose(), f());
  if (pick.kind === 'crowd')
    return (
      <div className="p-1.5">
        <div className="px-1.5 pt-0.5 pb-1.5 text-[12.5px] font-medium text-fg-2">
          {pick.entries.length} at about {fmtMin(entryOf(pick.entries[0]).min)}
        </div>
        {pick.entries.map((e) => {
          const x = entryOf(e);
          return (
            <button key={x.key} type="button" onClick={() => onPick(e)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[13px] hover:bg-bg-2">
              <span className={cx('h-2 w-2 shrink-0 rounded-full', e.kind === 'run' ? DOT[toneOf(e.run.status)] : 'border border-dashed border-fg-3')} />
              <span className="shrink-0 text-[12px] whitespace-nowrap text-fg-3 tabular-nums">{fmtMin(x.min)}</span>
              <span translate="no" className="min-w-0 flex-1 truncate">
                {items.get(x.task)?.name}
              </span>
            </button>
          );
        })}
      </div>
    );
  const it = items.get(pick.kind === 'run' ? pick.run.task : pick.kind === 'next' ? pick.next.task : pick.item.id);
  if (!it) return null;
  const edit = (
    <Button size="sm" variant="ghost" icon={<Pencil size={13} />} title={editTitle(it)} onClick={open(() => go(it.edit))}>
      Edit
    </Button>
  );
  const head = (top: ReactNode) => (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">{top}</div>
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-fg-3">
          <KindIcon it={it} size={14} />
        </span>
        <span translate="no" className="min-w-0 flex-1 text-[14px] leading-snug font-semibold break-words">
          {it.name}
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 text-[12px]">
        <Source it={it} />
        <span className="text-fg-3">· {it.when}</span>
      </div>
    </>
  );
  if (pick.kind === 'run') {
    const r = pick.run;
    return (
      <div className="p-2.5">
        {head(
          <>
            <OutcomeBadge status={r.status} />
            <span>{localTime(r.at, data.tz)}</span>
            {r.mins > 0 && <span>· {r.mins} min</span>}
            {!!r.costUsd && <span>· {money(r.costUsd)}</span>}
            {r.trigger !== 'schedule' && <span>· {TRIGGER_LABEL[r.trigger]}</span>}
          </>,
        )}
        {r.summary && (
          <p translate="no" className="mt-2 line-clamp-4 text-[12.5px] leading-snug text-fg-2">
            {r.summary}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {r.appRun ? (
            <Button size="sm" variant="secondary" onClick={open(() => go(`/apps/runs/${enc(r.appRun!)}`))}>
              Open its run
            </Button>
          ) : (
            r.key && (
              <Button size="sm" variant="secondary" onClick={open(() => openSession(r.key!))}>
                Open its session
              </Button>
            )
          )}
          {edit}
        </div>
      </div>
    );
  }
  if (pick.kind === 'next')
    return (
      <div className="p-2.5">
        {head(
          <>
            <Badge>To come</Badge>
            <span>{localTime(pick.next.at, data.tz)}</span>
            <span>· {untilText(pick.next.at)}</span>
          </>,
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">{edit}</div>
      </div>
    );
  const b = pick.band;
  const t = byTone(b?.by ?? {});
  return (
    <div className="p-2.5">
      {head(<span>{fmtDate(pick.day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>)}
      <div className="mt-2 space-y-1 text-[12.5px] text-fg-2">
        {b?.runs ? (
          <>
            <div>
              {b.runs === 1 ? '1 run' : `${b.runs} runs`}
              {b.costUsd > 0 ? ` · ${money(b.costUsd)}` : ''}
            </div>
            <ToneBar by={b.by} />
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
              {TONES.filter((k) => t[k]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className={cx('h-[7px] w-[7px] rounded-full', DOT[k])} />
                  {TONE_LABEL[k]} {t[k]}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-fg-3">{it.kind === 'watch' ? 'It looked, and found nothing new to run for.' : it.kind === 'webhook' ? 'Nothing called it.' : 'No runs.'}</div>
        )}
        {!!b?.planned && <div className="text-fg-3">{b.planned === 1 ? '1 more to come' : `${b.planned} more to come`}</div>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {it.last?.key && !it.last.appRun && (
          <Button size="sm" variant="secondary" onClick={open(() => openSession(it.last!.key!))}>
            Open the latest
          </Button>
        )}
        {edit}
      </div>
    </div>
  );
}

// ---- the week (or a phone's day) ---------------------------------------------------------------------------------

const HOUR = 44;
const PX = HOUR / 60;
const MIN_BLOCK = 22;
const GUTTER = 46;

function Block({ entry, top, height, lane, lanes, wide, items, onPick }: { entry: Entry; top: number; height: number; lane: number; lanes: number; wide: boolean; items: Map<string, ScheduleItem>; onPick: (p: Pick, el: HTMLElement) => void }) {
  const r = entry.kind === 'run' ? entry.run : null;
  const { task, min } = entryOf(entry);
  const it = items.get(task);
  const tone = r ? toneOf(r.status) : null;
  return (
    <button
      type="button"
      onClick={(e) => onPick(entry, e.currentTarget)}
      title={`${it?.name ?? ''} · ${fmtMin(min)}${r ? ` · ${OUTCOME_LABEL[r.status]}` : ''}`}
      className={cx(
        'absolute overflow-hidden rounded-md border text-left text-[11.5px] leading-tight transition-[filter] hover:brightness-110 focus-visible:z-10',
        r ? cx('border-l-[3px] text-fg', BLOCK[tone!]) : 'border-dashed border-fg/25 bg-bg/40 text-fg-3',
      )}
      style={{ top, height: Math.max(MIN_BLOCK, height) - 2, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
    >
      <span className="flex min-w-0 items-baseline gap-1 px-1.5 pt-[3px]">
        <span translate="no" className="min-w-0 truncate font-medium">
          {it?.name}
        </span>
        {wide && lanes === 1 && <span className="shrink-0 text-[10.5px] opacity-70 tabular-nums">{fmtMin(min)}</span>}
      </span>
    </button>
  );
}

function BandRow({ it, data, bands, cols, onPick }: { it: ScheduleItem; data: ScheduleWeek; bands: Map<string, WeekBand>; cols: string; onPick: (p: Pick, el: HTMLElement) => void }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: cols }}>
      <div className="flex min-w-0 items-center gap-1.5 px-2 pt-1.5 text-[11.5px] text-fg-3" style={{ gridColumn: '1 / -1', paddingLeft: GUTTER + 6 }}>
        <KindIcon it={it} size={12} />
        <span translate="no" className={cx('max-w-[60%] shrink-0 truncate font-medium', it.enabled ? 'text-fg-2' : 'text-fg-3 line-through')}>
          {it.name}
        </span>
        <span className="min-w-0 truncate">· {it.when}</span>
      </div>
      <div />
      {data.days.map((d, i) => {
        const b = bands.get(`${it.id}\n${i}`);
        return (
          <button
            key={d.date}
            type="button"
            onClick={(e) => onPick({ kind: 'band', item: it, day: d, band: b }, e.currentTarget)}
            className="mx-1 my-1 flex h-5 min-w-0 items-center gap-1.5 rounded-md px-1.5 hover:bg-bg-2"
            title={b ? `${b.runs} ran${b.planned ? ` · ${b.planned} to come` : ''}` : undefined}
          >
            {b?.runs ? <ToneBar by={b.by} className="min-w-0 flex-1" /> : <span className={cx('h-0 min-w-0 flex-1 border-t', b?.planned ? 'border-dashed border-fg/30' : 'border-line')} />}
            {!!b?.runs && <span className="shrink-0 text-[11px] text-fg-2 tabular-nums">{b.runs}</span>}
            {!!b?.planned && <span className="shrink-0 text-[11px] text-fg-4 tabular-nums">+{b.planned}</span>}
          </button>
        );
      })}
    </div>
  );
}

function WeekGrid({
  data,
  items,
  shown,
  tally,
  onPick,
  onSwipe,
}: {
  data: ScheduleWeek;
  items: Map<string, ScheduleItem>;
  shown: (id: string) => boolean;
  tally: Tally[];
  onPick: (p: Pick, el: HTMLElement) => void;
  onSwipe?: (dir: -1 | 1) => void;
}) {
  const n = data.days.length;
  const cols = `${GUTTER}px repeat(${n}, minmax(0, 1fr))`;
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  const [bandsOpen, setBandsOpen] = useState(true);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const bandItems = data.items.filter((it) => it.band && shown(it.id));
  const bands = useMemo(() => new Map(data.bands.map((b) => [`${b.task}\n${b.day}`, b])), [data.bands]);
  // Each day's blocks, laid out in lanes.
  const columns = useMemo(
    () =>
      data.days.map((_, day) => {
        const blocks = [
          ...data.runs.filter((r) => r.day === day && shown(r.task)).map((r) => ({ item: { kind: 'run', run: r } as Entry, top: r.min * PX, bottom: r.min * PX + Math.max(MIN_BLOCK, r.mins * PX) })),
          ...data.next.filter((x) => x.day === day && shown(x.task)).map((x) => ({ item: { kind: 'next', next: x } as Entry, top: x.min * PX, bottom: x.min * PX + MIN_BLOCK })),
        ];
        return layLanes(blocks, n === 1 ? 4 : 3);
      }),
    [data, shown, n],
  );
  // Opened at the first run of the range (or at 07:00), an hour before it.
  useEffect(() => {
    if (scrolled.current || !scroller.current) return;
    const first = Math.min(7 * 60, ...data.runs.map((r) => r.min), ...data.next.map((x) => x.min));
    scroller.current.scrollTop = Math.max(0, (first - 60) * PX);
    scrolled.current = true;
  }, [data]);
  const todayAt = data.days.findIndex((d) => d.date === data.today);
  const nowMin = minuteIn(data.tz, Date.now());
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const touch = onSwipe
    ? {
        onTouchStart: (e: TouchEvent) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }),
        onTouchEnd: (e: TouchEvent) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
        },
      }
    : {};
  return (
    <div {...touch}>
      {/* The days: each with its cost (a phone's one day has them in the bar above). */}
      <div className={cx('grid border-b border-line', n === 1 && 'hidden')} style={{ gridTemplateColumns: cols }}>
        <div />
        {data.days.map((d, i) => {
          const today = d.date === data.today;
          const t = tally[i];
          const failed = byTone(t.by).failed;
          return (
            <div key={d.date} className="min-w-0 px-1.5 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className={cx('text-[12px]', today ? 'text-accent' : 'text-fg-3')}>{fmtDate(d.date, { weekday: 'short' })}</span>
                <span className={cx('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] font-semibold tabular-nums', today ? 'bg-accent text-white' : 'text-fg')}>
                  {fmtDate(d.date, { day: 'numeric' })}
                </span>
              </div>
              <div className="flex min-h-4 items-center justify-center gap-1.5 text-[11.5px] text-fg-3">
                {t.cost > 0 && <span title="What its runs cost">{money(t.cost)}</span>}
                {failed > 0 && <span className="text-err">{failed === 1 ? '1 failed' : `${failed} failed`}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {/* What runs every few minutes, watchers and webhooks: one band a day. */}
      {bandItems.length > 0 && (
        <div className="border-b border-line pb-1">
          <button type="button" onClick={() => setBandsOpen((o) => !o)} aria-expanded={bandsOpen} className="flex w-full items-center gap-1.5 px-3 pt-1.5 text-[11.5px] text-fg-3 hover:text-fg">
            <ChevronDown size={13} className={cx('transition-transform', !bandsOpen && '-rotate-90')} />
            Every few minutes, watchers and webhooks · {bandItems.length}
          </button>
          {bandsOpen && bandItems.map((it) => <BandRow key={it.id} it={it} data={data} bands={bands} cols={cols} onPick={onPick} />)}
        </div>
      )}
      {/* The hours. */}
      <div ref={scroller} className={cx('relative overflow-y-auto overscroll-contain', n === 1 ? 'h-[62vh]' : 'h-[min(600px,62vh)]')}>
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10.5px] text-fg-4 tabular-nums" style={{ top: (h + 1) * HOUR }}>
                {fmtHour(h + 1)}
              </span>
            ))}
          </div>
          {data.days.map((d, day) => (
            <div key={d.date} className={cx('relative border-l border-line', day === todayAt && 'bg-accent/4')}>
              {Array.from({ length: 23 }, (_, h) => (
                <span key={h} className="pointer-events-none absolute inset-x-0 border-t border-line/60" style={{ top: (h + 1) * HOUR }} />
              ))}
              {columns[day].placed.map((p) => (
                <Block key={entryOf(p.item).key} wide={n === 1} entry={p.item} top={p.top} height={p.height} lane={p.lane} lanes={p.lanes} items={items} onPick={onPick} />
              ))}
              {columns[day].crowds.map((c) => (
                <button
                  key={`c${c.top}`}
                  type="button"
                  onClick={(e) => onPick({ kind: 'crowd', entries: c.items }, e.currentTarget)}
                  className="absolute overflow-hidden rounded-md border border-line-2 bg-bg-2 px-1 text-center text-[11.5px] font-medium text-fg-2 hover:bg-bg-3"
                  style={{ top: c.top, height: Math.max(MIN_BLOCK, c.height) - 2, left: `calc(${(c.lane / c.lanes) * 100}% + 2px)`, width: `calc(${100 / c.lanes}% - 4px)` }}
                  title={`${c.items.length} more`}
                >
                  +{c.items.length}
                </button>
              ))}
              {day === todayAt && (
                <span className="pointer-events-none absolute inset-x-0 z-[1] h-0.5 bg-accent" style={{ top: nowMin * PX }}>
                  <span className="absolute -top-[3px] -left-[4px] h-2 w-2 rounded-full bg-accent" />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- the month ---------------------------------------------------------------------------------------------------

function MonthGrid({ data, month, tally, onDay }: { data: ScheduleWeek; month: string; tally: Tally[]; onDay: (date: string) => void }) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line">
        {data.days.slice(0, 7).map((d) => (
          <div key={d.date} className="py-2 text-center text-[12px] text-fg-3">
            {fmtDate(d.date, { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {data.days.map((d, i) => {
          const today = d.date === data.today;
          const t = tally[i];
          const failed = byTone(t.by).failed;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onDay(d.date)}
              title="Open its week"
              className={cx('flex min-h-[92px] min-w-0 flex-col gap-1 border-b border-line p-1.5 text-left hover:bg-bg-2', i % 7 && 'border-l', !d.date.startsWith(month) && 'opacity-45', today && 'bg-accent/4')}
            >
              <span className="flex items-center justify-between gap-1">
                <span className={cx('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12.5px] font-semibold tabular-nums', today ? 'bg-accent text-white' : 'text-fg')}>
                  {fmtDate(d.date, { day: 'numeric' })}
                </span>
                {t.cost > 0 && <span className="truncate text-[11px] text-fg-3">{money(t.cost)}</span>}
              </span>
              <ToneBar by={t.by} />
              <span className="text-[11.5px] leading-snug text-fg-3">
                {t.runs > 0 && <span className="block truncate">{t.runs === 1 ? '1 ran' : `${t.runs} ran`}</span>}
                {failed > 0 && <span className="block truncate text-err">{failed === 1 ? '1 failed' : `${failed} failed`}</span>}
                {t.planned > 0 && <span className="block truncate text-fg-4">{t.planned} to come</span>}
                {t.often > 0 && (
                  <span className="block truncate text-fg-4" title="Runs to come of what repeats every few minutes">
                    +{t.often} repeats
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- the list ----------------------------------------------------------------------------------------------------

function ItemRow({ it, onChanged }: { it: ScheduleItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const failedStart = it.lastStatus && it.lastStatus !== 'ok';
  const toggle = (on: boolean) => {
    setBusy(true);
    post(`/api/automations/tasks/${enc(it.id)}/enabled`, { on })
      .then(onChanged, toastError)
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex items-start gap-3 px-3.5 py-3 sm:px-4">
      <span className="mt-0.5 flex w-4 shrink-0 justify-center text-fg-3">
        <KindIcon it={it} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span translate="no" className="min-w-0 truncate text-[13.5px] font-medium">
            {it.name}
          </span>
          <span className="text-[12px]">
            <Source it={it} />
          </span>
        </div>
        <div className="mt-0.5 text-[12px] text-fg-3">
          {it.when}
          {it.enabled ? (it.nextAt && it.kind !== 'watch' ? ` · next ${untilText(it.nextAt)}` : '') : ' · Paused'}
        </div>
        {it.pausedReason && !it.enabled && <div className="mt-0.5 text-[12px] text-warn">{it.pausedReason}</div>}
        {it.last ? (
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
            <RunDots recent={it.recent} />
            <span className="shrink-0">
              Last run {timeAgo(it.last.at)} ago: <span className={TEXT[toneOf(it.last.status)]}>{OUTCOME_LABEL[it.last.status]}</span>
            </span>
            {it.last.summary && (
              <span translate="no" className="min-w-0 truncate text-fg-3 max-sm:hidden">
                · {it.last.summary}
              </span>
            )}
            {it.last.appRun ? (
              <button type="button" className="shrink-0 text-accent hover:underline" onClick={() => go(`/apps/runs/${enc(it.last!.appRun!)}`)}>
                Open
              </button>
            ) : (
              it.last.key && (
                <button type="button" className="shrink-0 text-accent hover:underline" onClick={() => openSession(it.last!.key!)}>
                  Open
                </button>
              )
            )}
          </div>
        ) : (
          <div className="mt-1 text-[12px] text-fg-4">No runs yet</div>
        )}
        {failedStart && <div className="mt-0.5 text-[12px] text-err">Could not start: {it.lastStatus}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {busy ? <Throbber size={14} className="mx-2 text-fg-3" /> : <Switch on={it.enabled} label={it.enabled ? 'Pause' : 'Turn on'} onChange={toggle} />}
        <IconButton label={editTitle(it)} size="sm" onClick={() => go(it.edit)}>
          <Pencil size={14} />
        </IconButton>
      </div>
    </div>
  );
}

// ---- the view ----------------------------------------------------------------------------------------------------

export function SchedulesView() {
  const mobile = useIsMobile();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  /** The week's Monday, the phone's day, the month (YYYY-MM): unset, this week and today. */
  const [week, setWeek] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<ScheduleWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [pick, setPick] = useState<Pick | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const shownMode = mobile ? 'day' : mode;
  const query =
    shownMode === 'day'
      ? `days=1${day ? `&start=${day}` : ''}`
      : shownMode === 'month' && month
        ? `start=${monthRange(month).start}&days=${monthRange(month).days}`
        : `days=7${week ? `&start=${week}` : ''}`;
  // Only the answer for what is asked now counts (moving fast through the weeks).
  const asked = useRef(query);
  asked.current = query;
  const load = useCallback(
    () =>
      api<ScheduleWeek>(`/api/automations/week?${query}`)
        .then((r) => asked.current === query && setData(r), toastError)
        .finally(() => asked.current === query && setLoading(false)),
    [query],
  );
  useEffect(() => {
    setLoading(true);
    load();
    // Again when tasks change (a run starts or ends, one is paused), and every minute for what comes next.
    window.addEventListener('wa:tasks', load);
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 60_000);
    return () => {
      window.removeEventListener('wa:tasks', load);
      clearInterval(t);
    };
  }, [load]);
  const items = useMemo(() => new Map((data?.items ?? []).map((it) => [it.id, it])), [data]);
  const shown = useCallback((id: string) => {
    const it = items.get(id);
    return !!it && matches(it, filter);
  }, [items, filter]);
  const onPick = (p: Pick, el: HTMLElement) => {
    anchor.current = el;
    setPick(p);
  };

  if (!data) return <Throbber className="mx-auto my-10 text-fg-3" size={24} />;
  if (!data.items.length)
    return (
      <section className="rounded-2xl border border-dashed border-line-2 px-5 py-8 text-center">
        <div className="text-[15px] font-semibold">Nothing runs by itself yet</div>
        <div className="mx-auto mt-1 max-w-[520px] text-[13.5px] text-fg-3">
          Give an agent a schedule, set up a scheduled task, or have an app run by itself, and you will see here what ran, how it went, and what runs next.
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => go('/settings?s=tasks')}>
            New task
          </Button>
          <Button variant="secondary" icon={<Plus size={14} />} onClick={() => go('/agents?new=1')}>
            New agent
          </Button>
        </div>
      </section>
    );

  // Moving through time.
  const thisMonth = data.today.slice(0, 7);
  const curMonth = month ?? thisMonth;
  const shift = (dir: -1 | 1) => {
    setPick(null);
    if (shownMode === 'day') setDay(addDate(data.start, dir));
    else if (shownMode === 'month') {
      const [y, m] = curMonth.split('-').map(Number);
      setMonth(new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 7));
    } else setWeek(addDate(data.start, 7 * dir));
  };
  // Back to today: this week, today, or this month (a month is always asked for by its name).
  const toToday = () => (setPick(null), setDay(null), setWeek(null), setMonth(thisMonth));
  const atToday =
    shownMode === 'day' ? data.start === data.today : shownMode === 'month' ? curMonth === thisMonth : data.days.some((d) => d.date === data.today) && data.days.length === 7;
  const [prevLabel, nextLabel] = shownMode === 'day' ? ['Previous day', 'Next day'] : shownMode === 'month' ? ['Previous month', 'Next month'] : ['Previous week', 'Next week'];
  const label =
    shownMode === 'day'
      ? fmtDate(data.start, { weekday: 'long', day: 'numeric', month: 'long' })
      : shownMode === 'month'
        ? fmtDate(`${curMonth}-01`, { month: 'long', year: 'numeric' })
        : new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatRange(utc(data.start), utc(data.days[data.days.length - 1].date));
  // The days asked for have come (until then, the last range stays in the bar, not in a grid of another size).
  const ready = data.days.length === (shownMode === 'day' ? 1 : shownMode === 'month' ? monthRange(curMonth).days : 7);
  // The range's totals (the month's own days only).
  const tally = tallies(data, shown);
  const total = tally
    .filter((_, i) => shownMode !== 'month' || data.days[i].date.startsWith(curMonth))
    .reduce((a, t) => ({ runs: a.runs + t.runs, failed: a.failed + byTone(t.by).failed, cost: a.cost + t.cost, planned: a.planned + t.planned }), { runs: 0, failed: 0, cost: 0, planned: 0 });
  const count = (f: Filter) => data.items.filter((it) => matches(it, f)).length;
  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'task', label: 'Tasks' },
    { key: 'agent', label: 'Agents' },
    { key: 'app', label: 'Apps' },
    { key: 'board', label: 'Boards' },
    { key: 'watch', label: 'Watchers' },
    { key: 'webhook', label: 'Webhooks' },
    { key: 'paused', label: 'Paused' },
  ];
  const list = data.items.filter((it) => matches(it, filter));

  return (
    <div data-i18n="schedules" className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {chips
          .filter((c) => c.key === 'all' || count(c.key) > 0)
          .map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={cx('rounded-full border px-2.5 py-1 text-[12.5px] transition-colors', filter === c.key ? 'border-transparent bg-accent-soft text-fg' : 'border-line text-fg-3 hover:text-fg')}
            >
              {c.label} · {count(c.key)}
            </button>
          ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1">
            <IconButton label={prevLabel} size="sm" onClick={() => shift(-1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton label={nextLabel} size="sm" onClick={() => shift(1)}>
              <ChevronRight size={16} />
            </IconButton>
            <Button size="sm" variant="ghost" disabled={atToday} onClick={toToday}>
              Today
            </Button>
          </div>
          <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-tight">{label}</h3>
          {loading && <Throbber size={14} className="text-fg-3" />}
          {!mobile && (
            <Segmented
              size="sm"
              value={mode}
              onChange={(m) => {
                setPick(null);
                setMode(m);
                // The month of the week shown, and back to the week a month's day is in.
                if (m === 'month') setMonth((data.days.find((d) => d.date === data.today)?.date ?? data.days[3]?.date ?? data.today).slice(0, 7));
              }}
              options={[
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-line px-3 py-1.5 text-[11.5px] text-fg-3 sm:px-4">
          <span className="text-fg-2">
            {total.runs === 1 ? '1 ran' : `${total.runs} ran`}
            {total.failed > 0 ? ` · ${total.failed} failed` : ''}
            {total.cost > 0 ? ` · ${money(total.cost)}` : ''}
            {total.planned > 0 ? ` · ${total.planned} to come` : ''}
          </span>
          <span className="flex-1" />
          {(['done', 'silent', 'needs', 'failed'] as Tone[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cx('h-[7px] w-[7px] rounded-full', DOT[k])} />
              {TONE_LABEL[k]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="h-[8px] w-[12px] rounded-[3px] border border-dashed border-fg/40" />
            To come
          </span>
          <span className="text-fg-4 max-sm:hidden">Times in {data.tz}</span>
        </div>
        {!ready ? (
          <Throbber className="mx-auto my-16 text-fg-3" size={22} />
        ) : shownMode === 'month' ? (
          <MonthGrid
            data={data}
            month={curMonth}
            tally={tally}
            onDay={(date) => {
              setMode('week');
              setWeek(mondayOf(date));
            }}
          />
        ) : (
          <WeekGrid data={data} items={items} shown={shown} tally={tally} onPick={onPick} onSwipe={shownMode === 'day' ? shift : undefined} />
        )}
        {data.capped && <div className="border-t border-line px-4 py-1.5 text-[12px] text-fg-3">Some runs to come are left out here: there are too many to draw.</div>}
      </section>

      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-[14px] font-semibold">Everything that runs by itself</h2>
          <span className="text-[12.5px] text-fg-3">{list.length}</span>
        </div>
        <div className="divide-y divide-line rounded-2xl border border-line bg-panel">
          {list.map((it) => (
            <ItemRow key={it.id} it={it} onChanged={load} />
          ))}
          {!list.length && <div className="px-4 py-6 text-center text-[13px] text-fg-3">None here.</div>}
        </div>
      </section>

      <Popover anchor={anchor} open={!!pick} onClose={() => setPick(null)} width={pick?.kind === 'crowd' ? 280 : 320} sheet>
        {pick && <Detail pick={pick} data={data} items={items} onPick={(p) => setPick(p)} onClose={() => setPick(null)} />}
      </Popover>
    </div>
  );
}
