// Makes expected.json: the answer of every case. Small cases come from brute.mjs (a search from the input); medium
// cases from the reference, checked against the formula summed the slow way; large cases from the reference, which
// matched brute.mjs on every small input it was tried on. Every case's input is checked to be a valid permutation
// within the constraints first. Run: node gen-expected.mjs <workdir with src/solve.mjs: the reference laid over the seed>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { solve as brute } from './brute.mjs';
import { cases } from './cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2]);
const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);

// The answer by the slow formula: the sum of distances minus the pairs out of order, counted pair by pair.
function slow(p) {
  let total = 0;
  for (let i = 0; i < p.length; i++) {
    total += Math.abs(i + 1 - p[i]);
    for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) total--;
  }
  return total;
}

const expected = {};
for (const c of cases) {
  const input = c.build();
  const lines = input.split('\n');
  const n = Number(lines[0]);
  const p = lines[1].split(' ').map(Number);
  const seen = new Uint8Array(n + 1);
  let valid = lines.length === 3 && lines[2] === '' && n >= 2 && n <= 500000 && p.length === n;
  for (const v of p) {
    if (!(v >= 1 && v <= n) || seen[v]) valid = false;
    else seen[v] = 1;
  }
  if (!valid) throw new Error(`"${c.name}" is not a valid input`);
  const answer = solve(input).trim();
  if (c.kind === 'small') {
    if (n > 9) throw new Error(`"${c.name}" is too large for brute.mjs`);
    const b = brute(input).trim();
    if (b !== answer) throw new Error(`"${c.name}": the reference says ${answer}, brute.mjs ${b}`);
  } else if (c.kind === 'medium') {
    if (String(slow(p)) !== answer) throw new Error(`"${c.name}": the reference says ${answer}, the slow formula ${slow(p)}`);
  }
  expected[c.name] = answer;
  console.error(`${c.name}: ${answer}`);
}
fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
