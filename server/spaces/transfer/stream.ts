// The bundle stream: how a project (or the files of a sync round) travels between two Hydor servers. gzip, level 1, of
//
//   "HYDOR-BUNDLE 1\n"
//   record*  := u32be(header length) header(JSON) [payload]
//     {t:'manifest', size}                               payload: `size` bytes of JSON
//     {t:'dir',  area, path, mode, mtime}
//     {t:'file', area, path, size, mode, mtime, expect?} payload: `size` bytes, 32 bytes of their SHA-256, 1 byte: 0 keep, 1 void
//     {t:'link', area, path, target}                     a relative symbolic link that stays inside its area
//     {t:'end', files, bytes}                            the files kept (not void) and their bytes
//
// `bundleStream` makes one (a producer calls `manifest`, `dir`, `file`, `link`, `end` on its writer; the stream is the
// readable side, so backpressure reaches the files being read); `readBundle` reads one, handing each file's bytes to the
// caller as a stream, and checks every hash, the void marks and the totals; `tapBundle` passes the bytes of one on and
// counts what goes by (the hub's progress, when it only pipes a bundle from one machine to another).
//
// Every header is checked as it is read: a path that is empty, absolute or has a '..' part, an unknown area, a link that
// leads out of its area, a header over 64 KB: the whole bundle fails (BundleError).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PassThrough, Readable, Writable, pipeline } from 'node:stream';
import zlib from 'node:zlib';
import { BUNDLE_VERSION } from '../../../shared/transfer.ts';
import { BundleError, checkArea, checkLinkTarget, relParts } from './safe.ts';

export { BundleError };

const MAGIC = Buffer.from(`HYDOR-BUNDLE ${BUNDLE_VERSION}\n`, 'latin1');
const MAX_HEADER = 64 * 1024;
const MAX_MANIFEST = 256 * 1024 * 1024;
const CHUNK = 256 * 1024;

/** A file or folder's place in the bundle. */
export interface Placed {
  /** Which part of the project: 'folder', 'also/<n>', 'skills', 'wiki', 'knowledge/<base>', 'media', 'assets'. */
  area: string;
  /** Relative, '/' between parts. */
  path: string;
}
export interface DirRecord extends Placed {
  mode: number;
  mtime: number;
}
export interface FileRecord extends Placed {
  size: number;
  mode: number;
  mtime: number;
  /** A sync push: what the target must still look like for the file to replace it, or null when it must not be there. */
  expect?: { size: number; mtime: number } | null;
}
export interface LinkRecord extends Placed {
  target: string;
}

/** What `readBundle` calls back. Each may be async; the reader waits for it. */
export interface BundleHandlers {
  manifest?(manifest: unknown): void | Promise<void>;
  dir?(rec: DirRecord): void | Promise<void>;
  /**
   * A file: its bytes come as a stream the handler must read to its end (or not at all: the reader skips what is left).
   * It may return a function, called once the hash is checked and the void byte is read: `void` true means the sender saw the file
   * change while it was read, so the handler must drop it.
   */
  file?(rec: FileRecord, body: Readable): void | ((verdict: { void: boolean }) => void | Promise<void>) | Promise<void | ((verdict: { void: boolean }) => void | Promise<void>)>;
  link?(rec: LinkRecord): void | Promise<void>;
}

/** What a bundle held, as its end says (and as the reader counted). */
export interface BundleEnd {
  files: number;
  bytes: number;
}

// ---- writing -------------------------------------------------------------------------------------------------

export class BundleWriter {
  /** Files kept so far (not void) and their bytes: what the end record says. */
  files = 0;
  bytes = 0;
  ended = false;

  constructor(private out: Writable) {}

  private write(buf: Buffer): Promise<void> {
    const out = this.out;
    if (out.destroyed) return Promise.reject(new Error('The bundle was closed before it was all written'));
    if (out.write(buf)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const off = () => {
        out.off('drain', ok);
        out.off('close', fail);
        out.off('error', fail);
      };
      const ok = () => (off(), resolve());
      const fail = () => (off(), reject(new Error('The bundle was closed before it was all written')));
      out.once('drain', ok);
      out.once('close', fail);
      out.once('error', fail);
    });
  }

  private head(h: Record<string, unknown>): Buffer {
    const json = Buffer.from(JSON.stringify(h), 'utf8');
    if (json.length > MAX_HEADER) throw new BundleError(`A record's header is over ${MAX_HEADER / 1024} KB: ${String(h.path ?? h.t).slice(0, 80)}`);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(json.length);
    return Buffer.concat([len, json]);
  }

  /** Whether the reader is still there. */
  get open(): boolean {
    return !this.out.destroyed;
  }

  async manifest(manifest: unknown): Promise<void> {
    const body = Buffer.from(JSON.stringify(manifest), 'utf8');
    await this.write(Buffer.concat([this.head({ t: 'manifest', size: body.length }), body]));
  }

  async dir(area: string, p: string, o: { mode: number; mtime: number }): Promise<void> {
    checkArea(area);
    relParts(p);
    await this.write(this.head({ t: 'dir', area, path: p, mode: o.mode & 0o777, mtime: Math.round(o.mtime) }));
  }

  async link(area: string, p: string, target: string): Promise<void> {
    checkArea(area);
    relParts(p);
    checkLinkTarget(p, target);
    await this.write(this.head({ t: 'link', area, path: p, target }));
  }

  /**
   * A file from disk. Its size and time are read before and after; when they moved, or it could not be read to its end, it
   * is sent void (the receiver drops it). 'gone': it was not there (or is not a file) so nothing was sent.
   */
  async file(area: string, p: string, abs: string, o: { expect?: { size: number; mtime: number } | null } = {}): Promise<'sent' | 'void' | 'gone'> {
    checkArea(area);
    relParts(p);
    let fh: fs.promises.FileHandle;
    let st: fs.Stats;
    try {
      st = await fs.promises.lstat(abs);
      if (!st.isFile()) return 'gone';
      fh = await fs.promises.open(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    } catch {
      return 'gone';
    }
    try {
      const size = st.size;
      await this.write(this.head({ t: 'file', area, path: p, size, mode: st.mode & 0o777, mtime: Math.round(st.mtimeMs), ...(o.expect !== undefined ? { expect: o.expect } : {}) }));
      const hash = crypto.createHash('sha256');
      let bad = false;
      for (let at = 0; at < size; ) {
        const want = Math.min(CHUNK, size - at);
        const buf = Buffer.alloc(want);
        let got = 0;
        if (!bad) {
          try {
            got = (await fh.read(buf, 0, want, at)).bytesRead;
          } catch {
            got = 0;
          }
          // Shorter than it was: the rest is zeros, and the file goes void.
          if (got < want) bad = true;
        }
        hash.update(buf);
        await this.write(buf);
        at += want;
      }
      let after: fs.Stats | null = null;
      try {
        after = await fh.stat();
      } catch {}
      const moved = bad || !after || after.size !== st.size || after.mtimeMs !== st.mtimeMs;
      await this.write(Buffer.concat([hash.digest(), Buffer.from([moved ? 1 : 0])]));
      if (moved) return 'void';
      this.files++;
      this.bytes += size;
      return 'sent';
    } finally {
      await fh.close().catch(() => {});
    }
  }

  /** A file from memory (a picture kept in the database, say). */
  async data(area: string, p: string, buf: Buffer, o: { mode?: number; mtime?: number } = {}): Promise<void> {
    checkArea(area);
    relParts(p);
    await this.write(this.head({ t: 'file', area, path: p, size: buf.length, mode: (o.mode ?? 0o644) & 0o777, mtime: Math.round(o.mtime ?? Date.now()) }));
    await this.write(Buffer.from(buf));
    await this.write(Buffer.concat([crypto.createHash('sha256').update(buf).digest(), Buffer.from([0])]));
    this.files++;
    this.bytes += buf.length;
  }

  /** The last record: the files kept and their bytes. */
  async end(): Promise<BundleEnd> {
    if (this.ended) return { files: this.files, bytes: this.bytes };
    this.ended = true;
    await this.write(this.head({ t: 'end', files: this.files, bytes: this.bytes }));
    return { files: this.files, bytes: this.bytes };
  }
}

/**
 * A bundle as a readable stream: `produce` writes its records (the end record is written for it when it returns without one).
 * Destroying the stream (the reader went away) makes the writer's next write throw, which ends `produce`.
 */
export function bundleStream(produce: (w: BundleWriter) => Promise<void>): Readable {
  const gz = zlib.createGzip({ level: 1 });
  const w = new BundleWriter(gz);
  gz.write(MAGIC);
  void (async () => {
    try {
      await produce(w);
      if (!w.ended) await w.end();
      gz.end();
    } catch (e) {
      if (!gz.destroyed) gz.destroy(e as Error);
    }
  })();
  return gz;
}

// ---- reading -------------------------------------------------------------------------------------------------

/** Bytes from an async source, a few at a time, for the reader. */
class ByteReader {
  private it: AsyncIterator<Buffer>;
  private buf: Buffer = Buffer.alloc(0);
  private eof = false;
  constructor(src: AsyncIterable<Buffer>) {
    this.it = src[Symbol.asyncIterator]();
  }
  private async more(): Promise<boolean> {
    if (this.eof) return false;
    let r: IteratorResult<Buffer>;
    try {
      r = await this.it.next();
    } catch (e) {
      // A damaged gzip stream is a broken bundle, whatever zlib calls it.
      if (typeof (e as { code?: unknown }).code === 'string' && (e as { code: string }).code.startsWith('Z_')) throw new BundleError(`The bundle is damaged: ${(e as Error).message}`);
      throw e;
    }
    if (r.done) {
      this.eof = true;
      return false;
    }
    this.buf = this.buf.length ? Buffer.concat([this.buf, r.value]) : r.value;
    return true;
  }
  /** Exactly n bytes; null when the stream ended before the first of them; throws when it ended in the middle. */
  async exact(n: number): Promise<Buffer | null> {
    while (this.buf.length < n) {
      if (!(await this.more())) {
        if (!this.buf.length) return null;
        throw new BundleError('The bundle ended in the middle of a record');
      }
    }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  /** Up to `max` bytes (at least one); null at the end. */
  async chunk(max: number): Promise<Buffer | null> {
    if (!this.buf.length && !(await this.more())) return null;
    const out = this.buf.subarray(0, max);
    this.buf = this.buf.subarray(out.length);
    return out;
  }
}

const isInt = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function placed(h: Record<string, unknown>): Placed {
  const area = checkArea(h.area);
  relParts(h.path);
  return { area, path: h.path as string };
}

/**
 * Reads a bundle: each record is handed to the handlers as it comes (a file's bytes as a stream), every file's hash is
 * checked after its bytes, and the end record must say what was read. Throws a BundleError for anything wrong; the
 * input is destroyed on the way out. Returns what the end record said.
 */
export async function readBundle(src: Readable, h: BundleHandlers, o: { signal?: AbortSignal } = {}): Promise<BundleEnd> {
  const gunzip = zlib.createGunzip();
  pipeline(src, gunzip, () => {});
  const abort = () => src.destroy(new Error('Cancelled'));
  if (o.signal?.aborted) abort();
  o.signal?.addEventListener('abort', abort, { once: true });
  try {
    const r = new ByteReader(gunzip);
    const magic = await r.exact(MAGIC.length);
    if (!magic || !magic.equals(MAGIC)) throw new BundleError('That is not a Hydor bundle (or one of a version this one does not read)');
    let files = 0;
    let bytes = 0;
    for (;;) {
      if (o.signal?.aborted) throw new Error('Cancelled');
      const lenBuf = await r.exact(4);
      if (!lenBuf) throw new BundleError('The bundle ended before its end record');
      const len = lenBuf.readUInt32BE(0);
      if (!len || len > MAX_HEADER) throw new BundleError('A record in the bundle has a header of a size it should not have');
      const raw = await r.exact(len);
      if (!raw) throw new BundleError('The bundle ended in the middle of a record');
      let head: Record<string, unknown>;
      try {
        head = JSON.parse(raw.toString('utf8'));
      } catch {
        throw new BundleError('A record in the bundle has a header that is not readable');
      }
      if (!head || typeof head !== 'object') throw new BundleError('A record in the bundle has a header that is not readable');
      switch (head.t) {
        case 'manifest': {
          if (!isInt(head.size, MAX_MANIFEST)) throw new BundleError('The bundle’s manifest is of a size it should not be');
          const body = head.size ? await r.exact(head.size) : Buffer.alloc(0);
          if (!body) throw new BundleError('The bundle ended in the manifest');
          let manifest: unknown;
          try {
            manifest = JSON.parse(body.toString('utf8'));
          } catch {
            throw new BundleError('The bundle’s manifest is not readable');
          }
          await h.manifest?.(manifest);
          break;
        }
        case 'dir': {
          if (!isNum(head.mtime)) throw new BundleError('A folder in the bundle has no time');
          await h.dir?.({ ...placed(head), mode: isInt(head.mode, 0o777) ? head.mode : 0o755, mtime: head.mtime });
          break;
        }
        case 'link': {
          const at = placed(head);
          await h.link?.({ ...at, target: checkLinkTarget(at.path, head.target) });
          break;
        }
        case 'file': {
          const at = placed(head);
          if (!isInt(head.size) || !isNum(head.mtime)) throw new BundleError(`A file in the bundle has no size or time: ${at.path}`);
          const rec: FileRecord = { ...at, size: head.size, mode: isInt(head.mode, 0o777) ? head.mode : 0o644, mtime: head.mtime };
          if (head.expect !== undefined) rec.expect = head.expect === null ? null : { size: Number((head.expect as { size?: unknown })?.size), mtime: Number((head.expect as { mtime?: unknown })?.mtime) };
          let left = rec.size;
          const hash = crypto.createHash('sha256');
          let inflight: Promise<unknown> = Promise.resolve();
          const pull = (): Promise<Buffer | null> => {
            const p = inflight.then(async () => {
              if (left <= 0) return null;
              const c = await r.chunk(Math.min(left, CHUNK));
              if (!c) throw new BundleError(`The bundle ended in the middle of ${rec.path}`);
              left -= c.length;
              hash.update(c);
              return c;
            });
            inflight = p.catch(() => {});
            return p;
          };
          const body = new Readable({
            read() {
              pull().then(
                (c) => this.push(c),
                (e) => this.destroy(e as Error),
              );
            },
          });
          let after: void | ((v: { void: boolean }) => void | Promise<void>);
          try {
            after = await h.file?.(rec, body);
          } finally {
            // Whatever the handler left unread is read here, so the next record starts where it should.
            body.destroy();
            await inflight;
          }
          while (left > 0) await pull();
          const tail = await r.exact(33);
          if (!tail) throw new BundleError(`The bundle ended after ${rec.path}`);
          if (!hash.digest().equals(tail.subarray(0, 32))) throw new BundleError(`${rec.path} did not arrive intact`);
          if (tail[32] > 1) throw new BundleError(`${rec.path} has a mark the bundle should not have`);
          const dropped = tail[32] === 1;
          if (!dropped) {
            files++;
            bytes += rec.size;
          }
          await after?.({ void: dropped });
          break;
        }
        case 'end': {
          if (!isInt(head.files) || !isInt(head.bytes)) throw new BundleError('The bundle’s end record is not readable');
          if (head.files !== files || head.bytes !== bytes) throw new BundleError(`The bundle says it holds ${head.files} files, ${head.bytes} bytes, but ${files} files, ${bytes} bytes arrived`);
          if (await r.chunk(1)) throw new BundleError('There is more after the end of the bundle');
          return { files, bytes };
        }
        default:
          throw new BundleError(`A record in the bundle is of a kind this version does not know: ${String(head.t).slice(0, 20)}`);
      }
    }
  } finally {
    o.signal?.removeEventListener('abort', abort);
    // What was read to its end is left alone: it may be a request whose answer is still to be sent.
    if (!src.readableEnded) src.destroy();
    gunzip.destroy();
  }
}

// ---- progress -----------------------------------------------------------------------------------------------

/**
 * Passes a bundle on as it is (the same bytes) and counts what goes by: `onProgress` hears the files and bytes carried so
 * far, at most every 200 ms and once at the end. What it decodes is a copy; if that fails, the bytes still go on (the
 * receiver says what is wrong).
 */
export function tapBundle(raw: Readable, onProgress: (p: { files: number; bytes: number }) => void): Readable {
  const out = new PassThrough();
  const copy = new PassThrough();
  copy.on('error', () => {});
  let copyDead = false;
  const seen = { files: 0, bytes: 0 };
  let lastAt = 0;
  const tell = (force = false) => {
    const now = Date.now();
    if (!force && now - lastAt < 200) return;
    lastAt = now;
    onProgress({ files: seen.files, bytes: seen.bytes });
  };
  const decoded = readBundle(copy, {
    async file(_rec, body) {
      let n = 0;
      for await (const c of body) {
        n += (c as Buffer).length;
        seen.bytes += (c as Buffer).length;
        tell();
      }
      return (v) => {
        if (v.void) seen.bytes -= n;
        else seen.files++;
        tell();
      };
    },
  })
    .catch(() => {
      copyDead = true;
      copy.destroy();
    })
    .finally(() => tell(true));
  raw.on('data', (c: Buffer) => {
    const a = out.write(c);
    const b = copyDead ? true : copy.write(c);
    if (a && b) return;
    raw.pause();
    const waitFor = (s: PassThrough) =>
      new Promise<void>((res) => {
        const done = () => {
          s.off('drain', done);
          s.off('close', done);
          res();
        };
        s.once('drain', done);
        s.once('close', done);
      });
    void Promise.all([a ? null : waitFor(out), b ? null : waitFor(copy)]).then(() => raw.resume());
  });
  // The bytes end after the count has: the final progress is told before the pipe's end.
  raw.on('end', () => {
    copy.end();
    void decoded.then(() => out.end());
  });
  raw.on('error', (e) => {
    out.destroy(e);
    copy.destroy();
  });
  raw.on('close', () => {
    if (!raw.readableEnded) {
      out.destroy(new Error('The bundle stream was cut off'));
      copy.destroy();
    }
  });
  out.on('close', () => {
    if (!raw.destroyed) raw.destroy();
  });
  return out;
}
