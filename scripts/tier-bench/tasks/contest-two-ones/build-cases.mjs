// Makes cases/ (the small cases, answered by brute.mjs) and expected.json (SHA-256 of the reference's answer to every
// middle-sized and large case). Run it from this folder: node build-cases.mjs
// The reference is first compared with the brute force on every small case, and on the middle-sized and large cases
// that have few enough places for the brute force to answer them, so a wrong reference stops here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve as brute } from './brute.mjs';
import { large, mid, prng, smallInput } from './gen.mjs';
import { solve as reference } from './reference/src/solve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(here, 'cases');
fs.rmSync(casesDir, { recursive: true, force: true });
fs.mkdirSync(casesDir);

const sample = `6
3 3
1 2
2 3
1 3
10 5
1 4
3 7
6 10
1 4
2 6
2 1
1 2
4 3
1 3
3 4
2 4
4 3
1 2
3 4
1 4
5 3
1 5
1 5
1 5
`;

const caseText = (n, pairs) => [`${n} ${pairs.length}`, ...pairs.map(([l, r]) => `${l} ${r}`)].join('\n');
const all = (n) => {
  const list = [];
  for (let l = 1; l <= n; l++) for (let r = l + 1; r <= n; r++) list.push([l, r]);
  return list;
};
// Every set of intervals over n places that has at most `most` intervals.
function everySet(n, most) {
  const list = all(n);
  const cases = [];
  const rec = (from, chosen) => {
    if (chosen.length > 0) cases.push(caseText(n, chosen));
    if (chosen.length === most) return;
    for (let i = from; i < list.length; i++) rec(i + 1, [...chosen, list[i]]);
  };
  rec(0, []);
  return cases;
}
const joined = (cases) => `${cases.length}\n${cases.join('\n')}\n`;

const small = [['sample', sample]];
const modes = [
  ['tiny', 3],
  ['planted', 3],
  ['nearplanted', 5],
  ['dense', 4],
  ['windows', 4],
  ['nested', 4],
];
for (const [mode, count] of modes) for (let i = 1; i <= count; i++) small.push([`random-${mode}-${i}`, smallInput(1000 * i + mode.length, mode, 120)]);
small.push(['every-set-n3', joined(everySet(3, 3))]);
small.push(['every-set-n4', joined(everySet(4, 6))]);
small.push(['every-set-n5', joined(everySet(5, 10))]);
small.push(['every-set-n6-up-to-3-intervals', joined(everySet(6, 3))]);
small.push(['edge-two-places', joined(['2 1\n1 2', '2 3\n1 2\n1 2\n1 2'])]);
small.push(['edge-whole-range-repeated', joined([3, 4, 5, 9, 16].map((n) => caseText(n, Array.from({ length: 4 }, () => [1, n]))))]);
small.push(['edge-adjacent-pairs', joined(['4 2\n1 2\n3 4', '4 3\n1 2\n3 4\n1 4', '6 3\n1 2\n3 4\n5 6', '6 4\n1 2\n3 4\n5 6\n1 6', '5 2\n1 2\n4 5', '5 3\n1 2\n4 5\n2 4'])]);
small.push([
  'edge-nested-same-end-or-start',
  joined(['5 3\n1 5\n1 3\n2 5', '5 3\n1 5\n1 4\n1 3', '5 3\n1 5\n2 5\n3 5', '5 3\n2 4\n1 5\n3 5', '6 3\n1 6\n1 4\n3 6', '6 3\n1 6\n1 3\n4 6']),
]);
small.push(['edge-sliding-windows', joined([5, 6, 7, 8, 9, 10, 12].map((n) => caseText(n, Array.from({ length: n - 2 }, (_, i) => [i + 1, i + 3]))))]);

let compared = 0;
for (const [name, input] of small) {
  const answer = brute(input);
  if (answer !== reference(input)) throw new Error(`reference and brute force disagree on ${name}`);
  compared += answer.trim().split('\n').length;
  fs.writeFileSync(path.join(casesDir, `${name}.in`), input);
  fs.writeFileSync(path.join(casesDir, `${name}.out`), answer);
}
console.error(`${small.length} small case files, ${compared} test cases, reference equals brute on all`);

const expected = {};
for (const c of [...mid, ...large]) {
  const input = c.build();
  const started = process.cpuUsage();
  const answer = reference(input);
  const ms = (process.cpuUsage(started).user + process.cpuUsage(started).system) / 1000;
  const lines = answer.trim().split('\n');
  const yes = lines.filter((l) => l === 'Yes').length;
  let checked = '';
  if (lines.length > 1000 || input.length < 200000) {
    // Few places per test case: the brute force can answer every one of them (cases with up to 16 places).
    const first = input.split('\n')[1].split(' ').map(Number);
    if (lines.length > 1 && first[0] <= 16) {
      if (brute(input) !== answer) throw new Error(`reference and brute force disagree on ${c.name}`);
      checked = ' (brute force agrees)';
    }
  }
  expected[c.name] = crypto.createHash('sha256').update(answer).digest('hex');
  console.error(`${c.name}: ${input.length} bytes, ${lines.length} tests, ${yes} Yes, ${Math.round(ms)} ms CPU${checked}`);
}
fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
