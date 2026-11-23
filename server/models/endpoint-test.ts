// Script tests for what an endpoint's models can do (server/models/endpoint.ts, manager.ts): vision and reasoning read from
// /models entries of each style (OpenRouter's, a modality list, Mistral's capabilities, flags) and from LiteLLM's
// /model/info when /models says nothing; the person's setting over what the endpoint says, kept when the endpoint is saved
// again; /model/info not asked again after an error; the reasoning effort sent as reasoning_effort; and images sent as
// images to a model that sees them. Small servers here answer for the endpoints. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/models/endpoint-test.ts
//   DATA_DIR=/tmp/hydor-i23-t1 CUDA_VISIBLE_DEVICES= node dist/dev/endpoint-test.js
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AgentModel } from '../../shared/types.ts';
import { familyOf, requestOptions } from '../agent/families.ts';
import { wire } from '../agent/wire.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const { said, litellmInfo, resolve, ENDPOINT_EFFORTS } = await import('./endpoint.ts');
const { ModelManager } = await import('./manager.ts');

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- /models entries -------------------------------------------------------------------------------

test('vision from each style of entry; an explicit no, or a list without image, is the endpoint saying no', () => {
  assert.equal(said({ id: 'a', architecture: { input_modalities: ['text', 'image'] } }).vision, true, 'OpenRouter');
  assert.equal(said({ id: 'a', architecture: { input_modalities: ['text'] } }).vision, false);
  assert.equal(said({ id: 'a', input_modalities: ['text', 'Image'] }).vision, true);
  assert.equal(said({ id: 'a', modalities: ['text', 'image'] }).vision, true, 'a list');
  assert.equal(said({ id: 'a', modalities: { input: ['text', 'image'], output: ['text'] } }).vision, true, 'input and output');
  assert.equal(said({ id: 'a', modalities: { input: ['text'] } }).vision, false);
  assert.equal(said({ id: 'a', capabilities: { vision: true } }).vision, true, 'Mistral');
  assert.equal(said({ id: 'a', capabilities: { vision: false } }).vision, false);
  assert.equal(said({ id: 'a', supports_vision: true }).vision, true);
  assert.equal(said({ id: 'a', supports_vision: false }).vision, false);
  assert.equal('vision' in said({ id: 'a', object: 'model' }), false, 'not said');
});

test('reasoning from each style of entry', () => {
  assert.equal(said({ id: 'a', supported_parameters: ['tools', 'reasoning'] }).reasoning, true);
  assert.equal(said({ id: 'a', supported_parameters: ['reasoning_effort'] }).reasoning, true);
  assert.equal(said({ id: 'a', supported_parameters: ['tools'] }).reasoning, false);
  assert.equal(said({ id: 'a', capabilities: { reasoning: true } }).reasoning, true);
  assert.equal(said({ id: 'a', capabilities: { reasoning: false } }).reasoning, false);
  assert.equal(said({ id: 'a', supports_reasoning: true }).reasoning, true);
  assert.equal(said({ id: 'a', supports_reasoning: false }).reasoning, false);
  assert.equal('reasoning' in said({ id: 'a' }), false, 'not said');
});

test('the setting wins over the endpoint, which wins over no', () => {
  assert.deepEqual(resolve(undefined, undefined), { vision: false, reasoning: false, endpoint: {}, set: {} });
  assert.equal(resolve(undefined, { vision: true }).vision, true);
  assert.equal(resolve({ vision: false }, { vision: true }).vision, false);
  assert.equal(resolve({ vision: true }, { vision: false }).vision, true);
  assert.equal(resolve({ vision: true }, undefined).vision, true);
  const r = resolve({ reasoning: true }, { vision: true, reasoning: false });
  assert.deepEqual([r.vision, r.reasoning, r.endpoint, r.set], [true, true, { vision: true, reasoning: false }, { reasoning: true }]);
});

test('LiteLLM: a name with several entries is true when every entry that states it says true; the smallest context', () => {
  const m = litellmInfo({
    data: [
      { model_name: 'gpt', model_info: { supports_vision: true, supports_reasoning: true, max_input_tokens: 128000 } },
      { model_name: 'gpt', model_info: { supports_vision: true, supports_reasoning: null, max_input_tokens: 64000 } },
      { model_name: 'mix', model_info: { supports_vision: true } },
      { model_name: 'mix', model_info: { supports_vision: false } },
      { model_name: 'bare', model_info: { supports_vision: null } },
      { model_name: 'none' },
    ],
  });
  assert.deepEqual(m.get('gpt'), { vision: true, reasoning: true, context: 64000 });
  assert.equal(m.get('mix')?.vision, false);
  assert.deepEqual(m.get('bare'), {});
  assert.deepEqual(m.get('none'), {});
  assert.equal(m.has('other'), false);
});

// ---- endpoints of each kind, and the manager -------------------------------------------------------------

type Handler = (url: string, auth: string | undefined) => { status?: number; body: unknown };
const serve = (handler: Handler) =>
  new Promise<{ url: string; hits: string[]; close: () => void }>((resolveServer) => {
    const hits: string[] = [];
    const srv = http.createServer((req, res) => {
      hits.push(req.url ?? '');
      const r = handler(req.url ?? '', req.headers.authorization);
      res.writeHead(r.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.body));
    });
    srv.listen(0, '127.0.0.1', () => resolveServer({ url: `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`, hits, close: () => srv.close() }));
  });

const gateway = await serve((url, auth) => {
  if (url === '/v1/models') return { body: { data: [{ id: 'vis' }, { id: 'think' }, { id: 'plain' }, { id: 'unknown' }] } };
  if (url === '/v1/model/info')
    return auth === 'Bearer sk-team'
      ? {
          body: {
            data: [
              { model_name: 'vis', model_info: { supports_vision: true, supports_reasoning: false, max_input_tokens: 200000 } },
              { model_name: 'think', model_info: { supports_vision: false, supports_reasoning: true } },
              { model_name: 'think', model_info: { supports_vision: false, supports_reasoning: true } },
              { model_name: 'plain', model_info: { supports_vision: false } },
            ],
          },
        }
      : { status: 401, body: { error: 'bad key' } };
  return { status: 404, body: {} };
});
const router = await serve((url) =>
  url === '/v1/models'
    ? {
        body: {
          data: [
            { id: 'a/seer', context_length: 100000, architecture: { input_modalities: ['text', 'image'] }, supported_parameters: ['tools', 'reasoning'] },
            { id: 'a/blind', architecture: { input_modalities: ['text'] }, supported_parameters: ['tools'] },
          ],
        },
      }
    : { status: 404, body: {} },
);
const plain = await serve((url) => (url === '/v1/models' ? { body: { data: [{ id: 'llama', max_model_len: 8192 }] } } : { status: 404, body: { error: 'no' } }));

const { loadConfig } = await import('./config.ts');
const mgr = new ModelManager(() => {});
const count = (s: { hits: string[] }, path: string) => s.hits.filter((h) => h === path).length;
const agent = (id: string) => mgr.agentModels().find((m) => m.id === id);
const endpoint = async (id: string, url: string, key?: string) => {
  await mgr.configure({ endpoint: { id, name: id, baseUrl: url, apiKey: key } });
};

test('an endpoint whose /models carries the fields (OpenRouter style) is not asked for /model/info', async () => {
  await endpoint('router', router.url);
  assert.equal(count(router, '/v1/model/info'), 0);
  const seer = agent('endpoint/router/a/seer')!;
  assert.deepEqual([seer.vision, seer.reasoning, seer.contextLength], [true, true, 100000]);
  const blind = agent('endpoint/router/a/blind')!;
  assert.deepEqual([blind.vision, blind.reasoning], [undefined, undefined], 'the endpoint says no');
  const st = (await mgr.state()).endpoints.find((e) => e.id === 'router')!;
  assert.deepEqual(st.modelCaps['a/blind'].endpoint, { vision: false, reasoning: false });
});

test('LiteLLM: /model/info with the same key answers for each model; its max_input_tokens is the context', async () => {
  await endpoint('gw', gateway.url, 'sk-team');
  assert.equal(count(gateway, '/v1/model/info'), 1);
  const vis = agent('endpoint/gw/vis')!;
  assert.deepEqual([vis.vision, vis.reasoning, vis.contextLength], [true, undefined, 200000]);
  const think = agent('endpoint/gw/think')!;
  assert.deepEqual([think.vision, think.reasoning], [undefined, true]);
  const unknown = agent('endpoint/gw/unknown')!;
  assert.deepEqual([unknown.vision, unknown.reasoning], [undefined, undefined], 'a name /model/info does not list');
  assert.equal((await mgr.state()).endpoints.find((e) => e.id === 'gw')!.modelCaps.unknown.endpoint.vision, undefined);
});

test('an endpoint that answers /model/info with an error is not asked again until its settings change', async () => {
  await endpoint('plain', plain.url);
  assert.equal(count(plain, '/v1/model/info'), 1);
  await mgr.refresh();
  await mgr.refresh();
  assert.equal(count(plain, '/v1/model/info'), 1, 'asked once');
  assert.equal(count(plain, '/v1/models'), 3, '/models asked each time');
  assert.equal(agent('endpoint/plain/llama')!.contextLength, 8192);
  assert.equal(agent('endpoint/plain/llama')!.vision, undefined);
  // The person saves the endpoint again: it is asked again.
  await endpoint('plain', plain.url);
  assert.equal(count(plain, '/v1/model/info'), 2);
  // Setting a model does not change the endpoint's own settings.
  await mgr.configure({ endpointModel: { endpoint: 'plain', model: 'llama', vision: true } });
  assert.equal(count(plain, '/v1/model/info'), 2);
});

test('the person’s setting wins; null is Automatic again; saving the endpoint again keeps the settings', async () => {
  await mgr.configure({ endpointModel: { endpoint: 'gw', model: 'vis', vision: false, reasoning: true } });
  let m = agent('endpoint/gw/vis')!;
  assert.deepEqual([m.vision, m.reasoning], [undefined, true], 'no beats the endpoint’s yes; yes beats its no');
  let caps = (await mgr.state()).endpoints.find((e) => e.id === 'gw')!.modelCaps.vis;
  assert.deepEqual([caps.vision, caps.reasoning, caps.endpoint, caps.set], [false, true, { vision: true, reasoning: false }, { vision: false, reasoning: true }]);
  // A model the endpoint does not say anything of, set to yes.
  await mgr.configure({ endpointModel: { endpoint: 'gw', model: 'unknown', vision: true } });
  assert.equal(agent('endpoint/gw/unknown')!.vision, true);
  // Saving the endpoint again (a new name, the key left out) keeps the key and the settings.
  await mgr.configure({ endpoint: { id: 'gw', name: 'Team gateway', baseUrl: gateway.url } });
  m = agent('endpoint/gw/vis')!;
  assert.deepEqual([m.vision, m.reasoning, agent('endpoint/gw/unknown')!.vision], [undefined, true, true]);
  assert.equal(loadConfig().endpoints.find((e) => e.id === 'gw')!.apiKey, 'sk-team');
  assert.deepEqual(loadConfig().endpoints.find((e) => e.id === 'gw')!.models, { vis: { vision: false, reasoning: true }, unknown: { vision: true } });
  // Automatic again.
  await mgr.configure({ endpointModel: { endpoint: 'gw', model: 'vis', vision: null, reasoning: null } });
  m = agent('endpoint/gw/vis')!;
  assert.deepEqual([m.vision, m.reasoning], [true, undefined]);
  assert.deepEqual(Object.keys(loadConfig().endpoints.find((e) => e.id === 'gw')!.models ?? {}), ['unknown']);
  await assert.rejects(mgr.configure({ endpointModel: { endpoint: 'nope', model: 'x', vision: true } }), /no such endpoint/);
});

test('the pickers offer effort levels for an endpoint model that reasons, and for no other', async () => {
  const opt = (id: string) => mgr.options().find((o) => o.value === id)!;
  assert.deepEqual(opt('endpoint/gw/think').efforts, ENDPOINT_EFFORTS);
  assert.deepEqual(opt('endpoint/router/a/seer').efforts, ENDPOINT_EFFORTS);
  assert.deepEqual(opt('endpoint/gw/vis').efforts, []);
  assert.deepEqual(opt('endpoint/plain/llama').efforts, []);
});

// ---- what Custom sends ---------------------------------------------------------------------------------

const model = (o: Partial<AgentModel> = {}): AgentModel => ({ id: 'endpoint/gw/m', label: 'm (gw)', provider: 'endpoint', baseUrl: 'http://x/v1', model: 'm', tools: 'native', ...o });

test('reasoning_effort goes to an endpoint model that reasons, when an effort is chosen', () => {
  const m = model({ reasoning: true });
  assert.equal(requestOptions(m, familyOf(m), 'high').reasoning_effort, 'high');
  assert.equal(requestOptions(m, familyOf(m), 'Low').reasoning_effort, 'low');
  assert.equal('reasoning_effort' in requestOptions(m, familyOf(m)), false, 'none chosen: the endpoint’s own default');
  assert.equal('reasoning_effort' in requestOptions(m, familyOf(m), 'default'), false);
  const plainModel = model();
  assert.equal('reasoning_effort' in requestOptions(plainModel, familyOf(plainModel), 'high'), false, 'a model that does not reason');
  const or = model({ provider: 'openrouter', reasoning: true });
  assert.deepEqual(requestOptions(or, familyOf(or), 'high').reasoning, { effort: 'medium' }, 'OpenRouter is as it was');
});

test('images go as image_url parts to a model that sees them, and as a line of text to one that does not', () => {
  const url = 'data:image/png;base64,AAAA';
  const messages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'look' }, { type: 'image_url' as const, image_url: { url } }] }];
  const sees = model({ vision: true });
  const out = wire('sys', messages, { m: sees, family: familyOf(sees), textMode: false, images: 4 });
  assert.deepEqual(out[1].content, [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url } }]);
  const blind = model();
  const text = wire('sys', messages, { m: blind, family: familyOf(blind), textMode: false, images: 4 });
  assert.match(JSON.stringify(text[1].content), /this model does not see images/);
  assert.doesNotMatch(JSON.stringify(text[1].content), /image_url/);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok  ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
gateway.close();
router.close();
plain.close();
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
