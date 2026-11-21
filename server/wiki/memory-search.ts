// One search over a project's memory for the Memory tab's search box: its notes, its wiki memory (passages the
// wiki's index finds, and articles whose title or summary holds the words) and its own documents. Read only: it
// never makes a folder or binds an index, and it never waits for the model of search by meaning to start.
import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeHit } from '../../shared/knowledge.ts';
import { isUserProfile } from '../../shared/memory.ts';
import type { ProjectMemoryArticleHit, ProjectMemorySearch } from '../../shared/project-memory.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { searchKnowledge } from '../knowledge/search.ts';
import { basesFor } from '../knowledge/scope.ts';
import { queryVector } from '../memory/embed.ts';
import { labelled } from '../memory/routes.ts';
import { findNotes } from '../memory/search.ts';
import { repoRoot } from '../memory/store.ts';
import { spaceById } from '../spaces/index.ts';
import { isHubPath } from './areas/registry.ts';
import { wikiBase } from './deliver.ts';
import { browseWiki, type WikiEntry } from './browse.ts';
import { wikiRoot } from './roots.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const EXCERPT = 300;

/** Lower case, accents aside, white space single: how titles and questions are compared. */
const plain = (t: string) => t.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A passage cut to about `max` characters at a word boundary. */
function cut(text: string, max = EXCERPT): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const at = head.lastIndexOf(' ');
  return `${(at > max / 2 ? head.slice(0, at) : head).trimEnd()}…`;
}

const posix = (p: string) => p.split(path.sep).join('/');

/** A folder's real path (links resolved), or the path as given when it cannot be resolved. */
function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/** The wiki's articles and sources that match: by the passages its index found, then by title or summary. */
async function articlesOf(d: Deps, space: string, root: string, query: string, limit: number, vector: Float32Array | null): Promise<{ hits: ProjectMemoryArticleHit[]; meaning: boolean }> {
  const view = browseWiki(root);
  const known = new Map<string, WikiEntry>();
  for (const e of view.articles) if (!isHubPath(e.path)) known.set(e.path, e);
  for (const e of view.sources) known.set(e.path, e);
  const found: ProjectMemoryArticleHit[] = [];
  const seen = new Set<string>();
  let meaning = false;
  const bound = wikiBase(d.db, space);
  // The index keeps the folder's real path: a wiki reached through a link is the same wiki.
  if (bound && real(bound.root) === real(root)) {
    const rel = (abs: string) => posix(path.relative(bound.root, abs));
    const result = await searchKnowledge(d.db, {
      query,
      bases: [bound.base],
      limit: MAX_LIMIT,
      vector,
      keep: (abs) => known.has(rel(abs)),
    });
    meaning = result.meaning;
    for (const h of result.hits) {
      const p = rel(h.path);
      const entry = known.get(p);
      if (!entry || seen.has(p)) continue;
      seen.add(p);
      found.push({ path: p, title: entry.title, excerpt: cut(h.text), by: h.by });
    }
  }
  // Articles whose title or summary holds every word of the question, accents and case aside.
  const words = plain(query).match(/[\p{L}\p{N}]+/gu) ?? [];
  const whole = plain(query);
  const titled: ProjectMemoryArticleHit[] = [];
  if (words.length)
    for (const e of view.articles) {
      if (seen.has(e.path) || isHubPath(e.path)) continue;
      const hay = plain(`${e.title} ${e.summary ?? ''}`);
      if (words.every((w) => hay.includes(w))) titled.push({ path: e.path, title: e.title, ...(e.summary ? { excerpt: e.summary } : {}), by: ['title'] });
    }
  // A title that holds the whole question comes first, then the passages in their order, then the rest by title.
  const all = [...found, ...titled];
  const exact = all.filter((a) => plain(a.title).includes(whole));
  return { hits: [...exact, ...all.filter((a) => !exact.includes(a))].slice(0, limit), meaning };
}

export function memorySearchRoutes(d: Deps): void {
  d.app.get('/api/projects/:id/memory/search', async (req): Promise<ProjectMemorySearch> => {
    const p = spaceById(d.db, String((req.params as { id: string }).id));
    if (!p) throw new HttpError(404, 'No such project');
    const q = req.query as { q?: string; limit?: string };
    const query = String(q.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!query) throw new HttpError(400, 'What should I look for?');
    const n = Math.floor(Number(q.limit));
    const limit = Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
    // The model of search by meaning is used only when it is running already (it is started for the next search otherwise).
    const vector = await queryVector(d.db, query, { wait: false });
    const key = repoRoot(p.folder) ?? p.folder;
    let root: string | null = null;
    try {
      root = wikiRoot(d.db, p.id);
    } catch {
      // A wiki folder that cannot be read safely is left out, as the wiki view does.
    }
    const own = basesFor(d.db, p.id, false).filter((b) => b.own && !b.from);
    const [notes, articles, documents] = await Promise.all([
      findNotes(d.db, { places: [{ scope: 'repo', scopeKey: key }], query, limit, mode: 'all', vector }),
      root ? articlesOf(d, p.id, root, query, limit, vector).catch(() => ({ hits: [] as ProjectMemoryArticleHit[], meaning: false })) : { hits: [] as ProjectMemoryArticleHit[], meaning: false },
      own.length ? searchKnowledge(d.db, { query, bases: own.map((b) => b.id), limit, vector }).catch(() => ({ hits: [] as KnowledgeHit[], meaning: false })) : { hits: [] as KnowledgeHit[], meaning: false },
    ]);
    return {
      query,
      notes: labelled(d, notes.map((f) => f.entry).filter((e) => !isUserProfile(e))),
      articles: articles.hits,
      documents: documents.hits,
      meaning: vector !== null,
    };
  });
}
