// A deck's slides made the other shape, wide (16:9) or standard (4:3), as the Theme tab's Slide shape makes them: every
// part keeps its place across the slide, and its place and height down it go in step with the slide's new height. A
// pure function of the deck, for the editor and for agents (page_action's slide_shape).
import { slideH, type Deck } from './slides.ts';

/** The deck with its slides made `ratio`'s shape (the same deck when they are that shape already). */
export function reshapeDeck(d: Deck, ratio: Deck['ratio']): Deck {
  if (d.ratio === ratio) return d;
  const k = slideH(ratio) / slideH(d.ratio);
  return { ...d, ratio, slides: d.slides.map((s) => ({ ...s, els: s.els.map((e) => ({ ...e, y: Math.round(e.y * k), h: Math.round(e.h * k) })) })) };
}
