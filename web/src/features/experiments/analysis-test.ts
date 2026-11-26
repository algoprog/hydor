// Script tests for what the Experiments pages work out from runs (analysis.ts): the sections metrics fall into, smoothing
// (TensorBoard's debiased average), a metric along another one, the y range, the key metrics of an experiment, the
// hyperparameters that differ, Spearman's ρ and the correlation ratio, how much each hyperparameter matters, the queue's
// order, the number a claim against a baseline starts from. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/experiments/analysis-test.ts && node dist/dev/analysis-test.js
import assert from 'node:assert/strict';
import type { RunRecord } from '@shared/experiments';

// analysis.ts reads number words from api.ts, which imports the page's own modules: some look at the address when they load.
const g = globalThis as any;
g.location ??= { pathname: '/', search: '', hash: '', origin: 'http://localhost', host: 'localhost', href: 'http://localhost/' };
g.window ??= g;
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const A = await import('./analysis');

const close = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= eps, `${a} is not ${b}`);
let n = 0;
/** A run with these hyperparameters and last values (the metric names in `curves` were read many times). */
const run = (more: Partial<RunRecord> & { last?: Record<string, number>; curves?: string[] } = {}): RunRecord => {
  const { last, curves, ...rest } = more;
  n++;
  return {
    id: `r${n}`,
    status: 'done',
    createdAt: 1000 + n,
    command: 'python train.py',
    ...rest,
    ...(last ? { metrics: { last, best: last, step: {}, repeated: curves ?? [] } as any } : {}),
  } as RunRecord;
};

// ---- sectionsOf
{
  const s = A.sectionsOf(['train_loss', 'dev_nll', 'lr', 'val/acc', 'train/acc', 'dev_bpb', 'tokens_seen', 'gate_w/x']);
  assert.deepEqual(
    s.map((x) => x.id),
    ['p:dev', 'p:val', 'p:train', 'other'],
    'held-out prefixes by first appearance, then train, then Other',
  );
  assert.deepEqual(s[0].metrics, ['dev_nll', 'dev_bpb'], 'inside a section, the ones that matter first (dev_nll came first)');
  assert.deepEqual(s[2].metrics.sort(), ['train/acc', 'train_loss']);
  assert.equal(s[0].own, true);
  assert.equal(s[3].own, false);
  assert.equal(s[3].folded, true, 'Other is folded when there is another section');
  assert.deepEqual(s[3].metrics.sort(), ['gate_w/x', 'lr', 'tokens_seen'], 'a prefix of one metric (gate_w) joins the rest');
  assert.equal(s[0].folded, false);

  const t = A.sectionsOf(['lr', 'elapsed_s']);
  assert.deepEqual(t.map((x) => x.id), ['other']);
  assert.equal(t[0].folded, false, 'Other alone is not folded');

  const u = A.sectionsOf(['accuracy', 'f1', 'bw/a', 'bw/b', 'aa/x', 'aa/y', 'lr']);
  assert.deepEqual(u.map((x) => x.id), ['metrics', 'p:aa', 'p:bw', 'other'], 'Metrics, then other prefixes A to Z, then Other');
  assert.equal(u[1].label, 'aa');
  assert.deepEqual(A.sectionsOf([]), []);
  const v = A.sectionsOf(['Dev_nll', 'dev_bpb', 'Train/loss']);
  assert.deepEqual(v.map((x) => x.id), ['p:dev', 'p:train'], 'split words match whatever their case');
  assert.equal(v[0].label, 'Dev', 'the word as written, first seen');
}

// ---- smooth
{
  const pts: [number, number][] = [[0, 1], [1, 3], [2, 5]];
  assert.equal(A.smooth(pts, 0), pts);
  const out = A.smooth(pts, 0.5);
  // last: .5 -> .25 + 1.5 = 1.75 -> .875 + 2.5 = 3.375; divided by 1 - w^k
  close(out[0][1], 1);
  close(out[1][1], 1.75 / 0.75);
  close(out[2][1], 3.375 / 0.875);
  assert.deepEqual(out.map((p) => p[0]), [0, 1, 2]);
  const gap = A.smooth([[0, 2], [1, NaN], [2, 2]], 0.9);
  close(gap[0][1], 2);
  assert.ok(Number.isNaN(gap[1][1]), 'a gap stays a gap');
  close(gap[2][1], 2, 1e-12);
  const flat = A.smooth(Array.from({ length: 20 }, (_, i) => [i, 7] as [number, number]), 0.99);
  for (const p of flat) close(p[1], 7, 1e-9);
}

// ---- alongX
{
  const x: [number, number][] = [[0, 0], [10, 100], [20, 250]];
  const y: [number, number][] = [[5, 9], [10, 8], [15, 7], [25, 6]];
  assert.deepEqual(A.alongX(y, x), [[0, 9], [100, 8], [100, 7], [250, 6]]);
  assert.deepEqual(A.alongX([[1, 1]], [[5, 50]]), [], 'no x at or before the step: dropped');
  assert.deepEqual(A.alongX([[3, 1], [4, 2]], [[2, 9], [0, 1]]), [[9, 1], [9, 2]], 'x need not come sorted');
  assert.deepEqual(A.alongX([[1, 5], [2, 6]], [[0, 9], [1, 3]]), [[3, 5], [3, 6]]);
  assert.deepEqual(A.alongX([[1, 5], [2, 6], [3, 7]], [[0, 9], [1, 3], [3, 2]]), [[2, 7], [3, 5], [3, 6]], 'sorted by x');
}

// ---- increasing, xChoices
{
  assert.equal(A.increasing([[0, 1], [1, 2], [2, 2]]), true);
  assert.equal(A.increasing([[0, 1], [1, 0]]), false);
  assert.equal(A.increasing([[0, 5], [1, 5]]), false, 'a constant is no axis');
  assert.equal(A.increasing([[0, 5]]), false);
  const s1 = { tokens: [[0, 0], [1, 10]], loss: [[0, 3], [1, 2]], world: [[0, 4], [1, 4]] } as any;
  const s2 = { tokens: [[0, 0], [1, 20]], elapsed: [[0, 1], [1, 5]], loss: [[0, 1], [1, 2]] } as any;
  assert.deepEqual(A.xChoices([s1, s2, undefined]), ['tokens', 'elapsed']);
  assert.deepEqual(A.xChoices([{ tokens: [[0, 0], [1, 1]] }, { tokens: [[0, 5], [1, 1]] }] as any), [], 'one run where it goes down rules it out');
  assert.deepEqual(A.xChoices([{ one: [[0, 1]] }] as any), []);
}

// ---- domainOf
{
  assert.equal(A.domainOf([]), null);
  assert.equal(A.domainOf([NaN, Infinity]), null);
  const d = A.domainOf([0, 10, NaN])!;
  close(d[0], -0.8);
  close(d[1], 10.8);
  const flat = A.domainOf([5, 5])!;
  assert.ok(flat[0] < 5 && flat[1] > 5);
  const vals = Array.from({ length: 101 }, (_, i) => i).concat([10000]);
  const o = A.domainOf(vals, true)!;
  // percentiles 5 and 95 of 0..100 and a spike: about 5 and 95, padded 10%
  assert.ok(o[1] < 120 && o[1] > 95, `${o[1]}`);
  assert.ok(o[0] < 5 && o[0] > -15, `${o[0]}`);
  assert.equal(A.domainOf([-1, 0, -5], false, true), null, 'log: nothing above 0');
  const l = A.domainOf([-1, 1, 100], false, true)!;
  assert.ok(l[0] > 0 && l[0] < 1 && l[1] > 100, 'log: only values above 0');
  const p = A.domainOf([1, 2, 3, 4, 5], true)!;
  close(p[0], 1.2 - 0.36, 1e-9);
}

// ---- keyMetricsOf
{
  const runs = [
    run({ last: { dev_nll: 1.2, train_loss: 1.5, tokens: 100, lr: 0.1, final_acc: 0.5 }, curves: ['dev_nll', 'train_loss', 'tokens', 'lr'] }),
    run({ last: { dev_nll: 1.1, train_loss: 1.4, tokens: 90, lr: 0.1 }, curves: ['dev_nll', 'train_loss', 'tokens', 'lr'] }),
    run({ last: { dev_nll: 1.3, tokens: 80 }, curves: ['dev_nll'] }),
  ];
  const k = A.keyMetricsOf(runs, 4);
  assert.deepEqual(k, ['dev_nll', 'train_loss'], k.join());
  assert.deepEqual(A.keyMetricsOf(runs, 1), ['dev_nll']);
  assert.ok(!A.keyMetricsOf(runs, 9).includes('final_acc'), 'one run of three: not enough');
  assert.deepEqual(A.keyMetricsOf([runs[0]], 9).slice(0, 3), ['dev_nll', 'train_loss', 'final_acc'], 'one run: its own; the curves first');
  assert.deepEqual(A.keyMetricsOf([], 4), []);
  assert.ok(!A.keyMetricsOf(runs, 9).includes('tokens'), 'bookkeeping never');
}

// ---- bestRun, valueOf
{
  const a = run({ last: { dev_nll: 1.5, acc: 0.5 } });
  const b = run({ last: { dev_nll: 1.2, acc: 0.4 } });
  const c = run({ last: { acc: 0.9 } });
  assert.equal(A.bestRun([a, b, c], 'dev_nll')?.id, b.id, 'lower is better by name');
  assert.equal(A.bestRun([a, b, c], 'acc')?.id, c.id);
  assert.equal(A.bestRun([a, b], 'dev_nll', 'last')?.id, b.id);
  assert.equal(A.bestRun([a, b], 'none'), undefined);
  const told = run({ last: { weird: 1 }, better: { weird: 'min' } });
  const told2 = run({ last: { weird: 3 } });
  assert.equal(A.bestRun([told2, told], 'weird')?.id, told.id, 'what a run says');
  const bestKept = run({ metrics: { last: { dev_nll: 2 }, best: { dev_nll: 1 }, step: {} } as any });
  assert.equal(A.valueOf(bestKept, 'dev_nll', 'best'), 1);
  assert.equal(A.valueOf(bestKept, 'dev_nll'), 2);
  assert.equal(A.valueOf(bestKept, 'x'), undefined);
}

// ---- params
{
  const a = run({ params: { lr: 0.1, mode: 'a', out: '/x/1', same: 3 }, seed: 1 });
  const b = run({ params: { lr: 0.01, mode: 'a', out: '/x/2', same: 3, extra: true }, seed: 1 });
  const ps = A.allParams([a, b]);
  assert.deepEqual([...ps].sort(), ['extra', 'lr', 'mode', 'out', 'same', 'seed']);
  assert.equal(ps[0], 'lr', 'the newest run’s order first') ;
  assert.deepEqual(A.differingParams([a, b]).sort(), ['extra', 'lr'], 'output names and a seed that is the same are left out; a missing one differs');
  assert.deepEqual(A.differingParams([a]), []);
  assert.deepEqual(A.paramsOf(a).seed, 1);
  assert.equal(A.paramText(0.5), '0.5');
  assert.equal(A.paramText(true), 'true');
  assert.equal(A.paramText(false), 'false');
  assert.equal(A.paramText(undefined), '–');
  assert.equal(A.paramText('full'), 'full');
  assert.equal(A.paramText(1234567), '1.23e+6');
}

// ---- spearman, corrRatio
{
  close(A.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  close(A.spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  close(A.spearman([1, 2, 3, 4], [1, 100, 2, 1000]), 0.8);
  // ties get their mean rank: ranks 1, 2.5, 2.5, 4 and 1, 2, 3.5, 3.5 give 3.75 / 4.5
  close(A.spearman([1, 2, 2, 3], [1, 2, 3, 3]), 3.75 / 4.5, 1e-12);
  assert.equal(A.spearman([1, 2], [1, 2]), null, 'under 3 pairs');
  assert.equal(A.spearman([1, 1, 1], [1, 2, 3]), null, 'no variation');
  assert.equal(A.spearman([1, 2, 3], [4, 4, 4]), null);
  // groups a: 1,2 b: 3,4 -> means 1.5 / 3.5, grand 2.5; SSB = 2·1 + 2·1 = 4; SST = 2.25+.25+.25+2.25 = 5
  close(A.corrRatio(['a', 'a', 'b', 'b'], [1, 2, 3, 4]), Math.sqrt(4 / 5));
  close(A.corrRatio(['a', 'b', 'a', 'b'], [1, 1, 3, 3]), 0);
  close(A.corrRatio(['a', 'b', 'c'], [1, 2, 3]), 1);
  assert.equal(A.corrRatio(['a', 'a', 'a'], [1, 2, 3]), null, 'one value only');
  assert.equal(A.corrRatio(['a', 'b'], [1, 2]), null, 'under 3 runs');
  assert.equal(A.corrRatio(['a', 'b', 'a'], [2, 2, 2]), null, 'the metric never varies');
}

// ---- importanceOf
{
  const mk = (lr: number | string, mode: string, noise: number, y: number, dir?: 'max') =>
    run({ params: { lr: lr as any, mode, noise }, last: { dev_nll: y, acc: y }, ...(dir ? { better: { acc: dir } } : {}) });
  const runs = [mk(0.001, 'full', 3, 1.0), mk(0.01, 'full', 1, 1.2), mk('0.1', 'freeze', 2, 1.6), mk(1, 'freeze', 4, 2.1), mk(10, 'freeze', 3, 2.5)];
  const imp = A.importanceOf(runs, ['lr', 'mode', 'noise', 'seed'], 'dev_nll');
  assert.deepEqual(imp.map((i) => i.param), ['lr', 'mode', 'noise'], 'seed is not there; strongest first');
  assert.equal(imp[0].kind, 'num');
  close(imp[0].rho, 1);
  assert.equal(imp[0].higherIsBetter, false, 'higher lr, higher (worse) loss');
  assert.equal(imp[0].n, 5);
  assert.equal(imp[1].kind, 'cat');
  assert.equal(imp[1].bestValue, 'full', 'the lowest mean loss');
  assert.ok(imp[1].score > 0.8 && imp[1].score < 1);
  assert.ok(imp[2].score < imp[1].score);
  // the same values against a metric where more is better (acc, said by name)
  const imp2 = A.importanceOf(runs, ['lr', 'mode'], 'acc');
  assert.equal(imp2[0].higherIsBetter, true);
  assert.equal(imp2[1].bestValue, 'freeze');
  assert.deepEqual(A.importanceOf(runs.slice(0, 2), ['lr'], 'dev_nll'), [], 'under 3 runs');
  assert.deepEqual(A.importanceOf([mk(1, 'x', 1, 1), mk(1, 'x', 1, 2), mk(1, 'x', 1, 3)], ['lr'], 'dev_nll'), [], 'a single value');
}

// ---- queueOrder, runtimeOf
{
  const r1 = run({ status: 'done', endedAt: 500 });
  const r2 = run({ status: 'done', endedAt: 900 });
  const w1 = run({ status: 'waiting', createdAt: 100, priority: 0 });
  const w2 = run({ status: 'waiting', createdAt: 200, priority: 0 });
  const w3 = run({ status: 'queued', createdAt: 300, priority: 5 });
  const g1 = run({ status: 'running', startedAt: 50 });
  const g2 = run({ status: 'running', startedAt: 80 });
  const order = A.queueOrder([r1, w2, g1, r2, w3, w1, g2]).map((r) => r.id);
  assert.deepEqual(order, [g2.id, g1.id, w3.id, w1.id, w2.id, r2.id, r1.id]);
  assert.equal(A.runtimeOf(run({ startedAt: 1000, endedAt: 4000 })), 3000);
  assert.equal(A.runtimeOf(run({ startedAt: 1000 }), 5000), 4000);
  assert.equal(A.runtimeOf(run({})), null);
  assert.equal(A.runKey({ id: 'a', machine: { id: 'm', name: 'M' } }), 'm:a');
  assert.equal(A.runKey({ id: 'a' }), ':a');
  assert.equal(A.RUN_COLORS.length, A.MAX_SHOWN);
}

// ---- headlineOf (what Try to break it's sentence starts from)
{
  const base = run({ last: { 'dev_ndcg@10': 0.412, lr: 2e-5, elapsed_s: 90 }, curves: ['dev_ndcg@10', 'lr'] });
  const a = run({ last: { 'dev_ndcg@10': 0.431, lr: 3e-5, elapsed_s: 80 }, curves: ['dev_ndcg@10', 'lr'] });
  const b = run({ last: { 'dev_ndcg@10': 0.42, elapsed_s: 70 }, curves: ['dev_ndcg@10'] });
  const h = A.headlineOf([base, a, b], base)!;
  assert.equal(h.metric, 'dev_ndcg@10');
  assert.equal(h.run.id, a.id, 'the best of the others');
  assert.deepEqual([h.value, h.against, h.better], [0.431, 0.412, 'max']);
  assert.equal(A.headlineOf([base, a, b], a)!.run.id, b.id, 'never the baseline against itself');
  const lo = A.headlineOf([run({ last: { dev_loss: 0.5 } }), run({ last: { dev_loss: 0.4 } })], run({ last: { dev_loss: 0.6 } }))!;
  assert.deepEqual([lo.value, lo.better], [0.4, 'min']);
  assert.equal(A.headlineOf([run({ last: { elapsed_s: 1 } }), base], base), null, 'bookkeeping is no claim');
  assert.equal(A.headlineOf([base, run()], base), null, 'no number they share');
}

console.log('analysis ok');
