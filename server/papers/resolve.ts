// One way to find and read a paper from whatever someone gives for it, shared by the research apps' steps (read_paper):
// an arXiv id or link, a DOI, a link to a paper's page or PDF (ACL Anthology and OpenReview by their own records), a PDF,
// a .tex file or a LaTeX project's folder on this computer, a LaTeX document of the Library, or its title. Its record
// (title, authors, year, venue, ids, abstract and BibTeX) comes from the source of record: arXiv's API, Crossref and
// doi.org, OpenAlex. Its text comes from an open copy only: arXiv's HTML version or its PDF, the open copy OpenAlex knows
// of (OpenAlex carries Unpaywall's data; Unpaywall itself is asked too when HYDOR_CONTACT_EMAIL gives it an address), a
// PDF on its page's citation_pdf_url, or the file given. Nothing behind a paywall is fetched, and what could not be read
// is said plainly. Only public addresses are reached (every redirect checked again), each with a timeout and a limit on
// its size; arXiv is asked at most once every three seconds, as it asks.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bibInfo, bibKeyFor, bibText, cleanBibEntry, familyNames, parseBibEntry, type BibEntry } from '../../shared/latex-bib.ts';
import type { DB } from '../db.ts';
import { which } from '../documents/tools.ts';
import { pdfjsPages } from '../documents/pdf.ts';
import { readTex } from '../pages/latex.ts';
import { getAsset } from '../pages/assets.ts';
import { pageSource } from '../pages/store.ts';
import { assertPublic, htmlMarkdown } from '../web/fetch.ts';

export const UA = 'Hydor/1 (papers; https://hydor.app)';
const TIMEOUT = 25_000;
/** The most a PDF or a page may be. */
const MAX_BYTES = 40_000_000;
/** A part of a paper's text, which a model step takes whole (a value goes into its instructions up to 20,000 characters). */
export const PART_CHARS = 18_000;

/** A paper's record: what a reading list keeps of it. */
export interface PaperRecord {
  title: string;
  /** Its authors, each "Given Family". */
  authors: string[];
  year: string;
  /** Where it appeared: a journal, a conference, arXiv. */
  venue: string;
  doi: string;
  /** Its arXiv id, without the version ("1706.03762"). */
  arxiv: string;
  /** Its page (an arXiv abstract, a DOI's address, the link given). */
  url: string;
  /** An open PDF: a link, or a path on this computer. */
  pdf: string;
  abstract: string;
  bibtex: string;
  /** Its BibTeX key. */
  key: string;
}

/** A paper read: its record, its text in parts, and how it was found. */
export interface PaperRead extends PaperRecord {
  found: boolean;
  /** What it was given as. */
  kind: 'arxiv' | 'doi' | 'url' | 'pdf' | 'latex' | 'library' | 'title';
  /** Where its text came from, in words; empty when only its record was read (or none could be). */
  source: string;
  /** Its text, in parts of at most PART_CHARS characters (a PDF's pages marked "[Page 3]"). */
  parts: string[];
  /** How long its text is, in all. */
  chars: number;
  /** A PDF's pages. */
  pages: number;
  /** Its sections' headings, in order. */
  sections: string[];
  /** A LaTeX source: its folder on this computer, its main file, its figures (files with their captions) and its .bib files. */
  folder?: string;
  main?: string;
  figures?: { file: string; caption: string; label: string }[];
  bibs?: string[];
  /** arXiv's LaTeX source of the paper (a .tar.gz), for those who want its figures. */
  sourceUrl?: string;
  /** What could not be done, in words. */
  notes: string[];
}

export type PaperQuery = { kind: 'path'; path: string } | { kind: 'library'; id: string } | { kind: 'arxiv'; id: string } | { kind: 'doi'; doi: string } | { kind: 'url'; url: string } | { kind: 'title'; words: string };

const ARXIV_ID = /(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/;

/** An arXiv id in text: arXiv:…, an arxiv.org address, a DOI of arXiv's (10.48550/arXiv.…), or the id alone. */
export function arxivIn(s: string): string {
  const t = String(s ?? '').trim();
  const m =
    new RegExp(`arxiv\\.org\\/(?:abs|pdf|html|e-print)\\/${ARXIV_ID.source}`, 'i').exec(t) ??
    new RegExp(`10\\.48550\\/arxiv\\.${ARXIV_ID.source}`, 'i').exec(t) ??
    new RegExp(`arxiv\\s*[:.]?\\s*${ARXIV_ID.source}`, 'i').exec(t) ??
    new RegExp(`^${ARXIV_ID.source}$`).exec(t);
  return m ? m[1] : '';
}

/** A DOI in text (bare, doi:…, a doi.org address), its trailing punctuation left out; none for arXiv's own. */
export function doiIn(s: string): string {
  const m = /\b(10\.\d{4,9}\/[^\s"<>{}]+)/i.exec(String(s ?? ''));
  if (!m) return '';
  let d = decodeURIComponent(m[1]).replace(/[.,;:)\]]+$/, '');
  // A DOI cut from an address keeps no fragment, query or .pdf of the page.
  d = d.replace(/[?#].*$/, '').replace(/\/(?:full|abstract|pdf)$/i, '');
  return /^10\.48550\/arxiv\./i.test(d) ? '' : d;
}

/**
 * What a paper was given as: a path on this computer (a PDF, a .tex file or a folder), a LaTeX document of the Library
 * (/pages/<id>), an arXiv paper, a DOI, a link, or else its title (or words of it). `cwd`: where relative paths start.
 */
export function paperQuery(raw: string, cwd = process.cwd()): PaperQuery {
  const s = String(raw ?? '').trim();
  const local = /^(~|\.{1,2})?\//.test(s) || /^[\w .()\-]+\.(pdf|tex|ltx)$/i.test(s);
  if (local && !/^https?:/i.test(s)) {
    const p = path.resolve(cwd, s.replace(/^~(?=\/|$)/, os.homedir()));
    if (fs.existsSync(p)) return { kind: 'path', path: p };
  }
  const page = /^(?:https?:\/\/[^/\s]+)?\/pages\/([A-Za-z0-9_-]{4,64})\/?$/.exec(s);
  if (page) return { kind: 'library', id: page[1] };
  const ax = arxivIn(s);
  if (ax) return { kind: 'arxiv', id: ax };
  // A DOI, alone or in a publisher's link: its record and an open copy come by it.
  const doi = doiIn(s);
  if (doi) return { kind: 'doi', doi };
  if (/^https?:\/\/\S+$/i.test(s)) return { kind: 'url', url: s };
  return { kind: 'title', words: s.replace(/\s+/g, ' ').slice(0, 300) };
}

// ---- the web ---------------------------------------------------------------------------------------------------------

interface Got {
  status: number;
  url: string;
  type: string;
  body: Buffer;
  text: () => string;
}

/** Waits so that requests to one host come at most every `ms` milliseconds. */
const lastAt = new Map<string, number>();
async function spaced(host: string, ms: number) {
  const wait = (lastAt.get(host) ?? 0) + ms - Date.now();
  lastAt.set(host, Date.now() + Math.max(0, wait));
  if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
}

/** A public address: redirects followed one by one, each checked; arXiv's API at most every three seconds. */
export async function get(url: string, o: { accept?: string; max?: number; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Got> {
  const all = AbortSignal.any([o.signal ?? new AbortController().signal, AbortSignal.timeout(o.timeoutMs ?? TIMEOUT)]);
  let u = new URL(url);
  for (let hop = 0; hop < 8; hop++) {
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('not a web address');
    await assertPublic(u);
    if (u.hostname === 'export.arxiv.org') await spaced(u.hostname, 3100);
    const r = await fetch(u, { redirect: 'manual', signal: all, headers: { 'user-agent': UA, accept: o.accept ?? '*/*' } });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      u = new URL(loc, u);
      continue;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const max = o.max ?? MAX_BYTES;
    for await (const c of r.body ?? []) {
      const b = Buffer.from(c as Uint8Array);
      size += b.length;
      if (size > max) break;
      chunks.push(b);
    }
    const body = Buffer.concat(chunks);
    return { status: r.status, url: u.href, type: r.headers.get('content-type') ?? '', body, text: () => body.toString('utf8') };
  }
  throw new Error('too many redirects');
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  let r = await get(url, { accept: 'application/json', max: 5_000_000, signal });
  // Crossref and OpenAlex ask for a moment when calls come close together: once more, a little later.
  if (r.status === 429 || r.status === 503) {
    await new Promise((ok) => setTimeout(ok, 2000));
    r = await get(url, { accept: 'application/json', max: 5_000_000, signal });
  }
  if (r.status >= 400) return null;
  try {
    return JSON.parse(r.text()) as T;
  } catch {
    return null;
  }
}

const isPdf = (g: Got) => /pdf/i.test(g.type) || g.body.subarray(0, 5).toString() === '%PDF-';

// ---- records from the sources of record -------------------------------------------------------------------------------

const xml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** An empty record, to fill in. */
export const blankRecord = (): PaperRecord => ({ title: '', authors: [], year: '', venue: '', doi: '', arxiv: '', url: '', pdf: '', abstract: '', bibtex: '', key: '' });

/** A BibTeX entry as a record's fields (its authors "Given Family", its venue, its ids). */
export function recordOfBib(e: BibEntry): PaperRecord {
  const f = (n: string) => e.fields.find(([k]) => k === n)?.[1] ?? '';
  const plain = (s: string) => s.replace(/\\([&%#_$])/g, '$1').replace(/\\[A-Za-z]+\s*/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  const authors = (f('author') || f('editor'))
    .split(/\s+and\s+/i)
    .map((a) => plain(a))
    .filter((a) => a && !/^others$/i.test(a))
    .map((a) => (a.includes(',') ? `${a.split(',').slice(1).join(',').trim()} ${a.split(',')[0].trim()}`.trim() : a));
  const eprint = f('eprint');
  const arxiv = (/arxiv/i.test(f('archiveprefix')) || /^\d{4}\.\d{4,5}/.test(eprint) ? arxivIn(eprint) : '') || arxivIn(`${f('journal')} ${f('url')} ${f('note')} ${f('howpublished')}`);
  const info = bibInfo(e);
  const url = f('url');
  return {
    title: plain(f('title')),
    authors,
    year: info.year,
    venue: /^arxiv(:| preprint)/i.test(info.venue) ? 'arXiv' : info.venue,
    doi: doiIn(f('doi')) || '',
    arxiv,
    url: /^https?:\/\//.test(url) ? url : '',
    pdf: '',
    abstract: plain(f('abstract')),
    bibtex: '',
    key: e.key,
  };
}

/** A record's BibTeX: an entry from what it knows (and `extra` fields), under a key made as people make them. */
export function bibOfRecord(r: Partial<PaperRecord>, type?: string, extra: [string, string][] = []): { bibtex: string; key: string } {
  const venue = r.venue ?? '';
  const t = type ?? (r.arxiv && (!venue || /^arxiv$/i.test(venue)) ? 'misc' : /proc|conf|workshop|symposium|meeting|annual|sigir|acl|emnlp|naacl|neurips|nips|icml|iclr|kdd|cikm|wsdm|www|aaai|ijcai|cvpr|iccv|eccv|interspeech|coling/i.test(venue) ? 'inproceedings' : venue ? 'article' : 'misc');
  const fields: [string, string][] = [
    ['author', (r.authors ?? []).map((a) => a.trim()).filter(Boolean).join(' and ')],
    ['title', r.title ?? ''],
    ['year', r.year ?? ''],
  ];
  if (t === 'inproceedings') fields.push(['booktitle', venue]);
  else if (t === 'article') fields.push(['journal', venue]);
  if (r.arxiv) fields.push(['eprint', r.arxiv], ['archiveprefix', 'arXiv']);
  if (r.doi) fields.push(['doi', r.doi]);
  if (r.url || r.arxiv) fields.push(['url', r.url || `https://arxiv.org/abs/${r.arxiv}`]);
  const e = cleanBibEntry({ type: t, key: '', fields: [...fields, ...extra] });
  const key = bibKeyFor(e);
  return { bibtex: bibText({ ...e, key }), key };
}

interface ArxivInfo extends PaperRecord {
  journalRef: string;
  category: string;
}

/** arXiv's Atom feed as records. */
export function arxivRecords(feed: string): ArxivInfo[] {
  const out: ArxivInfo[] = [];
  for (const m of feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1];
    const tag = (name: string) => xml(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(body)?.[1] ?? '');
    const idUrl = tag('id');
    const id = /arxiv\.org\/abs\/(.+?)(v\d+)?$/.exec(idUrl)?.[1];
    if (!id || /api\/errors/.test(idUrl)) continue;
    const authors = [...body.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => xml(a[1]));
    const journalRef = tag('arxiv:journal_ref');
    out.push({
      ...blankRecord(),
      title: tag('title'),
      authors,
      year: /^(\d{4})/.exec(tag('published'))?.[1] ?? '',
      venue: 'arXiv',
      doi: doiIn(tag('arxiv:doi')),
      arxiv: id,
      url: `https://arxiv.org/abs/${id}`,
      pdf: `https://arxiv.org/pdf/${id}`,
      abstract: tag('summary'),
      journalRef,
      category: /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(body)?.[1] ?? '',
    });
  }
  return out;
}

/** An arXiv paper's record, and its BibTeX: the published version's (by its DOI) when arXiv knows it, else arXiv's own entry. */
async function arxivRecord(id: string, signal?: AbortSignal): Promise<ArxivInfo | null> {
  const r = await get(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, { accept: 'application/atom+xml', max: 2_000_000, signal });
  if (r.status >= 400) throw new Error(`arXiv answered ${r.status}`);
  const rec = arxivRecords(r.text())[0];
  if (!rec) return null;
  if (rec.journalRef && rec.venue === 'arXiv') rec.venue = rec.journalRef.replace(/\s*\(.*$/, '').replace(/,\s*\d.*$/, '').trim() || 'arXiv';
  const doiBib = rec.doi ? await bibOfDoi(rec.doi, signal).catch(() => '') : '';
  if (doiBib) {
    const e = parseBibEntry(doiBib);
    if (e) {
      const c = cleanBibEntry(e);
      const key = bibKeyFor(c);
      c.fields = c.fields.filter(([n]) => n !== 'eprint' && n !== 'archiveprefix').concat([
        ['eprint', id],
        ['archiveprefix', 'arXiv'],
      ]);
      rec.bibtex = bibText({ ...c, key });
      rec.key = key;
      const venue = bibInfo(c).venue;
      if (venue) rec.venue = venue;
      return rec;
    }
  }
  // arXiv's own entry: a @misc with its eprint (and howpublished, for the styles that show no eprint).
  const preprint = rec.venue === 'arXiv';
  const b = bibOfRecord({ ...rec, venue: preprint ? '' : rec.venue }, preprint ? 'misc' : undefined, [
    ['howpublished', `arXiv:${rec.arxiv}`],
    ['primaryclass', rec.category],
  ]);
  rec.bibtex = b.bibtex;
  rec.key = b.key;
  return rec;
}

/** A DOI's BibTeX, from doi.org (which hands the asking over to Crossref, DataCite and the rest). */
async function bibOfDoi(doi: string, signal?: AbortSignal): Promise<string> {
  const r = await get(`https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`, { accept: 'application/x-bibtex; charset=utf-8', max: 500_000, signal });
  if (r.status >= 400) return '';
  const t = r.text();
  return /^\s*@/.test(t) ? t : '';
}

interface CrossrefWork {
  DOI?: string;
  type?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  issued?: { 'date-parts'?: (number | null)[][] };
  published?: { 'date-parts'?: (number | null)[][] };
  'container-title'?: string[];
  'event'?: { name?: string };
  publisher?: string;
  abstract?: string;
  URL?: string;
  relation?: Record<string, { 'id-type'?: string; id?: string }[]>;
}

const jats = (s: string) =>
  s
    .replace(/<jats:title>[\s\S]*?<\/jats:title>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Crossref's record of a DOI. */
async function crossrefWork(doi: string, signal?: AbortSignal): Promise<CrossrefWork | null> {
  const j = await getJson<{ message?: CrossrefWork }>(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, signal);
  return j?.message ?? null;
}

const recordOfCrossref = (w: CrossrefWork): PaperRecord => ({
  ...blankRecord(),
  title: jats(w.title?.[0] ?? ''),
  authors: (w.author ?? []).map((a) => (a.family ? `${a.given ?? ''} ${a.family}`.trim() : (a.name ?? ''))).filter(Boolean),
  year: String(w.issued?.['date-parts']?.[0]?.[0] ?? w.published?.['date-parts']?.[0]?.[0] ?? ''),
  venue: jats(w['container-title']?.[0] ?? w.event?.name ?? w.publisher ?? ''),
  doi: w.DOI ?? '',
  url: w.DOI ? `https://doi.org/${w.DOI}` : (w.URL ?? ''),
  abstract: jats(w.abstract ?? ''),
});

interface OpenAlexWork {
  id?: string;
  doi?: string;
  display_name?: string;
  publication_year?: number;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } | null; landing_page_url?: string | null } | null;
  best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null } | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null;
  locations?: { pdf_url?: string | null; landing_page_url?: string | null; source?: { display_name?: string } | null }[];
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** An abstract from OpenAlex's inverted index (each word with its places). */
export function invertedAbstract(ix: Record<string, number[]> | null | undefined): string {
  if (!ix) return '';
  const at: string[] = [];
  for (const [w, places] of Object.entries(ix)) for (const p of places) if (p < 5000) at[p] = w;
  return at.filter((w) => w !== undefined).join(' ');
}

const OPENALEX_FIELDS = 'id,doi,display_name,publication_year,authorships,primary_location,best_oa_location,open_access,locations,abstract_inverted_index';

async function openAlexWork(doi: string, signal?: AbortSignal): Promise<OpenAlexWork | null> {
  return getJson<OpenAlexWork>(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=${OPENALEX_FIELDS}`, signal);
}

/** The open copies OpenAlex knows of a work, best first: PDFs before pages; and an arXiv version, when there is one. */
function openCopies(w: OpenAlexWork | null): { pdfs: string[]; pages: string[]; arxiv: string } {
  const pdfs: string[] = [];
  const pages: string[] = [];
  let arxiv = '';
  const add = (list: string[], u?: string | null) => u && /^https?:\/\//.test(u) && !list.includes(u) && list.push(u);
  if (w) {
    add(pdfs, w.best_oa_location?.pdf_url);
    for (const l of w.locations ?? []) {
      const ax = arxivIn(l.landing_page_url ?? '') || arxivIn(l.pdf_url ?? '');
      if (ax && !arxiv) arxiv = ax;
      add(pdfs, l.pdf_url);
    }
    add(pages, w.best_oa_location?.landing_page_url);
    add(pages, w.open_access?.oa_url);
  }
  return { pdfs, pages, arxiv };
}

/** Unpaywall's open copy of a DOI, when an address to give it is set (HYDOR_CONTACT_EMAIL: it asks who is calling). */
async function unpaywall(doi: string, signal?: AbortSignal): Promise<string> {
  const email = process.env.HYDOR_CONTACT_EMAIL;
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return '';
  const j = await getJson<{ best_oa_location?: { url_for_pdf?: string | null; url?: string | null } | null }>(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`, signal).catch(() => null);
  return j?.best_oa_location?.url_for_pdf ?? j?.best_oa_location?.url ?? '';
}

/** Words of a title, for telling the same paper apart from another. */
export const titleKey = (t: string) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** How alike two titles are, 0 to 1 (by their words). */
export function titleLike(a: string, b: string): number {
  if (titleKey(a) && titleKey(a) === titleKey(b)) return 1;
  const words = (t: string) => new Set(String(t).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return (2 * n) / (x.size + y.size);
}

/** A paper by its title: Crossref's and arXiv's best matches, the first close enough. */
async function byTitle(words: string, signal?: AbortSignal): Promise<{ doi: string; arxiv: string; title: string } | null> {
  const select = 'DOI,title,issued,type';
  const [cr, ax] = await Promise.allSettled([
    getJson<{ message?: { items?: CrossrefWork[] } }>(`https://api.crossref.org/works?rows=5&select=${select}&query.bibliographic=${encodeURIComponent(words)}`, signal),
    (async () => {
      const terms = words
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 10);
      if (!terms.length) return [];
      const r = await get(`https://export.arxiv.org/api/query?max_results=5&search_query=${encodeURIComponent(terms.map((w) => `ti:${w}`).join(' AND '))}`, { accept: 'application/atom+xml', max: 2_000_000, signal });
      return r.status < 400 ? arxivRecords(r.text()) : [];
    })(),
  ]);
  const cands: { doi: string; arxiv: string; title: string; score: number }[] = [];
  for (const w of cr.status === 'fulfilled' ? (cr.value?.message?.items ?? []) : []) if (w.title?.[0]) cands.push({ doi: w.DOI ?? '', arxiv: '', title: jats(w.title[0]), score: titleLike(words, jats(w.title[0])) });
  for (const a of ax.status === 'fulfilled' ? ax.value : []) cands.push({ doi: '', arxiv: a.arxiv, title: a.title, score: titleLike(words, a.title) + 0.01 });
  const best = cands.sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 0.82 ? best : null;
}

// ---- text ---------------------------------------------------------------------------------------------------------------

const run = (bin: string, args: string[], timeout: number) =>
  new Promise<{ ok: boolean; out: string }>((resolve) =>
    execFile(bin, args, { timeout, maxBuffer: 256 << 20, encoding: 'utf8' }, (err, out) => resolve({ ok: !err, out: String(out ?? '') })),
  );

/** A PDF's pages as text, in reading order (pdftotext without its layout keeps two columns apart; pdf.js where it is missing). */
export async function pdfPages(file: string): Promise<string[]> {
  const bin = which('pdftotext');
  let pages: string[];
  if (bin) {
    const r = await run(bin, ['-enc', 'UTF-8', '-q', file, '-'], 120_000);
    if (!r.ok && !r.out) throw new Error('This PDF could not be read: it may be damaged, or locked with a password.');
    pages = r.out.split('\f');
    if (pages.length > 1 && !pages[pages.length - 1].trim()) pages.pop();
  } else pages = (await pdfjsPages(file, 400)).pages;
  return pages.map((p) =>
    p
      .replace(/\r/g, '')
      .replace(/-\n(?=[a-z])/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

/** A PDF's Title, as its maker set it (pdfinfo), when it reads as one. */
async function pdfTitle(file: string): Promise<string> {
  const bin = which('pdfinfo');
  if (!bin) return '';
  const r = await run(bin, [file], 20_000);
  const t = /^Title:\s*(.+)$/m.exec(r.out)?.[1]?.trim() ?? '';
  return t.length > 8 && !/^(untitled|microsoft word|paper|main|manuscript|arxiv|title)\b|\.(pdf|tex|dvi|docx?)$/i.test(t) ? t : '';
}

/** Text in parts of at most `size` characters, at page or paragraph breaks where it can. */
export function partsOf(text: string, size = PART_CHARS): string[] {
  const out: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  for (let para of text.split(/\n{2,}/)) {
    while (para.length > size) {
      flush();
      const at = Math.max(para.lastIndexOf('\n', size), para.lastIndexOf(' ', size), Math.floor(size / 2));
      out.push(para.slice(0, at).trim());
      para = para.slice(at).trimStart();
    }
    if (cur && cur.length + para.length + 2 > size) flush();
    cur = cur ? `${cur}\n\n${para}` : para;
  }
  flush();
  return out;
}

/** The headings of a paper's text: numbered ones from a PDF ("3 Method", "3.1 Data"), Markdown's, LaTeX's sections. */
export function sectionsOf(text: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t && t.length < 120 && !out.includes(t)) out.push(t);
  };
  for (const m of text.matchAll(/^#{1,4}\s+(.+)$/gm)) add(m[1].replace(/\[.*?\]\(.*?\)/g, ''));
  for (const m of text.matchAll(/\\(?:sub)?section\*?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) add(m[1].replace(/\\[A-Za-z]+\s*/g, '').replace(/[{}]/g, ''));
  if (!out.length) for (const m of text.matchAll(/^((?:\d{1,2}(?:\.\d{1,2}){0,2})\.?\s+[A-Z][A-Za-z][^\n]{1,70})$/gm)) if (!/[.,;]$/.test(m[1]) && m[1].split(' ').length <= 10) add(m[1]);
  for (const m of text.matchAll(/^(Abstract|References|Bibliography|Acknowledg(?:e)?ments?|Limitations|Ethics Statement|Appendix|Conclusions?)\s*$/gim)) add(m[1]);
  return out.slice(0, 80);
}

/** A PDF's text with its pages marked, as a paper is read and cited. */
const pagedText = (pages: string[]) => pages.map((p, i) => `[Page ${i + 1}]\n${p}`).join('\n\n');

/** The title of a PDF from its first page: the first lines in the opening that read as a title. */
export function titleFromFirstPage(page: string): string {
  const lines = page
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 14);
  const skip = /^(arxiv:|preprint|under review|published as|proceedings of|accepted|journal of|vol\.|volume|\d+$|abstract\b|https?:|doi:|©|copyright)/i;
  const head: string[] = [];
  const place = (l: string | undefined) => !!l && /@|universit|institut|department|school of|college|laborator|\blab\b|research|\b(inc|ltd|corp)\b|\.(edu|com|org|ac\.\w\w)\b/i.test(l);
  for (const [i, l] of lines.entries()) {
    if (skip.test(l) || l.length < 4) {
      if (head.length) break;
      continue;
    }
    // Names, an affiliation or an address end the title: a line of names is one with a place or an email after it.
    if (head.length && (place(l) || /^\{|∗|†|‡|\d\s*,\s*\d/.test(l) || /^[A-Z][a-z]+ [A-Z][a-z]+(,|\s+and\s)/.test(l) || (place(lines[i + 1]) && !/\b(a|an|the|of|for|with|in|on|via|to|and|over)\b/.test(l)))) break;
    head.push(l);
    if (head.join(' ').length > 160) break;
  }
  return head.join(' ').replace(/\s+/g, ' ').trim().slice(0, 250);
}

// ---- LaTeX ---------------------------------------------------------------------------------------------------------------

const MAX_TEX = 3_000_000;

/** A TeX text without its comments (a % that is not \% to the end of its line). */
export function texUncommented(s: string): string {
  return s.replace(/(^|[^\\])%.*$/gm, '$1');
}

/** The value of \cmd{…} (its braces balanced), from position i (the opening brace); and where it ends. */
function braced(s: string, i: number): { v: string; end: number } | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '\\') k++;
    else if (s[k] === '{') depth++;
    else if (s[k] === '}' && --depth === 0) return { v: s.slice(i + 1, k), end: k + 1 };
  }
  return null;
}

/** Each \cmd[…]{…} of a text: its braced argument. */
function commandArgs(s: string, cmd: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\\\${cmd}\\*?\\s*(?:\\[[^\\]]*\\]\\s*)?(?=\\{)`, 'g');
  for (const m of s.matchAll(re)) {
    const b = braced(s, m.index! + m[0].length);
    if (b) out.push(b.v);
  }
  return out;
}

/** TeX as plain words: commands with words keep them, the rest go. */
export function texPlain(s: string): string {
  return s
    .replace(/\\(?:thanks|footnote|footnotemark|footnotetext|affiliation|email|orcid|inst|IEEEauthorrefmark)\s*(\{(?:[^{}]|\{[^{}]*\})*\})?/g, '')
    .replace(/\\(?:[a-z]*cite[a-z]*|ref|eqref|autoref|[cC]ref|label|url|href)\*?(?:\[[^\]]*\])*\{[^{}]*\}/g, '')
    .replace(/\\\\(\[[^\]]*\])?/g, ' ')
    .replace(/\\(?:textbf|textit|emph|textsc|texttt|mathrm|mbox|text|uppercase|bf|it|sc|small|large|Large|huge)\s*/g, '')
    .replace(/\\[A-Za-z]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The files of a folder (a few levels deep, no hidden folders), at most a few thousand. */
function filesIn(dir: string, depth = 0, out: string[] = []): string[] {
  if (depth > 4 || out.length > 3000) return out;
  let list: fs.Dirent[];
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of list) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filesIn(p, depth + 1, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** A LaTeX project's main file: the one that begins the document (main, paper, ms… first; else the one that brings in the most). */
export function mainTexOf(dir: string, files = filesIn(dir)): string | null {
  const tex = files.filter((f) => /\.(tex|ltx)$/i.test(f));
  const mains = tex.filter((f) => {
    try {
      const t = texUncommented(fs.readFileSync(f, 'utf8').slice(0, 400_000));
      return /\\documentclass/.test(t) && /\\begin\{document\}/.test(t);
    } catch {
      return false;
    }
  });
  if (!mains.length) return null;
  const named = mains.find((f) => /^(main|paper|ms|article|root|manuscript|thesis)\.(tex|ltx)$/i.test(path.basename(f)));
  if (named) return named;
  const brings = (f: string) => (fs.readFileSync(f, 'utf8').match(/\\(input|include|subfile)\{/g) ?? []).length;
  return mains.sort((a, b) => brings(b) - brings(a) || a.split(path.sep).length - b.split(path.sep).length)[0];
}

/** A LaTeX file with what it brings in (\input, \include, \subfile) put in its place, comments left out. */
export function expandTex(file: string, root: string, seen = new Set<string>(), depth = 0, budget = { left: MAX_TEX }): string {
  if (depth > 8 || seen.has(file) || budget.left <= 0) return '';
  seen.add(file);
  let s: string;
  try {
    s = texUncommented(fs.readFileSync(file, 'utf8'));
  } catch {
    return '';
  }
  budget.left -= s.length;
  const base = path.dirname(file);
  return s.replace(/\\(input|include|subfile)\s*\{([^}]+)\}/g, (all, _cmd: string, name: string) => {
    const want = name.trim();
    for (const dir of [base, root]) {
      for (const ext of ['', '.tex']) {
        const p = path.resolve(dir, want + ext);
        if (p.startsWith(root) && fs.existsSync(p) && fs.statSync(p).isFile()) return `\n${expandTex(p, root, seen, depth + 1, budget)}\n`;
      }
    }
    return all;
  });
}

/** What a LaTeX source says of itself: title, authors, abstract, figures (with their files), sections, .bib files. */
export function readLatexSource(full: string, root: string, mainDir: string, files: string[]): Pick<PaperRead, 'title' | 'authors' | 'abstract' | 'figures' | 'sections' | 'bibs'> & { body: string } {
  const title = texPlain(commandArgs(full, 'title')[0] ?? '');
  const authorText = commandArgs(full, 'author').join(' \\and ');
  const authors = authorText
    .split(/\\and\b|\\AND\b|\\And\b/)
    .map((a) =>
      texPlain(
        a
          .replace(/\\\\[\s\S]*$/, '')
          .replace(/\\(?:thanks|footnote)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
          .replace(/\$[^$]*\$/g, ''),
      ),
    )
    .map((a) => a.replace(/[*†‡∗\d,]+$/g, '').trim())
    .filter((a) => a && a.length < 80);
  const abstract = texPlain(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/.exec(full)?.[1] ?? '').slice(0, 4000);
  const doc = /\\begin\{document\}([\s\S]*?)(\\end\{document\}|$)/.exec(full)?.[1] ?? full;
  // Where pictures are looked for: the main file's folder, and \graphicspath's folders.
  const dirs = [mainDir, ...[...full.matchAll(/\\graphicspath\s*\{((?:\{[^}]*\})+)\}/g)].flatMap((m) => [...m[1].matchAll(/\{([^}]*)\}/g)].map((x) => path.resolve(mainDir, x[1])))];
  const fileOf = (name: string): string => {
    for (const d of dirs)
      for (const ext of ['', '.pdf', '.png', '.jpg', '.jpeg', '.eps', '.svg']) {
        const p = path.resolve(d, name.trim() + ext);
        if (p.startsWith(root) && files.includes(p)) return p;
      }
    return '';
  };
  const figures: { file: string; caption: string; label: string }[] = [];
  for (const m of doc.matchAll(/\\begin\{(figure\*?|wrapfigure|subfigure)\}([\s\S]*?)\\end\{\1\}/g)) {
    const body = m[2];
    const caption = texPlain(commandArgs(body, 'caption')[0] ?? '').slice(0, 600);
    const label = /\\label\{([^}]+)\}/.exec(body)?.[1] ?? '';
    for (const g of commandArgs(body, 'includegraphics')) {
      const file = fileOf(g);
      if (file && !figures.some((f) => f.file === file)) figures.push({ file, caption, label });
    }
  }
  const sections = sectionsOf(doc);
  const bibs = files.filter((f) => /\.bib$/i.test(f));
  return { title, authors, abstract, figures: figures.slice(0, 60), sections, bibs, body: doc };
}

/** A LaTeX project as a paper: its main file, its source with what it brings in, and what it says of itself. */
function latexPaper(target: string): PaperRead {
  const st = fs.statSync(target);
  const root = st.isDirectory() ? target : path.dirname(target);
  const files = filesIn(root);
  const main = st.isDirectory() ? mainTexOf(root, files) : target;
  const out: PaperRead = { ...blankRead('latex'), folder: root };
  if (!main) {
    out.notes.push(`No LaTeX file in ${root} begins a document (\\documentclass and \\begin{document}).`);
    return out;
  }
  const full = expandTex(main, root);
  const src = readLatexSource(full, root, path.dirname(main), files);
  const text = src.body.replace(/\n{3,}/g, '\n\n').trim();
  return {
    ...out,
    found: true,
    title: src.title,
    authors: src.authors,
    abstract: src.abstract,
    main,
    figures: src.figures,
    bibs: src.bibs,
    sections: src.sections,
    source: 'its LaTeX source',
    parts: partsOf(text),
    chars: text.length,
    pdf: files.find((f) => f.endsWith('.pdf') && path.basename(f, '.pdf') === path.basename(main, path.extname(main))) ?? '',
  };
}

/** A LaTeX document of the Library, written out as a folder (its files and pictures) in `dir`, to read and to use. */
function libraryTex(db: DB, id: string, dir: string): string | null {
  const src = pageSource(db, id);
  if (!src || src.kind !== 'tex') return null;
  const doc = readTex(src.text);
  const out = path.join(dir, 'paper-source');
  fs.mkdirSync(out, { recursive: true });
  const put = (name: string, data: string | Buffer) => {
    const p = path.resolve(out, name);
    if (!p.startsWith(out + path.sep)) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };
  put('main.tex', doc.main);
  for (const f of doc.files) put(f.name, f.text);
  for (const p of doc.pictures) {
    const sha = /^naget-asset:([a-f0-9]{16,64})$/.exec(p.src)?.[1];
    const a = sha ? getAsset(db, sha) : null;
    if (a) put(p.name, a.data);
  }
  return out;
}

// ---- reading ---------------------------------------------------------------------------------------------------------------

const blankRead = (kind: PaperRead['kind']): PaperRead => ({ ...blankRecord(), found: false, kind, source: '', parts: [], chars: 0, pages: 0, sections: [], notes: [] });

export interface ReadOptions {
  /** Its text too (else its record only). */
  text?: boolean;
  /** A PDF first (its pages, to cite), even where an HTML version reads better. */
  pages?: boolean;
  /** At most this many characters of its text (90,000 unless set). */
  maxChars?: number;
  /** Where relative paths start, and where a Library document is written out. */
  cwd?: string;
  db?: DB;
  signal?: AbortSignal;
}

/** Text cut to the most asked for, in parts. */
function withText(p: PaperRead, text: string, source: string, o: ReadOptions, pages = 0): PaperRead {
  const max = o.maxChars ?? 90_000;
  const cut = text.length > max;
  const t = cut ? `${text.slice(0, max)}\n\n[… the rest of the paper (${(text.length - max).toLocaleString('en-US')} more characters) was left out]` : text;
  return { ...p, source, parts: partsOf(t), chars: text.length, pages, sections: p.sections.length ? p.sections : sectionsOf(text), notes: cut ? [...p.notes, `Only its first ${max.toLocaleString('en-US')} characters were kept.`] : p.notes };
}

/** A PDF (a file, or bytes fetched) as text with its pages marked. */
async function pdfText(file: string): Promise<{ text: string; pages: number; first: string }> {
  const pages = await pdfPages(file);
  if (!pages.some((p) => p.replace(/\s+/g, '').length > 30)) throw new Error('The PDF has no text: it is probably scanned.');
  return { text: pagedText(pages), pages: pages.length, first: pages[0] ?? '' };
}

/** A PDF at an address: fetched into a scratch file and read. */
async function remotePdf(url: string, signal?: AbortSignal): Promise<{ text: string; pages: number; first: string } | null> {
  const g = await get(url, { accept: 'application/pdf,*/*', signal, timeoutMs: 60_000 });
  if (g.status >= 400 || !isPdf(g)) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-paper-'));
  try {
    const f = path.join(dir, 'paper.pdf');
    fs.writeFileSync(f, g.body);
    return await pdfText(f);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** arXiv's HTML version of a paper as Markdown (most papers since late 2023 have one). */
async function arxivHtml(id: string, signal?: AbortSignal): Promise<string> {
  const g = await get(`https://arxiv.org/html/${id}`, { accept: 'text/html', signal, timeoutMs: 40_000 });
  if (g.status >= 400 || !/html/i.test(g.type)) return '';
  const md = htmlMarkdown(g.text(), g.url).markdown;
  // A page that only says there is no HTML version, or one that came out nearly empty.
  return md.length > 4000 && !/No HTML for|HTML is not available/i.test(md.slice(0, 2000)) ? md : '';
}

/** Merges what one source knows into what is known: the first value of each field stands. */
function fill(p: PaperRead, r: Partial<PaperRecord>): PaperRead {
  const out = { ...p };
  for (const k of ['title', 'year', 'venue', 'doi', 'arxiv', 'url', 'pdf', 'abstract', 'bibtex', 'key'] as const) if (!out[k] && r[k]) out[k] = String(r[k]);
  if (!out.authors.length && r.authors?.length) out.authors = r.authors;
  return out;
}

/** A record's BibTeX when no source gave one: made from what it knows. */
function withBib(p: PaperRead): PaperRead {
  if (p.bibtex || !p.title) return p;
  return { ...p, ...bibOfRecord(p) };
}

/** An arXiv paper: its record, and its text (the HTML version, else the PDF; the PDF first when pages are wanted). */
async function readArxiv(id: string, o: ReadOptions, p: PaperRead = blankRead('arxiv')): Promise<PaperRead> {
  const rec = await arxivRecord(id, o.signal);
  if (!rec) return { ...p, notes: [...p.notes, `arXiv has no paper ${id}.`] };
  let out: PaperRead = fill({ ...p, found: true }, rec);
  out.sourceUrl = `https://arxiv.org/e-print/${rec.arxiv}`;
  if (!o.text) return out;
  const tryPdf = async () => {
    const t = await remotePdf(`https://arxiv.org/pdf/${rec.arxiv}`, o.signal).catch(() => null);
    return t ? withText(out, t.text, 'arXiv’s PDF', o, t.pages) : null;
  };
  const tryHtml = async () => {
    const md = await arxivHtml(rec.arxiv, o.signal).catch(() => '');
    return md ? withText(out, md, 'arXiv’s HTML version', o) : null;
  };
  const got = o.pages ? ((await tryPdf()) ?? (await tryHtml())) : ((await tryHtml()) ?? (await tryPdf()));
  if (got) return got;
  out = { ...out, notes: [...out.notes, 'arXiv’s copy could not be read just now: only its abstract is here.'] };
  return out.abstract ? withText(out, `Abstract\n\n${out.abstract}`, 'its abstract only', o) : out;
}

/** A paper by its DOI: Crossref's record (and doi.org's BibTeX), then an open copy (an arXiv version first). */
async function readDoi(doi: string, o: ReadOptions, p: PaperRead = blankRead('doi')): Promise<PaperRead> {
  const [work, alex, bib] = await Promise.all([crossrefWork(doi, o.signal).catch(() => null), openAlexWork(doi, o.signal).catch(() => null), bibOfDoi(doi, o.signal).catch(() => '')]);
  let out = p;
  if (work) out = fill(out, recordOfCrossref(work));
  if (alex)
    out = fill(out, {
      title: alex.display_name ?? '',
      year: alex.publication_year ? String(alex.publication_year) : '',
      authors: (alex.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
      venue: alex.primary_location?.source?.display_name ?? '',
      abstract: invertedAbstract(alex.abstract_inverted_index),
      url: `https://doi.org/${doi}`,
    });
  const e = bib ? parseBibEntry(bib) : null;
  if (e) {
    const c = cleanBibEntry(e);
    const key = bibKeyFor(c);
    out = fill(out, { ...recordOfBib(c), bibtex: bibText({ ...c, key }), key });
  }
  if (!out.title) return { ...out, doi, notes: [...out.notes, `No record was found for the DOI ${doi}.`] };
  out = withBib({ ...out, found: true, doi });
  const copies = openCopies(alex);
  if (copies.arxiv && !out.arxiv) out.arxiv = copies.arxiv;
  if (!o.text) return { ...out, pdf: out.pdf || copies.pdfs[0] || '' };
  // An arXiv version reads best (its HTML, or a PDF with the pages as arXiv has them).
  if (copies.arxiv) {
    const ax = await readArxiv(copies.arxiv, o, { ...out, kind: 'doi' }).catch(() => null);
    if (ax?.parts.length && ax.source !== 'its abstract only') return { ...ax, title: out.title, venue: out.venue || ax.venue, doi, bibtex: out.bibtex || ax.bibtex, key: out.key || ax.key, notes: [...ax.notes, 'Read from its arXiv version: check numbers you quote against the published one.'] };
  }
  const extra = await unpaywall(doi, o.signal);
  for (const u of [...copies.pdfs, ...copies.pages, ...(extra ? [extra] : [])]) {
    const t = await remotePdf(u, o.signal).catch(() => null);
    if (t) return withText({ ...out, pdf: u }, t.text, 'an open copy', o, t.pages);
  }
  for (const u of copies.pages) {
    const g = await get(u, { accept: 'text/html', signal: o.signal }).catch(() => null);
    if (g && g.status < 400 && /html/i.test(g.type)) {
      const md = htmlMarkdown(g.text(), g.url).markdown;
      if (md.length > 6000) return withText({ ...out, url: out.url || u }, md, 'an open copy', o);
    }
  }
  const note = 'No open copy was found: only its record and abstract are here. If you can get the PDF (a library, the authors), give it instead.';
  return out.abstract ? withText({ ...out, notes: [...out.notes, note] }, `Abstract\n\n${out.abstract}`, 'its abstract only', o) : { ...out, notes: [...out.notes, note] };
}

/** A paper whose title is all there is: found by it, else kept as given. */
async function readTitle(words: string, o: ReadOptions, p: PaperRead = blankRead('title')): Promise<PaperRead> {
  const hit = await byTitle(words, o.signal).catch(() => null);
  if (hit?.arxiv) return readArxiv(hit.arxiv, o, { ...p, kind: p.kind });
  if (hit?.doi) return readDoi(hit.doi, o, { ...p, kind: p.kind });
  return { ...p, title: p.title || words, notes: [...p.notes, `No paper titled “${words.slice(0, 120)}” was found in Crossref or arXiv.`] };
}

/** A PDF on this computer: its text, and its record found by an id in it, else by its title. */
async function readLocalPdf(file: string, o: ReadOptions): Promise<PaperRead> {
  let p: PaperRead = { ...blankRead('pdf'), pdf: file };
  let t: { text: string; pages: number; first: string };
  try {
    t = await pdfText(file);
  } catch (e) {
    return { ...p, notes: [(e as Error).message] };
  }
  // Its record: an arXiv id in its margin, or a DOI on its first page; else its title.
  const head = t.text.slice(0, 6000);
  const ax = arxivIn(/arXiv:\s*\d{4}\.\d{4,5}(v\d+)?/i.exec(head)?.[0] ?? '');
  const doi = doiIn(/(?:doi[:.\s]*|doi\.org\/)\s*(10\.\d{4,9}\/\S+)/i.exec(head)?.[1] ?? '');
  const guess = (await pdfTitle(file)) || titleFromFirstPage(t.first);
  const meta = { ...o, text: false };
  const found = ax ? await readArxiv(ax, meta).catch(() => null) : doi ? await readDoi(doi, meta).catch(() => null) : guess ? await readTitle(guess, meta).catch(() => null) : null;
  if (found?.found && (!guess || titleLike(guess, found.title) > 0.5 || ax || doi)) p = { ...fill(p, found), found: true, sourceUrl: found.sourceUrl };
  else p = withBib({ ...p, found: true, title: guess || path.basename(file, '.pdf'), notes: guess ? [`Its record was not found online: the title is read from the PDF (“${guess.slice(0, 120)}”).`] : [] });
  p.pdf = file;
  return o.text === false ? p : withText(p, t.text, 'the PDF', o, t.pages);
}

/** The <meta name content> tags of a page, names in small letters. */
export function metaTags(html: string): { name: string; content: string }[] {
  const out: { name: string; content: string }[] = [];
  for (const m of html.slice(0, 600_000).matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? '';
    const name = (attrs.name ?? attrs.property ?? '').toLowerCase();
    if (name && attrs.content !== undefined) out.push({ name, content: xml(attrs.content) });
  }
  return out;
}

/** A link: arXiv's and DOIs by their records, ACL Anthology's and OpenReview's by theirs, a PDF read as it is, another page by its citation_ tags. */
async function readUrl(url: string, o: ReadOptions): Promise<PaperRead> {
  const p = { ...blankRead('url'), url };
  const acl = /aclanthology\.org\/([A-Za-z0-9.-]+?)(?:\.pdf|\.bib)?\/?$/i.exec(url);
  if (acl && /\d/.test(acl[1])) {
    const id = acl[1];
    const bib = await get(`https://aclanthology.org/${id}.bib`, { accept: 'text/plain', max: 200_000, signal: o.signal }).catch(() => null);
    const e = bib && bib.status < 400 ? parseBibEntry(bib.text()) : null;
    let out: PaperRead = { ...p, url: `https://aclanthology.org/${id}/`, pdf: `https://aclanthology.org/${id}.pdf` };
    if (e) {
      const c = cleanBibEntry(e);
      out = { ...fill(out, { ...recordOfBib(c), bibtex: bibText(c), key: c.key }), found: true };
    }
    if (!o.text) return out;
    const t = await remotePdf(out.pdf, o.signal).catch(() => null);
    return t ? withText({ ...out, found: true }, t.text, 'the ACL Anthology’s PDF', o, t.pages) : { ...out, notes: [...out.notes, 'Its PDF could not be read just now.'] };
  }
  const or = /openreview\.net\/(?:forum|pdf)\?id=([A-Za-z0-9_-]+)/i.exec(url);
  if (or) {
    const id = or[1];
    let out: PaperRead = { ...p, url: `https://openreview.net/forum?id=${id}`, pdf: `https://openreview.net/pdf?id=${id}` };
    const j = await getJson<{ notes?: { content?: Record<string, { value?: unknown } | unknown> }[] }>(`https://api2.openreview.net/notes?id=${encodeURIComponent(id)}`, o.signal).catch(() => null);
    const c = j?.notes?.[0]?.content;
    if (c) {
      const v = (k: string) => {
        const x = c[k] as { value?: unknown } | unknown;
        return x && typeof x === 'object' && 'value' in (x as object) ? (x as { value?: unknown }).value : x;
      };
      const venue = String(v('venue') ?? '');
      out = withBib({
        ...out,
        found: true,
        title: String(v('title') ?? ''),
        authors: Array.isArray(v('authors')) ? (v('authors') as unknown[]).map(String) : [],
        abstract: String(v('abstract') ?? ''),
        venue: /submitted|withdrawn|rejected/i.test(venue) ? 'OpenReview' : venue,
        year: /\b(20\d\d)\b/.exec(venue)?.[1] ?? '',
      });
    }
    if (!o.text) return out;
    const t = await remotePdf(out.pdf, o.signal).catch(() => null);
    return t ? withText({ ...out, found: true }, t.text, 'OpenReview’s PDF', o, t.pages) : { ...out, notes: [...out.notes, 'Its PDF could not be read just now.'] };
  }
  const g = await get(url, { accept: 'text/html,application/pdf,*/*', signal: o.signal, timeoutMs: 40_000 }).catch((e) => e as Error);
  if (g instanceof Error) return { ...p, notes: [`${url} could not be read: ${g.message}.`] };
  if (g.status >= 400) return { ...p, notes: [`The site answered ${g.status} for ${url}: it may be behind a paywall or keep programs out.`] };
  if (isPdf(g)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-paper-'));
    try {
      const f = path.join(dir, 'paper.pdf');
      fs.writeFileSync(f, g.body);
      const local = await readLocalPdf(f, o);
      return { ...local, kind: 'url', pdf: url, url: local.url || url };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  // A paper's page: what its citation_ tags (Google Scholar's) say, then its DOI's record and an open copy.
  const html = g.text();
  const tags = metaTags(html);
  const meta = (name: string) => tags.filter((t) => t.name === name.toLowerCase()).map((t) => t.content);
  const doi = doiIn(meta('citation_doi')[0] ?? meta('dc.identifier')[0] ?? '') || doiIn(g.url);
  const ax = arxivIn(meta('citation_arxiv_id')[0] ?? '');
  if (ax) return { ...(await readArxiv(ax, o, { ...p })), url };
  const pdfUrl = meta('citation_pdf_url')[0] ?? '';
  let out: PaperRead = {
    ...p,
    title: meta('citation_title')[0] ?? '',
    authors: meta('citation_author').map((a) => (a.includes(',') ? `${a.split(',')[1].trim()} ${a.split(',')[0].trim()}` : a)),
    year: /\d{4}/.exec(meta('citation_publication_date')[0] ?? meta('citation_date')[0] ?? '')?.[0] ?? '',
    venue: meta('citation_conference_title')[0] ?? meta('citation_journal_title')[0] ?? '',
    abstract: meta('citation_abstract')[0] ?? '',
  };
  if (doi) {
    const d = await readDoi(doi, { ...o, text: false }).catch(() => null);
    if (d?.found) out = { ...fill(out, d), found: true };
  }
  if (out.title) out = withBib({ ...out, found: true });
  if (!o.text) return out;
  if (pdfUrl) {
    const t = await remotePdf(new URL(pdfUrl, g.url).href, o.signal).catch(() => null);
    if (t) return withText({ ...out, pdf: new URL(pdfUrl, g.url).href, found: true }, t.text, 'the PDF on its page', o, t.pages);
  }
  if (doi) {
    const d = await readDoi(doi, o).catch(() => null);
    if (d?.parts.length) return { ...d, kind: 'url', url };
  }
  const md = htmlMarkdown(html, g.url);
  const title = out.title || md.title || '';
  return withText({ ...out, title, found: !!title || md.markdown.length > 2000 }, md.markdown, 'its page', o);
}

/**
 * A paper, from whatever was given for it (an upload, when there is one, comes first). `text: false` reads its record
 * only (quicker: what a reading list keeps); otherwise its text too, from an open copy or the file.
 */
export async function readPaper(given: { paper?: string; upload?: string }, o: ReadOptions = {}): Promise<PaperRead> {
  const cwd = o.cwd ?? process.cwd();
  const raw = String(given.upload || given.paper || '').trim();
  if (!raw) return { ...blankRead('title'), notes: ['Say which paper: a link, an arXiv id, a DOI, a title, or a PDF or LaTeX file on this computer.'] };
  const q = given.upload ? ({ kind: 'path', path: path.resolve(cwd, given.upload) } as PaperQuery) : paperQuery(raw, cwd);
  const opts = { text: true, ...o };
  switch (q.kind) {
    case 'path': {
      const st = fs.statSync(q.path, { throwIfNoEntry: false });
      if (!st) return { ...blankRead('pdf'), notes: [`There is no file ${q.path}.`] };
      if (st.isDirectory() || /\.(tex|ltx)$/i.test(q.path)) return latexPaper(q.path);
      if (/\.pdf$/i.test(q.path) || fs.readFileSync(q.path).subarray(0, 5).toString() === '%PDF-') return readLocalPdf(q.path, opts);
      return { ...blankRead('pdf'), notes: [`${path.basename(q.path)} is not a PDF or a LaTeX file.`] };
    }
    case 'library': {
      if (!o.db) return { ...blankRead('library'), notes: ['A Library document cannot be read here.'] };
      const dir = libraryTex(o.db, q.id, cwd);
      if (!dir) return { ...blankRead('library'), notes: [`${raw} is not a LaTeX document of your Library.`] };
      return { ...latexPaper(dir), kind: 'library', url: raw };
    }
    case 'arxiv':
      return readArxiv(q.id, opts);
    case 'doi':
      return readDoi(q.doi, opts);
    case 'url':
      return readUrl(q.url, opts);
    default:
      return readTitle(q.words, opts);
  }
}

/** A family name and year to tell a paper by in a line ("Vaswani et al., 2017"). */
export function shortCite(r: Pick<PaperRecord, 'authors' | 'year' | 'title'>): string {
  const fam = familyNames(r.authors.join(' and '));
  const who = fam.length > 2 ? `${fam[0]} et al.` : fam.join(' and ');
  return [who, r.year].filter(Boolean).join(', ') || r.title.slice(0, 60);
}
