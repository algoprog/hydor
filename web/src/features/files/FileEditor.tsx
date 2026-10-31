import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Download, Eye, FileDiff, RotateCcw, Save, SquareTerminal, WrapText } from 'lucide-react';
import { api, ApiError, post, put } from '../../lib/api';
import type { EditorHandle } from '../../lib/codemirror';
import { basename, bytes, dirname, tildify } from '../../lib/format';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { Markdown } from '../../components/Markdown';
import { DiffView } from '../../components/DiffView';
import { Button, cx, Throbber, Empty, IconButton, useIsMobile } from '../../components/ui';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { mu } from '../../lib/machine';
import { isPreviewable } from '@shared/documents';

// Word, Excel, PowerPoint and other documents open as a preview (features/documents).
const OfficePreview = lazy(() => import('../documents/OfficePreview').then((m) => ({ default: m.OfficePreview })));

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
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
};

function isDark() {
  return document.documentElement.classList.contains('dark');
}

/** `embedded`: shown inside a dialog, so there is no Back button (the dialog closes instead). `actions` go in the toolbar. */
export function FileEditor({
  path,
  line,
  embedded,
  onDirty,
  onSaved,
  actions,
}: {
  path: string;
  line?: number;
  embedded?: boolean;
  onDirty?: (dirty: boolean) => void;
  onSaved?: () => void;
  actions?: ReactNode;
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
  const [wrap, setWrap] = useState(() => localStorage.getItem('wa.wrap') === '1');
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorHandle | null>(null);
  const doc = useRef('');
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
    setMode((isMd || isHtml) && !embedded ? 'preview' : 'edit');
    load();
  }, [path, load, isMd, isHtml, embedded]);

  // Mount CodeMirror once the text is loaded.
  useEffect(() => {
    if (!file || file.binary || file.tooLarge || file.content == null || mode !== 'edit' || !host.current) return;
    let alive = true;
    let handle: EditorHandle | null = null;
    import('../../lib/codemirror').then(async ({ createEditor }) => {
      if (!alive || !host.current) return;
      handle = await createEditor(host.current, {
        doc: doc.current,
        path,
        dark: isDark(),
        wrap,
        onChange: (d) => {
          doc.current = d;
          setDirty(d !== (file.content ?? ''));
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
  }, [file, mode, path]);

  useEffect(() => {
    editor.current?.setWrap(wrap);
    localStorage.setItem('wa.wrap', wrap ? '1' : '0');
  }, [wrap]);

  const save = async (force = false) => {
    if (!file || saving) return;
    setSaving(true);
    try {
      const r = await put<{ mtime: number; size: number }>('/api/fs/write', { path, content: doc.current, expectedMtime: force ? undefined : mtime.current });
      mtime.current = r.mtime;
      setFile((f) => (f ? { ...f, content: doc.current, mtime: r.mtime, size: r.size } : f));
      setDirty(false);
      setChangedOnDisk(false);
      toast(`Saved ${basename(path)}`, 'ok');
      onSaved?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setChangedOnDisk(true);
      else toastError(e);
    } finally {
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Pick up edits made by agents or terminals.
  useEffect(() => {
    if (!file || media) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const st = await api<{ exists: boolean; mtime: number }>(`/api/fs/stat?path=${encodeURIComponent(path)}`);
        if (!st.exists || st.mtime === mtime.current) return;
        if (dirty) setChangedOnDisk(true);
        else {
          const f = await load();
          if (f?.content != null) editor.current?.setDoc(f.content);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [file, dirty, path, load, media]);

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

  const raw = mu(`/api/fs/raw?path=${encodeURIComponent(path)}`);
  const crumbs = tildify(path, home).split('/');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2 sm:px-3">
        {mobile && !embedded && (
          <IconButton label="Back" onClick={() => history.back()}>
            <ArrowLeft size={17} />
          </IconButton>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden font-mono text-[12px] text-fg-3" title={path}>
          {crumbs.map((c, i) => (
            <span key={i} className={cx('truncate', i === crumbs.length - 1 ? 'shrink-0 text-fg' : 'min-w-0 shrink')}>
              {i > 0 && <span className="px-0.5 opacity-50">/</span>}
              {c}
            </span>
          ))}
          {dirty && <span className="ml-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" title="Unsaved changes" />}
        </div>
        {file && !file.binary && !file.tooLarge && (
          <>
            {(isMd || isHtml) && (
              <IconButton label={isHtml ? 'Show as a page' : 'Preview'} size="sm" active={mode === 'preview'} onClick={() => setMode((m) => (m === 'preview' ? 'edit' : 'preview'))}>
                <Eye size={14} />
              </IconButton>
            )}
            <IconButton label="Changes since the last commit" size="sm" active={mode === 'diff'} onClick={() => setMode((m) => (m === 'diff' ? 'edit' : 'diff'))}>
              <FileDiff size={14} />
            </IconButton>
            <IconButton label="Word wrap" size="sm" active={wrap} onClick={() => setWrap((w) => !w)}>
              <WrapText size={14} />
            </IconButton>
          </>
        )}
        {actions}
        <IconButton label="Terminal in this folder" size="sm" onClick={() => openTerminalAt(dirname(path))}>
          <SquareTerminal size={14} />
        </IconButton>
        <IconButton label="Download" size="sm" onClick={() => (location.href = `${raw}&download=1`)}>
          <Download size={14} />
        </IconButton>
        {file && !file.binary && !file.tooLarge && (
          <Button size="sm" variant={dirty ? 'primary' : 'ghost'} icon={<Save size={13} />} disabled={!dirty || saving} onClick={() => save()} className="ml-1">
            <span className="hidden sm:inline">{saving ? 'Saving' : 'Save'}</span>
          </Button>
        )}
      </div>
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
        ) : media && (file.binary || ext === 'svg') ? (
          <div className="flex h-full items-center justify-center overflow-auto bg-bg-1 p-4">
            {media === 'image' && <img src={raw} alt={basename(path)} className="max-h-full max-w-full rounded-lg border border-line bg-[repeating-conic-gradient(var(--bg-2)_0%_25%,var(--bg)_0%_50%)] [background-size:16px_16px] object-contain" />}
            {media === 'pdf' && <iframe src={raw} title={basename(path)} className="h-full w-full rounded-lg border border-line bg-white" />}
            {media === 'video' && <video src={raw} controls className="max-h-full max-w-full rounded-lg" />}
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
