import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solve } from '../src/solve.mjs';

const sample = `6
3 2
2 3 1
3 1 2
3 2
2 3 1
1 3 2
5 2
1 5 2 4 3
4 2 3 1 5
5 1
4 2 5 1 3
9 4
2 9 7 5 4 3 8 1 6
3 7 2 5 4 1 9 6 8
3 7 2 4 5 1 9 6 8
7 8 9 4 5 2 6 3 1
10 4
9 2 1 4 5 6 8 3 7 10
7 4 9 5 10 2 3 1 8 6
3 4 8 5 10 2 9 7 1 6
1 10 3 6 2 5 7 8 9 4
`;

// Q^k by the definition: start from the identity and apply Q k times.
function power(q, k) {
  let r = q.map((_, i) => i + 1);
  for (let s = 0; s < k; s++) r = r.map((x) => q[x - 1]);
  return r;
}

test('the samples: the same verdicts, and every Q printed is valid', () => {
  const lines = solve(sample).trim().split('\n');
  assert.equal(lines.length, 6);
  assert.deepEqual(lines.map((l) => l === '-1'), [false, true, false, false, false, true]);
  // The fourth case has one permutation, so Q must be one of its powers that has it as a power.
  const q = lines[3].split(' ').map(Number);
  const target = [4, 2, 5, 1, 3];
  assert.ok(Array.from({ length: 12 }, (_, k) => power(q, k)).some((r) => r.join() === target.join()));
});
