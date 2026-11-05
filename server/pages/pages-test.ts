// Script tests for Pages: version history, the storage limits, the signed links (a page's own address,
// private sites), the publish flow (the card's answer, the agent's message) and how pages and sites are
// served (sandbox policy, no cookies, nothing outside the folder); slide decks (save_slides, their checks,
// pictures, versions, their own page), documents (save_doc, Word and Markdown in and out), spreadsheets
// (save_sheet, formulas, Excel and CSV in and out), LaTeX documents
// (save_latex, typeset when TeX is here, kept in its folder), the exports (PowerPoint and Word read back,
// the web page, PDF when a browser is here), and files of the computer's opened in the editors and saved back (a CSV
// to the byte, a Word file with what it loses, a LaTeX project in its folder). Through the routes, with a stand-in
// for the session manager. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/pages-test.ts
//   DATA_DIR=/tmp/hydor-test-pages-unit node dist/dev/pages-test.js
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { notesOf } from '../notes.ts';
import { extractText } from '../documents/extract.ts';
import { canCapture } from '../capture/index.ts';
import { normalizeDeck } from '../../shared/slides.ts';
import { draftsOf, endDrafts, feedDraft, JsonFields } from './drafts.ts';
import { zipParts } from './ooxml.ts';
import { takeEdits } from './edits.ts';
import { pages } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

// ---- a folder to publish, with what must never be served -----------------------------------------
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-pages-test-')));
const dist = path.join(tmp, 'dist');
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head><title>Trail notes</title></head><body><h1>Trail notes</h1></body></html>');
fs.writeFileSync(path.join(dist, 'assets', 'app-3f9a2c1d.css'), 'body{margin:0}');
fs.writeFileSync(path.join(dist, '.env'), 'SECRET=1');
fs.symlinkSync('/etc/hostname', path.join(dist, 'escape.txt'));
fs.mkdirSync(path.join(tmp, '.hidden'));
fs.writeFileSync(path.join(tmp, '.hidden', 'index.html'), 'x');

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
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const sent: { key: string; text: string }[] = [];
const events: { t: string; id?: string; data?: any }[] = [];
const deps = {
  app,
  db,
  sessions: { deliverOrQueue: async (key: string, text: string) => void sent.push({ key, text }) },
  broadcast: (e: { t: string }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const req = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test', ...headers } });
const run = async (name: string, args: Record<string, unknown>): Promise<{ text?: string; error?: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
const idOf = (text?: string) => /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
const requestOf = (text?: string) => /\(request ([a-f0-9]{16})\)/.exec(text ?? '')?.[1] ?? '';
const page = (n: number) => `<!doctype html><html><body><p>version ${n}</p>${'x'.repeat(n)}</body></html>`;
const tick = () => new Promise((r) => setTimeout(r, 10));

// ---- version history -------------------------------------------------------------------------------
{
  const id = idOf((await run('save_page', { title: 'Tracker', html: page(1) })).text);
  ok(id, 'save_page makes a page at version 1');
  ok((await run('save_page', { id, title: 'Tracker 2', html: page(2) })).text?.includes(`(page ${id}, version 2)`), 'save_page with an id adds version 2');
  let info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.page.version === 2 && info.page.title === 'Tracker 2' && info.html.includes('version 2'), 'the newest version is current, with its title');
  ok(info.versions.length === 2 && info.versions[0].by === 'agent', 'both versions are listed, newest first');
  ok((await req('GET', `/api/pages/${id}/versions/1`)).json().html.includes('version 1'), 'an older version can be viewed');
  ok((await req('POST', `/api/pages/${id}/versions/1/restore`)).json().page.version === 3, 'restoring makes a new version');
  info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.html.includes('version 1') && info.versions[0].by === 'restore' && info.versions.length === 3, 'the restored version is current, and nothing was lost');
  await req('PATCH', `/api/pages/${id}`, { title: 'Renamed' });
  info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.page.title === 'Renamed' && info.page.version === 3, 'renaming makes no version');
  for (let i = 4; i <= 45; i++) await run('save_page', { id, title: 'Tracker', html: page(i) });
  info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.versions.length === 40 && info.page.version === 45 && info.versions.at(-1).version === 6, 'at most 40 versions are kept');
  ok((await req('GET', `/api/pages/${id}/versions/1`)).statusCode === 404, 'a version past the limit is gone');
  const big = idOf((await run('save_page', { title: 'Big', html: `<!doctype html>${'y'.repeat(1_900_000)}` })).text);
  for (let i = 0; i < 15; i++) await run('save_page', { id: big, title: 'Big', html: `<!doctype html>${String(i).repeat(1_900_000)}` });
  const bv = (await req('GET', `/api/pages/${big}`)).json().versions as { bytes: number }[];
  ok(bv.length < 16 && bv.reduce((a, v) => a + v.bytes, 0) <= 24 * 1024 * 1024, 'versions are kept within 24 MB');
  ok((await run('save_page', { title: 'Huge', html: 'z'.repeat(2 * 1024 * 1024 + 1) })).error?.includes('over 2 MB'), 'a page over 2 MB is refused');
  ok((await run('save_page', { id: '0000000000', title: 'x', html: page(1) })).error?.includes('No saved page'), 'saving to an unknown id is refused');
  ok((await run('get_page', {})).text?.includes(id), 'get_page lists the pages');
  ok((await run('get_page', { id })).text?.includes('version 45'), 'get_page reads one');
}

// ---- storage limits ---------------------------------------------------------------------------------
const sid = idOf((await run('save_page', { title: 'Store', html: page(1) })).text);
{
  const st = (body: unknown) => req('POST', `/api/pages/${sid}/storage`, body);
  ok((await st({ op: 'get', key: 'none' })).json().value === null, 'a missing key reads as null');
  ok((await st({ op: 'set', key: 'count', value: { n: 3, list: [1, 2] } })).statusCode === 200, 'set keeps a JSON value');
  ok(JSON.stringify((await st({ op: 'get', key: 'count' })).json().value) === '{"n":3,"list":[1,2]}', 'get returns it as kept');
  ok(JSON.stringify((await st({ op: 'keys' })).json().value) === '["count"]', 'keys lists the keys');
  await st({ op: 'remove', key: 'count' });
  ok((await st({ op: 'get', key: 'count' })).json().value === null, 'remove deletes the key');
  ok((await st({ op: 'set', key: '', value: 1 })).statusCode === 400, 'an empty key is refused');
  ok((await st({ op: 'set', key: 'k'.repeat(201), value: 1 })).statusCode === 400, 'a key over 200 characters is refused');
  ok((await st({ op: 'set', key: 'big', value: 'v'.repeat(512 * 1024) })).statusCode === 413, 'a value over 512 KB is refused');
  ok((await st({ op: 'set', key: 'nothing' })).statusCode === 400, 'set without a value is refused');
  ok((await st({ op: 'drop' })).statusCode === 400, 'an unknown operation is refused');
  for (let i = 0; i < 4; i++) ok((await st({ op: 'set', key: `chunk${i}`, value: 'c'.repeat(500 * 1024) })).statusCode === 200, `500 KB value ${i + 1} fits`);
  const full = await st({ op: 'set', key: 'chunk4', value: 'c'.repeat(500 * 1024) });
  ok(full.statusCode === 413 && /full/.test(full.json().error), 'a page’s storage stops at 2 MB');
  ok((await st({ op: 'set', key: 'chunk0', value: 'd'.repeat(500 * 1024) })).statusCode === 200, 'replacing a value counts only the difference');
  for (let i = 0; i < 4; i++) await st({ op: 'remove', key: `chunk${i}` });
  const put = db.prepare('insert into page_storage (page_id, key, value, bytes, updated_at) values (?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (let i = 0; i < 1000; i++) put.run(sid, `k${i}`, '1', 1 + `k${i}`.length, Date.now());
  })();
  ok((await st({ op: 'set', key: 'one-more', value: 1 })).statusCode === 413, 'a page keeps at most 1000 keys');
  ok((await st({ op: 'set', key: 'k5', value: 2 })).statusCode === 200, 'a kept key can still change at the limit');
  ok((await req('POST', '/api/pages/0000000000/storage', { op: 'get', key: 'a' })).statusCode === 404, 'storage of an unknown page is refused');
  const kept = (await req('POST', '/api/pages', { title: 'Kept', html: page(1), sessionKey: 'claude:s1', item: 'toolu_1', data: { count: 7 } })).json();
  ok((await req('POST', `/api/pages/${kept.page.id}/storage`, { op: 'get', key: 'count' })).json().value === 7, 'Keep carries what the page kept meanwhile');
  ok((await req('POST', '/api/pages', { title: 'Kept', html: page(1), sessionKey: 'claude:s1', item: 'toolu_1' })).json().page.id === kept.page.id, 'keeping a page twice gives the same page');
  ok((await req('GET', '/api/pages/kept?key=claude:s1')).json().items.toolu_1 === kept.page.id, 'a conversation knows which of its pages were kept');
  const tooMuch = await req('POST', '/api/pages', { title: 'x', html: page(1), data: { a: 'q'.repeat(600 * 1024) } });
  ok(tooMuch.statusCode === 413 && (await req('GET', '/api/pages')).json().pages.every((p: { title: string }) => p.title !== 'x'), 'Keep with too much data keeps nothing');
  await req('DELETE', `/api/pages/${kept.page.id}`);
  ok(!db.prepare('select 1 from page_storage where page_id = ?').get(kept.page.id), 'deleting a page deletes what it kept');
}

// ---- a page's own address, signed -----------------------------------------------------------------------
{
  const link: string = (await req('GET', `/api/pages/${sid}`)).json().link;
  const token = link.slice(4);
  ok(/^\/pg\/[a-f0-9]{10}\.[A-Za-z0-9_-]{32}$/.test(link), 'a page’s address carries a signature');
  const shell = await req('GET', link);
  const csp = String(shell.headers['content-security-policy']);
  ok(shell.statusCode === 200 && /frame-ancestors 'none'/.test(csp) && !shell.headers['set-cookie'], 'the shell is not framed and sets no cookie');
  const script = /<script>([\s\S]*?)<\/script>/.exec(shell.body)![1];
  ok(csp.includes(`'sha256-${crypto.createHash('sha256').update(script).digest('base64')}'`), 'only the shell’s own script runs');
  ok(shell.body.includes('src="/htmlframe"') && !shell.body.includes('allow-same-origin'), 'the page runs in the sandboxed frame');
  ok((await req('GET', `${link}/manifest.webmanifest`)).json().start_url === link, 'the manifest starts at the page’s address');
  const html = await req('GET', `${link}/html`);
  ok(String(html.headers['content-type']).startsWith('application/json'), 'the page itself comes as JSON, never as a document of the app');
  const sig = token.split('.')[1];
  for (const bad of [`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, `${token}.x`, token.split('.')[0], `0000000000.${sig}`]) ok((await req('GET', `/pg/${bad}`)).statusCode === 404, 'a wrong signature opens nothing');
  const other = idOf((await run('save_page', { title: 'Other', html: page(1) })).text);
  ok((await req('GET', `/pg/${other}.${sig}`)).statusCode === 404, 'one page’s signature does not open another');
  const pst = (h: Record<string, string>) => req('POST', `${link}/storage`, { op: 'set', key: 'k1', value: 'from a phone' }, h);
  ok((await pst({})).statusCode === 403 && (await pst({ origin: 'null' })).statusCode === 403 && (await pst({ origin: 'https://evil.example' })).statusCode === 403, 'only this app’s own pages write through the address');
  ok((await pst({ origin: 'http://app.test' })).statusCode === 200, 'the shell writes through it');
  const fresh = (await req('POST', `/api/pages/${sid}/link`)).json().link;
  ok(fresh !== link && (await req('GET', link)).statusCode === 404 && (await req('GET', fresh)).statusCode === 200, 'a new address turns the old one off');
}

// ---- publish: the request, the user's answer, the agent's message ---------------------------------------
let privPath = '';
{
  const r = await run('publish_site', { folder: 'dist', name: 'Trail notes' });
  const rid = requestOf(r.text);
  ok(rid && !(await req('GET', '/api/sites')).json().sites.length, 'publish_site only asks; nothing is published yet');
  ok((await req('GET', `/api/sites/requests/${rid}`)).json().request.files === 2, 'the request shows the folder’s files (dot files left out)');
  const yes = (await req('POST', `/api/sites/requests/${rid}`, { publish: true, visibility: 'private' })).json().request;
  privPath = yes.site.path;
  ok(yes.status === 'published' && /^\/site\/[a-f0-9]{10}\.[A-Za-z0-9_-]{32}\/$/.test(privPath), 'Publish puts it at a signed private link');
  await tick();
  ok(sent.at(-1)?.key === 'claude:s1' && sent.at(-1)!.text.includes(`https://naget.example${privPath}`), 'the agent hears the outcome, with the link');
  ok((await req('POST', `/api/sites/requests/${rid}`, { publish: true })).statusCode === 409, 'a request is answered once');
  const pub = (await req('POST', `/api/sites/requests/${requestOf((await run('publish_site', { folder: dist, name: 'Trail notes' })).text)}`, { publish: true, visibility: 'public' })).json().request;
  ok(pub.site.path === '/site/trail-notes/', 'a public link is made from the name');
  const pub2 = (await req('POST', `/api/sites/requests/${requestOf((await run('publish_site', { folder: 'dist', name: 'Trail notes' })).text)}`, { publish: true, visibility: 'public' })).json().request;
  ok(pub2.site.path === '/site/trail-notes-2/', 'public names do not collide');
  const no = (await req('POST', `/api/sites/requests/${requestOf((await run('publish_site', { page: sid, name: 'Store' })).text)}`, { publish: false })).json().request;
  await tick();
  ok(no.status === 'declined' && sent.at(-1)!.text.includes('chose not to publish'), 'Not now publishes nothing, and the agent hears so');
  ok((await run('publish_site', { folder: tmp, name: 'x' })).error?.includes('no index.html'), 'a folder without index.html is refused');
  ok((await run('publish_site', { folder: '~', name: 'x' })).error?.includes('too wide'), 'the home folder is refused');
  ok((await run('publish_site', { folder: '/', name: 'x' })).error?.includes('too wide'), 'the root is refused');
  ok((await run('publish_site', { folder: process.env.DATA_DIR, name: 'x' })).error?.includes('data'), 'the app’s data is refused');
  ok((await run('publish_site', { folder: '.hidden', name: 'x' })).error?.includes('hidden'), 'a hidden folder is refused');
  for (let i = 0; i < 5; i++) await run('publish_site', { folder: 'dist', name: `wait ${i}` });
  ok((await run('publish_site', { folder: 'dist', name: 'six' })).error?.includes('Five requests'), 'at most five requests wait in a session');
  ok(events.some((e) => e.t === 'feature' && e.id === 'pages' && e.data?.what === 'request'), 'open pages hear of requests');
}

// ---- serving: sandboxed, no cookies, nothing outside the folder ----------------------------------------
{
  const get = (u: string, h: Record<string, string> = {}) => req('GET', u, undefined, { cookie: 'wa_session=secret-session-token', ...h });
  const home = await get(privPath);
  const csp = String(home.headers['content-security-policy']);
  ok(/^sandbox allow-scripts/.test(csp) && !csp.includes('allow-same-origin') && !csp.includes('allow-top-navigation'), 'a site runs sandboxed, in an opaque origin');
  ok(/frame-ancestors 'self'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp), 'only this app may frame it; no plugins; no base change');
  ok(!home.headers['set-cookie'] && !home.body.includes('secret-session-token'), 'it gets no cookie, and the app’s does not show in it');
  ok(/^<!doctype html><script>/i.test(home.body), 'its pages get the storage stand-ins right after the doctype');
  const css = await get(`${privPath}assets/app-3f9a2c1d.css`);
  ok(String(css.headers['content-type']).startsWith('text/css') && String(css.headers['cache-control']).includes('immutable') && css.headers['content-security-policy'] === csp, 'files keep their type and the policy');
  ok((await get(`${privPath}.env`)).statusCode === 404, 'dot files are never served');
  ok((await get(`${privPath}escape.txt`)).statusCode === 404, 'a link out of the folder is not followed');
  ok((await get(`${privPath}%2e%2e/%2e%2e/etc/passwd`)).statusCode === 404 && (await get(`${privPath}..%2f..%2fetc%2fpasswd`)).statusCode === 404, 'no way out with ..');
  ok((await get(`${privPath}trails/42`)).body.includes('Trail notes'), 'an app’s own routes get its index.html');
  ok((await get(privPath.slice(0, -1))).statusCode === 301, 'the link without its last slash goes to it');
  const [id, s] = privPath.split('/')[2].split('.');
  ok((await get(`/site/${id}.${s.slice(0, -2)}xx/`)).statusCode === 404 && (await get(`/site/${id}/`)).statusCode === 404, 'a private site opens only with its signature');
  ok((await get('/site/trail-notes/')).statusCode === 200, 'a public site opens by its name');
  const ps = (await req('POST', '/api/sites', { pageId: sid, name: 'Store page', visibility: 'private' })).json().site;
  ok((await get(ps.path)).body.includes('id="n-kit"'), 'a published page gets the kit');
  fs.mkdirSync(path.join(tmp, 'swap', 'site'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'swap', 'site', 'index.html'), '<!doctype html><p>first</p>');
  const sw = (await req('POST', '/api/sites', { folder: path.join(tmp, 'swap', 'site'), name: 'Swap', visibility: 'private' })).json().site;
  fs.renameSync(path.join(tmp, 'swap', 'site'), path.join(tmp, 'swap', 'old'));
  fs.symlinkSync(dist, path.join(tmp, 'swap', 'site'));
  ok((await get(sw.path)).statusCode === 404, 'a published folder swapped for a link elsewhere is not followed');
  const priv = (await req('GET', '/api/sites')).json().sites.find((x: { path: string }) => x.path === privPath);
  await req('DELETE', `/api/sites/${priv.id}`);
  ok((await get(privPath)).statusCode === 404, 'an unpublished site is gone at once');
  await req('DELETE', `/api/pages/${sid}`);
  ok((await get(ps.path)).statusCode === 404, 'deleting a page unpublishes it');
}

// ---- a page as an agent writes it ------------------------------------------------------------------------
{
  // The JSON of a call's input, cut anywhere (in a key, an escape, a \u sequence): the fields come out whole.
  const input = { title: 'Trip "plan"', id: 'abc', n: 3, nested: { html: 'not this', list: ['}', '"'] }, html: '<!doctype html>\n<p>Café — “ok” \\ 😀 \u2028</p>' };
  const json = JSON.stringify(input).replace('Café', 'Caf\\u00e9');
  for (const size of [1, 2, 3, 5, 7, 64]) {
    const f = new JsonFields(new Set(['title', 'html', 'id']));
    for (let i = 0; i < json.length; i += size) f.feed(json.slice(i, i + size));
    ok(f.fields.get('html') === input.html && f.fields.get('title') === input.title && f.fields.get('id') === 'abc', `a call's fields read whole from pieces of ${size}`);
  }
  const f = new JsonFields(new Set(['html']));
  f.feed('{"html": "<p>Hel');
  ok(f.fields.get('html') === '<p>Hel', 'a field is there as far as it came');
  f.feed('lo\\');
  ok(f.fields.get('html') === '<p>Hello', 'an escape cut off waits for the rest');
  f.feed('n</p>"}');
  ok(f.fields.get('html') === '<p>Hello\n</p>', 'and comes in once it is whole');

  const sent: { key: string; data: any }[] = [];
  const dd = { ...deps, toSubscribers: (key: string, e: { data: unknown }) => void sent.push({ key, data: e.data }) } as unknown as Deps;
  const name = 'mcp__hydor__show_html';
  const call = JSON.stringify({ title: 'Plan', html: '<!doctype html><h1>Plan</h1><p>Day one</p>' });
  feedDraft(dd, 'claude:s9', { id: 't1', name, at: 'start' });
  for (let i = 0; i < call.length; i += 9) feedDraft(dd, 'claude:s9', { id: 't1', name, at: 'delta', delta: call.slice(i, i + 9) });
  await new Promise((r) => setTimeout(r, 200));
  const whole = () => sent.filter((x) => x.data.draft.id === 't1').reduce((acc, x) => (x.data.from === 0 ? x.data.text : acc.slice(0, x.data.from) + x.data.text), '');
  ok(sent.length >= 1 && sent.length < 10 && sent[0].key === 'claude:s9' && sent[0].data.from === 0, 'a page being written goes to its session in a few pieces');
  ok(whole() === JSON.parse(call).html && sent.at(-1)!.data.draft.title === 'Plan', 'the pieces make the page so far');
  ok(draftsOf('claude:s9')[0]?.text === JSON.parse(call).html && !draftsOf('claude:s9')[0].done, 'a page opened mid-way gets it whole');
  feedDraft(dd, 'claude:s9', { id: 't1', name, at: 'end', input: JSON.parse(call) });
  ok(sent.at(-1)!.data.draft.done && whole() === JSON.parse(call).html, 'the end of the call says it is done');
  feedDraft(dd, 'claude:s9', { id: 'w1', name: 'Write', at: 'start' });
  feedDraft(dd, 'claude:s9', { id: 'w1', name: 'Write', at: 'delta', delta: JSON.stringify({ file_path: '/x/notes.md', content: 'not a page' }) });
  feedDraft(dd, 'claude:s9', { id: 'w2', name: 'Write', at: 'start' });
  feedDraft(dd, 'claude:s9', { id: 'w2', name: 'Write', at: 'delta', delta: JSON.stringify({ file_path: '/x/site/index.html', content: '<h1>Site</h1>' }) });
  feedDraft(dd, 'claude:s9', { id: 'b1', name: 'Bash', at: 'start' });
  await new Promise((r) => setTimeout(r, 200));
  const ids = draftsOf('claude:s9').map((x) => x.id);
  ok(ids.includes('w2') && !ids.includes('w1') && !ids.includes('b1'), 'an HTML file written whole is followed; other files and tools are not');
  feedDraft(dd, 'claude:s9', { id: 't2', name, at: 'start' });
  feedDraft(dd, 'claude:s9', { id: 't2', name, at: 'delta', delta: '{"html":"<p>cut' });
  endDrafts(dd, 'claude:s9');
  ok(draftsOf('claude:s9').find((x) => x.id === 't2')?.done, 'a turn that stops leaves the page where it was, done');
}

// ---- the user changes a page; the agent hears of it -------------------------------------------------------
{
  const id = idOf((await run('save_page', { title: 'Habits', html: '<!doctype html>\n<h1>Habits</h1>\n<p>Walk</p>\n' })).text);
  let r = await req('POST', `/api/pages/${id}/versions`, { html: '<!doctype html>\n<h1>My habits</h1>\n<p>Walk</p>\n', base: 1, sessionKey: 'claude:s2' });
  ok(r.json().page.version === 2 && r.json().page.by === 'edit', 'a changed page is saved as a version by the user');
  ok((await req('POST', `/api/pages/${id}/versions`, { html: '<p>stale</p>', base: 1 })).statusCode === 409, 'a change made to an older version is refused…');
  ok((await req('POST', `/api/pages/${id}/versions`, { html: '<!doctype html>\n<h1>My habits</h1>\n<p>Walk</p>\n<p>Read</p>\n', base: 1, force: true, sessionKey: 'claude:s2' })).json().page.version === 3, '…unless the user says to save it anyway');
  const notes = notesOf(db, 'claude:s2', 'page-edit');
  ok(notes.length === 1 && (notes[0].data as { version: number; told: boolean }).version === 3 && !(notes[0].data as { told: boolean }).told, 'one note in the conversation says the agent will see it');
  const told = takeEdits(db, 'claude:s2') ?? '';
  ok(told.includes(`saved page ${id}`) && told.includes('-<h1>Habits</h1>') && told.includes('+<h1>My habits</h1>') && told.includes('+<p>Read</p>'), 'the agent hears what changed, from the version it knew');
  ok(takeEdits(db, 'claude:s1')?.includes('Habits'), 'the session that made the page hears of it too');
  ok(takeEdits(db, 'claude:s2') === null, 'and only once');
  ok((notesOf(db, 'claude:s2', 'page-edit')[0].data as { told: boolean }).told, 'the note then says the agent saw it');
  ok((await run('get_page', { id })).text?.includes('changed by the user'), 'get_page says the user changed it last');
  // A page shown in the conversation, kept with the user's changes.
  r = await req('POST', '/api/pages', { title: 'Options', html: '<!doctype html>\n<h1>A or B</h1>\n', sessionKey: 'claude:s3', item: 'toolu_1', edited: '<!doctype html>\n<h1>A or C</h1>\n' });
  const kept = r.json().page;
  ok(kept.version === 2 && kept.by === 'edit', 'a shown page kept with changes has the agent’s version and the user’s');
  const k = takeEdits(db, 'claude:s3') ?? '';
  ok(k.includes('a page you showed with show_html') && k.includes('+<h1>A or C</h1>'), 'the agent hears its page was kept and changed');
  ok((await req('POST', '/api/pages', { title: 'Options', html: '<p>again</p>', sessionKey: 'claude:s3', item: 'toolu_1' })).json().page.id === kept.id, 'keeping it again gives the same page');
  const made = (await req('POST', '/api/pages', { title: 'Blank', html: '<!doctype html><p>mine</p>' })).json().page;
  ok(made.by === 'made' && !made.sessionKey, 'a page the user makes is theirs');
  const copy = (await req('POST', `/api/pages/${id}/copy`)).json().page;
  ok(copy.id !== id && copy.title === 'Habits (copy)' && copy.version === 1, 'a copy is a page of its own');
  await req('POST', `/api/pages/${id}/storage`, { op: 'set', key: 'days', value: [1, 2] });
  const entries = (await req('GET', `/api/pages/${id}/data`)).json().entries;
  ok(entries.length === 1 && entries[0].key === 'days' && JSON.stringify(entries[0].value) === '[1,2]', 'the Data view lists what a page keeps');
  await req('DELETE', `/api/pages/${id}/data`);
  ok((await req('GET', `/api/pages/${id}/data`)).json().entries.length === 0, 'and can clear it');
  ok((await req('GET', `/api/pages/${id}/thumb`)).statusCode === 404, 'a page has no picture until one is taken');
}

// ---- slide decks ----------------------------------------------------------------------------------------
{
  // A picture of the agent's, in its session's folder (a 1×1 PNG).
  fs.writeFileSync(path.join(tmp, 'dot.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  const made = await run('save_slides', {
    title: 'Launch',
    theme: 'ocean',
    slides: [
      { layout: 'title', title: 'Launch plan', subtitle: 'Spring', notes: 'Say hello.', transition: 'fade' },
      { layout: 'content', title: 'Sales grew **12%**', text: '- Europe\n  - Spain\n- Online', build: true },
      { layout: 'image-right', title: 'The store', text: 'Opening day', image: 'dot.png' },
      { layout: 'chart', title: 'By quarter', chart: { kind: 'pie', labels: ['A', 'B'], series: [{ name: 'Share', values: [60, 40] }], values: true } },
      { els: [{ type: 'shape', shape: 'star', x: 100, y: 100, w: 200, h: 200, anim: 'zoom' }, { type: 'text', x: 400, y: 100, w: 400, h: 100, text: 'Hi', color: 'red;background:url(x)', link: 'javascript:alert(1)' }, { type: 'image', x: 0, y: 0, w: 10, h: 10, src: 'nope.png' }] },
    ],
  });
  const id = idOf(made.text);
  ok(id && made.text?.includes('5 slides'), 'save_slides makes a deck');
  ok(made.text?.includes('nope.png') && made.text.includes('left out'), 'a picture that is not there is said to be left out');
  const info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.page.kind === 'slides' && info.model && info.html === undefined, 'a deck reads back as its slides');
  const deck = info.model;
  ok(deck.theme.id === 'ocean' && !('label' in deck.theme), 'its theme is the preset’s, without its label');
  const s2 = deck.slides[1];
  const body = s2.els.find((e: { role?: string }) => e.role === 'body');
  ok(body.paras.length === 3 && body.paras[1].lvl === 1 && body.paras[0].list === 'bullet', 'bullets keep their levels');
  ok(s2.els.find((e: { role?: string }) => e.role === 'title').paras[0].runs.some((r: { t: string; b?: boolean }) => r.t === '12%' && r.b), '**bold** words are bold');
  ok(s2.anims?.[0]?.byPara && s2.anims[0].el === body.id, 'build: the bullets come one at a time');
  const img = deck.slides[2].els.find((e: { type: string }) => e.type === 'image');
  ok(/^naget-asset:[a-f0-9]{40}$/.test(img.src), 'the agent’s picture file is kept by the app');
  const pic = await req('GET', `/api/pages/assets/${img.src.slice(12)}`);
  ok(pic.statusCode === 200 && pic.headers['content-type'] === 'image/png' && pic.rawPayload.length === 70, 'and served as it is');
  const s5 = deck.slides[4];
  const hi = s5.els.find((e: { type: string }) => e.type === 'text');
  ok(!hi.color && !hi.link, 'a colour or a link that is not one is dropped');
  ok(s5.els.find((e: { type: string }) => e.type === 'image').src === '', 'a picture source that is not one stays empty');
  ok(s5.anims?.length === 1 && s5.anims[0].fx === 'zoom' && s5.anims[0].type === 'in', 'a part’s own anim becomes the slide’s');
  ok(JSON.stringify(normalizeDeck(deck)) === JSON.stringify(deck), 'a kept deck is kept as it is when checked again');
  const got = (await run('get_page', { id })).text ?? '';
  ok(got.includes('A slide deck of 5 slides') && got.includes('save_slides') && got.includes('1. Launch plan'), 'get_page gives a deck’s outline and slides');
  ok(!got.includes('base64'), 'without picture data');
  ok((await run('save_page', { id, title: 'x', html: page(1) })).error?.includes('save_slides'), 'save_page refuses a deck');
  const plain = idOf((await run('save_page', { title: 'Plain', html: page(1) })).text);
  ok((await run('save_slides', { id: plain, title: 'x', slides: [] })).error?.includes('not a slide deck'), 'save_slides refuses a page');
  ok((await run('get_page', {})).text?.includes(`${id} · Launch · slide deck`), 'the list says which are decks');
  // The user's version, from the editor; the agent hears of it.
  const changed = { ...deck, slides: deck.slides.map((x: { id: string; notes?: string }, i: number) => (i === 0 ? { ...x, notes: 'Say hello, slowly.' } : x)) };
  let r = await req('POST', `/api/pages/${id}/versions`, { model: changed, base: 1, sessionKey: 'claude:s5' });
  ok(r.json().page.version === 2 && r.json().page.by === 'edit', 'a changed deck is saved as a version');
  ok((await req('POST', `/api/pages/${id}/versions`, { html: page(1), base: 2 })).statusCode === 400, 'a deck takes slides, not HTML');
  const heard = takeEdits(db, 'claude:s5') ?? '';
  ok(heard.includes(`saved slide deck ${id}`) && heard.includes('Say hello, slowly.'), 'the agent hears what changed, a line per part');
  ok((await req('POST', `/api/pages/${id}/versions/1/restore`)).json().page.version === 3, 'an older deck comes back as a new version');
  const v1 = (await req('GET', `/api/pages/${id}/versions/1`)).json();
  const json = /<script type="application\/json" id="n-deck">([^<]*)<\/script>/.exec(v1.html)?.[1] ?? '';
  ok(json.includes('data:image/png;base64,') && !json.includes('naget-asset:'), 'a deck’s own page has its pictures inside it');
  ok((await req('GET', `/api/pages/${id}/versions/1?model=1`)).json().model.slides.length === 5, 'and its slides when asked');
  const copy = (await req('POST', `/api/pages/${id}/copy`)).json().page;
  ok(copy.kind === 'slides' && copy.title === 'Launch (copy)', 'a copy of a deck is a deck');
  const tok = (await req('GET', `/api/pages/${id}`)).json().link.slice(4);
  ok((await req('GET', `/pg/${tok}/html`)).json().html.includes('id="n-deck"'), 'a deck opens at its own address as its slideshow');
  // Pages the editor uploads.
  const up = await req('POST', '/api/pages/assets', { data: `data:image/png;base64,${fs.readFileSync(path.join(tmp, 'dot.png')).toString('base64')}` });
  ok(up.json().src === img.src, 'the same picture uploaded is kept once');
  ok((await req('POST', '/api/pages/assets', { data: 'data:image/png;base64,aGVsbG8=' })).statusCode === 415, 'what is not a picture is refused');
  // The exports.
  const pptx = await req('GET', `/api/pages/${id}/export?format=pptx`);
  ok(pptx.statusCode === 200 && /presentationml/.test(String(pptx.headers['content-type'])) && /Launch\.pptx/.test(String(pptx.headers['content-disposition'])), 'a deck exports as PowerPoint');
  const file = path.join(tmp, 'Launch.pptx');
  fs.writeFileSync(file, pptx.rawPayload);
  const read = (await extractText(file))?.text ?? '';
  ok(read.includes('Launch plan') && read.includes('Sales grew') && read.includes('Spain') && read.includes('Say hello'), 'the PowerPoint file reads back with its words and notes');
  const html = await req('GET', `/api/pages/${id}/export?format=html`);
  ok(html.statusCode === 200 && html.body.includes('id="n-deck"'), 'a deck exports as a web page that plays it');
  ok((await req('GET', `/api/pages/${id}/export?format=docx`)).statusCode === 400, 'a deck does not export as Word');
  ok((await req('GET', `/api/pages/${plain}/export?format=pptx`)).statusCode === 400, 'a page does not export as PowerPoint');
  ok((await req('GET', `/api/pages/${plain}/export?format=html`)).body.includes('id="n-kit"'), 'a page exports as a web page with its kit');
  ok((await req('GET', `/api/pages/${id}/export?format=gif`)).statusCode === 400, 'an unknown format is refused');
  if (canCapture()) {
    const pdf = await req('GET', `/api/pages/${id}/export?format=pdf`);
    ok(pdf.statusCode === 200 && pdf.rawPayload.subarray(0, 5).toString() === '%PDF-', 'a deck exports as a PDF');
  } else ok((await req('GET', `/api/pages/${id}/export?format=pdf`)).statusCode === 503, 'without a browser a PDF says what it needs');
  // An agent asked from the deck in Pages is told which deck it is.
  const spawn = (await pages.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { page: id } }, deps)) ?? {};
  ok(spawn.instructions?.some((x) => x.includes(`saved page ${id}`) && x.includes('save_slides')), 'an agent asked from a deck knows it and how to change it');
}

// ---- documents ------------------------------------------------------------------------------------------
{
  const md = '# Garden plan\n\nWe grow **beans** and *peas*.\n\n## Costs\n\n| Item | Cost |\n| --- | --- |\n| Beds | 300 |\n\n- Water\n  - Taps\n- Tools\n\n![A bed](dot.png)\n\n![Gone](nope.png)\n';
  const made = await run('save_doc', { title: 'Garden plan', markdown: md });
  const id = idOf(made.text);
  ok(id && made.text?.includes('Word'), 'save_doc makes a document');
  ok(made.text?.includes('nope.png'), 'a picture that is not there is said to be left out');
  const info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.page.kind === 'doc' && Array.isArray(info.model?.blocks) && info.html === undefined, 'a document reads back as its blocks');
  const blocks = info.model.blocks as { id: string; type: string; style?: string; src?: string; lvl?: number; list?: string; rows?: unknown[][] }[];
  ok(blocks.some((b) => b.type === 'p' && b.style === 'h2') && blocks.some((b) => b.type === 'table' && b.rows?.length === 2), 'its headings and table are kept as such');
  ok(blocks.some((b) => b.type === 'li' && b.list === 'bullet' && b.lvl === 1), 'lists keep their levels');
  ok(/^naget-asset:[a-f0-9]{40}$/.test(blocks.find((b) => b.type === 'image')?.src ?? ''), 'the agent’s picture file is kept by the app');
  const got = (await run('get_page', { id })).text ?? '';
  ok(got.includes('save_doc') && got.includes('## Costs') && got.includes('**beans**'), 'get_page gives the document as Markdown and how to change it');
  ok((await run('get_page', {})).text?.includes(`${id} · Garden plan · document`), 'the list says which are documents');
  ok((await run('save_slides', { id, title: 'x', slides: [] })).error?.includes('not a slide deck'), 'save_slides refuses a document');
  const plain = idOf((await run('save_page', { title: 'Plain', html: page(1) })).text);
  ok((await run('save_doc', { id: plain, title: 'x', markdown: 'Hi' })).error?.includes('not a document'), 'save_doc refuses a page');
  // The agent changes it: the blocks it kept keep their ids.
  const again = await run('save_doc', { id, title: 'Garden plan', markdown: md.replace('300', '320') });
  const v2 = (await req('GET', `/api/pages/${id}`)).json();
  ok(idOf(again.text) === id && v2.page.version === 2, 'save_doc with the id saves a new version');
  ok(v2.model.blocks[0].id === blocks[0].id, 'unchanged blocks keep their ids');
  // The user's version, from the editor; the agent hears of it.
  const changed = { ...v2.model, blocks: [...v2.model.blocks, { type: 'p', runs: [{ t: 'Planting day in April.' }] }] };
  const r = await req('POST', `/api/pages/${id}/versions`, { model: changed, base: 2, sessionKey: 'claude:s6' });
  ok(r.json().page?.version === 3 && r.json().page.by === 'edit', 'a changed document is saved as a version');
  ok((takeEdits(db, 'claude:s6') ?? '').includes('Planting day in April.'), 'the agent hears what changed');
  ok((await req('POST', `/api/pages/${id}/versions`, { html: page(1), base: 3 })).statusCode === 400, 'a document takes its blocks, not HTML');
  // The exports.
  const docx = await req('GET', `/api/pages/${id}/export?format=docx`);
  ok(docx.statusCode === 200 && /wordprocessingml/.test(String(docx.headers['content-type'])) && /Garden plan\.docx/.test(String(docx.headers['content-disposition'])), 'a document exports as Word');
  const file = path.join(tmp, 'Garden plan.docx');
  fs.writeFileSync(file, docx.rawPayload);
  const read = (await extractText(file))?.text ?? '';
  ok(read.includes('Garden plan') && read.includes('beans') && read.includes('320') && read.includes('Planting day'), 'the Word file reads back with its words and table');
  const mdOut = await req('GET', `/api/pages/${id}/export?format=md`);
  ok(mdOut.statusCode === 200 && mdOut.body.includes('## Costs') && mdOut.body.includes('**beans**'), 'a document exports as Markdown');
  ok(mdOut.body.includes('data:image/png;base64,') && !mdOut.body.includes('naget-asset:'), 'with its pictures inside it');
  const html = await req('GET', `/api/pages/${id}/export?format=html`);
  ok(html.statusCode === 200 && html.body.includes('Planting day') && !html.body.includes('naget-asset:'), 'a document exports as a web page with its pictures inside');
  ok((await req('GET', `/api/pages/${id}/export?format=pptx`)).statusCode === 400, 'a document does not export as PowerPoint');
  if (canCapture()) {
    const pdf = await req('GET', `/api/pages/${id}/export?format=pdf`);
    ok(pdf.statusCode === 200 && pdf.rawPayload.subarray(0, 5).toString() === '%PDF-', 'a document exports as a PDF');
  }
  // Files opened in Pages.
  const imp = await req('POST', '/api/pages/import', { name: 'Garden plan.docx', data: docx.rawPayload.toString('base64') });
  ok(imp.statusCode === 200 && imp.json().page.kind === 'doc' && imp.json().page.title === 'Garden plan', 'a Word file opens as a document');
  const back = (await req('GET', `/api/pages/${imp.json().page.id}`)).json().model;
  ok(JSON.stringify(back).includes('beans') && back.blocks.some((b: { type: string }) => b.type === 'table'), 'with its words and table');
  const mdImp = await req('POST', '/api/pages/import', { name: 'notes.md', data: Buffer.from('# Notes\n\n- one\n- two\n').toString('base64') });
  ok(mdImp.json().page?.kind === 'doc' && mdImp.json().page.title === 'notes', 'a Markdown file opens as a document');
  ok((await req('POST', '/api/pages/import', { name: 'broken.docx', data: Buffer.from('not a zip').toString('base64') })).statusCode === 422, 'a file that cannot be read says so');
  ok((await req('POST', '/api/pages/import', { name: 'song.mp3', data: 'AAAA' })).statusCode === 400, 'a file of another kind is refused');
  // A new one from New, and an agent asked from it.
  const fresh = (await req('POST', '/api/pages', { title: 'Letter', kind: 'doc' })).json().page;
  ok(fresh?.kind === 'doc' && (await req('GET', `/api/pages/${fresh.id}`)).json().model.blocks.length >= 1, 'New makes an empty document');
  const spawn = (await pages.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { page: id } }, deps)) ?? {};
  ok(spawn.instructions?.some((x) => x.includes(`saved page ${id}`) && x.includes('save_doc')), 'an agent asked from a document knows it and how to change it');
}

// ---- spreadsheets ---------------------------------------------------------------------------------------
{
  fs.writeFileSync(path.join(tmp, 'sales.csv'), 'Month,Sales\nJan,120\nFeb,95.5\n');
  const budgetRows = [['Item', 'Cost'], ['Beds', 300], ['Water', 120], ['Total', '=SUM(B2:B3)']];
  const gone = await run('save_sheet', { title: 'Budget', sheets: [{ name: 'Gone', file: 'nope.csv' }] });
  ok(gone.error?.includes('nope.csv'), 'a sheet from a file that is not there says so');
  const made = await run('save_sheet', {
    title: 'Budget',
    sheets: [
      { name: 'Budget', header: true, rows: budgetRows },
      { name: 'Sales', file: 'sales.csv' },
    ],
  });
  const id = idOf(made.text);
  ok(id && made.text?.includes('Excel') && made.text.includes('2 sheets'), 'save_sheet makes a spreadsheet');
  const info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.page.kind === 'sheet' && info.model?.sheets?.length >= 2 && info.html === undefined, 'a spreadsheet reads back as its sheets');
  const budget = info.model.sheets[0];
  ok(budget.cells.B4?.f === 'SUM(B2:B3)' && budget.cells.B2?.v === 300 && budget.cells.A1?.s?.b, 'its formulas stay formulas, its numbers numbers, its header bold');
  ok(info.model.sheets[1].cells.B3?.v === 95.5, 'a CSV file of the session fills a sheet');
  const got = (await run('get_page', { id })).text ?? '';
  ok(got.includes('save_sheet') && got.includes('SUM(B2:B3)') && got.includes('420'), 'get_page gives its cells, its formulas and what they make');
  ok((await run('get_page', {})).text?.includes(`${id} · Budget · spreadsheet`), 'the list says which are spreadsheets');
  ok((await run('save_doc', { id, title: 'x', markdown: 'Hi' })).error?.includes('not a document'), 'save_doc refuses a spreadsheet');
  // The user's version, from the editor; the agent hears of it.
  const changed = { ...info.model, sheets: info.model.sheets.map((sh: { cells: Record<string, unknown> }, i: number) => (i === 0 ? { ...sh, cells: { ...sh.cells, B3: { v: 150 } } } : sh)) };
  const r = await req('POST', `/api/pages/${id}/versions`, { model: changed, base: 1, sessionKey: 'claude:s8' });
  ok(r.json().page?.version === 2 && r.json().page.by === 'edit', 'a changed spreadsheet is saved as a version');
  ok((takeEdits(db, 'claude:s8') ?? '').includes('150'), 'the agent hears what changed');
  ok((await req('POST', `/api/pages/${id}/versions`, { html: page(1), base: 2 })).statusCode === 400, 'a spreadsheet takes its cells, not HTML');
  // The exports.
  const xlsx = await req('GET', `/api/pages/${id}/export?format=xlsx`);
  ok(xlsx.statusCode === 200 && /spreadsheetml/.test(String(xlsx.headers['content-type'])) && xlsx.rawPayload.subarray(0, 2).toString() === 'PK', 'a spreadsheet exports as Excel');
  const csv = await req('GET', `/api/pages/${id}/export?format=csv`);
  ok(csv.statusCode === 200 && csv.body.includes('Total,450'), 'and as a CSV of what its cells show, worked out');
  const html = await req('GET', `/api/pages/${id}/export?format=html`);
  ok(html.statusCode === 200 && html.body.includes('Water') && html.body.includes('450'), 'and as a web page');
  ok((await req('GET', `/api/pages/${id}/export?format=docx`)).statusCode === 400, 'a spreadsheet does not export as Word');
  if (canCapture()) {
    const pdf = await req('GET', `/api/pages/${id}/export?format=pdf`);
    ok(pdf.statusCode === 200 && pdf.rawPayload.subarray(0, 5).toString() === '%PDF-', 'a spreadsheet exports as a PDF');
  }
  // Files opened in Pages.
  const imp = (await req('POST', '/api/pages/import', { name: 'Budget.xlsx', data: xlsx.rawPayload.toString('base64') })).json();
  ok(imp.page?.kind === 'sheet' && Array.isArray(imp.notes), 'an Excel file opens as a spreadsheet');
  const back = (await req('GET', `/api/pages/${imp.page.id}`)).json().model;
  ok(back.sheets[0].cells.B4?.f === 'SUM(B2:B3)' && back.sheets.length === info.model.sheets.length, 'with its sheets and formulas');
  const cimp = (await req('POST', '/api/pages/import', { name: 'prices.csv', data: Buffer.from('Item;Price\nTea;1,50\n').toString('base64') })).json();
  ok(cimp.page?.kind === 'sheet' && (await req('GET', `/api/pages/${cimp.page.id}`)).json().model.sheets[0].cells.B2?.v === 1.5, 'a CSV file opens as a spreadsheet, its separator and decimal comma read');
  const fresh = (await req('POST', '/api/pages', { title: 'Plan', kind: 'sheet' })).json().page;
  ok(fresh?.kind === 'sheet', 'New makes an empty spreadsheet');
  const spawn = (await pages.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { page: id } }, deps)) ?? {};
  ok(spawn.instructions?.some((x) => x.includes(`saved page ${id}`) && x.includes('save_sheet')), 'an agent asked from a spreadsheet knows it and how to change it');
}

// ---- LaTeX documents ------------------------------------------------------------------------------------
{
  const setup = (await req('GET', '/api/pages/tex/setup')).json();
  const doc = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
  const made = await run('save_latex', {
    title: 'Heat',
    source: doc('\\section{Heat}\nIt flows: $\\Delta u = 0$.\n\\section{Rods}\nA rod.'),
    files: { 'refs.bib': '@book{fourier, title={Th\\\'eorie}, author={Fourier}, year={1822}}' },
  });
  const id = idOf(made.text);
  ok(id && made.text?.includes('Saved "Heat"'), 'save_latex makes a LaTeX document');
  const info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.page.kind === 'tex' && info.model?.main?.includes('\\section{Heat}') && info.model.files?.[0]?.name === 'refs.bib', 'it reads back as its files');
  const got = (await run('get_page', { id })).text ?? '';
  ok(got.includes('save_latex') && got.includes('Heat (main.tex:3)') && got.includes('=== refs.bib ==='), 'get_page gives its outline and files');
  ok((await run('get_page', {})).text?.includes(`${id} · Heat · LaTeX document`), 'the list says which are LaTeX');
  ok((await run('save_doc', { id, title: 'x', markdown: 'Hi' })).error?.includes('not a document'), 'save_doc refuses a LaTeX document');
  // The agent sends what changes; what it leaves out stays.
  await run('save_latex', { id, title: 'Heat', source: doc('\\section{Heat}\nIt flows.') });
  const v2 = (await req('GET', `/api/pages/${id}`)).json();
  ok(v2.page.version === 2 && v2.model.files?.[0]?.name === 'refs.bib' && v2.model.main.includes('It flows.'), 'what the agent leaves out stays');
  const r = await req('POST', `/api/pages/${id}/versions`, { model: { ...v2.model, main: v2.model.main.replace('It flows.', 'It flows from hot to cold.') }, base: 2, sessionKey: 'claude:s7' });
  ok(r.json().page?.version === 3 && r.json().page.by === 'edit', 'a changed LaTeX document is saved as a version');
  ok((takeEdits(db, 'claude:s7') ?? '').includes('from hot to cold'), 'the agent hears what changed');
  // The exports that need no TeX, and files opened in Pages.
  const texOut = await req('GET', `/api/pages/${id}/export?format=tex`);
  ok(texOut.statusCode === 200 && texOut.body.includes('from hot to cold') && /Heat\.tex/.test(String(texOut.headers['content-disposition'])), 'it exports its source');
  const zip = await req('GET', `/api/pages/${id}/export?format=zip`);
  ok(zip.statusCode === 200 && zip.rawPayload.subarray(0, 2).toString() === 'PK', 'and its project as a zip');
  ok((await req('GET', `/api/pages/${id}/export?format=docx`)).statusCode === 400, 'a LaTeX document does not export as Word');
  const imp = await req('POST', '/api/pages/import', { name: 'note.tex', data: Buffer.from(doc('Hello.')).toString('base64') });
  ok(imp.statusCode === 200 && imp.json().page?.kind === 'tex' && Array.isArray(imp.json().notes), 'a .tex file opens as a LaTeX document');
  const zimp = (await req('POST', '/api/pages/import', { name: 'Heat.zip', data: zip.rawPayload.toString('base64') })).json();
  ok(zimp.page?.kind === 'tex' && (await req('GET', `/api/pages/${zimp.page.id}`)).json().model.files.some((f: { name: string }) => f.name === 'refs.bib'), 'a project’s zip opens with its files');
  if (!setup.missing && setup.engines?.pdflatex) {
    ok(made.text?.includes('Typeset with pdfLaTeX') && made.text.includes('no errors'), 'save_latex says how it typeset');
    const bad = await run('save_latex', { title: 'Broken', source: doc('Fine.\n\\undefinedthing\nMore.') });
    ok(/error/.test(bad.text ?? '') && (bad.text ?? '').includes('main.tex:4'), 'an error is told with its file and line');
    const c = (await req('POST', '/api/pages/tex/compile', { model: v2.model })).json();
    ok(c.ok && c.pages === 1 && /^[a-f0-9]{40}$/.test(c.key), 'the editor’s preview typesets what it sends');
    const png = await req('GET', `/api/pages/tex/${c.key}/1?w=400`);
    ok(png.statusCode === 200 && png.headers['content-type'] === 'image/png', 'and draws its pages');
    const pdf = await req('GET', `/api/pages/${id}/export?format=pdf`);
    ok(pdf.statusCode === 200 && pdf.rawPayload.subarray(0, 5).toString() === '%PDF-', 'it exports as the PDF LaTeX makes');
    ok((await req('GET', '/api/pages/tex/0123456789abcdef0123456789abcdef01234567/pdf')).statusCode === 404, 'a typesetting that is not there is not served');
    const host = fs.readFileSync('/etc/hostname', 'utf8').trim();
    const sneaky = await run('save_latex', { title: 'Sneaky', source: doc('\\input{/etc/hostname}') });
    ok(!!host && !(sneaky.text ?? '').includes(`: ${host}`) && /error/.test(sneaky.text ?? ''), 'TeX reads no file outside its folder');
  } else ok(made.text?.includes('not typeset'), 'without TeX it is kept and says what to install');
  const spawn = (await pages.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { page: id } }, deps)) ?? {};
  ok(spawn.instructions?.some((x) => x.includes(`saved page ${id}`) && x.includes('save_latex')), 'an agent asked from a LaTeX document knows it and how to change it');
}

// ---- Jupyter notebooks ----------------------------------------------------------------------------------------
{
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  // A notebook as a file an agent wrote and ran: two cells, an output with a picture, ids as nbformat 4.5 has them.
  const file = path.join(tmp, 'squares.ipynb');
  const nbFile = {
    cells: [
      { cell_type: 'markdown', id: 'intro', metadata: {}, source: ['# Squares\n', '\n', 'The first five.'] },
      {
        cell_type: 'code',
        id: 'sq',
        execution_count: 1,
        metadata: {},
        source: 'for i in range(5):\n    print(i * i)',
        outputs: [
          { output_type: 'stream', name: 'stdout', text: ['0\n', '1\n', '4\n'] },
          { output_type: 'stream', name: 'stdout', text: '\r 50%\r100%\n' },
          { output_type: 'display_data', data: { 'image/png': png, 'text/plain': '<Figure>' }, metadata: { 'image/png': { width: 10, height: 10 } } },
        ],
      },
    ],
    metadata: { kernelspec: { display_name: 'Python 3 (ipykernel)', language: 'python', name: 'python3' }, language_info: { name: 'python' } },
    nbformat: 4,
    nbformat_minor: 4,
  };
  fs.writeFileSync(file, JSON.stringify(nbFile));
  const made = await run('save_notebook', { title: 'Squares', path: 'squares.ipynb' });
  const id = idOf(made.text);
  ok(id && made.text?.includes('Saved "Squares"') && made.text.includes('2 cells, 1 with outputs'), 'save_notebook keeps an .ipynb file an agent wrote, outputs and all');
  const info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.page.kind === 'notebook' && info.model?.cells?.[1]?.outputs?.length === 3 && info.model.nbformat_minor === 5, 'it reads back as the notebook (nbformat 4.5)');
  const ipynb = await req('GET', `/api/pages/${id}/export?format=ipynb`);
  const back = JSON.parse(ipynb.body);
  ok(
    ipynb.statusCode === 200 && /Squares\.ipynb/.test(String(ipynb.headers['content-disposition'])) && Array.isArray(back.cells[0].source) && back.cells[0].source[0] === '# Squares\n' && back.cells[1].id === 'sq',
    'it exports as an .ipynb, in nbformat’s own layout (lines as lists, its ids)',
  );
  ok(ipynb.body.startsWith('{\n "cells": [') && ipynb.body.endsWith('}\n'), 'written as nbformat writes it, a space for each level');
  const py = await req('GET', `/api/pages/${id}/export?format=py`);
  ok(py.statusCode === 200 && py.body.includes('# %% [markdown]\n# # Squares') && py.body.includes('# %%\nfor i in range(5):'), 'and as a Python script with # %% cells');
  const html = await req('GET', `/api/pages/${id}/export?format=html`);
  ok(
    html.statusCode === 200 && html.body.includes("script-src 'none'") && html.body.includes('print(i * i)') && html.body.includes('100%') && !html.body.includes(' 50%') && html.body.includes('data:image/png;base64,'),
    'its web page shows the code, its outputs as Jupyter does (a redrawn line at its end), its pictures, and runs no script',
  );
  ok(html.body.includes('<h1'), 'its text cells as headings and paragraphs');
  const got = (await run('get_page', { id })).text ?? '';
  ok(got.includes('--- cell 2 · code · id sq · run [1]') && got.includes('[a picture, image/png, 10×10]') && got.includes('save_notebook'), 'get_page gives each cell, its id, what it showed, and how to change it');
  ok((await run('get_page', {})).text?.includes(`${id} · Squares · notebook`), 'the list says which are notebooks');
  ok((await run('save_doc', { id, title: 'x', markdown: 'Hi' })).error?.includes('not a document'), 'save_doc refuses a notebook');
  ok((await run('save_notebook', { id: idOf((await run('save_doc', { title: 'D', markdown: 'Hi' })).text), title: 'x', cells: [] })).error?.includes('not a notebook'), 'save_notebook refuses another kind');
  ok((await run('save_notebook', { title: 'Two', cells: [{ source: 'x' }], path: 'squares.ipynb' })).error?.includes('Give one of'), 'it takes one of path, notebook or cells');
  // Changed with its id: a new version; cells given as a list, with ids made where missing or taken twice.
  const v2 = await run('save_notebook', { id, title: 'Squares', cells: [{ type: 'markdown', source: '# Squares' }, { type: 'code', source: 'print(1)', id: 'x' }, { source: 'print(2)', id: 'x' }] });
  const m2 = (await req('GET', `/api/pages/${id}`)).json();
  ok(v2.text?.includes('version 2') && m2.model.cells.length === 3 && new Set(m2.model.cells.map((c: { id: string }) => c.id)).size === 3, 'with its id it is a new version, every cell with an id of its own');
  ok((await run('save_notebook', { title: 'Old', notebook: { cells: [], nbformat: 3 } })).error?.includes('only format 4'), 'an nbformat 3 notebook is refused, with how to convert it');
  // The editor's save, a file opened in the Library, and a new one.
  const r = await req('POST', `/api/pages/${id}/versions`, { model: { ...m2.model, cells: m2.model.cells.slice(0, 2) }, base: 2 });
  ok(r.json().page?.version === 3 && r.json().page.by === 'edit', 'a changed notebook is saved as a version');
  const imp = await req('POST', '/api/pages/import', { name: 'squares.ipynb', data: fs.readFileSync(file).toString('base64') });
  ok(imp.statusCode === 200 && imp.json().page?.kind === 'notebook' && imp.json().page.title === 'squares', 'an .ipynb file opens as a notebook');
  const fresh = (await req('POST', '/api/pages', { title: 'Scratch', kind: 'notebook' })).json();
  const fm = (await req('GET', `/api/pages/${fresh.page.id}`)).json().model;
  ok(fm.cells.length === 2 && [fm.cells[0].source].flat().join('') === '# Scratch' && fm.cells[1].cell_type === 'code' && fm.metadata.kernelspec.name === 'python3', 'New makes one with its title and a code cell');
  // Where it runs: a folder of its own in the app's data folder, gone with it.
  const where = (await req('GET', `/api/pages/${id}/notebook`)).json();
  ok(where.path.endsWith(path.join('notebooks', id, 'notebook.ipynb')) && !fs.existsSync(where.path) && typeof where.savedAt === 'number', 'it runs from a file of its own, made only when a kernel starts');
  ok((await req('POST', `/api/pages/${id}/notebook`)).json().path === where.path && JSON.parse(fs.readFileSync(where.path, 'utf8')).cells.length === 2, 'which holds it as it is kept');
  ok((await req('GET', `/api/pages/${idOf((await run('save_doc', { title: 'E', markdown: 'Hi' })).text)}/notebook`)).statusCode === 400, 'only a notebook has one');
  const spawn = (await pages.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { page: id } }, deps)) ?? {};
  ok(spawn.instructions?.some((x) => x.includes(`saved page ${id}`) && x.includes('save_notebook') && x.includes('cell 3')), 'an agent asked from a notebook knows it and how to change it');
  await req('DELETE', `/api/pages/${id}`);
  ok(!fs.existsSync(path.dirname(where.path)), 'its folder goes with it');
}

// ---- files of this computer in the editors (Files), saved back to them -----------------------------------------
{
  const dir = path.join(tmp, 'files');
  fs.mkdirSync(path.join(dir, 'paper', 'sections'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'paper', 'figures'));
  const openOf = async (p: string) => req('GET', `/api/pages/file?path=${encodeURIComponent(p)}`);

  // A CSV: saved as it came, the same to the byte; a cell changed changes its own text only.
  const csv = path.join(dir, 'people.csv');
  const text = '\ufeffid;name;zip;amount\r\n1;Ada;02134;3,50\r\n2;Alan;00501;1e3\r\n';
  fs.writeFileSync(csv, text);
  const c = (await openOf(csv)).json();
  ok(c.kind === 'sheet' && c.model?.sheets?.length === 1 && !c.cut && c.loses.length === 0, 'a CSV opens in the spreadsheet editor');
  let put = await req('PUT', '/api/pages/file', { path: csv, model: c.model, mtime: c.mtime });
  ok(put.statusCode === 200 && fs.readFileSync(csv, 'utf8') === text, 'saved as it came, a CSV is the same to the byte (separator, quotes, line ends, mark)');
  const m = structuredClone(c.model);
  m.sheets[0].cells.B3 = { v: 'Alan Turing' };
  put = await req('PUT', '/api/pages/file', { path: csv, model: m, mtime: put.json().mtime });
  ok(fs.readFileSync(csv, 'utf8') === text.replace('Alan;', 'Alan Turing;'), 'a cell changed changes its own text, and nothing else');
  ok((await req('PUT', '/api/pages/file', { path: csv, model: m, mtime: 1 })).statusCode === 409, 'a file changed since it opened is not written over');
  m.sheets[0].cells.E2 = { f: 'D2*2' };
  put = await req('PUT', '/api/pages/file', { path: csv, model: m, force: true });
  ok(put.json().dropped?.includes('formulas') && fs.readFileSync(csv, 'utf8').includes('1;Ada;02134;3,50;7\r\n'), 'a formula goes in as its value, a decimal comma where the file has them');

  // A Word file: what it has that the editor does not keep is said; the first save keeps the old file in the trash.
  const w = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const word = zipParts([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="h1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>' },
    { name: 'word/header1.xml', data: `<?xml version="1.0"?><w:hdr ${NS}>${w('ACME Corp')}</w:hdr>` },
    { name: 'word/document.xml', data: `<?xml version="1.0"?><w:document ${NS}><w:body>${w('Dear Sam,')}<w:p><w:r><w:t>Thanks.</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p></w:body></w:document>` },
  ]);
  const docx = path.join(dir, 'letter.docx');
  fs.writeFileSync(docx, word);
  const d = (await openOf(docx)).json();
  ok(d.kind === 'doc' && d.loses?.includes('headers') && d.loses.includes('footnotes') && !d.cut, 'a Word file opens in the document editor, with what saving would lose');
  ok(d.model?.blocks?.some((b: { runs?: { t: string }[] }) => b.runs?.some((r) => r.t.includes('Dear Sam'))), 'with its words');
  d.model.blocks.push({ type: 'p', runs: [{ t: 'Added in Files.' }] });
  const saved = (await req('PUT', '/api/pages/file', { path: docx, model: d.model, mtime: d.mtime, backup: true })).json();
  ok(saved.backup && fs.readFileSync(saved.backup).equals(word), 'the first save puts the file as it was in the trash');
  ok((await openOf(docx)).json().model?.blocks?.some((b: { runs?: { t: string }[] }) => b.runs?.some((r) => r.t === 'Added in Files.')), 'and the file has the change');
  const copy = (await req('PUT', '/api/pages/file', { path: docx, model: d.model, copy: true })).json();
  ok(copy.path === path.join(dir, 'letter (edited).docx') && fs.existsSync(copy.path), 'a copy goes beside it');

  // An Excel file: its sheets and formulas come back.
  const book = { sheets: [{ name: 'Costs', cells: { A1: { v: 'Rent' }, B1: { v: 1200 }, B2: { f: 'B1*2' } } }, { name: 'Notes', cells: { A1: { v: 'x' } } }] };
  const made = (await req('POST', '/api/pages', { title: 'Budget', kind: 'sheet', model: book })).json();
  const xlsx = path.join(dir, 'budget.xlsx');
  fs.writeFileSync(xlsx, (await req('GET', `/api/pages/${made.page.id}/export?format=xlsx`)).rawPayload);
  const x = (await openOf(xlsx)).json();
  ok(x.kind === 'sheet' && x.model?.sheets?.length === 2 && x.loses.length === 0, 'an Excel file opens with its sheets');
  x.model.sheets[0].cells.A2 = { v: 'Food' };
  await req('PUT', '/api/pages/file', { path: xlsx, model: x.model, mtime: x.mtime });
  const x2 = (await openOf(xlsx)).json();
  ok(x2.model.sheets[0].cells.A2?.v === 'Food' && x2.model.sheets[0].cells.B2?.f === 'B1*2', 'saved, it keeps the change and its formulas');

  // A LaTeX file: its chapter opens the document that reads it, with what it reads from the folder.
  const P = path.join(dir, 'paper');
  const mainText = '\\documentclass{article}\r\n\\usepackage{graphicx}\r\n\\begin{document}\r\n\\input{sections/intro}\r\n\\includegraphics{figures/dot.png}\r\n\\cite{k}\r\n\\bibliographystyle{plain}\r\n\\bibliography{refs}\r\n\\end{document}\r\n';
  fs.writeFileSync(path.join(P, 'paper.tex'), mainText);
  fs.writeFileSync(path.join(P, 'sections', 'intro.tex'), 'Hello from the intro.\n');
  fs.writeFileSync(path.join(P, 'refs.bib'), '@book{k, author = {A. Writer}, title = {A Book}, year = {2020}, publisher = {P}}\n');
  fs.writeFileSync(path.join(P, 'figures', 'dot.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  fs.writeFileSync(path.join(P, 'notes.tex'), 'Nothing reads this.\n');
  const t = (await openOf(path.join(P, 'sections', 'intro.tex'))).json();
  ok(t.kind === 'tex' && t.tex?.main === 'paper.tex' && t.tex.open === 'sections/intro.tex' && t.tex.inFolder === true, 'a chapter opens the document that reads it, on its own tab');
  ok(t.model?.files?.map((f: { name: string }) => f.name).sort().join(',') === 'refs.bib,sections/intro.tex' && t.model.pictures.length === 0, 'with the files it reads (its pictures stay in the folder)');
  ok((await openOf(path.join(P, 'notes.tex'))).statusCode === 415, 'a .tex that no document reads, and is none, is not one to open');
  const before = fs.statSync(path.join(P, 'paper.tex')).mtimeMs;
  t.model.files.find((f: { name: string }) => f.name === 'sections/intro.tex').text = 'Hello again.\n';
  let ts = (await req('PUT', '/api/pages/file', { path: t.path, model: t.model, tex: t.tex })).json();
  ok(fs.readFileSync(path.join(P, 'sections', 'intro.tex'), 'utf8') === 'Hello again.\n' && fs.statSync(path.join(P, 'paper.tex')).mtimeMs === before, 'saving writes the files that changed, no others');
  t.model.main = t.model.main.replace('\\cite{k}', '\\cite{k} and more');
  ts = (await req('PUT', '/api/pages/file', { path: t.path, model: t.model, tex: { ...t.tex, files: ts.files } })).json();
  ok(fs.readFileSync(path.join(P, 'paper.tex'), 'utf8') === mainText.replace('\\cite{k}', '\\cite{k} and more'), 'the main file is written as itself, with its own line ends');
  fs.writeFileSync(path.join(P, 'sections', 'intro.tex'), 'Changed elsewhere.\n');
  fs.utimesSync(path.join(P, 'sections', 'intro.tex'), new Date(), new Date(Date.now() + 5000));
  t.model.files.find((f: { name: string }) => f.name === 'sections/intro.tex').text = 'Mine.\n';
  ok((await req('PUT', '/api/pages/file', { path: t.path, model: t.model, tex: { ...t.tex, files: ts.files } })).statusCode === 409, 'a file of it changed elsewhere is not written over');
  t.model.files = t.model.files.filter((f: { name: string }) => f.name !== 'refs.bib');
  t.model.files.find((f: { name: string }) => f.name === 'sections/intro.tex').text = 'Changed elsewhere.\n';
  const ts2 = await req('PUT', '/api/pages/file', { path: t.path, model: t.model, tex: { ...t.tex, files: ts.files } });
  ok(ts2.statusCode === 200 && !fs.existsSync(path.join(P, 'refs.bib')), 'a file the editor removed goes to the trash');
  fs.writeFileSync(path.join(P, 'refs.bib'), '@book{k, author = {A. Writer}, title = {A Book}, year = {2020}, publisher = {P}}\n');
  const setup = (await req('GET', '/api/pages/tex/setup')).json();
  if (!setup.missing && setup.engines?.pdflatex) {
    const again = (await openOf(path.join(P, 'paper.tex'))).json();
    const inFolder = (await req('POST', '/api/pages/tex/compile', { model: again.model, folder: P })).json();
    ok(inFolder.ok && inFolder.errors.length === 0, 'it typesets among its folder’s files (its picture, its bibliography)');
    const alone = (await req('POST', '/api/pages/tex/compile', { model: again.model })).json();
    ok(!alone.ok && alone.errors.some((e: { message: string }) => e.message.includes('figures/dot.png')), 'and without its folder, its picture is missing');
    const sneaky = (await req('POST', '/api/pages/tex/compile', { model: { main: '\\documentclass{article}\\begin{document}\\input{../people.csv}\\end{document}' }, folder: P })).json();
    ok(!sneaky.ok, 'TeX reads nothing outside the folder it is given');
    ok(fs.readFileSync(path.join(P, 'paper.tex'), 'utf8').includes('and more'), 'typesetting leaves the folder as it was');
  }
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
