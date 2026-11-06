// The timeline across the bottom, as an editor's: a ruler of timecode (In and Out shaded, markers flagged, the playhead
// dragged along it), then the tracks, each with its header (its name, show or hide, mute, solo, lock, its height): T1
// titles and captions, V3 and V2 overlays, V1 the clips one after another with their frames and the transitions between
// them, A1 the clips' own sound with its shape, A2 music, A3 the voice-over. The tools: Select (move, reorder the main
// track, trim by the ends), Blade (cut where clicked), Trim (roll the cut between two clips) and Hand (move the view).
// Snapping (N) pulls to the playhead, ends, markers, In and Out. Things of the media panel are dropped on a track.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Eye, EyeOff, Hand, Lock, LockOpen, Magnet, MousePointer2, Plus, Scissors, SeparatorHorizontal, UnfoldHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { audioLength, isStill, overlapFades, overlayLength, sourceAt, timecode, VIDEO_TRANSITIONS, type ClipSpan, type VideoClip, type VideoFactsOf, type VideoRecipe, type VideoTrackId } from '@shared/mediaedit-video';
import { cx } from '../../../components/ui';
import { playUrl, soundShape, stripUrl } from './api';
import { useClock, type Clock } from './clock';
import type { Engine } from './engine';
import { deleteClip, moveClip, setAudio, setClip, setOverlay, setText, shiftSound, snap, snapTimes, splitClip, splitItem, spansOf, trimClip, type Picked, type PoolItem, type SoundRange } from './model';
import { SoundItem, Wave, type Phase as SoundPhase } from './SoundItem';
import { Tool } from './shell';

type Phase = 'begin' | 'move' | 'end';
export type TimelineTool = 'select' | 'blade' | 'trim' | 'hand';

/** A change to the recipe: one step of undo, or for a drag, one for all of it (begin, then end). */
export interface Change {
  (f: (r: VideoRecipe) => VideoRecipe): void;
  begin(): void;
  end(): void;
}

export interface TrackUi {
  locked?: boolean;
  tall?: boolean;
}

interface Row {
  id: VideoTrackId;
  name: string;
  title: string;
  kind: 'text' | 'overlay' | 'clip' | 'clipsound' | 'audio';
  h: [number, number];
}

const ROWS: Row[] = [
  { id: 't1', name: 'T1', title: 'Words', kind: 'text', h: [26, 40] },
  { id: 'v3', name: 'V3', title: 'Overlays', kind: 'overlay', h: [32, 52] },
  { id: 'v2', name: 'V2', title: 'Overlays', kind: 'overlay', h: [32, 52] },
  { id: 'v1', name: 'V1', title: 'Clips', kind: 'clip', h: [50, 78] },
  { id: 'a1', name: 'A1', title: 'Sound', kind: 'clipsound', h: [34, 58] },
  { id: 'a2', name: 'A2', title: 'Music', kind: 'audio', h: [32, 52] },
  { id: 'a3', name: 'A3', title: 'Voice', kind: 'audio', h: [32, 52] },
];
const HEAD = 164;
const PAD = 10;
const RULER = 24;

export interface TimelineProps {
  recipe: VideoRecipe;
  factsOf: VideoFactsOf;
  engine: Engine;
  clock: Clock;
  /** The video being edited: what clips without a src play. */
  main: string;
  fps: number;
  picked: Picked;
  onPick(p: Picked): void;
  change: Change;
  markers: number[];
  onMarkers(m: number[]): void;
  inOut: [number | null, number | null];
  tool: TimelineTool;
  onTool(t: TimelineTool): void;
  snapOn: boolean;
  onSnap(on: boolean): void;
  pps: number;
  onPps(n: number): void;
  trackUi: Partial<Record<VideoTrackId, TrackUi>>;
  onTrackUi(id: VideoTrackId, u: TrackUi): void;
  onMenu(at: { x: number; y: number }, p: Picked, t: number): void;
  onDrop(item: PoolItem, row: VideoTrackId, t: number, index: number): void;
  /** A part of one sound picked (Shift and a drag on it): Delete silences it. */
  range: SoundRange;
  onRange(r: SoundRange): void;
  pool: PoolItem[];
  /** A phone: the main track alone, no headers' buttons. */
  compact?: boolean;
}

/** Seconds between the ruler's labels at `pps` pixels a second: at least about 80 pixels apart. */
function tickStep(pps: number): number {
  for (const s of [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]) if (s * pps >= 80) return s;
  return 3600;
}

const clockLabel = (t: number, step: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return step < 1 ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.round(s)).padStart(2, '0')}`;
};

export function Timeline(p: TimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 800, left: 0 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const m = () => setView({ w: el.clientWidth, left: el.scrollLeft });
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    el.addEventListener('scroll', m, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', m);
    };
  }, []);
  const r = p.recipe;
  const { spans, length } = useMemo(() => spansOf(r, p.factsOf), [r, p.factsOf]);
  const cross = useMemo(() => overlapFades(r.audio ?? [], (a) => Math.min(audioLength(a, p.factsOf(a.src)), length - a.start)), [r.audio, p.factsOf, length]);
  const pps = p.pps;
  const x = (t: number) => PAD + t * pps;
  const width = Math.max(view.w - (p.compact ? 0 : HEAD), PAD * 2 + (length + 8) * pps);
  const rows = p.compact ? ROWS.filter((row) => row.id === 'v1' || row.id === 'a1') : ROWS;
  const [snapLine, setSnapLine] = useState<number | null>(null);
  // The first view shows the whole timeline.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || view.w < 100 || length <= 0) return;
    fitted.current = true;
    p.onPps(Math.max(2, Math.min(200, (view.w - (p.compact ? 0 : HEAD) - PAD * 3) / Math.max(4, length))));
  }, [view.w, length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [insertAt, setInsertAt] = useState<number | null>(null);

  /** Seconds at a pointer's x. */
  const tAt = (clientX: number) => {
    const el = scroller.current!;
    const box = el.getBoundingClientRect();
    return Math.max(0, (clientX - box.left - (p.compact ? 0 : HEAD) + el.scrollLeft - PAD) / pps);
  };
  const snapped = (t: number, except?: string) => {
    if (!p.snapOn) return t;
    const s = snap(t, snapTimes(r, p.factsOf, { playhead: p.clock.get(), markers: p.markers, inOut: p.inOut, except }), pps);
    setSnapLine(s.to);
    return s.t;
  };

  // Ctrl (or ⌘) and the wheel zoom about the pointer.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const t = tAt(e.clientX);
      const next = Math.max(2, Math.min(600, pps * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      p.onPps(next);
      requestAnimationFrame(() => (el.scrollLeft = Math.max(0, PAD + t * next - (e.clientX - el.getBoundingClientRect().left - HEAD))));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  /** A drag from a press: `go` hears where it is (seconds), each move, and at the end. */
  const dragging = (go: (t: number, phase: Phase, e: PointerEvent | React.PointerEvent) => void) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    go(tAt(e.clientX), 'begin', e);
    const move = (ev: PointerEvent) => go(tAt(ev.clientX), 'move', ev);
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      go(tAt(ev.clientX), 'end', ev);
      setSnapLine(null);
      setInsertAt(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const locked = (id: VideoTrackId) => !!p.trackUi[id]?.locked;
  const soundStep = (phase: SoundPhase, apply: () => void) => {
    if (phase === 'begin') return p.change.begin();
    apply();
    if (phase === 'end') p.change.end();
  };

  /** What a press on a thing does, by the tool in use: pick it and move it, cut it, or move the view. */
  const press = (pk: NonNullable<Picked>, row: VideoTrackId, moveBy: (dt: number, t0: number, phase: Phase, t: number) => void) => (e: React.PointerEvent) => {
    if (p.tool === 'hand') return;
    if (e.button === 2) return;
    if (p.tool === 'blade') {
      e.stopPropagation();
      if (locked(row)) return;
      const t = snapped(tAt(e.clientX));
      setSnapLine(null);
      p.change((x0) => (pk.kind === 'clip' || pk.kind === 'clipsound' ? splitClip(x0, p.factsOf, pk.id, t) : pk.kind === 'transition' ? x0 : splitItem(x0, p.factsOf, pk.kind, pk.id, t)));
      return;
    }
    p.onPick(pk);
    if (locked(row)) return;
    let t0 = 0;
    let moved = false;
    dragging((t, phase) => {
      if (phase === 'begin') {
        t0 = t;
        return;
      }
      if (!moved && phase === 'move' && Math.abs(t - t0) * pps < 3) return;
      if (!moved) {
        moved = true;
        p.change.begin();
        moveBy(0, t0, 'begin', t0);
      }
      moveBy(t - t0, t0, phase, t);
      if (phase === 'end') p.change.end();
    })(e);
  };

  // ---- the main track: clips moved to a new place, trimmed by their ends, rolled ------------------------------------

  const clips = r.clips ?? [];
  const reorder = (id: string) => (dt: number, t0: number, phase: Phase, t: number) => {
    const at = clips.findIndex((c) => c.id === id);
    let to = spans.findIndex((s) => t < s.start + s.length / 2);
    if (to < 0) to = clips.length;
    if (phase !== 'end') setInsertAt(to === at || to === at + 1 ? null : to);
    else if (to !== at && to !== at + 1) p.change((x0) => moveClip(x0, id, to));
    void dt;
    void t0;
  };
  const trimEdge = (id: string, edge: 'start' | 'end') => {
    let first: VideoClip | null = null;
    return (e: React.PointerEvent) => {
      if (p.tool === 'blade' || p.tool === 'hand' || locked('v1')) return;
      const i = clips.findIndex((c) => c.id === id);
      // The Trim tool on a cut between two clips rolls it: one gets longer as the other gets shorter.
      const roll = p.tool === 'trim' && ((edge === 'end' && i < clips.length - 1) || (edge === 'start' && i > 0));
      const other = roll ? clips[edge === 'end' ? i + 1 : i - 1] : null;
      let firstOther: VideoClip | null = null;
      p.onPick({ kind: 'clip', id });
      let t0 = 0;
      dragging((t, phase) => {
        if (phase === 'begin') {
          t0 = t;
          first = clips[i];
          firstOther = other;
          p.change.begin();
          return;
        }
        const end = edge === 'end' ? spans[i].end : spans[i].start;
        const dt = snapped(end + (t - t0), id) - end;
        p.change((x0) => {
          let next = setClip(x0, id, () => trimClip(first!, p.factsOf(first!.src), edge, dt));
          if (other && firstOther) next = setClip(next, other.id!, () => trimClip(firstOther!, p.factsOf(firstOther!.src), edge === 'end' ? 'start' : 'end', dt));
          return next;
        });
        if (phase === 'end') p.change.end();
      })(e);
    };
  };

  // ---- the other tracks: moved in time (and between their tracks), trimmed by their ends ----------------------------

  const moveItem = (kind: 'overlay' | 'text' | 'audio', id: string) => {
    const r0 = { item: null as any };
    return (dt: number, t0: number, phase: Phase, t: number) => {
      void t;
      if (phase === 'begin') {
        r0.item = kind === 'overlay' ? r.overlays?.find((o) => o.id === id) : kind === 'audio' ? r.audio?.find((a) => a.id === id) : r.texts?.find((x0) => x0.id === id);
        return;
      }
      const it = r0.item;
      if (!it) return;
      const start = kind === 'text' ? it.from : it.start;
      const s = Math.max(0, snapped(start + dt, id));
      p.change((x0) =>
        kind === 'overlay' ? setOverlay(x0, id, (o) => ({ ...o, start: Math.round(s * 1000) / 1000 })) : kind === 'audio' ? setAudio(x0, id, (a) => ({ ...a, start: Math.round(s * 1000) / 1000 })) : setText(x0, id, (x1) => ({ ...x1, from: Math.round(s * 1000) / 1000, to: Math.round((s + (it.to - it.from)) * 1000) / 1000 })),
      );
      void t0;
    };
  };
  const itemEdge = (kind: 'overlay' | 'text' | 'audio', id: string, edge: 'start' | 'end', row: VideoTrackId) => (e: React.PointerEvent) => {
    if (p.tool === 'blade' || p.tool === 'hand' || locked(row)) return;
    p.onPick({ kind, id });
    let first: any = null;
    dragging((t, phase) => {
      if (phase === 'begin') {
        first = kind === 'overlay' ? r.overlays?.find((o) => o.id === id) : kind === 'audio' ? r.audio?.find((a) => a.id === id) : r.texts?.find((x0) => x0.id === id);
        p.change.begin();
        return;
      }
      if (!first) return;
      const s = snapped(t, id);
      const ms = (v: number) => Math.round(v * 1000) / 1000;
      p.change((x0) => {
        if (kind === 'text') return setText(x0, id, (x1) => (edge === 'start' ? { ...x1, from: ms(Math.min(s, first.to - 0.1)) } : { ...x1, to: ms(Math.max(s, first.from + 0.1)) }));
        const f = p.factsOf(first.src);
        const len = kind === 'overlay' ? overlayLength(first, f) : audioLength(first, f);
        const [a, b] = first.trim ?? [0, f?.duration ?? len];
        if (edge === 'end') {
          const nl = Math.max(0.1, s - first.start);
          if (kind === 'overlay' && (first.picture || f?.picture)) return setOverlay(x0, id, (o) => ({ ...o, length: ms(nl) }));
          const nb = Math.min(f?.duration ?? a + nl, a + nl);
          return kind === 'overlay' ? setOverlay(x0, id, (o) => ({ ...o, trim: [a, ms(nb)] })) : setAudio(x0, id, (m) => ({ ...m, trim: [a, ms(nb)] }));
        }
        const d = Math.max(-first.start, Math.min(len - 0.1, s - first.start));
        if (kind === 'overlay' && (first.picture || f?.picture)) return setOverlay(x0, id, (o) => ({ ...o, start: ms(first.start + d), length: ms(len - d) }));
        const na = Math.max(0, a + d);
        const nd = na - a;
        return kind === 'overlay' ? setOverlay(x0, id, (o) => ({ ...o, start: ms(first.start + nd), trim: [ms(na), b] })) : setAudio(x0, id, () => ({ ...first, ...shiftSound(first, -nd, len - nd), start: ms(first.start + nd), trim: [ms(na), b] }));
      });
      if (phase === 'end') p.change.end();
    })(e);
  };

  const menu = (pk: Picked) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pk) p.onPick(pk);
    p.onMenu({ x: e.clientX, y: e.clientY }, pk, tAt(e.clientX));
  };

  // The hand: drag to move the view.
  const hand = (e: React.PointerEvent) => {
    if (p.tool !== 'hand' || e.button !== 0) return;
    const el = scroller.current!;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const l0 = el.scrollLeft;
    const t0 = el.scrollTop;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => {
      el.scrollLeft = l0 - (ev.clientX - x0);
      el.scrollTop = t0 - (ev.clientY - y0);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  // Things of the media panel dropped on a track.
  const drop = (row: Row) => (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-hydor-media');
    if (!raw) return;
    e.preventDefault();
    const it = p.pool.find((x0) => x0.src === raw);
    if (!it) return;
    const t = tAt(e.clientX);
    let index = spans.findIndex((s) => t < s.start + s.length / 2);
    if (index < 0) index = clips.length;
    p.onDrop(it, row.id, snapped(t), index);
    setSnapLine(null);
  };

  const ph = (h: Row) => h.h[p.trackUi[h.id]?.tall ? 1 : 0];

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg select-none">
      {!p.compact && <TimelineBar {...p} length={length} viewW={view.w} />}
      <div ref={scroller} className={cx('relative min-h-0 flex-1 overflow-auto', p.tool === 'hand' && 'cursor-grab')} onPointerDown={hand} style={{ touchAction: p.tool === 'hand' ? 'none' : undefined }}>
        <div className="relative" style={{ width: width + (p.compact ? 0 : HEAD) }}>
          {/* The ruler, along the top. */}
          <div className="sticky top-0 z-30 flex" style={{ height: RULER }}>
            {!p.compact && <div className="sticky left-0 z-10 shrink-0 border-r border-b border-line bg-bg-1" style={{ width: HEAD }} />}
            <Ruler {...p} width={width} length={length} x={x} tAt={tAt} />
          </div>
          {rows.map((row) => (
            <div key={row.id} className={cx('relative flex border-b border-line', row.id === 'v1' && 'border-b-line-2')} style={{ height: ph(row) }}>
              {!p.compact && <TrackHead row={row} {...p} />}
              <div
                data-track={row.id}
                className={cx('relative min-w-0 flex-1', row.kind === 'clip' ? 'bg-bg-1' : 'bg-bg', locked(row.id) && 'opacity-60')}
                style={{ width }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || p.tool === 'hand' || e.target !== e.currentTarget) return;
                  p.onPick(null);
                  p.engine.seek(snapped(tAt(e.clientX)));
                  setSnapLine(null);
                }}
                onContextMenu={menu(null)}
                onDragOver={(e) => e.dataTransfer.types.includes('application/x-hydor-media') && e.preventDefault()}
                onDrop={drop(row)}
              >
                {row.kind === 'clip' &&
                  clips.map((c, i) => (
                    <ClipItem
                      key={c.id}
                      c={c}
                      span={spans[i]}
                      x={x}
                      pps={pps}
                      h={ph(row)}
                      main={p.main}
                      factsOf={p.factsOf}
                      picked={p.picked?.kind === 'clip' && p.picked.id === c.id}
                      hidden={!!r.tracks?.v1?.hidden}
                      onPress={press({ kind: 'clip', id: c.id! }, 'v1', reorder(c.id!))}
                      onStart={trimEdge(c.id!, 'start')}
                      onEnd={trimEdge(c.id!, 'end')}
                      onMenu={menu({ kind: 'clip', id: c.id! })}
                    />
                  ))}
                {row.kind === 'clip' &&
                  clips.map((c, i) =>
                    i < clips.length - 1 ? (
                      <Junction
                        key={`j${c.id}`}
                        c={c}
                        next={spans[i + 1]}
                        x={x}
                        pps={pps}
                        h={ph(row)}
                        picked={p.picked?.kind === 'transition' && p.picked.id === c.id}
                        onPick={() => p.onPick({ kind: 'transition', id: c.id! })}
                        onAdd={() => p.change((x0) => setClip(x0, c.id!, (y) => ({ ...y, transition: { kind: 'dissolve', length: Math.min(1, Math.floor((Math.min(spans[i].length, spans[i + 1].length) / 2) * 10) / 10) } })))}
                        onMenu={menu({ kind: 'transition', id: c.id! })}
                      />
                    ) : null,
                  )}
                {row.kind === 'clip' && insertAt !== null && <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-accent" style={{ left: x(insertAt < spans.length ? spans[insertAt].start : length) - 1 }} />}
                {row.kind === 'clipsound' &&
                  clips.map((c, i) => {
                    const f = p.factsOf(c.src);
                    const sp = spans[i];
                    const silent = isStill(c) || !!f?.picture || !!c.mute || (!f?.audio && !c.sound);
                    const [a, b] = c.trim ?? [0, f?.duration ?? 0];
                    const s0 = sourceAt(c, f, 0);
                    const s1 = sourceAt(c, f, sp.length);
                    const id = c.id!;
                    const set = (patch: Partial<VideoClip>) => p.change((x0) => setClip(x0, id, (y) => ({ ...y, ...patch })));
                    return (
                      <SoundItem
                        key={id}
                        left={x(sp.start + sp.tin / 2)}
                        width={(sp.length - sp.tin / 2 - sp.tout / 2) * pps}
                        pps={pps}
                        h={ph(row)}
                        offset={sp.tin / 2}
                        length={sp.length}
                        wave={f ? { src: c.sound ?? c.src ?? p.main, from: Math.min(s0, s1, b), to: Math.max(s0, s1, a), duration: f.duration, reverse: c.reverse } : undefined}
                        silent={silent}
                        volume={c.volume}
                        levels={c.levels}
                        silence={c.silence}
                        fadeIn={c.soundFadeIn}
                        fadeOut={c.soundFadeOut}
                        channels={c.channels}
                        picked={(p.picked?.kind === 'clipsound' || p.picked?.kind === 'clip') && p.picked.id === id}
                        dim={!!r.tracks?.a1?.mute}
                        tone="clip"
                        locked={locked('a1')}
                        range={p.range?.kind === 'clip' && p.range.id === id ? [p.range.from - sp.start, p.range.to - sp.start] : null}
                        onPress={press({ kind: 'clipsound', id }, 'a1', () => {})}
                        onStart={trimEdge(id, 'start')}
                        onEnd={trimEdge(id, 'end')}
                        onMenu={menu({ kind: 'clipsound', id })}
                        onFade={(edge, sec, phase) => soundStep(phase, () => set(edge === 'in' ? { soundFadeIn: sec || undefined } : { soundFadeOut: sec || undefined }))}
                        onLine={(next, phase) => soundStep(phase, () => set(next))}
                        onRange={(from, to, phase) => {
                          p.onPick({ kind: 'clipsound', id });
                          p.onRange(to - from >= 0.02 || phase !== 'end' ? { kind: 'clip', id, from: sp.start + from, to: sp.start + to } : null);
                        }}
                      />
                    );
                  })}
                {row.kind === 'overlay' &&
                  (r.overlays ?? [])
                    .filter((o) => (o.track === 3 ? 'v3' : 'v2') === row.id)
                    .map((o) => {
                      const f = p.factsOf(o.src);
                      const len = overlayLength(o, f);
                      return (
                        <Block
                          key={o.id}
                          left={x(o.start)}
                          width={len * pps}
                          tone="overlay"
                          picked={p.picked?.kind === 'overlay' && p.picked.id === o.id}
                          label={o.name ?? 'Overlay'}
                          thumb={o.picture || f?.picture ? playUrl(o.src) : f ? stripUrl(o.src, 1, 64, o.trim?.[0] ?? 0, (o.trim?.[0] ?? 0) + 0.2) : undefined}
                          onPress={press({ kind: 'overlay', id: o.id! }, row.id, moveItem('overlay', o.id!))}
                          onStart={itemEdge('overlay', o.id!, 'start', row.id)}
                          onEnd={itemEdge('overlay', o.id!, 'end', row.id)}
                          onMenu={menu({ kind: 'overlay', id: o.id! })}
                        />
                      );
                    })}
                {row.kind === 'text' &&
                  (r.texts ?? []).map((t) => (
                    <Block
                      key={t.id}
                      left={x(t.from)}
                      width={(t.to - t.from) * pps}
                      tone={t.caption ? 'caption' : 'text'}
                      picked={p.picked?.kind === 'text' && p.picked.id === t.id}
                      label={<span translate="no">{t.text.split('\n')[0]}</span>}
                      onPress={press({ kind: 'text', id: t.id! }, 't1', moveItem('text', t.id!))}
                      onStart={itemEdge('text', t.id!, 'start', 't1')}
                      onEnd={itemEdge('text', t.id!, 'end', 't1')}
                      onMenu={menu({ kind: 'text', id: t.id! })}
                    />
                  ))}
                {row.kind === 'audio' &&
                  (r.audio ?? [])
                    .filter((a) => (a.track === 'voice' ? 'a3' : 'a2') === row.id)
                    .map((a) => {
                      const f = p.factsOf(a.src);
                      const len = audioLength(a, f);
                      const id = a.id!;
                      const set = (patch: Partial<NonNullable<VideoRecipe['audio']>[number]>) => p.change((x0) => setAudio(x0, id, (y) => ({ ...y, ...patch })));
                      return (
                        <SoundItem
                          key={id}
                          left={x(a.start)}
                          width={len * pps}
                          pps={pps}
                          h={ph(row)}
                          offset={0}
                          length={len}
                          wave={f ? { src: a.src, from: a.trim?.[0] ?? 0, to: a.trim?.[1] ?? f.duration, duration: f.duration } : undefined}
                          volume={a.volume}
                          levels={a.levels}
                          silence={a.silence}
                          fadeIn={a.fadeIn}
                          fadeOut={a.fadeOut}
                          cross={cross.get(id)}
                          channels={a.channels}
                          picked={p.picked?.kind === 'audio' && p.picked.id === id}
                          dim={!!r.tracks?.[row.id]?.mute}
                          tone={a.track === 'voice' ? 'voice' : 'music'}
                          label={<span translate="no">{a.name ?? 'Sound'}</span>}
                          locked={locked(row.id)}
                          range={p.range?.kind === 'audio' && p.range.id === id ? [p.range.from - a.start, p.range.to - a.start] : null}
                          onPress={press({ kind: 'audio', id }, row.id, moveItem('audio', id))}
                          onStart={itemEdge('audio', id, 'start', row.id)}
                          onEnd={itemEdge('audio', id, 'end', row.id)}
                          onMenu={menu({ kind: 'audio', id })}
                          onFade={(edge, sec, phase) => soundStep(phase, () => set(edge === 'in' ? { fadeIn: sec || undefined } : { fadeOut: sec || undefined }))}
                          onLine={(next, phase) => soundStep(phase, () => set(next))}
                          onRange={(from, to, phase) => {
                            p.onPick({ kind: 'audio', id });
                            p.onRange(to - from >= 0.02 || phase !== 'end' ? { kind: 'audio', id, from: a.start + from, to: a.start + to } : null);
                          }}
                        />
                      );
                    })}
              </div>
            </div>
          ))}
          {/* The playhead, the snap line, In and Out across every track. */}
          <Overlay {...p} x={x} snapLine={snapLine} />
        </div>
      </div>
    </div>
  );
}

function TimelineBar(p: TimelineProps & { length: number; viewW: number }) {
  const t = useClock(p.clock);
  const zoom = (k: number) => p.onPps(Math.max(2, Math.min(600, p.pps * k)));
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-bg px-2">
      <Tool label="Select" keys="A" on={p.tool === 'select'} onClick={() => p.onTool('select')}>
        <MousePointer2 size={15} />
      </Tool>
      <Tool label="Blade: cut where you click" keys="B" on={p.tool === 'blade'} onClick={() => p.onTool('blade')}>
        <Scissors size={15} />
      </Tool>
      <Tool label="Trim: roll the cut between two clips" keys="T" on={p.tool === 'trim'} onClick={() => p.onTool('trim')}>
        <ArrowLeftRight size={15} />
      </Tool>
      <Tool label="Hand: move the view" keys="H" on={p.tool === 'hand'} onClick={() => p.onTool('hand')}>
        <Hand size={15} />
      </Tool>
      <span className="mx-1 h-4 w-px bg-line" />
      <Tool label="Snapping" keys="N" on={p.snapOn} onClick={() => p.onSnap(!p.snapOn)}>
        <Magnet size={15} />
      </Tool>
      <span className="tnum ml-2 hidden font-mono text-[11.5px] text-fg-3 sm:inline" translate="no">
        {timecode(t, p.fps)}
      </span>
      <span className="min-w-2 flex-1" />
      <Tool label="Zoom out" keys="−" onClick={() => zoom(1 / 1.5)}>
        <ZoomOut size={15} />
      </Tool>
      <input type="range" min={0} max={100} value={Math.round((Math.log(p.pps / 2) / Math.log(300)) * 100)} onChange={(e) => p.onPps(2 * Math.pow(300, Number(e.target.value) / 100))} aria-label="Zoom" className="w-28 accent-[var(--accent)]" />
      <Tool label="Zoom in" keys="+" onClick={() => zoom(1.5)}>
        <ZoomIn size={15} />
      </Tool>
      <Tool label="Zoom to fit" keys="Shift+Z" onClick={() => p.onPps(Math.max(2, Math.min(600, (p.viewW - HEAD - PAD * 3) / Math.max(1, p.length))))}>
        <UnfoldHorizontal size={15} />
      </Tool>
    </div>
  );
}

function Ruler(p: TimelineProps & { width: number; length: number; x: (t: number) => number; tAt: (cx: number) => number }) {
  const step = tickStep(p.pps);
  const n = Math.ceil((p.width - PAD) / p.pps / step) + 1;
  const [a, b] = p.inOut;
  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    p.engine.seek(p.tAt(e.clientX));
    const mv = (ev: PointerEvent) => p.engine.seek(p.tAt(ev.clientX));
    const up = () => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
  };
  return (
    <div data-ruler className="relative min-w-0 flex-1 cursor-pointer border-b border-line bg-bg-1" style={{ width: p.width }} onPointerDown={scrub}>
      {(a !== null || b !== null) && <div className="pointer-events-none absolute inset-y-0 bg-accent/20" style={{ left: p.x(a ?? 0), width: Math.max(2, p.x(b ?? p.length) - p.x(a ?? 0)) }} />}
      {Array.from({ length: n }, (_, i) => {
        const t = i * step;
        return (
          <div key={i} className="pointer-events-none absolute top-0 bottom-0" style={{ left: p.x(t) }}>
            <div className="absolute bottom-0 h-2 w-px bg-line-2" />
            <span className="tnum absolute top-0.5 left-1 text-[10.5px] whitespace-nowrap text-fg-3">{clockLabel(t, step)}</span>
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="absolute bottom-0 h-1 w-px bg-line" style={{ left: (j * step * p.pps) / 5 }} />
            ))}
          </div>
        );
      })}
      {p.markers.map((m, i) => (
        <button
          key={i}
          type="button"
          title={`Marker at ${clockLabel(m, 0.1)}: click to go there, right-click to remove it`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => p.engine.seek(m)}
          onContextMenu={(e) => {
            e.preventDefault();
            p.onMarkers(p.markers.filter((_, j) => j !== i));
          }}
          className="absolute bottom-0 h-3 w-3 -translate-x-1/2 bg-warn [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]"
          style={{ left: p.x(m) }}
        />
      ))}
    </div>
  );
}

/** The playhead (following the time), the snap line and the In and Out lines, over every track. */
function Overlay(p: TimelineProps & { x: (t: number) => number; snapLine: number | null }) {
  const t = useClock(p.clock);
  const head = p.compact ? 0 : HEAD;
  return (
    <div className="pointer-events-none absolute inset-y-0 z-20" style={{ left: head, right: 0 }}>
      {p.snapLine !== null && <div className="absolute inset-y-0 w-px bg-warn" style={{ left: p.x(p.snapLine) }} />}
      {p.inOut.map((v, i) => (v === null ? null : <div key={i} className="absolute inset-y-0 w-px bg-accent/70" style={{ left: p.x(v) }} />))}
      <div className="absolute inset-y-0 w-px bg-err" style={{ left: p.x(t) }}>
        <span className="absolute -top-0 -left-[5px] h-3 w-[11px] bg-err [clip-path:polygon(0_0,100%_0,100%_55%,50%_100%,0_55%)]" />
      </div>
    </div>
  );
}

function TrackHead({ row, ...p }: TimelineProps & { row: Row }) {
  const r = p.recipe;
  const mix = r.tracks?.[row.id] ?? {};
  const ui = p.trackUi[row.id] ?? {};
  const set = (m: Partial<NonNullable<VideoRecipe['tracks']>[VideoTrackId]>) => p.change((x) => ({ ...x, tracks: { ...x.tracks, [row.id]: { ...x.tracks?.[row.id], ...m } } }));
  const audio = row.kind === 'clipsound' || row.kind === 'audio';
  return (
    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-line bg-panel px-1.5" style={{ width: HEAD }}>
      <span className={cx('flex h-5 w-6 shrink-0 items-center justify-center rounded text-[10.5px] font-semibold', audio ? 'bg-ok/15 text-ok' : row.kind === 'text' ? 'bg-warn/15 text-warn' : 'bg-accent-soft text-accent')}>{row.name}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-fg-3" title={row.title}>
        {row.title}
      </span>
      {audio ? (
        <>
          <HeadButton label="Mute" on={!!mix.mute} onClick={() => set({ mute: !mix.mute || undefined })}>
            M
          </HeadButton>
          <HeadButton label="Solo" on={!!mix.solo} onClick={() => set({ solo: !mix.solo || undefined })}>
            S
          </HeadButton>
        </>
      ) : (
        <HeadButton label={mix.hidden ? 'Show the track' : 'Hide the track'} on={!!mix.hidden} onClick={() => set({ hidden: !mix.hidden || undefined })}>
          {mix.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </HeadButton>
      )}
      <HeadButton label={ui.locked ? 'Unlock the track' : 'Lock the track'} on={!!ui.locked} onClick={() => p.onTrackUi(row.id, { ...ui, locked: !ui.locked })}>
        {ui.locked ? <Lock size={11} /> : <LockOpen size={11} />}
      </HeadButton>
      <HeadButton label={ui.tall ? 'Make the track lower' : 'Make the track taller'} on={!!ui.tall} onClick={() => p.onTrackUi(row.id, { ...ui, tall: !ui.tall })}>
        <SeparatorHorizontal size={11} />
      </HeadButton>
    </div>
  );
}

function HeadButton({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick} className={cx('flex h-5 w-[18px] shrink-0 items-center justify-center rounded text-[10px] font-bold', on ? 'bg-accent text-accent-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}>
      {children}
    </button>
  );
}

const TONES = {
  clip: 'border-accent/45 bg-accent-soft',
  overlay: 'border-info/45 bg-info/15',
  text: 'border-warn/45 bg-warn/15',
  caption: 'border-warn/30 bg-warn/10',
  music: 'border-ok/45 bg-ok/15',
  voice: 'border-ok/45 bg-ok/10',
} as const;

/** A thing on a track: its body (to pick and move), its ends (to trim), its name; a picture or a sound's shape in it. */
function Block({
  left,
  width,
  tone,
  picked,
  label,
  thumb,
  wave,
  onPress,
  onStart,
  onEnd,
  onMenu,
}: {
  left: number;
  width: number;
  tone: keyof typeof TONES;
  picked: boolean;
  label: ReactNode;
  thumb?: string;
  wave?: { src: string; from: number; to: number; duration: number };
  onPress: (e: React.PointerEvent) => void;
  onStart: (e: React.PointerEvent) => void;
  onEnd: (e: React.PointerEvent) => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={cx('absolute inset-y-[3px] flex min-w-1.5 cursor-grab items-center overflow-hidden rounded-[5px] border text-[11px] leading-none text-fg', TONES[tone], picked && 'ring-2 ring-accent ring-inset')}
      style={{ left, width: Math.max(4, width), touchAction: 'none' }}
      onPointerDown={onPress}
      onContextMenu={onMenu}
    >
      {thumb && <img src={thumb} alt="" draggable={false} className="pointer-events-none h-full w-auto max-w-[40%] shrink-0 object-cover opacity-80" />}
      {wave && <Wave {...wave} className="pointer-events-none absolute inset-0 text-ok/60" />}
      <span className="pointer-events-none relative min-w-0 truncate px-1.5 font-medium drop-shadow-sm">{label}</span>
      <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-accent/40" onPointerDown={onStart} />
      <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-accent/40" onPointerDown={onEnd} />
    </div>
  );
}

/** A clip of the main track: its frames along it, its name and what was done to it. */
const ClipItem = memo(function ClipItem({
  c,
  span,
  x,
  pps,
  h,
  main,
  factsOf,
  picked,
  hidden,
  onPress,
  onStart,
  onEnd,
  onMenu,
}: {
  c: VideoClip;
  span: ClipSpan;
  x: (t: number) => number;
  pps: number;
  h: number;
  main: string;
  factsOf: VideoFactsOf;
  picked: boolean;
  hidden: boolean;
  onPress: (e: React.PointerEvent) => void;
  onStart: (e: React.PointerEvent) => void;
  onEnd: (e: React.PointerEvent) => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const f = factsOf(c.src);
  const src = c.src ?? main;
  const from = span.start + span.tin / 2;
  const w = (span.length - span.tin / 2 - span.tout / 2) * pps;
  const fh = h - 18;
  const aspect = f && f.width && f.height ? f.width / f.height : 16 / 9;
  // As many frames as fit, asked again only when that changes by much.
  const want = Math.max(1, Math.min(24, Math.round(w / Math.max(12, fh * aspect))));
  const n = want <= 2 ? want : want <= 4 ? 4 : want <= 8 ? 8 : want <= 16 ? 16 : 24;
  const [a, b] = c.trim ?? [0, f?.duration ?? 0];
  const still = c.picture || f?.picture;
  const s0 = sourceAt(c, f, span.tin / 2);
  const s1 = sourceAt(c, f, span.length - span.tout / 2);
  const thumb = still ? playUrl(src) : c.still !== undefined ? stripUrl(src, 1, 96, c.still, c.still + 0.1) : stripUrl(src, n, 96, Math.min(s0, s1, b), Math.max(Math.min(s0, s1) + 0.05, Math.max(s0, s1)));
  const badges = [c.speed ? `${c.speed}×` : '', c.reverse ? 'Reversed' : '', c.stabilize ? 'Steadied' : '', c.still !== undefined ? 'Held' : '', c.grade ? 'Colour' : ''].filter(Boolean);
  return (
    <div
      data-clip
      className={cx('absolute inset-y-[3px] flex cursor-grab flex-col overflow-hidden rounded-[6px] border', TONES.clip, picked && 'ring-2 ring-accent ring-inset', hidden && 'opacity-40')}
      style={{ left: x(from), width: Math.max(4, w), touchAction: 'none' }}
      onPointerDown={onPress}
      onContextMenu={onMenu}
    >
      <div className="flex h-[15px] shrink-0 items-center gap-1 px-1.5 text-[10.5px] leading-none text-fg">
        <span translate="no" className="min-w-0 truncate font-medium">
          {c.name ?? 'Clip'}
        </span>
        {badges.map((b2) => (
          <span key={b2} className="shrink-0 rounded bg-black/30 px-1 py-px text-[9.5px] text-white/90">
            {b2}
          </span>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black/40">
        {still ? <div className="h-full w-full bg-repeat-x opacity-90" style={{ backgroundImage: `url("${thumb}")`, backgroundSize: 'auto 100%' }} /> : <img src={thumb} alt="" draggable={false} className="pointer-events-none h-full w-full object-fill opacity-90" />}
      </div>
      <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-accent/50" onPointerDown={onStart} />
      <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-accent/50" onPointerDown={onEnd} />
    </div>
  );
});

/** The cut between two clips: its transition (to pick), or a + to add one. */
function Junction({ c, next, x, pps, h, picked, onPick, onAdd, onMenu }: { c: VideoClip; next: ClipSpan; x: (t: number) => number; pps: number; h: number; picked: boolean; onPick: () => void; onAdd: () => void; onMenu: (e: React.MouseEvent) => void }) {
  const t = c.transition;
  if (!t)
    return (
      <button
        type="button"
        title="Add a transition here"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onAdd}
        className="absolute z-10 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-line-2 bg-bg-2 text-fg-3 opacity-0 transition-opacity hover:text-fg [div:hover>&]:opacity-100"
        style={{ left: x(next.start), top: h / 2 - 8 }}
      >
        <Plus size={10} />
      </button>
    );
  const label = VIDEO_TRANSITIONS.find((k) => k.id === t.kind)?.label ?? 'Transition';
  return (
    <button
      type="button"
      title={`${label}, ${t.length} s`}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPick();
      }}
      onContextMenu={onMenu}
      className={cx('absolute z-10 flex items-center justify-center overflow-hidden rounded border text-[9.5px] font-medium', picked ? 'border-accent bg-accent text-accent-fg' : 'border-white/30 bg-black/55 text-white')}
      style={{ left: x(next.start), width: Math.max(10, t.length * pps), top: 18, height: h - 24 }}
    >
      <span className="truncate px-0.5">{t.length * pps > 60 ? label : '⧓'}</span>
    </button>
  );
}

/** A clip or an item removed by the keyboard's Delete (and Shift for a ripple), as the timeline's menu does. */
export function deletePicked(r: VideoRecipe, f: VideoFactsOf, p: Picked, ripple: boolean): VideoRecipe {
  if (!p) return r;
  if (p.kind === 'clip') return deleteClip(r, f, p.id, { ripple });
  if (p.kind === 'transition') return setClip(r, p.id, (c) => ({ ...c, transition: undefined }));
  if (p.kind === 'overlay') return { ...r, overlays: (r.overlays ?? []).filter((o) => o.id !== p.id) };
  if (p.kind === 'audio') return { ...r, audio: (r.audio ?? []).filter((a) => a.id !== p.id) };
  return { ...r, texts: (r.texts ?? []).filter((t) => t.id !== p.id) };
}
