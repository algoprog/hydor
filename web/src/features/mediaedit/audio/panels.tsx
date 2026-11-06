// The sound editor's dock: the Effects rack (each effect a card: its settings and presets, bypass, on all of it or on
// a part, moved up and down by its grip; a track's own, then the whole sound's), Properties (the clip or the track
// picked), History (each step, to go back to with a click) and AI (music, a voice or a sound effect made and put in, its
// price said first; what is said, over the waveform, and filler words taken out).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, Ellipsis, GripVertical, Mic, Music, Power, Scissors, Settings2, Sparkles, Trash2, WandSparkles, X } from 'lucide-react';
import {
  clipEnd,
  clipLength,
  EFFECT_TYPES,
  EFFECTS,
  effectParams,
  readSoundClock,
  soundClock,
  type EffectInfo,
  type EffectParam,
  type SoundClip,
  type SoundEffect,
  type SoundEffectType,
  type SoundRecipe,
  type SoundTrack,
} from '@shared/mediaedit-audio';
import { Button, cx, IconButton, MenuItem, MenuSep, Popover, Segmented, Switch, Throbber } from '../../../components/ui';
import { go } from '../../../lib/nav';
import { money } from '../../images/studio/logic';
import { KeyAsk } from '../../images/studio/KeyAsk';
import { estimateMake, makeWithAi, type MakeAsk, type MakeEstimate, type MakeKind } from './api';
import type { Step } from './history';
import type { Sel } from './Tracks';
import { ScrubField, SliderField } from './ui';

// ---- the effects ------------------------------------------------------------------------------------------------------

export const GROUPS: EffectInfo['group'][] = ['Volume', 'Clean up', 'Tone', 'Dynamics', 'Time and pitch', 'Space', 'Channels'];

/** A setting as a slider (or a choice of a few), its value in its unit. */
function ParamField({ q, value, onChange, begin, end }: { q: EffectParam; value: number; onChange: (v: number) => void; begin: () => void; end: () => void }) {
  if (q.choices)
    return (
      <div className="space-y-1">
        <div className="text-[12px] text-fg-3">{q.label}</div>
        <Segmented<string> size="sm" value={String(value)} onChange={(v) => onChange(Number(v))} options={q.choices.map((c) => ({ value: String(c.value), label: c.label }))} />
      </div>
    );
  const pct = q.unit === '%';
  const off = q.offAt0 && value === 0;
  return (
    <SliderField
      label={q.label}
      value={pct ? Math.round(value * 100) : value}
      min={pct ? Math.round(q.min * 100) : q.min}
      max={pct ? Math.round(q.max * 100) : q.max}
      step={pct ? 1 : q.step}
      zero={pct ? Math.round(q.default * 100) : q.default}
      unit={off ? undefined : q.unit === ':1' ? ':1' : pct ? '%' : q.unit}
      show={off ? () => 'Off' : undefined}
      read={off ? (s) => (/off/i.test(s) ? 0 : Number(s.replace(/[^\d.]/g, '')) || 0) : undefined}
      onChange={(v) => onChange(pct ? v / 100 : v)}
      begin={begin}
      end={end}
    />
  );
}

export interface RackProps {
  recipe: SoundRecipe;
  /** Where a new effect goes: on the tracks picked (else the whole sound), on the part picked (else all of it). */
  target: { tracks: string[] | null; range: [number, number] | null };
  sel: Sel | null;
  onAdd: (type: SoundEffectType, p?: Record<string, number>) => void;
  onChange: (id: string, patch: Partial<SoundEffect>, label: string) => void;
  drag: { begin: (label: string) => void; end: () => void };
  onRemove: (id: string) => void;
  onMove: (id: string, to: number) => void;
  trackName: (id: string) => string;
  video: boolean;
}

/** What a new effect goes on, in words. */
export function targetWords(r: SoundRecipe, t: RackProps['target'], name: (id: string) => string): string {
  const where = t.tracks?.length ? (t.tracks.length === r.tracks.length && r.tracks.length > 1 ? 'every track' : t.tracks.map(name).join(', ')) : 'the whole sound';
  return t.range ? `${where}, from ${soundClock(t.range[0], 1)} to ${soundClock(t.range[1], 1)}` : where;
}

export function AddEffect({ onAdd, children, className }: { onAdd: (t: SoundEffectType, p?: Record<string, number>) => void; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((x) => !x)} className={className}>
        {children}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={250} align="end" title="Add an effect">
        {GROUPS.map((g, i) => (
          <div key={g}>
            {i > 0 && <MenuSep />}
            <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium text-fg-3">{g}</div>
            {EFFECT_TYPES.filter((t) => EFFECTS[t].group === g).map((t) => (
              <MenuItem key={t} onClick={() => (setOpen(false), onAdd(t))}>
                {EFFECTS[t].label}
              </MenuItem>
            ))}
          </div>
        ))}
      </Popover>
    </>
  );
}

export function EffectsRack(p: RackProps) {
  const effects = p.recipe.effects ?? [];
  const sections: { id: string | null; title: string; list: SoundEffect[] }[] = [
    ...p.recipe.tracks.map((t) => ({ id: t.id, title: p.trackName(t.id), list: effects.filter((e) => e.track === t.id) })).filter((s) => s.list.length),
    ...(effects.some((e) => !e.track) ? [{ id: null, title: 'The whole sound', list: effects.filter((e) => !e.track) }] : []),
  ];
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2 rounded-lg bg-bg-2 px-2.5 py-1.5 text-[11.5px] leading-snug text-fg-3">
        <span className="min-w-0 flex-1">
          New effects go on <span className="text-fg-2">{targetWords(p.recipe, p.target, p.trackName)}</span>.
        </span>
      </div>
      {!effects.length && <p className="px-0.5 text-[12px] leading-snug text-fg-3">Add an effect: it changes nothing of the sound itself, and stays here to change, switch off or take out.</p>}
      {sections.map((s) => (
        <Section key={s.id ?? 'all'} title={s.title} list={s.list} {...p} />
      ))}
    </div>
  );
}

function Section({ title, list, ...p }: RackProps & { title: string; list: SoundEffect[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<{ id: string; at: number } | null>(null);
  const grip = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const where = (y: number) => {
      const cards = [...(box.current?.querySelectorAll<HTMLElement>('[data-fx]') ?? [])];
      let at = cards.length;
      for (const [i, c] of cards.entries()) {
        const r = c.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          at = i;
          break;
        }
      }
      return at;
    };
    const move = (ev: PointerEvent) => setDrop({ id, at: where(ev.clientY) });
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      const at = where(ev.clientY);
      const from = list.findIndex((x) => x.id === id);
      setDrop(null);
      if (at !== from && at !== from + 1) p.onMove(id, at > from ? at - 1 : at);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="space-y-1.5">
      <div translate="no" className="px-0.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
        {title}
      </div>
      <div ref={box} className="space-y-1.5">
        {list.map((e, i) => (
          <div key={e.id} data-fx={e.id}>
            {drop && drop.at === i && drop.id !== e.id && <div className="mb-1 h-0.5 rounded bg-accent" />}
            <Card e={e} index={i} count={list.length} grip={(ev) => grip(ev, e.id)} {...p} />
          </div>
        ))}
        {drop && drop.at === list.length && <div className="h-0.5 rounded bg-accent" />}
      </div>
    </div>
  );
}

function Card({ e, index, count, grip, ...p }: RackProps & { e: SoundEffect; index: number; count: number; grip: (ev: React.PointerEvent) => void }) {
  const info = EFFECTS[e.type];
  const pr = effectParams(e);
  const [menu, setMenu] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const [rangeMenu, setRangeMenu] = useState(false);
  const rref = useRef<HTMLButtonElement>(null);
  const set = (id: string, v: number) => p.onChange(e.id, { p: { ...pr, [id]: v } }, info.label);
  const preset = info.presets?.find((x) => Object.entries(x.p).every(([k, v]) => pr[k] === v));
  return (
    <div className={cx('rounded-lg border bg-panel', e.bypass ? 'border-line opacity-60' : 'border-line-2')}>
      <div className="flex h-8 items-center gap-1 pr-1 pl-0.5">
        <span onPointerDown={grip} className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-fg-3 hover:text-fg" title="Drag to move it">
          <GripVertical size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg">{info.label}</span>
        <button ref={rref} type="button" onClick={() => setRangeMenu((x) => !x)} className="tnum h-5.5 max-w-28 shrink-0 truncate rounded-md bg-bg-2 px-1.5 text-[10.5px] text-fg-2 hover:text-fg" title="What it is on">
          {e.range ? `${soundClock(e.range[0], 1)}–${soundClock(e.range[1], 1)}` : 'All of it'}
        </button>
        <Popover anchor={rref} open={rangeMenu} onClose={() => setRangeMenu(false)} width={230} align="end" title="On">
          <MenuItem checked={!e.range} onClick={() => (setRangeMenu(false), p.onChange(e.id, { range: undefined }, `${info.label} on all of it`))}>
            On all of it
          </MenuItem>
          <MenuItem disabled={!p.sel} checked={false} onClick={() => p.sel && (setRangeMenu(false), p.onChange(e.id, { range: [p.sel.a, p.sel.b] }, `${info.label} on the part picked`))}>
            On the part picked
          </MenuItem>
        </Popover>
        <button
          type="button"
          onClick={() => p.onChange(e.id, { bypass: e.bypass ? undefined : true }, e.bypass ? `${info.label} on` : `${info.label} off`)}
          aria-pressed={!e.bypass}
          title={e.bypass ? 'Off: switch it on' : 'On: switch it off (bypass)'}
          className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', e.bypass ? 'text-fg-3 hover:text-fg' : 'text-accent')}
        >
          <Power size={13} />
        </button>
        <IconButton ref={more} label="More" size="sm" className="h-6 w-6" onClick={() => setMenu((x) => !x)}>
          <Ellipsis size={14} />
        </IconButton>
        <Popover anchor={more} open={menu} onClose={() => setMenu(false)} width={200} align="end" title={info.label}>
          <MenuItem disabled={index === 0} onClick={() => (setMenu(false), p.onMove(e.id, index - 1))}>
            Move up
          </MenuItem>
          <MenuItem disabled={index >= count - 1} onClick={() => (setMenu(false), p.onMove(e.id, index + 1))}>
            Move down
          </MenuItem>
          <MenuSep />
          <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (setMenu(false), p.onRemove(e.id))}>
            Take it out
          </MenuItem>
        </Popover>
      </div>
      {(info.params.length > 0 || info.preview === 'saved') && (
        <div className="space-y-2 border-t border-line px-2.5 pt-2 pb-2.5">
          {info.presets && (
            <div className="flex flex-wrap gap-1">
              {info.presets.map((x) => (
                <button
                  key={x.label}
                  type="button"
                  onClick={() => p.onChange(e.id, { p: { ...pr, ...x.p } }, `${info.label}: ${x.label}`)}
                  className={cx('h-6 rounded-md border px-1.5 text-[11px]', preset === x ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}
                >
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {info.params.map((q) => (
            <ParamField key={q.id} q={q} value={pr[q.id]} onChange={(v) => set(q.id, v)} begin={() => p.drag.begin(info.label)} end={p.drag.end} />
          ))}
          {info.preview === 'saved' && <p className="text-[11px] leading-snug text-fg-3">Heard in the saved sound: the editor plays it without.</p>}
        </div>
      )}
    </div>
  );
}

// ---- properties ---------------------------------------------------------------------------------------------------------

export interface PropsProps {
  recipe: SoundRecipe;
  picked: { track: string; clip?: string } | null;
  onClip: (track: string, id: string, patch: Partial<SoundClip>, label: string) => void;
  onTrack: (id: string, patch: Partial<SoundTrack>, label: string) => void;
  drag: { begin: (label: string) => void; end: () => void };
  onDeleteClip: (track: string, id: string) => void;
  srcLength: (src: string) => number | undefined;
  video: boolean;
}

const time = (v: number) => soundClock(v);

export function Properties(p: PropsProps) {
  const t = p.picked ? p.recipe.tracks.find((x) => x.id === p.picked!.track) : undefined;
  const c = t && p.picked?.clip ? t.clips.find((x) => x.id === p.picked!.clip) : undefined;
  if (!t) return <p className="px-0.5 text-[12px] leading-snug text-fg-3">Click a clip, or a track’s name, to see and change it here.</p>;
  const begin = (l: string) => () => p.drag.begin(l);
  if (c) {
    const len = p.srcLength(c.src);
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <AudioLines size={13} className="shrink-0 text-fg-3" />
          <span translate="no" className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">
            {c.name || t.name || 'Clip'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
          <ScrubField label="Starts" value={c.at} step={0.001} min={0} show={time} read={readSoundClock} width={80} begin={begin('Move a clip')} end={p.drag.end} onChange={(v) => p.onClip(t.id, c.id, { at: v }, 'Move a clip')} />
          <span className="tnum self-center text-right text-[11.5px] text-fg-3">{`${soundClock(clipLength(c), 2)} long`}</span>
          <ScrubField label="From" value={c.from} step={0.001} min={0} max={c.to - 0.01} show={time} read={readSoundClock} width={80} begin={begin('Trim a clip')} end={p.drag.end} onChange={(v) => p.onClip(t.id, c.id, { from: v }, 'Trim a clip')} />
          <ScrubField label="To" value={c.to} step={0.001} min={c.from + 0.01} max={len} show={time} read={readSoundClock} width={80} begin={begin('Trim a clip')} end={p.drag.end} onChange={(v) => p.onClip(t.id, c.id, { to: v }, 'Trim a clip')} />
        </div>
        {!p.video && (
          <SliderField
            label="Speed (its pitch kept)"
            value={Math.round((c.speed ?? 1) * 100)}
            min={25}
            max={400}
            step={1}
            zero={100}
            unit="%"
            begin={begin('Clip speed')}
            end={p.drag.end}
            onChange={(v) => p.onClip(t.id, c.id, { speed: v === 100 ? undefined : v / 100 }, 'Clip speed')}
          />
        )}
        <SliderField label="Gain" value={c.gain ?? 0} min={-40} max={24} step={0.5} zero={0} unit="dB" begin={begin('Clip gain')} end={p.drag.end} onChange={(v) => p.onClip(t.id, c.id, { gain: v || undefined }, 'Clip gain')} />
        <div className="grid grid-cols-2 gap-x-2">
          <ScrubField label="Fade in" value={c.fadeIn ?? 0} step={0.01} min={0} max={clipLength(c) / 2} unit="s" width={66} begin={begin('Clip fade')} end={p.drag.end} onChange={(v) => p.onClip(t.id, c.id, { fadeIn: v || undefined }, 'Clip fade')} />
          <ScrubField label="Fade out" value={c.fadeOut ?? 0} step={0.01} min={0} max={clipLength(c) / 2} unit="s" width={66} begin={begin('Clip fade')} end={p.drag.end} onChange={(v) => p.onClip(t.id, c.id, { fadeOut: v || undefined }, 'Clip fade')} />
        </div>
        <p className="text-[11px] leading-snug text-fg-3">{`On the timeline from ${soundClock(c.at, 2)} to ${soundClock(clipEnd(c), 2)}. Drag its name bar to move it, its ends to trim it, the handles at its top corners to fade it.`}</p>
        <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} className="text-err hover:text-err" onClick={() => p.onDeleteClip(t.id, c.id)}>
          Delete the clip
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <div translate="no" className="truncate text-[12.5px] font-medium text-fg">
        {t.name || 'Track'}
      </div>
      <SliderField label="Volume" value={t.volume ?? 0} min={-60} max={12} step={0.5} zero={0} unit="dB" begin={begin('Track volume')} end={p.drag.end} onChange={(v) => p.onTrack(t.id, { volume: v || undefined }, 'Track volume')} />
      <SliderField
        label="Pan"
        value={Math.round((t.pan ?? 0) * 100)}
        min={-100}
        max={100}
        step={1}
        zero={0}
        show={(v) => (v === 0 ? 'Middle' : v < 0 ? `${-v}% left` : `${v}% right`)}
        begin={begin('Track pan')}
        end={p.drag.end}
        onChange={(v) => p.onTrack(t.id, { pan: v ? v / 100 : undefined }, 'Track pan')}
      />
      <label className="flex h-7 items-center gap-2 text-[12px] text-fg-2">
        <span className="flex-1">Mute</span>
        <Switch label="Mute" on={!!t.mute} onChange={(v) => p.onTrack(t.id, { mute: v || undefined }, v ? 'Mute a track' : 'Hear a track')} />
      </label>
      <label className="flex h-7 items-center gap-2 text-[12px] text-fg-2">
        <span className="flex-1">Solo</span>
        <Switch label="Solo" on={!!t.solo} onChange={(v) => p.onTrack(t.id, { solo: v || undefined }, v ? 'Solo a track' : 'Hear every track')} />
      </label>
      <p className="text-[11px] leading-snug text-fg-3">{`${t.clips.length} clip${t.clips.length === 1 ? '' : 's'}. Its effects are in the Effects panel, under its name.`}</p>
    </div>
  );
}

// ---- history ------------------------------------------------------------------------------------------------------------

export function HistoryList<T>({ steps, at, jump }: { steps: Step<T>[]; at: number; jump: (i: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
  }, [at]);
  return (
    <div ref={list} className="max-h-56 space-y-px overflow-y-auto">
      {steps.map((s, i) => (
        <button
          key={i}
          type="button"
          aria-current={i === at ? 'step' : undefined}
          onClick={() => jump(i)}
          className={cx('flex h-6.5 w-full items-center gap-2 rounded-md px-2 text-left text-[12px]', i === at ? 'bg-accent-soft font-medium text-fg' : i > at ? 'text-fg-3/70 hover:bg-bg-2' : 'text-fg-2 hover:bg-bg-2')}
        >
          <span className="tnum w-5 shrink-0 text-right text-[10.5px] text-fg-3">{i}</span>
          <span className="min-w-0 flex-1 truncate">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---- AI ------------------------------------------------------------------------------------------------------------------

const KINDS: { value: MakeKind; label: string; icon: ReactNode; placeholder: string }[] = [
  { value: 'music', label: 'Music', icon: <Music size={13} />, placeholder: 'Calm lo-fi piano under a voice, slow, warm' },
  { value: 'speech', label: 'A voice', icon: <Mic size={13} />, placeholder: 'The words to say' },
  { value: 'sound', label: 'A sound effect', icon: <Sparkles size={13} />, placeholder: 'A door creaks open, footsteps on wood' },
];

export interface AiProps {
  at: number;
  kind?: MakeKind;
  onMade: (r: { src: string; seconds: number; name: string; cost?: number; model: string }, kind: MakeKind) => void;
  /** The words of what is said. */
  words: { status: 'none' | 'running' | 'done' | 'failed'; progress?: number; error?: string; count: number; fillers: number; track: string };
  onReadWords: () => void;
  onFillers: () => void;
  showWords: boolean;
  setShowWords: (v: boolean) => void;
  video: boolean;
}

export function AiPanel(p: AiProps) {
  const [kind, setKind] = useState<MakeKind>(p.kind ?? 'music');
  useEffect(() => {
    if (p.kind) setKind(p.kind);
  }, [p.kind]);
  const [prompt, setPrompt] = useState('');
  const [how, setHow] = useState('');
  const [seconds, setSeconds] = useState(30);
  const [voice, setVoice] = useState('');
  const [est, setEst] = useState<MakeEstimate | null>(null);
  const [busy, setBusy] = useState<{ since: number; ctl: AbortController } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyAsk, setKeyAsk] = useState(false);
  const [, tick] = useState(0);
  const ask: MakeAsk = { kind, prompt: prompt.trim() || 'x', ...(kind !== 'speech' ? { seconds } : {}), ...(voice ? { voice } : {}), ...(how.trim() ? { how: how.trim() } : {}) };
  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        estimateMake(ask).then(
          (e) => live && (setEst(e), setVoice((v) => v || e.voice || '')),
          () => live && setEst(null),
        ),
      250,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [kind, prompt.length > 0, Math.round(prompt.length / 40), seconds]);
  useEffect(() => {
    if (!busy) return;
    const iv = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, [busy]);
  const make = async () => {
    if (!prompt.trim() || busy) return;
    if (est && !est.keySet) return setKeyAsk(true);
    setError(null);
    const ctl = new AbortController();
    setBusy({ since: Date.now(), ctl });
    try {
      const r = await makeWithAi({ ...ask, prompt: prompt.trim() }, ctl.signal);
      p.onMade(r, kind);
    } catch (e) {
      if (!ctl.signal.aborted) {
        const m = (e as Error).message;
        if (/openrouter key/i.test(m)) setKeyAsk(true);
        else setError(m);
      }
    } finally {
      setBusy(null);
    }
  };
  const price = est?.cost !== undefined ? (est.cost ? `about ${money(est.cost)}` : 'free') : null;
  const k = KINDS.find((x) => x.value === kind)!;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Make it with AI</div>
        <Segmented<MakeKind> size="sm" value={kind} onChange={setKind} options={KINDS.map((x) => ({ value: x.value, label: x.label }))} />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 3000))}
          rows={3}
          placeholder={k.placeholder}
          className="block w-full resize-none rounded-lg border border-line bg-bg-1 px-2 py-1.5 text-[12.5px] leading-snug text-fg outline-none focus:border-accent"
          aria-label={kind === 'speech' ? 'The words to say' : 'What to make'}
        />
        {kind === 'speech' && (
          <div className="space-y-1.5">
            <input value={how} onChange={(e) => setHow(e.target.value.slice(0, 300))} placeholder={est?.described ? 'A warm, slow narrator' : 'Calm and friendly'} className="h-7 w-full rounded-lg border border-line bg-bg-1 px-2 text-[12px] outline-none focus:border-accent" aria-label="How it sounds" />
            {!!est?.voices.length && (
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className="h-7 w-full rounded-lg border border-line bg-bg-1 px-1.5 text-[12px] outline-none" aria-label="Voice">
                {est.voices.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {kind !== 'speech' && <ScrubField label="Length" value={seconds} min={1} max={est?.maxSeconds ?? 300} step={1} unit="s" width={70} onChange={setSeconds} />}
        <p className="text-[11.5px] leading-snug text-fg-3">
          {est ? (est.why ?? `${est.label}${price ? `, ${price}` : ''}, through OpenRouter. It goes on a new track at the playhead.`) : <Throbber size={11} />}
        </p>
        {keyAsk && est && !est.keySet ? (
          <KeyAsk
            onSaved={() => {
              setKeyAsk(false);
              setEst((x) => (x ? { ...x, keySet: true } : x));
            }}
            onSkip={() => setKeyAsk(false)}
          />
        ) : busy ? (
          <div className="flex items-center gap-2 rounded-lg bg-bg-2 px-2.5 py-1.5 text-[12px] text-fg-2">
            <Throbber size={12} />
            <span className="min-w-0 flex-1">{`Making it · ${Math.round((Date.now() - busy.since) / 1000)} s`}</span>
            <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => busy.ctl.abort()}>
              Stop
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="primary" icon={<WandSparkles size={13} />} disabled={!prompt.trim() || !!est?.why} onClick={() => void make()} className="w-full">
            {price ? `Make it · ${price}` : 'Make it'}
          </Button>
        )}
        {error && <p className="text-[12px] leading-snug text-err">{error}</p>}
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">What is said</div>
        {p.words.status === 'done' ? (
          <>
            <label className="flex h-7 items-center gap-2 text-[12px] text-fg-2">
              <span className="flex-1">{`Show the words (${p.words.count})`}</span>
              <Switch label="Show the words" on={p.showWords} onChange={p.setShowWords} />
            </label>
            <Button size="sm" variant="secondary" icon={<Scissors size={13} />} disabled={!p.words.fillers} onClick={p.onFillers} className="w-full">
              {p.words.fillers ? `Remove filler words (${p.words.fillers})` : 'No filler words found'}
            </Button>
            <p className="text-[11px] leading-snug text-fg-3">{p.video ? 'Click a word under the waveform to pick it (Shift for more); Delete makes it silent.' : 'Click a word under the waveform to pick it (Shift for more); Delete takes it out.'}</p>
          </>
        ) : p.words.status === 'running' ? (
          <div className="flex items-center gap-2 text-[12px] text-fg-2">
            <Throbber size={12} />
            {`Reading what is said${p.words.progress ? ` · ${Math.round(p.words.progress * 100)}%` : ''}`}
          </div>
        ) : (
          <>
            <Button size="sm" variant="secondary" icon={<AudioLines size={13} />} onClick={p.onReadWords} className="w-full">
              Read what is said
            </Button>
            <p className="text-[11px] leading-snug text-fg-3">{`Speech recognition on this computer reads the words of ${p.words.track}, free: they show under its waveform, to cut by the word and to take out filler words (um, uh).`}</p>
            {p.words.status === 'failed' && p.words.error && (
              <div className="space-y-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-2 text-[12px] leading-snug text-fg-2">
                <p>{p.words.error}</p>
                {/Settings → Voice/.test(p.words.error) && (
                  <Button size="sm" variant="ghost" icon={<Settings2 size={13} />} onClick={() => go('/settings?s=voice')}>
                    Open Settings → Voice
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

