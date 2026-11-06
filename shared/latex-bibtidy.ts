// Tidy a bibliography (the LaTeX editor's Tidy in a .bib's bar, Tools → Tidy the bibliography, and page_action
// tidy_bibliography), as bibtex-tidy does, saying what it changed: the entries sorted by key; those nothing cites taken
// out (none when the document cites everything with \nocite{*}, nor one a cited entry's crossref names); duplicates
// (the same DOI, or the same title and year) merged into one, the fields the one kept lacks taken from the others and
// their citations pointed at it; keys fixed (characters BibTeX trips on taken out, a key two entries share made
// unique, a \cite whose key differs from its entry's only in capitals made the entry's); and the fields an entry lacks
// filled from its DOI's record (asked of doi.org by the server: bibNeedsFill lists what to ask, the answers come back in
// `fill`). An entry nothing changed keeps its text as it was written, unless every entry is to be written the same way
// (one field a line, in the usual order). What is between entries (comments) goes with the entry after it; @string and
// @preamble stay first. renameCites changes the document's citations as the renames say.

import { bibKeyFor, bibText, cleanBibEntry, parseBibEntry, uniqueKey, type BibEntry } from './latex-bib.ts';

/** A part of a .bib: an entry (with the text before it), or @string, @preamble or @comment, or what trails the last. */
export interface BibBlock {
  kind: 'entry' | 'string' | 'preamble' | 'comment' | 'text';
  /** Its text as written, from its @ to its closing brace. */
  text: string;
  /** What came before it since the last block: blank lines and comments. */
  lead: string;
  entry?: BibEntry;
}

/** A .bib's blocks, in their order (see BibBlock). */
export function splitBib(text: string): BibBlock[] {
  const out: BibBlock[] = [];
  let i = 0;
  let lead = '';
  while (i < text.length) {
    const at = text.indexOf('@', i);
    if (at < 0) {
      lead += text.slice(i);
      break;
    }
    const head = /^@\s*([A-Za-z]+)\s*([{(])/.exec(text.slice(at, at + 60));
    if (!head) {
      lead += text.slice(i, at + 1);
      i = at + 1;
      continue;
    }
    lead += text.slice(i, at);
    const open = head[2];
    const close = open === '{' ? '}' : ')';
    let depth = 0;
    let end = -1;
    for (let k = at + head[0].length - 1; k < text.length; k++) {
      const c = text[k];
      if (c === '\\') {
        k++;
        continue;
      }
      if (c === '{' || (c === '(' && open === '(' && depth === 0)) depth++;
      else if (c === '}' || (c === ')' && open === '(' && depth === 1)) {
        depth--;
        if (depth === 0 && c === close) {
          end = k + 1;
          break;
        }
      }
    }
    if (end < 0) {
      // Never closed: the rest is kept as it is.
      lead += text.slice(at);
      break;
    }
    const kind = head[1].toLowerCase();
    const body = text.slice(at, end);
    if (kind === 'string' || kind === 'preamble' || kind === 'comment') out.push({ kind, text: body, lead });
    else {
      let e = parseBibEntry(body);
      // A key BibTeX trips on (a space in it) is read all the same, for Tidy to fix.
      const k = e ? null : /^(@\s*[A-Za-z]+\s*[{(]\s*)([^,{}()]*?)(\s*,)/.exec(body);
      if (k) {
        const got = parseBibEntry(`${k[1]}x${body.slice(k[1].length + k[2].length)}`);
        if (got) e = { ...got, key: k[2].trim() };
      }
      out.push(e ? { kind: 'entry', text: body, lead, entry: e } : { kind: 'comment', text: body, lead });
    }
    lead = '';
    i = end;
  }
  if (lead.trim()) out.push({ kind: 'text', text: '', lead });
  return out;
}

export interface BibTidyOptions {
  /** Sort the entries by key. */
  sort?: boolean;
  /** Take out the entries nothing cites. */
  unused?: boolean;
  /** Merge entries for the same paper. */
  duplicates?: boolean;
  /** Fix keys BibTeX trips on, keys two entries share, and citations whose key differs from its entry's in capitals. */
  keys?: boolean;
  /** Write every entry the same way: one field a line, in the usual order. */
  format?: boolean;
}

export interface BibTidyChange {
  kind: 'sorted' | 'removed' | 'merged' | 'renamed' | 'cite' | 'filled' | 'formatted';
  /** The entry it is about (none for the whole file). */
  key?: string;
  /** What changed, in plain words. */
  what: string;
}

export interface BibTidied {
  text: string;
  changes: BibTidyChange[];
  /** Citations to change in the document: a key cited → the key to cite now. */
  renames: Record<string, string>;
}

const field = (e: BibEntry, n: string) => e.fields.find(([k]) => k === n)?.[1]?.trim() ?? '';
const doiOf = (e: BibEntry) =>
  field(e, 'doi')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
    .toLowerCase();
const titleKey = (t: string) =>
  t
    .replace(/\\[A-Za-z]+\s*/g, '')
    .replace(/[{}]/g, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** What an entry of each type is expected to have (those it lacks are filled from its DOI). */
const EXPECTED: Record<string, string[]> = {
  article: ['author', 'title', 'journal', 'year', 'volume', 'number', 'pages'],
  inproceedings: ['author', 'title', 'booktitle', 'year', 'pages'],
  conference: ['author', 'title', 'booktitle', 'year', 'pages'],
  incollection: ['author', 'title', 'booktitle', 'year', 'publisher', 'pages'],
  book: ['title', 'year', 'publisher'],
  phdthesis: ['author', 'title', 'school', 'year'],
  mastersthesis: ['author', 'title', 'school', 'year'],
  techreport: ['author', 'title', 'institution', 'year'],
};
const FILLABLE = new Set(['author', 'title', 'journal', 'booktitle', 'year', 'volume', 'number', 'pages', 'publisher', 'school', 'institution', 'month']);

/** The fields an entry lacks of those its type is expected to have. */
export function missingFields(e: BibEntry): string[] {
  const want = EXPECTED[e.type] ?? ['author', 'title', 'year'];
  return want.filter((n) => !field(e, n) && !(n === 'author' && field(e, 'editor')));
}

/** The entries with a DOI that lack fields their type is expected to have: what to ask doi.org for. */
export function bibNeedsFill(text: string): { key: string; doi: string; missing: string[] }[] {
  const out: { key: string; doi: string; missing: string[] }[] = [];
  for (const b of splitBib(text)) {
    if (!b.entry) continue;
    const doi = doiOf(b.entry);
    const missing = missingFields(b.entry);
    if (doi && /^10\.\d{4,9}\//.test(doi) && missing.length) out.push({ key: b.entry.key, doi, missing });
  }
  return out;
}

/** BibTeX keys: no spaces, commas, braces, quotes, #, %, ~, = or backslashes. */
const BAD_KEY = /[\s,{}()"#%~=\\'@]/g;

/** `e` with the fields it lacks taken from `from` (only those a reference has: authors, title, venue, year, numbers). */
function fillFrom(e: BibEntry, from: BibEntry, only?: Set<string>): { entry: BibEntry; added: string[] } {
  const have = new Set(e.fields.filter(([, v]) => v.trim()).map(([n]) => n));
  // A venue is one: a journal for an article, a booktitle for a paper in proceedings.
  const venue = have.has('journal') || have.has('booktitle');
  const added: string[] = [];
  const fields = [...e.fields];
  for (const [n, v] of from.fields) {
    if (have.has(n) || !v.trim() || !FILLABLE.has(n) || (only && !only.has(n))) continue;
    if ((n === 'journal' || n === 'booktitle') && venue) continue;
    if (n === 'journal' && e.type !== 'article') continue;
    if (n === 'booktitle' && e.type === 'article') continue;
    fields.push([n, v]);
    have.add(n);
    added.push(n);
  }
  return { entry: { ...e, fields }, added };
}

/** A .bib tidied as the options say (see the file's head); `cited`: what the document cites (null: unknown, nothing taken out). */
export function tidyBib(text: string, cited: { keys: Set<string>; all: boolean } | null, o: BibTidyOptions, fill?: Map<string, BibEntry>): BibTidied {
  const blocks = splitBib(text);
  const changes: BibTidyChange[] = [];
  const renames: Record<string, string> = {};
  type Item = { b: BibBlock; e?: BibEntry; changed: boolean; gone?: boolean; order: number };
  const items: Item[] = blocks.map((b, order) => ({ b, e: b.entry, changed: false, order }));
  const entries = () => items.filter((x) => x.e && !x.gone);

  // Keys: characters BibTeX trips on, keys two entries share.
  if (o.keys) {
    const taken = new Set<string>();
    for (const x of entries()) {
      const e = x.e!;
      let key = e.key.replace(BAD_KEY, '');
      if (!key) key = bibKeyFor(cleanBibEntry(e));
      if (taken.has(key.toLowerCase())) {
        const k2 = uniqueKey(key, taken);
        changes.push({ kind: 'renamed', key: k2, what: `${e.key} → ${k2}: another entry has the key ${e.key} already (citations of it mean the first).` });
        key = k2;
      } else if (key !== e.key) {
        changes.push({ kind: 'renamed', key, what: `${e.key || '(no key)'} → ${key}: BibTeX cannot read a key with ${e.key ? 'those characters' : 'nothing in it'}.` });
        if (e.key) renames[e.key] = key;
      }
      taken.add(key.toLowerCase());
      if (key !== e.key) {
        x.e = { ...e, key };
        x.changed = true;
      }
    }
  }

  // Citations whose key differs from its entry's only in capitals.
  if (o.keys && cited) {
    const exact = new Set(entries().map((x) => x.e!.key));
    const lower = new Map(entries().map((x) => [x.e!.key.toLowerCase(), x.e!.key]));
    for (const k of cited.keys) {
      if (exact.has(k) || renames[k]) continue;
      const to = lower.get(k.toLowerCase());
      if (to) {
        renames[k] = to;
        changes.push({ kind: 'cite', key: to, what: `\\cite{${k}} → \\cite{${to}}: the entry's key is written ${to}.` });
      }
    }
  }
  /** Whether the document cites an entry's key (as the citations will be once changed). */
  const isCited = (key: string) => !!cited && [...cited.keys].some((k) => (renames[k] ?? k) === key);

  // Duplicates: the same DOI, or the same title and year.
  if (o.duplicates) {
    const byDoi = new Map<string, Item>();
    const byTitle = new Map<string, Item>();
    for (const x of entries()) {
      const e = x.e!;
      const doi = doiOf(e);
      const t = titleKey(field(e, 'title'));
      const year = /\d{4}/.exec(field(e, 'year'))?.[0] ?? '';
      const tk = t.length >= 12 ? `${t}|${year}` : '';
      const first = (doi && byDoi.get(doi)) || (tk && byTitle.get(tk)) || null;
      if (!first) {
        if (doi) byDoi.set(doi, x);
        if (tk) byTitle.set(tk, x);
        continue;
      }
      // The one cited is kept when only the later one is.
      let keep = first;
      let drop = x;
      if (!isCited(first.e!.key) && isCited(e.key)) {
        keep = x;
        drop = first;
        if (doi) byDoi.set(doi, x);
        if (tk) byTitle.set(tk, x);
      }
      const merged = fillFrom(keep.e!, drop.e!);
      keep.e = merged.entry;
      if (merged.added.length) keep.changed = true;
      drop.gone = true;
      renames[drop.e!.key] = keep.e!.key;
      for (const [from, to] of Object.entries(renames)) if (to === drop.e!.key) renames[from] = keep.e!.key;
      changes.push({
        kind: 'merged',
        key: keep.e!.key,
        what: `${drop.e!.key} and ${keep.e!.key} are the same paper (${doi && doiOf(drop.e!) === doiOf(keep.e!) ? 'the same DOI' : 'the same title and year'}): kept ${keep.e!.key}${merged.added.length ? `, with ${merged.added.join(', ')} from the other` : ''}; citations of ${drop.e!.key} cite it now.`,
      });
    }
  }

  // Fields filled from the DOIs' records.
  if (fill?.size)
    for (const x of entries()) {
      const got = fill.get(x.e!.key) ?? fill.get(doiOf(x.e!));
      if (!got) continue;
      const r = fillFrom(x.e!, cleanBibEntry(got), new Set(missingFields(x.e!)));
      if (!r.added.length) continue;
      x.e = r.entry;
      x.changed = true;
      changes.push({ kind: 'filled', key: x.e.key, what: `${x.e.key}: ${r.added.join(', ')} from its DOI.` });
    }

  // What nothing cites (nor a cited entry's crossref).
  if (o.unused && cited && !cited.all) {
    const keep = new Set([...cited.keys].map((k) => renames[k] ?? k));
    for (const x of entries()) if (keep.has(x.e!.key)) for (const n of ['crossref', 'xdata']) if (field(x.e!, n)) keep.add(field(x.e!, n));
    for (const x of entries())
      if (!keep.has(x.e!.key)) {
        x.gone = true;
        changes.push({ kind: 'removed', key: x.e!.key, what: `${x.e!.key}: nothing in the document cites it.` });
      }
  }

  // The order: @string, @preamble and @comment first, then the entries (by key when sorting).
  const head = items.filter((x) => !x.e && x.b.kind !== 'text');
  let body = entries();
  if (o.sort) {
    const sorted = [...body].sort((a, b) => a.e!.key.localeCompare(b.e!.key, 'en', { sensitivity: 'base', numeric: true }) || a.order - b.order);
    if (sorted.some((x, i) => x !== body[i])) changes.push({ kind: 'sorted', what: `${sorted.length} entries sorted by key.` });
    body = sorted;
  }
  let formatted = 0;
  const textOf = (x: Item): string => {
    if (!x.e) return x.b.text;
    if (x.changed || o.format) {
      const t = bibText(x.e).trimEnd();
      if (!x.changed && t !== x.b.text.trim()) formatted++;
      // A key changed alone: the entry keeps its own text, its key changed in it.
      if (!o.format && x.e.key !== x.b.entry!.key && JSON.stringify(x.e.fields) === JSON.stringify(x.b.entry!.fields))
        return x.b.text.replace(/^(@\s*[A-Za-z]+\s*[{(]\s*)[^,]*/, `$1${x.e.key}`);
      return t;
    }
    return x.b.text;
  };
  const leadOf = (x: Item) => x.b.lead.replace(/^\s+|\s+$/g, '');
  const parts: string[] = [];
  for (const x of [...head, ...body]) {
    const lead = leadOf(x);
    parts.push(`${lead ? `${lead}\n` : ''}${textOf(x)}`);
  }
  // What trailed the last entry (comments), at the end; the comments before an entry taken out go with it.
  const tail = items.find((x) => x.b.kind === 'text');
  if (tail && leadOf(tail)) parts.push(leadOf(tail));
  if (formatted) changes.push({ kind: 'formatted', what: `${formatted} ${formatted === 1 ? 'entry' : 'entries'} written one field a line.` });
  const out = parts.join('\n\n');
  return { text: out ? `${out}\n` : '', changes, renames };
}

/** The document's citations changed as `renames` says (\cite{a,old} → \cite{a,new}); comments left as they are. */
export function renameCites(tex: string, renames: Record<string, string>): string {
  if (!Object.keys(renames).length) return tex;
  return tex.replace(/(\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{)([^{}]*)\}/g, (m, head: string, keys: string, offset: number) => {
    const line = tex.slice(tex.lastIndexOf('\n', offset) + 1, offset);
    if (/(^|[^\\])%/.test(line)) return m;
    const next = keys.replace(/[^,\s][^,]*/g, (k) => {
      const t = k.trim();
      return renames[t] ? k.replace(t, renames[t]) : k;
    });
    // A key named twice now (two duplicates cited together) is named once.
    const seen = new Set<string>();
    const list = next
      .split(',')
      .filter((k) => {
        const t = k.trim();
        if (!t) return true;
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      })
      .join(',');
    return `${head}${list}}`;
  });
}

/** An entry read from doi.org's BibTeX, for `fill`. */
export const fillEntry = (bibtex: string) => parseBibEntry(bibtex);
