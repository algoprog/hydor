// Settings → Images, video and audio: whether agents can make images, videos and audio, and with which of
// OpenRouter's models (two image models: one for most pictures, Best, and one for simple ones, Quick: icons,
// backgrounds, textures; a video model, a music model and a voice and sound model; each list opens in a dialog, to
// search and sort), the picture tools on this computer (cutouts and erasing, free and private: set up or removed
// here, with what they are doing), and the model that writes the titles and descriptions of what you keep in the
// Library: where it runs (the app's choice, OpenRouter, Claude, a model of your own) and which. Making them uses
// the OpenRouter key from Settings → Models; without one, this says where to add it.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { AudioLines, Check, Copy, Cpu, ExternalLink, Film, HardDriveDownload, ImagePlay, KeyRound, MessagesSquare, Mic, Music, PenLine, Search, Sparkles, TriangleAlert, Type, X } from 'lucide-react';
import type { ImageModel, ImagesState } from '@shared/images';
import { clipLength, type AudioModel, type AudioState, type CaptionModelOption, type CaptionProvider, type MediaSettings, type VideoModel, type VideosState } from '@shared/media';
import { api, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, Dialog, inputCls, OptionRow, Picker, Section, Segmented, Switch, Throbber, useConfirm } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';
import { localStatus, sizeWords, useLocalTools, whereTheyRun } from './studio/LocalTools';
import { GpuSetting } from '../mediaedit/video/GpuSetting';

const DAY = 86_400_000;
const usd = (n: number) => (n >= 0.095 ? n.toFixed(2) : String(Number(n.toPrecision(1))));
export const aboutPrice = (n?: number) => (n == null ? undefined : `about $${usd(n)} an image`);
const perSecond = (m: VideoModel) => (m.perSecond == null ? undefined : m.perSecondMax && m.perSecondMax > m.perSecond * 1.05 ? `$${usd(m.perSecond)} to $${usd(m.perSecondMax)} a second` : `$${usd(m.perSecond)} a second`);
const lengths = (d: number[]) => (!d.length ? undefined : d.length === 1 ? clipLength(d[0]) : `${d[0]} to ${clipLength(d[d.length - 1])}`);
/** Dollars to two figures: sounds are sold by small amounts ("$0.0025 a second"). */
const usd2 = (n: number) => (n >= 0.095 ? n.toFixed(2) : String(Number(n.toPrecision(2))));
/** What a sound model costs, the way it is sold: a song, a second, a thousand characters, about a minute of speech. */
const audioPrice = (m: AudioModel) =>
  m.free
    ? 'Free'
    : m.perSong
      ? m.maxSeconds && m.maxSeconds <= 30
        ? `$${usd2(m.perSong)} a clip`
        : `$${usd2(m.perSong)} a song`
      : m.perSecond
        ? `$${usd2(m.perSecond)} a second`
        : m.perChar
          ? `$${usd2(m.perChar * 1000)} per 1,000 characters`
          : m.perMinute
            ? `about $${usd2(m.perMinute)} a minute`
            : undefined;

function Mark({ name }: { name: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="org-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-semibold" style={{ '--h': h } as CSSProperties} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Tag({ children, icon, title, tone }: { children: ReactNode; icon?: ReactNode; title?: string; tone?: 'accent' }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] leading-[17px] font-medium whitespace-nowrap', tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-bg-2 text-fg-2 ring-1 ring-line')}>
      {icon}
      {children}
    </span>
  );
}

/** One model in a list: its maker's mark, name, tags, maker, price, date and id. */
function Row({ id, label, org, created, tags, facts, selected, onPick }: { id: string; label: string; org?: string; created?: number; tags: ReactNode; facts: (string | undefined)[]; selected?: boolean; onPick?: () => void }) {
  const fresh = !!created && Date.now() - created < 30 * DAY;
  const body = (
    <>
      <Mark name={org ?? id.split('/')[0]} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-[13.5px] leading-5 font-medium text-fg">{label}</span>
          {fresh && <Tag tone="accent">New</Tag>}
          {tags}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-fg-3">
          {org && <span className="text-fg-2">{org}</span>}
          {facts.filter(Boolean).map((f) => (
            <span key={f}>{f}</span>
          ))}
          {created && <span>{new Date(created).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' })}</span>}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-fg-3/80">{id}</div>
      </div>
      {selected && <Check size={16} strokeWidth={2.5} className="mt-1 shrink-0 text-accent" />}
    </>
  );
  return onPick ? (
    <button type="button" onClick={onPick} aria-pressed={selected} className={cx('flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-1', selected && 'bg-accent-soft/60')}>
      {body}
    </button>
  ) : (
    <div className="flex items-start gap-3 px-3 py-2.5">{body}</div>
  );
}

function ImageRow({ m, selected, onPick }: { m: ImageModel; selected?: boolean; onPick?: () => void }) {
  return (
    <Row
      id={m.id}
      label={m.label}
      org={m.org}
      created={m.created}
      selected={selected}
      onPick={onPick}
      facts={[aboutPrice(m.perImage)]}
      tags={
        <>
          {m.edits && (
            <Tag icon={<PenLine size={11} />} title="Takes pictures to change or follow">
              Edits
            </Tag>
          )}
          {m.textOut && (
            <Tag icon={<Type size={11} />} title="Writes text with its images">
              <span className="max-sm:hidden">Text too</span>
            </Tag>
          )}
        </>
      }
    />
  );
}

function VideoRow({ m, selected, onPick }: { m: VideoModel; selected?: boolean; onPick?: () => void }) {
  const top = m.resolutions[m.resolutions.length - 1];
  return (
    <Row
      id={m.id}
      label={m.label}
      org={m.org}
      created={m.created}
      selected={selected}
      onPick={onPick}
      facts={[perSecond(m), lengths(m.durations), top ? `up to ${top}` : undefined]}
      tags={
        <>
          {m.audio && (
            <Tag icon={<AudioLines size={11} />} title="Makes sound with the picture">
              Sound
            </Tag>
          )}
          {m.frames.includes('first_frame') && (
            <Tag icon={<ImagePlay size={11} />} title="Starts from a picture you give">
              <span className="max-sm:hidden">From a picture</span>
            </Tag>
          )}
          {m.videoIn && (
            <Tag icon={<PenLine size={11} />} title="Changes a video you give it">
              Edits videos
            </Tag>
          )}
        </>
      }
    />
  );
}

function AudioRow({ m, selected, onPick }: { m: AudioModel; selected?: boolean; onPick?: () => void }) {
  return (
    <Row
      id={m.id}
      label={m.label}
      org={m.org}
      created={m.created}
      selected={selected}
      onPick={onPick}
      facts={[audioPrice(m), m.maxSeconds ? `up to ${clipLength(m.maxSeconds)}` : undefined, m.voices?.length ? (m.voices.length === 1 ? '1 voice' : `${m.voices.length} voices`) : undefined]}
      tags={
        <>
          {m.kind === 'music' && (
            <Tag icon={<Music size={11} />} title="Makes songs and music">
              Music
            </Tag>
          )}
          {m.prompted && (
            <Tag icon={<AudioLines size={11} />} title="Makes sound effects and ambience as well as voices, from a description">
              <span className="max-sm:hidden">Sounds too</span>
            </Tag>
          )}
          {m.cloning && (
            <Tag icon={<Copy size={11} />} title="Speaks in a voice copied from short recordings you give it">
              <span className="max-sm:hidden">Copies voices</span>
            </Tag>
          )}
          {m.multiSpeaker && (
            <Tag icon={<MessagesSquare size={11} />} title="Voices a conversation, each speaker in their own voice">
              <span className="max-sm:hidden">Conversations</span>
            </Tag>
          )}
          {m.kind === 'speech' && !m.prompted && m.instructions && (
            <Tag icon={<Mic size={11} />} title="Takes directions for the delivery: tone, pace, emotion">
              <span className="max-sm:hidden">Directed</span>
            </Tag>
          )}
        </>
      }
    />
  );
}

/** A model list to search and sort, in a dialog: image, video, music or voice models. */
function ModelDialog<T extends { id: string }>({ open, onClose, title, endpoint, hint, using, onPick, row }: { open: boolean; onClose: () => void; title: string; endpoint: string; hint: string; using: string; onPick: (id: string) => void; row: (m: T, selected: boolean, pick: () => void) => ReactNode }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'picks' | 'new' | 'price'>('picks');
  const [list, setList] = useState<T[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy(true);
    const t = setTimeout(
      () =>
        api<{ models: T[] }>(`${endpoint}${endpoint.includes('?') ? '&' : '?'}${new URLSearchParams({ q: q.trim(), sort })}`)
          .then((r) => alive && setList(r.models), (e) => alive && (setList([]), toastError(e)))
          .finally(() => alive && setBusy(false)),
      q ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, q, sort, endpoint]);
  return (
    <Dialog open={open} onClose={onClose} title={title} width={620}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={hint} spellCheck={false} className={cx(inputCls, 'pr-9 pl-9')} />
          {busy ? (
            <Throbber className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-3" />
          ) : (
            q && (
              <button type="button" aria-label="Clear" onClick={() => setQ('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg">
                <X size={13} />
              </button>
            )
          )}
        </div>
        <Segmented
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'picks', label: 'Suggested' },
            { value: 'new', label: 'Newest' },
            { value: 'price', label: 'Cheapest' },
          ]}
        />
      </div>
      {list && (
        <div className="mt-2.5 max-h-[min(520px,60dvh)] divide-y divide-line overflow-y-auto overscroll-contain rounded-xl border border-line">
          {list.length ? (
            list.map((m) =>
              row(m, m.id === using, () => {
                onPick(m.id);
                onClose();
              }),
            )
          ) : (
            <div className="px-3 py-6 text-center text-[12.5px] text-fg-3">{q ? 'No model matches.' : 'OpenRouter’s list could not be loaded.'}</div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** The model in use, with Change, and a way back to the app's choice. */
function ModelLine({ label, picked, onChange, onAuto, children }: { label: string; picked: boolean; onChange: () => void; onAuto: () => void; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
        <span className="text-[12px] text-fg-3">{picked ? 'The one you picked' : 'The app’s choice, until you pick one'}</span>
      </div>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-line">
        <div className="min-w-0 flex-1">{children}</div>
        <button type="button" onClick={onChange} className="shrink-0 border-l border-line px-3.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-bg-1">
          Change
        </button>
      </div>
      {picked && (
        <button type="button" onClick={onAuto} className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
          <Sparkles size={12} /> Let the app choose instead
        </button>
      )}
    </div>
  );
}

// ---- captions ------------------------------------------------------------------------------------------------

const PROVIDERS: { id: CaptionProvider; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automatic', hint: 'A cheap model through OpenRouter when you have a key, else Claude Haiku' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'Any model in its catalog that sees images, with your key' },
  { id: 'claude', label: 'Claude', hint: 'Through your Claude Code sign-in' },
  { id: 'ollama', label: 'Ollama', hint: 'A model on this computer that sees images' },
  { id: 'vllm', label: 'vLLM', hint: 'A Hugging Face model this machine runs' },
  { id: 'endpoint', label: 'Your endpoints', hint: 'An OpenAI-compatible endpoint from Settings → Models' },
];

function Captions({ st, onSave }: { st: MediaSettings; onSave: (provider: CaptionProvider, model: string) => void }) {
  const c = st.captions;
  const [models, setModels] = useState<CaptionModelOption[] | null>(null);
  const [dialog, setDialog] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const provider = PROVIDERS.find((p) => p.id === c.provider) ?? PROVIDERS[0];
  const listed = c.provider !== 'auto' && c.provider !== 'openrouter';
  useEffect(() => {
    setModels(null);
    if (!listed) return;
    api<{ models: CaptionModelOption[] }>(`/api/media/caption-models?provider=${c.provider}`).then((r) => setModels(r.models), toastError);
  }, [c.provider, listed]);
  useEffect(() => {
    if (!dialog) return;
    let alive = true;
    setBusy(true);
    const t = setTimeout(
      () =>
        api<{ models: CaptionModelOption[] }>(`/api/media/caption-models?${new URLSearchParams({ provider: 'openrouter', q: q.trim() })}`)
          .then((r) => alive && setModels(r.models), (e) => alive && toastError(e))
          .finally(() => alive && setBusy(false)),
      q ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [dialog, q]);
  const current = c.using?.label ?? (c.model || 'none');
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Picker label="Where it runs" value={provider.label} title="Where the model that writes them runs" width={320}>
          {(close) =>
            PROVIDERS.map((p) => (
              <OptionRow
                key={p.id}
                label={p.label}
                hint={p.hint}
                selected={p.id === c.provider}
                onClick={() => {
                  close();
                  if (p.id !== c.provider) onSave(p.id, p.id === 'claude' ? 'haiku' : '');
                }}
              />
            ))
          }
        </Picker>
        {c.provider === 'openrouter' && (
          <Button size="sm" variant="secondary" onClick={() => setDialog(true)}>
            {c.model ? 'Change model' : 'Pick a model'}
          </Button>
        )}
        {listed && (
          <Picker label="Model" value={models?.find((m) => m.id === c.model)?.label ?? (c.model || (models?.length ? 'Pick one' : 'None yet'))} title="The model that writes them" width={320}>
            {(close) =>
              models === null ? (
                <div className="flex justify-center py-4 text-fg-3">
                  <Throbber />
                </div>
              ) : models.length ? (
                models.map((m) => (
                  <OptionRow
                    key={m.id}
                    label={m.label}
                    hint={[m.detail, m.vision === null ? 'may not see images' : ''].filter(Boolean).join(' · ') || undefined}
                    selected={m.id === c.model}
                    onClick={() => {
                      close();
                      onSave(c.provider, m.id);
                    }}
                  />
                ))
              ) : (
                <p className="px-2.5 py-2 text-[12.5px] text-fg-3">{c.provider === 'endpoint' ? 'No endpoint in Settings → Models yet.' : 'No model here sees images yet: add one in Settings → Models.'}</p>
              )
            }
          </Picker>
        )}
      </div>
      {c.using ? (
        <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-fg-3">
          <Check size={14} className="shrink-0 text-ok" strokeWidth={2.6} />
          <span>
            Written by <span className="text-fg-2">{current}</span>
          </span>
        </div>
      ) : (
        <div className="mt-2.5 flex items-start gap-2 text-[12.5px] text-fg-3">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>{c.why ?? 'No model writes them now.'} Until then, they come from the words each was made from.</span>
        </div>
      )}
      {!st.ffmpeg && (
        <div className="mt-2.5 flex items-start gap-2 text-[12.5px] text-fg-3">
          <Film size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>ffmpeg is not on this computer, so videos are described from the words they were made from, and show without a still. Install it (on Ubuntu: sudo apt install ffmpeg), then save them again.</span>
        </div>
      )}
      <Dialog open={dialog} onClose={() => setDialog(false)} title="A model that sees images" width={560}>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: gemini, claude, qwen…" spellCheck={false} className={cx(inputCls, 'pr-9 pl-9')} />
          {busy && <Throbber className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-3" />}
        </div>
        <div className="mt-2.5 max-h-[min(480px,60dvh)] overflow-y-auto overscroll-contain rounded-xl border border-line p-1">
          {(models ?? []).map((m) => (
            <OptionRow
              key={m.id}
              label={m.label}
              hint={[m.id, m.detail].filter(Boolean).join(' · ')}
              selected={m.id === c.model}
              onClick={() => {
                setDialog(false);
                onSave('openrouter', m.id);
              }}
            />
          ))}
          {models && !models.length && <p className="px-2.5 py-4 text-center text-[12.5px] text-fg-3">No model matches.</p>}
        </div>
      </Dialog>
    </>
  );
}

// ---- the picture tools on this computer ---------------------------------------------------------------------------

/** The picture tools on this computer: what they do, free and private, how large, what they are doing; Set up or Remove. */
function PictureTools() {
  const tools = useLocalTools();
  const [confirm, confirmNode] = useConfirm();
  const s = tools.state;
  const remove = async () => {
    if (
      await confirm({
        title: 'Remove the picture tools?',
        body: 'Their Python and the models they downloaded go from this computer. Backgrounds and erasing then go through OpenRouter, priced, and pictures are no longer made larger here. You can set them up again.',
        confirm: 'Remove',
        danger: true,
      })
    )
      await tools.remove();
  };
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-line pt-3.5">
      <Cpu size={16} className="mt-0.5 shrink-0 text-fg-3" />
      <div className="min-w-[min(100%,15rem)] flex-1 space-y-1">
        <div className="text-[12.5px] font-medium text-fg-2">Picture tools on this computer</div>
        <p className="text-[12.5px] leading-snug text-fg-3">
          Take a picture’s background out, erase part of it, or make it larger, here: for nothing, and your pictures stay on this computer. About {sizeWords(s?.sizeMb ?? 145)} once, then each tool’s model the first time it is used: about 200 MB each for the background remover and the eraser, 5 MB for the upscaler.
        </p>
        {!s ? (
          <div className="flex items-center gap-2 text-[12.5px] text-fg-3">
            <Throbber /> Looking
          </div>
        ) : s.installing ? (
          <div className="flex items-center gap-2 text-[12.5px] text-fg-2">
            <Throbber className="shrink-0" />
            <span>{s.step || 'Setting up'}</span>
          </div>
        ) : (
          <div className={cx('flex flex-wrap gap-x-1.5 text-[12.5px]', s.ready ? 'text-fg-2' : 'text-fg-3')}>
            {s.ready && <Check size={14} className="mt-px shrink-0 text-ok" strokeWidth={2.6} />}
            {[...localStatus(s), ...(!s.ready && s.canInstall ? whereTheyRun(s) : [])].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
        )}
        {s?.gpuWhy && !s.installing && (
          <p className="text-[12px] leading-snug text-fg-3" translate="no">
            {s.gpuWhy}
          </p>
        )}
        {(tools.error || s?.error) && <p className="text-[12.5px] leading-snug text-err">{tools.error || s?.error}</p>}
      </div>
      {s &&
        !s.installing &&
        (s.ready ? (
          <Button size="sm" variant="ghost" onClick={() => void remove()}>
            Remove
          </Button>
        ) : (
          s.canInstall && (
            <Button size="sm" variant="secondary" icon={<HardDriveDownload size={14} />} onClick={() => void tools.setUp()}>
              Set up
            </Button>
          )
        ))}
      {confirmNode}
    </div>
  );
}

// ---- the section ----------------------------------------------------------------------------------------------

export function ImagesSettings() {
  const [img, setImg] = useState<ImagesState | null>(null);
  const [vid, setVid] = useState<VideosState | null>(null);
  const [aud, setAud] = useState<AudioState | null>(null);
  const [med, setMed] = useState<MediaSettings | null>(null);
  const [dialog, setDialog] = useState<'image' | 'quick' | 'video' | 'music' | 'speech' | null>(null);
  useEffect(() => {
    api<ImagesState>('/api/images/settings').then(setImg, toastError);
    api<VideosState>('/api/videos/settings').then(setVid, toastError);
    api<AudioState>('/api/audio/settings').then(setAud, toastError);
    api<MediaSettings>('/api/media/settings').then(setMed, toastError);
  }, []);
  const saveImg = (body: Partial<Pick<ImagesState, 'enabled' | 'model' | 'quick'>>) => put<ImagesState>('/api/images/settings', body).then(setImg, toastError);
  const saveVid = (body: Partial<Pick<VideosState, 'enabled' | 'model'>>) => put<VideosState>('/api/videos/settings', body).then(setVid, toastError);
  const saveAud = (body: Partial<Pick<AudioState, 'enabled' | 'music' | 'speech'>>) => put<AudioState>('/api/audio/settings', body).then(setAud, toastError);
  const saveCaptions = (provider: CaptionProvider, model: string) => put<MediaSettings>('/api/media/settings', { captions: { provider, model } }).then(setMed, toastError);
  if (!img || !vid || !aud || !med)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const imgModel = img.usingInfo;
  const vidModel = vid.usingInfo;
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-fg-3">
        Ask any agent for a picture, a short video, a song or a voice-over (“a logo for my bakery”, “ten seconds of waves at dusk”, “a jingle for my podcast”) and it makes it with a model through OpenRouter, once you have
        checked its settings and price on a short form. Keep what you like in your Library.
      </p>
      {!img.keySet && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5">
          <KeyRound size={16} className="shrink-0 text-warn" />
          <div className="min-w-[12rem] flex-1 text-[12.5px] leading-snug text-fg-2">
            Image, video and audio models are reached through OpenRouter, and no key is set yet.{' '}
            <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              Get one at openrouter.ai <ExternalLink size={11} />
            </a>
          </div>
          <Button size="sm" variant="primary" onClick={() => go('/settings?s=models')}>
            Add the key
          </Button>
        </div>
      )}
      <Section title="Making images" sub="Agents get a tool for it. Each image is paid for with your OpenRouter key." actions={<Switch on={img.enabled} onChange={(on) => void saveImg({ enabled: on })} label="Let agents make images" />}>
        <div className="space-y-4">
          <ModelLine label="For most pictures (Best)" picked={!!img.model} onChange={() => setDialog('image')} onAuto={() => void saveImg({ model: '' })}>
            {imgModel ? <ImageRow m={imgModel} /> : <div className="px-3 py-2.5 font-mono text-[12.5px] text-fg-2">{img.using}</div>}
          </ModelLine>
          <ModelLine label="For simple pictures (Quick): icons, backgrounds, textures" picked={!!img.quick} onChange={() => setDialog('quick')} onAuto={() => void saveImg({ quick: '' })}>
            {img.usingQuickInfo ? <ImageRow m={img.usingQuickInfo} /> : <div className="px-3 py-2.5 font-mono text-[12.5px] text-fg-2">{img.usingQuick || img.using}</div>}
          </ModelLine>
          <PictureTools />
        </div>
      </Section>
      <Section title="Making videos" sub="Agents get a tool for it. Videos cost more: cents to dollars a second, shown on the form before anything is made." actions={<Switch on={vid.enabled} onChange={(on) => void saveVid({ enabled: on })} label="Let agents make videos" />}>
        <ModelLine label="Video model" picked={!!vid.model} onChange={() => setDialog('video')} onAuto={() => void saveVid({ model: '' })}>
          {vidModel ? <VideoRow m={vidModel} /> : <div className="px-3 py-2.5 font-mono text-[12.5px] text-fg-2">{vid.using}</div>}
        </ModelLine>
      </Section>
      <Section title="Editing videos" sub="The video editor and agents’ edits make videos with ffmpeg on this computer.">
        <GpuSetting />
      </Section>
      <Section
        title="Making audio"
        sub="Agents get a tool for it: songs and jingles, voice-overs in a described voice or one copied from a recording, sound effects and ambience. Each is paid for with your OpenRouter key, its price shown first."
        actions={<Switch on={aud.enabled} onChange={(on) => void saveAud({ enabled: on })} label="Let agents make audio" />}
      >
        <div className="space-y-4">
          <ModelLine label="Music model" picked={!!aud.music} onChange={() => setDialog('music')} onAuto={() => void saveAud({ music: '' })}>
            {aud.musicInfo ? <AudioRow m={aud.musicInfo} /> : <div className="px-3 py-2.5 font-mono text-[12.5px] text-fg-2">{aud.usingMusic}</div>}
          </ModelLine>
          <ModelLine label="Voice and sound model" picked={!!aud.speech} onChange={() => setDialog('speech')} onAuto={() => void saveAud({ speech: '' })}>
            {aud.speechInfo ? <AudioRow m={aud.speechInfo} /> : <div className="px-3 py-2.5 font-mono text-[12.5px] text-fg-2">{aud.usingSpeech}</div>}
          </ModelLine>
        </div>
      </Section>
      <Section
        title="Captions in the Library"
        sub="Each picture or video you keep gets a title and a description, written by a model that sees images. It sees a video as ten of its frames on one picture; a sound, which it cannot hear, it describes from what it was made from."
      >
        <Captions st={med} onSave={(p, m) => void saveCaptions(p, m)} />
      </Section>
      <ModelDialog<ImageModel>
        open={dialog === 'image' || dialog === 'quick'}
        onClose={() => setDialog(null)}
        title={dialog === 'quick' ? 'Image model for simple pictures (Quick)' : 'Image model for most pictures (Best)'}
        endpoint="/api/images/models"
        hint="Search: flux, gemini, recraft…"
        using={dialog === 'quick' ? img.usingQuick || img.using : img.using}
        onPick={(id) => void saveImg(dialog === 'quick' ? { quick: id } : { model: id })}
        row={(m, selected, pick) => <ImageRow key={m.id} m={m} selected={selected} onPick={pick} />}
      />
      <ModelDialog<VideoModel>
        open={dialog === 'video'}
        onClose={() => setDialog(null)}
        title="Video model"
        endpoint="/api/videos/models"
        hint="Search: veo, kling, seedance…"
        using={vid.using}
        onPick={(id) => void saveVid({ model: id })}
        row={(m, selected, pick) => <VideoRow key={m.id} m={m} selected={selected} onPick={pick} />}
      />
      <ModelDialog<AudioModel>
        open={dialog === 'music'}
        onClose={() => setDialog(null)}
        title="Music model"
        endpoint="/api/audio/models?kind=music"
        hint="Search: lyria…"
        using={aud.usingMusic}
        onPick={(id) => void saveAud({ music: id })}
        row={(m, selected, pick) => <AudioRow key={m.id} m={m} selected={selected} onPick={pick} />}
      />
      <ModelDialog<AudioModel>
        open={dialog === 'speech'}
        onClose={() => setDialog(null)}
        title="Voice and sound model"
        endpoint="/api/audio/models?kind=speech"
        hint="Search: seed, elevenlabs, gemini…"
        using={aud.usingSpeech}
        onPick={(id) => void saveAud({ speech: id })}
        row={(m, selected, pick) => <AudioRow key={m.id} m={m} selected={selected} onPick={pick} />}
      />
    </div>
  );
}
