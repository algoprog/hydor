// The slides in order, small: click one to edit it, drag one to move it, and each one's menu (right-click, the menu key,
// or its … : a new slide after it, duplicate, copy, cut, paste after it, delete, skip it in the slideshow, move up or
// down, its background and transition; the editor makes its rows, so they are the Slide menu's words). Down the side on a wide screen, across under the slide on a
// phone; the slide on view stays in view here. Also the grid of every slide (slide sorter), and the layouts a new
// slide is made from.
import { memo, useEffect, useRef, useState } from 'react';
import { closestCenter, DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { horizontalListSortingStrategy, rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Ellipsis, EyeOff } from 'lucide-react';
import { layoutSlide, LAYOUTS, type Deck, type LayoutId } from '@shared/slides';
import { cx, Popover } from '../../../components/ui';
import { ContextMenu, isMenuKey, type ContextMenuAt, type MenuEntry } from '../common/menus';
import { SlideThumb } from './Thumb';

/** The layouts to start a slide from, each drawn in the deck's theme. */
export function LayoutGrid({ deck, fonts, onPick }: { deck: Deck; fonts: number; onPick: (id: LayoutId) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {LAYOUTS.map((l) => {
        const sample: Deck = { ...deck, slides: [layoutSlide(l.id, {}, deck.ratio)] };
        return (
          <button key={l.id} type="button" onClick={() => onPick(l.id)} className="group overflow-hidden rounded-lg border border-line text-left transition-colors hover:border-accent/60">
            <SlideThumb deck={sample} index={0} slide={sample.slides[0]} theme={deck.theme} width={112} fonts={fonts} className="pointer-events-none" edit />
            <span className="block truncate px-1.5 py-1 text-[11.5px] text-fg-2 group-hover:text-fg">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ItemInner({
  deck,
  index,
  current,
  width,
  fonts,
  onPick,
  onMenu,
  horizontal,
  picked,
}: {
  deck: Deck;
  index: number;
  current: boolean;
  /** An agent's version is being written, the slide on view the one it is writing. */
  live?: boolean;
  width: number;
  fonts: number;
  onPick: (e: React.MouseEvent) => void;
  onMenu: (at: ContextMenuAt) => void;
  /** One of several slides picked together (Ctrl or Shift and a click). */
  picked?: boolean;
  horizontal?: boolean;
}) {
  const s = deck.slides[index];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const more = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement | null>(null);
  // The slide on view stays in view here (gone to with the keys, or the one an agent is writing).
  useEffect(() => {
    if (current) box.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        box.current = el;
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx('group relative flex shrink-0 gap-1.5', horizontal ? 'flex-col items-start' : 'items-start', isDragging && 'z-10 opacity-80')}
    >
      {!horizontal && <span className="w-5 shrink-0 pt-1 text-right text-[11px] text-fg-3 tabular-nums">{index + 1}</span>}
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={onPick}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu({ x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (!isMenuKey(e)) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu({ x: r.left + r.width / 2, y: r.top + r.height / 2, keyed: true });
        }}
        aria-label={`Slide ${index + 1}`}
        aria-current={current}
        className={cx('relative overflow-hidden rounded-md outline-none', current ? 'ring-2 ring-accent' : picked ? 'ring-2 ring-accent/60' : 'ring-1 ring-line hover:ring-line-2', s.hidden && 'opacity-45')}
      >
        <SlideThumb deck={deck} index={index} slide={s} theme={deck.theme} width={width} fonts={fonts} />
        {s.hidden && (
          <span className="absolute right-1 bottom-1 rounded bg-black/60 p-0.5 text-white">
            <EyeOff size={11} />
          </span>
        )}
        {horizontal && <span className="absolute bottom-0.5 left-1 text-[10.5px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{index + 1}</span>}
      </button>
      <button
        ref={more}
        type="button"
        aria-label="This slide’s menu"
        title="More"
        onClick={() => {
          const r = more.current!.getBoundingClientRect();
          onMenu({ x: r.left, y: r.bottom + 2 });
        }}
        className={cx('absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100', current && 'pointer-coarse:opacity-100')}
      >
        <Ellipsis size={13} />
      </button>
    </div>
  );
}

/**
 * One slide in the strip: drawn again only when its slide, its place or its look changes (a deck of forty being written
 * by an agent changes one slide at a time). Its handlers only pick it or open its menu, through setters that stay.
 */
const Item = memo(
  ItemInner,
  (a, b) =>
    // The slide an agent is writing, on view above: its small copy waits until it is finished (or another is on view).
    (a.deck.slides[a.index] === b.deck.slides[b.index] || (!!b.live && b.current && a.current)) &&
    a.index === b.index &&
    a.current === b.current &&
    a.picked === b.picked &&
    a.width === b.width &&
    a.fonts === b.fonts &&
    a.horizontal === b.horizontal &&
    a.deck.theme === b.deck.theme &&
    a.deck.ratio === b.deck.ratio &&
    a.deck.footer === b.deck.footer,
);

export interface StripActions {
  pick(i: number, how?: 'toggle' | 'range'): void;
  move(from: number, to: number): void;
  /** Slides picked together, moved together to where another was dropped (by their ids). */
  moveTogether(ids: string[], over: string): void;
  add(after: number, layout: LayoutId): void;
  duplicate(i: number): void;
  remove(i: number): void;
  toggleHidden(i: number): void;
  /** A slide made with AI after this one (the gallery of kinds), where the editor can ask an agent. */
  aiAfter?(i: number): void;
  /** The rows of a slide's menu (the editor makes them from the Slide menu's actions); `layouts` opens the gallery of layouts for a new slide after it. */
  menu(i: number, layouts: () => void): MenuEntry[];
}

/** The slides' menu (a right-click, the menu key or its …), and the layouts a new slide after it is made from. */
function SlideMenu({ deck, at, fonts, onClose, act }: { deck: Deck; at: { i: number; at: ContextMenuAt; layouts?: boolean } | null; fonts: number; onClose: () => void; act: StripActions }) {
  const [gallery, setGallery] = useState<{ i: number; x: number; y: number } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <>
      <ContextMenu at={at ? at.at : null} items={at ? act.menu(at.i, () => setGallery({ i: at.i, x: at.at.x, y: at.at.y })) : []} onClose={onClose} title={at ? `Slide ${at.i + 1}` : undefined} />
      <div ref={anchor} aria-hidden className="pointer-events-none fixed h-px w-px" style={{ left: gallery?.x ?? -10, top: gallery?.y ?? -10 }} />
      <Popover anchor={anchor} open={!!gallery} onClose={() => setGallery(null)} width={380} title="A new slide">
        {gallery && <LayoutGrid deck={deck} fonts={fonts} onPick={(l) => (act.add(gallery.i, l), setGallery(null))} />}
      </Popover>
    </>
  );
}

export function Strip({ deck, cur, fonts, act, layout, live, picks = [] }: { deck: Deck; cur: number; fonts: number; act: StripActions; layout: 'side' | 'bottom' | 'grid'; live?: boolean; picks?: string[] }) {
  const [menu, setMenu] = useState<{ i: number; at: ContextMenuAt } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }));
  const ids = deck.slides.map((s) => s.id);
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    // Slides picked together go together.
    if (picks.length > 1 && picks.includes(String(e.active.id))) return act.moveTogether(picks, String(e.over.id));
    act.move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };
  const horizontal = layout === 'bottom';
  const width = layout === 'grid' ? 220 : horizontal ? 104 : 148;
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={ids} strategy={layout === 'grid' ? rectSortingStrategy : horizontal ? horizontalListSortingStrategy : verticalListSortingStrategy}>
          <div
            className={cx(
              layout === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4 p-5' : horizontal ? 'flex gap-2 overflow-x-auto px-3 py-2 [&::-webkit-scrollbar]:hidden' : 'flex flex-col gap-2.5 px-2 py-3',
            )}
          >
            {deck.slides.map((s, i) => (
              <div key={s.id} className={cx(layout === 'grid' && 'flex flex-col gap-1')}>
                <Item deck={deck} index={i} current={i === cur} live={live} width={width} fonts={fonts} picked={picks.includes(s.id)} onPick={(e) => act.pick(i, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : undefined)} onMenu={(at) => setMenu({ i, at })} horizontal={horizontal || layout === 'grid'} />
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <SlideMenu deck={deck} at={menu} fonts={fonts} onClose={() => setMenu(null)} act={act} />
    </>
  );
}
