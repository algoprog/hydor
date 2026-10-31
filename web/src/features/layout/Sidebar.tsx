import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Activity, CircleHelp, FolderTree, Gauge, GitBranch, ListFilter, MonitorSmartphone, PanelLeftClose, Search, Settings, SquarePen, SquareTerminal, WifiOff, X } from 'lucide-react';
import { MOD, pct } from '../../lib/format';
import { go } from '../../lib/nav';
import { useApp, useUI, useUsage } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Logo } from '../../components/Logo';
import { severityColor } from '../../components/charts';
import { cx, IconButton, Kbd, MenuItem, Popover } from '../../components/ui';
import { SessionList } from '../sessions/SessionList';
import { openPalette } from '../palette/CommandPalette';
import { startTour } from '../tour/Tour';
import { machineId } from '../../lib/machine';
import { MachineSwitcher } from '../machines/MachineSwitcher';

/** The most-used plan window, as a tiny meter next to "Usage" (under it on a phone's tile). */
function UsageHint({ tile }: { tile?: boolean }) {
  const { claude, codex } = useUsage();
  const all = [...(claude?.windows ?? []), ...(codex?.windows ?? [])].filter((w) => w.usedPercent != null);
  if (!all.length) return null;
  const top = all.reduce((a, b) => ((b.usedPercent ?? 0) > (a.usedPercent ?? 0) ? b : a));
  const limited = !!(claude?.limited || codex?.limited);
  const title = [claude, codex]
    .flatMap((u) => (u?.windows ?? []).filter((w) => w.usedPercent != null).map((w) => `${u!.agent === 'claude' ? 'Claude' : 'Codex'} ${w.label}: ${pct(w.usedPercent)} used`))
    .join('\n');
  if (tile)
    return (
      <span className="absolute bottom-[7px] left-1/2 h-[3px] w-8 -translate-x-1/2 overflow-hidden rounded-full bg-fg/10" title={title}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, top.usedPercent ?? 0)}%`, background: limited ? 'var(--err)' : severityColor(top.usedPercent) }} />
      </span>
    );
  return (
    <span className="ml-auto flex items-center gap-2" title={title}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-fg/10">
        <span className="anim-grow-x block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, top.usedPercent ?? 0)}%`, background: severityColor(top.usedPercent) }} />
      </span>
      <span className={cx('tnum w-8 text-right text-[11.5px]', limited ? 'text-err' : 'text-fg-3')}>{limited ? 'Limit' : pct(top.usedPercent)}</span>
    </span>
  );
}

function NavItem({
  path,
  match,
  label,
  icon,
  extra,
  onGo,
  tour,
  anim = 'ico-lift',
  tile,
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
  /** A phone's drawer: icon over label, four to a row, so the sessions keep the room. */
  tile?: boolean;
}) {
  if (tile)
    return (
      <button
        data-tour={tour}
        onClick={() => onGo(path)}
        className={cx('group relative flex h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] text-[11.5px] transition-colors', match ? 'bg-bg-3 font-medium text-fg' : 'text-fg-2 active:bg-bg-2')}
      >
        <span className={cx('ico shrink-0', anim, match ? 'text-fg' : 'text-fg-3')}>{icon}</span>
        <span className="max-w-full truncate px-1 leading-none">{label}</span>
        {extra}
      </button>
    );
  return (
    <button
      data-tour={tour}
      onClick={() => onGo(path)}
      className={cx('group flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] transition-colors', match ? 'bg-bg-3 font-medium text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
    >
      <span className={cx('ico shrink-0', anim, match ? 'text-fg' : 'text-fg-3')}>{icon}</span>
      {label}
      {extra}
    </button>
  );
}

/** Navigation: new session, search, every session, then the tools. A drawer on phones. */
export const Sidebar = memo(function Sidebar({ mobile }: { mobile?: boolean }) {
  const [loc] = useLocation();
  const [q, setQ] = useState('');
  const filter = useUI((s) => s.agentFilter);
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
    <aside className="flex h-full w-full flex-col bg-sidebar pt-[var(--safe-top)]">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <span className="group inline-flex">
          <Logo />
        </span>
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-tight">Agent Console</span>
        {!connected && (
          <span title="Reconnecting…" className="text-warn">
            <WifiOff size={15} />
          </span>
        )}
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

      <div className="space-y-2 px-3 pb-3">
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
                <button type="button" onClick={openPalette} title="Sessions, actions and messages" className="rounded">
                  <Kbd>{MOD}K</Kbd>
                </button>
              )
            )}
            <IconButton ref={filterRef} label="Filter by agent" size="sm" active={filter !== 'all'} onClick={() => setFilterOpen((o) => !o)}>
              <ListFilter size={14} className={cx(filter !== 'all' && 'text-accent')} />
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

      <nav
        data-tour="tools"
        className={cx('shrink-0 border-t border-line px-2 pt-2 pb-[max(8px,var(--safe-bottom))]', mobile ? 'grid grid-cols-4 gap-1' : 'space-y-0.5')}
      >
        <NavItem tile={mobile} path="/files" match={loc === '/files' || loc === '/file' || loc === '/search'} label="Files" icon={<FolderTree size={17} />} onGo={nav} />
        <NavItem tile={mobile} path="/git" match={loc === '/git'} label="Git" icon={<GitBranch size={17} />} onGo={nav} />
        <NavItem tile={mobile} path="/terminal" match={loc === '/terminal'} label="Terminal" icon={<SquareTerminal size={17} />} onGo={nav} anim="ico-nudge" />
        {/* Dev-server previews open on this server's own preview port: its own machine only. */}
        {!machineId && <NavItem tile={mobile} path="/preview" match={loc === '/preview'} label="Preview" icon={<MonitorSmartphone size={17} />} onGo={nav} />}
        <NavItem tile={mobile} path="/usage" match={loc === '/usage' || loc === '/stats'} label="Usage" icon={<Gauge size={17} />} extra={<UsageHint tile={mobile} />} onGo={nav} anim="ico-grow" />
        <NavItem tile={mobile} path="/system" match={loc === '/system'} label="System" icon={<Activity size={17} />} onGo={nav} anim="ico-beat" />
        <NavItem
          tile={mobile}
          path="/settings"
          match={loc === '/settings'}
          label="Settings"
          icon={<Settings size={17} />}
          onGo={nav}
          anim="ico-turn"
          tour="nav-settings"
          extra={
            updates ? (
              <span className={cx('h-1.5 w-1.5 rounded-full bg-accent', mobile ? 'absolute top-2.5 left-[calc(50%+7px)]' : 'ml-auto')} title="A newer version is out (Settings → General)" />
            ) : undefined
          }
        />
        {mobile && (
          <NavItem
            tile
            path=""
            match={false}
            label="Tour"
            icon={<CircleHelp size={17} />}
            onGo={() => {
              close();
              startTour();
            }}
          />
        )}
      </nav>
    </aside>
  );
});
