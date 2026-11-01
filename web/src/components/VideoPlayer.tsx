// A video player of the app's own (Files, and any file opened over a page): a seek bar that shows what has
// loaded and the time under the pointer, volume, speed, loop, picture in picture and full screen, with the
// controls fading while it plays. Keys while it has focus: Space or K plays and pauses, ← → move 5 s, J L
// 10 s, ↑ ↓ the volume, M mutes, F full screen, 0–9 a tenth of the way each, , . a frame while paused. On a
// touch screen a tap shows the controls and a double tap on either side moves 10 s. The server answers the
// byte ranges it asks for, so it seeks without loading the whole file.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play, Repeat, TriangleAlert, Volume1, Volume2, VolumeX } from 'lucide-react';
import { cx } from './ui';

const PREFS = 'wa.video';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
/** Controls stay this long after the last move while it plays. */
const IDLE_MS = 2500;

interface Prefs {
  volume: number;
  muted: boolean;
  rate: number;
}

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<Prefs>;
    return { volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : 1, muted: !!p.muted, rate: SPEEDS.includes(p.rate as number) ? (p.rate as number) : 1 };
  } catch {
    return { volume: 1, muted: false, rate: 1 };
  }
}

const savePrefs = (p: Prefs) => {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {}
};

/** 75 → "1:15", 3725 → "1:02:05". */
export function clock(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function Btn({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/15', active ? 'text-accent' : 'text-white')}
    >
      {children}
    </button>
  );
}

/** Where a pointer is along an element, from 0 to 1. */
const along = (el: HTMLElement, x: number) => {
  const r = el.getBoundingClientRect();
  return r.width ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0;
};

export function VideoPlayer({ src, name, downloadUrl, className }: { src: string; name?: string; downloadUrl?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState<[number, number][]>([]);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loop, setLoop] = useState(false);
  const [full, setFull] = useState(false);
  const [shown, setShown] = useState(true);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [jump, setJump] = useState<{ side: 'left' | 'right'; id: number } | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tap = useRef<{ at: number; x: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const canPip = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled;

  const v = () => video.current;
  const update = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      savePrefs(next);
      return next;
    });

  // The video follows the remembered volume, mute and speed.
  useEffect(() => {
    const el = v();
    if (!el) return;
    el.volume = prefs.volume;
    el.muted = prefs.muted;
    el.playbackRate = prefs.rate;
  }, [prefs]);
  useEffect(() => {
    const el = v();
    if (el) el.loop = loop;
  }, [loop]);
  // A new file starts afresh.
  useEffect(() => {
    setFailed(false);
    setWaiting(true);
    setTime(0);
    setDuration(0);
    setLoaded([]);
  }, [src]);

  /** Shows the controls, and hides them again after a while if it plays. */
  const wake = useCallback(() => {
    setShown(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (!v()?.paused) {
        setShown(false);
        setSpeedOpen(false);
      }
    }, IDLE_MS);
  }, []);
  useEffect(() => () => clearTimeout(idle.current), []);

  const toggle = useCallback(() => {
    const el = v();
    if (!el || failed) return;
    if (el.paused || el.ended) void el.play().catch(() => {});
    else el.pause();
    wake();
  }, [failed, wake]);

  const seekTo = useCallback((s: number) => {
    const el = v();
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.min(el.duration, Math.max(0, s));
    setTime(el.currentTime);
  }, []);
  const seekBy = useCallback((d: number) => seekTo((v()?.currentTime ?? 0) + d), [seekTo]);

  const fullscreen = useCallback(() => {
    const el = box.current;
    const vid = v() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (el?.requestFullscreen) void el.requestFullscreen().catch(() => vid?.webkitEnterFullscreen?.());
    // Safari on an iPhone has full screen for the video alone.
    else vid?.webkitEnterFullscreen?.();
  }, []);
  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  const pip = () => {
    const el = v();
    if (!el) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void el.requestPictureInPicture().catch(() => {});
  };

  const readLoaded = () => {
    const el = v();
    if (!el || !el.duration) return;
    const out: [number, number][] = [];
    for (let i = 0; i < el.buffered.length; i++) out.push([el.buffered.start(i) / el.duration, el.buffered.end(i) / el.duration]);
    setLoaded(out);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = v();
    if (!el) return;
    const k = e.key.toLowerCase();
    let done = true;
    if (k === ' ' || k === 'k') toggle();
    else if (k === 'arrowleft') seekBy(-5);
    else if (k === 'arrowright') seekBy(5);
    else if (k === 'j') seekBy(-10);
    else if (k === 'l') seekBy(10);
    else if (k === 'arrowup') update({ volume: Math.min(1, Math.round((prefs.volume + 0.1) * 10) / 10), muted: false });
    else if (k === 'arrowdown') update({ volume: Math.max(0, Math.round((prefs.volume - 0.1) * 10) / 10) });
    else if (k === 'm') update({ muted: !prefs.muted });
    else if (k === 'f') fullscreen();
    else if (k === 'home') seekTo(0);
    else if (k === 'end') seekTo(el.duration);
    else if (/^[0-9]$/.test(k)) seekTo((Number(k) / 10) * el.duration);
    else if ((k === ',' || k === '.') && el.paused) seekBy(k === ',' ? -1 / 30 : 1 / 30);
    else done = false;
    if (done) {
      e.preventDefault();
      wake();
    }
  };

  // The picture: a click plays or pauses (a double click goes full screen); on a touch screen a tap shows the
  // controls and a double tap on either side moves 10 s.
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0 || failed) return;
    if (e.pointerType !== 'touch') return;
    const now = Date.now();
    const prev = tap.current;
    if (prev && now - prev.at < 300 && Math.abs(prev.x - e.clientX) < 60) {
      clearTimeout(prev.timer);
      tap.current = null;
      const side = along(box.current!, e.clientX) < 0.5 ? 'left' : 'right';
      seekBy(side === 'left' ? -10 : 10);
      setJump({ side, id: now });
      wake();
      return;
    }
    const timer = setTimeout(() => {
      tap.current = null;
      if (shown && !v()?.paused) {
        clearTimeout(idle.current);
        setShown(false);
        setSpeedOpen(false);
      } else wake();
    }, 300);
    tap.current = { at: now, x: e.clientX, timer };
  };
  useEffect(() => {
    if (!jump) return;
    const t = setTimeout(() => setJump(null), 600);
    return () => clearTimeout(t);
  }, [jump]);

  // The seek bar: drag along it (the picture follows), or click.
  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = v();
    if (!el || !duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = along(e.currentTarget, e.clientX);
    setScrub(f);
    seekTo(f * duration);
  };
  const onBarMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const f = along(e.currentTarget, e.clientX);
    setHover(f);
    if (scrub !== null) {
      setScrub(f);
      seekTo(f * duration);
    }
    wake();
  };
  const onBarUp = () => setScrub(null);

  const shownTime = scrub !== null ? scrub * duration : time;
  const played = duration ? (shownTime / duration) * 100 : 0;
  const controls = shown || !playing || speedOpen || scrub !== null;
  const VolumeIcon = prefs.muted || prefs.volume === 0 ? VolumeX : prefs.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={box}
      tabIndex={0}
      role="group"
      aria-label={name ? `Video: ${name}` : 'Video'}
      onKeyDown={onKey}
      onPointerMove={(e) => e.pointerType !== 'touch' && wake()}
      onPointerLeave={() => playing && !speedOpen && scrub === null && setShown(false)}
      className={cx('group/video relative flex h-full w-full items-center justify-center overflow-hidden bg-black outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/60', !controls && 'cursor-none', full ? '' : 'rounded-xl', className)}
    >
      <video
        ref={video}
        src={src}
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onClick={() => !touch && toggle()}
        onDoubleClick={() => !touch && fullscreen()}
        onPointerUp={onPointerUp}
        onPlay={() => (setPlaying(true), wake())}
        onPause={() => (setPlaying(false), setShown(true))}
        onEnded={() => (setPlaying(false), setShown(true))}
        onTimeUpdate={() => setTime(v()?.currentTime ?? 0)}
        onDurationChange={() => setDuration(v()?.duration ?? 0)}
        onLoadedMetadata={() => {
          setDuration(v()?.duration ?? 0);
          setWaiting(false);
        }}
        onProgress={readLoaded}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onPlaying={() => setWaiting(false)}
        onSeeked={readLoaded}
        onError={() => {
          setFailed(true);
          setWaiting(false);
        }}
      />

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white">
          <TriangleAlert size={26} className="text-warn" />
          <div className="text-[14.5px] font-medium">This video can’t play here</div>
          <div className="max-w-[380px] text-[12.5px] leading-snug text-white/70">Its format or codec isn’t one this browser plays (MKV and AVI files often aren’t). Download it to watch it in a video app.</div>
          {downloadUrl && (
            <a href={downloadUrl} className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-[13px] text-white transition-colors hover:bg-white/25">
              <Download size={14} />
              Download
            </a>
          )}
        </div>
      ) : (
        <>
          {waiting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Loader2 size={34} className="animate-spin text-white/80" />
            </div>
          )}
          {!playing && !waiting && (
            <button
              type="button"
              aria-label="Play"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm transition-transform hover:scale-105"
            >
              <Play size={28} className="translate-x-0.5" fill="currentColor" />
            </button>
          )}
          {jump && (
            <div key={jump.id} className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3.5 py-2 text-[13px] font-medium text-white', jump.side === 'left' ? 'left-[12%]' : 'right-[12%]')}>
              {jump.side === 'left' ? '−10 s' : '+10 s'}
            </div>
          )}

          {/* The controls, over a shade at the bottom. */}
          <div
            onPointerUp={(e) => e.stopPropagation()}
            className={cx('absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pt-10 pb-[max(0.375rem,var(--safe-bottom))] transition-opacity duration-200', controls ? 'opacity-100' : 'pointer-events-none opacity-0')}
          >
            <div
              ref={bar}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(shownTime)}
              aria-valuetext={`${clock(shownTime)} of ${clock(duration)}`}
              onPointerDown={onBarDown}
              onPointerMove={onBarMove}
              onPointerUp={onBarUp}
              onPointerCancel={onBarUp}
              onPointerLeave={() => setHover(null)}
              className="group/bar relative flex h-5 cursor-pointer touch-none items-center"
            >
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/bar:h-1.5">
                {loaded.map(([a, b], i) => (
                  <div key={i} className="absolute inset-y-0 bg-white/35" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} />
                ))}
                <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${played}%` }} />
              </div>
              <div
                className={cx('pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow transition-transform', scrub !== null || touch ? 'scale-100' : 'scale-0 group-hover/bar:scale-100')}
                style={{ left: `${played}%` }}
              />
              {hover !== null && duration > 0 && scrub === null && !touch && (
                <div className="tnum pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11.5px] text-white" style={{ left: `${hover * 100}%` }}>
                  {clock(hover * duration)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              <Btn label={playing ? 'Pause (K)' : 'Play (K)'} onClick={toggle}>
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </Btn>
              <div className="group/vol flex items-center">
                <Btn label={prefs.muted ? 'Unmute (M)' : 'Mute (M)'} onClick={() => update({ muted: !prefs.muted, volume: prefs.volume || 0.5 })}>
                  <VolumeIcon size={18} />
                </Btn>
                {!touch && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    aria-label="Volume"
                    value={prefs.muted ? 0 : prefs.volume}
                    onChange={(e) => update({ volume: Number(e.target.value), muted: Number(e.target.value) === 0 })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-0 cursor-pointer accent-[var(--accent)] opacity-0 transition-all duration-200 group-hover/vol:mr-1 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:mr-1 focus:w-20 focus:opacity-100"
                  />
                )}
              </div>
              <span className="tnum px-1.5 text-[12.5px] whitespace-nowrap text-white/90">
                {clock(shownTime)} <span className="text-white/55">/ {clock(duration)}</span>
              </span>
              <span className="flex-1" />
              <div className="relative">
                <button
                  type="button"
                  aria-label="Speed"
                  title="Speed"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSpeedOpen((o) => !o);
                    wake();
                  }}
                  className={cx('tnum h-9 min-w-9 rounded-lg px-1.5 text-[12.5px] font-medium transition-colors hover:bg-white/15', prefs.rate !== 1 ? 'text-accent' : 'text-white')}
                >
                  {prefs.rate}×
                </button>
                {speedOpen && (
                  <div role="menu" className="absolute right-0 bottom-full mb-1.5 w-28 overflow-hidden rounded-xl bg-black/90 py-1 shadow-lg ring-1 ring-white/15">
                    {SPEEDS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="menuitemradio"
                        aria-checked={prefs.rate === r}
                        onClick={(e) => {
                          e.stopPropagation();
                          update({ rate: r });
                          setSpeedOpen(false);
                        }}
                        className={cx('tnum flex w-full items-center px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/15', prefs.rate === r ? 'text-accent' : 'text-white')}
                      >
                        {r === 1 ? 'Normal' : `${r}×`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Btn label={loop ? 'Loop: on' : 'Loop'} onClick={() => setLoop((l) => !l)} active={loop}>
                <Repeat size={17} />
              </Btn>
              {canPip && (
                <span className="max-sm:hidden">
                  <Btn label="Picture in picture" onClick={pip}>
                    <PictureInPicture2 size={17} />
                  </Btn>
                </span>
              )}
              {downloadUrl && (
                <span className="max-sm:hidden">
                  <Btn label="Download" onClick={() => (location.href = downloadUrl)}>
                    <Download size={17} />
                  </Btn>
                </span>
              )}
              <Btn label={full ? 'Exit full screen (F)' : 'Full screen (F)'} onClick={fullscreen}>
                {full ? <Minimize size={17} /> : <Maximize size={17} />}
              </Btn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
