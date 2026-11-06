// The pieces of a professional editor's window, generic (the video editor uses them; the picture editor has its own
// to the same plan, to be made one): a menu bar with each item's shortcut, panels whose sizes are dragged and
// remembered, number fields that scrub when their label is dragged, sliders with a value field (a double click puts
// them back), sections that fold, a context menu at the pointer, workspace tabs and a status line. Dense but legible:
// 12–13px words, 28–32px controls, the app's own colours, no fades.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cx } from '../../../components/ui';

// ---- remembered sizes ---------------------------------------------------------------------------------------------

const SIZES_KEY = 'hydor.videoEditor.sizes';

/** A size (or any small value) kept in this browser between visits. */
export function useRemembered<T>(key: string, first: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const all = JSON.parse(localStorage.getItem(SIZES_KEY) ?? '{}');
      return key in all ? (all[key] as T) : first;
    } catch {
      return first;
    }
  });
  const set = useCallback(
    (x: T) => {
      setV(x);
      try {
        const all = JSON.parse(localStorage.getItem(SIZES_KEY) ?? '{}');
        all[key] = x;
        localStorage.setItem(SIZES_KEY, JSON.stringify(all));
      } catch {}
    },
    [key],
  );
  return [v, set];
}

/** A bar between two panels: dragging it changes the size of the one it belongs to (`side`), kept between `min` and `max`. */
export function Splitter({ dir, size, onSize, min, max, side = 'before' }: { dir: 'x' | 'y'; size: number; onSize: (n: number) => void; min: number; max: number; side?: 'before' | 'after' }) {
  const drag = useRef<{ at: number; size: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation={dir === 'x' ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { at: dir === 'x' ? e.clientX : e.clientY, size };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const delta = (dir === 'x' ? e.clientX : e.clientY) - d.at;
        onSize(Math.round(Math.min(max, Math.max(min, d.size + (side === 'before' ? delta : -delta)))));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onSize(Math.round((min + max) / 2))}
      className={cx('group relative z-10 shrink-0 bg-line transition-colors hover:bg-accent/60', dir === 'x' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize')}
    >
      <span className={cx('absolute', dir === 'x' ? 'inset-y-0 -left-1 -right-1' : 'inset-x-0 -top-1 -bottom-1')} />
    </div>
  );
}

// ---- the menu bar ----------------------------------------------------------------------------------------------------

export interface MenuEntry {
  label: string;
  /** The keys that do it too, as shown ("Ctrl+S", "Shift+Del"). */
  keys?: string;
  onClick?: () => void;
  disabled?: boolean;
  checked?: boolean;
  /** A line before it. */
  sep?: boolean;
}

export interface MenuDef {
  label: string;
  items: MenuEntry[];
}

/** File, Edit, Clip… across the top: click one to open it, then move across the others; Escape or a click outside closes. */
export function MenuBar({ menus, className }: { menus: MenuDef[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => !bar.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-menu-pop]') && setOpen(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(null));
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open]);
  return (
    <div ref={bar} role="menubar" className={cx('flex items-center', className)}>
      {menus.map((m, i) => (
        <MenuButton key={m.label} m={m} open={open === i} onOpen={() => setOpen(open === i ? null : i)} onHover={() => open !== null && setOpen(i)} onClose={() => setOpen(null)} />
      ))}
    </div>
  );
}

function MenuButton({ m, open, onOpen, onHover, onClose }: { m: MenuDef; open: boolean; onOpen: () => void; onHover: () => void; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom + 2 });
  }, [open]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onOpen}
        onPointerEnter={onHover}
        className={cx('h-7 rounded-md px-2 text-[12.5px] text-fg-2 hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2 text-fg')}
      >
        {m.label}
      </button>
      {open && pos && (
        <MenuList
          items={m.items}
          x={pos.x}
          y={pos.y}
          onPick={(it) => {
            onClose();
            it.onClick?.();
          }}
        />
      )}
    </>
  );
}

/** A list of menu items floating at a point (kept on the screen). */
export function MenuList({ items, x, y, onPick, width = 248 }: { items: MenuEntry[]; x: number; y: number; onPick: (it: MenuEntry) => void; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    setAt({ x: Math.max(4, Math.min(x, window.innerWidth - width - 4)), y: y + h > window.innerHeight - 4 ? Math.max(4, y - h) : y });
  }, [x, y, width]);
  return createPortal(
    <div ref={ref} data-menu-pop role="menu" className="fixed z-[70] max-h-[80vh] overflow-y-auto rounded-lg border border-line bg-elevated p-1 shadow-lg" style={{ left: at.x, top: at.y, width }}>
      {items.map((it, i) => (
        <div key={i}>
          {it.sep && i > 0 && <div className="my-1 h-px bg-line" />}
          <button
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => onPick(it)}
            className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-fg hover:bg-bg-2 disabled:pointer-events-none disabled:text-fg-3/60"
          >
            <span className="flex w-3.5 shrink-0 justify-center">{it.checked && <Check size={13} strokeWidth={2.4} />}</span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.keys && <span className="shrink-0 font-mono text-[11px] text-fg-3">{it.keys}</span>}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** A menu that opens where the pointer was (a right-click), closed by Escape, a pick, or a click elsewhere. */
export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number } | null; items: MenuEntry[]; onClose: () => void }) {
  useEffect(() => {
    if (!at) return;
    const away = (e: PointerEvent) => !(e.target as HTMLElement).closest?.('[data-menu-pop]') && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [at, onClose]);
  if (!at) return null;
  return (
    <MenuList
      items={items}
      x={at.x}
      y={at.y}
      onPick={(it) => {
        onClose();
        it.onClick?.();
      }}
    />
  );
}

// ---- fields -----------------------------------------------------------------------------------------------------------

/** One step of undo for a whole drag: begun when it starts, ended when it ends. */
export interface Steps {
  begin(): void;
  end(): void;
}
const NoSteps: Steps = { begin() {}, end() {} };
export const StepsContext = createContext<Steps>(NoSteps);

/**
 * A number with its label: type it, or drag the label left and right to scrub it (Shift slower, Alt faster); arrows
 * step it. `show` and `read` turn it into words and back ("50%", "1:05.2").
 */
export function ScrubField({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  show,
  read,
  zero,
  className,
  title,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  show?: (v: number) => string;
  read?: (s: string) => number | null;
  zero?: number;
  className?: string;
  title?: string;
}) {
  const steps = useContext(StepsContext);
  const words = show ?? ((v: number) => String(Math.round(v / step) * step).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
  const [text, setText] = useState(words(value));
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!typing) setText(words(value));
  }, [value, typing]); // eslint-disable-line react-hooks/exhaustive-deps
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const take = () => {
    setTyping(false);
    const v = read ? read(text) : Number(text.replace(',', '.').replace(/[^\d.+-]/g, ''));
    if (v === null || !Number.isFinite(v)) return setText(words(value));
    onChange(clamp(v));
  };
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  return (
    <label className={cx('flex h-7 min-w-0 items-center gap-1.5 text-[12px]', className)} title={title}>
      <span
        className="min-w-0 shrink-0 cursor-ew-resize truncate text-fg-3 select-none hover:text-fg-2"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const px = e.clientX - d.x;
          if (!d.moved) {
            if (Math.abs(px) < 3) return;
            d.moved = true;
            steps.begin();
          }
          const k = e.shiftKey ? 0.1 : e.altKey ? 10 : 1;
          onChange(clamp(Math.round((d.v + px * step * k) / step) * step));
        }}
        onPointerUp={() => {
          if (drag.current?.moved) steps.end();
          drag.current = null;
        }}
        onDoubleClick={() => zero !== undefined && onChange(zero)}
      >
        {label}
      </span>
      <input
        value={text}
        onFocus={() => setTyping(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={take}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
          }
        }}
        className="tnum h-7 w-full min-w-0 flex-1 rounded-md border border-line bg-bg-1 px-1.5 text-right text-[12px] text-fg outline-none focus:border-accent"
      />
    </label>
  );
}

/** A slider with its name and a value field; a double click puts it back to `zero`. A drag is one step of undo. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  zero = 0,
  show,
  read,
  disabled,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  zero?: number;
  show?: (v: number) => string;
  read?: (s: string) => number | null;
  disabled?: boolean;
}) {
  const steps = useContext(StepsContext);
  return (
    <div className={cx('grid grid-cols-[minmax(0,1fr)_64px] items-center gap-x-2', disabled && 'pointer-events-none opacity-50')}>
      <div className="min-w-0">
        <div className="truncate text-[12px] text-fg-2" onDoubleClick={() => onChange(zero)}>
          {label}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={typeof label === 'string' ? label : undefined}
          onPointerDown={steps.begin}
          onPointerUp={steps.end}
          onKeyDown={steps.begin}
          onKeyUp={steps.end}
          onBlur={steps.end}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(zero)}
          className="block h-4 w-full accent-[var(--accent)]"
        />
      </div>
      <ScrubField label="" value={value} onChange={onChange} min={min} max={max} step={step} show={show} read={read} zero={zero} className={cx(value === zero && '[&_input]:text-fg-3')} />
    </div>
  );
}

/** A section of a panel that folds, its name and an optional action at the right; open or shut is remembered. */
export function Fold({ id, title, children, aside, first = true }: { id: string; title: ReactNode; children: ReactNode; aside?: ReactNode; first?: boolean }) {
  const [open, setOpen] = useRemembered(`fold.${id}`, first);
  return (
    <section className="border-b border-line">
      <div className="flex h-8 items-center gap-1 pr-2 pl-1.5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left text-[12px] font-semibold text-fg-2 hover:text-fg">
          {open ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
          <span className="truncate">{title}</span>
        </button>
        {aside}
      </div>
      {open && <div className="space-y-2.5 px-3 pb-3">{children}</div>}
    </section>
  );
}

/** A row of choices, one picked: small, dense. */
export function Choices<T extends string | number>({ value, options, onChange, className }: { value: T | undefined; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="radiogroup" className={cx('flex min-w-0 rounded-md border border-line bg-bg-1 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx('h-6 min-w-0 flex-1 truncate rounded px-1.5 text-[11.5px] font-medium', value === o.value ? 'bg-bg-3 text-fg shadow-sm' : 'text-fg-3 hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A small switch with its words, in a panel's row. */
export function Toggle({ label, on, onChange, title }: { label: ReactNode; on: boolean; onChange: (on: boolean) => void; title?: string }) {
  return (
    <label className="flex h-7 cursor-pointer items-center gap-2 text-[12px] text-fg-2" title={title}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cx('relative h-4 w-7 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-bg-3 ring-1 ring-line-2 ring-inset')}
      >
        <span className={cx('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-[left]', on ? 'left-3.5' : 'left-0.5')} />
      </button>
    </label>
  );
}

/** The workspaces (Edit, Colour, Audio, Export), as Resolve has them, with their keys. */
export function WorkspaceTabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { id: T; label: string; icon: ReactNode; keys?: string }[]; onChange: (t: T) => void }) {
  return (
    <div role="tablist" aria-label="Workspaces" className="flex items-center gap-0.5 rounded-lg bg-bg-1 p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          title={t.keys ? `${t.label} (${t.keys})` : t.label}
          onClick={() => onChange(t.id)}
          className={cx('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium', value === t.id ? 'bg-bg-3 text-fg shadow-sm' : 'text-fg-3 hover:text-fg')}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** The line along the bottom: facts at the left, what is going on at the right. */
export function StatusBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-bg-1 px-3 text-[11.5px] text-fg-3">
      <div className="tnum flex min-w-0 flex-1 items-center gap-3 truncate">{left}</div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** A panel's own title bar: its name, and its tools at the right. */
export function PanelHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2.5">
      <div className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg-2">{title}</div>
      {children}
    </div>
  );
}

/** A tool button of a toolbar: an icon, its name for the pointer, picked or not. */
export function Tool({ label, keys, on, onClick, children, disabled }: { label: string; keys?: string; on?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={keys ? `${label} (${keys})` : label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40', on ? 'bg-accent-soft text-accent' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
    >
      {children}
    </button>
  );
}
