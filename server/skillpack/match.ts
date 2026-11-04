// The skills that fit a request: when a session starts, the few skills that fit its first message best are named in
// the instructions the agent starts with, so that a method written down is used rather than missed among dozens. Found
// as memory's notes are, a top-k by hybrid search: by words (BM25 over each skill's name, keywords and description,
// its name counting most: find/bm25.ts) and, while search by meaning is on (Settings → Memory), by meaning (the vectors
// the search box keeps for skills: shipped for those that come with the app, made here for the others), the two lists
// fused by rank. Only clear matches count (below), so most requests get none.
import type { DB } from '../db.ts';
import { Bm25, terms } from '../find/bm25.ts';
import { vectorOfText } from '../find/index.ts';
import { skillItemText } from '../find/sources.ts';
import { queryVector } from '../memory/embed.ts';
import { queryTable, scale, scoreAt } from '../memory/vectors.ts';

/** At most this many skills are named. */
export const SKILL_K = 3;
/** Reciprocal rank fusion's constant; words proved the surer guide for skills (below), so both lists weigh the same. */
const RRF_K = 60;
const W_WORDS = 1;
const W_MEANING = 1;
/**
 * Measured with mDenseOn on 28 requests against the 66 skills that come with the app (a request against a skill as the
 * search box writes it): the skill a request called for scored 0.23 to 0.50 and was the closest in 16 of 25, while
 * general skills (clarify-first) reach 0.30 to 0.40 for almost any request. So meaning alone counts only for the closest
 * skill (or one within 0.01 of it), from 0.40. Words were surer: a skill counts by words with at least two of the
 * request's words, a BM25 score of 9 or more and at least half the best one's. Together they named the right skill for 19
 * of 24 requests (words alone 17), a wrong one for 2, and none for any of the 4 that no skill fits.
 */
export const SKILL_SIM = 0.4;
const SIM_NEAR = 0.01;
const WORDS_MIN = 9;
const WORDS_NEAR = 0.5;
/** Fewer words than this is a greeting, a yes or a short reply: no skill for it. */
const MIN_WORDS = 4;
/**
 * Words any request may have, left out when skills are found by words: they say nothing of the kind of work ("my kite
 * needs repair after the storm" found clean-up, whose keywords say "clean up after", by "needs" and "after").
 */
const FILLER = new Set(
  'help please need want like make get got let use using would could should might must also just some any all new now today tomorrow yesterday week month year next last after before again still really very much many more most other thing something anything way good great best better first time day one two three sure okay ok thank thanks hi hello hey know think see look give take go going try work done did able'.split(
    ' ',
  ),
);

export interface SkillDoc {
  name: string;
  description: string;
  triggers?: string[];
  category?: string;
}

export interface SkillMatch<T extends SkillDoc = SkillDoc> {
  skill: T;
  score: number;
  /** Its similarity in meaning, and its rank and score by words, when found that way. */
  meaning?: number;
  wordRank?: number;
  words?: number;
}

/** What a skill is found by, each part as many times as it counts: its name thrice, its keywords twice, the rest once. */
const fieldsOf = (s: SkillDoc) => {
  const name = s.name.replace(/[-_]+/g, ' ');
  const keys = (s.triggers ?? []).join(' ').replace(/\*/g, '');
  return [name, name, name, keys, keys, s.category ?? '', s.description];
};

let cached: { sig: string; ix: Bm25<number> } | null = null;
function indexOf(list: SkillDoc[]): Bm25<number> {
  const sig = list.map((s) => `${s.name}:${s.description.length}:${(s.triggers ?? []).length}`).join('|');
  if (cached?.sig !== sig) cached = { sig, ix: new Bm25(list.map((s, i) => ({ item: i, fields: fieldsOf(s) }))) };
  return cached.ix;
}

/** Whether a message is worth a skill at all: not a command, a greeting or a short reply. */
export const worthSkills = (message: string) => !message.trim().startsWith('/') && terms(message).length >= MIN_WORDS;

/**
 * The skills that clearly fit a message, best first, at most `k`. `vector` gives the message's vector (null: by words
 * only); otherwise it is asked of search by meaning when that answers now, without waiting for it to start.
 */
export async function matchSkills<T extends SkillDoc>(db: DB, list: T[], message: string, o: { k?: number; vector?: Float32Array | null } = {}): Promise<SkillMatch<T>[]> {
  const k = o.k ?? SKILL_K;
  const text = message.trim().slice(0, 2000);
  if (!list.length || k < 1 || !worthSkills(text)) return [];
  const byWords = indexOf(list).searchTerms(terms(text).filter((t) => !FILLER.has(t)));
  const vec = o.vector !== undefined ? o.vector : await queryVector(db, text).catch(() => null);
  // Each skill's similarity, by the vector the search box keeps for it (none for a project's own, or one not made yet).
  const sims: { at: number; score: number }[] = [];
  if (vec) {
    const t = queryTable(vec);
    list.forEach((s, at) => {
      const code = vectorOfText(db, skillItemText(s.name, s.description));
      if (code) sims.push({ at, score: scoreAt(t, code, 0) * scale(code, 0) });
    });
    sims.sort((a, b) => b.score - a.score);
  }
  const best = sims[0]?.score ?? 1;
  const fused = new Map<number, SkillMatch<T> & { matched: number }>();
  byWords.slice(0, 50).forEach((h, i) => fused.set(h.item, { skill: list[h.item], score: W_WORDS / (RRF_K + i + 1), wordRank: i, words: h.score, matched: h.matched }));
  sims.slice(0, 50).forEach((h, i) => {
    const f = fused.get(h.at) ?? { skill: list[h.at], score: 0, matched: 0 };
    f.score += W_MEANING / (RRF_K + i + 1);
    f.meaning = h.score;
    fused.set(h.at, f);
  });
  const top = byWords[0]?.score ?? 0;
  const counts = (f: SkillMatch<T> & { matched: number }) =>
    (f.meaning != null && f.meaning >= SKILL_SIM && f.meaning >= best - SIM_NEAR) || (f.words != null && f.matched >= 2 && f.words >= WORDS_MIN && f.words >= WORDS_NEAR * top);
  return [...fused.values()]
    .filter(counts)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ matched: _, ...f }) => f);
}

/** For tests: forget the index built. */
export const dropSkillIndex = () => {
  cached = null;
};
