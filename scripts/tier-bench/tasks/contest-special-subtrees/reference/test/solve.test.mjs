import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/solve.mjs';

const sample = `3
6
1 3
2 3
3 4
4 5
4 6
10
2 6
4 5
3 9
6 8
3 5
6 10
3 7
1 10
2 5
2
1 2
`;

test('sample 1', () => {
  assert.equal(solve(sample).trim(), '15\n35\n3');
});

test('a single edge: its two vertices and the edge', () => {
  assert.equal(solve('1\n2\n1 2\n').trim(), '3');
});

test('a path of four vertices: the whole path is special, a path of three is not', () => {
  // 4 vertices + 3 edges + the whole path (delete the middle edge first, then the other two).
  assert.equal(solve('1\n4\n1 2\n2 3\n3 4\n').trim(), '8');
});

test('a star with many leaves: the centre keeps at most one leaf', () => {
  const n = 1000;
  const lines = ['1', String(n)];
  for (let v = 2; v <= n; v++) lines.push(`1 ${v}`);
  // n single vertices and n - 1 single edges.
  assert.equal(solve(lines.join('\n') + '\n').trim(), String(2 * n - 1));
});

test('a long path does not overflow the stack', () => {
  const n = 200000;
  const lines = ['1', String(n)];
  for (let v = 1; v < n; v++) lines.push(`${v} ${v + 1}`);
  // A path is special exactly when it has an odd number of edges (the numbers along it go 1, 2, 1, 2, ..., 1).
  let want = n;
  for (let e = 1; e < n; e += 2) want += n - e;
  assert.equal(solve(lines.join('\n') + '\n').trim(), String(want % 998244353));
});
