// TrueType fonts, read and cut down for a PDF: the tables a PDF needs (outlines, metrics, the character map), from a
// .ttf or one font of a .ttc collection, and a subset of just the glyphs used, numbered from 1 in the order they were
// first used, so a font of tens of thousands of Chinese characters adds only what the words need. Fonts with
// PostScript outlines (CFF, "OTTO") are not taken, nor fonts whose makers forbid embedding them.

export class TrueType {
  readonly unitsPerEm: number;
  readonly numGlyphs: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly bbox: [number, number, number, number];
  readonly italicAngle: number;
  readonly fixedPitch: boolean;
  readonly psName: string;
  /** The font's maker allows embedding it in documents. */
  readonly embeddable: boolean;
  private tables = new Map<string, { off: number; len: number }>();
  private longLoca: boolean;
  private numHMetrics: number;
  private cmapCache: Map<number, number> | null = null;

  private constructor(
    readonly buf: Buffer,
    start: number,
  ) {
    const n = buf.readUInt16BE(start + 4);
    for (let i = 0; i < n; i++) {
      const p = start + 12 + i * 16;
      const tag = buf.toString('latin1', p, p + 4);
      const off = buf.readUInt32BE(p + 8);
      const len = buf.readUInt32BE(p + 12);
      if (off + len <= buf.length) this.tables.set(tag, { off, len });
    }
    const head = this.t('head');
    const hhea = this.t('hhea');
    const maxp = this.t('maxp');
    if (!head || !hhea || !maxp || !this.tables.has('glyf') || !this.tables.has('loca') || !this.tables.has('hmtx')) throw new Error('Not a TrueType font with outlines');
    this.unitsPerEm = buf.readUInt16BE(head + 18) || 1000;
    this.bbox = [buf.readInt16BE(head + 36), buf.readInt16BE(head + 38), buf.readInt16BE(head + 40), buf.readInt16BE(head + 42)];
    this.longLoca = buf.readInt16BE(head + 50) === 1;
    this.numGlyphs = buf.readUInt16BE(maxp + 4);
    this.numHMetrics = Math.max(1, Math.min(buf.readUInt16BE(hhea + 34), this.numGlyphs));
    let asc = buf.readInt16BE(hhea + 4);
    let desc = buf.readInt16BE(hhea + 6);
    const os2 = this.t('OS/2');
    let cap = 0;
    let fsType = 0;
    if (os2) {
      fsType = buf.readUInt16BE(os2 + 8);
      const ta = buf.readInt16BE(os2 + 68);
      const td = buf.readInt16BE(os2 + 70);
      if (ta > 0) {
        asc = Math.max(asc, ta);
        desc = Math.min(desc, td);
      }
      if (buf.readUInt16BE(os2) >= 2 && this.tables.get('OS/2')!.len >= 90) cap = buf.readInt16BE(os2 + 88);
    }
    this.ascent = asc;
    this.descent = desc;
    this.capHeight = cap || Math.round(asc * 0.7);
    // Bit 1 alone (0x0002): "restricted license embedding", which forbids it; bit 9 (0x0200): outlines may not be embedded.
    this.embeddable = (fsType & 0x000f) !== 0x0002 && !(fsType & 0x0200);
    const post = this.t('post');
    this.italicAngle = post ? buf.readInt32BE(post + 4) / 65536 : 0;
    this.fixedPitch = post ? buf.readUInt32BE(post + 12) !== 0 : false;
    this.psName = this.name(6) ?? 'Font';
  }

  /** A font from a .ttf, or the `index`th of a .ttc; null for anything else (CFF outlines among them). */
  static parse(buf: Buffer, index = 0): TrueType | null {
    try {
      const tag = buf.toString('latin1', 0, 4);
      let start = 0;
      if (tag === 'ttcf') {
        const n = buf.readUInt32BE(8);
        if (index >= n) return null;
        start = buf.readUInt32BE(12 + index * 4);
      }
      const v = buf.readUInt32BE(start);
      if (v !== 0x00010000 && buf.toString('latin1', start, start + 4) !== 'true') return null;
      return new TrueType(buf, start);
    } catch {
      return null;
    }
  }

  /** How many fonts a .ttc holds (1 for a .ttf). */
  static count(buf: Buffer): number {
    return buf.toString('latin1', 0, 4) === 'ttcf' ? buf.readUInt32BE(8) : 1;
  }

  private t(tag: string): number {
    return this.tables.get(tag)?.off ?? 0;
  }

  private name(id: number): string | null {
    const p = this.t('name');
    if (!p) return null;
    const b = this.buf;
    const count = b.readUInt16BE(p + 2);
    const strings = p + b.readUInt16BE(p + 4);
    let found: string | null = null;
    for (let i = 0; i < count; i++) {
      const r = p + 6 + i * 12;
      if (b.readUInt16BE(r + 6) !== id) continue;
      const plat = b.readUInt16BE(r);
      const len = b.readUInt16BE(r + 8);
      const off = strings + b.readUInt16BE(r + 10);
      if (plat === 3 || plat === 0) {
        const u = Buffer.from(b.subarray(off, off + len));
        u.swap16();
        return u.toString('utf16le');
      }
      if (plat === 1 && !found) found = b.toString('latin1', off, off + len);
    }
    return found;
  }

  /** Character → glyph, from the font's best Unicode map. */
  private cmap(): Map<number, number> {
    if (this.cmapCache) return this.cmapCache;
    const map = new Map<number, number>();
    const p = this.t('cmap');
    const b = this.buf;
    if (p) {
      const n = b.readUInt16BE(p + 2);
      const subs: { plat: number; enc: number; off: number; format: number }[] = [];
      for (let i = 0; i < n; i++) {
        const r = p + 4 + i * 8;
        const off = p + b.readUInt32BE(r + 4);
        if (off + 2 > b.length) continue;
        subs.push({ plat: b.readUInt16BE(r), enc: b.readUInt16BE(r + 2), off, format: b.readUInt16BE(off) });
      }
      const rank = (s: (typeof subs)[number]) =>
        s.format === 12 && (s.plat === 3 || s.plat === 0) ? 0 : s.format === 4 && s.plat === 3 && s.enc === 1 ? 1 : s.format === 4 && s.plat === 0 ? 2 : s.plat === 3 && s.enc === 0 ? 3 : s.plat === 1 && s.enc === 0 ? 4 : 9;
      const best = subs.filter((s) => rank(s) < 9).sort((a, c) => rank(a) - rank(c))[0];
      if (best) this.readSubtable(best.off, best.format, map, best.plat === 3 && best.enc === 0);
    }
    this.cmapCache = map;
    return map;
  }

  private readSubtable(o: number, format: number, map: Map<number, number>, symbol: boolean) {
    const b = this.buf;
    if (format === 4) {
      const segX2 = b.readUInt16BE(o + 6);
      const ends = o + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = b.readUInt16BE(ends + s * 2);
        const start = b.readUInt16BE(starts + s * 2);
        const delta = b.readUInt16BE(deltas + s * 2);
        const ro = b.readUInt16BE(ranges + s * 2);
        if (start === 0xffff) break;
        for (let c = start; c <= end; c++) {
          let g: number;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            const at = ranges + s * 2 + ro + (c - start) * 2;
            if (at + 2 > b.length) continue;
            g = b.readUInt16BE(at);
            if (g) g = (g + delta) & 0xffff;
          }
          if (g && g < this.numGlyphs) {
            map.set(c, g);
            // A symbol font's codes are U+F0xx: they also stand for the byte (Wingdings' "a" is U+F061).
            if (symbol && c >= 0xf000 && c <= 0xf0ff && !map.has(c - 0xf000)) map.set(c - 0xf000, g);
          }
        }
      }
    } else if (format === 12) {
      const groups = b.readUInt32BE(o + 12);
      for (let i = 0; i < groups; i++) {
        const r = o + 16 + i * 12;
        const s = b.readUInt32BE(r);
        const e = b.readUInt32BE(r + 4);
        const g = b.readUInt32BE(r + 8);
        if (e - s > 0x110000) continue;
        for (let c = s; c <= e; c++) if (g + c - s < this.numGlyphs) map.set(c, g + c - s);
      }
    } else if (format === 6) {
      const first = b.readUInt16BE(o + 6);
      const count = b.readUInt16BE(o + 8);
      for (let i = 0; i < count; i++) {
        const g = b.readUInt16BE(o + 10 + i * 2);
        if (g) map.set(first + i, g);
      }
    } else if (format === 0) {
      for (let c = 0; c < 256; c++) {
        const g = b[o + 6 + c];
        if (g) map.set(c, g);
      }
    }
  }

  /** The glyph for a character (0 when the font has none). */
  glyph(cp: number): number {
    return this.cmap().get(cp) ?? 0;
  }

  /** Every character the font maps, with its glyph (to read text drawn by glyph numbers back as words). */
  entries(): Map<number, number> {
    return this.cmap();
  }

  /** A glyph's advance, in font units. */
  advance(g: number): number {
    const p = this.t('hmtx');
    const i = Math.min(g, this.numHMetrics - 1);
    return this.buf.readUInt16BE(p + i * 4);
  }

  private glyphRange(g: number): [number, number] {
    const loca = this.t('loca');
    const glyf = this.t('glyf');
    const b = this.buf;
    if (g < 0 || g >= this.numGlyphs) return [glyf, glyf];
    const [s, e] = this.longLoca ? [b.readUInt32BE(loca + g * 4), b.readUInt32BE(loca + g * 4 + 4)] : [b.readUInt16BE(loca + g * 2) * 2, b.readUInt16BE(loca + g * 2 + 2) * 2];
    const end = glyf + this.tables.get('glyf')!.len;
    return [Math.min(glyf + s, end), Math.min(glyf + Math.max(s, e), end)];
  }

  /** The glyphs a composite glyph is made of. */
  private components(g: number): number[] {
    const [s, e] = this.glyphRange(g);
    const b = this.buf;
    if (e - s < 10 || b.readInt16BE(s) >= 0) return [];
    const out: number[] = [];
    let p = s + 10;
    for (let guard = 0; guard < 256 && p + 4 <= e; guard++) {
      const flags = b.readUInt16BE(p);
      out.push(b.readUInt16BE(p + 2));
      p += 4 + (flags & 0x0001 ? 4 : 2) + (flags & 0x0008 ? 2 : flags & 0x0040 ? 4 : flags & 0x0080 ? 8 : 0);
      if (!(flags & 0x0020)) break;
    }
    return out;
  }

  /**
   * The font cut down to `glyphs` (old numbers, in their new order: the first is glyph 1; glyph 0 is always the
   * font's own .notdef). Composite glyphs bring the glyphs they are made of, added at the end.
   */
  subset(glyphs: number[], unicodes: Map<number, string>): Buffer {
    const order = [0];
    const index = new Map<number, number>([[0, 0]]);
    const take = (g: number) => {
      if (index.has(g) || g >= this.numGlyphs) return;
      index.set(g, order.length);
      order.push(g);
    };
    for (const g of glyphs) take(g);
    for (let i = 0; i < order.length; i++) for (const c of this.components(order[i])) take(c);
    const b = this.buf;
    // glyf and loca (long offsets), composite glyphs' parts renumbered.
    const glyfParts: Buffer[] = [];
    const loca = Buffer.alloc((order.length + 1) * 4);
    let pos = 0;
    order.forEach((g, i) => {
      loca.writeUInt32BE(pos, i * 4);
      const [s, e] = this.glyphRange(g);
      if (e <= s) return;
      const data = Buffer.from(b.subarray(s, e));
      if (data.length >= 10 && data.readInt16BE(0) < 0) {
        let p = 10;
        for (let guard = 0; guard < 256 && p + 4 <= data.length; guard++) {
          const flags = data.readUInt16BE(p);
          data.writeUInt16BE(index.get(data.readUInt16BE(p + 2)) ?? 0, p + 2);
          p += 4 + (flags & 0x0001 ? 4 : 2) + (flags & 0x0008 ? 2 : flags & 0x0040 ? 4 : flags & 0x0080 ? 8 : 0);
          if (!(flags & 0x0020)) break;
        }
      }
      const pad = (4 - (data.length % 4)) % 4;
      glyfParts.push(data, Buffer.alloc(pad));
      pos += data.length + pad;
    });
    loca.writeUInt32BE(pos, order.length * 4);
    const glyf = Buffer.concat(glyfParts);
    // hmtx: every glyph its own advance and left side bearing.
    const hmtxOff = this.t('hmtx');
    const hmtx = Buffer.alloc(order.length * 4);
    order.forEach((g, i) => {
      const m = Math.min(g, this.numHMetrics - 1);
      hmtx.writeUInt16BE(b.readUInt16BE(hmtxOff + m * 4), i * 4);
      const lsbAt = g < this.numHMetrics ? hmtxOff + g * 4 + 2 : hmtxOff + this.numHMetrics * 4 + (g - this.numHMetrics) * 2;
      hmtx.writeInt16BE(lsbAt + 2 <= b.length ? b.readInt16BE(lsbAt) : 0, i * 4 + 2);
    });
    const copy = (tag: string) => {
      const t = this.tables.get(tag);
      return t ? Buffer.from(b.subarray(t.off, t.off + t.len)) : null;
    };
    const head = copy('head')!;
    head.writeUInt32BE(0, 8);
    head.writeInt16BE(1, 50);
    const hhea = copy('hhea')!;
    hhea.writeUInt16BE(order.length, 34);
    const maxp = copy('maxp')!;
    maxp.writeUInt16BE(order.length, 4);
    const post = Buffer.alloc(32);
    const op = copy('post');
    if (op) op.copy(post, 0, 0, Math.min(32, op.length));
    post.writeUInt32BE(0x00030000, 0);
    const cmap = buildCmap(index, unicodes);
    const tables: [string, Buffer][] = [
      ['cmap', cmap],
      ['glyf', glyf],
      ['head', head],
      ['hhea', hhea],
      ['hmtx', hmtx],
      ['loca', loca],
      ['maxp', maxp],
      ['post', post],
    ];
    for (const tag of ['OS/2', 'cvt ', 'fpgm', 'prep', 'name']) {
      const t = copy(tag);
      if (t) tables.push([tag, t]);
    }
    return sfnt(tables);
  }
}

/** A format 4 character map (and format 12 for characters past the first plane) of the glyphs kept. */
function buildCmap(index: Map<number, number>, unicodes: Map<number, string>): Buffer {
  const pairs: [number, number][] = [];
  for (const [old, text] of unicodes) {
    const g = index.get(old);
    const cp = text.codePointAt(0);
    if (g === undefined || cp === undefined || [...text].length !== 1) continue;
    pairs.push([cp, g]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const bmp = pairs.filter(([c]) => c < 0xffff);
  const segs = bmp.length + 1;
  const f4 = Buffer.alloc(16 + segs * 8);
  f4.writeUInt16BE(4, 0);
  f4.writeUInt16BE(f4.length, 2);
  f4.writeUInt16BE(segs * 2, 6);
  const sr = 2 * 2 ** Math.floor(Math.log2(segs));
  f4.writeUInt16BE(sr, 8);
  f4.writeUInt16BE(Math.floor(Math.log2(segs)), 10);
  f4.writeUInt16BE(segs * 2 - sr, 12);
  const ends = 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const ranges = deltas + segs * 2;
  bmp.forEach(([c, g], i) => {
    f4.writeUInt16BE(c, ends + i * 2);
    f4.writeUInt16BE(c, starts + i * 2);
    f4.writeUInt16BE((g - c + 0x10000) & 0xffff, deltas + i * 2);
    f4.writeUInt16BE(0, ranges + i * 2);
  });
  f4.writeUInt16BE(0xffff, ends + bmp.length * 2);
  f4.writeUInt16BE(0xffff, starts + bmp.length * 2);
  f4.writeUInt16BE(1, deltas + bmp.length * 2);
  const subs: [number, number, Buffer][] = [[3, 1, f4]];
  if (pairs.length > bmp.length) {
    const f12 = Buffer.alloc(16 + pairs.length * 12);
    f12.writeUInt16BE(12, 0);
    f12.writeUInt32BE(f12.length, 4);
    f12.writeUInt32BE(pairs.length, 12);
    pairs.forEach(([c, g], i) => {
      f12.writeUInt32BE(c, 16 + i * 12);
      f12.writeUInt32BE(c, 20 + i * 12);
      f12.writeUInt32BE(g, 24 + i * 12);
    });
    subs.push([3, 10, f12]);
  }
  const head = Buffer.alloc(4 + subs.length * 8);
  head.writeUInt16BE(subs.length, 2);
  let off = head.length;
  subs.forEach(([p, e, t], i) => {
    head.writeUInt16BE(p, 4 + i * 8);
    head.writeUInt16BE(e, 6 + i * 8);
    head.writeUInt32BE(off, 8 + i * 8);
    off += t.length;
  });
  return Buffer.concat([head, ...subs.map((s) => s[2])]);
}

function checksum(b: Buffer): number {
  let sum = 0;
  const padded = b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/** A font file of `tables`, sorted, aligned, with checksums and head's adjustment. */
function sfnt(tables: [string, Buffer][]): Buffer {
  tables.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const n = tables.length;
  const dir = Buffer.alloc(12 + n * 16);
  dir.writeUInt32BE(0x00010000, 0);
  dir.writeUInt16BE(n, 4);
  const es = Math.floor(Math.log2(n));
  dir.writeUInt16BE(16 * 2 ** es, 6);
  dir.writeUInt16BE(es, 8);
  dir.writeUInt16BE(n * 16 - 16 * 2 ** es, 10);
  let off = dir.length;
  const body: Buffer[] = [];
  let headAt = -1;
  tables.forEach(([tag, data], i) => {
    const p = 12 + i * 16;
    dir.write(tag.padEnd(4, ' '), p, 'latin1');
    dir.writeUInt32BE(checksum(data), p + 4);
    dir.writeUInt32BE(off, p + 8);
    dir.writeUInt32BE(data.length, p + 12);
    if (tag === 'head') headAt = off;
    const pad = (4 - (data.length % 4)) % 4;
    body.push(data, Buffer.alloc(pad));
    off += data.length + pad;
  });
  const font = Buffer.concat([dir, ...body]);
  if (headAt >= 0) font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headAt + 8);
  return font;
}
