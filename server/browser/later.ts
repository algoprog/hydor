// Your own "Read later" list (the Browser page's tab column and the Library's Read later chip): pages you set aside, kept
// in the app's key-value store. Marking one as read keeps it (Show read brings it back); removing forgets it. It is part of
// your own browsing, so its routes are under /api/browser/browsing, which agents are refused.
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { LaterItem } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';

const KEY = 'browser.later';
export const MAX_LATER = 2000;
const TITLE_MAX = 300;
const URL_MAX = 4000;

const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;

export function loadLater(db: DB): LaterItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(kvGet(db, KEY) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((n) => n && typeof n.id === 'string' && typeof n.url === 'string' && typeof n.title === 'string' && Number.isFinite(n.addedAt)) as LaterItem[];
}

function save(db: DB, items: LaterItem[]): LaterItem[] {
  // Past the limit the oldest read pages go first, then the oldest of all.
  let list = items;
  while (list.length > MAX_LATER) {
    const at = list.findIndex((n) => n.readAt !== undefined);
    list = list.filter((_, i) => i !== (at >= 0 ? at : 0));
  }
  kvSet(db, KEY, JSON.stringify(list));
  return list;
}

/** A web page (http or https): the only addresses worth setting aside. */
export function laterUrl(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s || s.length > URL_MAX) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

const cleanTitle = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);

/** Sets a page aside. One that is on the list already (read or not) goes back to waiting, at the top, with its newest title. */
export function addLater(db: DB, b: { url?: unknown; title?: unknown }): { item: LaterItem; items: LaterItem[]; existed: boolean } {
  const url = laterUrl(b.url);
  if (!url) throw new HttpError(400, 'Only a web page (http or https) can be set aside to read later.');
  const list = loadLater(db);
  const had = list.find((n) => n.url === url);
  const title = cleanTitle(b.title) || had?.title || url;
  const item: LaterItem = had ? { ...had, title, addedAt: Date.now() } : { id: crypto.randomBytes(5).toString('hex'), url, title, addedAt: Date.now() };
  delete item.readAt;
  const items = save(db, [...list.filter((n) => n !== had), item]);
  return { item, items, existed: !!had };
}

/** Marks a page as read, or as waiting again. */
export function markLater(db: DB, id: string, read: unknown): LaterItem[] {
  if (typeof read !== 'boolean') throw new HttpError(400, 'read: true to mark it as read, false to put it back');
  const list = loadLater(db);
  const n = list.find((x) => x.id === id);
  if (!n) throw new HttpError(404, 'That page is not on your Read later list.');
  if (read) n.readAt = Date.now();
  else delete n.readAt;
  return save(db, list);
}

export function removeLater(db: DB, id: string): LaterItem[] {
  const list = loadLater(db);
  if (!list.some((x) => x.id === id)) throw new HttpError(404, 'That page is not on your Read later list.');
  return save(db, list.filter((x) => x.id !== id));
}

export function laterRoutes(d: Deps) {
  const { app, db } = d;
  app.get('/api/browser/browsing/later', async () => ({ items: loadLater(db) }));
  app.post('/api/browser/browsing/later', async (req) => addLater(db, B(req)));
  app.patch('/api/browser/browsing/later/:id', async (req) => ({ items: markLater(db, (req.params as { id: string }).id, B(req).read) }));
  app.delete('/api/browser/browsing/later/:id', async (req) => ({ items: removeLater(db, (req.params as { id: string }).id) }));
}
