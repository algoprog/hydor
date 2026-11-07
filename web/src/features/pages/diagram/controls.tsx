// The diagram editor's small controls: a colour (draw.io's palette of fills and lines, the looks that go together, any
// other, one from the screen, or none), an arrowhead and a kind of dash picked from drawings of them, and a row of
// buttons of which one is on.
import { useRef, useState, type ReactNode } from 'react';
import { Pipette } from 'lucide-react';
import { arrowHead } from '@shared/diagram-route';
import { ARROWS, DASHES, type ArrowKind, type Dash } from '@shared/diagram';
import { dashArray } from '@shared/diagram-render';
import { cx, Popover } from '../../../components/ui';
import { colourFromScreen } from '../slides/controls';
import { tr } from '../../../i18n/runtime';

/** The colours offered, row by row: greys, then each hue from light to strong. */
export const PALETTE_COLOURS = [
  ['#ffffff', '#f5f5f5', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#424242', '#1f2328'],
  ['#dae8fc', '#d5e8d4', '#ffe6cc', '#fff2cc', '#f8cecc', '#e1d5e7', '#d0eeea', '#fbe0ef'],
  ['#a9c4eb', '#b9e0a5', '#ffcc99', '#ffe599', '#ea9999', '#c3abd0', '#9fd8cf', '#f4b6d3'],
  ['#6c8ebf', '#82b366', '#d79b00', '#d6b656', '#b85450', '#9673a6', '#3d9a8b', '#c2588f'],
  ['#1f6feb', '#2da44e', '#e8590c', '#f5c518', '#cf222e', '#8250df', '#0c8599', '#d6336c'],
  ['#1550b4', '#1a7f37', '#b4430a', '#b08800', '#a40e26', '#6339b5', '#086f80', '#a61e4d'],
];

const toHex = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000');
const checker = 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 8px 8px';

/** A colour's swatches: none (when it may be), the palette, any other, and one from the screen. */
export function ColourGrid({ value, onChange, none, noneLabel }: { value: string | undefined; onChange: (v: string | undefined) => void; none?: boolean; noneLabel?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-8 gap-1">
        {PALETTE_COLOURS.flat().map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={c}
            onClick={() => onChange(c)}
            style={{ background: c }}
            className={cx('h-5 w-5 rounded-[5px] border border-line-2', value === c && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {none && (
          <button
            type="button"
            onClick={() => onChange('none')}
            className={cx('flex h-6 items-center gap-1.5 rounded-md border border-line px-1.5 text-[12px] text-fg-2 hover:bg-bg-2', value === 'none' && 'border-accent/60 bg-accent-soft text-fg')}
          >
            <span className="relative h-3.5 w-3.5 overflow-hidden rounded-[3px] border border-line-2 bg-white">
              <span className="absolute top-1/2 left-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-err" />
            </span>
            {noneLabel ?? tr('None')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={cx('h-6 rounded-md border border-line px-1.5 text-[12px] text-fg-2 hover:bg-bg-2', value === undefined && 'border-accent/60 bg-accent-soft text-fg')}
        >
          {tr('Default')}
        </button>
        <label title={tr('Another colour')} className="relative ml-auto h-6 w-6 cursor-pointer overflow-hidden rounded-md border border-line-2 bg-[conic-gradient(#f44,#fd4,#4d4,#4df,#44f,#f4f,#f44)]">
          <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
        {'EyeDropper' in window && (
          <button
            type="button"
            title={tr('Pick a colour from the screen')}
            aria-label={tr('Pick a colour from the screen')}
            onClick={() => void colourFromScreen().then((c) => c && onChange(c))}
            className="grid h-6 w-6 place-items-center rounded-md border border-line-2 text-fg-2 hover:text-fg"
          >
            <Pipette size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/** A button showing a colour that opens its swatches. */
export function ColourButton({ value, onChange, label, none, icon, shown, className }: { value: string | undefined; onChange: (v: string | undefined) => void; label: string; none?: boolean; icon?: ReactNode; shown?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const c = shown ?? value;
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={cx('flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2', className)}
      >
        {icon}
        <span className="h-4 w-4 shrink-0 rounded-[4px] border border-line-2" style={{ background: !c || c === 'none' ? checker : c }} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={236} title={label}>
        <div className="p-2" onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
          <ColourGrid
            value={value}
            none={none}
            onChange={(v) => {
              onChange(v);
              setOpen(false);
            }}
          />
        </div>
      </Popover>
    </>
  );
}

/** A drawing of an arrowhead on a short line, pointing right (or left, for a connector's start). */
export function ArrowGlyph({ kind, start, w = 44 }: { kind: ArrowKind; start?: boolean; w?: number }) {
  const y = 8;
  const tip = start ? { x: 6, y } : { x: w - 6, y };
  const dir = start ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const h = arrowHead(kind, tip, dir, 1.4);
  const inset = kind === 'none' || kind === 'open' || kind.startsWith('er-') || kind === 'bar' || kind === 'cross' ? 0 : kind.startsWith('diamond') ? 20 : 10;
  return (
    <svg width={w} height={16} viewBox={`0 0 ${w} 16`} className="block text-fg">
      <path d={start ? `M${6 + inset} ${y}H${w - 4}` : `M4 ${y}H${w - 6 - inset}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
      {h.solid && <path d={h.solid} fill="currentColor" stroke="currentColor" strokeWidth={1} />}
      {h.hollow && <path d={h.hollow} fill="var(--color-elevated, #fff)" stroke="currentColor" strokeWidth={1.4} />}
      {h.line && <path d={h.line} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />}
    </svg>
  );
}

/** An arrowhead picked from drawings of each. */
export function ArrowPick({ value, onChange, start, label }: { value: ArrowKind; onChange: (k: ArrowKind) => void; start?: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" title={label} aria-label={label} onClick={() => setOpen((o) => !o)} className={cx('flex h-8 items-center rounded-lg border border-line bg-bg-1 px-2 hover:border-line-2', open && 'border-accent/60')}>
        <ArrowGlyph kind={value} start={start} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={220} title={label}>
        <div className="grid max-h-[320px] grid-cols-2 gap-1 overflow-y-auto p-1.5">
          {ARROWS.map((a) => (
            <button
              key={a.id}
              type="button"
              title={tr(a.label)}
              onClick={() => {
                onChange(a.id);
                setOpen(false);
              }}
              className={cx('flex flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[11px] text-fg-3 hover:bg-bg-2', value === a.id && 'bg-accent-soft text-fg')}
            >
              <ArrowGlyph kind={a.id} start={start} w={56} />
              <span className="truncate">{tr(a.label)}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

const DASH_LABEL: Record<Dash, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', 'dash-dot': 'Dash and dot' };

/** A kind of line, from drawings of each. */
export function DashPick({ value, onChange }: { value: Dash; onChange: (d: Dash) => void }) {
  return (
    <div className="flex gap-1">
      {DASHES.map((d) => (
        <button
          key={d}
          type="button"
          title={tr(DASH_LABEL[d])}
          aria-label={tr(DASH_LABEL[d])}
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={cx('flex h-8 flex-1 items-center justify-center rounded-lg border px-1', value === d ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-2')}
        >
          <svg width="34" height="8" className="text-fg">
            <path d="M2 4H32" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray={dashArray(d, 1.6)} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** A row of buttons, one of them on. */
export function Choices<T extends string>({ value, options, onChange }: { value: T | undefined; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-line bg-bg-1 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={tr(o.label)}
          aria-label={tr(o.label)}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('flex h-7 min-w-7 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[12px] transition-colors', value === o.value ? 'bg-bg-3 font-medium text-fg shadow-sm' : 'text-fg-2 hover:text-fg')}
        >
          {o.icon ?? tr(o.label)}
        </button>
      ))}
    </div>
  );
}
