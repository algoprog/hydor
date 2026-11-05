// A paper's references looked up on the web for the pre-submission check: each entry found by its DOI (Crossref, then
// DataCite and doi.org for the DOIs Crossref does not have), its arXiv id (arXiv's own API, asked for many at once),
// or else its title (Crossref and OpenAlex; DBLP only as a last try, as it shows programs from some places a check
// they cannot pass); then compared with what it says (the title, the authors' family names, the year, where it
// appeared); and a preprint looked for in a published version since (the DOI and journal its authors gave arXiv,
// Crossref by its title and first author, OpenAlex, then Semantic Scholar, which often answers programs without a key
// with "too many requests").
//
// Every service is asked gently: one request at a time from each, a pause between them (arXiv asks for three
// seconds), once more after "too many requests", and never again in the same check once it would not answer. What
// each said is kept for days (by DOI, id or title), so checking again asks little. A service that could not be asked
// is said in the check's notes; a paper found nowhere is said carefully, as one that may not exist.
import type { DB } from '../db.ts';
import { cleanBibValue } from '../../shared/latex-bib.ts';
import { bibAuthors, bibField, lastWord, plainWords, titleLikeness, type BibItem } from './latex-paper.ts';

export interface PaperRecord {
  source: 'crossref' | 'datacite' | 'doi' | 'arxiv' | 'openalex' | 'semanticscholar' | 'dblp';
  title: string;
  /** The authors, in order: family and given names. */
  names: { family: string; given?: string }[];
  year?: number;
  /** On arXiv: the years of its first and latest versions. */
  years?: [number, number];
  venue?: string;
  kind?: 'journal' | 'conference' | 'preprint' | 'book' | 'chapter' | 'thesis' | 'report' | 'other';
  doi?: string;
  arxiv?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  /** On arXiv: the published version its authors named (a journal reference, a DOI). */
  journalRef?: string;
  url?: string;
}

type Service = 'crossref' | 'datacite' | 'doi' | 'arxiv' | 'openalex' | 'semanticscholar' | 'dblp';

const SERVICE_NAME: Record<Service, string> = {
  crossref: 'Crossref',
  datacite: 'DataCite',
  doi: 'doi.org',
  arxiv: 'arXiv',
  openalex: 'OpenAlex',
  semanticscholar: 'Semantic Scholar',
  dblp: 'DBLP',
};

/** The pause between two requests to each service, in milliseconds. */
const GAP: Record<Service, number> = { crossref: 150, datacite: 200, doi: 200, arxiv: 3100, openalex: 150, semanticscholar: 1100, dblp: 1500 };

// Header values are plain ASCII (fetch refuses others).
const UA = 'Hydor/1 (pre-submission check of references; https://hydor.app)';
const TIMEOUT = 15_000;
const MAX_BYTES = 3_000_000;
const DAY = 86_400_000;

// ---- what services said, kept for days --------------------------------------------------------------------------

const ready = new WeakSet<DB>();

function cacheGet<T>(db: DB, key: string): { v: T } | null {
  if (!ready.has(db)) {
    db.exec('create table if not exists tex_ref_cache (k text primary key, at integer not null, ttl integer not null, v text not null)');
    ready.add(db);
  }
  const row = db.prepare('select at, ttl, v from tex_ref_cache where k = ?').get(key) as { at: number; ttl: number; v: string } | undefined;
  if (!row || Date.now() - row.at > row.ttl) return null;
  try {
    return { v: JSON.parse(row.v) as T };
  } catch {
    return null;
  }
}

function cachePut(db: DB, key: string, v: unknown, ttl: number) {
  if (!ready.has(db)) cacheGet(db, '');
  db.prepare('insert into tex_ref_cache (k, at, ttl, v) values (?, ?, ?, ?) on conflict(k) do update set at = excluded.at, ttl = excluded.ttl, v = excluded.v').run(key, Date.now(), ttl, JSON.stringify(v));
  // Now and then, what is long past its time goes.
  if (Math.random() < 0.02) db.prepare('delete from tex_ref_cache where at + ttl < ?').run(Date.now());
}

/** One request to each service at a time, the service's pause between their starts. */
const gates = new Map<Service, Promise<void>>();
async function gate(s: Service, signal?: AbortSignal) {
  const before = gates.get(s) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  gates.set(
    s,
    before.then(() => mine),
  );
  await before;
  if (signal?.aborted) {
    release();
    throw new Error('stopped');
  }
  setTimeout(release, GAP[s]);
}

export interface LookupOptions {
  db: DB;
  /** A stand-in for the web (the tests' canned answers). */
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Semantic Scholar's key, where there is one (SEMANTIC_SCHOLAR_API_KEY). */
  s2Key?: string;
}

/** The lookups of one check: what could not be asked is gathered in `notes`. */
export class Lookup {
  notes = new Set<string>();
  private down = new Set<Service>();
  private asked = 0;
  constructor(private o: LookupOptions) {}

  /** How many requests went out (the tests count them). */
  get requests() {
    return this.asked;
  }

  /** Whether these services have all answered so far (none was given up on). */
  answering(...s: Service[]) {
    return s.every((x) => !this.down.has(x));
  }

  private async get(s: Service, url: string, accept = 'application/json', headers: Record<string, string> = {}): Promise<{ status: number; text: string } | null> {
    if (this.down.has(s)) return null;
    const f = this.o.fetch ?? fetch;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await gate(s, this.o.signal);
        this.asked++;
        const signal = this.o.signal ? AbortSignal.any([this.o.signal, AbortSignal.timeout(TIMEOUT)]) : AbortSignal.timeout(TIMEOUT);
        const r = await f(url, { headers: { 'user-agent': UA, accept, ...headers }, signal, redirect: 'follow' });
        if (r.status === 429 || r.status >= 500) {
          if (attempt === 0) {
            const wait = Math.min(5, Number(r.headers.get('retry-after')) || (r.status === 429 ? 2 : 1));
            await new Promise((ok) => setTimeout(ok, wait * 1000));
            continue;
          }
          this.giveUp(s, r.status === 429 ? 'it answered “too many requests”' : `it answered ${r.status}`);
          return null;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        if (r.body) {
          for await (const c of r.body as unknown as AsyncIterable<Uint8Array>) {
            const b = Buffer.from(c);
            size += b.length;
            if (size > MAX_BYTES) break;
            chunks.push(b);
          }
        }
        return { status: r.status, text: Buffer.concat(chunks).toString('utf8') };
      } catch (e) {
        if (this.o.signal?.aborted) throw new Error('stopped');
        if (attempt === 0) continue;
        this.giveUp(s, (e as Error).name === 'TimeoutError' ? 'it took too long' : 'it could not be reached');
        return null;
      }
    }
    return null;
  }

  private giveUp(s: Service, why: string) {
    this.down.add(s);
    this.notes.add(`${SERVICE_NAME[s]} could not be asked (${why}), so what only it knows was not checked.`);
  }

  private async json<T>(s: Service, url: string, headers?: Record<string, string>): Promise<{ status: number; data: T | null } | null> {
    const r = await this.get(s, url, 'application/json', headers);
    if (!r) return null;
    if (r.status >= 400) return { status: r.status, data: null };
    try {
      return { status: r.status, data: JSON.parse(r.text) as T };
    } catch {
      // DBLP answers programs it does not trust with a page to prove they are people.
      if (s === 'dblp') this.giveUp(s, 'it asked for a check that programs cannot pass');
      return { status: r.status, data: null };
    }
  }

  // ---- by DOI ---------------------------------------------------------------------------------------------------

  /** A DOI's paper: Crossref's record, else DataCite's, else only that doi.org knows it; null when no one knows the DOI; undefined when it could not be asked. */
  async byDoi(doiIn: string): Promise<PaperRecord | null | undefined> {
    const doi = doiIn.toLowerCase();
    const key = `doi:${doi}`;
    const hit = cacheGet<PaperRecord | { none: true }>(this.o.db, key);
    if (hit) return 'none' in hit.v ? null : hit.v;
    const enc = doi.split('/').map(encodeURIComponent).join('/');
    const cr = await this.json<{ message?: CrossrefItem }>('crossref', `https://api.crossref.org/works/${enc}`);
    let rec: PaperRecord | null | undefined;
    if (cr?.data?.message) rec = crossrefRecord(cr.data.message);
    else if (cr?.status === 404) {
      const dc = await this.json<{ data?: { attributes?: DataciteAttrs } }>('datacite', `https://api.datacite.org/dois/${enc}`);
      if (dc?.data?.data?.attributes) rec = dataciteRecord(dc.data.data.attributes, doi);
      else if (dc?.status === 404 || !dc) {
        const h = await this.json<{ responseCode?: number }>('doi', `https://doi.org/api/handles/${enc}`);
        rec = h?.data?.responseCode === 1 ? { source: 'doi', title: '', names: [], doi } : h ? null : undefined;
      }
    }
    if (rec === undefined) return undefined;
    cachePut(this.o.db, key, rec ?? { none: true }, rec ? 14 * DAY : 3 * DAY);
    return rec;
  }

  // ---- by arXiv id --------------------------------------------------------------------------------------------------

  /** arXiv's records of these ids (no version), many to a request; null for an id arXiv does not have. Missing: it could not be asked. */
  async byArxiv(ids: string[]): Promise<Map<string, PaperRecord | null>> {
    const out = new Map<string, PaperRecord | null>();
    const todo: string[] = [];
    for (const id of new Set(ids)) {
      const hit = cacheGet<PaperRecord | { none: true }>(this.o.db, `arxiv:${id}`);
      if (hit) out.set(id, 'none' in hit.v ? null : hit.v);
      else todo.push(id);
    }
    for (let i = 0; i < todo.length; i += 40) {
      const batch = todo.slice(i, i + 40);
      const r = await this.get('arxiv', `https://export.arxiv.org/api/query?id_list=${batch.map(encodeURIComponent).join(',')}&max_results=${batch.length}`, 'application/atom+xml');
      if (!r || r.status >= 400) {
        if (r) this.notes.add(`arXiv answered ${r.status}, so some arXiv papers were not checked.`);
        continue;
      }
      const got = arxivRecords(r.text);
      for (const id of batch) {
        const rec = got.get(id) ?? null;
        out.set(id, rec);
        cachePut(this.o.db, `arxiv:${id}`, rec ?? { none: true }, rec ? 14 * DAY : 3 * DAY);
      }
    }
    return out;
  }

  // ---- by title ---------------------------------------------------------------------------------------------------

  /** Papers with about this title: Crossref's and OpenAlex's (DBLP's when neither has one), the most alike first. */
  async byTitle(title: string, first?: string): Promise<PaperRecord[]> {
    const key = `title:${plainWords(title)}|${first ?? ''}`;
    const hit = cacheGet<PaperRecord[]>(this.o.db, key);
    if (hit) return hit.v;
    const q = encodeURIComponent(`${plainWords(title)}${first ? ` ${first}` : ''}`.slice(0, 300));
    const select = 'DOI,type,title,author,issued,container-title,publisher,volume,issue,page,event';
    const cr = await this.json<{ message?: { items?: CrossrefItem[] } }>('crossref', `https://api.crossref.org/works?rows=5&select=${select}&query.bibliographic=${q}`);
    const found: PaperRecord[] = (cr?.data?.message?.items ?? []).map(crossrefRecord).filter((r): r is PaperRecord => !!r);
    const oa = await this.json<{ results?: OpenAlexWork[] }>('openalex', `https://api.openalex.org/works?per-page=5&search=${encodeURIComponent(plainWords(title).slice(0, 300))}`);
    found.push(...(oa?.data?.results ?? []).map(openAlexRecord).filter((r): r is PaperRecord => !!r));
    const close = found.filter((r) => titleLikeness(r.title, title) >= 0.85);
    if (!close.length && !this.down.has('dblp')) {
      const db = await this.json<DblpAnswer>('dblp', `https://dblp.org/search/publ/api?format=json&h=5&q=${encodeURIComponent(plainWords(title).slice(0, 200))}`);
      found.push(...dblpRecords(db?.data));
    }
    const sorted = found.sort((a, b) => titleLikeness(b.title, title) - titleLikeness(a.title, title));
    // Only an answer from every service asked is kept (a service that could not be asked would make it look missing).
    if (cr && oa) cachePut(this.o.db, key, sorted, 7 * DAY);
    return sorted;
  }

  // ---- a preprint published since ---------------------------------------------------------------------------------

  /** The published version of a preprint (a record of arXiv's, or one found by title), or null. */
  async published(pre: PaperRecord): Promise<PaperRecord | null> {
    const key = `published:${pre.arxiv ?? plainWords(pre.title)}`;
    const hit = cacheGet<PaperRecord | { none: true }>(this.o.db, key);
    if (hit) return 'none' in hit.v ? null : hit.v;
    const first = pre.names[0] ? lastWord(pre.names[0].family) : '';
    const same = (r: PaperRecord) =>
      titleLikeness(r.title, pre.title) >= 0.9 && (!first || !r.names.length || r.names.some((n) => lastWord(n.family) === first)) && r.kind !== 'preprint' && !(r.doi && /^10\.48550\//i.test(r.doi));
    let found: PaperRecord | null = null;
    let askedAll = true;
    // What its authors told arXiv.
    if (pre.doi && !/^10\.48550\//i.test(pre.doi)) {
      const r = await this.byDoi(pre.doi);
      if (r && r.title) found = r;
      else if (r === undefined) askedAll = false;
    }
    if (!found) {
      const select = 'DOI,type,title,author,issued,container-title,publisher,volume,issue,page,event';
      const q = encodeURIComponent(`${plainWords(pre.title)}${first ? ` ${first}` : ''}`.slice(0, 300));
      const cr = await this.json<{ message?: { items?: CrossrefItem[] } }>('crossref', `https://api.crossref.org/works?rows=5&select=${select}&filter=type:journal-article,type:proceedings-article,type:book-chapter&query.bibliographic=${q}`);
      if (!cr) askedAll = false;
      found = (cr?.data?.message?.items ?? []).map(crossrefRecord).find((r): r is PaperRecord => !!r && same(r)) ?? null;
    }
    if (!found) {
      const oa = await this.json<{ results?: OpenAlexWork[] }>('openalex', `https://api.openalex.org/works?per-page=5&search=${encodeURIComponent(plainWords(pre.title).slice(0, 300))}`);
      if (!oa) askedAll = false;
      for (const w of oa?.data?.results ?? []) {
        const r = openAlexPublished(w);
        if (r && same(r)) {
          found = r;
          break;
        }
      }
    }
    if (!found && pre.arxiv) {
      const headers: Record<string, string> = this.o.s2Key ? { 'x-api-key': this.o.s2Key } : {};
      const s2 = await this.json<S2Paper>(
        'semanticscholar',
        `https://api.semanticscholar.org/graph/v1/paper/arXiv:${encodeURIComponent(pre.arxiv)}?fields=title,year,venue,publicationVenue,journal,externalIds,authors,publicationTypes`,
        headers,
      );
      if (!s2) askedAll = false;
      const r = s2?.data ? s2Record(s2.data) : null;
      if (r && r.kind !== 'preprint' && (r.venue || r.doi) && same({ ...r, names: r.names.length ? r.names : pre.names })) found = r;
    }
    if (found || askedAll) cachePut(this.o.db, key, found ?? { none: true }, 7 * DAY);
    return found;
  }
}

// ---- what each service sends, as records ---------------------------------------------------------------------------

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
  event?: { name?: string };
}

const CROSSREF_KIND: Record<string, PaperRecord['kind']> = {
  'journal-article': 'journal',
  'proceedings-article': 'conference',
  'book-chapter': 'chapter',
  book: 'book',
  monograph: 'book',
  'edited-book': 'book',
  dissertation: 'thesis',
  report: 'report',
  'posted-content': 'preprint',
};

const unxml = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

export function crossrefRecord(it: CrossrefItem): PaperRecord | null {
  const title = unxml(it.title?.[0] ?? '');
  if (!title) return null;
  const kind = CROSSREF_KIND[it.type ?? ''] ?? 'other';
  const year = it.issued?.['date-parts']?.[0]?.[0] ?? undefined;
  return {
    source: 'crossref',
    title,
    names: (it.author ?? []).map((a) => (a.family ? { family: a.family, given: a.given } : { family: a.name ?? '' })).filter((n) => n.family),
    year: year ?? undefined,
    venue: unxml(it['container-title']?.[0] ?? it.event?.name ?? '') || undefined,
    kind,
    doi: it.DOI?.toLowerCase(),
    volume: it.volume,
    issue: it.issue,
    pages: it.page,
    publisher: it.publisher,
  };
}

interface DataciteAttrs {
  titles?: { title?: string }[];
  creators?: { familyName?: string; givenName?: string; name?: string }[];
  publicationYear?: number | string;
  publisher?: string | { name?: string };
  types?: { resourceTypeGeneral?: string };
  container?: { title?: string };
}

function dataciteRecord(a: DataciteAttrs, doi: string): PaperRecord {
  const pub = typeof a.publisher === 'string' ? a.publisher : a.publisher?.name;
  return {
    source: 'datacite',
    title: a.titles?.[0]?.title ?? '',
    names: (a.creators ?? []).map((c) => ({ family: c.familyName ?? c.name?.split(',')[0] ?? '', given: c.givenName })).filter((n) => n.family),
    year: Number(a.publicationYear) || undefined,
    venue: a.container?.title || pub || undefined,
    kind: /preprint/i.test(a.types?.resourceTypeGeneral ?? '') ? 'preprint' : 'other',
    doi,
    publisher: pub,
  };
}

/** The family and given names of "Given Family" (as arXiv and DBLP write them). */
function splitName(full: string): { family: string; given?: string } {
  const words = full.replace(/\s+\d{4}$/, '').trim().split(/\s+/);
  if (words.length === 1) return { family: words[0] };
  return { family: words[words.length - 1], given: words.slice(0, -1).join(' ') };
}

/** arXiv's Atom feed: each paper by its id (without its version). */
export function arxivRecords(feed: string): Map<string, PaperRecord> {
  const out = new Map<string, PaperRecord>();
  for (const m of feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1];
    const tag = (name: string) => unxml(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(body)?.[1] ?? '');
    const idUrl = tag('id');
    if (/api\/errors/.test(idUrl)) continue;
    const id = /arxiv\.org\/abs\/(.+?)(v\d+)?$/.exec(idUrl)?.[1];
    if (!id) continue;
    const y1 = Number(/^(\d{4})/.exec(tag('published'))?.[1]) || undefined;
    const y2 = Number(/^(\d{4})/.exec(tag('updated'))?.[1]) || y1;
    out.set(id, {
      source: 'arxiv',
      title: tag('title'),
      names: [...body.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => splitName(unxml(a[1]))),
      year: y1,
      years: y1 && y2 ? [y1, y2] : undefined,
      venue: 'arXiv',
      kind: 'preprint',
      arxiv: id,
      doi: tag('arxiv:doi').toLowerCase() || undefined,
      journalRef: tag('arxiv:journal_ref') || undefined,
      url: `https://arxiv.org/abs/${id}`,
    });
  }
  return out;
}

interface OpenAlexSource {
  display_name?: string;
  type?: string;
}
interface OpenAlexLocation {
  source?: OpenAlexSource | null;
  landing_page_url?: string | null;
  version?: string | null;
}
interface OpenAlexWork {
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  type?: string | null;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: OpenAlexLocation | null;
  locations?: OpenAlexLocation[];
  biblio?: { volume?: string | null; issue?: string | null; first_page?: string | null; last_page?: string | null };
}

const oaDoi = (d?: string | null) => d?.replace(/^https?:\/\/doi\.org\//i, '').toLowerCase() || undefined;

function oaKind(src?: OpenAlexSource | null, type?: string | null): PaperRecord['kind'] {
  if (src?.type === 'journal') return 'journal';
  if (src?.type === 'conference') return 'conference';
  if (src?.type === 'repository' || type === 'preprint') return 'preprint';
  if (type === 'book') return 'book';
  if (type === 'book-chapter') return 'chapter';
  if (type === 'dissertation') return 'thesis';
  return 'other';
}

function openAlexRecord(w: OpenAlexWork): PaperRecord | null {
  const title = w.title ?? w.display_name ?? '';
  if (!title) return null;
  const src = w.primary_location?.source;
  const b = w.biblio;
  return {
    source: 'openalex',
    title,
    names: (w.authorships ?? []).map((a) => splitName(a.author?.display_name ?? '')).filter((n) => n.family),
    year: w.publication_year ?? undefined,
    venue: src?.display_name ?? undefined,
    kind: oaKind(src, w.type),
    doi: oaDoi(w.doi),
    volume: b?.volume ?? undefined,
    issue: b?.issue ?? undefined,
    pages: b?.first_page ? `${b.first_page}${b.last_page && b.last_page !== b.first_page ? `--${b.last_page}` : ''}` : undefined,
  };
}

/** A work's published version as OpenAlex has it: the place it appeared that is a journal or a conference, not a repository. */
function openAlexPublished(w: OpenAlexWork): PaperRecord | null {
  const r = openAlexRecord(w);
  if (!r) return null;
  const loc = [w.primary_location, ...(w.locations ?? [])].find((l) => l?.source && (l.source.type === 'journal' || l.source.type === 'conference') && !/arxiv/i.test(l.source.display_name ?? ''));
  if (!loc?.source) return null;
  return { ...r, venue: loc.source.display_name, kind: loc.source.type === 'journal' ? 'journal' : 'conference', doi: r.doi && !/^10\.48550\//.test(r.doi) ? r.doi : undefined };
}

interface S2Paper {
  title?: string;
  year?: number;
  venue?: string;
  journal?: { name?: string; volume?: string; pages?: string } | null;
  publicationVenue?: { name?: string; type?: string } | null;
  externalIds?: Record<string, string | number>;
  authors?: { name?: string }[];
  publicationTypes?: string[] | null;
}

function s2Record(p: S2Paper): PaperRecord | null {
  if (!p.title) return null;
  const doi = typeof p.externalIds?.DOI === 'string' ? p.externalIds.DOI.toLowerCase() : undefined;
  const venue = p.publicationVenue?.name || p.journal?.name || p.venue || undefined;
  const pre = !venue || /arxiv/i.test(venue) || (doi && /^10\.48550\//.test(doi));
  return {
    source: 'semanticscholar',
    title: p.title,
    names: (p.authors ?? []).map((a) => splitName(a.name ?? '')).filter((n) => n.family),
    year: p.year,
    venue: pre ? undefined : venue,
    kind: pre ? 'preprint' : p.publicationVenue?.type === 'journal' || p.publicationTypes?.includes('JournalArticle') ? 'journal' : 'conference',
    doi: doi && !/^10\.48550\//.test(doi) ? doi : undefined,
    volume: p.journal?.volume,
    pages: p.journal?.pages?.trim(),
  };
}

interface DblpAnswer {
  result?: { hits?: { hit?: { info?: { title?: string; authors?: { author?: { text?: string } | { text?: string }[] }; venue?: string; year?: string; doi?: string; type?: string } }[] } };
}

function dblpRecords(a: DblpAnswer | null | undefined): PaperRecord[] {
  return (a?.result?.hits?.hit ?? []).flatMap((h) => {
    const i = h.info;
    if (!i?.title) return [];
    const list = i.authors?.author;
    const names = (Array.isArray(list) ? list : list ? [list] : []).map((x) => splitName(x.text ?? '')).filter((n) => n.family);
    const pre = /informal|corr/i.test(`${i.type ?? ''} ${i.venue ?? ''}`);
    return [
      {
        source: 'dblp' as const,
        title: i.title.replace(/\.$/, ''),
        names,
        year: Number(i.year) || undefined,
        venue: i.venue,
        kind: (pre ? 'preprint' : /journal/i.test(i.type ?? '') ? 'journal' : 'conference') as PaperRecord['kind'],
        doi: i.doi?.toLowerCase(),
      },
    ];
  });
}

// ---- an entry against a record ---------------------------------------------------------------------------------

/** An entry's DOI, from its doi field or an address at doi.org. */
export function entryDoi(e: BibItem): string | undefined {
  const raw = bibField(e, 'doi') || /doi\.org\/(10\.[^\s}]+)/i.exec(bibField(e, 'url'))?.[1] || '';
  const m = /(10\.\d{4,9}\/[^\s"<>{}]+)/.exec(raw.replace(/\\_/g, '_'));
  return m ? decodeURIComponent(m[1]).replace(/[.,;)\]]+$/, '').toLowerCase() : undefined;
}

const ARXIV_ID = /(?:arxiv[:./\s]*(?:abs\/|pdf\/)?|^)(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/i;

/** An entry's arXiv id (without its version): from eprint, an arXiv DOI, its journal or howpublished ("arXiv preprint arXiv:…"), its address or note. */
export function entryArxiv(e: BibItem): string | undefined {
  const eprint = bibField(e, 'eprint');
  if (eprint && (/arxiv/i.test(bibField(e, 'archiveprefix') + bibField(e, 'eprinttype')) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(eprint.trim()))) {
    const m = ARXIV_ID.exec(eprint.trim());
    if (m) return m[1];
  }
  const doi = entryDoi(e);
  if (doi && /^10\.48550\/arxiv\./i.test(doi)) return doi.replace(/^10\.48550\/arxiv\./i, '');
  for (const f of ['journal', 'howpublished', 'url', 'note', 'booktitle', 'volume']) {
    const v = bibField(e, f);
    if (!/arxiv/i.test(v)) continue;
    const m = /arxiv(?:\.org\/(?:abs|pdf)\/|[:\s]+)\s*(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})/i.exec(v);
    if (m) return m[1];
  }
  return undefined;
}

/** Whether an entry cites a preprint (arXiv, CoRR, a preprint server), not where it was published. */
export function citedAsPreprint(e: BibItem): boolean {
  const venue = `${bibField(e, 'journal')} ${bibField(e, 'journaltitle')} ${bibField(e, 'booktitle')}`.trim();
  if (venue && !/arxiv|corr\b|preprint|biorxiv|medrxiv|ssrn|openreview|techrxiv|chemrxiv|psyarxiv/i.test(venue)) return false;
  return !!entryArxiv(e) || /arxiv|preprint/i.test(`${bibField(e, 'howpublished')} ${bibField(e, 'note')} ${venue}`);
}

/** Words of a venue's name that tell it apart (its acronym, or the long name's own words). */
const VENUE_ALIASES: [string, RegExp][] = [
  ['neurips', /\bneurips\b|\bnips\b|neural information processing systems/],
  ['icml', /\bicml\b|international conference on machine learning/],
  ['iclr', /\biclr\b|learning representations/],
  ['emnlp', /\bemnlp\b|empirical methods in natural language processing/],
  ['naacl', /\bnaacl\b|north american chapter of the association for computational linguistics/],
  ['eacl', /\beacl\b|european chapter of the association for computational linguistics/],
  ['tacl', /\btacl\b|transactions of the association for computational linguistics/],
  ['coling', /\bcoling\b|international conference on computational linguistics/],
  ['acl', /\bacl\b|annual meeting of the association for computational linguistics/],
  ['sigir', /\bsigir\b|research and development in information retrieval/],
  ['cikm', /\bcikm\b|information and knowledge management/],
  ['wsdm', /\bwsdm\b|web search and data mining/],
  ['www', /\bwww\b|world wide web|the web conference|\bthewebconf\b/],
  ['kdd', /\bkdd\b|knowledge discovery and data mining/],
  ['ecir', /\becir\b|european conference on information retrieval/],
  ['ictir', /\bictir\b|theory of information retrieval/],
  ['recsys', /\brecsys\b|recommender systems/],
  ['aaai', /\baaai\b/],
  ['ijcai', /\bijcai\b|international joint conference on artificial intelligence/],
  ['cvpr', /\bcvpr\b|computer vision and pattern recognition/],
  ['iccv', /\biccv\b|international conference on computer vision/],
  ['eccv', /\beccv\b|european conference on computer vision/],
  ['jmlr', /\bjmlr\b|journal of machine learning research/],
  ['tmlr', /\btmlr\b|transactions on machine learning research/],
  ['tois', /\btois\b|transactions on information systems/],
  ['colm', /\bcolm\b|conference on language modeling/],
];

const VENUE_STOP = new Set(['proceedings', 'proc', 'of', 'the', 'on', 'in', 'and', 'for', 'international', 'conference', 'annual', 'meeting', 'workshop', 'acm', 'ieee', 'symposium', 'volume', 'vol', 'part', 'st', 'nd', 'rd', 'th', 'joint', 'findings', 'companion', 'advances']);

/** Whether two names of venues name the same one; null when that cannot be told. */
export function sameVenue(a: string, b: string): boolean | null {
  const pa = plainWords(a);
  const pb = plainWords(b);
  if (!pa || !pb) return null;
  const tags = (s: string) => new Set(VENUE_ALIASES.filter(([, re]) => re.test(s)).map(([t]) => t));
  const ta = tags(pa);
  const tb = tags(pb);
  if (ta.size && tb.size) return [...ta].some((t) => tb.has(t));
  const words = (s: string) => new Set(s.split(' ').filter((w) => w.length > 1 && !VENUE_STOP.has(w) && !/^\d+$/.test(w)));
  const wa = words(pa);
  const wb = words(pb);
  if (wa.size < 2 || wb.size < 2) return null;
  const common = [...wa].filter((w) => wb.has(w)).length;
  return common / Math.min(wa.size, wb.size) >= 0.5 ? true : common === 0 ? false : null;
}

export interface Difference {
  field: 'title' | 'authors' | 'year' | 'venue';
  text: string;
}

/** How an entry differs from a record of the same paper: its title, its authors, its year, where it appeared. */
export function differences(e: BibItem, r: PaperRecord): Difference[] {
  const out: Difference[] = [];
  const from = SERVICE_NAME[r.source];
  const title = bibField(e, 'title');
  if (title && r.title) {
    const like = titleLikeness(title, r.title);
    if (like < 0.9) out.push({ field: 'title', text: `${from} has its title as “${r.title}”` });
  }
  const authorField = bibField(e, 'author');
  if (authorField && r.names.length) {
    const mine = bibAuthors(authorField);
    // The names as the entry writes them, beside their family names (in the same order).
    const written = authorField
      .split(/\s+and\s+/i)
      .map((a) => a.replace(/[{}]/g, '').trim())
      .filter((a) => a && !/^others$/i.test(a));
    const theirs = r.names.map((n) => lastWord(n.family)).filter(Boolean);
    const strangers = mine.families.map((f, i) => ({ f, name: written[i] ?? f })).filter((x) => x.f && !theirs.includes(x.f));
    const list = (l: string[]) => l.slice(0, 3).join(', ') + (l.length > 3 ? ` and ${l.length - 3} more` : '');
    const shown = r.names.slice(0, 4).map((n) => (n.given ? `${n.given} ${n.family}` : n.family));
    const theirList = `${shown.join(', ')}${r.names.length > 4 ? ` and ${r.names.length - 4} more` : ''}`;
    if (strangers.length && mine.families.length > 1 && strangers.length > mine.families.length / 2) out.push({ field: 'authors', text: `its authors are not those ${from} lists (${theirList})` });
    else if (strangers.length) out.push({ field: 'authors', text: `${list(strangers.map((x) => x.name))} ${strangers.length === 1 ? 'is' : 'are'} not among the authors ${from} lists (${theirList})` });
    else if (!mine.cut && mine.families.length < theirs.length) out.push({ field: 'authors', text: `it names ${mine.families.length} of its ${theirs.length} authors (${theirList})` });
    else if (mine.families[0] && theirs[0] && mine.families[0] !== theirs[0]) out.push({ field: 'authors', text: `${from} lists ${shown[0]} as its first author` });
  }
  const year = Number(/\d{4}/.exec(bibField(e, 'year') || bibField(e, 'date'))?.[0]);
  if (year && (r.years ? year < r.years[0] || year > r.years[1] : r.year && year !== r.year)) out.push({ field: 'year', text: r.years && r.years[0] !== r.years[1] ? `it came out on arXiv in ${r.years[0]} (its latest version ${r.years[1]})` : `${from} has its year as ${r.year ?? r.years?.[0]}` });
  const venue = bibField(e, 'journal') || bibField(e, 'journaltitle') || bibField(e, 'booktitle');
  if (venue && r.venue && (r.kind === 'journal' || r.kind === 'conference') && !citedAsPreprint(e) && sameVenue(venue, r.venue) === false) out.push({ field: 'venue', text: `${from} has it in ${r.venue}` });
  return out;
}

// ---- an entry made right ---------------------------------------------------------------------------------------------

/** The fields that only a preprint has, left out once it is cited where it was published. */
const PREPRINT_ONLY = new Set(['eprint', 'archiveprefix', 'primaryclass', 'eprinttype', 'eprintclass', 'howpublished']);

/**
 * An entry written again with what a record says (under the same key, so the paper's \cite stay as they are): the
 * fields that differ taken from the record, the rest as the user wrote them. With `published`, it becomes the
 * published version: its type, where it appeared, its DOI and pages, and the preprint's own fields left out.
 */
export function entryFrom(text: string, e: BibItem, r: PaperRecord, published = false): string {
  const raw = (name: string) => {
    const f = e.fields.find((x) => x.name === name);
    return f ? text.slice(f.from, f.to).trim() : '';
  };
  const v = (s: string | undefined) => (s ? `{${cleanBibValue(s)}}` : '');
  const fields: [string, string][] = [];
  const authors = r.names.length ? r.names.map((n) => (n.given ? `${n.family}, ${n.given}` : n.family)).join(' and ') : '';
  const keepAuthors = !authors || !differences(e, { ...r, title: '', year: undefined, years: undefined, venue: undefined }).some((d) => d.field === 'authors');
  fields.push(['author', keepAuthors ? raw('author') : v(authors)]);
  const titleOk = !r.title || titleLikeness(bibField(e, 'title'), r.title) >= 0.9;
  // A title as the user wrote it keeps the braces that hold its capitals.
  fields.push(['title', titleOk ? raw('title') : `{${cleanBibValue(r.title)}}`]);
  let type = e.type;
  if (published) {
    type = r.kind === 'journal' ? 'article' : r.kind === 'conference' ? 'inproceedings' : r.kind === 'chapter' ? 'incollection' : r.kind === 'book' ? 'book' : e.type === 'misc' ? 'article' : e.type;
    fields.push([type === 'article' ? 'journal' : 'booktitle', v(r.venue)]);
    fields.push(['year', r.year ? String(r.year) : raw('year')]);
    fields.push(['volume', v(r.volume)], ['number', v(r.issue)], ['pages', v(r.pages?.replace(/\s*[-–—]+\s*/, '--'))], ['publisher', v(r.publisher)], ['doi', r.doi ? `{${r.doi}}` : '']);
  } else {
    const yearWrong = differences(e, { ...r, title: '', names: [], venue: undefined }).some((d) => d.field === 'year');
    fields.push(['year', yearWrong ? String(r.years?.[0] ?? r.year ?? '') : raw('year')]);
    if (!raw('doi') && r.doi && !(r.arxiv && /^10\.48550\//.test(r.doi))) fields.push(['doi', `{${r.doi}}`]);
    // What the entry lacks, from a record of the same kind of paper: where it appeared, its volume, pages, publisher.
    const same = (e.type === 'article' && r.kind === 'journal') || (/^(inproceedings|conference|incollection)$/.test(e.type) && (r.kind === 'conference' || r.kind === 'chapter'));
    if (same) {
      const venueField = e.type === 'article' ? 'journal' : 'booktitle';
      if (!raw(venueField) && !(venueField === 'journal' && raw('journaltitle'))) fields.push([venueField, v(r.venue)]);
      for (const [n, val] of [
        ['volume', r.volume],
        ['number', r.issue],
        ['pages', r.pages?.replace(/\s*[-–—]+\s*/, '--')],
        ['publisher', r.publisher],
      ] as [string, string | undefined][])
        if (!raw(n)) fields.push([n, v(val)]);
    }
  }
  const taken = new Set(fields.map(([n]) => n));
  for (const f of e.fields) {
    if (taken.has(f.name)) continue;
    if (published && (PREPRINT_ONLY.has(f.name) || ((f.name === 'journal' || f.name === 'note' || f.name === 'url') && /arxiv|preprint/i.test(f.value)) || f.name === 'booktitle' || f.name === 'journal'))
      continue;
    fields.push([f.name, text.slice(f.from, f.to).trim()]);
  }
  const shown = fields.filter(([, val]) => val && val !== '{}');
  const width = Math.max(...shown.map(([n]) => n.length));
  return `@${type}{${e.key},\n${shown.map(([n, val]) => `  ${n.padEnd(width)} = ${val}`).join(',\n')}\n}`;
}
