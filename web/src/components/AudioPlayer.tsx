// A sound player of the app's own (sounds agents made, and the Library's): play and pause, the sound's shape as its
// seek bar, filling as it plays (drawn from its peaks: the Library's, or read from the file in the browser), the
// time and the speed. Keys while it has focus: Space or K plays and pauses, ← → move 5 s, Home and End. One sound
// plays at a time: another starting pauses it. The server answers the byte ranges it asks for, so it seeks
// without loading the whole file.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, Download, Pause, Play, TriangleAlert } from 'lucide-react';
import { cx } from './ui';
import { clock } from './VideoPlayer';

/** Told to every player when one starts, so the others stop. */
const PLAYING = 'hydor:sound-plays';

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

// ---- its shape -------------------------------------------------------------------------------------------------

const shapes = new Map<string, Promise<number[] | null>>();

/** How loud a file's sound is along its length: `count` levels from 0 to 1, read in the browser (once an address). */
async function readShape(src: string, count: number): Promise<number[] | null> {
  const r = await fetch(src);
  if (!r.ok) return null;
  const ctx = new OfflineAudioContext(1, 1, 44_100);
  const sound = await ctx.decodeAudioData(await r.arrayBuffer());
  const data = sound.getChannelData(0);
  const per = data.length / count;
  if (per < 1) return null;
  const levels: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * per);
    const b = Math.max(a + 1, Math.floor((i + 1) * per));
    let sum = 0;
    // Every fourth sample is enough to tell how loud a part is.
    for (let j = a; j < b; j += 4) sum += data[j] * data[j];
    levels.push(Math.sqrt(sum / Math.ceil((b - a) / 4)));
  }
  const top = Math.max(...levels);
  return levels.map((v) => (top > 0 ? v / top : 0));
}

/** A sound's shape, read from its file when it is not given (`enabled`); null until then, or when it cannot be read. */
export function useShape(src: string | undefined, enabled = true, count = 64): number[] | null {
  const [shape, setShape] = useState<number[] | null>(null);
  useEffect(() => {
    setShape(null);
    if (!src || !enabled || typeof OfflineAudioContext === 'undefined') return;
    let alive = true;
    const key = `${count}#${src}`;
    let p = shapes.get(key);
    if (!p) {
      p = readShape(src, count).catch(() => null);
      shapes.set(key, p);
    }
    void p.then((x) => alive && setShape(x));
    return () => {
      alive = false;
    };
  }, [src, enabled, count]);
  return shape;
}

/** Where a pointer is along an element, from 0 to 1. */
const along = (el: HTMLElement, x: number) => {
  const r = el.getBoundingClientRect();
  return r.width ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0;
};

/**
 * A sound's shape as bars, the part played in the accent colour. Without one, a plain line that fills the same way
 * (never a made-up shape).
 */
export function Waveform({ peaks, progress, className, thin }: { peaks: number[] | null | undefined; progress: number; className?: string; thin?: boolean }) {
  if (!peaks?.length)
    return (
      <div className={cx('flex items-center', className)}>
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-fg-3/25">
          <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    );
  const played = progress * peaks.length;
  // Drawn from most of its quietest part up, so a song that is loud throughout still shows where it swells and dips.
  const floor = Math.min(...peaks) * 0.75;
  const top = Math.max(...peaks);
  const level = (p: number) => (top > floor ? (p - floor) / (top - floor) : 1);
  return (
    <div className={cx('flex items-center', thin ? 'gap-px' : 'gap-[2px]', className)} aria-hidden>
      {peaks.map((p, i) => (
        <span key={i} className={cx('min-w-px flex-1 rounded-full transition-colors duration-150', i < played ? 'bg-accent' : 'bg-fg-3/35')} style={{ height: `${Math.max(8, Math.round(level(p) * 100))}%` }} />
      ))}
    </div>
  );
}

// ---- playing ---------------------------------------------------------------------------------------------------

export interface SoundState {
  playing: boolean;
  time: number;
  duration: number;
  failed: boolean;
}

/**
 * A sound to play, its own <audio> made when first needed (`eager`: at once, to know its length): play and pause,
 * seek, speed, and what it is doing. Another sound starting pauses it.
 */
export function useSound(src: string, eager = true) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [s, setS] = useState<SoundState>({
    playing: false,
    time: 0,
    duration: 0,
    failed: false,
  });
  const [rate, setRateState] = useState(1);
  const element = useCallback(() => {
    if (ref.current) return ref.current;
    const a = new Audio();
    a.preload = 'metadata';
    const read = () =>
      setS((x) => ({
        ...x,
        time: a.currentTime,
        duration: Number.isFinite(a.duration) ? a.duration : x.duration,
      }));
    a.addEventListener('play', () => setS((x) => ({ ...x, playing: true })));
    a.addEventListener('pause', () => setS((x) => ({ ...x, playing: false })));
    a.addEventListener('ended', () => setS((x) => ({ ...x, playing: false })));
    a.addEventListener('timeupdate', read);
    a.addEventListener('durationchange', read);
    a.addEventListener('loadedmetadata', read);
    a.addEventListener('error', () => setS((x) => ({ ...x, failed: true, playing: false })));
    a.src = src;
    ref.current = a;
    return a;
  }, [src]);
  useEffect(() => {
    setS({ playing: false, time: 0, duration: 0, failed: false });
    if (eager) element();
    const others = (e: Event) => {
      if ((e as CustomEvent).detail !== ref.current) ref.current?.pause();
    };
    window.addEventListener(PLAYING, others);
    return () => {
      window.removeEventListener(PLAYING, others);
      const a = ref.current;
      ref.current = null;
      if (a) {
        a.pause();
        a.removeAttribute('src');
        a.load();
      }
    };
  }, [src, eager, element]);
  const toggle = () => {
    const a = element();
    if (s.failed) return;
    if (a.paused || a.ended) {
      window.dispatchEvent(new CustomEvent(PLAYING, { detail: a }));
      void a.play().catch(() => {});
    } else a.pause();
  };
  const seekTo = (t: number) => {
    const a = element();
    const d = Number.isFinite(a.duration) ? a.duration : s.duration;
    if (!d) return;
    a.currentTime = Math.min(d, Math.max(0, t));
    setS((x) => ({ ...x, time: a.currentTime }));
  };
  const setRate = (r: number) => {
    element().playbackRate = r;
    setRateState(r);
  };
  return {
    ...s,
    rate,
    toggle,
    seekTo,
    setRate,
    progress: s.duration ? Math.min(1, s.time / s.duration) : 0,
  };
}

/** The play button: a round one, the accent's colour. */
export function PlayButton({ playing, onClick, size = 40, className, disabled }: { playing: boolean; onClick: () => void; size?: number; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={playing ? 'Pause' : 'Play'}
      title={playing ? 'Pause' : 'Play'}
      className={cx('flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-40', className)}
      style={{ width: size, height: size }}
    >
      {playing ? <Pause size={size * 0.42} fill="currentColor" /> : <Play size={size * 0.42} fill="currentColor" className="translate-x-[1px]" />}
    </button>
  );
}

/**
 * The player: the play button, a title (what people and agents wrote: not translated) with `actions` beside it,
 * the shape to seek along, the time and the speed. `peaks`: the shape when known (the Library's); left out, it is
 * read from the file. `large`: the Library's own page.
 */
export function AudioPlayer({ src, title, peaks, actions, downloadUrl, large, className }: { src: string; title?: string; peaks?: number[] | null; actions?: ReactNode; downloadUrl?: string; large?: boolean; className?: string }) {
  const s = useSound(src);
  const read = useShape(src, peaks === undefined);
  const shape = peaks === undefined ? read : peaks;
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub !== null ? scrub : s.progress;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target !== e.currentTarget) return;
    const k = e.key.toLowerCase();
    let done = true;
    if (k === ' ' || k === 'k') s.toggle();
    else if (k === 'arrowleft') s.seekTo(s.time - 5);
    else if (k === 'arrowright') s.seekTo(s.time + 5);
    else if (k === 'home') s.seekTo(0);
    else if (k === 'end') s.seekTo(s.duration);
    else done = false;
    if (done) e.preventDefault();
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!s.duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = along(e.currentTarget, e.clientX);
    setScrub(f);
    s.seekTo(f * s.duration);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrub === null) return;
    const f = along(e.currentTarget, e.clientX);
    setScrub(f);
    s.seekTo(f * s.duration);
  };
  const next = SPEEDS[(SPEEDS.indexOf(s.rate) + 1) % SPEEDS.length];

  if (s.failed)
    return (
      <div className={cx('flex items-center gap-3 text-[12.5px] text-fg-3', className)}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-2 text-warn">
          <TriangleAlert size={16} />
        </span>
        <span className="min-w-0 flex-1">This sound can’t play here: its file is gone, or this browser does not play its format.</span>
        {downloadUrl && (
          <a href={downloadUrl} className="inline-flex shrink-0 items-center gap-1 text-accent hover:underline">
            <Download size={13} /> Download
          </a>
        )}
      </div>
    );

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={title ? `Sound: ${title}` : 'Sound'}
      onKeyDown={onKey}
      className={cx('flex min-w-0 items-center outline-none focus-visible:ring-2 focus-visible:ring-accent/50', large ? 'gap-4 rounded-2xl' : 'gap-3 rounded-xl', className)}
    >
      <PlayButton playing={s.playing} onClick={s.toggle} size={large ? 52 : 40} />
      <div className="min-w-0 flex-1">
        {(title || actions) && (
          <div className="mb-0.5 flex min-w-0 items-center gap-2">
            {title && (
              <span translate="no" className={cx('min-w-0 flex-1 truncate font-medium text-fg', large ? 'text-[15px]' : 'text-[13px]')}>
                {title}
              </span>
            )}
            {actions}
          </div>
        )}
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(s.duration)}
            aria-valuenow={Math.round(shown * s.duration)}
            aria-valuetext={`${clock(shown * s.duration)} of ${clock(s.duration)}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => setScrub(null)}
            onPointerCancel={() => setScrub(null)}
            className={cx('min-w-0 flex-1 cursor-pointer touch-none', large ? 'h-20' : 'h-8')}
          >
            <Waveform peaks={shape} progress={shown} className="h-full w-full" />
          </div>
          <span className="tnum shrink-0 text-[11.5px] whitespace-nowrap text-fg-3">
            {clock(shown * s.duration)} <span className="text-fg-3/70">/ {s.duration ? clock(s.duration) : '–:––'}</span>
          </span>
          <button
            type="button"
            onClick={() => s.setRate(next)}
            title="Speed"
            aria-label="Speed"
            className={cx('tnum h-6 shrink-0 rounded-md px-1.5 text-[11.5px] font-medium transition-colors hover:bg-bg-2', s.rate !== 1 ? 'text-accent' : 'text-fg-3')}
          >
            {s.rate}×
          </button>
        </div>
      </div>
    </div>
  );
}

/** A sound's picture where there is no shape to draw: its icon. */
export function SoundIcon({ size = 22, className }: { size?: number; className?: string }) {
  return <AudioLines size={size} className={cx('text-fg-3', className)} />;
}
