// A file opened from a session (one the agent handed over or changed, a link in its reply) shows in a
// dialog over the conversation, which stays where it was. The Files page is a click away, and its ⋯ starts
// a session with the file or adds it to a space. A folder (a link to one in a reply, or one in the path above
// a file there) shows there too, as the Files page shows it: its folders and files open in place, and Back
// returns to what the dialog showed before.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { ChevronLeft, Folder, FolderOpen, X } from 'lucide-react';
import { api } from '../../lib/api';
import { basename, inside, joinPath, pathParts } from '../../lib/format';
import { go, showInFiles, useFilePeek, type Peeked } from '../../lib/nav';
import { Button, IconButton, Throbber } from '../../components/ui';
import { useDiscardGuard } from '../settings/Instructions';
import { goFolder } from './actions';
import { FileView } from './FilesPage';
import { FolderView } from './FolderView';
import { searchUrl } from './SearchView';
import { FileMore } from './SpaceMenu';

const shut = () => useFilePeek.setState({ file: null, show: undefined });

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
  // Another page (the browser's Back, a link) takes the file away with the page it was opened over.
  useEffect(shut, [loc]);

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
          <div className="scrim holds fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && close()}>
            <div
              role="dialog"
              aria-modal
              aria-label={basename(file.path) || file.path}
              className="flex h-[92dvh] w-full max-w-[1100px] flex-col overflow-hidden rounded-t-[20px] border border-line bg-elevated shadow-lg sm:h-[min(88dvh,960px)] sm:rounded-[20px]"
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
                <FileMore path={file.path} dir={!!folder} inFiles={false} />
                <IconButton label="Close" onClick={close}>
                  <X size={17} />
                </IconButton>
              </div>
              <div className="min-h-0 flex-1 border-t border-line bg-bg pb-[var(--safe-bottom)] sm:pb-0">
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
                  <FileView key={file.path} path={file.path} line={file.line} embedded onDirty={guard.setDirty} />
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
