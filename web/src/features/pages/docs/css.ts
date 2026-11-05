// How the documents editor looks around the words (the words themselves look as on the document's own page, from
// shared/docs.ts' docCss): the sheet of paper (its size and margins; on a narrow screen the width there is, with
// small margins), page breaks as a gap between sheets, a picked picture, equation or table of contents, the boxes
// of a checklist and a callout's emoji (each pressed to change), and a hint in an empty title and first paragraph.
// And the Google fonts a document uses, loaded through this server (the app's pages load no font from elsewhere).
import { useEffect, useState } from 'react';
import { docCss, docFonts, FONTS, INK, PAPERS, type Doc } from '@shared/docs';

/** A CSS string of words. */
const cssString = (s: string) => `"${s.replace(/["\\]/g, '\\$&').replace(/[\n\r]/g, ' ')}"`;

/** The width of a document's paper, in CSS pixels. */
export const paperPx = (doc: Doc) => Math.round((PAPERS[doc.page.size].w * 96) / 25.4);

export function editorCss(doc: Doc, o: { narrow: boolean; hints: { title: string; body: string } }): string {
  const paper = PAPERS[doc.page.size];
  const m = o.narrow ? '18px' : `${doc.page.margin}mm`;
  const s = '.nd-ed';
  return [
    docCss(doc, s),
    `${s}{box-sizing:border-box;background:#fff;color:${INK};outline:none;caret-color:#1a73e8;--m:${m};margin:0 auto;position:relative;` +
      (o.narrow
        ? 'width:100%;min-height:100%;padding:20px 18px 45vh;--nd-step:22pt}'
        : `width:${paper.w}mm;min-height:${paper.h}mm;padding:${m};box-shadow:0 1px 3px rgba(0,0,0,.12),0 8px 28px rgba(0,0,0,.08);border-radius:2px}`),
    // A page break: the paper cut, a gap of the page around it between the two sheets.
    `${s} .nd-pb{position:relative;height:28px;margin:calc(var(--m) * .7) calc(var(--m) * -1);background:var(--bg-2,#eceae6);box-shadow:inset 0 7px 6px -7px rgba(0,0,0,.25),inset 0 -7px 6px -7px rgba(0,0,0,.25);cursor:pointer;user-select:none}`,
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
