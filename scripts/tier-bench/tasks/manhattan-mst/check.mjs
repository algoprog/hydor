// Hidden checker for manhattan-mst. Run: node check.mjs <workdir>
// Every case is one set of points. planCables runs on it in a child process of its own (this file with --run), with a
// memory limit and a time limit, so a case that never answers or runs out of memory fails alone. The checker then
// tests the answer: the cables are a spanning tree of the points (n - 1 valid pairs that connect them all), total is
// the sum of their lengths, and total is the smallest possible. The smallest comes from Prim's algorithm run here for
// the small cases and from expected.json (made by gen-expected.mjs) for the large ones. The large cases are timed as
// well: planCables may use 5 seconds of CPU on them, measured in the child (the machine may be busy, so wall time
// only has a generous limit, and a child that has used far more CPU than that is stopped at once).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { large, small } from './cases.mjs';
import { primTotal, treeProblem } from './prim.mjs';

const self = fileURLToPath(import.meta.url);
const here = path.dirname(self);

// ---------- the child: runs planCables on the points it is given on its input ----------
if (process.argv[2] === '--run') {
  const dir = path.resolve(process.argv[3]);
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const points = JSON.parse(text);
  const { planCables } = await import(pathToFileURL(path.join(dir, 'src/cabling.mjs')).href);
  const cpu = process.cpuUsage();
  const result = planCables(points);
  const used = process.cpuUsage(cpu);
  const out = JSON.stringify({ result: result === undefined ? null : result, cpuMs: (used.user + used.system) / 1000 });
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

  const CPU_LIMIT_MS = 5000;
  // A child that has used this much CPU in all (start-up, reading its input, the work) is stopped: the answer would be
  // too slow anyway, and a solution that takes minutes should not hold the checker up.
  const CPU_KILL_MS = 9000;
  const cpuMsOf = (pid) => {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return ((Number(fields[11]) + Number(fields[12])) * 1000) / 100;
    } catch {
      return 0;
    }
  };

  const runChild = (points, wallMs, watchCpu) =>
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
      const watch = watchCpu && fs.existsSync('/proc/self/stat') ? setInterval(() => cpuMsOf(child.pid) > CPU_KILL_MS && stop(`stopped after ${CPU_KILL_MS / 1000} s of CPU without an answer`), 500) : 0;
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
      child.stdin.end(JSON.stringify(points));
    });

  async function judge(c, isLarge) {
    const points = c.build();
    const r = await runChild(points, isLarge ? 60000 : 20000, isLarge);
    if (r.error) return r.error;
    const bad = treeProblem(points, r.result);
    if (bad) return bad;
    const best = isLarge ? expected[c.name] : primTotal(points);
    if (best === undefined) return 'the checker has no expected total for this case';
    if (r.result.total !== best) return `total ${r.result.total}, but ${best} is possible`;
    if (isLarge && r.cpuMs > CPU_LIMIT_MS) return `used ${Math.round(r.cpuMs)} ms of CPU, over ${CPU_LIMIT_MS} ms`;
    return '';
  }

  const cases = [...small.map((c) => ({ ...c, isLarge: false })), ...large.map((c) => ({ ...c, isLarge: true }))];
  const results = new Array(cases.length);
  const pool = async (indexes, width) => {
    let next = 0;
    await Promise.all(
      Array.from({ length: width }, async () => {
        while (next < indexes.length) {
          const i = indexes[next++];
          try {
            results[i] = await judge(cases[i], cases[i].isLarge);
          } catch (e) {
            results[i] = `the checker met ${String(e?.message ?? e).split('\n')[0]}`;
          }
        }
      }),
    );
  };
  const of = (pred) => cases.map((c, i) => (pred(c) ? i : -1)).filter((i) => i >= 0);
  await pool(of((c) => !c.isLarge), 4);
  // The first 200,000-point case is the plain one (random sensors). A solution that gets no answer out of it within
  // the limits is not going to answer the other 200,000-point cases either (they are no larger, and no harder for any
  // method that is not quadratic), so those are failed unrun, which keeps a slow solution from holding the checker up
  // for minutes. The cases of 50,000 points or fewer always run.
  const plain = cases.findIndex((c) => c.n === 200000);
  await pool([plain], 1);
  const noAnswer = /^(no answer|stopped after)/.test(results[plain] ?? '');
  const rest = of((c) => c.isLarge && c.n === 200000).filter((i) => i !== plain);
  for (const i of noAnswer ? rest : []) results[i] = `not run: ${cases[plain].name} got no answer, within ${CPU_KILL_MS / 1000} s of CPU or 60 s`;
  await pool(of((c) => c.isLarge && c.n < 200000).concat(noAnswer ? [] : rest), 3);

  const failed = [];
  cases.forEach((c, i) => {
    if (results[i]) {
      failed.push(c.name);
      if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${results[i]}`);
    }
  });
  console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
}
