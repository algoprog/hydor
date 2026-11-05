// Fonts for Word files. Word draws a document's words in its own fonts only where it has them: the app's fonts
// (Inter, Lora and the others it loads from Google) are on no Office computer, so an export carries the faces a
// document uses inside the file, as Word embeds fonts (each face's file obfuscated with a key of its own, ECMA-376
// 17.8.1). The faces come from Google once, as the static TrueType files it gives programs that are not browsers, and
// are kept here; only the fonts the app offers, from Google's two hosts. For every font a file names, Word is also told
// what it needs to find the closest one it has when it cannot use the file's (its PANOSE numbers, family, pitch, the
// scripts it covers, and an Office font as its other name), read from the font itself or, for Office's own fonts, as
// Word writes them. Spreadsheets cannot carry fonts: officeFont names the Office font closest to one of the app's.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FONTS } from '../../shared/slides.ts';
import { config } from '../config.ts';

/** A face a file uses: its font, bold, italic. */
export interface FontFace {
  name: string;
  b: boolean;
  i: boolean;
}

/** What Word is told of a font (fontTable.xml), and the metrics its lines are laid out with. */
export interface FontInfo {
  /** The family name inside the font (what Word knows it by once it is loaded). */
  family: string;
  /** Ten PANOSE numbers as twenty hex digits, or '' when not known. */
  panose: string;
  family2: 'roman' | 'swiss' | 'modern' | 'script' | 'decorative' | 'auto';
  pitch: 'fixed' | 'variable';
  /** The character set Word records (00 ANSI, 86 GB2312, 80 Shift-JIS). */
  charset: string;
  /** Unicode ranges and code pages it covers (OS/2 ulUnicodeRange1–4, ulCodePageRange1–2) as Word writes them, or null. */
  sig: [string, string, string, string, string, string] | null;
  /** Word's single line, as a multiple of the font's size. */
  line: number;
}

/** A font with the faces of it that a file carries. */
export interface EmbeddedFont {
  info: FontInfo;
  faces: { regular?: Buffer; bold?: Buffer; italic?: Buffer; boldItalic?: Buffer };
}

/**
 * The Office font closest to each of the app's (in its widths, and serif or not), as Word's other name for it (w:altName)
 * and what a spreadsheet's cells use: Excel cannot carry fonts in its files.
 */
const CLOSEST: Record<string, string> = {
  Inter: 'Arial',
  Roboto: 'Arial',
  'Open Sans': 'Arial',
  Lato: 'Calibri',
  Montserrat: 'Verdana',
  Poppins: 'Verdana',
  Nunito: 'Arial',
  'DM Sans': 'Arial',
  'Work Sans': 'Arial',
  'Space Grotesk': 'Arial',
  'IBM Plex Sans': 'Arial',
  Outfit: 'Arial',
  'Playfair Display': 'Georgia',
  Merriweather: 'Georgia',
  Lora: 'Georgia',
  Fraunces: 'Georgia',
  'DM Serif Display': 'Georgia',
  'Source Serif 4': 'Georgia',
  'JetBrains Mono': 'Consolas',
};

/** The Office font closest to a font of the app's, or the font itself (an Office font, or one the person has). */
export const officeFont = (name: string) => CLOSEST[FONTS.find((f) => f.name.toLowerCase() === name.toLowerCase())?.name ?? ''] ?? name;

/** An Office font's other name in a Word file: the Office font closest to it, for a font of the app's. */
export const altNameOf = (name: string) => CLOSEST[name];

// What Word writes for Office's own fonts (they come with Windows, macOS's Office or Office itself): PANOSE, family,
// pitch, character set, coverage, and the single line each lays out.
const office = (panose: string, family2: FontInfo['family2'], pitch: FontInfo['pitch'], sig: string, line: number, charset = '00'): Omit<FontInfo, 'family'> => ({
  panose,
  family2,
  pitch,
  charset,
  sig: sig.split(' ') as FontInfo['sig'],
  line,
});
const OFFICE: Record<string, Omit<FontInfo, 'family'>> = {
  Arial: office('020B0604020202020204', 'swiss', 'variable', 'E0002EFF C000785B 00000009 00000000 000001FF 00000000', 1.149),
  'Times New Roman': office('02020603050405020304', 'roman', 'variable', 'E0002EFF C000785B 00000009 00000000 000001FF 00000000', 1.149),
  'Courier New': office('02070309020205020404', 'modern', 'fixed', 'E0002EFF C0007843 00000009 00000000 000001FF 00000000', 1.133),
  Georgia: office('02040502050405020303', 'roman', 'variable', '00000287 00000000 00000000 00000000 0000009F 00000000', 1.136),
  Verdana: office('020B0604030504040204', 'swiss', 'variable', 'A00006FF 4000205B 00000010 00000000 0000019F 00000000', 1.215),
  Calibri: office('020F0502020204030204', 'swiss', 'variable', 'E4002EFF C200247B 00000009 00000000 000001FF 00000000', 1.221),
  Cambria: office('02040503050406030204', 'roman', 'variable', 'E00006FF 420024FF 02000000 00000000 0000019F 00000000', 1.172),
  'Cambria Math': office('02040503050406030204', 'roman', 'variable', 'E00006FF 420024FF 02000000 00000000 0000019F 00000000', 1.172),
  Consolas: office('020B0609020204030204', 'modern', 'fixed', 'E00006FF 0000FCFF 00000001 00000000 0000019F 00000000', 1.171),
  'Segoe UI Symbol': office('020B0502040204020203', 'swiss', 'variable', '800001E3 1200FFEF 00040000 04000000 00000001 00000000', 1.33),
  'Microsoft YaHei': office('020B0503020204020204', 'swiss', 'variable', '80000287 2ACF3C50 00000016 00000000 0004001F 00000000', 1.32, '86'),
};

/**
 * Word's single line for the app's fonts, as a multiple of their size (Google's static faces, measured: Windows' ascent
 * and descent and the leading beyond them). Browsers lay these fonts out with lines of 1.2 to 1.4; Word's are often far
 * taller (Merriweather's 1.73), so a document's lines are given to Word in points, not as multiples of these.
 */
const WORD_LINE: Record<string, number> = {
  Inter: 1.43,
  Roboto: 1.2,
  'Open Sans': 1.442,
  Lato: 1.2,
  Montserrat: 1.562,
  Poppins: 1.762,
  Nunito: 1.377,
  'DM Sans': 1.322,
  'Work Sans': 1.448,
  'Space Grotesk': 1.442,
  'IBM Plex Sans': 1.395,
  Outfit: 1.26,
  'Playfair Display': 1.41,
  Merriweather: 1.732,
  Lora: 1.5,
  Fraunces: 1.474,
  'DM Serif Display': 1.371,
  'Source Serif 4': 1.371,
  'JetBrains Mono': 1.32,
};

/** What Word is told of a font it may not have: from the font's own file when there is one, else as Word knows Office's, else what its kind says. */
export function fontInfo(name: string, file?: Buffer | null): FontInfo {
  const own = file ? ttfInfo(file) : null;
  if (own) return own;
  const known = Object.entries(OFFICE).find(([k]) => k.toLowerCase() === name.toLowerCase());
  if (known) return { family: known[0], ...known[1] };
  const app = FONTS.find((f) => f.name.toLowerCase() === name.toLowerCase());
  const css = app?.css ?? '';
  const family2 = /monospace/.test(css) ? 'modern' : /serif/.test(css.replace(/sans-serif/g, '')) ? 'roman' : 'swiss';
  return { family: app?.name ?? name, panose: '', family2, pitch: family2 === 'modern' ? 'fixed' : 'variable', charset: '00', sig: null, line: WORD_LINE[app?.name ?? ''] ?? 1.2 };
}

/** Word's single line for a font, as a multiple of its size (1.2 for one it does not know). */
export const wordLine = (name: string) => fontInfo(name).line;

// ---- reading a TrueType file ---------------------------------------------------------------------------------------

/** A font file's tables, by tag. */
function tables(b: Buffer): Map<string, { off: number; len: number }> | null {
  if (b.length < 12) return null;
  const tag = b.readUInt32BE(0);
  // TrueType (1.0 or 'true'); OpenType with CFF outlines ('OTTO') too.
  if (tag !== 0x00010000 && tag !== 0x74727565 && tag !== 0x4f54544f) return null;
  const n = b.readUInt16BE(4);
  if (12 + n * 16 > b.length) return null;
  const out = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    const off = b.readUInt32BE(at + 8);
    const len = b.readUInt32BE(at + 12);
    if (off + len <= b.length) out.set(b.toString('latin1', at, at + 4), { off, len });
  }
  return out;
}

/** The family name inside a font (Windows' English name, ID 1). */
function familyName(b: Buffer, t: { off: number; len: number }): string {
  const count = b.readUInt16BE(t.off + 2);
  const strings = t.off + b.readUInt16BE(t.off + 4);
  let mac = '';
  for (let i = 0; i < count; i++) {
    const r = t.off + 6 + i * 12;
    if (r + 12 > t.off + t.len) break;
    const [platform, encoding, lang, id, len, off] = [0, 2, 4, 6, 8, 10].map((k) => b.readUInt16BE(r + k));
    if (id !== 1) continue;
    const s = strings + off;
    if (s + len > b.length) continue;
    if (platform === 3 && (encoding === 1 || encoding === 0) && lang === 0x409) {
      const u = Buffer.from(b.subarray(s, s + len));
      u.swap16();
      return u.toString('utf16le');
    }
    if (platform === 1 && encoding === 0 && !mac) mac = b.toString('latin1', s, s + len);
  }
  return mac;
}

const hex8 = (n: number) => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');

/** What Word is told of a TrueType font, from its own tables; null when it is not one Word may embed (or not a font). */
export function ttfInfo(b: Buffer): FontInfo | null {
  try {
    const t = tables(b);
    const os2 = t?.get('OS/2');
    const head = t?.get('head');
    const hhea = t?.get('hhea');
    const post = t?.get('post');
    const name = t?.get('name');
    if (!t || !os2 || !head || !hhea || !name || os2.len < 78) return null;
    // Embedding allowed: not "restricted" (bit 1), nor "bitmaps only" (bit 9).
    const fsType = b.readUInt16BE(os2.off + 8);
    if (fsType & 0x0002 || fsType & 0x0200) return null;
    const upm = b.readUInt16BE(head.off + 18) || 1000;
    const winAscent = b.readUInt16BE(os2.off + 74);
    const winDescent = b.readUInt16BE(os2.off + 76);
    const ascender = b.readInt16BE(hhea.off + 4);
    const descender = b.readInt16BE(hhea.off + 6);
    const lineGap = b.readInt16BE(hhea.off + 8);
    // Word's line is Windows': the font's win ascent and descent, and the external leading hhea's gap adds beyond them.
    const external = Math.max(0, lineGap - (winAscent + winDescent - (ascender - descender)));
    const line = Math.round(((winAscent + winDescent + external) / upm) * 1000) / 1000;
    const panose = b
      .subarray(os2.off + 32, os2.off + 42)
      .toString('hex')
      .toUpperCase();
    const familyClass = b.readInt16BE(os2.off + 30) >> 8;
    const fixed = post ? b.readUInt32BE(post.off + 12) !== 0 : b[os2.off + 35] === 9;
    const serif = b[os2.off + 33];
    const family2: FontInfo['family2'] = fixed
      ? 'modern'
      : familyClass === 8 || (serif >= 11 && serif <= 13)
        ? 'swiss'
        : (familyClass >= 1 && familyClass <= 7) || (serif >= 2 && serif <= 10)
          ? 'roman'
          : familyClass === 10
            ? 'script'
            : familyClass === 12 || familyClass === 9
              ? 'decorative'
              : 'swiss';
    const sig: FontInfo['sig'] = [
      hex8(b.readUInt32BE(os2.off + 42)),
      hex8(b.readUInt32BE(os2.off + 46)),
      hex8(b.readUInt32BE(os2.off + 50)),
      hex8(b.readUInt32BE(os2.off + 54)),
      os2.len >= 86 ? hex8(b.readUInt32BE(os2.off + 78)) : '00000001',
      os2.len >= 86 ? hex8(b.readUInt32BE(os2.off + 82)) : '00000000',
    ];
    const family = familyName(b, name);
    if (!family) return null;
    return { family, panose: /^0+$/.test(panose) ? '' : panose, family2, pitch: fixed ? 'fixed' : 'variable', charset: '00', sig, line };
  } catch {
    return null;
  }
}

// ---- embedding ----------------------------------------------------------------------------------------------------

/** A key for one embedded face: a GUID, as Word writes them ({8-4-4-4-12}, capitals). */
export function fontKey(): string {
  const h = crypto.randomBytes(16).toString('hex').toUpperCase();
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}}`;
}

/**
 * A font file obfuscated as Word embeds it (ECMA-376 Part 1, 17.8.1): its first 32 bytes XORed with the key's 16 bytes,
 * taken from the last pair of the key's hex digits to the first, twice over. The same again undoes it.
 */
export function obfuscate(font: Buffer, key: string): Buffer {
  const digits = key.replace(/[^0-9A-Fa-f]/g, '');
  if (digits.length !== 32) throw new Error('A font key is a GUID');
  const k = Buffer.from(digits, 'hex').reverse();
  const out = Buffer.from(font);
  for (let i = 0; i < Math.min(32, out.length); i++) out[i] ^= k[i % 16];
  return out;
}

// ---- fetching faces ----------------------------------------------------------------------------------------------------

const DIR = path.join(config.dataDir, 'pages', 'fonts', 'ttf');
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);
// Not a browser: Google gives such programs each face as a TrueType file of its own (static, with all its characters).
const UA = 'Hydor (office files)';

/** When Google could not be reached, not before then again: a computer offline (or behind a wall that drops what it sends) makes its Word files at once, without fonts inside, instead of waiting on each font. */
let unreachableUntil = 0;

async function get(url: string, max: number): Promise<Buffer | null> {
  if (Date.now() < unreachableUntil) return null;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length <= max ? b : null;
  } catch {
    unreachableUntil = Date.now() + 5 * 60_000;
    return null;
  }
}

/** Google's TrueType files for a family's four faces it has (regular, bold, italic, bold italic), by face; kept for a month. */
async function faceUrls(name: string): Promise<Map<string, string>> {
  const file = path.join(DIR, `${hash(name)}.css`);
  let css: string | null = null;
  try {
    if (Date.now() - fs.statSync(file).mtimeMs < 30 * 86_400_000) css = fs.readFileSync(file, 'utf8');
  } catch {}
  if (!css) {
    const fam = encodeURIComponent(name).replace(/%20/g, '+');
    css = (await get(`https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,400;0,700;1,400;1,700`, 200_000))?.toString('utf8') ?? null;
    if (!css) return new Map();
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, css);
  }
  const out = new Map<string, string>();
  for (const block of css.split('@font-face').slice(1)) {
    const italic = /font-style:\s*italic/.test(block);
    const bold = /font-weight:\s*700/.test(block);
    const url = /url\((https:\/\/fonts\.gstatic\.com\/s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_\-.]+\.ttf)\)/.exec(block)?.[1];
    if (url && /font-weight:\s*(400|700)\b/.test(block)) out.set(`${bold ? 'b' : ''}${italic ? 'i' : ''}`, url);
  }
  return out;
}

/** One TrueType file of Google's, kept once fetched. */
async function faceFile(url: string): Promise<Buffer | null> {
  const file = path.join(DIR, `${hash(url)}.ttf`);
  try {
    return fs.readFileSync(file);
  } catch {}
  const data = await get(url, 12_000_000);
  if (!data || !ttfInfo(data)) return null;
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, data);
  return data;
}

/**
 * The faces a file uses of the app's fonts from Google, to embed: each font with the faces of it Google has (a face it
 * lacks is left out, and Word makes it from another, as a browser does), and what Word is told of it. Fonts that are
 * not Google's (Office's own, or a person's), and any that could not be fetched (offline), are not in it.
 */
export async function wordFonts(faces: FontFace[]): Promise<Map<string, EmbeddedFont>> {
  const out = new Map<string, EmbeddedFont>();
  const byFont = new Map<string, FontFace[]>();
  for (const f of faces) {
    const known = FONTS.find((x) => x.google && x.name.toLowerCase() === f.name.toLowerCase());
    if (!known) continue;
    byFont.set(known.name, [...(byFont.get(known.name) ?? []), f]);
  }
  for (const [name, list] of byFont) {
    const urls = await faceUrls(name);
    const font: EmbeddedFont = { info: fontInfo(name), faces: {} };
    for (const k of new Set(list.map((f) => `${f.b ? 'b' : ''}${f.i ? 'i' : ''}`))) {
      const url = urls.get(k);
      const data = url ? await faceFile(url) : null;
      if (!data) continue;
      const slot = k === 'bi' ? 'boldItalic' : k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'regular';
      font.faces[slot] = data;
    }
    const first = font.faces.regular ?? font.faces.bold ?? font.faces.italic ?? font.faces.boldItalic;
    if (!first) continue;
    font.info = fontInfo(name, first);
    out.set(name, font);
  }
  return out;
}
