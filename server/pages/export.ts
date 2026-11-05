// Pages as files to keep or send: a page of HTML as a PDF (Chromium prints it as it shows, with its data) or a Word
// document (docx.ts reads what it shows into paragraphs, lists, tables and pictures); the other kinds (kinds.ts)
// as their own files, made from the model itself (a deck as PowerPoint, a document as Word or Markdown, a
// spreadsheet as Excel or CSV, a notebook as its .ipynb or a Python script), and as a PDF printed from their own page; any of them as a web page that works on
// its own; a deck's slides as pictures (PNG). PDFs, pictures, and a page's Word document, need the browser pictures
// are taken with (Settings → Browser).
import { STORAGE_LIMITS } from '../../shared/pages.ts';
import { KIT_CSS } from '../../shared/page-kit.ts';
import { codeColoursScript, hasCode } from '../../shared/code-colours.ts';
import { pageDbScript } from '../../shared/page-db.ts';
import { ASSET } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { canCapture, printPdf, withTab } from '../capture/index.ts';
import type { DB } from '../db.ts';
import { fetchPage } from '../web/fetch.ts';
import { getAsset, pictureType } from './assets.ts';
import { docFaces, readDoc } from './docs.ts';
import { docxOfPage } from './docx.ts';
import { injectHead, kitHead } from './kit.ts';
import { imageSize, zipParts } from './ooxml.ts';
import type { Picture } from './pptx.ts';
import { mustKind, type ExportFormat, type ExportHelp, type KindDef } from './kinds.ts';
import { readDeck } from './slides.ts';
import { deckPictures, deckRenders } from './slides-render.ts';
import { dbSeed, mustPage, pageSource, storageMap } from './store.ts';
import { wordFonts } from './word-fonts.ts';

export type { ExportFormat };

export const EXPORT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  tex: 'application/x-tex; charset=utf-8',
  zip: 'application/zip',
  html: 'text/html; charset=utf-8',
  ipynb: 'application/x-ipynb+json',
  py: 'text/x-python; charset=utf-8',
  png: 'image/png',
};

export type Paper = 'a4' | 'letter';
const PAPER: Record<Paper, { w: number; h: number }> = { a4: { w: 8.27, h: 11.69 }, letter: { w: 8.5, h: 11 } };

/** A file name from a title: its words, without what file systems refuse. */
export function fileName(title: string, ext: string): string {
  const base = title
    .replace(/[\u0000-\u001f\u007f/\\?%*:|"<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return `${base || 'page'}.${ext}`;
}

const noBrowser = () => new HttpError(503, 'Making this file needs a browser on this computer: Settings → Browser can download one.');

/** Printed, a page in the app's look is on white paper. */
const PRINT_CSS = '<style>@media print{:root{--n-bg:#fff}}</style>';

/** The kit as a page has it in the app, light, with the data it keeps (and nothing to send it to). */
const pageHead = (db: DB, id: string) => kitHead({ n: '', theme: 'light', max: { key: STORAGE_LIMITS.key, value: STORAGE_LIMITS.value }, seed: storageMap(db, id) }) + PRINT_CSS;

/**
 * A page as a file to open anywhere: with the kit's stylesheet, light or dark as that device is, its code blocks'
 * colours, and its databases with what they hold now (`dbs`: their stored values by key), shown as they are.
 */
export const pageFileHtml = (html: string, dbs?: Record<string, string>) =>
  injectHead(
    html,
    `<style id="n-kit">${KIT_CSS}</style><script>document.documentElement.setAttribute('data-n-theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')</script>${hasCode(html) ? codeColoursScript() : ''}${/\bn-db\b/.test(html) ? pageDbScript(null, dbs) : ''}`,
  );

/** A picture made into PNG by the browser (an SVG, or WebP that PowerPoint may not read), at its own size or `w`×`h`. */
async function rasterize(data: Buffer, mime: string, w?: number, h?: number): Promise<Picture | null> {
  if (!canCapture()) return null;
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block}</style></head><body><img id="i" src="data:${mime};base64,${data.toString('base64')}"></body></html>`;
  return withTab({ html, width: 1600, height: 1200, settleMs: 100 }, async (tab) => {
    const size = await tab.evaluate<[number, number]>('(() => { const i = document.getElementById("i"); return [i.naturalWidth || 0, i.naturalHeight || 0]; })()');
    let nw = size[0] || w || 1024;
    let nh = size[1] || h || 768;
    // Large enough to stay sharp on a slide, small enough to stay light.
    const k = Math.min(2400 / nw, 2400 / nh, nw < 800 && nh < 800 ? 2 : 1);
    nw = Math.max(1, Math.round(nw * k));
    nh = Math.max(1, Math.round(nh * k));
    await tab.evaluate(`(() => { const i = document.getElementById("i"); i.style.width = "${nw}px"; i.style.height = "${nh}px"; return true; })()`);
    await tab.s.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }).catch(() => {});
    const shot = await tab.s.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: nw, height: nh, scale: 1 }, captureBeyondViewport: true }, 30_000);
    return { data: Buffer.from(shot.data, 'base64'), ext: 'png' as const, w: nw, h: nh };
  }).catch(() => null);
}

/** A deck's (or a document's) picture for an Office file: PNG, JPEG or GIF as it is, SVG and WebP made into PNG where the browser can. */
export async function pictureFor(db: DB, src: string): Promise<Picture | null> {
  let data: Buffer | null = null;
  let mime: string | null = null;
  if (src.startsWith(ASSET)) {
    const a = getAsset(db, src.slice(ASSET.length));
    if (a) ({ data, mime } = a);
  } else if (src.startsWith('data:')) {
    const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(src);
    if (m) {
      data = Buffer.from(m[2], 'base64');
      mime = pictureType(data);
    }
  } else if (/^https?:\/\//i.test(src)) {
    const r = await fetchPage(src, { maxBytes: 12 * 1024 * 1024, timeoutMs: 20_000 }).catch(() => null);
    data = r?.body ?? (r && /svg/i.test(r.contentType) ? Buffer.from(r.text, 'utf8') : null);
    mime = data ? pictureType(data) : null;
  }
  if (!data || !mime) return null;
  if (mime === 'image/svg+xml' || mime === 'image/webp') {
    const png = await rasterize(data, mime);
    if (png) return png;
    if (mime === 'image/svg+xml') return null;
  }
  const size = imageSize(data);
  return size ? { data, ext: size.type, w: size.w, h: size.h } : null;
}

/** How much each text box was made smaller to fit, as the browser lays out the kind's printed page. */
async function fitScales(db: DB, k: KindDef, text: string, title: string): Promise<Map<string, number> | undefined> {
  if (!canCapture()) return undefined;
  const html = await k.page(db, text, title, 'print');
  return withTab({ html, width: k.still(text).width, height: k.still(text).height, settleMs: 300, blockPrivate: true }, async (tab) => {
    const got = await tab.evaluate<Record<string, number>>(
      `document.fonts.ready.then(() => new Promise((ok) => setTimeout(() => { const out = {}; for (const b of document.querySelectorAll('.ns-txt[data-fit]')) { const v = parseFloat(b.style.getPropertyValue('--fs') || '1'); if (v < 0.999 && b.parentElement && b.parentElement.dataset.id) out[b.parentElement.dataset.id] = v; } ok(out); }, 80)))`,
    );
    return new Map(Object.entries(got ?? {}));
  }).catch(() => undefined);
}

/** What a kind exports as: its own files, a PDF and a web page. */
export const formatsOf = (k: KindDef): ExportFormat[] => [...new Set([...(Object.keys(k.files) as ExportFormat[]), 'pdf', 'html'] as ExportFormat[])];

/** A page, deck, document or spreadsheet (its current version, or `version`) as a file. */
export async function exportPage(db: DB, id: string, o: { format: ExportFormat; version?: number; paper?: Paper; slide?: number }): Promise<{ data: Buffer; type: string; name: string; note?: string }> {
  mustPage(db, id);
  const src = pageSource(db, id, Number.isInteger(o.version) && o.version! > 0 ? o.version : undefined);
  if (!src) throw new HttpError(404, 'That version is no longer kept');
  const title = src.title;
  const out = (data: Buffer | string, ext: string) => ({ data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), type: EXPORT_TYPES[o.format], name: fileName(title, ext) });
  const paper = PAPER[o.paper ?? 'a4'];

  // A deck's slides as pictures: one (by its number), or every one the slideshow shows, in a zip.
  if (o.format === 'png') {
    if (src.kind !== 'slides') throw new HttpError(400, 'Only slides export as pictures');
    if (!canCapture()) throw noBrowser();
    const one = Number.isInteger(o.slide) && o.slide! > 0 ? o.slide : undefined;
    const pics = await deckPictures(db, readDeck(src.text), title, one);
    if (!pics.length) throw new HttpError(one ? 404 : 400, one ? 'No such slide' : 'The deck has no slides to show');
    if (one) return { data: pics[0].data, type: 'image/png', name: fileName(`${title} ${one}`, 'png') };
    return { data: zipParts(pics.map((p) => ({ name: `slide-${String(p.n).padStart(2, '0')}.png`, data: p.data }))), type: EXPORT_TYPES.zip, name: fileName(`${title} slides`, 'zip') };
  }

  if (src.kind !== 'page') {
    const k = mustKind(src.kind);
    if (o.format === 'html' && !k.files.html) return out(await k.page(db, src.text, title, 'viewer'), 'html');
    if (o.format === 'pdf' && !k.files.pdf) {
      if (!canCapture()) throw noBrowser();
      // Its printed page says its own paper (@page): a slide a page, a document's A4 or Letter, a sheet across.
      const html = await k.page(db, src.text, title, 'print');
      const size = k.still(src.text);
      const data = await withTab({ html, width: size.width, height: size.height, settleMs: 400, blockPrivate: true }, async (tab) => {
        await tab.evaluate('document.fonts.ready.then(() => new Promise((ok) => setTimeout(() => ok(true), 120)))');
        return printPdf(tab.s, { paperWidth: paper.w, paperHeight: paper.h, margin: 0, cssPageSize: true });
      });
      return out(data, 'pdf');
    }
    const make = k.files[o.format];
    if (!make) throw new HttpError(400, `A ${k.noun} exports as ${formatsOf(k).join(', ')}`);
    // Office files want their pictures ready (PNG, JPEG or GIF), and slides how much their text was fitted.
    const pics = new Map<string, Picture | null>();
    let scales: ExportHelp['scales'];
    if (o.format === 'pptx' || o.format === 'docx') {
      for (const s of new Set(k.sources(src.text))) pics.set(s, await pictureFor(db, s));
    }
    let renders: ExportHelp['renders'];
    // A document's fonts go inside its Word file (the faces it uses, from Google once).
    const wordFontsOf = o.format === 'docx' && src.kind === 'doc' ? await wordFonts(docFaces(readDoc(src.text))) : undefined;
    if (o.format === 'pptx') {
      scales = await fitScales(db, k, src.text, title);
      // A deck's icons and equations, as pictures for PowerPoint, and its pictures whose colours were changed, changed.
      if (src.kind === 'slides') renders = await deckRenders(readDeck(src.text), (s) => pics.get(s) ?? null);
    }
    const notes: string[] = [];
    const made = out(await make(db, src.text, title, { picture: (s) => pics.get(s) ?? null, scales, renders, wordFonts: wordFontsOf, note: (t) => notes.push(t) }), o.format);
    return notes.length ? { ...made, note: notes.join(' ') } : made;
  }

  if (o.format === 'html') return out(pageFileHtml(src.text, dbSeed(db, id)), 'html');
  if (o.format === 'pdf') {
    if (!canCapture()) throw noBrowser();
    const html = injectHead(src.text, pageHead(db, id));
    // On paper, what a toggle folds away shows too.
    const data = await withTab({ html, width: 1024, height: 800, settleMs: 900, blockPrivate: true }, async (tab) => {
      await tab.evaluate('(() => { for (const d of document.querySelectorAll("details")) d.open = true; return true; })()').catch(() => {});
      return printPdf(tab.s, { paperWidth: paper.w, paperHeight: paper.h, margin: 0.5 });
    });
    return out(data, 'pdf');
  }
  if (o.format === 'docx') {
    if (!canCapture()) throw noBrowser();
    return out(await docxOfPage(injectHead(src.text, pageHead(db, id)), { title, paper: o.paper ?? 'a4' }), 'docx');
  }
  throw new HttpError(400, 'A page exports as a PDF, a Word document (docx) or a web page (html)');
}
