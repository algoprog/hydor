// The video editor's timeline: the video's frames along its whole length, the part kept between the two handles at its
// ends, the parts cut out hatched, where it was split, and the playhead (a press or a drag anywhere on the frames moves
// it); under them, a lane for the words (each shown from when to when, moved by its middle and sized by its ends) and one
// for the music (moved along). Times are the original's, as the recipe keeps them; the music's start is the edited video's.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Music } from 'lucide-react';
import { isKept, MIN_PART, toEdited, toOriginal, type VideoRecipe } from '@shared/mediaedit-video';
import { cx } from '../../../components/ui';
import { useClock, type Clock } from './clock';

type Phase = 'begin' | 'move' | 'end';

export interface TimelineProps {
  duration: number;
  recipe: VideoRecipe;
  parts: [number, number][];
  splits: number[];
  clock: Clock;
  /** The frames' picture for `n` frames of `h` pixels, once asked for. */
  strip: (n: number, h: number) => string | null;
  /** The shape of the video's frames (width over height). */
  aspect: number;
  onSeek(t: number, phase: Phase): void;
  onTrim(trim: [number, number], phase: Phase): void;
  picked: number | null;
  onPickText(i: number): void;
  onTimeText(i: number, from: number, to: number, phase: Phase): void;
  /** The music's length in seconds, when known. */
  musicLength?: number;
  onMusicStart(start: number, phase: Phase): void;
  /** The moment picked for a slide's still. */
  stillAt?: number;
  small?: boolean;
}

/** The boundaries the playhead is between: the trim's ends, the splits and the cuts' edges. */
export function partAt(t: number, r: VideoRecipe, splits: number[], duration: number): [number, number] {
  const [a, b] = r.trim ?? [0, duration];
  const marks = [a, b, ...splits, ...(r.cuts ?? []).flat()].filter((x) => x >= a - 1e-6 && x <= b + 1e-6).sort((x, y) => x - y);
  let lo = a;
  let hi = b;
  for (const m of marks) {
    if (m <= t + 1e-6) lo = m;
    if (m > t + 1e-6) {
      hi = m;
      break;
    }
  }
  return [Math.max(a, lo), Math.min(b, hi)];
}

export function Timeline(p: TimelineProps) {
  const track = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const m = () => setW(el.clientWidth);
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const filmH = p.small ? 44 : 56;
  const d = Math.max(0.001, p.duration);
  const x = (t: number) => (Math.min(d, Math.max(0, t)) / d) * w;
  const tAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(d, Math.max(0, ((clientX - r.left) / Math.max(1, r.width)) * d));
  };
  // As many frames as fit at their shape (asked again only when that changes by much).
  const n = Math.max(4, Math.min(40, Math.round(w / Math.max(16, filmH * p.aspect))));
  const asked = useRef(0);
  if (w > 0 && (!asked.current || Math.abs(n - asked.current) / asked.current > 0.25)) asked.current = n;
  const strip = w > 0 ? p.strip(asked.current, filmH * 2) : null;
  const [a, b] = p.recipe.trim ?? [0, d];
  const speed = p.recipe.speed ?? 1;
  const texts = p.recipe.texts ?? [];
  const music = p.recipe.music;

  /** A drag from a press: `go` hears where it is (in seconds), each move and at the end. */
  const dragging = (go: (t: number, phase: Phase, dt: number) => void) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const t0 = tAt(e.clientX);
    go(t0, 'begin', 0);
    const move = (ev: PointerEvent) => go(tAt(ev.clientX), 'move', tAt(ev.clientX) - t0);
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      go(tAt(ev.clientX), 'end', tAt(ev.clientX) - t0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const gap = MIN_PART * 4;

  return (
    <div className="select-none" style={{ touchAction: 'none' }}>
      {/* Inset by a handle's width each side, so the handles at the ends stay on screen. */}
      <div ref={track} className="relative mx-3.5 max-sm:mx-5">
        {/* The frames, the part kept, the parts cut and the splits. */}
        <div className="relative cursor-pointer overflow-hidden rounded-lg bg-bg-3" style={{ height: filmH }} onPointerDown={dragging((t, phase) => p.onSeek(t, phase))}>
          {strip && <img src={strip} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />}
          <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/60" style={{ width: x(a) }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/60" style={{ width: Math.max(0, w - x(b)) }} />
          {(p.recipe.cuts ?? []).map(([s, e], i) => (
            <div
              key={i}
              className="pointer-events-none absolute inset-y-0 border-x border-white/40"
              style={{ left: x(s), width: Math.max(2, x(e) - x(s)), background: 'repeating-linear-gradient(135deg, rgba(0,0,0,0.72) 0 6px, rgba(0,0,0,0.42) 6px 12px)' }}
            />
          ))}
          {p.splits.map((s, i) => (
            <div key={i} className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" style={{ left: x(s) }} />
          ))}
          <Current {...p} x={x} />
          {p.stillAt !== undefined && (
            <span className="pointer-events-none absolute top-1 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded bg-white text-black shadow" style={{ left: x(p.stillAt) }} title="Its still">
              <Camera size={10} />
            </span>
          )}
        </div>
        {/* The handles at the kept part's ends. */}
        <Handle side="start" left={x(a)} h={filmH} label="Start of the part kept" onPointerDown={dragging((t, phase) => p.onTrim([Math.min(t, b - gap), b], phase))} />
        <Handle side="end" left={x(b)} h={filmH} label="End of the part kept" onPointerDown={dragging((t, phase) => p.onTrim([a, Math.max(t, a + gap)], phase))} />
        {/* Lanes for the words and the music, when there are any. */}
        {texts.length > 0 && (
          <Lane>
            {texts.map((t, i) => (
              <Bar
                key={i}
                left={x(t.from)}
                width={x(t.to) - x(t.from)}
                on={p.picked === i}
                label={<span translate="no">{t.text.split('\n')[0]}</span>}
                onPick={() => p.onPickText(i)}
                onBody={dragging((_t, phase, dt) => {
                  const len = t.to - t.from;
                  const from = Math.min(d - len, Math.max(0, t.from + dt));
                  p.onTimeText(i, from, from + len, phase);
                })}
                onStart={dragging((tt, phase) => p.onTimeText(i, Math.min(tt, t.to - gap), t.to, phase))}
                onEnd={dragging((tt, phase) => p.onTimeText(i, t.from, Math.max(tt, t.from + gap), phase))}
              />
            ))}
          </Lane>
        )}
        {music && (
          <Lane>
            <MusicBar {...p} x={x} speed={speed} dragging={dragging} />
          </Lane>
        )}
        <Playhead clock={p.clock} x={x} />
      </div>
    </div>
  );
}

/** The part the playhead is in, outlined: the one Delete takes out (or Put back puts back). */
function Current(p: TimelineProps & { x: (t: number) => number }) {
  const t = useClock(p.clock);
  const [lo, hi] = partAt(t, p.recipe, p.splits, p.duration);
  const cut = !isKept(t, p.parts) && t >= (p.recipe.trim?.[0] ?? 0) && t < (p.recipe.trim?.[1] ?? p.duration);
  return <div className={cx('pointer-events-none absolute inset-y-0 rounded-[3px] ring-2 ring-inset', cut ? 'ring-white/50' : 'ring-accent')} style={{ left: p.x(lo), width: Math.max(2, p.x(hi) - p.x(lo)) }} />;
}

function Playhead({ clock, x }: { clock: Clock; x: (t: number) => number }) {
  const t = useClock(clock);
  return (
    <div className="pointer-events-none absolute -top-1.5 bottom-0 w-0.5 -translate-x-1/2 bg-fg" style={{ left: x(t) }}>
      <span className="absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-fg" />
    </div>
  );
}

function Handle({ side, left, h, label, onPointerDown }: { side: 'start' | 'end'; left: number; h: number; label: string; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      role="slider"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      className={cx('absolute top-0 flex w-3.5 cursor-ew-resize items-center justify-center bg-accent shadow-sm max-sm:w-5', side === 'start' ? 'rounded-l-lg' : 'rounded-r-lg')}
      style={{ left: side === 'start' ? left - 14 : left, height: h, touchAction: 'none' }}
    >
      <span className="h-5 w-0.5 rounded-full bg-accent-fg/80" />
    </div>
  );
}

function Lane({ children }: { children: ReactNode }) {
  return <div className="relative mt-1.5 h-6 rounded-md bg-bg-2">{children}</div>;
}

function Bar({
  left,
  width,
  on,
  label,
  onPick,
  onBody,
  onStart,
  onEnd,
}: {
  left: number;
  width: number;
  on: boolean;
  label: ReactNode;
  onPick: () => void;
  onBody: (e: React.PointerEvent) => void;
  onStart: (e: React.PointerEvent) => void;
  onEnd: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className={cx('absolute inset-y-0.5 flex min-w-2 cursor-grab items-center overflow-hidden rounded-[5px] border text-[11px] leading-none', on ? 'border-accent bg-accent text-accent-fg' : 'border-accent/40 bg-accent-soft text-fg-2')}
      style={{ left, width: Math.max(8, width), touchAction: 'none' }}
      onPointerDown={(e) => (onPick(), onBody(e))}
    >
      <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => (onPick(), onStart(e))} />
      <span className="pointer-events-none min-w-0 truncate px-2">{label}</span>
      <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => (onPick(), onEnd(e))} />
    </div>
  );
}

/** The music, from where it starts in the edited video to its end (or the video's), drawn on the original's time. */
function MusicBar(p: TimelineProps & { x: (t: number) => number; speed: number; dragging: (go: (t: number, phase: Phase, dt: number) => void) => (e: React.PointerEvent) => void }) {
  const m = p.recipe.music!;
  const start = m.start ?? 0;
  const length = p.parts.reduce((n, [a, b]) => n + b - a, 0) / p.speed;
  const end = Math.min(length, p.musicLength ? start + p.musicLength : length);
  const from = toOriginal(start, p.parts, p.speed);
  const to = toOriginal(end, p.parts, p.speed);
  return (
    <div
      className="absolute inset-y-0.5 flex min-w-2 cursor-grab items-center gap-1 overflow-hidden rounded-[5px] border border-info/40 bg-info/15 px-1.5 text-[11px] leading-none text-fg-2"
      style={{ left: p.x(from), width: Math.max(8, p.x(to) - p.x(from)), touchAction: 'none' }}
      onPointerDown={p.dragging((_t, phase, dt) => p.onMusicStart(Math.max(0, Math.min(length - MIN_PART, toEdited(Math.max(0, from + dt), p.parts, p.speed))), phase))}
    >
      <Music size={11} className="shrink-0" />
      <span translate="no" className="min-w-0 truncate">
        {m.name ?? ''}
      </span>
    </div>
  );
}
