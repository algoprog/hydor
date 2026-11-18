// A PowerPoint file's slides in the file viewer, drawn by the slides runtime as the Library draws its decks (each part
// in its place: words in their fonts, sizes and colours, pictures, shapes, tables, charts, backgrounds, the footer), as
// wide as the viewer allows, each with its speaker notes under it. A slide is drawn once it scrolls near, so a long deck
// opens at once, and drawn again when the width changes or the deck's fonts arrive. Words a box has no room for are
// made smaller until they fit, rather than cut off. Links in it open in a new tab.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { EyeOff } from 'lucide-react';
import { SLIDE_W, slideH, type Deck } from '@shared/slides';
import { cx } from '../../components/ui';
import { PICS, RT, useDeckFonts } from '../pages/slides/rt';

function SlideView({ deck, index, width, fonts, root }: { deck: Deck; index: number; width: number; fonts: number; root: RefObject<HTMLDivElement | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const k = width / SLIDE_W;
  // Drawn once it is within a screen of the view.
  useEffect(() => {
    const el = host.current;
    if (!el || near) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { root: root.current, rootMargin: '100% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near, root]);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !near || !width) return;
    el.textContent = '';
    // As the editor's thumbnails show a slide: every part in place, none waiting for its animation.
    const s = RT.slide(deck, index, PICS);
    s.style.position = 'absolute';
    s.style.left = '0';
    s.style.top = '0';
    s.style.transformOrigin = '0 0';
    s.style.transform = `scale(${k})`;
    el.appendChild(s);
    // A font this computer does not have (PowerPoint's Aptos, say) is stood in for by one a little wider or narrower:
    // the words of every box are fitted to it, as PowerPoint's own "shrink text on overflow" does, so none are cut off.
    for (const box of s.querySelectorAll<HTMLElement>('.ns-txt')) box.dataset.fit = '1';
    RT.fit(s);
  }, [deck, index, k, near, width, fonts]);
  return (
    <div
      ref={host}
      translate="no"
      style={{ height: slideH(deck.ratio) * k }}
      className="relative w-full overflow-hidden bg-bg-2"
      // A link to another slide of the deck goes nowhere here (the slideshow follows those).
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')?.getAttribute('href')?.startsWith('#')) e.preventDefault();
      }}
    />
  );
}

/** Every slide of the deck, one under the other, with its number and its speaker notes. */
export function DeckSlides({ deck }: { deck: Deck }) {
  const fonts = useDeckFonts(deck);
  const scroller = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = column.current;
    if (!el) return;
    // The slides' width: the column's, inside its padding and the slides' borders (to the fraction of a pixel, so a
    // slide fills its frame exactly).
    const measure = () => {
      const cs = getComputedStyle(el);
      setWidth(Math.max(0, el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain bg-bg-1">
      <div ref={column} className="mx-auto max-w-[960px] space-y-5 px-3 py-5 sm:px-6">
        {deck.slides.map((s, i) => (
          <section key={s.id || i} aria-label={`Slide ${i + 1}`}>
            <div className="mb-1.5 flex items-center gap-2 px-1 text-[12px] text-fg-3">
              <span className="font-medium tabular-nums">Slide {i + 1}</span>
              {s.hidden && (
                <span className="inline-flex items-center gap-1">
                  <EyeOff size={12} /> hidden
                </span>
              )}
            </div>
            <div className={cx('overflow-hidden rounded-xl border border-line shadow-sm', s.hidden && 'opacity-70')}>
              <SlideView deck={deck} index={i} width={width} fonts={fonts} root={scroller} />
            </div>
            {s.notes && (
              <div className="mt-2 rounded-lg bg-bg-2 px-3.5 py-2 text-[12.5px] text-fg-2">
                <div className="mb-0.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Notes</div>
                <div translate="no" className="whitespace-pre-wrap">
                  {s.notes}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
