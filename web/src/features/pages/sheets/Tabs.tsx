// The sheets' tabs under the grid: pick one; + adds a sheet; a double click renames one; its menu (the arrow on the
// tab picked, or a right click or long press) duplicates, moves, deletes it, or adds a sheet from a CSV file; a
// tab dragged with the mouse moves; a tab may have a colour (a bar under its name) and be hidden (the menu of a tab hides
// it, and lists the hidden ones to show again). What the selection adds up to sits at the right.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Copy, EyeOff, Eye, FileUp, PencilLine, Palette as PaletteIcon, Plus, Trash2 } from 'lucide-react';
import { cx, IconButton, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { Palette } from './Toolbar';

export interface TabsProps {
  names: string[];
  /** Each sheet's tab colour (#rrggbb) and whether it is hidden, by place in `names`. */
  colors?: (string | undefined)[];
  hidden?: boolean[];
  active: number;
  readOnly?: boolean;
  onPick: (i: number) => void;
  onAdd: () => void;
  onImport: () => void;
  onRename: (i: number, name: string) => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onColor: (i: number, color: string | undefined) => void;
  onHide: (i: number) => void;
  onShow: (i: number) => void;
  /** What sits at the right: the selection's sum and count. */
  status?: ReactNode;
  /** Nothing under it: it keeps clear of a phone's home bar. */
  last?: boolean;
}

export function SheetTabs(p: TabsProps) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<{ i: number; el: HTMLElement } | null>(null);
  const [drop, setDrop] = useState<number | null>(null);
  const [colours, setColours] = useState(false);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; x: number; on: boolean; id: number } | null>(null);
  const press = useRef<number | null>(null);
  // A long press has opened a tab's menu: lifting the finger must not click the menu's dimmed page under it.
  const held = useRef(false);

  useEffect(() => {
    // The tab picked stays in view.
    const el = strip.current?.querySelector<HTMLElement>(`[data-tab="${p.active}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [p.active, p.names.length]);

  const startRename = (i: number) => {
    if (p.readOnly) return;
    setDraft(p.names[i]);
    setRenaming(i);
  };
  const endRename = (keep: boolean) => {
    if (renaming !== null && keep && draft.trim() && draft.trim() !== p.names[renaming]) p.onRename(renaming, draft.trim());
    setRenaming(null);
  };
  const openMenu = (i: number, el: HTMLElement) => {
    menuAnchor.current = el;
    setMenu({ i, el });
  };

  const hiddenAt = (i: number) => !!p.hidden?.[i];
  const shown = p.names.map((_, i) => i).filter((i) => !hiddenAt(i));
  const lastShown = shown[shown.length - 1] ?? 0;
  /** Where a tab dragged to x would go: before the sheet of that place (the number of sheets: at the end). */
  const slotAt = (x: number) => {
    const tabs = [...(strip.current?.querySelectorAll<HTMLElement>('[data-tab]') ?? [])];
    for (const t of tabs) {
      const b = t.getBoundingClientRect();
      if (x < b.left + b.width / 2) return Number(t.dataset.tab);
    }
    return p.names.length;
  };

  return (
    <div className={cx('flex h-9 shrink-0 items-center gap-1 border-t border-line bg-panel pr-2 pl-1', p.last && 'box-content pb-[var(--safe-bottom)]')}>
      {!p.readOnly && (
        <IconButton label="Add a sheet" size="sm" onClick={p.onAdd}>
          <Plus size={15} />
        </IconButton>
      )}
      <div ref={strip} role="tablist" className="relative flex h-full min-w-0 flex-1 items-stretch overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {p.names.map((name, i) => {
          const on = i === p.active;
          if (hiddenAt(i)) return null;
          return (
            <div
              key={`${i}:${name}`}
              data-tab={i}
              role="tab"
              aria-selected={on}
              tabIndex={0}
              onClick={() => drag.current?.on || p.onPick(i)}
              onDoubleClick={() => startRename(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') p.onPick(i);
                if (e.key === 'F2') startRename(i);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                p.onPick(i);
                openMenu(i, e.currentTarget);
              }}
              onPointerDown={(e) => {
                if (renaming === i) return;
                if (e.pointerType !== 'mouse') {
                  // A long press opens the tab's menu.
                  const el = e.currentTarget;
                  press.current = window.setTimeout(() => {
                    press.current = null;
                    held.current = true;
                    p.onPick(i);
                    openMenu(i, el);
                  }, 520);
                  return;
                }
                if (e.button === 0 && !p.readOnly) drag.current = { i, x: e.clientX, on: false, id: e.pointerId };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (press.current && e.pointerType !== 'mouse') {
                  clearTimeout(press.current);
                  press.current = null;
                }
                if (!d || d.id !== e.pointerId) return;
                if (!d.on && Math.abs(e.clientX - d.x) > 6) {
                  d.on = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
                if (d.on) setDrop(slotAt(e.clientX));
              }}
              onPointerUp={() => {
                if (press.current) clearTimeout(press.current);
                press.current = null;
                const d = drag.current;
                if (d?.on && drop !== null) {
                  const to = drop > d.i ? drop - 1 : drop;
                  if (to !== d.i) p.onMove(d.i, to);
                }
                setDrop(null);
                // The click that follows a drag is not a pick.
                setTimeout(() => (drag.current = null), 0);
              }}
              onPointerCancel={() => {
                if (press.current) clearTimeout(press.current);
                drag.current = null;
                setDrop(null);
              }}
              onTouchEnd={(e) => {
                if (!held.current) return;
                held.current = false;
                e.preventDefault();
              }}
              className={cx(
                'relative flex shrink-0 cursor-pointer items-center gap-1 border-r border-line px-3 text-[12.5px] select-none',
                on ? 'bg-bg font-medium text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg-2',
              )}
            >
              {on && <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />}
              {p.colors?.[i] && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: p.colors[i] }} />}
              {drop === i && <span className="absolute top-1 bottom-1 -left-px w-[2px] rounded bg-accent" />}
              {drop === p.names.length && i === lastShown && <span className="absolute top-1 -right-px bottom-1 w-[2px] rounded bg-accent" />}
              {renaming === i ? (
                <input
                  autoFocus
                  value={draft}
                  maxLength={31}
                  translate="no"
                  aria-label="The sheet’s name"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => endRename(true)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') endRename(true);
                    if (e.key === 'Escape') endRename(false);
                  }}
                  onFocus={(e) => e.target.select()}
                  style={{ width: `${Math.max(6, draft.length + 2)}ch` }}
                  className="h-6 rounded-md border border-accent/60 bg-bg-1 px-1.5 text-[12.5px] outline-none"
                />
              ) : (
                <span translate="no" className="max-w-[180px] truncate">
                  {name}
                </span>
              )}
              {on && !p.readOnly && renaming !== i && (
                <button
                  type="button"
                  aria-label="The sheet’s menu"
                  title="The sheet’s menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu(i, e.currentTarget.parentElement as HTMLElement);
                  }}
                  className="-mr-1.5 grid h-6 w-5 place-items-center rounded text-fg-3 hover:bg-bg-2 hover:text-fg"
                >
                  <ChevronDown size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {p.status && <div className="ml-1 flex min-w-0 shrink-0 items-center gap-3 text-[12px] text-fg-3">{p.status}</div>}
      <Popover anchor={menuAnchor} open={!!menu && !p.readOnly} onClose={() => (setMenu(null), setColours(false))} width={240} prefer="above" title={menu ? p.names[menu.i] : ''}>
        {menu && (
          <>
            <MenuItem icon={<PencilLine size={14} />} onClick={() => (setMenu(null), startRename(menu.i))}>
              Rename
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} onClick={() => (setMenu(null), p.onDuplicate(menu.i))}>
              Duplicate
            </MenuItem>
            <MenuItem icon={<ArrowLeft size={14} />} disabled={menu.i === 0} onClick={() => (setMenu(null), p.onMove(menu.i, menu.i - 1))}>
              Move left
            </MenuItem>
            <MenuItem icon={<ArrowRight size={14} />} disabled={menu.i === p.names.length - 1} onClick={() => (setMenu(null), p.onMove(menu.i, menu.i + 1))}>
              Move right
            </MenuItem>
            <MenuItem icon={<PaletteIcon size={14} />} checked={colours} onClick={() => setColours((c) => !c)}>
              Tab colour
            </MenuItem>
            {colours && <Palette value={p.colors?.[menu.i]} none="No colour" onPick={(c) => (setMenu(null), setColours(false), p.onColor(menu.i, c))} />}
            <MenuItem icon={<EyeOff size={14} />} disabled={shown.length < 2} onClick={() => (setMenu(null), p.onHide(menu.i))}>
              Hide this sheet
            </MenuItem>
            {p.names.some((_, i) => hiddenAt(i)) && (
              <>
                <MenuSep />
                {p.names.map((n, i) =>
                  hiddenAt(i) ? (
                    <MenuItem key={i} icon={<Eye size={14} />} onClick={() => (setMenu(null), p.onShow(i))}>
                      <span translate="no">{`Show “${n}”`}</span>
                    </MenuItem>
                  ) : null,
                )}
              </>
            )}
            <MenuSep />
            <MenuItem icon={<FileUp size={14} />} onClick={() => (setMenu(null), p.onImport())}>
              Add a sheet from a CSV file
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Trash2 size={14} />} danger disabled={p.names.length < 2} onClick={() => (setMenu(null), p.onDelete(menu.i))}>
              Delete this sheet
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}
