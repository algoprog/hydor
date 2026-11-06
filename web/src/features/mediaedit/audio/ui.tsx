// The editor's own controls, made to the shell's spec so they can join the picture and video editors' later: a menu
// bar (menus with their shortcuts, a submenu a level deep), a dock of panels that fold and a width dragged and
// remembered, a number field whose label drags its value (as in pro apps), a slider with its value to type in and a
// double-click to put it back, and a status line. Dense but legible: 12 to 13 px text, 28 to 32 px controls, the app's
// own colours.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cx, Popover } from '../../../components/ui';

// ---- the menu bar --------------------------------------------------------------------------------------------------

export type MenuEntry =
  | 'sep'
  | { label: string; title?: string }
  | {
      label: ReactNode;
      icon?: ReactNode;
      keys?: string;
      onClick?: () => void;
      disabled?: boolean;
      checked?: boolean;
      sub?: MenuEntry[];
    };

export interface MenuDef {
  label: string;
  items: MenuEntry[];
}

/** Shortcuts as this computer writes them: ⌘ on a Mac. */
export const keyText = (k: string) => (/Mac|iPhone|iPad/.test(navigator.platform) ? k.replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : k);

function Entries({ items, close }: { items: MenuEntry[]; close: () => void }) {
  const [sub, setSub] = useState<number | null>(null);
  const subRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="min-w-[15rem] py-0.5">
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="mx-1.5 my-1 h-px bg-line" />;
        if ('title' in it || !('onClick' in it || 'sub' in it))
          return (
            <div key={i} className="px-2.5 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
              {it.label}
            </div>
          );
        const e = it as Exclude<MenuEntry, 'sep' | { label: string; title?: string }>;
        return (
          <div key={i}>
            <button
              ref={(el) => void (sub === i && (subRef.current = el))}
              type="button"
              disabled={e.disabled}
              onClick={() => {
                if (e.sub) return setSub(sub === i ? null : i);
                close();
                e.onClick?.();
              }}
              className="flex h-7.5 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-fg hover:bg-bg-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="flex w-4 shrink-0 items-center justify-center text-fg-3">{e.checked ? <Check size={13} strokeWidth={2.5} className="text-fg" /> : e.icon}</span>
              <span className="min-w-0 flex-1 truncate">{e.label}</span>
              {e.keys && <span className="tnum shrink-0 pl-3 text-[11px] text-fg-3">{keyText(e.keys)}</span>}
              {e.sub && <ChevronRight size={13} className={cx('shrink-0 text-fg-3', sub === i && 'rotate-90')} />}
            </button>
            {e.sub && sub === i && (
              <div className="ml-4 border-l border-line pl-1">
                <Entries items={e.sub} close={close} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Menus across the top: a title opens its menu; with one open, pointing at another opens that one. */
export function MenuBar({ menus, className }: { menus: MenuDef[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const anchor = useRef<HTMLButtonElement | null>(null);
  anchor.current = open !== null ? refs.current[open] : null;
  return (
    <nav aria-label="Menus" className={cx('flex items-center', className)}>
      {menus.map((m, i) => (
        <button
          key={m.label}
          ref={(el) => void (refs.current[i] = el)}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open === i}
          onClick={() => setOpen(open === i ? null : i)}
          onPointerEnter={() => open !== null && open !== i && setOpen(i)}
          className={cx('h-7 rounded-md px-2 text-[12.5px] font-medium', open === i ? 'bg-bg-2 text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
        >
          {m.label}
        </button>
      ))}
      <Popover anchor={anchor} open={open !== null} onClose={() => setOpen(null)} width={290} title={open !== null ? menus[open]?.label : undefined}>
        {open !== null && <Entries items={menus[open].items} close={() => setOpen(null)} />}
      </Popover>
    </nav>
  );
}

/** All the menus under one button (a phone). */
export function MenuButton({ menus, children, label }: { menus: MenuDef[]; children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" aria-label={label} title={label} onClick={() => setOpen((x) => !x)} className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2', open && 'bg-bg-2 text-fg')}>
        {children}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300} title={label}>
        <Entries items={menus.flatMap((m, i): MenuEntry[] => [...(i ? (['sep'] as MenuEntry[]) : []), { label: m.label, title: m.label }, ...m.items])} close={() => setOpen(false)} />
      </Popover>
    </>
  );
}

// ---- remembered sizes and folds --------------------------------------------------------------------------------------

/** A value kept in this browser between visits (a panel's width, whether it is folded). */
export function useRemembered<T>(key: string, first: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`hydor:sound:${key}`);
      return raw === null ? first : (JSON.parse(raw) as T);
    } catch {
      return first;
    }
  });
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(`hydor:sound:${key}`, JSON.stringify(x));
    } catch {}
  };
  return [v, set];
}

/** A bar to drag that sets a width (the dock's, by its left edge): `onSize` hears the width as it moves. */
export function Splitter({ width, min, max, onSize, side = 'left' }: { width: number; min: number; max: number; onSize: (w: number) => void; side?: 'left' | 'right' }) {
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = width;
    const move = (ev: PointerEvent) => onSize(Math.round(Math.min(max, Math.max(min, w0 + (side === 'left' ? x0 - ev.clientX : ev.clientX - x0)))));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return <div role="separator" aria-orientation="vertical" aria-label="Drag to size the panels" onPointerDown={down} onDoubleClick={() => onSize(Math.round((min + max) / 2))} className="w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/40" />;
}

/** A panel of the dock: its title folds it (remembered), with what it may do at its right. */
export function DockPanel({ id, title, icon, aside, children, grow }: { id: string; title: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode; grow?: boolean }) {
  const [open, setOpen] = useRemembered(`panel:${id}`, true);
  return (
    <section className={cx('flex min-h-0 flex-col border-b border-line', open && grow && 'flex-1')}>
      <div className="flex h-8 shrink-0 items-center gap-1 pr-1.5 pl-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12px] font-semibold tracking-wide text-fg-2 hover:text-fg">
          <ChevronDown size={13} className={cx('shrink-0 text-fg-3 transition-transform', !open && '-rotate-90')} />
          {icon && <span className="shrink-0 text-fg-3">{icon}</span>}
          <span className="truncate">{title}</span>
        </button>
        {open && aside}
      </div>
      {open && <div className={cx('min-h-0 px-2.5 pb-3', grow && 'flex-1 overflow-y-auto')}>{children}</div>}
    </section>
  );
}

// ---- numbers -------------------------------------------------------------------------------------------------------

const fmt = (v: number, step: number) => {
  const places = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return v.toFixed(places);
};

/**
 * A number to type, whose label drags it (left and right, Shift for finer steps), Enter or leaving it takes what was
 * typed. `begin` and `end` frame a drag (one step of undo); `show` and `read` write and read it (times, percentages).
 */
export function ScrubField({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  begin,
  end,
  show,
  read,
  className,
  width = 64,
  title,
}: {
  label?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  begin?: () => void;
  end?: () => void;
  show?: (v: number) => string;
  read?: (s: string) => number | null;
  className?: string;
  width?: number;
  title?: string;
}) {
  const text = show ? show(value) : fmt(value, step);
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const take = () => {
    if (draft === null) return;
    const v = read ? read(draft) : Number(draft.replace(',', '.').replace(/[^\d.+-]/g, ''));
    setDraft(null);
    if (v !== null && Number.isFinite(v)) onChange(clamp(v));
  };
  const drag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const v0 = value;
    let moved = false;
    begin?.();
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      onChange(clamp(v0 + dx * step * (ev.shiftKey ? 0.1 : 1)));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      end?.();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <label className={cx('flex min-w-0 items-center gap-1.5 text-[12px]', className)} title={title}>
      {label !== undefined && (
        <span onPointerDown={drag} className="shrink-0 cursor-ew-resize text-fg-3 select-none hover:text-fg-2">
          {label}
        </span>
      )}
      <span className="flex h-7 min-w-0 items-center rounded-md border border-line bg-bg-1 focus-within:border-accent" style={{ width }}>
        <input
          value={draft ?? text}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={take}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(null);
              (e.currentTarget as HTMLInputElement).blur();
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
            }
          }}
          aria-label={typeof label === 'string' ? label : title}
          className="tnum h-full min-w-0 flex-1 bg-transparent px-1.5 text-right text-[12px] text-fg outline-none"
        />
        {unit && <span className="shrink-0 pr-1.5 text-[11px] text-fg-3">{unit}</span>}
      </span>
    </label>
  );
}

/** A slider with its name, its value to type in, and a double-click (on it or its name) to put it back to `zero`. */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  zero,
  unit,
  onChange,
  begin,
  end,
  show,
  read,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  zero: number;
  unit?: string;
  onChange: (v: number) => void;
  begin?: () => void;
  end?: () => void;
  show?: (v: number) => string;
  read?: (s: string) => number | null;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span onDoubleClick={() => onChange(zero)} className={cx('min-w-0 flex-1 truncate text-[12px]', value === zero ? 'text-fg-3' : 'text-fg-2')} title={`${label}: double-click to put it back`}>
          {label}
        </span>
        <ScrubField value={value} onChange={onChange} min={min} max={max} step={step} unit={unit} begin={begin} end={end} show={show} read={read} width={unit && unit.length > 2 ? 86 : 72} title={label} />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={begin}
        onPointerUp={end}
        onKeyDown={begin}
        onKeyUp={end}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(zero)}
        aria-label={label}
        className="block h-4 w-full accent-[var(--accent)]"
      />
    </div>
  );
}

/** A line of facts along the bottom. */
export function StatusBar({ children }: { children: ReactNode }) {
  return <footer className="flex h-6.5 shrink-0 items-center gap-3 overflow-hidden border-t border-line bg-bg-1 px-3 text-[11.5px] whitespace-nowrap text-fg-3">{children}</footer>;
}

/** The width of an element, as it changes. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number, number] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size.w, size.h];
}

/** Redraws when the theme changes (dark and light), for what is drawn on a canvas in the theme's colours. */
export function useThemeTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setN((x) => x + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => mo.disconnect();
  }, []);
  return n;
}
