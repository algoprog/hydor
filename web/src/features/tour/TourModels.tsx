// The tour's model steps, made for a first look rather than for every option (Settings → Models keeps those), and
// short enough that each page fits the screen. OpenRouter is a key, then the four models the app suggests for Custom,
// from fast and cheap to the best, with a search for any other in their place; the next page is the models that make
// pictures, music, voices and videos. This computer is what it has and the models suggested for it
// (GET /api/models/picks), each a click to install: they run with vLLM by default, which the tour never needs to
// name; Settings → Models changes how. All of it reads and changes the same state as Settings.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, Clapperboard, Cpu, Download, Image as ImageIcon, KeyRound, Mic, Music, Plus, Search, X } from 'lucide-react';
import type { ModelsState, OpenRouterModel } from '@shared/types';
import type { ImageModel, ImagesState } from '@shared/images';
import type { AudioModel, VideoModel, VideosState } from '@shared/media';
import { OPENROUTER_PICKS, type LocalPickView, type OpenRouterRole } from '@shared/model-picks';
import { api, post, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, Throbber } from '../../components/ui';
import { dollars, shortGpu, size, useModels } from '../settings/ModelsSettings';

/** Rows of a list on one quiet panel. */
const panel = 'overflow-hidden rounded-2xl bg-panel/70 ring-1 ring-line divide-y divide-line';

function Wait({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-6 text-[13.5px] text-fg-3">
      <Throbber size={18} /> {label}
    </div>
  );
}

/** A small heading over a list, and what goes with it on the right. */
function Label({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-8 items-center gap-3 text-[13px]">
      <span className="font-medium text-fg-2">{children}</span>
      <span className="flex-1" />
      {aside}
    </div>
  );
}

/** Add, or Added (a click takes it out again); Use, or In use, for the models that make things. */
function Toggle({ on, onClick, name, words = ['Add', 'Added'] }: { on: boolean; onClick: () => void; name: string; words?: [string, string] }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `${words[1]}: ${name}` : `${words[0]} ${name}`}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors',
        on ? 'text-fg-2 hover:bg-bg-2' : 'text-fg-2 ring-1 ring-line-2 ring-inset hover:bg-bg-2 hover:text-fg',
      )}
    >
      {on ? <Check size={14} className="text-ok" /> : <Plus size={14} />}
      {on ? words[1] : words[0]}
    </button>
  );
}

// ---- OpenRouter ----------------------------------------------------------------------------------------

/** OpenRouter: its key, then the models it suggests for Custom. */
export function TourOpenRouter() {
  const st = useModels();
  if (!st) return <Wait label="Looking at your models…" />;
  return st.openrouter.keyHint ? <OrPicks st={st} /> : <OrKey />;
}

/** The models that make pictures, music, voices and videos: OpenRouter's key first, if it is not set yet. */
export function TourMedia() {
  const st = useModels();
  if (!st) return <Wait label="Looking at your models…" />;
  return st.openrouter.keyHint ? <MediaPicks /> : <OrKey />;
}

function OrKey() {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try {
      await put('/api/models', { openrouterKey: key.trim() });
      setKey('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <ol className="mb-5 space-y-2.5 text-[14px] text-fg-2">
        {[
          <>
            Make a free account at{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
              openrouter.ai
              <ArrowUpRight size={13} />
            </a>{' '}
            and add a little credit.
          </>,
          'Create a key there: a long code that starts with sk-or-.',
          'Paste it here.',
        ].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="tour-num">{i + 1}</span>
            <span className="min-w-0 pt-px text-balance">{t}</span>
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim() && !busy) void connect();
        }}
        className="flex items-center gap-2 rounded-xl bg-panel/80 p-1.5 pl-4 ring-1 ring-line transition-[box-shadow] focus-within:ring-2 focus-within:ring-accent/45"
      >
        <KeyRound size={17} className="shrink-0 text-fg-3" />
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste your key: sk-or-…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Your OpenRouter key"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
        />
        <Button type="submit" variant="primary" className="h-9 rounded-lg px-4" disabled={!key.trim() || busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
      </form>
    </div>
  );
}

/** What a model that makes things costs, in words: an image, a song, a second. */
const usd = (n: number) => (n >= 0.095 ? n.toFixed(2) : String(Number(n.toPrecision(1))));

/** A sound model's price as it is sold: a song, a second, or about a minute of speech. */
const audioPrice = (m: AudioModel) =>
  m.free ? 'Free' : m.perSong ? `$${usd(m.perSong)} a song` : m.perSecond ? `$${usd(m.perSecond)} a second` : m.perMinute ? `about $${usd(m.perMinute)} a minute of speech` : undefined;

interface MediaInfo {
  label: string;
  price?: string;
}

/** The models that make pictures, music, voices and videos, as their own lists describe them, and which is in use. */
function useMedia() {
  const [using, setUsing] = useState<Partial<Record<Exclude<OpenRouterRole, 'text'>, string>>>({});
  const [info, setInfo] = useState<Record<string, MediaInfo>>({});
  const [audio, setAudio] = useState(true);
  useEffect(() => {
    let alive = true;
    api<ImagesState>('/api/images/settings').then((s) => alive && setUsing((u) => ({ ...u, image: s.using })), () => {});
    api<VideosState>('/api/videos/settings').then((s) => alive && setUsing((u) => ({ ...u, video: s.using })), () => {});
    api<{ usingMusic?: string; usingSpeech?: string }>('/api/audio/settings').then(
      (s) => alive && setUsing((u) => ({ ...u, music: s.usingMusic, speech: s.usingSpeech })),
      () => alive && setAudio(false),
    );
    const add = (list: { id: string; label: string; price?: string }[]) => alive && setInfo((m) => ({ ...m, ...Object.fromEntries(list.map((x) => [x.id, { label: x.label, price: x.price }])) }));
    api<{ models: ImageModel[] }>('/api/images/models?q=seedream').then((r) => add(r.models.map((m) => ({ id: m.id, label: m.label, price: m.perImage ? `about $${usd(m.perImage)} a picture` : undefined }))), () => {});
    api<{ models: VideoModel[] }>('/api/videos/models?q=seedance').then((r) => add(r.models.map((m) => ({ id: m.id, label: m.label, price: m.perSecond ? `$${usd(m.perSecond)} a second` : undefined }))), () => {});
    for (const kind of ['music', 'speech'])
      api<{ models: AudioModel[] }>(`/api/audio/models?kind=${kind}`).then(
        (r) => add(r.models.map((m) => ({ id: m.id, label: m.label, price: audioPrice(m) }))),
        () => {},
      );
    return () => {
      alive = false;
    };
  }, []);
  const use = (role: Exclude<OpenRouterRole, 'text'>, id: string) => {
    setUsing((u) => ({ ...u, [role]: id }));
    const done = (p: Promise<unknown>) => p.catch(toastError);
    if (role === 'image') done(put('/api/images/settings', { model: id }));
    else if (role === 'video') done(put('/api/videos/settings', { model: id }));
    else done(put('/api/audio/settings', { [role]: id }));
  };
  return { using, info, use, audio };
}

const ROLE_ICON: Record<Exclude<OpenRouterRole, 'text'>, ReactNode> = {
  image: <ImageIcon size={16} />,
  music: <Music size={16} />,
  speech: <Mic size={16} />,
  video: <Clapperboard size={16} />,
};

/** A model's name from its id, until its list says better: "bytedance-seed/seedream-5-0-pro" → "Seedream 5 0 Pro". */
const nameOf = (id: string) =>
  id
    .split('/')
    .pop()!
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** A model's price per million tokens, in and out, for its row's tooltip. */
const priceWords = (m: OpenRouterModel) => (m.price ? `${dollars(m.price.input)} in, ${dollars(m.price.output)} out, per million tokens (about ¾ of a word each)` : undefined);

/** The models suggested for Custom, four rows; a search shows up to four others in their place. */
function OrPicks({ st }: { st: ModelsState }) {
  const [text, setText] = useState<(OpenRouterModel & { note: string })[] | null>(null);
  const [q, setQ] = useState<string | null>(null);
  const [hits, setHits] = useState<OpenRouterModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ models: (OpenRouterModel & { note: string })[] }>('/api/models/openrouter/picks').then(
      (r) => setText(r.models),
      () => setText([]),
    );
  }, []);
  const words = q?.trim() ?? '';
  useEffect(() => {
    if (!words) return setHits(null);
    let alive = true;
    setBusy(true);
    const t = setTimeout(
      () =>
        api<{ models: OpenRouterModel[] }>(`/api/models/openrouter?${new URLSearchParams({ q: words })}`)
          .then((r) => alive && setHits(r.models.slice(0, 4)), toastError)
          .finally(() => alive && setBusy(false)),
      220,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [words]);
  const pinned = new Set(st.openrouter.pinned.map((m) => m.id));
  const save = (body: Record<string, unknown>) => put('/api/models', body).catch(toastError);
  const toggle = (id: string) => save(pinned.has(id) ? { unpin: id } : { pin: id });
  const missing = (text ?? []).filter((m) => !pinned.has(m.id));
  const addAll = async () => {
    for (const m of missing) await save({ pin: m.id });
  };
  const searching = q !== null;
  const rows: (OpenRouterModel & { note?: string })[] | null = words ? hits : text;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px]">
        <span className="h-2 w-2 rounded-full bg-ok" />
        <span className="font-medium text-fg">Connected</span>
        <span className="font-mono text-[12.5px] text-fg-3">{st.openrouter.keyHint}</span>
        <button type="button" onClick={() => save({ openrouterKey: null })} className="text-fg-3 underline-offset-2 transition-colors hover:text-fg hover:underline">
          Use another key
        </button>
      </div>
      <Label
        aside={
          <>
            {!searching && missing.length > 1 && (
              <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => void addAll()}>
                {`Add all ${missing.length}`}
              </Button>
            )}
            <button
              type="button"
              onClick={() => setQ((x) => (x === null ? '' : null))}
              aria-pressed={searching}
              aria-label={searching ? 'Back to the suggested models' : 'Search all of OpenRouter’s models'}
              title={searching ? 'Back to the suggested models' : 'Search all of OpenRouter’s models'}
              className="rounded-lg p-1.5 text-fg-3 transition-colors hover:bg-fg/[0.06] hover:text-fg"
            >
              {searching ? <X size={15} /> : <Search size={15} />}
            </button>
          </>
        }
      >
        Models for your agent
      </Label>
      {searching && (
        <div className="relative mb-2">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-3" />
          <input
            autoFocus
            value={q ?? ''}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              setQ(null);
            }}
            placeholder="deepseek, qwen, kimi…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Search OpenRouter's models"
            className="h-10 w-full rounded-xl bg-panel/80 pr-10 pl-10 text-[14px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent/45"
          />
          {busy && <Throbber className="absolute top-1/2 right-3.5 -translate-y-1/2 text-fg-3" />}
        </div>
      )}
      {!rows ? (
        words ? null : <Wait label="Finding them…" />
      ) : rows.length ? (
        <div className={panel}>
          {rows.map((m) => {
            const org = m.org ?? (m.detail ?? m.id).replace(/^openrouter\//, '').split('/')[0];
            return (
              <div key={m.id} className="flex min-h-12 items-center gap-3 px-4 py-2" title={priceWords(m)}>
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                  <span className="text-[14px] font-medium text-fg">{m.label}</span>
                  {m.note && <span className="tour-note">{m.note}</span>}
                </div>
                <span className="shrink-0 text-[12.5px] text-fg-3 max-sm:hidden">{org}</span>
                <Toggle on={pinned.has(m.id)} onClick={() => toggle(m.id)} name={m.label} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl px-4 py-4 text-[13px] text-fg-3 ring-1 ring-line">Nothing by that name.</div>
      )}
      <p className="mt-2.5 text-[12.5px] text-balance text-fg-3">You pick among those you add under the message box, when Custom Agent does the work.</p>
    </div>
  );
}

/** The models that make pictures, music, voices and videos: one for each, in use or a click away. */
function MediaPicks() {
  const media = useMedia();
  const picks = OPENROUTER_PICKS.filter((p) => p.role !== 'text' && (media.audio || (p.role !== 'music' && p.role !== 'speech')));
  return (
    <div>
      <div className={panel}>
        {picks.map((p) => {
          const role = p.role as Exclude<OpenRouterRole, 'text'>;
          const i = media.info[p.id];
          const label = i?.label ?? nameOf(p.id);
          return (
            <div key={p.id} className="flex items-center gap-3.5 px-4 py-2.5">
              <span className="tour-media-icon">{ROLE_ICON[role]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[14px] font-medium text-fg">{label}</span>
                  <span className="tour-note">{p.note}</span>
                </div>
                <div className="tnum text-[12.5px] text-fg-3">{i?.price ?? ' '}</div>
              </div>
              <Toggle on={media.using[role] === p.id} onClick={() => media.using[role] !== p.id && media.use(role, p.id)} name={label} words={['Use', 'In use']} />
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-[12.5px] text-balance text-fg-3">
        Others, and whether agents may make each, are in{' '}
        <button type="button" className="font-medium text-accent hover:underline" onClick={() => go('/settings?s=images')}>
          Settings → Images, video and audio
        </button>
        .
      </p>
    </div>
  );
}

// ---- this computer ---------------------------------------------------------------------------------

/** The models suggested for this computer, as the server sees them; again whenever downloads or models change. */
function usePicks(st: ModelsState): LocalPickView[] | null {
  const [picks, setPicks] = useState<LocalPickView[] | null>(null);
  const sig = [st.local.map((m) => m.id).join(), st.downloads.map((d) => `${d.key}:${d.status}`).join(), st.vllm.path ?? '', st.ollama.version ?? ''].join('|');
  useEffect(() => {
    let alive = true;
    api<{ picks: LocalPickView[] }>('/api/models/picks').then(
      (r) => alive && setPicks(r.picks),
      () => alive && setPicks([]),
    );
    return () => {
      alive = false;
    };
  }, [sig]);
  return picks;
}

/** This computer, in a few words: its graphics and memory. */
function computerWords(st: ModelsState): string {
  const m = st.machine;
  if (m.apple) return `${m.apple.chip.replace(/^Apple\s+/, 'Apple ')} · ${size(m.ramBytes)} of memory, shared with its graphics`;
  if (!m.gpus.length) return `No graphics card · ${size(m.ramBytes)} of memory: small models run, slowly`;
  const kinds = new Map<string, number>();
  for (const g of m.gpus) kinds.set(shortGpu(g.name), (kinds.get(shortGpu(g.name)) ?? 0) + 1);
  const total = m.gpus.reduce((a, g) => a + g.totalBytes, 0);
  const name = [...kinds].map(([n, k]) => `${k > 1 ? `${k} × ` : ''}${n}`).join(' + ');
  return m.gpus.length > 1 ? `${name} · ${size(total)} of graphics memory in all · ${size(m.ramBytes)} of memory` : `${name} · ${size(total)} of graphics memory · ${size(m.ramBytes)} of memory`;
}

/** Models on this computer: what it has, and the suggested ones that run on it, a click to install. */
export function TourLocal() {
  const st = useModels();
  if (!st) return <Wait label="Looking at this computer…" />;
  return <Local st={st} />;
}

function Local({ st }: { st: ModelsState }) {
  const picks = usePicks(st);
  const runs = picks?.filter((p) => p.runs) ?? [];
  const not = picks?.filter((p) => !p.runs) ?? [];
  const unready = runs.some((p) => !p.ready);
  const settings = (
    <button type="button" className="font-medium text-accent hover:underline" onClick={() => go('/settings?s=models')}>
      Settings → Models
    </button>
  );
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5 text-[13.5px] text-fg-2">
        <Cpu size={16} className="shrink-0 text-fg-3" />
        <span className="min-w-0">{computerWords(st)}</span>
      </div>
      <Label>Suggested for this computer</Label>
      {!picks ? (
        <Wait label="Checking what runs well here…" />
      ) : runs.length ? (
        <div className={panel}>
          {runs.map((p) => (
            <Pick key={p.repo} p={p} st={st} />
          ))}
        </div>
      ) : (
        <p className="text-[14px] leading-relaxed text-balance text-fg-2">This computer is a little small for AI models. Pay as you go gives you the best ones without a strong computer, and you can add it any time.</p>
      )}
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-balance text-fg-3">
        {unready ? (
          <>They download now. To run them, this computer needs one more free program: {settings} sets it up.</>
        ) : (
          <>
            {not.length > 0 && (
              <span>
                <span>Too big for this computer:</span> <span translate="no">{not.map((p) => p.name).join(', ')}</span>.{' '}
              </span>
            )}
            <span>Hundreds more are in {settings}.</span>
          </>
        )}
      </p>
    </div>
  );
}

/** One suggested model: what it is good for (on hover), how it runs here; Install, its download, or Installed. */
function Pick({ p, st }: { p: LocalPickView; st: ModelsState }) {
  const [busy, setBusy] = useState(false);
  const d = p.coming ? st.downloads.find((x) => x.key === p.coming) : undefined;
  const failed = !p.have && st.downloads.find((x) => x.status === 'failed' && p.install && x.name === ('repo' in p.install ? p.install.repo : p.install.ollama));
  const pct = d?.totalBytes ? Math.min(100, (d.doneBytes / d.totalBytes) * 100) : 0;
  const speed = p.fit.tokensPerSec ? Math.max(1, Math.round(p.fit.tokensPerSec * 0.75)) : 0;
  const install = async () => {
    if (!p.install) return;
    setBusy(true);
    try {
      await post('/api/models/install', p.install);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="px-4 py-2.5" title={p.blurb}>
      <div className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-medium text-fg">{p.name}</span>
            <span className="text-[12.5px] text-fg-3">{p.maker}</span>
            {p.best && <span className="tour-note tour-note-best">Best for this computer</span>}
          </div>
          <div className="tnum mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12.5px] text-fg-3">
            <span className={cx('inline-flex items-center gap-1.5', p.fit.verdict === 'good' ? 'text-ok' : 'text-warn')}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {p.fit.verdict === 'good' ? (speed ? `Runs well: about ${speed} words a second` : 'Runs well here') : 'Runs here, slowly'}
            </span>
            <span>{size(p.sizeBytes)}</span>
            {p.vision && <span>reads pictures</span>}
          </div>
        </div>
        <div className="shrink-0">
          {p.have ? (
            <span className="inline-flex h-8 items-center gap-1.5 px-1 text-[13px] text-fg-2">
              <Check size={14} className="text-ok" /> Installed
            </span>
          ) : d ? (
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => post('/api/models/cancel', { key: d.key }).catch(toastError)}>
              Cancel
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className="rounded-full" icon={<Download size={13} />} disabled={busy || !p.install} onClick={() => void install()}>
              Install
            </Button>
          )}
        </div>
      </div>
      {d && (
        <div className="mt-2 flex items-center gap-3">
          <div className="tour-pipe h-1.5 flex-1 overflow-hidden rounded-full bg-fg/10">
            <div className="tour-pipe-water h-full rounded-full" style={{ width: `${pct || 3}%` }} />
          </div>
          <span className="tnum shrink-0 text-[12px] text-fg-3">{d.totalBytes ? `${Math.floor(pct)}%` : size(d.doneBytes)}</span>
        </div>
      )}
      {failed && !d && <div className="mt-1.5 text-[12.5px] text-err">{failed.error ?? 'The download stopped'}: try again.</div>}
    </div>
  );
}
