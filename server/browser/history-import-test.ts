// Script tests for importing the history of other browsers (history-import.ts), without real browsers: two Chrome profiles
// and a Firefox profile made under a scratch home, with the databases those browsers have. The sources (the same ids as the
// bookmarks' for the same profiles, their names and counts, hidden pages and addresses that are not pages left out), the
// import (times converted, typed counts, titles), importing again changing nothing, and the errors.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/history-import-test.ts
//   DATA_DIR=/tmp/hydor-test-history-import node dist/dev/history-import-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import type { BookmarkSource, HistoryImport, HistorySource } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

// A scratch home, set before the module looks for browsers (it asks at each call).
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-history-import-test-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
process.env.APPDATA = path.join(home, 'AppData', 'Roaming');
delete process.env.XDG_CONFIG_HOME;
const { bookmarkRoutes } = await import('./bookmarks.ts');
const { historyImportRoutes } = await import('./history-import.ts');
const { listHistory, historyCount } = await import('./history.ts');

const chromeDir = process.platform === 'darwin' ? path.join(home, 'Library/Application Support/Google/Chrome') : process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data') : path.join(home, '.config/google-chrome');
const firefoxDir = process.platform === 'darwin' ? path.join(home, 'Library/Application Support/Firefox') : process.platform === 'win32' ? path.join(process.env.APPDATA, 'Mozilla/Firefox') : path.join(home, '.mozilla/firefox');

const db = openDb(path.join(home, 'test.db'));
const app = Fastify();
app.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
bookmarkRoutes({ app, db } as unknown as Deps);
historyImportRoutes({ app, db } as unknown as Deps);

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

async function call(method: 'GET' | 'POST', url: string, body?: unknown) {
  const r = await app.inject({ method, url, payload: body as object | undefined });
  return { status: r.statusCode, body: r.json() };
}

// ---- fake browsers ----------------------------------------------------------------------------------------
// Chrome's dates: microseconds since 1601. 1_700_000_000 s since 1970 is this many since 1601:
const chrome = (unixSeconds: number) => (unixSeconds ? (unixSeconds + 11_644_473_600) * 1_000_000 : 0);

const CHROME_SCHEMA = 'create table urls(id integer primary key autoincrement, url longvarchar, title longvarchar, visit_count integer default 0 not null, typed_count integer default 0 not null, last_visit_time integer not null, hidden integer default 0 not null)';
type ChromeRow = [url: string, title: string, visits: number, typed: number, unixSeconds: number, hidden?: number];
function writeChrome(folder: string, rows: ChromeRow[]) {
  fs.mkdirSync(path.join(chromeDir, folder), { recursive: true });
  fs.writeFileSync(path.join(chromeDir, folder, 'Bookmarks'), JSON.stringify({ roots: { bookmark_bar: { type: 'folder', name: 'Bookmarks bar', children: [{ type: 'url', name: 'Mark', url: `https://mark-${folder.replace(' ', '')}.example/` }] }, other: { type: 'folder', name: 'Other', children: [] }, synced: { type: 'folder', name: 'Mobile', children: [] } } }));
  const f = new Database(path.join(chromeDir, folder, 'History'));
  f.exec(CHROME_SCHEMA);
  const ins = f.prepare('insert into urls(url, title, visit_count, typed_count, last_visit_time, hidden) values (?, ?, ?, ?, ?, ?)');
  for (const [url, title, visits, typed, at, hidden] of rows) ins.run(url, title, visits, typed, chrome(at), hidden ?? 0);
  f.close();
}
writeChrome('Default', [
  ['https://hydor.example/', 'Hydor home', 5, 2, 1_700_000_000],
  ['https://docs.example/a?b=1', 'Docs', 1, 0, 1_700_100_000],
  ['https://hidden.example/', 'Hidden', 1, 0, 1_700_200_000, 1],
  ['chrome://settings/', 'Settings', 1, 1, 1_700_300_000],
  ['javascript:alert(1)', '', 1, 0, 1_700_400_000],
  ['https://never.example/', 'Never visited', 0, 0, 0],
  ['file:///tmp/notes.html', 'Notes', 2, 0, 1_700_500_000],
]);
writeChrome('Profile 1', [['https://wiki.example/', 'Work wiki', 3, 1, 1_700_600_000]]);
// A profile whose history is empty is not offered.
writeChrome('Profile 2', []);
fs.writeFileSync(path.join(chromeDir, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Chris' }, 'Profile 1': { name: 'Work' }, 'Profile 2': { name: 'Empty one' } } } }));

// Firefox: a places.sqlite with what its history needs (and its bookmarks table, so the bookmarks source shows too).
const ffProfile = path.join(firefoxDir, 'abc.default-release');
fs.mkdirSync(ffProfile, { recursive: true });
fs.writeFileSync(path.join(firefoxDir, 'profiles.ini'), '[Profile0]\nName=default-release\nIsRelative=1\nPath=abc.default-release\nDefault=1\n\n[General]\nStartWithLastProfile=1\n');
{
  const f = new Database(path.join(ffProfile, 'places.sqlite'));
  f.exec(`create table moz_places (id integer primary key, url text, title text, visit_count integer default 0, hidden integer default 0 not null, last_visit_date integer);
    create table moz_historyvisits (id integer primary key, from_visit integer, place_id integer, visit_date integer, visit_type integer);
    create table moz_bookmarks (id integer primary key, type integer, fk integer, parent integer, position integer, title text, dateAdded integer, guid text);`);
  const place = f.prepare('insert into moz_places(id, url, title, visit_count, hidden, last_visit_date) values (?, ?, ?, ?, ?, ?)');
  const visit = f.prepare('insert into moz_historyvisits(place_id, visit_date, visit_type) values (?, ?, ?)');
  const us = (unixSeconds: number) => unixSeconds * 1_000_000;
  place.run(1, 'https://ff.example/', 'Firefox page', 4, 0, us(1_700_000_500));
  place.run(2, 'https://ff-hidden.example/', 'Hidden', 2, 1, us(1_700_000_600));
  place.run(3, 'about:preferences', 'Preferences', 1, 0, us(1_700_000_700));
  place.run(4, 'https://ff-unvisited.example/', 'Only bookmarked', 0, 0, null);
  place.run(5, 'https://hydor.example/', 'Hydor (from Firefox)', 1, 0, us(1_700_001_000));
  place.run(6, 'place:sort=8&maxResults=10', 'Recent tags', 1, 0, us(1_700_001_100));
  for (const [place_id, at, type] of [[1, 1_700_000_100, 1], [1, 1_700_000_200, 2], [1, 1_700_000_300, 2], [1, 1_700_000_500, 1], [5, 1_700_001_000, 1]]) visit.run(place_id, us(at), type);
  const mark = f.prepare('insert into moz_bookmarks(id, type, fk, parent, position, title, dateAdded, guid) values (?, ?, ?, ?, ?, ?, ?, ?)');
  mark.run(1, 2, null, 0, 0, '', 1_700_000_000_000_000, 'root________');
  mark.run(3, 2, null, 1, 1, 'toolbar', 1_700_000_000_000_000, 'toolbar_____');
  mark.run(10, 1, 4, 3, 0, 'Only bookmarked', 1_700_000_000_000_000, 'aaaaaaaaaaaa');
  f.close();
}

const sources = async () => (await call('GET', '/api/browser/browsing/history/sources')).body.sources as HistorySource[];
const rows = () => listHistory(db, { limit: 200 });

// ---- tests ------------------------------------------------------------------------------------------------

test('sources: each browser profile with web history, named as the bookmarks name it, hidden and non-web pages not counted', async () => {
  const s = await sources();
  assert.deepEqual(s, [
    { id: 'chrome:Default', browser: 'Google Chrome', profile: 'Chris', count: 3 },
    { id: 'chrome:Profile 1', browser: 'Google Chrome', profile: 'Work', count: 1 },
    { id: 'firefox:abc.default-release', browser: 'Firefox', count: 2 },
  ]);
});

test('sources: the ids are the bookmark sources’ ids for the same profiles, with the same names', async () => {
  const marks = (await call('GET', '/api/browser/bookmarks/sources')).body.sources as BookmarkSource[];
  const hist = await sources();
  assert.ok(marks.length >= 3);
  for (const h of hist) {
    const m = marks.find((x) => x.id === h.id);
    assert.ok(m, `${h.id} is a bookmark source too`);
    assert.equal(m.browser, h.browser);
    assert.equal(m.profile, h.profile);
  }
});

test('sources: a database that is not one is listed with its error', async () => {
  const file = path.join(chromeDir, 'Profile 2', 'History');
  fs.rmSync(file);
  fs.writeFileSync(file, 'this is not a database, but a file of some length so that it is not empty');
  const s = (await sources()).find((x) => x.id === 'chrome:Profile 2');
  assert.deepEqual(s, { id: 'chrome:Profile 2', browser: 'Google Chrome', profile: 'Empty one', count: 0, error: 'Its history cannot be read.' });
  const r = await call('POST', '/api/browser/browsing/history/import', { source: 'chrome:Profile 2' });
  assert.deepEqual([r.status, r.body.error], [400, 'Its history cannot be read.']);
  fs.rmSync(file);
  const f = new Database(file);
  f.exec(CHROME_SCHEMA);
  f.close();
  assert.equal((await sources()).some((x) => x.id === 'chrome:Profile 2'), false, 'empty again: not listed');
});

test('import: Chrome’s pages come in with their times, visits, typed counts and titles', async () => {
  const r = await call('POST', '/api/browser/browsing/history/import', { source: 'chrome:Default' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body as HistoryImport, { added: 3, updated: 0 });
  assert.deepEqual(
    rows().map((e) => [e.url, e.title, e.at, e.visits, e.typed]),
    [
      ['file:///tmp/notes.html', 'Notes', 1_700_500_000_000, 2, 0],
      ['https://docs.example/a?b=1', 'Docs', 1_700_100_000_000, 1, 0],
      ['https://hydor.example/', 'Hydor home', 1_700_000_000_000, 5, 2],
    ],
  );
});

test('import: again changes nothing', async () => {
  const before = JSON.stringify(rows());
  const r = await call('POST', '/api/browser/browsing/history/import', { source: 'chrome:Default' });
  assert.deepEqual(r.body, { added: 0, updated: 0 });
  assert.equal(JSON.stringify(rows()), before);
});

test('import: Firefox’s pages (typed visits counted, microseconds read as milliseconds) merge with what is there', async () => {
  const r = await call('POST', '/api/browser/browsing/history/import', { source: 'firefox:abc.default-release' });
  assert.deepEqual(r.body as HistoryImport, { added: 1, updated: 1 });
  const by = (u: string) => rows().find((e) => e.url === u)!;
  assert.deepEqual([by('https://ff.example/').title, by('https://ff.example/').at, by('https://ff.example/').visits, by('https://ff.example/').typed], ['Firefox page', 1_700_000_500_000, 4, 2]);
  // The same page in Chrome (an older visit, more visits): the later visit and the larger counts, the later visit's title.
  const h = by('https://hydor.example/');
  assert.deepEqual([h.at, h.visits, h.typed, h.title], [1_700_001_000_000, 5, 2, 'Hydor (from Firefox)']);
  assert.equal(historyCount(db), 4);
  assert.deepEqual((await call('POST', '/api/browser/browsing/history/import', { source: 'firefox:abc.default-release' })).body, { added: 0, updated: 0 });
});

test('import: the second Chrome profile', async () => {
  const r = await call('POST', '/api/browser/browsing/history/import', { source: 'chrome:Profile 1' });
  assert.deepEqual(r.body, { added: 1, updated: 0 });
  assert.equal(historyCount(db), 5);
});

test('import: the browser’s own files are not touched, and the copies are gone', async () => {
  const left = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('hydor-copy-'));
  assert.deepEqual(left, []);
  assert.deepEqual(fs.readdirSync(path.join(chromeDir, 'Default')).sort(), ['Bookmarks', 'History']);
});

test('import: errors for no source, an unknown one and a history with nothing to bring', async () => {
  let r = await call('POST', '/api/browser/browsing/history/import', {});
  assert.deepEqual([r.status, r.body.error], [400, 'Say which browser to import from.']);
  r = await call('POST', '/api/browser/browsing/history/import', { source: '' });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/browser/browsing/history/import', { source: 'chrome:Nowhere' });
  assert.deepEqual([r.status, r.body.error], [404, 'That browser’s history is not here any more.']);
  r = await call('POST', '/api/browser/browsing/history/import', { source: 'chrome:Profile 2' });
  assert.deepEqual([r.status, r.body.error], [400, 'There is no history to import there.']);
});

let failed = 0;
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
