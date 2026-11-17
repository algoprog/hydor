// Script test for how a Grok Build turn stopped by the plan's usage limit is told apart (AcpLive 'limithit', limitStopped), against a
// fake agent behind a fake runner: the error's data, the turn's own final text, a short throttle, and ordinary replies. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/acp-limit-test.ts && DATA_DIR=/tmp/hydor-test-acp-limit node dist/dev/acp-limit-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AcpAgentDef } from '../../shared/types.ts';
import { AcpLive, planLimitHit } from './acp.ts';

type Json = Record<string, any>;

// The detection alone.
const yes = (t: Parameters<typeof planLimitHit>[0]) => assert.equal(planLimitHit(t), true, JSON.stringify(t));
const no = (t: Parameters<typeof planLimitHit>[0]) => assert.equal(planLimitHit(t), false, JSON.stringify(t));
yes({ error: 'Internal error', data: { kind: 'usage_limit_reached' } });
yes({ error: 'Internal error', data: { error: { type: 'usage_pool_exhausted', message: 'x' } } });
yes({ error: "You've hit the credit limit for your plan." });
yes({ error: 'You hit your weekly limit.' });
yes({ error: "You've hit your spending cap." });
yes({ error: 'You hit your free usage limit.' });
yes({ error: 'Your team has run out of credits' });
yes({ error: 'request failed with status 402' });
yes({ error: 'payment required', code: 402 });
yes({ text: 'You hit your weekly limit.' });
yes({ text: "You've hit the credit limit for your plan.\n" });
no({ error: 'rate_limited', data: { kind: 'rate_limited' } });
no({ error: 'Too many requests', data: { kind: 'global_rate_limit' } });
no({ error: 'You hit the rate limit, try again in a minute.', data: { kind: 'rate_limited' } });
no({ error: 'concurrency_limit', data: { kind: 'concurrency_limit' } });
no({ error: 'The agent stopped' });
no({ text: '' });
no({ text: 'Done: I fixed the bug. Note that the API says "You hit your weekly limit." when the plan runs out, and the code handles it.' });
no({ text: 'You hit your weekly limit.', tools: 2 });
no({ text: `${'Here is how plan limits work. '.repeat(10)}You hit your weekly limit.` });
no({ text: 'To handle it, check whether the user has hit the credit limit for the plan, then show a banner.' });

/** A fake Grok-like agent: each prompt is answered by `script(n)`: updates to send, then a result or an error. */
type Step = { text?: string; tool?: boolean; error?: { code: number; message: string; data?: unknown }; stopReason?: string };
function fakeRunner(script: (n: number) => Step) {
  const runner: any = new EventEmitter();
  runner.meta = { runId: 'run1' };
  runner.stop = () => {};
  let n = 0;
  const send = (m: Json) => setImmediate(() => runner.emit('line', JSON.stringify({ jsonrpc: '2.0', ...m }), false));
  const update = (u: Json) => send({ method: 'session/update', params: { sessionId: 's1', update: u } });
  runner.writeLine = (m: Json) => {
    if (m.id == null) return;
    switch (m.method) {
      case 'initialize':
        return send({ id: m.id, result: { protocolVersion: 1, agentCapabilities: {} } });
      case 'session/new':
        return send({ id: m.id, result: { sessionId: 's1' } });
      case 'session/prompt': {
        const st = script(++n);
        if (st.tool) update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'ls', kind: 'execute' });
        if (st.text) update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: st.text } });
        // The answer follows its updates.
        return setTimeout(() => send(st.error ? { id: m.id, error: st.error } : { id: m.id, result: { stopReason: st.stopReason ?? 'end_turn' } }), 5);
      }
      default:
        return send({ id: m.id, error: { code: -32601, message: 'no' } });
    }
  };
  return runner;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-acp-limit-'));
const grokDef: AcpAgentDef = { id: 'grok', name: 'Grok Build', command: 'grok', args: [] };
const otherDef: AcpAgentDef = { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: [] };

/** Runs one turn and says whether it ended as a limit stop, and in what order the events came. */
async function turn(id: string, step: Step, def = grokDef) {
  const live = new AcpLive(
    fakeRunner(() => step),
    { cwd: dir, id, def, transcript: path.join(dir, `${id}.jsonl`) },
  );
  await live.boot(false);
  const events: string[] = [];
  live.on('limithit', () => events.push('limithit'));
  live.on('result', () => events.push('result'));
  await live.sendMessage('go', []);
  for (let i = 0; i < 100 && !events.includes('result'); i++) await new Promise((r) => setTimeout(r, 10));
  return { live, events };
}

// An error that names the plan limit in its data: said before the result.
{
  const { live, events } = await turn('a', { error: { code: -32603, message: 'Internal error', data: { kind: 'usage_limit_reached' } } });
  assert.deepEqual(events, ['limithit', 'result']);
  assert.equal(live.limitStopped, true);
  assert.match(live.state.error ?? '', /Internal error/);
}
// An error that says it in a sentence.
{
  const { live, events } = await turn('b', { error: { code: -32603, message: 'You hit your weekly limit.' } });
  assert.deepEqual(events, ['limithit', 'result']);
  assert.equal(live.limitStopped, true);
}
// A turn that is only that sentence as the agent's own text.
{
  const { live, events } = await turn('c', { text: "You've hit the credit limit for your plan." });
  assert.deepEqual(events, ['limithit', 'result']);
  assert.equal(live.limitStopped, true);
}
// A short throttle is no plan limit.
{
  const { live, events } = await turn('d', { error: { code: -32603, message: 'Too many requests', data: { kind: 'rate_limited' } } });
  assert.deepEqual(events, ['result']);
  assert.equal(live.limitStopped, false);
}
// An ordinary reply that talks of limits, and one after tool work, are none either.
{
  const a = await turn('e', { text: 'The plan has a weekly limit; when you hit your weekly limit the API answers with status 402, so the client shows a banner.' });
  assert.deepEqual(a.events, ['result']);
  assert.equal(a.live.limitStopped, false);
  const b = await turn('f', { tool: true, text: 'You hit your weekly limit.' });
  assert.deepEqual(b.events, ['result']);
}
// Another ACP agent's turn is never read this way.
{
  const { live, events } = await turn('g', { error: { code: -32603, message: 'You hit your weekly limit.' } }, otherDef);
  assert.deepEqual(events, ['result']);
  assert.equal(live.limitStopped, false);
}
// A turn that follows a limit stop starts clean.
{
  let n = 0;
  const live = new AcpLive(
    fakeRunner(() => (++n === 1 ? { error: { code: -32603, message: 'You hit your weekly limit.' } } : { text: 'All done.' })),
    { cwd: dir, id: 'h', def: grokDef, transcript: path.join(dir, 'h.jsonl') },
  );
  await live.boot(false);
  const ended = () => new Promise<void>((r) => live.once('result', () => r()));
  let done = ended();
  await live.sendMessage('one', []);
  await done;
  assert.equal(live.limitStopped, true);
  done = ended();
  await live.sendMessage('two', []);
  await done;
  assert.equal(live.limitStopped, false);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('acp limit: ok');
