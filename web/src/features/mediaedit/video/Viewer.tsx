// The viewer: the timeline at the playhead as the edit will make it, in the output's shape. The clips showing (one, or
// two in a transition, which the browser draws as ffmpeg's xfade does: dissolving, through black or white, wiping,
// sliding, a circle, a zoom) are each drawn in WebGL with their colour and effects (gl.ts); the overlays over them
// (keyed, see-through, fading), the words over those, the fades of the whole. A picked overlay or words can be moved and
// sized by their corner (about their middle), with pink guides while it goes: lines where an edge or the middle meets the
// frame's, the title-safe area's or another part's, the distance to the parts beside it, and a pill with the size
// (guides.ts; Shift keeps a move straight, Alt or ⌘ snaps to nothing, Ctrl or ⌥ drags a copy). With the crop on, the
// picked clip's whole frame shows with its crop box. Safe areas and a grid of thirds can show over it. The transport
// under it: play, J/K/L, frame steps, In and Out, the timecode, the zoom and the guides.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronFirst, ChevronLast, Grid3x3, Pause, Play, Scan, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import { clipsAt, editedSize, fitBox, isStill, overlayLength, shapeRatio, timecode, turnedSize, viewAt, type VideoClip, type VideoCrop, type VideoFactsOf, type VideoOverlay, type VideoRecipe, type VideoText } from '@shared/mediaedit-video';
import { GUIDE_COLOUR, type SnapBox, type SnapGap } from '@shared/snap';
import { cx } from '../../../components/ui';
import { isCopyDrag, isNoSnap } from '../shell/menus';
import { useClock, type Clock } from './clock';
import { fadeAt, type Engine } from './engine';
import { GradeCanvas, uvMap } from './gl';
import { gapPill, moveBox, NO_MARKS, pullOf, sizeBox, type Marks } from './guides';
import type { Picked } from './model';
import { Choices, Tool } from './shell';
import { drawText } from './text';

type Phase = 'begin' | 'move' | 'end';

export interface ViewerProps {
  engine: Engine;
  clock: Clock;
  recipe: VideoRecipe;
  factsOf: VideoFactsOf;
  /** The output's size. */
  out: { w: number; h: number };
  picked: Picked;
  onPick(p: Picked): void;
  onMoveText(id: string, x: number, y: number, phase: Phase): void;
  onMoveOverlay(id: string, o: Partial<VideoOverlay>, phase: Phase): void;
  /** Words sized (their letters' height as a share of the picture's). */
  onSizeText(id: string, size: number, phase: Phase): void;
  /** A drag with Ctrl (⌥ on a Mac): a copy of it is made in the same step and picked, and its id returned; the drag goes on with the copy. */
  onCopyDrag(thing: { kind: 'overlay' | 'text'; id: string }): string | null;
  /** The crop box of a clip, while cropping. */
  crop: { id: string; shape: string } | null;
  onCrop(c: VideoCrop, phase: Phase): void;
  safe: boolean;
  grid: boolean;
  zoom: number | 'fit';
  /** Before and after, split at this share of the width (the Colour page). */
  split?: number | null;
  onSplit?(x: number): void;
  /** The canvas of the clip showing (the scopes read it). */
  onCanvas?(c: HTMLCanvasElement | null): void;
  /** No dark padding (a phone). */
  tight?: boolean;
}

/** The largest box of `w`×`h`'s shape that fits in `aw`×`ah`. */
const fit = (w: number, h: number, aw: number, ah: number) => {
  const k = Math.min(aw / w, ah / h);
  return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)), k };
};

export function Viewer(p: ViewerProps) {
  const area = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const m = () => setRoom({ w: el.clientWidth, h: el.clientHeight });
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = p.tight ? 0 : 16;
  const box = p.zoom === 'fit' ? fit(p.out.w, p.out.h, Math.max(40, room.w - pad * 2), Math.max(40, room.h - pad * 2)) : { w: Math.round(p.out.w * p.zoom), h: Math.round(p.out.h * p.zoom), k: p.zoom };
  const cropClip = p.crop ? p.recipe.clips?.find((c) => c.id === p.crop!.id) : undefined;
  return (
    <div ref={area} className={cx('relative h-full w-full bg-bg-1', p.zoom === 'fit' ? 'overflow-hidden' : 'overflow-auto')} onPointerDown={(e) => e.target === e.currentTarget && p.onPick(null)}>
      {room.w > 0 && (
        <div className={cx('flex min-h-full min-w-full items-center justify-center', p.zoom !== 'fit' && 'p-4')} onPointerDown={(e) => e.target === e.currentTarget && p.onPick(null)}>
          {cropClip ? <CropView {...p} clip={cropClip} room={room} /> : <Picture {...p} box={box} />}
        </div>
      )}
    </div>
  );
}

/** The composition at the playhead. */
function Picture(p: ViewerProps & { box: { w: number; h: number; k: number } }) {
  const t = useClock(p.clock);
  const r = p.recipe;
  const { box } = p;
  const spans = p.engine.spans;
  const clips = r.clips ?? [];
  // The engine learns of a changed edit just after it is drawn: for that one frame its spans may name clips that are gone.
  const showing = clipsAt(spans, t).filter((i) => clips[i] && spans[i]);
  const k = box.w / p.out.w;
  // Two clips in a transition: how far it is, and its kind.
  let progress = 0;
  let kind: string | undefined;
  if (showing.length === 2) {
    const [a, b] = showing;
    const d = spans[a].tout || 1e-6;
    progress = Math.min(1, Math.max(0, (t - spans[b].start) / d));
    kind = clips[a].transition?.kind;
  }
  const dark = fadeAt(t, p.engine.length, r);
  const overlays = (r.overlays ?? []).filter((o) => !r.tracks?.[o.track === 3 ? 'v3' : 'v2']?.hidden && t >= o.start && t < o.start + overlayLength(o, p.factsOf(o.src))).sort((x, y) => (x.track ?? 2) - (y.track ?? 2) || x.start - y.start);
  const texts = r.tracks?.t1?.hidden ? [] : (r.texts ?? []);
  const under = kind === 'circleclose' || kind === 'zoomin';
  // What a drag lines up with: every overlay and words showing now, as boxes of the output (pixels of the edit).
  const drawn = useDrawnTexts(texts, p.out.w, p.out.h);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const boxes: (SnapBox & { id?: string })[] = [
    ...overlays.map((o) => ({ id: o.id, ...overlayBox(o, p.factsOf(o.src), p.out) })),
    ...texts.flatMap((x, i) => (t >= x.from && t < x.to && drawn[i] ? [{ id: x.id, x: x.x * p.out.w - drawn[i].w / 2, y: x.y * p.out.h - drawn[i].h / 2, w: drawn[i].w, h: drawn[i].h }] : [])),
  ];
  const others = (id?: string) => boxes.filter((b) => b.id !== id);
  return (
    <div className="relative shrink-0 overflow-hidden bg-black" style={{ width: box.w, height: box.h }} onPointerDown={(e) => e.target === e.currentTarget && p.onPick(null)}>
      {!r.tracks?.v1?.hidden &&
        showing.map((i, n) => {
          const role = showing.length === 1 ? 'only' : n === 0 ? 'out' : 'in';
          return (
            <ClipLayer
              key={clips[i].id}
              engine={p.engine}
              clip={clips[i]}
              factsOf={p.factsOf}
              u={t - spans[i].start}
              length={spans[i].length}
              out={p.out}
              k={k}
              style={transitionStyle(kind, role, progress)}
              z={role === 'in' ? (under ? 1 : 2) : under ? 2 : 1}
              split={p.split}
              onCanvas={n === showing.length - 1 ? p.onCanvas : undefined}
            />
          );
        })}
      {(kind === 'black' || kind === 'white') && showing.length === 2 && <div className={cx('pointer-events-none absolute inset-0', kind === 'white' ? 'bg-white' : 'bg-black')} style={{ zIndex: 0 }} />}
      {overlays.map((o) => (
        <OverlayLayer key={o.id} {...p} o={o} t={t} k={k} others={others} onMarks={setMarks} />
      ))}
      <Words texts={texts} drawn={drawn} t={t} out={p.out} k={k} picked={p.picked} onPick={p.onPick} onMove={p.onMoveText} onSize={p.onSizeText} onCopyDrag={p.onCopyDrag} others={others} onMarks={setMarks} />
      <GuideMarks marks={marks} k={k} />
      {dark > 0 && <div className="pointer-events-none absolute inset-0 z-30 bg-black" style={{ opacity: dark }} />}
      {p.safe && (
        <div className="pointer-events-none absolute inset-0 z-40">
          <div className="absolute inset-[3.5%] border border-dashed border-white/40" />
          <div className="absolute inset-[5%] border border-dashed border-white/25" />
        </div>
      )}
      {p.grid && (
        <div className="pointer-events-none absolute inset-0 z-40 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border-white/25 [&:nth-child(-n+6)]:border-b [&:not(:nth-child(3n))]:border-r" />
          ))}
        </div>
      )}
      {p.split !== undefined && p.split !== null && <SplitLine split={p.split} onSplit={p.onSplit} />}
    </div>
  );
}

/** How a clip of a transition shows at `p` (0 to 1) of it, as ffmpeg's xfade makes it. */
function transitionStyle(kind: string | undefined, role: 'only' | 'out' | 'in', p: number): CSSProperties {
  if (role === 'only' || !kind) return role === 'in' ? { opacity: p } : {};
  const inset = (top: number, right: number, bottom: number, left: number) => ({ clipPath: `inset(${top * 100}% ${right * 100}% ${bottom * 100}% ${left * 100}%)` });
  const q = 1 - p;
  switch (kind) {
    case 'dissolve':
      return role === 'in' ? { opacity: p } : {};
    case 'black':
    case 'white':
      return role === 'out' ? { opacity: Math.max(0, 1 - 2 * p) } : { opacity: Math.max(0, 2 * p - 1) };
    case 'wipeleft':
      return role === 'in' ? inset(0, 0, 0, q) : {};
    case 'wiperight':
      return role === 'in' ? inset(0, q, 0, 0) : {};
    case 'wipeup':
      return role === 'in' ? inset(q, 0, 0, 0) : {};
    case 'wipedown':
      return role === 'in' ? inset(0, 0, q, 0) : {};
    case 'slideleft':
      return { transform: role === 'out' ? `translateX(${-p * 100}%)` : `translateX(${q * 100}%)` };
    case 'slideright':
      return { transform: role === 'out' ? `translateX(${p * 100}%)` : `translateX(${-q * 100}%)` };
    case 'slideup':
      return { transform: role === 'out' ? `translateY(${-p * 100}%)` : `translateY(${q * 100}%)` };
    case 'slidedown':
      return { transform: role === 'out' ? `translateY(${p * 100}%)` : `translateY(${-q * 100}%)` };
    case 'circleopen':
      return role === 'in' ? { clipPath: `circle(${p * 71}% at 50% 50%)` } : {};
    case 'circleclose':
      return role === 'out' ? { clipPath: `circle(${q * 71}% at 50% 50%)` } : {};
    case 'zoomin':
      return role === 'out' ? { transform: `scale(${1 + p})`, opacity: q } : {};
    default:
      return role === 'in' ? { opacity: p } : {};
  }
}

/** What of a clip's frame shows (in its upright frame) `u` seconds into it: its crop, zoomed for a slow zoom and pan. */
export function clipWindow(c: VideoClip, fw: number, fh: number, u: number, length: number): VideoCrop {
  const up = turnedSize(fw, fh, c.rotate);
  const crop = c.crop ?? { x: 0, y: 0, w: up.w, h: up.h };
  if (!c.motion) return crop;
  const v = viewAt(c.motion, u, length);
  const w = crop.w / v.zoom;
  const h = crop.h / v.zoom;
  return { x: crop.x + Math.min(crop.w - w, Math.max(0, v.x * crop.w - w / 2)), y: crop.y + Math.min(crop.h - h, Math.max(0, v.y * crop.h - h / 2)), w, h };
}

/** One clip of the main track, drawn in its place of the output. */
const ClipLayer = memo(function ClipLayer({
  engine,
  clip,
  factsOf,
  u,
  length,
  out,
  k,
  style,
  z,
  split,
  onCanvas,
}: {
  engine: Engine;
  clip: VideoClip;
  factsOf: VideoFactsOf;
  u: number;
  length: number;
  out: { w: number; h: number };
  k: number;
  style: CSSProperties;
  z: number;
  split?: number | null;
  onCanvas?: (c: HTMLCanvasElement | null) => void;
}) {
  const facts = factsOf(clip.src);
  const ref = useRef<HTMLCanvasElement>(null);
  const gc = useRef<GradeCanvas | null>(null);
  const pic = facts ? editedSize(clip, facts.width, facts.height) : { w: 16, h: 9 };
  const b = fitBox(pic.w, pic.h, out.w, out.h, clip.fit === 'fill');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.max(2, Math.min(2560, Math.round(b.w * k * dpr)));
  const ch = Math.max(2, Math.min(2560, Math.round(b.h * k * dpr)));
  const props = useRef({ clip, u, length, split, facts });
  props.current = { clip, u, length, split, facts };
  const draw = useCallback(() => {
    const g = gc.current;
    const { clip: c, u: uu, length: len, split: sp, facts: f } = props.current;
    if (!g || !f) return;
    const still = c.picture || f.picture;
    const src = still ? engine.image(c.src) : (engine.element(`c:${c.id}`, c.src, 'video') as HTMLVideoElement);
    const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.videoWidth;
    const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.videoHeight;
    if (!sw || !sh || (src instanceof HTMLVideoElement && src.readyState < 2)) return;
    const win = clipWindow(c, f.width, f.height, uu, len);
    g.draw(src, sw, sh, uvMap(f.width, f.height, c, win), { grade: c.grade, split: sp ?? 0, time: performance.now() / 40 });
  }, [engine]);
  useEffect(() => {
    if (!ref.current) return;
    try {
      gc.current = new GradeCanvas(ref.current);
    } catch {
      gc.current = null;
    }
    onCanvas?.(ref.current);
    return () => {
      gc.current?.dispose();
      gc.current = null;
      onCanvas?.(null);
    };
    // A new canvas for a new clip only.
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => engine.onFrame(draw), [engine, draw]);
  useLayoutEffect(() => {
    draw();
  });
  // Not played but held: its element at the moment it shows (a held frame, or one paused).
  useEffect(() => {
    if (isStill(clip) && !clip.picture && facts && !facts.picture) {
      const el = engine.element(`c:${clip.id}`, clip.src, 'video');
      if (Math.abs(el.currentTime - (clip.still ?? 0)) > 0.01) el.currentTime = clip.still ?? 0;
    }
  }, [clip.id, clip.still, clip.src, facts, engine, clip]);
  return (
    <canvas
      ref={ref}
      width={cw}
      height={ch}
      className="pointer-events-none absolute"
      style={{ left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k, zIndex: z, ...style }}
    />
  );
});

/** An overlay in its place: drawn as it is made (keyed, see-through, faded); picked, it moves and sizes. */
function OverlayLayer(p: ViewerProps & { o: VideoOverlay; t: number; k: number; others: (id?: string) => SnapBox[]; onMarks: (m: Marks) => void }) {
  const { o, k, engine } = p;
  const facts = p.factsOf(o.src);
  const ref = useRef<HTMLCanvasElement>(null);
  const gc = useRef<GradeCanvas | null>(null);
  const len = overlayLength(o, facts);
  const u = p.t - o.start;
  const W = p.out.w;
  const ow = o.w * W;
  const oh = facts && facts.width ? (ow * facts.height) / facts.width : ow;
  const left = (o.x * W - ow / 2) * k;
  const top = (o.y * p.out.h - oh / 2) * k;
  let alpha = o.opacity ?? 1;
  if (o.fadeIn && u < o.fadeIn) alpha *= u / o.fadeIn;
  if (o.fadeOut && u > len - o.fadeOut) alpha *= Math.max(0, (len - u) / o.fadeOut);
  const props = useRef({ o, facts });
  props.current = { o, facts };
  const draw = useCallback(() => {
    const g = gc.current;
    const { o: x, facts: f } = props.current;
    if (!g || !f) return;
    const src = x.picture || f.picture ? engine.image(x.src) : (engine.element(`o:${x.id}`, x.src, 'video') as HTMLVideoElement);
    const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.videoWidth;
    const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.videoHeight;
    if (!sw || !sh) return;
    g.draw(src, sw, sh, [1, 0, 0, 1, 0, 0], { key: x.key });
  }, [engine]);
  useEffect(() => {
    if (!ref.current) return;
    gc.current = new GradeCanvas(ref.current);
    return () => {
      gc.current?.dispose();
      gc.current = null;
    };
  }, [o.id]);
  useEffect(() => engine.onFrame(draw), [engine, draw]);
  useLayoutEffect(() => {
    draw();
  });
  const picked = p.picked?.kind === 'overlay' && p.picked.id === o.id;
  // A drag: where it began, the overlay as it was, and (with Ctrl or ⌥) the id of the copy it is dragging instead.
  const drag = useRef<{ x: number; y: number; o: VideoOverlay; mode: 'move' | 'size'; moved: boolean; copy: boolean; id: string } | null>(null);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const start = (mode: 'move' | 'size') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, o, mode, moved: false, copy: mode === 'move' && isCopyDrag(e), id: o.id! };
    p.onPick({ kind: 'overlay', id: o.id! });
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3) return;
      d.moved = true;
      p.onMoveOverlay(d.id, {}, 'begin');
      // A copy is dragged: it is made now, in this step, and the overlay stays where it was.
      if (d.copy) d.id = p.onCopyDrag({ kind: 'overlay', id: d.id }) ?? d.id;
    }
    // Pixels of the output, from the overlay as it was when the drag began.
    const dx = (e.clientX - d.x) / k;
    const dy = (e.clientY - d.y) / k;
    const box = overlayBox(d.o, facts, p.out);
    const tol = pullOf(k);
    if (d.mode === 'move') {
      const m = moveBox(box, dx, dy, p.others(d.id), p.out, { tol, shift: e.shiftKey, noSnap: isNoSnap(e) });
      p.onMarks(m.marks);
      p.onMoveOverlay(d.id, { x: Math.round((d.o.x + m.dx / W) * 1000) / 1000, y: Math.round((d.o.y + m.dy / p.out.h) * 1000) / 1000 }, 'move');
    } else {
      const s = sizeBox(box, box.w + dx * 2, p.others(d.id), p.out, { tol, noSnap: isNoSnap(e), k, min: 0.03 * W });
      p.onMarks(s.marks);
      p.onMoveOverlay(d.id, { w: Math.round(Math.max(0.03, Math.min(2, s.w / W)) * 1000) / 1000 }, 'move');
    }
  };
  const stop = () => {
    if (drag.current?.moved) p.onMoveOverlay(drag.current.id, {}, 'end');
    drag.current = null;
    p.onMarks(NO_MARKS);
  };
  return (
    <div className={cx('absolute z-10', picked && 'outline-2 outline-offset-1 outline-white/90 outline-dashed')} style={{ left, top, width: ow * k, height: oh * k, touchAction: 'none' }} onPointerDown={start('move')} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      <canvas ref={ref} width={Math.max(2, Math.round(ow * k * dpr))} height={Math.max(2, Math.round(oh * k * dpr))} className="pointer-events-none h-full w-full" style={{ opacity: alpha }} />
      {picked && <span className="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-black/40" onPointerDown={start('size')} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} />}
    </div>
  );
}

/** The words that show at the playhead (and the picked one), each drawn as the edit makes it; picked, they move (and are sized by their corner). */
function Words({
  texts,
  drawn,
  t,
  out,
  k,
  picked,
  onPick,
  onMove,
  onSize,
  onCopyDrag,
  others,
  onMarks,
}: {
  texts: VideoText[];
  drawn: { url: string; w: number; h: number }[];
  t: number;
  out: { w: number; h: number };
  k: number;
  picked: Picked;
  onPick(p: Picked): void;
  onMove: ViewerProps['onMoveText'];
  onSize: ViewerProps['onSizeText'];
  onCopyDrag: ViewerProps['onCopyDrag'];
  others: (id?: string) => SnapBox[];
  onMarks: (m: Marks) => void;
}) {
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number; size: number; box: SnapBox; mode: 'move' | 'size'; moved: boolean; copy: boolean } | null>(null);
  const move = (e: React.PointerEvent) => {
    const dd = drag.current;
    if (!dd) return;
    if (!dd.moved) {
      if (Math.hypot(e.clientX - dd.px, e.clientY - dd.py) < 3) return;
      dd.moved = true;
      onMove(dd.id, dd.x, dd.y, 'begin');
      if (dd.copy) dd.id = onCopyDrag({ kind: 'text', id: dd.id }) ?? dd.id;
    }
    // Pixels of the output, from the words as they were when the drag began.
    const dx = (e.clientX - dd.px) / k;
    const dy = (e.clientY - dd.py) / k;
    const tol = pullOf(k);
    if (dd.mode === 'move') {
      const m = moveBox(dd.box, dx, dy, others(dd.id), out, { tol, shift: e.shiftKey, noSnap: isNoSnap(e) });
      onMarks(m.marks);
      const nx = Math.min(1, Math.max(0, dd.x + m.dx / out.w));
      const ny = Math.min(1, Math.max(0, dd.y + m.dy / out.h));
      onMove(dd.id, Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000, 'move');
    } else {
      const s = sizeBox(dd.box, dd.box.w + dx * 2, others(dd.id), out, { tol, noSnap: isNoSnap(e), k });
      onMarks(s.marks);
      onSize(dd.id, Math.round(Math.min(0.4, Math.max(0.02, (dd.size * s.w) / dd.box.w)) * 1000) / 1000, 'move');
    }
  };
  const stop = () => {
    const dd = drag.current;
    drag.current = null;
    onMarks(NO_MARKS);
    if (dd?.moved) onMove(dd.id, dd.x, dd.y, 'end');
  };
  const start = (x: VideoText, d: { w: number; h: number }, mode: 'move' | 'size') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: x.id!, px: e.clientX, py: e.clientY, x: x.x, y: x.y, size: x.size, box: { x: x.x * out.w - d.w / 2, y: x.y * out.h - d.h / 2, w: d.w, h: d.h }, mode, moved: false, copy: mode === 'move' && isCopyDrag(e) };
    onPick({ kind: 'text', id: x.id! });
  };
  return (
    <>
      {texts.map((x, i) => {
        const on = t >= x.from && t < x.to;
        const sel = picked?.kind === 'text' && picked.id === x.id;
        const d = drawn[i];
        if ((!on && !sel) || !d) return null;
        const w = d.w * k;
        const h = d.h * k;
        return (
          <div key={x.id ?? i} className="absolute z-20" style={{ left: x.x * out.w * k - w / 2, top: x.y * out.h * k - h / 2, width: w, height: h }}>
            <img
              src={d.url}
              alt=""
              draggable={false}
              className={cx('h-full w-full max-w-none cursor-move select-none', sel && 'outline-2 outline-offset-2 outline-white/90 outline-dashed', sel && !on && 'opacity-50')}
              style={{ touchAction: 'none' }}
              onPointerDown={start(x, d, 'move')}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
            />
            {sel && <span className="absolute -right-3 -bottom-3 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-black/40" title="Size the words" style={{ touchAction: 'none' }} onPointerDown={start(x, d, 'size')} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} />}
          </div>
        );
      })}
    </>
  );
}

/** An overlay's box in pixels of the output (its middle, its width, and the height its picture's shape gives). */
function overlayBox(o: VideoOverlay, facts: { width: number; height: number } | undefined, out: { w: number; h: number }): SnapBox {
  const w = o.w * out.w;
  const h = facts && facts.width ? (w * facts.height) / facts.width : w;
  return { x: o.x * out.w - w / 2, y: o.y * out.h - h / 2, w, h };
}

/** The pink of a drag's guides: thin lines, the gaps between parts, and small pills with a distance or a size. */
function GuideMarks({ marks, k }: { marks: Marks; k: number }) {
  const pills = [...marks.gaps.map(gapPill), ...marks.pills];
  if (!marks.guides.length && !pills.length) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 z-[45] h-full w-full overflow-visible" aria-hidden>
      {marks.guides.map((g, i) => (g.axis === 'x' ? <line key={`g${i}`} x1={g.at * k} x2={g.at * k} y1={g.from * k} y2={g.to * k} stroke={GUIDE_COLOUR} strokeWidth={1} /> : <line key={`g${i}`} y1={g.at * k} y2={g.at * k} x1={g.from * k} x2={g.to * k} stroke={GUIDE_COLOUR} strokeWidth={1} />))}
      {marks.gaps.map((g: SnapGap, i) => (
        <g key={`p${i}`} stroke={GUIDE_COLOUR} strokeWidth={1}>
          <line x1={g.x * k} y1={g.y * k} x2={(g.x + g.w) * k} y2={(g.y + g.h) * k} />
          {g.vertical ? (
            <>
              <line x1={g.x * k - 4} x2={g.x * k + 4} y1={g.y * k} y2={g.y * k} />
              <line x1={g.x * k - 4} x2={g.x * k + 4} y1={(g.y + g.h) * k} y2={(g.y + g.h) * k} />
            </>
          ) : (
            <>
              <line y1={g.y * k - 4} y2={g.y * k + 4} x1={g.x * k} x2={g.x * k} />
              <line y1={g.y * k - 4} y2={g.y * k + 4} x1={(g.x + g.w) * k} x2={(g.x + g.w) * k} />
            </>
          )}
        </g>
      ))}
      {pills.map((q, i) => {
        const w = q.text.length * 6.2 + 10;
        return (
          <g key={`t${i}`} transform={`translate(${q.x * k} ${q.y * k})`}>
            <rect x={-w / 2} y={-8} width={w} height={16} rx={5} fill={GUIDE_COLOUR} />
            <text y={3.8} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#fff" fontFamily="system-ui, sans-serif">
              {q.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Each text drawn at the output's size, kept while it is the same. */
export function useDrawnTexts(texts: VideoText[], w: number, h: number) {
  const kept = useRef(new Map<string, { url: string; w: number; h: number }>());
  return useMemo(() => {
    const next = new Map<string, { url: string; w: number; h: number }>();
    const out = texts.map((t) => {
      const key = JSON.stringify([t.text, t.size, t.color, t.background, t.outline, t.bold, w, h]);
      let d = kept.current.get(key);
      if (!d) {
        const c = drawText(t, w, h);
        d = { url: c.toDataURL('image/png'), w: c.width, h: c.height };
      }
      next.set(key, d);
      return d;
    });
    kept.current = next;
    return out;
  }, [texts, w, h]);
}

/** The line between before and after, dragged across. */
function SplitLine({ split, onSplit }: { split: number; onSplit?: (x: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="absolute inset-y-0 z-50 w-4 -translate-x-1/2 cursor-ew-resize"
      style={{ left: `${split * 100}%`, touchAction: 'none' }}
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const box = ref.current?.parentElement?.getBoundingClientRect();
        if (box) onSplit?.(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
      }}
    >
      <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
      <span className="absolute top-2 right-3 rounded bg-black/60 px-1 text-[10px] text-white">Before</span>
      <span className="absolute top-2 left-3 rounded bg-black/60 px-1 text-[10px] text-white">After</span>
    </div>
  );
}

// ---- the crop box -------------------------------------------------------------------------------------------------

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN = 32;

/** A crop box moved or sized by `h` by (dx, dy) pixels of the upright frame, kept inside it and to its shape. */
export function dragCrop(c: VideoCrop, h: Handle, dx: number, dy: number, frame: { w: number; h: number }, ratio: number): VideoCrop {
  if (h === 'move') return { ...c, x: Math.round(Math.min(frame.w - c.w, Math.max(0, c.x + dx))), y: Math.round(Math.min(frame.h - c.h, Math.max(0, c.y + dy))) };
  let x0 = c.x;
  let y0 = c.y;
  let x1 = c.x + c.w;
  let y1 = c.y + c.h;
  if (h.includes('w')) x0 = Math.min(x1 - MIN, Math.max(0, x0 + dx));
  if (h.includes('e')) x1 = Math.max(x0 + MIN, Math.min(frame.w, x1 + dx));
  if (h.includes('n')) y0 = Math.min(y1 - MIN, Math.max(0, y0 + dy));
  if (h.includes('s')) y1 = Math.max(y0 + MIN, Math.min(frame.h, y1 + dy));
  if (Number.isFinite(ratio)) {
    let w = x1 - x0;
    let hh = y1 - y0;
    if (h === 'n' || h === 's') w = hh * ratio;
    else if (h === 'e' || h === 'w') hh = w / ratio;
    else if (w / hh > ratio) hh = w / ratio;
    else w = hh * ratio;
    const kk = Math.min(1, frame.w / w, frame.h / hh);
    w *= kk;
    hh *= kk;
    const cx0 = (x0 + x1) / 2;
    const cy0 = (y0 + y1) / 2;
    x0 = h.includes('w') ? x1 - w : h.includes('e') ? x0 : cx0 - w / 2;
    y0 = h.includes('n') ? y1 - hh : h.includes('s') ? y0 : cy0 - hh / 2;
    x0 = Math.min(frame.w - w, Math.max(0, x0));
    y0 = Math.min(frame.h - hh, Math.max(0, y0));
    x1 = x0 + w;
    y1 = y0 + hh;
  }
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

/** The picked clip's whole frame, with its crop box to move and size. */
function CropView(p: ViewerProps & { clip: VideoClip; room: { w: number; h: number } }) {
  const c = p.clip;
  const facts = p.factsOf(c.src);
  const up = facts ? turnedSize(facts.width, facts.height, c.rotate) : { w: 16, h: 9 };
  const b = fit(up.w, up.h, Math.max(40, p.room.w - 56), Math.max(40, p.room.h - 56));
  const ref = useRef<HTMLCanvasElement>(null);
  const gc = useRef<GradeCanvas | null>(null);
  const draw = useCallback(() => {
    const g = gc.current;
    if (!g || !facts) return;
    const src = c.picture || facts.picture ? p.engine.image(c.src) : (p.engine.element(`c:${c.id}`, c.src, 'video') as HTMLVideoElement);
    const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.videoWidth;
    const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.videoHeight;
    if (!sw || !sh) return;
    g.draw(src, sw, sh, uvMap(facts.width, facts.height, c, { x: 0, y: 0, w: up.w, h: up.h }), { grade: c.grade });
  }, [c, facts, p.engine, up.w, up.h]);
  useEffect(() => {
    if (!ref.current) return;
    gc.current = new GradeCanvas(ref.current);
    return () => {
      gc.current?.dispose();
      gc.current = null;
    };
  }, []);
  useEffect(() => p.engine.onFrame(draw), [p.engine, draw]);
  useLayoutEffect(() => draw());
  const crop = c.crop ?? { x: 0, y: 0, w: up.w, h: up.h };
  const drag = useRef<{ h: Handle; px: number; py: number; c: VideoCrop } | null>(null);
  const start = (h: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { h, px: e.clientX, py: e.clientY, c: crop };
    p.onCrop(crop, 'begin');
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    p.onCrop(dragCrop(d.c, d.h, (e.clientX - d.px) / b.k, (e.clientY - d.py) / b.k, up, shapeRatio(p.crop?.shape ?? 'free')), 'move');
  };
  const stop = () => {
    if (!drag.current) return;
    drag.current = null;
    p.onCrop(crop, 'end');
  };
  const s = { left: crop.x * b.k, top: crop.y * b.k, width: crop.w * b.k, height: crop.h * b.k };
  return (
    <div className="relative shrink-0 bg-black" style={{ width: b.w, height: b.h }}>
      <canvas ref={ref} width={Math.round(b.w * Math.min(2, devicePixelRatio || 1))} height={Math.round(b.h * Math.min(2, devicePixelRatio || 1))} className="absolute inset-0 h-full w-full" />
      <div className="absolute border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" style={{ ...s, touchAction: 'none' }} onPointerDown={start('move')} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border-white/25 [&:nth-child(-n+6)]:border-b [&:not(:nth-child(3n))]:border-r" />
          ))}
        </div>
        <div className="absolute inset-0 cursor-move" />
        {HANDLES.map((h) => (
          <div
            key={h}
            onPointerDown={start(h)}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            className={cx(
              'absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/30 shadow max-sm:h-6 max-sm:w-6',
              (h === 'n' || h === 's') && 'cursor-ns-resize',
              (h === 'e' || h === 'w') && 'cursor-ew-resize',
              (h === 'ne' || h === 'sw') && 'cursor-nesw-resize',
              (h === 'nw' || h === 'se') && 'cursor-nwse-resize',
            )}
            style={{ left: h.includes('w') ? 0 : h.includes('e') ? '100%' : '50%', top: h.includes('n') ? 0 : h.includes('s') ? '100%' : '50%', touchAction: 'none' }}
          />
        ))}
      </div>
    </div>
  );
}

// ---- the transport ------------------------------------------------------------------------------------------------

export function Transport({
  engine,
  clock,
  fps,
  length,
  playing,
  inOut,
  onIn,
  onOut,
  zoom,
  onZoom,
  safe,
  onSafe,
  grid,
  onGrid,
  compact,
  extra,
}: {
  engine: Engine;
  clock: Clock;
  fps: number;
  length: number;
  playing: boolean;
  inOut: [number | null, number | null];
  onIn: () => void;
  onOut: () => void;
  zoom: number | 'fit';
  onZoom: (z: number | 'fit') => void;
  safe: boolean;
  onSafe: () => void;
  grid: boolean;
  onGrid: () => void;
  compact?: boolean;
  extra?: ReactNode;
}) {
  const t = useClock(clock);
  const frame = 1 / fps;
  const step = (n: number) => {
    engine.pause();
    engine.seek(Math.round((clock.get() + n * frame) * fps) / fps);
  };
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-t border-line bg-bg px-2">
      <Tool label="Go to the start" keys="Home" onClick={() => engine.seek(0)}>
        <ChevronFirst size={15} />
      </Tool>
      {!compact && (
        <Tool label="Back a frame" keys="←" onClick={() => step(-1)}>
          <StepBack size={15} />
        </Tool>
      )}
      <button type="button" onClick={() => engine.toggle()} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space or K)' : 'Play (Space or L)'} className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg hover:opacity-90">
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="translate-x-px" />}
      </button>
      {!compact && (
        <Tool label="On a frame" keys="→" onClick={() => step(1)}>
          <StepForward size={15} />
        </Tool>
      )}
      <Tool label="Go to the end" keys="End" onClick={() => engine.seek(length)}>
        <ChevronLast size={15} />
      </Tool>
      <div className="tnum ml-2 flex min-w-0 items-baseline gap-2 font-mono whitespace-nowrap" translate="no">
        <span className="text-[15px] font-medium tracking-tight text-fg">{timecode(t, fps)}</span>
        {!compact && <span className="truncate text-[11.5px] text-fg-3 max-lg:hidden">{timecode(length, fps)}</span>}
      </div>
      <span className="min-w-1 flex-1" />
      {extra}
      {!compact && (
        <>
          <Tool label="Mark In" keys="I" on={inOut[0] !== null} onClick={onIn}>
            <SkipBack size={14} />
          </Tool>
          <Tool label="Mark Out" keys="O" on={inOut[1] !== null} onClick={onOut}>
            <SkipForward size={14} />
          </Tool>
          <Tool label="Safe areas" on={safe} onClick={onSafe}>
            <Scan size={15} />
          </Tool>
          <Tool label="Grid of thirds" on={grid} onClick={onGrid}>
            <Grid3x3 size={15} />
          </Tool>
          <Choices<string>
            value={String(zoom)}
            onChange={(v) => onZoom(v === 'fit' ? 'fit' : Number(v))}
            options={[
              { value: 'fit', label: 'Fit' },
              { value: '1', label: '100%' },
            ]}
            className="w-[96px] shrink-0"
          />
        </>
      )}
    </div>
  );
}
