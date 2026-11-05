// rank_by_interest, a tool for apps' steps alone: things with text (papers, posts, models, anything) put in order of how
// well they fit what the user cares about, best first, each with a score and why. What they care about: the interests a
// step gives, or (when it gives none) the user's profile, their projects' names and descriptions and their latest
// sessions' titles, as user_profile reads them (with memory off, their projects alone). By meaning with the embedding
// model on this computer when search by meaning is on (Settings → Memory): the interests embedded as queries, the items
// as documents, by cosine similarity. Else by words: BM25 over the items, each interest a query.
//
// Either way, what the user liked and disliked moves the ranking, as relevance feedback does (Rocchio): each liked text
// pulls the interest it is nearest toward it and counts as an interest of its own; the disliked ones push every
// interest away from them, and an item nearer to something disliked than to anything liked goes down. Paper radar
// ranks a day's papers with it, the papers you saved liked and those you said were not for you disliked.
import type { DB } from '../db.ts';
import type { RunTool } from '../features/types.ts';
import { stem } from '../find/bm25.ts';
import { projectsOf, recentTitles, titleRows } from './about-user.ts';
import { embed } from './embed.ts';
import { userProfile } from './profile.ts';
import { sessionMemoryOn } from './store.ts';

/** Most items one call ranks, interests it weighs, liked or disliked texts it takes, and the characters of each text it reads. */
export const RANK_LIMITS = { items: 2000, interests: 60, feedback: 200, text: 4000 };

/** What the feedback counts (Rocchio's β and γ), a liked text as an interest of its own, and an item nearer to something disliked. */
const BETA = 0.75;
const GAMMA = 0.25;
const LIKED = 0.9;
const PENALTY = 0.5;
/** A session's title counts a little less than the profile and the projects. */
const SESSION_WEIGHT = 0.8;

/** Something the user cares about: its words, what it is called in a why, and how much it counts. */
export interface Interest {
  text: string;
  label: string;
  weight: number;
}

export interface RankItem {
  id: string;
  text: string;
}

/** An item in its place: its score (0 to 1), why in a few words, and the interest it fits best (its place in those given). */
export interface Ranked {
  id: string;
  score: number;
  why: string;
  interest?: number;
}

const clip = (t: string, n: number) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

// ---- by words ----------------------------------------------------------------------------------------------------

/** Words that say little of what a text is about, papers' own among them. */
const STOP = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours paper papers propose proposed proposes present presents show shows shown using use used based approach approaches method methods result results new novel work study via towards toward however well`.split(
    /\s+/,
  ),
);

/** A text's words as the ranking counts them, each time it has them: small letters, no stopwords or bare numbers, plurals as one. */
export function tokens(text: string): string[] {
  return (String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
}

const K1 = 1.2;
const B = 0.75;

interface Doc {
  tf: Map<string, number>;
  len: number;
}

const docOf = (text: string): Doc => {
  const tf = new Map<string, number>();
  const all = tokens(text);
  for (const t of all) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { tf, len: all.length };
};

/** The items as BM25 counts them: how many have each word, and how long they are on average. */
class Words {
  docs: Doc[];
  private df = new Map<string, number>();
  private avg: number;
  constructor(texts: string[]) {
    this.docs = texts.map(docOf);
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avg = this.docs.length ? Math.max(1, this.docs.reduce((n, d) => n + d.len, 0) / this.docs.length) : 1;
  }
  idf(t: string): number {
    const n = this.docs.length;
    const df = this.df.get(t) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }
  /** A query's score for a document (BM25, a word's weight multiplying its part; a weight below 0 takes away), with each word's part. */
  score(q: Map<string, number>, d: Doc): { s: number; parts: [string, number][] } {
    let s = 0;
    const parts: [string, number][] = [];
    for (const [t, w] of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const part = w * this.idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / this.avg)));
      s += part;
      parts.push([t, part]);
    }
    return { s, parts };
  }
  /** What a document of average length with each of the query's words once would score: a score over it reads 0 to 1. */
  top(q: Map<string, number>): number {
    let n = 0;
    for (const [t, w] of q) if (w > 0) n += w * this.idf(t);
    return n;
  }
  /** A query's score for a document as a share of its top (0 to 1), with the words that matched most. */
  match(q: Map<string, number>, d: Doc): { s: number; words: string[] } {
    const top = this.top(q);
    if (top <= 0) return { s: 0, words: [] };
    const r = this.score(q, d);
    return {
      s: Math.max(0, Math.min(1, r.s / top)),
      words: r.parts
        .filter(([, p]) => p > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t),
    };
  }
}

/** A text as a query: its words, each counting once to three times, scaled to add up to 1. */
function queryOf(text: string): Map<string, number> {
  const q = new Map<string, number>();
  for (const t of tokens(text)) q.set(t, Math.min(3, (q.get(t) ?? 0) + 1));
  return unit(q);
}

const unit = (q: Map<string, number>) => {
  const n = [...q.values()].reduce((a, b) => a + Math.abs(b), 0) || 1;
  return new Map([...q].map(([t, w]) => [t, w / n]));
};

/** A liked or disliked text as a query: its twelve words that say most of it (often in it, rare among the items). */
function keyWords(text: string, w: Words): Map<string, number> {
  const d = docOf(text);
  const best = [...d.tf]
    .map(([t, f]) => [t, f * w.idf(t)] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  return unit(new Map(best.map(([t]) => [t, 1])));
}

/** q + β·(the liked near it) − γ·(the disliked): each a query's words, added; its own words and the 40 that weigh most kept. */
function rocchio(q: Map<string, number>, liked: Map<string, number>[], disliked: Map<string, number>[]): Map<string, number> {
  const out = new Map(q);
  const add = (list: Map<string, number>[], f: number) => {
    if (!list.length) return;
    for (const v of list) for (const [t, w] of v) out.set(t, (out.get(t) ?? 0) + (f * w) / list.length);
  };
  add(liked, BETA);
  add(disliked, -GAMMA);
  const added = [...out].filter(([t]) => !q.has(t)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [t] of added.slice(40)) out.delete(t);
  return out;
}

// ---- by meaning --------------------------------------------------------------------------------------------------

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
const normed = (v: ArrayLike<number>): Float32Array => {
  const n = Math.sqrt(dot(v, v)) || 1;
  return Float32Array.from(v, (x) => x / n);
};
const mean = (vs: Float32Array[], dim: number): Float32Array => {
  const out = new Float32Array(dim);
  for (const v of vs) for (let i = 0; i < dim; i++) out[i] += v[i] / vs.length;
  return out;
};

// ---- ranking ------------------------------------------------------------------------------------------------------

/** One way of scoring: an item against each interest (as moved by the feedback), each liked text, and each disliked one. */
interface Scorer {
  interest(i: number, item: number): { s: number; words?: string[] };
  liked(j: number, item: number): number;
  disliked(k: number, item: number): number;
}

/** The profile's lines worth matching on: its sentences of three words or more, without Markdown's marks. */
function profileLines(text: string): string[] {
  return String(text ?? '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((l) => l.replace(/^\s*(?:#+|[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.split(/\s+/).length >= 3);
}

/**
 * What the user cares about when a step names nothing: their profile's lines, their projects (each its name, description
 * and latest sessions' titles) and their latest sessions' titles; with memory off, their projects alone (their names
 * and descriptions).
 */
export function defaultInterests(db: DB, memory: boolean): Interest[] {
  const out: Interest[] = [];
  if (memory) for (const l of profileLines(userProfile(db)?.text ?? '').slice(0, 20)) out.push({ text: l, label: 'your profile', weight: 1 });
  for (const p of projectsOf(db, { titles: memory })) out.push({ text: [p.name, p.about, ...p.recent].filter(Boolean).join('. '), label: `your project “${clip(p.name, 40)}”`, weight: 1 });
  if (memory) for (const t of recentTitles(titleRows(db, 400), 40)) out.push({ text: t.title, label: `your session “${clip(t.title, 50)}”`, weight: SESSION_WEIGHT });
  return out.slice(0, RANK_LIMITS.interests);
}

/**
 * The items in order of how well they fit, best first (`limit` of them): by meaning when the embedding model answers,
 * else by words. `given`: the interests are the step's own (each item says which fits it best, by its place among them).
 */
export async function rankByInterest(db: DB, o: { items: RankItem[]; interests: Interest[]; liked?: string[]; disliked?: string[]; limit?: number; given?: boolean }): Promise<{ ranked: Ranked[]; by: 'meaning' | 'words' | 'none' }> {
  const items = o.items.slice(0, RANK_LIMITS.items).map((x) => ({ id: x.id, text: String(x.text ?? '').slice(0, RANK_LIMITS.text) }));
  const interests = o.interests.filter((x) => x.text.trim()).slice(0, RANK_LIMITS.interests);
  const liked = (o.liked ?? []).map((t) => String(t ?? '').slice(0, RANK_LIMITS.text)).filter((t) => t.trim()).slice(0, RANK_LIMITS.feedback);
  const disliked = (o.disliked ?? []).map((t) => String(t ?? '').slice(0, RANK_LIMITS.text)).filter((t) => t.trim()).slice(0, RANK_LIMITS.feedback);
  const limit = Math.max(1, Math.min(o.limit ?? items.length, items.length || 1));
  // Nothing to go by: the items as they came.
  if (!interests.length && !liked.length) return { ranked: items.slice(0, limit).map((x) => ({ id: x.id, score: 0, why: '' })), by: 'none' };

  let by: 'meaning' | 'words' = 'words';
  let scorer: Scorer | null = null;
  // By meaning: the interests as queries; the items, and what was liked and disliked, as documents.
  const asked = await embed(db, interests.map((x) => x.text.slice(0, 2000)), 'query', { wait: true, timeoutMs: 120_000 }).catch(() => null);
  const docs = asked ? await embed(db, [...items.map((x) => x.text), ...liked, ...disliked], 'document', { wait: true, timeoutMs: 180_000 }).catch(() => null) : null;
  if (asked && docs && docs.length === items.length + liked.length + disliked.length && (asked.length || !interests.length)) {
    by = 'meaning';
    const iv = docs.slice(0, items.length).map(normed);
    const lv = docs.slice(items.length, items.length + liked.length).map(normed);
    const dv = docs.slice(items.length + liked.length).map(normed);
    const qv = asked.map(normed);
    const dim = (iv[0] ?? qv[0] ?? lv[0])?.length ?? 0;
    // Each liked text pulls the interest it is nearest; the disliked push them all away.
    const near = lv.map((l) => (qv.length ? qv.map((q, i) => [i, dot(q, l)] as const).sort((a, b) => b[1] - a[1])[0][0] : -1));
    const away = dv.length ? mean(dv, dim) : null;
    const moved = qv.map((q, i) => {
      const mine = lv.filter((_, j) => near[j] === i);
      const v = Float32Array.from(q);
      if (mine.length) {
        const m = mean(mine, dim);
        for (let k = 0; k < dim; k++) v[k] += BETA * m[k];
      }
      if (away) for (let k = 0; k < dim; k++) v[k] -= GAMMA * away[k];
      return normed(v);
    });
    scorer = {
      interest: (i, item) => ({ s: dot(moved[i], iv[item]) }),
      liked: (j, item) => dot(lv[j], iv[item]),
      disliked: (k, item) => dot(dv[k], iv[item]),
    };
  }
  if (!scorer) {
    const w = new Words(items.map((x) => x.text));
    const qs = interests.map((x) => queryOf(x.text));
    const ls = liked.map((t) => keyWords(t, w));
    const ds = disliked.map((t) => keyWords(t, w));
    const likedDocs = liked.map(docOf);
    const near = likedDocs.map((d) => {
      let best = -1;
      let at = 0;
      qs.forEach((q, i) => {
        const s = w.match(q, d).s;
        if (s > at) [best, at] = [i, s];
      });
      return best;
    });
    const moved = qs.map((q, i) =>
      rocchio(
        q,
        ls.filter((_, j) => near[j] === i),
        ds,
      ),
    );
    scorer = {
      interest: (i, item) => w.match(moved[i], w.docs[item]),
      liked: (j, item) => w.match(ls[j], w.docs[item]).s,
      disliked: (k, item) => w.match(ds[k], w.docs[item]).s,
    };
  }

  const out = items.map((x, item) => {
    // The best of the interests (each as much as it counts), and of the liked texts as interests of their own.
    let pos = 0;
    let why = '';
    let interest: number | undefined;
    interests.forEach((it, i) => {
      const r = scorer!.interest(i, item);
      const s = r.s * it.weight;
      if (s > pos) {
        pos = s;
        interest = i;
        why = `${it.label}${r.words?.length ? ` (${r.words.join(', ')})` : ''}`;
      }
    });
    liked.forEach((t, j) => {
      const s = LIKED * scorer!.liked(j, item);
      if (s > pos) {
        pos = s;
        interest = undefined;
        why = `like “${clip(t.split('\n')[0], 60)}”, which you liked`;
      }
    });
    // Nearer to something disliked than to anything liked: it goes down by how much nearer.
    let neg = 0;
    disliked.forEach((_, k) => (neg = Math.max(neg, scorer!.disliked(k, item))));
    const score = Math.max(0, Math.min(1, pos - PENALTY * Math.max(0, neg - pos)));
    return { id: x.id, score: Math.round(score * 1000) / 1000, why: pos > 0 ? why : '', ...(o.given && interest !== undefined && pos > 0 ? { interest } : {}), at: item };
  });
  out.sort((a, b) => b.score - a.score || a.at - b.at);
  return { ranked: out.slice(0, limit).map(({ at: _at, ...r }) => r), by };
}

/** Texts from a step: a list of strings (or JSON text of one), each trimmed, at most `max`. */
function texts(v: unknown, max: number): string[] {
  let list = v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) {
      try {
        list = JSON.parse(s);
      } catch {}
    }
    if (typeof list === 'string') list = s.split('\n');
  }
  // A record (a paper kept) by its title and what it says.
  const said = (o: Record<string, unknown>) => [o.title, o.text ?? o.abstract ?? o.summary ?? o.tldr].filter((y) => typeof y === 'string' && y.trim()).join('\n');
  return (Array.isArray(list) ? list : [])
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? said(x as Record<string, unknown>) : ''))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, max);
}

/** The items a step gives: { id, text } each (text from title and abstract, or a string alone, when it gives those). */
function itemsOf(v: unknown): RankItem[] {
  let list = v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      list = JSON.parse(v);
    } catch {}
  }
  if (!Array.isArray(list)) return [];
  return list.slice(0, RANK_LIMITS.items).flatMap((x, i): RankItem[] => {
    if (typeof x === 'string') return x.trim() ? [{ id: String(i), text: x }] : [];
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    const text = typeof o.text === 'string' && o.text.trim() ? o.text : [o.title, o.abstract, o.summary, o.description].filter((y) => typeof y === 'string' && y.trim()).join('\n');
    if (!text.trim()) return [];
    return [{ id: o.id === undefined || o.id === null || o.id === '' ? String(i) : String(o.id), text }];
  });
}

export const RANK_BY_INTEREST: RunTool = {
  name: 'rank_by_interest',
  annotations: { readOnlyHint: true },
  description: [
    'Puts items (papers, posts, models: anything with text) in order of how well they fit what the user cares about, best first.',
    'interests: what they care about, in words (a project, a topic, a line each); without them, the user’s profile, their projects (names and descriptions) and their latest sessions’ titles (with memory off, their projects alone).',
    'liked and disliked: texts the user liked (saved, kept) and did not, which move the ranking toward and away from them (relevance feedback).',
    'By meaning with the embedding model on this computer when search by meaning is on, else by words (BM25).',
    'Gives JSON: [{ id, score — 0 to 1, why — what it fits, in a few words, interest — the place of the interest it fits best among those given }], best first, at most limit.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      items: { type: 'array', description: `What to rank (at most ${RANK_LIMITS.items}): [{ "id": "…", "text": "its title and what it says" }].`, items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } } } },
      interests: { type: 'array', items: { type: 'string' }, description: `What the user cares about, each in words (at most ${RANK_LIMITS.interests}); without them, what Hydor knows of the user.` },
      liked: { type: 'array', items: { type: 'string' }, description: `Texts of things the user liked (at most ${RANK_LIMITS.feedback}).` },
      disliked: { type: 'array', items: { type: 'string' }, description: `Texts of things the user did not want (at most ${RANK_LIMITS.feedback}).` },
      limit: { type: 'number', description: 'How many to give back, best first (default: all).' },
    },
    required: ['items'],
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const items = itemsOf(a.items);
    if (!items.length) throw new Error('items: a list like [{ "id": "1", "text": "Its title and what it says" }]');
    const given = texts(a.interests, RANK_LIMITS.interests);
    const interests = given.length ? given.map((t) => ({ text: t, label: `“${clip(t, 60)}”`, weight: 1 })) : defaultInterests(db, sessionMemoryOn(db, ctx.key));
    const limit = Number(a.limit) > 0 ? Math.round(Number(a.limit)) : undefined;
    const { ranked } = await rankByInterest(db, { items, interests, liked: texts(a.liked, RANK_LIMITS.feedback), disliked: texts(a.disliked, RANK_LIMITS.feedback), limit, given: given.length > 0 });
    return JSON.stringify(ranked);
  },
};
