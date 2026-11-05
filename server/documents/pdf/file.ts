// A PDF file read into its objects, and written back: the cross-reference sections (classic tables and streams, the
// hybrid kind, and every incremental update already in the file, newest first), objects packed in object streams,
// and files whose cross-references are broken, which are rebuilt by scanning for the objects themselves. Files
// encrypted with an empty user password are decrypted as they are read (crypt.ts).
//
// Changes are kept apart from what was read, and saved two ways: as an incremental update (`saveUpdate`), which
// appends the changed and new objects with a cross-reference section of the same kind as the file's last one and
// leaves every byte that was there as it was (a digital signature made before stays valid for what it signed), or as
// a whole new file (`Rewriter`), which page operations need: only what the document still uses is written, numbered
// anew, from one or more source files.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Crypt, type Permissions } from './crypt.ts';
import { decoded } from './filters.ts';
import { clone, Dict, dict, isDict, isRef, isStream, Lexer, num, type Obj, Op, ParseError, Ref, serialize, Str, Stream } from './objects.ts';

type XEntry = { t: 0; gen: number } | { t: 1; off: number; gen: number } | { t: 2; stm: number; idx: number };

/** Most objects a file may say it has (a sane bound on broken /Size and /Index numbers). */
const MAX_OBJECTS = 8_000_000;

export class PdfError extends Error {}

export class PdfFile {
  readonly buf: Buffer;
  /** Where "%PDF-" starts: offsets in files with bytes before it may count from there. */
  private base = 0;
  readonly version: string;
  private xref = new Map<number, XEntry>();
  trailer = new Dict();
  private cache = new Map<number, Obj>();
  private stms = new Map<number, { data: Buffer; first: number; offsets: Map<number, number>; order: number[] }>();
  crypt: Crypt | null = null;
  private encNum = -1;
  /** The kind of the file's last cross-reference section: an update is written the same way. */
  xrefKind: 'table' | 'stream' = 'table';
  /** Where the last cross-reference section is (an update's /Prev). */
  startxref = 0;
  /** The cross-references were broken and rebuilt from the objects found. */
  repaired = false;
  /** Objects added or changed since the file was read. */
  private changes = new Map<number, Obj>();
  private size = 1;
  private loading = new Set<number>();
  private scanned: Map<number, { off: number; gen: number }> | null = null;

  constructor(buf: Buffer) {
    this.buf = buf;
    const head = buf.subarray(0, 1024).toString('latin1');
    const h = head.indexOf('%PDF-');
    if (h < 0) throw new PdfError('This is not a PDF file.');
    this.base = h;
    this.version = /^%PDF-(\d\.\d)/.exec(head.slice(h))?.[1] ?? '1.4';
    let ok = false;
    try {
      ok = this.readXrefChain();
    } catch {
      ok = false;
    }
    if (!ok || !this.rootOk()) this.rebuild();
    if (!this.rootOk()) throw new PdfError('This PDF is damaged: its pages could not be found.');
    this.size = Math.max(this.size, Number(this.trailer.get('Size')) || 0);
    for (const k of this.xref.keys()) if (k >= this.size) this.size = k + 1;
    const enc = this.trailer.get('Encrypt');
    if (enc !== undefined && enc !== null) {
      if (isRef(enc)) this.encNum = enc.num;
      const ed = this.resolve(enc);
      if (isDict(ed)) {
        const id = this.resolve(this.trailer.get('ID') ?? null);
        const id0 = Array.isArray(id) && id[0] instanceof Str ? id[0].bytes : Buffer.alloc(0);
        this.crypt = Crypt.open(ed, id0, (o) => this.resolve(o));
        // What was read before the handler existed is read again, decrypted.
        const keep = this.cache.get(this.encNum);
        this.cache.clear();
        this.stms.clear();
        if (keep !== undefined) this.cache.set(this.encNum, keep);
      }
    }
  }

  // ---- reading ------------------------------------------------------------------------------------

  /** Follows the cross-reference sections from the last; false when they are broken. */
  private readXrefChain(): boolean {
    const tail = this.buf.subarray(Math.max(0, this.buf.length - 4096)).toString('latin1');
    const at = tail.lastIndexOf('startxref');
    if (at < 0) return false;
    const m = /^startxref\s+(\d+)/.exec(tail.slice(at));
    if (!m) return false;
    let off: number | null = Number(m[1]);
    this.startxref = off;
    const seen = new Set<number>();
    let first = true;
    while (off !== null && !seen.has(off)) {
      seen.add(off);
      const pos = this.findSection(off);
      if (pos < 0) return false;
      let tr: Dict;
      if (this.buf.toString('latin1', pos, pos + 4) === 'xref') {
        tr = this.readTable(pos + 4);
        if (first) this.xrefKind = 'table';
        // A hybrid file: its cross-reference stream holds what the table leaves out.
        const xs = tr.get('XRefStm');
        if (typeof xs === 'number') {
          const p2 = this.findSection(xs);
          if (p2 >= 0) this.readXrefStream(p2);
        }
      } else {
        tr = this.readXrefStream(pos);
        if (first) this.xrefKind = 'stream';
      }
      if (first) {
        this.trailer = tr;
        first = false;
      } else for (const [k, v] of tr) if (!this.trailer.has(k) && k !== 'Prev' && k !== 'XRefStm') this.trailer.set(k, v);
      const prev = tr.get('Prev');
      off = typeof prev === 'number' ? prev : null;
    }
    this.trailer.delete('Prev');
    this.trailer.delete('XRefStm');
    // Entries that do not point at their objects (offsets counted from another place, edits by broken tools) are
    // found by a scan; when too many are wrong, everything is rebuilt.
    let bad = 0;
    for (const [n, e] of this.xref) {
      if (e.t !== 1) continue;
      if (this.headerAt(e.off, n) >= 0) continue;
      if (this.base && this.headerAt(e.off + this.base, n) >= 0) {
        this.xref.set(n, { ...e, off: e.off + this.base });
        continue;
      }
      const s = this.scan().get(n);
      if (s) this.xref.set(n, { t: 1, off: s.off, gen: s.gen });
      else this.xref.delete(n);
      bad++;
    }
    if (bad) this.repaired = true;
    return true;
  }

  /** Where a cross-reference section is: at `off`, or `off` past the junk before %PDF-, or a little off. */
  private findSection(off: number): number {
    for (const p of [off, off + this.base]) {
      if (p < 0 || p >= this.buf.length) continue;
      let q = p;
      while (q < this.buf.length && /\s/.test(String.fromCharCode(this.buf[q]))) q++;
      const s = this.buf.toString('latin1', q, q + 24);
      if (s.startsWith('xref') || /^\d+\s+\d+\s+obj/.test(s)) return q;
    }
    // Off by a few bytes (a line end written as two bytes where one was counted).
    const win = this.buf.toString('latin1', Math.max(0, off - 64), Math.min(this.buf.length, off + 64));
    const m = /xref|\d+\s+\d+\s+obj/.exec(win);
    return m ? Math.max(0, off - 64) + m.index : -1;
  }

  /** The position of "n g obj" at `off`, or -1. */
  private headerAt(off: number, n: number): number {
    if (off < 0 || off >= this.buf.length) return -1;
    const s = this.buf.toString('latin1', off, off + 32);
    const m = /^\s*(\d+)\s+(\d+)\s+obj/.exec(s);
    return m && Number(m[1]) === n ? off : -1;
  }

  private readTable(pos: number): Dict {
    const lex = new Lexer(this.buf, pos);
    for (;;) {
      const w = lex.peekWord();
      if (w === 'trailer') {
        lex.pos += 7;
        const t = lex.read();
        return isDict(t) ? t : new Dict();
      }
      const a = Number(lex.read());
      const b = Number(lex.read());
      if (!Number.isInteger(a) || !Number.isInteger(b) || b < 0 || a < 0 || a + b > MAX_OBJECTS) throw new ParseError('Bad cross-reference table');
      lex.skip();
      // Entries are 20 bytes, but some writers make them 19 or 21: read them as words.
      const text = this.buf.toString('latin1', lex.pos, Math.min(this.buf.length, lex.pos + b * 21 + 64));
      const re = /(\d{1,10})[ \t]+(\d{1,5})[ \t]*([nf])/y;
      let p = 0;
      for (let i = 0; i < b; i++) {
        while (p < text.length && /\s/.test(text[p])) p++;
        re.lastIndex = p;
        const m = re.exec(text);
        if (!m) throw new ParseError('Bad cross-reference entry');
        p = re.lastIndex;
        const n = a + i;
        if (!this.xref.has(n)) this.xref.set(n, m[3] === 'n' ? { t: 1, off: Number(m[1]), gen: Number(m[2]) } : { t: 0, gen: Number(m[2]) });
      }
      lex.pos += p;
    }
  }

  private readXrefStream(pos: number): Dict {
    const lex = new Lexer(this.buf, pos);
    const n = Number(lex.read(false));
    lex.read(false);
    lex.read(false);
    const o = this.parseBody(lex, n, false);
    if (!isStream(o)) throw new ParseError('Bad cross-reference stream');
    const d = o.dict;
    const data = decoded(o, (x) => this.resolve(x));
    const W = (d.get('W') as number[]) ?? [];
    const [w0, w1, w2] = [Number(W[0] ?? 1), Number(W[1] ?? 0), Number(W[2] ?? 0)];
    const width = w0 + w1 + w2;
    if (!width) return d;
    const size = Number(d.get('Size') ?? 0);
    const index = (d.get('Index') as number[]) ?? [0, size];
    const read = (p: number, w: number) => {
      let v = 0;
      for (let i = 0; i < w; i++) v = v * 256 + data[p + i];
      return v;
    };
    let p = 0;
    for (let s = 0; s + 1 < index.length; s += 2) {
      const start = Number(index[s]);
      const count = Number(index[s + 1]);
      if (start + count > MAX_OBJECTS) break;
      for (let i = 0; i < count && p + width <= data.length; i++, p += width) {
        const type = w0 ? read(p, w0) : 1;
        const f1 = read(p + w0, w1);
        const f2 = read(p + w0 + w1, w2);
        const num = start + i;
        if (this.xref.has(num)) continue;
        if (type === 0) this.xref.set(num, { t: 0, gen: f2 });
        else if (type === 1) this.xref.set(num, { t: 1, off: f1, gen: f2 });
        else if (type === 2) this.xref.set(num, { t: 2, stm: f1, idx: f2 });
      }
    }
    return d;
  }

  /** Every "n g obj" in the file, the last of each number winning (as updates do). */
  private scan(): Map<number, { off: number; gen: number }> {
    if (this.scanned) return this.scanned;
    const found = new Map<number, { off: number; gen: number }>();
    const s = this.buf.toString('latin1');
    const re = /(?:^|[\s>\]])(\d{1,8})[ \t\r\n]+(\d{1,5})[ \t\r\n]+obj\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const off = m.index + (m[0].length - m[0].trimStart().length);
      found.set(Number(m[1]), { off, gen: Number(m[2]) });
    }
    this.scanned = found;
    return found;
  }

  /** Cross-references made again from the objects in the file, and the trailer from its last trailer or catalog. */
  private rebuild() {
    this.repaired = true;
    this.xref.clear();
    this.cache.clear();
    this.stms.clear();
    for (const [n, e] of this.scan()) this.xref.set(n, { t: 1, off: e.off, gen: e.gen });
    const s = this.buf.toString('latin1');
    const tr = new Dict();
    // Trailers, last first.
    let i = s.lastIndexOf('trailer');
    while (i >= 0) {
      try {
        const t = new Lexer(this.buf, i + 7).read();
        if (isDict(t)) for (const [k, v] of t) if (!tr.has(k)) tr.set(k, v);
      } catch {}
      i = i > 0 ? s.lastIndexOf('trailer', i - 1) : -1;
    }
    // Objects packed in object streams, and the cross-reference streams' own trailer entries.
    const nums = [...this.xref.keys()];
    for (const n of nums) {
      let o: Obj;
      try {
        o = this.getObj(n);
      } catch {
        continue;
      }
      if (!isStream(o)) continue;
      const type = o.dict.get('Type');
      if (type === 'XRef') {
        for (const k of ['Root', 'Info', 'ID', 'Encrypt']) if (!tr.has(k) && o.dict.has(k)) tr.set(k, o.dict.get(k)!);
      } else if (type === 'ObjStm') {
        const st = this.objStm(n);
        if (!st) continue;
        st.order.forEach((obj, idx) => {
          if (!this.xref.has(obj)) this.xref.set(obj, { t: 2, stm: n, idx });
        });
      }
    }
    // No trailer named the catalog: find it.
    if (!isDict(this.resolve(tr.get('Root') ?? null))) {
      for (const n of [...this.xref.keys()].reverse()) {
        let o: Obj;
        try {
          o = this.getObj(n);
        } catch {
          continue;
        }
        if (isDict(o) && o.get('Type') === 'Catalog' && o.has('Pages')) {
          tr.set('Root', new Ref(n, this.xref.get(n)?.t === 1 ? (this.xref.get(n) as { gen: number }).gen : 0));
          break;
        }
      }
    }
    tr.delete('Prev');
    tr.delete('XRefStm');
    this.trailer = tr;
    this.xrefKind = 'table';
    // An update of a rebuilt file points at no earlier section that could be trusted: it is written with a table
    // that lists every object (saveUpdate does when `repaired`).
    this.startxref = 0;
  }

  private rootOk(): boolean {
    try {
      const r = this.resolve(this.trailer.get('Root') ?? null);
      return isDict(r) && (isDict(this.resolve(r.get('Pages') ?? null)) || r.get('Type') === 'Catalog');
    } catch {
      return false;
    }
  }

  /** An object by its number: this update's version, else the file's (null when there is none). */
  getObj(n: number): Obj {
    if (this.changes.has(n)) return this.changes.get(n)!;
    if (this.cache.has(n)) return this.cache.get(n)!;
    const e = this.xref.get(n);
    if (!e || e.t === 0) return null;
    if (this.loading.has(n)) return null;
    this.loading.add(n);
    let o: Obj;
    try {
      o = e.t === 1 ? this.readAt(n, e.off, e.gen) : this.inObjStm(e.stm, e.idx, n);
    } catch (err) {
      if (err instanceof Error && err.name === 'NeedsPassword') throw err;
      // Not where the cross-reference said: look for it.
      const s = e.t === 1 ? this.scan().get(n) : undefined;
      o = null;
      if (s && s.off !== (e as { off: number }).off) {
        try {
          o = this.readAt(n, s.off, s.gen);
        } catch {}
      }
    } finally {
      this.loading.delete(n);
    }
    this.cache.set(n, o);
    return o;
  }

  private readAt(n: number, off: number, gen: number): Obj {
    const lex = new Lexer(this.buf, off);
    const a = lex.read(false);
    lex.read(false);
    const kw = lex.read(false);
    if (a !== n || !(kw instanceof Op) || kw.op !== 'obj') throw new ParseError(`Object ${n} is not at ${off}`);
    let o = this.parseBody(lex, n, true);
    if (this.crypt && n !== this.encNum) o = this.crypt.decryptObject(o, n, gen);
    return o;
  }

  /** An object's value after "n g obj", with its stream's bytes if it has one. */
  private parseBody(lex: Lexer, n: number, lengthByRef: boolean): Obj {
    const o = lex.read();
    if (!isDict(o)) return o instanceof Op ? null : o;
    lex.skip();
    if (lex.buf.toString('latin1', lex.pos, lex.pos + 6) !== 'stream') return o;
    let p = lex.pos + 6;
    // The data starts after one line end (CRLF or LF; a lone CR in broken files).
    if (lex.buf[p] === 0x0d) p++;
    if (lex.buf[p] === 0x0a) p++;
    let len = o.get('Length');
    if (isRef(len)) len = lengthByRef && len.num !== n ? this.getObj(len.num) : null;
    let end = typeof len === 'number' && len >= 0 ? p + len : -1;
    if (end >= 0 && end <= lex.buf.length) {
      let q = end;
      while (q < lex.buf.length && /\s/.test(String.fromCharCode(lex.buf[q]))) q++;
      if (lex.buf.toString('latin1', q, q + 9) !== 'endstream') end = -1;
    } else end = -1;
    if (end < 0) {
      // No length, or a wrong one: up to "endstream", without the line end before it.
      const e = lex.buf.indexOf('endstream', p, 'latin1');
      end = e < 0 ? lex.buf.length : e;
      if (lex.buf[end - 1] === 0x0a) end--;
      if (lex.buf[end - 1] === 0x0d) end--;
    }
    return new Stream(o, lex.buf.subarray(p, Math.max(p, end)));
  }

  private objStm(n: number) {
    let st = this.stms.get(n);
    if (st) return st;
    const s = this.getObj(n);
    if (!isStream(s)) return null;
    const data = decoded(s, (x) => this.resolve(x));
    const count = Number(this.resolve(s.dict.get('N') ?? 0));
    const first = Number(this.resolve(s.dict.get('First') ?? 0));
    const lex = new Lexer(data, 0, Math.min(first, data.length));
    const offsets = new Map<number, number>();
    const order: number[] = [];
    for (let i = 0; i < count && i < MAX_OBJECTS; i++) {
      try {
        const obj = lex.read(false);
        const off = lex.read(false);
        if (typeof obj !== 'number' || typeof off !== 'number') break;
        order.push(obj);
        if (!offsets.has(obj)) offsets.set(obj, off);
      } catch {
        break;
      }
    }
    st = { data, first, offsets, order };
    this.stms.set(n, st);
    return st;
  }

  private inObjStm(stm: number, idx: number, n: number): Obj {
    const st = this.objStm(stm);
    if (!st) return null;
    const off = st.order[idx] === n ? st.offsets.get(n) : st.offsets.get(n);
    if (off === undefined) return null;
    const lex = new Lexer(st.data, st.first + off);
    const o = lex.read();
    return o instanceof Op ? null : o;
  }

  /** Follows references (a chain of them too) to the object itself. */
  resolve(o: Obj | undefined): Obj {
    let x: Obj = o ?? null;
    for (let i = 0; i < 32 && x instanceof Ref; i++) x = this.getObj(x.num);
    return x instanceof Ref ? null : x;
  }

  get(d: Dict | null | undefined, key: string): Obj {
    return d ? this.resolve(d.get(key)) : null;
  }
  dictOf(o: Obj | undefined): Dict | null {
    const x = this.resolve(o);
    return isDict(x) ? x : isStream(x) ? x.dict : null;
  }
  arrayOf(o: Obj | undefined): Obj[] {
    const x = this.resolve(o);
    return Array.isArray(x) ? x : [];
  }
  numOf(o: Obj | undefined, d = 0): number {
    const x = this.resolve(o);
    return typeof x === 'number' && Number.isFinite(x) ? x : d;
  }
  /** A stream's decoded data (empty when it cannot be decoded). */
  streamData(o: Obj | undefined): Buffer {
    const s = this.resolve(o);
    if (!isStream(s)) return Buffer.alloc(0);
    try {
      return decoded(s, (x) => this.resolve(x));
    } catch {
      return Buffer.alloc(0);
    }
  }

  catalog(): Dict {
    return this.dictOf(this.trailer.get('Root')) ?? new Dict();
  }

  permissions(): Permissions | null {
    return this.crypt ? this.crypt.permissions() : null;
  }

  /** Every object number the file has (for a scan of all of them). */
  objectNumbers(): number[] {
    return [...new Set([...this.xref.keys(), ...this.changes.keys()])].sort((a, b) => a - b);
  }

  // ---- changing ----------------------------------------------------------------------------------

  /** Adds an object; its reference. */
  add(o: Obj): Ref {
    const n = this.size++;
    this.changes.set(n, o);
    return new Ref(n, 0);
  }

  /** Puts a new version of an object in its place. */
  set(r: Ref, o: Obj) {
    this.changes.set(r.num, o);
  }

  /**
   * A dictionary (or a stream's) to change in this update: this update's version when there is one, else a copy of
   * the file's put in its place, so what was read stays as it was.
   */
  edit(r: Ref): Dict {
    const cur = this.changes.get(r.num);
    if (cur instanceof Dict) return cur;
    if (cur instanceof Stream) return cur.dict;
    const o = this.getObj(r.num);
    if (o instanceof Stream) {
      const s = new Stream(new Dict(o.dict), o.raw);
      this.changes.set(r.num, s);
      return s.dict;
    }
    const d = new Dict(o instanceof Dict ? o : undefined);
    this.changes.set(r.num, d);
    return d;
  }

  /** Whether anything was added or changed since the file was read. */
  get changed(): boolean {
    return this.changes.size > 0;
  }

  private genOf(n: number): number {
    const e = this.xref.get(n);
    return e && e.t !== 2 ? e.gen : 0;
  }

  /**
   * The file with this update's changes appended: the original bytes as they were, the changed and new objects, a
   * cross-reference section of the file's own kind pointing back at the last one, and a trailer. A file whose
   * cross-references were rebuilt gets a section that lists every object instead (its old ones cannot be trusted).
   */
  saveUpdate(): Buffer {
    if (!this.changes.size) return this.buf;
    const parts: Buffer[] = [this.buf];
    let pos = this.buf.length;
    const write = (b: Buffer | string) => {
      const x = typeof b === 'string' ? Buffer.from(b, 'latin1') : b;
      parts.push(x);
      pos += x.length;
    };
    const last = this.buf[this.buf.length - 1];
    if (last !== 0x0a && last !== 0x0d) write('\n');
    type Entry = { t: 0; gen: number } | { t: 1; off: number; gen: number } | { t: 2; stm: number; idx: number };
    const entries = new Map<number, Entry>();
    const full = this.repaired || !this.startxref;
    if (full) for (const [n, e] of this.xref) entries.set(n, e);
    for (const n of [...this.changes.keys()].sort((a, b) => a - b)) {
      const gen = this.genOf(n);
      let o: Obj = this.changes.get(n) ?? null;
      if (this.crypt && n !== this.encNum) o = this.crypt.encryptObject(o, n, gen);
      entries.set(n, { t: 1, off: pos, gen });
      write(`${n} ${gen} obj\n`);
      write(serialize(o));
      write('\nendobj\n');
    }
    const tr = new Dict();
    for (const k of ['Root', 'Info', 'Encrypt']) if (this.trailer.has(k)) tr.set(k, this.trailer.get(k)!);
    tr.set('ID', this.nextId());
    if (!full) tr.set('Prev', this.startxref);
    const xrefAt = pos;
    const stream = this.xrefKind === 'stream' || [...entries.values()].some((e) => e.t === 2);
    if (stream) {
      // A cross-reference stream: itself the last object, never encrypted.
      const self = this.size;
      entries.set(self, { t: 1, off: xrefAt, gen: 0 });
      const nums = [...entries.keys()].sort((a, b) => a - b);
      let big = xrefAt;
      for (const e of entries.values()) big = Math.max(big, e.t === 1 ? e.off : e.t === 2 ? e.stm : 0);
      const w1 = big >= 2 ** 32 ? 8 : 4;
      const row = 1 + w1 + 2;
      const data = Buffer.alloc(nums.length * row);
      nums.forEach((n, i) => {
        const e = entries.get(n)!;
        const [t, f1, f2] = e.t === 0 ? [0, 0, n === 0 ? 65535 : e.gen] : e.t === 1 ? [1, e.off, e.gen] : [2, e.stm, e.idx];
        const p = i * row;
        data[p] = t;
        for (let k = w1 - 1, v = f1; k >= 0; k--, v = Math.floor(v / 256)) data[p + 1 + k] = v % 256;
        data.writeUInt16BE(f2 & 0xffff, p + 1 + w1);
      });
      const index: number[] = [];
      for (const run of runs(nums)) index.push(run[0], run.length);
      tr.set('Type', 'XRef');
      tr.set('Size', Math.max(self + 1, nums[nums.length - 1] + 1));
      tr.set('Index', index);
      tr.set('W', [1, w1, 2]);
      tr.set('Filter', 'FlateDecode');
      write(`${self} 0 obj\n`);
      write(serialize(new Stream(tr, zlib.deflateSync(data))));
      write('\nendobj\n');
    } else {
      const nums = [...entries.keys()].sort((a, b) => a - b);
      let x = 'xref\n';
      if (!entries.has(0)) x += '0 1\n0000000000 65535 f\r\n';
      for (const run of runs(nums)) {
        x += `${run[0]} ${run.length}\n`;
        for (const n of run) {
          const e = entries.get(n)!;
          if (e.t === 1) x += `${String(e.off).padStart(10, '0')} ${String(e.gen).padStart(5, '0')} n\r\n`;
          else x += `0000000000 ${String(n === 0 ? 65535 : e.t === 0 ? e.gen : 0).padStart(5, '0')} f\r\n`;
        }
      }
      write(x);
      tr.set('Size', Math.max(this.size, nums[nums.length - 1] + 1));
      write('trailer\n');
      write(serialize(tr));
      write('\n');
    }
    write(`startxref\n${xrefAt}\n%%EOF\n`);
    return Buffer.concat(parts);
  }

  /** The file's ID with its second part new (as an update should have it); a new one where there was none. */
  private nextId(): Obj[] {
    const id = this.resolve(this.trailer.get('ID') ?? null);
    const fresh = new Str(crypto.createHash('md5').update(this.buf.subarray(-1024)).update(String(Date.now())).update(crypto.randomBytes(8)).digest(), true);
    if (Array.isArray(id) && id[0] instanceof Str) return [id[0], fresh];
    return [fresh, fresh];
  }

  /** Whether the file has a digital signature (a signed signature field). */
  signed(): boolean {
    const af = this.dictOf(this.catalog().get('AcroForm'));
    if (!af) return false;
    const sigFlags = this.numOf(af.get('SigFlags'));
    if (sigFlags & 1) return true;
    return false;
  }
}

/** Runs of consecutive numbers. */
function runs(nums: number[]): number[][] {
  const out: number[][] = [];
  for (const n of nums) {
    const r = out[out.length - 1];
    if (r && r[r.length - 1] === n - 1) r.push(n);
    else out.push([n]);
  }
  return out;
}

/**
 * A whole new file made of objects from one or more source files: each object a page or the catalog needs is
 * copied once, numbered anew, with what it refers to. `drop` names source objects that are no longer there (pages
 * taken out): references to them become null.
 */
export class Rewriter {
  private out: Obj[] = [null];
  private map = new Map<PdfFile, Map<number, number>>();
  private queue: [PdfFile, number, number][] = [];
  private drop = new Map<PdfFile, Set<number>>();

  constructor(
    private crypt: Crypt | null = null,
    private encrypt: Dict | null = null,
    private id: Obj[] | null = null,
    private version = '1.7',
  ) {}

  /** A source object references to which become null. */
  dropObject(src: PdfFile, n: number) {
    let s = this.drop.get(src);
    if (!s) this.drop.set(src, (s = new Set()));
    s.add(n);
  }

  /** References to a source object go to `to` instead (a page copied by hand, with its old number). */
  alias(src: PdfFile, n: number, to: Ref) {
    let m = this.map.get(src);
    if (!m) this.map.set(src, (m = new Map()));
    m.set(n, to.num);
  }

  /** A number for an object made here. */
  add(o: Obj): Ref {
    this.out.push(o);
    return new Ref(this.out.length - 1, 0);
  }
  /** A number taken now, its object set later (objects that refer to each other). */
  reserve(): Ref {
    return this.add(null);
  }
  set(r: Ref, o: Obj) {
    this.out[r.num] = o;
  }
  /** An object made here (set or added), to change it before the file is written. */
  get(r: Ref): Obj {
    return this.out[r.num] ?? null;
  }

  /** The new reference of a source object (copied with what it refers to when the file is written). */
  ref(src: PdfFile, r: Ref): Ref | null {
    if (this.drop.get(src)?.has(r.num)) return null;
    let m = this.map.get(src);
    if (!m) this.map.set(src, (m = new Map()));
    let n = m.get(r.num);
    if (n === undefined) {
      n = this.out.length;
      this.out.push(null);
      m.set(r.num, n);
      this.queue.push([src, r.num, n]);
    }
    return new Ref(n, 0);
  }

  /** A source object (a page's dictionary) copied with its references made new. */
  copy(src: PdfFile, o: Obj): Obj {
    return clone(o, (r) => this.ref(src, r));
  }

  finish(root: Ref, info?: Ref | null): Buffer {
    while (this.queue.length) {
      const [src, n, to] = this.queue.shift()!;
      const o = src.getObj(n);
      this.out[to] = clone(o, (r) => this.ref(src, r));
    }
    const parts: Buffer[] = [];
    let pos = 0;
    const write = (b: Buffer | string) => {
      const x = typeof b === 'string' ? Buffer.from(b, 'latin1') : b;
      parts.push(x);
      pos += x.length;
    };
    write(`%PDF-${this.version}\n%\xe2\xe3\xcf\xd3\n`);
    let encRef: Ref | null = null;
    if (this.crypt && this.encrypt) encRef = this.add(this.encrypt);
    const offsets: number[] = [0];
    for (let n = 1; n < this.out.length; n++) {
      let o = this.out[n];
      if (this.crypt && encRef?.num !== n) o = this.crypt.encryptObject(o, n, 0);
      offsets[n] = pos;
      write(`${n} 0 obj\n`);
      write(serialize(o));
      write('\nendobj\n');
    }
    const xrefAt = pos;
    let x = `xref\n0 ${this.out.length}\n0000000000 65535 f\r\n`;
    for (let n = 1; n < this.out.length; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n\r\n`;
    write(x);
    const id = this.id ?? [new Str(crypto.randomBytes(16), true), new Str(crypto.randomBytes(16), true)];
    const tr = dict({ Size: this.out.length, Root: root, Info: info ?? undefined, Encrypt: encRef ?? undefined, ID: id });
    write('trailer\n');
    write(serialize(tr));
    write(`\nstartxref\n${xrefAt}\n%%EOF\n`);
    return Buffer.concat(parts);
  }
}

export { num };
