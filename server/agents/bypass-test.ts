// Script tests for how ClaudeLive answers permission requests in Bypass mode: allowed at once (questions and plans still
// asked), a request read back after a restart answered only if still open once the replay is read, and a subagent's result
// settling its approval:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/bypass-test.ts && node dist/dev/bypass-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ClaudeLive } from './claude.ts';

const make = (mode?: string) => {
  const written: any[] = [];
  const runner = new EventEmitter() as any;
  runner.writeLine = (o: any) => written.push(o);
  const a = new ClaudeLive(runner, { sessionId: 's', mode } as any);
  const line = (m: object, replay = false) => runner.emit('line', JSON.stringify(m), replay);
  const tick = () => new Promise((r) => setImmediate(r));
  return { written, a, line, tick };
};

const req = (id: string, toolUseId: string, extra: object = {}) => ({
  type: 'control_request',
  request_id: id,
  request: {
    subtype: 'can_use_tool',
    tool_name: 'Bash',
    input: { command: 'rm -rf "$D"/*' },
    tool_use_id: toolUseId,
    decision_reason: 'Dangerous rm operation on statically-unresolvable target: /work/*',
    suppress_always_allow_rule: true,
    permission_suggestions: [],
    ...extra,
  },
});

const answered = (id: string) => ({
  type: 'control_response',
  response: { subtype: 'success', request_id: id, response: { behavior: 'allow', updatedInput: { command: 'rm -rf "$D"/*' } } },
});

const init = { type: 'system', subtype: 'init', session_id: 's', model: 'm', permissionMode: 'bypassPermissions' };
const mainResult = (toolUseId: string) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }] } });
const subResult = (toolUseId: string) => ({ ...mainResult(toolUseId), parent_tool_use_id: 'toolu_task' });

const tests: [string, () => void | Promise<void>][] = [
  [
    'Bypass: a live command is allowed at once, with no approval card',
    () => {
      const { written, a, line } = make('bypassPermissions');
      line(req('r1', 'toolu_1'));
      assert.deepEqual(written, [answered('r1')]);
      assert.equal(a.approvals.size, 0);
      assert.notEqual(a.state.status, 'waiting');
    },
  ],
  [
    'Bypass: a question for the user and a plan to approve are still asked, and nothing is answered for them',
    () => {
      const { written, a, line } = make('bypassPermissions');
      line(
        req('r1', 'toolu_1', {
          tool_name: 'AskUserQuestion',
          input: { questions: [{ question: 'Which?', header: 'Pick', options: [{ label: 'A', description: '' }, { label: 'B', description: '' }], multiSelect: false }] },
        }),
      );
      assert.deepEqual(written, []);
      assert.equal(a.approvals.get('r1')!.kind, 'question');
      assert.equal(a.state.status, 'waiting');
      line(req('r2', 'toolu_2', { tool_name: 'ExitPlanMode', input: { plan: 'Do X' } }));
      assert.equal(a.approvals.get('r2')!.kind, 'plan');
      assert.deepEqual(written, []);
    },
  ],
  [
    'Default mode: a live command waits for the user',
    () => {
      const { written, a, line } = make('default');
      line(req('r1', 'toolu_1'));
      assert.deepEqual(written, []);
      assert.equal(a.approvals.get('r1')!.kind, 'command');
      assert.equal(a.state.status, 'waiting');
    },
  ],
  [
    'mode from the init line: a live command is allowed at once; after a status line switches to default, the next is not',
    () => {
      const { written, a, line } = make(undefined);
      line(init);
      line(req('r1', 'toolu_1'));
      assert.deepEqual(written, [answered('r1')]);
      line({ type: 'system', subtype: 'status', status: null, permissionMode: 'default' });
      line(req('r2', 'toolu_2'));
      assert.deepEqual(written, [answered('r1')], 'r2 is not answered');
      assert.ok(a.approvals.has('r2'));
    },
  ],
  [
    'replay in Bypass: only the request still open after the replay is answered, on the next tick',
    async () => {
      const { written, a, line, tick } = make(undefined);
      line(init, true);
      line(req('r1', 'toolu_1'), true);
      line(mainResult('toolu_1'), true);
      line(req('r2', 'toolu_2', { agent_id: 'a1' }), true);
      line(subResult('toolu_2'), true);
      line(req('r3', 'toolu_3'), true);
      assert.deepEqual(written, [], 'nothing answered synchronously');
      await tick();
      await tick();
      assert.deepEqual(written, [answered('r3')]);
      assert.equal(a.approvals.size, 0);
    },
  ],
  [
    'replay where the mode is switched to default later in the replay: the open request is left for the user',
    async () => {
      const { written, a, line, tick } = make(undefined);
      line(init, true);
      line({ type: 'system', subtype: 'status', status: null, permissionMode: 'default' }, true);
      line(req('r1', 'toolu_1'), true);
      await tick();
      await tick();
      assert.deepEqual(written, []);
      assert.equal(a.approvals.get('r1')!.kind, 'command');
    },
  ],
  [
    'replay where the turn ended: the request is settled by the result, and nothing is answered',
    async () => {
      const { written, a, line, tick } = make(undefined);
      line(init, true);
      line(req('r1', 'toolu_1'), true);
      line({ type: 'result', subtype: 'success', is_error: false, result: 'Done' }, true);
      await tick();
      await tick();
      assert.deepEqual(written, []);
      assert.equal(a.approvals.size, 0);
    },
  ],
  [
    'Default: a subagent’s result settles the approval its step asked for',
    () => {
      const { written, a, line } = make('default');
      line(req('r1', 'toolu_1', { agent_id: 'a1' }));
      assert.equal(a.approvals.size, 1);
      line(subResult('toolu_1'));
      assert.equal(a.approvals.size, 0);
      assert.deepEqual(written, []);
    },
  ],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
