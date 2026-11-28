// Script tests for the safety helpers of sending a project: safe relative paths, links that stay inside, names another system
// cannot have, free places, sizes in words, atomic writes. Build and run with a scratch folder:
//   OUTDIR=dist/dev-engine node scripts/build-server.mjs server/spaces/transfer/safe-test.ts
//   HOME=/tmp/eng-home DATA_DIR=/tmp/eng-data node dist/dev-engine/safe-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BundleError, checkArea, checkLinkTarget, isFreePlace, isSafeRel, joinSafe, linkStaysInside, moveDir, nameProblem, relParts, sizeWords, writeAtomic } from './safe.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-safe-test-')));
let passed = 0;
const ok = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve(fn()).then(
    () => (passed++, console.log(`ok   ${name}`)),
    (e) => (console.error(`FAIL ${name}\n`, e), process.exit(1)),
  );

await ok('relative paths: parts of a path that goes nowhere else', () => {
  assert.deepEqual(relParts('a/b/c.txt'), ['a', 'b', 'c.txt']);
  for (const bad of ['', '/a', 'a/', 'a//b', '.', '..', 'a/..', '../a', 'a/./b', 'C:/a', 'a\\b', 'a\0b', 'x'.repeat(5000)]) assert.throws(() => relParts(bad), BundleError, JSON.stringify(bad.slice(0, 20)));
  assert.equal(isSafeRel('ok/file'), true);
  assert.equal(isSafeRel('../no'), false);
  assert.equal(isSafeRel(42), false);
  assert.equal(joinSafe('/root', 'a/b'), path.join('/root', 'a', 'b'));
  assert.throws(() => joinSafe('/root', '../etc'), BundleError);
});

await ok('area names', () => {
  for (const a of ['folder', 'skills', 'wiki', 'media', 'assets', 'also/0', 'also/12', 'knowledge/kb12ab']) assert.equal(checkArea(a), a);
  for (const a of ['', 'also/x', 'knowledge/', 'knowledge/../x', '../folder', 'folder/x', 'FOLDER', 5]) assert.throws(() => checkArea(a), BundleError);
});

await ok('links stay inside their area, from the link’s own place', () => {
  assert.equal(linkStaysInside('a.txt', 'b.txt'), true);
  assert.equal(linkStaysInside('d/ln', '../x'), true);
  assert.equal(linkStaysInside('d/ln', '../../x'), false);
  assert.equal(linkStaysInside('ln', '../x'), false);
  assert.equal(linkStaysInside('ln', '/etc/passwd'), false);
  assert.equal(linkStaysInside('a/b/ln', '../c/../../d'), true);
  assert.equal(linkStaysInside('a/b/ln', '../../../d'), false);
  assert.throws(() => checkLinkTarget('x', ''), BundleError);
});

await ok('names Windows cannot have (only on Windows)', () => {
  for (const n of ['a:b', 'a?b', 'a*b', 'a"b', 'a<b', 'CON', 'con.txt', 'NUL', 'COM1', 'lpt9.log', 'dot.', 'space ', 'a|b']) assert.ok(nameProblem(n, 'win32'), n);
  for (const n of ['fine.txt', 'CONSOLE', 'com10', 'a b', '.hidden', 'ünï.txt']) assert.equal(nameProblem(n, 'win32'), null, n);
  assert.equal(nameProblem('a:b', 'linux'), null);
  assert.equal(nameProblem('CON', 'darwin'), null);
  assert.ok(nameProblem('', 'linux'));
});

await ok('sizes in words', () => {
  assert.equal(sizeWords(12), '12 B');
  assert.equal(sizeWords(1500), '1.5 KB');
  assert.equal(sizeWords(2_300_000_000), '2.3 GB');
  assert.equal(sizeWords(120_000_000), '120 MB');
});

await ok('free places, atomic writes and moving a folder', async () => {
  const a = path.join(tmp, 'a');
  assert.equal(isFreePlace(a), true);
  fs.mkdirSync(a);
  assert.equal(isFreePlace(a), true, 'empty');
  await writeAtomic(path.join(a, 'f'), 'one');
  assert.equal(isFreePlace(a), false);
  assert.equal(isFreePlace(path.join(a, 'f')), false, 'a file is not a place');
  await writeAtomic(path.join(a, 'f'), 'two', 0o600);
  assert.equal(fs.readFileSync(path.join(a, 'f'), 'utf8'), 'two');
  assert.deepEqual(fs.readdirSync(a), ['f'], 'no temporary name left');
  const b = path.join(tmp, 'deeper', 'b');
  fs.mkdirSync(b, { recursive: true });
  await moveDir(a, b);
  assert.equal(fs.readFileSync(path.join(b, 'f'), 'utf8'), 'two');
  assert.equal(fs.existsSync(a), false);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/6 safe tests passed`);
