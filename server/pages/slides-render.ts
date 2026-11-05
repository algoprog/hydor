// Pictures of a deck, made in the browser the app takes its pictures with. For its PowerPoint file, pictures of its
// parts: each icon as a PNG (the file gets its SVG too; the PNG is for programs that do not read SVG) and each equation
// as the server's KaTeX draws it; one page holds them all, each at its size on the slide, and each is taken at up to
// twice that. Pictures whose colours were changed (brightness, contrast, saturation, blur) go changed, by the
// browser's own filters as the editor shows them: Office's picture effects work otherwise (its brightness moves colours
// towards white where the browser's multiplies them, and PowerPoint itself keeps corrected pictures as their pixels).
// Without a browser there are none of these: icons then go as SVG alone, equations as their LaTeX, pictures with
// PowerPoint's nearest effects. And its slides as pictures (the PNG export): taken from the deck's own page as it
// prints, twice its size.
import { everyEl, type Deck, type El, type ImageEl } from '../../shared/slides.ts';
import { canCapture, withTab } from '../capture/index.ts';
import { iconSvgText, type Picture } from './pptx.ts';
import type { DB } from '../db.ts';
import { deckPage, FONTS_JSON, mathTags, RUNTIME_SRC } from './slides.ts';

interface Item {
  n: number;
  key: string;
  w: number;
  h: number;
  /** An icon: its SVG, as base64. */
  svg?: string;
  /** An equation: its slide, and the part at the page's corner. */
  s?: number;
  el?: El;
}

const MAX_ITEMS = 300;

/** The page: each item in a box of its own, one under another; the runtime draws the equations. */
function page(deck: Deck, items: Item[]): string {
  const json = JSON.stringify({ deck: { ...deck, slides: deck.slides.map((s) => ({ ...s, els: [] })) }, items })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const script = `(function (RT) {
  var c = JSON.parse(document.getElementById('n-r').textContent);
  var katex = RT.maths();
  RT.style();
  var y = 0;
  c.items.forEach(function (it) {
    var b = document.createElement('div');
    b.className = 'it';
    b.style.top = y + 'px';
    b.style.width = it.w + 'px';
    b.style.height = it.h + 'px';
    if (it.svg) {
      var i = new Image();
      i.src = 'data:image/svg+xml;base64,' + it.svg;
      b.appendChild(i);
    } else b.appendChild(RT.part(c.deck, c.deck.slides[it.s], it.el, { katex: katex }));
    document.body.appendChild(b);
    y += Math.ceil(it.h) + 8;
  });
  window.__fit = function () { RT.fit(document.body); };
  window.__fit();
})((${RUNTIME_SRC})(window, ${FONTS_JSON}))`;
  const maths = mathTags(deck);
  return `<!doctype html><html><head><meta charset="utf-8">${maths.head}<style>html,body{margin:0;background:transparent}.it{position:absolute;left:0;overflow:visible}.it img{display:block;width:100%;height:100%}</style></head><body><script type="application/json" id="n-r">${json}</script>${maths.body}<script>${script}</script></body></html>`;
}

/** Whether a picture's colours are changed in a way only its pixels can show (grey alone is PowerPoint's own grayscl). */
export const recoloured = (e: ImageEl) => !!e.adjust && (!!e.adjust.bright || !!e.adjust.contrast || (e.adjust.sat !== undefined && e.adjust.sat !== 100) || !!e.adjust.blur);

/** The CSS filter the editor draws a picture's colours with (shared/slides-runtime.ts), its blur in the picture's own pixels (`k` of them to a slide pixel). */
function filterOf(e: ImageEl, k: number): string {
  const a = e.adjust ?? {};
  return [
    a.bright ? `brightness(${1 + a.bright / 100})` : '',
    a.contrast ? `contrast(${1 + a.contrast / 100})` : '',
    a.sat !== undefined && a.sat !== 100 ? `saturate(${a.sat / 100})` : '',
    a.gray ? 'grayscale(1)' : '',
    a.blur ? `blur(${Math.round(a.blur * k * 100) / 100}px)` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** How many of a picture's own pixels make one of the slide's, as the editor shows it (cropped, or fitted to its box). */
function pixelsPerSlidePx(e: ImageEl, pic: Picture): number {
  const w = Math.max(1, Math.abs(e.w));
  const h = Math.max(1, Math.abs(e.h));
  if (e.crop) return Math.sqrt(((pic.w * (1 - e.crop.l - e.crop.r)) / w) * ((pic.h * (1 - e.crop.t - e.crop.b)) / h));
  const fit = e.fit ?? 'cover';
  if (fit === 'cover') return 1 / Math.max(w / pic.w, h / pic.h);
  if (fit === 'contain') return 1 / Math.min(w / pic.w, h / pic.h);
  return Math.sqrt((pic.w / w) * (pic.h / h));
}

/** The pictures whose colours were changed, changed as the editor shows them, by "adjust:<id>": PNGs of their own size (at most 2400 pixels across). */
async function recolour(tab: { evaluate<T>(js: string): Promise<T> }, deck: Deck, picture: (src: string) => Picture | null, out: Map<string, Picture>): Promise<void> {
  const list = deck.slides.flatMap((s) => everyEl(s.els)).filter((e): e is ImageEl => e.type === 'image' && recoloured(e));
  for (const e of list.slice(0, MAX_ITEMS)) {
    const pic = e.src ? picture(e.src) : null;
    if (!pic || pic.w < 1 || pic.h < 1) continue;
    const q = Math.min(1, 2400 / Math.max(pic.w, pic.h));
    const w = Math.max(1, Math.round(pic.w * q));
    const h = Math.max(1, Math.round(pic.h * q));
    const url = `data:image/${pic.ext};base64,${pic.data.toString('base64')}`;
    const js = `new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; const g = c.getContext('2d'); g.filter = ${JSON.stringify(filterOf(e, pixelsPerSlidePx(e, pic) * q))}; g.drawImage(i, 0, 0, ${w}, ${h}); ok(c.toDataURL('image/png').split(',')[1]); }; i.onerror = () => ok(''); i.src = ${JSON.stringify(url)}; })`;
    const b64 = await tab.evaluate<string>(js).catch(() => '');
    if (b64) out.set(`adjust:${e.id}`, { data: Buffer.from(b64, 'base64'), ext: 'png', w, h });
  }
}

/**
 * The deck's icons and equations as pictures, by "icon:<id>" and "math:<id>", and its pictures whose colours were
 * changed, changed, by "adjust:<id>" (`picture` gives a picture's bytes as the file gets them).
 */
export async function deckRenders(deck: Deck, picture: (src: string) => Picture | null = () => null): Promise<Map<string, Picture>> {
  const out = new Map<string, Picture>();
  if (!canCapture()) return out;
  const items: Item[] = [];
  deck.slides.forEach((s, si) => {
    for (const e of everyEl(s.els)) {
      if (items.length >= MAX_ITEMS) return;
      const w = Math.max(4, Math.abs(e.w));
      const h = Math.max(4, Math.abs(e.h));
      // Drawn as they are, unturned and solid: the file turns them and makes them see-through itself.
      if (e.type === 'icon') items.push({ n: items.length, key: `icon:${e.id}`, w, h, svg: Buffer.from(iconSvgText(e, deck.theme), 'utf8').toString('base64') });
      else if (e.type === 'math') items.push({ n: items.length, key: `math:${e.id}`, w, h, s: si, el: { ...e, x: 0, y: 0, rot: undefined, opacity: undefined, link: undefined } });
    }
  });
  const adjusted = deck.slides.some((s) => everyEl(s.els).some((e) => e.type === 'image' && recoloured(e)));
  if (!items.length && !adjusted) return out;
  const width = Math.min(4000, Math.ceil(Math.max(800, ...items.map((i) => i.w))));
  return withTab({ html: page(deck, items), width, height: 800, settleMs: 150, blockPrivate: true }, async (tab) => {
    await recolour(tab, deck, picture, out);
    // Equations come drawn by the server's KaTeX (with its fonts inside the page): none is left as its LaTeX.
    const katex = await tab.evaluate<boolean>('document.fonts.ready.then(() => new Promise((ok) => setTimeout(() => { window.__fit(); ok(!!document.getElementById("n-math")); }, 120)))');
    await tab.s.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }).catch(() => {});
    const rects = await tab.evaluate<[number, number, number, number][]>('Array.from(document.querySelectorAll(".it")).map((b) => { const r = b.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.width, r.height]; })');
    for (const it of items) {
      const r = rects?.[it.n];
      if (!r || (it.el && !katex)) continue;
      const k = Math.max(0.25, Math.min(2, 2400 / Math.max(r[2], r[3])));
      const shot = await tab.s.send('Page.captureScreenshot', { format: 'png', clip: { x: r[0], y: r[1], width: r[2], height: r[3], scale: k }, captureBeyondViewport: true }, 30_000).catch(() => null);
      if (shot?.data) out.set(it.key, { data: Buffer.from(shot.data, 'base64'), ext: 'png', w: Math.round(r[2] * k), h: Math.round(r[3] * k) });
    }
    return out;
  }).catch(() => out);
}

/** The slides as PNG pictures, twice their size: every one the slideshow shows, or slide `only` (by its number) alone. */
export async function deckPictures(db: DB, deck: Deck, title: string, only?: number): Promise<{ n: number; data: Buffer }[]> {
  if (only !== undefined && !deck.slides[only - 1]) return [];
  // The printed page draws the slides the slideshow shows; for one, every other is left out (its number stays its own).
  const shown = only === undefined ? deck : { ...deck, slides: deck.slides.map((s, i) => ({ ...s, hidden: i !== only - 1 || undefined })) };
  const numbers = shown.slides.map((s, i) => (s.hidden ? 0 : i + 1)).filter(Boolean);
  if (!numbers.length) return [];
  const H = deck.ratio === '4:3' ? 960 : 720;
  return withTab({ html: deckPage(db, shown, title, 'print'), width: 1280, height: H, settleMs: 300, blockPrivate: true }, async (tab) => {
    await tab.s.send('Emulation.setEmulatedMedia', { media: 'print' });
    const rects = await tab.evaluate<[number, number][]>(
      'document.fonts.ready.then(() => new Promise((ok) => setTimeout(() => ok(Array.from(document.querySelectorAll(".ns-pg")).map((p) => { const r = p.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY]; })), 150)))',
    );
    const out: { n: number; data: Buffer }[] = [];
    for (let i = 0; i < Math.min(rects.length, numbers.length); i++) {
      const shot = await tab.s.send('Page.captureScreenshot', { format: 'png', clip: { x: rects[i][0], y: rects[i][1], width: 1280, height: H, scale: 2 }, captureBeyondViewport: true }, 30_000).catch(() => null);
      if (shot?.data) out.push({ n: numbers[i], data: Buffer.from(shot.data, 'base64') });
    }
    return out;
  });
}
