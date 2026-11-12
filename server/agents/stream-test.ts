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
  // The step's result, as Claude Code writes it, and the app's server noting a call began (the id is '' from an older Claude Code).
  const result = () => line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] } });
  const called = (id: string) => a.callStarted(id);
  const patch = () => a.overlay().patches['toolu_1'];
  a.queueAfterMs = 30;
  return { start, piece, stop, tool, result, called, patch, adapter: a };
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tests: [string, () => void | Promise<void>][] = [
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
  [
    'a step of the app’s own, asked for behind a step that runs alone: waiting its turn, then its clock counts from its real start',
    async () => {
      const t = make();
      t.called('toolu_0'); // an earlier call carried its id: this Claude Code says which step each call is
      t.start('mcp__hydor__read_page');
      t.stop();
      assert.equal(t.patch(), undefined, 'not at once: steps that start right away never flash it');
      await wait(80);
      assert.equal(t.patch()?.queued, true);
      const began = Date.now();
      t.called('toolu_1');
      assert.equal(t.patch()?.queued, undefined);
      assert.ok(t.patch()!.startedAt! >= began && t.patch()!.startedAt! <= Date.now());
      await wait(40);
      t.result();
      const d = t.patch()!.durationMs!;
      assert.ok(d >= 40 && d < 1000, `its real time, not the time since it was asked for: ${d}`);
      assert.equal(t.patch()!.queued, undefined);
      assert.equal(t.adapter['queueTimers'].size, 0);
      assert.equal(t.adapter['startedAt'].size, 0);
      assert.equal(t.adapter['askedAt'].size, 0);
    },
  ],
  [
    'a step that starts at once is never shown as waiting, nor given a start of its own',
    async () => {
      const t = make();
      t.called('toolu_0');
      t.start('mcp__hydor__web_search');
      t.stop();
      t.called('toolu_1');
      await wait(80);
      assert.equal(t.patch(), undefined);
      t.result();
      assert.equal(t.patch(), undefined);
    },
  ],
  [
    'a step whose result comes before the delay is never marked, and its timer is gone',
    async () => {
      const t = make();
      t.called('toolu_0');
      t.start('mcp__hydor__read_page');
      t.stop();
      t.result();
      await wait(80);
      assert.equal(t.patch(), undefined);
      assert.equal(t.adapter['queueTimers'].size, 0);
    },
  ],
  [
    'a step started late, with no waiting shown first (its call came while the delay ran out): it still counts from its start',
    async () => {
      const t = make();
      t.start('mcp__hydor__read_page'); // the first call of this process: no id has been seen yet, so nothing could be marked
      t.stop();
      await wait(60);
      assert.equal(t.patch(), undefined, 'no call has shown ids yet: nothing is marked waiting');
      t.called('toolu_1');
      assert.ok(t.patch()?.startedAt, 'but it began late, and says when');
      assert.equal(t.patch()?.queued, undefined);
    },
  ],
  [
    'an older Claude Code, whose calls carry no step id: nothing is ever marked waiting, and a mark made before is taken off',
    async () => {
      const t = make();
      t.start('mcp__hydor__read_page');
      t.stop();
      await wait(80);
      assert.equal(t.patch(), undefined);
      t.called('');
      t.called('toolu_9'); // an id after one without changes nothing
      const u = make();
      u.called('toolu_0');
      u.start('mcp__hydor__read_page');
      u.stop();
      await wait(80);
      assert.equal(u.patch()?.queued, true);
      u.called('');
      assert.equal(u.patch(), undefined, 'no step stays stuck as waiting');
      u.start('mcp__hydor__read_page');
      u.stop();
      await wait(80);
      assert.equal(u.patch(), undefined, 'and none is marked afterwards');
    },
  ],
  [
    'only the app’s own tools wait: a command, an edit or another server’s tool is left alone',
    async () => {
      const t = make();
      t.called('toolu_0');
      t.start('Bash');
      t.stop();
      await wait(80);
      assert.equal(t.patch(), undefined);
    },
  ],
  [
    'when the process ends: nothing stays marked, and no timer is left running',
    async () => {
      const t = make();
      t.called('toolu_0');
      t.start('mcp__hydor__read_page');
      t.stop();
      await wait(80);
      assert.equal(t.patch()?.queued, true);
      (t.adapter.runner as any).emit('exit', { code: 0 });
      assert.equal(t.patch(), undefined);
      assert.equal(t.adapter['queueTimers'].size, 0);
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
