// Script tests for the page editor's tools that need the server: blocks brought in from a file (Markdown, a web page, a CSV,
// a Notion export with its databases and their rows' pages), a page made from one, a page locked (no new version, by
// the editor or an agent, until it is unlocked; page_action locks and unlocks it), the pages that link to a page, files
// kept for pages at an address of their own (pictures and PDFs shown, anything else a download), a published page's
// description and social picture, and an AI column filled by page_action (the helper model a stand-in). Build and run
// with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/page-tools-test.ts
//   DATA_DIR=/tmp/hydor-test-page-tools node dist/dev/page-tools-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { setPageAiForTests } from '../write/page-ai.ts';
import { pages } from './index.ts';
import { zipParts } from './ooxml.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-page-tools-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 60 * 1024 * 1024 });
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
const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: () => {}, toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
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
const req = (method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
const run = async (name: string, args: Record<string, unknown>): Promise<string> => {
  try {
    const r = await tools[name].run(args, ctx);
    return typeof r === 'string' ? r : (r.text ?? '');
  } catch (e) {
    return `ERROR ${(e as Error).message}`;
  }
};
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

// ---- blocks from a file -----------------------------------------------------------------------------------------------------
{
  const md = (await req('POST', '/api/pages/import-blocks', { name: 'notes.md', data: b64('---\ntitle: x\n---\n# Trip\n\n- [ ] Book flights\n- Pack\n\n| A | B |\n|---|---|\n| 1 | 2 |\n') })).json();
  ok(md.title === 'Trip' && /<ul class="n-todo"><li><input type="checkbox"><span>Book flights<\/span>/.test(md.html) && /<table class="n-tbl">/.test(md.html) && !/title: x/.test(md.html), `Markdown comes in as the editor’s blocks (${JSON.stringify(md).slice(0, 160)})`);
  const html = (await req('POST', '/api/pages/import-blocks', { name: 'page.html', data: b64('<html><head><title>Old page</title><script>alert(1)</script></head><body onload="x()"><h2 style="color:red" onclick="y()">Hello</h2><p>Words <a href="javascript:alert(1)">bad</a></p><iframe src="https://x.test"></iframe></body></html>') })).json();
  ok(html.title === 'Old page' && /<h2>Hello<\/h2>/.test(html.html) && !/script|onclick|javascript:|iframe|style=/.test(html.html), `a web page comes in without what runs (${html.html})`);
  const csv = (await req('POST', '/api/pages/import-blocks', { name: 'Books.csv', data: b64('Title,Pages,Read\nDune,412,yes\nEmma,320,no\n') })).json();
  const schema = JSON.parse(/data-schema="([^"]*)"/.exec(csv.html)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, '&') ?? '{}');
  ok(/class="n-db"/.test(csv.html) && schema.title === 'Books' && schema.rows?.length === 2 && schema.cols?.map((c: { kind: string }) => c.kind).join(',') === 'text,number,check', `a CSV file comes in as a database (${JSON.stringify(schema).slice(0, 200)})`);
  const id = '0123456789abcdef0123456789abcdef';
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c63f8cfc0f01f0005000201' + 'a5a0e1c20000000049454e44ae426082', 'hex');
  const notion = zipParts([
    { name: `Trip ${id}.md`, data: `# Trip\n\nSome words.\n\n![map](Trip%20${id}/map.png)\n\n[Tasks](Trip%20${id}/Tasks%20${id}.csv)\n\n[Ideas](Trip%20${id}/Ideas%20${id}.md)\n` },
    { name: `Trip ${id}/map.png`, data: png },
    { name: `Trip ${id}/Tasks ${id}.csv`, data: 'Name,Status\nBook,Done\n' },
    { name: `Trip ${id}/Tasks ${id}_all.csv`, data: 'Name,Status\nBook,Done\nVisa,To do\n' },
    { name: `Trip ${id}/Tasks ${id}/Visa ${id}.md`, data: '# Visa\n\nStatus: To do\n\nApply online, two weeks before.\n' },
    { name: `Trip ${id}/Ideas ${id}.md`, data: '# Ideas\n\n- A boat trip\n' },
  ]);
  const n = (await req('POST', '/api/pages/import-blocks', { name: 'Export.zip', data: b64(notion) })).json();
  const ns = JSON.parse(/data-schema="([^"]*)"/.exec(n.html ?? '')?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, '&') ?? '{}');
  ok(n.title === 'Trip' && /<p>Some words\.<\/p>/.test(n.html) && /<img class="n-pic" src="data:image\/png;base64,/.test(n.html), `a Notion export: its page, its pictures inside it (${(n.html ?? n.error ?? '').slice(0, 200)})`);
  ok(ns.title === 'Tasks' && ns.rows?.length === 2 && /Apply online/.test(ns.rows?.find((r: { page?: string }) => r.page)?.page ?? '') && n.html.indexOf('n-db') < n.html.indexOf('<h2>Ideas</h2>'), 'its database in its place, with all its rows and their own pages, its sub-pages after it');
  ok((await req('POST', '/api/pages/import-blocks', { name: 'x.exe', data: b64('MZ') })).statusCode === 415, 'a kind of file it can’t bring in says so');
  const made = (await req('POST', '/api/pages/import-page', { name: 'notes.md', data: b64('# Garden\n\nTomatoes.\n') })).json();
  ok(made.page?.title === 'Garden' && /<body class="n-page">\n<h1>Garden<\/h1>\n<p>Tomatoes\.<\/p>/.test((await req('GET', `/api/pages/${made.page?.id}`)).json().html ?? ''), 'Import a page makes a page of its own, its title on top');
}

// ---- lock, links to a page --------------------------------------------------------------------------------------------------
{
  const idOf = (t: string) => /\(page ([a-f0-9]{10})/.exec(t)?.[1] ?? '';
  const a = idOf(await run('save_page', { title: 'Budget', html: '<!doctype html><html><body><p>Money</p></body></html>' }));
  const b = idOf(await run('save_page', { title: 'Trip', html: `<!doctype html><html><body><p>See <a class="n-pagelink" href="/pages/${a}" data-page="${a}">Budget</a></p></body></html>` }));
  idOf(await run('save_page', { title: 'Other', html: '<!doctype html><html><body><p>Nothing</p></body></html>' }));
  const links = (await req('GET', `/api/pages/${a}/backlinks`)).json().pages;
  ok(links.length === 1 && links[0].id === b && links[0].title === 'Trip', `the pages that link here (${JSON.stringify(links)})`);
  ok((await req('POST', `/api/pages/${a}/lock`, { locked: true })).json().page?.locked === true, 'a page locks');
  ok(/locked/.test(await run('save_page', { id: a, title: 'Budget', html: '<!doctype html><html><body><p>Changed</p></body></html>' })), 'a locked page takes no new version, an agent’s either');
  ok((await req('POST', `/api/pages/${a}/versions`, { html: '<p>x</p>' })).statusCode !== 200, 'nor the editor’s');
  ok(/Unlocked/.test(await run('page_action', { id: a, action: 'unlock' })) && /version 2/.test(await run('save_page', { id: a, title: 'Budget', html: '<!doctype html><html><body><p>Changed</p></body></html>' })), 'page_action unlocks it, and it changes again');
  ok(/Locked/.test(await run('page_action', { id: a, action: 'lock' })) && (await req('GET', `/api/pages/${a}`)).json().page?.locked === true, 'page_action locks it');
}

// ---- an AI column filled by page_action --------------------------------------------------------------------------------------
{
  const asked: string[] = [];
  setPageAiForTests(async (q) => {
    asked.push(q.prompt);
    return /Lisbon/.test(q.prompt) ? 'Portugal' : 'Spain';
  });
  const schema = JSON.stringify({ cols: [{ name: 'City' }, { name: 'Country', kind: 'ai', ai: { how: 'extract', prompt: 'the country' } }], rows: [{ City: 'Lisbon' }, { City: 'Madrid' }] }).replace(/"/g, '&quot;');
  const id = /\(page ([a-f0-9]{10})/.exec(await run('save_page', { title: 'Cities', html: `<!doctype html><html><body><div class="n-db" data-db="cities" data-schema="${schema}"></div></body></html>` }))?.[1] ?? '';
  const said = await run('page_action', { id, action: 'fill_column', column: 'Country' });
  const read = await run('get_page', { id });
  ok(/Filled 2 of 2 cells/.test(said) && /City="Lisbon", Country="Portugal"/.test(read) && /City="Madrid", Country="Spain"/.test(read) && /Take out of the row: the country/.test(asked[0] ?? ''), `page_action fill_column has the helper model fill an AI column, a row at a time (${said})`);
  setPageAiForTests(null);
}

// ---- files kept for pages ---------------------------------------------------------------------------------------------------
{
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const up = await app.inject({ method: 'POST', url: '/api/pages/files?name=Plan.pdf&type=application%2Fpdf', payload: pdf, headers: { 'content-type': 'application/octet-stream', host: 'app.test' } });
  const f = up.json();
  ok(/^\/pg\/file\/[a-f0-9]{64}\/[\w-]{32}\/Plan\.pdf$/.test(f.src ?? '') && f.type === 'application/pdf' && f.size === pdf.length, `a file is kept for pages at an address of its own (${up.body.slice(0, 160)})`);
  const got = await app.inject({ method: 'GET', url: f.src });
  ok(got.statusCode === 200 && got.headers['content-type'] === 'application/pdf' && got.headers['access-control-allow-origin'] === '*' && /^inline/.test(String(got.headers['content-disposition'])) && got.rawPayload.equals(pdf), 'it shows where its address is opened (a PDF in the page)');
  ok((await app.inject({ method: 'GET', url: f.src.replace(/\/([\w-]{32})\//, '/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/') })).statusCode === 404, 'an address not signed by this server opens nothing');
  const htmlFile = (await app.inject({ method: 'POST', url: '/api/pages/files?name=evil.html&type=text%2Fhtml', payload: Buffer.from('<script>alert(1)</script>'), headers: { 'content-type': 'application/octet-stream', host: 'app.test' } })).json();
  const served = await app.inject({ method: 'GET', url: htmlFile.src });
  ok(served.headers['content-type'] === 'application/octet-stream' && /^attachment/.test(String(served.headers['content-disposition'])), 'a web page kept as a file is only ever downloaded, never shown as one of the app’s pages');
}

// ---- a published page: its description and social picture -----------------------------------------------------------------
{
  const id = /\(page ([a-f0-9]{10})/.exec(await run('save_page', { title: 'Recipes', html: '<!doctype html><html><head><title>Recipes</title></head><body><p>Soup</p></body></html>' }))?.[1] ?? '';
  const site = (await req('POST', '/api/sites', { pageId: id, name: 'Recipes', visibility: 'public', description: 'Soups & stews "for winter"', image: 'none' })).json().site;
  const page = await app.inject({ method: 'GET', url: `${site.path}`, headers: { host: 'app.test', 'x-forwarded-proto': 'https' } });
  ok(page.body.includes('<meta property="og:title" content="Recipes">') && page.body.includes('<meta name="description" content="Soups &amp; stews &quot;for winter&quot;">') && !page.body.includes('og:image') && page.body.includes('og:url" content="https://app.test/site/'), `a published page says its name and description where its link is shared (${site.path})`);
  const again = (await req('PATCH', `/api/sites/${site.id}`, { description: 'Soups', image: 'thumb' })).json().site;
  ok(again.description === 'Soups' && again.image === 'thumb', 'its description and picture change');
}

console.log(`${passed} passed, ${failed} failed`);
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
