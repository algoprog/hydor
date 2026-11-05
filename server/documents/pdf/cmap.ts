// CMaps: a font's ToUnicode map (character codes to the text they stand for) and the encoding CMaps of composite
// fonts (bytes to codes of one to four bytes, and codes to CIDs). Read from their PostScript-like text with the PDF
// lexer; ranges are kept as ranges, so a map of a whole script stays small.
import { glyphText } from './encodings.ts';
import { Lexer, Op, Str } from './objects.ts';

interface Range {
  lo: number;
  hi: number;
  bytes: number;
}

export class CMap {
  /** Byte lengths codes take, by their first bytes (codespace ranges). */
  codespace: Range[] = [];
  private uniOne = new Map<number, string>();
  private uniRanges: { lo: number; hi: number; start: number[] | null; list: string[] | null }[] = [];
  private cidOne = new Map<number, number>();
  private cidRanges: { lo: number; hi: number; cid: number }[] = [];
  /** Another CMap this one builds on (by name: a predefined one). */
  uses: string | null = null;

  static parse(data: Buffer): CMap {
    const m = new CMap();
    const lex = new Lexer(data);
    const vals: (Str | number | string | Str[])[] = [];
    let mode = '';
    for (let guard = 0; guard < 5_000_000; guard++) {
      lex.skip();
      if (lex.pos >= lex.end) break;
      let v;
      try {
        v = lex.read(false);
      } catch {
        break;
      }
      if (v instanceof Op) {
        const op = v.op;
        if (op.startsWith('begin')) {
          mode = op;
          vals.length = 0;
        } else if (op.startsWith('end') && mode) {
          m.take(mode, vals);
          mode = '';
          vals.length = 0;
        } else if (op === 'usecmap') {
          const n = vals[vals.length - 1];
          if (typeof n === 'string') m.uses = n;
          vals.length = 0;
        } else if (op === '[' || op === ']') {
          // Arrays are read whole by the lexer; a stray bracket is skipped.
        }
        continue;
      }
      if (v instanceof Str || typeof v === 'number' || typeof v === 'string') vals.push(v);
      else if (Array.isArray(v)) vals.push(v.filter((x): x is Str => x instanceof Str));
    }
    return m;
  }

  private take(mode: string, vals: (Str | number | string | Str[])[]) {
    const code = (s: unknown) => (s instanceof Str ? s.bytes.reduce((a, b) => a * 256 + b, 0) : typeof s === 'number' ? s : NaN);
    if (mode === 'begincodespacerange') {
      for (let i = 0; i + 1 < vals.length; i += 2) {
        const a = vals[i];
        const b = vals[i + 1];
        if (a instanceof Str && b instanceof Str) this.codespace.push({ lo: code(a), hi: code(b), bytes: Math.max(1, a.bytes.length) });
      }
    } else if (mode === 'beginbfchar') {
      for (let i = 0; i + 1 < vals.length; i += 2) {
        const a = vals[i];
        const b = vals[i + 1];
        if (a instanceof Str) this.uniOne.set(code(a), b instanceof Str ? utf16(b.bytes) : typeof b === 'string' ? (glyphText(b) ?? '') : '');
      }
    } else if (mode === 'beginbfrange') {
      for (let i = 0; i + 2 < vals.length; i += 3) {
        const lo = code(vals[i]);
        const hi = code(vals[i + 1]);
        const dst = vals[i + 2];
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || hi - lo > 0xffffff) continue;
        if (Array.isArray(dst)) this.uniRanges.push({ lo, hi, start: null, list: dst.map((s) => utf16(s.bytes)) });
        else if (dst instanceof Str) {
          const units: number[] = [];
          for (let k = 0; k + 1 < dst.bytes.length; k += 2) units.push(dst.bytes.readUInt16BE(k));
          if (dst.bytes.length === 1) units.push(dst.bytes[0]);
          this.uniRanges.push({ lo, hi, start: units, list: null });
        }
      }
    } else if (mode === 'begincidchar') {
      for (let i = 0; i + 1 < vals.length; i += 2) {
        const a = vals[i];
        const b = vals[i + 1];
        if (a instanceof Str && typeof b === 'number') this.cidOne.set(code(a), b);
      }
    } else if (mode === 'begincidrange') {
      for (let i = 0; i + 2 < vals.length; i += 3) {
        const lo = code(vals[i]);
        const hi = code(vals[i + 1]);
        const cid = vals[i + 2];
        if (Number.isFinite(lo) && Number.isFinite(hi) && typeof cid === 'number') this.cidRanges.push({ lo, hi, cid });
      }
    }
  }

  /** The text a code stands for, or undefined. */
  unicode(c: number): string | undefined {
    const one = this.uniOne.get(c);
    if (one !== undefined) return one;
    for (const r of this.uniRanges) {
      if (c < r.lo || c > r.hi) continue;
      if (r.list) return r.list[c - r.lo];
      if (r.start) {
        const u = [...r.start];
        u[u.length - 1] += c - r.lo;
        return String.fromCharCode(...u);
      }
    }
    return undefined;
  }

  get hasUnicode(): boolean {
    return this.uniOne.size > 0 || this.uniRanges.length > 0;
  }

  cid(c: number): number | undefined {
    const one = this.cidOne.get(c);
    if (one !== undefined) return one;
    for (const r of this.cidRanges) if (c >= r.lo && c <= r.hi) return r.cid + c - r.lo;
    return undefined;
  }

  /**
   * The codes in `bytes`, with how many bytes each took: by the codespace ranges (the shortest range that holds the
   * bytes read so far), else `fallback` bytes at a time.
   */
  codes(bytes: Buffer, fallback = 2): { code: number; len: number }[] {
    const out: { code: number; len: number }[] = [];
    for (let i = 0; i < bytes.length;) {
      let len = 0;
      let code = 0;
      if (this.codespace.length) {
        let c = 0;
        for (let n = 1; n <= 4 && i + n <= bytes.length; n++) {
          c = c * 256 + bytes[i + n - 1];
          if (this.codespace.some((r) => r.bytes === n && c >= r.lo && c <= r.hi)) {
            len = n;
            code = c;
            break;
          }
        }
        if (!len) {
          // Bytes no range holds: as many as the shortest range takes.
          len = Math.min(...this.codespace.map((r) => r.bytes));
          code = 0;
          for (let k = 0; k < len && i + k < bytes.length; k++) code = code * 256 + bytes[i + k];
        }
      } else {
        len = Math.min(fallback, bytes.length - i);
        for (let k = 0; k < len; k++) code = code * 256 + bytes[i + k];
      }
      out.push({ code, len });
      i += len;
    }
    return out;
  }
}

/** UTF-16BE bytes as text (a lone byte as itself). */
function utf16(b: Buffer): string {
  if (b.length === 1) return String.fromCharCode(b[0]);
  let s = '';
  for (let k = 0; k + 1 < b.length; k += 2) s += String.fromCharCode(b.readUInt16BE(k));
  return s;
}
