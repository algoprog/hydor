// What a design's Add panel puts on an artboard (the HTML of its elements, shared/design-templates.ts draws them as the
// templates do), the looks the inspector gives words and pictures (text effects, filters), the artboard's backgrounds,
// and the design editor's own words in the app's language.
import { qrCode, qrSvg } from '@shared/qr';
import type { IconNode } from '@shared/slides';
import { mix, type Palette } from '@shared/design';
import { fontStack } from '@shared/design-fonts';
import { tBox, tLine, tPic, tShape, tText } from '@shared/design-templates';
import { tr, trIn } from '../../../i18n/runtime';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The design's look as the Add panel uses it: its fonts and colours (the brand's, or what the design uses). */
export interface Look {
  head: string;
  body: string;
  ink: string;
  accent: string;
  accent2: string;
  soft: string;
}

export const DEFAULT_LOOK: Look = { head: 'Montserrat', body: 'Inter', ink: '#1d1b17', accent: '#e4572e', accent2: '#2a9d8f', soft: '#efe9df' };

/** Words to add, sized for the artboard (its width `W`). */
export function textHtml(kind: 'heading' | 'subheading' | 'body' | 'small', W: number, look: Look): string {
  const s = Math.max(240, W);
  if (kind === 'heading') return tText(tr('Add a heading'), { x: 0, y: 0, w: s * 0.7, size: s * 0.075, font: look.head, weight: 800, color: look.ink, lh: 1.05 });
  if (kind === 'subheading') return tText(tr('Add a subheading'), { x: 0, y: 0, w: s * 0.6, size: s * 0.042, font: look.body, weight: 600, color: look.ink, lh: 1.2 });
  if (kind === 'small') return tText(tr('Add a little text'), { x: 0, y: 0, w: s * 0.4, size: s * 0.02, font: look.body, weight: 500, color: look.ink, lh: 1.35, ls: 0.06, upper: true });
  return tText(tr('Add a little bit of body text'), { x: 0, y: 0, w: s * 0.5, size: s * 0.026, font: look.body, color: look.ink, lh: 1.45 });
}

/** A heading with a line under it, in a pair of fonts. */
export function pairHtml(p: { head: string; body: string; weight: number; upper?: boolean }, W: number, look: Look): string {
  const s = Math.max(240, W);
  const size = s * 0.075;
  return [
    tText(tr('Your heading'), { x: 0, y: 0, w: s * 0.7, size, font: p.head, weight: p.weight, color: look.ink, lh: 1.05, upper: p.upper, align: 'center' }),
    tText(tr('A line to go with it'), { x: s * 0.1, y: size * 1.35, w: s * 0.5, size: s * 0.03, font: p.body, weight: 500, color: look.ink, lh: 1.3, align: 'center' }),
  ].join('\n');
}

/** A box: a rectangle, rounded, or a circle. */
export const boxHtml = (kind: 'rect' | 'rounded' | 'circle', W: number, colour: string) => {
  const s = Math.max(120, W * 0.3);
  return tBox({ x: 0, y: 0, w: s, h: s, bg: colour, radius: kind === 'circle' ? '50%' : kind === 'rounded' ? s * 0.12 : undefined });
};

export const shapeHtml = (shape: string, W: number, colour: string) => {
  const s = Math.max(120, W * 0.3);
  const wide = shape === 'arrow' || shape === 'arrow-left' || shape === 'chevron' || shape === 'ribbon' || shape === 'parallelogram' || shape === 'wave';
  return tShape(shape, { x: 0, y: 0, w: wide ? s * 1.4 : s, h: wide ? s * 0.7 : s, color: colour });
};

export const lineHtml = (style: 'solid' | 'dashed' | 'dotted' | 'arrow', W: number, colour: string) =>
  tLine({ x: 0, y: 20, w: Math.max(120, W * 0.4), color: colour, lw: Math.max(3, W * 0.005), style: style === 'arrow' ? 'solid' : style, arrow: style === 'arrow' });

/** An empty frame to drop a picture into. */
export const frameHtml = (frame: string, W: number, look: Look) => {
  const s = Math.max(140, W * 0.4);
  const tall = frame === 'arch' || frame === 'drop';
  return tPic({ x: 0, y: 0, w: s, h: tall ? s * 1.25 : s, frame, from: mix(look.accent, '#ffffff', 0.45), to: mix(look.accent2, look.ink, 0.25), label: tr('Picture') });
};

/** Picture places side by side, a collage: the boxes of each layout, in a unit square. */
export const COLLAGES: { id: string; label: string; cells: [number, number, number, number][] }[] = [
  { id: 'two', label: 'Two side by side', cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { id: 'two-v', label: 'Two, one above the other', cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  { id: 'three', label: 'One large, two small', cells: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]] },
  { id: 'three-row', label: 'Three in a row', cells: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
  { id: 'four', label: 'Four in a grid', cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: 'top3', label: 'One on top, three under it', cells: [[0, 0, 1, 0.6], [0, 0.6, 1 / 3, 0.4], [1 / 3, 0.6, 1 / 3, 0.4], [2 / 3, 0.6, 1 / 3, 0.4]] },
  { id: 'six', label: 'Six in a grid', cells: [[0, 0, 1 / 3, 0.5], [1 / 3, 0, 1 / 3, 0.5], [2 / 3, 0, 1 / 3, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]] },
];

export function collageHtml(id: string, board: { w: number; h: number }, look: Look): string {
  const c = COLLAGES.find((x) => x.id === id) ?? COLLAGES[0];
  const W = board.w * 0.84;
  const H = board.h * 0.7;
  const gap = Math.max(6, Math.min(board.w, board.h) * 0.015);
  return c.cells
    .map(([x, y, w, h], i) =>
      tPic({
        x: x * W + (x > 0 ? gap / 2 : 0),
        y: y * H + (y > 0 ? gap / 2 : 0),
        w: w * W - (x > 0 ? gap / 2 : 0) - (x + w < 0.999 ? gap / 2 : 0),
        h: h * H - (y > 0 ? gap / 2 : 0) - (y + h < 0.999 ? gap / 2 : 0),
        from: mix(i % 2 ? look.accent2 : look.accent, '#ffffff', 0.4 + (i % 3) * 0.1),
        to: mix(i % 2 ? look.accent : look.accent2, look.ink, 0.25),
        label: tr('Picture'),
      }),
    )
    .join('\n');
}

/** An icon of Lucide's, its lines in its colour. */
export function iconHtml(name: string, paths: IconNode[], W: number, colour: string): string {
  const s = Math.max(64, W * 0.16);
  const inner = paths.map(([tag, a]) => `<${tag} ${Object.entries(a as Record<string, string | number>).map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ')}/>`).join('');
  return `<div class="n-el n-icon" data-icon="${esc(name)}" style="left:0px;top:0px;width:${Math.round(s)}px;height:${Math.round(s)}px;color:${colour}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg></div>`;
}

/** An emoji as big words. */
export const emojiHtml = (ch: string, W: number) => tText(ch, { x: 0, y: 0, size: Math.max(48, W * 0.14), font: 'Inter', color: '#000000', lh: 1 });

/** A QR code a phone's camera reads: its squares and its ground (or none). */
export function qrHtml(text: string, o: { dark: string; light: string | null; size?: number }, W: number): string {
  const code = qrCode(text, { level: 'M' });
  const svg = qrSvg(code, { dark: o.dark, light: o.light ?? 'transparent', quiet: 2 });
  const s = Math.round(o.size ?? Math.max(120, W * 0.24));
  return `<div class="n-el n-qr" data-qr="${esc(text)}" data-dark="${esc(o.dark)}" data-light="${esc(o.light ?? '')}" style="left:0px;top:0px;width:${s}px;height:${s}px">${svg}</div>`;
}

/** Stickers: a shape with words on it, as one group. */
export const STICKERS: { id: string; label: string }[] = [
  { id: 'sale', label: 'Sale burst' },
  { id: 'new', label: 'New seal' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'hello', label: 'Speech bubble' },
  { id: 'sparkles', label: 'Sparkles' },
  { id: 'arrow', label: 'Arrow' },
];

export function stickerHtml(id: string, W: number, look: Look): string {
  const s = Math.max(120, W * 0.24);
  const group = (w: number, h: number, inner: string) => `<div class="n-el n-group" style="left:0px;top:0px;width:${Math.round(w)}px;height:${Math.round(h)}px">\n${inner}\n</div>`;
  const words = (t: string, w: number, h: number, size: number, colour: string, font = look.head, rot = 0) =>
    tText(t, { x: 0, y: h / 2 - size * 0.6, w, size, font, weight: 800, color: colour, align: 'center', lh: 1.1, upper: true, rot });
  switch (id) {
    case 'sale':
      return group(s, s, [tShape('burst', { x: 0, y: 0, w: s, h: s, color: look.accent }), words(tr('Sale'), s, s, s * 0.22, '#ffffff')].join('\n'));
    case 'new':
      return group(s, s, [tShape('badge', { x: 0, y: 0, w: s, h: s, color: look.accent2 }), words(tr('New'), s, s, s * 0.24, '#ffffff')].join('\n'));
    case 'ribbon':
      return group(s * 1.8, s * 0.5, [tShape('ribbon', { x: 0, y: 0, w: s * 1.8, h: s * 0.5, color: look.accent }), words(tr('Special offer'), s * 1.8, s * 0.5, s * 0.14, '#ffffff')].join('\n'));
    case 'hello':
      return group(s * 1.3, s, [tShape('bubble', { x: 0, y: 0, w: s * 1.3, h: s, color: '#ffffff', stroke: look.ink, sw: 3 }), tText(tr('Hello!'), { x: 0, y: s * 0.24, w: s * 1.3, size: s * 0.2, font: look.head, weight: 800, color: look.ink, align: 'center' })].join('\n'));
    case 'sparkles':
      return group(s, s, [tShape('star4', { x: 0, y: s * 0.3, w: s * 0.6, h: s * 0.6, color: look.accent }), tShape('star4', { x: s * 0.6, y: 0, w: s * 0.35, h: s * 0.35, color: look.accent2 }), tShape('star4', { x: s * 0.65, y: s * 0.65, w: s * 0.25, h: s * 0.25, color: look.accent })].join('\n'));
    default:
      return tShape('arrow', { x: 0, y: 0, w: s * 1.4, h: s * 0.6, color: look.ink });
  }
}

// ---- words' looks --------------------------------------------------------------------------------------------------

export type Effect = 'none' | 'shadow' | 'lift' | 'hollow' | 'outline' | 'glow' | 'neon' | 'echo' | 'splice' | 'gradient';
export const EFFECTS: { id: Effect; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'lift', label: 'Lift' },
  { id: 'hollow', label: 'Hollow' },
  { id: 'outline', label: 'Outline' },
  { id: 'glow', label: 'Glow' },
  { id: 'neon', label: 'Neon' },
  { id: 'echo', label: 'Echo' },
  { id: 'splice', label: 'Splice' },
  { id: 'gradient', label: 'Gradient' },
];

const CLEAR: Record<string, null> = {
  'text-shadow': null,
  '-webkit-text-stroke': null,
  '-webkit-text-stroke-width': null,
  '-webkit-text-stroke-color': null,
  'paint-order': null,
  'background-image': null,
  '-webkit-background-clip': null,
  'background-clip': null,
  '-webkit-text-fill-color': null,
};

const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((x) => x + x).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const pxv = (v: number) => `${Math.round(v * 10) / 10}px`;

/** The CSS of a text effect, for words of `size` pixels, in a colour (and a second, for a gradient), `amount` 0–100. */
export function effectCss(e: Effect, o: { size: number; colour: string; colour2?: string; amount?: number }): Record<string, string | null> {
  const k = (o.amount ?? 50) / 50;
  const s = o.size;
  const c = /^#[0-9a-f]{3,8}$/i.test(o.colour) ? o.colour : '#000000';
  switch (e) {
    case 'shadow':
      return { ...CLEAR, 'text-shadow': `${pxv(s * 0.04 * k)} ${pxv(s * 0.04 * k)} ${pxv(s * 0.06 * k)} ${rgba(c, 0.5)}` };
    case 'lift':
      return { ...CLEAR, 'text-shadow': `0 ${pxv(s * 0.05 * k)} ${pxv(s * 0.2 * k)} ${rgba('#000000', 0.38)}` };
    case 'hollow':
      return { ...CLEAR, '-webkit-text-stroke': `${pxv(Math.max(1, s * 0.025 * k))} ${c}`, '-webkit-text-fill-color': 'transparent' };
    case 'outline':
      return { ...CLEAR, '-webkit-text-stroke': `${pxv(Math.max(1, s * 0.06 * k))} ${c}`, 'paint-order': 'stroke fill' };
    case 'glow':
      return { ...CLEAR, 'text-shadow': `0 0 ${pxv(s * 0.08 * k)} ${rgba(c, 0.9)}, 0 0 ${pxv(s * 0.25 * k)} ${rgba(c, 0.6)}` };
    case 'neon':
      return { ...CLEAR, '-webkit-text-fill-color': '#ffffff', 'text-shadow': `0 0 ${pxv(s * 0.04 * k)} #ffffff, 0 0 ${pxv(s * 0.12 * k)} ${c}, 0 0 ${pxv(s * 0.3 * k)} ${c}, 0 0 ${pxv(s * 0.5 * k)} ${c}` };
    case 'echo':
      return { ...CLEAR, 'text-shadow': `${pxv(s * 0.05 * k)} ${pxv(s * 0.05 * k)} 0 ${rgba(c, 0.5)}, ${pxv(s * 0.1 * k)} ${pxv(s * 0.1 * k)} 0 ${rgba(c, 0.25)}` };
    case 'splice':
      return { ...CLEAR, '-webkit-text-stroke': `${pxv(Math.max(1, s * 0.02))} currentColor`, '-webkit-text-fill-color': 'transparent', 'text-shadow': `${pxv(s * 0.06 * k)} ${pxv(s * 0.06 * k)} 0 ${c}` };
    case 'gradient': {
      const c2 = o.colour2 && /^#[0-9a-f]{3,8}$/i.test(o.colour2) ? o.colour2 : mix(c, '#ffffff', 0.5);
      return { ...CLEAR, 'background-image': `linear-gradient(90deg, ${c}, ${c2})`, '-webkit-background-clip': 'text', 'background-clip': 'text', '-webkit-text-fill-color': 'transparent' };
    }
    default:
      return { ...CLEAR };
  }
}

// ---- pictures' looks ---------------------------------------------------------------------------------------------------

export const LOOKS: { id: string; label: string; css: string }[] = [
  { id: 'none', label: 'None', css: '' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.4) contrast(1.08)' },
  { id: 'warm', label: 'Warm', css: 'sepia(.22) saturate(1.3) hue-rotate(-8deg)' },
  { id: 'cool', label: 'Cool', css: 'saturate(1.1) hue-rotate(12deg) brightness(1.03)' },
  { id: 'bw', label: 'Black and white', css: 'grayscale(1) contrast(1.1)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(.85)' },
  { id: 'faded', label: 'Faded', css: 'contrast(.85) brightness(1.1) saturate(.75)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.45) brightness(.9)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(.4) contrast(.95) saturate(.8) hue-rotate(-10deg)' },
  { id: 'dramatic', label: 'Dramatic', css: 'contrast(1.35) saturate(1.2) brightness(.92)' },
];

export interface Adjust {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
}
export const NO_ADJUST: Adjust = { brightness: 100, contrast: 100, saturate: 100, blur: 0 };

/** A picture's filter as the inspector writes it: its look, then its own adjustments. */
export const filterCss = (look: string, a: Adjust) =>
  [
    LOOKS.find((l) => l.id === look)?.css ?? '',
    a.brightness !== 100 ? `brightness(${a.brightness / 100})` : '',
    a.contrast !== 100 ? `contrast(${a.contrast / 100})` : '',
    a.saturate !== 100 ? `saturate(${a.saturate / 100})` : '',
    a.blur ? `blur(${a.blur}px)` : '',
  ]
    .filter(Boolean)
    .join(' ');

/** The look and adjustments a filter holds (the adjustments are its last functions of their kind). */
export function readFilter(f: string): { look: string; adjust: Adjust } {
  const look = [...LOOKS].reverse().find((l) => l.css && f.startsWith(l.css))?.id ?? 'none';
  const rest = look === 'none' ? f : f.slice((LOOKS.find((l) => l.id === look)?.css ?? '').length);
  const last = (name: string, def: number, scale: number) => {
    const all = [...rest.matchAll(new RegExp(`${name}\\(([\\d.]+)(px)?\\)`, 'g'))];
    return all.length ? Math.round(Number(all[all.length - 1][1]) * scale) : def;
  };
  return { look, adjust: { brightness: last('brightness', 100, 100), contrast: last('contrast', 100, 100), saturate: last('saturate', 100, 100), blur: last('blur', 0, 1) } };
}

// ---- backgrounds ------------------------------------------------------------------------------------------------------

export const GRADIENTS: string[] = [
  'linear-gradient(135deg,#ff9a8b,#ff6a88 55%,#ff99ac)',
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(120deg,#89f7fe,#66a6ff)',
  'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(160deg,#0f2027,#203a43,#2c5364)',
  'linear-gradient(135deg,#d4fc79,#96e6a1)',
  'radial-gradient(circle at 30% 20%,#fbc2eb,#a6c1ee)',
  'linear-gradient(135deg,#fdfbfb,#ebedee)',
  'linear-gradient(135deg,#1d1b17,#3d342b)',
  'radial-gradient(circle at 70% 30%,#ffd6a5,#ff9f80 45%,#c9184a)',
];

/** Patterns in two colours: the ground and its marks. */
export const PATTERNS: { id: string; label: string; css: (bg: string, ink: string) => string }[] = [
  { id: 'dots', label: 'Dots', css: (bg, ink) => `radial-gradient(${ink} 14%,transparent 15%) 0 0/36px 36px,${bg}` },
  { id: 'grid', label: 'Grid', css: (bg, ink) => `linear-gradient(${ink} 1.5px,transparent 1.5px) 0 0/40px 40px,linear-gradient(90deg,${ink} 1.5px,transparent 1.5px) 0 0/40px 40px,${bg}` },
  { id: 'stripes', label: 'Stripes', css: (bg, ink) => `repeating-linear-gradient(45deg,${ink} 0 14px,${bg} 14px 28px)` },
  { id: 'checks', label: 'Checks', css: (bg, ink) => `conic-gradient(${ink} 25%,${bg} 0 50%,${ink} 0 75%,${bg} 0) 0 0/60px 60px` },
  { id: 'lines', label: 'Lines', css: (bg, ink) => `repeating-linear-gradient(0deg,${ink} 0 2px,${bg} 2px 26px)` },
  { id: 'waves', label: 'Waves', css: (bg, ink) => `radial-gradient(circle at 50% 0,transparent 18px,${ink} 19px 22px,transparent 23px) 0 0/48px 24px,${bg}` },
];

/** A picture behind everything on the artboard, covering it. */
export const pictureBg = (src: string) => `url("${src}") center/cover no-repeat`;

/** A palette's colours for the Add panel's elements. */
export const lookOf = (p: Palette, fonts: [string, string]): Look => ({ head: fonts[0], body: fonts[1], ink: p.ink, accent: p.accent, accent2: p.accent2, soft: p.soft });

export const fontCss = (name: string) => fontStack(name);

/** The design editor's own words (on its bars, over its artboards), in the app's language. */
export const designLabels = (): Record<string, string> => ({
  dGroup: trIn('design', 'Group'),
  dCurved: tr('Curved words'),
  dText: tr('Text'),
  dPicture: tr('Picture'),
  dVideo: tr('Video'),
  dShape: tr('Shape'),
  dIcon: tr('Icon'),
  dQr: tr('QR code'),
  dLine: tr('Line'),
  dBox: tr('Box'),
  dDrop: tr('Drop a picture here'),
  dRotate: tr('Turn it (Shift: by 15°)'),
  dCropDone: tr('Done'),
  dCropDoneTip: tr('Done (Enter)'),
  dEditPicture: tr('Edit picture'),
  dEditPictureTip: tr('Open it in the picture editor'),
  dCropTip: tr('Crop it inside its frame (double-click)'),
  dEditVideo: tr('Edit video'),
  dEditVideoTip: tr('Open it in the video editor'),
  dWriteTip: tr('Change the words (double-click)'),
  dGroupIt: trIn('design', 'Group'),
  dGroupTip: tr('Group (Ctrl+G)'),
  dUngroup: tr('Ungroup'),
  dUngroupTip: tr('Ungroup (Ctrl+Shift+G)'),
  dDupTip: tr('Duplicate (Ctrl+D)'),
  dDelTip: tr('Delete (Delete)'),
  dLockTip: tr('Lock it in place'),
  dUnlockTip: tr('Unlock'),
  dMoreTip: tr('More'),
  dPageOf: tr('Page {0} of {1}'),
  dPageUp: tr('Move this page up'),
  dPageDown: tr('Move this page down'),
  dPageDup: tr('Duplicate this page'),
  dPageDel: tr('Delete this page'),
  dAddPage: tr('Add a page'),
  dMany: tr('{0} elements'),
});
