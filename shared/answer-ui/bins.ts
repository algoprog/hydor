// A histogram's bins, worked out from the values (the distribution card, web/src/components/answer/uis/data.tsx), and
// shared with the server, which bins a column too long to send whole the same way (data-ref.ts).

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** A sorted list's value a share `p` of the way through it (between two of its values, in proportion). */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** The round widths a bin may have, times a power of ten. */
const ROUND_WIDTHS = [1, 2, 2.5, 5, 10];

/**
 * Values in bins: whole numbers over a short range a bin each (centred on them); else as many as their spread calls for
 * (Freedman–Diaconis, 5 to 40) at the round width nearest it, from a multiple of it. The last bin keeps its top edge.
 */
export function binValues(values: number[], width: number | null): Bin[] {
  const n = values.length;
  if (!n) return [];
  const s = [...values].sort((a, b) => a - b);
  const lo = s[0];
  const hi = s[n - 1];
  const whole = s.every(Number.isInteger);
  let w = width !== null && width > 0 && (hi - lo) / width <= 200 ? width : 0;
  if (!w) {
    if (whole && hi - lo <= 30) w = 1;
    else if (lo === hi) w = Math.abs(lo) / 10 || 1;
    else {
      const iqr = quantile(s, 0.75) - quantile(s, 0.25);
      const fd = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : 0;
      const k = Math.max(5, Math.min(40, fd > 0 ? Math.ceil((hi - lo) / fd) : Math.ceil(Math.log2(n) + 1)));
      const p = 10 ** Math.floor(Math.log10((hi - lo) / k));
      const off = (c: number) => Math.abs(Math.log((hi - lo) / c / k));
      for (const f of ROUND_WIDTHS) {
        const c = f * p;
        if (whole && !Number.isInteger(c)) continue;
        if (!w || off(c) < off(w)) w = c;
      }
      w ||= (hi - lo) / k;
    }
  }
  const start = whole && w === 1 ? lo - 0.5 : Math.floor(lo / w + 1e-9) * w;
  const count = Math.max(1, Math.ceil((hi - start) / w - 1e-9));
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({ from: start + i * w, to: start + (i + 1) * w, count: 0 }));
  for (const v of s) bins[Math.max(0, Math.min(count - 1, Math.floor((v - start) / w + 1e-9)))].count++;
  return bins;
}
