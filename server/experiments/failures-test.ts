// Checks for where a failed run first went wrong and when it ran out of memory (failures.ts), on logs as programs
// print them. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/failures-test.ts && DATA_DIR=<a scratch folder> node dist/dev/failures-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KILLED_WHY, memoryNearLimit, oomWords, scanLog, scanText } from './failures.ts';

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

const steps = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `step ${from + i}/1000 loss=${(2 / (i + 1)).toFixed(4)}`);
const log = (...lines: (string | string[])[]) => `${lines.flat().join('\n')}\n`;

const missing = [
  'Traceback (most recent call last):',
  '  File "/work/train.py", line 88, in <module>',
  '    main()',
  '  File "/work/train.py", line 41, in main',
  '    data = load(args.data)',
  '           ^^^^^^^^^^^^^^^',
  "FileNotFoundError: [Errno 2] No such file or directory: 'data/train.jsonl'",
];

await test('a traceback far above a later unrelated error is where it first went wrong', () => {
  const r = scanText(log('loading', 'config ok', missing, steps(200), 'ValueError: bad shape', 'done'));
  assert.equal(r.firstError!.line, 3);
  assert.equal(r.firstError!.text, "FileNotFoundError: [Errno 2] No such file or directory: 'data/train.jsonl'");
  assert.equal(r.firstError!.from, 1, 'two lines before it are shown');
  assert.equal(r.firstError!.offset, 0);
  assert.equal(r.firstError!.lines[0], 'loading');
  assert.ok(r.firstError!.lines.includes('Traceback (most recent call last):') && r.firstError!.lines.includes(r.firstError!.text), r.firstError!.lines.join('\n'));
  assert.equal(r.oom, false);
});

await test('a CUDA out of memory is the first error and is out of memory', () => {
  const r = scanText(
    log(steps(5), 'Traceback (most recent call last):', '  File "train.py", line 1, in <module>', '    model(x)', 'torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB. GPU 0 has a total capacity of 23.65 GiB of which 1.1 GiB is free.'),
  );
  assert.equal(r.firstError!.line, 6);
  assert.match(r.firstError!.text, /CUDA out of memory/);
  assert.equal(r.oom, true);
  assert.match(r.oomLine!, /GPU 0/);
});

await test('an out of memory that is where it went wrong still counts when long output follows it', () => {
  const r = scanText(log('torch.cuda.OutOfMemoryError: CUDA out of memory.', Array.from({ length: 80 }, (_, i) => `rank ${i} shutting down`)));
  assert.equal(r.oom, true);
});

await test('a caught out of memory earlier, with another failure after it, is not the reason', () => {
  const r = scanText(log('RuntimeError: CUDA out of memory (batch 64)', steps(100), missing));
  assert.equal(r.oom, false);
  const said = scanText(log(steps(3), 'CUDA out of memory, retrying with batch 32', steps(10), missing));
  assert.equal(said.oom, false, 'even near the end, one that says it was dealt with does not count');
  assert.equal(said.firstError!.text, missing.at(-1));
  assert.equal(scanText(log('step', 'UserWarning: MemoryError may happen', 'ValueError: x')).oom, false, 'a warning is no failure');
});

await test('Killed, segmentation fault, disk, command not found, a step’s exit code', () => {
  assert.equal(scanText(log(steps(3), 'Killed')).firstError!.text, 'Killed');
  assert.equal(scanText(log(steps(3), 'run/command.sh: line 1: 4242 Killed                  python train.py')).firstError!.line, 4);
  assert.equal(scanText(log('Segmentation fault (core dumped)')).firstError!.line, 1);
  assert.equal(scanText(log('write failed: No space left on device')).firstError!.line, 1);
  assert.equal(scanText(log('bash: line 1: pyhton: command not found')).firstError!.line, 1);
  assert.equal(scanText(log('prep done', 'make: *** [data] Error 2', 'subprocess returned non-zero exit status 2')).firstError!.line, 3);
  assert.equal(scanText(log('FATAL: could not open the database')).firstError!.line, 1);
  assert.equal(scanText(log('train.py: error: unrecognized arguments: --foo')).firstError!.line, 1);
  assert.equal(scanText(log('2026-01-01 ERROR loader: bad file')).firstError!.line, 1);
});

await test('what is not taken for dealt with, or for memory: retries run out, a bare Killed', () => {
  const net = scanText(log(steps(3), "requests.exceptions.ConnectionError: Max retries exceeded with url: /bge-small"));
  assert.equal(net.firstError!.line, 4);
  assert.equal(scanText(log(steps(3), 'Killed')).oom, false);
  assert.equal(scanText(log('Out of memory: Killed process 4242 (python)')).oom, true);
  assert.equal(scanText(log('CUBLAS_STATUS_ALLOC_FAILED')).oom, true);
});

await test('a clean log, and metrics and counts that only sound like errors, give nothing', () => {
  const r = scanText(log(steps(50), 'val_error: 0.12 mean_squared_error=0.4', 'Mean Absolute Error: 0.5', 'Error rate: 0.2', '0 errors, 0 warnings', 'exit code 0', 'done'));
  assert.equal(r.firstError, undefined, r.firstError?.text);
  assert.equal(r.oom, false);
});

await test('a log file read in pieces: line numbers, offsets and a progress bar’s last redraw', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-fail-'));
  const file = path.join(dir, 'log.txt');
  const head = `é first\n${'x'.repeat(2_000_000)}\n${steps(40_000).join('\n')}\n10%|#    | 1/10\r20%|##   | 2/10\n`;
  fs.writeFileSync(file, `${head}${missing.join('\n')}\n`);
  const r = await scanLog(file);
  assert.equal(r.firstError!.line, 40_005);
  assert.equal(r.firstError!.from, 40_003);
  assert.ok(r.firstError!.lines[1].startsWith('20%|##'), r.firstError!.lines[1]);
  const at = fs.readFileSync(file).subarray(r.firstError!.offset).toString().split('\n')[0];
  assert.match(at, /^step 40000\/1000 /, 'the offset is where its first line starts');
  assert.deepEqual(await scanLog(path.join(dir, 'none')), { oom: false, lines: 0 });
  fs.rmSync(dir, { recursive: true, force: true });
});

await test('the words: on a GPU with what it reached and what another program held; a bare 137', () => {
  const r = { gpuIds: [2], peak: { gpuMemGb: [21.8], ramGb: 3 }, gpuTotalGb: [24], others: { start: [9.1] } };
  assert.equal(oomWords(r, 'torch.OutOfMemoryError: CUDA out of memory. GPU 0 has a total', false), 'It ran out of memory on GPU 2: it had reached 21.8 of 24 GB, and another program held 9.1 GB there when it started');
  const two = { gpuIds: [1, 3], peak: { gpuMemGb: [2, 22], ramGb: 3 }, gpuTotalGb: [24, 24], others: { start: [0, 0] } };
  assert.equal(oomWords(two, 'CUDA out of memory', false), 'It ran out of memory on GPU 3: it had reached 22 of 24 GB', 'the fullest one, when the line names none');
  assert.equal(oomWords({ gpuIds: [0], others: { start: [9] } }, 'CUDA out of memory', false), 'It ran out of memory on GPU 0: another program held 9 GB there when it started');
  assert.equal(oomWords({}, 'MemoryError', false), 'It ran out of memory');
  assert.equal(oomWords({ peak: { gpuMemGb: [], ramGb: 61 }, memoryLimitGb: 64 }, undefined, true), 'It ran out of memory (it was killed: exit code 137): it had reached 61 of 64 GB of memory');
  assert.equal(memoryNearLimit({ peak: { gpuMemGb: [], ramGb: 2 }, memoryLimitGb: 64 }), false);
  assert.equal(memoryNearLimit({ peak: { gpuMemGb: [], ramGb: 60 }, memoryLimitGb: 64 }), true);
  assert.equal(memoryNearLimit({ memoryLow: true }), true);
  assert.match(KILLED_WHY, /exit code 137.*perhaps for memory/);
});

console.log(`${passed} passed`);
