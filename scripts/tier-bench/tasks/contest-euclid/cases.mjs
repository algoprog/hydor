// The large cases of the checker for contest-euclid: each is a name and a function that builds its input (a string in the
// problem's format) from a seeded generator, so a case is the same on every run and nothing big is stored. Shared by
// check.mjs and gen-expected.mjs, which finds the answers once with the reference and keeps a hash of each in expected.json.
// Every input is held to the problem's constraints by the same function (checkInput) when it is built.

const LIMIT = 10n ** 18n;

// A small seeded PRNG (mulberry32), with integers of any size as BigInt.
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
  // An integer from lo to hi (BigInt, both ends included), from 96 random bits.
  const big = (lo, hi) => {
    const bits = (BigInt(Math.floor(next() * 4294967296)) << 64n) | (BigInt(Math.floor(next() * 4294967296)) << 32n) | BigInt(Math.floor(next() * 4294967296));
    return lo + (bits % (hi - lo + 1n));
  };
  return { next, int, big, chance: (p) => next() < p };
}

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/** The input text for a list of [N, n, m] BigInt triples; throws if any constraint of the problem is broken. */
export function checkInput(triples) {
  if (triples.length < 1 || triples.length > 100000) throw new Error(`T = ${triples.length}`);
  let sum = 0n;
  for (const [N, n, m] of triples) {
    if (!(N >= 1n && N <= LIMIT && n >= 0n && n < m && m <= N)) throw new Error(`out of range: ${N} ${n} ${m}`);
    sum += N / m;
  }
  if (sum > 1000000n) throw new Error(`the sum of N/m is ${sum}`);
  return `${triples.length}\n${triples.map((t) => t.join(' ')).join('\n')}\n`;
}

/** A triple with N / m = K (so N = K m + r with 0 <= r < m), m near the given size, and n as the given kind says. */
function triple(r, K, mLo, mHi, kind) {
  // N < (K + 1) m, so m up to LIMIT / (K + 1) keeps N within the limit.
  const top = LIMIT / BigInt(K + 1);
  const m = r.big(mLo > top ? top : mLo, mHi > top ? top : mHi);
  const N = BigInt(K) * m + r.big(0n, m - 1n);
  const n = kind === 'zero' ? 0n : kind === 'last' ? m - 1n : kind === 'one' && m > 1n ? 1n : r.big(0n, m - 1n);
  return [N, n, m];
}

const KINDS = ['zero', 'last', 'one', 'any', 'any', 'any'];

// A triple whose N is exactly c n + d m (plus delta) for a coprime pair (c, d) with c <= d <= dMax: the boundary of
// which pairs are counted. m is near the given size.
// With nMax, n is at most that (so N - d m is small next to m).
function boundary(r, dMax, mLo, mHi, nMax) {
  for (;;) {
    const d = r.int(2, dMax);
    const c = r.int(1, d);
    if (gcd(c, d) !== 1) continue;
    const m = r.big(mLo, mHi);
    const n = nMax ? r.big(1n, nMax) : r.big(1n, m - 1n);
    const N = BigInt(c) * n + BigInt(d) * m + BigInt(nMax ? r.int(-2, 2) : r.int(-1, 0));
    if (N > LIMIT || N < m) continue;
    return [N, n, m];
  }
}

export const large = [
  {
    name: 'one case, N = 10^18, n = 1, m = 10^12 (N/m = 1,000,000)',
    build: () => checkInput([[LIMIT, 1n, 10n ** 12n]]),
  },
  {
    name: 'one case, N = 10^18, n = 0, m = 10^12',
    build: () => checkInput([[LIMIT, 0n, 10n ** 12n]]),
  },
  {
    name: 'one case, N = 10^18, n = m - 1, m = 10^12',
    build: () => checkInput([[LIMIT, 10n ** 12n - 1n, 10n ** 12n]]),
  },
  {
    name: 'one case, N = 10^18, m = 10^12, n about 0.37 m',
    build: () => checkInput([[LIMIT, 370_000_000_017n, 10n ** 12n]]),
  },
  {
    name: 'one case, N = 10^18 - 1, m = 10^12 + 1 (N/m = 999,999), n about 0.8 m',
    build: () => checkInput([[LIMIT - 1n, 800_000_000_123n, 10n ** 12n + 1n]]),
  },
  {
    name: 'two cases with N exactly c n + d m and one less, d = 400,000',
    build: () => {
      const r = prng(11);
      const m = 2_000_000_000_011n;
      const n = r.big(m / 2n, m - 1n);
      const N = 33333n * n + 400000n * m;
      return checkInput([[N, n, m], [N - 1n, n, m]]);
    },
  },
  {
    name: 'N = 1,000,000, n = 0, m = 1',
    build: () => checkInput([[1000000n, 0n, 1n]]),
  },
  {
    name: 'N = 1,000,000, n = 1, m = 2 (small numbers, N/m = 500,000)',
    build: () => checkInput([[1000000n, 1n, 2n]]),
  },
  {
    name: '100,000 cases, N/m = 1, N up to 10^18, n of every kind',
    build: () => {
      const r = prng(21);
      return checkInput(Array.from({ length: 100000 }, () => triple(r, 1, 2n, 10n ** 18n, KINDS[r.int(0, 5)])));
    },
  },
  {
    name: '100,000 cases, N/m = 10, N up to 10^18, n of every kind',
    build: () => {
      const r = prng(22);
      return checkInput(Array.from({ length: 100000 }, () => triple(r, 10, 10n ** 14n, 10n ** 17n, KINDS[r.int(0, 5)])));
    },
  },
  {
    name: '2,000 cases, N/m = 500, m about 10^15, n of every kind',
    build: () => {
      const r = prng(23);
      return checkInput(Array.from({ length: 2000 }, () => triple(r, 500, 10n ** 15n, 19n * 10n ** 14n, KINDS[r.int(0, 5)])));
    },
  },
  {
    name: '1,000 cases, N/m = 1,000, n = m - 1 or any n',
    build: () => {
      const r = prng(24);
      return checkInput(Array.from({ length: 1000 }, (_, k) => triple(r, 1000, 10n ** 14n, 9n * 10n ** 14n, k % 2 ? 'last' : 'any')));
    },
  },
  {
    name: '100,000 cases with N/m from 1 to 30, most of them small',
    build: () => {
      const r = prng(25);
      const list = [];
      let sum = 0;
      while (list.length < 100000) {
        // About 1/x spread, then cut to keep the total of N/m within its limit.
        const K = Math.min(30, Math.max(1, Math.floor(Math.exp(r.next() * Math.log(31)))));
        if (sum + K > 1000000 - (100000 - list.length)) break;
        sum += K;
        list.push(triple(r, K, 1000n, 10n ** 16n, KINDS[r.int(0, 5)]));
      }
      while (list.length < 100000) list.push(triple(r, 1, 1000n, 10n ** 16n, 'any'));
      return checkInput(list);
    },
  },
  {
    name: 'one case with N/m = 500,000 and 50,000 cases with N/m = 10',
    build: () => {
      const r = prng(26);
      const list = [triple(r, 500000, 10n ** 12n, 19n * 10n ** 11n, 'any')];
      for (let k = 0; k < 50000; k++) list.push(triple(r, 10, 10n ** 12n, 10n ** 16n, KINDS[r.int(0, 5)]));
      return checkInput(list);
    },
  },
  {
    name: '100,000 cases with N exactly c n + d m (or one less), d up to 5, numbers near 10^18',
    build: () => {
      const r = prng(27);
      return checkInput(Array.from({ length: 100000 }, () => boundary(r, 5, 10n ** 16n, 10n ** 17n)));
    },
  },
  {
    name: '100,000 cases with n up to 50 and N within 2 of c n + d m, d up to 5, m about 10^16',
    build: () => {
      const r = prng(29);
      return checkInput(Array.from({ length: 100000 }, () => boundary(r, 5, 10n ** 16n, 19n * 10n ** 15n, 50n)));
    },
  },
  {
    name: '300 cases, N up to 300,000 (below 2^53), any n and m',
    build: () => {
      const r = prng(28);
      const list = [];
      for (let k = 0; k < 300; k++) {
        const N = BigInt(r.int(1000, 300000));
        const m = BigInt(r.int(Math.max(1, Math.floor(Number(N) / 400)), Math.floor(Number(N) / 2) + 1));
        list.push([N, BigInt(r.int(0, Number(m) - 1)), m]);
      }
      return checkInput(list);
    },
  },
];
