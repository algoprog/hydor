// Script tests for the words and states of the evaluation pages (evalWords.ts): how a score stands to the baseline and
// how likely chance alone is, what the baseline's, latest score's and final test's tiles show, the column's line, and
// the sealed files that differ. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/experiments/evalWords-test.ts && node dist/dev/evalWords-test.js
import assert from 'node:assert/strict';
import type { EvalScore, Evaluation } from '@shared/evaluations';

// evalWords.ts reads number words from api.ts, which imports the page's own modules: some look at the address when they load.
const g = globalThis as any;
g.location ??= { pathname: '/', search: '', hash: '', origin: 'http://localhost', host: 'localhost', href: 'http://localhost/' };
g.window ??= g;
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const W = await import('./evalWords');

let n = 0;
const score = (more: Partial<EvalScore> = {}): EvalScore => ({
  id: `c${++n}`,
  evaluation: 'e1',
  seal: 1,
  kind: 'score',
  status: 'done',
  folder: '/p',
  runs: ['a', 'b', 'c'],
  seeds: [1, 2, 3],
  values: [0.43, 0.431, 0.432],
  mean: 0.431,
  std: 0.001,
  by: { who: 'you' },
  createdAt: 1000 + n,
  ...more,
});
const ev = (more: Partial<Evaluation> = {}): Evaluation => ({
  id: 'e1',
  name: 'Dev',
  cwd: '/p',
  command: 'python eval.py --seed {seed}',
  metric: 'ndcg@10',
  better: 'higher',
  seeds: [1, 2, 3],
  protect: ['eval.py'],
  createdAt: 1,
  updatedAt: 1,
  seal: { n: 1, at: 1, files: 1, bytes: 1 },
  state: { ok: true, checkedAt: 1, changed: [] },
  finals: 0,
  ...more,
});
const against = (delta: number, p: number | null, verdict: 'better' | 'worse' | 'same') => ({ baseline: 'c0', delta, p, verdict });

// ---- numbers
{
  assert.equal(W.small(0.0004), '0.0004', 'a small spread is not written in e-notation');
  assert.equal(W.small(0), '0');
  assert.equal(W.small(2e-9), '2.0e-9');
  assert.equal(W.small(0.431 - 0.412, 3), '0.019', 'the rounding of a difference does not show');
  assert.equal(W.meanStd(score()), '0.431 ± 0.001');
  assert.equal(W.meanStd(score({ values: [0.5], mean: 0.5, std: 0 })), '0.5', 'one value has no spread');
  assert.equal(W.meanStd(score({ values: [], mean: undefined, std: undefined })), '–');
}

// ---- standing
{
  assert.equal(W.standing(undefined), null);
  assert.deepEqual(W.standing(against(0.431 - 0.412, 0.01, 'better')), { tone: 'better', long: '0.019 better than the baseline', short: '0.019 better' });
  // Lower is better: the verdict says which way, the difference is said without its sign.
  assert.equal(W.standing(against(-0.2, null, 'better'))!.long, '0.2 better than the baseline');
  assert.equal(W.standing(against(-0.004, 0.02, 'worse'))!.long, '0.004 worse than the baseline');
  assert.equal(W.standing(against(0.001, 0.6, 'same'))!.long, 'The same as the baseline, within the noise');
  assert.equal(W.standing(against(0, null, 'same'))!.long, 'The same as the baseline', 'no test was made, so noise is not claimed');
  assert.equal(W.standing(against(0, null, 'same'))!.short, 'same as baseline');
}

// ---- chance
{
  assert.equal(W.chanceWords(undefined), '');
  assert.equal(W.chanceWords(against(1, null, 'better')), '', 'only when a test was made');
  assert.equal(W.chanceWords(against(1, 0.00001, 'better')), 'A difference like this would happen by chance less than 1 time in 1,000');
  assert.match(W.chanceWords(against(1, 0.01, 'better')), /about 1 time in 100$/);
  assert.match(W.chanceWords(against(1, 0.0123, 'better')), /about 1 time in 80$/);
  assert.match(W.chanceWords(against(1, 0.3, 'same')), /about 1 time in 3$/);
  assert.match(W.chanceWords(against(1, 0.65, 'same')), /about 7 times in 10$/);
  assert.match(W.chanceWords(against(1, 0.99, 'same')), /about 9 times in 10$/);
  for (const p of [0, 0.002, 0.049, 0.2, 0.5, 1]) assert.ok(!/p-value|p =/.test(W.chanceWords(against(1, p, 'same'))), 'plain words');
}

// ---- tiles
{
  const e = ev();
  assert.deepEqual(W.baselineTile(e, []), { state: 'none' });
  const going = score({ kind: 'baseline', status: 'running', values: [], mean: undefined });
  assert.equal(W.baselineTile(e, [going]).state, 'measuring');
  const base = score({ kind: 'baseline' });
  const measured = W.baselineTile(ev({ baseline: base.id }), [going, base]);
  assert.equal(measured.state, 'measured');
  assert.equal(measured.score, base);
  assert.equal(measured.again, going, 'measured again while the old one stands');
  assert.equal(W.baselineTile(ev({ seal: { n: 2, at: 1, files: 1, bytes: 1 } }), [going]).state, 'none', 'one of an older seal is not being measured for this one');

  const older = score({ seal: 1 });
  const two = ev({ seal: { n: 2, at: 1, files: 1, bytes: 1 } });
  assert.equal(W.latestScore(two, [older]), undefined, 'an older seal’s score is not the latest');
  const failed = score({ status: 'failed', values: [], mean: undefined });
  const done = score();
  assert.equal(W.latestScore(e, [failed, score({ kind: 'baseline' }), done]), done);

  assert.equal(W.finalTile(e, []).state, 'unset');
  const withFinal = ev({ final: { command: 'x' } });
  assert.equal(W.finalTile(withFinal, []).state, 'unrun');
  assert.equal(W.finalTile(withFinal, [score({ kind: 'final', status: 'waiting' })]).state, 'running');
  assert.equal(W.finalTile(withFinal, [score({ kind: 'final' })]).state, 'done');
  assert.equal(W.finalTile(withFinal, [failed, done]).state, 'failed', 'the newest says where it stands');
  assert.equal(W.finalTile(ev({ final: { command: 'x' }, seal: two.seal }), [score({ kind: 'final', seal: 1 })]).state, 'unrun');
  assert.equal(W.finalRunsWords(1), 'Run 1 time since it was sealed');
  assert.equal(W.finalRunsWords(2), 'Run 2 times since it was sealed');
}

// ---- the chart, the column's line, running words
{
  const e = ev();
  const a = score({ createdAt: 1 });
  const b = score({ createdAt: 2 });
  assert.deepEqual(W.chartScores(e, [b, a, score({ status: 'failed', mean: undefined }), score({ kind: 'baseline' }), score({ seal: 0 })]), [a, b]);

  assert.deepEqual(W.entryLine({ state: e.state }, false), { changed: false, text: 'No score yet', standing: null });
  assert.equal(W.entryLine({ state: e.state, last: a }, true).text, 'Scoring…');
  const line = W.entryLine({ state: { ok: false, checkedAt: 1, changed: [] }, last: score({ against: against(0.019, 0.01, 'better') }) }, false);
  assert.deepEqual([line.changed, line.text, line.standing], [true, '0.431', null], 'beside "changed" the standing is left out');
  assert.equal(W.entryLine({ state: e.state, last: score({ against: against(0.019, 0.01, 'better') }) }, false).standing?.short, '0.019 better');

  assert.equal(W.openWords(score({ status: 'waiting' }), 0), 'Waiting');
  assert.equal(W.openWords(score({ status: 'running' }), 2), 'Running · 2 of 3');
  assert.equal(W.openWords(score({ status: 'running', runs: ['a'] }), 0), 'Running');
}

// ---- sealed files, seeds, dates
{
  assert.deepEqual(W.pathWords('held-out:qrels.tsv'), { held: true, name: 'qrels.tsv' });
  assert.deepEqual(W.pathWords('data/qrels.tsv'), { held: false, name: 'data/qrels.tsv' });
  const s = W.changedSummary({ changed: [{ path: 'eval.py', what: 'changed' }, { path: 'held-out:q.tsv', what: 'missing' }, { path: 'x', what: 'added' }], more: 4 });
  assert.deepEqual([s.count, s.names, s.held, s.more], [7, ['eval.py', 'q.tsv'], [false, true], 5]);
  assert.equal(W.changedSummary({ changed: [{ path: 'a', what: 'changed' }] }).more, 0);
  assert.equal(W.canPutBack({ changed: [{ path: 'x', what: 'added' }] }), false, 'an added file stays');
  assert.equal(W.canPutBack({ changed: [{ path: 'x', what: 'added' }, { path: 'y', what: 'missing' }] }), true);
  assert.equal(W.canPutBack({ changed: [{ path: 'x', what: 'added' }], more: 3 }), true, 'what is not listed may be');
  assert.equal(W.filesWords(1), '1 file');
  assert.equal(W.seedsWords(ev()), '3 seeds');
  assert.equal(W.seedsWords(ev({ seeds: [7] })), '1 seed');
  assert.equal(W.seedsWords(ev({ command: 'python eval.py' })), '');
  assert.equal(W.betterWords('lower'), 'lower is better');
  const now = new Date(2026, 10, 26).getTime();
  assert.ok(!W.sealDate(new Date(2026, 10, 24).getTime(), now).includes('2026'));
  assert.ok(W.sealDate(new Date(2025, 10, 24).getTime(), now).includes('2025'), 'another year is said');
}

console.log('evaluation words: ok');
