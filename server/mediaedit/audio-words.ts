// The words of a sound for the sound editor: what is said and when (speech recognition on this computer, whisper.cpp,
// as Settings → Voice sets it up), so the editor shows them over the waveform, deletes words by deleting their time, and
// takes out filler words ("um", "uh"). One sound is read once: its words are kept by its file (path, size and time)
// in the app's data folder, and asked again they come at once. Reading takes from seconds to minutes (about a tenth of
// the sound's length with the base model): the editor asks, then asks again for how far it is.
//   POST /api/mediaedit/audio/words { src }   starts reading it (or gives the words read already) → SoundWords
//   GET  /api/mediaedit/audio/words?src=      how far it is → SoundWords
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SoundWord } from '../../shared/mediaedit-audio.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { Deps } from '../features/types.ts';
import { voiceService } from '../voice/index.ts';
import { soundOf } from './audio.ts';

export interface SoundWords {
  status: 'none' | 'running' | 'done' | 'failed';
  progress?: number;
  words?: SoundWord[];
  error?: string;
}

const dir = () => path.join(config.dataDir, 'mediaedit', 'words');
const running = new Map<string, SoundWords>();

async function keyOf(file: string): Promise<string> {
  const st = await fs.promises.stat(file);
  return crypto.createHash('sha256').update(`${file}\0${st.size}\0${st.mtimeMs}`).digest('hex').slice(0, 32);
}

function readKept(key: string): SoundWord[] | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir(), `${key}.json`), 'utf8'));
    return Array.isArray(j.words) ? j.words : null;
  } catch {
    return null;
  }
}

/** How far reading a file's words is: read already, being read, or not yet (`start`: begin reading it). */
export async function wordsOf(file: string, o: { start?: boolean } = {}): Promise<SoundWords> {
  const key = await keyOf(file);
  const kept = readKept(key);
  if (kept) return { status: 'done', words: kept };
  const now = running.get(key);
  if (now && (now.status === 'running' || !o.start)) return now;
  if (!o.start) return { status: 'none' };
  const svc = voiceService();
  if (!svc) throw new HttpError(503, 'The app is still starting');
  const state: SoundWords = { status: 'running', progress: 0 };
  running.set(key, state);
  void svc
    .words(file, { onProgress: (f) => void (state.progress = Math.max(state.progress ?? 0, Math.min(0.99, f))) })
    .then(async ({ words }) => {
      const list: SoundWord[] = words.map((w) => ({ w: w.w, a: Math.round(w.a * 1000) / 1000, b: Math.round(w.b * 1000) / 1000 }));
      await fs.promises.mkdir(dir(), { recursive: true, mode: 0o700 });
      await fs.promises.writeFile(path.join(dir(), `${key}.json`), JSON.stringify({ file, words: list }));
      Object.assign(state, { status: 'done', words: list, progress: 1 });
    })
    .catch((e: Error) => Object.assign(state, { status: 'failed', error: e.message }))
    .finally(() => setTimeout(() => running.get(key) === state && running.delete(key), 600_000).unref?.());
  return state;
}

/** Waits for a file's words at most `ms`: them, or null (not read in time, or not readable here). */
export async function waitForWords(file: string, ms: number, signal?: AbortSignal): Promise<SoundWord[] | { error: string }> {
  const until = Date.now() + ms;
  let s = await wordsOf(file, { start: true });
  while (s.status === 'running' && Date.now() < until && !signal?.aborted) {
    await new Promise((r) => setTimeout(r, 1000));
    s = await wordsOf(file);
  }
  return s.status === 'done' ? (s.words ?? []) : { error: s.error ?? (s.status === 'running' ? 'The words are still being read: try again in a minute' : 'The words could not be read') };
}

export function soundWordsRoutes(d: Deps) {
  d.app.post('/api/mediaedit/audio/words', async (req): Promise<SoundWords> => {
    const b = (req.body ?? {}) as { src?: unknown };
    const s = await soundOf(d.db, b.src);
    return wordsOf(s.file, { start: true });
  });
  d.app.get('/api/mediaedit/audio/words', async (req): Promise<SoundWords> => {
    const s = await soundOf(d.db, (req.query as Record<string, string>).src);
    return wordsOf(s.file);
  });
}
