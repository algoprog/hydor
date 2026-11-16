// Board cards that keep themselves up to date: a card on a board (shared/boards.ts) may be refreshed by asking an agent
// its question again (the request it was pinned from, or one the person wrote), on a schedule or when asked, on a tier
// (Quick unless another is picked). The agent answers with a new ```ui block of the same UI, checked against the UI's
// type, and the card's data is replaced (a new version of the board; nothing else on it changes). Each board has a
// monthly spending cap for its refreshes ($5 unless changed, or off). What the server and the pages share: the
// settings as a card keeps them (`refresh`), the board's cap, their words, and what the board page is told of each
// card's refreshes (GET /api/boards/:id/refresh, server/pages/board-refresh.ts).
import { DAY_NAMES, type RunStatus, type TaskSchedule } from './automations.ts';
import { isTier, type Tier } from './tiers.ts';

/** How often a card refreshes by itself: the scheduler's own schedules (shared/automations.ts), of these kinds. */
export type RefreshSchedule = { kind: 'every'; minutes: 60 } | { kind: 'daily'; time: string; days?: number[] };

/** The choices the card's settings offer: not by itself, every hour, every day, weekdays, or every week on a day. */
export type RefreshEvery = 'off' | 'hour' | 'day' | 'weekdays' | 'week';

/** How a card refreshes: kept on the card (shared/boards.ts BoardCard.refresh), so a board's versions keep it too. */
export interface CardRefresh {
  /** The question asked again: the request it was pinned from (editable), or one the person or an agent wrote. */
  ask: string;
  /** When it refreshes by itself; none: only when asked (Refresh now, Refresh all). */
  schedule?: RefreshSchedule;
  /** The tier the agent thinks with (Quick when unset). */
  tier?: Tier;
  /** What its last refresh cost, in dollars (its session's cost at API prices). */
  costUsd?: number;
}

/** The longest question a card keeps. */
export const ASK_MAX = 2000;
/** A board's monthly cap for its refreshes when none was set, in dollars. */
export const DEFAULT_REFRESH_CAP = 5;
/** Failed refreshes in a row before a card's schedule pauses itself. */
export const REFRESH_FAIL_LIMIT = 3;
/** The tier a refresh thinks with when none was picked. */
export const DEFAULT_REFRESH_TIER: Tier = 'quick';

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Why a refresh setting was refused, said plainly. */
export class RefreshError extends Error {}

/** A schedule as a card keeps it: every hour, or at a time on every day or some days. Throws RefreshError, said plainly. */
export function cleanSchedule(v: unknown): RefreshSchedule {
  if (!isObj(v)) throw new RefreshError('A refresh schedule is every hour, or a time of day (on every day, weekdays or one day a week).');
  if (v.kind === 'every') {
    if (Number(v.minutes) !== 60) throw new RefreshError('A card refreshes at most every hour.');
    return { kind: 'every', minutes: 60 };
  }
  if (v.kind === 'daily') {
    const m = HHMM.exec(String(v.time ?? '').trim());
    if (!m) throw new RefreshError(`A refresh’s time is written as 07:00 (not ${JSON.stringify(v.time ?? '')}).`);
    const days = Array.isArray(v.days) ? [...new Set(v.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    return { kind: 'daily', time: `${m[1].padStart(2, '0')}:${m[2]}`, ...(days.length && days.length < 7 ? { days } : {}) };
  }
  throw new RefreshError('A refresh schedule is every hour, or a time of day (on every day, weekdays or one day a week).');
}

/**
 * A card's refresh setting as it is kept, from what was given (the board page, an agent, an older board): undefined when
 * it holds no question (a setting from before refreshes were built). Throws RefreshError for a schedule or tier that
 * cannot be.
 */
export function cleanRefresh(v: unknown): CardRefresh | undefined {
  if (!isObj(v)) return undefined;
  const ask = typeof v.ask === 'string' ? v.ask.replace(/\r\n?/g, '\n').trim().slice(0, ASK_MAX) : '';
  if (!ask) return undefined;
  const out: CardRefresh = { ask };
  if (v.schedule !== undefined && v.schedule !== null) out.schedule = cleanSchedule(v.schedule);
  if (v.tier !== undefined && v.tier !== null) {
    if (!isTier(v.tier)) throw new RefreshError('A refresh’s tier is quick, standard, best or max.');
    if (v.tier !== DEFAULT_REFRESH_TIER) out.tier = v.tier;
  }
  if (typeof v.costUsd === 'number' && Number.isFinite(v.costUsd) && v.costUsd >= 0) out.costUsd = Math.round(v.costUsd * 10_000) / 10_000;
  return out;
}

/** A card's tier for refreshes. */
export const refreshTier = (r: CardRefresh | undefined): Tier => r?.tier ?? DEFAULT_REFRESH_TIER;

// ---- the choices, and their words ---------------------------------------------------------------------------------------

/** Which of the settings' choices a schedule is (a day list other than weekdays or one day reads as every day). */
export function everyOf(s: RefreshSchedule | undefined): RefreshEvery {
  if (!s) return 'off';
  if (s.kind === 'every') return 'hour';
  const d = s.days ?? [];
  if (!d.length) return 'day';
  if (d.join() === '1,2,3,4,5') return 'weekdays';
  return d.length === 1 ? 'week' : 'day';
}

/** The schedule a choice makes, at a time ("07:00") and, for every week, on a day (0 Sunday … 6 Saturday). */
export function scheduleOf(every: RefreshEvery, time = '07:00', day = 1): RefreshSchedule | undefined {
  if (every === 'off') return undefined;
  if (every === 'hour') return { kind: 'every', minutes: 60 };
  const t = HHMM.test(time) ? time : '07:00';
  if (every === 'weekdays') return { kind: 'daily', time: t, days: [1, 2, 3, 4, 5] };
  if (every === 'week') return { kind: 'daily', time: t, days: [Math.min(6, Math.max(0, Math.round(day)))] };
  return { kind: 'daily', time: t };
}

const FULL_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "every hour", "every day at 07:00", "weekdays at 07:00", "every Monday at 07:00" (and for other days, "Mon, Thu at 07:00"). */
export function refreshText(s: RefreshSchedule | undefined): string {
  if (!s) return 'when you ask';
  if (s.kind === 'every') return 'every hour';
  const every = everyOf(s);
  if (every === 'day') return s.days?.length ? `${s.days.map((d) => DAY_NAMES[d]).join(', ')} at ${s.time}` : `every day at ${s.time}`;
  if (every === 'weekdays') return `weekdays at ${s.time}`;
  return `every ${FULL_DAY[s.days![0]]} at ${s.time}`;
}

/** How many times a month a schedule refreshes, about (a month of 30.4 days). */
export function runsPerMonth(s: RefreshSchedule | undefined): number {
  if (!s) return 0;
  if (s.kind === 'every') return Math.round((30.44 * 24 * 60) / s.minutes);
  const days = s.days?.length ? s.days.length : 7;
  return Math.round(((30.44 * days) / 7) * 10) / 10;
}

/** A schedule as the scheduler keeps it. */
export const asTaskSchedule = (s: RefreshSchedule): TaskSchedule => (s.kind === 'every' ? { kind: 'every', minutes: s.minutes } : { kind: 'daily', time: s.time, ...(s.days ? { days: s.days } : {}) });

// ---- a board's cap -------------------------------------------------------------------------------------------------------

/** A board's monthly cap for its refreshes: its own, $5 when none was set, null when it is off. */
export function boardCap(b: { cap?: number | null }): number | null {
  if (b.cap === null) return null;
  return typeof b.cap === 'number' && Number.isFinite(b.cap) && b.cap > 0 ? b.cap : DEFAULT_REFRESH_CAP;
}

/** A cap as given (a number of dollars, "off", null): undefined to keep the default, null for off. Throws for nonsense. */
export function cleanCap(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === 'off' || v === false || v === 0) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0.01 || n > 10_000) throw new RefreshError('A board’s monthly cap for refreshes is an amount from $0.01 to $10,000, or off.');
  return Math.round(n * 100) / 100;
}

// ---- what the board page is told ---------------------------------------------------------------------------------------

/** One card's refreshes, as the board page shows them. */
export interface CardRefreshState {
  /** Its scheduled task (Agents → Schedules shows it), when it refreshes by itself. */
  task?: string;
  /** Its schedule is on (it may have paused itself, or been paused in Schedules). */
  enabled?: boolean;
  /** Why it paused itself (three failed refreshes in a row). */
  pausedReason?: string;
  /** When it refreshes next. */
  nextAt?: number;
  /** A refresh going on now: since when, and its session. */
  running?: { since: number; key?: string };
  /** Its latest refresh that ended: how it went, when, why it failed, what it cost, its session. */
  last?: { status: RunStatus; at: number; error?: string; costUsd?: number; key?: string };
  /** Failed refreshes in a row. */
  fails?: number;
  /** What its own refreshes cost, typically (the middle of the last ten), on the tier it is on now. */
  typicalUsd?: number;
}

export interface BoardRefreshState {
  /** The cap in effect this month (null: off), what refreshes spent this month, and whether the cap is reached. */
  cap: number | null;
  spentUsd: number;
  reached: boolean;
  /** When this month ends (refreshes stopped by the cap start again then). */
  monthEnds: number;
  /** What a refresh costs on each tier, typically (refreshes on any board, else the tier's model's price); null when unknown. */
  tiers: Record<Tier, number | null>;
  /** By card id: each card that refreshes, or has refreshed. */
  cards: Record<string, CardRefreshState>;
}

/** About what a refresh costs: the card's own refreshes on its tier, else the tier's typical cost; undefined when unknown. */
export function perRefresh(state: Pick<BoardRefreshState, 'tiers'> | null | undefined, card: CardRefreshState | undefined, tier: Tier, ownTier: Tier): number | undefined {
  if (card?.typicalUsd !== undefined && tier === ownTier) return card.typicalUsd;
  const t = state?.tiers[tier];
  return t === null || t === undefined ? undefined : t;
}

/** Dollars about a refresh: "$0.04", "<$0.01". */
export const aboutUsd = (n: number): string => (n > 0 && n < 0.01 ? '<$0.01' : n >= 100 || (n >= 1 && Number.isInteger(n)) ? `$${Math.round(n)}` : `$${n.toFixed(2)}`);
