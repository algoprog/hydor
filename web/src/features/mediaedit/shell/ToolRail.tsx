// The tools as a slim rail of icons, as Photoshop has them: tools that do alike are a group behind one button (the one
// used last shows), and the rest of the group opens beside it on a right-click, a long press, or its small corner mark;
// each says its name and its key when pointed at. Down the left of the editor on a computer; along the bottom on a
// phone (`horizontal`), where a long press opens the group. `foot` goes at its end (the colours).
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { cx, Popover } from '../../../components/ui';
import { keyLabel } from './menus';
import { usePersisted } from './persist';

export interface RailTool {
  id: string;
  label: string;
  icon: ReactNode;
  /** Its key ("B", "Shift+B"). */
  keys?: string;
}

export interface RailGroup {
  id: string;
  tools: RailTool[];
  /** A line before it. */
  gap?: boolean;
}

const LONG_PRESS = 450;

/** Which tool of each group shows (the last one picked of it), kept by `id` in this browser. */
export function useRailPicks(id: string) {
  return usePersisted<Record<string, string>>(`${id}.rail`, {});
}

export function ToolRail({
  groups,
  active,
  onPick,
  picks,
  setPicks,
  foot,
  horizontal,
}: {
  groups: RailGroup[];
  active: string;
  onPick: (tool: string) => void;
  picks: Record<string, string>;
  setPicks: (p: Record<string, string>) => void;
  foot?: ReactNode;
  horizontal?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // One steady anchor per group, so an open group keeps its place and its listeners across renders.
  const anchors = useRef<Record<string, { current: HTMLButtonElement | null }>>({});
  const anchorOf = (id: string) => (anchors.current[id] ??= { current: null });
  const press = useRef<{ id: string; t: number; fired: boolean } | null>(null);
  const shownOf = (g: RailGroup) => g.tools.find((t) => t.id === active) ?? g.tools.find((t) => t.id === picks[g.id]) ?? g.tools[0];
  const pick = (g: RailGroup, t: RailTool) => {
    setOpen(null);
    if (picks[g.id] !== t.id) setPicks({ ...picks, [g.id]: t.id });
    onPick(t.id);
  };
  return (
    <div role="toolbar" aria-label="Tools" aria-orientation={horizontal ? 'horizontal' : 'vertical'} className={cx('flex shrink-0 items-center', horizontal ? 'h-12 flex-row gap-0.5 overflow-x-auto px-1.5 [&::-webkit-scrollbar]:hidden' : 'w-11 flex-col gap-0.5 overflow-y-auto py-1.5 [&::-webkit-scrollbar]:hidden')}>
      {groups.map((g) => {
        const t = shownOf(g);
        const on = g.tools.some((x) => x.id === active);
        const many = g.tools.length > 1;
        return (
          <Fragment key={g.id}>
            {g.gap && <span aria-hidden className={cx('shrink-0 bg-line', horizontal ? 'mx-0.5 h-6 w-px' : 'my-0.5 h-px w-6')} />}
            <button
              ref={(el) => {
                anchorOf(g.id).current = el;
              }}
              type="button"
              aria-pressed={on}
              aria-haspopup={many ? 'menu' : undefined}
              title={t.keys ? `${t.label} (${keyLabel(t.keys)})` : t.label}
              aria-label={t.label}
              onClick={() => {
                if (press.current?.fired) return;
                pick(g, t);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (many) setOpen(g.id);
              }}
              onPointerDown={() => {
                if (!many) return;
                const p = { id: g.id, t: window.setTimeout(() => ((p.fired = true), setOpen(g.id)), LONG_PRESS), fired: false };
                press.current = p;
              }}
              onPointerUp={() => {
                const p = press.current;
                if (p) window.clearTimeout(p.t);
                // A long press opened the group: its click does not pick too.
                if (p?.fired) window.setTimeout(() => (press.current = null), 0);
                else press.current = null;
              }}
              onPointerLeave={() => {
                const p = press.current;
                if (p && !p.fired) {
                  window.clearTimeout(p.t);
                  press.current = null;
                }
              }}
              className={cx('relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors', on ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
            >
              {t.icon}
              {many && <span aria-hidden className="absolute right-[3px] bottom-[3px] h-0 w-0 border-t-[4px] border-l-[4px] border-t-transparent border-l-transparent" style={{ borderRightWidth: 0, borderBottom: '4px solid currentColor', opacity: 0.55 }} />}
            </button>
            {many && (
              <Popover anchor={anchorOf(g.id)} open={open === g.id} onClose={() => setOpen(null)} width={236} prefer={horizontal ? 'above' : 'below'} title={t.label}>
                <div role="menu" aria-label={t.label}>
                  {g.tools.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={x.id === t.id}
                      onClick={() => pick(g, x)}
                      className={cx('flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]', x.id === active ? 'bg-accent-soft text-fg' : 'text-fg hover:bg-bg-2')}
                    >
                      <span className="flex w-4 shrink-0 justify-center text-fg-3">{x.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{x.label}</span>
                      {x.keys && <span className="shrink-0 text-[11.5px] text-fg-3">{keyLabel(x.keys)}</span>}
                    </button>
                  ))}
                </div>
              </Popover>
            )}
          </Fragment>
        );
      })}
      {foot && <div className={cx('shrink-0', horizontal ? 'ml-auto pl-1' : 'mt-auto pt-2')}>{foot}</div>}
    </div>
  );
}
