// The video editor's panels, one a tool: Trim (the part kept, the parts cut out, the speed), Crop (a shape, turning and
// mirroring), Text (titles and captions: their words, size, colour, what is behind them, where and when they show),
// Adjust (brightness, contrast, saturation, and the fades) and Sound (its own sound's volume, or none, and music from
// the Library under it, with its volume and where it starts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, Music, Pause, Play, Plus, RotateCcw, RotateCw, Trash2, TrianglesCenterlineDashedHorizontal, TrianglesCenterlineDashedVertical, Undo2, X } from 'lucide-react';
import { editedLength, keptParts, toEdited, toOriginal, turnedSize, VIDEO_SHAPES, VIDEO_SPEEDS, videoClock, type VideoCrop, type VideoRecipe, type VideoShape, type VideoText } from '@shared/mediaedit-video';
import type { MediaItem } from '@shared/media';
import { Button, cx, IconButton, inputCls, Switch } from '../../../components/ui';
import { mu } from '../../../lib/machine';
import { useMedia } from '../../media/state';
import { tr } from '../../../i18n/runtime';
import type { Clock } from './clock';

export type Tool = 'trim' | 'crop' | 'text' | 'adjust' | 'sound';

/** A change to the recipe: one step of undo, or while a slider moves, one step for all of it (begin, then end). */
export interface Change {
  (f: (r: VideoRecipe) => VideoRecipe): void;
  begin(): void;
  end(): void;
}

export function Group({ title, children, className, aside }: { title?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <div className={cx('space-y-2', className)}>
      {(title || aside) && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-[12px] font-medium text-fg-3">{title}</div>
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}

/** A slider with its name and value; a double click puts it back to `zero`. A drag is one step of undo. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  change,
  zero = 0,
  show,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  change: Pick<Change, 'begin' | 'end'>;
  zero?: number;
  show?: (v: number) => string;
}) {
  const shown = show ? show(value) : min < 0 && value > 0 ? `+${value}` : `${value}`;
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-[12.5px]">
        <span className="min-w-0 flex-1 truncate text-fg-2">{label}</span>
        <span className={cx('tnum shrink-0', value === zero ? 'text-fg-3' : 'text-fg')}>{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={change.begin}
        onPointerUp={change.end}
        onKeyDown={change.begin}
        onKeyUp={change.end}
        onBlur={change.end}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(zero)}
        aria-label={label}
        className="mt-1 block h-5 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

/** A button of a grid of choices: its icon over its name, picked or not. */
function Choice({ on, onClick, icon, label, title }: { on?: boolean; onClick: () => void; icon: ReactNode; label: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cx(
        'flex min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border px-1 py-1.5 text-[11.5px] leading-tight transition-colors',
        on ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2 hover:text-fg',
      )}
    >
      <span className="flex h-5 items-center justify-center">{icon}</span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

/** "1:05.3", "65.3" or "1:02:03" as seconds; null for anything else. */
export function readClock(s: string): number | null {
  const parts = s.trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((x) => !/^\d+(?:[.,]\d+)?$/.test(x))) return null;
  return parts.reduce((n, x) => n * 60 + Number(x.replace(',', '.')), 0);
}

/**
 * A time to type ("1:05.3"), and a button that puts it at the playhead. `edited`: shown and typed as a time of the edited
 * video (as the time under the picture is), kept as the original's.
 */
function TimeField({ label, value, onChange, clock, min = 0, max, edited }: { label: string; value: number; onChange: (t: number) => void; clock: Clock; min?: number; max: number; edited?: { parts: [number, number][]; speed: number } }) {
  const shown = edited ? toEdited(value, edited.parts, edited.speed) : value;
  const [text, setText] = useState(videoClock(shown));
  useEffect(() => {
    setText(videoClock(shown));
  }, [shown]);
  const take = () => {
    const t = readClock(text);
    if (t === null) return setText(videoClock(shown));
    onChange(Math.min(max, Math.max(min, edited ? toOriginal(t, edited.parts, edited.speed) : t)));
  };
  return (
    <label className="flex items-center gap-2 text-[12.5px]">
      <span className="w-20 shrink-0 text-fg-2">{label}</span>
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={take} onKeyDown={(e) => e.key === 'Enter' && take()} className={cx(inputCls, 'tnum h-8 min-w-0 flex-1 px-2 text-[13px]')} aria-label={label} />
      <IconButton label="At the playhead" size="sm" onClick={() => onChange(Math.min(max, Math.max(min, clock.get())))}>
        <ArrowDownToLine size={14} />
      </IconButton>
    </label>
  );
}

const strip = (r: VideoRecipe): VideoRecipe => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as VideoRecipe;

// ---- Trim --------------------------------------------------------------------------------------------------------

export function TrimPanel({ r, change, duration, clock }: { r: VideoRecipe; change: Change; duration: number; clock: Clock }) {
  const [a, b] = r.trim ?? [0, duration];
  const length = editedLength(r, duration);
  const setTrim = (t: [number, number]) => change((x) => strip({ ...x, trim: t[0] <= 0.001 && t[1] >= duration - 0.001 ? undefined : t }));
  return (
    <div className="space-y-5">
      <Group title="The part kept">
        <TimeField label="Starts at" value={a} max={b - 0.2} onChange={(t) => setTrim([t, b])} clock={clock} />
        <TimeField label="Ends at" value={b} min={a + 0.2} max={duration} onChange={(t) => setTrim([a, t])} clock={clock} />
        <p className="text-[12px] leading-snug text-fg-3">
          Drag the handles at the ends of the timeline, or type the times (of the whole video). The edited video is <span className="tnum font-medium text-fg-2">{videoClock(length)}</span> long.
        </p>
      </Group>
      <Group title="Parts cut out">
        {r.cuts?.length ? (
          <div className="space-y-1">
            {r.cuts.map(([s, e], i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-bg-2 py-1 pr-1 pl-2.5 text-[12.5px]">
                <span className="tnum min-w-0 flex-1 text-fg-2">{`${videoClock(s)} to ${videoClock(e)}`}</span>
                <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} onClick={() => change((x) => strip({ ...x, cuts: (x.cuts ?? []).filter((_, j) => j !== i) }))}>
                  Put back
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] leading-snug text-fg-3">To take a part out, split at its start and its end (S), then delete the part between (Delete).</p>
        )}
      </Group>
      <Group title="Speed">
        <div className="grid grid-cols-5 gap-1.5">
          {VIDEO_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => change((x) => strip({ ...x, speed: s === 1 ? undefined : s }))}
              aria-pressed={(r.speed ?? 1) === s}
              className={cx('tnum h-8 rounded-lg border text-[12.5px] font-medium transition-colors', (r.speed ?? 1) === s ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}
            >
              {`${s}×`}
            </button>
          ))}
        </div>
        <p className="text-[12px] leading-snug text-fg-3">Its sound keeps its pitch.</p>
      </Group>
    </div>
  );
}

// ---- Crop ---------------------------------------------------------------------------------------------------------

const SHAPE_NAMES: Record<VideoShape, string> = { free: 'Free', '16:9': '16:9', '9:16': '9:16', '1:1': 'Square', '4:5': '4:5' };

function ShapeIcon({ shape }: { shape: VideoShape }) {
  if (shape === 'free') return <span className="h-3.5 w-4.5 rounded-[3px] border-[1.5px] border-dashed border-current" />;
  const [w, h] = shape.split(':').map(Number);
  const k = 16 / Math.max(w, h);
  return <span className="rounded-[3px] border-[1.5px] border-current" style={{ width: Math.round(w * k), height: Math.round(h * k) }} />;
}

export function CropPanel({
  r,
  w,
  h,
  shape,
  onShape,
  onTurn,
  onMirror,
  onReset,
}: {
  r: VideoRecipe;
  w: number;
  h: number;
  shape: VideoShape;
  onShape: (s: VideoShape) => void;
  onTurn: (by: 90 | -90) => void;
  onMirror: (k: 'flipH' | 'flipV') => void;
  onReset: () => void;
}) {
  const up = turnedSize(w, h, r.rotate);
  const c: VideoCrop = r.crop ?? { x: 0, y: 0, w: up.w, h: up.h };
  return (
    <div className="space-y-5">
      <Group title="Shape" aside={<span className="tnum text-[11.5px] text-fg-3">{`${c.w} × ${c.h}`}</span>}>
        <div className="grid grid-cols-5 gap-1.5">
          {VIDEO_SHAPES.map((s) => (
            <Choice key={s} on={shape === s} onClick={() => onShape(s)} icon={<ShapeIcon shape={s} />} label={SHAPE_NAMES[s]} />
          ))}
        </div>
        <p className="text-[12px] leading-snug text-fg-3">Drag the box, or its corners and sides.</p>
      </Group>
      <Group title="Turn and mirror">
        <div className="grid grid-cols-2 gap-1.5">
          <Choice onClick={() => onTurn(-90)} icon={<RotateCcw size={16} />} label="Turn left" />
          <Choice onClick={() => onTurn(90)} icon={<RotateCw size={16} />} label="Turn right" />
          <Choice on={!!r.flipH} onClick={() => onMirror('flipH')} icon={<TrianglesCenterlineDashedVertical size={16} />} label="Mirror" title="Mirror it left to right" />
          <Choice on={!!r.flipV} onClick={() => onMirror('flipV')} icon={<TrianglesCenterlineDashedHorizontal size={16} />} label="Upside down" />
        </div>
      </Group>
      {(r.crop || r.rotate || r.flipH || r.flipV) && (
        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={onReset}>
          The whole picture, as it was
        </Button>
      )}
    </div>
  );
}

// ---- Text ---------------------------------------------------------------------------------------------------------

const COLOURS = ['#ffffff', '#111111', '#ffd60a', '#ff453a', '#0a84ff', '#30d158'];
const BEHIND: { id: string; label: string; bg?: string }[] = [
  { id: 'none', label: 'Nothing' },
  { id: 'dark', label: 'A dark box', bg: '#000000a6' },
  { id: 'light', label: 'A light box', bg: '#ffffffd9' },
];
const PLACES: { label: string; y: number }[] = [
  { label: 'Top', y: 0.12 },
  { label: 'Middle', y: 0.5 },
  { label: 'Bottom', y: 0.86 },
];

/** A new text at the playhead, for three seconds, near the bottom. */
export function newText(t: number, duration: number): VideoText {
  const from = Math.min(Math.max(0, t), Math.max(0, duration - 0.5));
  return { text: tr('Your words'), from, to: Math.min(duration, from + 3), x: 0.5, y: 0.86, size: 0.07, color: '#ffffff', background: '#000000a6', bold: true };
}

export function TextPanel({ r, change, picked, onPick, onAdd, clock, duration }: { r: VideoRecipe; change: Change; picked: number | null; onPick: (i: number | null) => void; onAdd: () => void; clock: Clock; duration: number }) {
  const texts = r.texts ?? [];
  const t = picked !== null ? texts[picked] : undefined;
  const set = (patch: Partial<VideoText>) => picked !== null && change((x) => ({ ...x, texts: (x.texts ?? []).map((y, i) => (i === picked ? { ...y, ...patch } : y)) }));
  const remove = () => {
    if (picked === null) return;
    change((x) => strip({ ...x, texts: (x.texts ?? []).filter((_, i) => i !== picked) }));
    onPick(null);
  };
  const behind = BEHIND.find((b) => b.bg === t?.background)?.id ?? (t?.background ? 'other' : 'none');
  const shift = useMemo(() => ({ parts: keptParts(r, duration), speed: r.speed ?? 1 }), [r, duration]);
  return (
    <div className="space-y-5">
      <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={onAdd} className="w-full">
        Add words at the playhead
      </Button>
      {texts.length > 1 && (
        <div className="space-y-1">
          {texts.map((x, i) => (
            <button key={i} type="button" onClick={() => onPick(i)} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px]', picked === i ? 'bg-accent-soft text-fg' : 'text-fg-2 hover:bg-bg-2')}>
              <span translate="no" className="min-w-0 flex-1 truncate">
                {x.text.split('\n')[0] || ' '}
              </span>
              <span className="tnum shrink-0 text-[11.5px] text-fg-3">{videoClock(x.from)}</span>
            </button>
          ))}
        </div>
      )}
      {t ? (
        <>
          <Group title="The words">
            <textarea translate="no" value={t.text} rows={2} maxLength={300} onChange={(e) => set({ text: e.target.value })} className={cx(inputCls, 'h-auto py-2 leading-snug')} aria-label="The words" />
          </Group>
          <Slider label="Size of the words" value={Math.round(t.size * 100)} min={2} max={30} onChange={(v) => set({ size: v / 100 })} change={change} zero={7} />
          <Group title="Colour">
            <div className="flex flex-wrap items-center gap-1.5">
              {COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={t.color === c}
                  onClick={() => set({ color: c })}
                  className={cx('h-7 w-7 rounded-full border', t.color === c ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : 'border-line-2')}
                  style={{ background: c }}
                />
              ))}
              <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-line-2" title="Another colour" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                <input type="color" value={t.color.slice(0, 7)} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Another colour" />
              </label>
            </div>
          </Group>
          <Group title="Behind them">
            <div className="grid grid-cols-3 gap-1.5">
              {BEHIND.map((b) => (
                <Choice
                  key={b.id}
                  on={behind === b.id}
                  onClick={() => set({ background: b.bg })}
                  icon={<span className={cx('h-3.5 w-5 rounded-[3px] border border-line-2', b.id === 'dark' && 'bg-black/70', b.id === 'light' && 'bg-white')} />}
                  label={b.label}
                />
              ))}
            </div>
          </Group>
          <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">Bold</span>
            <Switch label="Bold" on={!!t.bold} onChange={(bold) => set({ bold: bold || undefined })} />
          </label>
          <Group title="Where">
            <div className="grid grid-cols-3 gap-1.5">
              {PLACES.map((p) => (
                <Button key={p.label} size="sm" variant={Math.abs(t.y - p.y) < 0.02 && Math.abs(t.x - 0.5) < 0.02 ? 'subtle' : 'ghost'} onClick={() => set({ x: 0.5, y: p.y })}>
                  {p.label}
                </Button>
              ))}
            </div>
            <p className="text-[12px] leading-snug text-fg-3">Or drag the words on the picture.</p>
          </Group>
          <Group title="When they show">
            <TimeField label="From" value={t.from} max={t.to - 0.1} onChange={(v) => set({ from: v })} clock={clock} edited={shift} />
            <TimeField label="To" value={t.to} min={t.from + 0.1} max={duration} onChange={(v) => set({ to: v })} clock={clock} edited={shift} />
          </Group>
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={remove} className="text-err hover:text-err">
            Delete these words
          </Button>
        </>
      ) : (
        <p className="text-[12.5px] leading-snug text-fg-3">{texts.length ? 'Pick words on the picture or in the timeline to change them.' : 'Titles and captions show over the video, from and to the times you pick.'}</p>
      )}
    </div>
  );
}

// ---- Adjust -------------------------------------------------------------------------------------------------------

export function AdjustPanel({ r, change, length }: { r: VideoRecipe; change: Change; length: number }) {
  const pct = (k: 'brightness' | 'contrast' | 'saturation') => Math.round((r[k] ?? 0) * 100);
  const setPct = (k: 'brightness' | 'contrast' | 'saturation', v: number) => change((x) => strip({ ...x, [k]: v ? v / 100 : undefined }));
  const most = Math.max(0.1, Math.min(5, Math.floor((length / 2) * 10) / 10));
  const secs = (v: number) => (v ? `${v.toFixed(1)} s` : 'None');
  return (
    <div className="space-y-5">
      <Group title="Colour">
        <Slider label="Brightness" value={pct('brightness')} min={-100} max={100} onChange={(v) => setPct('brightness', v)} change={change} />
        <Slider label="Contrast" value={pct('contrast')} min={-100} max={100} onChange={(v) => setPct('contrast', v)} change={change} />
        <Slider label="Saturation" value={pct('saturation')} min={-100} max={100} onChange={(v) => setPct('saturation', v)} change={change} />
      </Group>
      <Group title="Fades, picture and sound">
        <Slider label="Fade in" value={Math.min(most, r.fadeIn ?? 0)} min={0} max={most} step={0.1} onChange={(v) => change((x) => strip({ ...x, fadeIn: v || undefined }))} change={change} show={secs} />
        <Slider label="Fade out" value={Math.min(most, r.fadeOut ?? 0)} min={0} max={most} step={0.1} onChange={(v) => change((x) => strip({ ...x, fadeOut: v || undefined }))} change={change} show={secs} />
      </Group>
      {(r.brightness || r.contrast || r.saturation || r.fadeIn || r.fadeOut) && (
        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => change((x) => strip({ ...x, brightness: undefined, contrast: undefined, saturation: undefined, fadeIn: undefined, fadeOut: undefined }))}>
          Back to the original colour
        </Button>
      )}
    </div>
  );
}

// ---- Sound --------------------------------------------------------------------------------------------------------

/** One sound to pick for the music: its name and length, a button to hear it, and one to use it. */
function SoundRow({ s, playing, onPlay, onUse }: { s: MediaItem; playing: boolean; onPlay: () => void; onUse: () => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg py-0.5 pr-0.5 pl-0.5 hover:bg-bg-2">
      <IconButton label={playing ? 'Stop' : 'Listen'} size="sm" onClick={onPlay}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </IconButton>
      <span translate="no" className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
        {s.title}
      </span>
      {s.duration ? <span className="tnum shrink-0 text-[11.5px] text-fg-3">{videoClock(s.duration)}</span> : null}
      <Button size="sm" variant="ghost" onClick={onUse}>
        Use it
      </Button>
    </div>
  );
}

export function SoundPanel({ r, change, audio, clock, length, parts, speed }: { r: VideoRecipe; change: Change; audio: boolean; clock: Clock; length: number; parts: [number, number][]; speed: number }) {
  const items = useMedia((s) => s.items);
  useEffect(() => {
    useMedia.getState().ensure();
  }, []);
  const sounds = useMemo(() => (items ?? []).filter((m) => m.kind === 'audio'), [items]);
  const [hearing, setHearing] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => player.current?.pause(), []);
  const hear = (m: MediaItem) => {
    player.current?.pause();
    if (hearing === m.id) return setHearing(null);
    const a = new Audio(mu(`/api/media/${m.id}/file`));
    a.onended = () => setHearing(null);
    void a.play().catch(() => setHearing(null));
    player.current = a;
    setHearing(m.id);
  };
  const m = r.music;
  const volume = Math.round((r.volume ?? 1) * 100);
  return (
    <div className="space-y-5">
      {audio ? (
        <Group title="Its own sound">
          <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">Without its sound</span>
            <Switch label="Without its sound" on={!!r.mute} onChange={(mute) => change((x) => strip({ ...x, mute: mute || undefined, volume: mute ? undefined : x.volume }))} />
          </label>
          {!r.mute && <Slider label="Volume" value={volume} min={0} max={200} step={5} zero={100} onChange={(v) => change((x) => strip({ ...x, volume: v === 100 ? undefined : v / 100 }))} change={change} show={(v) => `${v}%`} />}
        </Group>
      ) : (
        <p className="text-[12.5px] leading-snug text-fg-3">This video has no sound of its own.</p>
      )}
      <Group title="Music">
        {m ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              <Music size={14} className="shrink-0 text-fg-3" />
              <span translate="no" className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                {m.name ?? 'Music'}
              </span>
              <IconButton label="Take the music out" size="sm" onClick={() => change((x) => strip({ ...x, music: undefined }))}>
                <X size={14} />
              </IconButton>
            </div>
            <Slider
              label="Its volume"
              value={Math.round((m.volume ?? 1) * 100)}
              min={0}
              max={200}
              step={5}
              zero={100}
              onChange={(v) => change((x) => (x.music ? { ...x, music: { ...x.music, volume: v === 100 ? undefined : v / 100 } } : x))}
              change={change}
              show={(v) => `${v}%`}
            />
            <TimeField
              label="Starts at"
              value={m.start ?? 0}
              max={Math.max(0, length - 0.1)}
              onChange={(v) => change((x) => (x.music ? { ...x, music: { ...x.music, start: v || undefined } } : x))}
              clock={{ ...clock, get: () => toEdited(clock.get(), parts, speed) }}
            />
            <p className="text-[12px] leading-snug text-fg-3">Its start is a time of the edited video; it plays to the end, or until it ends.</p>
          </div>
        ) : sounds.length ? (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {sounds.map((s) => (
              <SoundRow key={s.id} s={s} playing={hearing === s.id} onPlay={() => hear(s)} onUse={() => (player.current?.pause(), setHearing(null), change((x) => ({ ...x, music: { src: `media:${s.id}`, name: s.title } })))} />
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] leading-snug text-fg-3">No sounds in your Library yet. Keep one an agent made (Save to Library, under it), or drop one on the Library.</p>
        )}
      </Group>
    </div>
  );
}
