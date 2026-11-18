// The rail: a narrow column of icons at the left edge of every page on a computer. Sessions (which shows or hides the
// sidebar), the sections (Browser, Library, Projects, Apps, Agents), then the inbox and the tools (Search, Usage,
// System, Settings, Help); a tooltip beside an icon names it (and its key) under the pointer or the keyboard's focus. Each group of tools keeps the order you drag it into, on every device.
// A phone has no rail: its drawer (Sidebar.tsx) holds the same.
import { cloneElement, createContext, isValidElement, memo, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from 'react';
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
import { cx, Kbd, MenuItem, Popover, useMediaQuery } from '../../components/ui';
import { openPalette } from '../palette/CommandPalette';
import { columnOf } from './column';
import { loadToolOrder, setToolOrder, useToolOrder } from './toolOrder';
import { useInboxCount, useTools, type Tool } from './tools';

/** The rail's width in px. */
export const RAIL_WIDTH = 56;

/** The session open last in this window: Sessions goes back to it. */
let lastSession: string | null = null;

/** A drop ends with a click on the tile under the pointer; that click is ignored. */
let lastDragEnd = 0;

/** A tile's icon, a little larger than the 17 px the tools' entries give it. */
const big = (icon: ReactNode) => (isValidElement(icon) ? cloneElement(icon as ReactElement<{ size?: number }>, { size: 19 }) : icon);

/** The rail's tooltip, shared by its tiles: show beside a tile, hide (`cold`: a press, a drag, a menu: the next waits again). */
const TipCtx = createContext<{ show: (el: HTMLElement, label: string, keys?: string, now?: boolean) => void; hide: (cold?: boolean) => void }>({ show: () => {}, hide: () => {} });

/** A tile's name (and its key) beside it: after a moment, or at once while one was just shown (moving along the rail). */
function useRailTip() {
  const [tip, setTip] = useState<{ label: string; keys?: string; top: number } | null>(null);
  const timer = useRef(0);
  const warm = useRef(0);
  const shown = useRef(false);
  const api = useMemo(
    () => ({
      show(el: HTMLElement, label: string, keys?: string, now = false) {
        window.clearTimeout(timer.current);
        const put = () => {
          const r = el.getBoundingClientRect();
          shown.current = true;
          setTip({ label, keys, top: r.top + r.height / 2 });
        };
        if (now || performance.now() < warm.current) put();
        else timer.current = window.setTimeout(put, 450);
      },
      hide(cold = false) {
        window.clearTimeout(timer.current);
        warm.current = shown.current && !cold ? performance.now() + 700 : 0;
        shown.current = false;
        setTip(null);
      },
    }),
    [],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [tip, api] as const;
}

/** What a tile being dragged gets: its place among the others, and the handlers that pick it up. */
interface DragBits {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties;
  attrs: HTMLAttributes<HTMLButtonElement>;
  /** Picked up: its place shows faintly while its copy follows the pointer. */
  lifted: boolean;
}

/** One tile: an icon, named by the rail's tooltip; the one for the page that is open has its own background and an accent bar at the rail's edge. */
function Tile({
  label,
  keys,
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
  /** Its shortcut, shown in the tooltip ("Ctrl+K"). */
  keys?: string;
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
  const tip = useContext(TipCtx);
  return (
    <button
      ref={drag?.ref}
      style={drag?.style}
      {...drag?.attrs}
      type="button"
      aria-label={keys ? `${label} (${keys})` : label}
      aria-current={current ? 'page' : undefined}
      data-tour={floating ? undefined : tour}
      data-tip={floating ? undefined : dataTip}
      onPointerEnter={(e) => !floating && e.pointerType === 'mouse' && tip.show(e.currentTarget, label, keys)}
      onPointerLeave={() => tip.hide()}
      onFocus={(e) => !floating && e.currentTarget.matches(':focus-visible') && tip.show(e.currentTarget, label, keys, true)}
      onBlur={() => tip.hide()}
      onPointerDown={() => tip.hide(true)}
      onClick={() => (!sorted || Date.now() - lastDragEnd > 300) && onClick()}
      onContextMenu={(e) => {
        tip.hide(true);
        onMenu?.(e);
      }}
      className={cx(
        'relative mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] transition-colors',
        // The copy that follows the pointer while it is dragged, lifted off the page.
        floating ? 'bg-bg-2 text-fg shadow-lg ring-1 ring-line-2' : current ? 'bg-bg-3 text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg active:bg-bg-2',
        drag?.lifted && 'opacity-40',
      )}
    >
      {current && !floating && <span aria-hidden className="absolute top-2 bottom-2 -left-2 w-[3px] rounded-r-full bg-accent" />}
      {icon}
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
      keys={t.keys ? `${MOD}${t.keys}` : undefined}
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
      label={n ? `Inbox: ${n} waiting on you` : 'Inbox: everything waiting on you'}
      icon={<Inbox size={19} />}
      current={current}
      onClick={() => go('/inbox')}
      dataTip={n > 0 ? 'inbox' : undefined}
      extra={
        n > 0 ? (
          <span className="tnum pointer-events-none absolute -top-0.5 left-[calc(50%+2px)] min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-accent-fg">{n > 99 ? '99+' : n}</span>
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
  const columnShows = sideOpen && !!columnOf(loc);

  const tools = useTools(go, openPalette, true);
  const [tip, tipApi] = useRailTip();
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
      <div className="flex flex-col gap-1">
        {list.map((t) => (
          <SortableTile key={t.id} t={t} onMenu={onMenu} />
        ))}
      </div>
    </SortableContext>
  );

  return (
    <nav data-rail data-tour="tools" data-i18n="nav" aria-label="Tools" className="flex h-full w-[56px] shrink-0 flex-col border-r border-line bg-sidebar pt-[calc(var(--safe-top)+8px)]">
      <TipCtx.Provider value={tipApi}>
      {/* Offline: said beside the logo at the top of the column, or here while no column shows it. */}
      {!connected && !columnShows && (
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
          tipApi.hide(true);
        }}
        onDragEnd={onDrop}
        onDragCancel={() => setDragId(null)}
        accessibility={{ screenReaderInstructions: { draggable: 'Drag a tool to move it. The tools keep the order you set, on every device.' } }}
      >
        {/* The tiles scroll in a short window (their bar hidden), so none is left out. Touches on them may pick one up (lib/dragTouch). */}
        <div ref={touchDragArea} onScroll={() => tipApi.hide(true)} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Tile label="Sessions" keys={inSessions ? `${MOD}B` : undefined} icon={<MessagesSquare size={19} />} current={inSessions} onClick={sessions} />
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
      </TipCtx.Provider>
      {tip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[80] flex -translate-y-1/2 items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap text-fg shadow-lg"
            style={{ top: tip.top, left: RAIL_WIDTH + 6 }}
          >
            {tip.label}
            {tip.keys && <Kbd>{tip.keys}</Kbd>}
          </div>,
          document.body,
        )}
    </nav>
  );
});
