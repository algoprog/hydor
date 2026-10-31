// PDFs: their text page by page, laid out as on the page (pdftotext -layout, from poppler-utils). Where
// pdftotext is missing, pdf.js reads them instead: installed once into the app's data folder (it needs
// the internet that first time, about 35 MB) and run in a process of its own, so a heavy or hostile
// PDF cannot stall the caller. pdf.js only approximates the layout (lines rebuilt from positions).
// Pages without text are reported: usually scans, which need looking at as images or OCR.
import fs from 'node:fs';
import path from 'node:path';
import type { DocModel, DocPart } from '../../shared/documents.ts';
import type { Budget } from './model.ts';
import { dataDir, run, which } from './tools.ts';

export const PDFJS = 'pdfjs-dist@5.4.624';

/** "3, 5–7, 10". */
function ranges(pages: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < pages.length; ) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(j > i ? `${pages[i]}–${pages[j]}` : String(pages[i]));
    i = j + 1;
  }
  return out.join(', ');
}

/** A page's text without trailing spaces, the margin all its lines share, or runs of blank lines. */
function tidy(page: string): string {
  const lines = page.split('\n').map((l) => l.replace(/\s+$/, ''));
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
  return lines
    .map((l) => (Number.isFinite(indent) ? l.slice(indent) : l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

let installing: Promise<string> | null = null;

/** pdf.js in the data folder, installed now if it is not there yet. */
function pdfjs(): Promise<string> {
  const dir = path.join(dataDir(), 'tools', 'pdfjs');
  if (fs.existsSync(path.join(dir, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'))) return Promise.resolve(dir);
  installing ??= (async () => {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, 'package.json'))) fs.writeFileSync(path.join(dir, 'package.json'), '{ "private": true }\n');
    const nodeDir = path.dirname(process.execPath);
    const npm = fs.existsSync(path.join(nodeDir, 'npm')) ? path.join(nodeDir, 'npm') : 'npm';
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}` };
    delete env.NODE_ENV;
    const r = await run(npm, ['install', '--prefix', dir, PDFJS, '--omit=optional', '--no-audit', '--no-fund', '--loglevel=error'], { timeout: 300_000, env });
    if (!fs.existsSync(path.join(dir, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')))
      throw new Error(`Reading PDFs needs pdftotext (in poppler-utils), which is not installed here, and pdf.js could not be fetched instead (${r.err.trim().split('\n').pop()?.slice(0, 160) || 'no answer'}).`);
    return dir;
  })().finally(() => (installing = null));
  return installing;
}

/** Runs in a node process of its own: each page's text as a JSON line, then the page count. */
const PDFJS_SCRIPT = `
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [file, dir, max] = process.argv.slice(-3);
// Stand-ins for the drawing classes pdf.js wants when it loads (from a native canvas package, left
// out): reading text never draws.
globalThis.DOMMatrix ??= class DOMMatrix {
  constructor(m) { const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = Array.isArray(m) ? m : []; Object.assign(this, { a, b, c, d, e, f }); }
  multiplySelf() { return this; } preMultiplySelf() { return this; } translateSelf() { return this; } scaleSelf() { return this; } invertSelf() { return this; }
  multiply() { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]); } translate() { return this.multiply(); } scale() { return this.multiply(); } inverse() { return this.multiply(); }
  transformPoint(p) { return p; }
};
globalThis.Path2D ??= class Path2D { addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} rect() {} };
globalThis.ImageData ??= class ImageData { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
const lib = dir + '/node_modules/pdfjs-dist/';
const pdfjs = await import(pathToFileURL(lib + 'legacy/build/pdf.mjs').href);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0, cMapUrl: lib + 'cmaps/', cMapPacked: true, standardFontDataUrl: lib + 'standard_fonts/' }).promise;
const n = Math.min(doc.numPages, Number(max));
for (let i = 1; i <= n; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const lines = [];
  let cur = null;
  for (const it of tc.items) {
    if (typeof it.str !== 'string') continue;
    const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
    if (!cur || Math.abs(cur.y - y) > h * 0.5) lines.push((cur = { y, parts: [] }));
    cur.parts.push({ x, w: it.width || 0, s: it.str });
    if (it.hasEOL) cur = null;
  }
  lines.sort((a, b) => b.y - a.y);
  const text = lines.map((l) => {
    l.parts.sort((a, b) => a.x - b.x);
    let s = '', end = null;
    for (const p of l.parts) { if (end !== null && p.x - end > 1.5 && !s.endsWith(' ') && !p.s.startsWith(' ')) s += ' '; s += p.s; end = p.x + p.w; }
    return s;
  }).join('\\n');
  process.stdout.write(JSON.stringify({ p: i, t: text }) + '\\n');
  page.cleanup();
}
process.stdout.write(JSON.stringify({ total: doc.numPages }) + '\\n');
`;

/** Each page's text through pdf.js (when pdftotext is not here). */
export async function pdfjsPages(file: string, maxPages = 2000): Promise<{ pages: string[]; total: number }> {
  const dir = await pdfjs();
  const r = await run(process.execPath, ['--input-type=module', '-e', PDFJS_SCRIPT, file, dir, String(maxPages)], { timeout: 180_000, maxBuffer: 256 << 20 });
  const pages: string[] = [];
  let total = 0;
  for (const line of r.out.split('\n')) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (typeof m.t === 'string') pages.push(m.t);
      else if (typeof m.total === 'number') total = m.total;
    } catch {}
  }
  if (!r.ok && !pages.length) {
    if (/password/i.test(r.err)) throw new Error('This PDF is locked with a password.');
    throw new Error(`pdf.js could not read this PDF (${r.err.trim().split('\n').pop()?.slice(0, 200) ?? 'no answer'})`);
  }
  return { pages, total: total || pages.length };
}

export async function readPdf(file: string, budget: Budget): Promise<DocModel> {
  const bin = which('pdftotext');
  let pages: string[];
  let total: number;
  const notes: string[] = [];
  if (bin) {
    const r = await run(bin, ['-layout', '-enc', 'UTF-8', file, '-'], { timeout: 120_000, maxBuffer: 256 << 20 });
    if (!r.ok && !r.out) {
      if (/password|encrypt/i.test(r.err)) return { format: 'pdf', parts: [], notes: ['This PDF is locked with a password, so its text cannot be read.'] };
      throw new Error(`This PDF could not be read; it may be damaged (${r.err.trim().split('\n').pop()?.slice(0, 200) || 'pdftotext gave no answer'}).`);
    }
    pages = r.out.split('\f');
    if (pages.length > 1 && !pages[pages.length - 1].trim()) pages.pop();
    total = pages.length;
  } else {
    ({ pages, total } = await pdfjsPages(file));
    notes.push('Read with pdf.js (pdftotext is not installed here), so the layout is approximate.');
  }
  const parts: DocPart[] = [];
  const empty: number[] = [];
  pages.forEach((p, i) => {
    if (p.replace(/\s+/g, '').length < 15) empty.push(i + 1);
    if (budget.cut) return;
    const text = tidy(p);
    budget.take(text.length + 12);
    parts.push({ kind: 'page', blocks: text ? [{ k: 'pre', text }] : [] });
  });
  if (parts.length < total) notes.push(`Only the first ${parts.length} of ${total} pages were read: the PDF has more text than this reads at once.`);
  if (pages.length && empty.length === pages.length)
    notes.unshift('This PDF has no text layer: it is probably scanned. To read it, look at its pages as images (pdftoppm -png -r 110 file.pdf page) or run OCR on them.');
  else if (empty.length) notes.unshift(`Page${empty.length > 1 ? 's' : ''} ${ranges(empty)} ${empty.length > 1 ? 'have' : 'has'} no text: scanned image${empty.length > 1 ? 's' : ''}, or blank.`);
  return { format: 'pdf', parts, notes };
}
