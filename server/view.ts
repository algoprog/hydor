// An HTML file shown as a page (in Files, on a page's canvas): a short-lived signed link to its folder, under which the
// folder's files are served, sandboxed. The link's token is the address's first part, read here rather than as a
// route parameter: the router turns away a parameter longer than 100 characters, and the token carries the folder's
// path, so a page in a deeper folder (/home/you/project/data/examples) fell through to the app's own page, which
// cannot start in the sandbox: its loading logo stayed in place of the page.
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { HttpError } from './auth.ts';
import * as files from './files.ts';
import { inside, readLink, signLink } from './links.ts';

/** How long a page's link lets it load its files. */
const VIEW_MS = 3600_000;

export function viewRoutes(app: FastifyInstance) {
  /** An HTML file shown as a page: sandboxed, able to load the files next to it, for an hour. */
  app.post('/api/fs/view-link', async (req) => {
    const p = files.resolvePath(String((req.body as any)?.path ?? ''));
    const st = await fs.promises.stat(p).catch(() => null);
    if (!st?.isFile()) throw new HttpError(404, 'Not found');
    return { url: `/view/${signLink({ d: path.dirname(p) }, VIEW_MS)}/${encodeURIComponent(path.basename(p))}` };
  });
  app.get('/view/*', async (req, reply) => {
    // The token, then the file inside its folder (sub-folders too).
    const rest = (req.params as Record<string, string>)['*'] ?? '';
    const cut = rest.indexOf('/');
    const link = cut > 0 ? readLink<{ d: string }>(rest.slice(0, cut)) : null;
    if (!link) return reply.code(403).type('text/plain; charset=utf-8').send('This preview link has expired. Open the file again.');
    const file = inside(link.d, rest.slice(cut + 1));
    const st = file ? await fs.promises.stat(file).catch(() => null) : null;
    if (!file || !st?.isFile()) return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    // An opaque origin: the page's scripts run, but never with this app's cookie or its pages.
    reply.header('Content-Security-Policy', "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'");
    reply.header('Content-Type', files.pageMimeFor(file));
    reply.header('Cache-Control', 'private, no-cache');
    return reply.send(fs.createReadStream(file));
  });
}
