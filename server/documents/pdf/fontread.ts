// A PDF font as text extraction needs it: which bytes make each character code, the text each code stands for, and
// how wide each is. Simple fonts (Type 1, TrueType, Type 3) by their ToUnicode map, else their encoding and its
// Differences read as glyph names (or the built-in encoding of an embedded Type 1 font); composite fonts by their
// encoding CMap (Identity, the Unicode ones, the legacy Chinese, Japanese and Korean ones, or one embedded) and
// ToUnicode, else by their embedded TrueType font's own character map read backwards. Best effort: a font that
// keeps its meaning to itself reads as its codes.
import { CMap } from './cmap.ts';
import { baseEncoding, glyphText } from './encodings.ts';
import type { PdfFile } from './file.ts';
import { standardWidth } from './fontset.ts';
import { Dict, isDict, isStream, type Obj, Ref } from './objects.ts';
import type { Matrix } from './pages.ts';
import { TrueType } from './truetype.ts';

export interface Char {
  code: number;
  /** The bytes it took. */
  len: number;
  text: string;
  /** Its advance in thousandths of the font size. */
  w: number;
}

export interface FontInfo {
  /** Above and below the baseline, in thousandths of the font size (descent negative). */
  ascent: number;
  descent: number;
  /** Type 3 fonts: glyph space to text space. */
  matrix: Matrix | null;
  decode(b: Buffer): Char[];
}

const cache = new WeakMap<PdfFile, Map<string, FontInfo>>();

/** The font a /Font resource names, read once per file. */
export function fontInfo(pdf: PdfFile, o: Obj): FontInfo {
  let m = cache.get(pdf);
  if (!m) cache.set(pdf, (m = new Map()));
  const key = o instanceof Ref ? o.key : null;
  if (key && m.has(key)) return m.get(key)!;
  const d = pdf.dictOf(o);
  let f: FontInfo;
  try {
    f = d ? readFont(pdf, d) : fallbackFont();
  } catch {
    f = fallbackFont();
  }
  if (key) m.set(key, f);
  return f;
}

function fallbackFont(): FontInfo {
  return { ascent: 800, descent: -200, matrix: null, decode: (b) => [...b].map((c) => ({ code: c, len: 1, text: String.fromCharCode(c), w: 500 })) };
}

const baseName = (n: Obj) => (typeof n === 'string' ? n.replace(/^[A-Z]{6}\+/, '') : '');

function metrics(pdf: PdfFile, fd: Dict | null, bbox?: number[]): { ascent: number; descent: number } {
  let ascent = pdf.numOf(fd?.get('Ascent'), 0);
  let descent = pdf.numOf(fd?.get('Descent'), 0);
  if (!ascent && bbox) ascent = bbox[3];
  if (!descent && bbox) descent = bbox[1];
  // Missing or absurd values: what most fonts have.
  if (!(ascent > 300 && ascent < 1500)) ascent = 800;
  if (!(descent < 0 && descent > -600)) descent = -200;
  return { ascent, descent };
}

function readFont(pdf: PdfFile, d: Dict): FontInfo {
  const sub = d.get('Subtype');
  const toUni = pdf.resolve(d.get('ToUnicode'));
  const tu = isStream(toUni) ? CMap.parse(pdf.streamData(toUni)) : null;
  if (sub === 'Type0') return readType0(pdf, d, tu?.hasUnicode ? tu : null);
  return readSimple(pdf, d, tu?.hasUnicode ? tu : null);
}

function readSimple(pdf: PdfFile, d: Dict, tu: CMap | null): FontInfo {
  const sub = d.get('Subtype');
  const name = baseName(pdf.resolve(d.get('BaseFont')));
  const fd = pdf.dictOf(d.get('FontDescriptor'));
  const flags = pdf.numOf(fd?.get('Flags'), 0);
  const symbolic = (flags & 4) !== 0 && (flags & 32) === 0;
  const enc = pdf.resolve(d.get('Encoding'));
  let base = 'StandardEncoding';
  if (/Symbol/i.test(name) && !/Symbolic/i.test(name)) base = 'Symbol';
  else if (/Dingbats/i.test(name)) base = 'ZapfDingbats';
  else if (sub === 'TrueType') base = 'WinAnsiEncoding';
  let builtIn: Map<number, string> | null = null;
  if (typeof enc === 'string') base = enc;
  else if (isDict(enc) && typeof pdf.resolve(enc.get('BaseEncoding')) === 'string') base = pdf.resolve(enc.get('BaseEncoding')) as string;
  else if (!enc && sub !== 'TrueType' && sub !== 'Type3') builtIn = type1Encoding(pdf, fd);
  const table = baseEncoding(base);
  const names = new Map<number, string>(builtIn ?? []);
  if (isDict(enc)) {
    let code = 0;
    for (const x of pdf.arrayOf(enc.get('Differences'))) {
      const v = pdf.resolve(x);
      if (typeof v === 'number') code = v;
      else if (typeof v === 'string') names.set(code++, v);
    }
  }
  // An embedded TrueType font with its own character map: a symbolic one's codes read through it.
  let ttUni: Map<number, string> | null = null;
  if (symbolic && sub === 'TrueType' && !tu && !names.size) ttUni = trueTypeCodes(pdf, fd);
  const first = pdf.numOf(d.get('FirstChar'), 0);
  const widths = pdf.arrayOf(d.get('Widths')).map((x) => pdf.numOf(x, NaN));
  const missing = pdf.numOf(fd?.get('MissingWidth'), NaN);
  let matrix: Matrix | null = null;
  let scale = 1;
  if (sub === 'Type3') {
    const fm = pdf.arrayOf(d.get('FontMatrix')).map((x) => pdf.numOf(x, 0));
    matrix = fm.length === 6 ? (fm as Matrix) : [0.001, 0, 0, 0.001, 0, 0];
    scale = matrix[0] * 1000;
  }
  const bbox = pdf.arrayOf(fd?.get('FontBBox') ?? d.get('FontBBox')).map((x) => pdf.numOf(x, 0));
  const m = metrics(pdf, fd, bbox.length === 4 ? bbox.map((v) => v * (sub === 'Type3' ? Math.abs(matrix![3]) * 1000 : 1)) : undefined);
  const textOf = (c: number): string => {
    const t = tu?.unicode(c);
    if (t !== undefined) return t;
    const n = names.get(c);
    if (n !== undefined) {
      const g = glyphText(n);
      if (g !== undefined) return g;
    }
    const u = ttUni?.get(c);
    if (u !== undefined) return u;
    return table[c] ?? (c >= 32 ? String.fromCharCode(c) : '');
  };
  const widthOf = (c: number): number => {
    const w = widths[c - first];
    if (Number.isFinite(w)) return w * scale;
    if (Number.isFinite(missing) && missing > 0) return missing * scale;
    return standardWidth(name, table[c] ?? String.fromCharCode(c));
  };
  return {
    ...m,
    matrix,
    decode: (b) => {
      const out: Char[] = [];
      for (const c of b) out.push({ code: c, len: 1, text: textOf(c), w: widthOf(c) });
      return out;
    },
  };
}

/** The encoding written inside an embedded Type 1 font ("dup 65 /A put"), which it uses when the PDF names none. */
function type1Encoding(pdf: PdfFile, fd: Dict | null): Map<number, string> | null {
  const ff = pdf.resolve(fd?.get('FontFile'));
  if (!isStream(ff)) return null;
  const len1 = pdf.numOf(ff.dict.get('Length1'), 0);
  const data = pdf.streamData(ff);
  const clear = data.subarray(0, len1 > 0 ? Math.min(len1, data.length) : Math.min(data.length, 65536)).toString('latin1');
  if (/\/Encoding\s+StandardEncoding\s+def/.test(clear)) return null;
  const out = new Map<number, string>();
  const re = /dup\s+(\d+)\s*\/([^\s/]+)\s+put/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clear))) out.set(Number(m[1]), m[2]);
  return out.size ? out : null;
}

/** A symbolic TrueType font's codes as the text its character map gives them (U+F0xx codes read as their byte). */
function trueTypeCodes(pdf: PdfFile, fd: Dict | null): Map<number, string> | null {
  const ff = pdf.resolve(fd?.get('FontFile2'));
  if (!isStream(ff)) return null;
  const tt = TrueType.parse(pdf.streamData(ff));
  if (!tt) return null;
  const out = new Map<number, string>();
  for (const [cp] of tt.entries()) if (cp < 256) out.set(cp, String.fromCharCode(cp));
  return out.size ? out : null;
}

// Legacy CMaps of Chinese, Japanese and Korean fonts, read through the character set they encode.
const LEGACY: [RegExp, string][] = [
  [/^(GBK|GBK2K|GBKp|GBpc|GB)-EUC|^GBT-EUC|^GBK2K/, 'gb18030'],
  [/^(B5pc|ETen-B5|HKscs-B5|ETenms-B5|B5)/, 'big5'],
  [/RKSJ/, 'shift_jis'],
  [/^(EUC|H$|V$)/, 'euc-jp'],
  [/^KSC/, 'euc-kr'],
];

function readType0(pdf: PdfFile, d: Dict, tu: CMap | null): FontInfo {
  const desc = pdf.dictOf(pdf.arrayOf(d.get('DescendantFonts'))[0]);
  const fd = pdf.dictOf(desc?.get('FontDescriptor'));
  const enc = pdf.resolve(d.get('Encoding'));
  let cmap: CMap | null = null;
  let encName = '';
  if (typeof enc === 'string') encName = enc;
  else if (isStream(enc)) {
    cmap = CMap.parse(pdf.streamData(enc));
    if (cmap.uses) encName = cmap.uses;
  }
  const identity = /^Identity-[HV]$/.test(encName) || (!encName && !cmap);
  const ucs2 = /^Uni.*-(UCS2|UTF16)-[HV]$/.test(encName);
  const utf16 = /UTF16/.test(encName);
  const legacy = LEGACY.find(([re]) => re.test(encName))?.[1];
  const dec = legacy ? new TextDecoder(legacy) : null;
  // CIDs → widths.
  const dw = pdf.numOf(desc?.get('DW'), 1000);
  const W = pdf.arrayOf(desc?.get('W'));
  const single = new Map<number, number>();
  const spans: [number, number, number][] = [];
  for (let i = 0; i < W.length;) {
    const a = pdf.numOf(W[i], NaN);
    const b = pdf.resolve(W[i + 1]);
    if (Array.isArray(b)) {
      b.forEach((x, k) => single.set(a + k, pdf.numOf(x, dw)));
      i += 2;
    } else {
      const c = pdf.numOf(W[i + 2], dw);
      if (Number.isFinite(a) && typeof b === 'number') spans.push([a, b, c]);
      i += 3;
    }
    if (i > 200_000) break;
  }
  const widthOf = (cid: number) => {
    const w = single.get(cid);
    if (w !== undefined) return w;
    for (const [a, b, c] of spans) if (cid >= a && cid <= b) return c;
    return dw;
  };
  // Without a ToUnicode map, an embedded TrueType font's own character map tells what its glyphs are.
  let byGlyph: Map<number, string> | null = null;
  let cidToGid: Buffer | null = null;
  const lazyGlyphs = () => {
    if (byGlyph) return byGlyph;
    byGlyph = new Map();
    const ff = pdf.resolve(fd?.get('FontFile2'));
    if (isStream(ff)) {
      const tt = TrueType.parse(pdf.streamData(ff));
      if (tt) for (const [cp, g] of tt.entries()) if (!byGlyph.has(g)) byGlyph.set(g, String.fromCodePoint(cp));
    }
    const map = pdf.resolve(desc?.get('CIDToGIDMap'));
    if (isStream(map)) cidToGid = pdf.streamData(map);
    return byGlyph;
  };
  const m = metrics(
    pdf,
    fd,
    pdf.arrayOf(fd?.get('FontBBox')).map((x) => pdf.numOf(x, 0)),
  );
  return {
    ...m,
    matrix: null,
    decode: (b) => {
      const out: Char[] = [];
      const codes = cmap && cmap.codespace.length ? cmap.codes(b) : legacy ? legacyCodes(b, legacy) : utf16 ? utf16Codes(b) : ((tu?.codespace.length ? tu : null)?.codes(b) ?? new CMap().codes(b, 2));
      for (const { code, len } of codes) {
        const cid = identity || ucs2 ? code : (cmap?.cid(code) ?? code);
        let text = tu?.unicode(code);
        if (text === undefined) {
          if (ucs2) text = len === 4 ? String.fromCharCode(code >>> 16, code & 0xffff) : String.fromCharCode(code);
          else if (dec) text = dec.decode(Uint8Array.from(bytesOf(code, len)));
          else if (identity) {
            const g = lazyGlyphs();
            const gid = cidToGid && cid * 2 + 1 < (cidToGid as Buffer).length ? (cidToGid as Buffer).readUInt16BE(cid * 2) : cid;
            text = g.get(gid) ?? '';
          } else text = '';
        }
        out.push({ code, len, text, w: widthOf(cid) });
      }
      return out;
    },
  };
}

function bytesOf(code: number, len: number): number[] {
  const out: number[] = [];
  for (let i = len - 1; i >= 0; i--) out.push((code >>> (8 * i)) & 0xff);
  return out;
}

/** Codes of a legacy double-byte encoding: a lead byte starts two bytes. */
function legacyCodes(b: Buffer, charset: string): { code: number; len: number }[] {
  const out: { code: number; len: number }[] = [];
  for (let i = 0; i < b.length;) {
    const c = b[i];
    const two = charset === 'shift_jis' ? (c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xfc) : c >= 0x81 && c <= 0xfe;
    if (two && i + 1 < b.length) {
      out.push({ code: c * 256 + b[i + 1], len: 2 });
      i += 2;
    } else {
      out.push({ code: c, len: 1 });
      i++;
    }
  }
  return out;
}

/** UTF-16 codes: two bytes, four for a surrogate pair. */
function utf16Codes(b: Buffer): { code: number; len: number }[] {
  const out: { code: number; len: number }[] = [];
  for (let i = 0; i + 1 < b.length;) {
    const u = b.readUInt16BE(i);
    if (u >= 0xd800 && u <= 0xdbff && i + 3 < b.length) {
      out.push({ code: u * 65536 + b.readUInt16BE(i + 2), len: 4 });
      i += 4;
    } else {
      out.push({ code: u, len: 2 });
      i += 2;
    }
  }
  return out;
}
