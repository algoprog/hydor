// Each saved page's picture in Pages: the page as it opens (light, with the data it keeps), taken in the
// background by the capture browser and kept on disk until the page or its data changes. The list shows
// the page's first letter until its picture is ready; then the pages hear { what: 'thumb' }.
import fs from 'node:fs';
import path from 'node:path';
import { STORAGE_LIMITS } from '../../shared/pages.ts';
import { canCapture, capture } from '../capture/index.ts';
import { confidentialKey } from '../confidential/index.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { injectHead, kitHead } from './kit.ts';
import { dataStamp, pageHtml, pageInfo, pageSource, storageMap } from './store.ts';
import { mustKind } from './kinds.ts';

const DIR = path.join(config.dataDir, 'pages', 'thumbs');
const fileOf = (id: string, stamp: string) => path.join(DIR, `${id}-${stamp}.webp`);

/** What a picture shows: the page's version and when its data last changed. */
function stampOf(db: DB, id: string): string | null {
  const p = pageInfo(db, id);
  return p ? `${p.version}-${dataStamp(db, id).toString(36)}` : null;
}

/** The picture of the page as it is now, if it is ready. */
export function thumbFile(db: DB, id: string): string | null {
  const stamp = stampOf(db, id);
  if (!stamp) return null;
  const f = fileOf(id, stamp);
  return fs.existsSync(f) ? f : null;
}

const waiting = new Set<string>();
let busy = false;
let on = false;
/** Pictures are taken once the app is up (not in tests of the routes). */
export const enableThumbs = () => (on = true);

let lastAll = 0;

/** Takes the pictures that are out of date, one after another (all pages: looked over at most every 30 seconds). */
export function refreshThumbs(d: Deps, ids?: string[]) {
  if (!on || !canCapture()) return;
  if (!ids) {
    if (Date.now() - lastAll < 30_000) return;
    lastAll = Date.now();
  }
  const list = ids ?? (d.db.prepare('select id from pages order by updated_at desc').all() as { id: string }[]).map((r) => r.id);
  for (const id of list) {
    const stamp = stampOf(d.db, id);
    if (stamp && !fs.existsSync(fileOf(id, stamp))) waiting.add(id);
  }
  void next(d);
}

async function next(d: Deps) {
  if (busy) return;
  const id = waiting.values().next().value;
  if (!id) return;
  waiting.delete(id);
  busy = true;
  try {
    await take(d, id);
  } catch (e) {
    console.error(`[pages] no picture of page ${id}: ${(e as Error).message}`);
  } finally {
    busy = false;
    setTimeout(() => void next(d), 50).unref();
  }
}

async function take(d: Deps, id: string) {
  const { db } = d;
  const stamp = stampOf(db, id);
  const info = pageInfo(db, id);
  if (!stamp || !info || fs.existsSync(fileOf(id, stamp))) return;
  // A confidential session's page reaches nowhere, not even for its picture.
  const offline = confidentialKey(db, info.sessionKey);
  let shot;
  if (info.kind) {
    // A deck's first slide, a document's first page, a spreadsheet's first cells: alone.
    const page = (await pageHtml(db, id, undefined, 'still'))!;
    const size = mustKind(info.kind).still(pageSource(db, id)!.text);
    shot = await capture({ html: page.html, width: size.width, height: size.height, outWidth: 528, format: 'webp', quality: 78, settleMs: 700, blockPrivate: true, offline });
  } else {
    const page = (await pageHtml(db, id))!;
    // The kit with the page's data to read, nothing to write it to, and no parent to talk to.
    const head = kitHead({ n: '', theme: 'light', max: { key: STORAGE_LIMITS.key, value: STORAGE_LIMITS.value }, seed: storageMap(db, id) });
    shot = await capture({ html: injectHead(page.html, head), width: 880, height: 550, outWidth: 528, format: 'webp', quality: 74, settleMs: 700, blockPrivate: true, offline });
  }
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  // Only one picture per page: the others are out of date.
  for (const f of fs.readdirSync(DIR)) if (f.startsWith(`${id}-`)) fs.rmSync(path.join(DIR, f), { force: true });
  fs.writeFileSync(fileOf(id, stamp), shot.data, { mode: 0o600 });
  db.prepare('update pages set thumb = ? where id = ?').run(stamp, id);
  d.broadcast({ t: 'feature', id: 'pages', data: { what: 'thumb', id, thumb: stamp } });
}

/** A page went: its picture goes too. */
export function dropThumbs(id: string) {
  try {
    for (const f of fs.readdirSync(DIR)) if (f.startsWith(`${id}-`)) fs.rmSync(path.join(DIR, f), { force: true });
  } catch {}
}
