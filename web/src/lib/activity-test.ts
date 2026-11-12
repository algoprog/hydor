// Script test for what a session shows as its activity (activity.ts): a lead whose subagents still run is working,
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
  assert.equal(activityLabel(a!), 'Working · 2 subagents running');
  assert.equal(backgroundLine(a!), 'Working · 2 subagents');
  assert.equal(activityLabel(activityOf(ses({ live: live('idle'), helpers: 1 }))!), 'Working · 1 subagent running');
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
  assert.equal(activityLabel(both), 'Working · 1 subagent and 2 background tasks running');
  assert.equal(backgroundLine(both), 'Working · 1 subagent, 2 in background');
  const tasks = activityOf(ses({ live: live('idle', { backgroundTasks: [{}] }) }))!;
  assert.equal(activityLabel(tasks), 'Working · 1 background task running');
  assert.equal(backgroundLine(tasks), 'Working · 1 in background');
  const idle = activityOf(ses({ live: live('idle') }))!;
  assert.equal(isWorking(idle), false);
  assert.equal(activityLabel(idle), 'Running, idle');
});

test('the program’s own subagents (background tasks of kind agent) count as subagents, not as background tasks', () => {
  const agent = { kind: 'local_agent' };
  const cmd = { kind: 'local_bash' };
  // Only a program subagent: "1 subagent", no background task.
  const one = activityOf(ses({ live: live('idle', { backgroundTasks: [agent] }) }))!;
  assert.deepEqual([one.background, one.agents, one.helpers], [1, 1, 0]);
  assert.equal(inBackground(one), true);
  assert.equal(activityLabel(one), 'Working · 1 subagent running');
  assert.equal(backgroundLine(one), 'Working · 1 subagent');
  // With a command, and with a Hydor subagent too: 2 subagents (one of each) and 1 background task.
  const mixed = activityOf(ses({ live: live('idle', { backgroundTasks: [agent, cmd] }), helpers: 1 }))!;
  assert.deepEqual([mixed.background, mixed.agents, mixed.helpers], [2, 1, 1]);
  assert.equal(activityLabel(mixed), 'Working · 2 subagents and 1 background task running');
  assert.equal(backgroundLine(mixed), 'Working · 2 subagents, 1 in background');
  // Commands only are still background tasks.
  const cmds = activityOf(ses({ live: live('idle', { backgroundTasks: [cmd, cmd] }) }))!;
  assert.equal(cmds.agents, 0);
  assert.equal(activityLabel(cmds), 'Working · 2 background tasks running');
  // A session open in VS Code counts the same way; and a lead with only Hydor subagents has none of its own.
  const ext = activityOf(ses({ live: null, external: { status: 'idle', client: 'VS Code', pid: 1, backgroundTasks: [agent, agent] } as SessionSummary['external'] }))!;
  assert.deepEqual([ext.background, ext.agents], [2, 2]);
  assert.equal(activityLabel(ext), 'Working in VS Code · 2 subagents running');
  assert.equal(backgroundLine(ext), 'Working in VS Code · 2 subagents');
  assert.equal(activityOf(ses({ live: null, helpers: 2 }))!.agents, 0);
});

test('a lead working or waiting itself keeps that status; its helpers are only counted', () => {
  assert.equal(activityOf(ses({ live: live('working'), helpers: 2 }))?.status, 'working');
  const w = activityOf(ses({ live: live('waiting'), helpers: 2 }))!;
  assert.equal(w.status, 'waiting');
  assert.equal(inBackground(w), false);
  assert.equal(activityLabel(w), 'Waiting for you');
});

console.log(`${passed}/${total} passed`);
