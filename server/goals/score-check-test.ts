// Checks for a goal's score checks (scores.ts) with a real tiny evaluation in a scratch git repository, scored through the
// Experiments queue (tmux, a shell script that prints a number for each of three seeds, no GPU): what a score check may
// hold (validate.ts), what it needs of its evaluation to be agreed (no such evaluation, no baseline, a folder it cannot
// score, a confidential session) and what is fixed then (the target from the baseline, its protected files from the
// session's folder, a baseline kept through a change); a score that holds, one better but short of its gain, one within
// the noise of its seeds, one refused because a protected file changed, one that failed because the number was not
// printed; an evaluation sealed again, given another baseline or removed; a wait stopped by Pause or Stop, one past its
// time, a score a restart left open waited for again; and the evaluations with a final test.
// Build and run with a scratch data folder (no GPU is used):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/score-check-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-scores PRICES_URL= CUDA_VISIBLE_DEVICES= node dist/dev/score-check-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EvalScore, Evaluation } from '../../shared/evaluations.ts';
import { holdsAt, scoreTarget, type GoalCheck } from '../../shared/goals.ts';
import { openDb } from '../db.ts';
import { createEvaluation, getScore, listScores, removeEvaluation, sealAgain, setBaseline, startScore } from '../experiments/evaluations.ts';
import { stopTmuxServer } from '../experiments/local.ts';
import { setSettings, tick, useDeps } from '../experiments/queue.ts';
import { getRun } from '../experiments/records.ts';
import type { Deps } from '../features/types.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { MAX_SCORE_TIMEOUT_S, runChecks } from './checks.ts';
import { finalTests, fixScores, movedWhy, protectFor, SCORE_CUT, scoreCheck, scoreDetail, type ScoreHow } from './scores.ts';
import { cleanChecks } from './validate.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || process.env.PRICES_URL !== '') {
  console.error('Run with DATA_DIR=/tmp/… and PRICES_URL= (empty) so nothing touches real data or the network.');
  process.exit(2);
}
if (process.env.CUDA_VISIBLE_DEVICES !== '') {
  console.error('Run with CUDA_VISIBLE_DEVICES= (empty): these tests never use a GPU.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-goal-scores-')));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, fn: () => boolean, ms = 30_000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

class Sessions extends EventEmitter {
  summary() {
    return null;
  }
  queueSummary() {}
}
const deps = { app: {}, db, sessions: new Sessions(), scheduler: null, models: null, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as unknown as Deps;
useDeps(deps);
setSettings(db, { cpuSlots: 4 });
// The queue steps by itself every 3 seconds; here faster.
const stepper = setInterval(() => void tick(), 100);

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...a], { cwd, stdio: 'pipe' }).toString();

// A project whose evaluation prints ndcg for each seed: the model's number plus the seed's own noise. "none" prints no
// ndcg, "slow" takes long. The scorer and its noise are sealed; the model is what an agent changes.
const repo = path.join(tmp, 'repo');
write(
  path.join(repo, 'eval.sh'),
  'm=$(cat model.txt)\ncase "$m" in none) echo "other=1"; exit 0;; slow) sleep 60; exit 0;; esac\nn=$(sed -n "${1}p" noise.txt)\nawk -v m="$m" -v n="$n" \'BEGIN { printf "ndcg=%.4f\\n", m + n }\'\n',
);
write(path.join(repo, 'noise.txt'), '0\n0.02\n-0.02\n');
write(path.join(repo, 'model.txt'), '0.40\n');
write(path.join(repo, 'sub', 'notes.md'), 'notes\n');
git(repo, 'init', '-q', '-b', 'main');
git(repo, 'add', '.');
git(repo, 'commit', '-q', '-m', 'first');
// A worktree of it, as a goal's session works in.
const work = path.join(tmp, 'work');
git(repo, 'worktree', 'add', '-q', '-b', 'goal', work);
const elsewhere = path.join(tmp, 'elsewhere');
fs.mkdirSync(elsewhere, { recursive: true });

const SPEC = { name: 'Relevance', cwd: repo, command: 'sh eval.sh {seed}', metric: 'ndcg', better: 'higher', seeds: [1, 2, 3], protect: ['eval.sh', 'noise.txt'], final: { command: 'sh eval.sh 1' }, gpus: 0 };
const KEY = 'claude:goal-scores';
db.prepare('insert or ignore into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(KEY, 'claude', work, Date.now(), Date.now());

const OPEN = ['waiting', 'running'];
async function over(id: string, ms?: number): Promise<EvalScore> {
  await until(`score ${id} (its runs: ${getScore(db, id)?.runs.map((r) => getRun(db, r)?.status).join(', ')})`, () => !OPEN.includes(getScore(db, id)!.status), ms);
  return getScore(db, id)!;
}
const model = (dir: string, v: string) => write(path.join(dir, 'model.txt'), `${v}\n`);

let ev: Evaluation;
let base: EvalScore;
/** A score check of the evaluation, fixed by the app as at an agreement. */
async function agreed(gain: number, o: { id?: string; label?: string } = {}): Promise<GoalCheck> {
  const fx = await fixScores(deps, { key: KEY, cwd: work, checks: [{ id: o.id ?? 'c1', kind: 'score', label: o.label ?? 'Beats the baseline', evaluation: ev.id, gain }], again: true, who: 'you' });
  assert.deepEqual(fx.errors, []);
  return fx.checks[0];
}
/** How a test runs a score check: its progress and the score it started, kept to look at. */
function how(o: Partial<ScoreHow> = {}): ScoreHow & { shown: unknown[]; startedIds: string[] } {
  const shown: unknown[] = [];
  const startedIds: string[] = [];
  return { key: KEY, cwd: work, timeoutS: 120, signal: new AbortController().signal, started: (id) => startedIds.push(id), progress: (p) => shown.push(p), shown, startedIds, ...o };
}

// ---- what a score check holds -------------------------------------------------------------------------------------

test('validate: a score names its evaluation, its gain is 0 or more (0 unless given), and it may wait up to 48 hours; what the app fixes is not taken from what was sent', () => {
  const ok = cleanChecks([{ kind: 'score', label: 'Beats the baseline', evaluation: 'e1', target: { op: '>=', value: 9 }, baseline: { score: 'x' }, timeoutS: 40_000 }]);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.checks[0], { id: 'c1', kind: 'score', label: 'Beats the baseline', evaluation: 'e1', gain: 0, timeoutS: 40_000 });
  assert.equal(cleanChecks([{ kind: 'score', label: 'B', evaluation: 'e1', gain: 0.02 }]).checks[0].gain, 0.02);
  const bad = cleanChecks([{ kind: 'score', label: 'B', gain: -1, timeoutS: MAX_SCORE_TIMEOUT_S + 1 }]).errors;
  assert.ok(bad.some((e) => /“B” needs evaluation: the id of the project’s evaluation that scores it/.test(e)), bad.join('\n'));
  assert.ok(bad.some((e) => /“B”: gain is a number of 0 or more, in the score’s own units\./.test(e)));
  assert.ok(bad.some((e) => /timeoutS is a number of seconds from 1 to 172800/.test(e)));
  // A command's time limit is as it was.
  assert.match(cleanChecks([{ kind: 'command', label: 'T', run: 'true', timeoutS: 40_000 }]).errors[0], /from 1 to 3600/);
  assert.match(cleanChecks([{ kind: 'nope', label: 'T' }]).errors[0], /command, measure, score, review or you/);
});

test('a score holds when it meets its target and beats its baseline beyond the noise; its target is the baseline better by the gain', () => {
  const c: GoalCheck = { id: 'c1', kind: 'score', label: 'S', target: scoreTarget('higher', 0.4, 0.02) };
  assert.deepEqual(c.target, { op: '>=', value: 0.42 }, 'no float noise in the sum');
  assert.deepEqual(scoreTarget('lower', 12, 2), { op: '<=', value: 10 });
  assert.equal(holdsAt(c, 0.43, 'better'), true);
  assert.equal(holdsAt(c, 0.43, 'same'), false, 'within the noise');
  assert.equal(holdsAt(c, 0.41, 'better'), false, 'short of the gain');
  assert.equal(holdsAt({ ...c, kind: 'measure' }, 0.43, undefined), true, 'a measure needs no verdict');
  assert.equal(scoreDetail(c, 0.431, 0.412, { delta: 0.019, p: 0.21, verdict: 'same' }, 3), '0.431 against 0.412: within the noise of 3 seeds (p = 0.21).');
  assert.equal(scoreDetail(c, 0.415, 0.412, { delta: 0.003, p: 0.4, verdict: 'same' }, 3), '0.415 against 0.412: within the noise of 3 seeds (p = 0.4), and short of the +0.008 it needs.');
  assert.equal(scoreDetail(c, 0.418, 0.4, { delta: 0.018, p: 0.01, verdict: 'better' }, 3), '0.418 against 0.4: +0.018, beyond the noise of 3 seeds (p = 0.01), but short of the +0.02 it needs.');
  assert.equal(scoreDetail(c, 0.45, 0.4, { delta: 0.05, p: null, verdict: 'better' }, 1), '0.45 against 0.4: +0.05 (too few runs on a side to test the noise).');
  assert.equal(scoreDetail(c, 0.39, 0.4, { delta: -0.01, p: 0.0001, verdict: 'worse' }, 3), '0.39 against 0.4: −0.01, worse (p < 0.001).');
});

// ---- agreeing ---------------------------------------------------------------------------------------------------------

test('agreeing: no such evaluation, no baseline (for the agent, for the person), a folder it cannot score, a confidential session; each in a sentence', async () => {
  ev = await createEvaluation(deps, SPEC);
  const check = (evaluation: string, label = 'Beats the baseline'): GoalCheck => ({ id: 'c1', kind: 'score', label, evaluation, gain: 0 });
  const none = await fixScores(deps, { key: KEY, cwd: work, checks: [check('enope')], who: 'agent' });
  assert.deepEqual(none.errors, ['“Beats the baseline”: there is no evaluation “enope” (evaluation_get lists those of this folder).']);
  assert.match((await fixScores(deps, { key: KEY, cwd: work, checks: [check('enope')], who: 'you' })).errors[0], /pick one of this folder’s evaluations/);
  const agent = await fixScores(deps, { key: KEY, cwd: work, checks: [check(ev.id)], who: 'agent' });
  assert.deepEqual(agent.errors, ['“Beats the baseline”: the baseline of “Relevance” is not measured yet, and only the user can measure it (on the evaluation’s page): ask them to, or propose another check.']);
  const you = await fixScores(deps, { key: KEY, cwd: work, checks: [check(ev.id)], who: 'you' });
  assert.deepEqual(you.errors, ['“Beats the baseline”: the baseline of “Relevance” is not measured yet: only you can measure it, on the evaluation’s page.']);
  const far = await fixScores(deps, { key: KEY, cwd: elsewhere, checks: [check(ev.id)], who: 'you' });
  assert.deepEqual(far.errors, ['“Beats the baseline”: “Relevance” cannot score this session’s folder: an evaluation scores its own folder, a folder inside it, or a git worktree of the same repository.']);
  const secret = 'claude:goal-scores-secret';
  db.prepare('insert or ignore into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(secret, 'claude', work, Date.now(), Date.now());
  setSessionExtra(db, secret, { confidential: true });
  assert.match((await fixScores(deps, { key: secret, cwd: work, checks: [check(ev.id)], who: 'you' })).errors[0], /a confidential session cannot be scored by an evaluation/);
  // Other kinds pass through untouched.
  const plain: GoalCheck = { id: 'c2', kind: 'command', label: 'Tests', run: 'true' };
  assert.deepEqual((await fixScores(deps, { key: KEY, cwd: elsewhere, checks: [plain], who: 'you' })).checks, [plain]);
});

test('agreed: the target is fixed from the baseline of that moment, with its score, seal and names; the evaluation’s files join the paths, written from the session’s folder', async () => {
  model(repo, '0.40');
  base = await over((await startScore(deps, ev.id, { kind: 'baseline', by: { who: 'you' } })).id);
  assert.equal(base.status, 'done', base.why);
  assert.ok(Math.abs(base.mean! - 0.4) < 1e-9);
  const fx = await fixScores(deps, { key: KEY, cwd: work, checks: [{ id: 'c1', kind: 'score', label: 'Beats the baseline', evaluation: ev.id, gain: 0.05 }], who: 'agent' });
  assert.deepEqual(fx.errors, []);
  assert.deepEqual(fx.checks[0].target, { op: '>=', value: 0.45 });
  assert.deepEqual(fx.checks[0].baseline, { score: base.id, mean: base.mean, seal: 1, name: 'Relevance', metric: 'ndcg' });
  assert.deepEqual(fx.protect, ['eval.sh', 'noise.txt']);
  // From a folder inside the evaluation's, only what lies in it; from one above, with the way down.
  assert.deepEqual(protectFor({ protect: ['eval.sh', 'sub/data/', 'sub/*.md'] }, repo, path.join(repo, 'sub')), ['data/', '*.md']);
  assert.deepEqual(protectFor({ protect: ['eval.sh', 'data/'] }, path.join(tmp, 'repo'), tmp), ['repo/eval.sh', 'repo/data/']);
  // A change that keeps its evaluation keeps the baseline it was agreed against; a new gain counts from it.
  const kept = await fixScores(deps, { key: KEY, cwd: work, checks: [{ ...fx.checks[0], gain: 0.1, target: undefined, baseline: undefined }], before: fx.checks, who: 'you' });
  assert.deepEqual(kept.checks[0].baseline, fx.checks[0].baseline);
  assert.deepEqual(kept.checks[0].target, { op: '>=', value: 0.5 });
});

// ---- running it ---------------------------------------------------------------------------------------------------------

test('a score that holds: its mean against the baseline beyond the noise of 3 seeds, scored by the goal in the session’s folder, its runs on the bar as it waits', async () => {
  const c = await agreed(0.05);
  model(work, '0.50');
  const h = how();
  const r = await scoreCheck(deps, c, h);
  assert.equal(r.trouble, undefined, r.result.error);
  assert.equal(r.result.holds, true, r.result.detail);
  assert.ok(Math.abs(r.result.value! - 0.5) < 1e-9);
  assert.equal(r.result.verdict, 'better');
  assert.match(r.result.detail!, /^0\.5 against 0\.4: \+0\.1, beyond the noise of 3 seeds \(p = /);
  const s = getScore(db, r.result.score!)!;
  assert.deepEqual(s.by, { who: 'goal', session: KEY });
  assert.equal(fs.realpathSync(s.folder), fs.realpathSync(work));
  assert.deepEqual(h.startedIds, [s.id]);
  // How its runs stood while it waited, then nothing once it was over.
  const shown = h.shown.filter(Boolean) as { check: string; runs: number }[];
  assert.ok(shown.length >= 1 && shown.every((p) => p.check === 'c1' && p.runs === 3), JSON.stringify(h.shown));
  assert.equal(h.shown.at(-1), null);
});

test('better beyond the noise but short of its gain, and a gain within the noise of its seeds: neither holds, each says why', async () => {
  const far = await agreed(0.2);
  const short = await scoreCheck(deps, far, how());
  assert.equal(short.result.holds, false);
  assert.equal(short.result.verdict, 'better');
  assert.match(short.result.detail!, /beyond the noise of 3 seeds .*but short of the \+0\.2 it needs\./);
  model(work, '0.41');
  const any = await agreed(0);
  const noise = await scoreCheck(deps, any, how());
  assert.equal(noise.result.holds, false, 'a mean above the baseline within the noise does not hold');
  assert.equal(noise.result.verdict, 'same');
  assert.ok(Math.abs(noise.result.value! - 0.41) < 1e-9);
  assert.match(noise.result.detail!, /^0\.41 against 0\.4: within the noise of 3 seeds \(p = /);
  assert.equal(noise.result.error, undefined);
});

test('refused because a protected file changed, and failed because the number was not printed: errors in the evaluation’s own words, not trouble', async () => {
  const c = await agreed(0);
  write(path.join(work, 'eval.sh'), 'echo "ndcg=0.99"\n');
  const before = listScores(db, ev.id, ['score']).length;
  const refused = await scoreCheck(deps, c, how());
  assert.equal(refused.trouble, undefined);
  assert.equal(refused.result.holds, false);
  assert.equal(refused.result.error, 'The scorer or its data changed since it was sealed: eval.sh, so it was not scored');
  assert.equal(listScores(db, ev.id, ['score']).length, before, 'nothing ran');
  git(work, 'checkout', '--', 'eval.sh');
  model(work, 'none');
  const failed = await scoreCheck(deps, c, how());
  assert.equal(failed.trouble, undefined);
  assert.equal(failed.result.error, 'It printed no number called “ndcg”');
  assert.equal(failed.result.detail, 'It printed: other');
  assert.ok(failed.result.score);
});

test('Pause or Stop while it waits: its runs stop and the wait ends as cut; past its time: stopped, as late', async () => {
  const c = await agreed(0);
  model(work, 'slow');
  const ctrl = new AbortController();
  const h = how({ signal: ctrl.signal });
  const p = scoreCheck(deps, c, h);
  await until('the score started', () => h.startedIds.length === 1);
  const id = h.startedIds[0];
  // Once its runs have started (a run stopped while it is still starting is only killed with its tmux session, 20 s on).
  await until('its runs going', () => getScore(db, id)!.runs.every((run) => getRun(db, run)?.status === 'running'));
  ctrl.abort();
  const r = await p;
  assert.equal(r.trouble, 'cut');
  assert.equal(r.result.error, SCORE_CUT);
  const s = await over(id, 60_000);
  assert.equal(s.status, 'stopped');
  for (const run of s.runs) assert.ok(['stopped', 'done', 'failed'].includes(getRun(db, run)!.status), getRun(db, run)!.status);
  // Its time: a second.
  const late = await scoreCheck(deps, c, how({ timeoutS: 1 }));
  assert.equal(late.trouble, 'late');
  assert.equal(late.result.error, 'It took longer than its 1 s to be scored, so its runs were stopped');
  assert.equal((await over(late.result.score!, 60_000)).status, 'stopped');
  model(work, '0.50');
});

test('a restart while it waits: the score left open is waited for again, never a second started; one stopped is not taken', async () => {
  const c = await agreed(0.05);
  const left = await startScore(deps, ev.id, { kind: 'score', folder: work, by: { who: 'goal', session: KEY } });
  const before = listScores(db, ev.id, ['score']).length;
  const h = how({ open: left.id });
  const r = await scoreCheck(deps, c, h);
  assert.equal(r.result.score, left.id);
  assert.deepEqual(h.startedIds, [left.id]);
  assert.equal(listScores(db, ev.id, ['score']).length, before, 'no score started');
  assert.equal(r.result.holds, true, r.result.detail);
  // One that ended stopped (Pause, before the restart) is not this score's: a new one starts.
  const stoppedOne = listScores(db, ev.id, ['score']).find((x) => x.status === 'stopped')!;
  const again = await scoreCheck(deps, c, how({ open: stoppedOne.id }));
  assert.notEqual(again.result.score, stoppedOne.id);
});

test('the evaluation moved since it was agreed: another baseline, sealed again, removed; nothing is compared across them', async () => {
  const c = await agreed(0.05);
  assert.equal(movedWhy(db, c), null);
  // Another baseline: a score of the person's own made the baseline.
  const other = await over((await startScore(deps, ev.id, { kind: 'score', folder: repo, by: { who: 'you' } })).id);
  setBaseline(deps, ev.id, other.id);
  assert.equal(movedWhy(db, c), 'The baseline of “Relevance” changed after the goal’s checks were agreed, so “Beats the baseline” no longer means what was agreed');
  const r = await scoreCheck(deps, c, how());
  assert.equal(r.trouble, 'moved');
  assert.equal(r.result.score, undefined, 'nothing was scored');
  setBaseline(deps, ev.id, base.id);
  assert.equal(movedWhy(db, c), null);
  await sealAgain(deps, ev.id);
  assert.match(movedWhy(db, c)!, /^“Relevance” was sealed again after the goal’s checks were agreed, so its scores can no longer be compared with the baseline “Beats the baseline” was agreed against$/);
  assert.equal((await scoreCheck(deps, c, how())).trouble, 'moved');
  // Fixed again at the person's answer: no baseline yet under the new seal, then one.
  const again = await fixScores(deps, { key: KEY, cwd: work, checks: [c], before: [c], who: 'you' });
  assert.match(again.errors[0], /the baseline of “Relevance” is not measured yet/);
  model(repo, '0.40');
  const b2 = await over((await startScore(deps, ev.id, { kind: 'baseline', by: { who: 'you' } })).id);
  const fixed = await fixScores(deps, { key: KEY, cwd: work, checks: [c], before: [c], who: 'you' });
  assert.deepEqual(fixed.errors, []);
  assert.equal(fixed.checks[0].baseline!.seal, 2);
  assert.equal(fixed.checks[0].baseline!.score, b2.id);
  assert.equal(movedWhy(db, fixed.checks[0]), null);
  base = b2;
  ev = { ...ev, seal: { ...ev.seal, n: 2 } };
});

test('runChecks scores after commands and measures and before reviews; the evaluations with a final test, each once; removed: it says so', async () => {
  const order: string[] = [];
  const c = await agreed(0);
  await runChecks(
    [
      { id: 'r', kind: 'review', label: 'R', claim: 'x' },
      c,
      { id: 'm', kind: 'measure', label: 'M', run: 'echo 1', target: { op: '>=', value: 1 } },
    ],
    {
      cwd: work,
      diff: async () => '',
      confirmed: {},
      review: async () => (order.push('review'), { holds: true, score: 1, reason: 'ok' }),
      score: async (x) => (order.push('score'), { id: x.id, holds: false, closeness: 0, ms: 0 }),
      how: { started: () => order.push('command') },
    },
  );
  assert.deepEqual(order, ['command', 'score', 'review']);
  assert.deepEqual(finalTests(db, [c, { ...c, id: 'c9' }, { id: 'x', kind: 'command', label: 'T', run: 'true' }]), [{ evaluation: ev.id, name: 'Relevance' }]);
  const plain = await createEvaluation(deps, { ...SPEC, name: 'No final', final: undefined });
  assert.deepEqual(finalTests(db, [{ ...c, evaluation: plain.id }]), []);
  await removeEvaluation(deps, ev.id);
  assert.match(movedWhy(db, c)!, /^The evaluation “Relevance” was removed, so “Beats the baseline” can no longer be scored/);
});

// ---- run ---------------------------------------------------------------------------------------------

setTimeout(() => {
  console.error('score-check-test: timed out');
  process.exit(1);
}, 300_000).unref();
// TEST_ONLY=<words>: only the tests whose name holds them.
const only = process.env.TEST_ONLY;
for (const [name, fn] of tests) {
  if (only && !name.includes(only)) continue;
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
clearInterval(stepper);
await stopTmuxServer();
try {
  git(repo, 'worktree', 'remove', '--force', work);
} catch {}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit();
