// Citations and a bibliography for documents, as the usual styles write them: APA (7th edition), MLA (9th), Chicago
// (author-date, 17th) and IEEE. A citation in the text names its sources by their keys (shared/docs.ts Run.cite), each
// with the part of it cited if it says ("p. 4"); here it becomes what the style writes there ("(Vaswani et al., 2017,
// p. 4)", "(Vaswani et al. 4)", "[1]"), and each source an entry of the bibliography, its title in italics where the
// style has it so. Sources come from what Insert → Citation finds on the web (BibTeX, from the LaTeX editor's lookup)
// or what a person types in. An author and year that two sources share get letters (2017a, 2017b) in the author-date
// styles; IEEE numbers sources in the order they are first cited.
import { parseBibEntry } from './latex-bib.ts';
import type { CiteStyle, Person, Run, Source, SourceKind } from './docs.ts';

export interface CiteItem {
  key: string;
  loc?: string;
}

/** What a citation needs of the whole document: its sources by key, their numbers (IEEE) and letters (2017a). */
export interface CiteCtx {
  src: Map<string, Source>;
  num: Map<string, number>;
  suffix: Map<string, string>;
}

export const CITE_STYLE_NAMES: Record<CiteStyle, string> = { apa: 'APA (7th edition)', mla: 'MLA (9th edition)', chicago: 'Chicago (author-date)', ieee: 'IEEE' };

/** The heading a bibliography has in each style. */
export const BIB_TITLES: Record<CiteStyle, string> = { apa: 'References', mla: 'Works Cited', chicago: 'References', ieee: 'References' };

// ---- names --------------------------------------------------------------------------------------------------------

/** A given name's initials: "Ashish" → "A.", "Jean-Paul" → "J.-P.", "J. R. R." as it is. */
function initials(given: string, spaced = true): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w
        .split('-')
        .map((p) => (p.endsWith('.') && p.length <= 3 ? p : `${[...p][0] ?? ''}.`))
        .join('-'),
    )
    .join(spaced ? ' ' : '');
}

/** Names in a list: "A, B and C" (with `and`'s word, and a comma before it where the style has one). */
function joinNames(names: string[], and: string, serial: boolean): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}${serial ? ',' : ''} ${and} ${names[names.length - 1]}`;
}

const family = (p: Person) => p.family;
const people = (s: Source) => (s.authors?.length ? s.authors : (s.editors ?? []));

/** Who wrote it, as a citation in the text names them. */
function citeNames(style: CiteStyle, s: Source): string {
  const a = people(s);
  if (!a.length) return shortTitle(s);
  if (style === 'apa') return a.length === 1 ? a[0].family : a.length === 2 ? `${a[0].family} & ${a[1].family}` : `${a[0].family} et al.`;
  if (style === 'mla') return a.length === 1 ? a[0].family : a.length === 2 ? `${a[0].family} and ${a[1].family}` : `${a[0].family} et al.`;
  // Chicago: up to three named, more as the first et al.
  return a.length <= 3 ? joinNames(a.map(family), 'and', true) : `${a[0].family} et al.`;
}

/** A title cut to its first words, for a source with no author ("Attention Is All…"). */
function shortTitle(s: Source): string {
  const words = s.title.split(/\s+/);
  const t = words.length > 4 ? `${words.slice(0, 4).join(' ')}…` : s.title;
  return s.kind === 'book' || s.kind === 'report' || s.kind === 'thesis' || s.kind === 'web' ? t : `“${t}”`;
}

/** The part of a source cited, as each style writes it: "p. 4" (APA, IEEE), "4" (MLA, Chicago). */
function locator(style: CiteStyle, loc: string | undefined): string {
  if (!loc) return '';
  const bare = loc.replace(/^(pp?\.|pages?|page)\s*/i, '');
  if (style === 'mla' || style === 'chicago') return /^[\d\s–—,-]+$/.test(bare) ? bare.replace(/-/g, '–') : loc;
  if (/^\d+$/.test(loc)) return `p. ${loc}`;
  if (/^\d+\s*[-–]\s*\d+$/.test(loc)) return `pp. ${loc.replace(/\s*[-–]\s*/, '–')}`;
  return loc;
}

const yearOf = (s: Source | undefined, suffix?: string) => `${s?.year || 'n.d.'}${suffix ? (s?.year ? suffix : `-${suffix}`) : ''}`;

// ---- citations in the text ----------------------------------------------------------------------------------------

/** A citation as it reads in the text: its sources (by key) in the style, each with the part of it cited. */
export function citeWords(style: CiteStyle, items: CiteItem[], c: CiteCtx): string {
  if (!items.length) return '';
  if (style === 'ieee') {
    const nums = items.map((x) => ({ n: c.num.get(x.key) ?? 0, loc: x.loc }));
    // Numbers in a row without pages read as a range: [1]–[3].
    if (nums.every((x) => !x.loc && x.n)) {
      const sorted = [...new Set(nums.map((x) => x.n))].sort((a, b) => a - b);
      const parts: string[] = [];
      for (let i = 0; i < sorted.length; ) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
        parts.push(j - i >= 2 ? `[${sorted[i]}]–[${sorted[j]}]` : sorted.slice(i, j + 1).map((n) => `[${n}]`).join(', '));
        i = j + 1;
      }
      return parts.join(', ');
    }
    return nums.map((x) => `[${x.n || '?'}${x.loc ? `, ${locator('ieee', x.loc)}` : ''}]`).join(', ');
  }
  const parts = items.map((x) => {
    const s = c.src.get(x.key);
    if (!s) return `${x.key}?`;
    const who = citeNames(style, s);
    const loc = locator(style, x.loc);
    if (style === 'mla') return loc ? `${who} ${loc}` : who;
    const year = yearOf(s, c.suffix.get(s.id));
    return style === 'apa' ? `${who}, ${year}${loc ? `, ${loc}` : ''}` : `${who} ${year}${loc ? `, ${loc}` : ''}`;
  });
  return `(${parts.join('; ')})`;
}

// ---- the bibliography ------------------------------------------------------------------------------------------

/** Runs of words, an italic title among them. */
class Out {
  runs: Run[] = [];
  add(t: string, i = false) {
    if (!t) return this;
    const last = this.runs[this.runs.length - 1];
    if (last && !!last.i === i) last.t += t;
    else this.runs.push(i ? { t, i: true } : { t });
    return this;
  }
}

/** Words that end in a stop end there; others get one. */
const stop = (t: string) => (/[.?!]["”’]?$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
const pagesOf = (p: string | undefined) => (p ? p.replace(/\s*(--|-|–|—)\s*/g, '–') : '');
const doiUrl = (s: Source) => (s.doi ? `https://doi.org/${s.doi}` : (s.url ?? ''));

/** Authors as APA lists them: "Vaswani, A., Shazeer, N., & Parmar, N." (up to 20, then the last after an ellipsis). */
function apaAuthors(a: Person[]): string {
  const one = (p: Person) => (p.given ? `${p.family}, ${initials(p.given)}` : p.family);
  if (a.length > 20) return `${a.slice(0, 19).map(one).join(', ')}, … ${one(a[a.length - 1])}`;
  if (a.length === 1) return one(a[0]);
  return `${a.slice(0, -1).map(one).join(', ')}, & ${one(a[a.length - 1])}`;
}

/** Authors as MLA lists them: "Vaswani, Ashish", "Vaswani, Ashish, and Noam Shazeer", "Vaswani, Ashish, et al.". */
function mlaAuthors(a: Person[]): string {
  const first = a[0].given ? `${a[0].family}, ${a[0].given}` : a[0].family;
  if (a.length === 1) return first;
  if (a.length === 2) return `${first}, and ${a[1].given ? `${a[1].given} ${a[1].family}` : a[1].family}`;
  return `${first}, et al`;
}

/** Authors as Chicago lists them: the first family name first, the others given name first (up to ten, then the first seven et al.). */
function chicagoAuthors(a: Person[]): string {
  const list = a.length > 10 ? a.slice(0, 7) : a;
  const names = list.map((p, k) => (k === 0 ? (p.given ? `${p.family}, ${p.given}` : p.family) : p.given ? `${p.given} ${p.family}` : p.family));
  return a.length > 10 ? `${names.join(', ')}, et al` : joinNames(names, 'and', true);
}

/** Authors as IEEE lists them: initials first, "A. Vaswani, N. Shazeer, and N. Parmar" (more than six: the first et al.). */
function ieeeAuthors(a: Person[]): string {
  const one = (p: Person) => (p.given ? `${initials(p.given)} ${p.family}` : p.family);
  if (a.length > 6) return `${one(a[0])} et al.`;
  return joinNames(a.map(one), 'and', true);
}

/** Editors as a chapter's book names them, after "In". */
function editorsIn(style: CiteStyle, e: Person[] | undefined): string {
  if (!e?.length) return '';
  const names = e.map((p) => (p.given ? `${style === 'apa' || style === 'ieee' ? initials(p.given) : p.given} ${p.family}` : p.family));
  const list = joinNames(names, style === 'apa' ? '&' : 'and', style !== 'apa');
  return style === 'apa' ? `${list} (Ed${e.length > 1 ? 's' : ''}.), ` : style === 'mla' ? `edited by ${list}, ` : style === 'chicago' ? `edited by ${list}, ` : `${list}, Ed${e.length > 1 ? 's' : ''}., `;
}

const titled = (k: SourceKind) => k === 'book' || k === 'report' || k === 'thesis' || k === 'web';

function apaEntry(s: Source, suffix: string | undefined): Run[] {
  const o = new Out();
  const a = s.authors ?? [];
  const year = `(${yearOf(s, suffix)}). `;
  if (a.length) o.add(`${stop(apaAuthors(a))} ${year}`);
  if (titled(s.kind)) {
    // A book's (a report's, a page's) title is in italics; with no author it comes first.
    o.add(s.title, true);
    o.add(s.kind === 'thesis' ? ` [Doctoral dissertation${s.publisher ? `, ${s.publisher}` : ''}]` : '');
    o.add(a.length ? '. ' : `. ${year}`);
    if (s.kind === 'web' && s.in) o.add(`${stop(s.in)} `);
    if (s.kind !== 'thesis' && s.kind !== 'web' && s.publisher) o.add(`${stop(s.publisher)} `);
  } else {
    o.add(`${stop(s.title)} `);
    if (!a.length) o.add(year);
    if (s.kind === 'chapter' || s.kind === 'conference') {
      if (s.in) {
        o.add(`In ${editorsIn('apa', s.editors)}`);
        o.add(s.in, true);
        o.add(s.pages ? ` (pp. ${pagesOf(s.pages)}). ` : '. ');
      }
      if (s.publisher) o.add(`${stop(s.publisher)} `);
    } else if (s.in) {
      o.add(s.in, true);
      if (s.volume) {
        o.add(', ');
        o.add(s.volume, true);
      }
      if (s.issue) o.add(`(${s.issue})`);
      if (s.pages) o.add(`, ${pagesOf(s.pages)}`);
      o.add('. ');
    }
  }
  const link = doiUrl(s);
  if (link) o.add(link);
  o.runs[o.runs.length - 1].t = o.runs[o.runs.length - 1].t.trimEnd();
  return o.runs;
}

function mlaEntry(s: Source): Run[] {
  const o = new Out();
  const a = s.authors ?? [];
  if (a.length) o.add(`${stop(mlaAuthors(a))} `);
  if (titled(s.kind)) {
    o.add(s.title, true);
    o.add('. ');
  } else o.add(`“${stop(s.title)}” `);
  const parts: { t: string; i?: boolean }[] = [];
  if (s.in) parts.push({ t: s.in, i: true });
  if (s.kind === 'chapter' && s.editors?.length) parts.push({ t: editorsIn('mla', s.editors).replace(/, $/, '') });
  if (s.volume) parts.push({ t: `vol. ${s.volume}` });
  if (s.issue) parts.push({ t: `no. ${s.issue}` });
  if (s.publisher && (titled(s.kind) || s.kind === 'chapter')) parts.push({ t: s.publisher });
  if (s.year) parts.push({ t: s.year });
  if (s.pages) parts.push({ t: `${/[-–]/.test(s.pages) ? 'pp.' : 'p.'} ${pagesOf(s.pages)}` });
  parts.forEach((p, k) => {
    o.add(p.t, !!p.i);
    o.add(k < parts.length - 1 ? ', ' : '. ');
  });
  const link = s.doi ? `https://doi.org/${s.doi}` : s.url ? s.url.replace(/^https?:\/\//, '') : '';
  if (link) o.add(stop(link));
  if (s.kind === 'web' && s.accessed) o.add(` Accessed ${s.accessed}.`);
  o.runs[o.runs.length - 1].t = o.runs[o.runs.length - 1].t.trimEnd();
  return o.runs;
}

function chicagoEntry(s: Source, suffix: string | undefined): Run[] {
  const o = new Out();
  const a = s.authors ?? [];
  const year = `${yearOf(s, suffix)}. `;
  if (a.length) o.add(`${stop(chicagoAuthors(a))} ${year}`);
  if (titled(s.kind)) {
    o.add(s.title, true);
    o.add('. ');
    if (!a.length) o.add(year);
    if (s.kind === 'web' && s.in) o.add(`${stop(s.in)} `);
    if (s.publisher) o.add(`${stop(s.publisher)} `);
  } else {
    o.add(`“${stop(s.title)}” `);
    if (!a.length) o.add(year);
    if (s.kind === 'chapter' || s.kind === 'conference') {
      if (s.in) {
        o.add('In ');
        o.add(s.in, true);
        o.add(`, ${editorsIn('chicago', s.editors)}${s.pages ? `${pagesOf(s.pages)}. ` : ''}`.replace(/, $/, '. '));
      }
      if (s.publisher) o.add(`${stop(s.publisher)} `);
    } else if (s.in) {
      o.add(s.in, true);
      if (s.volume) o.add(` ${s.volume}`);
      if (s.issue) o.add(` (${s.issue})`);
      o.add(s.pages ? `: ${pagesOf(s.pages)}. ` : '. ');
    }
  }
  const link = doiUrl(s);
  if (link) o.add(stop(link));
  o.runs[o.runs.length - 1].t = o.runs[o.runs.length - 1].t.trimEnd();
  return o.runs;
}

function ieeeEntry(s: Source, n: number): Run[] {
  const o = new Out();
  o.add(`[${n}] `);
  const a = s.authors ?? [];
  if (a.length) o.add(`${ieeeAuthors(a)}, `);
  if (titled(s.kind)) {
    o.add(s.title, true);
    if (s.kind === 'web') {
      o.add('. ');
      if (s.in) o.add(`${s.in}. `);
      if (s.url) o.add(`[Online]. Available: ${s.url}`);
      if (s.accessed) o.add(` (accessed ${s.accessed}).`);
      else if (!s.url) o.runs[o.runs.length - 1].t = o.runs[o.runs.length - 1].t.trimEnd();
      return o.runs;
    }
    o.add(s.kind === 'thesis' ? `, Ph.D. dissertation${s.publisher ? `, ${s.publisher}` : ''}, ${s.year || 'n.d.'}.` : `. ${s.publisher ? `${s.publisher}, ` : ''}${s.year || 'n.d.'}.`);
  } else {
    o.add(`“${s.title},” `);
    if (s.kind === 'chapter' || s.kind === 'conference') {
      o.add(s.kind === 'conference' ? 'in ' : `in ${editorsIn('ieee', s.editors)}`);
      if (s.in) o.add(s.in, true);
      o.add(`, ${s.year || 'n.d.'}${s.pages ? `, pp. ${pagesOf(s.pages)}` : ''}.`);
    } else {
      if (s.in) o.add(s.in, true);
      const bits = [s.volume ? `vol. ${s.volume}` : '', s.issue ? `no. ${s.issue}` : '', s.pages ? `${/[-–]/.test(s.pages) ? 'pp.' : 'p.'} ${pagesOf(s.pages)}` : '', s.year || 'n.d.'].filter(Boolean);
      o.add(`${s.in ? ', ' : ''}${bits.join(', ')}.`);
    }
  }
  if (s.doi) o.add(` doi: ${s.doi}.`);
  else if (s.url) o.add(` [Online]. Available: ${s.url}`);
  return o.runs;
}

/** A source's entry in the bibliography, as the style writes it (`n`: its number, for IEEE; `suffix`: its year's letter). */
export function bibRuns(style: CiteStyle, s: Source, o: { n?: number; suffix?: string } = {}): Run[] {
  if (style === 'ieee') return ieeeEntry(s, o.n ?? 0);
  if (style === 'mla') return mlaEntry(s);
  if (style === 'chicago') return chicagoEntry(s, o.suffix);
  return apaEntry(s, o.suffix);
}

/** What a list is sorted by: the first author's family name (or the title), then the year and the title. */
const sortKey = (s: Source) => `${(people(s)[0]?.family ?? s.title.replace(/^(the|a|an)\s+/i, '')).toLowerCase()}\u0000${s.year ?? ''}\u0000${s.title.toLowerCase()}`;

/** The bibliography's order: IEEE by number, the others by author and year. */
export function bibSort(style: CiteStyle, list: Source[], num: Map<string, number>): Source[] {
  return [...list].sort(style === 'ieee' ? (a, b) => (num.get(a.id) ?? 1e9) - (num.get(b.id) ?? 1e9) : (a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** Letters for sources whose authors (as cited) and year are another's too: 2017a, 2017b (none for MLA and IEEE). */
export function yearSuffixes(style: CiteStyle, cited: Source[]): Map<string, string> {
  const out = new Map<string, string>();
  if (style === 'mla' || style === 'ieee') return out;
  const groups = new Map<string, Source[]>();
  for (const s of cited) {
    const k = `${citeNames(style, s)}\u0000${s.year ?? ''}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    [...g].sort((a, b) => a.title.localeCompare(b.title)).forEach((s, k) => out.set(s.id, String.fromCharCode(97 + (k % 26))));
  }
  return out;
}

// ---- sources ----------------------------------------------------------------------------------------------------

const BIB_KIND: Record<string, SourceKind> = {
  article: 'article',
  book: 'book',
  inbook: 'chapter',
  incollection: 'chapter',
  inproceedings: 'conference',
  conference: 'conference',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  techreport: 'report',
  report: 'report',
  online: 'web',
  webpage: 'web',
  misc: 'other',
};

/** BibTeX's value as words: its braces, escapes and commands taken out. */
const plainTex = (v: string) =>
  v
    .replace(/\\([&%#_$])/g, '$1')
    .replace(/\\(?:textit|emph|textbf|textrm|mathrm)\{([^{}]*)\}/g, '$1')
    .replace(/\\['"`^~=.uvHc]\{?([A-Za-z])\}?/g, '$1')
    .replace(/\\[A-Za-z]+\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** People from BibTeX's "Family, Given and Given Family" (a {Group Name} kept whole). */
function bibPeople(v: string): Person[] {
  if (!v.trim()) return [];
  return v
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      if (/^\{[^{}]*\}$/.test(a)) return { family: plainTex(a) };
      if (a.includes(',')) {
        const [fam, giv] = a.split(',').map((x) => plainTex(x));
        return giv ? { family: fam, given: giv } : { family: fam };
      }
      const words = plainTex(a).split(' ');
      return words.length > 1 ? { family: words[words.length - 1], given: words.slice(0, -1).join(' ') } : { family: words[0] };
    })
    .filter((p) => p.family);
}

/** A source from a BibTeX entry (what Insert → Citation finds), keyed by the entry's key; null when it has no title. */
export function sourceFromBibtex(text: string): Source | null {
  const e = parseBibEntry(text);
  if (!e) return null;
  const f = (n: string) => plainTex(e.fields.find(([k]) => k.toLowerCase() === n)?.[1] ?? '');
  const raw = (n: string) => (e.fields.find(([k]) => k.toLowerCase() === n)?.[1] ?? '').replace(/[{}]/g, '').trim();
  const title = f('title');
  if (!title) return null;
  let kind = BIB_KIND[e.type.toLowerCase()] ?? 'other';
  const arxiv = /arxiv/i.test(f('archiveprefix')) || /arxiv/i.test(f('howpublished'));
  if (kind === 'other' && raw('url') && !arxiv) kind = 'web';
  const s: Source = { id: e.key || 'ref', kind, title };
  const authors = bibPeople(e.fields.find(([k]) => k.toLowerCase() === 'author')?.[1] ?? '');
  if (authors.length) s.authors = authors;
  const editors = bibPeople(e.fields.find(([k]) => k.toLowerCase() === 'editor')?.[1] ?? '');
  if (editors.length) s.editors = editors;
  const year = /\d{4}/.exec(f('year'))?.[0];
  if (year) s.year = year;
  const where = f('journal') || f('booktitle') || (arxiv && f('eprint') ? `arXiv:${f('eprint')}` : f('howpublished'));
  if (where) s.in = where;
  if (f('volume')) s.volume = f('volume');
  if (f('number')) s.issue = f('number');
  if (f('pages')) s.pages = f('pages').replace(/\s*--?\s*/g, '–');
  const publisher = f('publisher') || f('school') || f('institution') || f('organization');
  if (publisher) s.publisher = publisher;
  const doi = raw('doi').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (/^10\.\d{4,9}\/\S+$/.test(doi)) s.doi = doi;
  const url = raw('url');
  if (/^https?:\/\/\S+$/i.test(url) && !s.doi) s.url = url;
  return s;
}

/** A source in a line, for lists to pick from: "Vaswani et al. · 2017 · Attention Is All You Need". */
export function sourceLine(s: Source): string {
  const a = people(s);
  const who = a.length ? (a.length > 2 ? `${a[0].family} et al.` : a.map(family).join(' & ')) : '';
  return [who, s.year, s.title].filter(Boolean).join(' · ');
}

/** A key for a source as people make them: the first author's family name, the year and the title's first word ("vaswani2017attention"), unique among `taken`. */
export function sourceKey(s: Pick<Source, 'authors' | 'year' | 'title'>, taken: Iterable<string> = []): string {
  const word = (w: string) =>
    w
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const small = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'from', 'by', 'at', 'is', 'are']);
  const who = word(s.authors?.[0]?.family ?? '') || 'ref';
  const first = s.title.split(/[\s:—–-]+/).map(word).find((w) => w && !small.has(w)) ?? '';
  const base = `${who}${s.year ?? ''}${first.slice(0, 16)}`.slice(0, 60) || 'ref';
  const t = new Set([...taken].map((k) => k.toLowerCase()));
  if (!t.has(base)) return base;
  for (let i = 2; ; i++) if (!t.has(`${base}${i}`)) return `${base}${i}`;
}
