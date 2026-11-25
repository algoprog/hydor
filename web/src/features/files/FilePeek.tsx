// A file opened from a session (one the agent handed over or changed, a link in its reply) shows in a
// dialog over the conversation, which stays where it was. The Files page is a click away, and its ⋯ starts
// a session with the file or adds it to a space. A folder (a link to one in a reply, or one in the path above
// a file there) shows there too, as the Files page shows it: its folders and files open in place, and Back
// returns to what the dialog showed before. Full screen in its top line (on a computer, as the panel beside the
// conversation has) makes it fill the whole app, and the same button brings it back to its size; the next one opens
// as the last was left (kept in this browser). The session's agent's edits of the file show in it as they are written
// (pages/liveEdits.ts), as in the panel beside the conversation.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { ChevronLeft, Folder, FolderOpen, Maximize2, Minimize2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { basename, inside, joinPath, pathParts } from '../../lib/format';
import { go, showInFiles, useFilePeek, type Peeked } from '../../lib/nav';
import { machineBase } from '../../lib/machine';
import { Button, IconButton, Throbber, useMediaQuery } from '../../components/ui';
import { useDiscardGuard } from '../settings/Instructions';
import { goFolder } from './actions';
import { FileView } from './FilesPage';
import { EditsOf } from '../pages/liveEdits';
import { FolderView } from './FolderView';
import { searchUrl } from './SearchView';
import { FileMore } from './SpaceMenu';

const shut = () => useFilePeek.setState({ file: null, show: undefined });

/** Whether the last file window was left full screen: the next one opens so too (kept in this browser). */
const FULL_KEY = 'wa.peek.full';
const wasFull = (): boolean => {
  try {
    return localStorage.getItem(FULL_KEY) === '1';
  } catch {
    return false;
  }
};
const keepFull = (on: boolean) => {
  try {
    if (on) localStorage.setItem(FULL_KEY, '1');
    else localStorage.removeItem(FULL_KEY);
  } catch {}
};

/** The item right in folder `dir` on the way to `p` (`p` itself when it is in it); none when `p` is not below `dir`. */
function toward(dir: string, p: string): string | undefined {
  if (p === dir || !inside(p, dir)) return undefined;
  const step = pathParts(p)[pathParts(dir).length];
  return step ? joinPath(dir, step) : undefined;
}

/** Whether the path is a folder: known when it was opened as one, else asked of the server (null while it answers). */
function useIsFolder(path: string | undefined, known?: boolean): boolean | null {
  const [found, setFound] = useState<{ path: string; dir: boolean } | null>(null);
  useEffect(() => {
    if (!path || known) return;
    let alive = true;
    api<{ exists: boolean; dir?: boolean }>(`/api/fs/stat?path=${encodeURIComponent(path)}`).then(
      (st) => alive && setFound({ path, dir: !!st.dir }),
      // Not found or not readable: the file's view says why.
      () => alive && setFound({ path, dir: false }),
    );
    return () => {
      alive = false;
    };
  }, [path, known]);
  if (!path) return null;
  if (known) return true;
  return found?.path === path ? found.dir : null;
}

export function FilePeek() {
  const file = useFilePeek((s) => s.file);
  const open = !!file;
  const folder = useIsFolder(file?.path, file?.dir);
  const guard = useDiscardGuard();
  const { leave } = guard;
  const [loc] = useLocation();
  // Opened over a session's conversation: that agent's edits of the file show in it as they are written.
  const over = /^\/s\/([^/?#]+)/.exec(location.pathname.slice(machineBase.length))?.[1];
  const sessionKey = over ? decodeURIComponent(over) : null;
  // Another page (the browser's Back, a link) takes the file away with the page it was opened over.
  useEffect(shut, [loc]);
  // Over the whole app instead of in its window, as the last one was left (the files and folders it goes on to keep it):
  // only where the window does not fill the screen already (a phone's comes up from the bottom, as wide as it).
  const [full, setFull] = useState(wasFull);
  const roomy = useMediaQuery('(min-width: 640px)');
  const big = full && roomy;
  // Each opening as the last one was left, here or in another of this browser's tabs (before it shows: no jump in size).
  useLayoutEffect(() => {
    if (open) setFull(wasFull());
  }, [open]);
  const toggleFull = () => {
    setFull(!big);
    keepFull(!big);
  };

  /** True once it is closed: nothing unsaved, or the changes were discarded. */
  const close = useCallback(async () => {
    if (!(await leave())) return false;
    shut();
    return true;
  }, [leave]);

  /** Shows another file or folder in the dialog, with Back to this one; asks first about changes not saved. */
  const show = useCallback(
    async (to: Peeked) => {
      if (!(await leave())) return false;
      useFilePeek.setState((s) => ({ file: { ...to, back: s.file ? { ...s.file, dir: folder === true || undefined } : undefined } }));
      return true;
    },
    [leave, folder],
  );

  // The file's path above it goes to its folders here, through the same guard.
  useEffect(() => {
    if (!open) return;
    useFilePeek.setState({ show });
    return () => useFilePeek.setState({ show: undefined });
  }, [open, show]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // In a folder, Escape first ends what it is doing there (a name being typed, a filter, a pick).
      if (folder && (e.defaultPrevented || (e.target instanceof Element && e.target.closest('input, textarea')))) return;
      void close();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, close, folder]);

  /** Back to what the dialog showed before: a folder with the way to what it shows now picked in it. */
  const back = async () => {
    const to = file?.back;
    if (!file || !to || !(await leave())) return;
    useFilePeek.setState({ file: to.dir ? { ...to, sel: toward(to.path, file.path) ?? to.sel } : to });
  };
  const inFiles = async () => {
    if (!file || !(await close())) return;
    if (folder) goFolder(file.path);
    else showInFiles(file.path, file.line);
  };

  return (
    <>
      {file &&
        createPortal(
          <div className={big ? 'scrim holds fixed inset-0 z-50 flex' : 'scrim holds fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4'} onPointerDown={(e) => e.target === e.currentTarget && close()}>
            <div
              role="dialog"
              aria-modal
              aria-label={basename(file.path) || file.path}
              className={
                big
                  ? 'anim-modal flex h-full w-full flex-col overflow-hidden bg-elevated pt-[var(--safe-top)]'
                  : 'anim-modal flex h-[92dvh] w-full max-w-[1100px] flex-col overflow-hidden rounded-t-[20px] border border-line bg-elevated shadow-lg sm:h-[min(88dvh,960px)] sm:rounded-[20px]'
              }
            >
              <div className={file.back ? 'flex shrink-0 items-center gap-1 py-2 pr-2.5 pl-2' : 'flex shrink-0 items-center gap-1 py-2 pr-2.5 pl-5'}>
                {file.back && (
                  <IconButton label={file.back.dir ? 'Back to the folder' : 'Back to the file'} onClick={() => void back()}>
                    <ChevronLeft size={18} />
                  </IconButton>
                )}
                {folder && <Folder size={16} className="mr-1 shrink-0 text-fg-3" aria-hidden />}
                <div translate="no" className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight" title={file.path}>
                  {basename(file.path) || file.path}
                </div>
                <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => void inFiles()}>
                  <span className="max-sm:hidden">Open in Files</span>
                </Button>
                {roomy && (
                  <IconButton label={big ? 'Close full screen' : 'Full screen'} onClick={toggleFull}>
                    {big ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </IconButton>
                )}
                <FileMore path={file.path} dir={!!folder} inFiles={false} />
                <IconButton label="Close" onClick={close}>
                  <X size={17} />
                </IconButton>
              </div>
              <div className={big ? 'min-h-0 flex-1 border-t border-line bg-bg pb-[var(--safe-bottom)]' : 'min-h-0 flex-1 border-t border-line bg-bg pb-[var(--safe-bottom)] sm:pb-0'}>
                {folder === null ? (
                  <div className="flex h-full items-center justify-center text-fg-3">
                    <Throbber size={34} />
                  </div>
                ) : folder ? (
                  <FolderView
                    dir={file.path}
                    select={file.sel ?? null}
                    onDir={(d) => void show({ path: d, dir: true })}
                    onFile={(p) => void show({ path: p })}
                    onSearch={(q) => void close().then((ok) => ok && go(searchUrl({ q, in: file.path })))}
                    embedded
                  />
                ) : (
                  <EditsOf.Provider value={sessionKey}>
                    <FileView key={file.path} path={file.path} line={file.line} embedded onDirty={guard.setDirty} />
                  </EditsOf.Provider>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
      {guard.node}
    </>
  );
}
