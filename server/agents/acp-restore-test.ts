// Script test for how a turn that was open when the app restarted ends (AcpLive.restored, in acp.ts): the runner replays what
// the agent printed, and the agent's answer to the prompt that began the turn (its call is gone with the old server) ends the
// turn: by that prompt's call id when the transcript noted it, else, for an older transcript, by any turn's end or an error
// to a call this server did not make. An error that says the agent's own model call was cut by the restart ends it with
// CUT_BY_RESTART. A fake runner replays lines into an AcpLive over a transcript made by hand. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/acp-restore-test.ts && DATA_DIR=/tmp/hydor-test-acp-restore node dist/dev/acp-restore-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AcpAgentDef } from '../../shared/types.ts';
import { AcpLive, CUT_BY_RESTART } from './acp.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

type Json = Record<string, any>;

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-acp-restore-'));
const def: AcpAgentDef = { id: 'custom-test', name: 'Custom', command: 'custom', args: [] };

function fakeRunner() {
  const runner: any = new EventEmitter();
  runner.meta = { runId: 'run1' };
  runner.stop = () => {};
  runner.sent = [] as Json[];
  runner.writeLine = (m: Json) => runner.sent.push(m);
  return runner;
}

let count = 0;
/**
 * An AcpLive restored over a transcript where a turn is open: its run noted, one update handled (so lines after it are new),
 * and a prompt record (with `rpc`, the call that carried it, when given). The runner replays the update; `replay` plays the rest.
 */
function restored(rpc: string | undefined, ...replay: Json[]) {
  const file = path.join(dir, `t${++count}.jsonl`);
  const rec = (e: Json, ln: number) => JSON.stringify({ ...e, ts: 1, ln });
  fs.writeFileSync(
    file,
    [rec({ t: 'run', run: 'run1' }, 0), rec({ t: 'prompt', id: 'p1', text: 'go', ...(rpc ? { rpc } : {}) }, 0), rec({ t: 'update', u: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Working' } } }, 1)].join('\n') + '\n',
  );
  const runner = fakeRunner();
  const live = new AcpLive(runner, { cwd: dir, id: `s${count}`, def, transcript: file });
  live.restored();
  assert.equal(live.state.status, 'working', 'the open turn shows as working');
  const results: string[] = [];
  live.on('result', () => results.push('result'));
  // What the agent printed before the restart, replayed: its handled line first, then what came after.
  runner.emit('line', JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Working' } } } }), true);
  for (const m of replay) runner.emit('line', JSON.stringify({ jsonrpc: '2.0', ...m }), true);
  const ends = () =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('{"t":"end"'))
      .map((l) => JSON.parse(l));
  return { live, runner, file, results, ends };
}

const cut = { code: -32603, message: 'terminated' };

test('an error answer to the open prompt’s recorded call ends the turn, saying the restart cut it', () => {
  const { live, results, ends } = restored('ac-old-5', { id: 'ac-old-5', error: cut });
  assert.equal(live.state.status, 'idle');
  assert.equal(live.state.error, CUT_BY_RESTART);
  assert.equal(results.length, 1);
  assert.equal(ends().length, 1);
  assert.equal(ends()[0].error, CUT_BY_RESTART);
});

test('a broken connection said in other words is a cut by the restart too', () => {
  for (const message of ['fetch failed', 'read ECONNRESET', 'connect ECONNREFUSED 127.0.0.1:5000', 'socket hang up', 'other side closed']) {
    const { live } = restored('ac-old-5', { id: 'ac-old-5', error: { code: -32603, message } });
    assert.equal(live.state.error, CUT_BY_RESTART, message);
  }
});

test('an error that says anything else ends the turn with its own words', () => {
  const { live, ends } = restored('ac-old-5', { id: 'ac-old-5', error: { code: -32603, message: 'The model refused' } });
  assert.equal(live.state.status, 'idle');
  assert.equal(live.state.error, 'The model refused');
  assert.equal(ends()[0].error, 'The model refused');
});

test('an error answer to another earlier call does not end a turn whose prompt call is known', () => {
  const { live, results, ends } = restored('ac-old-5', { id: 'ac-old-3', error: cut }, { id: 'ac-old-4', result: { stopReason: 'end_turn' } });
  assert.equal(live.state.status, 'working');
  assert.equal(results.length, 0);
  assert.equal(ends().length, 0);
});

test('with no call noted for the prompt (an older transcript), an error to a call of an earlier server ends the turn', () => {
  const { live, ends } = restored(undefined, { id: 'old-server-9', error: cut });
  assert.equal(live.state.status, 'idle');
  assert.equal(live.state.error, CUT_BY_RESTART);
  assert.equal(ends().length, 1);
});

test('with no call noted, an error to a call this server made is not the turn’s end', () => {
  const { live, runner } = restored(undefined);
  const own = live.rpc.nextId();
  runner.emit('line', JSON.stringify({ jsonrpc: '2.0', id: own, error: cut }), false);
  assert.equal(live.state.status, 'working');
});

test('a turn’s end (a result with its stop reason) from the recorded call ends it with that reason', () => {
  const { live, results, ends } = restored('ac-old-5', { id: 'ac-old-5', result: { stopReason: 'max_tokens' } });
  assert.equal(live.state.status, 'idle');
  assert.equal(live.state.error, undefined);
  assert.equal(results.length, 1);
  assert.equal(ends()[0].stopReason, 'max_tokens');
});

test('with no call noted, a turn’s end from any call ends it', () => {
  const { live, ends } = restored(undefined, { id: 'anything-1', result: { stopReason: 'end_turn' } });
  assert.equal(live.state.status, 'idle');
  assert.equal(ends()[0].stopReason, 'end_turn');
});

test('an answer that is no turn’s end (a result without a stop reason) leaves the turn open', () => {
  const { live, ends } = restored('ac-old-5', { id: 'ac-old-5', result: {} }, { id: 'old-server-9', result: { ok: true } });
  assert.equal(live.state.status, 'working');
  assert.equal(ends().length, 0);
});

test('a new prompt notes the id of the call that carries it, so a later restart knows its answer', async () => {
  const file = path.join(dir, 'fresh.jsonl');
  const runner = fakeRunner();
  // Answers the setup calls the way an agent would.
  runner.writeLine = (m: Json) => {
    runner.sent.push(m);
    if (m.id == null) return;
    const result = m.method === 'initialize' ? { protocolVersion: 1, agentCapabilities: {} } : m.method === 'session/new' ? { sessionId: 's1' } : null;
    if (result) setImmediate(() => runner.emit('line', JSON.stringify({ jsonrpc: '2.0', id: m.id, result }), false));
  };
  const live = new AcpLive(runner, { cwd: dir, id: 'fresh', def, transcript: file });
  await live.boot(false);
  await live.sendMessage('go', []);
  const call = runner.sent.find((m: Json) => m.method === 'session/prompt');
  assert.ok(call, 'the prompt went out');
  const prompt = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('{"t":"prompt"'))
    .map((l) => JSON.parse(l))[0];
  assert.equal(prompt.rpc, call.id);
  assert.ok(live.rpc.owns(call.id));
  assert.ok(!live.rpc.owns('old-server-9'));
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}\n`, e);
    process.exitCode = 1;
  }
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
