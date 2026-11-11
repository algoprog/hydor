// Makes expected.json for check.mjs: node build-expected.mjs
// The correctness datasets' reports come from the seed's original buildReport (they have no SKU that makes its regular
// expression backtrack, so it finishes); the speed datasets' reports, as hashes of their sections, from the reference,
// which must first agree with the original on every correctness dataset.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { correctnessDatasets, speedRows } from './datasets.mjs';
import { splitSections } from './sections.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = async (dir) => (await import(pathToFileURL(path.join(here, dir, 'src/report.mjs')).href)).buildReport;
const original = await load('seed');
const reference = await load('reference');

const correct = [];
for (const d of correctnessDatasets()) {
  const expected = original(d.rows);
  if (reference(d.rows) !== expected) throw new Error(`the reference differs from the original on "${d.label}"`);
  correct.push(expected);
}
const speed = [1, 2, 3].map((kind) => splitSections(reference(speedRows(kind))).map((s) => crypto.createHash('sha256').update(s).digest('hex')));
fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify({ correct, speed }) + '\n');
console.log(`wrote expected.json: ${correct.length} reports, ${speed.length} speed datasets`);
