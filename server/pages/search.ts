// Finding things in the Library: its pages of every kind (pages, slide decks, documents, spreadsheets, LaTeX documents
// and notebooks) and the pictures, videos and sounds kept there, by their titles and descriptions. Hybrid, as memory's
// notes are found (memory/search.ts): one list by words (BM25 over each one's title, which counts twice, its kind and
// its description; a plural and a longer word's start match too), another by meaning (the vector the search box keeps
// for each, made the moment it is made or changed: find/index.ts, with search by meaning on), the two joined by rank
// (reciprocal rank fusion: scores of different kinds never have to be compared). The Library's search field asks it as
// you type (GET /api/library/search), and agents through get_page's query.
import type { MediaItem } from '../../shared/media.ts';
import type { PageInfo } from '../../shared/pages.ts';
import type { DB } from '../db.ts';
import { Bm25 } from '../find/bm25.ts';
import { vectorOfText } from '../find/index.ts';
import { mediaItemText, pageItemText } from '../find/sources.ts';
import { listMedia } from '../media/store.ts';
import { meaningOn, queryVector } from '../memory/embed.ts';
import { queryTable, scale, scoreAt } from '../memory/vectors.ts';
import { listPages } from './store.ts';

/** Reciprocal rank fusion's constant: a list's first gets 1/61, its tenth 1/70. */
const RRF_K = 60;
/** What each list weighs: people look things up here by their names and a few words, so words count for half (as for apps: apps/search.ts). */
const W_WORDS = 0.5;
const W_MEANING = 1;
/** Below this cosine similarity, what meaning alone finds is not taken as being about the query (the search box's: find/index.ts). */
export const MIN_SIMILARITY = 0.35;

/** Words each kind is also found by. */
const KIND_WORDS: Record<string, string> = {
  page: 'page',
  slides: 'slides slide deck presentation',
  doc: 'document',
  sheet: 'spreadsheet sheet table',
  tex: 'latex document paper',
  notebook: 'jupyter notebook',
  diagram: 'diagram flowchart chart drawio mind map org chart',
  image: 'image picture photo',
  video: 'video',
  audio: 'sound audio',
};

export interface LibraryHit {
  /** "page:<id>" or "media:<id>", as the search box knows them. */
  id: string;
  page?: PageInfo;
  media?: MediaItem;
  score: number;
  /** How it was found: by its words, by its meaning, or both. */
  by: ('words' | 'meaning')[];
  /** How alike in meaning (cosine similarity), when it was found that way. */
  meaning?: number;
}

interface Entry {
  id: string;
  page?: PageInfo;
  media?: MediaItem;
  /** The text its vector is of. */
  text: string;
}

/**
 * What the Library holds that fits the query best, best first. `pages`: only these (an agent's, without what is out of
 * its reach); `media`: false leaves pictures, videos and sounds out. Meaning takes part when its model answers now, or
 * (`wait`) within that many milliseconds; `meaning` in the answer says whether it did.
 */
export async function searchLibrary(
  db: DB,
  query: string,
  o: { pages?: PageInfo[]; media?: boolean; limit?: number; wait?: number; min?: number } = {},
): Promise<{ hits: LibraryHit[]; meaning: boolean }> {
  const q = query.trim().slice(0, 300);
  if (!q) return { hits: [], meaning: false };
  const entries: Entry[] = [
    ...(o.pages ?? listPages(db)).map((p) => ({ id: `page:${p.id}`, page: p, text: pageItemText(p) })),
    ...(o.media === false ? [] : listMedia(db).map((m) => ({ id: `media:${m.id}`, media: m, text: mediaItemText(m) }))),
  ];
  if (!entries.length) return { hits: [], meaning: false };
  // By words: the title twice, the kind's words and the description.
  const fields = (e: Entry) => {
    const title = e.page?.title ?? e.media?.title ?? '';
    return [title, title, KIND_WORDS[e.page ? (e.page.kind ?? 'page') : e.media!.kind] ?? '', e.page?.description ?? e.media?.description ?? ''];
  };
  const words = new Bm25(entries.map((e) => ({ item: e, fields: fields(e) }))).search(q).slice(0, 200);
  // By meaning: the query's vector against each one's, those alike enough.
  const v = meaningOn(db) && q.length >= 3 ? await queryVector(db, q, o.wait ? { wait: true, timeoutMs: o.wait } : { wait: false }).catch(() => null) : null;
  const meant: { e: Entry; score: number }[] = [];
  if (v) {
    const t = queryTable(v);
    const min = o.min ?? MIN_SIMILARITY;
    for (const e of entries) {
      const code = vectorOfText(db, e.text);
      if (!code) continue;
      const s = scoreAt(t, code, 0) * scale(code, 0);
      if (s >= min) meant.push({ e, score: s });
    }
    meant.sort((a, b) => b.score - a.score);
  }
  const fused = new Map<string, LibraryHit>();
  const hit = (e: Entry): LibraryHit => fused.get(e.id) ?? { id: e.id, ...(e.page ? { page: e.page } : { media: e.media }), score: 0, by: [] };
  words.forEach((w, i) => {
    const h = hit(w.item);
    h.score += W_WORDS / (RRF_K + i + 1);
    h.by.push('words');
    fused.set(h.id, h);
  });
  meant.slice(0, 200).forEach((m, i) => {
    const h = hit(m.e);
    h.score += W_MEANING / (RRF_K + i + 1);
    h.by.push('meaning');
    h.meaning = m.score;
    fused.set(h.id, h);
  });
  const hits = [...fused.values()].sort((a, b) => b.score - a.score || (b.page?.updatedAt ?? b.media?.updatedAt ?? 0) - (a.page?.updatedAt ?? a.media?.updatedAt ?? 0));
  return { hits: hits.slice(0, Math.max(1, Math.min(200, o.limit ?? 50))), meaning: !!v };
}
