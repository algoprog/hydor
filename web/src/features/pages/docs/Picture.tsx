// What is picked in a document, over the page: a picture's frame with a handle at each corner to make it wider or
// narrower (as a share of the text's width, its proportions kept), and a bar by it for its alignment, its caption,
// its description (for those who cannot see it), editing it in the picture editor, another picture in its place,
// changing it with AI (a short menu: Change with AI, Remove the background, Erase part of it), asking an agent about
// it, and taking it out. A line across, a page break or a table of contents picked has the bar's last button alone.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Captions, Eraser, FileText, ImageMinus, RefreshCw, SlidersHorizontal, Sparkles, Trash2, Wand, WandSparkles } from 'lucide-react';
import type { Block, ImageBlock } from '@shared/docs';
import { Button, cx, inputCls, MenuItem, Popover, Switch } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
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
  onAi,
  onEdit,
  onAsk,
  ask,
}: {
  engine: DocEngine;
  block: Block;
  host: RefObject<HTMLDivElement | null>;
  /** Changes when the page may have moved (fonts arrived, the window was resized). */
  tick: unknown;
  readOnly?: boolean;
  onReplace: (id: string) => void;
  /** The picture changed with AI, its background taken out, or part of it erased (a dialog), then put in its place. */
  onAi?: (id: string, mode: 'change' | 'cutout' | 'erase') => void;
  /** The picture in the picture editor, in a tab of its own; saved, it takes this one's place. */
  onEdit?: (id: string) => void;
  onAsk?: () => void;
  /** The caption's or the description's box asked for from elsewhere (the right-click menu): which picture and which, and a time that changes with each ask. */
  ask?: { id: string; what: 'caption' | 'alt'; n: number } | null;
}) {
  const [box, setBox] = useState<Rect | null>(null);
  const [edit, setEdit] = useState<'caption' | 'alt' | null>(null);
  const [ai, setAi] = useState(false);
  const [text, setText] = useState('');
  const capRef = useRef<HTMLButtonElement>(null);
  const altRef = useRef<HTMLButtonElement>(null);
  const aiRef = useRef<HTMLButtonElement>(null);
  const img = block.type === 'image' ? (block as ImageBlock) : null;
  useEffect(() => {
    if (ask && img && ask.id === img.id) {
      setText(ask.what === 'alt' ? (img.alt ?? '') : (img.caption ?? ''));
      setEdit(ask.what);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask?.n]);
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
    engine.refocusSoon();
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
              {onEdit && !readOnly && img.src && (
                <Tool label="Edit picture" onClick={() => onEdit(img.id)}>
                  <SlidersHorizontal size={15} />
                </Tool>
              )}
              <Tool label="Another picture" onClick={() => onReplace(img.id)}>
                <RefreshCw size={15} />
              </Tool>
              {onAi && (
                <button
                  ref={aiRef}
                  type="button"
                  title="Change it with AI"
                  aria-label="Change it with AI"
                  aria-expanded={ai}
                  onClick={() => setAi((o) => !o)}
                  className={cx('flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg', ai && 'bg-bg-2 text-fg')}
                >
                  <Wand size={15} />
                </button>
              )}
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
      {img && onAi && (
        <Popover anchor={aiRef} open={ai} onClose={() => (setAi(false), engine.refocusSoon())} width={240} title="Change it with AI">
          {(
            [
              ['change', 'Change with AI', <WandSparkles key="c" size={14} />],
              ['cutout', 'Remove the background', <ImageMinus key="b" size={14} />],
              ['erase', 'Erase part of it', <Eraser key="e" size={14} />],
            ] as const
          ).map(([mode, label, icon]) => (
            <MenuItem
              key={mode}
              icon={icon}
              onClick={() => {
                setAi(false);
                onAi(img.id, mode);
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Popover>
      )}
      <Popover anchor={edit === 'alt' ? altRef : capRef} open={!!edit} onClose={() => (setEdit(null), engine.refocusSoon())} width={300} title={edit === 'alt' ? 'Description' : 'Caption'}>
        <form
          className="space-y-2 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="text-[12px] text-fg-3">{edit === 'alt' ? 'What the picture shows, for those who cannot see it.' : 'Shown under the picture.'}</p>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} translate="no" className={inputCls} />
          {edit === 'caption' && img && (
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-fg">
              <Switch on={!!img.label} onChange={(on) => engine.image(img.id, { label: on ? tr('Figure') : undefined })} label="Numbered" />
              <span>
                Numbered <span className="text-fg-3">({img.label ?? tr('Figure')} 1, 2, 3…)</span>
              </span>
            </label>
          )}
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
