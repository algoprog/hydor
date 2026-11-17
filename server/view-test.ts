// Script tests for an HTML file shown as a page (server/view.ts): its link, in a folder as deep as a project's data
// (a token longer than the router takes as a parameter), opens the page itself, sandboxed, and the files beside it and
// in its sub-folders; nothing outside the folder; a link changed or for a file that is not there.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/view-test.ts && DATA_DIR=/tmp/hydor-test-view node dist/dev/view-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { HttpError } from './auth.ts';
import { viewRoutes } from './view.ts';

fs.mkdirSync(process.env.DATA_DIR ?? '/tmp', { recursive: true });
const tmp = fs.mkdtempSync(path.join(process.env.DATA_DIR ?? '/tmp', 'view-'));
// As deep as a project's data folder (/home/you/search-agent/data/compaction/examples), and a little more.
const dir = path.join(tmp, 'home', 'someone', 'search-agent', 'data', 'compaction', 'examples');
fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
const PAGE = "<!doctype html><title>Examples</title><link rel=stylesheet href='assets/look.css'><h1>Examples</h1>";
fs.writeFileSync(path.join(dir, 'examples.html'), PAGE);
fs.writeFileSync(path.join(dir, 'assets', 'look.css'), 'h1{color:teal}');
fs.writeFileSync(path.join(dir, 'my notes é.html'), '<p>notes</p>');
fs.writeFileSync(path.join(tmp, 'secret.txt'), 'not for the page');

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const app = Fastify();
app.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
viewRoutes(app);
await app.ready();

const linkOf = async (file: string) => {
  const r = await app.inject({ method: 'POST', url: '/api/fs/view-link', payload: { path: file } });
  assert.equal(r.statusCode, 200, r.body);
  const url = r.json().url as string;
  const m = /^\/view\/([^/]+)\/([^/]+)$/.exec(url);
  assert.ok(m, url);
  return { url, token: m[1] };
};

test('a page in a deep folder opens as itself (its token longer than the 100 characters a route parameter takes), sandboxed', async () => {
  const { url, token } = await linkOf(path.join(dir, 'examples.html'));
  assert.ok(token.length > 100, `the token is ${token.length} characters: the test needs one longer than 100`);
  const r = await app.inject({ method: 'GET', url });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body, PAGE);
  assert.match(String(r.headers['content-type']), /^text\/html/);
  assert.match(String(r.headers['content-security-policy']), /^sandbox allow-scripts /);
  assert.equal(r.headers['cache-control'], 'private, no-cache');
});

test('the page loads the files beside it and in its sub-folders, and a name with spaces and accents', async () => {
  const { token } = await linkOf(path.join(dir, 'examples.html'));
  const css = await app.inject({ method: 'GET', url: `/view/${token}/assets/look.css` });
  assert.equal(css.statusCode, 200);
  assert.equal(css.body, 'h1{color:teal}');
  assert.match(String(css.headers['content-type']), /^text\/css/);
  const { url } = await linkOf(path.join(dir, 'my notes é.html'));
  const notes = await app.inject({ method: 'GET', url });
  assert.equal(notes.statusCode, 200);
  assert.equal(notes.body, '<p>notes</p>');
});

test('nothing outside its folder, however the way out is written', async () => {
  const { token } = await linkOf(path.join(dir, 'examples.html'));
  const out = path.relative(dir, path.join(tmp, 'secret.txt'));
  for (const rest of [encodeURIComponent(out), out.split('/').map(encodeURIComponent).join('%2F'), encodeURIComponent(path.join(tmp, 'secret.txt'))]) {
    const r = await app.inject({ method: 'GET', url: `/view/${token}/${rest}` });
    assert.equal(r.statusCode, 404, rest);
    assert.doesNotMatch(r.body, /not for the page/);
  }
  // The folder itself is not a file.
  assert.equal((await app.inject({ method: 'GET', url: `/view/${token}/` })).statusCode, 404);
});

test('a link that was changed, or has no token, is refused; a file that is not there is not found', async () => {
  const { token } = await linkOf(path.join(dir, 'examples.html'));
  const changed = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  const r = await app.inject({ method: 'GET', url: `/view/${changed}/examples.html` });
  assert.equal(r.statusCode, 403);
  assert.match(r.body, /expired/);
  assert.equal((await app.inject({ method: 'GET', url: `/view/${token}` })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: `/view/${token}/gone.html` })).statusCode, 404);
  const none = await app.inject({ method: 'POST', url: '/api/fs/view-link', payload: { path: path.join(dir, 'gone.html') } });
  assert.equal(none.statusCode, 404);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
