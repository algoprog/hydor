// Script tests for your own browsing's history and the address bar's suggestions (history.ts): the table (visits, typed
// addresses, titles, paging, searching in any language, clearing since a time, the 20 000 cap), frecency (typed beats
// visited beats old), how the view's changes become visits, the suggestions (tabs, bookmarks and history without
// duplicates, what you typed first, the address to complete in place, the engines' suggestions through a stand-in
// fetch, a slow or failing engine) and their parsing, then your browsing by meaning with a made-up embedder (private
// vectors for history, bookmarks and downloads; pages found only by meaning come after the word matches, marked; the
// address to complete stays by words; every way a page, bookmark or download goes takes its vector with it) and the
// list of downloads.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/history-test.ts
//   DATA_DIR=/tmp/hydor-test-history node dist/dev/history-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { BookmarkNode, BrowserTab } from '../../shared/browser.ts';
import { openDb } from '../db.ts';
import { setEmbedderForTests } from '../memory/embed.ts';
import * as vec from '../memory/vectors.ts';
import { addBookmark, changeBookmark, loadBookmarks, removeBookmark } from './bookmarks.ts';
import { addressOf } from './browsing.ts';
import { browserVectorCounts, browsingAlike, downloadText, fillBrowserVectors, historyText, syncBookmarkVectors } from './meaning.ts';
import { addDownload, clearDownloads, downloadCount, listDownloads, MAX_DOWNLOADS } from './downloads.ts';
import { addVisit, clearHistory, clearSuggestCache, engineSuggestions, frecency, HistoryRecorder, historyCount, historyUrl, listHistory, MAX_HISTORY, parseSuggestions, plainUrl, removeHistory, setTitle, SUGGEST_URLS, suggest, type Fetch, type SuggestInput } from './history.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
// The real model is never started here: the made-up embedder below stands in for it.
process.env.HYDOR_EMBED = 'off';

let passed = 0;
let failed = 0;
const check = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
    process.exitCode = 1;
  }
};

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 12);
const dir = process.env.DATA_DIR!;
fs.mkdirSync(dir, { recursive: true });
let n = 0;
const fresh = () => openDb(path.join(dir, `history-${++n}-${process.pid}.db`), { cacheMb: 8 });

const noEngine: Fetch = async () => {
  throw new Error('the engine should not be asked');
};
const input = (q: string, o: Partial<SuggestInput> = {}): SuggestInput => ({ q, address: addressOf(q), tabs: [], bookmarks: [], prefs: { engine: 'google', suggest: false }, fetch: noEngine, now: NOW, ...o });
const bookmark = (title: string, url: string): BookmarkNode => ({ id: Math.random().toString(36).slice(2), title, url, parent: 'bar', pos: 0, addedAt: NOW });
const urls = (r: { items: { kind: string; url?: string; text?: string }[] }) => r.items.map((i) => `${i.kind}:${i.url ?? i.text}`);

async function main() {
  // AbortSignal.timeout does not keep a script alive on its own.
  const alive = setInterval(() => {}, 1000);
  await check('history: a page is one row; visits and typed addresses count, its title is kept, #fragments are not pages', () => {
    const db = fresh();
    assert.equal(addVisit(db, 'about:blank', ''), null);
    assert.equal(addVisit(db, 'chrome-extension://abc/popup.html', 'x'), null);
    assert.equal(addVisit(db, 'chrome-error://chromewebdata/', ''), null);
    assert.equal(addVisit(db, 'javascript:alert(1)', ''), null);
    assert.equal(addVisit(db, `https://a.example/${'x'.repeat(2100)}`, ''), null, 'a very long address is not kept');
    const a = addVisit(db, 'https://a.example/page#top', '  A\n  page ', false, NOW)!;
    assert.deepEqual([a.url, a.title, a.visits, a.typed, a.at], ['https://a.example/page', 'A page', 1, 0, NOW]);
    const b = addVisit(db, 'https://a.example/page#other', '', true, NOW + 1000)!;
    assert.deepEqual([b.id, b.title, b.visits, b.typed, b.at], [a.id, 'A page', 2, 1, NOW + 1000], 'same page: counted, the title stays');
    addVisit(db, 'https://a.example/page', 'A new title', false, NOW + 2000);
    assert.equal(listHistory(db)[0].title, 'A new title');
    addVisit(db, 'file:///home/me/notes.html', 'Notes', false, NOW);
    assert.equal(historyCount(db), 2);
    // A title that is only the address is no title.
    addVisit(db, 'https://b.example/', 'b.example', false, NOW);
    addVisit(db, 'https://c.example/x', 'https://c.example/x', false, NOW);
    assert.deepEqual(listHistory(db, { q: 'example/' }).filter((e) => e.title === '').length, 2);
    setTitle(db, 'https://b.example/', 'Site B');
    setTitle(db, 'https://nowhere.example/', 'Never visited');
    assert.equal(listHistory(db, { q: 'site b' })[0].url, 'https://b.example/');
    assert.equal(historyCount(db), 4, 'a title alone does not make a page');
    assert.equal(historyUrl('https://x.example/a#b'), 'https://x.example/a');
  });

  await check('history: newest first, paged by time, searched by every word in any language, removed and cleared since a time', () => {
    const db = fresh();
    for (let i = 0; i < 12; i++) addVisit(db, `https://site${i}.example/`, `Page ${i}`, false, NOW + i * 1000);
    addVisit(db, 'https://athens.example/', 'Αθήνα ταξίδι', false, NOW - 5000);
    addVisit(db, 'https://munich.example/', 'Über München', false, NOW - 6000);
    const first = listHistory(db, { limit: 5 });
    assert.deepEqual(first.map((e) => e.title), ['Page 11', 'Page 10', 'Page 9', 'Page 8', 'Page 7']);
    const next = listHistory(db, { before: first.at(-1)!.at, limit: 5 });
    assert.deepEqual(next.map((e) => e.title), ['Page 6', 'Page 5', 'Page 4', 'Page 3', 'Page 2']);
    assert.equal(listHistory(db, { limit: 1000 }).length, 14);
    assert.equal(listHistory(db, { limit: 500 }).length, 14, 'at most 200 at a time');
    assert.deepEqual(listHistory(db, { q: 'PAGE 1' }).map((e) => e.title), ['Page 11', 'Page 10', 'Page 1'], 'every word, any case, in the title or the address');
    assert.deepEqual(listHistory(db, { q: 'site3 page' }).map((e) => e.title), ['Page 3']);
    assert.deepEqual(listHistory(db, { q: 'αθήνα' }).map((e) => e.title), ['Αθήνα ταξίδι']);
    assert.deepEqual(listHistory(db, { q: 'ΑΘΉΝΑ' }).map((e) => e.title), ['Αθήνα ταξίδι'], 'Greek in capitals');
    assert.deepEqual(listHistory(db, { q: 'münchen' }).map((e) => e.title), ['Über München']);
    assert.deepEqual(listHistory(db, { q: 'ÜBER' }).map((e) => e.title), ['Über München']);
    assert.equal(listHistory(db, { q: 'https' }).length, 0, 'the scheme is not searched');
    const id = listHistory(db, { q: 'page 5' })[0].id;
    assert.equal(removeHistory(db, id), true);
    assert.equal(removeHistory(db, id), false);
    assert.equal(historyCount(db), 13);
    // Since a time: what was last visited from then on.
    assert.equal(clearHistory(db, NOW + 8000), 4, 'pages 8 to 11');
    assert.equal(historyCount(db), 9);
    assert.equal(clearHistory(db), 9);
    assert.equal(historyCount(db), 0);
  });

  await check(`history: at most ${MAX_HISTORY} pages, the oldest go`, () => {
    const db = fresh();
    // The table is made on first use.
    addVisit(db, 'https://first.example/', '', false, 1);
    const insert = db.prepare("insert into browser_history (url, title, hay, at, visits, typed) values (?, '', ?, ?, 1, 0)");
    db.transaction(() => {
      for (let i = 0; i < MAX_HISTORY - 1; i++) insert.run(`https://bulk.example/${i}`, `bulk.example/${i}`, 10 + i);
    })();
    assert.equal(historyCount(db), MAX_HISTORY);
    addVisit(db, 'https://one-more.example/', 'One more', false, NOW);
    assert.equal(historyCount(db), MAX_HISTORY, 'one more, one fewer');
    assert.equal(listHistory(db, { q: 'first.example' }).length, 0, 'the oldest went');
    assert.equal(listHistory(db, { q: 'one-more' }).length, 1);
    for (let i = 0; i < 25; i++) addVisit(db, `https://later.example/${i}`, '', false, NOW + i);
    assert.equal(historyCount(db), MAX_HISTORY);
    assert.equal(listHistory(db, { q: 'bulk.example/0' }).length, 0);
    assert.ok(listHistory(db, { q: 'bulk.example/9000' }).length >= 1);
  });

  await check('frecency: a typed address beats a visited one, and either beats the same long ago', () => {
    const at = NOW - DAY;
    const typed = frecency({ visits: 1, typed: 1, at }, NOW);
    const visited = frecency({ visits: 3, typed: 0, at }, NOW);
    const old = frecency({ visits: 3, typed: 0, at: NOW - 400 * DAY }, NOW);
    assert.ok(typed > visited, `${typed} > ${visited}`);
    assert.ok(visited > old * 3, `${visited} > ${old}`);
    assert.ok(frecency({ visits: 5, typed: 0, at: NOW }, NOW) > frecency({ visits: 2, typed: 0, at: NOW }, NOW), 'more visits');
    assert.ok(frecency({ visits: 2, typed: 0, at: NOW }, NOW) > frecency({ visits: 2, typed: 0, at: NOW - 30 * DAY }, NOW), 'more lately');
    assert.ok(old > 0, 'never nothing');
  });

  await check('suggestions: history ranked by frecency, with the words in the title or the address', async () => {
    const db = fresh();
    addVisit(db, 'https://news.example/a', 'News A', false, NOW - 400 * DAY);
    for (let i = 0; i < 3; i++) addVisit(db, 'https://news.example/visited', 'News visited', false, NOW - DAY);
    addVisit(db, 'https://news.example/typed', 'News typed', true, NOW - DAY);
    addVisit(db, 'https://other.example/', 'Weather', false, NOW);
    const r = await suggest(db, input('news'));
    assert.deepEqual(urls(r), ['history:https://news.example/typed', 'history:https://news.example/visited', 'history:https://news.example/a']);
    assert.equal(r.items[0].kind === 'history' && r.items[0].title, 'News typed');
    assert.deepEqual(urls(await suggest(db, input('news example typed'))), ['history:https://news.example/typed'], 'all the words');
    assert.deepEqual((await suggest(db, input('nothing like it'))).items, []);
    // Nothing typed: what you go to most.
    const top = await suggest(db, input(''));
    assert.ok(top.items.length >= 4 && top.inline === undefined);
  });

  await check('suggestions: a tab beats a bookmark beats history for the same address; no duplicates', async () => {
    const db = fresh();
    addVisit(db, 'https://docs.example/guide', 'Guide (history)', false, NOW - DAY);
    addVisit(db, 'https://docs.example/api', 'API (history)', false, NOW - DAY);
    addVisit(db, 'https://docs.example/faq', 'FAQ (history)', false, NOW - DAY);
    const r = await suggest(
      db,
      input('docs', {
        tabs: [{ id: 't1', url: 'https://docs.example/guide#intro', title: 'Guide (tab)' }],
        bookmarks: [bookmark('Guide (bookmark)', 'https://www.docs.example/guide/'), bookmark('API (bookmark)', 'https://docs.example/api'), bookmark('A folder', ''), bookmark('Bad', 'javascript:docs')],
      }),
    );
    const byUrl = new Map(r.items.map((i) => [i.kind === 'search' ? i.text : i.url, i]));
    assert.equal(r.items.length, 3, JSON.stringify(r.items));
    assert.deepEqual(byUrl.get('https://docs.example/guide#intro'), { kind: 'tab', url: 'https://docs.example/guide#intro', title: 'Guide (tab)', tab: 't1' });
    assert.equal(byUrl.get('https://docs.example/api')?.kind, 'bookmark');
    assert.equal(byUrl.get('https://docs.example/faq')?.kind, 'history');
  });

  await check('suggestions: what you typed as an address comes first, as the page it is when you have been there', async () => {
    const db = fresh();
    const r1 = await suggest(db, input('example.com'));
    assert.deepEqual(r1.items, [{ kind: 'url', url: 'https://example.com/' }]);
    addVisit(db, 'https://example.com/', 'Example', false, NOW - DAY);
    addVisit(db, 'https://example.com/more', 'Example more', true, NOW - DAY);
    addVisit(db, 'https://example.com/more', 'Example more', true, NOW - DAY);
    const r2 = await suggest(db, input('example.com'));
    const top = r2.items[0];
    assert.ok(top.kind === 'history' && top.url === 'https://example.com/', 'the page itself, not the one with a higher score');
    assert.equal(r2.items.length, 2);
    const r3 = await suggest(db, input('localhost:3000'));
    assert.deepEqual(r3.items, [{ kind: 'url', url: 'http://localhost:3000/' }]);
  });

  await check('suggestions: the address to complete in place ignores the scheme and www., and goes to the best site', async () => {
    const db = fresh();
    addVisit(db, 'https://www.github.com/anthropics', 'Anthropic', true, NOW - DAY);
    addVisit(db, 'https://www.github.com/anthropics/claude', 'Claude', false, NOW - DAY);
    addVisit(db, 'https://gitlab.com/x', 'x', false, NOW - DAY);
    addVisit(db, 'http://localhost:3000/app', 'Dev', false, NOW - DAY);
    addVisit(db, 'https://wikipedia.org/wiki/Git', 'Git', false, NOW - 100 * DAY);
    assert.equal((await suggest(db, input('git'))).inline, 'github.com', 'the site with the better score; no www.');
    assert.equal((await suggest(db, input('GIT'))).inline, 'GIThub.com', 'what you typed stays as you typed it');
    assert.equal((await suggest(db, input('www.gith'))).inline, 'www.github.com');
    assert.equal((await suggest(db, input('https://gith'))).inline, 'https://github.com');
    assert.equal((await suggest(db, input('http://gith'))).inline, undefined, 'another scheme: not the same page');
    assert.equal((await suggest(db, input('github.com/a'))).inline, 'github.com/anthropics', 'with a slash: the whole address (the better page)');
    assert.equal((await suggest(db, input('github.com/anthropics/'))).inline, 'github.com/anthropics/claude');
    assert.equal((await suggest(db, input('local'))).inline, 'localhost:3000');
    assert.equal((await suggest(db, input('localhost:30'))).inline, 'localhost:3000');
    assert.equal((await suggest(db, input('github.com'))).inline, undefined, 'nothing left to complete');
    assert.equal((await suggest(db, input('org'))).inline, undefined, 'only the beginning of an address, not a word inside it');
    assert.equal((await suggest(db, input('git hub'))).inline, undefined, 'two words');
    assert.equal((await suggest(db, input('zzz'))).inline, undefined);
    // Bookmarks and tabs complete too.
    const r = await suggest(db, input('exam', { bookmarks: [bookmark('Example', 'https://example.org/')] }));
    assert.equal(r.inline, 'example.org');
    assert.equal(plainUrl('https://www.Example.COM/'), 'example.com');
    assert.equal(plainUrl('http://localhost:3000/'), 'localhost:3000');
  });

  await check('search suggestions: asked of the engine you chose, up to five, after the rest, at most ten items', async () => {
    const db = fresh();
    for (let i = 0; i < 12; i++) addVisit(db, `https://shop${i}.example/`, `Shoes shop ${i}`, false, NOW - DAY);
    const asked: string[] = [];
    const fetch: Fetch = async (url) => {
      asked.push(url);
      return { ok: true, text: async () => JSON.stringify(['shoes', ['shoes online', 'shoes', 'Shoes sale', 'shoes for men', 'shoes women', 'shoes kids', 'one more']]) };
    };
    clearSuggestCache();
    const r = await suggest(db, input('shoes', { prefs: { engine: 'duckduckgo', suggest: true }, fetch }));
    assert.deepEqual(asked, ['https://duckduckgo.com/ac/?type=list&q=shoes']);
    assert.equal(r.items.length, 10);
    assert.deepEqual(r.items.slice(5).map((i) => i.kind), Array(5).fill('search'));
    assert.deepEqual(r.items.slice(5).map((i) => (i.kind === 'search' ? i.text : '')), ['shoes online', 'Shoes sale', 'shoes for men', 'shoes women', 'shoes kids'], 'not what was typed, five at most');
    assert.deepEqual(r.items.slice(0, 5).map((i) => i.kind), Array(5).fill('history'));
    // Asked again within a minute: the answer is kept.
    await suggest(db, input('shoes', { prefs: { engine: 'duckduckgo', suggest: true }, fetch }));
    assert.equal(asked.length, 1);
    // Each engine's own address; Startpage and your own page have none.
    clearSuggestCache();
    const seen: string[] = [];
    const spy: Fetch = async (u) => (seen.push(u), { ok: true, text: async () => '["a b", ["a bc"]]' });
    for (const engine of ['google', 'duckduckgo', 'bing', 'brave', 'ecosia', 'startpage', 'custom'] as const) await engineSuggestions(engine, 'a b', { fetch: spy });
    assert.deepEqual(seen, [
      'https://suggestqueries.google.com/complete/search?client=firefox&q=a%20b',
      'https://duckduckgo.com/ac/?type=list&q=a%20b',
      'https://api.bing.com/osjson.aspx?query=a%20b',
      'https://search.brave.com/api/suggest?q=a%20b',
      'https://ac.ecosia.org/autocomplete?type=list&q=a%20b',
    ]);
    assert.equal(Object.keys(SUGGEST_URLS).length, 5);
  });

  await check('search suggestions: off, or for an address, or too long: the engine is not asked; a failing or slow one is passed over', async () => {
    const db = fresh();
    addVisit(db, 'https://paris.example/', 'Paris travel', false, NOW - DAY);
    clearSuggestCache();
    let calls = 0;
    const count: Fetch = async () => {
      calls++;
      return { ok: true, text: async () => '["x",["x y"]]' };
    };
    const on = { engine: 'google', suggest: true } as const;
    assert.equal((await suggest(db, input('paris', { prefs: { engine: 'google', suggest: false }, fetch: count }))).items.length, 1, 'turned off');
    assert.equal((await suggest(db, input('paris.example', { prefs: on, fetch: count }))).items.length, 1, 'an address is not sent');
    assert.equal((await suggest(db, input('https://paris.example/secret?token=1', { prefs: on, fetch: count }))).items.length, 1);
    assert.equal((await suggest(db, input('paris '.repeat(30), { prefs: on, fetch: count }))).items.filter((i) => i.kind === 'search').length, 0, 'long text is not sent');
    assert.equal((await suggest(db, input('paris', { prefs: { engine: 'startpage', suggest: true }, fetch: count }))).items.filter((i) => i.kind === 'search').length, 0, 'Startpage has none');
    assert.equal(calls, 0);
    const broken: Fetch = async () => {
      throw new Error('offline');
    };
    const r = await suggest(db, input('paris', { prefs: { engine: 'google', suggest: true }, fetch: broken }));
    assert.deepEqual(urls(r), ['history:https://paris.example/']);
    const bad: Fetch = async () => ({ ok: false, text: async () => 'no' });
    assert.equal((await suggest(db, input('paris', { prefs: { engine: 'bing', suggest: true }, fetch: bad }))).items.length, 1);
    const junk: Fetch = async () => ({ ok: true, text: async () => '<html>captcha</html>' });
    assert.equal((await suggest(db, input('paris', { prefs: { engine: 'brave', suggest: true }, fetch: junk }))).items.length, 1);
    // A slow engine: given up on at the timeout, the rest comes.
    let aborted = false;
    const slow: Fetch = (_u, init) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          rej(new Error('aborted'));
        });
      });
    const t0 = Date.now();
    const s = await suggest(db, input('paris', { prefs: { engine: 'ecosia', suggest: true }, fetch: async (u, i) => slow(u, { ...i, signal: AbortSignal.any([i!.signal!, AbortSignal.timeout(80)]) }) }));
    assert.deepEqual(urls(s), ['history:https://paris.example/']);
    assert.ok(Date.now() - t0 < 1500);
    assert.ok(aborted);
    // The page stops waiting: the engine's request is dropped.
    const stop = new AbortController();
    let dropped = false;
    const hang: Fetch = (_u, init) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          dropped = true;
          rej(new Error('aborted'));
        });
      });
    const p = suggest(db, input('paris!', { prefs: { engine: 'google', suggest: true }, fetch: hang, signal: stop.signal }));
    stop.abort();
    await p;
    assert.ok(dropped);
    // The real timeout is the engine's 1.2 seconds.
    clearSuggestCache();
    const t1 = Date.now();
    await engineSuggestions('google', 'timeout', { fetch: hang, timeoutMs: 120 });
    assert.ok(Date.now() - t1 < 1000);
  });

  await check('search suggestions: parsed from [query, [suggestions…]], whatever else the answer holds', () => {
    assert.deepEqual(parseSuggestions('["wea",["weather","weather today","weather"],[],{"x":1}]', 'wea'), ['weather', 'weather today']);
    assert.deepEqual(parseSuggestions('["wea",["wea","WEA","weather",7,null,"  ","a\\nb"]]', 'wea'), ['weather', 'a b']);
    assert.deepEqual(parseSuggestions('["wea",["1","2","3","4","5","6","7"]]', 'wea'), ['1', '2', '3', '4', '5']);
    for (const raw of ['', 'nope', '{}', '["q"]', '["q",{"a":1}]', 'null', '[]']) assert.deepEqual(parseSuggestions(raw, 'q'), [], raw);
  });

  await check('recording: a page a tab ends up on is a visit, its title as it settles, a typed address counts typed', async () => {
    const db = fresh();
    let now = NOW;
    const rec = new HistoryRecorder(db, () => now);
    const tab = (id: string, url: string, title: string, loading?: boolean): BrowserTab => ({ id, url, title, active: true, ...(loading ? { loading } : {}) });
    const view = (...tabs: BrowserTab[]) => ({ open: true, tabs });
    const entry = (u: string) => listHistory(db, { limit: 200 }).find((e) => e.url.replace(/^https?:\/\//, '').startsWith(u))!;
    rec.seen(view(tab('1', 'about:blank', '')));
    assert.equal(historyCount(db), 0, 'a blank page is not history');
    // A page loads: the title comes after the address.
    rec.typed('1');
    rec.seen(view(tab('1', 'https://a.example/', 'a.example', true)));
    assert.deepEqual([entry('a.example').visits, entry('a.example').typed, entry('a.example').title], [1, 1, '']);
    rec.seen(view(tab('1', 'https://a.example/', 'Site A')));
    assert.equal(entry('a.example').title, 'Site A');
    rec.seen(view(tab('1', 'https://a.example/', 'Site A')));
    assert.equal(entry('a.example').visits, 1, 'the same page seen again is not another visit');
    // Following a link: the tab still shows the last page's title while the new one loads; it is not the new page's.
    rec.seen(view(tab('1', 'https://b.example/', 'Site A', true)));
    assert.equal(entry('b.example').title, '', 'the last page’s title is not this page’s');
    assert.equal(entry('b.example').typed, 0);
    rec.seen(view(tab('1', 'https://b.example/', 'Site B', true)));
    assert.equal(entry('b.example').title, 'Site B');
    // A fragment is the same page; a reload too; going back is a visit.
    rec.seen(view(tab('1', 'https://b.example/#part', 'Site B')));
    assert.equal(entry('b.example').visits, 1);
    rec.seen(view(tab('1', 'https://a.example/', 'Site B', true)));
    rec.seen(view(tab('1', 'https://a.example/', 'Site A')));
    assert.deepEqual([entry('a.example').visits, entry('a.example').title], [2, 'Site A']);
    // A page with the same title as the last one, once it has loaded.
    rec.seen(view(tab('1', 'https://c.example/', 'Site A', true)));
    assert.equal(entry('c.example').title, '');
    rec.seen(view(tab('1', 'https://c.example/', 'Site A')));
    assert.equal(entry('c.example').title, 'Site A');
    // Error pages, extensions' pages and other tabs' blank pages are not recorded.
    rec.seen(view(tab('1', 'chrome-error://chromewebdata/', 'Error'), tab('2', 'chrome-extension://abc/popup.html', 'Popup')));
    assert.equal(historyCount(db), 3);
    // Typed counts for the next page only, and only a while.
    rec.typed('2');
    now += 60_000;
    rec.seen(view(tab('1', 'https://d.example/', 'D'), tab('2', 'https://e.example/', 'E')));
    assert.equal(entry('e.example').typed, 0, 'typed a minute ago: not typed now');
    rec.typed('2');
    rec.seen(view(tab('1', 'https://d.example/', 'D'), tab('2', 'https://f.example/', 'F')));
    assert.equal(entry('f.example').typed, 1);
    // Restored tabs are not visits (but a title is kept for what is there).
    rec.quiet('3');
    rec.seen(view(tab('3', 'https://restored.example/', 'Restored')));
    assert.equal(listHistory(db, { q: 'restored.example' }).length, 0);
    rec.seen(view(tab('3', 'https://restored.example/two', 'Two')));
    assert.equal(entry('restored.example/two').visits, 1, 'the next page is');
    // A closed browser forgets its tabs: the same pages again are visits.
    rec.seen({ open: false, tabs: [] });
    rec.seen(view(tab('1', 'https://d.example/', 'D')));
    assert.equal(entry('d.example').visits, 2);
  });

  await check('recording: a private tab’s pages are never recorded, nor its typed addresses, titles or restored pages', () => {
    const db = fresh();
    const now = NOW;
    const rec = new HistoryRecorder(db, () => now);
    const tab = (id: string, url: string, title: string, o: { private?: boolean; loading?: boolean } = {}): BrowserTab => ({ id, url, title, active: true, ...(o.private ? { private: true } : {}), ...(o.loading ? { loading: true } : {}) });
    const view = (...tabs: BrowserTab[]) => ({ open: true, tabs });
    const urls = () => listHistory(db, { limit: 200 }).map((e) => e.url).sort();
    // Typed in a private tab (the recorder is told it is one), then its page loads and settles.
    rec.typed('p', true);
    rec.seen(view(tab('p', 'https://secret.example/', 'secret.example', { private: true, loading: true }), tab('n', 'https://plain.example/', 'Plain')));
    rec.seen(view(tab('p', 'https://secret.example/', 'Secret page', { private: true }), tab('n', 'https://plain.example/', 'Plain')));
    rec.seen(view(tab('p', 'https://secret.example/two', 'Two', { private: true }), tab('n', 'https://plain.example/', 'Plain')));
    assert.deepEqual(urls(), ['https://plain.example/'], 'only the normal tab’s page');
    assert.equal(listHistory(db, { q: 'secret' }).length, 0);
    // A quiet (restored) private tab and one typed with the old call: still nothing, and nothing waits to count for a later page.
    rec.quiet('q');
    rec.seen(view(tab('q', 'https://secret.example/three', 'Three', { private: true })));
    rec.typed('t');
    rec.seen(view(tab('t', 'https://typed.example/', 'Typed', { private: true })));
    assert.deepEqual(urls(), ['https://plain.example/']);
    // Normal tabs are unaffected.
    rec.typed('n', false);
    rec.seen(view(tab('n', 'https://next.example/', 'Next')));
    const next = listHistory(db, { q: 'next.example' })[0];
    assert.deepEqual([next.visits, next.typed], [1, 1], 'a normal tab typed as before');
    // The browser closing and opening again: the same private page is still no visit.
    rec.seen({ open: false, tabs: [] });
    rec.seen(view(tab('p', 'https://secret.example/', 'Secret page', { private: true })));
    assert.deepEqual(urls(), ['https://next.example/', 'https://plain.example/']);
  });

  // ---- your browsing by meaning, with a made-up embedder ----
  // Concepts as fixed random directions (words alike share one), a text as the sum of its words' (as find-test.ts does).
  const SAME: Record<string, string> = { vacation: 'travel', holiday: 'travel', lisbon: 'travel', trip: 'travel', itinerary: 'travel', pasta: 'food', carbonara: 'food', spaghetti: 'food', recipe: 'food' };
  const dirs = new Map<string, Float32Array>();
  const direction = (c: string): Float32Array => {
    let v = dirs.get(c);
    if (v) return v;
    let h0 = 0;
    for (const ch of c) h0 = (h0 * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = (i: number) => {
      let h = (h0 ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32 - 0.5;
    };
    v = new Float32Array(vec.DIM).map((_, i) => rnd(3 * i) + rnd(3 * i + 1) + rnd(3 * i + 2));
    dirs.set(c, v);
    return v;
  };
  const fake = (text: string): Float32Array => {
    const v = new Float32Array(vec.DIM);
    for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
      const d = direction(SAME[w] ?? w);
      for (let i = 0; i < vec.DIM; i++) v[i] += d[i];
    }
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  };
  const embedded: string[] = [];
  const useModel = () => {
    vec.setCodebookForTests(new Float32Array(vec.DIM * 16).map((_, i) => -0.12 + ((i % 16) * 0.24) / 15));
    setEmbedderForTests(async (texts) => (embedded.push(...texts), texts.map(fake)));
  };
  const vectorRows = (db: ReturnType<typeof fresh>, kind?: string) => (browserVectorCounts(db), db.prepare(`select count(*) as n from browser_vectors ${kind ? 'where kind = ?' : ''}`).get(...(kind ? [kind] : [])) as { n: number }).n;
  const trip = (db: ReturnType<typeof fresh>) => {
    addVisit(db, 'https://travel.example/lisbon-guide', 'Lisbon guide', false, NOW - 3 * DAY);
    addVisit(db, 'https://food.example/carbonara', 'Spaghetti carbonara recipe', false, NOW - 2 * DAY);
    addVisit(db, 'https://news.example/', 'Daily news', false, NOW - DAY);
  };

  await check('by meaning: what is embedded is a title and an address without its scheme, query string or fragment; nothing is made while it is off', async () => {
    assert.equal(historyText('Plans', 'https://www.a.example/x/y?token=secret&q=1#frag'), 'Plans\na.example/x/y');
    assert.equal(historyText('', 'https://a.example/'), 'a.example', 'no title: the address alone');
    assert.equal(historyText('T'.repeat(500), 'https://a.example/').length, 300, 'short');
    assert.equal(downloadText('Itinerary.pdf', 'https://www.travel.example/files/it.pdf?sig=1'), 'Itinerary.pdf\ntravel.example');
    useModel();
    const db = fresh();
    trip(db);
    assert.equal(vectorRows(db), 0, 'a visit makes no vector by itself');
    assert.equal(await fillBrowserVectors(db), 3);
    assert.deepEqual(embedded.sort(), ['Daily news\nnews.example', 'Lisbon guide\ntravel.example/lisbon-guide', 'Spaghetti carbonara recipe\nfood.example/carbonara']);
    assert.equal(await fillBrowserVectors(db), 0, 'each has its vector: nothing waits');
    assert.ok(!embedded.some((t) => /secret|https?:/.test(t)));
    assert.equal((db.prepare("select count(*) as n from sqlite_master where name = 'find_vectors'").get() as { n: number }).n, 0, 'the vectors of what the app finds by meaning are another table, which these never enter');
  });

  await check('by meaning: alike pages come after the word matches, marked; a page with the words and the meaning is not marked and comes first', async () => {
    useModel();
    const db = fresh();
    trip(db);
    addVisit(db, 'https://vacation-deals.example/', 'Vacation deals', false, NOW - 5 * DAY);
    await fillBrowserVectors(db);
    const r = await suggest(db, input('vacation'));
    assert.deepEqual(urls(r), ['history:https://vacation-deals.example/', 'history:https://travel.example/lisbon-guide']);
    assert.equal((r.items[0] as { meaning?: boolean }).meaning, undefined, 'it holds the words');
    assert.equal((r.items[1] as { meaning?: boolean }).meaning, true, 'it is about the same, in other words');
    assert.equal(r.inline, 'vacation-deals.example', 'the address to complete to is by words alone');
    // Nothing alike: nothing is added; and what holds the words stays as it was.
    assert.deepEqual(urls(await suggest(db, input('daily'))), ['history:https://news.example/']);
    // Only by meaning: it is there, marked, and nothing is completed.
    removeHistory(db, listHistory(db, { q: 'vacation-deals' })[0].id);
    const only = await suggest(db, input('vacation'));
    assert.deepEqual(urls(only), ['history:https://travel.example/lisbon-guide']);
    assert.equal((only.items[0] as { meaning?: boolean }).meaning, true);
    assert.equal(only.inline, undefined);
    // An address, or a scheme, or a short word: the model is not asked.
    const before = embedded.length;
    await suggest(db, input('travel.example'));
    await suggest(db, input('ab'));
    await suggest(db, input('https://x.example/ vacation'));
    assert.equal(embedded.length, before, 'no query was embedded');
  });

  await check('by meaning: with the model unable to answer, the suggestions are as before and are not held up', async () => {
    const db = fresh();
    trip(db);
    setEmbedderForTests(async (texts, kind) => (kind === 'query' ? new Promise<Float32Array[]>(() => {}) : texts.map(fake)));
    vec.setCodebookForTests(new Float32Array(vec.DIM * 16).map((_, i) => -0.12 + ((i % 16) * 0.24) / 15));
    await fillBrowserVectors(db);
    const t0 = Date.now();
    const r = await suggest(db, input('vacation'));
    assert.deepEqual(r.items, [], 'nothing holds the words');
    assert.ok(Date.now() - t0 < 1500, `answered in ${Date.now() - t0} ms though the model never answered`);
    assert.deepEqual(await browsingAlike(db, 'vacation', ['history'], { vector: null }), []);
    setEmbedderForTests(null);
    assert.deepEqual(await browsingAlike(db, 'vacation', ['history'], { waitMs: 0 }), [], 'search by meaning off: nothing');
  });

  await check('by meaning: the engine and the model are asked at the same time', async () => {
    useModel();
    const db = fresh();
    trip(db);
    await fillBrowserVectors(db);
    const slowEngine: Fetch = (_u, init) =>
      new Promise((res) => {
        const t = setTimeout(() => res({ ok: true, text: async () => '["vacation",["vacation rentals"]]' }), 300);
        init?.signal?.addEventListener('abort', () => clearTimeout(t));
      });
    clearSuggestCache();
    const t0 = Date.now();
    const r = await suggest(db, input('vacation', { prefs: { engine: 'google', suggest: true }, fetch: slowEngine }));
    assert.deepEqual(urls(r), ['history:https://travel.example/lisbon-guide', 'search:vacation rentals']);
    assert.ok(Date.now() - t0 < 900);
  });

  await check('by meaning: bookmarks too, and a changed or deleted bookmark takes its vector', async () => {
    useModel();
    const db = fresh();
    const { node } = addBookmark(db, { title: 'Lisbon holiday plans', url: 'https://plans.example/trip' });
    addBookmark(db, { title: 'Pasta night', url: 'https://food.example/pasta' });
    assert.equal(await fillBrowserVectors(db), 2);
    const r = await suggest(db, input('vacation', { bookmarks: loadBookmarks(db) }));
    assert.deepEqual(urls(r), ['bookmark:https://plans.example/trip']);
    assert.equal((r.items[0] as { meaning?: boolean }).meaning, true);
    // A new title is embedded again; the old vector does not linger.
    changeBookmark(db, node.id, { title: 'Dentist' });
    assert.equal(vectorRows(db, 'bookmark'), 1, 'the vector of the old words went');
    assert.deepEqual(await browsingAlike(db, 'vacation', ['bookmark'], { waitMs: 0 }), []);
    assert.equal(await fillBrowserVectors(db), 1);
    assert.equal(vectorRows(db, 'bookmark'), 2);
    removeBookmark(db, node.id);
    assert.equal(vectorRows(db, 'bookmark'), 1);
    // The folder's name goes with its bookmarks.
    const f = addBookmark(db, { title: 'Holidays', parent: 'bar' }).node;
    addBookmark(db, { title: 'Hotel', url: 'https://h.example/', parent: f.id });
    await fillBrowserVectors(db);
    assert.ok(embedded.includes('Hotel\nh.example\nHolidays'));
    syncBookmarkVectors(db, []);
    assert.equal(vectorRows(db, 'bookmark'), 0, 'no bookmarks: no vectors');
  });

  await check('by meaning: a page that goes from the history takes its vector: removed, cleared (all or since) or trimmed', async () => {
    useModel();
    const db = fresh();
    trip(db);
    await fillBrowserVectors(db);
    assert.equal(vectorRows(db, 'history'), 3);
    removeHistory(db, listHistory(db, { q: 'news' })[0].id);
    assert.equal(vectorRows(db, 'history'), 2);
    assert.deepEqual(await browsingAlike(db, 'news', ['history'], { waitMs: 0, min: -1 }).then((a) => a.length), 2);
    // A title that changes is embedded again.
    setTitle(db, 'https://food.example/carbonara', 'Pasta dinner');
    assert.equal(vectorRows(db, 'history'), 1);
    assert.equal(await fillBrowserVectors(db), 1);
    assert.ok(embedded.includes('Pasta dinner\nfood.example/carbonara'));
    // Since a time: the newer go.
    clearHistory(db, NOW - 2.5 * DAY);
    assert.equal(historyCount(db), 1);
    assert.equal(vectorRows(db, 'history'), 1, 'one page, one vector');
    assert.equal(browserVectorCounts(db).history, 1, 'and in memory too');
    clearHistory(db);
    assert.equal(vectorRows(db, 'history'), 0);
    assert.deepEqual(await browsingAlike(db, 'vacation', ['history', 'bookmark', 'download'], { waitMs: 0, min: -1 }), [], 'nothing of a cleared page is found');
    // The cap.
    const big = fresh();
    addVisit(big, 'https://travel.example/lisbon-guide', 'Lisbon guide', false, 1);
    await fillBrowserVectors(big);
    assert.equal(vectorRows(big, 'history'), 1);
    const insert = big.prepare("insert into browser_history (url, title, hay, at, visits, typed) values (?, '', ?, ?, 1, 0)");
    big.transaction(() => {
      for (let i = 0; i < MAX_HISTORY - 1; i++) insert.run(`https://bulk.example/${i}`, `bulk.example/${i}`, 10 + i);
    })();
    addVisit(big, 'https://one-more.example/', 'One more', false, NOW);
    assert.equal(historyCount(big), MAX_HISTORY);
    assert.equal(vectorRows(big, 'history'), 0, 'the oldest page went, and its vector');
    assert.equal(browserVectorCounts(big).history, 0);
  });

  await check('downloads: kept in a list that outlives the browser; the last 5 000; cleared since a time; found by meaning', async () => {
    useModel();
    const file = path.join(dir, `downloads-${process.pid}.db`);
    let db = openDb(file, { cacheMb: 8 });
    assert.equal(downloadCount(db), 0);
    addDownload(db, { name: 'Trip itinerary.pdf', path: '/home/me/Downloads/Trip itinerary.pdf', url: 'https://www.travel.example/files/it.pdf?sig=abc#x', at: NOW - 3 * DAY });
    addDownload(db, { name: 'report.zip', path: '', url: 'blob:https://a.example/123', failed: true, at: NOW - DAY });
    addDownload(db, { name: 'notes.txt', path: '/home/me/Downloads/notes.txt', url: 'https://a.example/notes.txt', at: NOW });
    db.close();
    db = openDb(file, { cacheMb: 8 });
    const all = listDownloads(db);
    assert.deepEqual(
      all.map((d) => [d.name, d.failed, d.url]),
      [
        ['notes.txt', false, 'https://a.example/notes.txt'],
        ['report.zip', true, ''],
        ['Trip itinerary.pdf', false, 'https://www.travel.example/files/it.pdf?sig=abc'],
      ],
      'kept across a restart, newest first, a blob address is not kept, a failed one says so',
    );
    assert.deepEqual(listDownloads(db, { q: 'travel.example ITINERARY' }).map((d) => d.name), ['Trip itinerary.pdf']);
    assert.equal(await fillBrowserVectors(db), 3);
    assert.deepEqual((await browsingAlike(db, 'vacation', ['download'], { waitMs: 0 })).map((a) => a.ref), [String(all[2].id)], 'the one about the trip');
    // Cleared since a time: the files are not touched, and the vectors go.
    assert.equal(clearDownloads(db, NOW - 2 * DAY), 2);
    assert.deepEqual(listDownloads(db).map((d) => d.name), ['Trip itinerary.pdf']);
    assert.equal(vectorRows(db, 'download'), 1);
    assert.equal(clearDownloads(db), 1);
    assert.equal(vectorRows(db, 'download'), 0);
    // The cap.
    const insert = db.prepare("insert into browser_downloads (name, path, url, at, failed) values (?, '', '', ?, 0)");
    db.transaction(() => {
      for (let i = 0; i < MAX_DOWNLOADS; i++) insert.run(`file-${i}`, 10 + i);
    })();
    addDownload(db, { name: 'newest.bin', path: '/x/newest.bin', at: NOW });
    assert.equal(downloadCount(db), MAX_DOWNLOADS);
    assert.equal(listDownloads(db, { q: 'file-0' }).length, 0, 'the oldest went');
    assert.equal(listDownloads(db, { limit: 1 })[0].name, 'newest.bin');
    db.close();
  });

  clearInterval(alive);
  console.log(`\n${passed}/${passed + failed} passed`);
}

void main().then(() => process.exit(process.exitCode ?? 0));
