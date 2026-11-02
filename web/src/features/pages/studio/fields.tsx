// The visual editor's small fields: a row with its name (in the accent colour when something is set there,
// with a way to clear it), groups that fold and remember it, colours, numbers with their units (drag a
// number's letter sideways to change it, or use the arrow keys), choices, and text that settles as you type.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { cx } from '../../../components/ui';

/** "rgb(29, 27, 23)" as "#1d1b17"; transparent as null. */
export function hexOf(c: string | undefined): string | null {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(c ?? '');
  if (!m) return /^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c! : null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (a === 0) return null;
  return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
}

const fmt = (x: number) => String(Math.round(x * 100) / 100);

/** "16px" as [16, "px"]; "auto" and other words as [null, "auto"]. */
export function splitNum(v: string | undefined): [number | null, string] {
  const s = (v ?? '').trim();
  const m = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(s);
  return m ? [parseFloat(m[1]), m[2].toLowerCase()] : [null, s];
}

export function Row({ label, set, onReset, hint, children, top }: { label: string; set?: boolean; onReset?: () => void; hint?: string; children: ReactNode; top?: boolean }) {
  return (
    <div className={cx('flex min-h-8 gap-2', top ? 'items-start' : 'items-center')} title={hint}>
      <span className={cx('flex w-[84px] shrink-0 items-center gap-0.5 text-[12px]', top && 'pt-1.5')}>
        <span className={cx('truncate', set ? 'font-medium text-accent' : 'text-fg-3')}>{label}</span>
        {set && onReset && (
          <button
            type="button"
            title="Clear it here"
            aria-label={`Clear ${label}`}
            onClick={onReset}
            className="grid h-4 w-4 shrink-0 place-items-center rounded text-fg-3 hover:bg-bg-2 hover:text-fg"
          >
            <X size={11} />
          </button>
        )}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

const OPEN_KEY = 'wa.studio.groups';
const opened = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

/** A group of fields that folds; open or folded, it stays so the next time. */
export function Group({ id, title, summary, start = false, children }: { id: string; title: string; summary?: ReactNode; start?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => opened()[id] ?? start);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(OPEN_KEY, JSON.stringify({ ...opened(), [id]: next }));
  };
  return (
    <section className="border-t border-line first:border-t-0">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex h-9 w-full min-w-0 items-center gap-1 text-left">
        {open ? <ChevronDown size={13} className="shrink-0 text-fg-3" /> : <ChevronRight size={13} className="shrink-0 text-fg-3" />}
        <span className="shrink-0 text-[12.5px] font-semibold text-fg-2">{title}</span>
        {!open && summary ? <span className="ml-auto min-w-0 truncate pl-2 text-[11.5px] text-fg-3">{summary}</span> : null}
      </button>
      {open && <div className="space-y-1 pb-3">{children}</div>}
    </section>
  );
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Colours far enough apart to tell from each other, at most `n`. */
function distinct(list: string[], n: number): string[] {
  const out: string[] = [];
  for (const c of list) {
    if (c.length !== 7) continue;
    const [r, g, b] = rgb(c);
    if (
      out.some((o) => {
        const [r2, g2, b2] = rgb(o);
        return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) < 36;
      })
    )
      continue;
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Swatches of the page's own colours, a picker for any other, and none. `hex`: only the colour itself (a
 * swatch that opens the picker) and its value as text, for a list of colours.
 */
export function ColorField({ value, palette, onChange, none, hex }: { value: string | null; palette: string[]; onChange: (v: string | null) => void; none?: boolean; hex?: boolean }) {
  const list = hex ? [] : distinct(palette.map(hexOf).filter((x): x is string => !!x), none ? 5 : 6);
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const picker = (
    <input type="color" value={hexOf(value ?? '') ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
  );
  if (hex)
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <label title="Pick a colour" style={{ background: value ?? undefined }} className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line-2">
          {picker}
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() !== (value ?? '') && onChange(text.trim() || null)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          spellCheck={false}
          aria-label="Colour"
          className="h-7 w-full min-w-0 rounded-md border border-line bg-bg-1 px-1.5 font-mono text-[11.5px] outline-none focus:border-accent/60"
        />
      </div>
    );
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      {none && (
        <button
          type="button"
          title="None"
          aria-label="None"
          onClick={() => onChange(null)}
          className={cx('relative h-5.5 w-5.5 overflow-hidden rounded-full border border-line-2 bg-white', value === null && 'ring-2 ring-accent ring-offset-1 ring-offset-panel')}
        >
          <span className="absolute top-1/2 left-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-err" />
        </button>
      )}
      {list.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={c}
          onClick={() => onChange(c)}
          style={{ background: c }}
          className={cx('h-5.5 w-5.5 rounded-full border border-line-2', value?.toLowerCase() === c && 'ring-2 ring-accent ring-offset-1 ring-offset-panel')}
        />
      ))}
      <label title="Another colour" className="relative h-5.5 w-5.5 cursor-pointer overflow-hidden rounded-full border border-line-2 bg-[conic-gradient(#f44,#fd4,#4d4,#4df,#44f,#f4f,#f44)]">
        {picker}
      </label>
    </div>
  );
}

/**
 * A number with its unit: type it (Enter or leaving the field sets it), the arrow keys step it (with Shift,
 * by ten), and dragging its letter sideways (`scrub`) changes it as you go. Words it takes as they are
 * ("auto"). Empty clears it.
 */
export function NumField({
  value,
  onChange,
  units = ['px'],
  words = [],
  min,
  max,
  step = 1,
  scrub,
  placeholder,
  className,
  title,
}: {
  value: string;
  onChange: (v: string | null) => void;
  units?: string[];
  words?: string[];
  min?: number;
  max?: number;
  step?: number;
  scrub?: string;
  placeholder?: string;
  className?: string;
  title?: string;
}) {
  const [n, u] = splitNum(value);
  const unit = n !== null ? u : units[0];
  const shown = n !== null ? fmt(n) : words.includes(value) ? value : '';
  const [text, setText] = useState(shown);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [shown]);
  const clamp = (x: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, x));
  const set = (x: number) => {
    const v = clamp(x);
    setText(fmt(v));
    onChange(`${fmt(v)}${unit}`);
  };
  const commit = (t: string) => {
    const s = t.trim().toLowerCase();
    if (s === shown) return;
    if (!s) return onChange(null);
    if (words.includes(s)) return onChange(s);
    const [x, xu] = splitNum(s);
    if (x === null) return setText(shown);
    const v = clamp(x);
    onChange(`${fmt(v)}${xu && (units.includes(xu) || /^(px|%|em|rem|vh|vw|fr|deg|s|ms)$/.test(xu)) ? xu : x === 0 && !xu ? 'px' : unit}`);
  };
  const startScrub = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const v0 = n ?? 0;
    let last = v0;
    const move = (ev: PointerEvent) => {
      const x = clamp(v0 + Math.round((ev.clientX - x0) / 3) * step * (ev.shiftKey ? 10 : 1));
      if (x !== last) set((last = x));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div title={title} className={cx('flex h-8 min-w-0 flex-1 items-center rounded-lg border border-line bg-bg-1 focus-within:border-accent/60', className)}>
      {scrub && (
        <span onPointerDown={startScrub} className="shrink-0 cursor-ew-resize touch-none pl-2 text-[11px] font-semibold text-fg-3 select-none">
          {scrub}
        </span>
      )}
      <input
        value={text}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={title}
        spellCheck={false}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          else if (e.key === 'Escape') {
            setText(shown);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            set((n ?? 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
          }
        }}
        className="h-full w-full min-w-0 bg-transparent px-2 text-[12.5px] tabular-nums outline-none placeholder:text-fg-3"
      />
      {units.length > 1 ? (
        <select
          value={units.includes(unit) ? unit : ''}
          aria-label="Unit"
          onChange={(e) => n !== null && onChange(`${fmt(n)}${e.target.value}`)}
          className="h-full shrink-0 cursor-pointer appearance-none bg-transparent pr-2 pl-0.5 text-right text-[11.5px] text-fg-3 outline-none"
        >
          {!units.includes(unit) && <option value="">{unit || '–'}</option>}
          {units.map((x) => (
            <option key={x} value={x}>
              {x || '–'}
            </option>
          ))}
        </select>
      ) : units[0] ? (
        <span className="shrink-0 pr-2 text-[11.5px] text-fg-3">{units[0]}</span>
      ) : null}
    </div>
  );
}

/** A row of choices, one picked (none when `value` is none of them). */
export function Choice<T extends string>({ value, options, onChange }: { value: T | null; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex h-8 min-w-0 flex-1 rounded-lg bg-bg-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-label={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex min-w-0 flex-1 items-center justify-center truncate rounded-md px-1 text-[12px] font-medium transition-colors',
            value === o.value ? 'bg-panel text-fg shadow-[0_1px_2px_rgba(0,0,0,.12)] ring-1 ring-line' : 'text-fg-3 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A short list to pick from (the device's own menu, which fits any screen). */
export function Select({
  value,
  options,
  onChange,
  title,
  className,
}: {
  value: string;
  options: { value: string; label: string; style?: CSSProperties }[];
  onChange: (v: string) => void;
  title?: string;
  className?: string;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <span className={cx('relative flex h-8 min-w-0', className ?? 'flex-1')}>
      <select
        value={value}
        title={title}
        aria-label={title}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-line bg-bg-1 pr-6 pl-2 text-[12.5px] outline-none focus:border-accent/60"
      >
        {!known && <option value={value}>{value || '—'}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} style={o.style}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-3" />
    </span>
  );
}

/** Lines of text that grow with what is in them (up to `max` lines, then it scrolls). */
export function AutoArea({
  value,
  onChange,
  placeholder,
  mono,
  max = 14,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  max?: number;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = parseFloat(getComputedStyle(el).lineHeight) || 18;
    el.style.height = `${Math.min(el.scrollHeight + 2, line * max + 14)}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The panel may grow narrower or wider: the lines wrap anew.
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => el.clientWidth !== w && ((w = el.clientWidth), fit()));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      spellCheck={!mono}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'block w-full min-w-0 resize-none rounded-lg border border-line bg-bg-1 px-2.5 py-1.5 text-[12.5px] leading-[18px] outline-none placeholder:text-fg-3 focus:border-accent/60',
        mono && 'font-mono text-[11.5px]',
      )}
    />
  );
}

/** A field that sends what was typed when it settles (as you type, a moment later). */
export function Typed({
  value,
  onChange,
  placeholder,
  area,
  mono,
  label,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  area?: boolean;
  mono?: boolean;
  label?: string;
  max?: number;
}) {
  const [v, setV] = useState(value);
  const t = useRef(0);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setV(value);
      last.current = value;
    }
  }, [value]);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const change = (x: string) => {
    setV(x);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => {
      last.current = x;
      onChange(x);
    }, 450);
  };
  return area ? (
    <AutoArea value={v} onChange={change} placeholder={placeholder} mono={mono} label={label} max={max} />
  ) : (
    <input
      value={v}
      onChange={(e) => change(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      className="h-8 w-full min-w-0 rounded-lg border border-line bg-bg-1 px-2.5 text-[12.5px] outline-none placeholder:text-fg-3 focus:border-accent/60"
    />
  );
}

/** One side's space in the box below: a small number to type, or drag up and down. */
function Side({ value, set, label, onChange }: { value: string; set: boolean; label: string; onChange: (v: string | null) => void }) {
  const [n] = splitNum(value);
  const shown = n !== null ? fmt(n) : value === 'auto' ? 'auto' : '0';
  const [text, setText] = useState(shown);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [shown]);
  const drag = (e: React.PointerEvent<HTMLInputElement>) => {
    if (e.pointerType === 'touch' || document.activeElement === e.currentTarget) return;
    const el = e.currentTarget;
    const y0 = e.clientY;
    const v0 = n ?? 0;
    let moved = false;
    let last = v0;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = Math.max(label.startsWith('Inside') ? 0 : -999, v0 + Math.round((y0 - ev.clientY) / 3) * (ev.shiftKey ? 10 : 1));
      if (!moved && Math.abs(ev.clientY - y0) < 3) return;
      moved = true;
      if (x !== last) {
        last = x;
        setText(fmt(x));
        onChange(`${fmt(x)}px`);
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      // Without a drag it was a click: type in it.
      if (!moved) el.focus();
    };
    e.preventDefault();
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const commit = () => {
    const s = text.trim().toLowerCase();
    if (s === shown) return;
    if (!s) return onChange(null);
    if (s === 'auto') return onChange('auto');
    const [x, u] = splitNum(s);
    if (x === null) return setText(shown);
    onChange(`${fmt(x)}${u || 'px'}`);
  };
  return (
    <input
      value={text}
      title={`${label}: drag up or down, or type`}
      aria-label={label}
      inputMode="decimal"
      onPointerDown={drag}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const x = (n ?? 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          setText(fmt(x));
          onChange(`${fmt(x)}px`);
        }
      }}
      className={cx(
        'h-6 w-10 cursor-ns-resize rounded bg-transparent text-center text-[11.5px] tabular-nums outline-none hover:bg-bg-2 focus:cursor-text focus:bg-bg-1 focus:ring-1 focus:ring-accent/60 max-md:cursor-text',
        set ? 'font-semibold text-accent' : 'text-fg-2',
      )}
    />
  );
}

/** Space outside a part's border (margin) and inside it (padding), side by side as the box itself has them. */
export function BoxModel({ get, isSet, onChange, size }: { get: (p: string) => string; isSet: (p: string) => boolean; onChange: (props: Record<string, string | null>) => void; size: string }) {
  const side = (p: string, label: string) => <Side value={get(p)} set={isSet(p)} label={label} onChange={(v) => onChange({ [p]: v })} />;
  return (
    <div className="relative rounded-lg border border-dashed border-line-2 bg-[#f6a623]/[.07] px-1 py-0.5 text-[10.5px] text-fg-3">
      <span className="absolute top-1 left-1.5" title="The space around it, outside its border (margin)">
        Outside
      </span>
      <div className="flex justify-center">{side('margin-top', 'Outside, top')}</div>
      <div className="flex items-center gap-0.5">
        {side('margin-left', 'Outside, left')}
        <div className="relative min-w-0 flex-1 rounded-md border border-line-2 bg-[#50be78]/[.08] px-1 py-0.5">
          <span className="absolute top-1 left-1.5" title="The space inside its border, around what is in it (padding)">
            Inside
          </span>
          <div className="flex justify-center">{side('padding-top', 'Inside, top')}</div>
          <div className="flex items-center gap-0.5">
            {side('padding-left', 'Inside, left')}
            <div className="flex h-6 min-w-0 flex-1 items-center justify-center truncate rounded bg-bg-2 px-1 text-[10.5px] tabular-nums">{size}</div>
            {side('padding-right', 'Inside, right')}
          </div>
          <div className="flex justify-center">{side('padding-bottom', 'Inside, bottom')}</div>
        </div>
        {side('margin-right', 'Outside, right')}
      </div>
      <div className="flex justify-center">{side('margin-bottom', 'Outside, bottom')}</div>
    </div>
  );
}
