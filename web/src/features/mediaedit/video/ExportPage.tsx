// The Export page: ready-made settings (YouTube, Reels and TikTok, a square or portrait post), the kind of file, its
// codec (H.264, H.265, AV1 where this ffmpeg has one), what makes it (the graphics card when there is one that works, or
// the processor), its size, frames a second and quality, all of it or In to Out, where it goes; then making it, with how
// far it has got, the time left and Stop, and how it was made.
import { useEffect, useState, type ReactNode } from 'react';
import { Check, Cpu, Download, Film, Gpu, Square } from 'lucide-react';
import { viaLink } from '../../../lib/machine';
import { VIDEO_FPS, VIDEO_PRESETS, VIDEO_QUALITIES, videoClock, type VideoCodec, type VideoEditJob, type VideoQuality, type VideoRecipe } from '@shared/mediaedit-video';
import { Button, cx } from '../../../components/ui';
import { go } from '../../../lib/nav';
import { encoders, type Encoders } from './api';
import { Choices } from './shell';

export interface ExportSettings {
  kind: 'mp4' | 'mov' | 'webm' | 'gif';
  codec: VideoCodec;
  encoder: 'auto' | 'cpu';
  size?: number;
  fps?: number;
  quality: VideoQuality;
  range: 'all' | 'inout';
}

export interface Making {
  what: string;
  job?: VideoEditJob;
  startedAt: number;
  stopped?: boolean;
}

export interface ExportProps {
  recipe: VideoRecipe;
  out: { w: number; h: number };
  /** The output's size once made smaller (as set here). */
  made: { w: number; h: number };
  fps: number;
  ownFps?: number;
  length: number;
  inOut: [number | null, number | null];
  settings: ExportSettings;
  onSettings(s: ExportSettings): void;
  onShape(shape: VideoRecipe['shape']): void;
  /** Kinds of file fixed by where it is saved ("MP4" over an MP4). */
  fixed?: string;
  plans: { main: { label: string; says: string }; copy: { label: string; says: string } | null };
  making: Making | null;
  last: VideoEditJob | null;
  onMake(what: 'main' | 'copy' | 'gif'): void;
  onStop(): void;
  hasCaptions: boolean;
  onSrt(): void;
  onVtt(): void;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-medium text-fg-2">{title}</div>
      {children}
    </div>
  );
}

export function ExportPage(p: ExportProps) {
  const [enc, setEnc] = useState<Encoders | null>(null);
  useEffect(() => {
    encoders().then(setEnc, () => setEnc(null));
  }, [p.last]);
  const s = p.settings;
  const set = (patch: Partial<ExportSettings>) => p.onSettings({ ...s, ...patch });
  const gpu = enc?.gpu;
  const preset = VIDEO_PRESETS.find((x) => x.shape === (p.recipe.shape ?? '') && x.size === s.size && x.codec === s.codec && s.kind === 'mp4');
  const short = Math.min(p.out.w, p.out.h);
  const inOut = p.inOut[0] !== null || p.inOut[1] !== null;
  const gpuWords = !gpu
    ? ''
    : gpu.forcedOff
      ? 'Turned off on this computer: made on the processor.'
      : gpu.mode === 'off'
        ? 'Turned off in Settings: made on the processor.'
        : gpu.found
          ? `${gpu.found.label}${gpu.broken?.length ? ' (it failed an edit: the processor makes them until the app starts again)' : ''}`
          : gpu.checked
            ? 'No graphics card that makes videos was found: made on the processor.'
            : 'Tried the first time a video is made: if it cannot, the processor makes it.';
  const m = p.making;
  const pct = m?.job?.status === 'running' && m.job.progress !== undefined ? m.job.progress : null;
  const elapsed = m ? (Date.now() - m.startedAt) / 1000 : 0;
  const left = pct && pct > 0.02 ? (elapsed * (1 - pct)) / pct : null;
  return (
    <div className="flex h-full min-h-0">
      <div className="w-[260px] shrink-0 space-y-1.5 overflow-y-auto border-r border-line bg-panel p-3">
        <div className="pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Ready-made</div>
        {VIDEO_PRESETS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => {
              p.onShape(x.shape);
              set({ kind: 'mp4', codec: x.codec, size: x.size });
            }}
            className={cx('flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left', preset?.id === x.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-bg-2')}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center">
              <span className="rounded-[3px] border-[1.5px] border-current text-fg-2" style={{ width: x.shape === '9:16' ? 14 : x.shape === '4:5' ? 20 : x.shape === '1:1' ? 22 : 28, height: x.shape === '9:16' ? 26 : x.shape === '4:5' ? 25 : x.shape === '1:1' ? 22 : 16 }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-fg">{x.label}</span>
              <span className="block text-[11px] text-fg-3">{`${x.shape}, ${x.size === 2160 ? '4K' : `${x.size}p`}, H.264`}</span>
            </span>
            {preset?.id === x.id && <Check size={14} className="shrink-0 text-accent" />}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Group title="Kind of file">
              <Choices<string>
                value={s.kind}
                onChange={(v) => set({ kind: v as ExportSettings['kind'] })}
                options={[
                  { value: 'mp4', label: 'MP4' },
                  { value: 'mov', label: 'MOV' },
                  { value: 'webm', label: 'WebM' },
                  // At someone's link it is saved over the video alone, as the video it is.
                  ...(viaLink ? [] : [{ value: 'gif', label: 'GIF' }]),
                ]}
              />
            </Group>
            <Group title="Codec">
              <Choices<string>
                value={s.kind === 'webm' ? 'vp9' : s.kind === 'gif' ? 'gif' : s.codec}
                onChange={(v) => (v === 'h264' || v === 'h265' || v === 'av1') && set({ codec: v })}
                options={
                  s.kind === 'webm'
                    ? [{ value: 'vp9', label: 'VP9' }]
                    : s.kind === 'gif'
                      ? [{ value: 'gif', label: 'GIF' }]
                      : [
                          { value: 'h264', label: 'H.264', title: 'Plays everywhere' },
                          ...(enc?.h265 || gpu?.found?.encoders.h265 ? [{ value: 'h265', label: 'H.265', title: 'Smaller files; not every browser plays it' }] : []),
                          ...(enc?.av1 || gpu?.found?.encoders.av1 ? [{ value: 'av1', label: 'AV1', title: 'The smallest files; newer players' }] : []),
                        ]
                }
              />
            </Group>
          </div>
          <Group title="Made on">
            <Choices<string>
              value={s.encoder}
              onChange={(v) => set({ encoder: v === 'cpu' ? 'cpu' : 'auto' })}
              options={[
                { value: 'auto', label: 'The graphics card when it can' },
                { value: 'cpu', label: 'The processor' },
              ]}
            />
            <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-3">
              {gpu?.found && s.encoder === 'auto' ? <Gpu size={13} className="mt-px shrink-0 text-ok" /> : <Cpu size={13} className="mt-px shrink-0" />}
              <span translate="no">{s.kind === 'mp4' || s.kind === 'mov' ? gpuWords : 'WebM and GIF are made on the processor.'}</span>
              <button type="button" onClick={() => go('/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos')} className="shrink-0 text-accent hover:underline">
                Settings
              </button>
            </p>
          </Group>
          <div className="grid gap-4 sm:grid-cols-2">
            <Group title="Size">
              <select
                value={s.size ? String(s.size) : ''}
                onChange={(e) => set({ size: e.target.value ? Number(e.target.value) : undefined })}
                className="h-7 w-full rounded-md border border-line bg-bg-1 px-1.5 text-[12px]"
                aria-label="Size"
              >
                <option value="">{`As the edit (${p.out.w} × ${p.out.h})`}</option>
                {[2160, 1440, 1080, 720, 480].filter((x) => x !== short).map((x) => (
                  <option key={x} value={x}>
                    {x === 2160 ? '4K (2160p)' : `${x}p`}
                  </option>
                ))}
              </select>
              <p className="tnum text-[11.5px] text-fg-3">{`${p.made.w} × ${p.made.h}${Math.min(p.made.w, p.made.h) > short ? ' · larger than the clips: they may look soft' : ''}`}</p>
            </Group>
            <Group title="Frames a second">
              <Choices<string>
                value={s.fps ? String(s.fps) : 'own'}
                onChange={(v) => set({ fps: v === 'own' ? undefined : Number(v) })}
                options={[{ value: 'own', label: p.ownFps ? `As made (${Math.round(p.ownFps * 100) / 100})` : 'As made', title: 'As the first video' }, ...VIDEO_FPS.filter((x) => x !== 50 && x !== Math.round(p.ownFps ?? 0)).map((x) => ({ value: String(x), label: String(x) }))]}
              />
            </Group>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Group title="Quality">
              <Choices<string> value={s.quality} onChange={(v) => set({ quality: v as VideoQuality })} options={VIDEO_QUALITIES.map((q) => ({ value: q.id, label: q.label }))} />
            </Group>
            <Group title="What is made">
              <Choices<string>
                value={inOut ? s.range : 'all'}
                onChange={(v) => set({ range: v === 'inout' ? 'inout' : 'all' })}
                options={[{ value: 'all', label: 'All of it' }, ...(inOut ? [{ value: 'inout', label: 'In to Out' }] : [])]}
              />
              <p className="tnum text-[11.5px] text-fg-3">{videoClock(s.range === 'inout' && inOut ? (p.inOut[1] ?? p.length) - (p.inOut[0] ?? 0) : p.length)}</p>
            </Group>
          </div>
          {p.fixed && <p className="text-[12px] text-fg-2">{`Saved over it, it keeps its kind of file (${p.fixed}).`}</p>}
          <div className="space-y-1 border-t border-line pt-3 text-[12px] leading-snug text-fg-3">
            {[p.plans.main.says, p.plans.copy?.says].filter(Boolean).map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
          {m ? (
            <div className="space-y-2 rounded-xl border border-line bg-bg-1 p-3">
              <div className="flex items-center gap-2 text-[12.5px] text-fg">
                <Film size={14} className="text-accent" />
                <span className="min-w-0 flex-1 truncate">{m.stopped ? 'Stopping' : m.job?.status === 'queued' ? 'Waiting for the edits before it' : `${m.what}${pct !== null ? ` · ${Math.round(pct * 100)}%` : ''}`}</span>
                <span className="tnum text-[11.5px] text-fg-3">{left !== null ? `About ${videoClock(left)} left` : videoClock(elapsed)}</span>
                <Button size="sm" variant="ghost" icon={<Square size={11} fill="currentColor" />} disabled={m.stopped} onClick={p.onStop}>
                  Stop
                </Button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(pct ?? 0) * 100}%` }} />
              </div>
              {m.job?.made && <p className="text-[11.5px] text-fg-3">{m.job.made.gpu ? `On the graphics card (${m.job.made.by})` : 'On the processor'}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Film size={14} />} onClick={() => p.onMake(s.kind === 'gif' ? 'gif' : 'main')}>
                {s.kind === 'gif' ? 'Make the GIF' : p.plans.main.label}
              </Button>
              {p.plans.copy && s.kind !== 'gif' && (
                <Button variant="secondary" onClick={() => p.onMake('copy')}>
                  {p.plans.copy.label}
                </Button>
              )}
              {p.hasCaptions && (
                <>
                  <Button variant="ghost" icon={<Download size={14} />} onClick={p.onSrt}>
                    The captions as .srt
                  </Button>
                  <Button variant="ghost" icon={<Download size={14} />} onClick={p.onVtt}>
                    The captions as .vtt
                  </Button>
                </>
              )}
            </div>
          )}
          {p.last && p.last.status === 'done' && (
            <p className="flex items-center gap-1.5 text-[12px] text-fg-2">
              <Check size={13} className="text-ok" />
              {`${p.last.made?.gpu ? `Made on the graphics card (${p.last.made.by})` : 'Made on the processor'}${p.last.endedAt ? ` in ${videoClock((p.last.endedAt - p.last.startedAt) / 1000)}` : ''}${p.last.bytes ? ` · ${(p.last.bytes / 1048576).toFixed(1)} MB` : ''}`}
              {p.last.note && <span className="text-fg-3">{` · ${p.last.note}`}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
