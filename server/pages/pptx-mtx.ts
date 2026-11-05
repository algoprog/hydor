// MicroType Express, as PowerPoint squeezes the fonts it keeps inside a file (Embedded OpenType's flag 0x4), written
// from the W3C member submission alone ("MicroType Express (MTX) Font Format", 2008). A TrueType font becomes its
// Compact Table Format first: each glyph's points as steps from the one before in two to five bytes, loca left out
// (it follows from the glyphs), cvt as differences; and three parts: the tables, the values glyph programs push first
// (none here: every instruction stays in the third part, so a glyph's program comes back byte for byte), and the
// instructions. Each part is then compressed by LZCOMP: copies of what came before and literal bytes, written with
// three adaptive Huffman trees that the reader grows the same way as it reads. fontOfMtx turns such a font back into
// TrueType, and sameFont says whether two fonts draw and measure alike: every face is checked that way before it goes
// into a file compressed (pptx-fonts.ts), and goes in whole and plain when it does not come back.

// ---- bits ------------------------------------------------------------------------------------------------------

/** Bits written high first, the last byte filled with zeros. */
class BitWriter {
  private buf = new Uint8Array(4096);
  private n = 0;
  private acc = 0;
  private count = 0;
  bit(b: number) {
    this.acc = (this.acc << 1) | (b & 1);
    if (++this.count === 8) {
      if (this.n === this.buf.length) {
        const more = new Uint8Array(this.buf.length * 2);
        more.set(this.buf);
        this.buf = more;
      }
      this.buf[this.n++] = this.acc;
      this.acc = 0;
      this.count = 0;
    }
  }
  value(v: number, bits: number) {
    for (let i = bits - 1; i >= 0; i--) this.bit((v >>> i) & 1);
  }
  done(): Buffer {
    if (this.count) this.value(0, 8 - this.count);
    return Buffer.from(this.buf.subarray(0, this.n));
  }
}

class BitReader {
  private buf: Uint8Array;
  private i = 0;
  private acc = 0;
  private count = 0;
  constructor(buf: Uint8Array) {
    this.buf = buf;
  }
  bit(): number {
    if (!this.count) {
      if (this.i >= this.buf.length) throw new Error('MTX: the compressed data ends early');
      this.acc = this.buf[this.i++];
      this.count = 8;
    }
    return (this.acc >> --this.count) & 1;
  }
  value(bits: number): number {
    let v = 0;
    for (let i = 0; i < bits; i++) v = v * 2 + this.bit();
    return v;
  }
}

// ---- adaptive Huffman trees --------------------------------------------------------------------------------------

/**
 * One of LZCOMP's adaptive Huffman trees over the symbols 0…range-1: nodes 1 (the root) to 2·range-1, the symbols'
 * leaves from range on, every node heavier than or as heavy as the ones after it. Each symbol said makes its leaf and
 * those above it heavier, swapping a node with the first one as heavy as it (but the root) on the way, so that both
 * ends keep the same tree. It starts as the submission's does: the leaves even, then the symbols of the copies'
 * alphabet (256, 257, and the one-byte copies from 2 and 4 back) or every symbol of a smaller one, made heavier.
 */
class Huff {
  private up: Int32Array;
  private left: Int32Array;
  private right: Int32Array;
  private sym: Int32Array;
  private weight: Float64Array;
  private leaf: Int32Array;
  constructor(range: number) {
    const n = 2 * range;
    this.up = new Int32Array(n);
    this.left = new Int32Array(n).fill(-1);
    this.right = new Int32Array(n).fill(-1);
    this.sym = new Int32Array(n).fill(-1);
    this.weight = new Float64Array(n);
    this.leaf = new Int32Array(range);
    for (let i = 2; i < n; i++) {
      this.up[i] = i >> 1;
      this.weight[i] = 1;
    }
    for (let i = 1; i < range; i++) {
      this.left[i] = 2 * i;
      this.right[i] = 2 * i + 1;
    }
    for (let s = 0; s < range; s++) {
      this.sym[range + s] = s;
      this.leaf[s] = range + s;
    }
    for (let i = range - 1; i >= 1; i--) this.weight[i] = this.weight[2 * i] + this.weight[2 * i + 1];
    if (range > 256 && range < 512) {
      this.heavier(this.leaf[256]);
      this.heavier(this.leaf[257]);
      for (let k = 0; k < 12; k++) this.heavier(this.leaf[range - 3]);
      for (let k = 0; k < 6; k++) this.heavier(this.leaf[range - 2]);
    } else {
      for (let k = 0; k < 2; k++) for (let s = 0; s < range; s++) this.heavier(this.leaf[s]);
    }
  }
  private heavier(a: number) {
    const { weight, up } = this;
    while (a !== 1) {
      const w = weight[a];
      let b = a - 1;
      if (weight[b] === w) {
        while (weight[b] === w) b--;
        b++;
        if (b > 1) {
          this.swap(a, b);
          a = b;
        }
      }
      weight[a] = w + 1;
      a = up[a];
    }
    weight[1]++;
  }
  /** Two nodes trade places in the tree (each keeps the parent of the place it goes to). */
  private swap(a: number, b: number) {
    const { left, right, sym, weight } = this;
    let t = left[a];
    left[a] = left[b];
    left[b] = t;
    t = right[a];
    right[a] = right[b];
    right[b] = t;
    t = sym[a];
    sym[a] = sym[b];
    sym[b] = t;
    t = weight[a];
    weight[a] = weight[b];
    weight[b] = t;
    for (const x of [a, b]) {
      if (sym[x] < 0) {
        this.up[left[x]] = x;
        this.up[right[x]] = x;
      } else this.leaf[sym[x]] = x;
    }
  }
  /** How many bits the symbol takes now. */
  cost(s: number): number {
    let n = 0;
    for (let a = this.leaf[s]; a !== 1; a = this.up[a]) n++;
    return n;
  }
  write(out: BitWriter, s: number) {
    const path: number[] = [];
    const at = this.leaf[s];
    for (let a = at; a !== 1; a = this.up[a]) path.push(this.right[this.up[a]] === a ? 1 : 0);
    for (let i = path.length - 1; i >= 0; i--) out.bit(path[i]);
    this.heavier(at);
  }
  read(input: BitReader): number {
    let a = 1;
    do a = input.bit() ? this.right[a] : this.left[a];
    while (this.sym[a] < 0);
    const s = this.sym[a];
    this.heavier(a);
    return s;
  }
}

// ---- LZCOMP ------------------------------------------------------------------------------------------------------

/** What both ends start with before the data, so that its first bytes may be copies too. */
const PRELOAD = 2 * 32 * 96 + 4 * 256;

function preloaded(n: number): Uint8Array {
  const w = new Uint8Array(PRELOAD + n);
  let i = 0;
  for (let k = 0; k < 32; k++)
    for (let j = 0; j < 96; j++) {
      w[i++] = k;
      w[i++] = j;
    }
  for (let j = 0; j < 256; j++) for (let k = 0; k < 4; k++) w[i++] = j;
  return w;
}

/** The bits a number takes (1 for 0). */
const bitsUsed = (x: number) => (x <= 1 ? 1 : 32 - Math.clz32(x));

/** How many 3-bit pieces the farthest copy of data this long takes, and so the copies' alphabet. */
function distRanges(n: number): number {
  let r = 1;
  while (8 ** r < n) r++;
  return r;
}

/** Copies: their length in 2-bit pieces (each saying whether another follows), the first with the distance's piece count. */
function copySymbols(length: number, dist: number): { first: number; more: number[]; dist: number[] } {
  const v = length - (dist >= 512 ? 3 : 2);
  const pieces = (bitsUsed(v) + 1) >> 1;
  const ranges = Math.ceil(bitsUsed(dist - 1) / 3);
  const piece = (c: number) => ((v >> (2 * c)) & 3) | (c > 0 ? 4 : 0);
  const more: number[] = [];
  for (let c = pieces - 2; c >= 0; c--) more.push(piece(c));
  const d: number[] = [];
  for (let k = ranges - 1; k >= 0; k--) d.push(((dist - 1) >> (3 * k)) & 7);
  return { first: 256 + piece(pieces - 1) + (ranges - 1) * 8, more, dist: d };
}

/**
 * Data compressed as LZCOMP writes it: no run-length step (its bit 0), the data's length in 24 bits, then symbols: a
 * byte, a byte as the one 2, 4 or 6 back, or a copy of 2 bytes or more from earlier (3 or more from 512 back), told
 * by its length and its distance from the copy's end. A copy is taken where it costs fewer bits than its bytes would
 * (the trees say what each costs now), and not where one starting a byte later saves more.
 */
export function lzcomp(data: Uint8Array): Buffer {
  const n = data.length;
  if (n >= 1 << 24) throw new Error('MTX: too much data for one part');
  const w = preloaded(n);
  w.set(data, PRELOAD);
  const end = PRELOAD + n;
  const out = new BitWriter();
  out.bit(0);
  const dist = new Huff(8);
  const len = new Huff(8);
  out.value(n, 24);
  const ranges = distRanges(n);
  const distMax = 8 ** ranges;
  const DUP2 = 256 + 8 * ranges;
  const sym = new Huff(DUP2 + 3);

  // Where each pair of bytes was seen, latest first.
  const head = new Int32Array(1 << 16).fill(-1);
  const prev = new Int32Array(end);
  let filed = 0;
  const file = (upto: number) => {
    for (; filed < upto; filed++) {
      const h = (w[filed] << 8) | w[filed + 1];
      prev[filed] = head[h];
      head[h] = filed;
    }
  };
  const CACHE = 32;
  const lit = new Float64Array(CACHE + 1);
  const copyCost = (length: number, d: number) => {
    const c = copySymbols(length, d);
    let bits = sym.cost(c.first);
    for (const m of c.more) bits += len.cost(m);
    for (const x of c.dist) bits += dist.cost(x);
    return bits;
  };
  /** The best copy at i: [length, distance, bits saved]. */
  const best = (i: number): [number, number, number] => {
    file(i - 1);
    const room = end - i;
    if (room < 2) return [0, 0, 0];
    let bestLen = 0;
    let bestDist = 0;
    let bestGain = 0;
    let known = 0;
    let tries = 0;
    for (let p = head[(w[i] << 8) | w[i + 1]]; p >= 0 && tries < 96; p = prev[p], tries++) {
      const off = i - p;
      const max = Math.min(off, room);
      let length = 2;
      while (length < max && w[p + length] === w[i + length]) length++;
      if (length <= bestLen) continue;
      const d = off - length + 1;
      if ((d >= 512 && length < 3) || d > distMax) continue;
      for (; known < Math.min(length, CACHE); known++) lit[known + 1] = lit[known] + sym.cost(w[i + known]);
      const literal = length <= CACHE ? lit[length] : lit[CACHE] + (lit[CACHE] / CACHE) * (length - CACHE);
      const gain = literal - copyCost(length, d);
      if (gain > bestGain) {
        bestGain = gain;
        bestLen = length;
        bestDist = d;
      }
    }
    return [bestLen, bestDist, bestGain];
  };

  let i = PRELOAD;
  // The best copy a byte later, when it was looked for and the byte went as itself.
  let ahead: [number, number, number] | null = null;
  while (i < end) {
    const [length, d, gain]: [number, number, number] = ahead ?? best(i);
    ahead = gain > 0 && i + 1 < end ? best(i + 1) : null;
    if (gain > 0 && !(ahead && ahead[2] > gain)) {
      ahead = null;
      const c = copySymbols(length, d);
      sym.write(out, c.first);
      for (const m of c.more) len.write(out, m);
      for (const x of c.dist) dist.write(out, x);
      i += length;
    } else {
      const b = w[i];
      sym.write(out, b === w[i - 2] ? DUP2 : b === w[i - 4] ? DUP2 + 1 : b === w[i - 6] ? DUP2 + 2 : b);
      i++;
    }
  }
  return out.done();
}

/** LZCOMP's data back, run-length step and all (whose bit the first version goes without). */
export function unlzcomp(data: Uint8Array, runBit = true): Buffer {
  const input = new BitReader(data);
  const runs = runBit ? input.bit() : 0;
  const dist = new Huff(8);
  const len = new Huff(8);
  const n = input.value(24);
  const DUP2 = 256 + 8 * distRanges(n);
  const sym = new Huff(DUP2 + 3);
  const w = preloaded(n);
  const end = PRELOAD + n;
  let i = PRELOAD;
  while (i < end) {
    const s = sym.read(input);
    if (s < 256) w[i++] = s;
    else if (s >= DUP2) {
      w[i] = w[i - 2 * (s - DUP2 + 1)];
      i++;
    } else {
      let bits = s - 256;
      const ranges = (bits >> 3) + 1;
      bits &= 7;
      let v = 0;
      for (;;) {
        v = v * 4 + (bits & 3);
        if (!(bits & 4)) break;
        bits = len.read(input);
      }
      let length = v + 2;
      let d = 0;
      for (let k = 0; k < ranges; k++) d = d * 8 + dist.read(input);
      d += 1;
      if (d >= 512) length++;
      const from = i - d - length + 1;
      if (from < 0 || i + length > end) throw new Error('MTX: a copy reaches outside the data');
      w.copyWithin(i, from, from + length);
      i += length;
    }
  }
  const got = Buffer.from(w.subarray(PRELOAD));
  return runs ? unrun(got) : got;
}

/** The run-length step undone: an escape byte first, then the escape with a count and a byte for a run of it (0: the escape itself). */
function unrun(b: Buffer): Buffer {
  if (!b.length) return b;
  const esc = b[0];
  const out: number[] = [];
  for (let k = 1; k < b.length;) {
    const x = b[k++];
    if (x !== esc) out.push(x);
    else {
      if (k >= b.length) throw new Error('MTX: a run ends early');
      const count = b[k++];
      if (!count) out.push(esc);
      else {
        if (k >= b.length) throw new Error('MTX: a run ends early');
        const v = b[k++];
        for (let j = 0; j < count; j++) out.push(v);
      }
    }
  }
  return Buffer.from(out);
}

// ---- reading and writing font data -----------------------------------------------------------------------------

class Out {
  private b = Buffer.alloc(1 << 16);
  n = 0;
  private room(k: number) {
    if (this.n + k <= this.b.length) return;
    const more = Buffer.alloc(Math.max(this.b.length * 2, this.n + k));
    this.b.copy(more, 0, 0, this.n);
    this.b = more;
  }
  u8(v: number) {
    this.room(1);
    this.b[this.n++] = v & 255;
  }
  u16(v: number) {
    this.room(2);
    this.b.writeUInt16BE(v & 0xffff, this.n);
    this.n += 2;
  }
  i16(v: number) {
    if (v < -32768 || v > 32767) throw new Error('MTX: a number does not fit');
    this.room(2);
    this.b.writeInt16BE(v, this.n);
    this.n += 2;
  }
  u32(v: number) {
    this.room(4);
    this.b.writeUInt32BE(v >>> 0, this.n);
    this.n += 4;
  }
  bytes(x: Uint8Array) {
    this.room(x.length);
    this.b.set(x, this.n);
    this.n += x.length;
  }
  /** 255USHORT: 0–252 in a byte, 253–761 in two, the rest in three. */
  u255(v: number) {
    if (v < 0 || v > 0xffff) throw new Error('MTX: a count does not fit');
    if (v < 253) this.u8(v);
    else if (v < 506) (this.u8(255), this.u8(v - 253));
    else if (v < 762) (this.u8(254), this.u8(v - 506));
    else (this.u8(253), this.u16(v));
  }
  pad(to: number) {
    while (this.n % to) this.u8(0);
  }
  done(): Buffer {
    return Buffer.from(this.b.subarray(0, this.n));
  }
}

class In {
  private b: Buffer;
  p: number;
  private end: number;
  constructor(b: Buffer, p = 0) {
    this.b = b;
    this.p = p;
    this.end = b.length;
  }
  private need(k: number) {
    if (this.p + k > this.end) throw new Error('MTX: the font data ends early');
  }
  u8(): number {
    this.need(1);
    return this.b[this.p++];
  }
  peek(): number {
    this.need(1);
    return this.b[this.p];
  }
  u16(): number {
    this.need(2);
    const v = this.b.readUInt16BE(this.p);
    this.p += 2;
    return v;
  }
  i16(): number {
    this.need(2);
    const v = this.b.readInt16BE(this.p);
    this.p += 2;
    return v;
  }
  bytes(k: number): Buffer {
    this.need(k);
    const s = this.b.subarray(this.p, this.p + k);
    this.p += k;
    return s;
  }
  u255(): number {
    const c = this.u8();
    return c === 253 ? this.u16() : c === 255 ? 253 + this.u8() : c === 254 ? 506 + this.u8() : c;
  }
  /** 255SHORT: a push value (250 flips the sign of the one after; 253 a whole word). */
  s255(): number {
    let c = this.u8();
    if (c === 253) return this.i16();
    let sign = 1;
    if (c === 250) {
      sign = -1;
      c = this.u8();
    }
    return sign * (c === 255 ? 250 + this.u8() : c === 254 ? 500 + this.u8() : c);
  }
}

type Tables = Map<string, Buffer>;

/** A TrueType font's tables by tag; throws for what is none. */
function tablesOf(font: Buffer): Tables {
  if (font.length < 12) throw new Error('MTX: not a font');
  const tag = font.readUInt32BE(0);
  if (tag !== 0x00010000 && tag !== 0x74727565) throw new Error('MTX: not a TrueType font');
  const n = font.readUInt16BE(4);
  if (12 + n * 16 > font.length) throw new Error('MTX: not a font');
  const out: Tables = new Map();
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    const off = font.readUInt32BE(at + 8);
    const len = font.readUInt32BE(at + 12);
    if (off + len > font.length) throw new Error('MTX: a table reaches past the font');
    out.set(font.toString('latin1', at, at + 4), font.subarray(off, off + len));
  }
  return out;
}

function checksum(b: Buffer): number {
  let sum = 0;
  const whole = b.length & ~3;
  for (let i = 0; i < whole; i += 4) sum = (sum + b.readUInt32BE(i)) >>> 0;
  if (whole < b.length) {
    const tail = Buffer.alloc(4);
    b.copy(tail, 0, whole);
    sum = (sum + tail.readUInt32BE(0)) >>> 0;
  }
  return sum;
}

/** A font file of tables (in tag order, as fonts list them), each on four bytes, with its checksums. */
function fontFile(version: number, tables: [string, Buffer][], sums?: Map<string, number>, fixHead = true): Buffer {
  const list = [...tables].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const n = list.length;
  let pow = 1;
  while (pow * 2 <= n) pow *= 2;
  const out = new Out();
  out.u32(version);
  out.u16(n);
  out.u16(pow * 16);
  out.u16(Math.log2(pow));
  out.u16(n * 16 - pow * 16);
  let at = 12 + n * 16;
  const places: number[] = [];
  for (const [, data] of list) {
    places.push(data.length ? at : 0);
    at += (data.length + 3) & ~3;
  }
  list.forEach(([tag, data], i) => {
    out.bytes(Buffer.from(tag, 'latin1'));
    out.u32(sums?.get(tag) ?? checksum(data));
    out.u32(places[i]);
    out.u32(data.length);
  });
  let headAt = -1;
  for (const [tag, data] of list) {
    if (tag === 'head') headAt = out.n;
    out.bytes(data);
    out.pad(4);
  }
  const file = out.done();
  if (fixHead && headAt >= 0 && file.length >= headAt + 12) {
    file.writeUInt32BE(0, headAt + 8);
    file.writeUInt32BE((0xb1b0afba - checksum(file)) >>> 0, headAt + 8);
  }
  return file;
}

// ---- glyphs ------------------------------------------------------------------------------------------------------

interface Simple {
  kind: 'simple';
  box: [number, number, number, number];
  ends: number[];
  code: Buffer;
  x: number[];
  y: number[];
  on: boolean[];
}
interface Composite {
  kind: 'composite';
  box: [number, number, number, number];
  /** The components as the font has them. */
  parts: Buffer;
  /** Its program, when its last component says it has one. */
  code: Buffer | null;
}
type Glyph = Simple | Composite | null;

const MORE_COMPONENTS = 0x20;
const WE_HAVE_INSTRUCTIONS = 0x100;

/** A composite glyph's components from `at`: where they end, and the last one's flags (and whether any says it has instructions). */
function componentsEnd(b: Buffer, at: number, end: number): { at: number; last: number; any: boolean } {
  let flags = 0;
  let any = false;
  do {
    if (at + 4 > end) throw new Error('MTX: a composite glyph ends early');
    flags = b.readUInt16BE(at);
    at += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
    any ||= !!(flags & WE_HAVE_INSTRUCTIONS);
  } while (flags & MORE_COMPONENTS);
  if (at > end) throw new Error('MTX: a composite glyph ends early');
  return { at, last: flags, any };
}

/** A TrueType glyph's outline and program (null: no outline). */
function readGlyph(g: Buffer): Glyph {
  if (g.length < 10) return null;
  const contours = g.readInt16BE(0);
  const box: [number, number, number, number] = [g.readInt16BE(2), g.readInt16BE(4), g.readInt16BE(6), g.readInt16BE(8)];
  if (contours === 0) return null;
  if (contours < 0) {
    const c = componentsEnd(g, 10, g.length);
    if (c.any && !(c.last & WE_HAVE_INSTRUCTIONS)) throw new Error('MTX: a composite glyph’s program is flagged where it cannot be kept');
    let code: Buffer | null = null;
    if (c.last & WE_HAVE_INSTRUCTIONS) {
      if (c.at + 2 > g.length) throw new Error('MTX: a composite glyph ends early');
      const n = g.readUInt16BE(c.at);
      if (c.at + 2 + n > g.length) throw new Error('MTX: a composite glyph ends early');
      code = g.subarray(c.at + 2, c.at + 2 + n);
    }
    return { kind: 'composite', box, parts: g.subarray(10, c.at), code };
  }
  const r = new In(g, 10);
  const ends: number[] = [];
  for (let i = 0; i < contours; i++) {
    const e = r.u16();
    if (ends.length && e < ends[ends.length - 1]) throw new Error('MTX: a glyph’s contours go backwards');
    ends.push(e);
  }
  const points = ends[ends.length - 1] + 1;
  const code = r.bytes(r.u16());
  const flags: number[] = [];
  while (flags.length < points) {
    const f = r.u8();
    flags.push(f);
    if (f & 8) for (let k = r.u8(); k > 0; k--) flags.push(f);
  }
  if (flags.length > points) throw new Error('MTX: a glyph’s flags run over');
  const coords = (short: number, same: number) => {
    const out: number[] = [];
    let v = 0;
    for (const f of flags) {
      if (f & short) v += f & same ? r.u8() : -r.u8();
      else if (!(f & same)) v += r.i16();
      out.push(v);
    }
    return out;
  };
  const x = coords(2, 0x10);
  const y = coords(4, 0x20);
  return { kind: 'simple', box, ends, code, x, y, on: flags.map((f) => !!(f & 1)) };
}

/** A glyph as TrueType has it (padded by the caller). */
function glyphBytes(g: Glyph): Buffer {
  if (!g) return Buffer.alloc(0);
  const out = new Out();
  if (g.kind === 'composite') {
    out.i16(-1);
    for (const v of g.box) out.i16(v);
    out.bytes(g.parts);
    if (g.code) {
      out.u16(g.code.length);
      out.bytes(g.code);
    }
    return out.done();
  }
  out.i16(g.ends.length);
  for (const v of g.box) out.i16(v);
  for (const e of g.ends) out.u16(e);
  out.u16(g.code.length);
  out.bytes(g.code);
  const flags: number[] = [];
  const xs = new Out();
  const ys = new Out();
  let px = 0;
  let py = 0;
  g.x.forEach((x, i) => {
    let f = g.on[i] ? 1 : 0;
    const dx = x - px;
    const dy = g.y[i] - py;
    px = x;
    py = g.y[i];
    if (dx === 0) f |= 0x10;
    else if (Math.abs(dx) < 256) ((f |= dx > 0 ? 0x12 : 0x02), xs.u8(Math.abs(dx)));
    else xs.i16(dx);
    if (dy === 0) f |= 0x20;
    else if (Math.abs(dy) < 256) ((f |= dy > 0 ? 0x24 : 0x04), ys.u8(Math.abs(dy)));
    else ys.i16(dy);
    flags.push(f);
  });
  for (let i = 0; i < flags.length;) {
    let run = 1;
    while (i + run < flags.length && flags[i + run] === flags[i] && run < 256) run++;
    if (run > 1) {
      out.u8(flags[i] | 8);
      out.u8(run - 1);
    } else out.u8(flags[i]);
    i += run;
  }
  out.bytes(xs.done());
  out.bytes(ys.done());
  return out.done();
}

/** The submission's 128 ways of writing a point's step (5.11): bytes in all, bits of x and of y, what they add, and the signs (1: up). */
const TRIPLETS = (() => {
  const t: { bytes: number; xBits: number; yBits: number; dx: number; dy: number; xSign: number; ySign: number }[] = [];
  for (let k = 0; k < 10; k++) t.push({ bytes: 2, xBits: 0, yBits: 8, dx: 0, dy: 256 * (k >> 1), xSign: 0, ySign: k & 1 ? 1 : -1 });
  for (let k = 0; k < 10; k++) t.push({ bytes: 2, xBits: 8, yBits: 0, dx: 256 * (k >> 1), dy: 0, xSign: k & 1 ? 1 : -1, ySign: 0 });
  const signs = (bytes: number, bits: number, dx: number, dy: number) => {
    for (let s = 0; s < 4; s++) t.push({ bytes, xBits: bits, yBits: bits, dx, dy, xSign: s & 1 ? 1 : -1, ySign: s & 2 ? 1 : -1 });
  };
  for (const dx of [1, 17, 33, 49]) for (const dy of [1, 17, 33, 49]) signs(2, 4, dx, dy);
  for (const dx of [1, 257, 513]) for (const dy of [1, 257, 513]) signs(3, 8, dx, dy);
  signs(4, 12, 0, 0);
  signs(5, 16, 0, 0);
  return t;
})();

/** A step as the fewest bytes the triplets allow: its index and the bytes after the flag. */
function triplet(dx: number, dy: number): [number, number[]] {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const sx = dx < 0 ? 0 : 1;
  const sy = dy < 0 ? 0 : 1;
  if (dx === 0 && ay < 1280) return [(ay >> 8) * 2 + sy, [ay & 255]];
  if (dy === 0 && ax < 1280) return [10 + (ax >> 8) * 2 + sx, [ax & 255]];
  const both = sx + sy * 2;
  if (ax >= 1 && ax <= 64 && ay >= 1 && ay <= 64) {
    const i = (ax - 1) >> 4;
    const j = (ay - 1) >> 4;
    return [20 + i * 16 + j * 4 + both, [(((ax - 1 - 16 * i) << 4) | (ay - 1 - 16 * j)) & 255]];
  }
  if (ax >= 1 && ax <= 768 && ay >= 1 && ay <= 768) {
    const i = (ax - 1) >> 8;
    const j = (ay - 1) >> 8;
    return [84 + i * 12 + j * 4 + both, [(ax - 1 - 256 * i) & 255, (ay - 1 - 256 * j) & 255]];
  }
  if (ax < 4096 && ay < 4096) return [120 + both, [ax >> 4, ((ax & 15) << 4) | (ay >> 8), ay & 255]];
  if (ax > 0xffff || ay > 0xffff) throw new Error('MTX: a step too long');
  return [124 + both, [ax >> 8, ax & 255, ay >> 8, ay & 255]];
}

const boxOf = (x: number[], y: number[]): [number, number, number, number] => [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];

// ---- Compact Table Format ------------------------------------------------------------------------------------

function locaOf(t: Tables): number[] {
  const head = t.get('head');
  const maxp = t.get('maxp');
  const loca = t.get('loca');
  if (!head || head.length < 54 || !maxp || maxp.length < 6 || !loca) throw new Error('MTX: a table glyphs need is missing');
  const long = head.readInt16BE(50) === 1;
  const n = maxp.readUInt16BE(4);
  if (loca.length < (n + 1) * (long ? 4 : 2)) throw new Error('MTX: loca is too short');
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(long ? loca.readUInt32BE(4 * i) : loca.readUInt16BE(2 * i) * 2);
  return out;
}

/** cvt as differences from the value before, each in one to three bytes (5.2). */
function cvtOut(cvt: Buffer): Buffer {
  if (cvt.length % 2) throw new Error('MTX: cvt has an odd length');
  const out = new Out();
  out.u16(cvt.length / 2);
  let last = 0;
  for (let i = 0; i < cvt.length; i += 2) {
    const v = cvt.readInt16BE(i);
    const d = ((((v - last) & 0xffff) ^ 0x8000) - 0x8000) | 0;
    last = v;
    const m = Math.abs(d);
    const k = Math.floor(m / 238);
    if (k <= 8 && d !== -32768) {
      if (d < 0) (out.u8(239 + k), out.u8(m - k * 238));
      else {
        if (k > 0) out.u8(248 + k - 1);
        out.u8(m - k * 238);
      }
    } else (out.u8(238), out.i16(d));
  }
  return out.done();
}

function cvtIn(b: Buffer): Buffer {
  const r = new In(b);
  const n = r.u16();
  const out = new Out();
  let last = 0;
  for (let i = 0; i < n; i++) {
    const c = r.u8();
    let d: number;
    if (c < 238) d = c;
    else if (c >= 248) d = r.u8() + (c - 247) * 238;
    else if (c >= 239) d = -(r.u8() + (c - 239) * 238);
    else d = r.i16();
    last = ((((last + d) & 0xffff) ^ 0x8000) - 0x8000) | 0;
    out.i16(last);
  }
  return out.done();
}

/** Tables a font may have that the submission writes in its own way, and which go without (device metrics, kept for old screens). */
const DROPPED = new Set(['hdmx', 'VDMX']);

/** A TrueType font in Compact Table Format: its tables (glyf and cvt rewritten, loca empty), its push data, its instructions. */
export function ctfOf(font: Buffer): { rest: Buffer; push: Buffer; code: Buffer } {
  const t = tablesOf(font);
  const glyf = t.get('glyf');
  if (!glyf) throw new Error('MTX: no TrueType outlines');
  const loca = locaOf(t);
  const g = new Out();
  const code = new Out();
  for (let i = 0; i + 1 < loca.length; i++) {
    if (loca[i + 1] < loca[i] || loca[i + 1] > glyf.length) throw new Error('MTX: loca points outside glyf');
    const glyph = readGlyph(glyf.subarray(loca[i], loca[i + 1]));
    if (!glyph) {
      g.i16(0);
      continue;
    }
    if (glyph.kind === 'composite') {
      g.i16(-1);
      for (const v of glyph.box) g.i16(v);
      g.bytes(glyph.parts);
      if (glyph.code) {
        g.u255(0);
        g.u255(glyph.code.length);
        code.bytes(glyph.code);
      }
      continue;
    }
    const box = boxOf(glyph.x, glyph.y);
    if (box.every((v, k) => v === glyph.box[k])) g.i16(glyph.ends.length);
    else {
      g.i16(0x7fff);
      g.i16(glyph.ends.length);
      for (const v of glyph.box) g.i16(v);
    }
    glyph.ends.forEach((e, k) => g.u255(k ? e - glyph.ends[k - 1] : e));
    const steps = new Out();
    let px = 0;
    let py = 0;
    glyph.x.forEach((x, k) => {
      const [index, bytes] = triplet(x - px, glyph.y[k] - py);
      px = x;
      py = glyph.y[k];
      g.u8(index | (glyph.on[k] ? 0 : 0x80));
      for (const b of bytes) steps.u8(b);
    });
    g.bytes(steps.done());
    g.u255(0);
    g.u255(glyph.code.length);
    code.bytes(glyph.code);
  }
  const ctf: [string, Buffer][] = [];
  for (const [tag, data] of t) {
    if (DROPPED.has(tag)) continue;
    ctf.push([tag, tag === 'glyf' ? g.done() : tag === 'loca' ? Buffer.alloc(0) : tag === 'cvt ' ? cvtOut(data) : data]);
  }
  // The checksums the font's own tables had; head as it was.
  const sums = new Map<string, number>();
  const n = font.readUInt16BE(4);
  for (let i = 0; i < n; i++) sums.set(font.toString('latin1', 12 + i * 16, 16 + i * 16), font.readUInt32BE(12 + i * 16 + 4));
  return { rest: fontFile(font.readUInt32BE(0), ctf, sums, false), push: Buffer.alloc(0), code: code.done() };
}

/** The instructions that push a glyph's first values: bytes where they fit, else words, 255 at most to an instruction. */
function pushes(values: number[]): Buffer {
  const out = new Out();
  for (let i = 0; i < values.length;) {
    const bytes = values[i] >= 0 && values[i] <= 255;
    let n = 1;
    while (i + n < values.length && n < 255 && (values[i + n] >= 0 && values[i + n] <= 255) === bytes) n++;
    if (n <= 8) out.u8((bytes ? 0xb0 : 0xb8) + n - 1);
    else (out.u8(bytes ? 0x40 : 0x41), out.u8(n));
    for (let k = 0; k < n; k++) bytes ? out.u8(values[i + k]) : out.i16(values[i + k]);
    i += n;
  }
  return out.done();
}

/** A glyph's push values (6.2): 255SHORTs, with Hop3 (251) and Hop4 (252) for the value two back again between new ones. */
function pushValues(r: In, count: number): number[] {
  const v: number[] = [];
  while (v.length < count) {
    const c = r.peek();
    if (c === 251 || c === 252) {
      r.u8();
      if (v.length < 2) throw new Error('MTX: a hop code with nothing to hop back to');
      const a = v[v.length - 2];
      v.push(a, r.s255(), a);
      if (c === 252) v.push(r.s255(), a);
    } else v.push(r.s255());
  }
  if (v.length !== count) throw new Error('MTX: push data runs over');
  return v;
}

/** A Compact Table Format font back as TrueType: glyf and loca made from the glyphs, cvt from its differences. */
export function fontOfCtf(rest: Buffer, push: Buffer, code: Buffer): Buffer {
  const t = tablesOf(rest);
  const head = t.get('head');
  const maxp = t.get('maxp');
  const ctf = t.get('glyf');
  if (!head || head.length < 54 || !maxp || maxp.length < 6 || !ctf) throw new Error('MTX: a table glyphs need is missing');
  for (const tag of DROPPED) if (t.get(tag)?.length) throw new Error(`MTX: ${tag} in the submission’s own form is not read here`);
  const n = maxp.readUInt16BE(4);
  const r = new In(ctf);
  const pr = new In(push);
  const cr = new In(code);
  const program = () => {
    const values = pushValues(pr, r.u255());
    const size = r.u255();
    return Buffer.concat([pushes(values), cr.bytes(size)]);
  };
  const glyphs: Buffer[] = [];
  for (let i = 0; i < n; i++) {
    let contours = r.i16();
    if (contours === 0) {
      glyphs.push(Buffer.alloc(0));
      continue;
    }
    if (contours < 0) {
      const box: [number, number, number, number] = [r.i16(), r.i16(), r.i16(), r.i16()];
      const start = r.p;
      const c = componentsEnd(ctf, start, ctf.length);
      r.p = c.at;
      const parts = ctf.subarray(start, c.at);
      glyphs.push(glyphBytes({ kind: 'composite', box, parts, code: c.last & WE_HAVE_INSTRUCTIONS ? program() : null }));
      continue;
    }
    let box: [number, number, number, number] | null = null;
    if (contours === 0x7fff) {
      contours = r.i16();
      box = [r.i16(), r.i16(), r.i16(), r.i16()];
    }
    const ends: number[] = [];
    for (let k = 0; k < contours; k++) ends.push(k ? ends[k - 1] + r.u255() : r.u255());
    const points = ends[ends.length - 1] + 1;
    const flags = [...r.bytes(points)];
    const x: number[] = [];
    const y: number[] = [];
    let px = 0;
    let py = 0;
    for (const f of flags) {
      const tr = TRIPLETS[f & 0x7f];
      let data = 0;
      for (let k = 1; k < tr.bytes; k++) data = data * 256 + r.u8();
      const all = (tr.bytes - 1) * 8;
      const dx = tr.xBits ? Math.floor(data / 2 ** (all - tr.xBits)) % 2 ** tr.xBits : 0;
      const dy = tr.yBits ? Math.floor(data / 2 ** (all - tr.xBits - tr.yBits)) % 2 ** tr.yBits : 0;
      px += tr.xSign < 0 ? -(dx + tr.dx) : dx + tr.dx;
      py += tr.ySign < 0 ? -(dy + tr.dy) : dy + tr.dy;
      x.push(px);
      y.push(py);
    }
    const prog = program();
    glyphs.push(glyphBytes({ kind: 'simple', box: box ?? boxOf(x, y), ends, code: prog, x, y, on: flags.map((f) => !(f & 0x80)) }));
  }
  // loca as head says (short where every glyph fits), the glyphs on two bytes or four.
  let long = head.readInt16BE(50) === 1;
  const total = glyphs.reduce((s, g) => s + ((g.length + 1) & ~1), 0);
  if (!long && total > 0x1fffe) long = true;
  const g = new Out();
  const loca = new Out();
  for (const b of glyphs) {
    long ? loca.u32(g.n) : loca.u16(g.n / 2);
    g.bytes(b);
    g.pad(long ? 4 : 2);
  }
  long ? loca.u32(g.n) : loca.u16(g.n / 2);
  const newHead = Buffer.from(head);
  newHead.writeInt16BE(long ? 1 : 0, 50);
  const out: [string, Buffer][] = [];
  for (const [tag, data] of t) out.push([tag, tag === 'glyf' ? g.done() : tag === 'loca' ? loca.done() : tag === 'cvt ' ? cvtIn(data) : tag === 'head' ? newHead : data]);
  if (!t.has('loca')) out.push(['loca', loca.done()]);
  return fontFile(rest.readUInt32BE(0), out);
}

// ---- MicroType Express ---------------------------------------------------------------------------------------

/** A TrueType font as MicroType Express: version 3, the copy limit, where the second and third parts start, then the three parts. */
export function mtxOf(font: Buffer): Buffer {
  const { rest, push, code } = ctfOf(font);
  const parts = [rest, push, code].map((p) => lzcomp(p));
  const limit = Math.max(rest.length, push.length, code.length) + PRELOAD;
  const head = Buffer.alloc(10);
  const at2 = 10 + parts[0].length;
  const at3 = at2 + parts[1].length;
  if (at3 + parts[2].length >= 1 << 24 || limit >= 1 << 24) throw new Error('MTX: too big a font');
  head[0] = 3;
  head.writeUIntBE(limit, 1, 3);
  head.writeUIntBE(at2, 4, 3);
  head.writeUIntBE(at3, 7, 3);
  return Buffer.concat([head, ...parts]);
}

/** A MicroType Express font back as TrueType. */
export function fontOfMtx(mtx: Buffer): Buffer {
  if (mtx.length < 10 || mtx[0] < 1 || mtx[0] > 3) throw new Error('MTX: not MicroType Express');
  const at2 = mtx.readUIntBE(4, 3);
  const at3 = mtx.readUIntBE(7, 3);
  if (at2 < 10 || at3 < at2 || at3 > mtx.length) throw new Error('MTX: its parts are out of order');
  const part = (b: Buffer) => unlzcomp(b, mtx[0] !== 1);
  return fontOfCtf(part(mtx.subarray(10, at2)), part(mtx.subarray(at2, at3)), part(mtx.subarray(at3)));
}

/**
 * Whether two TrueType fonts draw and measure alike: every glyph's points, on and off the curve, contours, box and
 * program, every composite's parts; every other table byte for byte (cmap, hmtx, hhea, OS/2, name, post, cvt…), head
 * but for its checksum and loca's form, and none missing but the device metrics MicroType Express goes without.
 * Null when they do, else what differs.
 */
export function sameFont(a: Buffer, b: Buffer): string | null {
  const ta = tablesOf(a);
  const tb = tablesOf(b);
  for (const [tag, data] of ta) {
    if (DROPPED.has(tag) || tag === 'glyf' || tag === 'loca') continue;
    const other = tb.get(tag);
    if (!other) return `${tag} is missing`;
    if (tag === 'head') {
      const x = Buffer.from(data);
      const y = Buffer.from(other);
      for (const h of [x, y]) {
        h.fill(0, 8, 12);
        if (h.length >= 52) h.fill(0, 50, 52);
      }
      if (!x.equals(y)) return 'head differs';
    } else if (!data.equals(other)) return `${tag} differs`;
  }
  for (const tag of tb.keys()) if (!ta.has(tag)) return `${tag} was added`;
  const ga = ta.get('glyf');
  const gb = tb.get('glyf');
  if (!ga || !gb) return ga || gb ? 'glyf is missing' : null;
  const la = locaOf(ta);
  const lb = locaOf(tb);
  if (la.length !== lb.length) return 'the glyph count differs';
  for (let i = 0; i + 1 < la.length; i++) {
    const x = readGlyph(ga.subarray(la[i], la[i + 1]));
    const y = readGlyph(gb.subarray(lb[i], lb[i + 1]));
    if (!x || !y) {
      if (x || y) return `glyph ${i} lost or gained its outline`;
      continue;
    }
    if (x.kind !== y.kind || !x.box.every((v, k) => v === y.box[k])) return `glyph ${i} differs`;
    if (x.kind === 'composite' && y.kind === 'composite') {
      if (!x.parts.equals(y.parts) || !(x.code ?? Buffer.alloc(0)).equals(y.code ?? Buffer.alloc(0))) return `glyph ${i}’s parts differ`;
    } else if (x.kind === 'simple' && y.kind === 'simple') {
      const same = (p: unknown[], q: unknown[]) => p.length === q.length && p.every((v, k) => v === q[k]);
      if (!same(x.ends, y.ends) || !same(x.x, y.x) || !same(x.y, y.y) || !same(x.on, y.on) || !x.code.equals(y.code)) return `glyph ${i}’s outline differs`;
    }
  }
  return null;
}
