// Tools of the page editor that need the server:
//   POST /api/pages/bookmark {url} → {url, title, description, image, icon, site}: what a link shows as a Bookmark block,
//     read from the page at that address (public addresses only, a few seconds and a megabyte and a half at most).
//   POST /api/pages/import-blocks {name, data} → {title, html, notes}: a file as blocks to put in a page (Markdown or text,
//     a web page, a Word file, a CSV file as a database, a Notion export's .zip with its databases and their rows' pages).
//   POST /api/pages/import-page {name, data, space?, folder?} → {page, notes}: the same, as a page of its own.
//   POST /api/pages/:id/lock {locked} → {page}: locked, a page makes no new version (by anyone) until it is unlocked.
//   GET  /api/pages/:id/backlinks → {pages}: the pages whose current version links to it.
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { ASSET, asAccepted, docMarkdown, mapDocSources } from '../../shared/docs.ts';
import { markdownBlocks, pageDatabases } from '../../shared/page-db.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { Zip } from '../documents/zip.ts';
import type { Deps } from '../features/types.ts';
import { fetchPage } from '../web/fetch.ts';
import { assetDataUrl } from './assets.ts';
import { docFromFile } from './docs.ts';
import { createPage, mustPage } from './store.ts';

const httpsOnly = (v: unknown) => (typeof v === 'string' && /^https:\/\/[^\s"'<>\\]{1,1800}$/i.test(v) ? v : undefined);
const line = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** What a link shows as a card: its title, description, picture and icon, as its page says them. */
export async function bookmarkOf(url: string, signal?: AbortSignal) {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new HttpError(400, 'That is not a web address (https://…)');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'That is not a web address (https://…)');
  try {
    const p = await fetchPage(u.href, { signal, maxBytes: 1_500_000, timeoutMs: 12_000 });
    return {
      url: p.url || u.href,
      title: line(p.title, 200) || u.hostname,
      description: line(p.description, 400),
      image: httpsOnly(p.image),
      icon: httpsOnly(p.icon) ?? `https://${new URL(p.url || u.href).hostname}/favicon.ico`,
      site: new URL(p.url || u.href).hostname.replace(/^www\./, ''),
    };
  } catch (e) {
    // A page that can't be read still makes a card: its address.
    if (e instanceof HttpError && e.status === 400) throw e;
    return { url: u.href, title: u.hostname.replace(/^www\./, ''), description: '', image: undefined, icon: undefined, site: u.hostname.replace(/^www\./, ''), unread: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}


// ---- import into a page: Markdown, a Notion export (.zip, its CSV databases), a Word file, a web page --------------------------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A Notion export's name without the id Notion puts after it ("Tasks 1a2b…" → "Tasks"). */
const notionName = (s: string) =>
  s
    .replace(/\.(md|csv)$/i, '')
    .replace(/_all$/i, '')
    .replace(/\s+[0-9a-f]{32}$/i, '')
    .trim();
const PIC_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const MAX_PIC = 400 * 1024;

/** A database block made from a CSV file's rows (its row pages too, where an export has them). */
function dbBlock(title: string, csv: string, rowPages: Map<string, string>): { html: string; rows: number } {
  const D = pageDatabases();
  const r = D.fromCsv(D.normalize({ cols: [{ name: 'Name' }], rows: [] }), csv);
  const s = r.state;
  s.title = title.slice(0, 120);
  const first = s.cols[0];
  for (const row of s.rows) {
    const t = first ? D.cellText(s, row, first).toLowerCase() : '';
    const page = t ? rowPages.get(t) : undefined;
    if (page) row.page = page.slice(0, 40_000);
  }
  const name = `db-${crypto.randomBytes(4).toString('hex').slice(0, 5)}`;
  return { html: `<div class="n-db" data-db="${name}" data-title="${esc(s.title)}" data-schema="${esc(JSON.stringify(s))}"></div>`, rows: s.rows.length };
}

/** A Notion row's page: its words after its title and its properties (the "Key: value" lines Notion puts first). */
const rowPageOf = (md: string) =>
  md
    .replace(/^\s*#\s+[^\n]*\n+/, '')
    .replace(/^(?:[^\n:]{1,60}:[^\n]*\n)+\n*/, '')
    .trim();

/** A Notion export (Markdown & CSV), as one page: its main page, its databases in their places, its sub-pages after it. */
function notionPage(buf: Buffer, notes: string[]): { title: string; html: string } {
  let zip = new Zip(buf);
  let names = zip.names().filter((n) => !n.startsWith('__MACOSX/') && !n.endsWith('/'));
  // An export in parts: a zip inside the zip.
  if (!names.some((n) => /\.(md|csv)$/i.test(n))) {
    const inner = names.find((n) => /\.zip$/i.test(n));
    const b = inner ? zip.read(inner) : null;
    if (b) {
      zip = new Zip(b);
      names = zip.names().filter((n) => !n.startsWith('__MACOSX/') && !n.endsWith('/'));
    }
  }
  const mds = names.filter((n) => /\.md$/i.test(n)).sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
  if (!mds.length && !names.some((n) => /\.csv$/i.test(n))) throw new HttpError(422, 'That .zip has no Markdown pages or CSV databases: export from Notion as “Markdown & CSV”.');
  const csvs = names.filter((n) => /\.csv$/i.test(n));
  // (Notion gives a database twice, its view's rows and all of them: the second is the one)
  const dbFiles = new Map<string, string>();
  for (const c of csvs) {
    const base = c.replace(/(_all)?\.csv$/i, '');
    if (!dbFiles.has(base) || /_all\.csv$/i.test(c)) dbFiles.set(base, c);
  }
  /** The row pages under a database's folder, by their titles. */
  const rowPagesOf = (base: string) => {
    const out = new Map<string, string>();
    for (const m of mds) if (m.startsWith(`${base}/`) && m.split('/').length === base.split('/').length + 1) out.set(notionName(m.split('/').pop()!).toLowerCase(), rowPageOf(zip.text(m) ?? ''));
    return out;
  };
  const used = new Set<string>();
  const dbHtml = (base: string) => {
    const f = dbFiles.get(base);
    if (!f || used.has(base)) return '';
    used.add(base);
    const b = dbBlock(notionName(f.split('/').pop()!), zip.text(f) ?? '', rowPagesOf(base));
    notes.push(`The database “${notionName(f.split('/').pop()!)}” came in with ${b.rows} rows.`);
    return b.html;
  };
  const rowPageFiles = new Set(mds.filter((m) => [...dbFiles.keys()].some((base) => m.startsWith(`${base}/`))));
  /** A page's Markdown as blocks: its pictures inside it, its databases where it links to them. */
  const convert = (file: string) => {
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    const at = (href: string) => {
      try {
        return dir + decodeURIComponent(href.split('#')[0]);
      } catch {
        return dir + href;
      }
    };
    let md = (zip.text(file) ?? '').replace(/\r\n?/g, '\n');
    const marks: string[] = [];
    // A line that is only a link to a database (its CSV): the database, in its place.
    md = md.replace(/^\s*\[([^\]]*)\]\(([^)]+\.csv)\)\s*$/gim, (_m, _t, href: string) => {
      const base = at(href).replace(/(_all)?\.csv$/i, '');
      marks.push(dbHtml(base));
      return `\n\nNDBMARK${marks.length - 1}\n\n`;
    });
    // Its pictures, inside the page (small ones; the others are named).
    md = md.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt: string, href: string) => {
      if (/^https?:/i.test(href)) return m;
      const p = at(href);
      const ext = /\.([a-z0-9]+)$/i.exec(p)?.[1]?.toLowerCase() ?? '';
      const b = PIC_TYPES[ext] ? zip.read(p) : null;
      if (!b) return alt ? `*${alt}*` : '';
      if (b.length > MAX_PIC) {
        notes.push(`A picture (${p.split('/').pop()}) was too large to go inside the page.`);
        return alt ? `*${alt}*` : '';
      }
      return `![${alt}](data:${PIC_TYPES[ext]};base64,${b.toString('base64')})`;
    });
    // Links to its sub-pages: their titles (they come after it).
    md = md.replace(/\[([^\]]+)\]\(([^)]+\.md)\)/gi, (_m, t: string) => notionName(t));
    let html = markdownBlocks(md);
    html = html.replace(/<p>NDBMARK(\d+)<\/p>/g, (_m, i: string) => marks[Number(i)] ?? '');
    return html;
  };
  const main = mds[0];
  const parts: string[] = [];
  let title = 'Imported page';
  if (main) {
    const text = zip.text(main) ?? '';
    title = /^\s*#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? notionName(main.split('/').pop()!);
    parts.push(convert(main).replace(/^<h1>[^<]*<\/h1>/, ''));
  }
  // Its sub-pages, as sections after it.
  const subs = mds.filter((m) => m !== main && !rowPageFiles.has(m)).slice(0, 30);
  for (const m of subs) {
    const t = /^\s*#\s+(.+)$/m.exec(zip.text(m) ?? '')?.[1]?.trim() ?? notionName(m.split('/').pop()!);
    parts.push(`<h2>${esc(t)}</h2>${convert(m).replace(/^<h1>[^<]*<\/h1>/, '')}`);
  }
  if (subs.length) notes.push(`${subs.length} sub-page${subs.length === 1 ? '' : 's'} came in as sections at the end.`);
  // Databases no page links to: at the end.
  for (const base of dbFiles.keys()) parts.push(dbHtml(base));
  return { title, html: parts.join('') };
}

/** A web page's body, without what runs or loads (the editor cleans it again as it goes in). */
function htmlBlocks(html: string): { title: string; html: string } {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  let body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  body = body
    .replace(/<(script|style|noscript|template|iframe|object|embed|svg|form|button|select|textarea)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(link|meta|base|input|iframe|embed)\b[^>]*>/gi, '')
    .replace(/\s(on\w+|style|class|id)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
  return { title, html: body };
}

/** A file made blocks of a page: Markdown or text, a web page, a Word file, or a Notion export (.zip). */
export async function importBlocks(db: DB, name: string, data: Buffer): Promise<{ title: string; html: string; notes: string[] }> {
  const notes: string[] = [];
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const base = name.replace(/\.[^.]+$/, '');
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
    const text = data.toString('utf8').replace(/^﻿/, '').replace(/^---\n[\s\S]*?\n---\n/, '');
    const title = /^\s*#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? base;
    return { title, html: markdownBlocks(text), notes };
  }
  if (ext === 'html' || ext === 'htm') {
    const r = htmlBlocks(data.toString('utf8'));
    return { title: r.title || base, html: r.html, notes };
  }
  if (ext === 'docx') {
    const doc = docFromFile(data, name);
    const md = docMarkdown(mapDocSources(asAccepted(doc), (src) => (src.startsWith(ASSET) ? (assetDataUrl(db, src.slice(ASSET.length)) ?? '') : src)));
    return { title: base, html: markdownBlocks(md), notes };
  }
  if (ext === 'zip') {
    const r = notionPage(data, notes);
    return { ...r, notes };
  }
  if (ext === 'csv' || ext === 'tsv') {
    const b = dbBlock(base, data.toString('utf8'), new Map());
    return { title: base, html: b.html, notes: [`The database came in with ${b.rows} rows.`] };
  }
  throw new HttpError(415, 'Import Markdown (.md, .txt), a web page (.html), a Word file (.docx), a CSV file, or a Notion export (.zip of “Markdown & CSV”).');
}

/** A page of its own from an import: the kit's look, its title on top. */
export const importedPage = (title: string, blocks: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>\nbody{max-width:760px;margin:0 auto}\n</style>\n</head>\n<body class="n-page">\n<h1>${esc(title)}</h1>\n${blocks}\n</body>\n</html>\n`;

// ---- links to a page from others, and a page locked ----------------------------------------------------------------------------
/** The pages (of HTML) whose current version links to this one. */
export function backlinks(db: DB, id: string): { id: string; title: string; icon?: string }[] {
  if (!/^[\w-]{1,40}$/.test(id)) return [];
  const rows = db
    .prepare("select p.id, p.title, p.icon from pages p join page_versions v on v.page_id = p.id and v.version = p.version where p.kind is null and p.app is null and p.id != ? and (v.html like ? or v.html like ?) order by p.updated_at desc limit 100")
    .all(id, `%data-page="${id}"%`, `%/pages/${id}"%`) as { id: string; title: string; icon: string | null }[];
  return rows.map((r) => ({ id: r.id, title: r.title, ...(r.icon ? { icon: r.icon } : {}) }));
}

export function setLocked(db: DB, id: string, locked: boolean) {
  mustPage(db, id);
  db.prepare('update pages set locked = ? where id = ?').run(locked ? 1 : null, id);
  return mustPage(db, id);
}

export function pageToolsRoutes(d: Deps) {
  const { app } = d;
  const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
  app.post('/api/pages/bookmark', async (req) => {
    const url = B(req).url;
    if (typeof url !== 'string' || !url.trim()) throw new HttpError(400, 'url: the link to make a card of');
    return bookmarkOf(url);
  });
  const fileOf = (b: Record<string, unknown>) => {
    const name = typeof b.name === 'string' ? b.name.slice(0, 300) : '';
    if (!name || typeof b.data !== 'string') throw new HttpError(400, 'Send the file’s name and its data (base64)');
    const data = Buffer.from(b.data, 'base64');
    if (data.length > 30 * 1024 * 1024) throw new HttpError(413, 'It is over 30 MB');
    return { name, data };
  };
  app.post('/api/pages/import-blocks', { bodyLimit: 42 * 1024 * 1024 }, async (req) => {
    const f = fileOf(B(req));
    try {
      return await importBlocks(d.db, f.name, f.data);
    } catch (e) {
      throw e instanceof HttpError ? e : new HttpError(422, `That file could not be read: ${(e as Error).message}`);
    }
  });
  app.post('/api/pages/import-page', { bodyLimit: 42 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    const f = fileOf(b);
    let r: Awaited<ReturnType<typeof importBlocks>>;
    try {
      r = await importBlocks(d.db, f.name, f.data);
    } catch (e) {
      throw e instanceof HttpError ? e : new HttpError(422, `That file could not be read: ${(e as Error).message}`);
    }
    const html = importedPage(r.title, r.html.replace(/^<h1>[^<]*<\/h1>/, ''));
    if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new HttpError(413, 'What came in is over 2 MB, more than a page holds: import a smaller part of it');
    const page = createPage(d.db, { title: r.title, html, by: 'made', space: typeof b.space === 'string' ? b.space : null, folder: typeof b.folder === 'string' ? b.folder : null });
    d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
    return { page, notes: r.notes };
  });
  app.post('/api/pages/:id/lock', async (req) => {
    const id = (req.params as Record<string, string>).id;
    const page = setLocked(d.db, id, B(req).locked === true);
    d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
    return { page };
  });
  app.get('/api/pages/:id/backlinks', async (req) => ({ pages: backlinks(d.db, (req.params as Record<string, string>).id) }));
}
