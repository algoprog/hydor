// The slides editor's small controls: a colour from the deck's theme (which follows the theme when it changes) or
// any other, as swatches or a button that opens them; and a number to type, step with the arrow keys or nudge.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cssColor, type Theme } from '@shared/slides';
import { cx, Popover } from '../../../components/ui';

const NAMES: { ref: string; label: string }[] = [
  { ref: 'accent', label: 'Accent' },
  { ref: 'head', label: 'Headings' },
  { ref: 'fg', label: 'Text' },
  { ref: 'muted', label: 'Quiet text' },
  { ref: 'bg', label: 'Background' },
  { ref: 'soft', label: 'Soft fill' },
  { ref: 'accentFg', label: 'On the accent' },
  { ref: 'c2', label: 'Colour 2' },
  { ref: 'c3', label: 'Colour 3' },
  { ref: 'c4', label: 'Colour 4' },
  { ref: 'c5', label: 'Colour 5' },
  { ref: 'c6', label: 'Colour 6' },
];

const toHex = (c: string) => {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((x) => x + x).join('')}`;
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c);
  return m ? `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}` : '#000000';
};

/** The theme's colours to pick from, any other, and (with `none`) none. */
export function Swatches({ value, theme, onChange, none }: { value: string | undefined; theme: Theme; onChange: (v: string | undefined) => void; none?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {none && (
        <button
          type="button"
          title={none}
          aria-label={none}
          onClick={() => onChange(undefined)}
          className={cx('relative h-6 w-6 overflow-hidden rounded-full border border-line-2 bg-white', !value && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
        >
          <span className="absolute top-1/2 left-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-err" />
        </button>
      )}
      {NAMES.map((n) => (
        <button
          key={n.ref}
          type="button"
          title={n.label}
          aria-label={n.label}
          onClick={() => onChange(n.ref)}
          style={{ background: cssColor(n.ref, theme) }}
          className={cx('h-6 w-6 rounded-full border border-line-2', value === n.ref && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
        />
      ))}
      <label
        title="Another colour"
        className={cx(
          'relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-line-2 bg-[conic-gradient(#f44,#fd4,#4d4,#4df,#44f,#f4f,#f44)]',
          value && !NAMES.some((n) => n.ref === value) && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated',
        )}
      >
        <input type="color" value={toHex(cssColor(value, theme, '#000000'))} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

/** A button showing a colour that opens the swatches. */
export function ColorButton({ value, theme, onChange, none, label, icon, className }: { value: string | undefined; theme: Theme; onChange: (v: string | undefined) => void; none?: string; label: string; icon?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const shown = value ? cssColor(value, theme) : 'transparent';
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={label}
        data-keeps-editing
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={cx('flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2', className)}
      >
        {icon}
        <span className="h-4 w-4 shrink-0 rounded-full border border-line-2" style={{ background: shown === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 8px 8px' : shown }} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={236} title={label}>
        <div className="p-2" data-keeps-editing onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
          <Swatches
            value={value}
            theme={theme}
            none={none}
            onChange={(v) => {
              onChange(v);
              if (!v || !v.startsWith('#')) setOpen(false);
            }}
          />
        </div>
      </Popover>
    </>
  );
}

/** A number: typed (Enter or leaving sets it), stepped with the arrow keys (Shift: by ten), or with the buttons. */
export function NumInput({
  value,
  onChange,
  min = -10000,
  max = 10000,
  step = 1,
  unit,
  label,
  buttons,
  className,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label: string;
  buttons?: boolean;
  className?: string;
}) {
  const shown = value === undefined || !Number.isFinite(value) ? '' : String(Math.round(value * 100) / 100);
  const [text, setText] = useState(shown);
  const focus = useRef(false);
  useEffect(() => {
    if (!focus.current) setText(shown);
  }, [shown]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const set = (n: number) => {
    const v = clamp(Math.round(n * 100) / 100);
    setText(String(v));
    onChange(v);
  };
  return (
    <div title={label} className={cx('flex h-8 min-w-0 items-center rounded-lg border border-line bg-bg-1 focus-within:border-accent/60', className ?? 'flex-1')}>
      {buttons && (
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} data-keeps-editing onMouseDown={(e) => e.preventDefault()} onClick={() => set((value ?? 0) - step)} className="grid h-full w-6 shrink-0 place-items-center text-fg-3 hover:text-fg">
          <Minus size={12} />
        </button>
      )}
      <input
        value={text}
        inputMode="decimal"
        aria-label={label}
        spellCheck={false}
        onFocus={(e) => {
          focus.current = true;
          e.target.select();
        }}
        onBlur={(e) => {
          focus.current = false;
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n) && String(clamp(n)) !== shown) set(n);
          else setText(shown);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            set((value ?? 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
          }
        }}
        className={cx('h-full w-full min-w-0 bg-transparent text-[12.5px] tabular-nums outline-none', buttons ? 'px-0.5 text-center' : 'px-2')}
      />
      {unit && <span className="shrink-0 pr-2 text-[11.5px] text-fg-3">{unit}</span>}
      {buttons && (
        <button type="button" aria-label={`More ${label.toLowerCase()}`} data-keeps-editing onMouseDown={(e) => e.preventDefault()} onClick={() => set((value ?? 0) + step)} className="grid h-full w-6 shrink-0 place-items-center text-fg-3 hover:text-fg">
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}

/** A labelled row of the side panel. */
export function Field({ label, children, top }: { label: string; children: ReactNode; top?: boolean }) {
  return (
    <div className={cx('flex min-h-8 gap-2', top ? 'items-start' : 'items-center')}>
      <span className={cx('w-[78px] shrink-0 truncate text-[12px] text-fg-3', top && 'pt-1.5')}>{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** A small button with an icon, held pressed when `on`. */
export function Tool({ label, on, onClick, children, disabled, className }: { label: string; on?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      data-keeps-editing
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        'flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent',
        on && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
        className,
      )}
    >
      {children}
    </button>
  );
}
