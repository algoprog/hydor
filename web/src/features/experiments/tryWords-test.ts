// Script tests for the words of Try it first and of what a run used (tryWords.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/experiments/tryWords-test.ts && node dist/dev/tryWords-test.js
import assert from 'node:assert/strict';
import type { TrialAnswer } from '@shared/experiments';

const g = globalThis as any;
g.location ??= { pathname: '/', search: '', hash: '', origin: 'http://localhost', host: 'localhost', href: 'http://localhost/' };
g.window ??= g;
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const W = await import('./tryWords');

assert.equal(W.lengthWords(0.001), 'less than a minute');
assert.equal(W.lengthWords(40 / 60), '40 min');
assert.equal(W.lengthWords(10 / 3), '3 h 20 min');
assert.equal(W.lengthWords(3), '3 h');
assert.equal(W.lengthWords(51), '2 days 3 h');

const a: TrialAnswer = { id: 'r', status: 'stopped', over: true, ok: true, seconds: 90, ran: 91, gpuMemGb: 9.4, ramGb: 3, estimateHours: 10 / 3, ask: { gpuMemGb: 11, hours: 4.2 }, said: '' };
assert.deepEqual(W.trialLines(a), ['It runs.', 'It used up to 9.4 GB of GPU memory: ask for 11 GB free on each GPU.', 'The whole run should take about 3 h 20 min.']);
assert.deepEqual(W.trialLines({ ...a, gpuMemGb: undefined, ask: undefined, estimateHours: undefined }), ['It runs.', 'It used up to 3 GB of memory.', 'It did not say how far it has to go.']);
// a small script never "used up to 0 GB"
assert.equal(W.trialLines({ ...a, gpuMemGb: undefined, ask: undefined, ramGb: 0.012 })[1], 'It used up to 0.01 GB of memory.');
assert.deepEqual([0.004, 0.012, 0.09, 0.096, 0.14, 3, 9.44].map(W.gb), ['0.01', '0.01', '0.09', '0.1', '0.1', '3', '9.4']);
assert.deepEqual(W.trialLines({ ...a, finished: true, ran: 61, estimateHours: 61 / 3600, ramGb: undefined, gpuMemGb: undefined }), [
  'It ran to its end in 61 s.',
  'It was over before its memory could be read.',
  'The whole run takes about that long, unless your script shortens itself when it sees HYDOR_TRY.',
]);
// One that ended with steps left to do says how long they would take.
assert.equal(W.trialLines({ ...a, finished: true, stepSeconds: 2, steps: { done: 40, total: 5000 } })[2], 'The whole run should take about 3 h 20 min.');
assert.deepEqual(W.trialLines({ ...a, ok: false, ran: 4 }), ['It failed after 4 s.']);
assert.deepEqual(W.trialLines({ ...a, ok: undefined }), ['It was stopped before it started.']);

assert.deepEqual(W.peakLines({ gpuIds: [1, 3], peak: { gpuMemGb: [9.44, 0], ramGb: 3.14 }, gpuTotalGb: [24, 24], others: { start: [0.1, 9.1] } }), [
  'GPU 1: up to 9.4 of 24 GB',
  'GPU 3: other programs held 9.1 GB when it started',
  'Memory: up to 3.1 GB',
]);
assert.deepEqual(W.peakLines({}), []);

assert.equal(W.systemTitle('system/gpu_mem_gb'), 'GPU memory (GB)');
assert.equal(W.systemTitle('system/gpu_util/gpu3'), 'GPU 3 use (%)');
assert.equal(W.systemTitle('system/ram_gb'), 'Memory (GB)');
assert.deepEqual(W.systemOrder(['system/ram_gb', 'system/gpu_util/gpu10', 'system/cpu', 'system/gpu_mem_gb/gpu2', 'system/gpu_util/gpu2']), ['system/gpu_mem_gb/gpu2', 'system/gpu_util/gpu2', 'system/gpu_util/gpu10', 'system/cpu', 'system/ram_gb']);
console.log('tryWords: all passed');
