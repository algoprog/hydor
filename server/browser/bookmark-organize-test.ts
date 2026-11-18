// Script tests for Organize with AI on bookmarks (bookmark-organize.ts), with a fake helper model that answers by reading the
// prompts: "Start over" and "Keep my folders" (what moves, what is made and removed, the order), a plan and answers that are
// not valid, batches, retries, a failed or stopped job changing nothing, bookmarks that changed meanwhile, Undo, what is sent
// to the model, and the routes.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/bookmark-organize-test.ts
//   DATA_DIR=/tmp/hydor-test-organize node dist/dev/bookmark-organize-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { BookmarkNode } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, openDb, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import type { helperJson } from '../helper.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-organize-test-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.CUDA_VISIBLE_DEVICES = '';
const { addBookmark, bookmarkRoutes, loadBookmarks, saveBookmarks, BOOKMARKS_KEY, MAX_BOOKMARKS } = await import('./bookmarks.ts');
const { allocate, applyOrganize, BATCH, checkPlan, look, organizeBookmarks, organizeRoutes, organizeSettled, organizeState, startOrganize, stopOrganize, undoOrganize } = await import('./bookmark-organize.ts');

type Ask = typeof helperJson;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

let dbs = 0;
const fresh = (): DB => openDb(path.join(home, `t${dbs++}.db`));

// ---- fixtures -------------------------------------------------------------------------------------------------------

/** "Title" or "Title@host": a bookmark (its address has a query and a fragment that must never be sent); {Name: [...]}: a folder. */
type Item = string | { [folder: string]: Item[] };
function build(tree: { bar?: Item[]; other?: Item[] }): BookmarkNode[] {
  const nodes: BookmarkNode[] = [];
  let n = 0;
  const walk = (items: Item[], parent: string) =>
    items.forEach((it, pos) => {
      const id = `bm_${n++}`;
      if (typeof it === 'string') {
        const [title, host = 'site.example'] = it.split('@');
        nodes.push({ id, title, url: `https://${host}/${title.toLowerCase().replace(/\W+/g, '-')}?token=SECRET#frag`, parent, pos, addedAt: 1000 + n });
      } else {
        const [name, kids] = Object.entries(it)[0];
        nodes.push({ id, title: name, parent, pos, addedAt: 1 });
        walk(kids, id);
      }
    });
  walk(tree.bar ?? [], 'bar');
  walk(tree.other ?? [], 'other');
  return nodes;
}

function seeded(tree: { bar?: Item[]; other?: Item[] } | BookmarkNode[]): DB {
  const db = fresh();
  saveBookmarks(db, Array.isArray(tree) ? tree : build(tree));
  return db;
}

type Shape = string | { [folder: string]: Shape[] };
function shape(nodes: BookmarkNode[], parent: string): Shape[] {
  return nodes
    .filter((n) => n.parent === parent)
    .sort((a, b) => a.pos - b.pos)
    .map((n) => (n.url === undefined ? { [n.title]: shape(nodes, n.id) } : n.title));
}
const now = (db: DB) => loadBookmarks(db);
const idOf = (db: DB, title: string) => now(db).find((n) => n.title === title)!.id;

interface SortRow {
  n: number;
  title: string;
  address: string;
  path: string;
}
interface Fold {
  id: string;
  path: string;
  about: string;
}
interface Fake extends Ask {
  calls: { kind: 'plan' | 'sort'; system: string; prompt: string; signal?: AbortSignal }[];
  sorts: () => number;
}

/** A model that plans with `plan` (given the plan's prompt and a way to find a folder's alias by its name) and files with `put`. */
function fake(o: {
  plan?: (c: { prompt: string; alias: (name: string) => string }) => unknown;
  put?: (r: SortRow, folders: Fold[]) => string | undefined;
  /** Runs before each sort answer (to wait, fail or change the bookmarks). */
  before?: (call: number, prompt: string) => Promise<void> | void;
}): Fake {
  const calls: Fake['calls'] = [];
  let sortCalls = 0;
  const ask = (async (_db: DB, q: { system: string; prompt: string; signal?: AbortSignal }) => {
    const sort = q.system.startsWith('You file');
    calls.push({ kind: sort ? 'sort' : 'plan', system: q.system, prompt: q.prompt, signal: q.signal });
    if (!sort) {
      const alias = (name: string) => {
        const line = (q.prompt.match(/<folders>\n([\s\S]*?)\n<\/folders>/)?.[1] ?? '').split('\n').find((l) => l.split(' | ')[1]?.split(' › ').pop() === name);
        assert.ok(line, `a folder named ${name} in the plan's prompt`);
        return line.split(' | ')[0];
      };
      return o.plan ? o.plan({ prompt: q.prompt, alias }) : { folders: [] };
    }
    const call = ++sortCalls;
    await o.before?.(call, q.prompt);
    const folders = (q.prompt.match(/<folders>\n([\s\S]*?)\n<\/folders>/)?.[1] ?? '').split('\n').map((l) => {
      const [id, p, about] = l.split(' | ');
      return { id, path: p, about };
    });
    const put: Record<string, string> = {};
    for (const l of (q.prompt.match(/<bookmarks>\n([\s\S]*?)\n<\/bookmarks>/)?.[1] ?? '').split('\n')) {
      const [n, title, address, inPath] = l.split(' | ');
      const to = o.put?.({ n: Number(n), title, address, path: inPath.replace(/^in: /, '') }, folders);
      if (to) put[n] = to;
    }
    return { put };
  }) as unknown as Fake;
  ask.calls = calls;
  ask.sorts = () => calls.filter((c) => c.kind === 'sort').length;
  return ask;
}

const byTitle = (m: Record<string, string>) => (r: SortRow) => m[r.title];

// ---- Start over -----------------------------------------------------------------------------------------------------

const START_TREE: { bar: Item[]; other: Item[] } = {
  bar: ['Pinned A@pin.a', 'Pinned B@pin.b', { Imported: ['Rust Book@rust', 'Cargo@rust', { Sub: ['Tokio@rust'] }, 'Cake@food', 'Pasta@food'] }, { 'Empty on bar': [] }],
  other: ['Loose1@x', { Old: ['Bread@food', 'Soup@food'] }, { 'Only folders': [{ Inner: ['Go Tour@go'] }] }],
};
const START_PLAN = {
  folders: [
    { key: 'f1', name: 'Programming', about: 'code and tools', parent: null },
    { key: 'f2', name: 'Rust', about: 'the Rust language', parent: 'f1' },
    { key: 'f3', name: 'Cooking', about: 'recipes', parent: null },
    { key: 'f4', name: 'Never used', about: 'nothing goes here', parent: null },
    { key: 'f5', name: 'Child of nothing', about: '', parent: 'f4' },
  ],
};
const START_PUT = byTitle({ 'Rust Book': 'f2', Cargo: 'f2', Tokio: 'f2', 'Go Tour': 'f1', Cake: 'f3', Pasta: 'f3', Bread: 'f3', Soup: 'f3' });

test('start over: every bookmark but the pinned bar links goes into new folders in Other bookmarks, old folders go', async () => {
  const db = seeded(START_TREE);
  const ask = fake({ plan: () => START_PLAN, put: START_PUT });
  const r = await organizeBookmarks(db, false, { ask, parallel: 1 });
  const nodes = now(db);
  assert.deepEqual(shape(nodes, 'bar'), ['Pinned A', 'Pinned B']);
  // New top-level folders first, by name; a new folder's subfolders, then its bookmarks in their old (depth-first) order.
  assert.deepEqual(shape(nodes, 'other'), [{ Cooking: ['Cake', 'Pasta', 'Bread', 'Soup'] }, { Programming: [{ Rust: ['Rust Book', 'Cargo', 'Tokio'] }, 'Go Tour'] }, 'Loose1']);
  assert.equal(nodes.filter((n) => n.url === undefined).length, 3, 'only the three new folders are left (none for the folders nothing went into)');
  assert.deepEqual({ moved: r.moved, made: r.made, removed: r.removed, left: r.left, total: r.total }, { moved: 8, made: 3, removed: 6, left: 1, total: 9 });
  // The pinned links are the very same nodes, untouched.
  for (const t of ['Pinned A', 'Pinned B']) assert.deepEqual(nodes.find((n) => n.title === t), r.before.find((n) => n.title === t));
  // Ids are fresh and unique, new folders have a date, and every folder's places run from 0.
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
  assert.ok(nodes.filter((n) => n.url === undefined).every((n) => n.addedAt >= r.startedAt));
  for (const p of ['bar', 'other', ...nodes.filter((n) => !n.url).map((n) => n.id)]) assert.deepEqual(nodes.filter((n) => n.parent === p).map((n) => n.pos).sort(), nodes.filter((n) => n.parent === p).map((_, i) => i));
});

test('start over: top-level folders sort by name with numbers in order, and come before what was in Other bookmarks', async () => {
  const db = seeded({ other: ['Stay@x', 'A1@x', 'A2@x', 'A3@x'] });
  const ask = fake({
    plan: () => ({ folders: [{ key: 'f1', name: 'Part 10', about: '' }, { key: 'f2', name: 'Part 9', about: '' }, { key: 'f3', name: 'part 2', about: '' }] }),
    put: byTitle({ A1: 'f1', A2: 'f2', A3: 'f3' }),
  });
  await organizeBookmarks(db, false, { ask });
  assert.deepEqual(shape(now(db), 'other'), [{ 'part 2': ['A3'] }, { 'Part 9': ['A2'] }, { 'Part 10': ['A1'] }, 'Stay']);
});

test('start over: a bookmark the model gave no folder keeps its folder, and so does that folder', async () => {
  const db = seeded(START_TREE);
  await organizeBookmarks(db, false, { ask: fake({ plan: () => START_PLAN, put: (r) => (r.title === 'Soup' ? undefined : START_PUT(r)) }) });
  assert.deepEqual(shape(now(db), 'other'), [{ Cooking: ['Cake', 'Pasta', 'Bread'] }, { Programming: [{ Rust: ['Rust Book', 'Cargo', 'Tokio'] }, 'Go Tour'] }, 'Loose1', { Old: ['Soup'] }]);
  const s = organizeState(db);
  assert.equal(s.left, 2);
});

test('start over: a plan with no usable folder fails and changes nothing', async () => {
  const db = seeded(START_TREE);
  const before = kvGet(db, BOOKMARKS_KEY);
  await assert.rejects(organizeBookmarks(db, false, { ask: fake({ plan: () => ({ folders: [{ key: 'x', name: '' }, { name: 'No key' }, 7] }) }) }), /did not suggest any folders/);
  assert.equal(kvGet(db, BOOKMARKS_KEY), before);
  assert.equal(organizeState(db).status, 'idle');
});

// ---- Keep my folders ------------------------------------------------------------------------------------------------

const KEEP_TREE: { bar: Item[]; other: Item[] } = {
  bar: [
    'Pin@pin',
    { Work: ['Jira@work', 'Wiki@work'] },
    { 'Imported from Google Chrome': [{ 'Bookmarks bar': ['Rust Book@rust', 'Cake@food'] }, { 'Other bookmarks': ['Pasta@food', { Recipes: ['Soup@food'] }] }, { 'Mobile bookmarks': ['Go Mobile@go'] }] },
    { 'Read later': [] },
  ],
  other: ['Loose Jira@work', 'Go Tour@go', 'Go Blog@go', 'Go Pkg@go', 'Unknown@zzz'],
};
const KEEP_PLAN = ({ alias }: { alias: (n: string) => string }) => ({
  loose: ['Imported from Google Chrome', 'Bookmarks bar', 'Other bookmarks', 'Mobile bookmarks'].map(alias),
  folders: [
    { key: 'f1', name: 'Go', about: 'the Go language', parent: null },
    { key: 'f2', name: 'Cooking', about: 'recipes', parent: null },
    { key: 'f3', name: 'Tickets', about: 'work tickets', parent: alias('Work') },
    { key: 'f4', name: 'Basics', about: 'learning Go', parent: 'f1' },
    { key: 'f5', name: 'Rust', about: 'the Rust language', parent: null },
    { key: 'f6', name: 'Empty new', about: 'nothing', parent: null },
    { key: 'f7', name: 'Empty child', about: 'nothing', parent: 'f6' },
  ],
});
const KEEP_PUT = byTitle({ 'Loose Jira': 'f3', 'Go Tour': 'f4', 'Go Blog': 'f4', 'Go Pkg': 'f1', 'Go Mobile': 'f1', Cake: 'f2', Pasta: 'f2', 'Rust Book': 'f5' });

test('keep my folders: yours stay as they are, loose bookmarks go to the folder that fits, new folders only when they hold something', async () => {
  const db = seeded(KEEP_TREE);
  const ask = fake({ plan: KEEP_PLAN, put: KEEP_PUT });
  const r = await organizeBookmarks(db, true, { ask, parallel: 1 });
  const nodes = now(db);
  assert.deepEqual(shape(nodes, 'bar'), [
    'Pin',
    { Work: ['Jira', 'Wiki', { Tickets: ['Loose Jira'] }] },
    { 'Imported from Google Chrome': [{ 'Other bookmarks': [{ Recipes: ['Soup'] }] }] },
    { 'Read later': [] },
  ]);
  // What was loose in Other bookmarks and no folder was given stays; the new top-level folders follow it, by name.
  assert.deepEqual(shape(nodes, 'other'), ['Unknown', { Cooking: ['Cake', 'Pasta'] }, { Go: [{ Basics: ['Go Tour', 'Go Blog'] }, 'Go Mobile', 'Go Pkg'] }, { Rust: ['Rust Book'] }]);
  assert.deepEqual({ moved: r.moved, made: r.made, removed: r.removed, left: r.left, total: r.total }, { moved: 8, made: 5, removed: 2, left: 1, total: 9 });
  // The folders of yours that were not loose are the same nodes, in the same places.
  for (const t of ['Work', 'Read later', 'Imported from Google Chrome']) assert.deepEqual(nodes.find((n) => n.title === t), r.before.find((n) => n.title === t));
  // Only the loose ones were asked about: Jira, Wiki and Soup are in folders that are not loose.
  const asked = fakeRows(ask);
  assert.deepEqual(asked.sort(), ['Cake', 'Go Blog', 'Go Mobile', 'Go Pkg', 'Go Tour', 'Loose Jira', 'Pasta', 'Rust Book', 'Unknown']);
});

const fakeRows = (ask: Fake) => ask.calls.filter((c) => c.kind === 'sort').flatMap((c) => (c.prompt.match(/<bookmarks>\n([\s\S]*?)\n<\/bookmarks>/)?.[1] ?? '').split('\n').map((l) => l.split(' | ')[1]));

test('keep my folders: your folders are offered as "(theirs)" with their paths, the new ones with what they are for', async () => {
  const db = seeded(KEEP_TREE);
  const ask = fake({ plan: KEEP_PLAN, put: KEEP_PUT });
  await organizeBookmarks(db, true, { ask });
  const folders = ask.calls.find((c) => c.kind === 'sort')!.prompt.match(/<folders>\n([\s\S]*?)\n<\/folders>/)![1].split('\n');
  assert.ok(folders.some((l) => /^u\d+ \| Bookmarks bar › Work \| \(theirs\)$/.test(l)));
  assert.ok(folders.some((l) => /^u\d+ \| Bookmarks bar › Imported from Google Chrome › Other bookmarks › Recipes \| \(theirs\)$/.test(l)), 'a folder inside a collecting folder is one of yours');
  assert.ok(!folders.some((l) => /› Mobile bookmarks \|/.test(l)), 'collecting folders are not targets');
  assert.ok(folders.includes('f1 | Other bookmarks › Go | the Go language'));
  assert.ok(folders.some((l) => /^f3 \| Bookmarks bar › Work › Tickets \| work tickets$/.test(l)));
  assert.ok(folders.includes('f4 | Other bookmarks › Go › Basics | learning Go'));
  const plan = ask.calls[0].prompt;
  assert.match(plan, /^u\d+ \| Bookmarks bar › Work \| 2 bookmarks, 0 folders$/m);
  assert.match(plan, /^u\d+ \| Bookmarks bar › Imported from Google Chrome \| 0 bookmarks, 3 folders$/m);
});

test('keep my folders: a collecting folder left with something in it stays, and an empty folder that is not flagged stays', async () => {
  const db = seeded(KEEP_TREE);
  // Cake has no folder: "Bookmarks bar" (the import's) stays with it. "Mobile bookmarks" is flagged and emptied: it goes.
  await organizeBookmarks(db, true, { ask: fake({ plan: KEEP_PLAN, put: (r) => (r.title === 'Cake' ? undefined : KEEP_PUT(r)) }) });
  const bar = shape(now(db), 'bar');
  assert.deepEqual(bar[2], { 'Imported from Google Chrome': [{ 'Bookmarks bar': ['Cake'] }, { 'Other bookmarks': [{ Recipes: ['Soup'] }] }] });
  assert.deepEqual(bar[3], { 'Read later': [] });
});

test('keep my folders: a collecting folder that was empty already is the person\'s, and stays', async () => {
  const db = seeded({ other: ['A@x', 'B@x', 'C@x', { Misc: [] }, { Unsorted: ['D@x'] }] });
  const ask = fake({ plan: ({ alias }) => ({ loose: [alias('Misc'), alias('Unsorted')], folders: [{ key: 'f1', name: 'Stuff', about: 'everything', parent: null }] }), put: () => 'f1' });
  const r = await organizeBookmarks(db, true, { ask });
  assert.deepEqual(shape(now(db), 'other'), [{ Misc: [] }, { Stuff: ['A', 'B', 'C', 'D'] }]);
  assert.deepEqual({ moved: r.moved, made: r.made, removed: r.removed }, { moved: 4, made: 1, removed: 1 }, 'Unsorted, emptied by the sorting, goes; Misc stays');
});

test('keep my folders: a model that finds nothing loose and nothing new finishes with nothing moved and no sorting calls', async () => {
  const db = seeded({ bar: [{ Work: ['A@x', 'B@x', 'C@x'] }] });
  const before = kvGet(db, BOOKMARKS_KEY);
  const ask = fake({ plan: () => ({ loose: [], folders: [] }) });
  const r = await organizeBookmarks(db, true, { ask });
  assert.equal(ask.calls.length, 1);
  assert.deepEqual({ moved: r.moved, made: r.made, removed: r.removed, total: r.total }, { moved: 0, made: 0, removed: 0, total: 0 });
  assert.equal(kvGet(db, BOOKMARKS_KEY), before);
  const s = organizeState(db);
  assert.equal(s.status, 'done');
  assert.equal(s.canUndo, false, 'nothing changed, so there is nothing to undo');
});

test('keep my folders: a new folder named like one of yours is that folder, and the model may say so by its key', async () => {
  const db = seeded({ bar: [{ Work: ['Jira@work'] }], other: ['W1@work', 'W2@work', 'W3@work'] });
  const ask = fake({ plan: () => ({ loose: [], folders: [{ key: 'f1', name: 'work', about: 'job' }, { key: 'f2', name: 'Plans', about: '', parent: 'f1' }] }), put: (r) => (r.title === 'W3' ? 'f2' : 'f1') });
  await organizeBookmarks(db, true, { ask });
  assert.deepEqual(shape(now(db), 'bar'), [{ Work: ['Jira', { Plans: ['W3'] }, 'W1', 'W2'] }]);
  assert.deepEqual(shape(now(db), 'other'), []);
});

// ---- what the model says that cannot be used ------------------------------------------------------------------------

test('the plan: bad keys, empty names, unknown parents, a third level, repeats and too many are left out', () => {
  const nodes = build({ bar: [{ Work: ['A@x'] }, { Dump: ['B@x'] }, 'Pin'], other: ['C@x'] });
  const c = look(nodes);
  const raw = {
    loose: ['u2', 'u99', 'f1', 7, 'u1 '],
    folders: [
      { key: 'f1', name: '  Top  ', about: 'x', parent: null },
      { key: 'f1', name: 'Duplicate key', parent: null },
      { key: 'g2', name: 'Bad key' },
      { key: 'f2', name: '   ' },
      { key: 'f3', name: 'Child', parent: 'f1' },
      { key: 'f4', name: 'Grandchild', parent: 'f3' },
      { key: 'f5', name: 'Orphan', parent: 'f99' },
      { key: 'f6', name: 'In theirs', parent: 'u1' },
      { key: 'f7', name: 'In a loose one', parent: 'u2' },
      { key: 'f8', name: 'Unknown alias', parent: 'u77' },
      { key: 'f9', name: 'TOP', parent: null },
      { key: 'f10', name: 'Weird parent', parent: 5 },
      { key: 'f11', name: 'x'.repeat(200) },
      'text',
      null,
    ],
  };
  const p = checkPlan(raw, c, true);
  assert.deepEqual([...p.flagged].sort(), [nodes[0].id, nodes[2].id].sort(), 'loose: only aliases of folders (u1 and u2)');
  assert.deepEqual(
    p.folders.map((f) => [f.key, f.name, f.parentKey, f.parentFolder === null ? null : nodes.find((n) => n.id === f.parentFolder)!.title]),
    [['f1', 'Top', null, null], ['f11', 'x'.repeat(60), null, null], ['f3', 'Child', 'f1', null]],
  );
  assert.equal(p.redirect.get('f9'), 'f1', 'a repeat of a name is the first');
  // "In theirs" (u1) is flagged as loose here, so it cannot be a parent either.
  const q = checkPlan({ folders: [{ key: 'f1', name: 'Top' }, { key: 'f2', name: 'Under', parent: 'f1' }] }, c, false);
  assert.deepEqual(q.folders.map((f) => f.key), ['f1', 'f2']);
  assert.deepEqual(checkPlan({ folders: [{ key: 'f1', name: 'Top' }, { key: 'f2', name: 'In theirs', parent: 'u1' }] }, c, false).folders.map((f) => f.key), ['f1'], 'start over has no aliases');
  assert.equal(checkPlan('nonsense', c, true).folders.length, 0);
  const many = Array.from({ length: 100 }, (_, i) => ({ key: `f${i + 1}`, name: `Folder ${i}` }));
  assert.equal(checkPlan({ folders: many }, c, false).folders.length, 60);
});

test('the sorting answers: unknown numbers, unknown folders and a folder left out of the plan are ignored', async () => {
  const db = seeded({ other: ['A@x', 'B@x', 'C@x', 'D@x'] });
  const ask: Ask = (async (_db: DB, q: { system: string }) =>
    q.system.startsWith('You file')
      ? { put: { 1: 'f1', 2: 'zz', 3: 'f2', 4: 'f1', 0: 'f1', 5: 'f1', 99: 'f1', x: 'f1', 6: 7 } }
      : { folders: [{ key: 'f1', name: 'Real', about: '' }, { key: 'f2', name: 'Deep', about: '', parent: 'f1' }, { key: 'f3', name: 'Too deep', parent: 'f2' }] }) as unknown as Ask;
  const r = await organizeBookmarks(db, false, { ask });
  // f2 is a real subfolder here (one level), so C goes in it; B (unknown folder "zz") stays.
  assert.deepEqual(shape(now(db), 'other'), [{ Real: [{ Deep: ['C'] }, 'A', 'D'] }, 'B']);
  assert.equal(r.left, 1);
});

// ---- batches --------------------------------------------------------------------------------------------------------

const many = (n: number): Item[] => Array.from({ length: n }, (_, i) => `Item ${i + 1}@host${i % 7}.example`);

test('batches of 150 in order, with progress after each', async () => {
  const db = seeded({ other: many(400) });
  const ask = fake({ plan: () => ({ folders: [{ key: 'f1', name: 'All', about: '' }] }), put: () => 'f1' });
  const progress: string[] = [];
  const r = await organizeBookmarks(db, false, { ask, parallel: 1, onProgress: (p) => progress.push(`${p.step} ${p.done}/${p.total}`) });
  assert.deepEqual(progress, ['plan 0/400', 'sort 0/400', 'sort 150/400', 'sort 300/400', 'sort 400/400']);
  assert.equal(ask.sorts(), 3);
  const sizes = ask.calls.filter((c) => c.kind === 'sort').map((c) => (c.prompt.match(/<bookmarks>\n([\s\S]*?)\n<\/bookmarks>/)![1].split('\n').length));
  assert.deepEqual(sizes, [150, 150, 100]);
  assert.equal(BATCH, 150);
  assert.equal(r.moved, 400);
  // Numbers restart at 1 in each batch, and the order of the old tree is kept.
  assert.ok(ask.calls[2].prompt.includes('\n1 | Item 151 |'));
  assert.deepEqual(shape(now(db), 'other')[0], { All: many(400).map((_, i) => `Item ${i + 1}`) });
});

test('at most three calls at once, and as many as the helper takes', async () => {
  const db = seeded({ other: many(1100) });
  let live = 0;
  let peak = 0;
  const ask = fake({
    plan: () => ({ folders: [{ key: 'f1', name: 'All', about: '' }] }),
    put: () => 'f1',
    before: async () => {
      peak = Math.max(peak, ++live);
      await new Promise((r) => setTimeout(r, 15));
      live--;
    },
  });
  const r = await organizeBookmarks(db, false, { ask });
  assert.equal(ask.sorts(), 8);
  assert.ok(peak >= 2 && peak <= 3, `peak ${peak}`);
  assert.equal(r.moved, 1100);
  peak = 0;
  await organizeBookmarks(seeded({ other: many(500) }), false, { ask: fake({ plan: () => ({ folders: [{ key: 'f1', name: 'All' }] }), put: () => 'f1', before: async () => { peak = Math.max(peak, ++live); await new Promise((r) => setTimeout(r, 10)); live--; } }), parallel: 1 });
  assert.equal(peak, 1);
});

test('the plan is sent at most 1500 lines, spread over the folders, at least 5 of each (or all it has)', () => {
  assert.deepEqual(allocate([3, 5, 10], 1500), [3, 5, 10]);
  const a = allocate([2000, 1000, 6, 3, 100], 1500);
  assert.equal(a.reduce((x, y) => x + y, 0) <= 1500, true);
  assert.deepEqual(a.slice(2, 4), [5, 3]);
  assert.ok(a[4] >= 5 && a[0] > a[1] && a[1] > a[4]);
  // Too many folders for 5 each: fewer from each, but still every folder.
  const b = allocate(Array(400).fill(10), 1500);
  assert.equal(b.reduce((x, y) => x + y, 0) <= 1500, true);
  assert.ok(b.every((x) => x >= 3));
  assert.equal(allocate(Array(3000).fill(2), 1500).reduce((x, y) => x + y, 0) <= 1500, true);
  const lines = (p: string) => p.split('\n').filter((l) => l.includes(' — ')).length;
  const nodes: BookmarkNode[] = [];
  for (let f = 0; f < 20; f++) {
    nodes.push({ id: `f${f}`, title: `Folder ${f}`, parent: 'other', pos: f, addedAt: 1 });
    for (let i = 0; i < 200; i++) nodes.push({ id: `b${f}_${i}`, title: `T${f}-${i}`, url: `https://h${f}.example/p${i}`, parent: `f${f}`, pos: i, addedAt: 1 });
  }
  const db = seeded(nodes);
  const ask = fake({ plan: () => ({ folders: [{ key: 'f1', name: 'All' }] }), put: () => 'f1' });
  return organizeBookmarks(db, false, { ask }).then(() => {
    const plan = ask.calls[0].prompt;
    assert.equal(lines(plan), 1500);
    assert.match(plan, /^4000 bookmarks in all; these 1500 are a sample\./);
    for (let f = 0; f < 20; f++) assert.ok(plan.includes(`## Other bookmarks › Folder ${f}\n`));
    assert.equal(ask.sorts(), Math.ceil(4000 / 150));
  });
});

// ---- failures change nothing ----------------------------------------------------------------------------------------

test('a failing batch is tried once more, then its bookmarks stay where they were', async () => {
  const db = seeded({ other: many(300) });
  const seen = new Map<string, number>();
  const ask = fake({
    plan: () => ({ folders: [{ key: 'f1', name: 'All', about: '' }] }),
    put: () => 'f1',
    before: (_n, prompt) => {
      const k = prompt;
      seen.set(k, (seen.get(k) ?? 0) + 1);
      // The first batch fails once (then answers); the second fails always.
      if (prompt.includes('\n1 | Item 1 |') && seen.get(k) === 1) throw new HttpError(502, 'busy');
      if (prompt.includes('\n1 | Item 151 |')) throw new HttpError(502, 'down');
    },
  });
  const r = await organizeBookmarks(db, false, { ask, parallel: 1 });
  assert.equal(ask.sorts(), 4);
  assert.equal(r.moved, 150);
  assert.equal(r.left, 150);
  const other = shape(now(db), 'other');
  assert.equal((other[0] as { All: string[] }).All.length, 150);
  assert.equal(other.length, 151);
});

test('an answer without a "put" counts as failed, and is asked again', async () => {
  const db = seeded({ other: many(10) });
  let n = 0;
  const ask: Ask = (async (_db: DB, q: { system: string }) => {
    if (!q.system.startsWith('You file')) return { folders: [{ key: 'f1', name: 'All' }] };
    return ++n === 1 ? { nothing: 1 } : { put: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 'f1'])) };
  }) as unknown as Ask;
  const r = await organizeBookmarks(db, false, { ask });
  assert.equal(n, 2);
  assert.equal(r.moved, 10);
});

test('when every batch fails the job fails with the first error and nothing changes', async () => {
  const db = seeded({ other: many(300) });
  const before = kvGet(db, BOOKMARKS_KEY);
  let n = 0;
  const ask = fake({ plan: () => ({ folders: [{ key: 'f1', name: 'All' }] }), put: () => 'f1', before: () => { throw new HttpError(502, `down ${++n}`); } });
  await assert.rejects(organizeBookmarks(db, false, { ask, parallel: 1 }), /down 2$/);
  assert.equal(kvGet(db, BOOKMARKS_KEY), before);
  assert.equal(kvGet(db, 'browser.bookmarks.organized'), undefined);
});

test('a plan that fails changes nothing', async () => {
  const db = seeded({ other: many(10) });
  const before = kvGet(db, BOOKMARKS_KEY);
  await assert.rejects(organizeBookmarks(db, true, { ask: (async () => { throw new HttpError(502, 'no model'); }) as unknown as Ask }), /no model/);
  assert.equal(kvGet(db, BOOKMARKS_KEY), before);
});

test('stopping a job changes nothing, and what the model answers afterwards is dropped', async () => {
  const db = seeded({ other: many(20) });
  const before = kvGet(db, BOOKMARKS_KEY);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const ask = fake({ plan: () => ({ folders: [{ key: 'f1', name: 'All' }] }), put: () => 'f1', before: () => gate });
  const s = startOrganize(db, false, ask);
  assert.equal(s.status, 'running');
  while (!ask.sorts()) await new Promise((r) => setTimeout(r, 5));
  assert.equal(organizeState(db).step, 'sort');
  assert.deepEqual(stopOrganize(db), { status: 'idle' });
  assert.equal(ask.calls.at(-1)!.signal?.aborted, true);
  release();
  await organizeSettled(db);
  assert.equal(kvGet(db, BOOKMARKS_KEY), before);
  assert.equal(organizeState(db).status, 'idle');
  assert.equal(kvGet(db, 'browser.bookmarks.organized'), undefined);
});

// ---- bookmarks that change while the model works --------------------------------------------------------------------

test('a bookmark deleted or moved by you meanwhile is skipped; one you added stays', async () => {
  const db = seeded(START_TREE);
  const ask = fake({
    plan: () => START_PLAN,
    put: START_PUT,
    before: () => {
      const nodes = now(db);
      // Cargo is deleted, Soup is moved to the bookmarks bar, a new bookmark goes into Old, and Imported is renamed.
      const kept = nodes.filter((n) => n.title !== 'Cargo');
      kept.find((n) => n.title === 'Soup')!.parent = 'bar';
      kept.push({ id: 'new1', title: 'Added', url: 'https://added.example/', parent: kept.find((n) => n.title === 'Old')!.id, pos: 9, addedAt: 5 });
      saveBookmarks(db, kept);
    },
  });
  const r = await organizeBookmarks(db, false, { ask });
  const nodes = now(db);
  assert.deepEqual(shape(nodes, 'bar'), ['Pinned A', 'Pinned B', 'Soup']);
  assert.deepEqual(shape(nodes, 'other'), [
    { Cooking: ['Cake', 'Pasta', 'Bread'] },
    { Programming: [{ Rust: ['Rust Book', 'Tokio'] }, 'Go Tour'] },
    'Loose1',
    { Old: ['Added'] },
  ]);
  assert.equal(r.moved, 6);
  assert.equal(r.left, 2, 'left: what was looked at, is still there and was not moved (Loose1 and Soup)');
});

test('a folder of yours that is gone puts the new folder in Other bookmarks', async () => {
  const db = seeded({ bar: [{ Work: ['Jira@work', 'Wiki@work'] }], other: ['T1@work', 'T2@work', 'T3@work'] });
  const ask = fake({
    plan: ({ alias }) => ({ loose: [], folders: [{ key: 'f1', name: 'Tickets', about: '', parent: alias('Work') }] }),
    put: () => 'f1',
    before: () => void saveBookmarks(db, now(db).filter((n) => n.parent !== idOf(db, 'Work') && n.title !== 'Work')),
  });
  await organizeBookmarks(db, true, { ask });
  assert.deepEqual(shape(now(db), 'other'), [{ Tickets: ['T1', 'T2', 'T3'] }]);
});

test('the result may not exceed the most bookmarks that fit', () => {
  const nodes: BookmarkNode[] = Array.from({ length: MAX_BOOKMARKS }, (_, i) => ({ id: `b${i}`, title: `T${i}`, url: `https://x.example/${i}`, parent: 'other', pos: i, addedAt: 1 }));
  const c = look(nodes);
  const plan = checkPlan({ folders: [{ key: 'f1', name: 'New' }] }, c, true);
  assert.throws(() => applyOrganize(nodes, c.scope, c, new Map([['b0', { key: 'f1' }]]), plan, true), (e: Error) => e instanceof HttpError && e.status === 400 && /more bookmarks and folders than fit/.test(e.message));
  // One more bookmark moved into a folder that is there needs no room.
  assert.equal(applyOrganize(nodes.slice(0, 5), look(nodes.slice(0, 5)).scope, look(nodes.slice(0, 5)), new Map(), plan, true).moved, 0);
});

// ---- Undo -----------------------------------------------------------------------------------------------------------

test('Undo puts the bookmarks back exactly, once; changed bookmarks refuse it', async () => {
  const db = seeded(START_TREE);
  const original = kvGet(db, BOOKMARKS_KEY);
  const ask = fake({ plan: () => START_PLAN, put: START_PUT });
  startOrganize(db, false, ask);
  await organizeSettled(db);
  let s = organizeState(db);
  assert.deepEqual({ status: s.status, moved: s.moved, made: s.made, removed: s.removed, left: s.left, total: s.total, canUndo: s.canUndo, keepFolders: s.keepFolders }, { status: 'done', moved: 8, made: 3, removed: 6, left: 1, total: 9, canUndo: true, keepFolders: false });
  assert.ok(s.finishedAt! >= s.startedAt!);
  const u = undoOrganize(db);
  assert.equal(kvGet(db, BOOKMARKS_KEY), original);
  assert.deepEqual(u.nodes, now(db));
  assert.equal(u.state.status, 'idle');
  assert.throws(() => undoOrganize(db), (e: Error) => e instanceof HttpError && e.status === 409 && e.message === 'There is nothing to undo');

  // Another change first: Undo is refused (and offered no more).
  startOrganize(db, false, ask);
  await organizeSettled(db);
  addBookmark(db, { title: 'Mine', url: 'https://mine.example/' });
  assert.equal(organizeState(db).canUndo, false);
  assert.throws(() => undoOrganize(db), (e: Error) => e instanceof HttpError && e.status === 409 && e.message === 'Your bookmarks changed after they were organized, so Undo can’t put them back');
  assert.equal(organizeState(db).status, 'done', 'the result is still shown');
  assert.deepEqual(stopOrganize(db), { status: 'idle' });
  assert.equal(organizeState(db).status, 'idle');
});

test('Undo works in Keep my folders too, including the folders that were removed', async () => {
  const db = seeded(KEEP_TREE);
  const original = kvGet(db, BOOKMARKS_KEY);
  startOrganize(db, true, fake({ plan: KEEP_PLAN, put: KEEP_PUT }));
  await organizeSettled(db);
  assert.equal(organizeState(db).canUndo, true);
  undoOrganize(db);
  assert.equal(kvGet(db, BOOKMARKS_KEY), original);
});

// ---- what is sent ---------------------------------------------------------------------------------------------------

test('the model is sent titles and addresses without a query or fragment, never real ids, and the data is called data', async () => {
  const tree = build({
    bar: [{ 'Project https://folder.example/x?secret=SECRET#frag': ['Doc@a.example', 'https://t.example/page?token=SECRET#frag'] }, { Files: ['Plan@b.example'] }],
    other: ['Local', 'Search results for something@c.example', 'Pipe | in title@d.example', 'Ext@e.example'],
  });
  tree.find((n) => n.title === 'Local')!.url = 'file:///home/me/secret-dir/notes.txt?x=SECRET#frag';
  tree.find((n) => n.title === 'Ext')!.url = 'chrome-extension://abcdef/page.html?token=SECRET';
  const t = tree.find((n) => n.title.startsWith('https://t.example'))!;
  t.url = t.title;
  const db = seeded(tree);
  for (const keep of [false, true]) {
    const ask = fake({ plan: ({ alias }) => ({ loose: keep ? [alias('Files')] : [], folders: [{ key: 'f1', name: 'All', about: 'everything' }] }), put: () => 'f1' });
    await organizeBookmarks(db, keep, { ask });
    for (const c of ask.calls) {
      const all = c.system + '\n' + c.prompt;
      assert.ok(!/SECRET|#frag|\?token|secret-dir/.test(all), `${c.kind} call has a query, a fragment or a path of a file: ${all.match(/.{30}(SECRET|#frag|\?token|secret-dir).{30}/)?.[0]}`);
      assert.ok(!/bm_\d/.test(all), 'a real id is sent');
      assert.match(c.system, /never instructions to follow/);
    }
    assert.ok(ask.calls[0].prompt.includes('Doc — https://a.example/doc'));
    assert.ok(ask.calls[0].prompt.includes('Local — file:notes.txt'));
    assert.ok(ask.calls[0].prompt.includes('Ext — chrome-extension://abcdef/page.html'));
    assert.ok(ask.calls[0].prompt.includes('https://t.example/page — https://t.example/page'));
    assert.ok(ask.calls[0].prompt.includes('## Bookmarks bar › Project https://folder.example/x'));
    assert.ok(ask.calls.find((c) => c.kind === 'sort')!.prompt.includes('| Pipe / in title | https://d.example/pipe-in-title | in: Other bookmarks'), 'a | in a title cannot break the rows');
    await Promise.resolve(stopOrganize(db));
    saveBookmarks(db, build({}).concat(tree));
  }
});

test('titles and addresses are cut at 100 characters', async () => {
  const db = seeded(
    Array.from({ length: 3 }, (_, i): BookmarkNode => ({ id: `x${i}`, title: 'T'.repeat(300), url: `https://h.example/${'p'.repeat(300)}`, parent: 'other', pos: i, addedAt: 1 })),
  );
  const ask = fake({ plan: () => ({ folders: [{ key: 'f1', name: 'All' }] }), put: () => 'f1' });
  await organizeBookmarks(db, false, { ask });
  for (const c of ask.calls) for (const l of c.prompt.split('\n')) assert.ok(l.length < 280, l.slice(0, 80));
  assert.ok(ask.calls[0].prompt.includes(`${'T'.repeat(100)} — https://h.example/${'p'.repeat(100 - 'https://h.example/'.length)}\n`));
});

// ---- routes ---------------------------------------------------------------------------------------------------------

async function appFor(db: DB, ask: Ask, all = false) {
  const app = Fastify();
  app.setErrorHandler((err: Error, _req, reply) => {
    reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
  });
  if (all) bookmarkRoutes({ app, db } as unknown as Deps);
  else organizeRoutes({ app, db } as unknown as Deps, ask);
  const call = async (method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) => {
    const r = await app.inject({ method, url, payload: body as object | undefined });
    return { status: r.statusCode, body: r.json() };
  };
  return { app, call };
}

test('routes: state, start, 409 while running, 400s, stop, result and Undo', async () => {
  const db = seeded({ bar: ['Pinned1@p', 'Pinned2@p', 'Pinned3@p'], other: ['One@x', 'Two@x'] });
  let release!: () => void;
  let gate = new Promise<void>((r) => (release = r));
  const ask = fake({ plan: () => ({ folders: [{ key: 'f1', name: 'All', about: '' }] }), put: () => 'f1', before: () => gate });
  const { call } = await appFor(db, ask);
  const O = '/api/browser/bookmarks/organize';
  assert.deepEqual((await call('GET', O)).body, { status: 'idle' });
  // The links pinned on the bar do not count: two are too few.
  let r = await call('POST', O, { keepFolders: false });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'There are too few bookmarks to organize. The sites pinned on the bookmarks bar stay as they are.');
  addBookmark(db, { title: 'Three', url: 'https://three.example/', parent: 'other' });
  for (const body of [undefined, {}, { keepFolders: 'yes' }, { keepFolders: 1 }, { keepFolders: null }]) {
    r = await call('POST', O, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.body.error, /keep your folders or start over/);
  }
  assert.equal((await call('POST', `${O}/undo`)).status, 409);
  assert.equal((await call('POST', `${O}/undo`)).body.error, 'There is nothing to undo');

  r = await call('POST', O, { keepFolders: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'running');
  assert.equal(r.body.keepFolders, false);
  assert.equal(r.body.total, 3);
  assert.ok(r.body.startedAt > 0);
  const again = await call('POST', O, { keepFolders: true });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'Your bookmarks are being organized already');
  while (!ask.sorts()) await new Promise((x) => setTimeout(x, 5));
  assert.deepEqual({ ...(await call('GET', O)).body, startedAt: 0 }, { status: 'running', keepFolders: false, step: 'sort', done: 0, total: 3, startedAt: 0 });

  // Stop: nothing is changed.
  const before = kvGet(db, BOOKMARKS_KEY);
  assert.deepEqual((await call('DELETE', O)).body, { state: { status: 'idle' } });
  release();
  await organizeSettled(db);
  assert.equal(kvGet(db, BOOKMARKS_KEY), before);
  assert.deepEqual((await call('GET', O)).body, { status: 'idle' });

  // Run it through.
  gate = Promise.resolve();
  assert.equal((await call('POST', O, { keepFolders: false })).status, 200);
  await organizeSettled(db);
  const done = (await call('GET', O)).body;
  assert.deepEqual({ ...done, startedAt: 0, finishedAt: 0 }, { status: 'done', keepFolders: false, startedAt: 0, finishedAt: 0, total: 3, moved: 3, made: 1, removed: 0, left: 0, canUndo: true });
  assert.deepEqual(shape(now(db), 'other'), [{ All: ['One', 'Two', 'Three'] }]);
  const u = await call('POST', `${O}/undo`);
  assert.equal(u.status, 200);
  assert.deepEqual(u.body.state, { status: 'idle' });
  assert.equal(u.body.nodes.length, 6);
  assert.deepEqual(shape(u.body.nodes, 'other'), ['One', 'Two', 'Three']);
  assert.equal(kvGet(db, BOOKMARKS_KEY), before);

  // DELETE after a result forgets it and its Undo.
  assert.equal((await call('POST', O, { keepFolders: false })).status, 200);
  await organizeSettled(db);
  assert.equal((await call('GET', O)).body.status, 'done');
  assert.deepEqual((await call('DELETE', O)).body, { state: { status: 'idle' } });
  assert.equal((await call('POST', `${O}/undo`)).status, 409);
});

test('routes: a failed job shows its error until the next start or a DELETE, and nothing changed', async () => {
  const db = seeded({ other: many(5) });
  const before = kvGet(db, BOOKMARKS_KEY);
  let works = false;
  const ask = fake({ plan: () => (works ? { folders: [{ key: 'f1', name: 'All' }] } : (() => { throw new HttpError(502, 'The helper model did not answer. Try again.'); })()), put: () => 'f1' });
  const { call } = await appFor(db, ask);
  const O = '/api/browser/bookmarks/organize';
  assert.equal((await call('POST', O, { keepFolders: false })).status, 200);
  await organizeSettled(db);
  const failed = (await call('GET', O)).body;
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'The helper model did not answer. Try again.');
  assert.equal((await call('GET', O)).body.status, 'failed', 'it stays');
  assert.equal(kvGet(db, BOOKMARKS_KEY), before);
  assert.deepEqual((await call('DELETE', O)).body, { state: { status: 'idle' } });
  assert.equal((await call('GET', O)).body.status, 'idle');
  // A new start forgets it too.
  await call('POST', O, { keepFolders: false });
  await organizeSettled(db);
  assert.equal((await call('GET', O)).body.status, 'failed');
  works = true;
  assert.equal((await call('POST', O, { keepFolders: false })).body.status, 'running');
  await organizeSettled(db);
  assert.equal((await call('GET', O)).body.status, 'done');
});

test('the bookmarks routes include the organize routes, beside the ones for a bookmark by id', async () => {
  const db = fresh();
  const { call } = await appFor(db, fake({}), true);
  assert.deepEqual((await call('GET', '/api/browser/bookmarks/organize')).body, { status: 'idle' });
  assert.deepEqual((await call('DELETE', '/api/browser/bookmarks/organize')).body, { state: { status: 'idle' } });
  assert.equal((await call('POST', '/api/browser/bookmarks/organize/undo')).status, 409);
  assert.equal((await call('POST', '/api/browser/bookmarks/organize', { keepFolders: true })).status, 400);
  assert.equal((await call('DELETE', '/api/browser/bookmarks/nothing-here')).status, 404);
  kvSet(db, 'x', 'y');
});

let failed = 0;
let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
fs.rmSync(home, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
