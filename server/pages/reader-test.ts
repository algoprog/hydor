// Script tests for the reader copy of a saved web page (reader.ts, the Browser's Save): the article's HTML cleaned to what an
// article is made of (nothing a page could run, nothing it only showed around its text; addresses absolute, links made safe, the
// best picture of a srcset, a video's player kept only from known hosts), its pictures kept with the page at addresses that are
// their own permission (kept-pictures.ts) within the limits on how many, how large and how long, the page itself (the title,
// who, where and when, where it was saved from, what was selected), and the page saved as a Web page of the Library, in a
// project and folder when asked. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/reader-test.ts
//   DATA_DIR=/tmp/hydor-test-reader node dist/dev/reader-test.js
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { createSpace } from '../spaces/index.ts';
import { pages } from './index.ts';
import { makeFolder } from './folders.ts';
import { pageSource } from './store.ts';
import { pagePictureSources, picturesInside, pictureAddress, pictureAddressOk } from './kept-pictures.ts';
import { articleTitle, cleanReaderHtml, dayOf, isArticle, keepPictures, PICTURE_LIMITS, readerPage, saveReaderPage } from './reader.ts';
import { READABILITY_SRC } from '../browser/readability/source.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-reader-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify();
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const told: unknown[] = [];
const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: (m: unknown) => told.push(m), toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
pages.routes!(deps);
await app.ready();

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const BASE = 'https://news.example.com/2026/story/index.html';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ---- the Readability that runs in the tab is the one that was vendored -------------------------------------------
ok(READABILITY_SRC.includes('function Readability(') && READABILITY_SRC.includes('Apache License') && fs.readFileSync(path.join(process.cwd(), 'server/browser/readability/Readability.js'), 'utf8') === READABILITY_SRC, 'the source the tab runs is Readability.js beside it, unchanged');
ok(fs.readFileSync(path.join(process.cwd(), 'server/browser/readability/LICENSE.md'), 'utf8').includes('Apache License') && /Readability/.test(fs.readFileSync(path.join(process.cwd(), 'NOTICE'), 'utf8')), 'its licence is kept beside it and NOTICE credits it');

// ---- cleaning ---------------------------------------------------------------------------------------------------
const dirty = `<div id="readability-page-1" class="page" onclick="x()"><h2 class="big" style="color:red">Heading</h2>
<p onmouseover="bad()">Hello <strong>bold</strong> <em>em</em> <span class="x">span</span><script>alert(1)</script><style>p{}</style> <a href="/more?x=1" onclick="y()">more</a> <a href="javascript:alert(1)">evil</a> <a href="#top">top</a> <a href="mailto:a@b.c">mail</a></p>
<form action="/x"><input name="q"><button>go</button></form><nav>menu</nav><svg><circle/></svg><noscript>no script</noscript><!-- a comment -->
<figure><img src="/img/a.jpg" srcset="/img/a-400.jpg 400w, /img/a-1200.jpg 1200w, /img/a-3000.jpg 3000w" alt="A &quot;quoted&quot; alt" onerror="z()"><figcaption>The caption</figcaption></figure>
<picture><source srcset="/img/p.webp 800w"><img alt="Pic"></picture>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="placeholder"><img src="/pixel.gif" width="1" height="1">
<video src="/v/a.mp4" poster="/v/a.jpg" onplay="q()"></video><video><source src="/v/b.webm" type="video/webm"><source src="javascript:1"></video><video src="blob:https://x/1"></video><audio src="https://cdn.example.com/a.mp3"></audio>
<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Rick"></iframe><iframe src="https://www.loom.com/embed/abc123"></iframe><iframe src="https://evil.example.com/embed/x"></iframe><iframe src="https://player.vimeo.com/video/123456"></iframe>
<table><tr><th colspan="2" onclick="x">H</th></tr><tr><td>1</td><td>2</td></tr></table>
<pre><code class="language-js">let a = 1 &lt; 2;\nfoo()</code></pre><blockquote><p>Quote</p></blockquote><ul><li>one</li><li>two</li></ul><hr><p>a<br>b</p><p>   </p></div>`;
const c = cleanReaderHtml(dirty, BASE);
const h = c.html;
ok(!/<script|<style|<form|<input|<button|<nav|<svg|noscript|<!--|javascript:|onclick|onerror|onmouseover|onplay|class="big"|style=|alert\(1\)|no script|menu/.test(h), 'scripts, styles, forms, menus, svg, comments, event handlers and scripts’ addresses are gone');
ok(h.includes('<h2>Heading</h2>') && h.includes('<strong>bold</strong>') && h.includes('<em>em</em>') && /Hello <strong>/.test(h) && h.includes(' span') && !h.includes('<span'), 'text blocks and emphasis stay, a span goes and its words stay');
ok(h.includes('<a href="https://news.example.com/more?x=1" rel="noopener noreferrer" target="_blank">more</a>'), 'a link is absolute, noopener, and opens in a tab of its own');
ok(!h.includes('>evil</a>') && h.includes('evil') && !h.includes('>top</a>') && h.includes('<a href="mailto:a@b.c"'), 'a javascript: or #fragment link is only its words; mail stays a link');
ok(c.pictures.slice(0, 2).join() === 'https://news.example.com/img/a-1200.jpg,https://news.example.com/img/p.webp', 'the best srcset candidate (the widest up to 1600 px) is the picture; a <picture> is its image; a data: placeholder and a 1×1 pixel are none');
ok(/<figure><img src="[^"]+" alt="A &quot;quoted&quot; alt" loading="lazy"><figcaption>The caption<\/figcaption><\/figure>/.test(h), 'a figure keeps its picture, its alt and its caption');
ok(h.includes('<video controls preload="none" src="https://news.example.com/v/a.mp4" poster="') && h.includes('<source src="https://news.example.com/v/b.webm" type="video/webm">') && !h.includes('javascript:1') && !h.includes('blob:') && h.includes('<audio controls preload="none" src="https://cdn.example.com/a.mp3">'), 'videos and audio keep absolute addresses and controls; a blob: or javascript: one is dropped');
ok(c.pictures.includes('https://news.example.com/v/a.jpg'), 'a video’s poster is a picture');
ok(c.videos.map((v) => v.watch).join() === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ,https://vimeo.com/123456' && h.includes('class="n-video" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"') && h.includes('data-video="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'), 'a YouTube or Vimeo video is the still the app plays over the page, linking to the video');
ok(h.includes('<iframe src="https://www.loom.com/embed/abc123"') && h.includes('Open the video on loom.com') && !h.includes('evil.example.com'), 'a player of another known host is framed, with a link to open it; a frame of any other site is dropped');
ok(h.includes('<div class="n-scroll"><table>') && h.includes('<th colspan="2">H</th>') && !h.includes('onclick'), 'a table keeps its spans in a scrolling box');
ok(h.includes('<pre><code>let a = 1 &lt; 2;\nfoo()</code></pre>') && h.includes('<blockquote><p>Quote</p></blockquote>') && h.includes('<li>one</li>') && h.includes('<hr>') && h.includes('<br>') && !/<p>\s*<\/p>/.test(h), 'code keeps its lines, quotes, lists, rules and breaks stay, an empty paragraph goes');
ok(cleanReaderHtml('<p>x\u0001P0\u0002 \u0000y</p>', BASE).html === '<p>x P0 y</p>' || !cleanReaderHtml('<p>x\u0001P0\u0002y</p>', BASE).html.includes('\u0001'), 'a page cannot write the marks pictures are numbered by');

// ---- the page ---------------------------------------------------------------------------------------------------
ok(dayOf('2026-11-02T15:00:00Z') === '2026-11-02' && dayOf('') === '' && dayOf('some day') === 'some day', 'a published date is a day');
const page = readerPage({ title: 'A <b>title</b>', byline: 'By Ada', site: 'News', published: '2026-11-02T10:00:00Z', url: 'https://news.example.com/s?pw=secret&b=1#top', at: Date.UTC(2026, 10, 18), selected: 'one\ntwo', body: '<p>Body</p>', lang: 'el' });
ok(page.startsWith('<!doctype html>') && page.includes('<html lang="el">') && page.includes('<body class="n-page">') && page.includes('<h1>A &lt;b&gt;title&lt;/b&gt;</h1>'), 'it is a page of the kit’s look, its title escaped');
ok(page.includes('<p class="rd-meta">By Ada · News · 2026-11-02</p>') && page.includes('Saved from <a href="https://news.example.com/s?pw=secret&amp;b=1"') && page.includes('pw=hidden') && page.includes('on 2026-11-18'), 'a line of who, where and when; where it was saved from (a secret in the address hidden in its words) and when');
ok(page.indexOf('What you selected') > page.indexOf('rd-saved') && page.indexOf('What you selected') < page.indexOf('<p>Body</p>') && page.includes('<p>one</p><p>two</p>'), 'what was selected is quoted above the article');
ok(/max-width:720px/.test(page) && /line-height:1\.7/.test(page) && /figcaption\{[^}]*var\(--n-muted\)/.test(page), 'a column of 720 px, with room between lines, figures in the middle and quiet captions');
ok(!readerPage({ title: 'T', url: 'https://x.com/', body: '', lang: '"><script>' }).includes('<script') && !readerPage({ title: 'T', url: 'https://x.com/', body: '' }).includes('What you selected') && !readerPage({ title: 'T', url: 'https://x.com/', body: '' }).includes('class="rd-meta"'), 'a language that is no language is English; no selection, no quote; nobody’s name, no line of it');
ok(articleTitle('The Story | News', 'News') === 'The Story' && articleTitle('News - News', 'News') === 'News' && articleTitle('A (b) – c.d', 'c.d') === 'A (b)' && articleTitle('Story', '') === 'Story', 'a title loses its site’s name at the end');
ok(isArticle({ content: '<p>x</p>', length: 900 }) && !isArticle({ content: '<p>x</p>', length: 20 }) && !isArticle(null), 'a page with a few words is no article');

// ---- kept pictures: addresses that are their own permission ---------------------------------------------------------
const sha = '0123456789abcdef0123456789abcdef01234567';
const addr = pictureAddress(sha);
ok(/^\/pg\/pic\/[a-f0-9]{40}\/[\w-]{32}$/.test(addr) && pictureAddressOk(sha, addr.split('/').pop()!) && !pictureAddressOk(sha, 'x'.repeat(32)) && !pictureAddressOk(sha, 'short'), 'a picture’s address is signed by the server');
ok(pagePictureSources(`<img src="${addr}"><img src="/pg/pic/${sha}/${'0'.repeat(32)}">`).join() === `naget-asset:${sha}`, 'a page keeps the pictures it shows at their signed addresses (and only those)');

// ---- keeping them ------------------------------------------------------------------------------------------------
const hits: string[] = [];
const server = http.createServer((req, res) => {
  hits.push(req.url ?? '');
  if (req.url?.startsWith('/ok')) return void res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.concat([PNG, Buffer.from(req.url)]));
  if (req.url === '/missing.png') return void res.writeHead(404).end('no');
  if (req.url === '/notpic.png') return void res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from('this is not a picture'));
  if (req.url === '/big.png') return void res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.concat([PNG, Buffer.alloc(PICTURE_LIMITS.each + 10)]));
  if (req.url === '/art') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<p>x</p>');
  res.writeHead(404).end();
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const urls = [`${origin}/ok1.png`, `${origin}/missing.png`, `${origin}/notpic.png`, `${origin}/big.png`, `${origin}/ok2.png`];
const got = await keepPictures(db, urls, `${origin}/art`);
ok(got.size === 2 && got.has(urls[0]) && got.has(urls[4]), 'the pictures a site gives are kept; one it refuses, one that is no picture and one over 8 MB stay on the web');
const many = Array.from({ length: PICTURE_LIMITS.count + 10 }, (_, i) => `${origin}/ok-many-${i}.png`);
hits.length = 0;
const kept = await keepPictures(db, many, `${origin}/art`);
ok(kept.size === PICTURE_LIMITS.count && hits.length === PICTURE_LIMITS.count, `at most ${PICTURE_LIMITS.count} pictures are fetched`);
const priv = await keepPictures(db, [`${origin}/ok-other.png`], 'https://elsewhere.example.com/art');
ok(priv.size === 0, 'a public page’s picture at an address on this computer’s network is not fetched');
const total = await keepPictures(db, urls.slice(0, 1), `${origin}/art`, {
  fetch: (async () => ({ status: 200, contentType: 'image/png', text: '', body: PNG, url: '' })) as never,
});
ok(total.size === 1, 'the fetch can be given');

// ---- the page of the Library ---------------------------------------------------------------------------------------
const lab = createSpace(db, { name: 'Lab', folder: tmp });
const shelf = makeFolder(db, { name: 'Reading', parent: null, space: lab.id });
const article = {
  title: 'The Story | News',
  byline: 'By Ada Lovelace',
  siteName: 'News',
  publishedTime: '2026-11-02T10:00:00Z',
  lang: 'en',
  length: 2000,
  content: `<div><h2>First</h2><p>Words words words.</p><figure><img src="/ok-a.png" alt="A"><figcaption>Cap</figcaption></figure><img src="/missing.png" alt="gone"><script>alert(1)</script></div>`,
};
const saved = await saveReaderPage(deps, { raw: article, title: 'tab title', url: `${origin}/art?x=1#top`, selected: 'Words', space: lab.id, folder: shelf.id });
ok(!saved.kind && saved.title === 'The Story' && saved.space === lab.id && saved.folder === shelf.id, 'a page of HTML in the project and folder asked for, titled by the article’s, without its site’s name');
ok(saved.source?.url === `${origin}/art?x=1` && saved.source?.site === '127.0.0.1', 'it keeps the address it came from and its site: it is a Web page');
const html = pageSource(db, saved.id)!.text;
const pic = /src="(\/pg\/pic\/[a-f0-9]{40}\/[\w-]{32})"/.exec(html)?.[1];
ok(!!pic && html.includes(`src="${origin}/missing.png"`) && !html.includes('<script'), 'the pictures are kept at their own addresses; one that could not be had shows from the web; no script');
ok(html.length < 8000, 'the page holds addresses, not pictures');
const served = await app.inject({ method: 'GET', url: pic! });
ok(served.statusCode === 200 && served.headers['content-type'] === 'image/png' && served.rawPayload.subarray(0, 8).equals(PNG.subarray(0, 8)), 'the picture is served at its address with no sign-in');
ok((await app.inject({ method: 'GET', url: pic!.replace(/\/[\w-]{32}$/, `/${'a'.repeat(32)}`) })).statusCode === 404, 'with a wrong signature it is not');
const inside = picturesInside(db, html);
ok(inside.includes('src="data:image/png;base64,') && !inside.includes('/pg/pic/') && picturesInside(db, html, { max: 0, base: 'https://x.example' }).includes('https://x.example/pg/pic/'), 'a copy taken away carries the pictures inside it; or the server’s address for them');
ok(told.some((m) => (m as { data?: { what?: string } }).data?.what === 'pages'), 'the Library is told');
const listed = (await app.inject({ method: 'GET', url: '/api/pages' })).json().pages.find((p: { id: string }) => p.id === saved.id);
ok(listed?.source?.site === '127.0.0.1' && !listed.kind, 'the Library’s list has the source of a page that is not a document');
const refs = db.prepare('select count(*) as n from page_asset_refs where page_id = ?').get(saved.id) as { n: number };
ok(refs.n === 1, 'the version that shows a picture keeps it');
const exported = await app.inject({ method: 'GET', url: `/api/pages/${saved.id}/export?format=html`, headers: { host: 'app.test' } });
ok(exported.statusCode === 200 && /data:image\/png;base64,/.test(exported.body) && !exported.body.includes('/pg/pic/'), 'saved as a web page file, its pictures go inside it');

let refused = '';
try {
  await saveReaderPage(deps, { raw: article, title: 'X', url: 'https://x.com/', space: 'nope' });
} catch (e) {
  refused = (e as Error).message;
}
ok(/project/.test(refused), 'a project that is not there is refused');

server.close();
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
