// The apps pinned to the top of the Apps page: bigger tiles, each opening its app at a tap, in the order you drag them
// into (or move them with a tile's menu); and Pin to the top / Unpin, for an app's card menu and its own page's menu.
import { useEffect, useRef, useState } from 'react';
import { closestCenter, DndContext, MouseSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, MoreHorizontal, Pin, PinOff } from 'lucide-react';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../lib/dragTouch';
import { go } from '../../lib/nav';
import { cx, IconButton, MenuItem, Popover } from '../../components/ui';
import { appPath } from './api';
import { AppIcon } from './AppIcon';
import { loadPins, movePin, savePins, togglePin, usePins } from './pins';

/** What a pinned app's tile shows of it. */
export interface PinFace {
  name: string;
  icon: string;
  color: string;
}

/** Pin to the top, or Unpin: in an app's card menu and its own page's menu. */
export function PinMenuItem({ id, onDone }: { id: string; onDone: () => void }) {
  const ids = usePins((s) => s.ids);
  useEffect(loadPins, []);
  const pinned = !!ids?.includes(id);
  return (
    <MenuItem icon={pinned ? <PinOff size={15} /> : <Pin size={15} />} onClick={() => (onDone(), togglePin(id))}>
      {pinned ? 'Unpin' : 'Pin to the top'}
    </MenuItem>
  );
}

/** When a drag last ended: the click that ends one opens nothing. */
let dragEnded = 0;

/** A pinned tile's More: Unpin, and a place to the left or right (what a drag does, without one). */
function TileMenu({ id, first, last }: { id: string; first: boolean; last: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton
        ref={btn}
        label="More"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="absolute top-2 right-2 bg-panel/80 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0 [@media(hover:none)]:opacity-100"
      >
        <MoreHorizontal size={16} />
      </IconButton>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={200}>
        <MenuItem icon={<PinOff size={15} />} onClick={() => (setOpen(false), togglePin(id))}>
          Unpin
        </MenuItem>
        {!(first && last) && (
          <>
            <MenuItem icon={<ArrowLeft size={15} />} disabled={first} onClick={() => (setOpen(false), movePin(id, -1))}>
              Move left
            </MenuItem>
            <MenuItem icon={<ArrowRight size={15} />} disabled={last} onClick={() => (setOpen(false), movePin(id, 1))}>
              Move right
            </MenuItem>
          </>
        )}
      </Popover>
    </>
  );
}

/** A pinned app: its icon and name, big; a tap opens it, a drag (a long press on a phone) moves it. */
function PinTile({ id, face, first, last }: { id: string; face: PinFace; first: boolean; last: boolean }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx('group relative w-[136px] shrink-0 snap-start sm:w-auto', isDragging && 'z-10')}>
      <button
        type="button"
        {...listeners}
        onClick={() => Date.now() - dragEnded > 300 && go(appPath(id))}
        className={cx(
          'flex h-[118px] w-full touch-manipulation flex-col items-start justify-between rounded-2xl border border-line bg-panel p-3.5 text-left transition-colors select-none [-webkit-touch-callout:none] hover:border-line-2 hover:bg-bg-1',
          isDragging && 'cursor-grabbing border-line-2 shadow-lg',
        )}
      >
        <AppIcon icon={face.icon} color={face.color} size={44} />
        <span translate={id.startsWith('tpl:') ? undefined : 'no'} className="line-clamp-2 w-full pr-1 text-[14px] leading-snug font-semibold tracking-tight">
          {face.name}
        </span>
      </button>
      <TileMenu id={id} first={first} last={last} />
    </div>
  );
}

/** The pinned apps, in their order: side by side (rows of them on a computer, one row that scrolls sideways on a phone). */
export function PinnedRow({ ids, faces }: { ids: string[]; faces: Record<string, PinFace | undefined> }) {
  const sensors = useSensors(useSensor(MouseSensor, MOUSE_DRAG), useSensor(AreaTouchSensor, TOUCH_DRAG));
  const shown = ids.filter((id) => faces[id]);
  const end = ({ active, over }: DragEndEvent) => {
    dragEnded = Date.now();
    if (!over || active.id === over.id) return;
    const all = usePins.getState().ids ?? [];
    const a = all.indexOf(String(active.id));
    const b = all.indexOf(String(over.id));
    if (a >= 0 && b >= 0) void savePins(arrayMove(all, a, b));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end} onDragCancel={() => (dragEnded = Date.now())}>
      <SortableContext items={shown} strategy={rectSortingStrategy}>
        <div ref={touchDragArea} className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(148px,1fr))] sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
          {shown.map((id, i) => (
            <PinTile key={id} id={id} face={faces[id]!} first={i === 0} last={i === shown.length - 1} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
