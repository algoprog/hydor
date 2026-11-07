// How wide a diagram's words are, and where their lines break, the same in the editor, on the server and in every file
// a diagram is saved as: measured with Helvetica's own widths (which Arial and Liberation Sans share), scaled for the
// other fonts, rather than by a browser, so a shape's words break where they broke when it was drawn, wherever it is
// drawn again. Letters with accents are as wide as their letter; Chinese, Japanese and Korean as wide as they are tall.
import type { FontKind } from './diagram.ts';

// Helvetica's widths for the printable ASCII characters (space to ~), in thousandths of the font's size.
const REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Other fonts against Helvetica, on average. */
const SCALE: Record<FontKind, number> = { sans: 1, serif: 0.93, mono: 1, hand: 0.98 };

const CJK = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿︰-﹏＀-￯]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const GREEK_UPPER = /[Α-Ω]/;
const GREEK_LOWER = /[α-ωά-ώ]/;
const CYR_UPPER = /[А-Я]/;
const CYR_LOWER = /[а-я]/;

/** One character's width, in thousandths of the font's size. */
function charWidth(ch: string, bold: boolean, mono: boolean): number {
  const c = ch.codePointAt(0) ?? 32;
  if (CJK.test(ch)) return 1000;
  if (EMOJI.test(ch)) return 1100;
  if (mono) return 600;
  const table = bold ? BOLD : REG;
  if (c >= 32 && c <= 126) return table[c - 32];
  // A letter with an accent: as wide as its letter.
  const base = ch.normalize('NFD')[0];
  if (base !== ch && base) {
    const b = base.codePointAt(0) ?? 0;
    if (b >= 32 && b <= 126) return table[b - 32];
  }
  if (GREEK_UPPER.test(ch) || CYR_UPPER.test(ch)) return bold ? 740 : 700;
  if (GREEK_LOWER.test(ch) || CYR_LOWER.test(ch)) return bold ? 600 : 560;
  if (c === 0x2014) return 1000;
  if (c === 0x2013 || c === 0x2022) return 556;
  if (c === 0x2018 || c === 0x2019) return 222;
  if (c === 0x201c || c === 0x201d) return 333;
  if (c === 0x2026) return 1000;
  if (c === 0x00a0) return 278;
  if (c >= 0x2190 && c <= 0x21ff) return 1000;
  return bold ? 640 : 600;
}

export interface TextFont {
  font?: FontKind;
  size: number;
  bold?: boolean;
  italic?: boolean;
}

/** How wide a line of words is, in pixels. */
export function textWidth(text: string, f: TextFont): number {
  const mono = f.font === 'mono';
  let w = 0;
  for (const ch of text) w += charWidth(ch, !!f.bold, mono);
  return (w / 1000) * f.size * SCALE[f.font ?? 'sans'] * (f.italic && !mono ? 1.01 : 1);
}

/** The height of a line of words (the font's size and the room between lines). */
export const lineHeight = (size: number) => Math.round(size * 1.25 * 100) / 100;

/**
 * Words broken into lines no wider than `max`: at spaces (and after hyphens and slashes), and inside a word only when
 * it is wider than a line alone; the lines it was given stay lines. Chinese, Japanese and Korean break anywhere.
 */
export function wrapText(text: string, max: number, f: TextFont): string[] {
  const out: string[] = [];
  const room = Math.max(max, f.size);
  for (const para of text.split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    if (textWidth(para, f) <= room) {
      out.push(para);
      continue;
    }
    // Pieces a line may break after: words with their spaces, a hyphen or a slash, each CJK character on its own.
    const pieces = para.match(/[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]|[^\s\-/ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]*[\s\-/]+|[^\s\-/ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]+/g) ?? [para];
    let line = '';
    for (const piece of pieces) {
      const next = line + piece;
      if (textWidth(next.trimEnd(), f) <= room) {
        line = next;
        continue;
      }
      if (line.trim()) out.push(line.trimEnd());
      line = '';
      // A piece wider than a line alone is cut where it must be.
      let rest = piece;
      while (textWidth(rest.trimEnd(), f) > room) {
        let cut = 1;
        for (let i = 1; i <= rest.length; i++) {
          if (textWidth(rest.slice(0, i), f) > room) break;
          cut = i;
        }
        // Never between the halves of a pair of surrogates.
        if (/[\ud800-\udbff]/.test(rest[cut - 1] ?? '')) cut++;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line.trim() || !out.length) out.push(line.trimEnd());
  }
  return out;
}

/** The size a box needs for words to fit in it on lines no wider than `max`: their widest line and their height. */
export function textSize(text: string, max: number, f: TextFont): { w: number; h: number; lines: string[] } {
  const lines = wrapText(text, max, f);
  const w = lines.reduce((m, l) => Math.max(m, textWidth(l, f)), 0);
  return { w, h: lines.length * lineHeight(f.size), lines };
}
