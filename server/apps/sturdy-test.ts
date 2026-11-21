// Script tests for a flow's sturdier calls to the web (sturdy.ts): which failures are tried again and after how long,
// the spacing of calls to one host, the answers kept a while, a page that keeps programs out read in the browser (a
// stand-in), and what a run could not have, kept with it and shown in its JSON. Stand-in tools; no network, no browser.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/sturdy-test.ts
//   DATA_DIR=/tmp/hydor-test-sturdy HYDOR_APPS_DIR=/tmp/hydor-test-sturdy-apps node dist/dev/sturdy-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { APP_SERVICES, serviceOf } from '../../shared/app-services.ts';
import { cleanFlow } from '../../shared/app-manifest.ts';
import { cleanRecipe, isActive } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import { vaultTables } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import { registerFeatures } from '../features/registry.ts';
import { SearchService } from '../search/service.ts';
import { searchTools } from '../search/tools.ts';
import { SearchError, type SearchProvider } from '../search/types.ts';
import type { Deps, Feature, RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { botWall, failureOf, retryAfterMs } from '../web/failure.ts';
import { apps } from './index.ts';
import { startRun, startRuns, waitFor } from './runs.ts';
import * as store from './store.ts';
import { callTool, forgetAll, gate, readFailure, retryWait, setBrowserRead, whatOf, whyOf } from './sturdy.ts';
import { missLine } from './use.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-sturdy-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
vaultTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const half = () => 0.5;

// ---- stand-ins -------------------------------------------------------------------------------------------

/** What each stand-in tool answers, by address or words: a list taken in order (the last stays), or one answer. */
const answers = new Map<string, (ToolOutput | string)[]>();
const calls: { tool: string; args: any; at: number }[] = [];
const answer = (tool: string, a: any): ToolOutput | string => {
  calls.push({ tool, args: a, at: Date.now() });
  const list = answers.get(String(a.url ?? a.query ?? ''));
  if (!list?.length) return tool === 'web_search' ? JSON.stringify({ results: [{ title: `About ${a.query}` }] }) : `Page: ${a.url}\n\nThe page says hello.`;
  return list.length > 1 ? list.shift()! : list[0];
};
const fake = (name: string): RunTool => ({ name, description: name, inputSchema: { type: 'object' }, run: async (a) => answer(name, a) });
const fakeTools: Feature = { id: 'fake-tools', tools: () => [fake('web_search'), fake('read_page'), fake('http_request')] };
const ctx = { runId: 'flow-test', key: 'acp:flow-test', agent: 'acp', cwd: tmp, step: true } as unknown as RunCtx;
const count = (url: string) => calls.filter((c) => c.args.url === url || c.args.query === url).length;

/** The browser: what it reads of an address (null: kept out there too). */
const browser = { reads: [] as string[], page: null as string | null };
setBrowserRead(async (a) => (browser.reads.push(a.url), browser.page));

const http = Fastify();
await http.register(cookie);
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const deps = { app: http, db, sessions: { on() {}, summary: () => null } as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
registerFeatures([fakeTools], deps);
startRuns(deps);
await http.ready();

const app = (p: Record<string, unknown>) => store.saveApp(db, { recipe: cleanRecipe({ name: 'Sturdy', agent: 'claude', fields: [], answer: [], tools: null, limits: {}, ...p }) });
async function ended(id: string, ms = 60_000) {
  const r = await waitFor(id, ms);
  assert.ok(r && !isActive(r.status), `run ${id} ended (it is ${r?.status})`);
  return r!;
}

// ---- which failures pass, and how long to wait ------------------------------------------------------------

test('a failure that may pass is tried again: after what the service asked, else about 1 s then 3 s; never past three tries or 20 s of waiting', () => {
  const read = { tries: 1, waited: 0, safe: true, random: half };
  assert.equal(retryWait({ status: 503 }, read), 1000);
  assert.equal(retryWait({ status: 503 }, { ...read, tries: 2 }), 3000);
  assert.equal(retryWait({ status: 503 }, { ...read, tries: 3 }), null, 'three tries in all');
  assert.equal(retryWait({ status: 429, waitMs: 4000 }, read), 4100, 'the wait it asked for');
  assert.equal(retryWait({ status: 429, waitMs: 25_000 }, read), null, 'a wait past 20 s is not waited');
  assert.equal(retryWait({ status: 502 }, { ...read, tries: 2, waited: 18_000 }), null, '20 s of waiting at most');
  for (const status of [408, 425, 500, 502, 504]) assert.ok(retryWait({ status }, read), `${status} passes`);
  for (const kind of ['timeout', 'dropped', 'unreachable', 'limit', 'down'] as const) assert.ok(retryWait({ kind }, read), `${kind} passes`);
  for (const status of [400, 401, 403, 404, 410, 422]) assert.equal(retryWait({ status }, read), null, `${status} does not pass`);
  for (const kind of ['key', 'refused', 'botwall'] as const) assert.equal(retryWait({ kind }, read), null, `${kind} does not pass`);
  assert.equal(retryWait({ status: 503, kind: 'botwall' }, read), null, 'a bot check that answers 503 is no outage');
  // A POST that may have been taken is not sent twice; one the service turned away is.
  const post = { ...read, safe: false };
  assert.equal(retryWait({ status: 500 }, post), null);
  assert.equal(retryWait({ kind: 'timeout' }, post), null);
  assert.equal(retryWait({ status: 429 }, post), 1000);
  assert.equal(retryWait({ kind: 'unreachable' }, post), 1000);
  const jittered = retryWait({ status: 503 }, { ...read, random: () => 0 })!;
  assert.ok(jittered >= 800 && jittered < 1000, `a little jitter (${jittered})`);
});

test('a failure read from what the tool said: its own structured failure, else its words; a thrown error by its kind', () => {
  assert.deepEqual(readFailure({ text: 'x', isError: true, failure: { status: 429, waitMs: 2000 } }), { status: 429, waitMs: 2000, text: 'x' });
  const search = readFailure({ text: 'No search provider could answer. Naget Search: is limiting requests; it can be asked again in 1 s.', isError: true });
  assert.equal(search.kind, 'limit');
  assert.equal(search.waitMs, 1000);
  assert.equal(readFailure({ text: 'No search provider could answer. Brave: needs a key.', isError: true }).kind, undefined, 'a missing key does not pass');
  assert.equal(readFailure({ text: 'The site answered 403 for https://x.org/a.', isError: true }).status, 403);
  assert.equal(readFailure({ text: 'HTTP 429 Too Many Requests  ·  api.semanticscholar.org', isError: true }).status, 429);
  assert.deepEqual(readFailure({ text: 'There is no key named SEMANTIC_SCHOLAR_API_KEY in the vault.', isError: true }), { text: 'There is no key named SEMANTIC_SCHOLAR_API_KEY in the vault.', kind: 'key', key: 'SEMANTIC_SCHOLAR_API_KEY' });
  assert.equal(readFailure(undefined, Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })).kind, 'timeout');
  assert.equal(readFailure(undefined, Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } })).kind, 'dropped');
  assert.equal(failureOf(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))?.kind, 'unreachable');
  // A name that is not known is its own kind, read from the error or from the tool's words, and is never tried again.
  assert.equal(failureOf(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }))?.kind, 'nohost');
  assert.equal(readFailure({ text: 'The request failed: getaddrinfo ENOTFOUND rates.down.example', isError: true }).kind, 'nohost');
  assert.equal(retryWait({ kind: 'nohost' }, { tries: 1, waited: 0, safe: true }), null);
  assert.equal(retryAfterMs('2'), 2000);
  assert.equal(retryAfterMs(new Date(Date.now() + 5000).toUTCString(), Date.now())! > 3000, true);
  assert.equal(retryAfterMs('soon'), undefined);
  assert.ok(botWall('Just a moment...\n\nEnable JavaScript and cookies to continue'));
  assert.ok(botWall('', 'Attention Required! | Cloudflare'));
  assert.ok(!botWall(`An article about bot checks. ${'Words. '.repeat(2000)}Just a moment...`), 'a long page is no bot check');
});

test('what was missed, in plain words: what it wanted and why', () => {
  assert.equal(whatOf('read_page', { url: 'https://www.example.org/news/2026/11/a-long-story-about-something-that-happened-there?id=3' }), 'www.example.org/news/2026/11/a-long-story-about-something-t…');
  assert.equal(whatOf('http_request', { url: 'https://api.semanticscholar.org/graph/v1/paper/search?query=x&key={{S2}}' }), 'api.semanticscholar.org/graph/v1/paper/search');
  assert.equal(whatOf('web_search', { query: 'dense   retrieval' }), '“dense retrieval”');
  const f = (x: object) => ({ text: '', ...x });
  assert.equal(whyOf('http_request', f({ status: 429 })), 'it limits requests');
  assert.equal(whyOf('read_page', f({ status: 403 })), 'it keeps programs out');
  assert.equal(whyOf('read_page', f({ kind: 'botwall' })), 'it keeps programs out');
  assert.equal(whyOf('http_request', f({ kind: 'timeout' })), 'no answer in time');
  assert.equal(whyOf('http_request', f({ kind: 'nohost' })), 'there is no such address');
  assert.equal(whyOf('http_request', f({ status: 503 })), 'it had a problem (503)');
  assert.equal(whyOf('http_request', f({ kind: 'key', key: 'SEMANTIC_SCHOLAR_API_KEY' })), 'it needs the key SEMANTIC_SCHOLAR_API_KEY');
  assert.equal(whyOf('http_request', f({ kind: 'key', key: 'S2' }), (k) => k === 'S2'), 'it would do more with the key S2 (optional)');
  assert.equal(whyOf('web_search', f({ kind: 'limit' })), 'the search services limit requests');
});

test('the services table: each with its hosts, what it gives and examples; a subdomain counts as its host', () => {
  assert.ok(APP_SERVICES.length >= 18);
  for (const s of APP_SERVICES) {
    assert.ok(s.id && s.name && s.hosts.length && s.about, s.id);
    for (const e of s.examples ?? []) assert.ok(s.hosts.some((h) => new URL(e.url).hostname === h || new URL(e.url).hostname.endsWith(`.${h}`)), `${s.id}: ${e.url} is one of its hosts`);
  }
  assert.equal(new Set(APP_SERVICES.map((s) => s.id)).size, APP_SERVICES.length, 'ids are unique');
  assert.equal(serviceOf('api.semanticscholar.org')?.perSecond, 1);
  assert.equal(serviceOf('nominatim.openstreetmap.org')?.perSecond, 1);
  assert.equal(serviceOf('export.arxiv.org')?.perSecond, 1 / 3);
  assert.equal(serviceOf('de.wikipedia.org')?.id, 'wikipedia');
  assert.equal(serviceOf('WWW.THEMEALDB.COM')?.id, 'themealdb');
  assert.ok(serviceOf('geocoding-api.open-meteo.com')?.cacheSeconds);
  assert.equal(serviceOf('example.com'), undefined);
  assert.equal(serviceOf('notwikipedia.org'), undefined);
});

// ---- one call ---------------------------------------------------------------------------------------------------

const tool = (name: string) => fakeTools.tools!(ctx).find((t) => t.name === name)!;

test('a call that fails for a moment is tried again and answers; one that cannot pass (404) is made once', async () => {
  forgetAll();
  answers.set('https://flaky.example/a', [{ text: 'The site answered 503', isError: true, failure: { status: 503, waitMs: 50 } }, 'Page: flaky\n\nHello at last.']);
  const ok = await callTool(tool('read_page'), { url: 'https://flaky.example/a' }, ctx, { random: half });
  assert.deepEqual([ok.ok, ok.tries], [true, 2]);
  assert.match(ok.ok ? ok.text : '', /Hello at last/);
  answers.set('https://gone.example/b', [{ text: 'The site answered 404 for https://gone.example/b.', isError: true, failure: { status: 404 } }]);
  const gone = await callTool(tool('read_page'), { url: 'https://gone.example/b' }, ctx, { random: half });
  assert.equal(gone.ok, false);
  assert.equal(count('https://gone.example/b'), 1, 'no second try');
  assert.equal(browser.reads.length, 0, 'a page that is not there is not read in the browser');
  // Thrown errors too: a dropped connection passes.
  let n = 0;
  const thrower: RunTool = { ...fake('http_request'), run: async () => (++n === 1 ? Promise.reject(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })) : 'HTTP 200 OK\n\n{}') };
  const again = await callTool(thrower, { url: 'https://api.example/x' }, ctx, { random: half });
  assert.deepEqual([again.ok, n], [true, 2]);
});

test('a wait the service names is waited, and holds its host for every caller until then', async () => {
  forgetAll();
  answers.set('https://busy.example/q', [{ text: 'HTTP 429', isError: true, failure: { status: 429, waitMs: 400 } }, 'HTTP 200 OK\n\nfine']);
  const t0 = Date.now();
  const first = callTool(tool('http_request'), { url: 'https://busy.example/q' }, ctx, { random: half });
  // Another caller of the same host, a moment later, waits for the hold too.
  await new Promise((r) => setTimeout(r, 100));
  const other = callTool(tool('http_request'), { url: 'https://busy.example/other' }, ctx, { random: half });
  assert.equal((await first).ok, true);
  await other;
  const otherAt = calls.find((c) => c.args.url === 'https://busy.example/other')!.at;
  assert.ok(otherAt - t0 >= 390, `the other call waited for the host (${otherAt - t0} ms)`);
  const retried = calls.filter((c) => c.args.url === 'https://busy.example/q').map((c) => c.at);
  assert.ok(retried[1] - retried[0] >= 400, `the second try came after the wait (${retried[1] - retried[0]} ms)`);
});

test('calls to one host are spaced as its service asks, for every caller (Semantic Scholar: one a second)', async () => {
  forgetAll();
  const t0 = Date.now();
  const at: number[] = [];
  await Promise.all([0, 1, 2].map(() => gate('api.semanticscholar.org').then(() => at.push(Date.now() - t0))));
  at.sort((a, b) => a - b);
  assert.ok(at[0] < 100, `the first goes at once (${at[0]})`);
  assert.ok(at[1] >= 950 && at[2] >= 1950, `the others a second apart (${at.join(', ')})`);
  // A host it does not know is not held up.
  const u0 = Date.now();
  await Promise.all([0, 1, 2].map(() => gate('example.org')));
  assert.ok(Date.now() - u0 < 100);
});

test('a look-up is kept for the same call (five minutes), a step can say not to, and only good answers and GET requests are kept', async () => {
  forgetAll();
  const page = { url: 'https://kept.example/p' };
  const a = await callTool(tool('read_page'), page, ctx);
  const b = await callTool(tool('read_page'), { ...page }, ctx);
  assert.equal(count(page.url), 1, 'the second came from what was kept');
  assert.deepEqual([a.ok && a.from, b.ok && b.from], [undefined, 'cache']);
  await callTool(tool('read_page'), page, ctx, { cache: false });
  assert.equal(count(page.url), 2, 'cache: false asks again');
  await callTool(tool('read_page'), { url: page.url, question: 'what?' }, ctx);
  assert.equal(count(page.url), 3, 'other inputs are another call');
  // The same search words: kept; a POST is not; a failure is not.
  await callTool(tool('web_search'), { query: 'tides' }, ctx);
  await callTool(tool('web_search'), { query: 'tides' }, ctx);
  assert.equal(count('tides'), 1);
  const post = { method: 'POST', url: 'https://api.example/post', body: { a: 1 } };
  await callTool(tool('http_request'), post, ctx);
  await callTool(tool('http_request'), post, ctx);
  assert.equal(count(post.url), 2);
  answers.set('https://fails.example/', [{ text: 'HTTP 400', isError: true, failure: { status: 400 } }]);
  await callTool(tool('http_request'), { url: 'https://fails.example/' }, ctx);
  await callTool(tool('http_request'), { url: 'https://fails.example/' }, ctx);
  assert.equal(count('https://fails.example/'), 2);
  // A key goes by its name: another name is another call.
  await callTool(tool('http_request'), { url: 'https://api.example/k', auth: 'ONE' }, ctx);
  await callTool(tool('http_request'), { url: 'https://api.example/k', auth: 'TWO' }, ctx);
  assert.equal(count('https://api.example/k'), 2);
});

test('a page that keeps programs out is read once in the browser; when it is kept out there too, the failure stands', async () => {
  forgetAll();
  browser.reads.length = 0;
  answers.set('https://walled.example/a', [{ text: 'The site answered 403 for https://walled.example/a.\n\nJust a moment...', isError: true, failure: { status: 403, kind: 'botwall' } }]);
  browser.page = 'Page: Walled\n\nThe article itself.';
  const read = await callTool(tool('read_page'), { url: 'https://walled.example/a' }, ctx, { random: half });
  assert.deepEqual([read.ok, read.ok && read.from], [true, 'browser']);
  assert.equal(count('https://walled.example/a'), 1, 'a bot check is not tried again by the program');
  assert.deepEqual(browser.reads, ['https://walled.example/a']);
  // A 200 that is only a bot check counts as one.
  answers.set('https://check.example/', ['Page: Just a moment...\n\nJust a moment...\nEnable JavaScript and cookies to continue']);
  browser.page = null;
  const kept = await callTool(tool('read_page'), { url: 'https://check.example/' }, ctx, { random: half });
  assert.equal(kept.ok, false);
  assert.equal(!kept.ok && whyOf('read_page', kept.failure), 'it keeps programs out');
  assert.equal(browser.reads.length, 2);
});

test('web_search says when no provider could answer for now, and when to ask again; a search tried then answers', async () => {
  forgetAll();
  let asked = 0;
  const provider: SearchProvider = {
    id: 'fake',
    name: 'Fake Search',
    description: '',
    caps: { maxK: 30, sites: true, excludeSites: true, categories: false, dates: true, languages: false, fileTypes: true, homepagesOnly: false, filteredSnippets: false },
    key: 'none',
    enabledByDefault: true,
    async search() {
      if (++asked === 1) throw new SearchError('limit', 'Fake Search is limiting requests; it can be asked again in 1 s', Date.now() + 1000);
      return { results: [{ title: 'Tides', url: 'https://example.org/tides', snippet: 'About tides.' }] };
    },
  };
  const kv = new Map<string, string>();
  const service = new SearchService({ kv: { get: (k) => kv.get(k), set: (k, v) => void kv.set(k, v) }, providers: [provider] });
  const search = searchTools(service).find((t) => t.name === 'web_search')!;
  const t0 = Date.now();
  const r = await callTool(search, { query: 'tides' }, ctx, { random: half });
  assert.equal(r.ok, true, r.ok ? '' : r.text);
  assert.deepEqual([asked, r.tries], [2, 2]);
  assert.ok(Date.now() - t0 >= 900, `it waited until it could ask again (${Date.now() - t0} ms)`);
  // A provider that lacks its key does not pass in a moment: no structured failure, so no second try.
  const keyless = new SearchService({ kv: { get: () => undefined, set: () => {} }, providers: [{ ...provider, search: async () => Promise.reject(new SearchError('auth', 'Fake Search needs a key', Date.now() + 3600_000)) }] });
  const out = (await searchTools(keyless).find((t) => t.name === 'web_search')!.run({ query: 'x' }, ctx)) as ToolOutput;
  assert.equal(out.isError, true);
  assert.equal(out.failure, undefined);
});

// ---- a run's misses ---------------------------------------------------------------------------------------------

test('format: a tool step’s cache is false or seconds (at most a week), and anything else is said in words', () => {
  const { flow, errors } = cleanFlow({
    steps: [
      { id: 'a', do: 'tool', tool: 'read_page', with: { url: 'x' }, cache: false },
      { id: 'b', do: 'tool', tool: 'read_page', with: { url: 'x' }, cache: 86400 * 30 },
      { id: 'c', do: 'tool', tool: 'read_page', with: { url: 'x' }, cache: 'soon' },
    ],
  });
  assert.deepEqual(
    flow!.steps.map((s) => (s as { cache?: unknown }).cache),
    [false, 7 * 86400, undefined],
  );
  assert.match(errors.join('\n'), /"cache" is false/);
});

test('a run keeps what it could not have: a call that failed after its tries even when the program caught it, a key it lacked, a step skipped for an error; not a step whose rule did not hold', async () => {
  forgetAll();
  browser.page = null;
  answers.set('https://blocked.example/story', [{ text: 'The site answered 403 for https://blocked.example/story.', isError: true, failure: { status: 403 } }]);
  answers.set('https://api.semanticscholar.org/graph/v1/paper/search?query=x', [{ text: 'There is no key named S2_KEY in the vault.', isError: true, failure: { kind: 'key', key: 'S2_KEY' } }, 'HTTP 200 OK\n\n{"data":[]}']);
  answers.set('https://down.example/', [{ text: 'HTTP 404', isError: true, failure: { status: 404 } }]);
  const program = [
    "let caught = '';",
    "try { await ctx.tool('read_page', { url: 'https://blocked.example/story' }, { title: 'Read the story' }); } catch (e) { caught = e.message; }",
    // As the ready-made apps do: signed when the key is there, else unsigned.
    "let r; try { r = await ctx.tool('http_request', { url: 'https://api.semanticscholar.org/graph/v1/paper/search?query=x', auth: 'S2_KEY' }, { title: 'Ask Semantic Scholar' }); } catch (e) { r = await ctx.tool('http_request', { url: 'https://api.semanticscholar.org/graph/v1/paper/search?query=x' }, { title: 'Ask Semantic Scholar' }); }",
    'return { caught, got: r.text.length > 0 };',
  ].join('\n');
  const a = app({
    name: 'Misses',
    secrets: [{ name: 'S2_KEY', label: 'Semantic Scholar key', optional: true, domains: ['api.semanticscholar.org'] }],
    flow: {
      steps: [
        { id: 'main', title: 'Look things up', do: 'code', language: 'javascript', code: program },
        { id: 'never', title: 'Not today', do: 'tool', tool: 'read_page', with: { url: 'https://down.example/' }, if: '{{main.got}} = false' },
        { id: 'gone', title: 'Read the old page', do: 'tool', tool: 'read_page', with: { url: 'https://down.example/' }, failed: 'skip' },
      ],
    },
  });
  const done = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: {} }).id);
  assert.equal(done.status, 'done', done.error);
  assert.deepEqual(
    done.misses?.map((m) => [m.step, m.what, m.why]),
    [
      ['Read the story', 'blocked.example/story', 'it keeps programs out'],
      ['Ask Semantic Scholar', 'api.semanticscholar.org/graph/v1/paper/search', 'it would do more with the key S2_KEY (optional)'],
      ['Read the old page', 'down.example', 'nothing is there (404)'],
    ],
  );
  assert.equal(store.listSteps(db, done.id).find((s) => s.path === 'never')?.status, 'skipped');
  // In the run's JSON, and in what an agent that ran it hears.
  const res = await http.inject({ method: 'GET', url: `/api/apps/runs/${done.id}` });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().run.misses.length, 3);
  assert.match(missLine(done), /^It could not have 3 things \(its page lists them\): Read the story \(blocked\.example\/story\): it keeps programs out; /);
  assert.equal(missLine({ misses: [] }), '');
});

test('a call the program tries again itself and that then answers is no miss; a failed step without its own handler fails the run with one miss', async () => {
  forgetAll();
  answers.set('https://later.example/', [{ text: 'HTTP 404', isError: true, failure: { status: 404 } }, 'HTTP 200 OK\n\nthere now']);
  const program = ["let r; try { r = await ctx.tool('http_request', { url: 'https://later.example/' }); } catch { r = await ctx.tool('http_request', { url: 'https://later.example/' }); }", 'return { text: r.text };'].join('\n');
  const a = app({ name: 'Later', flow: { steps: [{ id: 'main', do: 'code', language: 'javascript', code: program }] } });
  const done = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: {} }).id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.misses, undefined, 'the second try had it');
  answers.set('https://never.example/', [{ text: 'HTTP 404', isError: true, failure: { status: 404 } }]);
  const b = app({ name: 'Never', flow: { steps: [{ id: 'main', do: 'code', language: 'javascript', code: "await ctx.tool('http_request', { url: 'https://never.example/' }, { title: 'Ask it' }); return {};" }] } });
  const failed = await ended(startRun({ app: b.id, slug: b.slug, recipe: b, source: 'web', inputs: {} }).id);
  assert.equal(failed.status, 'failed');
  assert.deepEqual(
    failed.misses?.map((m) => [m.step, m.why]),
    [['Ask it', 'nothing is there (404)']],
  );
  // Inside a Decide or At the same time, the step that failed has the miss, not the steps around it.
  const c = app({
    name: 'Nested',
    flow: {
      steps: [
        { id: 'pick', do: 'decide', rule: '1 = 1', then: [{ id: 'both', do: 'parallel', branches: [[{ id: 'ask', title: 'Ask it here', do: 'tool', tool: 'http_request', with: { url: 'https://never.example/' } }], [{ id: 'fine', do: 'tool', tool: 'web_search', with: { query: 'fine' } }]] }] },
      ],
    },
  });
  const nested = await ended(startRun({ app: c.id, slug: c.slug, recipe: c, source: 'web', inputs: {} }).id);
  assert.equal(nested.status, 'failed');
  assert.deepEqual(
    nested.misses?.map((m) => [m.step, m.why]),
    [['Ask it here', 'nothing is there (404)']],
  );
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(process.env.HYDOR_APPS_DIR!, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
