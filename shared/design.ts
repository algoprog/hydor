// Designs: posters, flyers, social posts, cards, as in Canva or Adobe Express. A design is a page of the Library like any
// other (it opens, saves, keeps its versions, exports and is published as pages are), whose body holds one or more
// artboards of a fixed size, each with its elements placed on it where they are, as a slide holds its parts:
//
//   <body class="n-design-page">
//     <main class="n-design">
//       <section class="n-artboard" data-w="1080" data-h="1350" style="width:1080px;height:1350px;background:#f4efe6">
//         <div class="n-el n-text" style="left:80px;top:96px;width:920px;font:800 96px/1.05 &quot;Montserrat&quot;,sans-serif;color:#1d1b17">Summer sale</div>
//         <div class="n-el n-pic" style="left:80px;top:420px;width:920px;height:640px"><img src="data:…" alt="…"></div>
//         …
//
// Elements: words (.n-text: their box as wide as given, as tall as they are), boxes (.n-box: a rectangle, rounded or a
// circle, by its corners), shapes (.n-shape: an outline of design-shapes.ts drawn in its colour), pictures in frames
// (.n-pic: an img that covers the frame, moved and scaled inside it when cropped, the frame cut to a shape), picture
// places to fill (.n-pic.n-ph), icons (.n-icon), QR codes (.n-qr), lines (.n-line), videos (.n-vid) and groups (.n-group,
// whose elements are placed inside it). Each is placed by its own style: left, top, width, height in pixels, and a
// rotate() (and a flip) in its transform. The page carries its own stylesheet for these (#n-design-base) and a small
// script (#n-design-fit) that fits its artboards to the window they are shown in, so it looks the same wherever it opens:
// in the app, at its own address, published, or downloaded as a file. Sizes are CSS pixels at 96 to the inch: an A4
// poster is 794 × 1123, printed on A4.

export type DesignGroup = 'social' | 'print' | 'other';
/** The kind of layout a size's templates are drawn for. */
export type DesignShape = 'square' | 'portrait' | 'story' | 'landscape' | 'banner' | 'card';
export type DesignUnit = 'px' | 'mm' | 'in';

export interface DesignSize {
  id: string;
  label: string;
  group: DesignGroup;
  /** Its size in CSS pixels (96 to the inch). */
  w: number;
  h: number;
  /** The unit it is sized in, and its size in it (a print size: 210 × 297 mm). */
  unit: DesignUnit;
  uw: number;
  uh: number;
  shape: DesignShape;
  /** Where words are safe from being cut (a YouTube banner's middle, which shows on every screen). */
  safe?: { x: number; y: number; w: number; h: number };
}

export const PX_PER: Record<DesignUnit, number> = { px: 1, mm: 96 / 25.4, in: 96 };

/** A size in a unit, as pixels (rounded). */
export const toPx = (v: number, unit: DesignUnit) => Math.round(v * PX_PER[unit]);
/** Pixels in a unit (mm to a tenth, inches to a hundredth). */
export const fromPx = (px: number, unit: DesignUnit) => (unit === 'px' ? Math.round(px) : unit === 'mm' ? Math.round((px / PX_PER.mm) * 10) / 10 : Math.round((px / PX_PER.in) * 100) / 100);

const S = (id: string, label: string, group: DesignGroup, uw: number, uh: number, unit: DesignUnit, shape: DesignShape, safe?: DesignSize['safe']): DesignSize => ({
  id,
  label,
  group,
  w: toPx(uw, unit),
  h: toPx(uh, unit),
  unit,
  uw,
  uh,
  shape,
  ...(safe ? { safe } : {}),
});

export const DESIGN_SIZES: DesignSize[] = [
  S('instagram-post', 'Instagram post', 'social', 1080, 1080, 'px', 'square'),
  S('instagram-portrait', 'Instagram post (portrait)', 'social', 1080, 1350, 'px', 'portrait'),
  S('story', 'Story, Reel or TikTok', 'social', 1080, 1920, 'px', 'story'),
  S('facebook-post', 'Facebook post', 'social', 1200, 630, 'px', 'landscape'),
  S('facebook-cover', 'Facebook cover', 'social', 851, 315, 'px', 'banner'),
  S('x-post', 'X post', 'social', 1600, 900, 'px', 'landscape'),
  S('linkedin-banner', 'LinkedIn banner', 'social', 1584, 396, 'px', 'banner'),
  S('youtube-thumbnail', 'YouTube thumbnail', 'social', 1280, 720, 'px', 'landscape'),
  S('youtube-banner', 'YouTube banner', 'social', 2560, 1440, 'px', 'landscape', { x: 507, y: 508, w: 1546, h: 423 }),
  S('poster-a4', 'Poster (A4)', 'print', 210, 297, 'mm', 'portrait'),
  S('poster-a3', 'Poster (A3)', 'print', 297, 420, 'mm', 'portrait'),
  S('poster-letter', 'Poster (US Letter)', 'print', 8.5, 11, 'in', 'portrait'),
  S('poster-18x24', 'Poster (18 × 24 in)', 'print', 18, 24, 'in', 'portrait'),
  S('flyer', 'Flyer (A5)', 'print', 148, 210, 'mm', 'portrait'),
  S('invitation', 'Invitation (5 × 7 in)', 'print', 5, 7, 'in', 'portrait'),
  S('business-card', 'Business card', 'print', 3.5, 2, 'in', 'card'),
  S('certificate', 'Certificate', 'print', 297, 210, 'mm', 'landscape'),
  S('menu', 'Menu', 'print', 210, 297, 'mm', 'portrait'),
  S('postcard', 'Postcard (6 × 4 in)', 'print', 6, 4, 'in', 'landscape'),
  S('logo', 'Logo', 'other', 500, 500, 'px', 'square'),
];

export const DESIGN_GROUPS: { id: DesignGroup; label: string }[] = [
  { id: 'social', label: 'Social media' },
  { id: 'print', label: 'Print' },
  { id: 'other', label: 'Other' },
];

export const designSize = (id: string): DesignSize | undefined => DESIGN_SIZES.find((s) => s.id === id);

/** The smallest and largest side a design may have, in pixels. */
export const DESIGN_LIMITS = { min: 16, max: 8000, boards: 30, els: 400 };

/** The layout a custom size is closest to. */
export function shapeOf(w: number, h: number): DesignShape {
  const k = w / h;
  if (k >= 2.2) return 'banner';
  if (k >= 1.25) return w <= 600 && h <= 400 ? 'card' : 'landscape';
  if (k > 0.85) return 'square';
  if (k > 0.65) return 'portrait';
  return 'story';
}

/** How a size is said: "1080 × 1080 px", "210 × 297 mm". */
export function sizeText(s: Pick<DesignSize, 'w' | 'h' | 'unit' | 'uw' | 'uh'>): string {
  return s.unit === 'px' ? `${s.w} × ${s.h} px` : `${s.uw} × ${s.uh} ${s.unit}`;
}

/** A size named by an agent or a person: one of the list (by its id or its label), or "1200x800", "210x297mm", "5x7in". */
export function sizeFrom(v: unknown): DesignSize | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  const known = DESIGN_SIZES.find((s) => s.id === t || s.label.toLowerCase() === t);
  if (known) return known;
  const m = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(px|mm|in)?$/.exec(t);
  if (!m) return null;
  const unit = (m[3] ?? 'px') as DesignUnit;
  const w = toPx(Number(m[1]), unit);
  const h = toPx(Number(m[2]), unit);
  if (w < DESIGN_LIMITS.min || h < DESIGN_LIMITS.min || w > DESIGN_LIMITS.max || h > DESIGN_LIMITS.max) return null;
  return { id: 'custom', label: 'Custom size', group: 'other', w, h, unit, uw: Number(m[1]), uh: Number(m[2]), shape: shapeOf(w, h) };
}

// ---- the page's own stylesheet and script -----------------------------------------------------------------------------

/** What every design carries in its head (#n-design-base): its artboards and elements, as shown and as printed. */
export const DESIGN_CSS = [
  'body.n-design-page{margin:0;min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:40px;padding:40px 20px;background:#e8e6e1}',
  'html[data-n-theme=dark] body.n-design-page{background:#1c1c1f}',
  '.n-design{display:contents}',
  '.n-artboard{position:relative;flex:none;overflow:hidden;box-sizing:border-box;background:#fff;color:#1d1b17;box-shadow:0 1px 3px rgba(0,0,0,.12),0 10px 30px rgba(0,0,0,.14)}',
  '.n-artboard>*,.n-group>*{position:absolute;box-sizing:border-box;margin:0}',
  '.n-text{overflow-wrap:break-word;line-height:1.2}',
  '.n-text .n-hlb{-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:.06em .28em;border-radius:.16em}',
  '.n-pic{overflow:hidden}',
  '.n-pic>img,.n-pic>video,.n-vid>video{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;display:block;max-width:none}',
  '.n-shape>svg,.n-icon>svg,.n-qr>svg,.n-curve>svg{position:absolute;left:0;top:0;width:100%;height:100%;display:block;overflow:visible}',
  '.n-shape path{fill:currentColor;stroke:var(--n-stroke,none);stroke-width:var(--n-sw,0)}',
  '.n-icon svg{stroke-width:var(--n-sw,2)}',
  '.n-line{height:12px}',
  '.n-line::before{content:"";position:absolute;left:0;right:0;top:50%;margin-top:calc(var(--n-lw,4px) / -2);border-top:var(--n-lw,4px) var(--n-ls,solid) currentColor}',
  '.n-line.n-arrow::after{content:"";position:absolute;right:calc(var(--n-lw,4px) / 2);top:50%;width:calc(var(--n-lw,4px) * 3 + 6px);height:calc(var(--n-lw,4px) * 3 + 6px);box-sizing:border-box;border-top:var(--n-lw,4px) solid currentColor;border-right:var(--n-lw,4px) solid currentColor;transform:translateY(-50%) rotate(45deg)}',
  '.n-ph{background:linear-gradient(135deg,#d8d2c6,#b9b1a3)}',
  '@media print{body.n-design-page{display:block;padding:0;gap:0;background:none}.n-artboard{box-shadow:none;break-after:page;zoom:1!important}}',
].join('\n');

/**
 * The script every design carries (#n-design-fit), run where it is shown: each artboard as large as fits the width of
 * the window (never larger than itself); a lone artboard on a page of its own (its own address, published, a file)
 * fits the window's height too. A page shown as it is exactly (html.n-exact: a download being made) is left alone.
 */
export function designFit() {
  const d = document;
  const R = d.documentElement;
  const fit = () => {
    if (R.classList.contains('n-exact') || R.classList.contains('n-editing')) return;
    const all = d.querySelectorAll<HTMLElement>('.n-artboard');
    if (!all.length || !d.body) return;
    const cs = getComputedStyle(d.body);
    const aw = R.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const ah = innerHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const kit = (window as unknown as { hydor?: { fill?: boolean } }).hydor;
    const own = all.length === 1 && (!kit || kit.fill === true);
    for (const a of all) {
      const w = parseFloat(a.style.width) || parseFloat(a.getAttribute('data-w') ?? '') || a.offsetWidth;
      const h = parseFloat(a.style.height) || parseFloat(a.getAttribute('data-h') ?? '') || a.offsetHeight;
      let z = Math.min(1, aw / w);
      if (own && h > 0 && ah > 120) z = Math.min(z, ah / h);
      a.style.zoom = z < 0.999 ? String(Math.max(0.05, Math.round(z * 1000) / 1000)) : '';
    }
  };
  addEventListener('resize', fit);
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', fit);
  else fit();
  addEventListener('load', fit);
}

export const DESIGN_FIT_SRC = `(${designFit.toString()})()`;

/** A design's head: its stylesheet and its fitting script, as the page carries them. */
export const designHead = () => `<style id="n-design-base">\n${DESIGN_CSS}\n</style>\n<script id="n-design-fit">${DESIGN_FIT_SRC.replace(/<\/(script)/gi, '<\\/$1')}</script>`;

/**
 * The arc curved words follow (an element of the class n-curve), in its own box `w` wide: SVG path data, and the box's
 * height. `curve` from -100 (bent down, a smile) to 100 (a half circle, bent up). Self-contained (Math alone): the
 * editor in the page's frame runs it from its source too.
 */
export function curveGeom(w: number, size: number, curve: number): { d: string; h: number } {
  const c = Math.max(-100, Math.min(100, curve)) || 1;
  const theta = (Math.abs(c) / 100) * Math.PI;
  const R = w / 2 / Math.sin(Math.min(theta, Math.PI) / 2);
  const sag = R * (1 - Math.cos(theta / 2));
  const pad = size * 1.15;
  const h = Math.round(sag + pad * 1.4);
  const r = (v: number) => Math.round(v * 10) / 10;
  const d = c > 0 ? `M0,${r(pad + sag)} A${r(R)},${r(R)} 0 0 1 ${r(w)},${r(pad + sag)}` : `M0,${r(pad * 0.85)} A${r(R)},${r(R)} 0 0 0 ${r(w)},${r(pad * 0.85)}`;
  return { d, h };
}

// ---- reading a design --------------------------------------------------------------------------------------------------

/** Whether a page is a design: it has an artboard. */
export const isDesignHtml = (html: string) => /<[a-z][^>]*\bclass\s*=\s*["'][^"']*\bn-artboard\b/i.test(html);

/** Its artboards' sizes, in order, from their own style (else their data-w and data-h). */
export function designBoards(html: string): { w: number; h: number }[] {
  const out: { w: number; h: number }[] = [];
  const re = /<([a-z][a-z0-9]*)\b([^>]*\bclass\s*=\s*["'][^"']*\bn-artboard\b[^>]*)>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const at = m[2];
    const style = /\bstyle\s*=\s*"([^"]*)"/i.exec(at)?.[1] ?? /\bstyle\s*=\s*'([^']*)'/i.exec(at)?.[1] ?? '';
    const inStyle = (k: string) => Number(new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*([\\d.]+)px`, 'i').exec(style)?.[1] ?? NaN);
    const data = (k: string) => Number(new RegExp(`\\bdata-${k}\\s*=\\s*["']?([\\d.]+)`, 'i').exec(at)?.[1] ?? NaN);
    const w = inStyle('width') || data('w');
    const h = inStyle('height') || data('h');
    if (w > 0 && h > 0) out.push({ w: Math.round(w), h: Math.round(h) });
  }
  return out.slice(0, DESIGN_LIMITS.boards);
}

/**
 * A design as a page keeps it: with its stylesheet and script in its head (in place of older ones), and its body marked
 * as a design's. What agents write and what the editor saves come through here, so every design shows the same.
 */
export function withDesignKit(html: string): string {
  if (!isDesignHtml(html)) return html;
  let out = html
    .replace(/<style\b[^>]*\bid\s*=\s*["']n-design-base["'][^>]*>[\s\S]*?<\/style>\s*/gi, '')
    .replace(/<script\b[^>]*\bid\s*=\s*["']n-design-fit["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
  const head = designHead();
  const h = /<head\b[^>]*>/i.exec(out);
  if (h) out = out.slice(0, h.index + h[0].length) + '\n' + head + '\n' + out.slice(h.index + h[0].length);
  else {
    const d = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(out);
    const at = d ? d[0].length : 0;
    out = `${out.slice(0, at)}<head>${head}</head>${out.slice(at)}`;
  }
  // The body says it holds a design (its look around the artboards).
  out = out.replace(/<body\b([^>]*)>/i, (m, a: string) => {
    if (/\bn-design-page\b/.test(a)) return m;
    if (/\bclass\s*=\s*"/i.test(a)) return `<body${a.replace(/\bclass\s*=\s*"([^"]*)"/i, (_x, c: string) => `class="${`${c} n-design-page`.trim()}"`)}>`;
    return `<body class="n-design-page"${a}>`;
  });
  return out;
}

// ---- writing one ---------------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** A number for a style: whole pixels, or to a tenth. */
export const px = (v: number) => `${Math.round(v * 10) / 10}px`;

export interface BoardSpec {
  w: number;
  h: number;
  /** Its background: a colour, a gradient or a picture (CSS). */
  bg?: string;
  /** Its elements' HTML. */
  html: string;
}

/** A whole design page: its title, its fonts (a Google Fonts link, or none), its artboards. */
export function designPage(o: { title: string; boards: BoardSpec[]; fontsHref?: string; lang?: string; size?: string }): string {
  const boards = o.boards
    .map(
      (b) =>
        `<section class="n-artboard" data-w="${Math.round(b.w)}" data-h="${Math.round(b.h)}" style="width:${Math.round(b.w)}px;height:${Math.round(b.h)}px${b.bg ? `;background:${b.bg.replace(/"/g, "'")}` : ''}">\n${b.html}\n</section>`,
    )
    .join('\n');
  const fonts = o.fontsHref ? `<link id="n-fonts" rel="stylesheet" href="${esc(o.fontsHref)}">\n` : '';
  return `<!doctype html>\n<html lang="${esc(o.lang ?? 'en')}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(o.title)}</title>\n${fonts}${designHead()}\n</head>\n<body class="n-design-page">\n<main class="n-design"${o.size ? ` data-size="${esc(o.size)}"` : ''}>\n${boards}\n</main>\n</body>\n</html>\n`;
}

// ---- resizing (as Canva's Magic resize) ------------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where an element goes when its artboard changes size, from `from` to `to`: scaled by how much the artboard shrank or
 * grew on its shorter scale (so it keeps its shape and its words their proportions), its middle kept where it was in the
 * artboard. One that ran across the artboard (a background, a band, a full-bleed picture) runs across the new one; one
 * that touched an edge keeps touching it; one that was inside stays inside. `k` is how much its words' sizes scale.
 */
export function fitBox(b: Box, from: { w: number; h: number }, to: { w: number; h: number }): Box & { k: number } {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  const k = Math.min(sx, sy);
  const near = (a: number, c: number, tol: number) => Math.abs(a - c) <= tol;
  const tolX = from.w * 0.02;
  const tolY = from.h * 0.02;
  const wideAcross = b.w >= from.w * 0.9;
  const tallAcross = b.h >= from.h * 0.9;
  let w = wideAcross ? b.w * sx : b.w * k;
  let h = tallAcross ? b.h * sy : b.h * k;
  // A full-bleed element (both ways) fills the new board; one across one way keeps its thickness in proportion.
  if (wideAcross && tallAcross) {
    w = b.w * sx;
    h = b.h * sy;
  }
  const cx = ((b.x + b.w / 2) / from.w) * to.w;
  const cy = ((b.y + b.h / 2) / from.h) * to.h;
  let x = cx - w / 2;
  let y = cy - h / 2;
  // Edges it touched, it touches still.
  if (near(b.x, 0, tolX)) x = b.x * sx;
  else if (near(b.x + b.w, from.w, tolX)) x = to.w - w - (from.w - b.x - b.w) * sx;
  if (near(b.y, 0, tolY)) y = b.y * sy;
  else if (near(b.y + b.h, from.h, tolY)) y = to.h - h - (from.h - b.y - b.h) * sy;
  // Inside before, inside after.
  const inside = b.x >= -1 && b.y >= -1 && b.x + b.w <= from.w + 1 && b.y + b.h <= from.h + 1;
  if (inside) {
    if (w > to.w) {
      const s = to.w / w;
      w *= s;
      h *= s;
    }
    if (h > to.h) {
      const s = to.h / h;
      w *= s;
      h *= s;
    }
    x = Math.max(0, Math.min(x, to.w - w));
    y = Math.max(0, Math.min(y, to.h - h));
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  return { x: round(x), y: round(y), w: round(w), h: round(h), k: Math.round(Math.min(k, b.w > 0 ? w / b.w : k) * 1000) / 1000 };
}

// ---- colours ---------------------------------------------------------------------------------------------------------

/** A colour as #rrggbb, from #rgb, #rrggbb, #rrggbbaa or rgb()/rgba(); null for anything else. */
export function hexColour(c: string): string | null {
  const s = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${[...m[1]].map((x) => x + x).join('')}`;
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return `#${m[1]}`;
  const r = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(s);
  if (r) return `#${[r[1], r[2], r[3]].map((v) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0')).join('')}`;
  return null;
}

export function rgbOf(hex: string): [number, number, number] {
  const h = hexColour(hex) ?? '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** How light a colour looks, from 0 (black) to 1 (white). */
export function lightness(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** How colourful a colour is, from 0 (grey) to 1. */
export function chroma(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/** The contrast between two colours (WCAG's), from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [lightness(a), lightness(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The roles of a design's colours, which a template paints with and a palette or a brand fills. */
export interface Palette {
  /** The background. */
  bg: string;
  /** A quieter surface on it (cards, bands). */
  soft: string;
  /** The main words. */
  ink: string;
  /** Quieter words. */
  muted: string;
  /** The colour that stands out, and one beside it. */
  accent: string;
  accent2: string;
  /** Words on the accent. */
  onAccent: string;
}

/**
 * A palette from a few colours (a brand's, a theme's, ones suggested): the lightest the background (or the darkest, for a
 * dark one), the colour most unlike it for the words, the most colourful ones the accents.
 */
export function paletteFrom(colours: string[], o: { dark?: boolean } = {}): Palette | null {
  const list = [...new Set(colours.map((c) => hexColour(c)).filter((c): c is string => !!c))];
  if (!list.length) return null;
  const byLight = [...list].sort((a, b) => lightness(b) - lightness(a));
  const bg = o.dark ? byLight[byLight.length - 1] : byLight[0];
  const ink0 = o.dark ? byLight[0] : byLight[byLight.length - 1];
  const ink = contrast(ink0, bg) >= 4.5 ? ink0 : lightness(bg) > 0.4 ? '#1d1b17' : '#f7f5f0';
  const rest = list.filter((c) => c !== bg && c !== ink).sort((a, b) => chroma(b) - chroma(a));
  const accent = rest[0] ?? (lightness(bg) > 0.4 ? '#e4572e' : '#ffb347');
  const accent2 = rest[1] ?? mix(accent, ink, 0.35);
  return {
    bg,
    soft: mix(bg, accent, 0.1),
    ink,
    muted: mix(ink, bg, 0.38),
    accent,
    accent2,
    onAccent: contrast('#ffffff', accent) >= contrast('#1d1b17', accent) ? '#ffffff' : '#1d1b17',
  };
}

/** `a` mixed with `b`, `t` of the way (0: a, 1: b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Ready-made palettes, as the New design picker and the Colours panel offer them. */
export const PALETTES: { id: string; label: string; colours: string[] }[] = [
  { id: 'sunset', label: 'Sunset', colours: ['#fff4e8', '#ff6b35', '#f7c548', '#2d1e2f', '#c1447a'] },
  { id: 'ocean', label: 'Ocean', colours: ['#eef6f9', '#0b3954', '#087e8b', '#bfd7ea', '#ff5a5f'] },
  { id: 'forest', label: 'Forest', colours: ['#f3f1e7', '#1f3a2e', '#4c8c4a', '#e0b84b', '#a3b18a'] },
  { id: 'berry', label: 'Berry', colours: ['#fff0f3', '#590d22', '#c9184a', '#ff8fa3', '#ffb703'] },
  { id: 'night', label: 'Night', colours: ['#0f1020', '#f5f3ff', '#8b5cf6', '#22d3ee', '#f472b6'] },
  { id: 'mono', label: 'Black and white', colours: ['#ffffff', '#111111', '#e63946', '#f1f1f1', '#6b6b6b'] },
  { id: 'pastel', label: 'Pastel', colours: ['#fdf6f0', '#4a4e69', '#f4a6a6', '#a8dadc', '#ffd6a5'] },
  { id: 'citrus', label: 'Citrus', colours: ['#fffbe6', '#1b2021', '#ff9f1c', '#2ec4b6', '#e71d36'] },
];
