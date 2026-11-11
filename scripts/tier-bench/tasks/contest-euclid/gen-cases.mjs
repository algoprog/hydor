// Makes the small cases of the checker: cases/<name>.in (the input) and cases/<name>.out (the answers), where the answers
// come from the brute force (brute.mjs), and expected.json, the SHA-256 of the reference's answers on the large cases.
// Run once, from the task folder: node gen-cases.mjs <workdir with src/solve.mjs = the reference laid over the seed>.
// Before it writes anything it checks that the two forms of the brute force agree on small N, and that the reference
// (and alt.mjs, a second method, where it is fast enough) give the brute force's answers on every small case.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { solve as altSolve } from './alt.mjs';
import { countTable, literalCount } from './brute.mjs';
import { large, prng } from './cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2]);
const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);
const MOD = 998244353;

for (let N = 1; N <= 20; N++) {
  const f = countTable(N);
  for (let n = 0; n <= N; n++) for (let m = n + 1; m <= N; m++) if (literalCount(N, n, m) !== f(n, m)) throw new Error(`brute forms differ at ${N} ${n} ${m}`);
}

const r = prng(2026);
const tables = new Map();
const tableOf = (N) => {
  if (!tables.has(N)) {
    if (tables.size >= 6) tables.clear();
    tables.set(N, countTable(N));
  }
  return tables.get(N);
};

// Every pair (n, m) with 0 <= n < m <= N, for each N from lo to hi.
const allPairs = (lo, hi) => {
  const list = [];
  for (let N = lo; N <= hi; N++) for (let m = 1; m <= N; m++) for (let n = 0; n < m; n++) list.push([N, n, m]);
  return list;
};
const pick = (N, mLo, mHi, kind) => {
  const m = r.int(Math.max(1, mLo), Math.min(N, mHi));
  const n = kind === 'zero' ? 0 : kind === 'last' ? m - 1 : kind === 'one' ? Math.min(1, m - 1) : kind === 'half' ? Math.floor(m / 2) : kind === 'phi' ? Math.min(m - 1, Math.floor(m * 0.6180339887)) : r.int(0, m - 1);
  return [N, n, m];
};
const many = (count, nLo, nHi, mLo, mHi, kind) => Array.from({ length: count }, () => pick(r.int(nLo, nHi), mLo, mHi === 'N' ? 1e9 : mHi, kind));
const mixed = (count, nLo, nHi) => Array.from({ length: count }, () => pick(r.int(nLo, nHi), 1, 1e9, ['zero', 'last', 'one', 'any', 'any', 'half', 'phi'][r.int(0, 6)]));
// Pairs with n + m within one of N, or N = c n + d m exactly, for small coprime c <= d: where the counted set ends.
const boundary = (count, nLo, nHi) => {
  const list = [];
  while (list.length < count) {
    const N = r.int(nLo, nHi);
    const d = r.int(1, 6);
    const c = r.int(1, d);
    const m = r.int(2, Math.max(2, Math.floor(N / Math.max(1, d))));
    const n = Math.floor((N - d * m) / c);
    if (n >= 0 && n < m && m <= N) list.push([N, n, m]);
    else list.push([N, Math.max(0, Math.min(m - 1, N - m - r.int(-1, 1))), m]);
  }
  return list.filter(([N, n, m]) => n >= 0 && n < m && m <= N);
};

const small = [
  ['exhaustive N 1 to 6', allPairs(1, 6)],
  ['exhaustive N 7 to 12', allPairs(7, 12)],
  ['exhaustive N 13 to 18', allPairs(13, 18)],
  ['exhaustive N 19 to 24', allPairs(19, 24)],
  ['exhaustive N 25 to 30', allPairs(25, 30)],
  ['exhaustive N 31 to 36', allPairs(31, 36)],
  ['n = 0, every m, N 37 to 44', allPairs(37, 44).filter(([, n]) => n === 0)],
  ['n = 0, any m, N up to 1,200', many(250, 100, 1200, 1, 'N', 'zero')],
  ['m = N, any n, N up to 1,000', Array.from({ length: 250 }, () => { const N = r.int(1, 1000); return [N, r.int(0, N - 1), N]; })],
  ['n = m - 1, N up to 1,000', many(250, 20, 1000, 2, 'N', 'last')],
  ['n = 1, N up to 1,000', many(250, 20, 1000, 2, 'N', 'one')],
  ['n = m / 2, N up to 1,000', many(250, 20, 1000, 2, 'N', 'half')],
  ['n/m near 0.618, long chains, N up to 1,500', many(250, 200, 1500, 20, 'N', 'phi')],
  ['small m (N/m large), N = 1,200', Array.from({ length: 60 }, () => { const m = r.int(1, 8); return [1200, r.int(0, m - 1), m]; })],
  ['small m, N between 600 and 1,500, n = 0 or 1', many(120, 600, 1500, 1, 12, 'one')],
  ['n + m close to N or N = c n + d m exactly, N up to 120', boundary(300, 6, 120)],
  ['n + m close to N or N = c n + d m exactly, N up to 700', boundary(300, 120, 700)],
  ['mixed, N up to 60', mixed(400, 20, 60)],
  ['mixed, N 60 to 150', mixed(300, 60, 150)],
  ['mixed, N 150 to 300', mixed(300, 150, 300)],
  ['mixed, N 300 to 600', mixed(300, 300, 600)],
  ['mixed, N 600 to 1,000', mixed(300, 600, 1000)],
  ['mixed, N 1,000 to 1,500', mixed(300, 1000, 1500)],
  ['m about N / 2 (N/m = 2 or 3), N up to 1,000', many(300, 100, 1000, 1, 'N', 'any').map(([N]) => { const m = Math.max(2, Math.floor(N / r.int(2, 3))); return [N, r.int(0, m - 1), m]; })],
  ['m about N / 4 to N / 10, N up to 1,200, any n', many(300, 100, 1200, 1, 'N', 'any').map(([N]) => { const m = Math.max(2, Math.floor(N / r.int(4, 10))); return [N, r.int(0, m - 1), m]; })],
  ['N = 1 and N = 2', [[1, 0, 1], [2, 0, 1], [2, 0, 2], [2, 1, 2]]],
  ['one big N, many m: N = 1,500 and m from 1 to 60, n = m - 1', Array.from({ length: 60 }, (_, k) => [1500, k, k + 1])],
];

fs.rmSync(path.join(here, 'cases'), { recursive: true, force: true });
fs.mkdirSync(path.join(here, 'cases'));
let bytes = 0;
let index = 0;
const total = small.length;
for (const [name, triples] of small) {
  const input = `${triples.length}\n${triples.map((t) => t.join(' ')).join('\n')}\n`;
  const want = triples.map(([N, n, m]) => String(tableOf(N)(n, m) % MOD)).join('\n') + '\n';
  if (solve(input) !== want) throw new Error(`the reference differs from the brute force on "${name}"`);
  if (altSolve(input) !== want) throw new Error(`alt.mjs differs from the brute force on "${name}"`);
  const stem = `${String(++index).padStart(2, '0')}-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')}`;
  fs.writeFileSync(path.join(here, 'cases', `${stem}.in`), input);
  fs.writeFileSync(path.join(here, 'cases', `${stem}.out`), want);
  bytes += input.length + want.length;
}
console.error(`${total} small cases written (${bytes} bytes); the reference and alt.mjs match the brute force on all of them`);

// The sample, from the statement.
const sampleIn = '5\n5 1 2\n233 100 199\n1000000 233 234\n57306 0 1\n57307 0 1\n';
const sampleOut = '4\n1\n5563182\n998216169\n25736\n';
if (solve(sampleIn) !== sampleOut) throw new Error('the reference fails the sample');
fs.writeFileSync(path.join(here, 'cases', '00-sample.in'), sampleIn);
fs.writeFileSync(path.join(here, 'cases', '00-sample.out'), sampleOut);

// The large cases: the reference's answers, and alt.mjs's too when the case is small enough for it to finish quickly.
const expected = {};
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const c of large) {
  if (only && !only.test(c.name)) continue;
  const input = c.build();
  const started = Date.now();
  const out = solve(input);
  const took = Date.now() - started;
  const sumK = input.trim().split('\n').slice(1).reduce((s, l) => { const [N, , m] = l.split(' ').map(BigInt); return s + N / m; }, 0n);
  let note = '';
  if (sumK <= BigInt(process.env.ALT_MAX ?? 30000)) {
    if (altSolve(input) !== out) throw new Error(`alt.mjs differs from the reference on "${c.name}"`);
    note = ' (alt.mjs agrees)';
  }
  expected[c.name] = createHash('sha256').update(out.trimEnd()).digest('hex');
  console.error(`${c.name}: sum of N/m = ${sumK}, reference ${took} ms${note}`);
}
if (!only) fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
