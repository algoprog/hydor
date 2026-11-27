// What a project's Research tab says, worked out from the brief (shared/project-research.ts): the sentences of each
// card and line, the days the news is grouped under, what folds under "N more", the steps of the best line and the chart's
// shape. No React here: words-test.ts checks it. A name an agent or a person gave (a session, a search, an evaluation)
// is a { name } part, which the page draws untranslated; the rest of a sentence is plain words the page's translator takes whole.
import { bestSteps, type ResearchBrief, type ResearchEvaluation, type ResearchNews, type ResearchRun, type ResearchWait, type ResearchWork } from '@shared/project-research';
import { gpuNum, HELD_WHY } from '@shared/experiments';
import type { FindingVerdict } from '@shared/findings';
import { LOCALE } from '../../i18n/locale';
import { num, took, leftWords, waitKind, type WaitKind } from '../experiments/api';
import { filesWords, small, standing, type Standing } from '../experiments/evalWords';
import { nightStatus } from '../experiments/nightWords';

/** A sentence is plain words with the names in it (drawn as they were written, never translated). */
export type Part = string | { name: string };
export const plain = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : p.name)).join('');

/** How many cards of "Waiting for you", lines of "Since you last looked" and of "Running and waiting" show before they fold. */
export const WAITING_SHOWN = 3;
export const NEWS_SHOWN = 6;
export const WORK_LINES = 4;

const count = (n: number) => n.toLocaleString(LOCALE);
const many = (n: number, one: string, other: string) => (n === 1 ? one : other);

/** The part that shows and the number that fold under a button ("3 more"). */
export function fold<T>(items: T[], shown: number, all: boolean): { shown: T[]; more: number } {
  return all || items.length <= shown ? { shown: items, more: 0 } : { shown: items.slice(0, shown), more: items.length - shown };
}
export const moreWords = (n: number) => `${count(n)} more`;
export const showMoreWords = (n: number) => `Show ${count(n)} more`;

// ---- times ---------------------------------------------------------------------------------------------------------------

export const clock = (t: number) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
const startOfDay = (t: number) => new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime();
const DAY = 86_400_000;
/** Whole days between the days of two moments (0: the same day), counted on the calendar, so the clock changing does not skew it. */
const daysBetween = (t: number, now: number) => Math.round((startOfDay(now) - startOfDay(t)) / DAY);

/** "Today", "Yesterday", the weekday within the last week, else the date. */
export function dayName(t: number, now: number): string {
  const d = daysBetween(t, now);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Date(t).toLocaleDateString(LOCALE, { weekday: 'long' });
  return new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(new Date(t).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

/**
 * A moment to come, for "starts about", as the server writes it in a run's reason: "14:20", "14:20 tomorrow", "14:20 on
 * Saturday". The weekday stays in English here, as in the server's, and the page's translator names it ("{0}:{1} on {2}");
 * the words are joined so that no "{0} on {1}" is listed for translating, which would take in any "… on …" in the app.
 */
export function whenWords(t: number, now: number): string {
  const d = -daysBetween(t, now);
  if (d <= 0) return clock(t);
  if (d === 1) return `${clock(t)} tomorrow`;
  const day = d < 7 ? new Date(t).toLocaleDateString('en-US', { weekday: 'long' }) : new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  return [clock(t), 'on', day].join(' ');
}

/** When the person last looked, at the right of the heading: "yesterday, 18:40", "Monday, 09:05". */
export function sinceWords(t: number, now: number): string {
  const d = daysBetween(t, now);
  // Today and yesterday are written whole, so each is a sentence the translator knows.
  if (d <= 0) return `today, ${clock(t)}`;
  return d === 1 ? `yesterday, ${clock(t)}` : `${dayName(t, now)}, ${clock(t)}`;
}

export const newsHeading = (first: boolean) => (first ? 'The last seven days' : 'Since you last looked');
export const nothingNew = (seen: number | null, now: number) => (seen === null ? 'Nothing new in the last seven days.' : `Nothing new since ${sinceWords(seen, now)}.`);

/** A moment as "2 h ago" ("just now" within a minute). */
export function agoOf(t: number, now: number): string {
  const ms = Math.max(0, now - t);
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** The lines under the days they happened on: no day names when they all fall on one day. Input newest first. */
export function groupByDay<T extends { at: number }>(items: T[], now: number): { day: string | null; items: T[] }[] {
  const out: { key: number; day: string; items: T[] }[] = [];
  for (const it of items) {
    const key = startOfDay(it.at);
    const last = out[out.length - 1];
    if (last?.key === key) last.items.push(it);
    else out.push({ key, day: dayName(it.at, now), items: [it] });
  }
  return out.length > 1 ? out.map((g) => ({ day: g.day, items: g.items })) : out.map((g) => ({ day: null, items: g.items }));
}

// ---- waiting for you -------------------------------------------------------------------------------------------------------

export interface WaitCard {
  id: string;
  /** The question or what is asked, as a sentence. */
  title: Part[];
  /** Under it. */
  detail?: Part[];
  /** "Asked 2 h ago in" and then the session's name. */
  where?: { text: string; name: string };
}

const waited = (at: number, now: number) => `Waiting for ${took(now - at)} in`;

/** What a card of "Waiting for you" says. */
export function waitCard(w: ResearchWait, now: number): WaitCard {
  switch (w.kind) {
    case 'held': {
      // Whole readings, one run and more, so each translates as a sentence.
      const most = w.ceiling.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
      const s = w.ceiling === 1 ? '' : 's';
      return { id: w.id, title: [w.runs.length === 1 ? `1 run waits: agents have used the ${most} GPU hour${s} you allow in seven days` : `${count(w.runs.length)} runs wait: agents have used the ${most} GPU hour${s} you allow in seven days`] };
    }
    case 'held-search': {
      const most = w.ceiling.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
      return { id: w.id, title: ['The search “', { name: w.evolution.title }, `” waits: agents have used the ${most} GPU hour${w.ceiling === 1 ? '' : 's'} you allow in seven days`] };
    }
    case 'ask':
      return { id: w.id, title: [{ name: w.title }], ...(w.detail ? { detail: [w.detail] } : {}), where: { text: `Asked ${agoOf(w.at, now)} in`, name: w.session.title } };
    case 'goal':
      return {
        id: w.id,
        title: w.status === 'asking' ? [{ name: w.title }] : w.status === 'agreeing' ? ['The checks of the goal “', { name: w.title }, '” wait for your OK'] : w.status === 'paused' ? ['The goal “', { name: w.title }, '” is paused'] : ['The goal “', { name: w.title }, '” needs you'],
        ...(w.reason ? { detail: [{ name: w.reason }] } : {}),
        where: { text: w.status === 'asking' ? `Asked ${agoOf(w.at, now)} in` : waited(w.at, now), name: w.session.title },
      };
    case 'sealed': {
      const names = w.names.slice(0, 2).join(', ');
      const rest = w.changed - Math.min(2, w.names.length);
      return {
        id: w.id,
        title: ['The sealed files of “', { name: w.evaluation.name }, '” differ'],
        detail: [names ? `${filesWords(w.changed)} changed: ` : `${filesWords(w.changed)} changed`, ...(names ? [{ name: names }] : []), ...(rest > 0 ? [` and ${count(rest)} more`] : []), '. Scores wait until they are back.'],
      };
    }
    case 'baseline':
      return { id: w.id, title: ['Measure the baseline of “', { name: w.evaluation.name }, '”'], detail: ['Until then no score is compared with anything.'] };
    case 'final':
      return { id: w.id, title: ['Run the final test?'], detail: ['The goal “', { name: w.goal.title }, `” was reached ${agoOf(w.at, now)}. The final test has not seen this version.`] };
    case 'paused':
      return { id: w.id, title: ['The search “', { name: w.evolution.title }, '” is paused'], detail: [w.reason, ` ${count(w.evolution.tried)} of ${count(w.evolution.candidates)} tried.`] };
  }
}

// ---- since you last looked -------------------------------------------------------------------------------------------------

/** Where a line leads. */
export type Opens = { kind: 'finding'; number: number } | { kind: 'experiment'; group: string } | { kind: 'evolution'; id: string } | { kind: 'session'; key: string } | { kind: 'evaluation'; id: string } | { kind: 'runs' };

export interface NewsLine {
  id: string;
  at: number;
  /** A finding's verdict as the Memory tab's pill; or the red "Failed". */
  pill?: { verdict: FindingVerdict } | { failed: true };
  parts: Part[];
  /** The small print at the right: the time, and what else. */
  meta: string;
  /** The link at the right instead of the small print ("Look at the runs"). */
  action?: string;
  opens: Opens;
}

const figures = (v: number, digits = Math.abs(v) >= 100 ? 5 : 4) => (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) ? v.toExponential(2) : String(Number.isInteger(v) ? v : Number(v.toPrecision(digits))));

/** "9 runs ended: 7 done, 2 failed". `experiment`: the one they belong to, when it has a name. */
function runsParts(n: Extract<ResearchNews, { kind: 'runs' }>): Part[] {
  const again = !n.again ? '' : n.again === 1 ? '1 failed and was started again' : `${count(n.again)} failed and were started again`;
  const bits = [n.done ? `${count(n.done)} done` : '', n.failed ? `${count(n.failed)} failed` : '', again, n.other ? `${count(n.other)} stopped` : ''].filter(Boolean);
  const head = n.experiment ? [n.total === 1 ? '1 run of “' : `${count(n.total)} runs of “`, { name: n.experiment }, n.total === 1 ? '” ended' : '” ended'] : [n.total === 1 ? '1 run ended' : `${count(n.total)} runs ended`];
  // Each count a part of its own, so each is translated.
  const all = n.done === n.total ? [n.total === 1 ? ': done' : ': all done'] : [': ', ...bits.flatMap((b, i) => (i ? [', ', b] : [b]))];
  return [...head, ...all];
}

/** "4 runs ran out of memory with batches of 4096, the same setting each time". */
function failureParts(n: Extract<ResearchNews, { kind: 'failures' }>): Part[] {
  // After a name, its closing quote goes with the words, so a language can write its own.
  const oom = n.reason === 'oom';
  const runs = n.experiment ? [`${count(n.count)} runs of “`, { name: n.experiment }] : [`${count(n.count)} runs `];
  const what = n.experiment ? (oom ? '” ran out of memory' : '” failed the same way') : oom ? 'ran out of memory' : 'failed the same way';
  const batch = n.setting && /batch/i.test(n.setting.name);
  const setting = n.setting ? [batch ? ' with batches of ' : ` with ${n.setting.name.replace(/[_-]+/g, ' ')} `, { name: n.setting.value }, ', the same setting each time'] : [];
  // Why a run failed is mostly the app's own words (translated when they are), else as it is.
  const why = n.reason === 'other' && n.why ? [`: `, n.why] : [];
  return [...runs, what, ...setting, ...why];
}

/** "The search “…” tried 37 more versions: its best is 0.447, 0.035 better than the start". */
function searchParts(n: Extract<ResearchNews, { kind: 'search' }>): Part[] {
  const head = ['The search “', { name: n.name }, `” tried ${count(n.tried)} more version${n.tried === 1 ? '' : 's'}`] as Part[];
  return n.best ? [...head, `: its best is ${figures(n.best.mean)}, ${figures(n.best.gain, 3)} better than the start`] : [...head, ' and found nothing better than its best so far'];
}

/** "The goal “…” finished round 4 of 12: 0.431, not there yet". */
function goalParts(n: Extract<ResearchNews, { kind: 'goal' }>): Part[] {
  const there = n.holds === n.of && n.of > 0;
  const value = n.value !== undefined ? `${figures(n.value)}${n.unit ? ` ${n.unit}` : ''}` : n.of > 1 ? `${count(n.holds)} of ${count(n.of)} checks hold` : '';
  const end = there ? 'every check holds' : 'not there yet';
  return ['The goal “', { name: n.title }, `” finished round ${count(n.round)} of ${count(n.rounds)}: `, ...(value ? [value, ', ', end] : [end])];
}

/** "A new best of “…”: 0.447 ± 0.002, 0.035 better than the baseline". */
function bestParts(n: Extract<ResearchNews, { kind: 'best' }>): Part[] {
  const s = standing(n.against);
  const spread = n.std !== undefined && n.seeds > 1 ? ` ± ${small(n.std)}` : '';
  return ['A new best of “', { name: n.evaluation.name }, '”', `: ${num(n.mean)}${spread}`, ...(s ? [', ', `${s.long.charAt(0).toLowerCase()}${s.long.slice(1)}`] : [])];
}

/** One news item as a line. */
export function newsLine(n: ResearchNews): NewsLine {
  switch (n.kind) {
    case 'finding':
      return { id: n.id, at: n.at, pill: { verdict: n.verdict }, parts: [{ name: n.statement + (n.learned ? `: ${n.learned}` : '') }], meta: `finding · ${clock(n.at)}`, opens: { kind: 'finding', number: n.number } };
    case 'runs':
      return { id: n.id, at: n.at, parts: runsParts(n), meta: n.sessions ? `${many(n.sessions, '1 session', `${count(n.sessions)} sessions`)} · ${clock(n.at)}` : clock(n.at), opens: n.group ? { kind: 'experiment', group: n.group } : { kind: 'runs' } };
    case 'failures':
      return { id: n.id, at: n.at, pill: { failed: true }, parts: failureParts(n), meta: clock(n.at), action: 'Look at the runs', opens: n.group ? { kind: 'experiment', group: n.group } : { kind: 'runs' } };
    case 'search':
      return { id: n.id, at: n.at, parts: searchParts(n), meta: clock(n.at), opens: { kind: 'evolution', id: n.evolution } };
    case 'goal':
      return { id: n.id, at: n.at, parts: goalParts(n), meta: clock(n.at), opens: { kind: 'session', key: n.session } };
    case 'best':
      return { id: n.id, at: n.at, parts: bestParts(n), meta: clock(n.at), opens: { kind: 'evaluation', id: n.evaluation.id } };
  }
}

// ---- where it stands -------------------------------------------------------------------------------------------------------

/** The evaluation's head line: how its best stands to the baseline, in the evaluation page's own words. */
export function standLine(e: ResearchEvaluation): { standing: Standing | null; final: string } {
  const s = standing(e.best?.against);
  const f = e.final;
  const final = f.state === 'unset' ? '' : f.state === 'unrun' ? 'final test not run' : f.state === 'running' ? 'final test running' : f.state === 'failed' ? 'final test failed' : f.mean !== undefined ? `final test ${num(f.mean)}${f.std !== undefined ? ` ± ${small(f.std)}` : ''}` : 'final test run';
  return { standing: s, final };
}

/** "0.447 ± 0.002". */
export const spread = (mean: number, std?: number, seeds = 2) => (std !== undefined && seeds > 1 ? `${num(mean)} ± ${small(std)}` : num(mean));

export interface Fact {
  label: string;
  value: string;
  sub?: string;
  /** The sub holds the person's own names. */
  name?: boolean;
  opens?: 'findings';
}

/** The four facts under the chart: the best, the baseline, how many scores, the findings. */
export function facts(e: ResearchEvaluation, f: ResearchBrief['findings']): Fact[] {
  const total = e.scores.length + e.failed.length;
  const decided = [f.held ? `${count(f.held)} held` : '', f.didNot ? `${count(f.didNot)} did not` : ''].filter(Boolean).join(' · ');
  const left = [f.open ? `${count(f.open)} open` : '', f.unclear ? `${count(f.unclear)} unclear` : ''].filter(Boolean).join(' · ');
  return [
    { label: 'Best', value: e.best ? spread(e.best.mean, e.best.std, e.seeds) : '–', ...(e.best?.label ? { sub: e.best.label, name: true } : {}) },
    { label: 'Baseline', value: e.baseline ? spread(e.baseline.mean, e.baseline.std, e.baseline.seeds) : 'Not measured', ...(e.baseline ? { sub: [e.baseline.seeds > 0 ? many(e.baseline.seeds, '1 seed', `${count(e.baseline.seeds)} seeds`) : '', e.baseline.where ?? ''].filter(Boolean).join(' · '), name: !!e.baseline.where } : {}) },
    { label: 'Scores', value: count(total), ...(e.failed.length ? { sub: `${count(e.failed.length)} failed` } : {}) },
    { label: 'Findings', value: decided || (left ? left : 'None yet'), ...(decided && left ? { sub: left } : {}), opens: 'findings' },
  ];
}

// ---- the chart -------------------------------------------------------------------------------------------------------------

export interface ChartPointModel {
  id: string;
  at: number;
  mean: number;
  /** It was the best so far when it came (above the baseline). */
  step: boolean;
  label?: string;
}

export interface ChartModel {
  t0: number;
  t1: number;
  /** The moments the axis names at its ends: the first and last drawn, without the room around them (which can fall on another day). */
  from: number;
  to: number;
  lo: number;
  hi: number;
  points: ChartPointModel[];
  /** The best so far as a stepped line, vertex by vertex, in the chart's own units. */
  line: { t: number; v: number }[];
  baseline?: number;
  failed: number[];
}

/**
 * The shape of the chart: the times the scores span (to now at the most recent end, and never narrower than a few hours, so
 * one or two scores sit in the middle of something), the range of the values with some room, the best-so-far line (it starts
 * at the baseline when there is one, steps at each score that beat it and everything before, runs on to the end), the
 * baseline and the failed scores. Null when there is nothing to draw.
 */
export function chartModel(e: ResearchEvaluation, now: number): ChartModel | null {
  if (!e.scores.length && !e.failed.length && !e.baseline) return null;
  const base = e.baseline?.mean;
  const times = [...e.scores.map((s) => s.at), ...e.failed];
  let t0 = times.length ? Math.min(...times) : now - 6 * 3_600_000;
  const last = times.length ? Math.max(...times) : now;
  // Out to now, so a best that has stood for days reads as standing; not past a month, where it would squash the rest.
  let t1 = now > last && now - t0 < 30 * 86_400_000 ? now : last;
  const from = t0;
  const to = t1;
  const MIN = 6 * 3_600_000;
  if (t1 - t0 < MIN) {
    const mid = (t0 + t1) / 2;
    t0 = mid - MIN / 2;
    t1 = mid + MIN / 2;
  } else {
    // A little room before the first and after the last.
    const room = (t1 - t0) * 0.03;
    t0 -= room;
    t1 += room;
  }
  const values = [...e.scores.map((s) => s.mean), ...(base !== undefined ? [base] : [])];
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  const room = (hi - lo || Math.abs(hi) || 1) * 0.15;
  lo -= room;
  hi += room;
  const steps = new Set(bestSteps(e.scores, e.better, base));
  const points = e.scores.map((s, i) => ({ id: s.id, at: s.at, mean: s.mean, step: steps.has(i), ...(s.label ? { label: s.label } : {}) }));
  const line: ChartModel['line'] = [];
  let at = base;
  const first = points.find((p) => p.step);
  if (at !== undefined) line.push({ t: t0, v: at });
  else if (first) line.push({ t: t0, v: first.mean }), (at = first.mean);
  for (const p of points)
    if (p.step && at !== undefined && p.mean !== at) {
      line.push({ t: p.at, v: at }, { t: p.at, v: p.mean });
      at = p.mean;
    }
  if (at !== undefined) line.push({ t: t1, v: at });
  return { t0, t1, from, to, lo, hi, points, line, ...(base !== undefined ? { baseline: base } : {}), failed: [...e.failed] };
}

/** The chart's summary for a screen reader. */
export const chartSummary = (e: ResearchEvaluation) => `${e.scores.length === 1 ? '1 score' : `${count(e.scores.length)} scores`} against the baseline, with the best so far as a stepped line`;

// ---- running and waiting -------------------------------------------------------------------------------------------------

export interface WorkLine {
  id: string;
  /** The line: a name (a run's, a search's) in parts. */
  parts: Part[];
  /** Under or beside the name: "4 GPUs". */
  small?: string;
  /** At the right: how far, how long, or why it waits. */
  state: string;
  /** Where it leads (a run, a search, a goal's session); none for a folded count. */
  opens?: { kind: 'run'; id: string } | { kind: 'evolution'; id: string } | { kind: 'session'; key: string } | { kind: 'experiments' };
}

const gpusWords = (n: number) => (n > 0 ? many(n, '1 GPU', `${count(n)} GPUs`) : '');

/**
 * What a waiting run waits for, in the status's own words (the night's included), or when it should start where the app
 * says: "starts about 14:20". The reason's own ". About 14:20, when … should end" is never shown beside it, and a night run
 * that says its hour ("from 23:00") says it once.
 */
export function waitState(r: Pick<ResearchRun, 'why' | 'clusterJob' | 'status' | 'startsAbout'>, now = Date.now()): string {
  if (r.status === 'queued') return 'In line';
  const k = waitKind(r);
  if (k === 'night' && /^Waits for the night \(from \d\d:\d\d\)$/.test(r.why ?? '')) return nightStatus(r.why);
  if (r.startsAbout && r.startsAbout > now - 60_000) return `starts about ${whenWords(r.startsAbout, now)}`;
  if (k === 'night') return nightStatus(r.why);
  return k === 'you' ? 'Waits for you' : k === 'gpu' ? 'Waiting for a GPU' : k === 'slot' ? 'Waiting for a run to end' : k === 'cluster' ? 'In the cluster’s queue' : 'Waiting';
}

/** "61% · about 5 h left", or how long it has run when it has no figure. */
export function runState(r: ResearchRun, now: number): string {
  if (r.status === 'starting') return 'Starting';
  const pct = r.progress?.fraction !== undefined ? `${Math.round(r.progress.fraction * 100)}%` : r.progress?.text ?? '';
  const left = r.endsAt && r.endsAt > now ? leftWords(r.endsAt - now) : r.endsAt ? 'finishing' : '';
  const ran = !pct && r.startedAt ? `Running ${took(now - r.startedAt)}` : '';
  return [pct, left, ran].filter(Boolean).join(' · ') || 'Running';
}

/** "9 runs wait for a GPU". Each reading whole, as a language puts it. */
const waitCount = (n: number, k: WaitKind | 'line') => {
  const one = n === 1;
  const c = count(n);
  switch (k) {
    case 'you':
      return one ? '1 run waits for you' : `${c} runs wait for you`;
    case 'gpu':
      return one ? '1 run waits for a GPU' : `${c} runs wait for a GPU`;
    case 'night':
      return one ? '1 run waits for the night' : `${c} runs wait for the night`;
    case 'slot':
      return one ? '1 run waits for a run to end' : `${c} runs wait for a run to end`;
    case 'cluster':
      return one ? '1 run waits in the cluster’s queue' : `${c} runs wait in the cluster’s queue`;
    case 'line':
      return one ? '1 run waits in line' : `${c} runs wait in line`;
    default:
      return one ? '1 run waits' : `${c} runs wait`;
  }
};

/**
 * The lines of "Running and waiting": runs that go, goals and searches at work, then runs that wait. With more than four,
 * the runs that wait fold into one line for each thing they wait for ("9 runs wait for a GPU", "4 runs wait for the night"),
 * and when that is still too many, the runs that go fold too.
 */
export function workLines(w: ResearchWork, now: number): WorkLine[] {
  const going = w.runs.filter((r) => r.status === 'running' || r.status === 'starting');
  const waiting = w.runs.filter((r) => r.status === 'queued' || r.status === 'waiting');
  const run = (r: ResearchRun): WorkLine => ({ id: r.id, parts: [{ name: r.name }], ...(gpusWords(r.gpus) ? { small: gpusWords(r.gpus) } : {}), state: r.status === 'running' || r.status === 'starting' ? runState(r, now) : waitState(r, now), opens: { kind: 'run', id: r.id } });
  const goals: WorkLine[] = w.goals.map((g) => ({ id: `goal:${g.key}`, parts: ['The goal “', { name: g.title }, '”'], state: g.round ? `round ${count(g.round)} of ${count(g.rounds)}` : 'Measuring', opens: { kind: 'session', key: g.key } }));
  const searches: WorkLine[] = w.searches.map((s) => ({ id: `search:${s.id}`, parts: ['The search “', { name: s.title }, '”'], state: s.waits ? (s.waits.startsWith(HELD_WHY) ? 'Waits for you' : nightStatus(s.waits)) : `${count(s.tried)} of ${count(s.candidates)} tried`, opens: { kind: 'evolution', id: s.id } }));
  const all = [...going.map(run), ...goals, ...searches, ...waiting.map(run)];
  if (all.length <= WORK_LINES) return all;
  const folded: WorkLine[] = [];
  const groups = new Map<WaitKind | 'line', ResearchRun[]>();
  for (const r of waiting) {
    const k = r.status === 'queued' ? 'line' : waitKind(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [k, rs] of groups) folded.push({ id: `wait:${k}`, parts: [waitCount(rs.length, k)], state: k === 'night' ? nightFrom(rs) || firstAbout(rs, now) : firstAbout(rs, now), opens: { kind: 'experiments' } });
  const head = [...going.map(run), ...goals, ...searches];
  const lines = [...head, ...folded];
  if (lines.length <= WORK_LINES) return lines;
  // Still too many: the runs that go fold too, and what is at work stays named.
  const keep = going.slice(0, Math.max(1, WORK_LINES - goals.length - searches.length - folded.length - 1));
  const rest = going.length - keep.length;
  return [...keep.map(run), ...(rest > 0 ? [{ id: 'going', parts: [rest === 1 ? '1 more run is going' : `${count(rest)} more runs are going`], state: '', opens: { kind: 'experiments' as const } }] : []), ...goals, ...searches, ...folded];
}

/** "first about 14:20": the earliest of these runs' start times, where the app tells them. */
function firstAbout(rs: ResearchRun[], now: number): string {
  const t = rs.map((r) => r.startsAbout).filter((x): x is number => !!x && x > now - 60_000);
  return t.length ? `first about ${whenWords(Math.min(...t), now)}` : '';
}

/** "from 23:00" for a folded count of runs that wait for the night, when their reason names the hour. */
function nightFrom(rs: ResearchRun[]): string {
  const m = /\(from (\d\d:\d\d)\)/.exec(rs[0]?.why ?? '');
  return m ? `from ${m[1]}` : '';
}

/** How many things the heading counts. */
export const workCount = (w: ResearchWork) => w.runs.length + w.searches.length + w.goals.length;

// ---- this week -------------------------------------------------------------------------------------------------------------


/**
 * The week in words. With a limit on agents' GPU hours, its first line is what all agents' runs on this computer used of
 * it, with a bar (`limit`), in place of this project's GPU hours.
 */
export function weekWords(w: ResearchBrief['week']): { hours: string; models: string; limit?: { percent: number; note: string } } {
  const hours = w.gpuHours > 0 ? (w.gpuHours === 1 ? '1 GPU hour' : `${w.gpuHours.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} GPU hours`) : 'No GPU hours';
  const money = w.usd > 0 ? `${w.usd.toLocaleString(LOCALE, { style: 'currency', currency: 'USD' })} of models` : w.unpriced ? 'Model cost not known' : 'No model cost';
  const models = `${money} · ${many(w.sessions, '1 session', `${count(w.sessions)} sessions`)}`;
  if (w.agents) {
    const { used, ceiling } = w.agents;
    const most = ceiling.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
    const spent = Number(gpuNum(used, true)).toLocaleString(LOCALE, { maximumFractionDigits: 2 });
    const limit = { percent: ceiling > 0 ? Math.min(100, (used / ceiling) * 100) : 100, note: 'Agents’ runs on this computer, in seven days' };
    return { hours: `${spent} of ${most} GPU hour${ceiling === 1 ? '' : 's'}`, models, limit };
  }
  return { hours, models };
}

// ---- the steps' names on a wide chart ----------------------------------------------------------------------------------------

/** The longest a step's name is, in characters, before it is cut with an ellipsis. */
export const LABEL_MAX = 28;
export const cutLabel = (t: string) => (t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX - 1).trimEnd()}…` : t);

export interface PlacedLabel {
  id: string;
  /** Where the text starts (or ends, with `end`) and its baseline, in the chart's pixels. */
  x: number;
  y: number;
  text: string;
  end: boolean;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Whether the line (a polyline in pixels) passes through the box. Its pieces are all horizontal or vertical. */
function crosses(line: { x: number; y: number }[], b: Box): boolean {
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1];
    const q = line[i];
    const seg = { x0: Math.min(p.x, q.x) - 1, x1: Math.max(p.x, q.x) + 1, y0: Math.min(p.y, q.y) - 1, y1: Math.max(p.y, q.y) + 1 };
    if (overlap(seg, b)) return true;
  }
  return false;
}

/**
 * Names for the steps of the best line, newest first: each beside its point (on its right, else
 * on its left), cut at 28 characters. One that on both sides would run into a name already kept, cross the
 * best-so-far line or leave the plot is left out. `points`: the steps with their pixels; `line`: the best-so-far line in pixels; `left`, `right`: the plot's edges.
 * A character is about `char` px wide and a name 12 px tall.
 */
export function placeLabels(points: { id: string; label?: string; x: number; y: number }[], line: { x: number; y: number }[], left: number, right: number, char = 5.6): PlacedLabel[] {
  const kept: Box[] = [];
  const out: PlacedLabel[] = [];
  for (const p of [...points].reverse()) {
    if (!p.label) continue;
    const text = cutLabel(p.label);
    const w = text.length * char + 4;
    const base = p.y - 9;
    // On the right of its point, else on its left, where it has room.
    for (const end of [false, true]) {
      const x0 = end ? p.x - 6 - w : p.x + 6;
      if (x0 < left || x0 + w > right) continue;
      const box: Box = { x0, x1: x0 + w, y0: base - 10, y1: base + 3 };
      if (kept.some((k) => overlap(k, box)) || crosses(line, box)) continue;
      kept.push(box);
      out.push({ id: p.id, x: end ? p.x - 6 : p.x + 6, y: base, text, end });
      break;
    }
  }
  return out.reverse();
}
