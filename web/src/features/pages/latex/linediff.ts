// Two versions of a file compared line by line (Myers' way: the fewest lines taken out and put in), written as a
// unified diff with three lines of context round each change, as DiffView reads it, with how many lines were added
// and taken out. Very different long files are said to be all changed rather than worked out at length.

export interface LineDiff {
  /** The unified diff (empty when the texts are the same). */
  diff: string;
  added: number;
  removed: number;
}

type Op = { k: ' ' | '+' | '-'; line: string };

/** The edit script from a to b, or null when it would take too long (more than `max` changes). */
function myers(a: string[], b: string[], max: number): Op[] | null {
  // Lines as numbers, so they compare at once.
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
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(n + m, max); d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        // Back through the trace to the start: the script.
        const ops: Op[] = [];
        let cx = n;
        let cy = m;
        for (let dd = d; dd > 0; dd--) {
          const pv = trace[dd];
          const kk = cx - cy;
          const prevK = kk === -dd || (kk !== dd && pv[off + kk - 1] < pv[off + kk + 1]) ? kk + 1 : kk - 1;
          const px = pv[off + prevK];
          const py = px - prevK;
          while (cx > px && cy > py) {
            ops.push({ k: ' ', line: a[--cx] });
            cy--;
          }
          if (cx === px) ops.push({ k: '+', line: b[--cy] });
          else ops.push({ k: '-', line: a[--cx] });
        }
        while (cx > 0 && cy > 0) {
          ops.push({ k: ' ', line: a[--cx] });
          cy--;
        }
        return ops.reverse();
      }
    }
  }
  return null;
}

/** The unified diff from `a` to `b` (`name`: the file, in its header). */
export function lineDiff(a: string, b: string, name = 'file'): LineDiff {
  if (a === b) return { diff: '', added: 0, removed: 0 };
  const al = a.split('\n');
  const bl = b.split('\n');
  // The same lines at both ends need no working out.
  let s = 0;
  while (s < al.length && s < bl.length && al[s] === bl[s]) s++;
  let e = 0;
  while (e < al.length - s && e < bl.length - s && al[al.length - 1 - e] === bl[bl.length - 1 - e]) e++;
  const midA = al.slice(s, al.length - e);
  const midB = bl.slice(s, bl.length - e);
  const mid = myers(midA, midB, 4000) ?? [...midA.map((line) => ({ k: '-' as const, line })), ...midB.map((line) => ({ k: '+' as const, line }))];
  const ops: Op[] = [...al.slice(0, s).map((line) => ({ k: ' ' as const, line })), ...mid, ...al.slice(al.length - e).map((line) => ({ k: ' ' as const, line }))];
  let added = 0;
  let removed = 0;
  for (const o of ops) {
    if (o.k === '+') added++;
    else if (o.k === '-') removed++;
  }
  // Hunks: changes with three lines round them, joined where they touch.
  const CTX = 3;
  const out: string[] = [`--- a/${name}`, `+++ b/${name}`];
  let i = 0;
  let oldLine = 1;
  let newLine = 1;
  const lineNos: { o: number; n: number }[] = [];
  for (const o of ops) {
    lineNos.push({ o: oldLine, n: newLine });
    if (o.k !== '+') oldLine++;
    if (o.k !== '-') newLine++;
  }
  while (i < ops.length) {
    while (i < ops.length && ops[i].k === ' ') i++;
    if (i >= ops.length) break;
    let start = Math.max(0, i - CTX);
    let end = i;
    for (;;) {
      while (end < ops.length && ops[end].k !== ' ') end++;
      let same = 0;
      while (end + same < ops.length && ops[end + same].k === ' ') same++;
      if (end + same >= ops.length || same > CTX * 2) {
        end = Math.min(ops.length, end + Math.min(same, CTX));
        break;
      }
      end += same;
    }
    const part = ops.slice(start, end);
    const oCount = part.filter((o) => o.k !== '+').length;
    const nCount = part.filter((o) => o.k !== '-').length;
    const at = lineNos[start];
    out.push(`@@ -${oCount ? at.o : at.o - 1},${oCount} +${nCount ? at.n : at.n - 1},${nCount} @@`);
    for (const o of part) out.push(`${o.k}${o.line}`);
    i = end;
    start = end;
  }
  return { diff: out.join('\n'), added, removed };
}
