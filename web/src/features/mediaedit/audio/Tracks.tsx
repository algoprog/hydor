// The sound editor's tracks: the time ruler (a press or a drag moves the playhead; markers on it, to jump to, drag and
// rename), and a lane for each track: its header (name, mute, solo, record, volume, pan, waveform or spectrogram) and
// its clips. In a lane, a drag picks a part of the time (across lanes, of several tracks); a clip's name bar drags the
// clip (along, or to another track), its ends trim it, the handles at its top corners set its fades, and a double-click
// picks all of it. Ctrl and the wheel zoom about the pointer; the wheel sideways, or with Shift, moves along.
import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AudioWaveform, Circle, Ellipsis, Flag, Plus, Trash2, Volume2 } from 'lucide-react';
import { clipEnd, clipLength, type SoundEffect, type SoundRecipe, type SoundTrack } from '@shared/mediaedit-audio';
import { cx, IconButton, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { useClock, type Clock } from '../video/clock';
import { drawLane, drawRuler, HEADER, palette, tOf, xOf, type View } from './draw';
import type { Get } from './engine';
import { ScrubField, useThemeTick, useWidth } from './ui';

export interface Sel {
  a: number;
  b: number;
  tracks: string[];
}
export interface Marker {
  id: string;
  t: number;
  name: string;
}
export type Phase = 'begin' | 'move' | 'end';
export interface Picked {
  track: string;
  clip?: string;
}
export interface Recording {
  track: string | null;
  at: number;
  seconds: number;
  levels: number[];
}

export const HEAD = 196;
export const RULER = 26;

export interface TracksProps {
  recipe: SoundRecipe;
  view: View;
  setView: (v: View) => void;
  length: number;
  sel: Sel | null;
  setSel: (s: Sel | null) => void;
  picked: Picked | null;
  pick: (p: Picked | null) => void;
  get: Get;
  loading: (src: string) => number | null;
  version: number;
  heights: Record<string, number>;
  setHeight: (id: string, h: number) => void;
  modes: Record<string, 'wave' | 'spectrum'>;
  setMode: (id: string, m: 'wave' | 'spectrum') => void;
  amp: number;
  words: (t: SoundTrack) => { w: string; a: number; b: number }[] | undefined;
  clock: Clock;
  seek: (t: number) => void;
  snap: boolean;
  markers: Marker[];
  onMarkers: (label: string, f: (m: Marker[]) => Marker[]) => void;
  markerDrag: { begin: () => void; end: () => void };
  onMoveClip: (track: string, clip: string, toTrack: string, at: number, phase: Phase) => void;
  onTrimClip: (track: string, clip: string, edge: 'start' | 'end', t: number, phase: Phase) => void;
  onFade: (track: string, clip: string, which: 'in' | 'out', seconds: number, phase: Phase) => void;
  onTrack: (id: string, patch: Partial<SoundTrack>, label: string) => void;
  trackDrag: { begin: (label: string) => void; end: () => void };
  onDeleteTrack: (id: string) => void;
  onAddTrack: () => void;
  armed: string | null;
  arm: (id: string | null) => void;
  recording: Recording | null;
  onWord: (track: string, w: { a: number; b: number }, extend: boolean) => void;
  mobile: boolean;
}

const DEFAULT_H = 104;

/** The moments a drag snaps to: the ends of clips, the markers, the playhead, the selection's ends. */
function snapPoints(p: TracksProps): number[] {
  const out = [0, p.clock.get(), ...p.markers.map((m) => m.t)];
  for (const t of p.recipe.tracks) for (const c of t.clips) out.push(c.at, clipEnd(c));
  if (p.sel) out.push(p.sel.a, p.sel.b);
  return out;
}

export function Tracks(p: TracksProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const laneW = Math.max(1, w - (p.mobile ? 0 : HEAD));
  const head = p.mobile ? 0 : HEAD;
  const lanesRef = useRef<HTMLDivElement>(null);
  const tick = useThemeTick();
  const snapTo = (t: number, except?: number[]) => {
    if (!p.snap) return t;
    let best = t;
    let d = 8 / p.view.pps;
    for (const s of snapPoints(p)) if (!except?.includes(s) && Math.abs(s - t) < d) [best, d] = [s, Math.abs(s - t)];
    return best;
  };
  // Scrolling and zooming.
  const total = Math.max(p.length * 1.05 + 1, laneW / p.view.pps);
  const setX0 = (x0: number) => p.setView({ ...p.view, x0: Math.max(0, Math.min(Math.max(0, total - laneW / p.view.pps), x0)) });
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = lanesRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left - head;
      const at = tOf(p.view, x);
      const pps = Math.min(20000, Math.max(laneW / Math.max(1, p.length * 1.05), p.view.pps * Math.exp(-e.deltaY * 0.002)));
      p.setView({ pps, x0: Math.max(0, at - x / pps) });
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      setX0(p.view.x0 + (e.shiftKey ? e.deltaY : e.deltaX) / p.view.pps);
    }
  };

  /** Which track's lane is at a height of the lanes (for a drag across lanes). */
  const trackAtY = (clientY: number): string | null => {
    const el = lanesRef.current;
    if (!el) return null;
    for (const row of el.querySelectorAll<HTMLElement>('[data-track]')) {
      const r = row.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return row.dataset.track!;
    }
    return null;
  };

  return (
    <div ref={ref} className="flex min-h-0 min-w-0 flex-1 flex-col select-none" onWheel={onWheel}>
      <div className="flex shrink-0" style={{ height: RULER }}>
        {!p.mobile && (
          <div className="flex shrink-0 items-center gap-1 border-r border-b border-line bg-bg-1 px-2 text-[11px] text-fg-3" style={{ width: HEAD }}>
            <Flag size={12} />
            <span className="truncate">{p.markers.length ? `${p.markers.length} marker${p.markers.length === 1 ? '' : 's'} · M adds one` : 'M adds a marker'}</span>
          </div>
        )}
        <Ruler {...p} w={laneW} tick={tick} snapTo={snapTo} />
      </div>
      <div ref={lanesRef} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-bg">
        {p.recipe.tracks.map((t, i) => (
          <TrackRow key={t.id} {...p} track={t} index={i} w={laneW} tick={tick} snapTo={snapTo} trackAtY={trackAtY} />
        ))}
        <div className="flex h-9 items-center border-b border-line" style={{ paddingLeft: p.mobile ? 8 : 10 }}>
          <button type="button" onClick={p.onAddTrack} disabled={p.recipe.tracks.length >= 16} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-fg-3 hover:bg-bg-2 hover:text-fg disabled:opacity-40">
            <Plus size={13} /> Add a track
          </button>
        </div>
        <Overlays {...p} w={laneW} head={head} />
      </div>
      <HScroll view={p.view} total={total} w={laneW} head={head} setX0={setX0} />
    </div>
  );
}

/** The playhead and the markers' lines over the lanes. */
function Overlays(p: TracksProps & { w: number; head: number }) {
  const t = useClock(p.clock);
  const x = xOf(p.view, t);
  return (
    <div className="pointer-events-none absolute inset-y-0" style={{ left: p.head, width: p.w }}>
      {p.markers.map((m) => {
        const mx = xOf(p.view, m.t);
        return mx >= 0 && mx <= p.w ? <div key={m.id} className="absolute inset-y-0 w-px bg-warn/60" style={{ left: mx }} /> : null;
      })}
      {x >= -1 && x <= p.w + 1 && <div className="absolute inset-y-0 w-px bg-fg" style={{ left: x }} />}
    </div>
  );
}

function HScroll({ view, total, w, head, setX0 }: { view: View; total: number; w: number; head: number; setX0: (x: number) => void }) {
  const shown = w / view.pps;
  const frac = Math.min(1, shown / total);
  const left = (view.x0 / total) * w;
  if (frac >= 0.999) return <div className="h-2 shrink-0 border-t border-line bg-bg-1" />;
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x = e.clientX;
    const x0 = view.x0;
    const move = (ev: PointerEvent) => setX0(x0 + ((ev.clientX - x) / w) * total);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="relative h-2.5 shrink-0 border-t border-line bg-bg-1" style={{ marginLeft: head }}>
      <div onPointerDown={down} className="absolute top-0.5 h-1.5 cursor-grab rounded-full bg-fg-3/50 hover:bg-fg-3" style={{ left, width: Math.max(16, frac * w) }} />
    </div>
  );
}

// ---- the ruler -----------------------------------------------------------------------------------------------------------

function Ruler(p: TracksProps & { w: number; tick: number; snapTo: (t: number) => number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const h = RULER;
  useLayoutEffect(() => {
    const c = cv.current;
    if (!c || p.w < 2) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(p.w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRuler(g, { w: p.w, h, view: p.view, pal: palette(), length: p.length });
  }, [p.w, p.view, p.length, p.tick, h]);
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const at = (x: number) => Math.max(0, Math.min(p.length, p.snapTo(tOf(p.view, x - r.left))));
    p.seek(at(e.clientX));
    const move = (ev: PointerEvent) => p.seek(at(ev.clientX));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="relative min-w-0 flex-1 cursor-pointer" onPointerDown={down} title="Click or drag to move the playhead">
      <canvas ref={cv} className="absolute inset-0" style={{ width: p.w, height: h }} />
      {p.markers.map((m) => (
        <MarkerFlag key={m.id} m={m} {...p} />
      ))}
      <RulerHead clock={p.clock} view={p.view} w={p.w} />
    </div>
  );
}

function RulerHead({ clock, view, w }: { clock: Clock; view: View; w: number }) {
  const t = useClock(clock);
  const x = xOf(view, t);
  if (x < -6 || x > w + 6) return null;
  return <div className="pointer-events-none absolute bottom-0 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-fg" style={{ left: x, transform: 'translate(-50%, 50%) rotate(45deg)' }} />;
}

function MarkerFlag({ m, ...p }: TracksProps & { m: Marker; w: number; snapTo: (t: number) => number }) {
  const x = xOf(p.view, m.t);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  if (x < -80 || x > p.w + 4) return null;
  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0 || editing) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      if (!moved) p.markerDrag.begin();
      moved = true;
      const t = Math.max(0, Math.min(p.length, p.snapTo(m.t + (ev.clientX - x0) / p.view.pps)));
      p.onMarkers('Move a marker', (list) => list.map((k) => (k.id === m.id ? { ...k, t } : k)));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (moved) p.markerDrag.end();
      else p.seek(m.t);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div
      className="absolute top-0 z-10 flex h-[15px] max-w-36 items-center gap-1 rounded-r-sm bg-warn/85 pr-1.5 pl-1 text-[10px] font-medium text-black"
      style={{ left: x }}
      onPointerDown={down}
      onDoubleClick={(e) => (e.stopPropagation(), setName(m.name), setEditing(true))}
      title={`${m.name}: drag to move, double-click to rename`}
    >
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (setEditing(false), name.trim() && name !== m.name && p.onMarkers('Rename a marker', (l) => l.map((k) => (k.id === m.id ? { ...k, name: name.trim().slice(0, 60) } : k))))}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === 'Escape') (e.currentTarget as HTMLInputElement).blur();
          }}
          className="h-3.5 w-24 bg-white/70 px-0.5 text-[10px] text-black outline-none"
        />
      ) : (
        <span translate="no" className="truncate">
          {m.name}
        </span>
      )}
    </div>
  );
}

// ---- a track ---------------------------------------------------------------------------------------------------------------

type Hit = { kind: 'move' | 'trim-start' | 'trim-end' | 'fade-in' | 'fade-out' | 'select'; clip?: SoundTrack['clips'][number] };

function hitTest(t: SoundTrack, view: View, x: number, y: number): Hit {
  for (const c of t.clips) {
    const xa = xOf(view, c.at);
    const xb = xOf(view, clipEnd(c));
    if (x < xa - 4 || x > xb + 4) continue;
    if (y <= HEADER + 6) {
      const fi = xOf(view, c.at + (c.fadeIn ?? 0));
      const fo = xOf(view, clipEnd(c) - (c.fadeOut ?? 0));
      if (Math.abs(x - fi) <= 5 && xb - xa > 30) return { kind: 'fade-in', clip: c };
      if (Math.abs(x - fo) <= 5 && xb - xa > 30) return { kind: 'fade-out', clip: c };
    }
    if (Math.abs(x - xa) <= 4) return { kind: 'trim-start', clip: c };
    if (Math.abs(x - xb) <= 4) return { kind: 'trim-end', clip: c };
    if (x >= xa && x <= xb) return { kind: y <= HEADER ? 'move' : 'select', clip: c };
  }
  return { kind: 'select' };
}

const CURSOR: Record<Hit['kind'], string> = { move: 'grab', 'trim-start': 'ew-resize', 'trim-end': 'ew-resize', 'fade-in': 'col-resize', 'fade-out': 'col-resize', select: 'text' };

const TrackRow = memo(function TrackRow(p: TracksProps & { track: SoundTrack; index: number; w: number; tick: number; snapTo: (t: number, except?: number[]) => number; trackAtY: (y: number) => string | null }) {
  const t = p.track;
  const h = p.heights[t.id] ?? DEFAULT_H;
  const cv = useRef<HTMLCanvasElement>(null);
  const mode = p.modes[t.id] ?? 'wave';
  const words = p.words(t);
  const effects: SoundEffect[] = (p.recipe.effects ?? []).filter((e) => e.track === t.id);
  const picked = p.picked?.track === t.id ? (p.picked.clip ?? null) : null;
  useLayoutEffect(() => {
    const c = cv.current;
    if (!c || p.w < 2) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(p.w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLane(g, { w: p.w, h, view: p.view, track: t, get: p.get, pal: palette(), amp: p.amp, picked, mode, effects, words, loading: p.loading });
  }, [p.w, h, p.view, t, p.version, p.amp, picked, mode, effects.map((e) => `${e.id}${e.range}${e.bypass}`).join(), words, p.tick]);

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = hitTest(t, p.view, x, y);
    // A word picked (or added to the pick).
    if (words?.length && y > h - 16) {
      const at = tOf(p.view, x);
      const wd = words.find((w) => at >= w.a && at <= w.b);
      if (wd) return p.onWord(t.id, wd, e.shiftKey);
    }
    el.setPointerCapture(e.pointerId);
    const at0 = tOf(p.view, x);
    const c = hit.clip;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - e.clientX;
      if (!moved && Math.abs(dx) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return;
      const t1 = tOf(p.view, ev.clientX - r.left);
      if (!moved) {
        moved = true;
        if (c && hit.kind === 'move') p.onMoveClip(t.id, c.id, t.id, c.at, 'begin');
        if (c && hit.kind.startsWith('trim')) p.onTrimClip(t.id, c.id, hit.kind === 'trim-start' ? 'start' : 'end', c.at, 'begin');
        if (c && hit.kind.startsWith('fade')) p.onFade(t.id, c.id, hit.kind === 'fade-in' ? 'in' : 'out', 0, 'begin');
      }
      if (c && hit.kind === 'move') {
        const to = p.trackAtY(ev.clientY) ?? t.id;
        const raw = c.at + (t1 - at0);
        // Its start, or its end, snaps.
        const s1 = p.snapTo(raw, [c.at, clipEnd(c)]);
        const s2 = p.snapTo(raw + clipLength(c), [c.at, clipEnd(c)]) - clipLength(c);
        const at = s1 !== raw ? s1 : s2 !== raw ? s2 : raw;
        p.onMoveClip(t.id, c.id, to, Math.max(0, at), 'move');
      } else if (c && hit.kind.startsWith('trim')) p.onTrimClip(t.id, c.id, hit.kind === 'trim-start' ? 'start' : 'end', p.snapTo(t1, [hit.kind === 'trim-start' ? c.at : clipEnd(c)]), 'move');
      else if (c && hit.kind === 'fade-in') p.onFade(t.id, c.id, 'in', Math.max(0, t1 - c.at), 'move');
      else if (c && hit.kind === 'fade-out') p.onFade(t.id, c.id, 'out', Math.max(0, clipEnd(c) - t1), 'move');
      else {
        // A part of the time, on the lanes dragged over.
        const other = p.trackAtY(ev.clientY) ?? t.id;
        const ids = p.recipe.tracks.map((x) => x.id);
        const [i0, i1] = [ids.indexOf(t.id), ids.indexOf(other)].sort((a, b) => a - b);
        const a = Math.max(0, p.snapTo(Math.min(at0, t1)));
        const b = Math.max(0, p.snapTo(Math.max(at0, t1)));
        p.setSel(b - a > 0.0005 ? { a, b, tracks: ids.slice(i0, i1 + 1) } : null);
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (moved) {
        if (c && hit.kind === 'move') p.onMoveClip(t.id, c.id, t.id, c.at, 'end');
        else if (c && hit.kind.startsWith('trim')) p.onTrimClip(t.id, c.id, 'start', 0, 'end');
        else if (c && hit.kind.startsWith('fade')) p.onFade(t.id, c.id, 'in', 0, 'end');
        return;
      }
      // A click: the playhead there, the clip (or the track) picked; with Shift, the part picked runs to here.
      if (e.shiftKey && p.sel) {
        const a = Math.min(p.sel.a, at0);
        const b = Math.max(p.sel.b, at0);
        p.setSel({ a, b, tracks: p.sel.tracks.includes(t.id) ? p.sel.tracks : [...p.sel.tracks, t.id] });
        return;
      }
      p.setSel(null);
      p.pick(c ? { track: t.id, clip: c.id } : { track: t.id });
      p.seek(Math.max(0, p.snapTo(at0)));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const [cursor, setCursor] = useState('text');
  const hover = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCursor(CURSOR[hitTest(t, p.view, e.clientX - r.left, e.clientY - r.top).kind]);
  };
  const dbl = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const hit = hitTest(t, p.view, e.clientX - r.left, e.clientY - r.top);
    if (hit.clip) p.setSel({ a: hit.clip.at, b: clipEnd(hit.clip), tracks: [t.id] });
  };
  const sel = p.sel && p.sel.tracks.includes(t.id) ? p.sel : null;
  const rec = p.recording && (p.recording.track ?? '') === t.id ? p.recording : null;
  const isPicked = p.picked?.track === t.id && !p.picked.clip;
  return (
    <div data-track={t.id} className={cx('relative flex border-b border-line', t.mute && 'opacity-60')} style={{ height: h }}>
      {!p.mobile && <TrackHead {...p} t={t} h={h} isPicked={isPicked} />}
      <div className="relative min-w-0 flex-1" style={{ cursor }} onPointerDown={down} onPointerMove={hover} onDoubleClick={dbl}>
        <canvas ref={cv} className="absolute inset-0" style={{ width: p.w, height: h }} />
        {sel && <div className="pointer-events-none absolute inset-y-0 border-x border-accent bg-accent/20" style={{ left: xOf(p.view, sel.a), width: Math.max(1, (sel.b - sel.a) * p.view.pps) }} />}
        {rec && <RecordingClip rec={rec} view={p.view} h={h} />}
        {p.mobile && p.recipe.tracks.length > 1 && (
          <span translate="no" className="pointer-events-none absolute top-0.5 right-1.5 rounded bg-bg/70 px-1 text-[10px] text-fg-3">
            {t.name}
          </span>
        )}
      </div>
      {/* Its height, dragged at its bottom edge. */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize"
        onPointerDown={(e) => {
          e.preventDefault();
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          const y0 = e.clientY;
          const move = (ev: PointerEvent) => p.setHeight(t.id, Math.round(Math.min(360, Math.max(56, h + ev.clientY - y0))));
          const up = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
          };
          el.addEventListener('pointermove', move);
          el.addEventListener('pointerup', up);
        }}
      />
    </div>
  );
});

function RecordingClip({ rec, view, h }: { rec: Recording; view: View; h: number }) {
  const x = xOf(view, rec.at);
  const w = Math.max(2, rec.seconds * view.pps);
  const n = rec.levels.length;
  return (
    <div className="pointer-events-none absolute inset-y-px overflow-hidden rounded-sm border border-err/70 bg-err/15" style={{ left: x, width: w }}>
      <div className="flex h-3.5 items-center gap-1 bg-err/60 px-1.5 text-[10px] font-medium text-white">
        <Circle size={7} fill="currentColor" /> Recording
      </div>
      <svg className="absolute inset-x-0 bottom-0" width={w} height={h - 18} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, n)} 100`}>
        {rec.levels.map((v, i) => (
          <rect key={i} x={i} y={50 - v * 50} width={1} height={Math.max(1, v * 100)} fill="currentColor" className="text-err" />
        ))}
      </svg>
    </div>
  );
}

function HeadButton({ on, onClick, label, children, tone }: { on: boolean; onClick: () => void; label: string; children: ReactNode; tone: 'accent' | 'warn' | 'err' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={label}
      aria-label={label}
      className={cx(
        'flex h-6 w-6 items-center justify-center rounded-md border text-[10.5px] font-bold',
        on ? (tone === 'err' ? 'border-err bg-err text-white' : tone === 'warn' ? 'border-warn bg-warn text-black' : 'border-accent bg-accent text-accent-fg') : 'border-line-2 text-fg-3 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function TrackHead(p: TracksProps & { t: SoundTrack; h: number; isPicked: boolean }) {
  const { t } = p;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(t.name ?? '');
  const [menu, setMenu] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const mode = p.modes[t.id] ?? 'wave';
  return (
    <div
      className={cx('flex shrink-0 flex-col gap-1 border-r border-line px-2 py-1.5', p.isPicked ? 'bg-accent-soft' : 'bg-bg-1')}
      style={{ width: HEAD }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, input, label')) return;
        p.pick({ track: t.id });
        if (e.shiftKey && p.sel) p.setSel({ ...p.sel, tracks: p.sel.tracks.includes(t.id) ? p.sel.tracks.filter((x) => x !== t.id) : [...p.sel.tracks, t.id] });
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => (setRenaming(false), name.trim() && name !== t.name && p.onTrack(t.id, { name: name.trim().slice(0, 80) }, 'Rename a track'))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') (e.currentTarget as HTMLInputElement).blur();
            }}
            className="h-6 min-w-0 flex-1 rounded border border-accent bg-bg-1 px-1 text-[12px] outline-none"
          />
        ) : (
          <span translate="no" className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg" onDoubleClick={() => (setName(t.name ?? ''), setRenaming(true))} title="Double-click to rename it">
            {t.name || `Track ${p.recipe.tracks.indexOf(t) + 1}`}
          </span>
        )}
        <IconButton ref={more} label="Track menu" size="sm" className="h-6 w-6" onClick={() => setMenu((x) => !x)}>
          <Ellipsis size={14} />
        </IconButton>
        <Popover anchor={more} open={menu} onClose={() => setMenu(false)} width={230} title={t.name}>
          <MenuItem icon={<AudioWaveform size={14} />} checked={mode === 'spectrum'} onClick={() => (setMenu(false), p.setMode(t.id, mode === 'spectrum' ? 'wave' : 'spectrum'))}>
            Spectrogram
          </MenuItem>
          <MenuItem onClick={() => (setMenu(false), setName(t.name ?? ''), setRenaming(true))}>Rename</MenuItem>
          <MenuSep />
          <MenuItem icon={<Trash2 size={14} />} danger disabled={p.recipe.tracks.length < 2} onClick={() => (setMenu(false), p.onDeleteTrack(t.id))}>
            Delete the track
          </MenuItem>
        </Popover>
      </div>
      <div className="flex items-center gap-1">
        <HeadButton on={!!t.mute} onClick={() => p.onTrack(t.id, { mute: !t.mute || undefined }, t.mute ? 'Hear a track' : 'Mute a track')} label="Mute" tone="warn">
          M
        </HeadButton>
        <HeadButton on={!!t.solo} onClick={() => p.onTrack(t.id, { solo: !t.solo || undefined }, t.solo ? 'Hear every track' : 'Solo a track')} label="Solo: only this track" tone="accent">
          S
        </HeadButton>
        <HeadButton on={p.armed === t.id} onClick={() => p.arm(p.armed === t.id ? null : t.id)} label="Record on this track" tone="err">
          <Circle size={9} fill="currentColor" />
        </HeadButton>
        <span className="flex-1" />
        <button type="button" onClick={() => p.setMode(t.id, mode === 'spectrum' ? 'wave' : 'spectrum')} title={mode === 'spectrum' ? 'Show the waveform' : 'Show the spectrogram'} className={cx('flex h-6 w-6 items-center justify-center rounded-md', mode === 'spectrum' ? 'text-accent' : 'text-fg-3 hover:text-fg')}>
          <AudioWaveform size={14} />
        </button>
      </div>
      {p.h >= 84 && (
        <div className="flex items-center gap-1.5">
          <ScrubField
            label={<Volume2 size={12} />}
            title="Volume"
            value={t.volume ?? 0}
            min={-60}
            max={12}
            step={0.5}
            unit="dB"
            width={66}
            begin={() => p.trackDrag.begin('Track volume')}
            end={p.trackDrag.end}
            onChange={(v) => p.onTrack(t.id, { volume: v || undefined }, 'Track volume')}
          />
          <ScrubField
            label="Pan"
            title="Pan: left or right"
            value={Math.round((t.pan ?? 0) * 100)}
            min={-100}
            max={100}
            step={1}
            width={50}
            show={(v) => (v === 0 ? 'C' : v < 0 ? `L${-v}` : `R${v}`)}
            read={(s) => {
              const m = /^\s*([LRC])?\s*(-?\d+)?\s*$/i.exec(s);
              if (!m) return null;
              if ((m[1] ?? '').toUpperCase() === 'C') return 0;
              const n = Number(m[2] ?? 0);
              return (m[1] ?? '').toUpperCase() === 'L' ? -Math.abs(n) : Math.abs(n) * (m[1] ? 1 : Math.sign(n) || 1);
            }}
            begin={() => p.trackDrag.begin('Track pan')}
            end={p.trackDrag.end}
            onChange={(v) => p.onTrack(t.id, { pan: v ? v / 100 : undefined }, 'Track pan')}
          />
        </div>
      )}
    </div>
  );
}

