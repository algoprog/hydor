// The picture in the editor: fitted to its area, zoomed with the wheel, a pinch or the buttons (around the pointer),
// moved by dragging with two fingers, the middle button, Space held, or simply a drag where the tool draws nothing.
// It draws the picture (a quiet checkerboard behind its see-through parts) and its marks on one canvas the size of its
// area, crisp at any zoom, and over it what the tool shows: the crop's box and handles, the mark picked (moved by
// dragging, × to delete, its corners to resize a box), words being written, the brush's ring. Everything it reports
// is in the frame's own pixels, its top left at 0, 0.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Box, Mark } from '@shared/mediaedit';
import { cx } from '../../components/ui';
import { drawMarks, markBox } from './render';

/** How the frame sits on screen: `z` screen pixels a frame pixel, its top left at `ox`, `oy`. */
export interface ViewT {
  z: number;
  ox: number;
  oy: number;
}

/** What a press on the picture starts: told where the pointer goes (frame pixels), and when it lets go. */
export interface Gesture {
  move(x: number, y: number, e: PointerEvent): void;
  up(x: number, y: number, e: PointerEvent): void;
}

export interface ViewHandle {
  zoomBy(f: number): void;
  fit(): void;
  /** One pixel of the picture to one of the screen. */
  actual(): void;
  zoom(): number;
}

/** A brush stroke over the picture: its width and the points it went through, in frame pixels. */
export interface Stroke {
  size: number;
  pts: number[];
}

const INK = '#ec4899';
const MIN_Z = 0.02;
const MAX_Z = 32;

function checker(dark: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = dark ? '#2b2b2f' : '#ffffff';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = dark ? '#36363b' : '#e9e9ec';
  g.fillRect(0, 0, 8, 8);
  g.fillRect(8, 8, 8, 8);
  return c;
}

export const PictureView = forwardRef<
  ViewHandle,
  {
    /** The picture drawn small (`photo.width` ÷ `frame.w` of its pixels a frame pixel), or null while it is made. */
    photo: HTMLCanvasElement | null;
    /** The frame shown, in frame pixels; `at` is its top left in the coordinates of `marks`. */
    frame: { w: number; h: number; at: { x: number; y: number } };
    marks: Mark[];
    /** Hidden areas' edges shown (the markup tool). */
    outline?: boolean;
    selected?: Mark | null;
    onDelete?: () => void;
    /** A press on the picture (frame pixels): a gesture, or null to move the picture around instead. */
    onPress?: (x: number, y: number, e: PointerEvent, t: ViewT) => Gesture | null;
    onDoubleClick?: (x: number, y: number) => void;
    /** Brush strokes shown in pink, and the brush's ring at the pointer (`brush`: its width on screen); a stroke ends into `onStrokes`. */
    strokes?: Stroke[];
    brush?: number;
    onStrokes?: (s: Stroke[]) => void;
    cursor?: string;
    /** What goes over the picture, placed with the view's numbers (the crop's box, words being written). */
    children?: (t: ViewT) => ReactNode;
    /** Told how large a frame pixel is on screen, as it changes. */
    onZoom?: (z: number) => void;
    className?: string;
  }
>(function PictureView({ photo, frame, marks, outline, selected, onDelete, onPress, onDoubleClick, strokes, brush, onStrokes, cursor, children, onZoom, className }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // 'fit' follows the area's size; a number is the zoom picked.
  const [view, setView] = useState<{ z: number | 'fit'; ox: number; oy: number }>({ z: 'fit', ox: 0, oy: 0 });
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const live = useRef<Stroke | null>(null);
  const sink = useRef(onStrokes);
  sink.current = onStrokes;
  const strokesNow = useRef(strokes);
  strokesNow.current = strokes;
  const space = useRef(false);
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const pattern = useRef<{ dark: boolean; c: HTMLCanvasElement } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    r();
    const ro = new ResizeObserver(r);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = size.w < 500 ? 12 : 28;
  const fitZ = size.w && size.h ? Math.max(MIN_Z, Math.min((size.w - pad * 2) / frame.w, (size.h - pad * 2) / frame.h)) : 1;
  const t: ViewT = view.z === 'fit' ? { z: fitZ, ox: (size.w - frame.w * fitZ) / 2, oy: (size.h - frame.h * fitZ) / 2 } : { z: view.z, ox: view.ox, oy: view.oy };
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    onZoom?.(t.z);
  }, [t.z, onZoom]);
  // A new frame (cropped, turned, another tool) is fitted again.
  const shape = `${Math.round(frame.w)}x${Math.round(frame.h)}`;
  useEffect(() => {
    setView({ z: 'fit', ox: 0, oy: 0 });
  }, [shape]);

  const zoomAt = useCallback((f: number, sx: number, sy: number) => {
    const c = tRef.current;
    const z = Math.max(MIN_Z, Math.min(MAX_Z, c.z * f));
    // The point under the pointer stays under it.
    setView({ z, ox: sx - ((sx - c.ox) / c.z) * z, oy: sy - ((sy - c.oy) / c.z) * z });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomBy: (f) => zoomAt(f, size.w / 2, size.h / 2),
      fit: () => setView({ z: 'fit', ox: 0, oy: 0 }),
      actual: () => {
        const c = tRef.current;
        zoomAt(1 / c.z, size.w / 2, size.h / 2);
      },
      zoom: () => tRef.current.z,
    }),
    [zoomAt, size.w, size.h],
  );

  // ---- drawing ----
  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fw = frame.w * t.z;
    const fh = frame.h * t.z;
    if (pattern.current?.dark !== dark) pattern.current = { dark, c: checker(dark) };
    const pat = g.createPattern(pattern.current.c, 'repeat');
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(t.ox, t.oy, fw, fh);
    }
    if (photo) {
      // Close up, a pixel shows as a square: smoothing would blur what is being worked on.
      g.imageSmoothingEnabled = (photo.width / frame.w) * t.z < 3;
      g.imageSmoothingQuality = 'high';
      g.drawImage(photo, t.ox, t.oy, fw, fh);
    }
    g.save();
    g.beginPath();
    g.rect(t.ox, t.oy, fw, fh);
    g.clip();
    g.setTransform(dpr * t.z, 0, 0, dpr * t.z, dpr * (t.ox - frame.at.x * t.z), dpr * (t.oy - frame.at.y * t.z));
    drawMarks(g, marks, { outline });
    g.restore();
    const all = live.current ? [...(strokes ?? []), live.current] : strokes;
    if (all?.length) {
      g.save();
      g.setTransform(dpr * t.z, 0, 0, dpr * t.z, dpr * t.ox, dpr * t.oy);
      g.globalAlpha = 0.55;
      g.strokeStyle = INK;
      g.fillStyle = INK;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const s of all) {
        g.lineWidth = s.size;
        g.beginPath();
        if (s.pts.length <= 2) {
          g.arc(s.pts[0], s.pts[1], s.size / 2, 0, Math.PI * 2);
          g.fill();
          continue;
        }
        g.moveTo(s.pts[0], s.pts[1]);
        for (let i = 2; i + 1 < s.pts.length; i += 2) g.lineTo(s.pts[i], s.pts[i + 1]);
        g.stroke();
      }
      g.restore();
    }
  });

  // ---- pointers ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; mx: number; my: number; z: number; ox: number; oy: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [, redraw] = useState(0);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const toFrame = (sx: number, sy: number) => {
    const c = tRef.current;
    return { x: (sx - c.ox) / c.z, y: (sy - c.oy) / c.z };
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]')) space.current = true;
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && (space.current = false);
    // Heard first: the editor keeps its keys from the page under it.
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-over]')) return;
    const { sx, sy } = local(e);
    pointers.current.set(e.pointerId, { x: sx, y: sy });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      // A second finger: whatever the first began stops, and the two zoom and move the picture.
      gesture.current = null;
      live.current = null;
      panning.current = null;
      const [a, b] = [...pointers.current.values()];
      const c = tRef.current;
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, z: c.z, ox: c.ox, oy: c.oy };
      return;
    }
    if (pointers.current.size > 2) return;
    const c = tRef.current;
    if (e.button === 1 || space.current || e.button === 2) {
      panning.current = { x: sx, y: sy, ox: c.ox, oy: c.oy };
      return;
    }
    if (e.button !== 0) return;
    const f = toFrame(sx, sy);
    if (brush) {
      live.current = { size: brush / c.z, pts: [f.x, f.y] };
      redraw((n) => n + 1);
      return;
    }
    const g = onPress?.(f.x, f.y, e.nativeEvent, c) ?? null;
    if (g) gesture.current = g;
    else panning.current = { x: sx, y: sy, ox: c.ox, oy: c.oy };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { sx, sy } = local(e);
    if (brush) setRing({ x: sx, y: sy });
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: sx, y: sy });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const z = Math.max(MIN_Z, Math.min(MAX_Z, (p.z * Math.hypot(a.x - b.x, a.y - b.y)) / p.d));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      setView({ z, ox: mx - ((p.mx - p.ox) / p.z) * z, oy: my - ((p.my - p.oy) / p.z) * z });
      return;
    }
    if (panning.current) {
      const p = panning.current;
      const c = tRef.current;
      setView({ z: c.z, ox: p.ox + sx - p.x, oy: p.oy + sy - p.y });
      return;
    }
    const f = toFrame(sx, sy);
    if (live.current) {
      const co = e.nativeEvent.getCoalescedEvents?.();
      for (const ev of co?.length ? co : [e.nativeEvent]) {
        const q = local(ev);
        const fr = toFrame(q.sx, q.sy);
        live.current.pts.push(fr.x, fr.y);
      }
      redraw((n) => n + 1);
      return;
    }
    gesture.current?.move(f.x, f.y, e.nativeEvent);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    panning.current = null;
    const { sx, sy } = local(e);
    const f = toFrame(sx, sy);
    if (live.current) {
      const s = live.current;
      live.current = null;
      if (e.pointerType !== 'mouse') setRing(null);
      // The newest owner and strokes: a stroke may end after a re-render.
      sink.current?.([...(strokesNow.current ?? []), s]);
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    g?.up(f.x, f.y, e.nativeEvent);
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { sx, sy } = local(e);
      // A trackpad's pinch comes as the wheel with Ctrl: smaller steps, so the same factor for both.
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      zoomAt(f, sx, sy);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  const sel = selected ? markBox(selected) : null;
  const resizable = selected && (selected.type === 'rect' || selected.type === 'ellipse' || selected.type === 'blur' || selected.type === 'pixelate');
  return (
    <div
      ref={box}
      className={cx('min-h-0 touch-none overflow-hidden bg-bg-1 select-none', className ?? 'relative')}
      style={{ cursor: brush ? 'none' : panning.current ? 'grabbing' : cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => !live.current && setRing(null)}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-over]')) return;
        const { sx, sy } = local(e);
        const f = toFrame(sx, sy);
        onDoubleClick?.(f.x, f.y);
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {sel && selected && (
        <div
          className="pointer-events-none absolute rounded-[3px] border border-dashed border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ left: t.ox + (sel.x - frame.at.x) * t.z - 4, top: t.oy + (sel.y - frame.at.y) * t.z - 4, width: sel.w * t.z + 8, height: sel.h * t.z + 8 }}
        >
          {onDelete && (
            <button
              type="button"
              data-over
              onClick={onDelete}
              aria-label="Delete the mark"
              title="Delete the mark"
              className="pointer-events-auto absolute -top-9 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-elevated text-fg shadow-md hover:bg-bg-2"
            >
              <X size={13} />
            </button>
          )}
          {resizable &&
            ['nw', 'ne', 'sw', 'se'].map((c) => (
              <span key={c} data-corner={c} className={cx('absolute h-2.5 w-2.5 rounded-full border border-black/40 bg-white', c[0] === 'n' ? '-top-1.5' : '-bottom-1.5', c[1] === 'w' ? '-left-1.5' : '-right-1.5')} />
            ))}
        </div>
      )}
      {children?.(t)}
      {brush && ring && (
        <span aria-hidden className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]" style={{ left: ring.x, top: ring.y, width: brush, height: brush, transform: 'translate(-50%,-50%)' }} />
      )}
    </div>
  );
});

/** The crop's box over the picture: dragged inside to move it, by its edges and corners to size it (keeping `ratio` when set). */
export function CropBox({ t, crop, frame, ratio, onChange }: { t: ViewT; crop: Box; frame: { w: number; h: number }; ratio: number | null; onChange: (b: Box, done: boolean) => void }) {
  const drag = useRef<{ kind: string; sx: number; sy: number; b: Box } | null>(null);
  const [active, setActive] = useState(false);
  const start = (kind: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, sx: e.clientX, sy: e.clientY, b: crop };
    setActive(true);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const dx = (e.clientX - d.sx) / t.z;
    const dy = (e.clientY - d.sy) / t.z;
    onChange(dragCrop(d.b, d.kind, dx, dy, frame, ratio), false);
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    drag.current = null;
    setActive(false);
    onChange(dragCrop(d.b, d.kind, (e.clientX - d.sx) / t.z, (e.clientY - d.sy) / t.z, frame, ratio), true);
  };
  const L = t.ox + crop.x * t.z;
  const T = t.oy + crop.y * t.z;
  const W = crop.w * t.z;
  const H = crop.h * t.z;
  const handle = (kind: string, cls: string) => (
    <span
      key={kind}
      data-over
      onPointerDown={start(kind)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={cx('absolute z-10 flex touch-none items-center justify-center', cls)}
      style={{ cursor: kind === 'n' || kind === 's' ? 'ns-resize' : kind === 'e' || kind === 'w' ? 'ew-resize' : kind === 'nw' || kind === 'se' ? 'nwse-resize' : 'nesw-resize' }}
    >
      <span className={cx('bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]', kind.length === 2 ? 'h-3.5 w-3.5 rounded-[3px]' : kind === 'n' || kind === 's' ? 'h-1 w-6 rounded-full' : 'h-6 w-1 rounded-full')} />
    </span>
  );
  return (
    <div
      data-over
      className="absolute touch-none border border-white/90 shadow-[0_0_0_99999px_rgba(0,0,0,0.5)]"
      style={{ left: L, top: T, width: W, height: H, cursor: 'move' }}
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {/* Thirds, to place things by. */}
      <div className={cx('pointer-events-none absolute inset-0', !active && 'opacity-0')}>
        {[1, 2].map((i) => (
          <span key={`v${i}`} className="absolute top-0 bottom-0 w-px bg-white/45" style={{ left: `${(i * 100) / 3}%` }} />
        ))}
        {[1, 2].map((i) => (
          <span key={`h${i}`} className="absolute right-0 left-0 h-px bg-white/45" style={{ top: `${(i * 100) / 3}%` }} />
        ))}
      </div>
      {handle('nw', '-top-3 -left-3 h-6 w-6')}
      {handle('ne', '-top-3 -right-3 h-6 w-6')}
      {handle('sw', '-bottom-3 -left-3 h-6 w-6')}
      {handle('se', '-right-3 -bottom-3 h-6 w-6')}
      {handle('n', '-top-3 left-1/2 h-6 w-10 -translate-x-1/2')}
      {handle('s', '-bottom-3 left-1/2 h-6 w-10 -translate-x-1/2')}
      {handle('w', 'top-1/2 -left-3 h-10 w-6 -translate-y-1/2')}
      {handle('e', 'top-1/2 -right-3 h-10 w-6 -translate-y-1/2')}
    </div>
  );
}

/** The crop dragged: moved, or an edge or corner pulled, within the frame, keeping `ratio` (width ÷ height) when set. */
export function dragCrop(b: Box, kind: string, dx: number, dy: number, frame: { w: number; h: number }, ratio: number | null): Box {
  const MIN = Math.max(8, Math.min(frame.w, frame.h) * 0.02);
  if (kind === 'move') {
    const x = Math.max(0, Math.min(frame.w - b.w, b.x + dx));
    const y = Math.max(0, Math.min(frame.h - b.h, b.y + dy));
    return { x: Math.round(x), y: Math.round(y), w: b.w, h: b.h };
  }
  let x0 = b.x;
  let y0 = b.y;
  let x1 = b.x + b.w;
  let y1 = b.y + b.h;
  if (kind.includes('w')) x0 = Math.max(0, Math.min(x1 - MIN, x0 + dx));
  if (kind.includes('e')) x1 = Math.min(frame.w, Math.max(x0 + MIN, x1 + dx));
  if (kind.includes('n')) y0 = Math.max(0, Math.min(y1 - MIN, y0 + dy));
  if (kind.includes('s')) y1 = Math.min(frame.h, Math.max(y0 + MIN, y1 + dy));
  if (ratio) {
    let w = x1 - x0;
    let h = y1 - y0;
    // The side pulled leads; the other follows, within the frame.
    if (kind === 'n' || kind === 's') w = h * ratio;
    else if (kind === 'e' || kind === 'w') h = w / ratio;
    else if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
    const roomW = kind.includes('w') ? x1 : kind.includes('e') ? frame.w - x0 : frame.w;
    const roomH = kind.includes('n') ? y1 : kind.includes('s') ? frame.h - y0 : frame.h;
    const k = Math.min(1, roomW / w, roomH / h);
    w *= k;
    h *= k;
    if (kind.includes('w')) x0 = x1 - w;
    else if (kind.includes('e')) x1 = x0 + w;
    else {
      const cx = (b.x + b.x + b.w) / 2;
      x0 = Math.max(0, Math.min(frame.w - w, cx - w / 2));
      x1 = x0 + w;
    }
    if (kind.includes('n')) y0 = y1 - h;
    else if (kind.includes('s')) y1 = y0 + h;
    else {
      const cy = (b.y + b.y + b.h) / 2;
      y0 = Math.max(0, Math.min(frame.h - h, cy - h / 2));
      y1 = y0 + h;
    }
  }
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)) };
}
