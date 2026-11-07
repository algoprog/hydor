// The answer UIs for time and plans (timelines, agendas, calendars, roadmaps, steps, checklists, countdowns, boards, status, go or no-go): their views, by name (shared/answer-ui/plans.ts has what each takes).
import { Fragment } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, CalendarPlus, Check, CircleAlert, CircleCheck, CircleX, Clock, Lightbulb, MapPin, PartyPopper, RotateCcw, TriangleAlert, Users, Wrench } from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { CodeBlock } from '../../Markdown';
import { cx } from '../../ui';
import { arr, Card, Chip, Copy, download, fmtDate, fmtMinutes, fmtNum, fmtTime, Head, isObj, Md, Meter, num, parseDate, Pic, str, textOf, TONE, TONE_FILL, toneOf, useAui, useKept, useNow, words, yes, type AnswerUiView, type Data, type Tone } from '../kit';

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
};
