import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Activity, Boxes, CircleHelp, FolderTree, Gauge, GitBranch, Inbox, ListFilter, MonitorSmartphone, PanelLeftClose, Search, Settings, SquarePen, SquareTerminal, WifiOff, X } from 'lucide-react';
import { activityOf } from '../../lib/activity';
import { useMachines } from '../../lib/machines';
import { MOD, pct } from '../../lib/format';
import { go } from '../../lib/nav';
import { useApp, useSessions, useUI, useUsage } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Logo } from '../../components/Logo';
import { severityColor } from '../../components/charts';
import { cx, IconButton, Kbd, MenuItem, MenuSep, Popover } from '../../components/ui';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { SessionList } from '../sessions/SessionList';
import { openPalette } from '../palette/CommandPalette';
import { machineId } from '../../lib/machine';
import { MachineSwitcher } from '../machines/MachineSwitcher';
import { features } from '../registry';

/** The most-used plan window, as a tiny meter under "Usage". */
function UsageHint() {
  const { claude, codex } = useUsage();
  const all = [...(claude?.windows ?? []), ...(codex?.windows ?? [])].filter((w) => w.usedPercent != null);
  if (!all.length) return null;
  const top = all.reduce((a, b) => ((b.usedPercent ?? 0) > (a.usedPercent ?? 0) ? b : a));
  const limited = !!(claude?.limited || codex?.limited);
  const title = [claude, codex]
    .flatMap((u) => (u?.windows ?? []).filter((w) => w.usedPercent != null).map((w) => `${u!.agent === 'claude' ? 'Claude' : 'Codex'} ${w.label}: ${pct(w.usedPercent)} used`))
    .join('\n');
  return (
    <span className="absolute bottom-[7px] left-1/2 h-[3px] w-8 -translate-x-1/2 overflow-hidden rounded-full bg-fg/10" title={title}>
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, top.usedPercent ?? 0)}%`, background: limited ? 'var(--err)' : severityColor(top.usedPercent) }} />
    </span>
  );
}

/** The inbox, by the sidebar's title: how many sessions wait on you, here and on the other machines, on its corner. */
function InboxButton({ active, onGo }: { active: boolean; onGo: (path: string) => void }) {
  const here = useSessions((s) => Object.values(s.byKey).filter((x) => activityOf(x)?.status === 'waiting').length);
  const there = useMachines((s) => s.list.filter((m) => m.id !== machineId && m.status.state === 'online').reduce((n, m) => n + m.status.waiting, 0));
  const n = here + there;
  return (
    <span className="relative inline-flex">
      <IconButton label={n ? `Inbox: ${n} waiting on you` : 'Inbox: everything waiting on you'} active={active} onClick={() => onGo('/inbox')}>
        <Inbox size={17} />
      </IconButton>
      {n > 0 && <span className="tnum pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-warn px-1 text-center text-[10px] leading-4 font-semibold text-bg">{n > 99 ? '99+' : n}</span>}
    </span>
  );
}

/** A tool: icon over label, four to a row, so the sessions keep the room (on phones and computers alike). */
function NavItem({
  path,
  match,
  label,
  icon,
  extra,
  onGo,
  tour,
  anim = 'ico-lift',
}: {
  path: string;
  match: boolean;
  label: string;
  icon: ReactNode;
  extra?: ReactNode;
  onGo: (p: string) => void;
  tour?: string;
  /** How its icon answers the pointer (styles.css, "small motion"). */
  anim?: string;
}) {
  return (
    <button
      data-tour={tour}
      onClick={() => onGo(path)}
      className={cx(
        'group relative flex h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] text-[11.5px] transition-colors',
        match ? 'bg-bg-3 font-medium text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg active:bg-bg-2',
      )}
    >
      <span className={cx('ico shrink-0', anim, match ? 'text-fg' : 'text-fg-3')}>{icon}</span>
      <span className="max-w-full truncate px-1 leading-none">{label}</span>
      {extra}
    </button>
  );
}

/** Navigation: new session, search, every session, then the tools. A drawer on phones. */
export const Sidebar = memo(function Sidebar({ mobile }: { mobile?: boolean }) {
  const [loc] = useLocation();
  const [q, setQ] = useState('');
  const filter = useUI((s) => s.agentFilter);
  const spaceFilter = useUI((s) => s.spaceFilter);
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


  const close = () => useUI.getState().set({ drawerOpen: false });
  const nav = (path: string) => {
    go(path);
    if (mobile) close();
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
        <div className="relative">
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
                <button type="button" onClick={openPalette} title="Search everything: settings, sessions, templates, notes, files" className="rounded">
                  <Kbd>{MOD}K</Kbd>
                </button>
              )
            )}
            <IconButton ref={filterRef} label={spaces?.length ? 'Filter by agent or space' : 'Filter by agent'} size="sm" active={filter !== 'all' || !!spaceFilter} onClick={() => setFilterOpen((o) => !o)}>
              <ListFilter size={14} className={cx((filter !== 'all' || spaceFilter) && 'text-accent')} />
            </IconButton>
          </span>
          <Popover anchor={filterRef} open={filterOpen} onClose={() => setFilterOpen(false)} align="end" width={200}>
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

      <nav data-tour="tools" className="grid shrink-0 grid-cols-4 gap-1 border-t border-line px-2 pt-2 pb-[max(8px,var(--safe-bottom))]">
        <NavItem path="/files" match={loc === '/files' || loc === '/file' || loc === '/search'} label="Files" icon={<FolderTree size={17} />} onGo={nav} />
        <NavItem path="/git" match={loc === '/git'} label="Git" icon={<GitBranch size={17} />} onGo={nav} />
        <NavItem path="/terminal" match={loc === '/terminal'} label="Terminal" icon={<SquareTerminal size={17} />} onGo={nav} anim="ico-nudge" />
        {features().flatMap((f) => (f.nav ?? []).map((n) => <NavItem key={n.path} path={n.path} match={n.match ? n.match(loc) : loc === n.path} label={n.label} icon={n.icon} onGo={nav} />))}
        {/* Dev-server previews open on this server's own preview port: its own machine only. */}
        {!machineId && <NavItem path="/preview" match={loc === '/preview'} label="Preview" icon={<MonitorSmartphone size={17} />} onGo={nav} />}
        <NavItem path="/usage" match={loc === '/usage' || loc === '/stats' || loc === '/arena'} label="Usage" icon={<Gauge size={17} />} extra={<UsageHint />} onGo={nav} anim="ico-grow" />
        <NavItem path="/system" match={loc === '/system'} label="System" icon={<Activity size={17} />} onGo={nav} anim="ico-beat" />
        <NavItem
          path="/settings"
          match={loc === '/settings'}
          label="Settings"
          icon={<Settings size={17} />}
          onGo={nav}
          anim="ico-turn"
          tour="nav-settings"
          extra={updates ? <span className="absolute top-2.5 left-[calc(50%+7px)] h-1.5 w-1.5 rounded-full bg-accent" title="A newer version is out (Settings → General)" /> : undefined}
        />
        <NavItem
          path=""
          match={false}
          label="Search"
          icon={<Search size={17} />}
          onGo={() => {
            if (mobile) close();
            openPalette();
          }}
        />
        <NavItem path="/guide" match={loc === '/guide' || loc.startsWith('/guide/')} label="Help" icon={<CircleHelp size={17} />} onGo={nav} />
      </nav>
    </aside>
  );
});
