// Hidden checker for contest-euclid. Run: node check.mjs <workdir>
// Every case is one input in the problem's format. solve(input) from <workdir>/src/solve.mjs runs on it in a child process
// of its own (this file with --run), with a memory limit and a time limit, so a case that never answers or runs out of
// memory fails alone. The answer must equal the expected output exactly, ignoring only whitespace at its end.
// The small cases are the files in cases/ (<name>.in and <name>.out, the answers made by the brute force, brute.mjs);
// the large ones are built here from a seeded generator (cases.mjs), and expected.json holds the SHA-256 of the
// reference's answers (both made by gen-cases.mjs). The child's CPU time is measured with process.cpuUsage() from before
// the module is loaded to after solve returns, and must be at most CPU_LIMIT_MS (the machine may be busy, so wall time
// only has a generous limit, and a child that has used far more CPU than that is stopped at once).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { large } from './cases.mjs';

const self = fileURLToPath(import.meta.url);
const here = path.dirname(self);
// 5 seconds of CPU, as the request says: more than four times what the reference needs on the largest inputs.
const CPU_LIMIT_MS = 5000;
const WALL_LIMIT_MS = 4 * CPU_LIMIT_MS + 10000;
// A child that has used this much CPU in all is stopped: its answer would be too slow anyway.
const CPU_KILL_MS = 2 * CPU_LIMIT_MS;

// ---------- the child: runs solve on the input it gets on stdin ----------
if (process.argv[2] === '--run') {
  const dir = path.resolve(process.argv[3]);
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const before = process.cpuUsage();
  const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);
  const result = solve(text);
  const used = process.cpuUsage(before);
  process.stdout.write(JSON.stringify({ result: typeof result === 'string' ? result : null, type: typeof result, cpuMs: (used.user + used.system) / 1000 }) + '\n', () => process.exit(0));
} else {
  await main();
}

async function main() {
  if (!process.argv[2]) {
    console.error('usage: node check.mjs <workdir>');
    process.exit(1);
  }
  const dir = path.resolve(process.argv[2]);
  const expected = JSON.parse(fs.readFileSync(path.join(here, 'expected.json'), 'utf8'));

  const cpuMsOf = (pid) => {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return ((Number(fields[11]) + Number(fields[12])) * 1000) / 100;
    } catch {
      return 0;
    }
  };

  const runChild = (input) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, ['--max-old-space-size=2048', self, '--run', dir], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(watch);
        resolve(r);
      };
      const stop = (why) => {
        child.kill('SIGKILL');
        finish({ error: why });
      };
      const timer = setTimeout(() => stop(`no answer within ${WALL_LIMIT_MS / 1000} s`), WALL_LIMIT_MS);
      const watch = fs.existsSync('/proc/self/stat') ? setInterval(() => cpuMsOf(child.pid) > CPU_KILL_MS && stop(`stopped after ${CPU_KILL_MS / 1000} s of CPU without an answer`), 500) : 0;
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.stdin.on('error', () => {});
      child.on('close', () => {
        try {
          finish(JSON.parse(out.trim().split('\n').pop()));
        } catch {
          finish({ error: `it crashed: ${(err.trim().split('\n').find((l) => /Error/.test(l)) ?? err.trim().split('\n').pop() ?? '').slice(0, 200)}` });
        }
      });
      child.stdin.end(input);
    });

  // What the first wrong line is, for the report: the line number and what was expected and got.
  const firstDifference = (got, want) => {
    const g = got.trimEnd().split('\n');
    const w = want.trimEnd().split('\n');
    if (g.length !== w.length) return `${g.length} lines, expected ${w.length}`;
    const i = g.findIndex((line, k) => line.trim() !== w[k]);
    return `line ${i + 1} is ${JSON.stringify(g[i].slice(0, 40))}, expected ${JSON.stringify(w[i])}`;
  };

  async function judge(c) {
    const input = c.input();
    const r = await runChild(input);
    if (r.error) return r.error;
    if (r.result === null) return `solve returned a ${r.type}, not a string`;
    if (c.hash) {
      if (createHash('sha256').update(r.result.trimEnd()).digest('hex') !== c.hash) return 'the answers are not the expected ones';
    } else if (r.result.trimEnd() !== c.want.trimEnd()) {
      return firstDifference(r.result, c.want);
    }
    if (r.cpuMs > CPU_LIMIT_MS) return `used ${Math.round(r.cpuMs)} ms of CPU, over ${CPU_LIMIT_MS} ms`;
    return '';
  }

  const cases = [];
  const caseDir = path.join(here, 'cases');
  for (const f of fs.readdirSync(caseDir).filter((f) => f.endsWith('.in')).sort()) {
    const stem = f.slice(0, -3);
    cases.push({
      name: `small: ${stem.replace(/^\d+-/, '').replace(/-/g, ' ')}`,
      input: () => fs.readFileSync(path.join(caseDir, f), 'utf8'),
      want: fs.readFileSync(path.join(caseDir, `${stem}.out`), 'utf8'),
    });
  }
  for (const c of large) cases.push({ name: `large: ${c.name}`, input: c.build, hash: expected[c.name] });

  // Cases run one after the other: each child may use up to 2 GB, and the machine is shared.
  const failed = [];
  for (const c of cases) {
    let why;
    try {
      why = c.hash === undefined && c.want === undefined ? 'the checker has no expected answer for this case' : await judge(c);
    } catch (e) {
      why = `the checker met ${String(e?.message ?? e).split('\n')[0]}`;
    }
    if (why) {
      failed.push(c.name);
      if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${why}`);
    }
  }
  console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
}
