// The little statistics the paired summary uses, written out so that nobody has to trust a library with so few numbers: the median, and a bootstrap interval of the median of
// the differences over briefs (briefs are drawn again with replacement; the random numbers are seeded, so the same runs give the same interval).

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A small seeded generator (mulberry32): 0 up to 1. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Interval {
  n: number;
  median: number | null;
  /** The 2.5th and 97.5th percentiles of the bootstrap medians; null with fewer than two differences. */
  low: number | null;
  high: number | null;
}

export function bootstrap(differences: number[], draws = 10_000, seed = 20261125): Interval {
  const n = differences.length;
  const m = median(differences);
  if (n < 2) return { n, median: m, low: null, high: null };
  const random = seeded(seed);
  const medians: number[] = [];
  for (let i = 0; i < draws; i++) {
    const sample: number[] = [];
    for (let j = 0; j < n; j++) sample.push(differences[Math.floor(random() * n)]!);
    medians.push(median(sample)!);
  }
  medians.sort((a, b) => a - b);
  const at = (p: number) => medians[Math.min(medians.length - 1, Math.max(0, Math.round(p * (medians.length - 1))))]!;
  return { n, median: m, low: at(0.025), high: at(0.975) };
}
