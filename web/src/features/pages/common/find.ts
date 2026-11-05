// Finding words in text, and what to put in their place, for every editor's Find and replace: the words as typed, or
// a regular expression; matching case or not; whole words only or anywhere. A whole word is one not run into letters,
// digits or _ on either side, in any language. Editors search the text of each block, cell or part with findIn and
// mark what it gives; replacing goes through replacementOf, so a regular expression's $1, $& and $<name> work.

export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export const FIND_DEFAULTS: FindOptions = { matchCase: false, wholeWord: false, regex: false };

/** A match: [s, e) in the text searched. */
export interface Match {
  s: number;
  e: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** What finds the query, everywhere (the g flag); null for an empty query or a regular expression that does not read. */
export function matcher(query: string, o: FindOptions): RegExp | null {
  if (!query) return null;
  let src = o.regex ? query : escape(query);
  if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  const flags = o.matchCase ? 'g' : 'gi';
  try {
    return new RegExp(src, flags + 'u');
  } catch {
    // A pattern written without Unicode mode in mind (\- or a lone {) may still read without it, unless it needs \p.
    if (o.wholeWord) return null;
    try {
      return new RegExp(src, flags);
    } catch {
      return null;
    }
  }
}

/** Every match of the query in the text, in order, up to `limit`. Empty matches (a regular expression such as a*) are left out. */
export function findIn(text: string, query: string, o: FindOptions, limit = 10000): Match[] {
  const re = matcher(query, o);
  if (!re || !text) return [];
  const out: Match[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m && out.length < limit; m = re.exec(text)) {
    if (m[0].length === 0) {
      re.lastIndex = m.index + 1;
      continue;
    }
    out.push({ s: m.index, e: m.index + m[0].length });
  }
  return out;
}

/** A replacement with a regular expression's $1…$99, $&, $<name> and $$ put in from the match. */
function expand(replacement: string, m: RegExpExecArray): string {
  return replacement.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (all, what: string, name?: string) => {
    if (what === '$') return '$';
    if (what === '&') return m[0];
    if (name !== undefined) return m.groups?.[name] ?? '';
    const n = Number(what);
    if (n > 0 && n < m.length) return m[n] ?? '';
    // "$12" with only one group: $1 then the digit 2, as String.replace reads it.
    if (what.length === 2 && Number(what[0]) > 0 && Number(what[0]) < m.length) return (m[Number(what[0])] ?? '') + what[1];
    return all;
  });
}

/** What goes in the place of a match: the replacement as typed, or with a regular expression's groups put in. */
export function replacementOf(text: string, m: Match, query: string, replacement: string, o: FindOptions): string {
  if (!o.regex) return replacement;
  const re = matcher(query, o);
  if (!re) return replacement;
  // The same pattern, held to start where the match does, so lookbehinds and whole-word edges see the text around it.
  const at = new RegExp(re.source, re.flags.replace('g', '') + 'y');
  at.lastIndex = m.s;
  const hit = at.exec(text);
  return hit && hit.index === m.s ? expand(replacement, hit) : replacement;
}

/** The text with every match replaced, and how many there were. */
export function replaceAllIn(text: string, query: string, replacement: string, o: FindOptions): { text: string; count: number } {
  const ms = findIn(text, query, o, Number.MAX_SAFE_INTEGER);
  if (!ms.length) return { text, count: 0 };
  let out = '';
  let at = 0;
  for (const m of ms) {
    out += text.slice(at, m.s) + replacementOf(text, m, query, replacement, o);
    at = m.e;
  }
  return { text: out + text.slice(at), count: ms.length };
}
