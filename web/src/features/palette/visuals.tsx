// The pictures the search box shows its results by: a small square in the list, a larger view in the preview. A
// Library picture, video or sound shows its still (a sound its shape), a page, document, slide deck or the like its
// thumbnail, and a file the picture itself when it is one (else its kind's icon). The preview plays a video or a sound
// right there.
import { useState, type ReactNode } from 'react';
import { AppWindow, AudioLines, ImageIcon, LayoutDashboard, NotebookText, Play, Presentation, Sheet, Sigma, Workflow, FileText } from 'lucide-react';
import { docKind } from '@shared/documents';
import type { MediaItem } from '@shared/media';
import type { PageInfo } from '@shared/pages';
import { enc } from '../../lib/api';
import { basename } from '../../lib/format';
import { mu } from '../../lib/machine';
import { cx } from '../../components/ui';
import { AudioPlayer, Waveform } from '../../components/AudioPlayer';
import { VideoPlayer } from '../../components/VideoPlayer';
import { FileIcon } from '../documents/fileTypes';
import { mediaUrl } from '../media/state';
import { toneOf } from '../pages/parts';

/** What a result is shown by. */
export type Visual = { type: 'media'; item: MediaItem } | { type: 'page'; page: PageInfo } | { type: 'file'; path: string; size?: number };

type PageKind = NonNullable<PageInfo['kind']> | 'page';

/** A page's kind in words, with its icon (as the Library names them). */
export const PAGE_KINDS: Record<PageKind, { label: string; icon: (size: number) => ReactNode }> = {
  page: { label: 'Page', icon: (s) => <AppWindow size={s} /> },
  slides: { label: 'Slides', icon: (s) => <Presentation size={s} /> },
  doc: { label: 'Document', icon: (s) => <FileText size={s} /> },
  sheet: { label: 'Spreadsheet', icon: (s) => <Sheet size={s} /> },
  tex: { label: 'LaTeX', icon: (s) => <Sigma size={s} /> },
  notebook: { label: 'Notebook', icon: (s) => <NotebookText size={s} /> },
  diagram: { label: 'Diagram', icon: (s) => <Workflow size={s} /> },
  board: { label: 'Board', icon: (s) => <LayoutDashboard size={s} /> },
};

/** A page's kind as PAGE_KINDS has it: a kind this version does not know (a newer machine's) shows as a page. */
export const pageKind = (p: Pick<PageInfo, 'kind'>) => PAGE_KINDS[p.kind ?? 'page'] ?? PAGE_KINDS.page;

/** What a picture, video or sound is called in the list. */
export const MEDIA_LABELS: Record<MediaItem['kind'], string> = { image: 'Picture', video: 'Video', audio: 'Audio' };

/** A file's format from its MIME type: "PNG", "MP4"; nothing when it is not known. */
export function formatOf(mime: string): string {
  const sub = mime.split(';')[0].trim().toLowerCase();
  const [type, sort = ''] = sub.split('/');
  if (!type || !sort) return '';
  if (type === 'audio' && sort === 'mpeg') return 'MP3';
  const named: Record<string, string> = {
    jpeg: 'JPEG',
    'svg+xml': 'SVG',
    quicktime: 'MOV',
    'x-wav': 'WAV',
    wave: 'WAV',
    wav: 'WAV',
    'x-m4a': 'M4A',
    mp4: type === 'audio' ? 'M4A' : 'MP4',
    'x-matroska': 'MKV',
  };
  return named[sort] ?? sort.replace(/^x-/, '').toUpperCase();
}

const MEDIA_ICONS = { image: ImageIcon, video: Play, audio: AudioLines };
const IMAGE_FILE_MAX = 15 * 1024 * 1024;
/** A picture file small enough to show (its size known: a very large one is not loaded at all). */
const showableImage = (v: Extract<Visual, { type: 'file' }>) => docKind(v.path) === 'image' && v.size != null && v.size <= IMAGE_FILE_MAX;

/** Whether the preview has a larger view of it: always for the Library's things, for a file only a picture (once its size is known), a video or a sound. */
export function hasBigVisual(v: Visual): boolean {
  if (v.type !== 'file') return true;
  const kind = docKind(v.path);
  return kind === 'video' || kind === 'audio' || showableImage(v);
}
const rawUrl = (path: string) => mu(`/api/fs/raw?path=${encodeURIComponent(path)}`);
const thumbUrl = (p: PageInfo) => (p.thumb ? mu(`/api/pages/${enc(p.id)}/thumb?v=${enc(p.thumb)}`) : '');

/** Whether the picture at an address failed to load: tried again when the address changes. */
function useFailed(src: string): [boolean, () => void] {
  const [failed, setFailed] = useState('');
  return [!!src && failed === src, () => setFailed(src)];
}

/** A page's picture (its top left corner, where a page starts), or its kind's icon (its emoji) on a wash of its colour when it has none or it does not load. */
function PageFace({ p, size, className }: { p: PageInfo; size: number; className?: string }) {
  const src = thumbUrl(p);
  const [failed, onError] = useFailed(src);
  const kind = pageKind(p);
  if (src && !failed)
    return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={onError} className={cx('absolute inset-0 h-full w-full object-cover object-left-top', className)} />;
  return (
    <span className={cx('absolute inset-0 flex items-center justify-center bg-gradient-to-br', toneOf(p.id))}>
      {p.icon ? (
        <span translate="no" className="leading-none" style={{ fontSize: Math.round(size * 0.45) }}>
          {p.icon}
        </span>
      ) : (
        <span className="flex items-center justify-center opacity-90 [&_svg]:[stroke-width:1.8]">{kind.icon(Math.round(size * 0.42))}</span>
      )}
    </span>
  );
}

/** The list's square picture, size × size px. */
export function Thumb({ v, size }: { v: Visual; size: number }) {
  const big = size >= 56;
  const src =
    v.type === 'media'
      ? v.item.kind === 'audio'
        ? ''
        : mu(mediaUrl(v.item, 'still'))
      : v.type === 'file' && showableImage(v)
        ? rawUrl(v.path)
        : '';
  const [failed, onError] = useFailed(src);
  let inner: ReactNode;
  if (v.type === 'media') {
    const m = v.item;
    const Icon = MEDIA_ICONS[m.kind] ?? ImageIcon;
    if (m.kind === 'audio')
      inner = m.peaks?.length ? (
        <span className="absolute inset-0 bg-gradient-to-br from-accent-soft via-bg-2 to-bg-2">
          <span className="absolute inset-x-[16%] inset-y-[30%] flex">
            <Waveform peaks={m.peaks} progress={0} thin className="h-full w-full" />
          </span>
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-accent-soft via-bg-2 to-bg-2 text-accent">
          <AudioLines size={Math.round(size * 0.42)} />
        </span>
      );
    else if (failed)
      inner = (
        <span className="absolute inset-0 flex items-center justify-center text-fg-3">
          <Icon size={Math.round(size * 0.42)} />
        </span>
      );
    else
      inner = (
        <>
          <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={onError} className="absolute inset-0 h-full w-full object-cover" />
          {m.kind === 'video' && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className={cx('flex items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm', big ? 'h-6 w-6' : 'h-5 w-5')}>
                <Play size={big ? 12 : 10} fill="currentColor" className="ml-px" />
              </span>
            </span>
          )}
        </>
      );
  } else if (v.type === 'page') {
    inner = <PageFace p={v.page} size={size} />;
  } else if (src && !failed) {
    inner = <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={onError} className="absolute inset-0 h-full w-full object-cover" />;
  } else {
    inner = <FileIcon path={v.path} size={size} className="absolute inset-0 !rounded-none" />;
  }
  return (
    <span className={cx('relative block shrink-0 overflow-hidden bg-bg-2 ring-1 ring-line', big ? 'rounded-xl' : 'rounded-lg')} style={{ width: size, height: size }}>
      {inner}
    </span>
  );
}

/** The preview's large view: a picture (it opens the result), a video or sound to play; nothing when there is nothing larger worth showing. */
export function BigVisual({ v, title, onOpen }: { v: Visual; title: string; onOpen: () => void }) {
  const imageSrc =
    v.type === 'media'
      ? v.item.kind === 'image'
        ? mu(mediaUrl(v.item, 'still'))
        : ''
      : v.type === 'file' && showableImage(v)
        ? rawUrl(v.path)
        : '';
  const pageSrc = v.type === 'page' ? thumbUrl(v.page) : '';
  const [imageFailed, onImageError] = useFailed(imageSrc);
  const [pageFailed, onPageError] = useFailed(pageSrc);
  if (v.type === 'media') {
    const m = v.item;
    if (m.kind === 'video') return <VideoPlayer key={m.id} src={mu(mediaUrl(m))} poster={mu(mediaUrl(m, 'still'))} name={m.title} className="aspect-video w-full overflow-hidden rounded-xl" />;
    if (m.kind === 'audio')
      return (
        <div className="rounded-xl bg-bg-2 p-3 ring-1 ring-line">
          <AudioPlayer key={m.id} src={mu(mediaUrl(m))} peaks={m.peaks} />
        </div>
      );
  }
  if (v.type === 'file') {
    const kind = docKind(v.path);
    if (kind === 'video') return <VideoPlayer key={v.path} src={rawUrl(v.path)} name={basename(v.path)} className="aspect-video w-full overflow-hidden rounded-xl" />;
    if (kind === 'audio')
      return (
        <div className="rounded-xl bg-bg-2 p-3 ring-1 ring-line">
          <AudioPlayer key={v.path} src={rawUrl(v.path)} />
        </div>
      );
  }
  if (imageSrc)
    return (
      <button type="button" onClick={onOpen} aria-label={title} translate="no" className="flex aspect-[16/10] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-xl bg-bg-2 text-fg-3 ring-1 ring-line">
        {imageFailed ? (
          v.type === 'file' ? <FileIcon path={v.path} size={48} /> : <ImageIcon size={32} />
        ) : (
          <img src={imageSrc} alt="" decoding="async" draggable={false} onError={onImageError} className="h-full w-full object-contain" />
        )}
      </button>
    );
  if (v.type === 'page') {
    const kind = pageKind(v.page);
    return (
      <button type="button" onClick={onOpen} aria-label={title} translate="no" className="relative block aspect-[16/10] w-full overflow-hidden rounded-xl ring-1 ring-line">
        {pageSrc && !pageFailed ? (
          <img src={pageSrc} alt="" decoding="async" draggable={false} onError={onPageError} className="absolute inset-0 h-full w-full object-cover object-top" />
        ) : (
          <span className={cx('absolute inset-0 flex items-center justify-center bg-gradient-to-br', toneOf(v.page.id))}>
            {v.page.icon ? (
              <span translate="no" className="text-[40px] leading-none">
                {v.page.icon}
              </span>
            ) : (
              kind.icon(40)
            )}
          </span>
        )}
      </button>
    );
  }
  return null;
}
