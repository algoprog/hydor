// The transport: to the start, play and pause (Space), stop, record (R), loop (L), to the end; the time where the
// playhead is, large; the part picked (its start, end and length, each to type or drag); snapping; the zoom; and the
// meter: each side's peak (held a moment) and the loudness of the last 0.4 seconds.
import { useEffect, useRef } from 'react';
import { Circle, Magnet, Minus, Pause, Play, Plus, Repeat, SkipBack, SkipForward, Square, StretchHorizontal } from 'lucide-react';
import { readSoundClock, soundClock } from '@shared/mediaedit-audio';
import { cx } from '../../../components/ui';
import { useClock, type Clock } from '../video/clock';
import { alpha, palette } from './draw';
import type { SoundPlayer } from './engine';
import type { Sel } from './Tracks';
import { ScrubField, useThemeTick } from './ui';

function TBtn({ label, keys, on, onClick, children, tone, disabled, big }: { label: string; keys?: string; on?: boolean; onClick: () => void; children: React.ReactNode; tone?: 'err'; disabled?: boolean; big?: boolean }) {
  return (
    <button
      type="button"
      title={keys ? `${label} (${keys})` : label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
        big ? 'h-8.5 w-8.5' : 'h-8 w-8',
        on ? (tone === 'err' ? 'bg-err text-white' : 'bg-accent-soft text-accent') : tone === 'err' ? 'text-err hover:bg-err/10' : 'text-fg-2 hover:bg-bg-2 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function Timecode({ clock }: { clock: Clock }) {
  const t = useClock(clock);
  return (
    <span className="tnum min-w-[7.6rem] text-center font-mono text-[19px] font-medium tracking-tight text-fg" aria-label="Where the playhead is">
      {soundClock(t)}
    </span>
  );
}

export interface TransportProps {
  clock: Clock;
  playing: boolean;
  recording: boolean;
  loop: boolean;
  snap: boolean;
  length: number;
  sel: Sel | null;
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onLoop: () => void;
  onSnap: () => void;
  onStart: () => void;
  onEnd: () => void;
  onSel: (a: number, b: number) => void;
  zoom: { pps: number; min: number; max: number; set: (pps: number) => void; fit: () => void };
  player: SoundPlayer;
  canRecord: boolean;
  mobile: boolean;
}

export function Transport(p: TransportProps) {
  const zl = (v: number) => Math.log(v);
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-bg-1 px-2">
      <TBtn label="To the start" keys="Home" onClick={p.onStart}>
        <SkipBack size={16} />
      </TBtn>
      <TBtn label={p.playing ? 'Pause' : 'Play'} keys="Space" onClick={p.onPlay} on={p.playing} big>
        {p.playing ? <Pause size={18} /> : <Play size={18} />}
      </TBtn>
      <TBtn label="Stop" onClick={p.onStop}>
        <Square size={14} />
      </TBtn>
      <TBtn label={p.recording ? 'Stop recording' : 'Record'} keys="R" onClick={p.onRecord} on={p.recording} tone="err" disabled={!p.canRecord}>
        <Circle size={14} fill="currentColor" />
      </TBtn>
      <TBtn label="Loop" keys="L" onClick={p.onLoop} on={p.loop}>
        <Repeat size={15} />
      </TBtn>
      <TBtn label="To the end" keys="End" onClick={p.onEnd}>
        <SkipForward size={16} />
      </TBtn>
      <div className="mx-1.5 h-6 w-px bg-line" />
      <Timecode clock={p.clock} />
      {!p.mobile && (
        <>
          <div className="mx-1.5 h-6 w-px bg-line" />
          <div className="flex min-w-0 items-center gap-2" aria-label="The part picked">
            <ScrubField label="Start" value={p.sel?.a ?? 0} step={0.001} min={0} max={p.length} width={84} show={(v) => soundClock(v)} read={readSoundClock} onChange={(v) => p.onSel(v, Math.max(v, p.sel?.b ?? v))} />
            <ScrubField label="End" value={p.sel?.b ?? 0} step={0.001} min={0} max={p.length} width={84} show={(v) => soundClock(v)} read={readSoundClock} onChange={(v) => p.onSel(Math.min(v, p.sel?.a ?? v), v)} />
            <ScrubField label="Length" value={p.sel ? p.sel.b - p.sel.a : 0} step={0.001} min={0} max={p.length} width={84} show={(v) => soundClock(v)} read={readSoundClock} onChange={(v) => p.onSel(p.sel?.a ?? 0, (p.sel?.a ?? 0) + v)} />
          </div>
        </>
      )}
      <span className="min-w-1 flex-1" />
      {!p.mobile && (
        <>
          <TBtn label="Snap to clips, markers and the playhead" onClick={p.onSnap} on={p.snap}>
            <Magnet size={15} />
          </TBtn>
          <TBtn label="Zoom out" keys="−" onClick={() => p.zoom.set(p.zoom.pps / 1.5)}>
            <Minus size={15} />
          </TBtn>
          <input
            type="range"
            aria-label="Zoom"
            min={zl(p.zoom.min)}
            max={zl(p.zoom.max)}
            step={0.01}
            value={zl(Math.min(p.zoom.max, Math.max(p.zoom.min, p.zoom.pps)))}
            onChange={(e) => p.zoom.set(Math.exp(Number(e.target.value)))}
            className="w-24 accent-[var(--accent)]"
          />
          <TBtn label="Zoom in" keys="+" onClick={() => p.zoom.set(p.zoom.pps * 1.5)}>
            <Plus size={15} />
          </TBtn>
          <TBtn label="Zoom to fit" keys="Ctrl+F" onClick={p.zoom.fit}>
            <StretchHorizontal size={15} />
          </TBtn>
          <div className="mx-1 h-6 w-px bg-line" />
        </>
      )}
      <Meter player={p.player} playing={p.playing} />
    </div>
  );
}

/** Each side's peak as a bar (green to amber to red near 0 dB, from the theme), held a moment, and the loudness. */
export function Meter({ player, playing }: { player: SoundPlayer; playing: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const tick = useThemeTick();
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const W = 132;
    const H = 20;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pal = palette();
    const ok = getComputedStyle(document.documentElement).getPropertyValue('--ok').trim() || pal.accent;
    const err = getComputedStyle(document.documentElement).getPropertyValue('--err').trim() || pal.warn;
    const x = (db: number) => Math.max(0, Math.min(W, ((db + 60) / 60) * W));
    let raf = 0;
    const draw = () => {
      const l = player.levels();
      g.clearRect(0, 0, W, H);
      for (const ch of [0, 1]) {
        const y = ch * 10 + 1;
        g.fillStyle = alpha(pal.fg3, 0.18);
        g.fillRect(0, y, W, 8);
        const v = x(l.peak[ch]);
        // The bar coloured by where it reaches: up to −12 dB, to −3, past it.
        g.fillStyle = ok;
        g.fillRect(0, y, Math.min(v, x(-12)), 8);
        if (v > x(-12)) {
          g.fillStyle = pal.warn;
          g.fillRect(x(-12), y, Math.min(v, x(-3)) - x(-12), 8);
        }
        if (v > x(-3)) {
          g.fillStyle = err;
          g.fillRect(x(-3), y, v - x(-3), 8);
        }
        if (Number.isFinite(l.hold[ch])) {
          g.fillStyle = l.hold[ch] > -0.5 ? err : pal.fg;
          g.fillRect(x(l.hold[ch]) - 1, y, 2, 8);
        }
      }
      if (text.current) text.current.textContent = Number.isFinite(l.lufs) && l.lufs > -70 ? `${l.lufs.toFixed(1)} LUFS` : '– LUFS';
      if (playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [player, playing, tick]);
  return (
    <div className="flex shrink-0 items-center gap-2" title="The level: each side’s peak (from −60 to 0 dB), and the loudness of the last 0.4 seconds">
      <canvas ref={cv} style={{ width: 132, height: 20 }} aria-hidden />
      <span ref={text} className="tnum w-[4.6rem] text-[11px] text-fg-3 max-sm:hidden">
        – LUFS
      </span>
    </div>
  );
}
