// Script tests for your own browsing on the server (browsing.ts): what the address bar makes of words, the search page
// from your engine, your settings for it, the 409 outside the desktop app, the tabs kept between runs, the copy of a page, the permission memory and desk, the start rules of
// Do this here, and (when a Chromium is installed) the routes for real: your tabs, find, a copy, a page given to a session (its own tab) and
// taken back.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/browsing-test.ts
//   DATA_DIR=/tmp/hydor-test-browsing node dist/dev/browsing-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import Fastify from 'fastify';
import { BROWSING_KEY, inTabOrder, READER_DEFAULTS, type BrowserPermissionAsk } from '../../shared/browser.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { openDb, type DB } from '../db.ts';
import { HistoryRecorder } from './history.ts';
import type { Deps } from '../features/types.ts';
import type { CreateOpts } from '../sessions.ts';
import { addHighlight } from './highlights.ts';
import { addressOf, addressSent, barTarget, browsingPrefs, browsingRoutes, checkHandoffStart, DEFAULT_PREFS, desktopGate, groupWithAi, handoffLine, PermissionDesk, PermissionMemory, requireDesktop, restorable, savableTabs, savedTabs, searchUrl, setBrowsingPrefs, snapshotMarkdown, TabsKeeper } from './browsing.ts';
import { pickChrome } from './chrome.ts';
import { checkProposal, TabGroups } from './groups.ts';
import { addDownload, downloadCount } from './downloads.ts';
import { ruleFor } from '../guide/api.ts';
import { initPages, listPages, pageSource } from '../pages/store.ts';
import { browserRoutes } from './routes.ts';
import { addVisit, listHistory } from './history.ts';
import { find } from '../find/index.ts';
import { internalHeaders } from '../internal.ts';
import { shownUrl } from './outline.ts';
import { browserOf, closeAll, ensureBrowser, setBrowserDeps, SessionBrowser, takeClosedTab, closedTabList } from './session.ts';
import type { Tab } from './tab.ts';
import { setBrowserSettings, sessionOptions } from './settings.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

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
const refused = (status: number, re: RegExp) => (e: unknown) => e instanceof HttpError && e.status === status && re.test(e.message);
/** The settings that came with private tabs and the new browser settings, as they are before you change any (the app in English). */
const NEWER = { cookieBanners: true, translateTo: 'en', translateOffer: true, translateAlways: [], translateNever: [], translateNeverSites: [], darkPages: false, darkExcept: [], autoplay: false, reader: READER_DEFAULTS };

async function main() {
  // ---- the address bar ----
  await check('address bar: addresses are opened, with or without a scheme', () => {
    assert.equal(addressOf('example.com'), 'https://example.com/');
    assert.equal(addressOf('  www.example.co.uk/a/b?c=1 '), 'https://www.example.co.uk/a/b?c=1');
    assert.equal(addressOf('https://example.com/x y'), null, 'a space makes it a search');
    assert.equal(addressOf('http://example.com'), 'http://example.com/');
    assert.equal(addressOf('HTTPS://Example.com'), 'https://example.com/');
    assert.equal(addressOf('localhost:3000'), 'http://localhost:3000/');
    assert.equal(addressOf('localhost'), 'http://localhost/');
    assert.equal(addressOf('localhost:3000/app?x=1'), 'http://localhost:3000/app?x=1');
    assert.equal(addressOf('192.168.1.5'), 'http://192.168.1.5/');
    assert.equal(addressOf('192.168.1.5:8080/x'), 'http://192.168.1.5:8080/x');
    assert.equal(addressOf('[::1]:3000'), 'http://[::1]:3000/');
    assert.equal(addressOf('myserver:8080'), 'http://myserver:8080/');
    assert.equal(addressOf('printer.local'), 'http://printer.local/');
    assert.equal(addressOf('file:///home/me/a.html'), 'file:///home/me/a.html');
    assert.equal(addressOf('chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html'), 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html');
    assert.equal(addressOf('about:blank'), 'about:blank');
    assert.equal(addressOf('münchen.de'), 'https://xn--mnchen-3ya.de/');
  });
  await check('address bar: anything else is searched', () => {
    for (const w of ['hello', 'weather in paris', 'what is 1.5 + 2', 'notes.txt', 'app.js', '999.1.1.1', 'javascript:alert(1)', 'data:text/html,hi', 'mailto:a@b.c', 'chrome://settings', 'ftp://x.org/a', '', '   ', 'a.b', 'file:/x']) {
      assert.equal(addressOf(w), null, w);
    }
  });

  // ---- your settings ----
  const mem = () => {
    const store = new Map<string, string>();
    return { db: { prepare: (sql: string) => ({ get: (k: string) => (store.has(k) ? { v: store.get(k) } : undefined), run: (k: string, v: string) => void store.set(k, v) }) } as unknown as DB, store };
  };
  await check('prefs: Google, suggestions and the ad blocker on, until you change them', () => {
    const { db } = mem();
    assert.deepEqual(browsingPrefs(db), { home: 'https://www.google.com/', engine: 'google', suggest: true, adblock: true, allowAds: [], ...NEWER });
  });
  await check('prefs: checked, kept, and a bad one keeps nothing', () => {
    const { db, store } = mem();
    assert.equal(setBrowsingPrefs(db, { home: 'example.com' }).home, 'https://example.com/', 'a bare name is a web address');
    assert.equal(setBrowsingPrefs(db, { home: 'http://localhost:3000/start' }).home, 'http://localhost:3000/start');
    for (const home of ['javascript:alert(1)', 'file:///etc/passwd', 'about:blank', 'two words', '', 7, null]) assert.throws(() => setBrowsingPrefs(db, { home }), refused(400, /home page/), String(home));
    assert.throws(() => setBrowsingPrefs(db, { engine: 'altavista' }), refused(400, /search engine/));
    assert.throws(() => setBrowsingPrefs(db, { engine: 'custom' }), refused(400, /search page/), 'custom needs its page');
    assert.throws(() => setBrowsingPrefs(db, { customSearch: 'https://s.example/?q=' }), refused(400, /%s/));
    assert.throws(() => setBrowsingPrefs(db, { customSearch: 'ftp://s.example/?q=%s' }), refused(400, /%s/));
    assert.throws(() => setBrowsingPrefs(db, { customSearch: 'javascript:%s' }), refused(400, /%s/));
    assert.throws(() => setBrowsingPrefs(db, { suggest: 'yes' }), refused(400, /true or false/));
    assert.throws(() => setBrowsingPrefs(db, { adblock: 1 }), refused(400, /true or false/));
    assert.equal(browsingPrefs(db).home, 'http://localhost:3000/start', 'the failed changes kept nothing');
    const p = setBrowsingPrefs(db, { engine: 'custom', customSearch: 'https://s.example/find?q=%s', suggest: false, adblock: false, allowAds: ['https://www.Shop.example/cart', 'bad host!', 'shop.example'] });
    assert.deepEqual(p, { home: 'http://localhost:3000/start', engine: 'custom', customSearch: 'https://s.example/find?q=%s', suggest: false, adblock: false, allowAds: ['shop.example'], ...NEWER });
    assert.throws(() => setBrowsingPrefs(db, { customSearch: '' }), refused(400, /search page/), 'custom cannot lose its page');
    assert.equal(setBrowsingPrefs(db, { engine: 'bing', customSearch: null }).customSearch, undefined);
    // What is kept is checked when read, too.
    store.set('browser.browsing.prefs', JSON.stringify({ home: 'javascript:x', engine: 'custom', suggest: 'no', allowAds: 'a.com b.com' }));
    assert.deepEqual(browsingPrefs(db), { home: 'https://www.google.com/', engine: 'google', suggest: true, adblock: true, allowAds: ['a.com', 'b.com'], ...NEWER });
    store.set('browser.browsing.prefs', 'junk');
    assert.equal(browsingPrefs(db).engine, 'google');
  });
  await check('prefs: the new settings are on or off, in the app’s language, and empty lists, until you change them', () => {
    const { db, store } = mem();
    assert.deepEqual(browsingPrefs(db), { ...DEFAULT_PREFS, ...NEWER });
    assert.equal(browsingPrefs(db).translateTo, 'en');
    store.set('ui.language', 'de');
    assert.equal(browsingPrefs(db).translateTo, 'de', 'the app’s own language');
    // Changing something else does not pin the language: it keeps following the app's.
    setBrowsingPrefs(db, { autoplay: true });
    assert.equal(browsingPrefs(db).translateTo, 'de');
    store.set('ui.language', 'zh');
    assert.equal(browsingPrefs(db).translateTo, 'zh');
    assert.equal(setBrowsingPrefs(db, { translateTo: 'fr' }).translateTo, 'fr');
    store.set('ui.language', 'el');
    assert.equal(browsingPrefs(db).translateTo, 'fr', 'a language you picked stays');
    assert.equal(browsingPrefs(db).autoplay, true);
  });
  await check('prefs: the new yes-or-no settings are kept, and anything else is 400 with nothing kept', () => {
    const { db } = mem();
    for (const k of ['cookieBanners', 'translateOffer', 'darkPages', 'autoplay'] as const) {
      assert.throws(() => setBrowsingPrefs(db, { [k]: 'yes' }), refused(400, /true or false/), k);
      assert.throws(() => setBrowsingPrefs(db, { [k]: 0 }), refused(400, /true or false/), k);
      assert.equal(setBrowsingPrefs(db, { [k]: !DEFAULT_PREFS[k] })[k], !DEFAULT_PREFS[k], k);
      assert.equal(setBrowsingPrefs(db, { [k]: DEFAULT_PREFS[k] })[k], DEFAULT_PREFS[k], k);
    }
    const p = setBrowsingPrefs(db, { cookieBanners: false, darkPages: true });
    assert.deepEqual([p.cookieBanners, p.darkPages, p.translateOffer, p.autoplay], [false, true, true, false]);
    assert.throws(() => setBrowsingPrefs(db, { autoplay: true, darkPages: 'x' }), refused(400, /true or false/));
    assert.equal(browsingPrefs(db).autoplay, false, 'a bad change keeps none of its parts');
  });
  await check('prefs: translateTo is one of the languages pages can be translated into', () => {
    const { db } = mem();
    for (const v of ['xx', '', 'EN', 7, null, ['de']]) assert.throws(() => setBrowsingPrefs(db, { translateTo: v }), refused(400, /translateTo/), String(v));
    assert.equal(setBrowsingPrefs(db, { translateTo: 'zh-TW' }).translateTo, 'zh-TW');
    assert.equal(setBrowsingPrefs(db, { translateTo: 'ga' }).translateTo, 'ga');
  });
  await check('prefs: always and never languages are codes, once each, at most 100, and no language is in both', () => {
    const { db, store } = mem();
    for (const k of ['translateAlways', 'translateNever'] as const) {
      for (const v of ['de', { 0: 'de' }, [1], ['xx'], ['de', 'nope'], null]) assert.throws(() => setBrowsingPrefs(db, { [k]: v }), refused(400, new RegExp(k)), `${k} ${JSON.stringify(v)}`);
      assert.throws(() => setBrowsingPrefs(db, { [k]: Array.from({ length: 101 }, () => 'de') }), refused(400, new RegExp(k)), 'more than 100 (even as one language)');
      assert.deepEqual(setBrowsingPrefs(db, { [k]: ['fr', 'de', 'fr'] })[k], ['fr', 'de'], 'each once');
      assert.deepEqual(setBrowsingPrefs(db, { [k]: [] })[k], []);
    }
    setBrowsingPrefs(db, { translateAlways: ['fr', 'de'], translateNever: ['ja', 'ko'] });
    // Setting one takes its languages out of the other.
    let p = setBrowsingPrefs(db, { translateAlways: ['fr', 'ja'] });
    assert.deepEqual([p.translateAlways, p.translateNever], [['fr', 'ja'], ['ko']]);
    p = setBrowsingPrefs(db, { translateNever: ['fr', 'ru'] });
    assert.deepEqual([p.translateAlways, p.translateNever], [['ja'], ['fr', 'ru']]);
    // The same language in both of one change is refused, and nothing is kept.
    assert.throws(() => setBrowsingPrefs(db, { translateAlways: ['it', 'es'], translateNever: ['es'] }), refused(400, /both/));
    assert.deepEqual([browsingPrefs(db).translateAlways, browsingPrefs(db).translateNever], [['ja'], ['fr', 'ru']]);
    p = setBrowsingPrefs(db, { translateAlways: ['it'], translateNever: ['es'] });
    assert.deepEqual([p.translateAlways, p.translateNever], [['it'], ['es']]);
    // What is kept is checked when read: bad codes go, and "always" wins where the kept lists disagree.
    store.set('browser.browsing.prefs', JSON.stringify({ translateAlways: ['de', 'xx', 'de', 3], translateNever: ['de', 'fr'] }));
    p = browsingPrefs(db);
    assert.deepEqual([p.translateAlways, p.translateNever], [['de'], ['fr']]);
    store.set('browser.browsing.prefs', JSON.stringify({ translateAlways: 'de', translateNever: { a: 1 } }));
    assert.deepEqual([browsingPrefs(db).translateAlways, browsingPrefs(db).translateNever], [[], []]);
    store.set('browser.browsing.prefs', JSON.stringify({ translateAlways: Array.from({ length: 300 }, (_, i) => ['de', 'fr', 'es'][i % 3]) }));
    assert.deepEqual(browsingPrefs(db).translateAlways, ['de', 'fr', 'es']);
  });
  await check('prefs: sites for translation and dark pages are cleaned like the ad blocker’s', () => {
    const { db, store } = mem();
    const p = setBrowsingPrefs(db, { translateNeverSites: ['https://www.Bank.example/login', 'bad host!', 'bank.example', 'x.example:8080'], darkExcept: 'a.example, B.example' });
    assert.deepEqual(p.translateNeverSites, ['bank.example', 'x.example:8080']);
    assert.deepEqual(p.darkExcept, ['a.example', 'b.example']);
    assert.deepEqual(p.allowAds, [], 'the ad blocker’s list is its own');
    assert.deepEqual(setBrowsingPrefs(db, { darkExcept: [] }).darkExcept, []);
    store.set('browser.browsing.prefs', JSON.stringify({ translateNeverSites: { a: 1 }, darkExcept: ['ok.example', '??'] }));
    assert.deepEqual([browsingPrefs(db).translateNeverSites, browsingPrefs(db).darkExcept], [[], ['ok.example']]);
  });
  await check('prefs: reader view’s look is changed in parts, each checked', () => {
    const { db, store } = mem();
    assert.deepEqual(browsingPrefs(db).reader, { size: 19, theme: 'auto', font: 'serif' });
    assert.deepEqual(setBrowsingPrefs(db, { reader: { size: 21 } }).reader, { size: 21, theme: 'auto', font: 'serif' }, 'the rest is kept');
    assert.deepEqual(setBrowsingPrefs(db, { reader: { theme: 'sepia' } }).reader, { size: 21, theme: 'sepia', font: 'serif' });
    assert.deepEqual(setBrowsingPrefs(db, { reader: { font: 'sans', size: 14 } }).reader, { size: 14, theme: 'sepia', font: 'sans' });
    assert.deepEqual(setBrowsingPrefs(db, { reader: { size: 28, theme: 'dark', font: 'serif' } }).reader, { size: 28, theme: 'dark', font: 'serif' });
    assert.deepEqual(setBrowsingPrefs(db, { reader: {} }).reader, { size: 28, theme: 'dark', font: 'serif' }, 'nothing given, nothing changed');
    for (const size of [13, 29, 20.5, '20', null, NaN, 0]) assert.throws(() => setBrowsingPrefs(db, { reader: { size } }), refused(400, /text size/), String(size));
    for (const theme of ['night', 'AUTO', '', 3]) assert.throws(() => setBrowsingPrefs(db, { reader: { theme } }), refused(400, /theme/), String(theme));
    for (const font of ['mono', 7, null]) assert.throws(() => setBrowsingPrefs(db, { reader: { font } }), refused(400, /font/), String(font));
    for (const reader of ['big', 5, null, [], [21]]) assert.throws(() => setBrowsingPrefs(db, { reader }), refused(400, /reader/), JSON.stringify(reader));
    assert.throws(() => setBrowsingPrefs(db, { reader: { size: 20, theme: 'bad' } }), refused(400, /theme/));
    assert.equal(browsingPrefs(db).reader.size, 28, 'a bad change keeps none of its parts');
    store.set('browser.browsing.prefs', JSON.stringify({ reader: { size: 99, theme: 'sepia', font: 'mono' } }));
    assert.deepEqual(browsingPrefs(db).reader, { size: 19, theme: 'sepia', font: 'serif' }, 'what is kept is checked part by part');
    store.set('browser.browsing.prefs', JSON.stringify({ reader: 'x' }));
    assert.deepEqual(browsingPrefs(db).reader, READER_DEFAULTS);
    assert.notEqual(browsingPrefs(db).reader, READER_DEFAULTS, 'a copy: the defaults are never changed');
  });
  await check('the address bar searches with your engine, custom with its own page', () => {
    const p = { ...DEFAULT_PREFS };
    assert.equal(barTarget(p, 'a b&c'), 'https://www.google.com/search?q=a%20b%26c');
    assert.equal(barTarget(p, 'example.com'), 'https://example.com/');
    for (const engine of ['duckduckgo', 'bing', 'brave', 'ecosia', 'startpage'] as const) assert.match(searchUrl({ ...p, engine }, 'x y'), /^https:\/\/[^/]+\/.*[?&]q=x%20y$/, engine);
    assert.equal(searchUrl({ ...p, engine: 'custom', customSearch: 'https://s.example/?q=%s&again=%s' }, ' hi there '), 'https://s.example/?q=hi%20there&again=hi%20there');
    assert.equal(searchUrl({ ...p, engine: 'custom' }, 'x'), 'https://www.google.com/search?q=x', 'custom without its page is Google');
  });
  await check('your own browser is in the desktop app: 409 elsewhere', () => {
    assert.equal(desktopGate.inside(), false, 'these tests do not run in the desktop app');
    assert.throws(() => requireDesktop(), refused(409, /desktop app/));
  });

  // ---- the tabs kept ----
  await check('tabs kept: blank ones left out, at most 30, the front one remembered', () => {
    const t = (url: string, active = false) => ({ url, active });
    assert.deepEqual(savableTabs([t('about:blank'), t('https://a.com/', true), t('chrome-error://chromewebdata/'), t('https://b.com/')]), { tabs: ['https://a.com/', 'https://b.com/'], active: 0 });
    assert.deepEqual(savableTabs([t('https://a.com/'), t('about:blank', true)]), { tabs: ['https://a.com/'], active: 0 }, 'the front one is blank: the last stays in front');
    const many = Array.from({ length: 40 }, (_, i) => t(`https://s${i}.com/`));
    assert.equal(savableTabs(many).tabs.length, 30);
    assert.equal(restorable('javascript:alert(1)'), false);
    assert.equal(restorable('file:///a'), true);
    assert.deepEqual(savedTabs('{"tabs":["https://a.com/","javascript:x","about:blank","https://b.com/"],"active":1}'), { tabs: ['https://a.com/', 'https://b.com/'], active: 1 });
    assert.deepEqual(savedTabs('{"tabs":["https://a.com/"],"active":7}'), { tabs: ['https://a.com/'], active: 0 });
    assert.deepEqual(savedTabs('not json'), { tabs: [], active: 0 });
    assert.deepEqual(savedTabs(undefined), { tabs: [], active: 0 });
  });
  await check('tabs kept: written a little after a change, once, and when the browser closes with what it had', async () => {
    const written: string[] = [];
    const k = new TabsKeeper((j) => written.push(j), 40);
    const v = (urls: string[], open = true) => ({ open, tabs: urls.map((url, i) => ({ id: String(i), title: '', url, active: i === 0 })) });
    k.seen(v(['https://a.com/']));
    k.seen(v(['https://a.com/', 'https://b.com/']));
    assert.equal(written.length, 0);
    await new Promise((r) => setTimeout(r, 80));
    assert.deepEqual(written.map((j) => JSON.parse(j).tabs), [['https://a.com/', 'https://b.com/']]);
    k.seen(v(['https://a.com/', 'https://b.com/']));
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(written.length, 1, 'no change, no write');
    k.seen(v(['https://c.com/']));
    k.seen(v([], false));
    assert.deepEqual(written.map((j) => JSON.parse(j).tabs).at(-1), ['https://c.com/'], 'closing writes what it had, not the empty list it shows');
  });

  await check('tab groups: kept with the tabs by place, checked when read back, none when no tab is in one', () => {
    const t = (url: string, group?: string, active = false) => ({ url, active, group });
    const groups = [
      { id: 'g1', name: 'Trip', color: 'green' as const },
      { id: 'g2', name: 'Work', color: 'blue' as const, folded: true },
      { id: 'g3', name: 'Empty', color: 'red' as const },
    ];
    const kept = savableTabs([t('https://a.com/', 'g2'), t('about:blank', 'g1'), t('https://b.com/'), t('https://c.com/', 'g1', true), t('https://d.com/', 'g2')], groups);
    assert.deepEqual(kept.tabs, ['https://a.com/', 'https://b.com/', 'https://c.com/', 'https://d.com/']);
    assert.deepEqual(kept.groups, [groups[0], groups[1]], 'a group with no tab left is not kept');
    assert.deepEqual(kept.of, [1, null, 0, 1]);
    assert.equal(kept.active, 2);
    assert.deepEqual(savableTabs([t('https://a.com/')], groups), { tabs: ['https://a.com/'], active: 0 }, 'no tab in a group: nothing of groups is written');
    const back = savedTabs(JSON.stringify(kept));
    assert.deepEqual(back.groups?.map((g) => [g.id, g.name, g.color, !!g.folded]), [['g1', 'Trip', 'green', false], ['g2', 'Work', 'blue', true]]);
    assert.deepEqual(back.of, [1, null, 0, 1]);
    // A tab dropped for its address leaves its place out; a place that is no group is none; a bad colour is grey, a long name is cut.
    const odd = savedTabs('{"tabs":["https://a.com/","javascript:x","https://b.com/"],"active":0,"groups":[{"id":"x","name":"' + 'n'.repeat(80) + '","color":"pink"}],"of":[0,0,7]}');
    assert.deepEqual(odd.of, [0, null]);
    assert.equal(odd.groups?.[0].color, 'grey');
    assert.equal(odd.groups?.[0].name.length, 40);
    assert.equal(savedTabs('{"tabs":["https://a.com/"],"active":0,"groups":[{"id":"x"}],"of":[]}').groups, undefined, 'places that do not match the tabs: none');
  });
  await check('tab groups: made, renamed, moved, folded, taken apart, and gone with their last tab', () => {
    const g = new TabGroups();
    const a = g.create(['t1', 't2'], { name: '  Reading \n list ', color: 'amber' });
    assert.equal(a.name, 'Reading list');
    const b = g.create(['t3']);
    assert.notEqual(b.color, 'grey');
    assert.notEqual(b.color, 'amber', 'a colour not in use yet');
    assert.throws(() => g.create(['t4'], { color: 'pink' }), refused(400, /colour/));
    g.put(['t2'], b.id);
    assert.equal(g.groupOf('t2'), b.id);
    assert.deepEqual(g.list(['t1', 't2', 't3']).map((x) => x.id), [a.id, b.id]);
    assert.deepEqual(g.list(['t3']).map((x) => x.id), [b.id], 'a group with no open tab is gone');
    g.update(b.id, { name: 'Mail', color: 'red', folded: true });
    assert.deepEqual(g.list(['t3']), [{ id: b.id, name: 'Mail', color: 'red', folded: true }]);
    g.update(b.id, { folded: false });
    assert.equal(g.list(['t3'])[0].folded, undefined);
    assert.throws(() => g.update(b.id, { folded: 'yes' }), refused(400, /true or false/));
    assert.throws(() => g.update('nope', {}), refused(404, /No such group/));
    assert.throws(() => g.put(['t1'], 'nope'), refused(404, /No such group/));
    const snap = g.snapshot();
    assert.deepEqual(g.ungroup(b.id).sort(), ['t2', 't3']);
    assert.equal(g.groupOf('t3'), undefined);
    g.restore(snap, new Set(['t3']));
    assert.equal(g.groupOf('t3'), b.id);
    assert.equal(g.groupOf('t1'), undefined, 'a tab that is not open any more is not put back');
    for (let i = 0; i < 25; i++) if (g.groups.length < 20) g.create([`x${i}`]);
    assert.throws(() => g.create(['y']), refused(409, /20 groups/));
  });
  await check('tab groups: the tab column order is each group with its tabs, then the others', () => {
    const tabs = [{ id: '1' }, { id: '2', group: 'b' }, { id: '3' }, { id: '4', group: 'a' }, { id: '5', group: 'b' }, { id: '6', group: 'gone' }];
    const groups = [{ id: 'a', name: 'A', color: 'blue' as const }, { id: 'b', name: 'B', color: 'red' as const }, { id: 'c', name: 'C', color: 'grey' as const }];
    assert.deepEqual(
      inTabOrder(tabs, groups).map((x) => [x.group?.id ?? null, x.tabs.map((t) => t.id)]),
      [['a', ['4']], ['b', ['2', '5']], [null, ['1', '3', '6']]],
    );
    assert.deepEqual(inTabOrder(tabs).map((x) => x.tabs.length), [6]);
  });
  await check('group my tabs: what the helper is sent, and its answer checked', () => {
    assert.equal(addressSent('https://shop.example/cart/1?token=secret#pay'), 'https://shop.example/cart/1');
    assert.equal(addressSent('file:///home/me/secret/plan.pdf?x=1'), 'file:plan.pdf', 'a file: its name only');
    assert.equal(addressSent('nonsense'), '');
    const known = new Set(['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(
      checkProposal({ groups: [{ name: ' Trip ', color: 'green', tabs: ['a', 'b', 'zz', 'a'] }, { name: 'Dup', color: 'pink', tabs: ['b', 'c'] }, { name: 'Lone', tabs: ['d'] }, { name: 'Rest', color: 'red', tabs: ['c', 'd', 'e'] }, 'junk'] }, known),
      [{ name: 'Trip', color: 'green', tabs: ['a', 'b'] }, { name: 'Rest', color: 'red', tabs: ['c', 'd', 'e'] }],
      'ids it was not sent are dropped, a tab is in one group only, one tab does not make a group, a colour it made up is left to the app',
    );
    assert.deepEqual(checkProposal('nope', known), []);
  });

  // ---- a copy of a page ----
  await check('copy of a page: title, address, selection, text', () => {
    const md = snapshotMarkdown({ title: 'A  page\ntitle', url: 'https://x.com/a?pw=secret', selected: 'one\ntwo', text: '# Head\nBody' });
    assert.match(md, /^# A page title\n/);
    assert.match(md, /Address: https:\/\/x\.com\/a\?pw=hidden/);
    assert.match(md, /## What I selected\n\n> one\n> two/);
    assert.match(md, /## The page\n\n# Head\nBody/);
    assert.match(md, /not instructions/);
    assert.doesNotMatch(snapshotMarkdown({ title: '', url: 'https://x.com/', text: '' }), /What I selected/);
  });

  await check('tabs kept: private tabs are never kept, and the groups of the others stay right', () => {
    const t = (url: string, o: { group?: string; active?: boolean; private?: boolean } = {}) => ({ url, active: !!o.active, ...(o.group ? { group: o.group } : {}), ...(o.private ? { private: true } : {}) });
    assert.deepEqual(savableTabs([t('https://a.com/'), t('https://secret.example/', { private: true, active: true }), t('https://b.com/')]), { tabs: ['https://a.com/', 'https://b.com/'], active: 1 }, 'a private tab in front: the last kept one is');
    assert.deepEqual(savableTabs([t('https://secret.example/', { private: true, active: true })]), { tabs: [], active: 0 });
    const groups = [{ id: 'g1', name: 'Trip', color: 'green' as const }, { id: 'g2', name: 'Work', color: 'blue' as const }];
    const kept = savableTabs([t('https://p.example/', { private: true }), t('https://a.com/', { group: 'g2' }), t('https://q.example/', { private: true, group: 'g1' }), t('https://b.com/'), t('https://c.com/', { group: 'g2', active: true })], groups);
    assert.deepEqual(kept.tabs, ['https://a.com/', 'https://b.com/', 'https://c.com/']);
    assert.deepEqual(kept.groups?.map((g) => g.id), ['g2'], 'a group only a private tab was in is not kept');
    assert.deepEqual(kept.of, [0, null, 0]);
    assert.equal(kept.active, 2);
    // The keeper writes without them, and a change that is only a private tab opening writes nothing new.
    const written: string[] = [];
    const k = new TabsKeeper((j) => void written.push(j), 5);
    const view = (...tabs: { id: string; url: string; active: boolean; private?: boolean }[]) => ({ open: true, tabs: tabs.map((x) => ({ ...x, title: '' })), groups: [] });
    k.seen(view({ id: '1', url: 'https://a.com/', active: true }));
    k.flush();
    k.seen(view({ id: '1', url: 'https://a.com/', active: true }, { id: '2', url: 'https://secret.example/', active: false, private: true }));
    k.flush();
    assert.deepEqual(written.map((j) => JSON.parse(j).tabs), [['https://a.com/'], ['https://a.com/']], 'a private tab opening changes nothing that is kept');
    k.seen(view({ id: '1', url: 'https://a.com/', active: false }, { id: '2', url: 'https://secret.example/', active: true, private: true }));
    k.flush();
    assert.ok(written.every((j) => !j.includes('secret')));
  });

  // ---- permissions ----
  await check('permissions: remembered per site and permission, answered at once when known', () => {
    const store = new Map<string, string>();
    const mem = new PermissionMemory({ get: (k) => store.get(k), set: (k, v) => void store.set(k, v) });
    const shown: (BrowserPermissionAsk | null)[] = [];
    const replies: string[] = [];
    const desk = new PermissionDesk(mem, { show: (a) => void shown.push(a), reply: (c, id, allow) => void replies.push(`${c}:${id}:${allow}`) }, 50);
    desk.request({ conn: 'c1', target: 't1', id: 'a', permission: 'geolocation', origin: 'https://maps.example' });
    desk.request({ conn: 'c1', target: 't1', id: 'b', permission: 'media', origin: 'https://meet.example', media: ['video', 'audio'] });
    assert.equal(shown.at(-1)?.id, 'a', 'one at a time, the first');
    assert.equal(desk.count, 2);
    assert.equal(desk.answer('a', true), true);
    assert.equal(shown.at(-1)?.id, 'b', 'then the next');
    assert.deepEqual(replies, ['c1:a:true']);
    assert.equal(desk.answer('a', true), false, 'not twice');
    desk.answer('b', false, false);
    assert.deepEqual(replies.at(-1), 'c1:b:false');
    assert.equal(mem.known('https://meet.example', 'media', ['audio', 'video']), undefined, 'not remembered when you said not to');
    // Asked again: the first answer is known, the second is asked again.
    desk.request({ conn: 'c2', target: 't9', id: 'c', permission: 'geolocation', origin: 'https://maps.example' });
    assert.equal(replies.at(-1), 'c2:c:true');
    assert.equal(desk.count, 0);
    assert.equal(shown.at(-1), null);
    desk.answer('x', true);
    // Another site, another permission, another set of media: not the same.
    assert.equal(mem.known('https://other.example', 'geolocation'), undefined);
    assert.equal(mem.known('https://maps.example', 'notifications'), undefined);
    mem.remember('https://meet.example', 'media', ['video'], false);
    assert.equal(mem.known('https://meet.example', 'media', ['video']), false);
    assert.equal(mem.known('https://meet.example', 'media', ['video', 'audio']), undefined);
    assert.deepEqual(mem.list().map((x) => `${x.origin} ${x.permission}${x.media ? ` ${x.media.join('+')}` : ''} ${x.allow}`).sort(), ['https://maps.example geolocation true', 'https://meet.example media video false']);
    assert.equal(mem.forget('https://maps.example', 'geolocation'), true);
    assert.equal(mem.forget('https://maps.example', 'geolocation'), false);
  });
  await check('permissions: a private tab’s request is asked, its answer is not kept, and only a kept refusal applies to it', () => {
    const store = new Map<string, string>();
    const mem = new PermissionMemory({ get: (k) => store.get(k), set: (k, v) => void store.set(k, v) });
    const replies: string[] = [];
    const shown: (BrowserPermissionAsk | null)[] = [];
    const desk = new PermissionDesk(mem, { show: (a) => void shown.push(a), reply: (c, id, allow) => void replies.push(`${c}:${id}:${allow}`) }, 5000);
    const ask = (id: string, origin: string, ephemeral: boolean, permission = 'geolocation') => desk.request({ conn: 'c', target: ephemeral ? 'p1' : 't1', id, permission, origin, ...(ephemeral ? { ephemeral } : {}) });
    // Nothing known: asked, and an answer that would be kept is not.
    ask('a', 'https://maps.example', true);
    assert.equal(shown.at(-1)?.id, 'a');
    assert.equal(desk.answer('a', true), true, 'remember is on by default');
    assert.deepEqual(replies, ['c:a:true']);
    assert.equal(mem.known('https://maps.example', 'geolocation'), undefined, 'not remembered');
    assert.deepEqual(mem.list(), []);
    assert.equal(store.size, 0, 'nothing written at all');
    ask('b', 'https://maps.example', true);
    assert.equal(replies.length, 1, 'asked again: the Allow of a private tab did not carry over');
    desk.answer('b', false, true);
    assert.equal(mem.known('https://maps.example', 'geolocation'), undefined, 'a refusal in a private tab is not kept either');
    // An Allow kept for your normal tabs does not apply to a private one: it asks. A normal tab still gets it at once.
    mem.remember('https://meet.example', 'media', ['audio'], true);
    desk.request({ conn: 'c', target: 't1', id: 'n', permission: 'media', origin: 'https://meet.example', media: ['audio'] });
    assert.equal(replies.at(-1), 'c:n:true');
    desk.request({ conn: 'c', target: 'p1', id: 'p', permission: 'media', origin: 'https://meet.example', media: ['audio'], ephemeral: true });
    assert.equal(replies.at(-1), 'c:n:true', 'nothing new was answered');
    assert.equal(desk.count, 1);
    assert.equal(shown.at(-1)?.id, 'p');
    desk.answer('p', true);
    assert.equal(mem.known('https://meet.example', 'media', ['audio']), true, 'the kept Allow is as it was');
    assert.equal(replies.at(-1), 'c:p:true');
    // A refusal kept for normal tabs applies at once to a private one.
    mem.remember('https://ads.example', 'notifications', undefined, false);
    ask('r', 'https://ads.example', true, 'notifications');
    assert.equal(replies.at(-1), 'c:r:false');
    assert.equal(desk.count, 0);
    assert.equal(shown.at(-1), null);
    // The words in the ask say nothing of privacy: it is the page's, as any other.
    ask('s', 'https://s.example', true);
    assert.deepEqual(Object.keys(shown.at(-1) ?? {}).sort(), ['id', 'origin', 'permission', 'tab']);
    desk.answer('s', false);
  });

  await check('permissions: an unanswered request is refused after a while, and when its tab goes', async () => {
    const mem = new PermissionMemory({ get: () => undefined, set: () => {} });
    const replies: string[] = [];
    const desk = new PermissionDesk(mem, { show: () => {}, reply: (_c, id, allow) => void replies.push(`${id}:${allow}`) }, 30);
    desk.request({ conn: 'c', target: 't1', id: 'late', permission: 'midi', origin: 'https://a.example' });
    await new Promise((r) => setTimeout(r, 70));
    assert.deepEqual(replies, ['late:false']);
    desk.request({ conn: 'c', target: 'gone', id: 'g', permission: 'midi', origin: 'https://a.example' });
    desk.prune((t) => t !== 'gone');
    assert.deepEqual(replies, ['late:false', 'g:false']);
    assert.equal(desk.count, 0);
  });

  // ---- Do this here: the start rules ----
  const env = { enabled: true, tabUrl: (id: string) => (id === 'tab1' ? 'https://mail.example.com/inbox' : id === 'blank' ? 'about:blank' : undefined) };
  const base = (o: Partial<CreateOpts>): CreateOpts => ({ agent: 'claude', cwd: '/tmp', ...o }) as CreateOpts;
  await check('do this here: Claude Code and Custom only, a tab that is open on a website', () => {
    const plain = base({});
    assert.equal(checkHandoffStart(plain, env), plain, 'no handoff, no change');
    const ok = checkHandoffStart(base({ extra: { browserHandoff: { tab: 'tab1' }, browser: { profile: 'x' } } }), env);
    assert.equal(ok.extra?.browserOnly, true);
    assert.deepEqual(ok.extra?.browserHandoff, { tab: 'tab1' });
    assert.equal(ok.extra?.browser, undefined, 'no other profile');
    const custom = checkHandoffStart(base({ agent: 'acp', acpAgent: CONSOLE_ID, extra: { browserHandoff: { tab: 'tab1' } } }), env);
    assert.equal(custom.extra?.browserOnly, true);
    const hand = (o: Partial<CreateOpts>, e = env) => () => checkHandoffStart(base({ extra: { browserHandoff: { tab: 'tab1' } }, ...o }), e);
    assert.throws(hand({ agent: 'codex' }), refused(400, /Only Claude Code and Custom/));
    assert.throws(hand({ agent: 'acp', acpAgent: 'gemini' }), refused(400, /Only Claude Code and Custom/));
    assert.throws(hand({ extra: { browserHandoff: { tab: 'tab1' }, confidential: true } }), refused(400, /confidential/));
    assert.throws(hand({ extra: { browserHandoff: { tab: 'tab1' }, swarm: true } }), refused(400, /Swarm/));
    assert.throws(hand({ extra: { browserHandoff: { tab: 'tab1' }, parent: 'claude:x' } }), refused(400, /subagent/));
    assert.throws(hand({}, { ...env, enabled: false }), refused(409, /turned off/));
    assert.throws(() => checkHandoffStart(base({ extra: { browserHandoff: { tab: 'gone' } } }), env), refused(404, /not open/));
    assert.throws(() => checkHandoffStart(base({ extra: { browserHandoff: { tab: 'blank' } } }), env), refused(409, /website/));
    assert.throws(() => checkHandoffStart(base({ extra: { browserHandoff: {} as { tab: string } } }), env), refused(400, /which tab/));
  });
  await check('do this here: a private tab can’t be given to an agent', () => {
    const e2 = { ...env, tabUrl: (id: string) => (id === 'priv' ? 'https://mail.example.com/inbox' : env.tabUrl(id)), tabPrivate: (id: string) => id === 'priv' };
    const give = (tab: string, e = e2) => () => checkHandoffStart(base({ extra: { browserHandoff: { tab } } }), e);
    assert.throws(give('priv'), refused(409, /private tab can’t be given to an agent: its sign-ins are kept apart from the browser agents use/));
    assert.equal(give('tab1')().extra?.browserOnly, true, 'a normal tab is given as before');
    assert.throws(give('gone'), refused(404, /not open/), 'a tab that is not there is still 404');
  });
  await check('do this here: the first message’s line', () => {
    const l = handoffLine({ title: 'Inbox “(3)”\nSneaky', url: 'https://mail.example.com/inbox?pw=abc', site: 'mail.example.com' });
    assert.match(l, /“Inbox \(3\) Sneaky” at https:\/\/mail\.example\.com\/inbox\?pw=hidden is open in your browser/);
    assert.match(l, /kept to mail\.example\.com/);
    assert.match(l, /browser_read/);
  });

  // ---- private tabs, with a made-up Chromium ----
  type FakeTab = Tab & { url: string };
  const fakeBrowser = () => {
    const log = { disposed: [] as string[], contexts: 0, tabs: 0, failNext: false };
    let b: SessionBrowser;
    const tab = (url: string, incognito: boolean) => ({ targetId: `t${++log.tabs}`, url, title: url, incognito, closed: false, casting: false, loading: false, navigating: false, viewport: { w: 1280, h: 800 }, owner: b }) as unknown as FakeTab;
    const chromium = {
      closed: false,
      contexts: new Map<string, SessionBrowser>(),
      privateContext: async (owner: SessionBrowser) => {
        if (!owner.privateCtx) {
          owner.privateCtx = `ctx${++log.contexts}`;
          chromium.contexts.set(owner.privateCtx, owner);
        }
        return owner.privateCtx;
      },
      disposeContext: async (c: string) => void (log.disposed.push(c), chromium.contexts.delete(c)),
      newTab: async (owner: SessionBrowser, ctx: string | undefined) => {
        if (log.failNext) {
          log.failNext = false;
          throw new Error('The new tab did not open');
        }
        const t = tab('about:blank', !!ctx && ctx === owner.privateCtx);
        owner.adopt(t);
        return t;
      },
    };
    b = new SessionBrowser(BROWSING_KEY, '/tmp', chromium as never, '');
    const open = async (url: string, o: { private?: boolean } = {}) => {
      const t = await b.newTab(o);
      t.url = url;
      return t;
    };
    return { b, log, open, chromium };
  };
  await check('private tabs: made in a context of their own; it goes with the last private tab; none are kept in the closed tabs', async () => {
    setBrowserDeps({ db: openDb(path.join(process.env.DATA_DIR!, 'browsing-private.db')), toSubscribers: () => {} } as unknown as Deps);
    while (takeClosedTab()) {
      // Start from none.
    }
    const { b, log, open, chromium } = fakeBrowser();
    const n1 = await open('https://news.example/');
    assert.equal(n1.incognito, false);
    assert.equal(b.privateCtx, undefined, 'no private context until a private tab');
    const p1 = await open('https://secret.example/one', { private: true });
    const p2 = await open('https://secret.example/two', { private: true });
    assert.deepEqual([p1.incognito, p2.incognito, b.privateCtx, log.contexts], [true, true, 'ctx1', 1], 'one context for them all');
    assert.equal(chromium.contexts.get('ctx1'), b, 'its tabs are your browsing’s own');
    assert.equal(b.active, p2);
    assert.equal(b.view().tabs.filter((t) => t.private).length, 2);
    assert.equal(b.view().tabs.find((t) => t.id === n1.targetId)?.private, undefined);
    // A private tab closing is not for Ctrl+Shift+T, and while another is open the context stays.
    b.tabGone(p1);
    assert.deepEqual(closedTabList(), []);
    assert.deepEqual(log.disposed, []);
    // The last normal tab closing leaves the private one alone: no new tab opens. It is remembered as any other.
    b.tabGone(n1);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(b.tabs, [p2]);
    assert.equal(log.tabs, 3, 'no new tab was made');
    assert.deepEqual(closedTabList().map((c) => c.url), ['https://news.example/']);
    assert.equal(b.active, p2);
    // The last private tab closing: the context is disposed (the app forgets its cookies, site data, cache), and a normal tab opens.
    b.tabGone(p2);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(log.disposed, ['ctx1']);
    assert.equal(b.privateCtx, undefined);
    assert.equal(chromium.contexts.size, 0);
    assert.deepEqual(closedTabList().map((c) => c.url), ['https://news.example/'], 'the private ones are not there');
    assert.equal(b.tabs.length, 1, 'your browsing is never left without a tab');
    assert.equal(b.tabs[0].incognito, false);
    // The next private tab starts afresh.
    const p3 = await open('https://secret.example/three', { private: true });
    assert.deepEqual([p3.incognito, b.privateCtx, log.contexts], [true, 'ctx2', 2]);
    // A private tab that is still opening (a pop-up on its way) keeps the context.
    b.privateOpening = 1;
    b.tabGone(p3);
    assert.deepEqual(log.disposed, ['ctx1'], 'kept while a private tab is on its way in');
    b.privateOpening = 0;
    // A normal tab closing never touches it.
    const p4 = await open('https://secret.example/four', { private: true });
    const n2 = await open('https://other.example/');
    b.tabGone(n2);
    assert.equal(b.privateCtx, 'ctx2');
    // The browser closing takes the context with it.
    await b.close('test');
    assert.deepEqual(log.disposed, ['ctx1', 'ctx2']);
    assert.equal(b.privateCtx, undefined);
    void p4;
  });
  await check('private tabs: a tab that did not open leaves no context behind; agents’ browsers have none', async () => {
    const { b, log, open } = fakeBrowser();
    log.failNext = true;
    await assert.rejects(open('https://x.example/', { private: true }), /did not open/);
    assert.deepEqual([b.privateCtx, log.disposed], [undefined, ['ctx1']]);
    assert.equal(b.privateOpening, 0);
    const { chromium } = fakeBrowser();
    const agent = new SessionBrowser('claude:agent', '/tmp', chromium as never, '');
    await assert.rejects(agent.newTab({ private: true }), /Only your own browsing has private tabs/);
    assert.equal(agent.privateOpening, 0);
  });
  await check('private tabs: a private tab’s download is saved but never in the list of downloads', async () => {
    const db = openDb(path.join(process.env.DATA_DIR!, 'browsing-private-dl.db'));
    setBrowserDeps({ db, toSubscribers: () => {} } as unknown as Deps);
    const { b } = fakeBrowser();
    assert.equal(downloadCount(db), 0);
    b.downloadStarted('plain.pdf');
    b.downloadEnded('plain.pdf', '/tmp/plain.pdf', 'https://a.example/plain.pdf');
    assert.equal(downloadCount(db), 1, 'a normal tab’s is listed');
    b.downloadStarted('secret.pdf');
    b.downloadEnded('secret.pdf', '/tmp/secret.pdf', 'https://secret.example/secret.pdf', true);
    assert.equal(downloadCount(db), 1, 'a private tab’s is not');
    b.downloadStarted('failed.pdf');
    b.downloadEnded('failed.pdf', null, 'https://secret.example/failed.pdf', true);
    assert.equal(downloadCount(db), 1);
    assert.deepEqual(b.view().downloads.map((x) => [x.name, x.done, x.path]), [['failed.pdf', true, ''], ['secret.pdf', true, '/tmp/secret.pdf'], ['plain.pdf', true, '/tmp/plain.pdf']], 'the view’s short list shows it');
  });
  await check('private tabs: Group my tabs never sends them to the helper model', async () => {
    const { b, open } = fakeBrowser();
    const urls = ['https://a.example/', 'https://b.example/', 'https://c.example/'];
    for (const u of urls) await open(u);
    await open('https://secret.example/x', { private: true });
    const sent: string[] = [];
    const ask = (async (_db: unknown, o: { prompt: string }) => (sent.push(o.prompt), { groups: [] })) as unknown as Parameters<typeof groupWithAi>[2];
    assert.deepEqual((await groupWithAi({} as DB, b, ask)).applied, 0);
    assert.ok(sent[0].includes('a.example') && !sent[0].includes('secret.example'), sent[0]);
    // Three tabs are needed without the private ones: with only two normal tabs and two private, nothing is asked.
    const two = fakeBrowser();
    await two.open('https://a.example/');
    await two.open('https://b.example/');
    await two.open('https://p1.example/', { private: true });
    await two.open('https://p2.example/', { private: true });
    await assert.rejects(groupWithAi({} as DB, two.b, ask), refused(409, /three tabs/));
    assert.equal(sent.length, 1);
  });
  await check('private tabs: the history recorder skips them, and their typed addresses', () => {
    const rdb = openDb(path.join(process.env.DATA_DIR!, 'browsing-private-history.db'));
    const rec = new HistoryRecorder(rdb);
    const tab = (id: string, url: string, title: string, priv = false) => ({ id, url, title, active: true, ...(priv ? { private: true } : {}) });
    rec.typed('p', true);
    rec.seen({ open: true, tabs: [tab('p', 'https://secret.example/', 'Secret', true), tab('n', 'https://plain.example/', 'Plain')] });
    rec.seen({ open: true, tabs: [tab('p', 'https://secret.example/two', 'Secret two', true), tab('n', 'https://plain.example/', 'Plain')] });
    assert.deepEqual(listHistory(rdb, { limit: 50 }).map((e) => e.url), ['https://plain.example/']);
  });

  // ---- for real, when a Chromium is installed ----
  const chrome = pickChrome('');
  if (!chrome) {
    console.log('skip the real-browser checks: no Chromium found');
  } else {
    await realBrowser();
  }
  await check('the Library’s Downloads list: newest first, found by words, paged by time, one removed; and agents are refused it and saving a tab', async () => {
    fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });
    const db = openDb(path.join(process.env.DATA_DIR!, 'browsing-downloads.db'));
    initPages(db);
    const t0 = Date.now() - 100_000;
    const ids = [
      addDownload(db, { name: 'pasta.pdf', path: '/home/me/Downloads/pasta.pdf', url: 'https://recipes.example/pasta.pdf', at: t0 }).id,
      addDownload(db, { name: 'report.xlsx', path: '', url: 'https://corp.example/report.xlsx', at: t0 + 1000 }).id,
      addDownload(db, { name: 'bread.pdf', path: '/home/me/Downloads/bread.pdf', url: 'https://recipes.example/bread.pdf', at: t0 + 2000 }).id,
    ];
    const app = Fastify();
    app.setErrorHandler((err: Error, _req, reply) => void reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
    const deps = { app, db, sessions: { summary: () => null, list: () => ({ sessions: [], total: 0 }) }, scheduler: { list: () => [] }, models: null, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://localhost' } as unknown as Deps;
    browsingRoutes(deps);
    const call = async (method: 'GET' | 'POST' | 'DELETE', url: string) => {
      const r = await app.inject({ method, url });
      return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : {} };
    };
    const names = async (qs = '') => ((await call('GET', `/api/browser/browsing/downloads${qs}`)).body.downloads as { name: string; failed: boolean }[]).map((d) => d.name);
    assert.deepEqual(await names(), ['bread.pdf', 'report.xlsx', 'pasta.pdf'], 'newest first');
    assert.equal(((await call('GET', '/api/browser/browsing/downloads')).body.downloads as { name: string; failed: boolean }[]).find((d) => d.name === 'report.xlsx')!.failed, true, 'one without a file failed');
    assert.deepEqual(await names('?q=RECIPES'), ['bread.pdf', 'pasta.pdf'], 'words are looked for in the name and the address it came from, in any case');
    assert.deepEqual(await names('?limit=1'), ['bread.pdf']);
    assert.deepEqual(await names(`?before=${t0 + 2000}&limit=1`), ['report.xlsx'], 'the next page is those older than the last one’s time');
    assert.equal((await call('GET', '/api/browser/browsing/downloads?before=soon')).status, 400);
    assert.equal((await call('DELETE', '/api/browser/browsing/downloads/nope')).status, 400);
    assert.deepEqual((await call('DELETE', `/api/browser/browsing/downloads/${ids[1]}`)).body, { removed: true });
    assert.deepEqual((await call('DELETE', `/api/browser/browsing/downloads/${ids[1]}`)).body, { removed: false }, 'a second time there is nothing to remove');
    assert.deepEqual(await names(), ['bread.pdf', 'pasta.pdf']);
    assert.equal(downloadCount(db), 2);
    // Saving a tab: no browser open, no such tab; a refused call never reaches the Library.
    assert.equal((await call('POST', '/api/browser/browsing/tabs/nope/save-page')).status, 404);
    assert.equal(listPages(db).length, 0);
    // Agents never use any of it.
    for (const [m, u] of [['GET', '/api/browser/browsing/downloads'], ['DELETE', '/api/browser/browsing/downloads/1'], ['POST', '/api/browser/browsing/tabs/x/save-page']] as const) {
      assert.equal(ruleFor(m, u).level, 'refuse', `${m} ${u}`);
    }
    await app.close();
  });
  await check('highlights: the routes list a page’s or all of them with words, change a note, delete; a tab is needed to make one; agents are refused', async () => {
    fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });
    const db = openDb(path.join(process.env.DATA_DIR!, 'browsing-highlights.db'));
    const a = addHighlight(db, { url: 'https://a.example/post?utm_source=x#top', title: 'A post', text: 'the first words' }, 100)!;
    const b = addHighlight(db, { url: 'https://b.example/', title: 'B', text: 'other words about otters' }, 200)!;
    const app = Fastify();
    app.setErrorHandler((err: Error, _req, reply) => void reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
    const deps = { app, db, sessions: { summary: () => null, list: () => ({ sessions: [], total: 0 }) }, scheduler: { list: () => [] }, models: null, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://localhost' } as unknown as Deps;
    browsingRoutes(deps);
    const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => {
      const r = await app.inject({ method, url, ...(payload ? { payload } : {}) });
      return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : {} };
    };
    const list = async (qs = '') => ((await call('GET', `/api/browser/browsing/highlights${qs}`)).body.highlights as { id: string }[]).map((h) => h.id);
    assert.deepEqual(await list(), [b.id, a.id], 'newest first');
    assert.deepEqual(await list('?q=OTTERS'), [b.id]);
    assert.deepEqual(await list('?limit=1'), [b.id]);
    assert.deepEqual(await list(`?before=200`), [a.id]);
    assert.equal((await call('GET', '/api/browser/browsing/highlights?before=soon')).status, 400);
    const page = await call('GET', `/api/browser/browsing/highlights?url=${encodeURIComponent('http://www.a.example/post/#else')}`);
    assert.deepEqual([page.body.highlights.map((h: { id: string }) => h.id), page.body.count], [[a.id], 1], 'a page is found by any address of it');
    assert.equal((await call('PATCH', `/api/browser/browsing/highlights/${a.id}`, { note: 5 as unknown as string })).status, 400);
    assert.equal((await call('PATCH', '/api/browser/browsing/highlights/nope', { note: 'x' })).status, 404);
    assert.equal((await call('PATCH', `/api/browser/browsing/highlights/${a.id}`, { note: ' keep this ' })).body.highlight.note, 'keep this');
    assert.deepEqual(await list('?q=keep'), [a.id], 'the note is searched');
    // Making one needs one of your tabs; opening one needs the highlight.
    assert.equal((await call('POST', '/api/browser/browsing/highlights', {})).status, 400);
    assert.equal((await call('POST', '/api/browser/browsing/highlights', { tab: 'nope' })).status, 404);
    assert.equal((await call('POST', '/api/browser/browsing/highlights/nope/open')).status, 404);
    assert.deepEqual((await call('DELETE', `/api/browser/browsing/highlights/${a.id}`)).body, { removed: true });
    assert.deepEqual((await call('DELETE', `/api/browser/browsing/highlights/${a.id}`)).body, { removed: false });
    assert.deepEqual(await list(), [b.id]);
    await app.close();
  });
  // Last: it sets up your browsing's routes on a database of its own, which the real-browser checks above must not share.
  await check('clearing browsing data with the history ticked clears the downloads list too; and your browsing reaches the search box only for a person', async () => {
    fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });
    const db = openDb(path.join(process.env.DATA_DIR!, 'browsing-clear.db'));
    addVisit(db, 'https://recipes.example/pasta', 'Pasta recipes', false, Date.now());
    addDownload(db, { name: 'pasta.pdf', path: '/home/me/Downloads/pasta.pdf', url: 'https://recipes.example/pasta.pdf', at: Date.now() });
    const app = Fastify();
    app.setErrorHandler((err: Error, _req, reply) => void reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
    const deps = { app, db, sessions: { summary: () => null, list: () => ({ sessions: [], total: 0 }) }, scheduler: { list: () => [] }, models: null, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://localhost' } as unknown as Deps;
    browsingRoutes(deps);
    find.routes!(deps);
    const json = async (method: 'GET' | 'POST', url: string, internal = false, payload?: object) => (await app.inject({ method, url, headers: internal ? internalHeaders() : {}, ...(payload ? { payload } : {}) })).json();
    // The search box's request carries browsing=1; an agent's call (app_api) carries the internal header and gets none of it.
    assert.equal((await json('GET', '/api/find?q=pasta&in=browsing&browsing=1')).browsing.length, 2);
    assert.equal((await json('GET', '/api/find?q=pasta&in=browsing&browsing=1', true)).browsing, undefined);
    assert.equal((await json('GET', '/api/find?q=pasta&browsing=1', true)).browsing, undefined);
    // Only the cache and cookies ticked: the list stays; the history ticked: it goes with the history.
    assert.equal(downloadCount(db), 1);
    await assert.rejects(json('POST', '/api/browser/browsing/clear', false, {}).then((r) => (r.error ? Promise.reject(new Error(r.error)) : r)), /Pick what to clear/);
    const r = await json('POST', '/api/browser/browsing/clear', false, { history: true, since: Date.now() + 10_000 });
    assert.equal(r.history, 0, 'nothing that new');
    assert.equal(downloadCount(db), 1, 'and the downloads of before that time stay');
    await json('POST', '/api/browser/browsing/clear', false, { history: true });
    assert.equal(listHistory(db).length, 0);
    assert.equal(downloadCount(db), 0);
    assert.deepEqual((await json('GET', '/api/find?q=pasta&in=browsing&browsing=1')).browsing, []);
    await app.close();
  });
  console.log(`\n${passed}/${passed + failed} passed`);
}

async function realBrowser() {
  const page = (title: string, body: string) => `<!doctype html><html><head><title>${title}</title><link rel="icon" href="/icon.png"></head><body>${body}</body></html>`;
  const site = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname === '/pic.png') return void res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (u.pathname === '/article') {
      const para = 'The reader copy keeps what an article is made of, and leaves the rest of the page behind. '.repeat(8);
      return void res.end(
        `<!doctype html><html lang="en"><head><title>The Story | Example News</title><meta property="og:site_name" content="Example News"><meta name="author" content="Ada Lovelace"><meta property="article:published_time" content="2026-11-02T10:00:00Z"></head><body><nav><a href="/other">Menu item</a></nav><article><h1>The Story</h1><p>${para}</p><figure><img data-src="/pic.png" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Lazy one"><figcaption>A caption</figcaption></figure><p>${para} <a href="/other">a link</a></p><p>${para}</p><script>var changedByScript = 1</script></article><aside class="comments">Comment spam goes here</aside><footer>Footer links</footer></body></html>`,
      );
    }
    if (u.pathname === '/other') return void res.end(page('Other', '<p>Another page.</p>'));
    if (u.pathname === '/mail') return void res.end(page('Inbox', '<h1>Inbox</h1><p>Hello Hello hello. <b>Hello</b> again.</p><p style="display:none">hello hidden</p><script>var hello = 1</script><a href="/other">other</a><button>Send</button>'));
    res.end(page('Home', '<h1>Home</h1>'));
  });
  const port = await new Promise<number>((r) => site.listen(0, '127.0.0.1', () => r((site.address() as { port: number }).port)));
  const base = `http://127.0.0.1:${port}`;
  const dataDir = process.env.DATA_DIR!;
  const db = openDb(path.join(dataDir, 'browsing.db'));
  const messages: string[] = [];
  const live = new Set<string>();
  const sessions = {
    summary: (k: string) => ({ key: k, title: 'Test session', agent: 'claude', cwd: dataDir }),
    deliverOrQueue: async (_k: string, text: string) => void messages.push(text),
    timeline: async () => ({ parser: { items: [] } }),
    emit: () => true,
    on: () => sessions,
  };
  const app = Fastify();
  app.setErrorHandler((err: Error, _req, reply) => void reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
  const deps = { app, db, sessions, scheduler: null, models: null, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://localhost' } as unknown as Deps;
  setBrowserDeps(deps);
  setBrowserSettings(db, { enabled: true });
  browsingRoutes(deps);
  browserRoutes(deps);
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => {
    const r = await app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }) });
    const json = r.body ? JSON.parse(r.body) : {};
    if (r.statusCode >= 400) throw Object.assign(new Error(json.error ?? r.body), { status: r.statusCode });
    return json;
  };
  const until = async (what: string, fn: () => boolean, ms = 8000) => {
    for (let t = 0; t < ms; t += 100) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for ${what}`);
  };
  void live;

  try {
    // Outside the desktop app the routes that start your own browser say so (this test runs on a Chromium of its own).
    await check('real: outside the desktop app your own browser does not start: 409, and nothing was started', async () => {
      const no = (e: unknown) => (e as { status?: number }).status === 409 && /Your own browser is in the desktop app/.test((e as Error).message);
      await assert.rejects(call('POST', '/api/browser/browsing/open', {}), no);
      await assert.rejects(call('POST', '/api/browser/browsing/open', { url: `${base}/home` }), no);
      await assert.rejects(call('POST', '/api/browser/browsing/tabs', {}), no);
      await assert.rejects(call('POST', '/api/browser/browsing/go', { text: 'example.com' }), no);
      await assert.rejects(call('POST', '/api/browser/browsing/reopen', {}), no);
      await assert.rejects(call('POST', '/api/browser/sessions/browsing/open', {}), no);
      assert.equal(browserOf(BROWSING_KEY), undefined);
      // What needs no browser is there for the page to show.
      assert.equal((await call('GET', '/api/browser/browsing/prefs')).home, 'https://www.google.com/');
      assert.deepEqual((await call('GET', '/api/browser/browsing/history')).entries, []);
      assert.deepEqual((await call('GET', '/api/browser/browsing/suggest?q=exam')).items.filter((i: { kind: string }) => i.kind !== 'search'), [], 'nothing of yours yet (the engine may suggest)');
    });
    desktopGate.inside = () => true;
    await check('real: settings through the routes: checked, kept, and the page never leaves the local test site', async () => {
      const bad = (body: object, re: RegExp) => assert.rejects(call('PATCH', '/api/browser/browsing/prefs', body), (e) => (e as { status?: number }).status === 400 && re.test((e as Error).message));
      await bad({ home: 'javascript:alert(1)' }, /home page/);
      await bad({ engine: 'nope' }, /search engine/);
      await bad({ engine: 'custom' }, /search page/);
      await bad({ customSearch: 'https://s.example/' }, /%s/);
      await bad({ suggest: 'yes' }, /true or false/);
      const p = await call('PATCH', '/api/browser/browsing/prefs', { home: `${base}/home`, engine: 'custom', customSearch: `${base}/search?q=%s`, suggest: false, adblock: false, allowAds: ['https://www.Ads.example/x'] });
      assert.deepEqual(p, { home: `${base}/home`, engine: 'custom', customSearch: `${base}/search?q=%s`, suggest: false, adblock: false, allowAds: ['ads.example'], ...NEWER });
      assert.deepEqual(await call('GET', '/api/browser/browsing/prefs'), p);
    });

    await check('real: opens your browser on a page, in a tab of its own', async () => {
      const r = await call('POST', '/api/browser/browsing/open', { url: `${base}/home` });
      assert.equal(r.key, BROWSING_KEY);
      assert.equal(r.view.tabs.length, 1, 'the blank first tab was used');
      const b = browserOf(BROWSING_KEY)!;
      await until('the page', () => b.tabs[0].title === 'Home').catch((e) => {
        throw new Error(`${e.message}: ${JSON.stringify(b.tabs.map((t) => [t.url, t.title, t.navigating]))}`);
      });
      assert.equal(b.driver, 'user');
      assert.equal(b.profile, 'browsing');
    });
    await check('real: a new tab, the address bar, back and forward, and the icon', async () => {
      const b = browserOf(BROWSING_KEY)!;
      await call('POST', '/api/browser/browsing/tabs', { url: `${base}/other` });
      await until('two tabs', () => b.tabs.length === 2 && b.active?.title === 'Other');
      await call('POST', '/api/browser/browsing/go', { text: `${base}/mail` });
      await until('the inbox', () => b.active?.title === 'Inbox');
      await until('back possible', () => b.active!.canGoBack === true);
      const v = (await call('GET', '/api/browser/sessions/browsing')).view;
      const tab = v.tabs.find((t: { active: boolean }) => t.active);
      assert.equal(tab.canGoBack, true);
      assert.equal(tab.canGoForward, undefined);
      assert.equal(tab.favicon, `${base}/icon.png`);
      await call('POST', '/api/browser/sessions/browsing/nav', { do: 'back' });
      await until('back', () => b.active?.title === 'Other');
      await until('forward possible', () => b.active!.canGoForward === true);
      await call('POST', '/api/browser/browsing/go', { text: `${base}/mail`, tab: b.active!.targetId });
      await until('the inbox again', () => b.active?.title === 'Inbox');
      // Something that is not an address goes to a search page (it need not load here).
      await call('POST', '/api/browser/browsing/go', { text: 'purple elephant', newTab: true }).catch(() => {});
      assert.equal(b.tabs.length, 3);
      await call('DELETE', `/api/browser/browsing/tabs/${b.active!.targetId}`);
      await until('two tabs again', () => b.tabs.length === 2);
    });
    await check('real: closing a tab by the tab route, stop, and the last tab leaves a blank one', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const before = b.tabs.length;
      const extra = await b.newTab();
      await call('POST', '/api/browser/sessions/browsing/tab', { id: extra.targetId, close: true });
      await until('closed', () => b.tabs.length === before);
      await call('POST', '/api/browser/sessions/browsing/nav', { do: 'stop' });
      await assert.rejects(call('POST', '/api/browser/sessions/browsing/nav', { do: 'jump' }), /back, forward, reload or stop/);
    });
    await check('real: find in the page counts what shows, and wraps', async () => {
      const b = browserOf(BROWSING_KEY)!;
      await until('the inbox', () => b.active?.title === 'Inbox');
      const k = '/api/browser/sessions/browsing/find';
      const r1 = await call('POST', k, { text: 'HELLO' });
      assert.deepEqual(r1, { found: true, count: 4 }, 'hidden text and scripts are not counted');
      assert.equal(await b.active!.evaluate<string>('String(getSelection())').then((s) => s.toLowerCase()), 'hello');
      const r2 = await call('POST', k, { text: 'again', back: false });
      assert.deepEqual(r2, { found: true, count: 1 });
      assert.deepEqual(await call('POST', k, { text: 'nothing like this' }), { found: false, count: 0 });
      assert.deepEqual(await call('POST', k, { text: '' }), { found: false, count: 0 });
      assert.equal(await b.active!.evaluate<string>('String(getSelection())'), '');
      await assert.rejects(call('POST', '/api/browser/sessions/nobody/find', { text: 'x' }), /not open/);
    });
    await check('real: a copy of the page for Ask about this page', async () => {
      const b = browserOf(BROWSING_KEY)!;
      await b.active!.evaluate('(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector("h1")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()');
      const r = await call('POST', `/api/browser/browsing/tabs/${b.active!.targetId}/snapshot`);
      assert.equal(r.title, 'Inbox');
      assert.match(r.name, /^inbox\.md$/);
      const text = fs.readFileSync(r.path, 'utf8');
      assert.match(text, /^# Inbox/);
      assert.match(text, /## What I selected\n\n> Inbox/);
      assert.match(text, /Hello Hello hello/);
      assert.doesNotMatch(text, /hello hidden/);
    });
    await check('real: Save keeps the page in the Library as a document with the address it came from', async () => {
      const b = browserOf(BROWSING_KEY)!;
      await b.active!.evaluate('(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector("h1")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()');
      initPages(db);
      const url = b.active!.url;
      const r = await call('POST', `/api/browser/browsing/tabs/${b.active!.targetId}/save-page`, {});
      const page = listPages(db).find((p) => p.id === r.id)!;
      assert.equal(page.kind, 'doc');
      assert.equal(page.title, 'Inbox');
      assert.equal(page.source?.url, url);
      assert.equal(page.source?.site, '127.0.0.1');
      const text = pageSource(db, r.id)!.text;
      assert.match(text, /Saved from /);
      assert.match(text, /What you selected/);
      assert.match(text, /Hello Hello hello/);
      assert.doesNotMatch(text, /hello hidden/);
    });
    await check('real: Save keeps an article as a page of the Library: its text and pictures, none of the page around it', async () => {
      const b = browserOf(BROWSING_KEY)!;
      await call('POST', '/api/browser/browsing/go', { text: `${base}/article`, tab: b.active!.targetId });
      await until('the article', () => !!b.active?.title.startsWith('The Story'));
      const r = await call('POST', `/api/browser/browsing/tabs/${b.active!.targetId}/save-page`, {});
      const page = listPages(db).find((p) => p.id === r.id)!;
      assert.equal(page.kind, undefined, 'a page of HTML');
      assert.equal(page.source?.url, `${base}/article`);
      assert.equal(page.source?.site, '127.0.0.1');
      assert.equal(page.title, 'The Story');
      const html = pageSource(db, r.id)!.text;
      assert.match(html, /<h1>The Story<\/h1>/);
      assert.match(html, /Ada Lovelace · Example News · 2026-11-02/);
      assert.match(html, /The reader copy keeps what an article is made of/);
      assert.match(html, /<a href="http:\/\/127\.0\.0\.1:\d+\/other" rel="noopener noreferrer" target="_blank">a link<\/a>/);
      assert.match(html, /<img src="\/pg\/pic\/[a-f0-9]{40}\/[\w-]{32}" alt="Lazy one"/, 'its lazy picture is kept with the page');
      assert.match(html, /A caption/);
      assert.doesNotMatch(html, /Menu item|Comment spam|Footer links|<script|changedByScript/);
      await call('POST', '/api/browser/browsing/go', { text: `${base}/mail`, tab: b.active!.targetId });
      await until('the inbox again', () => b.active?.title === 'Inbox');
    });
    await check('real: the size from the page lays out every tab, new ones too', async () => {
      const b = browserOf(BROWSING_KEY)!;
      if (b.chromium.native) return;
      await assert.rejects(call('POST', '/api/browser/sessions/claude%3Aabc/fit', { w: 800, h: 600 }), /Only your own/);
      await assert.rejects(call('POST', '/api/browser/sessions/browsing/fit', { w: 10, h: 600 }), /sizes in pixels/);
      await call('POST', '/api/browser/sessions/browsing/fit', { w: 900, h: 640, scale: 2 });
      await call('POST', '/api/browser/browsing/tabs', {});
      await until('three tabs', () => b.tabs.length === 3);
      for (const t of b.tabs) assert.deepEqual([t.viewport.w, t.viewport.h, t.viewport.scale], [900, 640, 2]);
    });

    // Do this here, with the session's browser made as sessions.create does it.
    const KEY = 'claude:handoff-test';
    let agentTab = '';
    await check('real: the session gets a tab of its own at your page, kept to its site and guarded; yours stays', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const mail = b.tabs.find((t) => t.title === 'Inbox')!;
      const n = b.tabs.length;
      const { handOver } = await import('./session.ts');
      const r = await handOver(mail.targetId, KEY, dataDir);
      assert.equal(r.site, '127.0.0.1');
      const s = browserOf(KEY)!;
      assert.equal(s.profile, 'browsing');
      assert.equal(s.tabs.length, 1, 'no blank tab of its own');
      assert.notEqual(s.tabs[0], mail);
      assert.equal(s.active, s.tabs[0]);
      agentTab = s.tabs[0].targetId;
      await until('the page', () => s.tabs[0].title === 'Inbox');
      assert.equal(s.tabs[0].url, mail.url);
      assert.equal(s.tabs[0].owner, s);
      assert.equal(s.tabs[0].guarded, true);
      assert.equal(s.handedFrom, '127.0.0.1');
      assert.equal(s.view().handedFrom, '127.0.0.1');
      assert.equal(s.driver, 'agent');
      assert.equal(mail.owner, b, 'your tab stays yours');
      assert.equal(mail.guarded, false);
      assert.equal(b.tabs.length, n);
      assert.ok(b.tabs.includes(mail));
      assert.deepEqual(sessionOptions(db, KEY).allow, ['127.0.0.1']);
      assert.deepEqual(sessionOptions(db, KEY).local, [`127.0.0.1:${port}`], 'a page on this machine: its address is allowed too');
      const agents = await call('GET', '/api/browser/browsing/agents');
      assert.equal(agents.browsers.length, 1);
      assert.equal(agents.browsers[0].key, KEY);
      assert.equal(agents.browsers[0].handedFrom, '127.0.0.1');
      assert.equal(agents.browsers[0].tabs.length, 1);
      assert.equal(agents.browsers[0].title, 'Test session');
    });
    await check('real: the agent’s tab reaches its own site and not another; yours goes anywhere', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const s = browserOf(KEY)!;
      const t = s.tabs[0];
      await t.navigate(`http://localhost:${port}/other`);
      await new Promise((r) => setTimeout(r, 1500));
      assert.notEqual(t.title, 'Other', 'localhost is not the site it was given');
      await t.navigate(`${base}/other`);
      await until('its own site', () => t.title === 'Other');
      const mine = b.tabs.find((x) => x.title === 'Inbox')!;
      await mine.navigate(`http://localhost:${port}/other`);
      await until('your own browsing goes anywhere', () => mine.title === 'Other');
      await mine.navigate(`${base}/mail`);
      await until('your tab back', () => mine.title === 'Inbox');
    });
    await check('real: you take the page back: it opens in your browser, the agent’s tab closes, the agent is told', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const s = browserOf(KEY)!;
      await s.tabs[0].navigate(`${base}/mail`);
      await until('the inbox', () => s.tabs[0].title === 'Inbox');
      const n = b.tabs.length;
      messages.length = 0;
      const r = await call('POST', `/api/browser/browsing/tabs/${agentTab}/take-back`);
      assert.equal(r.view.tabs.length, n + 1);
      await until('your new tab loads it', () => b.active?.url === `${base}/mail`);
      assert.equal(b.tabs.at(-1)!.owner, b);
      await until('its browser closed', () => browserOf(KEY) === undefined);
      assert.match(messages.join('\n'), /I took the page back/);
      await assert.rejects(call('POST', `/api/browser/browsing/tabs/${agentTab}/take-back`), /does not have that tab/);
    });
    await check('real: when the session’s browser closes its tab closes with it; yours stay', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const { handOver } = await import('./session.ts');
      const mail = b.tabs.find((t) => t.title === 'Inbox')!;
      await handOver(mail.targetId, KEY, dataDir);
      const s = browserOf(KEY)!;
      const theirs = s.tabs[0];
      const n = b.tabs.length;
      await s.close('test');
      assert.equal(b.tabs.length, n);
      assert.ok(!b.tabs.includes(theirs));
      assert.ok(!mail.closed);
    });
    await check('real: a blank tab cannot be handed over', async () => {
      const { handOver } = await import('./session.ts');
      const b = browserOf(BROWSING_KEY)!;
      const t = await b.newTab();
      await assert.rejects(handOver(t.targetId, KEY, dataDir), /website/);
      await assert.rejects(handOver('nope', KEY, dataDir), /not open/);
    });
    await check('real: your tabs are kept, and come back with the browser', async () => {
      const b = browserOf(BROWSING_KEY)!;
      await new Promise((r) => setTimeout(r, 3500));
      const saved = JSON.parse((db.prepare("select v from kv where k = 'browser.browsing.tabs'").get() as { v: string } | undefined)?.v ?? 'null');
      assert.ok(saved && saved.tabs.length >= 2, JSON.stringify(saved));
      assert.ok(saved.tabs.every((u: string) => u.startsWith(base)));
      const urls = b.tabs.map((t) => t.url).filter((u) => u.startsWith(base));
      await b.close('test');
      const again = await call('POST', '/api/browser/browsing/open', {});
      const b2 = browserOf(BROWSING_KEY)!;
      await until('the tabs', () => b2.tabs.length === urls.length);
      assert.equal(again.key, BROWSING_KEY);
      await until('their pages', () => b2.tabs.every((t) => t.url.startsWith(base)));
      assert.deepEqual(b2.tabs.map((t) => t.url).sort(), [...urls].sort());
    });
    await check('real: two opens at once make one browser', async () => {
      await browserOf(BROWSING_KEY)?.close('test');
      const [a, b] = await Promise.all([call('POST', '/api/browser/browsing/open', {}), call('POST', '/api/browser/browsing/open', {})]);
      assert.equal(a.key, b.key);
      const only = browserOf(BROWSING_KEY)!;
      assert.equal(only.tabs.length, new Set(only.tabs.map((t) => t.targetId)).size);
      const e = await ensureBrowser(BROWSING_KEY, dataDir);
      assert.equal(e, only);
    });

    // History, suggestions, closed tabs and clearing, on the browser as it is now.
    const history = async (q: string) => (await call('GET', `/api/browser/browsing/history?q=${encodeURIComponent(q)}`)).entries as { id: number; url: string; title: string; visits: number; typed: number; at: number }[];
    await check('real: a new tab opens your home page', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const n = b.tabs.length;
      await call('POST', '/api/browser/browsing/tabs', {});
      await until('the home page', () => b.tabs.length === n + 1 && b.active?.url === `${base}/home` && b.active.title === 'Home');
    });
    await check('real: pages you go to are in the history: typed in the address bar counts typed, a link or a new tab does not', async () => {
      const b = browserOf(BROWSING_KEY)!;
      await call('POST', '/api/browser/browsing/go', { text: `${base}/typed-page`, newTab: true });
      for (let i = 0; i < 60 && !(await history('typed-page')).some((e) => e.title === 'Home'); i++) await new Promise((r) => setTimeout(r, 100));
      const typed = (await history('typed-page'))[0];
      assert.deepEqual([typed.url, typed.title, typed.visits, typed.typed], [`${base}/typed-page`, 'Home', 1, 1]);
      await call('POST', '/api/browser/browsing/tabs', { url: `${base}/linked-page` });
      for (let i = 0; i < 60 && !(await history('linked-page')).some((e) => e.title === 'Home'); i++) await new Promise((r) => setTimeout(r, 100));
      const linked = (await history('linked-page'))[0];
      assert.deepEqual([linked.visits, linked.typed], [1, 0]);
      // The same page typed again in a tab on another page: another visit, typed twice.
      await call('POST', '/api/browser/browsing/go', { text: `${base}/mail`, tab: b.active!.targetId });
      await until('the inbox', () => b.active?.title === 'Inbox');
      await call('POST', '/api/browser/browsing/go', { text: `${base}/typed-page`, tab: b.active!.targetId });
      for (let i = 0; i < 60 && (await history('typed-page'))[0]?.visits !== 2; i++) await new Promise((r) => setTimeout(r, 100));
      assert.deepEqual([(await history('typed-page'))[0].visits, (await history('typed-page'))[0].typed], [2, 2]);
      // Typing the address of the page you are on is a reload, not a visit.
      await call('POST', '/api/browser/browsing/go', { text: `${base}/typed-page`, tab: b.active!.targetId });
      await new Promise((r) => setTimeout(r, 600));
      assert.equal((await history('typed-page'))[0].visits, 2);
      const inbox = (await history('/mail'))[0];
      assert.equal(inbox.title, 'Inbox');
    });
    await check('real: the suggestions come from tabs and history, the address to complete, the page you typed first', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const r = await call('GET', `/api/browser/browsing/suggest?q=${encodeURIComponent(`127.0.0.1:${port}/typed`)}`);
      assert.equal(r.inline, `127.0.0.1:${port}/typed-page`);
      // Open in a tab, so it is that tab that is offered (a tab beats the same page in the history).
      assert.ok(r.items.some((i: { kind: string; url: string }) => (i.kind === 'tab' || i.kind === 'history') && i.url === `${base}/typed-page`), JSON.stringify(r));
      assert.deepEqual(r.items[0], { kind: 'url', url: `http://127.0.0.1:${port}/typed` }, 'what you typed, as an address, first');
      const t = await call('GET', '/api/browser/browsing/suggest?q=inbox');
      const tab = t.items.find((i: { kind: string }) => i.kind === 'tab');
      assert.ok(tab && tab.title === 'Inbox', JSON.stringify(t));
      assert.ok(t.items.some((i: { kind: string; title: string }) => i.title === 'Inbox'), JSON.stringify(t));
      const a = await call('GET', `/api/browser/browsing/suggest?q=${encodeURIComponent('example.org')}`);
      assert.deepEqual(a.items, [{ kind: 'url', url: 'https://example.org/' }]);
      assert.deepEqual((await call('GET', '/api/browser/browsing/suggest?q=')).items.length > 0, true, 'nothing typed: where you go most');
    });
    await check('real: history routes: search, page by time, delete one, clear since a time', async () => {
      const all = (await call('GET', '/api/browser/browsing/history?limit=200')).entries as { id: number; at: number; url: string }[];
      assert.ok(all.length >= 4);
      assert.ok(all.every((e, i) => i === 0 || all[i - 1].at >= e.at), 'newest first');
      const older = (await call('GET', `/api/browser/browsing/history?before=${all[0].at}&limit=200`)).entries;
      assert.ok(older.every((e: { at: number }) => e.at < all[0].at));
      await assert.rejects(call('GET', '/api/browser/browsing/history?before=soon'), /milliseconds/);
      const target = (await history('linked-page'))[0];
      assert.deepEqual(await call('DELETE', `/api/browser/browsing/history/${target.id}`), { removed: true });
      assert.deepEqual(await call('DELETE', `/api/browser/browsing/history/${target.id}`), { removed: false });
      assert.equal((await history('linked-page')).length, 0);
      await assert.rejects(call('DELETE', '/api/browser/browsing/history/abc'), /id/);
      assert.deepEqual(await call('POST', '/api/browser/browsing/history/clear', { since: Date.now() + 3600_000 }), { removed: 0 });
      await assert.rejects(call('POST', '/api/browser/browsing/history/clear', { since: 'yesterday' }), /milliseconds/);
    });
    await check('real: tab groups through the routes: made, shown on the view, moved, folded, a copy of a tab, closing several, Group my tabs, Undo', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const url = (t: { targetId: string }) => b.tabs.find((x) => x.targetId === t.targetId)?.url;
      const x1 = await b.newTab();
      await x1.navigate(`${base}/mail`);
      const x2 = await b.newTab();
      await x2.navigate(`${base}/other`);
      const x3 = await b.newTab();
      await x3.navigate(`${base}/home`);
      await until('the pages', () => [x1, x2, x3].every((t) => t.title !== '' && !t.navigating));
      const ids = [x1, x2].map((t) => t.targetId);
      await assert.rejects(call('POST', '/api/browser/browsing/groups', { tabs: ['nope'] }), /No such tab/);
      await assert.rejects(call('POST', '/api/browser/browsing/groups', { tabs: [] }), /list of tab ids/);
      await assert.rejects(call('POST', '/api/browser/browsing/groups', { tabs: ids, color: 'pink' }), /colour/);
      const made = await call('POST', '/api/browser/browsing/groups', { tabs: ids, name: 'Mail and more' });
      assert.equal(made.view.groups.length, 1);
      assert.equal(made.view.groups[0].name, 'Mail and more');
      assert.deepEqual(made.view.tabs.filter((t: { group?: string }) => t.group === made.group.id).map((t: { id: string }) => t.id), ids);
      assert.equal(made.view.tabs.find((t: { id: string }) => t.id === x3.targetId).group, undefined);
      await call('PATCH', `/api/browser/browsing/groups/${made.group.id}`, { name: 'Reading', color: 'purple', folded: true });
      let v = (await call('GET', '/api/browser/sessions/browsing')).view;
      assert.deepEqual(v.groups, [{ id: made.group.id, name: 'Reading', color: 'purple', folded: true }]);
      await assert.rejects(call('PATCH', '/api/browser/browsing/groups/nope', { name: 'x' }), /No such group/);
      // Moved in, and out.
      v = (await call('POST', '/api/browser/browsing/tabs/group', { tabs: [x3.targetId], group: made.group.id })).view;
      assert.equal(v.tabs.filter((t: { group?: string }) => t.group).length, 3);
      v = (await call('POST', '/api/browser/browsing/tabs/group', { tabs: [x3.targetId], group: null })).view;
      assert.equal(v.tabs.find((t: { id: string }) => t.id === x3.targetId).group, undefined);
      await assert.rejects(call('POST', '/api/browser/browsing/tabs/group', { tabs: [x3.targetId], group: 'nope' }), /No such group/);
      // A copy of a tab sits beside it, in its group, and loads the same page.
      const n = b.tabs.length;
      v = (await call('POST', `/api/browser/browsing/tabs/${x1.targetId}/duplicate`)).view;
      assert.equal(v.tabs.length, n + 1);
      const at = v.tabs.findIndex((t: { id: string }) => t.id === x1.targetId);
      assert.equal(v.tabs[at + 1].group, made.group.id);
      assert.equal(v.tabs[at + 1].active, true);
      const copy = b.tabs[at + 1];
      await until('the copy loads', () => url(copy) === `${base}/mail`);
      await call('POST', `/api/browser/browsing/tabs/${copy.targetId}/reload`);
      await assert.rejects(call('POST', '/api/browser/browsing/tabs/nope/reload'), /No such tab/);
      // Closing several at once; the group goes with its last tab.
      v = (await call('POST', '/api/browser/browsing/tabs/close', { tabs: [copy.targetId, x3.targetId] })).view;
      await until('closed', () => b.tabs.length === n - 1);
      assert.equal(v.groups.length, 1);
      // Taken apart: the tabs stay. Closed with its tabs: they go.
      v = (await call('DELETE', `/api/browser/browsing/groups/${made.group.id}`)).view;
      assert.equal(v.groups, undefined);
      assert.ok(v.tabs.some((t: { id: string }) => t.id === x1.targetId));
      const again = await call('POST', '/api/browser/browsing/groups', { tabs: ids });
      await call('DELETE', `/api/browser/browsing/groups/${again.group.id}?close=1`);
      await until('the group’s tabs closed', () => !b.tabs.some((t) => ids.includes(t.targetId)));
      // Group my tabs: the answer is applied, and Undo puts the old grouping back.
      const y = [await b.newTab(), await b.newTab(), await b.newTab()];
      for (const [i, t] of y.entries()) await t.navigate(`${base}/${['mail', 'other', 'home'][i]}`);
      await until('the pages', () => y.every((t) => t.title !== '' && !t.navigating));
      let sent = '';
      const ask = (async (_db: unknown, q: { prompt: string }) => {
        sent = q.prompt;
        return { groups: [{ name: 'Test pages', color: 'green', tabs: [y[0].targetId, y[1].targetId, 'unknown'] }] };
      }) as unknown as Parameters<typeof groupWithAi>[2];
      const r = await groupWithAi(db, b, ask);
      assert.equal(r.applied, 1);
      assert.match(sent, new RegExp(`"id":"${y[0].targetId}"`));
      assert.ok(!sent.includes('?'), 'no query strings are sent');
      const grouped = b.view();
      assert.deepEqual(grouped.tabs.filter((t) => t.group).map((t) => t.id), [y[0].targetId, y[1].targetId]);
      assert.equal(grouped.groups?.[0].name, 'Test pages');
      const undone = await call('POST', '/api/browser/browsing/groups/restore', r.before);
      assert.equal(undone.view.groups, undefined);
      assert.equal(undone.view.tabs.filter((t: { group?: string }) => t.group).length, 0);
      // Too few tabs to group: nothing is asked.
      await call('POST', '/api/browser/browsing/tabs/close', { tabs: b.tabs.slice(2).map((t) => t.targetId) });
      await until('closed', () => b.tabs.length <= 2);
      while (takeClosedTab()) {
        // What this test closed is not for the test of closed tabs after it.
      }
      let asked = false;
      await assert.rejects(groupWithAi(db, b, (async () => ((asked = true), {})) as unknown as Parameters<typeof groupWithAi>[2]), refused(409, /three tabs/));
      assert.equal(asked, false);
      // And agents never use any of it.
      for (const [m, u] of [['POST', '/api/browser/browsing/groups'], ['PATCH', '/api/browser/browsing/groups/x'], ['DELETE', '/api/browser/browsing/groups/x'], ['POST', '/api/browser/browsing/groups/restore'], ['POST', '/api/browser/browsing/tabs/group'], ['POST', '/api/browser/browsing/tabs/close'], ['POST', '/api/browser/browsing/tabs/x/duplicate'], ['POST', '/api/browser/browsing/tabs/x/reload'], ['POST', '/api/browser/browsing/tabs/group-with-ai']] as const) {
        assert.equal(ruleFor(m, u).level, 'refuse', `${m} ${u}`);
      }
    });
    await check('real: closed tabs are remembered (newest first, 25), and opened again', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const one = await b.newTab();
      await one.navigate(`${base}/mail`);
      await until('the page', () => one.title === 'Inbox');
      const blank = await b.newTab();
      await call('POST', '/api/browser/sessions/browsing/tab', { id: blank.targetId, close: true });
      const closed = await call('DELETE', `/api/browser/browsing/tabs/${one.targetId}`);
      assert.deepEqual([closed.view.closed[0].url, closed.view.closed[0].title], [`${base}/mail`, 'Inbox'], 'a blank tab is not kept');
      assert.ok(typeof closed.view.closed[0].at === 'number');
      const n = b.tabs.length;
      const first = closed.view.closed.length;
      const r = await call('POST', '/api/browser/browsing/reopen', {});
      assert.equal(r.view.tabs.length, n + 1);
      assert.equal(r.view.closed?.length ?? 0, first - 1, 'it leaves the list');
      await until('the page again', () => b.active?.url === `${base}/mail` && b.active.title === 'Inbox');
      // Another one of them, by its place.
      const two = await b.newTab();
      await two.navigate(`${base}/other`);
      await until('other', () => two.title === 'Other');
      await b.closeTab(two);
      const three = await b.newTab();
      await three.navigate(`${base}/three`);
      await until('three', () => three.url === `${base}/three` && three.title === 'Home');
      await b.closeTab(three);
      const view = (await call('GET', '/api/browser/sessions/browsing')).view;
      assert.deepEqual(view.closed.slice(0, 2).map((c: { url: string }) => c.url), [`${base}/three`, `${base}/other`]);
      const mid = await call('POST', '/api/browser/browsing/reopen', { index: 1 });
      assert.equal(mid.view.closed[0].url, `${base}/three`, 'the one at that place left, the newest stays');
      assert.ok(!mid.view.closed.some((c: { url: string }) => c.url === `${base}/other`));
      await until('other again', () => b.active?.url === `${base}/other`);
      await assert.rejects(call('POST', '/api/browser/browsing/reopen', { index: -1 }), /place in the list/);
      await assert.rejects(call('POST', '/api/browser/browsing/reopen', { index: 'x' }), /place in the list/);
      await assert.rejects(call('POST', '/api/browser/browsing/reopen', { index: 999 }), /no closed tab/);
      // A long run of them: the last 25.
      for (let i = 0; i < 27; i++) {
        const t = await b.newTab();
        await t.navigate(`${base}/n${i}`);
        await until('the page', () => t.url === `${base}/n${i}`);
        await b.closeTab(t);
      }
      const v = (await call('GET', '/api/browser/sessions/browsing')).view;
      assert.equal(v.closed.length, 25);
      assert.equal(v.closed[0].url, `${base}/n26`);
      assert.equal(v.closed[24].url, `${base}/n2`);
      // The server's tabs list and the history do not turn them into new visits when they come back.
      await call('POST', '/api/browser/browsing/reopen', {});
    });
    await check('real: private tabs: in a context of their own, nothing kept, no group, a private copy, and the context goes with the last', async () => {
      const b = browserOf(BROWSING_KEY)!;
      const quiet = () => new Promise((r) => setTimeout(r, 700));
      while (takeClosedTab()) {
        // What the tests before closed is not what this one looks at.
      }
      const normal = () => b.tabs.filter((t) => !t.incognito);
      assert.equal(b.privateCtx, undefined);
      const r = await call('POST', '/api/browser/browsing/tabs', { url: `${base}/secret-one`, private: true });
      assert.equal(r.view.tabs.filter((t: { private?: boolean }) => t.private).length, 1);
      const one = b.tabs.find((t) => t.incognito)!;
      assert.equal(one.owner, b, 'a tab of your own browsing');
      assert.ok(b.privateCtx, 'the context was made');
      assert.equal(b.chromium.contexts.get(b.privateCtx!), b);
      assert.equal(b.active, one, 'in front');
      const ctx = b.privateCtx;
      await until('its page', () => one.title === 'Home' && one.url === `${base}/secret-one`, 20_000);
      // A new private tab from the address bar joins the same context; a bad flag is refused.
      await call('POST', '/api/browser/browsing/go', { text: `${base}/secret-two`, newTab: true, private: true });
      await until('two private tabs', () => b.tabs.filter((t) => t.incognito).length === 2);
      assert.equal(b.privateCtx, ctx, 'one context for all private tabs');
      await assert.rejects(call('POST', '/api/browser/browsing/tabs', { private: 'yes' }), /true or false/);
      await assert.rejects(call('POST', '/api/browser/browsing/go', { text: 'x.example', newTab: true, private: 1 }), /true or false/);
      // The same tab count of the others: a plain request still makes a normal tab.
      const n = normal().length;
      await call('POST', '/api/browser/browsing/tabs', { url: `${base}/other` });
      await until('a normal tab', () => normal().length === n + 1);
      assert.ok(normal().every((t) => t.owner === b));
      // Kept apart: the cookie of a private page is not in a normal tab of the same site, and goes with the context.
      await one.evaluate('document.cookie = "who=private; path=/"');
      const other = b.tabs.find((t) => !t.incognito && t.title === 'Other')!;
      assert.equal(await other.evaluate<string>('document.cookie'), '', 'a normal tab does not see it');
      // Nothing of them in the history, the tabs kept, or the closed tabs; the tabs show as private.
      await quiet();
      assert.deepEqual(listHistory(db, { q: 'secret-one' }), []);
      assert.deepEqual(listHistory(db, { q: 'secret-two' }), []);
      assert.ok(listHistory(db, { q: '/other', limit: 50 }).length > 0, 'a normal page is');
      const view = (await call('GET', '/api/browser/sessions/browsing')).view;
      assert.equal(view.tabs.filter((t: { private?: boolean }) => t.private).length, 2);
      assert.ok(!view.tabs.filter((t: { private?: boolean }) => !t.private).some((t: { id: string }) => b.tabs.find((x) => x.targetId === t.id)!.incognito));
      const saved = savableTabs(view.tabs, view.groups);
      assert.ok(saved.tabs.length > 0 && saved.tabs.every((u) => !u.includes('secret')), JSON.stringify(saved));
      // No group, for a private tab: both routes; Group my tabs leaves them out.
      const mate = normal()[0];
      await assert.rejects(call('POST', '/api/browser/browsing/groups', { tabs: [one.targetId, mate.targetId] }), (e) => (e as { status?: number }).status === 400 && /Private tabs can’t be put in a group/.test((e as Error).message));
      await assert.rejects(call('POST', '/api/browser/browsing/tabs/group', { tabs: [one.targetId], group: null }), /Private tabs can’t be put in a group/);
      assert.equal(b.groups.list(b.tabs.map((t) => t.targetId)).length, 0);
      // Do this here is refused for a private tab, at once and in handOver.
      const { handOver } = await import('./session.ts');
      await assert.rejects(handOver(one.targetId, 'claude:private-test', dataDir), (e) => (e as { status?: number }).status === 409 && /private tab can’t be given/.test((e as Error).message));
      assert.equal(browserOf('claude:private-test'), undefined);
      // A copy of a private tab is private, beside it; Ask about this page is refused on it, Save still works.
      const had = new Set(b.tabs.filter((t) => t.incognito));
      const dup = await call('POST', `/api/browser/browsing/tabs/${one.targetId}/duplicate`);
      assert.equal(dup.view.tabs.filter((t: { private?: boolean }) => t.private).length, 3);
      assert.equal(b.privateCtx, ctx);
      const copy = b.tabs.find((t) => t.incognito && !had.has(t))!;
      assert.equal(b.tabs.indexOf(copy), b.tabs.indexOf(one) + 1);
      await until('the copy loads', () => copy.title === 'Home', 20_000);
      await assert.rejects(call('POST', `/api/browser/browsing/tabs/${one.targetId}/snapshot`), (e) => (e as { status?: number }).status === 409 && /Agents never get a private tab’s pages: ask from a normal tab/.test((e as Error).message));
      const snap = await call('POST', `/api/browser/browsing/tabs/${other.targetId}/snapshot`);
      assert.equal(snap.url, shownUrl(`${base}/other`), 'a normal tab’s copy is still made');
      // Save to the Library is an act of yours: it works on a private tab.
      initPages(db);
      assert.ok((await call('POST', `/api/browser/browsing/tabs/${one.targetId}/save-page`, {})).id);
      // A normal tab's copy is normal.
      const ndup = await call('POST', `/api/browser/browsing/tabs/${other.targetId}/duplicate`);
      assert.equal(ndup.view.tabs.filter((t: { private?: boolean }) => t.private).length, 3);
      // Closing a private tab keeps nothing for Ctrl+Shift+T; closing some leaves the context.
      await call('DELETE', `/api/browser/browsing/tabs/${copy.targetId}`);
      assert.ok(!closedTabList().some((c) => c.url.includes('secret')), 'not in the closed tabs');
      assert.equal(b.privateCtx, ctx);
      // Close every private tab: the context is gone, and the next private tab is a new one without the cookie.
      const closed = await call('POST', '/api/browser/browsing/private/close');
      assert.equal(closed.view.tabs.filter((t: { private?: boolean }) => t.private).length, 0);
      assert.equal(b.privateCtx, undefined);
      assert.equal(b.chromium.contexts.has(ctx!), false);
      assert.ok(!closedTabList().some((c) => c.url.includes('secret')));
      assert.equal((await call('POST', '/api/browser/browsing/private/close')).view.tabs.length, b.tabs.length, 'none open: nothing to do');
      await call('POST', '/api/browser/browsing/tabs', { private: true });
      const fresh = b.tabs.find((t) => t.incognito)!;
      assert.notEqual(b.privateCtx, ctx, 'a new context');
      await until('its home page', () => fresh.url === `${base}/home`, 20_000);
      await call('POST', '/api/browser/browsing/go', { text: `${base}/mail`, tab: fresh.targetId });
      await until('the page', () => fresh.title === 'Inbox', 20_000);
      assert.equal(await fresh.evaluate<string>('document.cookie'), '', 'what the last private tabs set is forgotten');
      // The last normal tab closing while a private one is open opens nothing; the private ones closing leaves a normal tab.
      for (const t of normal()) await call('DELETE', `/api/browser/browsing/tabs/${t.targetId}`);
      await quiet();
      assert.deepEqual(b.tabs.map((t) => t.incognito), [true], 'only the private tab is left');
      await call('POST', '/api/browser/browsing/private/close');
      await until('a normal tab', () => b.tabs.length === 1 && !b.tabs[0].incognito);
      assert.equal(b.privateCtx, undefined);
      // The browser closing takes the context with it.
      await call('POST', '/api/browser/browsing/tabs', { private: true });
      assert.ok(b.privateCtx);
      await b.close('test');
      assert.equal(b.privateCtx, undefined);
      await call('POST', '/api/browser/browsing/open', {});
    });
    await check('real: clear browsing data: history here, cookies and cache told to the app (nobody here to tell)', async () => {
      await assert.rejects(call('POST', '/api/browser/browsing/clear', {}), /Pick what/);
      await assert.rejects(call('POST', '/api/browser/browsing/clear', { history: 'yes' }), /Pick what/);
      await assert.rejects(call('POST', '/api/browser/browsing/clear', { history: true, since: -5 }), /milliseconds/);
      assert.deepEqual(await call('POST', '/api/browser/browsing/clear', { cookies: true, cache: true }), { history: 0, desktop: false });
      assert.ok((await history('')).length > 0, 'cookies and cache leave the history');
      assert.deepEqual(await call('POST', '/api/browser/browsing/clear', { history: true, since: Date.now() + 3600_000 }), { history: 0, desktop: false });
      const r = await call('POST', '/api/browser/browsing/clear', { history: true });
      assert.ok(r.history > 0);
      assert.deepEqual(await history(''), []);
    });
  } finally {
    await closeAll();
    site.close();
  }
}

void main().then(() => process.exit(process.exitCode ?? 0));
