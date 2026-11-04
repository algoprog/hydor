// Finding the app for a request among many (find_apps): an agent in a session writes what the user wants in a few
// words, and gets the apps most likely to do it, best first, to pick one and run it with use_app. There may be a
// handful of apps or very many, so the agent is never handed them all: it is handed the best twenty.
//
// Two lists, fused by rank (reciprocal rank fusion, as memory's notes are found: scores of different kinds never have
// to be compared). By words: BM25 over each app's name, kind, description and the questions its form asks, its name
// counting most, with a plural and a longer word's start matching too; the index is built once and kept until the
// apps change. By meaning, when search by meaning is on (Settings → Memory): the same vectors the search box has for
// apps (shipped for the ready-made ones, made here for yours the moment they are made), against the query's. Then a
// little more for the user's own apps (agents prefer them to ready-made ones that do the same) and for those run lately.
import type { AppRecipe } from '../../shared/apps.ts';
import type { DB } from '../db.ts';
import { appItemText } from '../find/sources.ts';
import { terms } from '../find/bm25.ts';
import { vectorOfText } from '../find/index.ts';
import { meaningOn, queryVector } from '../memory/embed.ts';
import { queryTable, scale, scoreAt } from '../memory/vectors.ts';
import type { Usable } from './use.ts';

/** How many candidates an agent gets by default, and at most. */
export const FIND_K = 20;
export const FIND_MAX = 50;

/** Reciprocal rank fusion's constant, and what each list weighs: the agent writes keywords, so words count for half. */
const RRF_K = 60;
const W_WORDS = 0.5;
const W_MEANING = 1;
/** Below this cosine similarity an app is not taken as alike in meaning (lower than the search box's: here, recall matters). */
const MIN_SIMILARITY = 0.25;
/** A little more for the user's own apps, and for those run within the last weeks. */
const OWN = 1.15;
const FRESH = 0.15;
const FRESH_DAYS = 30;

// ---- words -------------------------------------------------------------------------------------------------

export { stem } from '../find/bm25.ts';

/** What an app is found by, each part as many times as it counts: its name thrice, its kind twice, the rest once. */
function fieldsOf(r: AppRecipe): string[] {
  const name = r.name;
  return [
    name,
    name,
    name,
    r.category ?? '',
    r.category ?? '',
    r.description,
    ...r.fields.map((f) => `${f.label} ${f.help ?? ''}`),
    ...r.answer.map((a) => a.label),
  ];
}

interface Doc {
  u: Usable;
  tf: Map<string, number>;
  len: number;
}

interface Index {
  sig: string;
  docs: Doc[];
  /** How many apps have each word. */
  df: Map<string, number>;
  /** Which apps have each word, by their place in docs. */
  postings: Map<string, number[]>;
  avgLen: number;
}

let cached: Index | null = null;

/** What the index was built from: when the apps change, it is built again. */
const signature = (list: Usable[]) => list.map((u) => `${u.ref}:${u.recipe.name.length}:${u.recipe.description.length}:${u.recipe.fields.length}:${(u.recipe as { updatedAt?: number }).updatedAt ?? 0}`).join('|');

function indexOf(list: Usable[]): Index {
  const sig = signature(list);
  if (cached?.sig === sig) return cached;
  const docs: Doc[] = [];
  const df = new Map<string, number>();
  const postings = new Map<string, number[]>();
  let total = 0;
  for (const u of list) {
    const tf = new Map<string, number>();
    let len = 0;
    for (const part of fieldsOf(u.recipe))
      for (const t of terms(part)) {
        tf.set(t, (tf.get(t) ?? 0) + 1);
        len++;
      }
    const at = docs.length;
    docs.push({ u, tf, len });
    total += len;
    for (const t of tf.keys()) {
      df.set(t, (df.get(t) ?? 0) + 1);
      const p = postings.get(t);
      if (p) p.push(at);
      else postings.set(t, [at]);
    }
  }
  cached = { sig, docs, df, postings, avgLen: docs.length ? total / docs.length : 1 };
  return cached;
}

/** The index's words a query word stands for: itself, and (a longer one) words that share its start: "forecast" finds "forecasts", "cook" "cooking". */
function variants(ix: Index, q: string): [string, number][] {
  const out: [string, number][] = ix.df.has(q) ? [[q, 1]] : [];
  if (q.length < 4) return out;
  const head = q.length >= 6 ? q.slice(0, q.length - 2) : q;
  for (const t of ix.df.keys()) if (t !== q && t.length >= 4 && (t.startsWith(head) || (q.startsWith(t) && t.length >= q.length - 3))) out.push([t, 0.7]);
  return out.slice(0, 12);
}

/** The apps by their words against the query's, best first (BM25), with their scores. */
export function byWords(list: Usable[], query: string): { u: Usable; score: number }[] {
  const ix = indexOf(list);
  const n = ix.docs.length;
  const k1 = 1.2;
  const b = 0.75;
  const scores = new Map<number, number>();
  for (const q of new Set(terms(query)))
    for (const [t, weight] of variants(ix, q)) {
      const df = ix.df.get(t) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (const at of ix.postings.get(t) ?? []) {
        const d = ix.docs[at];
        const f = d.tf.get(t) ?? 0;
        const s = (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / ix.avgLen));
        scores.set(at, (scores.get(at) ?? 0) + weight * s);
      }
    }
  return [...scores.entries()].sort((a, b2) => b2[1] - a[1]).map(([at, score]) => ({ u: ix.docs[at].u, score }));
}

// ---- meaning -------------------------------------------------------------------------------------------------

/** The apps alike in meaning to the query, best first, with their similarity; none when search by meaning is off or not ready. */
async function byMeaning(db: DB, list: Usable[], query: string): Promise<{ u: Usable; score: number }[]> {
  if (!meaningOn(db)) return [];
  // An agent's search may wait a little for the model to answer (the search box does not).
  const v = await queryVector(db, query, { wait: true, timeoutMs: 15_000 }).catch(() => null);
  if (!v) return [];
  const t = queryTable(v);
  const out: { u: Usable; score: number }[] = [];
  for (const u of list) {
    const code = vectorOfText(db, appItemText(u.recipe.name, u.own, u.recipe.description));
    if (!code) continue;
    const s = scoreAt(t, code, 0) * scale(code, 0);
    if (s >= MIN_SIMILARITY) out.push({ u, score: s });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---- together ------------------------------------------------------------------------------------------------

export interface Found {
  u: Usable;
  score: number;
  /** Its rank by words and its similarity in meaning, when it was found that way. */
  wordRank?: number;
  meaning?: number;
}

/** When each app last ran (its own runs, not its steps' or its conversations'), by its run's app ("tpl:<id>" for a ready-made one). */
function lastRuns(db: DB): Map<string, number> {
  try {
    return new Map((db.prepare("select app_id as id, max(created_at) as at from app_runs where source not in ('step', 'chat') group by app_id").all() as { id: string; at: number }[]).map((r) => [r.id, r.at]));
  } catch {
    return new Map();
  }
}

/**
 * The apps most likely to do what the query asks, best first, at most `k`. `matched`: false when neither words nor
 * meaning found any, and the list is the apps by when they last ran instead (so the agent still sees what there is).
 */
export async function findApps(db: DB, list: Usable[], query: string, k = FIND_K, now = Date.now()): Promise<{ found: Found[]; matched: boolean; meaning: boolean }> {
  const want = Math.max(1, Math.min(FIND_MAX, Math.round(k) || FIND_K));
  const q = query.trim().slice(0, 500);
  const last = lastRuns(db);
  const lift = (u: Usable) => {
    const at = last.get(u.app);
    const fresh = at ? Math.exp(-Math.max(0, now - at) / (FRESH_DAYS * 86400_000)) : 0;
    return (u.own ? OWN : 1) * (1 + FRESH * fresh);
  };
  const words = q ? byWords(list, q).slice(0, 200) : [];
  const meant = q ? await byMeaning(db, list, q) : [];
  const fused = new Map<string, Found>();
  words.forEach((h, i) => fused.set(h.u.ref, { u: h.u, score: W_WORDS / (RRF_K + i + 1), wordRank: i + 1 }));
  meant.slice(0, 200).forEach((h, i) => {
    const f = fused.get(h.u.ref);
    if (f) {
      f.score += W_MEANING / (RRF_K + i + 1);
      f.meaning = h.score;
    } else fused.set(h.u.ref, { u: h.u, score: W_MEANING / (RRF_K + i + 1), meaning: h.score });
  });
  const ranked = [...fused.values()].map((f) => ({ ...f, score: f.score * lift(f.u) })).sort((a, b) => b.score - a.score);
  if (ranked.length) return { found: ranked.slice(0, want), matched: true, meaning: meant.length > 0 || (meaningOn(db) && !!q) };
  // Nothing matched: the apps there are, the ones run lately and the user's own first.
  const fallback = [...list].sort((a, b) => (last.get(b.app) ?? 0) - (last.get(a.app) ?? 0) || Number(b.own) - Number(a.own)).map((u) => ({ u, score: 0 }));
  return { found: fallback.slice(0, want), matched: false, meaning: false };
}

/** For tests: forget the index built. */
export const dropAppIndex = () => {
  cached = null;
};
