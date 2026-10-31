// A line diff of two versions of a skill, as unified hunks with a few lines around each change (what
// the app's diff view draws). Skills are small, so the longest common run of lines is found directly.

export interface LineDiff {
  diff: string;
  added: number;
  removed: number;
}

/** Past this many line pairs, the middle shows as removed then added. */
const CELLS = 4_000_000;

/** Unified hunks from `a` to `b` (no file headers); `context` unchanged lines around each change. */
export function lineDiff(a: string, b: string, context = 3): LineDiff {
  const x = a ? a.replace(/\n$/, '').split('\n') : [];
  const y = b ? b.replace(/\n$/, '').split('\n') : [];
  // Lines the two share at the start and the end need no table.
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  const xs = x.slice(pre, x.length - suf);
  const ys = y.slice(pre, y.length - suf);
  // ops over the middle: ' ' kept, '-' only in a, '+' only in b.
  const ops: { op: ' ' | '-' | '+'; text: string }[] = [];
  if (xs.length * ys.length > CELLS) {
    for (const l of xs) ops.push({ op: '-', text: l });
    for (const l of ys) ops.push({ op: '+', text: l });
  } else {
    const n = xs.length;
    const m = ys.length;
    const w = m + 1;
    const len = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) len[i * w + j] = xs[i] === ys[j] ? len[(i + 1) * w + j + 1] + 1 : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && xs[i] === ys[j]) {
        ops.push({ op: ' ', text: xs[i] });
        i++;
        j++;
      } else if (i < n && (j >= m || len[(i + 1) * w + j] >= len[i * w + j + 1])) ops.push({ op: '-', text: xs[i++] });
      else ops.push({ op: '+', text: ys[j++] });
    }
  }
  const all = [...x.slice(0, pre).map((text) => ({ op: ' ' as const, text })), ...ops, ...x.slice(x.length - suf).map((text) => ({ op: ' ' as const, text }))];
  // Hunks: runs of changes with `context` kept lines around them.
  const out: string[] = [];
  let added = 0;
  let removed = 0;
  let k = 0;
  let oldLine = 1;
  let newLine = 1;
  const lineAt: { o: number; n: number }[] = all.map((e) => {
    const at = { o: oldLine, n: newLine };
    if (e.op !== '+') oldLine++;
    if (e.op !== '-') newLine++;
    return at;
  });
  while (k < all.length) {
    if (all[k].op === ' ') {
      k++;
      continue;
    }
    const start = Math.max(0, k - context);
    let end = k;
    // Stretch over changes that are close together.
    while (end < all.length) {
      if (all[end].op !== ' ') {
        end++;
        continue;
      }
      let run = 0;
      while (end + run < all.length && all[end + run].op === ' ') run++;
      if (end + run >= all.length || run > context * 2) {
        end = Math.min(all.length, end + context);
        break;
      }
      end += run;
    }
    const part = all.slice(start, end);
    const oldCount = part.filter((e) => e.op !== '+').length;
    const newCount = part.filter((e) => e.op !== '-').length;
    const o = oldCount ? lineAt[start].o : lineAt[start].o - 1;
    const nn = newCount ? lineAt[start].n : lineAt[start].n - 1;
    out.push(`@@ -${o},${oldCount} +${nn},${newCount} @@`);
    for (const e of part) {
      out.push(`${e.op}${e.text}`);
      if (e.op === '+') added++;
      if (e.op === '-') removed++;
    }
    k = end;
  }
  return { diff: out.join('\n'), added, removed };
}
