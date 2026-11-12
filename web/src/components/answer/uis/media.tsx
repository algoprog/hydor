// The answer UIs for media and events (galleries, videos, sounds, tracks, films and books, events, colour palettes, news): their views, by name (shared/answer-ui/media.ts has what each takes).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeftRight,
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
  Square,
  Ticket,
  TriangleAlert,
  Tv,
} from 'lucide-react';
import { videoEmbed } from '@shared/app-media';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { mu } from '../../../lib/machine';
import { cx } from '../../ui';
import { arr, Btn, Card, Chip, Copy, download, fmtDate, fmtNum, fmtTime, Head, hostOf, isObj, Md, num, obj, parseDate, Pic, Seg, Stars, str, textOf, useAui, useKept, usePicOk, usePicsOk, Video, WithPic, words, youTubeId, type AnswerUiView, type Data } from '../kit';

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
  // A picture that cannot load is left out, with its caption (it stays in the tree, hidden: it is asked for again, and
  // comes back if that works). The carousel moves over the ones that are there.
  const oks = usePicsOk(shots.map((s) => s.src));
  const liveIdx = shots.map((_, i) => i).filter((i) => oks[i]);
  const live = liveIdx.length;
  const at0 = clamp(at, shots.length);
  const cur = liveIdx.includes(at0) ? at0 : (liveIdx.find((i) => i > at0) ?? liveIdx[0] ?? at0);
  const pos = Math.max(0, liveIdx.indexOf(cur));
  const group = liveIdx.map((i) => shots[i].src);
  const go = (step: number) => done && live > 0 && setAt(liveIdx[(pos + step + live) % live]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  const shot = shots[cur];
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          done && live > 1 ? (
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
        <div className={cx(live === 0 && 'hidden')}>
          <div className="relative outline-none" tabIndex={live > 1 ? 0 : -1} onKeyDown={onKey} aria-roledescription="carousel">
            {shots.map((s, i) => (
              <Pic key={i} src={s.src} alt={plain(s.caption)} group={group} fit="contain" className={cx('aspect-[16/10] w-full rounded-xl bg-bg-1', i !== cur && 'hidden')} />
            ))}
            {live > 1 && (
              <>
                <button type="button" disabled={!done} onClick={() => go(-1)} aria-label={tr('Previous')} className="absolute top-1/2 left-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 disabled:opacity-40">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" disabled={!done} onClick={() => go(1)} aria-label={tr('Next')} className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 disabled:opacity-40">
                  <ChevronRight size={18} />
                </button>
                <span className="pointer-events-none absolute right-2.5 bottom-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11.5px] font-medium text-white tabular-nums">{`${pos + 1} / ${live}`}</span>
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
            <div className={cx('mt-3 flex gap-1.5 overflow-x-auto pb-1', live < 2 && 'hidden')}>
              {shots.map((s, i) => (
                <WithPic key={i} src={s.src} as="button" type="button" disabled={!done} onClick={() => setAt(i)} aria-label={`${i + 1}`} className={cx('shrink-0 rounded-lg p-0.5 transition-colors', i === cur ? 'bg-accent' : 'hover:bg-bg-3')}>
                  <Pic src={s.src} alt="" zoom={false} className="h-12 w-[72px] rounded-md" />
                </WithPic>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={cx('grid gap-x-2.5 gap-y-3', live > 1 && 'grid-cols-2 @xl:grid-cols-3')}>
          {shots.map((s, i) => (
            <WithPic key={i} as="figure" src={s.src} className="m-0 min-w-0">
              <Pic src={s.src} alt={plain(s.caption)} group={group} className={cx('w-full rounded-lg', live > 1 ? 'aspect-[4/3]' : 'aspect-[16/10]')} />
              {(s.caption || s.credit || s.page) && (
                <figcaption className="mt-1.5 px-0.5 text-[12.5px] leading-snug text-fg-2">
                  <Md text={s.caption} inline />
                  <Credit shot={s} />
                </figcaption>
              )}
            </WithPic>
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
  const thumbOf = (x: Data) => {
    const yt = youTubeId(str(x.url ?? x.link));
    return yt ? `https://i.ytimg.com/vi/${yt}/mqdefault.jpg` : (x.thumbnail ?? x.image);
  };
  const thumbOk = usePicsOk(videos.map(thumbOf));
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
              const len = lengthText(x.duration);
              return (
                <li key={i}>
                  <button type="button" disabled={!done && i !== cur} onClick={() => pick(i)} aria-current={i === cur} className={cx('flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors', i === cur ? 'bg-bg-1' : 'hover:bg-bg-1')}>
                    <span className={cx('relative shrink-0', !thumbOk[i] && 'hidden')}>
                      <Pic src={thumbOf(x)} alt="" zoom={false} className="h-[54px] w-24 rounded-md" />
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
                      {!thumbOk[i] && len && <span className="block text-[11.5px] text-fg-3 tabular-nums">{len}</span>}
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
  const coverOk = usePicsOk(tracks.map((t) => t.image));
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
              {t.image && <Pic src={t.image} alt="" zoom={false} className="h-12 w-12 shrink-0 rounded-lg" />}
              {!coverOk[i] && (
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
      <WithPic src={s.image} as="a" href={s.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden className="block shrink-0">
        {pic}
      </WithPic>
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

// ---- a picture with notes on it ------------------------------------------------------------------------------------------

/** A number held to 0–100: a place on a picture, in percent of its size. */
const pctIn = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Whether the picture in a box has loaded and has a size, checked again when the box changes size or a picture in it
 * loads: what is drawn over a picture is placed by the picture's size, so it waits for it.
 */
function usePictureIn(box: RefObject<HTMLElement | null>, src: string): boolean {
  const [ok, setOk] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    setOk(false);
    if (!el) return;
    const check = () => {
      const img = el.querySelector('img');
      setOk(!!img && img.complete && img.naturalWidth > 0 && img.clientHeight > 24);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener('load', check, true);
    return () => {
      ro.disconnect();
      el.removeEventListener('load', check, true);
    };
  }, [box, src]);
  return ok;
}

interface Spot {
  x: number | null;
  y: number | null;
  label: string;
  text: string;
}

/** The notes on a picture, placed in percent (given as shares of one, 0.42, when all of them are). */
function spotsOf(v: unknown): Spot[] {
  const raw = arr(v)
    .map((n) => (isObj(n) ? n : { label: str(n) }))
    .map((n) => ({ x: num(n.x ?? n.left), y: num(n.y ?? n.top), label: textOf(n, 'label', 'name', 'title'), text: str(n.text ?? n.note ?? n.description) }))
    .filter((n) => n.label || n.text);
  const placed = raw.filter((n) => n.x !== null && n.y !== null);
  const shares = placed.length > 0 && placed.every((n) => (n.x as number) <= 1 && (n.y as number) <= 1);
  const at = (v: number | null) => (v === null ? null : pctIn(shares ? v * 100 : v));
  return raw.map((n) => ({ ...n, x: at(n.x), y: at(n.y) }));
}

function AnnotatedImage({ data, done }: { data: Data; done: boolean }) {
  const src = str(data.image ?? data.src ?? data.picture);
  const spots = spotsOf(data.notes ?? data.markers ?? data.labels ?? data.points);
  const box = useRef<HTMLDivElement>(null);
  const ready = usePictureIn(box, src);
  const hasPic = usePicOk(src);
  // The marker under the pointer, the note under it in the list, and the one tapped (or clicked) open.
  const [over, setOver] = useState<number | null>(null);
  const [listed, setListed] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const tip = done ? (over ?? pinned) : null;
  const lit = done ? (over ?? listed ?? pinned) : null;
  const pin = (i: number) => done && setPinned((p) => (p === i ? null : i));
  const t = tip !== null ? spots[tip] : undefined;
  const placed = (s: Spot | undefined): s is Spot & { x: number; y: number } => !!s && s.x !== null && s.y !== null;
  return (
    <Card>
      <Head title={data.title} />
      {src && (
        <div
          ref={box}
          className={cx('relative', !ready && 'aspect-[16/10] overflow-hidden rounded-xl bg-bg-2', !hasPic && 'hidden')}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || pinned === null) return;
            setPinned(null);
            e.stopPropagation();
          }}
          onClickCapture={(e) => {
            // A tap beside the markers closes the open note (rather than opening the picture large).
            if (pinned === null || (e.target as HTMLElement).closest('[data-spot]')) return;
            setPinned(null);
            e.stopPropagation();
          }}
        >
          <Pic src={src} alt={str(data.alt) || str(data.title)} className="block h-auto w-full rounded-xl" />
          {ready &&
            spots.map((s, i) =>
              placed(s) ? (
                <button
                  key={i}
                  type="button"
                  data-spot
                  disabled={!done}
                  aria-label={`${i + 1}. ${s.label}`}
                  aria-expanded={tip === i}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setOver(i)}
                  onPointerLeave={() => setOver(null)}
                  onClick={() => pin(i)}
                  className={cx(
                    'absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-[11.5px] leading-none font-bold text-accent-fg tabular-nums shadow-[0_1px_5px_rgba(0,0,0,0.5)] ring-2 ring-white transition-[scale,opacity] duration-150 outline-none focus-visible:ring-4',
                    lit === i ? 'z-20 scale-[1.3]' : 'z-10',
                    lit !== null && lit !== i && 'opacity-60',
                  )}
                  style={{ left: `${s.x}%`, top: `${s.y}%` }}
                >
                  {i + 1}
                </button>
              ) : null,
            )}
          {ready && placed(t) && (
            <div
              role="tooltip"
              className={cx('absolute z-30 w-max max-w-[min(300px,86%)] rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] leading-snug shadow-pop', tip !== pinned && 'pointer-events-none')}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                translate: `${t.x < 22 ? '-14px' : t.x > 78 ? 'calc(-100% + 14px)' : '-50%'} ${t.y > 58 ? 'calc(-100% - 20px)' : '20px'}`,
              }}
            >
              <div className="font-semibold text-fg">{t.label}</div>
              {t.text && <Md text={t.text} className="mt-0.5 text-fg-2" />}
            </div>
          )}
        </div>
      )}
      {str(data.credit) && <div className="mt-1.5 text-[11px] text-fg-3">{str(data.credit)}</div>}
      {spots.length > 0 && (
        <ol className="m-0 mt-3 grid list-none gap-x-4 p-0 @xl:grid-cols-2">
          {spots.map((s, i) => (
            <li
              key={i}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setListed(i)}
              onPointerLeave={() => setListed(null)}
              onClick={() => hasPic && placed(s) && pin(i)}
              className={cx('flex min-w-0 gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors', lit === i && 'bg-accent-soft', done && hasPic && placed(s) && 'cursor-pointer')}
            >
              <span className={cx('mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums', placed(s) && hasPic ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg-3')}>{i + 1}</span>
              <div className="min-w-0">
                {s.label && <div className="font-semibold text-fg">{s.label}</div>}
                {s.text && <Md text={s.text} className="text-fg-2" />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---- before and after ----------------------------------------------------------------------------------------------------

function BeforeAfter({ data, done }: { data: Data; done: boolean }) {
  const side = (v: unknown) => {
    const o = isObj(v) ? v : { src: v };
    return { src: str(o.src ?? o.image ?? o.url), label: str(o.label ?? o.name ?? o.title) };
  };
  const before = side(data.before);
  const after = side(data.after);
  const beforeLabel = before.label || tr('Before');
  const afterLabel = after.label || tr('After');
  // The later picture lies below and gives the box its size; the earlier one lies over it, cut at the divider.
  const base = after.src || before.src;
  const over = after.src && before.src ? before.src : '';
  const [at, setAt] = useState<number | null>(null);
  const pos = at ?? pctIn(num(data.start) ?? 50);
  const box = useRef<HTMLDivElement>(null);
  const ready = usePictureIn(box, base);
  const hasBase = usePicOk(base);
  const overOk = usePicOk(over);
  const dragging = useRef<number | null>(null);
  const moveTo = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r && r.width > 0) setAt(pctIn(((x - r.left) / r.width) * 100));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!done) return;
    const step = e.shiftKey ? 10 : 2;
    const k = e.key;
    const next = k === 'ArrowLeft' || k === 'ArrowDown' ? pos - step : k === 'ArrowRight' || k === 'ArrowUp' ? pos + step : k === 'PageDown' ? pos - 10 : k === 'PageUp' ? pos + 10 : k === 'Home' ? 0 : k === 'End' ? 100 : null;
    if (next === null) return;
    e.preventDefault();
    setAt(pctIn(next));
  };
  const label = 'pointer-events-none absolute top-2.5 max-w-[45%] truncate rounded-md bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white';
  return (
    <Card>
      <Head title={data.title} />
      {base && (
        <div
          ref={box}
          className={cx('relative touch-pan-y overflow-hidden rounded-xl bg-bg-2 select-none', !ready && 'aspect-[16/10]', done && over && overOk && 'cursor-ew-resize', !hasBase && 'hidden')}
          onPointerDown={(e) => {
            if (!done || !over || !overOk || e.button !== 0) return;
            dragging.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            moveTo(e.clientX);
          }}
          onPointerMove={(e) => dragging.current === e.pointerId && moveTo(e.clientX)}
          onPointerUp={(e) => {
            if (dragging.current === e.pointerId) dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
        >
          <Pic src={base} alt={over && overOk ? afterLabel : beforeLabel} zoom={!over || !overOk} className="block h-auto w-full" />
          {over && (
            <>
              <div className={cx('absolute inset-0', !overOk && 'hidden')} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                <Pic src={over} alt={beforeLabel} zoom={false} className="h-full w-full" />
              </div>
              {overOk && pos > 16 && <span className={cx(label, 'left-2.5')}>{beforeLabel}</span>}
              {overOk && pos < 84 && <span className={cx(label, 'right-2.5')}>{afterLabel}</span>}
              <div className={cx('pointer-events-none absolute inset-y-0 w-0', !overOk && 'hidden')} style={{ left: `${pos}%` }}>
                <span className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.55)]" aria-hidden />
                <div
                  role="slider"
                  tabIndex={done ? 0 : -1}
                  aria-label={tr('Divider between the two pictures')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pos)}
                  aria-valuetext={`${beforeLabel} ${Math.round(pos)}% · ${afterLabel} ${100 - Math.round(pos)}%`}
                  onKeyDown={onKey}
                  className="pointer-events-auto absolute top-1/2 left-0 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#333] shadow-[0_1px_6px_rgba(0,0,0,0.45)] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <ChevronsLeftRight size={18} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {(str(data.caption) || str(data.credit)) && (
        <div className="mt-2.5">
          {str(data.caption) && <Md text={data.caption} className="text-[13.5px] text-fg-2" />}
          {str(data.credit) && <div className="mt-1 text-[11px] text-fg-3">{str(data.credit)}</div>}
        </div>
      )}
    </Card>
  );
}

// ---- chord charts ----------------------------------------------------------------------------------------------------------

const LETTERS = 'CDEFGAB';
const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Each instrument's strings as charts show them, left to right, in standard tuning (MIDI notes). */
const TUNING: Record<string, number[]> = { guitar: [40, 45, 50, 55, 59, 64], ukulele: [67, 60, 64, 69] };

/** An interval: the semitones over the root, and the degree that spells its note (the third of G minor is B♭, not A♯). */
const STEP: Record<string, [number, number]> = {
  '1': [0, 1],
  b2: [1, 2],
  '2': [2, 2],
  b3: [3, 3],
  '3': [4, 3],
  '4': [5, 4],
  '#4': [6, 4],
  b5: [6, 5],
  '5': [7, 5],
  '#5': [8, 5],
  '6': [9, 6],
  bb7: [9, 7],
  b7: [10, 7],
  '7': [11, 7],
  b9: [13, 9],
  '9': [14, 9],
  '#9': [15, 9],
  '11': [17, 11],
  '#11': [18, 11],
  b13: [20, 13],
  '13': [21, 13],
};

/** Chord qualities as they are written after the root, and their intervals. A capital M means major. */
const QUALITIES: [string, string][] = [
  ['|maj|M|major', '1 3 5'],
  ['m|min|-|minor', '1 b3 5'],
  ['dim|°|o', '1 b3 b5'],
  ['dim7|°7|o7', '1 b3 b5 bb7'],
  ['m7b5|m7♭5|ø|ø7|min7b5|-7b5', '1 b3 b5 b7'],
  ['aug|+|+5|#5', '1 3 #5'],
  ['sus2', '1 2 5'],
  ['sus4|sus', '1 4 5'],
  ['5', '1 5'],
  ['6|maj6|M6', '1 3 5 6'],
  ['m6|min6|-6', '1 b3 5 6'],
  ['6/9|69', '1 3 5 6 9'],
  ['7|dom7', '1 3 5 b7'],
  ['maj7|M7|Δ|Δ7|ma7', '1 3 5 7'],
  ['m7|min7|-7', '1 b3 5 b7'],
  ['mmaj7|mM7|minmaj7|m/maj7|-maj7', '1 b3 5 7'],
  ['7sus4|7sus', '1 4 5 b7'],
  ['7sus2', '1 2 5 b7'],
  ['aug7|+7|7#5|7+5', '1 3 #5 b7'],
  ['7b5|7♭5', '1 3 b5 b7'],
  ['7b9|7♭9', '1 3 5 b7 b9'],
  ['7#9|7♯9', '1 3 5 b7 #9'],
  ['9', '1 3 5 b7 9'],
  ['maj9|M9|Δ9', '1 3 5 7 9'],
  ['m9|min9|-9', '1 b3 5 b7 9'],
  ['add9|add2', '1 3 5 9'],
  ['madd9|madd2|minadd9', '1 b3 5 9'],
  ['11', '1 3 5 b7 9 11'],
  ['m11|min11', '1 b3 5 b7 9 11'],
  ['13', '1 3 5 b7 9 13'],
  ['maj13|M13', '1 3 5 7 9 13'],
  ['m13|min13', '1 b3 5 b7 9 13'],
];

function qualityOf(q: string): string | null {
  for (const [names, steps] of QUALITIES) if (names.split('|').includes(q)) return steps;
  const low = q.toLowerCase();
  for (const [names, steps] of QUALITIES) if (names.split('|').some((n) => !/M/.test(n) && n.toLowerCase() === low)) return steps;
  return null;
}

const accOf = (s: string) => [...s].reduce((n, c) => n + (c === '#' || c === '♯' ? 1 : c === 'b' || c === '♭' ? -1 : 0), 0);
const accText = (a: number) => (a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));
const pc = (n: number) => ((n % 12) + 12) % 12;

interface ChordName {
  letter: string;
  acc: number;
  steps: [number, number][];
  bass: { letter: string; acc: number } | null;
}

/** A chord's name read: its root, its intervals and a bass note after a slash ("G/B"); null when it is not one. */
function chordName(name: string): ChordName | null {
  const m = /^\s*([A-Ga-g])([#♯b♭]?)(.*?)(?:\/([A-Ga-g])([#♯b♭]?))?\s*$/.exec(name);
  if (!m) return null;
  const q = m[3].replace(/[\s()]/g, '');
  const steps = qualityOf(q) ?? (/^(m(?!aj)|min|-)/i.test(q) && !/^M/.test(q) ? '1 b3 5' : '1 3 5');
  return {
    letter: m[1].toUpperCase(),
    acc: accOf(m[2]),
    steps: steps.split(' ').map((s) => STEP[s]),
    bass: m[4] ? { letter: m[4].toUpperCase(), acc: accOf(m[5] ?? '') } : null,
  };
}

/** A chord's notes, named: "G B♭ D" (a bass note outside the chord first). */
function chordNotes(c: ChordName): string {
  const names: string[] = [];
  const seen = new Set<number>();
  const root = PITCH[c.letter] + c.acc;
  for (const [semis, degree] of c.steps) {
    const p = pc(root + semis);
    if (seen.has(p)) continue;
    seen.add(p);
    const letter = LETTERS[(LETTERS.indexOf(c.letter) + degree - 1) % 7];
    let a = pc(root + semis - PITCH[letter]);
    if (a > 6) a -= 12;
    names.push(letter + accText(a));
  }
  if (c.bass && !seen.has(pc(PITCH[c.bass.letter] + c.bass.acc))) names.unshift(c.bass.letter + accText(c.bass.acc));
  return names.join(' ');
}

/** The keys a chord is played with when none are given: around middle C (`low`: an octave down, as a guitar sounds), its bass under it. */
function voicing(c: ChordName, low = false): number[] {
  const rootPc = pc(PITCH[c.letter] + c.acc);
  const root = (low || rootPc > 5 ? 48 : 60) + rootPc;
  const notes = c.steps.map(([semis]) => root + semis);
  if (c.bass) notes.unshift(root - (pc(rootPc - (PITCH[c.bass.letter] + c.bass.acc)) || 12));
  return [...new Set(notes)].sort((a, b) => a - b);
}

/** Piano keys as agents write them ("C4", "Eb3"; low to high when no octave is given) as MIDI notes. */
function keysOf(v: unknown): number[] {
  const list = Array.isArray(v) ? v.map((x) => str(x)) : str(v).split(/[\s,]+/);
  const out: number[] = [];
  for (const s of list) {
    const m = /^\s*([A-Ga-g])([#♯b♭]*)(-?\d)?\s*$/.exec(s);
    if (!m) continue;
    const p = PITCH[m[1].toUpperCase()] + accOf(m[2]);
    const prev = out[out.length - 1];
    const midi = m[3] !== undefined ? (Number(m[3]) + 1) * 12 + p : prev === undefined ? 60 + p : prev + (pc(p - prev) || 12);
    if (midi >= 21 && midi <= 108) out.push(midi);
  }
  return out;
}

/** Frets as agents write them: a list ([3, 2, 0, "x"]), or text ("x32010", "x-3-2-0-1-0", "8 10 10 9 8 8"). */
function fretsOf(v: unknown): (number | null)[] {
  const t = typeof v === 'string' ? v.trim() : '';
  const list: unknown[] = Array.isArray(v) ? v : t ? (/[\s,-]/.test(t) ? t.split(/[\s,-]+/) : [...t]) : [];
  return list.map((x) => {
    const n = num(x);
    return n !== null && n >= 0 && n <= 24 ? Math.round(n) : null;
  });
}

interface Barre {
  fret: number;
  from: number;
  to: number;
}

/**
 * The barre, if any: as given (counted from the other side when that is the only way it fits the frets), or read from
 * the fingers: the index finger on two strings or more at one fret.
 */
function barreOf(v: unknown, frets: (number | null)[], fingers: (number | null)[]): Barre | null {
  const n = frets.length;
  const fits = (b: Barre) => {
    for (let s = b.from; s <= b.to; s++) {
      const f = frets[s - 1];
      if (f === null || f === undefined || f < b.fret) return false;
    }
    return frets[b.from - 1] === b.fret && frets[b.to - 1] === b.fret;
  };
  const o = isObj(v) ? v : typeof v === 'number' ? { fret: v } : null;
  const fret = o ? num(o.fret) : null;
  if (o && fret !== null && fret > 0) {
    const at = frets.map((f, i) => (f === fret ? i + 1 : 0)).filter(Boolean);
    let from = Math.round(num(o.from ?? o.start) ?? at[0] ?? 1);
    let to = Math.round(num(o.to ?? o.end) ?? at[at.length - 1] ?? n);
    if (from > to) [from, to] = [to, from];
    const b = { fret: Math.round(fret), from: Math.max(1, Math.min(n, from)), to: Math.max(1, Math.min(n, to)) };
    const flip = { fret: b.fret, from: n + 1 - b.to, to: n + 1 - b.from };
    return fits(b) || !fits(flip) ? b : flip;
  }
  const index = frets.map((f, i) => (fingers[i] === 1 && f !== null && f > 0 ? i : -1)).filter((i) => i >= 0);
  if (index.length >= 2 && index.every((i) => frets[i] === frets[index[0]])) return { fret: frets[index[0]] as number, from: index[0] + 1, to: index[index.length - 1] + 1 };
  return null;
}

/** A chord's box for a fretted instrument: strings down, frets across, a dot (with its finger) on each fretted string. */
function FretChart({ frets, fingers, barre }: { frets: (number | null)[]; fingers: (number | null)[]; barre: Barre | null }) {
  const n = frets.length;
  const played = frets.filter((f): f is number => f !== null && f > 0);
  const hi = Math.max(0, ...played, barre?.fret ?? 0);
  const lo = Math.min(...played, barre?.fret ?? Infinity);
  // The nut shows when the chord sits in the first five frets; else the box starts at its lowest fret, named beside it.
  const base = hi <= 5 ? 1 : lo;
  const rows = Math.min(7, Math.max(4, hi - base + 1));
  const gap = n <= 4 ? 17 : 14;
  const fy = 17;
  // Room on the left for the fret the box starts at, when it does not start at the nut.
  const left = base === 1 ? 11 : 26;
  const top = 17;
  const W = left + gap * (n - 1) + 9;
  const H = top + fy * rows + 5;
  const x = (i: number) => left + gap * i;
  const y = (f: number) => top + (f - base + 0.5) * fy;
  const r = 5.6;
  const shown = (f: number) => f >= base && f < base + rows;
  const onBarre = (i: number, f: number | null) => !!barre && f === barre.fret && i + 1 >= barre.from && i + 1 <= barre.to;
  const barreFinger = barre ? (fingers[barre.from - 1] ?? 1) : null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mt-1 block shrink-0" aria-hidden>
      {base === 1 ? (
        <rect x={left - 1} y={top - 3.5} width={gap * (n - 1) + 2} height={4} rx={1} fill="var(--fg)" />
      ) : (
        <text x={left - 7} y={y(base)} dy="0.35em" textAnchor="end" className="fill-fg-2 text-[9.5px] font-medium">
          {tr('{0}fr').replace('{0}', String(base))}
        </text>
      )}
      {Array.from({ length: rows + 1 }, (_, k) => (
        <line key={k} x1={left} x2={left + gap * (n - 1)} y1={top + k * fy} y2={top + k * fy} stroke="var(--fg-3)" strokeOpacity={0.75} strokeWidth={1} shapeRendering="crispEdges" />
      ))}
      {frets.map((_, i) => (
        <line key={i} x1={x(i)} x2={x(i)} y1={top} y2={top + rows * fy} stroke="var(--fg-2)" strokeWidth={1} shapeRendering="crispEdges" />
      ))}
      {frets.map((f, i) =>
        f === 0 ? (
          <circle key={i} cx={x(i)} cy={top - 9} r={3.3} fill="none" stroke="var(--fg-2)" strokeWidth={1.2} />
        ) : f === null ? (
          <path key={i} d={`M${x(i) - 3},${top - 12}l6,6m0,-6l-6,6`} stroke="var(--fg-3)" strokeWidth={1.3} strokeLinecap="round" />
        ) : null,
      )}
      {barre && shown(barre.fret) && (
        <g>
          <rect x={x(barre.from - 1) - r} y={y(barre.fret) - r} width={x(barre.to - 1) - x(barre.from - 1) + 2 * r} height={2 * r} rx={r} fill="var(--fg)" />
          {barreFinger !== null && (
            <text x={(x(barre.from - 1) + x(barre.to - 1)) / 2} y={y(barre.fret)} dy="0.35em" textAnchor="middle" fill="var(--panel)" className="text-[8.5px] font-bold">
              {barreFinger}
            </text>
          )}
        </g>
      )}
      {frets.map((f, i) =>
        f !== null && f > 0 && shown(f) && !onBarre(i, f) ? (
          <g key={i}>
            <circle cx={x(i)} cy={y(f)} r={r} fill="var(--fg)" />
            {fingers[i] ? (
              <text x={x(i)} y={y(f)} dy="0.35em" textAnchor="middle" fill="var(--panel)" className="text-[8.5px] font-bold">
                {fingers[i]}
              </text>
            ) : null}
          </g>
        ) : null,
      )}
    </svg>
  );
}

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

/** Piano keys over two octaves at least, the chord's keys marked. */
function KeysChart({ keys }: { keys: number[] }) {
  const lo = Math.floor(Math.min(...keys) / 12) * 12;
  const hi = Math.max(Math.floor(Math.max(...keys) / 12) * 12 + 11, lo + 23);
  const whites: number[] = [];
  const blacks: number[] = [];
  for (let m = lo; m <= hi; m++) (WHITE_KEYS.includes(m % 12) ? whites : blacks).push(m);
  const ww = 13;
  const bw = 8;
  const W = whites.length * ww + 1;
  const on = new Set(keys);
  const xw = (m: number) => whites.indexOf(m) * ww + 0.5;
  return (
    <svg width={W} height={59} viewBox={`0 0 ${W} 59`} className="mt-1.5 block shrink-0" aria-hidden>
      {whites.map((m) => (
        <rect key={m} x={xw(m)} y={0.5} width={ww} height={58} rx={2} stroke="#a8a294" strokeWidth={1} style={{ fill: on.has(m) ? 'color-mix(in srgb, var(--accent) 50%, #ffffff)' : '#fbfaf7' }} />
      ))}
      {blacks.map((m) => (
        <rect key={m} x={xw(m - 1) + ww - bw / 2} y={0.5} width={bw} height={36} rx={1.5} stroke="#1f1f1f" strokeWidth={on.has(m) ? 1 : 0} style={{ fill: on.has(m) ? 'color-mix(in srgb, var(--accent) 75%, #ffffff)' : '#262626' }} />
      ))}
    </svg>
  );
}

/** A plucked string (Karplus–Strong): a burst of noise that a delay line and an averaging filter turn into a note. */
function pluckBuffer(ctx: BaseAudioContext, freq: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, length, rate);
  const out = buf.getChannelData(0);
  const period = Math.max(2, Math.round(rate / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  for (let i = 0, p = 0; i < length; i++) {
    const q = p + 1 === period ? 0 : p + 1;
    out[i] = ring[p];
    ring[p] = 0.4985 * (ring[p] + ring[q]);
    p = q;
  }
  return buf;
}

const freqOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** This chart's own sound: plucked strings or a soft piano, made here; stopped and let go with the chart. */
function useChordSound() {
  const ref = useRef<{ ctx: AudioContext; out: GainNode; strings: Map<number, AudioBuffer> } | null>(null);
  useEffect(
    () => () => {
      void ref.current?.ctx.close().catch(() => {});
      ref.current = null;
    },
    [],
  );
  const outlet = (ctx: AudioContext) => {
    const g = ctx.createGain();
    g.gain.value = 0.6;
    g.connect(ctx.destination);
    return g;
  };
  const audio = () => {
    if (!ref.current) {
      const A = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!A) return null;
      const ctx = new A();
      ref.current = { ctx, out: outlet(ctx), strings: new Map() };
    }
    if (ref.current.ctx.state === 'suspended') void ref.current.ctx.resume().catch(() => {});
    return ref.current;
  };
  return {
    can: typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window),
    /** Plays notes (MIDI, low to high) at `at` seconds from now: strummed on strings, together on a piano. */
    play(notes: number[], piano: boolean, at = 0) {
      const a = audio();
      if (!a || !notes.length) return;
      const t0 = a.ctx.currentTime + 0.03 + at;
      notes.forEach((m, i) => {
        if (piano) {
          const g = a.ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.8);
          g.connect(a.out);
          for (const [mult, type, level] of [
            [1, 'triangle', 1],
            [2, 'sine', 0.35],
            [3, 'sine', 0.12],
          ] as const) {
            const o = a.ctx.createOscillator();
            const og = a.ctx.createGain();
            o.type = type;
            o.frequency.value = freqOf(m) * mult;
            og.gain.value = level;
            o.connect(og).connect(g);
            o.start(t0);
            o.stop(t0 + 1.85);
          }
          return;
        }
        let buf = a.strings.get(m);
        if (!buf) {
          buf = pluckBuffer(a.ctx, freqOf(m), 2.6);
          a.strings.set(m, buf);
        }
        const t = t0 + i * 0.028;
        const src = a.ctx.createBufferSource();
        const g = a.ctx.createGain();
        src.buffer = buf;
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.55);
        src.connect(g).connect(a.out);
        src.start(t);
        src.stop(t + 2.6);
      });
    },
    /** Silences what plays and what is waiting to: what comes next goes out through a new outlet. */
    hush() {
      const a = ref.current;
      if (!a) return;
      a.out.disconnect();
      a.out = outlet(a.ctx);
    },
  };
}

interface ChordCard {
  name: string;
  frets: (number | null)[] | null;
  fingers: (number | null)[];
  barre: Barre | null;
  keys: number[];
  /** What plays, low to high (MIDI). */
  sound: number[];
  notes: string;
}

/** Bars as agents write them: a list ("C G", "Am"), or text with bar lines ("C G | Am F"); each bar its chords. */
function barsOf(v: unknown): string[][] {
  const items = Array.isArray(v) ? v.map((x) => str(x)) : str(v).split('|');
  return items
    .flatMap((s) => s.split('|'))
    .map((s) =>
      s
        .trim()
        .split(/[\s,]+/)
        .filter((c) => c && !/^[-/%.]+$/.test(c)),
    )
    .filter((b) => b.length > 0);
}

function sectionsOf(v: unknown): { label: string; bars: string[][] }[] {
  const list = Array.isArray(v) ? v : [];
  if (!list.length) return str(v) ? [{ label: '', bars: barsOf(v) }] : [];
  if (list.every((x) => !isObj(x))) return [{ label: '', bars: barsOf(list) }];
  return list.map((x) => (isObj(x) ? { label: str(x.label ?? x.name ?? x.section), bars: barsOf(x.bars ?? x.chords ?? x.progression) } : { label: '', bars: barsOf([x]) })).filter((s) => s.bars.length > 0);
}

const sameChord = (a: string, b: string) => a.replace(/♯/g, '#').replace(/♭/g, 'b').toLowerCase() === b.replace(/♯/g, '#').replace(/♭/g, 'b').toLowerCase();

function Chords({ data, done }: { data: Data; done: boolean }) {
  const list = arr(data.chords).map((c) => (isObj(c) ? c : { name: str(c) }));
  const kind = str(data.instrument).toLowerCase();
  const piano = /piano|key|synth|organ/.test(kind) || (!kind && list.some((c) => c.notes || c.keys) && !list.some((c) => c.frets));
  const instrument = piano ? 'piano' : /uke|ukulele/.test(kind) ? 'ukulele' : 'guitar';
  const tuning = TUNING[instrument] ?? TUNING.guitar;
  const cards: ChordCard[] = list
    .map((c) => {
      const name = textOf(c, 'name', 'chord', 'label');
      const parsed = chordName(name);
      const given = fretsOf(c.frets ?? c.positions ?? c.tab);
      const frets = !piano && given.length >= 3 && given.length <= 8 && given.some((f) => f !== null) ? given : null;
      const fingers = frets ? fretsOf(c.fingers).map((f) => (f !== null && f >= 1 && f <= 4 ? f : null)) : [];
      const keys = piano ? (keysOf(c.notes ?? c.keys).length ? keysOf(c.notes ?? c.keys) : parsed ? voicing(parsed) : []) : [];
      const sound = piano ? keys : frets && frets.length === tuning.length ? frets.flatMap((f, i) => (f === null ? [] : [tuning[i] + f])) : parsed ? voicing(parsed, true) : [];
      return { name, frets, fingers, barre: frets ? barreOf(c.barre, frets, fingers) : null, keys, sound, notes: parsed ? chordNotes(parsed) : '' };
    })
    .filter((c) => c.name);
  const sections = sectionsOf(data.progression ?? data.bars);
  const song = isObj(data.song) ? data.song : {};
  const tempo = num(song.tempo ?? data.tempo);
  const capo = num(song.capo ?? data.capo);
  const key = str(song.key ?? data.key);
  const sound = useChordSound();
  const [hover, setHover] = useState<string | null>(null);
  const [now, setNow] = useState<{ bar: string; chord: string } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  const cardOf = (name: string): ChordCard | null => {
    const c = cards.find((x) => x.name === name) ?? cards.find((x) => sameChord(x.name, name));
    if (c) return c;
    const parsed = chordName(name);
    return parsed ? { name, frets: null, fingers: [], barre: null, keys: [], sound: voicing(parsed, !piano), notes: '' } : null;
  };
  const stop = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    sound.hush();
    setNow(null);
  };
  const playOne = (name: string) => {
    if (!done) return;
    stop();
    const c = cardOf(name);
    if (c) sound.play(c.sound, piano);
  };
  // The progression at the song's pace: four beats a bar, shared by the chords in it.
  const playAll = () => {
    stop();
    const beat = 60 / Math.min(240, Math.max(30, tempo ?? 90));
    let t = 0;
    sections.forEach((s, si) =>
      s.bars.forEach((bar, bi) =>
        bar.forEach((name) => {
          const c = cardOf(name);
          if (c) sound.play(c.sound, piano, t);
          const at = t;
          timers.current.push(window.setTimeout(() => setNow({ bar: `${si}:${bi}`, chord: name }), at * 1000 + 30));
          t += (4 * beat) / bar.length;
        }),
      ),
    );
    timers.current.push(window.setTimeout(() => setNow(null), t * 1000 + 400));
  };
  const lit = now?.chord ?? hover;
  const playable = done && sound.can;
  const title = str(data.title) || str(song.title);
  const sub = str(data.title) ? [str(song.title), str(song.artist)].filter(Boolean).join(' · ') : str(song.artist);
  const facts = [
    instrument === 'piano' ? tr('Piano') : instrument === 'ukulele' ? tr('Ukulele') : tr('Guitar'),
    key ? tr('Key of {0}').replace('{0}', key) : '',
    tempo ? tr('{0} bpm').replace('{0}', fmtNum(tempo)) : '',
    capo ? tr('Capo {0}').replace('{0}', fmtNum(capo)) : '',
  ].filter(Boolean);
  return (
    <Card>
      <Head
        title={title}
        sub={sub}
        aside={
          playable && sections.length > 0 ? (
            now ? (
              <Btn icon={<Square size={12} fill="currentColor" />} onClick={stop}>
                {tr('Stop')}
              </Btn>
            ) : (
              <Btn icon={<Play size={13} fill="currentColor" />} onClick={playAll}>
                {tr('Play')}
              </Btn>
            )
          ) : undefined
        }
      />
      {(cards.length > 0 || sections.length > 0) && (
        <div className="-mt-1 mb-3 flex flex-wrap gap-1.5">
          {facts.map((f, i) => (
            <Chip key={i}>{f}</Chip>
          ))}
        </div>
      )}
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cards.map((c, i) => {
            const body = (
              <>
                <span className="text-[15px] leading-tight font-semibold">{c.name}</span>
                {c.frets ? <FretChart frets={c.frets} fingers={c.fingers} barre={c.barre} /> : c.keys.length > 0 ? <KeysChart keys={c.keys} /> : null}
                {c.notes && <span className="mt-1 text-[11px] text-fg-3">{c.notes}</span>}
              </>
            );
            const box = cx('flex min-w-[72px] flex-col items-center rounded-xl border px-2.5 pt-2 pb-1.5 transition-colors', lit && sameChord(lit, c.name) ? 'border-accent bg-accent-soft' : 'border-line');
            return playable ? (
              <button key={i} type="button" title={tr('Play {0}').replace('{0}', c.name)} onClick={() => playOne(c.name)} className={cx(box, 'hover:bg-bg-1')}>
                {body}
              </button>
            ) : (
              <div key={i} className={box}>
                {body}
              </div>
            );
          })}
        </div>
      )}
      {sections.length > 0 && (
        <div className={cx('space-y-2', cards.length > 0 && 'mt-4')}>
          {sections.map((s, si) => (
            <div key={si} className="@md:flex @md:items-start @md:gap-3">
              {s.label && <div className="mb-1 shrink-0 pt-1 text-[12px] font-semibold text-fg-3 @md:mb-0 @md:w-16">{s.label}</div>}
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 @sm:grid-cols-4">
                {s.bars.map((bar, bi) => (
                  <div key={bi} className={cx('flex min-w-0 items-center gap-3 rounded-md px-2.5 py-1 transition-colors', now?.bar === `${si}:${bi}` ? 'bg-accent-soft' : 'bg-bg-1')}>
                    {bar.map((c, ci) =>
                      playable ? (
                        <button
                          key={ci}
                          type="button"
                          onClick={() => playOne(c)}
                          onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(c)}
                          onPointerLeave={() => setHover(null)}
                          className={cx('rounded text-[14px] font-semibold transition-colors hover:text-accent', now?.bar === `${si}:${bi}` && now.chord === c && 'text-accent')}
                        >
                          {c}
                        </button>
                      ) : (
                        <span key={ci} className="text-[14px] font-semibold">
                          {c}
                        </span>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- font pairings -----------------------------------------------------------------------------------------------------------

type FontKind = 'serif' | 'sans-serif' | 'monospace' | 'cursive';

/** What kind of face a font is, from its name (a guess for those it does not know): what stands in for it. */
function fontKind(name: string): FontKind {
  const n = name.toLowerCase();
  if (/mono|code|courier|consol|menlo/.test(n)) return 'monospace';
  if (/script|hand|brush|marker|caveat|pacifico|dancing|lobster|satisfy|vibes|sacramento|parisienne|kaushan|amatic|calligraph|cursive/.test(n)) return 'cursive';
  if (/sans|grotesk|grotesque|gothic/.test(n)) return 'sans-serif';
  if (/serif|slab|garamond|baskerville|caslon|bodoni|didot|georgia|times|merriweather|lora|playfair|crimson|cormorant|spectral|alegreya|fraunces|newsreader|literata|bitter|arvo|domine|cardo|vollkorn|gelasio|prata|abril|yeseva|tinos|charter|cambria|antiqua|minion|sabon|cinzel|marcellus|rokkitt|zilla|besley|old standard/.test(n)) return 'serif';
  return 'sans-serif';
}

/** The faces that may stand in for a kind when the font itself is not there (the first of them a page names, then its kind). */
const STAND_INS: Record<FontKind, string[]> = {
  serif: ['Georgia', 'Times New Roman'],
  'sans-serif': ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial'],
  monospace: ['ui-monospace', 'Menlo', 'Consolas', 'Courier New'],
  cursive: [],
};
const KEYWORDS = /^(system-ui|ui-monospace|serif|sans-serif|monospace|cursive)$/;
const quoteFamily = (f: string) => (KEYWORDS.test(f) || /^[A-Za-z-]+$/.test(f) ? f : `"${f}"`);
/** A font's CSS family, as a page would write it: itself, the usual stand-in, then its kind ("Lora", Georgia, serif). */
const familyOf = (name: string) => [`"${name}"`, ...STAND_INS[fontKind(name)].slice(0, 1).map(quoteFamily), fontKind(name)].join(', ');

/** Whether a face draws here: words set in it measure otherwise than in each generic face it would fall back to. */
function drawsHere(ctx: CanvasRenderingContext2D, family: string): boolean {
  const sample = 'mmmmmmmmmmlli1WQ@#&';
  for (const generic of ['monospace', 'serif', 'sans-serif']) {
    ctx.font = `48px ${generic}`;
    const plain = ctx.measureText(sample).width;
    ctx.font = `48px ${family}, ${generic}`;
    if (Math.abs(ctx.measureText(sample).width - plain) > 0.1) return true;
  }
  return false;
}

/**
 * Loads the fonts named through the app's own copy of Google Fonts: a stylesheet for each set of names (twelve at most),
 * added to the page once however many replies ask for the same; true once all of them have loaded (or failed).
 */
function useFontSheets(names: string[], on: boolean): boolean {
  const key = names.join(',');
  const [loaded, setLoaded] = useState('');
  useEffect(() => {
    if (!on || !key) return;
    let alive = true;
    const list = key.split(',');
    const sets: string[][] = [];
    for (let i = 0; i < list.length; i += 12) sets.push(list.slice(i, i + 12));
    let waiting = sets.length;
    const one = () => {
      waiting -= 1;
      if (waiting <= 0 && alive) setLoaded(key);
    };
    for (const set of sets) {
      const href = mu(`/api/pages/fonts.css?f=${encodeURIComponent(set.join(','))}`);
      let link = [...document.querySelectorAll<HTMLLinkElement>('link[data-aui-fonts]')].find((l) => l.getAttribute('href') === href);
      if (!link) {
        const el = document.createElement('link');
        el.rel = 'stylesheet';
        el.href = href;
        el.dataset.auiFonts = 'loading';
        const settle = () => (el.dataset.auiFonts = 'done');
        el.addEventListener('load', settle, { once: true });
        el.addEventListener('error', settle, { once: true });
        document.head.appendChild(el);
        link = el;
      }
      if (link.dataset.auiFonts === 'done') one();
      else {
        link.addEventListener('load', one, { once: true });
        link.addEventListener('error', one, { once: true });
      }
    }
    return () => {
      alive = false;
    };
  }, [key, on]);
  return !!key && loaded === key;
}

interface Pairing {
  name: string;
  heading: string;
  body: string;
  weight: number;
  note: string;
  sample: { heading: string; body: string };
}

/** A font's name as given (or an object's family), without what would break a CSS family. */
const fontName = (v: unknown) =>
  textOf(v, 'family', 'name', 'font')
    .replace(/["'`;{}\\<>]/g, '')
    .trim()
    .slice(0, 60);

function Fonts({ data, done }: { data: Data; done: boolean }) {
  const { offline } = useAui();
  const common = obj(data.sample);
  const pairs: Pairing[] = arr(data.pairs ?? data.pairings ?? data.items)
    .filter(isObj)
    .map((p) => {
      const own = obj(p.sample);
      const w = num(p.weight ?? p.headingWeight);
      return {
        name: str(p.name ?? p.label ?? p.title),
        heading: fontName(p.heading ?? p.headings ?? p.display),
        body: fontName(p.body ?? p.text ?? p.paragraph),
        weight: w === null ? 700 : Math.min(900, Math.max(100, Math.round(w / 100) * 100)),
        note: str(p.note ?? p.why),
        sample: { heading: str(own.heading) || str(common.heading), body: str(own.body) || str(common.body) },
      };
    })
    .filter((p) => p.heading || p.body);
  const names = [...new Set(pairs.flatMap((p) => [p.heading, p.body]).filter(Boolean))].sort();
  const key = names.join(',');
  // Fonts load once the block is whole (not for each name half written); in a confidential reply, not at all.
  const loaded = useFontSheets(names, done && !offline);
  const [missing, setMissing] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!done || !key || !(loaded || offline)) return;
    let alive = true;
    const list = key.split(',');
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    const loads = fonts ? list.flatMap((n) => [`400 24px "${n}"`, `700 24px "${n}"`].map((f) => fonts.load(f).catch(() => []))) : [];
    void Promise.all(loads).then(() => {
      const ctx = alive ? document.createElement('canvas').getContext('2d') : null;
      if (!ctx) return;
      const out: Record<string, string> = {};
      for (const n of list) if (!drawsHere(ctx, `"${n}"`)) out[n] = STAND_INS[fontKind(n)].find((f) => drawsHere(ctx, quoteFamily(f))) ?? fontKind(n);
      setMissing(out);
    });
    return () => {
      alive = false;
    };
  }, [done, key, loaded, offline]);
  const [own, setOwn] = useState('');
  const shownIn = (f: string) => (f === 'system-ui' ? tr('the system font') : f);
  return (
    <Card>
      <Head title={data.title} />
      {done && pairs.length > 0 && (
        <input
          value={own}
          onChange={(e) => setOwn(e.target.value.slice(0, 120))}
          placeholder={tr('Try your own words')}
          aria-label={tr('Try your own words')}
          className="mb-3 h-9 w-full rounded-lg border border-line bg-bg-1 px-3 text-[13.5px] outline-none placeholder:text-fg-3 focus:border-accent"
        />
      )}
      <div className="space-y-3">
        {pairs.map((p, i) => {
          const head = familyOf(p.heading || p.body);
          const body = familyOf(p.body || p.heading);
          const css = `h1, h2, h3 { font-family: ${head}; font-weight: ${p.weight}; }\nbody { font-family: ${body}; }`;
          const gone = [...new Set([p.heading, p.body])].filter((n) => n && missing[n]);
          return (
            <div key={i} className="overflow-hidden rounded-xl border border-line">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line bg-bg-1 px-3.5 py-2 text-[12.5px]">
                {p.name && <span className="text-[13px] font-semibold text-fg">{p.name}</span>}
                <span className="text-fg-3">
                  {tr('Headings')}{' '}
                  <span className="font-medium text-fg-2" style={{ fontFamily: head }}>
                    {p.heading || p.body}
                  </span>
                </span>
                <span className="text-fg-3">
                  {tr('Text')}{' '}
                  <span className="font-medium text-fg-2" style={{ fontFamily: body }}>
                    {p.body || p.heading}
                  </span>
                </span>
              </div>
              <div className="px-3.5 pt-3 pb-3.5">
                <div className="text-[26px] leading-[1.15] break-words text-fg @lg:text-[30px]" style={{ fontFamily: head, fontWeight: p.weight }}>
                  {own.trim() || p.sample.heading || p.heading || p.body}
                </div>
                <p className="m-0 mt-2 text-[15px] leading-relaxed text-fg-2" style={{ fontFamily: body }}>
                  {p.sample.body || tr('A good pairing gives headings a voice of their own and keeps long text easy to read.')}
                </p>
                {gone.map((n) => (
                  <div key={n} className="mt-2 flex items-start gap-1.5 text-[12px] text-warn">
                    <TriangleAlert size={13} className="mt-px shrink-0" />
                    <span>{tr('{0} is not available here: shown in {1}').replace('{0}', n).replace('{1}', shownIn(missing[n]))}</span>
                  </div>
                ))}
                {p.note && <Md text={p.note} className="mt-2.5 text-[13px] text-fg-2" />}
              </div>
              <div className="flex items-start gap-2 border-t border-line bg-code-bg py-2 pr-1.5 pl-3.5">
                <pre className="m-0 min-w-0 flex-1 font-mono text-[11.5px] leading-[1.6] break-words whitespace-pre-wrap text-fg-2">{css}</pre>
                {done && <Copy text={css} label={tr('Copy the CSS')} />}
              </div>
            </div>
          );
        })}
      </div>
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
  'annotated-image': AnnotatedImage,
  'before-after': BeforeAfter,
  chords: Chords,
  fonts: Fonts,
};
