// Insert → Slides from another deck (PowerPoint's Reuse Slides, Google Slides' Import slides): a deck of the Library to
// pick (a find field), its slides to tick (all, or some), put in after the slide on view: keeping their look (their
// deck's theme as their own), or taking this deck's. Their pictures and videos come with them (shared/slides-reuse.ts).
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import { reuseSlides, sameLook } from '@shared/slides-reuse';
import type { Deck, Slide } from '@shared/slides';
import { api, enc } from '../../../lib/api';
import { Button, cx, Dialog } from '../../../components/ui';
import { Choice } from '../studio/fields';
import { LibraryPick } from './LibraryPick';
import { useDeckFonts } from './rt';
import { SlideThumb } from './Thumb';

export function ReuseSlidesDialog({ open, deck, pageId, onClose, onInsert }: { open: boolean; deck: Deck; pageId?: string; onClose: () => void; onInsert: (slides: Slide[]) => void }) {
  const [page, setPage] = useState<PageInfo | null>(null);
  const [from, setFrom] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [look, setLook] = useState<'theirs' | 'ours'>('theirs');
  const fonts = useDeckFonts(from);
  useEffect(() => {
    if (open) return;
    setPage(null);
    setFrom(null);
    setError(null);
    setPicked(new Set());
  }, [open]);
  const pick = async (p: PageInfo) => {
    setPage(p);
    setFrom(null);
    setError(null);
    try {
      const r = await api<{ page: PageInfo; model: Deck }>(`/api/pages/${enc(p.id)}`);
      if (r.page.kind !== 'slides' || !r.model?.slides) throw new Error('That is not a slide deck any more');
      setFrom(r.model);
      setPicked(new Set(r.model.slides.map((_, i) => i)));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggle = (i: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const n = picked.size;
  const same = !!from && sameLook(from.theme, deck.theme);
  const insert = () => {
    if (!from || !n) return;
    onInsert(
      reuseSlides(
        from,
        [...picked].sort((a, b) => a - b),
        deck,
        { keepLook: look === 'theirs' },
      ),
    );
  };
  // Each slide as wide as its column: the grid's width, measured, in two or three columns 8 px apart (less their borders).
  const [gridW, setGridW] = useState(0);
  const grid = useRef<ResizeObserver | null>(null);
  const measure = (el: HTMLDivElement | null) => {
    grid.current?.disconnect();
    if (!el) return;
    grid.current = new ResizeObserver(() => setGridW(el.clientWidth));
    grid.current.observe(el);
    setGridW(el.clientWidth);
  };
  const cols = gridW && gridW < 420 ? 2 : 3;
  const thumbW = gridW ? Math.max(80, Math.floor((gridW - 4 - (cols - 1) * 8) / cols) - 2) : 150;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Slides from another deck"
      width={720}
      footer={
        <Button size="sm" variant="primary" disabled={!from || !n} onClick={insert}>
          {!from || !n ? 'Insert slides' : n === 1 ? 'Insert 1 slide' : `Insert ${n} slides`}
        </Button>
      }
    >
      {!from ? (
        <div className="space-y-2">
          <LibraryPick kind="slides" picked={page?.id ?? null} onPick={(p) => void pick(p)} leaveOut={pageId} empty="No other decks in your Library yet." />
          {error && <p className="text-[12.5px] text-err">{error}</p>}
          {page && !error && <p className="text-[12.5px] text-fg-3">Opening it…</p>}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">
              From{' '}
              <span translate="no" className="font-medium text-fg">
                “{page?.title}”
              </span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setPicked(n === from.slides.length ? new Set() : new Set(from.slides.map((_, i) => i)))}>
              {n === from.slides.length ? 'Pick none' : 'Pick them all'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFrom(null)}>
              Another deck
            </Button>
          </div>
          <div ref={measure} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} className="grid max-h-[46dvh] gap-2 overflow-y-auto overscroll-contain p-0.5">
            {from.slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={picked.has(i)}
                aria-label={`Slide ${i + 1}`}
                onClick={() => toggle(i)}
                className={cx('relative overflow-hidden rounded-lg border text-left', picked.has(i) ? 'border-accent ring-2 ring-accent/30' : 'border-line opacity-70 hover:opacity-100')}
              >
                <SlideThumb deck={from} index={i} slide={s} theme={from.theme} width={thumbW} fonts={fonts} />
                <span className="absolute bottom-1 left-1.5 text-[11px] text-white [text-shadow:0_1px_3px_rgba(0,0,0,.8)] tabular-nums">{i + 1}</span>
                {picked.has(i) && (
                  <span className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
          {!same && (
            <Choice
              value={look}
              onChange={setLook}
              options={[
                { value: 'theirs', label: 'Keep their look', title: 'They keep the colours and fonts of the deck they come from' },
                { value: 'ours', label: 'Use this deck’s theme', title: 'They take this deck’s colours and fonts' },
              ]}
            />
          )}
          <p className="text-[11.5px] leading-snug text-fg-3">They go in after the slide on view, with their pictures, videos and speaker notes; their comments stay in their deck.</p>
        </div>
      )}
    </Dialog>
  );
}
