// Script test for what a session shows as its activity (activity.ts): a lead whose child sessions still run is working,
// not done, also when its own process has stopped, and it still takes messages. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/lib/activity-test.ts && node dist/dev/activity-test.js
import assert from 'node:assert/strict';
import type { SessionSummary } from '@shared/types';
import { activityLabel, activityOf, backgroundLine, inBackground, isBusy, isWorking } from './activity';

let n = 0;
const ses = (more: Partial<SessionSummary> = {}): SessionSummary => ({ key: `claude:${++n}`, agent: 'claude', id: String(n), title: 'S', stats: {} as SessionSummary['stats'], ...more });
const live = (status: string, more: Record<string, unknown> = {}) => ({ status, startedAt: 1, pendingApprovals: 0, ...more }) as unknown as SessionSummary['live'];
let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
};

test('an idle lead with running child sessions is working, with a label that counts them', () => {
  const a = activityOf(ses({ live: live('idle'), helpers: 2 }));
  assert.equal(a?.helpers, 2);
  assert.equal(isBusy(a), false);
  assert.equal(inBackground(a), true);
  assert.equal(isWorking(a), true);
  assert.equal(activityLabel(a!), 'Working · 2 helper sessions running');
  assert.equal(backgroundLine(a!), 'Working · 2 helper sessions');
  assert.equal(activityLabel(activityOf(ses({ live: live('idle'), helpers: 1 }))!), 'Working · 1 helper session running');
});

test('a lead whose process has stopped between turns is still working while its children run', () => {
  for (const s of [ses({ live: null, helpers: 1 }), ses({ helpers: 1 }), ses({ live: live('exited'), helpers: 3 })]) {
    const a = activityOf(s);
    assert.equal(a?.kind, 'app');
    assert.equal(a?.status, 'idle');
    assert.equal(isWorking(a), true);
  }
  assert.equal(activityOf(ses({ live: null })), null);
  assert.equal(activityOf(ses({ live: null, helpers: 0 })), null);
});

test('background tasks and child sessions together, and neither: an idle lead is ready', () => {
  const both = activityOf(ses({ live: live('idle', { backgroundTasks: [{}, {}] }), helpers: 1 }))!;
  assert.equal(activityLabel(both), 'Working · 2 background tasks and 1 helper session running');
  assert.equal(backgroundLine(both), 'Working · 2 in background, 1 helper session');
  const tasks = activityOf(ses({ live: live('idle', { backgroundTasks: [{}] }) }))!;
  assert.equal(activityLabel(tasks), 'Working · 1 background task running');
  assert.equal(backgroundLine(tasks), 'Working · 1 in background');
  const idle = activityOf(ses({ live: live('idle') }))!;
  assert.equal(isWorking(idle), false);
  assert.equal(activityLabel(idle), 'Running, idle');
});

test('a lead working or waiting itself keeps that status; its helpers are only counted', () => {
  assert.equal(activityOf(ses({ live: live('working'), helpers: 2 }))?.status, 'working');
  const w = activityOf(ses({ live: live('waiting'), helpers: 2 }))!;
  assert.equal(w.status, 'waiting');
  assert.equal(inBackground(w), false);
  assert.equal(activityLabel(w), 'Waiting for you');
});

console.log(`${passed}/${total} passed`);
