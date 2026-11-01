// The guide's text, read from this copy's docs/guide (so it matches the version running and an update brings
// its own), and found by words, or by meaning too when search by meaning is on (the sections' vectors ship
// with the app, server/find/shipped-vectors.json).
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_TOPICS, parseTopic, plainText, sectionText, type GuideSection, type GuideTopic } from '../../shared/guide.ts';
import { APP_ROOT } from '../config.ts';
import type { DB } from '../db.ts';
import { hashOf, shippedVectors } from '../find/index.ts';
import { meaningOn, queryVector } from '../memory/embed.ts';
import { queryTable, scale, scoreAt } from '../memory/vectors.ts';

export const GUIDE_DIR = path.join(APP_ROOT, 'docs', 'guide');

let read: { sig: string; topics: GuideTopic[] } | null = null;

/** Every topic, in the files' order; read again when a file changes. */
export function guideTopics(): GuideTopic[] {
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(GUIDE_DIR)
      .filter((f) => /^\d+-[a-z0-9-]+\.md$/.test(f))
      .sort();
  } catch {
    return [];
  }
  const sig = files.map((f) => `${f}:${fs.statSync(path.join(GUIDE_DIR, f)).mtimeMs}`).join('|');
  if (read?.sig !== sig) read = { sig, topics: files.map((f) => parseTopic(f, fs.readFileSync(path.join(GUIDE_DIR, f), 'utf8'))) };
  return read.topics;
}

/** The sections the search box finds (and that ship with vectors): the API is for agents, not there. */
export const guideItems = (): { id: string; text: string }[] =>
  guideTopics()
    .filter((t) => !AGENT_TOPICS.includes(t.id))
    .flatMap((t) => t.sections.map((s) => ({ id: `guide:${t.id}#${s.id}`, text: sectionText(t, s) })));

// ---- finding sections -------------------------------------------------------------------------------

const STOP = new Set(
  'a an and are as at be can do does for from get how i if in into is it its me my of on or so that the their them then there this to up use using want what when where which who why will with you your'.split(' '),
);

/** A word's stem, roughly: "creating", "created", "creates" → "creat". */
const stem = (w: string) => (w.length > 5 ? w.replace(/(ings?|ed|es|s|ly)$/, '') : w.length > 3 ? w.replace(/s$/, '') : w);

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .map(stem);

export interface Hit {
  topic: GuideTopic;
  section: GuideSection;
  score: number;
}

interface Doc {
  topic: GuideTopic;
  section: GuideSection;
  title: Map<string, number>;
  body: Map<string, number>;
  len: number;
}

let index: { topics: GuideTopic[]; docs: Doc[]; df: Map<string, number>; avg: number } | null = null;

function count(ws: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of ws) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

function indexOf() {
  const topics = guideTopics();
  if (index?.topics === topics) return index;
  const docs: Doc[] = topics.flatMap((topic) =>
    topic.sections.map((section) => {
      const body = words(plainText(section.text));
      return { topic, section, title: count([...words(section.title), ...words(topic.title)]), body: count(body), len: body.length };
    }),
  );
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set([...d.title.keys(), ...d.body.keys()])) df.set(w, (df.get(w) ?? 0) + 1);
  index = { topics, docs, df, avg: docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length) };
  return index;
}

/** Sections by the query's words (BM25, the heading counting thrice), best first. */
export function findByWords(query: string, limit = 8): Hit[] {
  const ix = indexOf();
  const q = [...new Set(words(query))];
  if (!q.length) return [];
  const n = ix.docs.length;
  const out: Hit[] = [];
  for (const d of ix.docs) {
    let score = 0;
    for (const w of q) {
      const tf = (d.body.get(w) ?? 0) + 3 * (d.title.get(w) ?? 0);
      if (!tf) continue;
      const idf = Math.log(1 + (n - (ix.df.get(w) ?? 0) + 0.5) / ((ix.df.get(w) ?? 0) + 0.5));
      score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.len / ix.avg)));
    }
    if (score > 0) out.push({ topic: d.topic, section: d.section, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Below this a section is not taken as being about the query (as the search box's own threshold). */
const MIN_SIMILARITY = 0.35;

/** Sections by meaning, when search by meaning is on and answers now (the API topic has no vectors). */
async function findByMeaning(db: DB, query: string, limit: number): Promise<Hit[]> {
  if (!meaningOn(db) || query.trim().length < 3) return [];
  const v = await queryVector(db, query, { wait: false }).catch(() => null);
  if (!v) return [];
  const t = queryTable(v);
  const have = shippedVectors();
  const out: Hit[] = [];
  for (const topic of guideTopics())
    for (const section of topic.sections) {
      const c = have.get(hashOf(sectionText(topic, section)));
      if (!c) continue;
      const score = scoreAt(t, c, 0) * scale(c, 0);
      if (score >= MIN_SIMILARITY) out.push({ topic, section, score });
    }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The sections that answer a question: by words and by meaning, the two lists merged by rank. */
export async function findSections(db: DB, query: string, limit = 5): Promise<Hit[]> {
  const lists = [findByWords(query, 12), await findByMeaning(db, query, 12)];
  const merged = new Map<string, Hit>();
  for (const list of lists)
    list.forEach((h, i) => {
      const k = `${h.topic.id}#${h.section.id}`;
      const prev = merged.get(k);
      merged.set(k, { ...h, score: (prev?.score ?? 0) + 1 / (20 + i) });
    });
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
