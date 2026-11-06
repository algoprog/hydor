// The video editor, in a tab of its own (host.tsx): the video as the edit will make it, a timeline of its frames, and a
// tool at a time. Trim keeps a part (the handles at the timeline's ends), Split and Delete take parts out, and the speed
// changes; Crop cuts it to a shape and turns or mirrors it; Text puts titles and captions over it, each shown from and to
// a time; Adjust changes its colour and fades it in and out; Sound makes it quieter, louder or silent and puts music from
// the Library under it. Everything shows in the browser as it will be; Save has the server make it exactly (ffmpeg,
// server/mediaedit/video.ts), with its progress and a way to stop, then puts it back where it came from (a slide's video
// and its still, a Library item, a file), or keeps a copy, a GIF or one frame as a picture. Undo and redo for every step.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Camera, ChevronDown, Clapperboard, Crop, Ellipsis, Film, Image as ImageIcon, Pause, Play, Redo2, RotateCcw, Scissors, SlidersHorizontal, Trash2, Type, Undo2, Volume2, X } from 'lucide-react';
import {
  cropToShape,
  editedLength,
  editedSize,
  isKept,
  keptParts,
  MIN_PART,
  normalizeVideoRecipe,
  originalRect,
  shownRect,
  toEdited,
  turnedSize,
  videoClock,
  type VideoCrop,
  type VideoEditAsk,
  type VideoEditJob,
  type VideoFacts,
  type VideoRecipe,
  type VideoSaveTo,
  type VideoShape,
  type VideoTurn,
} from '@shared/mediaedit-video';
import { Button, cx, Empty, IconButton, MenuItem, MenuSep, Popover, Segmented, Throbber, useIsMobile } from '../../components/ui';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import type { EditorProps, OpenEditor } from './host';
import { makeEdit, playUrl, stopEdit, stripUrl, videoFacts } from './video/api';
import { makeClock, useClock, type Clock } from './video/clock';
import { useHistory } from './video/history';
import { AdjustPanel, CropPanel, newText, SoundPanel, TextPanel, TrimPanel, type Change, type Tool } from './video/panels';
import { Stage, type ShownText } from './video/Stage';
import { drawText } from './video/text';
import { partAt, Timeline } from './video/Timeline';
import { usePlayer } from './video/usePlayer';

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'trim', label: 'Trim', icon: <Scissors size={15} /> },
  { id: 'crop', label: 'Crop', icon: <Crop size={15} /> },
  { id: 'text', label: 'Text', icon: <Type size={15} /> },
  { id: 'adjust', label: 'Adjust', icon: <SlidersHorizontal size={15} /> },
  { id: 'sound', label: 'Sound', icon: <Volume2 size={15} /> },
];

interface Edit {
  recipe: VideoRecipe;
  /** Where it was split (seconds of the original): the parts between can be deleted. */
  splits: number[];
  /** A slide's video: the moment its still is taken at. */
  stillAt?: number;
}

const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
const stemOf = (p: string) => nameOf(p).replace(/\.[^.]+$/, '');

/** What Save does (and Save a copy, when offered), for a video opened as `o`. */
function savePlans(o: OpenEditor, detached: boolean): { main: { label: string; to: VideoSaveTo; says: string; fixed?: string }; copy: { label: string; to: VideoSaveTo; says: string } | null; beside: VideoSaveTo } {
  const lib = { label: 'Save to Library', to: { library: true, ...(o.session ? { session: o.session } : {}) } as VideoSaveTo, says: 'It is kept in your Library as a new video.' };
  const to = o.to;
  if (detached || !to) return { main: detached ? { ...lib, says: 'Where it came from is closed, so it is kept in your Library as a new video.' } : lib, copy: null, beside: lib.to };
  if ('file' in to) {
    const ext = /\.(webm|mov)$/i.exec(to.file)?.[1]?.toLowerCase() ?? 'mp4';
    return {
      main: { label: 'Save', to: { file: to.file, as: 'replace' }, says: `Save writes over ${nameOf(to.file)}; its old version goes to the Trash.`, fixed: ext === 'webm' ? 'WebM' : ext === 'mov' ? 'MOV' : 'MP4' },
      copy: o.copy === false ? null : { label: 'Save a copy', to: { file: to.file, as: 'copy' }, says: `A copy is saved beside it, “${stemOf(to.file)} (edited)”.` },
      beside: { file: to.file, as: 'copy' },
    };
  }
  if ('media' in to)
    return {
      main: { label: 'Save', to: { media: to.media, as: 'replace' }, says: 'Save puts it in the Library in place of the video it was.' },
      copy: o.copy === false ? null : { label: 'Save a copy', to: { media: to.media, as: 'copy' }, says: 'Save a copy keeps it in your Library as a new video.' },
      beside: { media: to.media, as: 'copy' },
    };
  return {
    main: { label: 'Save', to: { video: true }, says: `Save puts it back in ${o.from.label || 'the page'} in place of the video it was.` },
    copy: o.copy ? { label: 'Save a copy', to: lib.to, says: 'Save a copy keeps it in your Library as a new video.' } : null,
    beside: lib.to,
  };
}

/** Where a copy, a GIF or a frame went, in words. */
function wentTo(j: VideoEditJob, what: 'copy' | 'gif' | 'frame'): string {
  if (j.path) {
    const name = nameOf(j.path);
    return what === 'frame' ? tr(`The frame is saved beside it: ${name}`) : what === 'gif' ? tr(`The GIF is saved beside it: ${name}`) : tr(`A copy is saved beside it: ${name}`);
  }
  return what === 'frame' ? tr('The frame is in your Library') : what === 'gif' ? tr('The GIF is in your Library') : tr('A copy is in your Library');
}

export function VideoEditor(p: EditorProps) {
  const [facts, setFacts] = useState<VideoFacts | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setFacts(null);
    setFailed(null);
    videoFacts(p.o.src).then(
      (f) => live && setFacts(f),
      (e) => live && setFailed((e as Error).message),
    );
    return () => {
      live = false;
    };
  }, [p.o.src]);
  const bar = p.lead && <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-1.5 pt-[var(--safe-top)]">{p.lead}</div>;
  if (failed)
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        {bar}
        <Empty icon={<Clapperboard size={20} />} title="This video cannot be edited">
          <span translate="no">{failed}</span>
        </Empty>
      </div>
    );
  if (!facts)
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        {bar}
        <div className="flex flex-1 items-center justify-center text-fg-3">
          <Throbber size={28} />
        </div>
      </div>
    );
  if (!facts.ffmpeg || !facts.duration || !facts.width || !facts.height)
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        {bar}
        <Empty icon={<Clapperboard size={20} />} title="Video editing needs ffmpeg">
          <p>Set up the picture tools in Settings → Images, video and audio (they bring ffmpeg with them), or install ffmpeg on this computer.</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => go('/settings?s=images')}>
            Open Settings → Images, video and audio
          </Button>
        </Empty>
      </div>
    );
  return <Editing {...p} facts={facts as Required<Pick<VideoFacts, 'duration' | 'width' | 'height'>> & VideoFacts} />;
}

function Editing({ o, active, detached, setDirty, done, lead, facts }: EditorProps & { facts: Required<Pick<VideoFacts, 'duration' | 'width' | 'height'>> & VideoFacts }) {
  // A phone, or an editor squeezed narrow (the sidebar open on a small window): the panel under the picture, the tools
  // along the bottom, and the buttons without their words.
  const phone = useIsMobile();
  const root = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const m = () => setNarrow(el.clientWidth > 0 && el.clientWidth < 760);
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mobile = phone || narrow;
  const duration = facts.duration;
  const h = useHistory<Edit>({ recipe: {}, splits: [] });
  const e = h.now;
  const r = e.recipe;
  const [tool, setTool] = useState<Tool>('trim');
  const [picked, setPicked] = useState<number | null>(null);
  const [shape, setShape] = useState<VideoShape>('free');
  const [size, setSize] = useState<number | undefined>(undefined);
  const [kind, setKind] = useState<'mp4' | 'webm'>('mp4');
  const [saving, setSaving] = useState<{ what: string; job?: VideoEditJob; stopped?: boolean } | null>(null);
  const [cannotPlay, setCannotPlay] = useState(false);
  // The size the browser shows it at (a phone's video turned upright), else what ffmpeg read.
  const [vs, setVs] = useState({ w: facts.width, h: facts.height });
  const clock = useMemo(() => makeClock(), []);
  const video = useRef<HTMLVideoElement>(null);
  const url = useMemo(() => playUrl(o.src), [o.src]);
  const parts = useMemo(() => keptParts(r, duration), [r, duration]);
  const length = editedLength(r, duration);
  const speed = r.speed ?? 1;
  const out = editedSize(r, vs.w, vs.h);
  const plans = savePlans(o, detached);
  const busy = !!saving;

  const changed = Object.keys(r).length > 0 || e.stillAt !== undefined;
  useEffect(() => {
    setDirty(changed);
  }, [changed, setDirty]);

  const change: Change = Object.assign((f: (x: VideoRecipe) => VideoRecipe) => h.set((x) => ({ ...x, recipe: f(x.recipe) })), { begin: h.begin, end: h.end });

  const player = usePlayer({ video, clock, parts, recipe: r, length, musicUrl: r.music ? playUrl(r.music.src) : null });
  // A tab not showing does not play.
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player.pause]);

  // The words, drawn as they will be on the edited video.
  const shown: ShownText[] = useMemo(
    () =>
      (r.texts ?? []).map((t) => {
        const c = drawText(t, out.w, out.h);
        return { url: c.toDataURL('image/png'), w: c.width, h: c.height, x: t.x, y: t.y, from: t.from, to: t.to };
      }),
    [r.texts, out.w, out.h],
  );

  // ---- the timeline's actions ----------------------------------------------------------------------------------

  const split = () => {
    const t = clock.get();
    const [a, b] = r.trim ?? [0, duration];
    const near = (x: number) => Math.abs(x - t) < MIN_PART * 2;
    if (t <= a || t >= b || !isKept(t, parts) || e.splits.some(near) || (r.cuts ?? []).some(([s, x]) => near(s) || near(x))) return;
    h.set((x) => ({ ...x, splits: [...x.splits, t].sort((m, n) => m - n) }));
  };
  const deletePart = () => {
    const t = clock.get();
    if (!isKept(t, parts)) return;
    const [lo, hi] = partAt(t, r, e.splits, duration);
    const next = keptParts({ ...r, cuts: [...(r.cuts ?? []), [lo, hi]] }, duration);
    if (!next.length) return toast(tr('That is all of it: split it first, then delete the part you do not want'), 'info');
    h.set((x) => ({ ...x, recipe: { ...x.recipe, cuts: mergeCuts([...(x.recipe.cuts ?? []), [lo, hi]]) } }));
    player.seek(Math.min(hi, next[next.length - 1][1]));
  };
  const putBack = () => {
    const t = clock.get();
    h.set((x) => {
      const cuts = (x.recipe.cuts ?? []).filter(([s, c]) => !(t >= s && t < c));
      return { ...x, recipe: strip({ ...x.recipe, cuts: cuts.length ? cuts : undefined }) };
    });
  };

  // ---- crop, turn and mirror ------------------------------------------------------------------------------------

  const up = turnedSize(vs.w, vs.h, r.rotate);
  const onShape = (s: VideoShape) => {
    setShape(s);
    if (s === 'free') return;
    const c = cropToShape(s, vs.w, vs.h, r.rotate);
    if (c) change((x) => strip({ ...x, crop: c.w >= up.w && c.h >= up.h ? undefined : c }));
  };
  /** A turn or a mirror keeps the crop on the same part of the picture. */
  const reTurn = (next: Pick<VideoRecipe, 'rotate' | 'flipH' | 'flipV'>) =>
    change((x) => {
      const crop = x.crop ? shownRect(originalRect(x.crop, vs.w, vs.h, x), vs.w, vs.h, next) : undefined;
      return strip({ ...x, rotate: next.rotate || undefined, flipH: next.flipH || undefined, flipV: next.flipV || undefined, crop });
    });
  const onTurn = (by: 90 | -90) => reTurn({ rotate: (((((r.rotate ?? 0) + by) % 360) + 360) % 360) as VideoTurn, flipH: r.flipH, flipV: r.flipV });
  const onCrop = useCallback(
    (c: VideoCrop, phase: 'begin' | 'move' | 'end') => {
      if (phase === 'begin') return h.begin();
      if (phase === 'end') return h.end();
      h.set((x) => ({ ...x, recipe: strip({ ...x.recipe, crop: c.x <= 0 && c.y <= 0 && c.w >= up.w && c.h >= up.h ? undefined : c }) }));
    },
    [h.begin, h.end, h.set, up.w, up.h],
  );

  // ---- words ----------------------------------------------------------------------------------------------------

  const addText = () => {
    const t = newText(clock.get(), duration);
    h.set((x) => ({ ...x, recipe: { ...x.recipe, texts: [...(x.recipe.texts ?? []), t] } }));
    setPicked((r.texts ?? []).length);
    setTool('text');
  };
  const onMoveText = (i: number, x: number, y: number, phase: 'begin' | 'move' | 'end') => {
    if (phase === 'begin') return h.begin();
    if (phase === 'end') return h.end();
    h.set((s) => ({ ...s, recipe: { ...s.recipe, texts: (s.recipe.texts ?? []).map((t, j) => (j === i ? { ...t, x, y } : t)) } }));
  };
  const onTimeText = (i: number, from: number, to: number, phase: 'begin' | 'move' | 'end') => {
    if (phase === 'begin') {
      h.begin();
      setPicked(i);
      return;
    }
    if (phase === 'end') return h.end();
    h.set((s) => ({ ...s, recipe: { ...s.recipe, texts: (s.recipe.texts ?? []).map((t, j) => (j === i ? { ...t, from, to } : t)) } }));
    player.seek(from);
  };
  const pickText = (i: number | null) => {
    setPicked(i);
    if (i !== null) setTool('text');
  };

  // ---- saving ---------------------------------------------------------------------------------------------------

  const stopRef = useRef<string | null>(null);
  const run = async (what: 'main' | 'copy' | 'gif' | 'frame' | 'still') => {
    if (busy) return;
    player.pause();
    let recipe: VideoRecipe;
    try {
      recipe = normalizeVideoRecipe(r, { duration, width: vs.w, height: vs.h });
    } catch (err) {
      return toastError(err);
    }
    const at = clock.get();
    const o2 = editedSize(recipe, vs.w, vs.h);
    const drawn = (recipe.texts ?? []).map((t) => drawText(t, o2.w, o2.h).toDataURL('image/png'));
    const plain = Object.keys(recipe).length === 0;
    let ask: VideoEditAsk;
    if (what === 'frame') ask = { src: o.src, recipe, drawn, format: 'jpg', frame: at, to: plans.beside };
    else if (what === 'gif') ask = { src: o.src, recipe, drawn, format: 'gif', ...(size ? { size } : {}), to: plans.beside };
    else if (what === 'main' && 'video' in plans.main.to && plain && e.stillAt !== undefined) ask = { src: o.src, recipe, drawn, format: 'jpg', frame: e.stillAt, to: { asset: true } };
    else {
      const to = what === 'copy' && plans.copy ? plans.copy.to : plans.main.to;
      ask = { src: o.src, recipe, drawn, format: plans.main.fixed && what === 'main' ? undefined : kind, ...(size ? { size } : {}), ...(e.stillAt !== undefined && 'video' in to ? { still: e.stillAt } : {}), to };
    }
    const label = what === 'frame' ? 'Taking the frame' : what === 'gif' ? 'Making the GIF' : 'Making the video';
    setSaving({ what: label });
    try {
      const j = await makeEdit(ask, {
        onJob: (job) => {
          stopRef.current = job.job;
          setSaving((s) => (s ? { ...s, job } : s));
        },
      });
      if (j.status === 'stopped') return toast(tr('Stopped: nothing was saved'), 'info');
      if (j.status !== 'done') return toastError(new Error(j.error ?? 'The video could not be made'));
      if (what === 'frame') return toast(wentTo(j, 'frame'), 'ok');
      if (what === 'gif') return toast(wentTo(j, 'gif'), 'ok');
      if (what === 'copy') return toast(wentTo(j, 'copy'), 'ok');
      // Only the still changed: the slide keeps its video, with this frame as its still.
      if (ask.format === 'jpg') return await done({ kind: 'video', src: o.src, poster: j.src, w: vs.w, h: vs.h });
      const mime = j.format === 'webm' ? 'video/webm' : 'video/mp4';
      await done({ kind: 'video', src: j.src, poster: j.poster, media: j.media, path: j.path, w: j.w, h: j.h, mime, replaced: 'media' in ask.to || ('file' in ask.to && ask.to.as === 'replace') });
    } catch (err) {
      toastError(err);
    } finally {
      stopRef.current = null;
      setSaving(null);
    }
  };
  const stop = () => {
    if (stopRef.current) void stopEdit(stopRef.current);
    setSaving((s) => (s ? { ...s, stopped: true } : s));
  };

  // ---- keys -----------------------------------------------------------------------------------------------------

  const onKeyDown = (ev: React.KeyboardEvent) => {
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (mod && !ev.shiftKey && !ev.altKey && (k === 'k' || k === 'b' || k === '`')) return;
    ev.stopPropagation();
    const typing = (ev.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]');
    if (mod && k === 'z') {
      if (typing) return;
      ev.preventDefault();
      return ev.shiftKey ? h.redo() : h.undo();
    }
    if (mod && k === 'y') {
      if (typing) return;
      ev.preventDefault();
      return h.redo();
    }
    if (typing || mod || ev.altKey || busy) return;
    const frame = 1 / (facts.fps ?? 30);
    if (ev.key === ' ' && !(ev.target as HTMLElement).closest('button')) {
      ev.preventDefault();
      player.toggle();
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      player.pause();
      player.seek(Math.min(duration, Math.max(0, clock.get() + (ev.key === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 1 : frame))));
    } else if (k === 's') {
      ev.preventDefault();
      split();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      if (tool === 'text' && picked !== null) {
        h.set((x) => ({ ...x, recipe: strip({ ...x.recipe, texts: (x.recipe.texts ?? []).filter((_, i) => i !== picked) }) }));
        setPicked(null);
      } else deletePart();
    } else if (ev.key === 'Home') player.seek(parts[0]?.[0] ?? 0);
    else if (ev.key === 'End') player.seek(parts[parts.length - 1]?.[1] ?? duration);
  };
  useEffect(() => {
    if (active) root.current?.focus({ preventScroll: true });
  }, [active]);

  const panel =
    tool === 'trim' ? (
      <TrimPanel r={r} change={change} duration={duration} clock={clock} />
    ) : tool === 'crop' ? (
      <CropPanel
        r={r}
        w={vs.w}
        h={vs.h}
        shape={shape}
        onShape={onShape}
        onTurn={onTurn}
        onMirror={(k) => reTurn({ rotate: r.rotate, flipH: k === 'flipH' ? !r.flipH : r.flipH, flipV: k === 'flipV' ? !r.flipV : r.flipV })}
        onReset={() => (setShape('free'), change((x) => strip({ ...x, crop: undefined, rotate: undefined, flipH: undefined, flipV: undefined })))}
      />
    ) : tool === 'text' ? (
      <TextPanel r={r} change={change} picked={picked} onPick={setPicked} onAdd={addText} clock={clock} duration={duration} />
    ) : tool === 'adjust' ? (
      <AdjustPanel r={r} change={change} length={length} />
    ) : (
      <SoundPanel r={r} change={change} audio={!!facts.audio} clock={clock} length={length} parts={parts} speed={speed} />
    );

  const undoRedo = (
    <>
      <IconButton label="Undo" disabled={!h.canUndo || busy} onClick={h.undo}>
        <Undo2 size={17} />
      </IconButton>
      <IconButton label="Redo" disabled={!h.canRedo || busy} onClick={h.redo}>
        <Redo2 size={17} />
      </IconButton>
    </>
  );
  const fromSlide = !!o.to && 'asset' in o.to && !detached;
  const more = (
    <MoreMenu
      busy={busy}
      copy={mobile && plans.copy ? { label: plans.copy.label, run: () => void run('copy') } : null}
      onFrame={() => void run('frame')}
      onStill={fromSlide ? () => h.set((x) => ({ ...x, stillAt: clock.get() })) : undefined}
      onGif={() => void run('gif')}
      onReset={changed ? () => (setShape('free'), setPicked(null), h.set({ recipe: {}, splits: [] })) : undefined}
    />
  );

  return (
    <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col bg-bg outline-none">
      <header className="shrink-0 border-b border-line bg-bg pt-[var(--safe-top)]">
        <div className="flex h-12 items-center gap-1 px-1.5 sm:px-3">
          {lead}
          {mobile ? (
            <span translate="no" className="min-w-0 flex-1 truncate px-1 text-[14px] font-semibold">
              {o.title}
            </span>
          ) : (
            <>
              <div role="tablist" aria-label="Tools" className="flex items-center gap-0.5">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tool === t.id}
                    disabled={busy && tool !== t.id}
                    onClick={() => setTool(t.id)}
                    className={cx('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors disabled:opacity-40', tool === t.id ? 'bg-bg-2 text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="min-w-0 flex-1" />
            </>
          )}
          {undoRedo}
          {more}
          {!mobile && plans.copy && (
            <Button size="sm" variant="secondary" className="ml-1" disabled={busy} onClick={() => void run('copy')}>
              {plans.copy.label}
            </Button>
          )}
          <SaveButton label={plans.main.label} disabled={busy} onSave={() => void run('main')}>
            <SaveOptions plans={plans} kind={kind} onKind={setKind} size={size} onSize={setSize} out={out} />
          </SaveButton>
        </div>
      </header>
      {saving && <Making saving={saving} onStop={stop} />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Stage
              url={url}
              videoRef={video}
              w={vs.w}
              h={vs.h}
              recipe={r}
              parts={parts}
              length={length}
              clock={clock}
              cropping={tool === 'crop'}
              shape={shape}
              onCrop={onCrop}
              texts={shown}
              picked={picked}
              writing={tool === 'text'}
              onPickText={pickText}
              onMoveText={onMoveText}
              onVideoError={() => setCannotPlay(true)}
              onVideoReady={(w, hh) => w > 0 && hh > 0 && (w !== vs.w || hh !== vs.h) && setVs({ w, h: hh })}
            />
            {cannotPlay && (
              <div className="absolute inset-x-3 top-3 rounded-xl border border-warn/40 bg-elevated px-3 py-2 text-[12.5px] leading-snug text-fg-2 shadow-sm">
                This browser cannot play this video, so it cannot show you the edit. It can still be made: save it, or make an MP4 copy it plays (Save a copy).
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-line bg-bg px-3 pt-1.5 pb-2.5">
            <Transport clock={clock} player={player} parts={parts} speed={speed} length={length} r={r} duration={duration} onSplit={split} onDelete={deletePart} onPutBack={putBack} onFrame={() => void run('frame')} busy={busy} mobile={mobile} />
            <Timeline
              duration={duration}
              recipe={r}
              parts={parts}
              splits={e.splits}
              clock={clock}
              strip={(n, hh) => stripUrl(o.src, n, hh)}
              aspect={vs.w / vs.h}
              onSeek={(t, phase) => {
                if (phase === 'begin') player.pause();
                player.seek(t);
              }}
              onTrim={(t, phase) => {
                if (phase === 'begin') {
                  player.pause();
                  return h.begin();
                }
                if (phase === 'end') return h.end();
                const whole = t[0] <= 0.001 && t[1] >= duration - 0.001;
                h.set((x) => ({ ...x, recipe: strip({ ...x.recipe, trim: whole ? undefined : t }) }));
                player.seek(t[0] !== (r.trim?.[0] ?? 0) ? t[0] : t[1]);
              }}
              picked={tool === 'text' ? picked : null}
              onPickText={pickText}
              onTimeText={onTimeText}
              onMusicStart={(start, phase) => {
                if (phase === 'begin') return h.begin();
                if (phase === 'end') return h.end();
                h.set((x) => (x.recipe.music ? { ...x, recipe: { ...x.recipe, music: { ...x.recipe.music, start: start > 0.01 ? Math.round(start * 1000) / 1000 : undefined } } } : x));
              }}
              stillAt={e.stillAt}
              small={mobile}
            />
          </div>
        </div>
        {!mobile && <aside className="w-[312px] shrink-0 overflow-y-auto border-l border-line bg-panel p-4">{panel}</aside>}
      </div>
      {mobile && (
        <>
          <div className="max-h-[34dvh] min-h-[6.5rem] shrink-0 overflow-y-auto border-t border-line bg-panel px-3 py-3">{panel}</div>
          <nav role="tablist" aria-label="Tools" className="flex shrink-0 border-t border-line bg-bg pb-[var(--safe-bottom)]">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tool === t.id}
                disabled={busy && tool !== t.id}
                onClick={() => setTool(t.id)}
                className={cx('flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium disabled:opacity-40', tool === t.id ? 'text-accent' : 'text-fg-3')}
              >
                {t.icon}
                <span className="max-w-full truncate">{t.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

const strip = (r: VideoRecipe): VideoRecipe => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as VideoRecipe;

/** Cuts in order, those that touch or overlap made one. */
function mergeCuts(cuts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of [...cuts].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && c[0] <= last[1] + 0.001) last[1] = Math.max(last[1], c[1]);
    else out.push([c[0], c[1]]);
  }
  return out;
}

/** Under the picture: play, the time in the edited video, Split, Delete (or Put back), and taking the frame. */
function Transport({
  clock,
  player,
  parts,
  speed,
  length,
  r,
  duration,
  onSplit,
  onDelete,
  onPutBack,
  onFrame,
  busy,
  mobile,
}: {
  clock: Clock;
  player: ReturnType<typeof usePlayer>;
  parts: [number, number][];
  speed: number;
  length: number;
  r: VideoRecipe;
  duration: number;
  onSplit: () => void;
  onDelete: () => void;
  onPutBack: () => void;
  onFrame: () => void;
  busy: boolean;
  mobile: boolean;
}) {
  const t = useClock(clock);
  const [a, b] = r.trim ?? [0, duration];
  const cut = t >= a && t < b && !isKept(t, parts);
  return (
    <div className="mb-1.5 flex h-9 items-center gap-1">
      <IconButton label={player.playing ? 'Pause' : 'Play'} onClick={player.toggle} className="text-fg">
        {player.playing ? <Pause size={18} /> : <Play size={18} />}
      </IconButton>
      <span className="tnum min-w-0 px-1 text-[12.5px] text-fg-2">
        <span className="text-fg">{videoClock(toEdited(t, parts, speed))}</span>
        <span className="text-fg-3">{` / ${videoClock(length)}`}</span>
      </span>
      <span className="min-w-2 flex-1" />
      <Button size="sm" variant="ghost" icon={<Scissors size={14} />} disabled={busy || cut} onClick={onSplit} title="Split at the playhead (S)" aria-label="Split at the playhead">
        {!mobile && 'Split'}
      </Button>
      {cut ? (
        <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={busy} onClick={onPutBack} title="Put this part back" aria-label="Put this part back">
          {!mobile && 'Put it back'}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={busy} onClick={onDelete} title="Delete this part (Delete)" aria-label="Delete this part">
          {!mobile && 'Delete this part'}
        </Button>
      )}
      <IconButton label="Take this frame as a picture" disabled={busy} onClick={onFrame}>
        <Camera size={16} />
      </IconButton>
    </div>
  );
}

/** How far the server is: a bar under the header, with a way to stop. */
function Making({ saving, onStop }: { saving: { what: string; job?: VideoEditJob; stopped?: boolean }; onStop: () => void }) {
  const j = saving.job;
  const pct = j?.status === 'running' && j.progress !== undefined ? Math.round(j.progress * 100) : null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-bg-1 px-3 text-[12.5px] text-fg-2">
      <Throbber size={13} />
      <span className="min-w-0 truncate">{saving.stopped ? 'Stopping' : j?.status === 'queued' ? 'Waiting for the edits before it' : `${saving.what}${pct !== null ? ` · ${pct}%` : ''}`}</span>
      <div className="h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-bg-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <Button size="sm" variant="ghost" icon={<X size={13} />} disabled={saving.stopped} onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}

function MoreMenu({ busy, copy, onFrame, onStill, onGif, onReset }: { busy: boolean; copy: { label: string; run: () => void } | null; onFrame: () => void; onStill?: () => void; onGif: () => void; onReset?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const pick = (f: () => void) => () => (setOpen(false), f());
  return (
    <>
      <IconButton ref={ref} label="More" active={open} onClick={() => setOpen((x) => !x)}>
        <Ellipsis size={17} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={270} title="More">
        {copy && (
          <MenuItem icon={<Film size={14} />} disabled={busy} onClick={pick(copy.run)}>
            {copy.label}
          </MenuItem>
        )}
        <MenuItem icon={<Camera size={14} />} disabled={busy} onClick={pick(onFrame)}>
          Take this frame as a picture
        </MenuItem>
        {onStill && (
          <MenuItem icon={<ImageIcon size={14} />} disabled={busy} onClick={pick(onStill)}>
            Use this frame as its still
          </MenuItem>
        )}
        <MenuItem icon={<Clapperboard size={14} />} disabled={busy} onClick={pick(onGif)}>
          Save as a GIF
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<RotateCcw size={14} />} disabled={!onReset || busy} onClick={onReset ? pick(onReset) : undefined}>
          Back to the original
        </MenuItem>
      </Popover>
    </>
  );
}

/** Save, with how it is saved behind the arrow beside it. */
function SaveButton({ label, disabled, onSave, children }: { label: string; disabled: boolean; onSave: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div className="ml-1 flex shrink-0">
      <Button size="sm" variant="primary" className="rounded-r-none pr-2.5" disabled={disabled} onClick={onSave}>
        {label}
      </Button>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((x) => !x)}
        aria-label="How it is saved"
        title="How it is saved"
        className="flex h-8 items-center rounded-r-[10px] border-l border-black/15 bg-accent px-1.5 text-accent-fg transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-45"
      >
        <ChevronDown size={14} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={320} title="How it is saved" className="p-3">
        {children}
      </Popover>
    </div>
  );
}

const SIZES = [1080, 720, 480];

function SaveOptions({
  plans,
  kind,
  onKind,
  size,
  onSize,
  out,
}: {
  plans: ReturnType<typeof savePlans>;
  kind: 'mp4' | 'webm';
  onKind: (k: 'mp4' | 'webm') => void;
  size?: number;
  onSize: (s: number | undefined) => void;
  out: { w: number; h: number };
}) {
  const short = Math.min(out.w, out.h);
  const sizes = SIZES.filter((s) => s < short);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-[12px] font-medium text-fg-3">Size</div>
        <Segmented<string>
          size="sm"
          value={size && size < short ? String(size) : 'as'}
          onChange={(v) => onSize(v === 'as' ? undefined : Number(v))}
          options={[{ value: 'as', label: `${out.w} × ${out.h}` }, ...sizes.map((s) => ({ value: String(s), label: `${s}p` }))]}
        />
      </div>
      {(!plans.main.fixed || plans.copy) && (
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-fg-3">{plans.main.fixed ? 'Kind of file, for a copy' : 'Kind of file'}</div>
          <Segmented<'mp4' | 'webm'>
            size="sm"
            value={kind}
            onChange={onKind}
            options={[
              { value: 'mp4', label: 'MP4' },
              { value: 'webm', label: 'WebM' },
            ]}
          />
        </div>
      )}
      {plans.main.fixed && <p className="text-[12.5px] leading-snug text-fg-2">{`Saved over it, it keeps its kind (${plans.main.fixed}).`}</p>}
      <div className="space-y-1 border-t border-line pt-2.5 text-[12px] leading-snug text-fg-3">
        {[plans.main.says, plans.copy?.says].filter(Boolean).map((t) => (
          <p key={t}>{t}</p>
        ))}
        <p>MP4 plays everywhere; WebM is smaller, for the web.</p>
      </div>
    </div>
  );
}
