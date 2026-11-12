// Find and replace across a LaTeX project's files: every place the words are in any of its files (a hit: the file, the
// line, the line's text with the match marked), and Replace all as one change over every file. The words are plain
// text, or a regular expression (with $1… in what replaces it); case may matter or not. Only text files are searched
// (TeX's own, bibliographies, data), and a file's hits stop at a limit so a one-letter search stays quick.

/** A file of the project, by its name and text. */
export interface SearchFile {
  name: string;
  text: string;
}

export interface SearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  /** Only whole words match (plain text and regular expressions alike). */
  wholeWord?: boolean;
}

/** One match: where it is (offsets in its file's text) and the line it is on. */
export interface SearchHit {
  file: string;
  /** 1-based. */
  line: number;
  /** The match's start and end in the file's text. */
  from: number;
  to: number;
  /** The line's text (cut round the match when it is long) and where the match is in that. */
  text: string;
  at: number;
  len: number;
  /** What the match says. */
  match: string;
}

export const SEARCH_LIMITS = { hits: 1000, perFile: 300, line: 200 };

/** The pattern for a search, or an error's words when a regular expression is not one. */
export function searchPattern(q: string, o: SearchOptions): RegExp | { error: string } {
  if (!q) return { error: '' };
  const src = o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp(o.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])` : src, `gmu${o.caseSensitive ? '' : 'i'}`);
    // A pattern that matches empty text (a lone *, an empty group) would never move on.
    if (re.test('')) return { error: 'It matches empty text' };
    re.lastIndex = 0;
    return re;
  } catch (e) {
    return { error: (e as Error).message.replace(/^Invalid regular expression: /, '') };
  }
}

/** Every match in `files` (in their order), up to the limits; `capped` says there were more. */
export function searchFiles(files: SearchFile[], q: string, o: SearchOptions = {}): { hits: SearchHit[]; capped: boolean; error?: string } {
  const re = searchPattern(q, o);
  if ('error' in re) return { hits: [], capped: false, error: re.error || undefined };
  const hits: SearchHit[] = [];
  let capped = false;
  for (const f of files) {
    if (hits.length >= SEARCH_LIMITS.hits) {
      capped = true;
      break;
    }
    let n = 0;
    let line = 1;
    let lineAt = 0;
    re.lastIndex = 0;
    for (let m = re.exec(f.text); m; m = re.exec(f.text)) {
      if (m[0] === '') {
        re.lastIndex++;
        continue;
      }
      if (n >= SEARCH_LIMITS.perFile || hits.length >= SEARCH_LIMITS.hits) {
        capped = true;
        break;
      }
      for (let i = f.text.indexOf('\n', lineAt); i >= 0 && i < m.index; i = f.text.indexOf('\n', lineAt)) {
        line++;
        lineAt = i + 1;
      }
      let end = f.text.indexOf('\n', m.index);
      if (end < 0) end = f.text.length;
      let a = lineAt;
      let b = end;
      // A long line: a stretch of it round the match.
      if (b - a > SEARCH_LIMITS.line) {
        a = Math.max(lineAt, m.index - 60);
        b = Math.min(end, a + SEARCH_LIMITS.line);
      }
      const lead = f.text.slice(a, m.index);
      const text = f.text.slice(a, b).replace(/\r$/, '');
      hits.push({ file: f.name, line, from: m.index, to: m.index + m[0].length, text, at: lead.length, len: Math.min(m[0].length, text.length - lead.length), match: m[0] });
      n++;
    }
  }
  return { hits, capped };
}

/** A file's replacements: the new text, and each change in the old text's places (to apply to an editor holding it, as one step). */
export interface FileEdit {
  name: string;
  text: string;
  changes: { from: number; to: number; insert: string }[];
}

/** What a match is replaced by: `by` as it is, or (with a regular expression) with $1… $& $<name> and $$ filled in. */
function expand(by: string, m: RegExpMatchArray, regex: boolean): string {
  if (!regex) return by;
  return by.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (_x, k: string, name?: string) => (k === '$' ? '$' : k === '&' ? m[0] : name ? (m.groups?.[name] ?? '') : (m[Number(k)] ?? '')));
}

/**
 * Every match replaced, in every file at once: the files that changed (with their new text and each change), and how many
 * places changed. `only`: just these files (the checked ones of the results). With a regular expression, $1… and $& in `by`
 * stand for what matched.
 */
export function replaceFiles(files: SearchFile[], q: string, by: string, o: SearchOptions = {}, only?: Set<string>): { files: FileEdit[]; count: number; error?: string } {
  const re = searchPattern(q, o);
  if ('error' in re) return { files: [], count: 0, error: re.error || undefined };
  const out: FileEdit[] = [];
  let count = 0;
  for (const f of files) {
    if (only && !only.has(f.name)) continue;
    const changes: FileEdit['changes'] = [];
    let text = '';
    let last = 0;
    for (const m of f.text.matchAll(re)) {
      if (m[0] === '') continue;
      const insert = expand(by, m, !!o.regex);
      changes.push({ from: m.index!, to: m.index! + m[0].length, insert });
      text += f.text.slice(last, m.index!) + insert;
      last = m.index! + m[0].length;
    }
    if (changes.length) {
      count += changes.length;
      out.push({ name: f.name, text: text + f.text.slice(last), changes });
    }
  }
  return { files: out, count };
}
