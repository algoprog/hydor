// The editors' small controls, dense as a pro app's (12–13px words, 28px tall), in the app's own colours:
//   ScrubNumber  a number field whose label scrubs it when dragged (Shift: ten times faster, Alt: finer), typed or
//                stepped with ↑ and ↓; `onChange(value, done)`, done when the drag or the typing ends (one undo step).
//   SliderRow    a slider with its name and a value field; a double click on either puts it back to `zero`.
//   Section      a part of a panel with a title that folds it away, remembered (by `id`) in this browser.
//   Seg          a compact row of choices, one picked.
//   MiniSelect   a native drop-down list, compact (a phone shows its own list).
//   Check        a small tick box with its words.
//   FieldRow     a label and its control side by side.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx } from '../../../components/ui';
import { usePersisted } from './persist';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const roundTo = (v: number, step: number) => {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return Number((Math.round(v / step) * step).toFixed(d));
};

export const fieldCls = 'h-7 min-w-0 rounded-md border border-line-2 bg-bg-1 px-1.5 text-[12px] text-fg tnum outline-none focus:border-accent/70';

/** A number typed in, or dragged by its label. */
export function ScrubNumber({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  width = 52,
  title,
  disabled,
  className,
}: {
  label?: ReactNode;
  value: number;
  onChange: (v: number, done: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  width?: number;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const shown = text ?? String(roundTo(value, step));
  const set = (v: number, done: boolean) => onChange(clamp(roundTo(v, step), min, max), done);
  const commitText = () => {
    if (text === null) return;
    const n = Number(text.replace(',', '.').replace(/[^0-9.+-]/g, ''));
    setText(null);
    if (Number.isFinite(n) && text.trim()) set(n, true);
  };
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1', disabled && 'pointer-events-none opacity-45', className)} title={title}>
      {label !== undefined && (
        <span
          className="shrink-0 cursor-ew-resize text-[12px] text-fg-3 select-none hover:text-fg-2"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, v: value, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            if (!d.moved && Math.abs(dx) < 2) return;
            d.moved = true;
            const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
            set(d.v + Math.round(dx / 2) * step * k, false);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (d?.moved) set(d.v + Math.round((e.clientX - d.x) / 2) * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1), true);
          }}
          onPointerCancel={() => (drag.current = null)}
        >
          {label}
        </span>
      )}
      <span className="relative inline-flex items-center">
        <input
          value={shown}
          inputMode="decimal"
          aria-label={typeof label === 'string' ? label : title}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              commitText();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setText(null);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              setText(null);
              set(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), true);
            }
          }}
          className={cx(fieldCls, unit && 'pr-5')}
          style={{ width }}
        />
        {unit && <span className="pointer-events-none absolute right-1.5 text-[11px] text-fg-3">{unit}</span>}
      </span>
    </span>
  );
}

/** A slider with its name above it and its value in a field beside the name; a double click puts it back to `zero`. */
export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  zero = 0,
  unit,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  zero?: number;
  unit?: string;
  onChange: (v: number, done: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  // A slider's own events: changing while held, done when let go (or a key used).
  const held = useRef(false);
  return (
    <div className={cx('space-y-0.5', disabled && 'pointer-events-none opacity-45')} title={hint}>
      <div className="flex items-center gap-2">
        <span className={cx('min-w-0 flex-1 truncate text-[12px]', value === zero ? 'text-fg-3' : 'text-fg-2')} onDoubleClick={() => onChange(zero, true)}>
          {label}
        </span>
        <ScrubNumber value={value} onChange={onChange} min={min} max={max} step={step} unit={unit} width={unit ? 56 : 48} />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={() => (held.current = true)}
        onPointerUp={(e) => {
          held.current = false;
          onChange(Number((e.target as HTMLInputElement).value), true);
        }}
        onChange={(e) => onChange(Number(e.target.value), !held.current)}
        onDoubleClick={() => onChange(zero, true)}
        className="block h-4 w-full accent-[var(--accent)]"
      />
    </div>
  );
}

/** A part of a panel under a title that folds it away; folded or not is remembered by `id`. */
export function Section({ id, title, children, actions, defaultOpen = true, className, openSignal }: { id: string; title: ReactNode; children: ReactNode; actions?: ReactNode; defaultOpen?: boolean; className?: string; openSignal?: number }) {
  const [open, setOpen] = usePersisted(`section.${id}`, defaultOpen);
  const box = useRef<HTMLElement>(null);
  // Asked to show (a menu item that opens it): unfolded and brought into view.
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    requestAnimationFrame(() => box.current?.scrollIntoView({ block: 'start' }));
  }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section ref={box} className={cx('border-b border-line last:border-b-0', className)}>
      <div className="flex h-8 items-center gap-1 pr-1.5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-8 min-w-0 flex-1 items-center gap-1 pl-2 text-left text-[12px] font-semibold text-fg-2 hover:text-fg">
          {open ? <ChevronDown size={13} className="shrink-0 text-fg-3" /> : <ChevronRight size={13} className="shrink-0 text-fg-3" />}
          <span className="truncate">{title}</span>
        </button>
        {actions}
      </div>
      {open && <div className="space-y-2.5 px-3 pt-0.5 pb-3">{children}</div>}
    </section>
  );
}

/** A compact row of choices, one picked. */
export function Seg<T extends string | number>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex shrink-0 rounded-md bg-bg-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('flex h-6 min-w-6 items-center justify-center gap-1 rounded-[5px] px-1.5 text-[12px] whitespace-nowrap', value === o.value ? 'bg-panel text-fg shadow-[0_1px_2px_rgba(0,0,0,0.15)] ring-1 ring-line' : 'text-fg-3 hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A compact drop-down list (the system's own list opens). */
export function MiniSelect<T extends string>({ value, options, onChange, label, className, width }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string; width?: number }) {
  return (
    <span className={cx('relative inline-flex shrink-0 items-center', className)}>
      <select value={value} aria-label={label} title={label} onChange={(e) => onChange(e.target.value as T)} className={cx(fieldCls, 'appearance-none pr-6')} style={{ width }}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-1.5 text-fg-3" />
    </span>
  );
}

/** A small tick box and its words. */
export function Check({ on, onChange, children, title }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-fg-2 select-none" title={title}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
      {children}
    </label>
  );
}

/** A label and its control, side by side. */
export function FieldRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-h-7 items-center gap-2', className)}>
      <span className="w-[5.5rem] shrink-0 truncate text-[12px] text-fg-3">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Calls `f` once `ms` after the last change of `deps` (a value worked out from what changes fast). */
export function useSettled(f: () => void, deps: unknown[], ms: number) {
  useEffect(() => {
    const t = window.setTimeout(f, ms);
    return () => window.clearTimeout(t);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
