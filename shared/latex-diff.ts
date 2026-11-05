// The words two versions of a text differ in, for Track changes when an agent saves a LaTeX document: where the new
// text has words put in and words taken out, as a reader would mark them (whole words, with the spaces and signs
// between them), so the user can accept or reject each. Myers' way (the fewest taken out and put in), first over the
// lines, then over the words of the lines that differ, so a long file costs little; where the texts are too far apart
// to work that out quickly, what differs between their common start and end is one change.

/** At `at` in the new text, `del` was taken out (from the old text) and `ins` put in (the new text's [at, at+ins.length)). */
export interface WordHunk {
  at: number;
  del: string;
  ins: string;
}

type Op = '=' | '-' | '+';

/** Words, runs of spaces, and each other sign on its own. */
const words = (s: string) => s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
/** Lines, each with its line end. */
const lines = (s: string) => s.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** The edit script from a to b, or null when it would take more than `max` edits. Each round keeps only its own diagonals. */
function script(a: string[], b: string[], max: number): Op[] | null {
  const ids = new Map<string, number>();
  const id = (s: string) => {
    let v = ids.get(s);
    if (v === undefined) ids.set(s, (v = ids.size));
    return v;
  };
  const A = a.map(id);
  const B = b.map(id);
  const n = A.length;
  const m = B.length;
  const off = n + m + 1;
  const v = new Int32Array(2 * off + 1);
  // Round d's furthest points as they were when it started: diagonals -d…d (index k + d).
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= Math.min(n + m, max) && !found; d++) {
    trace.push(v.slice(off - d, off + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) return null;
  const out: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const t = trace[d];
    const at = (k: number) => t[k + d];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d > 0 ? at(prevK) : 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push('=');
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        out.push('+');
        y--;
      } else {
        out.push('-');
        x--;
      }
    }
  }
  return out.reverse();
}

/** The hunks of an edit script over tokens, at `start` in the new text; a lone space between two hunks joins them. */
function hunksOf(ta: string[], tb: string[], ops: Op[], start: number): WordHunk[] {
  const out: WordHunk[] = [];
  let ia = 0;
  let ib = 0;
  let pos = start;
  let cur: WordHunk | null = null;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === '=') {
      // "red car" became "blue truck": one change, not two.
      if (cur && /^[ \t]+$/.test(ta[ia]) && ops[i + 1] && ops[i + 1] !== '=') {
        cur.del += ta[ia];
        cur.ins += tb[ib];
      } else if (cur) {
        out.push(cur);
        cur = null;
      }
      pos += tb[ib].length;
      ia++;
      ib++;
      continue;
    }
    cur ??= { at: pos, del: '', ins: '' };
    if (op === '-') cur.del += ta[ia++];
    else {
      cur.ins += tb[ib];
      pos += tb[ib++].length;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Where `b` differs from `a`, word by word (none when they are the same). `max`: the most edits worked out at each level. */
export function diffWords(a: string, b: string, max = 2000): WordHunk[] {
  if (a === b) return [];
  // The common start and end, as they are, cut at a word's edge so a word is never split.
  const word = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  while (s > 0 && word(a[s - 1]) && (word(a[s]) || word(b[s]))) s--;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  while (e > 0 && word(a[a.length - e]) && (word(a[a.length - e - 1]) || word(b[b.length - e - 1]))) e--;
  const am = a.slice(s, a.length - e);
  const bm = b.slice(s, b.length - e);
  const one = [{ at: s, del: am, ins: bm }];
  // Lines first: the stretches of lines that differ, then their words.
  const la = lines(am);
  const lb = lines(bm);
  const lops = la.length + lb.length > 2 ? script(la, lb, max) : null;
  if (!lops) {
    const ops = script(words(am), words(bm), max);
    return ops ? hunksOf(words(am), words(bm), ops, s) : one;
  }
  const out: WordHunk[] = [];
  let ia = 0;
  let ib = 0;
  let pos = s;
  for (let i = 0; i < lops.length; ) {
    if (lops[i] === '=') {
      pos += lb[ib].length;
      ia++;
      ib++;
      i++;
      continue;
    }
    // A stretch of lines taken out and put in: its words compared.
    let oa = '';
    let ob = '';
    for (; i < lops.length && lops[i] !== '='; i++) {
      if (lops[i] === '-') oa += la[ia++];
      else ob += lb[ib++];
    }
    const wa = words(oa);
    const wb = words(ob);
    const ops = script(wa, wb, max);
    out.push(...(ops ? hunksOf(wa, wb, ops, pos) : [{ at: pos, del: oa, ins: ob }]));
    pos += ob.length;
  }
  return out;
}
