// References for a LaTeX document's bibliography, found on the web for the editor's Insert → Reference: a DOI's BibTeX
// from doi.org (which hands the asking over to Crossref, DataCite and the like), an arXiv paper's entry made from
// arXiv's own record of it, and a search by title or authors in Crossref and arXiv together. Only public addresses are
// reached (every redirect checked again), each with a short timeout and a limit on what it may send back, and nothing
// of the user's files goes out: only the words asked. What comes back is checked as BibTeX, its values made safe for
// TeX, under a key made as people make them ("knuth1984literate").
import { HttpError } from '../auth.ts';
import { assertPublic } from '../web/fetch.ts';
import { bibInfo, bibKeyFor, bibText, cleanBibEntry, parseBibEntry, type BibEntry, type TexReference as RefEntry } from '../../shared/latex-bib.ts';

const UA = 'Hydor/1 (LaTeX references; https://hydor.app)';
const TIMEOUT = 12_000;
const MAX_BYTES = 2_000_000;

/** A public address's text: redirects followed one by one, each checked; `accept` says what is wanted. */
async function getText(url: string, accept: string, signal?: AbortSignal): Promise<{ status: number; text: string }> {
  const all = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(TIMEOUT)]);
  let u = new URL(url);
  for (let hop = 0; hop < 6; hop++) {
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('not a web address');
    await assertPublic(u);
    const r = await fetch(u, { redirect: 'manual', signal: all, headers: { 'user-agent': UA, accept } });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      u = new URL(loc, u);
      continue;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of r.body ?? []) {
      const b = Buffer.from(c as Uint8Array);
      size += b.length;
      if (size > MAX_BYTES) break;
      chunks.push(b);
    }
    return { status: r.status, text: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('too many redirects');
}

export type RefQuery = { kind: 'doi'; doi: string } | { kind: 'arxiv'; id: string } | { kind: 'search'; words: string };

/** What was asked: a DOI (bare, doi:…, or a doi.org address), an arXiv paper (its id, arXiv:…, or an arxiv.org address), or words to search for. */
export function refQuery(raw: string): RefQuery {
  const q = raw.trim();
  const doi = /(?:^|doi\.org\/|doi:\s*)(10\.\d{4,9}\/[^\s"<>]+)/i.exec(q) ?? (/^\s*(10\.\d{4,9}\/\S+)\s*$/.exec(q) as RegExpExecArray | null);
  if (doi && !/arxiv\.org/i.test(q)) return { kind: 'doi', doi: decodeURIComponent(doi[1]).replace(/[.,;)\]]+$/, '') };
  const arxiv = /arxiv\.org\/(?:abs|pdf|html)\/([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(v\d+)?/i.exec(q) ?? /^(?:arxiv:\s*)?([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(v\d+)?$/i.exec(q);
  if (arxiv) return { kind: 'arxiv', id: arxiv[1] + (arxiv[2] ?? '') };
  return { kind: 'search', words: q.replace(/\s+/g, ' ').slice(0, 300) };
}

/** An entry as the editor gets it: checked, its values made safe, keyed as people key them. */
function entryOf(e: BibEntry): RefEntry | null {
  const c = cleanBibEntry(e);
  if (!c.fields.some(([n]) => n === 'title')) return null;
  const key = bibKeyFor(c);
  const info = bibInfo({ ...c, key });
  return { key, bibtex: bibText({ ...c, key }), title: info.title, authors: info.authors, year: info.year, venue: info.venue };
}

async function byDoi(doi: string, signal?: AbortSignal): Promise<RefEntry[]> {
  const r = await getText(`https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`, 'application/x-bibtex; charset=utf-8', signal);
  if (r.status === 404) throw new HttpError(404, `No paper has the DOI ${doi}.`);
  if (r.status >= 400) throw new HttpError(502, `doi.org answered ${r.status} for ${doi}.`);
  const e = parseBibEntry(r.text);
  const out = e && entryOf(e);
  if (!out) throw new HttpError(502, `doi.org sent no BibTeX for ${doi}.`);
  return [out];
}

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

/** arXiv's Atom feed as BibTeX entries. */
function arxivEntries(feed: string): BibEntry[] {
  const out: BibEntry[] = [];
  for (const m of feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1];
    const tag = (name: string) => xml(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(body)?.[1] ?? '');
    const idUrl = tag('id');
    const id = /arxiv\.org\/abs\/(.+?)(v\d+)?$/.exec(idUrl)?.[1];
    if (!id || /api\/errors/.test(idUrl)) continue;
    const authors = [...body.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => xml(a[1]));
    const year = /^(\d{4})/.exec(tag('published'))?.[1] ?? '';
    const cat = /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(body)?.[1] ?? '';
    const doi = tag('arxiv:doi');
    const fields: [string, string][] = [
      ['author', authors.join(' and ')],
      ['title', tag('title')],
      ['year', year],
      ['howpublished', `arXiv:${id}`],
      ['eprint', id],
      ['archiveprefix', 'arXiv'],
      ['primaryclass', cat],
      ['doi', doi],
      ['url', `https://arxiv.org/abs/${id}`],
    ];
    out.push({ type: 'misc', key: '', fields });
  }
  return out;
}

async function byArxiv(id: string, signal?: AbortSignal): Promise<RefEntry[]> {
  const r = await getText(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, 'application/atom+xml', signal);
  if (r.status >= 400) throw new HttpError(502, `arXiv answered ${r.status}.`);
  const list = arxivEntries(r.text)
    .map(entryOf)
    .filter((x): x is RefEntry => !!x);
  if (!list.length) throw new HttpError(404, `arXiv has no paper ${id}.`);
  return list.slice(0, 1);
}

interface CrossrefItem {
  DOI?: string;
  type?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  issued?: { 'date-parts'?: (number | null)[][] };
  'container-title'?: string[];
  publisher?: string;
  volume?: string;
  issue?: string;
  page?: string;
}

const CROSSREF_TYPE: Record<string, [type: string, venue: string]> = {
  'journal-article': ['article', 'journal'],
  'proceedings-article': ['inproceedings', 'booktitle'],
  'book-chapter': ['incollection', 'booktitle'],
  book: ['book', ''],
  monograph: ['book', ''],
  'edited-book': ['book', ''],
  'reference-book': ['book', ''],
  dissertation: ['phdthesis', ''],
  report: ['techreport', ''],
  'posted-content': ['misc', 'howpublished'],
};

/** A Crossref record as a BibTeX entry. */
function crossrefEntry(it: CrossrefItem): BibEntry | null {
  const title = it.title?.[0];
  if (!title) return null;
  const [type, venueField] = CROSSREF_TYPE[it.type ?? ''] ?? ['misc', 'howpublished'];
  const authors = (it.author ?? []).map((a) => (a.family ? (a.given ? `${a.family}, ${a.given}` : a.family) : a.name ? `{${a.name}}` : '')).filter(Boolean);
  const year = it.issued?.['date-parts']?.[0]?.[0];
  const fields: [string, string][] = [
    ['author', authors.join(' and ')],
    ['title', title],
    ['year', year ? String(year) : ''],
    ['volume', it.volume ?? ''],
    ['number', it.issue ?? ''],
    ['pages', it.page ?? ''],
    [type === 'phdthesis' ? 'school' : type === 'techreport' ? 'institution' : 'publisher', it.publisher ?? ''],
    ['doi', it.DOI ?? ''],
  ];
  if (venueField && it['container-title']?.[0]) fields.push([venueField, it['container-title'][0]]);
  return { type, key: '', fields };
}

async function crossrefSearch(words: string, signal?: AbortSignal): Promise<RefEntry[]> {
  const select = 'DOI,type,title,author,issued,container-title,publisher,volume,issue,page';
  const url = `https://api.crossref.org/works?rows=8&select=${select}&query.bibliographic=${encodeURIComponent(words)}`;
  let r = await getText(url, 'application/json', signal);
  // Crossref asks for a moment between searches that come close together: once more, a little later.
  if (r.status === 429) {
    await new Promise((ok) => setTimeout(ok, 1500));
    r = await getText(url, 'application/json', signal);
  }
  if (r.status >= 400) throw new Error(`Crossref answered ${r.status}`);
  const items = (JSON.parse(r.text) as { message?: { items?: CrossrefItem[] } }).message?.items ?? [];
  return items
    .map(crossrefEntry)
    .map((e) => (e ? entryOf(e) : null))
    .filter((x): x is RefEntry => !!x);
}

async function arxivSearch(words: string, signal?: AbortSignal): Promise<RefEntry[]> {
  const terms = words
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
  if (!terms.length) return [];
  const q = terms.map((w) => `all:${w}`).join(' AND ');
  const r = await getText(`https://export.arxiv.org/api/query?max_results=4&search_query=${encodeURIComponent(q)}`, 'application/atom+xml', signal);
  if (r.status >= 400) throw new Error(`arXiv answered ${r.status}`);
  return arxivEntries(r.text)
    .map(entryOf)
    .filter((x): x is RefEntry => !!x);
}

const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The references a query finds: one for a DOI or an arXiv id, up to ten for words (Crossref's first, then arXiv's). */
export async function findReferences(raw: unknown, signal?: AbortSignal): Promise<{ kind: RefQuery['kind']; entries: RefEntry[] }> {
  if (typeof raw !== 'string' || !raw.trim()) throw new HttpError(400, 'Say what to find: a DOI, an arXiv paper, or words of its title or its authors.');
  if (raw.length > 500) throw new HttpError(400, 'That is too long to search for.');
  const q = refQuery(raw);
  try {
    if (q.kind === 'doi') return { kind: q.kind, entries: await byDoi(q.doi, signal) };
    if (q.kind === 'arxiv') return { kind: q.kind, entries: await byArxiv(q.id, signal) };
    const [cr, ax] = await Promise.allSettled([crossrefSearch(q.words, signal), arxivSearch(q.words, signal)]);
    if (cr.status === 'rejected' && ax.status === 'rejected') throw new HttpError(502, `Crossref and arXiv could not be reached (${(cr.reason as Error).message}).`);
    // One entry a title: of copies of a paper (a preprint, a reprint years on), the first one published.
    const byTitle = new Map<string, RefEntry>();
    for (const e of [...(cr.status === 'fulfilled' ? cr.value : []), ...(ax.status === 'fulfilled' ? ax.value : [])]) {
      const k = titleKey(e.title);
      const had = byTitle.get(k);
      if (!had || (e.year && (!had.year || e.year < had.year))) byTitle.set(k, had ? Object.assign(had, e) : e);
    }
    return { kind: q.kind, entries: [...byTitle.values()].slice(0, 10) };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const why = (e as Error).name === 'TimeoutError' ? 'it took too long' : (e as Error).message;
    throw new HttpError(502, `The reference could not be fetched: ${why}.`);
  }
}
