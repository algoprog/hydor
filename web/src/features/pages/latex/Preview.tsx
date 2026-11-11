// The typeset pages beside the source: each a picture as wide as the pane (zoom in, out, or back to the width),
// one under the other, the scroll kept where it was as the document is typeset again. While it typesets, the pages
// on screen stay, with a quiet "Typesetting…"; the new ones take their place once those in view have loaded, so
// nothing blinks. When the latest changes do not typeset, the last pages stay with a line saying so. A double click
// on a page goes to its source (SyncTeX), as does Go to this place in the source in its right-click menu (which also
// copies the words picked, or the one under the pointer); a line of the source shown in the pages is marked for a moment. The page box
// says which page is in view and goes to the one typed; Dark pages shows them light on dark in the dark theme; the
// pages can be presented one at a time over the whole screen (Present.tsx). Without TeX here, a note says what to
// install; without poppler, the PDF shows in the browser's own viewer.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Code, Copy, ExternalLink, Minus, MoveHorizontal, Plus, Presentation, Search, TriangleAlert } from 'lucide-react';
import type { TexCompiled, TexSetup } from '@shared/latex';
import { Button, cx, IconButton, Throbber } from '../../../components/ui';
import { toast, toastError } from '../../../lib/store';
import { ContextMenu, type ContextMenuAt } from '../common/menus';
import { pageUrl, pdfUrl, sourceAt } from './api';
import { Present } from './Present';
import { Marks, PdfFindBar, TextLayer, usePdfFind, usePdfWords } from './PdfText';

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];
const PAD = 16;
const GAP = 12;
const A4 = { w: 595.28, h: 841.89 };

export interface Flash {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Changes each time, so the same place can be shown again. */
  n: number;
}

export function Preview({
  result,
  busy,
  setup,
  flash,
  onSource,
  onProblems,
  darkPages,
  presentAsk,
  findAsk,
  onFound,
  onPicked,
  className,
}: {
  /** Changes when Find in the pages is asked for (Ctrl+F over them). */
  findAsk?: number;
  /** A match of Find in the pages: its place in the source. */
  onFound?: (file: string, line: number) => void;
  /** Words picked on a page: their place in the source, and the words. */
  onPicked?: (file: string, line: number, text: string) => void;
  /** The latest typesetting (with pages or not). */
  result: TexCompiled | null;
  busy: boolean;
  setup: TexSetup | null;
  flash?: Flash | null;
  /** A double click on a page: its source. */
  onSource?: (file: string, line: number) => void;
  /** Shows the errors and warnings. */
  onProblems?: () => void;
  /** The pages shown light on dark (the dark theme's Dark pages). */
  darkPages?: boolean;
  /** Changes when the pages are to be presented over the whole screen (View → Present the pages). */
  presentAsk?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  // The typesetting whose pages are on screen.
  const [shown, setShown] = useState<TexCompiled | null>(result?.pdf ? result : null);
  const [mark, setMark] = useState<Flash | null>(null);
  // The page in view (from 1), and what the page box holds while it is typed in.
  const [page, setPage] = useState(1);
  const [typed, setTyped] = useState<string | null>(null);
  const [presenting, setPresenting] = useState<number | null>(null);
  const dpr = typeof window === 'undefined' ? 1 : Math.min(3, window.devicePixelRatio || 1);
  // The pages' words: picked on a page, found with Find in the pages.
  const words = usePdfWords(shown?.key ?? null, !!setup?.words && setup.pictures !== false);
  const find = usePdfFind(words);
  useEffect(() => {
    if (findAsk && shown && setup?.words) find.setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findAsk]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pageW = Math.max(160, Math.round((width - PAD * 2) * zoom));
  const picW = Math.min(2400, Math.ceil((pageW * dpr) / 100) * 100);
  const sizeOf = (r: TexCompiled, i: number) => r.sizes?.[i] ?? r.sizes?.[r.sizes.length - 1] ?? A4;
  const heightOf = (r: TexCompiled, i: number) => Math.round((pageW * sizeOf(r, i).h) / sizeOf(r, i).w);

  /** The pages of `r` that are in view now (from 1). */
  const inView = (r: TexCompiled): number[] => {
    const el = box.current;
    if (!el) return [1];
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const out: number[] = [];
    let y = PAD;
    for (let i = 0; i < r.pages; i++) {
      const h = heightOf(r, i);
      if (y + h >= top && y <= bottom) out.push(i + 1);
      y += h + GAP;
      if (y > bottom) break;
    }
    return out.length ? out : [1];
  };

  // A new typesetting with pages: once the pages in view have loaded (or a moment passed), it takes the old one's place.
  useEffect(() => {
    if (!result?.pdf || result.key === shown?.key) return;
    // Out of sight (a phone's other tab): nothing to keep still meanwhile.
    if (!box.current?.clientWidth) return setShown(result);
    let alive = true;
    const pages = inView(result).slice(0, 4);
    const loads = pages.map(
      (n) =>
        new Promise<void>((ok) => {
          const i = new Image();
          i.onload = i.onerror = () => ok();
          i.src = pageUrl(result.key, n, picW);
        }),
    );
    const t = setTimeout(() => alive && setShown(result), 4000);
    void Promise.all(loads).then(() => alive && setShown(result));
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.key]);

  // Zooming keeps the same part of the document in view.
  const ratio = useRef(0);
  const setZ = (z: number) => {
    const el = box.current;
    if (el) ratio.current = el.scrollHeight > 0 ? el.scrollTop / el.scrollHeight : 0;
    setZoom(z);
  };
  useLayoutEffect(() => {
    const el = box.current;
    if (el && ratio.current) el.scrollTop = ratio.current * el.scrollHeight;
    ratio.current = 0;
  }, [zoom]);

  /** Where page n starts, down the pages. */
  const topOf = (r: TexCompiled, n: number) => {
    let y = PAD;
    for (let i = 0; i < n - 1 && i < r.pages; i++) y += heightOf(r, i) + GAP;
    return y;
  };
  // The page in view: the one a third of the way down the pane.
  useEffect(() => {
    const el = box.current;
    if (!el || !shown) return;
    const on = () => {
      const at = el.scrollTop + el.clientHeight / 3;
      let y = PAD;
      let n = 1;
      for (let i = 0; i < shown.pages; i++) {
        y += heightOf(shown, i) + GAP;
        if (y > at) break;
        n = Math.min(shown.pages, i + 2);
      }
      setPage(n);
    };
    on();
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, pageW]);
  const goPage = (n: number) => {
    const el = box.current;
    if (!el || !shown) return;
    const p = Math.min(shown.pages, Math.max(1, Math.round(n)));
    el.scrollTo({ top: topOf(shown, p) - PAD / 2 });
    setPage(p);
  };
  useEffect(() => {
    if (presentAsk && shown?.pdf) setPresenting(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentAsk]);

  // A line of the source, shown in the pages: scrolled to, and marked for a moment.
  useEffect(() => {
    if (!flash || !shown || flash.page > shown.pages) return;
    const el = box.current;
    if (!el) return;
    let y = PAD;
    for (let i = 0; i < flash.page - 1; i++) y += heightOf(shown, i) + GAP;
    const k = pageW / sizeOf(shown, flash.page - 1).w;
    el.scrollTo({ top: Math.max(0, y + flash.y * k - el.clientHeight / 3) });
    setMark(flash);
    const t = setTimeout(() => setMark(null), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.n]);

  /** A match of Find in the pages scrolled to, and its place in the source shown. */
  const goMatch = (i: number) => {
    const m = find.matches[i];
    const el = box.current;
    if (!m || !shown || !el) return;
    const b = m.boxes[0];
    const k = pageW / sizeOf(shown, m.page - 1).w;
    el.scrollTo({ top: Math.max(0, topOf(shown, m.page) + b.y * k - el.clientHeight / 3) });
    if (onFound) void sourceAt(shown.key, m.page, b.x + b.w / 2, b.y + b.h / 2).then((at) => at && onFound(at.file, at.line), () => {});
  };
  // The first match, as it is typed.
  useEffect(() => {
    if (find.open && find.matches.length) goMatch(find.cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find.q, words]);
  /** Words picked on a page: where the first is, in the source. */
  const picked = async () => {
    const s = window.getSelection();
    const text = s?.toString().replace(/\s+/g, ' ').trim();
    if (!s || !s.rangeCount || !text || !shown || !onPicked || !words) return;
    const start = s.getRangeAt(0).startContainer;
    const el = (start.nodeType === 3 ? start.parentElement : (start as Element))?.closest?.('[data-i]');
    const layer = el?.closest('[data-pdf-text]');
    if (!el || !layer) return;
    const p = Number(layer.getAttribute('data-pdf-text'));
    const w = words[p - 1]?.words[Number(el.getAttribute('data-i'))];
    if (!w) return;
    try {
      const at = await sourceAt(shown.key, p, w[1] + w[3] / 2, w[2] + w[4] / 2);
      if (at) onPicked(at.file, at.line, text);
    } catch {}
  };

  /** The source of a place on a page (a click's, in points from the page's corner): the editor goes there. */
  const sourceOf = async (r: TexCompiled, page: number, x: number, y: number) => {
    try {
      const at = await sourceAt(r.key, page, x, y);
      if (at) onSource?.(at.file, at.line);
      else toast('That place has no source');
    } catch (err) {
      toastError(err);
    }
  };
  const toSource = (e: React.MouseEvent<HTMLDivElement>, r: TexCompiled, page: number) => {
    if (!onSource) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = sizeOf(r, page - 1);
    void sourceOf(r, page, ((e.clientX - rect.left) / rect.width) * s.w, ((e.clientY - rect.top) / rect.height) * s.h);
  };
  // The right-click menu on a page: where it was pressed (to find its source), and the words picked or under the pointer.
  const [pageMenu, setPageMenu] = useState<(ContextMenuAt & { r: TexCompiled; page: number; px: number; py: number; words: string }) | null>(null);
  const openPageMenu = (e: React.MouseEvent<HTMLDivElement>, r: TexCompiled, page: number) => {
    // A touch screen's long press keeps the system's own menu for words.
    if (matchMedia('(pointer: coarse)').matches) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const s = sizeOf(r, page - 1);
    const picked = window.getSelection()?.toString().replace(/\s+/g, ' ').trim();
    const under = (e.target as HTMLElement).closest?.('[data-i]')?.textContent?.trim();
    setPageMenu({ x: e.clientX, y: e.clientY, r, page, px: ((e.clientX - rect.left) / rect.width) * s.w, py: ((e.clientY - rect.top) / rect.height) * s.h, words: picked || under || '' });
  };

  const failed = result && !result.pdf && !result.missing ? result : null;
  const missing = result?.missing ?? setup?.missing;
  const zi = ZOOMS.findIndex((z) => Math.abs(z - zoom) < 0.01);
  const bar = (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[12px] text-fg-3">
        {busy ? (
          <>
            <Throbber className="h-3.5 w-3.5" />
            Typesetting…
          </>
        ) : shown ? (
          <span className="truncate">{`${shown.pages} page${shown.pages === 1 ? '' : 's'} typeset`}</span>
        ) : null}
      </span>
      {shown && setup?.pictures !== false && shown.pages > 1 && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-fg-3 tabular-nums">
          <input
            value={typed ?? String(page)}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onFocus={(e) => e.target.select()}
            onBlur={() => {
              if (typed) goPage(Number(typed));
              setTyped(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setTyped(null);
                e.currentTarget.blur();
              }
            }}
            inputMode="numeric"
            aria-label="Go to page"
            title="Go to page"
            className="h-6.5 w-9 rounded-md border border-line bg-bg px-1 text-center text-[12px] text-fg outline-none focus:border-accent"
          />
          <span>{`/ ${shown.pages}`}</span>
        </span>
      )}
      {shown && setup?.pictures !== false && (
        <>
          <IconButton label="Zoom out" size="sm" disabled={zi === 0} onClick={() => setZ(ZOOMS[Math.max(0, (zi < 0 ? ZOOMS.findIndex((z) => z > zoom) : zi) - 1)])}>
            <Minus size={14} />
          </IconButton>
          <button
            type="button"
            onClick={() => setZ(1)}
            title="Fit the width"
            className={cx('inline-flex h-7 min-w-12 items-center justify-center gap-1 rounded-lg px-1.5 text-[12px] tabular-nums transition-colors hover:bg-bg-2', zoom === 1 ? 'text-fg-3' : 'text-fg')}
          >
            {zoom === 1 ? <MoveHorizontal size={14} /> : `${Math.round(zoom * 100)}%`}
          </button>
          <IconButton label="Zoom in" size="sm" disabled={zi === ZOOMS.length - 1} onClick={() => setZ(ZOOMS[Math.min(ZOOMS.length - 1, (zi < 0 ? ZOOMS.findIndex((z) => z > zoom) - 1 : zi) + 1)])}>
            <Plus size={14} />
          </IconButton>
        </>
      )}
      {shown && setup?.pictures !== false && setup?.words && (
        <IconButton label="Find in the pages (Ctrl+F)" size="sm" active={find.open} onClick={() => find.setOpen(!find.open)}>
          <Search size={14} />
        </IconButton>
      )}
      {shown && setup?.pictures !== false && (
        <IconButton label="Present the pages" size="sm" onClick={() => setPresenting(page)}>
          <Presentation size={14} />
        </IconButton>
      )}
      {shown && (
        <a href={pdfUrl(shown.key)} target="_blank" rel="noreferrer" title="Open the PDF" aria-label="Open the PDF" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (missing && !shown) {
    body = (
      <div className="mx-auto flex max-w-md flex-col gap-2 px-5 py-10 text-[13.5px] leading-relaxed text-fg-2">
        <div className="text-[15px] font-medium text-fg">It can’t be typeset here</div>
        <p translate="no" className="whitespace-pre-wrap">
          {missing}
        </p>
      </div>
    );
  } else if (shown && setup?.pictures === false) {
    // No poppler: the browser's own PDF viewer.
    body = <iframe key={shown.key} title="The PDF" src={pdfUrl(shown.key)} className="h-full w-full border-0 bg-bg-2" />;
  } else if (shown) {
    body = (
      <div translate="no" className="flex flex-col items-center" style={{ padding: PAD, gap: GAP, minWidth: pageW + PAD * 2 }}>
        {Array.from({ length: shown.pages }, (_, i) => {
          const n = i + 1;
          const h = heightOf(shown, i);
          const m = mark && mark.page === n ? mark : null;
          const k = pageW / sizeOf(shown, i).w;
          return (
            <div
              key={n}
              onDoubleClick={(e) => toSource(e, shown, n)}
              onContextMenu={(e) => openPageMenu(e, shown, n)}
              className={cx('relative shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.04)]', darkPages ? 'bg-[#1b1b1d]' : 'bg-white')}
              style={{ width: pageW, height: h }}
            >
              <img
                src={pageUrl(shown.key, n, picW)}
                alt={`Page ${n}`}
                loading={n <= 2 ? 'eager' : 'lazy'}
                draggable={false}
                className="absolute inset-0 h-full w-full select-none"
                // Light on dark: the page's white made near black, its colours turned back to their own hues.
                style={darkPages ? { filter: 'invert(0.89) hue-rotate(180deg)' } : undefined}
              />
              {m && <div className="pointer-events-none absolute rounded-sm bg-accent/25 ring-2 ring-accent/60" style={{ left: m.x * k - 4, top: m.y * k - 3, width: Math.max(24, m.w * k) + 8, height: Math.max(10, m.h * k) + 6 }} />}
              {find.open && find.matches.length > 0 && <Marks list={find.matches.filter((x) => x.page === n)} current={find.matches[find.cur] ?? null} k={k} />}
              {/* The words, invisible, on the pages near the one in view: to pick them. */}
              {words?.[i] && Math.abs(n - page) <= 2 && <TextLayer words={words[i]} page={n} k={k} />}
            </div>
          );
        })}
      </div>
    );
  } else if (failed) {
    body = (
      <div className="mx-auto flex max-w-md flex-col items-start gap-2 px-5 py-10 text-[13.5px] leading-relaxed text-fg-2">
        <div className="flex items-center gap-2 text-[15px] font-medium text-fg">
          <TriangleAlert size={16} className="text-err" />
          It didn’t typeset
        </div>
        {failed.errors[0] && (
          <p translate="no">
            {failed.errors[0].file ? `${failed.errors[0].file}${failed.errors[0].line ? `:${failed.errors[0].line}` : ''}: ` : ''}
            {failed.errors[0].message}
          </p>
        )}
        {onProblems && (
          <Button size="sm" variant="secondary" onClick={onProblems}>
            Show the problems
          </Button>
        )}
      </div>
    );
  } else {
    body = <div className="flex h-full items-center justify-center text-fg-3">{busy ? <Throbber size={26} /> : null}</div>;
  }

  return (
    <div data-tex-preview className={cx('flex min-h-0 min-w-0 flex-col bg-bg-2', className)}>
      {bar}
      {failed && shown && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-1.5 text-[12.5px] text-fg-2">
          <TriangleAlert size={14} className="shrink-0 text-err" />
          <span className="min-w-0 flex-1 truncate">
            {`The latest changes didn’t typeset (${failed.errors.length} error${failed.errors.length === 1 ? '' : 's'}): these pages are from before.`}
          </span>
          {onProblems && (
            <button type="button" onClick={onProblems} className="shrink-0 font-medium text-accent hover:underline">
              Show
            </button>
          )}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={box} tabIndex={-1} onMouseUp={() => void picked()} className="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none">
          {body}
        </div>
        {find.open && shown && <PdfFindBar find={find} loading={!words} onGo={goMatch} />}
      </div>
      <ContextMenu
        at={pageMenu}
        onClose={() => setPageMenu(null)}
        items={
          pageMenu
            ? [
                { label: 'Go to this place in the source', icon: <Code size={14} />, disabled: !onSource, also: 'synctex', run: () => void sourceOf(pageMenu.r, pageMenu.page, pageMenu.px, pageMenu.py) },
                { label: 'Copy the words', icon: <Copy size={14} />, disabled: !pageMenu.words, run: () => void navigator.clipboard?.writeText(pageMenu.words).then(() => toast('Copied', 'ok'), () => toast('Copying is not allowed here')) },
              ]
            : []
        }
      />
      {presenting !== null && shown && <Present result={shown} start={presenting} onClose={() => setPresenting(null)} />}
    </div>
  );
}
