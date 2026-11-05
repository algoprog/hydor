// A small zip reader for documents that are zip files of XML (Word, Excel, PowerPoint, OpenDocument,
// EPUB): the central directory, stored and deflated entries, zip64 sizes. Entries are inflated with a
// cap on their size, so a zip bomb stops at the cap. Node built-ins only (Custom's process bundles it).
import zlib from 'node:zlib';

interface Entry {
  name: string;
  method: number;
  flags: number;
  csize: number;
  usize: number;
  offset: number;
  /** Its CRC-32 and DOS time and date, as the central directory has them (to copy it into another zip as it is). */
  crc: number;
  dosTime: number;
  dosDate: number;
}

/** Most a single entry may inflate to. */
export const MAX_ENTRY = 48 * 1024 * 1024;

export class Zip {
  private entries = new Map<string, Entry>();
  /** Lower-cased names, for documents whose parts are named in another case than their links say. */
  private folded = new Map<string, string>();
  /** Bytes inflated so far, against `budget`. */
  private used = 0;

  constructor(
    private buf: Buffer,
    private budget = 400 * 1024 * 1024,
  ) {
    const eocd = this.findEnd();
    if (eocd < 0) throw new Error('Not a zip file');
    let count = buf.readUInt16LE(eocd + 10);
    let cdOffset = buf.readUInt32LE(eocd + 16);
    // Zip64: the real numbers are in the zip64 end record, which a locator just before points at.
    if ((cdOffset === 0xffffffff || count === 0xffff) && eocd >= 20 && buf.readUInt32LE(eocd - 20) === 0x07064b50) {
      const z = Number(buf.readBigUInt64LE(eocd - 12));
      if (z + 56 <= buf.length && buf.readUInt32LE(z) === 0x06064b50) {
        count = Number(buf.readBigUInt64LE(z + 32));
        cdOffset = Number(buf.readBigUInt64LE(z + 48));
      }
    }
    let p = cdOffset;
    for (let i = 0; i < count && p + 46 <= buf.length; i++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const flags = buf.readUInt16LE(p + 8);
      const method = buf.readUInt16LE(p + 10);
      let csize = buf.readUInt32LE(p + 20);
      let usize = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      let offset = buf.readUInt32LE(p + 42);
      const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
      // Zip64 sizes and offset, in that order, for those that did not fit.
      let x = p + 46 + nameLen;
      const xEnd = x + extraLen;
      while (x + 4 <= xEnd) {
        const id = buf.readUInt16LE(x);
        const size = buf.readUInt16LE(x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (usize === 0xffffffff && q + 8 <= x + 4 + size) (usize = Number(buf.readBigUInt64LE(q))), (q += 8);
          if (csize === 0xffffffff && q + 8 <= x + 4 + size) (csize = Number(buf.readBigUInt64LE(q))), (q += 8);
          if (offset === 0xffffffff && q + 8 <= x + 4 + size) offset = Number(buf.readBigUInt64LE(q));
        }
        x += 4 + size;
      }
      if (!name.endsWith('/')) {
        const e = { name, method, flags, csize, usize, offset, crc: buf.readUInt32LE(p + 16), dosTime: buf.readUInt16LE(p + 12), dosDate: buf.readUInt16LE(p + 14) };
        this.entries.set(name, e);
        this.folded.set(name.toLowerCase(), name);
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  private findEnd(): number {
    const b = this.buf;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (b.readUInt32LE(i) === 0x06054b50) return i;
    return -1;
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  /** The entry's real name: as given, or the same name in another case. */
  find(name: string): string | null {
    const n = name.replace(/^\/+/, '');
    return this.entries.has(n) ? n : (this.folded.get(n.toLowerCase()) ?? null);
  }

  has(name: string): boolean {
    return this.find(name) !== null;
  }

  /** Entries cut short because they unpack to more than they may: only their beginning was read. */
  cut = new Set<string>();

  /**
   * An entry's bytes, or null when there is none (or it is encrypted, or packed in a way this cannot
   * read). One that unpacks to more than `max` gives its first `max` bytes (and joins `cut`).
   */
  read(name: string, max = MAX_ENTRY): Buffer | null {
    const real = this.find(name);
    const e = real ? this.entries.get(real) : undefined;
    if (!e || e.flags & 1) return null;
    const b = this.buf;
    if (e.offset + 30 > b.length || b.readUInt32LE(e.offset) !== 0x04034b50) return null;
    const start = e.offset + 30 + b.readUInt16LE(e.offset + 26) + b.readUInt16LE(e.offset + 28);
    const data = b.subarray(start, start + e.csize);
    const limit = Math.min(max, this.budget - this.used);
    if (limit <= 0) throw new Error('The document unpacks to more than this reader takes');
    let out: Buffer;
    if (e.method === 0) {
      out = data.subarray(0, limit);
      if (data.length > limit) this.cut.add(e.name);
    } else if (e.method === 8) {
      try {
        out = zlib.inflateRawSync(data, { maxOutputLength: limit });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ERR_BUFFER_TOO_LARGE') return null;
        out = head(data, limit);
        this.cut.add(e.name);
      }
    } else return null;
    this.used += out.length;
    return out;
  }

  /**
   * An entry as it is packed (its compressed bytes, method, CRC, sizes and time), to copy into another zip unchanged
   * (a signed copy of a Word file: every part but those changed stays byte for byte); null when there is none, or it is
   * encrypted.
   */
  packed(name: string): { name: string; method: number; crc: number; csize: number; usize: number; dosTime: number; dosDate: number; data: Buffer } | null {
    const real = this.find(name);
    const e = real ? this.entries.get(real) : undefined;
    const b = this.buf;
    if (!e || e.flags & 1 || e.offset + 30 > b.length || b.readUInt32LE(e.offset) !== 0x04034b50) return null;
    const start = e.offset + 30 + b.readUInt16LE(e.offset + 26) + b.readUInt16LE(e.offset + 28);
    if (start + e.csize > b.length) return null;
    return { name: e.name, method: e.method, crc: e.crc, csize: e.csize, usize: e.usize, dosTime: e.dosTime, dosDate: e.dosDate, data: b.subarray(start, start + e.csize) };
  }

  text(name: string, max = MAX_ENTRY): string | null {
    const b = this.read(name, max);
    if (!b) return null;
    // UTF-16 parts (rare, older generators) start with a byte order mark.
    if (b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
    return b.toString('utf8').replace(/^﻿/, '');
  }
}

/**
 * The first `limit` bytes a deflated stream unpacks to: inflate a growing piece of it (flushing what a
 * piece gives) until that is enough.
 */
function head(data: Buffer, limit: number): Buffer {
  let k = Math.min(data.length, Math.max(64 * 1024, Math.floor(limit / 8)));
  let best = Buffer.alloc(0);
  for (let i = 0; i < 24; i++) {
    try {
      const out = zlib.inflateRawSync(data.subarray(0, k), { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: limit });
      best = out;
      if (out.length >= limit / 2 || k >= data.length) break;
      k = Math.min(data.length, k * 2);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ERR_BUFFER_TOO_LARGE') break;
      k = Math.floor(k * 0.6);
      if (k < 1024) break;
    }
  }
  return best.subarray(0, limit);
}

/** A part's path from a link in another part: relative to that part's folder, or from the root. */
export function resolvePart(from: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  let t = target.split('#')[0];
  try {
    t = decodeURIComponent(t);
  } catch {}
  const parts = t.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const seg of t.replace(/^\/+/, '').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
