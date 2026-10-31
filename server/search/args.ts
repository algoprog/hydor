// web_search's and read_page's arguments, checked and put in one shape. Models write them in many
// ways ("20" for 20, "arxiv, pubmed" for a list, "https://www.nature.com/…" for a site), so what is
// clear is accepted, and what is not gets an answer saying how to fix it.
import type { SearchQuery } from './types.ts';

export class ArgError extends Error {}

export interface ArgContext {
  /** Results when the agent does not say. */
  defaultK: number;
  providers: { id: string; name: string }[];
  /** The category ids that exist, when known. */
  categories?: string[];
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** A list from an array, or from one string of items split by commas. */
function list(v: unknown, what: string): string[] {
  if (v == null || v === '') return [];
  const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
  if (!items) throw new ArgError(`${what} should be a list of strings`);
  return [...new Set(items.map((x) => String(x ?? '').trim()).filter(Boolean))];
}

function bool(v: unknown, what: string): boolean {
  if (v == null || v === '') return false;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  throw new ArgError(`${what} should be true or false`);
}

/** A site as a host: "https://www.nature.com/articles" is nature.com. A suffix ("gov") works too. */
export function host(s: string): string | null {
  let v = s.trim().toLowerCase().replace(/^-/, '');
  if (!v) return null;
  try {
    v = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(v) ? v : `http://${v}`).hostname;
  } catch {
    return null;
  }
  v = v.replace(/^www\./, '').replace(/\.$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(v) ? v : null;
}

function sites(v: unknown, what: string): string[] {
  const out = list(v, what).map((s) => {
    const h = host(s);
    if (!h) throw new ArgError(`${what}: "${s}" is not a site; give hosts like "arxiv.org"`);
    return h;
  });
  if (out.length > 64) throw new ArgError(`${what}: at most 64 sites`);
  return [...new Set(out)];
}

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** YYYY-MM-DD from "2024", "2024-05", "2024-05-02" or a date-time; a year or month counts from its start (or to its end). */
export function day(v: unknown, what: string, end: boolean): string | undefined {
  if (v == null || v === '') return undefined;
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?(?:[T ].*)?$/.exec(String(v).trim());
  const bad = () => new ArgError(`${what} should be a date like 2024-05-02 (or 2024-05, or 2024)`);
  if (!m) throw bad();
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : end ? 12 : 1;
  if (mo < 1 || mo > 12) throw bad();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const last = mo === 2 && !leap ? 28 : DAYS[mo - 1];
  const d = m[3] ? Number(m[3]) : end ? last : 1;
  if (d < 1 || d > last) throw bad();
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const LANGUAGES: Record<string, string> = {
  english: 'en', german: 'de', deutsch: 'de', french: 'fr', spanish: 'es', italian: 'it', portuguese: 'pt', dutch: 'nl', polish: 'pl', russian: 'ru', ukrainian: 'uk', greek: 'el',
  turkish: 'tr', arabic: 'ar', hebrew: 'he', hindi: 'hi', chinese: 'zh', japanese: 'ja', korean: 'ko', swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', czech: 'cs',
};

/** Words models use for a category, read as Naget's id when that id exists. */
const CATEGORY_WORDS: Record<string, string> = {
  paper: 'academic', papers: 'academic', scholarly: 'academic', scientific: 'academic', science: 'academic', research: 'academic', scholar: 'academic',
  patent: 'uspto', patents: 'uspto', forum: 'discussion', forums: 'discussion', documentation: 'docs', doc: 'docs', encyclopedia: 'reference', wiki: 'reference', dataset: 'data', datasets: 'data',
};

/** Words that only stated search operators: read into the query's fields. */
function operators(text: string, q: Pick<SearchQuery, 'sites' | 'excludeSites' | 'fileTypes'> & { from?: string; to?: string }): string {
  return text
    .replace(/(^|\s)(-?)site:(\S+)/gi, (all, pre: string, minus: string, s: string) => {
      const h = host(s);
      if (!h) return all;
      (minus ? q.excludeSites : q.sites).push(h);
      return pre;
    })
    .replace(/(^|\s)(?:filetype|ext):(pdf|html?)\b/gi, (_all, pre: string, t: string) => {
      q.fileTypes.push(t.toLowerCase() === 'pdf' ? 'pdf' : 'html');
      return pre;
    })
    .replace(/(^|\s)(after|before):(\d{4}(?:-\d{1,2}){0,2})\b/gi, (all, pre: string, w: string, d: string) => {
      try {
        if (w.toLowerCase() === 'after') q.from ??= day(d, 'after:', false);
        else q.to ??= day(d, 'before:', true);
        return pre;
      } catch {
        return all;
      }
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** web_search's arguments as a query, and the provider asked for (if any). Throws ArgError. */
export function searchArgs(a: Record<string, unknown>, c: ArgContext): { query: SearchQuery; provider?: string } {
  const raw = a.query ?? a.q;
  if (typeof raw !== 'string' || !raw.trim()) throw new ArgError('query is needed: what to search for, in plain words');
  const q: SearchQuery = {
    text: '',
    k: c.defaultK,
    sites: sites(a.sites ?? a.site, 'sites'),
    excludeSites: sites(a.exclude_sites, 'exclude_sites'),
    categories: [],
    from: day(a.from, 'from', false),
    to: day(a.to, 'to', true),
    languages: [],
    fileTypes: [],
    homepagesOnly: bool(a.homepages_only, 'homepages_only'),
    snippets: 'plain',
  };
  q.text = operators(raw, q);
  if (!q.text) throw new ArgError('query needs words to search for, besides site: and filetype:');
  if (bytes(q.text) > 2048) throw new ArgError('query is too long: keep it under 2,000 characters');
  q.sites = [...new Set(q.sites)];
  q.excludeSites = [...new Set(q.excludeSites)];

  const k = a.k ?? a.count ?? a.limit;
  if (k != null && k !== '') {
    const n = typeof k === 'number' ? k : typeof k === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(k) ? Number(k) : NaN;
    if (!Number.isFinite(n) || n < 1) throw new ArgError('k is how many results: a number from 1 to 100');
    q.k = Math.min(100, Math.round(n));
  }

  const known = c.categories?.length ? new Set(c.categories) : null;
  for (const v of list(a.categories ?? a.category, 'categories')) {
    let id = v.toLowerCase().replace(/\s+/g, '-');
    if (known && !known.has(id) && CATEGORY_WORDS[id] && known.has(CATEGORY_WORDS[id])) id = CATEGORY_WORDS[id];
    if (known && !known.has(id)) throw new ArgError(`There is no category "${v}". Categories: ${[...known].join(', ')}`);
    if (!q.categories.includes(id)) q.categories.push(id);
  }
  if (q.categories.length > 64) throw new ArgError('categories: at most 64');

  for (const v of list(a.languages ?? a.language, 'languages')) {
    const w = v.toLowerCase();
    const code = LANGUAGES[w] ?? w.split(/[-_]/)[0];
    if (!/^[a-z]{2,3}$/.test(code)) throw new ArgError(`languages: "${v}" is not a language code; use ISO codes like "en" or "de"`);
    if (!q.languages.includes(code)) q.languages.push(code);
  }
  if (q.languages.length > 32) throw new ArgError('languages: at most 32');

  for (const v of list(a.file_types ?? a.file_type, 'file_types')) {
    const w = v.toLowerCase().replace(/^\./, '');
    const t = w === 'pdf' ? 'pdf' : ['html', 'htm', 'web', 'page', 'pages'].includes(w) ? 'html' : null;
    if (!t) throw new ArgError(`file_types: "${v}" is not one; use "pdf" or "html"`);
    q.fileTypes.push(t);
  }
  q.fileTypes = [...new Set(q.fileTypes)];

  if (q.from && q.to && q.from > q.to) throw new ArgError(`from (${q.from}) is after to (${q.to})`);

  const sn = a.snippets;
  if (sn != null && sn !== '') {
    if (sn !== 'plain' && sn !== 'filtered') throw new ArgError('snippets should be "plain" or "filtered"');
    q.snippets = sn;
  }

  let provider: string | undefined;
  if (a.provider != null && a.provider !== '') {
    const w = String(a.provider).toLowerCase().replace(/[^a-z0-9]/g, '');
    const p = c.providers.find((x) => x.id === w || x.name.toLowerCase().replace(/[^a-z0-9]/g, '') === w || (w === 'ddg' && x.id === 'duckduckgo') || (w === 'naget' && x.id === 'naget'));
    if (!p) throw new ArgError(`There is no provider "${a.provider}". Providers: ${c.providers.map((x) => x.id).join(', ')}`);
    provider = p.id;
  }
  return { query: q, provider };
}

/** The filters a query keeps to, in words, for the answer's first lines. */
export function filtersText(q: SearchQuery): string {
  const out: string[] = [];
  if (q.categories.length) out.push(`categories ${q.categories.join(', ')}`);
  if (q.sites.length) out.push(`sites ${q.sites.join(', ')}`);
  if (q.excludeSites.length) out.push(`leaving out ${q.excludeSites.join(', ')}`);
  if (q.from || q.to) out.push(q.from && q.to ? `from ${q.from} to ${q.to}` : q.from ? `from ${q.from}` : `up to ${q.to}`);
  if (q.languages.length) out.push(`languages ${q.languages.join(', ')}`);
  if (q.fileTypes.length === 1) out.push(q.fileTypes[0] === 'pdf' ? 'PDFs only' : 'web pages only');
  if (q.homepagesOnly) out.push('home pages only');
  return out.join('; ');
}

export interface PageArgs {
  url: string;
  question?: string;
  page: number;
}

/** read_page's arguments. */
export function pageArgs(a: Record<string, unknown>): PageArgs {
  let url = String(a.url ?? a.address ?? '').trim();
  if (!url) throw new ArgError('url is needed: the address of the page to read');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ArgError(`"${a.url}" is not a web address`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ArgError('Only http and https addresses can be read');
  u.hash = '';
  const question = typeof a.question === 'string' && a.question.trim() ? a.question.trim() : undefined;
  if (question && bytes(question) > 2048) throw new ArgError('question is too long: keep it under 2,000 characters');
  const p = a.page == null || a.page === '' ? 1 : Number(a.page);
  if (!Number.isInteger(p) || p < 1) throw new ArgError('page is which part of a long page to read: 1, 2, 3…');
  return { url: u.toString(), question, page: p };
}
