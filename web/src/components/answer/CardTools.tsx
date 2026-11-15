// What an answer card's toolbar adds beside Show the data and Copy as text: Full screen (the card alone over the page,
// as wide as fits, scrolling when tall) and, under its "…", Save as picture (a PNG of the card as it looks, in the theme
// it shows in, at twice its size) and Copy as picture where the browser lets a page put pictures on the clipboard.
//
// The picture is drawn from the card's own HTML, SVG and canvases by modern-screenshot, loaded the first time one is
// made. A card with a frame inside (a map, a Plotly figure, a video's player, code's output) cannot be drawn so: the
// frame's content is out of the page's reach, so such a card has no picture buttons rather than one with a hole in it.
import { useRef, useState, type ReactNode } from 'react';
import { ClipboardCopy, Ellipsis, ImageDown } from 'lucide-react';
import { tr } from '../../i18n/runtime';
import { toast, toastError } from '../../lib/store';
import { PageOverlay } from '../../features/pages/overlay';
import { BarButton } from '../Markdown';
import { MenuItem, Popover } from '../ui';

/** Whether a card can be drawn as a picture: nothing in it is a frame (a map, a figure, a player), whose content the page cannot read. */
export const picturable = (el: HTMLElement | null) => !!el && !el.querySelector('iframe,embed,object');

/** Whether this browser lets a page put a picture on the clipboard. */
export const canCopyPicture = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  typeof ClipboardItem !== 'undefined' &&
  !!navigator.clipboard?.write &&
  ((ClipboardItem as unknown as { supports?: (t: string) => boolean }).supports?.('image/png') ?? true);

/** The colour behind the card where it shows (its reply's, or the page's), for the picture's edges. */
function backdrop(el: HTMLElement): string {
  for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (c && c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c)) return c;
  }
  return getComputedStyle(document.body).backgroundColor || getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#fff';
}

/** Room around the card in its picture, so its rounded edge shows. */
const PAD = 16;
/** The most pixels a picture may have: what every browser's canvas can hold. */
const MAX_PIXELS = 16_000_000;

/** The card as a PNG: as it looks now, in the current theme, at twice its size (less for a very tall one). */
export async function cardPicture(el: HTMLElement): Promise<Blob> {
  const { domToBlob } = await import('modern-screenshot');
  const r = el.getBoundingClientRect();
  const width = Math.ceil(r.width) + 2 * PAD;
  const height = Math.ceil(r.height) + 2 * PAD;
  const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_PIXELS / (width * height))));
  const blob = await domToBlob(el, {
    scale,
    width,
    height,
    type: 'image/png',
    backgroundColor: backdrop(el),
    // Its own room around it, and none of its toolbar or its "still coming" dot.
    style: { padding: `${PAD}px`, margin: '0', boxSizing: 'border-box' },
    filter: (n) => !(n instanceof Element && (n.hasAttribute('data-aui-bar') || n.classList.contains('aui-live'))),
    timeout: 20_000,
  });
  if (!blob?.size) throw new Error(tr('The picture could not be made'));
  return blob;
}

/** A file name from the card's title. */
const fileName = (title: string) =>
  `${
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'card'
  }.png`;

/** Saves the card as `<title>.png`. */
export async function savePicture(el: HTMLElement, title: string) {
  try {
    const url = URL.createObjectURL(await cardPicture(el));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    toastError(e);
  }
}

/** Puts the card's picture on the clipboard. Asked for at once, the picture still being made (Safari allows it only so). */
export async function copyPicture(el: HTMLElement) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardPicture(el) })]);
    toast(tr('Copied the card as a picture'), 'ok');
  } catch (e) {
    toastError(e);
  }
}

/** The "…" on a card's toolbar: Save as picture, and Copy as picture where the browser can. `card` gives the card's element. */
export function PictureMenu({ card, title }: { card: () => HTMLElement | null; title: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const run = (fn: (el: HTMLElement) => unknown) => () => {
    setOpen(false);
    const el = card();
    if (el) fn(el);
  };
  return (
    <>
      <button
        ref={anchor}
        type="button"
        title={tr('More')}
        aria-label={tr('More')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
      >
        <Ellipsis size={13} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" width={210}>
        <MenuItem icon={<ImageDown size={15} />} onClick={run((el) => savePicture(el, title))}>
          {tr('Save as picture')}
        </MenuItem>
        {canCopyPicture() && (
          <MenuItem icon={<ClipboardCopy size={15} />} onClick={run(copyPicture)}>
            {tr('Copy as picture')}
          </MenuItem>
        )}
      </Popover>
    </>
  );
}

/**
 * The card alone over the page, as wide as fits (a short one in the middle, a tall one scrolling): Escape, the close
 * button or a click beside it closes it. Its header has the picture buttons when the card can be one.
 */
export function CardFullScreen({ title, uiId, pictures, onClose, children }: { title: string; uiId: string; pictures: boolean; onClose: () => void; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  return (
    <PageOverlay
      title={<span translate="no">{title}</span>}
      onClose={onClose}
      actions={
        pictures && (
          <span className="flex items-center gap-0.5">
            <BarButton label={tr('Save as picture')} onClick={() => card.current && savePicture(card.current, title)}>
              <ImageDown size={14} />
            </BarButton>
            {canCopyPicture() && (
              <BarButton label={tr('Copy as picture')} onClick={() => card.current && copyPicture(card.current)}>
                <ClipboardCopy size={14} />
              </BarButton>
            )}
          </span>
        )
      }
    >
      <div className="h-full overflow-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-[1280px] flex-col justify-center px-3 py-4 sm:px-8 sm:py-8">
          <div className="md">
            <div ref={card} className="aui relative" data-ui={uiId} translate="no">
              {children}
            </div>
          </div>
        </div>
      </div>
    </PageOverlay>
  );
}
