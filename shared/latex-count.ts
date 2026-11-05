// Counting a LaTeX document's words roughly as texcount does: the words of the running text, of the headings, and of
// the captions and footnotes apart; how many headings, figures and tables there are; and how many formulas, in the text
// and on lines of their own, without counting what is inside them. Commands are not words, but the words they hold are
// (\textbf{this} is one), save those of labels, references, citations, addresses and the like. Only what is between
// \begin{document} and \end{document} counts, and a whole project counts the files main.tex reads where it reads them.
// Chinese and Japanese characters count one each, as words.
import { TEX_MAIN, uncommented, type TexDoc } from './latex.ts';

export interface TexCount {
  /** Words in the running text. */
  words: number;
  /** Words in headings (a section's title…). */
  headingWords: number;
  /** Words in captions and footnotes. */
  otherWords: number;
  headings: number;
  /** Figures and tables. */
  floats: number;
  /** Formulas in the text: $…$, \(…\). */
  inline: number;
  /** Formulas on lines of their own: \[…\], equation, align… */
  display: number;
}

export const NO_COUNT: TexCount = { words: 0, headingWords: 0, otherWords: 0, headings: 0, floats: 0, inline: 0, display: 0 };

const DISPLAY_ENVS = 'equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|dgroup';
const DROPPED_ENVS = 'verbatim|Verbatim|lstlisting|minted|comment|tikzpicture|forest|filecontents|thebibliography';
const FLOAT_ENVS = /\\begin\s*\{(figure|table|wrapfigure|wraptable|sidewaysfigure|sidewaystable|algorithm)\*?\}/g;
/** Commands whose arguments are not words: how many braced arguments go with them. */
const NOT_WORDS: Record<string, number> = {
  label: 1,
  ref: 1,
  eqref: 1,
  pageref: 1,
  autoref: 1,
  cref: 1,
  Cref: 1,
  nameref: 1,
  vref: 1,
  cite: 1,
  citep: 1,
  citet: 1,
  citeauthor: 1,
  citeyear: 1,
  citealp: 1,
  citealt: 1,
  parencite: 1,
  textcite: 1,
  autocite: 1,
  footcite: 1,
  nocite: 1,
  includegraphics: 1,
  input: 1,
  include: 1,
  subfile: 1,
  includepdf: 1,
  bibliography: 1,
  bibliographystyle: 1,
  addbibresource: 1,
  usepackage: 1,
  documentclass: 1,
  url: 1,
  href: 1,
  hspace: 1,
  vspace: 1,
  setlength: 2,
  addtolength: 2,
  setcounter: 2,
  addtocounter: 2,
  color: 1,
  textcolor: 1,
  colorbox: 1,
  pagestyle: 1,
  thispagestyle: 1,
  pagenumbering: 1,
  fontsize: 2,
  linespread: 1,
  newpage: 0,
  newcommand: 2,
  renewcommand: 2,
  providecommand: 2,
  newenvironment: 3,
  renewenvironment: 3,
  DeclareMathOperator: 2,
  newtheorem: 2,
  bibitem: 1,
  verb: 0,
  index: 1,
  glossary: 1,
  hypersetup: 1,
  graphicspath: 1,
  definecolor: 3,
  multicolumn: 2,
  multirow: 2,
  cline: 1,
  cmidrule: 1,
  rule: 2,
  raisebox: 1,
  resizebox: 2,
  scalebox: 1,
  makebox: 0,
  framebox: 0,
  parbox: 1,
  settowidth: 2,
  addcontentsline: 2,
  phantom: 1,
  hphantom: 1,
  vphantom: 1,
};
/** Environments whose \begin takes arguments that are not words. */
const ENV_ARGS: Record<string, number> = {
  tabular: 1,
  'tabular*': 2,
  tabularx: 2,
  tabulary: 2,
  array: 1,
  longtable: 1,
  minipage: 1,
  column: 1,
  wrapfigure: 2,
  wraptable: 2,
  multicols: 1,
  subfigure: 1,
  adjustbox: 1,
  tcolorbox: 0,
  block: 1,
  alertblock: 1,
  exampleblock: 1,
};
const HEADING = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph|frametitle|framesubtitle)\*?/;

/** The text in braces that starts at s[i] ("{" there) and where it ends; nested braces count, escaped ones not. */
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

/** After s[i]: spaces, then an optional [argument] (as many as there are), skipped. */
function skipOptions(s: string, i: number): number {
  let j = i;
  for (;;) {
    while (s[j] === ' ' || s[j] === '\n' || s[j] === '\t') j++;
    if (s[j] !== '[') return j;
    let depth = 0;
    let k = j;
    for (; k < s.length; k++) {
      if (s[k] === '[') depth++;
      else if (s[k] === ']' && --depth === 0) break;
    }
    if (k >= s.length) return j;
    j = k + 1;
  }
}

/** Skips n braced arguments (and options before each) after s[i]: where they end. */
function skipArgs(s: string, i: number, n: number): number {
  let j = i;
  for (let k = 0; k < n; k++) {
    const at = skipOptions(s, j);
    const g = group(s, at);
    if (!g) return j;
    j = g.end;
  }
  return j;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

/** The words of text whose commands are already gone. */
export function countWords(plain: string): number {
  const cjk = plain.match(CJK)?.length ?? 0;
  return cjk + (plain.replace(CJK, ' ').match(WORD)?.length ?? 0);
}

/** What text in TeX says, without its commands, braces and maths: words to count. */
function plainOf(s: string, c: TexCount): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const m = /^\\([A-Za-z@]+\*?|.)/.exec(s.slice(i, i + 60));
      if (!m) {
        i++;
        continue;
      }
      const name = m[1];
      let j = i + m[0].length;
      // A heading's or a caption's words go to their own count.
      if (HEADING.test(`\\${name}`) && !name.endsWith('@')) {
        const at = skipOptions(s, j);
        const g = group(s, at);
        if (g) {
          c.headings++;
          c.headingWords += countWords(plainOf(g.text, c));
          i = g.end;
          out += ' ';
          continue;
        }
      }
      if (name === 'caption' || name === 'footnote' || name === 'footnotetext' || name === 'marginpar' || name === 'thanks') {
        const at = skipOptions(s, j);
        const g = group(s, at);
        if (g) {
          c.otherWords += countWords(plainOf(g.text, c));
          i = g.end;
          out += ' ';
          continue;
        }
      }
      if (name === 'begin' || name === 'end') {
        const g = group(s, skipOptions(s, j));
        if (g) {
          j = g.end;
          if (name === 'begin') j = skipArgs(s, skipOptions(s, j), ENV_ARGS[g.text.trim()] ?? 0);
        }
        i = j;
        out += ' ';
        continue;
      }
      const base = name.replace(/\*$/, '');
      if (base === 'verb') {
        // \verb|…|: what is between the two marks is code.
        const mark = s[j];
        const end = mark ? s.indexOf(mark, j + 1) : -1;
        i = end > 0 ? end + 1 : j;
        out += ' ';
        continue;
      }
      if (base in NOT_WORDS) {
        // Only the arguments that are not words go: \href{address}{words} keeps its words, \textcolor{colour}{words} too.
        i = skipArgs(s, j, NOT_WORDS[base]);
        out += ' ';
        continue;
      }
      // Any other command goes; what it holds stays. Its options go too.
      i = /^[A-Za-z@]/.test(name) ? skipOptions(s, j) : j;
      // A letter escaped (\%, \&, \$) is not a word; an accent (\'e) keeps its letter.
      out += /^[A-Za-z@]/.test(name) ? ' ' : /['`^"~=.]/.test(name) ? '' : ' ';
      continue;
    }
    if (ch === '{' || ch === '}' || ch === '~' || ch === '&') {
      out += ch === '~' || ch === '&' ? ' ' : '';
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Takes maths out of text, counting it: what is left, with a space where each formula was. */
function withoutMaths(s: string, c: TexCount): string {
  let t = s.replace(new RegExp(`\\\\begin\\s*\\{(${DISPLAY_ENVS})(\\*?)\\}[\\s\\S]*?\\\\end\\s*\\{\\1\\2\\}`, 'g'), () => (c.display++, ' '));
  t = t.replace(/\\\[[\s\S]*?\\\]/g, () => (c.display++, ' '));
  t = t.replace(/(^|[^\\])\$\$[\s\S]*?\$\$/g, (_m, a: string) => (c.display++, `${a} `));
  t = t.replace(/\\\([\s\S]*?\\\)/g, () => (c.inline++, ' '));
  t = t.replace(/\\begin\s*\{math\}[\s\S]*?\\end\s*\{math\}/g, () => (c.inline++, ' '));
  t = t.replace(/(^|[^\\])\$((?:\\.|[^$\\])+)\$/g, (_m, a: string) => (c.inline++, `${a} `));
  return t;
}

/** The part of a file that is the document: between \begin{document} and \end{document}, or all of it when it has none. */
export function texBody(text: string): string {
  const lines = text.split('\n').map(uncommented).join('\n');
  const b = /\\begin\s*\{document\}/.exec(lines);
  if (!b) return lines;
  const rest = lines.slice(b.index + b[0].length);
  const e = /\\end\s*\{document\}/.exec(rest);
  return e ? rest.slice(0, e.index) : rest;
}

/** The counts of one text's document part (its preamble left out). */
export function texCountText(text: string): TexCount {
  const c: TexCount = { ...NO_COUNT };
  let t = texBody(text);
  t = t.replace(new RegExp(`\\\\begin\\s*\\{(${DROPPED_ENVS})(\\*?)\\}[\\s\\S]*?\\\\end\\s*\\{\\1\\2\\}`, 'g'), ' ');
  c.floats = t.match(FLOAT_ENVS)?.length ?? 0;
  t = withoutMaths(t, c);
  c.words = countWords(plainOf(t, c));
  return c;
}

/** The text of main.tex's document part with the files it reads (\input, \include, \subfile) put where it reads them. */
export function texFlat(d: TexDoc): string {
  const byName = new Map(d.files.filter((f) => /\.(tex|ltx)$/i.test(f.name)).map((f) => [f.name, f.text]));
  const seen = new Set<string>();
  const flat = (text: string, depth: number): string =>
    text.replace(/\\(input|include|subfile)\s*\{([^{}]+)\}/g, (all, _k: string, arg: string) => {
      const n = arg
        .trim()
        .replace(/^\.\//, '')
        .replace(/^"(.*)"$/, '$1');
      const name = byName.has(n) ? n : byName.has(`${n}.tex`) ? `${n}.tex` : null;
      if (!name || seen.has(name) || depth > 8) return name ? ' ' : all;
      seen.add(name);
      return `\n${flat(texBody(byName.get(name)!), depth + 1)}\n`;
    });
  return flat(texBody(d.main), 0);
}

/** The counts of a document: of one of its files (`file`), or of the whole of it as main.tex reads it. */
export function texCount(d: TexDoc, file?: string): TexCount {
  if (file && file !== TEX_MAIN) {
    const f = d.files.find((x) => x.name === file);
    return f && /\.(tex|ltx)$/i.test(f.name) ? texCountText(f.text) : { ...NO_COUNT };
  }
  if (file === TEX_MAIN) return texCountText(d.main);
  return texCountText(`\\begin{document}${texFlat(d)}\\end{document}`);
}

/** All the words a count has. */
export const totalWords = (c: TexCount) => c.words + c.headingWords + c.otherWords;
