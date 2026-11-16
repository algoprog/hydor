// Wire wiki bindings into the existing knowledge indexing queue; no second search implementation.
import type { DB } from '../../db.ts';
import { scanSoon } from '../../knowledge/indexer.ts';
import { ensureWikiKnowledge as bindWiki, wikiKnowledgeSchema } from './bindings.ts';

const lastQueued = new Map<string, number>();

/** Bind a root to its existing project/shared scope and schedule a bounded background scan. */
export function ensureWikiKnowledge(db: DB, options: { root: string; space: string | null }): { base: string; source: string } {
  const binding = bindWiki(db, options);
  const now = Date.now();
  if (now - (lastQueued.get(binding.base) ?? 0) > 10_000) {
    lastQueued.set(binding.base, now);
    scanSoon(db, binding.base);
  }
  return binding;
}

/** A successful authorized wiki write requests a fresh scan in each scope that uses that root. */
export function refreshWikiKnowledge(db: DB, root: string): void {
  wikiKnowledgeSchema(db);
  const rows = db.prepare('select base from kb_wiki_bindings where root = ? and active = 1').all(root) as { base: string }[];
  for (const row of rows) { lastQueued.set(row.base, Date.now()); scanSoon(db, row.base); }
}

/** Invalidate managed scopes immediately when wiki paths change; the next session binds their new roots. */
export function invalidateWikiKnowledge(db: DB): void {
  wikiKnowledgeSchema(db);
  db.prepare('update kb_wiki_bindings set active = 0').run();
}

/** Fail closed when the project wiki cannot be resolved for its current session. */
export function deactivateProjectWikiKnowledge(db: DB, space: string): void {
  wikiKnowledgeSchema(db);
  db.prepare('update kb_wiki_bindings set active = 0 where space = ?').run(space);
}
