// Hidden checker for contest-gap-swaps. Run: node check.mjs <workdir>
// Every case is one input text. solve (src/solve.mjs) runs on it in a child process of its own (this file with --run),
// with a memory limit and a time limit, so a case that never answers or runs out of memory fails alone. The child
// times the call with process.cpuUsage(); the case passes when the answer is the expected text (only whitespace at the
// end may differ) and the CPU time is within the limit. The expected answers are in expected.json (made by
// gen-expected.mjs; the small ones by a brute-force search, the others by the reference).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cases } from './cases.mjs';

const self = fileURLToPath(import.meta.url);
const here = path.dirname(self);

// The limit on CPU time for the call, in seconds: the larger of 5 and 4 times what the reference needs on the
// worst case (it needs well under a second, so 5).
const CPU_LIMIT_S = 5;

// ---------- the child: runs solve on the input it is given on its input ----------
if (process.argv[2] === '--run') {
  const dir = path.resolve(process.argv[3]);
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);
  const cpu = process.cpuUsage();
  const result = solve(text);
  const used = process.cpuUsage(cpu);
  const out = JSON.stringify({ result: typeof result === 'string' ? result : null, type: typeof result, cpuMs: (used.user + used.system) / 1000 });
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

  const wallMs = 4 * CPU_LIMIT_S * 1000 + 10000;
  // A child that has used this much CPU in all (start-up, reading its input, the work) is stopped: the answer would
  // be too slow anyway, and a solution that takes minutes should not hold the checker up.
  const CPU_KILL_MS = 3 * CPU_LIMIT_S * 1000;
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
      const timer = setTimeout(() => stop(`no answer within ${wallMs / 1000} s`), wallMs);
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

  async function judge(c) {
    const want = expected[c.name];
    if (want === undefined) return 'the checker has no expected answer for this case';
    const r = await runChild(c.build());
    if (r.error) return r.error;
    if (r.result === null) return `solve returned ${r.type}, not a string`;
    if (r.result.trimEnd() !== want) return `answer ${JSON.stringify(r.result.slice(0, 60))}, expected ${want}`;
    if (r.cpuMs > CPU_LIMIT_S * 1000) return `used ${Math.round(r.cpuMs)} ms of CPU, over ${CPU_LIMIT_S * 1000} ms`;
    return '';
  }

  const results = new Array(cases.length);
  const pool = async (indexes, width) => {
    let next = 0;
    await Promise.all(
      Array.from({ length: width }, async () => {
        while (next < indexes.length) {
          const i = indexes[next++];
          try {
            results[i] = await judge(cases[i]);
          } catch (e) {
            results[i] = `the checker met ${String(e?.message ?? e).split('\n')[0]}`;
          }
        }
      }),
    );
  };
  const of = (pred) => cases.map((c, i) => (pred(c) ? i : -1)).filter((i) => i >= 0);
  await pool(of((c) => c.kind !== 'large'), 4);
  // The first large case is the plain one (random, N = 500000). A solution that gets no answer out of it within the
  // limits is not going to answer the other large cases either (they are no larger, and no harder for any method that
  // is not quadratic), so those are failed unrun, which keeps a slow solution from holding the checker up for minutes.
  const large = of((c) => c.kind === 'large');
  const first = large[0];
  await pool([first], 1);
  const noAnswer = /^(no answer|stopped after)/.test(results[first] ?? '');
  const rest = large.slice(1);
  if (noAnswer) for (const i of rest) results[i] = `not run: ${cases[first].name} got no answer within ${CPU_KILL_MS / 1000} s of CPU or ${wallMs / 1000} s`;
  else await pool(rest, 2);

  const failed = [];
  cases.forEach((c, i) => {
    if (results[i]) {
      failed.push(c.name);
      if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${results[i]}`);
    }
  });
  console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
}
