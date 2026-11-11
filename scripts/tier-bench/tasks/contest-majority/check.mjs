// Hidden checker for contest-majority. Run: node check.mjs <workdir>
// Every case is one input for solve(input) in src/solve.mjs. The small cases are files in cases/ (sNN.in with the
// expected output in sNN.out, from the brute force that lists every string the operation can make). The large cases
// are made here from seeds (gen.mjs) and their expected outputs are stored as SHA-256 hashes in expected.json (from the
// reference, which build-cases.mjs first proves against the brute force). Each case runs solve in a child process of
// its own (this file with --run) with a memory limit and a time limit, so one that never answers fails alone. The
// output must match exactly, apart from whitespace at its very end, and the CPU time the call uses (measured in the
// child) must be within LIMIT_S seconds.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formatInput, large, prng, small } from './gen.mjs';

const self = fileURLToPath(import.meta.url);
const here = path.dirname(self);

// ---------- the child: runs solve on the input it is given on stdin ----------
if (process.argv[2] === '--run') {
  const dir = path.resolve(process.argv[3]);
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);
  const cpu = process.cpuUsage();
  const output = solve(input);
  const used = process.cpuUsage(cpu);
  process.stdout.write(JSON.stringify({ output: typeof output === 'string' ? output : null, type: typeof output, cpuMs: (used.user + used.system) / 1000 }) + '\n', () => process.exit(0));
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

  // The reference needs well under a second on the largest inputs, so the limit is the 5 seconds the request names.
  const LIMIT_S = 5;
  const WALL_MS = 4 * LIMIT_S * 1000 + 10000;
  // A child that has used this much CPU in all is stopped: its answer would be too slow anyway.
  const CPU_KILL_MS = 3 * LIMIT_S * 1000;
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
      const timer = setTimeout(() => stop(`no answer within ${WALL_MS / 1000} s`), WALL_MS);
      const watch = fs.existsSync('/proc/self/stat') ? setInterval(() => cpuMsOf(child.pid) > CPU_KILL_MS && stop(`stopped after ${CPU_KILL_MS / 1000} s of CPU without an answer`), 500) : 0;
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.stdin.on('error', () => {});
      child.on('close', () => {
        try {
          finish(JSON.parse(out.trim().split('\n').pop()));
        } catch {
          finish({ error: `it crashed or printed nothing: ${(err.trim().split('\n').find((l) => /Error/.test(l)) ?? err.trim().split('\n').pop() ?? '').slice(0, 200)}` });
        }
      });
      child.stdin.end(input);
    });

  const sameAnswer = (got, want) => got.replace(/\s+$/, '') === want.replace(/\s+$/, '');

  // Each case: { name, input, check(output) -> '' or why not }.
  const cases = [];
  small.forEach(([name], i) => {
    const id = `s${String(i + 1).padStart(2, '0')}`;
    const read = (ext) => fs.readFileSync(path.join(here, 'cases', `${id}.${ext}`), 'utf8');
    cases.push({ name, big: false, input: () => read('in'), check: (out) => (sameAnswer(out, read('out')) ? '' : 'a different answer') });
  });
  large.forEach(([name, make], i) => {
    const hash = expected[name];
    cases.push({
      name,
      big: true,
      input: () => {
        const { S, T } = make(prng(9000 + i));
        return formatInput(S, T);
      },
      check: (out) => {
        if (hash === undefined) return 'the checker has no expected hash for this case';
        // The expected output ends in one newline; compare what the solution printed with trailing whitespace dropped.
        return createHash('sha256').update(out.replace(/\s+$/, '') + '\n').digest('hex') === hash ? '' : 'a different answer';
      },
    });
  });

  async function judge(c) {
    const r = await runChild(c.input());
    if (r.error) return r.error;
    if (r.output === null) return `solve returned ${r.type}, not a string`;
    const bad = c.check(r.output);
    if (bad) return bad;
    if (r.cpuMs > LIMIT_S * 1000) return `used ${Math.round(r.cpuMs)} ms of CPU, over ${LIMIT_S * 1000} ms`;
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
  await pool(of((c) => !c.big), 4);
  // The first large case is plain random strings. A solution that gets no answer out of it within the limits is not
  // going to answer the other large cases either, so those are failed unrun, which keeps a slow solution from holding
  // the checker up for minutes.
  const first = cases.findIndex((c) => c.big);
  await pool([first], 1);
  const noAnswer = /^(no answer|stopped after)/.test(results[first] ?? '');
  const rest = of((c) => c.big).filter((i) => i !== first);
  if (noAnswer) for (const i of rest) results[i] = `not run: "${cases[first].name}" got no answer within ${CPU_KILL_MS / 1000} s of CPU`;
  await pool(noAnswer ? [] : rest, 3);

  const failed = [];
  cases.forEach((c, i) => {
    if (results[i]) {
      failed.push(c.name);
      if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${results[i]}`);
    }
  });
  console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
}
