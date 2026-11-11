// How the documents editor looks around the words (the words themselves look as on the document's own page, from
// shared/docs.ts' docCss): the words laid on pages of the paper (its size and margins; the sheets themselves drawn
// behind them, PaperSheets.tsx), what the pages' layout puts in the words (paging.ts: a block moved to the next page,
// the gap where a paragraph or a table turns the page, a table's header row again), a page break as a mark at the
// end of its page; on a narrow screen the width there is, with small margins, and a page break as a gap. A picked
// picture, equation or table of contents, the boxes of a checklist and a callout's emoji (each pressed to change),
// and a hint in an empty title and first paragraph. And the Google fonts a document uses, loaded through this server
// (the app's pages load no font from elsewhere).
import { useEffect, useState } from 'react';
import { columnMm, docCss, docFonts, FONTS, INK, pageMargins, paperOf, textWidthMm, type Doc } from '@shared/docs';

/** A CSS string of words. */
const cssString = (s: string) => `"${s.replace(/["\\]/g, '\\$&').replace(/[\n\r]/g, ' ')}"`;

/** The width of a document's paper, in CSS pixels. */
export const paperPx = (doc: Doc) => Math.round((paperOf(doc.page).w * 96) / 25.4);

export function editorCss(doc: Doc, o: { narrow: boolean; hints: { title: string; body: string } }): string {
  const paper = paperOf(doc.page);
  // Each side's margin (page setup can give each its own).
  const pm = pageMargins(doc.page);
  // In columns, the words are one column wide (paging.ts sets each block in its column).
  const cols = !o.narrow && (doc.page.cols ?? 1) > 1 ? `padding-right:calc(${pm.right}mm + ${Math.round((textWidthMm(doc.page) - columnMm(doc.page)) * 100) / 100}mm);` : '';
  const m = o.narrow ? '18px' : `${pm.left}mm`;
  const pad = o.narrow ? m : `${pm.top}mm ${pm.right}mm ${pm.bottom}mm ${pm.left}mm`;
  const s = '.nd-ed';
  return [
    docCss(doc, s),
    `${s}{box-sizing:border-box;background:#fff;color:${INK};outline:none;caret-color:#1a73e8;--m:${m};margin:0 auto;position:relative;` +
      (o.narrow
        ? 'width:100%;min-height:100%;padding:20px 18px 45vh;--nd-step:22pt}'
        : // On pages, the sheets are drawn behind the words: the words' own element is clear.
          `width:${paper.w}mm;min-height:${paper.h}mm;padding:${pad};${cols}background:transparent}`),
    // A page break: on a narrow screen the paper cut, a gap of the page around it between the two sheets.
    `${s} .nd-pb{position:relative;height:28px;margin:calc(var(--m) * .7) calc(var(--m) * -1);background:var(--bg-2,#eceae6);box-shadow:inset 0 7px 6px -7px rgba(0,0,0,.25),inset 0 -7px 6px -7px rgba(0,0,0,.25);cursor:pointer;user-select:none}`,
    ...(o.narrow
      ? []
      : [
          // On pages: a dashed mark at the end of its page's words (what follows starts the next page).
          `${s} .nd-pb{height:16px;margin:6px 0 0;background:none;box-shadow:none;border-top:1px dashed #c4c7cc}`,
          // What the pages' layout puts in the words: a block moved to the next page, the gap where a paragraph or a
          // table turns the page (never words, never picked), a table's header row again.
          `${s} .nd-push{margin-top:var(--nd-push)!important}`,
          `${s} .nd-cut{display:block;user-select:none;pointer-events:none}`,
          `${s} tr.nd-cutrow td{padding:0!important;border:0!important;background:transparent!important}`,
          `${s} tr.nd-cutrow,${s} tr.nd-rehead{user-select:none;pointer-events:none}`,
          `${s} tr.nd-rehead th{background:#f3f5f7;font-weight:700}`,
          // A picture fits on a page.
          `${s} .nd-img img{max-height:calc(${paper.h}mm - ${pm.top + pm.bottom}mm - 2em);object-fit:contain}`,
        ]),
    `${s} .nd-pb::after{content:attr(data-label);position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:500 11px/1 system-ui,-apple-system,sans-serif;color:var(--fg-3,#8a8a8a);letter-spacing:.02em;white-space:nowrap}`,
    `${s} .nd-hr{cursor:pointer;user-select:none}`,
    `${s} figure.nd-img{cursor:pointer;user-select:none}`,
    `${s} .nd-picked img{outline:2px solid #1a73e8;outline-offset:1px}`,
    `${s} .nd-hr.nd-picked,${s} .nd-pb.nd-picked{outline:2px solid #1a73e8;outline-offset:-2px}`,
    `${s} .nd-check::before{cursor:pointer}`,
    `${s} .nd-callout::before{cursor:pointer}`,
    `${s} .nd-toc,${s} .nd-math{cursor:pointer;user-select:none;border-radius:6px}`,
    `${s} .nd-toc:hover,${s} .nd-math:hover{background:rgba(26,115,232,.05)}`,
    `${s} .nd-toc a{cursor:pointer}${s} .nd-toc a:hover{color:#1a5fd8;text-decoration:underline}`,
    `${s} .nd-toc.nd-picked,${s} .nd-math.nd-picked{outline:2px solid #1a73e8;outline-offset:2px}`,
    `${s} .nd-m{cursor:pointer;border-radius:3px}${s} .nd-m:hover{background:rgba(26,115,232,.08)}`,
    // Footnotes' marks, citations and cross-references (each clicked to change); a table's caption; a bookmark's ribbon in the margin.
    `${s} .nd-x{cursor:pointer;border-radius:3px}${s} .nd-x:hover{background:rgba(26,115,232,.1)}`,
    `${s} caption.nd-cap{cursor:pointer}${s} caption.nd-cap:hover{color:#1a5fd8}`,
    `${s} .nd-b[data-bm]{position:relative}${s} .nd-b[data-bm]::after{content:"";position:absolute;left:-18px;top:.3em;width:9px;height:12px;background:#1a73e8;opacity:.75;clip-path:polygon(0 0,100% 0,100% 100%,50% 72%,0 100%)}`,
    `${s} ::selection{background:rgba(26,115,232,.22)}`,
    `${s} a{cursor:text}`,
    // Hints in a document that has nothing in it yet.
    `${s} > .nd-title:first-child:has(> br[data-ph]:only-child)::before{content:${cssString(o.hints.title)};color:#a0a5ab;position:absolute;pointer-events:none}`,
    `${s} > .nd-title:first-child + .nd-normal:last-child:has(> br[data-ph]:only-child)::before{content:${cssString(o.hints.body)};color:#a0a5ab;position:absolute;pointer-events:none}`,
  ].join('\n');
}

const loaded = new Set<string>();

/** Google's fonts a document uses, loaded (once each); a number that changes as fonts arrive (words take another width). */
export function useDocFonts(doc: Doc | null): number {
  const [n, setN] = useState(0);
  const key = doc ? docFonts(doc).join('|') : '';
  useEffect(() => {
    if (!key) return;
    for (const name of key.split('|')) {
      if (loaded.has(name) || !FONTS.some((f) => f.google && f.name === name)) continue;
      loaded.add(name);
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = `/api/pages/fonts.css?f=${encodeURIComponent(name)}`;
      document.head.appendChild(l);
    }
    const on = () => setN((x) => x + 1);
    document.fonts?.addEventListener?.('loadingdone', on);
    return () => document.fonts?.removeEventListener?.('loadingdone', on);
  }, [key]);
  return n;
}
