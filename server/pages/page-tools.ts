// Tools of the page editor that need the server:
//   POST /api/pages/bookmark {url} → {url, title, description, image, icon, site}: what a link shows as a Bookmark block,
//     read from the page at that address (public addresses only, a few seconds and a megabyte and a half at most).
import type { FastifyRequest } from 'fastify';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { fetchPage } from '../web/fetch.ts';

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

export function pageToolsRoutes(d: Deps) {
  const { app } = d;
  const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
  app.post('/api/pages/bookmark', async (req) => {
    const url = B(req).url;
    if (typeof url !== 'string' || !url.trim()) throw new HttpError(400, 'url: the link to make a card of');
    return bookmarkOf(url);
  });
}
