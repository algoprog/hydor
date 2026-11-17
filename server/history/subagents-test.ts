// Script test for the subagents the session's own program runs: the transcript parsers mark the call that started each
// one (Claude Code's Agent tool, Codex's spawn_agent), settle it when the transcript says it ended, and turn "it came
// back" into a reply item. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/history/subagents-test.ts
//   DATA_DIR=/tmp/hydor-test-subagents CUDA_VISIBLE_DEVICES= node dist/dev/subagents-test.js
import assert from 'node:assert/strict';
import type { SystemItem, TimelineItem, ToolItem } from '../../shared/types.ts';
import { ClaudeParser } from './claude.ts';
import { CodexParser } from './codex.ts';

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok ${name}`);
};

// ---- Claude Code ------------------------------------------------------------------------------------------------

let clock = Date.parse('2026-11-14T00:00:00.000Z');
const at = () => new Date((clock += 1000)).toISOString();

const claude = (lines: object[]) => {
  const p = new ClaudeParser({ retain: true, collectChunks: false });
  for (const l of lines) p.feed(JSON.stringify(l));
  p.finish();
  return p;
};
const byId = (p: { items: TimelineItem[] }, id: string) => p.items.find((i) => i.id === id);
const tool = (p: { items: TimelineItem[] }, id: string) => (byId(p, id) as ToolItem).tool;
const replies = (p: { items: TimelineItem[] }) => p.items.filter((i): i is SystemItem => i.kind === 'system' && !!i.subagent);

const prompt = { type: 'user', uuid: 'u1', timestamp: at(), message: { role: 'user', content: 'Update the docs' } };
const call = (id: string, name: string, input: object) => ({
  type: 'assistant',
  uuid: `a-${id}`,
  timestamp: at(),
  message: { id: `msg-${id}`, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 1, output_tokens: 1 } },
});
const result = (id: string, content: string, toolUseResult: object, extra: object = {}) => ({
  type: 'user',
  uuid: `r-${id}`,
  timestamp: at(),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text: content }], ...extra }] },
  toolUseResult,
});
const block = (o: { task: string; use?: string; status: string; summary: string; result?: string }) =>
  `<task-notification>\n<task-id>${o.task}</task-id>\n${o.use ? `<tool-use-id>${o.use}</tool-use-id>\n` : ''}<output-file>/tmp/x/${o.task}.output</output-file>\n<status>${o.status}</status>\n<summary>${o.summary}</summary>\n<note>A task-notification fires each time.</note>\n${o.result == null ? '' : `<result>${o.result}</result>\n`}</task-notification>`;
const attachment = (uuid: string, prompt: string) => ({ type: 'attachment', uuid, timestamp: at(), attachment: { type: 'queued_command', commandMode: 'task-notification', prompt } });
const notice = (uuid: string, text: string, meta = false) => ({ type: 'user', uuid, timestamp: at(), ...(meta ? { isMeta: true } : {}), message: { role: 'user', content: text } });

const launch = (use: string, agent: string, input: object = {}) => [
  call(use, 'Agent', { description: 'Update the docs', subagent_type: 'general-purpose', model: 'sonnet', run_in_background: true, prompt: 'Do it', ...input }),
  result(use, `Async agent launched successfully.\nagentId: ${agent} (internal ID)`, { isAsync: true, status: 'async_launched', agentId: agent, description: 'Update the docs', resolvedModel: 'claude-sonnet-5-5' }),
];

test('claude: the call marks its subagent', () => {
  const p = claude([prompt, call('t1', 'Agent', { description: 'Update the docs', subagent_type: 'Explore', model: 'haiku', run_in_background: true, prompt: 'x' })]);
  assert.deepEqual(tool(p, 't1').subagent, { title: 'Update the docs', type: 'Explore', model: 'haiku', background: true, state: 'running' });
  const q = claude([prompt, call('t2', 'Task', { prompt: 'x' })]);
  assert.deepEqual(tool(q, 't2').subagent, { title: 'Subagent', type: undefined, model: undefined, background: false, state: 'running' });
  assert.equal(tool(q, 't2').category, 'task');
});

test('claude: a background agent, its launch result and its notice', () => {
  const p = claude([prompt, ...launch('t1', 'ad34'), call('t9', 'Bash', { command: 'ls' })]);
  const sub = tool(p, 't1').subagent!;
  assert.equal(sub.id, 'ad34');
  assert.equal(sub.key, 'claude:agent-ad34');
  assert.equal(sub.model, 'claude-sonnet-5-5');
  assert.equal(sub.type, 'general-purpose');
  assert.equal(sub.background, true);
  assert.equal(sub.state, 'running');
  assert.equal(sub.endedAt, undefined);
  assert.equal(tool(p, 't1').agentId, 'ad34');
  assert.equal(tool(p, 't1').background, true);
  assert.match(tool(p, 't1').subtitle ?? '', /running in background/);
  assert.equal(p.bg.has('ad34'), true);
  assert.equal(replies(p).length, 0);

  const n = block({ task: 'ad34', use: 't1', status: 'completed', summary: 'Agent "Update the docs" finished', result: 'I updated three files.' });
  const q = claude([prompt, ...launch('t1', 'ad34'), attachment('n1', n)]);
  const done = tool(q, 't1').subagent!;
  assert.equal(done.state, 'done');
  assert.equal(typeof done.endedAt, 'number');
  assert.equal(q.bg.has('ad34'), false);
  const r = replies(q);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'n1');
  assert.equal(r[0].level, 'info');
  assert.equal(r[0].text, 'Background task completed: Agent "Update the docs" finished');
  assert.equal(r[0].detail, 'I updated three files.');
  assert.deepEqual(r[0].subagent, { key: 'claude:agent-ad34', id: 'ad34', title: 'Update the docs', type: 'general-purpose', ended: 'replied', text: 'I updated three files.' });
  // The call was sent again (it is dirty) with its new state.
  assert.equal(q.takeDirty().some((i) => i.id === 't1'), true);
});

test('claude: the same notice as an attachment and as messages is one reply', () => {
  const n = block({ task: 'ad34', use: 't1', status: 'completed', summary: 'Agent "Update the docs" finished', result: 'Done.' });
  for (const meta of [true, false]) {
    const p = claude([prompt, ...launch('t1', 'ad34'), attachment('n1', n), notice('m1', n, meta)]);
    assert.equal(replies(p).length, 1, `message meta=${meta}`);
    assert.equal(replies(p)[0].id, 'n1');
    // Message first, attachment after: the same.
    const q = claude([prompt, ...launch('t1', 'ad34'), notice('m1', n, meta), attachment('n1', n)]);
    assert.equal(replies(q).length, 1);
    assert.equal(replies(q)[0].id, 'm1');
    assert.equal(tool(q, 't1').subagent!.state, 'done');
  }
  // The older form alone (a message) shows its reply too.
  const old = claude([prompt, ...launch('t1', 'ad34'), notice('m1', n, true)]);
  assert.equal(replies(old).length, 1);
  assert.equal(replies(old)[0].subagent!.text, 'Done.');
  // A different result is a new reply (the agent was woken and came back again).
  const again = claude([prompt, ...launch('t1', 'ad34'), attachment('n1', n), attachment('n2', n.replace('Done.', 'More.'))]);
  assert.deepEqual(replies(again).map((i) => i.subagent!.text), ['Done.', 'More.']);
});

test('claude: a failed or stopped agent', () => {
  const n = block({ task: 'ad34', use: 't1', status: 'failed', summary: 'Agent "Update the docs" failed: API error', result: 'It could not go on.' });
  const p = claude([prompt, ...launch('t1', 'ad34'), attachment('n1', n)]);
  assert.equal(tool(p, 't1').subagent!.state, 'failed');
  const r = replies(p)[0];
  assert.equal(r.level, 'error');
  assert.equal(r.text, 'Background task failed: Agent "Update the docs" failed: API error');
  assert.equal(r.subagent!.ended, 'failed');
  assert.equal(r.subagent!.why, 'Agent "Update the docs" failed: API error');
  assert.equal(r.subagent!.text, 'It could not go on.');

  const k = claude([prompt, ...launch('t1', 'ad34'), attachment('n1', block({ task: 'ad34', use: 't1', status: 'killed', summary: 'Agent "Update the docs" was stopped' }))]);
  assert.equal(tool(k, 't1').subagent!.state, 'stopped');
  assert.equal(replies(k)[0].level, 'info');
  assert.equal(replies(k)[0].subagent!.ended, 'stopped');
  assert.equal(replies(k)[0].subagent!.text, '');
  assert.equal(replies(k)[0].subagent!.why, 'Agent "Update the docs" was stopped');
});

test('claude: two notices in one message', () => {
  const a = block({ task: 'ad34', use: 't1', status: 'completed', summary: 'Agent "Update the docs" finished', result: 'First.' });
  const b = block({ task: 'bb77', use: 't2', status: 'failed', summary: 'Agent "Check links" failed', result: 'Second.' });
  const p = claude([prompt, ...launch('t1', 'ad34'), ...launch('t2', 'bb77', { description: 'Check links' }), attachment('n1', `${a}\n${b}`)]);
  assert.deepEqual(replies(p).map((i) => [i.id, i.subagent!.id, i.subagent!.title, i.subagent!.ended, i.subagent!.text]), [
    ['n1', 'ad34', 'Update the docs', 'replied', 'First.'],
    ['n1:1', 'bb77', 'Check links', 'failed', 'Second.'],
  ]);
  assert.equal(tool(p, 't1').subagent!.state, 'done');
  assert.equal(tool(p, 't2').subagent!.state, 'failed');
  const m = claude([prompt, ...launch('t1', 'ad34'), ...launch('t2', 'bb77', { description: 'Check links' }), notice('m1', `${a}\n${b}`)]);
  assert.deepEqual(replies(m).map((i) => i.id), ['m1', 'm1:1']);
});

test('claude: a notice names the agent only by its task id, or comes before the launch result', () => {
  const n = block({ task: 'ad34', status: 'completed', summary: 'Agent "Update the docs" finished', result: 'Ok.' });
  const p = claude([prompt, ...launch('t1', 'ad34'), attachment('n1', n)]);
  assert.equal(replies(p).length, 1);
  assert.equal(tool(p, 't1').subagent!.state, 'done');
  // A quick agent: its notice lands before the result that says it is in the background.
  const [c, r] = launch('t1', 'ad34');
  const q = claude([prompt, c, attachment('n1', block({ task: 'ad34', use: 't1', status: 'completed', summary: 'Agent "Update the docs" finished', result: 'Ok.' })), r]);
  assert.equal(tool(q, 't1').subagent!.state, 'done');
  assert.equal(tool(q, 't1').subagent!.id, 'ad34');
  assert.equal(replies(q).length, 1);
});

test('claude: a foreground agent is done with its result and shows no reply', () => {
  const p = claude([
    prompt,
    call('t1', 'Agent', { description: 'Find the bug', subagent_type: 'Explore', prompt: 'x' }),
    result('t1', 'Found it in parser.ts.\nagentId: a1b2c3 (use SendMessage)', { status: 'completed', agentId: 'a1b2c3', agentType: 'Explore', content: [{ type: 'text', text: 'Found it in parser.ts.' }], totalDurationMs: 4200 }),
  ]);
  const t = tool(p, 't1');
  assert.deepEqual(t.subagent, { title: 'Find the bug', type: 'Explore', model: undefined, background: false, state: 'done', id: 'a1b2c3', key: 'claude:agent-a1b2c3', endedAt: t.subagent!.endedAt });
  assert.equal(typeof t.subagent!.endedAt, 'number');
  assert.equal(t.output, 'Found it in parser.ts.');
  assert.equal(t.durationMs, 4200);
  assert.equal(t.agentId, 'a1b2c3');
  assert.equal(replies(p).length, 0);
  assert.equal(p.bg.size, 0);

  // The agent id can be only in the text.
  const q = claude([prompt, call('t1', 'Agent', { description: 'x', prompt: 'x' }), result('t1', 'Done.\nagentId: zz99-aa (internal)', {})]);
  assert.equal(tool(q, 't1').subagent!.id, 'zz99-aa');
  assert.equal(tool(q, 't1').subagent!.state, 'done');

  const failed = claude([prompt, call('t1', 'Agent', { description: 'x', prompt: 'x' }), result('t1', 'Error: it broke', {}, { is_error: true })]);
  assert.equal(tool(failed, 't1').subagent!.state, 'failed');
  assert.equal(tool(failed, 't1').status, 'error');
  const stopped = claude([prompt, call('t1', 'Agent', { description: 'x', prompt: 'x' }), result('t1', 'Stopped.', { status: 'interrupted' })]);
  assert.equal(tool(stopped, 't1').subagent!.state, 'stopped');
});

test('claude: SendMessage wakes an agent that came back', () => {
  const n = block({ task: 'ad34', use: 't1', status: 'completed', summary: 'Agent "Update the docs" finished', result: 'Ok.' });
  const p = claude([prompt, ...launch('t1', 'ad34'), attachment('n1', n)]);
  assert.equal(tool(p, 't1').subagent!.state, 'done');
  p.takeDirty();
  p.feed(JSON.stringify(call('t5', 'SendMessage', { to: 'ad34', summary: 'more', message: 'Also the German guide.' })));
  const sub = tool(p, 't1').subagent!;
  assert.equal(sub.state, 'running');
  assert.equal('endedAt' in sub, false);
  assert.equal(p.takeDirty().some((i) => i.id === 't1'), true);
  // Its next notice ends it again, with its own reply.
  p.feed(JSON.stringify(attachment('n2', n.replace('Ok.', 'German too.'))));
  assert.equal(tool(p, 't1').subagent!.state, 'done');
  assert.equal(replies(p).length, 2);
  // A message to anything else leaves agents alone.
  p.feed(JSON.stringify(call('t6', 'SendMessage', { to: 'someone', message: 'hi' })));
  assert.equal(tool(p, 't1').subagent!.state, 'done');
});

test('claude: a background command notice behaves as before', () => {
  const n = block({ task: 'bash1', use: 't3', status: 'completed', summary: 'Background command "npm test" completed (exit code 0)' });
  const lines = [
    prompt,
    call('t3', 'Bash', { command: 'npm test', run_in_background: true }),
    result('t3', 'Command running in background', { backgroundTaskId: 'bash1' }),
  ];
  const att = claude([...lines, attachment('n1', n)]);
  assert.equal(att.items.some((i) => i.kind === 'system'), false);
  assert.equal(att.bg.has('bash1'), false);
  assert.equal(tool(att, 't3').subagent, undefined);
  for (const meta of [true, false]) {
    const msg = claude([...lines, notice('m1', n, meta)]);
    const sys = msg.items.filter((i): i is SystemItem => i.kind === 'system');
    assert.equal(sys.length, 1);
    assert.equal(sys[0].id, 'm1');
    assert.equal(sys[0].text, 'Background task completed: Background command "npm test" completed (exit code 0)');
    assert.equal(sys[0].detail, undefined);
    assert.equal(sys[0].subagent, undefined);
    assert.equal(msg.bg.has('bash1'), false);
  }
  // A text with a notice that has no closed block still shows as it did.
  const odd = claude([prompt, notice('m1', '<task-notification>\n<status>failed</status>\n<summary>Gone wrong</summary>', true)]);
  assert.equal((byId(odd, 'm1') as SystemItem).level, 'error');
  assert.equal((byId(odd, 'm1') as SystemItem).text, 'Background task failed: Gone wrong');
});

test('claude: a notice that opens a turn keeps the turn counts right', () => {
  const n = block({ task: 'ad34', use: 't1', status: 'completed', summary: 'Agent "Update the docs" finished', result: 'Ok.' });
  const p = claude([prompt, ...launch('t1', 'ad34'), attachment('n1', n), { ...prompt, uuid: 'u2', timestamp: at(), message: { role: 'user', content: 'Thanks' } }]);
  assert.equal(p.stats.turns, 2);
  assert.equal(p.stats.userMessages, 2);
  assert.equal(replies(p).length, 1);
});

test('claude: the agent\'s own transcript parses as before', () => {
  const p = new ClaudeParser({ retain: true, collectChunks: false, sidechain: true });
  for (const l of [
    { ...prompt, isSidechain: true, agentId: 'ad34' },
    { ...call('s1', 'Read', { file_path: '/a/b.ts' }), isSidechain: true },
    { ...result('s1', 'text', { file: { content: 'x', numLines: 1, totalLines: 1 } }), isSidechain: true },
  ])
    p.feed(JSON.stringify(l));
  p.finish();
  assert.equal(p.items.filter((i) => i.kind === 'tool').length, 1);
  assert.equal(p.items.some((i) => i.kind === 'user'), true);
});

// ---- Codex -------------------------------------------------------------------------------------------------------

const TOKEN = 'gAAAAABqd5onAwUpGKqzjYvNvfTiA4jWYZrWBN1xifDivDXz_nTDwh_6Y2oHnRnqoqJjjo89A3gbtYrAnk16C';
let cclock = Date.parse('2026-10-17T04:00:00.000Z');
const cat = () => new Date((cclock += 1000)).toISOString();

const codex = (lines: object[]) => {
  const p = new CodexParser({ retain: true, collectChunks: false });
  for (const l of lines) p.feed(JSON.stringify(l));
  p.finish();
  return p;
};
const rec = (type: string, payload: object, ts = cat()) => ({ timestamp: ts, type, payload });
const spawn = (callId: string, args: object) => rec('response_item', { type: 'function_call', name: 'spawn_agent', namespace: 'collaboration', call_id: callId, arguments: JSON.stringify(args) });
const spawned = (callId: string, name: string) => rec('response_item', { type: 'function_call_output', call_id: callId, output: JSON.stringify({ task_name: `/root/${name}` }) });
const older = (kind: string, id: string, thread: string, path: string) =>
  rec('event_msg', { type: 'item_completed', thread_id: 'lead', turn_id: 't1', item: { type: 'SubAgentActivity', id, kind, agent_thread_id: thread, agent_path: path }, completed_at_ms: (cclock += 1000) });
const newer = (kind: string, id: string, thread: string, path: string) =>
  rec('event_msg', { type: 'sub_agent_activity', event_id: id, occurred_at_ms: (cclock += 1000), agent_thread_id: thread, agent_path: path, kind });
const turn = [rec('session_meta', { id: 'lead', cwd: '/tmp/x', cli_version: '1.0' }), rec('event_msg', { type: 'task_started', turn_id: 't1' }), rec('event_msg', { type: 'item_completed', item: { type: 'UserMessage', id: 'um1', content: [{ type: 'text', text: 'Audit it' }] } })];
const ctool = (p: { items: TimelineItem[] }, id: string) => (byId(p, id) as ToolItem).tool;
const csys = (p: { items: TimelineItem[] }) => p.items.filter((i): i is SystemItem => i.kind === 'system');

test('codex: the spawn call marks its subagent, titled from its task name', () => {
  const p = codex([...turn, spawn('call_1', { task_name: 'control_plane_audit', message: TOKEN, fork_turns: 'all', agent_type: 'explorer', model: 'gpt-5' })]);
  const t = ctool(p, 'call_1');
  assert.deepEqual(t.subagent, { title: 'Control plane audit', type: 'explorer', model: 'gpt-5', state: 'running' });
  assert.equal(t.category, 'task');
  assert.equal(t.title, 'Spawn agent control_plane_audit');
  const q = codex([...turn, spawn('call_1', { task_name: '/root/fix_the_parser', message: 'Fix the parser so that it reads both formats', role: 'worker' })]);
  assert.deepEqual(ctool(q, 'call_1').subagent, { title: 'Fix the parser', type: 'worker', model: undefined, state: 'running' });
  assert.equal(ctool(q, 'call_1').title, 'Spawn agent /root/fix_the_parser: Fix the parser so that it reads both formats');
  // No name: the start of a readable message, else a plain word.
  assert.equal(ctool(codex([...turn, spawn('call_1', { message: 'Check the links in the guide, please' })]), 'call_1').subagent!.title, 'Check the links in the guide, please');
  assert.equal(ctool(codex([...turn, spawn('call_1', { message: TOKEN })]), 'call_1').subagent!.title, 'Subagent');
});

test('codex: encrypted messages never show in titles', () => {
  // A call in a turn of structured items shows with its output.
  const lines = (name: string, args: object) =>
    codex([
      ...turn,
      rec('response_item', { type: 'function_call', name, namespace: 'collaboration', call_id: 'c1', arguments: JSON.stringify(args) }),
      rec('response_item', { type: 'function_call_output', call_id: 'c1', output: '{}' }),
    ]);
  for (const name of ['spawn_agent', 'send_message', 'followup_task']) {
    const t = ctool(lines(name, { task_name: 'audit', target: 'audit', message: TOKEN }), 'c1');
    assert.equal(t.title.includes('gAAAA'), false, name);
    assert.equal(t.title.includes(':'), false, name);
    // 40+ characters without spaces are unreadable too; with spaces they are fine.
    assert.equal(ctool(lines(name, { target: 'audit', message: 'x'.repeat(50) }), 'c1').title.includes('xxxx'), false);
    assert.equal(ctool(lines(name, { target: 'audit', message: 'Please look at the second file' }), 'c1').title.includes('Please look'), true);
  }
});

test('codex: the older activity records: started, completed, interrupted', () => {
  const p = codex([
    ...turn,
    spawn('call_1', { task_name: 'control_plane_audit', message: TOKEN }),
    older('started', 'call_1', 'th-1', '/root/control_plane_audit'),
    spawned('call_1', 'control_plane_audit'),
    older('interacted', 'call_9', 'th-1', '/root/control_plane_audit'),
  ]);
  let s = ctool(p, 'call_1').subagent!;
  assert.deepEqual({ ...s }, { title: 'Control plane audit', type: undefined, model: undefined, state: 'running', id: 'th-1', key: 'codex:th-1' });
  assert.equal(p.items.filter((i) => i.kind === 'tool').length, 1, 'activity makes no step');
  assert.equal(csys(p).length, 0);

  p.feed(JSON.stringify(older('completed', 'subagent-completed-1', 'th-1', '/root/control_plane_audit')));
  s = ctool(p, 'call_1').subagent!;
  assert.equal(s.state, 'done');
  assert.equal(typeof s.endedAt, 'number');
  assert.equal(csys(p).length, 1);
  assert.deepEqual(csys(p)[0].subagent, { key: 'codex:th-1', id: 'th-1', title: 'Control plane audit', type: undefined, ended: 'replied', text: '' });
  assert.equal(csys(p)[0].text, 'Control plane audit finished');
  assert.equal(csys(p)[0].level, 'info');
  assert.equal(csys(p)[0].id, 'sa:subagent-completed-1');

  // Spoken to again: running; then stopped (the id is the interrupting call's own: no clash with its step).
  p.feed(JSON.stringify(rec('response_item', { type: 'function_call', name: 'interrupt_agent', namespace: 'collaboration', call_id: 'call_5', arguments: '{"target":"/root/control_plane_audit"}' })));
  p.feed(JSON.stringify(rec('response_item', { type: 'function_call_output', call_id: 'call_5', output: '{}' })));
  p.feed(JSON.stringify(older('interacted', 'call_6', 'th-1', '/root/control_plane_audit')));
  s = ctool(p, 'call_1').subagent!;
  assert.equal(s.state, 'running');
  assert.equal('endedAt' in s, false);
  p.feed(JSON.stringify(older('interrupted', 'call_5', 'th-1', '/root/control_plane_audit')));
  assert.equal(ctool(p, 'call_1').subagent!.state, 'stopped');
  assert.equal(ctool(p, 'call_5').name, 'interrupt_agent');
  const last = csys(p)[1];
  assert.equal(last.text, 'Control plane audit was stopped');
  assert.equal(last.subagent!.ended, 'stopped');

  p.feed(JSON.stringify(older('errored', 'subagent-completed-2', 'th-1', '/root/control_plane_audit')));
  assert.equal(ctool(p, 'call_1').subagent!.state, 'failed');
  assert.equal(csys(p)[2].level, 'error');
  assert.equal(csys(p)[2].text, 'Control plane audit stopped with an error');
  assert.equal(csys(p)[2].subagent!.ended, 'failed');
});

test('codex: the newer activity records: started by the call id, completed by the thread', () => {
  const p = codex([
    ...turn,
    spawn('call_a', { task_name: 'naget_assessment', message: TOKEN }),
    newer('started', 'call_a', 'th-a', '/root/naget_assessment'),
    spawned('call_a', 'naget_assessment'),
    spawn('call_b', { task_name: 'acquisition_precedents', message: TOKEN }),
    newer('started', 'call_b', 'th-b', '/root/acquisition_precedents'),
    spawned('call_b', 'acquisition_precedents'),
    newer('interacted', 'call_c', 'th-b', '/root/acquisition_precedents'),
    older('completed', 'subagent-completed-b1', 'th-b', '/root/acquisition_precedents'),
  ]);
  assert.equal(ctool(p, 'call_a').subagent!.id, 'th-a');
  assert.equal(ctool(p, 'call_a').subagent!.state, 'running');
  assert.equal(ctool(p, 'call_b').subagent!.key, 'codex:th-b');
  assert.equal(ctool(p, 'call_b').subagent!.state, 'done');
  assert.equal(p.items.filter((i) => i.kind === 'tool').length, 2);
  const r = csys(p);
  assert.equal(r.length, 1);
  assert.equal(r[0].subagent!.title, 'Acquisition precedents');
  assert.equal(r[0].subagent!.id, 'th-b');
  // It was woken and finished again: a second reply.
  p.feed(JSON.stringify(newer('interacted', 'call_d', 'th-b', '/root/acquisition_precedents')));
  assert.equal(ctool(p, 'call_b').subagent!.state, 'running');
  p.feed(JSON.stringify(older('completed', 'subagent-completed-b2', 'th-b', '/root/acquisition_precedents')));
  assert.equal(ctool(p, 'call_b').subagent!.state, 'done');
  assert.equal(csys(p).length, 2);
  assert.equal(ctool(p, 'call_a').subagent!.state, 'running');
});

test('codex: a started record without the call id finds the call by the task name', () => {
  const p = codex([
    ...turn,
    spawn('call_a', { task_name: 'first_job', message: TOKEN }),
    spawn('call_b', { task_name: 'second_job', message: TOKEN }),
    spawn('call_c', { task_name: 'second_job', message: TOKEN }),
    newer('started', 'ev-1', 'th-2', '/root/second_job'),
  ]);
  assert.equal(ctool(p, 'call_a').subagent!.id, undefined);
  assert.equal(ctool(p, 'call_b').subagent!.id, undefined);
  assert.equal(ctool(p, 'call_c').subagent!.id, 'th-2', 'the newest one with that name and no thread');
  p.feed(JSON.stringify(newer('started', 'ev-2', 'th-3', '/root/second_job')));
  assert.equal(ctool(p, 'call_b').subagent!.id, 'th-3');
});

test('codex: a refused spawn ends its subagent', () => {
  const p = codex([...turn, spawn('call_1', { task_name: 'job', message: TOKEN }), rec('response_item', { type: 'function_call_output', call_id: 'call_1', output: 'Error: too many agents' })]);
  assert.equal(ctool(p, 'call_1').status, 'error');
  assert.equal(ctool(p, 'call_1').subagent!.state, 'failed');
});

test('codex: activity does not hide the turn\'s raw messages', () => {
  // A turn without structured items: its activity record must not turn them off.
  const p = codex([
    rec('session_meta', { id: 'lead', cwd: '/tmp/x' }),
    rec('event_msg', { type: 'task_started', turn_id: 't1' }),
    spawn('call_1', { task_name: 'job', message: TOKEN }),
    older('started', 'call_1', 'th-1', '/root/job'),
    spawned('call_1', 'job'),
    rec('response_item', { type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text: 'Started it.' }] }),
  ]);
  assert.equal(p.items.some((i) => i.kind === 'assistant' && i.text === 'Started it.'), true);
  assert.equal(ctool(p, 'call_1').subagent!.id, 'th-1');
});

test('codex: a subagent\'s own rollout keeps showing only its own work', () => {
  const p = codex([
    rec('session_meta', { id: 'th-1', forked_from_id: 'lead', cwd: '/tmp/x', source: { subagent: { thread_spawn: { parent_thread_id: 'lead' } } } }),
    rec('event_msg', { type: 'task_started', turn_id: 't9' }),
    rec('event_msg', { type: 'item_completed', item: { type: 'AgentMessage', id: 'am1', content: [{ text: 'On it.' }] } }),
    newer('started', 'call_x', 'th-9', '/root/job/child'),
    older('completed', 'subagent-completed-x', 'th-9', '/root/job/child'),
  ]);
  assert.equal(p.summary.parentId, 'lead');
  assert.equal(p.items.some((i) => i.kind === 'assistant' && i.text === 'On it.'), true);
  // Its own child ended: a reply (the thread is unknown here, the path names it); no steps.
  assert.equal(p.items.filter((i) => i.kind === 'tool').length, 0);
  assert.equal(csys(p)[0].subagent!.title, 'Child');
});

console.log(`${passed} passed`);
