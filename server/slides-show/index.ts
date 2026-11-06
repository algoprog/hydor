// Presenting and recording slides, the server's part: the sounds of slides' narrations (recorded in the editor, kept as
// the deck's videos are), narrations made with AI (their cost said first), and the phone remote's slideshows. The rest
// is the slides editor's and the slideshow's own (the narrated slideshow, rehearsing with a coach, recording a video of
// the slideshow with the camera, the camera while presenting). Routes, signed in:
//   POST /api/slides/sounds?seconds= (a sound's bytes: a narration recorded), GET /api/slides/sounds/:sha
//   POST /api/slides/narration/estimate {texts, how}, POST /api/slides/narration {text, voice, how}
//   POST /api/slides/shows {page, title, deck}, GET/DELETE /api/slides/shows/:id, PUT /api/slides/shows/:id {state},
//   POST /api/slides/shows/:id/do {do, n}
import type { Readable } from 'node:stream';
import type { FastifyReply } from 'fastify';
import { HttpError } from '../auth.ts';
import type { Feature } from '../features/types.ts';
import { getSound, MAX_SOUND, putSound } from '../pages/sounds.ts';
import { sendVideo } from '../pages/videos.ts';
import { estimateNarration, makeNarration } from './narration.ts';
import { commandShow, endShow, moveShow, readShow, startShow } from './remote.ts';

/** A request's bytes, up to `max` (past it, refused: read a little further and let go, so the refusal reaches the page). */
async function bytesOf(body: Readable | undefined, max: number): Promise<Buffer> {
  if (!body || typeof body.pipe !== 'function') throw new HttpError(400, 'Send the sound’s bytes (application/octet-stream)');
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of body as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > max) {
      if (n > max * 1.25) break;
      continue;
    }
    chunks.push(c);
  }
  if (n > max) throw new HttpError(413, `That sound is over ${max / 1024 / 1024} MB`);
  return Buffer.concat(chunks);
}

/** Aborted when the person asking goes before the answer (the editor's dialog closed). */
function goneSignal(reply: FastifyReply): AbortSignal {
  const gone = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || gone.abort());
  return gone.signal;
}

const P = (req: { params: unknown }) => req.params as Record<string, string>;

export const slidesShow: Feature = {
  id: 'slides-show',
  routes(d) {
    const { app, db } = d;
    // A narration recorded in the editor: its bytes as the browser made them, and how long the browser counted it.
    app.post('/api/slides/sounds', async (req) => {
      const data = await bytesOf(req.body as Readable | undefined, MAX_SOUND);
      const seconds = Number((req.query as Record<string, string>).seconds);
      return putSound(db, data, { seconds: Number.isFinite(seconds) ? seconds : undefined });
    });
    app.get('/api/slides/sounds/:sha', async (req, reply) => sendVideo(req, reply, getSound(db, P(req).sha)));
    app.post('/api/slides/narration/estimate', async (req) => estimateNarration(db, req.body));
    app.post('/api/slides/narration', async (req, reply) => makeNarration(db, req.body, goneSignal(reply)));
    app.post('/api/slides/shows', async (req) => startShow(req.body));
    app.get('/api/slides/shows/:id', async (req) => readShow(d, P(req).id));
    app.put('/api/slides/shows/:id', async (req) => moveShow(d, P(req).id, req.body));
    app.post('/api/slides/shows/:id/do', async (req) => commandShow(d, P(req).id, req.body));
    app.delete('/api/slides/shows/:id', async (req) => endShow(d, P(req).id));
  },
};
