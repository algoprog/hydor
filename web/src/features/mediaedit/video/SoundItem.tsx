// A sound on the timeline, as an editor shows one: its shape (waveform), the parts silenced hatched, its fades drawn as
// ramps with a handle at each top corner to drag, its volume line (a rubber band: click it to add a point, drag a part
// of it up or down, drag a point, double-click a point to take it away), a badge for its channels ("L", "R"…), and a
// part picked with Shift and a drag (Delete silences it). The same for a clip's own sound (A1), music (A2) and a
// voice-over or a sound detached from its clip (A3).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LEVEL_MAX, levelAt, SOUND_CHANNELS, type SoundChannels } from '@shared/mediaedit-video';
import { cx } from '../../../components/ui';
import { soundShape } from './api';

export type Phase = 'begin' | 'move' | 'end' | 'once';

/** The lowest the volume line shows (lower is drawn at the bottom). */
const FLOOR = -30;
const TONES = { clip: 'border-ok/45 bg-ok/15', music: 'border-ok/45 bg-ok/15', voice: 'border-ok/45 bg-ok/10' } as const;
const gainToDb = (g: number) => (g <= 0.001 ? -60 : 20 * Math.log10(g));
const dbToGain = (d: number) => (d <= -59.9 ? 0 : Math.pow(10, d / 20));
const r1 = (x: number) => Math.round(x * 10) / 10;
const ms = (x: number) => Math.round(x * 1000) / 1000;

export interface SoundItemProps {
  left: number;
  width: number;
  pps: number;
  h: number;
  /** Seconds of it hidden at its start (a clip's part under a transition into it). */
  offset: number;
  /** Its length, in seconds. */
  length: number;
  wave?: { src: string; from: number; to: number; duration: number; reverse?: boolean };
  /** No sound to show (a picture, a clip without sound or with it taken out). */
  silent?: boolean;
  volume?: number;
  levels?: [number, number][];
  silence?: [number, number][];
  fadeIn?: number;
  fadeOut?: number;
  /** The fades a crossfade with an overlapping sound makes. */
  cross?: { in: number; out: number };
  channels?: SoundChannels;
  picked: boolean;
  dim?: boolean;
  tone: keyof typeof TONES;
  label?: ReactNode;
  /** A part picked, in seconds of it. */
  range?: [number, number] | null;
  locked?: boolean;
  onPress(e: React.PointerEvent): void;
  onStart?(e: React.PointerEvent): void;
  onEnd?(e: React.PointerEvent): void;
  onMenu(e: React.MouseEvent): void;
  onFade(edge: 'in' | 'out', seconds: number, phase: Phase): void;
  onLine(next: { volume?: number; levels?: [number, number][] }, phase: Phase): void;
  onRange(from: number, to: number, phase: Phase): void;
}

export function SoundItem(p: SoundItemProps) {
  const svg = useRef<SVGSVGElement>(null);
  const { h, pps, offset } = p;
  const top = 4;
  const bot = h - 8;
  const base = gainToDb(p.volume ?? 1);
  const y = (db: number) => top + ((LEVEL_MAX - Math.max(FLOOR, Math.min(LEVEL_MAX, db))) / (LEVEL_MAX - FLOOR)) * (bot - top);
  const dbAtY = (yy: number) => LEVEL_MAX - ((yy - top) / (bot - top)) * (LEVEL_MAX - FLOOR);
  const x = (t: number) => (t - offset) * pps;
  const pts = p.levels ?? [];
  const line = pts.length ? [`M0,${y(base + pts[0][1])}`, ...pts.map(([t, d]) => `L${x(t)},${y(base + d)}`), `L${p.width},${y(base + pts[pts.length - 1][1])}`].join(' ') : `M0,${y(base)} L${p.width},${y(base)}`;
  const fi = Math.max(p.fadeIn ?? 0, p.cross?.in ?? 0);
  const fo = Math.max(p.fadeOut ?? 0, p.cross?.out ?? 0);
  const badge = p.channels ? SOUND_CHANNELS.find((c) => c.id === p.channels)?.badge : '';
  const at = (e: { clientX: number; clientY: number }) => {
    const b = svg.current!.getBoundingClientRect();
    return { px: e.clientX - b.left, py: e.clientY - b.top };
  };
  /** A drag from a press: `go` hears the pointer's place in the item (pixels), each move and at the end. */
  const drag = (e: React.PointerEvent, go: (q: { px: number; py: number; dx: number; dy: number }, phase: 'move' | 'end', moved: boolean) => void) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const s0 = at(e);
    let moved = false;
    const mv = (ev: PointerEvent) => {
      const q = at(ev);
      if (!moved && Math.hypot(q.px - s0.px, q.py - s0.py) < 3) return;
      moved = true;
      go({ ...q, dx: q.px - s0.px, dy: q.py - s0.py }, 'move', true);
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      const q = at(ev);
      go({ ...q, dx: q.px - s0.px, dy: q.py - s0.py }, 'end', moved);
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // The line: a click adds a point (where the line already is); a drag raises or lowers the part between two points
  // (or the whole of it, without points).
  const onLineDown = (e: React.PointerEvent) => {
    if (p.locked || e.button !== 0) return;
    const t0 = offset + at(e).px / pps;
    const first = pts;
    const after = first.findIndex(([t]) => t > t0);
    const seg = !first.length ? [] : after < 0 ? [first.length - 1] : after === 0 ? [0] : [after - 1, after];
    let began = false;
    drag(e, (q, phase, moved) => {
      if (!moved) {
        if (phase === 'end') {
          const next = [...first, [ms(t0), r1(levelAt(first, t0))] as [number, number]].sort((a, b) => a[0] - b[0]);
          p.onLine({ levels: next }, 'once');
        }
        return;
      }
      if (!began) {
        began = true;
        p.onLine({}, 'begin');
      }
      const dDb = (-q.dy / (bot - top)) * (LEVEL_MAX - FLOOR);
      if (!first.length) p.onLine({ volume: Math.min(4, dbToGain(Math.max(-60, Math.min(LEVEL_MAX, base + dDb)))) }, 'move');
      else p.onLine({ levels: first.map(([t, d], i) => (seg.includes(i) ? ([t, r1(Math.max(-60, Math.min(LEVEL_MAX, d + dDb)))] as [number, number]) : [t, d])) }, 'move');
      if (phase === 'end') p.onLine({}, 'end');
    });
  };
  const onPointDown = (i: number) => (e: React.PointerEvent) => {
    if (p.locked || e.button !== 0) return;
    const first = pts;
    let began = false;
    drag(e, (q, phase, moved) => {
      if (!moved) return;
      if (!began) {
        began = true;
        p.onLine({}, 'begin');
      }
      const lo = i > 0 ? first[i - 1][0] + 0.01 : 0;
      const hi = i < first.length - 1 ? first[i + 1][0] - 0.01 : p.length;
      const t = Math.max(lo, Math.min(hi, offset + q.px / pps));
      const d = Math.max(-60, Math.min(LEVEL_MAX, dbAtY(q.py) - base));
      p.onLine({ levels: first.map((pt, j) => (j === i ? ([ms(t), r1(d)] as [number, number]) : pt)) }, 'move');
      if (phase === 'end') p.onLine({}, 'end');
    });
  };
  const onFadeDown = (edge: 'in' | 'out') => (e: React.PointerEvent) => {
    if (p.locked || e.button !== 0) return;
    let began = false;
    drag(e, (q, phase, moved) => {
      if (!moved) return;
      if (!began) {
        began = true;
        p.onFade(edge, edge === 'in' ? p.fadeIn ?? 0 : p.fadeOut ?? 0, 'begin');
      }
      const t = offset + q.px / pps;
      const sec = Math.max(0, Math.min(p.length / 2, edge === 'in' ? t : p.length - t));
      p.onFade(edge, Math.round(sec * 20) / 20, phase === 'end' ? 'end' : 'move');
    });
  };
  const onBodyDown = (e: React.PointerEvent) => {
    if (!e.shiftKey || p.locked || e.button !== 0) return p.onPress(e);
    // Shift and a drag: a part of it picked.
    const t0 = offset + at(e).px / pps;
    drag(e, (q, phase) => {
      const t = Math.max(0, Math.min(p.length, offset + q.px / pps));
      p.onRange(Math.min(t0, t), Math.max(t0, t), phase);
    });
  };

  return (
    <div
      className={cx('absolute inset-y-[3px] overflow-hidden rounded-[5px] border', p.silent ? 'border-line bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--line)_5px_6px)]' : TONES[p.tone], p.picked && 'ring-2 ring-accent ring-inset', p.dim && 'opacity-40')}
      style={{ left: p.left, width: Math.max(4, p.width), touchAction: 'none' }}
      onPointerDown={onBodyDown}
      onContextMenu={p.onMenu}
    >
      {p.wave && !p.silent && <Wave {...p.wave} className="pointer-events-none absolute inset-0 text-ok/70" />}
      {(p.silence ?? []).map(([a, b], i) => (
        <div key={i} className="pointer-events-none absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgba(0,0,0,0.55)_0_4px,transparent_4px_8px)]" style={{ left: x(a), width: Math.max(2, (b - a) * pps) }} title="Silenced" />
      ))}
      {p.range && <div className="pointer-events-none absolute inset-y-0 border-x border-accent bg-accent/25" style={{ left: x(p.range[0]), width: Math.max(2, (p.range[1] - p.range[0]) * pps) }} />}
      {!p.silent && (
        <svg ref={svg} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {fi > 0 && <polygon points={`${x(0)},0 ${x(fi)},0 ${x(0)},${h}`} className="fill-black/35" />}
          {fo > 0 && <polygon points={`${x(p.length - fo)},0 ${x(p.length)},0 ${x(p.length)},${h}`} className="fill-black/35" />}
          <path d={line} fill="none" strokeWidth={10} stroke="transparent" className={cx(!p.locked && 'pointer-events-auto cursor-ns-resize')} onPointerDown={onLineDown} />
          <path d={line} fill="none" strokeWidth={1.25} className="pointer-events-none stroke-warn" />
          {pts.map(([t, d], i) => (
            <circle
              key={i}
              cx={x(t)}
              cy={y(base + d)}
              r={3.5}
              className={cx('fill-warn stroke-bg', !p.locked && 'pointer-events-auto cursor-move')}
              strokeWidth={1}
              onPointerDown={onPointDown(i)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                p.onLine({ levels: pts.filter((_, j) => j !== i) }, 'once');
              }}
            >
              <title>{`${t.toFixed(2)} s · ${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`}</title>
            </circle>
          ))}
        </svg>
      )}
      {!p.silent && !p.locked && (
        <>
          <span className="absolute top-0 z-10 h-2 w-2 -translate-x-1/2 cursor-ew-resize rounded-[2px] border border-bg bg-fg" style={{ left: Math.max(4, x(fi)) }} title="Fade in: drag" onPointerDown={onFadeDown('in')} />
          <span className="absolute top-0 z-10 h-2 w-2 translate-x-1/2 cursor-ew-resize rounded-[2px] border border-bg bg-fg" style={{ left: Math.min(p.width - 4, x(p.length - fo)) }} title="Fade out: drag" onPointerDown={onFadeDown('out')} />
        </>
      )}
      {p.label && <span className="pointer-events-none absolute top-0.5 left-2 max-w-[70%] truncate text-[10.5px] leading-none font-medium text-fg drop-shadow-sm">{p.label}</span>}
      {badge && <span className="pointer-events-none absolute bottom-0.5 left-1 rounded bg-black/55 px-1 text-[9.5px] leading-[13px] font-semibold text-white">{badge}</span>}
      {p.volume !== undefined && !p.silent && <span className="pointer-events-none absolute right-1 bottom-0.5 rounded bg-black/45 px-1 text-[9.5px] leading-[13px] text-white">{`${base >= 0 ? '+' : ''}${base.toFixed(1)} dB`}</span>}
      {p.onStart && <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-accent/40" onPointerDown={p.onStart} />}
      {p.onEnd && <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-accent/40" onPointerDown={p.onEnd} />}
    </div>
  );
}

/** The shape of a sound from `from` to `to` (seconds of it), drawn in the colour of the text it is in. */
export function Wave({ src, from, to, duration, reverse, className }: { src: string; from: number; to: number; duration: number; reverse?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const n = Math.max(64, Math.min(4000, Math.round(duration * 25)));
  useEffect(() => {
    let live = true;
    void soundShape(src, n).then((pk) => live && setPeaks(pk));
    return () => {
      live = false;
    };
  }, [src, n]);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || !peaks) return;
    const w = (cv.width = Math.max(1, Math.round(cv.clientWidth * Math.min(2, devicePixelRatio || 1))));
    const hh = (cv.height = Math.max(1, Math.round(cv.clientHeight * Math.min(2, devicePixelRatio || 1))));
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, w, hh);
    g.fillStyle = getComputedStyle(cv).color;
    const a = (from / Math.max(1e-6, duration)) * peaks.length;
    const b = (to / Math.max(1e-6, duration)) * peaks.length;
    for (let px = 0; px < w; px++) {
      const i = Math.floor(reverse ? b - ((b - a) * px) / w : a + ((b - a) * px) / w);
      const v = peaks[Math.max(0, Math.min(peaks.length - 1, i))] ?? 0;
      const bh = Math.max(1, v * hh * 0.9);
      g.fillRect(px, (hh - bh) / 2, 1, bh);
    }
  });
  return <canvas ref={ref} className={cx('h-full w-full', className)} />;
}
