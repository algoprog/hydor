// The endpoint routes for sending a project to another machine: what it would carry, the bundle that carries it, where one
// arriving would go, making a project from a bundle, and leaving after a move (shared/transfer.ts has the shapes; the hub
// that drives them is hub.ts). A machine's access token already allows all of these there; paths are checked anyway.
import { Readable } from 'node:stream';
import type { SendHow } from '../../../shared/transfer.ts';
import { HttpError } from '../../auth.ts';
import { config } from '../../config.ts';
import type { Feature } from '../../features/types.ts';
import { arrivalPlace, arrive, leave } from './arrive.ts';
import { carryBundle, carryPlan, type CarryOptions } from './carry.ts';
import { BundleError } from './stream.ts';

type Query = Record<string, string | undefined>;

/** A query value that is a JSON list of strings, or undefined. */
function listOf(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  try {
    const a = JSON.parse(v);
    if (Array.isArray(a) && a.every((x) => typeof x === 'string')) return a;
  } catch {}
  throw new HttpError(400, 'also: a JSON list of folders');
}

export const projectTransfer: Feature = {
  id: 'project-transfer',
  routes(d) {
    const id = (req: { params: unknown }) => String((req.params as { id: string }).id);
    const query = (req: { query: unknown }) => (req.query ?? {}) as Query;
    const carryOptions = (req: { query: unknown }): CarryOptions => ({ leaveOut: query(req).leaveOut !== '0', also: query(req).also === '1' });

    // What it would carry: its folder's files, what is left out and why, and what else goes with it (nothing is read).
    d.app.get('/api/projects/:id/carry', async (req) => carryPlan(d.db, id(req), carryOptions(req)));
    // The bundle that carries it: a stream the receiving machine's POST /api/projects/arrive reads (not compressed again).
    d.app.get('/api/projects/:id/carry/bundle', { compress: false } as object, async (req, reply) => {
      const stream = await carryBundle(d.db, id(req), carryOptions(req));
      return reply.header('content-type', 'application/x-hydor-bundle').header('cache-control', 'no-store').send(stream);
    });
    // Where a project arriving would go here (static: it is not a project's id).
    d.app.get('/api/projects/arrival', async (req) => {
      const q = query(req);
      try {
        return arrivalPlace(d.db, { name: q.name, rel: q.rel, also: listOf(q.also) }, config.version);
      } catch (e) {
        if (e instanceof BundleError) throw new HttpError(400, `rel: ${e.message}`);
        throw e;
      }
    });
    // Makes a project from a bundle (the body is the bundle as it is: server/index.ts leaves application/octet-stream a stream).
    d.app.post('/api/projects/arrive', async (req, reply) => {
      const q = query(req);
      const body = req.body as unknown;
      if (!(body instanceof Readable)) throw new HttpError(415, 'The body is the bundle itself: send it as application/octet-stream');
      const ac = new AbortController();
      // The sender went away before the end: what was staged goes.
      req.raw.once('close', () => {
        if (!req.raw.complete) ac.abort();
      });
      try {
        return await arrive(d, body, { folder: String(q.folder ?? ''), how: (q.how ?? 'copy') as SendHow, from: String(q.from ?? '').slice(0, 80) || 'another machine', also: listOf(q.also), signal: ac.signal });
      } catch (e) {
        if (e instanceof BundleError) throw new HttpError(400, `The bundle is broken: ${e.message}`);
        throw e;
      } finally {
        void reply;
      }
    });
    // A moved project leaves: deleted here, its folder in the Trash.
    d.app.post('/api/projects/:id/leave', async (req) => leave(d, id(req), (req.body ?? {}) as { to?: string }));
  },
};
