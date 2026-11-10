export function diffLines(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) throw new TypeError('a and b must be arrays');
  const n = a.length;
  const m = b.length;
  // lcs[i][j]: length of the longest common subsequence of a.slice(i) and b.slice(j)
  const lcs = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'equal', line: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: 'delete', line: a[i++] });
    } else {
      out.push({ op: 'insert', line: b[j++] });
    }
  }
  while (i < n) out.push({ op: 'delete', line: a[i++] });
  while (j < m) out.push({ op: 'insert', line: b[j++] });
  return out;
}

export function applyDiff(a, diff) {
  if (!Array.isArray(a) || !Array.isArray(diff)) throw new TypeError('a and diff must be arrays');
  const out = [];
  let i = 0;
  for (const { op, line } of diff) {
    if (op === 'insert') {
      out.push(line);
    } else if (op === 'equal' || op === 'delete') {
      if (i >= a.length || a[i] !== line) throw new Error(`diff does not fit: line ${i} is not ${JSON.stringify(line)}`);
      i++;
      if (op === 'equal') out.push(line);
    } else {
      throw new Error(`unknown op: ${String(op)}`);
    }
  }
  if (i !== a.length) throw new Error('diff does not cover all of a');
  return out;
}
