// Bind wiki roots to Hydor's existing knowledge bases, with active-content filtering.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { DB } from '../../db.ts';
import { hubDir, wikiMemoryOn } from '../roots.ts';
import { activeWikiDocument, redirectOf } from '../core.ts';
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

/** The parts of `file` below the wiki's root when it can be active at all: inside the root, no hidden part, not the hub's projects/. */
function activeParts(root: string, file: string): string[] | null {
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  const parts = relative.split(path.sep);
  // Hidden names are never indexed; the hub's projects/ are other wikis, each its own project's knowledge.
  return parts.some((p) => p.startsWith('.')) || parts[0] === 'projects' ? null : parts;
}

/** The folders the registry (wikis.json) archives, retires or supersedes, as full paths; an error when it is not JSON. */
function archivedTopics(root: string, registryText: string): string[] {
  const registry = JSON.parse(registryText) as { wikis?: Record<string, { status?: string; path?: string }> };
  const out: string[] = [];
  for (const [name, entry] of Object.entries(registry.wikis ?? {})) {
    if (!['archived', 'superseded', 'retired'].includes(String(entry.status ?? '').toLowerCase())) continue;
    out.push(path.resolve(root, (entry.path ?? `topics/${name}`).replace('<HUB>', root)));
  }
  return out;
}

/** A file below a topic's folder of a hub (topics/<name>/…): the registry can archive the topic without changing its own files. */
const inTopic = (parts: string[]) => parts[0] === 'topics' && parts.length > 2;
const heldBy = (archived: string[], file: string) => archived.some((a) => file === a || file.startsWith(`${a}${path.sep}`));

/** A Markdown file that is retired, or a redirect stub (an article folded into another: never listed or searched). */
const hidden = (text: string) => !activeWikiDocument(text) || redirectOf(text) != null;

/** A path and each ancestor must stay inside its wiki, without symlinks or hidden historical trees. */
export function wikiFileActive(root: string, file: string): boolean {
  try {
    const parts = activeParts(root, file);
    if (!parts) return false;
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
    if (/\.md$/i.test(file) && hidden(fs.readFileSync(file, 'utf8'))) return false;
    if (inTopic(parts)) {
      const registryPath = path.join(root, 'wikis.json');
      if (fs.existsSync(registryPath) && heldBy(archivedTopics(root, fs.readFileSync(registryPath, 'utf8')), file)) return false;
    }
    return true;
  } catch { return false; }
}

/**
 * The same answer as wikiFileActive for many files of one wiki, without blocking the server: only fs.promises, and
 * what the files share is asked once (the root's config.md, the registry, each folder's symlink and config.md check).
 * A file costs one lstat and, for Markdown, one read: none when the caller has read it and passes its `text`.
 */
export function wikiActiveChecker(root: string): (file: string, text?: string) => Promise<boolean> {
  /** A config.md that is absent or active (a symlink to something, or a retired one, is not). */
  const configActive = async (dir: string): Promise<boolean> => {
    const config = path.join(dir, 'config.md');
    let linked: boolean;
    try { linked = (await fsp.lstat(config)).isSymbolicLink(); } catch { return true; }
    if (linked) return !(await fsp.stat(config).then(() => true, () => false));
    return activeWikiDocument(await fsp.readFile(config, 'utf8'));
  };
  const folders = new Map<string, Promise<boolean>>();
  const folderOk = (at: string, top: boolean): Promise<boolean> => {
    let known = folders.get(at);
    if (!known) {
      known = (async () => (top || !(await fsp.lstat(at)).isSymbolicLink()) && (await configActive(at)))().catch(() => false);
      folders.set(at, known);
    }
    return known;
  };
  let archived: Promise<string[]> | undefined;
  const archivedPaths = () =>
    (archived ??= fsp.readFile(path.join(root, 'wikis.json'), 'utf8').then(
      (text) => archivedTopics(root, text),
      (e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; },
    ));
  return async (file, text) => {
    try {
      const parts = activeParts(root, file);
      if (!parts) return false;
      if (!(await folderOk(root, true))) return false;
      let at = root;
      for (let i = 0; i < parts.length - 1; i++) {
        at = path.join(at, parts[i]);
        if (!(await folderOk(at, false))) return false;
      }
      const st = await fsp.lstat(path.join(at, parts[parts.length - 1]));
      if (st.isSymbolicLink() || !st.isFile()) return false;
      if (/\.md$/i.test(file) && hidden(text ?? (await fsp.readFile(file, 'utf8')))) return false;
      return !(inTopic(parts) && heldBy(await archivedPaths(), file));
    } catch { return false; }
  };
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
