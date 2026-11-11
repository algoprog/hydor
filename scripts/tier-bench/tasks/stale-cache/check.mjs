// Hidden checker for stale-cache. Run: node check.mjs <workdir>
// Every case drives src/profiles.mjs and src/pages.mjs against a scripted fake database, in a child process of its
// own (so a hang or a crash fails that case alone): each database call stays pending until the case resolves or
// rejects it, and the clock is a variable. Nothing depends on real time.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const childMode = args[0] === '--case';
if (!childMode && !args[0]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(childMode ? args[2] : args[0]);

// A small seeded PRNG (mulberry32).
function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), chance: (p) => next() < p };
}

const macrotask = () => new Promise((resolve) => setImmediate(resolve));
// Lets every chain of promises that can run, run: they all finish between two macrotasks.
async function flush(rounds = 3) {
  for (let i = 0; i < rounds; i++) await macrotask();
}

// Watches a promise: its state is read later, so that a promise that never settles is a state and not a hang.
function track(promise) {
  const t = { state: 'pending', value: undefined, error: undefined };
  promise.then(
    (value) => Object.assign(t, { state: 'ok', value }),
    (error) => Object.assign(t, { state: 'err', error }),
  );
  return t;
}
async function settle(t) {
  for (let i = 0; i < 30 && t.state === 'pending'; i++) await macrotask();
  return t;
}
// The value of a tracked promise; throws when it rejected or is still pending.
async function valueOf(t, what = 'the call') {
  await settle(t);
  if (t.state === 'pending') throw new Error(`${what} never settled`);
  if (t.state === 'err') throw new Error(`${what} rejected: ${t.error?.message ?? t.error}`);
  return t.value;
}

const ID = 'ann.lee@example.com';
const norm = (id) => String(id).trim().toLowerCase();

// The fake database, the clock and the profile cache under test, wired together.
async function makeEnv({ ttlMs = 1000, users = { [ID]: 'Ann v1' } } = {}) {
  const { createProfiles } = await import(pathToFileURL(path.join(dir, 'src/profiles.mjs')).href);
  const { renderProfilePage } = await import(pathToFileURL(path.join(dir, 'src/pages.mjs')).href);
  const store = new Map();
  const calls = [];
  const env = { store, calls, clock: { t: 0 }, auto: false };
  for (const [id, name] of Object.entries(users)) store.set(norm(id), { email: norm(id), name, bio: `About ${name}` });

  function newCall(kind, id, extra) {
    const c = { kind, id, key: norm(id), state: 'pending', ...extra };
    c.promise = new Promise((resolve, reject) => {
      c.resolve = resolve;
      c.reject = reject;
    });
    // A call finishes with what a database would answer: a read with the profile as it was when it began.
    c.ok = () => {
      if (c.state !== 'pending') return;
      c.state = 'done';
      if (kind === 'save') store.set(c.key, structuredClone(c.profile));
      c.resolve(kind === 'get' ? structuredClone(c.snapshot) : undefined);
    };
    c.fail = (error = new Error('db hiccup')) => {
      if (c.state !== 'pending') return;
      c.state = 'failed';
      c.reject(error);
    };
    c.promise.catch(() => {});
    calls.push(c);
    if (env.auto) Promise.resolve().then(c.ok);
    return c.promise;
  }
  env.db = {
    getProfile: (id) => newCall('get', id, { snapshot: structuredClone(store.get(norm(id)) ?? null) }),
    saveProfile: (id, profile) => newCall('save', id, { profile: structuredClone(profile) }),
  };
  env.profiles = createProfiles({ db: env.db, ttlMs, now: () => env.clock.t });
  env.render = (viewer, id) => renderProfilePage(env.profiles, viewer, id);

  env.put = (id, name) => store.set(norm(id), { email: norm(id), name, bio: `About ${name}` });
  env.mark = () => calls.length;
  env.reads = (id, since = 0) => calls.slice(since).filter((c) => c.kind === 'get' && c.key === norm(id));
  env.pending = (id, since = 0) => env.reads(id, since).filter((c) => c.state === 'pending');
  env.get = (id) => track(env.profiles.get(id));
  env.name = async (t, what) => (await valueOf(t, what))?.name;
  // Lets every read of `id` that began since `since` and is still pending finish.
  env.finishReads = async (id, since = 0) => {
    await flush();
    for (const c of env.pending(id, since)) c.ok();
    await flush();
  };
  // Runs update() to the end while the database answers at once. `release` lists reads that are still pending: an
  // update that waits for them (a design of its own) is let through by finishing them.
  env.update = async (id, changes, release = []) => {
    env.auto = true;
    const t = track(env.profiles.update(id, changes));
    await flush();
    if (t.state === 'pending') for (const c of release) c.ok();
    await settle(t);
    env.auto = false;
    if (t.state !== 'ok') throw new Error(`update ${t.state === 'err' ? `rejected: ${t.error?.message}` : 'never settled'}`);
    return t.value;
  };
  // Starts an update and hands over its read and its save, which stay pending until the case lets them finish.
  env.startUpdate = async (id, changes) => {
    const since = env.mark();
    const t = track(env.profiles.update(id, changes));
    await flush();
    const read = env.reads(id, since).find((c) => c.state === 'pending');
    if (!read) throw new Error('update made no read of the profile');
    read.ok();
    await flush();
    const save = calls.slice(since).find((c) => c.kind === 'save' && c.state === 'pending');
    if (!save) throw new Error('update made no save');
    return { t, save, since };
  };
  return env;
}

const NAME = (n) => `Ann v${n}`;
const countYou = (html) => (html.match(/\(you\)/g) ?? []).length;

// Every case: a name and a function that throws when the case fails.
const CASES = [];
const add = (name, run) => CASES.push({ name, run });

// ---- Behaviour that must stay as it is ----

add('20 concurrent gets of one profile make one read and all get it', async () => {
  const e = await makeEnv();
  const gets = Array.from({ length: 20 }, () => e.get(ID));
  await flush();
  assert.equal(e.reads(ID).length, 1, 'reads');
  await e.finishReads(ID);
  for (const g of gets) assert.equal(await e.name(g), NAME(1));
  assert.equal(e.profiles.stats().loads, 1, 'stats().loads');
});

add('a get within the TTL is served from the cache', async () => {
  const e = await makeEnv();
  const first = e.get(ID);
  await e.finishReads(ID);
  await valueOf(first);
  e.clock.t = 999;
  e.put(ID, NAME(2));
  assert.equal(await e.name(e.get(ID)), NAME(1));
  assert.equal(e.reads(ID).length, 1, 'reads');
  assert.equal(e.profiles.stats().hits, 1, 'stats().hits');
});

add('after the TTL one new read is made and shared', async () => {
  const e = await makeEnv();
  e.get(ID);
  await e.finishReads(ID);
  e.clock.t = 1001;
  e.put(ID, NAME(2));
  const mark = e.mark();
  const gets = Array.from({ length: 5 }, () => e.get(ID));
  await e.finishReads(ID, mark);
  for (const g of gets) assert.equal(await e.name(g), NAME(2));
  assert.equal(e.reads(ID, mark).length, 1, 'reads after the TTL');
});

add('different profiles are cached independently', async () => {
  const e = await makeEnv({ users: { 'a@x.com': 'A', 'b@x.com': 'B' } });
  const a = e.get('a@x.com');
  const b = e.get('b@x.com');
  await flush();
  assert.equal(e.reads('a@x.com').length, 1);
  assert.equal(e.reads('b@x.com').length, 1);
  e.reads('b@x.com')[0].ok();
  assert.equal(await e.name(b), 'B');
  assert.equal(a.state, 'pending', 'the read of a is still pending');
  e.reads('a@x.com')[0].ok();
  assert.equal(await e.name(a), 'A');
});

add('update, then get with nothing under way, shows the new profile', async () => {
  const e = await makeEnv();
  e.get(ID);
  await e.finishReads(ID);
  const saved = await e.update(ID, { name: NAME(2) });
  assert.equal(saved.name, NAME(2), 'update resolves with the new profile');
  assert.equal(saved.bio, `About ${NAME(1)}`, 'fields not in the changes are kept');
  assert.equal(saved.email, ID);
  assert.equal(e.store.get(ID).name, NAME(2), 'saved in the database');
  const mark = e.mark();
  const t = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(2));
});

add('update of a profile that was never read, then get', async () => {
  const e = await makeEnv();
  await e.update(ID, { name: NAME(2) });
  const mark = e.mark();
  const t = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(2));
  assert.ok(e.reads(ID, mark).length <= 1);
});

add('spellings of one address share one cache entry', async () => {
  const e = await makeEnv({ users: { 'ann.lee@example.com': 'Ann v1' } });
  const spellings = ['Ann.Lee@Example.com', ' ann.lee@example.com', 'ANN.LEE@EXAMPLE.COM  '];
  const gets = spellings.map((s) => e.get(s));
  await flush();
  assert.equal(e.reads(ID).length, 1, 'reads');
  await e.finishReads(ID);
  for (const g of gets) assert.equal(await e.name(g), NAME(1));
  const mark = e.mark();
  assert.equal(await e.name(e.get('  Ann.Lee@example.com')), NAME(1));
  assert.equal(e.reads(ID, mark).length, 0, 'a later spelling is a hit');
});

// ---- Cause 1: a read in flight when an update saves ----

add('update while a read is in flight: a get after the old read ends sees the new name', async () => {
  const e = await makeEnv();
  const a = e.get(ID);
  await flush();
  const readA = e.reads(ID)[0];
  await e.update(ID, { name: NAME(2) }, [readA]);
  readA.ok();
  await flush();
  const mark = e.mark();
  const b = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(b), NAME(2));
  assert.ok(e.reads(ID, mark).length <= 1, 'at most one more read');
  await settle(a);
});

add('an old read that ends after a newer one does not overwrite the cache', async () => {
  const e = await makeEnv();
  e.get(ID);
  await flush();
  const readA = e.reads(ID)[0];
  await e.update(ID, { name: NAME(2) }, [readA]);
  const mark = e.mark();
  const b = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(b), NAME(2));
  readA.ok();
  await flush();
  const mark2 = e.mark();
  const c = e.get(ID);
  assert.equal(await e.name(c), NAME(2));
  assert.equal(e.reads(ID, mark2).length, 0, 'no read: the newer profile is cached');
});

add('a get after the update never gets the old profile from a read still pending', async () => {
  const e = await makeEnv();
  e.get(ID);
  await flush();
  const readA = e.reads(ID)[0];
  await e.update(ID, { name: NAME(2) }, [readA]);
  const mark = e.mark();
  const b = e.get(ID);
  await flush();
  for (const c of e.pending(ID, mark)) c.ok();
  await settle(b);
  // A get that waits for the old read to end and then reads again is slower but right: the old read ends here.
  if (b.state === 'pending') {
    readA.ok();
    await e.finishReads(ID, mark);
  }
  assert.equal(await e.name(b), NAME(2));
  assert.ok(e.reads(ID, mark).length <= 1);
});

add('a read that ends while the update is saving does not leave the old profile cached', async () => {
  const e = await makeEnv();
  const a = e.get(ID);
  await flush();
  const readA = e.reads(ID)[0];
  const u = await e.startUpdate(ID, { name: NAME(2) });
  readA.ok();
  await flush();
  u.save.ok();
  await valueOf(u.t, 'update');
  const mark = e.mark();
  const b = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(b), NAME(2));
  assert.ok(e.reads(ID, mark).length <= 1);
  await settle(a);
});

add('a read that began while the update was saving and ends after it is not cached', async () => {
  const e = await makeEnv();
  const u = await e.startUpdate(ID, { name: NAME(2) });
  const x = e.get(ID);
  await flush();
  const readX = e.reads(ID, u.since).find((c) => c.state === 'pending');
  assert.ok(readX, 'the get started a read');
  u.save.ok();
  await flush();
  if (u.t.state === 'pending') readX.ok();
  await valueOf(u.t, 'update');
  readX.ok();
  await flush();
  const mark = e.mark();
  const b = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(b), NAME(2));
  assert.ok(e.reads(ID, mark).length <= 1);
  await settle(x);
});

add('an update affects only its own profile', async () => {
  const e = await makeEnv({ users: { 'x@x.com': 'X', 'y@x.com': 'Y' } });
  const x = e.get('x@x.com');
  const y = e.get('y@x.com');
  await flush();
  const readY = e.reads('y@x.com')[0];
  await e.update('y@x.com', { name: 'Y2' }, [readY]);
  e.reads('x@x.com')[0].ok();
  readY.ok();
  await flush();
  assert.equal(await e.name(x), 'X');
  const mark = e.mark();
  assert.equal(await e.name(e.get('x@x.com')), 'X');
  assert.equal(e.reads('x@x.com', mark).length, 0, 'x is still cached');
  const gy = e.get('y@x.com');
  await e.finishReads('y@x.com', mark);
  assert.equal(await e.name(gy), 'Y2');
  await settle(y);
});

add('two updates in a row with a read in flight across both', async () => {
  const e = await makeEnv();
  e.get(ID);
  await flush();
  const readA = e.reads(ID)[0];
  await e.update(ID, { name: NAME(2) }, [readA]);
  await e.update(ID, { name: NAME(3) }, [readA]);
  readA.ok();
  await flush();
  const mark = e.mark();
  const b = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(b), NAME(3));
});

add('an update whose save fails: gets still work and show only what the database has', async () => {
  const e = await makeEnv();
  e.get(ID);
  await e.finishReads(ID);
  const u = await e.startUpdate(ID, { name: NAME(2) });
  u.save.fail(new Error('save failed'));
  await settle(u.t);
  assert.equal(u.t.state, 'err', 'update rejects when the save fails');
  let mark = e.mark();
  let t = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(1), 'the database still has the old name');
  await e.update(ID, { name: NAME(3) });
  mark = e.mark();
  t = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(3));
});

add('an update with another spelling of the address, a read in flight under the first', async () => {
  const e = await makeEnv();
  e.get('Ann.Lee@Example.com');
  await flush();
  const readA = e.reads(ID)[0];
  await e.update(' ann.lee@example.com ', { name: NAME(2) }, [readA]);
  readA.ok();
  await flush();
  const mark = e.mark();
  const b = e.get('ANN.LEE@EXAMPLE.COM');
  await e.finishReads(ID, mark);
  assert.equal(await e.name(b), NAME(2));
});

add('an old read that fails does not break the sharing of a newer read', async () => {
  const e = await makeEnv();
  const a = e.get(ID);
  await flush();
  const readA = e.reads(ID)[0];
  await e.update(ID, { name: NAME(2) }, [readA]);
  const mark = e.mark();
  const b = e.get(ID);
  await flush();
  readA.fail();
  await flush();
  const c = e.get(ID);
  await flush();
  assert.equal(e.reads(ID, mark).length, 1, 'b and c share one read');
  await e.finishReads(ID, mark);
  assert.equal(await e.name(b), NAME(2));
  assert.equal(await e.name(c), NAME(2));
  await settle(a);
});

add('an old read that ends does not break the sharing of a newer read', async () => {
  const e = await makeEnv();
  const a = e.get(ID);
  await flush();
  const readA = e.reads(ID)[0];
  await e.update(ID, { name: NAME(2) }, [readA]);
  const mark = e.mark();
  const b = e.get(ID);
  await flush();
  readA.ok();
  await flush();
  const c = e.get(ID);
  await flush();
  assert.equal(e.reads(ID, mark).length, 1, 'b and c share one read');
  await e.finishReads(ID, mark);
  assert.equal(await e.name(b), NAME(2));
  assert.equal(await e.name(c), NAME(2));
  const mark2 = e.mark();
  assert.equal(await e.name(e.get(ID)), NAME(2));
  assert.equal(e.reads(ID, mark2).length, 0, 'and it is cached');
  await settle(a);
});

// ---- Cause 2: the cache key ----

add('get with capitals, update lower case, get with spaces and capitals', async () => {
  const e = await makeEnv();
  const first = e.get('Ann.Lee@Example.com');
  await e.finishReads(ID);
  await valueOf(first);
  await e.update('ann.lee@example.com', { name: NAME(2) });
  const mark = e.mark();
  const t = e.get(' ANN.LEE@example.com ');
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(2));
});

add('get lower case, update with spaces and capitals, get lower case', async () => {
  const e = await makeEnv();
  e.get(ID);
  await e.finishReads(ID);
  await e.update('  Ann.Lee@EXAMPLE.com', { name: NAME(2) });
  const mark = e.mark();
  const t = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(2));
});

add('get with a leading space, update without it', async () => {
  const e = await makeEnv();
  e.get(' ann.lee@example.com');
  await e.finishReads(ID);
  await e.update('ann.lee@example.com', { name: NAME(2) });
  const mark = e.mark();
  const t = e.get('ann.lee@example.com');
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(2));
});

add('get and update with the same capitals, then every other spelling', async () => {
  const e = await makeEnv();
  e.get('ANN.LEE@EXAMPLE.COM');
  await e.finishReads(ID);
  await e.update('ANN.LEE@EXAMPLE.COM', { name: NAME(2) });
  for (const spelling of [ID, 'Ann.Lee@Example.com', ' ann.lee@example.com\t']) {
    const mark = e.mark();
    const t = e.get(spelling);
    await e.finishReads(ID, mark);
    assert.equal(await e.name(t), NAME(2), `spelling ${JSON.stringify(spelling)}`);
  }
});

add('a second update with another spelling shows the second name', async () => {
  const e = await makeEnv();
  e.get(ID);
  await e.finishReads(ID);
  await e.update(ID, { name: NAME(2) });
  const t2 = e.get(ID);
  await e.finishReads(ID);
  await valueOf(t2);
  await e.update('Ann.Lee@Example.COM ', { name: NAME(3) });
  const mark = e.mark();
  const t = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(3));
});

// ---- Cause 3: a failed read ----

add('a read that fails: that get rejects, the next get reads again and succeeds', async () => {
  const e = await makeEnv();
  const a = e.get(ID);
  await flush();
  e.reads(ID)[0].fail();
  await settle(a);
  assert.equal(a.state, 'err', 'the get rejects');
  const mark = e.mark();
  const b = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(e.reads(ID, mark).length, 1, 'a new read');
  assert.equal(await e.name(b), NAME(1));
});

add('three gets sharing a failing read all reject, and the next get succeeds', async () => {
  const e = await makeEnv();
  const gets = [e.get(ID), e.get(ID), e.get(ID)];
  await flush();
  assert.equal(e.reads(ID).length, 1);
  e.reads(ID)[0].fail(new Error('timeout'));
  for (const g of gets) assert.equal((await settle(g)).state, 'err');
  const mark = e.mark();
  const next = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(next), NAME(1));
});

add('after a failure the profile is read once and then cached', async () => {
  const e = await makeEnv();
  e.get(ID);
  await flush();
  e.reads(ID)[0].fail();
  await flush();
  const mark = e.mark();
  const b = e.get(ID);
  await e.finishReads(ID, mark);
  await valueOf(b);
  const c = e.get(ID);
  assert.equal(await e.name(c), NAME(1));
  assert.equal(e.reads(ID, mark).length, 1, 'one read since the failure');
});

add('a failing read of one profile does not affect another', async () => {
  const e = await makeEnv({ users: { 'x@x.com': 'X', 'y@x.com': 'Y' } });
  const x = e.get('x@x.com');
  const y = e.get('y@x.com');
  await flush();
  e.reads('x@x.com')[0].fail();
  e.reads('y@x.com')[0].ok();
  assert.equal((await settle(x)).state, 'err');
  assert.equal(await e.name(y), 'Y');
});

add('after a failed read an update and a get show the new profile', async () => {
  const e = await makeEnv();
  const a = e.get(ID);
  await flush();
  e.reads(ID)[0].fail();
  await settle(a);
  await e.update(ID, { name: NAME(2) });
  const mark = e.mark();
  const t = e.get(ID);
  await e.finishReads(ID, mark);
  assert.equal(await e.name(t), NAME(2));
});

// ---- Cause 4: the page changes the cached profile ----

add('your own page shows (you) once, however often it is shown', async () => {
  const e = await makeEnv();
  e.auto = true;
  for (let i = 0; i < 3; i++) {
    const html = await valueOf(track(e.render(ID, ID)), 'the page');
    assert.equal(countYou(html), 1, `view ${i + 1}: ${html}`);
    assert.match(html, /<h1>Ann v1 \(you\)<\/h1>/);
  }
});

add('showing your own page leaves the cached profile as it was', async () => {
  const e = await makeEnv();
  e.auto = true;
  await valueOf(track(e.render(ID, ID)), 'the page');
  await valueOf(track(e.render(ID, ID)), 'the page');
  assert.equal(await e.name(e.get(ID)), NAME(1));
  assert.equal(e.reads(ID).length, 1, 'the profile is still read once');
});

add("another viewer's page has no (you), also after the owner looked at theirs", async () => {
  const e = await makeEnv();
  e.auto = true;
  await valueOf(track(e.render(ID, ID)), 'the page');
  const html = await valueOf(track(e.render('bob@example.com', ID)), 'the page');
  assert.equal(countYou(html), 0, html);
  assert.match(html, /<h1>Ann v1<\/h1>/);
});

add('pages shown at the same time from one read: (you) only on your own', async () => {
  const e = await makeEnv();
  const pages = [e.render(ID, ID), e.render('bob@example.com', ID), e.render(ID, ID), e.render(undefined, ID)].map(track);
  await flush();
  assert.equal(e.reads(ID).length, 1, 'one read');
  await e.finishReads(ID);
  const html = [];
  for (const p of pages) html.push(await valueOf(p, 'the page'));
  assert.deepEqual(html.map(countYou), [1, 0, 1, 0]);
});

add('the viewer is recognised however their address is written', async () => {
  const e = await makeEnv();
  e.auto = true;
  for (const viewer of [' ANN.LEE@Example.com ', 'Ann.Lee@example.com']) {
    const html = await valueOf(track(e.render(viewer, ID)), 'the page');
    assert.equal(countYou(html), 1, `viewer ${JSON.stringify(viewer)}`);
  }
});

add('the page is the same HTML as before: escaping, bio and a missing profile', async () => {
  const e = await makeEnv();
  e.store.set(ID, { email: ID, name: 'Ann <Lee> & Co', bio: 'Says "hi"' });
  e.auto = true;
  const other = await valueOf(track(e.render('bob@example.com', ID)), 'the page');
  assert.equal(other, '<article><h1>Ann &lt;Lee&gt; &amp; Co</h1>\n<p>Says &quot;hi&quot;</p></article>');
  const own = await valueOf(track(e.render(ID, ID)), 'the page');
  assert.equal(own, '<article><h1>Ann &lt;Lee&gt; &amp; Co (you)</h1>\n<p>Says &quot;hi&quot;</p></article>');
  const none = await valueOf(track(e.render(ID, 'nobody@example.com')), 'the page');
  assert.equal(none, '<h1>No such profile</h1>');
});

add('after a name change the page shows the new name, with (you) once', async () => {
  const e = await makeEnv();
  e.auto = true;
  await valueOf(track(e.render(ID, ID)), 'the page');
  await e.update(ID, { name: NAME(2) });
  e.auto = true;
  const html = await valueOf(track(e.render(ID, ID)), 'the page');
  assert.match(html, /<h1>Ann v2 \(you\)<\/h1>/);
  const other = await valueOf(track(e.render('bob@example.com', ID)), 'the page');
  assert.match(other, /<h1>Ann v2<\/h1>/);
});

// ---- The database must not do more work ----

add('steady concurrent reads: at most one read per profile per TTL', async () => {
  const ids = ['a@x.com', 'b@x.com', 'c@x.com'];
  const e = await makeEnv({ users: Object.fromEntries(ids.map((id) => [id, 'n0'])) });
  for (let w = 0; w < 5; w++) {
    e.clock.t = w * 1001;
    for (const id of ids) e.put(id, `n${w}`);
    for (const offset of [0, 400, 800]) {
      e.clock.t = w * 1001 + offset;
      const gets = ids.flatMap((id) => Array.from({ length: 10 }, () => e.get(id)));
      await flush();
      for (const id of ids) await e.finishReads(id);
      for (const g of gets) assert.equal(await e.name(g), `n${w}`, `window ${w}`);
    }
  }
  for (const id of ids) assert.ok(e.reads(id).length <= 5, `${id}: ${e.reads(id).length} reads in 5 TTLs`);
});

add('after an update a burst of 10 concurrent gets makes one read, then it is cached', async () => {
  const e = await makeEnv();
  e.get(ID);
  await e.finishReads(ID);
  await e.update(ID, { name: NAME(2) });
  const mark = e.mark();
  const gets = Array.from({ length: 10 }, () => e.get(ID));
  await flush();
  assert.ok(e.reads(ID, mark).length <= 1, `${e.reads(ID, mark).length} reads for the burst`);
  await e.finishReads(ID, mark);
  for (const g of gets) assert.equal(await e.name(g), NAME(2));
  const mark2 = e.mark();
  assert.equal(await e.name(e.get(ID)), NAME(2));
  assert.equal(e.reads(ID, mark2).length, 0, 'cached again');
});

add('an update of one profile does not make others be read again', async () => {
  const e = await makeEnv({ users: { 'x@x.com': 'X', 'y@x.com': 'Y' } });
  e.get('x@x.com');
  e.get('y@x.com');
  await e.finishReads('x@x.com');
  await e.finishReads('y@x.com');
  await e.update('x@x.com', { name: 'X2' });
  const mark = e.mark();
  assert.equal(await e.name(e.get('y@x.com')), 'Y');
  assert.equal(e.reads('y@x.com', mark).length, 0, 'y is still cached');
});

add('300 random gets within one TTL: every profile is read at most once', async () => {
  const r = prng(7);
  const ids = ['a@x.com', 'b@x.com', 'c@x.com', 'D@x.com', ' e@x.com'];
  const e = await makeEnv({ users: Object.fromEntries(ids.map((id) => [id, `n-${norm(id)}`])) });
  const gets = [];
  for (let i = 0; i < 300; i++) {
    e.clock.t = r.int(0, 900);
    const id = ids[r.int(0, ids.length - 1)];
    gets.push({ id, t: e.get(id) });
    if (r.chance(0.3)) {
      await flush();
      for (const id2 of ids) for (const c of e.pending(id2)) if (r.chance(0.5)) c.ok();
    }
  }
  for (const id of ids) await e.finishReads(id);
  for (const { id, t } of gets) assert.equal(await e.name(t), `n-${norm(id)}`);
  for (const id of ids) assert.ok(e.reads(id).length <= 1, `${norm(id)}: ${e.reads(id).length} reads`);
});

// ---- Random interleavings of gets, reads ending in any order and updates ----

// What must hold whatever the order: a get that starts after an update has finished never returns an older
// profile than that update saved, and between two updates the profile is read from the database at most once.
function fuzzCase(seed) {
  add(`random interleavings of gets, reads and updates (seed ${seed})`, async () => {
    const r = prng(seed);
    const ids = [ID, 'bob@example.com'];
    const spellings = (id) => [id, id.toUpperCase(), ` ${id} `];
    const e = await makeEnv({ ttlMs: 1e9, users: { [ids[0]]: NAME(1), [ids[1]]: NAME(1) } });
    const version = { [ids[0]]: 1, [ids[1]]: 1 };
    const stretchStart = { [ids[0]]: 0, [ids[1]]: 0 };
    const gets = [];
    // Reads begun by gets between the end of one update and the start of the next.
    const checkStretch = (id, end) => {
      const reads = e.calls.slice(stretchStart[id], end).filter((c) => c.kind === 'get' && c.key === id && !c.byUpdate);
      assert.ok(reads.length <= 1, `${id}: ${reads.length} reads between two updates`);
    };
    for (let step = 0; step < 100; step++) {
      const roll = r.next();
      const id = ids[r.int(0, 1)];
      if (roll < 0.4) {
        gets.push({ id, min: version[id], t: e.get(spellings(id)[r.int(0, 2)]) });
      } else if (roll < 0.62) {
        const pending = ids.flatMap((i) => e.pending(i));
        if (pending.length) pending[r.int(0, pending.length - 1)].ok();
      } else if (roll < 0.85) {
        await flush();
        checkStretch(id, e.mark());
        version[id]++;
        const before = e.mark();
        await e.update(spellings(id)[r.int(0, 2)], { name: NAME(version[id]) }, e.pending(id));
        for (const c of e.calls.slice(before)) c.byUpdate = true;
        stretchStart[id] = e.mark();
      }
      if (r.chance(0.5)) await flush(1);
    }
    for (const id of ids) {
      await flush();
      checkStretch(id, e.mark());
      await e.finishReads(id);
    }
    for (const { id, min, t } of gets) {
      const name = await e.name(t, `a get of ${id}`);
      assert.ok(Number(/v(\d+)$/.exec(name)[1]) >= min, `a get of ${id} started after update ${min} returned ${name}`);
    }
    for (const id of ids) {
      const mark = e.mark();
      const t = e.get(id);
      await e.finishReads(id, mark);
      assert.equal(await e.name(t), NAME(version[id]), `the last get of ${id}`);
    }
  });
}
for (const seed of [1, 2, 3, 4, 5]) fuzzCase(seed);

// ---- CAUSE.md (checked in the parent) ----
const CAUSE_CASE = 'CAUSE.md exists and says something';
CASES.push({
  name: CAUSE_CASE,
  run: async () => {
    const text = fs.readFileSync(path.join(dir, 'CAUSE.md'), 'utf8');
    assert.ok(text.trim().length >= 200, 'CAUSE.md is empty or has only a line or two');
  },
});

// ---- Runner ----

async function runChild(index) {
  const unhandled = [];
  process.on('unhandledRejection', (reason) => unhandled.push(reason));
  let result;
  try {
    await CASES[index].run();
    await flush();
    result = unhandled.length ? { ok: false, why: `unhandled rejection: ${unhandled[0]?.message ?? unhandled[0]}` } : { ok: true };
  } catch (error) {
    result = { ok: false, why: String(error?.message ?? error).slice(0, 600) };
  }
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (childMode) {
  await runChild(Number(args[1]));
} else {
  const failed = [];
  for (let i = 0; i < CASES.length; i++) {
    const { name } = CASES[i];
    let outcome;
    if (name === CAUSE_CASE) {
      try {
        await CASES[i].run();
        outcome = { ok: true };
      } catch (error) {
        outcome = { ok: false, why: error.code === 'ENOENT' ? 'no CAUSE.md' : error.message };
      }
    } else {
      const r = spawnSync(process.execPath, [self, '--case', String(i), dir], { encoding: 'utf8', timeout: 15000, cwd: dir });
      try {
        outcome = JSON.parse(r.stdout.trim().split('\n').pop());
      } catch {
        outcome = { ok: false, why: r.error ? `timed out or crashed: ${r.error.message}` : `crashed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(0, 3).join(' | ').slice(0, 400)}` };
      }
    }
    if (!outcome.ok) {
      failed.push(name);
      if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}\n  ${outcome.why}`);
    }
  }
  console.log(JSON.stringify({ passed: CASES.length - failed.length, total: CASES.length, failed }));
}
