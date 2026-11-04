// Site icons for the sources a reply cites (the chips and cards under it, web/src/components/Citations.tsx): the
// pages of this app load nothing from other sites, so the server fetches each site's icon once (its /favicon.ico,
// else the icon its home page names, else its parent domain's) and keeps a copy under the data folder. A site with
// none is asked again only days later; the page then shows the site's first letter. Only public addresses are
// fetched, and what is served can never run as a page of the app (a sandbox policy goes with it).
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import { fetchPage } from './fetch.ts';

const dir = () => path.join(config.dataDir, 'site-icons');
/** How big an icon may be, and how long a site without one is left alone. */
const MAX = 256 * 1024;
const RETRY_MS = 3 * 86_400_000;
const HOST = /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** What kind of picture the first bytes say it is, or null when it is not one. */
export function iconType(b: Buffer): string | null {
  if (b.length < 4) return null;
  if (b.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0) return 'image/x-icon';
  const head = b.toString('utf8', 0, Math.min(b.length, 512)).trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

/** An icon from an address: its bytes when they are a picture. */
async function iconAt(url: string): Promise<Buffer | null> {
  try {
    const r = await fetchPage(url, { maxBytes: MAX + 1, timeoutMs: 6000 });
    if (r.status >= 400 || r.truncated) return null;
    const body = r.body ?? (/svg/i.test(r.contentType) ? Buffer.from(r.text, 'utf8') : null);
    return body?.length && iconType(body) ? body : null;
  } catch {
    return null;
  }
}

/** A site's icon: its /favicon.ico, else the one its home page names; for a subdomain, its parent's after that. */
async function findIcon(host: string): Promise<Buffer | null> {
  for (const h of [host, host.split('.').length > 2 ? host.split('.').slice(1).join('.') : null]) {
    if (!h) continue;
    const ico = await iconAt(`https://${h}/favicon.ico`);
    if (ico) return ico;
    try {
      const home = await fetchPage(`https://${h}/`, { maxBytes: 1_000_000, timeoutMs: 8000 });
      const named = home.icon ? await iconAt(home.icon) : null;
      if (named) return named;
    } catch {}
  }
  return null;
}

const asking = new Map<string, Promise<Buffer | null>>();

/** A site's icon, from the copy kept here, else fetched now (once, however many ask at the same time). */
export async function siteIcon(host: string): Promise<Buffer | null> {
  const file = path.join(dir(), host);
  try {
    return fs.readFileSync(file);
  } catch {}
  try {
    if (Date.now() - fs.statSync(`${file}.none`).mtimeMs < RETRY_MS) return null;
  } catch {}
  let p = asking.get(host);
  if (!p) {
    p = findIcon(host).then((b) => {
      try {
        fs.mkdirSync(dir(), { recursive: true });
        if (b) fs.writeFileSync(file, b);
        else fs.writeFileSync(`${file}.none`, '');
      } catch {}
      return b;
    });
    asking.set(host, p);
    void p.finally(() => asking.delete(host));
  }
  return p;
}

export function iconRoutes(app: FastifyInstance) {
  app.get('/api/site-icon/:host', async (req, reply) => {
    const host = String((req.params as { host: string }).host ?? '')
      .toLowerCase()
      .replace(/^www\./, '');
    if (!HOST.test(host)) return reply.code(400).send({ error: 'Not a site' });
    const b = await siteIcon(host);
    if (!b) return reply.code(404).header('Cache-Control', 'private, max-age=86400').send({ error: 'No icon' });
    return reply
      .header('Content-Type', iconType(b) ?? 'application/octet-stream')
      .header('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'")
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, max-age=604800')
      .send(b);
  });
}
