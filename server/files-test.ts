// Script tests for serving files: the part of a file a Range header asks for, as a video player asks to seek
// (and Safari to play at all). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/files-test.ts && DATA_DIR=/tmp/naget-test-files node dist/dev/files-test.js
import assert from 'node:assert/strict';
import { byteRange } from './files.ts';

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
console.log('files: 12 checks passed');
