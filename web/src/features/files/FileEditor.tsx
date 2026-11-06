import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { ArrowLeft, Copy, Download, Ellipsis, Eye, FileDiff, FolderOpen, Highlighter, MessageSquarePlus, RotateCcw, Save, Search, Signature, SlidersHorizontal, SquareTerminal, WrapText } from 'lucide-react';
import { api, ApiError, post, put } from '../../lib/api';
import type { EditorHandle } from '../../lib/codemirror';
import { basename, bytes, dirname, isWinPath, tildify } from '../../lib/format';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { Markdown } from '../../components/Markdown';
import { DiffView } from '../../components/DiffView';
import { Button, cx, Throbber, Empty, IconButton, MenuItem, MenuSep, Popover, useIsMobile } from '../../components/ui';
import { VideoPlayer } from '../../components/VideoPlayer';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { mu } from '../../lib/machine';
import { showInFiles } from '../../lib/nav';
import { isPreviewable } from '@shared/documents';
import { copyPaths, goFolder, itemOf, startSession } from './actions';
import { useSpaceMenu } from './SpaceMenu';
import { useWatchMs } from './FileAsk';
import { EDITABLE, editFile } from '../mediaedit/open';
import { EDITABLE_VIDEO, editVideoFile } from '../mediaedit/video/open';

// Word, Excel, PowerPoint and other documents open as a preview (features/documents).
const OfficePreview = lazy(() => import('../documents/OfficePreview').then((m) => ({ default: m.OfficePreview })));
// A PDF's Fill & sign: its fields to fill and its pages to write and sign on (fill/).
const FillSign = lazy(() => import('./fill/FillSign').then((m) => ({ default: m.FillSign })));
// A PDF's reader, to highlight it and keep notes beside it (read/).
const PdfReader = lazy(() => import('./read/PdfReader').then((m) => ({ default: m.PdfReader })));

interface FileData {
  path: string;
  size: number;
  mtime: number;
  binary: boolean;
  tooLarge: boolean;
  content: string | null;
}

const MEDIA: Record<string, 'image' | 'pdf' | 'video' | 'audio'> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  ico: 'image',
  bmp: 'image',
  avif: 'image',
  pdf: 'pdf',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',
  mkv: 'video',
  ogv: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
};

function isDark() {
  return document.documentElement.classList.contains('dark');
}

/**
 * `embedded`: shown inside a dialog, so there is no Back button (the dialog closes instead), nor a terminal
 * (it would open behind the dialog). A dialog opens Markdown and HTML straight into editing, unless
 * `preview` shows them as they look first, as the Files page does. `actions` go in the toolbar. `fileMenu`
 * (the Files page): a menu with what else can be done with the file (a session with it, a space, its folder).
 * `saveFirst` is given a way to save unsaved changes (true when there were none, or they are saved), for an agent
 * asked about the file to work on them. Changes made to the file elsewhere (an agent, a terminal) come into the
 * editor as they land, while nothing is changed here, their lines tinted for a moment; asked about otherwise.
 */
export function FileEditor({
  path,
  line,
  embedded,
  preview,
  onDirty,
  onSaved,
  actions,
  fileMenu,
  saveFirst,
}: {
  path: string;
  line?: number;
  embedded?: boolean;
  preview?: boolean;
  onDirty?: (dirty: boolean) => void;
  onSaved?: () => void;
  actions?: ReactNode;
  fileMenu?: boolean;
  saveFirst?: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const home = useApp((s) => s.boot?.home);
  const mobile = useIsMobile();
  const [file, setFile] = useState<FileData | null>(null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  const [saving, setSaving] = useState(false);
  const [changedOnDisk, setChangedOnDisk] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview' | 'diff'>('edit');
  // A Markdown document's own HTML, images next to it and links to other files: loaded with the first preview.
  const [mdHtml, setMdHtml] = useState<typeof import('../../components/markdownHtml') | null>(null);
  useEffect(() => {
    if (mode === 'preview' && !mdHtml) import('../../components/markdownHtml').then((m) => setMdHtml(m), () => {});
  }, [mode, mdHtml]);
  const docImages = useMemo(() => mdHtml?.localImages(dirname(path)), [mdHtml, path]);
  const [diff, setDiff] = useState('');
  // Phones wrap long lines unless told not to, a setting of their own: a narrow screen cuts most code off.
  const [wrapKey] = useState(() => (mobile ? 'wa.wrap.phone' : 'wa.wrap'));
  const [wrap, setWrap] = useState(() => (localStorage.getItem(wrapKey) ?? (mobile ? '1' : '0')) === '1');
  const [menu, setMenu] = useState(false);
  // A PDF being filled in and signed (Fill & sign) instead of shown.
  const [fill, setFill] = useState(false);
  useEffect(() => setFill(false), [path]);
  // A PDF read in the app's reader (Highlight), as one with highlights opens, so its notes are there.
  const [read, setRead] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const deskRef = useRef<HTMLButtonElement>(null);
  const [desk, setDesk] = useState(false);
  const space = useSpaceMenu(
    () => [itemOf(path, false, file?.size)],
    () => (setMenu(false), setDesk(false)),
  );
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorHandle | null>(null);
  const doc = useRef('');
  // The text as last read or saved: the editor's differs while there are unsaved changes.
  const base = useRef('');
  const mtime = useRef(0);
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const media = MEDIA[ext];
  const isMd = ext === 'md' || ext === 'markdown' || ext === 'mdx';
  const isHtml = ext === 'html' || ext === 'htm';
  const office = isPreviewable(path);
  // An HTML file shows as a page: sandboxed, with a short-lived link that lets it load its own files.
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  useEffect(() => {
    setPageUrl(null);
    if (!isHtml || mode !== 'preview') return;
    let alive = true;
    post<{ url: string }>('/api/fs/view-link', { path })
      .then((r) => alive && setPageUrl(mu(r.url)))
      .catch(toastError);
    return () => {
      alive = false;
    };
  }, [isHtml, mode, path]);

  const load = useCallback(async () => {
    setError('');
    try {
      const f = await api<FileData>(`/api/fs/read?path=${encodeURIComponent(path)}`);
      setFile(f);
      doc.current = f.content ?? '';
      base.current = f.content ?? '';
      mtime.current = f.mtime;
      setDirty(false);
      setChangedOnDisk(false);
      return f;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [path]);

  useEffect(() => {
    // A dialog editor (CLAUDE.md, a skill) opens straight into editing and leaves the Files tabs alone.
    if (!embedded) useUI.getState().openTab({ id: `f:${path}`, kind: 'file', ref: path });
    setFile(null);
    setMode((isMd || isHtml) && (!embedded || preview) ? 'preview' : 'edit');
    load();
  }, [path, load, isMd, isHtml, embedded, preview]);

  // Mount CodeMirror once the text is loaded; reading it again later (a change from elsewhere, a save) keeps it.
  const editable = !!file && !file.binary && !file.tooLarge && file.content != null;
  useEffect(() => {
    if (!editable || mode !== 'edit' || !host.current) return;
    let alive = true;
    let handle: EditorHandle | null = null;
    import('../../lib/codemirror').then(async ({ createEditor }) => {
      if (!alive || !host.current) return;
      handle = await createEditor(host.current, {
        doc: doc.current,
        path,
        dark: isDark(),
        wrap,
        phone: mobile,
        onChange: (d) => {
          doc.current = d;
          setDirty(d !== base.current);
        },
        onSave: () => saveRef.current(),
      });
      if (!alive) return handle.destroy();
      editor.current = handle;
      if (line) handle.gotoLine(line);
    });
    const mo = new MutationObserver(() => editor.current?.setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      alive = false;
      mo.disconnect();
      handle?.destroy();
      editor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, mode, path]);

  useEffect(() => {
    editor.current?.setWrap(wrap);
    localStorage.setItem(wrapKey, wrap ? '1' : '0');
  }, [wrap, wrapKey]);

  const save = async (force = false): Promise<boolean> => {
    if (!file || saving) return false;
    setSaving(true);
    try {
      const content = doc.current;
      const r = await put<{ mtime: number; size: number }>('/api/fs/write', { path, content, expectedMtime: force ? undefined : mtime.current });
      mtime.current = r.mtime;
      base.current = content;
      setFile((f) => (f ? { ...f, content, mtime: r.mtime, size: r.size } : f));
      setDirty(doc.current !== content);
      setChangedOnDisk(false);
      toast(`Saved ${basename(path)}`, 'ok');
      onSaved?.();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setChangedOnDisk(true);
      else toastError(e);
      return false;
    } finally {
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  if (saveFirst) saveFirst.current = async () => (dirtyRef.current ? saveRef.current() : true);

  // Pick up edits made by agents or terminals, every second while an agent is at work.
  const watchMs = useWatchMs();
  const loaded = !!file;
  useEffect(() => {
    if (!loaded || media) return;
    let busy = false;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible' || busy) return;
      busy = true;
      try {
        const st = await api<{ exists: boolean; mtime: number }>(`/api/fs/stat?path=${encodeURIComponent(path)}`);
        if (!st.exists || st.mtime === mtime.current) return;
        if (dirtyRef.current) setChangedOnDisk(true);
        else {
          const f = await load();
          if (f?.content != null) editor.current?.setDoc(f.content, { flash: true });
        }
      } catch {
      } finally {
        busy = false;
      }
    }, watchMs);
    return () => clearInterval(t);
  }, [loaded, path, load, media, watchMs]);

  useEffect(() => {
    if (mode !== 'diff') return;
    api<{ diff: string }>(`/api/fs/diff?path=${encodeURIComponent(path)}`)
      .then((r) => setDiff(r.diff))
      .catch(toastError);
  }, [mode, path, file?.mtime]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  useEffect(() => {
    setRead(false);
    if (media !== 'pdf') return;
    let alive = true;
    api<{ highlights: unknown[] }>(`/api/pdf-notes?path=${encodeURIComponent(path)}`).then(
      (r) => alive && r.highlights.length > 0 && setRead(true),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [path, media]);

  const raw = mu(`/api/fs/raw?path=${encodeURIComponent(path)}`);
  // A picture opens in the picture editor, a video in the video editor (not from a dialog, which would cover it): saved
  // over, it shows anew here.
  const canEdit = (media === 'image' && !!file && !embedded && EDITABLE.test(path)) || (media === 'video' && !!file && !embedded && EDITABLE_VIDEO.test(path));
  const editPicture = () => (media === 'video' ? editVideoFile : editFile)(path, { label: basename(path), after: (r) => (r.replaced ? void load() : r.path && showInFiles(r.path)) });
  const crumbs = tildify(path, home).split(isWinPath(path) ? /[\\/]/ : '/');
  const text = !!file && !file.binary && !file.tooLarge;
  const togglePreview = () => setMode((m) => (m === 'preview' ? 'edit' : 'preview'));
  const toggleDiff = () => setMode((m) => (m === 'diff' ? 'edit' : 'diff'));
  const download = () => (location.href = `${raw}&download=1`);
  const fromMenu = (f: () => void) => () => {
    setMenu(false);
    f();
  };
  const unsaved = dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" title="Unsaved changes" />;
  // What else can be done with the file (the Files page): start a session with it, add it to a space…
  const shut = (f: () => void) => () => {
    setMenu(false);
    setDesk(false);
    f();
  };
  const more = (
    <>
      <MenuItem icon={<MessageSquarePlus size={14} />} onClick={shut(() => startSession([itemOf(path, false, file?.size)]))}>
        Start a session with it
      </MenuItem>
      {space.entry}
      <MenuItem icon={<FolderOpen size={14} />} onClick={shut(() => goFolder(dirname(path), path))}>
        Show in its folder
      </MenuItem>
      <MenuItem icon={<Copy size={14} />} onClick={shut(() => copyPaths([itemOf(path)]))}>
        Copy path
      </MenuItem>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {mobile ? (
        // Phones: the file's name over its folder, and only what is used most beside them; the rest is under More.
        <div className={cx('shrink-0 border-b border-line', !embedded && 'pt-[var(--safe-top)]')}>
          <div className={cx('flex items-center gap-1 px-2', embedded ? 'h-12' : 'h-14')}>
            {!embedded && (
              <IconButton label="Back" onClick={() => history.back()}>
                <ArrowLeft size={18} />
              </IconButton>
            )}
            <div className="ml-1 min-w-0 flex-1" title={path}>
              {/* A dialog has the name in its title already. */}
              {!embedded && (
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold tracking-tight" translate="no">
                    {basename(path)}
                  </span>
                  {unsaved}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {/* Cut at its start: the folders nearest the file say the most. */}
                <span dir="rtl" className="min-w-0 truncate text-left font-mono text-[11.5px] text-fg-3" translate="no">
                  <span dir="ltr">{tildify(dirname(path), home)}</span>
                </span>
                {embedded && unsaved}
              </div>
            </div>
            {text && (isMd || isHtml) && (
              <IconButton label={isHtml ? 'Show as a page' : 'Preview'} active={mode === 'preview'} onClick={togglePreview}>
                <Eye size={17} />
              </IconButton>
            )}
            {canEdit && (
              <IconButton label={media === 'video' ? 'Edit the video' : 'Edit the picture'} onClick={editPicture}>
                <SlidersHorizontal size={17} />
              </IconButton>
            )}
            {media === 'pdf' && file && !fill && !read && (
              <IconButton label="Highlight" onClick={() => setRead(true)}>
                <Highlighter size={17} />
              </IconButton>
            )}
            {media === 'pdf' && file && !fill && (
              <IconButton label="Fill & sign" onClick={() => setFill(true)}>
                <Signature size={17} />
              </IconButton>
            )}
            {actions}
            {text && (dirty || saving) && (
              <Button size="sm" variant="primary" icon={<Save size={13} />} disabled={saving} onClick={() => save()} className="mx-0.5">
                {saving ? 'Saving' : 'Save'}
              </Button>
            )}
            <IconButton ref={moreRef} label="More" active={menu} onClick={() => (space.reset(), setMenu((m) => !m))}>
              <Ellipsis size={17} />
            </IconButton>
            <Popover anchor={moreRef} open={menu} onClose={() => setMenu(false)} align="end" width={272}>
              {space.sub || (
                <>
                  {text && mode === 'edit' && (
                    <MenuItem icon={<Search size={14} />} onClick={fromMenu(() => editor.current?.find())}>
                      Find
                    </MenuItem>
                  )}
                  {text && (
                    <>
                      <MenuItem icon={<WrapText size={14} />} checked={wrap} onClick={fromMenu(() => setWrap((w) => !w))}>
                        Word wrap
                      </MenuItem>
                      <MenuItem icon={<FileDiff size={14} />} checked={mode === 'diff'} onClick={fromMenu(toggleDiff)}>
                        Changes since the last commit
                      </MenuItem>
                      <MenuSep />
                    </>
                  )}
                  {!embedded && (
                    <MenuItem icon={<SquareTerminal size={14} />} onClick={fromMenu(() => openTerminalAt(dirname(path)))}>
                      Terminal in this folder
                    </MenuItem>
                  )}
                  <MenuItem icon={<Download size={14} />} onClick={fromMenu(download)}>
                    Download
                  </MenuItem>
                  {fileMenu && (
                    <>
                      <MenuSep />
                      {more}
                    </>
                  )}
                </>
              )}
            </Popover>
          </div>
        </div>
      ) : (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden font-mono text-[12px] text-fg-3" title={path} translate="no">
            {crumbs.map((c, i) => (
              <span key={i} className={cx('truncate', i === crumbs.length - 1 ? 'shrink-0 text-fg' : 'min-w-0 shrink')}>
                {i > 0 && <span className="px-0.5 opacity-50">/</span>}
                {c}
              </span>
            ))}
            {dirty && <span className="ml-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" title="Unsaved changes" />}
          </div>
          {text && (
            <>
              {(isMd || isHtml) && (
                <IconButton label={isHtml ? 'Show as a page' : 'Preview'} size="sm" active={mode === 'preview'} onClick={togglePreview}>
                  <Eye size={14} />
                </IconButton>
              )}
              <IconButton label="Changes since the last commit" size="sm" active={mode === 'diff'} onClick={toggleDiff}>
                <FileDiff size={14} />
              </IconButton>
              <IconButton label="Word wrap" size="sm" active={wrap} onClick={() => setWrap((w) => !w)}>
                <WrapText size={14} />
              </IconButton>
            </>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" icon={<SlidersHorizontal size={14} />} onClick={editPicture}>
              Edit
            </Button>
          )}
          {media === 'pdf' && file && !fill && !read && (
            <Button size="sm" variant="ghost" icon={<Highlighter size={14} />} onClick={() => setRead(true)}>
              Highlight
            </Button>
          )}
          {media === 'pdf' && file && !fill && (
            <Button size="sm" variant="ghost" icon={<Signature size={14} />} onClick={() => setFill(true)}>
              Fill & sign
            </Button>
          )}
          {actions}
          {!embedded && (
            <IconButton label="Terminal in this folder" size="sm" onClick={() => openTerminalAt(dirname(path))}>
              <SquareTerminal size={14} />
            </IconButton>
          )}
          <IconButton label="Download" size="sm" onClick={download}>
            <Download size={14} />
          </IconButton>
          {fileMenu && (
            <>
              <IconButton ref={deskRef} label="More" size="sm" active={desk} onClick={() => (space.reset(), setDesk((o) => !o))}>
                <Ellipsis size={15} />
              </IconButton>
              <Popover anchor={deskRef} open={desk} onClose={() => setDesk(false)} align="end" width={250}>
                {space.sub || more}
              </Popover>
            </>
          )}
          {text && (
            <Button size="sm" variant={dirty ? 'primary' : 'ghost'} icon={<Save size={13} />} disabled={!dirty || saving} onClick={() => save()} className="ml-1">
              {saving ? 'Saving' : 'Save'}
            </Button>
          )}
        </div>
      )}
      {space.dialog}
      {changedOnDisk && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-[12.5px]">
          <span className="flex-1">The file changed on disk since you opened it.</span>
          <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={async () => {
            const f = await load();
            if (f?.content != null) editor.current?.setDoc(f.content);
          }}>
            Reload (discard mine)
          </Button>
          <Button size="sm" variant="danger" onClick={() => save(true)}>
            Overwrite with mine
          </Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {error ? (
          <Empty title="Could not open the file">{error}</Empty>
        ) : !file ? (
          <div className="flex h-full items-center justify-center text-fg-3">
            <Throbber size={34} />
          </div>
        ) : office && (file.binary || file.tooLarge || ext === 'rtf') ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-fg-3"><Throbber size={34} /></div>}>
            <OfficePreview path={path} mtime={file.mtime} />
          </Suspense>
        ) : media === 'pdf' && fill ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-fg-3"><Throbber size={34} /></div>}>
            <FillSign
              path={path}
              onDone={(saved) => {
                setFill(false);
                // A copy opens beside it in Files; a file written over shows again as it is now.
                if (saved && !saved.replaced && !embedded) showInFiles(saved.path);
                else if (saved?.replaced) void load();
              }}
            />
          </Suspense>
        ) : media === 'pdf' && read ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-fg-3"><Throbber size={34} /></div>}>
            <PdfReader path={path} mtime={file.mtime} canAsk={!!saveFirst} onClose={() => setRead(false)} onFileSaved={(saved) => saved.replaced && void load()} />
          </Suspense>
        ) : media && (file.binary || file.tooLarge || ext === 'svg') ? (
          <div className={cx('flex h-full items-center justify-center overflow-auto bg-bg-1', media === 'video' ? 'p-0 sm:p-3' : 'p-4')}>
            {media === 'image' && <img src={`${raw}&v=${file.mtime}`} alt={basename(path)} className="max-h-full max-w-full rounded-lg border border-line bg-[repeating-conic-gradient(var(--bg-2)_0%_25%,var(--bg)_0%_50%)] [background-size:16px_16px] object-contain" />}
            {media === 'pdf' && <iframe src={`${raw}&v=${file.mtime}`} title={basename(path)} className="h-full w-full rounded-lg border border-line bg-white" />}
            {media === 'video' && <VideoPlayer key={`${path}:${file.mtime}`} src={raw} name={basename(path)} downloadUrl={`${raw}&download=1`} />}
            {media === 'audio' && <audio src={raw} controls />}
          </div>
        ) : file.binary ? (
          <Empty title="Binary file" icon={<Download size={22} />}>
            {bytes(file.size)} — download it to open it locally.
          </Empty>
        ) : file.tooLarge ? (
          <Empty title="File is too large to edit here" icon={<Download size={22} />}>
            {bytes(file.size)}. Download it or open it in a terminal.
          </Empty>
        ) : mode === 'preview' && isHtml ? (
          pageUrl ? (
            <iframe
              key={`${pageUrl}:${file.mtime}`}
              src={pageUrl}
              title={basename(path)}
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-fg-3">
              <Throbber size={34} />
            </div>
          )
        ) : mode === 'preview' ? (
          <div className="h-full overflow-auto">
            <div className="mx-auto max-w-[860px] px-5 py-6">
              {mdHtml ? <Markdown text={doc.current} rehypeExtra={mdHtml.MD_HTML} resolveImage={docImages} baseDir={dirname(path)} /> : <Throbber className="text-fg-3" />}
            </div>
          </div>
        ) : mode === 'diff' ? (
          <div className="h-full overflow-auto">{diff ? <DiffView diff={diff} /> : <Empty title="No changes">This file matches the last commit (or is not in a git repository).</Empty>}</div>
        ) : (
          <div ref={host} className="cm-host absolute inset-0" />
        )}
      </div>
    </div>
  );
}
