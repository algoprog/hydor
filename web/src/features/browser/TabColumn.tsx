// The column left of the page on a computer: the sites you pinned (the items of the bookmarks bar), the agents' browsers
// at work, and your tabs, one row each. Ctrl+B folds it away. An agent's row shows its browser in the page's place
// (the page column and the right column take it over); a click on one of your tabs leaves it again.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bookmark, ChevronDown, ChevronRight, Copy, CopyPlus, Ellipsis, FolderMinus, Folders, Palette, Pencil, Plus, RotateCw, Sparkles, Ungroup, X, XCircle } from 'lucide-react';
import { GROUP_COLORS, inTabOrder, type BrowserGroup, type BrowserView, type GroupColor } from '@shared/browser';
import { Throbber } from '../../components/ui';
import { ContextMenu, isMenuKey, type ContextMenuAt, type MenuEntry } from '../pages/common/menus';
import { toast, useSessions } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { FadeText } from '../../components/FadeText';
import { cx } from '../../components/ui';
import { PinnedTiles } from './BookmarkBar';
import { statusOf, titleOf } from './AgentTabs';
import { closeTab, closeTabs, duplicateTab, editGroup, groupTabs, groupWithAi, isWebPage, moveToGroup, newTab, newTabIn, reloadTab, removeGroup, switchTab, tabName, useAgentBrowsers, useBookmarks, useGrouping, type AgentBrowser } from './browsing';
import { toggleBookmark } from './BookmarkBar';
import { Favicon, Speaker } from './TabStrip';
import { useRowPhases } from '../../lib/flip';
import { ColumnScroll } from '../layout/ColumnScroll';
import { ColumnResizer, useNavWidth } from '../layout/SideColumn';

/** A section's label with a chevron that folds it, and buttons at its end (`actions`: they show when you point at the label). */
function Label({ children, open, onToggle, hint, actions }: { children: string; open: boolean; onToggle: () => void; hint?: string; actions?: ReactNode }) {
  return (
    <div className="group flex h-7 items-center pr-1.5">
      <button onClick={onToggle} aria-expanded={open} className="flex h-7 min-w-0 flex-1 items-center gap-1 pl-3.5 text-left text-[12px] text-fg-3 hover:text-fg-2">
        <span>{children}</span>
        {hint && <span className="tnum">{hint}</span>}
        <span className="flex-1" />
      </button>
      {actions}
      <button onClick={onToggle} tabIndex={-1} aria-hidden className="flex h-7 w-6 items-center justify-center text-fg-3 hover:text-fg-2">
        {open ? <ChevronDown size={13} className="opacity-0 group-hover:opacity-100" /> : <ChevronRight size={13} />}
      </button>
    </div>
  );
}

/** One agent's browser: its icon with a dot (working, or waiting for you), its session's title and what it is doing. */
function AgentRow({ b, selected, onOpen }: { b: AgentBrowser; selected: boolean; onOpen: () => void }) {
  const s = useSessions((x) => x.byKey[b.key]);
  const st = statusOf(b);
  const waits = !!st.warn;
  const busy = !!b.busy;
  return (
    <button onClick={onOpen} title={titleOf(b, s?.title)} className={cx('group relative flex h-[46px] w-full items-center gap-2.5 rounded-lg pr-2 pl-3 text-left transition-colors', selected ? 'bg-bg-2' : 'hover:bg-bg-2/60')}>
      {selected && <span className={cx('absolute top-2 bottom-2 left-0 w-0.5 rounded-full', waits ? 'bg-warn' : 'bg-accent')} />}
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        {s ? <AgentIcon agent={s.agent} name={s.acpName} size={18} spinning={busy && !waits} /> : <AgentIcon agent="claude" size={18} />}
        {(waits || busy) && <span className={cx('absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-sidebar', waits ? 'bg-warn' : 'bg-busy')} />}
      </span>
      <span className="min-w-0 flex-1">
        <FadeText text={titleOf(b, s?.title)} className="text-[13.5px] leading-tight" />
        <span className={cx('block truncate text-[12px] leading-tight', waits ? 'text-warn' : 'text-fg-3')}>{st.text}</span>
      </span>
    </button>
  );
}

/** The colours of a group: its mark, and the line down its tabs (written out so the stylesheet has them). */
const TONE: Record<GroupColor, { dot: string; line: string; label: string }> = {
  grey: { dot: 'bg-fg-3', line: 'border-fg-3', label: 'Grey' },
  blue: { dot: 'bg-info', line: 'border-info', label: 'Blue' },
  green: { dot: 'bg-ok', line: 'border-ok', label: 'Green' },
  amber: { dot: 'bg-warn', line: 'border-warn', label: 'Amber' },
  orange: { dot: 'bg-claude', line: 'border-claude', label: 'Orange' },
  red: { dot: 'bg-err', line: 'border-err', label: 'Red' },
  purple: { dot: 'bg-codex', line: 'border-codex', label: 'Purple' },
};

type Tab = BrowserView['tabs'][number];

/** What a menu is open on: one of your tabs, or a group's header. */
type MenuFor = { at: ContextMenuAt; tab: string } | { at: ContextMenuAt; group: string };

/** What a tab or a group's header being dragged carries: the tab's id. */
const DRAG = 'application/x-hydor-tab';

/** One of your tabs; `ghost`: it was just closed, and closes up while it goes (it can be neither used nor reached). */
function TabRow({ t, on, watching, onLeave, onMenu, ghost }: { t: Tab; on: boolean; watching: string | null; onLeave: () => void; onMenu: (at: ContextMenuAt) => void; ghost?: boolean }) {
  return (
    <div
      role="tab"
      aria-selected={on}
      aria-hidden={ghost || undefined}
      tabIndex={ghost ? -1 : 0}
      title={t.title || t.url}
      draggable={!ghost}
      onDragStart={(e) => (e.dataTransfer.setData(DRAG, t.id), (e.dataTransfer.effectAllowed = 'move'))}
      onClick={() => (watching && onLeave(), !t.active && void switchTab(t.id))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), watching && onLeave(), void switchTab(t.id));
        else if (isMenuKey(e)) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu({ x: r.left + 24, y: r.bottom, keyed: true });
        }
      }}
      onContextMenu={(e) => (e.preventDefault(), onMenu({ x: e.clientX, y: e.clientY }))}
      // A middle click closes it, as in other browsers.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onAuxClick={(e) => e.button === 1 && (e.preventDefault(), void closeTab(t.id))}
      className={cx('group press flex h-[34px] cursor-default items-center gap-2.5 rounded-lg pr-1 pl-2.5 text-[13px] transition-colors select-none', ghost && 'pointer-events-none', on ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-2/60 hover:text-fg')}
    >
      <Favicon tab={t} size={16} />
      <FadeText text={tabName(t)} className="flex-1" />
      <Speaker tab={t} />
      <button
        aria-label="More about this tab"
        title="More about this tab"
        tabIndex={ghost ? -1 : undefined}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu({ x: r.left, y: r.bottom + 2 });
        }}
        className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-3 group-hover:flex group-focus-within:flex hover:bg-bg-3 hover:text-fg"
      >
        <Ellipsis size={14} />
      </button>
      <button
        aria-label="Close tab"
        title="Close tab"
        tabIndex={ghost ? -1 : undefined}
        onClick={(e) => (e.stopPropagation(), void closeTab(t.id))}
        className={cx('h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-bg-3 hover:text-fg', on ? 'flex' : 'hidden group-hover:flex group-focus-within:flex')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** A group's header: its colour, name and how many tabs it has; a click folds it, a double click renames it, and it has a menu of its own. */
function GroupHeader({ g, count, over, renaming, onRename, onMenu }: { g: BrowserGroup; count: number; over: boolean; renaming: boolean; onRename: (done: boolean) => void; onMenu: (at: ContextMenuAt) => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) input.current?.select();
  }, [renaming]);
  const toggle = () => void editGroup(g.id, { folded: !g.folded });
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!g.folded}
      onClick={() => !renaming && toggle()}
      onDoubleClick={() => onRename(false)}
      onKeyDown={(e) => {
        if (renaming) return;
        if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), toggle());
        else if (e.key === 'F2') (e.preventDefault(), onRename(false));
        else if (isMenuKey(e)) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu({ x: r.left + 24, y: r.bottom, keyed: true });
        }
      }}
      onContextMenu={(e) => (e.preventDefault(), onMenu({ x: e.clientX, y: e.clientY }))}
      className={cx('group mt-0.5 flex h-[30px] cursor-default items-center gap-2 rounded-lg pr-1 pl-2 text-[13px] transition-colors select-none', over ? 'bg-accent-soft' : 'hover:bg-bg-2/60')}
    >
      <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform', !g.folded && 'rotate-90')} />
      <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', TONE[g.color].dot)} aria-hidden />
      {renaming ? (
        <input
          ref={input}
          autoFocus
          defaultValue={g.name}
          maxLength={40}
          aria-label="Group name"
          placeholder="Name the group"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.currentTarget.blur(), onRename(true));
            else if (e.key === 'Escape') onRename(true);
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v !== g.name) void editGroup(g.id, { name: v });
            onRename(true);
          }}
          className="h-6 min-w-0 flex-1 rounded-md border border-line bg-bg px-1.5 text-[13px] text-fg outline-none focus:border-accent"
        />
      ) : (
        <span translate="no" className={cx('min-w-0 flex-1 truncate font-medium', !g.name && 'text-fg-3')}>
          {g.name || 'Unnamed group'}
        </span>
      )}
      {!renaming && <span className="tnum shrink-0 text-[12px] text-fg-3">{count}</span>}
      {!renaming && (
        <button
          aria-label="More about this group"
          title="More about this group"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu({ x: r.left, y: r.bottom + 2 });
          }}
          className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-3 group-hover:flex group-focus-within:flex hover:bg-bg-3 hover:text-fg"
        >
          <Ellipsis size={14} />
        </button>
      )}
    </div>
  );
}

const dot = (c: GroupColor) => <span className={cx('h-2.5 w-2.5 rounded-full', TONE[c].dot)} />;
const groupLabel = (g: BrowserGroup) => g.name || 'Unnamed group';

export function TabColumn({ view, watching, onWatch, onLeave }: { view: BrowserView; watching: string | null; onWatch: (key: string) => void; onLeave: () => void }) {
  // As wide as every other column, and resized the same way.
  const { width } = useNavWidth();
  const browsers = useAgentBrowsers((s) => s.browsers);
  const marks = useBookmarks((s) => s.nodes);
  const grouping = useGrouping((s) => s.busy);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [tabsOpen, setTabsOpen] = useState(true);
  const [menu, setMenu] = useState<MenuFor | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [overLoose, setOverLoose] = useState(false);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const groups = view.groups ?? [];
  // Each group with its tabs, then the tabs in no group: the order they are shown in.
  const ordered = inTabOrder(view.tabs, groups).flatMap((x) => x.tabs);
  // A new tab opens its row and a closed one closes up, the rest following.
  const rows = useRowPhases(ordered);
  const groupOf = (id: string | undefined) => groups.find((g) => g.id === id);

  // The rows in the order shown, as runs: a header and its tabs, or tabs in no group.
  const runs: { group: BrowserGroup | null; rows: typeof rows }[] = [];
  for (const r of rows) {
    const g = groupOf(r.row.group) ?? null;
    const last = runs[runs.length - 1];
    if (last && last.group?.id === g?.id) last.rows.push(r);
    else runs.push({ group: g, rows: [r] });
  }

  const menuItems = (): MenuEntry[] => {
    if (!menu) return [];
    if ('group' in menu) {
      const g = groupOf(menu.group);
      if (!g) return [];
      return [
        { label: 'Rename', icon: <Pencil size={14} />, run: () => setRenaming(g.id) },
        {
          label: 'Colour',
          icon: <Palette size={14} />,
          items: GROUP_COLORS.map((c) => ({ label: TONE[c].label, icon: dot(c), checked: g.color === c, run: () => void editGroup(g.id, { color: c }) })),
        },
        { label: 'New tab in group', icon: <Plus size={14} />, run: () => (watching && onLeave(), void newTabIn(g.id)) },
        '-',
        { label: 'Ungroup', icon: <Ungroup size={14} />, run: () => void removeGroup(g.id) },
        { label: 'Close group', icon: <XCircle size={14} />, danger: true, run: () => void removeGroup(g.id, true) },
      ];
    }
    const t = view.tabs.find((x) => x.id === menu.tab);
    if (!t) return [];
    const at = ordered.findIndex((x) => x.id === t.id);
    const below = ordered.slice(at + 1).map((x) => x.id);
    const others = ordered.filter((x) => x.id !== t.id).map((x) => x.id);
    const marked = marks.filter((n) => n.url === t.url);
    const mine = groupOf(t.group);
    return [
      { label: 'Close tab', icon: <X size={14} />, run: () => void closeTab(t.id) },
      { label: 'Close other tabs', icon: <XCircle size={14} />, disabled: !others.length, run: () => void closeTabs(others) },
      { label: 'Close tabs below', icon: <XCircle size={14} />, disabled: !below.length, run: () => void closeTabs(below) },
      '-',
      { label: 'Duplicate', icon: <CopyPlus size={14} />, run: () => void duplicateTab(t.id) },
      { label: 'Reload', icon: <RotateCw size={14} />, run: () => void reloadTab(t.id) },
      { label: 'Copy address', icon: <Copy size={14} />, disabled: !t.url || t.url === 'about:blank', run: () => void navigator.clipboard?.writeText(t.url).then(() => toast('Copied the address', 'ok'), () => {}) },
      { label: marked.length ? 'Remove the bookmark' : 'Bookmark', icon: <Bookmark size={14} />, disabled: !isWebPage(t.url), run: () => void toggleBookmark(t.url, t.title, marked) },
      '-',
      {
        label: 'Add to group',
        icon: <Folders size={14} />,
        items: [
          ...groups.map((g) => ({ label: groupLabel(g), icon: dot(g.color), checked: t.group === g.id, run: () => void moveToGroup([t.id], g.id) })),
          groups.length ? '-' : null,
          {
            label: 'New group…',
            icon: <Plus size={14} />,
            run: () =>
              void groupTabs([t.id]).then((id) => {
                if (id) setRenaming(id);
              }),
          },
        ],
      },
      mine && { label: 'Remove from group', icon: <FolderMinus size={14} />, run: () => void moveToGroup([t.id], null) },
    ];
  };

  return (
    <nav aria-label="Browser tabs" className="relative flex h-full shrink-0 flex-col border-r border-line bg-sidebar" style={{ width }}>
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
          <Label
            open={tabsOpen}
            onToggle={() => setTabsOpen((o) => !o)}
            actions={
              <button
                aria-label="Group my tabs with AI"
                title="Group my tabs with AI: the tabs’ titles and addresses go to the helper model"
                disabled={grouping}
                onClick={() => void groupWithAi()}
                className={cx('flex h-6 w-6 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg disabled:hover:bg-transparent', !grouping && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
              >
                {grouping ? <Throbber size={13} /> : <Sparkles size={13} />}
              </button>
            }
          >
            Tabs
          </Label>
          {tabsOpen && (
            <div
              role="tablist"
              className={cx('px-1.5', overLoose && 'rounded-lg bg-accent-soft/40')}
              // Dropped between the tabs in no group (not on a group): out of its group.
              onDragOver={(e) => e.dataTransfer.types.includes(DRAG) && (e.preventDefault(), setOverLoose(true))}
              onDragLeave={(e) => e.currentTarget === e.target && setOverLoose(false)}
              onDrop={(e) => {
                setOverLoose(false);
                const id = e.dataTransfer.getData(DRAG);
                if (id && view.tabs.find((x) => x.id === id)?.group) (e.preventDefault(), void moveToGroup([id], null));
              }}
            >
              {runs.map((run, i) => {
                const g = run.group;
                const body = run.rows.map(({ row: t, phase }) => {
                  // A folded group hides its tabs (the one in front stays, so you can see where you are).
                  const hidden = g?.folded && !(t.active && !watching) && phase !== 'close';
                  if (hidden) return null;
                  return (
                    <div role="presentation" key={phase === 'close' ? `gone:${t.id}` : t.id} className={cx('row-fold', phase && `row-${phase}`)}>
                      <TabRow t={t} on={t.active && !watching} watching={watching} onLeave={onLeave} onMenu={(at) => setMenu({ at, tab: t.id })} ghost={phase === 'close'} />
                    </div>
                  );
                });
                if (!g) return <div key={i}>{body}</div>;
                return (
                  <div
                    key={g.id}
                    // A tab dropped on a group (its header or its tabs) joins it.
                    onDragOver={(e) => e.dataTransfer.types.includes(DRAG) && (e.preventDefault(), e.stopPropagation(), setOverGroup(g.id))}
                    onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOverGroup(null)}
                    onDrop={(e) => {
                      setOverGroup(null);
                      const id = e.dataTransfer.getData(DRAG);
                      if (id) (e.preventDefault(), e.stopPropagation(), void moveToGroup([id], g.id));
                    }}
                  >
                    <GroupHeader
                      g={g}
                      count={view.tabs.filter((t) => t.group === g.id).length}
                      over={overGroup === g.id}
                      renaming={renaming === g.id}
                      onRename={(done) => setRenaming(done ? null : g.id)}
                      onMenu={(at) => setMenu({ at, group: g.id })}
                    />
                    {body.some(Boolean) && <div className={cx('mb-1 ml-3.5 border-l-2 pl-1', TONE[g.color].line)}>{body}</div>}
                  </div>
                );
              })}
              <button onClick={() => (watching && onLeave(), void newTab())} className="flex h-[34px] w-full items-center gap-2.5 rounded-lg pl-2.5 text-left text-[13px] text-fg-3 transition-colors hover:bg-bg-2/60 hover:text-fg-2">
                <Plus size={16} />
                New tab
              </button>
            </div>
          )}
        </div>
      </ColumnScroll>
      <ContextMenu at={menu?.at ?? null} items={menuItems()} onClose={() => setMenu(null)} title={menu && 'group' in menu ? 'Group' : 'Tab'} />
      <ColumnResizer inside />
    </nav>
  );
}
