// The typeset pages presented one at a time over the whole screen (View → Present the pages, or the preview's own
// button): a beamer talk shown as slides, or any document read page by page. → ↓ Space Page Down go on, ← ↑ Page Up
// go back, Home and End to the first and last, Esc leaves (as leaving full screen does); a click on the right of a page
// goes on and on its left back, and a swipe does the same on a phone. The next page is loaded ahead.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { TexCompiled } from '@shared/latex';
import { pageUrl } from './api';

export function Present({ result, start, onClose }: { result: TexCompiled; start: number; onClose: () => void }) {
  const [n, setN] = useState(Math.min(Math.max(1, start), result.pages));
  const box = useRef<HTMLDivElement>(null);
  const full = useRef(false);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.min(2400, Math.ceil((Math.max(window.screen.width, window.innerWidth) * dpr) / 100) * 100);
  const go = useCallback((d: number) => setN((x) => Math.min(result.pages, Math.max(1, x + d))), [result.pages]);

  useEffect(() => {
    const el = box.current;
    el?.focus();
    // Over the whole screen where the browser allows it; leaving it (Esc) leaves the presentation.
    el?.requestFullscreen?.().then(
      () => (full.current = true),
      () => {},
    );
    const left = () => {
      if (full.current && !document.fullscreenElement) onClose();
    };
    document.addEventListener('fullscreenchange', left);
    return () => {
      document.removeEventListener('fullscreenchange', left);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    // The next page, loaded ahead.
    if (n < result.pages) new Image().src = pageUrl(result.key, n + 1, width);
  }, [n, result.key]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  return createPortal(
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-modal
      aria-label="The pages, presented"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black outline-none select-none"
      onKeyDown={(e) => {
        const k = e.key;
        if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) go(1);
        else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) go(-1);
        else if (k === 'Home') setN(1);
        else if (k === 'End') setN(result.pages);
        else if (k === 'Escape') onClose();
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        go(e.clientX - r.left < r.width / 3 ? -1 : 1);
      }}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.changedTouches[0].clientY - t.y)) {
          e.preventDefault();
          go(dx < 0 ? 1 : -1);
        }
      }}
    >
      <img key={n} src={pageUrl(result.key, n, width)} alt={`Page ${n}`} draggable={false} className="max-h-full max-w-full bg-white object-contain" />
      <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 text-[12.5px] text-white/80 tabular-nums" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Previous page" title="Previous page" onClick={() => go(-1)} disabled={n <= 1} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30">
          <ChevronLeft size={16} />
        </button>
        <span className="px-1">{`${n} / ${result.pages}`}</span>
        <button type="button" aria-label="Next page" title="Next page" onClick={() => go(1)} disabled={n >= result.pages} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
        <button type="button" aria-label="Leave (Esc)" title="Leave (Esc)" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15">
          <X size={15} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
