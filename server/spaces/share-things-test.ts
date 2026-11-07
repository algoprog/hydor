// Script tests for sharing one thing of the Library alone (a document, slides, a spreadsheet, a page, a design, a
// picture, a video, a sound) with a person by their own link: making and listing links per thing (not a project's), a
// link opening that thing and nothing else, links of a deleted thing stopping; comments through the link on a slide, a
// sheet's cell, a page's words, a spot of a picture and a moment of a video, under the person's name, the owner told
// and an inbox line until it is answered; Edit saving a page (its code and the web addresses it fetches unchanged),
// slides (nobody else's comments changed), a picture (the one before kept as a version, brought back), a video and a
// sound (from the item and the person's uploads only, saved over the item alone); comments on the Library's media by
// the owner and by agents; and what counts as a page's code.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/spaces/share-things-test.ts
//   DATA_DIR=/tmp/hydor-test-share-things node dist/dev/share-things-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { MediaComment } from '../../shared/media-comments.ts';
import type { MediaItem, MediaVersion } from '../../shared/media.ts';
import type { PortalItemView, PortalMediaView, PortalView, ProjectShare } from '../../shared/share.ts';
import { designHead } from '../../shared/design.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { internalHeaders } from '../internal.ts';
import { hasFfmpeg } from '../media/frames.ts';
import { media } from '../media/index.ts';
import { addMedia, getMedia } from '../media/store.ts';
import { codeOf, sameCode, webAddressesOf } from '../pages/html-code.ts';
import { pages } from '../pages/index.ts';
import { createPage, pageComments, pageInfo, pageModel, pageSource } from '../pages/store.ts';
import { createSpace } from './index.ts';
import { sharing, shareInbox } from './share.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-share-things-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));

const notices: { title: string; body: string; url: string }[] = [];
const events: { t: string; id?: string; data?: any }[] = [];
const deps = {
  app,
  db,
  sessions: {
    summary: () => null,
    timeline: async () => ({ parser: { items: [] } }),
    emit: (e: string, n: any) => e === 'notify' && notices.push(n),
    deliverOrQueue: async () => {},
    adapterByRun: () => null,
  },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (e: any) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
media.routes!(deps);
sharing.routes!(deps);
await app.ready();

// ---- a small test runner ------------------------------------------------------------------------------------------------
let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const J = (x: unknown) => JSON.stringify(x);
const HOST = 'app.test';
const req = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: HOST, ...headers } });
const until = async (cond: () => boolean | Promise<boolean>, ms = 90_000) => {
  const end = Date.now() + ms;
  while (!(await cond()) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return cond();
};

// ---- what counts as a page's code -------------------------------------------------------------------------------------------
{
  const page = '<!doctype html><html><head><style>h1{color:red}</style></head><body><h1>Hi</h1><button onclick="go()">Go</button><script>function go(){}</script></body></html>';
  const same = (a: string, b: string) => sameCode(codeOf(a), codeOf(b));
  ok(same(page, page.replace('Hi', 'Hello').replace('color:red', 'color:blue')), 'words and look are not code');
  ok(same(page, page.replace('<button onclick="go()">Go</button>', '<button  onclick=\'go()\' >Go</button>')), 'how the attributes are written does not matter');
  ok(same(page, page.replace('<h1>Hi</h1>', '<h1>Hi</h1><p>More <a href="https://example.com">words</a></p>')), 'a new link to the web is not code');
  ok(!same(page, page.replace('</body>', '<script>alert(1)</script></body>')), 'a new script is');
  ok(!same(page, page.replace('function go(){}', 'function go(){fetch("//x")}')), 'a script changed is');
  ok(!same(page, page.replace('go()', 'steal()')), 'a handler changed is');
  ok(!same(page, page.replace('<h1>', '<h1 onmouseover="x()">')), 'a new handler is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<img src="x"onerror="alert(1)">')), 'a handler right after a quote, without a space, is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<img src=x/onerror=1 onerror=alert(1)>')), 'one among odd attributes is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<a href="&#106;avascript&colon;alert(1)">x</a>')), 'a javascript: address written with character references is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<a href="java\tscript:alert(1)">x</a>')), 'one with a tab inside it is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<svg><style><img src=x onerror=alert(1)></style></svg>')), 'a tag breaking out of an SVG style is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<template><img src=x onerror=alert(1)></template>')), 'a handler inside a template is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<iframe src="https://example.com"></iframe>')), 'a frame is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<meta http-equiv="refresh" content="0;url=https://evil.example">')), 'a refresh is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<form action="https://evil.example"><input name=p></form>')), 'a form sent elsewhere is');
  ok(!same(page, page.replace('<h1>Hi</h1>', '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>')), 'an animation that changes an address is');
  ok(same(page, page.replace('<h1>Hi</h1>', '<!-- <script>alert(1)</script> --><h1>Hi</h1>')), 'a comment runs nothing');
  const web = (h: string) => webAddressesOf(h);
  ok(J(web(page)) === '[]', 'no web addresses');
  ok(J(web('<img src="https://cdn.example/a.png"><a href="https://example.com">x</a>')) === '["https://cdn.example/a.png"]', 'a picture’s address, not a link’s');
  ok(web('<div style="background:url(//evil.example/t.gif)"></div>').length === 1, 'an address in a style');
  ok(web('<style>@import "https://evil.example/x.css";</style>').length === 1, 'an @import');
  ok(web('<img srcset="a.png 1x, https://evil.example/b.png 2x">').length === 1, 'one of a srcset');
  ok(web('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">').length === 0, 'Google’s fonts are not new');
  ok(web('<img src="naget-asset:abc"><img src="data:image/png;base64,AA">').length === 0, 'the app’s own pictures and data are not web addresses');
}

// ---- things to share ------------------------------------------------------------------------------------------------------
const thesis = createSpace(db, { name: 'Thesis', folder: tmp });
const chapter = createPage(db, { title: 'Chapter 3', kind: 'doc', model: { markdown: '# Results\n\nDense retrieval beats BM25.' }, by: 'agent', space: thesis.id });
const other = createPage(db, { title: 'Other notes', kind: 'doc', model: { markdown: 'Private' }, by: 'agent', space: thesis.id });
const deck = createPage(db, {
  title: 'Talk',
  kind: 'slides',
  model: {
    slides: [
      { layout: 'title', title: 'Dense retrieval', subtitle: 'A talk' },
      { layout: 'content', title: 'Results', bullets: ['It works', 'It is fast'], comments: [{ id: 'cown1', by: 'user', text: 'Add a chart here', at: 1 }] },
    ],
  },
  by: 'agent',
});
const book = createPage(db, { title: 'Budget', kind: 'sheet', model: { sheets: [{ name: 'Costs', cells: { A1: 'Item', B1: 'Cost', A2: 'GPU hours', B2: 120 } }, { name: 'Notes', cells: { A1: 'x' } }] }, by: 'agent' });
const tracker = createPage(db, {
  title: 'Reading tracker',
  html: '<!doctype html><html><head><title>Tracker</title></head><body><h1>Papers I read</h1><p>Twelve this month, mostly about retrieval.</p><button onclick="add()">Add</button><script>function add(){}</script></body></html>',
  by: 'agent',
});
const designHtml = `<!doctype html><html><head>${designHead()}<link id="n-fonts" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap"></head><body class="n-design-page"><main class="n-design"><section class="n-artboard" data-w="1080" data-h="1080" style="width:1080px;height:1080px;background:#fff"><div class="n-el n-text" style="left:80px;top:96px;width:920px">Summer sale</div></section></main></body></html>`;
const poster = createPage(db, { title: 'Poster', html: designHtml, by: 'agent' });
const notebook = createPage(db, { title: 'Analysis', kind: 'notebook', model: { nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [{ cell_type: 'code', execution_count: null, id: 'a1', metadata: {}, outputs: [], source: 'print(1)' }] }, by: 'agent' });
const screen = createPage(db, { title: 'An app’s screen', html: '<!doctype html><p>x</p>', by: 'agent', app: 'someapp' });

const ff = await hasFfmpeg();
const mk = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const pngFile = path.join(tmp, 'photo.png');
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
if (ff) mk(['-f', 'lavfi', '-i', 'testsrc2=size=320x240', '-frames:v', '1', pngFile]);
else fs.writeFileSync(pngFile, tinyPng);
const keep = async (file: string, kind: MediaItem['kind'], mime: string, title: string) => addMedia(db, { kind, from: file, ext: path.extname(file).slice(1), mime, bytes: fs.statSync(file).size, title });
const photo = await keep(pngFile, 'image', 'image/png', 'Sunset');
const otherPhoto = await keep(pngFile, 'image', 'image/png', 'Not shared');

// ---- links to one thing -------------------------------------------------------------------------------------------------------
let r = await req('POST', `/api/pages/${chapter.id}/shares`, { name: 'Maria Lopez', role: 'comment', days: 7 });
ok(r.statusCode === 200, `a document shared alone: ${r.body}`);
const maria = r.json() as { share: ProjectShare; token: string };
ok(maria.share.item?.kind === 'page' && maria.share.item.id === chapter.id && maria.share.space === '', 'the share says what it is for: the page, not a project');
ok((await req('POST', `/api/pages/${screen.id}/shares`, { name: 'X' })).statusCode === 404, 'not an app’s screen');
ok((await req('POST', `/api/pages/0000000000/shares`, { name: 'X' })).statusCode === 404, 'not a page there is not');
ok((await req('POST', `/api/media/0000000000/shares`, { name: 'X' })).statusCode === 404, 'not a picture there is not');
const projectList = (await req('GET', `/api/projects/${thesis.id}/shares`)).json() as { shares: ProjectShare[] };
ok(projectList.shares.length === 0, 'a thing’s link is not one of its project’s');
const pageList = (await req('GET', `/api/pages/${chapter.id}/shares`)).json() as { shares: ProjectShare[]; owner: string };
ok(pageList.shares.length === 1 && pageList.shares[0].name === 'Maria Lopez' && pageList.owner === 'Owner', 'the thing’s own list');
ok((await req('GET', `/api/pages/${other.id}/shares`)).json().shares.length === 0, 'and only its own');

const M = `/p-api/${maria.token}`;
r = await req('GET', `${M}?visit=1`);
const view = r.json() as PortalView;
ok(r.statusCode === 200 && !view.project && view.thing?.kind === 'page' && view.thing.id === chapter.id && view.thing.title === 'Chapter 3', `it opens the thing alone: ${J(view.thing)}`);
ok(view.items.length === 1 && view.items[0].id === chapter.id && view.sessions.length === 0 && view.runs.length === 0 && view.reading.length === 0 && view.media.length === 0, 'and nothing else of the project');
ok((await req('GET', `${M}/items/${other.id}`)).statusCode === 404, 'not another document of its project');
ok((await req('GET', `${M}/media/${photo.id}`)).statusCode === 404, 'not a picture');
ok((await req('GET', `${M}/sessions/claude:s1`)).statusCode === 404, 'not a session');
r = await req('GET', `${M}/items/${chapter.id}`);
ok(r.statusCode === 200 && (r.json() as PortalItemView).html?.includes('Dense retrieval beats BM25'), 'its own page to read');
r = await req('POST', `${M}/items/${chapter.id}/comments`, { text: 'Which datasets?', quote: 'beats BM25' });
ok(r.statusCode === 200 && (pageModel(db, chapter.id) as { comments: { by: string; name: string }[] }).comments[0].name === 'Maria Lopez', `a comment on its words, under her name: ${r.body}`);
ok(shareInbox(db).some((x) => x.title === 'Maria Lopez commented on “Chapter 3”' && x.path === `/pages/${chapter.id}`), 'an inbox line for the owner');
ok((await req('POST', `${M}/items/${chapter.id}/versions`, { model: pageModel(db, chapter.id), base: pageInfo(db, chapter.id)!.version })).statusCode === 403, 'View and comment does not save');
const things = (await req('GET', '/api/shares')).json() as { things: { kind: string; id: string; people: number }[] };
ok(things.things.some((t) => t.kind === 'page' && t.id === chapter.id && t.people === 1), `every thing shared, with how many people: ${J(things)}`);

// ---- comments on slides, a spreadsheet's cell and a page's words ------------------------------------------------------------
r = await req('POST', `/api/pages/${deck.id}/shares`, { name: 'Nikos', role: 'comment' });
const N = `/p-api/${(r.json() as { token: string }).token}`;
let it = (await req('GET', `${N}/items/${deck.id}`)).json() as PortalItemView;
ok(J(it.slides) === J(['Dense retrieval', 'Results']), `where a comment can go: the slides by their titles (${J(it.slides)})`);
ok(it.comments?.length === 1 && it.comments[0].slide === 2 && it.comments[0].name === 'Owner' && it.comments[0].by === 'person', 'the owner’s comment, on its slide, under the owner’s name');
r = await req('POST', `${N}/items/${deck.id}/comments`, { text: 'Too many words', slide: 2 });
let d = pageModel(db, deck.id) as { slides: { comments?: { by: string; name?: string; who?: string; text: string }[] }[] };
ok(r.statusCode === 200 && d.slides[1].comments?.some((c) => c.by === 'person' && c.name === 'Nikos' && c.text === 'Too many words'), `a comment on slide 2, under his name: ${r.body}`);
ok((await req('POST', `${N}/items/${deck.id}/comments`, { text: 'x', slide: 9 })).statusCode === 400, 'not on a slide there is not');
ok((await req('POST', `${N}/items/${deck.id}/comments`, { id: 'cown1', reply: 'I agree' })).statusCode === 200, 'a reply to the owner’s comment');
ok((await req('POST', `${N}/items/${deck.id}/comments`, { id: 'cown1', text: 'Remove this slide' })).statusCode === 403, 'but not changing its words');
ok((await req('POST', `${N}/items/${deck.id}/comments`, { id: 'cown1', delete: true })).statusCode === 403, 'nor deleting it');
ok(notices.some((n) => n.title === 'Talk' && /^Nikos replied/.test(n.body)), 'the owner is told of the reply');

r = await req('POST', `/api/pages/${book.id}/shares`, { name: 'Eleni', role: 'comment' });
const E = `/p-api/${(r.json() as { token: string }).token}`;
it = (await req('GET', `${E}/items/${book.id}`)).json() as PortalItemView;
ok(it.sheets?.length === 2 && it.sheets[1].name === 'Notes', 'where a comment can go: the sheets');
ok((await req('POST', `${E}/items/${book.id}/comments`, { text: 'Is this per month?', cell: '$b$2' })).statusCode === 200, 'a comment on a cell');
ok((await req('POST', `${E}/items/${book.id}/comments`, { text: 'And this?', sheet: 'Notes', cell: 'A1' })).statusCode === 200, 'on a cell of another sheet');
ok((await req('POST', `${E}/items/${book.id}/comments`, { text: 'Also tax', cell: 'B2' })).statusCode === 200, 'a second one on the same cell');
ok((await req('POST', `${E}/items/${book.id}/comments`, { text: 'x', cell: 'not a cell' })).statusCode === 400, 'not on something that is not a cell');
const wb = pageModel(db, book.id) as { sheets: { name: string; comments?: { cell: string; by: string; name?: string; replies?: { by: string; name?: string; text: string }[] }[] }[] };
const b2 = wb.sheets[0].comments?.find((c) => c.cell === 'B2');
ok(b2?.name === 'Eleni' && b2.replies?.[0]?.name === 'Eleni' && b2.replies[0].text === 'Also tax', `the second joins the first as her reply, still hers: ${J(b2)}`);
ok(wb.sheets[1].comments?.[0]?.cell === 'A1', 'the other sheet’s');
it = (await req('GET', `${E}/items/${book.id}`)).json() as PortalItemView;
ok(it.comments?.some((c) => c.sheet === 'Costs' && c.cell === 'B2') && it.comments?.some((c) => c.sheet === 'Notes' && c.cell === 'A1'), 'listed with their sheets and cells');

r = await req('POST', `/api/pages/${tracker.id}/shares`, { name: 'Sam', role: 'comment' });
const S = `/p-api/${(r.json() as { token: string }).token}`;
r = await req('POST', `${S}/items/${tracker.id}/comments`, { text: 'Which ones?', quote: 'Twelve this  month' });
let pc = pageComments(db, tracker.id);
ok(r.statusCode === 200 && pc.length === 1 && pc[0].by === 'person' && pc[0].name === 'Sam' && pc[0].on?.words === 'Twelve this month', `a comment on a page’s words, kept apart from it: ${J(pc)}`);
ok(pageInfo(db, tracker.id)!.version === 1, 'no new version of the page for it');
ok((await req('POST', `${S}/items/${tracker.id}/comments`, { text: 'x', quote: 'words that are not there' })).statusCode === 400, 'not on words that are not there');
ok((await req('POST', `${S}/items/${tracker.id}/comments`, { text: 'x', quote: 'function add' })).statusCode === 400, 'not on a script’s words');
r = await req('POST', `/api/pages/${tracker.id}/comments`, { ops: [{ id: pc[0].id, reply: 'All on retrieval' }] });
ok(r.statusCode === 200, 'the owner answers it');
ok(!shareInbox(db).some((x) => x.title === 'Sam commented on “Reading tracker”'), 'answered, its inbox line goes');
ok((await req('POST', `${S}/items/${tracker.id}/comments`, { id: pc[0].id, delete: true })).statusCode === 200, 'their own is theirs to delete');
it = (await req('GET', `${S}/items/${tracker.id}`)).json() as PortalItemView;
ok(!it.editable && it.comments?.length === 0, 'View and comment reads it');

// Notebooks are to read: no comments.
r = await req('POST', `/api/pages/${notebook.id}/shares`, { name: 'Sam', role: 'edit' });
const NB = `/p-api/${(r.json() as { token: string }).token}`;
it = (await req('GET', `${NB}/items/${notebook.id}`)).json() as PortalItemView;
ok(!it.editable && it.comments === undefined, 'a notebook opens to read, without comments');
ok((await req('POST', `${NB}/items/${notebook.id}/comments`, { text: 'x' })).statusCode === 400, 'and takes none');

// ---- Edit: a page of HTML, a design, slides -----------------------------------------------------------------------------------
r = await req('POST', `/api/pages/${tracker.id}/shares`, { name: 'Ana', role: 'edit' });
const A = `/p-api/${(r.json() as { token: string }).token}`;
it = (await req('GET', `${A}/items/${tracker.id}`)).json() as PortalItemView;
ok(it.editable && it.html?.includes('<script>function add(){}</script>'), 'Edit opens a page’s HTML to edit');
const html0 = pageSource(db, tracker.id)!.text;
const v1 = pageInfo(db, tracker.id)!.version;
const save = (html: string, base = pageInfo(db, tracker.id)!.version) => req('POST', `${A}/items/${tracker.id}/versions`, { html, base });
r = await save(html0.replace('Papers I read', 'Papers we read'));
ok(r.statusCode === 200 && pageInfo(db, tracker.id)!.version === v1 + 1 && pageInfo(db, tracker.id)!.who === 'Ana', `its words changed, a version under her name: ${r.body}`);
const html1 = pageSource(db, tracker.id)!.text;
ok((await save(html1.replace('</body>', '<script>fetch("//evil.example")</script></body>'))).statusCode === 400, 'not a new script');
ok((await save(html1.replace('function add(){}', 'function add(){alert(1)}'))).statusCode === 400, 'not its script changed');
ok((await save(html1.replace('<h1>', '<h1 onclick="x()">'))).statusCode === 400, 'not a new handler');
ok((await save(html1.replace('<h1>', '<img src="https://evil.example/t.gif"><h1>'))).statusCode === 400, 'not a picture from the web');
ok((await save(html1.replace('mostly about retrieval.', 'mostly about <a href="https://arxiv.org">retrieval</a>.'))).statusCode === 200, 'a link to the web, yes');
ok((await save(html1, v1)).statusCode === 409, 'a newer version is there: asked about');
ok((await req('POST', `${A}/items/${tracker.id}/versions`, { model: {} })).statusCode === 400, 'a page is saved as HTML');

r = await req('POST', `/api/pages/${poster.id}/shares`, { name: 'Ana', role: 'edit' });
const AP = `/p-api/${(r.json() as { token: string }).token}`;
const posterHtml = pageSource(db, poster.id)!.text;
r = await req('POST', `${AP}/items/${poster.id}/versions`, {
  html: posterHtml.replace('Summer sale', 'Winter sale').replace('family=Inter&', 'family=Inter&family=Anton&'),
  base: pageInfo(db, poster.id)!.version,
});
ok(r.statusCode === 200 && pageSource(db, poster.id)!.text.includes('Winter sale') && pageSource(db, poster.id)!.text.includes('n-design-fit'), `a design’s words and fonts changed, its fitting script the app’s own: ${r.body}`);
const tampered = pageSource(db, poster.id)!.text.replace(/<script id="n-design-fit">/, '<script id="n-design-fit">alert(1);');
r = await req('POST', `${AP}/items/${poster.id}/versions`, { html: tampered, base: pageInfo(db, poster.id)!.version });
ok(r.statusCode === 200 && !pageSource(db, poster.id)!.text.includes('alert(1)'), 'its fitting script changed comes back as the app’s');

r = await req('POST', `/api/pages/${deck.id}/shares`, { name: 'Ana', role: 'edit' });
const AD = `/p-api/${(r.json() as { token: string }).token}`;
it = (await req('GET', `${AD}/items/${deck.id}`)).json() as PortalItemView;
const m0 = it.model as { slides: { comments?: { id: string; by: string; name?: string; text: string }[] }[] };
ok(it.editable && m0.slides[1].comments?.find((c) => c.id === 'cown1')?.name === 'Owner', 'Edit opens the slides, the owner’s comments under the owner’s name');
// Her save: the owner's comment's words changed, Nikos's taken out, one of her own added.
const forged = JSON.parse(JSON.stringify(m0)) as typeof m0;
forged.slides[1].comments = [{ ...forged.slides[1].comments!.find((c) => c.id === 'cown1')!, text: 'Delete everything' }, { id: 'cana1', by: 'user', text: 'New chart?', at: 5 } as never];
r = await req('POST', `${AD}/items/${deck.id}/versions`, { model: forged, base: it.page.version });
d = pageModel(db, deck.id) as typeof d;
const cs = d.slides[1].comments ?? [];
ok(r.statusCode === 200 && cs.find((c) => (c as { id?: string }).id === 'cown1')?.text === 'Add a chart here', `nobody else’s words change: ${J(cs)}`);
ok(cs.some((c) => c.text === 'Too many words' && c.name === 'Nikos'), 'nor do they go');
ok(cs.some((c) => c.text === 'New chart?' && c.by === 'person' && c.name === 'Ana'), 'hers is under her name, whatever she said it was');

// ---- a picture: comments on a spot, Edit saving over it, its earlier version kept ---------------------------------------------
r = await req('POST', `/api/media/${photo.id}/shares`, { name: 'Pat', role: 'comment' });
ok(r.statusCode === 200 && (r.json() as { share: ProjectShare }).share.item?.kind === 'media', 'a picture shared alone');
const P1 = `/p-api/${(r.json() as { token: string }).token}`;
const pv = (await req('GET', `${P1}?visit=1`)).json() as PortalView;
ok(pv.thing?.kind === 'media' && pv.media.length === 1 && pv.media[0].id === photo.id && pv.items.length === 0, 'its link opens the picture');
ok(!J(pv).includes(MEDIA_DIR_HINT()) && !('file' in pv.media[0]), 'never where its file is');
let mv = (await req('GET', `${P1}/media/${photo.id}`)).json() as PortalMediaView;
ok(!mv.editable && mv.comments.length === 0, 'View and comment: no editor');
ok((await req('GET', `${P1}/media/${otherPhoto.id}`)).statusCode === 404, 'not another picture');
ok((await req('GET', `${P1}/media/${otherPhoto.id}/file`)).statusCode === 404, 'nor its file');
r = await req('GET', `${P1}/media/${photo.id}/file`);
ok(r.statusCode === 200 && r.rawPayload.length === fs.statSync(pngFile).size, 'its file');
r = await req('POST', `${P1}/media/${photo.id}/comments`, { ops: [{ text: 'Crop the left', x: 0.25, y: 0.5 }] });
mv = { ...mv, comments: (r.json() as { comments: MediaComment[] }).comments };
ok(r.statusCode === 200 && mv.comments[0].x === 0.25 && mv.comments[0].y === 0.5 && mv.comments[0].name === 'Pat', `a comment on a spot, under their name: ${r.body}`);
ok(shareInbox(db).some((x) => x.title === 'Pat commented on “Sunset”' && x.path === `/media/${photo.id}`), 'an inbox line, to the picture');
ok(notices.some((n) => n.url === `/media/${photo.id}` && /^Pat commented/.test(n.body)), 'the owner is told');
// The owner answers on the picture's page; an agent through the API.
r = await req('POST', `/api/media/${photo.id}/comments`, { ops: [{ id: mv.comments[0].id, reply: 'Done' }, { text: 'Brighter too?', x: 0.9, y: 0.1 }] });
const owned = (r.json() as { comments: MediaComment[] }).comments;
ok(r.statusCode === 200 && owned[0].replies?.[0].by === 'user' && owned[1].by === 'user', 'the owner replies and comments');
ok(!shareInbox(db).some((x) => x.title === 'Pat commented on “Sunset”'), 'answered: the line goes');
r = await req('POST', `/api/media/${photo.id}/comments`, { ops: [{ text: 'I can brighten it' }] }, internalHeaders());
ok((r.json() as { comments: MediaComment[] }).comments.some((c) => c.by === 'agent' && c.text === 'I can brighten it'), 'an agent’s comment is the agent’s');
ok((await req('POST', `${P1}/media/${photo.id}/comments`, { ops: [{ id: owned[1].id, delete: true }] })).statusCode === 403, 'theirs to delete only');
ok((await req('POST', `${P1}/media/${photo.id}/comments`, { ops: [{ id: owned[1].id, resolve: true }] })).statusCode === 200, 'but any to resolve');
ok((await req('POST', `${P1}/mediaedit/image`, { data: `data:image/png;base64,${tinyPng.toString('base64')}`, to: { media: photo.id, as: 'replace' } })).statusCode === 403, 'View and comment does not save it');

r = await req('POST', `/api/media/${photo.id}/shares`, { name: 'Pat', role: 'edit' });
const P2 = `/p-api/${(r.json() as { token: string }).token}`;
mv = (await req('GET', `${P2}/media/${photo.id}`)).json() as PortalMediaView;
ok(mv.editable && mv.comments.length === 3, 'Edit: the picture editor opens, with its comments');
ok((await req('POST', `${P2}/mediaedit/image`, { data: `data:image/png;base64,${tinyPng.toString('base64')}`, to: { as: 'copy' } })).statusCode === 403, 'not saved elsewhere');
ok((await req('POST', `${P2}/mediaedit/image`, { data: `data:image/png;base64,${tinyPng.toString('base64')}`, to: { media: otherPhoto.id, as: 'replace' } })).statusCode === 403, 'nor over another picture');
r = await req('POST', `${P2}/mediaedit/image`, { data: `data:image/png;base64,${tinyPng.toString('base64')}`, to: { media: photo.id, as: 'replace' } });
let pm = getMedia(db, photo.id)!;
ok(r.statusCode === 200 && pm.bytes === tinyPng.length && pm.who === 'Pat' && pm.versions === 1 && !J(r.json()).includes(tmp), `saved over it, under their name, the one before kept: ${r.body}`);
const versions = (await req('GET', `/api/media/${photo.id}/versions`)).json() as { versions: MediaVersion[] };
ok(versions.versions.length === 1 && versions.versions[0].bytes === fs.statSync(pngFile).size && !versions.versions[0].who, `its earlier version: ${J(versions)}`);
r = await req('GET', `/api/media/${photo.id}/versions/1/file`);
ok(r.statusCode === 200 && r.rawPayload.length === fs.statSync(pngFile).size, 'to look at');
r = await req('POST', `/api/media/${photo.id}/versions/1/restore`);
pm = getMedia(db, photo.id)!;
ok(r.statusCode === 200 && pm.bytes === fs.statSync(pngFile).size && !pm.who && pm.versions === 1, 'brought back: the one Pat saved kept in its turn');
const after = (await req('GET', `/api/media/${photo.id}/versions`)).json() as { versions: MediaVersion[] };
ok(after.versions[0].who === 'Pat' && after.versions[0].bytes === tinyPng.length, 'kept as Pat’s');
ok((await req('GET', `/api/media/${photo.id}/comments`)).json().comments.length === 3, 'its comments stay through its versions');

// ---- a video and a sound: Edit through the link, from the item and their own uploads only --------------------------------------
if (ff) {
  const clipFile = path.join(tmp, 'clip.mp4');
  mk(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clipFile]);
  const toneFile = path.join(tmp, 'tone.mp3');
  mk(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-c:a', 'libmp3lame', toneFile]);
  const secret = path.join(tmp, 'secret.mp4');
  fs.copyFileSync(clipFile, secret);
  const film = await keep(clipFile, 'video', 'video/mp4', 'Trailer');
  const tone = await keep(toneFile, 'audio', 'audio/mpeg', 'Jingle');

  r = await req('POST', `/api/media/${film.id}/shares`, { name: 'Kim', role: 'comment' });
  const K1 = `/p-api/${(r.json() as { token: string }).token}`;
  r = await req('POST', `${K1}/media/${film.id}/comments`, { ops: [{ text: 'Cut here', t: 1.25 }] });
  ok(r.statusCode === 200 && (r.json() as { comments: MediaComment[] }).comments[0].t === 1.25, 'a comment at a moment of a video');
  ok((await req('GET', `${K1}/mediaedit/video/info?src=${encodeURIComponent(`/api/media/${film.id}/file`)}`)).statusCode === 403, 'View and comment: no editor’s calls');

  r = await req('POST', `/api/media/${film.id}/shares`, { name: 'Kim', role: 'edit' });
  const K = `/p-api/${(r.json() as { token: string }).token}`;
  const own = `/api/media/${film.id}/file?v=1`;
  r = await req('GET', `${K}/mediaedit/video/info?src=${encodeURIComponent(own)}`);
  ok(r.statusCode === 200 && r.json().width === 320, `the editor reads the video: ${r.body}`);
  ok((await req('GET', `${K}/mediaedit/video/info?src=${encodeURIComponent(secret)}`)).statusCode === 403, 'not a file of the owner’s');
  ok((await req('GET', `${K}/mediaedit/video/info?src=${encodeURIComponent(`media:${otherPhoto.id}`)}`)).statusCode === 403, 'nor another item');
  ok((await req('GET', `${K}/mediaedit/video/strip?src=${encodeURIComponent(own)}&n=4&h=48`)).statusCode === 200, 'its frames for the timeline');
  ok((await req('GET', `${K}/mediaedit/video/encoders`)).json().gpu.found === null, 'nothing of the owner’s graphics card');
  // Their own sound, uploaded: theirs to use.
  r = await app.inject({ method: 'POST', url: `${K}/mediaedit/video/sound`, payload: fs.readFileSync(toneFile), headers: { 'content-type': 'application/octet-stream', host: HOST } });
  const music = r.json() as { src: string };
  ok(r.statusCode === 200 && /^naget-sound:/.test(music.src), `their own sound kept: ${r.body}`);
  ok((await req('GET', `${K}/mediaedit/video/sound/${music.src.slice('naget-sound:'.length)}`)).statusCode === 200, 'and played back to them');
  ok((await req('GET', `${K1}/mediaedit/video/sound/${music.src.slice('naget-sound:'.length)}`)).statusCode === 404, 'to no one else');
  const make = (b: Record<string, unknown>) => req('POST', `${K}/mediaedit/video`, { src: own, encoder: 'auto', to: { media: film.id, as: 'replace' }, ...b });
  ok((await make({ recipe: { clips: [{ trim: [0, 1] }, { src: secret }] } })).statusCode === 403, 'an edit reading a file of the owner’s is refused');
  ok((await make({ recipe: { clips: [{ trim: [0, 1] }] }, to: { as: 'copy' } })).statusCode === 403, 'one going elsewhere too');
  ok((await make({ recipe: { clips: [{ trim: [0, 1] }] }, frame: 0.5 })).statusCode === 403, 'and a frame of it');
  r = await make({ recipe: { clips: [{ trim: [0, 1] }], audio: [{ src: music.src, track: 'music', volume: 0.5 }] } });
  ok(r.statusCode === 200, `made over it, with their sound: ${r.body}`);
  const job = (r.json() as { job: string }).job;
  ok((await req('GET', `${K1}/mediaedit/video/${job}`)).statusCode === 404, 'their edit is theirs to follow');
  let j: any;
  await until(async () => ['done', 'failed', 'stopped'].includes((j = (await req('GET', `${K}/mediaedit/video/${job}`)).json()).status));
  const filmNow = getMedia(db, film.id)!;
  ok(j.status === 'done' && j.made?.gpu === false && filmNow.who === 'Kim' && filmNow.versions === 1 && Math.abs((filmNow.duration ?? 0) - 1) < 0.15, `saved over the video on the processor, the one before kept: ${J(j)} ${J(filmNow)}`);

  r = await req('POST', `/api/media/${tone.id}/shares`, { name: 'Kim', role: 'edit' });
  const T = `/p-api/${(r.json() as { token: string }).token}`;
  const ownTone = `/api/media/${tone.id}/file`;
  r = await req('GET', `${T}/mediaedit/audio/info?src=${encodeURIComponent(ownTone)}`);
  ok(r.statusCode === 200 && Math.abs(r.json().duration - 3) < 0.2, `the sound editor reads the sound: ${r.body}`);
  ok((await req('GET', `${T}/mediaedit/audio/source?src=${encodeURIComponent(toneFile)}`)).statusCode === 403, 'not a file of the owner’s');
  ok((await req('GET', `${T}/mediaedit/video/info?src=${encodeURIComponent(ownTone)}`)).statusCode === 404, 'the video editor’s calls are a video’s');
  const madeSound = (b: Record<string, unknown>) => req('POST', `${T}/mediaedit/audio`, { src: ownTone, to: { media: tone.id, as: 'replace' }, ...b });
  ok((await madeSound({ recipe: { tracks: [{ clips: [{ src: toneFile, at: 0 }] }] } })).statusCode === 403, 'a mix with a file of the owner’s is refused');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

/** Where the Library keeps its files, to see that a link never says it. */
function MEDIA_DIR_HINT() {
  return path.join(process.env.DATA_DIR ?? '', 'media');
}
