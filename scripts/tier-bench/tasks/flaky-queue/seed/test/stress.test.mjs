import test from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue } from '../src/queue.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Many short jobs, a few of which fail now and then. Once drain() has resolved, every job must have settled.
test('drain() waits for every job, retries included', async () => {
  const total = 24;
  const queue = new JobQueue({ concurrency: 4, retries: 2, backoffMs: 2, timeoutMs: 50 });
  let settled = 0;
  let succeeded = 0;
  for (let i = 0; i < total; i++) {
    queue
      .add(async () => {
        await sleep(1 + Math.random() * 4);
        if (Math.random() < 0.01) throw new Error('flaky');
        return i;
      })
      .then(
        () => {
          settled++;
          succeeded++;
        },
        () => settled++,
      );
  }
  await queue.drain();
  assert.equal(settled, total, `${total - settled} job(s) had not settled when drain() resolved`);
  assert.ok(succeeded >= total - 3);
});
