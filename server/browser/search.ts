// What the search box (Ctrl+K) finds of your own browsing: pages of your history, your bookmarks and your downloads, by
// their words and, when search by meaning is on, by what they are about (meaning.ts). Words and meaning are fused by their
// ranks as the rest of the search box's results are, and each kind keeps its best few. Only the person at the search box
// gets this: the route leaves it out of what an agent's call asks for (find/index.ts), and nothing else reads it.
import type { BookmarkNode } from '../../shared/browser.ts';
import type { FoundBrowsing } from '../../shared/find.ts';
import type { DB } from '../db.ts';
import { loadBookmarks } from './bookmarks.ts';
import { downloadsByIds, listDownloads } from './downloads.ts';
import { historyByIds, searchHistory } from './history.ts';
import { browsingAlike, type BrowsingKind } from './meaning.ts';

/** Results of each kind. */
const TOP = 8;
/** Pages asked of meaning, in all, before each kind keeps its best. */
const ALIKE = 60;
const RRF_K = 8;
const RRF_MEANING = 0.8;

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
const plain = (url: string) => url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');

/** A bookmark's folders as names, outermost first ("Recipes › Soups"); nothing for one straight in the bookmarks bar or Other bookmarks. */
function folderOf(nodes: Map<string, BookmarkNode>, b: BookmarkNode): string {
  const names: string[] = [];
  let at = nodes.get(b.parent);
  for (let i = 0; at && i < 20; i++) {
    names.unshift(at.title);
    at = nodes.get(at.parent);
  }
  return names.join(' › ');
}

/** The rank-fused order of ids: by words (given in order) and by meaning (given in order). */
function fuse(byWords: string[], byMeaning: string[]): string[] {
  const score = new Map<string, number>();
  byWords.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + i)));
  byMeaning.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + RRF_MEANING / (RRF_K + i)));
  const first = new Map([...byWords, ...byMeaning].map((id, i) => [id, i]));
  return [...score.keys()].sort((a, b) => score.get(b)! - score.get(a)! || first.get(a)! - first.get(b)!);
}

export interface BrowsingFind {
  /** The query's vector when the caller has it (the search box asked the model once for all it finds by meaning); null: meaning cannot answer now; left out: ask. */
  vector?: Float32Array | null;
  kinds?: BrowsingKind[];
  now?: number;
}

/** The history, bookmarks and downloads for the words, each kind's best few, by words and meaning together. */
export async function findBrowsing(db: DB, q: string, o: BrowsingFind = {}): Promise<FoundBrowsing[]> {
  const text = q.trim();
  if (!text) return [];
  const want = new Set<BrowsingKind>(o.kinds ?? ['history', 'bookmark', 'download']);
  const now = o.now ?? Date.now();
  const alike = await browsingAlike(db, text, [...want], { limit: ALIKE, vector: o.vector, waitMs: 0 });
  const meaning = (k: BrowsingKind) => alike.filter((a) => a.kind === k).map((a) => a.ref);
  const out: FoundBrowsing[] = [];

  if (want.has('history')) {
    const hits = searchHistory(db, text, now);
    const ids = fuse(
      hits.map((h) => String(h.id)),
      meaning('history'),
    ).slice(0, TOP);
    const byId = new Map(hits.map((h) => [String(h.id), h]));
    for (const e of ids.map((id) => byId.get(id) ?? historyByIds(db, [Number(id)])[0]).filter(Boolean))
      out.push({ kind: 'history', id: String(e!.id), title: e!.title || plain(e!.url), url: e!.url, at: e!.at, visits: e!.visits });
  }

  if (want.has('bookmark')) {
    const nodes = loadBookmarks(db);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const w = words(text);
    const mine = nodes.filter((n) => n.url && w.every((x) => `${n.title}\n${plain(n.url!)}`.toLowerCase().includes(x))).sort((a, b) => b.addedAt - a.addedAt);
    const ids = fuse(
      mine.map((n) => n.id),
      meaning('bookmark'),
    ).slice(0, TOP);
    for (const n of ids.map((id) => byId.get(id)).filter((n): n is BookmarkNode => !!n && !!n.url))
      out.push({ kind: 'bookmark', id: n.id, title: n.title || plain(n.url!), url: n.url, at: n.addedAt, folder: folderOf(byId, n) });
  }

  if (want.has('download')) {
    const hits = listDownloads(db, { q: text, limit: 100 });
    const ids = fuse(
      hits.map((h) => String(h.id)),
      meaning('download'),
    ).slice(0, TOP);
    const byId = new Map(hits.map((h) => [String(h.id), h]));
    for (const e of ids.map((id) => byId.get(id) ?? downloadsByIds(db, [Number(id)])[0]).filter(Boolean))
      out.push({ kind: 'download', id: String(e!.id), title: e!.name, ...(e!.url ? { url: e!.url } : {}), ...(e!.path ? { path: e!.path } : {}), at: e!.at, failed: e!.failed });
  }
  return out;
}
