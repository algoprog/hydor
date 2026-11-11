// Proves the reference against the brute force on small inputs in several size regimes: the verdicts must agree
// (Q exists or not), and every Q the reference prints must be valid by the judge in lib.mjs (checked directly, apart
// from the reference's own code). Run: node stress.mjs [rounds]
import { solve as brute } from './brute.mjs';
import { MODES, mixed, randomStyle } from './gen.mjs';
import { inputText, judgeLine, parseInput } from './lib.mjs';
import { solve as reference } from './reference/src/solve.mjs';

const rounds = Number(process.argv[2] || 100);
const regimes = [
  { name: 'n1-3', n: [1, 3], m: [1, 5] },
  { name: 'n4-5', n: [4, 5], m: [1, 4] },
  { name: 'n6', n: [6, 6], m: [1, 5] },
  { name: 'n7', n: [7, 7], m: [1, 4] },
  { name: 'n8', n: [8, 8], m: [1, 3] },
];
let compared = 0;
let yes = 0;
let seed = 1;
for (let r = 0; r < rounds; r++) {
  for (const reg of regimes) {
    // few tests per input for the larger n, since the brute force is slow there
    const count = reg.n[0] >= 8 ? 4 : reg.n[0] >= 7 ? 15 : 60;
    for (const style of [randomStyle, 'partition', 'composite']) {
      const tests = mixed(seed++, count, reg.n, reg.m, MODES, style);
      const input = inputText(tests);
      const a = brute(input).trim().split('\n');
      const b = reference(input).trim().split('\n');
      const parsed = parseInput(input);
      for (let i = 0; i < tests.length; i++) {
        const expectYes = a[i] !== '-1';
        if ((b[i] !== '-1') !== expectYes) {
          console.log('DISAGREE on verdict', reg.name, seed, i, 'brute', a[i], 'reference', b[i]);
          console.log(JSON.stringify(parsed[i]));
          process.exit(1);
        }
        const bad = judgeLine(b[i], parsed[i], expectYes) || judgeLine(a[i], parsed[i], expectYes);
        if (bad) {
          console.log('INVALID', bad, reg.name, seed, i, b[i]);
          console.log(JSON.stringify(parsed[i]));
          process.exit(1);
        }
        compared++;
        if (expectYes) yes++;
      }
    }
  }
}
console.log(`compared ${compared} inputs, ${yes} with a Q and ${compared - yes} without, all equal and every Q valid`);
