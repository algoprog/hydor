// Checks for `hydor apps` against a fake connection (test-kit.ts): list shows yours and the ready-made ones, show prints the
// form, run builds its answers from `field=value` words, --input and (on a terminal) questions, starts the run, waits and prints
// the answer with its cost (and says so when the keys are missing), runs and run-show list and show runs, remove asks first and
// uninstalls a ready-made one. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/apps-test.ts && DATA_DIR=/tmp/hydor-test-apps node dist/dev/apps-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ApiError } from '../client.ts';
import { fakeConn, run } from './test-kit.ts';
import { UsageError } from './kit.ts';
import { poll } from './apps.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';
poll.ms = 1;

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const trip = { id: 'app1', slug: 'trip-planner', name: 'Trip planner', description: 'Plans a trip', usage: { runs: 2, spent: 0.3 }, uses: 5, lastRunAt: Date.now() - 3600_000, needsKey: true };
const quiz = { id: 'app2', slug: 'quiz', name: 'Quiz', usage: { runs: 0, spent: 0 } };
const tpl = { id: 'deep-research', name: 'Deep research report', description: 'A sourced report', installed: true };
const gone = { id: 'weather', name: 'Weather outlook', installed: false };
const run1 = {
  id: 'run1abcdef',
  app: 'app1',
  appName: 'Trip planner',
  source: 'web',
  status: 'done',
  inputs: { city: 'Lisbon', days: '5' },
  createdAt: Date.now() - 60_000,
  costUsd: 0.1234,
  key: 'claude:abc',
};
const form = [
  { id: 'city', label: 'Destination', type: 'text', required: true, help: 'Where to' },
  { id: 'days', label: 'Days', type: 'number' },
  { id: 'style', label: 'Style', type: 'choice', options: ['Relaxed', 'Packed'] },
  { id: 'kids', label: 'With kids', type: 'yesno' },
  { id: 'notes', label: 'Notes file', type: 'file' },
];
const answer = [
  { id: 'plan', label: 'The plan', type: 'markdown' },
  { id: 'cost', label: 'Budget', type: 'number' },
  { id: 'stops', label: 'Stops', type: 'list' },
  {
    id: 'days',
    label: 'By day',
    type: 'table',
    columns: [
      { id: 'day', label: 'Day', type: 'number' },
      { id: 'what', label: 'What', type: 'text' },
    ],
  },
];
const done = { ...run1, result: { plan: '# Lisbon\n\nEat **well**.', cost: 800, stops: ['Belém', 'Alfama'], days: [{ day: 1, what: 'Tram 28' }] }, startedAt: 1000, endedAt: 31_000, model: 'opus' };
const routes: Record<string, any> = {
  'GET /api/apps': { apps: [trip, quiz], templates: [tpl, gone], recent: [run1] },
  'GET /api/apps/app1': { app: { ...trip, fields: form, answer, agent: 'claude' }, secrets: [{ name: 'MAPS_KEY', have: false }], usage: { runs: 2, spent: 0.3 } },
  'GET /api/apps/app2': { app: { ...quiz, fields: [], agent: 'claude' }, secrets: [] },
  'GET /api/apps/tpl%3Adeep-research': { template: { name: 'Deep research report', fields: [{ id: 'q', label: 'Question', type: 'long', required: true }], answer: [] }, installed: true, secrets: [] },
  'GET /api/apps/tpl%3Aweather': { template: { name: 'Weather outlook', fields: [] }, installed: false, secrets: [] },
  'GET /api/apps/runs/run1abcdef': { run: done, progress: { steps: [] }, recipe: { answer } },
};

test('list shows your apps and the ready-made ones, --json what the API returned', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['apps']);
  assert.match(t.out, /Trip planner\s+trip-planner\s+5 runs/);
  assert.match(t.out, /Quiz\s+quiz/);
  assert.match(t.out, /Deep research report\s+tpl:deep-research\s+ready-made/);
  assert.match(t.out, /Weather outlook\s+tpl:weather\s+ready-made, not installed/);
  assert.match(t.out, /needs a key/);
  assert.deepEqual((await run(conn, ['apps', 'list', '--json'])).json, [routes['GET /api/apps']]);
  assert.match((await run(fakeConn({ 'GET /api/apps': { apps: [], templates: [] } }).conn, ['apps'])).out, /No apps yet: hydor app new/);
});

test('show prints the form and the answer, and how to run it', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['apps', 'show', 'trip']);
  assert.match(t.out, /Trip planner/);
  assert.match(t.out, /Address\s+trip-planner/);
  assert.match(t.out, /Keys\s+MAPS_KEY missing/);
  assert.match(t.out, /city\s+Destination\s+text\s+required/);
  assert.match(t.out, /style\s+Style\s+choice: Relaxed \| Packed\s+optional/);
  assert.match(t.out, /plan\s+The plan\s+markdown/);
  assert.match(t.out, /Run it: hydor apps run trip-planner city=<destination>/);
  assert.match((await run(conn, ['apps', 'show', 'quiz'])).out, /It takes no answers/);
  assert.match((await run(conn, ['apps', 'show', 'tpl:deep-research'])).out, /q\s+Question\s+long\s+required/);
  assert.match((await run(conn, ['apps', 'show', 'Deep research report'])).out, /Deep research report/);
  assert.deepEqual((await run(conn, ['apps', 'show', 'quiz', '--json'])).json, [routes['GET /api/apps/app2']]);
  await assert.rejects(run(conn, ['apps', 'show', 'nope']), (e) => e instanceof UsageError && /No app “nope”/.test((e as Error).message));
});

test('run builds the answers, starts the run, waits and prints the answer and its cost', async () => {
  let polls = 0;
  const { conn, calls } = fakeConn({
    ...routes,
    'POST /api/apps/app1/runs': { run: { ...run1, status: 'running', result: undefined } },
    'GET /api/apps/runs/run1abcdef': () => ({ run: ++polls < 2 ? { ...run1, status: 'running' } : done, recipe: { answer } }),
  });
  const t = await run(conn, ['apps', 'run', 'trip-planner', 'city=Lisbon', 'days=5', 'style=rel', 'kids=no']);
  assert.deepEqual(calls.find((c) => c.method === 'POST')!.body, { inputs: { city: 'Lisbon', days: 5, style: 'Relaxed', kids: false } });
  assert.match(t.out, /Running “Trip planner”… \(run run1abcdef\)/);
  assert.match(t.out, /The plan\n.*Lisbon/s);
  assert.match(t.out, /Budget\s+800/);
  assert.match(t.out, /Stops\n\s+• Belém\n\s+• Alfama/);
  assert.match(t.out, /By day\n\s+DAY\s+WHAT\n\s+1\s+Tram 28/);
  assert.match(t.out, /cost \$0\.12 · opus · 30 s/);
  assert.match(t.out, /Run run1abcdef: hydor apps run-show run1abcdef/);
  assert.equal(t.code, 0);
  assert.ok(polls >= 2, 'it looked again until the run ended');
});

test('run takes --input JSON, a field by its label, a file, and --json prints it raw', async () => {
  const dir = `${DATA}/files`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/n.txt`, 'hello');
  const { conn, calls } = fakeConn({ ...routes, 'POST /api/apps/app1/runs': { run: done } });
  const t = await run(conn, ['apps', 'run', 'trip-planner', '--input', '{"city":"Porto","days":3}', 'Notes file=@' + dir + '/n.txt', '--json']);
  assert.deepEqual(calls.find((c) => c.method === 'POST')!.body, { inputs: { city: 'Porto', days: 3 }, files: { notes: { name: 'n.txt', data: Buffer.from('hello').toString('base64') } } });
  assert.equal((t.json[0] as any).run.id, 'run1abcdef');
  const n = await run(conn, ['apps', 'run', 'trip-planner', 'city=X', '--no-wait']);
  assert.equal(n.out, 'Started “Trip planner”: run run1abcdef (hydor apps run-show run1abcdef)\n');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('run asks a terminal for what the form needs; elsewhere it says what is missing', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'POST /api/apps/app1/runs': { run: done } });
  await assert.rejects(run(conn, ['apps', 'run', 'trip-planner']), (e) => e instanceof UsageError && /needs city \(Destination\): add city=<value>/.test((e as Error).message));
  const t = await run(conn, ['apps', 'run', 'trip-planner'], { interactive: true, typed: ['Faro'] });
  assert.deepEqual(t.typed, [{ question: 'Destination (Where to): ', hidden: false }]);
  assert.deepEqual(calls.find((c) => c.method === 'POST')!.body, { inputs: { city: 'Faro' } });
  const q = await run(
    fakeConn({
      ...routes,
      'GET /api/apps/app2': {
        app: {
          fields: [
            { id: 'pick', label: 'Pick', type: 'choice', options: ['A', 'B'], required: true },
            { id: 'ok', label: 'Ok', type: 'choice', options: ['A', 'B'], required: true },
          ],
        },
        secrets: [],
      },
      'POST /api/apps/app2/runs': { run: done },
    }).conn,
    ['apps', 'run', 'quiz'],
    { interactive: true, pick: 'A' },
  );
  assert.deepEqual(q.picked, ['Pick', 'Ok']);
});

test('run refuses what the form does not take, calls nothing, and explains missing keys', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'POST /api/apps/app1/runs': new ApiError(409, 'It needs keys the vault does not have') });
  const bad = (words: string[], re: RegExp) => assert.rejects(run(conn, ['apps', 'run', ...words]), (e) => e instanceof UsageError && re.test((e as Error).message), words.join(' '));
  await bad(['trip-planner', 'color=red'], /no field “color”: its fields are city, days/);
  await bad(['trip-planner', 'city'], /field=value/);
  await bad(['trip-planner', 'city=A', 'days=many'], /takes a number/);
  await bad(['trip-planner', 'city=A', 'kids=maybe'], /yes or no/);
  await bad(['trip-planner', 'city=A', 'style=zzz'], /takes one of: Relaxed, Packed/);
  await bad(['trip-planner', '--input', '[1]'], /JSON object/);
  await bad(['tpl:weather'], /not installed/);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  await assert.rejects(
    run(conn, ['apps', 'run', 'trip-planner', 'city=A']),
    (e) => e instanceof ApiError && /Add the keys it needs on its page: http:\/\/fake\/apps\/trip-planner/.test((e as Error).message),
  );
});

test('a failed run says why and exits 1', async () => {
  const failed = { ...run1, status: 'failed', error: 'No model key', costUsd: undefined };
  const { conn } = fakeConn({ ...routes, 'POST /api/apps/app1/runs': { run: failed } });
  const t = await run(conn, ['apps', 'run', 'trip-planner', 'city=A']);
  assert.match(t.out, /Failed: No model key/);
  assert.equal(t.code, 1);
});

test('runs lists the latest runs of an app, or of all; run-show prints one', async () => {
  const { conn } = fakeConn({ ...routes, 'GET /api/apps/app1/runs': { runs: [run1, { ...run1, id: 'run2', status: 'failed' }] } });
  const t = await run(conn, ['apps', 'runs', 'trip-planner']);
  assert.match(t.out, /run1abcdef\s+Trip planner\s+done\s+1m ago\s+\$0\.12\s+Lisbon, 5/);
  assert.match(t.out, /run2\s+Trip planner\s+failed/);
  assert.match((await run(conn, ['apps', 'runs'])).out, /run1abcdef/);
  assert.match((await run(conn, ['apps', 'runs', 'trip-planner', '-n', '1'])).out, /… 1 more/);
  const s = await run(conn, ['apps', 'run-show', 'run1ab']);
  assert.match(s.out, /Run\s+run1abcdef/);
  assert.match(s.out, /Answers\s+city=Lisbon\n\s+days=5/);
  assert.match(s.out, /Budget\s+800/);
  assert.match((await run(conn, ['apps', 'result', 'run1abcdef'])).out, /Trip planner/);
  assert.deepEqual((await run(conn, ['apps', 'run-show', 'run1abcdef', '--json'])).json[0], routes['GET /api/apps/runs/run1abcdef']);
  assert.match((await run(fakeConn({ ...routes, 'GET /api/apps/app2/runs': { runs: [] } }).conn, ['apps', 'runs', 'quiz'])).out, /has not run yet/);
});

test('remove deletes after a yes, and uninstalls a ready-made app', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'DELETE /api/apps/app1': { ok: true }, 'POST /api/apps/tpl%3Adeep-research/uninstall': { installed: false } });
  await assert.rejects(run(conn, ['apps', 'remove', 'trip-planner']), (e) => e instanceof UsageError && /add -y/.test((e as Error).message));
  const no = await run(conn, ['apps', 'remove', 'trip-planner'], { interactive: true, confirm: false });
  assert.deepEqual(no.asked, ['Delete “Trip planner” with its runs, keys and data?']);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  assert.equal((await run(conn, ['apps', 'rm', 'trip-planner', '-y'])).out, 'Removed “Trip planner”.\n');
  assert.match((await run(conn, ['apps', 'remove', 'tpl:deep-research', '-y'])).out, /Uninstalled “Deep research report”/);
  assert.deepEqual(
    calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`),
    ['DELETE /api/apps/app1', 'POST /api/apps/tpl%3Adeep-research/uninstall'],
  );
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
