// Pictures of a deck's parts for its PowerPoint file, made in the browser the app takes its pictures with: each icon
// as a PNG (the file gets its SVG too; the PNG is for programs that do not read SVG) and each equation as KaTeX draws
// it. One page holds them all, each at its size on the slide, and each is taken at up to twice that. Without a browser
// (or offline, for KaTeX) there are none of that kind: icons then go as SVG alone, equations as their LaTeX.
import { everyEl, type Deck, type El } from '../../shared/slides.ts';
import { canCapture, withTab } from '../capture/index.ts';
import { iconSvgText, type Picture } from './pptx.ts';
import { deckHasMath, FONTS_JSON, KATEX_TAGS, RUNTIME_SRC } from './slides.ts';

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
    } else b.appendChild(RT.part(c.deck, c.deck.slides[it.s], it.el, {}));
    document.body.appendChild(b);
    y += Math.ceil(it.h) + 8;
  });
  window.__fit = function () { RT.fit(document.body); };
  window.__fit();
})((${RUNTIME_SRC})(window, ${FONTS_JSON}))`;
  return `<!doctype html><html><head><meta charset="utf-8">${deckHasMath(deck) ? KATEX_TAGS : ''}<style>html,body{margin:0;background:transparent}.it{position:absolute;left:0;overflow:visible}.it img{display:block;width:100%;height:100%}</style></head><body><script type="application/json" id="n-r">${json}</script><script>${script}</script></body></html>`;
}

/** The deck's icons and equations as pictures, by "icon:<id>" and "math:<id>". */
export async function deckRenders(deck: Deck): Promise<Map<string, Picture>> {
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
  if (!items.length) return out;
  const width = Math.min(4000, Math.ceil(Math.max(800, ...items.map((i) => i.w))));
  return withTab({ html: page(deck, items), width, height: 800, settleMs: 150, blockPrivate: true }, async (tab) => {
    const katex = await tab.evaluate<boolean>('document.fonts.ready.then(() => new Promise((ok) => setTimeout(() => { window.__fit(); ok(!!window.katex); }, 120)))');
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
