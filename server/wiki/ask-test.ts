// Checks when a new session asks to build its project's memory first (server/wiki/ask.ts): every condition and every
// session that is never asked (scheduled runs, apps, subagents, pages, the arena…), a wiki that is not empty or has
// nothing to build from, a job running or a build run before, what the person said no to (a week for "Start without
// memory", for good for "Don't ask for this project"), and the cards the question and the build show.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/ask-test.ts && DATA_DIR=/tmp/hydor-test-ask node dist/dev/ask-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvSet, openDb } from '../db.ts';
import { createSpace, updateSpace } from '../spaces/index.ts';
import { askFor, askLater, askNever, askedNot, buildApi, cardOf, loadGates, offerOf, saveGates, SNOOZE_MS, startedByPerson, type Gate } from './ask.ts';
import type { BuildOffer } from './areas/build.ts';
import { claimJob, releaseJob, saveJob } from './areas/jobs.ts';
import { setWikiSettings } from './settings/settings.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-ask-')));
const db = openDb(path.join(temp, 'test.db'));
setWikiSettings(db, { enabled: true, hubPath: path.join(temp, 'hub'), projectWikis: 'hub' });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const folder = path.join(temp, 'shop');
fs.mkdirSync(folder);
const space = createSpace(db, { name: 'Shop API', folder });

const offer = (o: Partial<BuildOffer> = {}): BuildOffer => ({
  empty: true,
  counts: { sessions: 38, commits: 412, documents: 9, notes: 14, files: ['README.md', 'docs/'] },
  worth: true,
  essentials: 12,
  sources: 60,
  minutesEssentials: 4.6,
  minutesAll: 45,
  helper: { label: 'Automatic', priced: false },
  ...o,
});
let offered: BuildOffer | null = offer();
const asked: { space: string | null; exclude?: string }[] = [];
buildApi.offer = async (_db, sp, o) => {
  asked.push({ space: sp, exclude: o?.exclude });
  return offered;
};
const ask = (extra: Record<string, unknown> = {}, sp: string | null = space.id, now?: number) => askFor(db, { extra, space: sp, now });
const reset = () => {
  offered = offer();
  kvSet(db, 'memory.enabled', '1');
  db.prepare("delete from kv where k like 'wiki.ask.%' or k like 'wiki.job.%'").run();
  updateSpace(db, space.id, { wikiMemory: true });
};

test('it asks a person starting a session in a project with an empty wiki and something to build from', async () => {
  reset();
  const a = await ask();
  assert.ok(a);
  assert.equal(a!.space, space.id);
  assert.equal(a!.name, 'Shop API');
  assert.equal(a!.offer.counts.sessions, 38);
  assert.deepEqual(offerOf(a!.offer).minutes, 5, 'the essentials’ minutes, rounded');
});

test('a session a person did not start on the start page is never asked: scheduled runs, apps, subagents, pages, the arena…', async () => {
  reset();
  for (const k of ['automations', 'app', 'parent', 'arena', 'assistant', 'swarm', 'research', 'help', 'page', 'file', 'make', 'board', 'experiment', 'inbox', 'chat']) {
    assert.equal(await ask({ [k]: k === 'parent' ? 'claude:abcd1234' : { x: 1 } }), null, k);
    assert.equal(startedByPerson({ [k]: true }), false, k);
  }
  assert.equal(startedByPerson({ space: space.id, memory: true, capUsd: 3 }), true);
  assert.ok(await ask({ space: space.id, capUsd: 3 }), 'settings that say nothing of who started it do not stop it');
});

test('every condition of the project must hold', async () => {
  reset();
  assert.equal(await ask({}, null), null, 'no project: the shared wiki never asks');
  assert.equal(await ask({}, 'sp-gone'), null, 'a project that is gone');
  kvSet(db, 'memory.enabled', '0');
  assert.equal(await ask(), null, 'memory off');
  reset();
  assert.equal(await ask({ memory: false }), null, 'memory off for this session');
  assert.equal(await ask({ wikiEnabled: false }), null, 'wiki memory off for this chat');
  assert.equal(await ask({ confidential: true }), null, 'confidential');
  updateSpace(db, space.id, { wikiMemory: false });
  assert.equal(await ask(), null, 'wiki memory off for the project');
  reset();
  offered = offer({ empty: false });
  assert.equal(await ask(), null, 'the wiki has articles already');
  offered = offer({ worth: false });
  assert.equal(await ask(), null, 'nothing to build from');
  offered = null;
  assert.equal(await ask(), null, 'the offer says it is off');
  offered = offer();
  assert.ok(await ask(), 'and back on');
});

test('a job running, or a build run before, stops it', async () => {
  reset();
  assert.ok(claimJob(space.id));
  assert.equal(await ask(), null, 'a wiki job running');
  releaseJob(space.id);
  assert.ok(await ask());
  for (const state of ['done', 'failed', 'stopped'] as const) {
    saveJob(db, space.id, { kind: 'build', state, done: 3, total: 10, startedAt: 1 });
    assert.equal(await ask(), null, `a build that ${state}`);
  }
  saveJob(db, space.id, { kind: 'update', state: 'done', done: 1, total: 1, startedAt: 1 });
  assert.ok(await ask(), 'an update is not a build');
});

test('"Start without memory" keeps it away for a week; "Don\'t ask for this project" for good', async () => {
  reset();
  const t0 = 1_800_000_000_000;
  askLater(db, space.id, t0);
  assert.equal(askedNot(db, space.id, t0 + 1000), 'later');
  assert.equal(await ask({}, space.id, t0 + 1000), null);
  assert.equal(await ask({}, space.id, t0 + SNOOZE_MS - 1000), null, 'still not on the last day');
  assert.ok(await ask({}, space.id, t0 + SNOOZE_MS + 1000), 'a week on, it asks again');
  assert.equal(askedNot(db, space.id, t0 + SNOOZE_MS + 1000), null);
  askNever(db, space.id);
  assert.equal(await ask({}, space.id, t0 + 100 * SNOOZE_MS), null, 'never is for good');
  askLater(db, space.id, t0);
  assert.equal(askedNot(db, space.id, t0 + 100 * SNOOZE_MS), 'never', 'a later "Start without memory" does not undo it');
  const other = createSpace(db, { name: 'Other', folder: (() => { const f = path.join(temp, 'other'); fs.mkdirSync(f); return f; })() });
  assert.ok(await ask({}, other.id), 'another project is asked all the same');
});

test('the card: the question, the build, a build that failed', () => {
  const g: Gate = { state: 'asking', project: space.id, name: 'Shop API', ...offerOf(offer()), at: 5, text: 'Fix it', said: 'Fix it', images: [] };
  const q = cardOf(g);
  assert.equal(q.title, 'Build Shop API’s memory first?');
  assert.deepEqual(q.options.map((o) => o.id), ['build', 'start', 'never']);
  assert.equal(q.options[0].style, 'primary');
  assert.equal(q.memory?.state, 'asking');
  assert.equal(q.memory?.minutes, 5);
  assert.equal(q.memory?.counts.files.join(), 'README.md,docs/');
  const b = cardOf({ ...g, state: 'building' });
  assert.equal(b.title, 'Building Shop API’s memory');
  assert.deepEqual(b.options.map((o) => o.id), ['now', 'stop']);
  const f = cardOf({ ...g, state: 'failed', error: 'The helper failed' });
  assert.deepEqual(f.options.map((o) => o.id), ['retry', 'now']);
  assert.equal(f.memory?.error, 'The helper failed');
  assert.equal(q.id, b.id, 'one card for the whole wait, so the page keeps its place');
});

test('the sessions waiting are kept in the database and come back', () => {
  const g: Gate = { state: 'building', project: space.id, name: 'Shop API', ...offerOf(offer()), at: 5, text: 'Fix it', said: 'Fix it', images: [{ path: '/tmp/x.png', mediaType: 'image/png' }] };
  saveGates(db, new Map([['claude:abcd1234', g]]));
  const back = loadGates(db);
  assert.deepEqual(back.get('claude:abcd1234'), g);
  saveGates(db, new Map());
  assert.equal(loadGates(db).size, 0);
  kvSet(db, 'memory.ask.gates', 'not json');
  assert.equal(loadGates(db).size, 0, 'a broken record is nothing');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
    break;
  }
}
fs.rmSync(temp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit();
