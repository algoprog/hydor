// Painting over part of a picture: what to change or to take away. The picture as large as the dialog allows, the
// paint over it in a see-through pink, a ring that shows the brush's size where the pointer is; mouse, pen and touch
// alike (touch paints rather than scrolls). Below it the brush's size, Undo and Clear.
import { useLayoutEffect, useRef, useState } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import { IconButton } from '../../../components/ui';
import { paint, type Stroke } from './canvas';

/** The paint's colour on screen (the mask itself is white on black). */
const INK = '#ec4899';
/** The canvas shown over the picture: its shape, enough pixels to see the paint by. */
const VIEW = 1024;

export function Painter({ src, w, h, strokes, onStrokes, brush, onBrush, disabled }: { src: string; w: number; h: number; strokes: Stroke[]; onStrokes: (s: Stroke[]) => void; brush: number; onBrush: (n: number) => void; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number; d: number } | null>(null);
  const k = Math.min(1, VIEW / Math.max(w, h));
  const draw = () => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = INK;
    g.strokeStyle = INK;
    paint(g, live.current ? [...strokes, live.current] : strokes, k);
  };
  useLayoutEffect(draw);

  /** Where the pointer is, in the picture's own pixels. */
  const at = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(w, ((e.clientX - r.left) / r.width) * w)), Math.max(0, Math.min(h, ((e.clientY - r.top) / r.height) * h))];
  };
  const showRing = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    setRing({ x: e.clientX - r.left, y: e.clientY - r.top, d: brush });
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    live.current = { size: brush * (w / Math.max(1, r.width)), pts: at(e) };
    showRing(e);
    draw();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    showRing(e);
    const s = live.current;
    if (!s) return;
    const co = e.nativeEvent.getCoalescedEvents?.();
    for (const ev of co?.length ? co : [e.nativeEvent]) s.pts.push(...at(ev));
    draw();
  };
  const up = (e: React.PointerEvent) => {
    const s = live.current;
    live.current = null;
    // A finger leaves no pointer behind to show the brush by.
    if (e.pointerType !== 'mouse') setRing(null);
    if (s) onStrokes([...strokes, s]);
  };

  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-line bg-bg-1">
        <img src={src} alt="" draggable={false} className="block max-h-[min(44dvh,420px)] max-w-full select-none" />
        <canvas
          ref={canvas}
          width={Math.round(w * k)}
          height={Math.round(h * k)}
          aria-label="Paint over the picture"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={() => !live.current && setRing(null)}
          className="absolute inset-0 h-full w-full touch-none opacity-55"
          style={{ cursor: disabled ? 'default' : 'none' }}
        />
        {ring && !disabled && (
          <span aria-hidden className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]" style={{ left: ring.x, top: ring.y, width: ring.d, height: ring.d, transform: 'translate(-50%,-50%)' }} />
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[12.5px] text-fg-3">Brush</span>
        <input type="range" min={6} max={120} step={2} value={brush} disabled={disabled} onChange={(e) => onBrush(Number(e.target.value))} aria-label="Brush size" className="min-w-0 flex-1 accent-[var(--accent)]" />
        <IconButton label="Undo the last stroke" size="sm" disabled={disabled || !strokes.length} onClick={() => onStrokes(strokes.slice(0, -1))}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Clear the paint" size="sm" disabled={disabled || !strokes.length} onClick={() => onStrokes([])}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  );
}
