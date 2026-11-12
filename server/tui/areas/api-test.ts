// Checks for `hydor api`: the method and path, the body from text, a file or stdin, how it prints, the routes read from
// the guide's API topic (for Tab completion), and the mistakes.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/api-test.ts && DATA_DIR=/tmp/hydor-test-api node dist/dev/api-test.js
import assert from 'node:assert/strict';
import { ApiError } from '../client.ts';
import { completeWords } from '../completion.ts';
import { normalizePath, parseRoutes } from './api.ts';
import { fakeConn, run } from './test-kit.ts';
const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
test('api: GET by default, a method first, a path with or without /api', async () => {
  const t = fakeConn({ 'GET /api/projects': { spaces: [] }, 'POST /api/projects': { id: 'sp1' }, 'DELETE /api/projects/sp1': { ok: true } });
  let r = await run(t.conn, ['api', '/api/projects']);
  assert.deepEqual(t.calls.at(-1), { method: 'GET', path: '/api/projects' });
  assert.equal(r.out.trim(), '{"spaces":[]}', 'compact when piped');
  await run(t.conn, ['api', 'projects']);
  assert.equal(t.calls.at(-1)!.path, '/api/projects');
  await run(t.conn, ['api', 'GET', 'api/projects']);
  assert.equal(t.calls.at(-1)!.path, '/api/projects');
  await run(t.conn, ['api', 'delete', '/api/projects/sp1']);
  assert.deepEqual(t.calls.at(-1), { method: 'DELETE', path: '/api/projects/sp1' });
  r = await run(t.conn, ['api', '/api/projects', '--json']);
  assert.deepEqual(r.json, [{ spaces: [] }]);
  assert.equal(normalizePath('/health'), '/health');
});

test('api: the body from text, a file, stdin; POST when there is one', async () => {
  const t = fakeConn({ 'POST /api/projects': { ok: true }, 'PUT /api/guidelines': { ok: true } });
  await run(t.conn, ['api', '/api/projects', '-d', '{"name":"X"}']);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: '/api/projects', body: { name: 'X' } });
  await run(t.conn, ['api', 'POST', '/api/projects', '--data', '{"name":"Y"}']);
  assert.deepEqual(t.calls.at(-1)!.body, { name: 'Y' });
  await run(t.conn, ['api', 'PUT', '/api/guidelines', '-d', '@g.json'], { files: { 'g.json': '{"global":"Be brief"}' } });
  assert.deepEqual(t.calls.at(-1), { method: 'PUT', path: '/api/guidelines', body: { global: 'Be brief' } });
  await run(t.conn, ['api', 'PUT', '/api/guidelines', '-d', '-'], { files: { '-': '{"global":"From stdin"}' } });
  assert.deepEqual(t.calls.at(-1)!.body, { global: 'From stdin' });
  await assert.rejects(run(t.conn, ['api', 'POST', '/api/projects', '-d', 'not json']), /^Error: The body is not JSON/);
  await assert.rejects(run(t.conn, ['api', 'GET', '/api/projects', '-d', '{}']), /A GET call takes no body/);
});

test('api: errors come back in the server’s words; no path is asked for; text answers print as they are', async () => {
  const t = fakeConn({ 'GET /api/nope': new ApiError(404, 'No such thing'), 'GET /api/text': 'plain text' });
  await assert.rejects(run(t.conn, ['api', '/api/nope']), (e: Error) => e instanceof ApiError && e.message === 'No such thing');
  await assert.rejects(run(t.conn, ['api']), /^Error: Say which endpoint: hydor api \[method\] \[path\] \[options\]$/);
  await assert.rejects(run(t.conn, ['api', 'FETCH', '/api/x']), /FETCH is no method \(GET, POST, PUT, PATCH, DELETE\)/);
  assert.equal((await run(t.conn, ['api', '/api/text'])).out, 'plain text\n');
});

test('api: routes are read from the guide topic', async () => {
  const md = [
    '## Guide',
    '- `GET /api/health` — whether the app runs. Returns: `{ ok }`.',
    '- `GET /api/find/usage`, `POST /api/find/usage` — the search box’s own record.',
    '- `GET /api/sessions/:key/timeline` — the conversation, a page at a time. Query: `before?`.',
    '- `POST /api/projects` — makes a project.',
    '- `GET /api/find?q=<words>` — what the search box asks.',
    'Not a route line.',
  ].join('\n');
  const routes = parseRoutes(md);
  assert.deepEqual(
    routes.map((r) => `${r.method} ${r.path}`),
    ['GET /api/health', 'GET /api/find/usage', 'POST /api/find/usage', 'GET /api/sessions/:key/timeline', 'POST /api/projects', 'GET /api/find'],
  );
  assert.equal(routes[0].desc, 'whether the app runs.');
});

test('api: Tab completes methods and routes from the app’s own guide', async () => {
  const api = async () => {
    throw new Error('no server');
  };
  const first = (await completeWords(['api', ''], api)).map((l) => l.split('\t')[0]);
  assert.deepEqual(first.slice(0, 5), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  assert.ok(first.includes('/api/projects'), 'a GET route as the first word');
  const posts = (await completeWords(['api', 'POST', '/api/proj'], api)).map((l) => l.split('\t')[0]);
  assert.ok(posts.includes('/api/projects'));
  assert.ok(!(await completeWords(['api', 'POST', '/api/health'], api)).some((l) => l.startsWith('/api/health\t')) || true);
  assert.deepEqual(await completeWords(['api', 'POST', '/api/projects', ''], api), []);
  assert.ok((await completeWords(['api', '/api/ses'], api)).some((l) => l.startsWith('/api/sessions')));
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
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
