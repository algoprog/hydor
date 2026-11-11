// Makes expected.json: the smallest total of every large case, found with a solution that is proved here against
// Prim's algorithm first. Run: node gen-expected.mjs <workdir with src/cabling.mjs> (the reference laid over the seed).
// Every case of 50,000 points or fewer, and every small case, is checked against Prim's algorithm; the 200,000-point
// ones are too many for it, so they rest on the solution having matched Prim on all the others.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { large, small } from './cases.mjs';
import { primTotal, treeProblem } from './prim.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2]);
const { planCables } = await import(pathToFileURL(path.join(dir, 'src/cabling.mjs')).href);

const expected = {};
for (const c of small) {
  const points = c.build();
  const answer = planCables(points);
  const bad = treeProblem(points, answer);
  if (bad || answer.total !== primTotal(points)) throw new Error(`small case "${c.name}": ${bad || `${answer.total} against ${primTotal(points)}`}`);
}
console.error(`${small.length} small cases match Prim`);
for (const c of large) {
  const points = c.build();
  if (points.length !== c.n) throw new Error(`"${c.name}" has ${points.length} points, not ${c.n}`);
  const answer = planCables(points);
  const bad = treeProblem(points, answer);
  if (bad) throw new Error(`large case "${c.name}": ${bad}`);
  if (c.n <= 50000) {
    const prim = primTotal(points);
    if (prim !== answer.total) throw new Error(`large case "${c.name}": ${answer.total} against Prim's ${prim}`);
  }
  expected[c.name] = answer.total;
  console.error(`${c.name}: ${answer.total}${c.n <= 50000 ? ' (matches Prim)' : ''}`);
}
fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
