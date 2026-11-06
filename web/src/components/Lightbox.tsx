// Images opened large: fitted to the screen, a click (or tap) shows them at full size to pan around,
// arrows step through several, Escape closes. A step's picture shows where the step acted on it. Edit opens the
// picture in the picture editor, in a tab of its own (saved as a copy in the Library, or back in place when the
// one who opened it says where).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { ChevronLeft, ChevronRight, ExternalLink, SlidersHorizontal, X } from 'lucide-react';
import type { Saved, SaveTo } from '@shared/mediaedit';
import type { StepMark } from '@shared/pointer';
import { openEditor, pageName } from '../features/mediaedit/host';
import { toast } from '../lib/store';
import { StepMarks } from './StepMarks';
import { cx } from './ui';

export interface LightboxImage {
  src: string;
  name?: string;
  /** Where Open in a new tab goes, when not to `src`: a picture's own address on the web, shown through this server. */
  href?: string;
  /** Where an agent's step acted on the picture (a computer step's screen). */
  marks?: StepMark[];
  /**
   * Edit: where the picture editor saves it back (a Library item, a file, a deck's picture) and what to do then; with
   * none it saves a copy in the Library. false: no Edit (a video's frames).
   */
  edit?: false | { to?: SaveTo; save?: (r: Saved) => void | Promise<void>; from?: string };
}

const useLightbox = create<{ images: LightboxImage[]; index: number }>(() => ({ images: [], index: 0 }));

export const openLightbox = (images: LightboxImage[], index = 0) => useLightbox.setState({ images, index });
/** A picture's marks, once read, for the open view showing it. */
export const markLightbox = (src: string, marks: StepMark[]) => useLightbox.setState((s) => (s.images.some((i) => i.src === src) ? { images: s.images.map((i) => (i.src === src ? { ...i, marks } : i)) } : s));
const close = () => useLightbox.setState({ images: [], index: 0 });

/** The picture in the picture editor, in a tab of its own; the large view closes. */
function edit(img: LightboxImage) {
  const e = img.edit || {};
  close();
  openEditor({
    kind: 'image',
    src: img.src,
    title: img.name || 'Picture',
    from: { label: e.from || pageName() },
    to: e.to,
    copy: !!e.to,
    save: e.save ?? ((r) => void (r.media && toast('Saved to your Library', 'ok'))),
  });
}

export function Lightbox() {
  const { images, index } = useLightbox();
  const [zoom, setZoom] = useState(false);
  const shown = useRef<HTMLImageElement>(null);
  const open = images.length > 0;
  const img = images[index];
  const step = (d: number) => {
    setZoom(false);
    useLightbox.setState({ index: (index + d + images.length) % images.length });
  };

  useEffect(() => {
    if (!open) return;
    setZoom(false);
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowRight' && images.length > 1) step(1);
      else if (e.key === 'ArrowLeft' && images.length > 1) step(-1);
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, images.length]);

  if (!open || !img) return null;
  return createPortal(
    <div className="scrim fixed inset-0 z-[70] flex flex-col [--scrim-blur:14px] [--scrim:0.78]" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(8px,var(--safe-top))] pb-2 text-[13px] text-white/80">
        <span className="min-w-0 flex-1 truncate">{img.name ?? ''}</span>
        {images.length > 1 && (
          <span className="tnum shrink-0 text-white/60">
            {index + 1} / {images.length}
          </span>
        )}
        {img.edit !== false && (
          <button onClick={() => edit(img)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-white/80 hover:bg-white/10 hover:text-white" title="Edit the picture" aria-label="Edit the picture">
            <SlidersHorizontal size={15} />
            <span className="max-sm:hidden">Edit</span>
          </button>
        )}
        <a href={img.href ?? img.src} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" title="Open in a new tab" aria-label="Open in a new tab">
          <ExternalLink size={16} />
        </a>
        <button onClick={close} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" title="Close (Esc)" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div
        className={cx('relative min-h-0 flex-1', zoom ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden px-3 pb-3')}
        onPointerDown={(e) => e.target === e.currentTarget && close()}
      >
        <img
          key={img.src}
          ref={shown}
          src={img.src}
          alt={img.name ?? ''}
          onClick={() => setZoom((z) => !z)}
          className={cx('select-none', zoom ? 'm-auto block max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in rounded-lg object-contain shadow-2xl')}
        />
        {!!img.marks?.length && <StepMarks key={`${img.src}:${zoom}`} img={shown} marks={img.marks} />}
        {images.length > 1 && (
          <>
            <button onClick={() => step(-1)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/60 hover:text-white" aria-label="Previous">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => step(1)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/60 hover:text-white" aria-label="Next">
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** A video from YouTube or Vimeo, played over the page: their players cannot run inside a view's sandbox. */
const useVideo = create<{ src: string; title: string }>(() => ({ src: '', title: '' }));
/** Only their players' own addresses play here (the page's policy allows those two and no other site). */
const PLAYER = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/[\w-]{6,20}|player\.vimeo\.com\/video\/\d{4,12})(\?start=\d+)?$/;
export const openVideo = (src: string, title = '') => PLAYER.test(src) && useVideo.setState({ src, title });
const closeVideo = () => useVideo.setState({ src: '', title: '' });
/** What a player may use: autoplay, encrypted media, picture in picture, full screen. */
const PLAYER_ALLOW = ['autoplay', 'encrypted-media', 'picture-in-picture', 'fullscreen'].join('; ');

export function VideoBox() {
  const { src, title } = useVideo();
  useEffect(() => {
    if (!src) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeVideo();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [src]);
  if (!src) return null;
  return createPortal(
    <div className="scrim fixed inset-0 z-[70] flex flex-col [--scrim-blur:14px] [--scrim:0.85]" onPointerDown={(e) => e.target === e.currentTarget && closeVideo()}>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(8px,var(--safe-top))] pb-2 text-[13px] text-white/80">
        <span className="min-w-0 flex-1 truncate" translate="no">
          {title}
        </span>
        <button onClick={closeVideo} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" title="Close (Esc)" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-6" onPointerDown={(e) => e.target === e.currentTarget && closeVideo()}>
        <iframe
          src={`${src}${src.includes('?') ? '&' : '?'}autoplay=1`}
          title={title || 'Video'}
          allow={PLAYER_ALLOW}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="aspect-video max-h-full w-full max-w-[1100px] rounded-xl bg-black shadow-2xl"
        />
      </div>
    </div>,
    document.body,
  );
}
