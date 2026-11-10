// Hidden checker for page-count. Run: node check.mjs <workdir>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const load = () => import(pathToFileURL(path.join(dir, 'src/paginate.mjs')).href);
const cases = [];
const test = (name, fn) => cases.push([name, fn]);
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('pageCount: exact multiples', async () => {
  const { pageCount } = await load();
  assert.equal(pageCount(20, 10), 2);
  assert.equal(pageCount(10, 10), 1);
  assert.equal(pageCount(100, 5), 20);
});
test('pageCount: not a multiple', async () => {
  const { pageCount } = await load();
  assert.equal(pageCount(25, 10), 3);
  assert.equal(pageCount(11, 10), 2);
  assert.equal(pageCount(19, 10), 2);
});
test('pageCount: zero items need zero pages', async () => {
  const { pageCount } = await load();
  assert.equal(pageCount(0, 10), 0);
  assert.equal(pageCount(0, 1), 0);
});
test('pageCount: one item', async () => {
  const { pageCount } = await load();
  assert.equal(pageCount(1, 10), 1);
  assert.equal(pageCount(1, 1), 1);
});
test('pageCount: one item per page', async () => {
  const { pageCount } = await load();
  assert.equal(pageCount(7, 1), 7);
});
test('pageCount: argument errors', async () => {
  const { pageCount } = await load();
  for (const [t, p] of [[5, 0], [5, -1], [5, 2.5], [-1, 5], [1.5, 5], [5, NaN]]) assert.throws(() => pageCount(t, p), RangeError);
});
test('pageSlice: middle page', async () => {
  const { pageSlice } = await load();
  assert.deepEqual(pageSlice(range(25), 2, 10), range(20).slice(10));
  assert.deepEqual(pageSlice(range(25), 1, 10), range(10));
});
test('pageSlice: last page of an exact multiple', async () => {
  const { pageSlice } = await load();
  assert.deepEqual(pageSlice(range(20), 2, 10), range(20).slice(10));
  assert.deepEqual(pageSlice(range(10), 1, 10), range(10));
});
test('pageSlice: short last page', async () => {
  const { pageSlice } = await load();
  assert.deepEqual(pageSlice(range(25), 3, 10), [21, 22, 23, 24, 25]);
  assert.deepEqual(pageSlice(range(1), 1, 10), [1]);
});
test('pageSlice: pages out of range are empty', async () => {
  const { pageSlice } = await load();
  assert.deepEqual(pageSlice(range(20), 3, 10), []);
  assert.deepEqual(pageSlice(range(25), 4, 10), []);
  assert.deepEqual(pageSlice(range(25), 0, 10), []);
  assert.deepEqual(pageSlice(range(25), -1, 10), []);
  assert.deepEqual(pageSlice(range(25), 99, 10), []);
});
test('pageSlice: no items', async () => {
  const { pageSlice } = await load();
  assert.deepEqual(pageSlice([], 1, 10), []);
  assert.deepEqual(pageSlice([], 0, 10), []);
});
test('pageSlice: does not change the input and returns a new array', async () => {
  const { pageSlice } = await load();
  const items = range(5);
  const page = pageSlice(items, 1, 10);
  assert.deepEqual(items, range(5));
  assert.notEqual(page, items);
});
test('pageSlice: bad perPage', async () => {
  const { pageSlice } = await load();
  assert.throws(() => pageSlice(range(5), 1, 0), RangeError);
});

const failed = [];
for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (e) {
    failed.push(name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
