// The sound editor's tracks: the time ruler (a press or a drag moves the playhead; markers on it, to jump to, drag and
// rename), and a lane for each track: its header (name, mute, solo, record, volume, pan, waveform or spectrogram) and
// its clips. In a lane, a drag picks a part of the time (across lanes, of several tracks); a clip's name bar drags the
// clip (along, or to another track), its ends trim it, the handles at its top corners set its fades, and a double-click
// picks all of it; where a clip has a volume line (or is the clip picked), a click on the line adds a point, a drag
// moves one and a double-click takes it out. A right-click (a long press on a touch screen) on a clip, the part picked,
// a lane, the ruler or a marker asks the editor for its menu. The edges of a part picked and the clips' edges snap to
// each other, to the playhead, the markers, the time grid and (a part's edges) the nearest zero crossing. Ctrl and the
// wheel zoom about the pointer; the wheel sideways, or with Shift, moves along.
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AudioWaveform, Circle, Ellipsis, Flag, Plus, Trash2, Volume2 } from 'lucide-react';
import { clipEnd, clipLength, envAdd, envGainAt, envMove, envRemove, newId, type EnvPoint, type SoundEffect, type SoundRecipe, type SoundTrack } from '@shared/mediaedit-audio';
import { cx, IconButton, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { isCopyDrag, isNoSnap } from '../shell';
import { useClock, type Clock } from '../video/clock';
import { bodyBox, drawLane, drawRuler, envValue, envY, HEADER, palette, tOf, xOf, type View } from './draw';
import type { Get } from './engine';
import { gridLines, nearestGrid, snapPointsOf, snapTime, zeroOnTrack, type Grid } from './snap';
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
/** What a right-click (or a long press) was on, for the editor to make its menu. */
export type MenuTarget =
  | { kind: 'clip'; track: string; clip: string; t: number }
  | { kind: 'point'; track: string; clip: string; index: number }
  | { kind: 'sel'; track: string; t: number }
  | { kind: 'lane'; track: string; t: number }
  | { kind: 'ruler'; t: number }
  | { kind: 'marker'; id: string };

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
  /** A part's edges (and a split) go to the nearest zero crossing of the sound. */
  zero: boolean;
  grid: Grid;
  markers: Marker[];
  onMarkers: (label: string, f: (m: Marker[]) => Marker[]) => void;
  /** A marker to open for renaming (from its menu); the editor clears it once it is shown. */
  renaming: string | null;
  markerDrag: { begin: () => void; end: () => void };
  /** `copyOf`: `clip` is a new clip, a copy of that one (made where it is dropped), and the original stays where it was. */
  onMoveClip: (track: string, clip: string, toTrack: string, at: number, phase: Phase, copyOf?: string) => void;
  onTrimClip: (track: string, clip: string, edge: 'start' | 'end', t: number, phase: Phase) => void;
  onFade: (track: string, clip: string, which: 'in' | 'out', seconds: number, phase: Phase) => void;
  /** A clip's volume line changed (a point added, moved or taken out; `undefined`: no line); a drag is begun and ended. */
  onEnv: (track: string, clip: string, env: EnvPoint[] | undefined, phase: Phase, label: string) => void;
  /** A right-click or a long press: where (client coordinates) and on what. */
  onMenu: (at: { x: number; y: number }, what: MenuTarget) => void;
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

/**
 * A press held still on a touch screen or with a pen, which has no right button: after a moment `fire` is asked for the
 * right-click menu at the point pressed. Returns what to call when the pointer moves (`moved`), when it is let go
 * (`stop`), and whether the menu was made (`fired`, so the press is not also a click).
 */
function holdToMenu(e: { pointerType: string; clientX: number; clientY: number }, fire: (x: number, y: number) => void) {
  const x0 = e.clientX;
  const y0 = e.clientY;
  let done = false;
  const timer = e.pointerType === 'mouse' ? 0 : window.setTimeout(() => ((done = true), fire(x0, y0)), 480);
  return {
    moved: (x: number, y: number) => Math.hypot(x - x0, y - y0) > 8 && clearTimeout(timer),
    stop: () => clearTimeout(timer),
    fired: () => done,
  };
}

export function Tracks(p: TracksProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const laneW = Math.max(1, w - (p.mobile ? 0 : HEAD));
  const head = p.mobile ? 0 : HEAD;
  const lanesRef = useRef<HTMLDivElement>(null);
  const tick = useThemeTick();
  /** The nearest zero crossing of what the track plays at `t`, within a few pixels (at most 10 ms). */
  const zeroAt = (trackId: string, t: number) => {
    const tr = p.recipe.tracks.find((x) => x.id === trackId);
    return tr ? zeroOnTrack(tr, p.get, t, Math.min(0.01, 8 / p.view.pps)) : t;
  };
  /**
   * Where a time lands: on a clip's edge, the playhead, a marker or the part picked's end, else on the time grid; and
   * with `zero` (the track whose sound it cuts), else on the nearest zero crossing.
   */
  const snapTo = (t: number, except?: number[], zero?: string) =>
    snapTime(t, {
      on: p.snap,
      points: snapPointsOf(p.recipe, p.clock.get(), p.markers.map((m) => m.t), p.sel),
      tol: 8 / p.view.pps,
      grid: (() => {
        const g = nearestGrid(p.grid, p.view.pps, t);
        return g === null ? null : { t: g };
      })(),
      zero: zero && p.zero ? (x) => zeroAt(zero, x) : null,
      except,
    });
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
  const timeAt = (clientX: number, el: HTMLElement) => Math.max(0, Math.min(p.length, p.snapTo(tOf(p.view, clientX - el.getBoundingClientRect().left))));
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const hold = holdToMenu(e, (x, y) => p.onMenu({ x, y }, { kind: 'ruler', t: timeAt(x, el) }));
    p.seek(timeAt(e.clientX, el));
    const move = (ev: PointerEvent) => {
      hold.moved(ev.clientX, ev.clientY);
      if (!hold.fired()) p.seek(timeAt(ev.clientX, el));
    };
    const up = () => {
      hold.stop();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div
      className="relative min-w-0 flex-1 cursor-pointer"
      onPointerDown={down}
      onContextMenu={(e) => (e.preventDefault(), p.onMenu({ x: e.clientX, y: e.clientY }, { kind: 'ruler', t: timeAt(e.clientX, e.currentTarget) }))}
      title="Click or drag to move the playhead"
    >
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

function MarkerFlag({ m, ...p }: TracksProps & { m: Marker; w: number; snapTo: (t: number, except?: number[]) => number }) {
  const x = xOf(p.view, m.t);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  useEffect(() => {
    if (p.renaming === m.id) (setName(m.name), setEditing(true));
  }, [p.renaming]);
  if (x < -80 || x > p.w + 4) return null;
  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0 || editing) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let moved = false;
    const hold = holdToMenu(e, (x, y) => p.onMenu({ x, y }, { kind: 'marker', id: m.id }));
    const move = (ev: PointerEvent) => {
      hold.moved(ev.clientX, ev.clientY);
      if (hold.fired() || (!moved && Math.abs(ev.clientX - x0) < 3)) return;
      if (!moved) p.markerDrag.begin();
      moved = true;
      const raw = m.t + (ev.clientX - x0) / p.view.pps;
      const t = Math.max(0, Math.min(p.length, isNoSnap(ev) ? raw : p.snapTo(raw, [m.t])));
      p.onMarkers('Move a marker', (list) => list.map((k) => (k.id === m.id ? { ...k, t } : k)));
    };
    const up = () => {
      hold.stop();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (moved) p.markerDrag.end();
      else if (!hold.fired()) p.seek(m.t);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div
      className="absolute top-0 z-10 flex h-[15px] max-w-36 items-center gap-1 rounded-r-sm bg-warn/85 pr-1.5 pl-1 text-[10px] font-medium text-black"
      style={{ left: x }}
      onPointerDown={down}
      onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), p.onMenu({ x: e.clientX, y: e.clientY }, { kind: 'marker', id: m.id }))}
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

type Clip = SoundTrack['clips'][number];
type Hit = { kind: 'move' | 'trim-start' | 'trim-end' | 'fade-in' | 'fade-out' | 'select' | 'env-line' | 'env-point'; clip?: Clip; index?: number };

/**
 * What is at a point of a lane (x, y from its top left): a clip's name bar (to move it), its ends (to trim), the handles of its
 * fades, and, on a clip with a volume line or the clip picked, the line's points and the line itself.
 */
function hitTest(t: SoundTrack, view: View, x: number, y: number, o: { picked: string | null; box: { top: number; bottom: number } }): Hit {
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
    if (x >= xa && x <= xb) {
      if (y <= HEADER) return { kind: 'move', clip: c };
      if (c.id === o.picked || c.env?.length) {
        const pts = c.env ?? [];
        for (let i = 0; i < pts.length; i++) if (Math.hypot(x - xOf(view, c.at + pts[i].t), y - envY(pts[i].v, o.box)) <= 8) return { kind: 'env-point', clip: c, index: i };
        const line = envY(envGainAt(c.env, tOf(view, x) - c.at), o.box);
        if (Math.abs(y - line) <= 5) return { kind: 'env-line', clip: c };
      }
      return { kind: 'select', clip: c };
    }
  }
  return { kind: 'select' };
}

const CURSOR: Record<Hit['kind'], string> = { move: 'grab', 'trim-start': 'ew-resize', 'trim-end': 'ew-resize', 'fade-in': 'col-resize', 'fade-out': 'col-resize', select: 'text', 'env-line': 'crosshair', 'env-point': 'grab' };

const TrackRow = memo(function TrackRow(p: TracksProps & { track: SoundTrack; index: number; w: number; tick: number; snapTo: (t: number, except?: number[], zero?: string) => number; trackAtY: (y: number) => string | null }) {
  const t = p.track;
  const h = p.heights[t.id] ?? DEFAULT_H;
  const cv = useRef<HTMLCanvasElement>(null);
  const mode = p.modes[t.id] ?? 'wave';
  const words = p.words(t);
  const effects: SoundEffect[] = (p.recipe.effects ?? []).filter((e) => e.track === t.id);
  const picked = p.picked?.track === t.id ? (p.picked.clip ?? null) : null;
  const box = bodyBox(h, !!words?.length);
  const grid = gridLines(p.grid, p.view.pps, tOf(p.view, 0), tOf(p.view, p.w));
  useLayoutEffect(() => {
    const c = cv.current;
    if (!c || p.w < 2) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(p.w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLane(g, { w: p.w, h, view: p.view, track: t, get: p.get, pal: palette(), amp: p.amp, picked, mode, effects, words, loading: p.loading, grid });
  }, [p.w, h, p.view, t, p.version, p.amp, picked, mode, effects.map((e) => `${e.id}${e.range}${e.bypass}`).join(), words, p.tick, p.grid.kind, p.grid.kind === 'beats' ? p.grid.bpm : 0]);

  /** What a right-click at a point of the lane is on. */
  const target = (clientX: number, clientY: number, el: HTMLElement, hit: Hit): MenuTarget => {
    const r = el.getBoundingClientRect();
    const at = Math.max(0, tOf(p.view, clientX - r.left));
    void clientY;
    if (hit.kind === 'env-point' && hit.clip) return { kind: 'point', track: t.id, clip: hit.clip.id, index: hit.index ?? 0 };
    if (p.sel && p.sel.tracks.includes(t.id) && at >= p.sel.a && at <= p.sel.b) return { kind: 'sel', track: t.id, t: at };
    if (hit.clip) return { kind: 'clip', track: t.id, clip: hit.clip.id, t: at };
    return { kind: 'lane', track: t.id, t: at };
  };
  const hitAt = (el: HTMLElement, clientX: number, clientY: number) => {
    const r = el.getBoundingClientRect();
    return hitTest(t, p.view, clientX - r.left, clientY - r.top, { picked, box });
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = hitTest(t, p.view, x, y, { picked, box });
    // A word picked (or added to the pick).
    if (words?.length && y > h - 16) {
      const at = tOf(p.view, x);
      const wd = words.find((w) => at >= w.a && at <= w.b);
      if (wd) return p.onWord(t.id, wd, e.shiftKey);
    }
    el.setPointerCapture(e.pointerId);
    const at0 = tOf(p.view, x);
    // Alt (⌘ on a Mac) held when the drag starts: no snapping for it. Ctrl (⌥ on a Mac) on a clip: drag a copy.
    const loose = isNoSnap(e);
    const copying = isCopyDrag(e) && hit.kind === 'move';
    const snap = (v: number, except?: number[], zero?: string) => (loose ? v : p.snapTo(v, except, zero));
    // A clip dragged is the clip itself, or its copy (the copy is made where the clip is, as the drag begins).
    const c = hit.clip;
    const dragId = copying && c ? newId() : c?.id;
    const hold = holdToMenu(e, (cx, cy) => {
      cleanup();
      p.onMenu({ x: cx, y: cy }, target(cx, cy, el, hit));
    });
    let moved = false;
    // The volume line being dragged: its points as they are now, and which one.
    let line = c?.env ? [...c.env] : [];
    let point = hit.index ?? -1;
    const envLabel = hit.kind === 'env-line' ? 'Add a volume point' : 'Move a volume point';
    // A press on the line makes a point (where it was pressed) as the drag begins, or when it is let go, but not when it becomes a long press.
    let made = false;
    const startLine = () => {
      if (made || !c) return;
      made = true;
      const u = Math.max(0, Math.min(clipLength(c), snap(at0) - c.at));
      const added = envAdd(c.env, u, clipLength(c));
      line = added.env;
      point = added.at;
      p.onEnv(t.id, c.id, line, 'begin', envLabel);
      p.onEnv(t.id, c.id, line, 'move', envLabel);
    };
    const move = (ev: PointerEvent) => {
      hold.moved(ev.clientX, ev.clientY);
      if (hold.fired()) return;
      const dx = ev.clientX - e.clientX;
      if (!moved && Math.abs(dx) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return;
      const t1 = tOf(p.view, ev.clientX - r.left);
      const loose2 = isNoSnap(ev) || loose;
      const snap2 = (v: number, except?: number[], zero?: string) => (loose2 ? v : p.snapTo(v, except, zero));
      if (!moved) {
        moved = true;
        if (c && hit.kind === 'move') p.onMoveClip(t.id, c.id, t.id, c.at, 'begin', copying ? c.id : undefined);
        if (c && hit.kind.startsWith('trim')) p.onTrimClip(t.id, c.id, hit.kind === 'trim-start' ? 'start' : 'end', c.at, 'begin');
        if (c && hit.kind.startsWith('fade')) p.onFade(t.id, c.id, hit.kind === 'fade-in' ? 'in' : 'out', 0, 'begin');
        if (c && hit.kind === 'env-point') p.onEnv(t.id, c.id, line, 'begin', envLabel);
        if (hit.kind === 'env-line') startLine();
      }
      if (c && hit.kind === 'move') {
        const to = p.trackAtY(ev.clientY) ?? t.id;
        const raw = c.at + (t1 - at0);
        // Its start, or its end, snaps.
        const s1 = snap2(raw, [c.at, clipEnd(c)]);
        const s2 = snap2(raw + clipLength(c), [c.at, clipEnd(c)]) - clipLength(c);
        const at = s1 !== raw ? s1 : s2 !== raw ? s2 : raw;
        p.onMoveClip(t.id, dragId!, to, Math.max(0, at), 'move', copying ? c.id : undefined);
      } else if (c && hit.kind.startsWith('trim')) p.onTrimClip(t.id, c.id, hit.kind === 'trim-start' ? 'start' : 'end', snap2(t1, [hit.kind === 'trim-start' ? c.at : clipEnd(c)]), 'move');
      else if (c && hit.kind === 'fade-in') p.onFade(t.id, c.id, 'in', Math.max(0, t1 - c.at), 'move');
      else if (c && hit.kind === 'fade-out') p.onFade(t.id, c.id, 'out', Math.max(0, clipEnd(c) - t1), 'move');
      else if (c && (hit.kind === 'env-line' || hit.kind === 'env-point')) {
        // A point follows the pointer along the clip (snapped in time) and up and down (to as it is, 1, and to silence).
        const u = snap2(t1) - c.at;
        let v = envValue(ev.clientY - r.top, box);
        if (!loose2 && Math.abs(v - 1) < 0.04) v = 1;
        if (!loose2 && v < 0.03) v = 0;
        line = envMove(line, point, u, v, clipLength(c));
        p.onEnv(t.id, c.id, line, 'move', envLabel);
      } else {
        // A part of the time, on the lanes dragged over.
        const other = p.trackAtY(ev.clientY) ?? t.id;
        const ids = p.recipe.tracks.map((x) => x.id);
        const [i0, i1] = [ids.indexOf(t.id), ids.indexOf(other)].sort((a, b) => a - b);
        const a = Math.max(0, snap2(Math.min(at0, t1), undefined, t.id));
        const b = Math.max(0, snap2(Math.max(at0, t1), undefined, t.id));
        p.setSel(b - a > 0.0005 ? { a, b, tracks: ids.slice(i0, i1 + 1) } : null);
      }
    };
    const up = () => {
      hold.stop();
      cleanup();
      if (hold.fired()) return;
      if (c && hit.kind === 'env-line') {
        startLine();
        p.onEnv(t.id, c.id, line, 'end', envLabel);
        return;
      }
      if (c && hit.kind === 'env-point' && moved) {
        p.onEnv(t.id, c.id, line, 'end', envLabel);
        return;
      }
      if (moved) {
        if (c && hit.kind === 'move') p.onMoveClip(t.id, dragId!, t.id, c.at, 'end', copying ? c.id : undefined);
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
      p.seek(Math.max(0, snap(at0, undefined, t.id)));
    };
    const cleanup = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const [cursor, setCursor] = useState('text');
  const hover = (e: React.PointerEvent<HTMLDivElement>) => setCursor(CURSOR[hitAt(e.currentTarget, e.clientX, e.clientY).kind]);
  const dbl = (e: React.MouseEvent<HTMLDivElement>) => {
    const hit = hitAt(e.currentTarget, e.clientX, e.clientY);
    // A double-click on a volume point takes it out.
    if (hit.kind === 'env-point' && hit.clip) return p.onEnv(t.id, hit.clip.id, envRemove(hit.clip.env ?? [], hit.index ?? 0), 'move', 'Take out a volume point');
    if (hit.kind === 'env-line') return;
    if (hit.clip) p.setSel({ a: hit.clip.at, b: clipEnd(hit.clip), tracks: [t.id] });
  };
  const menu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const hit = hitAt(e.currentTarget, e.clientX, e.clientY);
    p.onMenu({ x: e.clientX, y: e.clientY }, target(e.clientX, e.clientY, e.currentTarget, hit));
  };
  const sel = p.sel && p.sel.tracks.includes(t.id) ? p.sel : null;
  const rec = p.recording && (p.recording.track ?? '') === t.id ? p.recording : null;
  const isPicked = p.picked?.track === t.id && !p.picked.clip;
  return (
    <div data-track={t.id} className={cx('relative flex border-b border-line', t.mute && 'opacity-60')} style={{ height: h }}>
      {!p.mobile && <TrackHead {...p} t={t} h={h} isPicked={isPicked} />}
      <div data-lane className="relative min-w-0 flex-1" style={{ cursor }} onPointerDown={down} onPointerMove={hover} onDoubleClick={dbl} onContextMenu={menu}>
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

