// A file opened from a session (one the agent handed over or changed, a link in its reply) shows in a
// dialog over the conversation, which stays where it was. The Files page is a click away, and its ⋯ starts
// a session with the file or adds it to a space.
import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { FolderOpen, X } from 'lucide-react';
import { basename } from '../../lib/format';
import { showInFiles, useFilePeek } from '../../lib/nav';
import { Button, IconButton } from '../../components/ui';
import { useDiscardGuard } from '../settings/Instructions';
import { FileView } from './FilesPage';
import { FileMore } from './SpaceMenu';

const shut = () => useFilePeek.setState({ file: null });

export function FilePeek() {
  const file = useFilePeek((s) => s.file);
  const open = !!file;
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

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, close]);

  return (
    <>
      {file &&
        createPortal(
          <div className="anim-overlay scrim fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && close()}>
            <div
              role="dialog"
              aria-modal
              aria-label={basename(file.path)}
              className="anim-pop flex h-[92dvh] w-full max-w-[1100px] flex-col overflow-hidden rounded-t-[20px] border border-line bg-elevated shadow-lg sm:h-[min(88dvh,960px)] sm:rounded-[20px]"
            >
              <div className="flex shrink-0 items-center gap-1 py-2 pr-2.5 pl-5">
                <div className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight" title={file.path}>
                  {basename(file.path)}
                </div>
                <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={async () => (await close()) && showInFiles(file.path, file.line)}>
                  <span className="max-sm:hidden">Open in Files</span>
                </Button>
                <FileMore path={file.path} inFiles={false} />
                <IconButton label="Close" onClick={close}>
                  <X size={17} />
                </IconButton>
              </div>
              <div className="min-h-0 flex-1 border-t border-line bg-bg pb-[var(--safe-bottom)] sm:pb-0">
                <FileView key={file.path} path={file.path} line={file.line} embedded onDirty={guard.setDirty} />
              </div>
            </div>
          </div>,
          document.body,
        )}
      {guard.node}
    </>
  );
}
