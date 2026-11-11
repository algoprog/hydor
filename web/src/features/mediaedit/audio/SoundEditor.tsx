// The sound editor, in a tab of its own (host.tsx), as Audition and Audacity lay theirs out: a menu bar (File, Edit,
// Effects, Generate, View, Help: the app's own menus, which also make the keys shown beside them work) with Undo, Redo,
// Save a copy and Save; the transport (play, stop, record, loop, the time, the part picked, snapping, zoom, the meter);
// the tracks as lanes (Tracks.tsx), each with a right-click menu (a long press on a phone) for what is under the
// pointer; a dock of panels (Effects, Properties, History, AI); and a status line. Sounds and videos dropped on it come
// in on the track they fall on, or a new one. J, K and L shuttle; the part picked's edges and splits snap to zero
// crossings and a time grid; the other tracks and the markers follow a deletion or a paste (as Audacity's sync-lock). Nothing of the sounds changes while editing: the edit is a recipe (shared/
// mediaedit-audio.ts) the browser plays as it will be (engine.ts) and the server makes with ffmpeg on Save, with its
// progress and a way to stop; then it goes back where it came from (a file, a Library sound, a video), or as a copy.
// On a phone: one track at a time, the transport at the bottom, the panels as sheets, the menus under one button.
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AudioLines, ChevronDown, Ellipsis, History as HistoryIcon, Plus, Redo2, SlidersHorizontal, Sparkles, Undo2, X } from 'lucide-react';
import {
  changeSpeed,
  clearRange,
  clipFade,
  clipEnd,
  clipLength,
  copyRange,
  deleteRange,
  deleteRanges,
  EFFECT_TYPES,
  EFFECTS,
  envRemove,
  envScale,
  envSlice,
  insertGap,
  isFiller,
  moveClip,
  newId,
  pasteAt,
  placeClip,
  rippleTracks,
  shortenPauses,
  silencesIn,
  SOUND_FORMATS,
  SOUND_RATES,
  soundClock,
  soundFormat,
  soundFormatOfName,
  soundLength,
  splitAt,
  trimClip,
  trimTo,
  wordsOnTrack,
  type EnvPoint,
  type SoundClip,
  type SoundClipboard,
  type SoundEditJob,
  type SoundEffect,
  type SoundEffectType,
  type SoundFacts,
  type SoundFormat,
  type SoundOutput,
  type SoundRecipe,
  type SoundSaveTo,
  type SoundTrack,
  type SoundWord,
} from '@shared/mediaedit-audio';
import { Button, cx, Dialog, Empty, IconButton, Segmented, Throbber, useIsMobile } from '../../../components/ui';
import { go } from '../../../lib/nav';
import { COPY_DRAG_KEY, NO_SNAP_KEY } from '../../pages/common/keys';
import { toast, toastError } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { useMedia } from '../../media/state';
import type { EditorProps, OpenEditor } from '../host';
import { makeClock } from '../video/clock';
import { ContextMenu, isMenuKey, isMod, MenuBar, runMenuKeys, shortcutGroups, ShortcutsDialog, type ContextMenuAt, type MenuAction, type MenuDef, type MenuEntry } from '../shell';
import { viaLink } from '../../../lib/machine';
import { keepSound, makeSoundEdit, readWords, soundFacts, startWords, stopSoundEdit, type MakeKind } from './api';
import { decodeBlob, decodeSound, measure, renderTrack, SoundPlayer, timeEffects, type Decoded } from './engine';
import { AddEffect, AiPanel, EffectsRack, GROUPS, HistoryList, Properties } from './panels';
import { useStepHistory } from './history';
import { startRecording, type Recorder } from './record';
import { cleanTempo, hop, TEMPO, zeroOnTrack, type Grid } from './snap';
import { HEAD, Tracks, type Marker, type MenuTarget, type Phase, type Picked, type Recording, type Sel } from './Tracks';
import { Transport } from './Transport';
import { DockPanel, Splitter, StatusBar, useRemembered, useWidth } from './ui';

/** What was copied, shared by every sound editor open (copy in one, paste in another). */
let clipboard: SoundClipboard | null = null;

interface Doc {
  recipe: SoundRecipe;
  markers: Marker[];
}

interface Source {
  d?: Decoded;
  progress: number;
  error?: string;
  name?: string;
}

const strip = <T extends object>(x: T): T => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as T;
const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;

// ---- where it is saved -----------------------------------------------------------------------------------------------

interface Plan {
  label: string;
  to: SoundSaveTo;
  says: string;
  /** Saved over a file, it keeps its kind. */
  fixed?: SoundFormat;
}

function soundPlans(o: OpenEditor, detached: boolean): { main: Plan; copy: Plan | null } {
  const lib: Plan = { label: 'Save to Library', to: { library: true, ...(o.session ? { session: o.session } : {}), title: o.title }, says: 'It is kept in your Library as a new sound.' };
  const to = o.to;
  if (to && 'sound' in to && !detached) return { main: { label: 'Save', to: { sound: true }, says: `Save puts it in ${o.from.label || 'the video'} as the video’s sound.`, fixed: 'm4a' }, copy: null };
  if (detached || !to || 'asset' in to) return { main: detached ? { ...lib, says: 'Where it came from is closed, so it is kept in your Library as a new sound.' } : lib, copy: null };
  if ('file' in to) {
    const kind = /\.(mp3|wav|flac|m4a|ogg|opus|oga)$/i.test(to.file) ? soundFormatOfName(to.file) : null;
    const beside: Plan = { label: 'Save a copy', to: { file: to.file, as: 'copy' }, says: `A copy is saved beside it, “${nameOf(to.file).replace(/\.[^.]+$/, '')} (edited)”.` };
    if (!kind) return { main: { ...beside, label: 'Save beside it' }, copy: null };
    return { main: { label: 'Save', to: { file: to.file, as: 'replace' }, says: `Save writes over ${nameOf(to.file)}; its old version goes to the Trash.`, fixed: kind }, copy: o.copy === false ? null : beside };
  }
  if ('media' in to)
    return {
      main: { label: 'Save', to: { media: to.media, as: 'replace' }, says: 'Save puts it in the Library in place of the sound it was (its title, project and folder stay).' },
      copy: o.copy === false ? null : { label: 'Save a copy', to: { media: to.media, as: 'copy' }, says: 'Save a copy keeps it in your Library as a new sound.' },
    };
  return { main: lib, copy: null };
}

// ---- the editor ----------------------------------------------------------------------------------------------------------

export function SoundEditor(p: EditorProps) {
  const [facts, setFacts] = useState<SoundFacts | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setFacts(null);
    setFailed(null);
    soundFacts(p.o.src).then(
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
        <Empty icon={<AudioLines size={20} />} title="This sound cannot be edited">
          <span translate="no">{failed}</span>
        </Empty>
      </div>
    );
  if (facts && (!facts.ffmpeg || !facts.duration))
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        {bar}
        <Empty icon={<AudioLines size={20} />} title="Sound editing needs ffmpeg">
          <p>Set up the picture tools in Settings → Images, video and audio (they bring ffmpeg with them), or install ffmpeg on this computer.</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => go('/settings?s=images')}>
            Open Settings → Images, video and audio
          </Button>
        </Empty>
      </div>
    );
  return facts ? <Editing {...p} facts={facts} /> : <Shell {...p} />;
}

/** The editor's frame while it learns what the sound is (a moment): its bars, and the lanes saying so. */
function Shell({ o, lead }: EditorProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2 pt-[var(--safe-top)]">
        {lead}
        <AudioLines size={15} className="text-fg-3" />
        <span translate="no" className="truncate text-[13px] font-semibold">
          {o.title}
        </span>
      </header>
      <div className="h-11 shrink-0 border-b border-line bg-bg-1" />
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[12.5px] text-fg-3">
        <Throbber size={14} /> Reading the sound
      </div>
    </div>
  );
}

function Editing({ o, active, detached, setDirty, done, lead, facts }: EditorProps & { facts: SoundFacts }) {
  const phone = useIsMobile();
  const [rootRef, rootW] = useWidth<HTMLDivElement>();
  const mobile = phone || (rootW > 0 && rootW < 820);
  const video = o.length !== undefined;
  const first = useMemo<Doc>(() => {
    const len = video ? o.length! : facts.duration!;
    return {
      recipe: { tracks: [{ id: 'main', name: o.title, clips: [{ id: newId(), src: '', at: 0, from: 0, to: Math.min(facts.duration!, len) }] }], ...(video ? { length: o.length } : {}) },
      markers: [],
    };
  }, []);
  const h = useStepHistory<Doc>(first, 'Opened');
  const doc = h.now;
  const r = doc.recipe;
  const L = soundLength(r);
  const clock = useMemo(() => makeClock(), []);
  const player = useMemo(() => new SoundPlayer(), []);
  useEffect(() => () => player.close(), [player]);

  // ---- the sounds, read into memory ----------------------------------------------------------------------------------
  const sources = useRef(new Map<string, Source>());
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const get = useCallback((src: string) => sources.current.get(src)?.d, []);
  const loading = useCallback((src: string) => {
    const s = sources.current.get(src);
    return s?.error ? null : (s?.progress ?? 0);
  }, []);
  const load = useCallback((src: string, f?: SoundFacts) => {
    if (sources.current.has(src)) return;
    const s: Source = { progress: 0 };
    sources.current.set(src, s);
    const real = src === '' ? o.src : src;
    void (async () => {
      try {
        const ff = f ?? (await soundFacts(real));
        s.d = await decodeSound(real, ff, (x) => {
          s.progress = x;
          bump();
        });
      } catch (e) {
        s.error = (e as Error).message;
      }
      bump();
    })();
  }, []);
  useEffect(() => load('', facts), []);
  useEffect(() => {
    for (const t of r.tracks) for (const c of t.clips) if (!sources.current.has(c.src)) load(c.src);
  }, [r]);
  const main = sources.current.get('');
  const R = main?.d?.rate ?? 48_000;
  const srcLength = (src: string) => (src === '' ? facts.duration : sources.current.get(src)?.d?.duration);

  // ---- what is picked, and the view ----------------------------------------------------------------------------------
  const [sel, setSel] = useState<Sel | null>(null);
  const [picked, pick] = useState<Picked | null>(null);
  const [lanesRef, lanesW] = useWidth<HTMLDivElement>();
  const laneW = Math.max(200, lanesW - (mobile ? 0 : HEAD));
  const [view, setView] = useState({ pps: 50, x0: 0 });
  const fitted = useRef(false);
  useLayoutEffect(() => {
    if (fitted.current || lanesW < 50) return;
    fitted.current = true;
    setView({ pps: laneW / Math.max(0.5, L * 1.02), x0: 0 });
  }, [lanesW]);
  const minPps = laneW / Math.max(0.5, L * 1.05);
  const zoomTo = (pps: number, at?: number) => {
    const z = Math.min(20000, Math.max(minPps, pps));
    const c = at ?? (clock.get() >= view.x0 && clock.get() <= view.x0 + laneW / view.pps ? clock.get() : view.x0 + laneW / view.pps / 2);
    const x = (c - view.x0) * view.pps;
    setView({ pps: z, x0: Math.max(0, c - x / z) });
  };
  const fit = () => setView({ pps: laneW / Math.max(0.5, L * 1.02), x0: 0 });
  const zoomSel = () => sel && setView({ pps: Math.min(20000, laneW / Math.max(0.01, (sel.b - sel.a) * 1.1)), x0: Math.max(0, sel.a - (sel.b - sel.a) * 0.05) });
  const [heights, setHeights] = useRemembered<Record<string, number>>(`heights:${o.src}`, {});
  const [modes, setModes] = useState<Record<string, 'wave' | 'spectrum'>>({});
  const [amp, setAmp] = useState(1);
  const [snap, setSnap] = useRemembered('snap', true);
  // The part picked's edges and splits go to the nearest zero crossing (cutting there does not click); a time grid to snap to.
  const [zero, setZero] = useRemembered('zero', true);
  const [grid, setGrid] = useRemembered<Grid>('grid', { kind: 'off' });
  // A deletion or a paste on some tracks moves every track and the markers with it (as Audacity's sync-lock).
  const [inStep, setInStep] = useRemembered('instep', true);
  const [loop, setLoop] = useState(false);
  const [dockW, setDockW] = useRemembered('dock', 300);
  const [sheet, setSheet] = useState<'effects' | 'props' | 'history' | 'ai' | null>(null);
  const [aiKind, setAiKind] = useState<MakeKind | undefined>(undefined);
  /** The right-click menu: where it is and what it is on. */
  const [ctx, setCtx] = useState<{ at: ContextMenuAt; what: MenuTarget } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [revealProps, setRevealProps] = useState(0);
  const [dropping, setDropping] = useState(false);

  // ---- playing -----------------------------------------------------------------------------------------------------
  const [playing, setPlaying] = useState(false);
  const startedAt = useRef(0);
  const gains = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of r.effects ?? []) {
      if (e.bypass || (e.type !== 'normalize' && e.type !== 'loudness')) continue;
      const tracks = e.track ? r.tracks.filter((t) => t.id === e.track) : r.tracks.filter((t) => !t.mute);
      const [a, b] = e.range ?? [0, L];
      if (b - a > 20 * 60 || !main?.d) continue;
      const m = measure(tracks, r, a, b, get, R);
      const p = EFFECTS[e.type].params[0];
      const target = Number(e.p?.[p.id] ?? p.default);
      out[e.id] = e.type === 'normalize' ? (Number.isFinite(m.peak) ? Math.min(40, target - m.peak) : 0) : m.lufs > -69 ? Math.min(40, target - m.lufs) : 0;
    }
    return out;
  }, [r, version > 0 && !!main?.d]);
  /** How fast and which way it plays (J and L shuttle: −4 to 4; 1 is as it is). */
  const [rate, setRate] = useState(1);
  const stop = useCallback((back?: boolean) => {
    player.stop();
    setPlaying(false);
    setRate(1);
    if (back) clock.set(startedAt.current);
  }, []);
  const play = async (o2: { sel?: boolean; from?: number; rate?: number } = {}) => {
    if (!main?.d) return;
    const useSel = o2.sel && sel;
    const rt = o2.rate ?? 1;
    let from = o2.from ?? (useSel ? sel!.a : clock.get());
    if (from >= L - 0.01 && !useSel && rt > 0) from = 0;
    if (rt < 0 && from <= 0.01) from = 0;
    startedAt.current = from;
    setRate(rt);
    player.onEnd = () => {
      setPlaying(false);
      clock.set(useSel ? sel!.b : Math.min(L, clock.get()));
    };
    await player.play(r, get, R, { from, ...(rt !== 1 ? { rate: rt } : {}), ...(useSel ? { to: sel!.b } : {}), ...(loop ? { loop: sel ? [sel.a, sel.b] : [0, L] } : {}) }, gains);
    setPlaying(player.playing);
    if (!player.playing) setRate(1);
  };
  const toggle = () => (playing ? stop() : void play());
  /** J (backwards) and L (forwards): faster each press, up to four times, like a tape; K (stop) is `stop`. */
  const shuttle = (dir: -1 | 1) => {
    if (!playing || Math.sign(rate) !== dir) return void play({ from: clock.get(), rate: dir });
    void play({ from: clock.get(), rate: Math.max(-4, Math.min(4, rate * 2)) });
  };
  // The playhead follows it (and the view, a page at a time).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      const t = player.time();
      if (t !== null) {
        clock.set(t);
        setView((v) => {
          const right = v.x0 + laneW / v.pps;
          return t > right || t < v.x0 ? { ...v, x0: Math.max(0, t - (laneW / v.pps) * 0.05) } : v;
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, laneW]);
  // What it plays changed: heard at once. A setting moved (an effect's slider, a track's volume or pan) is changed in the
  // running sound, which goes on without a break; anything else plays again from where it is.
  const lastR = useRef(r);
  useEffect(() => {
    if (lastR.current === r) return;
    lastR.current = r;
    if (!playing) return;
    if (player.refresh(r, gains)) return;
    const t = setTimeout(() => void play({ from: clock.get(), rate }), 120);
    return () => clearTimeout(t);
  }, [r]);
  useEffect(() => {
    if (!active && playing) stop();
  }, [active]);
  const seek = (t: number) => {
    const x = Math.max(0, Math.min(L, t));
    clock.set(x);
    if (playing) void play({ from: x });
  };

  // ---- changes -------------------------------------------------------------------------------------------------------
  const change = (label: string, f: (r: SoundRecipe) => SoundRecipe) => h.set(label, (d) => ({ ...d, recipe: f(d.recipe) }));
  const edited = (label: string, f: (r: SoundRecipe) => { recipe: SoundRecipe; map: (t: number) => number }) =>
    h.set(label, (d) => {
      const e = f(d.recipe);
      return { recipe: e.recipe, markers: d.markers.map((m) => ({ ...m, t: e.map(m.t) })) };
    });
  const allTracks = r.tracks.map((t) => t.id);
  /** The tracks an edit is made on: the part picked's, else the track picked, else all of them. */
  const scope = () => sel?.tracks ?? (picked ? [picked.track] : allTracks);
  const ripple = !video;
  /** The tracks a deletion or a paste on `tracks` moves what follows on: all of them while the tracks are kept in step. */
  const along = (x: SoundRecipe, tracks: string[]) => rippleTracks(x, tracks, ripple && inStep);
  const need = (what: string) => {
    if (!sel) toast(tr(`Pick a part first: drag across the waveform, then ${what}`), 'info');
    return !!sel;
  };
  const doDelete = () => {
    if (!sel && picked?.clip) return deleteClip(picked.track, picked.clip);
    if (!need('delete it')) return;
    const s = sel!;
    edited(ripple ? 'Delete' : 'Delete (silence left)', (x) => deleteRange(x, along(x, s.tracks), s.a, s.b, ripple));
    clock.set(s.a);
    setSel(null);
  };
  /** Ripple delete: the part's time is taken out of every track and the markers, whether or not the tracks are kept in step. */
  const doRippleDelete = () => {
    if (video) return;
    const s = sel ?? (picked?.clip ? clipSpan(picked.track, picked.clip) : null);
    if (!s) return void need('ripple delete it');
    edited('Ripple delete', (x) => deleteRange(x, allTracks, s.a, s.b, true));
    clock.set(s.a);
    setSel(null);
  };
  /** A clip's span as a part picked (for the actions that work on a part). */
  const clipSpan = (track: string, id: string): Sel | null => {
    const c = r.tracks.find((t) => t.id === track)?.clips.find((k) => k.id === id);
    return c ? { a: c.at, b: clipEnd(c), tracks: [track] } : null;
  };
  const doSilence = () => {
    if (!need('make it silent')) return;
    const s = sel!;
    change('Silence', (x) => clearRange(x, s.tracks, s.a, s.b));
  };
  const doCopy = () => {
    if (!need('copy it')) return false;
    clipboard = copyRange(r, sel!.tracks, sel!.a, sel!.b, o.src);
    toast(tr(`Copied ${soundClock(sel!.b - sel!.a, 2)}`), 'ok');
    return true;
  };
  const doCut = () => {
    if (!sel) return need('cut it');
    clipboard = copyRange(r, sel.tracks, sel.a, sel.b, o.src);
    const s = sel;
    edited('Cut', (x) => deleteRange(x, along(x, s.tracks), s.a, s.b, ripple));
    clock.set(s.a);
    setSel(null);
  };
  /** Paste: over the part picked (which it replaces), else at the playhead on the track picked; `where` (a right-click's place) says another. */
  const doPaste = (where?: { at: number; tracks: string[] }) => {
    const cb = clipboard;
    if (!cb) return toast(tr('Nothing is copied yet: pick a part, then Copy'), 'info');
    const s = where ? null : sel;
    const at = where ? where.at : s ? s.a : clock.get();
    const tracks = where?.tracks ?? s?.tracks ?? (picked ? [picked.track] : [r.tracks[0].id]);
    edited('Paste', (x) => {
      const cleared = s ? deleteRange(x, along(x, s.tracks), s.a, s.b, ripple) : { recipe: x, map: (t: number) => t };
      const pasted = pasteAt(cleared.recipe, tracks, at, cb, ripple, o.src, ripple && inStep);
      return { recipe: pasted.recipe, map: (t) => pasted.map(cleared.map(t)) };
    });
    for (const c of cb.tracks.flatMap((t) => t.clips)) if (c.src && c.src !== o.src) load(c.src);
    setSel({ a: at, b: at + cb.length, tracks });
    clock.set(at);
  };
  const doDuplicate = () => {
    if (!need('duplicate it') || video) return;
    const s = sel!;
    const cb = copyRange(r, s.tracks, s.a, s.b, o.src);
    edited('Duplicate', (x) => pasteAt(x, s.tracks, s.b, cb, true, o.src, inStep));
    setSel({ a: s.b, b: s.b + cb.length, tracks: s.tracks });
  };
  /** The nearest zero crossing of what a track plays at `t` (within 10 ms), when "Snap to zero crossings" is on. */
  const zeroOn = (x: SoundRecipe, track: string, t: number) => {
    const tk = x.tracks.find((k) => k.id === track);
    return zero && tk ? zeroOnTrack(tk, get, t, 0.01) : t;
  };
  /** Split the clips of the tracks in scope at the playhead (each at its own nearest zero crossing). */
  const doSplit = () => {
    const t = clock.get();
    change('Split', (x) => scope().reduce((acc, id) => splitAt(acc, [id], zeroOn(acc, id, t)), x));
  };
  /** Clips: the actions of a right-click on one (the span of the clip is the part they work on). */
  const copyClip = (track: string, id: string) => {
    const s = clipSpan(track, id);
    if (!s) return false;
    clipboard = copyRange(r, [track], s.a, s.b, o.src);
    toast(tr(`Copied ${soundClock(s.b - s.a, 2)}`), 'ok');
    return true;
  };
  const cutClip = (track: string, id: string) => {
    const s = clipSpan(track, id);
    if (!s || !copyClip(track, id)) return;
    edited('Cut', (x) => deleteRange(x, along(x, [track]), s.a, s.b, ripple));
    clock.set(s.a);
    pick({ track });
  };
  const duplicateClip = (track: string, id: string) => {
    const s = clipSpan(track, id);
    if (!s || video) return;
    const cb = copyRange(r, [track], s.a, s.b, o.src);
    edited('Duplicate', (x) => pasteAt(x, [track], s.b, cb, true, o.src, inStep));
  };
  /** A fade made with a click (the clip's menu): 0 takes it away. */
  const setFade = (track: string, id: string, which: 'in' | 'out', seconds: number) =>
    change(which === 'in' ? 'Fade in' : 'Fade out', (x) => ({
      ...x,
      tracks: x.tracks.map((t) => (t.id !== track ? t : { ...t, clips: t.clips.map((c) => (c.id !== id ? c : strip({ ...c, [which === 'in' ? 'fadeIn' : 'fadeOut']: seconds > 0 ? Math.min(seconds, clipLength(c) / 2) : undefined }))) })),
    }));
  const doTrim = () => {
    if (!need('trim to it')) return;
    const s = sel!;
    edited('Trim to the part picked', (x) => trimTo(x, s.a, s.b, ripple));
    setSel(null);
    clock.set(ripple ? 0 : s.a);
  };
  const deleteClip = (track: string, id: string) => {
    change('Delete a clip', (x) => ({ ...x, tracks: x.tracks.map((t) => (t.id === track ? { ...t, clips: t.clips.filter((c) => c.id !== id) } : t)) }));
    pick({ track });
  };
  const [dialog, setDialog] = useState<'silence' | 'speed' | 'pauses' | 'save' | 'keys' | 'tempo' | null>(null);
  const addMarker = (at?: number) => {
    const t = at ?? clock.get();
    h.set('Add a marker', (d) => ({ ...d, markers: [...d.markers, { id: newId(), t, name: tr(`Marker ${d.markers.length + 1}`) }].sort((a, b) => a.t - b.t) }));
  };
  /** The playhead to the marker or clip edge before (−1) or after (1) it. */
  const hopTo = (dir: -1 | 1) => {
    const t = hop(r, doc.markers.map((m) => m.t), clock.get(), dir, L);
    if (t !== null) seek(t);
  };
  const selectAll = () => setSel({ a: 0, b: L, tracks: allTracks });

  // Clips, tracks and effects.
  const findClip = (x: SoundRecipe, id: string) => {
    for (const t of x.tracks) {
      const c = t.clips.find((k) => k.id === id);
      if (c) return { t, c };
    }
    return null;
  };
  const onMoveClip = (_track: string, clip: string, toTrack: string, at: number, phase: Phase, copyOf?: string) => {
    const label = copyOf ? 'Copy a clip' : 'Move a clip';
    if (phase === 'begin') return h.begin(label);
    if (phase === 'end') return h.end();
    change(label, (x) => {
      const f = findClip(x, clip);
      if (f) return moveClip(x, f.t.id, clip, toTrack, at) ?? x;
      // A copy dragged (Ctrl, or ⌥ on a Mac): made where it is dropped, the original left where it was.
      const orig = copyOf ? findClip(x, copyOf) : null;
      const dest = x.tracks.find((t) => t.id === toTrack);
      if (!orig || !dest) return x;
      const dup: SoundClip = { ...orig.c, id: clip };
      const where = placeClip(dest.clips, dup, at, x.length);
      if (!Number.isFinite(where)) return x;
      return { ...x, tracks: x.tracks.map((t) => (t.id === toTrack ? { ...t, clips: [...t.clips, { ...dup, at: where }].sort((a, b) => a.at - b.at) } : t)) };
    });
  };
  /** A clip's volume line changed: a point added, moved or taken out (`undefined`: no line left); a drag is one step. */
  const onEnv = (track: string, clip: string, env: EnvPoint[] | undefined, phase: Phase, label: string) => {
    if (phase === 'begin') return h.begin(label);
    if (phase === 'end') return h.end();
    change(label, (x) => ({
      ...x,
      tracks: x.tracks.map((t) => (t.id !== track ? t : { ...t, clips: t.clips.map((c) => (c.id !== clip ? c : strip({ ...c, env }))) })),
    }));
  };
  const onTrimClip = (track: string, clip: string, edge: 'start' | 'end', t: number, phase: Phase) => {
    if (phase === 'begin') return h.begin('Trim a clip');
    if (phase === 'end') return h.end();
    change('Trim a clip', (x) => {
      const f = findClip(x, clip);
      return f ? trimClip(x, f.t.id, clip, edge, t, srcLength(f.c.src)) : x;
    });
    void track;
  };
  const onFade = (_track: string, clip: string, which: 'in' | 'out', seconds: number, phase: Phase) => {
    if (phase === 'begin') return h.begin('Fade a clip');
    if (phase === 'end') return h.end();
    change('Fade a clip', (x) => ({
      ...x,
      tracks: x.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clip) return c;
          const v = Math.max(0, Math.min(clipLength(c) / 2, seconds));
          return strip({ ...c, [which === 'in' ? 'fadeIn' : 'fadeOut']: v >= 0.005 ? Math.round(v * 1000) / 1000 : undefined });
        }),
      })),
    }));
  };
  const onClip = (track: string, id: string, patch: Partial<SoundClip>, label: string) =>
    change(label, (x) => {
      const t = x.tracks.find((k) => k.id === track);
      const c = t?.clips.find((k) => k.id === id);
      if (!t || !c) return x;
      if (patch.at !== undefined) return moveClip(x, track, id, track, patch.at) ?? x;
      const next = strip({ ...c, ...patch }) as SoundClip;
      if (next.to - next.from < 0.01) return x;
      // Its volume line follows its length: stretched with its speed, cut to what it plays.
      if (c.env && !('env' in patch)) {
        const e = envSlice(envScale(c.env, (c.speed ?? 1) / (next.speed ?? 1)), 0, clipLength(next));
        if (e) next.env = e;
        else delete next.env;
      }
      // A clip made longer (slower) moves the clips after it on its track along.
      const grow = clipEnd(next) - clipEnd(c);
      return {
        ...x,
        tracks: x.tracks.map((k) => (k.id !== track ? k : { ...k, clips: k.clips.map((y) => (y.id === id ? next : grow > 0 && y.at >= clipEnd(c) - 1e-6 ? { ...y, at: y.at + grow } : y)) })),
      };
    });
  const onTrack = (id: string, patch: Partial<SoundTrack>, label: string) => change(label, (x) => ({ ...x, tracks: x.tracks.map((t) => (t.id === id ? strip({ ...t, ...patch }) : t)) }));
  const addTrack = (clip?: SoundClip, name?: string) => {
    const id = newId();
    change(clip ? `Add ${name ?? 'a sound'}` : 'Add a track', (x) => ({ ...x, tracks: [...x.tracks, { id, name: name ?? tr(`Track ${x.tracks.length + 1}`), clips: clip ? [clip] : [] }] }));
    return id;
  };
  const deleteTrack = (id: string) => {
    change('Delete a track', (x) => ({ ...x, tracks: x.tracks.filter((t) => t.id !== id), effects: (x.effects ?? []).filter((e) => e.track !== id) }));
    if (picked?.track === id) pick(null);
    setSel(null);
  };
  const target = { tracks: sel?.tracks ?? (picked ? [picked.track] : null), range: sel ? ([sel.a, sel.b] as [number, number]) : null };
  const addEffect = (type: SoundEffectType, p?: Record<string, number>) => {
    if (video && type === 'reverse' && !target.range) return toast(tr('A video’s sound keeps its place: pick the part to reverse'), 'info');
    const list: SoundEffect[] = (target.tracks ?? [null]).map((t) => strip({ id: newId(), type, ...(p ? { p } : {}), ...(t ? { track: t } : {}), ...(target.range ? { range: target.range } : {}) }) as SoundEffect);
    change(EFFECTS[type].label, (x) => ({ ...x, effects: [...(x.effects ?? []), ...list] }));
    if (mobile) setSheet('effects');
  };
  const onEffect = (id: string, patch: Partial<SoundEffect>, label: string) => change(label, (x) => ({ ...x, effects: (x.effects ?? []).map((e) => (e.id === id ? (strip({ ...e, ...patch }) as SoundEffect) : e)) }));
  const removeEffect = (id: string) => change('Take out an effect', (x) => ({ ...x, effects: (x.effects ?? []).filter((e) => e.id !== id) }));
  const moveEffect = (id: string, to: number) =>
    change('Move an effect', (x) => {
      const all = x.effects ?? [];
      const e = all.find((k) => k.id === id);
      if (!e) return x;
      const same = all.filter((k) => k.track === e.track && k.id !== id);
      same.splice(Math.max(0, Math.min(same.length, to)), 0, e);
      let i = 0;
      return { ...x, effects: all.map((k) => (k.track === e.track ? same[i++] : k)) };
    });
  const trackName = (id: string) => r.tracks.find((t) => t.id === id)?.name || tr('Track');

  // Shorten pauses, insert silence, change speed.
  const [form, setForm] = useState({ silence: 1, speed: 110, longer: 0.8, keep: 0.4, threshold: -40 });
  const pauseTrack = picked?.track ?? sel?.tracks[0] ?? r.tracks[0].id;
  const doPauses = () => {
    const t = r.tracks.find((x) => x.id === pauseTrack);
    if (!t || !main?.d) return;
    // How loud the track is each hundredth of a second.
    const per = 100;
    const n = Math.ceil(L * per);
    const levels = new Float32Array(n);
    const fx = timeEffects(r, t);
    for (let s = 0; s < L; s += 1) {
      const len = Math.min(R, Math.ceil((L - s) * R));
      const x = renderTrack(t, fx, s, len, R, get);
      const step = R / per;
      for (let i = 0; i < len; i++) {
        const k = Math.floor(s * per + i / step);
        const v = Math.max(Math.abs(x[0][i]), Math.abs(x[1][i]));
        if (k < n && v > levels[k]) levels[k] = v;
      }
    }
    const found = silencesIn(levels, per, { threshold: form.threshold, min: form.longer });
    const e = shortenPauses(r, along(r, [t.id]), found, { longer: form.longer, keep: form.keep, ripple: true });
    if (!e.count) return toast(tr('No pause that long was found'), 'info');
    h.set('Shorten pauses', (d) => ({ recipe: e.recipe, markers: d.markers.map((m) => ({ ...m, t: e.map(m.t) })) }));
    toast(tr(`${e.count} pauses shortened: ${soundClock(e.removed, 1)} taken out`), 'ok');
  };

  // ---- words ---------------------------------------------------------------------------------------------------------
  const [words, setWords] = useState<Record<string, SoundWord[]>>({});
  const [wordsState, setWordsState] = useState<{ status: 'none' | 'running' | 'done' | 'failed'; progress?: number; error?: string }>({ status: 'none' });
  const [showWords, setShowWords] = useState(true);
  const wordTrack = r.tracks.find((t) => t.id === (picked?.track ?? sel?.tracks[0])) ?? r.tracks[0];
  const readTheWords = async () => {
    const srcs = [...new Set(wordTrack.clips.map((c) => c.src))].filter((s) => !words[s]);
    setWordsState({ status: 'running', progress: 0 });
    try {
      for (const s of srcs) {
        const real = s === '' ? o.src : s;
        let w = await startWords(real);
        while (w.status === 'running') {
          setWordsState({ status: 'running', progress: w.progress });
          await new Promise((res) => setTimeout(res, 1200));
          w = await readWords(real);
        }
        if (w.status !== 'done') throw new Error(w.error ?? 'The words could not be read');
        setWords((x) => ({ ...x, [s]: w.words ?? [] }));
      }
      setWordsState({ status: 'done' });
      setShowWords(true);
    } catch (e) {
      setWordsState({ status: 'failed', error: (e as Error).message });
    }
  };
  const trackWords = useCallback((t: SoundTrack) => (showWords && Object.keys(words).length ? wordsOnTrack(t, (s) => words[s]) : undefined), [showWords, words]);
  const wt = trackWords(wordTrack) ?? (Object.keys(words).length ? wordsOnTrack(wordTrack, (s) => words[s]) : []);
  const fillers = wt.filter((w) => isFiller(w.w));
  const removeFillers = () => {
    if (!fillers.length) return;
    edited(ripple ? 'Remove filler words' : 'Silence filler words', (x) =>
      deleteRanges(
        x,
        along(x, [wordTrack.id]),
        fillers.map((w) => [Math.max(0, w.a - 0.03), w.b + 0.03] as [number, number]),
        ripple,
      ),
    );
    toast(tr(`${fillers.length} filler words taken out`), 'ok');
  };
  const onWord = (track: string, w: { a: number; b: number }, extend: boolean) => {
    if (extend && sel && sel.tracks.includes(track)) setSel({ a: Math.min(sel.a, w.a), b: Math.max(sel.b, w.b), tracks: [track] });
    else setSel({ a: w.a, b: w.b, tracks: [track] });
    clock.set(w.a);
  };

  // ---- recording -----------------------------------------------------------------------------------------------------
  const [armed, setArmed] = useState<string | null>(null);
  const [rec, setRec] = useState<Recording | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const record = async () => {
    if (recorder.current) return finishRecording();
    try {
      const at = clock.get();
      const tr0 = armed;
      recorder.current = await startRecording();
      setRec({ track: tr0, at, seconds: 0, levels: [] });
      // The rest is heard while recording, from where it starts.
      if (main?.d && at < L - 0.05) void play({ from: at });
    } catch (e) {
      recorder.current = null;
      toastError(e);
    }
  };
  useEffect(() => {
    if (!rec || !recorder.current) return;
    const iv = setInterval(() => {
      const x = recorder.current;
      if (!x) return;
      setRec((s) => (s ? { ...s, seconds: x.seconds(), levels: [...s.levels, x.level()].slice(-4000) } : s));
    }, 100);
    return () => clearInterval(iv);
  }, [!!rec]);
  const finishRecording = async () => {
    const x = recorder.current;
    const s = rec;
    recorder.current = null;
    setRec(null);
    stop();
    if (!x || !s) return;
    try {
      const { blob, seconds } = await x.stop();
      if (seconds < 0.2) return;
      const name = tr(`Recording ${r.tracks.reduce((n, t) => n + t.clips.filter((c) => /^naget-sound:/.test(c.src)).length, 0) + 1}`);
      const [kept, d] = await Promise.all([keepSound(blob, name), decodeBlob(blob, R)]);
      sources.current.set(kept.src, { d, progress: 1, name });
      bump();
      const len = Math.min(kept.duration || d.duration, video ? Math.max(0, L - s.at) : Infinity);
      // The output's own delay: the recording starts that much later than it was heard.
      const lag = (player.ctx?.outputLatency ?? 0) + (player.ctx?.baseLatency ?? 0);
      const clip: SoundClip = { id: newId(), src: kept.src, name, at: Math.max(0, s.at), from: Math.min(lag, 0.5), to: Math.max(Math.min(lag, 0.5) + 0.05, len) };
      if (s.track && r.tracks.some((t) => t.id === s.track))
        change('Record', (x) => {
          const cleared = clearRange(x, [s.track!], clip.at, clip.at + clipLength(clip));
          return { ...cleared, tracks: cleared.tracks.map((t) => (t.id === s.track ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.at - b.at) } : t)) };
        });
      else addTrack(clip, name);
    } catch (e) {
      toastError(e);
    }
  };

  // ---- bringing sounds in ---------------------------------------------------------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  /** A sound put on a track of its own at the playhead, or (`where`) on this track at this time, where there is room for it. */
  const putSound = (src: string, name: string, seconds: number, d?: Decoded, where?: { track: string; at: number }) => {
    if (d) sources.current.set(src, { d, progress: 1, name });
    else load(src);
    const at = where?.at ?? clock.get();
    const len = video ? Math.max(0.05, Math.min(seconds, L - at)) : seconds;
    const clip: SoundClip = { id: newId(), src, name, at, from: 0, to: len };
    const dest = where && r.tracks.find((t) => t.id === where.track);
    if (dest) {
      const spot = placeClip(dest.clips, clip, at, r.length);
      if (Number.isFinite(spot)) {
        change(`Add ${name}`, (x) => ({ ...x, tracks: x.tracks.map((t) => (t.id === dest.id ? { ...t, clips: [...t.clips, { ...clip, at: spot }].sort((a2, b2) => a2.at - b2.at) } : t)) }));
        return pick({ track: dest.id, clip: clip.id });
      }
    }
    addTrack(clip, name);
  };
  const fromDevice = async (f: File, where?: { track: string; at: number }) => {
    try {
      const [kept, d] = await Promise.all([keepSound(f, f.name), decodeBlob(f, R).catch(() => undefined)]);
      putSound(kept.src, f.name.replace(/\.[^.]+$/, ''), kept.duration, d, where);
    } catch (e) {
      toastError(e);
    }
  };
  /** Sounds (and videos, for their sound) dropped on the editor: on a track, at that time on it; anywhere else, a new track at the playhead. */
  const dropFiles = (files: File[], x: number, y: number) => {
    const ok = files.filter((f) => /^(audio|video)\//.test(f.type) || /\.(mp3|wav|flac|m4a|aac|ogg|opus|oga|webm|mp4|mov)$/i.test(f.name));
    if (!ok.length) return toast(tr('Only sounds, or videos for their sound, can be dropped here'), 'info');
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-track]');
    const lane = row?.querySelector<HTMLElement>('[data-lane]');
    const where = row && lane && !video ? { track: row.dataset.track!, at: Math.max(0, view.x0 + (x - lane.getBoundingClientRect().left) / view.pps) } : undefined;
    ok.forEach((f, i) => void fromDevice(f, i === 0 ? where : undefined));
  };
  // ---- saving --------------------------------------------------------------------------------------------------------
  const plans = soundPlans(o, detached);
  const ownFormat: SoundFormat = plans.main.fixed ?? (facts.format && !facts.video ? facts.format : 'mp3');
  const [out, setOut] = useState<SoundOutput>({ format: ownFormat });
  const [saving, setSaving] = useState<{ what: string; job?: SoundEditJob; stopped?: boolean } | null>(null);
  const busy = !!saving;
  const jobRef = useRef<string | null>(null);
  // Changed since it was last saved (a copy counts: its work is kept), not since it was opened.
  const savedDoc = useRef<Doc>(first);
  const [savedTick, setSavedTick] = useState(0);
  useEffect(() => setDirty(h.now !== savedDoc.current), [h.now, savedTick]);
  const save = async (what: 'main' | 'copy') => {
    if (busy) return;
    stop();
    const plan = what === 'copy' && plans.copy ? plans.copy : plans.main;
    const o2: SoundOutput = 'sound' in plan.to ? { format: 'm4a', kbps: 256 } : what === 'main' && plans.main.fixed ? { ...out, format: plans.main.fixed } : out;
    setSaving({ what: what === 'copy' ? 'Making a copy' : 'Making the sound' });
    const saving0 = doc;
    try {
      const j = await makeSoundEdit({ src: o.src, recipe: r, out: o2, to: plan.to, ...(what === 'copy' ? {} : {}) }, (job) => {
        jobRef.current = job.job;
        setSaving((s) => (s ? { ...s, job } : s));
      });
      if (j.status === 'stopped') return toast(tr('Stopped: nothing was saved'), 'info');
      if (j.status !== 'done') return toastError(new Error(j.error ?? 'The sound could not be made'));
      savedDoc.current = saving0;
      setSavedTick((n) => n + 1);
      if (what === 'copy') return toast(j.path ? tr(`A copy is saved beside it: ${nameOf(j.path)}`) : tr('A copy is in your Library'), 'ok');
      await done({ kind: 'audio', src: j.src, media: j.media, path: j.path, mime: soundFormat(o2.format).mime, seconds: j.seconds, replaced: ('media' in plan.to && plan.to.as === 'replace') || ('file' in plan.to && plan.to.as === 'replace') });
    } catch (e) {
      toastError(e);
    } finally {
      jobRef.current = null;
      setSaving(null);
    }
  };
  const stopSaving = () => {
    if (jobRef.current) void stopSoundEdit(jobRef.current);
    setSaving((s) => (s ? { ...s, stopped: true } : s));
  };

  // ---- the menus -------------------------------------------------------------------------------------------------------
  const noVideo = (x: MenuAction): MenuAction => (video ? { ...x, disabled: true } : x);
  const canRecord = !busy;
  /** Each action once: the menu bar and the right-click menus are made from these, so they say the same words, keys and ticks. */
  const act = {
    cut: { label: 'Cut', keys: 'Ctrl+X', run: doCut } as MenuAction,
    copy: { label: 'Copy', keys: 'Ctrl+C', run: () => void doCopy() } as MenuAction,
    paste: { label: 'Paste', keys: 'Ctrl+V', run: () => doPaste() } as MenuAction,
    del: { label: video ? 'Delete (leaves silence)' : 'Delete', keys: 'Delete', run: doDelete } as MenuAction,
    ripple: noVideo({ label: 'Ripple delete', keys: 'Shift+Delete', run: doRippleDelete, also: 'close the gap every track markers' }),
    silence: { label: 'Silence', keys: 'Ctrl+L', run: doSilence } as MenuAction,
    duplicate: noVideo({ label: 'Duplicate', keys: 'Ctrl+D', run: doDuplicate }),
    split: { label: 'Split at the playhead', keys: 'S / Ctrl+I', run: doSplit } as MenuAction,
    trim: { label: 'Trim to the part picked', keys: 'Ctrl+T', run: doTrim } as MenuAction,
    zoomSel: { label: 'Zoom to the part picked', keys: 'Ctrl+E', run: zoomSel, disabled: !sel } as MenuAction,
    marker: { label: 'Add a marker', keys: 'M', run: () => addMarker() } as MenuAction,
    loop: { label: 'Loop', keys: 'Q', checked: loop, run: () => setLoop(!loop) } as MenuAction,
  };
  /** The effects, by group, as lists (for the Effects menu, and the right-click menu on the part picked). */
  const effectLists = (): MenuAction[] =>
    GROUPS.map((g) => ({
      label: g,
      items: [
        ...EFFECT_TYPES.filter((t) => EFFECTS[t].group === g).map((t): MenuAction => ({ label: EFFECTS[t].label, run: () => addEffect(t) })),
        ...(g === 'Time and pitch' ? [noVideo({ label: 'Change speed…', run: () => setDialog('speed') })] : []),
        ...(g === 'Clean up'
          ? [
              noVideo({ label: 'Shorten pauses…', run: () => setDialog('pauses') }),
              // Reading what is said runs on the owner's computer: not through someone's link.
              ...(viaLink ? [] : [{ label: 'Remove filler words', run: () => (fillers.length ? removeFillers() : (setAiKind(undefined), mobile ? setSheet('ai') : null, toast(tr('Read what is said first: AI → Read what is said'), 'info'))) }]),
            ]
          : []),
      ],
    }));
  const fadeList = (track: string, id: string, which: 'in' | 'out'): MenuAction[] => [
    { label: 'None', run: () => setFade(track, id, which, 0) },
    ...[0.1, 0.5, 1, 2, 5].map((sec): MenuAction => ({ label: `${sec} s`, run: () => setFade(track, id, which, sec) })),
  ];
  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: plans.main.label, keys: 'Ctrl+S', run: () => void save('main'), disabled: busy },
        plans.copy && { label: plans.copy.label, keys: 'Ctrl+Shift+S', run: () => void save('copy'), disabled: busy },
        { label: 'How it is saved…', run: () => setDialog('save') },
        '-',
        // At someone's link: only what they bring from their own device.
        !viaLink && { label: 'Add a sound from the Library…', run: () => setLibraryOpen(true) },
        { label: 'Add a sound from this device…', run: () => fileInput.current?.click() },
        { label: rec ? 'Stop recording' : 'Record', keys: 'R', run: () => void record() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', keys: 'Ctrl+Z', run: h.undo, disabled: !h.canUndo },
        { label: 'Redo', keys: 'Ctrl+Shift+Z / Ctrl+Y', run: h.redo, disabled: !h.canRedo },
        '-',
        act.cut,
        act.copy,
        act.paste,
        act.del,
        act.ripple,
        act.silence,
        act.duplicate,
        act.split,
        act.trim,
        noVideo({ label: 'Insert silence…', run: () => setDialog('silence') }),
        '-',
        { label: 'Select all', keys: 'Ctrl+A', run: selectAll },
        { label: 'Select none', keys: 'Esc', run: () => (setSel(null), pick(null)) },
        '-',
        act.marker,
        { label: 'Previous marker or clip edge', keys: '[', run: () => hopTo(-1) },
        { label: 'Next marker or clip edge', keys: ']', run: () => hopTo(1) },
        { label: 'Delete the markers', run: () => h.set('Delete the markers', (d) => ({ ...d, markers: [] })), disabled: !doc.markers.length },
        '-',
        { label: 'Add a track', run: () => void addTrack() },
      ],
    },
    {
      label: 'Effects',
      items: effectLists(),
    },
    {
      label: 'Generate',
      items: [
        noVideo({ label: 'Silence…', run: () => setDialog('silence') }),
        // At someone's link, nothing made with AI (it spends the owner's money).
        ...(viaLink
          ? []
          : [
              { label: 'Music with AI…', run: () => (setAiKind('music'), mobile && setSheet('ai')) },
              { label: 'A voice with AI…', run: () => (setAiKind('speech'), mobile && setSheet('ai')) },
              { label: 'A sound effect with AI…', run: () => (setAiKind('sound'), mobile && setSheet('ai')) },
            ]),
        { label: 'A recording', run: () => void record(), disabled: !canRecord },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom in', keys: '+', run: () => zoomTo(view.pps * 1.5) },
        { label: 'Zoom out', keys: '-', run: () => zoomTo(view.pps / 1.5) },
        act.zoomSel,
        { label: 'Zoom to fit', keys: 'Ctrl+F', run: fit },
        '-',
        // Taller waveforms are on Alt: Shift and the plus key are the zoom's (where + needs Shift, Shift++ is the zoom).
        { label: 'Taller waveforms', keys: 'Alt+=', run: () => setAmp((a) => Math.min(16, a * 1.5)) },
        { label: 'Shorter waveforms', keys: 'Alt+-', run: () => setAmp((a) => Math.max(1, a / 1.5)) },
        { label: 'Taller tracks', run: () => setHeights(Object.fromEntries(r.tracks.map((t) => [t.id, Math.min(360, (heights[t.id] ?? 104) + 32)]))) },
        { label: 'Shorter tracks', run: () => setHeights(Object.fromEntries(r.tracks.map((t) => [t.id, Math.max(56, (heights[t.id] ?? 104) - 32)]))) },
        { label: 'Spectrogram', checked: (modes[picked?.track ?? r.tracks[0].id] ?? 'wave') === 'spectrum', run: () => setModes((m) => ({ ...m, [picked?.track ?? r.tracks[0].id]: (m[picked?.track ?? r.tracks[0].id] ?? 'wave') === 'spectrum' ? 'wave' : 'spectrum' })) },
        { label: 'Show the words', checked: showWords, run: () => setShowWords(!showWords), disabled: !Object.keys(words).length },
        '-',
        { label: 'Snap', checked: snap, run: () => setSnap(!snap), also: 'magnet clips markers playhead' },
        { label: 'Snap to zero crossings', checked: zero, run: () => setZero(!zero), also: 'click cut edge silence wave' },
        {
          label: grid.kind === 'off' ? 'Grid' : grid.kind === 'seconds' ? 'Grid: seconds' : `Grid: beats at ${cleanTempo(grid.bpm)}`,
          also: 'time lines tempo beats bpm',
          items: [
            { label: 'Off', checked: grid.kind === 'off', run: () => setGrid({ kind: 'off' }) },
            { label: 'Seconds', checked: grid.kind === 'seconds', run: () => setGrid({ kind: 'seconds' }) },
            { label: 'Beats at a tempo', checked: grid.kind === 'beats', run: () => (setGrid({ kind: 'beats', bpm: grid.kind === 'beats' ? grid.bpm : TEMPO.default }), setDialog('tempo')) },
            { label: 'Set the tempo…', run: () => (setGrid({ kind: 'beats', bpm: grid.kind === 'beats' ? grid.bpm : TEMPO.default }), setDialog('tempo')) },
          ],
        },
        { label: 'Keep the tracks in step', checked: inStep, run: () => setInStep(!inStep), disabled: video, also: 'sync lock ripple markers follow' },
        '-',
        act.loop,
      ],
    },
    {
      label: 'Help',
      items: [{ label: 'Keyboard shortcuts', keys: 'Ctrl+/', run: () => setDialog('keys'), also: 'keys help' }],
    },
  ];

  // ---- the right-click menus -----------------------------------------------------------------------------------------------
  /** A right-click or a long press: the thing under it is picked, and its menu opens there. */
  const openMenu = (at: ContextMenuAt, what: MenuTarget) => {
    if (what.kind === 'clip') (setSel(null), pick({ track: what.track, clip: what.clip }));
    else if (what.kind === 'point') pick({ track: what.track, clip: what.clip });
    else if (what.kind === 'lane') (setSel(null), pick({ track: what.track }));
    else if (what.kind === 'sel') pick(null);
    setCtx({ at, what });
  };
  const ctxItems = (what: MenuTarget): MenuEntry[] => {
    switch (what.kind) {
      case 'clip': {
        const c = r.tracks.find((t) => t.id === what.track)?.clips.find((k) => k.id === what.clip);
        if (!c) return [];
        const inside = clock.get() > c.at + 0.005 && clock.get() < clipEnd(c) - 0.005;
        return [
          { label: 'Cut', keys: act.cut.keys, run: () => cutClip(what.track, what.clip) },
          { label: 'Copy', keys: act.copy.keys, run: () => void copyClip(what.track, what.clip) },
          { ...act.paste, run: () => doPaste({ at: clipEnd(c), tracks: [what.track] }), label: 'Paste after it', keys: undefined },
          '-',
          { ...act.split, disabled: !inside },
          { label: 'Duplicate', keys: act.duplicate.keys, disabled: video, run: () => duplicateClip(what.track, what.clip) },
          { label: video ? 'Delete (leaves silence)' : 'Delete', keys: 'Delete', danger: true, run: () => deleteClip(what.track, what.clip) },
          { ...act.ripple, label: 'Ripple delete', danger: true, run: () => clipSpan(what.track, what.clip) && edited('Ripple delete', (x) => deleteRange(x, allTracks, c.at, clipEnd(c), true)) },
          '-',
          { label: 'Fade in', checked: !!c.fadeIn, items: fadeList(what.track, what.clip, 'in') },
          { label: 'Fade out', checked: !!c.fadeOut, items: fadeList(what.track, what.clip, 'out') },
          { label: 'Smooth fades', checked: !!c.fadeSmooth, disabled: !c.fadeIn && !c.fadeOut, run: () => onClip(what.track, what.clip, { fadeSmooth: c.fadeSmooth ? undefined : true }, 'Fade shape') },
          { label: 'Reset the volume line', disabled: !c.env?.length, run: () => onEnv(what.track, what.clip, undefined, 'move', 'Reset the volume line') },
          '-',
          { label: 'Properties…', run: () => (mobile ? setSheet('props') : setRevealProps((n) => n + 1)) },
        ];
      }
      case 'point': {
        const c = r.tracks.find((t) => t.id === what.track)?.clips.find((k) => k.id === what.clip);
        if (!c?.env) return [];
        return [
          { label: 'Take out the point', danger: true, run: () => onEnv(what.track, what.clip, envRemove(c.env!, what.index), 'move', 'Take out a volume point') },
          { label: 'Reset the volume line', run: () => onEnv(what.track, what.clip, undefined, 'move', 'Reset the volume line') },
        ];
      }
      case 'sel':
        return [
          act.cut,
          act.copy,
          act.paste,
          act.del,
          act.ripple,
          act.silence,
          '-',
          act.trim,
          { label: 'Effects on it', items: effectLists() },
          '-',
          act.zoomSel,
          { label: 'Loop it', run: () => (setLoop(true), void play({ sel: true })) },
        ];
      case 'lane':
        return [
          { label: 'Paste here', keys: undefined, disabled: !clipboard, run: () => doPaste({ at: what.t, tracks: [what.track] }) },
          { label: 'Add a marker here', run: () => addMarker(what.t) },
          '-',
          { label: 'Add a track', run: () => void addTrack() },
        ];
      case 'ruler':
        return [
          { label: 'Add a marker', run: () => addMarker(what.t) },
          { label: 'Play from here', run: () => (clock.set(what.t), void play({ from: what.t })) },
        ];
      case 'marker': {
        const m = doc.markers.find((k) => k.id === what.id);
        if (!m) return [];
        return [
          { label: 'Rename', run: () => setRenaming(m.id) },
          { label: 'Delete', danger: true, run: () => h.set('Delete a marker', (d) => ({ ...d, markers: d.markers.filter((k) => k.id !== m.id) })) },
        ];
      }
    }
  };
  /** The menu key or Shift+F10: the menu for what is picked, in the middle of the lanes. */
  const menuFromKeyboard = () => {
    const el = lanesRef.current?.getBoundingClientRect();
    const at = { x: (el?.left ?? 200) + (el?.width ?? 400) / 2, y: (el?.top ?? 200) + Math.min(120, (el?.height ?? 200) / 2), keyed: true };
    if (sel) return setCtx({ at, what: { kind: 'sel', track: sel.tracks[0], t: sel.a } });
    if (picked?.clip) return setCtx({ at, what: { kind: 'clip', track: picked.track, clip: picked.clip, t: clock.get() } });
    setCtx({ at, what: { kind: 'lane', track: picked?.track ?? r.tracks[0].id, t: clock.get() } });
  };

  // ---- keys ------------------------------------------------------------------------------------------------------------
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const mod = isMod(ev);
    const k = ev.key.toLowerCase();
    if (k === 'escape' && !sel && !picked) return;
    if (mod && !ev.shiftKey && !ev.altKey && (k === 'k' || k === 'b' || k === '`')) return;
    ev.stopPropagation();
    const typing = (ev.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]');
    if (typing) return;
    if (isMenuKey(ev)) {
      ev.preventDefault();
      return menuFromKeyboard();
    }
    if (busy) return;
    // Space on a button presses that button.
    if (k === ' ' && !mod && (ev.target as HTMLElement).closest('button')) return;
    // What the menus show beside their actions.
    if (runMenuKeys(menus, ev)) return;
    if (mod || ev.altKey) return;
    const act2 = (f: () => void) => {
      ev.preventDefault();
      f();
    };
    // The keys that are in no menu.
    if (k === '?') return act2(() => setDialog('keys'));
    if (k === ' ') return act2(() => (ev.shiftKey ? void play({ sel: true }) : toggle()));
    if (k === 'j') return act2(() => shuttle(-1));
    if (k === 'k') return act2(() => stop());
    if (k === 'l') return act2(() => shuttle(1));
    if (k === 'home') return act2(() => seek(0));
    if (k === 'end') return act2(() => seek(L));
    if (k === 'arrowleft' || k === 'arrowright') return act2(() => seek(clock.get() + (k === 'arrowleft' ? -1 : 1) * (ev.shiftKey ? 5 : 1)));
  };
  // Shown in the list of keyboard shortcuts after the menus' own.
  const moreKeys = [
    {
      title: 'Playing',
      items: [
        ['Space', 'Play or pause'],
        ['Shift+Space', 'Play the part picked'],
        ['L', 'Play forwards; again for twice as fast, up to four times'],
        ['J', 'Play backwards; again for twice as fast, up to four times'],
        ['K', 'Stop'],
        ['Home / End', 'To the start or the end'],
        ['← / →', 'Move the playhead a second (with Shift, five)'],
      ] as [string, string][],
    },
    {
      title: 'On the tracks',
      items: [
        ['Esc', 'Pick nothing'],
        ['Menu key / Shift+F10', 'The right-click menu of what is picked'],
        ['Ctrl+wheel', 'Zoom in or out about the pointer'],
        ['Shift+wheel', 'Move along the time'],
        ['Shift+click', 'Make the part picked reach to here'],
        ['Double-click', 'Pick all of a clip, or take out a volume point'],
        ['Click the volume line', 'Add a point to it (a drag moves it)'],
        [`${COPY_DRAG_KEY}+drag`, 'Drag a copy of a clip'],
        [`${NO_SNAP_KEY}+drag`, 'Move, trim or pick without snapping'],
      ] as [string, string][],
    },
  ];
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) root.current?.focus({ preventScroll: true });
  }, [active]);

  // ---- the panels ------------------------------------------------------------------------------------------------------
  const drag = { begin: (l: string) => h.begin(l), end: h.end };
  const rack = (
    <EffectsRack recipe={r} target={target} sel={sel} onAdd={addEffect} onChange={onEffect} drag={drag} onRemove={removeEffect} onMove={moveEffect} trackName={trackName} video={video} />
  );
  const props = <Properties recipe={r} picked={picked} onClip={onClip} onTrack={onTrack} drag={drag} onDeleteClip={deleteClip} srcLength={srcLength} video={video} />;
  const hist = <HistoryList steps={h.steps} at={h.at} jump={h.jump} />;
  const ai = (
    <AiPanel
      at={clock.get()}
      kind={aiKind}
      onMade={(m, kind) => {
        putSound(m.src, m.name || (kind === 'music' ? tr('Music') : kind === 'speech' ? tr('Voice') : tr('Sound effect')), m.seconds);
        toast(m.cost ? tr(`Made with ${m.model}, about $${m.cost.toFixed(m.cost < 0.1 ? 3 : 2)}: it is on a new track`) : tr(`Made with ${m.model}: it is on a new track`), 'ok');
      }}
      words={{ ...wordsState, count: wt.length, fillers: fillers.length, track: wordTrack.name || tr('the first track') }}
      onReadWords={() => void readTheWords()}
      onFillers={removeFillers}
      showWords={showWords}
      setShowWords={setShowWords}
      video={video}
    />
  );
  const addFx = (
    <AddEffect onAdd={addEffect} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-fg-2 hover:bg-bg-2 hover:text-fg">
      <Plus size={12} /> Add
    </AddEffect>
  );

  const tracks = (
    <div ref={lanesRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Tracks
        recipe={r}
        view={view}
        setView={(v) => setView({ pps: Math.min(20000, Math.max(minPps, v.pps)), x0: Math.max(0, v.x0) })}
        length={L}
        sel={sel}
        setSel={setSel}
        picked={picked}
        pick={pick}
        get={get}
        loading={loading}
        version={version}
        heights={heights}
        setHeight={(id, hh) => setHeights({ ...heights, [id]: hh })}
        modes={modes}
        setMode={(id, m) => setModes((x) => ({ ...x, [id]: m }))}
        amp={amp}
        words={trackWords}
        clock={clock}
        seek={seek}
        snap={snap}
        zero={zero}
        grid={grid}
        markers={doc.markers}
        renaming={renaming}
        onMarkers={(label, f) => h.set(label, (d) => ({ ...d, markers: f(d.markers) }))}
        markerDrag={{ begin: () => h.begin('Move a marker'), end: h.end }}
        onMoveClip={onMoveClip}
        onTrimClip={onTrimClip}
        onFade={onFade}
        onEnv={onEnv}
        onMenu={(at, what) => openMenu(at, what)}
        onTrack={onTrack}
        trackDrag={drag}
        onDeleteTrack={deleteTrack}
        onAddTrack={() => void addTrack()}
        armed={armed}
        arm={setArmed}
        recording={rec}
        onWord={onWord}
        mobile={mobile}
      />
    </div>
  );
  const transport = (
    <Transport
      clock={clock}
      playing={playing}
      recording={!!rec}
      loop={loop}
      snap={snap}
      length={L}
      sel={sel}
      onPlay={toggle}
      onStop={() => stop(true)}
      onRecord={() => void record()}
      onLoop={() => setLoop(!loop)}
      onSnap={() => setSnap(!snap)}
      onStart={() => seek(0)}
      onEnd={() => seek(L)}
      onSel={(a, b) => setSel(b - a > 0.0005 ? { a, b, tracks: sel?.tracks ?? allTracks } : null)}
      zoom={{ pps: view.pps, min: minPps, max: 20000, set: (z) => zoomTo(z), fit }}
      player={player}
      canRecord={!busy}
      mobile={mobile}
    />
  );
  const decoding = main && !main.d && !main.error ? `Reading the sound · ${Math.round(main.progress * 100)}%` : main?.error ? `This browser could not read it: ${main.error}` : null;
  const fmt = SOUND_FORMATS.find((f) => f.id === (plans.main.fixed ?? out.format))!;
  const status = (
    <StatusBar>
      {decoding ? (
        <span className={cx('flex items-center gap-1.5', main?.error ? 'text-warn' : 'text-fg-2')}>
          {!main?.error && <Throbber size={11} />}
          {decoding}
        </span>
      ) : (
        <span className="tnum">{`${(main?.d?.rate ?? facts.rate ?? 0).toLocaleString()} Hz${main?.d && facts.rate && main.d.rate !== facts.rate ? ` (${facts.rate.toLocaleString()} Hz saved)` : ''}`}</span>
      )}
      <span>{(facts.channels ?? 2) > 1 ? 'Stereo' : 'Mono'}</span>
      <span className="tnum">{`${soundClock(L, 2)} long${video ? ', as the video' : ''}`}</span>
      <span className="min-w-0 truncate">{video ? 'Saved as M4A, 256 kbps' : `Saved as ${fmt.label}${fmt.kbps ? `, ${out.kbps ?? fmt.kbpsDefault} kbps` : out.bits === 24 ? ', 24-bit' : ''}${out.channels ? `, ${out.channels === 1 ? 'mono' : 'stereo'}` : ''}`}</span>
      <span className="min-w-0 flex-1 truncate">{plans.main.says}</span>
      {playing && <span className="text-accent">{rate === 1 ? 'Playing' : rate < 0 ? `Backwards ×${-rate}` : `Playing ×${rate}`}</span>}
      {rec && <span className="text-err">Recording</span>}
    </StatusBar>
  );
  const head = (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-bg px-1.5 pt-[var(--safe-top)] sm:px-2">
      {lead}
      <AudioLines size={15} className="ml-1 shrink-0 text-accent" />
      <span translate="no" className={cx('min-w-0 truncate px-1 text-[13px] font-semibold', mobile ? 'flex-1' : 'max-w-[14rem]')}>
        {o.title}
      </span>
      {mobile ? (
        <>
          <span className="flex-1" />
          <MenuBar menus={menus} compact />
        </>
      ) : (
        <>
          <MenuBar menus={menus} compact="auto" />
          <span className="min-w-2 flex-1" />
        </>
      )}
      <IconButton label="Undo (Ctrl+Z)" size="sm" disabled={!h.canUndo || busy} onClick={h.undo}>
        <Undo2 size={16} />
      </IconButton>
      <IconButton label="Redo (Ctrl+Shift+Z)" size="sm" disabled={!h.canRedo || busy} onClick={h.redo}>
        <Redo2 size={16} />
      </IconButton>
      {!mobile && plans.copy && (
        <Button size="sm" variant="secondary" className="ml-1 h-7.5" disabled={busy} onClick={() => void save('copy')}>
          {plans.copy.label}
        </Button>
      )}
      <div className="ml-1 flex shrink-0">
        <Button size="sm" variant="primary" className="h-7.5 rounded-r-none pr-2.5" disabled={busy} onClick={() => void save('main')}>
          {plans.main.label}
        </Button>
        <button type="button" disabled={busy} onClick={() => setDialog('save')} aria-label="How it is saved" title="How it is saved" className="flex h-7.5 items-center rounded-r-[10px] border-l border-black/15 bg-accent px-1.5 text-accent-fg hover:opacity-90 disabled:opacity-45">
          <ChevronDown size={14} />
        </button>
      </div>
    </header>
  );

  return (
    <div
      ref={(el) => {
        root.current = el;
        (rootRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        if (!busy) dropFiles([...e.dataTransfer.files], e.clientX, e.clientY);
      }}
      className={cx('relative flex h-full min-h-0 flex-col bg-bg outline-none', dropping && 'ring-2 ring-accent ring-inset')}
    >
      {head}
      {saving && <Making saving={saving} onStop={stopSaving} />}
      <ContextMenu at={ctx?.at ?? null} items={ctx ? ctxItems(ctx.what) : []} onClose={() => setCtx(null)} />
      <ShortcutsDialog open={dialog === 'keys'} onClose={() => setDialog(null)} groups={shortcutGroups(menus, moreKeys)} />
      {!mobile && transport}
      <div className="flex min-h-0 flex-1">
        {tracks}
        {!mobile && (
          <>
            <Splitter width={dockW} min={240} max={520} onSize={setDockW} />
            <aside className="flex min-h-0 shrink-0 flex-col overflow-y-auto border-l border-line bg-panel" style={{ width: dockW }}>
              <DockPanel id="effects" title="Effects" icon={<SlidersHorizontal size={12} />} aside={addFx}>
                {rack}
              </DockPanel>
              <DockPanel id="props" title="Properties" icon={<Ellipsis size={12} />} reveal={revealProps}>
                {props}
              </DockPanel>
              <DockPanel id="history" title="History" icon={<HistoryIcon size={12} />}>
                {hist}
              </DockPanel>
              {!viaLink && (
                <DockPanel id="ai" title="AI" icon={<Sparkles size={12} />}>
                  {ai}
                </DockPanel>
              )}
            </aside>
          </>
        )}
      </div>
      {mobile && (
        <>
          {transport}
          <nav className="flex shrink-0 border-t border-line bg-bg pb-[var(--safe-bottom)]" aria-label="Panels">
            {(
              [
                ['effects', 'Effects', <SlidersHorizontal size={16} key="e" />],
                ['props', 'Clip', <Ellipsis size={16} key="p" />],
                ['history', 'History', <HistoryIcon size={16} key="h" />],
                ['ai', 'AI', <Sparkles size={16} key="a" />],
              ] as const
            )
              .filter(([id]) => !viaLink || id !== 'ai')
              .map(([id, label, icon]) => (
                <button key={id} type="button" onClick={() => setSheet(sheet === id ? null : id)} className={cx('flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', sheet === id ? 'text-accent' : 'text-fg-3')}>
                  {icon}
                  {label}
                </button>
              ))}
          </nav>
          {sheet && (
            <Sheet title={sheet === 'effects' ? 'Effects' : sheet === 'props' ? 'Properties' : sheet === 'history' ? 'History' : 'AI'} onClose={() => setSheet(null)} aside={sheet === 'effects' ? addFx : undefined}>
              {sheet === 'effects' ? rack : sheet === 'props' ? props : sheet === 'history' ? hist : ai}
            </Sheet>
          )}
        </>
      )}
      {!mobile && status}
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,video/mp4,video/quicktime,video/webm,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.webm,.mp4,.mov"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void fromDevice(f);
        }}
      />
      <LibraryPicker open={libraryOpen} onClose={() => setLibraryOpen(false)} onPick={(m) => (setLibraryOpen(false), putSound(`media:${m.id}`, m.title, m.duration ?? 0))} />
      <Dialog open={dialog === 'silence'} onClose={() => setDialog(null)} title="Insert silence" width={360} footer={<DialogButtons onCancel={() => setDialog(null)} onOk={() => (setDialog(null), edited('Insert silence', (x) => insertGap(x, along(x, scope()), clock.get(), form.silence)))} ok="Insert" />}>
        <p className="mb-2 text-[12.5px] text-fg-3">{`At the playhead (${soundClock(clock.get(), 2)}), on ${sel ? 'the tracks picked' : picked ? trackName(picked.track) : 'every track'}: what follows moves on.`}</p>
        <NumberRow label="Length" unit="s" value={form.silence} min={0.01} max={600} step={0.1} onChange={(v) => setForm({ ...form, silence: v })} />
      </Dialog>
      <Dialog
        open={dialog === 'speed'}
        onClose={() => setDialog(null)}
        title="Change speed"
        width={380}
        footer={
          <DialogButtons
            onCancel={() => setDialog(null)}
            onOk={() => {
              setDialog(null);
              const [a, b] = sel ? [sel.a, sel.b] : [0, L];
              edited(`Speed ${form.speed}%`, (x) => changeSpeed(x, scope(), a, b, form.speed / 100));
              if (sel) setSel({ ...sel, b: sel.a + (sel.b - sel.a) / (form.speed / 100) });
            }}
            ok="Change it"
          />
        }
      >
        <p className="mb-2 text-[12.5px] text-fg-3">{`${sel ? 'The part picked' : 'All of it'} plays faster or slower, its pitch kept; what follows moves to fit.`}</p>
        <NumberRow label="Speed" unit="%" value={form.speed} min={25} max={400} step={1} onChange={(v) => setForm({ ...form, speed: v })} />
      </Dialog>
      <Dialog open={dialog === 'pauses'} onClose={() => setDialog(null)} title="Shorten pauses" width={400} footer={<DialogButtons onCancel={() => setDialog(null)} onOk={() => (setDialog(null), doPauses())} ok="Shorten them" />}>
        <p className="mb-2 text-[12.5px] text-fg-3">{`On ${trackName(pauseTrack)}: each pause longer than this keeps this much, and the rest is taken out.`}</p>
        <div className="space-y-2">
          <NumberRow label="Pauses longer than" unit="s" value={form.longer} min={0.2} max={10} step={0.1} onChange={(v) => setForm({ ...form, longer: v })} />
          <NumberRow label="Keep of each" unit="s" value={form.keep} min={0} max={5} step={0.05} onChange={(v) => setForm({ ...form, keep: Math.min(v, form.longer) })} />
          <NumberRow label="Quieter than" unit="dB" value={form.threshold} min={-80} max={-10} step={1} onChange={(v) => setForm({ ...form, threshold: v })} />
        </div>
      </Dialog>
      <Dialog open={dialog === 'tempo'} onClose={() => setDialog(null)} title="Grid tempo" width={360} footer={<DialogButtons onOk={() => setDialog(null)} ok="Done" />}>
        <p className="mb-2 text-[12.5px] text-fg-3">The grid has a line at every beat (a heavier one at the start of each bar of four); picked parts, clips and markers snap to the lines while Snap is on.</p>
        <NumberRow label="Tempo" unit="bpm" value={grid.kind === 'beats' ? cleanTempo(grid.bpm) : TEMPO.default} min={TEMPO.min} max={TEMPO.max} step={1} onChange={(v) => setGrid({ kind: 'beats', bpm: cleanTempo(v) })} />
      </Dialog>
      <Dialog open={dialog === 'save'} onClose={() => setDialog(null)} title="How it is saved" width={440} footer={<DialogButtons onOk={() => setDialog(null)} ok="Done" />}>
        <SaveOptions out={out} setOut={setOut} fixed={plans.main.fixed} hasCopy={!!plans.copy} says={[plans.main.says, plans.copy?.says].filter((x): x is string => !!x)} video={video} />
      </Dialog>
    </div>
  );
}

function DialogButtons({ onCancel, onOk, ok }: { onCancel?: () => void; onOk: () => void; ok: string }) {
  return (
    <div className="flex justify-end gap-2">
      {onCancel && (
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
      <Button size="sm" variant="primary" onClick={onOk}>
        {ok}
      </Button>
    </div>
  );
}

function NumberRow({ label, unit, value, min, max, step, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-[13px]">
      <span className="min-w-0 flex-1 text-fg-2">{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} className="tnum h-8 w-24 rounded-lg border border-line bg-bg-1 px-2 text-right outline-none focus:border-accent" />
      <span className="w-6 text-[12px] text-fg-3">{unit}</span>
    </label>
  );
}

function SaveOptions({ out, setOut, fixed, hasCopy, says, video }: { out: SoundOutput; setOut: (o: SoundOutput) => void; fixed?: SoundFormat; hasCopy: boolean; says: string[]; video: boolean }) {
  const f = SOUND_FORMATS.find((x) => x.id === out.format)!;
  return (
    <div className="space-y-3.5">
      {video ? (
        <p className="text-[12.5px] leading-snug text-fg-2">It is made an M4A (AAC, 256 kbps), exactly as long as the video, for the video to play.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="text-[12px] font-medium text-fg-3">{fixed ? (hasCopy ? 'Kind of file, for a copy' : 'Kind of file') : 'Kind of file'}</div>
            <Segmented<SoundFormat> size="sm" value={out.format} onChange={(v) => setOut({ ...out, format: v, kbps: undefined, bits: undefined })} options={SOUND_FORMATS.map((x) => ({ value: x.id, label: x.label.replace(/ \(.+\)$/, '') }))} />
            <p className="text-[12px] text-fg-3">{f.note}</p>
          </div>
          {f.kbps ? (
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-fg-3">Quality</div>
              <Segmented<string> size="sm" value={String(out.kbps ?? f.kbpsDefault)} onChange={(v) => setOut({ ...out, kbps: Number(v) })} options={f.kbps.map((k) => ({ value: String(k), label: `${k} kbps` }))} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-fg-3">Bits a sample</div>
              <Segmented<string> size="sm" value={String(out.bits ?? 16)} onChange={(v) => setOut({ ...out, bits: v === '24' ? 24 : undefined })} options={[{ value: '16', label: '16-bit' }, { value: '24', label: '24-bit' }]} />
            </div>
          )}
          <div className="space-y-1.5">
            <div className="text-[12px] font-medium text-fg-3">Channels</div>
            <Segmented<string> size="sm" value={String(out.channels ?? 0)} onChange={(v) => setOut({ ...out, channels: v === '1' ? 1 : v === '2' ? 2 : undefined })} options={[{ value: '0', label: 'As it is' }, { value: '1', label: 'Mono' }, { value: '2', label: 'Stereo' }]} />
          </div>
          <div className="space-y-1.5">
            <div className="text-[12px] font-medium text-fg-3">Sample rate</div>
            <select value={out.rate ?? 0} onChange={(e) => setOut({ ...out, rate: Number(e.target.value) || undefined })} className="h-8 rounded-lg border border-line bg-bg-1 px-2 text-[12.5px] outline-none" aria-label="Sample rate">
              <option value={0}>As it is</option>
              {SOUND_RATES.map((x) => (
                <option key={x} value={x}>{`${x.toLocaleString()} Hz`}</option>
              ))}
            </select>
          </div>
          {fixed && <p className="text-[12.5px] leading-snug text-fg-2">{`Saved over it, it keeps its kind (${SOUND_FORMATS.find((x) => x.id === fixed)!.label}).`}</p>}
        </>
      )}
      <div className="space-y-1 border-t border-line pt-2.5 text-[12px] leading-snug text-fg-3">
        {says.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
    </div>
  );
}

/** How far the server is: a bar under the header, with a way to stop. */
function Making({ saving, onStop }: { saving: { what: string; job?: SoundEditJob; stopped?: boolean }; onStop: () => void }) {
  const j = saving.job;
  const pct = j?.status === 'running' && j.progress !== undefined ? Math.round(j.progress * 100) : null;
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-bg-1 px-3 text-[12px] text-fg-2">
      <Throbber size={12} />
      <span className="min-w-0 truncate">{saving.stopped ? 'Stopping' : j?.status === 'queued' ? 'Waiting for the edits before it' : `${j?.step ?? saving.what}${pct !== null ? ` · ${pct}%` : ''}`}</span>
      <div className="h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-bg-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <Button size="sm" variant="ghost" icon={<X size={12} />} disabled={saving.stopped} onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}

/** A panel as a sheet from the bottom (a phone). */
function Sheet({ title, onClose, aside, children }: { title: string; onClose: () => void; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex max-h-[62dvh] flex-col rounded-t-[18px] border border-b-0 border-line bg-elevated shadow-lg">
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <span className="min-w-0 flex-1 text-[14px] font-semibold">{title}</span>
        {aside}
        <IconButton label="Close" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(12px,var(--safe-bottom))]">{children}</div>
    </div>
  );
}

/** The Library's sounds, to put one on a track of its own. */
function LibraryPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: { id: string; title: string; duration?: number }) => void }) {
  const items = useMedia((s) => s.items);
  useEffect(() => {
    if (open) useMedia.getState().ensure();
  }, [open]);
  const sounds = (items ?? []).filter((m) => m.kind === 'audio');
  return (
    <Dialog open={open} onClose={onClose} title="Add a sound from the Library" width={460}>
      {sounds.length ? (
        <div className="max-h-[50dvh] space-y-0.5 overflow-y-auto">
          {sounds.map((m) => (
            <button key={m.id} type="button" onClick={() => onPick(m)} className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-bg-2">
              <AudioLines size={14} className="shrink-0 text-fg-3" />
              <span translate="no" className="min-w-0 flex-1 truncate text-[13px] text-fg">
                {m.title}
              </span>
              {m.duration ? <span className="tnum shrink-0 text-[11.5px] text-fg-3">{soundClock(m.duration, 0)}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-fg-3">No sounds in your Library yet. Keep one an agent made (Save to Library, under it), or drop one on the Library.</p>
      )}
    </Dialog>
  );
}
