// A LaTeX paper read for the pre-submission check and the arXiv package: where its comments are (a % no backslash
// escapes, \begin{comment} blocks, \iffalse … \fi), and the text TeX takes as it is (verbatim, lstlisting, minted,
// \verb, the addresses of \url and \href), so neither is mistaken for the other; the files it reads, in the order it
// reads them; its bibliographies, read entry by entry with where each is (@string macros, # joins, crossref); the
// keys it cites and where; its headings; its tables, cell by cell with each number, whether it is bold and marked
// significant; and the template it uses, with whether that template is in its anonymous version now.
//
// Offsets are kept throughout: the text with its comments blanked has the same length as the text itself, so what
// is found in one is at the same place in the other, and a finding can be shown, fixed and commented where it is.
import { TEX_MAIN, texPlain, type TexDoc } from '../../shared/latex.ts';
import type { CheckEdit, PaperTemplate } from '../../shared/latex-submit.ts';

export interface Span {
  from: number;
  to: number;
}

export interface TexScan {
  /** Comments, from the % to the line's end (its line break left out); `own`: nothing but spaces before it on its line. */
  comments: (Span & { own: boolean })[];
  /** \begin{comment} … \end{comment}, whole. */
  commentEnvs: Span[];
  /** What TeX takes as it is: inside verbatim-like environments, \verb's text, the addresses of \url and \href. */
  literal: Span[];
  /** \iffalse … \fi with no \else of its own, whole. */
  iffalse: Span[];
}

/** Environments whose insides TeX takes as they are. */
const VERBATIM = /^(verbatim\*?|Verbatim\*?|BVerbatim|LVerbatim|spverbatim|lstlisting\*?|minted|alltt|filecontents\*?|comment)$/;

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The end of the braces that open at s[i] ("{" there): after the closing one, or -1. */
export function closeBrace(s: string, i: number): number {
  if (s[i] !== '{') return -1;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j + 1;
  }
  return -1;
}

/** Where an \iffalse that ends at `from` is closed by its own \fi (after it), or -1 when it has an \else or no \fi. */
function iffalseEnd(s: string, from: number): number {
  const re = /%[^\n]*|\\(newif|if[A-Za-z@]*|fi|else)(?![A-Za-z@])/g;
  re.lastIndex = from;
  let depth = 1;
  let skipNext = false;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (!m[1]) continue;
    const name = m[1];
    if (name === 'newif') {
      skipNext = true;
      continue;
    }
    if (name === 'fi') {
      if (--depth === 0) return m.index + m[0].length;
    } else if (name === 'else') {
      if (depth === 1) return -1;
    } else if (name.startsWith('if')) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      // \iff is maths, \ifthenelse a command with its own braces: neither needs a \fi.
      if (name === 'iff' || name === 'ifthenelse') continue;
      depth++;
    }
    skipNext = false;
  }
  return -1;
}

/** Where a document's comments are, and the text TeX takes as it is (see TexScan). */
export function scanTex(s: string): TexScan {
  const out: TexScan = { comments: [], commentEnvs: [], literal: [], iffalse: [] };
  const n = s.length;
  const name = /\\([A-Za-z@]+)(\*?)/y;
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '%') {
      let e = s.indexOf('\n', i);
      if (e < 0) e = n;
      const ls = s.lastIndexOf('\n', i - 1) + 1;
      out.comments.push({ from: i, to: e, own: /^[ \t]*$/.test(s.slice(ls, i)) });
      i = e;
      continue;
    }
    if (c !== '\\') {
      i++;
      continue;
    }
    name.lastIndex = i;
    const m = name.exec(s);
    if (!m) {
      // An escaped character (\%, \{, \\): never a comment's start.
      i += 2;
      continue;
    }
    const cmd = m[1];
    let j = i + m[0].length;
    if (cmd === 'begin') {
      const b = /\s*\{([^{}\s]+)\}/y;
      b.lastIndex = j;
      const env = b.exec(s);
      if (env && VERBATIM.test(env[1])) {
        const after = j + env[0].length;
        const end = new RegExp(`\\\\end\\s*\\{${reEsc(env[1])}\\}`, 'g');
        end.lastIndex = after;
        const e = end.exec(s);
        if (env[1] === 'comment') {
          const to = e ? e.index + e[0].length : n;
          out.commentEnvs.push({ from: i, to });
          i = to;
          continue;
        }
        // Its options and arguments are on the \begin's line; what it holds starts on the next.
        const lineEnd = s.indexOf('\n', after);
        const bodyFrom = lineEnd < 0 || (e && lineEnd > e.index) ? after : lineEnd + 1;
        const bodyTo = e ? e.index : n;
        if (bodyTo > bodyFrom) out.literal.push({ from: bodyFrom, to: bodyTo });
        i = e ? e.index + e[0].length : n;
        continue;
      }
      i = j;
      continue;
    }
    if (cmd === 'verb' || ((cmd === 'url' || cmd === 'nolinkurl' || cmd === 'path') && s[j] !== '{' && s[j] !== ' ')) {
      // \verb|…| (and \url|…|): to the same mark again, on the same line.
      const mark = s[j];
      if (!mark || /[\s\n]/.test(mark)) {
        i = j;
        continue;
      }
      const e = s.indexOf(mark, j + 1);
      const eol = s.indexOf('\n', j + 1);
      if (e < 0 || (eol >= 0 && eol < e)) {
        i = j + 1;
        continue;
      }
      out.literal.push({ from: j + 1, to: e });
      i = e + 1;
      continue;
    }
    if (cmd === 'url' || cmd === 'nolinkurl' || cmd === 'path' || cmd === 'href') {
      while (s[j] === ' ') j++;
      const e = closeBrace(s, j);
      if (e > 0) {
        out.literal.push({ from: j + 1, to: e - 1 });
        i = e;
        continue;
      }
      i = j;
      continue;
    }
    if (cmd === 'iffalse') {
      const e = iffalseEnd(s, j);
      if (e > 0) out.iffalse.push({ from: i, to: e });
      i = j;
      continue;
    }
    i = j;
  }
  return out;
}

/** The text with these spans made spaces (line breaks kept), so it is as long as it was and its lines stay where they were. */
export function blankSpans(s: string, spans: Span[]): string {
  if (!spans.length) return s;
  const a = s.split('');
  for (const sp of spans) for (let k = sp.from; k < sp.to && k < a.length; k++) if (a[k] !== '\n') a[k] = ' ';
  return a.join('');
}

/** The text without what TeX does not typeset as commands: comments, comment blocks, \iffalse blocks and literal text, as spaces. */
export function cleanTex(s: string, scan = scanTex(s)): string {
  return blankSpans(s, [...scan.comments, ...scan.commentEnvs, ...scan.literal, ...scan.iffalse]);
}

/** The line (from 1) a place in a text is on. */
export function lineOf(s: string, pos: number): number {
  let n = 1;
  for (let i = s.indexOf('\n'); i >= 0 && i < pos; i = s.indexOf('\n', i + 1)) n++;
  return n;
}

/** The line a place is on: its start and end. */
export function lineSpan(s: string, pos: number): Span {
  const from = s.lastIndexOf('\n', pos - 1) + 1;
  let to = s.indexOf('\n', pos);
  if (to < 0) to = s.length;
  return { from, to };
}

// ---- the files it reads ------------------------------------------------------------------------------------------

export interface TexSource {
  name: string;
  text: string;
  /** The text with its comments and literal text blanked. */
  clean: string;
  scan: TexScan;
}

/** A file of the document a command names: as named, or with .tex. */
function fileNamed(doc: TexDoc, arg: string): string | null {
  const n = arg
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/^(\.\/)+/, '');
  if (!n) return null;
  for (const cand of [n, `${n}.tex`]) if (doc.files.some((f) => f.name === cand && /\.(tex|ltx|tikz|pgf)$/i.test(f.name))) return cand;
  return null;
}

/** The names of the files a source reads (\input, \include, \subfile, \import), in its order. */
export function readsIn(doc: TexDoc, clean: string): { name: string; at: number; end: number; how: string }[] {
  const out: { name: string; at: number; end: number; how: string }[] = [];
  for (const m of clean.matchAll(/\\(input|include|subfile|subfileinclude|InputIfFileExists)\s*\{([^{}]+)\}|\\((?:sub)?import)\*?\s*\{([^{}]*)\}\s*\{([^{}]+)\}|\\input\s+([^\s{}\\%]+)/g)) {
    const arg = m[2] ?? (m[4] !== undefined ? `${m[4].trim().replace(/\/?$/, '/')}${m[5].trim()}`.replace(/^\/+/, '') : m[6]);
    const name = arg ? fileNamed(doc, arg) : null;
    if (name) out.push({ name, at: m.index!, end: m.index! + m[0].length, how: m[1] ?? m[3] ?? 'input' });
  }
  return out;
}

/** main.tex and the .tex files it reads (in turn), in the order TeX first reads each; files nothing reads are left out. */
export function texSources(doc: TexDoc): TexSource[] {
  const out: TexSource[] = [];
  const seen = new Set<string>();
  const add = (name: string, text: string, depth: number) => {
    if (seen.has(name) || depth > 12) return;
    seen.add(name);
    const scan = scanTex(text);
    const src = { name, text, clean: cleanTex(text, scan), scan };
    out.push(src);
    for (const r of readsIn(doc, src.clean)) {
      const f = doc.files.find((x) => x.name === r.name);
      if (f) add(f.name, f.text, depth + 1);
    }
  };
  add(TEX_MAIN, doc.main, 0);
  return out;
}

/** The bibliographies a document reads (\bibliography, \addbibresource), whether it uses biblatex, and whether it has its own thebibliography. */
export function bibliographyOf(doc: TexDoc, sources: TexSource[]): { files: string[]; named: string[]; biblatex: boolean; inline: boolean } {
  const named: string[] = [];
  let biblatex = false;
  let inline = false;
  for (const s of sources) {
    for (const m of s.clean.matchAll(/\\bibliography\s*\{([^{}]*)\}/g))
      for (const p of m[1].split(','))
        if (p.trim())
          named.push(
            p
              .trim()
              .replace(/^(\.\/)+/, '')
              .replace(/(\.bib)?$/, '.bib'),
          );
    for (const m of s.clean.matchAll(/\\addbibresource\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g)) if (m[1].trim()) named.push(m[1].trim().replace(/^(\.\/)+/, ''));
    if (/\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bbiblatex\b/.test(s.clean)) biblatex = true;
    if (/\\begin\s*\{thebibliography\}/.test(s.clean)) inline = true;
  }
  const files = [...new Set(named)].filter((n) => doc.files.some((f) => f.name === n));
  return { files, named: [...new Set(named)], biblatex, inline };
}

// ---- BibTeX, entry by entry ----------------------------------------------------------------------------------------

export interface BibField {
  name: string;
  /** Its value, joined and with @string macros put in (braces and LaTeX kept). */
  value: string;
  /** Where its value is in the file (after the =, to before the , or the entry's end). */
  from: number;
  to: number;
}

export interface BibItem {
  file: string;
  type: string;
  key: string;
  /** The whole entry: from its @ to after its closing brace. */
  from: number;
  to: number;
  line: number;
  fields: BibField[];
}

const MONTHS: Record<string, string> = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };

export const bibField = (e: Pick<BibItem, 'fields'>, name: string) => e.fields.find((f) => f.name === name)?.value ?? '';

/**
 * A .bib file's entries, each with where it is and its fields (values with their @string macros put in and parts
 * joined by #), and BibTeX's own problems with it (an entry it cannot read). Text outside entries is a comment, as
 * BibTeX takes it; braces count as BibTeX counts them.
 */
export function parseBibFile(file: string, text: string, outer: Map<string, string> = new Map()): { entries: BibItem[]; strings: Map<string, string>; problems: { line: number; message: string }[] } {
  const entries: BibItem[] = [];
  const strings = new Map(outer);
  const problems: { line: number; message: string }[] = [];
  const n = text.length;
  const ws = (i: number) => {
    while (i < n && /\s/.test(text[i])) i++;
    return i;
  };
  /** A value from i: parts joined by #, each braced, quoted, a number or a macro. */
  const value = (start: number, close: string): { value: string; end: number } | null => {
    let i = ws(start);
    let v = '';
    for (;;) {
      const c = text[i];
      if (c === '{') {
        const e = closeBraceBib(text, i);
        if (e < 0) return null;
        v += text.slice(i + 1, e - 1);
        i = e;
      } else if (c === '"') {
        let depth = 0;
        let k = i + 1;
        for (; k < n; k++) {
          if (text[k] === '{') depth++;
          else if (text[k] === '}') depth--;
          else if (text[k] === '"' && depth === 0) break;
        }
        if (k >= n) return null;
        v += text.slice(i + 1, k);
        i = k + 1;
      } else {
        const m = /[A-Za-z0-9_:.+'/-]+/y;
        m.lastIndex = i;
        const t = m.exec(text);
        if (!t) return null;
        const word = t[0];
        v += /^\d+$/.test(word) ? word : (strings.get(word.toLowerCase()) ?? MONTHS[word.toLowerCase()] ?? word);
        i += word.length;
      }
      i = ws(i);
      if (text[i] === '#') {
        i = ws(i + 1);
        continue;
      }
      return { value: v, end: i };
    }
  };
  let i = 0;
  while (i < n) {
    const at = text.indexOf('@', i);
    if (at < 0) break;
    const head = /@\s*([A-Za-z]+)\s*([{(])/y;
    head.lastIndex = at;
    const h = head.exec(text);
    if (!h) {
      i = at + 1;
      continue;
    }
    const type = h[1].toLowerCase();
    const open = at + h[0].length - 1;
    const close = h[2] === '{' ? '}' : ')';
    if (type === 'comment' || type === 'preamble') {
      const e = h[2] === '{' ? closeBraceBib(text, open) : text.indexOf(')', open);
      i = e < 0 ? n : e + (h[2] === '{' ? 0 : 1);
      continue;
    }
    if (type === 'string') {
      const m = /\s*([A-Za-z][A-Za-z0-9_:.+-]*)\s*=/y;
      m.lastIndex = open + 1;
      const s = m.exec(text);
      const v = s ? value(open + 1 + s[0].length, close) : null;
      if (s && v) strings.set(s[1].toLowerCase(), v.value);
      const e = h[2] === '{' ? closeBraceBib(text, open) : text.indexOf(')', open) + 1;
      i = e <= 0 ? n : e;
      continue;
    }
    const keyRe = /\s*([^,\s{}()]*)\s*,/y;
    keyRe.lastIndex = open + 1;
    const k = keyRe.exec(text);
    const line = lineOf(text, at);
    if (!k) {
      problems.push({ line, message: `An entry (@${h[1]}) has no key BibTeX can read` });
      i = open + 1;
      continue;
    }
    const fields: BibField[] = [];
    let j = open + 1 + k[0].length;
    let ok = true;
    for (;;) {
      j = ws(j);
      if (text[j] === close) {
        j++;
        break;
      }
      const f = /([A-Za-z][A-Za-z0-9_:.+-]*)\s*=/y;
      f.lastIndex = j;
      const fm = f.exec(text);
      if (!fm) {
        ok = false;
        break;
      }
      const v = value(j + fm[0].length, close);
      if (!v) {
        ok = false;
        break;
      }
      fields.push({ name: fm[1].toLowerCase(), value: v.value.replace(/\s+/g, ' ').trim(), from: ws(j + fm[0].length), to: v.end });
      j = ws(v.end);
      if (text[j] === ',') {
        j++;
        continue;
      }
      if (text[j] === close) {
        j++;
        break;
      }
      ok = false;
      break;
    }
    if (!ok) {
      problems.push({ line: lineOf(text, j), message: `The entry ${k[1] || '(no key)'} could not be read past here: a brace, a quote or a comma is missing` });
      // BibTeX skips to the next entry: so does this.
      const next = text.indexOf('\n@', j);
      i = next < 0 ? n : next + 1;
      continue;
    }
    entries.push({ file, type, key: k[1], from: at, to: j, line, fields });
    i = j;
  }
  return { entries, strings, problems };
}

/** The end of a BibTeX value's braces from s[i] ("{"), counting every brace (BibTeX does not skip escaped ones), or -1. */
function closeBraceBib(s: string, i: number): number {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return j + 1;
  }
  return -1;
}

/** The fields BibTeX's standard styles need for each type (one of a list of names: either does). */
export const REQUIRED_FIELDS: Record<string, string[][]> = {
  article: [['author'], ['title'], ['journal', 'journaltitle'], ['year', 'date']],
  inproceedings: [['author'], ['title'], ['booktitle'], ['year', 'date']],
  conference: [['author'], ['title'], ['booktitle'], ['year', 'date']],
  incollection: [['author'], ['title'], ['booktitle'], ['publisher'], ['year', 'date']],
  book: [['author', 'editor'], ['title'], ['publisher'], ['year', 'date']],
  inbook: [['author', 'editor'], ['title'], ['chapter', 'pages'], ['publisher'], ['year', 'date']],
  phdthesis: [['author'], ['title'], ['school', 'institution'], ['year', 'date']],
  mastersthesis: [['author'], ['title'], ['school', 'institution'], ['year', 'date']],
  techreport: [['author'], ['title'], ['institution'], ['year', 'date']],
  proceedings: [['title'], ['year', 'date']],
  unpublished: [['author'], ['title'], ['note']],
  online: [['author', 'editor', 'organization'], ['title'], ['url'], ['year', 'date', 'urldate']],
  misc: [['title'], ['year', 'date']],
};

// ---- what it cites -----------------------------------------------------------------------------------------------

export interface CiteUse {
  key: string;
  file: string;
  /** Where the key is in its file. */
  from: number;
  to: number;
  line: number;
}

/** Every key the document cites (\cite, \citep, \citet, \nocite, \parencite, \textcite, \autocite…), where; and whether \nocite{*} cites them all. */
export function citesIn(sources: TexSource[]): { uses: CiteUse[]; all: boolean } {
  const uses: CiteUse[] = [];
  let all = false;
  for (const s of sources) {
    for (const m of s.clean.matchAll(/\\([A-Za-z]*[cC]ite[A-Za-z]*)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}/g)) {
      if (/^(citestyle|citesetup|bibliographystyle)$/.test(m[1])) continue;
      const argAt = m.index! + m[0].length - 1 - m[2].length;
      let off = 0;
      for (const part of m[2].split(',')) {
        const key = part.trim();
        const at = argAt + off + part.indexOf(key);
        off += part.length + 1;
        if (!key) continue;
        if (key === '*') {
          all = true;
          continue;
        }
        uses.push({ key, file: s.name, from: at, to: at + key.length, line: lineOf(s.text, at) });
      }
    }
  }
  return { uses, all };
}

/** The keys of a document's own thebibliography (\bibitem[…]{key}). */
export function bibitemsIn(sources: TexSource[]): { key: string; file: string; from: number; to: number; line: number }[] {
  const out: { key: string; file: string; from: number; to: number; line: number }[] = [];
  for (const s of sources)
    for (const m of s.clean.matchAll(/\\bibitem\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g)) {
      const at = m.index! + m[0].length - 1 - m[1].length;
      out.push({ key: m[1].trim(), file: s.name, from: at, to: at + m[1].length, line: lineOf(s.text, at) });
    }
  return out;
}

// ---- headings ------------------------------------------------------------------------------------------------------

export interface Heading {
  file: string;
  from: number;
  to: number;
  line: number;
  kind: string;
  /** Its title as words. */
  title: string;
}

/** The document's headings (and the acknowledgement environments and \appendix, which act as headings), in order. */
export function headingsIn(sources: TexSource[]): Heading[] {
  const out: Heading[] = [];
  for (const s of sources) {
    for (const m of s.clean.matchAll(/\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\]\s*)?(?=\{)/g)) {
      const open = m.index! + m[0].length;
      const end = closeBrace(s.clean, open);
      if (end < 0) continue;
      out.push({ file: s.name, from: m.index!, to: end, line: lineOf(s.text, m.index!), kind: m[1], title: texPlain(s.text.slice(open + 1, end - 1)) });
    }
    for (const m of s.clean.matchAll(/\\begin\s*\{(acks?|acknowledge?ments?)\}/g)) out.push({ file: s.name, from: m.index!, to: m.index! + m[0].length, line: lineOf(s.text, m.index!), kind: 'environment', title: 'Acknowledgments' });
    for (const m of s.clean.matchAll(/\\appendix\b/g)) out.push({ file: s.name, from: m.index!, to: m.index! + m[0].length, line: lineOf(s.text, m.index!), kind: 'appendix', title: 'Appendix' });
  }
  return out;
}

// ---- tables ----------------------------------------------------------------------------------------------------------

export interface TabCell {
  /** Where its text is in the file. */
  from: number;
  to: number;
  raw: string;
  /** Its first column, and how many it spans (\multicolumn). */
  col: number;
  span: number;
}

export interface TabRow {
  cells: TabCell[];
  /** A full rule (\midrule, \hline) comes before it. */
  ruled: boolean;
}

export interface Tabular {
  file: string;
  env: string;
  /** \begin{tabular} … \end{tabular}, whole. */
  from: number;
  to: number;
  line: number;
  rows: TabRow[];
  /** `% hydor:table <id>` just above it: a table Experiments put there. */
  marker?: string;
}

/** `s` split at `sep` where it is at the top level (not in braces, not in maths, not escaped): each part with where it starts. */
function splitTop(s: string, sep: '&' | 'row'): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  let depth = 0;
  let math = false;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (sep === 'row' && depth === 0 && !math && (s[i + 1] === '\\' || s.startsWith('\\tabularnewline', i))) {
        out.push({ text: s.slice(from, i), at: from });
        let j = i + (s[i + 1] === '\\' ? 2 : '\\tabularnewline'.length);
        // A row's end may say the space after it: \\[4pt].
        const sp = /\s*\[[^\]]*\]/y;
        sp.lastIndex = j;
        const m = sp.exec(s);
        if (m) j += m[0].length;
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
    else if (sep === '&' && c === '&' && depth === 0 && !math) {
      out.push({ text: s.slice(from, i), at: from });
      from = i + 1;
    }
  }
  out.push({ text: s.slice(from), at: from });
  return out;
}

const RULES = /\\(toprule|midrule|bottomrule|hline|cline|cmidrule|addlinespace|specialrule|hhline|morecmidrules|rowcolor|noalign)\b\s*(\([^)]*\))?\s*(\[[^\]]*\])?\s*(\{[^{}]*\}\s*){0,3}/y;

/** The tabulars of a source, row by row and cell by cell, with where each cell is. */
export function tabularsIn(src: TexSource): Tabular[] {
  const out: Tabular[] = [];
  const { clean, text } = src;
  // The markers Experiments puts above its tables are comments, read from the text itself: exactly as it writes them
  // (TABLE_MARK and tableMarks in shared/experiments.ts).
  const markers = [...text.matchAll(/^[ \t]*% hydor:table ([a-z0-9]{4,32})[ \t]*$/gm)].map((m) => ({ id: m[1], at: m.index! }));
  for (const b of clean.matchAll(/\\begin\s*\{(tabular\*?|tabularx|tabulary|longtable|NiceTabular)\}/g)) {
    const env = b[1];
    // Its end: the \end of the same environment at the same depth.
    const re = new RegExp(`\\\\(begin|end)\\s*\\{${reEsc(env)}\\}`, 'g');
    re.lastIndex = b.index! + b[0].length;
    let depth = 1;
    let end: RegExpExecArray | null = null;
    for (let m = re.exec(clean); m; m = re.exec(clean)) {
      depth += m[1] === 'begin' ? 1 : -1;
      if (depth === 0) {
        end = m;
        break;
      }
    }
    if (!end) continue;
    // Past its spec: tabular{spec}, tabular*{width}{spec}, tabularx{width}{spec}, an optional [pos] first.
    let at = b.index! + b[0].length;
    const skip = () => {
      while (/\s/.test(clean[at] ?? '')) at++;
    };
    skip();
    if (clean[at] === '[') at = clean.indexOf(']', at) + 1;
    skip();
    if (env !== 'tabular' && env !== 'longtable' && env !== 'NiceTabular') {
      const w = closeBrace(clean, at);
      if (w < 0) continue;
      at = w;
      skip();
    }
    const spec = closeBrace(clean, at);
    if (spec < 0) continue;
    const bodyFrom = spec;
    const body = clean.slice(bodyFrom, end.index);
    const rows: TabRow[] = [];
    let ruled = false;
    for (const part of splitTop(body, 'row')) {
      // The rules before its cells.
      let k = 0;
      let lead = 0;
      for (;;) {
        while (/\s/.test(part.text[k] ?? '')) k++;
        RULES.lastIndex = k;
        const r = RULES.exec(part.text);
        if (!r) break;
        if (/^\\(midrule|hline|specialrule|toprule|bottomrule)/.test(r[0])) ruled = true;
        k += r[0].length;
        lead = k;
      }
      const cellsText = part.text.slice(lead);
      if (!cellsText.trim()) continue;
      const cells: TabCell[] = [];
      let col = 0;
      for (const c of splitTop(cellsText, '&')) {
        // Its text without comments (a cell's own % note is not part of it), at the same place as in the file.
        const from = bodyFrom + part.at + lead + c.at;
        const trimmedStart = c.text.length - c.text.trimStart().length;
        const raw = c.text.trim();
        const mc = /^\\multicolumn\s*\{\s*(\d+)\s*\}/.exec(raw);
        const span = mc ? Math.max(1, Number(mc[1])) : 1;
        cells.push({ from: from + trimmedStart, to: from + trimmedStart + raw.length, raw, col, span });
        col += span;
      }
      rows.push({ cells, ruled });
      ruled = false;
    }
    const from = b.index!;
    out.push({ file: src.name, env, from, to: end.index + end[0].length, line: lineOf(text, from), rows });
  }
  // A marker belongs to the first table after it (a few lines on at most: the table environment may come between).
  for (const m of markers) {
    const t = out.find((x) => x.from > m.at);
    if (t && !t.marker && t.line - lineOf(text, m.at) <= 20) t.marker = m.id;
  }
  return out;
}

export interface CellNumber {
  value: number;
  /** Digits after the point, as written. */
  digits: number;
  /** Where the number's text is in the file. */
  from: number;
  to: number;
  bold: boolean;
  /** A significance mark beside it (†, ‡, *). */
  marked: boolean;
  /** Written as a percentage. */
  percent: boolean;
  /** The whole cell is maths ($…$). */
  math: boolean;
}

/** Spans of a cell whose text is not shown (\phantom's), or is a colour, a width or a count, not a value. */
const NOT_VALUES =
  /\\(?:[hv]?phantom)\s*\{[^{}]*\}|\\(?:cellcolor|rowcolor|columncolor|color)\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}|\\textcolor\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}|\\multicolumn\s*\{[^{}]*\}\s*\{[^{}]*\}|\\multirow\s*\{[^{}]*\}\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}|\\(?:hspace|vspace|rule|raisebox)\*?\s*\{[^{}]*\}|\\[A-Za-z@]+/g;

/** The number a cell holds, when it holds one (a value, with a ± and marks perhaps), or null for words, a dash or nothing. */
export function cellNumber(c: TabCell): CellNumber | null {
  const raw = c.raw;
  if (!raw) return null;
  // What is left once commands, braces, maths signs, ±, % and marks go must be numbers alone.
  const bare = raw
    .replace(NOT_VALUES, ' ')
    .replace(/[{}$^_~\s()[\]+,/<>=\\]/g, '')
    .replace(/±|%|†|‡|\*|–|—/g, '');
  if (!/^[-−]?\d*\.?\d+([-−]?\d*\.?\d+)*$/.test(bare) || !/\d/.test(bare)) return null;
  const masked = raw.replace(NOT_VALUES, (m) => ' '.repeat(m.length));
  const num = /(?<![\d.])[-−]?(\d+(?:\.\d+)?|\.\d+)(?![\d])/g.exec(masked);
  if (!num) return null;
  const textNum = num[0].replace('−', '-');
  const value = Number(textNum);
  if (!Number.isFinite(value)) return null;
  const before = raw.slice(0, num.index);
  const bold = /\\(textbf|mathbf|boldsymbol|bm|bfseries|bf|boldmath)\b/.test(before) || /\\(bfseries|bf)\b/.test(raw);
  const after = raw.slice(num.index + num[0].length);
  const marked = /\\(dag|dagger|ddag|ddagger|ast|star)\b|†|‡|\^\s*\{?\s*\*|\\textsuperscript\s*\{[^}]*[*†‡]|\d\s*\*/.test(raw);
  const percent = /^\s*\\?%/.test(after) || /\\%/.test(after.slice(0, 6));
  return {
    value,
    digits: /\.(\d+)/.exec(num[1])?.[1].length ?? 0,
    from: c.from + num.index,
    to: c.from + num.index + num[0].length,
    bold,
    marked,
    percent,
    math: /^\$[\s\S]*\$$/.test(raw.trim()),
  };
}

/** A row's or column's words, for the direction it is better in. */
export type Better = { better: 'max' | 'min'; sure: boolean };

/** Which way a metric is better, by its name: losses, errors, times and sizes lower; scores higher; unsure otherwise (higher assumed). */
export function betterOf(header: string): Better {
  const h = header.toLowerCase();
  if (/↓|\\downarrow|lower (is )?better|\(lower\)/.test(h)) return { better: 'min', sure: true };
  if (/↑|\\uparrow|higher (is )?better|\(higher\)/.test(h)) return { better: 'max', sure: true };
  if (/\b(loss|error|err|errors|wer|cer|ter|mae|mse|rmse|ppl|perplexity|latency|time|ms|sec|secs|seconds|minutes|hours|memory|mem|gb|mb|params?|parameters|flops|cost|fpr|fnr|eer|distance|regret|bpc|bpd|nll|fid|kid|size|mean rank|rank)\b/.test(h))
    return { better: 'min', sure: true };
  if (
    /\b(acc|accuracy|f1|f-1|f_1|f-score|fscore|precision|prec|p@\d+|recall|rec|r@\d+|ndcg|map|mrr|bleu|rouge|rouge-l|meteor|chrf|bertscore|auc|roc|ap|em|exact|exact match|score|success|win|win rate|hit|hits|hr|sr|iou|miou|dice|psnr|ssim|r2|corr|correlation|spearman|pearson|kendall|tau|throughput|speedup|coverage|bpref|p@k|r@k|ndcg@\d+|mrr@\d+|recall@\d+|hits@\d+)\b|@\d+/.test(
      h,
    )
  )
    return { better: 'max', sure: true };
  return { better: 'max', sure: false };
}

// ---- the template, and whether it is in its anonymous version --------------------------------------------------------

export interface TemplateMode {
  template: PaperTemplate | null;
  /** Its names hidden now; null when the template has no anonymous version of its own. */
  anonymous: boolean | null;
  /** How it is in its anonymous version, in words. */
  how?: string;
  /** The change that makes it anonymous. */
  toAnonymous?: CheckEdit[];
}

/** A \usepackage's or \documentclass's options, and where the whole command is. */
function optionsAt(main: string, clean: string, re: RegExp): { opts: string[]; from: number; to: number } | null {
  re.lastIndex = 0;
  const m = re.exec(clean);
  if (!m) return null;
  const text = main.slice(m.index, m.index + m[0].length);
  const br = /\[([^\]]*)\]/.exec(text);
  return {
    opts: br
      ? br[1]
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    from: m.index,
    to: m.index + m[0].length,
  };
}

/** The command written again with `add` in its options and `drop` taken out: the whole command is the change, so it is made only where it is as it was. */
function optionsEdit(main: string, o: NonNullable<ReturnType<typeof optionsAt>>, add: string[], drop: RegExp): CheckEdit {
  const was = main.slice(o.from, o.to);
  const opts = [...o.opts.filter((x) => !drop.test(x)), ...add.filter((a) => !o.opts.includes(a))];
  const list = opts.length ? `[${opts.join(',')}]` : '';
  const text = /\[[^\]]*\]/.test(was) ? was.replace(/\s*\[[^\]]*\]/, list) : was.replace('{', `${list}{`);
  return { file: TEX_MAIN, from: o.from, to: o.to, was, text };
}

/** The template main.tex uses, and whether it hides the authors now (see TemplateMode). */
export function templateMode(main: string, clean = cleanTex(main)): TemplateMode {
  const pkg = (name: string) => optionsAt(main, clean, new RegExp(`\\\\usepackage\\s*(\\[[^\\]]*\\])?\\s*\\{\\s*(${name})\\s*\\}`, 'g'));
  const acl = pkg('acl');
  if (acl) {
    const anon = acl.opts.includes('review');
    return { template: 'acl', anonymous: anon, how: '\\usepackage[review]{acl}', toAnonymous: anon ? undefined : [optionsEdit(main, acl, ['review'], /^(final|preprint)$/)] };
  }
  const neurips = pkg('neurips_\\d{4}');
  if (neurips) {
    const anon = !neurips.opts.some((o) => o === 'final' || o === 'preprint');
    return { template: 'neurips', anonymous: anon, how: 'the NeurIPS style without final or preprint', toAnonymous: anon ? undefined : [optionsEdit(main, neurips, [], /^(final|preprint)$/)] };
  }
  const icml = pkg('icml\\d{4}');
  if (icml) {
    const anon = !icml.opts.includes('accepted');
    return { template: 'icml', anonymous: anon, how: 'the ICML style without accepted', toAnonymous: anon ? undefined : [optionsEdit(main, icml, [], /^accepted$/)] };
  }
  if (/\\usepackage\s*(\[[^\]]*\])?\s*\{\s*iclr\d{4}_conference\s*\}/.test(clean)) {
    const fin = /\\iclrfinalcopy\b/.exec(clean);
    return {
      template: 'iclr',
      anonymous: !fin,
      how: 'no \\iclrfinalcopy',
      toAnonymous: fin ? [{ file: TEX_MAIN, from: fin.index, to: fin.index + '\\iclrfinalcopy'.length, was: '\\iclrfinalcopy', text: '% \\iclrfinalcopy' }] : undefined,
    };
  }
  const aaai = pkg('aaai\\d{2,4}');
  if (aaai) {
    const anon = aaai.opts.includes('submission');
    return { template: 'aaai', anonymous: anon, how: '\\usepackage[submission]{aaai…}', toAnonymous: anon ? undefined : [optionsEdit(main, aaai, ['submission'], /^$/)] };
  }
  const acm = optionsAt(main, clean, /\\documentclass\s*(\[[^\]]*\])?\s*\{\s*acmart\s*\}/g);
  if (acm) {
    // anonymous, or anonymous=true (as SIGIR's call writes it).
    const anon = acm.opts.some((o) => /^anonymous(\s*=\s*true)?$/i.test(o));
    return { template: 'acmart', anonymous: anon, how: 'acmart’s anonymous option', toAnonymous: anon ? undefined : [optionsEdit(main, acm, ['anonymous'], /^anonymous\s*=/i)] };
  }
  const ieee = optionsAt(main, clean, /\\documentclass\s*(\[[^\]]*\])?\s*\{\s*IEEEtran\s*\}/g);
  // IEEEtran's peerreview puts an anonymous cover page first; its other modes show the authors, and it has no switch of its own to hide them.
  if (ieee) return { template: 'ieeetran', anonymous: ieee.opts.includes('peerreview') ? true : null, how: 'IEEEtran’s peerreview option' };
  if (/\\documentclass\s*(\[[^\]]*\])?\s*\{\s*llncs\s*\}/.test(clean)) return { template: 'llncs', anonymous: null };
  return { template: null, anonymous: null };
}

// ---- words, as they compare --------------------------------------------------------------------------------------

/** Text from TeX or a service, as plain small letters: accents, commands and braces gone. */
export function plainWords(s: string): string {
  return s
    .replace(/\\(aa|AA|ae|AE|oe|OE|o|O|l|L|ss|i|j)(?![A-Za-z])\s*/g, (_m, k: string) => LETTER[k] ?? '')
    .replace(/\\["'`^~=.]/g, '')
    .replace(/\\[uvHckbdtr](?=\s*\{|\s+[A-Za-z])\s*/g, '')
    .replace(/\\[A-Za-z@]+\*?/g, ' ')
    .replace(/[{}$]/g, '')
    .replace(/--+/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The letters TeX writes as commands. */
const LETTER: Record<string, string> = { aa: 'a', AA: 'a', ae: 'ae', AE: 'ae', oe: 'oe', OE: 'oe', o: 'o', O: 'o', l: 'l', L: 'l', ss: 'ss', i: 'i', j: 'j' };

/** How alike two titles are, from 0 to 1: their words in common (Dice), case, accents and punctuation aside. */
export function titleLikeness(a: string, b: string): number {
  const wa = plainWords(a).split(' ').filter(Boolean);
  const wb = plainWords(b).split(' ').filter(Boolean);
  if (!wa.length || !wb.length) return 0;
  const count = new Map<string, number>();
  for (const w of wa) count.set(w, (count.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of wb) {
    const c = count.get(w) ?? 0;
    if (c > 0) {
      common++;
      count.set(w, c - 1);
    }
  }
  return (2 * common) / (wa.length + wb.length);
}

/** An entry's authors as BibTeX writes them ("Family, Given and Given Family and others"): each one's family name, plain, and whether the list was cut ("and others"). */
export function bibAuthors(field: string): { families: string[]; cut: boolean } {
  const parts = field
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean);
  let cut = false;
  const families: string[] = [];
  for (const p of parts) {
    if (/^others$/i.test(p)) {
      cut = true;
      continue;
    }
    // A name in braces is one name (an organisation).
    if (/^\{[^{}]*\}$/.test(p)) {
      families.push(plainWords(p));
      continue;
    }
    // "Given Family Jr." and "Family, Jr., Given" both keep the family name.
    const fam = p.includes(',')
      ? p.split(',')[0]
      : p
          .replace(/[{}]/g, '')
          .replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/, '')
          .split(/\s+/)
          .pop()!;
    families.push(lastWord(fam));
  }
  return { families, cut };
}

/** A family name's last word, plain ("van der Waals" → "waals"): how names are told apart here. */
export const lastWord = (s: string) => plainWords(s).split(' ').pop() ?? '';
