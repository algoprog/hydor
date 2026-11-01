// Script tests for files: the part of a file a Range header asks for, as a video player asks to seek (and
// Safari to play at all); copies under a free name; the trash, which knows where each thing came from and
// puts it back; and folders as one .zip, read back with unzip. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/files-test.ts && DATA_DIR=/tmp/naget-test-files node dist/dev/files-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.ts';
import { byteRange, copyPath, deleteForGood, deletePath, emptyTrash, freeName, listTrash, restoreFromTrash } from './files.ts';
import { zipPlan, zipStream } from './zip.ts';

if (!config.dataDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so the trash test touches no real data.');
  process.exit(2);
}

assert.equal(byteRange(undefined, 1000), 'all');
assert.equal(byteRange('', 1000), 'all');
assert.equal(byteRange('bytes=-', 1000), 'all');
assert.equal(byteRange('items=0-1', 1000), 'all', 'another unit: the whole file');
assert.deepEqual(byteRange('bytes=0-99', 1000), { start: 0, end: 99 });
assert.deepEqual(byteRange('bytes=0-', 1000), { start: 0, end: 999 });
assert.deepEqual(byteRange('bytes=900-5000', 1000), { start: 900, end: 999 }, 'an end past the file stops at its last byte');
assert.deepEqual(byteRange('bytes=-100', 1000), { start: 900, end: 999 }, 'the last 100 bytes');
assert.deepEqual(byteRange('bytes=-5000', 1000), { start: 0, end: 999 });
assert.equal(byteRange('bytes=1000-', 1000), 'bad', 'starting past the end');
assert.equal(byteRange('bytes=50-10', 1000), 'bad');
assert.equal(byteRange('bytes=-0', 1000), 'bad');

// Copies: under a free name beside the first, a folder with all it holds, never into itself.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-files-test-'));
const w = (p: string, t = 'x') => (fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }), fs.writeFileSync(path.join(tmp, p), t));
w('a/report.pdf', 'pdf');
w('a/notes', 'no extension');
w('a/sub/deep.txt', 'deep');
w('space/report.pdf', 'theirs');
assert.equal(freeName(path.join(tmp, 'a'), 'new.txt'), path.join(tmp, 'a/new.txt'));
assert.equal(freeName(path.join(tmp, 'a'), 'report.pdf'), path.join(tmp, 'a/report copy.pdf'));
assert.equal(freeName(path.join(tmp, 'a'), 'notes'), path.join(tmp, 'a/notes copy'));
w('a/report copy.pdf');
assert.equal(freeName(path.join(tmp, 'a'), 'report.pdf'), path.join(tmp, 'a/report copy 2.pdf'));
assert.equal(freeName(tmp, 'a', true), path.join(tmp, 'a copy'), 'a folder keeps its whole name');
const into = await copyPath(path.join(tmp, 'a/report.pdf'), { into: path.join(tmp, 'space') });
assert.equal(into.path, path.join(tmp, 'space/report copy.pdf'), 'taken: a free name beside it');
assert.equal(fs.readFileSync(path.join(tmp, 'space/report.pdf'), 'utf8'), 'theirs', 'what was there stays');
const folder = await copyPath(path.join(tmp, 'a'), { into: path.join(tmp, 'space') });
assert.equal(fs.readFileSync(path.join(folder.path, 'sub/deep.txt'), 'utf8'), 'deep');
await assert.rejects(copyPath(path.join(tmp, 'a'), { to: path.join(tmp, 'a/sub/a') }), /into itself/);
await assert.rejects(copyPath(path.join(tmp, 'a/notes'), { to: path.join(tmp, 'space/report.pdf') }), /already exists/);
await assert.rejects(copyPath(path.join(tmp, 'nothing'), { into: tmp }), /Not found/);

// The trash: where each thing came from, put back there (beside what took its place), or in another folder.
await emptyTrash();
const t1 = await deletePath(path.join(tmp, 'a/notes'));
assert.ok(t1.trashed && fs.existsSync(t1.trashed) && !fs.existsSync(path.join(tmp, 'a/notes')));
await new Promise((r) => setTimeout(r, 5));
await deletePath(path.join(tmp, 'a/sub'));
let trash = await listTrash();
assert.deepEqual(
  trash.items.map((i) => [i.name, i.from, i.dir]),
  [
    ['sub', path.join(tmp, 'a/sub'), true],
    ['notes', path.join(tmp, 'a/notes'), false],
  ],
  'the last deleted first, with where it was',
);
await assert.rejects(deletePath(trash.items[0].path), /in the trash already/);
w('a/notes', 'a new one');
const back = await restoreFromTrash(trash.items[1].path);
assert.equal(back.path, path.join(tmp, 'a/notes copy'), 'its place is taken: beside it');
assert.equal(fs.readFileSync(back.path, 'utf8'), 'no extension');
const elsewhere = await restoreFromTrash(trash.items[0].path, path.join(tmp, 'space'));
assert.equal(fs.readFileSync(path.join(elsewhere.path, 'deep.txt'), 'utf8'), 'deep');
assert.equal((await listTrash()).items.length, 0);
// Something that went to the trash before the app kept where from: its name and time from its own name.
const trashDir = path.join(config.dataDir, 'trash');
fs.writeFileSync(path.join(trashDir, '2026-10-30T08-15-00-000Z-old.txt'), 'old');
trash = await listTrash();
assert.deepEqual([trash.items[0].name, trash.items[0].from, trash.items[0].at], ['old.txt', undefined, Date.parse('2026-10-30T08:15:00.000Z')]);
await assert.rejects(restoreFromTrash(trash.items[0].path), /not known/);
await assert.rejects(restoreFromTrash(path.join(tmp, 'a/report.pdf')), /not in the trash/);
await deleteForGood(trash.items[0].path);
await deletePath(path.join(tmp, 'a/report copy.pdf'));
assert.equal((await emptyTrash()).deleted, 1);
assert.equal((await listTrash()).items.length, 0);

// A zip: a folder with all it holds (but .git and node_modules) beside a file, read back by unzip.
w('z/docs/read me.md', '# Hello\n'.repeat(500));
w('z/docs/κείμενο.txt', 'unicode name');
w('z/.git/HEAD', 'ref');
w('z/node_modules/x/index.js', 'x');
fs.mkdirSync(path.join(tmp, 'z/empty'));
w('single.bin', Buffer.alloc(70_000, 7).toString('latin1'));
const plan = await zipPlan([path.join(tmp, 'z'), path.join(tmp, 'single.bin')]);
assert.equal(plan.name, `${path.basename(tmp)}.zip`, 'several: named for the folder they are in');
assert.deepEqual(
  plan.entries.map((e) => e.name),
  ['z', 'z/docs', 'z/docs/read me.md', 'z/docs/κείμενο.txt', 'z/empty', 'single.bin'],
);
assert.equal((await zipPlan([path.join(tmp, 'z')])).name, 'z.zip');
const zip = path.join(tmp, 'out.zip');
const out = fs.createWriteStream(zip);
for await (const b of zipStream(plan.entries)) out.write(b);
await new Promise((r) => out.end(r));
execFileSync('unzip', ['-tq', zip]);
const x = path.join(tmp, 'x');
execFileSync('unzip', ['-q', zip, '-d', x]);
assert.equal(fs.readFileSync(path.join(x, 'z/docs/read me.md'), 'utf8'), '# Hello\n'.repeat(500));
assert.equal(fs.readFileSync(path.join(x, 'z/docs/κείμενο.txt'), 'utf8'), 'unicode name');
assert.equal(fs.readFileSync(path.join(x, 'single.bin')).length, 70_000);
assert.ok(fs.statSync(path.join(x, 'z/empty')).isDirectory());
assert.ok(fs.statSync(zip).size < 70_000, 'deflated');
await assert.rejects(zipPlan([]), /Which files/);
await assert.rejects(zipPlan([path.join(tmp, 'nothing')]), /Not found/);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('files: copies, the trash, zips and ranges passed');
