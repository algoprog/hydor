// Wiki memory given to agents without asking: a line for each of the project's wiki articles that stands out for a
// request (its title, what it covers and where it is: wiki_read opens it), and the project's plans in progress.
// Articles are found through the knowledge index of the project's wiki (words and meaning, fused), never by reading
// the wiki: only wiki/ articles count (not raw/ sources, output/, index.md or log.md), and only those whose best
// passage is clearly about the request. Usually none.
import fs from 'node:fs';
import path from 'node:path';
import { isConfidential } from '../../shared/confidential.ts';
import type { SessionExtra } from '../../shared/features.ts';
import type { DB } from '../db.ts';
import { vectorBlock } from '../knowledge/indexer.ts';
import { searchKnowledge } from '../knowledge/search.ts';
import { words } from '../memory/store.ts';
import { BYTES, queryTable, scale, scoreAt } from '../memory/vectors.ts';
import { activeWikiDocument } from './core.ts';
import { areaNameOf, areaNames } from './areas/registry.ts';
import { wikiKnowledgeSchema } from './knowledge/bindings.ts';
import { wikiChatEnabled } from './access.ts';
import { claimsToBePlan, PLANS_AREA } from './plans/area.ts';
import { wikiMemoryOn, wikiRoot, wikiSpaceOfSession } from './roots.ts';

/** The meaning similarity an article's best passage needs to come with a request (mDenseOn, question against passage). */
export const WIKI_MIN = 0.35;
/** The longest summary shown for an article. */
const SUMMARY_CHARS = 120;
/** Most of an article read for its front matter and first line. */
const READ_BYTES = 16 * 1024;

export interface WikiLine {
  /** Relative to the wiki's folder: wiki/… */
  path: string;
  text: string;
}

/**
 * The project whose wiki may be given to a session's agent: wiki memory on for the project and the chat, the session
 * not confidential. Null otherwise, and for a session in no project (the shared wiki is not given unasked).
 */
export function wikiDeliverySpace(db: DB, o: { key?: string; cwd?: string; extra: SessionExtra }): string | null {
  if (isConfidential(o.extra) || o.extra.memory === false || !wikiChatEnabled(db, o.extra)) return null;
  const space = typeof o.extra.space === 'string' ? o.extra.space : wikiSpaceOfSession(db, o.key ?? '', o.cwd);
  return space && wikiMemoryOn(db, space) ? space : null;
}

/** The knowledge base indexing a project's wiki, and the wiki's folder, while it is bound. */
export function wikiBase(db: DB, space: string): { base: string; root: string } | null {
  wikiKnowledgeSchema(db);
  return (db.prepare('select base, root from kb_wiki_bindings where space = ? and active = 1').get(space) as { base: string; root: string } | undefined) ?? null;
}

/** A front matter's plain fields (one line each; a list as its items). */
export function frontMatter(text: string): { fields: Record<string, string | string[]>; body: string } {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields: Record<string, string | string[]> = {};
  let list: string | null = null;
  for (const l of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(l);
    if (item && list) {
      const cur = fields[list];
      fields[list] = [...(Array.isArray(cur) ? cur : []), unquote(item[1])];
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l);
    if (!kv) continue;
    list = null;
    const v = kv[2].trim();
    if (!v) {
      list = kv[1];
      fields[kv[1]] = [];
    } else if (/^\[.*\]$/.test(v))
      fields[kv[1]] = v
        .slice(1, -1)
        .split(',')
        .map((x) => unquote(x.trim()))
        .filter(Boolean);
    else fields[kv[1]] = unquote(v);
  }
  return { fields, body: text.slice(m[0].length) };
}

const unquote = (v: string) => v.replace(/^(["'])(.*)\1$/, '$2').trim();
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : (v ?? ''));
const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** The first line of a body that is not a heading, a rule or a list of links. */
function firstLine(body: string): string {
  for (const l of body.split(/\r?\n/)) {
    const t = l.trim();
    if (!t || /^(#|---|\||<!--|>?\s*$)/.test(t)) continue;
    return t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');
  }
  return '';
}

/**
 * What one article says of itself: title, summary (front matter, else its first line), the files that changed since (it
 * may be out of date) and the areas it is in (a hub: its own).
 */
export function articleInfo(file: string, rel: string, fallback: string): { title: string; summary: string; stale: string[]; areas: string[] } | null {
  let text: string;
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return null;
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(Math.min(READ_BYTES, st.size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      text = buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  if (!activeWikiDocument(text)) return null;
  const { fields, body } = frontMatter(text);
  const title = cut(one(fields.title).replace(/\s+/g, ' ').trim() || fallback || path.posix.basename(rel, '.md'), 80);
  const summary = cut((one(fields.summary) || firstLine(body)).replace(/\s+/g, ' ').trim(), SUMMARY_CHARS);
  const stale = (Array.isArray(fields.stale) ? fields.stale : one(fields.stale).split(',')).map((x) => x.trim()).filter(Boolean);
  const areas = fields.kind === 'hub' && typeof fields.area === 'string' ? [fields.area] : (Array.isArray(fields.areas) ? fields.areas : one(fields.areas).split(',')).map((x) => x.trim()).filter(Boolean);
  return { title, summary, stale, areas };
}

/** What a line says of one article: title, summary (front matter, else its first line), and whether it may be out of date. */
function articleLine(file: string, rel: string, fallback: string, names: Map<string, string> | null): { line: string; said: string } | null {
  const a = articleInfo(file, rel, fallback);
  if (!a) return null;
  const { title, summary, stale } = a;
  const changed = stale.length ? ` [may be out of date: ${stale.slice(0, 2).join(', ')}${stale.length > 2 ? ` and ${stale.length - 2} more` : ''} changed]` : '';
  const area = areaNameOf(names, a.areas);
  return { line: `- ${title}${summary ? ` — ${summary}` : ''} (${area ? `${area} · ` : ''}${rel})${changed}`, said: `${title} ${summary}` };
}

/** The best meaning similarity of each of these passages (by chunk id) to the request. */
function similarities(db: DB, base: string, vector: Float32Array, chunks: Set<number>): Map<number, number> {
  const out = new Map<number, number>();
  const b = vectorBlock(db, base);
  const t = queryTable(vector);
  for (let i = 0, off = 0; i < b.ids.length; i++, off += BYTES) if (chunks.has(b.ids[i])) out.set(b.ids[i], scoreAt(t, b.codes, off) * scale(b.codes, off));
  return out;
}

/**
 * The project's wiki articles that stand out for a request, best first, at most `limit`, leaving out those in
 * `exclude` (refs `w:<path>` given already). By meaning, an article's best passage must reach WIKI_MIN; by words alone
 * (search by meaning off or not up), two or more of the request's words must be in its title or summary.
 */
export async function wikiLines(db: DB, o: { space: string | null; query: string; limit: number; exclude?: Set<string>; vector?: Float32Array | null }): Promise<WikiLine[]> {
  if (o.limit <= 0 || !o.space || !o.query.trim() || !wikiMemoryOn(db, o.space)) return [];
  const b = wikiBase(db, o.space);
  if (!b) return [];
  const vector = o.vector ?? null;
  let hits;
  try {
    hits = (await searchKnowledge(db, { query: o.query.slice(0, 2000), bases: [b.base], limit: 30, vector, mode: 'auto' })).hits;
  } catch {
    return [];
  }
  // Passages by article, in the order of their best.
  const articles = new Map<string, { file: string; title: string; chunks: number[] }>();
  for (const h of hits) {
    const rel = path.relative(b.root, h.path).split(path.sep).join('/');
    const name = path.posix.basename(rel).toLowerCase();
    if (!rel.startsWith('wiki/') || !rel.toLowerCase().endsWith('.md') || name === 'index.md' || name === 'log.md' || rel.split('/').some((p) => p.startsWith('.'))) continue;
    if (o.exclude?.has(`w:${rel}`)) continue;
    const a = articles.get(rel) ?? { file: h.path, title: h.title, chunks: [] };
    a.chunks.push(Number(h.ref.replace(/^kb:/, '')));
    articles.set(rel, a);
  }
  if (!articles.size) return [];
  const sims = vector ? similarities(db, b.base, vector, new Set([...articles.values()].flatMap((a) => a.chunks))) : null;
  const asked = new Set(words(o.query).filter((w) => w.length >= 4));
  const names = areaNames(b.root);
  const out: WikiLine[] = [];
  for (const [rel, a] of articles) {
    if (out.length >= o.limit) break;
    if (sims && Math.max(...a.chunks.map((c) => sims.get(c) ?? 0)) < WIKI_MIN) continue;
    const l = articleLine(a.file, rel, a.title, names);
    if (!l) continue;
    if (!sims && words(l.said).filter((w) => asked.has(w)).length < 2) continue;
    out.push({ path: rel, text: l.line });
  }
  return out;
}

// ---- plans in progress ------------------------------------------------------------------------------------------

/** What a register's state column holds once a row is finished. */
const FINISHED = /^(accepted|done|complete|completed|closed|finished|erledigt|abgenommen|abgeschlossen|fertig|✓|✅)$/i;

/** Open work in a plan: its unchecked items, else the rows of a register whose state is not finished; null when it has neither. */
export function openItems(body: string): number | null {
  const boxes = body.match(/^\s*[-*+]\s+\[ \]/gm)?.length ?? 0;
  if (boxes) return boxes;
  let open: number | null = null;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/[*_`]/g, ''));
    const col = cells(lines[i]).findIndex((c) => /^(state|status|stand|zustand)$/i.test(c));
    if (col < 0) continue;
    open ??= 0;
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const state = cells(lines[j])[col] ?? '';
      if (state && !FINISHED.test(state)) open++;
    }
  }
  return open;
}

/** Plan files in a wiki's plans folder (relative paths), at most `max`, the latest changed first. */
function planFiles(root: string, max = 40): { rel: string; mtime: number }[] {
  const out: { rel: string; mtime: number }[] = [];
  const walk = (dir: string, rel: string, depth: number) => {
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      if (e.name.startsWith('.') || e.isSymbolicLink() || out.length >= max * 3) continue;
      const r = `${rel}/${e.name}`;
      if (e.isDirectory() && depth < 3) walk(path.join(dir, e.name), r, depth + 1);
      else if (e.isFile() && /\.md$/i.test(e.name) && !/^(_index|why)\.md$/i.test(e.name) && !/(?:^|[-_])(?:evidence|nachweise|register|status)(?:[-_.]|$)/i.test(e.name))
        try {
          out.push({ rel: r, mtime: fs.statSync(path.join(dir, e.name)).mtimeMs });
        } catch {}
    }
  };
  walk(path.join(root, PLANS_AREA), PLANS_AREA, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, max);
}

/** A project's plans in progress (not archived, retired or superseded), a line each, at most `limit`, the latest changed first. */
export function activePlans(db: DB, space: string | null, limit: number): WikiLine[] {
  if (limit <= 0 || !space) return [];
  let root: string | null = null;
  try {
    root = wikiRoot(db, space);
  } catch {
    return [];
  }
  if (!root) return [];
  const out: WikiLine[] = [];
  for (const f of planFiles(root)) {
    if (out.length >= limit) break;
    let text: string;
    try {
      const file = path.join(root, f.rel);
      if (fs.statSync(file).size > 512 * 1024) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!activeWikiDocument(text) || !(claimsToBePlan(text) || /\/plan\.md$/i.test(f.rel))) continue;
    const { fields, body } = frontMatter(text);
    const title = cut((one(fields.title) || /^#\s+(.+)$/m.exec(body)?.[1] || path.posix.basename(path.posix.dirname(f.rel))).replace(/\s+/g, ' ').trim(), 80);
    const open = openItems(body);
    out.push({ path: f.rel, text: `- ${title} (${f.rel})${open != null ? `, ${open} open item${open === 1 ? '' : 's'}` : ''}` });
  }
  return out;
}
