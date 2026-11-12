// The number on the app's taskbar button on Windows (the badge the desktop app puts over its icon), drawn as pixels for
// nativeImage.createFromBitmap, so no picture files ship for it. Plain Node: it does not load Electron.
'use strict';

const RED = [229, 72, 77];
const FONT = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '..#', '..#', '..#'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'],
};

/** The text drawn for a count: '' for none, '1' to '9', and '9+' from 10 up. */
function badgeText(count) {
  if (!Number.isFinite(count) || count < 1) return '';
  return count >= 10 ? '9+' : String(Math.floor(count));
}

/** Whether the text's pixel (cx, cy) inside its block is set: the font's '#' pixels, each one a s×s block, 3 columns and a gap. */
function glyphOn(chars, s, cx, cy) {
  if (cx < 0 || cy < 0 || cy >= 5 * s) return false;
  const col = Math.floor(cx / s);
  const ci = Math.floor(col / 4);
  if (ci >= chars.length || col % 4 === 3) return false;
  return FONT[chars[ci]][Math.floor(cy / s)][col % 4] === '#';
}

/** The badge for a count as { width, height, data }: BGRA pixels, premultiplied, row by row from the top-left; null for no count. */
function badgeBitmap(count, size = 32) {
  const text = badgeText(count);
  if (!text) return null;
  const chars = [...text];
  const s = chars.length === 1 ? Math.max(1, Math.floor((size * 0.65) / 5)) : Math.max(1, Math.floor((size * 0.7) / 7));
  const width = (4 * chars.length - 1) * s;
  const left = Math.floor((size - width) / 2);
  const top = Math.floor((size - 5 * s) / 2);
  const radius = size / 2;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
      const cov = Math.min(1, Math.max(0, radius - d + 0.5));
      const lit = glyphOn(chars, s, x - left, y - top);
      const alpha = lit ? 255 : Math.round(255 * cov);
      const [r, g, b] = lit ? [255, 255, 255] : RED;
      const k = alpha / 255;
      data.set([Math.round(b * k), Math.round(g * k), Math.round(r * k), alpha], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

module.exports = { badgeBitmap, badgeText };
