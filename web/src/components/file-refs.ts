// Which words of an agent's reply name a file: `report.tex`, `docs/report.pdf:12`, /home/me/notes.md, ~/notes.md (components/Markdown.tsx
// makes them links that open the file). Pure functions, tested by file-refs-test.ts.

/** What a file name ends with: a dot and a letter, then up to nine letters or digits (`.tex`, `.mp4`, `.d.ts`, not `.3` or `.2.1`). */
const EXT = /\.[A-Za-z][A-Za-z0-9]{0,9}$/;
/** The characters a path of a file is written with. */
const PATH_CHARS = /^[\p{L}\p{N}_.@+~%\-/\\]+$/u;
/** `:12`, `:12:5`, `:12-20` or `#L12` (`#L12-L20`) after a path. */
const LINE_SUFFIX = /(?::(\d{1,7})(?::\d{1,5})?(?:-\d{1,7})?|#L(\d{1,7})(?:-L?\d{1,7})?)$/;
const WIN_DRIVE = /^[A-Za-z]:[\\/]/;

export interface FileRef {
  path: string;
  line?: number;
}

export interface FileRefOpts {
  /** The session's folder: a relative path with a `/` is from there. */
  cwd?: string;
  /** The user's home folder, for `~/…`. */
  home?: string;
  /** Files of the conversation (absolute), the latest last: a name or the end of a path is the last one that ends with it. */
  known?: string[];
}

const isWin = (p: string) => WIN_DRIVE.test(p) || p.startsWith('\\\\');

/** A folder and a path from it as one, with `.` and `..` worked out (either kind of separator; a drive or the root stays). */
export function resolveFrom(dir: string, rel: string): string {
  const win = isWin(dir);
  const parts = `${dir}/${rel}`.split(win ? /[\\/]/ : '/');
  const head = win ? [parts.shift()!] : [''];
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return win ? [...head, ...out].join('\\') : `/${out.join('/')}`;
}

/** Splits `path:12`, `path:12:5`, `path:12-20` and `path#L12` into the path and its line. */
function splitLine(text: string): FileRef {
  const m = LINE_SUFFIX.exec(text);
  if (!m) return { path: text };
  return { path: text.slice(0, m.index), line: Number(m[1] ?? m[2]) || undefined };
}

/** Whether a path (without its line) reads as a file's: its characters, and a last name that ends with an extension. */
function fileLike(p: string): boolean {
  if (!p || !PATH_CHARS.test(p.replace(WIN_DRIVE, '/'))) return false;
  const name = p.split(/[\\/]/).pop()!;
  return EXT.test(name) && name !== '.' && name !== '..';
}

/** The folders' names a Go or JavaScript import or a web address starts with: `github.com/x/y.go`, `example.com/page.html`. */
const DOMAIN_FIRST = /^[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}$/;

/** Where a path that is not absolute is: the last known file it is the end of, else (with a `/`) from the folder, else null. */
function resolveRelative(rel: string, o: FileRefOpts): string | null {
  const t = rel.replace(/^(?:\.[\\/])+/, '');
  const segs = t.split(/[\\/]/);
  if (!t || segs.some((s) => !s)) return null;
  if (!segs.includes('..')) {
    const end = segs.join('/');
    const known = o.known ?? [];
    for (let i = known.length - 1; i >= 0; i--) {
      const k = known[i].replace(/\\/g, '/');
      if (k === end || k.endsWith(`/${end}`)) return known[i];
    }
  }
  if (segs.length < 2 && t === rel) return null;
  if (!o.cwd) return null;
  // `x.com/page.html` is more likely an address than a folder of that name.
  if (t === rel && segs.length > 1 && DOMAIN_FIRST.test(segs[0])) return null;
  return resolveFrom(o.cwd, t);
}

/** Where a path (without its line) is, or null: absolute as it is, `~/…` from home, else as resolveRelative. */
export function resolveFile(p: string, o: FileRefOpts): string | null {
  if (p.startsWith('~/')) return o.home ? resolveFrom(o.home, p.slice(2)) : null;
  if (p.startsWith('/') || isWin(p)) return p.startsWith('//') ? null : p;
  return resolveRelative(p, o);
}

/** Inline code (`report.pdf`, `src/app.ts:42`) as the file it names, or null when it is not one, or is one nobody can find. */
export function fileRef(text: string, o: FileRefOpts = {}): FileRef | null {
  if (!text || text.length > 400 || /[\s`]/.test(text)) return null;
  if (/^[A-Za-z][A-Za-z0-9+-]+:/.test(text) || text.startsWith('//')) return null;
  const { path: p, line } = splitLine(text);
  if (!fileLike(p)) return null;
  const path = resolveFile(p, o);
  return path ? (line ? { path, line } : { path }) : null;
}

export interface PathSpan {
  start: number;
  end: number;
  path: string;
  line?: number;
}

/** Characters a path in a sentence may be followed by without them being part of it. */
const TRAIL = /[.,;:!?)\]}>"'”’»]+$/;
const OPENERS = /[\s([{<"'“‘«]/;

/** The absolute paths and `~/…` paths of files in plain text (never one inside a web address: it starts the text or follows a space or an opening bracket or quote). */
export function filePathsIn(text: string): PathSpan[] {
  const out: PathSpan[] = [];
  const start = /(?:~\/|\/|[A-Za-z]:[\\/])/g;
  let from = 0;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    const at = m.index;
    if (at < from || (at > 0 && !OPENERS.test(text[at - 1]))) continue;
    // `//host/x.pdf` is no file of this computer.
    if (text.startsWith('//', at)) continue;
    let end = at;
    while (end < text.length && !/\s/.test(text[end])) end++;
    let tok = text.slice(at, end);
    // Trailing punctuation stays outside, but a line suffix (`:12`) is part of it.
    for (;;) {
      const cut = tok.replace(TRAIL, '');
      if (cut === tok) break;
      tok = cut;
    }
    const { path, line } = splitLine(tok);
    if (!fileLike(path)) continue;
    out.push({ start: at, end: at + tok.length, path, line });
    from = at + tok.length;
    start.lastIndex = from;
  }
  return out;
}
