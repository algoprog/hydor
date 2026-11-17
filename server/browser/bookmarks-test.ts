// Script tests for your bookmarks (bookmarks.ts), without real browsers: the routes (add, change, move, delete and their
// places, a folder into itself refused), the bookmarks of other browsers read from fake profiles under a scratch home (two Chrome
// profiles, a Firefox places.sqlite, a Safari property list), a bookmarks file, and export read in again.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/bookmarks-test.ts
//   DATA_DIR=/tmp/hydor-test-bookmarks node dist/dev/bookmarks-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import type { BookmarkNode, BookmarkSource } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

// A scratch home, set before the module looks for browsers (it asks at each call).
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-bookmarks-test-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
process.env.APPDATA = path.join(home, 'AppData', 'Roaming');
delete process.env.XDG_CONFIG_HOME;
const { bookmarkRoutes, parseNetscape, exportNetscape, parsePlist, safariTree } = await import('./bookmarks.ts');

const chromeDir = process.platform === 'darwin' ? path.join(home, 'Library/Application Support/Google/Chrome') : process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data') : path.join(home, '.config/google-chrome');
const firefoxDir = process.platform === 'darwin' ? path.join(home, 'Library/Application Support/Firefox') : process.platform === 'win32' ? path.join(process.env.APPDATA, 'Mozilla/Firefox') : path.join(home, '.mozilla/firefox');

const db = openDb(path.join(home, 'test.db'));
const app = Fastify();
app.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
bookmarkRoutes({ app, db } as unknown as Deps);

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  const r = await app.inject({ method, url, payload: body as object | undefined });
  const ct = String(r.headers['content-type'] ?? '');
  return { status: r.statusCode, body: ct.includes('json') ? r.json() : r.body, headers: r.headers };
}

/** The nodes of a folder as nested plain objects, in order. */
type Shape = string | { [folder: string]: Shape[] };
function shape(nodes: BookmarkNode[], parent: string): Shape[] {
  return nodes
    .filter((n) => n.parent === parent)
    .sort((a, b) => a.pos - b.pos)
    .map((n) => (n.url === undefined ? { [n.title]: shape(nodes, n.id) } : `${n.title} <${n.url}>`));
}
const titles = (nodes: BookmarkNode[], parent: string) =>
  nodes
    .filter((n) => n.parent === parent)
    .sort((a, b) => a.pos - b.pos)
    .map((n) => n.title);
const positionsOk = (nodes: BookmarkNode[]) => {
  const by = new Map<string, number[]>();
  for (const n of nodes) by.set(n.parent, [...(by.get(n.parent) ?? []), n.pos]);
  for (const [p, l] of by) assert.deepEqual(l.sort((a, b) => a - b), l.map((_, i) => i), `places in ${p} are 0..n-1`);
};
const wipe = () => db.prepare("delete from kv where k = 'browser.bookmarks'").run();

// ---- fake browsers ----------------------------------------------------------------------------------------
const chromeNode = (name: string, url?: string, children?: unknown[]) => (url ? { type: 'url', name, url, date_added: '13350000000000000' } : { type: 'folder', name, children: children ?? [], date_added: '13350000000000000' });
function writeChrome(folder: string, bar: unknown[], other: unknown[], synced: unknown[] = []) {
  fs.mkdirSync(path.join(chromeDir, folder), { recursive: true });
  const roots = { bookmark_bar: chromeNode('Bookmarks bar', undefined, bar), other: chromeNode('Other bookmarks', undefined, other), synced: chromeNode('Mobile bookmarks', undefined, synced) };
  fs.writeFileSync(path.join(chromeDir, folder, 'Bookmarks'), JSON.stringify({ roots, version: 1 }));
}
writeChrome(
  'Default',
  [chromeNode('Hydor', 'https://hydor.example/'), chromeNode('Dev', undefined, [chromeNode('Docs', 'https://docs.example/a?b=1&c=2'), chromeNode('Empty', undefined, [])]), chromeNode('Bad', 'javascript:alert(1)'), chromeNode('Ext', 'chrome://settings')],
  [chromeNode('Later', 'http://later.example/')],
);
writeChrome('Profile 1', [chromeNode('Work wiki', 'https://wiki.example/')], []);
writeChrome('Profile 2', [], [chromeNode('Nothing', 'about:blank')]);
fs.writeFileSync(path.join(chromeDir, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Chris' }, 'Profile 1': { name: 'Work' }, 'Profile 2': { name: 'Empty one' } } } }));

// Firefox: a real places.sqlite, in a profile profiles.ini names.
const ffProfile = path.join(firefoxDir, 'abc.default-release');
fs.mkdirSync(ffProfile, { recursive: true });
fs.writeFileSync(path.join(firefoxDir, 'profiles.ini'), '[Profile0]\nName=default-release\nIsRelative=1\nPath=abc.default-release\nDefault=1\n\n[General]\nStartWithLastProfile=1\n');
{
  const f = new Database(path.join(ffProfile, 'places.sqlite'));
  f.exec(`create table moz_places (id integer primary key, url text);
    create table moz_bookmarks (id integer primary key, type integer, fk integer, parent integer, position integer, title text, dateAdded integer, guid text);`);
  const place = f.prepare('insert into moz_places(id, url) values (?, ?)');
  const mark = f.prepare('insert into moz_bookmarks(id, type, fk, parent, position, title, dateAdded, guid) values (?, ?, ?, ?, ?, ?, ?, ?)');
  const d = 1_700_000_000_000_000;
  place.run(1, 'https://ff-toolbar.example/');
  place.run(2, 'https://ff-menu.example/');
  place.run(3, 'https://ff-unfiled.example/');
  place.run(4, 'javascript:void(0)');
  place.run(5, 'https://ff-tagged.example/');
  mark.run(1, 2, null, 0, 0, '', d, 'root________');
  mark.run(2, 2, null, 1, 0, 'menu', d, 'menu________');
  mark.run(3, 2, null, 1, 1, 'toolbar', d, 'toolbar_____');
  mark.run(4, 2, null, 1, 2, 'tags', d, 'tags________');
  mark.run(5, 2, null, 1, 3, 'unfiled', d, 'unfiled_____');
  mark.run(6, 2, null, 1, 4, 'mobile', d, 'mobile______');
  mark.run(10, 1, 1, 3, 0, 'FF toolbar', d, 'aaaaaaaaaaaa');
  mark.run(11, 2, null, 3, 1, 'FF folder', d, 'bbbbbbbbbbbb');
  mark.run(12, 1, 2, 11, 0, 'FF menu in folder', d, 'cccccccccccc');
  mark.run(13, 3, null, 11, 1, '', d, 'dddddddddddd');
  mark.run(14, 1, 3, 5, 0, 'FF unfiled', d, 'eeeeeeeeeeee');
  mark.run(15, 1, 4, 5, 1, 'FF script', d, 'ffffffffffff');
  mark.run(16, 2, null, 5, 2, 'Empty folder', d, 'gggggggggggg');
  mark.run(17, 1, 5, 4, 0, 'tagged', d, 'hhhhhhhhhhhh');
  f.close();
}

// ---- tests ------------------------------------------------------------------------------------------------

test('add: a folder and bookmarks, places kept from 0, defaults', async () => {
  wipe();
  const f = (await call('POST', '/api/browser/bookmarks', { title: ' News  ' })).body;
  assert.equal(f.node.title, 'News');
  assert.equal(f.node.url, undefined);
  assert.equal(f.node.parent, 'bar');
  assert.match(f.node.id, /^[0-9a-f]{10}$/);
  const a = (await call('POST', '/api/browser/bookmarks', { title: 'A', url: 'https://a.example/' })).body;
  const b = (await call('POST', '/api/browser/bookmarks', { title: 'B', url: 'http://b.example/', pos: 0 })).body;
  assert.deepEqual(titles(b.nodes, 'bar'), ['B', 'News', 'A']);
  const c = (await call('POST', '/api/browser/bookmarks', { title: '', url: 'file:///tmp/x.html', parent: f.node.id })).body;
  assert.equal(c.node.title, 'file:///tmp/x.html');
  assert.equal(c.node.parent, f.node.id);
  const e = (await call('POST', '/api/browser/bookmarks', { title: 'Ext', url: 'chrome-extension://abc/page.html', parent: 'other' })).body;
  assert.equal(e.node.parent, 'other');
  positionsOk(e.nodes);
  assert.equal(a.node.addedAt > 0, true);
  const long = (await call('POST', '/api/browser/bookmarks', { title: 'x'.repeat(500), url: 'https://l.example/' + 'y'.repeat(5000) })).body;
  assert.equal(long.node.title.length, 300);
  assert.equal(long.node.url.length, 4000);
  assert.deepEqual((await call('GET', '/api/browser/bookmarks')).body.nodes.length, 6);
});

test('add: refuses other addresses, missing folders and bookmarks as folders', async () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.example/', 'not a url', 'about:blank']) {
    const r = await call('POST', '/api/browser/bookmarks', { title: 'x', url });
    assert.equal(r.status, 400, url);
    assert.match(r.body.error, /address must start with/);
  }
  assert.equal((await call('POST', '/api/browser/bookmarks', { title: 'x', parent: 'nope' })).status, 404);
  const nodes = (await call('GET', '/api/browser/bookmarks')).body.nodes as BookmarkNode[];
  const link = nodes.find((n) => n.url === 'https://a.example/')!;
  assert.equal((await call('POST', '/api/browser/bookmarks', { title: 'x', parent: link.id })).status, 400);
});

test('change: rename, new address, moving between folders and inside one keep places 0..n-1', async () => {
  wipe();
  const add = async (title: string, parent = 'bar', url?: string) => (await call('POST', '/api/browser/bookmarks', { title, url, parent })).body.node as BookmarkNode;
  const f1 = await add('F1');
  const f2 = await add('F2');
  const a = await add('a', f1.id, 'https://a.example/');
  const b = await add('b', f1.id, 'https://b.example/');
  const c = await add('c', f1.id, 'https://c.example/');
  let r = await call('PATCH', `/api/browser/bookmarks/${a.id}`, { title: 'A!', url: 'https://a2.example/' });
  assert.equal(r.status, 200);
  assert.deepEqual(shape(r.body.nodes, f1.id)[0], 'A! <https://a2.example/>');
  r = await call('PATCH', `/api/browser/bookmarks/${c.id}`, { pos: 0 });
  assert.deepEqual(titles(r.body.nodes, f1.id), ['c', 'A!', 'b']);
  r = await call('PATCH', `/api/browser/bookmarks/${c.id}`, { pos: 99 });
  assert.deepEqual(titles(r.body.nodes, f1.id), ['A!', 'b', 'c']);
  r = await call('PATCH', `/api/browser/bookmarks/${b.id}`, { parent: f2.id });
  assert.deepEqual(titles(r.body.nodes, f1.id), ['A!', 'c']);
  assert.deepEqual(titles(r.body.nodes, f2.id), ['b']);
  r = await call('PATCH', `/api/browser/bookmarks/${f2.id}`, { parent: 'other', pos: 0 });
  assert.deepEqual(titles(r.body.nodes, 'bar'), ['F1']);
  assert.deepEqual(titles(r.body.nodes, 'other'), ['F2']);
  positionsOk(r.body.nodes);
  assert.equal((await call('PATCH', `/api/browser/bookmarks/${f1.id}`, { url: 'https://x.example/' })).status, 400);
  assert.equal((await call('PATCH', `/api/browser/bookmarks/${a.id}`, { url: 'javascript:1' })).status, 400);
  assert.equal((await call('PATCH', '/api/browser/bookmarks/nope', { title: 'x' })).status, 404);
});

test('change: a folder cannot go into itself or what is inside it', async () => {
  wipe();
  const add = async (title: string, parent = 'bar') => (await call('POST', '/api/browser/bookmarks', { title, parent })).body.node as BookmarkNode;
  const top = await add('top');
  const mid = await add('mid', top.id);
  const low = await add('low', mid.id);
  for (const target of [top.id, mid.id, low.id]) {
    const r = await call('PATCH', `/api/browser/bookmarks/${top.id}`, { parent: target });
    assert.equal(r.status, 400, target);
    assert.match(r.body.error, /into itself/);
  }
  assert.equal((await call('PATCH', `/api/browser/bookmarks/${low.id}`, { parent: top.id })).status, 200);
  const nodes = (await call('GET', '/api/browser/bookmarks')).body.nodes;
  assert.deepEqual(titles(nodes, top.id), ['mid', 'low']);
});

test('delete: a folder goes with everything in it, the rest are numbered again', async () => {
  wipe();
  const add = async (title: string, parent = 'bar', url?: string) => (await call('POST', '/api/browser/bookmarks', { title, url, parent })).body.node as BookmarkNode;
  const keep1 = await add('k1', 'bar', 'https://k1.example/');
  const f = await add('F');
  const sub = await add('sub', f.id);
  await add('x', sub.id, 'https://x.example/');
  await add('y', f.id, 'https://y.example/');
  await add('k2', 'bar', 'https://k2.example/');
  const r = await call('DELETE', `/api/browser/bookmarks/${f.id}`);
  assert.deepEqual(titles(r.body.nodes, 'bar'), ['k1', 'k2']);
  assert.equal(r.body.nodes.length, 2);
  positionsOk(r.body.nodes);
  assert.equal(keep1.parent, 'bar');
  assert.equal((await call('DELETE', `/api/browser/bookmarks/${f.id}`)).status, 404);
});

test('sources: Chrome profiles with their names and counts, Firefox, none without bookmarks', async () => {
  const r = await call('GET', '/api/browser/bookmarks/sources');
  const s = r.body.sources as BookmarkSource[];
  const byId = Object.fromEntries(s.map((x) => [x.id, x]));
  assert.equal(byId['chrome:Default'].browser, 'Google Chrome');
  assert.equal(byId['chrome:Default'].profile, 'Chris');
  assert.equal(byId['chrome:Default'].count, 3, 'javascript: and chrome:// links are not counted');
  assert.equal(byId['chrome:Profile 1'].profile, 'Work');
  assert.equal(byId['chrome:Profile 1'].count, 1);
  assert.equal(byId['chrome:Profile 2'], undefined, 'a profile with nothing to import is left out');
  assert.equal(byId['firefox:abc.default-release'].browser, 'Firefox');
  assert.equal(byId['firefox:abc.default-release'].count, 3);
  assert.equal(byId['firefox:abc.default-release'].profile, undefined, 'one profile: no name');
  assert.equal(s.every((x) => !x.error), true);
});

test('import from Chrome: one new folder at the end of the bar, bar items first, other roots as folders', async () => {
  wipe();
  await call('POST', '/api/browser/bookmarks', { title: 'Mine', url: 'https://mine.example/' });
  const r = await call('POST', '/api/browser/bookmarks/import', { source: 'chrome:Default' });
  assert.equal(r.status, 200);
  assert.equal(r.body.added, 3);
  assert.equal(r.body.folder.title, 'Imported from Google Chrome (Chris)');
  assert.deepEqual(titles(r.body.nodes, 'bar'), ['Mine', 'Imported from Google Chrome (Chris)']);
  assert.deepEqual(shape(r.body.nodes, r.body.folder.id), ['Hydor <https://hydor.example/>', { Dev: ['Docs <https://docs.example/a?b=1&c=2>'] }, { 'Other bookmarks': ['Later <http://later.example/>'] }]);
  positionsOk(r.body.nodes);
  const added = r.body.nodes.find((n: BookmarkNode) => n.title === 'Hydor');
  assert.equal(new Date(added.addedAt).getUTCFullYear(), 2024, 'the date it had in Chrome');
});

test('import from Firefox: its toolbar first, menu and unfiled as folders, tags and script links left out', async () => {
  wipe();
  const r = await call('POST', '/api/browser/bookmarks/import', { source: 'firefox:abc.default-release' });
  assert.equal(r.status, 200);
  assert.equal(r.body.added, 3);
  assert.equal(r.body.folder.title, 'Imported from Firefox');
  assert.deepEqual(shape(r.body.nodes, r.body.folder.id), ['FF toolbar <https://ff-toolbar.example/>', { 'FF folder': ['FF menu in folder <https://ff-menu.example/>'] }, { 'Other Bookmarks': ['FF unfiled <https://ff-unfiled.example/>'] }]);
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((n) => /^hydor-places-(?!test-)/.test(n)), [], 'the temporary copy is deleted');
  assert.equal((await call('POST', '/api/browser/bookmarks/import', { source: 'chrome:Nope' })).status, 404);
  assert.equal((await call('POST', '/api/browser/bookmarks/import', {})).status, 400);
  assert.equal((await call('POST', '/api/browser/bookmarks/import', { source: 'chrome:Profile 2' })).status, 400, 'nothing to import');
});

const FILE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<dl><p>
  <dt><h3 add_date="1700000000" personal_toolbar_folder="true">Bookmarks bar</h3>
  <dl><p>
    <dt><a href="https://one.example/?a=1&amp;b=2" add_date="1700000001">Tom &amp; Jerry&#39;s &quot;best&quot;</a>
    <dd>a note that is not a bookmark
    <dt><H3>Nested</H3>
    <DL><p>
      <DT><A HREF='https://two.example/' ICON="data:image/png;base64,AAAA>">Two</A>
      <DT><A HREF="javascript:alert(1)">Script</A>
      <DT><H3>Nothing here</H3>
      <DL><p></DL><p>
    </DL><p>
  </dl><p>
  <dt><h3>Elsewhere</h3>
  <dl><p>
    <dt><a href="https://three.example/">Three
  </dl>
  <dt><a href="https://top.example/">Top level</a>
</dl>`;

test('parse a bookmarks file: lenient tags, entities, toolbar first, scripts and empty folders skipped', async () => {
  wipe();
  const r = await call('POST', '/api/browser/bookmarks/import', { html: FILE });
  assert.equal(r.status, 200);
  assert.equal(r.body.added, 4);
  assert.equal(r.body.folder.title, 'Imported bookmarks');
  assert.deepEqual(shape(r.body.nodes, r.body.folder.id), ['Tom & Jerry\'s "best" <https://one.example/?a=1&b=2>', { Nested: ['Two <https://two.example/>'] }, { Elsewhere: ['Three <https://three.example/>'] }, 'Top level <https://top.example/>']);
  assert.equal(parseNetscape('').length, 0);
  assert.equal((await call('POST', '/api/browser/bookmarks/import', { html: '<p>no bookmarks</p>' })).status, 400);
});

test('export gives a Netscape file with attachment headers, and reading it in again gives the same tree', async () => {
  wipe();
  const add = async (title: string, parent = 'bar', url?: string) => (await call('POST', '/api/browser/bookmarks', { title, url, parent })).body.node as BookmarkNode;
  await add('Tom & "Jerry" <b>', 'bar', 'https://x.example/?a=1&b=2');
  const dev = await add('Dev & Ops');
  await add('Docs', dev.id, 'https://docs.example/');
  const deep = await add('Deep', dev.id);
  await add('Leaf', deep.id, 'http://leaf.example/');
  await add('Later', 'other', 'https://later.example/');
  const before = (await call('GET', '/api/browser/bookmarks')).body.nodes as BookmarkNode[];
  const ex = await call('GET', '/api/browser/bookmarks/export');
  assert.equal(ex.status, 200);
  assert.match(String(ex.headers['content-type']), /^text\/html/);
  assert.match(String(ex.headers['content-disposition']), /attachment; filename="bookmarks\.html"/);
  assert.match(ex.body, /^<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
  assert.match(ex.body, /PERSONAL_TOOLBAR_FOLDER="true"/);
  assert.match(ex.body, /Tom &amp; &quot;Jerry&quot; &lt;b&gt;/);
  const r = await call('POST', '/api/browser/bookmarks/import', { html: ex.body });
  assert.equal(r.status, 200);
  assert.equal(r.body.added, 4);
  // The bar's items as they were, and Other bookmarks as a folder.
  assert.deepEqual(shape(r.body.nodes, r.body.folder.id), [...shape(before, 'bar'), { 'Other bookmarks': shape(before, 'other') }]);
  positionsOk(r.body.nodes);
});

test('the cap: an import stops at 20 000 bookmarks and nothing more is added then', async () => {
  wipe();
  const items = Array.from({ length: 20_005 }, (_, i) => `<DT><A HREF="https://c.example/${i}">n${i}</A>`).join('\n');
  const r = await call('POST', '/api/browser/bookmarks/import', { html: `<DL><p>${items}</DL>` });
  assert.equal(r.status, 200);
  assert.equal(r.body.nodes.length, 20_000);
  assert.equal(r.body.added, 19_999);
  assert.equal((await call('POST', '/api/browser/bookmarks', { title: 'x', url: 'https://x.example/' })).status, 400);
  assert.equal((await call('POST', '/api/browser/bookmarks/import', { html: '<DL><DT><A HREF="https://y.example/">y</A></DL>' })).status, 400);
  wipe();
});

test('Safari: the property list parser reads the tree, bar first, the reading list left out', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Children</key><array>
 <dict><key>Title</key><string>History</string><key>WebBookmarkType</key><string>WebBookmarkTypeProxy</string></dict>
 <dict><key>Children</key><array>
   <dict><key>URIDictionary</key><dict><key>title</key><string>Fish &amp; Chips</string></dict><key>URLString</key><string>https://fish.example/</string><key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string><key>ReadingListNonSync</key><dict/></dict>
   <dict><key>Children</key><array><dict><key>URIDictionary</key><dict><key>title</key><string>Deep</string></dict><key>URLString</key><string>https://deep.example/</string><key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string></dict></array><key>Title</key><string>Folder</string><key>WebBookmarkType</key><string>WebBookmarkTypeList</string></dict>
  </array><key>Title</key><string>BookmarksBar</string><key>WebBookmarkType</key><string>WebBookmarkTypeList</string></dict>
 <dict><key>Children</key><array><dict><key>URIDictionary</key><dict><key>title</key><string>Menu one</string></dict><key>URLString</key><string>https://menu.example/</string><key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string></dict></array><key>Title</key><string>BookmarksMenu</string><key>WebBookmarkType</key><string>WebBookmarkTypeList</string></dict>
 <dict><key>Children</key><array><dict><key>URLString</key><string>https://later.example/</string><key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string></dict></array><key>Title</key><string>com.apple.ReadingList</string><key>WebBookmarkType</key><string>WebBookmarkTypeList</string></dict>
</array><key>Title</key><string></string><key>WebBookmarkType</key><string>WebBookmarkTypeList</string><key>WebBookmarkFileVersion</key><integer>1</integer><key>Flag</key><true/><key>No</key><false/><key>Pi</key><real>3.14</real></dict></plist>`;
  const p = parsePlist(xml) as any;
  assert.equal(p.WebBookmarkFileVersion, 1);
  assert.equal(p.Flag, true);
  assert.equal(p.No, false);
  assert.equal(p.Pi, 3.14);
  const t = safariTree(p);
  assert.deepEqual(t.map((x) => x.title), ['Fish & Chips', 'Folder', 'Bookmarks Menu']);
  assert.equal(t[1].children?.[0].url, 'https://deep.example/');
  assert.equal(t[2].children?.[0].url, 'https://menu.example/');
});

test('export and parse agree on an empty list too', () => {
  assert.deepEqual(parseNetscape(exportNetscape([])), []);
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
