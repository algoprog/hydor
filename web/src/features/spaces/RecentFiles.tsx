// A project's newest files, on its Overview: what was kept in the project (pages, documents, slides, pictures…:
// pages/kept.tsx) and the files at the top of its folder, the last changed first, as the Files tab's tiles. A kept
// thing's own file there shows once, as the thing. A click opens one: a kept thing in its own editor, a file in a
// window over the page. All files opens the Files tab. Nothing shows while the project has no files.
import { useEffect, useMemo, useState } from 'react';
import type { Space } from '@shared/spaces';
import { api } from '../../lib/api';
import { ago } from '../../lib/format';
import { useFilePeek } from '../../lib/nav';
import { tr } from '../../i18n/runtime';
import { FileThumb, kindBadge } from '../files/FileThumb';
import { isDir, type FsEntry } from '../files/FolderView';
import { KeptTile, useKept, type Kept } from '../pages/kept';

/** How many tiles the card shows. */
const SHOWN = 6;

/** A file at the top of the folder as a tile: its picture, its kind, its name and when it changed. */
function FileTile({ e }: { e: FsEntry }) {
  const badge = kindBadge(e.name);
  return (
    <button
      type="button"
      onClick={() => useFilePeek.setState({ file: { path: e.path } })}
      title={e.path}
      className="press-card group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left transition-colors hover:border-line-2"
    >
      <span className="relative block aspect-[4/3] overflow-hidden border-b border-line bg-bg-1">
        <FileThumb key={`${e.path}|${e.mtime}`} path={e.path} name={e.name} size={e.size} mtime={e.mtime} />
        {badge && <span className="pointer-events-none absolute top-2 left-2 inline-flex items-center rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">{badge}</span>}
      </span>
      <span className="block min-w-0 px-3 py-2">
        <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
          {e.name}
        </span>
        <span className="block truncate text-[12px] leading-4 text-fg-3">{tr(`Changed ${ago(e.mtime)}`)}</span>
      </span>
    </button>
  );
}

/** The project's newest files as a card's grid, with All files; null while there are none (or they are not known yet). */
export function RecentFiles({ s, card }: { s: Space; card: (count: number, body: React.ReactNode) => React.ReactNode }) {
  const kept = useKept(s.id);
  const [files, setFiles] = useState<FsEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ entries: FsEntry[] }>(`/api/fs/list?path=${encodeURIComponent(s.folder)}`).then(
      (r) => live && setFiles(r.entries.filter((e) => !isDir(e) && e.type === 'file' && !e.name.startsWith('.'))),
      () => live && setFiles([]),
    );
    return () => {
      live = false;
    };
  }, [s.folder]);
  // The files less those that are one of the kept things' own: the thing shows, not its file too.
  const others = useMemo(() => {
    const here = new Set((kept ?? []).map((k) => k.page?.id ?? k.media?.id));
    return (files ?? []).filter((f) => !(f.kept && here.has(f.kept.id)));
  }, [kept, files]);
  // Kept things and files together, the last changed first.
  const newest = useMemo(() => {
    const all: { at: number; kept?: Kept; file?: FsEntry }[] = [...(kept ?? []).map((k) => ({ at: k.at, kept: k })), ...others.map((f) => ({ at: f.mtime, file: f }))];
    return all.sort((a, b) => b.at - a.at).slice(0, SHOWN);
  }, [kept, others]);
  const count = (kept?.length ?? 0) + others.length;
  if (!kept || !files || !count) return null;
  return card(
    count,
    <div className="grid grid-cols-2 gap-2.5 border-t border-line p-3 sm:grid-cols-3">
      {newest.map((x) => (x.kept ? <KeptTile key={x.kept.key} it={x.kept} /> : x.file ? <FileTile key={x.file.path} e={x.file} /> : null))}
    </div>,
  );
}
