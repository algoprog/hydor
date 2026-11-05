// A LaTeX project's files as its document uses them: which of them TeX reads when it typesets the main file (the
// chapters it puts in, its bibliographies, the styles and classes of its own, its pictures, the data its figures and
// listings read), found the way TeX finds them (the extensions it tries, \graphicspath, \import's folders, comments
// and verbatim text passed over); what kind each file is, to list them in a sensible order (texTree); and references
// made to name a file again when it is renamed or moved (texMoveFiles). The server reads a project on disk with it
// (server/pages/filemodel.ts: what to load into the editor, what TeX takes from the folder, the document a chapter
// belongs to) and keeps what a document uses when a project comes in over the limits; the LaTeX editor draws its files'
// tree from it, with the files the document does not use apart.
import { cleanTexChanges, cleanTexComments, editText, extOf, TEX_MAIN, type TexChange, type TexComment, type TexDoc } from './latex.ts';

// ---- kinds ------------------------------------------------------------------------------------------------------

/** What a file of a project is: a source TeX reads, a bibliography, a style or a class, a picture, data, or other. */
export type TexFileKind = 'tex' | 'bib' | 'style' | 'picture' | 'data' | 'other';

const KINDS: Record<string, TexFileKind> = {
  tex: 'tex',
  ltx: 'tex',
  tikz: 'tex',
  pgf: 'tex',
  bib: 'bib',
  bbl: 'bib',
  sty: 'style',
  cls: 'style',
  clo: 'style',
  cfg: 'style',
  def: 'style',
  fd: 'style',
  bst: 'style',
  bbx: 'style',
  cbx: 'style',
  lbx: 'style',
  ist: 'style',
  png: 'picture',
  jpg: 'picture',
  jpeg: 'picture',
  pdf: 'picture',
  eps: 'picture',
  ps: 'picture',
  svg: 'picture',
  gif: 'picture',
  webp: 'picture',
  mps: 'picture',
  jbig2: 'picture',
  jb2: 'picture',
  dat: 'data',
  csv: 'data',
  tsv: 'data',
  txt: 'data',
};

export const texFileKind = (name: string): TexFileKind => KINDS[extOf(name)] ?? 'other';

/** The order kinds are listed in: sources, the bibliography, styles and classes, pictures, data, the rest. */
export const TEX_KIND_ORDER: TexFileKind[] = ['tex', 'bib', 'style', 'picture', 'data', 'other'];

/**
 * Files TeX and its tools take by themselves, by names no source writes (a class's option file, a package's .cfg, a
 * font's .fd, biblatex's styles, the bibliography BibTeX made, Lua modules): never counted as not used.
 */
const BY_ITSELF = new Set(['bbl', 'clo', 'cfg', 'def', 'fd', 'ist', 'bbx', 'cbx', 'lbx', 'lua']);
export const texUsedByItself = (name: string) => BY_ITSELF.has(extOf(name));

/** The extensions \includegraphics tries, in the order pdfTeX's graphics driver tries them (and XeTeX's EPS). */
const GRAPHIC_EXT = ['pdf', 'png', 'jpg', 'mps', 'jpeg', 'jbig2', 'jb2', 'eps', 'ps', 'PDF', 'PNG', 'JPG', 'JPEG', 'EPS'];
const GRAPHIC_KNOWN = new Set(GRAPHIC_EXT.map((e) => e.toLowerCase()).concat(['svg', 'gif', 'webp', 'bmp']));

// ---- reading a source -------------------------------------------------------------------------------------------

/** Environments whose body TeX does not read as commands (or not at all). */
const VERBATIM = new Set(['verbatim', 'verbatim*', 'Verbatim', 'Verbatim*', 'BVerbatim', 'LVerbatim', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*', 'alltt']);

/** Whether the character at i is escaped by an odd number of backslashes before it. */
function escaped(s: string, i: number): boolean {
  let k = 0;
  for (let j = i - 1; j >= 0 && s[j] === '\\'; j--) k++;
  return k % 2 === 1;
}

const blank = (s: string) => s.replace(/[^\n]/g, ' ');

/**
 * A source as TeX reads it, the same length: comments, the bodies of verbatim environments, \iffalse … \fi, and all that
 * comes after \endinput or \end{document} made spaces (line ends kept), so a place in it is the same place in the source.
 */
export function texMask(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let verb: string | null = null;
  let iffalse = false;
  let done = false;
  for (const line of lines) {
    if (done) {
      out.push(blank(line));
      continue;
    }
    if (verb) {
      const end = line.indexOf(`\\end{${verb}}`);
      if (end < 0) {
        out.push(blank(line));
        continue;
      }
      out.push(blank(line.slice(0, end)) + maskLine(line.slice(end)));
      verb = null;
      continue;
    }
    let l = maskLine(line);
    if (iffalse) {
      if (/^\s*\\fi\b/.test(l)) iffalse = false;
      out.push(blank(line));
      continue;
    }
    if (/^\s*\\iffalse\b/.test(l)) {
      iffalse = true;
      out.push(blank(line));
      continue;
    }
    const b = /\\begin\s*\{([^{}\s]+)\}/.exec(l);
    if (b && VERBATIM.has(b[1]) && !l.slice(b.index).includes(`\\end{${b[1]}}`)) {
      verb = b[1];
      l = l.slice(0, b.index + b[0].length) + blank(l.slice(b.index + b[0].length));
    }
    // TeX reads the rest of the line \endinput is on, then nothing more of the file; nothing after \end{document}.
    const stop = /\\endinput\b|\\end\s*\{document\}/.exec(l);
    if (stop) {
      done = true;
      if (stop[0] !== '\\endinput') l = l.slice(0, stop.index + stop[0].length) + blank(l.slice(stop.index + stop[0].length));
    }
    out.push(l);
  }
  return out.join('\n');
}

/** A line without its comment (a % no backslash escapes), the comment made spaces. */
function maskLine(line: string): string {
  for (let i = 0; i < line.length; i++) if (line[i] === '%' && !escaped(line, i)) return line.slice(0, i) + blank(line.slice(i));
  return line;
}

/** After `i`: spaces and line ends (a blank line too: TeX goes on to the argument). */
function spaces(s: string, i: number): number {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;
  return i;
}

/** The group that starts at s[i] (`open` there), and where it ends; nested groups count, escaped ones not. */
function group(s: string, i: number, open: string, close: string): { from: number; to: number; end: number } | null {
  if (s[i] !== open) return null;
  let depth = 0;
  for (let j = i; j < s.length && j < i + 20_000; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    // Inside brackets, a braced group may hold a ] (width={0.5\linewidth}): it counts as one.
    if (open === '[' && c === '{') {
      const g = group(s, j, '{', '}');
      if (!g) return null;
      j = g.end - 1;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return { from: i + 1, to: j, end: j + 1 };
  }
  return null;
}

/** Optional arguments in brackets skipped, from `i` (spaces before and between them too), and beamer's <2-> overlays. */
function options(s: string, i: number): number {
  let j = spaces(s, i);
  for (let k = 0; k < 8 && (s[j] === '[' || s[j] === '<'); k++) {
    if (s[j] === '<') {
      const end = /^<[^<>\n{}]{0,40}>/.exec(s.slice(j, j + 44));
      if (!end) return j;
      j = spaces(s, j + end[0].length);
      continue;
    }
    const g = group(s, j, '[', ']');
    if (!g) return j;
    j = spaces(s, g.end);
  }
  return j;
}

/** What a reference reads, which decides the names TeX tries and where. */
export type TexRefKind = 'input' | 'include' | 'bib' | 'bibres' | 'bst' | 'package' | 'class' | 'theme' | 'graphic' | 'svg' | 'pdf' | 'listing' | 'data';

interface Spec {
  kind: TexRefKind;
  /** How many arguments in braces it takes, and which holds the name (from 0). */
  args?: number;
  at?: number;
  /** The name is a list split at commas. */
  list?: boolean;
  /** \import: the first argument is a folder, the second the file in it (`sub`: from the file it is in). */
  dir?: 'root' | 'sub';
  /** A beamer theme: the file is this, then the name, then .sty. */
  prefix?: string;
}

const SPECS: Record<string, Spec> = {
  input: { kind: 'input' },
  InputIfFileExists: { kind: 'input', args: 3 },
  include: { kind: 'include' },
  subfile: { kind: 'input' },
  subfileinclude: { kind: 'include' },
  includestandalone: { kind: 'input' },
  import: { kind: 'input', args: 2, at: 1, dir: 'root' },
  inputfrom: { kind: 'input', args: 2, at: 1, dir: 'root' },
  includefrom: { kind: 'include', args: 2, at: 1, dir: 'root' },
  subimport: { kind: 'input', args: 2, at: 1, dir: 'sub' },
  subinputfrom: { kind: 'input', args: 2, at: 1, dir: 'sub' },
  subincludefrom: { kind: 'include', args: 2, at: 1, dir: 'sub' },
  bibliography: { kind: 'bib', list: true },
  nobibliography: { kind: 'bib', list: true },
  addbibresource: { kind: 'bibres' },
  addglobalbib: { kind: 'bibres' },
  addsectionbib: { kind: 'bibres' },
  bibliographystyle: { kind: 'bst' },
  usepackage: { kind: 'package', list: true },
  RequirePackage: { kind: 'package', list: true },
  RequirePackageWithOptions: { kind: 'package' },
  documentclass: { kind: 'class' },
  LoadClass: { kind: 'class' },
  LoadClassWithOptions: { kind: 'class' },
  usetheme: { kind: 'theme', list: true, prefix: 'beamertheme' },
  usecolortheme: { kind: 'theme', list: true, prefix: 'beamercolortheme' },
  usefonttheme: { kind: 'theme', list: true, prefix: 'beamerfonttheme' },
  useinnertheme: { kind: 'theme', list: true, prefix: 'beamerinnertheme' },
  useoutertheme: { kind: 'theme', list: true, prefix: 'beameroutertheme' },
  includegraphics: { kind: 'graphic' },
  pgfimage: { kind: 'graphic' },
  pgfdeclareimage: { kind: 'graphic', args: 2, at: 1 },
  includesvg: { kind: 'svg' },
  includepdf: { kind: 'pdf' },
  lstinputlisting: { kind: 'listing' },
  inputminted: { kind: 'listing', args: 2, at: 1 },
  verbatiminput: { kind: 'listing' },
  VerbatimInput: { kind: 'listing' },
  BVerbatimInput: { kind: 'listing' },
  LVerbatimInput: { kind: 'listing' },
  pgfplotstableread: { kind: 'data' },
  csvreader: { kind: 'data' },
  csvautotabular: { kind: 'data' },
  csvautobooktabular: { kind: 'data' },
  csvautolongtable: { kind: 'data' },
  csvautobooklongtable: { kind: 'data' },
  DTLloaddb: { kind: 'data', args: 2, at: 1 },
  DTLloadrawdb: { kind: 'data', args: 2, at: 1 },
};

/** A name as a source writes it, where it is, and what reads it (before it is looked for). */
interface Raw {
  cmd: string;
  kind: TexRefKind;
  /** The name as written, and where it is in the file's text: [from, to). */
  name: string;
  from: number;
  to: number;
  /** \import's folder, as written. */
  dir?: string;
  dirFrom?: 'root' | 'sub';
  prefix?: string;
}

/** What one source holds: its references in order, its \graphicspath folders, and its simple macros (\newcommand\x{text}). */
interface Scan {
  refs: Raw[];
  graphicspath: { at: number; dirs: string[] }[];
  macros: Map<string, string>;
  /** Where each line starts, to tell a place's line. */
  lines: number[];
}

const DEFINE = new Set(['newcommand', 'renewcommand', 'providecommand', 'def', 'gdef', 'edef', 'xdef', 'DeclareRobustCommand']);

/** A source read once: its references, \graphicspath and macros (comments, verbatim text and the like passed over). */
function scanSource(text: string): Scan {
  const s = texMask(text);
  const refs: Raw[] = [];
  const graphicspath: Scan['graphicspath'] = [];
  const macros = new Map<string, string>();
  const lines = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lines.push(i + 1);
  const command = /\\([A-Za-z@]+)/g;
  for (let m = command.exec(s); m; m = command.exec(s)) {
    if (escaped(s, m.index)) continue;
    const cmd = m[1];
    let j = m.index + m[0].length;
    if (cmd === 'graphicspath') {
      const g = group(s, spaces(s, j), '{', '}');
      if (!g) continue;
      const inner = s.slice(g.from, g.to);
      const dirs: string[] = [];
      // {{fig/}{img/}}, and {fig/} too (said wrongly, read kindly).
      if (inner.trim().startsWith('{')) {
        for (let k = spaces(inner, 0); inner[k] === '{'; k = spaces(inner, k)) {
          const d = group(inner, k, '{', '}');
          if (!d) break;
          dirs.push(inner.slice(d.from, d.to).trim());
          k = d.end;
        }
      } else if (inner.trim()) dirs.push(inner.trim());
      graphicspath.push({ at: m.index, dirs });
      continue;
    }
    if (DEFINE.has(cmd)) {
      // \newcommand{\x}{text}, \newcommand*\x{text}, \def\x{text}: a macro of no arguments, read in names.
      if (s[j] === '*') j++;
      j = spaces(s, j);
      let name: string | null = null;
      if (s[j] === '{') {
        const g = group(s, j, '{', '}');
        const n = g ? /^\s*\\([A-Za-z@]+)\s*$/.exec(s.slice(g.from, g.to)) : null;
        if (g && n) {
          name = n[1];
          j = g.end;
        }
      } else {
        const n = /^\\([A-Za-z@]+)/.exec(s.slice(j, j + 80));
        if (n) {
          name = n[1];
          j += n[0].length;
        }
      }
      if (!name) continue;
      j = spaces(s, j);
      if (s[j] === '[' || s[j] === '#') continue;
      const g = group(s, j, '{', '}');
      if (!g) continue;
      const body = s.slice(g.from, g.to);
      if (!body.includes('#') && body.length < 200 && !macros.has(name)) macros.set(name, body.trim());
      continue;
    }
    if (cmd === 'begin') {
      // \begin{overpic}[…]{picture}: a picture with things drawn over it.
      const env = group(s, spaces(s, j), '{', '}');
      if (!env || !/^Overpic$|^overpic$/.test(s.slice(env.from, env.to).trim())) continue;
      const a = group(s, options(s, env.end), '{', '}');
      if (a) refs.push({ cmd: 'overpic', kind: 'graphic', name: s.slice(a.from, a.to), from: a.from, to: a.to });
      continue;
    }
    if (cmd === 'addplot') {
      // \addplot[+|3][…] table|file […] {data}
      if (s[j] === '+' || s[j] === '3') j++;
      j = options(s, j);
      const w = /^(table|file)\b/.exec(s.slice(j, j + 6));
      if (!w) continue;
      const a = group(s, options(s, j + w[1].length), '{', '}');
      if (a) refs.push({ cmd: 'addplot', kind: 'data', name: s.slice(a.from, a.to), from: a.from, to: a.to });
      continue;
    }
    const spec = SPECS[cmd];
    if (!spec) continue;
    if (s[j] === '*') j++;
    j = options(s, j);
    const want = spec.args ?? 1;
    const at = spec.at ?? 0;
    const got: { from: number; to: number }[] = [];
    for (let k = 0; k < want; k++) {
      const g = group(s, j, '{', '}');
      if (!g) break;
      got.push({ from: g.from, to: g.to });
      j = options(s, g.end);
    }
    if (got.length <= at) {
      // TeX's own \input takes a name without braces, up to a space: \input chapters/intro
      if (cmd === 'input' && got.length === 0) {
        const bare = /^[ \t]*([^\s{}%\\]+)/.exec(s.slice(m.index + m[0].length, m.index + m[0].length + 300));
        if (bare) {
          const from = m.index + m[0].length + bare[0].length - bare[1].length;
          refs.push({ cmd, kind: spec.kind, name: bare[1], from, to: from + bare[1].length });
        }
      }
      continue;
    }
    const arg = got[at];
    const dir = spec.dir ? s.slice(got[0].from, got[0].to).trim() : undefined;
    if (spec.list) {
      // Each name of a list, where it is: \bibliography{refs, more}.
      let from = arg.from;
      for (const part of s.slice(arg.from, arg.to).split(',')) {
        const lead = part.length - part.trimStart().length;
        const name = part.trim();
        if (name) refs.push({ cmd, kind: spec.kind, name, from: from + lead, to: from + lead + name.length, prefix: spec.prefix });
        from += part.length + 1;
      }
    } else {
      const raw = s.slice(arg.from, arg.to);
      const lead = raw.length - raw.trimStart().length;
      const name = raw.trim();
      if (name) refs.push({ cmd, kind: spec.kind, name, from: arg.from + lead, to: arg.from + lead + name.length, dir, dirFrom: spec.dir });
    }
  }
  return { refs, graphicspath, macros, lines };
}

// ---- finding what is read --------------------------------------------------------------------------------------

/** A project path made plain: no "./", ".." taken back, no leading slash; null when it leaves the project. */
export function texPath(p: string): string | null {
  const out: string[] = [];
  for (const part of p.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

const dirOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '');
const dirSlash = (d: string) => {
  const p = texPath(d);
  return p === null ? null : p ? `${p}/` : '';
};

/** The names TeX tries for a name a command gives, in its order. */
function tries(kind: TexRefKind, name: string, prefix?: string): string[] {
  const ext = extOf(name);
  switch (kind) {
    case 'input':
      // LaTeX's \input tries name.tex first, then the name as it is.
      return ext === 'tex' ? [name] : [`${name}.tex`, name];
    case 'include':
      return ext === 'tex' ? [name] : [`${name}.tex`];
    case 'bib':
      return ext === 'bib' ? [name] : [`${name}.bib`];
    case 'bibres':
      return [name, `${name}.bib`];
    case 'bst':
      return [`${name}.bst`];
    case 'package':
      return [`${name}.sty`];
    case 'class':
      return [`${name}.cls`];
    case 'theme':
      return [`${prefix ?? ''}${name}.sty`];
    case 'graphic':
      return GRAPHIC_KNOWN.has(ext) ? [name] : [...GRAPHIC_EXT.map((e) => `${name}.${e}`), name];
    case 'svg':
      return ext === 'svg' ? [name] : [`${name}.svg`, name];
    case 'pdf':
      return ext === 'pdf' ? [name] : [name, `${name}.pdf`];
    default:
      return [name];
  }
}

/** References whose files TeX finds among the document's own files, not TeX's (a package, a class, a theme, a style of bibliography). */
const OWN_ONLY: TexRefKind[] = ['package', 'class', 'theme', 'bst'];

/** A reference to a file, as a source writes it and as it is found. */
export interface TexRef {
  /** The file it is written in ("main.tex" for the main file). */
  file: string;
  /** Its line there, from 1. */
  line: number;
  /** Where the name is in that file's text: [from, to). */
  from: number;
  to: number;
  /** The name as written. */
  name: string;
  /** The command: "input", "includegraphics", "bibliography"… */
  cmd: string;
  kind: TexRefKind;
  /** The project's file it reads, when the project has it. */
  target?: string;
  /** The folder it was found from ('' the project's own; a \graphicspath or \import folder). */
  base?: string;
  /** The folders TeX looks for it in, in its order. */
  bases: string[];
  /** \import's folder, which the name is in (and which a move keeps). */
  dir?: string;
  /** Its name has a macro TeX makes at its run (\includegraphics{fig\i}): no one file. */
  dynamic?: boolean;
}

/** Where a file is first read from. */
export interface TexUse {
  file: string;
  line: number;
  cmd: string;
}

export interface TexUses {
  /** The project's files the document uses, in the order TeX first reads them, the main file first (with null). */
  used: Map<string, TexUse | null>;
  /** Every reference read (in the order TeX reads them), with the file it names when the project has it. */
  refs: TexRef[];
  /** References to files the project lacks: chapters, bibliographies, pictures, data (not packages or classes: TeX has those). */
  missing: TexRef[];
}

export interface TexSources {
  /** The main file's text. */
  main: string;
  /** A file's text, to read on (sources, styles and classes of the project); null when it has none here (a picture). */
  read: (name: string) => string | null;
  /** Whether the project has a file of this name. */
  has: (name: string) => boolean;
  /** The main file's own name in the project, when it has one besides main.tex (a file of this computer: "paper.tex"). */
  alias?: string;
  /** Every file of the project: what a name TeX makes at its run (\includegraphics{fig\i}) may be. Without it, nothing is guessed. */
  names?: () => Iterable<string>;
  /** Sources read before (by name and text), not read again: an editor keeps it while the text is the same. */
  cache?: Map<string, { text: string; scan: Scan }>;
  /** The references of the project's sources the document does not use too (in `refs`, after the others; they make nothing used). */
  everywhere?: boolean;
}

/** Sources TeX reads on: what it \input-s, and the styles and classes of the project. */
const READS_ON = new Set(['input', 'include', 'package', 'class', 'theme']);

/**
 * What a document uses: from its main file, each file it reads in the order TeX reads them (a chapter's own references
 * where the chapter is read), each found as TeX finds it. A file read twice, or reading itself, is read once. A name
 * with a macro that is defined plainly (\newcommand{\figdir}{figures}) is read with it; one TeX makes at its run
 * (\foreach … \includegraphics{fig\i}) counts every file it may be as used.
 */
export function texUses(p: TexSources): TexUses {
  const used = new Map<string, TexUse | null>([[TEX_MAIN, null]]);
  const refs: TexRef[] = [];
  const missing: TexRef[] = [];
  const macros = new Map<string, string>();
  const gpath: string[] = [];
  const wild: { kind: TexRefKind; prefixes: string[] }[] = [];
  const seen = new Set<string>([TEX_MAIN, ...(p.alias ? [p.alias] : [])]);
  const has = (n: string) => n === TEX_MAIN || n === p.alias || p.has(n);
  const scanOf = (name: string, text: string): Scan => {
    const hit = p.cache?.get(name);
    if (hit && hit.text === text) return hit.scan;
    const scan = scanSource(text);
    p.cache?.set(name, { text, scan });
    return scan;
  };
  // Names written with a macro: a simple one is put in; \subfix{…}, \detokenize{…} are taken off.
  const expand = (n: string) => {
    let x = n.replace(/^\\(?:subfix|detokenize|string)\s*\{([^{}]*)\}$/, '$1').replace(/^"(.*)"$/, '$1');
    for (let k = 0; k < 4 && /\\[A-Za-z@]/.test(x); k++) x = x.replace(/\\([A-Za-z@]+)\s*/g, (all, m: string) => macros.get(m) ?? all);
    return x.replace(/^"(.*)"$/, '$1').trim();
  };
  const find = (kind: TexRefKind, name: string, bases: string[], prefix?: string): { target: string; base: string } | null => {
    for (const base of bases)
      for (const cand of tries(kind, name, prefix)) {
        const t = texPath(base + cand);
        if (t !== null && has(t)) return { target: t === p.alias ? TEX_MAIN : t, base };
      }
    return null;
  };
  const walk = (file: string, text: string, importBase: string, depth: number, follow = true) => {
    const scan = scanOf(file, text);
    for (const [k, v] of scan.macros) if (!macros.has(k)) macros.set(k, v);
    let gi = 0;
    const here = dirOf(file === TEX_MAIN ? '' : file);
    for (const raw of scan.refs) {
      // \graphicspath set before this reference counts for it.
      while (gi < scan.graphicspath.length && scan.graphicspath[gi].at < raw.from) {
        for (const d of scan.graphicspath[gi].dirs) {
          const ds = dirSlash(importBase + expand(d));
          if (ds !== null && !gpath.includes(ds)) gpath.push(ds);
        }
        gi++;
      }
      const line = lineOf(scan.lines, raw.from);
      const name = expand(raw.name);
      // Inline data (\addplot table {x y \\ 1 2 \\}) or a list of words: no file.
      if (!name || name.includes('\\\\') || name.includes('\n') || name.startsWith('|') || /^[A-Za-z]:|^\//.test(name)) continue;
      const ref: TexRef = { file, line, from: raw.from, to: raw.to, name: raw.name, cmd: raw.cmd, kind: raw.kind, bases: [] };
      let bases: string[];
      let dirBase: string | null = null;
      if (raw.dir !== undefined) {
        const d = expand(raw.dir);
        dirBase = dirSlash(raw.dirFrom === 'sub' ? here + d : importBase + d);
        if (dirBase === null) continue;
        ref.dir = raw.dir;
        bases = [dirBase];
      } else if (raw.kind === 'graphic' || raw.kind === 'svg' || raw.kind === 'pdf') bases = ['', importBase, ...gpath, here];
      else if (OWN_ONLY.includes(raw.kind)) bases = [''];
      else bases = ['', importBase, here];
      bases = [...new Set(bases)];
      ref.bases = bases;
      if (/\\[A-Za-z@]|#/.test(name)) {
        // TeX makes this name at its run: every file it may be (by what comes before the macro) counts.
        ref.dynamic = true;
        refs.push(ref);
        if (!follow) continue;
        const lead = name.slice(0, name.search(/\\[A-Za-z@]|#/));
        wild.push({ kind: raw.kind, prefixes: bases.map((b) => texPath(b + lead) ?? '').map((x) => (lead.endsWith('/') || !lead ? (x ? `${x}/` : '') : x)) });
        continue;
      }
      const hit = find(raw.kind, name, bases, raw.prefix);
      if (hit) {
        ref.target = hit.target;
        ref.base = hit.base;
      }
      refs.push(ref);
      if (!follow) continue;
      if (!hit) {
        if (!OWN_ONLY.includes(raw.kind)) missing.push(ref);
        continue;
      }
      if (!used.has(hit.target)) used.set(hit.target, { file, line, cmd: raw.cmd });
      // A source read here is read now, before the rest of this one (as TeX does).
      if (READS_ON.has(raw.kind) && !seen.has(hit.target) && depth < 40) {
        seen.add(hit.target);
        const t = p.read(hit.target);
        if (t !== null) walk(hit.target, t, dirBase ?? (raw.kind === 'input' || raw.kind === 'include' ? importBase : ''), depth + 1);
      }
    }
  };
  walk(TEX_MAIN, p.main, '', 0);
  // A picture asked for before its \graphicspath was set (TeX would not find it): found with every folder, as meant.
  for (const r of missing.slice())
    if ((r.kind === 'graphic' || r.kind === 'svg' || r.kind === 'pdf') && gpath.length) {
      const hit = find(r.kind, expand(r.name), gpath);
      if (!hit) continue;
      r.target = hit.target;
      r.base = hit.base;
      missing.splice(missing.indexOf(r), 1);
      if (!used.has(hit.target)) used.set(hit.target, { file: r.file, line: r.line, cmd: r.cmd });
    }
  // Names made at the run: every file of the kind it reads, under what the name starts with.
  if (wild.length && p.names) {
    const all = [...p.names()];
    for (const w of wild)
      for (const n of all) {
        if (used.has(n) || !fits(w.kind, n) || !w.prefixes.some((x) => n.startsWith(x))) continue;
        const r = refs.find((x) => x.dynamic && x.kind === w.kind);
        used.set(n, r ? { file: r.file, line: r.line, cmd: r.cmd } : null);
        if (READS_ON.has(w.kind) && !seen.has(n)) {
          seen.add(n);
          const t = p.read(n);
          if (t !== null) walk(n, t, '', 1);
        }
      }
  }
  // The sources it does not use: their references, to move along with the files they name.
  if (p.everywhere && p.names)
    for (const n of [...p.names()].sort(natural)) {
      if (seen.has(n) || !['tex', 'style'].includes(texFileKind(n))) continue;
      const t = p.read(n);
      if (t !== null) walk(n, t, '', 1, false);
    }
  return { used, refs, missing };
}

/** Whether a file can be what a reference of this kind reads. */
function fits(kind: TexRefKind, name: string): boolean {
  const k = texFileKind(name);
  if (kind === 'input' || kind === 'include') return k === 'tex';
  if (kind === 'graphic' || kind === 'svg' || kind === 'pdf') return k === 'picture';
  if (kind === 'bib' || kind === 'bibres') return extOf(name) === 'bib';
  if (kind === 'data' || kind === 'listing') return k === 'data' || k === 'other';
  return false;
}

function lineOf(lines: number[], at: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** What a document of the Library uses, its pictures and files among `others` (files it has elsewhere: a project's folder). */
export function texDocUses(d: TexDoc, o: { others?: string[]; alias?: string; cache?: TexSources['cache']; everywhere?: boolean } = {}): TexUses {
  const texts = new Map(d.files.map((f) => [f.name, f.text]));
  const names = new Set<string>([...texts.keys(), ...d.pictures.map((x) => x.name), ...(o.others ?? [])]);
  return texUses({
    main: d.main,
    read: (n) => (n === TEX_MAIN ? d.main : (texts.get(n) ?? null)),
    has: (n) => names.has(n),
    names: () => names,
    alias: o.alias,
    cache: o.cache,
    everywhere: o.everywhere,
  });
}

/** Whether the document uses a file: read by it, or one TeX takes by itself. */
export const texIsUsed = (u: TexUses, name: string) => name === TEX_MAIN || u.used.has(name) || texUsedByItself(name);

// ---- the tree ------------------------------------------------------------------------------------------------------

export interface TexTreeFile {
  kind: 'file';
  /** Its path in the project. */
  name: string;
  /** Its name in its folder. */
  label: string;
  type: TexFileKind;
}

export interface TexTreeFolder {
  kind: 'folder';
  /** Its path in the project, with a slash at its end ("chapters/"). */
  name: string;
  label: string;
  items: TexTreeNode[];
}

export type TexTreeNode = TexTreeFile | TexTreeFolder;

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Files in their folders, in a sensible order: in each folder its folders first (by name), then its files by kind
 * (sources, the bibliography, styles and classes, pictures, data, the rest), sources in the order the document reads
 * them (`order`, its reading order; the others by name), the rest by name. `folders`: folders to show though nothing is
 * in them yet. The main file is not in it (it comes first, on its own).
 */
export function texTree(names: string[], o: { order?: string[]; folders?: string[] } = {}): TexTreeNode[] {
  const rank = new Map((o.order ?? []).map((n, i) => [n, i]));
  const root: TexTreeFolder = { kind: 'folder', name: '', label: '', items: [] };
  const folders = new Map<string, TexTreeFolder>([['', root]]);
  const folderOf = (path: string): TexTreeFolder => {
    const had = folders.get(path);
    if (had) return had;
    const parentPath = dirOf(path.slice(0, -1));
    const f: TexTreeFolder = { kind: 'folder', name: path, label: path.slice(parentPath.length, -1), items: [] };
    folderOf(parentPath).items.push(f);
    folders.set(path, f);
    return f;
  };
  for (const f of o.folders ?? []) {
    const d = dirSlash(f);
    if (d) folderOf(d);
  }
  for (const n of names) {
    const d = dirOf(n);
    folderOf(d).items.push({ kind: 'file', name: n, label: n.slice(d.length), type: texFileKind(n) });
  }
  const sort = (f: TexTreeFolder) => {
    f.items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      if (a.kind === 'folder') return natural(a.label, b.label);
      const fb = b as TexTreeFile;
      const ka = TEX_KIND_ORDER.indexOf(a.type);
      const kb = TEX_KIND_ORDER.indexOf(fb.type);
      if (ka !== kb) return ka - kb;
      if (a.type === 'tex') {
        const ra = rank.get(a.name) ?? Infinity;
        const rb = rank.get(fb.name) ?? Infinity;
        if (ra !== rb) return ra - rb;
      }
      return natural(a.label, fb.label);
    });
    for (const x of f.items) if (x.kind === 'folder') sort(x);
  };
  sort(root);
  return root.items;
}

// ---- moving files ------------------------------------------------------------------------------------------------

/**
 * The name a reference should give now to read `to` (where its file went) the way it read it: from the same folder
 * (\graphicspath's, \import's) when the file is still under it, else from the project's; without the extension when TeX
 * added it. `reads`: whether a name, read as TeX reads this reference now, finds `to`. Null when none does.
 */
function nameFor(r: TexRef, to: string, reads: (name: string) => boolean): string | null {
  const ext = extOf(to);
  const bare = !!r.target && !!extOf(r.target) && !r.name.endsWith(`.${extOf(r.target)}`);
  const strip = (n: string) => (bare && ext && n.endsWith(`.${ext}`) ? n.slice(0, -ext.length - 1) : n);
  const base = r.base ?? '';
  const names: string[] = [];
  if (base && to.startsWith(base)) names.push(strip(to.slice(base.length)), to.slice(base.length));
  // \import{dir}{file}: the file is named from its folder, or not at all.
  if (r.dir === undefined) names.push(strip(to), to);
  return names.find((n) => n && reads(n)) ?? null;
}

/**
 * Files and pictures renamed or moved (from → to), with every reference to them, in every source of the project, made
 * to name them where they are now the way it named them (from \graphicspath's folder, without the extension TeX adds);
 * one written with a macro or in quotes is left as it is. Their comments and tracked changes go with them, and those on
 * the words of a reference changed stay on them. Names that would clash are the caller's to check.
 */
export function texMoveFiles(d: TexDoc, moves: [string, string][]): TexDoc {
  const map = new Map(moves.filter(([a, b]) => a !== b && a !== TEX_MAIN));
  if (!map.size) return d;
  const before = texDocUses(d, { everywhere: true });
  const after = new Set<string>([TEX_MAIN, ...[...d.files.map((f) => f.name), ...d.pictures.map((p) => p.name)].map((n) => map.get(n) ?? n)]);
  const edits = new Map<string, { from: number; to: number; insert: string }[]>();
  const texts = new Map<string, string>([[TEX_MAIN, d.main], ...d.files.map((f) => [f.name, f.text] as [string, string])]);
  for (const r of before.refs) {
    if (!r.target || !map.has(r.target) || r.kind === 'theme' || /[\\"#]/.test(r.name)) continue;
    const to = map.get(r.target)!;
    // Read as TeX reads it once the files have moved: the first file found is the one moved.
    const reads = (name: string) => {
      for (const base of r.bases)
        for (const cand of tries(r.kind, name)) {
          const t = texPath(base + cand);
          if (t !== null && after.has(t)) return t === to;
        }
      return false;
    };
    const name = nameFor(r, to, reads);
    if (name === null || name === r.name) continue;
    const list = edits.get(r.file) ?? [];
    list.push({ from: r.from, to: r.to, insert: name });
    edits.set(r.file, list);
  }
  const maps = new Map<string, (pos: number, assoc: -1 | 1) => number>();
  for (const [file, list] of edits) {
    const e = editText(texts.get(file) ?? '', list);
    texts.set(file, e.text);
    maps.set(file, e.map);
  }
  const rename = (n: string) => map.get(n) ?? n;
  const at = (file: string, pos: number, assoc: -1 | 1) => maps.get(file)?.(pos, assoc) ?? pos;
  const next: TexDoc = {
    ...d,
    main: texts.get(TEX_MAIN)!,
    files: d.files.map((f) => ({ ...f, name: rename(f.name), text: texts.get(f.name) ?? f.text })),
    pictures: d.pictures.map((x) => ({ ...x, name: rename(x.name) })),
  };
  const comments: TexComment[] = (d.comments ?? []).map((c) => ({ ...c, from: at(c.file, c.from, 1), to: at(c.file, c.to, -1), file: rename(c.file) }));
  const changes: TexChange[] = (d.changes ?? []).map((c) => {
    const from = at(c.file, c.from, c.kind === 'ins' ? 1 : -1);
    return { ...c, from, to: c.kind === 'ins' ? Math.max(from, at(c.file, c.to, -1)) : from, file: rename(c.file) };
  });
  const cs = comments.length ? cleanTexComments(comments, next) : [];
  const ch = changes.length ? cleanTexChanges(changes, next) : [];
  if (cs.length) next.comments = cs;
  else delete next.comments;
  if (ch.length) next.changes = ch;
  else delete next.changes;
  return next;
}
