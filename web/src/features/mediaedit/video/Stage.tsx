// The video editor's picture: the video as the edit will make it, in the browser (turned, mirrored, cropped and
// coloured as ffmpeg will, with the words where they go and the fades from and to black); with the Crop tool, the whole
// picture with the crop box over it to move and size (to a shape, or free). The words can be moved where they show.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { cssBrightness, cssContrast, cssSaturate, shapeRatio, toEdited, turnedSize, type VideoCrop, type VideoRecipe } from '@shared/mediaedit-video';
import { cx } from '../../../components/ui';
import { useClock, type Clock } from './clock';

/** The CSS turn and mirror of a video `w`×`h` into its upright frame, the same as ffmpeg's transpose and flips. */
export function turnCss(w: number, h: number, r: Pick<VideoRecipe, 'rotate' | 'flipH' | 'flipV'>): string {
  const t = r.rotate ?? 0;
  const turn = t === 90 ? `translate(${h}px, 0px) rotate(90deg)` : t === 180 ? `translate(${w}px, ${h}px) rotate(180deg)` : t === 270 ? `translate(0px, ${w}px) rotate(270deg)` : '';
  const u = turnedSize(w, h, t);
  const flips = `${r.flipV ? `translate(0px, ${u.h}px) scaleY(-1) ` : ''}${r.flipH ? `translate(${u.w}px, 0px) scaleX(-1) ` : ''}`;
  return `${flips}${turn}`.trim() || 'none';
}

/** The colour as the export makes it (server/mediaedit/video-plan.ts colourMath does the same sums). */
export const colourCss = (r: Pick<VideoRecipe, 'brightness' | 'contrast' | 'saturation'>) =>
  r.brightness || r.contrast || r.saturation ? `brightness(${cssBrightness(r.brightness)}) contrast(${cssContrast(r.contrast)}) saturate(${cssSaturate(r.saturation)})` : 'none';

/** How dark the fades make a moment of the edited video (0 clear, 1 black). */
export function fadeAt(e: number, length: number, r: Pick<VideoRecipe, 'fadeIn' | 'fadeOut'>): number {
  let dark = 0;
  if (r.fadeIn && e < r.fadeIn) dark = Math.max(dark, 1 - e / r.fadeIn);
  if (r.fadeOut && e > length - r.fadeOut) dark = Math.max(dark, 1 - (length - e) / r.fadeOut);
  return Math.min(1, Math.max(0, dark));
}

/** A text as the stage shows it: its drawing, and where and when it shows. */
export interface ShownText {
  url: string;
  w: number;
  h: number;
  x: number;
  y: number;
  from: number;
  to: number;
}

export interface StageProps {
  url: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The video's size as the browser shows it. */
  w: number;
  h: number;
  recipe: VideoRecipe;
  parts: [number, number][];
  length: number;
  clock: Clock;
  cropping: boolean;
  shape: string;
  onCrop(c: VideoCrop, phase: 'begin' | 'move' | 'end'): void;
  texts: ShownText[];
  picked: number | null;
  /** The Text tool is in use: the words can be picked and moved. */
  writing: boolean;
  onPickText(i: number | null): void;
  onMoveText(i: number, x: number, y: number, phase: 'begin' | 'move' | 'end'): void;
  onVideoError(): void;
  onVideoReady(w: number, h: number): void;
}

/** The largest box of `w`×`h`'s shape that fits in `aw`×`ah`. */
const fit = (w: number, h: number, aw: number, ah: number) => {
  const k = Math.min(aw / w, ah / h);
  return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)), k };
};

export function Stage(p: StageProps) {
  const area = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const up = turnedSize(p.w, p.h, p.recipe.rotate);
  // What shows: the whole upright picture while cropping, else its crop.
  const view = p.cropping || !p.recipe.crop ? { x: 0, y: 0, w: up.w, h: up.h } : p.recipe.crop;
  const pad = p.cropping ? 28 : 12;
  const box = fit(view.w, view.h, Math.max(40, room.w - pad * 2), Math.max(40, room.h - pad * 2));
  return (
    <div ref={area} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-bg-1" onPointerDown={(e) => e.target === e.currentTarget && p.onPickText(null)}>
      {room.w > 0 && (
        <div className="relative overflow-hidden bg-black" style={{ width: box.w, height: box.h }} onPointerDown={(e) => e.target === e.currentTarget && p.onPickText(null)}>
          <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ width: up.w, height: up.h, transform: `translate(${-view.x * box.k}px, ${-view.y * box.k}px) scale(${box.k})` }}>
            <video
              ref={p.videoRef as RefObject<HTMLVideoElement>}
              src={p.url}
              preload="auto"
              playsInline
              onError={p.onVideoError}
              onLoadedMetadata={(e) => p.onVideoReady(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
              className="absolute top-0 left-0 max-w-none origin-top-left object-fill"
              style={{ width: p.w, height: p.h, transform: turnCss(p.w, p.h, p.recipe), filter: colourCss(p.recipe) }}
            />
          </div>
          {!p.cropping && <Words {...p} k={box.k} sw={box.w} sh={box.h} />}
          {!p.cropping && <Fade clock={p.clock} parts={p.parts} speed={p.recipe.speed ?? 1} length={p.length} recipe={p.recipe} />}
          {p.cropping && <CropBox crop={p.recipe.crop ?? { x: 0, y: 0, w: up.w, h: up.h }} frame={up} k={box.k} shape={p.shape} onCrop={p.onCrop} />}
        </div>
      )}
    </div>
  );
}

/** Black over the picture as the fades make it, following the video. */
function Fade({ clock, parts, speed, length, recipe }: { clock: Clock; parts: [number, number][]; speed: number; length: number; recipe: VideoRecipe }) {
  const t = useClock(clock);
  const dark = recipe.fadeIn || recipe.fadeOut ? fadeAt(toEdited(t, parts, speed), length, recipe) : 0;
  return dark > 0 ? <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dark }} /> : null;
}

/** The words that show at the moment the video is at (the picked one always, while writing), each movable. */
function Words(p: StageProps & { k: number; sw: number; sh: number }) {
  const t = useClock(p.clock);
  const drag = useRef<{ i: number; px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  return (
    <>
      {p.texts.map((x, i) => {
        const on = t >= x.from && t < x.to;
        const picked = p.writing && p.picked === i;
        if (!on && !picked) return null;
        const w = x.w * p.k;
        const h = x.h * p.k;
        return (
          <img
            key={i}
            src={x.url}
            alt=""
            draggable={false}
            className={cx('absolute max-w-none select-none', p.writing ? 'cursor-move' : 'pointer-events-none', picked && 'outline-2 outline-offset-2 outline-white/90 outline-dashed', picked && !on && 'opacity-50')}
            style={{ left: x.x * p.sw - w / 2, top: x.y * p.sh - h / 2, width: w, height: h, touchAction: 'none' }}
            onPointerDown={(e) => {
              if (!p.writing) return;
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { i, px: e.clientX, py: e.clientY, x: x.x, y: x.y, moved: false };
              p.onPickText(i);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (!d.moved) {
                if (Math.hypot(e.clientX - d.px, e.clientY - d.py) < 3) return;
                d.moved = true;
                p.onMoveText(d.i, d.x, d.y, 'begin');
              }
              const nx = Math.min(1, Math.max(0, d.x + (e.clientX - d.px) / p.sw));
              const ny = Math.min(1, Math.max(0, d.y + (e.clientY - d.py) / p.sh));
              p.onMoveText(d.i, Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000, 'move');
            }}
            onPointerUp={() => {
              const d = drag.current;
              drag.current = null;
              if (d?.moved) p.onMoveText(d.i, d.x, d.y, 'end');
            }}
          />
        );
      })}
    </>
  );
}

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
    // To its shape: the side dragged leads; the other follows about the middle (or from the corner held).
    let w = x1 - x0;
    let hh = y1 - y0;
    if (h === 'n' || h === 's') w = hh * ratio;
    else if (h === 'e' || h === 'w') hh = w / ratio;
    else if (w / hh > ratio) hh = w / ratio;
    else w = hh * ratio;
    const k = Math.min(1, frame.w / w, frame.h / hh);
    w *= k;
    hh *= k;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    x0 = h.includes('w') ? x1 - w : h.includes('e') ? x0 : cx - w / 2;
    y0 = h.includes('n') ? y1 - hh : h.includes('s') ? y0 : cy - hh / 2;
    x0 = Math.min(frame.w - w, Math.max(0, x0));
    y0 = Math.min(frame.h - hh, Math.max(0, y0));
    x1 = x0 + w;
    y1 = y0 + hh;
  }
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

function CropBox({ crop, frame, k, shape, onCrop }: { crop: VideoCrop; frame: { w: number; h: number }; k: number; shape: string; onCrop: StageProps['onCrop'] }) {
  const drag = useRef<{ h: Handle; px: number; py: number; c: VideoCrop } | null>(null);
  const start = (h: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { h, px: e.clientX, py: e.clientY, c: crop };
    onCrop(crop, 'begin');
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    onCrop(dragCrop(d.c, d.h, (e.clientX - d.px) / k, (e.clientY - d.py) / k, frame, shapeRatio(shape)), 'move');
  };
  const stop = () => {
    if (!drag.current) return;
    drag.current = null;
    onCrop(crop, 'end');
  };
  const s = { left: crop.x * k, top: crop.y * k, width: crop.w * k, height: crop.h * k };
  return (
    <div className="absolute border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" style={{ ...s, touchAction: 'none' }} onPointerDown={start('move')} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      {/* Thirds, to place what matters. */}
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
            'absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/30 shadow max-sm:h-6 max-sm:w-6',
            (h === 'n' || h === 's') && 'cursor-ns-resize',
            (h === 'e' || h === 'w') && 'cursor-ew-resize',
            (h === 'ne' || h === 'sw') && 'cursor-nesw-resize',
            (h === 'nw' || h === 'se') && 'cursor-nwse-resize',
          )}
          style={{ left: h.includes('w') ? 0 : h.includes('e') ? '100%' : '50%', top: h.includes('n') ? 0 : h.includes('s') ? '100%' : '50%', touchAction: 'none' }}
        />
      ))}
    </div>
  );
}
