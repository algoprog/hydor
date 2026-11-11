// Proves the reference against the brute force on random small inputs in several size regimes, and against the slow
// dynamic programming (dp.mjs) on middle-sized ones.
// Run: node stress.mjs [rounds]   (compares the reference in reference/src with brute.mjs and dp.mjs)
import { solve as brute } from './brute.mjs';
import { solve as dp } from './dp.mjs';
import { midInput, smallInput } from './gen.mjs';
import { solve as reference } from './reference/src/solve.mjs';

const rounds = Number(process.argv[2] || 200);
let compared = 0;
let nonzero = 0;
for (let seed = 1; seed <= rounds; seed++) {
  for (const mode of ['tiny', 'zeros', 'longk', 'wide', 'long', 'front']) {
    const input = smallInput(seed * 7 + mode.length, mode);
    const a = brute(input);
    const b = reference(input);
    const c = dp(input);
    if (a !== b || a !== c) {
      console.log('DISAGREE', mode, seed);
      console.log(input, a, b, c);
      process.exit(1);
    }
    compared++;
    if (a.trim().split(' ').some((v) => v !== '0')) nonzero++;
  }
}
console.log(`small: compared ${compared} inputs (${nonzero} with some nonzero answer) against the brute force and the DP, all equal`);
let mids = 0;
for (let seed = 1; seed <= Math.max(10, rounds / 10); seed++) {
  const input = midInput(seed);
  if (reference(input) !== dp(input)) {
    console.log('DISAGREE mid', seed);
    console.log(input);
    process.exit(1);
  }
  mids++;
}
console.log(`middle-sized: compared ${mids} inputs against the DP, all equal`);
