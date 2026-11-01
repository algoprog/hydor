// Searching knowledge bases: by words (the full-text index, ranked by BM25), by meaning (each passage's vector
// against the question's, when search by meaning is on), or for exact text (a phrase, or a /pattern/), as
// grep would. Words and meaning are joined by rank (reciprocal rank fusion), weighted as memory's search is.
import type { KnowledgeHit } from '../../shared/knowledge.ts';
import type { DB } from '../db.ts';
import { queryVector } from '../memory/embed.ts';
import { anyWords } from '../memory/search.ts';
import { BYTES, queryTable, scale, scoreAt } from '../memory/vectors.ts';
import { vectorBlock } from './indexer.ts';
import { baseRows, knowledgeSchema } from './store.ts';

export type SearchMode = 'auto' | 'words' | 'meaning' | 'exact';

/** Reciprocal rank fusion, and what each list weighs (as memory's search: measured there, with the same model). */
const RRF_K = 60;
const W_WORDS = 0.1;
const W_MEANING = 1;
/** Below this a passage is not taken as being about the question. */
const MIN_SIMILARITY = 0.2;
/** Most passages scanned for exact text. */
const MAX_SCAN = 400_000;

interface Row {
  id: number;
  doc: number;
  seq: number;
  part: string | null;
  text: string;
  path: string;
  title: string;
  base: string;
}

const rowsSql = `select c.id as id, c.doc as doc, c.seq as seq, c.part as part, c.text as text, d.path as path, d.title as title, d.base as base
  from kb_chunks c join kb_docs d on d.id = c.doc`;

/** A question given as /pattern/flags: a regular expression for exact text. */
function patternOf(q: string): RegExp | null {
  const m = /^\/(.+)\/([gimsuy]*)$/s.exec(q.trim());
  if (!m) return null;
  try {
    return new RegExp(m[1], m[2].includes('i') ? 'i' : '');
  } catch {
    return null;
  }
}

function byWords(db: DB, bases: string[], query: string, limit: number): number[] {
  const fts = anyWords(query);
  if (!fts) return [];
  try {
    return (
      db
        .prepare(`select c.id as id from kb_fts join kb_chunks c on c.id = kb_fts.rowid join kb_docs d on d.id = c.doc where kb_fts match ? and d.base in (${bases.map(() => '?').join(',')}) order by bm25(kb_fts) limit ?`)
        .all(fts, ...bases, limit) as { id: number }[]
    ).map((r) => r.id);
  } catch {
    return [];
  }
}

function byMeaning(db: DB, bases: string[], q: Float32Array, limit: number): { id: number; score: number }[] {
  const t = queryTable(q);
  const best: { id: number; score: number }[] = [];
  for (const base of bases) {
    const b = vectorBlock(db, base);
    for (let i = 0, off = 0; i < b.ids.length; i++, off += BYTES) {
      const s = scoreAt(t, b.codes, off) * scale(b.codes, off);
      if (s < MIN_SIMILARITY || (best.length >= limit && s <= best[best.length - 1].score)) continue;
      best.push({ id: b.ids[i], score: s });
      best.sort((x, y) => y.score - x.score);
      if (best.length > limit) best.pop();
    }
  }
  return best;
}

/** Passages holding the exact text (case aside), or matching the pattern, in reading order. */
function byText(db: DB, bases: string[], query: string, limit: number): number[] {
  const re = patternOf(query);
  const inBases = `d.base in (${bases.map(() => '?').join(',')})`;
  if (!re) {
    const phrase = query.trim().replace(/^"(.*)"$/s, '$1');
    if (!phrase) return [];
    return (db.prepare(`select c.id as id from kb_chunks c join kb_docs d on d.id = c.doc where ${inBases} and instr(lower(c.text), lower(?)) > 0 order by d.path, c.seq limit ?`).all(...bases, phrase, limit) as { id: number }[]).map(
      (r) => r.id,
    );
  }
  const out: number[] = [];
  let n = 0;
  for (const r of db.prepare(`select c.id as id, c.text as text from kb_chunks c join kb_docs d on d.id = c.doc where ${inBases} order by d.path, c.seq`).iterate(...bases) as Iterable<{ id: number; text: string }>) {
    if (++n > MAX_SCAN || out.length >= limit) break;
    if (re.test(r.text)) out.push(r.id);
  }
  return out;
}

/** The passage's text around where the exact text or the question's words are, at most `max` characters. */
export function excerpt(text: string, query: string, max = 900): string {
  if (text.length <= max) return text;
  const re = patternOf(query);
  const lower = text.toLowerCase();
  let at = re ? (re.exec(text)?.index ?? -1) : lower.indexOf(query.trim().replace(/^"(.*)"$/s, '$1').toLowerCase());
  if (at < 0) {
    const ws = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
    at = Math.min(...ws.map((w) => lower.indexOf(w)).filter((i) => i >= 0), Infinity);
    if (!Number.isFinite(at)) at = 0;
  }
  const start = Math.max(0, Math.min(at - Math.floor(max / 3), text.length - max));
  return `${start > 0 ? '…' : ''}${text.slice(start, start + max).trim()}${start + max < text.length ? '…' : ''}`;
}

export interface SearchResult {
  hits: KnowledgeHit[];
  /** Whether meaning took part (it is on, and its worker answered). */
  meaning: boolean;
}

/** The passages about a question in the bases (all of them when none are named), best first. */
export async function searchKnowledge(db: DB, o: { query: string; bases?: string[]; mode?: SearchMode; limit?: number; vector?: Float32Array | null }): Promise<SearchResult> {
  knowledgeSchema(db);
  const all = baseRows(db);
  const names = new Map(all.map((b) => [b.id, b.name]));
  const bases = o.bases?.length ? all.filter((b) => o.bases!.includes(b.id) || o.bases!.some((n) => n.toLowerCase() === b.name.toLowerCase())).map((b) => b.id) : all.map((b) => b.id);
  const limit = Math.max(1, Math.min(o.limit ?? 8, 50));
  const query = o.query.trim();
  if (!bases.length || !query) return { hits: [], meaning: false };
  const mode: SearchMode = o.mode ?? (patternOf(query) || /^".+"$/s.test(query) ? 'exact' : 'auto');
  const pool = Math.max(50, limit * 4);
  const fused = new Map<number, { rrf: number; by: KnowledgeHit['by']; meaning?: number }>();
  const add = (id: number, rank: number, w: number, by: KnowledgeHit['by'][number]) => {
    const f = fused.get(id) ?? { rrf: 0, by: [] };
    f.rrf += w / (RRF_K + rank + 1);
    f.by.push(by);
    fused.set(id, f);
  };
  let meaning = false;
  if (mode === 'exact') byText(db, bases, query, limit).forEach((id, i) => add(id, i, 1, 'exact'));
  else {
    if (mode !== 'meaning') byWords(db, bases, query, pool).forEach((id, i) => add(id, i, W_WORDS, 'words'));
    if (mode !== 'words') {
      const vec = o.vector !== undefined ? o.vector : await queryVector(db, query, { wait: true, timeoutMs: 30_000 });
      if (vec) {
        meaning = true;
        byMeaning(db, bases, vec, pool).forEach((h, i) => {
          add(h.id, i, W_MEANING, 'meaning');
          fused.get(h.id)!.meaning = h.score;
        });
      }
    }
  }
  if (!fused.size) return { hits: [], meaning };
  const ids = [...fused.keys()];
  const rows = new Map((db.prepare(`${rowsSql} where c.id in (${ids.map(() => '?').join(',')})`).all(...ids) as Row[]).map((r) => [r.id, r]));
  const hits: KnowledgeHit[] = [];
  for (const [id, f] of fused) {
    const r = rows.get(id);
    if (!r) continue;
    hits.push({ ref: `kb:${r.id}`, base: r.base, baseName: names.get(r.base) ?? r.base, docId: r.doc, path: r.path, title: r.title, part: r.part ?? undefined, text: excerpt(r.text, query), score: f.rrf, by: f.by });
  }
  // Exact text keeps reading order; the rest goes by rank.
  return { hits: mode === 'exact' ? hits.slice(0, limit) : hits.sort((a, b) => b.score - a.score).slice(0, limit), meaning };
}
