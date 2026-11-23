// Read-only browsing of an already resolved active wiki; the common reader enforces file boundaries.
import type { Dirent } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { WIKI_MAX_BYTES, wikiRelativeParts, wikiTextOf } from './core.ts';
import { wikiActiveChecker } from './knowledge/bindings.ts';

export interface WikiEntry { path: string; title: string; updated?: number; summary?: string }

/** A frontmatter field's one-line value, without its quotes ("Bob's guide" stays whole); empty when it is not there. */
function frontValue(content: string, key: string): string {
  const front = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
  const value = front && new RegExp(`^${key}\\s*:[ \\t]*(.+?)[ \\t]*$`, 'im').exec(front)?.[1];
  if (!value) return '';
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    try { return String(JSON.parse(value)).trim(); } catch { /* not JSON: take it as written */ }
  }
  const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
  return (quoted ? quoted[2] : value).trim();
}

/** The `title:` of a document's frontmatter, without its quotes ("Bob's guide" stays whole). */
export function titleOf(content: string): string {
  return frontValue(content, 'title');
}

/** The `summary:` of a document's frontmatter, unquoted, cut to 200 characters; empty without one. */
export function summaryOf(content: string): string {
  const text = frontValue(content, 'summary').replace(/\s+/g, ' ');
  return text.length > 200 ? `${text.slice(0, 199).trimEnd()}…` : text;
}

export type WikiTree = 'articles' | 'sources' | 'plans';
/** An entry of the walk with the text it read (empty when the caller did not ask to keep it). */
export interface WikiRead extends WikiEntry { content: string }
export interface WikiWalk<E> { articles: E[]; sources: E[]; plans: E[]; truncated: boolean }

/** The most entries one walk looks at. */
const MAX_ENTRIES = 5000;
/**
 * Files read at once while walking (a folder on a network share answers each read slowly, not all at once). Node does
 * file calls on a pool of four threads that the whole app shares: a share that stalls holds two of them at most.
 */
const READS_AT_ONCE = 2;

/** Runs jobs, `limit` of them at a time. */
function gate(limit: number): <T>(job: () => Promise<T>) => Promise<T> {
  let free = limit;
  const waiting: (() => void)[] = [];
  return async (job) => {
    if (free > 0) free--;
    else await new Promise<void>((resume) => waiting.push(resume));
    try {
      return await job();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else free++;
    }
  };
}

/** Where each tree lives: the folders it walks, the entries they list. */
const TREES: Record<WikiTree, string[]> = { articles: ['wiki'], sources: ['raw'], plans: ['output/projects', 'output/evidence'] };

/**
 * The walk under browseWiki and areaArticles: the active Markdown files of the trees asked for, in a wiki on a disk that
 * may be a network share, so it never blocks the server (fs.promises only) and each file costs one stat, one read and
 * one lstat (wikiActiveChecker). Hidden names and symlinks are never entered; a tree's own folders are checked once.
 */
export async function walkWiki(root: string, trees: WikiTree[], keep: boolean): Promise<WikiWalk<WikiRead>> {
  const found: Record<WikiTree, Promise<WikiRead | null>[]> = { articles: [], sources: [], plans: [] };
  const active = wikiActiveChecker(root);
  const reading = gate(READS_AT_ONCE);
  const plain = new Map<string, Promise<boolean>>();
  /** A folder that is there, a real folder and not a link. */
  const folderOk = (relative: string): Promise<boolean> => {
    let known = plain.get(relative);
    if (!known) plain.set(relative, (known = fsp.lstat(path.join(root, relative)).then((st) => st.isDirectory(), () => false)));
    return known;
  };
  const load = (relative: string, name: string): Promise<WikiRead | null> =>
    reading(async () => {
      try {
        wikiRelativeParts(relative);
        const file = path.join(root, relative);
        const st = await fsp.stat(file);
        if (st.size > WIKI_MAX_BYTES) return null;
        const content = wikiTextOf(await fsp.readFile(file), st.size);
        if (!(await active(file, content))) return null;
        const summary = summaryOf(content);
        return { path: relative, title: titleOf(content) || name.replace(/\.md$/i, ''), updated: Math.round(st.mtimeMs), ...(summary ? { summary } : {}), content: keep ? content : '' };
      } catch {
        // Inactive, inaccessible or unsafe documents are not listed.
        return null;
      }
    });
  let visited = 0;
  let truncated = false;
  const visit = async (relative: string, out: Promise<WikiRead | null>[]): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fsp.readdir(path.join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > MAX_ENTRIES) { truncated = true; return; }
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name, out);
      else if (entry.isFile() && /\.md$/i.test(entry.name) && entry.name !== '_index.md') out.push(load(name, entry.name));
    }
  };
  for (const tree of trees) {
    for (const base of TREES[tree]) {
      // Never enter a nested content area through a symlinked ancestor.
      const parts = base.split('/');
      let ok = true;
      for (let i = 1; i <= parts.length && ok; i++) ok = await folderOk(parts.slice(0, i).join('/'));
      if (ok) await visit(base, found[tree]);
    }
  }
  const settled = async (tree: WikiTree) => (await Promise.all(found[tree])).filter((e): e is WikiRead => e != null);
  return { articles: await settled('articles'), sources: await settled('sources'), plans: await settled('plans'), truncated };
}

/** List active Markdown articles and source notes, without opening hidden or linked directories; `trees` limits the walk to the ones asked for (the others come back empty). */
export async function browseWiki(root: string, o: { trees?: WikiTree[] } = {}): Promise<WikiWalk<WikiEntry>> {
  const walk = await walkWiki(root, o.trees ?? ['articles', 'sources', 'plans'], false);
  const list = (entries: WikiRead[]): WikiEntry[] => entries.map(({ content: _content, ...entry }) => entry);
  return { articles: list(walk.articles), sources: list(walk.sources), plans: list(walk.plans), truncated: walk.truncated };
}
