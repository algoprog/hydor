// LaTeX documents in Pages (a page of the kind "tex"), as the server, the editor and agents share them: a project as
// TeX reads it, made of its main file (main.tex), the other files it reads by name (a bibliography, a style or a
// class, chapters) and its pictures (kept apart by the app, by the hash of their bytes, as a deck's are:
// "naget-asset:<sha>"), and the engine that typesets it (pdfLaTeX, XeLaTeX or LuaLaTeX).
//
// normalizeTex takes what an agent or the editor sends, lenient about its shape (the main file as `source`, the other
// files as an object of name → text), and returns the model with every name and size checked: the files are written
// into a folder for TeX to read, so a name is a plain path inside it (no "..", no absolute path, no hidden file, a
// known extension). texText keeps a model as text that is the source itself, line by line, each other file after a
// marker line, so two versions diff as the source does; its tracked changes (Track changes: words put in and taken
// out, by whom and when) and its comments (on words of a file, with replies) come last, one to a line. The text is
// always as if every tracked change were accepted; rejecting one puts the text back (texChangeOps).

import { cleanComment, COMMENT_LIMITS, newCommentId, type Comment } from './comments.ts';

export type TexEngine = 'pdflatex' | 'xelatex' | 'lualatex';

export const TEX_ENGINES: { id: TexEngine; label: string; hint: string }[] = [
  { id: 'pdflatex', label: 'pdfLaTeX', hint: 'The usual one' },
  { id: 'xelatex', label: 'XeLaTeX', hint: 'Any language, any font' },
  { id: 'lualatex', label: 'LuaLaTeX', hint: 'As XeLaTeX, with Lua' },
];

export const engineLabel = (e: TexEngine) => TEX_ENGINES.find((x) => x.id === e)?.label ?? e;

export interface TexFile {
  /** Its path in the project, as \input or \bibliography name it: "refs.bib", "chapters/intro.tex". */
  name: string;
  text: string;
}

export interface TexPicture {
  /** Its path in the project, as \includegraphics names it: "figures/plot.png". */
  name: string;
  /** The picture the app keeps: "naget-asset:<sha>". */
  src: string;
}

export interface TexDoc {
  v: 1;
  engine: TexEngine;
  /** The text of main.tex, the file TeX typesets. */
  main: string;
  /** The other files, in their order. */
  files: TexFile[];
  pictures: TexPicture[];
  /** Comments on words of its files (none: left out). */
  comments?: TexComment[];
  /** Track changes is on: what is typed and deleted is marked, to accept or reject (off: left out). */
  track?: boolean;
  /** The tracked changes not accepted or rejected yet (none: left out). */
  changes?: TexChange[];
}

/**
 * A tracked change: words put in, which are in the text at [from, to) of their file (`text`: those words, to find them
 * again when the text changed elsewhere), or words taken out, which are no longer in the text (`text`: what they were,
 * at `from`, where `to` is too; `before`: the few characters before them, to find the place again). Who made it, when.
 */
export interface TexChange {
  id: string;
  kind: 'ins' | 'del';
  file: string;
  from: number;
  to: number;
  text: string;
  before?: string;
  by: 'user' | 'agent';
  at: number;
}

export const TEX_CHANGE_LIMITS = { changes: 2000, text: 200_000, before: 40 };

export const newChangeId = () => `t${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;

/** A comment on words of one of the document's files: where they are ([from, to) in its text), and what they were (quote). */
export interface TexComment extends Comment {
  file: string;
  from: number;
  to: number;
}

export const TEX_MAIN = 'main.tex';

/** An error or a warning of a typesetting, where it is when that is known. */
export interface TexIssue {
  /** The project's file it is in ("main.tex", "chapters/intro.tex", "refs.bib"). */
  file?: string;
  line?: number;
  message: string;
  /** What it most likely means, in plain words. */
  hint?: string;
}

/** A typesetting as the editor gets it (POST /api/pages/tex/compile). */
export interface TexCompiled {
  /** Its pages' pictures and its PDF are at /api/pages/tex/<key>/…. */
  key: string;
  /** Typeset with no errors. */
  ok: boolean;
  /** TeX made a PDF (with errors it may still have). */
  pdf: boolean;
  pages: number;
  /** Each page's size in points, when known. */
  sizes?: { w: number; h: number }[];
  errors: TexIssue[];
  warnings: TexIssue[];
  log: string;
  engine: TexEngine;
  /** No TeX here (or not this engine): what to install. */
  missing?: string;
  ms?: number;
  sandboxed?: boolean;
}

/** What this computer can do with LaTeX (GET /api/pages/tex/setup). */
export interface TexSetup {
  engines: Record<TexEngine, boolean>;
  latexmk: boolean;
  bibtex: boolean;
  /** Pages can be drawn as pictures (poppler). */
  pictures: boolean;
  /** SyncTeX: from a page to its source and back. */
  sync: boolean;
  /** TeX runs shut in by bubblewrap. */
  sandbox: boolean;
  /** No TeX at all: what to install. */
  missing?: string;
  /** Why an engine cannot be used here. */
  notes: Partial<Record<TexEngine, string>>;
  /**
   * The classes and packages this TeX has, of those the editor asks about (TEX_ASKED: the templates' and the common
   * packages \usepackage offers), by their file names ("moderncv.cls", "siunitx.sty"). Missing on older servers.
   */
  installed?: string[];
  /**
   * For what the templates need and this TeX lacks: the command that adds it on the computer the app runs on ("sudo
   * apt install texlive-publishers"); or `auto`, for MiKTeX, which installs what a document asks for the first time it
   * is typeset, so every template is offered. Missing when nothing is (and on older servers).
   */
  add?: { cmd?: string; auto?: boolean };
}

export const TEX_LIMITS = { main: 2 * 1024 * 1024, file: 2 * 1024 * 1024, total: 4 * 1024 * 1024, files: 50, pictures: 200, name: 120, depth: 6 };

/** What the other files may be: TeX's own, a bibliography and its styles, and the data a figure reads. */
export const TEX_FILE_EXT = ['tex', 'ltx', 'bib', 'bbl', 'bst', 'sty', 'cls', 'clo', 'cfg', 'def', 'fd', 'ist', 'bbx', 'cbx', 'lbx', 'txt', 'csv', 'tsv', 'dat', 'tikz', 'pgf', 'lua'];

/** Pictures every engine takes. */
export const TEX_PICTURE_EXT = ['png', 'jpg', 'jpeg'];

/** A picture kept by the app (server/pages/assets.ts), by its content's hash. */
const ASSET = 'naget-asset:';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Bytes of a string as UTF-8, counted without making them. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 : c >= 0xdc00 && c < 0xe000 ? 0 : 3;
  }
  return n;
}

const mb = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;

/** A file's extension, in small letters ('' when it has none). */
export const extOf = (name: string) => /\.([A-Za-z0-9]+)$/.exec(name)?.[1].toLowerCase() ?? '';

/**
 * A name in a project, checked: a relative path inside its folder ("chapters/intro.tex"), each part letters, digits,
 * spaces, "_", "+", "-" and dots inside, with an extension of its kind; null when it is not one. Backslashes count as
 * slashes and a leading "./" goes.
 */
export function cleanTexName(v: unknown, kind: 'file' | 'picture'): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!s || s.length > TEX_LIMITS.name || s.startsWith('/') || /^[A-Za-z]:/.test(s)) return null;
  const parts = s.split('/');
  if (parts.length > TEX_LIMITS.depth) return null;
  for (const p of parts) if (p.includes('..') || !/^[A-Za-z0-9_+-](?:[A-Za-z0-9 _.+-]*[A-Za-z0-9_+-])?$/.test(p)) return null;
  const ext = extOf(s);
  return (kind === 'file' ? TEX_FILE_EXT : TEX_PICTURE_EXT).includes(ext) ? s : null;
}

const NAME_RULE = 'letters, digits, spaces, - _ + and dots, with / between folders; no "..", no leading dot, no absolute path';

/** Text as a file keeps it: Unix line ends, no byte order mark, no control characters but tabs and form feeds. */
const cleanText = (v: unknown) =>
  (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/g, '');

/** A picture's source as a document keeps it: one the app keeps, or one to keep (a data: address of a PNG or JPEG). */
export function cleanTexSrc(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^naget-asset:[a-f0-9]{16,64}$/.test(s)) return s;
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  return null;
}

/** The engine a name means ("XeLaTeX", "xetex", "lua"…), or null. */
export function cleanEngine(v: unknown): TexEngine | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s_-]+/g, '') : '';
  if (['pdflatex', 'pdftex', 'latex', 'pdf', 'tex'].includes(s)) return 'pdflatex';
  if (['xelatex', 'xetex', 'xe'].includes(s)) return 'xelatex';
  if (['lualatex', 'luatex', 'lua'].includes(s)) return 'lualatex';
  return null;
}

/** The text of a line before its comment (a % that no backslash escapes). */
export function uncommented(line: string): string {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '%') continue;
    let k = 0;
    for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) k++;
    if (k % 2 === 0) return line.slice(0, i);
  }
  return line;
}

/** The engine a document was written for, by what its preamble loads: fontspec and the like want XeLaTeX, Lua code LuaLaTeX. */
export function guessEngine(main: string): TexEngine {
  const head = main.slice(0, 40_000).split('\n').map(uncommented).join('\n');
  if (/\\(directlua|luaexec|luadirect)\b|\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(luacode|luatexja|luaotfload|lua-ul|luamplib)\b|\\documentclass\s*(\[[^\]]*\])?\s*\{ltj/.test(head)) return 'lualatex';
  if (
    /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(fontspec|xeCJK|polyglossia|unicode-math|xltxtra|xunicode|xgreek|bidi)\b|\\set(main|sans|mono|CJKmain|CJKsans)font\b|\\documentclass\s*(\[[^\]]*\])?\s*\{ctex/.test(
      head,
    )
  )
    return 'xelatex';
  return 'pdflatex';
}

/** Checks how a value may be turned into a picture's source (a file of the agent's, an address on the web); null leaves it out. */
export interface TexNormalizeOpts {
  src?: (src: string) => string | null;
}

/** Entries of `{ name: text }` or of `[{ name, text }]` (text also as content or source): as pairs. */
function entries(v: unknown, textKeys: string[]): { name: unknown; value: unknown; o?: Obj }[] {
  if (isObj(v)) return Object.entries(v).map(([name, value]) => (isObj(value) ? { name: value.name ?? name, value: textKeys.map((k) => value[k]).find((x) => x !== undefined), o: value } : { name, value }));
  if (Array.isArray(v))
    return v.map((x) => (isObj(x) ? { name: x.name ?? x.file ?? x.path, value: textKeys.map((k) => x[k]).find((y) => y !== undefined), o: x } : typeof x === 'string' ? { name: x, value: x } : { name: null, value: null }));
  return [];
}

const baseName = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;

/**
 * The document as it is kept, from what an agent or the editor sent: the main file as `main` (or `source`), the other
 * files as `files` (a list of { name, text } or an object of name → text), the pictures as `pictures` (a list of
 * { name, src }, an object of name → src, or sources alone, named as they are), and `engine` (else the one its
 * preamble asks for). A string is the kept text, the model as JSON, or the main file itself. Throws, saying what to
 * change, when a name or a size is not one TeX may be given.
 */
export function normalizeTex(input: unknown, o: TexNormalizeOpts = {}): TexDoc {
  let v: unknown = input;
  if (typeof v === 'string') {
    if (isTexText(v)) v = parseTexText(v);
    else {
      let j: unknown = null;
      if (/^\s*\{/.test(v)) {
        try {
          j = JSON.parse(v);
        } catch {}
      }
      v = isObj(j) ? j : { main: v };
    }
  }
  if (!isObj(v)) throw new Error('A LaTeX document is an object: { source: the text of main.tex, files, pictures, engine }.');

  // The other files.
  const files: TexFile[] = [];
  const used = new Set<string>();
  let mainFromFiles: string | null = null;
  let total = 0;
  for (const e of entries(v.files, ['text', 'content', 'source', 'data'])) {
    const name = cleanTexName(e.name, 'file');
    if (!name) throw new Error(`The file name “${String(e.name ?? '').slice(0, 80)}” is not one a document may have: ${NAME_RULE}; and an extension of ${TEX_FILE_EXT.map((x) => `.${x}`).join(' ')}.`);
    const text = cleanText(e.value);
    if (name === TEX_MAIN) {
      mainFromFiles = text;
      continue;
    }
    const key = name.toLowerCase();
    if (used.has(key)) throw new Error(`Two files are named ${name}.`);
    used.add(key);
    const n = utf8Length(text);
    if (n > TEX_LIMITS.file) throw new Error(`${name} is ${mb(n)}; a file may be ${mb(TEX_LIMITS.file)} at most.`);
    total += n;
    files.push({ name, text });
  }
  if (files.length > TEX_LIMITS.files) throw new Error(`A document may have ${TEX_LIMITS.files} files besides main.tex; this one has ${files.length}.`);

  // The main file: given as itself, as main.tex among the files, or the one file that starts a document.
  let main: string | null = null;
  for (const k of ['main', 'source', 'tex', 'text', 'content']) {
    if (typeof v[k] === 'string') {
      main = cleanText(v[k]);
      break;
    }
  }
  if (main === null) main = mainFromFiles;
  if (main === null) {
    const starts = files.filter((f) => /\.(tex|ltx)$/i.test(f.name) && /\\documentclass/.test(f.text) && /\\begin\s*\{document\}/.test(f.text));
    if (starts.length === 1) {
      main = starts[0].text;
      files.splice(files.indexOf(starts[0]), 1);
      used.delete(starts[0].name.toLowerCase());
    }
  }
  if (main === null) throw new Error('A LaTeX document needs its main file: source, the whole text of main.tex (\\documentclass{…} … \\end{document}).');
  const mainBytes = utf8Length(main);
  if (mainBytes > TEX_LIMITS.main) throw new Error(`main.tex is ${mb(mainBytes)}; it may be ${mb(TEX_LIMITS.main)} at most (put chapters in files of their own).`);
  total += mainBytes;
  if (total > TEX_LIMITS.total) throw new Error(`The document's files come to ${mb(total)}; they may come to ${mb(TEX_LIMITS.total)} at most.`);

  // The pictures.
  const pictures: TexPicture[] = [];
  const check = o.src ?? cleanTexSrc;
  for (const e of entries(v.pictures, ['src', 'path', 'file', 'url', 'data'])) {
    const raw = typeof e.value === 'string' ? e.value : '';
    // A picture given as its source alone is named as that source is ("plots/fig1.png", or its file's name when that is absolute).
    let nameIn = e.name;
    if ((nameIn === raw || nameIn == null) && raw && !raw.startsWith(ASSET) && !raw.startsWith('data:')) nameIn = /^(\/|~|[A-Za-z]:|https?:)/.test(raw) ? baseName(raw.replace(/[?#].*$/, '')) : raw;
    const name = cleanTexName(nameIn, 'picture');
    if (!name) throw new Error(`The picture name “${String(nameIn ?? '').slice(0, 80)}” is not one a document may have: ${NAME_RULE}; and .png, .jpg or .jpeg.`);
    const key = name.toLowerCase();
    if (used.has(key)) throw new Error(`Two files or pictures are named ${name}.`);
    used.add(key);
    const src = check(raw);
    if (!src) throw new Error(`The picture ${name} has no source the document can keep: a picture the app keeps (naget-asset:…) or a PNG or JPEG as a data: address.`);
    pictures.push({ name, src });
  }
  if (pictures.length > TEX_LIMITS.pictures) throw new Error(`A document may have ${TEX_LIMITS.pictures} pictures; this one has ${pictures.length}.`);

  const engine = cleanEngine(v.engine) ?? guessEngine(main);
  const doc: TexDoc = { v: 1, engine, main, files, pictures };
  const comments = cleanTexComments(v.comments, doc);
  if (comments.length) doc.comments = comments;
  if (v.track === true) doc.track = true;
  const changes = cleanTexChanges(v.changes, doc);
  if (changes.length) doc.changes = changes;
  return doc;
}

/** The nearest place `s` is in `text` to `near`, or -1. */
function nearest(text: string, s: string, near: number): number {
  let best = -1;
  for (let at = text.indexOf(s); at >= 0 && at < text.length; at = text.indexOf(s, at + 1)) if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at;
  return best;
}

/**
 * Tracked changes checked as a document keeps them: each on a file it has, inside its text, words put in still there
 * (found again by their words when the text changed elsewhere, else gone: nothing is left to accept or reject), words
 * taken out at their place (found again by the characters before them). In the order they come in the files.
 */
export function cleanTexChanges(v: unknown, d: TexDoc): TexChange[] {
  if (!Array.isArray(v)) return [];
  const out: TexChange[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (out.length >= TEX_CHANGE_LIMITS.changes || !isObj(raw)) continue;
    const kind = raw.kind === 'ins' || raw.kind === 'del' ? raw.kind : null;
    const file = typeof raw.file === 'string' ? raw.file : TEX_MAIN;
    const text = texFileText(d, file);
    if (!kind || text === null) continue;
    const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) && !seen.has(raw.id) ? raw.id : newChangeId();
    seen.add(id);
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(text.length, Math.round(x))) : 0);
    const by = raw.by === 'agent' ? 'agent' : 'user';
    const at = typeof raw.at === 'number' && Number.isFinite(raw.at) && raw.at > 0 && raw.at < 1e14 ? Math.round(raw.at) : Date.now();
    const words = cleanText(raw.text).slice(0, TEX_CHANGE_LIMITS.text);
    let from = num(raw.from);
    if (kind === 'ins') {
      let to = Math.max(from, num(raw.to));
      if (words && text.slice(from, to) !== words) {
        const found = nearest(text, words, from);
        if (found < 0) continue;
        from = found;
        to = found + words.length;
      }
      if (to > from) out.push({ id, kind, file, from, to, text: text.slice(from, to), by, at });
    } else {
      if (!words) continue;
      const before = typeof raw.before === 'string' ? cleanText(raw.before).slice(-TEX_CHANGE_LIMITS.before) : '';
      // The characters before it, fewer and fewer of them, the nearest place they are (text changed just before it too).
      if (before && text.slice(Math.max(0, from - before.length), from) !== before)
        for (const n of [before.length, 20, 10]) {
          const s = before.slice(-n);
          if (s.length < Math.min(n, before.length)) continue;
          const found = nearest(text, s, from - s.length);
          if (found >= 0) {
            from = found + s.length;
            break;
          }
        }
      out.push({ id, kind, file, from, to: from, text: words, before: text.slice(Math.max(0, from - TEX_CHANGE_LIMITS.before), from) || undefined, by, at });
    }
  }
  const order = [TEX_MAIN, ...d.files.map((f) => f.name)];
  return out.sort((a, b) => order.indexOf(a.file) - order.indexOf(b.file) || a.from - b.from || (a.kind === b.kind ? 0 : a.kind === 'del' ? -1 : 1));
}

/** Edits of a text at once (each [from, to) of the text as it was, given `insert`), and where a place of it goes. */
export function editText(text: string, edits: { from: number; to: number; insert: string }[]): { text: string; map: (pos: number, assoc: -1 | 1) => number } {
  const es = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
  let out = '';
  let last = 0;
  for (const e of es) {
    out += text.slice(last, Math.max(last, e.from)) + e.insert;
    last = Math.max(last, e.to);
  }
  out += text.slice(last);
  const map = (pos: number, assoc: -1 | 1) => {
    let delta = 0;
    for (const e of es) {
      if (e.to < pos || (e.to === pos && (e.from < pos || assoc > 0))) delta += e.insert.length - (e.to - e.from);
      else if (e.from < pos && pos < e.to) return e.from + delta + (assoc > 0 ? e.insert.length : 0);
      else break;
    }
    return pos + delta;
  };
  return { text: out, map };
}

/**
 * Tracked changes accepted or rejected: [{id, accept: true}] or [{id, reject: true}], or "accept all" / "reject all"
 * (also as {all: "accept"}). Accepting one keeps the text as it is and forgets the change; rejecting words put in takes
 * them out, rejecting words taken out puts them back. The others stay on their words. What could not be done is said
 * in `notes`.
 */
export function texChangeOps(d: TexDoc, ops: unknown, notes: string[] = []): TexDoc {
  const list = d.changes ?? [];
  if (!list.length || ops == null) return d;
  const all = (x: unknown) => (typeof x === 'string' ? x.trim().toLowerCase() : isObj(x) && typeof x.all === 'string' ? x.all.trim().toLowerCase() : '');
  const accept = new Set<string>();
  const reject = new Set<string>();
  for (const op of Array.isArray(ops) ? ops : [ops]) {
    const a = all(op).replace(/\s*all$/, '');
    if (a === 'accept' || a === 'reject') for (const c of list) (a === 'accept' ? accept : reject).add(c.id);
    else if (isObj(op) && typeof op.id === 'string') {
      if (!list.some((c) => c.id === op.id)) notes.push(`There is no tracked change ${op.id}: get_page lists them.`);
      else if (op.reject === true) reject.add(op.id);
      else if (op.accept === true) accept.add(op.id);
    }
  }
  if (!accept.size && !reject.size) return d;
  const left = list.filter((c) => !accept.has(c.id) && !reject.has(c.id));
  const next: TexDoc = { ...d, files: d.files.slice() };
  const changes: TexChange[] = [];
  for (const name of [TEX_MAIN, ...d.files.map((f) => f.name)]) {
    const text = texFileText(d, name) ?? '';
    const edits = list.filter((c) => c.file === name && reject.has(c.id)).map((c) => (c.kind === 'ins' ? { from: c.from, to: c.to, insert: '' } : { from: c.from, to: c.from, insert: c.text }));
    const e = editText(text, edits);
    if (edits.length) {
      if (name === TEX_MAIN) next.main = e.text;
      else next.files = next.files.map((f) => (f.name === name ? { ...f, text: e.text } : f));
    }
    for (const c of left.filter((x) => x.file === name)) {
      const from = e.map(c.from, c.kind === 'ins' ? 1 : -1);
      changes.push(c.kind === 'ins' ? { ...c, from, to: Math.max(from, e.map(c.to, -1)) } : { ...c, from, to: from });
    }
  }
  const kept = cleanTexChanges(changes, next);
  if (kept.length) next.changes = kept;
  else delete next.changes;
  return next;
}

/**
 * Comments checked as a document keeps them: each on a file it has, its place inside that file's text, and that place
 * found again by the words it quotes when the text changed elsewhere (the nearest place they are, or where it was).
 */
export function cleanTexComments(v: unknown, d: TexDoc): TexComment[] {
  if (!Array.isArray(v)) return [];
  const out: TexComment[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (out.length >= COMMENT_LIMITS.comments || !isObj(raw)) continue;
    const c = cleanComment(raw);
    if (!c) continue;
    if (seen.has(c.id)) c.id = newCommentId();
    seen.add(c.id);
    // On a file the document no longer has, a comment goes with it.
    if (typeof raw.file === 'string' && raw.file !== TEX_MAIN && !d.files.some((f) => f.name === raw.file)) continue;
    const file = typeof raw.file === 'string' ? raw.file : TEX_MAIN;
    const text = texFileText(d, file) ?? '';
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(text.length, Math.round(x))) : 0);
    let from = num(raw.from);
    let to = Math.max(from, num(raw.to));
    if (c.quote && text.slice(from, to) !== c.quote) {
      // The words moved (an agent changed the text): their nearest place, if they are still there.
      let best = -1;
      for (let at = text.indexOf(c.quote); at >= 0 && at < text.length; at = text.indexOf(c.quote, at + 1)) if (best < 0 || Math.abs(at - from) < Math.abs(best - from)) best = at;
      if (best >= 0) {
        from = best;
        to = best + c.quote.length;
      }
    }
    out.push({ ...c, file, from, to });
  }
  return out;
}

/**
 * Comments merged three ways: `mine` (what the editor has, the user's changes in it) with what changed in `theirs`
 * (kept elsewhere: an agent's answers, resolutions and new comments) since `base` (what both started from). A comment
 * the user deleted stays deleted and one added elsewhere comes in; a reply added elsewhere joins the user's; a
 * resolution made elsewhere holds unless the user changed it too. The user's words and places win.
 */
export function mergeTexComments(base: TexComment[], mine: TexComment[], theirs: TexComment[]): TexComment[] {
  const was = new Map(base.map((c) => [c.id, c]));
  const kept = new Set(mine.map((c) => c.id));
  const out: TexComment[] = mine.map((c) => {
    const t = theirs.find((x) => x.id === c.id);
    if (!t) return c;
    const b = was.get(c.id);
    const had = new Set([...(b?.replies ?? []), ...(c.replies ?? [])].map((r) => r.id));
    const added = (t.replies ?? []).filter((r) => !had.has(r.id));
    const resolved = b && !!t.resolved !== !!b.resolved && !!c.resolved === !!b.resolved ? t.resolved : c.resolved;
    const m: TexComment = { ...c, replies: added.length ? [...(c.replies ?? []), ...added] : c.replies };
    if (resolved) m.resolved = true;
    else delete m.resolved;
    if (!m.replies) delete m.replies;
    return m;
  });
  for (const t of theirs) if (!kept.has(t.id) && !was.has(t.id)) out.push(t);
  return out;
}

// ---- the kept text ----------------------------------------------------------------------------------------------

const HEAD = '%% naget-latex ';
const MARK = '%%%% file: ';
/** After the files: the tracked changes, one JSON a line. */
const CHANGES = '%%%% naget-changes';
/** After them: the comments, one JSON a line. */
const COMMENTS = '%%%% naget-comments';
/** A line of a file that would read as a marker gets a "!" in front (and one that has some already, one more). */
const MARKISH = /^!*%%%% (file: |naget-comments$|naget-changes$)/;
const escLine = (l: string) => (MARKISH.test(l) ? `!${l}` : l);
const unescLine = (l: string) => (/^!+%%%% (file: |naget-comments$|naget-changes$)/.test(l) ? l.slice(1) : l);

/** Whether stored page text is a LaTeX document's. */
export const isTexText = (s: string) => s.startsWith(HEAD);

/**
 * The document as text to keep: a first line with its engine and pictures, then main.tex line by line, then each
 * other file after a line "%%%% file: <name>". parseTexText reads it back exactly.
 */
export function texText(d: TexDoc): string {
  const out = [HEAD + JSON.stringify({ v: 1, engine: d.engine, pictures: d.pictures, ...(d.track ? { track: true } : {}) })];
  for (const l of d.main.split('\n')) out.push(escLine(l));
  for (const f of d.files) {
    out.push(MARK + f.name);
    for (const l of f.text.split('\n')) out.push(escLine(l));
  }
  if (d.changes?.length) {
    out.push(CHANGES);
    for (const c of d.changes) out.push(JSON.stringify(c));
  }
  if (d.comments?.length) {
    out.push(COMMENTS);
    for (const c of d.comments) out.push(JSON.stringify(c));
  }
  return out.join('\n');
}

/** The document a kept text holds (not checked: normalizeTex checks it). */
export function parseTexText(s: string): TexDoc {
  const all = s.split('\n');
  if (!all[0].startsWith(HEAD)) throw new Error('This is not a LaTeX document’s text');
  const meta = JSON.parse(all[0].slice(HEAD.length)) as { engine?: unknown; pictures?: unknown; track?: unknown };
  let main = '';
  const files: TexFile[] = [];
  let name: string | null = null;
  let cur: string[] = [];
  const flush = () => {
    const text = cur.join('\n');
    if (name === null) main = text;
    else files.push({ name, text });
  };
  const comments: unknown[] = [];
  const changes: unknown[] = [];
  // Whether the last file is in already (the files end where the tracked changes start).
  let flushed = false;
  for (let i = 1; i < all.length; i++) {
    const l = all[i];
    if (l === CHANGES) {
      // The tracked changes, one to a line, to the comments (or the end).
      flush();
      flushed = true;
      for (i++; i < all.length && all[i] !== COMMENTS; i++) {
        try {
          changes.push(JSON.parse(all[i]));
        } catch {}
      }
      i--;
      continue;
    }
    if (l === COMMENTS) {
      // The comments, one to a line, to the end.
      for (const c of all.slice(i + 1)) {
        try {
          comments.push(JSON.parse(c));
        } catch {}
      }
      break;
    }
    if (l.startsWith(MARK)) {
      flush();
      name = l.slice(MARK.length);
      cur = [];
    } else cur.push(unescLine(l));
  }
  if (!flushed) flush();
  const pictures = Array.isArray(meta.pictures) ? (meta.pictures as TexPicture[]).filter((p) => isObj(p) && typeof p.name === 'string' && typeof p.src === 'string') : [];
  const d: TexDoc = { v: 1, engine: cleanEngine(meta.engine) ?? 'pdflatex', main, files, pictures };
  if (comments.length) d.comments = comments as TexComment[];
  if (meta.track === true) d.track = true;
  if (changes.length) d.changes = changes as TexChange[];
  return d;
}

/** The pictures a document shows, by their sources (for the app to keep them while a version shows them). */
export const texSources = (d: TexDoc) => d.pictures.map((p) => p.src);

/** The names of every file of the project, main.tex first, then the pictures'. */
export const texNames = (d: TexDoc) => [TEX_MAIN, ...d.files.map((f) => f.name), ...d.pictures.map((p) => p.name)];

/** A file's text by its name (main.tex included), or null. */
export const texFileText = (d: TexDoc, name: string) => (name === TEX_MAIN ? d.main : (d.files.find((f) => f.name === name)?.text ?? null));

// ---- a new document ---------------------------------------------------------------------------------------------

/** Text for TeX: its special characters as the commands that print them. */
export function texEscape(s: string): string {
  return s.replace(/[\\{}#$%&~_^]/g, (c) =>
    c === '\\' ? '\\textbackslash{}' : c === '~' ? '\\textasciitilde{}' : c === '^' ? '\\textasciicircum{}' : `\\${c}`,
  );
}

/** Fonts tried in turn, the first one this computer has: TeX code for a preamble. */
const firstFont = (names: string[]): string => names.reduceRight((rest, n) => `\\IfFontExistsTF{${n}}{\\setmainfont{${n}}}{${rest}}`, '');

/**
 * What a new document needs to write `text` (its title): pdfLaTeX when its default fonts have the letters, else
 * XeLaTeX and the preamble lines that load a font with them (Greek, Cyrillic, Chinese…).
 */
export function lettersFor(text: string): { engine: TexEngine; lines: string[]; cjk?: boolean } {
  const cjk = /[぀-ヿ㐀-鿿가-힯豈-﫿]/.test(text);
  // Beyond Latin-1 and Latin Extended-A (and typographic punctuation), pdfLaTeX's default fonts have no letters.
  const wide = cjk || /[^\u0000-ſ -⁯€]/.test(text);
  if (!wide) return { engine: 'pdflatex', lines: [] };
  const fonts = cjk
    ? [
        firstFont(['Noto Serif CJK SC', 'Noto Sans CJK SC', 'Source Han Serif SC', 'Songti SC', 'PingFang SC', 'SimSun', 'Microsoft YaHei', 'WenQuanYi Zen Hei']),
        '\\XeTeXlinebreaklocale "zh"',
        '\\XeTeXlinebreakskip = 0pt plus 1pt',
      ]
    : [firstFont(['Noto Serif', 'DejaVu Serif', 'FreeSerif', 'Times New Roman'])];
  return { engine: 'xelatex', lines: ['\\usepackage{fontspec}', '% A font with the letters of the title: the first of these this computer has.', ...fonts], cjk };
}

/**
 * A new document: a short article (a title, an author, an abstract, two sections, an equation and a list) that every
 * engine typesets. A title pdfLaTeX cannot write (Greek, Cyrillic, Chinese…) makes it a XeLaTeX document, with a font
 * for its letters.
 */
export function newTex(title: string): TexDoc {
  const t = title.trim().replace(/\s+/g, ' ') || 'Untitled';
  const letters = lettersFor(t);
  const wide = letters.engine === 'xelatex';
  const main = [
    '\\documentclass[11pt]{article}',
    '\\usepackage[a4paper,margin=2.5cm]{geometry}',
    '\\usepackage{amsmath}',
    ...letters.lines,
    '\\usepackage{graphicx}',
    '\\usepackage[hidelinks]{hyperref}',
    '',
    `\\title{${texEscape(t)}}`,
    '\\author{Your name}',
    '\\date{\\today}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    '\\begin{abstract}',
    'What this document is about, in two or three sentences.',
    '\\end{abstract}',
    '',
    '\\section{Introduction}',
    'Your introduction goes here.',
    '',
    '\\section{Results}',
    'An equation, numbered so that you can refer to it:',
    '\\begin{equation}',
    '  e^{i\\pi} + 1 = 0',
    '  \\label{eq:euler}',
    '\\end{equation}',
    'Equation~\\eqref{eq:euler} links five constants. And a list:',
    '\\begin{itemize}',
    '  \\item A first point',
    '  \\item A second point',
    '\\end{itemize}',
    '',
    '\\end{document}',
    '',
  ].join('\n');
  return { v: 1, engine: wide ? 'xelatex' : 'pdflatex', main, files: [], pictures: [] };
}

// ---- the outline ------------------------------------------------------------------------------------------------

export interface TexHeading {
  file: string;
  /** From 1. */
  line: number;
  /** 0 a part, 1 a chapter, 2 a section, 3 a subsection, 4 a subsubsection; a slide (beamer's frame) is 3. */
  level: number;
  kind: 'part' | 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'frame';
  title: string;
}

const LEVEL: Record<TexHeading['kind'], number> = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, frame: 3 };

/** What a title says, without its commands: "The \emph{best} way~\cite{x}" → "The best way". */
export function texPlain(s: string): string {
  let t = s.replace(/\\\\/g, ' ');
  t = t.replace(/\\(label|ref|eqref|autoref|cref|Cref|cite\w*|footnote|index|thanks|protect)\s*(\[[^\]]*\])?\s*(\{[^{}]*\})?/g, '');
  for (let i = 0; i < 4; i++) t = t.replace(/\\[A-Za-z@]+\*?\s*(\[[^\]]*\])?\s*\{([^{}]*)\}/g, '$2');
  t = t
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/\\[A-Za-z@]+\*?/g, '')
    .replace(/[{}]/g, '')
    .replace(/~/g, ' ')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``|''/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > 160 ? `${t.slice(0, 159)}…` : t;
}

/** The text in braces that starts at `s[i]` ("{" there), and where it ends; nested braces count, escaped ones not. */
function braced(s: string, i: number): { text: string; end: number } | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { text: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

/** After `i`: spaces and an optional argument in brackets skipped; where its braces start. */
function skipOpt(s: string, i: number): number {
  let j = i;
  while (s[j] === ' ' || s[j] === '\t') j++;
  if (s[j] === '[') {
    let depth = 0;
    for (; j < s.length; j++) {
      if (s[j] === '[') depth++;
      else if (s[j] === ']' && --depth === 0) {
        j++;
        break;
      }
    }
    while (s[j] === ' ' || s[j] === '\t') j++;
  }
  return j;
}

const COMMAND = /\\(?:(part|chapter|section|subsection|subsubsection)\*?|(input|include|subfile|subfileinclude)\b|(frametitle)\b|begin\s*\{frame\})/g;

/**
 * The document's headings in the order they show: main.tex's, and those of the files it reads (\input, \include)
 * where it reads them; then those of .tex files nothing reads. A beamer slide counts by its title.
 */
export function texOutline(d: TexDoc): TexHeading[] {
  const byName = new Map<string, TexFile>();
  for (const f of d.files) if (/\.(tex|ltx)$/i.test(f.name)) byName.set(f.name, f);
  const out: TexHeading[] = [];
  const seen = new Set<string>([TEX_MAIN]);
  const find = (arg: string): TexFile | null => {
    const n = arg.trim().replace(/^\.\//, '').replace(/^"(.*)"$/, '$1');
    return byName.get(n) ?? byName.get(`${n}.tex`) ?? null;
  };
  const walk = (file: string, text: string, depth: number) => {
    const lines = text.split('\n').map(uncommented);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('\\')) continue;
      COMMAND.lastIndex = 0;
      for (let m = COMMAND.exec(line); m; m = COMMAND.exec(line)) {
        // A title may go on over a line or two.
        const rest = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');
        const at = skipOpt(rest, m.index + m[0].length);
        const arg = braced(rest, at);
        if (m[2]) {
          const f = arg && depth < 8 ? find(arg.text) : null;
          if (f && !seen.has(f.name)) {
            seen.add(f.name);
            walk(f.name, f.text, depth + 1);
          }
          continue;
        }
        const kind = (m[1] ?? 'frame') as TexHeading['kind'];
        if (!arg) continue;
        const title = texPlain(arg.text);
        if (title || kind !== 'frame') out.push({ file, line: i + 1, level: LEVEL[kind], kind, title: title || '(no title)' });
      }
    }
  };
  walk(TEX_MAIN, d.main, 0);
  for (const f of byName.values()) if (!seen.has(f.name)) walk(f.name, f.text, 1);
  return out;
}

/** The heading a line comes under, in a file: the last one at or before it. */
export function headingAt(outline: TexHeading[], file: string, line: number): TexHeading | null {
  let best: TexHeading | null = null;
  for (const h of outline) if (h.file === file && h.line <= line && h.kind !== 'frame' && (!best || h.line >= best.line)) best = h;
  return best;
}
