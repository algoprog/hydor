// The typeset pages beside the source: each a picture as wide as the pane (zoom in, out, or back to the width),
// one under the other, the scroll kept where it was as the document is typeset again. While it typesets, the pages
// on screen stay, with a quiet "Typesetting…"; the new ones take their place once those in view have loaded, so
// nothing blinks. When the latest changes do not typeset, the last pages stay with a line saying so. A double click
// on a page goes to its source (SyncTeX); a line of the source shown in the pages is marked for a moment. Without
// TeX here, a note says what to install; without poppler, the PDF shows in the browser's own viewer.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, Minus, MoveHorizontal, Plus, TriangleAlert } from 'lucide-react';
import type { TexCompiled, TexSetup } from '@shared/latex';
import { Button, cx, IconButton, Throbber } from '../../../components/ui';
import { toastError } from '../../../lib/store';
import { pageUrl, pdfUrl, sourceAt } from './api';

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
  className,
}: {
  /** The latest typesetting (with pages or not). */
  result: TexCompiled | null;
  busy: boolean;
  setup: TexSetup | null;
  flash?: Flash | null;
  /** A double click on a page: its source. */
  onSource?: (file: string, line: number) => void;
  /** Shows the errors and warnings. */
  onProblems?: () => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  // The typesetting whose pages are on screen.
  const [shown, setShown] = useState<TexCompiled | null>(result?.pdf ? result : null);
  const [mark, setMark] = useState<Flash | null>(null);
  const dpr = typeof window === 'undefined' ? 1 : Math.min(3, window.devicePixelRatio || 1);

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

  const toSource = async (e: React.MouseEvent<HTMLDivElement>, r: TexCompiled, page: number) => {
    if (!onSource) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = sizeOf(r, page - 1);
    try {
      const at = await sourceAt(r.key, page, ((e.clientX - rect.left) / rect.width) * s.w, ((e.clientY - rect.top) / rect.height) * s.h);
      if (at) onSource(at.file, at.line);
    } catch (err) {
      toastError(err);
    }
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
              onDoubleClick={(e) => void toSource(e, shown, n)}
              className="relative shrink-0 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.04)]"
              style={{ width: pageW, height: h }}
            >
              <img src={pageUrl(shown.key, n, picW)} alt={`Page ${n}`} loading={n <= 2 ? 'eager' : 'lazy'} draggable={false} className="absolute inset-0 h-full w-full select-none" />
              {m && <div className="pointer-events-none absolute rounded-sm bg-accent/25 ring-2 ring-accent/60" style={{ left: m.x * k - 4, top: m.y * k - 3, width: Math.max(24, m.w * k) + 8, height: Math.max(10, m.h * k) + 6 }} />}
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
    <div className={cx('flex min-h-0 min-w-0 flex-col bg-bg-2', className)}>
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
      <div ref={box} className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
        {body}
      </div>
    </div>
  );
}
