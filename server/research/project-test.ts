// Checks for a project's Research tab (project.ts): which projects have research in them; each source of "Waiting for
// you" (a question with choices, one without, a goal's three waits and its question, sealed files that differ, a missing
// baseline, a final test after a goal reached its score, a paused search) and their order, "Not yet" until a new best;
// what is new since the person last looked (findings, runs that ended, failures that share a reason and a setting, a
// search, a goal's round, a new best) on a first visit and after the last look; how an evaluation stands (best by
// either direction, failed scores, the final test hidden from agents); what runs and waits; the week's GPU hours and
// cost; and the routes (seen never goes back, an agent through app_api). A scratch database and no GPU.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/research/project-test.ts
//   DATA_DIR=/tmp/hydor-test-research-project CUDA_VISIBLE_DEVICES= node dist/dev/project-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { bestSteps } from '../../shared/project-research.ts';
import type { ResearchBrief } from '../../shared/project-research.ts';
import type { RunRecord } from '../../shared/experiments.ts';
import type { GoalState } from '../../shared/goals.ts';
import type { InboxItem } from '../../shared/inbox.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { openDb } from '../db.ts';
import { createEvaluation, listScores } from '../experiments/evaluations.ts';
import { insertRun, markRun, saveInfo, setGroupArchived, updateRun } from '../experiments/records.ts';
import type { Deps } from '../features/types.ts';
import { internalHeaders } from '../internal.ts';
import { recordFinding } from '../memory/findings.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { saveGoal, type StoredGoal } from '../goals/store.ts';
import { createSpace } from '../spaces/index.ts';
import { researchProjects } from './has.ts';
import { gpuHours, researchBrief, researchRoutes, sharedFailure, weekSessions } from './project.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
if (process.env.CUDA_VISIBLE_DEVICES !== '') {
  console.error('Run with CUDA_VISIBLE_DEVICES= (empty): these tests never use a GPU.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-research-project-test-')));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 26, 9, 0);
const ago = (h: number) => NOW - h * HOUR;

// ---- fixtures ---------------------------------------------------------------------------------------------------------

const folder = (name: string, files: Record<string, string> = {}) => {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), t);
  return dir;
};
const retriever = folder('retriever', { 'eval.py': 'print("ndcg=0.4")\n' });
const quiet = folder('quiet');
const runsOnly = folder('runs-only');
const findingsOnly = folder('findings-only');
const group = folder('group');
const space = createSpace(db, { name: 'Dense retriever', folder: retriever });
const quietSpace = createSpace(db, { name: 'Quiet', folder: quiet });
const runsSpace = createSpace(db, { name: 'Runs only', folder: runsOnly });
const findingsSpace = createSpace(db, { name: 'Findings only', folder: findingsOnly });
const groupSpace = createSpace(db, { name: 'Together', folder: group, members: [space.id] });

let inbox: InboxItem[] = [];
const titles: Record<string, string> = { 's-pre': 'Pretraining for long queries', 's-goal': 'Beat the baseline', 's-other': 'Elsewhere' };
const sessions = { summary: (k: string) => (titles[k] ? { title: titles[k] } : null), inbox: () => inbox };
const deps = { db, sessions: sessions as any, broadcast: () => {} } as unknown as Deps;
for (const k of ['s-pre', 's-goal']) setSessionExtra(db, k, { space: space.id });
setSessionExtra(db, 's-other', { space: quietSpace.id });

const ev = await createEvaluation(deps, { name: 'Dev queries, nDCG@10', cwd: retriever, command: 'python eval.py --seed {seed}', metric: 'ndcg', better: 'higher', protect: ['eval.py'], seeds: [1, 2, 3], final: { command: 'python final.py' } });
let n = 0;
/** A score row written straight in (the real ones run through tmux). */
const score = (kind: 'score' | 'baseline' | 'final', o: { at: number; mean?: number; status?: 'done' | 'failed'; commit?: string; seal?: number; std?: number; evaluation?: string }) => {
  const id = `sc${++n}`;
  const mean = o.mean;
  const info = { folder: retriever, runs: [], seeds: [1, 2, 3], values: mean === undefined ? [] : [mean - 0.001, mean, mean + 0.001], ...(mean !== undefined ? { mean, std: o.std ?? 0.001 } : {}), by: { who: 'you' }, ...(o.commit ? { commit: o.commit } : {}) };
  db.prepare('insert into exp_scores (id, eval, seal, kind, status, info, created_at, ended_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(id, o.evaluation ?? ev.id, o.seal ?? ev.seal.n, kind, o.status ?? 'done', JSON.stringify(info), o.at, o.at + 1000);
  return id;
};

let rn = 0;
const run = (o: { from?: string; status: RunRecord['status']; cwd?: string; group?: string; name?: string; params?: Record<string, string | number>; why?: string; gpus?: number; session?: string; start?: number; end?: number; oom?: boolean; created?: number; project?: string; tags?: string[]; env?: Record<string, string> }) => {
  const id = `r${++rn}`;
  insertRun(db, { id, status: o.status, why: o.why, createdAt: o.created ?? (o.start ?? NOW) - 1000, spec: { command: 'python train.py', cwd: o.cwd ?? retriever, ...(o.group ? { group: o.group } : {}), ...(o.name ? { name: o.name } : {}), ...(o.params ? { params: o.params } : {}), ...(o.gpus ? { gpus: o.gpus } : {}), ...(o.project ? { project: o.project } : {}), ...(o.tags ? { tags: o.tags } : {}), ...(o.env ? { env: o.env } : {}) }, info: { ...(o.session ? { startedBy: { session: o.session } } : {}), ...(o.from ? { from: o.from } : {}) } });
  updateRun(db, id, { ...(o.start ? { startedAt: o.start } : {}), ...(o.end ? { endedAt: o.end } : {}) });
  if (o.oom) db.prepare("insert into exp_events (run, at, kind, text) values (?, ?, 'oom', 'out of memory')").run(id, o.end ?? NOW);
  return id;
};

const brief = (o: { now?: number; internal?: boolean } = {}): Promise<ResearchBrief> => researchBrief(deps, space, { now: NOW, ...o });
const kinds = (b: ResearchBrief) => b.waiting.map((w) => w.kind);

// ---- which projects have research -------------------------------------------------------------------------------------

test('a project has research with an evaluation, a run in its folder, or a finding; no other does, and a group has none', async () => {
  run({ status: 'done', cwd: path.join(runsOnly, 'sub'), start: ago(30), end: ago(29) });
  await recordFinding(db, findingsOnly, { statement: 'It helps', verdict: 'open' }, { source: 'agent' });
  const has = researchProjects(db, [space, quietSpace, runsSpace, findingsSpace, groupSpace]);
  assert.deepEqual([...has].sort(), [space.id, runsSpace.id, findingsSpace.id].sort());
});

// ---- waiting for you ---------------------------------------------------------------------------------------------------

const ask = (o: Partial<InboxItem> & { id: string }): InboxItem => ({ kind: 'question', title: 'A question', key: 's-pre', session: titles['s-pre'], agent: 'claude', at: ago(2), path: '/s/x', ...o }) as InboxItem;
const approval = (id: string, questions: any[], kind: any = 'question') => ({ id, title: 'Claude has a question', kind, options: [{ id: 'answer', label: 'Send' }], questions, createdAt: ago(2) }) as any;

test('nothing waits: the brief says so by an empty list', async () => {
  inbox = [];
  assert.deepEqual((await brief()).waiting.filter((w) => w.kind === 'ask' || w.kind === 'goal'), []);
});

test('a question of one single choice offers its choices; one with two parts, or several choices at once, only the session', async () => {
  inbox = [
    ask({ id: 'a1', approval: approval('p1', [{ id: 'q', question: 'Which training data for the 88M model?', options: [{ label: 'Full mix', description: 'about 14 GPU h' }, { label: 'Complement mix' }] }]) }),
    ask({ id: 'a2', at: ago(3), approval: approval('p2', [{ id: 'q1', question: 'One?', options: [{ label: 'x' }] }, { id: 'q2', question: 'Two?', options: [{ label: 'y' }] }]) }),
    ask({ id: 'a3', at: ago(4), approval: approval('p3', [{ id: 'q', question: 'Which ones?', multiSelect: true, options: [{ label: 'x' }, { label: 'y' }] }]) }),
    ask({ id: 'a4', at: ago(5), key: 's-other', session: 'Elsewhere', approval: approval('p4', [{ id: 'q', question: 'Not mine', options: [{ label: 'x' }] }]) }),
    ask({ id: 'a5', kind: 'approval', at: ago(6), title: 'Run: rm -rf /tmp/x', approval: { id: 'p5', title: 'Run: rm -rf /tmp/x', kind: 'command', detail: 'rm -rf /tmp/x', options: [{ id: 'allow', label: 'Allow' }] } as any }),
  ];
  const asks = (await brief()).waiting.filter((w) => w.kind === 'ask') as Extract<ResearchBrief['waiting'][number], { kind: 'ask' }>[];
  assert.deepEqual(asks.map((a) => a.id), ['a1', 'a2', 'a3', 'a5'], 'those of the project, newest first');
  assert.equal(asks[0].title, 'Which training data for the 88M model?');
  assert.deepEqual(asks[0].question, { id: 'q', choices: [{ label: 'Full mix', description: 'about 14 GPU h' }, { label: 'Complement mix' }] });
  assert.equal(asks[0].approval, 'p1');
  assert.equal(asks[1].question, undefined, 'two parts: only the link');
  assert.equal(asks[1].detail, 'and 1 more question');
  assert.equal(asks[2].question, undefined, 'several choices at once: only the link');
  assert.equal(asks[3].title, 'Run: rm -rf /tmp/x');
  assert.equal(asks[3].session.title, 'Pretraining for long queries');
  inbox = [];
});

const goal = (key: string, o: Partial<GoalState>): StoredGoal =>
  ({
    key,
    id: `g-${key}`,
    status: 'working',
    contract: { objective: 'Beat the baseline by 0.02', title: 'Beat the baseline by 0.02', checks: [{ id: 'c1', kind: 'score', label: 'beats', evaluation: ev.id, target: { op: '>=', value: 0.432 }, unit: undefined }], protect: [], limits: { rounds: 12 } },
    settings: { asks: 'forks', noAnswerMin: 10 },
    rounds: [],
    undo: false,
    rules: [],
    next: [],
    dropped: [],
    startedAt: ago(30),
    spentUsd: 0,
    activeMs: 0,
    ...o,
    _: { spentAtStart: 0 },
  }) as StoredGoal;

test('a goal that waits for the person shows with its reason; one at work does not; its question shows for an asking goal', async () => {
  saveGoal(db, goal('s-goal', { status: 'needs-you', reason: 'It needs a token only you have' }));
  let w = (await brief()).waiting;
  assert.deepEqual(kinds({ waiting: w } as ResearchBrief).filter((k) => k === 'goal'), ['goal']);
  const g = w.find((x) => x.kind === 'goal') as Extract<(typeof w)[number], { kind: 'goal' }>;
  assert.equal(g.status, 'needs-you');
  assert.equal(g.reason, 'It needs a token only you have');
  assert.equal(g.title, 'Beat the baseline by 0.02');
  for (const status of ['agreeing', 'paused'] as const) {
    saveGoal(db, goal('s-goal', { status, reason: status === 'paused' ? 'You paused it' : undefined }));
    assert.equal((await brief()).waiting.some((x) => x.kind === 'goal' && x.status === status), true, status);
  }
  saveGoal(db, goal('s-goal', { status: 'asking', question: { id: 'q1', kind: 'way', question: 'Which way next?', ways: [], pick: 0, askedAt: ago(1) } }));
  const asking = (await brief()).waiting.find((x) => x.kind === 'goal') as any;
  assert.equal(asking.title, 'Which way next?');
  saveGoal(db, goal('s-goal', { status: 'working', round: 3 }));
  assert.equal((await brief()).waiting.some((x) => x.kind === 'goal'), false, 'a goal at work asks nothing of them');
});

test('an evaluation with no baseline asks for one; a baseline being measured does not', async () => {
  let b = await brief();
  assert.deepEqual(b.waiting.filter((w) => w.kind === 'baseline').map((w) => (w as any).evaluation.name), ['Dev queries, nDCG@10']);
  const id = score('baseline', { at: ago(1), status: 'done' as any });
  db.prepare("update exp_scores set status = 'running' where id = ?").run(id);
  b = await brief();
  assert.equal(b.waiting.some((w) => w.kind === 'baseline'), false, 'it is being measured');
  db.prepare('delete from exp_scores where id = ?').run(id);
  const base = score('baseline', { at: ago(300), mean: 0.412 });
  db.prepare('update exp_evals set baseline = ? where id = ?').run(base, ev.id);
  b = await brief();
  assert.equal(b.waiting.some((w) => w.kind === 'baseline'), false);
});

test('sealed files that differ come first, with how many and which', async () => {
  inbox = [ask({ id: 'a1', at: NOW, approval: approval('p1', [{ id: 'q', question: 'Which?', options: [{ label: 'x' }] }]) })];
  db.prepare('update exp_evals set state = ? where id = ?').run(JSON.stringify({ ok: false, checkedAt: ago(1), changed: [{ path: 'eval.py', what: 'changed' }, { path: 'data/test.csv', what: 'missing' }], more: 1 }), ev.id);
  const b = await brief();
  assert.equal(b.waiting[0].kind, 'sealed', 'what holds runs back first, though the question is newer');
  assert.deepEqual({ changed: (b.waiting[0] as any).changed, names: (b.waiting[0] as any).names }, { changed: 3, names: ['eval.py', 'data/test.csv'] });
  assert.equal(b.evaluations[0].changed, true);
  db.prepare('update exp_evals set state = ? where id = ?').run(JSON.stringify({ ok: true, checkedAt: NOW, changed: [] }), ev.id);
  inbox = [];
});

test('a goal that reached its score asks for the final test until it is run, and Not yet hides it until a new best', async () => {
  score('score', { at: ago(50), mean: 0.425 });
  const best = score('score', { at: ago(40), mean: 0.447 });
  saveGoal(db, goal('s-goal', { status: 'reached', endedAt: ago(8), report: { summary: 'Done', finals: [{ evaluation: ev.id, name: ev.name }] } }));
  const b = await brief();
  const f = b.waiting.find((w) => w.kind === 'final') as any;
  assert.ok(f, 'the card');
  assert.equal(f.goal.key, 's-goal');
  assert.equal(f.evaluation.id, ev.id);
  assert.equal(b.evaluations[0].final.state, 'unrun');
  // Not yet (the route), then a new best brings it back.
  const http = Fastify();
  http.setErrorHandler((err: Error, _r, reply) => void reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
  researchRoutes({ ...deps, app: http } as Deps);
  await http.ready();
  const post = (url: string, body?: unknown, agent = false) => http.inject({ method: 'POST', url, headers: { ...(agent ? internalHeaders() : {}), 'content-type': 'application/json' }, payload: JSON.stringify(body ?? {}) });
  assert.equal((await post(`/api/projects/${space.id}/research/later`, { evaluation: ev.id })).statusCode, 200);
  assert.equal((await post(`/api/projects/${space.id}/research/later`, { evaluation: 'nope' })).statusCode, 404);
  assert.equal((await brief()).waiting.some((w) => w.kind === 'final'), false, 'hidden');
  score('score', { at: ago(5), mean: 0.431 });
  assert.equal((await brief()).waiting.some((w) => w.kind === 'final'), false, 'a worse score is no new best');
  score('score', { at: ago(4), mean: 0.451 });
  assert.equal((await brief()).waiting.some((w) => w.kind === 'final'), true, 'a new best brings it back');
  // Once the final test has run it is not asked for.
  db.prepare('update exp_evals set finals = 1 where id = ?').run(ev.id);
  assert.equal((await brief()).waiting.some((w) => w.kind === 'final'), false);
  db.prepare('update exp_evals set finals = 0 where id = ?').run(ev.id);
  assert.equal(best.length > 0, true);
  await http.close();
});

test('a search the app paused, with its reason, waits for them; one they paused does not', async () => {
  const evo = (id: string, status: string, why?: string) =>
    db.prepare('insert into exp_evolutions (id, evaluation, status, data, rng, created_at, updated_at) values (?, ?, ?, ?, 0, ?, ?)').run(
      id,
      ev.id,
      status,
      JSON.stringify({ evo: { id, evaluation: ev.id, from: retriever, files: ['rank.py'], aim: 'Raise nDCG@10 by reranking better', candidates: 200, seal: ev.seal.n, startCommit: 'abc', tried: 61, failed: 2, calls: 63, activeMs: 0, by: { who: 'you' }, ...(why ? { why } : {}) }, inner: {} }),
      ago(60),
      ago(1),
    );
  evo('v1', 'paused', 'No model could be asked: the helper model’s account reached its limit');
  evo('v2', 'paused');
  const w = (await brief()).waiting.filter((x) => x.kind === 'paused') as any[];
  assert.equal(w.length, 1);
  assert.equal(w[0].evolution.id, 'v1');
  assert.deepEqual({ tried: w[0].evolution.tried, of: w[0].evolution.candidates, title: w[0].evolution.title }, { tried: 61, of: 200, title: 'Raise nDCG@10 by reranking better' });
  db.prepare("update exp_evolutions set status = 'running' where id = 'v1'").run();
  assert.equal((await brief()).waiting.some((x) => x.kind === 'paused'), false);
  assert.equal((await brief()).work.searches.length, 1, 'running, it is at work');
  db.prepare("delete from exp_evolutions where id in ('v1', 'v2')").run();
});

// ---- since you last looked ---------------------------------------------------------------------------------------------

test('on a first visit the last seven days; findings, runs, goals, a new best and searches since, newest first', async () => {
  await recordFinding(db, retriever, { statement: 'Hard negatives from BM25 raise nDCG@10', verdict: 'supported', learned: 'Gain over 3 seeds.' }, { source: 'agent', at: ago(7) });
  await recordFinding(db, retriever, { statement: 'A cross-encoder is fast enough', verdict: 'refuted' }, { source: 'agent', at: ago(24 * 9) });
  const ids = [1, 2, 3, 4, 5].map((i) => run({ status: i <= 3 ? 'done' : 'failed', group: 'pre50b', name: `p${i}`, start: ago(20), end: ago(2 + i / 10), session: i % 2 ? 's-pre' : 's-goal', params: { batch: i <= 3 ? 512 : 4096 }, why: i > 3 ? 'CUDA out of memory' : undefined, oom: i > 3 }));
  assert.equal(ids.length, 5);
  saveGoal(db, goal('s-goal', { status: 'working', round: 5, rounds: [{ n: 4, startedAt: ago(4), endedAt: ago(3), results: [{ id: 'c1', holds: false, value: 0.431, closeness: 0.5, ms: 1 }], score: 0.5, outcome: 'kept', usd: 0 }] as any }));
  const b = await brief();
  assert.equal(b.seen, null);
  assert.equal(b.since, NOW - 7 * 24 * HOUR);
  const k = b.news.map((x) => x.kind);
  assert.ok(k.includes('finding') && k.includes('runs') && k.includes('goal') && k.includes('best'), k.join());
  assert.equal(b.news.filter((x) => x.kind === 'finding').length, 1, 'the older finding is not "since"');
  assert.deepEqual(b.news.map((x) => x.at), [...b.news.map((x) => x.at)].sort((a, c) => c - a), 'newest first');
  const g = b.news.find((x) => x.kind === 'goal') as any;
  assert.deepEqual({ round: g.round, rounds: g.rounds, value: g.value, holds: g.holds, of: g.of }, { round: 4, rounds: 12, value: 0.431, holds: 0, of: 1 });
  const best = b.news.find((x) => x.kind === 'best') as any;
  assert.equal(best.mean, 0.451);
  assert.equal(best.against?.verdict, 'better');
  assert.equal(b.findings.held, 1);
});

test('after the last look only what is newer: and Seen never goes back', async () => {
  const http = Fastify();
  researchRoutes({ ...deps, app: http } as Deps);
  await http.ready();
  const post = (body: unknown) => http.inject({ method: 'POST', url: `/api/projects/${space.id}/research/seen`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) });
  const first = Date.now() - 1000;
  assert.equal((await post({ at: first })).json().seen, first);
  assert.equal((await post({ at: first - 5000 })).json().seen, first, 'an older time does not take it back');
  const future = (await post({ at: Date.now() + 10 * HOUR })).json().seen;
  assert.ok(future <= Date.now(), 'never in the future');
  const b = await researchBrief(deps, space, { now: future + 10 });
  assert.equal(b.seen, future);
  assert.equal(b.since, future);
  assert.deepEqual(b.news, [], 'nothing new since');
  assert.equal((await http.inject({ method: 'POST', url: '/api/projects/nope/research/seen', payload: '{}', headers: { 'content-type': 'application/json' } })).statusCode, 404);
  assert.equal((await http.inject({ method: 'POST', url: `/api/projects/${groupSpace.id}/research/seen`, payload: '{}', headers: { 'content-type': 'application/json' } })).statusCode, 404, 'a group has no Research tab');
  db.prepare('delete from kv where k = ?').run(`research.seen.${space.id}`);
  await http.close();
});

test('failed runs of one experiment for one reason are one line, with the setting they share when the others did not have it', () => {
  const rs = (specs: { status: RunRecord['status']; params?: Record<string, string | number>; why?: string }[]): RunRecord[] => specs.map((s, i) => ({ id: `x${i}`, command: '', cwd: '', createdAt: 0, ...s }) as RunRecord);
  const oom = (r: RunRecord) => /memory/.test(r.why ?? '');
  const failed = rs([
    { status: 'failed', params: { batch: 4096, lr: 1 }, why: 'out of memory' },
    { status: 'failed', params: { batch: 4096, lr: 2 }, why: 'out of memory' },
    { status: 'failed', params: { batch: 4096, lr: 3 }, why: 'out of memory' },
    { status: 'failed', params: { batch: 4096, lr: 4 }, why: 'out of memory' },
  ]);
  const ok = rs([{ status: 'done', params: { batch: 512, lr: 1 } }]);
  const s = sharedFailure(failed, ok, oom)!;
  assert.deepEqual({ count: s.count, reason: s.reason, setting: s.setting }, { count: 4, reason: 'oom', setting: { name: 'batch', value: '4096' } });
  assert.equal(sharedFailure(failed, [], oom)!.setting, undefined, 'with nothing to compare, no setting is blamed');
  assert.equal(sharedFailure(failed, rs([{ status: 'done', params: { batch: 4096, lr: 9 } }]), oom)!.setting, undefined, 'one that went well had it too');
  const other = sharedFailure(rs([{ status: 'failed', why: 'Exit code 1\nTraceback' }, { status: 'failed', why: 'Exit code 1' }, { status: 'failed', why: 'killed' }]), [], oom)!;
  assert.deepEqual({ count: other.count, reason: other.reason, why: other.why }, { count: 2, reason: 'other', why: 'Exit code 1' });
  assert.equal(sharedFailure(rs([{ status: 'failed', why: 'a' }, { status: 'failed', why: 'b' }]), [], oom), null, 'no two alike');
});

test('the experiment line counts done, failed and the rest, and the sessions that started them', async () => {
  const b = await brief();
  const l = b.news.find((x) => x.kind === 'runs' && x.experiment === 'pre50b') as any;
  assert.deepEqual({ total: l.total, done: l.done, failed: l.failed, other: l.other, sessions: l.sessions }, { total: 5, done: 3, failed: 2, other: 0, sessions: 2 });
  // The two that ran out of memory with batches of 4096 are not four, but two alike are a line.
  const f = b.news.find((x) => x.kind === 'failures') as any;
  assert.deepEqual({ count: f.count, reason: f.reason, setting: f.setting, experiment: f.experiment }, { count: 2, reason: 'oom', setting: { name: 'batch', value: '4096' }, experiment: 'pre50b' });
});

// ---- where it stands -----------------------------------------------------------------------------------------------------

test('an evaluation stands with its scores oldest first, its best by the direction, its baseline and the failed ones', async () => {
  score('score', { at: ago(45), status: 'failed' });
  const b = await brief();
  const e = b.evaluations[0];
  assert.deepEqual(e.scores.map((s) => s.mean), [0.425, 0.447, 0.431, 0.451]);
  assert.equal(e.best?.mean, 0.451);
  assert.equal(e.baseline?.mean, 0.412);
  assert.deepEqual(e.failed.length, 1);
  assert.equal(e.better, 'higher');
  assert.equal(e.final.state, 'unrun');
  assert.deepEqual(bestSteps(e.scores, 'higher'), [0, 1, 3]);
  assert.deepEqual(bestSteps(e.scores, 'lower'), [0]);
  assert.deepEqual(bestSteps(e.scores, 'higher', 0.43), [1, 3], 'a score no better than the baseline is no step');
  assert.deepEqual(bestSteps([{ mean: 5 }, { mean: 5 }, { mean: 3 }, { mean: 4 }, { mean: 2 }], 'lower'), [0, 2, 4], 'a tie is no step');
});

test('the final test result is the person’s alone: an agent gets only whether it ran', async () => {
  score('final', { at: ago(1), mean: 0.44 });
  db.prepare('update exp_evals set finals = 1 where id = ?').run(ev.id);
  assert.equal((await brief()).evaluations[0].final.mean, 0.44);
  const agent = (await brief({ internal: true })).evaluations[0].final;
  assert.deepEqual(agent, { state: 'done' });
  assert.equal(listScores(db, ev.id, ['final']).length, 1);
});

// ---- what runs and waits, and the week ---------------------------------------------------------------------------------------

test('running and waiting runs, running first, with how far and when the Jobs section says they end; evaluation scoring runs are left out', async () => {
  const a = run({ status: 'running', name: 'pre50b_30m', gpus: 4, start: ago(3) });
  run({ status: 'waiting', name: 'control', why: 'Waiting for 1 GPU', gpus: 1, created: ago(6) });
  run({ status: 'queued', name: 'wider sweep', why: 'Waits for the night (from 23:00)', gpus: 1, created: ago(5) });
  const scoring = run({ status: 'running', name: 'score', start: ago(1) });
  db.prepare("update exp_runs set spec = json_set(spec, '$.tags', json('[\"evaluation\"]'), '$.env', json('{\"HYDOR_EVALUATION\":\"e\"}')) where id = ?").run(scoring);
  const jobs = { running: [{ id: `run:${a}`, progress: { fraction: 0.61, at: NOW }, estimate: { endsAt: NOW + 5 * HOUR, source: 'progress', confidence: 'high' } }], queued: [], servers: [], ended: [], at: NOW } as any;
  const b = await researchBrief(deps, space, { now: NOW, jobs });
  assert.deepEqual(b.work.runs.map((r) => r.name), ['pre50b_30m', 'control', 'wider sweep']);
  assert.deepEqual({ gpus: b.work.runs[0].gpus, progress: b.work.runs[0].progress?.fraction, endsAt: b.work.runs[0].endsAt }, { gpus: 4, progress: 0.61, endsAt: NOW + 5 * HOUR });
  assert.equal(b.work.runs[2].why, 'Waits for the night (from 23:00)');
  assert.equal(b.work.goals.length, 1, 'the goal at work, with its round');
  assert.equal(b.work.goals[0].round, 5);
});

test('GPU hours are GPUs times hours inside the week; a run without a GPU counts none', () => {
  const r = (o: Partial<RunRecord>) => ({ ...o }) as RunRecord;
  const week = NOW - 168 * HOUR;
  assert.equal(gpuHours([r({ gpus: 4, startedAt: NOW - 2 * HOUR, endedAt: NOW })], week, NOW), 8);
  assert.equal(gpuHours([r({ gpus: 2, startedAt: NOW - HOUR })], week, NOW), 2, 'a run still going counts to now');
  assert.equal(gpuHours([r({ gpus: 2, gpuIds: [0, 1, 2], startedAt: NOW - HOUR, endedAt: NOW })], week, NOW), 3, 'the GPUs it held');
  assert.equal(gpuHours([r({ gpus: 1, startedAt: week - 10 * HOUR, endedAt: week + 2 * HOUR })], week, NOW), 2, 'only what is inside the week');
  assert.equal(gpuHours([r({ startedAt: NOW - 5 * HOUR, endedAt: NOW })], week, NOW), 0, 'no GPU');
  assert.equal(gpuHours([r({ gpus: 1, endedAt: NOW })], week, NOW), 0, 'never started');
});

test('the first brief on a computer waits for the model prices: it says what a later one says, "not known" only for a model with none', async () => {
  // As on a computer that has no price table yet: nothing kept, and a fetch that takes a moment.
  fs.rmSync(path.join(config.dataDir, 'model-prices.json'), { force: true });
  const priced = createSpace(db, { name: 'Priced', folder: folder('priced') });
  const worked = (key: string, model: string) => {
    setSessionExtra(db, key, { space: priced.id });
    db.prepare("insert into sessions (key, agent, id, path, model) values (?, 'claude', ?, '/x', ?)").run(key, key, model);
    db.prepare("insert into activity (key, root, agent, hour, tokens_in, tokens_out) values (?, ?, 'claude', ?, 1000000, 0)").run(key, key, Math.floor(ago(5) / HOUR));
  };
  worked('s-priced', 'test-model');
  const real = globalThis.fetch;
  const url = process.env.PRICES_URL;
  process.env.PRICES_URL = 'http://prices.invalid/table.json';
  globalThis.fetch = async () => {
    await new Promise((r) => setTimeout(r, 50));
    return new Response(JSON.stringify({ 'test-model': { input_cost_per_token: 3e-6, output_cost_per_token: 15e-6 } }));
  };
  try {
    const week = async () => {
      const { usd, unpriced } = (await researchBrief(deps, priced, { now: NOW })).week;
      return { usd, unpriced };
    };
    assert.deepEqual(await week(), { usd: 3, unpriced: false }, 'the first look');
    assert.deepEqual(await week(), { usd: 3, unpriced: false }, 'a later one');
    worked('s-unlisted', 'a-model-nobody-lists');
    assert.deepEqual(await week(), { usd: 3, unpriced: true }, 'really not known');
  } finally {
    globalThis.fetch = real;
    if (url === undefined) delete process.env.PRICES_URL;
    else process.env.PRICES_URL = url;
  }
});

test('the week counts the project’s sessions and what their models cost, by the hour', () => {
  const hour = Math.floor(ago(5) / HOUR);
  db.prepare("insert into sessions (key, agent, id, path, model) values ('s-pre', 'claude', 's-pre', '/x', 'claude-sonnet-4-5') on conflict(key) do nothing").run();
  const put = (key: string, root: string, h: number, i: number, o: number) => db.prepare('insert into activity (key, root, agent, hour, tokens_in, tokens_out) values (?, ?, ?, ?, ?, ?)').run(key, root, 'claude', h, i, o);
  put('s-pre', 's-pre', hour, 1000, 1000);
  put('s-goal', 's-goal', hour, 10, 10);
  put('s-goal', 's-goal', hour - 24 * 30, 5, 5);
  put('s-other', 's-other', hour, 999, 999);
  const w = weekSessions(db, space.id, NOW - 168 * HOUR);
  assert.equal(w.sessions, 2, 'the other project’s session and the old hour are not counted');
  assert.equal(typeof w.usd, 'number');
});

// ---- trials, start times, titles, and a run seen twice ------------------------------------------------------------------

test('a trial of a command is left out of the news, the failures, running and waiting and the GPU hours, and is no research', async () => {
  const trial = { tags: ['try'], env: { HYDOR_TRY: '1' } };
  const before = await brief();
  const hoursBefore = before.week.gpuHours;
  const shown = before.work.runs.length;
  // Three failed trials with one reason, one running, one waiting, each with GPUs for hours.
  for (let i = 0; i < 3; i++) run({ status: 'failed', group: 'trialed', name: `t${i}`, gpus: 2, start: ago(10), end: ago(6), why: 'CUDA out of memory', oom: true, ...trial });
  run({ status: 'running', name: 'try-running', gpus: 1, start: ago(1), ...trial });
  run({ status: 'waiting', name: 'try-waiting', why: 'Waiting for 1 GPU', ...trial });
  const b = await brief();
  assert.equal(b.news.some((n) => (n.kind === 'runs' || n.kind === 'failures') && n.group === 'trialed'), false, 'no news of trials');
  assert.equal(b.work.runs.length, shown, 'not among what runs and waits');
  assert.equal(b.week.gpuHours, hoursBefore, 'no GPU hours');
  // A project whose only run is a trial has no research.
  const lonely = createSpace(db, { name: 'Lonely', folder: folder('lonely') });
  run({ status: 'done', cwd: folder('lonely'), start: ago(3), end: ago(2), gpus: 1, ...trial });
  assert.equal(researchProjects(db, [lonely]).has(lonely.id), false, 'a trial is no research');
  run({ status: 'done', cwd: folder('lonely'), start: ago(3), end: ago(2), tags: ['evaluation'], env: { HYDOR_EVALUATION: 'gone' } });
  assert.equal(researchProjects(db, [lonely]).has(lonely.id), false, 'nor is a run that scores an evaluation (the evaluation itself counts, where it is)');
  run({ status: 'done', cwd: folder('lonely'), start: ago(3), end: ago(2) });
  assert.equal(researchProjects(db, [lonely]).has(lonely.id), true, 'a real run is');
});

test('a run that knows its project and is in its folder is counted once; a run that only names the project is its research too', async () => {
  const hoursBefore = (await brief()).week.gpuHours;
  const both = run({ status: 'done', group: 'twice', name: 'both', start: ago(3), end: ago(1), project: space.id, gpus: 1 });
  run({ status: 'done', group: 'twice', name: 'named', cwd: folder('elsewhere'), start: ago(3), end: ago(1), project: space.id });
  const b = await brief();
  const line = b.news.find((n) => n.kind === 'runs' && n.group === 'twice') as any;
  assert.equal(line.total, 2, 'two runs, not three');
  assert.equal(Math.round((b.week.gpuHours - hoursBefore) * 10) / 10, 2, 'one GPU for two hours, once: it is listed by its folder and by its project');
  const elsewhere = createSpace(db, { name: 'By name', folder: folder('by-name') });
  run({ status: 'done', cwd: folder('somewhere-else'), start: ago(3), end: ago(2), project: elsewhere.id });
  assert.equal(researchProjects(db, [elsewhere]).has(elsewhere.id), true, 'a run that names the project');
  assert.ok(both);
});

// ---- attempts, and what was archived -----------------------------------------------------------------------------------

test('a failure that an attempt then made good is not told as one to look at; one still open is', async () => {
  const fail = (name: string, o: Record<string, unknown> = {}) => run({ status: 'failed', group: 'again', name, start: ago(9), end: ago(8), why: 'CUDA out of memory', oom: true, ...o });
  // Two chains that ended well (one of them two attempts deep), and one failure nothing came after.
  const a = fail('a');
  run({ status: 'done', group: 'again', name: 'a2', from: a, created: ago(7), start: ago(7), end: ago(6) });
  const b1 = fail('b', { created: ago(9.5) });
  const b2 = fail('b2', { from: b1, created: ago(7), start: ago(6), end: ago(5) });
  run({ status: 'done', group: 'again', name: 'b3', from: b2, created: ago(4), start: ago(4), end: ago(3) });
  fail('c', { created: ago(9.4) });
  const news = (await brief()).news.filter((n) => (n.kind === 'runs' || n.kind === 'failures') && n.group === 'again') as any[];
  const line = news.find((n) => n.kind === 'runs');
  assert.deepEqual({ total: line.total, done: line.done, failed: line.failed, again: line.again, other: line.other }, { total: 6, done: 2, failed: 1, again: 3, other: 0 });
  assert.equal(news.some((n) => n.kind === 'failures'), false, 'one failure is left, and one is no pattern');
  // Started again and not finished yet: still a failure to look at.
  const d = run({ status: 'failed', group: 'open', name: 'd', start: ago(9), end: ago(8), why: 'Exit code 1' });
  run({ status: 'running', group: 'open', name: 'd2', from: d, created: ago(7), start: ago(7) });
  const open = (await brief()).news.find((n) => n.kind === 'runs' && n.group === 'open') as any;
  assert.deepEqual({ failed: open.failed, again: open.again }, { failed: 1, again: undefined });
});

test('archived runs are out of the news, running and waiting, the GPU hours and the check for research', async () => {
  const before = await brief();
  const away = createSpace(db, { name: 'Put aside', folder: folder('put-aside') });
  const only = run({ status: 'failed', group: 'aside', name: 'x1', cwd: folder('put-aside'), gpus: 1, start: ago(5), end: ago(3), why: 'Exit code 1', created: ago(6) });
  const second = run({ status: 'done', group: 'aside', name: 'x2', cwd: folder('put-aside'), from: only, created: ago(2.5), start: ago(2), end: ago(1), gpus: 1 });
  assert.equal(researchProjects(db, [away]).has(away.id), true);
  // The row's run archived: its earlier attempt goes with it.
  markRun(db, second, { archived: true });
  assert.equal(researchProjects(db, [away]).has(away.id), false, 'nothing but archived runs');
  const x = run({ status: 'done', group: 'aside', name: 'x3', gpus: 1, start: ago(4), end: ago(2) });
  const waits = run({ status: 'waiting', group: 'aside', name: 'x4', why: 'Waiting for 1 GPU', gpus: 1 });
  assert.ok((await brief()).work.runs.some((r) => r.id === waits));
  markRun(db, x, { archived: true });
  markRun(db, waits, { archived: true });
  const after = await brief();
  assert.equal(after.work.runs.some((r) => r.id === waits), false);
  assert.equal(after.news.some((n) => (n.kind === 'runs' || n.kind === 'failures') && n.group === 'aside'), false, 'no news of them');
  assert.equal(after.week.gpuHours, before.week.gpuHours, 'no GPU hours');
  // A whole experiment archived.
  run({ status: 'done', group: 'whole-aside', name: 'w', gpus: 2, start: ago(4), end: ago(2), created: Date.now() - 60_000 });
  assert.ok((await brief()).news.some((n) => n.kind === 'runs' && n.group === 'whole-aside'));
  setGroupArchived(db, 'whole-aside', true);
  const gone = await brief();
  assert.equal(gone.news.some((n) => n.kind === 'runs' && n.group === 'whole-aside'), false);
  assert.equal(gone.week.gpuHours, before.week.gpuHours);
});

test('an experiment is named by its title when it has one, else its group, with the group kept for the link', async () => {
  let b = await brief();
  let l = b.news.find((n) => n.kind === 'runs' && n.group === 'pre50b') as any;
  assert.equal(l.experiment, 'pre50b');
  saveInfo(db, 'pre50b', { title: 'Pre-training for long queries' }, 'user');
  b = await brief();
  l = b.news.find((n) => n.kind === 'runs' && n.group === 'pre50b') as any;
  assert.deepEqual({ experiment: l.experiment, group: l.group }, { experiment: 'Pre-training for long queries', group: 'pre50b' });
  const f = b.news.find((n) => n.kind === 'failures' && n.group === 'pre50b') as any;
  assert.equal(f.experiment, 'Pre-training for long queries');
  const w = run({ status: 'waiting', group: 'pre50b', name: 'titled', why: 'Waiting for 1 GPU' });
  assert.equal((await brief()).work.runs.find((r) => r.id === w)?.experiment, 'Pre-training for long queries');
});

test('a waiting run says when it should start, where the app knows', async () => {
  const id = run({ status: 'waiting', name: 'starts-soon', why: 'Waiting for 1 GPU that is free: your other runs hold GPU 0. About 14:20, when “trainer” should end', gpus: 1 });
  updateRun(db, id, { info: { startsAbout: NOW + 5 * HOUR } });
  const none = run({ status: 'waiting', name: 'no-time', why: 'Waiting for 1 GPU', gpus: 1 });
  const b = await brief();
  assert.equal(b.work.runs.find((r) => r.id === id)?.startsAbout, NOW + 5 * HOUR);
  assert.equal(b.work.runs.find((r) => r.id === none)?.startsAbout, undefined);
});

// ---- routes ----------------------------------------------------------------------------------------------------------------

test('the page reads the brief in one call, and an agent through app_api gets it too', async () => {
  const http = Fastify();
  researchRoutes({ ...deps, app: http } as Deps, () => undefined);
  await http.ready();
  const r = await http.inject({ method: 'GET', url: `/api/projects/${space.id}/research`, headers: internalHeaders() });
  assert.equal(r.statusCode, 200);
  const b = r.json() as ResearchBrief;
  assert.equal(b.folder, retriever);
  assert.equal(b.evaluations[0].final.mean, undefined);
  assert.equal((await http.inject({ method: 'GET', url: '/api/projects/nope/research' })).statusCode, 404);
  await http.close();
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok  ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
