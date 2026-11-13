// Script test for findMade, the documents a span of time changed under a folder (GET /api/fs/made):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/documents/made-test.ts && DATA_DIR=/tmp/hydor-test-made node dist/dev/made-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findMade } from './made.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-made-'));
const put = (rel: string, at: number, text = 'x') => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  fs.utimesSync(p, at / 1000, at / 1000);
  return p;
};
const T = 1_700_000_000_000;
const names = (list: { path: string }[]) => list.map((f) => path.relative(root, f.path));

const tests: [string, () => Promise<void>][] = [
  [
    'finds documents in the span, newest first, and leaves out other files',
    async () => {
      put('report.pdf', T + 3000, 'abcd');
      put('notes/draft.md', T + 5000);
      put('paper.TEX', T + 1000);
      put('script.py', T + 2000);
      put('picture.png', T + 2000);
      put('old.docx', T - 100_000);
      put('late.xlsx', T + 900_000);
      const list = await findMade(root, T, T + 10_000);
      assert.deepEqual(names(list), ['notes/draft.md', 'report.pdf', 'paper.TEX']);
      assert.equal(list[1].size, 4);
      assert.equal(list[1].mtime, T + 3000);
      assert.ok(list[1].born == null || list[1].born > 0);
    },
  ],
  [
    'skips hidden folders, dependency folders and symbolic links',
    async () => {
      put('.hidden/a.pdf', T + 1000);
      put('node_modules/pkg/readme.md', T + 1000);
      put('venv/b.md', T + 1000);
      put('__pycache__/c.md', T + 1000);
      put('site-packages/d.md', T + 1000);
      put('bower_components/e.md', T + 1000);
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-made-out-'));
      fs.writeFileSync(path.join(outside, 'linked.pdf'), 'x');
      fs.utimesSync(path.join(outside, 'linked.pdf'), (T + 1000) / 1000, (T + 1000) / 1000);
      fs.symlinkSync(outside, path.join(root, 'linkdir'));
      fs.symlinkSync(path.join(outside, 'linked.pdf'), path.join(root, 'linkfile.pdf'));
      const got = names(await findMade(root, T + 4000, T + 4999)).concat(names(await findMade(root, T, T + 1500)));
      assert.ok(!got.some((n) => /hidden|node_modules|venv|pycache|site-packages|bower|linked|linkdir|linkfile/.test(n)), got.join(', '));
      fs.rmSync(outside, { recursive: true, force: true });
    },
  ],
  [
    'looks at most 6 folders deep',
    async () => {
      put('a/b/c/d/e/f/six.md', T + 7000);
      put('a/b/c/d/e/f/g/seven.md', T + 7000);
      const got = names(await findMade(root, T + 6500, T + 7500));
      assert.deepEqual(got, ['a/b/c/d/e/f/six.md']);
    },
  ],
  [
    'looks at a limited number of entries',
    async () => {
      const big = path.join(root, 'big');
      fs.mkdirSync(big);
      for (let i = 0; i < 8100; i++) fs.writeFileSync(path.join(big, `f${i}.txt`), '');
      put('zzz/late.md', T + 9000);
      // Breadth first: big is read after the top folder's entries, and zzz after it, past the limit.
      assert.deepEqual(names(await findMade(root, T + 8500, T + 9500)), []);
      fs.rmSync(big, { recursive: true, force: true });
      assert.deepEqual(names(await findMade(root, T + 8500, T + 9500)), ['zzz/late.md']);
    },
  ],
  [
    'keeps at most 300 files',
    async () => {
      for (let i = 0; i < 320; i++) put(`many/m${i}.md`, T + 20_000 + i);
      const list = await findMade(path.join(root, 'many'), T + 20_000, T + 30_000);
      assert.equal(list.length, 300);
      assert.equal(path.basename(list[0].path), 'm319.md');
    },
  ],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
fs.rmSync(root, { recursive: true, force: true });
if (failed) process.exit(1);
console.log('all passed');
