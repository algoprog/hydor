import { memo, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { closestCenter, DndContext, DragOverlay, MouseSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Activity, Boxes, CircleHelp, Folders, FolderTree, Gauge, GitBranch, Inbox, ListFilter, MonitorSmartphone, PanelLeftClose, RotateCcw, Search, Settings, SquarePen, SquareTerminal, WifiOff, X } from 'lucide-react';
import { usualOrder, type SidebarTool } from '@shared/sidebar';
import { activityOf } from '../../lib/activity';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../lib/dragTouch';
import { useMachines } from '../../lib/machines';
import { MOD, pct } from '../../lib/format';
import { go } from '../../lib/nav';
import { useApp, useSessions, useUI, useUsage } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Logo } from '../../components/Logo';
import { severityColor } from '../../components/charts';
import { cx, IconButton, Kbd, MenuItem, MenuSep, Popover, useMediaQuery } from '../../components/ui';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { SessionList } from '../sessions/SessionList';
import { openPalette } from '../palette/CommandPalette';
import { machineId } from '../../lib/machine';
import { MachineSwitcher } from '../machines/MachineSwitcher';
import { features } from '../registry';
import type { AgentUsage } from '@shared/types';
import { loadToolOrder, setToolOrder, useToolOrder } from './toolOrder';

/** A subscription on a free plan (Codex "free", a Claude free account); any other plan counts as paid. */
const freePlan = (u: AgentUsage) => /free/i.test(u.account?.plan ?? '');

/** What one subscription has left: none at a limit, else what its fullest window leaves. */
function leftOf(u: AgentUsage): number {
  if (u.limited) return 0;
  const used = Math.max(0, ...u.windows.map((w) => w.usedPercent ?? 0));
  return Math.max(0, 100 - Math.min(100, used));
}

/**
 * What is left across the subscriptions, as a tiny meter under "Usage": the paid ones, or the free ones when there
 * are no paid ones, each counted once (an added account can be the agent's own sign-in too). No subscriptions, no bar.
 */
function UsageHint() {
  const { claude, codex, accounts } = useUsage();
  const seen = new Set<string>();
  const subs = [claude, codex, ...Object.values(accounts)].filter((u): u is AgentUsage => {
    if (!u?.ok || !u.windows.some((w) => w.usedPercent != null)) return false;
    const key = u.account?.email ? `${u.agent}:${u.account.email.toLowerCase()}` : null;
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
  const paid = subs.filter((u) => !freePlan(u));
  const counted = paid.length ? paid : subs;
  if (!counted.length) return null;
  const left = counted.reduce((n, u) => n + leftOf(u), 0) / counted.length;
  const title = [
    `${Math.round(left)}% left across ${counted.length} ${paid.length ? 'paid' : 'free'} subscription${counted.length === 1 ? '' : 's'}`,
    ...counted.map((u) => `${u.agent === 'claude' ? 'Claude' : 'Codex'}${u.account?.email ? ` (${u.account.email})` : ''}: ${pct(leftOf(u))} left`),
  ].join('\n');
  return (
    <span className="absolute bottom-[7px] left-1/2 h-[3px] w-8 -translate-x-1/2 overflow-hidden rounded-full bg-fg/10" title={title}>
      <span className="block h-full rounded-full" style={{ width: `${left}%`, background: left <= 0 ? 'var(--err)' : severityColor(100 - left) }} />
    </span>
  );
}

/** The inbox, by the sidebar's title: how many sessions wait on you, here and on the other machines, on its corner. */
function InboxButton({ active, onGo }: { active: boolean; onGo: (path: string) => void }) {
  const here = useSessions((s) => Object.values(s.byKey).filter((x) => activityOf(x)?.status === 'waiting').length);
  const there = useMachines((s) => s.list.filter((m) => m.id !== machineId && m.status.state === 'online').reduce((n, m) => n + m.status.waiting, 0));
  const n = here + there;
  return (
    <span data-tip={n > 0 ? 'inbox' : undefined} className="relative inline-flex">
      <IconButton label={n ? `Inbox: ${n} waiting on you` : 'Inbox: everything waiting on you'} active={active} onClick={() => onGo('/inbox')}>
        <Inbox size={17} />
      </IconButton>
      {n > 0 && <span className="tnum pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-warn px-1 text-center text-[10px] leading-4 font-semibold text-bg">{n > 99 ? '99+' : n}</span>}
    </span>
  );
}

/** One of the tools at the bottom: what it shows, and where it goes. */
interface Tool {
  id: SidebarTool;
  label: string;
  icon: ReactNode;
  /** Its page is the one open. */
  match: boolean;
  go: () => void;
  extra?: ReactNode;
  tour?: string;
  /** How its icon answers the pointer (styles.css, "small motion"). */
  anim?: string;
}

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

/** A tool: icon over label, four to a row, so the sessions keep the room (on phones and computers alike). */
function NavItem({ t, drag, floating, onMenu }: { t: Tool; drag?: DragBits; floating?: boolean; onMenu?: (e: ReactMouseEvent<HTMLElement>) => void }) {
  return (
    <button
      ref={drag?.ref}
      style={drag?.style}
      {...drag?.attrs}
      data-tour={floating ? undefined : t.tour}
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
      <span className={cx('ico shrink-0', t.anim ?? 'ico-lift', t.match ? 'text-fg' : 'text-fg-3')}>{t.icon}</span>
      <span className="max-w-full truncate px-1 leading-none">{t.label}</span>
      {t.extra}
    </button>
  );
}

/** A tool that drags into another place among them, as sessions do in their list. */
function SortableTool({ t, onMenu }: { t: Tool; onMenu: (e: ReactMouseEvent<HTMLElement>) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <NavItem
      t={t}
      onMenu={onMenu}
      drag={{ ref: setNodeRef, style: { transform: CSS.Transform.toString(transform), transition }, attrs: { ...attributes, ...(listeners as HTMLAttributes<HTMLButtonElement>) }, lifted: isDragging }}
    />
  );
}

/** Navigation: new session, search, every session, then the tools, in the order you drag them into. A drawer on phones. */
export const Sidebar = memo(function Sidebar({ mobile }: { mobile?: boolean }) {
  const [loc] = useLocation();
  const [q, setQ] = useState('');
  const filter = useUI((s) => s.agentFilter);
  const spaceFilter = useUI((s) => s.spaceFilter);
  const byFolder = useUI((s) => s.groupByFolder);
  const spaces = useSpaces();
  // A space deleted while the list showed only its sessions: all of them again.
  useEffect(() => {
    if (spaces && spaceFilter && !spaces.some((s) => s.id === spaceFilter)) useUI.getState().set({ spaceFilter: null });
  }, [spaces, spaceFilter]);
  const connected = useApp((s) => s.connected);
  const updates = useApp((s) => (s.boot?.update?.behind ?? 0) > 0);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const order = useToolOrder((s) => s.tools);
  useEffect(() => loadToolOrder(), []);
  const [dragId, setDragId] = useState<SidebarTool | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, MOUSE_DRAG), useSensor(AreaTouchSensor, TOUCH_DRAG));
  const coarse = useMediaQuery('(pointer: coarse)');
  const toolMenuAt = useRef<HTMLElement | null>(null);
  const [toolMenu, setToolMenu] = useState(false);

  const close = () => useUI.getState().set({ drawerOpen: false });
  const nav = (path: string) => {
    go(path);
    if (mobile) close();
  };

  const tools: Tool[] = [
    { id: 'files', label: 'Files', icon: <FolderTree size={17} />, match: loc === '/files' || loc === '/file' || loc === '/search', go: () => nav('/files') },
    { id: 'git', label: 'Git', icon: <GitBranch size={17} />, match: loc === '/git', go: () => nav('/git') },
    { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={17} />, match: loc === '/terminal', go: () => nav('/terminal'), anim: 'ico-nudge' },
    ...features().flatMap((f) => (f.nav ?? []).map((n): Tool => ({ id: n.id, label: n.label, icon: n.icon, match: n.match ? n.match(loc) : loc === n.path, go: () => nav(n.path) }))),
    // Dev-server previews open on this server's own preview port: its own machine only.
    ...(machineId ? [] : [{ id: 'preview', label: 'Preview', icon: <MonitorSmartphone size={17} />, match: loc === '/preview', go: () => nav('/preview') } satisfies Tool]),
    { id: 'usage', label: 'Usage', icon: <Gauge size={17} />, match: loc === '/usage' || loc === '/stats' || loc === '/arena', go: () => nav('/usage'), extra: <UsageHint />, anim: 'ico-grow' },
    { id: 'system', label: 'System', icon: <Activity size={17} />, match: loc === '/system', go: () => nav('/system'), anim: 'ico-beat' },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={17} />,
      match: loc === '/settings',
      go: () => nav('/settings'),
      anim: 'ico-turn',
      tour: 'nav-settings',
      extra: updates ? <span className="absolute top-2.5 left-[calc(50%+7px)] h-1.5 w-1.5 rounded-full bg-accent" title="A newer version is out (Settings → General)" /> : undefined,
    },
    {
      id: 'search',
      label: 'Search',
      icon: <Search size={17} />,
      match: false,
      go: () => {
        if (mobile) close();
        openPalette();
      },
    },
    { id: 'help', label: 'Help', icon: <CircleHelp size={17} />, match: loc === '/guide' || loc.startsWith('/guide/'), go: () => nav('/guide') },
  ];
  tools.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const dragging = dragId ? tools.find((t) => t.id === dragId) : undefined;

  const onToolDrop = ({ active, over }: DragEndEvent) => {
    lastDragEnd = Date.now();
    setDragId(null);
    if (!over || active.id === over.id) return;
    // Moved among every tool, the hidden ones too (Preview, on another machine's pages), so those keep their places.
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
    <aside
      data-tour="sidebar"
      className={cx('flex h-full w-full flex-col bg-sidebar pt-[var(--safe-top)]', mobile ? 'select-none [-webkit-touch-callout:none] [&_input]:select-text' : 'border-r border-line')}
    >
      <div data-tour="sidebar-top" className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <span className="group inline-flex">
          <Logo />
        </span>
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-tight">Naget Agent</span>
        {!connected && (
          <span title="Reconnecting…" className="text-warn">
            <WifiOff size={15} />
          </span>
        )}
        <InboxButton active={loc === '/inbox'} onGo={nav} />
        {mobile ? (
          <IconButton label="Close menu" onClick={close}>
            <X size={18} />
          </IconButton>
        ) : (
          <IconButton label={`Hide sidebar (${MOD}B)`} onClick={() => useUI.getState().set({ sideOpen: false })}>
            <PanelLeftClose size={17} />
          </IconButton>
        )}
      </div>

      <div data-tour="sidebar-search" className="space-y-2 px-3 pb-3">
        <MachineSwitcher onGo={mobile ? close : undefined} />
        <button
          onClick={() => nav('/')}
          className="group flex h-9.5 w-full items-center gap-2.5 rounded-[10px] bg-bg-2 px-3 text-[13.5px] font-medium text-fg ring-1 ring-line-2 transition-colors ring-inset hover:bg-bg-3"
        >
          <span className="ico ico-tilt">
            <SquarePen size={16} />
          </span>
          New session
        </button>
        <div data-tip="search" className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            placeholder="Search sessions"
            className="h-9 w-full rounded-[10px] bg-bg-2 pr-16 pl-9 text-[13.5px] outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent/25"
          />
          <span className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-1">
            {q ? (
              <IconButton label="Clear search" size="sm" onClick={() => setQ('')}>
                <X size={14} />
              </IconButton>
            ) : (
              !mobile && (
                <button type="button" onClick={openPalette} title="Search everything: settings, sessions, apps, notes, files" className="rounded">
                  <Kbd>{MOD}K</Kbd>
                </button>
              )
            )}
            <IconButton ref={filterRef} label="Filter and group sessions" size="sm" active={filter !== 'all' || !!spaceFilter} onClick={() => setFilterOpen((o) => !o)}>
              <ListFilter size={14} className={cx((filter !== 'all' || spaceFilter) && 'text-accent')} />
            </IconButton>
          </span>
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
                  Every space
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
                    nav('/spaces');
                  }}
                >
                  Spaces
                </MenuItem>
              </>
            )}
            <MenuSep />
            <MenuItem icon={<Folders size={14} />} checked={byFolder} onClick={() => (useUI.getState().set({ groupByFolder: !byFolder }), setFilterOpen(false))}>
              Group by folder or space
            </MenuItem>
          </Popover>
        </div>
      </div>

      <div
        data-tour="sessions"
        className="min-h-0 flex-1 overflow-y-auto"
        onClick={(e) => {
          if (mobile && (e.target as HTMLElement).closest('button')) close();
        }}
      >
        <SessionList query={q} />
      </div>

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
        <nav ref={touchDragArea} data-tour="tools" className="grid shrink-0 grid-cols-4 gap-1 border-t border-line px-2 pt-2 pb-[max(8px,var(--safe-bottom))]">
          <SortableContext items={tools.map((t) => t.id)} strategy={rectSortingStrategy}>
            {tools.map((t) => (
              <SortableTool key={t.id} t={t} onMenu={onToolMenu} />
            ))}
          </SortableContext>
        </nav>
        {createPortal(<DragOverlay dropAnimation={null}>{dragging ? <NavItem t={dragging} floating /> : null}</DragOverlay>, document.body)}
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
    </aside>
  );
});
