// Your camera in a round bubble over the slideshow, as Google Slides and Pitch show the presenter: in the window where
// it is turned on (V, or the camera button among the slideshow's controls), dragged anywhere on the slides, made
// smaller or larger, mirrored or not (the way a mirror shows you, the default) and hidden; where it was, how large and
// mirrored or not are remembered. Recording a video of the slideshow uses the same bubble, so it is in the video.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { FlipHorizontal2, Minus, Plus, X } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../../components/ui';

/** The camera, while `on`: its stream, or why there is none (no camera, or it was not allowed). */
export function useCamera(on: boolean): { stream: MediaStream | null; error: string | null } {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    let got: MediaStream | null = null;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(tr('This browser cannot show your camera.'));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        got = s;
        setStream(s);
      })
      .catch((e: Error) => alive && setError(e.name === 'NotAllowedError' ? tr('The camera was not allowed: allow it in the browser’s site settings.') : tr('No camera could be used.')));
    return () => {
      alive = false;
      got?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [on]);
  return { stream, error };
}

interface Look {
  /** Its middle, as a share of the slideshow's width and height. */
  x: number;
  y: number;
  /** Across, in pixels. */
  size: number;
  mirror: boolean;
}

const KEY = 'wa.slides.camera';
const SIZES = [120, 160, 220, 300];
const lookOf = (): Look => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { x: typeof v.x === 'number' ? v.x : 0.9, y: typeof v.y === 'number' ? v.y : 0.82, size: SIZES.includes(v.size) ? v.size : 160, mirror: v.mirror !== false };
  } catch {
    return { x: 0.9, y: 0.82, size: 160, mirror: true };
  }
};

/** The bubble, placed in its parent (the slideshow): its video, and on hover its mirror, size and hide buttons. */
export function CameraBubble({ stream, onHide, className }: { stream: MediaStream; onHide: () => void; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState<Look>(lookOf);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(look)), [look]);
  // Kept wholly on the slideshow, whatever its size.
  const place = (x: number, y: number) => {
    const p = box.current?.parentElement?.getBoundingClientRect();
    if (!p || !p.width || !p.height) return { x, y };
    const hx = look.size / 2 / p.width;
    const hy = look.size / 2 / p.height;
    return { x: Math.min(1 - hx, Math.max(hx, x)), y: Math.min(1 - hy, Math.max(hy, y)) };
  };
  const down = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const p = box.current?.parentElement?.getBoundingClientRect();
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, dx: e.clientX - (p.left + look.x * p.width), dy: e.clientY - (p.top + look.y * p.height) };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    const p = box.current?.parentElement?.getBoundingClientRect();
    if (!d || d.id !== e.pointerId || !p) return;
    const at = place((e.clientX - d.dx - p.left) / p.width, (e.clientY - d.dy - p.top) / p.height);
    setLook((l) => ({ ...l, ...at }));
  };
  const up = () => (drag.current = null);
  const resize = (by: number) =>
    setLook((l) => {
      const size = SIZES[Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(l.size) + by))];
      return { ...l, size };
    });
  const btn = 'grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80';
  return (
    <div
      ref={box}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => e.stopPropagation()}
      style={{ width: look.size, height: look.size, left: `calc(${look.x * 100}% - ${look.size / 2}px)`, top: `calc(${look.y * 100}% - ${look.size / 2}px)` }}
      className={cx('group absolute z-[5] cursor-grab touch-none select-none active:cursor-grabbing', className)}
    >
      <video ref={video} autoPlay muted playsInline className="h-full w-full rounded-full object-cover shadow-[0_8px_28px_rgba(0,0,0,.45)] ring-[3px] ring-white/85" style={{ transform: look.mirror ? 'scaleX(-1)' : undefined }} />
      <div className="absolute -top-2 left-1/2 flex -translate-x-1/2 gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" className={btn} title={tr('Smaller')} aria-label={tr('Smaller')} onClick={() => resize(-1)}>
          <Minus size={14} />
        </button>
        <button type="button" className={btn} title={tr('Larger')} aria-label={tr('Larger')} onClick={() => resize(1)}>
          <Plus size={14} />
        </button>
        <button
          type="button"
          className={btn}
          title={look.mirror ? tr('Show it as others see you') : tr('Show it as a mirror does')}
          aria-label={tr('Mirror the camera')}
          aria-pressed={look.mirror}
          onClick={() => setLook((l) => ({ ...l, mirror: !l.mirror }))}
        >
          <FlipHorizontal2 size={14} />
        </button>
        <button type="button" className={btn} title={tr('Hide the camera (V)')} aria-label={tr('Hide the camera (V)')} onClick={onHide}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
