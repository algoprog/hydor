// Script tests for what a bundle from a machine that is not trusted may write: nothing outside its staging roots, whatever
// links it carries. A chain of links whose lexical targets all stay inside (a/b → .., a/b/c → ../../x, then a file below
// them) must write nothing outside; links are made last, never below or through another link, and never over a path that has
// a file or folder of the bundle. Build and run with a scratch folder:
//   OUTDIR=dist/dev-engine node scripts/build-server.mjs server/spaces/transfer/links-test.ts
//   HOME=/tmp/eng-home DATA_DIR=/tmp/eng-data node dist/dev-engine/links-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setSettings } from '../../assistants/store.ts';
import { openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { allSpaces } from '../index.ts';
import { arrive } from './arrive.ts';
import { bundleStream, type BundleWriter } from './stream.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HOME?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HOME=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-links-test-')));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
const d = { db, broadcast() {}, sessions: { queueSummary() {} } } as unknown as Deps;

const manifest = (name: string) => ({ v: 1, from: { host: 'x', platform: 'linux', home: '/h', version: '0' }, project: { id: 'spx', name, color: 'blue', folder: '/x' }, also: [], skills: [], switches: {}, notes: [], agents: [], knowledge: [], kept: { pages: [], media: [], folders: [], assets: [] }, wiki: null, totals: { files: 9, bytes: 99 } });
const dir = (w: BundleWriter, area: string, p: string) => w.dir(area, p, { mode: 0o755, mtime: 1_700_000_000_000 });
const file = (w: BundleWriter, area: string, p: string, text = 'evil') => w.data(area, p, Buffer.from(text));

/** Every path under a folder (links not followed), relative. */
const find = (root: string): string[] => {
  const out: string[] = [];
  const go = (at: string, rel: string) => {
    for (const e of fs.readdirSync(at, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.push(r);
      if (e.isDirectory()) go(path.join(at, e.name), r);
    }
  };
  go(root, '');
  return out.sort();
};

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

/** Arrives a bundle built by `build` into sandbox/parent/dest, with a folder `x` beside the parent that must stay empty. */
async function run(name: string, build: (w: BundleWriter) => Promise<void>) {
  const sandbox = path.join(tmp, name);
  fs.mkdirSync(path.join(sandbox, 'x'), { recursive: true });
  fs.mkdirSync(path.join(process.env.DATA_DIR!, 'x'), { recursive: true });
  const dest = path.join(sandbox, 'parent', 'dest');
  const before = find(sandbox);
  const dataBefore = find(process.env.DATA_DIR!);
  const spaces = allSpaces(db).length;
  let result: Awaited<ReturnType<typeof arrive>> | null = null;
  let error: Error | null = null;
  try {
    result = await arrive(d, bundleStream(async (w) => (await w.manifest(manifest(name)), await build(w))), { folder: dest, how: 'copy', from: 'remote' });
  } catch (e) {
    error = e as Error;
  }
  const after = find(sandbox);
  // Nothing outside the destination changed, and 'evil' is nowhere but (maybe) inside it.
  const outside = after.filter((p) => !p.startsWith('parent/dest') && p !== 'parent' && p !== 'parent/dest');
  assert.deepEqual(outside, before, 'nothing was written outside the staging roots');
  assert.deepEqual(fs.readdirSync(path.join(sandbox, 'x')), [], 'the folder beside stays empty');
  assert.deepEqual(fs.readdirSync(path.join(process.env.DATA_DIR!, 'x')), [], 'the data folder’s too');
  const added = find(process.env.DATA_DIR!).filter((p) => !dataBefore.includes(p));
  assert.deepEqual(added.filter((p) => p.split('/').some((n) => n.startsWith('.hydor-') || n.startsWith('evil'))), [], 'no staging left in the data folder, and nothing evil in it');
  assert.ok(!fs.existsSync(path.join(sandbox, 'parent')) || fs.readdirSync(path.join(sandbox, 'parent')).every((n) => !n.startsWith('.hydor-')), 'no staging folder left');
  if (error) assert.equal(allSpaces(db).length, spaces, 'a failure leaves no project');
  return { result, error, dest, sandbox };
}

test('the chain: dir a, link a/b → .., link a/b/c → ../../x, then a file below them writes nothing outside', async () => {
  const { result, error, dest } = await run('chain', async (w) => {
    await dir(w, 'folder', 'a');
    await w.link('folder', 'a/b', '..');
    await w.link('folder', 'a/b/c', '../../x');
    await file(w, 'folder', 'a/b/c/evil');
    await file(w, 'folder', 'ok.txt', 'fine');
  });
  assert.equal(error, null, error?.message);
  assert.equal(fs.readFileSync(path.join(dest, 'ok.txt'), 'utf8'), 'fine');
  assert.ok(!find(dest).some((p) => p.endsWith('evil')), 'the file is not there');
  assert.ok(result!.leftOut.some((x) => x.startsWith('a/b/c/evil:')), result!.leftOut.join('; '));
  assert.ok(result!.leftOut.some((x) => x.startsWith('a/b/c:')), 'the link below a link is refused');
  // The link that stayed inside is made, last, pointing where it says (the folder itself).
  assert.equal(fs.readlinkSync(path.join(dest, 'a/b')), '..');
  assert.equal(fs.realpathSync(path.join(dest, 'a/b')), fs.realpathSync(dest));
});

test('a link made before a folder of the same prefix: the folder and what is in it are refused', async () => {
  const { result, error, dest } = await run('before', async (w) => {
    await dir(w, 'folder', 'a');
    await w.link('folder', 'a/b', '..');
    await dir(w, 'folder', 'a/b/c');
    await file(w, 'folder', 'a/b/c/evil');
    await w.link('folder', 'a/b/c/d', '../../x');
    await file(w, 'folder', 'ok.txt', 'fine');
  });
  assert.equal(error, null, error?.message);
  assert.deepEqual(find(dest), ['a', 'a/b', 'ok.txt']);
  // The folder and its file are said; the link inside the refused folder goes with it.
  assert.equal(result!.leftOut.length, 2, result!.leftOut.join('; '));
});

test('a link over a path the bundle has a folder or file at is refused, wherever it comes in the stream', async () => {
  const { result, error, dest } = await run('same', async (w) => {
    await dir(w, 'folder', 'p');
    await file(w, 'folder', 'p/f', 'inside');
    await w.link('folder', 'p', 'r');
    await file(w, 'folder', 'q/f', 'file');
    await w.link('folder', 'q/f/g', '../..');
    await w.link('folder', 'q', 'p');
    await w.link('folder', 'r', 'p');
  });
  assert.equal(error, null, error?.message);
  assert.equal(fs.readFileSync(path.join(dest, 'p/f'), 'utf8'), 'inside');
  assert.equal(fs.lstatSync(path.join(dest, 'p')).isDirectory(), true, 'p stayed a real folder');
  assert.equal(fs.lstatSync(path.join(dest, 'q')).isDirectory(), true);
  assert.equal(fs.lstatSync(path.join(dest, 'q/f')).isFile(), true);
  assert.equal(fs.readlinkSync(path.join(dest, 'r')), 'p', 'a plain link to a folder is fine');
  assert.equal(result!.leftOut.length, 3, result!.leftOut.join('; '));
});

test('a link whose target goes through another link (or out of one with ..) is refused', async () => {
  const { result, error, dest } = await run('through', async (w) => {
    await dir(w, 'folder', 'sub');
    await dir(w, 'folder', 'd');
    await w.link('folder', 'l', 'sub');
    await w.link('folder', 'm', 'l/..');
    await w.link('folder', 'd/u', '..');
    await w.link('folder', 'w', 'd/u/..');
    await w.link('folder', 'ok', 'sub');
  });
  assert.equal(error, null, error?.message);
  const names = find(dest);
  assert.ok(names.includes('l') && names.includes('d/u') && names.includes('ok'));
  assert.ok(!names.includes('m') && !names.includes('w'), 'the links that could lead out are not made');
  assert.equal(result!.leftOut.length, 2, result!.leftOut.join('; '));
});

test('the same chain in the other areas (skills, other folders) writes nothing outside their staging roots', async () => {
  for (const area of ['skills', 'also/0', 'media', 'knowledge/kb1', 'wiki']) {
    const { error } = await run(`area-${area.replace('/', '-')}`, async (w) => {
      await dir(w, area, 'a');
      await w.link(area, 'a/b', '..');
      await w.link(area, 'a/b/c', '../../x');
      await file(w, area, 'a/b/c/evil');
      await w.link(area, 'x1', 'a');
      await dir(w, area, 'x1/deep');
      await file(w, area, 'x1/deep/evil2');
    });
    assert.equal(error, null, `${area}: ${error?.message}`);
  }
});

test('a file or folder that is in the way of another (a file where a folder must be) is left out, not followed', async () => {
  const { result, error, dest } = await run('inway', async (w) => {
    await file(w, 'folder', 'a', 'a file');
    await dir(w, 'folder', 'a/b');
    await file(w, 'folder', 'a/b/evil');
    await dir(w, 'folder', 'z');
    await file(w, 'folder', 'z', 'file over folder');
    await file(w, 'folder', 'ok', 'fine');
  });
  assert.equal(error, null, error?.message);
  assert.equal(fs.readFileSync(path.join(dest, 'a'), 'utf8'), 'a file');
  assert.ok(fs.statSync(path.join(dest, 'z')).isDirectory());
  // The folder a/b and the file over the folder z are said; a/b/evil goes with its refused folder.
  assert.equal(result!.leftOut.length, 2, result!.leftOut.join('; '));
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exit(1);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} link tests passed`);
process.exit(0);
