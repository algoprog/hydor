// Finding the answer UIs that fit (find_ui): an agent writes in a few words what its answer shows ("compare three
// laptops by price and battery", "recipe with ingredients and steps") and gets the few UIs most likely to show it, best
// first, with the data each takes. There are more than a hundred, so the agent is never handed them all.
//
// Two lists fused by rank (reciprocal rank fusion, as apps, skills and memory's notes are found), so scores of different
// kinds never have to be compared. By words: BM25 over each UI's title, name, keywords and use (find/bm25.ts: plurals made
// singular, a longer word's start matching too), the title counting most; the catalog ships with the app, so the index is
// built once. By meaning, while search by meaning is on (Settings → Memory): each UI's vector, made ahead of time and
// shipped (server/find/shipped-vectors.json, npm run find:vectors), against the query's.
import { ANSWER_UIS, type AnswerUiSpec } from '../../shared/answer-ui/index.ts';
import type { DB } from '../db.ts';
import { Bm25, terms } from '../find/bm25.ts';
import { vectorOfText } from '../find/index.ts';
import { answerUiText } from '../find/sources.ts';
import { meaningOn, queryVector } from '../memory/embed.ts';
import { queryTable, scale, scoreAt } from '../memory/vectors.ts';

/** How many UIs an agent gets by default, and at most. */
export const UI_K = 5;
export const UI_MAX = 12;
/** Reciprocal rank fusion's constant; the agent writes keywords, and the UIs are described with care, so both lists weigh the same. */
const RRF_K = 60;
const W_WORDS = 1;
const W_MEANING = 1;
/** Below this cosine similarity a UI is not taken as alike in meaning (low: here recall matters, and words check it). */
const MIN_SIMILARITY = 0.25;
/**
 * Words any request may have, which say nothing of the kind of UI ("show", "answer", "with"), and when it is for
 * ("flights to Tokyo next week" is about flights, not the week).
 */
const FILLER = new Set(
  'show showing shows answer answers display ui card cards view with some list of the a an and for to in on my me please want need make give today tomorrow tonight yesterday week month year next last this now'.split(' '),
);

/** What a UI is found by, each part as many times as it counts: its title thrice, its name and keywords twice, its use once. */
function fieldsOf(s: AnswerUiSpec): string[] {
  const name = s.id.replace(/-/g, ' ');
  return [s.title, s.title, s.title, name, name, s.keywords, s.keywords, s.use];
}

let cached: { list: AnswerUiSpec[]; ix: Bm25<AnswerUiSpec> } | null = null;
const indexOf = (list: AnswerUiSpec[]) => {
  if (cached?.list !== list) cached = { list, ix: new Bm25(list.map((s) => ({ item: s, fields: fieldsOf(s) }))) };
  return cached.ix;
};

/** The UIs by their words against the query's, best first. */
export const uisByWords = (query: string, list: AnswerUiSpec[] = ANSWER_UIS) => indexOf(list).searchTerms(terms(query).filter((t) => !FILLER.has(t)));

/** The UIs alike in meaning to the query, best first; none while search by meaning is off or not ready. */
async function byMeaning(db: DB, list: AnswerUiSpec[], query: string): Promise<{ spec: AnswerUiSpec; score: number }[]> {
  if (!meaningOn(db)) return [];
  // An agent's search may wait a little for the model to answer (the search box does not).
  const v = await queryVector(db, query, { wait: true, timeoutMs: 15_000 }).catch(() => null);
  if (!v) return [];
  const t = queryTable(v);
  const out: { spec: AnswerUiSpec; score: number }[] = [];
  for (const spec of list) {
    const code = vectorOfText(db, answerUiText(spec));
    if (!code) continue;
    const score = scoreAt(t, code, 0) * scale(code, 0);
    if (score >= MIN_SIMILARITY) out.push({ spec, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface FoundUi {
  spec: AnswerUiSpec;
  score: number;
  /** Its rank by words (from 1) and its similarity in meaning, when it was found that way. */
  wordRank?: number;
  meaning?: number;
}

/** The UIs most likely to show what the query says, best first, at most `k`; `meaning`: search by meaning answered. */
export async function findUis(db: DB, query: string, k = UI_K, list: AnswerUiSpec[] = ANSWER_UIS): Promise<{ found: FoundUi[]; meaning: boolean }> {
  const want = Math.max(1, Math.min(UI_MAX, Math.round(k) || UI_K));
  const q = query.trim().slice(0, 500);
  if (!q) return { found: [], meaning: false };
  const words = uisByWords(q, list).slice(0, 60);
  const meant = (await byMeaning(db, list, q)).slice(0, 60);
  const fused = new Map<string, FoundUi>();
  words.forEach((h, i) => fused.set(h.item.id, { spec: h.item, score: W_WORDS / (RRF_K + i + 1), wordRank: i + 1 }));
  meant.forEach((h, i) => {
    const f = fused.get(h.spec.id) ?? { spec: h.spec, score: 0 };
    f.score += W_MEANING / (RRF_K + i + 1);
    f.meaning = h.score;
    fused.set(h.spec.id, f);
  });
  return { found: [...fused.values()].sort((a, b) => b.score - a.score).slice(0, want), meaning: meant.length > 0 };
}

/** For tests: forget the index built. */
export const dropUiIndex = () => {
  cached = null;
};
