// The picture editor's dock panels: Layers (each layer's thumbnail, name, eye and lock; dragged to reorder; its blend
// mode and opacity; new, adjustment, picture, duplicate, merge and delete), Properties (what the picked layer is: its
// place and size, a mark's colour, line, words or emoji, how hidden an area is, an adjustment's mask and clip), History
// (each step by name: a click goes back to it), Histogram (the picture's colours, live) and Colour (the foreground
// colour's picker, the background's, the colours used last).
import { useEffect, useMemo, useRef, useState } from 'react';
import { BLEND_MODES, type BlendMode } from '@shared/blend';
import { histogramOf, MARK_FONTS, type Mark } from '@shared/mediaedit';
import { ArrowDown, Copy, Eye, EyeOff, ImagePlus, Layers2, Lock, LockOpen, Merge, Plus, SlidersHorizontal, Trash2, Type, Shapes, Droplets, Grid3x3, Smile, History as HistoryIcon, Check as CheckIcon } from 'lucide-react';
import { cx, IconButton, MenuItem, Popover } from '../../../components/ui';
import { Check, ColorButton, ColorPicker, FieldRow, MiniSelect, ScrubNumber, Seg, SliderRow } from '../shell';
import { layerThumb, renderDoc } from './compose';
import { activeLayer, indexOf, type Doc, type Layer } from './doc';
import { TEXT_BACKS, type PictureEd } from './editor';
import { useEd } from './View';

export const blendOptions = BLEND_MODES.map((m) => ({ value: m.id, label: m.label }));

// ---- thumbnails ------------------------------------------------------------------------------------------------------

const thumbs = new WeakMap<object, { v: number; url: string | null }>();
function thumbOf(doc: Doc, l: Layer): string | null {
  const v = l.kind === 'raster' ? l.px.version : 0;
  const key = l.kind === 'raster' ? l.px : l;
  const got = thumbs.get(key);
  if (got && got.v === v) return got.url;
  const c = layerThumb(doc, l, 72);
  const url = c ? c.toDataURL('image/png') : null;
  thumbs.set(key, { v, url });
  return url;
}

function KindIcon({ l }: { l: Layer }) {
  if (l.kind === 'adjust') return <SlidersHorizontal size={14} />;
  if (l.kind === 'mark') {
    const t = l.mark.type;
    if (t === 'text') return <Type size={14} />;
    if (t === 'blur') return <Droplets size={14} />;
    if (t === 'pixelate') return <Grid3x3 size={14} />;
    if (t === 'emoji') return <Smile size={14} />;
    return <Shapes size={14} />;
  }
  return null;
}

// ---- Layers ----------------------------------------------------------------------------------------------------------

export function LayersPanel({ ed, onAddPicture }: { ed: PictureEd; onAddPicture: (from: 'device' | 'library' | 'clipboard') => void }) {
  useEd(ed);
  const doc = ed.doc;
  const a = activeLayer(doc);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; y0: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const list = [...doc.layers].reverse();
  const rowH = 44;
  return (
    <div className="flex h-full min-h-0 flex-col text-[12.5px]">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
        <MiniSelect label="Blend mode" value={a?.blend ?? 'normal'} options={blendOptions} onChange={(v) => a && ed.setLayer(a.id, { blend: v as BlendMode }, 'Blend mode')} width={118} />
        <ScrubNumber label="Opacity" value={Math.round((a?.opacity ?? 1) * 100)} min={0} max={100} unit="%" width={54} onChange={(v, done) => a && ed.setLayer(a.id, { opacity: v / 100 }, 'Opacity', done)} disabled={!a} />
        <IconButton label={a?.locked ? 'Unlock the layer' : 'Lock the layer'} size="sm" active={!!a?.locked} disabled={!a} onClick={() => a && ed.setLayer(a.id, { locked: !a.locked }, a.locked ? 'Unlock layer' : 'Lock layer')}>
          {a?.locked ? <Lock size={13} /> : <LockOpen size={13} />}
        </IconButton>
      </div>
      <div
        role="listbox"
        aria-label="Layers"
        className="min-h-0 flex-1 overflow-y-auto py-1"
        onPointerMove={(e) => {
          if (!drag) return;
          const steps = Math.round((e.clientY - drag.y0) / rowH);
          const to = Math.max(0, Math.min(doc.layers.length - 1, drag.from - steps));
          if (to !== drag.to) setDrag({ ...drag, to });
        }}
        onPointerUp={() => {
          if (drag && drag.to !== drag.from) ed.moveLayer(drag.from, drag.to);
          setDrag(null);
        }}
      >
        {list.map((l) => {
          const i = indexOf(doc, l.id);
          const on = l.id === doc.active;
          const url = thumbOf(doc, l);
          const target = drag && drag.to === i && drag.from !== i;
          return (
            <div
              key={l.id}
              role="option"
              aria-selected={on}
              onClick={() => ed.pickLayer(l.id)}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button,input')) return;
                (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                setDrag({ id: l.id, from: i, to: i, y0: e.clientY });
              }}
              className={cx(
                'mx-1 flex h-11 cursor-default items-center gap-2 rounded-md px-1.5',
                on ? 'bg-accent-soft' : 'hover:bg-bg-2',
                drag?.id === l.id && 'opacity-60',
                target && (drag!.to > drag!.from ? 'shadow-[inset_0_2px_0_var(--accent)]' : 'shadow-[inset_0_-2px_0_var(--accent)]'),
              )}
            >
              <IconButton label={l.visible ? 'Hide the layer' : 'Show the layer'} size="sm" onClick={(e) => (e.stopPropagation(), ed.setLayer(l.id, { visible: !l.visible }, l.visible ? 'Hide layer' : 'Show layer'))}>
                {l.visible ? <Eye size={14} /> : <EyeOff size={14} className="text-fg-3" />}
              </IconButton>
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-line-2 text-fg-3" style={{ background: 'repeating-conic-gradient(var(--bg-3) 0% 25%, var(--bg-1) 0% 50%) 50% / 8px 8px' }}>
                {url && l.kind === 'raster' ? <img src={url} alt="" draggable={false} className="max-h-full max-w-full" /> : url ? <img src={url} alt="" draggable={false} className="max-h-full max-w-full" /> : <KindIcon l={l} />}
                {l.kind === 'mark' && (l.mark.type === 'blur' || l.mark.type === 'pixelate') && <KindIcon l={l} />}
              </span>
              {renaming === l.id ? (
                <input
                  autoFocus
                  defaultValue={l.name}
                  aria-label="Layer name"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    setRenaming(null);
                    const v = e.target.value.trim();
                    if (v && v !== l.name) ed.setLayer(l.id, { name: v.slice(0, 60) }, 'Rename layer');
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="h-7 min-w-0 flex-1 rounded border border-accent/60 bg-bg-1 px-1.5 text-[12.5px] outline-none"
                />
              ) : (
                <span translate="no" className={cx('min-w-0 flex-1 truncate', !l.visible && 'text-fg-3')} onDoubleClick={(e) => (e.stopPropagation(), setRenaming(l.id))} title="Double-click to rename">
                  {l.name}
                </span>
              )}
              <span className="flex shrink-0 items-center gap-1 text-fg-3">
                {l.kind !== 'raster' && <KindIcon l={l} />}
                {l.locked && <Lock size={12} />}
                {l.opacity < 1 && <span className="tnum text-[11px]">{Math.round(l.opacity * 100)}%</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 border-t border-line px-1.5 py-1">
        <IconButton label="New layer (Ctrl+Shift+N)" size="sm" onClick={() => ed.newLayer()}>
          <Plus size={15} />
        </IconButton>
        <IconButton label="New adjustment layer" size="sm" onClick={() => (ed.newAdjustment(), ed.showPanel('adjust'))}>
          <SlidersHorizontal size={14} />
        </IconButton>
        <IconButton ref={addRef} label="Add a picture as a layer" size="sm" active={addOpen} onClick={() => setAddOpen((x) => !x)}>
          <ImagePlus size={14} />
        </IconButton>
        <Popover anchor={addRef} open={addOpen} onClose={() => setAddOpen(false)} width={240} prefer="above" title="Add a picture as a layer">
          <MenuItem icon={<ImagePlus size={14} />} onClick={() => (setAddOpen(false), onAddPicture('device'))}>
            From this device
          </MenuItem>
          <MenuItem icon={<Layers2 size={14} />} onClick={() => (setAddOpen(false), onAddPicture('library'))}>
            From the Library
          </MenuItem>
          <MenuItem icon={<Copy size={14} />} onClick={() => (setAddOpen(false), onAddPicture('clipboard'))}>
            From the clipboard
          </MenuItem>
        </Popover>
        <span className="flex-1" />
        <IconButton label="Duplicate (Ctrl+J)" size="sm" disabled={!a} onClick={() => ed.duplicateLayer()}>
          <Copy size={14} />
        </IconButton>
        <IconButton label="Merge down (Ctrl+E)" size="sm" disabled={!a || indexOf(doc, a.id) < 1} onClick={() => ed.mergeDown()}>
          <Merge size={14} />
        </IconButton>
        <IconButton label="Delete the layer" size="sm" disabled={!a || doc.layers.length < 2} onClick={() => ed.deleteLayer()}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

// ---- Properties ------------------------------------------------------------------------------------------------------

const EMOJI = ['😀', '😂', '😍', '🥳', '😎', '🤔', '😮', '😢', '😡', '👍', '👎', '👏', '🙌', '🙏', '💪', '👀', '❤️', '🔥', '⭐', '✨', '🎉', '💯', '✅', '❌', '⚠️', '❓', '❗', '💡', '📌', '📍', '🎯', '🏆', '🚀', '☀️', '🌈', '🌸', '🍀', '🐶', '🐱', '🍕', '☕', '🎁'];

export function EmojiGrid({ value, onPick }: { value: string; onPick: (e: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-0.5">
      {EMOJI.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} aria-pressed={value === e} className={cx('flex h-8 items-center justify-center rounded-md text-[18px]', value === e ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-bg-2')}>
          {e}
        </button>
      ))}
    </div>
  );
}

export function PropertiesPanel({ ed }: { ed: PictureEd }) {
  useEd(ed);
  const doc = ed.doc;
  const l = activeLayer(doc);
  if (!l) return <p className="p-3 text-[12.5px] text-fg-3">Pick a layer in Layers to see what it is.</p>;
  const from = doc;
  const kindName = l.kind === 'raster' ? 'Pixels' : l.kind === 'adjust' ? 'Adjustments' : l.mark.type === 'text' ? 'Words' : l.mark.type === 'blur' || l.mark.type === 'pixelate' ? 'A hidden area' : l.mark.type === 'emoji' ? 'An emoji' : 'A shape';
  const m = l.kind === 'mark' ? l.mark : null;
  const setMark = (p: Partial<Mark>, done = true) => l.kind === 'mark' && ed.setMark(l.id, { ...l.mark, ...p } as Mark, 'Change the mark', done);
  return (
    <div className="space-y-2.5 p-3 text-[12.5px]">
      <div className="flex items-center gap-2 text-fg-3">
        <KindIcon l={l} />
        <span>{kindName}</span>
      </div>
      <FieldRow label="Name">
        <input key={l.id + l.name} defaultValue={l.name} aria-label="Layer name" onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && (e.target as HTMLInputElement).blur())} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && ed.setLayer(l.id, { name: e.target.value.trim().slice(0, 60) }, 'Rename layer')} className="h-7 min-w-0 flex-1 rounded-md border border-line-2 bg-bg-1 px-1.5 text-[12px] outline-none focus:border-accent/70" />
      </FieldRow>
      <FieldRow label="Blend mode">
        <MiniSelect label="Blend mode" value={l.blend} options={blendOptions} onChange={(v) => ed.setLayer(l.id, { blend: v as BlendMode }, 'Blend mode')} width={140} />
      </FieldRow>
      <SliderRow label="Opacity" value={Math.round(l.opacity * 100)} min={0} max={100} zero={100} unit="%" onChange={(v, done) => ed.setLayer(l.id, { opacity: v / 100 }, 'Opacity', done)} />
      <div className="flex flex-wrap gap-3">
        <Check on={l.visible} onChange={(v) => ed.setLayer(l.id, { visible: v }, v ? 'Show layer' : 'Hide layer')}>
          Shows
        </Check>
        <Check on={l.locked} onChange={(v) => ed.setLayer(l.id, { locked: v }, v ? 'Lock layer' : 'Unlock layer')}>
          Locked
        </Check>
      </div>
      {l.kind === 'raster' && (
        <>
          <FieldRow label="Place">
            <ScrubNumber label="X" value={l.x} onChange={(v, done) => ed.moveLayerBy(from, l.id, v - l.x, 0, done)} width={58} />
            <ScrubNumber label="Y" value={l.y} onChange={(v, done) => ed.moveLayerBy(from, l.id, 0, v - l.y, done)} width={58} />
          </FieldRow>
          <FieldRow label="Size">
            <span className="tnum text-fg-2">
              {l.px.w} × {l.px.h} px
            </span>
          </FieldRow>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" className="h-7 rounded-md bg-bg-2 px-2.5 text-[12px] ring-1 ring-line-2 hover:bg-bg-3" onClick={() => ed.startTransform()}>
              Free transform
            </button>
            <button type="button" className="h-7 rounded-md bg-bg-2 px-2.5 text-[12px] ring-1 ring-line-2 hover:bg-bg-3" onClick={() => ed.selectLayerPixels()}>
              Select its pixels
            </button>
          </div>
        </>
      )}
      {m && (
        <>
          {'color' in m && (
            <FieldRow label="Colour">
              <ColorButton value={m.color} label="Colour" alpha onChange={(c, done) => setMark({ color: c } as Partial<Mark>, done)} />
            </FieldRow>
          )}
          {(m.type === 'rect' || m.type === 'ellipse' || m.type === 'line' || m.type === 'arrow' || m.type === 'pen' || m.type === 'highlighter') && (
            <SliderRow label="Thickness" value={Math.round(m.width)} min={1} max={Math.max(60, Math.round(Math.max(doc.w, doc.h) / 10))} zero={Math.max(2, Math.round(Math.max(doc.w, doc.h) / 220))} onChange={(v, done) => setMark({ width: v }, done)} />
          )}
          {(m.type === 'rect' || m.type === 'ellipse') && (
            <FieldRow label="Fill">
              <Check on={!!m.fill} onChange={(v) => setMark({ fill: v ? ed.bg : undefined })}>
                Filled
              </Check>
              {m.fill && <ColorButton value={m.fill} label="Fill colour" alpha onChange={(c, done) => setMark({ fill: c }, done)} />}
            </FieldRow>
          )}
          {m.type === 'text' && (
            <>
              <FieldRow label="Font">
                <MiniSelect label="Font" value={m.font ?? 'sans'} options={MARK_FONTS.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => setMark({ font: v })} width={140} />
              </FieldRow>
              <SliderRow label="Size" value={m.size} min={6} max={Math.max(200, Math.round(Math.max(doc.w, doc.h) / 3))} zero={Math.max(14, Math.round(Math.max(doc.w, doc.h) / 16))} onChange={(v, done) => setMark({ size: v }, done)} />
              <FieldRow label="Behind it">
                <Seg value={m.bg === TEXT_BACKS.dark ? 'dark' : m.bg === TEXT_BACKS.light ? 'light' : m.bg ? 'other' : 'none'} options={[{ value: 'none', label: 'Nothing' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} onChange={(v) => setMark({ bg: TEXT_BACKS[v as 'none' | 'dark' | 'light'] })} />
              </FieldRow>
              <button type="button" className="h-7 rounded-md bg-bg-2 px-2.5 text-[12px] ring-1 ring-line-2 hover:bg-bg-3" onClick={() => ed.startWriting(l.id)}>
                Edit the words
              </button>
            </>
          )}
          {(m.type === 'blur' || m.type === 'pixelate') && (
            <>
              <FieldRow label="Hidden by">
                <Seg value={m.type} options={[{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixels' }]} onChange={(v) => setMark({ type: v } as Partial<Mark>)} />
              </FieldRow>
              <SliderRow label="How hidden" value={m.strength ?? 60} min={20} max={100} zero={60} onChange={(v, done) => setMark({ strength: v }, done)} />
            </>
          )}
          {m.type === 'emoji' && (
            <>
              <EmojiGrid value={m.emoji} onPick={(e) => setMark({ emoji: e })} />
              <SliderRow label="Size" value={m.size} min={8} max={Math.max(200, Math.round(Math.max(doc.w, doc.h) / 2))} zero={Math.max(24, Math.round(Math.max(doc.w, doc.h) / 7))} onChange={(v, done) => setMark({ size: v }, done)} />
            </>
          )}
          {l.kind === 'mark' && (
            <SliderRow label="Turned" value={Math.round(l.angle)} min={-180} max={180} unit="°" onChange={(v, done) => ed.setLayer(l.id, { angle: v }, 'Turn', done)} />
          )}
        </>
      )}
      {l.kind === 'adjust' && (
        <>
          <Check on={l.clip} onChange={(v) => ed.setLayer(l.id, { clip: v }, v ? 'Clip to the layer below' : 'Unclip')} title="Only the layer under it is changed">
            Only the layer under it
          </Check>
          <p className="text-[12px] leading-snug text-fg-3">{l.mask ? 'It changes the part that was selected when it was made.' : 'It changes everything under it.'}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={!doc.sel} className="h-7 rounded-md bg-bg-2 px-2.5 text-[12px] ring-1 ring-line-2 hover:bg-bg-3 disabled:opacity-45" onClick={() => ed.setLayer(l.id, { mask: doc.sel }, 'Mask from the selection')}>
              Only the selection
            </button>
            {l.mask && (
              <button type="button" className="h-7 rounded-md bg-bg-2 px-2.5 text-[12px] ring-1 ring-line-2 hover:bg-bg-3" onClick={() => ed.setLayer(l.id, { mask: null }, 'Remove the mask')}>
                Everywhere
              </button>
            )}
            <button type="button" className="h-7 rounded-md bg-bg-2 px-2.5 text-[12px] ring-1 ring-line-2 hover:bg-bg-3" onClick={() => ed.showPanel('adjust')}>
              Its adjustments
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- History ---------------------------------------------------------------------------------------------------------

export function HistoryPanel({ ed }: { ed: PictureEd }) {
  useEd(ed);
  const h = ed.hist;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
  }, [h.at, h.steps.length]);
  return (
    <div ref={box} role="list" className="py-1 text-[12.5px]">
      {h.steps.map((s, i) => (
        <button
          key={i}
          type="button"
          role="listitem"
          aria-current={i === h.at ? 'step' : undefined}
          onClick={() => ed.goTo(i)}
          className={cx('mx-1 flex h-7 w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-2 text-left', i === h.at ? 'bg-accent-soft text-fg' : i > h.at ? 'text-fg-3 hover:bg-bg-2' : 'text-fg-2 hover:bg-bg-2')}
        >
          {i === 0 ? <HistoryIcon size={13} className="shrink-0 text-fg-3" /> : i === h.at ? <CheckIcon size={13} className="shrink-0 text-accent" /> : <span className="w-[13px] shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{s.label}</span>
        </button>
      ))}
      <p className="px-3 pt-1.5 pb-1 text-[11.5px] leading-snug text-fg-3">A click goes back to a step; what came after it stays until you change something.</p>
    </div>
  );
}

// ---- Histogram -------------------------------------------------------------------------------------------------------

/** The picture's colours counted, from a small copy, worked out again a moment after it changes. */
export function useHistogram(ed: PictureEd, upTo?: string) {
  const [h, setH] = useState<ReturnType<typeof histogramOf> | null>(null);
  const pv = ed.pv;
  useEffect(() => {
    const id = window.setTimeout(() => {
      const d = ed.doc;
      const k = Math.min(1, 320 / Math.max(d.w, d.h));
      const c = renderDoc(d, { region: { x: 0, y: 0, w: d.w, h: d.h }, scale: k, ...(upTo ? { upTo } : {}) });
      setH(histogramOf(c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data));
    }, 160);
    return () => window.clearTimeout(id);
  }, [pv, upTo, ed]);
  return h;
}

/** A histogram drawn: RGB together (each in its colour, lighter where they meet), or one channel. */
export function HistogramGraph({ h, channel, height = 96, className }: { h: ReturnType<typeof histogramOf> | null; channel: 'rgb' | 'l' | 'r' | 'g' | 'b'; height?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = 256;
    c.width = w;
    c.height = height;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, height);
    if (!h || !h.count) return;
    const chans: ['r' | 'g' | 'b' | 'l', string][] = channel === 'rgb' ? [['r', 'rgba(239,68,68,0.75)'], ['g', 'rgba(34,197,94,0.75)'], ['b', 'rgba(59,130,246,0.75)']] : [[channel, channel === 'l' ? 'rgba(160,166,180,0.9)' : channel === 'r' ? 'rgba(239,68,68,0.85)' : channel === 'g' ? 'rgba(34,197,94,0.85)' : 'rgba(59,130,246,0.85)']];
    // Scaled to the second largest bar of all, so one spike does not flatten the rest.
    const all = chans.flatMap(([k]) => [...h[k]]).sort((a, b) => b - a);
    const top = Math.max(1, all[Math.min(all.length - 1, 3)]);
    g.globalCompositeOperation = channel === 'rgb' ? 'lighter' : 'source-over';
    for (const [k, color] of chans) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, height);
      for (let v = 0; v < 256; v++) g.lineTo(v + 0.5, height - Math.min(1, h[k][v] / top) * (height - 2));
      g.lineTo(256, height);
      g.closePath();
      g.fill();
    }
  }, [h, channel, height]);
  return <canvas ref={ref} className={cx('block h-auto w-full rounded border border-line bg-bg-1', className)} style={{ aspectRatio: `256 / ${height}`, imageRendering: 'auto' }} />;
}

export function HistogramPanel({ ed }: { ed: PictureEd }) {
  useEd(ed);
  const h = useHistogram(ed);
  const [ch, setCh] = useState<'rgb' | 'l' | 'r' | 'g' | 'b'>('rgb');
  const stats = useMemo(() => {
    if (!h || !h.count) return null;
    let sum = 0;
    let half = 0;
    let median = 0;
    for (let v = 0; v < 256; v++) sum += v * h.l[v];
    for (let v = 0; v < 256; v++) {
      half += h.l[v];
      if (half >= h.count / 2) {
        median = v;
        break;
      }
    }
    return { mean: Math.round(sum / h.count), median };
  }, [h]);
  return (
    <div className="space-y-2 p-3">
      <Seg value={ch} options={[{ value: 'rgb', label: 'RGB' }, { value: 'l', label: 'Light', title: 'Luminosity' }, { value: 'r', label: 'R' }, { value: 'g', label: 'G' }, { value: 'b', label: 'B' }]} onChange={setCh} />
      <HistogramGraph h={h} channel={ch} />
      {stats && (
        <div className="flex gap-4 text-[11.5px] text-fg-3 tnum">
          <span>Mean {stats.mean}</span>
          <span>Median {stats.median}</span>
        </div>
      )}
    </div>
  );
}

// ---- Colour ----------------------------------------------------------------------------------------------------------

export function ColourPanel({ ed }: { ed: PictureEd }) {
  useEd(ed);
  const [which, setWhich] = useState<'fg' | 'bg'>('fg');
  const value = which === 'fg' ? ed.fg : ed.bg;
  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center gap-2 px-1.5">
        <Seg value={which} options={[{ value: 'fg', label: 'Foreground' }, { value: 'bg', label: 'Background' }]} onChange={setWhich} />
        <IconButton label="Swap the colours (X)" size="sm" onClick={() => ed.swapColors()}>
          <ArrowDown size={13} className="rotate-90" />
        </IconButton>
      </div>
      <ColorPicker value={value} onChange={(c, done) => (which === 'fg' ? ed.setFg(c, done) : ed.setBg(c, done))} swatches={[...ed.recent, ...['#000000', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'].filter((x) => !ed.recent.includes(x))].slice(0, 14)} />
    </div>
  );
}
