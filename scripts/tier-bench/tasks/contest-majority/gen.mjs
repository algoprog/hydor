// Input makers shared by check.mjs, build-cases.mjs and the calibration programs. An input is a list of starting
// strings and a list of queries, written in the problem's format by formatInput. Every maker takes a seeded generator,
// so an input is the same on every run.

// A small seeded PRNG (mulberry32).
export function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int, chance: (p) => next() < p, pick: (xs) => xs[int(0, xs.length - 1)] };
}

export const str = (bits) => Array.from(bits).join('');
export const formatInput = (S, T) => `${S.length} ${S[0].length} ${T.length}\n${S.join('\n')}\n${T.join('\n')}\n`;

// ---------- models of the starting strings: each gives sample(), and where it has one, bad() ----------

// Every character is 1 with probability p, independently (p may be a number or one number per position).
export function bernoulli(r, m, p) {
  return { sample: () => Array.from({ length: m }, (_, i) => (r.chance(typeof p === 'number' ? p : p[i]) ? 1 : 0)) };
}

// Strings that obey a hidden set of rules "if position u is 1 then position v is 1" (each position possibly read the
// other way round by a hidden flip), so some pairs of characters never appear together. bad() gives a string that
// breaks one rule and nothing else on purpose.
export function rules(r, m, edges, p, flipShare) {
  const flip = Array.from({ length: m }, () => (r.chance(flipShare) ? 1 : 0));
  const out = Array.from({ length: m }, () => []);
  const list = [];
  while (m > 1 && list.length < edges) {
    const u = r.int(0, m - 1);
    const v = r.int(0, m - 1);
    if (u === v) continue;
    out[u].push(v);
    list.push([u, v]);
  }
  const close = (x) => {
    const stack = [];
    for (let i = 0; i < m; i++) if (x[i]) stack.push(i);
    while (stack.length) {
      const u = stack.pop();
      for (const v of out[u]) if (!x[v]) { x[v] = 1; stack.push(v); }
    }
    return x;
  };
  const sample = () => close(Array.from({ length: m }, () => (r.chance(p) ? 1 : 0))).map((b, i) => b ^ flip[i]);
  const bad = () => {
    if (!list.length) return sample();
    const [u, v] = r.pick(list);
    const x = close(Array.from({ length: m }, () => (r.chance(p) ? 1 : 0)));
    x[u] = 1;
    x[v] = 0;
    return x.map((b, i) => b ^ flip[i]);
  };
  return { sample, bad };
}

// Positions in groups of g that are each equal to or the opposite of one hidden bit, one bit per group. bad() flips
// one position of a sample.
export function groups(r, m, g) {
  const of = Array.from({ length: m }, (_, i) => Math.floor(i / g));
  const flip = Array.from({ length: m }, () => r.int(0, 1));
  const count = of[m - 1] + 1;
  const sample = () => {
    const bit = Array.from({ length: count }, () => r.int(0, 1));
    return Array.from({ length: m }, (_, i) => bit[of[i]] ^ flip[i]);
  };
  return { sample, bad: () => { const x = sample(); x[r.int(0, m - 1)] ^= 1; return x; } };
}

// Random strings in which the pairs of positions in `pairs` never both show 1.
export function forbidden(r, m, pairs, p = 0.5) {
  const sample = () => {
    const x = Array.from({ length: m }, () => (r.chance(p) ? 1 : 0));
    for (const [u, v] of pairs) if (x[u] && x[v]) x[r.chance(0.5) ? u : v] = 0;
    return x;
  };
  return { sample };
}

// Random strings with an even number of ones (or exactly w ones when w is given).
export function weighted(r, m, w) {
  return {
    sample: () => {
      if (w !== undefined) {
        const x = new Array(m).fill(0);
        for (let k = 0; k < w; ) { const i = r.int(0, m - 1); if (!x[i]) { x[i] = 1; k++; } }
        return x;
      }
      const x = Array.from({ length: m }, () => r.int(0, 1));
      if (x.reduce((a, b) => a + b, 0) % 2) x[r.int(0, m - 1)] ^= 1;
      return x;
    },
  };
}

// ---------- building an input: n starting strings from a model, q queries from a mix ----------

// mix is a list of [share, kind]: 'sample' (a fresh string of the model), 'start' (one of the starting strings),
// 'majority' (the majority of three of them), 'flip1' (a starting string with one character changed), 'flipFew' (some
// characters changed), 'random' (fair coin flips), 'odd' (a random string with an odd number of ones), 'bad' (the
// model's bad()), 'sparse' (a few ones), 'sparse1' (at most one 1).
export function build(r, n, m, q, model, mix) {
  const S = Array.from({ length: n }, () => model.sample());
  const total = mix.reduce((a, [w]) => a + w, 0);
  const T = [];
  const startBits = () => r.pick(S);
  const make = (kind) => {
    switch (kind) {
      case 'sample': return model.sample();
      case 'start': return startBits().slice();
      case 'majority': {
        const [a, b, c] = [startBits(), startBits(), startBits()];
        return a.map((x, i) => (x + b[i] + c[i] >= 2 ? 1 : 0));
      }
      case 'flip1': { const x = startBits().slice(); x[r.int(0, m - 1)] ^= 1; return x; }
      case 'flipFew': { const x = startBits().slice(); for (let k = r.int(2, 4); k > 0; k--) x[r.int(0, m - 1)] ^= 1; return x; }
      case 'random': return Array.from({ length: m }, () => r.int(0, 1));
      case 'odd': { const x = Array.from({ length: m }, () => r.int(0, 1)); if (x.reduce((a, b) => a + b, 0) % 2 === 0) x[r.int(0, m - 1)] ^= 1; return x; }
      case 'bad': return model.bad();
      case 'sparse': { const x = new Array(m).fill(0); for (let k = r.int(2, 4); k > 0; k--) x[r.int(0, m - 1)] = 1; return x; }
      case 'sparse1': { const x = new Array(m).fill(0); if (r.chance(0.7)) x[r.int(0, m - 1)] = 1; return x; }
      default: throw new Error(`unknown query kind ${kind}`);
    }
  };
  for (let i = 0; i < q; i++) {
    let pick = r.next() * total;
    let kind = mix[mix.length - 1][1];
    for (const [w, k] of mix) {
      if (pick < w) { kind = k; break; }
      pick -= w;
    }
    T.push(make(kind));
  }
  return { S: S.map(str), T: T.map(str) };
}

// All 2^m strings of length m, as queries.
export const everyString = (m) => Array.from({ length: 1 << m }, (_, v) => v.toString(2).padStart(m, '0'));

// ---------- the large cases (each at the constraints' limits unless its name says otherwise) ----------

export const large = [
  ['dense random strings, queries random, from the starts, one character changed',
    (r) => build(r, 500, 500, 500, bernoulli(r, 500, 0.5), [[1, 'random'], [1, 'start'], [1, 'flip1'], [1, 'majority']])],
  ['sparse strings (3% ones): queries are starts, majorities of three, a start with one character changed, or a few ones',
    (r) => build(r, 500, 500, 500, bernoulli(r, 500, 0.03), [[2, 'start'], [2, 'majority'], [2, 'flip1'], [1, 'sparse'], [1, 'sparse1']])],
  ['strings that obey 600 hidden rules: queries that obey them, break one, or have one character changed',
    (r) => { const model = rules(r, 500, 600, 0.3, 0.5); return build(r, 500, 500, 500, model, [[3, 'sample'], [3, 'bad'], [1, 'flip1'], [1, 'start']]); }],
  ['strings that obey 1500 hidden rules at 10% ones (long chains of implications)',
    (r) => { const model = rules(r, 500, 1500, 0.1, 0.5); return build(r, 500, 500, 500, model, [[3, 'sample'], [3, 'bad'], [1, 'majority'], [1, 'flipFew']]); }],
  ['strings that obey 250 hidden rules (loose) with all characters read the same way',
    (r) => { const model = rules(r, 500, 250, 0.5, 0); return build(r, 500, 500, 500, model, [[3, 'sample'], [3, 'bad'], [1, 'random']]); }],
  ['500 positions in groups of 4 that are each equal to or the opposite of one hidden bit',
    (r) => build(r, 500, 500, 500, groups(r, 500, 4), [[3, 'sample'], [3, 'bad'], [1, 'random']])],
  ['one pair of positions at the very end that never both show 1',
    (r) => build(r, 500, 500, 500, forbidden(r, 500, [[498, 499]]), [[1, 'random'], [1, 'start'], [1, 'majority']])],
  ['three pairs of positions that never both show 1, spread out',
    (r) => build(r, 500, 500, 500, forbidden(r, 500, [[7, 311], [120, 121], [444, 12]], 0.4), [[1, 'random'], [1, 'start'], [1, 'majority']])],
  ['strings with an even number of ones: queries with an odd number are just as reachable',
    (r) => build(r, 500, 500, 500, weighted(r, 500), [[1, 'odd'], [1, 'random'], [1, 'start']])],
  ['strings with exactly 250 ones: queries have other numbers of ones',
    (r) => build(r, 500, 500, 500, weighted(r, 500, 250), [[1, 'random'], [1, 'sparse'], [1, 'flip1']])],
  ['500 strings that each have a single 1 in their own position, and the all-zero string among the queries',
    (r) => {
      const S = Array.from({ length: 500 }, (_, k) => str(Array.from({ length: 500 }, (_, i) => (i === k ? 1 : 0))));
      const x = build(r, 4, 500, 500, bernoulli(r, 500, 0.5), [[1, 'sparse1'], [1, 'sparse'], [1, 'sparse1']]);
      return { S, T: ['0'.repeat(500), ...x.T.slice(1)] };
    }],
  ['one string only, copied 500 times: queries are it or differ in one character',
    (r) => { const s = bernoulli(r, 500, 0.5).sample(); const model = { sample: () => s.slice() }; return build(r, 500, 500, 500, model, [[1, 'start'], [2, 'flip1'], [1, 'random']]); }],
  ['a single string of 500 characters',
    (r) => build(r, 1, 500, 500, bernoulli(r, 500, 0.5), [[1, 'start'], [2, 'flip1']])],
  ['random strings and their complements',
    (r) => {
      const half = Array.from({ length: 250 }, () => bernoulli(r, 500, 0.5).sample());
      const S = [...half, ...half.map((x) => x.map((b) => 1 - b))].map(str);
      return { S, T: build(r, 4, 500, 500, bernoulli(r, 500, 0.5), [[1, 'random']]).T };
    }],
  ['100 characters, 500 strings from 400 hidden rules: many queries to a small table',
    (r) => { const model = rules(r, 100, 400, 0.2, 0.5); return build(r, 500, 100, 500, model, [[3, 'sample'], [3, 'bad'], [1, 'flip1']]); }],
];

// ---------- the small cases (every query of every string when m is small) ----------

const all = (m) => everyString(m);
// Each is [name, () => { S, T }].
export const small = [
  ['sample 1 from the statement', () => ({ S: ['000', '011', '101'], T: ['000', '001'] })],
  ['sample 2 from the statement', () => ({ S: ['0', '0'], T: ['0', '1'] })],
  ['one string of one character', () => ({ S: ['1'], T: ['0', '1', '1'] })],
  ['two one-character strings, 0 and 1: both can be made', () => ({ S: ['0', '1'], T: ['0', '1'] })],
  ['one string of 8 characters makes only itself', () => ({ S: ['10110010'], T: all(8) })],
  ['the same string 6 times makes only itself', () => ({ S: Array(6).fill('01101'), T: all(5) })],
  ['two strings that are opposite make nothing new', () => ({ S: ['0110', '1001'], T: all(4) })],
  ['two strings of 2 characters: 00 and 11', () => ({ S: ['00', '11'], T: all(2) })],
  ['all four strings of 2 characters', () => ({ S: ['00', '01', '10', '11'], T: all(2) })],
  ['three strings with two ones each make 111 but not 000', () => ({ S: ['011', '101', '110'], T: all(3) })],
  ['even number of ones, 3 characters: the odd ones are reachable', () => ({ S: ['000', '011', '101', '110'], T: all(3) })],
  ['even number of ones, 5 characters', () => ({ S: all(5).filter((s) => s.split('1').length % 2 === 1), T: all(5) })],
  ['even number of ones, 4 characters, only four of the eight strings', () => ({ S: ['0000', '0011', '0101', '1111'], T: all(4) })],
  ['three strings of 4 characters, one pair never both 1', () => ({ S: ['1000', '0100', '0011'], T: all(4) })],
  ['unit strings 1000, 0100, 0010, 0001 and 0000', () => ({ S: ['1000', '0100', '0010', '0001', '0000'], T: all(4) })],
  ['unit strings without the zero string', () => ({ S: ['100', '010', '001'], T: all(3) })],
  ['the strings of weight 2 of 5 characters', () => ({ S: all(5).filter((s) => s.split('1').length === 3), T: all(5) })],
  ['strings 0011, 0101, 0110: each pair of positions needs checking', () => ({ S: ['0011', '0101', '0110'], T: all(4) })],
  ['a three-string chain 000 001 011 (a ladder)', () => ({ S: ['000', '001', '011'], T: all(3) })],
  ['a ladder of 7 strings of 6 characters', () => ({ S: ['000000', '000001', '000011', '000111', '001111', '011111', '111111'], T: all(6) })],
  ['two columns equal, the others free (4 characters)', () => ({ S: ['0000', '0011', '1100', '1111', '0101', '1010'], T: all(4) })],
  ['a pair of positions tied to be opposite (4 characters)', () => ({ S: ['0100', '1000', '0111', '1011', '0101', '1001'], T: all(4) })],
  ['seven strings of 7 characters that need two rounds of the operation', () => ({ S: ['1100000', '0110000', '0011000', '0001100', '0000110', '0000011', '1000001'], T: all(7) })],
  ['16 random strings of 8 characters, all 256 queries (dense)', () => { const r = prng(11); return { S: Array.from({ length: 16 }, () => str(bernoulli(r, 8, 0.5).sample())), T: all(8) }; }],
  ['a tiny 1-character case with every string equal', () => ({ S: ['1', '1', '1'], T: ['0', '1'] })],
];
// Random ones: [name, seed, n, m, kind].
const smallModels = [
  ['dense', (r, m) => bernoulli(r, m, 0.5)],
  ['sparse (20% ones)', (r, m) => bernoulli(r, m, 0.2)],
  ['mostly ones (85%)', (r, m) => bernoulli(r, m, 0.85)],
  ['hidden rules', (r, m) => rules(r, m, Math.max(1, Math.floor(m * 0.8)), 0.35, 0.5)],
  ['many hidden rules', (r, m) => rules(r, m, m * 2, 0.2, 0.5)],
  ['groups of 2', (r, m) => groups(r, m, 2)],
  ['groups of 3', (r, m) => groups(r, m, 3)],
  ['even number of ones', (r, m) => weighted(r, m)],
];
export function randomSmall(seed, n, m, q, model) {
  const r = prng(seed);
  const mdl = smallModels[model % smallModels.length][1](r, m);
  const S = Array.from({ length: n }, () => str(mdl.sample()));
  const T = m <= 7 ? everyString(m) : build(r, n, m, q, { sample: mdl.sample, bad: mdl.bad ?? mdl.sample }, [[2, 'sample'], [1, 'random'], [1, 'flip1'], [1, 'majority']]).T;
  return { S, T };
}
export const smallModelNames = smallModels.map(([name]) => name);
for (let k = 0; k < 14; k++) {
  const model = k % smallModels.length;
  const m = 3 + (k % 6);
  const n = 2 + ((k * 3) % 7);
  small.push([`random small #${k + 1}: ${n} strings of ${m} characters, ${smallModels[model][0]}`, () => randomSmall(500 + k, n, m, 200, model)]);
}
