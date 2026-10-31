import { lazy, Suspense, useEffect, useState } from 'react';
import { FileText, FolderTree, NotebookText, Search, X } from 'lucide-react';
import { basename, MOD } from '../../lib/format';
import { filePath, go } from '../../lib/nav';
import { useUI } from '../../lib/store';
import { cx, Throbber, Empty, IconButton, Kbd, Segmented, useIsMobile } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { Explorer } from './Explorer';
import { FileEditor } from './FileEditor';
import { FileSearchPanel } from './FileSearch';

const NotebookView = lazy(() => import('../notebook/NotebookView'));

/** A file: notebooks open as notebooks (with their JSON a click away), everything else in the editor. */
function FileView({ path, line }: { path: string; line?: number }) {
  const notebook = path.endsWith('.ipynb');
  const [source, setSource] = useState(false);
  if (notebook && !source) {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-fg-3">
            <Throbber size={34} />
          </div>
        }
      >
        <NotebookView path={path} onSource={() => setSource(true)} />
      </Suspense>
    );
  }
  return (
    <FileEditor
      path={path}
      line={line}
      actions={
        notebook && (
          <IconButton label="Open as a notebook" size="sm" onClick={() => setSource(false)}>
            <NotebookText size={14} />
          </IconButton>
        )
      }
    />
  );
}

/** Open files as tabs above the editor. */
function FileTabs({ current }: { current: string | null }) {
  const tabs = useUI((s) => s.tabs).filter((t) => t.kind === 'file');
  if (!tabs.length) return null;
  return (
    <div className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-line px-2 [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const active = t.ref === current;
        return (
          <div
            key={t.id}
            onClick={() => go(filePath(t.ref))}
            onAuxClick={(e) => e.button === 1 && useUI.getState().closeTab(t.id)}
            title={t.ref}
            className={cx(
              'group flex h-8.5 max-w-[220px] min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 pr-1 pl-3 text-[13px] transition-colors',
              active ? 'border-line bg-bg text-fg' : 'border-transparent text-fg-3 hover:text-fg-2',
            )}
          >
            <FileText size={14} className="shrink-0" />
            <span className="min-w-0 truncate">{basename(t.ref)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                useUI.getState().closeTab(t.id);
                if (active) {
                  const rest = useUI.getState().tabs.filter((x) => x.kind === 'file');
                  go(rest.length ? filePath(rest[rest.length - 1].ref) : '/files');
                }
              }}
              className={cx('flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md hover:bg-bg-3', active ? 'opacity-70' : 'opacity-0 group-hover:opacity-70')}
              aria-label="Close file"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Browse, search and edit files: the tree or search on the left, open files on the right. */
export function FilesPage({ path, line, search }: { path: string | null; line?: number; search?: boolean }) {
  const mobile = useIsMobile();
  const side = useUI((s) => s.side);
  const pane = search ? 'search' : side === 'search' ? 'search' : 'files';

  useEffect(() => {
    if (path) useUI.getState().openTab({ id: `f:${path}`, kind: 'file', ref: path });
  }, [path]);

  const left = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-3 pb-1">
        <Segmented
          size="sm"
          value={pane}
          onChange={(v) => {
            useUI.getState().set({ side: v });
            if (search && v === 'files') go('/files');
          }}
          options={[
            { value: 'files', label: 'Files', icon: <FolderTree size={13} /> },
            { value: 'search', label: 'Search', icon: <Search size={13} /> },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1">{pane === 'search' ? <FileSearchPanel /> : <Explorer />}</div>
    </div>
  );

  if (mobile) {
    if (path) return <FileView key={path} path={path} line={line} />;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Files" />
        <div className="min-h-0 flex-1">{left}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Files" />
      <div className="flex min-h-0 flex-1">
        <div className="w-[300px] shrink-0 border-r border-line bg-bg-1">{left}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <FileTabs current={path} />
          <div className="min-h-0 flex-1">
            {path ? (
              <FileView key={path} path={path} line={line} />
            ) : (
              <Empty icon={<FileText size={20} />} title="No file open">
                Pick a file in the tree, or press <Kbd>{MOD}P</Kbd> to find one by name.
              </Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
