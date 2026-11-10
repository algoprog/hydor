// Proves each task's checker: seed + reference must score 100%, the bare seed must score below 100%.
// Run: node scripts/tier-bench/tasks/verify.mjs [task-id ...]
// reference/ is laid over a copy of seed/; paths listed in reference/DELETE.txt (one per line) are removed after that.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wanted = process.argv.slice(2);
const ids = fs
  .readdirSync(here, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(here, e.name, 'check.mjs')))
  .map((e) => e.name)
  .filter((id) => wanted.length === 0 || wanted.includes(id))
  .sort();

function runCheck(id, withReference) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `tier-bench-${id}-`));
  try {
    fs.cpSync(path.join(here, id, 'seed'), work, { recursive: true });
    if (withReference) {
      const ref = path.join(here, id, 'reference');
      fs.cpSync(ref, work, { recursive: true });
      const del = path.join(work, 'DELETE.txt');
      if (fs.existsSync(del)) {
        for (const line of fs.readFileSync(del, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) fs.rmSync(path.join(work, line), { recursive: true, force: true });
        fs.rmSync(del);
      }
    }
    const started = Date.now();
    const r = spawnSync('node', [path.join(here, id, 'check.mjs'), work], { encoding: 'utf8', timeout: 120000, env: { ...process.env, CHECK_VERBOSE: '' } });
    const seconds = (Date.now() - started) / 1000;
    const last = r.stdout.trim().split('\n').pop();
    let result;
    try {
      result = JSON.parse(last);
    } catch {
      return { broken: `no JSON on the last line (exit ${r.status}): ${(r.stderr || last).slice(0, 300)}`, seconds };
    }
    if (r.status !== 0) return { broken: `exit code ${r.status}`, seconds };
    return { ...result, seconds };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

let bad = false;
const rows = [];
for (const id of ids) {
  const seed = runCheck(id, false);
  const ref = runCheck(id, true);
  const fmt = (r) => (r.broken ? 'BROKEN' : `${r.passed}/${r.total}`);
  let verdict = 'ok';
  if (seed.broken || ref.broken) verdict = 'checker broken';
  else if (ref.passed !== ref.total) verdict = `reference fails: ${ref.failed.join('; ')}`;
  else if (seed.passed === seed.total) verdict = 'seed already passes';
  if (verdict !== 'ok') bad = true;
  rows.push({ id, seed: fmt(seed), reference: fmt(ref), verdict, detail: seed.broken ?? ref.broken ?? '' });
}

const w = (k) => Math.max(k.length, ...rows.map((r) => String(r[k]).length));
const cols = ['id', 'seed', 'reference', 'verdict'];
console.log(cols.map((c) => c.padEnd(w(c))).join('  '));
console.log(cols.map((c) => '-'.repeat(w(c))).join('  '));
for (const r of rows) console.log(cols.map((c) => String(r[c]).padEnd(w(c))).join('  '));
for (const r of rows) if (r.detail) console.log(`${r.id}: ${r.detail}`);
process.exit(bad ? 1 : 0);
