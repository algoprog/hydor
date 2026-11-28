// Script tests for the bundle stream: a bundle written and read back (manifest, folders, files empty and large, links,
// end totals), a corrupted byte failing its hash, a void file dropped, paths that go elsewhere refused, a cut-off
// bundle refused, and the progress tap counting without changing a byte. Build and run with a scratch folder:
//   OUTDIR=dist/dev-engine node scripts/build-server.mjs server/spaces/transfer/stream-test.ts
//   HOME=/tmp/eng-home DATA_DIR=/tmp/eng-data node dist/dev-engine/stream-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { BundleError, bundleStream, readBundle, tapBundle, type BundleHandlers } from './stream.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-stream-test-')));
let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

const collect = async (s: Readable): Promise<Buffer> => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(c as Buffer);
  return Buffer.concat(parts);
};
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/** Records as the reader hands them over, with file bytes kept. */
async function read(buf: Buffer, extra: Partial<BundleHandlers> = {}) {
  const seen: any[] = [];
  const end = await readBundle(Readable.from([buf]), {
    manifest: (m) => void seen.push({ manifest: m }),
    dir: (r) => void seen.push({ dir: r }),
    link: (r) => void seen.push({ link: r }),
    async file(rec, body) {
      const data = await collect(body);
      const entry: any = { file: rec, data };
      seen.push(entry);
      return (v) => void (entry.void = v.void);
    },
    ...extra,
  });
  return { seen, end };
}

// Files to carry.
const dir = path.join(tmp, 'src');
fs.mkdirSync(dir);
const big = crypto.randomBytes(5 * 1024 * 1024 + 123);
const small = Buffer.from('hello bundle');
fs.writeFileSync(path.join(dir, 'big.bin'), big);
fs.writeFileSync(path.join(dir, 'small.txt'), small, { mode: 0o755 });
fs.writeFileSync(path.join(dir, 'empty'), '');
fs.utimesSync(path.join(dir, 'small.txt'), new Date(1_700_000_000_000), new Date(1_700_000_000_000));

async function make(): Promise<Buffer> {
  return collect(
    bundleStream(async (w) => {
      await w.manifest({ v: 1, name: 'x', n: [1, 2, 3] });
      await w.dir('folder', 'sub', { mode: 0o750, mtime: 1_600_000_000_000 });
      assert.equal(await w.file('folder', 'big.bin', path.join(dir, 'big.bin')), 'sent');
      assert.equal(await w.file('folder', 'sub/small.txt', path.join(dir, 'small.txt')), 'sent');
      assert.equal(await w.file('folder', 'empty', path.join(dir, 'empty'), { expect: null }), 'sent');
      assert.equal(await w.file('folder', 'nothing', path.join(dir, 'nothing')), 'gone');
      await w.link('folder', 'sub/ln', '../small.txt');
      await w.data('assets', 'abc', Buffer.from('picture'));
    }),
  );
}

test('a bundle round trip: manifest, folders, files (empty and several MB), links, end totals', async () => {
  const buf = await make();
  assert.equal(zlib.gunzipSync(buf).subarray(0, 15).toString(), 'HYDOR-BUNDLE 1\n');
  const { seen, end } = await read(buf);
  assert.deepEqual(seen[0], { manifest: { v: 1, name: 'x', n: [1, 2, 3] } });
  assert.deepEqual(seen[1].dir, { area: 'folder', path: 'sub', mode: 0o750, mtime: 1_600_000_000_000 });
  const files = Object.fromEntries(seen.filter((r) => r.file).map((r) => [`${r.file.area}:${r.file.path}`, r]));
  assert.equal(files['folder:big.bin'].data.length, big.length);
  assert.equal(sha(files['folder:big.bin'].data), sha(big));
  assert.deepEqual(files['folder:sub/small.txt'].data, small);
  assert.equal(files['folder:sub/small.txt'].file.mode, 0o755);
  assert.equal(files['folder:sub/small.txt'].file.mtime, 1_700_000_000_000);
  assert.equal(files['folder:empty'].data.length, 0);
  assert.equal(files['folder:empty'].file.expect, null);
  assert.deepEqual(files['assets:abc'].data, Buffer.from('picture'));
  assert.ok(Object.values(files).every((r: any) => r.void === false));
  assert.deepEqual(seen.find((r) => r.link).link, { area: 'folder', path: 'sub/ln', target: '../small.txt' });
  assert.deepEqual(end, { files: 4, bytes: big.length + small.length + 7 });
});

test('a file that nobody reads is skipped by the reader, and the next record still reads', async () => {
  const buf = await make();
  const names: string[] = [];
  const end = await readBundle(Readable.from([buf]), {
    async file(rec, body) {
      names.push(rec.path);
      if (rec.path !== 'big.bin') for await (const _ of body); // the others are read, the big one is left
    },
  });
  assert.deepEqual(names, ['big.bin', 'sub/small.txt', 'empty', 'abc']);
  assert.equal(end.files, 4);
});

test('a corrupted byte fails the hash', async () => {
  const raw = zlib.gunzipSync(await make());
  const at = raw.indexOf(small);
  assert.ok(at > 0);
  raw[at + 2] ^= 0xff;
  await assert.rejects(() => read(zlib.gzipSync(raw)), /did not arrive intact/);
});

test('a file that changed while it was read is sent void, and the reader tells the handler to drop it', async () => {
  const file = path.join(tmp, 'moving.txt');
  fs.writeFileSync(file, 'x'.repeat(2 * 1024 * 1024));
  const buf = await collect(
    bundleStream(async (w) => {
      // Touch the file while it is being read: after the first write of its body.
      const t = setInterval(() => fs.appendFileSync(file, 'y'), 1);
      try {
        assert.equal(await w.file('folder', 'moving.txt', file), 'void');
      } finally {
        clearInterval(t);
      }
      await w.file('folder', 'small.txt', path.join(dir, 'small.txt'));
    }),
  );
  const { seen, end } = await read(buf);
  const moving = seen.find((r) => r.file.path === 'moving.txt');
  assert.equal(moving.void, true);
  assert.equal(seen.find((r) => r.file.path === 'small.txt').void, false);
  // The end record counts only the files kept.
  assert.deepEqual(end, { files: 1, bytes: small.length });
});

test('a header with a path that goes elsewhere, an absolute path or an unknown area is refused (by the writer and the reader)', async () => {
  for (const bad of ['../x', 'a/../b', '/etc/passwd', 'a//b', './a', 'a/./b', 'C:/x', 'a\\b', 'a\0b', '']) {
    await assert.rejects(
      collect(bundleStream(async (w) => void (await w.dir('folder', bad, { mode: 0o755, mtime: 0 })))),
      BundleError,
      JSON.stringify(bad),
    );
  }
  await assert.rejects(collect(bundleStream(async (w) => void (await w.dir('elsewhere', 'a', { mode: 0o755, mtime: 0 })))), BundleError);
  await assert.rejects(collect(bundleStream(async (w) => void (await w.link('folder', 'a', '/etc/passwd')))), BundleError);
  await assert.rejects(collect(bundleStream(async (w) => void (await w.link('folder', 'a', '../outside')))), BundleError);
  await assert.rejects(collect(bundleStream(async (w) => void (await w.link('folder', 'a/b', '../../outside')))), BundleError);
  // A hand-made bundle with such a header: the reader refuses it too.
  const head = (h: object) => {
    const j = Buffer.from(JSON.stringify(h));
    const l = Buffer.alloc(4);
    l.writeUInt32BE(j.length);
    return Buffer.concat([l, j]);
  };
  const magic = Buffer.from('HYDOR-BUNDLE 1\n');
  for (const h of [
    { t: 'dir', area: 'folder', path: '../x', mode: 0o755, mtime: 0 },
    { t: 'dir', area: 'folder', path: '/abs', mode: 0o755, mtime: 0 },
    { t: 'dir', area: 'nope', path: 'a', mode: 0o755, mtime: 0 },
    { t: 'link', area: 'folder', path: 'a', target: '../../x' },
    { t: 'file', area: 'folder', path: 'a/../../b', size: 0, mode: 0o644, mtime: 0 },
    { t: 'mystery' },
  ]) {
    await assert.rejects(read(zlib.gzipSync(Buffer.concat([magic, head(h)]))), BundleError, JSON.stringify(h));
  }
  await assert.rejects(read(zlib.gzipSync(Buffer.from('NOT-A-BUNDLE-AT-ALL\n'))), /not a Hydor bundle/);
  // A header over 64 KB.
  await assert.rejects(read(zlib.gzipSync(Buffer.concat([magic, head({ t: 'dir', area: 'folder', path: 'a'.repeat(70_000), mode: 0, mtime: 0 })]))), BundleError);
});

test('a bundle cut short, or with the wrong totals, fails', async () => {
  const buf = await make();
  await assert.rejects(read(buf.subarray(0, buf.length - 40)));
  const raw = zlib.gunzipSync(buf);
  // Without its end record.
  const endAt = raw.lastIndexOf(Buffer.from('{"t":"end"'));
  await assert.rejects(read(zlib.gzipSync(raw.subarray(0, endAt - 4))), /ended before its end record/);
  // An end record that says more.
  const lie = Buffer.from(JSON.stringify({ t: 'end', files: 99, bytes: 1 }));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(lie.length);
  await assert.rejects(read(zlib.gzipSync(Buffer.concat([raw.subarray(0, endAt - 4), len, lie]))), /says it holds 99 files/);
});

test('reading can be cancelled', async () => {
  const ac = new AbortController();
  const buf = await make();
  await assert.rejects(
    readBundle(Readable.from([buf]), {
      async file(_r, body) {
        ac.abort();
        for await (const _ of body);
      },
    }, { signal: ac.signal }),
    /Cancelled/,
  );
});

test('a reader that goes away ends the writer', async () => {
  let threw = false;
  const s = bundleStream(async (w) => {
    try {
      for (let i = 0; i < 1000; i++) await w.file('folder', `f${i}`, path.join(dir, 'big.bin'));
    } catch {
      threw = true;
      throw new Error('stopped');
    }
  });
  await new Promise<void>((r) => s.once('data', () => r()));
  s.destroy();
  for (let i = 0; i < 100 && !threw; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(threw, 'the producer was stopped');
});

test('tapBundle passes the bytes on untouched and counts files and bytes', async () => {
  const buf = await make();
  const marks: { files: number; bytes: number }[] = [];
  // In odd pieces, as a network would.
  const pieces: Buffer[] = [];
  for (let at = 0; at < buf.length; at += 7001) pieces.push(buf.subarray(at, at + 7001));
  const out = await collect(tapBundle(Readable.from(pieces), (p) => marks.push({ ...p })));
  assert.ok(out.equals(buf), 'the bytes are the same');
  const last = marks[marks.length - 1];
  assert.deepEqual(last, { files: 4, bytes: big.length + small.length + 7 });
});

test('tapBundle goes on passing the bytes of a bundle it cannot read', async () => {
  const junk = crypto.randomBytes(50_000);
  const out = await collect(tapBundle(Readable.from([junk]), () => {}));
  assert.ok(out.equals(junk));
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} stream tests passed`);
