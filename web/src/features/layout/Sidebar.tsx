import { memo, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { closestCenter, DndContext, DragOverlay, MouseSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Boxes, Folders, Inbox, ListFilter, RotateCcw, SquarePen, WifiOff, X } from 'lucide-react';
import { usualOrder, type SidebarTool } from '@shared/sidebar';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../lib/dragTouch';
import { go } from '../../lib/nav';
import { useApp, useUI } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Wordmark } from '../../components/Logo';
import { cx, IconButton, MenuItem, MenuSep, Popover, useMediaQuery } from '../../components/ui';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { SessionList } from '../sessions/SessionList';
import { openPalette } from '../palette/CommandPalette';
import { MachineSwitcher } from '../machines/MachineSwitcher';
import { SideColumn } from './SideColumn';
import { loadToolOrder, setToolOrder, useToolOrder } from './toolOrder';
import { useInboxCount, useTools, type Tool } from './tools';

/** What a tool being dragged gets: its place among the others, and the handlers that pick it up. */
interface DragBits {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties;
  attrs: HTMLAttributes<HTMLButtonElement>;
  /** Picked up: its place shows faintly while its copy follows the pointer. */
  lifted: boolean;
}

/** A drop ends with a click on the tool under the pointer; that click is ignored. */
let lastDragEnd = 0;

/** A tool: icon over label, four to a row (five with nine tools: two rows), so the sessions keep the room (on phones and computers alike). */
function NavItem({ t, drag, floating, onMenu, tight }: { t: Tool; drag?: DragBits; floating?: boolean; onMenu?: (e: ReactMouseEvent<HTMLElement>) => void; tight?: boolean }) {
  return (
    <button
      ref={drag?.ref}
      style={drag?.style}
      {...drag?.attrs}
      data-tour={floating ? undefined : t.tour}
      data-tip={!floating && t.id === 'search' ? 'search' : undefined}
      onClick={() => Date.now() - lastDragEnd > 300 && t.go()}
      onContextMenu={onMenu}
      className={cx(
        'group relative flex h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] text-[11.5px] transition-colors',
        // The copy that follows the pointer while it is dragged, lifted off the page.
        floating ? 'w-full bg-bg-2 shadow-lg ring-1 ring-line-2' : t.match ? 'bg-bg-3' : 'hover:bg-bg-2 active:bg-bg-2',
        t.match ? 'font-medium text-fg' : floating ? 'text-fg' : 'text-fg-2 hover:text-fg',
        drag?.lifted && 'opacity-40',
      )}
    >
      <span className={cx('shrink-0', t.match ? 'text-fg' : 'text-fg-3')}>{t.icon}</span>
      <span className={cx('max-w-full truncate leading-none', tight ? 'px-0.5 text-[11px]' : 'px-1')}>{t.label}</span>
      {t.extra}
    </button>
  );
}

/** A tool that drags into another place among them, as sessions do in their list. */
function SortableTool({ t, onMenu, tight }: { t: Tool; onMenu: (e: ReactMouseEvent<HTMLElement>) => void; tight?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <NavItem
      t={t}
      tight={tight}
      onMenu={onMenu}
      drag={{ ref: setNodeRef, style: { transform: CSS.Transform.toString(transform), transition }, attrs: { ...attributes, ...(listeners as HTMLAttributes<HTMLButtonElement>) }, lifted: isDragging }}
    />
  );
}

/** A phone's tools: every one in a grid, in the order you drag them into (on a computer they are on the rail, Rail.tsx). */
function ToolGrid({ nav, close }: { nav: (path: string) => void; close: () => void }) {
  const order = useToolOrder((s) => s.tools);
  const [dragId, setDragId] = useState<SidebarTool | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, MOUSE_DRAG), useSensor(AreaTouchSensor, TOUCH_DRAG));
  const coarse = useMediaQuery('(pointer: coarse)');
  const toolMenuAt = useRef<HTMLElement | null>(null);
  const [toolMenu, setToolMenu] = useState(false);
  const tools = useTools(nav, () => {
    close();
    openPalette();
  });
  tools.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  // Nine tools or more: five to a row, so they make two rows (not two and a lone one).
  const wide = tools.length >= 9;
  const dragging = dragId ? tools.find((t) => t.id === dragId) : undefined;

  const onToolDrop = ({ active, over }: DragEndEvent) => {
    lastDragEnd = Date.now();
    setDragId(null);
    if (!over || active.id === over.id) return;
    // Moved among every tool, the hidden ones too (Browser, on another machine's pages), so those keep their places.
    const from = order.indexOf(active.id as SidebarTool);
    const to = order.indexOf(over.id as SidebarTool);
    if (from >= 0 && to >= 0) setToolOrder(arrayMove(order, from, to));
  };
  // Once the order was changed, a right-click on a tool can put it back (a long press on a phone picks the tool up).
  const onToolMenu = (e: ReactMouseEvent<HTMLElement>) => {
    if (coarse || usualOrder(order)) return;
    e.preventDefault();
    toolMenuAt.current = e.currentTarget;
    setToolMenu(true);
  };

  return (
    <>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => {
            setDragId(active.id as SidebarTool);
            setToolMenu(false);
          }}
          onDragEnd={onToolDrop}
          onDragCancel={() => setDragId(null)}
          accessibility={{ screenReaderInstructions: { draggable: 'Drag a tool to move it. The tools keep the order you set, on every device.' } }}
        >
          {/* Only the tools in the grid: the tour brings them in by their places in it. Touches on them may pick one up (lib/dragTouch). */}
          <nav ref={touchDragArea} data-tour="tools" data-i18n="nav" className={cx('grid shrink-0 gap-1 border-t border-line px-2 pt-2 pb-[max(8px,var(--safe-bottom))]', wide ? 'grid-cols-5' : 'grid-cols-4')}>
            <SortableContext items={tools.map((t) => t.id)} strategy={rectSortingStrategy}>
              {tools.map((t) => (
                <SortableTool key={t.id} t={t} tight={wide} onMenu={onToolMenu} />
              ))}
            </SortableContext>
          </nav>
          {createPortal(<DragOverlay dropAnimation={null}>{dragging ? <NavItem t={dragging} floating tight={wide} /> : null}</DragOverlay>, document.body)}
        </DndContext>
        <Popover anchor={toolMenuAt} open={toolMenu} onClose={() => setToolMenu(false)} width={210}>
          <MenuItem
            icon={<RotateCcw size={14} />}
            onClick={() => {
              setToolMenu(false);
              setToolOrder([]);
            }}
          >
            Back to the usual order
          </MenuItem>
        </Popover>
    </>
  );
}

/** The inbox, by the drawer's title: how many sessions wait on you, here and on the other machines, on its corner. */
function InboxButton({ active, onGo }: { active: boolean; onGo: (path: string) => void }) {
  const n = useInboxCount();
  return (
    <span data-tip={n > 0 ? 'inbox' : undefined} className="relative inline-flex">
      <IconButton label={n ? `Inbox: ${n} waiting on you` : 'Inbox: everything waiting on you'} active={active} onClick={() => onGo('/inbox')}>
        <Inbox size={17} />
      </IconButton>
      {n > 0 && <span className="tnum pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-warn px-1 text-center text-[10px] leading-4 font-semibold text-bg">{n > 99 ? '99+' : n}</span>}
    </span>
  );
}

/**
 * Navigation: the sessions, with new session and their filters (search is the rail's, Ctrl+K). On a computer the sessions' column beside the rail (SideColumn;
 * its tools and the inbox are on the rail, Rail.tsx); on phones a drawer that has them all, the tools in a grid under the sessions.
 */
export const Sidebar = memo(function Sidebar({ mobile }: { mobile?: boolean }) {
  const [loc] = useLocation();
  const filter = useUI((s) => s.agentFilter);
  const spaceFilter = useUI((s) => s.spaceFilter);
  const byFolder = useUI((s) => s.groupByFolder);
  const spaces = useSpaces();
  // A space deleted while the list showed only its sessions: all of them again.
  useEffect(() => {
    if (spaces && spaceFilter && !spaces.some((s) => s.id === spaceFilter)) useUI.getState().set({ spaceFilter: null });
  }, [spaces, spaceFilter]);
  const connected = useApp((s) => s.connected);
  const filterRef = useRef<HTMLButtonElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  // The rail loads the orders on a computer; the drawer has no rail.
  useEffect(() => (mobile ? loadToolOrder() : undefined), [mobile]);
  const close = () => useUI.getState().set({ drawerOpen: false });
  const nav = (path: string) => {
    go(path);
    if (mobile) close();
  };

  // What narrows the list: the column's own action, and a button of the drawer's header on phones.
  const filterButton = (
    <>
      {/* Search is the rail's (and Ctrl+K's): it finds sessions with the rest. What stays here narrows the list itself. */}
      <IconButton ref={filterRef} label="Filter and group sessions" active={filter !== 'all' || !!spaceFilter} onClick={() => setFilterOpen((o) => !o)}>
        <ListFilter size={16} className={cx((filter !== 'all' || spaceFilter) && 'text-accent')} />
      </IconButton>
      <Popover anchor={filterRef} open={filterOpen} onClose={() => setFilterOpen(false)} align="end" width={272}>
        {(
          [
            ['all', 'All agents', null],
            ['claude', 'Claude Code', <AgentIcon key="c" agent="claude" size={14} />],
            ['codex', 'Codex', <AgentIcon key="x" agent="codex" size={14} />],
          ] as const
        ).map(([v, label, icon]) => (
          <MenuItem
            key={v}
            icon={icon}
            checked={filter === v}
            onClick={() => {
              useUI.getState().set({ agentFilter: v });
              setFilterOpen(false);
            }}
          >
            {label}
          </MenuItem>
        ))}
        {!!spaces?.length && (
          <>
            <MenuSep />
            <MenuItem checked={!spaceFilter} onClick={() => (useUI.getState().set({ spaceFilter: null }), setFilterOpen(false))}>
              Every project
            </MenuItem>
            {spaces.slice(0, 8).map((sp) => (
              <MenuItem key={sp.id} icon={<SpaceMark s={sp} size={14} />} checked={spaceFilter === sp.id} onClick={() => (useUI.getState().set({ spaceFilter: sp.id }), setFilterOpen(false))}>
                {sp.name}
              </MenuItem>
            ))}
            <MenuItem
              icon={<Boxes size={14} />}
              onClick={() => {
                setFilterOpen(false);
                nav('/projects');
              }}
            >
              Projects
            </MenuItem>
          </>
        )}
        <MenuSep />
        <MenuItem icon={<Folders size={14} />} checked={byFolder} onClick={() => (useUI.getState().set({ groupByFolder: !byFolder }), setFilterOpen(false))}>
          Group by folder or project
        </MenuItem>
      </Popover>
    </>
  );
  // Machine, New session and the sessions: under the header of the column, or of the drawer.
  const list = (
    <>
      <div data-tour="sidebar-search" className="space-y-2 px-3 pb-3">
        <MachineSwitcher onGo={mobile ? close : undefined} />
        <button
          onClick={() => nav('/')}
          className="flex h-9 w-full items-center gap-2.5 rounded-[10px] bg-bg-2 px-3 text-[13.5px] font-medium text-fg ring-1 ring-line-2 transition-colors ring-inset hover:bg-bg-3"
        >
          <SquarePen size={16} className="shrink-0" />
          New session
        </button>
      </div>

      <div
        data-tour="sessions"
        className="min-h-0 flex-1 overflow-y-auto"
        onClick={(e) => {
          // A tap on a button in the list itself; not in a session's menu, which opens over it (React passes its clicks on here).
          const t = e.target as HTMLElement;
          if (mobile && e.currentTarget.contains(t) && t.closest('button')) close();
        }}
      >
        <SessionList query="" />
      </div>
    </>
  );

  if (!mobile)
    return (
      <SideColumn label="Sessions" tour="sidebar" actions={filterButton}>
        {list}
      </SideColumn>
    );

  return (
    <aside data-tour="sidebar" className="flex h-full w-full flex-col bg-sidebar pt-[var(--safe-top)] select-none [-webkit-touch-callout:none] [&_input]:select-text">
      <div data-tour="sidebar-top" className="flex h-14 shrink-0 items-center gap-1 pr-2 pl-4">
        <span className="flex min-w-0 flex-1 items-center text-fg">
          <Wordmark height={16} tide />
        </span>
        {!connected && (
          <span title="Reconnecting…" className="px-1 text-warn">
            <WifiOff size={15} />
          </span>
        )}
        <InboxButton active={loc === '/inbox'} onGo={nav} />
        {filterButton}
        <IconButton label="Close menu" onClick={close}>
          <X size={18} />
        </IconButton>
      </div>

      {list}

      <ToolGrid nav={nav} close={close} />
    </aside>
  );
});
