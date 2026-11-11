// The Adjustments panel: everything a look can do, in folding sections (Light, Colour, Curves, Levels, Hue and
// saturation by colour range, Colour balance, Detail, Effects, Looks), changing the picked adjustment layer, or, when
// another layer is picked, a new one made over it the moment anything is moved (its mask the selection, as Photoshop
// makes adjustment layers). Auto enhance is one click. Curves has a point for each place the line bends (dragged; a click
// on the line adds one, a double click takes it away), for RGB or one channel, over the picture's histogram; Levels has
// the input's black, grey and white and the output's black and white, over the histogram, with Auto.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { ADJUSTMENTS, applyLook, autoLevels, curveTable, FILTERS, HSL_RANGES, TONES, type AdjustKey, type Channel, type CurvePoints, type FilterId, type LevelsOne, type LookSettings, type Tone } from '@shared/mediaedit';
import { cx } from '../../../components/ui';
import { Check, Section, Seg, SliderRow } from '../shell';
import { renderDoc } from './compose';
import { canvasOf, indexOf } from './doc';
import type { PictureEd } from './editor';
import { HistogramGraph, useHistogram } from './panels';
import { useEd } from './View';

const ADJ = Object.fromEntries(ADJUSTMENTS.map((a) => [a.id, a])) as Record<AdjustKey, (typeof ADJUSTMENTS)[number]>;
const GROUPS: { id: string; title: string; keys: AdjustKey[] }[] = [
  { id: 'light', title: 'Light and shadow', keys: ['exposure', 'brightness', 'contrast', 'highlights', 'shadows'] },
  { id: 'colour', title: 'Colour', keys: ['saturation', 'vibrance', 'warmth', 'tint'] },
];
const DETAIL: AdjustKey[] = ['clarity', 'dehaze', 'sharpness', 'noise', 'blur'];

const HUE_SWATCH: Record<string, string> = { reds: '#ef4444', oranges: '#f97316', yellows: '#eab308', greens: '#22c55e', aquas: '#06b6d4', blues: '#3b82f6', purples: '#8b5cf6', magentas: '#d946ef' };

const btn = 'inline-flex h-7 items-center gap-1.5 rounded-md bg-bg-2 px-2.5 text-[12px] text-fg ring-1 ring-line-2 hover:bg-bg-3 disabled:opacity-45';

export function AdjustPanel({ ed }: { ed: PictureEd }) {
  useEd(ed);
  const t = ed.lookTarget();
  const look: LookSettings = t?.look ?? {};
  const a = look.adjust ?? {};
  const below = t ? ed.doc.layers[indexOf(ed.doc, t.id) - 1]?.id : ed.doc.active ?? undefined;
  const hist = useHistogram(ed, below);
  const set = (f: (l: LookSettings) => LookSettings, done: boolean, label = 'Adjust') => ed.look(f, done, label);
  const adj = (k: AdjustKey, v: number, done: boolean) =>
    set((l) => {
      const n = { ...(l.adjust ?? {}), [k]: v };
      if (!v) delete n[k];
      return { ...l, adjust: Object.keys(n).length ? n : undefined };
    }, done);
  const sig = (id: string) => (ed.adjustAsk?.section === id ? ed.adjustAsk.n : undefined);
  // A menu that names one setting (Posterize…, Threshold…): the section opens, that setting scrolls into view and shows with a ring a moment.
  const root = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const asked = ed.adjustAsk;
  useEffect(() => {
    if (!asked?.field) return;
    const field = asked.field;
    const id = window.setTimeout(() => {
      root.current?.querySelector(`[data-adjust-field="${field}"]`)?.scrollIntoView({ block: 'nearest' });
      setFlash(field);
    }, 120);
    const off = window.setTimeout(() => setFlash(null), 1800);
    return () => (window.clearTimeout(id), window.clearTimeout(off));
  }, [asked?.n, asked?.field]);
  const field = (id: string, node: ReactNode) => (
    <div data-adjust-field={id} className={cx('rounded-md transition-shadow', flash === id && 'shadow-[0_0_0_2px_var(--accent)]')}>
      {node}
    </div>
  );
  const slider = (k: AdjustKey) => <SliderRow key={k} label={ADJ[k].label} value={a[k] ?? 0} min={ADJ[k].min} max={100} onChange={(v, done) => adj(k, v, done)} />;
  return (
    <div ref={root} className="pb-2 text-[12.5px]">
      <div className="space-y-2 border-b border-line px-3 py-2.5">
        <p className="text-[12px] leading-snug text-fg-3">
          {t ? (
            <>
              Changes <span translate="no" className="text-fg-2">{t.name}</span>, {t.clip ? 'only on the layer under it' : 'on everything under it'}
              {t.mask ? ', inside the selection it was made with' : ''}.
            </>
          ) : ed.doc.sel ? (
            'Moving anything here makes an adjustment layer over the picked layer, inside the selection.'
          ) : (
            'Moving anything here makes an adjustment layer over the picked layer: hide it, or lower its opacity, to compare.'
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn} onClick={() => ed.autoEnhance()}>
            <Wand2 size={13} />
            Auto enhance
          </button>
          <button type="button" className={btn} onClick={() => ed.newAdjustment()}>
            <Sparkles size={13} />
            New adjustment layer
          </button>
          {t && (
            <button type="button" className={btn} onClick={() => ed.setLook(t.id, {}, true, 'Put them all back')}>
              <RotateCcw size={13} />
              Put them all back
            </button>
          )}
        </div>
        {t && (
          <Check on={t.clip} onChange={(v) => ed.setLayer(t.id, { clip: v }, v ? 'Clip to the layer below' : 'Unclip')}>
            Only the layer under it
          </Check>
        )}
      </div>
      {GROUPS.map((g) => (
        <Section key={g.id} id={`picture.adjust.${g.id}`} title={g.title} openSignal={sig(g.id)}>
          {g.keys.map(slider)}
        </Section>
      ))}
      <Section id="picture.adjust.curves" openSignal={sig('curves')} title="Curves" defaultOpen={false}>
        <Curves ed={ed} look={look} hist={hist} onChange={(curves, done) => set((l) => ({ ...l, curves }), done, 'Curves')} />
      </Section>
      <Section id="picture.adjust.levels" openSignal={sig('levels')} title="Levels" defaultOpen={false}>
        <Levels look={look} hist={hist} onChange={(levels, done) => set((l) => ({ ...l, levels }), done, 'Levels')} />
      </Section>
      <Section id="picture.adjust.hsl" openSignal={sig('hsl')} title="Hue, saturation and lightness" defaultOpen={false}>
        <HslEditor look={look} onChange={(hsl, done) => set((l) => ({ ...l, hsl }), done, 'Hue and saturation')} />
      </Section>
      <Section id="picture.adjust.balance" openSignal={sig('balance')} title="Colour balance" defaultOpen={false}>
        <BalanceEditor look={look} onChange={(balance, done) => set((l) => ({ ...l, balance }), done, 'Colour balance')} />
      </Section>
      <Section id="picture.adjust.detail" openSignal={sig('detail')} title="Detail" defaultOpen={false}>
        {DETAIL.map(slider)}
      </Section>
      <Section id="picture.adjust.effects" openSignal={sig('effects')} title="Effects" defaultOpen={false}>
        {slider('vignette')}
        {slider('grain')}
        <Check on={!!look.invert} onChange={(v) => set((l) => ({ ...l, invert: v || undefined }), true, 'Invert')}>
          Invert (a negative)
        </Check>
        {field('posterize', <SliderRow label="Posterize (levels)" value={look.posterize ?? 0} min={0} max={32} hint="Only this many levels of each colour: flat bands, as a poster (0: off)" onChange={(v, done) => set((l) => ({ ...l, posterize: v >= 2 ? v : undefined }), done, 'Posterize')} />)}
        {field('threshold', <SliderRow label="Threshold" value={look.threshold ?? 0} min={0} max={255} hint="Pure black and white: lighter than this becomes white (0: off)" onChange={(v, done) => set((l) => ({ ...l, threshold: v || undefined }), done, 'Threshold')} />)}
      </Section>
      <Section id="picture.adjust.looks" openSignal={sig('looks')} title="Looks" defaultOpen={false}>
        <Looks ed={ed} look={look} onPick={(id) => set((l) => ({ ...l, filter: id ? { id } : undefined }), true, 'Look')} onStrength={(v, done) => set((l) => (l.filter ? { ...l, filter: v >= 100 ? { id: l.filter.id } : { id: l.filter.id, strength: v } } : l), done, 'Look')} />
      </Section>
    </div>
  );
}

// ---- Curves ----------------------------------------------------------------------------------------------------------

const CH_OPTS: { value: Channel; label: string }[] = [
  { value: 'rgb', label: 'RGB' },
  { value: 'r', label: 'R' },
  { value: 'g', label: 'G' },
  { value: 'b', label: 'B' },
];
const LINE_COLOR: Record<Channel, string> = { rgb: 'var(--fg)', r: '#ef4444', g: '#22c55e', b: '#3b82f6' };

function Curves({ look, hist, onChange }: { ed: PictureEd; look: LookSettings; hist: ReturnType<typeof useHistogram>; onChange: (c: LookSettings['curves'], done: boolean) => void }) {
  const [ch, setCh] = useState<Channel>('rgb');
  const pts: CurvePoints = look.curves?.[ch] ?? [
    [0, 0],
    [255, 255],
  ];
  const box = useRef<SVGSVGElement>(null);
  const drag = useRef<{ i: number } | null>(null);
  const table = useMemo(() => curveTable(pts), [pts]);
  const put = (p: CurvePoints, done: boolean) => {
    const c = { ...(look.curves ?? {}) };
    const straight = p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 255 && p[1][1] === 255;
    if (straight) delete c[ch];
    else c[ch] = p;
    onChange(Object.keys(c).length ? c : undefined, done);
  };
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(255, ((e.clientX - r.left) / r.width) * 255))), Math.round(Math.max(0, Math.min(255, (1 - (e.clientY - r.top) / r.height) * 255)))];
  };
  const path = useMemo(() => {
    let d = '';
    for (let x = 0; x < 256; x += 2) d += `${x ? 'L' : 'M'}${x} ${255 - table[x]}`;
    return `${d}L255 ${255 - table[255]}`;
  }, [table]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Seg value={ch} options={CH_OPTS} onChange={setCh} />
        <span className="flex-1" />
        <button type="button" className="text-[12px] text-fg-3 hover:text-fg" onClick={() => put([[0, 0], [255, 255]], true)}>
          Straight
        </button>
      </div>
      <div className="relative">
        <HistogramGraph h={hist} channel={ch === 'rgb' ? 'l' : ch} height={256} className="opacity-60" />
        <svg
          ref={box}
          viewBox="0 0 255 255"
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none overflow-visible"
          onPointerDown={(e) => {
            const p = at(e);
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            const near = pts.findIndex(([x, y]) => Math.abs(x - p[0]) < 10 && Math.abs(y - p[1]) < 14);
            if (near >= 0) {
              drag.current = { i: near };
              return;
            }
            // A click on the line: a point there (at most 14).
            if (pts.length >= 14) return;
            const next = [...pts, [p[0], table[p[0]]] as [number, number]].sort((a, b) => a[0] - b[0]);
            drag.current = { i: next.findIndex((q) => q[0] === p[0]) };
            put(next, false);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const p = at(e);
            const next = pts.map((q) => [...q] as [number, number]);
            const lo = d.i > 0 ? next[d.i - 1][0] + 1 : 0;
            const hi = d.i < next.length - 1 ? next[d.i + 1][0] - 1 : 255;
            next[d.i] = [Math.max(lo, Math.min(hi, p[0])), p[1]];
            put(next, false);
          }}
          onPointerUp={() => {
            if (drag.current) put(pts, true);
            drag.current = null;
          }}
          onDoubleClick={(e) => {
            const p = at(e);
            const i = pts.findIndex(([x, y]) => Math.abs(x - p[0]) < 10 && Math.abs(y - p[1]) < 14);
            if (i > 0 && i < pts.length - 1) put(pts.filter((_, j) => j !== i), true);
          }}
        >
          {[64, 128, 192].map((v) => (
            <g key={v} stroke="var(--line)" strokeWidth={0.6}>
              <line x1={v} y1={0} x2={v} y2={255} />
              <line x1={0} y1={v} x2={255} y2={v} />
            </g>
          ))}
          <line x1={0} y1={255} x2={255} y2={0} stroke="var(--line-2)" strokeWidth={0.6} strokeDasharray="3 3" />
          <path d={path} fill="none" stroke={LINE_COLOR[ch]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={255 - y} r={4.5} fill="var(--panel)" stroke={LINE_COLOR[ch]} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <p className="text-[11.5px] leading-snug text-fg-3">Drag a point; a click on the line adds one, a double click takes it away. Up lightens, down darkens; an S shape adds contrast.</p>
    </div>
  );
}

// ---- Levels ----------------------------------------------------------------------------------------------------------

function Levels({ look, hist, onChange }: { look: LookSettings; hist: ReturnType<typeof useHistogram>; onChange: (l: LookSettings['levels'], done: boolean) => void }) {
  const [ch, setCh] = useState<Channel>('rgb');
  const l: LevelsOne = look.levels?.[ch] ?? {};
  const black = l.black ?? 0;
  const white = l.white ?? 255;
  const gamma = l.gamma ?? 1;
  const put = (p: Partial<LevelsOne>, done: boolean) => {
    const next = { ...l, ...p };
    const clean: LevelsOne = {};
    if (next.black) clean.black = next.black;
    if (next.white !== undefined && next.white !== 255) clean.white = next.white;
    if (next.gamma !== undefined && Math.abs(next.gamma - 1) > 0.005) clean.gamma = Math.round(next.gamma * 100) / 100;
    if (next.outBlack) clean.outBlack = next.outBlack;
    if (next.outWhite !== undefined && next.outWhite !== 255) clean.outWhite = next.outWhite;
    const all = { ...(look.levels ?? {}) };
    if (Object.keys(clean).length) all[ch] = clean;
    else delete all[ch];
    onChange(Object.keys(all).length ? all : undefined, done);
  };
  // The grey's place between black and white, as Photoshop shows it.
  const greyAt = black + (white - black) * Math.pow(0.5, gamma);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Seg value={ch} options={CH_OPTS} onChange={setCh} />
        <span className="flex-1" />
        <button
          type="button"
          className="text-[12px] text-fg-3 hover:text-fg"
          onClick={() => {
            if (!hist) return;
            const auto = autoLevels(hist);
            onChange(Object.keys(auto).length ? { ...(look.levels ?? {}), ...auto } : look.levels, true);
          }}
        >
          Auto
        </button>
      </div>
      <HistogramGraph h={hist} channel={ch === 'rgb' ? 'l' : ch} height={80} />
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: 'linear-gradient(to right, #000, #fff)' }} />
        <Thumb at={black} color="#000" label="Black" onChange={(v, done) => put({ black: Math.min(v, white - 2) }, done)} />
        <Thumb at={greyAt} color="#808080" label="Grey" onChange={(v, done) => put({ gamma: Math.max(0.1, Math.min(9.99, Math.log((Math.min(white - 1, Math.max(black + 1, v)) - black) / (white - black)) / Math.log(0.5))) }, done)} />
        <Thumb at={white} color="#fff" label="White" onChange={(v, done) => put({ white: Math.max(v, black + 2) }, done)} />
      </div>
      <SliderRow label="Grey (gamma)" value={Math.round(gamma * 100) / 100} min={0.1} max={4} step={0.01} zero={1} onChange={(v, done) => put({ gamma: v }, done)} />
      <div className="flex items-center gap-2 text-[12px] text-fg-3">Output</div>
      <SliderRow label="Darkest" value={l.outBlack ?? 0} min={0} max={255} onChange={(v, done) => put({ outBlack: v }, done)} />
      <SliderRow label="Lightest" value={l.outWhite ?? 255} min={0} max={255} zero={255} onChange={(v, done) => put({ outWhite: v }, done)} />
    </div>
  );
}

/** A triangle under the histogram, dragged along it (0 to 255). */
function Thumb({ at, color, label, onChange }: { at: number; color: string; label: string; onChange: (v: number, done: boolean) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const val = (e: { clientX: number }) => {
    const r = ref.current!.parentElement!.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(255, ((e.clientX - r.left) / r.width) * 255)));
  };
  return (
    <span
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(at)}
      title={`${label}: ${Math.round(at)}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId) && onChange(val(e), false)}
      onPointerUp={(e) => onChange(val(e), true)}
      className="absolute top-0 h-5 w-3.5 -translate-x-1/2 cursor-ew-resize touch-none"
      style={{ left: `${(at / 255) * 100}%` }}
    >
      <span className="absolute bottom-0 left-0 h-0 w-0 border-x-[7px] border-b-[11px] border-x-transparent" style={{ borderBottomColor: color, filter: 'drop-shadow(0 0 1px rgba(127,127,127,0.9))' }} />
    </span>
  );
}

// ---- Hue, saturation and lightness ---------------------------------------------------------------------------------

function HslEditor({ look, onChange }: { look: LookSettings; onChange: (h: LookSettings['hsl'], done: boolean) => void }) {
  const [range, setRange] = useState<string>('all');
  const v = (look.hsl as Record<string, { h?: number; s?: number; l?: number }> | undefined)?.[range] ?? {};
  const put = (k: 'h' | 's' | 'l', n: number, done: boolean) => {
    const all = { ...(look.hsl ?? {}) } as Record<string, { h?: number; s?: number; l?: number }>;
    const one = { ...(all[range] ?? {}), [k]: n };
    if (!n) delete one[k];
    if (Object.keys(one).length) all[range] = one;
    else delete all[range];
    onChange(Object.keys(all).length ? (all as LookSettings['hsl']) : undefined, done);
  };
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1">
        <button type="button" aria-pressed={range === 'all'} onClick={() => setRange('all')} className={cx('h-6 rounded-md px-2 text-[12px]', range === 'all' ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'bg-bg-2 text-fg-2 hover:text-fg')}>
          All
        </button>
        {HSL_RANGES.map((r) => (
          <button key={r.id} type="button" title={r.label} aria-label={r.label} aria-pressed={range === r.id} onClick={() => setRange(r.id)} className={cx('h-6 w-6 rounded-md border', range === r.id ? 'ring-2 ring-accent ring-offset-1 ring-offset-panel' : 'border-black/15')} style={{ background: HUE_SWATCH[r.id] }} />
        ))}
      </div>
      <p className="text-[11.5px] text-fg-3">{range === 'all' ? 'Everything' : HSL_RANGES.find((r) => r.id === range)?.label}</p>
      <SliderRow label="Hue" value={v.h ?? 0} min={-100} max={100} onChange={(n, done) => put('h', n, done)} />
      <SliderRow label="Saturation" value={v.s ?? 0} min={-100} max={100} onChange={(n, done) => put('s', n, done)} />
      <SliderRow label="Lightness" value={v.l ?? 0} min={-100} max={100} onChange={(n, done) => put('l', n, done)} />
    </div>
  );
}

// ---- Colour balance --------------------------------------------------------------------------------------------------

function BalanceEditor({ look, onChange }: { look: LookSettings; onChange: (b: LookSettings['balance'], done: boolean) => void }) {
  const [tone, setTone] = useState<Tone>('midtones');
  const b = look.balance ?? {};
  const v = b[tone] ?? [0, 0, 0];
  const put = (i: number, n: number, done: boolean) => {
    const three = [...v] as [number, number, number];
    three[i] = n;
    const next = { ...b, [tone]: three };
    if (three.every((x) => !x)) delete next[tone];
    const any = TONES.some((t) => next[t.id]);
    onChange(any ? { ...next, keepLight: b.keepLight !== false } : undefined, done);
  };
  return (
    <div className="space-y-2.5">
      <Seg value={tone} options={TONES.map((t) => ({ value: t.id, label: t.label }))} onChange={setTone} />
      <SliderRow label="Cyan – Red" value={v[0]} min={-100} max={100} onChange={(n, done) => put(0, n, done)} />
      <SliderRow label="Magenta – Green" value={v[1]} min={-100} max={100} onChange={(n, done) => put(1, n, done)} />
      <SliderRow label="Yellow – Blue" value={v[2]} min={-100} max={100} onChange={(n, done) => put(2, n, done)} />
      <Check on={b.keepLight !== false} onChange={(on) => look.balance && onChange({ ...look.balance, keepLight: on }, true)}>
        Keep the lightness
      </Check>
    </div>
  );
}

// ---- Looks (filters) --------------------------------------------------------------------------------------------------

function Looks({ ed, look, onPick, onStrength }: { ed: PictureEd; look: LookSettings; onPick: (id: FilterId | null) => void; onStrength: (v: number, done: boolean) => void }) {
  const pv = ed.pv;
  // Each look on a small square of the picture under the adjustment.
  const thumbs = useMemo(() => {
    const d = ed.doc;
    const k = Math.min(1, 96 / Math.min(d.w, d.h));
    const s = Math.min(d.w, d.h);
    const region = { x: Math.round((d.w - s) / 2), y: Math.round((d.h - s) / 2), w: s, h: s };
    const t = ed.lookTarget();
    const upTo = t ? d.layers[indexOf(d, t.id) - 1]?.id : undefined;
    const c = renderDoc(d, { region, scale: k, ...(upTo ? { upTo } : {}) });
    const src = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
    const make = (id: FilterId | null) => {
      const px = new Uint8ClampedArray(src.data);
      applyLook(px, c.width, c.height, {}, id ? { id } : null);
      const out = canvasOf(c.width, c.height);
      out.getContext('2d')!.putImageData(new ImageData(px, c.width, c.height), 0, 0);
      return out.toDataURL('image/jpeg', 0.85);
    };
    return { none: make(null), ...Object.fromEntries(FILTERS.map((f) => [f.id, make(f.id)])) } as Record<string, string>;
  }, [pv]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = look.filter?.id ?? null;
  const cell = (id: FilterId | null, label: string) => (
    <button key={id ?? 'none'} type="button" onClick={() => onPick(id)} aria-pressed={picked === id} className={cx('flex min-w-0 flex-col items-stretch gap-1 rounded-md p-1 text-[11.5px]', picked === id ? 'bg-accent-soft text-fg' : 'text-fg-2 hover:bg-bg-2')}>
      <span className={cx('block aspect-square overflow-hidden rounded border', picked === id ? 'border-accent' : 'border-line')}>
        <img src={thumbs[id ?? 'none']} alt="" draggable={false} className="h-full w-full object-cover" />
      </span>
      <span className="truncate text-center">{label}</span>
    </button>
  );
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-1">
        {cell(null, 'None')}
        {FILTERS.map((f) => cell(f.id, f.label))}
      </div>
      {picked && <SliderRow label="Strength" value={look.filter?.strength ?? 100} min={0} max={100} zero={100} onChange={onStrength} />}
    </div>
  );
}
