// Sounds the sound editor keeps for itself, each once by the hash of its bytes ("naget-sound:<sha>"): a recording made
// in it, a sound brought from this device, one made with AI, and a video's sound once it is edited (the video editor
// plays it, and makes the video with it). They are kept as they come, in the app's data folder, and one nothing has
// used for 30 days goes (using one, or keeping it again, counts as a use).
//
// keptSoundFile is how the rest of the app finds one: the video editor's plan reads a clip's edited sound with it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { soundType } from '../pages/sounds.ts';

export const KEPT_SOUND = 'naget-sound:';
/** The largest sound kept: an hour of a WAV recording, and far more of anything else. */
export const MAX_KEPT = 700 * 1024 * 1024;
/** How long one nothing uses is kept. */
const KEEP_DAYS = 30;

const EXTS = ['mp3', 'm4a', 'wav', 'ogg', 'webm', 'flac', 'aac', 'mp4', 'mov'];

export const soundsDir = () => path.join(config.dataDir, 'mediaedit', 'sounds');

const SHA = /^[a-f0-9]{40}$/;

/** "naget-sound:<sha>" → its sha, or null. */
export const keptSoundSha = (src: string): string | null => {
  const m = /^naget-sound:([a-f0-9]{40})$/.exec(src.trim());
  return m ? m[1] : null;
};

/**
 * The file of a sound the editor keeps ("naget-sound:<sha>", or its sha), or null when it is not kept (or it went).
 * Finding it counts as a use: it is kept another 30 days.
 */
export function keptSoundFile(src: string): string | null {
  const sha = SHA.test(src) ? src : keptSoundSha(src);
  if (!sha) return null;
  for (const ext of EXTS) {
    const f = path.join(soundsDir(), `${sha}.${ext}`);
    if (fs.existsSync(f)) {
      try {
        const now = new Date();
        fs.utimesSync(f, now, now);
      } catch {}
      return f;
    }
  }
  return null;
}

/** The kind of file a sound is, from its first bytes (a video's sound too: MP4, MOV, WebM). */
function extOf(head: Buffer): string | null {
  const t = soundType(head);
  if (t) return t.ext;
  return null;
}

/**
 * A sound kept from a file of the app's (made by a job, or brought in): moved (or copied) into the store, named by its
 * hash. Its source ("naget-sound:<sha>") and file.
 */
export async function keepSoundFile(file: string, o: { move?: boolean; ext?: string } = {}): Promise<{ src: string; file: string }> {
  const st = await fs.promises.stat(file);
  if (st.size > MAX_KEPT) throw new HttpError(413, `That sound is over ${Math.round(MAX_KEPT / 1024 / 1024)} MB`);
  const fd = await fs.promises.open(file, 'r');
  const head = Buffer.alloc(64);
  try {
    await fd.read(head, 0, 64, 0);
  } finally {
    await fd.close();
  }
  const ext = o.ext ?? extOf(head);
  if (!ext || !EXTS.includes(ext)) throw new HttpError(415, 'That is not a sound this editor takes: an MP3, M4A, WAV, Ogg, Opus, WebM or FLAC file');
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => fs.createReadStream(file).on('data', (b) => hash.update(b)).on('end', resolve).on('error', reject));
  const sha = hash.digest('hex').slice(0, 40);
  await fs.promises.mkdir(soundsDir(), { recursive: true, mode: 0o700 });
  const dest = path.join(soundsDir(), `${sha}.${ext}`);
  if (fs.existsSync(dest)) {
    if (o.move) await fs.promises.rm(file, { force: true });
    keptSoundFile(sha);
  } else if (o.move) {
    try {
      await fs.promises.rename(file, dest);
    } catch {
      await fs.promises.copyFile(file, dest);
      await fs.promises.rm(file, { force: true });
    }
  } else await fs.promises.copyFile(file, dest);
  return { src: KEPT_SOUND + sha, file: dest };
}

/** A sound sent as a request's body (a recording, a file from this device), kept: written to a file as it comes, then kept by its hash. */
export async function keepSoundStream(body: Readable | undefined): Promise<{ src: string; file: string }> {
  if (!body || typeof body.pipe !== 'function') throw new HttpError(400, 'Send the sound’s bytes (application/octet-stream)');
  await fs.promises.mkdir(soundsDir(), { recursive: true, mode: 0o700 });
  const tmp = path.join(soundsDir(), `.in-${crypto.randomBytes(6).toString('hex')}.part`);
  const out = fs.createWriteStream(tmp, { mode: 0o600 });
  let n = 0;
  try {
    for await (const c of body as AsyncIterable<Buffer>) {
      n += c.length;
      if (n > MAX_KEPT) throw new HttpError(413, `That sound is over ${Math.round(MAX_KEPT / 1024 / 1024)} MB`);
      if (!out.write(c)) await new Promise<void>((r) => out.once('drain', () => r()));
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
    if (n < 16) throw new HttpError(400, 'The sound is empty');
    return await keepSoundFile(tmp, { move: true });
  } catch (e) {
    out.destroy();
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

/** Sounds nothing has used for 30 days, and pieces of uploads cut short a day ago, go. */
export function sweepKeptSounds(now = Date.now()) {
  try {
    for (const name of fs.readdirSync(soundsDir())) {
      const f = path.join(soundsDir(), name);
      const st = fs.statSync(f);
      const old = name.endsWith('.part') ? now - 86_400_000 : now - KEEP_DAYS * 86_400_000;
      if (st.mtimeMs < old) fs.rmSync(f, { force: true });
    }
  } catch {}
}
