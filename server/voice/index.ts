// Voice: speaking to the message box, and replies read aloud. Browsers that recognize speech do it
// themselves; for the others (or to keep your voice on your machine) the server can: with whisper.cpp,
// downloaded only when turned on in Settings → Voice, or with an OpenAI-compatible service. Reading
// aloud happens in the browser.
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { VoicePatch, WhisperSize } from '../../shared/voice.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { Feature } from '../features/types.ts';
import { handsFree } from './handsfree.ts';
import { MAX_AUDIO, VoiceService } from './service.ts';

let svc: VoiceService | null = null;
/** Speech recognition on the server, once the routes are up (the sound editor's words and the video editor's captions use it); null before. */
export const voiceService = (): VoiceService | null => svc;
const service = () => {
  if (!svc) throw new HttpError(503, 'The app is still starting');
  return svc;
};

/** The request's body (sent as application/octet-stream), up to `max` bytes. */
async function readBody(body: unknown, max: number): Promise<Buffer> {
  if (!body || typeof (body as Readable).on !== 'function') throw new HttpError(415, 'Send the recording as application/octet-stream');
  const parts: Buffer[] = [];
  let n = 0;
  for await (const c of body as Readable) {
    n += (c as Buffer).length;
    if (n > max) throw new HttpError(413, 'The recording is too long for one go: keep it under ten minutes or so.');
    parts.push(c as Buffer);
  }
  return Buffer.concat(parts);
}

export const voice: Feature = {
  id: 'voice',
  routes(d) {
    svc = new VoiceService({ dir: path.join(config.dataDir, 'voice'), onChange: (state) => d.broadcast({ t: 'feature', id: 'voice', data: state }) });
    d.app.get('/api/voice', async () => service().state());
    d.app.put('/api/voice', async (req) => service().configure((req.body ?? {}) as VoicePatch));
    d.app.post('/api/voice/cancel', async () => service().cancel());
    d.app.post('/api/voice/remove', async (req) => service().remove((req.body ?? {}) as { size?: WhisperSize; english?: boolean; all?: boolean }));
    d.app.post('/api/voice/test', async () => service().test());
    // Hands-free: what the user said (as text), done, and what to say back.
    d.app.post('/api/voice/command', async (req) => {
      const b = (req.body ?? {}) as { text?: unknown; focus?: unknown };
      const text = String(b.text ?? '').trim().slice(0, 4000);
      if (!text) throw new HttpError(400, 'Nothing was heard');
      return handsFree(d, text, typeof b.focus === 'string' && b.focus ? b.focus : undefined);
    });
    // The recording as the body; ?lang= the language spoken, as the browser names it ("de-DE").
    d.app.post('/api/voice/transcribe', async (req) => {
      const audio = await readBody(req.body, MAX_AUDIO);
      return service().transcribe(audio, String((req.query as { lang?: string }).lang ?? ''));
    });
  },
  start() {
    void svc?.init().catch((e) => console.error(`[voice] ${(e as Error).message}`));
  },
};
