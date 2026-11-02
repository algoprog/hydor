// What is picked in a document, over the page: a picture's frame with a handle at each corner to make it wider or
// narrower (as a share of the text's width, its proportions kept), and a bar by it for its alignment, its caption,
// its description (for those who cannot see it), another picture in its place, asking an agent about it, and
// taking it out. A line across or a page break picked has the bar's last button alone.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Captions, FileText, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import type { Block, ImageBlock } from '@shared/docs';
import { Button, cx, inputCls, Popover } from '../../../components/ui';
import { Tool } from '../slides/controls';
import type { DocEngine } from './engine';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where an element is, in the host's own coordinates. */
function rectIn(el: Element, host: HTMLElement): Rect {
  const a = el.getBoundingClientRect();
  const b = host.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

export function Picked({
  engine,
  block,
  host,
  tick,
  readOnly,
  onReplace,
  onAsk,
}: {
  engine: DocEngine;
  block: Block;
  host: RefObject<HTMLDivElement | null>;
  /** Changes when the page may have moved (fonts arrived, the window was resized). */
  tick: unknown;
  readOnly?: boolean;
  onReplace: (id: string) => void;
  onAsk?: () => void;
}) {
  const [box, setBox] = useState<Rect | null>(null);
  const [edit, setEdit] = useState<'caption' | 'alt' | null>(null);
  const [text, setText] = useState('');
  const capRef = useRef<HTMLButtonElement>(null);
  const altRef = useRef<HTMLButtonElement>(null);
  const img = block.type === 'image' ? (block as ImageBlock) : null;
  const target = () => {
    const el = engine.elementOf(block.id);
    return (img ? el?.querySelector('img') : el) ?? null;
  };
  const measure = () => {
    const t = target();
    if (t && host.current) setBox(rectIn(t, host.current));
  };
  useLayoutEffect(() => {
    measure();
    const t = target();
    if (!t) return;
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block, tick]);
  if (!box) return null;

  // Dragging a corner: the picture as wide as the pointer says (from its middle, when it is centred), its height following.
  const drag = (dx: number) => (e: React.PointerEvent) => {
    if (!img || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const t = target() as HTMLImageElement | null;
    const fig = t?.parentElement;
    if (!t || !fig) return;
    const full = fig.clientWidth || 1;
    const start = t.getBoundingClientRect().width;
    const x0 = e.clientX;
    const k = (img.align ?? 'center') === 'center' ? 2 : 1;
    let share = img.w;
    const move = (ev: PointerEvent) => {
      const w = Math.max(full * 0.05, Math.min(full, start + (ev.clientX - x0) * dx * k));
      share = Math.round((w / full) * 1000) / 1000;
      t.style.width = `${share * 100}%`;
      measure();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (share !== img.w) engine.image(img.id, { w: share });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const above = box.y > 52;
  const save = () => {
    if (img && edit) engine.image(img.id, { [edit]: text.replace(/\s+/g, ' ').trim() || undefined });
    setEdit(null);
  };
  return (
    <>
      {img && !readOnly && (
        <div className="pointer-events-none absolute z-10" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
          {CORNERS.map(([sx, sy]) => (
            <span
              key={`${sx},${sy}`}
              onPointerDown={drag(sx)}
              className="pointer-events-auto absolute h-3.5 w-3.5 rounded-[3px] border-2 border-white bg-[#1a73e8] shadow-[0_0_0_1px_rgba(0,0,0,.18)] max-md:h-5 max-md:w-5"
              style={{ left: sx < 0 ? 0 : '100%', top: sy < 0 ? 0 : '100%', transform: 'translate(-50%,-50%)', cursor: sx === sy ? 'nwse-resize' : 'nesw-resize', touchAction: 'none' }}
            />
          ))}
        </div>
      )}
      {!readOnly && (
        <div
          data-keeps-editing
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 flex items-center gap-0.5 rounded-xl border border-line bg-elevated p-1 shadow-lg"
          style={{ left: Math.max(4, box.x + box.w / 2), top: above ? box.y - 8 : box.y + box.h + 8, transform: `translate(-50%, ${above ? '-100%' : '0'})` }}
        >
          {img && (
            <>
              <Tool label="On the left" on={img.align === 'left'} onClick={() => engine.image(img.id, { align: 'left' })}>
                <AlignLeft size={15} />
              </Tool>
              <Tool label="In the middle" on={!img.align || img.align === 'center'} onClick={() => engine.image(img.id, { align: undefined })}>
                <AlignCenter size={15} />
              </Tool>
              <Tool label="On the right" on={img.align === 'right'} onClick={() => engine.image(img.id, { align: 'right' })}>
                <AlignRight size={15} />
              </Tool>
              <span className="mx-0.5 h-5 w-px bg-line" />
              <button ref={capRef} type="button" title="Caption" aria-label="Caption" onClick={() => (setText(img.caption ?? ''), setEdit('caption'))} className={cx('flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg', img.caption && 'text-accent')}>
                <Captions size={15} />
              </button>
              <button ref={altRef} type="button" title="Description" aria-label="Description" onClick={() => (setText(img.alt ?? ''), setEdit('alt'))} className={cx('flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg', img.alt && 'text-accent')}>
                <FileText size={15} />
              </button>
              <Tool label="Another picture" onClick={() => onReplace(img.id)}>
                <RefreshCw size={15} />
              </Tool>
              {onAsk && (
                <Tool label="Ask the agent about it" onClick={onAsk}>
                  <Sparkles size={15} className="text-accent" />
                </Tool>
              )}
              <span className="mx-0.5 h-5 w-px bg-line" />
            </>
          )}
          <Tool label="Delete" onClick={() => engine.removePicked()}>
            <Trash2 size={15} />
          </Tool>
        </div>
      )}
      <Popover anchor={edit === 'alt' ? altRef : capRef} open={!!edit} onClose={() => setEdit(null)} width={300} title={edit === 'alt' ? 'Description' : 'Caption'}>
        <form
          className="space-y-2 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="text-[12px] text-fg-3">{edit === 'alt' ? 'What the picture shows, for those who cannot see it.' : 'Shown under the picture.'}</p>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} translate="no" className={inputCls} />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" type="submit">
              Done
            </Button>
          </div>
        </form>
      </Popover>
    </>
  );
}
