// Reading the filters a search's words state. Agents often write them into the words ("climate reports on
// nasa.gov from last month") instead of setting them, and Naget Search no longer reads them itself, so before
// such a search goes out the app's helper model reads them: which sites, dates, languages, file types, home pages
// and categories the words ask for, and which words are left to search. A search that sets any filter, or whose
// words hold nothing that could state one, is not read at all. Reading is one small, quick helper call that
// never holds a search back: when the helper is busy, slow or failing, the search goes out as written.
import { day, host, ArgError, LANGUAGES } from './args.ts';
import type { Taxonomy } from './naget.ts';
import type { SearchQuery } from './types.ts';

/** The filters (and the words left to search) read from a query's words. */
export type Reading = Omit<SearchQuery, 'k' | 'snippets'>;

/** The helper model, as the reader asks it. */
export type ReaderAsk = (q: { system: string; prompt: string; signal: AbortSignal; timeoutMs: number }) => Promise<string>;

// ---- whether a query might state a filter at all -----------------------------------------------------

const MONTHS = 'january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
const SPAN = '(?:this|last|past|previous|next|coming)(?: \\d+| few| couple of| two| three| six| twelve)? (?:day|week|weekend|month|quarter|year|decade)s?';
const DATES = `\\b(?:1[89]|20)\\d{2}s?\\b|\\b(?:${MONTHS})\\b|\\b(?:today|yesterday|tonight|recent|recently|latest|newest|current|currently|upcoming|since|until|ago)\\b|\\b${SPAN}\\b`;

const EXTRA_LANGUAGES = ['vietnamese', 'thai', 'indonesian', 'romanian', 'hungarian', 'bulgarian', 'persian'];
const LANGUAGE_NAMES = [...new Set([...Object.keys(LANGUAGES), ...EXTRA_LANGUAGES])].join('|');
const LANGUAGE = `\\b(?:(?:in|into) (?:${LANGUAGE_NAMES})|(?:${LANGUAGE_NAMES})[- ]language)\\b`;

const FORMATS = '\\bpdfs?\\b|\\bfiletype\\b|\\bweb ?pages? only\\b';
const HOME_PAGES = '\\bhome ?pages?\\b|\\b(?:official|personal|company|lab|project) (?:web ?)?(?:site|page)s?\\b|\\bwebsites?\\b';

const SITE_NAMES =
  'github|gitlab|reddit|stack ?overflow|stack ?exchange|wikipedia|youtube|twitter|linkedin|medium|substack|hacker news|quora|bbc|cnn|reuters|bloomberg|nytimes|new york times|the guardian|washington post|wsj|financial times|techcrunch|the verge|wired|arxiv|pubmed|ieee|acm';

const KINDS =
  'papers?|study|studies|preprints?|thes[ie]s|dissertations?|journals?|publications?|literature|scholarly|academic|patents?|filings?|10-k|10-q|8-k|news|headlines|docs|documentation|tutorials?|guides?|how-to|recipes?|forums?|threads?|discussions?|q&a|datasets?|data sets?|statistics|videos?|podcasts?|code examples|clinical trials?|case law|court decisions?|encyclopedia|wiki';

/** A word of a cue, not the middle of another word. */
const edge = (alternatives: string) => `(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`;

/** What does not depend on the taxonomy. */
const FIXED = new RegExp(`${DATES}|${LANGUAGE}|${FORMATS}|${HOME_PAGES}|${edge(`${SITE_NAMES}|${KINDS}`)}`, 'iu');

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The collections' ids and labels, once for each taxonomy. */
const COLLECTIONS = new WeakMap<Taxonomy, RegExp | null>();

function collections(t: Taxonomy): RegExp | null {
  let re = COLLECTIONS.get(t);
  if (re !== undefined) return re;
  const names = new Set<string>();
  for (const c of t.categories) {
    if (c.group === 'page_type') continue;
    for (const n of [c.id, c.id.replace(/-/g, ' '), c.label]) if (typeof n === 'string' && n.trim()) names.add(n.trim());
  }
  re = names.size ? new RegExp(edge([...names].sort((a, b) => b.length - a.length).map((n) => escape(n).replace(/-/g, '[- ]')).join('|')), 'iu') : null;
  COLLECTIONS.set(t, re);
  return re;
}

/** Endings of a code or file name ("next.js", "README.md"), which are not sites. */
const FILE_ENDINGS = new Set('js ts jsx tsx py rs go rb md txt json csv xml yaml yml exe so dll cpp java kt swift sh html htm css php pdf'.split(' '));
const DOMAIN = /(?:^|[\s(["'])((?:[a-z0-9-]+\.)+[a-z]{2,})(?=$|[\s,;:!?)\]"'/.])/gi;

function hasDomain(text: string): boolean {
  for (const m of text.matchAll(DOMAIN)) if (!FILE_ENDINGS.has(m[1].slice(m[1].lastIndexOf('.') + 1).toLowerCase())) return true;
  return false;
}

/**
 * Whether a query is worth reading: the agent set no filter (one that did knows what it wants), and the words
 * hold a cue that they might state one (a date, a language, a site, a kind of content).
 */
export function wantsReading(q: SearchQuery, t: Taxonomy): boolean {
  if (q.sites.length || q.excludeSites.length || q.categories.length || q.from || q.to || q.languages.length || q.fileTypes.length || q.homepagesOnly) return false;
  return FIXED.test(q.text) || hasDomain(q.text) || !!collections(t)?.test(q.text);
}

// ---- the question put to the helper ------------------------------------------------------------------

/** YYYY-MM-DD (Weekday), in local time. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A category's description on one line, at most 200 characters, cut at a word. */
function oneLine(s: string): string {
  const v = s.replace(/\s+/g, ' ').trim();
  if (v.length <= 200) return v;
  const cut = v.slice(0, 200);
  const at = cut.lastIndexOf(' ');
  return `${at > 0 ? cut.slice(0, at) : cut}...`;
}

const line = (c: Taxonomy['categories'][number]) => {
  const d = oneLine(c.description ?? '');
  return `- ${c.id} (${c.label})${d ? `: ${d}` : ''}`;
};

const TEMPLATE = `Read a web search query: separate the words to search for from the search filters the query states.

Today is {today}.

Categories that are collections, the curated sources (each holds one kind of record):
{collections}

Categories that are page types, each a kind of page wherever it was found: crawled web pages and the collections its description names:
{page_types}

Return:
- query: the query without the words that only state a filter below (patents by Jane Doe is Jane Doe); keep all other words exactly as written, also the person or organization the documents should be by (an inventor, author or assignee: Google patents on batteries is Google batteries), except that a patent or publication number is written as one word (US 11,694,034 B2 is US11694034B2).
- include_domains / exclude_domains: the sites the query names to search within / to leave out, each written as its full domain name, also when the query gives only the site's name (nature is nature.com, the bbc is bbc.co.uk and bbc.com), or a domain ending such as gov when the query names one. A collection the query names to search within (PubMed, Stack Exchange, European patents) is a category, not a site.
- start_date, end_date: first and last day (YYYY-MM-DD) of the time period the results must come from, resolved against today: a named year, month or day (2025, March 2025, yesterday) is that whole period; a span counted back from now (the last month, the past two weeks) ends today; since or after leaves the end open. Both null when the query states no such period: a year that names an event (the 2024 olympics) is part of the topic, and latest, recent or new alone state no period (the latest version of numpy).
- homepages_only: true only when the query asks for homepages themselves: the home page or official website of an organization, product, project or person, or those of a group of them; the words that ask for them leave the query. False when a homepage is only the topic (how to design a homepage).
- languages: only when the query asks for results written in given languages (in German, French-language sources), their ISO 639-1 codes; the words that ask for them leave the query. Empty when a language, country or nationality is only part of the topic (German energy policy, learn Spanish).
- file_types: only when the query asks for documents in a file format: ["pdf"] for PDFs (PDF reports, filetype:pdf, papers as pdf), ["html"] for web pages only; the words that ask for them leave the query. Empty when a format is only the topic (how to merge PDFs, html tutorial).
- categories: when the query names the kind of content it wants or a collection to search, the ids whose description matches it; only the words that name it leave the query, wherever they stand (sourdough bread recipe is sourdough bread with recipe, openai news is openai with news). A kind of page that a page type describes is that page type's id alone, since the page type already covers the collections it names: papers, studies, theses and preprints are academic, news is news, recipes are recipe, documentation is docs, datasets are data (the datasets collection only for Kaggle or Papers with Code), forum threads are discussion, code examples are code, guides and tutorials are howto, videos and podcasts are media. A collection the query names is that collection alone (arXiv papers are arxiv, Reddit threads are reddit). A kind of record that no page type describes is every collection that holds it unless the query names only some of them (patents are uspto and epo, US patents only uspto, clinical trials are clinical-trials). Only words that name a kind of content or a collection set it: empty when the kind of content is only the topic (paper airplanes, the news industry, a recipe app), when it would be guessed from the topic, the event or fact asked about, or how the question is phrased (how to bake bread, what is a qubit, how much did a company sell for, best laptops), and for things that exist far beyond the collections that list some of them (companies, people, books, films); never for homepages, which homepages_only states.
Leave every filter empty or null that the query does not state. Use only the category ids listed above.

Query: {query}

Respond with ONLY this JSON:
{"query": "", "include_domains": [], "exclude_domains": [], "start_date": null, "end_date": null, "homepages_only": false, "languages": [], "file_types": [], "categories": []}`;

/** The helper's system line and the question for one query. */
export function readingPrompt(text: string, t: Taxonomy, today: Date): { system: string; prompt: string } {
  const weekday = today.toLocaleDateString('en-US', { weekday: 'long' });
  const fill: Record<string, string> = {
    today: `${localDay(today)} (${weekday})`,
    collections: t.categories.filter((c) => c.group !== 'page_type').map(line).join('\n'),
    page_types: t.categories.filter((c) => c.group === 'page_type').map(line).join('\n'),
    query: text,
  };
  return {
    system: 'You read web search queries for a search engine and answer with JSON only.',
    prompt: TEMPLATE.replace(/\{(today|collections|page_types|query)\}/g, (_all, k: string) => fill[k]),
  };
}

// ---- the helper's answer -----------------------------------------------------------------------------

const bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Whether the words the helper left are the query's own: each of three or more letters or digits is in the query
 * (its letters and digits run together, so "US11694034B2" is in "US 11,694,034 B2" and "report" in "reports"). A
 * helper that rewrote, translated or expanded them ("RAG" as "retrieval augmented generation") gets the words
 * as written searched, with the filters it read.
 */
function ownWords(read: string, text: string): boolean {
  const all = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return read
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .every((w) => w.length < 3 || all.includes(w));
}

/** The first JSON object in an answer (from its first "{" to its last "}"), or null. */
function jsonObject(raw: string): Record<string, unknown> | null {
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try {
    const v = JSON.parse(raw.slice(a, b + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function hosts(v: unknown): string[] {
  const out = new Set<string>();
  for (const x of array(v)) {
    const h = typeof x === 'string' ? host(x) : null;
    if (h) out.add(h);
    if (out.size >= 64) break;
  }
  return [...out];
}

function date(v: unknown, what: string, end: boolean): string | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    return day(v, what, end);
  } catch (e) {
    if (e instanceof ArgError) return undefined;
    throw e;
  }
}

/**
 * What the helper answered, checked: each filter is kept only when it is valid (a known category, a real host
 * and date, a language the taxonomy lists), and null when no filter survives (the query states none, so it is
 * searched as written). Never throws.
 */
export function readAnswer(raw: string, text: string, t: Taxonomy): Reading | null {
  try {
    const o = jsonObject(typeof raw === 'string' ? raw : '');
    if (!o) return null;
    const sites = hosts(o.include_domains);
    const excludeSites = hosts(o.exclude_domains).filter((h) => !sites.includes(h));
    let from = date(o.start_date, 'start_date', false);
    let to = date(o.end_date, 'end_date', true);
    if (from && to && from > to) from = to = undefined;
    const homepagesOnly = o.homepages_only === true;
    const known = new Set(t.languages.map((l) => l.id));
    const languages = [
      ...new Set(
        array(o.languages)
          .map((l) => (typeof l === 'string' ? l.trim().toLowerCase() : ''))
          .filter((l) => /^[a-z]{2,3}$/.test(l) && (!known.size || known.has(l))),
      ),
    ].slice(0, 32);
    const types = new Set(array(o.file_types).filter((f) => f === 'pdf' || f === 'html'));
    const fileTypes: Reading['fileTypes'] = types.size === 1 ? [[...types][0] as 'pdf' | 'html'] : [];
    const ids = new Set(t.categories.map((c) => c.id));
    const categories = [...new Set(array(o.categories).filter((c): c is string => typeof c === 'string' && ids.has(c)))].slice(0, 64);
    if (!sites.length && !excludeSites.length && !from && !to && !homepagesOnly && !languages.length && !fileTypes.length && !categories.length) return null;
    const q = typeof o.query === 'string' ? o.query.replace(/\s+/g, ' ').trim() : '';
    const reading: Reading = { text: q && bytes(q) <= 2048 && ownWords(q, text) ? q : text, sites, excludeSites, categories, languages, fileTypes, homepagesOnly };
    if (from) reading.from = from;
    if (to) reading.to = to;
    return reading;
  } catch {
    return null;
  }
}

// ---- the reader --------------------------------------------------------------------------------------

const CACHE_MAX = 500;
const REST_AFTER = 2;
const REST_MS = 10 * 60_000;

export class QueryReader {
  private o: { ask: ReaderAsk; taxonomy: () => Taxonomy; parallel?: () => number; timeoutMs?: number; now?: () => number };
  /** Each query's reading by day and words; null: it states nothing. */
  private cache = new Map<string, Reading | null>();
  private failures = 0;
  private restUntil = 0;
  private asking = 0;

  constructor(o: { ask: ReaderAsk; taxonomy: () => Taxonomy; parallel?: () => number; timeoutMs?: number; now?: () => number }) {
    this.o = o;
  }

  private fail() {
    if (++this.failures >= REST_AFTER) this.restUntil = (this.o.now ?? Date.now)() + REST_MS;
  }

  /** The query with the filters its words state, or null to search it as written. Never throws, never waits for a busy helper. */
  async read(q: SearchQuery, signal?: AbortSignal): Promise<SearchQuery | null> {
    try {
      const t = this.o.taxonomy();
      if (signal?.aborted || !wantsReading(q, t)) return null;
      const now = (this.o.now ?? Date.now)();
      const key = `${localDay(new Date(now))}\n${q.text}`;
      if (this.cache.has(key)) {
        const hit = this.cache.get(key);
        return hit ? { ...q, ...hit } : null;
      }
      if (now < this.restUntil || this.asking >= (this.o.parallel?.() ?? 3)) return null;
      const raw = await this.ask(readingPrompt(q.text, t, new Date(now)), signal);
      if (raw === null) return null;
      if (!jsonObject(raw)) {
        this.fail();
        return null;
      }
      this.failures = 0;
      const reading = readAnswer(raw, q.text, t);
      this.cache.delete(key);
      this.cache.set(key, reading);
      if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
      return reading ? { ...q, ...reading } : null;
    } catch {
      return null;
    }
  }

  /** One helper call, given timeoutMs and stopped with the caller's signal. Null: no usable answer (counted as a failure unless the caller gave up). */
  private async ask(p: { system: string; prompt: string }, signal?: AbortSignal): Promise<string | null> {
    const ctl = new AbortController();
    const stop = () => ctl.abort();
    const timeoutMs = this.o.timeoutMs ?? 8000;
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    this.asking++;
    try {
      const stopped = new Promise<null>((resolve) => ctl.signal.addEventListener('abort', () => resolve(null), { once: true }));
      // A helper that ignores the signal still cannot hold the search past the time.
      const asked = Promise.resolve()
        .then(() => this.o.ask({ ...p, signal: ctl.signal, timeoutMs }))
        .catch((e) => {
          if (!ctl.signal.aborted) throw e;
          return null;
        });
      const raw = await Promise.race([asked, stopped]);
      if (typeof raw === 'string') return raw;
      if (!signal?.aborted) this.fail();
      return null;
    } catch {
      if (!signal?.aborted) this.fail();
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      this.asking--;
      ctl.abort();
    }
  }
}
