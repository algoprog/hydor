// Finding things by their words, as someone types: shared by the search box (instantly, in the page) and the
// server. A word of the query counts when an item holds it whole, at the start of one of its words (typed so
// far), inside one, or with its letters in order (a typo); the title counts most, then
// other names for it, then its description. Words like "how" or "the" do not count, and items holding more
// of the query's words come first. What the search box gets from the server is typed here too.
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
   * skills, pages and connections, by the ids the search box gives them. */
  alike: { id: string; score: number }[];
  sessions: FoundSession[];
  messages: SearchHit[];
  notes: FoundNote[];
}
