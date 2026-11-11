// Hidden checker for contest-doubling. Run: node check.mjs <workdir>
// Every case is one input for solve(input) in src/solve.mjs: the small ones are files in cases/ (name.in and name.out,
// the answers made by brute.mjs), the middle-sized and large ones are built here from a seed (gen.mjs) and compared
// by SHA-256 with expected.json (made by build-cases.mjs from the reference, which was proved against brute.mjs and
// dp.mjs). solve runs in a child process of its own (this file with --run), with a memory limit, timed with
// process.cpuUsage() around the call. A case passes when the output equals the expected one, ignoring whitespace at
// the very end, within CPU_LIMIT_MS of CPU time; the wall time only has a generous limit (4 x the CPU limit + 10 s),
// the machine may be busy.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { large, mid } from './gen.mjs';

const self = fileURLToPath(import.meta.url);
const here = path.dirname(self);

// ---------- the child: runs solve on the input it is given on its input ----------
if (process.argv[2] === '--run') {
  const dir = path.resolve(process.argv[3]);
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);
  const cpu = process.cpuUsage();
  const result = solve(text);
  const used = process.cpuUsage(cpu);
  const out = JSON.stringify({ result: typeof result === 'string' ? result : null, cpuMs: (used.user + used.system) / 1000 });
  process.stdout.write(out + '\n', () => process.exit(0));
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

  // The reference needs under 0.7 s of CPU on the largest inputs; 5 seconds is the limit the request names.
  const CPU_LIMIT_MS = 5000;
  const WALL_MS = 4 * CPU_LIMIT_MS + 10000;
  // A child that has used this much CPU in all (start-up, reading its input, the work) is stopped: it is too slow
  // anyway, and a method that takes minutes should not hold the checker up.
  const CPU_KILL_MS = 12000;
  const cpuMsOf = (pid) => {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return ((Number(fields[11]) + Number(fields[12])) * 1000) / 100;
    } catch {
      return 0;
    }
  };
  const normal = (s) => s.replace(/\s+$/, '') + '\n';
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

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
      const timer = setTimeout(() => stop(`no answer within ${WALL_MS / 1000} s`), WALL_MS);
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

  const judge = async (c) => {
    const input = c.input();
    const r = await runChild(input);
    if (r.error) return r.error;
    if (r.result === null) return 'solve did not return a string';
    const got = normal(r.result);
    if (c.expectedText !== undefined ? got !== normal(c.expectedText) : sha(got) !== c.expectedHash) {
      if (c.expectedText === undefined) return 'the output differs from the expected one';
      const a = got.trim().split(' ');
      const b = normal(c.expectedText).trim().split(' ');
      const at = b.findIndex((v, i) => v !== a[i]);
      return at >= 0 ? `answer for k=${at + 1} is "${a[at] ?? ''}", expected "${b[at]}"` : `${a.length} numbers, expected ${b.length}`;
    }
    if (r.cpuMs > CPU_LIMIT_MS) return `used ${Math.round(r.cpuMs)} ms of CPU, over ${CPU_LIMIT_MS} ms`;
    return '';
  };

  const cases = [];
  const casesDir = path.join(here, 'cases');
  for (const file of fs.readdirSync(casesDir).filter((f) => f.endsWith('.in')).sort()) {
    const name = file.slice(0, -3);
    cases.push({
      name: `small: ${name}`,
      input: () => fs.readFileSync(path.join(casesDir, file), 'utf8'),
      expectedText: fs.readFileSync(path.join(casesDir, `${name}.out`), 'utf8'),
    });
  }
  for (const c of [...mid, ...large]) {
    if (expected[c.name] === undefined) throw new Error(`no expected answer for "${c.name}"`);
    cases.push({ name: c.name, input: () => c.build(), expectedHash: expected[c.name] });
  }

  // One case at a time: the timing is of CPU, but the machine is shared and memory is tight.
  const results = [];
  for (const c of cases) {
    try {
      results.push(await judge(c));
    } catch (e) {
      results.push(`the checker met ${String(e?.message ?? e).split('\n')[0]}`);
    }
  }

  const failed = [];
  cases.forEach((c, i) => {
    if (results[i]) {
      failed.push(c.name);
      if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${results[i]}`);
    }
  });
  console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
}
