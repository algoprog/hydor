// The reasoning effort in the real Custom agent over ACP: each model's own levels are offered and accepted, and the one
// set goes with the request to a local mock model (an endpoint's as reasoning_effort, OpenRouter's as reasoning.effort,
// a plan's model's to the app, which asks its program).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agent/effort-test.ts && DATA_DIR=/tmp/hydor-test-effort node dist/dev/effort-test.js
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-effort-'));
const output = path.join(root, 'build');
fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const built = spawnSync(process.execPath, ['scripts/build-server.mjs', 'server/agent/main.ts'], { cwd: process.cwd(), env: { ...process.env, OUTDIR: output }, encoding: 'utf8', timeout: 120_000 });
if (built.status !== 0) throw new Error(`Agent build failed: ${(built.stderr || built.error?.message || '').slice(-2000)}`);
const state = path.join(root, 'state');
fs.mkdirSync(state);

/** What the mock model was last asked. */
let asked: any;
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.url === '/model') {
    // The app, asked for a model of your plan.
    asked = JSON.parse(body);
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.end(JSON.stringify({ t: 'reply', reply: { text: 'Done.', reasoning: '', calls: [], finish: 'stop' } }) + '\n');
  } else if (req.url === '/chat/completions') {
    asked = JSON.parse(body);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url?.startsWith('/context') ? { parts: [], guides: [] } : req.url === '/custom' ? { sandbox: 'off', confidential: false } : []));
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const model = (id: string, o: object) => ({ id, label: id, model: id, provider: 'endpoint', baseUrl: base, local: true, tools: 'native', contextLength: 100_000, ...o });
const models = path.join(root, 'models.json');
fs.writeFileSync(
  models,
  JSON.stringify({
    models: [
      model('usual', { reasoning: true }),
      model('levels', { reasoning: true, efforts: ['low', 'high', 'xhigh'] }),
      model('router', { provider: 'openrouter', reasoning: true, efforts: ['none', 'low', 'medium', 'high', 'max'] }),
      model('plain', {}),
      model('claude/sonnet', { provider: 'claude', baseUrl: '', local: false, tools: 'text', reasoning: true, efforts: ['low', 'medium', 'high', 'xhigh'] }),
    ],
  }),
);

const replies = new Map<number, (value: any) => void>();
let errors = '';
let counter = 0;
const child = spawn(process.execPath, [path.join(output, 'main.js')], { cwd: process.cwd(), env: { ...process.env, HYDOR_MODELS: models, HYDOR_STATE: state, HYDOR_RUNTIME: base, HYDOR_CONFIDENTIAL: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', (chunk) => (errors += String(chunk)));
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  try {
    const message = JSON.parse(line);
    if (typeof message.id === 'number' && !message.method) replies.get(message.id)?.(message);
  } catch {
    /* Other output. */
  }
});
const request = (method: string, params: object) =>
  new Promise<any>((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => reject(new Error(`Timed out in ${method}: ${errors.slice(-1000)}`)), 25_000);
    replies.set(id, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

try {
  const opened = (await request('session/new', { cwd: root, mcpServers: [] })).result;
  assert.ok(opened?.sessionId, errors);
  const sessionId = opened.sessionId;
  const values = (r: any) => r.configOptions[0].options.map((o: any) => o.value);
  // Each model says its own levels; a model that takes none is given the usual three, which it ignores.
  assert.deepEqual(
    opened.models.availableModels.map((m: any) => [m.modelId, m._meta.reasoningEfforts.map((e: any) => e.value)]),
    [
      ['usual', ['low', 'medium', 'high']],
      ['levels', ['low', 'high', 'xhigh']],
      ['router', ['none', 'low', 'medium', 'high', 'max']],
      ['plain', ['low', 'medium', 'high']],
      ['claude/sonnet', ['low', 'medium', 'high', 'xhigh']],
    ],
  );
  assert.deepEqual(values(opened), ['default', 'low', 'medium', 'high']);
  const use = async (id: string) => assert.ok(!(await request('session/set_model', { sessionId, modelId: id })).error);
  const set = (value: string) => request('session/set_config_option', { sessionId, configId: 'reasoning_effort', value });
  const send = async () => {
    asked = undefined;
    const r = await request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Hello' }] });
    assert.ok(!r.error && asked, JSON.stringify(r.error) + errors);
    return asked;
  };

  // Without a list: low, medium and high, as before.
  assert.ok((await set('xhigh')).error, 'xhigh is not one of its levels');
  assert.ok(!(await set('medium')).error);
  assert.equal((await send()).reasoning_effort, 'medium');

  await use('levels');
  assert.ok((await set('medium')).error, 'medium is not one of its levels');
  const x = await set('xhigh');
  assert.ok(!x.error, JSON.stringify(x.error));
  assert.deepEqual(values(x.result), ['default', 'low', 'high', 'xhigh']);
  assert.equal(x.result.configOptions[0].currentValue, 'xhigh');
  assert.equal((await send()).reasoning_effort, 'xhigh');
  await set('default');
  assert.equal('reasoning_effort' in (await send()), false);

  await use('router');
  assert.deepEqual((await send()).reasoning, { effort: 'medium' }, 'nothing picked');
  assert.ok(!(await set('max')).error);
  assert.deepEqual((await send()).reasoning, { effort: 'max' });
  // Kept from the model before, which this one does not offer: its default.
  await use('levels');
  assert.equal('reasoning_effort' in (await send()), false);

  await use('claude/sonnet');
  assert.ok((await set('max')).error, 'max is not one of its efforts');
  assert.ok(!(await set('xhigh')).error);
  const plan = await send();
  assert.deepEqual([plan.id, plan.effort], ['claude/sonnet', 'xhigh']);
  await set('default');
  assert.equal('effort' in (await send()), false);
  console.log('custom effort: ok');
} finally {
  child.kill();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
}
process.exit(0);
