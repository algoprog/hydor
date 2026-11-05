// Publish: a folder (a project's build) or a saved page, served at a link of its own under /site/.
// A private link carries a signature of the site's id (unguessable; it stops when unpublished); a public
// one is a name. Sites are served sandboxed: an opaque origin, a strict policy, outside /api/, so their
// scripts never act as this app or with its cookies. Folders are served as they are now on disk
// (a rebuild shows at once), never their dot files, never anything outside them.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { STORAGE_LIMITS, type PublishRequest, type SiteInfo, type SiteVisibility } from '../../shared/pages.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { pageMimeFor } from '../files.ts';
import { inside, signWithKey } from '../links.ts';
import { injectHead, kitHead, storageShim } from './kit.ts';
import { cleanTitle, dbSeed, pageHtml, pageInfo, pageSource } from './store.ts';

/** A folder to publish holds at most this much. */
const MAX_FILES = 5000;
const MAX_BYTES = 300 * 1024 * 1024;
const MAX_SITES = 200;

export function initSites(db: DB) {
  db.exec(`
    create table if not exists sites (
      id text primary key,
      name text not null,
      slug text unique,
      visibility text not null,
      kind text not null,
      folder text,
      page_id text,
      nonce text not null,
      created_at integer not null,
      session_key text
    );
    create table if not exists site_requests (
      id text primary key,
      session_key text not null,
      name text not null,
      kind text not null,
      folder text,
      page_id text,
      files integer not null default 0,
      bytes integer not null default 0,
      status text not null,
      site_id text,
      error text,
      created_at integer not null,
      decided_at integer
    );
  `);
}

const newId = () => crypto.randomBytes(5).toString('hex');

// ---- what may be published ------------------------------------------------------------------------

/** A folder that may be published, as it really is (links followed), with its size. */
export function inspectFolder(dir: string): { folder: string; files: number; bytes: number } {
  let real: string;
  try {
    real = fs.realpathSync(dir);
  } catch {
    throw new HttpError(404, `There is no folder at ${dir}`);
  }
  if (!fs.statSync(real).isDirectory()) throw new HttpError(400, `${dir} is a file, not a folder`);
  const home = os.homedir();
  const data = fs.realpathSync(config.dataDir);
  if (real === '/' || real === home || real === path.dirname(home)) throw new HttpError(400, 'That is too wide to publish: pick the folder of the site itself, such as a build folder (dist/).');
  if (real === data || real.startsWith(data + path.sep) || data.startsWith(real + path.sep)) throw new HttpError(400, 'The app’s own data cannot be published.');
  if (real.split(path.sep).some((s) => s.startsWith('.') && s !== '.')) throw new HttpError(400, 'Folders inside hidden folders (.something) are not published.');
  if (!fs.existsSync(path.join(real, 'index.html'))) throw new HttpError(400, `${dir} has no index.html: publish a built site (dist/, build/ or out/ after the build).`);
  let files = 0;
  let bytes = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        files++;
        bytes += fs.statSync(p).size;
        if (files > MAX_FILES || bytes > MAX_BYTES) throw new HttpError(413, `That folder is too big to publish (at most ${MAX_FILES} files and ${MAX_BYTES / 1024 / 1024} MB).`);
      }
    }
  };
  walk(real);
  return { folder: real, files, bytes };
}

// ---- sites ------------------------------------------------------------------------------------------

interface SiteRow {
  id: string;
  name: string;
  slug: string | null;
  visibility: SiteVisibility;
  kind: 'folder' | 'page';
  folder: string | null;
  page_id: string | null;
  nonce: string;
  created_at: number;
  session_key: string | null;
}

const sig = (r: { id: string; nonce: string }) => signWithKey(`site:${r.id}:${r.nonce}`).slice(0, 32);

/** Where a site is served, from the app's address. */
const pathOf = (r: SiteRow) => `/site/${r.visibility === 'public' && r.slug ? r.slug : `${r.id}.${sig(r)}`}/`;

function toSite(db: DB, r: SiteRow): SiteInfo {
  return {
    id: r.id,
    name: r.name,
    visibility: r.visibility,
    kind: r.kind,
    folder: r.folder ?? undefined,
    pageId: r.page_id ?? undefined,
    pageTitle: r.page_id ? (pageInfo(db, r.page_id)?.title ?? undefined) : undefined,
    path: pathOf(r),
    createdAt: r.created_at,
    sessionKey: r.session_key ?? undefined,
  };
}

export function listSites(db: DB): SiteInfo[] {
  return (db.prepare('select * from sites order by created_at desc').all() as SiteRow[]).map((r) => toSite(db, r));
}

/** A readable, unused name for a public link. */
function slugFor(db: DB, name: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'site';
  let slug = base;
  for (let i = 2; db.prepare('select 1 from sites where slug = ?').get(slug); i++) slug = `${base}-${i}`;
  return slug;
}

export function publish(db: DB, p: { name: unknown; visibility: unknown; folder?: string; pageId?: string; sessionKey?: string }): SiteInfo {
  const visibility: SiteVisibility = p.visibility === 'public' ? 'public' : 'private';
  const name = cleanTitle(p.name, 'Site').slice(0, 60);
  if ((db.prepare('select count(*) as n from sites').get() as { n: number }).n >= MAX_SITES) throw new HttpError(409, `At most ${MAX_SITES} sites can be published; unpublish some first.`);
  let folder: string | null = null;
  if (p.pageId) {
    if (!pageInfo(db, p.pageId)) throw new HttpError(404, 'No saved page with that id');
  } else if (p.folder) folder = inspectFolder(p.folder).folder;
  else throw new HttpError(400, 'Pick a folder or a saved page to publish');
  const row: SiteRow = {
    id: newId(),
    name,
    slug: visibility === 'public' ? slugFor(db, name) : null,
    visibility,
    kind: p.pageId ? 'page' : 'folder',
    folder,
    page_id: p.pageId ?? null,
    nonce: crypto.randomBytes(9).toString('base64url'),
    created_at: Date.now(),
    session_key: p.sessionKey ?? null,
  };
  db.prepare('insert into sites (id, name, slug, visibility, kind, folder, page_id, nonce, created_at, session_key) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    row.id,
    row.name,
    row.slug,
    row.visibility,
    row.kind,
    row.folder,
    row.page_id,
    row.nonce,
    row.created_at,
    row.session_key,
  );
  return toSite(db, row);
}

export function unpublish(db: DB, id: string): boolean {
  return db.prepare('delete from sites where id = ?').run(id).changes > 0;
}

/** A saved page's published copies go with it. */
export function unpublishPage(db: DB, pageId: string): number {
  return db.prepare('delete from sites where page_id = ?').run(pageId).changes;
}

/** The site a link opens: a private one by its signed id, a public one by its name. */
export function siteByToken(db: DB, token: string): SiteRow | null {
  const t = String(token ?? '');
  if (t.includes('.')) {
    const [id, s, extra] = t.split('.');
    if (!id || !s || extra !== undefined) return null;
    const r = db.prepare("select * from sites where id = ? and visibility = 'private'").get(id) as SiteRow | undefined;
    if (!r) return null;
    const want = sig(r);
    return want.length === s.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s)) ? r : null;
  }
  if (!/^[a-z0-9-]{1,60}$/.test(t)) return null;
  return (db.prepare("select * from sites where slug = ? and visibility = 'public'").get(t) as SiteRow | undefined) ?? null;
}

// ---- requests from agents ---------------------------------------------------------------------------

interface ReqRow {
  id: string;
  session_key: string;
  name: string;
  kind: 'folder' | 'page';
  folder: string | null;
  page_id: string | null;
  files: number;
  bytes: number;
  status: PublishRequest['status'];
  site_id: string | null;
  error: string | null;
  created_at: number;
  decided_at: number | null;
}

function toRequest(db: DB, r: ReqRow): PublishRequest {
  const site = r.site_id ? (db.prepare('select * from sites where id = ?').get(r.site_id) as SiteRow | undefined) : undefined;
  return {
    id: r.id,
    sessionKey: r.session_key,
    name: r.name,
    kind: r.kind,
    folder: r.folder ?? undefined,
    pageId: r.page_id ?? undefined,
    pageTitle: r.page_id ? (pageInfo(db, r.page_id)?.title ?? undefined) : undefined,
    files: r.files,
    bytes: r.bytes,
    status: r.status,
    site: site ? toSite(db, site) : undefined,
    error: r.error ?? undefined,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? undefined,
  };
}

export function getRequest(db: DB, id: string): PublishRequest | null {
  const r = db.prepare('select * from site_requests where id = ?').get(String(id)) as ReqRow | undefined;
  return r ? toRequest(db, r) : null;
}

/** An agent asks to publish: checked now, decided by the user on the card. */
export function createRequest(db: DB, p: { sessionKey: string; name: unknown; folder?: string; pageId?: string }): PublishRequest {
  const open = (db.prepare("select count(*) as n from site_requests where session_key = ? and status = 'open'").get(p.sessionKey) as { n: number }).n;
  if (open >= 5) throw new HttpError(409, 'Five requests to publish already wait for the user in this session; wait for their answer.');
  const name = cleanTitle(p.name, '').slice(0, 60);
  if (!name) throw new HttpError(400, 'Give the site a name');
  let files = 1;
  let bytes = 0;
  let folder: string | null = null;
  if (p.pageId) {
    const page = pageSource(db, p.pageId);
    if (!page) throw new HttpError(404, 'No saved page with that id (get_page lists them)');
    bytes = Buffer.byteLength(page.text);
  } else {
    const f = inspectFolder(p.folder!);
    ({ folder, files, bytes } = f);
  }
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare("insert into site_requests (id, session_key, name, kind, folder, page_id, files, bytes, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)").run(
    id,
    p.sessionKey,
    name,
    p.pageId ? 'page' : 'folder',
    folder,
    p.pageId ?? null,
    files,
    bytes,
    Date.now(),
  );
  return getRequest(db, id)!;
}

/** The user's answer on the card. Only an open request can be answered, once. */
export function decideRequest(db: DB, id: string, yes: boolean, visibility: unknown): PublishRequest {
  const r = db.prepare('select * from site_requests where id = ?').get(String(id)) as ReqRow | undefined;
  if (!r) throw new HttpError(404, 'No such request to publish');
  if (r.status !== 'open') throw new HttpError(409, 'That was already decided');
  let status: PublishRequest['status'] = 'declined';
  let siteId: string | null = null;
  let error: string | null = null;
  if (yes) {
    try {
      siteId = publish(db, { name: r.name, visibility, folder: r.folder ?? undefined, pageId: r.page_id ?? undefined, sessionKey: r.session_key }).id;
      status = 'published';
    } catch (e) {
      status = 'failed';
      error = (e as Error).message;
    }
  }
  const done = db.prepare("update site_requests set status = ?, site_id = ?, error = ?, decided_at = ? where id = ? and status = 'open'").run(status, siteId, error, Date.now(), r.id);
  if (!done.changes) {
    if (siteId) unpublish(db, siteId);
    throw new HttpError(409, 'That was already decided');
  }
  return getRequest(db, r.id)!;
}

// ---- serving ----------------------------------------------------------------------------------------

/**
 * A site runs in an opaque origin (sandbox without allow-same-origin): no cookies of this app, no
 * storage of its own, and nothing it asks of /api/ is answered to it. Its code comes from itself and
 * three CDNs; it may call out over HTTPS; only this app may frame it.
 */
export const SITE_CSP = [
  'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https:",
  'img-src * data: blob:',
  'media-src * data: blob:',
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https: data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "frame-ancestors 'self'",
].join('; ');

const MAX_INJECT = 8 * 1024 * 1024;

const text = (reply: FastifyReply, code: number, msg: string) => reply.code(code).header('Cache-Control', 'no-store').type('text/plain; charset=utf-8').send(msg);

/** GET /site/:token/* */
export async function serveSite(db: DB, req: FastifyRequest, reply: FastifyReply) {
  const prm = req.params as { token: string; '*'?: string };
  const site = siteByToken(db, prm.token);
  if (!site) return text(reply, 404, 'There is nothing published here (it may have been unpublished).');
  reply.header('Content-Security-Policy', SITE_CSP);
  if (site.visibility === 'private') reply.header('X-Robots-Tag', 'noindex, nofollow');
  const rest = prm['*'] ?? '';
  if (site.kind === 'page') {
    if (rest && rest !== 'index.html') return text(reply, 404, 'Not found');
    const page = site.page_id ? await pageHtml(db, site.page_id) : null;
    if (!page) return text(reply, 404, 'The page this site showed was deleted.');
    reply.header('Cache-Control', 'no-cache');
    // (its databases show what they hold, as they are: a published copy keeps no change)
    return reply
      .type('text/html; charset=utf-8')
      .send(injectHead(page.html, kitHead({ n: '', theme: 'auto', max: { key: STORAGE_LIMITS.key, value: STORAGE_LIMITS.value }, seed: dbSeed(db, site.page_id!) }, page.html)));
  }
  // Never a dot file or folder (.env, .git), never a way out.
  const segs = rest.split('/');
  if (segs.some((s) => s.startsWith('.') || s.includes('\\') || s.includes('\0'))) return text(reply, 404, 'Not found');
  let root: string;
  try {
    root = fs.realpathSync(site.folder!);
  } catch {
    return text(reply, 404, 'The folder this site served is gone.');
  }
  // It was checked as it was then: a folder swapped since for a link to elsewhere is not followed.
  if (root !== site.folder) return text(reply, 404, 'The folder this site served has moved; publish it again.');
  const find = (p: string): string | null => {
    const f = inside(root, p);
    if (!f) return null;
    try {
      const st = fs.statSync(f);
      const file = st.isDirectory() ? path.join(f, 'index.html') : f;
      const real = fs.realpathSync(file);
      return real.startsWith(root + path.sep) && fs.statSync(real).isFile() ? real : null;
    } catch {
      return null;
    }
  };
  // A path without a file name extension that is not there is an app's own route: its index.html answers.
  const file = find(rest) ?? (!path.extname(rest) ? find('index.html') : null);
  if (!file) return text(reply, 404, 'Not found');
  const st = fs.statSync(file);
  const modified = new Date(Math.floor(st.mtimeMs / 1000) * 1000).toUTCString();
  reply.header('Last-Modified', modified);
  reply.header('Cache-Control', /[-.][A-Za-z0-9_]{8,}\.(js|css|woff2?|png|jpe?g|webp|svg|avif)$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (req.headers['if-modified-since'] === modified) return reply.code(304).send();
  const type = file.endsWith('.webmanifest') ? 'application/manifest+json' : pageMimeFor(file);
  // Pages get the stand-ins for the browser storage a sandboxed page lacks.
  if (/^text\/html/.test(type) && st.size <= MAX_INJECT) return reply.type(type).send(injectHead(fs.readFileSync(file, 'utf8'), storageShim()));
  reply.header('Content-Length', st.size);
  return reply.type(type).send(fs.createReadStream(file));
}
