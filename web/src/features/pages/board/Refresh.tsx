// Board cards that keep themselves up to date (shared/board-refresh.ts): what the board page shows of their refreshes and
// where they are set. Each card that refreshes says when it was updated, what a refresh costs about and how often it
// runs ("Updated 07:00 · ≈$0.04 · every day at 07:00"), quietly that one is going on, and when one failed, why, with Try
// again (three in a row pause its schedule, which it says). "Keep it up to date…" in a card's menu sets its question,
// how often and the tier, saying first what a refresh and a month cost; the board's monthly cap for refreshes is set in
// its bar, and once reached the board says so at the top. The settings are part of the board (saved as a new version,
// as every change is); GET /api/boards/:id/refresh says what the refreshes are doing, and asks again when the server
// says the board's refreshes moved.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Coins, PauseCircle, RefreshCw } from 'lucide-react';
import {
  aboutUsd,
  boardCap,
  DEFAULT_REFRESH_CAP,
  DEFAULT_REFRESH_TIER,
  everyOf,
  perRefresh,
  refreshTier,
  runsPerMonth,
  scheduleOf,
  type BoardRefreshState,
  type CardRefresh,
  type CardRefreshState,
  type RefreshEvery,
  type RefreshSchedule,
} from '@shared/board-refresh';
import { cardTitle, type Board, type BoardCard } from '@shared/boards';
import { TIERS, type Tier } from '@shared/tiers';
import { Button, cx, Dialog, inputCls, Popover, Segmented } from '../../../components/ui';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { api, enc, post } from '../../../lib/api';
import { useFeatureEvent } from '../../../lib/featureEvents';
import { toastError, useToasts } from '../../../lib/store';

/** Whether a card reads its data from a spreadsheet or a file each time it is drawn (then it is always current). */
export const readsSource = (c: Pick<BoardCard, 'data'>) => {
  const f = c.data?.from;
  return (typeof f === 'string' && !!f.trim()) || (!!f && typeof f === 'object');
};

/** Whether a card can be refreshed: it does not read a source, and it has a question (its own, or where it came from). */
export const refreshable = (c: BoardCard) => !readsSource(c) && !!(c.refresh || c.from?.session || c.from?.task);

/** What the board page knows of its cards' refreshes: asked when a card refreshes, again when the server says they moved. */
export function useBoardRefresh(pageId: string, on: boolean): { state: BoardRefreshState | null; reload: () => void } {
  const [state, setState] = useState<BoardRefreshState | null>(null);
  const seq = useRef(0);
  const reload = useCallback(() => {
    if (!on) return;
    const n = ++seq.current;
    api<BoardRefreshState>(`/api/boards/${enc(pageId)}/refresh`)
      .then((r) => n === seq.current && setState(r))
      .catch(() => {});
  }, [pageId, on]);
  useEffect(() => {
    if (!on) setState(null);
    reload();
  }, [reload, on]);
  useFeatureEvent('boards', ({ data }) => (data as { board?: string })?.board === pageId && reload());
  // While one runs, a look now and then (its end comes as an event too).
  const running = !!state && Object.values(state.cards).some((c) => c.running);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [running, reload]);
  return { state, reload };
}

// ---- words -------------------------------------------------------------------------------------------------------

/** A time of day ("07:00") as this page's language writes it. */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  try {
    return new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
  } catch {
    return hhmm;
  }
}

/** A day's name (0 Sunday … 6 Saturday) in this page's language. */
function dayName(d: number): string {
  try {
    return new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(new Date(2000, 0, 2 + d));
  } catch {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d];
  }
}

/** When something happened: its time today, else its day and time. */
export function whenText(ms: number): string {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  try {
    return new Intl.DateTimeFormat(LOCALE, today ? { hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** "every hour", "every day at 07:00", "weekdays at 07:00", "every Monday at 07:00": each a sentence of its own to translate. */
export function ScheduleWords({ s }: { s: RefreshSchedule }) {
  const every = everyOf(s);
  if (s.kind === 'every') return <>every hour</>;
  const t = clock(s.time);
  if (every === 'weekdays') return <>weekdays at {t}</>;
  if (every === 'week') return <>every {dayName(s.days![0])} at {t}</>;
  if (s.days?.length) return <>{s.days.map(dayName).join(', ')}, at {t}</>;
  return <>every day at {t}</>;
}

/** What a refresh of a card costs about, as its line says it: its last one's cost, else its own typical, else the tier's. */
function costOf(c: BoardCard, s: CardRefreshState | undefined, state: BoardRefreshState | null): number | undefined {
  if (s?.last?.status === 'done' && s.last.costUsd !== undefined) return s.last.costUsd;
  if (c.refresh?.costUsd !== undefined) return c.refresh.costUsd;
  const t = refreshTier(c.refresh);
  return perRefresh(state, s, t, t);
}

/**
 * A card's meta line when it refreshes: "Updated 07:00 · ≈$0.04 · every day at 07:00" (a guest at a shared link sees no
 * cost), "Updating…" while one goes on; null for a card that does not refresh (its line says where it was pinned from).
 */
export function RefreshMeta({ card, s, state, guest }: { card: BoardCard; s?: CardRefreshState; state: BoardRefreshState | null; guest: boolean }) {
  if (!card.refresh && !s?.running && !s?.last) return null;
  const cost = guest ? undefined : costOf(card, s, state);
  const sched = card.refresh?.schedule;
  const paused = !!card.refresh?.paused || (!!s?.task && s.enabled === false);
  return (
    <>
      {s?.running ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-fg-2">
          <RefreshCw size={10.5} className="animate-spin" aria-hidden />
          <span>Updating…</span>
        </span>
      ) : card.refreshedAt ? (
        <span className="shrink-0">Updated {whenText(card.refreshedAt)}</span>
      ) : (
        <span className="shrink-0">Not updated yet</span>
      )}
      {cost !== undefined && (
        <>
          <span className="shrink-0">·</span>
          <span className="shrink-0" title={tr('About what a refresh costs')}>
            ≈{aboutUsd(cost)}
          </span>
        </>
      )}
      {sched && (
        <>
          <span className="shrink-0">·</span>
          <span className="min-w-0 truncate">
            <ScheduleWords s={sched} />
          </span>
          {paused && (
            <>
              <span className="shrink-0">·</span>
              <span className="shrink-0 text-warn">paused</span>
            </>
          )}
        </>
      )}
    </>
  );
}

/** Under a card's line: why its last refresh failed (it keeps its data), or that its schedule paused, with Try again. */
export function RefreshProblem({ card, s, onTry }: { card: BoardCard; s?: CardRefreshState; onTry: () => void }) {
  if (!s || s.running) return null;
  // A card that no longer refreshes says nothing of an old failure (one of a Refresh now in the last half hour, yes).
  if (!card.refresh && !(s.last && Date.now() - s.last.at < 30 * 60_000)) return null;
  const failed = s.last && s.last.status !== 'done' && s.last.status !== 'silent';
  const paused = !!s.pausedReason;
  if (!failed && !paused) return null;
  const reason = s.last?.error ?? '';
  return (
    <div role="status" className="mb-1.5 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/8 px-2.5 py-1.5 text-[12px] leading-snug text-fg-2">
      {paused ? <PauseCircle size={13} className="mt-px shrink-0 text-warn" aria-hidden /> : <AlertTriangle size={13} className="mt-px shrink-0 text-warn" aria-hidden />}
      <div className="min-w-0 flex-1">
        {paused ? <div className="font-medium text-fg">Paused after three failed refreshes in a row</div> : null}
        {reason ? (
          <div className={cx('min-w-0', !paused && 'text-fg')}>
            <span>Could not update:</span> <span translate="no">{tr(reason)}</span>
          </div>
        ) : !paused ? (
          <div className="text-fg">Could not update</div>
        ) : null}
        {!paused && card.refreshedAt ? <div className="text-fg-3">It shows what it had from {whenText(card.refreshedAt)}.</div> : null}
      </div>
      <button type="button" onClick={onTry} className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-bg-2">
        Try again
      </button>
    </div>
  );
}

// ---- a copy's refreshes, paused ---------------------------------------------------------------------------------------

/**
 * At the top of a board whose cards' refreshes came paused (a copy never starts spending by itself): turn them on card by
 * card, or all at once, after seeing what that comes to a month.
 */
export function PausedBand({ board, state, onAllOn }: { board: Board; state: BoardRefreshState | null; onAllOn: () => void }) {
  const [asking, setAsking] = useState(false);
  const paused = board.cards.filter((c) => c.refresh?.paused);
  if (!paused.length) return null;
  let month = 0;
  let unknown = 0;
  for (const c of paused) {
    const t = refreshTier(c.refresh);
    const per = perRefresh(state, state?.cards[c.id], t, t);
    if (per === undefined) unknown++;
    else month += per * runsPerMonth(c.refresh!.schedule);
  }
  const cap = boardCap(board);
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-bg-1 px-4 py-2 text-[12.5px] text-fg-2">
      <PauseCircle size={14} className="shrink-0 text-fg-3" aria-hidden />
      <span className="min-w-0 flex-1">Refreshes are paused on this copy: turn them on card by card, or all at once.</span>
      <button type="button" onClick={() => setAsking(true)} className="shrink-0 rounded-md px-2 py-0.5 font-medium text-accent hover:bg-bg-2">
        Turn all on
      </button>
      {asking && (
        <Dialog
          open
          onClose={() => setAsking(false)}
          part="board"
          width={460}
          title={paused.length === 1 ? <>Turn on the refreshes of one card?</> : <>Turn on the refreshes of {paused.length} cards?</>}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => (setAsking(false), onAllOn())}>
                Turn all on
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-[13px] leading-relaxed text-fg-2">
            <ul className="space-y-0.5">
              {paused.map((c) => (
                <li key={c.id} className="flex min-w-0 gap-1.5">
                  <span translate="no" className="min-w-0 truncate font-medium text-fg">
                    {cardTitle(c)}
                  </span>
                  <span className="shrink-0 text-fg-3">
                    · <ScheduleWords s={c.refresh!.schedule!} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="rounded-xl border border-line bg-bg-1 px-3 py-2.5 text-[12.5px]">
              {paused.length === unknown ? (
                <span>What they cost is not known yet: it shows on each card after its first refresh.</span>
              ) : (
                <>
                  <span className="font-medium text-fg">About {aboutUsd(month)} a month in all</span>
                  {unknown ? <span> (and some whose cost is not known yet)</span> : null}
                  <span>.</span>
                </>
              )}{' '}
              {cap === null ? <span>This board has no monthly cap for refreshes.</span> : <span>Refreshes stop for the month at this board’s {aboutUsd(cap)} cap.</span>}
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ---- the board's cap -----------------------------------------------------------------------------------------------

/** When the month's refreshes start again, as a day. */
const resumeDay = (ms: number) => {
  try {
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' }).format(new Date(ms));
  } catch {
    return new Date(ms).toDateString();
  }
};

/** At the top of a board whose refreshes reached its cap: they wait for the next month, or a higher cap. */
export function CapBand({ state, onRaise }: { state: BoardRefreshState; onRaise?: () => void }) {
  if (!state.reached || state.cap === null) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn/25 bg-warn/8 px-4 py-2 text-[12.5px] text-fg-2">
      <Coins size={14} className="shrink-0 text-warn" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-fg">Its cards have stopped refreshing for this month:</span> <span>this board reached its {aboutUsd(state.cap)} monthly cap for refreshes.</span>{' '}
        <span>They start again on {resumeDay(state.monthEnds)}.</span>
      </span>
      {onRaise && (
        <button type="button" onClick={onRaise} className="shrink-0 rounded-md px-2 py-0.5 font-medium text-accent hover:bg-bg-2">
          Raise the cap
        </button>
      )}
    </div>
  );
}

/** The board's monthly cap for refreshes, in its bar: what was spent this month of it; a click changes it or turns it off. */
export function CapButton({ board, state, onCap, open, setOpen, compact }: { board: Board; state: BoardRefreshState | null; onCap: (cap: number | null | undefined) => void; open: boolean; setOpen: (o: boolean) => void; compact: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const cap = boardCap(board);
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(cap === null ? '' : String(cap));
  }, [open, cap]);
  const spent = state?.spentUsd ?? 0;
  const save = () => {
    const n = Number(text.replace(/[$,\s]/g, ''));
    if (!text.trim() || !Number.isFinite(n) || n < 0.01 || n > 10_000) return useToasts.getState().push('error', tr('A cap is an amount from $0.01 to $10,000'));
    setOpen(false);
    onCap(Math.round(n * 100) / 100 === DEFAULT_REFRESH_CAP ? undefined : Math.round(n * 100) / 100);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(!open)}
        title={tr('Monthly cap for this board’s refreshes')}
        className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg', open && 'bg-bg-3 text-fg', state?.reached && 'text-warn')}
      >
        <Coins size={14} aria-hidden />
        {compact ? null : cap === null ? <span>No cap</span> : <span>{aboutUsd(spent)} of {aboutUsd(cap)}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={290} title={tr('Monthly cap for refreshes')}>
        <div className="space-y-2.5 p-3 text-[12.5px] text-fg-2">
          <p className="leading-snug">Refreshes of this board’s cards stop for the month once they have spent this much. {cap === null ? <span>It has no cap now.</span> : <span>{aboutUsd(spent)} spent this month.</span>}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-fg-3">$</span>
            <input
              value={text}
              inputMode="decimal"
              placeholder={String(DEFAULT_REFRESH_CAP)}
              aria-label={tr('Monthly cap in dollars')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className={cx(inputCls, 'h-8 w-24 text-[13px]')}
            />
            <span className="text-fg-3">a month</span>
            <Button size="sm" variant="primary" className="ml-auto" onClick={save}>
              Save
            </Button>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-2">
            {cap === null ? (
              <button type="button" className="text-accent hover:underline" onClick={() => (setOpen(false), onCap(undefined))}>
                Set the cap to {aboutUsd(DEFAULT_REFRESH_CAP)}
              </button>
            ) : (
              <button type="button" className="text-fg-3 hover:text-fg" onClick={() => (setOpen(false), onCap(null))}>
                No cap
              </button>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}

// ---- a card's settings -----------------------------------------------------------------------------------------------

const EVERY: { value: RefreshEvery; label: string }[] = [
  { value: 'off', label: 'When I ask' },
  { value: 'hour', label: 'Every hour' },
  { value: 'day', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'week', label: 'Every week' },
];

/** Keep it up to date…: a card's question, how often and the tier, with what a refresh and a month cost about. */
export function RefreshDialog({
  card,
  pageId,
  board,
  state,
  onSave,
  onStop,
  onClose,
}: {
  card: BoardCard;
  pageId: string;
  board: Board;
  state: BoardRefreshState | null;
  onSave: (r: CardRefresh, now: boolean) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const r = card.refresh;
  const [ask, setAsk] = useState(r?.ask ?? '');
  const [asking, setAsking] = useState(!r);
  const [every, setEvery] = useState<RefreshEvery>(r ? everyOf(r.schedule) : 'day');
  const [time, setTime] = useState(r?.schedule?.kind === 'daily' ? r.schedule.time : '07:00');
  const [day, setDay] = useState(r?.schedule?.kind === 'daily' && r.schedule.days?.length === 1 ? r.schedule.days[0] : 1);
  const [tier, setTier] = useState<Tier>(refreshTier(r));
  // A card set up for the first time asks the request it was pinned from.
  useEffect(() => {
    if (r) return;
    let live = true;
    api<{ question: string }>(`/api/boards/${enc(pageId)}/cards/${enc(card.id)}/question`)
      .then((q) => live && setAsk((a) => a || q.question))
      .catch(() => {})
      .finally(() => live && setAsking(false));
    return () => {
      live = false;
    };
  }, [pageId, card.id, r]);
  const schedule = scheduleOf(every, time, day);
  const s = state?.cards[card.id];
  const per = perRefresh(state, s, tier, refreshTier(r));
  const month = per !== undefined && schedule ? per * runsPerMonth(schedule) : undefined;
  const cap = boardCap(board);
  const keep = (now: boolean) => {
    const q = ask.trim();
    if (!q) return useToasts.getState().push('error', tr('Write the question to ask each time'));
    onSave({ ask: q, ...(schedule ? { schedule } : {}), ...(tier !== DEFAULT_REFRESH_TIER ? { tier } : {}), ...(r?.costUsd !== undefined ? { costUsd: r.costUsd } : {}) }, now);
  };
  const days = useMemo(() => [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: dayName(d) })), []);
  return (
    <Dialog
      open
      onClose={onClose}
      part="board"
      width={560}
      title={
        <>
          Keep <span translate="no">“{cardTitle(card)}”</span> up to date
        </>
      }
      footer={
        <>
          {r && (
            <Button variant="ghost" className="mr-auto text-err" onClick={onStop}>
              Stop refreshing
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="ghost" onClick={() => keep(true)}>
            Save and refresh now
          </Button>
          <Button variant="primary" onClick={() => keep(false)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p className="leading-relaxed text-fg-2">An agent asks this again and draws the card anew with what it finds. It sends nothing: anything it would send or post is held instead.</p>
        {r?.paused && <p className="rounded-lg bg-bg-1 px-3 py-2 text-[12.5px] text-fg-2">Its refreshes are paused, as on a copy: Save turns them on.</p>}
        <label className="block space-y-1.5">
          <span className="font-medium text-fg">The question</span>
          <textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={asking ? tr('Reading the request it came from…') : tr('What should the agent find out each time? “How are this week’s sales going?”')}
            className={cx(inputCls, 'h-auto min-h-[76px] resize-y py-2 text-[13px] leading-relaxed')}
            translate="no"
          />
          {!r && !asking && card.from?.session && <span className="block text-[12px] text-fg-3">From the request it was pinned from: change it as you like.</span>}
        </label>
        <div className="space-y-1.5">
          <div className="font-medium text-fg">How often</div>
          <div className="overflow-x-auto">
            <Segmented<RefreshEvery> size="sm" value={every} onChange={setEvery} options={EVERY.map((e) => ({ value: e.value, label: tr(e.label) }))} />
          </div>
          {(every === 'day' || every === 'weekdays' || every === 'week') && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {every === 'week' && (
                <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label={tr('Day')} className={cx(inputCls, 'h-8.5 w-auto text-[13px]')}>
                  {days.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
              <span className="text-fg-3">at</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value || '07:00')} aria-label={tr('Time')} className={cx(inputCls, 'h-8.5 w-auto text-[13px]')} />
              <span className="text-[12px] text-fg-3">in your time zone</span>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="font-medium text-fg">The agent thinks with</div>
          <Segmented<Tier> size="sm" value={tier} onChange={setTier} options={TIERS.map((t) => ({ value: t.id, label: tr(t.label) }))} />
          <div className="text-[12px] text-fg-3">{tier === 'quick' ? <span>Quick is the cheapest, and enough for most cards.</span> : <span>A stronger tier costs more each time.</span>}</div>
        </div>
        <div className="rounded-xl border border-line bg-bg-1 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-2">
          {per === undefined ? (
            <span>What a refresh costs is not known yet: it shows here after the first one.</span>
          ) : (
            <>
              <span className="font-medium text-fg">About {aboutUsd(per)} a refresh</span>
              {month !== undefined && (
                <>
                  <span>, about {aboutUsd(month)} a month</span>
                </>
              )}
              <span>.</span>
            </>
          )}{' '}
          {cap === null ? <span>This board has no monthly cap for refreshes.</span> : <span>Refreshes stop for the month at this board’s {aboutUsd(cap)} cap ({aboutUsd(state?.spentUsd ?? 0)} spent this month).</span>}
          {month !== undefined && cap !== null && month > cap && <div className="mt-1 text-warn">That is more than the cap: refreshes would stop before the month ends.</div>}
        </div>
      </div>
    </Dialog>
  );
}

/** Starts a card's refresh now (Refresh now, Try again), saying why when it cannot. */
export async function refreshCard(pageId: string, cardId: string, done?: () => void) {
  try {
    await post(`/api/boards/${enc(pageId)}/cards/${enc(cardId)}/refresh`, {});
  } catch (e) {
    toastError(e);
  } finally {
    done?.();
  }
}

/** Refreshes every card of the board that keeps itself up to date (Refresh all). */
export async function refreshBoard(pageId: string, done?: () => void) {
  try {
    const r = await post<{ started: number; skipped: string[] }>(`/api/boards/${enc(pageId)}/refresh`, {});
    if (!r.started && r.skipped.length) useToasts.getState().push('error', r.skipped[0]);
    else if (r.skipped.length) useToasts.getState().push('info', tr('Some cards could not be refreshed: {0}').replace('{0}', r.skipped.join('; ')));
  } catch (e) {
    toastError(e);
  } finally {
    done?.();
  }
}

