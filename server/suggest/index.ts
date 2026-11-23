// Word suggestions: the rest of the word after the caret, from a small model of the app's own mixed with Qwen3.5-0.8B,
// on this computer (docs/plans/word-suggestions.md). This is the server's part: its routes, and the service behind them
// (service.ts) that sets things up, runs the two processes and personalises on a schedule.
import type { SuggestRequest } from '../../shared/suggest.ts';
import { HttpError } from '../auth.ts';
import type { Deps, Feature } from '../features/types.ts';
import { SuggestService } from './service.ts';
import { cleanUsage } from './usage.ts';

let svc: SuggestService | null = null;
/** The service, once the routes are up. */
export const suggestService = (): SuggestService | null => svc;

const SURFACES = ['chat', 'doc', 'text'];
const LIMIT = 4000;

/** A request's body, checked: a text of a few thousand characters at most per field (the client sends 2,000). */
export function cleanRequest(body: unknown): SuggestRequest {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!b) throw new HttpError(400, 'Send the request as an object');
  if (typeof b.surface !== 'string' || !SURFACES.includes(b.surface)) throw new HttpError(400, 'surface: chat, doc or text');
  if (typeof b.text !== 'string') throw new HttpError(400, 'text: the text before the caret');
  const opt = (k: string, max = LIMIT) => {
    const v = b[k];
    if (v == null) return undefined;
    if (typeof v !== 'string') throw new HttpError(400, `${k}: text`);
    return v.length > max ? v.slice(-max) : v;
  };
  const id = (k: string) => {
    const v = b[k];
    if (v == null || v === '') return undefined;
    if (typeof v !== 'string' || v.length > 200) throw new HttpError(400, `${k}: a short text`);
    return v;
  };
  const req: SuggestRequest = { surface: b.surface as SuggestRequest['surface'], text: b.text.length > LIMIT ? b.text.slice(-LIMIT) : b.text };
  const reply = opt('reply');
  const prev = opt('prev');
  const doc = opt('doc');
  const session = id('session');
  const client = id('client');
  if (reply) req.reply = reply;
  if (prev) req.prev = prev;
  if (doc) req.doc = doc;
  if (session) req.session = session;
  if (client) req.client = client;
  return req;
}

export const suggest: Feature = {
  id: 'suggest',
  routes(d: Deps) {
    const s = (svc = new SuggestService(d.db, (state) => d.broadcast({ t: 'feature', id: 'suggest', data: state })));
    d.app.get('/api/suggest', async () => s.state());
    d.app.put('/api/suggest', async (req) => s.configure(req.body ?? {}));
    d.app.post('/api/suggest', async (req, reply) => {
      const body = cleanRequest(req.body);
      if (!s.settings.enabled || !s.surfaceOn(body.surface)) return reply.code(204).send();
      // The request is closed (the person typed on): the worker is told to stop it.
      const ac = new AbortController();
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) ac.abort();
      });
      const out = await s.suggest(body, ac.signal);
      if (!out || ac.signal.aborted) return reply.code(204).send();
      return out;
    });
    d.app.post('/api/suggest/warm', async () => s.warm());
    d.app.post('/api/suggest/train', async () => s.train());
    d.app.delete('/api/suggest/personal', async () => s.forget());
    // What suggestions did, as counts: the page sends them in batches.
    d.app.post('/api/suggest/usage', async (req) => ({ usage: s.addUsage(cleanUsage(req.body ?? {})) }));
    d.app.delete('/api/suggest/usage', async () => s.resetUsage());
  },
  start() {
    svc?.start();
  },
};
