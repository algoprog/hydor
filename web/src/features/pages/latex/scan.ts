// Where a LaTeX file's maths is: $…$ and \(…\) in the text, $$…$$, \[…\] and the display environments (equation, align,
// gather, multline…) on lines of their own, each with the formula between its delimiters. Comments and verbatim text
// are passed over, and a $ never runs past a blank line (a $ left open is not maths, it is a $ being typed). Kept per
// editor state (texSpans), so Visual mode, the formula preview and the Symbols panel ask it once a change. Also: the
// document's own macros (\newcommand, \DeclareMathOperator) as KaTeX takes them.
import { StateField, type EditorState } from '@codemirror/state';

export interface MathSpan {
  /** The whole of it, delimiters included. */
  from: number;
  to: number;
  /** The formula alone. */
  innerFrom: number;
  innerTo: number;
  display: boolean;
  /** The environment it is ("align*"), when it is one. */
  env?: string;
}

/** Environments whose body is maths on lines of its own. */
export const DISPLAY_ENVS = ['equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*', 'gather', 'gather*', 'multline', 'multline*', 'flalign', 'flalign*', 'eqnarray', 'eqnarray*', 'displaymath', 'math', 'dmath', 'dmath*'];
const DISPLAY = new Set(DISPLAY_ENVS);
/** Environments whose body is not TeX to read: passed over whole. */
export const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*']);

const BEGIN = /\\begin\s*\{([^{}\s]+)\}/y;

/** Whether the character at i is escaped by an odd number of backslashes before it. */
function escaped(s: string, i: number): boolean {
  let k = 0;
  for (let j = i - 1; j >= 0 && s[j] === '\\'; j--) k++;
  return k % 2 === 1;
}

/** Where `$` (or `$$`) closes, from i on, without crossing a blank line; -1 when it does not. */
function closeDollar(s: string, i: number, double: boolean): number {
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '\n' && /^\n[ \t]*\n/.test(s.slice(j, j + 40))) return -1;
    if (c === '%' && !double) {
      // A comment inside inline maths ends it as TeX reads it: give up on this one.
      return -1;
    }
    if (c === '$') {
      if (!double) return j;
      if (s[j + 1] === '$') return j;
    }
  }
  return -1;
}

/** Every maths span of a file's text, in order. */
export function mathSpans(s: string): MathSpan[] {
  const out: MathSpan[] = [];
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const c = s[i];
    if (c === '%') {
      const e = s.indexOf('\n', i);
      if (e < 0) break;
      i = e;
      continue;
    }
    if (c === '$') {
      const double = s[i + 1] === '$';
      const start = i + (double ? 2 : 1);
      const end = closeDollar(s, start, double);
      if (end < 0) {
        if (double) i++;
        continue;
      }
      out.push({ from: i, to: end + (double ? 2 : 1), innerFrom: start, innerTo: end, display: double });
      i = end + (double ? 1 : 0);
      continue;
    }
    if (c !== '\\') continue;
    const d = s[i + 1];
    if (d === '(' || d === '[') {
      const close = d === '(' ? '\\)' : '\\]';
      let j = i + 2;
      let end = -1;
      while (j < n) {
        const k = s.indexOf(close, j);
        if (k < 0) break;
        if (!escaped(s, k)) {
          end = k;
          break;
        }
        j = k + 1;
      }
      if (end < 0) {
        i++;
        continue;
      }
      out.push({ from: i, to: end + 2, innerFrom: i + 2, innerTo: end, display: d === '[' });
      i = end + 1;
      continue;
    }
    if (d === 'b' && s.startsWith('\\begin', i)) {
      BEGIN.lastIndex = i;
      const m = BEGIN.exec(s);
      if (!m) continue;
      const env = m[1];
      if (!DISPLAY.has(env) && !VERBATIM_ENVS.has(env)) {
        i += m[0].length - 1;
        continue;
      }
      const re = new RegExp(`\\\\end\\s*\\{${env.replace('*', '\\*')}\\}`, 'g');
      re.lastIndex = i + m[0].length;
      const e = re.exec(s);
      if (!e) {
        i += m[0].length - 1;
        continue;
      }
      if (!VERBATIM_ENVS.has(env)) out.push({ from: i, to: e.index + e[0].length, innerFrom: i + m[0].length, innerTo: e.index, display: env !== 'math', env });
      i = e.index + e[0].length - 1;
      continue;
    }
    if (d === 'v' && s.startsWith('\\verb', i) && !/[A-Za-z]/.test(s[i + 5] ?? '')) {
      // \verb|…|: passed over to its closing mark.
      const mark = s[i + 5];
      const e = mark ? s.indexOf(mark, i + 6) : -1;
      if (e > 0 && !s.slice(i + 6, e).includes('\n')) i = e;
      continue;
    }
    // Any other escape: the next character is not special.
    i++;
  }
  return out;
}

/** The span around pos (its delimiters count as in it), or null. */
export function mathAt(spans: MathSpan[], pos: number): MathSpan | null {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = spans[mid];
    if (pos < m.from) hi = mid - 1;
    else if (pos > m.to) lo = mid + 1;
    else return m;
  }
  return null;
}

/** The maths spans of an editor's text, worked out again as it changes. */
export const texSpans = StateField.define<MathSpan[]>({
  create: (s) => mathSpans(s.doc.toString()),
  update: (v, tr) => (tr.docChanged ? mathSpans(tr.state.doc.toString()) : v),
});

/** Whether the cursor (pos) is in maths, between its delimiters. */
export function inMathAt(state: EditorState, pos: number): boolean {
  const m = mathAt(state.field(texSpans, false) ?? mathSpans(state.doc.toString()), pos);
  return !!m && pos >= m.innerFrom && pos <= m.innerTo;
}

/** The formula of a span as KaTeX takes it: \label and \nonumber out, and amsmath's environments as KaTeX's own. */
export function katexOf(s: string, m: MathSpan): string {
  let t = s.slice(m.innerFrom, m.innerTo);
  t = t.replace(/\\label\s*\{[^{}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '');
  const env = m.env?.replace('*', '');
  if (env === 'align' || env === 'flalign') t = `\\begin{aligned}${t}\\end{aligned}`;
  else if (env === 'gather' || env === 'multline') t = `\\begin{gathered}${t}\\end{gathered}`;
  else if (env === 'alignat') {
    const k = /^\s*\{(\d+)\}/.exec(t);
    t = `\\begin{alignedat}{${k?.[1] ?? 2}}${k ? t.slice(k[0].length) : t}\\end{alignedat}`;
  } else if (env === 'eqnarray') t = `\\begin{array}{rcl}${t}\\end{array}`;
  return t.trim();
}

/** The labels inside a span (\label{eq:x}), to show beside its formula. */
export const labelsIn = (s: string, m: MathSpan) => [...s.slice(m.innerFrom, m.innerTo).matchAll(/\\label\s*\{([^{}]*)\}/g)].map((x) => x[1].trim());

/** The text in braces starting at s[i] ("{" there) and where it ends; null when it does not close. */
export function braced(s: string, i: number): { text: string; end: number } | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length && j < i + 20_000; j++) {
    const c = s[j];
    if (c === '\\') j++;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { text: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

/**
 * The macros a document defines that KaTeX can use: \newcommand{\R}{\mathbb{R}}, \newcommand\norm[1]{\lVert #1\rVert},
 * \DeclareMathOperator{\tr}{tr} (as \operatorname{tr}), \def\x{…} without parameters. Those with an optional argument
 * keep their default out (KaTeX has none).
 */
export function texMacros(texts: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of texts) {
    const s = raw.length > 400_000 ? raw.slice(0, 400_000) : raw;
    for (const m of s.matchAll(/\\(?:re)?(?:new|provide)command\*?\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))\s*(?:\[(\d)\])?\s*(?:\[[^\]]*\])?\s*\{/g)) {
      const name = m[1] ?? m[2];
      const body = braced(s, m.index! + m[0].length - 1);
      if (name && body && body.text.length < 2000) out[name] = body.text;
    }
    for (const m of s.matchAll(/\\DeclareMathOperator(\*?)\s*\{\s*(\\[A-Za-z@]+)\s*\}\s*\{/g)) {
      const body = braced(s, m.index! + m[0].length - 1);
      if (body && body.text.length < 200) out[m[2]] = `\\operatorname${m[1]}{${body.text}}`;
    }
    for (const m of s.matchAll(/\\def\s*(\\[A-Za-z@]+)\s*\{/g)) {
      const body = braced(s, m.index! + m[0].length - 1);
      if (body && body.text.length < 2000 && !(m[1] in out)) out[m[1]] = body.text;
    }
  }
  return out;
}
