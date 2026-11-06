// What AI may change in a LaTeX document's source, and what it must leave as it is: the words of the text are its to
// rewrite, proofread or translate; its commands, its maths, the keys of \cite, \ref and \label (and the addresses of
// \url and \href, the files of \includegraphics and \input), verbatim text and its comments are not. texKept lists
// those in a piece of source; texGuard compares a piece before and after the model changed it and says, in plain words,
// what was dropped, changed or made up (a \cite of a paper nobody cited, a formula that is not the same), so the editor
// says so instead of putting it in. texProtected gives the places in a whole file AI may not touch, for proofreading's
// corrections, which must fall in the words between them; proseParagraphs splits a file into the paragraphs of words
// worth sending (the preamble, maths and comments left out); citedKeys and docLabels are what \cite and \ref may name.

/** What must stay as it is in a piece of source. */
export interface TexKept {
  /** Maths, verbatim text and \verb, each as written (its spaces made one). */
  fixed: string[];
  /** Commands whose argument is a key, a label, an address or a file: "\citep{a,b}", "\label{fig:x}", "\url{…}". */
  keys: string[];
  /** Comments, each as written ("% TODO …"). */
  comments: string[];
  /** Every command by its name ("\textbf", "\begin{itemize}"), as many times as it comes. */
  commands: string[];
}

/** Environments whose contents are maths. */
export const MATH_ENVS = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'alignat',
  'alignat*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'flalign',
  'flalign*',
  'eqnarray',
  'eqnarray*',
  'displaymath',
  'math',
  'dmath',
  'dmath*',
  'subequations',
]);
/** Environments whose contents TeX takes as they are. */
export const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'Verbatim', 'Verbatim*', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*', 'alltt']);

/** Commands whose (first) argument is a key, a label, an address or a file: never words to rewrite. */
const KEY_CMD = /^(?:[A-Za-z]*cite[A-Za-z]*\*?|nocite|[A-Za-z]*ref\*?|eqref|label|url|href|includegraphics|input|include|subfile|import|bibliography|bibliographystyle|addbibresource|usepackage|documentclass|RequirePackage|hyperref|hyperlink|hypertarget|ding|color|textcolor|colorbox|pagecolor|setlength|addtolength|setcounter|addtocounter|newcommand|renewcommand|providecommand|DeclareMathOperator|newenvironment|renewenvironment|newtheorem|vspace\*?|hspace\*?|rule|SI|si|num|qty|unit|ang)$/;

const ws = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A {…} group from s[i] (which is "{"): its inside and where it ends; null when it is never closed. */
function group(s: string, i: number): { inner: string; end: number } | null {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') k++;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { inner: s.slice(i + 1, k), end: k + 1 };
  }
  return null;
}

/** Spaces and [options] after a command, then its {argument}: where the argument starts, or -1. */
function argStart(s: string, i: number): number {
  let k = i;
  for (let guard = 0; guard < 6; guard++) {
    while (k < s.length && (s[k] === ' ' || s[k] === '\t' || s[k] === '*')) k++;
    if (s[k] === '[') {
      const close = s.indexOf(']', k);
      if (close < 0 || s.slice(k, close).includes('\n\n')) return -1;
      k = close + 1;
      continue;
    }
    return s[k] === '{' ? k : -1;
  }
  return -1;
}

/** A part of the source that is not words: [from, to), and what it is. */
export interface TexSpan {
  from: number;
  to: number;
  kind: 'math' | 'verbatim' | 'comment' | 'command' | 'key' | 'preamble';
}

/**
 * The parts of a piece of source that are not its words, in order: comments, maths (inline and display, and maths
 * environments whole), verbatim text, commands' names (with \begin{…} and \end{…} whole) and the arguments of the
 * commands that take keys, labels, addresses and files. What is between them is words (and the braces around them).
 */
export function texSpans(s: string, o: { preamble?: boolean } = {}): TexSpan[] {
  const out: TexSpan[] = [];
  const n = s.length;
  let i = 0;
  if (o.preamble) {
    const b = /\\begin\s*\{document\}/.exec(s);
    if (b) {
      out.push({ from: 0, to: b.index + b[0].length, kind: 'preamble' });
      i = b.index + b[0].length;
    }
  }
  let math: { at: number; close: string } | null = null;
  for (; i < n; i++) {
    const c = s[i];
    if (c === '%') {
      const e = s.indexOf('\n', i);
      const end = e < 0 ? n : e;
      // A comment inside maths ends the maths' part there: it is its own part.
      if (!math) out.push({ from: i, to: end, kind: 'comment' });
      i = end - 1;
      continue;
    }
    if (math) {
      if (c === '\\') {
        if (math.close.startsWith('\\end')) {
          const m = /^\\end\s*\{([^{}]*)\}/.exec(s.slice(i, i + 80));
          if (m && `\\end{${m[1].trim()}}` === math.close) {
            out.push({ from: math.at, to: i + m[0].length, kind: 'math' });
            i += m[0].length - 1;
            math = null;
            continue;
          }
        } else if (s.startsWith(math.close, i)) {
          out.push({ from: math.at, to: i + 2, kind: 'math' });
          i++;
          math = null;
          continue;
        }
        // Any other command or escaped character inside maths.
        i++;
        continue;
      }
      if (c === '$' && math.close.startsWith('$')) {
        const end = math.close === '$$' && s[i + 1] === '$' ? i + 2 : i + 1;
        out.push({ from: math.at, to: end, kind: 'math' });
        i = end - 1;
        math = null;
      }
      // A paragraph ends inline maths left open: TeX would stop there too.
      else if (c === '\n' && math.close === '$' && /^\n[ \t]*\n/.test(s.slice(i, i + 40))) math = null;
      continue;
    }
    if (c === '$') {
      const double = s[i + 1] === '$';
      math = { at: i, close: double ? '$$' : '$' };
      if (double) i++;
      continue;
    }
    if (c !== '\\') continue;
    const d = s[i + 1];
    if (d === '(' || d === '[') {
      math = { at: i, close: d === '(' ? '\\)' : '\\]' };
      i++;
      continue;
    }
    const env = /^\\(begin|end)\s*\{([^{}]*)\}/.exec(s.slice(i, i + 80));
    if (env) {
      const name = env[2].trim();
      const to = i + env[0].length;
      if (env[1] === 'begin' && MATH_ENVS.has(name)) {
        math = { at: i, close: `\\end{${name}}` };
        i = to - 1;
        continue;
      }
      if (env[1] === 'begin' && VERBATIM_ENVS.has(name)) {
        const close = s.indexOf(`\\end{${name}}`, to);
        const end = close < 0 ? n : close + name.length + 6;
        out.push({ from: i, to: end, kind: 'verbatim' });
        i = end - 1;
        continue;
      }
      out.push({ from: i, to, kind: 'command' });
      i = to - 1;
      continue;
    }
    if (s.startsWith('\\verb', i) && !/[A-Za-z]/.test(s[i + 5] ?? '')) {
      const at = s[i + 5] === '*' ? i + 6 : i + 5;
      const mark = s[at];
      const e = mark ? s.indexOf(mark, at + 1) : -1;
      if (e > 0 && !s.slice(at + 1, e).includes('\n')) {
        out.push({ from: i, to: e + 1, kind: 'verbatim' });
        i = e;
        continue;
      }
    }
    const cmd = /^\\([A-Za-z@]+)\*?/.exec(s.slice(i, i + 60));
    if (!cmd) {
      // An escaped character (\%, \$, \{, \\): one character, not special.
      i++;
      continue;
    }
    const end = i + cmd[0].length;
    out.push({ from: i, to: end, kind: 'command' });
    if (KEY_CMD.test(cmd[1])) {
      const a = argStart(s, end);
      const g = a >= 0 ? group(s, a) : null;
      if (g) {
        out.push({ from: a, to: g.end, kind: 'key' });
        i = g.end - 1;
        continue;
      }
    }
    i = end - 1;
  }
  if (math && math.close !== '$') out.push({ from: math.at, to: n, kind: 'math' });
  return out;
}

/** What must stay as it is in a piece of source (see TexKept). */
export function texKept(s: string): TexKept {
  const k: TexKept = { fixed: [], keys: [], comments: [], commands: [] };
  const spans = texSpans(s);
  for (let j = 0; j < spans.length; j++) {
    const x = spans[j];
    const text = s.slice(x.from, x.to);
    if (x.kind === 'math' || x.kind === 'verbatim') k.fixed.push(ws(text));
    else if (x.kind === 'comment') k.comments.push(ws(text));
    else if (x.kind === 'command') {
      const name = /^\\(begin|end)\s*\{/.test(text) ? text.replace(/\s+/g, '') : text.replace(/\*$/, '');
      k.commands.push(name);
      const next = spans[j + 1];
      if (next?.kind === 'key') k.keys.push(`${name}{${keyText(name, s.slice(next.from + 1, next.to - 1))}}`);
    }
  }
  return k;
}

/** A key argument as it is compared: a citation's keys without their spaces, any other's as written. */
const keyText = (cmd: string, arg: string) =>
  /cite/i.test(cmd)
    ? arg
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .join(',')
    : arg.trim();

/** What is in `a` and not in `b`, as many times as it is more often in `a`. */
function more(a: string[], b: string[]): string[] {
  const left = new Map<string, number>();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

const short = (s: string, max = 48) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * What a model's new version of a piece of source dropped, changed or made up of what must stay (see TexKept), in
 * plain words, the most telling first; none when it kept all of it.
 */
export function texGuard(before: string, after: string): string[] {
  const a = texKept(before);
  const b = texKept(after);
  const out: string[] = [];
  const goneKeys = more(a.keys, b.keys);
  const newKeys = more(b.keys, a.keys);
  for (const x of goneKeys) out.push(`It left out ${short(x)}.`);
  for (const x of newKeys) out.push(/cite/i.test(x) ? `It put in ${short(x)}, which was not there: a citation it may have made up.` : `It put in ${short(x)}, which was not there.`);
  const goneMath = more(a.fixed, b.fixed);
  const newMath = more(b.fixed, a.fixed);
  if (goneMath.length && newMath.length) for (let i = 0; i < Math.min(goneMath.length, newMath.length); i++) out.push(`It changed ${short(goneMath[i])} into ${short(newMath[i])}.`);
  for (const x of goneMath.slice(newMath.length)) out.push(`It left out ${short(x)}.`);
  for (const x of newMath.slice(goneMath.length)) out.push(`It put in ${short(x)}, which was not there.`);
  for (const x of more(a.comments, b.comments)) out.push(`It left out or changed the comment ${short(x)}.`);
  for (const x of more(b.comments, a.comments)) if (!a.comments.length) out.push(`It put in a comment, ${short(x)}.`);
  // Commands, once each: those whose key or maths was said already are not said again.
  const said = new Set([...goneKeys, ...newKeys].map((x) => x.slice(0, x.indexOf('{'))));
  const gone = [...new Set(more(a.commands, b.commands))].filter((x) => !said.has(x));
  const added = [...new Set(more(b.commands, a.commands))].filter((x) => !said.has(x));
  if (gone.length) out.push(`It left out ${gone.slice(0, 4).join(', ')}${gone.length > 4 ? ` and ${gone.length - 4} more` : ''}.`);
  if (added.length) out.push(`It put in ${added.slice(0, 4).join(', ')}${added.length > 4 ? ` and ${added.length - 4} more` : ''}, which ${added.length === 1 ? 'was' : 'were'} not there.`);
  return out;
}

/** The places in a file AI may not touch (see texSpans), the preamble with them. */
export const texProtected = (s: string) => texSpans(s, { preamble: true });

/** Whether [from, to) of a file touches a part AI may not change (an insertion: falls inside one). */
export function touchesProtected(spans: TexSpan[], from: number, to: number): boolean {
  for (const x of spans) {
    if (x.from >= Math.max(to, from + 1)) break;
    if (from === to ? x.from < from && from < x.to : x.to > from && x.from < to) return true;
  }
  return false;
}

/** A paragraph of words to send to a model: where it is in the file. */
export interface ProseParagraph {
  from: number;
  to: number;
  text: string;
}

/**
 * The paragraphs of a file with words in them (split at blank lines), from `from` to `to` of it: those that are all
 * commands, maths or comments (and the preamble) left out, each one as it is in the file.
 */
export function proseParagraphs(s: string, from = 0, to = s.length): ProseParagraph[] {
  const spans = texProtected(s);
  const out: ProseParagraph[] = [];
  const re = /\n[ \t]*\n/g;
  let start = 0;
  const pre = spans[0]?.kind === 'preamble' ? spans[0].to : 0;
  const push = (a: number, b: number) => {
    const x = Math.max(a, from, pre);
    const y = Math.min(b, to);
    if (y <= x) return;
    // Its words: what no span covers, with letters in it.
    let words = '';
    let at = x;
    for (const sp of spans) {
      if (sp.to <= at) continue;
      if (sp.from >= y) break;
      if (sp.from > at) words += s.slice(at, sp.from);
      at = Math.max(at, sp.to);
    }
    if (at < y) words += s.slice(at, y);
    if ((words.match(/\p{L}{2,}/gu) ?? []).length < 3) return;
    // Its own text, without the blank lines and spaces around it.
    const raw = s.slice(x, y);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    out.push({ from: x + lead, to: x + lead + text.length, text });
  };
  for (let m = re.exec(s); m; m = re.exec(s)) {
    push(start, m.index);
    start = m.index + m[0].length;
  }
  push(start, s.length);
  return out;
}

/** The keys a document cites (\cite and its kind, \nocite), and whether it cites everything (\nocite{*}). */
export function citedKeys(texts: string[]): { keys: Set<string>; all: boolean } {
  const keys = new Set<string>();
  let all = false;
  for (const t of texts)
    for (const m of t.matchAll(/\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}/g)) {
      // Not when it is commented out.
      const line = t.slice(t.lastIndexOf('\n', m.index) + 1, m.index);
      if (/(^|[^\\])%/.test(line)) continue;
      for (const k of m[1].split(',')) {
        const key = k.trim();
        if (key === '*') all = true;
        else if (key) keys.add(key);
      }
    }
  return { keys, all };
}

/**
 * The labels a document defines: \label{…}, label= of an environment's options (listings, boxes), and the argument of
 * a command of its own that puts it in a \label (\newcommand{\lbl}[1]{\label{#1}}).
 */
export function docLabels(texts: string[]): Set<string> {
  const out = new Set<string>();
  const makers = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z@]+)\}?\s*\[\d\][^\n]*\\label\s*\{#1\}|\\def\s*\\([A-Za-z@]+)#1[^\n]*\\label\s*\{#1\}/g)) makers.add(m[1] ?? m[2]);
  for (const t of texts) {
    for (const m of t.matchAll(/\\label\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g)) out.add(m[1].trim());
    for (const m of t.matchAll(/[[,]\s*label\s*=\s*\{?([^,\]{}]+)\}?/g)) out.add(m[1].trim());
    if (makers.size) for (const m of t.matchAll(/\\([A-Za-z@]+)\*?\s*\{([^{}]*)\}/g)) if (makers.has(m[1])) out.add(m[2].trim());
  }
  return out;
}

// ---- what the editor and the server send each other (server/write/latex.ts) -------------------------------------

/** How the words picked are rewritten. */
export type TexRewriteHow = 'shorter' | 'clearer' | 'academic' | 'fix' | 'translate' | 'ask';
export const TEX_REWRITE_HOWS: TexRewriteHow[] = ['shorter', 'clearer', 'academic', 'fix', 'translate', 'ask'];
export const TEX_REWRITE_LABELS: Record<TexRewriteHow, string> = {
  shorter: 'Shorter',
  clearer: 'Clearer',
  academic: 'More academic',
  fix: 'Fix grammar',
  translate: 'Translate to',
  ask: 'Say how',
};
/** The most source one rewrite or one proofreading call takes (characters). */
export const TEX_AI_MAX = 8000;

/** What a model wrote: its name, and what the call cost in US dollars when it is known and not nothing. */
export interface TexAiBy {
  model?: string;
  cost?: number;
}

export interface TexRewriteAnswer extends TexAiBy {
  text: string;
  /** What it dropped, changed or made up of what must stay (texGuard): then it is not put in. */
  problems: string[];
}

/** LaTeX written for the cursor's place, or read from a picture: the packages it needs as \usepackage lines. */
export interface TexWritten extends TexAiBy {
  latex: string;
  packages: string[];
  /** What it is (a picture's: equation, table, text), and what the model said of it. */
  kind?: string;
  note?: string;
}

/** Who reads a picture into LaTeX here, and about what one costs (US dollars, when it costs money); or why none can. */
export interface TexPictureReader {
  label?: string;
  where?: 'helper' | 'openrouter' | 'claude';
  cost?: number;
  why?: string;
}

/** An error explained, or a change that fixes it: lines `from` to `to` of its file (from 1) become `text`. */
export interface TexErrorAnswer extends TexAiBy {
  text: string;
  fix?: { from: number; to: number; text: string };
}

/** A paper found for a claim. */
export interface TexCitePaper {
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  arxiv?: string;
  url?: string;
  abstract: string;
  cited?: number;
  /** How well it backs the claim, and why, in a line. */
  backs: 'strong' | 'some';
  why: string;
  /** Its BibTeX, made from its record (Cite asks doi.org or arXiv for theirs first). */
  bibtex: string;
}

export interface TexCiteAnswer extends TexAiBy {
  queries: string[];
  papers: TexCitePaper[];
  /** The places that could not be searched. */
  notes?: string[];
}

/** A correction to a paragraph of words: [from, to) of the paragraph sent becomes `now`. */
export interface TexCorrection {
  id: number;
  from: number;
  to: number;
  was: string;
  now: string;
  why: string;
}

export interface TexProofreadAnswer extends TexAiBy {
  corrections: TexCorrection[];
}

/** The smallest change that turns `a` into `b`, whole words: [from, to) of a, and what goes there. */
export function smallestChange(a: string, b: string): { from: number; to: number; insert: string } {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  // A change inside a word takes the whole word.
  const letter = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
  while (s > 0 && letter(a[s - 1]) && (letter(a[s]) || letter(b[s]))) s--;
  while (e > 0 && letter(a[a.length - e]) && letter(a[a.length - e - 1])) e--;
  return { from: s, to: a.length - e, insert: b.slice(s, b.length - e) };
}
