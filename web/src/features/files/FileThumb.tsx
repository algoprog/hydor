// The picture a file's tile shows (Files, in tiles): what the file looks like, as well as it can be told. Pictures,
// videos, PDFs, Word, Excel and PowerPoint files (and their OpenDocument kin), web pages and notebooks come from the
// server (GET /api/fs/thumb: a small picture of the file, or a 404 when there is none); a picture or video it cannot
// draw is shown as it is (the picture itself, a video's frame at half a second). Text, Markdown, code, tables and JSON
// show their first lines on a paper-like tile (only the first few KB are read, and only for a tile on screen);
// everything else is its kind's icon on a tinted tile. Photos fill their tile; pages and slides sit on white paper.
import { memo, useEffect, useRef, useState } from 'react';
import { docKind } from '@shared/documents';
import { cx } from '../../components/ui';
import { mu } from '../../lib/machine';
import { FileIcon } from '../documents/fileTypes';

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

const PHOTOS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'heic', 'heif', 'tif', 'tiff']);
/** What a browser draws itself, for when the server has no smaller picture of one. */
const SHOWN_AS_IS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico']);
const VIDEOS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']);
const PAGES = new Set([
  'pdf',
  'doc', 'docx', 'docm', 'dotx', 'odt', 'ott', 'rtf',
  'xls', 'xlsx', 'xlsm', 'xltx', 'ods', 'ots',
  'ppt', 'pptx', 'pptm', 'potx', 'ppsx', 'odp', 'otp',
  'html', 'htm', 'ipynb',
]);
const SNIPPETS = new Set(['txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonl', 'ndjson', 'tex', 'ltx', 'rst', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'sql', 'sh', 'py', 'js', 'ts', 'tsx', 'jsx', 'css', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'rb', 'php']);
/** Text kinds that read as prose, not as code. */
const PROSE = new Set(['txt', 'md', 'markdown', 'log', 'rst', 'tex', 'ltx']);

/** The most a snippet reads, and the biggest file it is made for. */
const SNIPPET_BYTES = 3072;
const SNIPPET_MAX_FILE = 1_000_000;
/** The biggest video shown by its own frame (the browser reads only its start, but a huge file is not worth it). */
const VIDEO_MAX_FILE = 200_000_000;
const PICTURE_MAX_FILE = 25_000_000;

type Plan = 'svg' | 'photo' | 'video' | 'page' | 'snippet' | 'icon';

function planOf(name: string, size: number): Plan {
  const ext = extOf(name);
  if (ext === 'svg') return 'svg';
  if (PHOTOS.has(ext)) return 'photo';
  if (VIDEOS.has(ext)) return 'video';
  if (PAGES.has(ext)) return 'page';
  if (SNIPPETS.has(ext) && size > 0 && size <= SNIPPET_MAX_FILE) return 'snippet';
  return 'icon';
}

const BADGES: Record<string, string> = {
  pdf: 'PDF',
  doc: 'Word', docx: 'Word', docm: 'Word', dotx: 'Word', odt: 'Word', ott: 'Word', rtf: 'Word',
  xls: 'Sheet', xlsx: 'Sheet', xlsm: 'Sheet', xltx: 'Sheet', ods: 'Sheet', ots: 'Sheet',
  csv: 'CSV', tsv: 'CSV',
  ppt: 'Slides', pptx: 'Slides', pptm: 'Slides', potx: 'Slides', ppsx: 'Slides', odp: 'Slides', otp: 'Slides',
  ipynb: 'Notebook',
  tex: 'LaTeX', ltx: 'LaTeX',
  html: 'HTML', htm: 'HTML',
  md: 'Markdown', markdown: 'Markdown',
  json: 'JSON',
  epub: 'E-book',
  zip: 'Archive', tar: 'Archive', gz: 'Archive', tgz: 'Archive', '7z': 'Archive', rar: 'Archive',
  svg: 'SVG',
  gif: 'GIF',
};

/** The small label a tile wears for what its file is, when that is worth saying: documents, video, sound, tables. */
export function kindBadge(name: string): string | null {
  const ext = extOf(name);
  if (BADGES[ext]) return BADGES[ext];
  const kind = docKind(name);
  return kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : null;
}

// ---- what is known so far ------------------------------------------------------------------------------

/**
 * Files the server had no picture for (by path and time) and when, so a tile seen again does not ask again for ten
 * minutes, as long as the server keeps it in mind too (a picture that failed for a moment comes after that).
 */
const NO_THUMB_MS = 10 * 60_000;
const noThumbAt = new Map<string, number>();
const noThumb = {
  has: (key: string) => Date.now() - (noThumbAt.get(key) ?? -Infinity) < NO_THUMB_MS,
  add: (key: string) => {
    if (noThumbAt.size > 2000) noThumbAt.clear();
    noThumbAt.set(key, Date.now());
  },
};
const snippets = new Map<string, string | null>();
const SNIPPETS_KEPT = 400;

const rawUrl = (path: string, mtime: number) => mu(`/api/fs/raw?path=${encodeURIComponent(path)}&t=${mtime}`);

/** The width asked of the server: the tile's, at this screen's sharpness, in steps so the same sizes are asked again. */
export function thumbWidth(): number {
  const dpr = typeof window === 'undefined' ? 1 : Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  return Math.min(800, Math.max(120, Math.round((360 * dpr) / 40) * 40));
}

export const thumbUrl = (path: string, mtime: number, w = thumbWidth()) => mu(`/api/fs/thumb?path=${encodeURIComponent(path)}&w=${w}&t=${mtime}`);

/** A few reads at a time: a folder of a hundred text files does not ask for a hundred at once. */
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 4) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Whether an element is (nearly) on screen: tiles read and load their picture only then. */
function useSeen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (list) => {
        if (list.some((x) => x.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

/** The first lines of a text file (null when it is not text, or could not be read). */
async function readSnippet(path: string, mtime: number): Promise<string | null> {
  const key = `${path}|${mtime}`;
  if (snippets.has(key)) return snippets.get(key)!;
  let text: string | null = null;
  try {
    const res = await limited(() => fetch(rawUrl(path, mtime), { headers: { Range: `bytes=0-${SNIPPET_BYTES - 1}` }, credentials: 'same-origin' }));
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer()).subarray(0, SNIPPET_BYTES);
      if (!buf.includes(0)) {
        const lines = new TextDecoder().decode(buf).replace(/^﻿/, '').split(/\r?\n/);
        // The last line may be cut off by the limit: leave it out when there are others.
        if (buf.length >= SNIPPET_BYTES && lines.length > 1) lines.pop();
        text = lines.slice(0, 16).map((l) => (l.length > 90 ? `${l.slice(0, 90)}…` : l)).join('\n').trimEnd() || null;
      }
    }
  } catch {}
  if (snippets.size >= SNIPPETS_KEPT) snippets.delete(snippets.keys().next().value!);
  snippets.set(key, text);
  return text;
}

// ---- the parts ----------------------------------------------------------------------------------------------

const PAPER = 'bg-[#fbfaf6]';

/** The kind's icon on a tinted tile. */
function IconFace({ path }: { path: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg-1">
      <FileIcon path={path} size={56} className="rounded-2xl" />
    </div>
  );
}

/** The first lines of a text file, small, on a paper-like tile. */
function Snippet({ path, mtime, onNone }: { path: string; mtime: number; onNone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  const key = `${path}|${mtime}`;
  const [text, setText] = useState<string | null | undefined>(() => snippets.get(key));
  const none = useRef(onNone);
  none.current = onNone;
  useEffect(() => {
    if (!seen || text !== undefined) return;
    let gone = false;
    void readSnippet(path, mtime).then((t) => {
      if (gone) return;
      if (t === null) none.current();
      else setText(t);
    });
    return () => {
      gone = true;
    };
  }, [seen, text, path, mtime]);
  const prose = PROSE.has(extOf(path));
  return (
    <div ref={ref} className={cx('absolute inset-0 overflow-hidden', PAPER)}>
      {text && (
        <>
          <pre translate="no" className={cx('m-0 px-3 pt-9 text-[9.5px] leading-[1.4] break-words whitespace-pre-wrap text-neutral-700', prose ? 'font-sans' : 'font-mono text-[8.5px]')}>
            {text}
          </pre>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#fbfaf6] to-transparent" />
        </>
      )}
    </div>
  );
}

/** A video's frame at half a second, read by the browser from the file itself (when the server could not draw one). */
function VideoFrame({ path, mtime, onNone }: { path: string; mtime: number; onNone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  return (
    <div ref={ref} className="absolute inset-0 bg-black/80">
      {seen && <video src={`${rawUrl(path, mtime)}#t=0.5`} muted playsInline preload="metadata" onError={onNone} className="absolute inset-0 h-full w-full object-cover" />}
    </div>
  );
}

/**
 * What a tile's picture area shows for a file: fills it (the caller gives the area its shape). `path` and `mtime` make
 * it new again when the file changes.
 */
export const FileThumb = memo(function FileThumb({ path, name, size, mtime }: { path: string; name: string; size: number; mtime: number }) {
  const plan = planOf(name, size);
  const key = `${path}|${mtime}`;
  // What it shows now: the server's picture first, then what the plan falls back to.
  const [stage, setStage] = useState<'thumb' | 'fallback' | 'icon'>(() => (plan === 'svg' || plan === 'snippet' || plan === 'icon' ? 'fallback' : noThumb.has(key) ? 'fallback' : 'thumb'));
  // A picture taller than the tile is shown from its top, filling the width; a wide one, whole.
  const [tall, setTall] = useState(false);
  const toIcon = () => setStage('icon');
  const noPicture = () => {
    noThumb.add(key);
    setStage('fallback');
  };
  if (stage === 'icon') return <IconFace path={path} />;

  if (plan === 'snippet') return <Snippet path={path} mtime={mtime} onNone={toIcon} />;

  if (plan === 'svg')
    return (
      <div className={cx('absolute inset-0', PAPER)}>
        <img src={rawUrl(path, mtime)} alt="" loading="lazy" decoding="async" draggable={false} onError={toIcon} className="absolute inset-0 h-full w-full object-contain p-2" />
      </div>
    );

  if (stage === 'thumb')
    return (
      <div className={cx('absolute inset-0', plan === 'page' && PAPER)}>
        <img
          src={thumbUrl(path, mtime)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => setTall(e.currentTarget.naturalWidth < e.currentTarget.naturalHeight * 1.1)}
          onError={noPicture}
          className={cx('absolute inset-0 h-full w-full', plan === 'page' ? (tall ? 'object-cover object-top' : 'object-contain') : 'object-cover')}
        />
      </div>
    );

  // The server had no picture.
  if (plan === 'photo' && SHOWN_AS_IS.has(extOf(name)) && size <= PICTURE_MAX_FILE)
    return <img src={rawUrl(path, mtime)} alt="" loading="lazy" decoding="async" draggable={false} onError={toIcon} className="absolute inset-0 h-full w-full object-cover" />;
  if (plan === 'video' && size <= VIDEO_MAX_FILE) return <VideoFrame path={path} mtime={mtime} onNone={toIcon} />;
  return <IconFace path={path} />;
});

/** A small picture of a file for a row of the list (a picture's own, a thumbnail), or null when it has none to show. */
export function rowPictureUrl(name: string, path: string, mtime: number): string | null {
  const ext = extOf(name);
  if (ext === 'svg') return rawUrl(path, mtime);
  return PHOTOS.has(ext) ? thumbUrl(path, mtime, 120) : null;
}
