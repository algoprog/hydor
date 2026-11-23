// Script test for Antigravity CLI over ACP (server/agents/acp.ts): how its plan limit is read from a turn (durationMs, antigravityLimit),
// the config options it offers as its model and thinking level (selectOption, thoughtOption), the model and effort it sets through
// session/set_config_option, its tier, and the limit and sign-out a turn ends with, against a fake agent behind a fake runner.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/acp-antigravity-test.ts && CUDA_VISIBLE_DEVICES= DATA_DIR=/tmp/hydor-test-acp-antigravity node dist/dev/acp-antigravity-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AcpAgentDef } from '../../shared/types.ts';
import { AcpLive, antigravityLimit, durationMs, selectOption, thoughtOption } from './acp.ts';

type Json = Record<string, any>;

// The durations a limit says when it lifts.
assert.equal(durationMs('143h57m55s'), (143 * 3600 + 57 * 60 + 55) * 1000);
assert.equal(durationMs('2h 39m'), (2 * 3600 + 39 * 60) * 1000);
assert.equal(durationMs('1d2h'), 26 * 3600 * 1000);
assert.equal(durationMs('45s'), 45_000);
assert.equal(durationMs('soon'), null);

// The limit a turn's own words name, and the ones that are none.
{
  const now = 1_000_000;
  const quota = 'API error (attempt 3): RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 2h39m52s.';
  assert.deepEqual(antigravityLimit({ error: quota }, now), { label: 'Usage limit', resetsAt: now + (2 * 3600 + 39 * 60 + 52) * 1000 });
  assert.deepEqual(
    antigravityLimit(
      { error: 'Internal error', data: { message: '⚠ Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 143h57m55s.' } },
      now,
    ),
    { label: 'Usage limit', resetsAt: now + (143 * 3600 + 57 * 60 + 55) * 1000 },
  );
  assert.deepEqual(antigravityLimit({ error: 'Your AI credits balance is too low to continue.' }, now), { label: 'AI credits', resetsAt: null });
  assert.deepEqual(antigravityLimit({ error: 'Weekly quota exhausted for your plan. Resets in 3d.' }, now), { label: 'Weekly limit', resetsAt: now + 3 * 86_400_000 });
  // Not a plan limit.
  assert.equal(antigravityLimit({ error: 'RESOURCE_EXHAUSTED (code 429)' }, now), null);
  assert.equal(antigravityLimit({ error: 'Rate limit exceeded. Try again later.' }, now), null);
  assert.equal(antigravityLimit({ error: 'Authentication required' }, now), null);
  // A turn with tool work, or a long one, that mentions the quota is not a stop.
  assert.equal(antigravityLimit({ text: 'Individual quota reached. Resets in 2h.', tools: 1 }, now), null);
  assert.equal(antigravityLimit({ text: `${'Here is how quotas work. '.repeat(20)}Individual quota reached.` }, now), null);
  // The agent's whole short answer, with no tools, is the limit.
  assert.deepEqual(
    antigravityLimit({ text: '⚠ Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 1h.' }, now),
    { label: 'Usage limit', resetsAt: now + 3_600_000 },
  );
}

// The config options: the model, the thinking level, and no mode.
const CONFIG: Json[] = [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'gemini-4-argon',
    options: [
      { value: 'gemini-4-argon', name: 'Gemini 4 Argon' },
      { value: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', description: 'Fast' },
    ],
  },
  // Antigravity's thinking level has no category.
  { id: 'thinking_level', name: 'Thinking', type: 'select', currentValue: 'high', options: ['low', 'medium', 'high', 'xhigh', 'max'].map((v) => ({ value: v, name: v })) },
];
{
  assert.deepEqual(selectOption(CONFIG, 'model'), {
    id: 'model',
    values: [
      { value: 'gemini-4-argon', name: 'Gemini 4 Argon', description: undefined },
      { value: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', description: 'Fast' },
    ],
    current: 'gemini-4-argon',
  });
  const grouped = [{ id: 'model', category: 'model', currentValue: 'a', options: [{ group: 'g', name: 'G', options: [{ value: 'a', name: 'A' }] }] }];
  assert.deepEqual(selectOption(grouped, 'model'), { id: 'model', values: [{ value: 'a', name: 'A', description: undefined }], current: 'a' });
  assert.equal(selectOption(CONFIG, 'mode'), null);
  assert.deepEqual(thoughtOption(CONFIG), { id: 'thinking_level', options: ['low', 'medium', 'high', 'xhigh', 'max'], current: 'high' });
}

/** A fake Antigravity-like agent: each prompt is answered by `script(n)`, as in acp-limit-test. Every request is kept in `calls`. */
type Step = { text?: string; tool?: boolean; error?: { code: number; message: string; data?: unknown }; stopReason?: string };
function fakeRunner(script: (n: number) => Step) {
  const runner: any = new EventEmitter();
  runner.meta = { runId: 'run1' };
  runner.stop = () => {};
  const calls: { method: string; params: Json }[] = [];
  runner.calls = calls;
  let options: Json[] = structuredClone(CONFIG);
  let n = 0;
  const send = (m: Json) => setImmediate(() => runner.emit('line', JSON.stringify({ jsonrpc: '2.0', ...m }), false));
  const update = (u: Json) => send({ method: 'session/update', params: { sessionId: 's1', update: u } });
  runner.writeLine = (m: Json) => {
    if (m.method) calls.push({ method: m.method, params: m.params });
    if (m.id == null) return;
    switch (m.method) {
      case 'initialize':
        return send({ id: m.id, result: { protocolVersion: 1, agentCapabilities: {} } });
      case 'session/new':
        return send({ id: m.id, result: { sessionId: 's1', configOptions: structuredClone(options), _meta: { antigravity: { tier: 'g1-pro-tier' } } } });
      case 'session/set_config_option': {
        options = options.map((c) => (c.id === m.params.configId ? { ...c, currentValue: m.params.value } : c));
        return send({ id: m.id, result: { configOptions: structuredClone(options) } });
      }
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-acp-antigravity-'));
const agyDef: AcpAgentDef = { id: 'antigravity', name: 'Antigravity CLI', command: 'agy', args: ['acp'] };
const geminiDef: AcpAgentDef = { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: [] };

// The events of one turn, in order, and the agent's own record of its requests.
async function turn(id: string, step: Step, def = agyDef) {
  const runner = fakeRunner(() => step);
  const live = new AcpLive(runner, { cwd: dir, id, def, transcript: path.join(dir, `${id}.jsonl`) });
  await live.boot(false);
  const events: string[] = [];
  live.on('limithit', (hit: unknown) => events.push('limithit'));
  live.on('signedout', () => events.push('signedout'));
  live.on('result', () => events.push('result'));
  await live.sendMessage('go', []);
  for (let i = 0; i < 100 && !events.includes('result'); i++) await new Promise((r) => setTimeout(r, 10));
  return { live, events, calls: runner.calls as { method: string; params: Json }[] };
}

// The session: its tier, its model and effort, and the config options it sets them through.
{
  const runnerRef = fakeRunner(() => ({ text: 'ok' }));
  const live = new AcpLive(runnerRef, { cwd: dir, id: 'agy', def: agyDef, transcript: path.join(dir, 'agy.jsonl') });
  const tiers: string[] = [];
  live.on('tier', (t: string) => tiers.push(t));
  await live.boot(false);
  assert.deepEqual(tiers, ['g1-pro-tier']);
  assert.deepEqual(
    live.models.map((m) => m.value),
    ['gemini-4-argon', 'gemini-3.8-flash'],
  );
  const levels = ['low', 'medium', 'high', 'xhigh', 'max'];
  for (const m of live.models) assert.deepEqual(m.efforts, levels);
  assert.equal(live.models[0].isDefault, true);
  assert.equal(live.state.model, 'gemini-4-argon');
  assert.equal(live.state.effort, 'high');

  const runner = runnerRef;
  await live.configure({ model: 'gemini-3.8-flash' });
  assert.equal(live.state.model, 'gemini-3.8-flash');
  await live.configure({ effort: 'max' });
  assert.equal(live.state.effort, 'max');
  const sets = runner.calls.filter((c: Json) => c.method === 'session/set_config_option');
  assert.deepEqual(sets.map((c: Json) => c.params), [
    { sessionId: 's1', configId: 'model', value: 'gemini-3.8-flash' },
    { sessionId: 's1', configId: 'thinking_level', value: 'max' },
  ]);
  assert.equal(runner.calls.some((c: Json) => c.method === 'session/set_model'), false);
  live.stop();
}

// A turn the plan's quota stops: 'limithit' is said before its result, with when the limit lifts.
{
  const hits: any[] = [];
  const live = new AcpLive(
    fakeRunner(() => ({
      error: { code: -32603, message: 'RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 2h.' },
    })),
    { cwd: dir, id: 'q', def: agyDef, transcript: path.join(dir, 'q.jsonl') },
  );
  await live.boot(false);
  const order: string[] = [];
  live.on('limithit', (hit: any) => {
    hits.push(hit);
    order.push('limithit');
  });
  const done = new Promise<void>((r) =>
    live.once('result', () => {
      order.push('result');
      r();
    }),
  );
  const before = Date.now();
  await live.sendMessage('go', []);
  await done;
  assert.deepEqual(order, ['limithit', 'result']);
  assert.equal(live.limitStopped, true);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].label, 'Usage limit');
  const want = before + 2 * 3600_000;
  assert.ok(typeof hits[0].resetsAt === 'number' && Math.abs(hits[0].resetsAt - want) < 60_000, `resetsAt ${hits[0].resetsAt}, want about ${want}`);
  live.stop();
}

// A sign-in that ended mid-session: the account shows signed out, and no limit.
{
  const { live, events } = await turn('s', { error: { code: -32603, message: 'Authentication expired. Please log back in.' } });
  assert.deepEqual(events, ['signedout', 'result']);
  assert.equal(live.signedOut, true);
  live.stop();
}

// The same quota error from another agent is no limit of its plan.
{
  const { live, events } = await turn(
    'g',
    { error: { code: -32603, message: 'RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 2h.' } },
    geminiDef,
  );
  assert.deepEqual(events, ['result']);
  assert.equal(live.limitStopped, false);
  live.stop();
}

// A note of the app's own is a line of the transcript.
{
  const live = new AcpLive(fakeRunner(() => ({ text: 'ok' })), { cwd: dir, id: 'n', def: agyDef, transcript: path.join(dir, 'n.jsonl') });
  await live.boot(false);
  live.note('hello');
  const lines = fs.readFileSync(path.join(dir, 'n.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(lines.some((e) => e.t === 'note' && e.text === 'hello'), 'a note line for hello');
  live.stop();
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('acp antigravity: ok');
