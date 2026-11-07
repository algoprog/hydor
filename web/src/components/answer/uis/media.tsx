// The answer UIs for media and events (galleries, videos, sounds, tracks, films and books, events, colour palettes, news): their views, by name (shared/answer-ui/media.ts has what each takes).
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  GalleryHorizontal,
  Gamepad2,
  GraduationCap,
  Headphones,
  LayoutGrid,
  MapPin,
  Music,
  Pause,
  Play,
  Search,
  Sparkles,
  Ticket,
  Tv,
} from 'lucide-react';
import { videoEmbed } from '@shared/app-media';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { mu } from '../../../lib/machine';
import { cx } from '../../ui';
import { arr, Btn, Card, Chip, Copy, download, fmtDate, fmtNum, fmtTime, Head, hostOf, isObj, Md, num, obj, parseDate, Pic, Seg, Stars, str, useAui, useKept, Video, words, youTubeId, type AnswerUiView, type Data } from '../kit';

// ---- small parts these views share ------------------------------------------------------------------------------------

const isWeb = (u: string) => /^https?:\/\//i.test(u);
/** A path on this computer (or a file: address), as opposed to an address on the web. */
const isLocal = (u: string) => !!u && (!/^[a-z][a-z0-9+.-]*:/i.test(u) || /^file:/i.test(u));
/** Markdown as plain words: for a picture's alt text, a calendar entry. */
const plain = (md: string) =>
  md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const clamp = (v: unknown, n: number) => Math.min(Math.max(0, Math.round(num(v) ?? 0)), Math.max(0, n - 1));
const appLocale = () => LOCALE ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');

/** "1:23", "1:02:03", "2m 5s" or a number of seconds, as seconds; null when it is none of these. */
function seconds(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  const s = str(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d+):(\d{2})$/.exec(s);
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  const t = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?$/i.exec(s);
  return t && (t[1] || t[2] || t[3]) ? Number(t[1] ?? 0) * 3600 + Number(t[2] ?? 0) * 60 + Number(t[3] ?? 0) : null;
}
/** Seconds as a clock: 83 → "1:23". */
function clock(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
/** A length as given ("5:24"), or a number of seconds as a clock. */
const lengthText = (v: unknown) => (typeof v === 'number' ? clock(v) : str(v));

/** A link that looks like a small button. */
function LinkButton({ href, icon, children, title }: { href: string; icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12px] font-medium text-fg transition-colors hover:bg-bg-2">
      {icon}
      {children}
    </a>
  );
}

/** A small button of the same look. */
function SmallButton({ onClick, icon, children, on, disabled, title }: { onClick: () => void; icon?: ReactNode; children?: ReactNode; on?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={on}
      className={cx(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        on ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-panel text-fg hover:bg-bg-2',
        !children && 'w-7 justify-center px-0',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ---- a video that can start at a moment ------------------------------------------------------------------------------

/** The player's address, made to start playing at `s` seconds. */
function embedAt(embed: string, s: number): string {
  const base = embed.replace(/([?&])start=\d+&?/, '$1').replace(/[?&]$/, '');
  const join = base.includes('?') ? '&' : '?';
  return /player\.vimeo\.com/.test(base) ? `${base}${join}autoplay=1#t=${Math.floor(s)}s` : `${base}${join}autoplay=1&start=${Math.floor(s)}`;
}

/**
 * A video as the kit's Video plays it (YouTube and Vimeo once clicked, a file of this computer here, anything else a
 * link), which a chapter or a trailer button starts at a moment: `jump` (n counts the asks, so the same moment again
 * starts it again).
 */
function VideoPlayer({ url, title, jump }: { url: string; title?: string; jump: { s: number; n: number } | null }) {
  const { offline, cwd } = useAui();
  const ref = useRef<HTMLVideoElement>(null);
  const embed = offline ? null : videoEmbed(url);
  const local = !embed && isLocal(url);
  useEffect(() => {
    const el = ref.current;
    if (!el || !jump) return;
    el.currentTime = jump.s;
    el.play().catch(() => {});
  }, [jump]);
  if (embed && jump)
    return (
      <div className="aui-video">
        <iframe key={jump.n} src={embedAt(embed, jump.s)} title={title || tr('Video')} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 h-full w-full border-0" />
      </div>
    );
  if (local) {
    const file = url.replace(/^file:\/\//i, '');
    const path = file.startsWith('/') || file.startsWith('~') || !cwd ? file : `${cwd.replace(/\/$/, '')}/${file}`;
    return <video ref={ref} src={mu(`/api/fs/raw?path=${encodeURIComponent(path)}`)} controls preload="metadata" className="aui-video-file" />;
  }
  return <Video url={url} title={title} />;
}

// ---- a gallery -----------------------------------------------------------------------------------------------------------

interface Shot {
  src: string;
  caption: string;
  credit: string;
  page: string;
}

function Credit({ shot }: { shot: Shot }) {
  if (!shot.credit && !isWeb(shot.page)) return null;
  return (
    <span className="mt-0.5 block text-[11px] text-fg-3">
      {isWeb(shot.page) ? (
        <a href={shot.page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-fg hover:underline">
          {shot.credit || hostOf(shot.page)}
          <ExternalLink size={10} className="shrink-0 opacity-70" />
        </a>
      ) : (
        shot.credit
      )}
    </span>
  );
}

function Gallery({ data, done }: { data: Data; done: boolean }) {
  const shots: Shot[] = arr(data.images ?? data.photos ?? data.pictures ?? data.items)
    .map((x) => {
      if (!isObj(x)) return { src: str(x), caption: '', credit: '', page: '' };
      const src = str(x.src ?? x.image) || str(x.url);
      return { src, caption: str(x.caption ?? x.title), credit: str(x.credit ?? x.author ?? x.by), page: str(x.page ?? x.link ?? x.source) || (str(x.src ?? x.image) ? str(x.url) : '') };
    })
    .filter((s) => s.src);
  const [layout, setLayout] = useKept<'grid' | 'carousel' | ''>('layout', '');
  const mode = layout || (str(data.layout).toLowerCase() === 'carousel' ? 'carousel' : 'grid');
  const [at, setAt] = useKept<number>('at', 0);
  const cur = clamp(at, shots.length);
  const group = shots.map((s) => s.src);
  const go = (i: number) => done && setAt((i + shots.length) % shots.length);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') go(cur + 1);
    else if (e.key === 'ArrowLeft') go(cur - 1);
  };
  const shot = shots[cur];
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          done && shots.length > 1 ? (
            <Seg
              size="sm"
              options={[
                {
                  value: 'grid',
                  label: (
                    <span className="inline-flex items-center" title={tr('Grid')}>
                      <LayoutGrid size={13} />
                      <span className="sr-only">{tr('Grid')}</span>
                    </span>
                  ),
                },
                {
                  value: 'carousel',
                  label: (
                    <span className="inline-flex items-center" title={tr('One at a time')}>
                      <GalleryHorizontal size={13} />
                      <span className="sr-only">{tr('One at a time')}</span>
                    </span>
                  ),
                },
              ]}
              value={mode as 'grid' | 'carousel'}
              onChange={(v) => setLayout(v)}
            />
          ) : undefined
        }
      />
      {mode === 'carousel' && shot ? (
        <div>
          <div className="relative outline-none" tabIndex={shots.length > 1 ? 0 : -1} onKeyDown={onKey} aria-roledescription="carousel">
            <Pic src={shot.src} alt={plain(shot.caption)} group={group} fit="contain" className="aspect-[16/10] w-full rounded-xl bg-bg-1" />
            {shots.length > 1 && (
              <>
                <button type="button" disabled={!done} onClick={() => go(cur - 1)} aria-label={tr('Previous')} className="absolute top-1/2 left-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 disabled:opacity-40">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" disabled={!done} onClick={() => go(cur + 1)} aria-label={tr('Next')} className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 disabled:opacity-40">
                  <ChevronRight size={18} />
                </button>
                <span className="pointer-events-none absolute right-2.5 bottom-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11.5px] font-medium text-white tabular-nums">{`${cur + 1} / ${shots.length}`}</span>
              </>
            )}
          </div>
          {(shot.caption || shot.credit || shot.page) && (
            <div className="mt-2 text-[13.5px] text-fg-2">
              <Md text={shot.caption} inline />
              <Credit shot={shot} />
            </div>
          )}
          {shots.length > 1 && (
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {shots.map((s, i) => (
                <button key={i} type="button" disabled={!done} onClick={() => setAt(i)} aria-label={`${i + 1}`} className={cx('shrink-0 rounded-lg p-0.5 transition-colors', i === cur ? 'bg-accent' : 'hover:bg-bg-3')}>
                  <Pic src={s.src} alt="" zoom={false} className="h-12 w-[72px] rounded-md" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={cx('grid gap-x-2.5 gap-y-3', shots.length > 1 && 'grid-cols-2 @xl:grid-cols-3')}>
          {shots.map((s, i) => (
            <figure key={i} className="m-0 min-w-0">
              <Pic src={s.src} alt={plain(s.caption)} group={group} className={cx('w-full rounded-lg', shots.length > 1 ? 'aspect-[4/3]' : 'aspect-[16/10]')} />
              {(s.caption || s.credit || s.page) && (
                <figcaption className="mt-1.5 px-0.5 text-[12.5px] leading-snug text-fg-2">
                  <Md text={s.caption} inline />
                  <Credit shot={s} />
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---- videos --------------------------------------------------------------------------------------------------------------

function Videos({ data, done }: { data: Data; done: boolean }) {
  const videos = arr(data.videos ?? data.items)
    .map((v) => (isObj(v) ? v : { url: str(v) }))
    .filter((v) => str(v.url ?? v.link));
  const [at, setAt] = useKept<number>('at', 0);
  const [jump, setJump] = useState<{ s: number; n: number } | null>(null);
  const cur = clamp(at, videos.length);
  const v = videos[cur];
  const url = v ? str(v.url ?? v.link) : '';
  const chapters = arr(v?.chapters)
    .filter(isObj)
    .map((c) => ({ s: seconds(c.time ?? c.start ?? c.at), title: str(c.title ?? c.name) }))
    .filter((c): c is { s: number; title: string } => c.s !== null && !!c.title);
  const pick = (i: number) => {
    setAt(i);
    setJump(null);
  };
  const meta = (x: Data) => [str(x.channel ?? x.author), lengthText(x.duration)].filter(Boolean);
  return (
    <Card>
      <Head title={data.title} />
      {v && (
        <>
          <VideoPlayer key={`${cur}:${url}`} url={url} title={str(v.title)} jump={jump} />
          <div className="mt-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] leading-snug font-semibold">{str(v.title) || hostOf(url)}</div>
              {meta(v).length > 0 && <div className="mt-0.5 text-[12.5px] text-fg-3 tabular-nums">{meta(v).join(' · ')}</div>}
            </div>
            {isWeb(url) && (
              <a href={url} target="_blank" rel="noopener noreferrer" title={hostOf(url)} aria-label={hostOf(url)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
                <ExternalLink size={14} />
              </a>
            )}
          </div>
          {str(v.description) && <Md text={v.description} className="mt-1.5 text-[13px] text-fg-2" />}
          {chapters.length > 0 && (
            <div className="mt-3">
              <div className="aui-h4 mb-1">{tr('Chapters')}</div>
              <ol className="m-0 -mx-2 grid list-none gap-x-2 p-0 @lg:grid-cols-2">
                {chapters.map((c, i) => (
                  <li key={i} className="min-w-0">
                    <button
                      type="button"
                      disabled={!done}
                      onClick={() => setJump((j) => ({ s: c.s, n: (j?.n ?? 0) + 1 }))}
                      className={cx('flex w-full items-baseline gap-2.5 rounded-md px-2 py-1 text-left text-[13px] transition-colors hover:bg-bg-2', jump?.s === c.s && 'bg-bg-2')}
                    >
                      <span className="w-11 shrink-0 text-[12px] font-semibold text-accent tabular-nums">{clock(c.s)}</span>
                      <span className="min-w-0">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
      {videos.length > 1 && (
        <div className="mt-4 border-t border-line pt-3">
          <ul className="m-0 -mx-1.5 list-none space-y-0.5 p-0">
            {videos.map((x, i) => {
              const u = str(x.url ?? x.link);
              const yt = youTubeId(u);
              const len = lengthText(x.duration);
              return (
                <li key={i}>
                  <button type="button" disabled={!done && i !== cur} onClick={() => pick(i)} aria-current={i === cur} className={cx('flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors', i === cur ? 'bg-bg-1' : 'hover:bg-bg-1')}>
                    <span className="relative shrink-0">
                      <Pic src={yt ? `https://i.ytimg.com/vi/${yt}/mqdefault.jpg` : x.thumbnail ?? x.image} alt="" zoom={false} className="h-[54px] w-24 rounded-md" />
                      {i === cur ? (
                        <span className="absolute inset-0 grid place-items-center rounded-md bg-black/45 text-white">
                          <Play size={16} fill="currentColor" />
                        </span>
                      ) : (
                        len && <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[10.5px] font-medium text-white tabular-nums">{len}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('line-clamp-2 text-[13px] leading-snug font-medium', i === cur && 'text-accent')}>{str(x.title) || hostOf(u)}</span>
                      {str(x.channel ?? x.author) && <span className="block truncate text-[12px] text-fg-3">{str(x.channel ?? x.author)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---- sounds to play ------------------------------------------------------------------------------------------------------

function AudioPlayer({ data, done }: { data: Data; done: boolean }) {
  const tracks = arr(data.tracks ?? data.items ?? data.sounds)
    .map((t) => (isObj(t) ? t : { src: str(t) }))
    .map((t) => ({ src: str(t.src ?? t.url ?? t.file ?? t.path).trim(), title: str(t.title ?? t.name), artist: str(t.artist ?? t.by), duration: lengthText(t.duration), image: str(t.image ?? t.cover) }))
    .filter((t) => t.src || t.title);
  const { cwd } = useAui();
  const audio = useRef<HTMLAudioElement>(null);
  const [cur, setCur] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const fileUrl = (src: string) => {
    const file = src.replace(/^file:\/\//i, '');
    const path = file.startsWith('/') || file.startsWith('~') || !cwd ? file : `${cwd.replace(/\/$/, '')}/${file}`;
    return mu(`/api/fs/raw?path=${encodeURIComponent(path)}`);
  };
  const play = (i: number) => {
    const el = audio.current;
    if (!el || !done) return;
    if (cur === i) {
      if (el.paused) el.play().catch(() => {});
      else el.pause();
      return;
    }
    setCur(i);
    setTime(0);
    setLength(0);
    el.src = fileUrl(tracks[i].src);
    el.play().catch(() => {});
  };
  // The next sound of this computer plays when one ends.
  const next = () => {
    if (cur === null) return;
    const j = tracks.findIndex((t, k) => k > cur && isLocal(t.src) && !failed[k]);
    if (j >= 0) play(j);
  };
  useEffect(() => () => audio.current?.pause(), []);
  const web = tracks.some((t) => isWeb(t.src));
  return (
    <Card>
      <Head title={data.title} />
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), next())}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLength(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onError={() => cur !== null && (setFailed((f) => ({ ...f, [cur]: true })), setPlaying(false))}
        className="hidden"
      />
      <ul className="m-0 -mx-2 list-none space-y-0.5 p-0">
        {tracks.map((t, i) => {
          const local = isLocal(t.src);
          const on = cur === i;
          const name = t.title || t.src.split(/[\\/]/).pop() || t.src;
          return (
            <li key={i} className={cx('flex items-center gap-3 rounded-xl px-2 py-2 transition-colors', on ? 'bg-bg-1' : 'hover:bg-bg-1/70')}>
              {t.image ? (
                <Pic src={t.image} alt="" zoom={false} className="h-12 w-12 shrink-0 rounded-lg" />
              ) : (
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-bg-2 text-fg-3">
                  <Music size={18} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[14px] leading-snug font-medium">{name}</div>
                {t.artist && <div className="line-clamp-2 text-[12.5px] text-fg-3">{t.artist}</div>}
                {on && local && length > 0 && (
                  <input
                    type="range"
                    min={0}
                    max={length}
                    step={0.1}
                    value={Math.min(time, length)}
                    onChange={(e) => audio.current && (audio.current.currentTime = Number(e.target.value))}
                    aria-label={tr('Position')}
                    className="mt-1 block h-1 w-full cursor-pointer accent-[var(--accent)]"
                  />
                )}
                {failed[i] && <div className="text-[12px] text-err">{tr('This file could not be played.')}</div>}
              </div>
              <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{on && length > 0 ? `${clock(time)} / ${clock(length)}` : t.duration}</span>
              {local && t.src ? (
                <button type="button" disabled={!done} onClick={() => play(i)} aria-label={on && playing ? tr('Pause') : tr('Play')} title={on && playing ? tr('Pause') : tr('Play')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50">
                  {on && playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
                </button>
              ) : isWeb(t.src) ? (
                <a href={t.src} target="_blank" rel="noopener noreferrer" title={tr('Opens in a tab of its own')} aria-label={`${tr('Listen')}: ${name}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 text-[12.5px] font-medium text-fg transition-colors hover:bg-bg-2 @md:px-3">
                  <Play size={11} fill="currentColor" />
                  <span className="hidden @md:inline">{tr('Listen')}</span>
                  <ExternalLink size={11} className="opacity-60" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {web && done && <div className="mt-2 text-[11.5px] text-fg-3">{tr('Sounds from the web open in a tab of their own.')}</div>}
    </Card>
  );
}

// ---- songs -----------------------------------------------------------------------------------------------------------------

const SERVICES = [
  { key: 'youtube', name: 'YouTube', search: (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  { key: 'spotify', name: 'Spotify', search: (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  { key: 'apple', name: 'Apple Music', search: (q: string) => `https://music.apple.com/search?term=${encodeURIComponent(q)}` },
] as const;

function Songs({ data, done }: { data: Data; done: boolean }) {
  const tracks = arr(data.tracks ?? data.songs ?? data.items)
    .filter(isObj)
    .map((t) => ({
      title: str(t.title ?? t.name ?? t.song),
      artist: str(t.artist ?? t.by) || words(t.artists).join(', '),
      album: str(t.album),
      year: str(t.year),
      cover: str(t.cover ?? t.image ?? t.art),
      duration: lengthText(t.duration),
      why: str(t.why ?? t.note),
      links: obj(t.links),
    }))
    .filter((t) => t.title);
  const anyCover = tracks.some((t) => t.cover);
  const listText = () => tracks.map((t, i) => `${i + 1}. ${t.title}${t.artist ? ` — ${t.artist}` : ''}${t.album ? ` (${t.album}${t.year ? `, ${t.year}` : ''})` : ''}`).join('\n');
  return (
    <Card>
      <Head title={data.title} aside={done && tracks.length > 1 ? <Copy text={listText} label={tr('Copy the list')} /> : undefined} />
      <ol className="m-0 list-none divide-y divide-line/70 p-0">
        {tracks.map((t, i) => {
          const q = [t.title, t.artist].filter(Boolean).join(' ');
          const from = [t.album, t.year].filter(Boolean).join(', ');
          return (
            <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className="w-4 shrink-0 pt-0.5 text-right text-[12px] font-medium text-fg-3 tabular-nums">{i + 1}</span>
              {anyCover && <Pic src={t.cover} alt={t.album || t.title} className="h-14 w-14 shrink-0 rounded-md" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-[14.5px] leading-snug font-semibold">{t.title}</span>
                  {t.duration && <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{t.duration}</span>}
                </div>
                {(t.artist || from) && (
                  <div className="text-[12.5px] text-fg-2">
                    {t.artist}
                    {from && <span className="text-fg-3">{t.artist ? ` · ${from}` : from}</span>}
                  </div>
                )}
                {t.why && <Md text={t.why} className="mt-1 text-[13px] text-fg-3" />}
                {q && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SERVICES.map((s) => {
                      const given = str(t.links[s.key]);
                      const direct = isWeb(given);
                      return (
                        <a
                          key={s.key}
                          href={direct ? given : s.search(q)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={direct ? undefined : tr('Search on {0}').replace('{0}', s.name)}
                          className="inline-flex h-6 items-center gap-1 rounded-full border border-line px-2 text-[11.5px] font-medium text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
                        >
                          {direct ? <Play size={9} fill="currentColor" /> : <Search size={10} />}
                          {s.name}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---- films, books and more -------------------------------------------------------------------------------------------

/** Each kind's poster shape, and the icon of where to find one. */
const KINDS: Record<string, { poster: string; icon: LucideIcon }> = {
  movie: { poster: 'aspect-[2/3]', icon: Tv },
  show: { poster: 'aspect-[2/3]', icon: Tv },
  anime: { poster: 'aspect-[2/3]', icon: Tv },
  book: { poster: 'aspect-[2/3]', icon: BookOpen },
  game: { poster: 'aspect-[3/4]', icon: Gamepad2 },
  podcast: { poster: 'aspect-square', icon: Headphones },
  album: { poster: 'aspect-square', icon: Headphones },
  course: { poster: 'aspect-video', icon: GraduationCap },
};

function MediaItem({ it, kind, done }: { it: Data; kind: string; done: boolean }) {
  const { offline } = useAui();
  const [trailer, setTrailer] = useState(false);
  const title = str(it.title ?? it.name);
  const url = str(it.url ?? it.link);
  const rating = num(it.rating);
  const stars = rating === null ? null : rating > 5 && rating <= 10 ? rating / 2 : rating;
  const ratings = arr(it.ratings)
    .filter(isObj)
    .map((r) => ({ source: str(r.source ?? r.name), value: str(r.value ?? r.score) }))
    .filter((r) => r.value);
  const genres = words(it.genres ?? it.genre);
  const where = arr(it.where ?? it.watch ?? it.available)
    .map((w) => (isObj(w) ? { name: str(w.name), url: str(w.url) } : { name: str(w), url: '' }))
    .filter((w) => w.name);
  const trailerUrl = str(it.trailer);
  const inPlace = !offline && !!videoEmbed(trailerUrl);
  const K = KINDS[kind] ?? KINDS.movie;
  const course = kind === 'course';
  const facts = [str(it.creator ?? it.director ?? it.author), str(it.length ?? it.runtime)].filter(Boolean);
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex gap-3.5 @md:gap-4">
        <Pic src={it.image ?? it.poster ?? it.cover} alt={title} className={cx('shrink-0 self-start rounded-lg', course ? 'w-[120px] @md:w-[148px]' : 'w-[84px] @md:w-[104px]', K.poster)} />
        <div className="min-w-0 flex-1">
          <h4 className="m-0 text-[15.5px] leading-snug font-semibold">
            {isWeb(url) ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-accent hover:underline">
                {title}
              </a>
            ) : (
              title
            )}
            {str(it.year) && <span className="ml-1.5 text-[13.5px] font-normal text-fg-3">{str(it.year)}</span>}
          </h4>
          {facts.length > 0 && <div className="mt-0.5 text-[12.5px] text-fg-2">{facts.join(' · ')}</div>}
          {(stars !== null || ratings.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {stars !== null && <Stars value={stars} size={12} />}
              {ratings.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px]">
                  {r.source && <span className="text-fg-3">{r.source}</span>}
                  <span className="font-semibold tabular-nums">{r.value}</span>
                </span>
              ))}
            </div>
          )}
          {genres.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {genres.map((g, i) => (
                <Chip key={i}>{g}</Chip>
              ))}
            </div>
          )}
          {str(it.summary ?? it.description) && <Md text={it.summary ?? it.description} className="mt-2 text-[13px] text-fg-2" />}
          {str(it.why) && (
            <div className="mt-2 flex gap-2 rounded-lg bg-accent-soft/50 px-2.5 py-1.5 text-[13px]">
              <Sparkles size={13} className="mt-[3px] shrink-0 text-accent" />
              <Md text={it.why} inline className="min-w-0" />
            </div>
          )}
          {(trailerUrl || where.length > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {trailerUrl &&
                (inPlace ? (
                  <SmallButton on={trailer} disabled={!done} onClick={() => setTrailer((x) => !x)} icon={<Play size={11} fill="currentColor" />}>
                    {tr('Trailer')}
                  </SmallButton>
                ) : (
                  isWeb(trailerUrl) && (
                    <LinkButton href={trailerUrl} icon={<Play size={11} fill="currentColor" />}>
                      {tr('Trailer')}
                    </LinkButton>
                  )
                ))}
              {where.map((w, i) =>
                isWeb(w.url) ? (
                  <a key={i} href={w.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-bg-2 px-2 text-[12px] font-medium text-fg transition-colors hover:bg-bg-3">
                    <K.icon size={12} className="text-fg-3" />
                    {w.name}
                    <ExternalLink size={10} className="opacity-60" />
                  </a>
                ) : (
                  <span key={i} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-bg-2 px-2 text-[12px] font-medium text-fg-2">
                    <K.icon size={12} className="text-fg-3" />
                    {w.name}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      </div>
      {trailer && inPlace && (
        <div className="mt-3">
          <VideoPlayer url={trailerUrl} title={`${title}: ${tr('Trailer')}`} jump={{ s: 0, n: 1 }} />
        </div>
      )}
    </div>
  );
}

function MediaList({ data, done }: { data: Data; done: boolean }) {
  const kind = str(data.kind).toLowerCase();
  const items = arr(data.items ?? data.titles ?? data.recommendations)
    .filter(isObj)
    .filter((x) => str(x.title ?? x.name));
  return (
    <Card>
      <Head title={data.title} />
      <div className="divide-y divide-line/70">
        {items.map((it, i) => (
          <MediaItem key={i} it={it} kind={kind} done={done} />
        ))}
      </div>
    </Card>
  );
}

// ---- events --------------------------------------------------------------------------------------------------------------

type Wall = [number, number, number, number, number];

/** A local date and time as agents write it (2026-11-12T19:30, or a date alone), in parts. */
function wallParts(v: string): Wall | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)] : null;
}

/** The moment a wall-clock time in a time zone is (19:30 on 12 November in New York is 00:30 UTC the next day); null for a zone it does not know. */
function zonedInstant(p: Wall, tz: string): Date | null {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const offset = (t: number) => {
      const x = Object.fromEntries(f.formatToParts(new Date(t)).map((q) => [q.type, q.value]));
      return Date.UTC(Number(x.year), Number(x.month) - 1, Number(x.day), Number(x.hour) % 24, Number(x.minute), Number(x.second)) - t;
    };
    const wall = Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4]);
    const first = wall - offset(wall);
    return new Date(wall - offset(first));
  } catch {
    return null;
  }
}

/** When an event's time is: an explicit offset as written, else the wall time in `tz`; null for a time that floats (the device's own zone). */
function instantOf(v: string, tz: string): Date | null {
  const t = v.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(t) && /T\d/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const p = wallParts(t);
  return p && tz ? zonedInstant(p, tz) : null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const utcStamp = (d: Date) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
/** A wall time as a calendar's floating time, `minutes` later. */
function floating(p: Wall, minutes = 0): string {
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4] + minutes));
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00`;
}
const dayStamp = (p: Wall, days = 0) => {
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
};
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** A calendar line folded at 75 bytes, as calendars want them. */
function icsFold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const c = ch.codePointAt(0) ?? 0;
    const b = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (bytes + b > 74) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
const hashText = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

interface EventItem {
  title: string;
  start: string;
  end: string;
  venue: string;
  address: string;
  image: string;
  price: string;
  url: string;
  tags: string[];
  note: string;
}

/** The events as a calendar file (.ics): times in UTC when their zone is known, else as they are (the calendar's own zone). */
function calendarOf(events: EventItem[], tz: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hydor//Answer UI//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const stamp = utcStamp(new Date());
  for (const e of events) {
    const p = wallParts(e.start);
    if (!p) continue;
    lines.push('BEGIN:VEVENT', `UID:${hashText(`${e.title}|${e.start}|${e.venue}`)}@hydor`, `DTSTAMP:${stamp}`);
    const endP = wallParts(e.end);
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.start.trim())) lines.push(`DTSTART;VALUE=DATE:${dayStamp(p)}`, `DTEND;VALUE=DATE:${dayStamp(endP ?? p, 1)}`);
    else {
      const start = instantOf(e.start, tz);
      const end = e.end ? instantOf(e.end, tz) : null;
      if (start) lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end && end > start ? end : new Date(start.getTime() + 3600_000))}`);
      else lines.push(`DTSTART:${floating(p)}`, `DTEND:${endP && /\d:\d/.test(e.end) ? floating(endP) : floating(p, 60)}`);
    }
    lines.push(`SUMMARY:${icsText(plain(e.title))}`);
    const where = [e.venue, e.address].filter(Boolean).join(', ');
    if (where) lines.push(`LOCATION:${icsText(where)}`);
    const about = [plain(e.note), e.price, isWeb(e.url) ? e.url : ''].filter(Boolean).join('\n\n');
    if (about) lines.push(`DESCRIPTION:${icsText(about)}`);
    if (isWeb(e.url)) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

/** A zone's short name at a moment ("EST"), when it is not the device's own zone. */
function zoneLabel(tz: string, at: Date | null): string {
  if (!tz || !at) return '';
  try {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === tz) return '';
    return new Intl.DateTimeFormat(appLocale(), { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((x) => x.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function DateTile({ d }: { d: Date | null }) {
  return (
    <div className="flex w-[52px] shrink-0 flex-col items-center self-start overflow-hidden rounded-xl border border-line bg-panel text-center">
      <span className="w-full bg-accent-soft py-0.5 text-[10.5px] font-semibold tracking-wide text-accent uppercase">{d ? fmtDate(d, 'month') : '—'}</span>
      <span className="pt-1.5 text-[20px] leading-none font-semibold tabular-nums">{d ? fmtDate(d, 'day') : ''}</span>
      <span className="pt-0.5 pb-1.5 text-[11px] text-fg-3">{d ? fmtDate(d, 'weekday') : ''}</span>
    </div>
  );
}

const fileName = (s: string) => (plain(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event').toLowerCase();

function Events({ data, done }: { data: Data; done: boolean }) {
  const tz = str(data.timezone ?? data.tz).trim();
  const events: EventItem[] = arr(data.events ?? data.items)
    .filter(isObj)
    .map((e) => ({
      title: str(e.title ?? e.name),
      start: str(e.start ?? e.date ?? e.when),
      end: str(e.end),
      venue: str(e.venue ?? e.place ?? e.location),
      address: str(e.address),
      image: str(e.image),
      price: str(e.price),
      url: str(e.url ?? e.link),
      tags: words(e.tags),
      note: str(e.note ?? e.description),
    }))
    .filter((e) => e.title);
  const now = Date.now();
  const save = (list: EventItem[], name: string) => download(`${fileName(name)}.ics`, 'text/calendar;charset=utf-8', calendarOf(list, tz));
  const dated = events.filter((e) => wallParts(e.start));
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          done && dated.length > 1 ? (
            <Btn icon={<CalendarPlus size={14} />} onClick={() => save(dated, str(data.title) || 'events')}>
              {tr('Add all to calendar')}
            </Btn>
          ) : undefined
        }
      />
      <ul className="m-0 list-none divide-y divide-line/70 p-0">
        {events.map((e, i) => {
          const d = parseDate(e.start);
          const allDay = /^\d{4}-\d{2}-\d{2}$/.test(e.start.trim());
          const endD = parseDate(e.end);
          // Over once it has ended (in its own zone when that is known): at its end, else a day after an all-day start or three hours after a timed one.
          const startAt = allDay ? d : (instantOf(e.start, tz) ?? d);
          const endAt = !endD ? null : allDay ? endD : (instantOf(e.end, tz) ?? endD);
          const finish = endAt ? endAt.getTime() + (allDay ? 86400_000 : 0) : startAt ? startAt.getTime() + (allDay ? 86400_000 : 3 * 3600_000) : null;
          const over = finish !== null && finish < now;
          const sameDay = !!d && !!endD && d.toDateString() === endD.toDateString();
          const zone = allDay ? '' : zoneLabel(tz, instantOf(e.start, tz));
          const when = !d ? e.start : allDay ? (endD && !sameDay ? `${tr('All day')} – ${fmtDate(endD, 'dayMonth')}` : tr('All day')) : `${fmtTime(e.start)}${endD ? ` – ${sameDay ? fmtTime(e.end) : fmtDate(endD, 'dateTime')}` : ''}${zone ? ` ${zone}` : ''}`;
          return (
            <li key={i} className="flex gap-3.5 py-3.5 first:pt-0 last:pb-0">
              <DateTile d={d} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={cx('text-[15px] leading-snug font-semibold', over && 'text-fg-2')}>
                      {isWeb(e.url) ? (
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-inherit hover:text-accent hover:underline">
                          <Md text={e.title} inline />
                        </a>
                      ) : (
                        <Md text={e.title} inline />
                      )}
                    </div>
                    {when && (
                      <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-fg-2 tabular-nums">
                        <Clock size={12} className="shrink-0 text-fg-3" />
                        {when}
                      </div>
                    )}
                    {(e.venue || e.address) && (
                      <div className="mt-0.5 flex items-start gap-1.5 text-[12.5px] text-fg-2">
                        <MapPin size={12} className="mt-[3px] shrink-0 text-fg-3" />
                        <span className="min-w-0">
                          {e.venue}
                          {e.address && <span className="text-fg-3">{e.venue ? `, ${e.address}` : e.address}</span>}
                        </span>
                      </div>
                    )}
                  </div>
                  {e.image && <Pic src={e.image} alt="" className="hidden h-[72px] w-[100px] shrink-0 rounded-lg @md:block" />}
                </div>
                {e.note && <Md text={e.note} className="mt-1.5 text-[13px] text-fg-2" />}
                {(e.price || e.tags.length > 0 || over || (done && d)) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {e.price && (
                      <Chip tone={/^(free|gratis)\b/i.test(e.price) ? 'good' : 'neutral'}>
                        <Ticket size={11} className="shrink-0" />
                        {e.price}
                      </Chip>
                    )}
                    {e.tags.map((t, k) => (
                      <Chip key={k}>{t}</Chip>
                    ))}
                    {over && <Chip>{tr('Over')}</Chip>}
                    {done && d && !over && (
                      <span className="ml-auto">
                        <SmallButton icon={<CalendarPlus size={13} />} onClick={() => save([e], e.title)}>
                          {tr('Add to calendar')}
                        </SmallButton>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---- a colour palette ----------------------------------------------------------------------------------------------------

/** A colour as #RRGGBB, from "#1d3557", "1d3557", "#abc" (once the block is whole) or "rgb(29, 53, 87)"; null otherwise. */
function hexOf(v: unknown, whole: boolean): string | null {
  const t = str(v).trim();
  const s = t.replace(/^#/, '');
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return `#${s.slice(0, 6)}`.toUpperCase();
  if (whole && /^[0-9a-f]{3}$/i.test(s)) return `#${[...s].map((c) => c + c).join('')}`.toUpperCase();
  const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(t);
  return m ? `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`.toUpperCase() : null;
}
const rgbOf = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
function hslOf([r, g, b]: [number, number, number]): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}
/** WCAG's relative luminance of a colour. */
function luminance([r, g, b]: [number, number, number]): number {
  const [x, y, z] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * x + 0.7152 * y + 0.0722 * z;
}
const contrastOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** How a text colour reads on a swatch: a sample, its contrast ratio and its WCAG grade. */
function ContrastSample({ bg, ink, ratio }: { bg: string; ink: string; ratio: number }) {
  const [grade, tone] = ratio >= 7 ? ['AAA', 'good'] : ratio >= 4.5 ? ['AA', 'good'] : ratio >= 3 ? [tr('AA large'), 'warn'] : [tr('Fail'), 'bad'];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-[11.5px]" style={{ background: bg, color: ink }}>
        <span className="font-semibold">Aa</span>
        <span className="tabular-nums">{`${fmtNum(ratio, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}:1`}</span>
      </span>
      <Chip tone={tone as 'good' | 'warn' | 'bad'}>{grade}</Chip>
    </span>
  );
}

function Palette({ data, done }: { data: Data; done: boolean }) {
  const colors = arr(data.colors ?? data.colours ?? data.palette ?? data.items)
    .map((c) => (isObj(c) ? c : { hex: c }))
    .map((c) => ({ hex: hexOf(c.hex ?? c.color ?? c.colour ?? c.value, done), name: str(c.name), role: str(c.role ?? c.use) }))
    .filter((c): c is { hex: string; name: string; role: string } => !!c.hex);
  const [copied, setCopied] = useState('');
  const copy = async (hex: string) => {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = hex;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(hex);
    setTimeout(() => setCopied((c) => (c === hex ? '' : c)), 1200);
  };
  const many = colors.length > 6;
  return (
    <Card>
      <Head title={data.name ?? data.title} />
      {colors.length > 0 && (
        <div className="flex h-24 overflow-hidden rounded-xl border border-line">
          {colors.map((c, i) => {
            const lum = luminance(rgbOf(c.hex));
            const ink = contrastOf(lum, 1) >= contrastOf(lum, 0) ? '#FFFFFF' : '#000000';
            return (
              <button
                key={i}
                type="button"
                onClick={() => copy(c.hex)}
                title={done ? tr('Copy {0}').replace('{0}', c.hex) : c.hex}
                aria-label={done ? tr('Copy {0}').replace('{0}', c.hex) : c.hex}
                className="group relative min-w-0 flex-1 transition-[flex-grow] duration-200 hover:flex-[1.5]"
                style={{ background: c.hex, color: ink }}
              >
                <span className={cx('absolute inset-x-0 bottom-1.5 truncate px-1 text-center font-mono text-[11px] font-medium', many && copied !== c.hex && 'hidden group-hover:block')}>{copied === c.hex ? <Check size={14} strokeWidth={2.5} className="mx-auto" /> : c.hex}</span>
              </button>
            );
          })}
        </div>
      )}
      {colors.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-2 p-0 @xl:grid-cols-2">
          {colors.map((c, i) => {
            const rgb = rgbOf(c.hex);
            const [h, s, l] = hslOf(rgb);
            const lum = luminance(rgb);
            return (
              <li key={i} className="flex min-w-0 gap-3 rounded-xl border border-line p-2.5">
                <button type="button" onClick={() => copy(c.hex)} title={done ? tr('Copy {0}').replace('{0}', c.hex) : c.hex} aria-label={done ? tr('Copy {0}').replace('{0}', c.hex) : c.hex} className="h-[72px] w-[72px] shrink-0 rounded-lg border border-line" style={{ background: c.hex }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] font-semibold">{c.name || c.hex}</span>
                    {c.role && <span className="text-[12px] text-fg-3">{c.role}</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11.5px] text-fg-2">
                    <button type="button" onClick={() => copy(c.hex)} className="inline-flex items-center gap-1 font-medium text-fg hover:text-accent">
                      {c.hex}
                      {copied === c.hex && <Check size={12} strokeWidth={2.5} className="text-ok" />}
                    </button>
                    <span>{`rgb(${rgb.join(', ')})`}</span>
                    <span>{`hsl(${h}, ${s}%, ${l}%)`}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    <ContrastSample bg={c.hex} ink="#FFFFFF" ratio={contrastOf(lum, 1)} />
                    <ContrastSample bg={c.hex} ink="#000000" ratio={contrastOf(lum, 0)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- news ----------------------------------------------------------------------------------------------------------------

/** When a story came out: "3 hours ago", "yesterday", "4 days ago", else its date. */
function storyDate(v: string): string {
  const d = parseDate(v);
  if (!d) return v;
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400_000);
  try {
    const rtf = new Intl.RelativeTimeFormat(appLocale(), { numeric: 'auto' });
    if (days === 0 && /T\d|\d:\d/.test(v)) {
      const hours = Math.round((now.getTime() - d.getTime()) / 3600_000);
      return hours >= 1 ? rtf.format(-hours, 'hour') : rtf.format(-Math.max(1, Math.round((now.getTime() - d.getTime()) / 60_000)), 'minute');
    }
    if (days >= 0 && days < 7) return rtf.format(-days, 'day');
  } catch {}
  return fmtDate(d, d.getFullYear() === now.getFullYear() ? 'short' : 'medium');
}

interface Story {
  title: string;
  url: string;
  source: string;
  date: string;
  image: string;
  summary: string;
  tag: string;
}

function StoryMeta({ s }: { s: Story }) {
  const source = s.source || hostOf(s.url);
  if (!source && !s.date && !s.tag) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-fg-3">
      {source && <span className="font-semibold text-fg-2">{source}</span>}
      {source && s.date && <span aria-hidden>·</span>}
      {s.date && <time dateTime={s.date}>{storyDate(s.date)}</time>}
      {s.tag && <Chip className="ml-0.5">{s.tag}</Chip>}
    </div>
  );
}

function StoryTitle({ s, className }: { s: Story; className: string }) {
  return (
    <h4 className={cx('m-0 leading-snug font-semibold', className)}>
      {isWeb(s.url) ? (
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-accent hover:underline">
          {s.title}
        </a>
      ) : (
        s.title
      )}
    </h4>
  );
}

function News({ data }: { data: Data; done: boolean }) {
  const items: Story[] = arr(data.items ?? data.articles ?? data.news ?? data.stories)
    .filter(isObj)
    .map((x) => ({ title: str(x.title ?? x.headline), url: str(x.url ?? x.link), source: str(x.source ?? x.publisher ?? x.outlet), date: str(x.date ?? x.published), image: str(x.image), summary: str(x.summary ?? x.description), tag: str(x.tag ?? x.section ?? x.topic) }))
    .filter((x) => x.title);
  const lead = items[0]?.image ? items[0] : null;
  const rest = lead ? items.slice(1) : items;
  const picture = (s: Story, className: string) => {
    const pic = <Pic src={s.image} alt="" zoom={!isWeb(s.url)} className={className} />;
    return isWeb(s.url) ? (
      <a href={s.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden className="block shrink-0">
        {pic}
      </a>
    ) : (
      pic
    );
  };
  return (
    <Card>
      <Head title={data.title} />
      {lead && (
        <article className={cx(rest.length > 0 && 'mb-3 border-b border-line pb-4')}>
          {picture(lead, 'aspect-[16/9] max-h-[320px] w-full rounded-xl')}
          <div className="mt-2.5">
            <StoryMeta s={lead} />
          </div>
          <StoryTitle s={lead} className="mt-1 text-[17px]" />
          {lead.summary && <Md text={lead.summary} className="mt-1 text-[13.5px] text-fg-2" />}
        </article>
      )}
      <ul className="m-0 list-none divide-y divide-line/70 p-0">
        {rest.map((s, i) => (
          <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <StoryMeta s={s} />
              <StoryTitle s={s} className="mt-0.5 text-[14.5px]" />
              {s.summary && <Md text={s.summary} className="mt-1 line-clamp-3 text-[13px] text-fg-2" />}
            </div>
            {s.image && picture(s, 'h-[68px] w-[92px] rounded-lg @md:h-[78px] @md:w-[112px]')}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export const MEDIA_UIS: Record<string, AnswerUiView> = {
  gallery: Gallery,
  video: Videos,
  audio: AudioPlayer,
  tracks: Songs,
  media: MediaList,
  event: Events,
  'color-palette': Palette,
  news: News,
};
