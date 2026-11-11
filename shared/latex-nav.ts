// Moving about a LaTeX project by what its commands name: the target under the cursor (the label in \ref{…}, the key in
// \cite{…}, the file in \input{…}, the picture in \includegraphics{…}), where that is defined (a \label, a bibliography
// entry or \bibitem, a file of the project, a picture), and what to say of each in the lists of completions: a label's
// heading or caption ("Section: Introduction", "Figure: The model"), a key's "Knuth 1984 — The TeXbook". All of it is
// worked out from the files' text alone, so the editor can use it as the files change and the tests can check it.
import { bibInfo, familyNames, parseBibEntry } from './latex-bib';

/** A file of the project, by its name (the main one included) and text. */
export interface NavFile {
  name: string;
  text: string;
}

export type TargetKind = 'ref' | 'cite' | 'input' | 'graphics' | 'bib';

/** What a command's argument names, under the cursor: its kind, the name (one key of a list), and where it is in the text. */
export interface Target {
  kind: TargetKind;
  /** The command, without its backslash: "cref". */
  command: string;
  name: string;
  from: number;
  to: number;
}

const REFS = /^(?:ref|eqref|pageref|autoref|nameref|vref|Vref|cref|Cref|cpageref|Cpageref|labelcref|subref|namecref|Namecref|crefrange|Crefrange|zcref|hyperref)$/;
const INPUTS = /^(?:input|include|subfile|subfileinclude|InputIfFileExists)$/;
const BIBS = /^(?:bibliography|addbibresource|addglobalbib)$/;

/** The kind of target a command's argument is, or null. */
function kindOf(cmd: string): TargetKind | null {
  if (REFS.test(cmd)) return 'ref';
  if (/cite/i.test(cmd)) return 'cite';
  if (INPUTS.test(cmd)) return 'input';
  if (cmd === 'includegraphics') return 'graphics';
  if (BIBS.test(cmd)) return 'bib';
  return null;
}

/** Whether `pos` of a line is after a % that comments the rest out. */
function commented(line: string, pos: number): boolean {
  for (let i = 0; i < pos && i < line.length; i++) {
    if (line[i] === '\\') i++;
    else if (line[i] === '%') return true;
  }
  return false;
}

/**
 * The name the command at `pos` takes: with the cursor on a key of \cite{a,b,c}, that key; on the command's own name, its
 * first. Null when the cursor is not on one of these (or in a comment). Only the cursor's own line is read.
 */
export function targetAt(text: string, pos: number): Target | null {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  let end = text.indexOf('\n', pos);
  if (end < 0) end = text.length;
  const line = text.slice(start, end);
  const at = pos - start;
  const re = /\\([A-Za-z]+)\*?((?:\s*\[[^\]\n]*\])*)\s*\{([^{}\n]*)\}/g;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const kind = kindOf(m[1]);
    if (!kind || commented(line, m.index)) continue;
    const argFrom = m.index + m[0].length - 1 - m[3].length;
    const argTo = argFrom + m[3].length;
    if (at < m.index || at > argTo + 1) continue;
    const parts: { name: string; from: number; to: number }[] = [];
    let off = 0;
    for (const raw of kind === 'ref' || kind === 'cite' || kind === 'bib' ? m[3].split(',') : [m[3]]) {
      const lead = /^\s*/.exec(raw)![0].length;
      const name = raw.trim();
      if (name) parts.push({ name, from: argFrom + off + lead, to: argFrom + off + lead + name.length });
      off += raw.length + 1;
    }
    if (!parts.length) continue;
    // On the command's name or its options: the first; in the braces: the one the cursor is in or beside.
    const part = at < argFrom ? parts[0] : (parts.find((p) => at >= p.from && at <= p.to) ?? parts.find((p) => at <= p.to + 1) ?? parts[parts.length - 1]);
    return { kind, command: m[1], name: part.name, from: start + part.from, to: start + part.to };
  }
  return null;
}

/** Where a target is defined: a place in a file (`from`..`to` of its text, on `line`), or a picture of the project. */
export type Found = { kind: 'file'; file: string; from: number; to: number; line: number } | { kind: 'picture'; name: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isTex = (n: string) => /\.(tex|ltx|sty|cls)$/i.test(n);
const lineOf = (text: string, at: number) => {
  let n = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < at; i = text.indexOf('\n', i + 1)) n++;
  return n;
};
const dirOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '');
const normal = (p: string) => {
  const out: string[] = [];
  for (const s of p.replace(/^\.\//, '').split('/')) {
    if (s === '..') out.pop();
    else if (s && s !== '.') out.push(s);
  }
  return out.join('/');
};

/**
 * Where the target is defined, in `files` (the main file first), or among the project's `pictures`. `from`: the file
 * the command is in, whose folder a file named by \input may be relative to. Null when nothing defines it.
 */
export function findDefinition(files: NavFile[], t: Pick<Target, 'kind' | 'name'>, from: string, pictures: string[] = []): Found | null {
  const hit = (f: NavFile, i: number, len: number): Found => ({ kind: 'file', file: f.name, from: i, to: i + len, line: lineOf(f.text, i) });
  const name = t.name.trim();
  if (t.kind === 'ref') {
    const re = new RegExp(`\\\\label\\s*(?:\\[[^\\]]*\\]\\s*)?\\{\\s*(${esc(name)})\\s*\\}|[\\[,]\\s*label\\s*=\\s*\\{?\\s*(${esc(name)})(?![\\w:.-])`);
    for (const f of files) {
      if (!isTex(f.name)) continue;
      const m = re.exec(f.text);
      if (m) return hit(f, m.index + m[0].lastIndexOf(name), name.length);
    }
    return null;
  }
  if (t.kind === 'cite') {
    const entry = new RegExp(`@\\s*(?!comment\\b|string\\b|preamble\\b)[A-Za-z]+\\s*[{(]\\s*(${esc(name)})\\s*,`, 'i');
    for (const f of files) {
      if (!/\.bib$/i.test(f.name)) continue;
      const m = entry.exec(f.text);
      if (m) return hit(f, m.index + m[0].indexOf(name, m[0].indexOf('{') + 1 || m[0].indexOf('(') + 1), name.length);
    }
    const item = new RegExp(`\\\\bibitem\\s*(?:\\[[^\\]]*\\])?\\s*\\{\\s*(${esc(name)})\\s*\\}`);
    for (const f of files) {
      const m = isTex(f.name) ? item.exec(f.text) : null;
      if (m) return hit(f, m.index + m[0].lastIndexOf(name), name.length);
    }
    return null;
  }
  if (t.kind === 'graphics') {
    const n = normal(name);
    const bare = (s: string) => s.replace(/\.(png|jpe?g|pdf|svg|eps|gif|webp)$/i, '');
    const p = pictures.find((x) => x === n) ?? pictures.find((x) => bare(x) === bare(n));
    return p ? { kind: 'picture', name: p } : null;
  }
  // A file of the project: as named, with .tex (or .ltx, .bib) added, from the project's root or the folder of the file asking.
  const exts = t.kind === 'bib' ? ['.bib', ''] : ['.tex', '.ltx', ''];
  const names = new Set(files.map((f) => f.name));
  for (const base of ['', dirOf(from)]) {
    for (const ext of exts) {
      const cand = normal(base + name + (name.toLowerCase().endsWith(ext) ? '' : ext));
      if (names.has(cand)) return { kind: 'file', file: cand, from: 0, to: 0, line: 1 };
    }
  }
  return null;
}

/** What a label stands for: "Figure", "Section"… and the words that go with it (a caption, a heading). */
export interface LabelNote {
  kind: string;
  text: string;
}

const HEADINGS: Record<string, string> = { part: 'Part', chapter: 'Chapter', section: 'Section', subsection: 'Subsection', subsubsection: 'Subsubsection', paragraph: 'Paragraph' };
const FLOATS: Record<string, string> = { figure: 'Figure', 'figure*': 'Figure', table: 'Table', 'table*': 'Table', algorithm: 'Algorithm', 'algorithm*': 'Algorithm', listing: 'Listing', wrapfigure: 'Figure', subfigure: 'Figure', sidewaysfigure: 'Figure', sidewaystable: 'Table' };
const MATH = new Set(['equation', 'equation*', 'align', 'align*', 'alignat', 'gather', 'gather*', 'multline', 'multline*', 'eqnarray', 'flalign', 'split', 'subequations', 'dmath']);
const THEOREMS = new Set(['theorem', 'lemma', 'proposition', 'corollary', 'definition', 'remark', 'example', 'claim', 'conjecture', 'proof', 'assumption', 'fact', 'observation', 'problem']);

/** Text as one plain line for a list: commands and braces out, spaces closed up, cut at `max` characters. */
export function plainLine(s: string, max = 70): string {
  const t = s
    .replace(/%[^\n]*/g, '')
    .replace(/\\(La)?TeX\b\s*(?:\{\})?/g, (_m, la: string | undefined) => (la ? 'LaTeX' : 'TeX'))
    .replace(/\\(?:emph|textbf|textit|texttt|textsc|textrm|mathrm|text|mbox)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:label|cite[a-z]*|ref|eqref|cref|autoref)\s*(?:\[[^\]]*\])?\{[^{}]*\}/g, '')
    .replace(/\\[A-Za-z]+\*?/g, ' ')
    .replace(/[{}$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** The argument in braces that opens at `s[i]` (a "{"), and where it ends. */
function brace(s: string, i: number): { text: string; end: number } | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length && j < i + 4000; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return { text: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

/**
 * What each label of the project's files is: the caption of the figure or table it is in ("Figure: The model"), the
 * formula's environment ("Equation"), a theorem ("Lemma: Every…"), or else the heading it is under ("Section:
 * Introduction"). Where a name is defined twice, the first counts.
 */
export function labelNotes(files: NavFile[]): Map<string, LabelNote> {
  const out = new Map<string, LabelNote>();
  const TOKEN = /\\(begin|end)\s*\{([^{}]+)\}|\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*(?=\{)|\\caption\s*(?:\[[^\]]*\])?\s*(?=\{)|\\label\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g;
  for (const f of files) {
    if (!/\.(tex|ltx)$/i.test(f.name)) continue;
    const text = f.text.length > 600_000 ? f.text.slice(0, 600_000) : f.text;
    let heading: { kind: string; text: string; at: number } | null = null;
    const stack: { env: string; start: number; caption?: string; labels: string[] }[] = [];
    const set = (name: string, note: LabelNote) => name && !out.has(name) && out.set(name, note);
    for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
      const ls = text.lastIndexOf('\n', m.index) + 1;
      if (commented(text.slice(ls, m.index + 1), m.index - ls + 1)) continue;
      if (m[1] === 'begin') stack.push({ env: m[2].trim(), start: m.index + m[0].length, labels: [] });
      else if (m[1] === 'end') {
        const env = m[2].trim();
        let k = stack.length - 1;
        while (k >= 0 && stack[k].env !== env) k--;
        if (k < 0) continue;
        const e = stack[k];
        stack.length = k;
        const body = text.slice(e.start, m.index);
        for (const label of e.labels) {
          if (FLOATS[env]) set(label, { kind: FLOATS[env], text: e.caption ? plainLine(e.caption) : '' });
          else if (MATH.has(env)) set(label, { kind: 'Equation', text: heading ? `in “${heading.text}”` : '' });
          else if (THEOREMS.has(env.replace(/\*$/, ''))) set(label, { kind: env.charAt(0).toUpperCase() + env.slice(1), text: plainLine(body.replace(/^\s*(\[[^\]]*\])?\s*/, ''), 50) });
          else set(label, { kind: heading ? heading.kind : 'Label', text: heading?.text ?? '' });
        }
      } else if (m[3]) {
        const b = brace(text, m.index + m[0].length);
        if (b) heading = { kind: HEADINGS[m[3]], text: plainLine(b.text, 60), at: m.index };
      } else if (m[4] === undefined) {
        // \caption: the nearest float (or any open environment) keeps its words.
        const b = brace(text, m.index + m[0].length);
        const e = [...stack].reverse().find((x) => FLOATS[x.env]) ?? stack[stack.length - 1];
        if (b && e) e.caption = b.text;
      } else {
        const name = m[4].trim();
        const open = stack[stack.length - 1];
        if (open) open.labels.push(name);
        else set(name, { kind: heading ? heading.kind : 'Label', text: heading?.text ?? '' });
      }
    }
    // Labels of environments never closed: as under their heading.
    for (const e of stack) for (const label of e.labels) set(label, { kind: heading ? heading.kind : 'Label', text: heading?.text ?? '' });
  }
  return out;
}

/** What a bibliography key is, for lists: "Knuth 1984 — The TeXbook", and its parts. */
export interface CiteNote {
  label: string;
  authors: string;
  year: string;
  title: string;
}

/** Family names as a short byline: "Knuth", "Knuth and Lamport", "Vaswani et al.". */
export function byline(families: string[]): string {
  const f = families.map((x) => x.replace(/[{}\\]/g, '').trim()).filter(Boolean);
  if (!f.length) return '';
  if (f.length === 1) return f[0];
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  return `${f[0]} et al.`;
}

/** The keys of the project's bibliographies (and \bibitem lists) with what each is. */
export function citeNotes(files: NavFile[]): Map<string, CiteNote> {
  const out = new Map<string, CiteNote>();
  for (const f of files) {
    if (/\.bib$/i.test(f.name)) {
      const text = f.text.length > 2_000_000 ? f.text.slice(0, 2_000_000) : f.text;
      for (const m of text.matchAll(/@\s*([A-Za-z]+)\s*[{(]\s*([^,\s{}()]+)\s*,/g)) {
        if (/^(comment|string|preamble)$/i.test(m[1]) || out.has(m[2])) continue;
        const e = parseBibEntry(text.slice(m.index!, m.index! + 6000));
        if (!e) continue;
        const info = bibInfo(e);
        const who = byline(familyNames((e.fields.find(([k]) => k === 'author') ?? e.fields.find(([k]) => k === 'editor'))?.[1] ?? '').map((x) => plainLine(x, 40)));
        const head = [who, info.year].filter(Boolean).join(' ');
        const title = plainLine(e.fields.find(([k]) => k === 'title')?.[1] ?? '', 110);
        out.set(m[2], { label: [head, title].filter(Boolean).join(' — '), authors: who, year: info.year, title });
      }
    } else if (isTex(f.name)) {
      for (const m of f.text.matchAll(/\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}\s*([^\n]*)/g)) {
        const key = m[1].trim();
        if (!out.has(key)) out.set(key, { label: plainLine(m[2], 90), authors: '', year: '', title: plainLine(m[2], 90) });
      }
    }
  }
  return out;
}
