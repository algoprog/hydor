import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { closestCenter, DndContext, DragOverlay, MouseSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FolderPlus, Folders, Inbox, ListFilter, Plus, RotateCcw, SquarePen, WifiOff, X } from 'lucide-react';
import { usualOrder, type SidebarTool } from '@shared/sidebar';
import type { Assistant } from '@shared/assistants';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../lib/dragTouch';
import { go } from '../../lib/nav';
import { useApp, useSessions, useUI } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Wordmark } from '../../components/Logo';
import { cx, IconButton, MenuItem, MenuLabel, MenuSep, Popover, Segmented, useMediaQuery } from '../../components/ui';
import { NewSpaceDialog, SpaceMark } from '../spaces/parts';
import { openProject } from '../spaces/ProjectDialog';
import { useSpaces } from '../spaces/state';
import { useAssistantsState } from '../assistants/state';
import { AssistantIcon } from '../assistants/icons';
import { assistantTranslate } from '../assistants/language';
import { SessionList } from '../sessions/SessionList';
import { NewFolderHost, openNewFolder } from '../sessions/FolderDialog';
import { openPalette } from '../palette/CommandPalette';
import { MachineSwitcher } from '../machines/MachineSwitcher';
import { ColumnScroll } from './ColumnScroll';
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
      <span className={cx('max-w-full truncate leading-[1.35]', tight ? 'px-0.5 text-[11px]' : 'px-1')}>{t.label}</span>
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

/**
 * The filter menu's agents: those the list has sessions of, the most used first (eight at most, and the one picked),
 * each with how many. Counted only while the menu is open; nothing at all while no session was started as an agent.
 */
function AgentChoices({ picked, onPick }: { picked: string | null; onPick: (id: string | null) => void }) {
  const st = useAssistantsState();
  const byKey = useSessions((s) => s.byKey);
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of Object.values(byKey)) {
      const id = s.extra?.assistant;
      if (typeof id === 'string' && !s.archived && !s.subagentOf) n.set(id, (n.get(id) ?? 0) + 1);
    }
    return n;
  }, [byKey]);
  const all = st?.assistants ?? [];
  const shown = all.filter((a) => counts.has(a.id)).sort((a, b) => counts.get(b.id)! - counts.get(a.id)! || a.name.localeCompare(b.name)).slice(0, 8);
  const cur = picked ? all.find((a) => a.id === picked) : undefined;
  if (cur && !shown.includes(cur)) shown.push(cur);
  if (!shown.length) return null;
  return (
    <>
      <MenuLabel>Agent</MenuLabel>
      <MenuItem checked={!picked} onClick={() => onPick(null)}>
        All agents
      </MenuItem>
      {shown.map((a) => (
        <MenuItem key={a.id} icon={<AssistantIcon icon={a.icon} size={14} plain />} hint={<span className="tnum">{counts.get(a.id) ?? 0}</span>} checked={picked === a.id} onClick={() => onPick(a.id)}>
          <span translate={assistantTranslate(a)}>{a.name}</span>
        </MenuItem>
      ))}
      <MenuSep />
    </>
  );
}

/** A filter that is on, under New session: what it shows, and its × to show everything again. */
function FilterChip({ icon, label, clear, translate }: { icon: ReactNode; label: string; clear: () => void; translate?: 'no' }) {
  return (
    <span className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-accent/10 pr-0.5 pl-2 text-[12px] text-fg ring-1 ring-accent/30 ring-inset">
      <span className="flex shrink-0 items-center text-accent">{icon}</span>
      <span className="truncate" translate={translate}>
        {label}
      </span>
      <button type="button" aria-label={`Stop filtering: ${label}`} title="Show all sessions again" onClick={clear} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-fg-3 hover:bg-accent/15 hover:text-fg">
        <X size={12} />
      </button>
    </span>
  );
}

/** The filters that are on, as chips: the list's narrowing shows, and goes with a click. Nothing while none is on. */
function FilterChips({ agent }: { agent?: Assistant }) {
  const program = useUI((s) => s.agentFilter);
  const spaceFilter = useUI((s) => s.spaceFilter);
  const space = useSpaces()?.find((sp) => sp.id === spaceFilter);
  if (!agent && program === 'all' && !space) return null;
  const set = useUI.getState().set;
  return (
    <div className="flex flex-wrap gap-1.5">
      {agent && <FilterChip icon={<AssistantIcon icon={agent.icon} size={12} plain />} label={agent.name} translate={assistantTranslate(agent)} clear={() => set({ assistantFilter: null })} />}
      {program !== 'all' && <FilterChip icon={<AgentIcon agent={program} size={12} />} label={program === 'claude' ? 'Claude Code' : 'Codex'} clear={() => set({ agentFilter: 'all' })} />}
      {space && <FilterChip icon={<SpaceMark s={space} size={12} />} label={space.name} translate="no" clear={() => set({ spaceFilter: null })} />}
    </div>
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
  const agentFilter = useUI((s) => s.assistantFilter);
  const spaceFilter = useUI((s) => s.spaceFilter);
  const byFolder = useUI((s) => s.groupByFolder);
  const spaces = useSpaces();
  const agents = useAssistantsState()?.assistants;
  const agent = agentFilter ? agents?.find((a) => a.id === agentFilter) : undefined;
  // A space deleted while the list showed only its sessions: all of them again. The same for an agent.
  useEffect(() => {
    if (spaces && spaceFilter && !spaces.some((s) => s.id === spaceFilter)) useUI.getState().set({ spaceFilter: null });
  }, [spaces, spaceFilter]);
  useEffect(() => {
    if (agents && agentFilter && !agents.some((a) => a.id === agentFilter)) useUI.getState().set({ assistantFilter: null });
  }, [agents, agentFilter]);
  const filtered = filter !== 'all' || !!agentFilter || !!spaceFilter;
  const connected = useApp((s) => s.connected);
  const filterRef = useRef<HTMLButtonElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [making, setMaking] = useState(false);
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
      <IconButton ref={filterRef} label="Filter and group sessions" active={filtered} onClick={() => setFilterOpen((o) => !o)}>
        <ListFilter size={16} className={cx(filtered && 'text-accent')} />
      </IconButton>
      <Popover anchor={filterRef} open={filterOpen} onClose={() => setFilterOpen(false)} align="end" width={284}>
        {/* The agent each session started as (General, Researcher, yours), then the program it runs on, then the project. */}
        <AgentChoices picked={agentFilter} onPick={(id) => (useUI.getState().set({ assistantFilter: id }), setFilterOpen(false))} />
        <MenuLabel>Runs on</MenuLabel>
        <div className="px-1.5 pb-1">
          <Segmented
            size="sm"
            value={filter}
            onChange={(v) => (useUI.getState().set({ agentFilter: v }), setFilterOpen(false))}
            options={[
              { value: 'all', label: 'Any' },
              { value: 'claude', label: 'Claude Code', icon: <AgentIcon agent="claude" size={13} /> },
              { value: 'codex', label: 'Codex', icon: <AgentIcon agent="codex" size={13} /> },
            ]}
          />
        </div>
        {!!spaces?.length && (
          <>
            <MenuSep />
            <MenuLabel>Project</MenuLabel>
            <MenuItem checked={!spaceFilter} onClick={() => (useUI.getState().set({ spaceFilter: null }), setFilterOpen(false))}>
              Every project
            </MenuItem>
            {spaces.slice(0, 8).map((sp) => (
              <MenuItem key={sp.id} icon={<SpaceMark s={sp} size={14} />} checked={spaceFilter === sp.id} onClick={() => (useUI.getState().set({ spaceFilter: sp.id }), setFilterOpen(false))}>
                {sp.name}
              </MenuItem>
            ))}
          </>
        )}
        <MenuSep />
        <MenuItem icon={<Plus size={14} />} onClick={() => (setFilterOpen(false), setMaking(true))}>
          New project…
        </MenuItem>
        {/* Folders show while the list is grouped. */}
        {byFolder && (
          <MenuItem icon={<FolderPlus size={14} />} onClick={() => (setFilterOpen(false), openNewFolder())}>
            New folder…
          </MenuItem>
        )}
        <MenuItem icon={<Folders size={14} />} checked={byFolder} onClick={() => (useUI.getState().set({ groupByFolder: !byFolder }), setFilterOpen(false))}>
          Group by folder or project
        </MenuItem>
      </Popover>
      <NewSpaceDialog
        open={making}
        onClose={() => setMaking(false)}
        onMade={(sp) => {
          if (mobile) close();
          openProject(sp.id);
        }}
      />
      <NewFolderHost />
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
        <FilterChips agent={agent} />
      </div>

      <ColumnScroll
        data-tour="sessions"
        onClick={(e) => {
          // A tap on a button in the list itself closes the drawer, but not on one that folds or opens something there
          // (a section's heading, a menu: aria-expanded or aria-haspopup), and not in a session's menu, which opens over
          // it (React passes its clicks on here).
          const b = (e.target as HTMLElement).closest('button');
          if (mobile && b && e.currentTarget.contains(b) && !b.matches('[aria-expanded], [aria-haspopup]')) close();
        }}
      >
        <SessionList query="" />
      </ColumnScroll>
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
