// Script test for how Custom's agent process asks the app for a model of your plan (planClient in plan-client.ts) while the
// app restarts: a step whose connection broke, or that finds the app not answering, is asked again when the app is back;
// after text was shown it is not (the step is cut instead); an answer from the app that is no sign of a restart ends it at
// once; and the wait for the app has an end. A local server plays the app's /agent/run/<token>/model. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agent/plan-client-test.ts && DATA_DIR=/tmp/hydor-test-plan-client node dist/dev/plan-client-test.js
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AgentModel } from '../../shared/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const model: AgentModel = { id: 'claude/sonnet', label: 'Claude Sonnet 5.5', provider: 'claude', baseUrl: '', model: 'sonnet', tools: 'text' };
const reply = { text: 'done', reasoning: '', calls: [], finish: 'stop' };
const line = (o: object) => `${JSON.stringify(o)}\n`;

type Answer = (req: http.IncomingMessage, res: http.ServerResponse) => void;
/** What the app does with the next request. */
const good: Answer = (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/x-ndjson' });
  res.write(line({ t: 'text', v: 'Working' }));
  res.end(line({ t: 'reply', reply }));
};
const drop: Answer = (req) => req.socket.destroy();
const missing: Answer = (_req, res) => res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'x' }));
const textThenDrop: Answer = (req, res) => {
  res.writeHead(200, { 'content-type': 'application/x-ndjson' });
  res.write(line({ t: 'text', v: 'Partial' }));
  setTimeout(() => req.socket.destroy(), 100);
};

/** The requests the app got, and what it does with each (the last answer repeats; `good` when none are left). */
const asked: { url?: string; body: any }[] = [];
let script: Answer[] = [];
const app = () =>
  http.createServer((req, res) => {
    let b = '';
    req.on('data', (x) => (b += x));
    req.on('end', () => {
      asked.push({ url: req.url, body: JSON.parse(b || '{}') });
      (script.length > 1 ? script.shift()! : (script[0] ?? good))(req, res);
    });
  });
let server = app();
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as { port: number }).port;
const runtime = `http://127.0.0.1:${port}/agent/run/tok`;
const stop = () =>
  new Promise<void>((r) => {
    server.close(() => r());
    server.closeAllConnections();
  });
const start = () =>
  new Promise<void>((r) => {
    server = app();
    server.listen(port, '127.0.0.1', () => r());
  });

/** Case 6 runs here, in a program of its own, since the wait for the app is read from the environment once, at load. */
if (process.env.PLAN_CLIENT_TEST_DOWN) {
  await stop();
  const { planClient } = await import('./plan-client.ts');
  const t = Date.now();
  const outcome = await planClient(runtime)(model, { messages: [{ role: 'user', content: 'hi' }], signal: new AbortController().signal, onText: () => {}, onReasoning: () => {} }).then(
    () => 'answered',
    (e: Error) => e.message,
  );
  console.log(JSON.stringify({ outcome, ms: Date.now() - t }));
  process.exit(0);
}

const { planClient } = await import('./plan-client.ts');
const { StreamCut } = await import('./llm.ts');

const ask = () => {
  const shown = { text: '', reasoning: '' };
  const ctl = new AbortController();
  const p = planClient(runtime)(model, { messages: [{ role: 'user', content: 'hi' }], signal: ctl.signal, onText: (t) => (shown.text += t), onReasoning: (t) => (shown.reasoning += t) });
  return { p, shown, ctl };
};

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const before = () => ((asked.length = 0), (script = []));

test('a connection that breaks before anything came is asked again, and the reply comes', async () => {
  before();
  script = [drop, good];
  const { p, shown } = ask();
  assert.deepEqual(await p, reply);
  assert.equal(asked.length, 2);
  assert.equal(asked[0].url, '/agent/run/tok/model');
  assert.equal(asked[1].body.id, 'claude/sonnet');
  assert.deepEqual(asked[1].body.messages, [{ role: 'user', content: 'hi' }], 'the step is asked again as it was');
  assert.equal(shown.text, 'Working');
});

test('an app that is down and comes back a moment later gets the step then', async () => {
  before();
  await stop();
  const t = Date.now();
  setTimeout(() => void start(), 1500);
  const { p } = ask();
  assert.deepEqual(await p, reply);
  assert.ok(Date.now() - t >= 1400, 'it waited for the app');
  assert.ok(Date.now() - t < 8000);
  assert.equal(asked.length, 1, 'the one request the restarted app got');
});

test('a connection that breaks after text was shown is a cut stream, not asked again', async () => {
  before();
  script = [textThenDrop, good];
  const { p, shown } = ask();
  await assert.rejects(p, (e) => e instanceof StreamCut);
  assert.equal(shown.text, 'Partial');
  assert.equal(asked.length, 1);
});

test('a 404 with no broken connection before it ends the step at once, with the app’s own words', async () => {
  before();
  script = [missing, good];
  const t = Date.now();
  const { p } = ask();
  await assert.rejects(p, (e: Error) => e instanceof Error && !(e instanceof StreamCut) && e.message === 'x');
  assert.equal(asked.length, 1);
  assert.ok(Date.now() - t < 400, 'no waiting');
});

test('a 404 right after a broken connection is the app still starting: the step is asked again', async () => {
  before();
  script = [drop, missing, good];
  const { p } = ask();
  assert.deepEqual(await p, reply);
  assert.equal(asked.length, 3);
});

test('an error the app reports in its own reply is not taken for a restart', async () => {
  before();
  script = [
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.end(line({ t: 'error', message: 'No account has room' }));
    },
    good,
  ];
  const { p } = ask();
  await assert.rejects(p, /No account has room/);
  assert.equal(asked.length, 1);
});

test('an app that does not come back within HYDOR_APP_BACK_MS fails the step after that long', async () => {
  const run = await new Promise<{ outcome: string; ms: number }>((resolve, reject) => {
    const child = spawn(process.execPath, [process.argv[1]], { env: { ...process.env, PLAN_CLIENT_TEST_DOWN: '1', HYDOR_APP_BACK_MS: '1500' }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.on('close', () => {
      try {
        resolve(JSON.parse(out.trim().split('\n').pop()!));
      } catch {
        reject(new Error(`The child said: ${out}`));
      }
    });
  });
  assert.notEqual(run.outcome, 'answered');
  assert.match(run.outcome, /fetch failed|ECONNREFUSED|terminated/);
  assert.ok(run.ms >= 1000, `it tried for a while first (${run.ms} ms)`);
  assert.ok(run.ms < 4500, `and gave up soon after the wait ended (${run.ms} ms)`);
});

test('a step that is aborted while the app is down ends at once', async () => {
  before();
  await stop();
  const { p, ctl } = ask();
  setTimeout(() => ctl.abort(), 200);
  const t = Date.now();
  await assert.rejects(p);
  assert.ok(Date.now() - t < 1500);
  await start();
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
await stop();
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
