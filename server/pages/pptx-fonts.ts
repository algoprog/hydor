// The fonts a deck's PowerPoint file carries, so it shows in the deck's own fonts on a computer that has none of them
// (Inter and the others the app serves come from Google, and no Office computer has them). PowerPoint reads a font
// kept inside a file as Embedded OpenType: the TrueType file behind a header that says what it is ([MS-OE376] 15.2.12,
// the W3C's EOT submission), one part per face (regular, bold, italic, bold italic), listed in the presentation's
// embeddedFontLst. Only the faces the deck's words use go in, whole (so the deck stays editable in them), fetched from
// Google as TrueType once and kept beside the web fonts (fonts.ts); offline, the file goes without them. What PowerPoint
// is told of every font besides its name (its PANOSE, pitch and family) lets a computer that cannot load it pick the
// closest one it has: a sans for a sans, a serif for a serif, a fixed pitch for code.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { everyEl, FONTS, fontName, footerOn, type Deck } from '../../shared/slides.ts';
import { config } from '../config.ts';

type Kind = 'sans' | 'serif' | 'mono';

/** Each font of the app's: its kind, and its PANOSE (the font's own where it has one that says something, else its kind's). */
const KINDS: Record<string, { kind: Kind; panose?: string }> = {
  Inter: { kind: 'sans' },
  Roboto: { kind: 'sans' },
  'Open Sans': { kind: 'sans', panose: '020B0606030504020204' },
  Lato: { kind: 'sans', panose: '020F0502020204030203' },
  Montserrat: { kind: 'sans' },
  Poppins: { kind: 'sans' },
  Nunito: { kind: 'sans' },
  'DM Sans': { kind: 'sans' },
  'Work Sans': { kind: 'sans' },
  'Space Grotesk': { kind: 'sans' },
  'IBM Plex Sans': { kind: 'sans', panose: '020B0503050203000203' },
  Outfit: { kind: 'sans' },
  'Playfair Display': { kind: 'serif' },
  Merriweather: { kind: 'serif' },
  Lora: { kind: 'serif' },
  Fraunces: { kind: 'serif' },
  'DM Serif Display': { kind: 'serif' },
  'Source Serif 4': { kind: 'serif', panose: '02040603050405020204' },
  'JetBrains Mono': { kind: 'mono' },
  Arial: { kind: 'sans', panose: '020B0604020202020204' },
  Georgia: { kind: 'serif', panose: '02040502050405020303' },
  'Times New Roman': { kind: 'serif', panose: '02020603050405020304' },
  'Courier New': { kind: 'mono', panose: '02070309020205020404' },
  'Cambria Math': { kind: 'serif', panose: '02040503050406030204' },
  Calibri: { kind: 'sans', panose: '020F0502020204030204' },
  'Calibri Light': { kind: 'sans', panose: '020F0302020204030204' },
};

/** A kind's PANOSE (Arial's, Georgia's, Courier New's) and its pitch and family as Windows names them (variable pitch, Swiss or Roman; fixed pitch, modern). */
const KIND: Record<Kind, { panose: string; pitchFamily: number }> = {
  sans: { panose: '020B0604020202020204', pitchFamily: 0x22 },
  serif: { panose: '02040502050405020303', pitchFamily: 0x12 },
  mono: { panose: '02070309020205020404', pitchFamily: 0x31 },
};

/** What PowerPoint is told of a font besides its name: ` panose="…" pitchFamily="…" charset="0"` (a name it does not know is taken for a sans). */
export function fontAttrs(name: string): string {
  const k = KINDS[name] ?? { kind: 'sans' as Kind };
  return ` panose="${k.panose ?? KIND[k.kind].panose}" pitchFamily="${KIND[k.kind].pitchFamily}" charset="0"`;
}

/** Whether a font is one no Office computer has (the app's from Google), which the file carries. */
export const carried = (name: string) => FONTS.some((f) => f.google && f.name === name);

export interface Face {
  family: string;
  bold: boolean;
  italic: boolean;
}

export const faceKey = (f: Face) => `${f.family}|${f.bold ? 1 : 0}|${f.italic ? 1 : 0}`;

/**
 * The faces of the app's fonts a deck's words show in, as its PowerPoint file draws them: each run's font, bold and
 * italic as it shows; bullets and numbers in their paragraph's font, upright; tables' words (their header bold),
 * charts' (their title bold), and the footer's.
 */
export function deckFaces(d: Deck): Face[] {
  const t = d.theme;
  const out = new Map<string, Face>();
  const add = (family: string, bold: boolean, italic: boolean) => {
    if (!carried(family)) return;
    const f = { family, bold, italic };
    out.set(faceKey(f), f);
  };
  d.slides.forEach((s, i) => {
    for (const e of everyEl(s.els)) {
      if (e.type === 'text' || e.type === 'shape') {
        const base = fontName(e.font, t, e.role);
        for (const p of e.paras) {
          const worded = p.runs.some((r) => r.t);
          if (worded && p.list) add(base, false, false);
          for (const r of p.runs) if (r.t) add(r.font ? fontName(r.font, t, e.role) : base, r.b ?? !!e.bold, r.i ?? !!e.italic);
        }
      } else if (e.type === 'table') {
        const f = fontName(e.font, t);
        e.rows.forEach((row, ri) => {
          if (row.some((c) => c)) add(f, ri === 0 && !!e.head, false);
        });
      } else if (e.type === 'chart') {
        const f = fontName(e.font, t);
        add(f, false, false);
        if (e.title) add(f, true, false);
      }
    }
    if (footerOn(d, i)) add(fontName('body', t), false, false);
  });
  return [...out.values()];
}

// ---- Embedded OpenType ----------------------------------------------------------------------------------------------

/** A TrueType or OpenType file's tables: tag → [offset, length]; null when it is no such file. */
function tables(b: Buffer): Map<string, [number, number]> | null {
  if (b.length < 12) return null;
  const tag = b.readUInt32BE(0);
  if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null;
  const n = b.readUInt16BE(4);
  if (12 + n * 16 > b.length) return null;
  const out = new Map<string, [number, number]>();
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    const off = b.readUInt32BE(at + 8);
    const len = b.readUInt32BE(at + 12);
    if (off + len > b.length) return null;
    out.set(b.toString('latin1', at, at + 4), [off, len]);
  }
  return out;
}

/** A name from a font's name table (Windows' English one, else any of Windows'), or ''. */
function nameOf(b: Buffer, t: Map<string, [number, number]>, id: number): string {
  const nt = t.get('name');
  if (!nt) return '';
  const [off] = nt;
  const count = b.readUInt16BE(off + 2);
  const strings = off + b.readUInt16BE(off + 4);
  let best: string | null = null;
  for (let i = 0; i < count; i++) {
    const r = off + 6 + i * 12;
    const [platform, encoding, lang, nid, len, at] = [0, 2, 4, 6, 8, 10].map((k) => b.readUInt16BE(r + k));
    if (nid !== id || platform !== 3 || (encoding !== 1 && encoding !== 0)) continue;
    const s = b.subarray(strings + at, strings + at + len);
    const text = Buffer.from(s).swap16().toString('utf16le');
    if (lang === 0x409) return text;
    best ??= text;
  }
  return best ?? '';
}

/** What a font says of itself: its family and style, and whether it may be embedded (its fsType allows it). */
export function fontInfo(ttf: Buffer): { family: string; style: string; weight: number; italic: boolean; embeddable: boolean } | null {
  const t = tables(ttf);
  const os2 = t?.get('OS/2');
  if (!t || !os2 || !t.get('head') || !t.get('name')) return null;
  const fsType = ttf.readUInt16BE(os2[0] + 8);
  // Restricted licence embedding (only bit 1), or bitmaps alone: not to be carried.
  const embeddable = (fsType & 0x000f) !== 0x0002 && !(fsType & 0x0200);
  // Italic as fonts say it: OS/2's ITALIC bit, or head's macStyle.
  const italic = !!(ttf.readUInt16BE(os2[0] + 62) & 1) || !!(ttf.readUInt16BE(t.get('head')![0] + 44) & 2);
  return { family: nameOf(ttf, t, 1), style: nameOf(ttf, t, 2), weight: ttf.readUInt16BE(os2[0] + 4), italic, embeddable };
}

/**
 * A TrueType file as Embedded OpenType, as PowerPoint keeps a font in a file: version 0x00020002's header (the font's
 * PANOSE, weight, style, embedding rights, Unicode and code page ranges and names, little-endian), then the font
 * itself, neither compressed nor obscured. Null for what is not a font that may be embedded.
 */
export function eotOf(ttf: Buffer): Buffer | null {
  const t = tables(ttf);
  const os2 = t?.get('OS/2');
  const head = t?.get('head');
  const info = fontInfo(ttf);
  if (!t || !os2 || !head || !info?.embeddable || !info.family) return null;
  const o = os2[0];
  // EOTSize and FontDataSize (filled in at the end), Version, Flags (0: whole, plain), the PANOSE, the charset
  // (DEFAULT_CHARSET), italic, weight, fsType, the magic number, the Unicode and code page ranges, head's checksum
  // adjustment; Reserved1–4 stay 0. 80 bytes: Padding1 comes with the family's name below.
  const fixed = Buffer.alloc(80);
  fixed.writeUInt32LE(0x00020002, 8);
  fixed.writeUInt32LE(0, 12);
  ttf.copy(fixed, 16, o + 32, o + 42);
  fixed.writeUInt8(1, 26);
  fixed.writeUInt8(info.italic ? 1 : 0, 27);
  fixed.writeUInt32LE(info.weight, 28);
  fixed.writeUInt16LE(ttf.readUInt16BE(o + 8), 32);
  fixed.writeUInt16LE(0x504c, 34);
  for (let i = 0; i < 4; i++) fixed.writeUInt32LE(ttf.readUInt32BE(o + 42 + i * 4), 36 + i * 4);
  if (ttf.readUInt16BE(o) >= 1 && os2[1] >= 86) for (let i = 0; i < 2; i++) fixed.writeUInt32LE(ttf.readUInt32BE(o + 78 + i * 4), 52 + i * 4);
  fixed.writeUInt32LE(ttf.readUInt32BE(head[0] + 8), 60);
  // Each name: the padding before it, its size in bytes, and it in UTF-16LE.
  const str = (s: string) => {
    const text = Buffer.from(s, 'utf16le');
    const b = Buffer.alloc(4 + text.length);
    b.writeUInt16LE(text.length, 2);
    text.copy(b, 4);
    return b;
  };
  // Version 2.1's root string (none: any document may use the font), then 2.2's: the root string's checksum (its bytes'
  // sum, 0, XOR 0x50475342), the EUDC code page, Padding6, no signature, and no EUDC font.
  const tail = Buffer.alloc(24);
  tail.writeUInt32LE(0x50475342, 4);
  const header = Buffer.concat([fixed, str(info.family), str(info.style), str(nameOf(ttf, t, 5)), str(nameOf(ttf, t, 4)), tail]);
  header.writeUInt32LE(header.length + ttf.length, 0);
  header.writeUInt32LE(ttf.length, 4);
  return Buffer.concat([header, ttf]);
}

// ---- the faces themselves, from Google --------------------------------------------------------------------------

const DIR = () => path.join(config.dataDir, 'pages', 'fonts', 'ttf');

async function get(url: string, max: number): Promise<Buffer | null> {
  try {
    // Google gives TrueType to a program that is not a browser it knows.
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: 'error' });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length <= max ? b : null;
  } catch {
    return null;
  }
}

/** Faces that could not be had lately (offline, or a font without that face): not asked for again for a while. */
const missed = new Map<string, number>();

/** A face of one of the app's fonts as TrueType, from Google once and kept; null offline, or when the font has no such face. */
export async function faceFile(f: Face): Promise<Buffer | null> {
  if (!carried(f.family)) return null;
  const weight = f.bold ? 700 : 400;
  const file = path.join(DIR(), `${crypto.createHash('sha256').update(faceKey(f)).digest('hex').slice(0, 24)}.ttf`);
  try {
    return fs.readFileSync(file);
  } catch {}
  if ((missed.get(faceKey(f)) ?? 0) > Date.now() - 10 * 60_000) return null;
  const got = await fetchFace(f, weight);
  if (!got) {
    missed.set(faceKey(f), Date.now());
    return null;
  }
  try {
    fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, got);
    fs.renameSync(tmp, file);
  } catch {}
  return got;
}

async function fetchFace(f: Face, weight: number): Promise<Buffer | null> {
  const css = await get(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:ital,wght@${f.italic ? 1 : 0},${weight}`, 200_000);
  const src = css ? /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[A-Za-z0-9_\-./]+\.ttf)\)\s*format\(['"]truetype['"]\)/.exec(css.toString('utf8'))?.[1] : undefined;
  if (!src) return null;
  const data = await get(src, 12_000_000);
  const info = data ? fontInfo(data) : null;
  // The face asked for, as Google names it (a font without italics gives its upright face for an italic one).
  return data && info && info.family === f.family && info.italic === f.italic && Math.abs(info.weight - weight) <= 50 ? data : null;
}

/**
 * The faces a deck shows its words in, as TrueType files by faceKey: those that could be had. A font without italics
 * carries its upright face for them (PowerPoint slants it, as the browser does).
 */
export async function deckFontFiles(d: Deck): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  const take = async (faces: Face[]) => {
    const got = await Promise.all(faces.map((f) => faceFile(f)));
    faces.forEach((f, i) => {
      if (got[i]) out.set(faceKey(f), got[i]!);
    });
    return faces.filter((_f, i) => !got[i]);
  };
  const missing = await take(deckFaces(d).slice(0, 24));
  const upright = missing.filter((f) => f.italic && !out.has(faceKey({ ...f, italic: false }))).map((f) => ({ ...f, italic: false }));
  if (upright.length) await take(upright);
  return out;
}
