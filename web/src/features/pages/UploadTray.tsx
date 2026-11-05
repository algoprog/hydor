// The tray of files on their way into the Library (uploads.ts), at the bottom right over every page, so they carry on
// while you open what arrived: each file with its progress, then what it became and where (a click opens it: a page,
// a picture, or the file in its project's folder), or why it could not be added, in plain words; Cancel stops them.
// In the desktop app it also says a file was moved, and where its original went. Files' own uploads sit under it.
// Also the line a drag of files shows over where they would go (DropHint).
import type { DragEvent, ReactNode } from 'react';
import { AudioLines, File as FileIcon, FileText, FolderInput, ImageIcon, NotebookText, Play, Presentation, Sheet, Sigma, Upload, X } from 'lucide-react';
import type { MoveRefused } from '@shared/library-files';
import { bytes, dirname } from '../../lib/format';
import { go } from '../../lib/nav';
import { tr } from '../../i18n/runtime';
import { Button, cx, IconButton } from '../../components/ui';
import { goFolder } from '../files/actions';
import { UploadsPanel } from '../files/Uploads';
import { useSpaces } from '../spaces/state';
import { cancelAll, cancelUpload, closeTray, dragsFiles, dropMoves, useLibraryUploads, type UpItem } from './uploads';

const ICONS: Record<string, ReactNode> = {
  doc: <FileText size={15} />,
  sheet: <Sheet size={15} />,
  slides: <Presentation size={15} />,
  tex: <Sigma size={15} />,
  notebook: <NotebookText size={15} />,
  image: <ImageIcon size={15} />,
  video: <Play size={15} />,
  audio: <AudioLines size={15} />,
  file: <FolderInput size={15} />,
};

/** What it is, as the Library's cards name their kinds. */
const KIND: Record<string, string> = { page: 'Page', doc: 'Document', sheet: 'Spreadsheet', slides: 'Slides', tex: 'LaTeX', notebook: 'Notebook', image: 'Picture', video: 'Video', audio: 'Audio' };

/** While the server makes it what it is. */
const MAKING: Record<string, string> = {
  doc: 'Making a document of it',
  sheet: 'Making a spreadsheet of it',
  slides: 'Making slides of it',
  tex: 'Making a LaTeX document of it',
  notebook: 'Making a notebook of it',
  image: 'Keeping it in the Library',
  video: 'Keeping it in the Library',
  audio: 'Keeping it in the Library',
  file: 'Putting it in the project’s folder',
};

/** What a page could not keep of a file, in Files' editors' words (and the Library's own: it reads others of its folder). */
const LOST: Record<string, string> = {
  headers: 'headers and footers',
  footnotes: 'footnotes and endnotes',
  comments: 'review comments',
  changes: 'tracked changes',
  equations: 'math equations',
  diagrams: 'SmartArt diagrams',
  objects: 'embedded files',
  boxes: 'text boxes',
  columns: 'page columns',
  toc: 'table of contents',
  layout: 'landscape pages',
  shapes: 'shapes and text boxes',
  formulas: 'formulas it cannot work out',
  pivots: 'pivot tables',
  tables: 'formatted tables',
  links: 'links to other files',
  hyperlinks: 'hyperlinks',
  names: 'named ranges',
  macros: 'macros',
  groups: 'grouped rows and columns',
  sparklines: 'sparklines',
  icons: 'icon sets',
  protection: 'sheet protection',
  print: 'print settings',
  rich: 'words formatted in parts of a cell',
  files: 'the files it reads from its folder',
};
/** Charts and pictures are named apart: a document's charts and graphs, a spreadsheet's charts it cannot draw. */
const lostWord = (k: string, kind?: string) =>
  k === 'charts' ? (kind === 'sheet' ? 'charts it cannot draw' : 'charts and graphs') : k === 'pictures' ? (kind === 'sheet' ? 'pictures' : 'the pictures it shows from its folder') : (LOST[k] ?? k);

/** Why the desktop app sent a copy rather than moving the file. */
const COPIED: Record<MoveRefused, string> = {
  project: 'Copied: the original is in a project’s folder, so it stays there',
  data: 'Copied: the original is in the app’s own folders, so it stays there',
  system: 'Copied: the original is in a folder of the system’s, so it stays there',
  link: 'Copied: the original is a link, so it stays where it is',
};

const active = (i: UpItem) => i.status === 'waiting' || i.status === 'sending' || i.status === 'making';

/** What it is (or will be): the kind of page, picture, video or sound, or a file of a project's folder. */
function kindOf(it: UpItem): string | undefined {
  const d = it.done;
  if (d) return d.as === 'page' ? (d.page?.kind ?? 'page') : d.as === 'media' ? d.item?.kind : 'file';
  return it.becomes === 'page' ? it.kind : it.becomes;
}

/** Where it went: the project's name (as people wrote it), or none. */
function Where({ space }: { space?: string | null }) {
  const spaces = useSpaces();
  const name = space ? spaces?.find((s) => s.id === space)?.name : undefined;
  return name ? (
    <span translate="no" className="truncate">
      {name}
    </span>
  ) : (
    <span className="truncate">Not in a project</span>
  );
}

/** The line under its name: how it is going, or what it became and where. */
function Status({ it }: { it: UpItem }) {
  const kind = kindOf(it);
  if (it.status === 'waiting') return <>Waiting</>;
  if (it.status === 'cancelled') return <>Cancelled</>;
  if (it.status === 'sending') return <span className="tnum">{`${bytes(it.sent)} of ${bytes(it.size)}`}</span>;
  if (it.status === 'making') return <>{it.byPath ? 'Moving it' : tr(MAKING[kind ?? ''] ?? 'Almost there')}</>;
  if (it.status === 'error') return <span className="text-err">Not added</span>;
  const d = it.done!;
  if (d.as === 'file')
    return (
      <>
        <span className="shrink-0">In the project’s folder</span>
        <span className="shrink-0">·</span>
        <Where space={d.space ?? it.space} />
      </>
    );
  return (
    <>
      <span className="shrink-0">{d.existed ? 'Already in your Library' : tr(KIND[kind ?? 'page'] ?? 'Page')}</span>
      <span className="shrink-0">·</span>
      <Where space={d.as === 'media' ? d.item?.space : d.space} />
    </>
  );
}

/** What more there is to say: why it was not added, what did not come along, and in the desktop app where the original went. */
function More({ it }: { it: UpItem }): ReactNode {
  if (it.status === 'error') {
    if (it.why === 'kind') return 'The Library keeps documents, spreadsheets, slides, LaTeX, notebooks, pictures, videos and sounds. To keep another kind of file, drop it on a project: it goes in the project’s folder.';
    if (it.why === 'size') return 'It is too large for the Library to keep. Drop it on a project to keep it in the project’s folder.';
    if (it.why === 'room') return 'There is not enough room for it on this computer’s disk.';
    return <span translate="no">{it.error}</span>;
  }
  const d = it.done;
  if (it.status !== 'done' || !d) return null;
  const lines: ReactNode[] = [];
  if (it.copied) lines.push(tr(COPIED[it.copied]));
  if (d.stayed) {
    const keys = d.lost ?? [];
    const lost = keys.filter((k) => k !== 'cut').map((k) => tr(lostWord(k, d.page?.kind)));
    if (lost.length) lines.push(tr(`The original stays where it was: the Library’s copy lacks ${lost.join(', ')}`));
    if (keys.includes('cut')) lines.push('The original stays where it was: not all of it fitted in the Library’s copy');
    if (!lost.length && !keys.includes('cut')) lines.push('The original stays where it was');
  } else if (d.trashed) lines.push('Moved: the original is in the Trash');
  else if (d.moved) lines.push(d.as === 'file' ? 'Moved into the project’s folder' : 'Moved into the Library');
  else if (it.byPath && d.existed) lines.push('The file stays where it was');
  for (const n of d.notes) lines.push(tr(n));
  return lines.length ? lines.map((l, i) => <span key={i} className="block">{l}</span>) : null;
}

/** Opens what it became: the page, the picture, video or sound, or Files at the file in its project's folder. */
function open(it: UpItem) {
  const d = it.done;
  if (!d) return;
  if (d.as === 'page' && d.page) go(`/pages/${d.page.id}`);
  else if (d.as === 'media' && d.item) go(`/media/${d.item.id}`);
  else if (d.as === 'file' && d.path) goFolder(dirname(d.path), d.path);
}

function Row({ it }: { it: UpItem }) {
  const kind = kindOf(it);
  const more = More({ it });
  const opens = it.status === 'done';
  const body = (
    <>
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', it.status === 'error' ? 'bg-err/12 text-err' : it.status === 'done' ? 'bg-accent-soft text-accent' : 'bg-bg-2 text-fg-3')}>
        {ICONS[kind ?? ''] ?? <FileIcon size={15} />}
      </span>
      <span className="min-w-0 flex-1">
        <span translate="no" className="block truncate text-[13px] leading-5 text-fg">
          {it.name}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[12px] leading-4 text-fg-3">
          <Status it={it} />
        </span>
        {more && <span className={cx('mt-1 block text-[12px] leading-snug', it.status === 'error' ? 'text-fg-2' : 'text-fg-3')}>{more}</span>}
      </span>
    </>
  );
  return (
    <div className="relative border-b border-line last:border-0">
      {opens ? (
        <button type="button" onClick={() => open(it)} className="flex w-full min-w-0 items-start gap-2.5 px-3 py-2 text-left hover:bg-bg-1">
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 items-start gap-2.5 py-2 pr-1.5 pl-3">
          {body}
          {(it.status === 'waiting' || it.status === 'sending') && (
            <IconButton label={tr(`Cancel ${it.name}`)} size="sm" onClick={() => cancelUpload(it.id)} className="-my-0.5 shrink-0">
              <X size={14} />
            </IconButton>
          )}
        </div>
      )}
      {it.status === 'sending' && it.size > 0 && (
        <span className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-accent/15">
          <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (it.sent / it.size) * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

/** The Library's tray: shown while it has files, until closed once they are all in. */
export function UploadTray() {
  const items = useLibraryUploads((s) => s.items);
  if (!items.length) return null;
  const going = items.filter(active).length;
  const over = items.length - going;
  const failed = items.filter((i) => i.status === 'error').length;
  return (
    <section aria-label="Adding to the Library" className="overflow-hidden rounded-xl border border-line-2 bg-panel shadow-pop">
      <div className="flex min-h-10 items-center gap-2 border-b border-line py-1 pr-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{going ? 'Adding to the Library' : failed ? tr(`${failed} could not be added`) : 'Added to the Library'}</span>
        <span className="tnum shrink-0 text-[12px] text-fg-3">{`${over} of ${items.length}`}</span>
        {going ? (
          <Button size="sm" variant="ghost" onClick={cancelAll} className="h-8 px-2.5">
            Cancel
          </Button>
        ) : (
          <IconButton label="Close" size="sm" onClick={closeTray}>
            <X size={14} />
          </IconButton>
        )}
      </div>
      <div className="max-h-[min(50dvh,420px)] overflow-y-auto overscroll-contain">
        {items.map((it) => (
          <Row key={it.id} it={it} />
        ))}
      </div>
    </section>
  );
}

/** What a drag of files over the Library says: where they would go (a project, as people named it, or none), or in the desktop app that they move there. */
export function DropHint({ name, className }: { name?: string; className?: string }) {
  const moves = dropMoves();
  return (
    <span className={cx('flex max-w-full items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13.5px] font-medium text-accent-fg shadow-pop', className)}>
      <Upload size={15} className="shrink-0" />
      <span className="truncate">
        {moves
          ? name
            ? tr(`Drop to move them into ${name}`)
            : 'Drop to move them into the Library, not in a project'
          : name
            ? tr(`Drop to add to ${name}`)
            : 'Drop to add to the Library, not in a project'}
      </span>
    </span>
  );
}

/** Files dragged over a tray are not dropped there: the browser would open them in the app's place. */
const noDrop = (e: DragEvent) => {
  if (!dragsFiles(e.dataTransfer)) return;
  e.preventDefault();
  if (e.type === 'dragover') e.dataTransfer.dropEffect = 'none';
};

/** The trays of files on their way, at the bottom right: the Library's over Files' own uploads. */
export function UploadTrays() {
  return (
    <div
      onDragOver={noDrop}
      onDrop={noDrop}
      className="pointer-events-none fixed right-3 bottom-[calc(76px+var(--safe-bottom))] z-40 flex w-[min(92vw,360px)] flex-col gap-2 md:bottom-4 [&>*]:pointer-events-auto"
    >
      <UploadTray />
      <UploadsPanel />
    </div>
  );
}
