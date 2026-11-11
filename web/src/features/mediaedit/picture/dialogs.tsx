// The picture editor's dialogs: Image size (pixels or per cent, its shape kept or not, every layer made larger or
// smaller), Canvas size (room added or taken on the sides the anchor says, see-through or a colour), an amount (feather,
// grow, shrink, a stroke's width), a picture from the Library to add as a layer, and how the picture is saved (its size,
// its kind of file and quality, where it goes).
import { useEffect, useMemo, useState } from 'react';
import { IMAGE_FORMATS, LIMITS, type ImageFormat } from '@shared/mediaedit';
import { Button, cx, Dialog, Empty } from '../../../components/ui';
import { mu } from '../../../lib/machine';
import { mediaUrl, useMedia } from '../../media/state';
import { Check, ColorButton, FieldRow, ScrubNumber, Seg } from '../shell';
import { fitNewSize, NEW_PRESETS, presetOf, type NewBackground } from './newpicture';

export function ImageSizeDialog({ open, w, h, onClose, onApply }: { open: boolean; w: number; h: number; onClose: () => void; onApply: (w: number, h: number) => void }) {
  const [unit, setUnit] = useState<'px' | '%'>('px');
  const [keep, setKeep] = useState(true);
  const [size, setSize] = useState({ w, h });
  useEffect(() => {
    if (open) setSize({ w, h });
  }, [open, w, h]);
  const pct = (v: number, of: number) => Math.round((v / of) * 1000) / 10;
  const setW = (v: number) => setSize((s) => ({ w: Math.max(1, Math.round(v)), h: keep ? Math.max(1, Math.round((v * h) / w)) : s.h }));
  const setH = (v: number) => setSize((s) => ({ h: Math.max(1, Math.round(v)), w: keep ? Math.max(1, Math.round((v * w) / h)) : s.w }));
  const big = size.w > LIMITS.side || size.h > LIMITS.side || size.w * size.h > LIMITS.pixels;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Image size"
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={big} onClick={() => (onApply(size.w, size.h), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-[12.5px] leading-snug text-fg-3">Every layer is made larger or smaller with the picture. To make a picture larger with its detail drawn in, use AI → Make it larger.</p>
        <Seg
          value={unit}
          options={[
            { value: 'px', label: 'Pixels' },
            { value: '%', label: 'Per cent' },
          ]}
          onChange={setUnit}
        />
        <FieldRow label="Width">
          {unit === 'px' ? <ScrubNumber value={size.w} min={1} max={LIMITS.side} width={84} unit="px" onChange={(v) => setW(v)} /> : <ScrubNumber value={pct(size.w, w)} min={1} max={1000} step={0.1} width={84} unit="%" onChange={(v) => setW((v / 100) * w)} />}
        </FieldRow>
        <FieldRow label="Height">
          {unit === 'px' ? <ScrubNumber value={size.h} min={1} max={LIMITS.side} width={84} unit="px" onChange={(v) => setH(v)} /> : <ScrubNumber value={pct(size.h, h)} min={1} max={1000} step={0.1} width={84} unit="%" onChange={(v) => setH((v / 100) * h)} />}
        </FieldRow>
        <Check on={keep} onChange={setKeep}>
          Keep its shape
        </Check>
        <p className={cx('text-[12px]', big ? 'text-err' : 'text-fg-3')}>{big ? `At most ${LIMITS.side} pixels a side and ${LIMITS.pixels / 1e6} million in all.` : `Now ${w} × ${h}; it will be ${size.w} × ${size.h} pixels.`}</p>
      </div>
    </Dialog>
  );
}

/** File → New: a blank picture of a size (a preset or any), on white, see-through or a colour. */
export function NewPictureDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (w: number, h: number, bg: NewBackground, color: string) => void }) {
  const [size, setSize] = useState({ w: 1080, h: 1080 });
  const [bg, setBg] = useState<NewBackground>('white');
  const [color, setColor] = useState('#1f2937');
  useEffect(() => {
    if (open) setBg('white');
  }, [open]);
  const preset = presetOf(size.w, size.h);
  const fit = fitNewSize(size.w, size.h);
  const sized = (w: number, h: number) => setSize({ w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New picture"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => (onCreate(fit.w, fit.h, bg, color), onClose())}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-[12.5px] leading-snug text-fg-3">A blank picture opens in a tab of its own; Save keeps it in your Library.</p>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Size">
          {NEW_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={preset.id === p.id}
              onClick={() => p.w && p.h && sized(p.w, p.h)}
              className={cx('flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left', preset.id === p.id ? 'border-accent bg-accent-soft' : 'border-line-2 bg-bg-1 hover:bg-bg-2')}
            >
              <span className="text-[12.5px] font-medium">{p.label}</span>
              <span className="tnum text-[11.5px] text-fg-3">{p.about}</span>
            </button>
          ))}
        </div>
        <FieldRow label="Width">
          <ScrubNumber value={size.w} min={1} max={LIMITS.side} width={84} unit="px" onChange={(v) => sized(v, size.h)} />
        </FieldRow>
        <FieldRow label="Height">
          <ScrubNumber value={size.h} min={1} max={LIMITS.side} width={84} unit="px" onChange={(v) => sized(size.w, v)} />
          <button type="button" className="text-[12px] text-fg-3 hover:text-fg" onClick={() => sized(size.h, size.w)} title="Turn it on its side">
            Swap
          </button>
        </FieldRow>
        <FieldRow label="Background">
          <Seg
            value={bg}
            options={[
              { value: 'white', label: 'White' },
              { value: 'transparent', label: 'See-through' },
              { value: 'colour', label: 'Colour' },
            ]}
            onChange={setBg}
          />
          {bg === 'colour' && <ColorButton value={color} label="Background colour" onChange={(c) => setColor(c)} />}
        </FieldRow>
        <p className={cx('text-[12px]', fit.cut ? 'text-err' : 'text-fg-3')}>{fit.cut ? `That is more than the editor holds: it will be ${fit.w} × ${fit.h} pixels (at most ${LIMITS.side} a side and ${LIMITS.pixels / 1e6} million in all).` : `${fit.w} × ${fit.h} pixels.`}</p>
      </div>
    </Dialog>
  );
}

const ANCHORS: [number, number][] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
];

export function CanvasSizeDialog({ open, w, h, bg, onClose, onApply }: { open: boolean; w: number; h: number; bg: string; onClose: () => void; onApply: (w: number, h: number, anchor: [number, number], color: string | null) => void }) {
  const [size, setSize] = useState({ w, h });
  const [anchor, setAnchor] = useState<[number, number]>([1, 1]);
  const [fill, setFill] = useState<'clear' | 'color'>('clear');
  const [color, setColor] = useState(bg);
  useEffect(() => {
    if (open) {
      setSize({ w, h });
      setColor(bg);
    }
  }, [open, w, h, bg]);
  const big = size.w > LIMITS.side || size.h > LIMITS.side || size.w * size.h > LIMITS.pixels;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Canvas size"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={big} onClick={() => (onApply(size.w, size.h, anchor, fill === 'color' ? color : null), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-[12.5px] leading-snug text-fg-3">Room added round the picture (or taken away): the layers stay as large as they are.</p>
        <FieldRow label="Width">
          <ScrubNumber value={size.w} min={1} max={LIMITS.side} width={84} unit="px" onChange={(v) => setSize((s) => ({ ...s, w: Math.max(1, Math.round(v)) }))} />
          <button type="button" className="text-[12px] text-fg-3 hover:text-fg" onClick={() => setSize((s) => ({ ...s, w: s.w + Math.round(w * 0.1) }))}>
            +10%
          </button>
        </FieldRow>
        <FieldRow label="Height">
          <ScrubNumber value={size.h} min={1} max={LIMITS.side} width={84} unit="px" onChange={(v) => setSize((s) => ({ ...s, h: Math.max(1, Math.round(v)) }))} />
          <button type="button" className="text-[12px] text-fg-3 hover:text-fg" onClick={() => setSize((s) => ({ ...s, h: s.h + Math.round(h * 0.1) }))}>
            +10%
          </button>
        </FieldRow>
        <FieldRow label="The picture stays">
          <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Where the picture stays">
            {ANCHORS.map(([x, y]) => (
              <button
                key={`${x}${y}`}
                type="button"
                role="radio"
                aria-checked={anchor[0] === x && anchor[1] === y}
                aria-label={`${['Left', 'Middle', 'Right'][x]}, ${['top', 'middle', 'bottom'][y]}`}
                onClick={() => setAnchor([x, y])}
                className={cx('h-6 w-6 rounded border', anchor[0] === x && anchor[1] === y ? 'border-accent bg-accent' : 'border-line-2 bg-bg-1 hover:bg-bg-2')}
              />
            ))}
          </div>
        </FieldRow>
        <FieldRow label="The new room">
          <Seg
            value={fill}
            options={[
              { value: 'clear', label: 'See-through' },
              { value: 'color', label: 'A colour' },
            ]}
            onChange={setFill}
          />
          {fill === 'color' && <ColorButton value={color} label="Colour" onChange={(c) => setColor(c)} size={24} />}
        </FieldRow>
        <p className={cx('text-[12px]', big ? 'text-err' : 'text-fg-3')}>{big ? `At most ${LIMITS.side} pixels a side and ${LIMITS.pixels / 1e6} million in all.` : `Now ${w} × ${h}; it will be ${size.w} × ${size.h} pixels.`}</p>
      </div>
    </Dialog>
  );
}

/** An amount in pixels asked for (Feather, Grow, Shrink, the width of a stroke). */
export function AmountDialog({ ask, onClose }: { ask: { title: string; label: string; value: number; max: number; run: (v: number) => void; extra?: React.ReactNode } | null; onClose: () => void }) {
  const [v, setV] = useState(ask?.value ?? 0);
  useEffect(() => {
    if (ask) setV(ask.value);
  }, [ask]);
  return (
    <Dialog
      open={!!ask}
      onClose={onClose}
      title={ask?.title}
      width={360}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => (ask?.run(v), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FieldRow label={ask?.label ?? ''}>
          <ScrubNumber value={v} min={0} max={ask?.max ?? 1000} width={80} unit="px" onChange={(x) => setV(x)} />
        </FieldRow>
        {ask?.extra}
      </div>
    </Dialog>
  );
}

/** A picture of the Library to add as a layer. */
export function LibraryPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (url: string, title: string) => void }) {
  const items = useMedia((s) => s.items);
  useEffect(() => {
    if (open) useMedia.getState().ensure();
  }, [open]);
  const pictures = useMemo(() => (items ?? []).filter((m) => m.kind === 'image').slice(0, 120), [items]);
  return (
    <Dialog open={open} onClose={onClose} title="A picture from the Library" width={640}>
      {!items ? (
        <p className="py-6 text-center text-[13px] text-fg-3">Looking in the Library</p>
      ) : !pictures.length ? (
        <Empty title="No pictures in the Library yet" />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {pictures.map((m) => (
            <button key={m.id} type="button" onClick={() => (onPick(mediaUrl(m), m.title), onClose())} className="group flex flex-col gap-1 rounded-lg p-1 text-left hover:bg-bg-2">
              <span className="block aspect-square overflow-hidden rounded-md border border-line bg-bg-2">
                <img src={mu(mediaUrl(m, 'still'))} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).src = mu(mediaUrl(m)))} />
              </span>
              <span translate="no" className="truncate text-[12px] text-fg-2">
                {m.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/** How the picture is saved: its size (full or less), its kind of file and quality, and where it goes. */
export function SaveOptions({
  w,
  h,
  full,
  onWidth,
  format,
  onFormat,
  quality,
  onQuality,
  says,
  copy,
  busy,
}: {
  w: number;
  h: number;
  full: { w: number; h: number };
  onWidth: (w: number | null) => void;
  format: ImageFormat;
  onFormat: (f: ImageFormat) => void;
  quality: number;
  onQuality: (q: number) => void;
  says: string;
  copy: { label: string; run: () => void } | null;
  busy: boolean;
}) {
  const num = (v: string, of: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(8192, n) : of;
  };
  const input = 'h-8 w-full min-w-0 rounded-lg border border-line-2 bg-bg-1 px-2 text-[13px] tnum outline-none focus:border-accent/60';
  return (
    <div className="space-y-3.5">
      <div className="space-y-1.5">
        <div className="text-[12px] font-medium text-fg-3">Size, in pixels</div>
        <div className="flex items-center gap-2">
          <input className={input} inputMode="numeric" aria-label="Width" value={w} onChange={(e) => onWidth(num(e.target.value, w) === full.w ? null : num(e.target.value, w))} />
          <span className="text-fg-3">×</span>
          <input className={input} inputMode="numeric" aria-label="Height" value={h} onChange={(e) => onWidth(Math.round((num(e.target.value, h) * full.w) / full.h))} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[1, 0.75, 0.5, 0.25].map((k) => (
            <button key={k} type="button" onClick={() => onWidth(k === 1 ? null : Math.max(1, Math.round(full.w * k)))} className={cx('h-7 rounded-lg border px-2 text-[12px]', Math.round(full.w * k) === w ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}>
              {k === 1 ? 'Full size' : `${k * 100}%`}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[12px] font-medium text-fg-3">Kind of file</div>
        <div className="grid grid-cols-3 gap-1.5">
          {IMAGE_FORMATS.map((f) => (
            <button key={f.id} type="button" onClick={() => onFormat(f.id)} aria-pressed={format === f.id} className={cx('h-8 rounded-lg border text-[13px]', format === f.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}>
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[12px] leading-snug text-fg-3">{format === 'png' ? 'PNG keeps every pixel and see-through parts; the file is larger.' : format === 'jpeg' ? 'JPEG suits photos and makes small files; see-through parts become white.' : 'WebP makes small files and keeps see-through parts.'}</p>
      </div>
      {format !== 'png' && (
        <label className="block">
          <span className="flex items-center text-[12.5px]">
            <span className="flex-1 text-fg-2">Quality</span>
            <span className="tnum text-fg">{quality}</span>
          </span>
          <input type="range" min={30} max={100} value={quality} onChange={(e) => onQuality(Number(e.target.value))} aria-label="Quality" className="mt-1 block h-5 w-full accent-[var(--accent)]" />
        </label>
      )}
      <p className="border-t border-line pt-2.5 text-[12px] leading-snug text-fg-3">{says}</p>
      <p className="text-[12px] leading-snug text-fg-3">The layers are put together into one picture as it is saved; the editor keeps them until it is closed.</p>
      {copy && (
        <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={copy.run}>
          {copy.label}
        </Button>
      )}
    </div>
  );
}
