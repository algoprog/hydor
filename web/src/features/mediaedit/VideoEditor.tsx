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
import {
  captionsSrt,
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
} from '@shared/mediaedit-video';
import { Button, cx, Empty, IconButton, Throbber, useIsMobile } from '../../components/ui';
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
import { MediaPanel } from './video/MediaPanel';
import {
  canDetach,
  clipAtTime,
  clipFor,
  deleteClip,
  deleteItem,
  detachSound,
  freezeFrame,
  insertClip,
  pickedThing,
  setClip,
  setOverlay,
  splitClip,
  splitItem,
  tidy,
  withIds,
  type Edit,
  type Picked,
  type PoolItem,
} from './video/model';
import { ContextMenu, MenuBar, StatusBar, Splitter, StepsContext, useRemembered, WorkspaceTabs, type MenuDef, type MenuEntry } from './video/shell';
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
  const [picked, setPicked] = useState<Picked>(null);
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
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuEntry[] } | null>(null);
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

  // A picked thing that is gone is no longer picked; nothing is cropped once its clip is gone.
  useEffect(() => {
    if (picked && !pickedThing(r, picked)) setPicked(null);
    if (cropping && !r.clips?.some((c) => c.id === cropping.id)) setCropping(null);
  }, [r, picked, cropping]);

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
  const splitHere = () => {
    const t = clock.get();
    if (picked && picked.kind !== 'clip' && picked.kind !== 'transition') return change((x) => splitItem(x, factsOf, picked.kind as 'overlay' | 'text' | 'audio', picked.id, t));
    const at = clipAtTime(r, factsOf, t, true);
    if (at) change((x) => splitClip(x, factsOf, at.clip.id!, t));
  };
  const remove = (ripple: boolean) => {
    if (!picked) return;
    if (picked.kind === 'clip') {
      if ((r.clips ?? []).length < 2) return toast(tr('That is the only clip: add another first, or split it and delete a part'), 'info');
      change((x) => deleteClip(x, factsOf, picked.id, { ripple }));
    } else if (picked.kind === 'transition') change((x) => setClip(x, picked.id, (c) => ({ ...c, transition: undefined })));
    else change((x) => deleteItem(x, factsOf, picked.kind as 'overlay' | 'text' | 'audio', picked.id, { ripple }));
    setPicked(null);
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
  const downloadSrt = () => {
    const caps = (r.texts ?? []).filter((t) => t.caption);
    const text = captionsSrt(caps.length ? caps : (r.texts ?? []));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/x-subrip' }));
    a.download = `${stemOf(o.title) || 'captions'}.srt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const captionsCtl = useRef<AbortController | null>(null);
  const makeCaps = async () => {
    if (captionsBusy) return;
    setCaptionsBusy(tr('Listening to the video…'));
    const ac = new AbortController();
    captionsCtl.current = ac;
    try {
      const recipe = normalizeVideoRecipe(r, factsOf);
      const res = await makeCaptions({ src: o.src, recipe, lang: navigator.language }, ac.signal);
      if (!res.captions.length) return toast(tr('No speech was heard in it, so there are no captions to make'), 'info');
      const style = CAPTION_STYLES[0].set;
      change((x) => ({ ...x, texts: [...(x.texts ?? []).filter((t) => !t.caption), ...res.captions.map((c) => ({ id: videoId(), text: c.text, from: c.from, to: c.to, x: 0.5, y: style.y, size: style.size, color: style.color, background: style.background, bold: style.bold || undefined, caption: true }))] }));
      toast(tr(`${res.captions.length} captions made: change them on the T1 track`), 'ok');
    } catch (err) {
      if (!ac.signal.aborted) toastError(err);
    } finally {
      setCaptionsBusy(null);
      captionsCtl.current = null;
    }
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
  const pcFacts = pc ? factsOf(pc.src) : undefined;
  const setPc = (patch: Record<string, unknown>) => pc && change((x) => setClip(x, pc.id!, (c) => ({ ...c, ...patch })));
  const clipMenu = (c: NonNullable<typeof pc>): MenuEntry[] => {
    const f = factsOf(c.src);
    const still = isStill(c) || !!f?.picture;
    return [
      { label: 'Split at the playhead', keys: 'S', onClick: splitHere },
      { label: 'Delete', keys: 'Del', onClick: () => remove(false) },
      { label: 'Ripple delete', keys: 'Shift+Del', onClick: () => remove(true) },
      { label: 'Half speed', sep: true, disabled: still, checked: c.speed === 0.5, onClick: () => change((x) => setClip(x, c.id!, (y) => ({ ...y, speed: 0.5 }))) },
      { label: 'Normal speed', disabled: still, checked: !c.speed, onClick: () => change((x) => setClip(x, c.id!, (y) => ({ ...y, speed: undefined }))) },
      { label: 'Twice as fast', disabled: still, checked: c.speed === 2, onClick: () => change((x) => setClip(x, c.id!, (y) => ({ ...y, speed: 2 }))) },
      { label: 'Play it backwards', disabled: still, checked: !!c.reverse, onClick: () => change((x) => setClip(x, c.id!, (y) => ({ ...y, reverse: !y.reverse || undefined }))) },
      { label: 'Hold this frame', disabled: still, onClick: () => change((x) => freezeFrame(x, factsOf, c.id!, clock.get())) },
      { label: 'Steady it (stabilize)', disabled: still, checked: !!c.stabilize, onClick: () => change((x) => setClip(x, c.id!, (y) => ({ ...y, stabilize: !y.stabilize || undefined }))) },
      { label: 'Detach the sound', sep: true, disabled: !canDetach(c, f), onClick: () => change((x) => detachSound(x, factsOf, c.id!, main)) },
      { label: 'Edit the sound…', disabled: !soundEditor() || still || (!f?.audio && !c.sound), onClick: () => editSound({ src: c.sound ?? c.src ?? main, title: c.name ?? 'Clip', from: c.trim?.[0], to: c.trim?.[1], save: (src) => change((x) => setClip(x, c.id!, (y) => ({ ...y, sound: src, mute: undefined }))) }) },
      { label: c.fit === 'fill' ? 'Fit it in the frame' : 'Fill the frame with it', sep: true, onClick: () => change((x) => setClip(x, c.id!, (y) => ({ ...y, fit: y.fit === 'fill' ? undefined : 'fill' }))) },
      { label: 'Colour…', onClick: () => setWorkspace('colour') },
    ];
  };
  const onMenu = (at: { x: number; y: number }, p: Picked, t: number) => {
    let items: MenuEntry[] = [];
    if (p?.kind === 'clip') {
      const c = (r.clips ?? []).find((x) => x.id === p.id);
      if (c) items = clipMenu(c);
    } else if (p?.kind === 'transition')
      items = [...VIDEO_TRANSITIONS.map((k) => ({ label: k.label, checked: (r.clips ?? []).find((c) => c.id === p.id)?.transition?.kind === k.id, onClick: () => change((x) => setClip(x, p.id, (c) => ({ ...c, transition: { kind: k.id, length: c.transition?.length ?? 1 } }))) })), { label: 'A cut (no transition)', sep: true, onClick: () => change((x) => setClip(x, p.id, (c) => ({ ...c, transition: undefined }))) }];
    else if (p) {
      const kind = p.kind as 'overlay' | 'text' | 'audio';
      items = [
        { label: 'Split at the playhead', keys: 'S', onClick: () => change((x) => splitItem(x, factsOf, kind, p.id, clock.get())) },
        { label: 'Delete', keys: 'Del', onClick: () => (change((x) => deleteItem(x, factsOf, kind, p.id)), setPicked(null)) },
        { label: 'Ripple delete', keys: 'Shift+Del', onClick: () => (change((x) => deleteItem(x, factsOf, kind, p.id, { ripple: true })), setPicked(null)) },
      ];
      if (kind === 'overlay') {
        const ov = (r.overlays ?? []).find((x) => x.id === p.id);
        items.push({ label: ov?.key ? 'No green screen' : 'Green screen: take the green out', sep: true, onClick: () => change((x) => setOverlay(x, p.id, (y) => ({ ...y, key: y.key ? undefined : { color: '#00ff00', similarity: 0.3, blend: 0.1 } }))) });
      }
      if (kind === 'audio') {
        const a = (r.audio ?? []).find((x) => x.id === p.id);
        if (a) items.push({ label: 'Edit the sound…', sep: true, disabled: !soundEditor(), onClick: () => editSound({ src: a.src, title: a.name ?? 'Sound', from: a.trim?.[0], to: a.trim?.[1], save: (src) => change((x) => ({ ...x, audio: (x.audio ?? []).map((y) => (y.id === a.id ? { ...y, src } : y)) })) }) });
      }
    } else
      items = [
        { label: 'Add a marker here', keys: 'M', onClick: () => h.set((x) => ({ ...x, markers: [...x.markers, t].sort((a, b) => a - b) })) },
        { label: 'Add words here', onClick: () => (engine.seek(t), addText()) },
        { label: 'Mark In here', keys: 'I', onClick: () => setInOut([t, inOut[1]]) },
        { label: 'Mark Out here', keys: 'O', onClick: () => setInOut([inOut[0], t]) },
      ];
    setMenu({ at, items });
  };

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: plans.main.label, keys: 'Ctrl+S', disabled: busy, onClick: () => void run('main') },
        ...(plans.copy ? [{ label: plans.copy.label, disabled: busy, onClick: () => void run('copy') }] : []),
        { label: 'Export…', keys: 'Alt+4', onClick: () => setWorkspace('export') },
        { label: 'Take this frame as a picture', sep: true, disabled: busy, onClick: () => void run('frame') },
        { label: 'Save as a GIF', disabled: busy, onClick: () => void run('gif') },
        ...(o.to && 'asset' in o.to && !detached ? [{ label: 'Use this frame as its still', onClick: () => h.set((x) => ({ ...x, stillAt: clock.get() })) }] : []),
        { label: 'Save the captions as .srt', disabled: !(r.texts ?? []).length, onClick: downloadSrt },
        { label: 'Close', sep: true, onClick: close },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', keys: 'Ctrl+Z', disabled: !h.canUndo || busy, onClick: h.undo },
        { label: 'Redo', keys: 'Ctrl+Shift+Z', disabled: !h.canRedo || busy, onClick: h.redo },
        { label: 'Split at the playhead', keys: 'S', sep: true, onClick: splitHere },
        { label: 'Delete', keys: 'Del', disabled: !picked, onClick: () => remove(false) },
        { label: 'Ripple delete', keys: 'Shift+Del', disabled: !picked, onClick: () => remove(true) },
        { label: 'Back to the original', sep: true, disabled: !changed, onClick: () => (setPicked(null), setCropping(null), h.set({ recipe: withIds({ clips: [{ name: o.title }] }), markers: [] })) },
      ],
    },
    {
      label: 'Clip',
      items: pc
        ? clipMenu(pc)
        : [
            { label: 'Add words at the playhead', onClick: addText },
            { label: 'Make captions from what is said', onClick: () => void makeCaps() },
            { label: 'Pick a clip on the timeline for more', disabled: true },
          ],
    },
    {
      label: 'Timeline',
      items: [
        { label: 'Add a marker', keys: 'M', onClick: () => h.set((x) => ({ ...x, markers: [...x.markers, clock.get()].sort((a, b) => a - b) })) },
        { label: 'Mark In', keys: 'I', onClick: () => setInOut([clock.get(), inOut[1]]) },
        { label: 'Mark Out', keys: 'O', onClick: () => setInOut([inOut[0], clock.get()]) },
        { label: 'Clear In and Out', keys: 'Alt+X', disabled: inOut[0] === null && inOut[1] === null, onClick: () => setInOut([null, null]) },
        { label: 'Add a transition at the nearest cut', keys: 'Ctrl+T', sep: true, onClick: addTransition },
        { label: 'Add words at the playhead', onClick: addText },
        { label: 'Snapping', keys: 'N', sep: true, checked: snapOn, onClick: () => setSnapOn(!snapOn) },
        { label: 'Select', keys: 'A', checked: tool === 'select', onClick: () => setTool('select') },
        { label: 'Blade', keys: 'B', checked: tool === 'blade', onClick: () => setTool('blade') },
        { label: 'Trim (roll)', keys: 'T', checked: tool === 'trim', onClick: () => setTool('trim') },
        { label: 'Hand', keys: 'H', checked: tool === 'hand', onClick: () => setTool('hand') },
        { label: 'Zoom in', keys: '+', sep: true, onClick: () => setPps(Math.min(600, pps * 1.5)) },
        { label: 'Zoom out', keys: '−', onClick: () => setPps(Math.max(2, pps / 1.5)) },
      ],
    },
    {
      label: 'View',
      items: [
        ...WORKSPACES.map((w) => ({ label: w.label, keys: w.keys, checked: workspace === w.id, onClick: () => setWorkspace(w.id) })),
        { label: 'Safe areas', sep: true, checked: safe, onClick: () => setSafe(!safe) },
        { label: 'Grid of thirds', checked: grid, onClick: () => setGrid(!grid) },
        { label: 'Before and after', checked: split !== null, onClick: () => setSplit(split === null ? 0.5 : null) },
        { label: 'Fit in the viewer', sep: true, checked: zoom === 'fit', onClick: () => setZoom('fit') },
        { label: '100%', checked: zoom === 1, onClick: () => setZoom(1) },
      ],
    },
  ];

  // ---- keys -------------------------------------------------------------------------------------------------------------
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (k === 'escape') {
      if (cropping) setCropping(null);
      else setPicked(null);
      return;
    }
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
    if (typing || mod || ev.altKey || busy) return;
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
    } else if (ev.key === 'Home') engine.seek(0);
    else if (ev.key === 'End') engine.seek(length);
    else if (k === 'i') setInOut([clock.get(), inOut[1] !== null && inOut[1] <= clock.get() ? null : inOut[1]]);
    else if (k === 'o') setInOut([inOut[0] !== null && inOut[0] >= clock.get() ? null : inOut[0], clock.get()]);
    else if (k === 'm') h.set((x) => ({ ...x, markers: [...x.markers, clock.get()].sort((a, b) => a - b) }));
    else if (k === 'n') setSnapOn(!snapOn);
    else if (k === 'a' || k === 'v') setTool('select');
    else if (k === 'b') setTool('blade');
    else if (k === 't') setTool('trim');
    else if (k === 'h') setTool('hand');
    else if (k === 's') splitHere();
    else if (ev.key === '+' || ev.key === '=') setPps(Math.min(600, pps * 1.5));
    else if (ev.key === '-' || ev.key === '_') setPps(Math.max(2, pps / 1.5));
    else if (ev.key === 'Z') setPps(Math.max(2, Math.min(600, ((root.current?.clientWidth ?? 1000) - 200) / Math.max(1, length))));
    else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      remove(ev.shiftKey);
    }
  };
  useEffect(() => {
    if (active) root.current?.focus({ preventScroll: true });
  }, [active]);

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
      picked={picked}
      onPick={setPicked}
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
      onDrop={(it, row, t, index) => use(it, row, t, index)}
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
        ) : last?.status === 'done' ? (
          <span>{last.made?.gpu ? `Made on the graphics card (${last.made.by})` : 'Made on the processor'}</span>
        ) : undefined
      }
    />
  );

  // ---- a phone: the viewer, the main track, and the rest in sheets ----------------------------------------------------
  if (mobile)
    return (
      <StepsContext.Provider value={change}>
        <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col bg-bg outline-none">
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-1.5 pt-[var(--safe-top)]">
            {lead}
            <span translate="no" className="min-w-0 flex-1 truncate px-1 text-[14px] font-semibold">
              {o.title}
            </span>
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
                    <Button size="sm" variant="secondary" icon={<Scissors size={13} />} onClick={splitHere}>
                      Split
                    </Button>
                    <Button size="sm" variant="secondary" disabled={!picked} onClick={() => remove(true)}>
                      Delete
                    </Button>
                    <Button size="sm" variant="secondary" onClick={addText}>
                      Words
                    </Button>
                    <Button size="sm" variant="secondary" onClick={addTransition}>
                      Transition
                    </Button>
                  </div>
                  {inspector}
                </div>
              ) : sheet === 'colour' ? (
                <div className="max-h-[55dvh] overflow-y-auto p-3">
                  {pc ? <Inspector {...{ recipe: r, factsOf, picked, change, now, out, pool, main, fps, cropping, onCropping: setCropping, onColour: () => {}, onEditSound: editSound, onCaptions: () => void makeCaps(), captionsBusy, onSrt: downloadSrt, onAddText: addText, label: o.title }} /> : <p className="text-[12.5px] text-fg-3">Pick a clip on the timeline to colour it.</p>}
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
          <ContextMenu at={menu?.at ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
        </div>
      </StepsContext.Provider>
    );

  // ---- a computer: the workspaces ---------------------------------------------------------------------------------------
  return (
    <StepsContext.Provider value={change}>
      <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col bg-bg outline-none">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-bg px-2 pt-[var(--safe-top)]">
          {lead}
          <Clapperboard size={15} className="shrink-0 text-accent" />
          <MenuBar menus={menus} />
          <span translate="no" className="min-w-0 flex-1 truncate text-center text-[12.5px] text-fg-3">
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
        <ContextMenu at={menu?.at ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
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
