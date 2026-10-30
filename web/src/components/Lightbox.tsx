// Images opened large: fitted to the screen, a click (or tap) shows them at full size to pan around,
// arrows step through several, Escape closes.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { cx } from './ui';

export interface LightboxImage {
  src: string;
  name?: string;
}

const useLightbox = create<{ images: LightboxImage[]; index: number }>(() => ({ images: [], index: 0 }));

export const openLightbox = (images: LightboxImage[], index = 0) => useLightbox.setState({ images, index });
const close = () => useLightbox.setState({ images: [], index: 0 });

export function Lightbox() {
  const { images, index } = useLightbox();
  const [zoom, setZoom] = useState(false);
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
    <div className="anim-overlay fixed inset-0 z-[70] flex flex-col bg-black/85" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(8px,var(--safe-top))] pb-2 text-[13px] text-white/80">
        <span className="min-w-0 flex-1 truncate">{img.name ?? ''}</span>
        {images.length > 1 && (
          <span className="tnum shrink-0 text-white/60">
            {index + 1} / {images.length}
          </span>
        )}
        <a href={img.src} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" title="Open in a new tab" aria-label="Open in a new tab">
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
          src={img.src}
          alt={img.name ?? ''}
          onClick={() => setZoom((z) => !z)}
          className={cx('anim-pop select-none', zoom ? 'm-auto block max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in rounded-lg object-contain shadow-2xl')}
        />
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
