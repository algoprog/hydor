// Script tests for the top of the Apps page: the apps pinned there (their routes: in the order given, at most twelve,
// an app deleted or uninstalled leaving them, news of a change for the other pages), the apps used lately (each once,
// newest first, from the runs a person started), what the gallery says of each app (how often it ran, a key it lacks),
// and the order agents get the user's apps in: find_apps and the note every session is told (pinned, then used lately).
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/pins-test.ts
//   DATA_DIR=/tmp/hydor-test-apps-pins node dist/dev/pins-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { AppRecipe, RunSource, RunStatus } from '../../shared/apps.ts';
import { cleanRecipe } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import { vaultTables } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { apps } from './index.ts';
import { MAX_PINS, pinsOf, recentApps, RECENT_APPS, theirsFirst } from './pins.ts';
import { dropAppIndex, findApps } from './search.ts';
import * as store from './store.ts';
import { TEMPLATES } from './templates.ts';
import { findAppsTool, usableApps, useNote } from './use.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-apps-pins-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
// The vault, whose keys the gallery reads (the connections capability makes it in the app).
vaultTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// The routes, with a stand-in for the session manager (no run here starts an agent: their records are written as they would be).
class FakeSessions extends EventEmitter {
  summary() {
    return null;
  }
}
const http = Fastify();
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const events: { t: string; id: string; data: any }[] = [];
const deps = { app: http, db, sessions: new FakeSessions() as any, scheduler: null as any, models: null as any, broadcast: (e: any) => events.push(e), toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
await http.ready();

const call = async (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, body?: unknown) => {
  const r = await http.inject({ method, url, ...(body !== undefined ? { payload: body as any } : {}) });
  return { status: r.statusCode, body: r.json() as any };
};

const recipe = (p: Partial<AppRecipe> = {}): AppRecipe =>
  cleanRecipe({ name: 'An app', agent: 'claude', prompt: 'Do it for {{city}}.', fields: [{ id: 'city', label: 'City', required: true }], answer: [{ id: 'summary', label: 'Summary', type: 'text' }], ...p });
const mine = (name: string, p: Partial<AppRecipe> = {}) => store.saveApp(db, { recipe: recipe({ name, ...p }) });
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!;

/** A run as the app writes it, `at` minutes ago. */
let clock = Date.now() - 24 * 3600_000;
function run(app: string, source: RunSource, o: { status?: RunStatus; parent?: string; flow?: string; at?: number } = {}) {
  const r = app.startsWith('tpl:') ? tpl(app.slice(4)) : store.getApp(db, app)!;
  const made = store.insertRun(db, { app, appName: r.name, recipe: r, source, inputs: { city: 'Lisbon' }, status: o.status ?? 'done', ...(o.parent ? { parent: o.parent } : {}), ...(o.flow ? { flow: o.flow } : {}) });
  clock += 60_000;
  db.prepare('update app_runs set created_at = ? where id = ?').run(o.at ?? clock, made.id);
  return made.id;
}

test('pins: kept in the order given (yours by id or address, ready-made ones as tpl:<id> or their id), twice once; the other pages hear of it', async () => {
  assert.deepEqual((await call('GET', '/api/apps/pins')).body, { ids: [] });
  const a = mine('Packing list');
  events.length = 0;
  const r = await call('PUT', '/api/apps/pins', { ids: ['tpl:trip-planner', a.slug, 'weather-outlook', 'tpl:trip-planner'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.ids, ['tpl:trip-planner', a.id, 'tpl:weather-outlook']);
  assert.deepEqual((await call('GET', '/api/apps/pins')).body.ids, ['tpl:trip-planner', a.id, 'tpl:weather-outlook']);
  assert.deepEqual(events, [{ t: 'feature', id: 'apps', data: { pins: ['tpl:trip-planner', a.id, 'tpl:weather-outlook'] } }]);
  // Dragged into another order.
  await call('PUT', '/api/apps/pins', { ids: [a.id, 'tpl:weather-outlook', 'tpl:trip-planner'] });
  assert.deepEqual(pinsOf(db), [a.id, 'tpl:weather-outlook', 'tpl:trip-planner']);
  // The gallery has them too.
  assert.deepEqual((await call('GET', '/api/apps')).body.pins, [a.id, 'tpl:weather-outlook', 'tpl:trip-planner']);
  await call('PUT', '/api/apps/pins', { ids: [] });
  assert.deepEqual(pinsOf(db), []);
  store.deleteApp(db, a.id);
});

test('pins: refused, saying why: not a list, an app that is not here, a ready-made one uninstalled, more than twelve; what was kept stays', async () => {
  await call('PUT', '/api/apps/pins', { ids: ['tpl:quiz'] });
  let r = await call('PUT', '/api/apps/pins', { ids: 'tpl:quiz' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /a list of apps/);
  r = await call('PUT', '/api/apps/pins', { ids: ['tpl:quiz', 'no-such-app'] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /There is no app “no-such-app” here/);
  await call('POST', '/api/apps/tpl:gift-ideas/uninstall');
  r = await call('PUT', '/api/apps/pins', { ids: ['tpl:gift-ideas'] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Gift ideas is not installed: install it again on the Apps page to pin it/);
  await call('POST', '/api/apps/tpl:gift-ideas/install');
  const many = TEMPLATES.filter((t) => !t.block)
    .slice(0, MAX_PINS + 1)
    .map((t) => `tpl:${t.id}`);
  r = await call('PUT', '/api/apps/pins', { ids: many });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /At most 12 apps can be pinned: unpin one first/);
  assert.deepEqual(pinsOf(db), ['tpl:quiz'], 'what was pinned stays');
  r = await call('PUT', '/api/apps/pins', { ids: many.slice(0, MAX_PINS) });
  assert.equal(r.body.ids.length, MAX_PINS, 'twelve is fine');
  await call('PUT', '/api/apps/pins', { ids: [] });
});

test('pins: an app deleted, or a ready-made one uninstalled, leaves them (the pages hear of it); one gone some other way is left out', async () => {
  const a = mine('Rain check');
  const b = mine('Gone quietly');
  await call('PUT', '/api/apps/pins', { ids: [a.id, 'tpl:quiz', b.id, 'tpl:book-finder'] });
  events.length = 0;
  assert.equal((await call('DELETE', `/api/apps/${a.id}`)).status, 200);
  assert.deepEqual(pinsOf(db), ['tpl:quiz', b.id, 'tpl:book-finder']);
  assert.deepEqual(events.at(-1), { t: 'feature', id: 'apps', data: { pins: ['tpl:quiz', b.id, 'tpl:book-finder'] } });
  await call('POST', '/api/apps/tpl:book-finder/uninstall');
  assert.deepEqual(pinsOf(db), ['tpl:quiz', b.id]);
  // Installed again, it is not pinned again by itself.
  await call('POST', '/api/apps/tpl:book-finder/install');
  assert.deepEqual(pinsOf(db), ['tpl:quiz', b.id]);
  // Deleted without the route (as a test or a later version might): the pins leave it out all the same.
  store.deleteApp(db, b.id);
  assert.deepEqual((await call('GET', '/api/apps/pins')).body.ids, ['tpl:quiz']);
  // Nothing of yours takes the address the pins' route has.
  const named = mine('Pins');
  assert.notEqual(named.slug, 'pins');
  store.deleteApp(db, named.id);
  await call('PUT', '/api/apps/pins', { ids: [] });
});

test('used lately: each app once with its latest run, newest first; only the runs a person started; an app gone or uninstalled left out; at most eight', async () => {
  db.prepare('delete from app_runs').run();
  const a = mine('City notes');
  const b = mine('Daily brief');
  const gone = mine('Gone soon');
  run('tpl:weather-outlook', 'web');
  const failed = run(a.id, 'web', { status: 'failed' });
  const lately = run('tpl:weather-outlook', 'session');
  run(b.id, 'task'); // a scheduled run
  run(b.id, 'api'); // a program's
  const parent = run('tpl:quiz', 'web');
  run('tpl:quiz', 'step', { parent }); // a step of another run
  run(a.id, 'web', { flow: 'sync' }); // another of its flows
  run(a.id, 'test'); // a try in the builder
  run('tpl:trip-planner', 'web');
  run('tpl:quiz', 'batch'); // a row of a CSV
  run(gone.id, 'web');
  const waiting = run('tpl:quiz', 'screen', { status: 'waiting' });
  await call('POST', '/api/apps/tpl:trip-planner/uninstall');
  await call('DELETE', `/api/apps/${gone.id}`);
  const used = recentApps(db);
  assert.deepEqual(
    used.map((u) => [u.app, u.run.id]),
    [
      ['tpl:quiz', waiting],
      ['tpl:weather-outlook', lately],
      [a.id, failed],
    ],
  );
  assert.equal(used[0].run.status, 'waiting');
  assert.equal(used[2].run.status, 'failed');
  assert.ok(!('recipe' in used[0].run), 'a run as the pages see it');
  // The gallery has them, and how often each app ran all told (not its tries, steps or conversations).
  const g = (await call('GET', '/api/apps')).body;
  assert.deepEqual(
    g.used.map((u: any) => u.app),
    ['tpl:quiz', 'tpl:weather-outlook', a.id],
  );
  assert.equal(g.apps.find((x: any) => x.id === a.id).uses, 2, 'its form’s run and its other flow’s');
  assert.equal(g.apps.find((x: any) => x.id === b.id).uses, 2, 'scheduled and programs’ runs count as use');
  assert.equal(g.templates.find((t: any) => t.id === 'quiz').lastRunAt > 0, true);
  // Installed again: back among them.
  await call('POST', '/api/apps/tpl:trip-planner/install');
  assert.deepEqual(
    recentApps(db).map((u) => u.app),
    ['tpl:quiz', 'tpl:trip-planner', 'tpl:weather-outlook', a.id],
  );
  // Many apps used: the eight newest.
  const more = Array.from({ length: 9 }, (_, i) => mine(`Busy app ${i + 1}`));
  for (const m of more) run(m.id, 'web');
  const eight = recentApps(db);
  assert.equal(eight.length, RECENT_APPS);
  assert.deepEqual(
    eight.map((u) => u.app),
    more
      .slice(1)
      .reverse()
      .map((m) => m.id),
  );
  for (const m of [a, b, ...more]) store.deleteApp(db, m.id);
  db.prepare('delete from app_runs').run();
});

test('the gallery: an app that cannot run without a key the vault lacks says so; one whose key only another flow needs does not', async () => {
  const keyed = mine('Keyed', { secrets: [{ name: 'PINS_TEST_KEY', label: 'A test key', domains: ['api.example.com'] }] as any });
  const plain = mine('Plain');
  const g = (await call('GET', '/api/apps')).body;
  assert.equal(g.apps.find((x: any) => x.id === keyed.id).needsKey, true);
  assert.equal(g.apps.find((x: any) => x.id === plain.id).needsKey, undefined);
  assert.equal(g.templates.find((t: any) => t.id === 'reading-list').needsKey, undefined, 'the Reading list runs without its Zotero key, which only its sync needs');
  assert.equal(g.templates.find((t: any) => t.id === 'weather-outlook').needsKey, undefined);
  for (const x of [keyed, plain]) store.deleteApp(db, x.id);
});

/** The session's own MCP context, as its tools see it. */
const sessionCtx = (key: string): RunCtx => ({ runId: `run-${key}`, key, agent: 'claude', cwd: tmp, deps });
const refsOf = (text: string) => [...text.matchAll(/^- "([^"]+)"/gm)].map((m) => m[1]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('find_apps: the best fits, those the user pinned first (as pinned), then those used lately (newest first), each marked, then the others best first; its description says so', async () => {
  db.prepare('delete from app_runs').run();
  await call('PUT', '/api/apps/pins', { ids: [] });
  dropAppIndex();
  const query = 'weather forecast rain this weekend';
  const before = (await findApps(db, usableApps(db), query)).found;
  assert.ok(before.length >= 6, 'several apps fit');
  // Pin two of the weaker fits (the lower one first), use another lately, and run one more by a scheduled task only.
  const [pinA, pinB, used, scheduled] = [before[5].u, before[3].u, before[4].u, before[1].u];
  await call('PUT', '/api/apps/pins', { ids: [pinA.app, pinB.app] });
  run(used.app, 'web');
  run(scheduled.app, 'task');
  const tool = findAppsTool(sessionCtx('claude:finder'))!;
  assert.match(tool.description, /pinned to the top of their Apps page come first/);
  assert.match(tool.description, /then the ones they used lately/);
  const said = String(await tool.run({ query }, sessionCtx('claude:finder')));
  assert.match(said, /those the user pinned first, then those they used lately, then the others, best first/);
  const after = (await findApps(db, usableApps(db), query)).found.map((f) => f.u.app);
  const ids = refsOf(said).map((ref) => usableApps(db).find((u) => u.ref === ref)!.app);
  assert.deepEqual(ids, [pinA.app, pinB.app, used.app, ...after.filter((x) => ![pinA.app, pinB.app, used.app].includes(x))]);
  assert.match(said, new RegExp(`^- "${esc(pinA.ref)}": ${esc(pinA.recipe.name)} \\(ready-made, pinned\\)`, 'm'));
  assert.match(said, new RegExp(`^- "${esc(used.ref)}": ${esc(used.recipe.name)} \\(ready-made, used lately\\)`, 'm'));
  assert.match(said, new RegExp(`^- "${esc(scheduled.ref)}": ${esc(scheduled.recipe.name)} \\(ready-made\\) —`, 'm'), 'a scheduled run is not a use');
  // Nothing matched: the apps there are, the pinned ones first, then the ones run lately.
  const none = String(await tool.run({ query: 'zzqx vvbn' }, sessionCtx('claude:finder')));
  assert.match(none, /No app's words or meaning matched/);
  assert.deepEqual(
    refsOf(none)
      .slice(0, 3)
      .map((ref) => usableApps(db).find((u) => u.ref === ref)!.app),
    [pinA.app, pinB.app, used.app],
  );
  // The same order for any list of the user's apps.
  const ordered = theirsFirst(db, ['tpl:quiz', used.app, pinB.app, 'tpl:book-finder', pinA.app], (x) => x);
  assert.deepEqual(ordered.list, [pinA.app, pinB.app, used.app, 'tpl:quiz', 'tpl:book-finder']);
  assert.deepEqual([...ordered.used], [used.app]);
  // What every session is told: the pinned ones first among those it names, marked.
  const note = useNote(db)!;
  assert.match(note, /Those they pinned, then those they run most:/);
  const named = note.split('\n').filter((l) => l.startsWith('- '));
  assert.match(named[0], new RegExp(`^- "${esc(pinA.ref)}": ${esc(pinA.recipe.name)} \\(ready-made, pinned\\)`));
  assert.match(named[1], new RegExp(`^- "${esc(pinB.ref)}": ${esc(pinB.recipe.name)} \\(ready-made, pinned\\)`));
  await call('PUT', '/api/apps/pins', { ids: [] });
  assert.match(useNote(db)!, /Those they run most:/, 'none pinned: as before');
  db.prepare('delete from app_runs').run();
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}`);
    console.log(e);
    process.exit(1);
  }
}
console.log(`\n${passed} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
