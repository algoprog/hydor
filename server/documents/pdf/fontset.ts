// The fonts text is written into PDFs with, and their embedding. Latin, Greek and Cyrillic come from the font the
// app ships (Liberation Sans, with Helvetica's and Arial's widths, so forms that name Helvetica keep their look);
// what it lacks (Chinese, Japanese, Korean…) from a font on this computer that has the characters and allows
// embedding (fontconfig finds them on Linux; known files on macOS and Windows), else from Google Fonts, which sends a
// font of just those characters (Noto Sans SC, JP or KR), kept in the data folder. Every font goes in as a subset of
// the glyphs used, with a ToUnicode map, so every viewer shows the words and they can be found and copied.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { APP_ROOT, config } from '../../config.ts';
import { dict, type Obj, Ref, Stream, Str } from './objects.ts';
import { TrueType } from './truetype.ts';

export const SHIPPED_FONT = path.join(APP_ROOT, 'server', 'documents', 'pdf', 'fonts', 'LiberationSans-Regular.ttf');

let shipped: TrueType | null | undefined;
/** The app's own font (null if its file is missing). */
export function shippedFont(): TrueType | null {
  if (shipped === undefined) {
    try {
      shipped = TrueType.parse(fs.readFileSync(SHIPPED_FONT));
    } catch {
      shipped = null;
    }
  }
  return shipped;
}

/** The width of a character in one of the standard fonts a PDF names without giving widths, in thousandths. */
export function standardWidth(base: string, ch: string): number {
  if (/Courier|Mono/i.test(base)) return 600;
  const f = shippedFont();
  const cp = ch.codePointAt(0) ?? 32;
  if (f) {
    const g = f.glyph(cp);
    if (g) {
      const w = (f.advance(g) * 1000) / f.unitsPerEm;
      // Times is narrower than Helvetica, by about this much on average.
      return /Times|Serif|Roman/i.test(base) ? w * 0.9 : w;
    }
  }
  return cp === 32 ? 278 : 556;
}

// ---- finding fonts for characters ------------------------------------------------------------------

const isBlank = (cp: number) => cp <= 32 || cp === 0xa0 || (cp >= 0x2000 && cp <= 0x200f) || cp === 0x2028 || cp === 0x2029 || cp === 0x3000 || cp === 0xfeff;

/** Files on this computer that may hold Chinese, Japanese or Korean characters, by system (glyph-outline fonts only). */
function knownFiles(): string[] {
  if (process.platform === 'darwin')
    return [
      '/System/Library/Fonts/STHeiti Light.ttc',
      '/System/Library/Fonts/STHeiti Medium.ttc',
      '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
      '/Library/Fonts/Arial Unicode.ttf',
      '/System/Library/Fonts/PingFang.ttc',
      '/System/Library/Fonts/Supplemental/Songti.ttc',
      '/System/Library/Fonts/AppleSDGothicNeo.ttc',
      '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
      '/System/Library/Fonts/Supplemental/Arial.ttf',
    ];
  if (process.platform === 'win32') {
    const dir = path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts');
    return ['msyh.ttc', 'simsun.ttc', 'simhei.ttf', 'msjh.ttc', 'mingliu.ttc', 'malgun.ttf', 'YuGothR.ttc', 'meiryo.ttc', 'msgothic.ttc', 'arialuni.ttf', 'arial.ttf', 'segoeui.ttf'].map((f) => path.join(dir, f));
  }
  return [
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
    '/usr/share/fonts/truetype/arphic/uming.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  ];
}

/** Font files fontconfig says have a character (Linux and others with it), best matches first; `lang` narrows them. */
function fcFiles(cp: number, lang?: string): Promise<string[]> {
  return new Promise((resolve) =>
    execFile('fc-list', [`:charset=${cp.toString(16)}${lang ? `:lang=${lang}` : ''}`, 'file'], { timeout: 5000, maxBuffer: 4 << 20 }, (err, out) => {
      if (err) return resolve([]);
      const files = String(out)
        .split('\n')
        .map((l) => l.replace(/:\s*$/, '').trim())
        .filter((f) => /\.(ttf|ttc)$/i.test(f));
      // Regular weights first; sans before serif.
      const rank = (f: string) => (/(Bold|Black|Heavy|Light|Thin|Italic|Oblique)/i.test(path.basename(f)) ? 2 : 0) + (/(Serif|Song|Ming|uming)/i.test(f) ? 1 : 0);
      resolve([...new Set(files)].sort((a, b) => rank(a) - rank(b)));
    }),
  );
}

const loaded = new Map<string, TrueType[]>();
/** The embeddable outline fonts in a file (all of a collection's), kept for later calls. */
function fontsIn(file: string): TrueType[] {
  const hit = loaded.get(file);
  if (hit) return hit;
  let list: TrueType[] = [];
  try {
    const st = fs.statSync(file);
    if (st.size < 64 * 1024 * 1024) {
      const buf = fs.readFileSync(file);
      for (let i = 0; i < Math.min(TrueType.count(buf), 8); i++) {
        const f = TrueType.parse(buf, i);
        if (f && f.embeddable) list.push(f);
      }
    }
  } catch {
    list = [];
  }
  // Big files are kept for a few calls only.
  if (loaded.size > 6) loaded.delete(loaded.keys().next().value!);
  loaded.set(file, list);
  return list;
}

/** Noto's family for the script of these characters, as Google Fonts names it. */
function notoFamily(chars: string): string {
  if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(chars)) return 'Noto Sans JP';
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/.test(chars)) return 'Noto Sans KR';
  if (/[\u2e80-\u2fff\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]|[\u{20000}-\u{2fa1f}]/u.test(chars)) return 'Noto Sans SC';
  if (/[\u0590-\u05ff]/.test(chars)) return 'Noto Sans Hebrew';
  if (/[\u0e00-\u0e7f]/.test(chars)) return 'Noto Sans Thai';
  if (/[\u2190-\u2bff]/.test(chars)) return 'Noto Sans Symbols 2';
  return 'Noto Sans';
}

/** A font of just these characters from Google Fonts (kept in the data folder), or null offline. */
async function googleFont(chars: string): Promise<TrueType | null> {
  const family = notoFamily(chars);
  const dir = path.join(config.dataDir, 'pdf-fonts');
  const file = path.join(dir, `${crypto.createHash('sha256').update(`${family}\0${chars}`).digest('hex').slice(0, 24)}.ttf`);
  try {
    return TrueType.parse(fs.readFileSync(file));
  } catch {}
  try {
    // An agent name that is no browser's: Google then sends TrueType, which a PDF embeds as it is.
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&text=${encodeURIComponent(chars)}`, {
      headers: { 'user-agent': 'Hydor' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!css.ok) return null;
    const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/.exec(await css.text())?.[1];
    if (!url) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
    if (!r.ok) return null;
    const data = Buffer.from(await r.arrayBuffer());
    const f = TrueType.parse(data);
    if (!f) return null;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, data);
    return f;
  } catch {
    return null;
  }
}

export class MissingGlyphs extends Error {}

/**
 * The fonts that hold every character of `text`: the app's own first, then others for what it lacks. Throws, naming
 * the characters, when no font here or from Google has them.
 */
export async function fontsFor(text: string): Promise<TrueType[]> {
  const base = shippedFont();
  if (!base) throw new Error('The app’s own font is missing (server/documents/pdf/fonts): reinstall the app.');
  const fonts: TrueType[] = [base];
  const need = (list: TrueType[]) => {
    const out = new Set<number>();
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (!isBlank(cp) && !list.some((f) => f.glyph(cp))) out.add(cp);
    }
    return out;
  };
  let missing = need(fonts);
  if (!missing.size) return fonts;
  // This computer's fonts: fontconfig's answer for the first missing character, then the known files.
  const tried = new Set<string>();
  const tryFile = (file: string) => {
    if (tried.has(file) || !fs.existsSync(file)) return;
    tried.add(file);
    for (const f of fontsIn(file)) {
      if ([...missing].some((cp) => f.glyph(cp))) {
        fonts.push(f);
        missing = need(fonts);
        return;
      }
    }
  };
  // Chinese characters are shared with Japanese and Korean, drawn differently: a font of the text's language first.
  const lang = /[\u3040-\u30ff]/.test(text) ? 'ja' : /[\uac00-\ud7af]/.test(text) ? 'ko' : 'zh';
  for (let round = 0; round < 4 && missing.size; round++) {
    const first = missing.values().next().value!;
    const han = first >= 0x2e80 && first <= 0x9fff;
    for (const file of [...(han ? await fcFiles(first, lang) : []), ...(await fcFiles(first))]) {
      tryFile(file);
      if (!missing.has(first)) break;
    }
    if (missing.has(first)) break;
  }
  for (const file of knownFiles()) {
    if (!missing.size) break;
    tryFile(file);
  }
  // Google Fonts, a hundred characters a request.
  if (missing.size) {
    const chars = [...missing].map((c) => String.fromCodePoint(c));
    for (let i = 0; i < chars.length && missing.size; i += 100) {
      const f = await googleFont(chars.slice(i, i + 100).join(''));
      if (f) {
        fonts.push(f);
        missing = need(fonts);
      }
    }
  }
  if (missing.size) {
    const list = [...missing].slice(0, 12).map((c) => String.fromCodePoint(c));
    throw new MissingGlyphs(
      `No font on this computer has ${list.map((c) => `"${c}"`).join(', ')}${missing.size > 12 ? ' and others' : ''}, and none could be fetched (Google Fonts needs the internet). A TrueType font with them would do: on Debian or Ubuntu, sudo apt install fonts-wqy-zenhei for Chinese, Japanese and Korean.`,
    );
  }
  return fonts;
}

// ---- embedding -------------------------------------------------------------------------------------

/** Where fonts and other objects are added: an incremental update (PdfFile) or a new file (Rewriter). */
export interface Target {
  add(o: Obj): Ref;
  set(r: Ref, o: Obj): void;
}

/** One font embedded in one file, as a Type 0 font of the glyphs used, numbered as they are first used. */
export class Embedded {
  private gids = new Map<number, number>([[0, 0]]);
  private order: number[] = [];
  private text = new Map<number, string>();
  constructor(
    readonly tt: TrueType,
    readonly ref: Ref,
  ) {}

  /** A character's glyph in the subset (0 when the font lacks it). */
  private gid(ch: string): number {
    const cp = ch.codePointAt(0)!;
    const old = this.tt.glyph(isBlank(cp) ? 32 : cp);
    if (!old) return 0;
    let g = this.gids.get(old);
    if (g === undefined) {
      this.order.push(old);
      g = this.order.length;
      this.gids.set(old, g);
    }
    if (!this.text.has(old)) this.text.set(old, ch);
    return g;
  }

  /** The bytes that draw `s` (two per character) and its width in thousandths of the font size. */
  encode(s: string): { bytes: Buffer; width: number } {
    const chars = [...s];
    const bytes = Buffer.alloc(chars.length * 2);
    let width = 0;
    chars.forEach((ch, i) => {
      const g = this.gid(ch);
      bytes.writeUInt16BE(g, i * 2);
      width += this.width(ch);
    });
    return { bytes, width };
  }

  /** A character's width in thousandths of the font size. */
  width(ch: string): number {
    const cp = ch.codePointAt(0)!;
    const g = this.tt.glyph(isBlank(cp) ? 32 : cp);
    return (this.tt.advance(g) * 1000) / this.tt.unitsPerEm;
  }

  has(ch: string): boolean {
    const cp = ch.codePointAt(0)!;
    return isBlank(cp) || this.tt.glyph(cp) !== 0;
  }

  /** Writes the font: the Type 0 font at `ref`, its CID font, descriptor, subset program and ToUnicode map. */
  finish(t: Target) {
    const tt = this.tt;
    const unicodes = new Map<number, string>(this.text);
    const program = tt.subset(this.order, unicodes);
    const tag = crypto.createHash('md5').update(this.order.join(',')).update(tt.psName).digest().subarray(0, 6);
    const name = `${[...tag].map((b) => String.fromCharCode(65 + (b % 26))).join('')}+${tt.psName.replace(/[^A-Za-z0-9-]/g, '')}`;
    const k = 1000 / tt.unitsPerEm;
    const file = t.add(new Stream(dict({ Length1: program.length, Filter: 'FlateDecode' }), zlib.deflateSync(program)));
    const fd = t.add(
      dict({
        Type: 'FontDescriptor',
        FontName: name,
        Flags: 4 | (tt.fixedPitch ? 1 : 0) | (tt.italicAngle ? 64 : 0),
        FontBBox: tt.bbox.map((v) => Math.round(v * k)),
        ItalicAngle: tt.italicAngle,
        Ascent: Math.round(tt.ascent * k),
        Descent: Math.round(tt.descent * k),
        CapHeight: Math.round(tt.capHeight * k),
        StemV: 80,
        FontFile2: file,
      }),
    );
    const widths = [0, ...this.order].map((g) => Math.round(tt.advance(g) * k));
    const cid = t.add(
      dict({
        Type: 'Font',
        Subtype: 'CIDFontType2',
        BaseFont: name,
        CIDSystemInfo: dict({ Registry: new Str(Buffer.from('Adobe')), Ordering: new Str(Buffer.from('Identity')), Supplement: 0 }),
        FontDescriptor: fd,
        DW: 1000,
        W: [0, widths],
        CIDToGIDMap: 'Identity',
      }),
    );
    const pairs: string[] = [];
    this.order.forEach((old, i) => {
      const s = this.text.get(old) ?? '';
      const u = Buffer.from(s, 'utf16le');
      u.swap16();
      pairs.push(`<${(i + 1).toString(16).padStart(4, '0')}> <${u.toString('hex') || '0020'}>`);
    });
    let cmap =
      '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < pairs.length; i += 100) cmap += `${Math.min(100, pairs.length - i)} beginbfchar\n${pairs.slice(i, i + 100).join('\n')}\nendbfchar\n`;
    cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
    const tu = t.add(new Stream(dict({ Filter: 'FlateDecode' }), zlib.deflateSync(Buffer.from(cmap, 'latin1'))));
    t.set(this.ref, dict({ Type: 'Font', Subtype: 'Type0', BaseFont: name, Encoding: 'Identity-H', DescendantFonts: [cid], ToUnicode: tu }));
  }
}

/** A run of text in one font. */
export interface Run {
  font: Embedded;
  /** Its resource name in the content that draws it. */
  res: string;
  text: string;
  bytes: Buffer;
  /** In thousandths of the font size. */
  width: number;
}

/**
 * The fonts of one save: each font embedded once, whatever draws with it (pages' content, form fields'
 * appearances), under a resource name of its own.
 */
export class FontBox {
  private list: { font: Embedded; res: string }[] = [];
  // Names no earlier edit of the same page used (each save draws with its own fonts).
  private prefix = `H${crypto.randomBytes(2).toString('hex')}F`;
  constructor(
    private target: Target,
    private fonts: TrueType[],
  ) {}

  /** Adds fonts found later (for more text). */
  more(fonts: TrueType[]) {
    for (const f of fonts) if (!this.fonts.includes(f)) this.fonts.push(f);
  }

  private embedded(tt: TrueType): { font: Embedded; res: string } {
    let e = this.list.find((x) => x.font.tt === tt);
    if (!e) {
      e = { font: new Embedded(tt, this.target.add(null)), res: `${this.prefix}${this.list.length + 1}` };
      this.list.push(e);
    }
    return e;
  }

  /** `s` split into runs, each in the first font that has its characters. */
  runs(s: string): Run[] {
    const out: Run[] = [];
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      const tt = this.fonts.find((f) => isBlank(cp) || f.glyph(cp)) ?? this.fonts[0];
      const last = out[out.length - 1];
      // Spaces stay with the run they are in.
      if (last && (last.font.tt === tt || isBlank(cp))) {
        last.text += ch;
        continue;
      }
      const e = this.embedded(tt);
      out.push({ font: e.font, res: e.res, text: ch, bytes: Buffer.alloc(0), width: 0 });
    }
    for (const r of out) {
      const enc = r.font.encode(r.text);
      r.bytes = enc.bytes;
      r.width = enc.width;
    }
    return out;
  }

  /** The width of `s` at `size` points. */
  measure(s: string, size: number): number {
    let w = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      const tt = this.fonts.find((f) => isBlank(cp) || f.glyph(cp)) ?? this.fonts[0];
      const g = tt.glyph(isBlank(cp) ? 32 : cp);
      w += (tt.advance(g) * 1000) / tt.unitsPerEm;
    }
    return (w * size) / 1000;
  }

  /** The tallest ascent and lowest descent of the fonts (thousandths), for line heights. */
  metrics(): { ascent: number; descent: number } {
    let ascent = 0;
    let descent = 0;
    for (const f of this.fonts.slice(0, 1)) {
      ascent = Math.max(ascent, (f.ascent * 1000) / f.unitsPerEm);
      descent = Math.min(descent, (f.descent * 1000) / f.unitsPerEm);
    }
    return { ascent: ascent || 900, descent: descent || -210 };
  }

  /** The /Font entries of the resources for what was drawn. */
  resources(): Map<string, Ref> {
    return new Map(this.list.map((e) => [e.res, e.font.ref]));
  }

  finish() {
    for (const e of this.list) e.font.finish(this.target);
  }
}

/** Text in a content stream: the runs as hex strings with their fonts, ready for TJ-less drawing. */
export function showRuns(runs: Run[], size: number): string {
  return runs.map((r) => `/${r.res} ${size} Tf <${r.bytes.toString('hex')}> Tj`).join(' ');
}
