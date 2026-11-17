// A wiki's areas: groups of articles about one lasting topic, kept in a hidden file (`.structure/areas.json`) that the
// wiki tools never read or write. Files never move: an article says which areas it is in (`areas:` in its front
// matter), each area with at least two articles has a hub (`wiki/areas/<id>.md`, a page Hydor keeps from its articles),
// and an article folded into another stays as a redirect. An area's id is made once from its first name and never
// changes; a rename keeps it and remembers the old name. The built-in area "other" holds what is not placed yet.
// This module reads and writes the registry only (no articles), so that write.ts can group the index by it.
import { readWikiState, writeWikiState } from '../core.ts';

export const OTHER = 'other';
export const OTHER_NAME = 'Other';
export const OTHER_ABOUT = 'Not yet placed in an area';
/** The folder of the hubs: reserved for them (wiki_write refuses it, a split never puts parts there). */
export const HUBS = 'wiki/areas/';
export const hubPath = (id: string) => `${HUBS}${id}.md`;
export const isHubPath = (p: string) => p.startsWith(HUBS);
/** The article's path in a hub's `members:` line (`<path> <updated> <hash>`; a path may hold spaces). */
export const memberPath = (line: string) => line.replace(/\s+\S+\s+\S+\s*$/, '').trim();

const FILE = 'areas.json';
/** History entries kept. */
export const HISTORY_MAX = 200;
/** Folds and duplicates waiting at most. */
export const QUEUE_MAX = 40;

export interface Area {
  id: string;
  name: string;
  about: string;
  /** The parent area's id (two levels at most: a parent has none). */
  parent: string | null;
  /** Names it had before, and names of areas merged into it. */
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export type AreaOp = 'add' | 'rename' | 'split' | 'merge' | 'remove' | 'move';

export interface AreaEvent {
  at: string;
  op: AreaOp;
  detail: string;
  why: string;
}

/** A fold (an event article into a topic article) or duplicates to merge, waiting to be done (at most 2 a day). */
export interface QueuedMerge {
  kind: 'fold' | 'duplicate';
  /** The articles that become redirects. */
  from: string[];
  /** The article they go into; null: a new topic article titled `title`. */
  into: string | null;
  title?: string;
  why: string;
  addedAt: string;
  tries: number;
}

export interface Registry {
  version: 1;
  updatedAt: string;
  lastReorganisedAt: string | null;
  /** Each article's body hash at the last reorganising pass (what was added or changed since). */
  articlesAtReorganise: Record<string, string>;
  /** Each area's number of articles at the last pass (a big area that has not grown is not a reason for another). */
  sizesAtReorganise: Record<string, number>;
  areas: Area[];
  history: AreaEvent[];
  queue: QueuedMerge[];
  /** When the last merges were done (at most 2 a day). */
  merged: string[];
}

const iso = (t: number) => new Date(t).toISOString();
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** The built-in area, as it always is. */
export function otherArea(at = iso(Date.now())): Area {
  return { id: OTHER, name: OTHER_NAME, about: OTHER_ABOUT, parent: null, aliases: [], createdAt: at, updatedAt: at };
}

/** A registry with no areas but Other. */
export function emptyRegistry(now = Date.now()): Registry {
  const at = iso(now);
  return { version: 1, updatedAt: at, lastReorganisedAt: null, articlesAtReorganise: {}, sizesAtReorganise: {}, areas: [otherArea(at)], history: [], queue: [], merged: [] };
}

/** Whether the registry has an area besides Other (else the wiki has no areas yet, and its index stays flat). */
export const hasAreas = (r: Registry | null): r is Registry => !!r && r.areas.some((a) => a.id !== OTHER);

/**
 * The registry as far as it holds up: unknown fields dropped, ids unique, two levels at most, Other present and last.
 * Null when the wiki has none (it was never organised).
 */
export function parseRegistry(text: string | null): Registry | null {
  if (!text) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const now = iso(Date.now());
  const seen = new Set<string>();
  const areas: Area[] = [];
  for (const a of Array.isArray(raw.areas) ? (raw.areas as Record<string, unknown>[]) : []) {
    const id = str(a?.id, 48);
    if (!ID.test(id) || seen.has(id) || id === OTHER) continue;
    seen.add(id);
    areas.push({
      id,
      name: str(a.name, 80) || id,
      about: str(a.about, 200),
      parent: typeof a.parent === 'string' ? a.parent : null,
      aliases: Array.isArray(a.aliases) ? [...new Set(a.aliases.map((x) => str(x, 80)).filter(Boolean))].slice(0, 20) : [],
      createdAt: str(a.createdAt, 40) || now,
      updatedAt: str(a.updatedAt, 40) || now,
    });
  }
  // A parent that is not there, itself, or has a parent of its own: the area is top-level.
  const byId = new Map(areas.map((a) => [a.id, a]));
  for (const a of areas) {
    const p = a.parent ? byId.get(a.parent) : undefined;
    if (!p || p.id === a.id || p.parent) a.parent = null;
  }
  const other = (Array.isArray(raw.areas) ? (raw.areas as Record<string, unknown>[]) : []).find((a) => a?.id === OTHER);
  areas.push({ ...otherArea(str(other?.createdAt, 40) || now), aliases: [], updatedAt: str(other?.updatedAt, 40) || now });
  const record = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string').map(([k, x]) => [k, x as string])) : {});
  const sizes = raw.sizesAtReorganise && typeof raw.sizesAtReorganise === 'object' ? Object.fromEntries(Object.entries(raw.sizesAtReorganise as Record<string, unknown>).filter(([, x]) => typeof x === 'number')) : {};
  const ops = new Set<AreaOp>(['add', 'rename', 'split', 'merge', 'remove', 'move']);
  return {
    version: 1,
    updatedAt: str(raw.updatedAt, 40) || now,
    lastReorganisedAt: str(raw.lastReorganisedAt, 40) || null,
    articlesAtReorganise: record(raw.articlesAtReorganise),
    sizesAtReorganise: sizes as Record<string, number>,
    areas,
    history: (Array.isArray(raw.history) ? (raw.history as Record<string, unknown>[]) : [])
      .filter((h) => ops.has(h?.op as AreaOp))
      .map((h) => ({ at: str(h.at, 40), op: h.op as AreaOp, detail: str(h.detail, 400), why: str(h.why, 300) }))
      .slice(-HISTORY_MAX),
    queue: (Array.isArray(raw.queue) ? (raw.queue as Record<string, unknown>[]) : [])
      .filter((q) => (q?.kind === 'fold' || q?.kind === 'duplicate') && Array.isArray(q.from))
      .map((q) => ({ kind: q.kind as QueuedMerge['kind'], from: (q.from as unknown[]).map((x) => str(x, 300)).filter(Boolean), into: typeof q.into === 'string' ? q.into : null, ...(typeof q.title === 'string' ? { title: str(q.title, 100) } : {}), why: str(q.why, 300), addedAt: str(q.addedAt, 40) || now, tries: typeof q.tries === 'number' ? q.tries : 0 }))
      .slice(0, QUEUE_MAX),
    merged: (Array.isArray(raw.merged) ? raw.merged : []).map((x) => str(x, 40)).filter(Boolean).slice(-10),
  };
}

/** A wiki's registry and the text it was read from (to write it back only over that), or null while it has none. */
export function readRegistry(root: string): { registry: Registry; text: string } | null {
  const text = readWikiState(root, FILE);
  const registry = parseRegistry(text);
  return registry && text != null ? { registry, text } : null;
}

export const loadRegistry = (root: string): Registry | null => readRegistry(root)?.registry ?? null;

/** The registry as it is written: Other last, history capped. */
export function registryText(r: Registry, now = Date.now()): string {
  const areas = [...r.areas.filter((a) => a.id !== OTHER), r.areas.find((a) => a.id === OTHER) ?? otherArea(iso(now))];
  return `${JSON.stringify({ ...r, updatedAt: iso(now), areas, history: r.history.slice(-HISTORY_MAX), queue: r.queue.slice(0, QUEUE_MAX), merged: r.merged.slice(-10) }, null, 2)}\n`;
}

/**
 * Changes the registry: `change` gets it as it is now (an empty one when there is none) and changes it in place, or
 * returns false to leave it. Read again and tried again when another writer got there first. Returns the registry
 * as written, or null when left.
 */
export async function updateRegistry(root: string, change: (r: Registry) => boolean | void, now = Date.now()): Promise<Registry | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = readRegistry(root);
    const r = cur?.registry ?? emptyRegistry(now);
    if (change(r) === false) return null;
    if (await writeWikiState(root, FILE, registryText(r, now), cur?.text ?? null)) return r;
  }
  throw new Error('The wiki’s areas kept changing meanwhile');
}

/** Appends to the history (capped). */
export function logEvent(r: Registry, e: Omit<AreaEvent, 'at'>, now = Date.now()) {
  r.history.push({ at: iso(now), ...e, detail: e.detail.slice(0, 400), why: e.why.slice(0, 300) });
  if (r.history.length > HISTORY_MAX) r.history.splice(0, r.history.length - HISTORY_MAX);
}

/** Lowercase words with dashes, from a name; else "area". */
export function slugOfName(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s && s !== OTHER ? s : 'area';
}

/** A new id from a name, not among `taken` (ids in use, and those whose hub file is there: a hub or a redirect). */
export function newAreaId(name: string, taken: (id: string) => boolean): string {
  const base = slugOfName(name);
  for (let n = 1; ; n++) {
    const id = n > 1 ? `${base}-${n}` : base;
    if (!taken(id)) return id;
  }
}

/**
 * The areas an article is in, from its front matter's ids: those the registry knows (Other included), at most two,
 * else Other. Empty when the wiki has no areas yet.
 */
export function placedIn(raw: string[], r: Registry | null): string[] {
  if (!hasAreas(r)) return [];
  const known = new Set(r.areas.map((a) => a.id));
  const ids = [...new Set(raw.filter((x) => known.has(x)))];
  const real = ids.filter((x) => x !== OTHER);
  return real.length ? real.slice(0, 2) : [OTHER];
}

/** The areas in the order they are shown: top-level ones in the registry's order, each followed by its sub-areas, Other last. */
export function areaOrder(r: Registry): { area: Area; depth: 0 | 1 }[] {
  const out: { area: Area; depth: 0 | 1 }[] = [];
  const tops = r.areas.filter((a) => !a.parent && a.id !== OTHER);
  for (const t of tops) {
    out.push({ area: t, depth: 0 });
    for (const c of r.areas.filter((a) => a.parent === t.id)) out.push({ area: c, depth: 1 });
  }
  const other = r.areas.find((a) => a.id === OTHER);
  if (other) out.push({ area: other, depth: 0 });
  return out;
}

/** The name of each area of a wiki, by id (Other included), for the lines that name an article's area; null without areas. */
export function areaNames(root: string): Map<string, string> | null {
  const r = loadRegistry(root);
  return hasAreas(r) ? new Map(r.areas.map((a) => [a.id, a.name])) : null;
}

/** The name of the first area an article's ids name, as the registry knows it (Other for none); null without areas. */
export function areaNameOf(names: Map<string, string> | null, raw: string[]): string | null {
  if (!names) return null;
  const id = raw.find((x) => x !== OTHER && names.has(x)) ?? OTHER;
  return names.get(id) ?? null;
}
