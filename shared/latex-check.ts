// Quick checks of a LaTeX file, before TeX is asked: what is sure to fail, said where it is as you type. A \begin{…}
// without its \end{…} (or closed by another's), a } with no { before it or a { never closed, and maths left open (a
// $ with no closing one before the paragraph ends, \( or \[ without theirs). Comments, verbatim text and \verb are
// passed over, and escaped characters (\{, \$) are not counted. Each problem has its place in the text (from, to).

export interface TexCheck {
  from: number;
  to: number;
  message: string;
}

const VERBATIM = new Set(['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*']);
/** Checks stop past this many problems: one broken thing early can make many after it. */
const MAX = 40;

export function texCheck(s: string): TexCheck[] {
  const out: TexCheck[] = [];
  const braces: number[] = [];
  const envs: { name: string; from: number; to: number }[] = [];
  let math: { kind: '$' | '$$' | '\\(' | '\\['; at: number } | null = null;
  const n = s.length;
  const blankLineAt = (i: number) => s[i] === '\n' && /^\n[ \t]*\n/.test(s.slice(i, i + 40));
  for (let i = 0; i < n && out.length < MAX; i++) {
    const c = s[i];
    if (c === '%') {
      const e = s.indexOf('\n', i);
      if (e < 0) break;
      i = e - 1;
      continue;
    }
    if (c === '\n' && math?.kind === '$' && blankLineAt(i)) {
      out.push({ from: math.at, to: math.at + 1, message: 'This $ is not closed before the paragraph ends.' });
      math = null;
      continue;
    }
    if (c === '{') {
      braces.push(i);
      continue;
    }
    if (c === '}') {
      if (braces.length) braces.pop();
      else out.push({ from: i, to: i + 1, message: 'This } has no { before it.' });
      continue;
    }
    if (c === '$') {
      const double = s[i + 1] === '$';
      if (math && (math.kind === '$' || math.kind === '$$')) {
        if (math.kind === '$$' && !double) out.push({ from: i, to: i + 1, message: 'Maths begun with $$ is ended with a single $.' });
        math = null;
      } else if (!math) math = { kind: double ? '$$' : '$', at: i };
      if (double) i++;
      continue;
    }
    if (c !== '\\') continue;
    const d = s[i + 1];
    if (d === '(' || d === '[') {
      if (!math) math = { kind: d === '(' ? '\\(' : '\\[', at: i };
      i++;
      continue;
    }
    if (d === ')' || d === ']') {
      const want = d === ')' ? '\\(' : '\\[';
      if (math?.kind === want) math = null;
      else if (!math) out.push({ from: i, to: i + 2, message: `\\${d} closes maths that was not opened.` });
      i++;
      continue;
    }
    const m = /^\\(begin|end)\s*\{([^{}\s]+)\}/.exec(s.slice(i, i + 80));
    if (m) {
      const name = m[2];
      const to = i + m[0].length;
      if (m[1] === 'begin') {
        if (VERBATIM.has(name)) {
          const close = s.indexOf(`\\end{${name}}`, to);
          if (close < 0) {
            out.push({ from: i, to, message: `\\begin{${name}} has no \\end{${name}}.` });
            break;
          }
          i = close + name.length + 5;
          continue;
        }
        envs.push({ name, from: i, to });
      } else {
        const k = envs.map((e) => e.name).lastIndexOf(name);
        if (k < 0) out.push({ from: i, to, message: `\\end{${name}} has no \\begin{${name}} before it.` });
        else {
          // What was opened after it and not closed: it ends here, unclosed.
          for (const e of envs.slice(k + 1)) out.push({ from: e.from, to: e.to, message: `\\begin{${e.name}} is not ended before \\end{${name}}.` });
          envs.length = k;
        }
      }
      i = to - 1;
      continue;
    }
    if (s.startsWith('\\verb', i) && !/[A-Za-z*]/.test(s[i + 5] ?? '')) {
      const mark = s[i + 5];
      const e = mark ? s.indexOf(mark, i + 6) : -1;
      if (e > 0 && !s.slice(i + 6, e).includes('\n')) i = e;
      continue;
    }
    // Any other escaped character (\{, \$, \%, \\) or command: its first character is not special.
    i++;
  }
  if (math && out.length < MAX) out.push({ from: math.at, to: math.at + math.kind.length, message: math.kind === '$' || math.kind === '$$' ? `This ${math.kind} is never closed.` : `${math.kind} has no ${math.kind === '\\(' ? '\\)' : '\\]'}.` });
  for (const e of envs) if (out.length < MAX) out.push({ from: e.from, to: e.to, message: `\\begin{${e.name}} has no \\end{${e.name}}.` });
  for (const b of braces) if (out.length < MAX) out.push({ from: b, to: b + 1, message: 'This { is never closed.' });
  return out.sort((a, b) => a.from - b.from);
}
