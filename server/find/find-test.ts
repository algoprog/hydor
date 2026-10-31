// Checks for search everything: matching by words (shared/find.ts, which the search box uses as you type); the
// catalog of what ships with the app (shared/find-catalog.ts) against the Settings pages, and its vectors made
// ahead of time (shipped-vectors.json: npm run find:vectors when this fails); and what the server adds
// (index.ts): what ships, found by meaning, sessions and tasks given their vectors the moment the pages hear of
// them, messages and memory notes; with a made-up embedder in place of the model. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/find/find-test.ts
//   DATA_DIR=/tmp/naget-test-find node dist/dev/find-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchItem, queryWords } from '../../shared/find.ts';
import { catalogItems, catalogText, OPTIONS, SECTIONS } from '../../shared/find-catalog.ts';
import type { ScheduledTask } from '../../shared/automations.ts';
import type { SessionSummary } from '../../shared/types.ts';
import { APP_ROOT } from '../config.ts';
import { kvSet, openDb } from '../db.ts';
import { setEmbedderForTests } from '../memory/embed.ts';
import * as store from '../memory/store.ts';
import * as vec from '../memory/vectors.ts';
import { dropLists, findAll, hashOf, makeWaiting, onEvent, setShippedForTests, shippedVectors } from './index.ts';
import { shippedItems } from './sources.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-find-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const summaries = new Map<string, SessionSummary>();
const tasks: ScheduledTask[] = [];
const d = {
  db,
  sessions: { list: () => ({ sessions: [...summaries.values()], total: summaries.size }), summary: (k: string) => summaries.get(k) ?? null },
  scheduler: { list: () => tasks },
} as unknown as Parameters<typeof findAll>[0];

// ---- by words ------------------------------------------------------------------------------------

test('words: as typed, with a typo, without accents, the filler left out, the closest title first', () => {
  const pw = { title: 'Password', text: 'The password for this app, and signing out' };
  const typed = matchItem(pw, queryWords('pass'), 'pass');
  assert.ok(typed.score > 0);
  assert.deepEqual(typed.marks, [[0, 4]], 'the typed part is marked');
  assert.ok(matchItem(pw, queryWords('pasword'), 'pasword').score > 0, 'a letter left out');
  assert.ok(matchItem({ title: 'Memory' }, queryWords('memroy'), 'memroy').score > 0, 'two letters swapped');
  assert.equal(matchItem({ title: 'Show or hide the sidebar' }, queryWords('dark'), 'dark').score, 0, 'a short word is no typo of a longer one');
  assert.equal(matchItem({ title: 'Pages', text: 'access to this one' }, queryWords('pass'), 'pass').score, 0);
  assert.ok(matchItem({ title: 'Mémoire' }, queryWords('memoire'), 'memoire').score > 0, 'accents do not matter');
  assert.deepEqual(queryWords('how do I change the theme'), ['change', 'theme']);
  assert.deepEqual(queryWords('how'), ['how'], 'only small words: they count');
  const theme = { title: 'Theme', keywords: 'dark mode light appearance' };
  const q = 'how do I turn on dark mode';
  assert.ok(matchItem(theme, queryWords(q), q).score > matchItem(pw, queryWords(q), q).score);
  const items = [{ title: 'Memory notes' }, { title: 'Memory' }, { title: 'Search', text: 'memory of searches' }];
  const order = items.map((it) => ({ it, s: matchItem(it, queryWords('memory'), 'memory').score })).sort((a, b) => b.s - a.s);
  assert.deepEqual(
    order.map((x) => x.it.title),
    ['Memory', 'Memory notes', 'Search'],
  );
  assert.equal(matchItem(pw, queryWords('banana'), 'banana').score, 0);
  const both = matchItem({ title: 'Dark theme' }, queryWords('dark theme'), 'dark theme').score;
  assert.ok(both > matchItem({ title: 'Theme' }, queryWords('dark theme'), 'dark theme').score, 'holding every word comes first');
});

// ---- what ships with the app ---------------------------------------------------------------------

const web = path.join(APP_ROOT, 'web', 'src');
const read = (f: string) => fs.readFileSync(f, 'utf8');
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

test('the catalog’s sections are the Settings pages’ own, and each option says what its page shows', () => {
  // Sections as SettingsPage.tsx (App, Agents) and the features (Capabilities) declare them.
  const sources = [path.join(web, 'features', 'settings', 'SettingsPage.tsx'), ...fs.readdirSync(path.join(web, 'features')).map((f) => path.join(web, 'features', f, 'feature.tsx')).filter((f) => fs.existsSync(f))];
  const declared = new Map<string, { label: string; sub: string }>();
  const re = /id: '([a-z-]+)',\s*label: '([^']+)',[^{}]*?sub: '([^']+)'/g;
  for (const f of sources) for (const m of read(f).matchAll(re)) declared.set(m[1], { label: m[2], sub: m[3] });
  for (const [id, label, , sub] of SECTIONS) {
    assert.ok(declared.has(id), `section "${id}" is not in the Settings pages any more`);
    assert.deepEqual(declared.get(id), { label, sub }, `section "${id}" says something else now: update shared/find-catalog.ts`);
  }
  for (const id of declared.keys()) assert.ok(SECTIONS.some(([s]) => s === id), `Settings has a section "${id}" the search box does not know: add it to shared/find-catalog.ts`);
  // Each option's words are written in the pages, or in what the server gives them to show (the search box
  // points at them by those words).
  const all = [...files(web), ...files(path.join(APP_ROOT, 'server'))]
    .filter((f) => !f.includes(`${path.sep}palette${path.sep}`) && !f.includes(`${path.sep}find${path.sep}`))
    .map(read)
    .join('\n');
  for (const [sid, find] of OPTIONS) assert.ok(all.includes(find), `"${find}" (${sid}) is not written in the pages: it was renamed? update shared/find-catalog.ts`);
  const ids = catalogItems().map((it) => it.id);
  assert.equal(new Set(ids).size, ids.length, 'every item has its own id');
});

test('every text that ships has its vector made ahead of time (npm run find:vectors when this fails)', () => {
  const items = shippedItems(db);
  const kinds = new Map<string, number>();
  for (const it of items) kinds.set(it.id.split(':')[0], (kinds.get(it.id.split(':')[0]) ?? 0) + 1);
  console.log(`     ${items.length} shipped texts: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  assert.ok((kinds.get('app') ?? 0) > 0 && (kinds.get('asst') ?? 0) > 0 && (kinds.get('skill') ?? 0) > 0, 'templates, assistants and skills are in');
  const have = shippedVectors();
  const missing = items.filter((it) => !have.has(hashOf(it.text)));
  assert.equal(missing.length, 0, `no shipped vector for ${missing.length} texts (${missing.slice(0, 3).map((m) => m.id).join(', ')}…): run npm run find:vectors`);
  for (const c of have.values()) assert.equal(c.length, vec.BYTES);
});

// ---- on the server -------------------------------------------------------------------------------

// Concepts as fixed random directions (synonyms share one), a text as the sum of its concepts'; levels spread
// evenly suit such vectors (as in memory-test.ts).
const SAME: Record<string, string> = { dark: 'theme', night: 'theme', colours: 'theme', appearance: 'theme', trip: 'travel', holiday: 'travel', vacation: 'travel', lisbon: 'travel', groceries: 'food', shopping: 'food' };
const dirs = new Map<string, Float32Array>();
function direction(c: string): Float32Array {
  let v = dirs.get(c);
  if (v) return v;
  let s = 0;
  for (const ch of c) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (i: number) => {
    let h = (s ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32 - 0.5;
  };
  v = new Float32Array(vec.DIM).map((_, i) => rnd(3 * i) + rnd(3 * i + 1) + rnd(3 * i + 2));
  dirs.set(c, v);
  return v;
}
function fake(text: string): Float32Array {
  const v = new Float32Array(vec.DIM);
  for (const w of store.words(text)) {
    const dd = direction(SAME[w] ?? w);
    for (let i = 0; i < vec.DIM; i++) v[i] += dd[i];
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

test('without search by meaning: messages and notes by words, nothing waits', async () => {
  setEmbedderForTests(null);
  const now = Date.now();
  db.prepare("insert into sessions (key, agent, id, path, title, cwd, updated_at) values (?, 'claude', ?, '', ?, ?, ?)").run('claude:lisbon', 'lisbon', 'Plan a 4-day trip to Lisbon', '/tmp', now);
  db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)').run('claude:lisbon', 'user', now, 'Book the tram tour and the fado evening for Saturday.');
  store.addEntry(db, { scope: 'global', scopeKey: '', text: 'The user prefers window seats on trains.' }, { source: 'user' });
  const r = await findAll(d, 'fado evening');
  assert.equal(r.meaning, false);
  assert.equal(r.messages[0]?.key, 'claude:lisbon');
  assert.ok(r.messages[0].snippet.includes('\u0001'), 'the words are marked');
  assert.equal((await findAll(d, 'Lisbon')).sessions[0]?.key, 'claude:lisbon', 'a session by its title');
  assert.equal((await findAll(d, 'window seats')).notes[0]?.text, 'The user prefers window seats on trains.');
  assert.equal((await findAll(d, '   ')).messages.length, 0);
});

test('with search by meaning: what ships found in other words; sessions and tasks get vectors as the pages hear of them', async () => {
  kvSet(db, 'memory.meaning', '1');
  setEmbedderForTests(async (texts) => texts.map(fake));
  vec.setCodebookForTests(new Float32Array(vec.DIM * 16).map((_, i) => -0.12 + ((i % 16) * 0.24) / 15));
  // The shipped vectors, as the script makes them, with the stand-in.
  setShippedForTests(new Map(shippedItems(db).map((it) => [hashOf(it.text), vec.quantize(fake(it.text))])));
  dropLists();
  const r = await findAll(d, 'night colours');
  assert.equal(r.meaning, true);
  const theme = catalogItems().find((it) => it.id === 'opt:general:Theme')!;
  assert.ok(catalogText(theme).includes('dark mode'));
  assert.ok(r.alike.slice(0, 8).some((a) => a.id === 'opt:general:Theme'), '"night colours" is about the theme, in other words');
  assert.match(r.alike[0].id, /theme|Theme/, 'and what is about themes comes first');
  assert.ok(!r.alike.some((a) => a.id === 'go:git'), 'what is not alike stays out');
  // A new session: its vector is made when the pages are told of it, before anyone searches.
  const now = Date.now();
  await findAll(d, 'anything');
  const lisbon = { key: 'claude:lisbon', agent: 'claude', id: 'lisbon', title: 'Plan a 4-day trip to Lisbon', cwd: '/tmp', updatedAt: now } as SessionSummary;
  summaries.set(lisbon.key, lisbon);
  onEvent({ t: 'sessions', upsert: [lisbon] }, d);
  await makeWaiting(db);
  const s = await findAll(d, 'holiday plans');
  assert.equal(s.sessions[0]?.key, 'claude:lisbon');
  assert.ok((s.sessions[0].meaning ?? 0) > 0.35);
  // A scheduled task made: the same.
  tasks.push({ id: 'k1', name: 'Weekly groceries', prompt: 'Order the shopping list every Friday.' } as ScheduledTask);
  onEvent({ t: 'tasks' } as never, d);
  await sleep(400);
  await makeWaiting(db);
  assert.ok((await findAll(d, 'food')).alike.some((a) => a.id === 'task:k1'));
  // Gone from the list: no longer found.
  onEvent({ t: 'sessions', upsert: [], remove: ['claude:lisbon'] }, d);
  assert.ok(!(await findAll(d, 'holiday plans')).sessions.some((x) => x.meaning));
  setEmbedderForTests(null);
  kvSet(db, 'memory.meaning', '0');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).stack?.split('\n').slice(0, 4).join('\n     ')}`);
  }
}
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
