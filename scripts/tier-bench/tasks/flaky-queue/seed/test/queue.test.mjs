import test from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue } from '../src/queue.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('runs jobs and returns their values', async () => {
  const queue = new JobQueue({ concurrency: 2 });
  const values = await Promise.all([1, 2, 3].map((n) => queue.add(async () => n * 2)));
  assert.deepEqual(values, [2, 4, 6]);
  await queue.drain();
});

test('never runs more jobs at once than the concurrency', async () => {
  const queue = new JobQueue({ concurrency: 2 });
  let active = 0;
  let peak = 0;
  for (let i = 0; i < 6; i++) {
    queue.add(async () => {
      peak = Math.max(peak, ++active);
      await sleep(5);
      active--;
    });
  }
  await queue.drain();
  assert.equal(peak, 2);
});

test('retries a failing job', async () => {
  const queue = new JobQueue({ concurrency: 2, retries: 2, backoffMs: 5 });
  let calls = 0;
  const flaky = queue.add(async () => {
    if (++calls < 3) throw new Error('not yet');
    return 'ok';
  });
  const slow = queue.add(() => sleep(40));
  assert.equal(await flaky, 'ok');
  await slow;
  await queue.drain();
  assert.equal(calls, 3);
});

test('rejects with the last error when the retries run out', async () => {
  const queue = new JobQueue({ retries: 1 });
  const failing = queue.add(async () => {
    throw new Error('always');
  });
  await assert.rejects(failing, /always/);
  await queue.drain();
});

test('a job that takes too long fails with a timeout', async () => {
  const queue = new JobQueue({ timeoutMs: 10 });
  await assert.rejects(queue.add(() => sleep(100)), /timed out/);
  await queue.drain();
});
