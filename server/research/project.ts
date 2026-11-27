// A project's Research tab, read in one call: what waits for the person, what happened since they last looked, how the
// project's evaluations stand, what runs and waits, and the week's work. Everything comes from what the app keeps
// already (sessions that wait, goals, evaluations and their scores, evolutions, findings, runs, what sessions cost);
// nothing is kept here but when the person last looked, and which final-test cards they put off.
//   GET  /api/projects/:id/research        the whole page
//   POST /api/projects/:id/research/seen   they looked: { at? }
//   POST /api/projects/:id/research/later  not yet for a final test: { evaluation }
// The words are the page's (web/src/features/research/words.ts); here only facts.
import { bestSteps, FIRST_LOOK_MS, type AskChoice, type ResearchBrief, type ResearchEvaluation, type ResearchNews, type ResearchPoint, type ResearchRun, type ResearchWait } from '../../shared/project-research.ts';
import type { EvalScore, Evaluation } from '../../shared/evaluations.ts';
import { HELD_WHY, type RunRecord } from '../../shared/experiments.ts';
import { goalOver, goalWaits, holding, type GoalState } from '../../shared/goals.ts';
import { isGroup, type Space } from '../../shared/spaces.ts';
import type { JobEntry, JobsList } from '../../shared/jobs.ts';
import type { InboxItem } from '../../shared/inbox.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { ceilingUse } from '../experiments/budget.ts';
import { candidatesOf, listEvolutions } from '../experiments/evolve.ts';
import { getEvaluation, listEvaluations, listScores } from '../experiments/evaluations.ts';
import { oomText } from '../experiments/metrics.ts';
import { awayIds, eventsOf, isScoringRun, isTrialRun, listInfo, listRuns, madeGood } from '../experiments/records.ts';
import type { Deps } from '../features/types.ts';
import { git } from '../git.ts';
import { allGoals, goalUpdated } from '../goals/store.ts';
import { isInternal } from '../internal.ts';
import { repoRoot } from '../memory/store.ts';
import { projectFindings } from '../memory/findings.ts';
import { costOf, ratesReady } from '../prices.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { spaceById } from '../spaces/index.ts';
import { insideOf } from './has.ts';

/** How long the brief waits for the price list on a first look. */
const PRICES_WAIT_MS = 2500;

const HOUR = 3_600_000;
const seenKey = (id: string) => `research.seen.${id}`;
const laterKey = (id: string) => `research.later.${id}`;

const inside = insideOf;

// ---- runs ------------------------------------------------------------------------------------------------------------

/** The project's runs, newest first: those started in its folder or under it, and those that name it. Archived ones are left out. */
function projectRuns(db: DB, s: Space): RunRecord[] {
  // What was put aside counts as seen already.
  const seen = awayIds(db);
  const out: RunRecord[] = [];
  for (const r of [...listRuns(db, { cwd: s.folder, limit: 5000 }), ...listRuns(db, { project: s.id, limit: 5000 })])
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** A run the tab is about: not one that scores an evaluation, nor a trial of a command ("Try it first"). */
export const isExperimentRun = (r: Pick<RunRecord, 'tags' | 'env'>) => !isScoringRun(r) && !isTrialRun(r);

const ENDED = new Set(['done', 'failed', 'stopped', 'lost']);

/** Whether a failed run ran out of memory: the agent on call saw it, or its reason says so. */
const ranOut = (db: DB, r: RunRecord) => eventsOf(db, r.id).some((e) => e.kind === 'oom') || oomText(r.why ?? '');

/** The first line of why a run failed, cut: what failed runs have in common when it is not memory. */
const whyOf = (r: RunRecord) => (r.why ?? '').split('\n')[0].trim().slice(0, 120);

/**
 * Failed runs of one experiment that failed for the same reason, the most of them (two or more): how many, the reason,
 * and a setting every one of them had that some run that did not fail did not have ("batch size 4096": the same
 * setting each time). Null when no two share a reason.
 */
export function sharedFailure(failed: RunRecord[], others: RunRecord[], oom: (r: RunRecord) => boolean): { count: number; reason: 'oom' | 'other'; why?: string; setting?: { name: string; value: string }; runs: RunRecord[] } | null {
  const buckets = new Map<string, RunRecord[]>();
  for (const r of failed) {
    const k = oom(r) ? 'oom' : `why:${whyOf(r)}`;
    buckets.set(k, [...(buckets.get(k) ?? []), r]);
  }
  const top = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!top || top[1].length < 2) return null;
  const [key, runs] = top;
  let setting: { name: string; value: string } | undefined;
  for (const [name, value] of Object.entries(runs[0].params ?? {})) {
    if (!runs.every((r) => String(r.params?.[name]) === String(value))) continue;
    if (others.some((r) => r.params?.[name] !== undefined && String(r.params[name]) !== String(value))) {
      setting = { name, value: String(value) };
      break;
    }
  }
  return { count: runs.length, reason: key === 'oom' ? 'oom' : 'other', ...(key !== 'oom' && whyOf(runs[0]) ? { why: whyOf(runs[0]) } : {}), ...(setting ? { setting } : {}), runs };
}

/** The runs that ended since `from`, one line for each experiment, and one more when several of its failed alike. */
export function endedNews(db: DB, runs: RunRecord[], from: number): ResearchNews[] {
  const infos = listInfo(db);
  /** An experiment by its title (what experiment_describe sets), else its group. */
  const nameOf = (group: string) => infos.get(group)?.title?.trim() || group;
  const by = new Map<string, RunRecord[]>();
  for (const r of runs) if (ENDED.has(r.status) && (r.endedAt ?? 0) >= from && isExperimentRun(r)) by.set(r.group ?? '', [...(by.get(r.group ?? '') ?? []), r]);
  const out: ResearchNews[] = [];
  for (const [group, ended] of by) {
    const at = Math.max(...ended.map((r) => r.endedAt ?? 0));
    const experiment = group ? nameOf(group) : undefined;
    const sessions = new Set(ended.map((r) => r.startedBy?.session).filter(Boolean)).size;
    // A failure that a later attempt made good needs no look: it is said as started again, not as failed.
    const good = madeGood(db, ended);
    const failed = ended.filter((r) => r.status === 'failed' && !good.has(r.id));
    out.push({
      kind: 'runs',
      id: `runs:${group}:${at}`,
      at,
      ...(group ? { group } : {}),
      ...(experiment ? { experiment } : {}),
      total: ended.length,
      done: ended.filter((r) => r.status === 'done').length,
      failed: failed.length,
      ...(good.size ? { again: good.size } : {}),
      other: ended.length - ended.filter((r) => r.status === 'done').length - failed.length - good.size,
      sessions,
    });
    const rest = runs.filter((r) => (r.group ?? '') === group && r.status !== 'failed' && isExperimentRun(r));
    const shared = sharedFailure(failed, rest, (r) => ranOut(db, r));
    if (shared)
      out.push({
        kind: 'failures',
        id: `failures:${group}:${at}`,
        at: Math.max(...shared.runs.map((r) => r.endedAt ?? 0)),
        ...(group ? { group } : {}),
        ...(experiment ? { experiment } : {}),
        count: shared.count,
        reason: shared.reason,
        ...(shared.why ? { why: shared.why } : {}),
        ...(shared.setting ? { setting: shared.setting } : {}),
      });
  }
  return out;
}

/** GPU hours of runs over the window: each run's GPUs times the hours it ran inside it (a run without a GPU counts none). */
export function gpuHours(runs: Pick<RunRecord, 'gpus' | 'gpuIds' | 'startedAt' | 'endedAt'>[], from: number, now: number): number {
  let ms = 0;
  for (const r of runs) {
    const n = r.gpuIds?.length || r.gpus || 0;
    if (!n || !r.startedAt) continue;
    const a = Math.max(r.startedAt, from);
    const b = Math.min(r.endedAt ?? now, now);
    if (b > a) ms += (b - a) * n;
  }
  return Math.round((ms / HOUR) * 10) / 10;
}

/** The tokens of the project's sessions over the window, from the hours the app keeps. */
function sessionTokens(db: DB, id: string, from: number): { key: string; root: string; model: string | null; i: number; c: number; o: number }[] {
  try {
    return db
      .prepare(
        `select a.key as key, a.root as root, s.model as model, sum(a.tokens_in) as i, sum(a.tokens_cached) as c, sum(a.tokens_out) as o
         from activity a left join app_sessions p on p.key = a.key left join app_sessions r on r.key = a.root left join sessions s on s.key = a.key
         where a.hour >= ? and coalesce(json_extract(p.extra, '$.space'), json_extract(r.extra, '$.space')) = ? group by a.key, a.root`,
      )
      .all(Math.floor(from / HOUR), id) as ReturnType<typeof sessionTokens>;
  } catch {
    return [];
  }
}

/** What the project's sessions' models cost over the window, from the hour-by-hour tokens the app keeps, and how many sessions worked. */
export function weekSessions(db: DB, id: string, from: number): { usd: number; unpriced: boolean; sessions: number } {
  const rows = sessionTokens(db, id, from);
  let usd = 0;
  let unpriced = false;
  for (const r of rows) {
    if (!r.i && !r.c && !r.o) continue;
    const cost = costOf(db, r.model, { tokensIn: r.i, tokensCached: r.c, tokensOut: r.o });
    if (cost === null) unpriced = true;
    else usd += cost;
  }
  return { usd: Math.round(usd * 100) / 100, unpriced, sessions: new Set(rows.map((r) => r.root)).size };
}

// ---- evaluations -----------------------------------------------------------------------------------------------------

const labels = new Map<string, string | null>();

/** What a score measured, in a few words: its commit's title, else its branch (cached: a commit's title does not change). */
async function labelOf(s: EvalScore): Promise<string | undefined> {
  if (s.commit) {
    const k = `${s.folder}@${s.commit}`;
    if (!labels.has(k)) {
      const r = await git(s.folder, ['show', '-s', '--format=%s', s.commit], 3000).catch(() => null);
      labels.set(k, r?.ok && r.out.trim() ? r.out.trim().slice(0, 80) : null);
      if (labels.size > 500) labels.delete(labels.keys().next().value as string);
    }
    const t = labels.get(k);
    if (t) return t;
  }
  return s.branch || undefined;
}

const point = (s: EvalScore): ResearchPoint => ({ id: s.id, at: s.createdAt, mean: s.mean!, ...(s.std !== undefined ? { std: s.std } : {}) });

/** How an evaluation stands. `person`: the final test's numbers are the person's alone, so only they get them. */
async function standOf(db: DB, ev: Evaluation, person: boolean): Promise<ResearchEvaluation> {
  const all = listScores(db, ev.id, ['score', 'baseline'], 1000);
  const mine = all.filter((s) => s.kind === 'score' && s.seal === ev.seal.n);
  const done = mine.filter((s) => s.status === 'done' && s.mean !== undefined).sort((a, b) => a.createdAt - b.createdAt);
  const points = done.map(point);
  // The best by the direction: the earliest of equals.
  let best: EvalScore | undefined;
  for (const s of done) if (!best || (ev.better === 'higher' ? s.mean! > best.mean! : s.mean! < best.mean!)) best = s;
  const base = ev.baseline ? all.find((s) => s.id === ev.baseline && s.status === 'done' && s.mean !== undefined) : undefined;
  // The steps of the best line are named by what was measured.
  for (const i of bestSteps(points, ev.better, base?.mean)) {
    const label = await labelOf(done[i]);
    if (label) points[i].label = label;
  }
  const finals = listScores(db, ev.id, ['final']).filter((s) => s.seal === ev.seal.n);
  const open = finals.find((s) => s.status === 'waiting' || s.status === 'running');
  const last = finals[0];
  const final: ResearchEvaluation['final'] = !ev.final
    ? { state: 'unset' }
    : open
      ? { state: 'running' }
      : !last
        ? { state: 'unrun' }
        : { state: last.status === 'done' ? 'done' : 'failed', ...(person && last.status === 'done' && last.mean !== undefined ? { mean: last.mean, ...(last.std !== undefined ? { std: last.std } : {}) } : {}) };
  return {
    id: ev.id,
    name: ev.name,
    metric: ev.metric,
    better: ev.better,
    seeds: ev.seeds.length,
    scores: points,
    failed: mine.filter((s) => s.status === 'failed').map((s) => s.createdAt).sort((a, b) => a - b),
    ...(base ? { baseline: { mean: base.mean!, ...(base.std !== undefined ? { std: base.std } : {}), seeds: base.seeds.length, ...(base.branch ? { where: base.branch } : {}) } } : {}),
    ...(best ? { best: { ...points[done.indexOf(best)], ...(best.against ? { against: best.against } : {}) } } : {}),
    scoredAt: Math.max(0, ...mine.map((s) => s.createdAt)),
    final,
    changed: !ev.state.ok,
  };
}

/** The scores that beat every earlier one of their evaluation (this seal), since `from`: the latest of them, if any. */
function bestNews(db: DB, ev: Evaluation, from: number): ResearchNews | null {
  const done = listScores(db, ev.id, ['score'], 1000)
    .filter((s) => s.seal === ev.seal.n && s.status === 'done' && s.mean !== undefined)
    .sort((a, b) => a.createdAt - b.createdAt);
  let best: EvalScore | undefined;
  let found: EvalScore | undefined;
  for (const s of done) {
    if (!best || (ev.better === 'higher' ? s.mean! > best.mean! : s.mean! < best.mean!)) {
      // The very first score is no "new best": there was nothing to beat.
      if (best && s.createdAt >= from) found = s;
      best = s;
    }
  }
  return found
    ? { kind: 'best', id: `best:${found.id}`, at: found.createdAt, evaluation: { id: ev.id, name: ev.name }, mean: found.mean!, ...(found.std !== undefined ? { std: found.std } : {}), seeds: found.seeds.length, ...(found.against ? { against: found.against } : {}) }
    : null;
}

// ---- the brief ---------------------------------------------------------------------------------------------------------

export interface BriefOptions {
  now?: number;
  /** The Jobs section's list, for how far running runs are and when they end. */
  jobs?: JobsList;
  /** An agent asks: the final test's numbers are the person's alone. */
  internal?: boolean;
  /** News from this moment on, in place of the last look (the page keeps what it showed first through a visit). */
  since?: number;
}

const goalTitle = (g: GoalState) => (g.contract.title || g.contract.objective).replace(/\s+/g, ' ').trim();
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** The choices a question offers, when the session page would answer them in one tap: one question, one choice among a few. */
function choicesOf(it: InboxItem): { id: string; choices: AskChoice[] } | undefined {
  const a = it.approval;
  if (!a || a.kind !== 'question' || a.form || a.app || a.questions?.length !== 1) return undefined;
  const q = a.questions[0];
  if (q.multiSelect || !q.options.length || q.options.length > 4) return undefined;
  return { id: q.id, choices: q.options.map((o) => ({ label: o.label, ...(o.description ? { description: o.description } : {}) })) };
}

/** Everything the Research tab shows, as of `now`. */
export async function researchBrief(d: Pick<Deps, 'db' | 'sessions'>, s: Space, o: BriefOptions = {}): Promise<ResearchBrief> {
  const db = d.db;
  const now = o.now ?? Date.now();
  const seenRaw = Number(kvGet(db, seenKey(s.id)));
  const seen = Number.isFinite(seenRaw) && seenRaw > 0 ? seenRaw : null;
  const since = o.since !== undefined && o.since > 0 && o.since <= now ? o.since : (seen ?? now - FIRST_LOOK_MS);
  const mine = (key: string | undefined) => !!key && sessionExtra(db, key).space === s.id;
  const title = (key: string) => d.sessions.summary(key)?.title ?? 'a session';

  const runs = projectRuns(db, s);
  const evals = listEvaluations(db).filter((e) => inside(e.cwd, s.folder));
  const evalIds = new Set(evals.map((e) => e.id));
  const stands = await Promise.all(evals.map((e) => standOf(db, e, !o.internal)));
  const goals = allGoals(db).filter((g) => mine(g.key));
  const evolutions = listEvolutions(db).filter((e) => evalIds.has(e.evaluation));
  let later: Record<string, string> = {};
  try {
    later = JSON.parse(kvGet(db, laterKey(s.id)) ?? '{}');
  } catch {}

  // ---- waiting for the person
  const waiting: ResearchWait[] = [];
  for (const it of d.sessions.inbox()) {
    if (!it.key || !mine(it.key) || (it.kind !== 'approval' && it.kind !== 'question' && it.kind !== 'form') || !it.approval) continue;
    const q = it.approval.questions?.[0];
    const c = choicesOf(it);
    waiting.push({
      kind: 'ask',
      id: it.id,
      at: it.at,
      session: { key: it.key, title: it.session ?? title(it.key) },
      title: clip(q?.question ?? it.title, 400),
      ...(it.approval.questions && it.approval.questions.length > 1 ? { detail: `and ${it.approval.questions.length - 1} more question${it.approval.questions.length > 2 ? 's' : ''}` } : it.approval.detail && it.kind !== 'question' ? { detail: clip(it.approval.detail.split('\n').find((l) => l.trim())?.trim() ?? '', 200) } : {}),
      approval: it.approval.id,
      ...(c ? { question: c } : {}),
    });
  }
  for (const g of goals) {
    if (!(goalWaits(g.status) || (g.status === 'asking' && g.question))) continue;
    waiting.push({
      kind: 'goal',
      id: `goal:${g.key}:${g.id}`,
      at: goalUpdated(db, g.key) || g.startedAt,
      session: { key: g.key, title: title(g.key) },
      status: g.status as 'agreeing' | 'needs-you' | 'paused' | 'asking',
      title: g.status === 'asking' && g.question ? clip(g.question.question, 400) : clip(goalTitle(g), 200),
      ...(g.status === 'asking' ? (g.question?.context ? { reason: clip(g.question.context, 300) } : {}) : g.reason ? { reason: clip(g.reason, 300) } : {}),
    });
  }
  for (const [i, ev] of evals.entries()) {
    const at = ev.state.checkedAt || ev.updatedAt;
    if (!ev.state.ok) {
      const n = ev.state.changed.length + (ev.state.more ?? 0);
      waiting.push({ kind: 'sealed', id: `sealed:${ev.id}`, at, evaluation: { id: ev.id, name: ev.name }, changed: n, names: ev.state.changed.slice(0, 2).map((c) => c.path) });
    }
    // No baseline: nothing is compared with anything until it is measured.
    if (!stands[i].baseline && !listScores(db, ev.id, ['baseline'], 20).some((b) => b.seal === ev.seal.n && (b.status === 'waiting' || b.status === 'running')))
      waiting.push({ kind: 'baseline', id: `baseline:${ev.id}`, at: ev.createdAt, evaluation: { id: ev.id, name: ev.name } });
  }
  // A goal that reached its score while its evaluation's final test has not run: one card for each evaluation, until a new best.
  const asked = new Set<string>();
  for (const g of [...goals].filter((x) => x.status === 'reached').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))) {
    for (const f of g.report?.finals ?? []) {
      const ev = getEvaluation(db, f.evaluation);
      const stand = stands.find((x) => x.id === f.evaluation);
      if (!ev || !stand || asked.has(ev.id) || !ev.final || ev.finals > 0 || stand.final.state !== 'unrun') continue;
      if (later[ev.id] && later[ev.id] === stand.best?.id) continue;
      asked.add(ev.id);
      waiting.push({ kind: 'final', id: `final:${ev.id}`, at: g.endedAt ?? g.startedAt, evaluation: { id: ev.id, name: ev.name }, goal: { key: g.key, title: goalTitle(g) } });
    }
  }
  for (const e of evolutions)
    if (e.status === 'paused' && e.why) waiting.push({ kind: 'paused', id: `paused:${e.id}`, at: e.endedAt ?? e.startedAt ?? e.createdAt, evolution: { id: e.id, title: clip((e.aim?.trim() || e.files.join(', ')).replace(/\s+/g, ' '), 120), tried: e.tried, candidates: e.candidates }, reason: clip(e.why, 400) });
  // Runs held at the limit on agents' GPU hours: one card for them all.
  const use = ceilingUse(db);
  // (A copy of a run another machine holds is under that machine's limit: it shows among what waits below.)
  // (A search's scores have a card of their own, which lets the whole search go.)
  const held = runs.filter((r) => r.held && !r.remote && !r.evolution && (r.status === 'queued' || r.status === 'waiting')).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (held.length && use.ceiling !== undefined) waiting.push({ kind: 'held', id: `held:${held[0].id}`, at: held[0].createdAt, runs: held.map((r) => r.id), ceiling: use.ceiling });
  if (use.ceiling !== undefined)
    for (const e of evolutions)
      if (e.waits?.startsWith(HELD_WHY)) waiting.push({ kind: 'held-search', id: `held:${e.id}`, at: e.startedAt ?? e.createdAt, evolution: { id: e.id, title: clip((e.aim?.trim() || e.files.join(', ')).replace(/\s+/g, ' '), 120) }, ceiling: use.ceiling });
  // What holds runs back comes first (held runs, then sealed files that differ), the rest newest first.
  const first = (w: ResearchWait) => (w.kind === 'held' || w.kind === 'held-search' ? 2 : w.kind === 'sealed' ? 1 : 0);
  waiting.sort((a, b) => first(b) - first(a) || b.at - a.at);

  // ---- since the person last looked
  const news: ResearchNews[] = [];
  for (const e of projectFindings(db, repoRoot(s.folder) ?? s.folder)) {
    if (e.createdAt < since || !e.finding) continue;
    news.push({ kind: 'finding', id: `finding:${e.id}`, at: e.createdAt, number: e.id, verdict: e.finding.verdict, statement: e.finding.statement, ...(e.finding.learned ? { learned: e.finding.learned } : {}) });
  }
  news.push(...endedNews(db, runs, since));
  for (const e of evolutions) {
    const cands = candidatesOf(db, e.id).filter((c) => (c.status === 'scored' || c.status === 'failed') && (c.endedAt ?? 0) >= since);
    if (!cands.length || e.status === 'stopped') continue;
    const top = e.best ? cands.find((c) => c.id === e.best) : undefined;
    news.push({
      kind: 'search',
      id: `search:${e.id}:${Math.max(...cands.map((c) => c.endedAt ?? 0))}`,
      at: Math.max(...cands.map((c) => c.endedAt ?? 0)),
      evolution: e.id,
      name: clip((e.aim?.trim() || e.files.join(', ')).replace(/\s+/g, ' '), 60),
      tried: cands.length,
      ...(top?.full && top.gain !== undefined ? { best: { mean: top.full.mean, gain: top.gain } } : {}),
    });
  }
  for (const g of goals) {
    const done = g.rounds.filter((r) => r.n > 0 && r.endedAt >= since);
    const last = done[done.length - 1];
    if (!last) continue;
    const num = g.contract.checks.find((c) => (c.kind === 'measure' || c.kind === 'score') && last.results.some((r) => r.id === c.id && r.value !== undefined));
    const h = holding({ rounds: [last], best: last.n, contract: g.contract });
    news.push({
      kind: 'goal',
      id: `goal:${g.key}:${last.n}`,
      at: last.endedAt,
      session: g.key,
      title: goalTitle(g),
      round: last.n,
      rounds: g.contract.limits.rounds,
      ...(num ? { value: last.results.find((r) => r.id === num.id)!.value, ...(num.unit ? { unit: num.unit } : {}) } : {}),
      holds: h.holds,
      of: h.of,
    });
  }
  for (const ev of evals) {
    const n = bestNews(db, ev, since);
    if (n) news.push(n);
  }
  news.sort((a, b) => b.at - a.at);

  // ---- where it stands
  const evaluations = stands.sort((a, b) => b.scoredAt - a.scoredAt || a.name.localeCompare(b.name));
  const finds = projectFindings(db, repoRoot(s.folder) ?? s.folder);
  const count = (v: string) => finds.filter((e) => e.finding?.verdict === v).length;

  // ---- what runs and waits
  const infos = listInfo(db);
  const byJob = new Map<string, JobEntry>((o.jobs?.running ?? []).map((j) => [j.id, j]));
  const active: ResearchRun[] = runs
    .filter((r) => (r.status === 'running' || r.status === 'starting' || r.status === 'queued' || r.status === 'waiting') && isExperimentRun(r))
    .sort((a, b) => Number(b.status === 'running' || b.status === 'starting') - Number(a.status === 'running' || a.status === 'starting') || (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt))
    .map((r) => {
      const j = byJob.get(`run:${r.id}`);
      const p = r.metrics?.progress;
      const fraction = j?.progress?.fraction ?? (p && p.total > 0 ? p.done / p.total : undefined);
      return {
        id: r.id,
        name: r.name || r.id,
        ...(r.group ? { experiment: infos.get(r.group)?.title?.trim() || r.group } : {}),
        status: r.status,
        ...(r.status === 'waiting' && r.startsAbout ? { startsAbout: r.startsAbout } : {}),
        ...(r.why ? { why: r.why } : {}),
        ...(r.clusterJob ? { clusterJob: r.clusterJob } : {}),
        gpus: r.gpuIds?.length || r.gpus || 0,
        ...(r.startedAt ? { startedAt: r.startedAt } : {}),
        ...(fraction !== undefined || j?.progress?.text ? { progress: { ...(fraction !== undefined ? { fraction } : {}), ...(j?.progress?.text ? { text: j.progress.text } : {}) } } : {}),
        ...(j?.estimate?.endsAt ? { endsAt: j.estimate.endsAt } : {}),
      };
    });
  // The prices may not have been read yet: without them the first look would say the cost is not known.
  // Not for long: a computer that cannot reach the price list must not keep the page waiting for it.
  await Promise.race([ratesReady(db, sessionTokens(db, s.id, now - FIRST_LOOK_MS).map((r) => r.model)), new Promise((r) => setTimeout(r, PRICES_WAIT_MS).unref?.())]);
  const week = weekSessions(db, s.id, now - FIRST_LOOK_MS);

  return {
    at: now,
    seen,
    since,
    waiting,
    news,
    evaluations,
    findings: { held: count('supported'), didNot: count('refuted'), unclear: count('unclear'), open: count('open') },
    work: {
      runs: active,
      searches: evolutions
        .filter((e) => e.status === 'starting' || e.status === 'running')
        .map((e) => ({ id: e.id, title: clip((e.aim?.trim() || e.files.join(', ')).replace(/\s+/g, ' '), 100), tried: e.tried, candidates: e.candidates, ...(e.waits ? { waits: e.waits } : {}) })),
      goals: goals
        .filter((g) => !goalOver(g.status) && !goalWaits(g.status) && g.status !== 'asking' && g.status !== 'drafting')
        .map((g) => ({ key: g.key, session: title(g.key), title: clip(goalTitle(g), 100), ...(g.round !== undefined ? { round: g.round } : {}), rounds: g.contract.limits.rounds, status: g.status })),
    },
    week: { gpuHours: gpuHours(runs.filter(isExperimentRun), now - FIRST_LOOK_MS, now), usd: week.usd, unpriced: week.unpriced, sessions: week.sessions, ...(use.ceiling !== undefined ? { agents: { used: use.used, ceiling: use.ceiling } } : {}) },
    folder: s.folder,
  };
}

// ---- routes ----------------------------------------------------------------------------------------------------------

/** The three routes, on the projects' feature. `jobsList` reads the Jobs section's list (left out in a test). */
export function researchRoutes(d: Deps, jobsList?: () => JobsList | undefined) {
  const space = (req: { params: unknown }) => {
    const s = spaceById(d.db, String((req.params as { id: string }).id));
    if (!s) throw new HttpError(404, 'No such project');
    if (isGroup(s)) throw new HttpError(404, 'A group of projects has no Research tab: ask for one of its projects');
    return s;
  };
  d.app.get('/api/projects/:id/research', async (req) => {
    const s = space(req);
    let jobs: JobsList | undefined;
    try {
      jobs = jobsList?.();
    } catch {}
    const asked = Number((req.query as { since?: string }).since);
    return researchBrief(d, s, { jobs, internal: isInternal(req), ...(Number.isFinite(asked) && asked > 0 ? { since: asked } : {}) });
  });
  d.app.post('/api/projects/:id/research/seen', async (req) => {
    const s = space(req);
    const now = Date.now();
    const given = Number(((req.body ?? {}) as { at?: unknown }).at);
    // When the brief the person saw was read (so what came after it is still new), never in the future and never going back.
    const at = Number.isFinite(given) && given > 0 ? Math.min(given, now) : now;
    const before = Number(kvGet(d.db, seenKey(s.id))) || 0;
    const seen = Math.max(at, before);
    kvSet(d.db, seenKey(s.id), String(seen));
    return { seen };
  });
  d.app.post('/api/projects/:id/research/later', async (req) => {
    const s = space(req);
    const id = String(((req.body ?? {}) as { evaluation?: unknown }).evaluation ?? '');
    const ev = getEvaluation(d.db, id);
    if (!ev || !inside(ev.cwd, s.folder)) throw new HttpError(404, 'No such evaluation in this project');
    const stand = await standOf(d.db, ev, false);
    let later: Record<string, string> = {};
    try {
      later = JSON.parse(kvGet(d.db, laterKey(s.id)) ?? '{}');
    } catch {}
    // Until a new best: the card comes back when the best score is another one.
    later[ev.id] = stand.best?.id ?? '';
    kvSet(d.db, laterKey(s.id), JSON.stringify(later));
    return { ok: true };
  });
}
