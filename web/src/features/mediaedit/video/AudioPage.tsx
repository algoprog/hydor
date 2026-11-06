// The Audio page: a mixer of the three sound tracks (A1 the clips' own sound, A2 music, A3 voice-over) and the whole,
// each with its level meter while it plays, a fader, its pan, mute and solo; the quick fixes for the whole video
// (clean up the voices, even out the loudness, lower the music under speech, fade the music in and out); and "Edit the
// sound…" for the picked clip or sound, which opens the separate sound editor (soundHook.ts) when it is there.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AudioWaveform, Music, Sparkles, Volume2 } from 'lucide-react';
import type { VideoFactsOf, VideoRecipe } from '@shared/mediaedit-video';
import { Button, cx } from '../../../components/ui';
import { toDb, type Engine, type TrackLevels } from './engine';
import { pickedThing, type Picked } from './model';
import { Choices, PanelHead, SliderField, Splitter, Toggle, useRemembered } from './shell';
import { soundEditor } from './soundHook';
import type { Change } from './Timeline';

export interface AudioProps {
  recipe: VideoRecipe;
  factsOf: VideoFactsOf;
  engine: Engine;
  change: Change;
  picked: Picked;
  main: string;
  viewer: ReactNode;
  timeline: ReactNode;
  onEditSound(o: { src: string; title: string; from?: number; to?: number; save: (src: string) => void }): void;
}

const STRIPS = [
  { id: 'a1', name: 'A1', title: 'Clips’ sound' },
  { id: 'a2', name: 'A2', title: 'Music' },
  { id: 'a3', name: 'A3', title: 'Voice-over' },
] as const;

const useLevels = (e: Engine): TrackLevels => useSyncExternalStore(e.onLevels, () => e.levels);

export function AudioPage(p: AudioProps) {
  const [mixW, setMixW] = useRemembered('audio.mixer', 520);
  const [timeH, setTimeH] = useRemembered('audio.timeline', 300);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">{p.viewer}</div>
        <Splitter dir="x" size={mixW} onSize={setMixW} min={380} max={860} side="after" />
        <div className="flex shrink-0 flex-col bg-panel" style={{ width: mixW }}>
          <PanelHead title="Mixer" />
          <div className="flex min-h-0 flex-1">
            <Mixer {...p} />
            <Fixes {...p} />
          </div>
        </div>
      </div>
      <Splitter dir="y" size={timeH} onSize={setTimeH} min={160} max={560} side="after" />
      <div className="shrink-0" style={{ height: timeH }}>
        {p.timeline}
      </div>
    </div>
  );
}

function Mixer(p: AudioProps) {
  const lv = useLevels(p.engine);
  const set = (id: 'a1' | 'a2' | 'a3', m: Record<string, unknown>) => p.change((r) => ({ ...r, tracks: { ...r.tracks, [id]: { ...r.tracks?.[id], ...m } } }));
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-r border-line p-2">
      {STRIPS.map((s) => {
        const t = p.recipe.tracks?.[s.id] ?? {};
        return (
          <Strip
            key={s.id}
            name={s.name}
            title={s.title}
            level={lv[s.id]}
            gain={t.volume ?? 1}
            onGain={(g) => set(s.id, { volume: Math.abs(g - 1) < 0.005 ? undefined : g })}
            pan={t.pan ?? 0}
            onPan={(v) => set(s.id, { pan: Math.abs(v) < 0.01 ? undefined : v })}
            mute={!!t.mute}
            onMute={() => set(s.id, { mute: !t.mute || undefined })}
            solo={!!t.solo}
            onSolo={() => set(s.id, { solo: !t.solo || undefined })}
            change={p.change}
          />
        );
      })}
      <Strip name="Out" title="The whole" level={lv.master} />
    </div>
  );
}

/** A fader's place (0 to 1) for a level: -60 dB at the bottom, +6 dB at the top. */
const toPos = (g: number) => (g <= 0 ? 0 : Math.min(1, Math.max(0, (toDb(g) + 60) / 66)));
const fromPos = (p: number) => (p <= 0.001 ? 0 : Math.min(2, Math.pow(10, (p * 66 - 60) / 20)));

function Strip({
  name,
  title,
  level,
  gain,
  onGain,
  pan,
  onPan,
  mute,
  onMute,
  solo,
  onSolo,
  change,
}: {
  name: string;
  title: string;
  level: number;
  gain?: number;
  onGain?: (g: number) => void;
  pan?: number;
  onPan?: (p: number) => void;
  mute?: boolean;
  onMute?: () => void;
  solo?: boolean;
  onSolo?: () => void;
  change?: Change;
}) {
  const db = toDb(level);
  const fill = Math.min(1, Math.max(0, (db + 60) / 60));
  const [peak, setPeak] = useState(0);
  useEffect(() => {
    setPeak((p) => (fill > p ? fill : Math.max(0, p - 0.02)));
  }, [fill]);
  return (
    <div className="flex w-[78px] shrink-0 flex-col items-center gap-1.5 rounded-lg bg-bg-1 px-1.5 py-2" title={title}>
      <div className="flex w-full items-center justify-between">
        <span className="text-[11px] font-semibold text-ok">{name}</span>
        <span className="truncate text-[10px] text-fg-3">{title}</span>
      </div>
      {onPan && (
        <input type="range" min={-100} max={100} value={Math.round((pan ?? 0) * 100)} onPointerDown={change?.begin} onPointerUp={change?.end} onChange={(e) => onPan(Number(e.target.value) / 100)} onDoubleClick={() => onPan(0)} aria-label={`${title}: pan`} title={`Pan: ${pan ? (pan < 0 ? `${Math.round(-pan * 100)}% left` : `${Math.round(pan * 100)}% right`) : 'middle'}`} className="w-full accent-[var(--accent)]" />
      )}
      <div className="flex min-h-[150px] w-full flex-1 items-stretch justify-center gap-2">
        {/* The meter: green, then yellow from -12 dB, red from -3. */}
        <div className="relative w-2.5 overflow-hidden rounded-sm bg-bg-3">
          <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,var(--ok)_0%,var(--ok)_75%,var(--warn)_80%,var(--warn)_93%,var(--err)_95%)]" style={{ height: `${fill * 100}%` }} />
          <div className="absolute inset-x-0 h-px bg-fg" style={{ bottom: `${peak * 100}%` }} />
        </div>
        {onGain && (
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(toPos(gain ?? 1) * 1000)}
            onPointerDown={change?.begin}
            onPointerUp={change?.end}
            onChange={(e) => onGain(fromPos(Number(e.target.value) / 1000))}
            onDoubleClick={() => onGain(1)}
            aria-label={`${title}: level`}
            className="w-7 accent-[var(--accent)] [writing-mode:vertical-lr] [direction:rtl]"
          />
        )}
      </div>
      <div className="tnum text-[10.5px] text-fg-2">{gain === undefined ? (db <= -60 ? '−∞' : `${db.toFixed(1)} dB`) : gain <= 0 ? '−∞ dB' : `${toDb(gain) >= 0 ? '+' : ''}${toDb(gain).toFixed(1)} dB`}</div>
      {onMute && (
        <div className="flex gap-1">
          <button type="button" onClick={onMute} aria-pressed={mute} title="Mute" className={cx('h-6 w-7 rounded text-[11px] font-bold', mute ? 'bg-err text-bg' : 'bg-bg-3 text-fg-2 hover:text-fg')}>
            M
          </button>
          <button type="button" onClick={onSolo} aria-pressed={solo} title="Solo: only the soloed tracks are heard" className={cx('h-6 w-7 rounded text-[11px] font-bold', solo ? 'bg-warn text-bg' : 'bg-bg-3 text-fg-2 hover:text-fg')}>
            S
          </button>
        </div>
      )}
    </div>
  );
}

function Fixes(p: AudioProps) {
  const fx = p.recipe.fixes ?? {};
  const set = (m: Record<string, unknown>) => p.change((r) => ({ ...r, fixes: { ...r.fixes, ...m } }));
  const music = (p.recipe.audio ?? []).filter((a) => a.track === 'music');
  const faded = music.length > 0 && music.every((a) => a.fadeIn && a.fadeOut);
  const editSound = soundEditor();
  const thing = pickedThing(p.recipe, p.picked);
  const target =
    p.picked?.kind === 'clip' && thing
      ? (() => {
          const c = thing as NonNullable<VideoRecipe['clips']>[number];
          const f = p.factsOf(c.src);
          return f?.audio || c.sound ? { src: c.sound ?? c.src ?? p.main, title: c.name ?? 'Clip', from: c.trim?.[0], to: c.trim?.[1], save: (src: string) => p.change((r) => ({ ...r, clips: (r.clips ?? []).map((x) => (x.id === c.id ? { ...x, sound: src, mute: undefined } : x)) })) } : null;
        })()
      : p.picked?.kind === 'audio' && thing
        ? (() => {
            const a = thing as NonNullable<VideoRecipe['audio']>[number];
            return { src: a.src, title: a.name ?? 'Sound', from: a.trim?.[0], to: a.trim?.[1], save: (src: string) => p.change((r) => ({ ...r, audio: (r.audio ?? []).map((x) => (x.id === a.id ? { ...x, src } : x)) })) };
          })()
        : null;
  return (
    <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-fg-2">
        <Sparkles size={13} /> Quick fixes
      </div>
      <Toggle label="Clean up the voices" on={!!fx.voice} onChange={(on) => set({ voice: on ? 0.5 : undefined })} title="Takes out background noise and rumble from the clips’ sound and the voice-over" />
      {fx.voice !== undefined && <SliderField label="How much" value={Math.round(fx.voice * 100)} min={5} max={100} zero={50} show={(v) => `${v}%`} onChange={(v) => set({ voice: v / 100 })} />}
      <div className="space-y-1">
        <div className="text-[12px] text-fg-2">Even out the loudness</div>
        <Choices<string>
          value={fx.loudness ?? 'off'}
          onChange={(v) => set({ loudness: v === 'off' ? undefined : v })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'web', label: 'For the web', title: '-14 LUFS: YouTube, social media, phones' },
            { value: 'broadcast', label: 'For broadcast', title: '-23 LUFS (EBU R128)' },
          ]}
        />
      </div>
      <Toggle label="Lower the music under speech" on={!!fx.duck} onChange={(on) => set({ duck: on ? 0.6 : undefined })} title="The music (A2) gets quieter while someone speaks (A1 and A3)" />
      {fx.duck !== undefined && <SliderField label="How much lower" value={Math.round(fx.duck * 100)} min={5} max={100} zero={60} show={(v) => `${v}%`} onChange={(v) => set({ duck: v / 100 })} />}
      <Button size="sm" variant="secondary" icon={<Music size={13} />} disabled={!music.length} className="w-full" onClick={() => p.change((r) => ({ ...r, audio: (r.audio ?? []).map((a) => (a.track === 'music' ? (faded ? { ...a, fadeIn: undefined, fadeOut: undefined } : { ...a, fadeIn: a.fadeIn ?? 2, fadeOut: a.fadeOut ?? 3 }) : a)) }))}>
        {faded ? 'No fades on the music' : 'Fade the music in and out'}
      </Button>
      <p className="text-[11px] leading-snug text-fg-3">The fixes are heard in the saved video; the music’s fades, the levels and the pans are heard here too.</p>
      <div className="space-y-1.5 border-t border-line pt-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-fg-2">
          <Volume2 size={13} /> The sound picked
        </div>
        <Button size="sm" variant="secondary" icon={<AudioWaveform size={13} />} className="w-full" disabled={!target || !editSound} title={editSound ? 'Opens it in the sound editor; what you save there plays in its place' : 'The sound editor opens here'} onClick={() => target && p.onEditSound(target)}>
          Edit the sound…
        </Button>
        <p className="text-[11px] leading-snug text-fg-3">{target ? <span translate="no">{target.title}</span> : 'Pick a clip or a sound on the timeline.'}</p>
      </div>
    </div>
  );
}
