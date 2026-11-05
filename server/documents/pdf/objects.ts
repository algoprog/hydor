// A PDF's objects as this reader and writer hold them, and their syntax both ways: a lexer over the file's bytes, a
// parser for objects and content streams (inline images skipped whole), and a serializer. Names are plain strings
// (their bytes as latin1, so they come back out as they went in); strings, references, dictionaries and streams are
// classes of their own. Node built-ins only.

export class Ref {
  constructor(
    readonly num: number,
    readonly gen: number,
  ) {}
  get key(): string {
    return `${this.num} ${this.gen}`;
  }
}

/** A string's bytes, as the file has them (decrypted). */
export class Str {
  constructor(
    public bytes: Buffer,
    public hex = false,
  ) {}
  /** As text: UTF-16 or UTF-8 with their byte order marks, else PDFDocEncoding. */
  text(): string {
    return textOf(this.bytes);
  }
  latin1(): string {
    return this.bytes.toString('latin1');
  }
}

export class Dict extends Map<string, Obj> {}

/** A stream: its dictionary and its bytes as stored (still encoded by its filters; already decrypted). */
export class Stream {
  constructor(
    public dict: Dict,
    public raw: Buffer,
  ) {}
}

/** An operator in a content stream (or a keyword the object parser met where it should not be). */
export class Op {
  constructor(readonly op: string) {}
}

export type Obj = null | boolean | number | string | Str | Ref | Dict | Stream | Obj[] | Op;

export const isDict = (o: unknown): o is Dict => o instanceof Dict;
export const isStream = (o: unknown): o is Stream => o instanceof Stream;
export const isRef = (o: unknown): o is Ref => o instanceof Ref;
export const isStr = (o: unknown): o is Str => o instanceof Str;
export const isName = (o: unknown, n?: string): o is string => typeof o === 'string' && (n === undefined || o === n);
export const isNum = (o: unknown): o is number => typeof o === 'number' && Number.isFinite(o);

/** A dictionary from plain values: `dict({ Type: 'Annot', Rect: [0, 0, 10, 10] })`. Undefined values are left out. */
export function dict(o: Record<string, Obj | undefined>): Dict {
  const d = new Dict();
  for (const [k, v] of Object.entries(o)) if (v !== undefined) d.set(k, v);
  return d;
}

/** A text string as PDF keeps it: PDFDocEncoding where every character has a byte there, else UTF-16BE. */
export function textStr(s: string): Str {
  const bytes: number[] = [];
  for (const ch of s) {
    const b = PDFDOC_OUT.get(ch);
    if (b === undefined) {
      const u = Buffer.from(s, 'utf16le');
      u.swap16();
      return new Str(Buffer.concat([Buffer.from([0xfe, 0xff]), u]));
    }
    bytes.push(b);
  }
  return new Str(Buffer.from(bytes));
}

/** Bytes as a text string: UTF-16BE (or LE) and UTF-8 by their byte order marks, else PDFDocEncoding. */
export function textOf(b: Buffer): string {
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    const u = Buffer.from(b.subarray(2, 2 + ((b.length - 2) & ~1)));
    u.swap16();
    return u.toString('utf16le');
  }
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le');
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString('utf8');
  let s = '';
  for (const c of b) s += PDFDOC[c] ?? String.fromCharCode(c);
  return s;
}

// PDFDocEncoding: Latin-1 but for 0x18–0x1F and 0x80–0x9F, which hold accents, quotes, dashes and ligatures.
const PDFDOC: Record<number, string> = {
  0x18: '˘',
  0x19: 'ˇ',
  0x1a: 'ˆ',
  0x1b: '˙',
  0x1c: '˝',
  0x1d: '˛',
  0x1e: '˚',
  0x1f: '˜',
  0x80: '•',
  0x81: '†',
  0x82: '‡',
  0x83: '…',
  0x84: '—',
  0x85: '–',
  0x86: 'ƒ',
  0x87: '⁄',
  0x88: '‹',
  0x89: '›',
  0x8a: '−',
  0x8b: '‰',
  0x8c: '„',
  0x8d: '“',
  0x8e: '”',
  0x8f: '‘',
  0x90: '’',
  0x91: '‚',
  0x92: '™',
  0x93: 'ﬁ',
  0x94: 'ﬂ',
  0x95: 'Ł',
  0x96: 'Œ',
  0x97: 'Š',
  0x98: 'Ÿ',
  0x99: 'Ž',
  0x9a: 'ı',
  0x9b: 'ł',
  0x9c: 'œ',
  0x9d: 'š',
  0x9e: 'ž',
  0xa0: '€',
};
const PDFDOC_OUT = new Map<string, number>();
for (let c = 0; c < 256; c++) {
  // Control characters other than tab and line ends stay out (they would not read back as text).
  if ((c < 0x20 && c !== 9 && c !== 10 && c !== 13 && !PDFDOC[c]) || c === 0x7f || c === 0x9f || c === 0xad) continue;
  PDFDOC_OUT.set(PDFDOC[c] ?? String.fromCharCode(c), c);
}

// ---- lexing ---------------------------------------------------------------------------------------

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1;

export const isWs = (c: number) => WS[c] === 1;
export const isDelim = (c: number) => DELIM[c] === 1;
const isRegular = (c: number) => !WS[c] && !DELIM[c];

/** End of the input or a token the parser could not use. */
export class ParseError extends Error {}

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export class Lexer {
  constructor(
    public buf: Buffer,
    public pos = 0,
    public end = buf.length,
  ) {}

  /** Past whitespace and comments. */
  skip() {
    const b = this.buf;
    while (this.pos < this.end) {
      const c = b[this.pos];
      if (WS[c]) this.pos++;
      else if (c === 0x25 /* % */) {
        while (this.pos < this.end && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  /** The next regular run of characters (a number, a keyword), without moving. */
  peekWord(): string {
    this.skip();
    let e = this.pos;
    while (e < this.end && isRegular(this.buf[e])) e++;
    return this.buf.toString('latin1', this.pos, e);
  }

  /** Reads one object (or an operator, or a closing bracket as an Op). `refs`: "1 0 R" reads as a reference. */
  read(refs = true): Obj {
    this.skip();
    const b = this.buf;
    if (this.pos >= this.end) throw new ParseError('Unexpected end of data');
    const c = b[this.pos];
    if (c === 0x2f /* / */) return this.name();
    if (c === 0x28 /* ( */) return this.literal();
    if (c === 0x3c /* < */) {
      if (b[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return this.dictBody(refs);
      }
      return this.hexString();
    }
    if (c === 0x5b /* [ */) {
      this.pos++;
      const arr: Obj[] = [];
      for (;;) {
        this.skip();
        if (this.pos >= this.end) return arr;
        if (b[this.pos] === 0x5d /* ] */) {
          this.pos++;
          return arr;
        }
        const v = this.read(refs);
        if (v instanceof Op) {
          // A keyword inside an array: broken files; it ends the array where it was.
          if (v.op === '>>' || v.op === 'endobj' || v.op === 'stream') return arr;
          continue;
        }
        arr.push(v);
      }
    }
    if (c === 0x5d || c === 0x3e || c === 0x7b || c === 0x7d || c === 0x29) {
      this.pos++;
      if (c === 0x3e && b[this.pos] === 0x3e) {
        this.pos++;
        return new Op('>>');
      }
      return new Op(String.fromCharCode(c));
    }
    // A number, a keyword, or a reference.
    const start = this.pos;
    while (this.pos < this.end && isRegular(b[this.pos])) this.pos++;
    const w = b.toString('latin1', start, this.pos);
    if (NUM_RE.test(w)) {
      const n = Number(w);
      if (refs && /^\d+$/.test(w)) {
        // "12 0 R"?
        const save = this.pos;
        this.skip();
        let e = this.pos;
        while (e < this.end && b[e] >= 0x30 && b[e] <= 0x39) e++;
        if (e > this.pos && e < this.end && !isRegular(b[e]) && e - this.pos <= 10) {
          const gen = Number(b.toString('latin1', this.pos, e));
          let r = e;
          while (r < this.end && WS[b[r]]) r++;
          if (b[r] === 0x52 /* R */ && (r + 1 >= this.end || !isRegular(b[r + 1]))) {
            this.pos = r + 1;
            return new Ref(n, gen);
          }
        }
        this.pos = save;
      }
      return n;
    }
    // Numbers some writers get wrong ("--5", "0.00-1", "4."): what parses of them, else 0.
    if (/^[+\-.\d]+$/.test(w)) {
      const m = /^[+-]?\d*\.?\d*/.exec(w.replace(/^([+-])[+-]+/, '$1'));
      const n = Number(m?.[0]);
      return Number.isFinite(n) ? n : 0;
    }
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null') return null;
    if (!w) {
      // A byte that starts nothing: step over it.
      this.pos++;
      return new Op('');
    }
    return new Op(w);
  }

  private name(): string {
    const b = this.buf;
    this.pos++;
    const out: number[] = [];
    while (this.pos < this.end && isRegular(b[this.pos])) {
      const c = b[this.pos++];
      if (c === 0x23 /* # */ && this.pos + 1 < this.end) {
        const h = parseInt(b.toString('latin1', this.pos, this.pos + 2), 16);
        if (!Number.isNaN(h)) {
          out.push(h);
          this.pos += 2;
          continue;
        }
      }
      out.push(c);
    }
    return Buffer.from(out).toString('latin1');
  }

  private literal(): Str {
    const b = this.buf;
    this.pos++;
    const out: number[] = [];
    let depth = 1;
    while (this.pos < this.end) {
      let c = b[this.pos++];
      if (c === 0x5c /* \ */) {
        if (this.pos >= this.end) break;
        c = b[this.pos++];
        switch (c) {
          case 0x6e:
            out.push(10);
            break; // n
          case 0x72:
            out.push(13);
            break; // r
          case 0x74:
            out.push(9);
            break; // t
          case 0x62:
            out.push(8);
            break; // b
          case 0x66:
            out.push(12);
            break; // f
          case 0x0d:
            if (b[this.pos] === 0x0a) this.pos++;
            break; // a line continued
          case 0x0a:
            break;
          default:
            if (c >= 0x30 && c <= 0x37) {
              let v = c - 0x30;
              for (let k = 0; k < 2 && this.pos < this.end && b[this.pos] >= 0x30 && b[this.pos] <= 0x37; k++) v = v * 8 + (b[this.pos++] - 0x30);
              out.push(v & 0xff);
            } else out.push(c);
        }
        continue;
      }
      if (c === 0x28) depth++;
      else if (c === 0x29 && --depth === 0) break;
      if (c === 0x0d) {
        // A line end in a string reads as a line feed, whatever it was.
        if (b[this.pos] === 0x0a) this.pos++;
        c = 0x0a;
      }
      out.push(c);
    }
    return new Str(Buffer.from(out));
  }

  private hexString(): Str {
    const b = this.buf;
    this.pos++;
    const out: number[] = [];
    let hi = -1;
    while (this.pos < this.end) {
      const c = b[this.pos++];
      if (c === 0x3e) break;
      const v = c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x41 && c <= 0x46 ? c - 55 : c >= 0x61 && c <= 0x66 ? c - 87 : -1;
      if (v < 0) continue;
      if (hi < 0) hi = v;
      else {
        out.push((hi << 4) | v);
        hi = -1;
      }
    }
    if (hi >= 0) out.push(hi << 4);
    return new Str(Buffer.from(out), true);
  }

  private dictBody(refs: boolean): Dict {
    const d = new Dict();
    for (;;) {
      this.skip();
      if (this.pos >= this.end) return d;
      const b = this.buf;
      if (b[this.pos] === 0x3e && b[this.pos + 1] === 0x3e) {
        this.pos += 2;
        return d;
      }
      const k = this.read(refs);
      if (k instanceof Op) {
        // A keyword where a key should be: the dictionary ended badly.
        if (k.op === 'endobj' || k.op === 'stream' || k.op === '>>') return d;
        continue;
      }
      if (typeof k !== 'string') continue;
      this.skip();
      if (b[this.pos] === 0x3e && b[this.pos + 1] === 0x3e) {
        // A key without a value.
        this.pos += 2;
        return d;
      }
      const v = this.read(refs);
      if (v instanceof Op) {
        if (v.op === '>>') return d;
        if (v.op === 'endobj' || v.op === 'stream') {
          this.pos -= v.op.length;
          return d;
        }
        continue;
      }
      // A null value is the same as no entry.
      if (v !== null) d.set(k, v);
    }
  }
}

/** The operators of a content stream with their operands, in order. Inline images come as one 'BI' op with the image. */
export interface ContentOp {
  op: string;
  args: Obj[];
  /** BI: the image's dictionary and data. */
  image?: { dict: Dict; data: Buffer };
}

/** Reads a content stream into its operators (an inline image's bytes skipped as a whole). Stops quietly at broken data. */
export function parseContent(data: Buffer, limit = 2_000_000): ContentOp[] {
  const lex = new Lexer(data);
  const ops: ContentOp[] = [];
  let args: Obj[] = [];
  while (ops.length < limit) {
    lex.skip();
    if (lex.pos >= lex.end) break;
    let v: Obj;
    try {
      v = lex.read(false);
    } catch {
      break;
    }
    if (!(v instanceof Op)) {
      args.push(v);
      if (args.length > 64) args = args.slice(-32);
      continue;
    }
    if (v.op === 'BI') {
      const img = inlineImage(lex);
      ops.push({ op: 'BI', args: [], image: img ?? undefined });
      args = [];
      if (!img) break;
      continue;
    }
    if (v.op === '' || v.op === ']' || v.op === ')' || v.op === '}' || v.op === '{' || v.op === '>>') {
      args = [];
      continue;
    }
    ops.push({ op: v.op, args });
    args = [];
  }
  return ops;
}

/** An inline image after BI: its dictionary up to ID, then its bytes up to EI. */
function inlineImage(lex: Lexer): { dict: Dict; data: Buffer } | null {
  const d = new Dict();
  for (;;) {
    lex.skip();
    if (lex.pos >= lex.end) return null;
    const k = lex.read(false);
    if (k instanceof Op) {
      if (k.op === 'ID') break;
      continue;
    }
    if (typeof k !== 'string') continue;
    const v = lex.read(false);
    if (v instanceof Op) {
      if (v.op === 'ID') break;
      continue;
    }
    d.set(k, v);
  }
  // One whitespace byte after ID, then the data. Its length is known for unfiltered images; else find EI followed by
  // whitespace and something that reads as an operator.
  const b = lex.buf;
  const start = lex.pos + 1;
  const filter = d.get('F') ?? d.get('Filter');
  if (filter === undefined || (Array.isArray(filter) && !filter.length)) {
    const w = Number(d.get('W') ?? d.get('Width'));
    const h = Number(d.get('H') ?? d.get('Height'));
    const bpc = Number(d.get('BPC') ?? d.get('BitsPerComponent') ?? 8);
    const im = d.get('IM') ?? d.get('ImageMask');
    const cs = d.get('CS') ?? d.get('ColorSpace');
    const comps = im === true ? 1 : cs === 'RGB' || cs === 'DeviceRGB' ? 3 : cs === 'CMYK' || cs === 'DeviceCMYK' ? 4 : 1;
    if (w > 0 && h > 0) {
      const len = Math.ceil((w * comps * (im === true ? 1 : bpc)) / 8) * h;
      let e = start + len;
      while (e < lex.end && WS[b[e]]) e++;
      if (b[e] === 0x45 && b[e + 1] === 0x49) {
        lex.pos = e + 2;
        return { dict: d, data: b.subarray(start, start + len) };
      }
    }
  }
  for (let i = start; i + 1 < lex.end; i++) {
    if (b[i] === 0x45 && b[i + 1] === 0x49 && (i === start || WS[b[i - 1]]) && (i + 2 >= lex.end || WS[b[i + 2]] || DELIM[b[i + 2]])) {
      // Data that happens to hold "EI": what follows must look like content (an operator or operand), not binary.
      let ok = true;
      for (let j = i + 2; j < Math.min(lex.end, i + 40); j++) {
        const c = b[j];
        if (c > 0x7e || (c < 0x20 && !WS[c])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      lex.pos = i + 2;
      let end = i;
      if (end > start && WS[b[end - 1]]) end--;
      return { dict: d, data: b.subarray(start, end) };
    }
  }
  return null;
}

// ---- writing --------------------------------------------------------------------------------------

/** A number as PDF writes it: never in exponent form, at most 5 decimals. */
export function num(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  let s = n.toFixed(5);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

export function nameOut(n: string): string {
  let s = '/';
  for (let i = 0; i < n.length; i++) {
    const c = n.charCodeAt(i) & 0xff;
    s += c < 0x21 || c > 0x7e || c === 0x23 || DELIM[c] ? `#${c.toString(16).padStart(2, '0')}` : String.fromCharCode(c);
  }
  return s;
}

function strOut(s: Str): string {
  const b = s.bytes;
  let printable = !s.hex;
  if (printable)
    for (const c of b)
      if (c < 0x20 || c > 0x7e) {
        printable = false;
        break;
      }
  if (!printable) return `<${b.toString('hex')}>`;
  return `(${b.toString('latin1').replace(/[\\()]/g, (m) => '\\' + m)})`;
}

/**
 * Serializes an object (streams with their data). `ref` maps a reference to what is written instead (a full rewrite
 * numbers objects anew).
 */
export function serialize(o: Obj, ref?: (r: Ref) => Ref | null): Buffer {
  const parts: Buffer[] = [];
  let line = '';
  const flush = () => {
    if (line) parts.push(Buffer.from(line, 'latin1'));
    line = '';
  };
  const put = (v: Obj) => {
    if (v === null || v === undefined) line += 'null';
    else if (typeof v === 'boolean') line += v ? 'true' : 'false';
    else if (typeof v === 'number') line += num(v);
    else if (typeof v === 'string') line += nameOut(v);
    else if (v instanceof Str) line += strOut(v);
    else if (v instanceof Ref) {
      const r = ref ? ref(v) : v;
      line += r ? `${r.num} ${r.gen} R` : 'null';
    } else if (Array.isArray(v)) {
      line += '[';
      v.forEach((x, i) => {
        if (i) line += ' ';
        put(x);
      });
      line += ']';
    } else if (v instanceof Stream) {
      v.dict.set('Length', v.raw.length);
      put(v.dict);
      line += '\nstream\n';
      flush();
      parts.push(v.raw);
      line += '\nendstream';
    } else if (v instanceof Dict) {
      line += '<<';
      for (const [k, x] of v) {
        if (x === null || x === undefined) continue;
        line += nameOut(k) + ' ';
        put(x);
        line += ' ';
      }
      line += '>>';
    } else if (v instanceof Op) line += v.op;
  };
  put(o);
  flush();
  return Buffer.concat(parts);
}

/** A deep copy (streams' bytes shared), references mapped by `ref` when given. */
export function clone(o: Obj, ref?: (r: Ref) => Obj): Obj {
  if (o instanceof Ref) return ref ? ref(o) : o;
  if (Array.isArray(o)) return o.map((x) => clone(x, ref));
  if (o instanceof Stream) return new Stream(clone(o.dict, ref) as Dict, o.raw);
  if (o instanceof Dict) {
    const d = new Dict();
    for (const [k, v] of o) d.set(k, clone(v, ref));
    return d;
  }
  if (o instanceof Str) return new Str(Buffer.from(o.bytes), o.hex);
  return o;
}
