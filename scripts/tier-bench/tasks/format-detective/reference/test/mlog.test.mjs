import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decode } from '../src/mlog.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples');
const names = fs.existsSync(dir) ? [...new Set(fs.readdirSync(dir).map((f) => f.replace(/\.[^.]+$/, '')))].sort() : [];

// Every sample: what mlog-dump printed, or a refusal.
for (const name of names) {
  test(`sample ${name}`, () => {
    const bytes = fs.readFileSync(path.join(dir, `${name}.mlog`));
    if (fs.existsSync(path.join(dir, `${name}.err`))) assert.throws(() => decode(bytes), Error);
    else assert.deepEqual(decode(bytes), JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')));
  });
}

const file = (...bytes) => Buffer.from(bytes);
const MLOG = [0x4d, 0x4c, 0x4f, 0x47];

test('an empty version 1 file', () => {
  assert.deepEqual(decode(file(...MLOG, 1, 0)), { version: 1, samples: [], events: [], gaps: [] });
});

test('time is a delta of delta, and a gap resets the delta', () => {
  // Samples at 100, 110, 120 (delta-of-delta 100, -90, 0), a gap of 50, then 120 + 50 + 0 + 10 = 180 (delta-of-delta 10).
  const varint = (n) => (n < 128 ? [n] : [(n % 128) | 128, ...varint(Math.floor(n / 128))]);
  const zig = (n) => varint(n >= 0 ? 2 * n : -2 * n - 1);
  const sample = (dd, value) => [0, ...zig(dd), ...zig(value)];
  const out = decode(file(...MLOG, 1, 0, ...sample(100, 1), ...sample(-90, 2), ...sample(0, 3), 0x80, 50, ...sample(10, 4)));
  assert.deepEqual(out.samples, [[100, 0, 1], [110, 0, 2], [120, 0, 3], [180, 0, 4]]);
  assert.deepEqual(out.gaps, [[120, 170]]);
});

test('a value above 32 bits', () => {
  // zigzag of 2^40 is 2^41: seven bytes of seven bits
  const out = decode(file(...MLOG, 1, 0, 0, 2, 0x80, 0x80, 0x80, 0x80, 0x80, 0x40));
  assert.deepEqual(out.samples, [[1, 0, 2 ** 40]]);
});

test('float32 is read as its exact double', () => {
  const f = Buffer.alloc(4);
  f.writeFloatLE(0.1);
  assert.deepEqual(decode(file(...MLOG, 2, 0, 0, 2, 2, ...f)).samples, [[1, 0, Math.fround(0.1)]]);
});

test('PackBits: a literal run, a repeat run and the no-op', () => {
  // The body is 00 02 00 00 | 00 00 00 00: two samples of metric 0 (times 1 and 2, value 0).
  const out = decode(file(...MLOG, 2, 2, 8, 0x80, 2, 0, 2, 0, 0xfc, 0));
  assert.deepEqual(out.samples, [[1, 0, 0], [2, 0, 0]]);
  assert.throws(() => decode(file(...MLOG, 2, 2, 9, 0x80, 2, 0, 2, 0, 0xfc, 0)), Error);
});

test('refusals', () => {
  assert.throws(() => decode(file(...MLOG, 3, 0)), Error);
  assert.throws(() => decode(file(...MLOG, 1, 8)), Error);
  assert.throws(() => decode(file(...MLOG, 1, 2)), Error);
  assert.throws(() => decode(file(0x58, 0x4c, 0x4f, 0x47, 1, 0)), Error);
  assert.throws(() => decode(file(...MLOG, 1, 0, 0xc0)), Error);
  assert.throws(() => decode(file(...MLOG, 1, 4, 0, 0, 0, 0)), Error);
  assert.throws(() => decode(file(...MLOG, 1, 0, 0, 0x80)), Error);
});
