// The Jobs page's timeline: a bar for each job that runs or waits, on one time axis with a line at now. What has run is
// solid, the estimate beyond it striped; a waiting job is dashed where it should start; a bar with no estimate fades out.
// A thin line joins a job to each one that waits for it. Each name has its tag's dot before it. On a narrow screen the
// chart scrolls sideways, the names staying.
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { JobEntry, JobsList } from '@shared/jobs';
import { cx } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';
import { along, ganttOf, ticks, type GanttRow } from './gantt';
import { JobDot, JobIcon, toneState } from './JobRow';
import { TagDot } from './TagPill';
import { firstTag } from './tags';
import { startsIn, stateWords, timeLeft } from './words';

const ROW = 34;
const AXIS = 26;

const mix = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;
const stripes = (token: string) => `repeating-linear-gradient(135deg, ${mix(token, 38)} 0 4px, ${mix(token, 16)} 4px 8px)`;
const fading = (token: string) => `linear-gradient(to right, ${mix(token, 42)}, transparent)`;

const hours = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dayHours = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const days = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' });

/** One job's bar: the part done (or the whole of an ended one), then the estimate or the stretch that fades. */
function Bar({ row, left, width }: { row: GanttRow; left: (t: number) => number; width: (a: number, b: number) => number }) {
  const place = (a: number, b: number): CSSProperties => ({ left: `${left(a)}%`, width: `${width(a, b)}%`, minWidth: 3 });
  const bar = 'absolute top-1/2 h-3.5 -translate-y-1/2';
  if (row.kind === 'ended') {
    const state = toneState(row.job);
    const token = state === 'done' ? '--ok' : state === 'failed' ? '--err' : '--fg-3';
    return <span className={cx(bar, 'rounded')} style={{ ...place(row.from, row.to), background: mix(token, 55) }} />;
  }
  if (row.kind === 'queued') {
    return (
      <span
        className={cx(bar, 'border border-dashed border-fg-3', row.open ? 'rounded-l border-r-0' : 'rounded')}
        style={{ ...place(row.from, row.to), background: row.open ? fading('--fg-3') : mix('--fg-3', 10), ...(row.open ? { maskImage: 'linear-gradient(to right, #000 30%, transparent)' } : {}) }}
      />
    );
  }
  const token = row.over ? '--warn' : '--busy';
  const done = row.solidTo!;
  return (
    <>
      <span className={cx(bar, row.estTo || row.open ? 'rounded-l' : 'rounded')} style={{ ...place(row.from, done), background: `var(${token})` }} />
      {row.estTo && <span className={cx(bar, 'rounded-r')} style={{ ...place(done, row.estTo), minWidth: 0, background: stripes(token) }} />}
      {row.open && <span className={bar} style={{ ...place(done, row.to), minWidth: 0, background: fading(token) }} />}
    </>
  );
}

/** What a row says on hover: its state, and when it should start or end. */
function tip(job: JobEntry, now: number): string {
  return [job.name, stateWords(job), timeLeft(job, now)?.text, startsIn(job, now)].filter(Boolean).join(' · ');
}

function Swatch({ style, className, label }: { style?: CSSProperties; className?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cx('h-2.5 w-5 rounded-sm', className)} style={style} />
      <span>{label}</span>
    </span>
  );
}

export function Timeline({ list, now, onOpen }: { list: JobsList; now: number; onOpen: (job: JobEntry) => void }) {
  const g = useMemo(() => ganttOf(list, now), [list, now]);
  const scroll = useRef<HTMLDivElement>(null);
  const marks = ticks(g.from, g.to, 6, -new Date(now).getTimezoneOffset() * 60_000);
  const label = marks.step >= 86_400_000 ? days : g.to - g.from > 86_400_000 ? dayHours : hours;
  const left = (t: number) => along(g, t);
  const width = (a: number, b: number) => Math.max(0, along(g, b) - along(g, a));
  const mid = (i: number) => i * ROW + ROW / 2;
  const tagged = g.rows.some((r) => firstTag(r.job) !== null);

  // On a narrow screen it opens with now in view.
  const placed = useRef(false);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el || placed.current || !g.rows.length) return;
    placed.current = true;
    const chart = el.querySelector<HTMLElement>('[data-chart]');
    if (!chart || el.scrollWidth <= el.clientWidth) return;
    const names = chart.offsetLeft;
    el.scrollLeft = Math.max(0, (along(g, now) / 100) * chart.offsetWidth - (el.clientWidth - names) / 2);
  }, [g, now]);

  return (
    <div className="rounded-xl border border-line bg-panel">
      <div ref={scroll} className="overflow-x-auto rounded-t-xl [--gantt-names:8.5rem] sm:[--gantt-names:15rem]">
        <div className="relative min-w-[calc(var(--gantt-names)+30rem)]">
          <div className="flex border-b border-line" style={{ height: AXIS }}>
            <div className="sticky left-0 z-20 w-[var(--gantt-names)] shrink-0 border-r border-line bg-panel" />
            <div data-chart translate="no" className="tnum relative mr-3 min-w-0 flex-1 text-[11px] text-fg-3">
              {marks.at.map((t) => (
                <span key={t} className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap" style={{ left: `${left(t)}%` }}>
                  {left(t) > 3 && left(t) < 97 ? label.format(t) : ''}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            {/* The lines marking the hours, under the bars. */}
            <svg aria-hidden className="pointer-events-none absolute top-0 right-3 left-[var(--gantt-names)] h-full w-[calc(100%-var(--gantt-names)-0.75rem)] overflow-visible">
              {marks.at.map((t) => (
                <line key={t} x1={`${left(t)}%`} x2={`${left(t)}%`} y1={0} y2="100%" stroke="var(--line)" strokeDasharray="2 3" />
              ))}
            </svg>
            {g.rows.map((row) => (
              <button
                key={row.job.id}
                type="button"
                title={tip(row.job, now)}
                onClick={() => onOpen(row.job)}
                className="group flex w-full items-stretch text-left"
                style={{ height: ROW }}
              >
                <span className="sticky left-0 z-20 flex w-[var(--gantt-names)] shrink-0 items-center gap-2 border-r border-line bg-panel px-3 group-hover:bg-bg-2">
                  {/* The untagged keep the dot's room, so the names line up. */}
                  {tagged && (
                    <span title={firstTag(row.job) ?? undefined} translate="no" className="flex w-2 shrink-0">
                      {firstTag(row.job) !== null && <TagDot tag={firstTag(row.job)} />}
                    </span>
                  )}
                  <span className="relative block shrink-0 text-fg-3">
                    <JobIcon kind={row.job.kind} size={14} />
                    <JobDot state={toneState(row.job)} className="absolute -right-0.5 -bottom-0.5 !h-1.5 !w-1.5" />
                  </span>
                  <span translate="no" className="min-w-0 truncate text-[12.5px] text-fg">
                    {row.job.name}
                  </span>
                </span>
                <span className="relative mr-3 min-w-0 flex-1 group-hover:bg-bg-2/60">
                  <Bar row={row} left={left} width={width} />
                </span>
              </button>
            ))}
            {/* Over the bars, and under the names as they scroll: who waits for whom, and now. */}
            <div aria-hidden className="pointer-events-none absolute top-0 right-3 bottom-0 left-[var(--gantt-names)] z-10">
              <svg className="h-full w-full overflow-visible">
                {g.links.map(({ a, b }) => {
                  const from = g.rows[a];
                  const end = from.kind === 'ended' ? from.to : (from.estTo ?? from.solidTo ?? from.from);
                  const x1 = `${left(end)}%`;
                  const x2 = `${left(g.rows[b].from)}%`;
                  return (
                    <g key={`${a}-${b}`} stroke="var(--fg-3)" strokeWidth={1}>
                      <line x1={x1} x2={x2} y1={mid(a)} y2={mid(a)} />
                      <line x1={x2} x2={x2} y1={mid(a)} y2={mid(b)} />
                      <circle cx={x2} cy={mid(b)} r={2.5} fill="var(--fg-3)" stroke="none" />
                    </g>
                  );
                })}
                <line x1={`${left(now)}%`} x2={`${left(now)}%`} y1={0} y2="100%" stroke="var(--accent)" strokeWidth={1.5} />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-[11.5px] text-fg-3">
        <Swatch label="Run so far" style={{ background: 'var(--busy)' }} />
        <Swatch label="Estimated" style={{ background: stripes('--busy') }} />
        <Swatch label="Queued" className="border border-dashed border-fg-3" />
        <Swatch label="No estimate" style={{ background: fading('--busy') }} />
        <Swatch label="Now" className="!w-0 border-l-[1.5px] border-accent" />
      </div>
    </div>
  );
}
