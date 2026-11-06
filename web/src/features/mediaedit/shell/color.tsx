// Colours in the editors' shell:
//   ColorPicker    a square of saturation and brightness, a strip of hues, an opacity strip (when `alpha`), the colour's
//                  hex code, the screen's eyedropper (where the browser has one) and swatches to pick from.
//   ColorButton    a swatch that opens the picker beside it.
//   ColorSwatches  the foreground and background colours as Photoshop shows them (overlapping squares), with Swap (X)
//                  and Default colours (D); a click on either opens its picker.
// And the conversions they share (hex, RGB, HSV).
import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Pipette, RotateCcw } from 'lucide-react';
import { cx, IconButton, Popover } from '../../../components/ui';
import { fieldCls } from './fields';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** A colour from #rgb, #rgba, #rrggbb or #rrggbbaa (null when it is none of them). */
export function parseHex(s: string): Rgba | null {
  const h = s.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null;
  const x = h.length <= 4 ? [...h].map((d) => d + d).join('') : h;
  const n = (i: number) => parseInt(x.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: x.length >= 8 ? n(6) / 255 : 1 };
}

const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
/** #rrggbb, or #rrggbbaa when it is see-through. */
export const toHex = (c: Rgba) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a < 1 ? hex2(c.a * 255) : ''}`;

export function rgbToHsv(c: Rgba): { h: number; s: number; v: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: mx ? d / mx : 0, v: mx };
}

export function hsvToRgb(h: number, s: number, v: number, a = 1): Rgba {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r, g, b] = seg === 0 ? [c, x, 0] : seg === 1 ? [x, c, 0] : seg === 2 ? [0, c, x] : seg === 3 ? [0, x, c] : seg === 4 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a };
}

/** Swatches offered under the picker. */
export const BASIC_SWATCHES = ['#000000', '#ffffff', '#7f7f7f', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#7c2d12', '#1e3a8a'];

/** A draggable area: the pointer's place in it, 0 to 1 each way, while pressed. */
function useArea(on: (x: number, y: number, done: boolean) => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const r = e.currentTarget.getBoundingClientRect();
      on(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1), false);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const r = e.currentTarget.getBoundingClientRect();
      on(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1), false);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      on(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1), true);
    },
  };
}

const CHECKER = 'repeating-conic-gradient(var(--bg-3) 0% 25%, var(--bg-1) 0% 50%) 50% / 10px 10px';

export function ColorPicker({ value, onChange, alpha, swatches = BASIC_SWATCHES, extra }: { value: string; onChange: (hex: string, done: boolean) => void; alpha?: boolean; swatches?: string[]; extra?: ReactNode }) {
  const c = parseHex(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  // The hue is kept while it is grey (where the colour alone does not say it).
  const [hsv, setHsv] = useState(() => rgbToHsv(c));
  const shown = toHex({ ...hsvToRgb(hsv.h, hsv.s, hsv.v), a: c.a }) === toHex(c) ? hsv : rgbToHsv(c);
  const [text, setText] = useState<string | null>(null);
  const put = (h: number, s: number, v: number, a: number, done: boolean) => {
    setHsv({ h, s, v });
    onChange(toHex(hsvToRgb(h, s, v, a)), done);
  };
  const sv = useArea((x, y, done) => put(shown.h, x, 1 - y, c.a, done));
  const hue = useArea((x, _y, done) => put(x * 359.9, shown.s, shown.v, c.a, done));
  const op = useArea((x, _y, done) => put(shown.h, shown.s, shown.v, Math.round(x * 100) / 100, done));
  const pure = toHex(hsvToRgb(shown.h, 1, 1));
  const solid = toHex({ ...c, a: 1 });
  const dropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  return (
    <div className="w-[232px] space-y-2.5 p-1.5">
      <div {...sv} className="relative h-36 w-full cursor-crosshair touch-none rounded-md" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}>
        <span className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: `${shown.s * 100}%`, top: `${(1 - shown.v) * 100}%`, background: solid }} />
      </div>
      <div {...hue} className="relative h-3 w-full cursor-pointer touch-none rounded-full" style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
        <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: `${(shown.h / 360) * 100}%`, background: pure }} />
      </div>
      {alpha && (
        <div {...op} className="relative h-3 w-full cursor-pointer touch-none rounded-full" style={{ background: `linear-gradient(to right, transparent, ${solid}), ${CHECKER}` }}>
          <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: `${c.a * 100}%` }} />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="h-7 w-7 shrink-0 rounded-md border border-line-2" style={{ background: `linear-gradient(${value}, ${value}), ${CHECKER}` }} />
        <input
          value={text ?? toHex(c)}
          onChange={(e) => {
            setText(e.target.value);
            const p = parseHex(e.target.value);
            if (p) {
              setHsv(rgbToHsv(p));
              onChange(toHex(p), false);
            }
          }}
          onBlur={() => {
            const p = text !== null ? parseHex(text) : null;
            setText(null);
            if (p) onChange(toHex(p), true);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          spellCheck={false}
          aria-label="Colour code"
          className={cx(fieldCls, 'flex-1 font-mono')}
        />
        {dropper && (
          <IconButton
            label="Pick a colour from the screen"
            size="sm"
            onClick={async () => {
              try {
                const r = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open();
                const p = parseHex(r.sRGBHex);
                if (p) {
                  setHsv(rgbToHsv(p));
                  onChange(toHex({ ...p, a: c.a }), true);
                }
              } catch {
                // Closed without a pick.
              }
            }}
          >
            <Pipette size={14} />
          </IconButton>
        )}
      </div>
      {swatches.length > 0 && (
        <div className="grid grid-cols-7 gap-1">
          {swatches.map((s) => (
            <button
              key={s}
              type="button"
              title={s}
              aria-label={s}
              onClick={() => {
                const p = parseHex(s);
                if (p) setHsv(rgbToHsv(p));
                onChange(s, true);
              }}
              className={cx('h-6 rounded-[5px] border border-black/15', s.toLowerCase() === toHex(c) && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
              style={{ background: s }}
            />
          ))}
        </div>
      )}
      {extra}
    </div>
  );
}

/** A swatch that opens the picker. */
export function ColorButton({ value, onChange, label, alpha, size = 26, swatches }: { value: string; onChange: (hex: string, done: boolean) => void; label: string; alpha?: boolean; size?: number; swatches?: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="shrink-0 rounded-md border border-line-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
        style={{ width: size, height: size, background: `linear-gradient(${value}, ${value}), ${CHECKER}` }}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={248} title={label}>
        <ColorPicker value={value} onChange={onChange} alpha={alpha} swatches={swatches} />
      </Popover>
    </>
  );
}

/** The foreground and background colours, overlapping, with Swap and Default colours. */
export function ColorSwatches({ fg, bg, onFg, onBg, onSwap, onReset, swatches }: { fg: string; bg: string; onFg: (c: string, done: boolean) => void; onBg: (c: string, done: boolean) => void; onSwap: () => void; onReset: () => void; swatches?: string[] }) {
  const [open, setOpen] = useState<'fg' | 'bg' | null>(null);
  const fgRef = useRef<HTMLButtonElement>(null);
  const bgRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative h-11 w-11 shrink-0">
      <button
        ref={bgRef}
        type="button"
        title="Background colour"
        aria-label="Background colour"
        onClick={() => setOpen(open === 'bg' ? null : 'bg')}
        className="absolute right-0.5 bottom-0.5 h-6 w-6 rounded-[4px] border border-line-2 shadow-[0_0_0_1px_var(--bg)]"
        style={{ background: bg }}
      />
      <button
        ref={fgRef}
        type="button"
        title="Foreground colour"
        aria-label="Foreground colour"
        onClick={() => setOpen(open === 'fg' ? null : 'fg')}
        className="absolute top-0.5 left-0.5 h-6 w-6 rounded-[4px] border border-line-2 shadow-[0_0_0_1.5px_var(--bg)]"
        style={{ background: fg }}
      />
      <button type="button" title="Swap the colours (X)" aria-label="Swap the colours" onClick={onSwap} className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded text-fg-3 hover:text-fg">
        <ArrowLeftRight size={10} />
      </button>
      <button type="button" title="Default colours (D)" aria-label="Default colours" onClick={onReset} className="absolute bottom-0 left-0 flex h-4 w-4 items-center justify-center rounded text-fg-3 hover:text-fg">
        <RotateCcw size={9} />
      </button>
      <Popover anchor={fgRef} open={open === 'fg'} onClose={() => setOpen(null)} width={248} title="Foreground colour">
        <ColorPicker value={fg} onChange={onFg} swatches={swatches} />
      </Popover>
      <Popover anchor={bgRef} open={open === 'bg'} onClose={() => setOpen(null)} width={248} title="Background colour">
        <ColorPicker value={bg} onChange={onBg} swatches={swatches} />
      </Popover>
    </div>
  );
}
