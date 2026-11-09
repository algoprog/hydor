// Script tests for the time a session worked (SessionStats.workMs): each finished turn adds its length, from its
// message to the agent's last step, in Claude Code's, Codex's and the ACP agents' transcripts alike; a turn still
// running adds nothing until it ends. The session's working line shows it beside the turn under way.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/history/worked-test.ts && node dist/dev/worked-test.js
import assert from 'node:assert/strict';
import { AcpParser } from './acp.ts';
import { ClaudeParser } from './claude.ts';
import { CodexParser } from './codex.ts';

const opts = { retain: false, collectChunks: false };
const at = (s: string) => `2026-11-05T10:${s}.000Z`;
const lines = (xs: object[]) => xs.map((x) => JSON.stringify(x));

// ---- Claude Code: a turn ends at the next message (or when the file stops growing) -------------------------------
{
  const p = new ClaudeParser(opts);
  const assistant = (uuid: string, ts: string) => ({ type: 'assistant', uuid, timestamp: at(ts), message: { id: `m_${uuid}`, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5, output_tokens: 3 } } });
  for (const l of lines([
    { type: 'user', uuid: 'u1', timestamp: at('00:00'), message: { role: 'user', content: 'First' } },
    assistant('a1', '00:20'),
    assistant('a2', '01:30'),
  ]))
    p.feed(l);
  assert.equal(p.stats.workMs ?? 0, 0, 'a turn still under way adds nothing yet');
  for (const l of lines([{ type: 'user', uuid: 'u2', timestamp: at('05:00'), message: { role: 'user', content: 'Second' } }, assistant('a3', '05:45')])) p.feed(l);
  assert.equal(p.stats.workMs, 90_000, 'the first turn: from its message to its last step, 1m 30s (the idle time after it does not count)');
  p.finish();
  assert.equal(p.stats.workMs, 90_000 + 45_000, 'the second turn ends with the file');
  assert.equal(p.stats.turns, 2);
}

// ---- Claude Code: a turn's own numbers for its breakdown: cache writes, the model's time, its first reply -------------
{
  const p = new ClaudeParser({ ...opts, retain: true });
  const asst = (uuid: string, ts: string, usage: object, content: object[] = [{ type: 'text', text: 'ok' }]) => ({ type: 'assistant', uuid, timestamp: at(ts), message: { id: `m_${uuid}`, role: 'assistant', model: 'claude-opus-5-5', content, usage } });
  for (const l of lines([
    { type: 'user', uuid: 'u1', timestamp: at('00:00'), message: { role: 'user', content: 'Go' } },
    asst('a1', '00:04', { input_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000, output_tokens: 50 }, [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }]),
    { type: 'user', uuid: 'u2', timestamp: at('00:34'), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }] } },
    asst('a2', '00:40', { input_tokens: 20, cache_read_input_tokens: 6000, output_tokens: 30 }),
  ]))
    p.feed(l);
  p.finish();
  const t = p.items.find((i) => i.kind === 'turn') as Extract<(typeof p.items)[number], { kind: 'turn' }>;
  assert.deepEqual(t.tokens, { input: 1030, output: 80, cacheRead: 11000, cacheWrite: 1000 }, 'cache writes among the input, apart');
  assert.equal(t.firstMs, 4000, 'its first step 4 s after the prompt');
  assert.equal(t.modelMs, 10_000, 'the model: 4 s to its first step, 6 s from the step’s result to its reply (the 30 s command is not the model’s)');
  assert.equal(t.durationMs, 40_000);
}

// ---- Codex: task_started and task_complete, with the turn's own duration when it gives one --------------------------
{
  const p = new CodexParser(opts);
  const ev = (ts: string, payload: object) => ({ timestamp: at(ts), type: 'event_msg', payload });
  for (const l of lines([
    ev('00:00', { type: 'task_started', turn_id: 't1' }),
    ev('00:40', { type: 'task_complete', turn_id: 't1', duration_ms: 40_000 }),
    ev('10:00', { type: 'task_started', turn_id: 't2' }),
    ev('10:25', { type: 'task_complete', turn_id: 't2' }),
    ev('20:00', { type: 'task_started', turn_id: 't3' }),
  ]))
    p.feed(l);
  assert.equal(p.stats.workMs, 40_000 + 25_000, 'two finished turns (one by its duration, one by its times); the third still runs');
}

// ---- ACP agents (Custom, Gemini CLI…): a prompt, then the end --------------------------------------------------------
{
  const p = new AcpParser(opts);
  const t0 = Date.parse(at('00:00'));
  for (const l of lines([
    { t: 'meta', ts: t0, agent: 'console', name: 'Custom', cwd: '/tmp' },
    { t: 'prompt', ts: t0 + 1000, id: 'p1', text: 'Hello' },
    { t: 'end', ts: t0 + 61_000, stopReason: 'end_turn' },
    { t: 'prompt', ts: t0 + 600_000, id: 'p2', text: 'Again' },
    { t: 'end', ts: t0 + 602_500, stopReason: 'cancelled' },
  ]))
    p.feed(l);
  assert.equal(p.stats.workMs, 60_000 + 2_500, 'each turn from its prompt to its end, a stopped one too');
}

console.log('worked-test: ok');
