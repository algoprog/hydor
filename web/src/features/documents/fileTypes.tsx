// A file's icon and colour by its kind (Word blue, Excel green, PowerPoint orange, PDF red…), and paths
// an agent gave, resolved as the server does.
import type { CSSProperties } from 'react';
import { BookOpenText, File, FileArchive, FileAudio, FileCode2, FileImage, FileSpreadsheet, FileText, FileVideo, Globe, NotebookText, Presentation, type LucideIcon } from 'lucide-react';
import { docKind, type DocKind } from '@shared/documents';
import { cx } from '../../components/ui';

const LOOK: Record<DocKind, { icon: LucideIcon; hue: number }> = {
  word: { icon: FileText, hue: 214 },
  sheet: { icon: FileSpreadsheet, hue: 145 },
  slides: { icon: Presentation, hue: 22 },
  pdf: { icon: FileText, hue: 2 },
  image: { icon: FileImage, hue: 275 },
  text: { icon: FileText, hue: 40 },
  code: { icon: FileCode2, hue: 190 },
  notebook: { icon: NotebookText, hue: 240 },
  archive: { icon: FileArchive, hue: 48 },
  audio: { icon: FileAudio, hue: 330 },
  video: { icon: FileVideo, hue: 300 },
  book: { icon: BookOpenText, hue: 28 },
  web: { icon: Globe, hue: 200 },
  file: { icon: File, hue: 35 },
};

/** The kind's icon on a tile of its colour (the same tile the model makers' marks use). */
export function FileIcon({ path, size = 40, className }: { path: string; size?: number; className?: string }) {
  const look = LOOK[docKind(path)];
  const Icon = look.icon;
  return (
    <span
      className={cx('org-mark flex shrink-0 items-center justify-center rounded-[10px]', className)}
      style={{ '--h': look.hue, width: size, height: size } as CSSProperties}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={1.8} />
    </span>
  );
}

/** A path an agent gave, as the server resolves it: absolute, from home (~), or from the session's folder. */
export function resolveIn(p: string, cwd?: string, home?: string): string {
  let s = p.trim();
  if ((s === '~' || s.startsWith('~/')) && home) s = home + s.slice(1);
  else if (!s.startsWith('/')) s = `${cwd ?? home ?? ''}/${s}`;
  const out: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return `/${out.join('/')}`;
}
