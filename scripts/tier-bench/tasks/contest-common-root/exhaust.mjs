// Compares the reference with the brute force on every pair of permutations of n elements, for n = 1..6 (a pair
// that repeats one permutation covers M = 1). Run: node exhaust.mjs
import { solve as brute } from './brute.mjs';
import { inputText, judgeLine, parseInput } from './lib.mjs';
import { solve as reference } from './reference/src/solve.mjs';

function allPerms(n) {
  const out = [];
  const rec = (cur, used) => {
    if (cur.length === n) return out.push(cur.slice());
    for (let v = 0; v < n; v++) {
      if (used[v]) continue;
      used[v] = true;
      cur.push(v);
      rec(cur, used);
      cur.pop();
      used[v] = false;
    }
  };
  rec([], []);
  return out;
}
let compared = 0;
let yes = 0;
for (let n = 1; n <= 6; n++) {
  const ps = allPerms(n);
  let tests = [];
  const flush = () => {
    if (!tests.length) return;
    const input = inputText(tests);
    const a = brute(input).trim().split('\n');
    const b = reference(input).trim().split('\n');
    const parsed = parseInput(input);
    for (let i = 0; i < tests.length; i++) {
      const ok = a[i] !== '-1';
      if ((b[i] !== '-1') !== ok) throw new Error(`verdict differs: ${JSON.stringify(parsed[i])}`);
      const bad = judgeLine(b[i], parsed[i], ok);
      if (bad) throw new Error(`${bad}: ${JSON.stringify(parsed[i])}`);
      compared++;
      if (ok) yes++;
    }
    tests = [];
  };
  for (let i = 0; i < ps.length; i++) {
    for (let j = i; j < ps.length; j++) {
      tests.push({ n, perms: [ps[i], ps[j]] });
      if (tests.length >= 20000) flush();
    }
  }
  flush();
}
console.log(`compared ${compared} pairs, ${yes} with a Q and ${compared - yes} without, all equal and every Q valid`);
