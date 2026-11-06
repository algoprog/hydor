// What Insert puts on a deck for E3's tools: a free photo (the picture, its credit in the slide's speaker notes and, where
// its licence asks for credit, a small caption under it to delete if not wanted), and slides from another deck after
// the one on view. Each is one change, one step to undo.
import { photoCaption, photoCredit, type PhotoUse } from '@shared/photos';
import { newId, type Deck, type El, type ImageEl, type Slide, type TextEl } from '@shared/slides';
import { addEls, heightOf, image, setSlide } from './ops';

/** A free photo's parts on a slide: the picture, and its caption when its licence asks for credit. */
export function photoParts(deck: Deck, use: PhotoUse): El[] {
  const img: ImageEl = { ...image(deck, use.src, use.w, use.h), alt: use.photo.title.slice(0, 300) };
  if (!use.photo.attribution) return [img];
  const H = heightOf(deck);
  // Under the picture where there is room; else over its foot, light words on a dark band.
  const below = img.y + img.h + 34 <= H - 8;
  const cap: TextEl = {
    id: newId(),
    type: 'text',
    name: 'Photo credit',
    x: img.x,
    y: below ? img.y + img.h + 6 : img.y + img.h - 30,
    w: img.w,
    h: 26,
    paras: [{ runs: photoCaption(use.photo) }],
    size: 14,
    color: below ? 'muted' : '#ffffff',
    ...(below ? {} : { fill: '#00000073', pad: 6 }),
    valign: 'middle',
    fit: 'shrink',
  };
  return [img, cap];
}

/** The deck with a free photo on slide i, its credit added to the slide's speaker notes. */
export function withPhoto(d: Deck, i: number, els: El[], use: PhotoUse): Deck {
  const credit = photoCredit(use.photo);
  return setSlide(addEls(d, i, els), i, (s) => ({ ...s, notes: s.notes?.includes(credit) ? s.notes : [s.notes, credit].filter(Boolean).join('\n\n') }));
}

/** The deck with slides put in after slide i. */
export function withSlidesAfter(d: Deck, i: number, slides: Slide[]): Deck {
  const out = [...d.slides];
  out.splice(i + 1, 0, ...slides);
  return { ...d, slides: out };
}
