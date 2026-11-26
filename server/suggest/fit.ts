// How sure a suggestion must be, fitted to the person's own writing. The page judges every guess, shown or not, against
// what the person then typed, and sends counts only (never text): for each plan, how many guesses there were in each of
// 40 bins of confidence and how many were right. They are kept in the database (kv, "suggest.judged") under the model
// that made them (scoreKey), the older ones counting for less as new ones come. A plan with enough of them gets a
// threshold of its own in place of the release's, which was measured on other people's text (calibration.json).
import { SUGGEST_BINS, SUGGEST_FIT_MIN, SUGGEST_PLANS, SUGGEST_USAGE_CAP, type SuggestBins, type SuggestJudged, type SuggestPlan, type SuggestThresholds } from '../../shared/suggest.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';

export const JUDGED_KEY = 'suggest.judged';
/** What the engine means by its confidence: bump it when that changes, and what was judged before is no longer used. */
export const SCORE_VERSION = 1;
/** A plan's counts are halved when their total passes this, so that the fit follows the person. */
export const DECAY_AT = 3000;
/** A threshold needs at least this many judged guesses at or above it. */
export const FIT_ABOVE = 60;
/** How many models' counts are kept (the latest ones). */
const KEYS_KEPT = 4;

/** The counts' key: the kind of small model in use, the release it is from, and what its confidence means. */
export const scoreKey = (personal: boolean, revision: string) => `${personal ? 'personal' : 'published'}:${revision}:${SCORE_VERSION}`;

// ---- the release's thresholds (as the worker reads them: hydor_suggest/engine.py with_points and theta_for)

export type Calibration = Record<string, Record<string, number>>;

/** A release's calibration with the points `extra` adds at precisions its own table does not list. */
export function withPoints(calibration: Calibration, extra: Calibration | undefined): Calibration {
  const out: Calibration = {};
  for (const [plan, t] of Object.entries(calibration)) out[plan] = { ...t };
  for (const [plan, points] of Object.entries(extra ?? {})) {
    const table = out[plan];
    if (!table) continue;
    const listed = new Set(Object.keys(table).map(Number));
    for (const [k, v] of Object.entries(points)) if (!listed.has(Number(k))) table[k] = v;
  }
  return out;
}

/** The release's threshold for a plan at a precision: linear between the listed ones, clamped to the first and last. */
export function thetaFor(calibration: Calibration, plan: SuggestPlan, precision: number): number {
  const table = calibration[plan] ?? calibration.mix ?? {};
  const points = Object.entries(table)
    .map(([k, v]) => [Number(k), Number(v)] as const)
    .sort((a, b) => a[0] - b[0]);
  if (!points.length) return precision;
  if (precision <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (precision <= x1) return y0 + ((y1 - y0) * (precision - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

// ---- the counts

/** The judged counts of a body, checked: the three plans only, each with `right` and `total` of 40 whole numbers, none right more often than counted. */
export function cleanJudged(body: unknown): SuggestJudged {
  const v = (body as Record<string, unknown> | null)?.judged;
  if (v === undefined) return {};
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(v)) throw new HttpError(400, `judged: an object by plan (${SUGGEST_PLANS.join(', ')})`);
  const out: SuggestJudged = {};
  for (const [plan, bins] of Object.entries(v)) {
    if (!(SUGGEST_PLANS as readonly string[]).includes(plan)) throw new HttpError(400, `judged.${plan}: not a plan (${SUGGEST_PLANS.join(', ')})`);
    if (!isObj(bins) || Object.keys(bins).sort().join() !== 'right,total') throw new HttpError(400, `judged.${plan}: { right, total }`);
    const list = (k: 'right' | 'total') => {
      const a = bins[k];
      if (!Array.isArray(a) || a.length !== SUGGEST_BINS || !a.every((n) => Number.isInteger(n) && n >= 0 && n <= SUGGEST_USAGE_CAP))
        throw new HttpError(400, `judged.${plan}.${k}: ${SUGGEST_BINS} whole numbers from 0 to ${SUGGEST_USAGE_CAP}`);
      return a as number[];
    };
    const right = list('right');
    const total = list('total');
    if (right.some((n, i) => n > total[i])) throw new HttpError(400, `judged.${plan}: more right than judged`);
    out[plan as SuggestPlan] = { right: [...right], total: [...total] };
  }
  return out;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** What is kept for each score key (a damaged value reads as nothing judged). */
function load(db: DB): Record<string, SuggestJudged> {
  let o: unknown = null;
  try {
    o = JSON.parse(kvGet(db, JUDGED_KEY) ?? 'null');
  } catch {}
  const out: Record<string, SuggestJudged> = {};
  const list = (a: unknown) => (Array.isArray(a) && a.length === SUGGEST_BINS && a.every((n) => Number.isFinite(n) && n >= 0) ? (a as number[]) : null);
  for (const [key, plans] of Object.entries(o && typeof o === 'object' ? o : {})) {
    const j: SuggestJudged = {};
    for (const plan of SUGGEST_PLANS) {
      const b = (plans as Record<string, { right?: unknown; total?: unknown } | undefined> | null)?.[plan];
      const right = list(b?.right);
      const total = list(b?.total);
      if (right && total) j[plan] = { right, total };
    }
    out[key] = j;
  }
  return out;
}

export const readJudged = (db: DB, key: string): SuggestJudged => load(db)[key] ?? {};

/** Adds judged counts under `key`; a plan whose total passes DECAY_AT has all its counts halved. */
export function addJudged(db: DB, key: string, add: SuggestJudged): void {
  if (!SUGGEST_PLANS.some((p) => add[p] && sum(add[p]!.total) > 0)) return;
  const all = load(db);
  const mine = all[key] ?? {};
  for (const plan of SUGGEST_PLANS) {
    const a = add[plan];
    if (!a) continue;
    const had = mine[plan];
    let b: SuggestBins = { right: a.right.map((n, i) => n + (had?.right[i] ?? 0)), total: a.total.map((n, i) => n + (had?.total[i] ?? 0)) };
    while (sum(b.total) > DECAY_AT) b = { right: b.right.map((n) => n / 2), total: b.total.map((n) => n / 2) };
    mine[plan] = b;
  }
  // The latest written last; the oldest keys go.
  delete all[key];
  all[key] = mine;
  kvSet(db, JUDGED_KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-KEYS_KEPT))));
}

export function resetJudged(db: DB): void {
  kvSet(db, JUDGED_KEY, '{}');
}

// ---- the fit

/**
 * The threshold fitted to a plan's judged guesses, for the share of right ones wanted (`p`): the lowest bin edge above
 * which at least FIT_ABOVE guesses were judged and were right that often, kept between a third of the release's
 * threshold and one and a half times it. The release's own when no edge does that. undefined below SUGGEST_FIT_MIN
 * judged guesses.
 */
export function fitTheta(bins: SuggestBins | undefined, release: number, p: number): number | undefined {
  if (!bins || sum(bins.total) < SUGGEST_FIT_MIN) return undefined;
  let right = 0;
  let total = 0;
  let edge = release;
  for (let i = SUGGEST_BINS - 1; i >= 0; i--) {
    right += bins.right[i];
    total += bins.total[i];
    if (total >= FIT_ABOVE && (right + 2 * p) / (total + 2) >= p) edge = i / SUGGEST_BINS;
  }
  return Math.min(release * 1.5, Math.max(release / 3, edge));
}

/** The fitted thresholds of the plans that have enough judged guesses (a plan left out keeps the release's). */
export function fittedThetas(judged: SuggestJudged, calibration: Calibration, precision: number): Partial<Record<SuggestPlan, number>> {
  const out: Partial<Record<SuggestPlan, number>> = {};
  for (const plan of SUGGEST_PLANS) {
    const t = fitTheta(judged[plan], thetaFor(calibration, plan, precision), precision);
    if (t !== undefined) out[plan] = t;
  }
  return out;
}

/** What Settings says: the guesses judged in the plans that are fitted, or in the plan nearest to it while none is. */
export function thresholdsOf(judged: SuggestJudged): SuggestThresholds {
  const totals = SUGGEST_PLANS.map((p) => sum(judged[p]?.total ?? []));
  const fitted = totals.filter((n) => n >= SUGGEST_FIT_MIN);
  return { judged: Math.floor(fitted.length ? sum(fitted) : Math.max(...totals)), needed: SUGGEST_FIT_MIN, fitted: fitted.length > 0 };
}
