// Script tests for what a Claude session shows of a call while the model is still writing it (ClaudeLive's live items):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/stream-test.ts && node dist/dev/stream-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ToolItem } from '../../shared/types.ts';
import { ClaudeLive } from './claude.ts';

const make = () => {
  const runner = new EventEmitter() as any;
  runner.writeLine = () => {};
  const a = new ClaudeLive(runner, { sessionId: 's' } as any);
  const line = (m: object) => runner.emit('line', JSON.stringify(m), false);
  const event = (event: object) => line({ type: 'stream_event', event });
  const start = (name: string) => event({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name } });
  const piece = (partial_json: string) => event({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json } });
  const stop = () => event({ type: 'content_block_stop', index: 0 });
  const tool = () => a.overlay().items.find((i): i is ToolItem => i.kind === 'tool' && i.id === 'toolu_1')!;
  return { start, piece, stop, tool };
};

const tests: [string, () => void][] = [
  [
    'a page saved again: its id is on the call as soon as it is written, before the rest of the input',
    () => {
      const t = make();
      t.start('mcp__hydor__save_latex');
      t.piece('{"id":"01ab');
      assert.equal((t.tool().tool.input as { id?: string } | undefined)?.id, undefined, 'not before the whole id is there');
      t.piece('cdef23","title":"Report","source":"\\\\documentclass{article}');
      assert.equal(t.tool().tool.status, 'pending');
      assert.deepEqual(t.tool().tool.input, { id: '01abcdef23' });
      t.piece(' \\\\begin{document} x \\\\end{document}"}');
      t.stop();
      assert.equal((t.tool().tool.input as { id?: string; title?: string }).title, 'Report', 'the whole input once the call is written');
      assert.equal((t.tool().tool.input as { id?: string }).id, '01abcdef23');
    },
  ],
  [
    'only the call’s own id: not one of a block inside it, nor one in its text',
    () => {
      const t = make();
      t.start('mcp__hydor__save_doc');
      t.piece('{"title":"Letter","blocks":[{"id":"ffffffffff","text":"\\"id\\":\\"eeeeeeeeee\\""}],');
      assert.equal((t.tool().tool.input as { id?: string } | undefined)?.id, undefined);
      t.piece('"id":"0123456789"}');
      assert.deepEqual(t.tool().tool.input, { id: '0123456789' });
    },
  ],
  [
    'a session started before the rename to Hydor: its saves, named naget-agent, too',
    () => {
      const t = make();
      t.start('mcp__naget-agent__save_page');
      t.piece('{"id":"0123456789","html":"<p>');
      assert.deepEqual(t.tool().tool.input, { id: '0123456789' });
    },
  ],
  [
    'other calls are left as they were until written whole',
    () => {
      const t = make();
      t.start('mcp__hydor__show_html');
      t.piece('{"id":"0123456789","html":"<p>');
      assert.equal((t.tool().tool.input as { id?: string } | undefined)?.id, undefined);
    },
  ],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
