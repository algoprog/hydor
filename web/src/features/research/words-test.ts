// Script tests for the words of a project's Research tab (words.ts): the steps of the best line for higher and for lower
// being better, the chart's shape for many scores, one and two, grouping the news by day, folding what is many, the
// sentences of cards and lines, and the lines of running and waiting. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/research/words-test.ts && node dist/dev/words-test.js
import assert from 'node:assert/strict';
import type { ResearchEvaluation, ResearchNews, ResearchRun, ResearchWait, ResearchWork } from '@shared/project-research';
import { bestSteps } from '@shared/project-research';

// words.ts reads number words from the experiments' api.ts, which imports the page's own modules: some look at the address when they load.
const g = globalThis as any;
g.location ??= { pathname: '/', search: '', hash: '', origin: 'http://localhost', host: 'localhost', href: 'http://localhost/' };
g.window ??= g;
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const W = await import('./words');

const NOW = new Date(2026, 10, 26, 9, 0).getTime();
const at = (daysAgo: number, h = 12, m = 0) => new Date(2026, 10, 26 - daysAgo, h, m).getTime();
const H = 3_600_000;

let n = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    n++;
    console.log(`ok  ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
};

const ev = (more: Partial<ResearchEvaluation> = {}): ResearchEvaluation => ({
  id: 'e1',
  name: 'Dev queries, nDCG@10',
  metric: 'ndcg',
  better: 'higher',
  seeds: 3,
  scores: [],
  failed: [],
  scoredAt: 0,
  final: { state: 'unrun' },
  changed: false,
  ...more,
});
const pts = (means: number[], start = at(8)) => means.map((m, i) => ({ id: `s${i}`, at: start + i * 12 * H, mean: m }));

test('the best line steps at each score that beat everything before it, whichever way is better', () => {
  assert.deepEqual(bestSteps([{ mean: 0.403 }, { mean: 0.418 }, { mean: 0.41 }, { mean: 0.43 }, { mean: 0.43 }], 'higher'), [0, 1, 3]);
  assert.deepEqual(bestSteps([{ mean: 210 }, { mean: 199 }, { mean: 205 }, { mean: 180 }], 'lower'), [0, 1, 3]);
  assert.deepEqual(bestSteps([{ mean: 210 }, { mean: 199 }, { mean: 205 }, { mean: 180 }], 'higher'), [0], 'the other way, only the first');
  assert.deepEqual(bestSteps([{ mean: 0.403 }, { mean: 0.418 }], 'higher', 0.412), [1], 'a score below the baseline is no step above it');
  assert.deepEqual(bestSteps([], 'higher'), []);
});

test('the chart is the scores as points, the best so far stepped from the baseline, the baseline and the failed ones', () => {
  const e = ev({ scores: pts([0.403, 0.418, 0.41, 0.43]), failed: [at(7, 20)], baseline: { mean: 0.412, seeds: 3 } });
  const m = W.chartModel(e, NOW)!;
  assert.deepEqual(m.points.map((p) => p.step), [false, true, false, true]);
  assert.equal(m.baseline, 0.412);
  assert.deepEqual(m.line.map((v) => v.v), [0.412, 0.412, 0.418, 0.418, 0.43, 0.43], 'from the baseline, step by step, to the end');
  assert.equal(m.line[0].t, m.t0);
  assert.equal(m.line[m.line.length - 1].t, m.t1);
  assert.ok(m.t1 >= NOW, 'out to now');
  assert.deepEqual([m.from, m.to], [Math.min(e.scores[0].at, e.failed[0]), NOW], 'the axis names the first drawn and now, not the room around them');
  assert.ok(m.lo < 0.403 && m.hi > 0.43, 'room around the values');
  assert.equal(m.failed.length, 1);
  // Lower is better: the line goes down.
  const l = W.chartModel(ev({ better: 'lower', scores: pts([210, 199, 205, 180]), baseline: { mean: 199, seeds: 3 } }), NOW)!;
  assert.deepEqual(l.points.map((p) => p.step), [false, false, false, true]);
  assert.deepEqual(l.line.map((v) => v.v), [199, 199, 180, 180]);
});

test('one or two scores still make a chart, and nothing makes none', () => {
  const one = W.chartModel(ev({ scores: pts([0.43], NOW - 2 * H), baseline: { mean: 0.412, seeds: 3 } }), NOW)!;
  assert.ok(one.t1 - one.t0 >= 6 * H, 'never a hair’s width of time');
  assert.equal(one.points.length, 1);
  assert.deepEqual(one.line.map((v) => v.v), [0.412, 0.412, 0.43, 0.43]);
  const two = W.chartModel(ev({ better: 'lower', scores: pts([199, 205], NOW - 30 * 60_000) }), NOW)!;
  assert.deepEqual(two.line.map((v) => v.v), [199, 199], 'without a baseline it starts at the first score');
  assert.ok(Number.isFinite(two.lo) && Number.isFinite(two.hi) && two.hi > two.lo);
  const same = W.chartModel(ev({ scores: pts([0.5, 0.5]) }), NOW)!;
  assert.ok(same.hi > same.lo, 'equal scores still have a range');
  assert.equal(W.chartModel(ev(), NOW), null);
  const failedOnly = W.chartModel(ev({ failed: [at(1)] }), NOW)!;
  assert.deepEqual(failedOnly.line, []);
});

test('the evaluation’s head line is the evaluation page’s own words; the final test reads as it stands', () => {
  const e = ev({ best: { id: 's', at: 1, mean: 0.447, against: { baseline: 'b', delta: 0.035, p: 0.01, verdict: 'better' } }, final: { state: 'unrun' } });
  const s = W.standLine(e);
  assert.equal(s.standing?.long, '0.035 better than the baseline');
  assert.equal(s.standing?.tone, 'better');
  assert.equal(s.final, 'final test not run');
  assert.equal(W.standLine(ev({ final: { state: 'done', mean: 0.44, std: 0.002 } })).final, 'final test 0.44 ± 0.002');
  assert.equal(W.standLine(ev({ final: { state: 'unset' } })).final, '');
  assert.equal(W.standLine(ev({ best: { id: 's', at: 1, mean: 1, against: { baseline: 'b', delta: 0, p: 0.5, verdict: 'same' } } })).standing?.long, 'The same as the baseline, within the noise');
});

test('the four facts under the chart', () => {
  const e = ev({ scores: pts([0.4, 0.447]), failed: [1, 2, 3], best: { id: 's1', at: 1, mean: 0.447, std: 0.002, label: 'length penalty earlier' }, baseline: { mean: 0.412, std: 0.002, seeds: 3, where: 'main' } });
  const f = W.facts(e, { held: 2, didNot: 3, unclear: 0, open: 1 });
  assert.deepEqual(f.map((x) => [x.label, x.value, x.sub]), [
    ['Best', '0.447 ± 0.002', 'length penalty earlier'],
    ['Baseline', '0.412 ± 0.002', '3 seeds · main'],
    ['Scores', '5', '3 failed'],
    ['Findings', '2 held · 3 did not', '1 open'],
  ]);
  assert.equal(f[3].opens, 'findings');
  const none = W.facts(ev(), { held: 0, didNot: 0, unclear: 0, open: 0 });
  assert.deepEqual([none[0].value, none[1].value, none[2].value, none[3].value], ['–', 'Not measured', '0', 'None yet']);
  assert.equal(W.facts(ev(), { held: 0, didNot: 0, unclear: 1, open: 1 })[3].value, '1 open · 1 unclear');
});

test('news groups under days only when it spans more than one, and folds after six', () => {
  const one = [{ at: at(0, 8) }, { at: at(0, 2) }];
  assert.deepEqual(W.groupByDay(one, NOW).map((x) => x.day), [null]);
  const spans = [{ at: at(0, 8) }, { at: at(1, 22) }, { at: at(1, 3) }, { at: at(3, 3) }];
  const g = W.groupByDay(spans, NOW);
  assert.deepEqual(g.map((x) => [x.day === null ? null : x.day, x.items.length]).slice(0, 2), [['Today', 1], ['Yesterday', 2]]);
  assert.equal(g.length, 3);
  assert.equal(g[2].day, new Date(at(3, 3)).toLocaleDateString(undefined, { weekday: 'long' }));
  assert.equal(W.dayName(at(20), NOW), new Date(at(20)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.deepEqual(W.fold(ten, W.NEWS_SHOWN, false), { shown: ten.slice(0, 6), more: 4 });
  assert.deepEqual(W.fold(ten, W.NEWS_SHOWN, true), { shown: ten, more: 0 });
  assert.deepEqual(W.fold([1, 2, 3], W.WAITING_SHOWN, false), { shown: [1, 2, 3], more: 0 }, 'three fit');
  assert.equal(W.moreWords(3), '3 more');
  assert.equal(W.showMoreWords(9), 'Show 9 more');
});

test('when the person last looked, and the first visit’s week', () => {
  assert.equal(W.sinceWords(at(1, 18, 40), NOW), `yesterday, ${W.clock(at(1, 18, 40))}`);
  assert.equal(W.sinceWords(at(0, 8, 10), NOW), `today, ${W.clock(at(0, 8, 10))}`);
  assert.ok(W.sinceWords(at(3, 9, 5), NOW).startsWith(new Date(at(3)).toLocaleDateString(undefined, { weekday: 'long' })));
  assert.equal(W.newsHeading(true), 'The last seven days');
  assert.equal(W.newsHeading(false), 'Since you last looked');
  assert.equal(W.nothingNew(at(1, 18, 40), NOW), `Nothing new since yesterday, ${W.clock(at(1, 18, 40))}.`);
  assert.equal(W.nothingNew(null, NOW), 'Nothing new in the last seven days.');
  assert.equal(W.agoOf(NOW - 2 * H, NOW), '2 h ago');
  assert.equal(W.agoOf(NOW - 10_000, NOW), 'just now');
  assert.equal(W.agoOf(NOW - 5 * 24 * H, NOW), '5 days ago');
});

test('runs held at the limit on agents’ GPU hours, and the week against it', () => {
  const held = (runs: string[]) => W.plain(W.waitCard({ kind: 'held', id: 'h', at: 1, runs, ceiling: 100 }, NOW).title);
  assert.equal(held(['a', 'b', 'c']), '3 runs wait: agents have used the 100 GPU hours you allow in seven days');
  assert.equal(held(['a']), '1 run waits: agents have used the 100 GPU hours you allow in seven days');
  assert.equal(W.plain(W.waitCard({ kind: 'held-search', id: 'h', at: 1, evolution: { id: 'v', title: 'Raise nDCG@10' }, ceiling: 100 }, NOW).title), 'The search “Raise nDCG@10” waits: agents have used the 100 GPU hours you allow in seven days');
  // "Running and waiting": a held run and a held search wait for you, not for a GPU or for tonight.
  const why = 'Waits for you: agents have used 100 of 100 GPU hours in the last seven days';
  const run = (id: string, more: object) => ({ id, name: id, status: 'waiting' as const, gpus: 1, ...more });
  const lines = W.workLines({ runs: [run('a', { why }), run('b', { why, when: 'night' }), run('c', { why }), run('d', { why: 'Waiting for 1 GPU that is free: none is free now' }), run('e', { why: 'Waits for the night (from 23:00)' })], searches: [{ id: 'v', title: 'S', tried: 1, candidates: 9, waits: why }], goals: [] }, NOW);
  assert.deepEqual(lines.map((l) => [W.plain(l.parts), l.state]).slice(0, 2), [['The search “S”', 'Waits for you'], ['3 runs wait for you', '']]);
  assert.ok(lines.some((l) => W.plain(l.parts) === '1 run waits for a GPU'));
  assert.equal(W.waitState({ status: 'waiting', why: 'Waits for you: agents have used 100 of 100 GPU hours in the last seven days' }), 'Waits for you');
  const week = { gpuHours: 7, usd: 0, unpriced: false, sessions: 2 };
  assert.deepEqual(W.weekWords(week), { hours: '7 GPU hours', models: 'No model cost · 2 sessions' }, 'no limit: as it was');
  assert.deepEqual(W.weekWords({ ...week, agents: { used: 61.04, ceiling: 100 } }), { hours: '61 of 100 GPU hours', models: 'No model cost · 2 sessions', limit: { percent: (61.04 / 100) * 100, note: 'Agents’ runs on this computer, in seven days' } });
  assert.equal(W.weekWords({ ...week, agents: { used: 104, ceiling: 100 } }).limit!.percent, 100);
  // Never rounded up to a limit not reached.
  assert.equal(W.weekWords({ ...week, agents: { used: 99.96, ceiling: 100 } }).hours, '99.9 of 100 GPU hours');
});

test('what each card of "Waiting for you" says', () => {
  const ask: ResearchWait = { kind: 'ask', id: 'a', at: NOW - 2 * H, session: { key: 'k', title: 'Pretraining for long queries' }, title: 'Which training data for the 88M model?', approval: 'p' };
  const c = W.waitCard(ask, NOW);
  assert.equal(W.plain(c.title), 'Which training data for the 88M model?');
  assert.deepEqual(c.where, { text: 'Asked 2 h ago in', name: 'Pretraining for long queries' });
  assert.equal(W.plain(W.waitCard({ kind: 'sealed', id: 's', at: 1, evaluation: { id: 'e', name: 'Dev' }, changed: 3, names: ['eval.py', 'data.csv'] }, NOW).title), 'The sealed files of “Dev” differ');
  assert.equal(W.plain(W.waitCard({ kind: 'sealed', id: 's', at: 1, evaluation: { id: 'e', name: 'Dev' }, changed: 3, names: ['eval.py', 'data.csv'] }, NOW).detail!), '3 files changed: eval.py, data.csv and 1 more. Scores wait until they are back.');
  assert.equal(W.plain(W.waitCard({ kind: 'sealed', id: 's', at: 1, evaluation: { id: 'e', name: 'Dev' }, changed: 1, names: ['eval.py'] }, NOW).detail!), '1 file changed: eval.py. Scores wait until they are back.');
  assert.equal(W.plain(W.waitCard({ kind: 'baseline', id: 'b', at: 1, evaluation: { id: 'e', name: 'Dev' } }, NOW).title), 'Measure the baseline of “Dev”');
  const f = W.waitCard({ kind: 'final', id: 'f', at: NOW - 9 * H, evaluation: { id: 'e', name: 'Dev' }, goal: { key: 'k', title: 'Beat the baseline by 0.02' } }, NOW);
  assert.equal(W.plain(f.title), 'Run the final test?');
  assert.equal(W.plain(f.detail!), 'The goal “Beat the baseline by 0.02” was reached 9 h ago. The final test has not seen this version.');
  const p = W.waitCard({ kind: 'paused', id: 'p', at: 1, evolution: { id: 'v', title: 'Raise nDCG@10', tried: 61, candidates: 200 }, reason: 'No model could be asked.' }, NOW);
  assert.equal(W.plain(p.title), 'The search “Raise nDCG@10” is paused');
  assert.equal(W.plain(p.detail!), 'No model could be asked. 61 of 200 tried.');
  const goal = W.waitCard({ kind: 'goal', id: 'g', at: NOW - 3 * H, session: { key: 'k', title: 'S' }, status: 'needs-you', title: 'Beat it', reason: 'A token' }, NOW);
  assert.equal(W.plain(goal.title), 'The goal “Beat it” needs you');
  assert.equal(goal.where?.text, 'Waiting for 3 h in');
});

test('each line of "Since you last looked" says what the app says elsewhere', () => {
  const line = (x: ResearchNews) => W.newsLine(x);
  const text = (x: ResearchNews) => W.plain(line(x).parts);
  assert.equal(text({ kind: 'runs', id: 'r', at: at(0, 2), total: 9, done: 7, failed: 2, other: 0, sessions: 3 }), '9 runs ended: 7 done, 2 failed');
  assert.equal(text({ kind: 'runs', id: 'r', at: at(0, 2), total: 3, done: 3, failed: 0, other: 0, sessions: 1 }), '3 runs ended: all done');
  assert.equal(text({ kind: 'runs', id: 'r', at: at(0, 2), total: 9, done: 7, failed: 0, again: 2, other: 0, sessions: 1 }), '9 runs ended: 7 done, 2 failed and were started again');
  assert.equal(text({ kind: 'runs', id: 'r', at: at(0, 2), total: 4, done: 1, failed: 1, again: 1, other: 1, sessions: 1 }), '4 runs ended: 1 done, 1 failed, 1 failed and was started again, 1 stopped');
  assert.equal(text({ kind: 'runs', id: 'r', at: at(0, 2), experiment: 'pre50b', total: 1, done: 1, failed: 0, other: 0, sessions: 0 }), '1 run of “pre50b” ended: done');
  assert.equal(line({ kind: 'runs', id: 'r', at: at(0, 2), total: 9, done: 7, failed: 2, other: 0, sessions: 3 }).meta, `3 sessions · ${W.clock(at(0, 2))}`);
  const oom = line({ kind: 'failures', id: 'f', at: 1, count: 4, reason: 'oom', setting: { name: 'batch', value: '4096' } });
  assert.equal(W.plain(oom.parts), '4 runs ran out of memory with batches of 4096, the same setting each time');
  assert.equal(oom.action, 'Look at the runs');
  assert.deepEqual(oom.pill, { failed: true });
  assert.equal(text({ kind: 'failures', id: 'f', at: 1, count: 2, reason: 'oom', setting: { name: 'learning_rate', value: '0.1' } }), '2 runs ran out of memory with learning rate 0.1, the same setting each time');
  assert.equal(text({ kind: 'failures', id: 'f', at: 1, count: 3, reason: 'other', why: 'Exit code 1' }), '3 runs failed the same way: Exit code 1');
  assert.equal(text({ kind: 'search', id: 's', at: 1, evolution: 'v', name: 'Raise nDCG@10 by reranking better', tried: 37, best: { mean: 0.447, gain: 0.035 } }), 'The search “Raise nDCG@10 by reranking better” tried 37 more versions: its best is 0.447, 0.035 better than the start');
  assert.equal(text({ kind: 'search', id: 's', at: 1, evolution: 'v', name: 'X', tried: 1 }), 'The search “X” tried 1 more version and found nothing better than its best so far');
  assert.equal(text({ kind: 'goal', id: 'g', at: 1, session: 'k', title: 'Beat the baseline by 0.02', round: 4, rounds: 12, value: 0.431, holds: 0, of: 1 }), 'The goal “Beat the baseline by 0.02” finished round 4 of 12: 0.431, not there yet');
  assert.equal(text({ kind: 'goal', id: 'g', at: 1, session: 'k', title: 'G', round: 2, rounds: 3, holds: 2, of: 3 }), 'The goal “G” finished round 2 of 3: 2 of 3 checks hold, not there yet');
  assert.equal(text({ kind: 'best', id: 'b', at: 1, evaluation: { id: 'e', name: 'Dev' }, mean: 0.447, std: 0.002, seeds: 3, against: { baseline: 'b', delta: 0.035, p: 0.01, verdict: 'better' } }), 'A new best of “Dev”: 0.447 ± 0.002, 0.035 better than the baseline');
  const f = line({ kind: 'finding', id: 'x', at: at(0, 2, 14), number: 7, verdict: 'supported', statement: 'Hard negatives help', learned: '+0.019' });
  assert.deepEqual(f.pill, { verdict: 'supported' });
  assert.equal(W.plain(f.parts), 'Hard negatives help: +0.019');
  assert.deepEqual(f.opens, { kind: 'finding', number: 7 });
  assert.equal(f.meta, `finding · ${W.clock(at(0, 2, 14))}`);
});

const run = (o: Partial<ResearchRun> & { id: string }): ResearchRun => ({ name: o.id, status: 'running', gpus: 0, ...o });

test('running and waiting: a run shows how far and how long is left; a waiting one why, in the status’s own words', () => {
  const w: ResearchWork = {
    runs: [run({ id: 'a', name: 'pre50b_30m', gpus: 4, startedAt: NOW - 3 * H, progress: { fraction: 0.61 }, endsAt: NOW + 5 * H }), run({ id: 'b', name: 'control', status: 'waiting', why: 'Waiting for 1 GPU', gpus: 1 }), run({ id: 'c', status: 'queued', why: 'Waits for the night (from 23:00)' })],
    searches: [],
    goals: [],
  };
  const l = W.workLines(w, NOW);
  assert.deepEqual(l.map((x) => [W.plain(x.parts), x.state, x.small]), [
    ['pre50b_30m', '61% · about 5 h left', '4 GPUs'],
    ['control', 'Waiting for a GPU', '1 GPU'],
    ['c', 'In line', undefined],
  ]);
  assert.equal(W.waitState({ status: 'waiting', why: 'Waits for the night (from 23:00)' }), 'Waits for the night (from 23:00)');
  assert.equal(W.runState(run({ id: 'x', startedAt: NOW - 2 * H }), NOW), 'Running 2 h');
  assert.equal(W.runState(run({ id: 'x', status: 'starting' }), NOW), 'Starting');
  assert.equal(W.workCount(w), 3);
});

test('evolutions and goals at work are lines too; more than four fold into counts', () => {
  const small: ResearchWork = { runs: [run({ id: 'a' })], searches: [{ id: 'v', title: 'Raise nDCG', tried: 37, candidates: 200 }], goals: [{ key: 'k', session: 'S', title: 'Beat it', round: 5, rounds: 12, status: 'working' }] };
  assert.deepEqual(W.workLines(small, NOW).map((x) => [W.plain(x.parts), x.state]), [['a', 'Running'], ['The goal “Beat it”', 'round 5 of 12'], ['The search “Raise nDCG”', '37 of 200 tried']]);
  const night: ResearchWork = { runs: [], searches: [{ id: 'v', title: 'S', tried: 1, candidates: 10, waits: 'Waits for the night (from 23:00)' }], goals: [] };
  assert.equal(W.workLines(night, NOW)[0].state, 'Waits for the night (from 23:00)');

  const crowd: ResearchWork = {
    runs: [
      run({ id: 'g1', name: 'pre50b_30m', startedAt: NOW - H, progress: { fraction: 0.61 }, endsAt: NOW + 5 * H }),
      ...Array.from({ length: 9 }, (_, i) => run({ id: `w${i}`, status: 'waiting', why: 'Waiting for 1 GPU', gpus: 1 })),
      ...Array.from({ length: 4 }, (_, i) => run({ id: `n${i}`, status: 'waiting', why: 'Waits for the night (from 23:00)' })),
    ],
    searches: [],
    goals: [],
  };
  const l = W.workLines(crowd, NOW);
  assert.deepEqual(l.map((x) => [W.plain(x.parts), x.state]), [['pre50b_30m', '61% · about 5 h left'], ['9 runs wait for a GPU', ''], ['4 runs wait for the night', 'from 23:00']]);
  assert.equal(W.workCount(crowd), 14);
  // Still too many after folding: the runs that go fold as well.
  const busy: ResearchWork = { runs: [...Array.from({ length: 6 }, (_, i) => run({ id: `g${i}` })), run({ id: 'w', status: 'waiting', why: 'Waiting for 1 GPU' })], searches: [], goals: [] };
  const b = W.workLines(busy, NOW);
  assert.ok(b.length <= W.WORK_LINES, `${b.length} lines`);
  assert.ok(b.some((x) => /more runs are going/.test(W.plain(x.parts))));
  assert.equal(W.workLines({ runs: [run({ id: 'w', status: 'waiting', why: 'In the cluster’s queue' })], searches: [], goals: [] }, NOW)[0].state, 'In the cluster’s queue');
});

test('this week reads GPU hours, what the models cost and how many sessions', () => {
  assert.deepEqual(W.weekWords({ gpuHours: 61, usd: 12.4, unpriced: false, sessions: 14 }), { hours: '61 GPU hours', models: `${(12.4).toLocaleString(undefined, { style: 'currency', currency: 'USD' })} of models · 14 sessions` });
  assert.equal(W.weekWords({ gpuHours: 1, usd: 0, unpriced: false, sessions: 1 }).hours, '1 GPU hour');
  assert.deepEqual(W.weekWords({ gpuHours: 0, usd: 0, unpriced: false, sessions: 0 }), { hours: 'No GPU hours', models: 'No model cost · 0 sessions' });
  assert.equal(W.weekWords({ gpuHours: 0, usd: 0, unpriced: true, sessions: 2 }).models, 'Model cost not known · 2 sessions');
});

test('a waiting run says when it should start, once: the reason’s own time is not shown beside it', () => {
  const at = NOW + 5 * H + 20 * 60_000;
  const why = 'Waiting for 1 GPU that is free: your other runs hold GPU 0. About 14:20, when “trainer” should end';
  assert.equal(W.waitState({ status: 'waiting', why, startsAbout: at }, NOW), `starts about ${W.clock(at)}`);
  assert.equal(W.waitState({ status: 'waiting', why }, NOW), 'Waiting for a GPU', 'no time known: the status, not the reason’s tail');
  // A night run that names its hour says it once.
  assert.equal(W.waitState({ status: 'waiting', why: 'Waits for the night (from 23:00)', startsAbout: at }, NOW), 'Waits for the night (from 23:00)');
  assert.equal(W.waitState({ status: 'queued', startsAbout: at }, NOW), 'In line');
  assert.equal(W.whenWords(at, NOW), W.clock(at));
  assert.equal(W.whenWords(NOW + 30 * H, NOW), `${W.clock(NOW + 30 * H)} tomorrow`);
  assert.equal(W.whenWords(NOW + 80 * H, NOW), `${W.clock(NOW + 80 * H)} on ${new Date(NOW + 80 * H).toLocaleDateString(undefined, { weekday: 'long' })}`);
  const w: ResearchWork = { runs: [run({ id: 'a', status: 'waiting', why: 'Waiting for 1 GPU', startsAbout: at }), ...Array.from({ length: 9 }, (_, i) => run({ id: `w${i}`, status: 'waiting', why: 'Waiting for 1 GPU', ...(i === 3 ? { startsAbout: NOW + 2 * H } : i === 4 ? { startsAbout: NOW + 4 * H } : {}) }))], searches: [], goals: [] };
  const l = W.workLines(w, NOW);
  assert.deepEqual(l.map((x) => [W.plain(x.parts), x.state]), [['10 runs wait for a GPU', `first about ${W.clock(NOW + 2 * H)}`]]);
  assert.equal(W.workLines({ runs: [run({ id: 'x', status: 'waiting', why: 'Waiting for 1 GPU' })], searches: [], goals: [] }, NOW)[0].state, 'Waiting for a GPU');
});

test('a step is named only when its name has room: newest first, nothing over a kept name or across the line, long ones cut', () => {
  assert.equal(W.cutLabel('short'), 'short');
  const long = W.cutLabel('sorted by length buckets for the batch');
  assert.equal(long.length, 28);
  assert.ok(long.endsWith('…'));
  // Three steps climbing right and up: the line goes up at each step.
  const pts = [
    { id: 'a', label: 'hard negatives', x: 100, y: 150 },
    { id: 'b', label: 'longer passages', x: 160, y: 110 },
    { id: 'c', label: 'length penalty earlier', x: 400, y: 60 },
  ];
  const line = [{ x: 60, y: 160 }, { x: 100, y: 160 }, { x: 100, y: 150 }, { x: 160, y: 150 }, { x: 160, y: 110 }, { x: 400, y: 110 }, { x: 400, y: 60 }, { x: 600, y: 60 }];
  const all = W.placeLabels(pts, line, 46, 600);
  // "hard negatives" (about 80 px) would cross the step up at x = 160: left out; the others have room.
  assert.deepEqual(all.map((l) => l.id), ['b', 'c']);
  assert.equal(all[1].text, 'length penalty earlier');
  // Close steps: the newest keeps its name, the older one that would overlap it is dropped.
  const close = W.placeLabels([{ id: 'p', label: 'first idea here', x: 300, y: 100 }, { id: 'q', label: 'second idea there', x: 320, y: 100 }], [{ x: 60, y: 120 }, { x: 600, y: 120 }], 46, 600);
  assert.deepEqual(close.map((l) => [l.id, l.end]), [['p', true], ['q', false]], 'the older one takes the other side');
  // With no room on either side beside the newer name, the older one goes.
  const none = W.placeLabels([{ id: 'p', label: 'first idea here', x: 80, y: 100 }, { id: 'q', label: 'second idea there', x: 90, y: 100 }], [{ x: 60, y: 120 }, { x: 600, y: 120 }], 46, 600);
  assert.deepEqual(none.map((l) => l.id), ['q']);
  // At the right edge a name reads leftwards from its point; with no room on either side it is left out.
  const edge = W.placeLabels([{ id: 'e', label: 'length penalty earlier', x: 590, y: 60 }], [{ x: 60, y: 100 }, { x: 600, y: 100 }], 46, 600);
  assert.equal(edge[0].end, true);
  assert.deepEqual(W.placeLabels([{ id: 'n', label: 'a very long name that does not fit', x: 100, y: 60 }], [], 46, 160), []);
  // Without a label there is no name; a long one is cut.
  assert.deepEqual(W.placeLabels([{ id: 'z', x: 100, y: 60 }], [], 46, 600), []);
  assert.equal(W.placeLabels([{ id: 'l', label: 'sorted by length buckets for the batch', x: 100, y: 60 }], [], 46, 600)[0].text.length, 28);
});

test('a run line opens its experiment by its group, though it names it by its title', () => {
  const l = W.newsLine({ kind: 'runs', id: 'r', at: 1, group: 'dense-retriever-lr-sweep', experiment: 'Learning rate and batch size sweep', total: 6, done: 6, failed: 0, other: 0, sessions: 0 });
  assert.equal(W.plain(l.parts), '6 runs of “Learning rate and batch size sweep” ended: all done');
  assert.deepEqual(l.opens, { kind: 'experiment', group: 'dense-retriever-lr-sweep' });
  assert.deepEqual(W.newsLine({ kind: 'failures', id: 'f', at: 1, group: 'g', experiment: 'T', count: 2, reason: 'oom' }).opens, { kind: 'experiment', group: 'g' });
});

console.log(`${n} tests ran`);
