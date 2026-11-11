// Makes the files the checker reads: cases/sNN.in and sNN.out for the small cases (the expected answers come from the
// brute force) and expected.json (the SHA-256 of the expected output of each large case, from the reference). It first
// proves the reference against the brute force on thousands of random small inputs, and prints how many.
// Run: node build-cases.mjs <workdir with src/solve.mjs: the reference laid over the seed>
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bruteSolve } from './brute.mjs';
import { bernoulli, everyString, formatInput, groups, large, prng, randomSmall, rules, small, str, weighted } from './gen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2]);
const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);

// ---------- the reference against the brute force ----------
let inputs = 0;
let queries = 0;
let yes = 0;
const compare = (S, T, what) => {
  const input = formatInput(S, T);
  const want = bruteSolve(input);
  const got = solve(input);
  inputs++;
  queries += T.length;
  yes += want.split('\n').filter((l) => l === 'Yes').length;
  if (want !== got) throw new Error(`the reference and the brute force disagree (${what}) on:\n${input}`);
};
{
  const r = prng(777);
  // Every string of length m as a query, for starting sets of many shapes and sizes.
  const models = [
    (m) => bernoulli(r, m, 0.5),
    (m) => bernoulli(r, m, 0.15),
    (m) => bernoulli(r, m, 0.85),
    (m) => bernoulli(r, m, r.next()),
    (m) => rules(r, m, r.int(1, 2 * m), r.next() * 0.6, 0.5),
    (m) => groups(r, m, r.int(2, 4)),
    (m) => weighted(r, m),
    (m) => weighted(r, m, r.int(0, m)),
  ];
  for (let k = 0; k < 20000; k++) {
    const m = r.int(1, 3);
    const n = r.int(1, 6);
    const mdl = models[k % models.length](m);
    compare(Array.from({ length: n }, () => str(mdl.sample())), everyString(m), 'm 1..3');
  }
  console.error(`stage 1 done at ${Math.round(process.cpuUsage().user / 1000)} ms`);
  for (let k = 0; k < 20000; k++) {
    const m = r.int(4, 8);
    const n = r.int(1, 12);
    const mdl = models[k % models.length](m);
    compare(Array.from({ length: n }, () => str(mdl.sample())), everyString(m), 'm 4..8');
  }
  console.error(`stage 2 done at ${Math.round(process.cpuUsage().user / 1000)} ms`);
  for (let k = 0; k < 1000; k++) {
    const m = 9;
    const n = r.int(1, 6);
    const mdl = models[k % models.length](m);
    compare(Array.from({ length: n }, () => str(mdl.sample())), everyString(m), 'm 9');
  }
  console.error(`stage 3 done at ${Math.round(process.cpuUsage().user / 1000)} ms`);
  // Longer strings, few queries drawn from the closure and near it (m up to 40: BigInt in the brute force). With
  // few starting strings the closure stays small enough to list.
  for (let k = 0; k < 2000; k++) {
    const m = r.int(10, 40);
    const n = r.int(1, 4);
    const S = Array.from({ length: n }, () => str(bernoulli(r, m, r.next()).sample()));
    const T = [];
    for (let i = 0; i < 40; i++) {
      const a = r.pick(S);
      const b = r.pick(S);
      const c = r.pick(S);
      const x = Array.from(a, (_, j) => (Number(a[j]) + Number(b[j]) + Number(c[j]) >= 2 ? 1 : 0));
      if (r.chance(0.3)) x[r.int(0, m - 1)] ^= 1;
      T.push(str(x));
    }
    for (const s of S) T.push(s);
    compare(S, T, 'm 10..40');
  }
}
console.error(`${Math.round(process.cpuUsage().user / 1000)} ms of CPU in the comparisons`);
console.error(`reference and brute force agree on ${inputs} random inputs (${queries} queries, ${yes} of them Yes)`);

// ---------- the small cases' files ----------
fs.mkdirSync(path.join(here, 'cases'), { recursive: true });
let smallYes = 0;
let smallTotal = 0;
small.forEach(([name, make], i) => {
  const { S, T } = make();
  const input = formatInput(S, T);
  const want = bruteSolve(input);
  if (solve(input) !== want) throw new Error(`small case "${name}": the reference and the brute force disagree`);
  const id = `s${String(i + 1).padStart(2, '0')}`;
  fs.writeFileSync(path.join(here, 'cases', `${id}.in`), input);
  fs.writeFileSync(path.join(here, 'cases', `${id}.out`), want);
  smallYes += want.split('\n').filter((l) => l === 'Yes').length;
  smallTotal += T.length;
});
console.error(`${small.length} small cases written (${smallYes} Yes of ${smallTotal} queries)`);

// ---------- the large cases' expected hashes ----------
const expected = {};
let worst = 0;
for (const [name, make] of large) {
  const { S, T } = make(prng(9000 + Object.keys(expected).length));
  const input = formatInput(S, T);
  const cpu = process.cpuUsage();
  const out = solve(input);
  const used = process.cpuUsage(cpu);
  const ms = (used.user + used.system) / 1000;
  worst = Math.max(worst, ms);
  const yesCount = out.split('\n').filter((l) => l === 'Yes').length;
  expected[name] = createHash('sha256').update(out).digest('hex');
  console.error(`${String(Math.round(ms)).padStart(5)} ms  ${String(yesCount).padStart(3)} Yes of ${T.length}  ${name}`);
}
fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
console.error(`worst reference CPU time on a large case: ${Math.round(worst)} ms`);
