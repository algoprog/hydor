// Script tests for starting an idle agent afresh when what it was given at its start no longer holds (a session's
// Swarm mode, deep research or guidelines changed): only Claude Code and Codex agents this app started, only when
// idle with no goal or background work, and only when what it was given differs.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/features/freshStart-test.ts
//   DATA_DIR=/tmp/hydor-test-fresh node dist/dev/freshStart-test.js
import assert from 'node:assert/strict';
import type { Deps } from './types.ts';
import { GivenAtStart } from './freshStart.ts';

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

/** A session manager with one live agent per key, in the given state; it records what it recycles. */
function sessions(live: Record<string, { run: string; status?: string; goal?: unknown; backgroundTasks?: unknown[] }>) {
  const recycled: string[] = [];
  const d = {
    sessions: {
      runOf: (key: string) => live[key]?.run,
      adapterByRun: (run: string) => {
        const l = Object.values(live).find((x) => x.run === run);
        return l ? { state: { status: l.status ?? 'idle', goal: l.goal, backgroundTasks: l.backgroundTasks } } : null;
      },
      recycle: async (key: string) => void recycled.push(key),
    },
  } as unknown as Pick<Deps, 'sessions'>;
  return { d, recycled };
}

test('a change starts the idle agent afresh; the same leaves it running', async () => {
  const g = new GivenAtStart();
  g.note('r1', 'none');
  const { d, recycled } = sessions({ 'claude:a': { run: 'r1' } });
  await g.refresh('claude:a', d, () => 'none');
  assert.deepEqual(recycled, []);
  await g.refresh('claude:a', d, () => 'lead swarm');
  assert.deepEqual(recycled, ['claude:a']);
});

test('left alone: busy, with a goal or background work, not noted, not Claude Code or Codex, no agent', async () => {
  const g = new GivenAtStart();
  for (const r of ['r1', 'r2', 'r3', 'r5']) g.note(r, 'none');
  const { d, recycled } = sessions({
    'claude:busy': { run: 'r1', status: 'working' },
    'codex:goal': { run: 'r2', goal: { text: 'x' } },
    'claude:bg': { run: 'r3', backgroundTasks: [{}] },
    'claude:unnoted': { run: 'r4' },
    'acp:custom': { run: 'r5' },
  });
  for (const k of ['claude:busy', 'codex:goal', 'claude:bg', 'claude:unnoted', 'acp:custom', 'claude:none']) await g.refresh(k, d, () => 'lead swarm');
  assert.deepEqual(recycled, []);
});

test('keeps only the latest runs', async () => {
  const g = new GivenAtStart(2);
  g.note('a', '1');
  g.note('b', '2');
  g.note('c', '3');
  assert.equal(g.get('a'), undefined);
  assert.equal(g.get('c'), '3');
  g.note('b', '4');
  g.note('d', '5');
  assert.equal(g.get('b'), '4', 'noting again makes it the latest');
  assert.equal(g.get('c'), undefined);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
