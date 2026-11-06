// Ready-made designs (New → Design): for each kind of size (square, portrait, story, landscape, banner, card), designs
// drawn from its width and height, with words and picture places to replace, painted in a palette's roles (its own, or
// the user's theme or brand) and set in a pair of fonts. Each makes the HTML of one artboard of a design (design.ts).
import { curveGeom, designPage, mix, px, type DesignShape, type DesignSize, type Palette } from './design.ts';
import { fontsHref, fontStack, nearestWeight } from './design-fonts.ts';
import { frameCss, shapePath } from './design-shapes.ts';

export interface TplCtx {
  W: number;
  H: number;
  /** The shorter side. */
  u: number;
  shape: DesignShape;
  p: Palette;
  head: string;
  body: string;
  /** Where words are safe (a YouTube banner's middle), else the whole artboard. */
  safe: { x: number; y: number; w: number; h: number };
}

export interface DesignTemplate {
  id: string;
  label: string;
  /** The kinds of size it is drawn for. */
  shapes: DesignShape[];
  /** The sizes it suits best (shown first for them). */
  best?: string[];
  fonts: [string, string];
  palette: Palette;
  build(c: TplCtx): { bg: string; html: string };
}

// ---- elements --------------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const words = (s: string) => esc(s).replace(/\n/g, '<br>');
const deg = (r?: number) => (r ? `;transform:rotate(${Math.round(r * 10) / 10}deg)` : '');

interface TextOpts {
  x: number;
  y: number;
  w?: number;
  size: number;
  font?: string;
  weight?: number;
  color: string;
  align?: 'left' | 'center' | 'right';
  lh?: number;
  ls?: number;
  upper?: boolean;
  italic?: boolean;
  rot?: number;
  css?: string;
}

/** Words: their box as wide as `w` (or as wide as they are), as tall as they are. */
export function tText(text: string, o: TextOpts): string {
  const font = o.font ?? 'Inter';
  const st = [
    `left:${px(o.x)}`,
    `top:${px(o.y)}`,
    o.w ? `width:${px(o.w)}` : 'width:max-content',
    `font-family:${fontStack(font).replace(/"/g, "'")}`,
    `font-size:${px(o.size)}`,
    `font-weight:${nearestWeight(font, o.weight ?? 400)}`,
    `line-height:${o.lh ?? 1.2}`,
    o.ls ? `letter-spacing:${Math.round(o.ls * 1000) / 1000}em` : '',
    `color:${o.color}`,
    o.align && o.align !== 'left' ? `text-align:${o.align}` : '',
    o.upper ? 'text-transform:uppercase' : '',
    o.italic ? 'font-style:italic' : '',
    o.css ?? '',
  ]
    .filter(Boolean)
    .join(';');
  return `<div class="n-el n-text" style="${st}${deg(o.rot)}">${words(text)}</div>`;
}

interface BoxOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  bg?: string;
  radius?: number | string;
  border?: string;
  rot?: number;
  opacity?: number;
  css?: string;
}

/** A rectangle (rounded, or a circle with radius '50%'). */
export function tBox(o: BoxOpts): string {
  const st = [
    `left:${px(o.x)}`,
    `top:${px(o.y)}`,
    `width:${px(o.w)}`,
    `height:${px(o.h)}`,
    o.bg ? `background:${o.bg}` : '',
    o.radius !== undefined ? `border-radius:${typeof o.radius === 'number' ? px(o.radius) : o.radius}` : '',
    o.border ? `border:${o.border}` : '',
    o.opacity !== undefined && o.opacity < 1 ? `opacity:${o.opacity}` : '',
    o.css ?? '',
  ]
    .filter(Boolean)
    .join(';');
  return `<div class="n-el n-box" style="${st.replace(/"/g, "'")}${deg(o.rot)}"></div>`;
}

/** A shape of design-shapes.ts, in a colour (and an outline). */
export function tShape(shape: string, o: { x: number; y: number; w: number; h: number; color: string; rot?: number; opacity?: number; stroke?: string; sw?: number }): string {
  const st = [`left:${px(o.x)}`, `top:${px(o.y)}`, `width:${px(o.w)}`, `height:${px(o.h)}`, `color:${o.color}`, o.stroke ? `--n-stroke:${o.stroke};--n-sw:${o.sw ?? 2}px` : '', o.opacity !== undefined && o.opacity < 1 ? `opacity:${o.opacity}` : '']
    .filter(Boolean)
    .join(';');
  return `<div class="n-el n-shape" data-shape="${shape}" style="${st}${deg(o.rot)}"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${shapePath(shape)}" vector-effect="non-scaling-stroke"/></svg></div>`;
}

/** A place for a picture: a soft blend of the palette until one is dropped in, cut to a frame. */
export function tPic(o: { x: number; y: number; w: number; h: number; frame?: string; from: string; to: string; angle?: number; rot?: number; label?: string }): string {
  const cut = frameCss(o.frame ?? 'rect');
  const st = [`left:${px(o.x)}`, `top:${px(o.y)}`, `width:${px(o.w)}`, `height:${px(o.h)}`, `background:linear-gradient(${o.angle ?? 135}deg,${o.from},${o.to})`, cut].filter(Boolean).join(';');
  return `<div class="n-el n-pic n-ph" data-frame="${o.frame ?? 'rect'}" data-hint="${esc(o.label ?? 'Picture')}" style="${st.replace(/"/g, "'")}${deg(o.rot)}"></div>`;
}

/** A line, plain, dashed or dotted, perhaps an arrow. */
export function tLine(o: { x: number; y: number; w: number; color: string; lw?: number; style?: 'solid' | 'dashed' | 'dotted'; arrow?: boolean; rot?: number }): string {
  const lw = o.lw ?? 3;
  const h = Math.max(12, lw * 4);
  const st = [`left:${px(o.x)}`, `top:${px(o.y - h / 2)}`, `width:${px(o.w)}`, `height:${px(h)}`, `color:${o.color}`, `--n-lw:${px(lw)}`, o.style && o.style !== 'solid' ? `--n-ls:${o.style}` : ''].filter(Boolean).join(';');
  return `<div class="n-el n-line${o.arrow ? ' n-arrow' : ''}" style="${st}${deg(o.rot)}"></div>`;
}

/** The icons templates draw (Lucide's lines). */
export const TPL_ICONS: Record<string, string> = {
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  'map-pin': '<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  phone:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-9 5.7a2 2 0 0 1-2 0L2 7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  sparkles: '<path d="M9.9 15.5a2 2 0 0 0-1.4-1.4l-6.1-1.6a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  award: '<path d="m15.5 12.9 1.5 8.5a.5.5 0 0 1-.8.5l-3.6-2.7a1 1 0 0 0-1.2 0l-3.6 2.7a.5.5 0 0 1-.8-.5l1.5-8.5"/><circle cx="12" cy="8" r="6"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  star: '<path d="M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7a2.1 2.1 0 0 0 1.6 1.2l5.2.8a.5.5 0 0 1 .3.9l-3.7 3.6a2.1 2.1 0 0 0-.6 1.9l.9 5.1a.5.5 0 0 1-.8.6l-4.6-2.4a2.1 2.1 0 0 0-2 0L6.4 21a.5.5 0 0 1-.8-.6l.9-5.1a2.1 2.1 0 0 0-.6-1.9L2.2 9.8a.5.5 0 0 1 .3-.9l5.2-.8a2.1 2.1 0 0 0 1.6-1.2z"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
};

/** An icon of the set above, in a colour. */
export function tIcon(name: string, o: { x: number; y: number; size: number; color: string; sw?: number; rot?: number }): string {
  const st = `left:${px(o.x)};top:${px(o.y)};width:${px(o.size)};height:${px(o.size)};color:${o.color}${o.sw ? `;--n-sw:${o.sw}` : ''}`;
  return `<div class="n-el n-icon" data-icon="${esc(name)}" style="${st}${deg(o.rot)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TPL_ICONS[name] ?? TPL_ICONS.star}</svg></div>`;
}

/**
 * Words on an arc (a badge's ring, a curved title): an SVG path the words follow, as wide as the element. `curve` from
 * -100 (bent down, a smile) to 100 (a half circle, bent up).
 */
export function curvedSvg(text: string, o: { w: number; size: number; curve: number; ls?: number; id?: string }): { svg: string; h: number } {
  const { d, h } = curveGeom(o.w, o.size, o.curve);
  const r = (v: number) => Math.round(v * 10) / 10;
  const id = o.id ?? `n-c${Math.abs(Math.round(o.w * 7 + o.size * 13 + o.curve * 17)) % 100000}`;
  const svg = `<svg viewBox="0 0 ${r(o.w)} ${h}" preserveAspectRatio="xMidYMid meet"><path id="${id}" d="${d}" fill="none"/><text text-anchor="middle" fill="currentColor" font-size="${r(o.size)}"${o.ls ? ` letter-spacing="${r(o.ls * o.size)}"` : ''}><textPath href="#${id}" startOffset="50%">${esc(text)}</textPath></text></svg>`;
  return { svg, h };
}

/** Curved words as an element. */
export function tCurve(text: string, o: { x: number; y: number; w: number; size: number; curve: number; color: string; font: string; weight?: number; ls?: number; upper?: boolean; rot?: number }): string {
  const t = o.upper ? text.toUpperCase() : text;
  const { svg, h } = curvedSvg(t, { w: o.w, size: o.size, curve: o.curve, ls: o.ls });
  const st = `left:${px(o.x)};top:${px(o.y)};width:${px(o.w)};height:${px(h)};color:${o.color};font-family:${fontStack(o.font).replace(/"/g, "'")};font-size:${px(o.size)};font-weight:${nearestWeight(o.font, o.weight ?? 400)}${o.ls ? `;letter-spacing:${o.ls}em` : ''}`;
  return `<div class="n-el n-text n-curve" data-curve="${Math.round(o.curve)}" data-text="${esc(t)}" style="${st}${deg(o.rot)}">${svg}</div>`;
}

const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join('\n');

// ---- the templates ---------------------------------------------------------------------------------------------------

const P = (bg: string, ink: string, accent: string, accent2: string, o: Partial<Palette> = {}): Palette => ({
  bg,
  ink,
  accent,
  accent2,
  soft: o.soft ?? mix(bg, accent, 0.1),
  muted: o.muted ?? mix(ink, bg, 0.38),
  onAccent: o.onAccent ?? '#ffffff',
});

/** The picture place's colours, from the palette. */
const phOf = (p: Palette) => ({ from: mix(p.accent, p.bg, 0.45), to: mix(p.accent2, p.ink, 0.3) });

/** Info lines with icons, one under another. */
function infoLines(c: TplCtx, lines: [string, string][], o: { x: number; y: number; w: number; size: number; color: string; icon: string; gap?: number }): string {
  const step = o.size * (o.gap ?? 1.9);
  return join(
    ...lines.flatMap(([icon, text], i) => [
      tIcon(icon, { x: o.x, y: o.y + i * step + o.size * 0.05, size: o.size * 1.1, color: o.icon, sw: 2.2 }),
      tText(text, { x: o.x + o.size * 1.75, y: o.y + i * step, w: o.w - o.size * 1.75, size: o.size, font: c.body, weight: 500, color: o.color, lh: 1.25 }),
    ]),
  );
}

const TEMPLATES: DesignTemplate[] = [
  // ---- events ----
  {
    id: 'bold-event',
    label: 'Bold event',
    shapes: ['portrait', 'square', 'story'],
    best: ['poster-a4', 'poster-a3', 'poster-letter', 'poster-18x24', 'flyer', 'instagram-portrait', 'story'],
    fonts: ['Anton', 'Inter'],
    palette: P('#101125', '#ffffff', '#ff5a36', '#ffd23f', { soft: '#1d1f3e', muted: '#b9bbd6', onAccent: '#101125' }),
    build(c) {
      const { W, H, p } = c;
      const story = c.shape === 'story';
      const sq = c.shape === 'square';
      const picH = H * (story ? 0.44 : sq ? 0.46 : 0.45);
      const m = W * 0.08;
      const title = W * (sq ? 0.14 : story ? 0.18 : 0.165);
      const ty = picH + H * (story ? 0.05 : 0.055);
      const info = W * (sq ? 0.028 : 0.032);
      return {
        bg: p.bg,
        html: join(
          tPic({ x: 0, y: 0, w: W, h: picH + H * 0.04, from: mix(p.accent, p.bg, 0.25), to: mix(p.accent2, p.accent, 0.4), angle: 160, label: 'Main picture' }),
          tShape('wave', { x: -W * 0.02, y: picH - H * 0.03, w: W * 1.04, h: H * 0.1, color: p.bg }),
          tText('Live · open air', { x: m, y: ty - title * 0.42, size: info * 0.95, font: c.body, weight: 700, color: p.accent2, ls: 0.18, upper: true }),
          tText('Summer\nnights', { x: m, y: ty, w: W - m * 2, size: title, font: c.head, color: p.ink, lh: 0.95, upper: true }),
          tText('Music, street food and dancing by the river', { x: m, y: ty + title * 2.05, w: W * (sq ? 0.55 : 0.7), size: info * 1.15, font: c.body, weight: 500, color: p.muted, lh: 1.35 }),
          infoLines(c, [
            ['calendar', 'Saturday 14 June'],
            ['clock', 'From 6 pm until late'],
            ['map-pin', 'Riverside Park, Old Town'],
          ], { x: m, y: H - m - info * 1.9 * 3 + info * 0.6, w: W * 0.6, size: info, color: p.ink, icon: p.accent }),
          tShape('burst', { x: W - m - W * 0.25, y: picH - W * 0.13, w: W * 0.25, h: W * 0.25, color: p.accent2, rot: -12 }),
          tText('Free\nentry', { x: W - m - W * 0.25, y: picH - W * 0.13 + W * 0.065, w: W * 0.25, size: W * 0.047, font: c.head, color: p.onAccent, align: 'center', lh: 1, upper: true, rot: -12 }),
        ),
      };
    },
  },
  {
    id: 'minimal-poster',
    label: 'Minimal',
    shapes: ['portrait', 'square', 'landscape', 'story'],
    best: ['poster-a3', 'poster-a4', 'flyer', 'instagram-post'],
    fonts: ['DM Serif Display', 'DM Sans'],
    palette: P('#f4efe6', '#1f1c18', '#c2410c', '#3f6212', { muted: '#6f675c', soft: '#e9e1d3' }),
    build(c) {
      const { W, H, p } = c;
      const ph = phOf(p);
      if (c.shape === 'landscape') {
        const m = H * 0.1;
        return {
          bg: p.bg,
          html: join(
            tPic({ x: W * 0.56, y: m, w: W * 0.36, h: H - m * 2, frame: 'arch', ...ph, label: 'Main picture' }),
            tText('Exhibition', { x: m, y: m * 1.3, size: H * 0.035, font: c.body, weight: 700, color: p.accent, ls: 0.3, upper: true }),
            tText('Quiet\nShapes', { x: m, y: m * 1.3 + H * 0.08, w: W * 0.46, size: H * 0.2, font: c.head, color: p.ink, lh: 0.98 }),
            tLine({ x: m, y: H * 0.68, w: W * 0.08, color: p.ink, lw: 2 }),
            tText('New work by Mara Lind\n12 April – 30 June', { x: m, y: H * 0.72, w: W * 0.44, size: H * 0.036, font: c.body, color: p.muted, lh: 1.5 }),
            tBox({ x: W * 0.52, y: H * 0.16, w: H * 0.06, h: H * 0.06, bg: p.accent, radius: '50%' }),
          ),
        };
      }
      const story = c.shape === 'story';
      const sq = c.shape === 'square';
      const m = W * 0.1;
      const picW = W * (sq ? 0.42 : 0.62);
      const picH = sq ? H * 0.56 : picW * 1.22;
      const picX = sq ? W - m - picW : (W - picW) / 2;
      const picY = sq ? m : H * (story ? 0.12 : 0.09);
      const ty = sq ? H * 0.2 : picY + picH + H * 0.045;
      const tsize = W * (sq ? 0.1 : 0.12);
      return {
        bg: p.bg,
        html: join(
          tPic({ x: picX, y: picY, w: picW, h: picH, frame: 'arch', ...ph, label: 'Main picture' }),
          tBox({ x: sq ? m : picX + picW - W * 0.035, y: sq ? m * 1.05 : picY + picH * 0.12, w: W * 0.05, h: W * 0.05, bg: p.accent, radius: '50%' }),
          tText('Exhibition', { x: sq ? m : 0, y: ty - tsize * 0.55, w: sq ? W * 0.4 : W, size: W * 0.024, font: c.body, weight: 700, color: p.accent, ls: 0.3, upper: true, align: sq ? 'left' : 'center' }),
          tText(sq ? 'Quiet\nShapes' : 'Quiet Shapes', { x: sq ? m : m * 0.5, y: ty, w: sq ? W * 0.42 : W - m, size: tsize, font: c.head, color: p.ink, align: sq ? 'left' : 'center', lh: 1 }),
          tLine({ x: sq ? m : W / 2 - W * 0.05, y: ty + tsize * (sq ? 2.35 : 1.45), w: W * 0.1, color: p.ink, lw: 2 }),
          tText('New work by Mara Lind\n12 April – 30 June · Gallery North', { x: sq ? m : m, y: ty + tsize * (sq ? 2.6 : 1.7), w: sq ? W * 0.42 : W - m * 2, size: W * 0.026, font: c.body, color: p.muted, lh: 1.6, align: sq ? 'left' : 'center' }),
        ),
      };
    },
  },
  {
    id: 'neon-night',
    label: 'Neon night',
    shapes: ['portrait', 'square', 'story', 'landscape'],
    best: ['story', 'instagram-portrait', 'poster-a3'],
    fonts: ['Bungee', 'Outfit'],
    palette: P('#0b0a1a', '#f5f3ff', '#ff2bd6', '#22d3ee', { soft: '#17153a', muted: '#a5a3c9', onAccent: '#0b0a1a' }),
    build(c) {
      const { W, H, p, u } = c;
      const land = c.shape === 'landscape';
      const glow = (col: string) => `text-shadow:0 0 ${px(u * 0.012)} ${col},0 0 ${px(u * 0.035)} ${col},0 0 ${px(u * 0.08)} ${col}`;
      const tsize = land ? H * 0.17 : W * (c.shape === 'square' ? 0.12 : 0.14);
      const cx = land ? W * 0.07 : W * 0.08;
      const ty = land ? H * 0.22 : H * (c.shape === 'story' ? 0.3 : 0.27);
      return {
        bg: `radial-gradient(circle at 80% 15%,${mix(p.accent, p.bg, 0.55)} 0%,transparent 45%),radial-gradient(circle at 10% 90%,${mix(p.accent2, p.bg, 0.55)} 0%,transparent 50%),${p.bg}`,
        html: join(
          tBox({ x: W * (land ? 0.62 : 0.5), y: -u * 0.12, w: u * 0.62, h: u * 0.62, radius: '50%', bg: 'transparent', border: `${px(u * 0.012)} solid ${p.accent2}`, opacity: 0.85, css: `box-shadow:0 0 ${px(u * 0.05)} ${p.accent2}` }),
          tText('Friday · 10 pm', { x: cx, y: ty - tsize * 0.75, size: tsize * 0.22, font: c.body, weight: 700, color: p.accent2, ls: 0.2, upper: true, css: glow(p.accent2) }),
          tText('Night\nshift', { x: cx, y: ty, w: land ? W * 0.6 : W - cx * 2, size: tsize, font: c.head, color: '#ffffff', lh: 1, upper: true, css: glow(p.accent) }),
          tText('DJ Kora · Lumen · The Static', { x: cx, y: ty + tsize * 2.3, w: land ? W * 0.55 : W - cx * 2, size: tsize * 0.2, font: c.body, weight: 600, color: p.ink, lh: 1.4 }),
          tLine({ x: cx, y: ty + tsize * 2.9, w: land ? W * 0.3 : W * 0.4, color: p.accent, lw: Math.max(2, u * 0.005) }),
          tText('The Basement Club\nTickets at the door', { x: cx, y: ty + tsize * 3.15, w: land ? W * 0.5 : W - cx * 2, size: tsize * 0.17, font: c.body, color: p.muted, lh: 1.5 }),
          tShape('star4', { x: W * (land ? 0.86 : 0.8), y: H * (land ? 0.66 : 0.78), w: u * 0.1, h: u * 0.1, color: p.accent2 }),
          tShape('star4', { x: W * (land ? 0.8 : 0.72), y: H * (land ? 0.8 : 0.86), w: u * 0.05, h: u * 0.05, color: p.accent }),
        ),
      };
    },
  },
  // ---- selling ----
  {
    id: 'big-sale',
    label: 'Big sale',
    shapes: ['square', 'portrait', 'story', 'landscape', 'banner'],
    best: ['instagram-post', 'facebook-post', 'flyer', 'story', 'linkedin-banner', 'facebook-cover'],
    fonts: ['Archivo Black', 'Work Sans'],
    palette: P('#ffe14d', '#161616', '#ff3b30', '#161616', { soft: '#fff1a6', muted: '#4a4a3c', onAccent: '#ffffff' }),
    build(c) {
      const { W, H, p, u } = c;
      const ph = { from: mix(p.bg, p.accent, 0.35), to: mix(p.accent, p.ink, 0.25) };
      if (c.shape === 'banner' || c.shape === 'landscape') {
        const banner = c.shape === 'banner';
        const s = c.safe;
        const t = banner ? s.h * 0.42 : s.h * 0.24;
        const x0 = s.x + s.w * 0.05;
        return {
          bg: p.bg,
          html: join(
            tBox({ x: W * 0.62, y: -H * 0.2, w: W * 0.6, h: H * 1.4, bg: p.accent, rot: 12 }),
            tPic({ x: W * (banner ? 0.68 : 0.62), y: H * (banner ? 0.12 : 0.14), w: banner ? H * 0.76 : H * 0.72, h: banner ? H * 0.76 : H * 0.72, frame: 'blob1', ...ph, label: 'Product' }),
            tText('Up to', { x: x0, y: s.y + s.h * (banner ? 0.1 : 0.16), size: t * 0.32, font: c.body, weight: 700, color: p.ink, upper: true, ls: 0.12 }),
            tText('50% off', { x: x0, y: s.y + s.h * (banner ? 0.24 : 0.24), size: t, font: c.head, color: p.ink, lh: 1, upper: true }),
            tText('Everything in store · this weekend only', { x: x0, y: s.y + s.h * (banner ? 0.68 : 0.52), w: s.w * 0.5, size: t * 0.22, font: c.body, weight: 500, color: p.muted }),
            tText('Shop now', { x: x0, y: s.y + s.h * (banner ? 0.82 : 0.66), size: t * 0.24, font: c.body, weight: 700, color: p.bg, css: `background:${p.ink};padding:.55em 1.3em;border-radius:999px` }),
          ),
        };
      }
      const story = c.shape === 'story';
      const m = W * 0.08;
      const big = W * 0.3;
      const ty = H * (story ? 0.1 : 0.08);
      const picY = ty + big * (story ? 1.75 : 1.55);
      const picS = Math.min(W * (story ? 0.78 : 0.62), H - picY - H * 0.08);
      return {
        bg: p.bg,
        html: join(
          tBox({ x: -W * 0.2, y: picY + picS * 0.25, w: W * 1.4, h: picS * 0.55, bg: p.accent, rot: -6 }),
          tText('Up to', { x: m, y: ty, size: big * 0.16, font: c.body, weight: 700, color: p.ink, upper: true, ls: 0.12 }),
          tText('Sale', { x: m * 0.7, y: ty + big * 0.16, size: big, font: c.head, color: p.ink, lh: 0.95, upper: true, ls: -0.02 }),
          tText('Everything in store\nthis weekend only', { x: W - m - W * 0.36, y: ty + big * 0.42, w: W * 0.36, size: W * 0.032, font: c.body, weight: 600, color: p.ink, lh: 1.35, align: 'right' }),
          tPic({ x: (W - picS) / 2, y: picY, w: picS, h: picS, frame: 'blob2', ...ph, label: 'Product' }),
          tShape('burst', { x: W - m - u * 0.27, y: picY - u * 0.06, w: u * 0.27, h: u * 0.27, color: p.accent, rot: 14 }),
          tText('50%\noff', { x: W - m - u * 0.27, y: picY - u * 0.06 + u * 0.06, w: u * 0.27, size: u * 0.058, font: c.head, color: p.onAccent, align: 'center', lh: 0.95, upper: true, rot: 14 }),
          tText('Shop now', { x: m, y: H - m - W * 0.06, size: W * 0.032, font: c.body, weight: 700, color: p.bg, css: `background:${p.ink};padding:.6em 1.4em;border-radius:999px` }),
          tText('yourshop.com', { x: W - m - W * 0.4, y: H - m - W * 0.04, w: W * 0.4, size: W * 0.026, font: c.body, weight: 600, color: p.ink, align: 'right' }),
        ),
      };
    },
  },
  {
    id: 'product',
    label: 'New collection',
    shapes: ['square', 'portrait', 'story'],
    best: ['instagram-portrait', 'instagram-post', 'story'],
    fonts: ['Fraunces', 'Manrope'],
    palette: P('#f3ece2', '#2b2118', '#a0522d', '#d4a373', { soft: '#e7dccb', muted: '#7a6a5a' }),
    build(c) {
      const { W, H, p } = c;
      const panelH = H * (c.shape === 'story' ? 0.3 : 0.32);
      const m = W * 0.07;
      return {
        bg: p.bg,
        html: join(
          tPic({ x: 0, y: 0, w: W, h: H - panelH, from: mix(p.accent2, p.bg, 0.3), to: mix(p.accent, p.ink, 0.35), angle: 200, label: 'Product photo' }),
          tText('New collection', { x: m, y: H - panelH + panelH * 0.16, size: W * 0.03, font: c.body, weight: 700, color: p.accent, ls: 0.22, upper: true }),
          tText('Autumn linen', { x: m, y: H - panelH + panelH * 0.3, w: W * 0.62, size: W * 0.095, font: c.head, weight: 800, color: p.ink, lh: 1 }),
          tText('Soft, breathable, made to last.', { x: m, y: H - panelH + panelH * 0.68, w: W * 0.6, size: W * 0.03, font: c.body, color: p.muted }),
          tShape('badge', { x: W - m - W * 0.22, y: H - panelH - W * 0.11, w: W * 0.22, h: W * 0.22, color: p.accent, rot: 8 }),
          tText('from\n€49', { x: W - m - W * 0.22, y: H - panelH - W * 0.11 + W * 0.055, w: W * 0.22, size: W * 0.044, font: c.head, weight: 800, color: p.onAccent, align: 'center', lh: 1.05, rot: 8 }),
        ),
      };
    },
  },
  // ---- words ----
  {
    id: 'quote',
    label: 'Quote',
    shapes: ['square', 'portrait', 'story', 'landscape'],
    best: ['instagram-post', 'instagram-portrait', 'story', 'x-post'],
    fonts: ['Playfair Display', 'Lato'],
    palette: P('#e9eef0', '#1c2a33', '#e07a5f', '#3d5a80', { soft: '#dbe3e7', muted: '#5f6f78' }),
    build(c) {
      const { W, H, p, u } = c;
      const land = c.shape === 'landscape';
      const m = land ? W * 0.1 : W * 0.11;
      const qs = u * 0.42;
      const ty = H * (c.shape === 'story' ? 0.32 : land ? 0.3 : 0.3);
      const size = land ? H * 0.075 : W * 0.068;
      return {
        bg: p.bg,
        html: join(
          tBox({ x: W - u * 0.36, y: H - u * 0.36, w: u * 0.6, h: u * 0.6, bg: p.soft, radius: '50%' }),
          tText('“', { x: m - qs * 0.08, y: ty - qs * 0.62, size: qs, font: c.head, weight: 900, color: p.accent, lh: 1 }),
          tText('The best way to predict the future is to create it.', { x: m, y: ty, w: W - m * 2, size, font: c.head, color: p.ink, lh: 1.25, italic: true }),
          tLine({ x: m, y: ty + size * 4.6 + size * 0.5, w: u * 0.08, color: p.accent, lw: Math.max(2, u * 0.005) }),
          tText('Peter Drucker', { x: m + u * 0.1, y: ty + size * 4.6 + size * 0.5 - size * 0.32, size: size * 0.42, font: c.body, weight: 700, color: p.ink, ls: 0.12, upper: true }),
          tText('@yourname', { x: m, y: H - m * 0.85, size: size * 0.34, font: c.body, color: p.muted }),
        ),
      };
    },
  },
  {
    id: 'announcement',
    label: 'Announcement',
    shapes: ['square', 'portrait', 'story', 'landscape'],
    best: ['instagram-post', 'facebook-post', 'x-post', 'story'],
    fonts: ['Poppins', 'Poppins'],
    palette: P('#fdf6f0', '#1f2933', '#2a9d8f', '#e76f51', { soft: '#f3e6da', muted: '#5b6670' }),
    build(c) {
      const { W, H, p, u } = c;
      const ph = phOf(p);
      const land = c.shape === 'landscape';
      const m = land ? W * 0.07 : W * 0.08;
      const circ = land ? H * 0.62 : W * (c.shape === 'story' ? 0.6 : 0.42);
      const cx = land ? W - m - circ : (W - circ) / 2;
      const cy = land ? (H - circ) / 2 : H * (c.shape === 'story' ? 0.1 : c.shape === 'portrait' ? 0.08 : 0.07);
      const tx = land ? m : m;
      const ty = land ? H * 0.2 : cy + circ + H * 0.05;
      const tw = land ? W * 0.5 : W - m * 2;
      const tsize = land ? H * 0.11 : W * 0.085;
      return {
        bg: p.bg,
        html: join(
          tBox({ x: cx - circ * 0.08, y: cy - circ * 0.08, w: circ * 1.16, h: circ * 1.16, radius: '50%', bg: 'transparent', border: `${px(u * 0.006)} dashed ${p.accent}` }),
          tPic({ x: cx, y: cy, w: circ, h: circ, frame: 'circle', ...ph, label: 'Picture' }),
          tShape('star4', { x: cx + circ * 0.86, y: cy + circ * 0.02, w: circ * 0.16, h: circ * 0.16, color: p.accent2 }),
          tText('We’re hiring!', { x: tx, y: ty, w: tw, size: tsize, font: c.head, weight: 800, color: p.ink, lh: 1.05, align: land ? 'left' : 'center' }),
          tText('Join our small, friendly team as a\nProduct Designer', { x: tx, y: ty + tsize * 1.35, w: tw, size: tsize * 0.32, font: c.body, color: p.muted, lh: 1.45, align: land ? 'left' : 'center' }),
          tText('Apply today', { x: land ? tx : W / 2 - tsize * 1.35, y: ty + tsize * 2.55, size: tsize * 0.3, font: c.body, weight: 700, color: p.onAccent, css: `background:${p.accent};padding:.6em 1.5em;border-radius:999px` }),
        ),
      };
    },
  },
  {
    id: 'tips',
    label: 'Tips list',
    shapes: ['square', 'portrait', 'story'],
    best: ['instagram-portrait', 'instagram-post'],
    fonts: ['Outfit', 'Outfit'],
    palette: P('#111827', '#f9fafb', '#fbbf24', '#34d399', { soft: '#1f2937', muted: '#9ca3af', onAccent: '#111827' }),
    build(c) {
      const { W, H, p } = c;
      const m = W * 0.08;
      const story = c.shape === 'story';
      const tsize = W * 0.085;
      const top = H * (story ? 0.12 : 0.09);
      const items = ['Start with the hardest task', 'Work in 25-minute sprints', 'Batch your email twice a day', 'End the day with a plan'];
      const cardY = top + tsize * 2.6;
      const cardH = (H - cardY - m * 1.4) / items.length - H * 0.018;
      return {
        bg: p.bg,
        html: join(
          tText('4 ways to', { x: m, y: top, size: tsize * 0.42, font: c.body, weight: 600, color: p.accent, upper: true, ls: 0.15 }),
          tText('Get more done', { x: m, y: top + tsize * 0.55, w: W - m * 2, size: tsize, font: c.head, weight: 800, color: p.ink, lh: 1.05 }),
          ...items.flatMap((t, i) => {
            const y = cardY + i * (cardH + H * 0.018);
            return [
              tBox({ x: m, y, w: W - m * 2, h: cardH, bg: p.soft, radius: W * 0.03 }),
              tText(String(i + 1).padStart(2, '0'), { x: m + W * 0.04, y: y + cardH / 2 - W * 0.045, size: W * 0.065, font: c.head, weight: 800, color: i % 2 ? p.accent2 : p.accent }),
              tText(t, { x: m + W * 0.17, y: y + cardH / 2 - W * 0.022, w: W - m * 2 - W * 0.21, size: W * 0.037, font: c.body, weight: 500, color: p.ink, lh: 1.25 }),
            ];
          }),
          tText('Save this for later →', { x: W - m - W * 0.5, y: H - m * 0.95, w: W * 0.5, size: W * 0.026, font: c.body, weight: 600, color: p.muted, align: 'right' }),
        ),
      };
    },
  },
  // ---- video and channels ----
  {
    id: 'thumbnail-bold',
    label: 'Bold thumbnail',
    shapes: ['landscape'],
    best: ['youtube-thumbnail', 'x-post', 'facebook-post'],
    fonts: ['Anton', 'Inter'],
    palette: P('#ffcc00', '#111111', '#ff2d55', '#111111', { soft: '#ffe066', muted: '#3b3b3b' }),
    build(c) {
      const { W, H, p } = c;
      const stroke = `-webkit-text-stroke:${px(H * 0.012)} ${p.ink};paint-order:stroke fill;text-shadow:${px(H * 0.012)} ${px(H * 0.016)} 0 ${p.ink}`;
      return {
        bg: `linear-gradient(120deg,${p.bg} 0%,${mix(p.bg, p.accent, 0.55)} 100%)`,
        html: join(
          tShape('burst', { x: W * 0.47, y: -H * 0.25, w: H * 1.5, h: H * 1.5, color: mix(p.bg, '#ffffff', 0.35), opacity: 0.55 }),
          tPic({ x: W * 0.52, y: H * 0.08, w: W * 0.44, h: H * 0.92, frame: 'rect', from: mix(p.accent, '#ffffff', 0.4), to: mix(p.accent, p.ink, 0.4), angle: 180, label: 'You, cut out' }),
          tText('I tried it', { x: W * 0.045, y: H * 0.1, w: W * 0.6, size: H * 0.19, font: c.head, color: '#ffffff', lh: 1, upper: true, css: stroke, rot: -3 }),
          tText('for 30 days', { x: W * 0.045, y: H * 0.36, w: W * 0.62, size: H * 0.19, font: c.head, color: p.accent, lh: 1, upper: true, css: stroke, rot: -3 }),
          tShape('arrow', { x: W * 0.36, y: H * 0.66, w: W * 0.17, h: H * 0.16, color: p.ink, rot: -12 }),
          tText('Worth it?', { x: W * 0.05, y: H * 0.7, size: H * 0.07, font: c.body, weight: 800, color: '#ffffff', css: `background:${p.ink};padding:.3em .7em;border-radius:.3em`, rot: -3 }),
        ),
      };
    },
  },
  {
    id: 'versus',
    label: 'This or that',
    shapes: ['landscape', 'square'],
    best: ['youtube-thumbnail', 'x-post'],
    fonts: ['Bebas Neue', 'Inter'],
    palette: P('#0f172a', '#ffffff', '#3b82f6', '#ef4444', { soft: '#1e293b', muted: '#94a3b8' }),
    build(c) {
      const { W, H, p, u } = c;
      const half = W / 2;
      return {
        bg: p.bg,
        html: join(
          tPic({ x: 0, y: 0, w: half, h: H, from: mix(p.accent, p.bg, 0.2), to: mix(p.accent, '#000000', 0.45), angle: 160, label: 'Left' }),
          tPic({ x: half, y: 0, w: half, h: H, from: mix(p.accent2, p.bg, 0.2), to: mix(p.accent2, '#000000', 0.45), angle: 200, label: 'Right' }),
          tBox({ x: half - u * 0.006, y: 0, w: u * 0.012, h: H, bg: '#ffffff' }),
          tText('Old', { x: W * 0.04, y: H - u * 0.3, w: half - W * 0.08, size: u * 0.2, font: c.head, color: '#ffffff', upper: true, css: `text-shadow:0 ${px(u * 0.01)} ${px(u * 0.03)} rgba(0,0,0,.45)` }),
          tText('New', { x: half + W * 0.04, y: H - u * 0.3, w: half - W * 0.08, size: u * 0.2, font: c.head, color: '#ffffff', align: 'right', upper: true, css: `text-shadow:0 ${px(u * 0.01)} ${px(u * 0.03)} rgba(0,0,0,.45)` }),
          tBox({ x: half - u * 0.13, y: H / 2 - u * 0.13, w: u * 0.26, h: u * 0.26, bg: '#ffffff', radius: '50%', css: `box-shadow:0 ${px(u * 0.01)} ${px(u * 0.05)} rgba(0,0,0,.4)` }),
          tText('VS', { x: half - u * 0.13, y: H / 2 - u * 0.075, w: u * 0.26, size: u * 0.13, font: c.head, color: p.bg, align: 'center', lh: 1 }),
        ),
      };
    },
  },
  {
    id: 'webinar',
    label: 'Webinar',
    shapes: ['landscape', 'banner'],
    best: ['facebook-post', 'x-post', 'linkedin-banner', 'youtube-banner'],
    fonts: ['Space Grotesk', 'Inter'],
    palette: P('#f5f7ff', '#111a3a', '#4f46e5', '#06b6d4', { soft: '#e3e7fb', muted: '#5b6283' }),
    build(c) {
      const { W, H, p } = c;
      const s = c.safe;
      const banner = c.shape === 'banner';
      const k = banner ? s.h : s.h * 0.62;
      const x0 = s.x + s.w * 0.05;
      const dots = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => tBox({ x: s.x + s.w * 0.9 + j * k * 0.06, y: s.y + s.h * 0.08 + i * k * 0.06, w: k * 0.02, h: k * 0.02, bg: p.accent, radius: '50%', opacity: 0.35 }))).flat();
      const circ = banner ? s.h * 0.78 : s.h * 0.6;
      return {
        bg: p.bg,
        html: join(
          tBox({ x: W * 0.64, y: -H * 0.3, w: W * 0.55, h: H * 1.6, bg: `linear-gradient(160deg,${p.accent},${p.accent2})`, radius: '40%', rot: -14 }),
          tPic({ x: s.x + s.w * (banner ? 0.72 : 0.66), y: s.y + (s.h - circ) / 2, w: circ, h: circ, frame: 'circle', from: mix(p.soft, p.accent, 0.3), to: mix(p.accent2, p.ink, 0.3), label: 'Speaker' }),
          ...dots,
          tText('Free webinar · 21 May, 4 pm', { x: x0, y: s.y + s.h * (banner ? 0.12 : 0.18), size: k * 0.07, font: c.body, weight: 700, color: p.accent, ls: 0.06, upper: true }),
          tText('Design systems\nthat scale', { x: x0, y: s.y + s.h * (banner ? 0.26 : 0.27), w: s.w * 0.6, size: k * (banner ? 0.2 : 0.17), font: c.head, weight: 700, color: p.ink, lh: 1.02 }),
          tText('With Ana Ruiz, Head of Design at Northwind', { x: x0, y: s.y + s.h * (banner ? 0.78 : 0.62), w: s.w * 0.6, size: k * 0.07, font: c.body, color: p.muted }),
          !banner && tText('Save your seat', { x: x0, y: s.y + s.h * 0.75, size: k * 0.07, font: c.body, weight: 700, color: '#ffffff', css: `background:${p.ink};padding:.6em 1.3em;border-radius:.5em` }),
        ),
      };
    },
  },
  {
    id: 'profile-banner',
    label: 'Profile banner',
    shapes: ['banner', 'landscape'],
    best: ['linkedin-banner', 'facebook-cover', 'youtube-banner'],
    fonts: ['Syne', 'DM Sans'],
    palette: P('#0e1b2b', '#ffffff', '#f97316', '#38bdf8', { soft: '#16293f', muted: '#a9b8c9', onAccent: '#0e1b2b' }),
    build(c) {
      const { W, H, p } = c;
      const s = c.safe;
      const k = Math.min(s.h, s.w * 0.25);
      const right = c.shape === 'banner' && s.w > 1000;
      // On LinkedIn the picture sits over the left: words go right of the middle.
      const x0 = right ? s.x + s.w * 0.36 : s.x + s.w * 0.06;
      return {
        bg: `linear-gradient(110deg,${p.bg} 0%,${p.bg} 55%,${mix(p.bg, p.accent2, 0.35)} 100%)`,
        html: join(
          tBox({ x: W * 0.8, y: -H * 0.5, w: H * 1.4, h: H * 1.4, radius: '50%', bg: 'transparent', border: `${px(k * 0.03)} solid ${p.accent}`, opacity: 0.9 }),
          tBox({ x: W * 0.88, y: H * 0.45, w: H * 0.7, h: H * 0.7, radius: '50%', bg: p.accent2, opacity: 0.9 }),
          tShape('star4', { x: W * 0.74, y: H * 0.2, w: k * 0.18, h: k * 0.18, color: p.accent }),
          tText('Sam Rivera', { x: x0, y: s.y + s.h * 0.2, size: k * 0.24, font: c.head, weight: 800, color: p.ink, lh: 1 }),
          tText('Product designer · Writer · Speaker', { x: x0, y: s.y + s.h * 0.52, size: k * 0.1, font: c.body, weight: 500, color: p.muted }),
          tText('samrivera.design', { x: x0, y: s.y + s.h * 0.72, size: k * 0.085, font: c.body, weight: 700, color: p.accent }),
        ),
      };
    },
  },
  // ---- cards and invitations ----
  {
    id: 'wedding',
    label: 'Wedding invitation',
    shapes: ['portrait', 'square', 'story'],
    best: ['invitation', 'flyer', 'postcard'],
    fonts: ['Great Vibes', 'Cormorant Garamond'],
    palette: P('#fbf8f3', '#3d3a35', '#b08d57', '#7d8c6e', { soft: '#f1ebe0', muted: '#7b746a' }),
    build(c) {
      const { W, H, p, u } = c;
      const m = u * 0.06;
      const cx = W / 2;
      return {
        bg: p.bg,
        html: join(
          tBox({ x: m, y: m, w: W - m * 2, h: H - m * 2, bg: 'transparent', border: `${px(Math.max(1, u * 0.003))} solid ${p.accent}` }),
          tBox({ x: m * 1.5, y: m * 1.5, w: W - m * 3, h: H - m * 3, bg: 'transparent', border: `${px(Math.max(1, u * 0.0015))} solid ${p.accent}` }),
          tShape('flower', { x: cx - u * 0.05, y: H * 0.1, w: u * 0.1, h: u * 0.1, color: p.accent, opacity: 0.85 }),
          tText('Together with their families', { x: m * 2, y: H * 0.22, w: W - m * 4, size: u * 0.034, font: c.body, weight: 600, color: p.muted, align: 'center', ls: 0.2, upper: true }),
          tText('Olivia', { x: 0, y: H * 0.29, w: W, size: u * 0.15, font: c.head, color: p.ink, align: 'center', lh: 1.1 }),
          tText('&', { x: 0, y: H * 0.29 + u * 0.155, w: W, size: u * 0.08, font: c.body, color: p.accent, align: 'center', italic: true, lh: 1 }),
          tText('James', { x: 0, y: H * 0.29 + u * 0.24, w: W, size: u * 0.15, font: c.head, color: p.ink, align: 'center', lh: 1.1 }),
          tText('request the pleasure of your company\nat the celebration of their marriage', { x: m * 2, y: H * 0.29 + u * 0.46, w: W - m * 4, size: u * 0.04, font: c.body, color: p.ink, align: 'center', lh: 1.45, italic: true }),
          tLine({ x: cx - u * 0.12, y: H * 0.29 + u * 0.62, w: u * 0.24, color: p.accent, lw: Math.max(1, u * 0.003) }),
          tText('Saturday, the twelfth of September\nat four in the afternoon', { x: m * 2, y: H * 0.29 + u * 0.66, w: W - m * 4, size: u * 0.042, font: c.body, weight: 600, color: p.ink, align: 'center', lh: 1.45 }),
          tText('The Old Orangery · Kew Gardens', { x: m * 2, y: H - m * 2 - u * 0.1, w: W - m * 4, size: u * 0.034, font: c.body, weight: 600, color: p.muted, align: 'center', ls: 0.14, upper: true }),
        ),
      };
    },
  },
  {
    id: 'birthday',
    label: 'Birthday party',
    shapes: ['portrait', 'square', 'story'],
    best: ['invitation', 'instagram-post', 'story', 'flyer'],
    fonts: ['Pacifico', 'Fredoka'],
    palette: P('#fff4e4', '#3a2a4d', '#ff6f91', '#ffc75f', { soft: '#ffe6c2', muted: '#7b6a8d', onAccent: '#ffffff' }),
    build(c) {
      const { W, H, p, u } = c;
      const colours = [p.accent, p.accent2, mix(p.accent, '#4cc9f0', 0.7), mix(p.accent2, '#7bd389', 0.6)];
      const bits: string[] = [];
      // Confetti round the edges, placed the same way every time.
      for (let i = 0; i < 26; i++) {
        const a = (i * 137.5 * Math.PI) / 180;
        const edge = i % 2 ? 0.08 : 0.92;
        const x = (0.5 + 0.48 * Math.cos(a)) * W;
        const y = (i % 4 < 2 ? 0.04 + 0.16 * ((i * 0.37) % 1) : edge - 0.06 + 0.12 * ((i * 0.53) % 1)) * H;
        const s = u * (0.018 + 0.02 * ((i * 0.61) % 1));
        const col = colours[i % colours.length];
        bits.push(i % 3 === 0 ? tShape('triangle', { x, y, w: s, h: s, color: col, rot: (i * 47) % 360 }) : i % 3 === 1 ? tBox({ x, y, w: s * 0.6, h: s * 1.6, bg: col, radius: s * 0.3, rot: (i * 61) % 180 }) : tBox({ x, y, w: s, h: s, bg: col, radius: '50%' }));
      }
      const ty = H * (c.shape === 'square' ? 0.2 : 0.22);
      return {
        bg: p.bg,
        html: join(
          ...bits,
          tText('You’re invited to', { x: 0, y: ty, w: W, size: u * 0.05, font: c.body, weight: 600, color: p.muted, align: 'center', upper: true, ls: 0.15 }),
          tText('Mia’s', { x: 0, y: ty + u * 0.07, w: W, size: u * 0.14, font: c.head, color: p.ink, align: 'center', lh: 1.2 }),
          tText('7', { x: 0, y: ty + u * 0.22, w: W, size: u * 0.36, font: c.body, weight: 700, color: p.accent, align: 'center', lh: 1, css: `text-shadow:${px(u * 0.012)} ${px(u * 0.012)} 0 ${p.accent2}` }),
          tText('th birthday party', { x: 0, y: ty + u * 0.58, w: W, size: u * 0.07, font: c.body, weight: 700, color: p.ink, align: 'center' }),
          tText('Sunday 3 May · 2 pm\n12 Willow Lane', { x: 0, y: ty + u * 0.72, w: W, size: u * 0.048, font: c.body, weight: 500, color: p.ink, align: 'center', lh: 1.4 }),
          tText('RSVP to Anna · 07700 900123', { x: 0, y: H - H * 0.13, w: W, size: u * 0.036, font: c.body, weight: 600, color: p.muted, align: 'center' }),
        ),
      };
    },
  },
  {
    id: 'card-classic',
    label: 'Classic business card',
    shapes: ['card'],
    best: ['business-card'],
    fonts: ['Montserrat', 'Montserrat'],
    palette: P('#ffffff', '#1f2937', '#0f766e', '#99f6e4', { soft: '#f0fdfa', muted: '#6b7280' }),
    build(c) {
      const { W, H, p } = c;
      const m = H * 0.13;
      const s = H * 0.055;
      return {
        bg: p.bg,
        html: join(
          tBox({ x: 0, y: 0, w: W * 0.035, h: H, bg: p.accent }),
          tBox({ x: W - m - H * 0.26, y: m, w: H * 0.26, h: H * 0.26, bg: p.soft, radius: '50%', border: `${px(Math.max(1, H * 0.006))} solid ${p.accent}` }),
          tText('JC', { x: W - m - H * 0.26, y: m + H * 0.075, w: H * 0.26, size: H * 0.095, font: c.head, weight: 800, color: p.accent, align: 'center', lh: 1 }),
          tText('Jordan Carter', { x: m + W * 0.035, y: m, size: H * 0.11, font: c.head, weight: 700, color: p.ink }),
          tText('Architect', { x: m + W * 0.035, y: m + H * 0.15, size: H * 0.06, font: c.body, weight: 500, color: p.accent, ls: 0.12, upper: true }),
          infoLines(c, [
            ['phone', '+44 20 7946 0958'],
            ['mail', 'jordan@carter.studio'],
            ['globe', 'carter.studio'],
          ], { x: m + W * 0.035, y: H - m - s * 1.8 * 3 + s * 0.6, w: W * 0.7, size: s, color: p.ink, icon: p.accent, gap: 1.8 }),
        ),
      };
    },
  },
  {
    id: 'card-bold',
    label: 'Bold business card',
    shapes: ['card', 'landscape'],
    best: ['business-card'],
    fonts: ['Playfair Display', 'Inter'],
    palette: P('#141414', '#f5f5f5', '#d4af37', '#8a8a8a', { soft: '#222222', muted: '#a3a3a3', onAccent: '#141414' }),
    build(c) {
      const { W, H, p } = c;
      const m = H * 0.14;
      return {
        bg: p.bg,
        html: join(
          tText('M', { x: m * 0.6, y: -H * 0.08, size: H * 1.05, font: c.head, weight: 900, color: p.soft, lh: 1 }),
          tText('Maya Okafor', { x: W * 0.42, y: H * 0.26, w: W * 0.54, size: H * 0.115, font: c.head, weight: 700, color: p.ink }),
          tLine({ x: W * 0.42, y: H * 0.47, w: W * 0.1, color: p.accent, lw: Math.max(1, H * 0.01) }),
          tText('Brand strategist', { x: W * 0.42, y: H * 0.52, size: H * 0.058, font: c.body, weight: 600, color: p.accent, ls: 0.16, upper: true }),
          tText('maya@okafor.co\n+1 415 555 0182', { x: W * 0.42, y: H * 0.66, w: W * 0.54, size: H * 0.06, font: c.body, color: p.muted, lh: 1.5 }),
        ),
      };
    },
  },
  {
    id: 'certificate',
    label: 'Certificate',
    shapes: ['landscape', 'portrait'],
    best: ['certificate'],
    fonts: ['Cinzel', 'EB Garamond'],
    palette: P('#fffdf7', '#2a2723', '#b08d57', '#1f3a5f', { soft: '#f6efdf', muted: '#6d665b', onAccent: '#ffffff' }),
    build(c) {
      const { W, H, p, u } = c;
      const m = u * 0.05;
      const sealS = u * 0.17;
      const signY = H * 0.8;
      return {
        bg: p.bg,
        html: join(
          tBox({ x: m, y: m, w: W - m * 2, h: H - m * 2, bg: 'transparent', border: `${px(u * 0.012)} solid ${p.accent2}` }),
          tBox({ x: m * 1.6, y: m * 1.6, w: W - m * 3.2, h: H - m * 3.2, bg: 'transparent', border: `${px(Math.max(1, u * 0.003))} solid ${p.accent}` }),
          tText('Certificate', { x: 0, y: H * 0.13, w: W, size: u * 0.1, font: c.head, weight: 700, color: p.accent2, align: 'center', ls: 0.12, upper: true }),
          tText('of achievement', { x: 0, y: H * 0.13 + u * 0.12, w: W, size: u * 0.035, font: c.head, weight: 600, color: p.accent, align: 'center', ls: 0.35, upper: true }),
          tText('This certificate is proudly presented to', { x: 0, y: H * 0.38, w: W, size: u * 0.034, font: c.body, color: p.muted, align: 'center', italic: true }),
          tText('Alexandra Mitchell', { x: 0, y: H * 0.38 + u * 0.06, w: W, size: u * 0.1, font: 'Great Vibes', color: p.ink, align: 'center', lh: 1.15 }),
          tLine({ x: W * 0.3, y: H * 0.38 + u * 0.2, w: W * 0.4, color: p.accent, lw: Math.max(1, u * 0.002) }),
          tText('for outstanding work on the Riverside project, 2026', { x: W * 0.18, y: H * 0.38 + u * 0.23, w: W * 0.64, size: u * 0.033, font: c.body, color: p.ink, align: 'center', lh: 1.4 }),
          tLine({ x: W * 0.12, y: signY, w: W * 0.24, color: p.ink, lw: 1 }),
          tText('Daniel Brooks, Director', { x: W * 0.12, y: signY + u * 0.02, w: W * 0.24, size: u * 0.028, font: c.body, color: p.muted, align: 'center' }),
          tLine({ x: W * 0.64, y: signY, w: W * 0.24, color: p.ink, lw: 1 }),
          tText('12 March 2026', { x: W * 0.64, y: signY + u * 0.02, w: W * 0.24, size: u * 0.028, font: c.body, color: p.muted, align: 'center' }),
          tShape('badge', { x: W / 2 - sealS / 2, y: signY - sealS * 0.55, w: sealS, h: sealS, color: p.accent }),
          tIcon('award', { x: W / 2 - sealS * 0.24, y: signY - sealS * 0.55 + sealS * 0.26, size: sealS * 0.48, color: p.onAccent, sw: 1.8 }),
        ),
      };
    },
  },
  {
    id: 'menu',
    label: 'Restaurant menu',
    shapes: ['portrait'],
    best: ['menu', 'poster-a4', 'poster-letter'],
    fonts: ['Playfair Display', 'Lato'],
    palette: P('#f7f2e8', '#24211c', '#8c2f1b', '#55613b', { soft: '#ece3d1', muted: '#6e6659' }),
    build(c) {
      const { W, H, p } = c;
      const m = W * 0.1;
      const sections: [string, [string, string, string][]][] = [
        ['Starters', [['Burrata', 'Heirloom tomatoes, basil oil', '9'], ['Calamari', 'Lemon, garlic aioli', '11']]],
        ['Mains', [['Tagliatelle al ragù', 'Slow-cooked beef, parmesan', '18'], ['Sea bass', 'Fennel, capers, new potatoes', '23'], ['Mushroom risotto', 'Porcini, thyme, pecorino', '16']]],
        ['Desserts', [['Tiramisù', 'Espresso, mascarpone', '8'], ['Panna cotta', 'Vanilla, berries', '7']]],
      ];
      const out: string[] = [
        tText('Trattoria', { x: 0, y: H * 0.06, w: W, size: W * 0.11, font: c.head, weight: 700, color: p.ink, align: 'center', italic: true }),
        tText('Menu', { x: 0, y: H * 0.06 + W * 0.14, w: W, size: W * 0.03, font: c.body, weight: 700, color: p.accent, align: 'center', ls: 0.5, upper: true }),
        tLine({ x: W / 2 - W * 0.12, y: H * 0.06 + W * 0.2, w: W * 0.24, color: p.accent, lw: 1.5 }),
      ];
      let y = H * 0.06 + W * 0.25;
      const ts = W * 0.03;
      for (const [title, items] of sections) {
        out.push(tText(title, { x: m, y, w: W - m * 2, size: W * 0.048, font: c.head, weight: 700, color: p.accent, lh: 1.1 }));
        y += W * 0.075;
        for (const [name, desc, price] of items) {
          out.push(tText(name, { x: m, y, w: W * 0.6, size: ts, font: c.body, weight: 700, color: p.ink }));
          out.push(tText(price, { x: W - m - W * 0.12, y, w: W * 0.12, size: ts, font: c.body, weight: 700, color: p.ink, align: 'right' }));
          out.push(tText(desc, { x: m, y: y + ts * 1.35, w: W * 0.66, size: ts * 0.82, font: c.body, color: p.muted, italic: true }));
          y += ts * 3.1;
        }
        y += W * 0.035;
      }
      out.push(tText('Open every day from 12 pm · Via Roma 14', { x: 0, y: H - H * 0.06, w: W, size: W * 0.022, font: c.body, color: p.muted, align: 'center', ls: 0.1, upper: true }));
      return { bg: p.bg, html: join(...out) };
    },
  },
  {
    id: 'chalkboard',
    label: 'Café board',
    shapes: ['portrait', 'square', 'story'],
    best: ['menu', 'poster-a4', 'instagram-portrait'],
    fonts: ['Caveat', 'Nunito'],
    palette: P('#262a2b', '#f4f1ea', '#f2c14e', '#86c5a4', { soft: '#30363a', muted: '#b9b4a8', onAccent: '#262a2b' }),
    build(c) {
      const { W, H, p } = c;
      const m = W * 0.1;
      const items: [string, string][] = [
        ['Espresso', '2.20'],
        ['Flat white', '3.40'],
        ['Cappuccino', '3.20'],
        ['Chai latte', '3.60'],
        ['Hot chocolate', '3.50'],
        ['Banana bread', '2.90'],
      ];
      const top = H * 0.08;
      const rowH = (H * 0.84 - (top + W * 0.35)) / items.length;
      return {
        bg: `radial-gradient(circle at 50% 40%,${mix(p.bg, '#ffffff', 0.08)},${p.bg} 70%)`,
        html: join(
          tIcon('coffee', { x: W / 2 - W * 0.06, y: top, size: W * 0.12, color: p.accent, sw: 1.6 }),
          tText('Today’s coffee', { x: 0, y: top + W * 0.14, w: W, size: W * 0.12, font: c.head, weight: 700, color: p.ink, align: 'center', lh: 1 }),
          tLine({ x: W / 2 - W * 0.2, y: top + W * 0.29, w: W * 0.4, color: p.accent, lw: 2, style: 'dashed' }),
          ...items.flatMap(([name, price], i) => {
            const y = top + W * 0.35 + i * rowH;
            return [
              tText(name, { x: m, y, w: W * 0.55, size: W * 0.065, font: c.head, weight: 600, color: p.ink }),
              tLine({ x: m + W * 0.42, y: y + W * 0.055, w: W * 0.24, color: p.muted, lw: 2, style: 'dotted' }),
              tText(price, { x: W - m - W * 0.2, y, w: W * 0.2, size: W * 0.065, font: c.head, weight: 700, color: p.accent, align: 'right' }),
            ];
          }),
          tText('Oat milk at no extra charge', { x: 0, y: H - H * 0.08, w: W, size: W * 0.035, font: c.body, weight: 600, color: p.accent2, align: 'center' }),
        ),
      };
    },
  },
  {
    id: 'postcard',
    label: 'Greetings from',
    shapes: ['landscape', 'card', 'portrait', 'square'],
    best: ['postcard'],
    fonts: ['Pacifico', 'Anton'],
    palette: P('#0e3b43', '#ffffff', '#ff8552', '#ffd166', { soft: '#14505a', muted: '#d5e5e7' }),
    build(c) {
      const { W, H, p, u } = c;
      const shadow = `text-shadow:0 ${px(u * 0.012)} ${px(u * 0.03)} rgba(0,0,0,.35)`;
      return {
        bg: p.bg,
        html: join(
          tPic({ x: 0, y: 0, w: W, h: H, from: mix(p.accent2, p.bg, 0.25), to: mix(p.accent, p.bg, 0.45), angle: 170, label: 'A photo of the place' }),
          tBox({ x: u * 0.04, y: u * 0.04, w: W - u * 0.08, h: H - u * 0.08, bg: 'transparent', border: `${px(u * 0.008)} solid rgba(255,255,255,.85)`, radius: u * 0.02 }),
          tText('Greetings from', { x: 0, y: H * 0.26, w: W, size: u * 0.11, font: c.head, color: '#ffffff', align: 'center', css: shadow, rot: -4 }),
          tText('Lisbon', { x: 0, y: H * 0.26 + u * 0.15, w: W, size: u * 0.33, font: c.body, color: p.accent2, align: 'center', lh: 1, upper: true, css: `-webkit-text-stroke:${px(u * 0.008)} #ffffff;paint-order:stroke fill;${shadow}`, rot: -4 }),
        ),
      };
    },
  },
  {
    id: 'logo-badge',
    label: 'Badge logo',
    shapes: ['square'],
    best: ['logo'],
    fonts: ['Bebas Neue', 'Montserrat'],
    palette: P('#fbf6ec', '#2d2a26', '#c8553d', '#2d2a26', { soft: '#f1e7d6', muted: '#857d71' }),
    build(c) {
      const { W, H, p, u } = c;
      const d = u * 0.84;
      const x = (W - d) / 2;
      const y = (H - d) / 2;
      return {
        bg: p.bg,
        html: join(
          tBox({ x, y, w: d, h: d, radius: '50%', bg: 'transparent', border: `${px(u * 0.016)} solid ${p.ink}` }),
          tBox({ x: x + d * 0.06, y: y + d * 0.06, w: d * 0.88, h: d * 0.88, radius: '50%', bg: 'transparent', border: `${px(Math.max(1, u * 0.004))} solid ${p.ink}` }),
          tCurve('Handmade goods', { x: x + d * 0.1, y: y + d * 0.1, w: d * 0.8, size: u * 0.065, curve: 100, color: p.ink, font: c.body, weight: 700, ls: 0.18, upper: true }),
          tIcon('leaf', { x: W / 2 - u * 0.09, y: H / 2 - u * 0.22, size: u * 0.18, color: p.accent, sw: 1.8 }),
          tText('Kiln & Co', { x, y: H / 2 - u * 0.02, w: d, size: u * 0.17, font: c.head, color: p.ink, align: 'center', lh: 1, upper: true }),
          tText('Est. 2026', { x, y: H / 2 + u * 0.16, w: d, size: u * 0.04, font: c.body, weight: 700, color: p.accent, align: 'center', ls: 0.3, upper: true }),
        ),
      };
    },
  },
  {
    id: 'logo-wordmark',
    label: 'Wordmark logo',
    shapes: ['square', 'landscape', 'banner'],
    best: ['logo'],
    fonts: ['Outfit', 'Outfit'],
    palette: P('#ffffff', '#111827', '#6366f1', '#a5b4fc', { soft: '#eef2ff', muted: '#6b7280' }),
    build(c) {
      const { W, H, p, u } = c;
      const ic = u * 0.3;
      const wide = W / H > 1.3;
      if (wide) {
        const total = ic + u * 0.08 + u * 1.1;
        const x0 = (W - total) / 2;
        return {
          bg: p.bg,
          html: join(
            tBox({ x: x0, y: (H - ic) / 2, w: ic, h: ic, radius: ic * 0.28, bg: `linear-gradient(135deg,${p.accent},${p.accent2})` }),
            tIcon('sparkles', { x: x0 + ic * 0.2, y: (H - ic) / 2 + ic * 0.2, size: ic * 0.6, color: '#ffffff', sw: 2 }),
            tText('lumina', { x: x0 + ic + u * 0.08, y: H / 2 - u * 0.17, size: u * 0.26, font: c.head, weight: 800, color: p.ink, lh: 1.1, ls: -0.03 }),
          ),
        };
      }
      return {
        bg: p.bg,
        html: join(
          tBox({ x: (W - ic) / 2, y: H * 0.22, w: ic, h: ic, radius: ic * 0.28, bg: `linear-gradient(135deg,${p.accent},${p.accent2})` }),
          tIcon('sparkles', { x: (W - ic) / 2 + ic * 0.2, y: H * 0.22 + ic * 0.2, size: ic * 0.6, color: '#ffffff', sw: 2 }),
          tText('lumina', { x: 0, y: H * 0.22 + ic + u * 0.06, w: W, size: u * 0.17, font: c.head, weight: 800, color: p.ink, align: 'center', lh: 1.1, ls: -0.03 }),
          tText('Studio for light', { x: 0, y: H * 0.22 + ic + u * 0.27, w: W, size: u * 0.045, font: c.body, weight: 500, color: p.muted, align: 'center', ls: 0.14, upper: true }),
        ),
      };
    },
  },
];

export const DESIGN_TEMPLATES = TEMPLATES;

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

/** The templates for a size: those drawn for its kind of size, the ones best for it first. */
export function templatesFor(size: Pick<DesignSize, 'id' | 'shape'>): DesignTemplate[] {
  const fits = TEMPLATES.filter((t) => t.shapes.includes(size.shape));
  const best = (t: DesignTemplate) => (t.best?.includes(size.id) ? 0 : 1);
  return fits.map((t, i) => ({ t, i })).sort((a, b) => best(a.t) - best(b.t) || a.i - b.i).map((x) => x.t);
}

/** The context a template draws in, for a size. */
export function tplCtx(size: Pick<DesignSize, 'w' | 'h' | 'shape' | 'safe'>, p: Palette, fonts: [string, string]): TplCtx {
  return { W: size.w, H: size.h, u: Math.min(size.w, size.h), shape: size.shape, p, head: fonts[0], body: fonts[1], safe: size.safe ?? { x: 0, y: 0, w: size.w, h: size.h } };
}

/** The fonts a template sets its words in (and any its elements name), for the page's link to Google Fonts. */
export const templateFonts = (fonts: [string, string], html: string) => {
  const named = [...html.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]);
  return [...new Set([fonts[0], fonts[1], ...named])];
};

/**
 * A new design: a template (or none: Start blank) at a size, in a palette and fonts (its own when none is given), as a
 * whole page to keep.
 */
export function templatePage(t: DesignTemplate | null, size: DesignSize, o: { title: string; palette?: Palette; fonts?: [string, string]; lang?: string }): string {
  const fonts = o.fonts ?? t?.fonts ?? ['Montserrat', 'Inter'];
  const p = o.palette ?? t?.palette ?? P('#ffffff', '#1d1b17', '#e4572e', '#2a9d8f');
  const made = t ? t.build(tplCtx(size, p, fonts)) : { bg: p.bg, html: '' };
  return designPage({
    title: o.title,
    lang: o.lang,
    size: size.id,
    boards: [{ w: size.w, h: size.h, bg: made.bg, html: made.html }],
    fontsHref: fontsHref(t ? templateFonts(fonts, made.html) : fonts),
  });
}

/** One artboard of a template, alone (its preview in the New picker): its background and its elements. */
export function templateBoard(t: DesignTemplate, size: Pick<DesignSize, 'w' | 'h' | 'shape' | 'safe'>, o: { palette?: Palette; fonts?: [string, string] } = {}) {
  const fonts = o.fonts ?? t.fonts;
  return t.build(tplCtx(size, o.palette ?? t.palette, fonts));
}

