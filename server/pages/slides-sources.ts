// What save_slides does for a deck once its pictures are in (agentDeck): its logo takes its picture's own shape (unless
// both its width and height were given), and each chart given a spreadsheet of the Library as its source and no numbers
// gets its labels and series from it, read as the slides editor reads them (shared/slides-sheet.ts). A spreadsheet that
// is not there, or cells with no numbers, are said in `notes` and leave the chart as it was given.
import { chartFromSheet } from '../../shared/slides-sheet.ts';
import { ASSET, everyEl, type ChartEl, type Deck, type El } from '../../shared/slides.ts';
import type { DB } from '../db.ts';
import { getAsset } from './assets.ts';
import { imageSize } from './ooxml.ts';
import { readBook } from './sheets.ts';
import { pageSource } from './store.ts';

/** The deck with its logo's shape its picture's, and its charts from spreadsheets read. */
export function withSheetsAndLogo(db: DB, deck: Deck, asked: { logo?: unknown }, notes: string[]): Deck {
  let d = deck;
  const g = d.logo;
  const given = asked.logo && typeof asked.logo === 'object' ? (asked.logo as Record<string, unknown>) : {};
  if (g?.src.startsWith(ASSET) && !((given.w ?? given.width) && (given.h ?? given.height))) {
    const a = getAsset(db, g.src.slice(ASSET.length));
    const sz = a ? imageSize(a.data) : null;
    if (sz && sz.w > 0 && sz.h > 0) {
      // As wide as asked (or as tall, when only its height was given), the other side its picture's.
      const byH = !(given.w ?? given.width) && !!(given.h ?? given.height);
      const k = sz.h / sz.w;
      const w = byH ? Math.max(16, Math.min(640, Math.round(g.h / k))) : g.w;
      const h = byH ? g.h : Math.max(16, Math.min(640, Math.round(g.w * k)));
      d = { ...d, logo: { ...g, w, h } };
    }
  }
  const wanted = d.slides.some((s) => everyEl(s.els).some((e) => e.type === 'chart' && e.source && !e.series.length));
  if (!wanted) return d;
  const books = new Map<string, { title: string; book: ReturnType<typeof readBook> } | null>();
  const bookOf = (page: string) => {
    if (!books.has(page)) {
      const src = pageSource(db, page);
      let got: { title: string; book: ReturnType<typeof readBook> } | null = null;
      if (src?.kind === 'sheet')
        try {
          got = { title: src.title, book: readBook(src.text) };
        } catch {}
      books.set(page, got);
    }
    return books.get(page)!;
  };
  const fill = (e: El): El => {
    if (e.type === 'group') return { ...e, els: e.els.map(fill) };
    if (e.type !== 'chart' || !e.source || e.series.length) return e;
    const got = bookOf(e.source.page);
    if (!got) {
      notes.push(`The chart's source ${e.source.page} is not a spreadsheet of the Library (get_page lists them); it was left without numbers.`);
      return e;
    }
    const r = chartFromSheet(got.book, e.source, e.kind);
    if ('error' in r) {
      notes.push(`The chart from “${got.title}”: ${r.error}`);
      return e;
    }
    return { ...e, labels: r.labels, series: r.series, source: { ...e.source, title: got.title, at: Date.now() } } as ChartEl;
  };
  return { ...d, slides: d.slides.map((s) => ({ ...s, els: s.els.map(fill) })) };
}
