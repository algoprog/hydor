// The statistics results tables need, written out here: means and standard deviations, Student's t distribution
// (through the regularized incomplete beta function), Welch's and the paired t-test, a paired bootstrap, and
// Holm's correction for testing several rows against one baseline. experiments-test.ts checks them against
// values scipy gives.

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** The sample standard deviation (n − 1); 0 for a single value. */
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

const variance = (xs: number[]) => std(xs) ** 2;

// ---- the t distribution ---------------------------------------------------------------------------------

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** ln Γ(x), by Lanczos' approximation (good to about 15 digits). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The continued fraction of the incomplete beta function (Lentz's method). */
function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b). */
export function betainc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  // The fraction converges fast on one side of (a + 1) / (a + b + 2); the other side by symmetry.
  return x < (a + 1) / (a + b + 2) ? (front * betacf(a, b, x)) / a : 1 - (front * betacf(b, a, 1 - x)) / b;
}

/** P(|T| ≥ |t|) for Student's t with `df` degrees of freedom: a two-sided p-value. */
export function tTwoSided(t: number, df: number): number {
  if (!Number.isFinite(t)) return Number.isNaN(t) ? NaN : 0;
  if (!(df > 0)) return NaN;
  return Math.min(1, betainc(df / 2, 0.5, df / (df + t * t)));
}

// ---- tests ----------------------------------------------------------------------------------------------

export interface TestResult {
  /** Two-sided; null when the test cannot be made (too few values, or no spread at all). */
  p: number | null;
  t?: number;
  df?: number;
  n: number;
}

/** Welch's t-test of a against b (unequal variances), two-sided. */
export function welch(a: number[], b: number[]): TestResult {
  const n = Math.min(a.length, b.length);
  if (a.length < 2 || b.length < 2) return { p: null, n };
  const va = variance(a) / a.length;
  const vb = variance(b) / b.length;
  const diff = mean(a) - mean(b);
  const se = Math.sqrt(va + vb);
  if (se === 0) return { p: diff === 0 ? null : 0, n, t: diff === 0 ? 0 : Math.sign(diff) * Infinity };
  const t = diff / se;
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { p: tTwoSided(t, df), t, df, n };
}

/** The paired t-test of the differences a[i] − b[i], two-sided. */
export function pairedT(a: number[], b: number[]): TestResult {
  const n = Math.min(a.length, b.length);
  if (n < 2) return { p: null, n };
  const d = a.slice(0, n).map((x, i) => x - b[i]);
  const m = mean(d);
  const se = std(d) / Math.sqrt(n);
  if (se === 0) return { p: m === 0 ? null : 0, n, t: m === 0 ? 0 : Math.sign(m) * Infinity };
  const t = m / se;
  return { p: tTwoSided(t, n - 1), t, df: n - 1, n };
}

/** A small seeded random number generator (mulberry32), so a bootstrap gives the same p-value each time. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The paired bootstrap test of a against b (examples matched by place): the differences resampled with
 * replacement, shifted to have no effect, and how often their mean is as far from 0 as the one seen. Two-sided.
 */
export function pairedBootstrap(a: number[], b: number[], rounds = 10_000, seed = 1): TestResult {
  const n = Math.min(a.length, b.length);
  if (n < 2) return { p: null, n };
  const d = a.slice(0, n).map((x, i) => x - b[i]);
  const seen = mean(d);
  if (d.every((x) => x === d[0])) return { p: seen === 0 ? null : 0, n };
  const next = rng(seed);
  let far = 0;
  for (let r = 0; r < rounds; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[Math.floor(next() * n)];
    if (Math.abs(s / n - seen) >= Math.abs(seen)) far++;
  }
  return { p: (far + 1) / (rounds + 1), n };
}

/** Holm's step-down correction: each p-value made larger for the number of tests (nulls stay null). */
export function holm(ps: (number | null)[]): (number | null)[] {
  const idx = ps.map((p, i) => [p, i] as const).filter((x): x is readonly [number, number] => x[0] !== null && Number.isFinite(x[0]));
  idx.sort((x, y) => x[0] - y[0]);
  const m = idx.length;
  const out: (number | null)[] = ps.map(() => null);
  let running = 0;
  idx.forEach(([p, i], k) => {
    running = Math.max(running, Math.min(1, (m - k) * p));
    out[i] = running;
  });
  return out;
}
