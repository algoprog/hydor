// Script test for keeping the computer awake (server/awake.ts): what counts as work here (sessions at work, not those
// waiting for you or idle; app runs of steps; experiments on this computer, not on another machine or a cluster), the
// next scheduled run (watchers, webhooks and paused tasks left out, one long overdue too), the decision for each of
// the setting's three choices, and the desktop app being told when the answer changes: at once when work starts, a
// moment after it ends (not between two turns), at once for Never, by itself when a run's few minutes begin, and over
// the server's message channel as desktop/main.cjs hears it (the test plays the app: it starts itself again as the
// server's side, as server/desktop-test.ts does). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/awake-test.ts && DATA_DIR=/tmp/hydor-test-awake node dist/dev/awake-test.js
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AWAKE_LATE, AWAKE_LEAD, awakeMode, decideAwake, KeepAwake, nextScheduled, setAwakeMode, workingNow, type AwakeSources } from './awake.ts';
import { openDb, type DB } from './db.ts';
import { migrateTasks } from './scheduler.ts';
import { ensureTables, insertRun as insertAppRun, updateRun as updateAppRun } from './apps/store.ts';
import { insertRun as insertExperiment } from './experiments/records.ts';
import type { AppRecipe } from '../shared/apps.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-awake-test-'));
let n = 0;
const fresh = (): DB => {
  const db = openDb(path.join(tmp, `test-${++n}.db`));
  migrateTasks(db);
  return db;
};
type Lives = Map<string, { adapter: { state: { status: string } } }>;
const live = (status: string) => ({ adapter: { state: { status } } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
/** A task as the scheduler keeps it. */
function task(db: DB, o: { name: string; schedule: object; at: number | null; enabled?: boolean; resume?: boolean }) {
  db.prepare('insert into tasks (id, name, schedule, prompt, agent, cwd, enabled, next_at, resume, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    `t${++seq}`,
    o.name,
    JSON.stringify(o.schedule),
    'Do it',
    'claude',
    '/tmp',
    o.enabled === false ? 0 : 1,
    o.at,
    o.resume ? 1 : 0,
    Date.now(),
  );
  return `t${seq}`;
}

if (process.env.HYDOR_TEST_SIDE) {
  // ---- the server's side, inside a desktop app (HYDOR_DESKTOP): it tells the app over its channel ----
  const db = fresh();
  const lives: Lives = new Map([['s1', live('idle')]]);
  const k = new KeepAwake({ db, lives }, { debounceMs: 10, graceMs: 100 });
  process.on('message', (m: { do?: string }) => {
    if (m.do === 'work') lives.set('s1', live('working'));
    if (m.do === 'rest') lives.set('s1', live('idle'));
    if (m.do === 'state') return void process.send!({ type: 'state', state: k.state() });
    if (m.do === 'quit') {
      k.stop();
      process.exit(0);
    }
    k.poke();
  });
} else {
  const tests: [string, () => Promise<void> | void][] = [];
  const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);

  test('the setting: tasks at first, one of three choices', () => {
    const db = fresh();
    assert.equal(awakeMode(db), 'tasks');
    assert.equal(setAwakeMode(db, 'working'), 'working');
    assert.equal(awakeMode(db), 'working');
    setAwakeMode(db, 'never');
    assert.equal(awakeMode(db), 'never');
    assert.throws(() => setAwakeMode(db, 'always'), /one of tasks, working, never/);
    assert.equal(awakeMode(db), 'never', 'a wrong choice changes nothing');
  });

  test('the decision for each choice', () => {
    const now = 1_000_000_000;
    const soon = { at: now + AWAKE_LEAD - 1000 };
    const later = { at: now + AWAKE_LEAD + 60_000 };
    // Before scheduled tasks and while agents work (the default).
    assert.deepEqual(decideAwake('tasks', now, 1), { awake: true });
    assert.deepEqual(decideAwake('tasks', now, 0, soon), { awake: true }, 'a run due within the few minutes');
    assert.deepEqual(decideAwake('tasks', now, 0, { at: now - 60_000 }), { awake: true }, 'a run due a minute ago, not started yet');
    assert.deepEqual(decideAwake('tasks', now, 0, later), { awake: false, recheckAt: later.at - AWAKE_LEAD }, 'later: looked at again when its few minutes begin');
    assert.deepEqual(decideAwake('tasks', now, 0), { awake: false });
    // Only while agents work.
    assert.deepEqual(decideAwake('working', now, 2), { awake: true });
    assert.deepEqual(decideAwake('working', now, 0, soon), { awake: false }, 'a run due soon does not keep it awake');
    // Never.
    assert.deepEqual(decideAwake('never', now, 3, soon), { awake: false });
  });

  test('what works here: sessions at work, app runs of steps, experiments on this computer', () => {
    const db = fresh();
    const lives: Lives = new Map([
      ['working', live('working')],
      ['starting', live('starting')],
      ['waiting', live('waiting')],
      ['idle', live('idle')],
      ['error', live('error')],
      ['exited', live('exited')],
    ]);
    const src: AwakeSources = { db, lives };
    assert.deepEqual(workingNow(src), ['session:working', 'session:starting'], 'not one waiting for your answer, idle, failed or ended');

    ensureTables(db);
    const recipe = { name: 'An app', fields: [] } as unknown as AppRecipe;
    const app = (status: 'running' | 'starting' | 'waiting' | 'done', key?: string) => {
      const r = insertAppRun(db, { app: 'a1', appName: 'An app', recipe, source: 'web', inputs: {} });
      updateAppRun(db, r.id, { status, ...(key ? { key } : {}) });
      return r.id;
    };
    const steps = app('running');
    app('running', 'working'); // an agent's run: its session's turn already counts
    const own = app('starting', 'idle'); // its session not at work yet
    app('waiting'); // waiting for a person's answer
    app('done');

    const exp = (id: string, status: 'running' | 'starting' | 'queued' | 'done', where: string, remote = false) =>
      insertExperiment(db, { id, status, spec: { command: 'python train.py', cwd: '/tmp', where }, ...(remote ? { info: { remote: { machine: 'gpu', id: 'x' } } } : {}) });
    exp('e-local', 'running', 'local');
    exp('e-start', 'starting', 'local');
    exp('e-queued', 'queued', 'local');
    exp('e-done', 'done', 'local');
    exp('e-machine', 'running', 'm:gpu', true);
    exp('e-cluster', 'running', 'c:slurm');
    exp('e-copy', 'running', 'local', true);

    assert.deepEqual(workingNow(src).sort(), ['app:' + own, 'app:' + steps, 'experiment:e-local', 'experiment:e-start', 'session:starting', 'session:working'].sort());
  });

  test('the next scheduled run: watchers, webhooks, paused tasks and long-overdue runs left out', () => {
    const db = fresh();
    const now = Date.now();
    assert.equal(nextScheduled(db, now), undefined);
    task(db, { name: 'Watch the feed', schedule: { kind: 'watch', minutes: 5, watch: { kind: 'feed', url: 'https://example.com/feed' } }, at: now + 30_000 });
    task(db, { name: 'Hook', schedule: { kind: 'webhook' }, at: null });
    task(db, { name: 'Paused', schedule: { kind: 'daily', time: '07:00' }, at: now + 60_000, enabled: false });
    task(db, { name: 'Stuck', schedule: { kind: 'once', at: now - AWAKE_LATE - 60_000 }, at: now - AWAKE_LATE - 60_000 });
    assert.equal(nextScheduled(db, now), undefined, 'none of these');
    const brief = task(db, { name: 'Morning brief', schedule: { kind: 'daily', time: '07:00' }, at: now + 3 * 60_000 });
    task(db, { name: 'Hourly', schedule: { kind: 'every', minutes: 60 }, at: now + 60 * 60_000 });
    assert.deepEqual(nextScheduled(db, now), { id: brief, name: 'Morning brief', at: now + 3 * 60_000 });
    assert.equal(decideAwake('tasks', now, 0, nextScheduled(db, now)).awake, true, 'due in 3 minutes: awake');
    // It started (the scheduler sets its next time first): the next one is an hour away.
    db.prepare('update tasks set next_at = ? where id = ?').run(now + 24 * 3600_000, brief);
    assert.equal(nextScheduled(db, now)?.name, 'Hourly');
    assert.equal(decideAwake('tasks', now, 0, nextScheduled(db, now)).awake, false);
    // A watcher due any moment keeps nothing awake on its own; a session continuing after its usage limit does.
    task(db, { name: 'Resume a session', schedule: { kind: 'once', at: now + 60_000 }, at: now + 60_000, resume: true });
    assert.equal(nextScheduled(db, now)?.name, 'Resume a session');
    // Overdue a minute (the computer just woke): still due until it starts.
    const late = task(db, { name: 'Late', schedule: { kind: 'once', at: now - 60_000 }, at: now - 60_000 });
    assert.equal(nextScheduled(db, now)?.id, late);
  });

  test('the app is told when the answer changes: at once for work, a moment after it ends, at once for Never', async () => {
    const db = fresh();
    const lives: Lives = new Map([['s1', live('idle')]]);
    const told: [boolean, string][] = [];
    const k = new KeepAwake({ db, lives }, { on: true, debounceMs: 10, graceMs: 120, send: (on, why) => told.push([on, why]) });
    await sleep(40);
    assert.deepEqual(told, [[false, 'nothing needs it']], 'once as it starts');
    assert.equal(k.state().available, true);
    assert.equal(k.state().awake, false);

    lives.set('s1', live('working'));
    k.poke();
    k.poke();
    await sleep(40);
    assert.deepEqual(told.at(-1), [true, '1 at work']);
    assert.equal(told.length, 2, 'a burst of changes is one look');
    assert.equal(k.state().awake, true);
    assert.equal(k.state().working, 1);

    // Between two turns (a queued message going out): it stays awake.
    lives.set('s1', live('idle'));
    k.poke();
    await sleep(40);
    lives.set('s1', live('working'));
    k.poke();
    await sleep(150);
    assert.equal(told.length, 2, 'not let go between two turns');

    // The work ends: let go after the grace.
    lives.set('s1', live('idle'));
    k.poke();
    await sleep(40);
    assert.equal(told.length, 2, 'not at once');
    assert.equal(k.state().awake, true, 'still held meanwhile');
    await sleep(150);
    assert.deepEqual(told.at(-1), [false, 'nothing needs it']);

    // Work again, then Never: let go at once.
    lives.set('s1', live('working'));
    k.evaluate();
    assert.deepEqual(told.at(-1), [true, '1 at work']);
    setAwakeMode(db, 'never');
    k.evaluate();
    assert.deepEqual(told.at(-1), [false, 'the setting is Never']);
    assert.equal(k.state().awake, false);

    // While agents work: a run due soon does not keep it awake; work does.
    setAwakeMode(db, 'working');
    lives.set('s1', live('idle'));
    task(db, { name: 'Soon', schedule: { kind: 'daily', time: '07:00' }, at: Date.now() + 60_000 });
    k.evaluate();
    assert.equal(told.at(-1)![0], false);
    assert.equal(k.state().next, undefined, 'no next run shown for this choice');
    setAwakeMode(db, 'tasks');
    k.evaluate();
    assert.deepEqual(told.at(-1)![0], true, 'the default keeps it awake for the run due in a minute');
    assert.match(told.at(-1)![1], /^Soon is due at /);
    assert.equal(k.state().next?.name, 'Soon');
    k.stop();
  });

  test('a run’s few minutes beginning keep it awake without a word from anywhere', async () => {
    const db = fresh();
    const told: boolean[] = [];
    const k = new KeepAwake({ db, lives: new Map() }, { on: true, debounceMs: 5, send: (on) => told.push(on) });
    task(db, { name: 'Report', schedule: { kind: 'daily', time: '07:00' }, at: Date.now() + AWAKE_LEAD + 1200 });
    k.evaluate();
    assert.deepEqual(told, [false]);
    await sleep(2500);
    assert.deepEqual(told, [false, true], 'its timer looked again as the few minutes began');
    k.stop();
  });

  test('a watcher due every few minutes keeps nothing awake', async () => {
    const db = fresh();
    const told: boolean[] = [];
    const k = new KeepAwake({ db, lives: new Map() }, { on: true, debounceMs: 5, send: (on) => told.push(on) });
    task(db, { name: 'Watch', schedule: { kind: 'watch', minutes: 1, watch: { kind: 'feed', url: 'https://example.com/feed' } }, at: Date.now() + 1000 });
    k.evaluate();
    await sleep(30);
    assert.deepEqual(told, [false]);
    k.stop();
  });

  test('outside a desktop app it does nothing', async () => {
    const db = fresh();
    const k = new KeepAwake({ db, lives: new Map([['s1', live('working')]]) });
    k.poke();
    await sleep(30);
    const st = k.state();
    assert.equal(st.available, false);
    assert.equal(st.awake, false, 'the Linux service keeps nothing awake');
    assert.equal(st.working, 1);
    k.stop();
  });

  test('over the message channel, as the desktop app hears it', async () => {
    const child = fork(fileURLToPath(import.meta.url), [], {
      env: { ...process.env, DATA_DIR: path.join(tmp, 'side'), HYDOR_TEST_SIDE: '1', HYDOR_DESKTOP: 'mac', HYDOR_DESKTOP_APP: path.join(tmp, 'Hydor.app') },
    });
    const got: { type: string; on?: boolean; why?: string; state?: { available: boolean; awake: boolean } }[] = [];
    child.on('message', (m: (typeof got)[number]) => got.push(m));
    const wait = async (test: () => boolean, what: string) => {
      for (let i = 0; i < 100 && !test(); i++) await sleep(50);
      assert.ok(test(), what);
    };
    try {
      await wait(() => got.some((m) => m.type === 'awake'), 'the first word as the server starts');
      assert.deepEqual(got.filter((m) => m.type === 'awake'), [{ type: 'awake', on: false, why: 'nothing needs it' }]);
      child.send({ do: 'work' });
      await wait(() => got.filter((m) => m.type === 'awake').length === 2, 'awake once a session works');
      assert.deepEqual(got.filter((m) => m.type === 'awake').at(-1), { type: 'awake', on: true, why: '1 at work' });
      child.send({ do: 'state' });
      await wait(() => got.some((m) => m.type === 'state'), 'its state');
      const st = got.find((m) => m.type === 'state')!.state!;
      assert.deepEqual({ available: st.available, awake: st.awake }, { available: true, awake: true }, 'Settings says so');
      child.send({ do: 'rest' });
      await wait(() => got.filter((m) => m.type === 'awake').length === 3, 'let go once it rests');
      assert.deepEqual(got.filter((m) => m.type === 'awake').at(-1), { type: 'awake', on: false, why: 'nothing needs it' });
    } finally {
      child.send({ do: 'quit' });
    }
  });

  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}\n${(e as Error).stack}`);
    }
  }
  console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}
