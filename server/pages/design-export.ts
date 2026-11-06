// Designs as files: each artboard exactly its size, as a picture (PNG, a see-through background if asked, or JPG) at
// 1×, 2× or 3× its pixels, or every artboard as a page of a PDF that is its own size on paper (an A4 poster prints on
// A4). Made by the browser the app takes pictures with (Settings → Browser), from the design's HTML: what is saved, or
// what the editor holds now. Also the picture of a design in the Library: its first artboard, whole.
import { designBoards, isDesignHtml } from '../../shared/design.ts';
import { HttpError } from '../auth.ts';
import { canCapture, withTab } from '../capture/index.ts';
import { printPdf } from '../capture/index.ts';
import { zipParts } from './ooxml.ts';

export type DesignFormat = 'png' | 'jpg' | 'pdf';
export const DESIGN_TYPES: Record<DesignFormat | 'zip', string> = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf', zip: 'application/zip' };

/** The most pixels a picture may have (a 18 × 24 in poster at 3× is about 36 million). */
export const MAX_PIXELS = 64_000_000;

const noBrowser = () => new HttpError(503, 'Making this file needs a browser on this computer: Settings → Browser can download one.');

/** Put first in the page: it shows exactly (no fitting to a window), on nothing, and marks its artboards in order. */
const exactHead = (css: string) =>
  `<script>document.documentElement.classList.add('n-exact');addEventListener('DOMContentLoaded',()=>document.querySelectorAll('.n-artboard').forEach((a,i)=>a.classList.add('n-b'+i)))</script><style id="n-exact">html,body{margin:0!important;padding:0!important;background:transparent!important;min-height:0!important}body.n-design-page{display:block!important;gap:0!important}.n-design{display:block!important}.n-artboard{box-shadow:none!important;zoom:1!important;margin:0!important}${css}</style>`;

const withHead = (html: string, head: string) => {
  const m = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(html);
  return m ? m[0] + head + html.slice(m[0].length) : head + html;
};

const READY = `Promise.all([document.fonts ? document.fonts.ready : null, ...[...document.images].map((i) => (i.decode ? i.decode().catch(() => null) : null))]).then(() => new Promise((ok) => setTimeout(() => ok(true), 160)))`;

/** A design's artboards as files: one picture, a zip of them (one a page), or a PDF. */
export async function exportDesign(html: string, o: { title: string; format: DesignFormat; scale?: number; transparent?: boolean; board?: number; name: (title: string, ext: string) => string }): Promise<{ data: Buffer; type: string; name: string; note?: string }> {
  if (!isDesignHtml(html)) throw new HttpError(400, 'That page is not a design');
  if (!canCapture()) throw noBrowser();
  const boards = designBoards(html);
  if (!boards.length) throw new HttpError(400, 'The design has no artboard with a size');
  const only = Number.isInteger(o.board) && o.board! >= 0 ? o.board! : null;
  if (only !== null && !boards[only]) throw new HttpError(404, 'No such page in the design');
  const picks = only !== null ? [only] : boards.map((_, i) => i);

  if (o.format === 'pdf') {
    // Each artboard a page of its own size (named pages), one after another.
    const css = `.n-artboard{display:block!important;break-after:page;position:relative!important}${boards.map((b, i) => `.n-b${i}{page:nb${i}}@page nb${i}{size:${b.w}px ${b.h}px;margin:0}`).join('')}${only !== null ? `.n-artboard:not(.n-b${only}){display:none!important}` : ''}`;
    const first = boards[only ?? 0];
    const data = await withTab({ html: withHead(html, exactHead(css)), width: first.w, height: first.h, settleMs: 300, blockPrivate: true }, async (tab) => {
      await tab.evaluate(READY).catch(() => {});
      return printPdf(tab.s, { paperWidth: first.w / 96, paperHeight: first.h / 96, margin: 0, cssPageSize: true });
    });
    return { data, type: DESIGN_TYPES.pdf, name: o.name(o.title, 'pdf') };
  }

  const want = Math.max(1, Math.min(3, Math.round(o.scale ?? 1)));
  let note: string | undefined;
  const css = `.n-artboard{display:none!important}.n-artboard.n-on{display:block!important;position:absolute!important;left:0!important;top:0!important}${o.transparent ? '.n-artboard.n-on{background:transparent!important}' : ''}`;
  const shots = await withTab({ html: withHead(html, exactHead(css)), width: boards[picks[0]].w, height: boards[picks[0]].h, scale: want, settleMs: 300, blockPrivate: true }, async (tab) => {
    await tab.evaluate(READY).catch(() => {});
    if (o.transparent) await tab.s.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }).catch(() => {});
    const out: { i: number; data: Buffer }[] = [];
    for (const i of picks) {
      const b = boards[i];
      let k = want;
      while (k > 1 && b.w * b.h * k * k > MAX_PIXELS) k--;
      if (k < want) note = `Made at ${k}× (larger would be over ${MAX_PIXELS / 1_000_000} million pixels).`;
      await tab.s.send('Emulation.setDeviceMetricsOverride', { width: b.w, height: b.h, deviceScaleFactor: k, mobile: false });
      await tab.evaluate(`(() => { document.querySelectorAll('.n-artboard').forEach((a, j) => a.classList.toggle('n-on', j === ${i})); return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true)))); })()`);
      const shot = await tab.s.send(
        'Page.captureScreenshot',
        { format: o.format === 'jpg' ? 'jpeg' : 'png', quality: o.format === 'jpg' ? 92 : undefined, clip: { x: 0, y: 0, width: b.w, height: b.h, scale: 1 }, captureBeyondViewport: false },
        60_000,
      );
      out.push({ i, data: Buffer.from(shot.data, 'base64') });
    }
    return out;
  });
  const ext = o.format === 'jpg' ? 'jpg' : 'png';
  if (shots.length === 1) return { data: shots[0].data, type: DESIGN_TYPES[o.format], name: o.name(boards.length > 1 ? `${o.title} ${shots[0].i + 1}` : o.title, ext), note };
  return { data: zipParts(shots.map((s) => ({ name: `page-${String(s.i + 1).padStart(2, '0')}.${ext}`, data: s.data }))), type: DESIGN_TYPES.zip, name: o.name(`${o.title} pages`, 'zip'), note };
}

/** The Library's picture of a design: its first artboard whole, in the middle of a quiet ground (the size pictures are taken at). */
export function designThumbHtml(html: string, box = { w: 880, h: 550 }): string | null {
  const b = designBoards(html)[0];
  if (!b) return null;
  const pad = 36;
  const z = Math.min((box.w - pad * 2) / b.w, (box.h - pad * 2) / b.h, 1.5);
  const css = `body.n-design-page{display:flex!important;align-items:center;justify-content:center;width:${box.w}px;height:${box.h}px;background:#e9e6e0!important;overflow:hidden}.n-design{display:contents!important}.n-artboard{display:none!important}.n-artboard.n-b0{display:block!important;zoom:${Math.round(z * 1000) / 1000}!important;box-shadow:0 2px 10px rgba(0,0,0,.18)!important}`;
  return withHead(html, exactHead(css).replace('html,body{margin:0!important;padding:0!important;background:transparent!important;min-height:0!important}', 'html,body{margin:0!important;padding:0!important;min-height:0!important}'));
}
