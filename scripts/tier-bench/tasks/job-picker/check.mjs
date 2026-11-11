// Hidden checker for job-picker. Run: node check.mjs <workdir>
// Every case is one instance of jobs. pickJobs runs on it in a child process of its own with a time limit (the child
// is this file with --run), so an answer that never comes fails alone. The checker then tests the answer: it is valid
// (every id from the input at most once, every job on time in that order, the profit the sum of theirs) and optimal
// (the profit equals the best profit, found here by trying every subset for the small instances and by a dynamic
// programme for the rest). Three instances of 2,000 jobs are timed as well, by the CPU time pickJobs uses.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);

// ---------- the child: runs pickJobs on the jobs it is given on its input ----------
if (process.argv[2] === '--run') {
  const dir = path.resolve(process.argv[3]);
  const freeze = process.argv[4] === 'freeze';
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const jobs = JSON.parse(text);
  const { pickJobs } = await import(pathToFileURL(path.join(dir, 'src/pick.mjs')).href);
  if (freeze) for (const j of jobs) Object.freeze(j);
  if (freeze) Object.freeze(jobs);
  const before = JSON.stringify(jobs);
  const cpu = process.cpuUsage();
  const result = pickJobs(jobs);
  const used = process.cpuUsage(cpu);
  const unchanged = JSON.stringify(jobs) === before;
  console.log(JSON.stringify({ result: result === undefined ? null : result, cpuMs: (used.user + used.system) / 1000, unchanged }));
  process.exit(0);
}

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);

// ---------- instances ----------

// A small seeded PRNG (mulberry32).
function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int, chance: (p) => next() < p };
}

const J = (id, minutes, due, profit) => ({ id, minutes, due, profit });

// A random instance. Options: n, minutes: [lo, hi], dueMax, due: 'uniform' | 'few' (a handful of due times) | 'same',
// profit: [lo, hi] | 'long' (about what the job's length is worth, plus noise) | 'short' (shorter jobs earn more),
// zero: share of zero-minute jobs, order: 'input' | 'dueDesc'.
function make(seed, o) {
  const r = prng(seed);
  const [lo, hi] = o.minutes;
  const few = Array.from({ length: o.few ?? 5 }, () => r.int(0, o.dueMax));
  let jobs = Array.from({ length: o.n }, (_, i) => {
    const minutes = r.chance(o.zero ?? 0) ? 0 : r.int(lo, hi);
    let due = r.int(0, o.dueMax);
    if (o.due === 'few') due = few[r.int(0, few.length - 1)];
    if (o.due === 'same') due = o.dueMax;
    let profit;
    if (o.profit === 'long') profit = minutes * 3 + r.int(-hi, hi);
    else if (o.profit === 'short') profit = Math.max(1, (hi - minutes) * 3 + r.int(0, hi));
    else profit = r.int(o.profit[0], o.profit[1]);
    return J(`j${i}`, minutes, due, profit);
  });
  if (o.order === 'dueDesc') jobs = jobs.sort((a, b) => b.due - a.due);
  return jobs;
}

// ---------- the optimum ----------

// The best profit by trying every subset (small instances): depth first over the jobs by due time, keeping the time used.
function brute(jobs) {
  const sorted = [...jobs].sort((a, b) => a.due - b.due);
  let best = 0;
  const go = (i, time, profit) => {
    if (i === sorted.length) {
      if (profit > best) best = profit;
      return;
    }
    go(i + 1, time, profit);
    const j = sorted[i];
    if (time + j.minutes <= j.due) go(i + 1, time + j.minutes, profit + j.profit);
  };
  go(0, 0, 0);
  return best;
}

// The best profit by a dynamic programme over the time used, jobs by due time (the instances' own sizes: 2,000 jobs
// and 20,000 minutes is 40 million steps). It tracks the time a set uses, up to the most it can reach.
function optimum(jobs) {
  const sorted = jobs.filter((j) => j.profit > 0 && j.minutes <= j.due).sort((a, b) => a.due - b.due);
  let total = 0;
  for (const j of sorted) total += j.minutes;
  const horizon = sorted.length ? Math.min(total, sorted[sorted.length - 1].due) : 0;
  const best = new Float64Array(horizon + 1).fill(-Infinity);
  best[0] = 0;
  let reach = 0;
  for (const j of sorted) {
    reach = Math.min(horizon, reach + j.minutes);
    for (let t = Math.min(j.due, reach); t >= j.minutes; t--) if (best[t - j.minutes] + j.profit > best[t]) best[t] = best[t - j.minutes] + j.profit;
  }
  let top = 0;
  for (const v of best) if (v > top) top = v;
  return top;
}

// ---------- the cases ----------
const cases = [];
// kind: 'small' (checked against trying every subset), 'big' (against the dynamic programme), 'speed' (CPU time too).
function add(name, kind, jobs, extra = {}) {
  cases.push({ name, kind, jobs, ...extra });
}

add('empty list', 'small', []);
add('one job that ends exactly at its due time', 'small', [J('a', 5, 5, 7)]);
add('one job a minute too long for its due time', 'small', [J('a', 6, 5, 7)]);
add('one job with a negative profit', 'small', [J('a', 1, 5, -7)]);
add('jobs due at minute 0: only zero-minute ones can be on time', 'small', [J('a', 0, 0, 4), J('b', 1, 0, 100), J('c', 0, 0, 3), J('d', 2, 5, 1)]);
add('only one of several jobs that fill the whole time up to the same due', 'small', [J('a', 10, 10, 4), J('b', 10, 10, 9), J('c', 10, 10, 6), J('d', 10, 10, 8)]);
add('a long high-profit job that crowds out four cheaper ones that earn more together', 'small', [J('big', 10, 10, 10), J('a', 2, 10, 3), J('b', 3, 10, 3), J('c', 2, 10, 3), J('d', 3, 10, 3)]);
add('a long job and two shorter ones with earlier due times that earn more than it', 'small', [J('long', 8, 8, 20), J('b', 4, 4, 11), J('c', 4, 8, 11)]);
add('one valuable job against many cheap ones: more jobs on time is not more profit', 'small', [J('a', 2, 10, 1), J('b', 2, 10, 1), J('c', 2, 10, 1), J('d', 2, 10, 1), J('e', 2, 10, 1), J('prize', 10, 10, 50)]);
add('the best profit per minute fills the time badly', 'small', [J('a', 6, 10, 10), J('b', 5, 10, 8), J('c', 5, 10, 8)]);
add('jobs listed latest due first, all of them fit when run by due time', 'small', [J('a', 5, 20, 9), J('b', 5, 10, 8), J('c', 5, 5, 7), J('d', 5, 15, 6)]);
add('twelve identical jobs, three fit', 'small', Array.from({ length: 12 }, (_, i) => J(`dup${i}`, 3, 10, 4)));
add('every job fits: the sum of the profits above zero', 'small', [J('a', 3, 100, 5), J('b', 4, 100, 0), J('c', 5, 100, -2), J('d', 6, 100, 7), J('e', 0, 0, 2)]);
add('every profit is zero or negative', 'small', [J('a', 1, 10, 0), J('b', 2, 10, -1), J('c', 3, 10, -5), J('d', 0, 10, 0)]);
add('ids that are numbers as text, and names an object already has', 'small', [J('10', 2, 4, 5), J('2', 2, 4, 6), J('1', 2, 6, 4), J('constructor', 3, 6, 5), J('__proto__', 2, 7, 4), J('toString', 1, 2, 3), J('hasOwnProperty', 4, 12, 9)]);
add('profits too big for 32 bits', 'small', Array.from({ length: 10 }, (_, i) => J(`j${i}`, 1 + (i % 3), 6, 2e9 + i)));
add('leaves the jobs it is given as they were (frozen, so it throws if it sorts them in place)', 'small', [J('b', 5, 9, 4), J('a', 3, 4, 2), J('c', 4, 12, 7), J('d', 1, 5, 3)], { freeze: true });

const smallRandom = [
  ['loose: nearly everything fits', { n: 14, minutes: [1, 5], dueMax: 80, profit: [1, 20] }],
  ['tight: about a third fits', { n: 15, minutes: [2, 12], dueMax: 40, profit: [1, 30] }],
  ['very tight', { n: 16, minutes: [3, 15], dueMax: 20, profit: [1, 30] }],
  ['one shared due time, a plain knapsack', { n: 16, minutes: [1, 12], dueMax: 30, due: 'same', profit: [1, 25] }],
  ['three due times', { n: 16, minutes: [1, 10], dueMax: 30, due: 'few', few: 3, profit: [1, 25] }],
  ['profit about proportional to length', { n: 16, minutes: [1, 14], dueMax: 45, profit: 'long' }],
  ['shorter jobs earn more', { n: 16, minutes: [1, 14], dueMax: 45, profit: 'short' }],
  ['listed latest due first', { n: 16, minutes: [1, 10], dueMax: 50, profit: [1, 30], order: 'dueDesc' }],
  ['zero-minute jobs mixed in', { n: 16, minutes: [0, 9], dueMax: 30, zero: 0.4, profit: [1, 15] }],
  ['profits from -10 to 20', { n: 16, minutes: [0, 8], dueMax: 25, profit: [-10, 20] }],
  ['profits in the billions', { n: 16, minutes: [1, 10], dueMax: 35, profit: [1e9, 3e9] }],
];
smallRandom.forEach(([what, o], i) => {
  for (const k of o.once ? [0] : [0, 1]) add(`random small #${i * 2 + k + 1}, 2^${o.n} subsets, ${what}`, 'small', make(o.once ?? 1000 + i * 2 + k, o));
});

const medium = [
  ['loose', { n: 200, minutes: [1, 40], dueMax: 12000, profit: [1, 100] }],
  ['tight', { n: 200, minutes: [1, 60], dueMax: 3000, profit: [1, 100] }],
  ['one shared due time', { n: 200, minutes: [1, 60], dueMax: 2500, due: 'same', profit: [1, 100] }],
  ['five due times', { n: 200, minutes: [1, 60], dueMax: 4000, due: 'few', few: 5, profit: [1, 100] }],
  ['profit about proportional to length, tight', { n: 200, minutes: [10, 90], dueMax: 3000, profit: 'long' }],
  ['shorter jobs earn more, tight', { n: 200, minutes: [10, 90], dueMax: 3000, profit: 'short' }],
  ['listed latest due first', { n: 200, minutes: [1, 60], dueMax: 3500, profit: [1, 100], order: 'dueDesc' }],
  ['zero-minute jobs and profits from -30 to 100', { n: 200, minutes: [0, 60], dueMax: 3000, zero: 0.3, profit: [-30, 100] }],
  ['profits in the billions', { n: 200, minutes: [1, 60], dueMax: 3000, profit: [1e9, 3e9] }],
  ['jobs longer than their due times', { n: 200, minutes: [20, 200], dueMax: 150, profit: [1, 100] }],
];
medium.forEach(([what, o], i) => add(`random medium #${i + 1}, 200 jobs, ${what}`, 'big', make(2000 + i, o)));

const large = [
  ['spread out, due up to 20,000, jobs up to 600 minutes', { n: 2000, minutes: [0, 600], dueMax: 20000, profit: [1, 500] }],
  ['profit about proportional to length', { n: 2000, minutes: [20, 600], dueMax: 20000, profit: 'long' }],
  ['shorter jobs earn more, listed latest due first', { n: 2000, minutes: [20, 600], dueMax: 20000, profit: 'short', order: 'dueDesc' }],
  ['one shared due time of 20,000', { n: 2000, minutes: [10, 600], dueMax: 20000, due: 'same', profit: [1, 500] }],
  ['zero-minute jobs and profits from -100 to 500', { n: 2000, minutes: [0, 600], dueMax: 20000, zero: 0.2, profit: [-100, 500] }],
];
large.forEach(([what, o], i) => add(`random large #${i + 1}, 2,000 jobs, ${what}`, 'big', make(3000 + i, o)));
add('2,000 jobs in under two seconds (spread out)', 'speed', make(4000, { n: 2000, minutes: [1, 600], dueMax: 20000, profit: [1, 1000] }));
add('2,000 jobs in under two seconds (tight, profit about proportional to length)', 'speed', make(4001, { n: 2000, minutes: [100, 600], dueMax: 20000, profit: 'long' }));
add('2,000 jobs in under two seconds (five due times, listed latest due first)', 'speed', make(4002, { n: 2000, minutes: [1, 600], dueMax: 20000, due: 'few', few: 5, profit: [1, 1000], order: 'dueDesc' }));

// ---------- running and judging ----------

const runChild = (jobs, freeze, wallMs) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [self, '--run', dir, freeze ? 'freeze' : 'plain'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ error: `no answer within ${wallMs / 1000} s` });
    }, wallMs);
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
    child.stdin.end(JSON.stringify(jobs));
  });

// Why the answer is not valid, or '' when it is.
function invalid(jobs, answer) {
  if (!answer || typeof answer !== 'object') return `returned ${JSON.stringify(answer)}, not { profit, order }`;
  const { profit, order } = answer;
  if (typeof profit !== 'number' || !Number.isFinite(profit)) return `profit is ${JSON.stringify(profit)}, not a number`;
  if (!Array.isArray(order)) return 'order is not an array';
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const seen = new Set();
  let time = 0;
  let sum = 0;
  for (const id of order) {
    const j = byId.get(id);
    if (!j) return `order has ${JSON.stringify(id)}, which is not a job id`;
    if (seen.has(id)) return `order has ${JSON.stringify(id)} twice`;
    seen.add(id);
    time += j.minutes;
    sum += j.profit;
    if (time > j.due) return `job ${JSON.stringify(id)} ends at minute ${time}, after its due time ${j.due}`;
  }
  if (sum !== profit) return `the jobs in order earn ${sum}, but profit says ${profit}`;
  return '';
}

const CPU_LIMIT_MS = 4000;
async function judge(c) {
  const wall = c.kind === 'speed' ? 20000 : c.kind === 'big' ? 10000 : 8000;
  const r = await runChild(c.jobs, c.freeze, wall);
  if (r.error) return r.error;
  if (c.freeze && !r.unchanged) return 'the jobs it was given were changed';
  const bad = invalid(c.jobs, r.result);
  if (bad) return bad;
  const best = c.kind === 'small' ? brute(c.jobs) : optimum(c.jobs);
  if (r.result.profit !== best) return `profit ${r.result.profit}, but ${best} is possible`;
  if (c.kind === 'speed' && r.cpuMs > CPU_LIMIT_MS) return `used ${Math.round(r.cpuMs)} ms of CPU, over ${CPU_LIMIT_MS} ms`;
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
await pool(of((c) => c.kind !== 'speed'), 6);
await pool(of((c) => c.kind === 'speed'), 3);

const failed = [];
cases.forEach((c, i) => {
  if (results[i]) {
    failed.push(c.name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${results[i]}`);
  }
});
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
