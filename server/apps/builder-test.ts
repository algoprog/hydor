// Script tests for what the App builder (and any agent) builds apps with, beyond saving and trying them (flow-test.ts):
// app_sketch checks a draft as app_save would and saves nothing; app_get reads the ready-made apps (listed, the
// closest to a description, one whole with its code cut short); app_services lists the free services; app_try's
// look says so in a line where there is no browser to draw the view with. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/builder-test.ts
//   DATA_DIR=/tmp/hydor-test-builder node dist/dev/builder-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { cleanRecipe } from '../../shared/apps.ts';
import { allSteps } from '../../shared/app-manifest.ts';
import { APP_SERVICES, serviceOf } from '../../shared/app-services.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx, RunTool } from '../features/types.ts';
import { builderTools } from './builder.ts';
import { apps } from './index.ts';
import { startRuns } from './runs.ts';
import * as store from './store.ts';
import { TEMPLATES } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-builder-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** The session manager: nothing here starts a session. */
class NoSessions extends EventEmitter {
  async create(): Promise<string> {
    throw new Error('No sessions in these tests');
  }
  summary() {
    return null;
  }
}

const http = Fastify();
const deps = { app: http, db, sessions: new NoSessions() as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
startRuns(deps);
await http.ready();

const ctx: RunCtx = { runId: 'builder-test', key: 'acp:builder-test', agent: 'acp', cwd: tmp, deps };
const tools: Record<string, RunTool> = Object.fromEntries(apps.tools!(ctx).map((t) => [t.name, t]));
const text = (out: unknown) => (typeof out === 'string' ? out : (out as { text: string }).text);
const failed = (out: unknown) => typeof out === 'object' && !!(out as { isError?: boolean }).isError;

test('the builder’s tools are offered to a session, the sketch and the services among them', () => {
  for (const name of ['app_get', 'app_sketch', 'app_save', 'app_try', 'app_screen', 'app_data', 'app_services']) assert.ok(tools[name], name);
});

// ---- app_sketch --------------------------------------------------------------------------------------

const draft = {
  name: 'Beach days',
  description: 'The best days for the beach this week, near a town you name.',
  icon: 'sun',
  color: 'amber',
  fields: [{ id: 'town', label: 'Which town?', type: 'text', required: true }],
  answer: [
    { id: 'summary', label: 'In short', type: 'text', required: true },
    { id: 'days', label: 'Days', type: 'table', columns: [{ id: 'date', label: 'Date', type: 'date' }, { id: 'score', label: 'Score', type: 'number' }] },
  ],
  steps: [
    { title: 'Find the town', kind: 'tool' },
    { title: 'Get the forecast', kind: 'tool' },
    { title: 'Score each day', kind: 'code' },
    { title: 'Say which days are best', kind: 'model' },
  ],
  needs: [{ name: 'BEACH_KEY', what: 'A key for the water temperature' }],
  assumed: ['The next 7 days', 'Warm, calm and dry is best'],
  questions: [{ ask: 'Water temperature too?', choices: ['Yes', 'No'] }],
};

test('app_sketch: a good draft comes back checked, with its steps in words and a rough estimate, and nothing is saved', async () => {
  const before = store.listApps(db).length;
  const out = await tools.app_sketch.run(draft, ctx);
  assert.ok(!failed(out), text(out));
  const r = JSON.parse(text(out));
  assert.match(r.said, /nothing is saved/i);
  assert.equal(r.sketch.name, 'Beach days');
  assert.equal(r.sketch.icon, 'sun');
  assert.deepEqual(r.sketch.fields.map((f: any) => f.id), ['town']);
  assert.deepEqual(r.sketch.answer.map((f: any) => f.id), ['summary', 'days']);
  assert.deepEqual(r.sketch.steps.map((s: any) => [s.title, s.kind]), draft.steps.map((s) => [s.title, s.kind]));
  assert.equal(r.sketch.view, false);
  // Tools and code are free, a model step next to nothing: seconds, not minutes.
  assert.ok(r.estimate.seconds[1] < 60 && r.estimate.usd[1] <= 0.01, JSON.stringify(r.estimate));
  assert.match(r.estimate.text, /^A run takes about/);
  assert.deepEqual(r.needs, [{ name: 'BEACH_KEY', what: 'A key for the water temperature' }]);
  assert.deepEqual(r.assumed, draft.assumed);
  assert.deepEqual(r.questions, draft.questions);
  assert.equal(store.listApps(db).length, before, 'a sketch saves nothing');
});

test('app_sketch: a whole flow shows as its steps, those inside one level in; a one-task app as one agent on its tier', async () => {
  const flow = {
    steps: [
      { id: 'find', title: 'Find the shops', do: 'tool', tool: 'web_search', with: { query: '{{town}} bakeries' } },
      { id: 'each', title: 'Read each one', do: 'repeat', over: '{{find.data}}', atOnce: 2, steps: [{ id: 'read', title: 'Read its page', do: 'agent', instructions: 'Read {{item.url}}', tier: 'quick' }] },
    ],
  };
  const shown = text(await tools.app_sketch.run({ ...draft, steps: undefined, flow }, ctx));
  assert.ok(shown.startsWith('{'), shown);
  const r = JSON.parse(shown);
  assert.deepEqual(r.sketch.steps.map((s: any) => s.title), ['Find the shops', 'Read each one']);
  assert.equal(r.sketch.steps[1].how, 'for each, 2 at once');
  assert.deepEqual(r.sketch.steps[1].inner.map((s: any) => [s.title, s.kind]), [['Read its page', 'agent']]);
  const one = JSON.parse(text(await tools.app_sketch.run({ ...draft, steps: undefined, prompt: 'Find the best beach days near {{town}}.', tier: 'best' }, ctx)));
  assert.deepEqual(one.sketch.steps, [{ title: 'Do the task', kind: 'agent' }]);
  assert.deepEqual(one.estimate.seconds, [180, 360]);
  assert.equal(one.sketch.tier, 'best');
});

test('app_sketch: mistakes come back in words, as app_save says them, and no card', async () => {
  const before = store.listApps(db).length;
  const bad = await tools.app_sketch.run(
    {
      ...draft,
      steps: [{ title: 'Guess', kind: 'magic' }],
      needs: ['beach key'],
      questions: [{ ask: 'One?', choices: ['Only'] }, { ask: 'Two?', choices: ['a', 'b'] }, { ask: 'Three?', choices: ['a', 'b'] }, { ask: 'Four?', choices: ['a', 'b'] }],
    },
    ctx,
  );
  assert.ok(failed(bad));
  const said = text(bad);
  assert.match(said, /^Not shown\. Fix these first/);
  assert.match(said, /“magic” is not a kind of step/);
  assert.match(said, /“beach key” is not a name for the vault/);
  assert.match(said, /at most three questions/);
  assert.match(said, /Question 1: give two to six choices/);
  assert.match(text(await tools.app_sketch.run({ name: 'Nothing', description: 'x', assumed: [] }, ctx)), /Say what it does/);
  // An icon it does not have is no mistake: the card shows, and the answer says which icons there are.
  const iconed = await tools.app_sketch.run({ ...draft, icon: 'waves', color: 'sea' }, ctx);
  assert.ok(!failed(iconed));
  assert.match(text(iconed), /It has no icon “waves”, so it shows “[a-z-]+”: its icons are .*\bsun\b/);
  assert.match(text(iconed), /It has no colour “sea”/);
  // Its steps whole are checked as app_save checks them.
  const flowed = await tools.app_sketch.run({ ...draft, steps: undefined, flow: { steps: [{ id: 'x', do: 'tool', tool: 'bash' }] } }, ctx);
  assert.ok(failed(flowed));
  assert.match(text(flowed), /bash cannot run as a step/);
  // A view that uses a name its answer lacks is said as a save would say it.
  const view = { pages: [{ id: 'main', title: 'Days', blocks: [{ element: 'text', data: 'result.nothing_here' }] }] };
  const viewed = await tools.app_sketch.run({ ...draft, ui: view }, ctx);
  if (failed(viewed)) assert.match(text(viewed), /nothing_here/);
  else assert.ok(JSON.stringify(JSON.parse(text(viewed)).warnings ?? []).includes('nothing_here'), text(viewed));
  assert.equal(store.listApps(db).length, before);
});

// ---- app_get: the ready-made apps ---------------------------------------------------------------------

test('app_get: ready lists every ready-made app in a line, with how it is made', async () => {
  const out = text(await tools.app_get.run({ ready: true }, ctx));
  const lines = out.split('\n').filter((l) => l.startsWith('- tpl:'));
  assert.equal(lines.length, TEMPLATES.length);
  const weather = lines.find((l) => l.startsWith('- tpl:weather-outlook '))!;
  assert.ok(weather, 'the Weather outlook is listed');
  assert.match(weather, /steps: [a-z, ]+/);
  assert.match(weather, /a view \(/);
  // An app used on its own page says so.
  const own = TEMPLATES.find((t) => t.sessions === false);
  if (own) assert.match(lines.find((l) => l.startsWith(`- tpl:${own.id} `))!, /used on its own page/);
});

test('app_get: like gives the three ready-made apps closest to a description', async () => {
  const out = text(await tools.app_get.run({ like: 'weather forecast for the week ahead' }, ctx));
  const lines = out.split('\n').filter((l) => l.startsWith('- tpl:'));
  assert.equal(lines.length, 3);
  assert.ok(lines.some((l) => l.startsWith('- tpl:weather-outlook ')), out);
  assert.match(out, /closest to “weather forecast for the week ahead”/);
});

test('app_get: tpl:<id> gives a ready-made app whole, its long programs cut to 40 lines unless code: true', async () => {
  const weather = JSON.parse(text(await tools.app_get.run({ app: 'tpl:weather-outlook' }, ctx)));
  assert.equal(weather.id, 'tpl:weather-outlook');
  assert.equal(weather.recipe.name, TEMPLATES.find((t) => t.id === 'weather-outlook')!.name);
  assert.match(weather.said, /app_save/);
  // A ready-made app with a long code step: cut, with a note of how many more lines, and whole when asked.
  const codeLines = (t: (typeof TEMPLATES)[number]) => Math.max(0, ...[t.flow, ...Object.values(t.flows ?? {})].flatMap((f) => (f ? allSteps(f.steps) : [])).map((s) => (s.do === 'code' ? s.code.split('\n').length : 0)));
  const long = TEMPLATES.find((t) => codeLines(t) > 40);
  assert.ok(long, 'a ready-made app has a code step longer than 40 lines');
  const cut = JSON.parse(text(await tools.app_get.run({ app: `tpl:${long!.id}` }, ctx)));
  const cutCode = allSteps(cut.recipe.flow?.steps ?? []).concat(...Object.values(cut.recipe.flows ?? {}).map((f: any) => allSteps(f.steps))).filter((s: any) => s.do === 'code');
  assert.ok(cutCode.every((s: any) => s.code.split('\n').length <= 41), 'each program is at most 40 lines and the note');
  assert.ok(cutCode.some((s: any) => /… \d+ more lines \(app_get with code: true gives them all\)/.test(s.code)));
  assert.match(cut.said, /cut to the first 40 lines/);
  const whole = JSON.parse(text(await tools.app_get.run({ app: `tpl:${long!.id}`, code: true }, ctx)));
  assert.deepEqual(whole.recipe, JSON.parse(JSON.stringify(cleanRecipe(long!))));
  assert.ok(failed(await tools.app_get.run({ app: 'tpl:no-such-app' }, ctx)));
  // The user's own apps are listed as before.
  assert.ok(Array.isArray(JSON.parse(text(await tools.app_get.run({}, ctx))).apps));
});

test('app_get: one of the user’s apps says what a run takes and costs, from its steps until it has finished runs', async () => {
  const a = store.saveApp(db, { recipe: cleanRecipe({ name: 'Summer', prompt: 'Say something about {{x}}', tier: 'quick', fields: [{ id: 'x', label: 'X' }] }) });
  assert.match(JSON.parse(text(await tools.app_get.run({ app: a.id }, ctx))).estimate, /about 30–60 s .*rough guess/);
  const r = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'test', inputs: { x: 'y' } });
  store.updateRun(db, r.id, { status: 'done', result: {}, costUsd: 0.04, startedAt: 1_000_000, endedAt: 1_042_000 });
  assert.match(JSON.parse(text(await tools.app_get.run({ app: a.id }, ctx))).estimate, /about 42 s and costs about \$0\.04 \(the middle of its last 1 finished run\)/);
});

// ---- app_services ---------------------------------------------------------------------------------------

test('app_services: the free services, found by words, each with a request to start from and whether it needs a key', async () => {
  const all = text(await tools.app_services.run({}, ctx));
  for (const s of APP_SERVICES) assert.ok(all.includes(s.name), s.name);
  const weather = text(await tools.app_services.run({ query: 'weather forecast' }, ctx));
  assert.match(weather, /Open-Meteo forecast \(api\.open-meteo\.com\)/);
  assert.match(weather, /No key needed/);
  assert.match(weather, /https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  assert.ok(!weather.includes('Frankfurter'), 'only those that match');
  assert.match(text(await tools.app_services.run({ query: 'zebra crossings' }, ctx)), /None of the services matched “zebra crossings”[\s\S]*Frankfurter/);
  assert.equal(serviceOf('api.open-meteo.com')?.id, 'open-meteo');
  assert.equal(serviceOf('API.Frankfurter.dev.')?.id, 'frankfurter');
  assert.equal(serviceOf('example.org'), undefined);
});

// ---- app_try with look ----------------------------------------------------------------------------------

test('app_try look: where there is no browser to draw with, the answer says so in a line instead of failing', async () => {
  const own = Object.fromEntries(builderTools(ctx, { problemsOf: (raw) => ({ recipe: cleanRecipe(raw), errors: [], warnings: [] }), prepare: (a) => a, canLook: () => false }).map((t) => [t.name, t]));
  const ui = { pages: [{ id: 'main', title: 'In short', blocks: [{ element: 'text', data: 'result.summary' }] }] };
  const a = store.saveApp(db, { recipe: cleanRecipe({ name: 'Looked at', prompt: 'Sum up {{x}}', fields: [{ id: 'x', label: 'X' }], answer: [{ id: 'summary', label: 'Summary', type: 'text' }], ui }) });
  const r = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'test', inputs: { x: 'y' } });
  store.updateRun(db, r.id, { status: 'done', result: { summary: 'All fine.' }, startedAt: 1, endedAt: 2 });
  const out = await own.app_try.run({ runs: [r.id], look: true, wait: 1 }, ctx);
  assert.equal(typeof out, 'string', 'no pictures, and no error');
  assert.equal(JSON.parse((out as string).split('\nNo pictures')[0]).runs[0].status, 'done', 'the runs as before');
  assert.match(out as string, /No pictures: this computer has no browser to draw them with \(the user can download one in Settings → Browser\)/);
  // Without a view, or without an answer, it says that instead.
  const plain = store.saveApp(db, { recipe: cleanRecipe({ name: 'Plain', prompt: 'Sum up {{x}}', fields: [{ id: 'x', label: 'X' }], answer: [{ id: 'summary', label: 'Summary', type: 'text' }] }) });
  const p = store.insertRun(db, { app: plain.id, appName: plain.name, recipe: plain, source: 'test', inputs: { x: 'y' } });
  store.updateRun(db, p.id, { status: 'done', result: { summary: 'Fine.' }, startedAt: 1, endedAt: 2 });
  assert.match(text(await own.app_try.run({ runs: [p.id], look: true, wait: 1 }, ctx)), /No pictures: it has no view/);
  const f = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'test', inputs: { x: 'y' } });
  store.updateRun(db, f.id, { status: 'failed', error: 'It broke', startedAt: 1, endedAt: 2 });
  assert.match(text(await own.app_try.run({ runs: [f.id], look: true, wait: 1 }, ctx)), /did not finish with an answer/);
  // Without look, nothing about pictures.
  assert.ok(!text(await own.app_try.run({ runs: [r.id], wait: 1 }, ctx)).includes('pictures'));
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
