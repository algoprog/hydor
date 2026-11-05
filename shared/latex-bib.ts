// BibTeX for a LaTeX document's references: an entry read into its type, key and fields, written back one field a line
// in the usual order, a key made for it as people make them (the first author's family name, the year and the
// title's first word: "knuth1984texbook"), made unique among a bibliography's keys, and added to a .bib. What is shown
// of an entry (its title, authors, year and where it appeared) comes from its fields. Values from the web (Crossref,
// arXiv) are made safe for TeX first: no markup, no control characters, and the characters TeX reads as commands
// (& % # _) escaped where they are bare.

export interface BibEntry {
  type: string;
  key: string;
  fields: [name: string, value: string][];
}

export interface BibInfo {
  key: string;
  type: string;
  title: string;
  /** The authors, short: "D. E. Knuth", "A. Vaswani, N. Shazeer and 6 more". */
  authors: string;
  year: string;
  /** Where it appeared: a journal, a conference, a publisher, arXiv. */
  venue: string;
}

export const BIB_LIMITS = { entry: 20_000, value: 4000 };

/** A value's text from s[i] on: {braced}, "quoted" or bare (a number or a macro), and where it ends. */
function valueAt(s: string, i: number): { value: string; end: number } | null {
  let j = i;
  while (/\s/.test(s[j] ?? '')) j++;
  const c = s[j];
  if (c === '{') {
    let depth = 0;
    for (let k = j; k < s.length; k++) {
      if (s[k] === '\\') k++;
      else if (s[k] === '{') depth++;
      else if (s[k] === '}' && --depth === 0) return { value: s.slice(j + 1, k), end: k + 1 };
    }
    return null;
  }
  if (c === '"') {
    let depth = 0;
    for (let k = j + 1; k < s.length; k++) {
      if (s[k] === '\\') k++;
      else if (s[k] === '{') depth++;
      else if (s[k] === '}') depth--;
      else if (s[k] === '"' && depth === 0) return { value: s.slice(j + 1, k), end: k + 1 };
    }
    return null;
  }
  const m = /^[A-Za-z0-9_.:+-]+/.exec(s.slice(j));
  return m ? { value: m[0], end: j + m[0].length } : null;
}

/** The first entry of BibTeX text (@type{key, field = value, …}), or null. */
export function parseBibEntry(text: string): BibEntry | null {
  const s = text.slice(0, BIB_LIMITS.entry * 2);
  const head = /@\s*([A-Za-z]+)\s*[{(]\s*([^,\s{}()]*)\s*,/.exec(s);
  if (!head || /^(comment|string|preamble)$/i.test(head[1])) return null;
  const fields: [string, string][] = [];
  let i = head.index + head[0].length;
  for (;;) {
    const m = /^\s*([A-Za-z][A-Za-z0-9_:.+-]*)\s*=\s*/.exec(s.slice(i));
    if (!m) break;
    i += m[0].length;
    let v = valueAt(s, i);
    if (!v) break;
    let value = v.value;
    i = v.end;
    // Parts joined with #: kept as one value.
    for (let k = /^\s*#\s*/.exec(s.slice(i)); k; k = /^\s*#\s*/.exec(s.slice(i))) {
      v = valueAt(s, i + k[0].length);
      if (!v) break;
      value += v.value;
      i = v.end;
    }
    fields.push([m[1].toLowerCase(), value.replace(/\s+/g, ' ').trim()]);
    const comma = /^\s*,/.exec(s.slice(i));
    if (!comma) break;
    i += comma[0].length;
  }
  return { type: head[1].toLowerCase(), key: head[2], fields };
}

/** The keys of a .bib's entries, in their order. */
export const bibKeys = (text: string) => [...text.matchAll(/@\s*([A-Za-z]+)\s*[{(]\s*([^,\s]+)\s*,/g)].filter((m) => !/^(comment|string|preamble)$/i.test(m[1])).map((m) => m[2]);

const ORDER = [
  'author',
  'editor',
  'title',
  'booktitle',
  'journal',
  'series',
  'year',
  'month',
  'volume',
  'number',
  'pages',
  'edition',
  'chapter',
  'school',
  'institution',
  'organization',
  'publisher',
  'address',
  'howpublished',
  'eprint',
  'archiveprefix',
  'primaryclass',
  'doi',
  'isbn',
  'issn',
  'url',
  'note',
];
const CASED: Record<string, string> = { archiveprefix: 'archivePrefix', primaryclass: 'primaryClass' };

/** An entry as BibTeX, one field a line, in the usual order (fields it has besides those, after them). */
export function bibText(e: BibEntry): string {
  const rank = (n: string) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length);
  const fields = e.fields.filter(([, v]) => v.trim()).sort((a, b) => rank(a[0]) - rank(b[0]));
  const width = Math.max(0, ...fields.map(([n]) => (CASED[n] ?? n).length));
  // Numbers and the months' names (BibTeX's macros: feb) go bare, so a style writes the month its way.
  const bare = (n: string, v: string) => /^\d+$/.test(v) || (n === 'month' && /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(v));
  const body = fields.map(([n, v]) => `  ${(CASED[n] ?? n).padEnd(width)} = ${bare(n, v) ? v.toLowerCase() : `{${v}}`}`);
  return `@${e.type}{${e.key},\n${body.join(',\n')}\n}\n`;
}

const field = (e: BibEntry, name: string) => e.fields.find(([n]) => n === name)?.[1] ?? '';

/** Letters only, in small Latin ones where they have a Latin form: "Gödel" → "godel", "{\"o}" too. */
function keyWord(s: string): string {
  return s
    .replace(/\\[A-Za-z]+\s*/g, '')
    .replace(/\\./g, '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
}

const SMALL = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'from', 'by', 'at', 'is', 'are', 'towards', 'toward', 'via', 'into']);

/** The family names of an entry's authors (BibTeX's "Family, Given and …" or "Given Family and …"). */
export function familyNames(authors: string): string[] {
  return authors
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      if (a.includes(',')) return a.split(',')[0].trim();
      const words = a.replace(/[{}]/g, '').split(/\s+/);
      return words[words.length - 1];
    });
}

/** A key for an entry, as people make them: family name, year, first word of the title ("vaswani2017attention"). */
export function bibKeyFor(e: BibEntry): string {
  const who = keyWord(familyNames(field(e, 'author') || field(e, 'editor'))[0] ?? '') || 'ref';
  const year = /\d{4}/.exec(field(e, 'year'))?.[0] ?? '';
  const word = field(e, 'title')
    .replace(/[{}]/g, '')
    .split(/[\s:—–-]+/)
    .map(keyWord)
    .find((w) => w && !SMALL.has(w));
  return `${who}${year}${(word ?? '').slice(0, 16)}`.slice(0, 40) || 'ref';
}

/** `base`, or base2, base3… when the bibliography has it already (keys are told apart without regard to case). */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const t = new Set([...taken].map((k) => k.toLowerCase()));
  if (!t.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!t.has(`${base}${i}`.toLowerCase())) return `${base}${i}`;
}

/** Text as an entry's value may hold it: no markup or entities from the web, no control characters, one line. */
export function cleanBibValue(s: string, plain = true): string {
  let t = s
    .replace(/<\/?(i|em|b|strong|sub|sup|scp|span|mml:[a-z]+|jats:[a-z]+|p|br)[^>]*>/gi, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, (m, n: string) =>
      n === 'amp'
        ? '&'
        : n === 'lt'
          ? '<'
          : n === 'gt'
            ? '>'
            : n === 'quot'
              ? '"'
              : n === 'apos'
                ? "'"
                : n === 'nbsp'
                  ? ' '
                  : n.startsWith('#x')
                    ? String.fromCodePoint(parseInt(n.slice(2), 16))
                    : n.startsWith('#')
                      ? String.fromCodePoint(Number(n.slice(1)))
                      : m,
    )
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // TeX's own characters, where nothing escapes them yet (an address keeps them as they are).
  if (plain) t = t.replace(/(?<!\\)([&%#_])/g, '\\$1');
  // Braces that do not pair would break the entry: they go.
  let depth = 0;
  let broken = false;
  for (const c of t) {
    depth += c === '{' ? 1 : c === '}' ? -1 : 0;
    if (depth < 0) broken = true;
  }
  if (broken || depth !== 0) t = t.replace(/[{}]/g, '');
  return t.slice(0, BIB_LIMITS.value);
}

/** An entry with every value made safe (see cleanBibValue), its type and key plain, and empty fields left out. */
export function cleanBibEntry(e: BibEntry): BibEntry {
  const raw = (n: string) => n === 'url' || n === 'doi' || n === 'eprint';
  return {
    type: e.type.replace(/[^a-z]/g, '') || 'misc',
    key: e.key.replace(/[^A-Za-z0-9_:.+-]/g, '') || 'ref',
    fields: e.fields
      .filter(([n]) => /^[a-z][a-z0-9_:.+-]*$/i.test(n))
      .map(([n, v]) => [n.toLowerCase(), cleanBibValue(v, !raw(n.toLowerCase()))] as [string, string])
      // Page ranges as BibTeX writes them: 97--111.
      .map(([n, v]) => [n, n === 'pages' ? v.replace(/\s*(--|[–—-])\s*/g, '--') : v] as [string, string])
      .filter(([, v]) => v),
  };
}

/** What a reference list shows of an entry. */
export function bibInfo(e: BibEntry): BibInfo {
  const plain = (s: string) =>
    s
      .replace(/\\([&%#_$])/g, '$1')
      .replace(/\\[A-Za-z]+\s*/g, '')
      .replace(/[{}]/g, '')
      .trim();
  const names = (field(e, 'author') || field(e, 'editor'))
    .split(/\s+and\s+/i)
    .map((a) => plain(a))
    .filter(Boolean)
    .map((a) => {
      if (!a.includes(',')) return a;
      const [family, given] = a.split(',').map((x) => x.trim());
      return given ? `${given} ${family}` : family;
    });
  const authors = names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
  const eprint = field(e, 'eprint');
  const venue = plain(
    field(e, 'journal') || field(e, 'booktitle') || field(e, 'howpublished') || (eprint && /arxiv/i.test(field(e, 'archiveprefix')) ? `arXiv:${eprint}` : '') || field(e, 'publisher') || field(e, 'school') || field(e, 'institution'),
  );
  return { key: e.key, type: e.type, title: plain(field(e, 'title')), authors, year: /\d{4}/.exec(field(e, 'year'))?.[0] ?? '', venue };
}

/** A .bib with an entry added at its end (a blank line before it), under a key no other entry has: the text, and that key. */
export function addBibEntry(bib: string, entry: string): { text: string; key: string } {
  const e = parseBibEntry(entry);
  if (!e) return { text: bib, key: '' };
  const key = uniqueKey(e.key || bibKeyFor(e), bibKeys(bib));
  const body = bibText({ ...e, key });
  const sep = !bib.trim() ? '' : bib.endsWith('\n\n') ? '' : bib.endsWith('\n') ? '\n' : '\n\n';
  return { text: `${bib.trim() ? bib : ''}${sep}${body}`, key };
}
