// A file opened in the editor of its kind, the one Pages has for it: a Word document in the document editor, a
// spreadsheet (Excel, CSV, TSV) in the spreadsheet editor, a LaTeX file in the LaTeX editor with the files it reads from
// its folder. Save writes the file again in its own format (server/pages/filemodel.ts). What the editor cannot keep of
// a file (a Word file's headers and footers, say) is said above it before anything changes, and asked about the first
// time it is saved over; a Word or Excel file's first save puts the file as it was in the Trash. Changes made to the
// file meanwhile (an agent, a terminal) come in while nothing is changed here, and are asked about otherwise. A LaTeX
// file's comments, which the app keeps beside it, come in as an agent answers them, and are kept when it is saved.
// Its text, or its preview, is in the ⋯ menu, as the file showed before.
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { ArrowLeft, Copy, Download, Ellipsis, Eye, FileCode2, FolderOpen, MessageSquarePlus, RotateCcw, SquareTerminal, TriangleAlert } from 'lucide-react';
import { editorKindOf, type FileOpened, type FileSaved } from '@shared/documents';
import type { PagesEvent } from '@shared/pages';
import { TEX_MAIN } from '@shared/latex';
import type { Workbook } from '@shared/sheets';
import { api, ApiError, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { basename, dirname, isWinPath, tildify } from '../../lib/format';
import { mu } from '../../lib/machine';
import { filePath, go, useFilePeek } from '../../lib/nav';
import { toast, useApp, useUI } from '../../lib/store';
import { Button, cx, IconButton, MenuItem, MenuSep, Popover, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { EDITORS } from '../pages/editors';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { copyPaths, goFolder, itemOf, startSession } from './actions';
import { useSpaceMenu } from './SpaceMenu';
import { useWatchMs } from './FileAsk';

/** What of a Word file the document editor does not keep, in words (the server's keys). */
const DOC_LOST: Record<string, string> = {
  headers: 'headers and footers',
  footnotes: 'footnotes and endnotes',
  comments: 'review comments',
  changes: 'tracked changes',
  equations: 'math equations',
  charts: 'charts and graphs',
  diagrams: 'SmartArt diagrams',
  objects: 'embedded files',
  boxes: 'text boxes',
  columns: 'page columns',
  toc: 'table of contents',
  layout: 'landscape pages',
};

/** And of an Excel file, the spreadsheet editor (merged cells, filters, conditional formatting, data validation, notes, comments and the charts it draws it keeps). */
const SHEET_LOST: Record<string, string> = {
  pictures: 'pictures',
  shapes: 'shapes and text boxes',
  charts: 'charts it cannot draw',
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
};

/** What a CSV or TSV file cannot hold of a workbook: more sheets, formulas (their values go in), formatting. */
function delimitedLosses(b: Workbook): string[] {
  const out: string[] = [];
  if (b.sheets.length > 1) out.push('sheets');
  const cells = Object.values(b.sheets[0]?.cells ?? {});
  if (cells.some((c) => c.f !== undefined)) out.push('formulas');
  if (cells.some((c) => c.s && Object.keys(c.s).some((k) => !['fmt', 'dp', 'cur'].includes(k)))) out.push('formatting');
  return out;
}

const Chips = ({ words }: { words: string[] }) => (
  <>
    {words.map((w) => (
      <span key={w} className="mr-1 inline-block rounded-md bg-bg-2 px-1.5 py-px text-[12px] text-fg">
        {w}
      </span>
    ))}
  </>
);

const Band = ({ tone = 'warn', children }: { tone?: 'warn' | 'quiet'; children: ReactNode }) => (
  <div className={cx('flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-1.5 text-[12.5px]', tone === 'warn' ? 'border-warn/40 bg-warn/10' : 'border-line bg-bg-1 text-fg-3')}>{children}</div>
);

/**
 * `onText`: show the file as before (its text, or its preview), when asked to or when the editor cannot take it.
 * `embedded`: in a dialog (no Back, no terminal). `fileMenu`: the Files page's ⋯ (a session with it, a space, its folder).
 */
export function FileInEditor({
  path,
  embedded,
  onDirty,
  onText,
  fileMenu,
  actions,
  saveFirst,
}: {
  path: string;
  embedded?: boolean;
  onDirty?: (dirty: boolean) => void;
  onText: () => void;
  fileMenu?: boolean;
  /** More buttons, before Download (the Files page's Ask). */
  actions?: ReactNode;
  /** Given a way to save unsaved changes first (true when there were none, or they are saved). */
  saveFirst?: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const home = useApp((s) => s.boot?.home);
  const mobile = useIsMobile();
  const kind = editorKindOf(path)!;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const delimited = ext === 'csv' || ext === 'tsv';
  const office = ext === 'docx' || ext === 'xlsx';
  const [opened, setOpened] = useState<FileOpened | null>(null);
  // Each time the file is read again, the editor starts again from it.
  const [round, setRound] = useState(0);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [changed, setChanged] = useState(false);
  const [menu, setMenu] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const saveNow = useRef<(() => Promise<boolean>) | null>(null);
  if (saveFirst) saveFirst.current = async () => (dirtyRef.current ? ((await saveNow.current?.()) ?? false) : true);
  // The times the file (a LaTeX project's files) had when read or last saved here: a newer one was changed elsewhere.
  const times = useRef<{ mtime: number; files?: Record<string, number> }>({ mtime: 0 });
  // A LaTeX project's comments as the app kept them when last read or saved here (what a save is merged against), and
  // those that came in since from elsewhere, for the editor to take in.
  const comments = useRef<unknown[]>([]);
  const [incoming, setIncoming] = useState<{ list: unknown[]; n: number } | undefined>(undefined);
  const saving = useRef(false);
  // Asked or done once each time it opens: the old file to the Trash, what it loses, what a CSV keeps.
  const once = useRef({ backup: false, losses: false, delimited: false });
  const next = useRef<{ force?: boolean; copy?: boolean }>({});
  const textRef = useRef(onText);
  textRef.current = onText;
  const space = useSpaceMenu(
    () => [itemOf(path, false)],
    () => setMenu(false),
  );
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

  const load = useCallback(async () => {
    try {
      const f = await api<FileOpened>(`/api/pages/file?path=${encodeURIComponent(path)}`);
      times.current = { mtime: f.mtime, files: f.tex?.files };
      comments.current = (f.model as { comments?: unknown[] }).comments ?? [];
      setIncoming(undefined);
      setOpened(f);
      setRound((n) => n + 1);
      setDirty(false);
      setChanged(false);
    } catch (e) {
      // What the editor cannot take (a part of no document, a file it cannot read): shown as before.
      if (e instanceof ApiError && (e.status === 422 || e.status === 413)) toast(e.message);
      textRef.current();
    }
  }, [path]);

  useEffect(() => {
    // A dialog's file leaves the Files tabs alone.
    if (!embedded) useUI.getState().openTab({ id: `f:${path}`, kind: 'file', ref: path });
    setOpened(null);
    once.current = { backup: false, losses: false, delimited: false };
    void load();
  }, [path, embedded, load]);

  // Changes made elsewhere: read again while nothing is changed here, else asked about; every second while an agent works.
  const watchMs = useWatchMs();
  useEffect(() => {
    if (!opened) return;
    const tex = opened.tex;
    const watched = tex
      ? [...new Set([tex.main, tex.open === TEX_MAIN ? tex.main : tex.open])].map((rel) => ({ path: `${tex.folder}/${rel}`, at: () => times.current.files?.[rel] }))
      : [{ path, at: () => times.current.mtime }];
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible' || saving.current) return;
      for (const w of watched) {
        try {
          const st = await api<{ exists: boolean; mtime: number }>(`/api/fs/stat?path=${encodeURIComponent(w.path)}`);
          if (!st.exists || st.mtime === w.at() || saving.current) continue;
          if (dirtyRef.current) setChanged(true);
          else await load();
          return;
        } catch {}
      }
    }, watchMs);
    return () => clearInterval(t);
  }, [opened, path, load, watchMs]);

  // An agent answered, resolved or added comments of the project's files: they come in (the editor merges them with its own).
  useFeatureEvent('pages', ({ data }) => {
    const e = data as PagesEvent | undefined;
    const tex = opened?.tex;
    if (e?.what !== 'file-comments' || !tex) return;
    const slash = (p: string) => p.replace(/\\/g, '/');
    const mine = new Set(Object.keys(times.current.files ?? { [tex.main]: 0 }).map((rel) => slash(`${tex.folder}/${rel}`)));
    if (!e.paths.some((p) => mine.has(slash(p)))) return;
    api<{ comments: unknown[] }>(`/api/pages/file/comments?path=${encodeURIComponent(path)}`).then(
      (r) => {
        comments.current = r.comments;
        setIncoming((i) => ({ list: r.comments, n: (i?.n ?? 0) + 1 }));
      },
      () => {},
    );
  });

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  const lost = (opened?.loses ?? []).map((k) => (kind === 'doc' ? DOC_LOST : SHEET_LOST)[k]).filter(Boolean);

  const save = async (model: unknown): Promise<boolean> => {
    if (!opened) return false;
    const how = next.current;
    next.current = {};
    if (delimited && !once.current.delimited) {
      const gone = delimitedLosses(model as Workbook);
      if (gone.length) {
        const ok = await confirm({
          title: `Save it as ${ext.toUpperCase()}?`,
          body: (
            <div className="space-y-1.5">
              {gone.includes('formulas') && <p>Its formulas are saved as the values they give.</p>}
              {gone.includes('sheets') && <p>{`Only the first sheet is saved: a ${ext.toUpperCase()} file holds one.`}</p>}
              {gone.includes('formatting') && <p>Bold, colours and other formatting are not kept.</p>}
            </div>
          ),
          confirm: 'Save',
        });
        if (!ok) return false;
        once.current.delimited = true;
      }
    }
    if (lost.length && !how.copy && !once.current.losses) {
      const ok = await confirm({
        title: `Replace ${basename(path)}?`,
        body: (
          <div className="space-y-2">
            <p>
              <span className="mr-1">Saving replaces the file without what this editor does not keep:</span>
              <Chips words={lost} />
            </p>
            <p>The file as it is now goes to the Trash first. To leave it as it is, cancel and use Save as a copy.</p>
          </div>
        ),
        confirm: 'Replace it',
        danger: true,
      });
      if (!ok) return false;
      once.current.losses = true;
    }
    saving.current = true;
    try {
      const r = await put<FileSaved>('/api/pages/file', {
        path,
        model,
        mtime: times.current.mtime,
        force: how.force,
        copy: how.copy,
        backup: office && !how.copy && !once.current.backup,
        tex: opened.tex && { ...opened.tex, files: times.current.files, comments: comments.current },
      });
      // Another file to show: a copy, or the document a chapter renamed here belonged to.
      const show = (p: string) => (embedded ? useFilePeek.setState({ file: { path: p } }) : go(filePath(p)));
      if (how.copy) {
        // The copy opens in its place; this file stays as it was.
        toast(`Saved as ${basename(r.path)}`, 'ok');
        show(r.path);
        return true;
      }
      times.current = { mtime: r.mtime, files: r.files ?? times.current.files };
      if (r.comments) {
        // Kept merged with what an agent did meanwhile: the editor takes that in once it has the save in hand.
        const merged = r.comments;
        const differs = JSON.stringify(merged) !== JSON.stringify((model as { comments?: unknown[] }).comments ?? []);
        comments.current = merged;
        if (differs) setTimeout(() => setIncoming((i) => ({ list: merged, n: (i?.n ?? 0) + 1 })));
      }
      setChanged(false);
      if (r.backup) once.current.backup = true;
      toast(r.backup ? `Saved ${basename(path)}. The file as it was is in the Trash, should you want it back.` : `Saved ${basename(path)}`, 'ok');
      if (r.path !== path) show(r.path);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setChanged(true);
        if (opened.tex) toast(e.message);
        return false;
      }
      throw e;
    } finally {
      saving.current = false;
    }
  };

  /** Saves the editor's changes in a way of its own: over what changed on disk, or as a copy beside the file. */
  const saveAs = (how: { force?: boolean; copy?: boolean }) => {
    next.current = how;
    void saveNow.current?.();
  };

  const asText = async () => {
    setMenu(false);
    if (dirty && !(await confirm({ title: 'Discard your changes?', body: 'The file shows as it was saved.', confirm: 'Discard', danger: true }))) return;
    onDirty?.(false);
    onText();
  };
  const pick = (f: () => void) => () => {
    setMenu(false);
    f();
  };
  const download = () => (location.href = `${mu(`/api/fs/raw?path=${encodeURIComponent(path)}`)}&download=1`);
  const textLabel = kind === 'tex' || delimited ? 'Edit as text' : 'Show as a preview';
  const textIcon = kind === 'tex' || delimited ? <FileCode2 size={14} /> : <Eye size={14} />;
  const unsaved = dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" title="Unsaved changes" />;
  const crumbs = tildify(path, home).split(isWinPath(path) ? /[\\/]/ : '/');

  const lead = mobile ? (
    <>
      {!embedded && (
        <IconButton label="Back" onClick={() => history.back()}>
          <ArrowLeft size={18} />
        </IconButton>
      )}
      <div className="ml-1 min-w-0 flex-1" title={path}>
        {/* A dialog has the name in its title already. */}
        {!embedded && (
          <div className="flex items-center gap-1.5">
            <span translate="no" className="truncate text-[15px] font-semibold tracking-tight">
              {basename(path)}
            </span>
            {unsaved}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {/* Cut at its start: the folders nearest the file say the most. */}
          <span dir="rtl" translate="no" className="min-w-0 truncate text-left font-mono text-[11.5px] text-fg-3">
            <span dir="ltr">{tildify(dirname(path), home)}</span>
          </span>
          {embedded && unsaved}
        </div>
      </div>
    </>
  ) : (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden pl-1 font-mono text-[12px] text-fg-3" title={path} translate="no">
      {crumbs.map((c, i) => (
        <span key={i} className={cx('truncate', i === crumbs.length - 1 ? 'shrink-0 text-fg' : 'min-w-0 shrink')}>
          {i > 0 && <span className="px-0.5 opacity-50">/</span>}
          {c}
        </span>
      ))}
      {dirty && <span className="ml-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" title="Unsaved changes" />}
    </div>
  );

  const tail = (
    <>
      {actions}
      {!mobile && (
        <IconButton label="Download" onClick={download}>
          <Download size={16} />
        </IconButton>
      )}
      <IconButton ref={moreRef} label="More" active={menu} onClick={() => (space.reset(), setMenu((m) => !m))}>
        <Ellipsis size={16} />
      </IconButton>
      <Popover anchor={moreRef} open={menu} onClose={() => setMenu(false)} align="end" width={260}>
        {space.sub || (
          <>
            <MenuItem icon={textIcon} onClick={() => void asText()}>
              {textLabel}
            </MenuItem>
            {mobile && (
              <MenuItem icon={<Download size={14} />} onClick={pick(download)}>
                Download
              </MenuItem>
            )}
            {!embedded && (
              <MenuItem icon={<SquareTerminal size={14} />} onClick={pick(() => openTerminalAt(dirname(path)))}>
                Terminal in this folder
              </MenuItem>
            )}
            {fileMenu && (
              <>
                <MenuSep />
                <MenuItem icon={<MessageSquarePlus size={14} />} onClick={pick(() => startSession([itemOf(path, false)]))}>
                  Start a session with it
                </MenuItem>
                {space.entry}
                <MenuItem icon={<FolderOpen size={14} />} onClick={pick(() => goFolder(dirname(path), path))}>
                  Show in its folder
                </MenuItem>
                <MenuItem icon={<Copy size={14} />} onClick={pick(() => copyPaths([itemOf(path)]))}>
                  Copy path
                </MenuItem>
              </>
            )}
          </>
        )}
      </Popover>
    </>
  );

  const band = opened && (
    <>
      {changed && (
        <Band>
          <span className="min-w-0 flex-1">The file changed on disk since you opened it.</span>
          <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => void load()}>
            Reload (discard mine)
          </Button>
          <Button size="sm" variant="danger" onClick={() => saveAs({ force: true })}>
            Overwrite with mine
          </Button>
        </Band>
      )}
      {opened.cut ? (
        <Band>
          <TriangleAlert size={14} className="shrink-0 text-warn" />
          <span className="min-w-0 flex-1">It is too long for the editor: it shows the start of the file, to read only.</span>
          <Button size="sm" variant="ghost" icon={textIcon} onClick={() => void asText()}>
            {textLabel}
          </Button>
        </Band>
      ) : (
        lost.length > 0 && (
          <Band>
            <TriangleAlert size={14} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1 leading-relaxed">
              <span className="mr-1">Saving replaces the file without what this editor does not keep:</span>
              <Chips words={lost} />
            </span>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => saveAs({ copy: true })}>
                Save as a copy
              </Button>
            )}
          </Band>
        )
      )}
      {opened.kind === 'tex' &&
        opened.notes.map((n) => (
          <Band key={n} tone="quiet">
            {n}
          </Band>
        ))}
    </>
  );

  const Editor = EDITORS[kind];
  return (
    <div className={cx('flex h-full min-h-0 flex-col', mobile && !embedded && 'pt-[var(--safe-top)]')}>
      {opened && Editor ? (
        <Editor
          key={`${path}:${round}`}
          doc={{ key: `${path}:${round}`, title: basename(path), model: opened.model }}
          pageId=""
          layout={mobile ? 'sheet' : 'page'}
          readOnly={!!opened.cut}
          onSave={save}
          lead={lead}
          tail={tail}
          band={band}
          onDirty={setDirty}
          saveNowRef={saveNow}
          file={opened.tex && { folder: opened.tex.inFolder ? opened.tex.folder : undefined, main: opened.tex.main, open: opened.tex.open, comments: incoming, dir: opened.tex.folder, uses: opened.tex.uses }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-fg-3">
          <Throbber size={34} />
        </div>
      )}
      {space.dialog}
      {confirmNode}
    </div>
  );
}
