// Script tests for stopping a code step (code.ts): a stop that comes in the moment its sandbox starts ends the step
// at once, however far bubblewrap had got (killed while it set the sandbox up, it used to leave the process it had
// started waiting for ever with the step's pipes open, and the run stayed at work); a program past its time ends the
// same way; and one left alone still gives its values and what it printed. Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/code-test.ts
//   DATA_DIR=/tmp/hydor-test-code HYDOR_APPS_DIR=/tmp/hydor-test-code-apps node dist/dev/code-test.js
import assert from 'node:assert/strict';
import { sandboxAvailable } from '../agent/sandbox.ts';
import { runCode } from './code.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** How a run of a program ends: its values, why it failed, or "hung" when it has not ended `ms` later. */
const outcome = (p: Promise<{ values: Record<string, unknown> }>, ms: number) =>
  Promise.race([p.then((o) => o.values as Record<string, unknown> | string, (e: Error) => `failed: ${e.message}`), sleep(ms).then(() => 'hung' as const)]);

if (sandboxAvailable()?.kind !== 'bwrap') {
  console.log('ok   (skipped: no bubblewrap here, so no code steps)');
  process.exit(0);
}

const run = (code: string, o: { signal?: AbortSignal; seconds?: number } = {}) => runCode({ language: 'javascript', code, input: { a: 2, b: 3 }, slug: 'code-test', seconds: o.seconds ?? 20, signal: o.signal });

// Left alone: its values, and what it printed.
const plain = await outcome(run("console.log('adding');\nreturn { sum: input.a + input.b };"), 20_000);
assert.deepEqual(plain, { sum: 5, printed: 'adding\n' });

// Stopped as it starts, at each of the first moments (before bubblewrap runs, while it sets the sandbox up, as the
// program starts): the step ends as stopped every time, within moments.
const hung: number[] = [];
const ends = new Map<string, number>();
const N = 120;
for (let i = 0; i < N; i++) {
  const c = new AbortController();
  const started = Date.now();
  const p = run('return { late: true };', { signal: c.signal });
  // 0 to 3 ms after it was started (a stop used to hang the step about once in fifty at 1 ms).
  setTimeout(() => c.abort(), i % 4);
  const how = await outcome(p, 5000);
  if (how === 'hung') hung.push(i);
  const said = typeof how === 'string' ? how : 'ended before the stop';
  ends.set(said, (ends.get(said) ?? 0) + 1);
  assert.ok(how === 'hung' || Date.now() - started < 4000, `it ended in ${Date.now() - started} ms`);
}
assert.deepEqual(hung, [], `stopped as it started, the step ended every time (${[...ends].map(([k, n]) => `${k}: ${n}`).join('; ')})`);
assert.ok((ends.get('failed: Stopped') ?? 0) > N / 2, `most were stopped (${[...ends].map(([k, n]) => `${k}: ${n}`).join('; ')})`);

// Past its time: ended, and said so.
const slow = await outcome(run('await new Promise((r) => setTimeout(r, 30000));\nreturn {};', { seconds: 1 }), 8000);
assert.equal(slow, 'failed: It ran past its 1 seconds');

// Stopped while it runs: ended at once.
const c = new AbortController();
const running = run('await new Promise((r) => setTimeout(r, 30000));\nreturn {};', { signal: c.signal });
setTimeout(() => c.abort(), 400);
assert.equal(await outcome(running, 5000), 'failed: Stopped');

console.log(`ok   a code step left alone, stopped as it starts (${N} times), past its time, and stopped while it runs`);
process.exit(0);
