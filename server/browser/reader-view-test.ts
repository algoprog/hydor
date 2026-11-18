// Script tests for reader view in your own browsing: reading time and colours as chosen (the pure parts), the style sheet, the
// class with a stand-in tab (a page that has loaded is looked at for an article, at once and a moment later, only web pages;
// reader view shows, hides, takes the settings, ends when the page moves on without loading; a page with no article or too
// little of one is refused), the route (agents refused, bad bodies, no such tab), and the code that runs in a page, in a real
// Chromium when there is one (the check for an article, the cover with the article over the page and its sanitiser, the page
// underneath not scrolling, keys scrolling the article, a page whose policy forbids styles, the settings reaching the cover,
// taking it away so the page is as it was).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/reader-view-test.ts
//   DATA_DIR=/tmp/hydor-test-reader node dist/dev/reader-view-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { READER_DEFAULTS } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { ruleFor } from '../guide/api.ts';
import type { ReaderRaw } from '../pages/reader.ts';
import { setBrowsingPrefs } from './browsing.ts';
import { Cdp } from './cdp.ts';
import { findChromes, launchChrome } from './chrome.ts';
import { readerScript } from './reader-script.ts';
import { dirOf, hideScript, isWebUrl, MIN_LENGTH, NO_ARTICLE, pageKey, readerCss, readerRoutes, readerableScript, ReaderViews, readingMinutes, resolveTheme, restyleScript, showScript, type LiveTab } from './reader-view.ts';

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

const dir = process.env.DATA_DIR!;
fs.mkdirSync(dir, { recursive: true });
let n = 0;
const fresh = () => openDb(path.join(dir, `reader-${++n}-${process.pid}.db`), { cacheMb: 8 });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A stand-in tab: what the page code is asked is written down, and what it answers is set by the test. */
function fakeTab(id: string, url: string, o: { reader?: ReaderRaw | null; answer?: (expr: string) => unknown } = {}) {
  const t = {
    targetId: id,
    url,
    closed: false,
    readerable: false,
    readerOn: false,
    changed: 0,
    asked: [] as string[],
    owner: { changed: () => void t.changed++ },
    async evaluate<T>(expr: string): Promise<T> {
      t.asked.push(expr);
      if (o.answer) return o.answer(expr) as T;
      return false as T;
    },
    /** What Readability finds in the page: set by the test. */
    reader: async (): Promise<ReaderRaw | null> => o.reader ?? null,
  };
  return t as typeof t & LiveTab;
}

const ARTICLE: ReaderRaw = { title: 'A fine article', byline: 'By Jane', siteName: 'Example', lang: 'en', publishedTime: '2026-03-04T10:00:00Z', content: `<p>${'Words. '.repeat(100)}</p>`, length: 700 };

async function main() {
  await check('reading time: about 230 words a minute, at least one minute, Chinese counted by characters', () => {
    assert.equal(readingMinutes(0), 1);
    assert.equal(readingMinutes(700), 1);
    assert.equal(readingMinutes(230 * 6 * 5), 5, 'five minutes of words');
    assert.equal(readingMinutes(230 * 6 * 5 + 200), 5);
    assert.equal(readingMinutes(4000, 'zh-CN'), 10);
    assert.equal(readingMinutes(4000, 'ja'), 10);
    assert.equal(readingMinutes(4000, 'de'), 3);
    assert.equal(readingMinutes(-5), 1);
  });

  await check('colours: what you chose, and for auto the look the app has now', () => {
    assert.equal(resolveTheme('auto', 'dark'), 'dark');
    assert.equal(resolveTheme('auto', 'light'), 'light');
    assert.equal(resolveTheme('sepia', 'dark'), 'sepia');
    assert.equal(resolveTheme('dark', 'light'), 'dark');
    assert.equal(resolveTheme('light', 'dark'), 'light');
  });

  await check('style sheet: the colours, font and size of the look; a size out of range is held to 14 to 28', () => {
    const dark = readerCss({ size: 19, font: 'serif' }, 'dark');
    for (const c of ['#16161a', '#e4e4e7', '#a1a1aa', '#8ab4f8']) assert.ok(dark.includes(c), c);
    assert.ok(dark.includes('font-size: 19px') && dark.includes('Charter') && dark.includes('color-scheme: dark'));
    const light = readerCss({ size: 22, font: 'sans' }, 'light');
    for (const c of ['#ffffff', '#1f1f23', '#6b6b76', '#1a5fd0']) assert.ok(light.includes(c), c);
    assert.ok(light.includes('font-size: 22px') && light.includes('system-ui') && !light.includes('Charter') && light.includes('color-scheme: light'));
    const sepia = readerCss({ size: 19, font: 'serif' }, 'sepia');
    for (const c of ['#f4ecd8', '#433422', '#7a6a55', '#8a4b12']) assert.ok(sepia.includes(c), c);
    assert.ok(readerCss({ size: 99, font: 'serif' }, 'dark').includes('font-size: 28px'));
    assert.ok(readerCss({ size: 2, font: 'serif' }, 'dark').includes('font-size: 14px'));
    assert.ok(/max-width: 34em/.test(dark) && /line-height: 1\.65/.test(dark));
  });

  await check('addresses: web pages and files only; moving within a page is not another page; right-to-left languages', () => {
    assert.ok(isWebUrl('https://a.example/x') && isWebUrl('http://a.example') && isWebUrl('file:///tmp/a.html'));
    for (const u of ['about:blank', 'chrome://settings', 'data:text/html,x', 'javascript:1', '']) assert.ok(!isWebUrl(u), u);
    assert.equal(pageKey('https://a.example/x?y=1#top'), 'https://a.example/x?y=1');
    assert.equal(pageKey('about:blank'), null);
    assert.equal(dirOf('ar'), 'rtl');
    assert.equal(dirOf('he-IL'), 'rtl');
    assert.equal(dirOf('fa_IR'), 'rtl');
    assert.equal(dirOf('en'), '');
    assert.equal(dirOf(undefined), '');
  });

  await check('route: your own browsing’s, so agents are refused', () => {
    assert.equal(ruleFor('POST', '/api/browser/browsing/tabs/abc/reader').level, 'refuse');
  });

  await check('route: a body that is not on or off, a theme that is not dark or light, and a tab that is not there are refused', async () => {
    const db = fresh();
    const app = Fastify();
    app.setErrorHandler((err: Error, _req, reply) => void reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
    const deps = { app, db, sessions: null, scheduler: null, models: null, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://localhost' } as unknown as Deps;
    const views = new ReaderViews(db, () => []);
    readerRoutes(deps, views);
    const post = async (payload: unknown) => app.inject({ method: 'POST', url: '/api/browser/browsing/tabs/nope/reader', payload: payload as object });
    assert.equal((await post({})).statusCode, 400);
    assert.equal((await post({ on: 'yes' })).statusCode, 400);
    assert.equal((await post({ on: true, theme: 'blue' })).statusCode, 400);
    assert.equal((await post({ on: true, theme: 'light' })).statusCode, 404);
    assert.equal((await post({ on: false })).statusCode, 404);
    views.stop();
    await app.close();
    db.close();
  });

  await check('live: a page that has loaded is looked at for an article, at once and a moment later; the tab says so once; only web pages', async () => {
    const db = fresh();
    let has = false;
    const a = fakeTab('a', 'https://a.example/post', { answer: () => has });
    const blank = fakeTab('blank', 'about:blank');
    const views = new ReaderViews(db, () => [a, blank], [0, 40]);
    views.seen({ open: true, tabs: [{ id: 'a', url: a.url, loading: true }, { id: 'blank', url: blank.url }] });
    await wait(80);
    assert.equal(a.asked.length, 0, 'not while it loads');
    assert.equal(blank.asked.length, 0, 'not a page that is not on the web');
    views.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 1 }, { id: 'blank', url: blank.url }] });
    await wait(10);
    assert.equal(a.asked.length, 1, 'at once');
    assert.ok(a.asked[0].includes('isProbablyReaderable'));
    assert.equal(a.readerable, false);
    // The article comes late: the second look finds it.
    has = true;
    await wait(80);
    assert.equal(a.asked.length, 2);
    assert.equal(a.readerable, true);
    assert.equal(a.changed, 1, 'the view hears of it once');
    // The same state again: no new pass.
    views.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 1 }] });
    await wait(80);
    assert.equal(a.asked.length, 2);
    // A reload that is a new document starts without it (Tab does that) and is looked at again.
    a.readerable = false;
    views.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 2 }] });
    await wait(10);
    assert.equal(a.asked.length, 3, 'loaded again');
    assert.equal(a.readerable, true);
    views.stop();
    db.close();
  });

  await check('live: a first look decides (an article gone is gone), later ones only add; a page that fails to answer is left as it is', async () => {
    const db = fresh();
    let has = true;
    let fail = false;
    const a = fakeTab('a', 'https://a.example/post', {
      answer: () => {
        if (fail) throw new Error('Cannot find context with specified id');
        return has;
      },
    });
    const views = new ReaderViews(db, () => [a], [0, 40]);
    views.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 1 }] });
    await wait(80);
    assert.equal(a.readerable, true);
    // Another page of a site that changes its address itself: the first look decides again.
    has = false;
    a.url = 'https://a.example/other';
    views.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 1 }] });
    await wait(10);
    assert.equal(a.readerable, false, 'the new page has none');
    // An answer that fails changes nothing.
    fail = true;
    a.readerable = true;
    a.url = 'https://a.example/third';
    views.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 1 }] });
    await wait(80);
    assert.equal(a.readerable, true);
    views.stop();
    db.close();
  });

  await check('show: a page with no article, or too little, or no web page, is refused; one with an article is shown with the settings', async () => {
    const db = fresh();
    const none = fakeTab('n', 'https://a.example/', { reader: null });
    const views = new ReaderViews(db, () => [none]);
    await assert.rejects(views.show(none, 'dark'), (e: HttpError) => e.status === 409 && e.message === NO_ARTICLE);
    const short = fakeTab('s', 'https://a.example/', { reader: { ...ARTICLE, content: '<p>Hi</p>', length: MIN_LENGTH - 1 } });
    await assert.rejects(views.show(short, 'dark'), (e: HttpError) => e.status === 409 && e.message === NO_ARTICLE);
    const blank = fakeTab('b', 'about:blank', { reader: ARTICLE });
    await assert.rejects(views.show(blank, 'dark'), (e: HttpError) => e.status === 409);
    assert.equal(none.readerOn || short.readerOn || blank.readerOn, false);

    setBrowsingPrefs(db, { reader: { size: 22, theme: 'sepia', font: 'sans' } });
    const ok = fakeTab('ok', 'https://a.example/post#top', { reader: ARTICLE, answer: () => 'shown' });
    await views.show(ok, 'light');
    assert.equal(ok.readerOn, true);
    assert.equal(ok.readerable, true);
    assert.equal(ok.changed, 1);
    const code = ok.asked[0];
    assert.ok(code.includes('#f4ecd8') && code.includes('font-size: 22px'), 'sepia at 22 px');
    assert.ok(code.includes('"minutes":"1 min read"') && code.includes('"title":"A fine article"') && code.includes('"href":"https://a.example/post#top"'));
    views.stop();
    db.close();
  });

  await check('show: the page being another one by the time the cover goes on is said so, and nothing shows', async () => {
    const db = fresh();
    const t = fakeTab('t', 'https://a.example/post', { reader: ARTICLE, answer: () => 'moved' });
    const views = new ReaderViews(db, () => [t]);
    await assert.rejects(views.show(t, 'dark'), (e: HttpError) => e.status === 409 && /changed/.test(e.message));
    assert.equal(t.readerOn, false);
    views.stop();
    db.close();
  });

  await check('hide, restyle: the cover goes, the settings reach every open one (auto with the look it was shown with), one the page took away is not on any more', async () => {
    const db = fresh();
    const css: Record<string, string> = {};
    let covered = true;
    const answer = (id: string) => (e: string) => {
      if (e.startsWith('(function (P)')) return 'shown';
      const m = /r\.css\((".*")\); return true/s.exec(e);
      if (m) {
        css[id] = JSON.parse(m[1]);
        return covered;
      }
      return true;
    };
    const a = fakeTab('a', 'https://a.example/a', { reader: ARTICLE, answer: answer('a') });
    const b = fakeTab('b', 'https://a.example/b', { reader: ARTICLE, answer: answer('b') });
    const off = fakeTab('off', 'https://a.example/c', { answer: answer('off') });
    const views = new ReaderViews(db, () => [a, b, off]);
    await views.show(a, 'dark');
    await views.show(b, 'light');
    setBrowsingPrefs(db, { reader: { size: 24, theme: 'auto', font: 'serif' } });
    await views.restyle();
    assert.ok(css.a.includes('#16161a') && css.a.includes('font-size: 24px'), 'shown with the dark look: dark');
    assert.ok(css.b.includes('#ffffff'), 'shown with the light look: light');
    assert.equal(css.off, undefined, 'a tab that shows none is not touched');
    setBrowsingPrefs(db, { reader: { size: 24, theme: 'sepia', font: 'serif' } });
    await views.restyle();
    assert.ok(css.a.includes('#f4ecd8') && css.b.includes('#f4ecd8'), 'sepia whatever the look');
    // The page took the covers away: they are not on any more.
    covered = false;
    const changed = b.changed;
    await views.restyle();
    assert.equal(a.readerOn, false);
    assert.equal(b.readerOn, false);
    assert.ok(b.changed > changed, 'the view hears of it');
    // Hide asks the page to take the cover away, and the tab is off at once.
    await views.show(a, 'dark');
    assert.equal(a.readerOn, true);
    await views.hide(a);
    assert.equal(a.readerOn, false);
    assert.ok(a.asked.at(-1)!.includes('r.hide()'));
    views.stop();
    db.close();
  });

  await check('live: moving to another address without loading ends reader view; a hash move, or the same page again, does not', async () => {
    const db = fresh();
    const t = fakeTab('t', 'https://a.example/post', { answer: () => true });
    const views = new ReaderViews(db, () => [t], [0]);
    views.seen({ open: true, tabs: [{ id: 't', url: t.url, loadedAt: 1 }] });
    await wait(10);
    t.readerOn = true;
    t.url = 'https://a.example/post#section-2';
    views.seen({ open: true, tabs: [{ id: 't', url: t.url, loadedAt: 1 }] });
    await wait(10);
    assert.equal(t.readerOn, true, 'a place in the same page');
    views.seen({ open: true, tabs: [{ id: 't', url: t.url, loadedAt: 1, loading: false }] });
    await wait(10);
    assert.equal(t.readerOn, true);
    t.url = 'https://a.example/next-article';
    views.seen({ open: true, tabs: [{ id: 't', url: t.url, loadedAt: 1 }] });
    await wait(20);
    assert.equal(t.readerOn, false, 'the article shown was the old one');
    assert.ok(t.asked.some((e) => e.includes('r.hide()')), 'its cover is taken away');
    // A new page that loads (a new document) already starts without it: nothing to take away.
    t.readerOn = false;
    const asked = t.asked.length;
    t.url = 'https://a.example/loaded';
    views.seen({ open: true, tabs: [{ id: 't', url: t.url, loading: true }] });
    views.seen({ open: true, tabs: [{ id: 't', url: t.url, loadedAt: 2 }] });
    await wait(20);
    assert.ok(!t.asked.slice(asked).some((e) => e.includes('r.hide()')));
    // A tab that closes is forgotten, and the browser closing stops it.
    views.seen({ open: true, tabs: [] });
    views.seen({ open: false, tabs: [] });
    views.stop();
    db.close();
  });

  await pageScript();
}

// ---- in a real Chromium ------------------------------------------------------------------------------

const LOREM = [
  'The harbour town woke slowly that morning, as it always did when the fog came in from the sea and settled over the roofs like a grey blanket. Fishermen stood about on the quay with their hands in their pockets, saying little and watching the water.',
  'By nine the fog had begun to lift, and the first boats went out past the lighthouse, their engines low and steady. The baker opened her shutters, the smell of warm bread drifted down the lane, and the town took on its ordinary noises one by one.',
  'Nobody could remember exactly when the market had moved from the square to the old customs house, but everyone agreed it was an improvement. Under its high roof the stalls kept dry, and the voices of the sellers carried in a way they never had outdoors.',
  'A visitor, had there been one, might have noticed how little hurry there was in any of it. Orders were taken slowly, change was counted twice, and every purchase came with a remark about the weather, the price of fuel, or somebody’s cousin.',
  'In the afternoon the light turned gold and long, and the children came down from the school on the hill to run along the sea wall. The old men on the benches pretended not to watch them, and watched them all the same.',
  'When evening came the lamps were lit one at a time along the quay, and the boats returned in a loose line, each with its small cargo and its own account of the day. The fog, which had gone away, came back with the dark.',
];

const PAGE = (extra = '', csp = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Harbour Town | Example Times</title>${csp}
<meta property="og:site_name" content="Example Times"><meta name="author" content="Jane Writer">
<style>html { scroll-behavior: auto; } body { margin: 8px; font: 16px sans-serif; } header, footer { background: #eee; padding: 4px; }</style></head>
<body style="overflow: auto; margin: 8px"><header><nav><a href="/">Home</a> <a href="/news">News</a></nav></header>
<main><article id="story"><h1>The Harbour Town</h1><p class="byline">By Jane Writer</p>
${LOREM.map((p) => `<p>${p}</p>`).join('\n')}
<p><img alt="a red dot" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="></p>
<p><img src="https://example.invalid/missing.png" alt="missing" onerror="window.__pwned = 'onerror ran'"></p>
<p>Read <a href="https://example.com/more">more here</a>, <a href="javascript:window.__pwned='link ran'">a bad link</a> and <a href="#notes">the notes</a>.</p>
${LOREM.map((p) => `<p>${p}</p>`).join('\n')}
<h2 id="notes">Notes</h2>${LOREM.map((p) => `<p>${p}</p>`).join('\n')}
<script>window.__script = 'page script ran';</script>${extra}
</article></main><footer>Copyright Example Times</footer></body></html>`;

const SHORT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Login</title></head><body><form><input name="u"><button>Sign in</button></form><p>Welcome back.</p></body></html>`;

/** What goes into the sanitiser raw, as a hostile page's article might: nothing here may reach the cover as code or as a way out. */
const HOSTILE = `<p onclick="window.__pwned='click'" style="color:red" class="x">Plain <b>bold</b> <font color=red>font</font> text with a <a href="javascript:alert(1)">js link</a>, <a href="java&#x09;script:alert(2)">tab link</a>, <a href="data:text/html,<script>alert(3)</script>">data link</a>, <a href=" HTTPS://example.com/ok " target="_blank" onmouseover="x()">good link</a>, <a href="mailto:a@b.example">mail</a> and <a href="#here">anchor</a>.</p>
<script>window.__pwned='script ran'</script><style>body{display:none}</style><iframe src="https://example.com/frame"></iframe><object data="x"></object><embed src="x"><form action="https://evil.example"><input name="pw"><button>Go</button></form><svg onload="window.__pwned='svg'"><circle r="3"></circle></svg><math><mi>x</mi></math><textarea>secret</textarea><video src="v.mp4">fallback</video><noscript><img src=x onerror="window.__pwned='noscript'"></noscript>
<img src="javascript:alert(1)" alt="js img"><img src="https://example.com/a.png" srcset="https://example.com/a-2x.png 2x, javascript:alert(4) 3x, data:image/png;base64,AAAA 1x" alt="ok img" onerror="window.__pwned='img'" width="9999">
<picture><source srcset="https://example.com/p.webp 800w" media="(min-width: 600px)" type="image/webp"><img src="data:text/html;base64,PHNjcmlwdD4=" alt="data html img"></picture>
<table><caption>Cap</caption><thead><tr><th colspan="2" onclick="x()">H</th></tr></thead><tbody><tr><td rowspan="2">1</td><td>2</td></tr></tbody></table>
<ul><li>one</li><li>two <custom-thing data-x="1">kept words</custom-thing></li></ul><blockquote cite="https://example.com/q">Quote</blockquote><pre><code>let a = 1 &lt; 2;</code></pre><section dir="rtl" lang="ar"><p>مرحبا</p></section><div id="x" dir="sideways">after</div><button>no</button><h2 id="here">Here</h2>`;

async function pageScript() {
  const chrome = findChromes().find((c) => c.source !== 'desktop');
  if (!chrome) {
    console.log('skip the page code in a real Chromium: none found');
    return;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-reader-'));
  const files = { article: path.join(work, 'article.html'), short: path.join(work, 'short.html'), csp: path.join(work, 'csp.html'), arabic: path.join(work, 'arabic.html') };
  fs.writeFileSync(files.article, PAGE());
  fs.writeFileSync(files.short, SHORT);
  fs.writeFileSync(files.csp, PAGE('', `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'none'; img-src data:">`));
  fs.writeFileSync(files.arabic, PAGE().replace('<html lang="en">', '<html lang="ar" dir="rtl">'));
  const { proc, wsUrl } = await launchChrome(chrome, { userDataDir: path.join(work, 'profile'), headless: true });
  const cdp = await Cdp.connect(wsUrl);
  const db = fresh();
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m: string, p: object = {}) => cdp.send(m, p, sessionId);
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
    let world: number | null = null;
    // The page's own world, and the isolated one the app's code runs in (as Tab.evaluate: one per document).
    const main = async <T>(expression: string): Promise<T> => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value as T;
    };
    const iso = async <T>(expression: string): Promise<T> => {
      if (world === null) world = (await send('Page.createIsolatedWorld', { frameId: targetId, worldName: 'naget', grantUniveralAccess: false })).executionContextId as number;
      const r = await send('Runtime.evaluate', { expression, contextId: world, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text);
      return r.result?.value as T;
    };
    const open = async (file: string) => {
      world = null;
      const url = `file://${file}`;
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) {
        await wait(50);
        if ((await main<string>('document.readyState').catch(() => '')) === 'complete' && (await main<string>('location.href').catch(() => '')) === url) break;
      }
      return url;
    };
    const tabAt = (url: string) => {
      const t = fakeTab('live', url, {});
      t.evaluate = iso as LiveTab['evaluate'];
      t.reader = () => iso<ReaderRaw | null>(readerScript());
      return t;
    };
    const inCover = <T>(js: string) => iso<T>(`(() => { const r = globalThis.__hydorReader; const sr = r && r.root; if (!sr) return null; return (${js}); })()`);

    await check('page: an article page is readerable and a short page with a form is not; the check leaves the page alone', async () => {
      await open(files.article);
      const html0 = await main<string>('document.documentElement.outerHTML');
      assert.equal(await iso<boolean>(readerableScript()), true);
      assert.equal(await main<string>('document.documentElement.outerHTML'), html0);
      await open(files.short);
      assert.equal(await iso<boolean>(readerableScript()), false);
      await main('1').catch(() => {});
    });

    await open(files.article);
    const before = {
      html: await main<string>('document.documentElement.outerHTML'),
      scroll: await main<string>('JSON.stringify([getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow, document.documentElement.getAttribute("style"), document.body.getAttribute("style")])'),
      scrollY: await main<number>('scrollY'),
    };
    const tab = tabAt(`file://${files.article}`);
    const views = new ReaderViews(db, () => [tab]);
    setBrowsingPrefs(db, { reader: READER_DEFAULTS });

    await check('page: reader view puts the article over the page: the header, the text, a cover on top, the page behind it not scrolling', async () => {
      // (The page’s own broken picture has an onerror of its own, which has run by now: only what happens from here is the cover’s.)
      await main('delete window.__pwned; 1');
      await views.show(tab, 'dark');
      assert.equal(tab.readerOn, true);
      assert.ok(tab.changed >= 1);
      assert.equal(await main<string>('document.documentElement.lastElementChild.localName'), 'hydor-reader');
      assert.equal(await main<boolean>('document.documentElement.lastElementChild.shadowRoot === null'), true, 'the shadow root is closed to the page');
      const host = await main<{ pos: string; z: string; disp: string; w: number; h: number }>(`(() => { const h = document.documentElement.lastElementChild; const s = getComputedStyle(h); return { pos: s.position, z: s.zIndex, disp: s.display, w: h.getBoundingClientRect().width, h: h.getBoundingClientRect().height }; })()`);
      assert.deepEqual([host.pos, host.z, host.disp, host.w, host.h], ['fixed', '2147483647', 'block', 900, 700]);
      assert.equal(await main<string>('document.elementFromPoint(450, 300).localName'), 'hydor-reader', 'it covers the page');
      assert.equal(await main<string>('JSON.stringify([getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow])'), '["hidden","hidden"]');
      const head = await inCover<string[]>(`[sr.querySelector('.site')?.textContent, sr.querySelector('h1.title').textContent, sr.querySelector('.byline')?.textContent, sr.querySelector('.meta').textContent]`);
      assert.equal(head![0], 'Example Times');
      assert.match(head![1], /^The Harbour Town/);
      assert.equal(head![2], 'Jane Writer');
      assert.match(head![3], /^\d+ min read · March 4, 2026$|^\d+ min read/);
      assert.ok((await inCover<number>(`sr.querySelectorAll('.body p').length`))! >= 18);
      assert.equal(await inCover<boolean>(`!sr.querySelector('nav, footer')`), true, 'the page’s menu and footer are not in it');
      assert.equal(await inCover<string>(`sr.getElementById('notes') && sr.getElementById('notes').textContent`), 'Notes');
    });

    await check('page: what the page’s scripts and the article’s own markup could do does not run, and the links that could are not links', async () => {
      await wait(300);
      assert.equal(await main<string | undefined>('window.__pwned'), undefined);
      const html = (await inCover<string>('sr.innerHTML'))!;
      assert.ok(!/<script|onerror|onclick|javascript:|<iframe|<form/i.test(html), html.slice(0, 300));
      assert.equal(await inCover<boolean>(`!!sr.querySelector('a[href="https://example.com/more"]')`), true, 'a good link is a real link');
      assert.equal(await inCover<boolean>(`!!sr.querySelector('img[src^="data:image/png"]')`), true, 'a picture is kept');
      assert.equal(await inCover<string>(`[...sr.querySelectorAll('a')].map((a) => a.getAttribute('href')).join(' ')`), 'https://example.com/more #notes', 'the bad link has none');
      assert.equal(await inCover<number>(`sr.querySelectorAll('script, style[nonce], iframe').length`), 0);
    });

    await check('page: the look is the settings’ (dark here, serif, 19 px), the column is centred and narrow', async () => {
      const s = await inCover<{ bg: string; fg: string; font: string; size: string; w: number; left: number; lh: string; room: number }>(
        `(() => { const sc = sr.querySelector('.scroll'); const p = sr.querySelector('.page'); const cs = getComputedStyle(sc); const r = p.getBoundingClientRect(); return { bg: cs.backgroundColor, fg: cs.color, font: cs.fontFamily, size: cs.fontSize, w: r.width, left: r.left, lh: cs.lineHeight, room: sc.clientWidth }; })()`,
      );
      assert.equal(s!.bg, 'rgb(22, 22, 26)');
      assert.equal(s!.fg, 'rgb(228, 228, 231)');
      assert.match(s!.font, /Charter/);
      assert.equal(s!.size, '19px');
      assert.equal(s!.w, 34 * 19, 'a column of 34 em');
      assert.equal(s!.left, (s!.room - 34 * 19) / 2, 'centred in what the scroller leaves of the window');
      assert.ok(Math.abs(parseFloat(s!.lh) - 19 * 1.65) < 0.01, s!.lh);
      const link = await inCover<string>(`getComputedStyle(sr.querySelector('.body a')).color`);
      assert.equal(link, 'rgb(138, 180, 248)');
    });

    await check('page: the article’s scroller has the focus, so Page Down and arrow keys scroll the article and not the page', async () => {
      assert.equal(await inCover<string>('sr.activeElement && sr.activeElement.className'), 'scroll');
      assert.equal(await inCover<number>(`sr.querySelector('.scroll').scrollTop`), 0);
      for (const [key, code, vk] of [['PageDown', 'PageDown', 34], ['ArrowDown', 'ArrowDown', 40], [' ', 'Space', 32]] as const) {
        const top = (await inCover<number>(`sr.querySelector('.scroll').scrollTop`))!;
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, ...(key === ' ' ? {} : {}) });
        if (key === ' ') await send('Input.dispatchKeyEvent', { type: 'char', text: ' ', key, code });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
        await wait(250);
        assert.ok((await inCover<number>(`sr.querySelector('.scroll').scrollTop`))! > top, `${key} scrolls the article`);
      }
      assert.equal(await main<number>('scrollY'), before.scrollY, 'the page itself stays where it was');
      // The article’s own #link scrolls inside it and leaves the address alone.
      const top = (await inCover<number>(`sr.querySelector('.scroll').scrollTop`))!;
      await inCover<void>(`sr.querySelector('.scroll').scrollTop = 0`);
      await inCover<void>(`sr.querySelector('a[href="#notes"]').click()`);
      assert.ok((await inCover<number>(`sr.querySelector('.scroll').scrollTop`))! > 100 && top >= 0, 'to the notes');
      assert.equal(await main<string>('location.hash'), '');
    });

    await check('page: the translator’s hook is there while it shows (the shadow root), and the page’s keys do not hear the article’s', async () => {
      assert.equal(await iso<boolean>(`!!globalThis.__hydorReader && globalThis.__hydorReader.root instanceof ShadowRoot`), true);
      await main(`window.__keys = 0; document.addEventListener('keydown', () => window.__keys++); 1`);
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'j', code: 'KeyJ', windowsVirtualKeyCode: 74 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'j', code: 'KeyJ', windowsVirtualKeyCode: 74 });
      await wait(100);
      assert.equal(await main<number>('window.__keys'), 0);
    });

    await check('page: new settings reach the cover that shows (sepia, sans, 24 px), and auto follows the look it was shown with', async () => {
      setBrowsingPrefs(db, { reader: { size: 24, theme: 'sepia', font: 'sans' } });
      await views.restyle();
      const s = await inCover<{ bg: string; font: string; size: string }>(`(() => { const cs = getComputedStyle(sr.querySelector('.scroll')); return { bg: cs.backgroundColor, font: cs.fontFamily, size: cs.fontSize }; })()`);
      assert.deepEqual([s!.bg, s!.size], ['rgb(244, 236, 216)', '24px']);
      assert.match(s!.font, /system-ui/);
      setBrowsingPrefs(db, { reader: { size: 19, theme: 'auto', font: 'serif' } });
      await views.restyle();
      assert.equal(await inCover<string>(`getComputedStyle(sr.querySelector('.scroll')).backgroundColor`), 'rgb(22, 22, 26)', 'shown as dark: dark');
      setBrowsingPrefs(db, { reader: { size: 19, theme: 'light', font: 'serif' } });
      await views.restyle();
      assert.equal(await inCover<string>(`getComputedStyle(sr.querySelector('.scroll')).backgroundColor`), 'rgb(255, 255, 255)');
      assert.equal(tab.readerOn, true);
    });

    await check('page: hiding takes the cover away and the page is exactly as it was (its DOM, its scroll styles, its place)', async () => {
      await views.hide(tab);
      assert.equal(tab.readerOn, false);
      assert.equal(await main<string>('document.documentElement.outerHTML'), before.html);
      assert.equal(await main<string>('JSON.stringify([getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow, document.documentElement.getAttribute("style"), document.body.getAttribute("style")])'), before.scroll);
      assert.equal(await main<number>('scrollY'), before.scrollY);
      assert.equal(await iso<boolean>(`globalThis.__hydorReader === undefined`), true);
      assert.equal(await main<string>('document.elementFromPoint(450, 300).localName'), 'p');
      // Hiding again, and a restyle with nothing shown, are quiet.
      await views.hide(tab);
      await views.restyle();
    });

    await check('page: showing twice replaces the cover (one only), and hiding leaves the page as it was again', async () => {
      await views.show(tab, 'light');
      await views.show(tab, 'dark');
      assert.equal(await main<number>(`document.querySelectorAll('hydor-reader').length`), 1);
      await views.hide(tab);
      assert.equal(await main<string>('document.documentElement.outerHTML'), before.html);
      assert.equal(await main<string>('JSON.stringify([getComputedStyle(document.documentElement).overflow, document.documentElement.getAttribute("style"), document.body.getAttribute("style")])'), JSON.stringify(JSON.parse(before.scroll).filter((_: unknown, i: number) => i !== 1)));
    });

    await check('page: the sanitiser keeps the allowed, unwraps the unknown, drops the dangerous with what is in it, and checks every address', async () => {
      const url = `file://${files.article}`;
      await main('delete window.__pwned; 1');
      const r = await iso<string>(showScript({ href: url, css: readerCss({ size: 19, font: 'serif' }, 'dark'), html: HOSTILE, title: 'Hostile', site: '', byline: '', minutes: '1 min read', date: 'not a date', lang: 'en', dir: '' }));
      assert.equal(r, 'shown');
      await wait(300);
      assert.equal(await main<string | undefined>('window.__pwned'), undefined, 'nothing ran');
      const html = (await inCover<string>(`sr.querySelector('.body').innerHTML`))!;
      assert.ok(!/<script|<style|<iframe|<object|<embed|<form|<svg|<math|<textarea|<video|<noscript|<button|<input|onerror|onclick|onmouseover|onload|javascript:|style=|class=|target=|width=/i.test(html), html);
      assert.ok(!/secret|fallback|evil\.example|body\{display/.test(html), 'what was inside the dropped is gone too');
      assert.match(html, /Plain <b>bold<\/b> font text/, 'an unknown tag (font) gives up its tag and keeps its words');
      assert.match(html, /kept words/, 'so does a custom element');
      const links = await inCover<string[]>(`[...sr.querySelectorAll('.body a')].map((a) => a.getAttribute('href'))`);
      assert.deepEqual(links, [null, null, null, 'https://example.com/ok', 'mailto:a@b.example', '#here'], 'only http, https, mailto and #place stay');
      const imgs = await inCover<(string | null)[][]>(`[...sr.querySelectorAll('.body img')].map((i) => [i.getAttribute('src'), i.getAttribute('srcset'), i.getAttribute('alt')])`);
      assert.deepEqual(imgs, [['https://example.com/a.png', 'https://example.com/a-2x.png 2x, data:image/png;base64,AAAA 1x', 'ok img']], 'a picture with no safe address is gone, the unsafe one in a srcset too');
      assert.equal(await inCover<boolean>(`!!sr.querySelector('.body picture source[srcset="https://example.com/p.webp 800w"]')`), true);
      const t = await inCover<string[]>(`[sr.querySelector('th').getAttribute('colspan'), sr.querySelector('td').getAttribute('rowspan'), sr.querySelector('blockquote').getAttribute('cite'), sr.querySelector('section').getAttribute('dir'), sr.querySelector('section').getAttribute('lang'), sr.querySelector('.body > div').getAttribute('dir'), sr.getElementById('here') && sr.getElementById('here').localName]`);
      assert.deepEqual(t, ['2', '2', 'https://example.com/q', 'rtl', 'ar', null, 'h2'], 'allowed attributes kept, a made-up direction dropped');
      assert.equal(await inCover<string>(`sr.querySelector('.meta')?.textContent || ''`), '1 min read', 'a date that is not one is left out');
      await views.hide(tab);
      assert.equal(await main<string>('document.documentElement.outerHTML'), before.html);
    });

    await check('page: an article that is all dropped parts shows nothing; a page that is another one by then is not covered', async () => {
      const url = `file://${files.article}`;
      const base = { css: readerCss({ size: 19, font: 'serif' }, 'dark'), title: 't', site: '', byline: '', minutes: '', date: '', lang: '', dir: '' as const };
      assert.equal(await iso<string>(showScript({ ...base, href: url, html: '<script>1</script><iframe></iframe>' })), 'empty');
      assert.equal(await iso<string>(showScript({ ...base, href: 'https://elsewhere.example/', html: '<p>words words words</p>' })), 'moved');
      assert.equal(await main<number>(`document.querySelectorAll('hydor-reader').length`), 0);
      assert.equal(await main<string>('document.documentElement.outerHTML'), before.html);
      assert.equal(await iso<boolean>(hideScript()), false, 'nothing to hide');
      assert.equal(await iso<boolean>(restyleScript('p{}')), false);
    });

    await check('page: a page whose policy forbids styles still gets the article styled', async () => {
      setBrowsingPrefs(db, { reader: READER_DEFAULTS });
      const url = await open(files.csp);
      const t = tabAt(url);
      const v = new ReaderViews(db, () => [t]);
      await v.show(t, 'dark');
      assert.equal(await inCover<string>(`getComputedStyle(sr.querySelector('.scroll')).backgroundColor`), 'rgb(22, 22, 26)');
      assert.equal(await inCover<string>(`getComputedStyle(sr.querySelector('.page')).maxWidth`), `${34 * 19}px`);
      setBrowsingPrefs(db, { reader: { size: 19, theme: 'sepia', font: 'serif' } });
      await v.restyle();
      assert.equal(await inCover<string>(`getComputedStyle(sr.querySelector('.scroll')).backgroundColor`), 'rgb(244, 236, 216)');
      await v.hide(t);
      v.stop();
    });

    await check('page: a right-to-left article is shown right to left', async () => {
      const url = await open(files.arabic);
      const t = tabAt(url);
      const v = new ReaderViews(db, () => [t]);
      await v.show(t, 'dark');
      assert.equal(await inCover<string>(`sr.querySelector('.page').getAttribute('dir')`), 'rtl');
      assert.equal(await inCover<string>(`getComputedStyle(sr.querySelector('.page')).direction`), 'rtl');
      assert.equal(await inCover<string>(`sr.querySelector('.page').getAttribute('lang')`), 'ar');
      await v.hide(t);
      v.stop();
    });

    await check('page: loading another page ends the cover by itself (a new document), and the tab’s reader state starts again', async () => {
      const url = await open(files.article);
      const t = tabAt(url);
      const v = new ReaderViews(db, () => [t]);
      await v.show(t, 'dark');
      assert.equal(t.readerOn, true);
      await open(files.short);
      assert.equal(await main<number>(`document.querySelectorAll('hydor-reader').length`), 0);
      // (Tab.newDocument resets readerOn; the stand-in does it here.)
      t.readerOn = false;
      t.url = `file://${files.short}`;
      assert.equal(await iso<boolean>(`globalThis.__hydorReader === undefined`), true);
      await v.restyle();
      v.stop();
    });
    views.stop();
  } finally {
    cdp.close();
    try {
      proc.kill('SIGKILL');
    } catch {}
    db.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}

void main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(process.exitCode ?? 0);
});
