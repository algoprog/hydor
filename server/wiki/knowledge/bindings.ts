// Bind wiki roots to Hydor's existing knowledge bases, with active-content filtering.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../../db.ts';
import { hubDir, wikiMemoryOn } from '../roots.ts';
import { activeWikiDocument } from '../core.ts';
import { knowledgeSchema } from '../../knowledge/store.ts';

interface Binding { base: string; source: string; root: string; space: string | null; active: number }

/** Storage only identifies app-managed wiki sources; the existing KB owns all indexing and search. */
const made = new WeakSet<DB>();
export function wikiKnowledgeSchema(db: DB): void {
  if (made.has(db)) return;
  knowledgeSchema(db);
  db.exec('create table if not exists kb_wiki_bindings (base text primary key, source text not null, root text not null, space text, active integer not null)');
  made.add(db);
}

/** Look up an explicitly bound wiki source without treating ordinary folders as wiki roots. */
export function wikiSourceRoot(db: DB, source: string): { root: string; active: boolean } | null {
  wikiKnowledgeSchema(db);
  const row = db.prepare('select root, active, space from kb_wiki_bindings where source = ?').get(source) as { root: string; active: number; space: string | null } | undefined;
  return row ? { root: row.root, active: !!row.active && wikiMemoryOn(db, row.space) } : null;
}

/** Hide managed bases immediately when disabled or superseded, including stale FTS/vector results. */
export function wikiBaseVisible(db: DB, base: string): boolean {
  wikiKnowledgeSchema(db);
  const row = db.prepare('select * from kb_wiki_bindings where base = ?').get(base) as Binding | undefined;
  if (!row) return true;
  if (!row.active || !wikiMemoryOn(db, row.space)) return false;
  // A deleted or moved project must not silently turn its formerly private wiki into shared knowledge.
  const owner = db.prepare('select space from kb_bases where id = ?').get(base) as { space: string | null } | undefined;
  if (!owner || owner.space !== row.space) return false;
  // A changed hub is no longer shared even before the next indexing run.
  if (!row.space) {
    try { if (hubDir(db) !== row.root) return false; } catch { return false; }
  }
  return true;
}

/** Identify managed project bases so a deleted project never turns private wiki data shared. */
export function isWikiBase(db: DB, base: string): boolean {
  wikiKnowledgeSchema(db);
  return !!db.prepare('select 1 from kb_wiki_bindings where base = ?').get(base);
}

/** A path and each ancestor must stay inside its wiki, without symlinks or hidden historical trees. */
export function wikiFileActive(root: string, file: string): boolean {
  try {
    const relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    const parts = relative.split(path.sep);
    // Hidden names are never indexed; the hub's projects/ are other wikis, each its own project's knowledge.
    if (parts.some((p) => p.startsWith('.')) || parts[0] === 'projects') return false;
    const rootConfig = path.join(root, 'config.md');
    if (fs.existsSync(rootConfig) && (fs.lstatSync(rootConfig).isSymbolicLink() || !activeWikiDocument(fs.readFileSync(rootConfig, 'utf8')))) return false;
    let at = root;
    for (let i = 0; i < parts.length; i++) {
      at = path.join(at, parts[i]);
      if (fs.lstatSync(at).isSymbolicLink()) return false;
      if (i < parts.length - 1) {
        const config = path.join(at, 'config.md');
        if (fs.existsSync(config) && (fs.lstatSync(config).isSymbolicLink() || !activeWikiDocument(fs.readFileSync(config, 'utf8')))) return false;
      }
    }
    if (!fs.statSync(file).isFile()) return false;
    if (/\.md$/i.test(file) && !activeWikiDocument(fs.readFileSync(file, 'utf8'))) return false;
    // A registry can archive a topic without changing that topic's own files.
    if (parts[0] === 'topics' && parts.length > 2) {
      const registryPath = path.join(root, 'wikis.json');
      if (fs.existsSync(registryPath)) {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as { wikis?: Record<string, { status?: string; path?: string }> };
        for (const [name, entry] of Object.entries(registry.wikis ?? {})) {
          if (!['archived', 'superseded', 'retired'].includes(String(entry.status ?? '').toLowerCase())) continue;
          const archived = path.resolve(root, (entry.path ?? `topics/${name}`).replace('<HUB>', root));
          if (file === archived || file.startsWith(`${archived}${path.sep}`)) return false;
        }
      }
    }
    return true;
  } catch { return false; }
}

/** Read and search paths of managed wiki bases only while their own document is active. */
export function wikiDocumentVisible(db: DB, base: string, file: string): boolean {
  wikiKnowledgeSchema(db);
  const b = db.prepare('select * from kb_wiki_bindings where base = ?').get(base) as Binding | undefined;
  return !b || (wikiBaseVisible(db, base) && wikiFileActive(b.root, file));
}

/** Create or replace one scoped wiki binding; a later scan indexes its existing files. */
export function ensureWikiKnowledge(db: DB, o: { root: string; space: string | null }): { base: string; source: string } {
  wikiKnowledgeSchema(db);
  if (!wikiMemoryOn(db, o.space)) throw new Error('Wiki memory is off');
  const root = fs.realpathSync(o.root);
  if (!fs.statSync(root).isDirectory()) throw new Error('Wiki root must be a directory');
  if (o.space && !/^sp[a-z0-9]+$/.test(o.space)) throw new Error('Invalid project scope');
  const now = Date.now();
  return db.transaction(() => {
    db.prepare('update kb_wiki_bindings set active = 0 where space is ?').run(o.space);
    let row = db.prepare('select * from kb_wiki_bindings where root = ? and space is ?').get(root, o.space) as Binding | undefined;
    if (!row) {
      const base = `kb${crypto.randomBytes(5).toString('hex')}`;
      const source = `src${crypto.randomBytes(5).toString('hex')}`;
      db.prepare('insert into kb_bases (id, name, description, space, created_at) values (?, ?, ?, ?, ?)').run(base, o.space ? 'Project wiki' : 'Shared wiki', 'Managed wiki memory', o.space, now);
      db.prepare('insert into kb_sources (id, base, kind, path, name, added_at) values (?, ?, ?, ?, ?, ?)').run(source, base, 'folder', root, 'Wiki memory', now);
      db.prepare('insert into kb_wiki_bindings (base, source, root, space, active) values (?, ?, ?, ?, 1)').run(base, source, root, o.space);
      row = { base, source, root, space: o.space, active: 1 };
    } else db.prepare('update kb_wiki_bindings set active = 1 where base = ?').run(row.base);
    return { base: row.base, source: row.source };
  })();
}
