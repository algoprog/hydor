// Script tests for Pages: version history, the storage limits, the signed links (a page's own address,
// private sites), the publish flow (the card's answer, the agent's message) and how pages and sites are
// served (sandbox policy, no cookies, nothing outside the folder). Through the routes, with a stand-in
// for the session manager. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/pages-test.ts
//   DATA_DIR=/tmp/naget-test-pages-unit node dist/dev/pages-test.js
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { pages } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

// ---- a folder to publish, with what must never be served -----------------------------------------
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'naget-pages-test-')));
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
const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) =>
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

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
