// Knowledge bases: documents and folders the user adds once (the Knowledge page), which every agent can
// search with knowledge_search, by words, by meaning (local embeddings) or for exact text, citing each
// passage's file and page. Folders are read where they are and looked over again every hour.
import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeState } from '../../shared/knowledge.ts';
import { HttpError } from '../auth.ts';
import type { Deps, Feature } from '../features/types.ts';
import { meaningOn } from '../memory/embed.ts';
import { dropVectorBlocks, fillSoon, onIndexed, progress, scanAll, scanSoon } from './indexer.ts';
import { searchKnowledge, type SearchMode } from './search.ts';
import { addSource, baseRow, baseRows, baseView, createBase, deleteBase, docById, docsOf, dropDoc, filesDir, removeSource, sourcesOf, toDoc, updateBase } from './store.ts';
import { knowledgeInstructions, knowledgeTools } from './tools.ts';

function state(d: Deps): KnowledgeState {
  return { bases: baseRows(d.db).map((r) => baseView(d.db, r, progress.get(r.id))), meaning: meaningOn(d.db) };
}

function routes(d: Deps) {
  const { app, db } = d;
  const id = (req: { params: unknown }) => String((req.params as { id: string }).id);
  const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
  // The pages hear that a base changed (read further, a folder added…), a few times a second at most.
  let timer: NodeJS.Timeout | null = null;
  const changed = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      d.broadcast({ t: 'feature', id: 'knowledge', data: { changed: true } });
    }, 300);
  };
  onIndexed(() => {
    dropVectorBlocks();
    changed();
  });
  const rescan = (base: string) => {
    scanSoon(db, base);
    changed();
  };

  app.get('/api/knowledge', async () => state(d));
  app.post('/api/knowledge', async (req) => {
    const r = createBase(db, body(req));
    changed();
    return baseView(db, r);
  });
  app.patch('/api/knowledge/:id', async (req) => {
    updateBase(db, id(req), body(req));
    changed();
    return baseView(db, baseRow(db, id(req)));
  });
  app.delete('/api/knowledge/:id', async (req) => {
    deleteBase(db, id(req));
    dropVectorBlocks();
    changed();
    return { ok: true };
  });
  /** A folder on this computer, read where it is (and looked over again every hour). */
  app.post('/api/knowledge/:id/folders', async (req) => {
    baseRow(db, id(req));
    const p = String(body(req).path ?? '').trim();
    if (!p) throw new HttpError(400, 'Which folder?');
    const s = addSource(db, id(req), 'folder', p.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
    rescan(id(req));
    return s;
  });
  app.delete('/api/knowledge/:id/sources/:sid', async (req) => {
    removeSource(db, id(req), String((req.params as { sid: string }).sid));
    dropVectorBlocks();
    changed();
    return { ok: true };
  });
  /** Reads the base again: files just dropped into it, a folder that changed. */
  app.post('/api/knowledge/:id/scan', async (req) => {
    baseRow(db, id(req));
    rescan(id(req));
    return { ok: true };
  });
  app.get('/api/knowledge/:id/docs', async (req) => ({ docs: docsOf(db, baseRow(db, id(req)).id, { limit: 2000 }).map(toDoc) }));
  /** Removes a document: one dropped on the page is deleted; one in a folder stays there and is left out until it changes. */
  app.delete('/api/knowledge/:id/docs/:doc', async (req) => {
    const doc = docById(db, Number((req.params as { doc: string }).doc));
    if (!doc || doc.base !== id(req)) throw new HttpError(404, 'No such document');
    const own = filesDir(doc.base);
    if (doc.path.startsWith(own + path.sep)) fs.rmSync(doc.path, { force: true });
    else throw new HttpError(400, `${doc.title} is in a folder on this computer: remove it there, or remove the folder from the knowledge base`);
    dropDoc(db, doc.id);
    dropVectorBlocks();
    changed();
    return { ok: true };
  });
  /** The page's search box: the same search agents get. */
  app.post('/api/knowledge/search', async (req) => {
    const b = body(req);
    const mode = ['auto', 'words', 'meaning', 'exact'].includes(String(b.mode)) ? (b.mode as SearchMode) : undefined;
    return searchKnowledge(db, { query: String(b.query ?? ''), mode, bases: Array.isArray(b.bases) ? b.bases.map(String) : undefined, limit: Math.min(Number(b.limit) || 10, 30) });
  });
}

export const knowledge: Feature = {
  id: 'knowledge',
  routes,
  // Only once there is a knowledge base: otherwise they are just more tools to wade through.
  tools: (ctx) => (baseRows(ctx.deps.db).length ? knowledgeTools() : []),
  spawn: (_s, d) => {
    const t = knowledgeInstructions(d.db);
    return t ? { instructions: [t] } : undefined;
  },
  event(e, d) {
    // Search by meaning turned on (Settings → Memory): the passages get their vectors.
    if (e.t === 'feature' && e.id === 'memory') fillSoon(d.db, 10_000);
  },
  start(d) {
    // Folders change while nobody looks: read again a minute after the start, then every hour.
    setTimeout(() => scanAll(d.db), 60_000).unref();
    setInterval(() => scanAll(d.db), 3600_000).unref();
    // Files dropped while the server was down, in a base nothing has read yet.
    for (const b of baseRows(d.db)) if (sourcesOf(d.db, b.id).length && !b.indexed_at) scanSoon(d.db, b.id);
  },
};
