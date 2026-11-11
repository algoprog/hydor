import assert from 'node:assert/strict';
import test from 'node:test';
import { solve } from '../src/solve.mjs';

test('the samples', () => {
  const samples = [['3 2', '8'], ['6 2', '126'], ['2 2', '2'], ['10 3', '145002'], ['100 998244352', '139448523']];
  for (const [input, want] of samples) assert.equal(solve(`${input}\n`).trim(), want, input);
});

// The score by the definition, for the small checks below.
function score(S) {
  let steps = 0;
  while (S.some((v) => v !== S[0])) {
    S = S.filter((v, i) => i === 0 || S[i - 1] === v);
    steps++;
  }
  return steps;
}
function direct(N, K) {
  let total = 0;
  for (let code = 0; code < K ** N; code++) {
    const S = [];
    for (let i = 0, c = code; i < N; i++, c = Math.floor(c / K)) S.push(c % K);
    total += score(S);
  }
  return String(total % 998244353);
}

test('small inputs match the definition', () => {
  for (const [N, K] of [[2, 3], [3, 3], [4, 2], [5, 3], [7, 2], [4, 6], [8, 2]]) assert.equal(solve(`${N} ${K}\n`).trim(), direct(N, K), `${N} ${K}`);
});

test('with N = 2 only the two different elements need an operation', () => {
  assert.equal(solve('2 998244352\n').trim(), String((998244352n * 998244351n) % 998244353n));
});

test('the largest input is quick', () => {
  const started = process.cpuUsage();
  solve('100 998244351\n');
  const used = process.cpuUsage(started);
  assert.ok((used.user + used.system) / 1000 < 5000);
});
