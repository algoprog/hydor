// Script tests for Share to Hydor (server/share-target.ts, shared/share-target.ts): the share sheet's form refused
// signed out and from another site; signed in, its words, link and files kept (the files where the message box's uploads
// go, a name never leaving its folder), the start page opened with it, and what lands in the message box; too big; the
// service worker's way (answered in JSON).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/share-target-test.ts && DATA_DIR=/tmp/hydor-test-share node dist/dev/share-target-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { boxOf, SHARE_TROUBLE } from '../shared/share-target.ts';
import { HttpError } from './auth.ts';
import { MAX_SHARE, shareRoutes } from './share-target.ts';

const tmp = fs.mkdtempSync(path.join(process.env.DATA_DIR ?? '/tmp', 'share-'));
const uploads = path.join(tmp, 'uploads');
fs.mkdirSync(uploads);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const app = Fastify();
app.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
// Signed in: the app's check of its cookie, here a stand-in.
shareRoutes(app, { signedIn: (req) => req.headers.cookie === 'wa_session=good', uploads });
await app.ready();

/** A share's form as a browser sends it: multipart, with its boundary. */
async function form(fields: Record<string, string>, files: { name: string; data: Buffer | string; type?: string }[] = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append('files', new Blob([typeof f.data === 'string' ? f.data : new Uint8Array(f.data)], { type: f.type ?? 'application/octet-stream' }), f.name);
  const r = new Request('http://x/share', { method: 'POST', body: fd });
  return { payload: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type')! };
}
const share = async (f: { payload: Buffer; type: string }, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/share', payload: f.payload, headers: { 'content-type': f.type, cookie: 'wa_session=good', ...headers } });

test('signed out, a share is refused (its files never saved), and the start page says why; a form from another site is refused too', async () => {
  const f = await form({ text: 'hello' }, [{ name: 'a.txt', data: 'x' }]);
  const out = await share(f, { cookie: '' });
  assert.equal(out.statusCode, 303);
  assert.equal(out.headers.location, '/?share=signed-out');
  assert.match(SHARE_TROUBLE['signed-out'], /Sign in, then share it again/);
  const outJson = await share(f, { cookie: '', accept: 'application/json' });
  assert.equal(outJson.statusCode, 401);
  const cross = await share(f, { 'sec-fetch-site': 'cross-site' });
  assert.equal(cross.statusCode, 303);
  assert.equal(cross.headers.location, '/?share=failed');
  assert.deepEqual(fs.readdirSync(uploads), [], 'nothing saved');
  assert.equal((await app.inject({ method: 'GET', url: '/api/share/nope' })).statusCode, 404);
});

test('signed in: words, link and files kept, the files where uploads go; the start page opens with it; the box gets the words, the link and the files', async () => {
  const f = await form({ title: 'School trip letter', text: 'Can you sort out the form for Friday?', url: 'https://school.example.com/trip' }, [
    { name: 'letter.jpg', data: Buffer.from([0xff, 0xd8, 0xff]), type: 'image/jpeg' },
    { name: 'form.pdf', data: '%PDF-1.4', type: 'application/pdf' },
  ]);
  const r = await share(f, { 'sec-fetch-site': 'none' });
  assert.equal(r.statusCode, 303, r.body);
  const id = /^\/\?share=([\w-]+)$/.exec(r.headers.location as string)![1];
  const s = (await app.inject({ method: 'GET', url: `/api/share/${id}` })).json();
  assert.equal(s.title, 'School trip letter');
  assert.equal(s.url, 'https://school.example.com/trip');
  assert.deepEqual(
    s.files.map((x: { name: string; size: number }) => [x.name, x.size]),
    [
      ['letter.jpg', 3],
      ['form.pdf', 8],
    ],
  );
  for (const x of s.files) {
    assert.ok(x.path.startsWith(uploads + path.sep), 'where the message box’s uploads go');
    assert.ok(fs.existsSync(x.path));
  }
  assert.equal(path.dirname(s.files[0].path), path.dirname(s.files[1].path), 'a folder for the share');
  const box = boxOf(s);
  assert.equal(box.prompt, 'School trip letter\nCan you sort out the form for Friday?\nhttps://school.example.com/trip');
  assert.deepEqual(box.files, s.files);
});

test('the box does not say the title or the link twice when the words hold them; a link alone is the message', () => {
  assert.equal(boxOf({ title: 'Rome', text: 'Rome https://ex.com/rome', url: 'https://ex.com/rome', files: [] }).prompt, 'Rome https://ex.com/rome');
  assert.equal(boxOf({ url: 'https://ex.com/a', files: [] }).prompt, 'https://ex.com/a');
  assert.equal(boxOf({ title: 'https://ex.com/a', url: 'https://ex.com/a', files: [] }).prompt, 'https://ex.com/a');
  assert.equal(boxOf({ files: [{ path: '/x/a.png', name: 'a.png', size: 1 }] }).prompt, '');
});

test('a shared file’s name never leaves its folder; the service worker’s way answers in JSON; nothing shared is refused', async () => {
  const f = await form({}, [{ name: '../../../evil.sh', data: 'echo' }]);
  const r = await share(f, { accept: 'application/json', 'sec-fetch-site': 'same-origin' });
  assert.equal(r.statusCode, 200, r.body);
  const s = (await app.inject({ method: 'GET', url: `/api/share/${r.json().id}` })).json();
  assert.ok(s.files[0].path.startsWith(uploads + path.sep));
  assert.ok(!fs.existsSync(path.join(tmp, 'evil.sh')) && !fs.existsSync(path.join(uploads, 'evil.sh')));
  const none = await share(await form({ text: '  ' }), { accept: 'application/json' });
  assert.equal(none.statusCode, 400);
  const noneNav = await share(await form({ text: '' }));
  assert.equal(noneNav.headers.location, '/?share=failed');
});

test('a share over 25 MB of files is refused, as too big', async () => {
  const f = await form({ text: 'video' }, [{ name: 'big.mp4', data: Buffer.alloc(MAX_SHARE + 10) }]);
  const before = fs.readdirSync(uploads).length;
  const r = await share(f);
  assert.equal(r.headers.location, '/?share=too-big');
  assert.equal((await share(f, { accept: 'application/json' })).statusCode, 413);
  assert.equal(fs.readdirSync(uploads).length, before, 'nothing saved');
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
