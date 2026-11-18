// A few of each list your own browser keeps, for the Library's All (desktop app): your bookmarks (the ones you use most
// first), the pages waiting in Read later, your latest pages of history, your latest downloads and your newest highlights,
// each with how many it holds. With words, only what has all of them, and the counts of what matches. It is part of your
// own browsing, so its route is under /api/browser/browsing, which agents are refused.
import type { BookmarkNode, BrowsingOverview } from '../../shared/browser.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { loadBookmarks } from './bookmarks.ts';
import { countDownloads, listDownloads } from './downloads.ts';
import { highlightCount, listHighlights } from './highlights.ts';
import { frecency, historyCount, historyMatchCount, historyUrl, listHistory, searchHistory, table } from './history.ts';
import { loadLater } from './later.ts';

/** How many items of each list the overview gives. */
export const OVERVIEW = { bookmarks: 8, later: 4, history: 6, downloads: 4, highlights: 3 };

/** The words of a search: lower case, split on spaces, at most 8. */
const wordsOf = (q: string): string[] => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

/** The bookmarks in the order the Library's Bookmarks list shows them: the bar, then Other bookmarks, folder by folder (12 levels deep at most). */
function inListOrder(nodes: BookmarkNode[]): BookmarkNode[] {
  const byParent = new Map<string, BookmarkNode[]>();
  for (const n of nodes) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  const out: BookmarkNode[] = [];
  const walk = (parent: string, folders: number) => {
    for (const n of (byParent.get(parent) ?? []).sort((a, b) => a.pos - b.pos)) {
      if (n.url) out.push(n);
      else if (folders < 12) walk(n.id, folders + 1);
    }
  };
  walk('bar', 0);
  walk('other', 0);
  return out;
}

/**
 * The bookmarks, the most used first: each one's score is the frecency of its page in your history (0 when it has none).
 * The count is of every bookmark that matches, as the Bookmarks list shows them; the few shown name a page once.
 */
function bookmarksOf(db: DB, words: string[], now: number): { count: number; items: BookmarkNode[] } {
  table(db);
  const all = inListOrder(loadBookmarks(db));
  const matching = words.length ? all.filter((b) => words.every((w) => `${b.title}\n${b.url}`.toLowerCase().includes(w))) : all;
  // The same page under two bookmarks shows once (the first of them in list order).
  const seen = new Set<string>();
  const distinct = matching.filter((b) => {
    const key = (historyUrl(b.url!) ?? b.url!).replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const find = db.prepare('select visits, typed, at from browser_history where url = ?');
  const scored = distinct.map((b) => {
    const u = historyUrl(b.url!) ?? b.url!;
    // The page may be kept with or without a slash at its end.
    const row = (find.get(u) ?? find.get(u.endsWith('/') ? u.slice(0, -1) : u + '/')) as { visits: number; typed: number; at: number } | undefined;
    return { b, score: row ? frecency(row, now) : 0 };
  });
  // Sorting is stable: bookmarks with the same score keep their list order.
  scored.sort((x, y) => y.score - x.score);
  return { count: matching.length, items: scored.slice(0, OVERVIEW.bookmarks).map((s) => s.b) };
}

/** Your own history's count and latest pages (with words: the likeliest of those that match). */
function historyOf(db: DB, q: string, words: string[], now: number): BrowsingOverview['history'] {
  if (!words.length) return { count: historyCount(db), items: listHistory(db, { limit: OVERVIEW.history }) };
  return { count: historyMatchCount(db, q), items: searchHistory(db, q, now).slice(0, OVERVIEW.history) };
}

/** The whole overview: each list's count and its first few items. */
export function browsingOverview(db: DB, o: { q?: string; now?: number } = {}): BrowsingOverview {
  const now = o.now ?? Date.now();
  const words = wordsOf(o.q ?? '');
  // The search words, as the stores read them (lower case, at most 8, one space between them).
  const q = words.join(' ');

  const later = loadLater(db).filter((n) => n.readAt === undefined && (!words.length || words.every((w) => `${n.title}\n${n.url}`.toLowerCase().includes(w))));
  later.sort((a, b) => b.addedAt - a.addedAt);

  return {
    bookmarks: bookmarksOf(db, words, now),
    later: { count: later.length, items: later.slice(0, OVERVIEW.later) },
    history: historyOf(db, q, words, now),
    downloads: { count: countDownloads(db, q), items: listDownloads(db, { q, limit: OVERVIEW.downloads }) },
    highlights: { count: highlightCount(db, q), items: listHighlights(db, { q, limit: OVERVIEW.highlights }) },
  };
}

export function overviewRoutes(d: Deps) {
  const { app, db } = d;
  app.get('/api/browser/browsing/overview', async (req) => {
    const query = req.query as { q?: unknown };
    return browsingOverview(db, { q: String(query.q ?? '').slice(0, 300) });
  });
}
