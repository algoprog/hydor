// The rail: a narrow column at the left edge of every page on a computer. The app's mark, New session and Sessions (which
// shows or hides the sidebar), the sections (Browser, Library, Projects, Apps, Agents), then the inbox and the tools
// (Search, Usage, System, Settings, Help). Each group of tools keeps the order you drag it into, on every device.
// A phone has no rail: its drawer (Sidebar.tsx) holds the same.
import { cloneElement, isValidElement, memo, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { closestCenter, DndContext, DragOverlay, MouseSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Inbox, MessagesSquare, RotateCcw, WifiOff } from 'lucide-react';
import { SECTION_TOOLS, usualOrder, type SidebarTool } from '@shared/sidebar';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../lib/dragTouch';
import { MOD } from '../../lib/format';
import { go, sessionPath } from '../../lib/nav';
import { isStartingKey } from '../../lib/starting';
import { useApp, useSessions, useUI } from '../../lib/store';
import { cx, MenuItem, Popover, useMediaQuery } from '../../components/ui';
import { openPalette } from '../palette/CommandPalette';
import { ownColumn } from './column';
import { loadToolOrder, setToolOrder, useToolOrder } from './toolOrder';
import { useInboxCount, useTools, type Tool } from './tools';

/** The rail's width in px. */
export const RAIL_WIDTH = 72;

/** The session open last in this window: Sessions goes back to it. */
let lastSession: string | null = null;

/** A drop ends with a click on the tile under the pointer; that click is ignored. */
let lastDragEnd = 0;

/** A tile's icon, a little larger than the 17 px the tools' entries give it. */
const big = (icon: ReactNode) => (isValidElement(icon) ? cloneElement(icon as ReactElement<{ size?: number }>, { size: 19 }) : icon);

/** What a tile being dragged gets: its place among the others, and the handlers that pick it up. */
interface DragBits {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties;
  attrs: HTMLAttributes<HTMLButtonElement>;
  /** Picked up: its place shows faintly while its copy follows the pointer. */
  lifted: boolean;
}

/** One tile: icon over label; the one for the page that is open has its own background and an accent bar at the rail's edge. */
function Tile({
  label,
  tip,
  icon,
  current,
  onClick,
  extra,
  tour,
  dataTip,
  drag,
  floating,
  onMenu,
  sorted,
}: {
  label: string;
  tip?: string;
  icon: ReactNode;
  current?: boolean;
  onClick: () => void;
  extra?: ReactNode;
  tour?: string;
  dataTip?: string;
  drag?: DragBits;
  floating?: boolean;
  onMenu?: (e: ReactMouseEvent<HTMLElement>) => void;
  /** One of the tools that can be dragged: a click right after a drop is not a click. */
  sorted?: boolean;
}) {
  return (
    <button
      ref={drag?.ref}
      style={drag?.style}
      {...drag?.attrs}
      type="button"
      title={tip ?? label}
      aria-label={tip ?? label}
      aria-current={current ? 'page' : undefined}
      data-tour={floating ? undefined : tour}
      data-tip={floating ? undefined : dataTip}
      onClick={() => (!sorted || Date.now() - lastDragEnd > 300) && onClick()}
      onContextMenu={onMenu}
      className={cx(
        'relative flex h-[54px] w-full shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] text-[10.5px] transition-colors',
        // The copy that follows the pointer while it is dragged, lifted off the page.
        floating ? 'bg-bg-2 text-fg shadow-lg ring-1 ring-line-2' : current ? 'bg-bg-3 font-medium text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg active:bg-bg-2',
        drag?.lifted && 'opacity-40',
      )}
    >
      {current && !floating && <span aria-hidden className="absolute top-3 bottom-3 -left-2 w-[3px] rounded-r-full bg-accent" />}
      <span className="shrink-0">{icon}</span>
      <span className="max-w-full truncate px-0.5 leading-none">{label}</span>
      {extra}
    </button>
  );
}

/** A tool that drags into another place among its group. */
function SortableTile({ t, onMenu }: { t: Tool; onMenu: (e: ReactMouseEvent<HTMLElement>) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <ToolTile
      t={t}
      onMenu={onMenu}
      drag={{
        ref: setNodeRef,
        // Up and down only, as the rail is a column.
        style: { transform: CSS.Transform.toString(transform && { ...transform, x: 0 }), transition },
        attrs: { ...attributes, ...(listeners as HTMLAttributes<HTMLButtonElement>) },
        lifted: isDragging,
      }}
    />
  );
}

function ToolTile({ t, drag, floating, onMenu }: { t: Tool; drag?: DragBits; floating?: boolean; onMenu?: (e: ReactMouseEvent<HTMLElement>) => void }) {
  return (
    <Tile
      label={t.label}
      tip={t.keys ? `${t.label} (${MOD}${t.keys})` : undefined}
      icon={big(t.icon)}
      current={t.match}
      onClick={t.go}
      extra={t.extra}
      tour={t.tour}
      dataTip={t.id === 'search' ? 'search' : undefined}
      drag={drag}
      floating={floating}
      onMenu={onMenu}
      sorted
    />
  );
}

/** The inbox: how many things wait on you (sessions here and on other machines, calls the Outbox holds) as a pill on its icon. */
function InboxTile({ current }: { current: boolean }) {
  const n = useInboxCount();
  return (
    <Tile
      label="Inbox"
      tip={n ? `Inbox: ${n} waiting on you` : 'Inbox: everything waiting on you'}
      icon={<Inbox size={19} />}
      current={current}
      onClick={() => go('/inbox')}
      dataTip={n > 0 ? 'inbox' : undefined}
      extra={
        n > 0 ? (
          <span className="tnum pointer-events-none absolute top-1.5 left-[calc(50%+3px)] min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-accent-fg">{n > 99 ? '99+' : n}</span>
        ) : undefined
      }
    />
  );
}

export const Rail = memo(function Rail() {
  const [loc] = useLocation();
  const connected = useApp((s) => s.connected);
  const order = useToolOrder((s) => s.tools);
  useEffect(() => loadToolOrder(), []);
  const [dragId, setDragId] = useState<SidebarTool | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, MOUSE_DRAG), useSensor(AreaTouchSensor, TOUCH_DRAG));
  const coarse = useMediaQuery('(pointer: coarse)');
  const menuAt = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState(false);

  // Sessions goes back to the one open last.
  const session = /^\/s\/([^/]+)/.exec(loc)?.[1];
  useEffect(() => {
    if (!session) return;
    const key = decodeURIComponent(session);
    if (!isStartingKey(key)) lastSession = key;
  }, [session]);
  const inSessions = loc === '/' || loc.startsWith('/s/') || loc.startsWith('/review/');
  const sideOpen = useUI((s) => s.sideOpen);
  const sidebarShows = sideOpen && !ownColumn(loc);

  const tools = useTools(go, openPalette);
  tools.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const sections = tools.filter((t) => SECTION_TOOLS.includes(t.id));
  const utilities = tools.filter((t) => !SECTION_TOOLS.includes(t.id));
  const dragging = dragId ? tools.find((t) => t.id === dragId) : undefined;

  const onDrop = ({ active, over }: DragEndEvent) => {
    lastDragEnd = Date.now();
    setDragId(null);
    if (!over || active.id === over.id) return;
    // A tool stays in its group: the sections above, the others below.
    if (SECTION_TOOLS.includes(active.id as SidebarTool) !== SECTION_TOOLS.includes(over.id as SidebarTool)) return;
    // Moved among every tool, the hidden ones too (Browser, on another machine's pages), so those keep their places.
    const from = order.indexOf(active.id as SidebarTool);
    const to = order.indexOf(over.id as SidebarTool);
    if (from >= 0 && to >= 0) setToolOrder(arrayMove(order, from, to));
  };
  // Once the order was changed, a right-click on a tool can put it back (a long press picks the tool up).
  const onMenu = (e: ReactMouseEvent<HTMLElement>) => {
    if (coarse || usualOrder(order)) return;
    e.preventDefault();
    menuAt.current = e.currentTarget;
    setMenu(true);
  };

  const sessions = () => {
    const ui = useUI.getState();
    if (inSessions) return ui.set({ sideOpen: !ui.sideOpen });
    ui.set({ sideOpen: true });
    go(lastSession && useSessions.getState().byKey[lastSession] ? sessionPath(lastSession) : '/');
  };

  const group = (list: Tool[]) => (
    <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
      <div className="flex flex-col gap-0.5">
        {list.map((t) => (
          <SortableTile key={t.id} t={t} onMenu={onMenu} />
        ))}
      </div>
    </SortableContext>
  );

  return (
    <nav data-rail data-tour="tools" data-i18n="nav" aria-label="Tools" className="flex h-full w-[72px] shrink-0 flex-col border-r border-line bg-sidebar pt-[calc(var(--safe-top)+8px)]">
      {/* Offline: said beside the logo at the top of the sidebar, or here while no sidebar shows it. */}
      {!connected && !sidebarShows && (
        <span title="Reconnecting…" className="flex h-8 shrink-0 items-center justify-center text-warn">
          <WifiOff size={15} />
        </span>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => {
          setDragId(active.id as SidebarTool);
          setMenu(false);
        }}
        onDragEnd={onDrop}
        onDragCancel={() => setDragId(null)}
        accessibility={{ screenReaderInstructions: { draggable: 'Drag a tool to move it. The tools keep the order you set, on every device.' } }}
      >
        {/* The tiles scroll in a short window (their bar hidden), so none is left out. Touches on them may pick one up (lib/dragTouch). */}
        <div ref={touchDragArea} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Tile label="Sessions" tip={inSessions ? `Sessions (${MOD}B)` : 'Sessions'} icon={<MessagesSquare size={19} />} current={inSessions} onClick={sessions} />
          {group(sections)}
          <div className="min-h-2 flex-1" />
          <InboxTile current={loc === '/inbox'} />
          {group(utilities)}
        </div>
        {createPortal(<DragOverlay dropAnimation={null}>{dragging ? <ToolTile t={dragging} floating /> : null}</DragOverlay>, document.body)}
      </DndContext>
      <Popover anchor={menuAt} open={menu} onClose={() => setMenu(false)} width={210}>
        <MenuItem
          icon={<RotateCcw size={14} />}
          onClick={() => {
            setMenu(false);
            setToolOrder([]);
          }}
        >
          Back to the usual order
        </MenuItem>
      </Popover>
    </nav>
  );
});
