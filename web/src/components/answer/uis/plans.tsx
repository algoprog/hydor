// The answer UIs for time and plans (timelines, agendas, calendars, roadmaps, steps, checklists, countdowns, boards, status, go or no-go): their views, by name (shared/answer-ui/plans.ts has what each takes).
import { Fragment, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, CalendarPlus, Check, CircleAlert, CircleCheck, CircleX, Clock, Hourglass, Lightbulb, MapPin, PackageCheck, PartyPopper, Pause, Play, RotateCcw, SkipForward, TriangleAlert, Truck, Users, Volume2, VolumeX, Wrench, X } from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { toast } from '../../../lib/store';
import { CodeBlock } from '../../Markdown';
import { cx } from '../../ui';
import { useWidth } from '../charts';
import { arr, Btn, Card, Chip, Copy, download, fmtDate, fmtMinutes, fmtNum, fmtTime, Head, hostOf, isObj, LinkOut, Md, Meter, num, parseDate, Pic, Ring, Seg, seriesColor, str, textOf, TONE, TONE_FILL, toneOf, useAui, useKept, useNow, words, yes, type AnswerUiView, type Data, type Tone } from '../kit';

// ---- shared by the views below ----------------------------------------------------------------------------------------

const lang = () => LOCALE ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');
const pad2 = (n: number) => String(n).padStart(2, '0');
/** A day as YYYY-MM-DD, in this computer's time. */
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

/** A day written YYYY-MM-DD (perhaps with a time after it): that day at noon; null when it is not one. */
function dayOf(v: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v).trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[3]) ? null : d;
}

/** Minutes past midnight from a time of day ("14:30", "2:30 pm"); null when it is not one. */
function clockMin(v: unknown): number | null {
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(?:([ap])\.?\s*m\.?)?$/i.exec(str(v).trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  return h > 24 || min > 59 ? null : h * 60 + min;
}

/** Minutes past midnight as the app's language writes a time (9:00 AM). */
const minText = (m: number) => fmtTime(`${pad2(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad2(((m % 60) + 60) % 60)}`);

// A calendar file (.ics), for a calendar app to take the events in.
interface IcsEvent {
  title: string;
  start: Date;
  end?: Date | null;
  allDay?: boolean;
  where?: string;
  note?: string;
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDay = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function icsFile(events: IcsEvent[]): string {
  const stamp = icsUtc(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hydor//Answer UI//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  events.forEach((e, i) => {
    lines.push('BEGIN:VEVENT', `UID:${stamp}-${i}-${Math.random().toString(36).slice(2, 10)}@hydor`, `DTSTAMP:${stamp}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${icsDay(e.start)}`, `DTEND;VALUE=DATE:${icsDay(addDays(e.end ?? e.start, 1))}`);
    else {
      lines.push(`DTSTART:${icsUtc(e.start)}`);
      if (e.end) lines.push(`DTEND:${icsUtc(e.end)}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.where) lines.push(`LOCATION:${icsText(e.where)}`);
    if (e.note) lines.push(`DESCRIPTION:${icsText(e.note)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/** A small button that saves the events as a calendar file. */
function SaveIcs({ name, events }: { name: string; events: () => IcsEvent[] }) {
  const save = () => {
    const file = `${name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'calendar'}.ics`;
    download(file, 'text/calendar', icsFile(events()));
  };
  return (
    <button type="button" onClick={save} title={tr('Add to calendar')} aria-label={tr('Add to calendar')} className="grid h-7 w-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
      <CalendarPlus size={14} />
    </button>
  );
}

/** A small button that starts over: the ticks taken back. */
function ResetBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={tr('Start over')} aria-label={tr('Start over')} className="grid h-7 w-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
      <RotateCcw size={13} />
    </button>
  );
}

const DIFFICULTY: Record<string, () => string> = { easy: () => tr('Easy'), medium: () => tr('Medium'), hard: () => tr('Hard') };

// ---- a timeline -------------------------------------------------------------------------------------------------------

function Timeline({ data }: { data: Data }) {
  const { offline } = useAui();
  const events = arr(data.events ?? data.items).map((e) => (isObj(e) ? e : { title: str(e) }));
  return (
    <Card>
      <Head title={data.title} />
      <ol className="m-0 list-none p-0">
        {events.map((e, i) => {
          const tone = str(e.tone) ? toneOf(e.tone) : null;
          const date = str(e.date ?? e.when ?? e.year);
          const title = textOf(e, 'title', 'name', 'event');
          const pic = str(e.image) && !offline;
          return (
            <li key={i} className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-3 @md:grid-cols-[minmax(0,112px)_14px_minmax(0,1fr)]">
              <div className="hidden pt-px text-right text-[12.5px] leading-snug font-semibold text-fg-2 tabular-nums @md:block">{date}</div>
              <div className="relative flex justify-center">
                <span className="relative z-[1] mt-[5px] h-3 w-3 rounded-full ring-[3px] ring-panel" style={{ background: tone ? TONE_FILL[tone] : 'var(--accent)' }} />
                {i < events.length - 1 && <span className="absolute top-[17px] bottom-0 w-px bg-line" aria-hidden />}
              </div>
              <div className={cx('min-w-0', i < events.length - 1 && 'pb-5')}>
                {date && <div className="text-[12px] font-semibold text-fg-2 @md:hidden">{date}</div>}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="leading-snug font-semibold">{title}</span>
                  {str(e.tag) && <Chip tone={tone ?? 'neutral'}>{str(e.tag)}</Chip>}
                </div>
                {(str(e.text) || pic) && (
                  <div className="mt-1 flex items-start gap-3">
                    {str(e.text) && <Md text={e.text} className="min-w-0 flex-1 text-[13px] text-fg-2" />}
                    {pic && <Pic src={e.image} alt={title} className="h-16 w-24 shrink-0 rounded-md @md:h-[72px] @md:w-28" />}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---- an agenda ----------------------------------------------------------------------------------------------------------

function NowLine({ at }: { at: number }) {
  return (
    <li className="flex items-center gap-3 py-1" aria-label={tr('Now')}>
      <span className="w-16 shrink-0 text-right text-[11.5px] font-semibold whitespace-nowrap text-accent tabular-nums">{minText(at)}</span>
      <span className="relative flex flex-1 items-center">
        <span className="h-2 w-2 shrink-0 -translate-x-[3px] rounded-full bg-accent" />
        <span className="h-[2px] flex-1 bg-accent" />
      </span>
    </li>
  );
}

function Agenda({ data, done }: { data: Data; done: boolean }) {
  const now = useNow(30_000);
  const day = dayOf(data.date);
  const today = !!day && ymd(day) === ymd(new Date(now));
  const at = today ? new Date(now).getHours() * 60 + new Date(now).getMinutes() : null;
  const items = arr(data.items ?? data.events ?? data.sessions)
    .filter(isObj)
    .map((it) => ({ it, start: clockMin(it.start ?? it.time), end: clockMin(it.end) }));
  const until = (i: number) => items[i].end ?? items[i + 1]?.start ?? (items[i].start !== null ? items[i].start! + 60 : null);
  const current = at === null ? -1 : items.findIndex((x, i) => x.start !== null && x.start <= at && at < (until(i) ?? x.start));
  const lineAt = at === null || current >= 0 ? -1 : (() => {
    const i = items.findIndex((x) => x.start !== null && x.start > at);
    return i < 0 ? items.length : i;
  })();
  const events = (): IcsEvent[] =>
    day
      ? items
          .filter((x) => x.start !== null)
          .map((x) => {
            const at = (m: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60);
            return { title: textOf(x.it, 'title', 'name'), start: at(x.start!), end: x.end !== null ? at(x.end) : null, where: str(x.it.place), note: str(x.it.who) };
          })
      : [];
  return (
    <Card>
      <Head
        title={data.title}
        sub={day ? fmtDate(day, 'long') : ''}
        aside={
          (today || (done && day)) && (
            <span className="flex items-center gap-1">
              {today && <Chip tone="accent">{tr('Today')}</Chip>}
              {done && day && items.length > 0 && <SaveIcs name={str(data.title) || ymd(day)} events={events} />}
            </span>
          )
        }
      />
      <ol className="m-0 list-none p-0">
        {items.map((x, i) => {
          const prev = i > 0 ? (items[i - 1].end ?? items[i - 1].start) : null;
          const gap = prev !== null && x.start !== null ? x.start - prev : 0;
          const tone = str(x.it.tone) ? toneOf(x.it.tone) : null;
          const end = until(i);
          const past = at !== null && end !== null && end <= at;
          const live = i === current;
          const long = x.start !== null && x.end !== null && x.end > x.start ? x.end - x.start : null;
          return (
            <Fragment key={i}>
              {gap >= 30 && (
                <li className="flex gap-3 py-0.5 text-[12px] text-fg-3">
                  <span className="w-16 shrink-0" />
                  <span>{tr('Free for {0}').replace('{0}', fmtMinutes(gap))}</span>
                </li>
              )}
              {lineAt === i && at !== null && <NowLine at={at} />}
              <li className={cx('-mx-2 flex gap-3 rounded-lg px-2 py-2', past && 'opacity-55', live && 'bg-accent-soft')}>
                <div className="w-16 shrink-0 text-right leading-tight tabular-nums">
                  <div className="text-[13px] font-semibold whitespace-nowrap">{x.start !== null ? minText(x.start) : str(x.it.start)}</div>
                  {x.end !== null && <div className="mt-0.5 text-[11.5px] whitespace-nowrap text-fg-3">{minText(x.end)}</div>}
                </div>
                <span className="w-[3px] shrink-0 rounded-full" style={{ background: tone ? TONE_FILL[tone] : 'var(--line-2)' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="leading-snug font-semibold">{textOf(x.it, 'title', 'name')}</span>
                    {live && <Chip tone="accent">{tr('Now')}</Chip>}
                    {str(x.it.tag) && <Chip tone={tone ?? 'neutral'}>{str(x.it.tag)}</Chip>}
                  </div>
                  {(str(x.it.place) || str(x.it.who) || long) && (
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-fg-3">
                      {str(x.it.place) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="shrink-0" />
                          {str(x.it.place)}
                        </span>
                      )}
                      {str(x.it.who) && (
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} className="shrink-0" />
                          {str(x.it.who)}
                        </span>
                      )}
                      {long && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} className="shrink-0" />
                          {fmtMinutes(long)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            </Fragment>
          );
        })}
        {lineAt === items.length && items.length > 0 && at !== null && <NowLine at={at} />}
      </ol>
    </Card>
  );
}

// ---- a calendar -------------------------------------------------------------------------------------------------------

interface CalEvent {
  start: Date;
  end: Date;
  title: string;
  tone: Tone;
}

/** The day weeks start on where the app's language is spoken (0 for Sunday, 1 for Monday). */
function firstWeekday(): number {
  try {
    const l = new Intl.Locale(lang()) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const w = l.getWeekInfo?.() ?? l.weekInfo;
    if (w?.firstDay) return w.firstDay % 7;
  } catch {}
  return 1;
}

/** "19–24 Nov": the days an event takes, as the app's language writes a range. */
function spanText(e: CalEvent): string {
  if (ymd(e.start) === ymd(e.end)) return fmtDate(e.start, 'dayMonth');
  try {
    const f = new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short' }) as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string };
    if (f.formatRange) return f.formatRange(e.start, e.end);
  } catch {}
  return `${fmtDate(e.start, 'short')} – ${fmtDate(e.end, 'short')}`;
}

const LANES = 3;

function Month({ month, events, wk, today }: { month: Date; events: CalEvent[]; wk: number; today: string }) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1, 12).getDay() - wk + 7) % 7;
  const weeks = Math.ceil((lead + days) / 7);
  const names = Array.from({ length: 7 }, (_, c) => {
    try {
      return new Intl.DateTimeFormat(lang(), { weekday: 'narrow' }).format(new Date(2026, 1, 1 + ((wk + c) % 7), 12));
    } catch {
      return '';
    }
  });
  return (
    <section className="min-w-0">
      <h4 className="mb-1.5 text-[13.5px] font-semibold">{fmtDate(month, 'monthYear')}</h4>
      <div className="grid grid-cols-7 border-b border-line pb-1 text-center text-[11px] font-medium text-fg-3">
        {names.map((n, c) => (
          <span key={c}>{n}</span>
        ))}
      </div>
      {Array.from({ length: weeks }, (_, w) => {
        const cells = Array.from({ length: 7 }, (_, c) => {
          const n = w * 7 + c - lead + 1;
          return n >= 1 && n <= days ? new Date(y, m, n, 12) : null;
        });
        const keys = cells.map((d) => (d ? ymd(d) : ''));
        // Each event's stretch of this week, in the first lane free from its first day.
        const placed: { e: CalEvent; c0: number; c1: number; lane: number; before: boolean; after: boolean }[] = [];
        const lanes: number[] = [];
        for (const e of events) {
          const s = ymd(e.start);
          const t = ymd(e.end);
          const on = keys.map((k) => !!k && k >= s && k <= t);
          const c0 = on.indexOf(true);
          if (c0 < 0) continue;
          const c1 = on.lastIndexOf(true);
          let lane = lanes.findIndex((end) => end < c0);
          if (lane < 0) lane = lanes.push(-1) - 1;
          lanes[lane] = c1;
          placed.push({ e, c0, c1, lane, before: keys[c0] > s, after: keys[c1] < t });
        }
        const shown = Math.min(LANES, lanes.length);
        const more = keys.map((_, c) => placed.filter((p) => p.lane >= LANES && p.c0 <= c && p.c1 >= c).length);
        return (
          <div key={w} className="grid grid-cols-7 border-b border-line/60" style={{ gridTemplateRows: `auto repeat(${shown}, auto) 1fr` }}>
            {cells.map((d, c) => (
              <div key={`b${c}`} className={cx('min-h-[40px] @lg:min-h-[58px]', c < 6 && 'border-r border-line/40', !d && 'bg-bg-1/50')} style={{ gridColumn: c + 1, gridRow: `1 / span ${shown + 2}` }} />
            ))}
            {cells.map((d, c) => (
              <div key={`n${c}`} className="flex items-center justify-between gap-0.5 px-1 pt-1" style={{ gridColumn: c + 1, gridRow: 1 }}>
                {d && <span className={cx('grid h-[22px] min-w-[22px] place-items-center rounded-full px-0.5 text-[12px] tabular-nums', keys[c] === today ? 'bg-accent font-semibold text-accent-fg' : 'text-fg-2')}>{d.getDate()}</span>}
                {more[c] > 0 && <span className="text-[10px] text-fg-3">{`+${more[c]}`}</span>}
              </div>
            ))}
            {placed
              .filter((p) => p.lane < LANES)
              .map((p, k) => (
                <div key={`e${k}`} className="min-w-0 px-[3px] pt-[3px]" style={{ gridColumn: `${p.c0 + 1} / ${p.c1 + 2}`, gridRow: p.lane + 2 }} title={p.e.title}>
                  <span className={cx('block h-1.5 @lg:hidden', p.before ? 'rounded-l-none' : 'rounded-l-full', p.after ? 'rounded-r-none' : 'rounded-r-full')} style={{ background: TONE_FILL[p.e.tone] }} />
                  <span className={cx('hidden h-[19px] truncate px-1.5 text-[11px] leading-[19px] font-medium @lg:block', TONE[p.e.tone], p.before ? 'rounded-l-none' : 'rounded-l-[5px]', p.after ? 'rounded-r-none' : 'rounded-r-[5px]')}>{p.e.title}</span>
                </div>
              ))}
          </div>
        );
      })}
    </section>
  );
}

function Calendar({ data, done }: { data: Data; done: boolean }) {
  const events = arr(data.events ?? data.items)
    .filter(isObj)
    .map((e): CalEvent | null => {
      const start = dayOf(e.date ?? e.start);
      if (!start) return null;
      const end = dayOf(e.end);
      return { start, end: end && end >= start ? end : start, title: textOf(e, 'title', 'name'), tone: str(e.tone) ? toneOf(e.tone) : 'accent' };
    })
    .filter((e): e is CalEvent => !!e)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const given = /^(\d{4})-(\d{2})/.exec(str(data.month));
  const from = given ? new Date(Number(given[1]), Number(given[2]) - 1, 1, 12) : events.length ? new Date(events[0].start.getFullYear(), events[0].start.getMonth(), 1, 12) : null;
  const last = events.reduce<Date | null>((m, e) => (!m || e.end > m ? e.end : m), null);
  const count = from ? Math.min(6, Math.max(1, last ? (last.getFullYear() - from.getFullYear()) * 12 + last.getMonth() - from.getMonth() + 1 : 1)) : 0;
  const months = from ? Array.from({ length: count }, (_, k) => new Date(from.getFullYear(), from.getMonth() + k, 1, 12)) : [];
  const wk = firstWeekday();
  const today = ymd(new Date());
  return (
    <Card>
      <Head title={data.title} aside={done && events.length > 0 ? <SaveIcs name={str(data.title) || 'calendar'} events={() => events.map((e) => ({ title: e.title, start: e.start, end: e.end, allDay: true }))} /> : undefined} />
      <div className="grid gap-y-5">
        {months.map((m) => (
          <Month key={ymd(m)} month={m} events={events} wk={wk} today={today} />
        ))}
      </div>
      {events.length > 0 && (
        <ul className="m-0 mt-4 list-none space-y-1.5 border-t border-line p-0 pt-3">
          {events.map((e, i) => (
            <li key={i} className="flex items-baseline gap-2.5 text-[13px]">
              <span className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-[3px]" style={{ background: TONE_FILL[e.tone] }} />
              <span className="w-[104px] shrink-0 whitespace-nowrap text-fg-3 tabular-nums">{spanText(e)}</span>
              <span className="min-w-0 font-medium">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- a roadmap --------------------------------------------------------------------------------------------------------

const PHASES: Record<string, { tone: Tone; label: () => string }> = {
  done: { tone: 'good', label: () => tr('Done') },
  active: { tone: 'accent', label: () => tr('In progress') },
  next: { tone: 'info', label: () => tr('Next') },
  later: { tone: 'neutral', label: () => tr('Later') },
};

function phaseOf(v: unknown): string {
  const s = str(v).trim().toLowerCase();
  if (/^(done|complete|completed|shipped|finished|released|launched)$/.test(s)) return 'done';
  if (/^(active|current|now|in[- ]progress|doing|ongoing|started|underway)$/.test(s)) return 'active';
  if (/^(next|soon|upcoming|planned|up next)$/.test(s)) return 'next';
  if (/^(later|future|someday|backlog|ideas?)$/.test(s)) return 'later';
  return '';
}

function PhaseNode({ status }: { status: string }) {
  if (status === 'done')
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-ok text-white">
        <Check size={13} strokeWidth={3} />
      </span>
    );
  if (status === 'active')
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-accent bg-accent-soft">
        <span className="h-2 w-2 rounded-full bg-accent" />
      </span>
    );
  return <span className={cx('h-6 w-6 rounded-full border-2 bg-panel', status === 'next' ? 'border-info' : 'border-dashed border-line-2')} />;
}

function Roadmap({ data }: { data: Data }) {
  const phases = arr(data.phases ?? data.stages ?? data.milestones).map((p) => (isObj(p) ? p : { name: str(p) }));
  return (
    <Card>
      <Head title={data.title} />
      <ol className="m-0 list-none p-0">
        {phases.map((p, i) => {
          const st = phaseOf(p.status);
          const items = arr(p.items ?? p.tasks)
            .map((x) => ({ text: textOf(x, 'text', 'title', 'name'), done: st === 'done' || (isObj(x) && yes(x.done)) }))
            .filter((x) => x.text);
          const doneN = items.filter((x) => x.done).length;
          const last = i === phases.length - 1;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex shrink-0 flex-col items-center">
                <PhaseNode status={st} />
                {!last && <span className={cx('my-1 w-0.5 flex-1 rounded-full', st === 'done' ? 'bg-ok/50' : 'bg-line')} />}
              </div>
              <div className={cx('min-w-0 flex-1', !last && 'pb-5')}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                  <span className={cx('leading-snug font-semibold', st === 'later' && 'text-fg-2')}>{textOf(p, 'name', 'title')}</span>
                  {PHASES[st] && <Chip tone={PHASES[st].tone}>{PHASES[st].label()}</Chip>}
                  {str(p.when) && <span className="ml-auto text-[12px] text-fg-3 tabular-nums">{str(p.when)}</span>}
                </div>
                {st === 'active' && items.length > 1 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Meter value={doneN} max={items.length} thin tone="accent" className="max-w-[180px] flex-1" />
                    <span className="text-[11.5px] text-fg-3 tabular-nums">{`${doneN}/${items.length}`}</span>
                  </div>
                )}
                {items.length > 0 && (
                  <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                    {items.map((x, k) => (
                      <li key={k} className="flex gap-2 text-[13px]">
                        {x.done ? <Check size={14} strokeWidth={2.5} className="mt-[3px] shrink-0 text-ok" /> : <span className="mx-[4px] mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3/60" />}
                        <Md text={x.text} inline className={x.done ? 'text-fg-2' : 'text-fg'} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---- a step-by-step guide ---------------------------------------------------------------------------------------------

function Steps({ data, done }: { data: Data; done: boolean }) {
  const { offline } = useAui();
  const steps = arr(data.steps).map((s) => (isObj(s) ? s : { title: str(s) }));
  const [ticked, setTicked] = useKept<Record<number, boolean>>('done', {});
  const n = steps.filter((_, i) => ticked[i]).length;
  const tools = words(data.tools ?? data.materials);
  const level = str(data.difficulty);
  return (
    <Card>
      <Head
        title={data.title}
        className="mb-2"
        aside={
          steps.length > 1 ? (
            <span className="flex items-center gap-1 text-[12px] text-fg-3 tabular-nums">
              {done && n > 0 && <ResetBtn onClick={() => setTicked({})} />}
              {`${n}/${steps.length}`}
            </span>
          ) : undefined
        }
      />
      {(str(data.time) || level || tools.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-fg-2">
          {str(data.time) && (
            <span className="inline-flex items-center gap-1.5">
              <Clock size={13} className="text-fg-3" />
              {str(data.time)}
            </span>
          )}
          {level && <Chip>{DIFFICULTY[level.toLowerCase()]?.() ?? level}</Chip>}
          {tools.length > 0 && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Wrench size={13} className="shrink-0 text-fg-3" />
              <span>{tools.join(' · ')}</span>
            </span>
          )}
        </div>
      )}
      {str(data.intro) && <Md text={data.intro} className="mb-3 text-[13.5px] text-fg-2" />}
      {steps.length > 1 && <Meter value={n} max={steps.length} thin tone={n === steps.length ? 'good' : undefined} className="mb-4" />}
      <ol className="m-0 list-none space-y-4 p-0">
        {steps.map((s, i) => {
          const on = !!ticked[i];
          const title = textOf(s, 'title', 'name', 'step');
          return (
            <li key={i} className="flex gap-3">
              <button
                type="button"
                disabled={!done}
                aria-pressed={on}
                onClick={() => setTicked((x) => ({ ...x, [i]: !on }))}
                aria-label={on ? tr('Not done yet') : tr('Done')}
                className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold transition-colors disabled:cursor-default', on ? 'bg-ok text-white' : 'bg-accent-soft text-accent hover:bg-accent hover:text-accent-fg')}
              >
                {on ? <Check size={14} strokeWidth={3} /> : i + 1}
              </button>
              <div className="min-w-0 flex-1 pt-[3px]">
                {title && <div className={cx('leading-snug font-semibold', on && 'text-fg-3')}>{title}</div>}
                {str(s.text) && str(s.title) && <Md text={s.text} className="mt-0.5 text-[13.5px] text-fg-2" />}
                {str(s.image) && !offline && <Pic src={s.image} alt={title} className="mt-2 aspect-video w-full max-w-sm rounded-lg" />}
                {str(s.code) && <CodeBlock code={str(s.code)} lang={str(s.lang) || null} className="!mt-2 !mb-0" />}
                {str(s.tip) && (
                  <div className="mt-2 flex gap-2 rounded-lg bg-info/10 px-3 py-2 text-[13px]">
                    <Lightbulb size={14} className="mt-[3px] shrink-0 text-info" />
                    <Md text={s.tip} inline />
                  </div>
                )}
                {str(s.warning) && (
                  <div className="mt-2 flex gap-2 rounded-lg bg-warn/10 px-3 py-2 text-[13px]">
                    <TriangleAlert size={14} className="mt-[3px] shrink-0 text-warn" />
                    <Md text={s.warning} inline />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {steps.length > 1 && n === steps.length && <div className="mt-4 rounded-lg bg-ok/10 px-3 py-2 text-[13px] font-medium text-ok">{tr('All done!')}</div>}
    </Card>
  );
}

// ---- a checklist ------------------------------------------------------------------------------------------------------

function Checklist({ data, done }: { data: Data; done: boolean }) {
  const groups = [...(arr(data.items).length ? [{ name: '', items: arr(data.items) }] : []), ...arr(data.groups ?? data.sections).filter(isObj).map((g) => ({ name: str(g.name ?? g.title), items: arr(g.items) }))].map((g) => ({
    name: g.name,
    items: g.items.map((x) => ({ text: textOf(x, 'text', 'title', 'name', 'item'), note: isObj(x) ? str(x.note) : '', done: isObj(x) && yes(x.done) })).filter((x) => x.text),
  }));
  const [ticks, setTicks] = useKept<Record<string, boolean>>('ticks', {});
  const isOn = (gi: number, ii: number, given: boolean) => ticks[`${gi}:${ii}`] ?? given;
  const total = groups.reduce((m, g) => m + g.items.length, 0);
  const on = groups.reduce((m, g, gi) => m + g.items.filter((x, ii) => isOn(gi, ii, x.done)).length, 0);
  const text = () =>
    [str(data.title), ...groups.map((g, gi) => [g.name, ...g.items.map((x, ii) => `- [${isOn(gi, ii, x.done) ? 'x' : ' '}] ${x.text}${x.note ? ` (${x.note})` : ''}`)].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n');
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          done && total > 0 ? (
            <span className="flex items-center gap-0.5">
              {Object.keys(ticks).length > 0 && <ResetBtn onClick={() => setTicks({})} />}
              <Copy text={text} label={tr('Copy as text')} />
            </span>
          ) : undefined
        }
      />
      {total > 1 && (
        <div className="mb-4 flex items-center gap-3">
          <Meter value={on} max={total} className="flex-1" tone={on === total ? 'good' : undefined} />
          <span className="text-[12px] whitespace-nowrap text-fg-3 tabular-nums">{tr('{0} of {1}').replace('{0}', String(on)).replace('{1}', String(total))}</span>
        </div>
      )}
      <div className={cx('grid gap-x-6 gap-y-4', groups.length > 1 && '@xl:grid-cols-2')}>
        {groups.map((g, gi) => (
          <section key={gi} className="min-w-0">
            {g.name && (
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h4 className="aui-h4">{g.name}</h4>
                <span className="text-[11.5px] text-fg-3 tabular-nums">{`${g.items.filter((x, ii) => isOn(gi, ii, x.done)).length}/${g.items.length}`}</span>
              </div>
            )}
            <ul className="m-0 list-none space-y-0.5 p-0">
              {g.items.map((x, ii) => {
                const v = isOn(gi, ii, x.done);
                return (
                  <li key={ii}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 text-[13.5px] hover:bg-bg-1">
                      <input type="checkbox" checked={v} disabled={!done} onChange={() => setTicks((t) => ({ ...t, [`${gi}:${ii}`]: !v }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                      <span className="min-w-0">
                        <Md text={x.text} inline className={cx(v && 'text-fg-3 line-through decoration-line-2')} />
                        {x.note && <span className="block text-[12px] text-fg-3">{x.note}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

// ---- a countdown ------------------------------------------------------------------------------------------------------

/** How long ago, in the app's language ("3 days ago"). */
function agoText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] = s < 60 ? [s, 'second'] : s < 3600 ? [Math.floor(s / 60), 'minute'] : s < 86400 ? [Math.floor(s / 3600), 'hour'] : [Math.floor(s / 86400), 'day'];
  try {
    return new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' }).format(-n, unit);
  } catch {
    return '';
  }
}

function Countdown({ data, done }: { data: Data; done: boolean }) {
  const { offline } = useAui();
  const now = useNow(1000);
  const raw = str(data.to ?? data.date ?? data.at).trim();
  // A day alone counts down to its start; a day and time to that time.
  const target = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : parseDate(raw);
  const ok = !!target && !Number.isNaN(target.getTime());
  const timed = /\d[T\s]\d{1,2}:\d{2}/.test(raw);
  const ms = ok ? target!.getTime() - now : null;
  const parts = ms !== null && ms > 0 ? [Math.floor(ms / 86_400_000), Math.floor(ms / 3_600_000) % 24, Math.floor(ms / 60_000) % 60, Math.floor(ms / 1000) % 60] : null;
  const labels = [tr('days'), tr('hours'), tr('minutes'), tr('seconds')];
  const title = str(data.title);
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.image) && !offline && <Pic src={data.image} alt={title} className="aspect-[16/7] max-h-[260px] w-full" />}
      <div className="p-4 @lg:p-5">
        <Head
          title={title}
          sub={ok ? `${fmtDate(target, 'long')}${timed ? `, ${fmtDate(target, 'time')}` : ''}` : ''}
          aside={done && parts ? <SaveIcs name={title || 'countdown'} events={() => [timed ? { title, start: target!, end: new Date(target!.getTime() + 3_600_000) } : { title, start: target!, allDay: true }]} /> : undefined}
        />
        {parts ? (
          <div className="grid grid-cols-4 gap-2">
            {parts.map((v, i) => (
              <div key={i} className="rounded-xl bg-bg-1 px-1 py-3 text-center">
                <div className="text-[26px] leading-none font-semibold tabular-nums @md:text-[32px]">{i === 0 ? fmtNum(v) : pad2(v)}</div>
                <div className="mt-1.5 text-[11.5px] text-fg-3">{labels[i]}</div>
              </div>
            ))}
          </div>
        ) : ms !== null ? (
          <div className="flex items-center gap-3 rounded-xl bg-ok/10 px-4 py-3">
            <PartyPopper size={22} className="shrink-0 text-ok" />
            <div>
              <div className="text-[16px] font-semibold text-ok">{tr('It’s here!')}</div>
              <div className="text-[12.5px] text-fg-3">{agoText(-ms)}</div>
            </div>
          </div>
        ) : null}
        {str(data.note) && <Md text={data.note} className="mt-3 text-[13.5px] text-fg-2" />}
      </div>
    </Card>
  );
}

// ---- a kanban board ---------------------------------------------------------------------------------------------------

/** People's initials in small rounds ("Maya Chen, Leo Park"), their names on hover. */
function People({ who }: { who: string }) {
  const people = who
    .split(/\s*(?:,|&|\+|\band\b)\s*/)
    .filter(Boolean)
    .slice(0, 3);
  return (
    <span className="flex shrink-0 -space-x-1.5" title={who}>
      {people.map((p, i) => (
        <span key={i} className="grid h-6 w-6 place-items-center rounded-full border-2 border-panel bg-bg-3 text-[10px] font-semibold text-fg-2">
          {p
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => [...w][0])
            .join('')
            .toUpperCase()}
        </span>
      ))}
    </span>
  );
}

function Kanban({ data }: { data: Data }) {
  const cols = arr(data.columns ?? data.lists ?? data.lanes)
    .filter(isObj)
    .map((c) => ({ name: str(c.name ?? c.title), tone: str(c.tone) ? toneOf(c.tone) : null, cards: arr(c.cards ?? c.items).map((x) => (isObj(x) ? x : { title: str(x) })) }));
  const today = ymd(new Date());
  const total = cols.reduce((m, c) => m + c.cards.length, 0);
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} aside={total > 0 ? <span className="text-[12px] text-fg-3 tabular-nums">{tr('{0} cards').replace('{0}', String(total))}</span> : undefined} className="mb-0 px-4 pt-4 pb-3 @lg:px-5" />}
      <div className={cx('flex gap-3 overflow-x-auto px-4 pb-4 @lg:px-5', !str(data.title) && 'pt-4')}>
        {cols.map((c, ci) => {
          // What is done is never late.
          const finished = c.tone === 'good' || /^(done|complete|completed|finished|shipped|closed)$/i.test(c.name.trim());
          return (
            <section key={ci} className="flex w-[228px] shrink-0 flex-col rounded-xl bg-bg-1 p-2">
              <header className="flex items-center gap-2 px-1.5 pt-0.5 pb-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_FILL[c.tone ?? 'neutral'] }} />
                <span className="min-w-0 truncate text-[12.5px] font-semibold">{c.name}</span>
                <span className="ml-auto text-[12px] text-fg-3 tabular-nums">{c.cards.length}</span>
              </header>
              <div className="space-y-2">
                {c.cards.map((k, i) => {
                  const due = dayOf(k.due);
                  const late = !!due && !finished && ymd(due) < today;
                  return (
                    <article key={i} className="rounded-lg border border-line bg-panel p-2.5">
                      {str(k.tag) && (
                        <Chip tone={toneOf(k.tag)} className="mb-1.5">
                          {str(k.tag)}
                        </Chip>
                      )}
                      <div className={cx('text-[13px] leading-snug font-medium', finished && 'text-fg-2')}>{textOf(k, 'title', 'name', 'text')}</div>
                      {str(k.text) && str(k.title) && <Md text={k.text} className="mt-1 text-[12.5px] text-fg-3" />}
                      {(due || str(k.who)) && (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {due ? (
                            <span className={cx('inline-flex items-center gap-1 text-[11.5px] tabular-nums', late ? 'font-medium text-err' : 'text-fg-3')}>
                              <CalendarDays size={12} />
                              {fmtDate(due, 'short')}
                              {late && ` · ${tr('late')}`}
                            </span>
                          ) : (
                            <span />
                          )}
                          {str(k.who) && <People who={str(k.who)} />}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

// ---- a status board ---------------------------------------------------------------------------------------------------

const TONE_ICON: Record<Tone, LucideIcon> = { good: CircleCheck, warn: CircleAlert, bad: CircleX, info: CircleAlert, accent: CircleCheck, neutral: CircleAlert };

/** Words as a chip shows them: the first letter capital. */
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Status({ data }: { data: Data }) {
  const items = arr(data.items ?? data.services ?? data.parts).filter(isObj);
  const overall = isObj(data.overall) ? data.overall : str(data.overall) ? { label: str(data.overall) } : null;
  const otone = overall ? (str(overall.tone) ? toneOf(overall.tone) : toneOf(overall.label ?? overall.status)) : 'neutral';
  const OIcon = TONE_ICON[otone];
  const progress = num(data.progress);
  return (
    <Card>
      <Head title={data.title} />
      {overall && textOf(overall, 'label', 'status', 'text') && (
        <div className={cx('flex items-center gap-2.5 rounded-xl px-3.5 py-2.5', TONE[otone])}>
          <OIcon size={18} className="shrink-0" />
          <span className="text-[14px] font-semibold">{textOf(overall, 'label', 'status', 'text')}</span>
        </div>
      )}
      {progress !== null && (
        <div className={cx(overall && 'mt-3')}>
          <div className="mb-1 flex items-baseline justify-between text-[12px] text-fg-3">
            <span>{tr('Progress')}</span>
            <span className="font-semibold text-fg tabular-nums">{`${fmtNum(Math.max(0, Math.min(100, progress)), { maximumFractionDigits: 0 })}%`}</span>
          </div>
          <Meter value={progress} max={100} />
        </div>
      )}
      {items.length > 0 && (
        <ul className={cx('m-0 list-none p-0', (overall || progress !== null) && 'mt-3')}>
          {items.map((it, i) => {
            const t = toneOf(it.status);
            return (
              <li key={i} className="flex items-start gap-3 border-t border-line/70 py-2.5 first:border-t-0">
                <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TONE_FILL[t] }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{textOf(it, 'name', 'title')}</span>
                    {str(it.value) && <span className="text-[13px] font-medium text-fg-2 tabular-nums">{str(it.value)}</span>}
                  </div>
                  {str(it.detail) && <Md text={it.detail} className="mt-0.5 text-[12.5px] text-fg-3" />}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 pt-px">
                  {str(it.status) && <Chip tone={t}>{capital(str(it.status))}</Chip>}
                  {str(it.updated) && <span className="text-[11px] text-fg-3">{str(it.updated)}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---- go or no-go ------------------------------------------------------------------------------------------------------

const VERDICTS: Record<string, { tone: Tone; icon: LucideIcon; label: () => string }> = {
  go: { tone: 'good', icon: CircleCheck, label: () => tr('Go') },
  caution: { tone: 'warn', icon: CircleAlert, label: () => tr('Go with care') },
  'no-go': { tone: 'bad', icon: CircleX, label: () => tr('No go') },
};

/** A verdict from the words agents use: go, caution, no-go (and ok, careful, stop…). */
const verdictOf = (v: unknown) => ({ good: 'go', warn: 'caution', bad: 'no-go' })[toneOf(v) as 'good' | 'warn' | 'bad'] ?? '';

function GoNoGo({ data }: { data: Data }) {
  const v = VERDICTS[verdictOf(data.verdict)];
  const checks = arr(data.checks ?? data.conditions ?? data.items)
    .filter(isObj)
    .map((c) => ({ c, v: verdictOf(c.status) }));
  const counts = (['go', 'caution', 'no-go'] as const).map((k) => [k, checks.filter((x) => x.v === k).length] as const).filter(([, n]) => n > 0);
  const VIcon = v?.icon;
  return (
    <Card>
      <Head title={data.title} />
      {v && VIcon && (
        <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3', TONE[v.tone])}>
          <VIcon size={28} strokeWidth={2.25} className="shrink-0" />
          <div className="text-[21px] leading-tight font-bold">{v.label()}</div>
          {counts.length > 0 && (
            <div className="ml-auto flex items-center gap-2.5 text-[12.5px] font-medium">
              {counts.map(([k, n]) => {
                const I = VERDICTS[k].icon;
                return (
                  <span key={k} className={cx('inline-flex items-center gap-1 tabular-nums', k === 'go' ? 'text-ok' : k === 'caution' ? 'text-warn' : 'text-err')} title={VERDICTS[k].label()}>
                    <I size={14} />
                    {n}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
      {str(data.summary) && <Md text={data.summary} className="mt-3 text-[13.5px] text-fg-2" />}
      {checks.length > 0 && (
        <ul className="m-0 mt-2 list-none p-0">
          {checks.map(({ c, v: cv }, i) => {
            const meta = VERDICTS[cv];
            const I = meta?.icon ?? CircleAlert;
            return (
              <li key={i} className="flex items-start gap-3 border-t border-line/70 py-2.5 first:border-t-0">
                <I size={18} className={cx('mt-px shrink-0', cv === 'go' ? 'text-ok' : cv === 'caution' ? 'text-warn' : cv === 'no-go' ? 'text-err' : 'text-fg-3')} aria-label={meta?.label()} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{textOf(c, 'name', 'title')}</span>
                    {str(c.value) && <span className="text-[13px] font-semibold tabular-nums">{str(c.value)}</span>}
                  </div>
                  {str(c.note) && <Md text={c.note} className="mt-0.5 text-[12.5px] text-fg-3" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---- a week timetable -------------------------------------------------------------------------------------------------

/** A weekday's name in the app's language, 0 for Monday to 6 for Sunday (2 November 2026 is a Monday). */
function weekdayName(i: number, weekday: 'short' | 'long' = 'short'): string {
  try {
    return new Intl.DateTimeFormat(lang(), { weekday }).format(new Date(2026, 10, 2 + i, 12));
  } catch {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] ?? '';
  }
}

/** The weekday a column's name stands for ("Tue", "Tuesday", or the app's language's), 0 for Monday; null when none. */
function weekdayOf(label: string): number | null {
  const t = label.trim().toLowerCase().replace(/\.$/, '');
  if (!t) return null;
  const en = /^(mon|tue|wed|thu|fri|sat|sun)/.exec(t);
  if (en) return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(en[1]);
  for (let i = 0; i < 7; i++) for (const w of ['short', 'long'] as const) if (weekdayName(i, w).toLowerCase().replace(/\.$/, '') === t) return i;
  return null;
}

/** Whether the app's language writes times on a 12-hour clock. */
function twelveHours(): boolean {
  try {
    return /h1[12]/.test(new Intl.DateTimeFormat(lang(), { hour: 'numeric' }).resolvedOptions().hourCycle ?? '');
  } catch {
    return false;
  }
}

/** An hour on the grid's edge: "9 AM" on a 12-hour clock, "09:00" on a 24-hour one. */
function hourText(m: number): string {
  if (!twelveHours() || m % 60) return minText(m);
  try {
    return new Intl.DateTimeFormat(lang(), { hour: 'numeric' }).format(new Date(2000, 0, 1, Math.floor(m / 60) % 24));
  } catch {
    return minText(m);
  }
}

/** From one time of day to another, short: "9:00–10:30 AM" (the half of the day once, when both are in it), "09:00–10:30". */
function rangeText(a: number, b: number): string {
  try {
    const f = new Intl.DateTimeFormat(lang(), { hour: 'numeric', minute: '2-digit' });
    const at = (m: number) => new Date(2000, 0, 1, Math.floor(m / 60) % 24, m % 60);
    const pa = f.formatToParts(at(a));
    const pb = f.formatToParts(at(b));
    const half = (p: Intl.DateTimeFormatPart[]) => p.find((x) => x.type === 'dayPeriod')?.value ?? '';
    const bare = (p: Intl.DateTimeFormatPart[]) =>
      p
        .filter((x) => x.type !== 'dayPeriod')
        .map((x) => x.value)
        .join('')
        .trim();
    if (!half(pa) || half(pa) !== half(pb)) return `${f.format(at(a))}–${f.format(at(b))}`;
    const first = pb.findIndex((x) => x.type === 'dayPeriod') < pb.findIndex((x) => x.type === 'hour');
    return first ? `${half(pb)} ${bare(pa)}–${bare(pb)}` : `${bare(pa)}–${bare(pb)} ${half(pb)}`;
  } catch {
    return `${minText(a)}–${minText(b)}`;
  }
}

interface WeekBlock {
  i: number;
  col: number;
  start: number;
  end: number;
  title: string;
  place: string;
  note: unknown;
  color: string;
  /** Its place among blocks that start together (side by side), how many they are, and how far it is set in over a block it starts inside. */
  lane: number;
  lanes: number;
  indent: number;
  group: number;
}

/**
 * A day's blocks laid out where they overlap: those that start within half an hour of each other side by side, one that
 * starts later inside another drawn over it, set in from its left (so both stay readable), later ones on top.
 */
function arrange(list: WeekBlock[]): WeekBlock[] {
  const out: WeekBlock[] = [];
  for (const src of [...list].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const b: WeekBlock = { ...src, lane: 0, lanes: 1, indent: 0, group: out.length };
    const over = out.filter((a) => a.start < b.end && b.start < a.end);
    const peers = over.filter((a) => b.start - a.start < 30);
    if (peers.length) {
      const g = peers[peers.length - 1].group;
      const members = out.filter((a) => a.group === g);
      for (const a of members) a.lanes = members.length + 1;
      Object.assign(b, { group: g, lane: members.length, lanes: members.length + 1, indent: members[0].indent });
    } else if (over.length) b.indent = Math.max(...over.map((a) => a.indent)) + 1;
    out.push(b);
  }
  return out;
}

/** Narrower than this, a column each day is too tight: one day at a time instead. */
const MIN_DAY = 56;
const GUTTER = 46;

function Week({ data, done }: { data: Data; done: boolean }) {
  const now = useNow(30_000);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const [pick, setPick] = useKept<number>('day', -1);
  const given = arr(data.days ?? data.columns)
    .map((d) => textOf(d, 'label', 'name', 'day'))
    .filter(Boolean);
  const cols = (given.length ? given : Array.from({ length: 7 }, (_, i) => weekdayName(i))).map((name, i) => {
    const date = given.length ? dayOf(name) : null;
    return { label: date ? fmtDate(date, 'dayMonth') : name, key: name.trim().toLowerCase(), date, weekday: !given.length ? i : date ? (date.getDay() + 6) % 7 : weekdayOf(name) };
  });
  const today = new Date(now);
  const todayCol = cols.findIndex((c) => (c.date ? ymd(c.date) === ymd(today) : c.weekday === (today.getDay() + 6) % 7));
  /** A block's column: its number from 0, or its column's name, date or weekday. */
  const colOf = (v: unknown): number | null => {
    const s = str(v).trim().toLowerCase();
    if (/^\d+$/.test(s)) return Number(s) < cols.length ? Number(s) : null;
    if (!s) return null;
    let at = cols.findIndex((c) => c.key === s || c.label.toLowerCase() === s);
    const d = at < 0 ? dayOf(s) : null;
    if (d) at = cols.findIndex((c) => !!c.date && ymd(c.date) === ymd(d));
    else if (at < 0) {
      const w = weekdayOf(s);
      if (w !== null) at = cols.findIndex((c) => c.weekday === w);
    }
    return at >= 0 ? at : null;
  };
  // While the block streams, a time still being written ("1" of "13:00") is not one yet.
  const timeOf = (v: unknown) => (done || /^\d{1,2}[:.h]\d{2}|\d\s*[ap]\.?m/i.test(str(v).trim()) ? clockMin(v) : null);
  const given0 = timeOf(data.start);
  const given1 = timeOf(data.end);
  const hues = new Map<string, number>();
  const blocks: WeekBlock[] = [];
  arr(data.blocks ?? data.items ?? data.events).forEach((b, i) => {
    if (!isObj(b)) return;
    const col = colOf(b.day ?? b.column ?? b.weekday);
    const start = timeOf(b.start ?? b.from);
    if (col === null || start === null || start >= 1440) return;
    const to = timeOf(b.end ?? b.to);
    // An end before the start runs past midnight: to the end of the day.
    const end = to === null ? Math.min(1440, start + 60) : to <= start ? 1440 : Math.min(1440, to);
    // Blocks wholly outside the hours asked for are left out.
    if ((given1 !== null && start >= given1) || (given0 !== null && end <= given0)) return;
    const title = textOf(b, 'title', 'name', 'label');
    let color = 'var(--fg-3)';
    if (str(b.tone)) color = TONE_FILL[toneOf(b.tone)];
    else {
      const k = title.trim().toLowerCase();
      if (!hues.has(k)) hues.set(k, hues.size);
      if (hues.get(k)! < 8) color = seriesColor(hues.get(k)!);
    }
    blocks.push({ i, col, start, end, title, place: str(b.place ?? b.room ?? b.where), note: b.note, color, lane: 0, lanes: 1, indent: 0, group: 0 });
  });
  const lo = blocks.length ? Math.min(...blocks.map((b) => b.start)) : 9 * 60;
  const hi = blocks.length ? Math.max(...blocks.map((b) => b.end)) : 17 * 60;
  const s0 = Math.max(0, Math.min(1380, given0 ?? Math.floor(lo / 60) * 60));
  let e1 = Math.min(1440, given1 ?? Math.ceil(hi / 60) * 60);
  if (e1 - s0 < 120) e1 = Math.min(1440, s0 + 120);
  const hourH = Math.max(32, Math.min(52, Math.round(480 / ((e1 - s0) / 60))));
  const y = (m: number) => ((Math.max(s0, Math.min(e1, m)) - s0) / 60) * hourH;
  const H = Math.round(y(e1));
  const single = width > 0 && cols.length > 1 && (width - GUTTER) / cols.length < MIN_DAY;
  const firstUsed = blocks.length ? Math.min(...blocks.map((b) => b.col)) : 0;
  const at = Math.min(Math.max(0, Math.round(num(pick) ?? -1) >= 0 ? Math.round(num(pick)!) : todayCol >= 0 ? todayCol : firstUsed), cols.length - 1);
  const shown = single ? [at] : cols.map((_, i) => i);
  const colW = width > 0 ? (width - GUTTER) / shown.length : 120;
  const marks: number[] = [];
  for (let m = Math.ceil(s0 / 60) * 60; m <= e1; m += 60) marks.push(m);
  const every = hourH < 38 ? 2 : 1;
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const nowShown = todayCol >= 0 && shown.includes(todayCol) && nowMin >= s0 && nowMin <= e1;
  const chosen = sel === null ? null : (blocks.find((b) => b.i === sel) ?? null);
  // Each title's hours in the week, with its colour: the key to the colours.
  const totals: { key: string; title: string; color: string; min: number }[] = [];
  for (const b of blocks) {
    const key = `${b.title.trim().toLowerCase()}|${b.color}`;
    const t = totals.find((x) => x.key === key);
    if (t) t.min += b.end - b.start;
    else totals.push({ key, title: b.title, color: b.color, min: b.end - b.start });
  }
  const dayLong = (c: number) => {
    const col = cols[c];
    if (!col) return '';
    if (col.date) return fmtDate(col.date, 'long');
    return col.weekday !== null ? weekdayName(col.weekday, 'long') : col.label;
  };
  return (
    <Card>
      <Head title={data.title} />
      <div ref={ref} className="min-w-0">
        {blocks.length > 0 && (
          <>
            {single && (
              <div className={cx('mb-3', !done && 'pointer-events-none')}>
                <Seg
                  size="sm"
                  value={at}
                  onChange={(v) => {
                    setPick(v);
                    setSel(null);
                  }}
                  options={cols.map((c, i) => ({
                    value: i,
                    label: (
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {i === todayCol && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      </span>
                    ),
                  }))}
                />
              </div>
            )}
            {!single && (
              <div className="flex pb-1.5" style={{ paddingLeft: GUTTER }}>
                {shown.map((c) => (
                  <div key={c} className="min-w-0 flex-1 px-0.5 text-center">
                    <span className={cx('inline-block max-w-full truncate rounded-full px-1.5 py-0.5 text-[12px] font-semibold', c === todayCol ? 'bg-accent text-accent-fg' : 'text-fg-2')}>{cols[c].label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className={cx('relative', single && 'mt-1')} style={{ height: H }}>
              {marks.map((m, k) => (
                <Fragment key={m}>
                  <div className="absolute right-0 border-t border-line/70" style={{ top: y(m), left: GUTTER }} />
                  {k % every === 0 && (
                    <span className="absolute left-0 -translate-y-1/2 pr-2 text-right text-[11px] leading-none whitespace-nowrap text-fg-3 tabular-nums" style={{ top: y(m), width: GUTTER }}>
                      {hourText(m)}
                    </span>
                  )}
                </Fragment>
              ))}
              <div className="absolute inset-y-0 right-0 flex" style={{ left: GUTTER }}>
                {shown.map((c) => (
                  <div key={c} className={cx('relative min-w-0 flex-1 border-l border-line/70', c === todayCol && 'bg-accent-soft/60')}>
                    {arrange(blocks.filter((b) => b.col === c)).map((b) => {
                      const top = y(b.start) + 1;
                      const h = Math.max(15, y(b.end) - y(b.start) - 2);
                      const inset = b.indent * Math.min(18, (colW - 4) * 0.24);
                      const w = (colW - 4 - inset) / b.lanes;
                      const words = w >= 30;
                      // As much as fits: the title, the times (or the start alone when narrow), the place.
                      const time = h >= 38 && w >= 46 ? (w >= 100 ? rangeText(b.start, b.end) : hourText(b.start)) : '';
                      const place = !!b.place && h >= 54 && w >= 64;
                      const lines = Math.max(1, Math.floor((h - 6 - (time ? 14 : 0) - (place ? 14 : 0)) / 15));
                      return (
                        <button
                          key={b.i}
                          type="button"
                          disabled={!done}
                          aria-pressed={sel === b.i}
                          onClick={() => setSel((s) => (s === b.i ? null : b.i))}
                          title={`${b.title} · ${rangeText(b.start, b.end)}${b.place ? ` · ${b.place}` : ''}`}
                          className={cx('absolute flex flex-col overflow-hidden rounded-[6px] py-[3px] pr-1 text-left disabled:cursor-default', w < 70 ? 'pl-1.5' : 'pl-2')}
                          style={{
                            top,
                            height: h,
                            left: 2 + inset + b.lane * w,
                            width: Math.max(4, w - (b.lanes > 1 ? 2 : 0)),
                            zIndex: sel === b.i ? 5 : 1 + b.indent,
                            background: `color-mix(in srgb, ${b.color} 17%, var(--panel))`,
                            // Its colour down its left; a rim of the panel's colour over a block it overlaps; a ring when picked.
                            boxShadow: [`inset 3px 0 0 ${b.color}`, b.indent ? '0 0 0 1.5px var(--panel)' : '', sel === b.i ? '0 0 0 2px var(--fg-2)' : ''].filter(Boolean).join(', '),
                          }}
                        >
                          {words && (
                            <span className={cx('leading-[15px] font-semibold break-words hyphens-auto text-fg', w < 80 ? 'text-[11.5px]' : 'text-[12px]')} style={{ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {b.title}
                            </span>
                          )}
                          {words && time && <span className="truncate text-[11px] leading-[14px] text-fg-2 tabular-nums">{time}</span>}
                          {words && place && <span className="truncate text-[11px] leading-[14px] text-fg-3">{b.place}</span>}
                        </button>
                      );
                    })}
                    {c === todayCol && nowShown && (
                      <div className="pointer-events-none absolute right-0 left-0 z-[6]" style={{ top: y(nowMin) }} aria-label={tr('Now')}>
                        <span className="absolute top-[-4px] left-[-4px] h-2 w-2 rounded-full bg-accent" />
                        <span className="absolute top-[-1px] right-0 left-0 h-[2px] bg-accent" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {chosen && (
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-line bg-bg-1 py-2.5 pr-2 pl-3.5">
                <span className="mt-[5px] h-3 w-3 shrink-0 rounded-[4px]" style={{ background: chosen.color }} />
                <div className="min-w-0 flex-1">
                  <div className="leading-snug font-semibold">{chosen.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-fg-3">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock size={12} className="shrink-0" />
                      {`${dayLong(chosen.col)} · ${rangeText(chosen.start, chosen.end)} · ${fmtMinutes(chosen.end - chosen.start)}`}
                    </span>
                    {chosen.place && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} className="shrink-0" />
                        {chosen.place}
                      </span>
                    )}
                  </div>
                  {str(chosen.note) && <Md text={chosen.note} className="mt-1.5 text-[13px] text-fg-2" />}
                </div>
                <button type="button" onClick={() => setSel(null)} title={tr('Close')} aria-label={tr('Close')} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
                  <X size={14} />
                </button>
              </div>
            )}
            {totals.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[12px] text-fg-2">
                {totals.map((t) => (
                  <span key={t.key} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: t.color }} />
                    {t.title}
                    <span className="text-fg-3 tabular-nums">{fmtMinutes(t.min)}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ---- a Gantt chart ----------------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
/** A day as a count of days since 1970 (its date, whatever the time zone). */
const dayNo = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
/** The day a count of days stands for, at noon. */
function dayAt(n: number): Date {
  const u = new Date(n * DAY_MS);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), 12);
}

interface GanttTask {
  i: number;
  id: string;
  name: string;
  s: number;
  e: number;
  progress: number | null;
  group: string;
  depends: string[];
  milestone: boolean;
  owner: string;
  color: string;
  y: number;
}

/** The rows over the bars (months over weeks or days, years over months), each section of tasks, the line under them. */
const G_AXIS = 42;
const G_GROUP = 28;
const G_ROW = 34;
const G_BAR = 14;
const G_FOOT = 20;

/** A bar's outline: rounded at its left end, and at its right end too unless `cut` (progress inside a bar). */
function barOutline(x: number, y: number, w: number, h: number, cut = false): string {
  const r = Math.min(4, w / 2, h / 2);
  const rr = cut ? 0 : r;
  const right = rr ? `Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}` : `V${y + h}`;
  return `M${x + r},${y}H${x + w - rr}${right}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`;
}

/** "2–13 Nov 2026": the days from one to another, as the app's language writes a range. */
function daysText(a: Date, b: Date): string {
  try {
    const f = new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short', year: 'numeric' }) as Intl.DateTimeFormat & { formatRange?: (x: Date, y: Date) => string };
    if (f.formatRange) return f.formatRange(a, b);
  } catch {}
  return `${fmtDate(a, 'short')} – ${fmtDate(b, 'medium')}`;
}

function Gantt({ data, done }: { data: Data; done: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);
  const groups: string[] = [];
  const tasks: GanttTask[] = [];
  arr(data.tasks ?? data.items).forEach((t, i) => {
    if (!isObj(t)) return;
    const s = dayOf(t.start ?? t.from ?? t.date);
    const e = dayOf(t.end ?? t.to ?? t.due);
    const first = s ?? e;
    if (!first) return;
    const milestone = yes(t.milestone) || str(t.type).trim().toLowerCase() === 'milestone';
    const last = milestone || !e || e < first ? first : e;
    const group = str(t.group ?? t.phase).trim();
    if (!groups.includes(group)) groups.push(group);
    const p = num(t.progress);
    tasks.push({
      i,
      id: str(t.id).trim().toLowerCase(),
      name: textOf(t, 'name', 'title', 'task'),
      s: dayNo(first),
      e: dayNo(last),
      // 0.6 is taken as 60%.
      progress: p === null || milestone ? null : Math.max(0, Math.min(100, p > 0 && p < 1 ? p * 100 : p)),
      group,
      depends: words(t.depends ?? t.after ?? t.dependencies).map((d) => d.trim().toLowerCase()),
      milestone,
      owner: str(t.owner ?? t.who),
      color: '',
      y: 0,
    });
  });
  const sections = groups.map((name, k) => ({ name, color: k < 8 ? seriesColor(k) : 'var(--fg-3)', tasks: tasks.filter((t) => t.group === name) }));
  let yAt = G_AXIS;
  const rows = sections.map((sec) => {
    const gy = sec.name ? yAt : null;
    if (sec.name) yAt += G_GROUP;
    for (const t of sec.tasks) {
      t.color = sec.color;
      t.y = yAt;
      yAt += G_ROW;
    }
    return { ...sec, gy };
  });
  const lo = tasks.length ? Math.min(...tasks.map((t) => t.s)) : 0;
  const hi = tasks.length ? Math.max(...tasks.map((t) => t.e)) : 0;
  const pad = Math.max(2, Math.round((hi - lo + 1) * 0.03));
  const d0 = lo - pad;
  const d1 = hi + 1 + pad;
  const days = d1 - d0;
  const nameW = Math.max(112, Math.min(220, Math.round(width * 0.34)));
  // Room after a milestone at the very end, for its date.
  const tail = tasks.some((t) => t.milestone && t.s >= hi - pad) ? 48 : 0;
  const ppd = Math.max(days <= 400 ? 2.6 : 0.3, (Math.max(100, width - nameW - tail) - 2) / days);
  const chartW = Math.max(1, Math.floor(days * ppd) + tail);
  const sx = (n: number) => (n - d0) * ppd;
  const todayN = dayNo(dayOf(data.today) ?? new Date());
  const todayX = todayN >= d0 && todayN < d1 ? sx(todayN + 0.5) : null;
  const total = yAt + (todayX !== null ? G_FOOT : 6);
  // What runs along the top: months over days or weeks, or years over months, each labelled where it fits.
  const tierDays = ppd >= 16;
  const tierWeeks = !tierDays && ppd >= 2.6;
  const top: { x: number; label: string; year?: number }[] = [];
  const bottom: { x: number; label: string }[] = [];
  const lines: { x: number; strong: boolean }[] = [];
  const weekends: number[] = [];
  if (tasks.length) {
    const start = dayAt(d0);
    const m = new Date(start.getFullYear(), start.getMonth(), 1, 12);
    let k = 0;
    const monthEvery = Math.max(1, Math.ceil(30 / (30.4 * ppd)));
    for (; dayNo(m) < d1; m.setMonth(m.getMonth() + 1), k++) {
      const n = dayNo(m);
      if (n > d0) lines.push({ x: sx(n), strong: true });
      const year = m.getMonth() === 0 || k === 0;
      if (tierDays || tierWeeks) top.push({ x: sx(Math.max(n, d0)), label: m.getMonth() === 0 ? `${fmtDate(m, 'month')} ${m.getFullYear()}` : fmtDate(m, 'month'), year: m.getFullYear() });
      else {
        if (k % monthEvery === 0) bottom.push({ x: sx(Math.max(n, d0)), label: fmtDate(m, 'month') });
        if (year) top.push({ x: sx(Math.max(n, d0)), label: String(m.getFullYear()) });
      }
    }
    if (tierWeeks) {
      const weekEvery = Math.max(1, Math.ceil(22 / (7 * ppd)));
      let n = d0 + ((7 - ((dayAt(d0).getDay() + 6) % 7)) % 7);
      for (let w = 0; n < d1; n += 7, w++) {
        if (dayAt(n).getDate() !== 1) lines.push({ x: sx(n), strong: false });
        if (w % weekEvery === 0) bottom.push({ x: sx(n), label: fmtDate(dayAt(n), 'day') });
      }
    }
    if (tierDays)
      for (let n = d0; n < d1; n++) {
        const wd = dayAt(n).getDay();
        if (wd === 0 || wd === 6) weekends.push(n);
        bottom.push({ x: sx(n) + ppd / 2, label: fmtDate(dayAt(n), 'day') });
      }
  }
  // A label is left out when the next one starts before it ends (the first month, cut short, gives way), or it would run off the end.
  const room = (l: { label: string }) => l.label.length * 6.6 + 8;
  const fits = <T extends { x: number; label: string }>(list: T[], centred = false): T[] =>
    list.filter((l, k) => (k === list.length - 1 || list[k + 1].x - l.x >= room(l)) && l.x + (centred ? room(l) / 2 : room(l)) <= chartW + 4);
  // The first month shown says its year.
  const tops = fits(top).map((l, k) => (k === 0 && l.year && !l.label.includes(String(l.year)) ? { ...l, label: `${l.label} ${l.year}` } : l));
  const byId = (key: string) => tasks.find((t) => t.id === key) ?? tasks.find((t) => t.name.trim().toLowerCase() === key);
  const startX = (t: GanttTask) => (t.milestone ? sx(t.s + 0.5) - 7 : sx(t.s));
  const endX = (t: GanttTask) => (t.milestone ? sx(t.s + 0.5) + 7 : sx(t.e + 1));
  const mid = (t: GanttTask) => t.y + G_ROW / 2;
  // Scrolled to today the first time, when the chart is wider than its box.
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!done || scrolled.current || !el || width <= 0 || !tasks.length) return;
    scrolled.current = true;
    if (todayX !== null && nameW + chartW > el.clientWidth) el.scrollLeft = Math.max(0, todayX - (el.clientWidth - nameW) * 0.35);
  }, [done, width, chartW, nameW, todayX, tasks.length]);
  const point = (i: number) => (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    setHover({ i, x: r ? e.clientX - r.left : 0 });
  };
  const shown = hover ? tasks.find((t) => t.i === hover.i) : undefined;
  const after = shown ? shown.depends.map((d) => byId(d)?.name).filter(Boolean) : [];
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 pb-3 @lg:px-5" />}
      <div ref={ref} className={cx('relative min-w-0', !str(data.title) && 'pt-2')}>
        {tasks.length > 0 && width > 0 && (
          <div ref={scroller} className="overflow-x-auto overscroll-x-contain">
            <div className="flex" style={{ width: nameW + chartW }}>
              <div className="sticky left-0 z-[2] shrink-0 border-r border-line bg-panel" style={{ width: nameW }} onPointerLeave={() => setHover(null)}>
                <div className="border-b border-line" style={{ height: G_AXIS }} />
                {rows.map((sec) => (
                  <Fragment key={sec.name}>
                    {sec.name && (
                      <div className="flex items-end gap-1.5 px-4 pb-1 @lg:px-5" style={{ height: G_GROUP }}>
                        <span className="mb-[2px] h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: sec.color }} />
                        <span className="aui-h4 truncate">{sec.name}</span>
                      </div>
                    )}
                    {sec.tasks.map((t) => {
                      const meta = [t.owner, t.progress !== null ? `${fmtNum(t.progress, { maximumFractionDigits: 0 })}%` : ''].filter(Boolean).join(' · ');
                      return (
                        <div key={t.i} className={cx('flex flex-col justify-center px-4 leading-tight @lg:px-5', hover?.i === t.i && 'bg-bg-2')} style={{ height: G_ROW }} title={t.name} onPointerMove={point(t.i)}>
                          <span className={cx('truncate text-[12.5px]', t.milestone ? 'font-semibold text-fg' : 'font-medium text-fg')}>{t.name}</span>
                          {meta && <span className="truncate text-[11px] text-fg-3 tabular-nums">{meta}</span>}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
              <svg width={chartW} height={total} className="block shrink-0" role="img" aria-label={str(data.title) || tr('Gantt chart')} onPointerLeave={() => setHover(null)}>
                {weekends.map((n) => (
                  <rect key={n} x={sx(n)} y={G_AXIS} width={ppd} height={total - G_AXIS} fill="var(--bg-1)" />
                ))}
                {shown && <rect x={0} y={shown.y} width={chartW} height={G_ROW} fill="var(--bg-2)" />}
                {lines.map((l, k) => (
                  <line key={k} x1={l.x} x2={l.x} y1={l.strong ? 4 : G_AXIS - 18} y2={total - (todayX !== null ? G_FOOT : 0)} stroke={l.strong ? 'var(--viz-axis)' : 'var(--viz-grid)'} shapeRendering="crispEdges" />
                ))}
                {tops.map((l, k) => (
                  <text key={k} x={l.x + 5} y={15} className="fill-fg-2 text-[11.5px] font-semibold">
                    {l.label}
                  </text>
                ))}
                {fits(bottom, tierDays).map((l, k) => (
                  <text key={k} x={tierDays ? l.x : l.x + 4} y={G_AXIS - 7} textAnchor={tierDays ? 'middle' : 'start'} className="fill-fg-3 text-[11px] tabular-nums">
                    {l.label}
                  </text>
                ))}
                <line x1={0} x2={chartW} y1={G_AXIS - 0.5} y2={G_AXIS - 0.5} stroke="var(--line)" />
                {/* Each group's span, thin under its heading. */}
                {rows.map((sec) =>
                  sec.gy !== null && sec.tasks.length ? <rect key={sec.name} x={sx(Math.min(...sec.tasks.map((t) => t.s)))} y={sec.gy + G_GROUP - 9} width={Math.max(2, sx(Math.max(...sec.tasks.map((t) => t.e)) + 1) - sx(Math.min(...sec.tasks.map((t) => t.s))))} height={4} rx={2} fill={sec.color} opacity={0.45} /> : null,
                )}
                {/* What waits for what: from the end of one to the start of the next. */}
                {tasks.flatMap((t) =>
                  t.depends.map((key, k) => {
                    const from = byId(key);
                    if (!from || from === t) return null;
                    const x1 = endX(from);
                    const y1 = mid(from);
                    const x2 = startX(t);
                    const y2 = mid(t);
                    // Out of a milestone from its lower point (its date is on its right); out of a bar from its end.
                    const tip = from.milestone ? sx(from.s + 0.5) : 0;
                    const d =
                      from.milestone && y2 > y1 && x2 - tip >= 4
                        ? `M${tip},${y1 + 7}V${y2}H${x2 - 1}`
                        : x2 - x1 >= 14
                          ? `M${x1},${y1}H${x1 + 6}V${y2}H${x2 - 1}`
                          : `M${x1},${y1}H${x1 + 6}V${y2 - Math.sign(y2 - y1 || 1) * (G_ROW / 2)}H${x2 - 8}V${y2}H${x2 - 1}`;
                    return (
                      <g key={`${t.i}:${k}`} opacity={hover && hover.i !== t.i && hover.i !== from.i ? 0.25 : 0.7}>
                        <path d={d} fill="none" stroke="var(--fg-3)" strokeWidth={1.25} strokeLinejoin="round" />
                        <path d={`M${x2},${y2}l-5,-3.5v7z`} fill="var(--fg-3)" />
                      </g>
                    );
                  }),
                )}
                {tasks.map((t) => {
                  const yb = t.y + (G_ROW - G_BAR) / 2;
                  if (t.milestone) {
                    const cx0 = sx(t.s + 0.5);
                    const cy0 = mid(t);
                    const label = fmtDate(dayAt(t.s), 'short');
                    // Its date beside it: on its right, or on its left where the chart ends.
                    const right = cx0 + 12 + label.length * 6.4 <= chartW;
                    return (
                      <g key={t.i}>
                        <rect x={cx0 - 5.5} y={cy0 - 5.5} width={11} height={11} rx={1.5} transform={`rotate(45 ${cx0} ${cy0})`} fill={t.color} stroke="var(--panel)" strokeWidth={1.5} />
                        <text x={right ? cx0 + 12 : cx0 - 12} y={cy0} dy="0.35em" textAnchor={right ? 'start' : 'end'} stroke="var(--panel)" strokeWidth={4} strokeLinejoin="round" paintOrder="stroke" className="fill-fg-3 text-[11px] tabular-nums">
                          {label}
                        </text>
                      </g>
                    );
                  }
                  const x = sx(t.s);
                  const w = Math.max(3, sx(t.e + 1) - x - 1);
                  const p = t.progress;
                  return (
                    <g key={t.i}>
                      {p === null ? (
                        <path d={barOutline(x, yb, w, G_BAR)} fill={t.color} />
                      ) : (
                        <>
                          <path d={barOutline(x, yb, w, G_BAR)} fill={t.color} opacity={0.3} />
                          {p > 0 && <path d={barOutline(x, yb, Math.max(2, (w * p) / 100), G_BAR, p < 100)} fill={t.color} />}
                        </>
                      )}
                    </g>
                  );
                })}
                {todayX !== null && (
                  <g>
                    <line x1={todayX} x2={todayX} y1={G_AXIS} y2={total - G_FOOT + 2} stroke="var(--accent)" strokeWidth={1.5} />
                    <text x={Math.min(Math.max(todayX, 20), chartW - 20)} y={total - 6} textAnchor="middle" className="fill-accent text-[11px] font-semibold">
                      {tr('Today')}
                    </text>
                  </g>
                )}
                {tasks.map((t) => (
                  <rect key={t.i} x={0} y={t.y} width={chartW} height={G_ROW} fill="transparent" onPointerMove={point(t.i)} />
                ))}
              </svg>
            </div>
          </div>
        )}
        {shown && hover && (
          <div className="pointer-events-none absolute z-10 w-max max-w-[260px] rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12px] leading-snug shadow-pop" style={{ left: Math.min(Math.max(4, hover.x + 14), Math.max(4, width - 264)), top: shown.y + G_ROW + 2 + (str(data.title) ? 0 : 8) }}>
            <div className="font-semibold text-fg">{shown.name}</div>
            <div className="text-fg-2 tabular-nums">
              {shown.milestone
                ? fmtDate(dayAt(shown.s), 'medium')
                : `${daysText(dayAt(shown.s), dayAt(shown.e))} · ${shown.e - shown.s + 1 === 1 ? tr('1 day') : tr('{0} days').replace('{0}', String(shown.e - shown.s + 1))}`}
            </div>
            {shown.progress !== null && <div className="text-fg-2">{tr('{0} done').replace('{0}', `${fmtNum(shown.progress, { maximumFractionDigits: 0 })}%`)}</div>}
            {(shown.group || shown.owner) && <div className="text-fg-3">{[shown.group, shown.owner].filter(Boolean).join(' · ')}</div>}
            {after.length > 0 && <div className="text-fg-3">{tr('After {0}').replace('{0}', after.join(', '))}</div>}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- timers -----------------------------------------------------------------------------------------------------------

/** The page's sound, one for every timer (a browser keeps it silent until a tap: starting a timer wakes it). */
let sound: AudioContext | null = null;
function wakeSound(): AudioContext | null {
  try {
    const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    sound ??= new Ctx();
    if (sound.state === 'suspended') void sound.resume();
    return sound;
  } catch {
    return null;
  }
}

/** A short beep made on the spot (no sound file), or a few in a row. */
function beep(times = 1) {
  const ctx = wakeSound();
  if (!ctx) return;
  try {
    for (let k = 0; k < times; k++) {
      const t = ctx.currentTime + 0.02 + k * 0.3;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.22);
    }
  } catch {}
}

/** The time now, again every `ms` while `on` (a timer runs); still otherwise. */
function useTicking(on: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [on, ms]);
  return now;
}

/** Seconds as a timer shows them: 6:30, 1:02:30. */
function clockOf(s: number): string {
  const t = Math.max(0, Math.ceil(s - 0.001));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h ? `${h}:${pad2(m)}:${pad2(t % 60)}` : `${m}:${pad2(t % 60)}`;
}

/** Seconds in words: 40 s, 6 min 30 s, 1 h 5 min. */
function secsText(s: number): string {
  const t = Math.round(s);
  if (t < 60) return `${t} s`;
  if (t < 3600) return t % 60 ? `${Math.floor(t / 60)} min ${t % 60} s` : `${t / 60} min`;
  return fmtMinutes(Math.round(t / 60));
}

/** How long a timer runs, in seconds: from seconds, minutes, or a length as words ("6:30", "6 min 30 s"). */
function secondsOf(t: Data): number | null {
  const s = num(t.seconds ?? t.secs);
  if (s !== null) return s;
  const m = num(t.minutes ?? t.mins);
  if (m !== null) return m * 60;
  const text = str(t.duration ?? t.time ?? t.seconds ?? t.length).trim().toLowerCase();
  const hms = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text);
  if (hms) return Number(hms[1] ?? 0) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  let total = 0;
  let any = false;
  for (const x of text.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g)) {
    any = true;
    total += Number(x[1]) * (x[2].startsWith('h') ? 3600 : x[2].startsWith('m') ? 60 : 1);
  }
  return any ? total : null;
}

interface TimerItem {
  label: string;
  secs: number;
  note: unknown;
}

/** A timer's state: running until `ends`, paused with `left` (ms), or over (`rang`); none before it starts. */
interface TimerRun {
  ends?: number;
  left?: number;
  rang?: boolean;
}

function TimerTiles({ list, done, quiet }: { list: TimerItem[]; done: boolean; quiet: boolean }) {
  const [runs, setRuns] = useKept<Record<string, TimerRun>>('runs', {});
  const opened = useRef(Date.now());
  const now = useTicking(list.some((_, i) => !!runs[i]?.ends));
  // A timer that ran out rings once: with a beep and a note when it happened with the page open.
  useEffect(() => {
    const due = list.map((_, i) => i).filter((i) => (runs[i]?.ends ?? Infinity) <= now);
    if (!due.length) return;
    setRuns((prev) => {
      const next = { ...prev };
      for (const i of due) next[i] = { left: 0, rang: true };
      return next;
    });
    const heard = due.filter((i) => (runs[i]?.ends ?? 0) > opened.current);
    if (!heard.length) return;
    if (!quiet) beep(3);
    for (const i of heard) toast(`${tr('Time is up')}: ${list[i].label}`, 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  const toggle = (i: number) => {
    wakeSound();
    setRuns((prev) => {
      const r = prev[i] ?? {};
      const t = Date.now();
      if (r.ends) return { ...prev, [i]: { left: Math.max(0, r.ends - t) } };
      const left = r.rang || !r.left || r.left <= 0 ? list[i].secs * 1000 : r.left;
      return { ...prev, [i]: { ends: t + left } };
    });
  };
  const reset = (i: number) =>
    setRuns((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
  return (
    <div className="grid gap-2.5 @lg:grid-cols-2">
      {list.map((t, i) => {
        const r = runs[i];
        const on = !!r?.ends;
        const over = !!r?.rang;
        const left = on ? Math.max(0, r!.ends! - now) : (r?.left ?? t.secs * 1000);
        return (
          <div key={i} className={cx('flex min-w-0 flex-col rounded-xl border px-3.5 py-3 transition-colors', over ? 'border-ok/40 bg-ok/10' : on ? 'border-accent/50 bg-accent-soft' : 'border-line')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pt-0.5">
                <div className="leading-snug font-semibold">{t.label}</div>
                {str(t.note) && <Md text={t.note} className="mt-0.5 text-[12.5px] text-fg-3" />}
              </div>
              <div className={cx('shrink-0 text-[26px] leading-none font-semibold tabular-nums', over ? 'text-ok' : on ? 'text-accent' : 'text-fg')}>{clockOf(left / 1000)}</div>
            </div>
            <Meter value={over ? 1 : left} max={over ? 1 : t.secs * 1000} thin tone={over ? 'good' : 'accent'} className="mt-3" />
            <div className="mt-2.5 flex items-center gap-1.5">
              <Btn primary={!on} disabled={!done} onClick={() => toggle(i)} icon={on ? <Pause size={13} fill="currentColor" /> : over ? <RotateCcw size={13} /> : <Play size={13} fill="currentColor" />}>
                {on ? tr('Pause') : over ? tr('Again') : r ? tr('Resume') : tr('Start')}
              </Btn>
              {r && !over && <Btn disabled={!done} onClick={() => reset(i)} icon={<RotateCcw size={13} />} title={tr('Start over')} />}
              {over && (
                <>
                  <Btn disabled={!done} onClick={() => reset(i)} icon={<X size={13} />} title={tr('Clear')} />
                  <span className="ml-auto text-[12.5px] font-semibold text-ok">{tr('Time is up')}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A sequence's state: the step it is at (counted through every round), running until `ends`, paused with `left`, or over. */
interface SequenceRun {
  at: number;
  ends?: number;
  left?: number;
  over?: boolean;
}

/** A step to rest in (it takes the calmer colour). */
const RESTING = /\b(rest|break|recover|recovery|relax|pause|cool|easy|breathe out|exhale)/i;

function TimerSequence({ list, rounds, done, quiet }: { list: TimerItem[]; rounds: number; done: boolean; quiet: boolean }) {
  const n = list.length;
  const total = n * rounds;
  const [run, setRun] = useKept<SequenceRun>('sequence', { at: 0 });
  const at = Math.min(Math.max(0, Math.round(num(run.at) ?? 0)), Math.max(0, total - 1));
  const step = n ? at % n : 0;
  const round = n ? Math.floor(at / n) : 0;
  const ms = (k: number) => (list[k % n]?.secs ?? 0) * 1000;
  const opened = useRef(Date.now());
  const now = useTicking(!!run.ends);
  // A step that ran out leads to the next (with a beep); the last one ends it all (with three and a note).
  useEffect(() => {
    if (!run.ends || run.ends > now || !total) return;
    let k = at;
    let ends = run.ends;
    while (ends <= now && k < total - 1) ends += ms(++k);
    const heard = run.ends > opened.current;
    if (ends <= now) {
      setRun({ at: total - 1, left: 0, over: true });
      if (heard) {
        if (!quiet) beep(3);
        toast(tr('All done!'), 'ok');
      }
    } else {
      setRun({ at: k, ends });
      if (heard && !quiet) beep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  const left = run.over ? 0 : run.ends ? Math.max(0, run.ends - now) : (run.left ?? ms(at));
  const fresh = !run.ends && !run.over && at === 0 && run.left === undefined;
  const toggle = () => {
    wakeSound();
    const t = Date.now();
    if (run.over) setRun({ at: 0, ends: t + ms(0) });
    else if (run.ends) setRun({ at, left: Math.max(0, run.ends - t) });
    else setRun({ at, ends: t + (run.left ?? ms(at)) });
  };
  const skip = () => {
    if (at >= total - 1) return setRun({ at: total - 1, left: 0, over: true });
    setRun(run.ends ? { at: at + 1, ends: Date.now() + ms(at + 1) } : { at: at + 1 });
  };
  const cur = list[step];
  if (!cur) return null;
  const resting = RESTING.test(cur.label);
  return (
    <div className="grid items-center gap-x-6 gap-y-4 @md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-3">
        <Ring value={run.over ? 1 : left} max={run.over ? 1 : ms(at) || 1} size={152} stroke={8} tone={run.over ? 'good' : resting ? 'info' : 'accent'}>
          <span className="flex flex-col items-center px-5">
            <span className={cx('max-w-[112px] truncate text-[12.5px] font-semibold', run.over ? 'text-ok' : 'text-fg-2')}>{run.over ? tr('All done!') : cur.label}</span>
            <span className="mt-1 text-[32px] leading-none font-semibold tabular-nums">{clockOf(left / 1000)}</span>
            {rounds > 1 && !run.over && <span className="mt-1.5 text-[11.5px] text-fg-3 tabular-nums">{tr('Round {0} of {1}').replace('{0}', String(round + 1)).replace('{1}', String(rounds))}</span>}
          </span>
        </Ring>
        <div className="flex items-center gap-2">
          <Btn disabled={!done || fresh} onClick={() => setRun({ at: 0 })} icon={<RotateCcw size={14} />} title={tr('Start over')} />
          <Btn primary disabled={!done} onClick={toggle} icon={run.ends ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />} className="min-w-[96px]">
            {run.ends ? tr('Pause') : run.over ? tr('Again') : fresh ? tr('Start') : tr('Resume')}
          </Btn>
          <Btn disabled={!done || !!run.over} onClick={skip} icon={<SkipForward size={14} />} title={tr('Skip')} />
        </div>
      </div>
      <ol className="m-0 min-w-0 list-none space-y-1 p-0">
        {list.map((t, k) => {
          const now_ = !run.over && k === step;
          const past = !!run.over || k < step;
          return (
            <li key={k} className={cx('flex items-start gap-3 rounded-lg px-2.5 py-1.5', now_ && 'bg-accent-soft')}>
              <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold', past ? 'bg-ok/15 text-ok' : now_ ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg-3')}>{past ? <Check size={11} strokeWidth={3} /> : k + 1}</span>
              <div className="min-w-0 flex-1">
                <div className={cx('leading-snug', now_ ? 'font-semibold' : 'font-medium', past && 'text-fg-3')}>{t.label}</div>
                {str(t.note) && <Md text={t.note} className="text-[12.5px] text-fg-3" />}
              </div>
              <span className="shrink-0 pt-px text-[12.5px] text-fg-2 tabular-nums">{secsText(t.secs)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Timers({ data, done }: { data: Data; done: boolean }) {
  const list = arr(data.timers ?? data.items ?? data.steps)
    .map((t) => (isObj(t) ? t : { label: str(t) }))
    .map((t) => ({ label: textOf(t, 'label', 'name', 'title'), secs: secondsOf(t) ?? 0, note: t.note }))
    .filter((t) => t.secs > 0);
  const sequence = /^(seq|interval|circuit|round)/i.test(str(data.mode).trim());
  const rounds = Math.min(99, Math.max(1, Math.round(num(data.rounds) ?? 1)));
  const [quiet, setQuiet] = useKept<boolean>('quiet', false);
  const sub = sequence && list.length ? [rounds > 1 ? tr('{0} rounds').replace('{0}', String(rounds)) : '', tr('{0} in all').replace('{0}', secsText(list.reduce((m, t) => m + t.secs, 0) * rounds))].filter(Boolean).join(' · ') : '';
  return (
    <Card>
      <Head
        title={data.title}
        sub={sub}
        aside={
          list.length > 0 ? (
            <button type="button" onClick={() => setQuiet((q) => !q)} aria-pressed={!quiet} title={quiet ? tr('Sound off') : tr('Sound on')} aria-label={quiet ? tr('Sound off') : tr('Sound on')} className="grid h-7 w-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
              {quiet ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          ) : undefined
        }
      />
      {list.length > 0 && (sequence ? <TimerSequence list={list} rounds={rounds} done={done} quiet={quiet} /> : <TimerTiles list={list} done={done} quiet={quiet} />)}
    </Card>
  );
}

// ---- order tracking ---------------------------------------------------------------------------------------------------

/** How a shipment or an application stands, by its words: delivered or done is good, a problem a warning or bad, else under way. */
function trackTone(v: string): Tone {
  const s = v.toLowerCase();
  if (/\b(fail|lost|return|cancel|reject|refus|denied|damag|undeliver)/.test(s)) return 'bad';
  if (/\b(exception|delay|held|on hold|customs|action|attention|missed|problem|issue)/.test(s)) return 'warn';
  if (/out for delivery|on (its|the) way|in transit/.test(s)) return 'accent';
  if (/\b(delivered|complete|completed|approved|accepted|granted|issued|picked up|collected|ready|done)\b/.test(s)) return 'good';
  return 'accent';
}

/** A day near today as words: "today", "tomorrow" (in the app's language), else its weekday or date. */
function nearDay(d: Date, now: number): string {
  const diff = dayNo(d) - dayNo(new Date(now));
  if (Math.abs(diff) <= 1)
    try {
      return new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' }).format(diff, 'day');
    } catch {}
  return fmtDate(d, diff > 1 && diff < 7 ? 'longWeekday' : 'dayMonth');
}

/** Whether a date as written has a time of day. */
const timed = (s: string) => /\d[T\s]\d{1,2}:\d{2}/.test(s);

function Tracking({ data }: { data: Data }) {
  const now = useNow(60_000);
  let steps = arr(data.steps ?? data.events ?? data.history ?? data.updates)
    .map((s) => (isObj(s) ? s : { label: str(s) }))
    .map((s) => {
      const raw = str(s.time ?? s.date ?? s.at).trim();
      return { label: textOf(s, 'label', 'title', 'status', 'name', 'text'), raw, time: parseDate(raw), place: str(s.place ?? s.location ?? s.where), note: s.note, done: s.done };
    })
    .filter((s) => s.label || s.time);
  // Newest first, as some carriers list them: put in order, the steps with no time (those to come) after the rest.
  const dated = steps.filter((s) => s.time);
  if (dated.length > 1 && dated[0].time!.getTime() > dated[dated.length - 1].time!.getTime()) {
    const first = steps.indexOf(dated[0]);
    steps = [...[...dated].sort((a, b) => a.time!.getTime() - b.time!.getTime()), ...steps.slice(0, first).reverse(), ...steps.slice(first).filter((s) => !s.time)];
  }
  const marked = steps.some((s) => s.done !== undefined && s.done !== null);
  const past = steps.map((s) => (marked ? yes(s.done) : !!s.time && s.time.getTime() <= now));
  const at = past.lastIndexOf(true);
  const complete = steps.length > 0 && at === steps.length - 1;
  const status = str(data.status).trim() || (at >= 0 ? steps[at].label : '');
  let tone = trackTone(status);
  if (complete && tone === 'accent') tone = 'good';
  const carrier = str(data.carrier ?? data.courier).trim();
  const number = str(data.number ?? data.tracking ?? data.tracking_number).trim();
  const url = str(data.url ?? data.link).trim();
  const etaRaw = str(data.eta ?? data.expected ?? data.arrival).trim();
  const eta = parseDate(etaRaw);
  const etaText = eta ? `${nearDay(eta, now)}${timed(etaRaw) ? `, ${fmtDate(eta, 'time')}` : ''}` : etaRaw;
  const parcel = !!(carrier || number);
  const Icon = tone === 'good' ? (parcel ? PackageCheck : CircleCheck) : tone === 'bad' ? CircleX : tone === 'warn' ? CircleAlert : parcel ? Truck : Hourglass;
  const title = str(data.title ?? data.item ?? data.name) || carrier;
  return (
    <Card>
      <Head
        title={title}
        sub={str(data.title ?? data.item ?? data.name) && !/^https?:\/\//i.test(url) ? carrier : ''}
        aside={
          /^https?:\/\//i.test(url) ? (
            <LinkOut url={url} className="text-[12.5px]">
              {carrier || hostOf(url)}
            </LinkOut>
          ) : undefined
        }
      />
      {status && (
        <div className={cx('flex items-center gap-3 rounded-xl px-3.5 py-3', TONE[tone])}>
          <Icon size={22} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[16px] leading-snug font-semibold">{status}</div>
            {!complete && etaText && <div className="text-[12.5px] text-fg-2">{tr('Expected {0}').replace('{0}', etaText)}</div>}
            {complete && steps[at].time && <div className="text-[12.5px] text-fg-2">{fmtDate(steps[at].time, timed(steps[at].raw) ? 'dateTime' : 'long')}</div>}
          </div>
          {steps.length > 1 && <span className="shrink-0 text-[12px] font-medium tabular-nums opacity-80">{`${at + 1}/${steps.length}`}</span>}
        </div>
      )}
      {number && (
        <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg bg-bg-1 py-1 pr-1 pl-3">
          <span className="shrink-0 text-[12px] text-fg-3">{tr('Tracking number')}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">{number}</span>
          <Copy text={number} />
        </div>
      )}
      {steps.length > 0 && (
        <ol className="m-0 mt-4 list-none p-0">
          {steps.map((s, i) => {
            const current = i === at;
            const last = i === steps.length - 1;
            const ring = complete ? 'bg-ok ring-ok/20' : tone === 'bad' ? 'bg-err ring-err/20' : tone === 'warn' ? 'bg-warn ring-warn/20' : 'bg-accent ring-accent/20';
            return (
              <li key={i} className="flex gap-3">
                <div className="flex w-4 shrink-0 flex-col items-center">
                  {current ? (
                    <span className={cx('mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full ring-4', ring)}>{complete && <Check size={10} strokeWidth={3.5} className="text-panel" />}</span>
                  ) : past[i] ? (
                    <span className="mt-[6px] h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                  ) : (
                    <span className="mt-[6px] h-2.5 w-2.5 shrink-0 rounded-full border-2 border-line-2 bg-panel" />
                  )}
                  {!last && <span className={cx('mt-1 w-0 flex-1 border-l-2', i < at ? 'border-accent/45' : 'border-dashed border-line-2')} />}
                </div>
                <div className={cx('min-w-0 flex-1', !last && 'pb-4')}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className={cx('leading-snug', current ? 'font-semibold' : 'font-medium', !past[i] && 'text-fg-3')}>{s.label}</span>
                    {s.time && <span className="text-[12px] text-fg-3 tabular-nums">{fmtDate(s.time, timed(s.raw) ? 'dateTime' : 'dayMonth')}</span>}
                  </div>
                  {s.place && <div className="text-[12.5px] text-fg-3">{s.place}</div>}
                  {str(s.note) && <Md text={s.note} className="mt-0.5 text-[12.5px] text-fg-2" />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export const PLANS_UIS: Record<string, AnswerUiView> = {
  timeline: Timeline,
  agenda: Agenda,
  calendar: Calendar,
  roadmap: Roadmap,
  steps: Steps,
  checklist: Checklist,
  countdown: Countdown,
  kanban: Kanban,
  status: Status,
  'go-no-go': GoNoGo,
  week: Week,
  gantt: Gantt,
  timers: Timers,
  tracking: Tracking,
};
