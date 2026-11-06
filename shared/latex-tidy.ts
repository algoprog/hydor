// Tidy the source (the LaTeX editor's Edit → Tidy the source, and page_action tidy_source): each line indented by
// what it is in, as latexindent does it: the inside of an environment one step in (the document's own body not), a list's
// items one step in and the lines that go on an item one more, and the lines inside a { group or \[ … \] left open on an
// earlier line one step in; and a table's rows (tabular, longtable, array, the matrices) with their cells padded so the
// & and \\ line up, rows that span cells (\multicolumn) or lines left as they were. Verbatim text is left exactly as it is,
// and so is every line's own text: only the spaces before it, the spaces at its end and the spaces around a row's & and
// \\ change. The step is the file's own (a tab, or the spaces it indents by most), two spaces when it has none. A source
// whose braces or environments do not pair is indented by its environments alone.

import { VERBATIM_ENVS } from './latex-ai.ts';

export interface TidyOptions {
  /** The indent step; the file's own when left out. */
  indent?: string;
  /** Only these lines (from 1, both included) change; all when left out. */
  from?: number;
  to?: number;
  /** Line the table's cells up (true when left out). */
  align?: boolean;
}

export interface Tidied {
  text: string;
  /** How many lines changed. */
  lines: number;
  /** How many tables had their cells lined up. */
  tables: number;
}

const LISTS = new Set(['itemize', 'enumerate', 'description', 'compactitem', 'compactenum', 'inparaenum', 'asparaenum', 'list', 'trivlist']);
/** Environments whose rows are lined up at their &. */
export const TABLE_ENVS = new Set(['tabular', 'tabular*', 'tabularx', 'tabulary', 'longtable', 'longtable*', 'supertabular', 'xtabular', 'tabu', 'array', 'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'NiceTabular', 'NiceArray', 'tblr', 'longtblr']);
/** Environments whose inside is not indented. */
const FLAT = new Set(['document']);

/** The step a file indents by: a tab, or the number of spaces it indents by most (2 when it does not). */
export function indentOf(text: string): string {
  let tabs = 0;
  const steps = new Map<number, number>();
  let prev = 0;
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    const lead = /^[ \t]*/.exec(l)![0];
    if (lead.includes('\t')) tabs++;
    const n = lead.replace(/\t/g, '    ').length;
    if (n > prev) steps.set(n - prev, (steps.get(n - prev) ?? 0) + 1);
    prev = n;
  }
  const best = [...steps.entries()].filter(([n]) => n >= 2 && n <= 8).sort((a, b) => b[1] - a[1])[0];
  if (tabs > (best?.[1] ?? 0)) return '\t';
  return ' '.repeat(best?.[0] ?? 2);
}

interface Ctx {
  kind: 'env' | 'brace' | 'display' | 'item';
  name?: string;
  /** Its inside is indented. */
  indents: boolean;
  /** The line it was opened on: what opens on one line is one step, however many it is. */
  line: number;
}

/** What a line opens and closes, in order: \begin, \end, {, }, \[, \], \item; comments and escaped characters passed over. */
function tokens(line: string): { t: 'begin' | 'end' | 'open' | 'close' | 'dopen' | 'dclose' | 'item'; name?: string; at: number; end: number }[] {
  const out: { t: 'begin' | 'end' | 'open' | 'close' | 'dopen' | 'dclose' | 'item'; name?: string; at: number; end: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '%') break;
    if (c === '{') out.push({ t: 'open', at: i, end: i + 1 });
    else if (c === '}') out.push({ t: 'close', at: i, end: i + 1 });
    else if (c === '\\') {
      const env = /^\\(begin|end)\s*\{([^{}]*)\}/.exec(line.slice(i));
      if (env) {
        out.push({ t: env[1] as 'begin' | 'end', name: env[2].trim(), at: i, end: i + env[0].length });
        i += env[0].length - 1;
        continue;
      }
      if (line[i + 1] === '[') {
        out.push({ t: 'dopen', at: i, end: i + 2 });
        i++;
        continue;
      }
      if (line[i + 1] === ']') {
        out.push({ t: 'dclose', at: i, end: i + 2 });
        i++;
        continue;
      }
      if (/^\\item(?![A-Za-z])/.test(line.slice(i))) {
        out.push({ t: 'item', at: i, end: i + 5 });
        i += 4;
        continue;
      }
      if (line.startsWith('\\verb', i) && !/[A-Za-z]/.test(line[i + 5] ?? '')) {
        const at = line[i + 5] === '*' ? i + 6 : i + 5;
        const e = line.indexOf(line[at], at + 1);
        if (e > 0) {
          i = e;
          continue;
        }
      }
      // A command's name, or an escaped character (\{, \}, \\, \%): passed over.
      const cmd = /^\\[A-Za-z@]+/.exec(line.slice(i));
      i += cmd ? cmd[0].length - 1 : 1;
    }
  }
  return out;
}

/**
 * The lines indented (see the file's head); `braces`: { groups left open indent too. An \item opens what goes on it, to
 * the next \item or the list's end, so the lines that go on an item hang one step in from it. `verbatim`: the lines
 * kept exactly as they are.
 */
function indentLines(lines: string[], step: string, braces: boolean, inRange: (n: number) => boolean): { out: string[]; balanced: boolean; verbatim: Set<number> } {
  const out: string[] = [];
  const stack: Ctx[] = [];
  const kept = new Set<number>();
  let verbatim: string | null = null;
  const depth = () => new Set(stack.filter((c) => c.indents).map((c) => c.line)).size;
  const top = () => stack[stack.length - 1];
  const popEnv = (name: string) => {
    for (let k = stack.length - 1; k >= 0; k--)
      if (stack[k].kind === 'env' && stack[k].name === name) {
        stack.length = k;
        return;
      }
  };
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (verbatim !== null) {
      out.push(line);
      kept.add(n);
      if (line.includes(`\\end{${verbatim}}`)) verbatim = null;
      continue;
    }
    const text = line.trim();
    const toks = tokens(text);
    // What closes at the line's start counts before its indent: \end{…}, } and \] at its start; an \item ends the one before.
    let k = 0;
    for (; k < toks.length; k++) {
      const t = toks[k];
      if (text.slice(k ? toks[k - 1].end : 0, t.at).trim()) break;
      if (t.t === 'end' && stack.some((c) => c.kind === 'env' && c.name === t.name)) popEnv(t.name!);
      else if (t.t === 'close' && top()?.kind === 'brace') stack.pop();
      else if (t.t === 'dclose' && top()?.kind === 'display') stack.pop();
      else {
        if (t.t === 'item' && top()?.kind === 'item') stack.pop();
        break;
      }
    }
    const want = text ? step.repeat(depth()) + text : '';
    out.push(inRange(n + 1) ? want : line);
    for (; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'begin') {
        if (VERBATIM_ENVS.has(t.name!)) {
          if (!text.slice(t.end).includes(`\\end{${t.name}}`)) verbatim = t.name!;
          break;
        }
        stack.push({ kind: 'env', name: t.name, indents: !FLAT.has(t.name!), line: n });
      } else if (t.t === 'end') popEnv(t.name!);
      else if (t.t === 'open') stack.push({ kind: 'brace', indents: braces, line: n });
      else if (t.t === 'close') {
        if (top()?.kind === 'brace') stack.pop();
      } else if (t.t === 'dopen') stack.push({ kind: 'display', indents: true, line: n });
      else if (t.t === 'dclose') {
        if (top()?.kind === 'display') stack.pop();
      } else if (t.t === 'item') {
        if (top()?.kind === 'item') stack.pop();
        if (top()?.kind === 'env' && LISTS.has(top().name!)) stack.push({ kind: 'item', indents: true, line: n });
      }
    }
  }
  return { out, balanced: !stack.some((c) => c.kind !== 'item') && verbatim === null, verbatim: kept };
}

/** A row's cells split at its & (not an escaped one, not one inside braces), and what follows its \\; null when it is no row. */
function rowOf(text: string): { cells: string[]; rest: string } | null {
  const cells: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '%') return null;
    if (c === '\\') {
      if (text[i + 1] === '\\' && depth === 0) {
        cells.push(text.slice(start, i).trim());
        return { cells, rest: text.slice(i + 2).trim() };
      }
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '&' && depth === 0) {
      cells.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return null;
}

const width = (s: string) => Array.from(s).length;

/** The rows of the tables in the lines given lined up at their & (see the file's head); how many tables. */
function alignTables(lines: string[], inRange: (n: number) => boolean): number {
  let tables = 0;
  for (let n = 0; n < lines.length; n++) {
    const open = /\\begin\s*\{([^{}]+)\}/.exec(lines[n]);
    if (!open || !TABLE_ENVS.has(open[1].trim())) continue;
    const name = open[1].trim();
    // Its rows: the lines up to its \end (a table inside it ends the search: it is lined up on its own).
    const rows: { n: number; lead: string; cells: string[]; rest: string }[] = [];
    let end = -1;
    let nested = false;
    for (let m = n + 1; m < lines.length; m++) {
      const l = lines[m];
      if (new RegExp(`\\\\end\\s*\\{${name.replace(/[*]/g, '\\*')}\\}`).test(l)) {
        end = m;
        break;
      }
      if (/\\begin\s*\{/.test(l) && [...l.matchAll(/\\begin\s*\{([^{}]+)\}/g)].some((x) => TABLE_ENVS.has(x[1].trim()))) {
        nested = true;
        break;
      }
      const text = l.trim();
      if (!text.includes('&') || /\\multicolumn|\\multirow|\\SetCell/.test(text)) continue;
      const r = rowOf(text);
      // A row must end on its own line, and not be the start of one that goes on (no & on the line before it unclosed).
      if (!r || r.cells.length < 2) continue;
      rows.push({ n: m, lead: /^[ \t]*/.exec(l)![0], ...r });
    }
    if (end < 0 || nested || rows.length < 2 || !rows.every((r) => inRange(r.n + 1))) continue;
    const cols = Math.max(...rows.map((r) => r.cells.length));
    const widths = Array.from({ length: cols }, (_, j) => Math.max(0, ...rows.map((r) => (r.cells[j] !== undefined ? width(r.cells[j]) : 0))));
    let changed = false;
    for (const r of rows) {
      const body = r.cells.map((c, j) => c + ' '.repeat(widths[j] - width(c))).join(' & ');
      const next = `${r.lead}${body} \\\\${r.rest ? (/^\[/.test(r.rest) ? r.rest : ` ${r.rest}`) : ''}`;
      if (next !== lines[r.n]) {
        lines[r.n] = next;
        changed = true;
      }
    }
    if (changed) tables++;
    n = end;
  }
  return tables;
}

/** The source tidied (see the file's head): its text, and how many lines and tables changed. */
export function tidyTex(text: string, o: TidyOptions = {}): Tidied {
  const lines = text.split('\n');
  const step = o.indent ?? indentOf(text);
  const from = Math.max(1, o.from ?? 1);
  const to = Math.min(lines.length, o.to ?? lines.length);
  const inRange = (n: number) => n >= from && n <= to;
  let r = indentLines(lines, step, true, inRange);
  if (!r.balanced) r = indentLines(lines, step, false, inRange);
  // Spaces at lines' ends go, and a line of spaces alone becomes empty; verbatim text stays exactly as it is.
  const mine = (i: number) => inRange(i + 1) && !r.verbatim.has(i);
  const out = r.out.map((l, i) => (mine(i) ? l.replace(/[ \t]+$/, '') : l));
  const tables = o.align === false ? 0 : alignTables(out, (n) => mine(n - 1));
  let changed = 0;
  for (let i = 0; i < out.length; i++) if (out[i] !== lines[i]) changed++;
  return { text: out.join('\n'), lines: changed, tables };
}
