// The Colour page, as Resolve's (simpler): the clip being coloured picked from a strip of the main track's clips, the
// viewer large (before and after split by a line to drag), scopes read from what the viewer shows (a waveform of the
// brightness, a vectorscope of the colours, a histogram), the colour wheels (lift for the shadows, gamma for the
// midtones, gain for the highlights, offset for everything: a colour to push towards and a brightness), the primaries'
// sliders, curves for all three colours and each, looks shown on the clip's own frame with their strength, and the
// effects (vignette, sharpen, denoise, film grain). What it sets is the clip's grade (shared/video-grade.ts), made
// exactly so by the server.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Copy, RotateCcw, SquareSplitHorizontal } from 'lucide-react';
import { isStill, type VideoClip, type VideoFactsOf, type VideoRecipe } from '@shared/mediaedit-video';
import { curveFunction, GRADE_EFFECTS, GRADE_SLIDERS, gradeFunction, normalizeGrade, VIDEO_LOOKS, wheelPush, type VideoCurve, type VideoGrade, type VideoLookId, type VideoWheel } from '@shared/video-grade';
import { Button, cx } from '../../../components/ui';
import { playUrl, stripUrl } from './api';
import type { Engine } from './engine';
import { setClip, type Picked } from './model';
import { Choices, PanelHead, SliderField, Splitter, useRemembered } from './shell';
import type { Change } from './Timeline';

const NAMES: Record<string, string> = {
  exposure: 'Exposure',
  temperature: 'Temperature',
  tint: 'Tint',
  contrast: 'Contrast',
  brightness: 'Brightness',
  highlights: 'Highlights',
  shadows: 'Shadows',
  saturation: 'Saturation',
  vibrance: 'Vibrance',
  vignette: 'Vignette',
  sharpen: 'Sharpen',
  denoise: 'Denoise',
  grain: 'Film grain',
  lift: 'Lift (shadows)',
  gamma: 'Gamma (midtones)',
  gain: 'Gain (highlights)',
  offset: 'Offset (everything)',
};

export interface ColourProps {
  recipe: VideoRecipe;
  factsOf: VideoFactsOf;
  engine: Engine;
  change: Change;
  picked: Picked;
  onPick(p: Picked): void;
  main: string;
  viewer: ReactNode;
  /** The canvas the viewer draws the clip in (the scopes read it). */
  canvas: () => HTMLCanvasElement | null;
  split: number | null;
  onSplit(s: number | null): void;
}

export function ColourPage(p: ColourProps) {
  const clips = p.recipe.clips ?? [];
  const clip = (p.picked?.kind === 'clip' && clips.find((c) => c.id === p.picked!.id)) || null;
  const [scopesW, setScopesW] = useRemembered('colour.scopes', 300);
  const [bottomH, setBottomH] = useRemembered('colour.bottom', 300);
  const g = clip?.grade ?? {};
  const setGrade = (next: VideoGrade) => clip && p.change((r) => setClip(r, clip.id!, (c) => ({ ...c, grade: normalizeGrade(next) })));
  const set = (k: string, v: unknown) => setGrade({ ...g, [k]: v });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ClipStrip {...p} />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">{p.viewer}</div>
        <Splitter dir="x" size={scopesW} onSize={setScopesW} min={220} max={520} side="after" />
        <div className="flex shrink-0 flex-col bg-panel" style={{ width: scopesW }}>
          <Scopes canvas={p.canvas} engine={p.engine} />
        </div>
      </div>
      <Splitter dir="y" size={bottomH} onSize={setBottomH} min={180} max={520} side="after" />
      <div className="flex shrink-0 flex-col bg-panel" style={{ height: bottomH }}>
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg-2" translate="no">
            {clip ? `Colour of ${clip.name ?? 'the clip'}` : 'Pick a clip above to colour it'}
          </span>
          <Button size="sm" variant={p.split !== null ? 'subtle' : 'ghost'} icon={<SquareSplitHorizontal size={13} />} onClick={() => p.onSplit(p.split === null ? 0.5 : null)}>
            Before and after
          </Button>
          <Button size="sm" variant="ghost" icon={<Copy size={13} />} disabled={!clip?.grade} onClick={() => clip && p.change((r) => ({ ...r, clips: (r.clips ?? []).map((c) => ({ ...c, grade: clip.grade })) }))}>
            Use on every clip
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} disabled={!clip?.grade} onClick={() => setGrade({})}>
            Reset the colour
          </Button>
        </div>
        {clip ? (
          <div className="flex min-h-0 flex-1 gap-0 overflow-x-auto">
            <Section title="Wheels" className="min-w-[452px]">
              <div className="grid grid-cols-4 gap-3">
                {(['lift', 'gamma', 'gain', 'offset'] as const).map((k) => (
                  <Wheel key={k} label={NAMES[k]} w={g[k]} onChange={(w) => set(k, w)} change={p.change} />
                ))}
              </div>
            </Section>
            <Section title="Primaries" className="w-[240px]">
              {GRADE_SLIDERS.map((k) => (
                <SliderField key={k} label={NAMES[k]} value={Math.round((g[k] ?? 0) * 100)} min={-100} max={100} onChange={(v) => set(k, v / 100)} />
              ))}
            </Section>
            <Section title="Curves" className="w-[236px]">
              <Curves curves={g.curves} onChange={(c) => set('curves', c)} change={p.change} />
            </Section>
            <Section title="Looks" className="w-[300px]">
              <Looks {...p} clip={clip} g={g} onLook={(id) => setGrade({ ...g, look: id ?? undefined, lookStrength: id ? g.lookStrength : undefined })} />
              {g.look && <SliderField label="Strength" value={Math.round((g.lookStrength ?? 1) * 100)} min={0} max={100} zero={100} show={(v) => `${v}%`} onChange={(v) => set('lookStrength', v / 100)} />}
            </Section>
            <Section title="Effects" className="w-[220px]">
              {GRADE_EFFECTS.map((k) => (
                <SliderField key={k} label={NAMES[k]} value={Math.round((g[k] ?? 0) * 100)} min={0} max={100} show={(v) => `${v}%`} onChange={(v) => set(k, v / 100)} />
              ))}
              <p className="text-[11px] leading-snug text-fg-3">Denoise shows only roughly here; the saved video has it exactly.</p>
            </Section>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12.5px] text-fg-3">Pick the clip to colour in the strip above, or on the timeline.</div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex shrink-0 flex-col border-r border-line', className)}>
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{title}</div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">{children}</div>
    </section>
  );
}

/** The main track's clips, to pick the one being coloured. */
function ClipStrip(p: ColourProps) {
  const clips = p.recipe.clips ?? [];
  return (
    <div className="flex h-[74px] shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-bg px-2">
      {clips.map((c, i) => {
        const f = p.factsOf(c.src);
        const src = c.src ?? p.main;
        const [a, b] = c.trim ?? [0, f?.duration ?? 0];
        const thumb = c.picture || f?.picture ? playUrl(src) : stripUrl(src, 1, 96, c.still ?? (a + b) / 2, (c.still ?? (a + b) / 2) + 0.1);
        const on = p.picked?.kind === 'clip' && p.picked.id === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              p.onPick({ kind: 'clip', id: c.id! });
              p.engine.seek(p.engine.spans[i]?.start + Math.min(0.5, (p.engine.spans[i]?.length ?? 1) / 2));
            }}
            className={cx('relative h-[56px] w-[100px] shrink-0 overflow-hidden rounded-md border-2', on ? 'border-accent' : 'border-transparent hover:border-line-2')}
            title={c.name}
          >
            <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
            <span className="tnum absolute top-0.5 left-0.5 rounded bg-black/60 px-1 text-[9.5px] text-white">{i + 1}</span>
            {c.grade && <span className="absolute right-0.5 bottom-0.5 h-2 w-2 rounded-full bg-accent ring-1 ring-black/40" title="Coloured" />}
          </button>
        );
      })}
    </div>
  );
}

// ---- a colour wheel ---------------------------------------------------------------------------------------------------

/** The hue wheel: red to the right, green up and to the left, blue down and to the left, as wheelPush reads it. */
const HUES = 'conic-gradient(from 90deg, #ff0000, #ff00ff 60deg, #0000ff 120deg, #00ffff 180deg, #00ff00 240deg, #ffff00 300deg, #ff0000 360deg)';

function Wheel({ label, w, onChange, change }: { label: string; w?: VideoWheel; onChange: (w: VideoWheel | undefined) => void; change: Change }) {
  const size = 96;
  const R = size / 2 - 6;
  const x = w?.x ?? 0;
  const y = w?.y ?? 0;
  const ref = useRef<HTMLDivElement>(null);
  const push = wheelPush({ x, y });
  const drag = (e: React.PointerEvent) => {
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    change.begin();
    const at = (ev: { clientX: number; clientY: number; shiftKey: boolean }, from?: { x: number; y: number; px: number; py: number }) => {
      const b = el.getBoundingClientRect();
      let nx = (ev.clientX - b.left - b.width / 2) / R;
      let ny = -(ev.clientY - b.top - b.height / 2) / R;
      if (from && ev.shiftKey) {
        nx = from.x + ((ev.clientX - from.px) / R) * 0.25;
        ny = from.y - ((ev.clientY - from.py) / R) * 0.25;
      }
      const d = Math.hypot(nx, ny);
      if (d > 1) [nx, ny] = [nx / d, ny / d];
      onChange({ x: Math.round(nx * 1000) / 1000, y: Math.round(ny * 1000) / 1000, level: w?.level ?? 0 });
    };
    const from = { x, y, px: e.clientX, py: e.clientY };
    if (!e.shiftKey) at(e);
    const mv = (ev: PointerEvent) => at(ev, from);
    const up = () => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', up);
      change.end();
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <div className="text-[11.5px] text-fg-2">{label}</div>
      <div
        ref={ref}
        className="relative shrink-0 cursor-crosshair rounded-full ring-1 ring-line-2"
        style={{ width: size, height: size, background: `radial-gradient(circle, #808080 0%, rgba(128,128,128,0.65) 35%, rgba(128,128,128,0) 72%), ${HUES}`, touchAction: 'none' }}
        onPointerDown={drag}
        onDoubleClick={() => onChange(w?.level ? { x: 0, y: 0, level: w.level } : undefined)}
        title="Drag towards a colour (Shift: finer); double-click to centre it"
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-full w-px -translate-x-1/2 -translate-y-1/2 bg-black/15" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-px w-full -translate-x-1/2 -translate-y-1/2 bg-black/15" />
        <div className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: size / 2 + x * R, top: size / 2 - y * R }} />
      </div>
      <div className="tnum text-[10.5px] text-fg-3">{`R ${fmt(push[0])}  G ${fmt(push[1])}  B ${fmt(push[2])}`}</div>
      <div className="w-full">
        <SliderField label="Level" value={Math.round((w?.level ?? 0) * 100)} min={-100} max={100} onChange={(v) => onChange(v || x || y ? { x, y, level: v / 100 } : undefined)} />
      </div>
    </div>
  );
}
const fmt = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);

// ---- curves -------------------------------------------------------------------------------------------------------------

const CHANNELS = [
  { id: 'master', label: 'All', tone: 'text-fg' },
  { id: 'r', label: 'Red', tone: 'text-err' },
  { id: 'g', label: 'Green', tone: 'text-ok' },
  { id: 'b', label: 'Blue', tone: 'text-info' },
] as const;

function Curves({ curves, onChange, change }: { curves?: VideoGrade['curves']; onChange: (c: VideoGrade['curves']) => void; change: Change }) {
  const [ch, setCh] = useState<(typeof CHANNELS)[number]['id']>('master');
  const pts: VideoCurve = curves?.[ch] ?? [
    [0, 0],
    [1, 1],
  ];
  const f = useMemo(() => curveFunction(pts), [pts]);
  const S = 200;
  const svg = useRef<SVGSVGElement>(null);
  const setPts = (next: VideoCurve) => onChange({ ...curves, [ch]: next });
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const b = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, 1 - (e.clientY - b.top) / b.height))];
  };
  const dragPoint = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    change.begin();
    const mv = (ev: PointerEvent) => {
      const [x, y] = at(ev);
      const next = pts.map((q, j) => (j === i ? ([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number]) : q));
      next.sort((a, b) => a[0] - b[0]);
      setPts(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      change.end();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const path = useMemo(() => Array.from({ length: 65 }, (_, i) => `${i ? 'L' : 'M'}${((i / 64) * S).toFixed(1)},${((1 - f(i / 64)) * S).toFixed(1)}`).join(''), [f]);
  const tone = CHANNELS.find((c) => c.id === ch)!.tone;
  return (
    <div className="space-y-1.5">
      <Choices<string> value={ch} onChange={(v) => setCh(v as typeof ch)} options={CHANNELS.map((c) => ({ value: c.id, label: c.label }))} />
      <svg
        ref={svg}
        viewBox={`0 0 ${S} ${S}`}
        className="block aspect-square w-full cursor-crosshair rounded-md bg-bg-1 ring-1 ring-line"
        onPointerDown={(e) => {
          const [x, y] = at(e);
          const next = [...pts, [Math.round(x * 1000) / 1000, Math.round(f(x) * 1000) / 1000] as [number, number]].sort((a, b) => a[0] - b[0]);
          setPts(next);
          void y;
        }}
      >
        {[0.25, 0.5, 0.75].map((v) => (
          <g key={v} className="stroke-line">
            <line x1={v * S} y1={0} x2={v * S} y2={S} strokeWidth={1} />
            <line x1={0} y1={v * S} x2={S} y2={v * S} strokeWidth={1} />
          </g>
        ))}
        <line x1={0} y1={S} x2={S} y2={0} className="stroke-line-2" strokeDasharray="3 3" strokeWidth={1} />
        <path d={path} fill="none" strokeWidth={2} className={cx('stroke-current', tone)} />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x * S} cy={(1 - y) * S} r={5} className={cx('cursor-grab fill-bg stroke-current', tone)} strokeWidth={2} onPointerDown={dragPoint(i)} onDoubleClick={(e) => (e.stopPropagation(), setPts(pts.filter((_, j) => j !== i)))} />
        ))}
      </svg>
      <p className="text-[11px] leading-snug text-fg-3">Click to add a point, drag it, double-click to take it away.</p>
    </div>
  );
}

// ---- looks ------------------------------------------------------------------------------------------------------------

/** The clip's own frame, small, as each look makes it. */
function Looks({ engine, clip, factsOf, g, onLook }: ColourProps & { clip: VideoClip; g: VideoGrade; onLook: (id: VideoLookId | null) => void }) {
  const [sample, setSample] = useState<ImageData | null>(null);
  useEffect(() => {
    const f = factsOf(clip.src);
    const src: CanvasImageSource | null = clip.picture || f?.picture ? engine.image(clip.src) : isStill(clip) || true ? (engine.element(`c:${clip.id}`, clip.src, 'video') as HTMLVideoElement) : null;
    const take = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 80;
        c.height = 45;
        const x = c.getContext('2d', { willReadFrequently: true })!;
        x.drawImage(src as CanvasImageSource, 0, 0, 80, 45);
        setSample(x.getImageData(0, 0, 80, 45));
      } catch {}
    };
    const t = setTimeout(take, 120);
    return () => clearTimeout(t);
  }, [clip.id, clip.src, clip.picture, engine, factsOf, clip]);
  const base = useMemo(() => {
    const { look: _l, lookStrength: _s, ...rest } = g;
    return rest;
  }, [g]);
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <LookTile label="None" on={!g.look} sample={sample} grade={base} onClick={() => onLook(null)} />
      {VIDEO_LOOKS.map((l) => (
        <LookTile key={l.id} label={l.label} on={g.look === l.id} sample={sample} grade={{ ...base, look: l.id }} onClick={() => onLook(l.id)} />
      ))}
    </div>
  );
}

function LookTile({ label, on, sample, grade, onClick }: { label: string; on: boolean; sample: ImageData | null; grade: VideoGrade; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !sample) return;
    const fn = gradeFunction(grade);
    const out = new ImageData(sample.width, sample.height);
    const d = sample.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g2, b] = fn(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      out.data[i] = r * 255;
      out.data[i + 1] = g2 * 255;
      out.data[i + 2] = b * 255;
      out.data[i + 3] = 255;
    }
    c.getContext('2d')!.putImageData(out, 0, 0);
  }, [sample, grade]);
  return (
    <button type="button" onClick={onClick} title={label} className={cx('min-w-0 overflow-hidden rounded-md border-2 text-left', on ? 'border-accent' : 'border-transparent hover:border-line-2')}>
      <canvas ref={ref} width={80} height={45} className="block aspect-video w-full bg-bg-3" />
      <span className="block truncate px-1 py-0.5 text-[10.5px] text-fg-2">{label}</span>
    </button>
  );
}

// ---- scopes -----------------------------------------------------------------------------------------------------------

type ScopeKind = 'waveform' | 'vector' | 'histogram';

/** Scopes of what the viewer shows, a few times a second while it plays and when it moves. */
function Scopes({ canvas, engine }: { canvas: () => HTMLCanvasElement | null; engine: Engine }) {
  const [kinds, setKinds] = useRemembered<ScopeKind[]>('colour.scopeKinds', ['waveform', 'vector', 'histogram']);
  const refs = { waveform: useRef<HTMLCanvasElement>(null), vector: useRef<HTMLCanvasElement>(null), histogram: useRef<HTMLCanvasElement>(null) };
  const work = useRef<HTMLCanvasElement | null>(null);
  const last = useRef(0);
  const draw = useCallback(() => {
    const now = performance.now();
    if (now - last.current < 160) return;
    last.current = now;
    const src = canvas();
    if (!src || !src.width) return;
    const W = 256;
    // A square sample: the scopes care for how many pixels have each value, not the picture's shape.
    const H = 256;
    const wk = (work.current ??= document.createElement('canvas'));
    wk.width = W;
    wk.height = H;
    const x = wk.getContext('2d', { willReadFrequently: true })!;
    try {
      x.drawImage(src, 0, 0, W, H);
    } catch {
      return;
    }
    const px = x.getImageData(0, 0, W, H).data;
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#e9edf5';
    for (const k of kinds) {
      const cv = refs[k].current;
      if (cv) paintScope(k, cv, px, W, H, fg);
    }
  }, [canvas, kinds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => engine.onFrame(draw), [engine, draw]);
  useEffect(() => {
    const t = window.setInterval(draw, 500);
    return () => window.clearInterval(t);
  }, [draw]);
  const toggle = (k: ScopeKind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  return (
    <>
      <PanelHead title="Scopes">
        {(['waveform', 'vector', 'histogram'] as const).map((k) => (
          <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={kinds.includes(k)} className={cx('h-6 rounded px-1.5 text-[11px]', kinds.includes(k) ? 'bg-accent-soft text-accent' : 'text-fg-3 hover:text-fg')}>
            {k === 'waveform' ? 'Waveform' : k === 'vector' ? 'Vectorscope' : 'Histogram'}
          </button>
        ))}
      </PanelHead>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {(['waveform', 'vector', 'histogram'] as const)
          .filter((k) => kinds.includes(k))
          .map((k) => (
            <div key={k} className="overflow-hidden rounded-md bg-black ring-1 ring-line">
              <canvas ref={refs[k]} width={256} height={k === 'vector' ? 256 : 128} className={cx('block w-full', k === 'vector' && 'mx-auto max-w-[240px]')} />
            </div>
          ))}
      </div>
    </>
  );
}

/** A CSS colour ("#e9edf5", "rgb(…)") as red, green and blue. */
function rgbOf(c: string): [number, number, number] {
  const h = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (h) return [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4, 6), 16)];
  const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(c);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [230, 236, 245];
}

/** One scope of the picture's pixels (RGBA, `w`×`h`), drawn on `cv`. */
function paintScope(kind: ScopeKind, cv: HTMLCanvasElement, px: Uint8ClampedArray, w: number, h: number, fg: string) {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const img = g.createImageData(W, H);
  const out = img.data;
  const add = (x: number, y: number, r: number, gg: number, b: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    out[i] = Math.min(255, out[i] + r);
    out[i + 1] = Math.min(255, out[i + 1] + gg);
    out[i + 2] = Math.min(255, out[i + 2] + b);
    out[i + 3] = 255;
  };
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  if (kind === 'waveform') {
    const n = new Float32Array(W * H);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        n[(H - 1 - Math.floor((l / 255) * (H - 1))) * W + Math.floor((x / w) * W)]++;
      }
    const [fr, fgc, fb] = rgbOf(fg);
    for (let j = 0; j < n.length; j++) {
      if (!n[j]) continue;
      const v = Math.min(1, Math.log2(1 + n[j]) / 5);
      out[j * 4] = fr * v;
      out[j * 4 + 1] = fgc * v;
      out[j * 4 + 2] = fb * v;
    }
  } else if (kind === 'vector') {
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const gg = px[i + 1];
      const b = px[i + 2];
      const cb = -0.1146 * r - 0.3854 * gg + 0.5 * b;
      const cr = 0.5 * r - 0.4542 * gg - 0.0458 * b;
      add(Math.round(W / 2 + (cb / 128) * (W / 2 - 4)), Math.round(H / 2 - (cr / 128) * (H / 2 - 4)), Math.min(255, r / 6 + 6), Math.min(255, gg / 6 + 6), Math.min(255, b / 6 + 6));
    }
  } else {
    const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let i = 0; i < px.length; i += 4) {
      bins[0][px[i]]++;
      bins[1][px[i + 1]]++;
      bins[2][px[i + 2]]++;
    }
    const top = Math.max(1, ...bins.map((b) => Math.max(...Array.from(b.slice(2, 254)))));
    for (let x = 0; x < W; x++) {
      const v = Math.floor((x / W) * 256);
      for (let c = 0; c < 3; c++) {
        const hgt = Math.min(H, Math.round((bins[c][v] / top) * H));
        for (let y = H - hgt; y < H; y++) add(x, y, c === 0 ? 110 : 0, c === 1 ? 110 : 0, c === 2 ? 110 : 0);
      }
    }
  }
  g.putImageData(img, 0, 0);
  // Guides: the brightness at 0, 50 and 100 %, or the colours' targets.
  g.strokeStyle = fg;
  g.globalAlpha = 0.25;
  g.lineWidth = 1;
  if (kind === 'waveform')
    for (const v of [0.1, 0.5, 0.9]) {
      g.beginPath();
      g.moveTo(0, Math.round(H * v) + 0.5);
      g.lineTo(W, Math.round(H * v) + 0.5);
      g.stroke();
    }
  if (kind === 'vector') {
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 4, 0, Math.PI * 2);
    g.stroke();
    // The line skin tones fall on.
    g.beginPath();
    g.moveTo(W / 2, H / 2);
    g.lineTo(W / 2 - 0.55 * (W / 2), H / 2 - 0.84 * (H / 2));
    g.stroke();
  }
  g.globalAlpha = 1;
}
