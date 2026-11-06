// The inspector: what can be set of the picked thing, in sections that fold. A clip: its part and speed (its sound's
// pitch, backwards, steadied, a frame held), how it sits in the output (fitted or filling it, cropped, turned,
// mirrored), a picture's slow zoom and pan, its colour's first sliders, its sound (its level, none, another in its
// place, Edit the sound…, detached), and the transition into the next. An overlay: where and how large, how see-through,
// when, a green screen keyed out, its fades. Words: what they say, how they look, where and when; captions all styled
// at once and saved as .srt. A sound: its level, where it starts, its part, its fades. Nothing picked: the whole video.
import type { ReactNode } from 'react';
import { AudioWaveform, Captions, Download, Link2, Wand2, TrianglesCenterlineDashedVertical, TrianglesCenterlineDashedHorizontal, Palette, Plus, RotateCcw, RotateCw, Snowflake, Trash2, Unlink } from 'lucide-react';
import {
  audioLength,
  CAPTION_STYLES,
  cropToShape,
  isStill,
  motionId,
  motionPreset,
  overlayLength,
  originalRect,
  shownRect,
  turnedSize,
  VIDEO_MOTIONS,
  VIDEO_OUT_SHAPES,
  VIDEO_SHAPES,
  VIDEO_TRANSITIONS,
  SOUND_CHANNELS,
  videoClock,
  type SoundChannels,
  type VideoAudio,
  type VideoClip,
  type VideoFactsOf,
  type VideoOverlay,
  type VideoRecipe,
  type VideoText,
  type VideoTransitionKind,
  type VideoTurn,
} from '@shared/mediaedit-video';
import { Button, cx, inputCls } from '../../../components/ui';
import { post } from '../../../lib/api';
import { toastError } from '../../../lib/store';
import type { Change } from './Timeline';
import { canDetach, detachSound, freezeFrame, linkSound, pickedThing, setAudio, setClip, setOverlay, setText, spansOf, type Picked, type PoolItem } from './model';
import { Choices, Fold, ScrubField, SliderField, Toggle } from './shell';
import { soundEditor } from './soundHook';

export interface InspectorProps {
  recipe: VideoRecipe;
  factsOf: VideoFactsOf;
  picked: Picked;
  change: Change;
  /** The playhead, for what is done there. */
  now: () => number;
  out: { w: number; h: number };
  pool: PoolItem[];
  main: string;
  fps: number;
  /** The clip whose crop shows on the viewer, and its shape. */
  cropping: { id: string; shape: string } | null;
  onCropping(c: { id: string; shape: string } | null): void;
  onColour(): void;
  onEditSound(o: { src: string; title: string; from?: number; to?: number; save: (src: string) => void }): void;
  onCaptions(): void;
  captionsBusy: string | null;
  onSrt(): void;
  onAddText(): void;
  label: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const readPct = (s: string) => {
  const n = Number(s.replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? n / 100 : null;
};
const secs = (v: number) => `${v.toFixed(2)} s`;
const readSecs = (s: string) => {
  const m = s.trim().replace(',', '.').replace(/\s*s$/, '');
  const parts = m.split(':').map(Number);
  if (parts.some((x) => !Number.isFinite(x))) return null;
  return parts.reduce((a, x) => a * 60 + x, 0);
};
const clock = (v: number) => videoClock(v);

export function Inspector(p: InspectorProps) {
  const thing = pickedThing(p.recipe, p.picked);
  const body =
    (p.picked?.kind === 'clip' || p.picked?.kind === 'clipsound') && thing ? (
      <ClipProps {...p} c={thing as VideoClip} />
    ) : p.picked?.kind === 'transition' && thing ? (
      <TransitionProps {...p} c={thing as VideoClip} />
    ) : p.picked?.kind === 'overlay' && thing ? (
      <OverlayProps {...p} o={thing as VideoOverlay} />
    ) : p.picked?.kind === 'text' && thing ? (
      <TextProps {...p} t={thing as VideoText} />
    ) : p.picked?.kind === 'audio' && thing ? (
      <AudioProps {...p} a={thing as VideoAudio} />
    ) : (
      <ProjectProps {...p} />
    );
  return <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>;
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-2 gap-2', className)}>{children}</div>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] leading-snug text-fg-3">{children}</p>;
}

// ---- a clip -----------------------------------------------------------------------------------------------------------

const SHAPE_NAMES: Record<string, string> = { free: 'Any', '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '4:5': '4:5' };

function ClipProps(p: InspectorProps & { c: VideoClip }) {
  const { c } = p;
  const f = p.factsOf(c.src);
  const id = c.id!;
  const set = (patch: Partial<VideoClip>) => p.change((r) => setClip(r, id, (x) => ({ ...x, ...patch })));
  const still = isStill(c) || !!f?.picture;
  const d = f?.duration ?? 0;
  const [a, b] = c.trim ?? [0, d];
  const up = f ? turnedSize(f.width, f.height, c.rotate) : { w: 0, h: 0 };
  const i = (p.recipe.clips ?? []).findIndex((x) => x.id === id);
  const last = i === (p.recipe.clips ?? []).length - 1;
  const sounds = p.pool.filter((x) => x.kind === 'sound');
  const reTurn = (next: Pick<VideoClip, 'rotate' | 'flipH' | 'flipV'>) =>
    p.change((r) =>
      setClip(r, id, (x) => {
        const crop = x.crop && f ? shownRect(originalRect(x.crop, f.width, f.height, x), f.width, f.height, next) : undefined;
        return { ...x, rotate: next.rotate || undefined, flipH: next.flipH || undefined, flipV: next.flipV || undefined, crop };
      }),
    );
  const turn = (by: 90 | -90) => reTurn({ rotate: (((((c.rotate ?? 0) + by) % 360) + 360) % 360) as VideoTurn, flipH: c.flipH, flipV: c.flipV });
  const g = c.grade ?? {};
  const setGrade = (k: string, v: number) => set({ grade: { ...g, [k]: v || undefined } });
  const editSound = soundEditor();
  return (
    <>
      <Fold id="clip" title={<span translate="no">{c.name ?? (still ? 'Picture' : 'Clip')}</span>}>
        {still ? (
          <ScrubField label="Length" value={c.length ?? 4} min={0.2} max={600} step={0.1} show={secs} read={readSecs} onChange={(v) => set({ length: Math.round(v * 100) / 100 })} />
        ) : (
          <>
            <Row>
              <ScrubField label="In" value={a} min={0} max={b - 0.1} step={1 / p.fps} show={clock} read={readSecs} onChange={(v) => set({ trim: [Math.round(v * 1000) / 1000, b] })} title="Where it starts, in its own video" />
              <ScrubField label="Out" value={b} min={a + 0.1} max={d} step={1 / p.fps} show={clock} read={readSecs} onChange={(v) => set({ trim: [a, Math.round(v * 1000) / 1000] })} title="Where it ends, in its own video" />
            </Row>
            <ScrubField label="Speed" value={c.speed ?? 1} min={0.25} max={4} step={0.05} show={(v) => `${Math.round(v * 100) / 100}×`} read={(s) => Number(s.replace('×', '').replace('x', '').trim()) || null} zero={1} onChange={(v) => set({ speed: Math.abs(v - 1) < 0.001 ? undefined : Math.round(v * 100) / 100 })} />
            <Choices<number>
              value={c.speed ?? 1}
              onChange={(v) => set({ speed: v === 1 ? undefined : v })}
              options={[0.25, 0.5, 1, 1.5, 2, 4].map((v) => ({ value: v, label: `${v}×` }))}
            />
            <Toggle label="Its sound keeps its pitch" on={c.keepPitch !== false} onChange={(on) => set({ keepPitch: on ? undefined : false })} />
            <Toggle label="Play it backwards" on={!!c.reverse} onChange={(on) => set({ reverse: on || undefined })} />
            <Toggle label="Steady it (stabilize)" on={!!c.stabilize} onChange={(on) => set({ stabilize: on || undefined })} title="Smooths out a shaky camera; you see it in the saved video" />
            <Button size="sm" variant="secondary" icon={<Snowflake size={13} />} className="w-full" onClick={() => p.change((r) => freezeFrame(r, p.factsOf, id, p.now()))}>
              Hold this frame for 2 seconds
            </Button>
          </>
        )}
      </Fold>
      <Fold id="transform" title="Frame">
        <Choices<string>
          value={c.fit ?? 'fit'}
          onChange={(v) => set({ fit: v === 'fill' ? 'fill' : undefined })}
          options={[
            { value: 'fit', label: 'Fitted', title: 'All of it shows, with bars where its shape differs' },
            { value: 'fill', label: 'Filling', title: 'It fills the frame, its edges cut off' },
          ]}
        />
        <div className="space-y-1.5">
          <div className="text-[12px] text-fg-2">Crop</div>
          <Choices<string>
            value={p.cropping?.id === id ? p.cropping.shape : undefined}
            onChange={(s) => {
              p.onCropping({ id, shape: s });
              if (s !== 'free' && f) {
                const cr = cropToShape(s, f.width, f.height, c.rotate);
                if (cr) set({ crop: cr.w >= up.w && cr.h >= up.h ? undefined : cr });
              }
            }}
            options={VIDEO_SHAPES.map((s) => ({ value: s, label: SHAPE_NAMES[s] }))}
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant={p.cropping?.id === id ? 'primary' : 'secondary'} className="flex-1" onClick={() => p.onCropping(p.cropping?.id === id ? null : { id, shape: p.cropping?.shape ?? 'free' })}>
              {p.cropping?.id === id ? 'Done cropping' : 'Crop on the viewer'}
            </Button>
            {(c.crop || c.rotate || c.flipH || c.flipV) && (
              <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => set({ crop: undefined, rotate: undefined, flipH: undefined, flipV: undefined })}>
                Whole frame
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1">
          <IconChoice label="Turn left" onClick={() => turn(-90)} icon={<RotateCcw size={14} />} />
          <IconChoice label="Turn right" onClick={() => turn(90)} icon={<RotateCw size={14} />} />
          <IconChoice label="Mirror" on={!!c.flipH} onClick={() => reTurn({ rotate: c.rotate, flipH: !c.flipH, flipV: c.flipV })} icon={<TrianglesCenterlineDashedVertical size={14} />} />
          <IconChoice label="Upside down" on={!!c.flipV} onClick={() => reTurn({ rotate: c.rotate, flipH: c.flipH, flipV: !c.flipV })} icon={<TrianglesCenterlineDashedHorizontal size={14} />} />
        </div>
      </Fold>
      {still && (
        <Fold id="motion" title="Zoom and pan">
          <div className="grid grid-cols-4 gap-1">
            {VIDEO_MOTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => set({ motion: motionPreset(m.id, 0.5) })}
                className={cx('h-7 truncate rounded-md border px-1 text-[11px]', motionId(c.motion) === m.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}
              >
                {m.label}
              </button>
            ))}
          </div>
          {c.motion && (
            <SliderField
              label="How far"
              value={Math.round((Math.max(c.motion.from.zoom, c.motion.to.zoom) - 1) / 0.006)}
              min={5}
              max={100}
              zero={50}
              show={(v) => `${v}%`}
              onChange={(v) => set({ motion: motionPreset(motionId(c.motion), v / 100) })}
            />
          )}
        </Fold>
      )}
      <Fold id="clipcolour" title="Colour" aside={<Button size="sm" variant="ghost" icon={<Palette size={13} />} onClick={p.onColour}>Colour page</Button>}>
        <SliderField label="Exposure" value={Math.round((g.exposure ?? 0) * 100)} min={-100} max={100} onChange={(v) => setGrade('exposure', v / 100)} />
        <SliderField label="Contrast" value={Math.round((g.contrast ?? 0) * 100)} min={-100} max={100} onChange={(v) => setGrade('contrast', v / 100)} />
        <SliderField label="Saturation" value={Math.round((g.saturation ?? 0) * 100)} min={-100} max={100} onChange={(v) => setGrade('saturation', v / 100)} />
        <SliderField label="Temperature" value={Math.round((g.temperature ?? 0) * 100)} min={-100} max={100} onChange={(v) => setGrade('temperature', v / 100)} />
      </Fold>
      {!still && (
        <Fold id="clipsound" title="Sound">
          {f?.audio || c.sound ? (
            <>
              <Toggle label="Without its sound" on={!!c.mute} onChange={(on) => set({ mute: on || undefined, volume: on ? undefined : c.volume, sound: on ? undefined : c.sound })} />
              {!c.mute && (
                <SoundControls
                  x={{ volume: c.volume, channels: c.channels, levels: c.levels, silence: c.silence, clean: c.clean, even: c.even, fadeIn: c.soundFadeIn, fadeOut: c.soundFadeOut }}
                  length={spansOf(p.recipe, p.factsOf).spans[i]?.length ?? 1}
                  measure={{ src: c.sound ?? c.src ?? p.main, from: a, to: b }}
                  set={(m) => set({ ...m, ...('fadeIn' in m ? { soundFadeIn: m.fadeIn, fadeIn: undefined } : {}), ...('fadeOut' in m ? { soundFadeOut: m.fadeOut, fadeOut: undefined } : {}) } as Partial<VideoClip>)}
                />
              )}
            </>
          ) : (
            <Note>This clip has no sound of its own.</Note>
          )}
          {!c.mute && (
            <label className="block space-y-1 text-[12px] text-fg-2">
              <span>Its sound</span>
              <select
                value={c.sound ?? ''}
                onChange={(e) => set({ sound: e.target.value || undefined })}
                className={cx(inputCls, 'h-7 px-1.5 text-[12px]')}
                aria-label="Its sound"
              >
                <option value="">Its own sound</option>
                {sounds.map((s) => (
                  <option key={s.src} value={s.src} translate="no">
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              icon={<AudioWaveform size={13} />}
              disabled={!editSound || (!f?.audio && !c.sound)}
              title={editSound ? 'Opens its sound in the sound editor; what you save there plays in its place' : 'The sound editor opens here'}
              onClick={() => p.onEditSound({ src: c.sound ?? c.src ?? p.main, title: c.name ?? 'Clip', from: a, to: b, save: (src) => set({ sound: src, mute: undefined }) })}
            >
              Edit the sound…
            </Button>
            <Button size="sm" variant="ghost" icon={<Unlink size={13} />} disabled={!canDetach(c, f)} title="Puts its sound on the voice track (A3), to move, trim and cut on its own (a J or an L cut)" onClick={() => p.change((r) => detachSound(r, p.factsOf, id, p.main))}>
              Unlink the sound
            </Button>
          </div>
        </Fold>
      )}
      {!last && <TransitionFold {...p} c={c} />}
    </>
  );
}

function IconChoice({ label, on, onClick, icon }: { label: string; on?: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick} className={cx('flex h-8 flex-col items-center justify-center rounded-md border text-[10px]', on ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}>
      {icon}
    </button>
  );
}

function TransitionFold(p: InspectorProps & { c: VideoClip }) {
  const { c } = p;
  const spans = spansOf(p.recipe, p.factsOf).spans;
  const i = (p.recipe.clips ?? []).findIndex((x) => x.id === c.id);
  const most = i >= 0 && i < spans.length - 1 ? Math.max(0.1, Math.floor((Math.min(spans[i].length, spans[i + 1].length) / 2) * 10) / 10) : 1;
  const set = (t: VideoClip['transition']) => p.change((r) => setClip(r, c.id!, (x) => ({ ...x, transition: t })));
  return (
    <Fold id="transition" title="Into the next clip">
      <select
        value={c.transition?.kind ?? ''}
        onChange={(e) => set(e.target.value ? { kind: e.target.value as VideoTransitionKind, length: c.transition?.length ?? Math.min(1, most) } : undefined)}
        className={cx(inputCls, 'h-7 px-1.5 text-[12px]')}
        aria-label="Transition"
      >
        <option value="">A cut</option>
        {VIDEO_TRANSITIONS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {c.transition && <SliderField label="Length" value={Math.min(most, c.transition.length)} min={0.1} max={most} step={0.1} zero={Math.min(1, most)} show={secs} read={readSecs} onChange={(v) => set({ ...c.transition!, length: Math.round(v * 100) / 100 })} />}
    </Fold>
  );
}

function TransitionProps(p: InspectorProps & { c: VideoClip }) {
  return (
    <>
      <TransitionFold {...p} />
      <div className="p-3">
        <Note>A transition overlaps the two clips it joins: the video gets shorter by its length. It can be at most half as long as the shorter clip.</Note>
      </div>
    </>
  );
}

// ---- an overlay ---------------------------------------------------------------------------------------------------------

function OverlayProps(p: InspectorProps & { o: VideoOverlay }) {
  const { o } = p;
  const f = p.factsOf(o.src);
  const len = overlayLength(o, f);
  const set = (patch: Partial<VideoOverlay>) => p.change((r) => setOverlay(r, o.id!, (x) => ({ ...x, ...patch })));
  return (
    <>
      <Fold id="overlay" title={<span translate="no">{o.name ?? 'Overlay'}</span>}>
        <Row>
          <ScrubField label="X" value={o.x} step={0.005} show={pct} read={readPct} onChange={(v) => set({ x: v })} title="Where its middle is across" />
          <ScrubField label="Y" value={o.y} step={0.005} show={pct} read={readPct} onChange={(v) => set({ y: v })} title="And down" />
        </Row>
        <ScrubField label="Width" value={o.w} min={0.02} max={2} step={0.005} show={pct} read={readPct} onChange={(v) => set({ w: v })} />
        <SliderField label="Opacity" value={Math.round((o.opacity ?? 1) * 100)} min={0} max={100} zero={100} show={(v) => `${v}%`} onChange={(v) => set({ opacity: v >= 100 ? undefined : v / 100 })} />
        <Row>
          <ScrubField label="Starts" value={o.start} min={0} step={0.1} show={clock} read={readSecs} onChange={(v) => set({ start: Math.round(v * 1000) / 1000 })} />
          {o.picture || f?.picture ? <ScrubField label="Length" value={len} min={0.1} step={0.1} show={secs} read={readSecs} onChange={(v) => set({ length: Math.round(v * 100) / 100 })} /> : <span className="self-center text-[12px] text-fg-3">{secs(len)}</span>}
        </Row>
        <Choices<number> value={o.track ?? 2} onChange={(v) => set({ track: v })} options={[{ value: 2, label: 'Track V2' }, { value: 3, label: 'Track V3 (over V2)' }]} />
        <div className="grid grid-cols-3 gap-1">
          {[
            ['Top left', 0.15, 0.12],
            ['Top right', 0.85, 0.12],
            ['Middle', 0.5, 0.5],
            ['Bottom left', 0.15, 0.88],
            ['Bottom right', 0.85, 0.88],
            ['Full frame', 0.5, 0.5],
          ].map(([label, x, y]) => (
            <button key={label as string} type="button" onClick={() => set(label === 'Full frame' ? { x: 0.5, y: 0.5, w: 1 } : { x: x as number, y: y as number })} className="h-7 truncate rounded-md border border-line px-1 text-[11px] text-fg-2 hover:bg-bg-2">
              {label}
            </button>
          ))}
        </div>
      </Fold>
      <Fold id="key" title="Green screen" first={!!o.key}>
        <Toggle label="Take a colour out" on={!!o.key} onChange={(on) => set({ key: on ? { color: '#00ff00', similarity: 0.3, blend: 0.1 } : undefined })} />
        {o.key && (
          <>
            <div className="flex items-center gap-1.5">
              {['#00ff00', '#00b140', '#0047bb', '#0000ff'].map((col) => (
                <button key={col} type="button" aria-label={col} onClick={() => set({ key: { ...o.key!, color: col } })} className={cx('h-6 w-6 rounded-full border', o.key!.color === col ? 'ring-2 ring-accent ring-offset-1 ring-offset-panel' : 'border-line-2')} style={{ background: col }} />
              ))}
              <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-line-2" title="Another colour" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                <input type="color" value={o.key.color} onChange={(e) => set({ key: { ...o.key!, color: e.target.value } })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Another colour" />
              </label>
            </div>
            <SliderField label="How near a colour goes" value={Math.round(o.key.similarity * 100)} min={1} max={80} zero={30} show={(v) => `${v}%`} onChange={(v) => set({ key: { ...o.key!, similarity: v / 100 } })} />
            <SliderField label="Soft edges" value={Math.round(o.key.blend * 100)} min={0} max={50} zero={10} show={(v) => `${v}%`} onChange={(v) => set({ key: { ...o.key!, blend: v / 100 } })} />
          </>
        )}
      </Fold>
      <Fold id="ofades" title="Fades">
        <SliderField label="Fade in" value={o.fadeIn ?? 0} min={0} max={Math.max(0.1, Math.floor((len / 2) * 10) / 10)} step={0.1} show={secs} onChange={(v) => set({ fadeIn: v || undefined })} />
        <SliderField label="Fade out" value={o.fadeOut ?? 0} min={0} max={Math.max(0.1, Math.floor((len / 2) * 10) / 10)} step={0.1} show={secs} onChange={(v) => set({ fadeOut: v || undefined })} />
      </Fold>
    </>
  );
}

// ---- words ----------------------------------------------------------------------------------------------------------------

const COLOURS = ['#ffffff', '#111111', '#ffd60a', '#ff453a', '#0a84ff', '#30d158'];

function TextProps(p: InspectorProps & { t: VideoText }) {
  const { t } = p;
  const set = (patch: Partial<VideoText>) => p.change((r) => setText(r, t.id!, (x) => ({ ...x, ...patch })));
  const behind = t.background === '#000000a6' || t.background === '#000000b3' ? 'dark' : t.background === '#ffffffd9' || t.background === '#ffffffe0' ? 'light' : t.background ? 'other' : 'none';
  const caps = (p.recipe.texts ?? []).filter((x) => x.caption);
  return (
    <>
      <Fold id="words" title={t.caption ? 'Caption' : 'Words'}>
        <textarea translate="no" value={t.text} rows={3} maxLength={300} onChange={(e) => set({ text: e.target.value })} className={cx(inputCls, 'h-auto py-1.5 text-[12.5px] leading-snug')} aria-label="The words" />
      </Fold>
      <Fold id="wstyle" title="Look">
        <SliderField label="Size" value={Math.round(t.size * 100)} min={2} max={30} zero={7} onChange={(v) => set({ size: v / 100 })} />
        <div className="flex flex-wrap items-center gap-1.5">
          {COLOURS.map((col) => (
            <button key={col} type="button" aria-label={col} aria-pressed={t.color === col} onClick={() => set({ color: col })} className={cx('h-6 w-6 rounded-full border', t.color === col ? 'ring-2 ring-accent ring-offset-1 ring-offset-panel' : 'border-line-2')} style={{ background: col }} />
          ))}
          <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-line-2" title="Another colour" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
            <input type="color" value={t.color.slice(0, 7)} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Another colour" />
          </label>
        </div>
        <Choices<string>
          value={behind}
          onChange={(v) => set({ background: v === 'dark' ? '#000000a6' : v === 'light' ? '#ffffffd9' : undefined })}
          options={[
            { value: 'none', label: 'Nothing behind' },
            { value: 'dark', label: 'Dark box' },
            { value: 'light', label: 'Light box' },
          ]}
        />
        <Toggle label="An edge around the letters" on={!!t.outline} onChange={(on) => set({ outline: on ? '#000000' : undefined, ...(on ? { background: undefined } : {}) })} />
        <Toggle label="Bold" on={!!t.bold} onChange={(on) => set({ bold: on || undefined })} />
      </Fold>
      <Fold id="wplace" title="Where and when">
        <Choices<string>
          value={Math.abs(t.x - 0.5) < 0.02 ? (t.y < 0.3 ? 'top' : t.y > 0.7 ? 'bottom' : 'middle') : ''}
          onChange={(v) => set({ x: 0.5, y: v === 'top' ? 0.12 : v === 'middle' ? 0.5 : 0.86 })}
          options={[
            { value: 'top', label: 'Top' },
            { value: 'middle', label: 'Middle' },
            { value: 'bottom', label: 'Bottom' },
          ]}
        />
        <Row>
          <ScrubField label="X" value={t.x} min={0} max={1} step={0.005} show={pct} read={readPct} onChange={(v) => set({ x: v })} />
          <ScrubField label="Y" value={t.y} min={0} max={1} step={0.005} show={pct} read={readPct} onChange={(v) => set({ y: v })} />
        </Row>
        <Row>
          <ScrubField label="From" value={t.from} min={0} max={t.to - 0.1} step={0.1} show={clock} read={readSecs} onChange={(v) => set({ from: Math.round(v * 1000) / 1000 })} />
          <ScrubField label="To" value={t.to} min={t.from + 0.1} step={0.1} show={clock} read={readSecs} onChange={(v) => set({ to: Math.round(v * 1000) / 1000 })} />
        </Row>
      </Fold>
      {t.caption && caps.length > 0 && <CaptionTools {...p} caps={caps} />}
    </>
  );
}

function CaptionTools(p: InspectorProps & { caps: VideoText[] }) {
  return (
    <Fold id="captions" title={`Captions (${p.caps.length})`}>
      <div className="text-[12px] text-fg-2">Style of every caption</div>
      <div className="grid grid-cols-2 gap-1">
        {CAPTION_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => p.change((r) => ({ ...r, texts: (r.texts ?? []).map((x) => (x.caption ? { ...x, ...s.set, background: s.set.background, outline: s.set.outline, bold: s.set.bold || undefined, x: 0.5 } : x)) }))}
            className="h-7 truncate rounded-md border border-line px-1.5 text-[11.5px] text-fg-2 hover:bg-bg-2"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={p.onSrt} className="flex-1">
          Save as .srt
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => p.change((r) => ({ ...r, texts: (r.texts ?? []).filter((x) => !x.caption) }))} className="text-err hover:text-err">
          Delete them
        </Button>
      </div>
    </Fold>
  );
}

// ---- a sound ---------------------------------------------------------------------------------------------------------------

function AudioProps(p: InspectorProps & { a: VideoAudio }) {
  const { a } = p;
  const f = p.factsOf(a.src);
  const len = audioLength(a, f);
  const d = f?.duration ?? len;
  const [x, y] = a.trim ?? [0, d];
  const set = (patch: Partial<VideoAudio>) => p.change((r) => setAudio(r, a.id!, (s) => ({ ...s, ...patch })));
  const editSound = soundEditor();
  return (
    <>
      <Fold id="sound" title={<span translate="no">{a.name ?? 'Sound'}</span>}>
        <Choices<string> value={a.track} onChange={(v) => set({ track: v === 'voice' ? 'voice' : 'music' })} options={[{ value: 'music', label: 'Music (A2)' }, { value: 'voice', label: 'Voice-over (A3)' }]} />

        <ScrubField label="Starts at" value={a.start} min={0} step={0.1} show={clock} read={readSecs} onChange={(v) => set({ start: Math.round(v * 1000) / 1000 })} />
        <Row>
          <ScrubField label="In" value={x} min={0} max={y - 0.1} step={0.1} show={clock} read={readSecs} onChange={(v) => set({ trim: [Math.round(v * 1000) / 1000, y] })} />
          <ScrubField label="Out" value={y} min={x + 0.1} max={d} step={0.1} show={clock} read={readSecs} onChange={(v) => set({ trim: [x, Math.round(v * 1000) / 1000] })} />
        </Row>
        <SoundControls x={a} length={len} measure={{ src: a.src, from: x, to: y }} set={(m) => set(m)} />
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" icon={<AudioWaveform size={13} />} disabled={!editSound} title={editSound ? 'Opens it in the sound editor (effects, a spectral view, cuts by the words); what you save there plays in its place' : 'The sound editor opens here'} onClick={() => p.onEditSound({ src: a.src, title: a.name ?? 'Sound', from: x, to: y, save: (src) => set({ src }) })}>
            Edit the sound…
          </Button>
          {a.clip && p.recipe.clips?.some((c) => c.id === a.clip) && (
            <Button size="sm" variant="ghost" icon={<Link2 size={13} />} title="Puts it back as its clip’s own sound, in time with the picture" onClick={() => p.change((r) => linkSound(r, a.id!))}>
              Link it to its clip again
            </Button>
          )}
        </div>
      </Fold>
    </>
  );
}

// ---- a sound's channels, level, fades, volume line, silenced parts and fixes ---------------------------------------------

type SoundBits = { volume?: number; channels?: SoundChannels; levels?: [number, number][]; silence?: [number, number][]; clean?: number; even?: boolean; fadeIn?: number; fadeOut?: number };

const dbOf = (g?: number) => (g === undefined ? 0 : g <= 0.001 ? -60 : 20 * Math.log10(g));

function SoundControls({ x, length, measure, set }: { x: SoundBits; length: number; measure: { src: string; from?: number; to?: number }; set: (m: Partial<SoundBits>) => void }) {
  const most = Math.max(0.1, Math.floor((length / 2) * 10) / 10);
  const normalize = async () => {
    try {
      const { peak } = await post<{ peak: number }>('/api/mediaedit/video/peak', measure);
      if (peak <= -99) return;
      const g = Math.min(4, Math.pow(10, (-1 - peak) / 20));
      set({ volume: Math.abs(g - 1) < 0.005 ? undefined : Math.round(g * 1000) / 1000 });
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <>
      <label className="block space-y-1 text-[12px] text-fg-2">
        <span>Channels</span>
        <select value={x.channels ?? 'stereo'} onChange={(e) => set({ channels: e.target.value === 'stereo' ? undefined : (e.target.value as SoundChannels) })} className={cx(inputCls, 'h-7 px-1.5 text-[12px]')} aria-label="Channels">
          {SOUND_CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <ScrubField
        label="Volume"
        value={Math.round(dbOf(x.volume) * 10) / 10}
        min={-60}
        max={12}
        step={0.5}
        zero={0}
        show={(v) => (v <= -59.9 ? '−∞ dB' : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`)}
        read={(s2) => {
          const v = Number(s2.replace(/dB/i, '').replace('−', '-').replace(',', '.').trim());
          return Number.isFinite(v) ? v : null;
        }}
        onChange={(v) => set({ volume: Math.abs(v) < 0.05 ? undefined : v <= -59.9 ? 0 : Math.round(Math.pow(10, v / 20) * 1000) / 1000 })}
      />
      <SliderField label="Fade in" value={Math.min(most, x.fadeIn ?? 0)} min={0} max={most} step={0.1} show={secs} onChange={(v) => set({ fadeIn: v || undefined })} />
      <SliderField label="Fade out" value={Math.min(most, x.fadeOut ?? 0)} min={0} max={most} step={0.1} show={secs} onChange={(v) => set({ fadeOut: v || undefined })} />
      {x.levels?.length ? (
        <div className="flex items-center gap-2 text-[12px] text-fg-2">
          <span className="min-w-0 flex-1">{`Volume line: ${x.levels.length} point${x.levels.length === 1 ? '' : 's'}`}</span>
          <Button size="sm" variant="ghost" onClick={() => set({ levels: undefined })}>
            Flatten it
          </Button>
        </div>
      ) : (
        <Note>Click the line on it in the timeline to add a point; drag a part of it up or down.</Note>
      )}
      {x.silence?.length ? (
        <div className="space-y-1">
          <div className="text-[12px] text-fg-2">Silenced</div>
          {x.silence.map(([a, b], i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-bg-2 py-0.5 pr-0.5 pl-2 text-[12px]">
              <span className="tnum min-w-0 flex-1 text-fg-2">{`${videoClock(a)} to ${videoClock(b)}`}</span>
              <Button size="sm" variant="ghost" onClick={() => set({ silence: x.silence!.filter((_, j) => j !== i) })}>
                Hear it again
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-1 border-t border-line pt-2">
        <Toggle label="Clean up the voice" on={!!x.clean} onChange={(on) => set({ clean: on ? 0.5 : undefined })} title="Takes out background noise and rumble; heard in the saved video" />
        {x.clean !== undefined && <SliderField label="How much" value={Math.round(x.clean * 100)} min={5} max={100} zero={50} show={(v) => `${v}%`} onChange={(v) => set({ clean: v / 100 })} />}
        <Toggle label="Even out the loudness" on={!!x.even} onChange={(on) => set({ even: on || undefined })} title="Quiet and loud parts brought nearer (-16 LUFS); heard in the saved video" />
        <Button size="sm" variant="secondary" icon={<Wand2 size={13} />} className="w-full" onClick={() => void normalize()} title="Its level set so its loudest moment is at -1 dB">
          Normalize
        </Button>
      </div>
    </>
  );
}

// ---- the whole video -----------------------------------------------------------------------------------------------------

function ProjectProps(p: InspectorProps) {
  const r = p.recipe;
  const { length } = spansOf(r, p.factsOf);
  const most = Math.max(0.1, Math.min(10, Math.floor((length / 2) * 10) / 10));
  const caps = (r.texts ?? []).filter((t) => t.caption);
  return (
    <>
      <Fold id="project" title="The video">
        <div className="space-y-1.5">
          <div className="text-[12px] text-fg-2">Shape</div>
          <Choices<string>
            value={r.shape ?? 'first'}
            onChange={(v) => p.change((x) => ({ ...x, shape: v === 'first' ? undefined : (v as VideoRecipe['shape']) }))}
            options={[{ value: 'first', label: 'First clip’s', title: 'The shape of the first clip' }, ...VIDEO_OUT_SHAPES.map((s) => ({ value: s, label: s }))]}
          />
        </div>
        <SliderField label="Fade in from black" value={Math.min(most, r.fadeIn ?? 0)} min={0} max={most} step={0.1} show={secs} onChange={(v) => p.change((x) => ({ ...x, fadeIn: v || undefined }))} />
        <SliderField label="Fade out to black" value={Math.min(most, r.fadeOut ?? 0)} min={0} max={most} step={0.1} show={secs} onChange={(v) => p.change((x) => ({ ...x, fadeOut: v || undefined }))} />
        <Note>{`${p.out.w} × ${p.out.h} · ${Math.round(p.fps * 100) / 100} frames a second · ${videoClock(length)} · ${(r.clips ?? []).length} clip${(r.clips ?? []).length === 1 ? '' : 's'}`}</Note>
      </Fold>
      <Fold id="pwords" title="Words and captions">
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} className="w-full" onClick={p.onAddText}>
          Add words at the playhead
        </Button>
        <Button size="sm" variant="secondary" icon={<Captions size={13} />} className="w-full" disabled={!!p.captionsBusy} onClick={p.onCaptions}>
          {p.captionsBusy ?? (caps.length ? 'Make the captions again' : 'Make captions from what is said')}
        </Button>
        <Note>Captions are made on this computer by speech recognition (Settings → Voice), from the clips’ sound and the voice-over. Each is words you can change and move on the T1 track.</Note>
        {caps.length > 0 && <CaptionTools {...p} caps={caps} />}
      </Fold>
    </>
  );
}
