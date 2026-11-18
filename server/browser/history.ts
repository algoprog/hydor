// Your own browsing's history and the address bar's suggestions. The history is a table of the app's database (one row
// per page: when you last went there, how often, and how often you typed its address), recorded from the changes of
// your browsing's view (HistoryRecorder), ranked by frecency (how often and how lately, typed addresses counting most)
// and kept to the last 20 000 pages. The suggestions put together your open tabs, bookmarks and history for what was
// typed, the address to complete it to in place, and what the search engine suggests (a stand-in `fetch` in tests).
import type { BookmarkNode, BrowserView, BrowsingPrefs, HistoryEntry, HistoryImport, SearchEngine, Suggestion, SuggestResult } from '../../shared/browser.ts';
import type { DB } from '../db.ts';
import { warmMeaning } from '../memory/embed.ts';
import { browsingAlike, dropVectors, sweepHistoryVectors } from './meaning.ts';

export const MAX_HISTORY = 20_000;
const URL_MAX = 2000;
const TITLE_MAX = 300;
/** The most items under the address bar, and the most of them the engine may suggest. */
export const MAX_SUGGESTIONS = 10;
export const MAX_SEARCH_SUGGESTIONS = 5;
/** How long the engine has to answer: without it the rest of the suggestions still come. */
export const SEARCH_SUGGEST_MS = 1200;
const DAY = 86_400_000;

// ---- addresses ------------------------------------------------------------------------------------------------

/** A page worth keeping in the history: a website or a file (not a blank page, an error page or an extension's), without its #fragment. */
export function historyUrl(url: string): string | null {
  if (typeof url !== 'string' || url.length > URL_MAX + 200 || !/^(https?|file):\/\//i.test(url)) return null;
  const i = url.indexOf('#');
  const u = i < 0 ? url : url.slice(0, i);
  return u.length <= URL_MAX ? u : null;
}

/** An address as people read it: no scheme, no www., no lone slash at the end. Lower case where the name is not case sensitive. */
export function plainUrl(url: string): string {
  let host = '';
  let rest = '';
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)(.*)$/is.exec(url);
  if (m) {
    host = m[1].toLowerCase().replace(/^www\./, '');
    rest = m[2];
  } else return url.toLowerCase();
  if (rest === '/' || rest === '') rest = '';
  return host + rest;
}

/** What two addresses of one page share (for no duplicates): the plain form without its fragment. */
const keyOf = (url: string): string => plainUrl(url.replace(/#.*$/s, '')).replace(/\/$/, '');

const schemeOf = (url: string): string => /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase() ?? '';

/** The title as the history keeps it: one line; nothing when it is only the address (what a page without a title shows). */
function tidyTitle(title: unknown, url: string): string {
  const t = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
  if (!t || t === url || t === url.replace(/^[a-z]+:\/\//i, '') || t === plainUrl(url)) return '';
  return t;
}

/** What searches look in: the title and the address, in lower case (so letters of any language match in any case). */
const hayOf = (title: string, url: string) => `${title}\n${url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')}`.toLowerCase();

const wordsOf = (q: string): string[] => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

// ---- the table ------------------------------------------------------------------------------------------------

const ready = new WeakSet<DB>();
/** Makes the table when it is not there yet (the first use of a database). */
export function table(db: DB) {
  if (ready.has(db)) return;
  db.exec(`create table if not exists browser_history (
    id integer primary key autoincrement,
    url text not null unique,
    title text not null default '',
    hay text not null,
    at integer not null,
    visits integer not null default 1,
    typed integer not null default 0
  )`);
  db.exec('create index if not exists browser_history_at on browser_history(at)');
  ready.add(db);
}

interface Row {
  id: number;
  url: string;
  title: string;
  at: number;
  visits: number;
  typed: number;
}
const COLS = 'id, url, title, at, visits, typed';
const entry = (r: Row): HistoryEntry => ({ id: r.id, url: r.url, title: r.title, at: r.at, visits: r.visits, typed: r.typed });

/** A visit to a page: its row is made or counted again (`typed`: its address was typed or chosen in the address bar). Null when it is not a page to keep. */
export function addVisit(db: DB, url: string, title: string, typed = false, now = Date.now()): HistoryEntry | null {
  table(db);
  const u = historyUrl(url);
  if (!u) return null;
  const t = tidyTitle(title, u);
  const go = db.transaction((): Row => {
    const row = db.prepare(`select ${COLS} from browser_history where url = ?`).get(u) as Row | undefined;
    if (row) {
      const next = t || row.title;
      // A new title is embedded again.
      if (next !== row.title) dropVectors(db, 'history', [String(row.id)]);
      db.prepare('update browser_history set at = ?, visits = visits + 1, typed = typed + ?, title = ?, hay = ? where id = ?').run(now, typed ? 1 : 0, next, hayOf(next, u), row.id);
      return { ...row, at: now, visits: row.visits + 1, typed: row.typed + (typed ? 1 : 0), title: next };
    }
    const r = db.prepare('insert into browser_history (url, title, hay, at, visits, typed) values (?, ?, ?, ?, 1, ?)').run(u, t, hayOf(t, u), now, typed ? 1 : 0);
    // The oldest pages go once there are more than the most.
    const n = (db.prepare('select count(*) as n from browser_history').get() as { n: number }).n;
    if (n > MAX_HISTORY) {
      db.prepare('delete from browser_history where id in (select id from browser_history order by at asc, id asc limit ?)').run(n - MAX_HISTORY);
      sweepHistoryVectors(db);
    }
    return { id: Number(r.lastInsertRowid), url: u, title: t, at: now, visits: 1, typed: typed ? 1 : 0 };
  });
  return entry(go());
}

/** A page's title as it settles (not a new visit). */
export function setTitle(db: DB, url: string, title: string) {
  table(db);
  const u = historyUrl(url);
  if (!u) return;
  const t = tidyTitle(title, u);
  if (!t) return;
  const row = db.prepare('select id from browser_history where url = ? and title <> ?').get(u, t) as { id: number } | undefined;
  if (!row) return;
  db.prepare('update browser_history set title = ?, hay = ? where id = ?').run(t, hayOf(t, u), row.id);
  dropVectors(db, 'history', [String(row.id)]);
}

/**
 * Another browser's history brought in. Pages of one address are combined first (the latest visit, the visits and typed
 * counts added up, the title of the latest visit that has one). A page the history has keeps the larger of each count and
 * the later visit, so bringing the same history again changes nothing; its title becomes the imported one when that visit
 * is later (or it had none). Then only the newest 20 000 pages stay.
 */
export function mergeHistory(db: DB, pages: { url: string; title?: string; at: number; visits?: number; typed?: number }[], now = Date.now()): HistoryImport {
  table(db);
  const mine = new Map<string, { title: string; titleAt: number; at: number; visits: number; typed: number }>();
  for (const p of pages) {
    const u = historyUrl(p.url);
    if (!u) continue;
    const at = Number(p.at);
    if (!Number.isFinite(at) || at <= 0) continue;
    const visits = Math.max(1, Math.floor(Number(p.visits)) || 1);
    const typed = Math.max(0, Math.floor(Number(p.typed)) || 0);
    const t = tidyTitle(p.title, u);
    const when = Math.min(Math.floor(at), now);
    const m = mine.get(u);
    if (!m) mine.set(u, { title: t, titleAt: t ? when : 0, at: when, visits, typed });
    else {
      m.visits += visits;
      m.typed += typed;
      m.at = Math.max(m.at, when);
      if (t && when >= m.titleAt) (m.title = t), (m.titleAt = when);
    }
  }
  return db.transaction((): HistoryImport => {
    const last = (db.prepare('select coalesce(max(id), 0) as id from browser_history').get() as { id: number }).id;
    const find = db.prepare(`select ${COLS} from browser_history where url = ?`);
    const insert = db.prepare('insert into browser_history (url, title, hay, at, visits, typed) values (?, ?, ?, ?, ?, ?)');
    const update = db.prepare('update browser_history set at = ?, visits = ?, typed = ?, title = ?, hay = ? where id = ?');
    let added = 0;
    let updated = 0;
    for (const [u, m] of mine) {
      const row = find.get(u) as Row | undefined;
      if (!row) {
        insert.run(u, m.title, hayOf(m.title, u), m.at, m.visits, m.typed);
        added++;
        continue;
      }
      const at = Math.max(row.at, m.at);
      const visits = Math.max(row.visits, m.visits);
      const typed = Math.max(row.typed, m.typed);
      const title = m.title && (m.at > row.at || !row.title) ? m.title : row.title;
      if (at === row.at && visits === row.visits && typed === row.typed && title === row.title) continue;
      // A new title is embedded again.
      if (title !== row.title) dropVectors(db, 'history', [String(row.id)]);
      update.run(at, visits, typed, title, hayOf(title, u), row.id);
      updated++;
    }
    // The oldest pages go once there are more than the most.
    const n = (db.prepare('select count(*) as n from browser_history').get() as { n: number }).n;
    if (n > MAX_HISTORY) {
      db.prepare('delete from browser_history where id in (select id from browser_history order by at asc, id asc limit ?)').run(n - MAX_HISTORY);
      sweepHistoryVectors(db);
      // Only the pages that are still there count as added.
      added = (db.prepare('select count(*) as n from browser_history where id > ?').get(last) as { n: number }).n;
    }
    return { added, updated };
  })();
}

/** `instr` tests for each word, to put after a `where`: all the words are in the title or the address. */
const wordTests = (words: string[]) => ({ sql: words.map(() => 'instr(hay, ?) > 0').join(' and '), args: words });

/** The history, newest first; `q`: only pages with all its words in the title or address; `before`: only those last visited before that time (to page). */
export function listHistory(db: DB, o: { q?: string; before?: number; limit?: number } = {}): HistoryEntry[] {
  table(db);
  const limit = Math.max(1, Math.min(200, Math.floor(o.limit ?? 100) || 100));
  const where: string[] = [];
  const args: (string | number)[] = [];
  const w = wordTests(wordsOf(o.q ?? ''));
  if (w.sql) {
    where.push(w.sql);
    args.push(...w.args);
  }
  if (typeof o.before === 'number' && Number.isFinite(o.before)) {
    where.push('at < ?');
    args.push(o.before);
  }
  const rows = db.prepare(`select ${COLS} from browser_history ${where.length ? `where ${where.join(' and ')}` : ''} order by at desc, id desc limit ?`).all(...args, limit) as Row[];
  return rows.map(entry);
}

/** Pages by their ids, as listHistory gives them. */
export function historyByIds(db: DB, ids: number[]): HistoryEntry[] {
  table(db);
  const get = db.prepare(`select ${COLS} from browser_history where id = ?`);
  return ids.flatMap((id) => {
    const r = get.get(id) as Row | undefined;
    return r ? [entry(r)] : [];
  });
}

/** The pages with all the words (as listHistory), the likeliest first: the most recent 200 by frecency. For the search box. */
export function searchHistory(db: DB, q: string, now = Date.now()): HistoryEntry[] {
  table(db);
  const w = wordTests(wordsOf(q));
  if (!w.sql) return [];
  const rows = db.prepare(`select ${COLS} from browser_history where ${w.sql} order by at desc, id desc limit 200`).all(...w.args) as Row[];
  return rows.map(entry).sort((a, b) => frecency(b, now) - frecency(a, now) || b.at - a.at);
}

export function removeHistory(db: DB, id: number): boolean {
  table(db);
  const gone = db.prepare('delete from browser_history where id = ?').run(id).changes > 0;
  dropVectors(db, 'history', [String(id)]);
  return gone;
}

/** Clears the history: everything last visited since that time, or all of it. Returns how many pages went. */
export function clearHistory(db: DB, since?: number): number {
  table(db);
  const n = (since === undefined ? db.prepare('delete from browser_history').run() : db.prepare('delete from browser_history where at >= ?').run(since)).changes;
  // No vector of a page that is cleared stays behind.
  sweepHistoryVectors(db);
  return n;
}

export function historyCount(db: DB): number {
  table(db);
  return (db.prepare('select count(*) as n from browser_history').get() as { n: number }).n;
}

/** How many pages have all the words (as searchHistory finds them); with no words, all of them. */
export function historyMatchCount(db: DB, q: string): number {
  table(db);
  const w = wordTests(wordsOf(q));
  if (!w.sql) return historyCount(db);
  return (db.prepare(`select count(*) as n from browser_history where ${w.sql}`).get(...w.args) as { n: number }).n;
}

// ---- frecency -------------------------------------------------------------------------------------------------

/**
 * How much a page matters: its visits, a typed address counting five more, weighed by how lately you were there (the
 * weight halves every two weeks and never falls below a tenth). So a page you type beats one you only follow links to,
 * and either beats the same page long ago.
 */
export function frecency(e: { visits: number; typed: number; at: number }, now = Date.now()): number {
  const days = Math.max(0, now - e.at) / DAY;
  const lately = 0.1 + 0.9 * Math.pow(0.5, days / 14);
  return (Math.min(e.visits, 50) + 5 * Math.min(e.typed, 20)) * lately;
}

// ---- recording ------------------------------------------------------------------------------------------------

/** How long after you typed an address its page counts as typed. */
const TYPED_MS = 15_000;
/** How long a restored tab's page may take to arrive and still not count as a visit. */
const QUIET_MS = 20_000;

interface Seen {
  url: string;
  /** The title the tab showed at the last look (for telling a new page's title from the last page's). */
  shown: string;
  /** The last page's title when this page began, and the title this page has been given. */
  old: string;
  titled: string;
}

/**
 * Records your own browsing's history from the changes of its view: each page a tab ends up on (a website or a file)
 * is a visit, and its title is set as it settles. A page opened from the address bar counts as typed (`typed`); the
 * pages tabs restore at a start are not visits (`quiet`). A private tab's pages are never recorded.
 */
export class HistoryRecorder {
  private seenTabs = new Map<string, Seen>();
  private typedAt = new Map<string, number>();
  private silent = new Map<string, number>();
  constructor(
    private db: DB,
    private now: () => number = Date.now,
  ) {}

  /** The tab's next page came from the address bar (a private tab's never counts: nothing of it is kept). */
  typed(tab: string, priv = false) {
    if (!priv) this.typedAt.set(tab, this.now());
  }

  /** The tab's next page is not a visit (a restored tab, a start's home page). */
  quiet(tab: string) {
    this.silent.set(tab, this.now());
  }

  seen(view: Pick<BrowserView, 'open' | 'tabs'>) {
    if (!view.open) {
      this.seenTabs.clear();
      this.typedAt.clear();
      this.silent.clear();
      return;
    }
    const live = new Set<string>();
    for (const t of view.tabs) {
      live.add(t.id);
      // Nothing a private tab shows is kept: it is not even followed.
      if (t.private) continue;
      const url = historyUrl(t.url);
      const title = t.title ?? '';
      const st = this.seenTabs.get(t.id);
      if (!url) {
        this.seenTabs.set(t.id, { url: '', shown: title, old: title, titled: '' });
        continue;
      }
      try {
        if (!st || st.url !== url) {
          // A new page. The title the tab shows may still be the last page's while this one loads.
          const stale = !!st && title === st.shown && t.loading === true;
          const typedAt = this.typedAt.get(t.id);
          const typed = typedAt !== undefined && this.now() - typedAt < TYPED_MS;
          this.typedAt.delete(t.id);
          const given = stale ? '' : title;
          const quietAt = this.silent.get(t.id);
          this.silent.delete(t.id);
          if (quietAt !== undefined && this.now() - quietAt < QUIET_MS) {
            if (given) setTitle(this.db, url, given);
          } else addVisit(this.db, url, given, typed, this.now());
          this.seenTabs.set(t.id, { url, shown: title, old: st?.shown ?? '', titled: given });
        } else {
          if (title && title !== st.titled && (t.loading !== true || title !== st.old)) {
            setTitle(this.db, url, title);
            st.titled = title;
          }
          st.shown = title;
        }
      } catch (e) {
        console.error(`[browser] history: ${(e as Error).message}`);
      }
    }
    for (const id of [...this.seenTabs.keys()]) if (!live.has(id)) this.seenTabs.delete(id);
    for (const id of [...this.typedAt.keys()]) if (!live.has(id)) this.typedAt.delete(id);
    for (const id of [...this.silent.keys()]) if (!live.has(id)) this.silent.delete(id);
  }
}

// ---- what the engine suggests ---------------------------------------------------------------------------------

/** Each engine's suggestions address; all answer `[query, [suggestion, …]]`. Startpage and your own search page have none. */
export const SUGGEST_URLS: Partial<Record<SearchEngine, string>> = {
  google: 'https://suggestqueries.google.com/complete/search?client=firefox&q=',
  duckduckgo: 'https://duckduckgo.com/ac/?type=list&q=',
  bing: 'https://api.bing.com/osjson.aspx?query=',
  brave: 'https://search.brave.com/api/suggest?q=',
  ecosia: 'https://ac.ecosia.org/autocomplete?type=list&q=',
};

export type Fetch = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; text(): Promise<string> }>;

/** The suggestions of an engine's answer: the list in the second place, words only, no duplicates, not what was typed. */
export function parseSuggestions(raw: string, q: string): string[] {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(v) && Array.isArray(v[1]) ? v[1] : [];
  const out: string[] = [];
  const seen = new Set([q.trim().toLowerCase()]);
  for (const x of list) {
    const s = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '';
    if (!s || s.length > 200 || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= MAX_SEARCH_SUGGESTIONS) break;
  }
  return out;
}

const cache = new Map<string, { at: number; list: string[] }>();
const CACHE_MS = 60_000;
const CACHE_MAX = 200;
export const clearSuggestCache = () => cache.clear();

/** What the engine suggests for the words (none when it has no suggestions, is slow or fails). Answers are kept for a minute. */
export async function engineSuggestions(engine: SearchEngine, q: string, o: { fetch?: Fetch; signal?: AbortSignal; timeoutMs?: number; now?: number } = {}): Promise<string[]> {
  const base = SUGGEST_URLS[engine];
  if (!base) return [];
  const now = o.now ?? Date.now();
  const k = `${engine}\n${q}`;
  const hit = cache.get(k);
  if (hit && now - hit.at < CACHE_MS) return hit.list;
  try {
    const timeout = AbortSignal.timeout(o.timeoutMs ?? SEARCH_SUGGEST_MS);
    const signal = o.signal ? AbortSignal.any([timeout, o.signal]) : timeout;
    const r = await (o.fetch ?? (fetch as unknown as Fetch))(base + encodeURIComponent(q), { signal, headers: { accept: 'application/json' } });
    if (!r.ok) return [];
    const list = parseSuggestions((await r.text()).slice(0, 200_000), q);
    if (!signal.aborted) {
      cache.set(k, { at: now, list });
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    }
    return list;
  } catch {
    return [];
  }
}

// ---- the address bar's suggestions ----------------------------------------------------------------------------

interface Cand {
  kind: 'tab' | 'bookmark' | 'history';
  url: string;
  title?: string;
  tab?: string;
  score: number;
  /** Found by its meaning alone (none of its words are what was typed). */
  meaning?: boolean;
}
const RANK = { tab: 0, bookmark: 1, history: 2 } as const;

/** Bookmarks and open tabs weigh in as pages you chose: a bookmark as twenty visits, a tab you have open as four. */
const BOOKMARK_WEIGHT = 20;
const TAB_WEIGHT = 4;
/**
 * At least this many of your bookmarks that hold the words are among the pages offered, when that many do: they take
 * the places of the last pages of your history, so a big history (one brought in from another browser) never hides
 * what you chose to keep.
 */
export const MIN_BOOKMARKS = 2;

/**
 * Words and meaning, fused by their ranks: a page's score is 1 / (8 + its place among the pages that hold the words) plus
 * 0.8 / (8 + its place among the pages alike in meaning), a place it is not in adding nothing. A strong word match stays on
 * top, a page alike in meaning that holds none of the words comes after the matches, and one that is both comes first.
 */
const RRF_K = 8;
const RRF_MEANING = 0.8;
/** How many pages by meaning are asked for, and how long the model has to answer (the engine may take longer: it is not waited for either). */
const MEANING_LIMIT = 20;
const MEANING_WAIT_MS = 250;
/** Meaning is asked for words: at least this many characters (the engine's own limit is the other end). */
const MEANING_MIN_CHARS = 3;

/** `p`'s answer, or `fallback` when it is not there after `ms` (measured from `since`). */
async function within<T>(p: Promise<T>, since: number, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), Math.max(0, since + ms - Date.now()));
    timer.unref?.();
  });
  try {
    return await Promise.race([p.catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

export interface SuggestInput {
  /** What was typed. */
  q: string;
  /** What it is as an address, when it is one (browsing.ts addressOf). */
  address: string | null;
  tabs: { id: string; url: string; title: string }[];
  bookmarks: BookmarkNode[];
  prefs: Pick<BrowsingPrefs, 'engine' | 'suggest'>;
  fetch?: Fetch;
  signal?: AbortSignal;
  now?: number;
}

const matches = (hay: string, words: string[]) => words.every((w) => hay.includes(w));

/** The address to complete what you typed to, or undefined: the best page whose address starts with it (no scheme, no www.; typed with a slash: the whole address, else its site). */
function inlineOf(typed: string, cands: Cand[]): string | undefined {
  if (!typed || /\s/.test(typed)) return undefined;
  const sc = /^([a-z][a-z0-9+.-]*):\/\//i.exec(typed);
  const rest = typed.slice(sc ? sc[0].length : 0).replace(/^www\./i, '');
  if (!rest) return undefined;
  const low = rest.toLowerCase();
  const slash = low.includes('/');
  const sites = new Map<string, { form: string; score: number }>();
  for (const c of cands) {
    if (sc && schemeOf(c.url) !== sc[1].toLowerCase()) continue;
    const plain = plainUrl(c.url.replace(/#.*$/s, ''));
    const form = slash ? plain : plain.split(/[/?]/)[0];
    if (!form.toLowerCase().startsWith(low) || form.length === rest.length) continue;
    const cur = sites.get(form.toLowerCase());
    if (cur) cur.score += c.score;
    else sites.set(form.toLowerCase(), { form, score: c.score });
  }
  let best: { form: string; score: number } | undefined;
  for (const s of sites.values()) if (!best || s.score > best.score) best = s;
  if (!best) return undefined;
  // What you typed stays as you typed it, and the rest is the page's.
  return typed + best.form.slice(rest.length);
}

/** The pages alike in meaning put among the ones with the words (see RRF_K): those found by meaning alone come marked. */
function fuse(db: DB, ranked: Cand[], alike: { kind: string; ref: string; score: number }[], bookmarks: BookmarkNode[], score: (url: string, title: string, weight: number) => number): Cand[] {
  const byId = new Map(bookmarks.map((b) => [b.id, b]));
  const get = db.prepare(`select ${COLS} from browser_history where id = ?`);
  // Each page once, its best similarity: a page that is both a bookmark and in the history counts once.
  const found = new Map<string, { sim: number; cand: Cand }>();
  for (const a of alike) {
    let c: Cand | undefined;
    if (a.kind === 'history') {
      const r = get.get(Number(a.ref)) as Row | undefined;
      if (r) c = { kind: 'history', url: r.url, title: r.title || undefined, score: score(r.url, r.title, 0), meaning: true };
    } else {
      const b = byId.get(a.ref);
      const u = b?.url ? historyUrl(b.url) : null;
      if (b && u) c = { kind: 'bookmark', url: b.url!, title: b.title || undefined, score: score(u, b.title, BOOKMARK_WEIGHT), meaning: true };
    }
    if (!c) continue;
    const k = keyOf(c.url);
    const have = found.get(k);
    if (!have) found.set(k, { sim: a.score, cand: c });
    else {
      if (a.score > have.sim) have.sim = a.score;
      if (RANK[c.kind] < RANK[have.cand.kind]) have.cand = { ...c, title: c.title ?? have.cand.title };
    }
  }
  const order = [...found.entries()].sort((a, b) => b[1].sim - a[1].sim || b[1].cand.score - a[1].cand.score);
  const fused = new Map<string, { cand: Cand; rrf: number }>();
  ranked.forEach((c, i) => fused.set(keyOf(c.url), { cand: c, rrf: 1 / (RRF_K + i + 1) }));
  order.forEach(([k, f], i) => {
    const add = RRF_MEANING / (RRF_K + i + 1);
    const have = fused.get(k);
    if (have) have.rrf += add;
    else fused.set(k, { cand: f.cand, rrf: add });
  });
  return [...fused.values()].sort((a, b) => b.rrf - a.rrf || b.cand.score - a.cand.score || RANK[a.cand.kind] - RANK[b.cand.kind]).map((x) => x.cand);
}

/** The address bar's suggestions: open tabs, bookmarks and history for the words, what was typed as an address, and the engine's. */
export async function suggest(db: DB, o: SuggestInput): Promise<SuggestResult> {
  table(db);
  const now = o.now ?? Date.now();
  const q = o.q.trim().slice(0, 200);
  // Pages are searched without their scheme and www.: typing either finds them all the same.
  const base = q.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '');
  const words = wordsOf(base);
  const plainQ = base.toLowerCase();

  // The engine is asked at once, while the rest is worked out here.
  const began = Date.now();
  const asked = q && o.prefs.suggest && !o.address && !/^[a-z][a-z0-9+.-]*:/i.test(q) && q.length <= 100 ? engineSuggestions(o.prefs.engine, q, { fetch: o.fetch, signal: o.signal, now }) : Promise.resolve<string[]>([]);

  // Words are searched by meaning too, at the same time (the model on your computer, when search by meaning is on).
  const wordsTyped = !!q && !o.address && !/^[a-z][a-z0-9+.-]*:/i.test(q) && q.length >= MEANING_MIN_CHARS && q.length <= 100;
  if (q) warmMeaning(db);
  const alikeP = wordsTyped ? browsingAlike(db, q, ['history', 'bookmark'], { limit: MEANING_LIMIT, waitMs: MEANING_WAIT_MS }).catch(() => []) : Promise.resolve([]);

  // History matching, with its frecency.
  const w = wordTests(words);
  const rows = db.prepare(`select ${COLS} from browser_history ${w.sql ? `where ${w.sql}` : ''} order by at desc limit 2000`).all(...w.args) as Row[];
  const byUrl = new Map<string, Row>();
  const score = (url: string, title: string, weight: number): number => {
    const row = byUrl.get(url) ?? (db.prepare(`select ${COLS} from browser_history where url = ?`).get(url) as Row | undefined);
    let s = (row ? frecency(row, now) : 0) + weight;
    if (plainUrl(url).startsWith(plainQ) && plainQ) s *= 2;
    else if (q && title.toLowerCase().startsWith(q.toLowerCase())) s *= 1.5;
    return s;
  };
  for (const r of rows) byUrl.set(r.url, r);

  const cands: Cand[] = [];
  for (const r of rows) cands.push({ kind: 'history', url: r.url, title: r.title || undefined, score: score(r.url, r.title, 0) });
  let marks = 0;
  for (const b of o.bookmarks) {
    if (!b.url || !historyUrl(b.url) || marks >= 300) continue;
    if (!matches(hayOf(b.title, b.url), words)) continue;
    marks++;
    cands.push({ kind: 'bookmark', url: b.url, title: b.title || undefined, score: score(historyUrl(b.url)!, b.title, BOOKMARK_WEIGHT) });
  }
  for (const t of o.tabs) {
    const u = historyUrl(t.url);
    if (!u || !matches(hayOf(t.title, t.url), words)) continue;
    cands.push({ kind: 'tab', url: t.url, title: t.title || undefined, tab: t.id, score: score(u, t.title, TAB_WEIGHT) });
  }

  // One item for each address: a tab beats a bookmark beats history; the best first.
  const best = new Map<string, Cand>();
  for (const c of cands) {
    const k = keyOf(c.url);
    const have = best.get(k);
    if (!have || RANK[c.kind] < RANK[have.kind]) best.set(k, { ...c, score: Math.max(c.score, have?.score ?? 0), title: c.title ?? have?.title });
    else if (c.score > have.score) have.score = c.score;
  }
  let ranked = [...best.values()].sort((a, b) => b.score - a.score || RANK[a.kind] - RANK[b.kind]);
  const asItem = (c: Cand): Suggestion =>
    c.kind === 'tab' ? { kind: 'tab', url: c.url, ...(c.title ? { title: c.title } : {}), tab: c.tab! } : { kind: c.kind, url: c.url, ...(c.title ? { title: c.title } : {}), ...(c.meaning ? { meaning: true } : {}) };

  // The address to complete to is by words alone.
  const inline = inlineOf(q, cands);
  const searches = (await asked).slice(0, MAX_SEARCH_SUGGESTIONS);
  // The model is not waited for beyond a moment, or the engine's own wait.
  const alike = await within(alikeP, began, MEANING_WAIT_MS, []);
  if (alike.length) ranked = fuse(db, ranked, alike, o.bookmarks, score);

  const items: Suggestion[] = [];
  const room = MAX_SUGGESTIONS - searches.length;
  // What you typed as an address comes first (it is what Enter opens): as the page it already is, or as it is.
  if (o.address) {
    const k = keyOf(o.address);
    const at = ranked.findIndex((c) => keyOf(c.url) === k);
    if (at >= 0) items.push(asItem(ranked.splice(at, 1)[0]));
    else items.push({ kind: 'url', url: o.address });
  }
  // The best pages there is room for; then, when fewer than MIN_BOOKMARKS of them are bookmarks that hold the words and
  // more such bookmarks were found, the next best of those take the places of the last pages of your history.
  const pages = ranked.slice(0, Math.max(0, room - items.length));
  const marked = (c: Cand) => c.kind === 'bookmark' && !c.meaning;
  const wanted = Math.min(MIN_BOOKMARKS, ranked.filter(marked).length) - pages.filter(marked).length;
  for (const b of ranked.slice(pages.length).filter(marked).slice(0, Math.max(0, wanted))) {
    const at = pages.findLastIndex((c) => c.kind === 'history');
    if (at < 0) break;
    pages.splice(at, 1);
    pages.push(b);
  }
  for (const c of pages) items.push(asItem(c));
  for (const text of searches) items.push({ kind: 'search', text });
  return { ...(inline ? { inline } : {}), items: items.slice(0, MAX_SUGGESTIONS) };
}
