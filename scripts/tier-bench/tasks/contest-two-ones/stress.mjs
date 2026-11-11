// Proves the reference against the brute force on random small inputs, in several size regimes.
// Run: node stress.mjs [rounds]   (compares the reference in reference/src with brute.mjs)
import { solve as brute } from './brute.mjs';
import { smallInput } from './gen.mjs';
import { solve as reference } from './reference/src/solve.mjs';

const rounds = Number(process.argv[2] || 200);
let compared = 0;
let yes = 0;
for (let seed = 1; seed <= rounds; seed++) {
  for (const mode of ['tiny', 'planted', 'nearplanted', 'dense', 'windows', 'nested']) {
    const input = smallInput(seed * 7 + mode.length, mode, 40);
    const a = brute(input);
    const b = reference(input);
    if (a !== b) {
      console.log('DISAGREE', mode, seed);
      console.log(input);
      console.log(a, b);
      process.exit(1);
    }
    const lines = a.trim().split('\n');
    compared += lines.length;
    yes += lines.filter((l) => l === 'Yes').length;
  }
}
console.log(`compared ${compared} inputs, ${yes} Yes and ${compared - yes} No, all equal`);
