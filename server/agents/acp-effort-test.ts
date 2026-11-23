// Script test for the effort of an ACP agent that takes one (Grok Build), against a fake agent behind a fake runner:
// the efforts it offers, the one set at start, a change from the session, and the agent's own update. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/acp-effort-test.ts && DATA_DIR=/tmp/hydor-test-acp-effort node dist/dev/acp-effort-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AcpAgentDef } from '../../shared/types.ts';
import { AcpLive } from './acp.ts';

type Json = Record<string, any>;

const eff = (ids: string[]) => ids.map((id) => ({ id, value: id, default: id === 'high' }));
const MODELS: Json[] = [
  { modelId: 'grok-4.6', name: 'Grok 4.6', _meta: { reasoningEfforts: eff(['xhigh', 'high', 'medium', 'low']), reasoningEffort: 'high' } },
  { modelId: 'grok-4.5', name: 'Grok 4.5', _meta: { reasoningEfforts: eff(['high', 'medium', 'low']), reasoningEffort: 'high' } },
];

/** An agent that answers like Grok Build: models with efforts, a thought-level option, set_config_option. */
function fakeRunner(opts: { thought: boolean; withDefault?: boolean }) {
  const runner: any = new EventEmitter();
  runner.meta = { runId: 'run1' };
  runner.stop = () => {};
  const calls: { method: string; params: Json }[] = [];
  let model = 'grok-4.6';
  let effort = 'high';
  const config = () => [
    { id: 'model', category: 'model', type: 'select', currentValue: model, options: MODELS.map((m) => ({ value: m.modelId, name: m.name })) },
    ...(opts.thought
      ? [
          {
            id: 'reasoning_effort',
            category: 'thought_level',
            type: 'select',
            currentValue: effort,
            options: [...(opts.withDefault ? ['default'] : []), ...(model === 'grok-4.6' ? ['xhigh', 'high', 'medium', 'low'] : ['high', 'medium', 'low'])].map((value) => ({ value })),
          },
        ]
      : []),
  ];
  const send = (m: Json) => setImmediate(() => runner.emit('line', JSON.stringify({ jsonrpc: '2.0', ...m }), false));
  runner.writeLine = (m: Json) => {
    if (m.id == null) return;
    calls.push({ method: m.method, params: m.params });
    const ok = (result: unknown) => send({ id: m.id, result });
    switch (m.method) {
      case 'initialize':
        return ok({ protocolVersion: 1, agentCapabilities: {} });
      case 'session/new':
        return ok({ sessionId: 's1', models: { currentModelId: model, availableModels: opts.thought ? MODELS : MODELS.map(({ modelId, name }) => ({ modelId, name })) }, configOptions: config() });
      case 'session/set_model':
        model = m.params.modelId;
        // The agent keeps an effort the new model takes, else its default, and says so.
        if (model === 'grok-4.5' && effort === 'xhigh') effort = 'high';
        ok({});
        return send({ method: 'session/update', params: { sessionId: 's1', update: { sessionUpdate: 'config_option_update', configOptions: config() } } });
      case 'session/set_config_option':
        if (m.params.configId !== 'reasoning_effort' || typeof m.params.value !== 'string') return send({ id: m.id, error: { code: -32602, message: 'bad option' } });
        if (
          !config()
            .find((c) => c.id === 'reasoning_effort')!
            .options.some((o: Json) => o.value === m.params.value)
        )
          return send({ id: m.id, error: { code: -32602, message: 'not a value of this option' } });
        effort = m.params.value;
        return ok({ configOptions: config() });
      default:
        return send({ id: m.id, error: { code: -32601, message: 'no' } });
    }
  };
  return { runner, calls };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-acp-effort-'));
const def: AcpAgentDef = { id: 'grok', name: 'Grok Build', command: 'grok', args: [] };
const open = async (o: { effort?: string; model?: string; thought?: boolean; withDefault?: boolean; id: string }) => {
  const f = fakeRunner({ thought: o.thought !== false, withDefault: o.withDefault });
  const live = new AcpLive(f.runner, { cwd: dir, id: o.id, def, transcript: path.join(dir, `${o.id}.jsonl`), effort: o.effort, model: o.model });
  await live.boot(false);
  return { live, ...f };
};
const sets = (calls: { method: string; params: Json }[]) => calls.filter((c) => c.method === 'session/set_config_option').map((c) => c.params);

// Offers: each model with its efforts, and the agent's own current effort.
{
  const { live, calls } = await open({ id: 'a' });
  assert.deepEqual(
    live.models.map((m) => [m.value, m.efforts]),
    [
      ['grok-4.6', ['xhigh', 'high', 'medium', 'low']],
      ['grok-4.5', ['high', 'medium', 'low']],
    ],
  );
  assert.equal(live.state.effort, 'high');
  assert.deepEqual(sets(calls), [], 'no effort asked: none set');
  // A change from the session.
  await live.configure({ effort: 'low' });
  assert.deepEqual(sets(calls), [{ sessionId: 's1', configId: 'reasoning_effort', value: 'low' }]);
  assert.equal(live.state.effort, 'low');
  // A value the agent refuses is a 400.
  await assert.rejects(live.configure({ effort: 'ultra' }), (e: any) => e.status === 400);
  assert.equal(live.state.effort, 'low', 'what was set stays');
  // Default (null) for an agent whose thought level has no "default": nothing is sent, its own effort stays.
  const asked = sets(calls).length;
  await live.configure({ effort: null });
  assert.equal(sets(calls).length, asked);
  assert.equal(live.state.effort, 'low');
}

// Default (null) for an agent whose thought level offers "default" (Custom): "default" is sent, back to the model's own.
{
  const { live, calls } = await open({ id: 'e', effort: 'high', withDefault: true });
  assert.deepEqual(sets(calls), [{ sessionId: 's1', configId: 'reasoning_effort', value: 'high' }]);
  await live.configure({ effort: null });
  assert.deepEqual(sets(calls).at(-1), { sessionId: 's1', configId: 'reasoning_effort', value: 'default' });
  assert.equal(live.state.effort, 'default');
}

// An effort asked at start is set once the model is.
{
  const { live, calls } = await open({ id: 'b', effort: 'xhigh', model: 'grok-4.6' });
  assert.deepEqual(calls.map((c) => c.method).slice(-2), ['session/set_model', 'session/set_config_option']);
  assert.deepEqual(sets(calls), [{ sessionId: 's1', configId: 'reasoning_effort', value: 'xhigh' }]);
  assert.equal(live.state.effort, 'xhigh');
  // A model switch the effort does not fit: the agent's own update decides what it comes to.
  await live.configure({ model: 'grok-4.5' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(live.state.model, 'grok-4.5');
  assert.equal(live.state.effort, 'high');
}

// An effort the model does not take is skipped at start.
{
  const { live, calls } = await open({ id: 'c', effort: 'xhigh', model: 'grok-4.5' });
  assert.deepEqual(sets(calls), []);
  assert.equal(live.state.effort, 'high');
}

// An agent with no thought-level option (Custom, Gemini CLI): nothing is set and nothing is offered.
{
  const { live, calls } = await open({ id: 'd', effort: 'high', thought: false });
  assert.deepEqual(sets(calls), []);
  assert.equal(live.state.effort, undefined);
  assert.deepEqual(
    live.models.map((m) => m.efforts),
    [[], []],
  );
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('acp effort: ok');
