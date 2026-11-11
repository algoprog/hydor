// Hidden checker for slow-report. Run: node check.mjs <workdir>
// Every dataset runs buildReport in a child process of its own, with a time limit, so a program that hangs fails alone.
// Ten small datasets (correctness: the report must equal the original program's, section by section) and three of
// 300,000 rows (speed: CPU time under the limit, and the sections must equal the reference's, by hash). Expected
// reports are in expected.json (build-expected.mjs makes it).
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HEADINGS, correctnessDatasets, speedRows } from './datasets.mjs';
import { splitSections } from './sections.mjs';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const self = fileURLToPath(import.meta.url);
const here = path.dirname(self);

const CPU_LIMIT_MS = 8000;
const WALL_LIMIT_SMALL_MS = 30000;
// The speed datasets run two at a time, so a program that hangs on all three costs two rounds of this.
const WALL_LIMIT_BIG_MS = 35000;

// ---------- a child: one dataset, one line of JSON ----------
const which = process.argv.indexOf('--child');
if (which > 0) {
  const [kind, index] = [process.argv[which + 1], Number(process.argv[which + 2])];
  let result;
  try {
    const rows = kind === 'speed' ? speedRows(index + 1) : correctnessDatasets()[index].rows;
    const { buildReport } = await import(pathToFileURL(path.join(dir, 'src/report.mjs')).href);
    const before = process.cpuUsage();
    const output = await buildReport(rows);
    const used = process.cpuUsage(before);
    if (typeof output !== 'string') throw new Error(`buildReport returned ${output === null ? 'null' : typeof output}, not a string`);
    result = { ok: true, output, cpuMs: (used.user + used.system) / 1000 };
  } catch (e) {
    result = { ok: false, why: String(e?.stack ?? e).split('\n').slice(0, 2).join(' ').slice(0, 300) };
  }
  // On a line of its own, whatever the program printed before.
  // Leave once it is all written: a pipe takes a big write in pieces.
  process.stdout.write('\n' + JSON.stringify(result) + '\n', () => process.exit(0));
}

const runChild = (kind, index, ms) =>
  new Promise((resolve) => {
    execFile(process.execPath, ['--max-old-space-size=2048', self, dir, '--child', kind, String(index)], { timeout: ms, killSignal: 'SIGKILL', maxBuffer: 32 << 20 }, (error, stdout) => {
      const last = String(stdout).trim().split('\n').pop();
      try {
        const r = JSON.parse(last);
        if (typeof r.ok === 'boolean') return resolve(r);
      } catch {}
      resolve({ ok: false, why: error?.killed ? `no answer within ${ms / 1000} s` : `crashed: ${String(error?.message ?? 'no result').split('\n')[0].slice(0, 200)}` });
    });
  });

// ---------- the jobs: speed first, they take longest ----------
const expected = JSON.parse(fs.readFileSync(path.join(here, 'expected.json'), 'utf8'));
const datasets = correctnessDatasets();
const jobs = [];
for (let i = 0; i < expected.speed.length; i++) jobs.push({ kind: 'speed', index: i, ms: WALL_LIMIT_BIG_MS });
datasets.forEach((_, i) => jobs.push({ kind: 'correct', index: i, ms: WALL_LIMIT_SMALL_MS }));

const answers = new Map();
let next = 0;
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      answers.set(`${job.kind}${job.index}`, await runChild(job.kind, job.index, job.ms));
    }
  }),
);

// ---------- the cases ----------
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const firstDifference = (got, want) => {
  const a = got.split('\n');
  const b = want.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `line ${i + 1}: got ${JSON.stringify(a[i])}, expected ${JSON.stringify(b[i])}`;
  }
  return 'the texts differ';
};
const results = []; // { name, why } where why is null for a pass

const sectionCases = (prefix, answer, wanted) => {
  const got = answer.ok ? splitSections(answer.output) : null;
  HEADINGS.forEach((heading, i) => {
    const name = `${prefix}: ${heading}`;
    if (!answer.ok) return results.push({ name, why: answer.why });
    const section = got[i];
    if (section === null) return results.push({ name, why: `the heading "${heading}" is missing` });
    results.push({ name, why: wanted(i, section) });
  });
};

datasets.forEach((d, i) => {
  const answer = answers.get(`correct${i}`);
  const want = expected.correct[i];
  const prefix = `${d.label}`;
  if (d.rows.length <= 1) {
    results.push({ name: `${prefix}: the whole report`, why: !answer.ok ? answer.why : answer.output === want ? null : firstDifference(answer.output, want) });
    return;
  }
  const wantSections = splitSections(want);
  sectionCases(prefix, answer, (k, section) => (section === wantSections[k] ? null : firstDifference(section, wantSections[k])));
});

expected.speed.forEach((hashes, i) => {
  const answer = answers.get(`speed${i}`);
  const prefix = `300,000 rows #${i + 1}`;
  results.push({
    name: `${prefix}: report in under ${CPU_LIMIT_MS / 1000} s of CPU time`,
    why: !answer.ok ? answer.why : answer.cpuMs < CPU_LIMIT_MS ? null : `took ${(answer.cpuMs / 1000).toFixed(1)} s of CPU time`,
  });
  sectionCases(prefix, answer, (k, section) => (sha(section) === hashes[k] ? null : 'the section differs from the expected one'));
});

const failed = results.filter((r) => r.why !== null);
if (process.env.CHECK_VERBOSE) for (const f of failed) console.error(`FAIL ${f.name}: ${f.why}`);
console.log(JSON.stringify({ passed: results.length - failed.length, total: results.length, failed: failed.map((f) => f.name) }));
