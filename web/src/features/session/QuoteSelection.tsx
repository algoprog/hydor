// Select text in one of the agent's replies or your own messages and a small "Quote" button appears above it; it puts the
// text in the message box as a quote, to answer it or point at it.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Quote } from 'lucide-react';

/** The message box listens for this and adds the text as a `>` quote. */
export const QUOTE_EVENT = 'wa:quote';

/** `> line` for each line of the selection, with a blank line after it. */
export function quoteBlock(text: string): string {
  return (
    text
      .trim()
      .split('\n')
      .map((l) => `> ${l}`.trimEnd())
      .join('\n') + '\n\n'
  );
}

export function QuoteSelection() {
  const [at, setAt] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString() ?? '';
        if (!sel || sel.isCollapsed || !text.trim() || !sel.rangeCount) return setAt(null);
        const range = sel.getRangeAt(0);
        const host = (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('[data-quote]');
        if (!host) return setAt(null);
        const r = range.getBoundingClientRect();
        // Above the selection; below it on touch screens, where the system menu sits above.
        const touch = matchMedia('(pointer: coarse)').matches;
        setAt({ x: Math.min(window.innerWidth - 60, Math.max(60, r.left + r.width / 2)), y: touch ? r.bottom + 10 : r.top - 40, text });
      }, 120);
    };
    const hide = () => setAt(null);
    document.addEventListener('selectionchange', check);
    window.addEventListener('scroll', hide, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('selectionchange', check);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  if (!at) return null;
  return createPortal(
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: at.text }));
        window.getSelection()?.removeAllRanges();
        setAt(null);
      }}
      style={{ left: at.x, top: Math.max(8, at.y) }}
      className="anim-pop fixed z-40 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-lg border border-line-2 bg-elevated px-2.5 text-[12.5px] font-medium text-fg shadow-lg transition-colors hover:bg-bg-2"
    >
      <Quote size={13} className="text-accent" /> Quote
    </button>,
    document.body,
  );
}
