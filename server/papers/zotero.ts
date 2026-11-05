// A reading list kept in step with a Zotero library, through Zotero's Web API (api.zotero.org, version 3). The key comes
// from the vault (ZOTERO_API_KEY, sent only to the hosts the vault allows it), the library from ZOTERO_USER_ID ("12345",
// or "groups/67890" for a group's), else from the key itself (keys/current). Each sync first takes what changed in Zotero
// since the last one (its items with their BibTeX; If-Modified-Since-Version answers "nothing" at once when nothing did),
// matched to the list's papers by Zotero key, DOI, arXiv id or title: new ones are added, known ones completed, and
// those deleted in Zotero stay here, no longer linked (and never sent back). Then it sends Zotero the papers that were
// never there, as Zotero items,
// fifty at a time with a write token (so a retry never makes two), and keeps each one's Zotero key and version. The
// library's version is kept with the sync, so the next one moves only what changed.
import crypto from 'node:crypto';
import { parseBibEntry } from '../../shared/latex-bib.ts';
import { readSecret, touchSecret } from '../connections/vault.ts';
import { httpCall } from '../connections/http.ts';
import type { DB } from '../db.ts';
import { arxivIn, doiIn } from './resolve.ts';
import { tagsOf, tidyPaper, type Paper } from './bib.ts';
import { keepPapers, type PaperList } from './list.ts';

export const ZOTERO_API = 'https://api.zotero.org';
const PAGE = 50;
const MAX_PAGES = 60;

/** One request to Zotero, as the sync makes it; tests answer it themselves. */
export type ZoteroSend = (c: { method: string; url: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

/** A Zotero item, as the API gives it with include=data,bibtex. */
export interface ZoteroItem {
  key: string;
  version: number;
  data: Record<string, any>;
  bibtex?: string;
}

/** What a sync did, and the library's version after it. */
export interface ZoteroResult {
  library: string;
  version: number;
  /** Papers new from Zotero, papers here completed from it, papers sent to it, papers deleted there (kept here). */
  added: number;
  updated: number;
  sent: number;
  unlinked: number;
  failed: string[];
  summary: string;
}

const SKIP_TYPES = new Set(['note', 'attachment', 'annotation']);

/** A Zotero item as a reading list's paper (its BibTeX as Zotero writes it, its tags, its key and version). */
export function paperOfZotero(it: ZoteroItem): Paper | null {
  const d = it.data ?? {};
  if (SKIP_TYPES.has(String(d.itemType)) || !String(d.title ?? '').trim()) return null;
  const creators: { creatorType?: string; firstName?: string; lastName?: string; name?: string }[] = Array.isArray(d.creators) ? d.creators : [];
  const authors = creators.filter((c) => c.creatorType === 'author');
  const names = (authors.length ? authors : creators).map((c) => (c.name ? c.name : `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim())).filter(Boolean);
  const extra = String(d.extra ?? '');
  const arxiv = arxivIn(String(d.archiveID ?? '')) || arxivIn(/arxiv:\s*\S+/i.exec(extra)?.[0] ?? '') || arxivIn(String(d.url ?? ''));
  const venue = d.publicationTitle || d.proceedingsTitle || d.conferenceName || d.bookTitle || (d.itemType === 'preprint' ? d.repository || 'arXiv' : '') || d.university || d.institution || d.websiteTitle || '';
  const bib = typeof it.bibtex === 'string' && /^\s*@/.test(it.bibtex) ? it.bibtex.trim() : '';
  return tidyPaper({
    title: d.title,
    authors: names.join(', '),
    year: Number(/\d{4}/.exec(String(d.date ?? ''))?.[0]) || null,
    venue: String(venue),
    doi: doiIn(String(d.DOI ?? '')) || doiIn(/DOI:\s*(\S+)/i.exec(extra)?.[1] ?? ''),
    arxiv,
    url: d.url,
    abstract: d.abstractNote,
    bibtex: bib,
    key: bib ? (parseBibEntry(bib)?.key ?? '') : '',
    tags: tagsOf((Array.isArray(d.tags) ? d.tags : []).map((t: { tag?: string }) => t.tag ?? '')),
    zotero_key: it.key,
    zotero_version: it.version,
  });
}

/** A paper as a new Zotero item: its type from its BibTeX (or its venue), its authors as creators, its ids where Zotero keeps them. */
export function zoteroOfPaper(p: Paper): Record<string, unknown> {
  const bibType = /^\s*@\s*(\w+)/.exec(p.bibtex ?? '')?.[1]?.toLowerCase() ?? '';
  const venue = p.venue && !/^arxiv$/i.test(p.venue) ? p.venue : '';
  const type =
    bibType === 'inproceedings' || bibType === 'conference'
      ? 'conferencePaper'
      : bibType === 'article' && venue
        ? 'journalArticle'
        : bibType === 'book'
          ? 'book'
          : bibType === 'phdthesis' || bibType === 'mastersthesis'
            ? 'thesis'
            : p.arxiv && !venue
              ? 'preprint'
              : /proc|conf|workshop|symposium/i.test(venue)
                ? 'conferencePaper'
                : venue
                  ? 'journalArticle'
                  : 'preprint';
  const creators = (p.authors ?? '')
    .split(/\s*,\s*|\s+and\s+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => {
      const at = n.lastIndexOf(' ');
      return at > 0 ? { creatorType: 'author', firstName: n.slice(0, at), lastName: n.slice(at + 1) } : { creatorType: 'author', name: n };
    });
  const extra: string[] = [];
  const item: Record<string, unknown> = { itemType: type, title: p.title, creators, date: p.year ? String(p.year) : '', url: p.url ?? '', abstractNote: p.abstract ?? '', tags: (p.tags ?? []).map((tag) => ({ tag })) };
  if (type === 'journalArticle') item.publicationTitle = venue;
  if (type === 'conferencePaper') item.proceedingsTitle = venue;
  if (type === 'preprint') {
    item.repository = p.arxiv ? 'arXiv' : venue;
    if (p.arxiv) item.archiveID = `arXiv:${p.arxiv}`;
  }
  // DOI is a field of these types; elsewhere it goes in Extra, as Zotero itself does.
  if (p.doi && ['journalArticle', 'conferencePaper', 'preprint'].includes(type)) item.DOI = p.doi;
  else if (p.doi) extra.push(`DOI: ${p.doi}`);
  if (p.arxiv && type !== 'preprint') extra.push(`arXiv: ${p.arxiv}`);
  if (extra.length) item.extra = extra.join('\n');
  return item;
}

/** The library a user ID (or "groups/<id>") stands for: "users/12345". */
export function libraryOf(id: string): string {
  const s = id.trim().replace(/^\/+|\/+$/g, '');
  if (/^(users|groups)\/\d+$/.test(s)) return s;
  if (/^\d+$/.test(s)) return `users/${s}`;
  return '';
}

const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

/** Sends requests to Zotero with the vault's key, only where the vault lets it go. */
export function vaultSender(db: DB): { send: ZoteroSend; user: () => string } {
  const key = readSecret(db, 'ZOTERO_API_KEY');
  if (!key) throw new Error('Add your Zotero key first (ZOTERO_API_KEY): make one at zotero.org/settings/keys, with access to your library (and to write in it, to send papers there).');
  const user = readSecret(db, 'ZOTERO_USER_ID');
  touchSecret(db, 'ZOTERO_API_KEY');
  const send: ZoteroSend = async (c) => {
    const r = await httpCall({ method: c.method, url: c.url, headers: c.headers, body: c.body, auth: { name: 'ZOTERO_API_KEY', value: key.value, domains: key.view.domains, header: 'Zotero-API-Key', prefix: '' } }, { maxBytes: 8_000_000, timeoutMs: 90_000 });
    return { status: r.status, headers: lower(r.headers), body: r.body };
  };
  return { send, user: () => user?.value ?? '' };
}

const wait = (s: number) => new Promise((ok) => setTimeout(ok, Math.min(60, Math.max(0, s)) * 1000));

/** A request, again once after a wait when Zotero asks for one (429, 503: Retry-After), and a pause when it asks to back off. */
async function call(send: ZoteroSend, c: Parameters<ZoteroSend>[0]): Promise<Awaited<ReturnType<ZoteroSend>>> {
  let r = await send(c);
  if (r.status === 429 || r.status === 503) {
    await wait(Number(r.headers['retry-after']) || 5);
    r = await send(c);
  }
  if (Number(r.headers.backoff) > 0) await wait(Number(r.headers.backoff));
  return r;
}

const why = (r: { status: number; body: string }) => `Zotero answered ${r.status}${r.body.trim() ? `: ${r.body.trim().slice(0, 200)}` : ''}`;

/**
 * Keeps a reading list and a Zotero library in step (both ways unless `direction` says one): what Zotero changed since
 * `since` comes in, what is only here goes out. The list's records change through `list`.
 */
export async function syncZotero(list: PaperList, o: { send: ZoteroSend; user?: string; since?: number; direction?: 'both' | 'pull' | 'push'; today: string }): Promise<ZoteroResult> {
  const headers = { 'Zotero-API-Version': '3' };
  let library = libraryOf(o.user ?? '');
  if (!library) {
    const r = await call(o.send, { method: 'GET', url: `${ZOTERO_API}/keys/current`, headers });
    if (r.status === 403 || r.status === 404) throw new Error('Zotero does not know this key: check ZOTERO_API_KEY (zotero.org/settings/keys).');
    if (r.status >= 400) throw new Error(why(r));
    const id = Number(JSON.parse(r.body || '{}').userID);
    if (!id) throw new Error('Zotero did not say whose key this is: add your user ID as ZOTERO_USER_ID (it is on zotero.org/settings/keys).');
    library = `users/${id}`;
  }
  const base = `${ZOTERO_API}/${library}`;
  let version = o.since ?? 0;
  const res: ZoteroResult = { library, version, added: 0, updated: 0, sent: 0, unlinked: 0, failed: [], summary: '' };
  const direction = o.direction ?? 'both';

  if (direction !== 'push') {
    // What changed in Zotero since the last sync (everything, the first time).
    const incoming: Paper[] = [];
    let latest = version;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${base}/items/top?format=json&include=data,bibtex&limit=${PAGE}&start=${page * PAGE}${version ? `&since=${version}` : ''}`;
      const r = await call(o.send, { method: 'GET', url, headers: { ...headers, ...(page === 0 && version ? { 'If-Modified-Since-Version': String(version) } : {}) } });
      if (r.status === 304) break;
      if (r.status === 403) throw new Error('This Zotero key may not read that library: give it read access (zotero.org/settings/keys).');
      if (r.status >= 400) throw new Error(why(r));
      latest = Math.max(latest, Number(r.headers['last-modified-version']) || 0);
      const items = JSON.parse(r.body || '[]') as ZoteroItem[];
      for (const it of items) {
        const p = paperOfZotero(it);
        if (p) incoming.push(p);
      }
      const total = Number(r.headers['total-results']);
      if (items.length < PAGE || (total && (page + 1) * PAGE >= total)) break;
      if (page === MAX_PAGES - 1) res.failed.push(`Only the first ${MAX_PAGES * PAGE} changed items were taken this time: sync again for the rest.`);
    }
    if (incoming.length) {
      const k = keepPapers(list, incoming, { today: o.today, status: 'To read', metadata: true });
      res.added += k.added;
      res.updated += k.updated;
    }
    // Items deleted in Zotero since: their papers stay here, no longer linked.
    if (version) {
      const r = await call(o.send, { method: 'GET', url: `${base}/deleted?since=${version}`, headers });
      if (r.status < 400) {
        const gone = new Set<string>((JSON.parse(r.body || '{}').items ?? []) as string[]);
        latest = Math.max(latest, Number(r.headers['last-modified-version']) || 0);
        for (const p of list.all().filter((x) => x.zotero_key && gone.has(x.zotero_key))) {
          // Its version stays: a paper once in Zotero is never sent there again.
          list.update(p.id!, { zotero_key: null });
          res.unlinked++;
        }
      }
    }
    version = latest;
  }

  if (direction !== 'pull') {
    // The papers only here (never in Zotero: no key, no version), as new Zotero items, fifty at a time; each keeps its new
    // key and version.
    const only = list.all().filter((p) => !p.zotero_key && !p.zotero_version && p.title);
    for (let i = 0; i < only.length; i += PAGE) {
      const batch = only.slice(i, i + PAGE);
      const r = await call(o.send, { method: 'POST', url: `${base}/items`, headers: { ...headers, 'Content-Type': 'application/json', 'Zotero-Write-Token': crypto.randomBytes(16).toString('hex') }, body: JSON.stringify(batch.map(zoteroOfPaper)) });
      if (r.status === 403) {
        res.failed.push('This Zotero key may not write to the library, so nothing was sent: give it write access (zotero.org/settings/keys).');
        break;
      }
      if (r.status >= 400) {
        res.failed.push(why(r));
        break;
      }
      const out = JSON.parse(r.body || '{}') as { successful?: Record<string, { key: string; version: number }>; success?: Record<string, string>; failed?: Record<string, { message?: string }> };
      const newVersion = Number(r.headers['last-modified-version']) || 0;
      batch.forEach((p, j) => {
        const ok = out.successful?.[String(j)];
        const key = ok?.key ?? out.success?.[String(j)];
        if (key) {
          list.update(p.id!, { zotero_key: key, zotero_version: ok?.version ?? newVersion ?? null });
          res.sent++;
        } else if (out.failed?.[String(j)]) res.failed.push(`“${p.title.slice(0, 80)}”: ${out.failed[String(j)].message ?? 'refused'}`);
      });
      version = Math.max(version, newVersion);
    }
  }
  res.version = version;
  res.summary = summaryOf(res);
  return res;
}

/** What a sync did, in a line: "12 new from Zotero, 3 sent to it". */
export function summaryOf(r: Pick<ZoteroResult, 'added' | 'updated' | 'sent' | 'unlinked' | 'failed'>): string {
  const parts: string[] = [];
  if (r.added) parts.push(`${r.added} new from Zotero`);
  if (r.updated) parts.push(`${r.updated} updated from it`);
  if (r.sent) parts.push(`${r.sent} sent to it`);
  if (r.unlinked) parts.push(`${r.unlinked} deleted there (kept here)`);
  const line = parts.length ? parts.join(', ') : 'Nothing changed: your list and Zotero were already in step';
  return r.failed.length ? `${line}. ${r.failed.length === 1 ? 'One thing went wrong' : `${r.failed.length} things went wrong`}: ${r.failed.slice(0, 3).join('; ')}` : line;
}
