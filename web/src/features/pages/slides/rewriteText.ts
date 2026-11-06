// The words picked in a slide's text box as the writing helper takes them (a paragraph a line, **bold** and *italic*
// marked where some of them are and others not), and its answer put back in their place looking as they did: each new
// line in the paragraph it stands for (its bullet, level and alignment kept), in the look of the words it replaces.
import type { Para, Run, TextProps } from '@shared/slides';

/** Where words are picked in a box: from paragraph p0 at character o0 to paragraph p1 at character o1. */
export interface ParaRange {
  p0: number;
  o0: number;
  p1: number;
  o1: number;
}

const textOf = (p: Para) => p.runs.map((r) => r.t).join('');

/** All of a box's words, as a range. */
export const wholeRange = (paras: Para[]): ParaRange => ({ p0: 0, o0: 0, p1: Math.max(0, paras.length - 1), o1: paras.length ? textOf(paras[paras.length - 1]).length : 0 });

/** Whether a range picks nothing. */
export const emptyRange = (r: ParaRange) => r.p0 === r.p1 && r.o0 === r.o1;

/** A paragraph's runs from one character to another. */
function slice(runs: Run[], from: number, to: number): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const r of runs) {
    const a = Math.max(from, at);
    const b = Math.min(to, at + r.t.length);
    if (b > a) out.push({ ...r, t: r.t.slice(a - at, b - at) });
    at += r.t.length;
  }
  return out.filter((r) => r.t);
}

/** The runs a range picks, paragraph by paragraph. */
function picked(paras: Para[], r: ParaRange): Run[][] {
  const out: Run[][] = [];
  for (let p = r.p0; p <= r.p1 && p < paras.length; p++) {
    const len = textOf(paras[p]).length;
    out.push(slice(paras[p].runs, p === r.p0 ? r.o0 : 0, p === r.p1 ? r.o1 : len));
  }
  return out;
}

/** Whether some of the words picked are bold (or italic) and others not: then the marks say which. */
function mixed(lines: Run[][], box: Pick<TextProps, 'bold' | 'italic'>) {
  const runs = lines.flat().filter((x) => x.t.trim());
  const b = runs.map((x) => x.b ?? !!box.bold);
  const i = runs.map((x) => x.i ?? !!box.italic);
  return { b: b.includes(true) && b.includes(false), i: i.includes(true) && i.includes(false) };
}

/** The words a range picks, a paragraph a line, with **bold** and *italic* where they are mixed. */
export function rangeText(paras: Para[], r: ParaRange, box: Pick<TextProps, 'bold' | 'italic'> = {}): string {
  const lines = picked(paras, r);
  const m = mixed(lines, box);
  return lines
    .map((runs) =>
      runs
        .map((x) => {
          let t = x.t;
          if (m.i && (x.i ?? !!box.italic) && t.trim()) t = `*${t}*`;
          if (m.b && (x.b ?? !!box.bold) && t.trim()) t = `**${t}**`;
          return t;
        })
        .join('')
        // Two bold runs side by side are one bold stretch.
        .replace(/\*\*\*\*/g, ''),
    )
    .join('\n');
}

/** A line of the answer as runs in a look: **bold** and *italic* parts bold or italic, the rest as the look is. */
export function lineRuns(line: string, look: Omit<Run, 't'>, marks: { b: boolean; i: boolean }): Run[] {
  const base: Omit<Run, 't'> = { ...look };
  if (marks.b) delete base.b;
  if (marks.i) delete base.i;
  const out: Run[] = [];
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) out.push({ ...base, t: line.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ ...base, b: true, t: m[1].replace(/^\*(.+)\*$/, '$1') });
    else out.push({ ...base, i: true, t: m[2] });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ ...base, t: line.slice(at) });
  return out.filter((r) => r.t);
}

/** Runs next to each other that look the same, made one. */
function merged(runs: Run[]): Run[] {
  const out: Run[] = [];
  const same = (a: Run, b: Run) => JSON.stringify({ ...a, t: '' }) === JSON.stringify({ ...b, t: '' });
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    if (last && same(last, r)) last.t += r.t;
    else out.push({ ...r });
  }
  return out.length ? out : [{ t: '' }];
}

/** The look of the words where a range starts (the run there, else the one just before). */
function lookAt(paras: Para[], r: ParaRange): Omit<Run, 't'> {
  const runs = paras[r.p0]?.runs ?? [];
  let at = 0;
  let before: Run | undefined;
  for (const x of runs) {
    if (r.o0 >= at && r.o0 < at + x.t.length) return look(x);
    if (x.t.length && at + x.t.length <= r.o0) before = x;
    at += x.t.length;
  }
  return before ? look(before) : runs[0] ? look(runs[0]) : {};
}
const look = ({ t: _t, ...rest }: Run): Omit<Run, 't'> => rest;

/** A paragraph's own look: its bullet, level and alignment. */
const shapeOf = (p: Para | undefined): Omit<Para, 'runs'> => (p ? (({ runs: _r, ...rest }) => rest)(p) : {});

/**
 * The paragraphs with a range's words replaced by `text` (a paragraph a line): within one paragraph, its lines joined
 * there; across several, each line in the paragraph it stands for, lines past them in the last one's look.
 */
export function replaceRange(paras: Para[], r: ParaRange, text: string, box: Pick<TextProps, 'bold' | 'italic'> = {}): Para[] {
  const marks = mixed(picked(paras, r), box);
  const style = lookAt(paras, r);
  let lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (r.p0 === r.p1)
    lines = [
      lines
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' '),
    ];
  const head = slice(paras[r.p0]?.runs ?? [], 0, r.o0);
  const tailPara = paras[Math.min(r.p1, paras.length - 1)];
  const tail = slice(tailPara?.runs ?? [], r.o1, textOf(tailPara ?? { runs: [] }).length);
  const made: Para[] = lines.map((line, k) => {
    const runs = lineRuns(line, style, marks);
    const own = shapeOf(paras[Math.min(r.p0 + k, r.p1)]);
    return { ...own, runs: [...(k === 0 ? head : []), ...runs, ...(k === lines.length - 1 ? tail : [])] };
  });
  return [...paras.slice(0, r.p0), ...made.map((p) => ({ ...p, runs: merged(p.runs) })), ...paras.slice(r.p1 + 1)];
}
