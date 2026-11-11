// The editor's own controls, made to the shell's spec so they can join the picture and video editors' later (its menus
// are the shell's: MenuBar, ContextMenu): a dock of panels that fold and a width dragged and
// remembered, a number field whose label drags its value (as in pro apps), a slider with its value to type in and a
// double-click to put it back, and a status line. Dense but legible: 12 to 13 px text, 28 to 32 px controls, the app's
// own colours.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../../components/ui';

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
export function DockPanel({ id, title, icon, aside, children, grow, reveal }: { id: string; title: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode; grow?: boolean; reveal?: number }) {
  const [open, setOpen] = useRemembered(`panel:${id}`, true);
  const box = useRef<HTMLElement>(null);
  // `reveal` counts up each time something asks for the panel to be shown (a menu's Properties…): it opens and scrolls into view.
  useEffect(() => {
    if (!reveal) return;
    setOpen(true);
    box.current?.scrollIntoView({ block: 'nearest' });
  }, [reveal]);
  return (
    <section ref={box} className={cx('flex flex-col border-b border-line', open && grow ? 'min-h-0 flex-1' : 'shrink-0')}>
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
      <span className="flex h-7 min-w-0 shrink-0 items-center rounded-md border border-line bg-bg-1 focus-within:border-accent" style={{ width }}>
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
