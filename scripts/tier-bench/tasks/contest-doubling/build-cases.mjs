// Makes cases/ (the small cases, answered by brute.mjs) and expected.json (SHA-256 of the reference's answer to every
// middle-sized and large case). Run it from this folder: node build-cases.mjs
// The reference is first compared with the brute force on every small case and with dp.mjs on every middle-sized
// one, so a wrong reference stops here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve as brute } from './brute.mjs';
import { solve as dp } from './dp.mjs';
import { large, mid, smallInput } from './gen.mjs';
import { solve as reference } from './reference/src/solve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(here, 'cases');
fs.rmSync(casesDir, { recursive: true, force: true });
fs.mkdirSync(casesDir);

const small = [
  ['sample-1', '2 5\n1 1\n'],
  ['sample-2', '2 4\n1 0\n'],
  ['sample-3', '1 1\n0\n'],
  ['sample-4', '3 4\n0 0 2\n'],
  ['sample-5', '4 7\n1 0 1 0\n'],
  ['edge-one-position-nothing-to-do', '1 3\n0\n'],
  ['edge-one-position-all-used', '1 4\n4\n'],
  ['edge-one-position-more-than-held', '1 6\n3\n'],
  ['edge-twenty-positions-one-operation', '20 1\n0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1\n'],
  ['edge-twenty-positions-all-zero', '20 6\n' + Array(20).fill(0).join(' ') + '\n'],
  ['edge-single-one-chain-of-twenty', '20 14\n1 ' + Array(19).fill(0).join(' ') + '\n'],
  ['edge-last-position-only', '4 12\n0 0 0 3\n'],
  ['edge-first-and-last', '5 12\n2 0 0 0 2\n'],
  ['edge-all-ones', '6 12\n1 1 1 1 1 1\n'],
];
const modes = [
  ['tiny', 4],
  ['zeros', 5],
  ['longk', 5],
  ['wide', 3],
  ['long', 3],
  ['front', 4],
];
for (const [mode, count] of modes) for (let i = 1; i <= count; i++) small.push([`random-${mode}-${i}`, smallInput(1000 * i + mode.length, mode)]);

for (const [name, input] of small) {
  const answer = brute(input);
  if (answer !== reference(input)) throw new Error(`reference and brute force disagree on ${name}`);
  fs.writeFileSync(path.join(casesDir, `${name}.in`), input);
  fs.writeFileSync(path.join(casesDir, `${name}.out`), answer);
}
console.error(`${small.length} small case files, reference equals brute on all`);

const expected = {};
for (const c of [...mid, ...large]) {
  const input = c.build();
  const started = process.cpuUsage();
  const answer = reference(input);
  const used = process.cpuUsage(started);
  const ms = (used.user + used.system) / 1000;
  let checked = '';
  if (mid.includes(c)) {
    if (dp(input) !== answer) throw new Error(`reference and the DP disagree on ${c.name}`);
    checked = ' (DP agrees)';
  }
  const values = answer.trim().split(' ');
  expected[c.name] = crypto.createHash('sha256').update(answer).digest('hex');
  console.error(`${c.name}: K=${values.length}, ${values.filter((v) => v !== '0').length} nonzero answers, ${Math.round(ms)} ms CPU${checked}`);
}
fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
