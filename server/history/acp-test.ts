// Script tests for how an ACP agent's updates read back as a timeline (server/history/acp.ts), for what Hermes Agent and Pi
// (through pi-acp) send: a terminal the agent runs itself reports its output in the update's _meta, and Hermes puts blank lines
// before what it says after a tool call. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/history/acp-test.ts && node dist/dev/acp-test.js
import assert from 'node:assert/strict';
import { AcpParser } from './acp.ts';

const p = new AcpParser({ retain: true, collectChunks: false });
const t0 = Date.parse('2026-11-10T10:00:00.000Z');
const update = (u: object, n: number) => ({ t: 'update', ts: t0 + n * 100, u });
for (const l of [
  { t: 'meta', ts: t0, agent: 'pi', name: 'Pi', cwd: '/tmp' },
  { t: 'prompt', ts: t0 + 100, id: 'p1', text: 'List it' },
  // Pi: a terminal the agent runs itself; the content names it, the output comes in _meta, in pieces and at the end.
  update({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'ls -la', kind: 'execute', status: 'pending', content: [{ type: 'terminal', terminalId: 'c1' }], _meta: { terminal_info: { terminal_id: 'c1' } } }, 2),
  update({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'in_progress', _meta: { terminal_output: { terminal_id: 'c1', data: 'one\n' } } }, 3),
  update({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed', _meta: { terminal_output: { terminal_id: 'c1', data: 'two\n' }, terminal_exit: { terminal_id: 'c1', exit_code: 0, signal: null } } }, 4),
  // Hermes: blank lines before the words after a tool call; a chunk of nothing but blank lines opens nothing.
  update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '\n\n' } }, 5),
  update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '\n\nDone' } }, 6),
  update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' and dusted.\n\nBye' } }, 7),
  { t: 'end', ts: t0 + 800, stopReason: 'end_turn' },
].map((x) => JSON.stringify(x)))
  p.feed(l);

const tool = p.items.find((i) => i.kind === 'tool') as any;
assert.equal(tool.tool.output, 'one\ntwo\n', 'the terminal’s output, not a note that there is a terminal');
assert.equal(tool.tool.status, 'ok');
const said = p.items.filter((i) => i.kind === 'assistant') as any[];
assert.equal(said.length, 1);
assert.equal(said[0].text, 'Done and dusted.\n\nBye', 'a message starts at its first word, and keeps its own blank lines');
console.log('acp history tests passed');
