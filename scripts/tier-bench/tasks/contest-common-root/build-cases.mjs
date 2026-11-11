// Builds cases/ (the small cases, answers from brute.mjs) and expected.json (the large cases, answers from the
// reference, which stress.mjs and exhaust.mjs proved against brute.mjs), and checks everything it builds:
// the reference and the brute force must agree on every small case, and every Q the reference prints is judged.
// Run: node build-cases.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve as brute } from './brute.mjs';
import { large, mixed, sample, smallHand, smallThemes } from './gen.mjs';
import { inputText, judgeLine, parseInput } from './lib.mjs';
import { solve as reference } from './reference/src/solve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'cases');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir);

const small = [['sample', null]];
for (const [name, tests] of smallHand()) small.push([name, tests]);
for (const [name, seed, count, n, m, modes, style] of smallThemes) small.push([name, mixed(seed, count, n, m, modes, style)]);

let yes = 0;
let total = 0;
for (const [name, tests] of small) {
  const input = tests === null ? sample.text : inputText(tests);
  const parsed = parseInput(input);
  const ref = reference(input).trim().split('\n');
  const want = tests === null ? sample.verdicts : brute(input).trim().split('\n').map((l) => (l === '-1' ? 'no' : 'yes'));
  if (want.length !== parsed.length) throw new Error(`${name}: wrong count`);
  for (let i = 0; i < parsed.length; i++) {
    if ((ref[i] !== '-1') !== (want[i] === 'yes')) throw new Error(`${name} test ${i + 1}: reference and ${tests === null ? 'statement' : 'brute force'} differ`);
    const bad = judgeLine(ref[i], parsed[i], want[i] === 'yes');
    if (bad) throw new Error(`${name} test ${i + 1}: ${bad}`);
    total++;
    if (want[i] === 'yes') yes++;
  }
  fs.writeFileSync(path.join(dir, `${name}.in`), input);
  fs.writeFileSync(path.join(dir, `${name}.out`), want.join('\n') + '\n');
  console.log(`${name}: ${parsed.length} tests, ${want.filter((w) => w === 'yes').length} yes`);
}
console.log(`small: ${small.length} files, ${total} tests (${yes} yes), reference agrees with the brute force on all`);

const expected = {};
let worst = 0;
for (const c of large) {
  const input = inputText(c.build());
  const parsed = parseInput(input);
  const t0 = process.cpuUsage();
  const out = reference(input);
  const ms = (({ user, system }) => (user + system) / 1000)(process.cpuUsage(t0));
  worst = Math.max(worst, ms);
  const lines = out.trim().split('\n');
  if (lines.length !== parsed.length) throw new Error(`${c.name}: wrong count`);
  let verdicts = '';
  for (let i = 0; i < parsed.length; i++) {
    const ok = lines[i] !== '-1';
    const bad = judgeLine(lines[i], parsed[i], ok);
    if (bad) throw new Error(`${c.name} test ${i + 1}: ${bad}`);
    verdicts += ok ? 'Y' : 'N';
  }
  expected[c.name] = crypto.createHash('sha256').update(verdicts).digest('hex');
  const yesCount = [...verdicts].filter((v) => v === 'Y').length;
  console.log(`${c.name}: ${parsed.length} tests, ${yesCount} yes, input ${(input.length / 1e6).toFixed(2)} MB, reference ${Math.round(ms)} ms CPU`);
}
fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
console.log(`large: ${large.length} cases, the reference took at most ${Math.round(worst)} ms of CPU`);
