// The picture editor's panels, one a tool: Crop (a shape, turning and flipping, straightening), Adjust (light, colour
// and detail, each a slider that goes back to 0 with a double click), Filters (each shown on a small copy of the
// picture, with its strength) and Markup (what to draw with, its colour and size; words' font and what is behind them;
// how much an area is hidden; an emoji to put down). A picked mark takes the colour and size changed here.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Droplets, Grid3x3, Hand, Highlighter, Minus, Pen, RotateCcw, RotateCw, Smile, Square, Circle, Trash2, TrianglesCenterlineDashedHorizontal, TrianglesCenterlineDashedVertical, Type } from 'lucide-react';
import { ADJUSTMENTS, applyLook, CROP_SHAPES, FILTERS, MARK_FONTS, type Adjust, type AdjustKey, type CropShape, type FilterId, type FilterPick, type FontId, type Mark } from '@shared/mediaedit';
import { Button, cx } from '../../components/ui';
import { canvasOf } from './render';

export function Group({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('space-y-2', className)}>
      {title && <div className="text-[12px] font-medium text-fg-3">{title}</div>}
      {children}
    </div>
  );
}

/** A slider with its name and value; a double click puts it back to `zero`. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  zero = 0,
  unit = '',
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  zero?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const shown = min < 0 && value > 0 ? `+${value}${unit}` : `${value}${unit}`;
  return (
    <label className={cx('block', disabled && 'opacity-50')}>
      <span className="flex items-center gap-2 text-[12.5px]">
        <span className="min-w-0 flex-1 truncate text-fg-2">{label}</span>
        <span className={cx('tnum shrink-0', value === zero ? 'text-fg-3' : 'text-fg')}>{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(zero)}
        aria-label={label}
        className="mt-1 block h-5 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

/** A button of a grid of choices: its icon or picture over its name, picked or not. */
function Choice({ on, onClick, icon, label, title, disabled }: { on?: boolean; onClick: () => void; icon: ReactNode; label: ReactNode; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      disabled={disabled}
      className={cx(
        'flex min-w-0 flex-col items-center justify-start gap-1 rounded-[10px] border px-1 py-1.5 text-[11.5px] leading-tight transition-colors disabled:opacity-40',
        on ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2 hover:text-fg',
      )}
    >
      <span className="flex h-5 items-center justify-center">{icon}</span>
      <span className="line-clamp-2 max-w-full text-center">{label}</span>
    </button>
  );
}

function ShapeOutline({ ratio }: { ratio: number }) {
  const s = 15;
  const w = ratio >= 1 ? s : Math.max(5, Math.round(s * ratio));
  const h = ratio >= 1 ? Math.max(5, Math.round(s / ratio)) : s;
  return <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} />;
}

// ---- Crop ------------------------------------------------------------------------------------------------------

export function CropPanel({
  shape,
  pictureRatio,
  onShape,
  onTurn,
  onFlip,
  straighten,
  onStraighten,
  onReset,
  changed,
}: {
  shape: CropShape;
  pictureRatio: number;
  onShape: (s: CropShape) => void;
  onTurn: (dir: 1 | -1) => void;
  onFlip: (axis: 'h' | 'v') => void;
  straighten: number;
  onStraighten: (v: number) => void;
  onReset: () => void;
  changed: boolean;
}) {
  return (
    <div className="space-y-5">
      <Group title="Shape">
        <div className="grid grid-cols-4 gap-1.5">
          {CROP_SHAPES.map((s) => (
            <Choice
              key={s.id}
              on={shape === s.id}
              onClick={() => onShape(s.id)}
              icon={s.id === 'free' ? <span className="h-[13px] w-[15px] rounded-[2px] border-[1.5px] border-dashed border-current" /> : <ShapeOutline ratio={s.ratio || pictureRatio} />}
              label={s.label}
            />
          ))}
        </div>
      </Group>
      <Group title="Turn">
        <div className="grid grid-cols-4 gap-1.5">
          <Choice onClick={() => onTurn(-1)} icon={<RotateCcw size={16} />} label="Left" title="Rotate left" />
          <Choice onClick={() => onTurn(1)} icon={<RotateCw size={16} />} label="Right" title="Rotate right" />
          {/* By what they draw: lucide's FlipHorizontal2 and FlipVertical2 are drawn the other way round. */}
          <Choice onClick={() => onFlip('h')} icon={<TrianglesCenterlineDashedVertical size={16} />} label="Mirror" title="Flip left to right" />
          <Choice onClick={() => onFlip('v')} icon={<TrianglesCenterlineDashedHorizontal size={16} />} label="Upside down" title="Flip upside down" />
        </div>
      </Group>
      <Slider label="Straighten" value={straighten} min={-45} max={45} step={0.5} unit="°" onChange={onStraighten} />
      <Button size="sm" variant="ghost" disabled={!changed} onClick={onReset} icon={<RotateCcw size={13} />}>
        Undo the crop and turns
      </Button>
    </div>
  );
}

// ---- Adjust ----------------------------------------------------------------------------------------------------

export function AdjustPanel({ adjust, onChange, onReset }: { adjust: Adjust; onChange: (k: AdjustKey, v: number) => void; onReset: () => void }) {
  return (
    <div className="space-y-3">
      {ADJUSTMENTS.map((a, i) => (
        <div key={a.id} className={cx(i === 5 || i === 9 ? 'border-t border-line pt-3' : '')}>
          <Slider label={a.label} value={adjust[a.id] ?? 0} min={a.min} max={100} onChange={(v) => onChange(a.id, v)} />
        </div>
      ))}
      <Button size="sm" variant="ghost" disabled={!Object.keys(adjust).length} onClick={onReset} icon={<RotateCcw size={13} />}>
        Put them all back
      </Button>
    </div>
  );
}

// ---- Filters ---------------------------------------------------------------------------------------------------

/** Each filter on a small copy of the picture (as it is turned and cropped, with the adjustments over the filter). */
export function FiltersPanel({ thumb, adjust, filter, onPick, onStrength, row }: { thumb: HTMLCanvasElement | null; adjust: Adjust; filter?: FilterPick; onPick: (id: FilterId | null) => void; onStrength: (v: number) => void; row?: boolean }) {
  const looks = useMemo(() => {
    if (!thumb) return null;
    const g0 = thumb.getContext('2d', { willReadFrequently: true })!;
    const src = g0.getImageData(0, 0, thumb.width, thumb.height);
    const make = (f: FilterPick | null) => {
      const d = new Uint8ClampedArray(src.data);
      applyLook(d, thumb.width, thumb.height, { ...adjust, blur: 0, sharpness: 0 }, f);
      const c = canvasOf(thumb.width, thumb.height);
      c.getContext('2d')!.putImageData(new ImageData(d, thumb.width, thumb.height), 0, 0);
      return c.toDataURL('image/jpeg', 0.85);
    };
    return { none: make(null), ...Object.fromEntries(FILTERS.map((f) => [f.id, make({ id: f.id })])) } as Record<string, string>;
  }, [thumb, adjust]);
  const picked = filter?.id ?? null;
  const cell = (id: FilterId | null, label: string) => (
    <button
      key={id ?? 'none'}
      type="button"
      onClick={() => onPick(id)}
      aria-pressed={picked === id}
      className={cx('group flex min-w-0 flex-col items-stretch gap-1 rounded-[10px] p-1 text-[11.5px] transition-colors', row && 'w-[76px] shrink-0', picked === id ? 'bg-accent-soft text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
    >
      <span className={cx('block aspect-square overflow-hidden rounded-[7px] border bg-bg-2', picked === id ? 'border-accent ring-2 ring-accent/40' : 'border-line')}>
        {looks && <img src={looks[id ?? 'none']} alt="" draggable={false} className="h-full w-full object-cover" />}
      </span>
      <span className="truncate text-center">{label}</span>
    </button>
  );
  return (
    <div className="space-y-4">
      {/* Below the picture they are a row to swipe along; beside it, a grid. */}
      <div className={cx('gap-1.5', row ? '-mx-3 flex overflow-x-auto px-3 [&::-webkit-scrollbar]:hidden' : 'grid grid-cols-3')}>
        {cell(null, 'None')}
        {FILTERS.map((f) => cell(f.id, f.label))}
      </div>
      {picked && <Slider label="Strength" value={filter?.strength ?? 100} min={0} max={100} zero={100} onChange={onStrength} />}
    </div>
  );
}

// ---- Markup ----------------------------------------------------------------------------------------------------

export type MarkTool = 'move' | 'pen' | 'highlighter' | 'arrow' | 'line' | 'rect' | 'ellipse' | 'text' | 'blur' | 'pixelate' | 'emoji';

export const MARK_TOOLS: { id: MarkTool; label: string; icon: ReactNode }[] = [
  { id: 'move', label: 'Move', icon: <Hand size={16} /> },
  { id: 'pen', label: 'Pen', icon: <Pen size={16} /> },
  { id: 'highlighter', label: 'Highlighter', icon: <Highlighter size={16} /> },
  { id: 'arrow', label: 'Arrow', icon: <ArrowUpRight size={16} /> },
  { id: 'line', label: 'Straight line', icon: <Minus size={16} className="-rotate-45" /> },
  { id: 'rect', label: 'Rectangle', icon: <Square size={16} /> },
  { id: 'ellipse', label: 'Oval', icon: <Circle size={16} /> },
  { id: 'text', label: 'Text', icon: <Type size={16} /> },
  { id: 'blur', label: 'Blur an area', icon: <Droplets size={16} /> },
  { id: 'pixelate', label: 'Pixelate an area', icon: <Grid3x3 size={16} /> },
  { id: 'emoji', label: 'Emoji', icon: <Smile size={16} /> },
];

export const SWATCHES = ['#ffffff', '#111111', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
export const EMOJI = [
  '😀',
  '😂',
  '😍',
  '🥳',
  '😎',
  '🤔',
  '😮',
  '😢',
  '😡',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🙏',
  '💪',
  '👀',
  '❤️',
  '🔥',
  '⭐',
  '✨',
  '🎉',
  '💯',
  '✅',
  '❌',
  '⚠️',
  '❓',
  '❗',
  '💡',
  '📌',
  '📍',
  '🎯',
  '🏆',
  '🚀',
  '☀️',
  '🌈',
  '🌸',
  '🍀',
  '🐶',
  '🐱',
  '🍕',
  '☕',
  '🎁',
];
/** What can sit behind words. */
export const TEXT_BACKS: { id: string; label: string; color?: string }[] = [
  { id: 'none', label: 'Nothing' },
  { id: 'dark', label: 'Dark', color: '#000000b3' },
  { id: 'light', label: 'Light', color: '#ffffffd9' },
];

export interface MarkStyle {
  color: string;
  width: number;
  hiWidth: number;
  font: FontId;
  size: number;
  back: string;
  strength: number;
  emoji: string;
  emojiSize: number;
}

/** Sizes that suit a picture of this size, to start with. */
export function styleFor(long: number): MarkStyle {
  return {
    color: '#ef4444',
    width: Math.max(2, Math.round(long / 220)),
    hiWidth: Math.max(8, Math.round(long / 35)),
    font: 'sans',
    size: Math.max(14, Math.round(long / 16)),
    back: 'none',
    strength: 60,
    emoji: '👍',
    emojiSize: Math.max(24, Math.round(long / 7)),
  };
}

export function MarkupPanel({
  tool,
  onTool,
  style,
  onStyle,
  picked,
  onDelete,
  long,
  hint,
  wide,
}: {
  tool: MarkTool;
  onTool: (t: MarkTool) => void;
  style: MarkStyle;
  onStyle: (s: Partial<MarkStyle>) => void;
  picked: Mark | null;
  onDelete: () => void;
  long: number;
  hint: string;
  /** Across the screen, below the picture: its tools four to a row. */
  wide?: boolean;
}) {
  // What the controls are for: the picked mark's kind, else the tool's.
  const kind: string = picked ? picked.type : tool;
  const colorInput = useRef<HTMLInputElement>(null);
  const hasColor = ['pen', 'highlighter', 'arrow', 'line', 'rect', 'ellipse', 'text'].includes(kind);
  const hasWidth = ['pen', 'arrow', 'line', 'rect', 'ellipse'].includes(kind);
  const maxWidth = Math.max(40, Math.round(long / 25));
  useEffect(() => {
    if (style.width > maxWidth) onStyle({ width: maxWidth });
  }, [maxWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <div className={cx('grid gap-1.5', wide ? 'grid-cols-4' : 'grid-cols-3')}>
        {MARK_TOOLS.map((t) => (
          <Choice key={t.id} on={tool === t.id} onClick={() => onTool(t.id)} icon={t.icon} label={t.label} title={t.label} />
        ))}
      </div>
      <p className="text-[12.5px] leading-snug text-fg-3">{hint}</p>
      {hasColor && (
        <Group title="Colour">
          <div className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onStyle({ color: c })}
                aria-label={c}
                title={c}
                aria-pressed={style.color === c}
                className={cx('h-7 w-7 rounded-full border border-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]', style.color === c && 'ring-2 ring-accent ring-offset-2 ring-offset-panel')}
                style={{ background: c }}
              />
            ))}
            <button
              type="button"
              onClick={() => colorInput.current?.click()}
              aria-label="Another colour"
              title="Another colour"
              className={cx('relative h-7 w-7 overflow-hidden rounded-full border border-line-2 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]', !SWATCHES.includes(style.color) && 'ring-2 ring-accent ring-offset-2 ring-offset-panel')}
            >
              <input ref={colorInput} type="color" value={style.color.slice(0, 7)} onChange={(e) => onStyle({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" tabIndex={-1} aria-hidden />
            </button>
          </div>
        </Group>
      )}
      {hasWidth && <Slider label="Thickness" value={Math.min(style.width, maxWidth)} min={1} max={maxWidth} onChange={(v) => onStyle({ width: v })} zero={Math.max(2, Math.round(long / 220))} />}
      {kind === 'highlighter' && <Slider label="Thickness" value={style.hiWidth} min={4} max={Math.max(60, Math.round(long / 8))} onChange={(v) => onStyle({ hiWidth: v })} zero={Math.max(8, Math.round(long / 35))} />}
      {kind === 'text' && (
        <>
          <Group title="Font">
            <div className="flex flex-wrap gap-1.5">
              {MARK_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onStyle({ font: f.id })}
                  aria-pressed={style.font === f.id}
                  className={cx('h-8 rounded-lg border px-2.5 text-[13px]', style.font === f.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}
                  style={{ fontFamily: f.css, fontWeight: f.id === 'heavy' ? 400 : 600 }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Group>
          <Slider label="Size" value={style.size} min={8} max={Math.max(120, Math.round(long / 4))} onChange={(v) => onStyle({ size: v })} zero={Math.max(14, Math.round(long / 16))} />
          <Group title="Behind the words">
            <div className="flex gap-1.5">
              {TEXT_BACKS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onStyle({ back: b.id })}
                  aria-pressed={style.back === b.id}
                  className={cx('h-8 flex-1 rounded-lg border px-2 text-[13px]', style.back === b.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </Group>
        </>
      )}
      {(kind === 'blur' || kind === 'pixelate') && <Slider label="How hidden" value={style.strength} min={20} max={100} onChange={(v) => onStyle({ strength: v })} zero={60} />}
      {kind === 'emoji' && (
        <>
          <div className="grid grid-cols-7 gap-1">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onStyle({ emoji: e })}
                aria-pressed={style.emoji === e}
                className={cx('flex h-9 items-center justify-center rounded-lg text-[20px]', style.emoji === e ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-bg-2')}
              >
                {e}
              </button>
            ))}
          </div>
          <Slider label="Size" value={style.emojiSize} min={16} max={Math.max(200, Math.round(long / 2))} onChange={(v) => onStyle({ emojiSize: v })} zero={Math.max(24, Math.round(long / 7))} />
        </>
      )}
      {picked && (
        <Button size="sm" variant="secondary" icon={<Trash2 size={13} />} onClick={onDelete}>
          Delete the mark
        </Button>
      )}
    </div>
  );
}
