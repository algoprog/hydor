// Finding by words among a few hundred short things kept in memory (skills): BM25 over each one's fields, a field
// given twice counting twice. Words are taken as memory's index takes them, plurals made singular, and a query word
// also finds the words that share its start ("forecast" finds "forecasts", "cook" finds "cooking").
import { words } from '../memory/store.ts';

/** A word as the index keeps it: plurals made singular ("recipes" → "recipe", "matches" → "match", "movies" → "movie"). */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}ie`;
  if (w.length > 4 && /(?:[sxz]|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export const terms = (text: string) => words(text).map(stem);

const K1 = 1.2;
const B = 0.75;

export class Bm25<T> {
  private docs: { item: T; tf: Map<string, number>; len: number }[] = [];
  /** How many documents have each word, and which (by their place in docs). */
  private df = new Map<string, number>();
  private postings = new Map<string, number[]>();
  private avgLen = 1;

  constructor(items: { item: T; fields: string[] }[]) {
    let total = 0;
    for (const { item, fields } of items) {
      const tf = new Map<string, number>();
      let len = 0;
      for (const f of fields)
        for (const t of terms(f)) {
          tf.set(t, (tf.get(t) ?? 0) + 1);
          len++;
        }
      const at = this.docs.length;
      this.docs.push({ item, tf, len });
      total += len;
      for (const t of tf.keys()) {
        this.df.set(t, (this.df.get(t) ?? 0) + 1);
        const p = this.postings.get(t);
        if (p) p.push(at);
        else this.postings.set(t, [at]);
      }
    }
    this.avgLen = this.docs.length ? total / this.docs.length : 1;
  }

  /** The index's words a query word stands for: itself, and (a longer one) words that share its start, weighing less. */
  private variants(q: string): [string, number][] {
    const out: [string, number][] = this.df.has(q) ? [[q, 1]] : [];
    if (q.length < 4) return out;
    const head = q.length >= 6 ? q.slice(0, q.length - 2) : q;
    for (const t of this.df.keys()) if (t !== q && t.length >= 4 && (t.startsWith(head) || (q.startsWith(t) && t.length >= q.length - 3))) out.push([t, 0.7]);
    return out.slice(0, 12);
  }

  /** The documents with the query's words, best first, with their scores and how many of the query's words each has. */
  search(query: string): { item: T; score: number; matched: number }[] {
    return this.searchTerms(terms(query));
  }

  /** The same for words already taken as the index takes them (terms). */
  searchTerms(words: string[]): { item: T; score: number; matched: number }[] {
    const n = this.docs.length;
    const scores = new Map<number, { score: number; matched: number }>();
    for (const q of new Set(words)) {
      const hit = new Set<number>();
      for (const [t, weight] of this.variants(q)) {
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        for (const at of this.postings.get(t) ?? []) {
          const d = this.docs[at];
          const f = d.tf.get(t) ?? 0;
          const s = (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / this.avgLen));
          const cur = scores.get(at) ?? { score: 0, matched: 0 };
          cur.score += weight * s;
          if (!hit.has(at)) {
            hit.add(at);
            cur.matched++;
          }
          scores.set(at, cur);
        }
      }
    }
    return [...scores.entries()].sort((a, b) => b[1].score - a[1].score).map(([at, s]) => ({ item: this.docs[at].item, ...s }));
  }
}
