// Tables for the LaTeX editor's table editor: a grid of cells (with each column's alignment, a header row, the lines
// between rows as booktabs draws them or as plain \hline, a caption and a label) written out as a table environment,
// and read back from a simple tabular where the cursor is (no merged cells), with the table environment around it.
// Cells hold LaTeX; what would break a table there (&, %, #, and _ outside maths) is escaped going in and shown plain
// coming back.

export type ColAlign = 'l' | 'c' | 'r';
/** booktabs' rules (top, under the header, bottom); \hline at the top, under the header and at the bottom; \hline under every row; none. */
export type TableLines = 'booktabs' | 'hline' | 'all' | 'none';

export interface TexTable {
  rows: string[][];
  align: ColAlign[];
  /** The first row is a header: a line under it. */
  header: boolean;
  lines: TableLines;
  /** Lines between columns (|), as plain tables have them. */
  rules: boolean;
  caption: string;
  label: string;
  /** In a table environment (a float with its caption), or the tabular alone. */
  float: boolean;
}

export const TABLE_LIMITS = { rows: 200, cols: 30, cell: 2000 };

export function blankTable(rows = 3, cols = 3): TexTable {
  return {
    rows: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? `Heading ${c + 1}` : ''))),
    align: Array.from({ length: cols }, (_, i) => (i === 0 ? 'l' : 'c')),
    header: true,
    lines: 'booktabs',
    rules: false,
    caption: '',
    label: '',
    float: true,
  };
}

/** Where maths starts and ends in a cell's text: [from, to) ranges ($…$ and \(…\)). */
function mathRanges(s: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /(?<!\\)\$((?:\\.|[^$\\])*)\$|\\\((?:[\s\S]*?)\\\)/g;
  for (let m = re.exec(s); m; m = re.exec(s)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** A cell as LaTeX: &, % and # escaped where they are not already, and _ and ^ too outside maths; lines become spaces. */
export function cellTex(s: string): string {
  const t = s.replace(/\r?\n/g, ' ').trim();
  const maths = mathRanges(t);
  const inMath = (i: number) => maths.some(([a, b]) => i > a && i < b - 1);
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') {
      out += t.slice(i, i + 2);
      i++;
      continue;
    }
    if (c === '&' || c === '%' || c === '#') out += `\\${c}`;
    else if ((c === '_' || c === '^') && !inMath(i)) out += c === '_' ? '\\_' : '\\^{}';
    else out += c;
  }
  return out;
}

/** A cell as the grid shows it: the escapes cellTex makes taken back out (outside maths). */
export function cellText(tex: string): string {
  const t = tex.trim();
  const maths = mathRanges(t);
  const inMath = (i: number) => maths.some(([a, b]) => i > a && i < b - 1);
  let out = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && /[&%#_]/.test(t[i + 1] ?? '') && !inMath(i)) {
      out += t[i + 1];
      i++;
    } else if (t.startsWith('\\^{}', i) && !inMath(i)) {
      out += '^';
      i += 3;
    } else if (t[i] === '\\') {
      out += t.slice(i, i + 2);
      i++;
    } else out += t[i];
  }
  return out;
}

/** A label's name from words: "Results and costs" → "tab:results-and-costs". */
export const tableLabelOf = (caption: string) =>
  `tab:${
    caption
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'table'
  }`;

/** The table as LaTeX (indented by `indent`), and the packages it needs. */
export function tableTex(t: TexTable, indent = ''): { text: string; needs: string[] } {
  const cols = Math.max(1, ...t.rows.map((r) => r.length), t.align.length);
  const rows = t.rows.map((r) => Array.from({ length: cols }, (_, i) => cellTex(r[i] ?? '')));
  const align = Array.from({ length: cols }, (_, i) => t.align[i] ?? 'l');
  const spec = t.rules ? `|${align.join('|')}|` : align.join('');
  const bk = t.lines === 'booktabs';
  const hl = t.lines === 'hline' || t.lines === 'all';
  const top = bk ? '\\toprule' : hl ? '\\hline' : '';
  const mid = bk ? '\\midrule' : hl ? '\\hline' : '';
  const bottom = bk ? '\\bottomrule' : hl ? '\\hline' : '';
  // Each column as wide as its widest cell, so the source reads as a table too (within reason).
  const widths = Array.from({ length: cols }, (_, i) => Math.min(24, Math.max(...rows.map((r) => r[i].length))));
  const line = (r: string[]) => `${r.map((c, i) => (i < r.length - 1 ? c.padEnd(widths[i]) : c)).join(' & ')} \\\\`;
  const inner = t.float ? `${indent}  ` : indent;
  const body: string[] = [];
  body.push(`${inner}\\begin{tabular}{${spec}}`);
  if (top) body.push(`${inner}  ${top}`);
  rows.forEach((r, i) => {
    body.push(`${inner}  ${line(r)}`);
    if (i < rows.length - 1 && mid && (t.lines === 'all' || (i === 0 && t.header))) body.push(`${inner}  ${mid}`);
  });
  if (bottom) body.push(`${inner}  ${bottom}`);
  body.push(`${inner}\\end{tabular}`);
  const needs = bk ? ['booktabs'] : [];
  if (!t.float) return { text: body.join('\n'), needs };
  const label = t.label.trim() || (t.caption.trim() ? tableLabelOf(t.caption) : '');
  const out = [`${indent}\\begin{table}[htbp]`, `${indent}  \\centering`];
  if (t.caption.trim()) out.push(`${indent}  \\caption{${t.caption.trim().replace(/\r?\n/g, ' ')}}`);
  if (label) out.push(`${indent}  \\label{${label}}`);
  out.push(...body, `${indent}\\end{table}`);
  return { text: out.join('\n'), needs };
}

/** The text in braces that starts at s[i] ("{" there), and where it ends. */
function group(s: string, i: number): { text: string; end: number } | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') j++;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { text: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

/** `s` split at `sep` where it is at the top level: not in braces, not in maths, not escaped. */
function splitTop(s: string, sep: '&' | '\\\\'): string[] {
  const out: string[] = [];
  let depth = 0;
  let math = false;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (sep === '\\\\' && s[i + 1] === '\\' && depth === 0 && !math) {
        out.push(s.slice(from, i));
        // A row's end may say how much space comes after it: \\[4pt].
        let j = i + 2;
        if (s[j] === '[') j = s.indexOf(']', j) + 1 || j;
        from = j;
        i = j - 1;
        continue;
      }
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '$') math = !math;
    else if (c === sep && depth === 0 && !math) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
  }
  out.push(s.slice(from));
  return out;
}

/** The columns of a tabular's spec ("|l|c|r|", "lp{3cm}X"): each one's alignment, and whether there are | lines. */
function columnsOf(spec: string): { align: ColAlign[]; rules: boolean } {
  const align: ColAlign[] = [];
  let rules = false;
  for (let i = 0; i < spec.length; i++) {
    const c = spec[i];
    if (c === '|') rules = true;
    else if (c === 'l' || c === 'c' || c === 'r') align.push(c);
    else if (c === 'p' || c === 'm' || c === 'b' || c === 'X' || c === 'L' || c === 'C' || c === 'R' || c === 'S') {
      align.push(c === 'C' || c === 'S' ? 'c' : c === 'R' ? 'r' : 'l');
      if (spec[i + 1] === '{') i = (group(spec, i + 1)?.end ?? i + 1) - 1;
    } else if ((c === '@' || c === '!' || c === '>' || c === '<') && spec[i + 1] === '{') i = (group(spec, i + 1)?.end ?? i + 1) - 1;
    else if (c === '*' && spec[i + 1] === '{') {
      // *{3}{c}: three of them.
      const n = group(spec, i + 1);
      const what = n ? group(spec, n.end) : null;
      if (n && what) {
        const inner = columnsOf(what.text);
        for (let k = 0; k < Math.min(30, Number(n.text) || 0); k++) align.push(...inner.align);
        rules ||= inner.rules;
        i = what.end - 1;
      }
    }
  }
  return { align, rules };
}

export interface FoundTable {
  /** What the editor replaces: the table environment around the tabular when there is one, else the tabular. */
  from: number;
  to: number;
  table: TexTable;
}

const RULE = /\\(toprule|midrule|bottomrule|hline|cline\s*\{[^}]*\}|cmidrule\s*(\([^)]*\))?\s*\{[^}]*\}|addlinespace(\s*\[[^\]]*\])?|specialrule\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}|hhline\s*\{[^}]*\})/g;

/**
 * The simple table around `pos` in `text`, read into a grid; or why it cannot be (no table there, or merged cells the
 * grid has no way to show).
 */
export function tableAt(text: string, pos: number): FoundTable | { why: string } {
  const spans: { b: RegExpMatchArray; endAt: number; endLen: number }[] = [];
  for (const b of text.matchAll(/\\begin\s*\{(tabular\*?|tabularx|tabulary)\}/g)) {
    const endRe = new RegExp(`\\\\end\\s*\\{${b[1].replace('*', '\\*')}\\}`, 'g');
    endRe.lastIndex = b.index!;
    const e = endRe.exec(text);
    if (e) spans.push({ b, endAt: e.index, endLen: e[0].length });
  }
  let found = spans.filter((x) => x.b.index! <= pos && pos <= x.endAt + x.endLen).pop() ?? null;
  if (!found) {
    // On the table's caption or label: the tabular in that table.
    for (const t of text.matchAll(/\\begin\s*\{table\*?\}/g)) {
      const close = /\\end\s*\{table\*?\}/g;
      close.lastIndex = t.index!;
      const c = close.exec(text);
      if (c && t.index! <= pos && pos <= c.index + c[0].length) found = spans.find((x) => x.b.index! > t.index! && x.endAt < c.index) ?? null;
    }
  }
  if (!found) return { why: 'The cursor is not in a table.' };
  const env = found.b[1];
  // The spec: tabular{spec}, tabular*{width}{spec}, tabularx{width}{spec}.
  let at = found.b.index! + found.b[0].length;
  while (text[at] === ' ' || text[at] === '\n') at++;
  if (text[at] === '[') at = text.indexOf(']', at) + 1;
  if (env !== 'tabular') {
    const w = group(text, at);
    if (!w) return { why: 'This table could not be read.' };
    at = w.end;
  }
  const spec = group(text, at);
  if (!spec) return { why: 'This table could not be read.' };
  const body = text.slice(spec.end, found.endAt);
  if (/\\multi(column|row)\b/.test(body)) return { why: 'This table has merged cells, which the grid cannot show: change it in the source.' };
  const { align, rules } = columnsOf(spec.text);
  const found0 = /\\(toprule|midrule|bottomrule)\b/.test(body) ? 'booktabs' : /\\hline\b/.test(body) ? 'hline' : 'none';
  const rows: string[][] = [];
  // Whether a rule comes after each row (what comes before a row's cells follows the row before).
  const ruled: boolean[] = [];
  for (const raw of splitTop(body, '\\\\')) {
    const clean = raw
      .split('\n')
      .map((l) => l.replace(/(^|[^\\])%.*$/, '$1'))
      .join('\n');
    if (rows.length && /\\(midrule|hline)\b/.test(clean)) ruled[rows.length - 1] = true;
    const cellsText = clean.replace(RULE, ' ').trim();
    if (!cellsText) continue;
    rows.push(splitTop(cellsText, '&').map((c) => cellText(c.replace(/\s+/g, ' '))));
  }
  if (!rows.length) return { why: 'This table is empty.' };
  const header = !!ruled[0] && rows.length > 1;
  const lines: TableLines = found0 === 'booktabs' ? 'booktabs' : found0 === 'hline' ? (rows.length > 2 && rows.slice(0, -1).every((_, i) => ruled[i]) ? 'all' : 'hline') : 'none';
  if (rows.length > TABLE_LIMITS.rows) return { why: `This table has over ${TABLE_LIMITS.rows} rows: change it in the source.` };
  const cols = Math.max(align.length, ...rows.map((r) => r.length));
  if (cols > TABLE_LIMITS.cols) return { why: `This table has over ${TABLE_LIMITS.cols} columns: change it in the source.` };
  // The table environment around it, when there is one, with its caption and label.
  let from = found.b.index!;
  let to = found.endAt + found.endLen;
  let caption = '';
  let label = '';
  let float = false;
  const before = text.slice(0, from);
  const open = [...before.matchAll(/\\begin\s*\{table\*?\}(\s*\[[^\]]*\])?/g)].pop();
  if (open) {
    const closeRe = /\\end\s*\{table\*?\}/g;
    closeRe.lastIndex = to;
    const close = closeRe.exec(text);
    const between = text.slice(open.index! + open[0].length, from);
    const after = close ? text.slice(to, close.index) : '';
    // Only a table that holds this tabular alone (and its caption, label, \centering) is replaced whole.
    const rest = `${between}\n${after}`;
    if (close && !/\\end\s*\{table\*?\}/.test(between) && !/\\begin\s*\{(tabular|figure|table)/.test(rest)) {
      const cap = /\\caption\s*(\[[^\]]*\])?\s*\{/.exec(rest);
      if (cap) caption = group(rest, cap.index + cap[0].length - 1)?.text.trim() ?? '';
      label = /\\label\s*\{([^{}]*)\}/.exec(rest)?.[1].trim() ?? '';
      const extra = rest
        .replace(/\\caption\s*(\[[^\]]*\])?\s*\{/, '')
        .replace(caption, '')
        .replace(/\\label\s*\{[^{}]*\}/, '')
        .replace(/\\centering|\\small|\\footnotesize|%.*$/gm, '')
        .replace(/[{}\s]/g, '');
      if (!extra) {
        from = open.index!;
        to = close.index + close[0].length;
        float = true;
      }
    }
  }
  return {
    from,
    to,
    table: {
      rows: rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? '')),
      align: Array.from({ length: cols }, (_, i) => align[i] ?? 'l'),
      header: lines === 'all' ? true : header,
      lines,
      rules,
      caption,
      label,
      float,
    },
  };
}
