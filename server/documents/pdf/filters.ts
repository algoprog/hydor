// A stream's bytes decoded through its filters: Flate (with PNG and TIFF predictors), LZW, ASCII85, ASCIIHex and
// RunLength. Picture codecs (DCT, JPX, JBIG2, CCITT) are left encoded: nothing here draws pictures. Flate that is cut
// short or damaged gives what it can; every decoder stops at a cap, so a small stream cannot unpack into gigabytes.
import zlib from 'node:zlib';
import { Dict, isDict, type Obj, Stream } from './objects.ts';

/** Most a stream may decode to. */
export const MAX_DECODED = 256 * 1024 * 1024;

const IMAGE_CODECS = new Set(['DCTDecode', 'DCT', 'JPXDecode', 'JBIG2Decode', 'CCITTFaxDecode', 'CCF']);

/** A stream's filters and their parameters, in order. */
export function filtersOf(d: Dict, resolve: (o: Obj) => Obj = (o) => o): { name: string; parms: Dict | null }[] {
  const f = resolve(d.get('Filter') ?? d.get('F') ?? null);
  const p = resolve(d.get('DecodeParms') ?? d.get('DP') ?? null);
  const names = Array.isArray(f) ? f.map((x) => resolve(x)) : f === null ? [] : [f];
  const parms = Array.isArray(p) ? p.map((x) => resolve(x)) : [p];
  return names.filter((n): n is string => typeof n === 'string').map((name, i) => ({ name, parms: isDict(parms[i]) ? (parms[i] as Dict) : null }));
}

/**
 * The stream's data with its filters undone. A picture codec stops the decoding there: `stoppedAt` names it (the
 * data is then still encoded by it).
 */
export function decodeStream(s: Stream, resolve?: (o: Obj) => Obj, max = MAX_DECODED): { data: Buffer; stoppedAt?: string } {
  let data = s.raw;
  for (const { name, parms } of filtersOf(s.dict, resolve)) {
    if (IMAGE_CODECS.has(name)) return { data, stoppedAt: name };
    data = decodeOne(name, data, parms, max);
  }
  return { data };
}

/** The decoded bytes, or throws for a picture codec. */
export function decoded(s: Stream, resolve?: (o: Obj) => Obj, max = MAX_DECODED): Buffer {
  const r = decodeStream(s, resolve, max);
  if (r.stoppedAt) throw new Error(`A stream encoded with ${r.stoppedAt} cannot be read as data`);
  return r.data;
}

function decodeOne(name: string, data: Buffer, parms: Dict | null, max: number): Buffer {
  switch (name) {
    case 'FlateDecode':
    case 'Fl':
      return predict(inflate(data, max), parms);
    case 'LZWDecode':
    case 'LZW':
      return predict(lzw(data, parms?.get('EarlyChange') !== 0, max), parms);
    case 'ASCII85Decode':
    case 'A85':
      return ascii85(data);
    case 'ASCIIHexDecode':
    case 'AHx':
      return asciiHex(data);
    case 'RunLengthDecode':
    case 'RL':
      return runLength(data, max);
    case 'Crypt':
      // Only the Identity crypt filter is met in practice, and it changes nothing.
      return data;
    default:
      throw new Error(`Unknown stream filter ${name}`);
  }
}

/** Flate, forgiving: a stream cut short or with a bad checksum gives what it held; one without the zlib header too. */
export function inflate(data: Buffer, max = MAX_DECODED): Buffer {
  try {
    return zlib.inflateSync(data, { maxOutputLength: max });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new Error('A stream unpacks to more than this reads');
  }
  for (const f of [zlib.inflateSync, zlib.inflateRawSync]) {
    try {
      return f(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: max });
    } catch {}
  }
  // What inflates before the damage: the longest start of the data that inflates at all.
  let lo = 0;
  let hi = data.length;
  let best = Buffer.alloc(0);
  for (let i = 0; i < 20 && lo < hi; i++) {
    const mid = (lo + hi + 1) >> 1;
    try {
      best = zlib.inflateSync(data.subarray(0, mid), { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: max });
      lo = mid;
    } catch {
      hi = mid - 1;
    }
  }
  return best;
}

/** Undoes a PNG or TIFF predictor (DecodeParms Predictor ≥ 2). */
function predict(data: Buffer, parms: Dict | null): Buffer {
  const pred = Number(parms?.get('Predictor') ?? 1);
  if (!(pred > 1)) return data;
  const colors = Math.max(1, Number(parms?.get('Colors') ?? 1));
  const bpc = Math.max(1, Number(parms?.get('BitsPerComponent') ?? 8));
  const columns = Math.max(1, Number(parms?.get('Columns') ?? 1));
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  if (pred === 2) {
    // TIFF: each byte after the first pixel adds the one a pixel before (8-bit components only, which is what is met).
    if (bpc !== 8) return data;
    const out = Buffer.from(data);
    for (let r = 0; r * rowLen < out.length; r++) {
      const s = r * rowLen;
      for (let i = bpp; i < rowLen && s + i < out.length; i++) out[s + i] = (out[s + i] + out[s + i - bpp]) & 0xff;
    }
    return out;
  }
  // PNG: each row starts with its own filter type byte.
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = Buffer.alloc(rows * rowLen);
  let prev = Buffer.alloc(rowLen);
  for (let r = 0; r < rows; r++) {
    const s = r * (rowLen + 1);
    const type = data[s];
    const row = out.subarray(r * rowLen, (r + 1) * rowLen);
    data.copy(row, 0, s + 1, s + 1 + rowLen);
    unfilterRow(type, row, prev, bpp);
    prev = row;
  }
  return out;
}

/** Undoes one PNG filter on a row in place (shared with the PNG reader). */
export function unfilterRow(type: number, row: Buffer, prev: Buffer, bpp: number) {
  const n = row.length;
  switch (type) {
    case 1:
      for (let i = bpp; i < n; i++) row[i] = (row[i] + row[i - bpp]) & 0xff;
      break;
    case 2:
      for (let i = 0; i < n; i++) row[i] = (row[i] + prev[i]) & 0xff;
      break;
    case 3:
      for (let i = 0; i < n; i++) row[i] = (row[i] + (((i >= bpp ? row[i - bpp] : 0) + prev[i]) >> 1)) & 0xff;
      break;
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? row[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      break;
  }
}

function lzw(data: Buffer, early: boolean, max: number): Buffer {
  const out: Buffer[] = [];
  let outLen = 0;
  let dict: Buffer[] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < 256; i++) dict.push(Buffer.from([i]));
    dict.push(Buffer.alloc(0), Buffer.alloc(0));
  };
  reset();
  let bits = 9;
  let buf = 0;
  let nbuf = 0;
  let prev: Buffer | null = null;
  for (let i = 0; i < data.length; i++) {
    buf = (buf << 8) | data[i];
    nbuf += 8;
    while (nbuf >= bits) {
      const code = (buf >> (nbuf - bits)) & ((1 << bits) - 1);
      nbuf -= bits;
      buf &= (1 << nbuf) - 1;
      if (code === 256) {
        reset();
        bits = 9;
        prev = null;
        continue;
      }
      if (code === 257) return Buffer.concat(out);
      let entry: Buffer;
      if (code < dict.length) entry = dict[code];
      else if (prev) entry = Buffer.concat([prev, prev.subarray(0, 1)]);
      else return Buffer.concat(out);
      out.push(entry);
      outLen += entry.length;
      if (outLen > max) throw new Error('A stream unpacks to more than this reads');
      if (prev) dict.push(Buffer.concat([prev, entry.subarray(0, 1)]));
      prev = entry;
      const next = dict.length + (early ? 1 : 0);
      if (next >= 4096) bits = 12;
      else if (next >= 2048) bits = 12;
      else if (next >= 1024) bits = 11;
      else if (next >= 512) bits = 10;
    }
  }
  return Buffer.concat(out);
}

function ascii85(data: Buffer): Buffer {
  const out: number[] = [];
  let group: number[] = [];
  let i = 0;
  // A leading "<~" is allowed.
  if (data[0] === 0x3c && data[1] === 0x7e) i = 2;
  for (; i < data.length; i++) {
    const c = data[i];
    if (c === 0x7e /* ~ */) break;
    if (c === 0x7a /* z */ && !group.length) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 0x21 || c > 0x75) continue;
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
      group = [];
    }
  }
  if (group.length > 1) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    out.push(...bytes.slice(0, n - 1));
  }
  return Buffer.from(out);
}

function asciiHex(data: Buffer): Buffer {
  const s = data.toString('latin1');
  const end = s.indexOf('>');
  const hex = (end < 0 ? s : s.slice(0, end)).replace(/[^0-9a-fA-F]/g, '');
  return Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex');
}

function runLength(data: Buffer, max: number): Buffer {
  const out: Buffer[] = [];
  let len = 0;
  for (let i = 0; i < data.length;) {
    const n = data[i++];
    if (n === 128) break;
    if (n < 128) {
      out.push(data.subarray(i, i + n + 1));
      len += n + 1;
      i += n + 1;
    } else {
      out.push(Buffer.alloc(257 - n, data[i++]));
      len += 257 - n;
    }
    if (len > max) throw new Error('A stream unpacks to more than this reads');
  }
  return Buffer.concat(out);
}

/** A stream of `data` compressed with Flate (its dictionary's other entries as given). */
export function flateStream(data: Buffer, d: Dict = new Dict()): Stream {
  d.set('Filter', 'FlateDecode');
  d.delete('DecodeParms');
  return new Stream(d, zlib.deflateSync(data, { level: 6 }));
}
