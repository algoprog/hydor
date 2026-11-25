// Output formatting.
export const MAX_LINE = 240;

export function cutLine(s) {
  s = s.replace(/\r$/, '');
  return s.length > MAX_LINE ? s.slice(0, MAX_LINE) + '…' : s;
}

export function displayName(d) {
  const sep = d.sep || '.';
  return d.container && d.container.length ? d.container.join(sep) + sep + d.name : d.name;
}

export function attrText(d, extra = []) {
  const a = [];
  if (d.exported) a.push(d.exported);
  if (d.access) a.push(d.access);
  if (d.implTrait) a.push(`impl ${d.implTrait}`);
  for (const x of d.attrs || []) a.push(x);
  if (d.group === 'objprop' || d.group === 'objprop-value') a.push('object property');
  if (d.group === 'local') a.push('local');
  if (d.isTestFile) a.push('test');
  for (const x of extra) a.push(x);
  let out = a.length ? ` (${a.join(', ')})` : '';
  if (d.heuristic) out += ' (heuristic extent' + (d.qualifiedUnverified ? ', container not verified' : '') + ')';
  if (d.errors) out += ` (${d.errors === true ? 'parse errors here' : d.errors}: extent unsure, verify before editing)`;
  return out;
}

export function headerLine(d, gap = '  ') {
  const range = `${d.startRow + 1}-${d.endRow + 1}`;
  if (d.kind === 're-export') return `${d.file}:${range}${gap}re-export ${d.name}`;
  return `${d.file}:${range}${gap}${d.kind} ${displayName(d)}${attrText(d)}`;
}

// Render the body of a declaration. opts: {maxLines, sig}
export function renderBody(d, lines, { maxLines = 120, sig = false } = {}) {
  let start = d.startRow;
  let end = d.endRow;
  let sigNote = null;
  if (sig) {
    let e = d.sigEndRow !== null && d.sigEndRow !== undefined ? d.sigEndRow : d.endRow;
    if (d.docEndRow !== null && d.docEndRow !== undefined && d.docEndRow > e) e = d.docEndRow;
    e = Math.min(e, d.endRow);
    if (e < d.endRow) {
      sigNote = `  … body omitted: ${d.endRow - e} more lines (sed -n '${e + 2},${d.endRow + 1}p' ${d.file}) …`;
    }
    end = e;
  }
  const total = end - start + 1;
  const w = String(end + 1).length;
  const fmt = (r) => `  ${String(r + 1).padStart(w)}  ${cutLine(lines[r] ?? '')}`;
  const out = [];
  if (total > maxLines) {
    const tail = Math.min(10, Math.max(1, Math.floor(maxLines * 0.4)));
    const head = Math.max(1, Math.floor(maxLines * 0.6));
    const omitted = total - head - tail;
    if (omitted > 0) {
      for (let r = start; r < start + head; r++) out.push(fmt(r));
      out.push(`  … ${omitted} lines omitted (sed -n '${start + head + 1},${end - tail + 1}p' ${d.file}) …`);
      for (let r = end - tail + 1; r <= end; r++) out.push(fmt(r));
    } else for (let r = start; r <= end; r++) out.push(fmt(r));
  } else for (let r = start; r <= end; r++) out.push(fmt(r));
  if (sigNote) out.push(sigNote);
  return out.join('\n');
}

// Fit a rendered body into `budget` characters by shrinking the line budget.
export function renderFitted(d, lines, { maxLines, sig, budget }) {
  let k = maxLines;
  let text = renderBody(d, lines, { maxLines: k, sig });
  while (text.length > budget && k > 8) {
    k = Math.max(8, Math.floor(k * 0.75));
    text = renderBody(d, lines, { maxLines: k, sig });
  }
  return text;
}

// Water-filling allocation: sizes -> per-item budgets that sum to <= total.
export function allocate(sizes, total) {
  const idx = sizes.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(sizes.length).fill(0);
  let remaining = total;
  for (let k = 0; k < idx.length; k++) {
    const share = remaining / (idx.length - k);
    const a = Math.min(idx[k][0], share);
    out[idx[k][1]] = Math.floor(a);
    remaining -= a;
  }
  return out;
}
