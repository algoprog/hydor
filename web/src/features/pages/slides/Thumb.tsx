// A slide drawn small: the slide at its full size, scaled to the width it is given. Drawn again only when the slide,
// the theme, the footer, its place in the deck (its number) or the fonts change.
import { memo, useLayoutEffect, useRef } from 'react';
import type { Deck, Slide, Theme } from '@shared/slides';
import { cx } from '../../../components/ui';
import { heightOf, W } from './ops';
import { PICS, RT } from './rt';

function ThumbInner({ deck, index, width, className, edit }: { deck: Deck; index: number; width: number; className?: string; slide: Slide; theme: Theme; fonts: number; edit?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const k = width / W;
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.textContent = '';
    const el = RT.slide(deck, index, { ...PICS, edit });
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.transformOrigin = '0 0';
    el.style.transform = `scale(${k})`;
    el.style.pointerEvents = 'none';
    host.appendChild(el);
    RT.fit(el);
  });
  return <div ref={ref} aria-hidden style={{ width, height: Math.round(heightOf(deck) * k) }} className={cx('relative overflow-hidden', className)} />;
}

/** One slide, small. */
export const SlideThumb = memo(
  ThumbInner,
  (a, b) =>
    a.slide === b.slide &&
    a.theme === b.theme &&
    a.width === b.width &&
    a.fonts === b.fonts &&
    a.deck.ratio === b.deck.ratio &&
    a.deck.footer === b.deck.footer &&
    a.deck.logo === b.deck.logo &&
    (!(a.deck.footer || a.deck.logo) || a.index === b.index) &&
    a.className === b.className,
);
