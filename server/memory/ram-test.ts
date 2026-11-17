// Checks for the memory search indexes share (ram.ts): the budget from the computer's total memory and what is free,
// the registry of what is kept (the least recently used goes first; all of it goes when memory gets short), and the
// memory limit of a control group read from its files (a container's, a service's). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/memory/ram-test.ts
//   DATA_DIR=/tmp/hydor-test-ram node dist/dev/ram-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cgroupMemory, checkRamNow, heldBytes, keep, release, searchBudget, setRamForTests, used } from './ram.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const MB = 2 ** 20;
const GB = 2 ** 30;
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-ram-test-'));
const put = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

test('the budget: a 64th of the memory, an eighth of what is free, at most 512 MB, nothing when memory is short', () => {
  const at = (total: number, free: number) => {
    setRamForTests({ total, free });
    return searchBudget();
  };
  assert.equal(at(8 * GB, 6 * GB), 128 * MB);
  assert.equal(at(8 * GB, 600 * MB), 75 * MB);
  assert.equal(at(8 * GB, 300 * MB), 0);
  assert.equal(at(64 * GB, 32 * GB), 512 * MB);
  assert.equal(at(1 * GB, 800 * MB), 16 * MB);
  assert.equal(at(1 * GB, 200 * MB), 0, 'under 256 MB free there is none, however small the computer');
  setRamForTests(null);
});

test('what is kept: the least recently used makes room, what is too big is refused, a release gives its room back', () => {
  setRamForTests({ budget: 1000 });
  const dropped: string[] = [];
  const a = keep(400, () => dropped.push('a'))!;
  const b = keep(400, () => dropped.push('b'))!;
  assert.ok(a && b);
  used(a);
  const c = keep(400, () => dropped.push('c'))!;
  assert.ok(c);
  assert.deepEqual(dropped, ['b'], 'b was used least lately');
  assert.equal(heldBytes(), 800);
  assert.equal(keep(2000, () => dropped.push('big')), null, 'more than the budget: read from the database instead');
  assert.deepEqual(dropped, ['b'], 'and nothing else went for it');
  release(a);
  assert.equal(heldBytes(), 400);
  release(c);
  release(null);
  assert.equal(heldBytes(), 0);
  setRamForTests(null);
});

test('a drop that fails does not stop the rest', () => {
  setRamForTests({ budget: 1000 });
  const dropped: string[] = [];
  keep(600, () => {
    throw new Error('boom');
  });
  keep(600, () => dropped.push('second'));
  const third = keep(600, () => dropped.push('third'))!;
  assert.deepEqual(dropped, ['second']);
  assert.equal(heldBytes(), 600);
  release(third);
  setRamForTests(null);
});

test('memory runs short: everything kept goes at the next check', async () => {
  setRamForTests({ budget: 10_000 });
  const dropped: number[] = [];
  const ks = [1, 2, 3].map((i) => keep(1000, () => dropped.push(i)));
  assert.ok(ks.every(Boolean));
  assert.equal(heldBytes(), 3000);
  await checkRamNow();
  assert.deepEqual(dropped, [], 'enough memory: nothing goes');
  setRamForTests({ budget: 0 });
  await checkRamNow();
  assert.deepEqual(dropped.sort(), [1, 2, 3]);
  assert.equal(heldBytes(), 0);
  assert.equal(keep(1, () => {}), null, 'and nothing is kept while it lasts');
  setRamForTests(null);
});

test('a control group: the tightest limit from the process’s own group up, the page cache counted as free', () => {
  const root = path.join(tmp, 'v2');
  const self = path.join(tmp, 'v2-self');
  put(self, '0::/system.slice/x.service\n');
  put(path.join(root, 'memory.max'), 'max\n');
  put(path.join(root, 'system.slice', 'x.service', 'memory.max'), 'max\n');
  put(path.join(root, 'system.slice', 'memory.max'), `${2 * GB}\n`);
  put(path.join(root, 'system.slice', 'memory.current'), `${1.5 * GB}\n`);
  put(path.join(root, 'system.slice', 'memory.stat'), `anon 1\ninactive_file ${GB / 2}\nactive_file 5\n`);
  assert.deepEqual(cgroupMemory({ root, self }), { limit: 2 * GB, free: 1 * GB });
  // A tighter one below it wins.
  put(path.join(root, 'system.slice', 'x.service', 'memory.max'), `${GB}\n`);
  put(path.join(root, 'system.slice', 'x.service', 'memory.current'), `${0.75 * GB}\n`);
  assert.deepEqual(cgroupMemory({ root, self }), { limit: GB, free: 0.25 * GB });
});

test('a control group: no limit anywhere, or nothing to read, is none', () => {
  const root = path.join(tmp, 'none');
  const self = path.join(tmp, 'none-self');
  put(self, '0::/a/b\n');
  put(path.join(root, 'a', 'b', 'memory.max'), 'max\n');
  put(path.join(root, 'a', 'memory.max'), 'max\n');
  put(path.join(root, 'memory.max'), 'max\n');
  assert.equal(cgroupMemory({ root, self }), null);
  assert.equal(cgroupMemory({ root: path.join(tmp, 'missing'), self: path.join(tmp, 'missing-self') }), null);
});

test('a control group, the older layout: a memory folder, a limit under the computer’s memory', () => {
  const root = path.join(tmp, 'v1');
  const self = path.join(tmp, 'v1-self');
  put(self, '12:cpu,cpuacct:/docker/abc\n4:memory:/docker/abc\n');
  put(path.join(root, 'memory', 'docker', 'abc', 'memory.limit_in_bytes'), `${GB}\n`);
  put(path.join(root, 'memory', 'docker', 'abc', 'memory.usage_in_bytes'), `${0.75 * GB}\n`);
  put(path.join(root, 'memory', 'docker', 'abc', 'memory.stat'), `cache 1\ntotal_inactive_file ${GB / 4}\n`);
  assert.deepEqual(cgroupMemory({ root, self }), { limit: GB, free: 0.5 * GB });
  put(path.join(root, 'memory', 'docker', 'abc', 'memory.limit_in_bytes'), `${2 ** 62}\n`);
  assert.equal(cgroupMemory({ root, self }), null, 'a limit past the computer’s memory is none');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).stack?.split('\n').slice(0, 4).join('\n     ')}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
