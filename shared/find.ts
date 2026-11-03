// Finding things by their words, as someone types: shared by the search box (instantly, in the page) and the
// server. A word of the query counts when an item holds it whole, at the start of one of its words (typed so
// far), inside one, or with its letters in order (a typo); the title counts most, then
// other names for it, then its description. Words like "how" or "the" do not count, and items holding more
// of the query's words come first. Among what matches, what you use comes up: what you picked from the box
// before (most when you typed the same), and the places you visit. What the search box gets from the server
// is typed here too, and the places it can look in.
import type { MemoryKind, MemoryScope } from './memory.ts';
import type { Agent, SearchHit } from './types.ts';

/** What a search finds of an item: its fields as the matcher reads them. */
export interface Findable {
  title: string;
  /** Other names for it ("dark mode" for a theme), matched almost like the title. */
  keywords?: string;
  /** Its description, and where it is. */
  text?: string;
}

export interface WordMatch {
  score: number;
  /** Parts of the title that matched, [start, end), to mark. */
  marks: [number, number][];
}

const STOP = new Set(
  'a an and are as at be but by can could do does for from has have how i in into is it its me my not of on or our please so that the their them then there these they this to was we what when where which who why will with would you your'.split(' '),
);

/** Lower case, without accents: "Mémoire" finds "memoire". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const WORD = /[\p{L}\p{N}]+/gu;

/** A query's words worth matching on (all of them when it has only small ones). */
export function queryWords(q: string): string[] {
  const all = [...new Set(fold(q).match(WORD) ?? [])];
  const real = all.filter((w) => !STOP.has(w));
  return real.length ? real : all;
}

interface Folded {
  text: string;
  /** Each word: where it starts, and the word. */
  words: { at: number; w: string }[];
}

const folded = new WeakMap<object, Folded[]>();

function prepare(item: Findable): Folded[] {
  let f = folded.get(item);
  if (f) return f;
  // Folding keeps the title's length, so marks found in it fit the title as shown.
  f = [item.title, item.keywords ?? '', item.text ?? ''].map((s) => {
    const text = fold(s);
    return { text, words: [...text.matchAll(WORD)].map((m) => ({ at: m.index!, w: m[0] })) };
  });
  folded.set(item, f);
  return f;
}

/** How a word matches a field: 10 whole, 7 at a word's start, 4 inside a word, 2 its letters in order; where. */
function matchWord(w: string, f: Folded, last: boolean): { s: number; at?: number } {
  let best: { s: number; at?: number } = { s: 0 };
  for (const x of f.words) {
    if (x.w === w) return { s: 10, at: x.at };
    if (x.w.startsWith(w)) {
      // A word typed so far ("pass" for "password") counts nearly whole while it is the last one.
      const s = last || w.length >= 4 ? 7 : 5;
      if (s > best.s) best = { s, at: x.at };
    } else if (w.length >= 3 && x.w.includes(w)) {
      if (best.s < 4) best = { s: 4, at: x.at + x.w.indexOf(w) };
    } else if (w.length >= 4 && best.s < 2 && inOrder(w, x.w)) best = { s: 2 };
  }
  return best;
}

/**
 * A typo: the word's letters in order inside one word that starts the same, with at most two letters more and,
 * for a word of six letters or more, one left out ("pasword", "memroy"; not "dark" in "sidebar").
 */
function inOrder(w: string, word: string): boolean {
  if (word[0] !== w[0]) return false;
  const slack = w.length >= 6 ? 1 : 0;
  if (word.length < w.length - slack || word.length > w.length + 2) return false;
  let i = 0;
  let miss = 0;
  for (const c of w) {
    const j = word.indexOf(c, i);
    if (j < 0) {
      if (++miss > slack) return false;
      continue;
    }
    i = j + 1;
  }
  return true;
}

const WEIGHT = [3, 2, 1];

/** How well an item matches the query's words (0: not at all). */
export function matchItem(item: Findable, words: string[], q?: string): WordMatch {
  if (!words.length) return { score: 0, marks: [] };
  const fields = prepare(item);
  let score = 0;
  let hit = 0;
  const marks: [number, number][] = [];
  words.forEach((w, i) => {
    let best = 0;
    for (let k = 0; k < fields.length; k++) {
      const m = matchWord(w, fields[k], i === words.length - 1);
      if (m.s * WEIGHT[k] > best) best = m.s * WEIGHT[k];
      if (k === 0 && m.at != null && m.s >= 4) marks.push([m.at, m.at + w.length]);
    }
    if (best) hit++;
    score += best * Math.min(1, w.length / 3);
  });
  if (!hit) return { score: 0, marks: [] };
  // Holding all the words matters most; a title that starts with what was typed, or is it, comes first.
  const cover = hit / words.length;
  score *= 0.4 + 0.6 * cover * cover;
  const t = fields[0].text;
  const typed = fold(q ?? words.join(' ')).trim();
  if (typed && t === typed) score += 40;
  else if (typed && t.startsWith(typed)) score += 20;
  return { score, marks: mergeMarks(marks) };
}

function mergeMarks(m: [number, number][]): [number, number][] {
  const s = [...m].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of s) {
    const p = out[out.length - 1];
    if (p && r[0] <= p[1]) p[1] = Math.max(p[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

// ---- what the server finds ----------------------------------------------------------------------

/** A session found by its title or first message (words), or by what it is about (meaning). */
export interface FoundSession {
  key: string;
  agent: Agent;
  acpName?: string;
  title: string;
  firstPrompt?: string;
  cwd?: string;
  updatedAt?: number;
  /** Alike in meaning (cosine similarity), when found that way. */
  meaning?: number;
  score: number;
}

export interface FoundNote {
  id: number;
  scope: MemoryScope;
  scopeKey: string;
  kind: MemoryKind;
  text: string;
  updatedAt: number;
  meaning?: number;
}

export interface FindResponse {
  /** Search by meaning answered this time. */
  meaning: boolean;
  /** What else is alike in meaning, best first: the app's own pages, settings and actions, apps, tasks, assistants,
   * skills, pages, connections and spaces, by the ids the search box gives them. */
  alike: { id: string; score: number }[];
  sessions: FoundSession[];
  messages: SearchHit[];
  notes: FoundNote[];
}

// ---- where it looks -------------------------------------------------------------------------------

/**
 * The places the search box can look in, as its Search in menu lists them: `actions` is the app's own pages
 * and actions (Go to, Actions), `settings` holds the themes too, `guide` is Help. None picked is everywhere.
 * The places picked are kept for every device (server/find), and go with each search (`/api/find?in=`).
 */
export const FIND_PLACES = ['sessions', 'messages', 'spaces', 'pages', 'templates', 'files', 'memory', 'tasks', 'assistants', 'skills', 'connections', 'settings', 'actions', 'guide'] as const;
export type FindPlace = (typeof FIND_PLACES)[number];

/** Places as given (a list, or "a,b" as an address has them), tidied: known ones once, in the menu's order; all of them is everywhere, []. */
export function findPlaces(v: unknown): FindPlace[] {
  const given = new Set(typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v.map(String) : []);
  const out = FIND_PLACES.filter((p) => given.has(p));
  return out.length === FIND_PLACES.length ? [] : out;
}

// ---- what you use ---------------------------------------------------------------------------------

/**
 * How the search box knows what you use (server/find/usage.ts keeps it, for every device). Each count is
 * worth less as it ages (a visit halves in two weeks, a pick in a month), so what you use now counts most.
 * Picks and visits are keyed by the ids the search box gives things; a place is a page (go:usage), a Settings
 * section (sec:memory), a session (s:<key>), a template (app:<id>), a page (page:<id>), a space (space:<id>) or a
 * file (f:<path>).
 */
export interface FindUsage {
  /** Things picked from the search box. */
  picks: Record<string, number>;
  /** Places visited, by any way there, and when last. */
  visits: Record<string, { n: number; at: number }>;
  /** What was typed when something was picked: [query (usageQuery), id, count]. */
  queries: [string, string, number][];
}

export const PICK_HALF_LIFE = 30 * 86400_000;
export const VISIT_HALF_LIFE = 14 * 86400_000;

/** A count `n` made at `at`, as it is worth at `now`. */
export const decayed = (n: number, at: number, now: number, half: number) => n * 2 ** (-Math.max(0, now - at) / half);

/** A query as picks remember it: folded, spaces tidied, short. */
export const usageQuery = (q: string) => fold(q).trim().replace(/\s+/g, ' ').slice(0, 40);

/**
 * How much each thing was picked for this query before: what was typed the same counts whole, a longer query
 * that starts with this one (typed so far) 0.6, a shorter one this one goes on from 0.4.
 */
export function queryAffinity(u: FindUsage | null, q: string): Map<string, number> {
  const out = new Map<string, number>();
  const cq = usageQuery(q);
  if (!u || cq.length < 2) return out;
  for (const [sq, id, n] of u.queries) {
    const w = sq === cq ? 1 : sq.startsWith(cq) ? 0.6 : sq.length >= 3 && cq.startsWith(sq) ? 0.4 : 0;
    if (w) out.set(id, (out.get(id) ?? 0) + w * n);
  }
  return out;
}

/**
 * What use adds to a match's score: picked for this query before (up to 0.3: enough to bring a match up from
 * a few places down), picked at all (up to 0.08), visited (up to 0.08; the section a setting is in, 0.3 of
 * its visits). The last two count as much as the item matches (`strength`, 0 to 1: a title that starts with
 * what was typed 1, a word in its description far less), so a place used often does not pass a clearly better
 * match on the strength of a stray word. The best match by words alone scores about 0.13 to 0.28.
 */
export function usageBoost(u: FindUsage | null, affinity: Map<string, number>, id: string, within?: string, strength = 1): number {
  if (!u) return 0;
  const a = affinity.get(id) ?? 0;
  const p = u.picks[id] ?? 0;
  const v = (u.visits[id]?.n ?? 0) + (within ? 0.3 * (u.visits[within]?.n ?? 0) : 0);
  return Math.min(0.3, 0.12 * Math.log2(1 + a)) + strength * (Math.min(0.08, 0.03 * Math.log2(1 + p)) + Math.min(0.08, 0.025 * Math.log2(1 + v)));
}

/** How strongly a match by words holds (matchItem's score): 1 for a title that starts with what was typed. */
export const matchStrength = (score: number) => Math.max(0.3, Math.min(1, score / 30));

/** Where an address is, as a place the search box can find (null: nowhere it lists). */
export function placeOf(pathname: string, search: string, pagePaths: Record<string, string>): string | null {
  const q = new URLSearchParams(search);
  if (pathname.startsWith('/s/')) return `s:${decodeURIComponent(pathname.slice(3))}`;
  if (pathname === '/settings') return q.get('s') ? `sec:${q.get('s')}` : 'go:settings';
  if (pathname === '/file') return q.get('path') ? `f:${q.get('path')}` : null;
  const t = /^\/apps\/t\/([^/]+)$/.exec(pathname);
  if (t) return `app:tpl:${decodeURIComponent(t[1])}`;
  const a = /^\/apps\/([^/]+)$/.exec(pathname);
  if (a && a[1] !== 'new' && a[1] !== 'connected') return `app:${decodeURIComponent(a[1])}`;
  const pg = /^\/pages\/([^/]+)$/.exec(pathname);
  if (pg) return `page:${decodeURIComponent(pg[1])}`;
  const md = /^\/media\/([^/]+)$/.exec(pathname);
  if (md) return `media:${decodeURIComponent(md[1])}`;
  // A space, on any of its tabs (its files, knowledge, skills, settings).
  const sp = /^\/spaces\/([^/]+)/.exec(pathname);
  if (sp) return `space:${decodeURIComponent(sp[1])}`;
  // A page's tab (Published pages), or a place on the Files page (its trash, the recent files).
  const full = `${pathname}${q.get('tab') ? `?tab=${q.get('tab')}` : q.get('place') ? `?place=${q.get('place')}` : ''}`;
  return pagePaths[full] ?? pagePaths[pathname] ?? null;
}
