// The video editor, in a tab of its own (host.tsx), laid out as a professional editor's: a menu bar (File, Edit, Clip,
// Timeline, View) with each command's keys, workspaces as Resolve has them (Edit, Colour, Audio, Export), Undo, Redo,
// Save a copy and Save at the right, and a status line. Edit: the media panel (videos, pictures and sounds to put on the
// timeline), the viewer with its transport, the inspector of what is picked, and the multi-track timeline across the
// bottom (video/Timeline.tsx). Colour, Audio and Export are pages of their own (video/ColourPage.tsx, AudioPage.tsx,
// ExportPage.tsx). The panels' sizes are kept between visits. Everything shows in the browser as it will be made (the
// player, video/engine.ts; WebGL, video/gl.ts); Save has the server make it exactly (ffmpeg, on the graphics card when
// there is one: server/mediaedit/video.ts), with its progress and a way to stop, then puts it back where it came from
// (a slide's video and its still, a Library item, a file), or keeps a copy, a GIF or one frame as a picture. Undo and
// redo for every step. On a phone: the viewer, the main track, and the rest in sheets from the bottom.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AudioLines, Clapperboard, Download, Film, Palette, Plus, Redo2, Scissors, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { viaLink } from '../../lib/machine';
import {
  captionsSrt,
  captionsVtt,
  parseCaptions,
  CAPTION_STYLES,
  clipSpans,
  isPlainRecipe,
  isStill,
  normalizeVideoRecipe,
  outputSize,
  timecode,
  videoClock,
  videoId,
  VIDEO_TRANSITIONS,
  type VideoEditAsk,
  type VideoEditJob,
  type VideoFacts,
  type VideoFactsOf,
  type VideoRecipe,
  type VideoSaveTo,
  type VideoText,
  type VideoTrackId,
  MAX_TEXTS,
  SOUND_CHANNELS,
} from '@shared/mediaedit-video';
import { Button, cx, Empty, IconButton, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import type { EditorProps, OpenEditor } from './host';
import { makeCaptions, makeEdit, playUrl, stopEdit, videoFacts } from './video/api';
import { AudioPage } from './video/AudioPage';
import { makeClock } from './video/clock';
import { ColourPage } from './video/ColourPage';
import { Engine } from './video/engine';
import { ExportPage, type ExportSettings, type Making } from './video/ExportPage';
import { useHistory } from './video/history';
import { Inspector } from './video/Inspector';
import { importFile, kindOfFile, MediaPanel } from './video/MediaPanel';
import {
  canDetach,
  clipAtTime,
  clipFor,
  copyPicks,
  cutTimes,
  deletePicks,
  detachSound,
  duplicatePicks,
  freezeFrame,
  insertClip,
  linkSound,
  neighbourCut,
  pasteAttributes,
  pasteBoard,
  pickedThing,
  setClip,
  setOverlay,
  silenceClips,
  silencePart,
  splitClip,
  splitPicks,
  tidy,
  togglePick,
  trackOf,
  trimToPlayhead,
  withIds,
  type Board,
  type Edit,
  type Pick1,
  type Picked,
  type PoolItem,
  type SoundRange,
} from './video/model';
import { ContextMenu, isMenuKey, MenuBar, runMenuKeys, shortcutGroups, ShortcutsDialog, type ContextMenuAt, type MenuDef, type MenuEntry, type ShortcutGroup } from './shell';
import { COPY_DRAG_KEY, NO_SNAP_KEY } from '../pages/common/keys';
import { StatusBar, Splitter, StepsContext, useRemembered, WorkspaceTabs } from './video/shell';
import { soundEditor } from './video/soundHook';
import { drawText } from './video/text';
import { Timeline, type Change, type TimelineTool, type TrackUi } from './video/Timeline';
import { Transport, Viewer } from './video/Viewer';

type Workspace = 'edit' | 'colour' | 'audio' | 'export';

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
      main: { label: 'Save', to: { media: to.media, as: 'replace' }, says: 'Save puts it in the Library in place of the video it was.', fixed: o.fileKind ?? 'MP4' },
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
  return <Studio {...p} facts={facts as Required<Pick<VideoFacts, 'duration' | 'width' | 'height'>> & VideoFacts} />;
}

const WORKSPACES: { id: Workspace; label: string; icon: ReactNode; keys: string }[] = [
  { id: 'edit', label: 'Edit', icon: <Scissors size={14} />, keys: 'Alt+1' },
  { id: 'colour', label: 'Colour', icon: <Palette size={14} />, keys: 'Alt+2' },
  { id: 'audio', label: 'Audio', icon: <AudioLines size={14} />, keys: 'Alt+3' },
  { id: 'export', label: 'Export', icon: <Film size={14} />, keys: 'Alt+4' },
];

const FIRST_SETTINGS: ExportSettings = { kind: 'mp4', codec: 'h264', encoder: 'auto', quality: 'standard', range: 'all' };

function Studio({ o, active, detached, setDirty, done, close, lead, facts }: EditorProps & { facts: Required<Pick<VideoFacts, 'duration' | 'width' | 'height'>> & VideoFacts }) {
  const phone = useIsMobile();
  const root = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const m = () => setNarrow(el.clientWidth > 0 && el.clientWidth < 860);
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mobile = phone || narrow;

  // ---- the edit, and what it is made of -------------------------------------------------------------------------------
  const mainFacts = useMemo(() => ({ duration: facts.duration, width: facts.width, height: facts.height, audio: !!facts.audio, ...(facts.fps ? { fps: facts.fps } : {}) }), [facts]);
  const h = useHistory<Edit>({ recipe: withIds({ clips: [{ name: o.title }] }), markers: [] });
  const e = h.now;
  const r = e.recipe;
  const [pool, setPool] = useState<PoolItem[]>(() => [{ src: o.src, kind: 'video', name: o.title, facts: mainFacts, main: true }]);
  const factsOf: VideoFactsOf = useCallback((src) => (src === undefined || src === o.src ? mainFacts : pool.find((x) => x.src === src)?.facts), [pool, mainFacts, o.src]);
  const clock = useMemo(() => makeClock(), []);
  const engine = useMemo(() => new Engine(clock, (src) => playUrl(src ?? o.src)), [clock, o.src]);
  useEffect(() => () => engine.dispose(), [engine]);
  useLayoutEffect(() => engine.update(r, factsOf), [engine, r, factsOf]);
  const playing = useSyncExternalStore(engine.subscribe, () => engine.playing);
  useEffect(() => {
    if (!active) engine.pause();
  }, [active, engine]);
  const { spans, length } = useMemo(() => clipSpans(r.clips ?? [], factsOf), [r, factsOf]);

  const change: Change = useMemo(() => Object.assign((f: (x: VideoRecipe) => VideoRecipe) => h.set((x) => ({ ...x, recipe: tidy(f(x.recipe)) })), { begin: h.begin, end: h.end }), [h.set, h.begin, h.end]);
  const changed = !isPlainRecipe(r) || e.stillAt !== undefined;
  useEffect(() => setDirty(changed), [changed, setDirty]);

  // ---- what the editor shows ------------------------------------------------------------------------------------------
  const [workspace, setWorkspace] = useState<Workspace>('edit');
  // What is picked: the last one is what the inspector shows. Shift or Ctrl and a click adds one, a box dragged across empty
  // space picks what it crosses, and the commands (copy, delete, split, move…) work on all of them.
  const [picks, setPicks] = useState<Pick1[]>([]);
  const picked: Picked = picks.length ? picks[picks.length - 1] : null;
  const setPicked = useCallback((p: Picked) => setPicks(p ? [p] : []), []);
  // What Copy and Cut keep, for Paste and Paste attributes.
  const [board, setBoard] = useState<Board | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const [tool, setTool] = useState<TimelineTool>('select');
  const [snapOn, setSnapOn] = useRemembered('snap', true);
  const [pps, setPps] = useState(40);
  const [trackUi, setTrackUi] = useRemembered<Partial<Record<VideoTrackId, TrackUi>>>('tracks', {});
  const [safe, setSafe] = useRemembered('safe', false);
  const [grid, setGrid] = useRemembered('grid', false);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [inOut, setInOut] = useState<[number | null, number | null]>([null, null]);
  const [cropping, setCropping] = useState<{ id: string; shape: string } | null>(null);
  const [split, setSplit] = useState<number | null>(null);
  const [settings, setSettings] = useRemembered<ExportSettings>('export', FIRST_SETTINGS);
  const [making, setMaking] = useState<Making | null>(null);
  const [last, setLast] = useState<VideoEditJob | null>(null);
  const [captionsBusy, setCaptionsBusy] = useState<string | null>(null);
  const [range, setRange] = useState<SoundRange>(null);
  const [menu, setMenu] = useState<{ at: ContextMenuAt; items: MenuEntry[] } | null>(null);
  const [sending, setSending] = useState<{ name: string; share: number }[]>([]);
  const captionFile = useRef<HTMLInputElement>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const [sheet, setSheet] = useState<'inspector' | 'media' | 'colour' | 'audio' | 'export' | null>(null);
  const [mediaW, setMediaW] = useRemembered('media', 260);
  const [inspW, setInspW] = useRemembered('inspector', 300);
  const [timeH, setTimeH] = useRemembered('timeline', 300);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busy = !!making;
  const out = outputSize(r, factsOf);
  const made = outputSize(r, factsOf, { size: settings.size, exact: true });
  const firstVideo = (r.clips ?? []).find((c) => !isStill(c) && !factsOf(c.src)?.picture);
  const ownFps = firstVideo ? factsOf(firstVideo.src)?.fps : undefined;
  const fps = settings.fps ?? (ownFps ? Math.min(60, ownFps) : 30);
  const plans = savePlans(o, detached);
  const main = o.src;
  const now = () => clock.get();

  useEffect(() => {
    if (range && !(picked && (picked.kind === 'audio' || picked.kind === 'clipsound') && picked.id === range.id)) setRange(null);
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  // A picked thing that is gone is no longer picked; nothing is cropped once its clip is gone.
  useEffect(() => {
    setPicks((x) => {
      const kept = x.filter((q) => pickedThing(r, q));
      return kept.length === x.length ? x : kept;
    });
    if (cropping && !r.clips?.some((c) => c.id === cropping.id)) setCropping(null);
  }, [r, cropping]);

  const addPool = (it: PoolItem) => setPool((x) => (x.some((y) => y.src === it.src) ? x : [...x, it]));
  const use = (it: PoolItem, row?: VideoTrackId, t?: number, index?: number) => {
    addPool(it);
    const at = t ?? clock.get();
    if (it.kind === 'sound' || row === 'a2' || row === 'a3') {
      if (it.kind !== 'sound' && !it.facts.audio) return toast(tr('That has no sound'), 'info');
      const id = videoId();
      change((x) => ({ ...x, audio: [...(x.audio ?? []), { id, src: it.src, name: it.name, track: row === 'a3' ? 'voice' : 'music', start: Math.round(Math.min(at, Math.max(0, length - 0.2)) * 1000) / 1000 }] }));
      return setPicked({ kind: 'audio', id });
    }
    if (row === 'v2' || row === 'v3') {
      const id = videoId();
      change((x) => ({ ...x, overlays: [...(x.overlays ?? []), { id, src: it.src, name: it.name, ...(it.kind === 'picture' ? { picture: true, length: Math.max(0.5, Math.min(5, length - at)) } : {}), track: row === 'v3' ? 3 : 2, start: Math.round(Math.min(at, Math.max(0, length - 0.5)) * 1000) / 1000, x: 0.8, y: 0.2, w: 0.3 }] }));
      return setPicked({ kind: 'overlay', id });
    }
    const clip = clipFor(it);
    change((x) => insertClip(x, clip, index));
    setPicked({ kind: 'clip', id: clip.id! });
  };

  // ---- the commands ---------------------------------------------------------------------------------------------------
  /** Whether a track is locked (its header's lock): every command leaves what is on it as it is. */
  const locked = (t: VideoTrackId) => !!trackUi[t]?.locked;
  /** What is picked, without what is on a locked track. */
  const unlocked = (ps: Pick1[] = picks) => ps.filter((q) => !locked(trackOf(r, q)));
  const lockedNote = () => toast(tr('That track is locked: unlock it in its header first'), 'info');
  /** Cuts what is picked at the playhead (the ones it falls inside); with nothing picked, the clip under the playhead. */
  const splitHere = (ps: Pick1[] = picks) => {
    const t = clock.get();
    if (ps.length) {
      const live = unlocked(ps);
      if (!live.length) return lockedNote();
      if (!splitPicks(r, factsOf, live, t).done) return toast(tr('The playhead is not on what is picked: move it onto it first'), 'info');
      return change((x) => splitPicks(x, factsOf, live, t).recipe);
    }
    if (locked('v1')) return lockedNote();
    const at = clipAtTime(r, factsOf, t, true);
    if (at) change((x) => splitClip(x, factsOf, at.clip.id!, t));
  };
  /** What is picked taken out in one step (not what is on a locked track); a part of a sound picked is silenced instead. */
  const remove = (ripple: boolean, ps: Pick1[] = picks) => {
    if (range) {
      if (locked(range.kind === 'clip' ? 'a1' : trackOf(r, { kind: 'audio', id: range.id }))) return lockedNote();
      change((x) => silencePart(x, factsOf, range.kind, range.id, range.from, range.to));
      return setRange(null);
    }
    if (!ps.length) return;
    const live = unlocked(ps);
    if (!live.length) return lockedNote();
    if (!deletePicks(r, factsOf, live, { ripple }).done) return toast(tr(live.every((q) => q.kind === 'clip') ? 'That is the only clip: add another first, or split it and delete a part' : 'There is nothing there to delete'), 'info');
    change((x) => deletePicks(x, factsOf, live, { ripple }).recipe);
    // A clip's sound only silenced stays picked, as its clip is; what is on a locked track stays too.
    setPicks(ps.filter((q) => q.kind === 'clipsound' || !live.some((l) => l.kind === q.kind && l.id === q.id)));
  };
  const copyPicked = (ps: Pick1[] = picks) => {
    const b = copyPicks(r, ps);
    if (!b) return toast(tr('Pick something on the timeline to copy'), 'info');
    setBoard(b);
  };
  const cutPicked = (ps: Pick1[] = picks) => {
    const live = unlocked(ps);
    if (!ps.length) return toast(tr('Pick something on the timeline to cut'), 'info');
    if (!live.length) return lockedNote();
    const b = copyPicks(r, live);
    if (!b) return;
    if (!deletePicks(r, factsOf, live).done) return toast(tr('That is the only clip: add another first, or split it and delete a part'), 'info');
    setBoard(b);
    change((x) => deletePicks(x, factsOf, live).recipe);
    setPicks(ps.filter((q) => !live.some((l) => l.kind === q.kind && l.id === q.id)));
  };
  /** The copied things put at the playhead: clips at the cut nearest it, the rest from it, on the picked part's track or the track they came from. */
  const pasteHere = (ps: Pick1[] = picks) => {
    if (!board) return toast(tr('Nothing is copied yet: pick something and copy it first'), 'info');
    const t = clock.get();
    let index = spans.findIndex((s) => t < s.start + s.length / 2);
    if (index < 0) index = (r.clips ?? []).length;
    const last = ps[ps.length - 1];
    const ov = last?.kind === 'overlay' ? (r.overlays ?? []).find((o) => o.id === last.id) : undefined;
    const au = last?.kind === 'audio' ? (r.audio ?? []).find((a) => a.id === last.id) : undefined;
    const overlayTrack = ov ? (ov.track === 3 ? 3 : 2) : undefined;
    const audioTrack = au?.track;
    const rows: VideoTrackId[] = [
      ...(board.clips.length ? (['v1'] as const) : []),
      ...(board.texts.length ? (['t1'] as const) : []),
      ...board.overlays.map((o): VideoTrackId => ((overlayTrack ?? o.track) === 3 ? 'v3' : 'v2')),
      ...board.audio.map((a): VideoTrackId => ((audioTrack ?? a.track) === 'voice' ? 'a3' : 'a2')),
    ];
    if (rows.some(locked)) return lockedNote();
    const res = pasteBoard(r, factsOf, board, { index, at: t, overlayTrack, audioTrack });
    if (!res) return toast(tr('That is more than the timeline can hold'), 'info');
    change(() => res.recipe);
    setPicks(res.picks);
  };
  /** The picked things copied and put right after themselves. */
  const duplicatePicked = (ps: Pick1[] = picks) => {
    const live = unlocked(ps);
    if (!ps.length) return toast(tr('Pick something on the timeline to duplicate'), 'info');
    if (!live.length) return lockedNote();
    const res = duplicatePicks(r, factsOf, live);
    if (!res) return toast(tr('That is more than the timeline can hold'), 'info');
    if (locked('v1') && res.picks.some((q) => q.kind === 'clip')) return lockedNote();
    change(() => res.recipe);
    setPicks(res.picks);
  };
  /** The look, speed, colour, volume and fades of the copied clip (or part) put on what is picked. */
  const pasteAttrs = (ps: Pick1[] = picks) => {
    if (!board) return toast(tr('Nothing is copied yet: pick something and copy it first'), 'info');
    const live = unlocked(ps);
    if (!live.length) return ps.length ? lockedNote() : toast(tr('Pick what to paste the attributes onto'), 'info');
    const res = pasteAttributes(r, board, live);
    if (!res.changed) return toast(tr('Those do not fit: copy a clip, overlay, words or sound of the same kind as what is picked'), 'info');
    change(() => res.recipe);
  };
  /** The start (Q) or the end (W) of what is picked brought to the playhead, what was before (or after) it cut away. */
  const trimTo = (edge: 'start' | 'end', ps: Pick1[] = picks) => {
    const live = unlocked(ps);
    if (!ps.length) return toast(tr('Pick a clip or part on the timeline to trim'), 'info');
    if (!live.length) return lockedNote();
    const t = clock.get();
    let next = r;
    for (const q of live) next = trimToPlayhead(next, factsOf, q, edge, t);
    if (next === r) return toast(tr('The playhead is not inside what is picked: move it onto it first'), 'info');
    change(() => next);
  };
  const selectAll = () => setPicks([...(r.clips ?? []).map((c): Pick1 => ({ kind: 'clip', id: c.id! })), ...(r.overlays ?? []).map((o): Pick1 => ({ kind: 'overlay', id: o.id! })), ...(r.texts ?? []).map((x): Pick1 => ({ kind: 'text', id: x.id! })), ...(r.audio ?? []).map((a): Pick1 => ({ kind: 'audio', id: a.id! }))]);
  /** The playhead to the cut before (-1) or after (1) it: the start, each cut between clips, the end. */
  const goCut = (dir: 1 | -1) => {
    const to = neighbourCut(cutTimes(spans, length), clock.get(), dir);
    if (to !== null) engine.seek(to);
  };
  const markIn = () => setInOut([clock.get(), inOut[1] !== null && inOut[1] <= clock.get() ? null : inOut[1]]);
  const markOut = () => setInOut([inOut[0] !== null && inOut[0] >= clock.get() ? null : inOut[0], clock.get()]);
  const addMarker = (t = clock.get()) => h.set((x) => ({ ...x, markers: [...x.markers.filter((m) => Math.abs(m - t) > 1e-3), t].sort((a, b) => a - b) }));
  /** What a drag with Ctrl (⌥ on a Mac) in the viewer does at its start: a copy of the overlay or words, picked, made in the step the drag began. */
  const copyDragged = (thing: { kind: 'overlay' | 'text'; id: string }): string | null => {
    const id = videoId();
    const has = thing.kind === 'overlay' ? (r.overlays ?? []).some((o) => o.id === thing.id) : (r.texts ?? []).some((x) => x.id === thing.id);
    if (!has) return null;
    change((x) => (thing.kind === 'overlay' ? { ...x, overlays: (x.overlays ?? []).flatMap((o) => (o.id === thing.id ? [o, { ...o, id }] : [o])) } : { ...x, texts: (x.texts ?? []).flatMap((q) => (q.id === thing.id ? [q, { ...q, id }] : [q])) }));
    setPicks([{ kind: thing.kind, id }]);
    return id;
  };
  const addText = () => {
    const t = Math.min(clock.get(), Math.max(0, length - 0.5));
    const id = videoId();
    const text: VideoText = { id, text: tr('Your words'), from: Math.round(t * 1000) / 1000, to: Math.round(Math.min(length, t + 3) * 1000) / 1000, x: 0.5, y: 0.86, size: 0.07, color: '#ffffff', background: '#000000a6', bold: true };
    change((x) => ({ ...x, texts: [...(x.texts ?? []), text] }));
    setPicked({ kind: 'text', id });
  };
  const addTransition = () => {
    const t = clock.get();
    let best = -1;
    spans.forEach((s, i) => i > 0 && (best < 0 || Math.abs(s.start - t) < Math.abs(spans[best].start - t)) && (best = i));
    if (best < 1) return toast(tr('A transition joins two clips: add another clip first'), 'info');
    const c = r.clips![best - 1];
    const most = Math.floor((Math.min(spans[best - 1].length, spans[best].length) / 2) * 10) / 10;
    change((x) => setClip(x, c.id!, (y) => ({ ...y, transition: y.transition ?? { kind: 'dissolve', length: Math.min(1, most) } })));
    setPicked({ kind: 'transition', id: c.id! });
  };
  const editSound = (s: { src: string; title: string; from?: number; to?: number; save: (src: string) => void }) => {
    const open = soundEditor();
    if (open) open({ ...s, label: o.title });
  };
  /** The captions (or, with none, all the words) as a file to download: .srt or .vtt. */
  const downloadCaptions = (kind: 'srt' | 'vtt') => {
    const caps = (r.texts ?? []).filter((t) => t.caption);
    const list = caps.length ? caps : (r.texts ?? []);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([kind === 'srt' ? captionsSrt(list) : captionsVtt(list)], { type: kind === 'srt' ? 'application/x-subrip' : 'text/vtt' }));
    a.download = `${stemOf(o.title) || 'captions'}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const downloadSrt = () => downloadCaptions('srt');
  const downloadVtt = () => downloadCaptions('vtt');
  /** Captions put on T1 (the style of those already there, or Classic), taking the place of the ones there, if any. */
  const putCaptions = (list: { from: number; to: number; text: string }[]) => {
    const old = (r.texts ?? []).filter((t) => t.caption);
    const style = old[0] ?? { ...CAPTION_STYLES[0].set };
    const room = MAX_TEXTS - (r.texts ?? []).length + old.length;
    const made = list.slice(0, Math.max(0, room));
    change((x) => ({ ...x, texts: [...(x.texts ?? []).filter((t) => !t.caption), ...made.map((c) => ({ id: videoId(), text: c.text, from: c.from, to: c.to, x: 0.5, y: style.y, size: style.size, color: style.color, background: style.background, outline: style.outline, bold: style.bold || undefined, caption: true }))] }));
    return made.length;
  };
  /** Whether the captions on T1 may be replaced: yes when there are none; else the person is asked, as they may have changed them. */
  const mayReplaceCaptions = async (what: string) => {
    const n = (r.texts ?? []).filter((t) => t.caption).length;
    if (!n) return true;
    return confirm({ title: tr('Replace the captions?'), body: tr(`The ${n} caption${n === 1 ? '' : 's'} on T1 will be replaced by ${what}, including any you changed. Undo brings them back.`), confirm: tr('Replace them'), danger: true });
  };
  /** Captions from an .srt or .vtt file, on T1. */
  const importCaptions = async (file: File) => {
    let list: ReturnType<typeof parseCaptions>;
    try {
      list = parseCaptions(await file.text());
    } catch (err) {
      return toastError(err);
    }
    if (!list.length) return toast(tr('No captions were found in that file: it should be an .srt or .vtt file with times and words'), 'info');
    if (!(await mayReplaceCaptions(tr(`the ${list.length} in the file`)))) return;
    const n = putCaptions(list);
    toast(n < list.length ? tr(`${n} of the ${list.length} captions were added: the most the timeline holds`) : tr(`${n} captions added: change them on the T1 track`), 'ok');
  };
  const captionsCtl = useRef<AbortController | null>(null);
  const makeCaps = async () => {
    if (captionsBusy) return;
    if (!(await mayReplaceCaptions(tr('the ones made from what is said')))) return;
    setCaptionsBusy(tr('Listening to the video…'));
    const ac = new AbortController();
    captionsCtl.current = ac;
    try {
      const recipe = normalizeVideoRecipe(r, factsOf);
      const res = await makeCaptions({ src: o.src, recipe, lang: navigator.language }, ac.signal);
      if (!res.captions.length) return toast(tr('No speech was heard in it, so there are no captions to make'), 'info');
      const n = putCaptions(res.captions);
      toast(tr(`${n} captions made: change them on the T1 track`), 'ok');
    } catch (err) {
      if (!ac.signal.aborted) toastError(err);
    } finally {
      setCaptionsBusy(null);
      captionsCtl.current = null;
    }
  };

  // ---- files from this device: the media panel's picker, or dropped on it or on the timeline ----------------------------------
  /** Files imported (sent, read, added to the media panel), then given to `place` to put on the timeline; captions files become captions. */
  const bring = async (files: File[], place?: (it: PoolItem, n: number) => void) => {
    let n = 0;
    for (const f of files) {
      const kind = kindOfFile(f);
      if (kind === 'captions') {
        await importCaptions(f);
        continue;
      }
      if (!kind) {
        toast(tr(`${f.name} is not a video, picture, sound or captions file, so it cannot be added`), 'info');
        continue;
      }
      const row = { name: f.name.replace(/\.[^.]+$/, ''), share: 0 };
      setSending((x) => [...x, row]);
      try {
        const it = await importFile(f, kind, (share) => setSending((x) => x.map((y) => (y === row ? { ...y, share } : y))));
        addPool(it);
        place?.(it, n++);
      } catch (err) {
        toastError(err);
      } finally {
        setSending((x) => x.filter((y) => y !== row));
      }
    }
  };
  /** Files dropped on a track: each placed from where they were dropped (clips one after another, others one after another in time). */
  const dropFiles = (files: File[], row: VideoTrackId, t: number, index: number) => {
    let at = t;
    void bring(files, (it, n) => {
      use(it, row, at, index + n);
      at += it.kind === 'picture' ? 4 : it.facts.duration;
    });
  };

  // ---- saving ---------------------------------------------------------------------------------------------------------
  const stopRef = useRef<string | null>(null);
  const run = async (what: 'main' | 'copy' | 'gif' | 'frame') => {
    if (busy) return;
    engine.pause();
    let recipe: VideoRecipe;
    try {
      recipe = normalizeVideoRecipe(r, factsOf);
    } catch (err) {
      return toastError(err);
    }
    const size = what === 'frame' ? undefined : settings.size;
    const box = outputSize(recipe, factsOf, { size, exact: true });
    const drawn = (recipe.texts ?? []).map((t) => drawText(t, box.w, box.h).toDataURL('image/png'));
    const range: [number, number] | undefined = settings.range === 'inout' && (inOut[0] !== null || inOut[1] !== null) ? [inOut[0] ?? 0, inOut[1] ?? length] : undefined;
    const common = { src: o.src, recipe, drawn, ...(size ? { size, exactSize: true } : {}), ...(settings.fps ? { fps: settings.fps } : {}), codec: settings.codec, quality: settings.quality, encoder: settings.encoder };
    let ask: VideoEditAsk;
    if (what === 'frame') ask = { src: o.src, recipe, drawn, format: 'jpg', frame: clock.get(), to: plans.beside };
    else if (what === 'gif') ask = { ...common, ...(range ? { range } : {}), format: 'gif', to: plans.beside };
    else if (what === 'main' && 'video' in plans.main.to && isPlainRecipe(recipe) && e.stillAt !== undefined) ask = { src: o.src, recipe, drawn, format: 'jpg', frame: e.stillAt, to: { asset: true } };
    else {
      const to = what === 'copy' && plans.copy ? plans.copy.to : plans.main.to;
      ask = { ...common, ...(range ? { range } : {}), format: plans.main.fixed && what === 'main' ? undefined : settings.kind === 'gif' ? 'mp4' : settings.kind, ...(e.stillAt !== undefined && 'video' in to ? { still: e.stillAt } : {}), to };
    }
    const label = what === 'frame' ? tr('Taking the frame') : what === 'gif' ? tr('Making the GIF') : tr('Making the video');
    setMaking({ what: label, startedAt: Date.now() });
    try {
      const j = await makeEdit(ask, {
        onJob: (job) => {
          stopRef.current = job.job;
          setMaking((s) => (s ? { ...s, job } : s));
        },
      });
      setLast(j);
      if (j.status === 'stopped') return toast(tr('Stopped: nothing was saved'), 'info');
      if (j.status !== 'done') return toastError(new Error(j.error ?? 'The video could not be made'));
      if (j.note) toast(tr(j.note), 'info');
      if (what === 'frame') return toast(wentTo(j, 'frame'), 'ok');
      if (what === 'gif') return toast(wentTo(j, 'gif'), 'ok');
      if (what === 'copy') return toast(wentTo(j, 'copy'), 'ok');
      // Only the still changed: the slide keeps its video, with this frame as its still.
      if (ask.format === 'jpg') return await done({ kind: 'video', src: o.src, poster: j.src, w: facts.width, h: facts.height });
      const mime = j.format === 'webm' ? 'video/webm' : j.format === 'mov' ? 'video/quicktime' : 'video/mp4';
      await done({ kind: 'video', src: j.src, poster: j.poster, media: j.media, path: j.path, w: j.w, h: j.h, mime, replaced: 'media' in ask.to || ('file' in ask.to && ask.to.as === 'replace') });
    } catch (err) {
      toastError(err);
    } finally {
      stopRef.current = null;
      setMaking(null);
    }
  };
  const stop = () => {
    if (stopRef.current) void stopEdit(stopRef.current);
    setMaking((s) => (s ? { ...s, stopped: true } : s));
  };

  // ---- menus ------------------------------------------------------------------------------------------------------------
  const pc = picked?.kind === 'clip' ? (r.clips ?? []).find((c) => c.id === picked.id) : undefined;
  /** The commands on what is picked (`ps`), as the Edit menu and every right-click menu have them: one list, so the words, keys and ticks match. */
  const actions = (ps: Pick1[]) => {
    const n = ps.length;
    return {
      cut: { label: 'Cut', keys: 'Ctrl+X', disabled: !n, run: () => cutPicked(ps) },
      copy: { label: 'Copy', keys: 'Ctrl+C', disabled: !n, run: () => copyPicked(ps) },
      paste: { label: 'Paste', keys: 'Ctrl+V', disabled: !board, run: () => pasteHere(ps) },
      pasteAttrs: { label: 'Paste attributes', keys: 'Ctrl+Alt+V', disabled: !board || !n, run: () => pasteAttrs(ps) },
      duplicate: { label: 'Duplicate', keys: 'Ctrl+D', disabled: !n, run: () => duplicatePicked(ps) },
      selectAll: { label: 'Select all', keys: 'Ctrl+A', run: selectAll },
      split: { label: 'Split at the playhead', keys: 'S', run: () => splitHere(ps) },
      trimStart: { label: 'Trim start to playhead', keys: 'Q', disabled: !n, run: () => trimTo('start', ps) },
      trimEnd: { label: 'Trim end to playhead', keys: 'W', disabled: !n, run: () => trimTo('end', ps) },
      del: { label: 'Delete', keys: 'Delete', disabled: !n && !range, run: () => remove(false, ps) },
      ripple: { label: 'Ripple delete', keys: 'Shift+Delete', disabled: !n && !range, run: () => remove(true, ps) },
    };
  };
  const act = actions(picks);
  /** What a clip's right-click menu has beyond the commands: its speed, direction, held frame, sound, fit and colour. */
  const clipItems = (c: NonNullable<typeof pc>): MenuEntry[] => {
    const f = factsOf(c.src);
    const still = isStill(c) || !!f?.picture;
    const set = (patch: Record<string, unknown>) => change((x) => setClip(x, c.id!, (y) => ({ ...y, ...patch })));
    return [
      { label: 'Half speed', disabled: still, checked: c.speed === 0.5, run: () => set({ speed: 0.5 }) },
      { label: 'Normal speed', disabled: still, checked: !c.speed, run: () => set({ speed: undefined }) },
      { label: 'Twice as fast', disabled: still, checked: c.speed === 2, run: () => set({ speed: 2 }) },
      { label: 'Play it backwards', disabled: still, checked: !!c.reverse, run: () => set({ reverse: !c.reverse || undefined }) },
      { label: 'Hold this frame', disabled: still, run: () => change((x) => freezeFrame(x, factsOf, c.id!, clock.get())) },
      { label: 'Steady it (stabilize)', disabled: still, checked: !!c.stabilize, run: () => set({ stabilize: !c.stabilize || undefined }) },
      '-',
      { label: 'Detach the sound', disabled: !canDetach(c, f), run: () => change((x) => detachSound(x, factsOf, c.id!, main)) },
      { label: 'Edit the sound…', disabled: !soundEditor() || still || (!f?.audio && !c.sound), run: () => editSound({ src: c.sound ?? c.src ?? main, title: c.name ?? 'Clip', from: c.trim?.[0], to: c.trim?.[1], save: (src) => set({ sound: src, mute: undefined }) }) },
      '-',
      { label: c.fit === 'fill' ? 'Fit it in the frame' : 'Fill the frame with it', run: () => set({ fit: c.fit === 'fill' ? undefined : 'fill' }) },
      { label: 'Colour…', run: () => setWorkspace('colour') },
    ];
  };
  /** What a right-click on a sound offers: its channels, its fixes, a part silenced, its volume line, linked or not. */
  const soundMenu = (kind: 'clip' | 'audio', id: string): MenuEntry[] => {
    const x = kind === 'clip' ? (r.clips ?? []).find((c) => c.id === id) : (r.audio ?? []).find((a) => a.id === id);
    if (!x) return [];
    const set = (m: Record<string, unknown>) => change((rr) => (kind === 'clip' ? setClip(rr, id, (c) => ({ ...c, ...m })) : { ...rr, audio: (rr.audio ?? []).map((a) => (a.id === id ? { ...a, ...m } : a)) }));
    const inOutSet = inOut[0] !== null || inOut[1] !== null;
    const a = kind === 'audio' ? (x as NonNullable<VideoRecipe['audio']>[number]) : null;
    return [
      ...SOUND_CHANNELS.map((c) => ({ label: c.label, checked: (x.channels ?? 'stereo') === c.id, run: () => set({ channels: c.id === 'stereo' ? undefined : c.id }) })),
      '-',
      { label: 'Clean up the voice', checked: !!x.clean, run: () => set({ clean: x.clean ? undefined : 0.5 }) },
      { label: 'Even out the loudness', checked: !!x.even, run: () => set({ even: x.even ? undefined : true }) },
      { label: 'Normalize', run: () => void normalizeSound(kind, id) },
      '-',
      { label: 'Silence the part picked', keys: 'Delete', disabled: !range || range.id !== id, run: () => range && (change((rr) => silencePart(rr, factsOf, range.kind, range.id, range.from, range.to)), setRange(null)) },
      { label: 'Silence from In to Out', disabled: !inOutSet, run: () => change((rr) => silencePart(rr, factsOf, kind, id, inOut[0] ?? 0, inOut[1] ?? length)) },
      { label: 'Flatten the volume line', disabled: !x.levels?.length, run: () => set({ levels: undefined }) },
      ...(kind === 'clip'
        ? ['-' as const, { label: 'Unlink the sound', disabled: !canDetach(x as NonNullable<typeof pc>, factsOf((x as NonNullable<typeof pc>).src)), run: () => change((rr) => detachSound(rr, factsOf, id, main)) }]
        : a?.clip && (r.clips ?? []).some((c) => c.id === a.clip)
          ? ['-' as const, { label: 'Link it to its clip again', run: () => change((rr) => linkSound(rr, id)) }]
          : []),
    ];
  };
  const normalizeSound = async (kind: 'clip' | 'audio', id: string) => {
    const c = kind === 'clip' ? (r.clips ?? []).find((x) => x.id === id) : undefined;
    const a = kind === 'audio' ? (r.audio ?? []).find((x) => x.id === id) : undefined;
    const measure = c ? { src: c.sound ?? c.src ?? main, from: c.trim?.[0], to: c.trim?.[1] } : a ? { src: a.src, from: a.trim?.[0], to: a.trim?.[1] } : null;
    if (!measure) return;
    try {
      const { peak } = await post<{ peak: number }>('/api/mediaedit/video/peak', measure);
      if (peak <= -99) return;
      const g = Math.min(4, Math.round(Math.pow(10, (-1 - peak) / 20) * 1000) / 1000);
      change((rr) => (c ? setClip(rr, id, (y) => ({ ...y, volume: Math.abs(g - 1) < 0.005 ? undefined : g })) : { ...rr, audio: (rr.audio ?? []).map((y) => (y.id === id ? { ...y, volume: Math.abs(g - 1) < 0.005 ? undefined : g } : y)) }));
    } catch (err) {
      toastError(err);
    }
  };
  /** A right-click (or the menu key, or a long press): the menu for the thing pointed at, or for the empty timeline; the things picked stay picked when it is one of them. */
  const onMenu = (at: ContextMenuAt, p: Picked, t: number) => {
    const ps: Pick1[] = p && !picks.some((q) => q.kind === p.kind && q.id === p.id) ? [p] : picks;
    const a = actions(ps);
    const edit: MenuEntry[] = [a.cut, a.copy, a.paste, a.pasteAttrs, a.duplicate];
    let items: MenuEntry[] = [];
    if (p?.kind === 'clipsound') {
      const c = (r.clips ?? []).find((x) => x.id === p.id);
      if (c)
        items = [
          ...edit,
          '-',
          a.split,
          { label: 'Without its sound', keys: 'Delete', run: () => remove(false, ps) },
          '-',
          ...soundMenu('clip', c.id!),
          '-',
          { label: 'Edit the sound…', disabled: !soundEditor(), run: () => editSound({ src: c.sound ?? c.src ?? main, title: c.name ?? 'Clip', from: c.trim?.[0], to: c.trim?.[1], save: (src) => change((x) => setClip(x, c.id!, (y) => ({ ...y, sound: src, mute: undefined }))) }) },
        ];
    } else if (p?.kind === 'clip') {
      const c = (r.clips ?? []).find((x) => x.id === p.id);
      if (c) items = [...edit, '-', a.split, a.trimStart, a.trimEnd, '-', a.del, a.ripple, '-', ...clipItems(c)];
    } else if (p?.kind === 'transition')
      items = [...VIDEO_TRANSITIONS.map((k) => ({ label: k.label, checked: (r.clips ?? []).find((c) => c.id === p.id)?.transition?.kind === k.id, run: () => change((x) => setClip(x, p.id, (c) => ({ ...c, transition: { kind: k.id, length: c.transition?.length ?? 1 } }))) })), '-' as const, { label: 'A cut (no transition)', run: () => change((x) => setClip(x, p.id, (c) => ({ ...c, transition: undefined }))) }];
    else if (p) {
      const kind = p.kind as 'overlay' | 'text' | 'audio';
      items = [...edit, '-', a.split, a.trimStart, a.trimEnd, '-', a.del, a.ripple];
      if (kind === 'overlay') {
        const ov = (r.overlays ?? []).find((x) => x.id === p.id);
        items.push('-', { label: ov?.key ? 'No green screen' : 'Green screen: take the green out', run: () => change((x) => setOverlay(x, p.id, (y) => ({ ...y, key: y.key ? undefined : { color: '#00ff00', similarity: 0.3, blend: 0.1 } }))) });
      }
      if (kind === 'audio') {
        const au = (r.audio ?? []).find((x) => x.id === p.id);
        if (au) items.push('-', ...soundMenu('audio', au.id!), '-', { label: 'Edit the sound…', disabled: !soundEditor(), run: () => editSound({ src: au.src, title: au.name ?? 'Sound', from: au.trim?.[0], to: au.trim?.[1], save: (src) => change((x) => ({ ...x, audio: (x.audio ?? []).map((y) => (y.id === au.id ? { ...y, src } : y)) })) }) });
      }
    } else
      items = [
        a.paste,
        a.selectAll,
        '-',
        { label: 'Add a marker here', keys: 'M', run: () => addMarker(t) },
        { label: 'Add words here', run: () => (engine.seek(t), addText()) },
        { label: 'Mark In here', keys: 'I', run: () => setInOut([t, inOut[1]]) },
        { label: 'Mark Out here', keys: 'O', run: () => setInOut([inOut[0], t]) },
      ];
    setMenu({ at, items });
  };
  /** A marker's menu: go to it, take it away, or make it In or Out. */
  const onMarkerMenu = (at: ContextMenuAt, i: number) => {
    const m = e.markers[i];
    if (m === undefined) return;
    setMenu({
      at,
      items: [
        { label: 'Go to the marker', run: () => engine.seek(m) },
        { label: 'Mark In here', run: () => setInOut([m, inOut[1]]) },
        { label: 'Mark Out here', run: () => setInOut([inOut[0], m]) },
        '-',
        { label: 'Delete the marker', danger: true, run: () => h.set((x) => ({ ...x, markers: x.markers.filter((_, j) => j !== i) })) },
      ],
    });
  };

  /** On a phone, which has no right-click: the commands of what is picked, from the sheet's More button. */
  const moreMenu = (el: HTMLElement) => {
    const b = el.getBoundingClientRect();
    setMenu({
      at: { x: b.left, y: b.bottom },
      items: [act.cut, act.copy, act.paste, act.pasteAttrs, act.duplicate, '-', act.trimStart, act.trimEnd, act.ripple, '-', act.selectAll, { label: 'Add a marker', run: () => addMarker() }, { label: 'Import captions (.srt, .vtt)…', run: () => captionFile.current?.click() }, { label: 'Keyboard shortcuts', run: () => setKeysOpen(true) }],
    });
  };
  const hasCaptions = (r.texts ?? []).length > 0;
  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: plans.main.label, keys: 'Ctrl+S', disabled: busy, run: () => void run('main') },
        plans.copy && { label: plans.copy.label, disabled: busy, run: () => void run('copy') },
        { label: 'Export…', keys: 'Alt+4', run: () => setWorkspace('export') },
        // At someone's link it is saved over the video alone: no frames or GIFs beside it.
        ...(viaLink
          ? []
          : ['-' as const, { label: 'Take this frame as a picture', disabled: busy, run: () => void run('frame') }, { label: 'Save as a GIF', disabled: busy, run: () => void run('gif') }]),
        o.to && 'asset' in o.to && !detached && { label: 'Use this frame as its still', run: () => h.set((x) => ({ ...x, stillAt: clock.get() })) },
        '-',
        { label: 'Import captions (.srt, .vtt)…', run: () => captionFile.current?.click() },
        { label: 'Save the captions as .srt', disabled: !hasCaptions, run: downloadSrt },
        { label: 'Save the captions as .vtt', disabled: !hasCaptions, run: downloadVtt },
        '-',
        { label: 'Close', run: close },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', keys: 'Ctrl+Z', disabled: !h.canUndo || busy, run: h.undo },
        { label: 'Redo', keys: 'Ctrl+Shift+Z / Ctrl+Y', disabled: !h.canRedo || busy, run: h.redo },
        '-',
        act.cut,
        act.copy,
        act.paste,
        act.pasteAttrs,
        act.duplicate,
        '-',
        act.selectAll,
        '-',
        act.split,
        act.trimStart,
        act.trimEnd,
        '-',
        act.del,
        act.ripple,
        '-',
        { label: 'Back to the original', disabled: !changed, run: () => (setPicked(null), setCropping(null), h.set({ recipe: withIds({ clips: [{ name: o.title }] }), markers: [] })) },
      ],
    },
    {
      label: 'Clip',
      items: pc
        ? [act.split, act.del, act.ripple, '-', ...clipItems(pc)]
        : [
            { label: 'Add words at the playhead', run: addText },
            { label: 'Make captions from what is said', run: () => void makeCaps() },
            { label: 'Import captions (.srt, .vtt)…', run: () => captionFile.current?.click() },
            { label: 'Pick a clip on the timeline for more', disabled: true },
          ],
    },
    {
      label: 'Timeline',
      items: [
        { label: 'Add a marker', keys: 'M', run: () => addMarker() },
        { label: 'Mark In', keys: 'I', run: markIn },
        { label: 'Mark Out', keys: 'O', run: markOut },
        { label: 'Clear In and Out', keys: 'Alt+X', disabled: inOut[0] === null && inOut[1] === null, run: () => setInOut([null, null]) },
        { label: 'Silence the clips’ sound from In to Out', disabled: inOut[0] === null && inOut[1] === null, run: () => change((x) => silenceClips(x, factsOf, inOut[0] ?? 0, inOut[1] ?? length)) },
        '-',
        { label: 'Previous cut', keys: '↑', run: () => goCut(-1) },
        { label: 'Next cut', keys: '↓', run: () => goCut(1) },
        { label: 'Add a transition at the nearest cut', keys: 'Ctrl+T', run: addTransition },
        { label: 'Add words at the playhead', run: addText },
        '-',
        { label: 'Snapping', keys: 'N', checked: snapOn, run: () => setSnapOn(!snapOn) },
        { label: 'Select', keys: 'A', checked: tool === 'select', run: () => setTool('select') },
        { label: 'Blade', keys: 'B', checked: tool === 'blade', run: () => setTool('blade') },
        { label: 'Trim (roll)', keys: 'T', checked: tool === 'trim', run: () => setTool('trim') },
        { label: 'Hand', keys: 'H', checked: tool === 'hand', run: () => setTool('hand') },
        '-',
        { label: 'Zoom in', keys: '+', run: () => setPps(Math.min(600, pps * 1.5)) },
        { label: 'Zoom out', keys: '−', run: () => setPps(Math.max(2, pps / 1.5)) },
        { label: 'Zoom to fit', keys: 'Shift+Z', run: () => fitRef.current?.() },
      ],
    },
    {
      label: 'View',
      items: [
        ...WORKSPACES.map((w) => ({ label: w.label, keys: w.keys, checked: workspace === w.id, run: () => setWorkspace(w.id) })),
        '-',
        { label: 'Safe areas', checked: safe, run: () => setSafe(!safe) },
        { label: 'Grid of thirds', checked: grid, run: () => setGrid(!grid) },
        { label: 'Before and after', checked: split !== null, run: () => setSplit(split === null ? 0.5 : null) },
        '-',
        { label: 'Fit in the viewer', checked: zoom === 'fit', run: () => setZoom('fit') },
        { label: '100%', checked: zoom === 1, run: () => setZoom(1) },
      ],
    },
    { label: 'Help', items: [{ label: 'Keyboard shortcuts', keys: 'Ctrl+/', run: () => setKeysOpen(true) }] },
  ];
  /** The keys that are not in the menus, for the list of shortcuts. */
  const moreKeys: ShortcutGroup[] = [
    {
      title: 'Playback',
      items: [
        ['Space', 'Play or pause'],
        ['K', 'Stop'],
        ['L', 'Play forwards, faster at each press'],
        ['J', 'Play backwards, faster at each press'],
        ['← / →', 'A frame back or on'],
        ['Shift+← / Shift+→', 'A second back or on'],
        ['Home / End', 'To the start or the end'],
      ],
    },
    {
      title: 'On the timeline and the viewer',
      items: [
        ['Shift+click / Ctrl+click', 'Add a thing to what is picked, or take it out (on a sound, Ctrl+click: Shift and a drag picks a part of it)'],
        ['Drag on empty space', 'Pick what the box crosses (with Shift or Ctrl, add to what is picked)'],
        ['Esc', 'Pick nothing'],
        [`${COPY_DRAG_KEY}+drag`, 'Drag a copy of words or an overlay in the viewer'],
        [`${NO_SNAP_KEY}+drag`, 'Move or size in the viewer without snapping'],
        ['Shift+drag', 'Keep a move in the viewer straight'],
        ['V', 'The Select tool'],
        ['?', 'This list'],
      ],
    },
  ];

  // ---- keys -------------------------------------------------------------------------------------------------------------
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    const typing = !!(ev.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]');
    // A dialog or a menu open over the editor has its own keys (they reach here through the page's tree).
    if ((ev.target as HTMLElement).closest('[role="dialog"], [role="menu"]')) return;
    if (k === 'escape') {
      // In a field, Esc leaves the field and keeps what is picked.
      if (typing) {
        (ev.target as HTMLElement).blur();
        ev.stopPropagation();
        return;
      }
      if (cropping) setCropping(null);
      else setPicked(null);
      return;
    }
    if (mod && !ev.shiftKey && !ev.altKey && (k === 'k' || k === 'b' || k === '`')) return;
    ev.stopPropagation();
    // These work in a field too.
    if (mod && k === 's') {
      ev.preventDefault();
      return void run('main');
    }
    if (mod && k === 't') {
      ev.preventDefault();
      return addTransition();
    }
    if (ev.altKey && /^[1-4]$/.test(ev.key)) {
      ev.preventDefault();
      return setWorkspace(WORKSPACES[Number(ev.key) - 1].id);
    }
    if (ev.altKey && k === 'x') return setInOut([null, null]);
    if (typing) return;
    // The menu key (or Shift+F10) opens the right-click menu of what is picked, over the timeline.
    if (isMenuKey(ev)) {
      ev.preventDefault();
      const box = (root.current?.querySelector('[data-track]') ?? root.current)?.getBoundingClientRect();
      return onMenu({ x: (box?.left ?? 0) + Math.min(240, (box?.width ?? 0) / 2), y: (box?.top ?? 0) + 8, keyed: true }, picked, clock.get());
    }
    // Copy and cut leave the browser's own to words selected somewhere on the page.
    if (mod && !ev.shiftKey && !ev.altKey && (k === 'c' || k === 'x') && (window.getSelection()?.toString() ?? '')) return;
    if (ev.key === '?' && !mod) {
      ev.preventDefault();
      return setKeysOpen(true);
    }
    if (runMenuKeys(menus, ev)) return;
    if (mod || ev.altKey || busy) return;
    const frame = 1 / fps;
    const step = (n: number) => {
      engine.pause();
      engine.seek(Math.round((clock.get() + n) * fps) / fps);
    };
    if (ev.key === ' ' && !(ev.target as HTMLElement).closest('button')) {
      ev.preventDefault();
      engine.toggle();
    } else if (k === 'k') engine.pause();
    else if (k === 'l') engine.shuttle(1);
    else if (k === 'j') engine.shuttle(-1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      step((ev.key === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 1 : frame));
    } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      goCut(ev.key === 'ArrowUp' ? -1 : 1);
    } else if (ev.key === 'Home') engine.seek(0);
    else if (ev.key === 'End') engine.seek(length);
    else if (k === 'v') setTool('select');
    else if (ev.key === '+' || ev.key === '=') setPps(Math.min(600, pps * 1.5));
    else if (ev.key === '-' || ev.key === '_') setPps(Math.max(2, pps / 1.5));
  };
  useEffect(() => {
    if (active) root.current?.focus({ preventScroll: true });
  }, [active]);
  // The keys stay the editor's: a press anywhere in it (but in a field) and a menu closing give it the keyboard again.
  const keepFocus = (ev: React.PointerEvent) => {
    if (!(ev.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) root.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!menu && active) root.current?.focus({ preventScroll: true });
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the parts ------------------------------------------------------------------------------------------------------
  const onCrop = (c: { x: number; y: number; w: number; h: number }, phase: 'begin' | 'move' | 'end') => {
    if (!cropping) return;
    if (phase === 'begin') return h.begin();
    if (phase === 'end') return h.end();
    const f = factsOf(r.clips?.find((x) => x.id === cropping.id)?.src);
    const full = f ? (r.clips?.find((x) => x.id === cropping.id)?.rotate === 90 || r.clips?.find((x) => x.id === cropping.id)?.rotate === 270 ? { w: f.height, h: f.width } : { w: f.width, h: f.height }) : { w: 0, h: 0 };
    change((x) => setClip(x, cropping.id, (y) => ({ ...y, crop: c.x <= 0 && c.y <= 0 && c.w >= full.w && c.h >= full.h ? undefined : c })));
  };
  const viewer = (o2: { split?: boolean; compact?: boolean } = {}) => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <Viewer
          engine={engine}
          clock={clock}
          recipe={r}
          factsOf={factsOf}
          out={out}
          picked={picked}
          onPick={setPicked}
          onMoveText={(id, x, y, phase) => (phase === 'begin' ? h.begin() : phase === 'end' ? h.end() : change((rr) => ({ ...rr, texts: (rr.texts ?? []).map((t) => (t.id === id ? { ...t, x, y } : t)) })))}
          onMoveOverlay={(id, patch, phase) => (phase === 'begin' ? h.begin() : phase === 'end' ? h.end() : change((rr) => setOverlay(rr, id, (y) => ({ ...y, ...patch }))))}
          onSizeText={(id, size, phase) => (phase === 'begin' ? h.begin() : phase === 'end' ? h.end() : change((rr) => ({ ...rr, texts: (rr.texts ?? []).map((t) => (t.id === id ? { ...t, size } : t)) })))}
          onCopyDrag={copyDragged}
          crop={workspace === 'edit' ? cropping : null}
          onCrop={onCrop}
          safe={safe}
          grid={grid}
          zoom={o2.compact ? 'fit' : zoom}
          split={o2.split ? split : null}
          onSplit={setSplit}
          onCanvas={(c) => (canvasRef.current = c)}
          tight={o2.compact}
        />
      </div>
      <Transport
        engine={engine}
        clock={clock}
        fps={fps}
        length={length}
        playing={playing}
        inOut={inOut}
        onIn={() => setInOut([clock.get(), inOut[1]])}
        onOut={() => setInOut([inOut[0], clock.get()])}
        zoom={zoom}
        onZoom={setZoom}
        safe={safe}
        onSafe={() => setSafe(!safe)}
        grid={grid}
        onGrid={() => setGrid(!grid)}
        compact={o2.compact}
      />
    </div>
  );
  const timeline = (compact = false) => (
    <Timeline
      recipe={r}
      factsOf={factsOf}
      engine={engine}
      clock={clock}
      main={main}
      fps={fps}
      picks={picks}
      onPick={setPicked}
      onToggle={(q) => setPicks((x) => togglePick(x, q))}
      onPickMany={setPicks}
      change={change}
      markers={e.markers}
      onMarkers={(m) => h.set((x) => ({ ...x, markers: m }))}
      inOut={inOut}
      tool={tool}
      onTool={setTool}
      snapOn={snapOn}
      onSnap={setSnapOn}
      pps={pps}
      onPps={setPps}
      trackUi={trackUi}
      onTrackUi={(id, u) => setTrackUi({ ...trackUi, [id]: u })}
      onMenu={onMenu}
      onMarkerMenu={onMarkerMenu}
      onDrop={(it, row, t, index) => use(it, row, t, index)}
      onDropFiles={dropFiles}
      fitRef={fitRef}
      range={range}
      onRange={setRange}
      pool={pool}
      compact={compact}
    />
  );
  const inspector = (
    <Inspector
      recipe={r}
      factsOf={factsOf}
      picked={picked}
      change={change}
      now={now}
      out={out}
      pool={pool}
      main={main}
      fps={fps}
      cropping={cropping}
      onCropping={(c) => {
        setCropping(c);
        if (c) engine.pause();
      }}
      onColour={() => setWorkspace('colour')}
      onEditSound={editSound}
      onCaptions={() => void makeCaps()}
      captionsBusy={captionsBusy}
      onSrt={downloadSrt}
      onVtt={downloadVtt}
      onImportCaptions={() => captionFile.current?.click()}
      onAddText={addText}
      label={o.title}
    />
  );
  const media = (
    <MediaPanel
      pool={pool}
      onAdd={addPool}
      onUse={(it) => use(it, it.kind === 'sound' ? 'a2' : 'v1', undefined, undefined)}
      onRecorded={(it) => use(it, 'a3', clock.get())}
      sending={sending}
      onFiles={(files) => void bring(files)}
    />
  );
  const exportPage = (
    <ExportPage
      recipe={r}
      out={out}
      made={made}
      fps={fps}
      ownFps={ownFps}
      length={length}
      inOut={inOut}
      settings={settings}
      onSettings={setSettings}
      onShape={(shape) => change((x) => ({ ...x, shape }))}
      fixed={plans.main.fixed}
      plans={plans}
      making={making}
      last={last}
      onMake={(w) => void run(w)}
      onStop={stop}
      hasCaptions={(r.texts ?? []).some((t) => t.caption)}
      onSrt={downloadSrt}
      onVtt={downloadVtt}
    />
  );
  const saveButtons = (
    <>
      <IconButton label="Undo" disabled={!h.canUndo || busy} onClick={h.undo}>
        <Undo2 size={16} />
      </IconButton>
      <IconButton label="Redo" disabled={!h.canRedo || busy} onClick={h.redo}>
        <Redo2 size={16} />
      </IconButton>
      {!mobile && plans.copy && (
        <Button size="sm" variant="secondary" className="ml-1" disabled={busy} onClick={() => void run('copy')}>
          {plans.copy.label}
        </Button>
      )}
      <Button size="sm" variant="primary" className="ml-1" disabled={busy} onClick={() => void run('main')}>
        {plans.main.label}
      </Button>
    </>
  );
  const status = (
    <StatusBar
      left={
        <>
          <span>{`${out.w} × ${out.h}`}</span>
          <span>{`${Math.round(fps * 100) / 100} fps`}</span>
          <span translate="no">{timecode(length, fps)}</span>
          <span>{`${(r.clips ?? []).length} clip${(r.clips ?? []).length === 1 ? '' : 's'}`}</span>
          {inOut[0] !== null || inOut[1] !== null ? <span>{`In ${videoClock(inOut[0] ?? 0)} · Out ${videoClock(inOut[1] ?? length)}`}</span> : null}
        </>
      }
      right={
        making ? (
          <span className="flex items-center gap-1.5 text-fg-2">
            <Throbber size={11} />
            {making.job?.progress !== undefined ? `${making.what} · ${Math.round(making.job.progress * 100)}%` : making.what}
            <button type="button" onClick={stop} className="text-accent hover:underline">
              Stop
            </button>
          </span>
        ) : sending.length ? (
          <span className="flex items-center gap-1.5 text-fg-2">
            <Throbber size={11} />
            <span translate="no">{`${sending[0].name}${sending[0].share > 0 ? ` · ${Math.round(sending[0].share * 100)}%` : ''}`}</span>
            {sending.length > 1 && <span>{`and ${sending.length - 1} more`}</span>}
          </span>
        ) : last?.status === 'done' ? (
          <span>{last.made?.gpu ? `Made on the graphics card (${last.made.by})` : 'Made on the processor'}</span>
        ) : undefined
      }
    />
  );

  // What floats over the editor: the right-click menu, the list of shortcuts, a question, and the picker for a captions file.
  const floating = (
    <>
      <ContextMenu at={menu?.at ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} groups={shortcutGroups(menus, moreKeys)} part="media" />
      {confirmNode}
      <input
        ref={captionFile}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip"
        className="hidden"
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = '';
          if (f) void importCaptions(f);
        }}
      />
    </>
  );

  // ---- a phone: the viewer, the main track, and the rest in sheets ----------------------------------------------------
  if (mobile)
    return (
      <StepsContext.Provider value={change}>
        <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} onPointerDownCapture={keepFocus} className="flex h-full min-h-0 flex-col bg-bg outline-none">
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-1.5 pt-[var(--safe-top)]">
            {lead}
            <span translate="no" className="min-w-0 flex-1 truncate px-1 text-[14px] font-semibold">
              {o.title}
            </span>
            <MenuBar menus={menus} compact />
            {saveButtons}
          </header>
          {making && (
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-bg-1 px-3 text-[12px] text-fg-2">
              <Throbber size={12} />
              <span className="min-w-0 flex-1 truncate">{making.job?.progress !== undefined ? `${making.what} · ${Math.round(making.job.progress * 100)}%` : making.what}</span>
              <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={stop}>
                Stop
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1">{viewer({ compact: true })}</div>
          <div className="h-[132px] shrink-0 border-t border-line">{timeline(true)}</div>
          <nav className="flex shrink-0 border-t border-line bg-bg pb-[var(--safe-bottom)]">
            {[
              { id: 'media' as const, label: 'Add', icon: <Plus size={17} /> },
              { id: 'inspector' as const, label: 'Edit', icon: <SlidersHorizontal size={17} /> },
              { id: 'colour' as const, label: 'Colour', icon: <Palette size={17} /> },
              { id: 'audio' as const, label: 'Audio', icon: <AudioLines size={17} /> },
              { id: 'export' as const, label: 'Export', icon: <Download size={17} /> },
            ].map((t) => (
              <button key={t.id} type="button" onClick={() => setSheet(sheet === t.id ? null : t.id)} className={cx('flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', sheet === t.id ? 'text-accent' : 'text-fg-3')}>
                {t.icon}
                <span className="max-w-full truncate">{t.label}</span>
              </button>
            ))}
          </nav>
          {sheet && (
            <Sheet title={sheet === 'media' ? 'Add' : sheet === 'inspector' ? 'Edit' : sheet === 'colour' ? 'Colour' : sheet === 'audio' ? 'Audio' : 'Export'} onClose={() => setSheet(null)}>
              {sheet === 'media' ? (
                <div className="h-[50dvh]">{media}</div>
              ) : sheet === 'inspector' ? (
                <div className="flex max-h-[55dvh] flex-col">
                  <div className="flex gap-1.5 border-b border-line p-2">
                    <Button size="sm" variant="secondary" icon={<Scissors size={13} />} onClick={() => splitHere()}>
                      Split
                    </Button>
                    <Button size="sm" variant="secondary" disabled={!picked} onClick={() => remove(false)}>
                      Delete
                    </Button>
                    <Button size="sm" variant="secondary" onClick={addText}>
                      Words
                    </Button>
                    <Button size="sm" variant="secondary" onClick={addTransition}>
                      Transition
                    </Button>
                    <Button size="sm" variant="secondary" onClick={(ev) => moreMenu(ev.currentTarget)}>
                      More
                    </Button>
                  </div>
                  {inspector}
                </div>
              ) : sheet === 'colour' ? (
                <div className="max-h-[55dvh] overflow-y-auto p-3">
                  {pc ? <Inspector {...{ recipe: r, factsOf, picked, change, now, out, pool, main, fps, cropping, onCropping: setCropping, onColour: () => {}, onEditSound: editSound, onCaptions: () => void makeCaps(), captionsBusy, onSrt: downloadSrt, onVtt: downloadVtt, onImportCaptions: () => captionFile.current?.click(), onAddText: addText, label: o.title }} /> : <p className="text-[12.5px] text-fg-3">Pick a clip on the timeline to colour it.</p>}
                </div>
              ) : sheet === 'audio' ? (
                <div className="max-h-[55dvh] overflow-y-auto">
                  <AudioPage recipe={r} factsOf={factsOf} engine={engine} change={change} picked={picked} main={main} viewer={null} timeline={null} onEditSound={editSound} />
                </div>
              ) : (
                <div className="max-h-[70dvh] overflow-y-auto">{exportPage}</div>
              )}
            </Sheet>
          )}
          {floating}
        </div>
      </StepsContext.Provider>
    );

  // ---- a computer: the workspaces ---------------------------------------------------------------------------------------
  return (
    <StepsContext.Provider value={change}>
      <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} onPointerDownCapture={keepFocus} className="flex h-full min-h-0 flex-col bg-bg outline-none">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-bg px-2 pt-[var(--safe-top)]">
          {lead}
          <Clapperboard size={15} className="shrink-0 text-accent" />
          <MenuBar menus={menus} compact="auto" />
          {/* (its name is on its tab above too: here only where there is room beside the menus' names) */}
          <span translate="no" className="hidden max-w-[40%] min-w-0 shrink truncate text-[12.5px] text-fg-3 2xl:block">
            {o.title}
          </span>
          <WorkspaceTabs value={workspace} tabs={WORKSPACES} onChange={setWorkspace} />
          <span className="mx-1 h-5 w-px bg-line" />
          {saveButtons}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          {workspace === 'edit' && (
            <>
              <div className="flex min-h-0 flex-1">
                <div className="shrink-0" style={{ width: mediaW }}>
                  {media}
                </div>
                <Splitter dir="x" size={mediaW} onSize={setMediaW} min={180} max={480} />
                <div className="min-w-0 flex-1">{viewer()}</div>
                <Splitter dir="x" size={inspW} onSize={setInspW} min={240} max={480} side="after" />
                <div className="flex shrink-0 flex-col bg-panel" style={{ width: inspW }}>
                  <div className="flex h-8 shrink-0 items-center border-b border-line px-2.5 text-[12px] font-semibold text-fg-2">Inspector</div>
                  {inspector}
                </div>
              </div>
              <Splitter dir="y" size={timeH} onSize={setTimeH} min={170} max={620} side="after" />
              <div className="shrink-0" style={{ height: timeH }}>
                {timeline()}
              </div>
            </>
          )}
          {workspace === 'colour' && (
            <ColourPage
              recipe={r}
              factsOf={factsOf}
              engine={engine}
              change={change}
              picked={picked}
              onPick={setPicked}
              main={main}
              viewer={viewer({ split: true })}
              canvas={() => canvasRef.current}
              split={split}
              onSplit={setSplit}
            />
          )}
          {workspace === 'audio' && <AudioPage recipe={r} factsOf={factsOf} engine={engine} change={change} picked={picked} main={main} viewer={viewer()} timeline={timeline()} onEditSound={editSound} />}
          {workspace === 'export' && exportPage}
        </div>
        {status}
        {floating}
      </div>
    </StepsContext.Provider>
  );
}

/** A sheet from the bottom (a phone): its title, what it holds, and a way to close it. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[18px] border border-b-0 border-line bg-elevated pb-[var(--safe-bottom)] shadow-lg">
        <div className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-4">
          <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
