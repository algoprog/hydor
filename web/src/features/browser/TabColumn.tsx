// The column left of the page on a computer: the sites you pinned (the items of the bookmarks bar), the agents' browsers
// at work, and your tabs, one row each. Ctrl+B folds it away. An agent's row shows its browser in the page's place
// (the page column and the right column take it over); a click on one of your tabs leaves it again.
import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import type { BrowserView } from '@shared/browser';
import { useSessions } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { cx } from '../../components/ui';
import { PinnedTiles } from './BookmarkBar';
import { statusOf, titleOf } from './AgentTabs';
import { closeTab, newTab, switchTab, tabName, useAgentBrowsers, type AgentBrowser } from './browsing';
import { Favicon, Speaker } from './TabStrip';
import { useRowPhases } from '../../lib/flip';
import { ColumnScroll } from '../layout/ColumnScroll';

/** A section's label with a chevron that folds it. */
function Label({ children, open, onToggle, hint }: { children: string; open: boolean; onToggle: () => void; hint?: string }) {
  return (
    <button onClick={onToggle} aria-expanded={open} className="group flex h-7 w-full items-center gap-1 px-3.5 text-left text-[12px] text-fg-3 hover:text-fg-2">
      <span>{children}</span>
      {hint && <span className="tnum">{hint}</span>}
      <span className="flex-1" />
      {open ? <ChevronDown size={13} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" /> : <ChevronRight size={13} />}
    </button>
  );
}

/** One agent's browser: its icon with a dot (working, or waiting for you), its session's title and what it is doing. */
function AgentRow({ b, selected, onOpen }: { b: AgentBrowser; selected: boolean; onOpen: () => void }) {
  const s = useSessions((x) => x.byKey[b.key]);
  const st = statusOf(b);
  const waits = !!st.warn;
  const busy = !!b.busy;
  return (
    <button onClick={onOpen} title={titleOf(b, s?.title)} className={cx('relative flex h-[46px] w-full items-center gap-2.5 rounded-lg pr-2 pl-3 text-left transition-colors', selected ? 'bg-bg-2' : 'hover:bg-bg-2/60')}>
      {selected && <span className={cx('absolute top-2 bottom-2 left-0 w-0.5 rounded-full', waits ? 'bg-warn' : 'bg-accent')} />}
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        {s ? <AgentIcon agent={s.agent} name={s.acpName} size={18} spinning={busy && !waits} /> : <AgentIcon agent="claude" size={18} />}
        {(waits || busy) && <span className={cx('absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-sidebar', waits ? 'bg-warn' : 'bg-busy')} />}
      </span>
      <span className="min-w-0 flex-1">
        <span translate="no" className="block truncate text-[13.5px] leading-tight">
          {titleOf(b, s?.title)}
        </span>
        <span className={cx('block truncate text-[12px] leading-tight', waits ? 'text-warn' : 'text-fg-3')}>{st.text}</span>
      </span>
    </button>
  );
}

/** One of your tabs; `ghost`: it was just closed, and closes up while it goes (it can be neither used nor reached). */
function TabRow({ t, on, watching, onLeave, ghost }: { t: BrowserView['tabs'][number]; on: boolean; watching: string | null; onLeave: () => void; ghost?: boolean }) {
  return (
    <div
      role="tab"
      aria-selected={on}
      aria-hidden={ghost || undefined}
      tabIndex={ghost ? -1 : 0}
      title={t.title || t.url}
      onClick={() => (watching && onLeave(), !t.active && void switchTab(t.id))}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), watching && onLeave(), void switchTab(t.id))}
      // A middle click closes it, as in other browsers.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onAuxClick={(e) => e.button === 1 && (e.preventDefault(), void closeTab(t.id))}
      className={cx('group press flex h-[34px] cursor-default items-center gap-2.5 rounded-lg pr-1 pl-2.5 text-[13px] transition-colors select-none', ghost && 'pointer-events-none', on ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-2/60 hover:text-fg')}
    >
      <Favicon tab={t} size={16} />
      <span translate="no" className="min-w-0 flex-1 truncate">
        {tabName(t)}
      </span>
      <Speaker tab={t} />
      <button
        aria-label="Close tab"
        title="Close tab"
        tabIndex={ghost ? -1 : undefined}
        onClick={(e) => (e.stopPropagation(), void closeTab(t.id))}
        className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-bg-3 hover:text-fg', !on && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function TabColumn({ view, watching, onWatch, onLeave }: { view: BrowserView; watching: string | null; onWatch: (key: string) => void; onLeave: () => void }) {
  const browsers = useAgentBrowsers((s) => s.browsers);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [tabsOpen, setTabsOpen] = useState(true);
  // A new tab opens its row and a closed one closes up, the rest following.
  const rows = useRowPhases(view.tabs);
  return (
    <nav aria-label="Browser tabs" className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-sidebar">
      <ColumnScroll className="flex flex-col pb-3">
        <PinnedTiles />
        {browsers.length > 0 && (
          <div className="mt-2">
            <Label open={agentsOpen} onToggle={() => setAgentsOpen((o) => !o)}>
              Agents at work
            </Label>
            {agentsOpen && (
              <div className="space-y-0.5 px-1.5">
                {browsers.map((b) => (
                  <AgentRow key={b.key} b={b} selected={watching === b.key} onOpen={() => onWatch(b.key)} />
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-2">
          <Label open={tabsOpen} onToggle={() => setTabsOpen((o) => !o)}>
            Tabs
          </Label>
          {tabsOpen && (
            <div role="tablist" className="px-1.5">
              {rows.map(({ row: t, phase }) => (
                <div role="presentation" key={phase === 'close' ? `gone:${t.id}` : t.id} className={cx('row-fold', phase && `row-${phase}`)}>
                  <TabRow t={t} on={t.active && !watching} watching={watching} onLeave={onLeave} ghost={phase === 'close'} />
                </div>
              ))}
              <button onClick={() => (watching && onLeave(), void newTab())} className="flex h-[34px] w-full items-center gap-2.5 rounded-lg pl-2.5 text-left text-[13px] text-fg-3 transition-colors hover:bg-bg-2/60 hover:text-fg-2">
                <Plus size={16} />
                New tab
              </button>
            </div>
          )}
        </div>
      </ColumnScroll>
    </nav>
  );
}
