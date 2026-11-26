// Script tests for the words and the chart of the Evolve pages (evolveWords.ts): an evolution's state in its header,
// on its evaluation's page and in the column, how a try stands to the start, what its score cell reads, the points,
// steps and span of the chart, and keeping the tries that did not change. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/experiments/evolveWords-test.ts && node dist/dev/evolveWords-test.js
import assert from 'node:assert/strict';
import type { Candidate, Evolution } from '@shared/evolve';

// evolveWords.ts reads number words from api.ts, which imports the page's own modules: some look at the address when they load.
const g = globalThis as any;
g.location ??= { pathname: '/', search: '', hash: '', origin: 'http://localhost', host: 'localhost', href: 'http://localhost/' };
g.window ??= g;
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const W = await import('./evolveWords');

const evo = (more: Partial<Evolution> = {}): Evolution => ({
  id: 'v1',
  evaluation: 'e1',
  from: '/p',
  files: ['rank.py', 'prompt.txt'],
  candidates: 200,
  seal: 1,
  status: 'running',
  startCommit: 'abc1234',
  start: { mean: 0.412, std: 0.001, values: [0.411, 0.412, 0.413], score: 's1' },
  tried: 37,
  failed: 4,
  calls: 41,
  createdAt: 1000,
  activeMs: 72 * 60_000,
  by: { who: 'you' },
  ...more,
});
let n = 0;
const cand = (more: Partial<Candidate> = {}): Candidate => ({
  id: `k${++n}`,
  evolution: 'v1',
  n,
  island: 0,
  status: 'scored',
  summary: 'changed it',
  model: 'quick',
  changed: [],
  createdAt: 1000 + n,
  ...more,
});

assert.equal(W.evolveTitle(evo({ aim: ' Make it faster ' })), 'Make it faster');
assert.equal(W.evolveTitle(evo()), 'rank.py, prompt.txt');

// the header's line
assert.deepEqual(W.stateLine(evo(), 72 * 60_000).parts, ['Running', '37 of 200 tried', '4 failed', '1 h 12 min']);
assert.deepEqual(W.stateLine(evo({ failed: 0 }), 5_000).parts, ['Running', '37 of 200 tried', 'under a minute']);
assert.deepEqual(W.stateLine(evo({ status: 'paused', why: 'The model could not be asked: no.' }), 0), { tone: 'paused', parts: ['Paused'], why: 'The model could not be asked: no.' });
assert.deepEqual(W.stateLine(evo({ status: 'paused' }), 0), { tone: 'paused', parts: ['Paused'] });
// A night evolution by day: it says when it goes on, and its time does not count on.
const waits = 'Waits for the night (from 23:00)';
assert.deepEqual(W.stateLine(evo({ when: 'night', waits }), 60_000), { tone: 'waiting', parts: [waits, '37 of 200 tried', '4 failed'] });
assert.deepEqual(W.stateLine(evo({ when: 'night', waits, status: 'starting', tried: 0, failed: 0 }), 0), { tone: 'waiting', parts: [waits] });
const none = 'Waits for the night: none is set. Give Night two different times in Where runs go';
assert.deepEqual(W.stateLine(evo({ when: 'night', waits: none, failed: 0 }), 0).parts, [none, '37 of 200 tried']);
assert.deepEqual(W.stateLine(evo({ when: 'night', status: 'paused' }), 0), { tone: 'paused', parts: ['Paused'] });
assert.equal(W.workedMs({ activeMs: 5000, status: 'running', waits }, 1000, 61_000), 5000);
assert.equal(W.workedMs({ activeMs: 5000, status: 'running' }, 1000, 61_000), 65_000);
assert.deepEqual(W.stateLine(evo({ status: 'done', why: 'No new best in the last 40' }), 0).parts, ['Done: no new best in the last 40']);
assert.deepEqual(W.stateLine(evo({ status: 'done', why: '200 tried' }), 0).parts, ['Done: all 200 tried']);
assert.deepEqual(W.stateLine(evo({ status: 'done', why: 'Its 1 hour is up' }), 0).parts, ['Done: its time is up']);
assert.deepEqual(W.stateLine(evo({ status: 'done', why: 'Its 2.5 hours are up' }), 0).parts, ['Done: its time is up']);
assert.deepEqual(W.stateLine(evo({ status: 'stopped', why: 'Stopped by you' }), 0).parts, ['Stopped by you']);
assert.deepEqual(W.stateLine(evo({ status: 'failed', why: 'It broke' }), 0), { tone: 'failed', parts: ['Failed:'], why: 'It broke' });
assert.deepEqual(W.splitWhy('It broke\n\nThe end of its log:\nboom'), { first: 'It broke', rest: 'The end of its log:\nboom' });
assert.deepEqual(W.splitWhy(undefined), { first: '', rest: '' });
assert.equal(W.workedMs({ activeMs: 1000, status: 'running' }, 5000, 7000), 3000);
assert.equal(W.workedMs({ activeMs: 1000, status: 'paused' }, 5000, 7000), 1000);

// how it stands to the start
assert.deepEqual(W.gainStanding(0.035), { tone: 'better', long: '0.035 better than the start', short: '0.035 better' });
assert.deepEqual(W.gainStanding(-0.0021), { tone: 'worse', long: '0.0021 worse than the start', short: '0.0021 worse' });
assert.equal(W.gainStanding(1e-17, 0.4)!.long, 'The same as the start');
assert.equal(W.gainStanding(undefined), null);

// its row on the evaluation's page, the column's line
assert.equal(W.rowWords(evo()).text, 'Running · 37 of 200 tried');
assert.equal(W.rowWords(evo({ status: 'paused' })).text, 'Paused · 37 of 200 tried');
assert.equal(W.rowWords(evo({ status: 'stopped' })).text, 'Stopped');
assert.equal(W.rowWords(evo({ status: 'failed' })).text, 'Failed');
const done = W.rowWords({ ...evo({ status: 'done', best: 'k1' }), bestGain: 0.035 });
assert.equal(done.text, 'Done');
assert.equal(done.standing!.long, '0.035 better than the start');
assert.equal(W.rowWords(evo({ status: 'done' })).text, 'Done · nothing beat the start');
assert.equal(W.columnWords(evo()), 'Evolving · 37 of 200');
// a night evolution by day: it waits, on its row and in the column, as its own page says
const byDay = { waits: 'Waits for the night (from 23:00)' };
assert.equal(W.rowWords(evo(byDay)).text, 'Waits for the night (from 23:00) · 37 of 200 tried');
assert.equal(W.rowWords(evo({ ...byDay, status: 'starting' })).text, 'Waits for the night (from 23:00)');
assert.equal(W.rowWords(evo({ ...byDay, status: 'paused' })).text, 'Paused · 37 of 200 tried');
assert.equal(W.columnWords(evo(byDay)), 'Waits for the night (from 23:00)');
assert.equal(W.columnWords(evo({ waits: 'Waits for the night: none is set. Give Night two different times in Where runs go' })), 'Waits for the night');
assert.equal(W.waitsWords(evo()), null);
const going = W.evolvingBy([evo({ id: 'v3', status: 'paused' }), evo({ id: 'v2' }), evo({ id: 'v1' }), evo({ id: 'v4', evaluation: 'e2', status: 'starting' }), evo({ id: 'v5', evaluation: 'e3', status: 'done' })]);
assert.deepEqual([...going].map(([k, v]) => [k, v.id]), [['e1', 'v2'], ['e2', 'v4']]);

// a try's score cell
const quick = { value: 0.415, score: 's' };
const full = { mean: 0.431, std: 0.002, values: [0.429, 0.431, 0.433], score: 'f' };
assert.deepEqual(W.tryScore(cand({ status: 'proposing' }), 3), { value: '', note: 'Writing a change…', failed: false });
assert.deepEqual(W.tryScore(cand({ status: 'scoring' }), 3), { value: '', note: 'Scoring…', failed: false });
assert.deepEqual(W.tryScore(cand({ status: 'checking', quick }), 3), { value: '0.415', note: 'Checking with all seeds…', failed: false });
assert.deepEqual(W.tryScore(cand({ quick }), 3), { value: '0.415', note: 'first seed only', failed: false });
assert.deepEqual(W.tryScore(cand({ quick }), 1), { value: '0.415', note: '', failed: false });
assert.deepEqual(W.tryScore(cand({ quick, full }), 3), { value: '0.431 ± 0.002', note: '', failed: false });
assert.equal(W.tryScore(cand({ status: 'failed', quick }), 3).failed, true);
assert.equal(W.modelWords('strong'), 'Strong');
assert.equal(W.builtOnWords(undefined), 'The start');
assert.equal(W.builtOnWords(12), '#12');

// evolve_get's step
assert.equal(W.readWords(null), '');
assert.equal(W.readWords({ status: 'running', tried: 3, candidates: 50 }), 'Running · 3 of 50 tried · nothing better yet');
assert.equal(W.readWords({ status: 'done', best: { gain: 0.035 } }), 'Done · best is 0.035 better than the start');
assert.equal(W.readWords({ status: 'done', best: null }), 'Done · nothing beat the start');
assert.equal(W.readWords({ status: 'starting' }), 'Starting');

// the chart: tries in any order, failed ones apart, the best so far as steps from the start
const tries = [
  cand({ n: 4, status: 'failed' }),
  cand({ n: 3, quick: { value: 0.4, score: 's' }, full: { ...full, mean: 0.41 } }),
  cand({ n: 1, quick: { value: 0.405, score: 's' } }),
  cand({ n: 5, quick, full }),
  cand({ n: 2, quick, full: { ...full, mean: 0.42 } }),
  cand({ n: 6, status: 'proposing' }),
];
const chart = W.chartData(tries, 0.412, 'higher');
assert.deepEqual(
  chart.points.map((p) => [p.n, p.value, p.full]),
  [
    [1, 0.405, false],
    [2, 0.42, true],
    [3, 0.41, true],
    [5, 0.431, true],
  ],
);
assert.deepEqual(chart.failed.map((f) => f.n), [4]);
assert.deepEqual(chart.steps, [
  { n: 0, value: 0.412 },
  { n: 2, value: 0.42 },
  { n: 5, value: 0.431 },
]);
assert.equal(chart.last, 6);
assert.ok(chart.lo < 0.405 && chart.hi > 0.431);
// lower is better
assert.deepEqual(W.chartData(tries, 0.412, 'lower').steps.map((s) => s.value), [0.412, 0.41]);
// before the start is scored, and with nothing at all
assert.deepEqual(W.chartData([], undefined, 'higher').steps, []);
assert.ok(W.chartData([], undefined, 'higher').hi > W.chartData([], undefined, 'higher').lo);
// one far off among many does not flatten the rest; the start and the best are always inside
const many = Array.from({ length: 40 }, (_, i) => cand({ n: i + 1, quick: { value: 0.41 + (i % 5) * 0.001, score: 's' } }));
many.push(cand({ n: 41, quick: { value: 0, score: 's' } }), cand({ n: 42, quick, full }));
const wide = W.chartData(many, 0.412, 'higher');
assert.ok(wide.lo > 0.3 && wide.lo < 0.41, String(wide.lo));
assert.ok(wide.hi > 0.431);
// 2,000 tries
const lots = Array.from({ length: 2000 }, (_, i) => cand({ n: i + 1, quick: { value: Math.sin(i), score: 's' } }));
assert.equal(W.chartData(lots, 0, 'higher').points.length, 2000);

// reading again keeps what did not change
const a = cand({ n: 1, quick });
const b = cand({ n: 2, status: 'scoring' });
const before = [b, a];
assert.equal(W.keepSame(before, [{ ...b }, { ...a }]), before);
const next = W.keepSame(before, [{ ...b, status: 'scored', quick }, { ...a }]);
assert.notEqual(next, before);
assert.equal(next[1], a);
assert.notEqual(next[0], b);
const grown = W.keepSame(before, [cand({ n: 3 }), { ...b }, { ...a }]);
assert.equal(grown[1], b);
assert.equal(grown[2], a);

console.log('evolveWords: ok');
