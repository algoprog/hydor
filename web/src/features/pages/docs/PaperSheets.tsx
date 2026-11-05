// The sheets of paper a document's pages are drawn on in the editor (paging.ts lays its words out on them): each
// sheet behind the words, one under another with a gap between, and over them each sheet's header and footer on its
// margins, {page} and {pages} as the sheet's number and how many there are ("Page 3 of 9"), none on the first page of
// a document with a title page. A click on a header or footer changes them. All in the editor's own coordinates (the
// words' element at the host's top left), at the zoom the page is shown at.
import { FONTS, PAPERS, type Doc } from '@shared/docs';
import { GAP, type Layout } from './paging';

const MM = 96 / 25.4;

/** The sheets, behind the words (`width`: the paper's, as shown). */
export function Sheets({ layout, zoom, width }: { layout: Layout; zoom: number; width: number }) {
  const step = (layout.pageH + GAP) * zoom;
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 left-0" style={{ width }}>
      {Array.from({ length: layout.count }, (_, i) => (
        <div
          key={i}
          className="absolute left-0 w-full rounded-[2px] bg-white"
          style={{ top: i * step, height: layout.pageH * zoom, boxShadow: '0 1px 3px rgba(0,0,0,.12),0 8px 28px rgba(0,0,0,.08)' }}
        />
      ))}
    </div>
  );
}

/** Each sheet's header and footer, over the words' margins. */
export function Bands({ layout, zoom, doc, readOnly, onOpen }: { layout: Layout; zoom: number; doc: Doc; readOnly?: boolean; onOpen: () => void }) {
  if (!doc.header && !doc.footer) return null;
  const step = (layout.pageH + GAP) * zoom;
  const m = layout.margin * zoom;
  const w = (PAPERS[doc.page.size].w * MM - 2 * layout.margin) * zoom;
  const font = FONTS.find((f) => f.name === doc.font)?.css;
  const out: { key: string; kind: 'head' | 'foot'; y: number; text: string; align?: 'center' | 'right' }[] = [];
  for (let i = 0; i < layout.count; i++) {
    if (doc.titlePage && i === 0) continue;
    const words = (t: string) => t.replace(/\{page\}/gi, String(i + 1)).replace(/\{pages\}/gi, String(layout.count));
    if (doc.header) out.push({ key: `h${i}`, kind: 'head', y: i * step + m / 2, text: words(doc.header.text), align: doc.header.align });
    if (doc.footer) out.push({ key: `f${i}`, kind: 'foot', y: i * step + layout.pageH * zoom - m / 2, text: words(doc.footer.text), align: doc.footer.align });
  }
  return (
    <>
      {out.map((b) => (
        <button
          key={b.key}
          type="button"
          data-keeps-editing
          title={b.kind === 'head' ? 'Header' : 'Footer'}
          onClick={() => !readOnly && onOpen()}
          className="absolute -translate-y-1/2 truncate text-[#5f6368] hover:text-[#1f2328]"
          style={{ left: m, width: w, top: b.y, textAlign: b.align ?? 'left', fontSize: `${Math.round(doc.size * 0.82 * zoom * 10) / 10}pt`, fontFamily: font }}
          translate="no"
        >
          {b.text}
        </button>
      ))}
    </>
  );
}
