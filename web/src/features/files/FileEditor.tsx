import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { ArrowLeft, ClipboardPaste, Copy, CornerDownRight, Download, Ellipsis, Eye, FileDiff, FolderOpen, Highlighter, Keyboard, MessageSquarePlus, Replace, RotateCcw, Save, Scissors, Search, Signature, SlidersHorizontal, Sparkles, SquareTerminal, TextSelect, WrapText } from 'lucide-react';
import { api, ApiError, post, put } from '../../lib/api';
import type { EditorHandle, EditorSnapshot, EditorStatus } from '../../lib/codemirror';
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
import { askAbout, useWatchMs } from './FileAsk';
import { FileStatus } from './FileStatus';
import { ContextMenu, type ContextMenuAt, type MenuEntry } from '../pages/common/menus';
import { ShortcutsDialog, type ShortcutGroup } from '../pages/common/Shortcuts';
import { isApple, keyLabel } from '../pages/common/keys';
import { detectEol, forDisk, forEditor, type Eol } from './lineends';
import { getDraft, isDirty, keepDraft, leaveFile, registerSaver, setDirty as noteDirty } from './unsaved';
import { EDITABLE, editFile } from '../mediaedit/open';
import { EDITABLE_VIDEO, editVideoFile } from '../mediaedit/video/open';
import { EDITABLE_SOUND, editSoundFile } from '../mediaedit/audio/open';

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
  oga: 'audio',
  opus: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
  weba: 'audio',
};

/** The text editor's keys, for the shortcuts list (More → Keyboard shortcuts). */
const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'File',
    items: [
      ['Ctrl+S', 'Save'],
      ['Shift+F10 / Menu', 'Open the right-click menu at the cursor'],
    ],
  },
  {
    title: 'Find',
    items: [
      ['Ctrl+F', 'Find'],
      [isApple ? 'Ctrl+Alt+F' : 'Ctrl+H', 'Find and replace'],
      [isApple ? 'Ctrl+Alt+G' : 'Ctrl+G / Ctrl+Alt+G', 'Go to a line'],
      ['F3 / Shift+F3', 'Next / previous match'],
      ['Ctrl+D', 'Pick the next place the picked words appear'],
      ['Ctrl+Shift+L', 'Pick every place the picked words appear'],
    ],
  },
  {
    title: 'Edit',
    items: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
      ['Ctrl+/', 'Comment or uncomment the lines'],
      ['Tab / Shift+Tab', 'Indent / unindent'],
      ['Alt+↑ / Alt+↓', 'Move the line up / down'],
      ['Shift+Alt+↑ / Shift+Alt+↓', 'Copy the line up / down'],
      ['Ctrl+Shift+K', 'Delete the line'],
      ['Ctrl+Enter', 'Add a line below'],
      ['Ctrl+Space', 'Suggest a completion'],
    ],
  },
  {
    title: 'Picking',
    items: [
      ['Ctrl+A', 'Pick everything'],
      ['Alt+L', 'Pick the line'],
      ['Ctrl+I', 'Pick the block around it'],
      ['Ctrl+Alt+↑ / Ctrl+Alt+↓', 'Add a cursor above / below'],
      ['Ctrl+Shift+[ / Ctrl+Shift+]', 'Fold / unfold the block'],
    ],
  },
];

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
  // Coming back to a file with changes not saved, it starts as changed (its tab's dot stays on).
  const [dirty, setDirty] = useState(() => !embedded && isDirty(path));
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
  // The status bar's reading of the editor, the right-click menu's place, and the shortcuts list.
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [ctx, setCtx] = useState<ContextMenuAt | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [eolShown, setEolShown] = useState<Eol>('lf');
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
  // How the file's lines end (the editor's text always ends them with \n), and how they ended when it was read or saved.
  const eol = useRef<Eol>('lf');
  const baseEol = useRef<Eol>('lf');
  // The editor's undo history and place from when this file was last open, put back as it is made.
  const restore = useRef<EditorSnapshot | undefined>(undefined);
  const changed = () => doc.current !== base.current || eol.current !== baseEol.current;
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

  // `keep`: the file as it was left open (changes not saved, undo history) comes back instead of what is on disk, which
  // is told if it has changed since.
  const load = useCallback(async (keep = false) => {
    setError('');
    try {
      const f = await api<FileData>(`/api/fs/read?path=${encodeURIComponent(path)}`);
      const text = forEditor(f.content ?? '');
      const disk = detectEol(f.content ?? '');
      const kept = keep && !embedded ? getDraft(path) : undefined;
      restore.current = undefined;
      if (kept && f.content != null && (kept.text !== kept.base || kept.eol !== kept.baseEol || (kept.base === text && kept.mtime === f.mtime))) {
        doc.current = kept.text;
        base.current = kept.base;
        eol.current = kept.eol;
        baseEol.current = kept.baseEol;
        // A file touched but not changed since is no conflict.
        mtime.current = kept.base === text ? f.mtime : kept.mtime;
        restore.current = { state: kept.state, scroll: kept.scroll };
        setDirty(changed());
        setChangedOnDisk(kept.base !== text);
      } else {
        doc.current = text;
        base.current = text;
        eol.current = disk;
        baseEol.current = disk;
        mtime.current = f.mtime;
        setDirty(false);
        setChangedOnDisk(false);
      }
      setEolShown(eol.current);
      setFile(f);
      return f;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [path, embedded]);

  useEffect(() => {
    // A dialog editor (CLAUDE.md, a skill) opens straight into editing and leaves the Files tabs alone.
    if (!embedded) useUI.getState().openTab({ id: `f:${path}`, kind: 'file', ref: path });
    setFile(null);
    setMode((isMd || isHtml) && (!embedded || preview) ? 'preview' : 'edit');
    load(true);
  }, [path, load, isMd, isHtml, embedded, preview]);

  // Mount CodeMirror once the text is loaded, and keep it while the file is open here: Preview and Changes show over it,
  // so coming back to the text finds the undo history, the cursor and the scroll as they were. Reading the file again
  // later (a change from elsewhere, a save) keeps it too.
  const editable = !!file && !file.binary && !file.tooLarge && file.content != null;
  const textual = !error && editable && !(office && ext === 'rtf') && !(media && ext === 'svg');
  useEffect(() => {
    if (!textual || !host.current) return;
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
        restore: restore.current,
        onChange: (d) => {
          doc.current = d;
          setDirty(changed());
        },
        onSave: () => saveRef.current(),
        onStatus: setStatus,
        onContextMenu: mobile ? undefined : setCtx,
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
      // Taken down (another file's tab, Back): what it holds is kept, to be put back as it was.
      // (Not what was left out with Don't save: it is not kept.)
      const tabOpen = useUI.getState().tabs.some((t) => t.id === `f:${path}`);
      if (handle && !embedded && tabOpen && (isDirty(path) || !changed())) {
        const snap = handle.snapshot();
        keepDraft(path, { text: doc.current, base: base.current, mtime: mtime.current, eol: eol.current, baseEol: baseEol.current, state: snap.state, scroll: snap.scroll });
      }
      handle?.destroy();
      editor.current = null;
      setStatus(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textual, path]);
  // Back to the text from Preview or Changes: the cursor is in it again.
  useEffect(() => {
    if (mode === 'edit') editor.current?.focus();
  }, [mode]);

  useEffect(() => {
    editor.current?.setWrap(wrap);
    localStorage.setItem(wrapKey, wrap ? '1' : '0');
  }, [wrap, wrapKey]);

  const save = async (force = false): Promise<boolean> => {
    if (!file || saving) return false;
    setSaving(true);
    try {
      const content = doc.current;
      const at = eol.current;
      const r = await put<{ mtime: number; size: number }>('/api/fs/write', { path, content: forDisk(content, at), expectedMtime: force ? undefined : mtime.current });
      mtime.current = r.mtime;
      base.current = content;
      baseEol.current = at;
      setFile((f) => (f ? { ...f, content, mtime: r.mtime, size: r.size } : f));
      setDirty(changed());
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
  // Files page: whether there are changes not saved shows on the file's tab, which asks before it closes, and the file's
  // own saving is there for it to use.
  useEffect(() => {
    if (embedded) return;
    noteDirty(path, dirty);
  }, [path, dirty, embedded]);
  useEffect(() => {
    if (embedded) return;
    const off = registerSaver(path, async () => (dirtyRef.current ? saveRef.current() : true));
    return () => {
      off();
    };
  }, [path, embedded]);
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
          if (f?.content != null) editor.current?.setDoc(forEditor(f.content), { flash: true });
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
  const canEdit = !!file && !embedded && ((media === 'image' && EDITABLE.test(path)) || (media === 'video' && EDITABLE_VIDEO.test(path)) || (media === 'audio' && EDITABLE_SOUND.test(path)));
  const editPicture = () => (media === 'video' ? editVideoFile : media === 'audio' ? editSoundFile : editFile)(path, { label: basename(path), after: (r) => (r.replaced ? void load() : r.path && showInFiles(r.path)) });
  const crumbs = tildify(path, home).split(isWinPath(path) ? /[\\/]/ : '/');
  const text = !!file && !file.binary && !file.tooLarge;
  const togglePreview = () => setMode((m) => (m === 'preview' ? 'edit' : 'preview'));
  const toggleDiff = () => setMode((m) => (m === 'diff' ? 'edit' : 'diff'));
  const download = () => (location.href = `${raw}&download=1`);
  const fromMenu = (f: () => void) => () => {
    setMenu(false);
    f();
  };
  // A new ending for the file's lines (the status bar's LF / CRLF): a change to save, though the text reads the same.
  const toggleEol = () => {
    eol.current = eol.current === 'crlf' ? 'lf' : 'crlf';
    setEolShown(eol.current);
    setDirty(changed());
  };
  // What the editor's right-click menu, and the menu on a desktop, do with the text: with the keys that do them too.
  const withClip = (what: 'Cut' | 'Copy' | 'Paste', ok: boolean) => ok || toast(`${what} is not allowed here: press ${keyLabel(`Ctrl+${what === 'Cut' ? 'X' : what === 'Copy' ? 'C' : 'V'}`)} instead`, 'info');
  const askSelection = () => {
    const sel = editor.current?.selection();
    if (sel && !sel.empty) void askAbout(path, { page: 0, lines: [sel.fromLine, sel.toLine], text: sel.text });
  };
  const textMenu = (): MenuEntry[] => {
    const h = editor.current;
    const none = !h || h.selection().empty;
    return [
      { label: 'Cut', icon: <Scissors size={14} />, keys: 'Ctrl+X', disabled: none, run: () => void h?.cut().then((ok) => withClip('Cut', ok)) },
      { label: 'Copy', icon: <Copy size={14} />, keys: 'Ctrl+C', disabled: none, run: () => void h?.copy().then((ok) => withClip('Copy', ok)) },
      { label: 'Paste', icon: <ClipboardPaste size={14} />, keys: 'Ctrl+V', run: () => void h?.paste().then((ok) => withClip('Paste', ok)) },
      { label: 'Select all', icon: <TextSelect size={14} />, keys: 'Ctrl+A', run: () => h?.selectAll() },
      '-',
      { label: 'Find', icon: <Search size={14} />, keys: 'Ctrl+F', run: () => h?.find() },
      { label: 'Replace', icon: <Replace size={14} />, keys: isApple ? 'Ctrl+Alt+F' : 'Ctrl+H', run: () => h?.replace() },
      { label: 'Go to line', icon: <CornerDownRight size={14} />, keys: isApple ? 'Ctrl+Alt+G' : 'Ctrl+G', run: () => h?.goto() },
      !!saveFirst && '-',
      !!saveFirst && { label: 'Ask about the selection', icon: <Sparkles size={14} />, disabled: none, run: askSelection },
    ];
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
              <IconButton label="Back" onClick={() => void leaveFile(path).then((ok) => ok && history.back())}>
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
              <IconButton label={media === 'video' ? 'Edit the video' : media === 'audio' ? 'Edit the sound' : 'Edit the picture'} onClick={editPicture}>
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
                    <>
                      <MenuItem icon={<Search size={14} />} onClick={fromMenu(() => editor.current?.find())}>
                        Find
                      </MenuItem>
                      <MenuItem icon={<CornerDownRight size={14} />} onClick={fromMenu(() => editor.current?.goto())}>
                        Go to line
                      </MenuItem>
                      {!!saveFirst && (
                        <MenuItem icon={<Sparkles size={14} />} disabled={!editor.current || editor.current.selection().empty} onClick={fromMenu(askSelection)}>
                          Ask about the selection
                        </MenuItem>
                      )}
                    </>
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
          {(fileMenu || text) && (
            <>
              <IconButton ref={deskRef} label="More" size="sm" active={desk} onClick={() => (space.reset(), setDesk((o) => !o))}>
                <Ellipsis size={15} />
              </IconButton>
              <Popover anchor={deskRef} open={desk} onClose={() => setDesk(false)} align="end" width={250}>
                {space.sub || (
                  <>
                    {text && mode === 'edit' && (
                      <>
                        <MenuItem icon={<Search size={14} />} hint={keyLabel('Ctrl+F')} onClick={shut(() => editor.current?.find())}>
                          Find
                        </MenuItem>
                        <MenuItem icon={<Replace size={14} />} hint={keyLabel(isApple ? 'Ctrl+Alt+F' : 'Ctrl+H')} onClick={shut(() => editor.current?.replace())}>
                          Replace
                        </MenuItem>
                        <MenuItem icon={<CornerDownRight size={14} />} hint={keyLabel(isApple ? 'Ctrl+Alt+G' : 'Ctrl+G')} onClick={shut(() => editor.current?.goto())}>
                          Go to line
                        </MenuItem>
                        {!!saveFirst && (
                          <MenuItem icon={<Sparkles size={14} />} disabled={!editor.current || editor.current.selection().empty} onClick={shut(askSelection)}>
                            Ask about the selection
                          </MenuItem>
                        )}
                      </>
                    )}
                    {text && (
                      <MenuItem icon={<Keyboard size={14} />} onClick={shut(() => setKeysOpen(true))}>
                        Keyboard shortcuts
                      </MenuItem>
                    )}
                    {fileMenu && (
                      <>
                        {text && <MenuSep />}
                        {more}
                      </>
                    )}
                  </>
                )}
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
            if (f?.content != null) editor.current?.setDoc(forEditor(f.content));
          }}>
            Reload (discard mine)
          </Button>
          <Button size="sm" variant="danger" onClick={() => save(true)}>
            Overwrite with mine
          </Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {/* The text's editor stays made while Preview or Changes show over it (hidden, so it keeps its undo history, cursor and scroll). */}
        {textual && <div ref={host} className={cx('cm-host absolute inset-0', mode !== 'edit' && 'invisible')} />}
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
              className="relative z-10 h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="relative z-10 flex h-full items-center justify-center bg-bg text-fg-3">
              <Throbber size={34} />
            </div>
          )
        ) : mode === 'preview' ? (
          <div className="relative z-10 h-full overflow-auto bg-bg">
            <div className="mx-auto max-w-[860px] px-5 py-6">
              {mdHtml ? <Markdown text={doc.current} rehypeExtra={mdHtml.MD_HTML} resolveImage={docImages} baseDir={dirname(path)} /> : <Throbber className="text-fg-3" />}
            </div>
          </div>
        ) : mode === 'diff' ? (
          <div className="relative z-10 h-full overflow-auto bg-bg">{diff ? <DiffView diff={diff} /> : <Empty title="No changes">This file matches the last commit (or is not in a git repository).</Empty>}</div>
        ) : null}
      </div>
      {textual && mode === 'edit' && <FileStatus status={status} eol={eolShown} wrap={wrap} onEol={toggleEol} onWrap={() => setWrap((w) => !w)} onGoto={() => editor.current?.goto()} onIndent={(i) => editor.current?.setIndent(i)} />}
      <ContextMenu at={ctx} items={textMenu()} onClose={() => setCtx(null)} />
      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} groups={SHORTCUTS} />
    </div>
  );
}
