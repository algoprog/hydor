// Sounds for slides (a slide's narration: recorded in the editor, made with AI, or a file of an agent's), kept by the
// app as decks' videos are (videos.ts), each once by the hash of its bytes ("naget-audio:<sha>" in a deck); the
// versions of decks that play one are noted with their pictures, and one nothing plays any more goes a day after (one
// just added waits for the deck that will play it). A browser's recording comes as it made it (WebM or Ogg with Opus
// from Chrome and Firefox, MP4 from Safari) and knows no length of its own; where this computer has ffmpeg such a
// sound (and a WAV, which is large) is made an M4A first, which every browser and PowerPoint play. MP3 and M4A are
// kept as they come.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AUDIO, keptSound, type Deck } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import { hasFfmpeg, probe } from '../media/frames.ts';
import { wavSeconds } from '../images/audio.ts';

/** The largest sound kept: ten minutes of a WAV voice, and far more of anything else. */
export const MAX_SOUND = 40 * 1024 * 1024;

const dir = () => path.join(config.dataDir, 'page-sounds');

export function initSounds(db: DB) {
  db.exec('create table if not exists page_sounds (sha text primary key, mime text not null, ext text not null, bytes integer not null, seconds real not null default 0, created_at integer not null)');
}

const MIMES: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', aac: 'audio/aac' };

/** What kind of sound the bytes start as: MP3, M4A (MP4), WAV, Ogg, WebM, FLAC or AAC; null for anything else. */
export function soundType(b: Buffer): { mime: string; ext: string } | null {
  if (b.length < 12) return null;
  const head = b.toString('latin1', 0, 4);
  const is = (ext: string) => ({ mime: MIMES[ext], ext });
  if (head === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return is('wav');
  if (head.startsWith('ID3')) return is('mp3');
  if (b.toString('latin1', 4, 8) === 'ftyp') return is('m4a');
  if (head === 'OggS') return is('ogg');
  if (head === 'fLaC') return is('flac');
  if (b.readUInt32BE(0) === 0x1a45dfa3) return is('webm');
  // AAC's own frames (ADTS: twelve bits of sync, layer 00), then an MPEG audio frame (a layer that is not "reserved").
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return is('aac');
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 1) & 3) !== 0) return is('mp3');
  return null;
}

/** A kept sound by its sha: its file, kind, size and length; null when there is none (or its file is gone). */
export function getSound(db: DB, sha: string): { file: string; mime: string; ext: string; bytes: number; seconds: number } | null {
  if (!/^[a-f0-9]{16,64}$/.test(sha)) return null;
  const r = db.prepare('select ext, bytes, seconds from page_sounds where sha = ?').get(sha) as { ext: string; bytes: number; seconds: number } | undefined;
  if (!r) return null;
  const file = path.join(dir(), `${sha}.${r.ext}`);
  return fs.existsSync(file) ? { file, mime: MIMES[r.ext] ?? 'audio/mpeg', ext: r.ext, bytes: r.bytes, seconds: r.seconds } : null;
}

/** A kept sound named as a deck names it ("naget-audio:<sha>"), or null. */
export const soundOf = (db: DB, src: string) => (src.startsWith(AUDIO) ? getSound(db, src.slice(AUDIO.length)) : null);

/** A kept sound's bytes for a file it goes into whole (PowerPoint's), with its kind; null when it is not kept. */
export function soundFileFor(db: DB, src: string): { data: Buffer; ext: string; mime: string; seconds: number } | null {
  const s = soundOf(db, src);
  return s ? { data: fs.readFileSync(s.file), ext: s.ext, mime: s.mime, seconds: s.seconds } : null;
}

/** A kept sound as a data: address, to put inside a page, when it is no larger than `max`; null otherwise. */
export function soundDataUrl(db: DB, src: string, max = 8 * 1024 * 1024): string | null {
  const s = soundOf(db, src);
  return s && s.bytes <= max ? `data:${s.mime};base64,${fs.readFileSync(s.file).toString('base64')}` : null;
}

const FFMPEG = process.env.HYDOR_FFMPEG || 'ffmpeg';

/** The sound made an M4A (AAC, a voice's quality) by ffmpeg, or null when it could not be. */
async function toM4a(data: Buffer, ext: string): Promise<Buffer | null> {
  if (!(await hasFfmpeg())) return null;
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-sound-'));
  try {
    const src = path.join(tmp, `in.${ext}`);
    const out = path.join(tmp, 'out.m4a');
    await fs.promises.writeFile(src, data);
    await new Promise<void>((resolve, reject) =>
      execFile(FFMPEG, ['-v', 'error', '-y', '-i', src, '-vn', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out], { timeout: 120_000, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } }, (err) => (err ? reject(err) : resolve())),
    );
    const made = await fs.promises.readFile(out);
    return made.length > 100 ? made : null;
  } catch {
    return null;
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}

/** How long a kept file plays, in seconds: ffprobe's, a WAV's own header's; 0 when neither can say. */
async function lengthOf(file: string, data: Buffer): Promise<number> {
  const p = await probe(file).catch(() => null);
  const s = p?.duration ?? wavSeconds(data) ?? 0;
  return Number.isFinite(s) && s > 0 ? Math.round(s * 100) / 100 : 0;
}

/**
 * A sound kept by its hash (made an M4A first where it is a recording or a WAV and ffmpeg is here): its source, its
 * length (ffprobe's, else `seconds` as the browser that recorded it counted), its size. Kept already, it counts as just
 * added again.
 */
export async function putSound(db: DB, input: Buffer, o: { seconds?: number } = {}): Promise<{ src: string; seconds: number; bytes: number; mime: string }> {
  if (input.length > MAX_SOUND) throw new HttpError(413, `That sound is over ${MAX_SOUND / 1024 / 1024} MB`);
  const type = soundType(input);
  if (!type) throw new HttpError(415, 'That is not a sound this app keeps: an MP3, M4A, WAV, Ogg, WebM or FLAC file');
  let data = input;
  let kind = type;
  if (['webm', 'ogg', 'wav', 'flac', 'aac'].includes(type.ext)) {
    const m4a = await toM4a(input, type.ext);
    if (m4a) {
      data = m4a;
      kind = { mime: MIMES.m4a, ext: 'm4a' };
    }
  }
  const sha = crypto.createHash('sha256').update(data).digest('hex').slice(0, 40);
  await fs.promises.mkdir(dir(), { recursive: true });
  const file = path.join(dir(), `${sha}.${kind.ext}`);
  if (!fs.existsSync(file)) await fs.promises.writeFile(file, data);
  const had = getSound(db, sha);
  const counted = typeof o.seconds === 'number' && Number.isFinite(o.seconds) && o.seconds > 0 ? Math.min(3600, Math.round(o.seconds * 100) / 100) : 0;
  const seconds = had?.seconds || (await lengthOf(file, data)) || counted;
  db.prepare('insert into page_sounds (sha, mime, ext, bytes, seconds, created_at) values (?, ?, ?, ?, ?, ?) on conflict(sha) do update set created_at = excluded.created_at, seconds = excluded.seconds').run(
    sha,
    kind.mime,
    kind.ext,
    data.length,
    seconds,
    Date.now(),
  );
  return { src: AUDIO + sha, seconds, bytes: data.length, mime: kind.mime };
}

/** A path an agent gave: from its session's folder, from home (~), or absolute. */
const fromSession = (cwd: string | undefined, p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : path.resolve(cwd || config.defaultCwd, p));

/** A sound file of an agent's session (one generate_audio made, say), kept: its source and length. */
export async function keepSoundFile(db: DB, p: string, cwd: string): Promise<{ src: string; seconds: number }> {
  const file = fromSession(cwd, p);
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new Error('no such file');
  if (st.size > MAX_SOUND) throw new Error(`it is over ${MAX_SOUND / 1024 / 1024} MB`);
  const kept = await putSound(db, await fs.promises.readFile(file)).catch((e: Error) => {
    throw new Error(e.message.replace(/^That is not/, 'it is not'));
  });
  return { src: kept.src, seconds: kept.seconds };
}

/** Sounds no version of a deck plays, a day after they were added, go. */
export function sweepSounds(db: DB) {
  const old = Date.now() - 86_400_000;
  const gone = db.prepare('select sha, ext from page_sounds where created_at < ? and not exists (select 1 from page_asset_refs r where r.sha = page_sounds.sha)').all(old) as { sha: string; ext: string }[];
  const del = db.prepare('delete from page_sounds where sha = ?');
  for (const s of gone) {
    fs.rmSync(path.join(dir(), `${s.sha}.${s.ext}`), { force: true });
    del.run(s.sha);
  }
}

const short = (s: string) => (s.length > 120 ? `${s.slice(0, 120)}…` : s);

/**
 * A deck's narrations that are sound files of an agent's session, kept (their length measured, else as the agent
 * said); one that cannot be kept is left out, and `notes` says why, for the agent.
 */
export async function keepNarrations(db: DB, deck: Deck, cwd: string, notes: string[]): Promise<Deck> {
  const done = new Map<string, { src: string; seconds: number } | null>();
  for (const s of deck.slides) {
    const src = s.narration?.src;
    if (!src || keptSound(src) || done.has(src)) continue;
    const got = await keepSoundFile(db, src, cwd).catch((e: Error) => {
      notes.push(`The narration "${short(src)}" was left out: ${e.message} (a narration is a sound file of this session: an MP3, M4A, WAV, Ogg, WebM or FLAC of up to ${MAX_SOUND / 1024 / 1024} MB).`);
      return null;
    });
    done.set(src, got);
  }
  if (!done.size) return deck;
  return {
    ...deck,
    slides: deck.slides.map((s) => {
      if (!s.narration || keptSound(s.narration.src)) return s;
      const got = done.get(s.narration.src);
      const { narration, ...rest } = s;
      return got ? { ...rest, narration: { ...narration, src: got.src, seconds: got.seconds || narration.seconds } } : rest;
    }),
  };
}
