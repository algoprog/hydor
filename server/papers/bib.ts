// A reading list's papers and BibTeX: a whole .bib read into entries (each entry as its own BibTeX again, @string
// abbreviations put in), a paper's record from an entry, the same paper told apart from others (by its DOI, its arXiv id,
// its Zotero key, else its title and year), what a new copy of a paper adds to the one kept (only what the kept one lacks:
// what you wrote, your tags and its status stay yours), and a .bib written from papers, each under a key of its own.
import { bibKeyFor, bibKeys, bibText, cleanBibEntry, parseBibEntry, uniqueKey, type BibEntry } from '../../shared/latex-bib.ts';
import { arxivIn, bibOfRecord, doiIn, recordOfBib, titleKey } from './resolve.ts';

/** A paper as a reading list keeps it (the app's "papers" records). */
export interface Paper {
  id?: string;
  title: string;
  /** Its authors, as a line: "Ashish Vaswani, Noam Shazeer, Niki Parmar". */
  authors?: string;
  year?: number | null;
  venue?: string;
  doi?: string;
  arxiv?: string;
  url?: string | null;
  /** An open PDF: a link, or a path on this computer. */
  pdf?: string;
  abstract?: string;
  bibtex?: string;
  key?: string;
  tags?: string[];
  /** To read, Reading or Read. */
  status?: string;
  notes?: string;
  /** Its project: one of the user's projects by its id, or the words given when they name none of them. */
  project?: string;
  /** The project's name, as the list shows it (the words given, for a project that is none of the user's). */
  project_name?: string;
  /** When it was added, and when it was read (YYYY-MM-DD). */
  added?: string | null;
  read_on?: string | null;
  zotero_key?: string;
  zotero_version?: number | null;
}

export const STATUSES = ['To read', 'Reading', 'Read'];

/** A status as the list writes it ("to-read", "done" and the like read too). */
export function statusOf(v: unknown): string {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!s) return '';
  if (/^(read|done|donereading|finished|haveread)$/.test(s)) return 'Read';
  if (/^(reading|readingnow|inprogress|started|current)$/.test(s)) return 'Reading';
  if (/^(toread|unread|later|queued|new|todo)$/.test(s)) return 'To read';
  return '';
}

/** Tags from anything: a list, or text split at commas, semicolons and new lines; each once, trimmed. */
export function tagsOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,;\n]/) : [];
  const out: string[] = [];
  for (const t of list.map((x) => x.replace(/^#/, '').replace(/\s+/g, ' ').trim()).filter(Boolean)) if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t.slice(0, 60));
  return out.slice(0, 30);
}

// ---- reading a .bib ---------------------------------------------------------------------------------------------------

/** The entries of a .bib, each as its own text: from @type{ to its closing brace, @comment and @preamble left out, @string abbreviations put in. */
export function splitBib(text: string): string[] {
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  const strings = new Map<string, string>();
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const at = s.indexOf('@', i);
    if (at < 0) break;
    const head = /^@\s*([A-Za-z]+)\s*([{(])/.exec(s.slice(at, at + 60));
    if (!head) {
      i = at + 1;
      continue;
    }
    // Its end: the brace that closes its first one, or (for @type( … )) the parenthesis outside every brace.
    const paren = head[2] === '(';
    let depth = 0;
    let end = -1;
    for (let k = at + head[0].length - (paren ? 0 : 1); k < s.length; k++) {
      const c = s[k];
      if (c === '\\') {
        k++;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (!paren && depth === 0) {
          end = k + 1;
          break;
        }
      } else if (paren && c === ')' && depth === 0) {
        end = k + 1;
        break;
      }
    }
    if (end < 0) break;
    const body = s.slice(at, end);
    const type = head[1].toLowerCase();
    if (type === 'string') {
      const m = /^@\s*string\s*[{(]\s*([A-Za-z][\w:-]*)\s*=\s*(?:\{([\s\S]*)\}|"([\s\S]*)")\s*[})]$/i.exec(body);
      if (m) strings.set(m[1].toLowerCase(), (m[2] ?? m[3] ?? '').trim());
    } else if (type !== 'comment' && type !== 'preamble') out.push(body);
    i = end;
  }
  if (!strings.size) return out;
  // An abbreviation used bare as a value (journal = jmlr) becomes its text.
  return out.map((e) => e.replace(/(=\s*)([A-Za-z][\w:-]*)(\s*[,}\n])/g, (all, eq: string, name: string, after: string) => (strings.has(name.toLowerCase()) ? `${eq}{${strings.get(name.toLowerCase())}}${after}` : all)));
}

/** A paper from a BibTeX entry: its record, and the entry itself, tidied, under its own key. */
export function paperOfBib(entry: string): Paper | null {
  const e = parseBibEntry(entry);
  if (!e) return null;
  const c = cleanBibEntry(e);
  const r = recordOfBib(c);
  if (!r.title) return null;
  const key = c.key && c.key !== 'ref' ? c.key : bibKeyFor(c);
  const kw = c.fields.find(([n]) => n === 'keywords')?.[1] ?? '';
  return {
    title: r.title,
    authors: r.authors.join(', '),
    year: Number(r.year) || null,
    venue: r.venue,
    doi: r.doi,
    arxiv: r.arxiv,
    url: r.url || (r.doi ? `https://doi.org/${r.doi}` : r.arxiv ? `https://arxiv.org/abs/${r.arxiv}` : null),
    abstract: r.abstract.slice(0, 4000),
    bibtex: bibText({ ...c, key }),
    key,
    tags: tagsOf(kw),
  };
}

/** Every paper of a .bib, and how many entries were left out (no title, or not read). */
export function readBib(text: string): { papers: Paper[]; skipped: number } {
  const entries = splitBib(text);
  const papers: Paper[] = [];
  let skipped = 0;
  for (const e of entries) {
    const p = paperOfBib(e);
    if (p) papers.push(p);
    else skipped++;
  }
  return { papers, skipped };
}

// ---- the same paper -------------------------------------------------------------------------------------------------------

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Whether two papers are the same one: by DOI, arXiv id or Zotero key; else by title (and year, when both have one). */
export function samePaper(a: Partial<Paper>, b: Partial<Paper>): boolean {
  if (a.doi && b.doi) return norm(a.doi) === norm(b.doi);
  if (a.arxiv && b.arxiv) return norm(a.arxiv).replace(/v\d+$/, '') === norm(b.arxiv).replace(/v\d+$/, '');
  if (a.zotero_key && b.zotero_key && a.zotero_key === b.zotero_key) return true;
  const ta = titleKey(a.title ?? '');
  if (!ta || ta !== titleKey(b.title ?? '')) return false;
  return !a.year || !b.year || Math.abs(Number(a.year) - Number(b.year)) <= 1;
}

/** The paper a list has that is the same as `p`, by the surest sign first (a Zotero key, then ids, then the title). */
export function findSame<T extends Partial<Paper>>(list: T[], p: Partial<Paper>): T | undefined {
  if (p.zotero_key) {
    const z = list.find((x) => x.zotero_key === p.zotero_key);
    if (z) return z;
  }
  return list.find((x) => samePaper(x, p));
}

/** A paper as a list keeps it: its fields tidied (tags a list, its status one of the three, its ids plain), nothing empty. */
export function tidyPaper(p: Partial<Paper> & Record<string, unknown>): Paper {
  const out: Paper = { title: String(p.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) };
  const str = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
  const authors = Array.isArray(p.authors) ? (p.authors as unknown[]).map(String).join(', ') : str(p.authors, 2000);
  if (authors) out.authors = authors;
  const year = Number(String(p.year ?? '').slice(0, 4));
  if (year > 1000 && year < 3000) out.year = year;
  for (const k of ['venue', 'abstract', 'notes', 'project', 'project_name', 'key'] as const) {
    const v = str(p[k], k === 'abstract' ? 4000 : k === 'notes' ? 20_000 : 300);
    if (v) out[k] = v;
  }
  const doi = doiIn(str(p.doi, 300)) || (/^10\./.test(str(p.doi, 300)) ? str(p.doi, 300) : '');
  if (doi) out.doi = doi;
  const arxiv = arxivIn(str(p.arxiv, 100)) || '';
  if (arxiv) out.arxiv = arxiv.replace(/v\d+$/, '');
  const url = str(p.url, 1000);
  if (/^https?:\/\/\S+$/.test(url)) out.url = url;
  else if (out.doi) out.url = `https://doi.org/${out.doi}`;
  else if (out.arxiv) out.url = `https://arxiv.org/abs/${out.arxiv}`;
  const pdf = str(p.pdf, 1000);
  if (pdf) out.pdf = pdf;
  const bib = typeof p.bibtex === 'string' ? p.bibtex.trim().slice(0, 20_000) : '';
  if (bib) out.bibtex = bib;
  const tags = tagsOf(p.tags);
  if (tags.length) out.tags = tags;
  const status = statusOf(p.status);
  if (status) out.status = status;
  for (const k of ['added', 'read_on'] as const) if (typeof p[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p[k] as string)) out[k] = p[k] as string;
  if (typeof p.zotero_key === 'string' && /^[A-Z0-9]{8}$/.test(p.zotero_key)) out.zotero_key = p.zotero_key;
  const zv = Number(p.zotero_version);
  if (Number.isFinite(zv) && zv > 0) out.zotero_version = zv;
  return out;
}

/** What a new copy of a paper adds to the one kept: the fields it lacks, more tags, a newer Zotero version; none when nothing. */
export function mergePaper(kept: Paper, incoming: Paper, o: { metadata?: boolean } = {}): Partial<Paper> | null {
  const set: Partial<Paper> = {};
  const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  // Its record: filled in where the kept one has nothing, or (o.metadata: Zotero's newer record) changed where it differs.
  for (const k of ['title', 'authors', 'year', 'venue', 'doi', 'arxiv', 'url', 'pdf', 'abstract', 'bibtex', 'key'] as const) {
    const v = incoming[k];
    if (empty(v)) continue;
    if (empty(kept[k]) || (o.metadata && k !== 'pdf' && k !== 'key' && String(kept[k]) !== String(v))) (set as Record<string, unknown>)[k] = v;
  }
  // What you said of it stays yours: its status, notes and project only where it has none (the project with its name).
  for (const k of ['status', 'notes', 'project', 'added', 'read_on'] as const) if (empty(kept[k]) && !empty(incoming[k])) (set as Record<string, unknown>)[k] = incoming[k];
  if (set.project) set.project_name = incoming.project_name || set.project;
  const tags = tagsOf([...(kept.tags ?? []), ...(incoming.tags ?? [])]);
  if (tags.length !== (kept.tags ?? []).length) set.tags = tags;
  if (incoming.zotero_key && incoming.zotero_key !== kept.zotero_key) set.zotero_key = incoming.zotero_key;
  if (incoming.zotero_version && incoming.zotero_version !== kept.zotero_version) set.zotero_version = incoming.zotero_version;
  return Object.keys(set).length ? set : null;
}

// ---- writing a .bib ---------------------------------------------------------------------------------------------------------

/** A paper's BibTeX: its own entry (tidied), else one made from its record. */
export function bibOfPaper(p: Paper): BibEntry {
  const own = p.bibtex ? parseBibEntry(p.bibtex) : null;
  if (own) return cleanBibEntry(own);
  const made = parseBibEntry(
    bibOfRecord({
      title: p.title,
      authors: (p.authors ?? '').split(/\s*,\s*|\s+and\s+/).filter(Boolean),
      year: p.year ? String(p.year) : '',
      venue: p.venue ?? '',
      doi: p.doi ?? '',
      arxiv: p.arxiv ?? '',
      url: p.url ?? '',
    }).bibtex,
  )!;
  return made;
}

/** A .bib of papers, each under a key no other has (a paper's own key kept where it can be). */
export function writeBib(papers: Paper[]): string {
  const taken: string[] = [];
  const out: string[] = [];
  for (const p of papers) {
    const e = bibOfPaper(p);
    const key = uniqueKey(e.key && e.key !== 'ref' ? e.key : bibKeyFor(e), taken);
    taken.push(key);
    out.push(bibText({ ...e, key }));
  }
  return out.join('\n');
}

/** The keys of a .bib (for tests and checks). */
export const keysOfBib = (text: string) => bibKeys(text);
