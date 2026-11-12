// What File → New offers, as plain data and maths (no screen): the usual sizes of a blank picture (a square post, a
// story, HD, an A4 page at 300 dots an inch, or any size), how a size is kept within what the editor can hold, and what
// the background of a new picture can be.
import { LIMITS } from '@shared/mediaedit';

export interface NewPreset {
  id: string;
  label: string;
  /** In pixels; none for Custom (the size typed in is kept). */
  w?: number;
  h?: number;
  /** A line for under its name: what it is for. */
  about: string;
}

export const NEW_PRESETS: NewPreset[] = [
  { id: 'square', label: 'Square post', w: 1080, h: 1080, about: '1080 × 1080' },
  { id: 'story', label: 'Instagram story', w: 1080, h: 1920, about: '1080 × 1920' },
  { id: 'hd', label: 'HD', w: 1920, h: 1080, about: '1920 × 1080' },
  { id: 'a4', label: 'A4 at 300 dpi', w: 2480, h: 3508, about: '2480 × 3508' },
  { id: 'custom', label: 'Custom size', about: 'Any size' },
];

/** What a new picture starts as: white, see-through or a colour. */
export type NewBackground = 'white' | 'transparent' | 'colour';

/** A size kept to what the editor holds (a side at most LIMITS.side, all at most LIMITS.pixels), whole pixels, at least 1. */
export function fitNewSize(w: number, h: number): { w: number; h: number; cut: boolean } {
  let W = Math.max(1, Math.round(Number.isFinite(w) ? w : 1));
  let H = Math.max(1, Math.round(Number.isFinite(h) ? h : 1));
  const k = Math.min(1, LIMITS.side / Math.max(W, H), Math.sqrt(LIMITS.pixels / (W * H)));
  const cut = k < 1;
  if (cut) {
    W = Math.max(1, Math.floor(W * k));
    H = Math.max(1, Math.floor(H * k));
  }
  return { w: W, h: H, cut };
}

/** The preset a size is (Custom when it is none of them). */
export function presetOf(w: number, h: number): NewPreset {
  return NEW_PRESETS.find((p) => p.w === w && p.h === h) ?? NEW_PRESETS[NEW_PRESETS.length - 1];
}

/** The picture's name: "Untitled 1080 × 1080.png". */
export const newPictureName = (w: number, h: number) => `Untitled ${w}×${h}.png`;

let made = 0;

/**
 * The address a blank picture is opened from (what the editor's tab holds as its source): "naget-new:1080x1920:ffffff:3",
 * its size, its colour (none: see-through) and a count, so two blank pictures of one size are two tabs.
 */
export function blankSrc(w: number, h: number, fill: string | null): string {
  return `naget-new:${w}x${h}:${fill ? fill.replace(/^#/, '') : 'none'}:${++made}`;
}

/** What a blank picture's address says: its size and colour (null: see-through), or null when it is not one. */
export function parseBlank(src: string): { w: number; h: number; fill: string | null } | null {
  const m = /^naget-new:(\d{1,5})x(\d{1,5}):([0-9a-f]{3,8}|none):\d+$/i.exec(src.trim());
  if (!m) return null;
  const fit = fitNewSize(Number(m[1]), Number(m[2]));
  return { w: fit.w, h: fit.h, fill: m[3] === 'none' ? null : `#${m[3]}` };
}
