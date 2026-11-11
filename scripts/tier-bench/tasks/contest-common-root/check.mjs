// Hidden checker for contest-common-root. Run: node check.mjs <workdir>
// Every case is one input for solve(input) in src/solve.mjs. Any valid Q is accepted, so this is a special judge: for
// each test in the input, the expected verdict (a Q exists or not) is known, and the printed line must be -1 when none
// exists, and otherwise a permutation Q of which every given permutation is a power (checked cycle by cycle, apart
// from anything solve does). The small cases are files in cases/ (name.in, and name.out with yes/no per test, from
// brute.mjs); the large ones are built here from a seed (gen.mjs) and their verdicts are compared by SHA-256 with
// expected.json (made by build-cases.mjs from the reference, which was proved against brute.mjs).
// solve runs in a child process of its own (this file with --run), with a memory limit, timed with process.cpuUsage()
// around the call. A case passes when every line is right within CPU_LIMIT_MS of CPU time; the wall time only has a
// generous limit (4 x the CPU limit + 10 s), the machine may be busy.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { large } from './gen.mjs';
import { inputText, judgeLine, parseInput } from './lib.mjs';

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

  // The reference takes about a second on the worst input (250000 tiny tests); 5 seconds is the limit the request names.
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

  // The reason the output is wrong, or ''. verdicts is a function from the test index to whether a Q exists, or, for the
  // large cases, null with the expected hash of the verdict string.
  const judge = async (c) => {
    const input = c.input();
    const r = await runChild(input);
    if (r.error) return r.error;
    if (r.result === null) return 'solve did not return a string';
    const lines = r.result.replace(/\s+$/, '').split('\n');
    const tests = parseInput(input);
    if (lines.length !== tests.length) return `${lines.length} lines printed for ${tests.length} tests`;
    let verdicts = '';
    for (let i = 0; i < tests.length; i++) {
      const printedNone = lines[i].trim() === '-1';
      let expectYes;
      if (c.verdicts) {
        expectYes = c.verdicts[i] === 'yes';
      } else {
        // large case: the expected verdict string is only known by its hash, so a line is judged on its own terms first:
        // a Q that is valid is a Q that exists; the hash then tells whether the -1 lines were right.
        expectYes = !printedNone;
      }
      const bad = judgeLine(lines[i], tests[i], expectYes);
      if (bad) return `test ${i + 1}: ${bad}`;
      verdicts += printedNone ? 'N' : 'Y';
    }
    if (!c.verdicts && sha(verdicts) !== c.expectedHash) return 'some test is answered -1 although a Q exists';
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
      verdicts: fs.readFileSync(path.join(casesDir, `${name}.out`), 'utf8').trim().split('\n'),
    });
  }
  for (const c of large) {
    if (expected[c.name] === undefined) throw new Error(`no expected answer for "${c.name}"`);
    cases.push({ name: c.name, input: () => inputText(c.build()), expectedHash: expected[c.name] });
  }

  const results = new Array(cases.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (next < cases.length) {
        const i = next++;
        try {
          results[i] = await judge(cases[i]);
        } catch (e) {
          results[i] = `the checker met ${String(e?.message ?? e).split('\n')[0]}`;
        }
      }
    }),
  );

  const failed = [];
  cases.forEach((c, i) => {
    if (results[i]) {
      failed.push(c.name);
      if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${results[i]}`);
    }
  });
  console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
}
