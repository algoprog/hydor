// Hidden checker for ust-exact. Run: node check.mjs <workdir>
// Every case is one network. linkProbabilities runs on it in a child process of its own with a time limit (the child
// is this file with --run), so an answer that never comes fails alone. A case passes when the function returns an
// array with one number per link, each within 1e-8 of the exact answer (or, for the cases about invalid input, when
// it throws). The exact answers are either worked out here by a formula (trees, cycles, complete graphs, parallel
// links, bridges) or read from fixtures.json, made by gen_fixtures.py: float64 numpy on the grounded Laplacian, and
// exact fractions for the networks up to 40 nodes, the two checked against each other. The networks in the
// fixtures are made by this file from a seed: `node check.mjs --dump graphs.json` writes them for the script.
// The medium and large networks are timed as well, by the CPU time the function uses.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const here = path.dirname(self);

// ---------- the child: runs linkProbabilities on the network it is given on its input ----------
if (process.argv[2] === '--run') {
  const dir = path.resolve(process.argv[3]);
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const { nodes, links } = JSON.parse(text);
  const { linkProbabilities } = await import(pathToFileURL(path.join(dir, 'src/linkload.mjs')).href);
  const cpu = process.cpuUsage();
  let out;
  try {
    const result = linkProbabilities(nodes, links);
    out = { result: result === undefined ? null : result };
  } catch (e) {
    out = { threw: String(e?.message ?? e).slice(0, 200) };
  }
  const used = process.cpuUsage(cpu);
  out.cpuMs = (used.user + used.system) / 1000;
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ---------- the networks ----------

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
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = int(0, i);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  return { next, int, chance: (p) => next() < p, shuffle };
}

const L = (id, a, b, quality) => ({ id, a, b, quality });
const names = (n, prefix = 'n') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

// A random connected network. Options: n nodes, m links in all (the tree that connects it, then others), q: [lowest,
// highest] quality (log-uniform, to two decimals), parallel: the share of the other links that repeat a pair of
// nodes already linked, loops: how many links are from a node to itself, tree: 'random' (each node joins a random
// earlier one) or 'chain' (mostly the one before it, so paths are long). Node order, link order and which end is
// `a` are all shuffled.
function randomNetwork(seed, o) {
  const r = prng(seed);
  const quality = () => {
    const [lo, hi] = o.q;
    return Math.max(0.01, Math.round(Math.exp(Math.log(lo) + r.next() * (Math.log(hi) - Math.log(lo))) * 100) / 100);
  };
  const ids = names(o.n);
  const links = [];
  for (let i = 1; i < o.n; i++) {
    const j = o.tree === 'chain' && r.chance(0.9) ? i - 1 : r.int(0, i - 1);
    links.push([i, j, quality()]);
  }
  const loops = o.loops ?? 0;
  while (links.length < o.m - loops) {
    if (r.chance(o.parallel ?? 0)) {
      const [a, b] = links[r.int(0, links.length - 1)];
      if (a !== b) {
        links.push([a, b, quality()]);
        continue;
      }
    }
    const a = r.int(0, o.n - 1);
    const b = r.int(0, o.n - 1);
    if (a !== b) links.push([a, b, quality()]);
  }
  for (let k = 0; k < loops; k++) {
    const a = r.int(0, o.n - 1);
    links.push([a, a, quality()]);
  }
  r.shuffle(links);
  return {
    nodes: r.shuffle([...ids]),
    links: links.map(([a, b, q], k) => (r.chance(0.5) ? L(`link-${k}`, ids[a], ids[b], q) : L(`link-${k}`, ids[b], ids[a], q))),
  };
}

// A rows x cols grid with random qualities.
function grid(seed, rows, cols, q) {
  const r = prng(seed);
  const at = (i, j) => `g${i}-${j}`;
  const links = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      if (j + 1 < cols) links.push([at(i, j), at(i, j + 1)]);
      if (i + 1 < rows) links.push([at(i, j), at(i + 1, j)]);
    }
  return {
    nodes: r.shuffle(Array.from({ length: rows * cols }, (_, k) => at(Math.floor(k / cols), k % cols))),
    links: links.map(([a, b], k) => L(`link-${k}`, a, b, Math.round((q[0] + r.next() * (q[1] - q[0])) * 100) / 100)),
  };
}

// Two clusters, each a random dense network, joined by one bridge.
function clusters(seed, sizeA, sizeB, linksEach, q) {
  const a = randomNetwork(seed, { n: sizeA, m: linksEach, q });
  const b = randomNetwork(seed + 1, { n: sizeB, m: linksEach, q });
  const rename = (net, p) => ({ nodes: net.nodes.map((x) => p + x), links: net.links.map((l) => L(p + l.id, p + l.a, p + l.b, l.quality)) });
  const x = rename(a, 'x-');
  const y = rename(b, 'y-');
  return { nodes: [...x.nodes, ...y.nodes], links: [...x.links, ...y.links, L('the-bridge', x.nodes[0], y.nodes[0], 0.3)] };
}

function complete(n, quality, prefix = 'n') {
  const nodes = names(n, prefix);
  const links = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) links.push(L(`l${i}-${j}`, nodes[i], nodes[j], quality));
  return { nodes, links };
}

function cycle(n, qualities) {
  const nodes = names(n);
  return { nodes, links: nodes.map((id, i) => L(`c${i}`, id, nodes[(i + 1) % n], qualities[i % qualities.length])) };
}

// A random tree (a path, a star or a random one) with qualities from 0.05 to 20.
function tree(seed, n, shape) {
  const r = prng(seed);
  const ids = names(n);
  const links = [];
  for (let i = 1; i < n; i++) {
    const j = shape === 'path' ? i - 1 : shape === 'star' ? 0 : r.int(0, i - 1);
    const flip = r.chance(0.5);
    links.push(L(`t${i}`, flip ? ids[i] : ids[j], flip ? ids[j] : ids[i], Math.round(Math.exp(Math.log(0.05) + r.next() * Math.log(400)) * 100) / 100));
  }
  return { nodes: r.shuffle([...ids]), links };
}

const scaled = (net, factor) => ({ nodes: net.nodes, links: net.links.map((l) => ({ ...l, quality: l.quality * factor })) });

// ---------- the cases ----------
// kind: 'small', or 'timed' (the CPU time is limited too). `expected` is a list, or `fixture` names the entry of
// fixtures.json (default: the case's own name), or `throws`.
const cases = [];
const add = (name, net, o = {}) => cases.push({ name, ...net, kind: 'small', ...o });
const same = (net, p) => net.links.map(() => p);

// -- formulas
add('no nodes, no links', { nodes: [], links: [] }, { expected: [] });
add('one node, no links', { nodes: ['a'], links: [] }, { expected: [] });
add('one node with two links to itself', { nodes: ['a'], links: [L('s1', 'a', 'a', 1), L('s2', 'a', 'a', 4)] }, { expected: [0, 0] });
add('two nodes, one link', { nodes: ['a', 'b'], links: [L('x', 'b', 'a', 0.37)] }, { expected: [1] });
add('a path of 6 nodes: every link is in the only tree', (() => ({ nodes: names(6), links: names(5).map((id, i) => L(id, `n${i}`, `n${i + 1}`, 1 + i)) }))(), { expected: [1, 1, 1, 1, 1] });
for (const [shape, n, seed] of [['path', 40, 1], ['star', 40, 2], ['random', 60, 3], ['random', 200, 4]]) {
  const net = tree(seed, n, shape);
  add(`a ${shape} tree of ${n} nodes with qualities from 0.05 to 20: every link is 1`, net, { expected: same(net, 1) });
}
for (const n of [3, 4, 10, 50]) {
  const net = cycle(n, [1]);
  add(`a cycle of ${n} nodes: every link is (n-1)/n`, net, { expected: same(net, (n - 1) / n) });
}
{
  const net = cycle(6, [7]);
  add('a cycle of 6 nodes, every quality 7: the qualities do not matter', net, { expected: same(net, 5 / 6) });
}
{
  const q = [0.5, 2, 8, 0.25, 3, 1, 5, 0.1];
  const net = cycle(8, q);
  const sum = q.reduce((s, v) => s + 1 / v, 0);
  add('a cycle of 8 nodes with different qualities: 1 - (1/q) / sum of 1/q', net, { expected: q.map((v) => 1 - 1 / v / sum) });
}
for (const n of [2, 3, 5, 10, 40]) {
  const net = complete(n, 3.5);
  add(`the complete graph on ${n} nodes with equal qualities: every link is 2/n`, net, { expected: same(net, 2 / n) });
}
add('a triangle with qualities 1, 2 and 3', { nodes: ['p', 'q', 'r'], links: [L('a', 'p', 'q', 1), L('b', 'q', 'r', 2), L('c', 'r', 'p', 3)] }, { expected: [5 / 11, 8 / 11, 9 / 11] });
add('a triangle with a link from each node to itself: those are 0, the others 2/3', (() => {
  const nodes = ['a', 'b', 'c'];
  return { nodes, links: [L('s1', 'a', 'a', 2), L('t1', 'a', 'b', 1), L('s2', 'b', 'b', 0.5), L('t2', 'b', 'c', 1), L('s3', 'c', 'c', 9), L('t3', 'c', 'a', 1)] };
})(), { expected: [0, 2 / 3, 0, 2 / 3, 0, 2 / 3] });
add('three links between the same two nodes, qualities 1, 2 and 3', { nodes: ['a', 'b'], links: [L('x', 'a', 'b', 1), L('y', 'b', 'a', 2), L('z', 'a', 'b', 3)] }, { expected: [1 / 6, 2 / 6, 3 / 6] });
add('a path of three nodes, each step two parallel links', { nodes: ['a', 'b', 'c'], links: [L('1', 'a', 'b', 1), L('2', 'b', 'c', 2), L('3', 'b', 'a', 3), L('4', 'c', 'b', 2)] }, { expected: [0.25, 0.5, 0.75, 0.5] });
{
  const a = complete(4, 2, 'a');
  const b = complete(6, 5, 'b');
  const net = { nodes: [...b.nodes, ...a.nodes], links: [...a.links, L('bridge', 'a0', 'b0', 0.01), ...b.links] };
  add('a complete graph on 4 nodes and one on 6, joined by one link: that link is 1, the others 2/4 and 2/6', net, {
    expected: net.links.map((l) => (l.id === 'bridge' ? 1 : l.a[0] === 'a' ? 2 / 4 : 2 / 6)),
  });
}

// -- fixtures: networks worked out by gen_fixtures.py
add('a triangle with one link doubled', { nodes: ['x', 'y', 'z'], links: [L('1', 'x', 'y', 1), L('2', 'y', 'x', 2), L('3', 'y', 'z', 3), L('4', 'z', 'x', 4)] });
add('a square with a diagonal, four different qualities', { nodes: ['a', 'b', 'c', 'd'], links: [L('1', 'a', 'b', 1), L('2', 'b', 'c', 2.5), L('3', 'c', 'd', 4), L('4', 'd', 'a', 0.5), L('5', 'a', 'c', 3)] });
add('three nodes with many parallel links and links to themselves', { nodes: ['a', 'b', 'c'], links: [L('1', 'a', 'b', 1), L('2', 'a', 'b', 2), L('3', 'b', 'c', 0.5), L('4', 'a', 'a', 3), L('5', 'c', 'b', 4), L('6', 'b', 'b', 1), L('7', 'c', 'a', 0.25), L('8', 'a', 'b', 6)] });
{
  const hub = names(7, 'h');
  const links = [];
  for (let i = 1; i < 7; i++) links.push(L(`spoke${i}`, hub[0], hub[i], 20), L(`rim${i}`, hub[i], hub[i % 6 + 1], 0.05 * i));
  add('a wheel: a hub with spokes of quality 20 and a rim of weak links', { nodes: hub, links });
}
{
  const nodes = [];
  const links = [];
  for (let i = 0; i < 6; i++) nodes.push(`u${i}`, `v${i}`);
  for (let i = 0; i < 6; i++) {
    links.push(L(`rung${i}`, `u${i}`, `v${i}`, 1 + (i % 3)));
    if (i < 5) links.push(L(`rail-u${i}`, `u${i}`, `u${i + 1}`, 2), L(`rail-v${i}`, `v${i + 1}`, `v${i}`, 0.5 + i / 4));
  }
  add('a ladder of 6 rungs', { nodes, links });
}
add('a complete bipartite graph K3,3 with qualities 1 to 9', (() => {
  const nodes = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'];
  const links = [];
  let q = 1;
  for (const a of nodes.slice(0, 3)) for (const b of nodes.slice(3)) links.push(L(`${a}${b}`, a, b, q++));
  return { nodes, links };
})());
add('a cycle of 5 nodes with a tail of 3 nodes and a link from the end of the tail to itself', (() => {
  const net = cycle(5, [1, 2, 3, 4, 5]);
  const tail = ['t1', 't2', 't3'];
  return { nodes: [...net.nodes, ...tail], links: [...net.links, L('k1', 'n0', 't1', 2), L('k2', 't1', 't2', 3), L('k3', 't3', 't2', 0.5), L('k4', 't3', 't3', 7)] };
})());
add('node ids that are numbers as text and names an object already has', (() => {
  const ids = ['__proto__', 'constructor', '10', '2', '1', 'toString', 'hasOwnProperty', '', ' a b '];
  const r = prng(5);
  const links = [];
  for (let i = 1; i < ids.length; i++) links.push(L(`${ids.length - i}`, ids[i], ids[r.int(0, i - 1)], r.int(1, 40) / 4));
  links.push(L('__proto__', ids[0], ids[5], 1.5), L('constructor', ids[2], ids[3], 2), L('x', ids[4], ids[4], 3));
  return { nodes: ids, links };
})());

const randomSizes = [
  // name, seed, options
  ['5 nodes, 9 links', 11, { n: 5, m: 9, q: [0.05, 20] }],
  ['8 nodes, a tree and two more links', 12, { n: 8, m: 9, q: [0.05, 20] }],
  ['10 nodes, 25 links with parallel links', 13, { n: 10, m: 25, q: [0.05, 20], parallel: 0.4 }],
  ['12 nodes, 16 links of which 2 are from a node to itself', 14, { n: 12, m: 16, q: [0.1, 10], loops: 2 }],
  ['15 nodes, 40 links', 15, { n: 15, m: 40, q: [0.05, 20] }],
  ['20 nodes, a long chain with a few shortcuts', 16, { n: 20, m: 26, q: [0.5, 4], tree: 'chain' }],
  ['20 nodes, 150 links with half of them parallel and 5 links to themselves', 17, { n: 20, m: 150, q: [0.05, 20], parallel: 0.5, loops: 5 }],
  ['25 nodes, 60 links', 18, { n: 25, m: 60, q: [0.05, 20] }],
  ['30 nodes, 35 links', 19, { n: 30, m: 35, q: [0.05, 20] }],
  ['30 nodes, 300 links, nearly complete', 20, { n: 30, m: 300, q: [0.05, 20] }],
  ['35 nodes, 90 links with parallel links and links to themselves', 21, { n: 35, m: 90, q: [0.1, 15], parallel: 0.3, loops: 6 }],
  ['40 nodes, 100 links, qualities all between 1 and 2', 22, { n: 40, m: 100, q: [1, 2] }],
  ['40 nodes, a long chain with a few shortcuts', 23, { n: 40, m: 55, q: [0.5, 4], tree: 'chain' }],
  ['45 nodes, 120 links', 24, { n: 45, m: 120, q: [0.05, 20] }],
  ['50 nodes, 200 links with parallel links', 25, { n: 50, m: 200, q: [0.05, 20], parallel: 0.3 }],
  ['60 nodes, 70 links', 26, { n: 60, m: 70, q: [0.05, 20] }],
  ['60 nodes, 500 links and 10 links to themselves', 27, { n: 60, m: 500, q: [0.05, 20], loops: 10 }],
];
for (const [name, seed, o] of randomSizes) add(`random network: ${name}`, randomNetwork(seed, o));

{
  const base = randomNetwork(31, { n: 30, m: 90, q: [0.05, 20], parallel: 0.2, loops: 3 });
  add('a random network of 30 nodes', base);
  add('the same network with every quality times 100,000', scaled(base, 1e5), { fixture: 'a random network of 30 nodes' });
  add('the same network with every quality divided by 100,000', scaled(base, 1e-5), { fixture: 'a random network of 30 nodes' });
}

// -- medium and large, timed
const timedSets = [
  ['medium: 100 nodes, 300 links', 41, { n: 100, m: 300, q: [0.05, 20] }],
  ['medium: 150 nodes, 800 links with parallel links', 42, { n: 150, m: 800, q: [0.05, 20], parallel: 0.25 }],
  ['medium: 200 nodes, 1,500 links and 20 links to themselves', 43, { n: 200, m: 1500, q: [0.05, 20], loops: 20 }],
  ['medium: 250 nodes, 2,500 links', 44, { n: 250, m: 2500, q: [0.05, 20] }],
  ['medium: 180 nodes, a long chain with a few shortcuts', 45, { n: 180, m: 230, q: [0.5, 4], tree: 'chain' }],
  ['medium: 120 nodes, 4,000 links', 46, { n: 120, m: 4000, q: [0.05, 20] }],
  ['large: 300 nodes, 3,000 links, half of them parallel, 30 to themselves', 58, { n: 300, m: 3000, q: [0.1, 10], parallel: 0.5, loops: 30 }],
  ['large: 400 nodes, 1,200 links in a long chain', 57, { n: 400, m: 1200, q: [0.5, 4], tree: 'chain' }],
  ['large: 400 nodes, 4,000 links', 51, { n: 400, m: 4000, q: [0.05, 20] }],
  ['large: 400 nodes, 4,000 links, a third of them parallel, 100 to themselves', 52, { n: 400, m: 4000, q: [0.2, 5], parallel: 0.33, loops: 100 }],
  ['large: 400 nodes, 460 links', 53, { n: 400, m: 460, q: [0.5, 4] }],
];
for (const [name, seed, o] of timedSets) add(name, randomNetwork(seed, o), { kind: 'timed' });
add('large: a grid of 20 by 20', grid(54, 20, 20, [0.5, 2]), { kind: 'timed' });
add('large: two dense clusters of 200 nodes joined by one link', clusters(55, 200, 200, 1990, [0.1, 10]), { kind: 'timed' });
{
  const net = tree(56, 400, 'random');
  add('large: a tree of 400 nodes: every link is 1', net, { kind: 'timed', expected: same(net, 1) });
}

// -- invalid input
const bad = (name, net) => add(name, net, { throws: true });
bad('a link to a node that does not exist (its b)', { nodes: ['a', 'b'], links: [L('1', 'a', 'b', 1), L('2', 'a', 'zz', 1)] });
bad('a link from a node that does not exist (its a)', { nodes: ['a', 'b'], links: [L('1', 'nope', 'b', 2)] });
bad('a quality of 0', { nodes: ['a', 'b', 'c'], links: [L('1', 'a', 'b', 1), L('2', 'b', 'c', 0), L('3', 'a', 'c', 2)] });
bad('a negative quality', { nodes: ['a', 'b'], links: [L('1', 'a', 'b', 2), L('2', 'a', 'b', -0.5)] });
{
  const net = randomNetwork(61, { n: 80, m: 300, q: [0.05, 20] });
  net.links[net.links.length - 1] = L('last', net.nodes[0], 'ghost', 1);
  bad('a link to a node that does not exist, the last of 300', net);
}

const names0 = new Set();
for (const c of cases) {
  if (names0.has(c.name)) throw new Error(`two cases named ${c.name}`);
  names0.add(c.name);
}

// For the fixtures' script: the networks whose answers it works out.
if (process.argv[2] === '--dump') {
  const out = {};
  for (const c of cases) if (!c.expected && !c.throws && !c.fixture) out[c.name] = { nodes: c.nodes, links: c.links };
  // A scaled network (it has `fixture`) takes the answer of the network it was scaled from.
  fs.writeFileSync(path.resolve(process.argv[3]), JSON.stringify(out));
  console.error(`wrote ${Object.keys(out).length} networks`);
  process.exit(0);
}

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);

// ---------- running and judging ----------
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));

const runChild = (net, wallMs) =>
  new Promise((resolve) => {
    const child = spawn('node', ['--max-old-space-size=2048', self, '--run', dir], { stdio: ['pipe', 'pipe', 'pipe'] });
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
        finish({ error: `it crashed: ${(err.trim().split('\n').find((l) => /Error|memory/.test(l)) ?? err.trim().split('\n').pop() ?? '').slice(0, 200)}` });
      }
    });
    child.stdin.end(JSON.stringify({ nodes: net.nodes, links: net.links }));
  });

const TOLERANCE = 1e-8;
const CPU_LIMIT_MS = 2000;
async function judge(c) {
  const r = await runChild(c, c.kind === 'timed' ? 30000 : 10000);
  if (r.error) return r.error;
  if (c.throws) return r.threw !== undefined ? '' : 'it returned an answer instead of throwing';
  if (r.threw !== undefined) return `it threw: ${r.threw}`;
  const expected = c.expected ?? fixtures[c.fixture ?? c.name];
  if (!expected) return 'the checker has no expected answer for this case';
  const got = r.result;
  if (!Array.isArray(got)) return `returned ${JSON.stringify(got)?.slice(0, 60)}, not an array`;
  if (got.length !== expected.length) return `returned ${got.length} values for ${expected.length} links`;
  let worst = 0;
  let at = -1;
  for (let i = 0; i < expected.length; i++) {
    if (typeof got[i] !== 'number' || !Number.isFinite(got[i])) return `value ${i} is ${JSON.stringify(got[i])}, not a number`;
    const d = Math.abs(got[i] - expected[i]);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst > TOLERANCE) return `link ${at} is ${got[at]}, expected ${expected[at]} (off by ${worst.toExponential(2)}); ${expected.filter((e, i) => Math.abs(got[i] - e) > TOLERANCE).length} of ${expected.length} are off`;
  if (c.kind === 'timed' && process.env.CHECK_VERBOSE) console.error(`CPU ${Math.round(r.cpuMs)} ms: ${c.name}`);
  if (c.kind === 'timed' && r.cpuMs > CPU_LIMIT_MS) return `used ${Math.round(r.cpuMs)} ms of CPU, over ${CPU_LIMIT_MS} ms`;
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
await pool(of((c) => c.kind !== 'timed'), 4);
await pool(of((c) => c.kind === 'timed'), 2);

const failed = [];
cases.forEach((c, i) => {
  if (results[i]) {
    failed.push(c.name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${results[i]}`);
  }
});
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
