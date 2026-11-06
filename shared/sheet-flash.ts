// Fill with AI's own part, as Excel's Flash Fill: from a few cells of a column filled in by hand, the pattern that makes
// each of them from the values beside it (a word taken, a part split off, words joined, their case changed, initials,
// digits), found here, for nothing, and used on the rest of the column. When no pattern fits every example, the editor
// asks the helper model instead (server/write/sheets.ts). Nothing here needs Node or a browser.

/** How words are changed after they are taken. */
type Case = 'same' | 'upper' | 'lower' | 'proper';

/** A piece of a value: the value, a word of it, a part between delimiters, a word's first letter, its digits, its first or last characters. */
type Atom =
  | { k: 'whole'; col: number; cs: Case }
  | { k: 'word'; col: number; i: number; cs: Case }
  | { k: 'part'; col: number; d: string; i: number; cs: Case }
  | { k: 'initial'; col: number; i: number; cs: Case }
  | { k: 'initials'; col: number; cs: Case }
  | { k: 'digits'; col: number }
  | { k: 'left'; col: number; n: number; cs: Case }
  | { k: 'right'; col: number; n: number; cs: Case };

type Step = Atom | { k: 'const'; s: string };

const DELIMS = [',', ';', '-', '/', '@', '.', '_', '|', ':', '(', ')', '#'];

const caseOf = (s: string, cs: Case) =>
  cs === 'upper' ? s.toUpperCase() : cs === 'lower' ? s.toLowerCase() : cs === 'proper' ? s.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_m, p, ch) => p + ch.toUpperCase()) : s;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const at = <T>(list: T[], i: number): T | undefined => (i >= 0 ? list[i] : list[list.length + i]);

/** An atom's words for a row (null: the row has no such piece). */
function value(a: Atom, row: string[]): string | null {
  const v = row[a.col] ?? '';
  let out: string | undefined;
  switch (a.k) {
    case 'whole':
      out = v.trim();
      break;
    case 'word':
      out = at(words(v), a.i);
      break;
    case 'part': {
      const parts = v.split(a.d);
      out = parts.length > 1 ? at(parts, a.i)?.trim() : undefined;
      break;
    }
    case 'initial':
      out = at(words(v), a.i)?.[0];
      break;
    case 'initials': {
      const w = words(v);
      out = w.length > 1 ? w.map((x) => x[0]).join('') : undefined;
      break;
    }
    case 'digits': {
      const d = v.replace(/\D+/g, '');
      return d || null;
    }
    case 'left':
      out = v.length >= a.n ? v.slice(0, a.n) : undefined;
      break;
    case 'right':
      out = v.length >= a.n ? v.slice(-a.n) : undefined;
      break;
  }
  return out ? caseOf(out, a.cs) : null;
}

/** Every piece of the values of one row, with what each gives (the first example's). */
function atomsOf(row: string[], cols: number[]): { a: Atom; s: string }[] {
  const out: { a: Atom; s: string }[] = [];
  const cases: Case[] = ['same', 'upper', 'lower', 'proper'];
  for (const col of cols) {
    const v = row[col] ?? '';
    if (!v.trim()) continue;
    const ws = words(v);
    const shapes: Atom[] = [{ k: 'whole', col, cs: 'same' }, { k: 'digits', col }, { k: 'initials', col, cs: 'same' }];
    ws.forEach((_, i) => {
      shapes.push({ k: 'word', col, i, cs: 'same' }, { k: 'word', col, i: i - ws.length, cs: 'same' }, { k: 'initial', col, i, cs: 'same' }, { k: 'initial', col, i: i - ws.length, cs: 'same' });
    });
    for (const d of DELIMS) {
      const parts = v.split(d);
      if (parts.length < 2) continue;
      parts.forEach((_, i) => shapes.push({ k: 'part', col, d, i, cs: 'same' }, { k: 'part', col, d, i: i - parts.length, cs: 'same' }));
    }
    for (let n = 1; n <= Math.min(12, v.length - 1); n++) shapes.push({ k: 'left', col, n, cs: 'same' }, { k: 'right', col, n, cs: 'same' });
    for (const shape of shapes)
      for (const cs of 'cs' in shape ? cases : (['same'] as Case[])) {
        const a = ('cs' in shape ? { ...shape, cs } : shape) as Atom;
        const s = value(a, row);
        if (s) out.push({ a, s });
      }
  }
  return out;
}

/** What a program gives for a row (null when one of its pieces is not there). */
function run(p: Step[], row: string[]): string | null {
  let out = '';
  for (const st of p) {
    if (st.k === 'const') out += st.s;
    else {
      const v = value(st, row);
      if (v === null) return null;
      out += v;
    }
  }
  return out;
}

/** Programs that write `target` from the pieces of the first example's row: pieces where they fit, other characters as they are. */
function programsFor(target: string, pieces: { a: Atom; s: string }[], limit = 4000): Step[][] {
  const out: Step[][] = [];
  // Longer pieces first: a whole value before its first letters.
  const byLen = [...pieces].sort((x, y) => y.s.length - x.s.length);
  const walk = (pos: number, steps: Step[]) => {
    if (out.length >= limit) return;
    if (pos === target.length) {
      if (steps.some((s) => s.k !== 'const')) out.push(steps);
      return;
    }
    for (const p of byLen) if (target.startsWith(p.s, pos)) walk(pos + p.s.length, [...steps, p.a]);
    // A character as it is (joined to the constant before it).
    const last = steps[steps.length - 1];
    const ch = target[pos];
    walk(pos + 1, last?.k === 'const' ? [...steps.slice(0, -1), { k: 'const', s: last.s + ch }] : [...steps, { k: 'const', s: ch }]);
  };
  walk(0, []);
  return out;
}

/** How simple a program is: fewer constants' characters, fewer steps, plainer pieces (lower is better). */
const cost = (p: Step[]) =>
  p.reduce((s, st) => s + (st.k === 'const' ? 3 * st.s.length : st.k === 'whole' ? 1 : st.k === 'left' || st.k === 'right' ? 4 : 2) + ('cs' in st && st.cs !== 'same' ? 0.5 : 0), 0) + p.length;

export interface FlashResult {
  /** What each row to fill gets (null where its pieces are not there). */
  outputs: (string | null)[];
  /** The pattern, in words, for the note that says it was used. */
  how: string;
}

/**
 * A pattern that makes every example's words from the values beside it, used on the rows to fill; null when none
 * fits them all (then the helper model is asked). `cols`: the columns to take pieces from (their places in each row).
 */
export function flashFill(examples: { inputs: string[]; output: string }[], rows: string[][], cols?: number[]): FlashResult | null {
  const ex = examples.filter((e) => e.output.trim() !== '');
  if (!ex.length || !rows.length) return null;
  const width = Math.max(...ex.map((e) => e.inputs.length), ...rows.map((r) => r.length));
  const use = cols ?? Array.from({ length: width }, (_, i) => i);
  const first = ex[0];
  const progs = programsFor(first.output, atomsOf(first.inputs, use));
  const fits = progs.filter((p) => ex.every((e) => run(p, e.inputs) === e.output)).sort((x, y) => cost(x) - cost(y));
  // One example alone fits too many patterns to tell: a pattern then must keep to the plainest pieces.
  const best = ex.length === 1 ? fits.find((p) => p.every((st) => st.k === 'const' || st.k === 'whole' || st.k === 'word' || st.k === 'part' || st.k === 'initial' || st.k === 'initials')) : fits[0];
  if (!best) return null;
  return { outputs: rows.map((r) => run(best, r)), how: describe(best) };
}

const ORD = ['first', 'second', 'third', 'fourth', 'fifth'];
const ord = (i: number) => (i >= 0 ? (ORD[i] ?? `${i + 1}th`) : i === -1 ? 'last' : `${ORD[-i - 1] ?? `${-i}th`} from the end`);
const caseWords: Record<Case, string> = { same: '', upper: ' in capitals', lower: ' in small letters', proper: ' with capitals first' };

function describe(p: Step[]): string {
  const part = (st: Step) => {
    if (st.k === 'const') return `“${st.s}”`;
    const c = 'cs' in st ? caseWords[st.cs] : '';
    switch (st.k) {
      case 'whole':
        return `the value${c}`;
      case 'word':
        return `the ${ord(st.i)} word${c}`;
      case 'part':
        return `the ${ord(st.i)} part split at “${st.d}”${c}`;
      case 'initial':
        return `the ${ord(st.i)} word’s first letter${c}`;
      case 'initials':
        return `the initials${c}`;
      case 'digits':
        return 'the digits';
      case 'left':
        return `the first ${st.n} characters${c}`;
      case 'right':
        return `the last ${st.n} characters${c}`;
    }
  };
  return p.map(part).join(', then ');
}
