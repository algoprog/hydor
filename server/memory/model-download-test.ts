// Script tests for search by meaning's model download (embed.ts downloadFiles): each file whole and checked against its
// SHA-256, a download cut short going on from where it stopped, a server that sends the whole file again, a file that
// arrives wrong refused, progress told, and the mark written only when every file is there; against a stand-in server.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/memory/model-download-test.ts && DATA_DIR=/tmp/hydor-test-download node dist/dev/model-download-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { downloadFiles, MODEL_FILES, MODEL_REPO, MODEL_REVISION, type ModelFile } from './embed.ts';

const tmp = fs.mkdtempSync(path.join(process.env.DATA_DIR ?? '/tmp', 'model-download-'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const big = crypto.randomBytes(3 * 1024 * 1024 + 17);
const small = Buffer.from('{"pad_token": "<pad>"}');
const files: Record<string, Buffer> = { 'onnx/model.bin': big, 'tok.json': small };
const asked: { url: string; range?: string }[] = [];
/** How the server answers: whole files, ranges, ranges ignored, or one file's bytes changed. */
let mode: 'ok' | 'no-range' | 'wrong' = 'ok';
const server = http.createServer((req, res) => {
  asked.push({ url: req.url ?? '', range: req.headers.range });
  const name = decodeURIComponent((req.url ?? '').replace(/^\/files\//, ''));
  let body = files[name];
  if (!body) return res.writeHead(404).end();
  if (mode === 'wrong') body = Buffer.concat([body.subarray(0, body.length - 1), Buffer.from('x')]);
  const range = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
  if (range && mode !== 'no-range') {
    const from = Number(range[1]);
    res.writeHead(206, { 'content-length': body.length - from, 'content-range': `bytes ${from}-${body.length - 1}/${body.length}` });
    return res.end(body.subarray(from));
  }
  res.writeHead(200, { 'content-length': body.length });
  res.end(body);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/files/`;
const list: ModelFile[] = [
  { from: 'onnx/model.bin', name: 'model.bin', bytes: big.length, sha256: sha(big) },
  { from: 'tok.json', name: 'tok.json', bytes: small.length, sha256: sha(small) },
];
const url = (from: string) => base + from;

test('the app’s model: its files pinned to one revision, each with its size and checksum', () => {
  assert.equal(MODEL_REPO, 'algoprog/mDenseOn-ONNX');
  assert.match(MODEL_REVISION, /^[0-9a-f]{40}$/, 'a commit, so the files never change under the app');
  assert.deepEqual(
    MODEL_FILES.map((f) => f.name),
    ['model_q8.onnx', 'tokenizer.json', 'tokenizer_config.json'],
  );
  for (const f of MODEL_FILES) assert.ok(f.bytes > 0 && /^[0-9a-f]{64}$/.test(f.sha256), f.name);
});

test('every file, checked, then the mark; progress up to the whole', async () => {
  const to = path.join(tmp, 'a');
  const seen: number[] = [];
  await downloadFiles(to, list, { url, mark: 'rev1', progress: (done, total) => (assert.equal(total, big.length + small.length), seen.push(done)) });
  assert.ok(fs.readFileSync(path.join(to, 'model.bin')).equals(big));
  assert.ok(fs.readFileSync(path.join(to, 'tok.json')).equals(small));
  assert.equal(fs.readFileSync(path.join(to, '.complete'), 'utf8'), 'rev1');
  assert.equal(seen.at(-1), big.length + small.length);
  assert.ok(seen.length > 2 && seen.every((x, i) => i === 0 || x >= seen[i - 1]), 'it grows');
  assert.ok(!fs.readdirSync(to).some((n) => n.endsWith('.part')));
  // Already there: nothing asked again.
  const n = asked.length;
  await downloadFiles(to, list, { url, mark: 'rev1' });
  assert.equal(asked.length, n);
});

test('a download cut short goes on from where it stopped; a server that ignores that sends it whole again', async () => {
  const to = path.join(tmp, 'b');
  fs.mkdirSync(to, { recursive: true });
  fs.writeFileSync(path.join(to, 'model.bin.part'), big.subarray(0, 1_000_000));
  asked.length = 0;
  await downloadFiles(to, list, { url, mark: 'rev1' });
  assert.equal(asked[0].range, 'bytes=1000000-');
  assert.ok(fs.readFileSync(path.join(to, 'model.bin')).equals(big));
  const to2 = path.join(tmp, 'c');
  fs.mkdirSync(to2, { recursive: true });
  fs.writeFileSync(path.join(to2, 'model.bin.part'), big.subarray(0, 500_000));
  mode = 'no-range';
  await downloadFiles(to2, list, { url, mark: 'rev1' });
  mode = 'ok';
  assert.ok(fs.readFileSync(path.join(to2, 'model.bin')).equals(big), 'not the start twice');
});

test('a file that arrives wrong is refused, kept nowhere, and leaves no mark', async () => {
  const to = path.join(tmp, 'd');
  mode = 'wrong';
  await assert.rejects(downloadFiles(to, list, { url, mark: 'rev1' }), /did not arrive whole/);
  mode = 'ok';
  assert.deepEqual(fs.readdirSync(to), []);
  await assert.rejects(downloadFiles(path.join(tmp, 'e'), [{ ...list[1], from: 'missing.json' }], { url, mark: 'rev1' }), /HTTP 404/);
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
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
