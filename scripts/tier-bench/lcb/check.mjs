// Hidden checker of a LiveCodeBench task. Run: node check.mjs <workdir>
// It grades <workdir>/solution.py with LiveCodeBench's own code (grade.py in the repository, which reads tests.json
// next to this file) and prints its result as the last line: {"passed": 1, "total": 1} when every test passes, else
// {"passed": 0, "total": 1, "failed": ["why"]}. Grading is all or nothing, as LiveCodeBench's pass@1.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// make-tasks.py writes the places of the grader and of the LiveCodeBench clone here.
const GRADE_PY = '__GRADE_PY__';
const LCB_CLONE = '__LCB_CLONE__';
// The runner stops a checker after 180 seconds; this one gives up a little before, and says so.
const LIMIT_MS = 170_000;

const here = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const solution = path.join(path.resolve(process.argv[2]), 'solution.py');
const fail = (why) => {
  console.log(JSON.stringify({ passed: 0, total: 1, failed: [why] }));
  process.exit(0);
};

if (!fs.existsSync(solution)) fail('no solution.py');
const python = process.env.LCB_PYTHON ?? 'python3';
const r = spawnSync(python, ['-I', GRADE_PY, here, solution, '--lcb', LCB_CLONE], { encoding: 'utf8', timeout: LIMIT_MS, killSignal: 'SIGKILL', maxBuffer: 8 << 20, env: { ...process.env, CUDA_VISIBLE_DEVICES: '' } });
const last = (r.stdout ?? '').trim().split('\n').pop();
if (r.error?.code === 'ETIMEDOUT') fail('grading took too long');
try {
  const result = JSON.parse(last);
  if (typeof result.passed !== 'number') throw new Error('not a result');
  console.log(JSON.stringify(result));
} catch {
  fail(`the grader failed: ${(r.stderr ?? '').trim().split('\n').slice(-3).join(' | ').slice(0, 300) || `exit ${r.status}`}`);
}
