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
import { BROWSING_KEY, type BrowserPermissionAsk } from '../../shared/browser.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { openDb, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import type { CreateOpts } from '../sessions.ts';
import { addressOf, barTarget, browsingPrefs, browsingRoutes, checkHandoffStart, DEFAULT_PREFS, desktopGate, handoffLine, PermissionDesk, PermissionMemory, requireDesktop, restorable, savableTabs, savedTabs, searchUrl, setBrowsingPrefs, snapshotMarkdown, TabsKeeper } from './browsing.ts';
import { pickChrome } from './chrome.ts';
import { addDownload, downloadCount } from './downloads.ts';
import { browserRoutes } from './routes.ts';
import { addVisit, listHistory } from './history.ts';
import { find } from '../find/index.ts';
import { internalHeaders } from '../internal.ts';
import { browserOf, closeAll, ensureBrowser, setBrowserDeps } from './session.ts';
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
    assert.deepEqual(browsingPrefs(db), { home: 'https://www.google.com/', engine: 'google', suggest: true, adblock: true, allowAds: [] });
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
    assert.deepEqual(p, { home: 'http://localhost:3000/start', engine: 'custom', customSearch: 'https://s.example/find?q=%s', suggest: false, adblock: false, allowAds: ['shop.example'] });
    assert.throws(() => setBrowsingPrefs(db, { customSearch: '' }), refused(400, /search page/), 'custom cannot lose its page');
    assert.equal(setBrowsingPrefs(db, { engine: 'bing', customSearch: null }).customSearch, undefined);
    // What is kept is checked when read, too.
    store.set('browser.browsing.prefs', JSON.stringify({ home: 'javascript:x', engine: 'custom', suggest: 'no', allowAds: 'a.com b.com' }));
    assert.deepEqual(browsingPrefs(db), { home: 'https://www.google.com/', engine: 'google', suggest: true, adblock: true, allowAds: ['a.com', 'b.com'] });
    store.set('browser.browsing.prefs', 'junk');
    assert.equal(browsingPrefs(db).engine, 'google');
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
  await check('do this here: the first message’s line', () => {
    const l = handoffLine({ title: 'Inbox “(3)”\nSneaky', url: 'https://mail.example.com/inbox?pw=abc', site: 'mail.example.com' });
    assert.match(l, /“Inbox \(3\) Sneaky” at https:\/\/mail\.example\.com\/inbox\?pw=hidden is open in your browser/);
    assert.match(l, /kept to mail\.example\.com/);
    assert.match(l, /browser_read/);
  });

  // ---- for real, when a Chromium is installed ----
  const chrome = pickChrome('');
  if (!chrome) {
    console.log('skip the real-browser checks: no Chromium found');
  } else {
    await realBrowser();
  }
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
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
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
      assert.deepEqual(p, { home: `${base}/home`, engine: 'custom', customSearch: `${base}/search?q=%s`, suggest: false, adblock: false, allowAds: ['ads.example'] });
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
