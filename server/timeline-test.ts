// Script tests for a session's timeline following its transcript: a Claude transcript that turns up somewhere
// else than where it was expected (another account's folder) is found and read there, so the session's steps
// end as done rather than showing running forever; background tasks begun before a restart get their start from it.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/timeline-test.ts
//   DATA_DIR=/tmp/hydor-test-timeline CLAUDE_CONFIG_DIR=/tmp/hydor-test-timeline/claude node dist/dev/timeline-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentRoots, config } from './config.ts';
import { ClaudeLive } from './agents/claude.ts';
import type { ClaudeParser } from './history/claude.ts';
import { Timeline } from './timeline.ts';

if (!config.dataDir.startsWith('/tmp/') || !config.claudeProjectsDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and CLAUDE_CONFIG_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-timeline-test-'));
const account = path.join(tmp, 'account', 'projects');
agentRoots.claudeProjects = [config.claudeProjectsDir, account];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const transcript = (id: string) =>
  [
    { type: 'user', uuid: 'u1', timestamp: '2026-11-02T19:00:00.000Z', sessionId: id, message: { role: 'user', content: 'List the files' } },
    {
      type: 'assistant',
      uuid: 'a1',
      timestamp: '2026-11-02T19:00:01.000Z',
      message: { id: 'msg_1', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }], usage: { input_tokens: 10, output_tokens: 5 } },
    },
    {
      type: 'user',
      uuid: 'u2',
      timestamp: '2026-11-02T19:00:02.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'a\nb' }] },
      toolUseResult: { stdout: 'a\nb', stderr: '' },
    },
  ]
    .map((m) => JSON.stringify(m) + '\n')
    .join('');

// A session just started: its transcript is expected in one folder, and the CLI writes it in another.
const id = crypto.randomUUID();
const expected = path.join(config.claudeProjectsDir, '-home-u-proj', `${id}.jsonl`);
const written = path.join(account, '-home-u-proj', `${id}.jsonl`);
const tl = new Timeline(`claude:${id}`, 'claude', expected);
await tl.load(true);
assert.equal(tl.total, 0, 'nothing written yet');
fs.mkdirSync(path.dirname(written), { recursive: true });
fs.writeFileSync(written, transcript(id));
await wait(1100);
await tl.readMore();
assert.equal(tl.filePath, written, 'followed where the CLI wrote it');
const step = tl.item('toolu_1');
assert.equal(step?.kind === 'tool' && step.tool.status, 'ok', 'the command ran and ended');
tl.dispose();

// A transcript not written yet under its own name is waited for: another session's file is not taken for it.
const next = crypto.randomUUID();
const waiting = path.join(config.claudeProjectsDir, '-home-u-proj', `${next}.jsonl`);
const tl2 = new Timeline(`claude:${id}`, 'claude', waiting);
await tl2.load(true);
await wait(1100);
await tl2.readMore();
assert.equal(tl2.filePath, waiting);
assert.equal(tl2.total, 0);
tl2.dispose();

// Background tasks begun before the app restarted: the agent's output, read again, says they run but not since
// when; the transcript tells it (the call that started each), so they show how long they have been working.
{
  const sid = crypto.randomUUID();
  const at = (s: string) => `2026-11-05T05:${s}.000Z`;
  const lines = [
    { type: 'user', uuid: 'v1', timestamp: at('48:00'), sessionId: sid, message: { role: 'user', content: 'Upgrade the editors' } },
    {
      type: 'assistant',
      uuid: 'v2',
      timestamp: at('48:42'),
      message: { id: 'msg_a', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_agent', name: 'Agent', input: { description: 'Documents editor upgrade', prompt: 'Upgrade it', run_in_background: true } }] },
    },
    {
      type: 'user',
      uuid: 'v3',
      timestamp: at('48:43'),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_agent', content: 'Launched' }] },
      toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a0566', description: 'Documents editor upgrade' },
    },
    {
      type: 'assistant',
      uuid: 'v4',
      timestamp: at('50:10'),
      message: { id: 'msg_b', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_cmd', name: 'Bash', input: { command: 'npm run dev', run_in_background: true } }] },
    },
    {
      type: 'user',
      uuid: 'v5',
      timestamp: at('50:11'),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_cmd', content: 'Running in the background' }] },
      toolUseResult: { stdout: '', stderr: '', backgroundTaskId: 'b3jx9' },
    },
  ];
  const file = path.join(config.claudeProjectsDir, '-home-u-proj', `${sid}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.map((m) => JSON.stringify(m) + '\n').join(''));
  const tl3 = new Timeline(`claude:${sid}`, 'claude', file);
  await tl3.load(true);
  const parser = tl3.parser as ClaudeParser;

  // The output read again after a restart, as the CLI wrote it: one task started, one known from the list alone.
  const runner = Object.assign(new EventEmitter(), { writeLine: () => {} });
  const agent = new ClaudeLive(runner as any, { sessionId: sid } as any);
  const out = (m: object) => runner.emit('line', JSON.stringify(m), true);
  out({ type: 'system', subtype: 'task_started', task_id: 'a0566', tool_use_id: 'toolu_agent', description: 'Documents editor upgrade', task_type: 'local_agent' });
  out({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'a0566', task_type: 'local_agent', description: 'Documents editor upgrade' }, { task_id: 'b3jx9', task_type: 'local_bash', description: 'npm run dev' }] });
  const [docs, cmd] = agent.state.backgroundTasks ?? [];
  assert.equal(docs?.startedAt, undefined, 'read again: not started now');
  assert.equal(cmd?.startedAt, undefined);
  assert.equal(parser.taskStart(docs.id, docs.toolUseId), Date.parse(at('48:42')), 'the agent: when it was called');
  assert.equal(parser.taskStart(cmd.id, cmd.toolUseId), Date.parse(at('50:10')), 'the command, by its id alone: when it was called');
  assert.equal(parser.taskStart('unknown'), undefined, 'a task the transcript does not have');

  // A subagent in the foreground is never on the background list: a command ending there must not end it, its call's result does.
  out({ type: 'system', subtype: 'task_started', task_id: 'a77', tool_use_id: 'toolu_fg', description: 'Build the harness', task_type: 'local_agent' });
  out({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'a0566', task_type: 'local_agent', description: 'Documents editor upgrade' }] });
  const running = () => (agent.state.backgroundTasks ?? []).map((t) => t.id).sort();
  assert.deepEqual(running(), ['a0566', 'a77'], 'the command ended; the foreground subagent still runs');
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_bg2', content: 'Async agent launched successfully.' }] } });
  out({ type: 'system', subtype: 'task_started', task_id: 'a88', tool_use_id: 'toolu_bg2', description: 'Later', task_type: 'local_agent' });
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_fg', content: 'The harness is built.' }] } });
  assert.deepEqual(running(), ['a0566', 'a88'], 'its result ends the foreground subagent, not one launched in the background');
  tl3.dispose();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('timeline-test: all passed');
