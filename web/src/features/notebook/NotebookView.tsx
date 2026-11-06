// A Jupyter notebook: its cells and outputs, edited here and run in a kernel on this machine.
// Code shows highlighted until clicked, then a cell editor takes over; keys follow Jupyter's
// (Shift+Enter runs and moves on; outside an editor, A/B add cells, DD deletes, M/Y switch type).
// A file of this computer opens here from Files; a notebook of the Library opens here too (`library`), kept as
// versions by the Library and run in a folder of its own.
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { ArrowLeft, Braces, Check, ChevronDown, ChevronUp, Download, Eraser, FastForward, MoreHorizontal, Pencil, Play, Plus, Power, RotateCw, Save, Sparkles, Square, Trash2 } from 'lucide-react';
import type { KernelEnv, KernelInfo, KernelStatus } from '@shared/types';
import { api, ApiError, enc, put } from '../../lib/api';
import type { CellEditorHandle } from '../../lib/codemirror';
import { ago, basename, bytes, dirname, duration, isWinPath, tildify } from '../../lib/format';
import { highlight } from '../../lib/highlight';
import { toast, toastError, useApp } from '../../lib/store';
import { Markdown } from '../../components/Markdown';
import { localImages, MD_HTML } from '../../components/markdownHtml';
import { Button, cx, Throbber, Empty, IconButton, MenuItem, MenuLabel, MenuSep, Popover, useConfirm, useIsMobile } from '../../components/ui';
import { fromCodePoints, kernelApi, toCodePoints, useKernel } from './kernel';
import { initialDoc, isDirty, newCell, parseNotebook, reduce, serializeNotebook, type Cell, type CellRunView, type CellType } from './model';
import { Outputs } from './Outputs';
import { mu } from '../../lib/machine';
import { tr } from '../../i18n/runtime';

// Markdown cells may carry HTML (centred titles, sized images); it is kept, minus anything that runs.
const MD_PLUGINS = MD_HTML;

type Caret = number | 'start' | 'end';

/** What an agent asked from the Library is about ("In cell 3 (code): "). */
export interface NotebookScope {
  id: string;
  label: string;
  lead: string;
}

/** A notebook of the Library: its kept version, how it saves, and the Library's own parts of its bar. */
export interface LibraryNotebook {
  /** The notebook as kept; `key` changes with each version. */
  doc: { key: string; model: unknown } | null;
  /** When the version shown was saved: a kernel's runs that ended after it bring their outputs. */
  savedAt: number;
  /** An older version on view: nothing changes, nothing runs. */
  readOnly?: boolean;
  onSave?: (model: unknown) => Promise<boolean>;
  /** Writes the notebook where its kernel runs, before a kernel starts. */
  prepare: () => Promise<void>;
  lead?: ReactNode;
  tail?: ReactNode;
  band?: ReactNode;
  savedNote?: string;
  onAsk?: (text: string) => void;
  onScopes?: (scopes: NotebookScope[]) => void;
  saveNowRef?: MutableRefObject<(() => Promise<boolean>) | null>;
}

/** The words that start a request about a cell, and its name on the Ask panel's chip. */
function cellScope(c: Cell, i: number): NotebookScope {
  const kind = c.type === 'markdown' ? 'text' : c.type;
  return { id: 'cell', label: tr(`Cell ${i + 1}`), lead: `In cell ${i + 1} (${kind}, id ${c.id}): ` };
}

interface FileData {
  size: number;
  mtime: number;
  binary: boolean;
  tooLarge: boolean;
  content: string | null;
}

interface CellActions {
  /** `keepFocus`: the click landed in a field (an input() answer), which keeps the keyboard. */
  select: (id: string, keepFocus?: boolean) => void;
  startEdit: (id: string, at: Caret) => void;
  edit: (id: string, source: string) => void;
  run: (id: string, how: 'stay' | 'next' | 'insert') => void;
  escape: (id: string) => void;
  edge: (id: string, dir: -1 | 1) => boolean;
  insert: (at: number, type: CellType, edit?: boolean) => void;
  remove: (id: string) => void;
  move: (id: string, by: -1 | 1) => void;
  retype: (id: string, to: CellType) => void;
  input: (id: string, value: string) => void;
  interrupt: () => void;
  save: () => void;
}

type Complete = (code: string, pos: number) => Promise<{ from: number; to: number; options: string[] } | null>;

function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** The text offset under a click in highlighted code, so the editor opens with the cursor there. */
function offsetAt(x: number, y: number, root: HTMLElement): number | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | null = null;
  let off = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) {
    node = pos.offsetNode;
    off = pos.offset;
  } else {
    const range = document.caretRangeFromPoint?.(x, y);
    if (!range) return null;
    node = range.startContainer;
    off = range.startOffset;
  }
  if (!node || !root.contains(node) || node.nodeType !== Node.TEXT_NODE) return null;
  let total = 0;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (t === node) return total + off;
    total += t.textContent?.length ?? 0;
  }
  return null;
}

/** Image sources in a markdown cell: its attachments, files next to the notebook; other sites' images become links. */
const StaticCode = memo(function StaticCode({ code, lang, onPick }: { code: string; lang: string; onPick: (at: number | null) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    highlight(code, lang)
      .then((h) => alive && setHtml(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code, lang]);
  return (
    <div
      ref={ref}
      className="nb-code cursor-text"
      onMouseUp={(e) => {
        if (e.button !== 0 || window.getSelection()?.toString()) return; // selecting text to copy
        onPick(ref.current ? offsetAt(e.clientX, e.clientY, ref.current) : null);
      }}
    >
      {html && code ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <pre>{code || ' '}</pre>}
    </div>
  );
});

function CellEditor({ cell, lang, dark, caret, actions, complete }: { cell: Cell; lang: string; dark: boolean; caret: Caret | null; actions: CellActions; complete?: Complete }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<CellEditorHandle | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    import('../../lib/codemirror').then(async ({ createCellEditor }) => {
      if (!alive || !host.current) return;
      const h = await createCellEditor(host.current, {
        doc: cell.source,
        lang,
        dark,
        onChange: (src) => actions.edit(cell.id, src),
        onRun: (how) => actions.run(cell.id, how),
        onEscape: () => actions.escape(cell.id),
        onSave: () => actions.save(),
        onEdge: (dir) => actions.edge(cell.id, dir),
        complete,
      });
      if (!alive) return h.destroy();
      handle.current = h;
      setReady(true);
      h.focus(caret ?? 'end');
    });
    return () => {
      alive = false;
      handle.current?.destroy();
      handle.current = null;
    };
    // The editor owns the text while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => handle.current?.setDark(dark), [dark]);
  return (
    <div className="relative">
      {!ready && (
        <div className="nb-code">
          <pre>{cell.source || ' '}</pre>
        </div>
      )}
      <div ref={host} className={cx(!ready && 'absolute inset-0 opacity-0')} />
    </div>
  );
}

function useTicker(on: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

function RunTime({ run }: { run?: CellRunView }) {
  const running = run?.state === 'running';
  useTicker(running);
  if (!run?.startedAt) return null;
  const ms = (run.endedAt ?? Date.now()) - run.startedAt;
  if (!running && ms < 1000) return null;
  return <div className={cx('tnum text-[10.5px]', run.state === 'error' ? 'text-err' : 'text-fg-3')}>{duration(ms)}</div>;
}

const TYPE_LABEL: Record<CellType, string> = { code: 'Code', markdown: 'Text', raw: 'Raw' };

interface CellProps {
  cell: Cell;
  index: number;
  last: boolean;
  active: boolean;
  editing: boolean;
  caret: Caret | null;
  lang: string;
  dark: boolean;
  dir: string;
  mobile: boolean;
  actions: CellActions;
  complete: Complete;
  /** An older version, or a notebook that cannot change: no tools, no runs. */
  readOnly?: boolean;
  onAsk?: (id: string) => void;
}

const CellView = memo(function CellView({ cell, index, last, active, editing, caret, lang, dark, dir, mobile, actions, complete, readOnly, onAsk }: CellProps) {
  const code = cell.type === 'code';
  const run = cell.run;
  const busy = run?.state === 'queued' || run?.state === 'running';
  const resolveImage = useMemo(() => (cell.type === 'markdown' ? localImages(dir, cell.raw.attachments) : undefined), [dir, cell.type, cell.raw.attachments]);
  const box = cx('overflow-hidden rounded-lg border bg-code-bg transition-colors', editing ? 'border-accent/50' : 'border-line');

  let body;
  if (editing) {
    body = (
      <div className={box}>
        <CellEditor cell={cell} lang={cell.type === 'markdown' ? 'markdown' : cell.type === 'raw' ? 'text' : lang} dark={dark} caret={caret} actions={actions} complete={code ? complete : undefined} />
      </div>
    );
  } else if (cell.type === 'markdown') {
    body = (
      <div onDoubleClick={() => readOnly || actions.startEdit(cell.id, 'end')} className="nb-md min-h-7 px-3 py-0.5">
        {cell.source.trim() ? (
          <Markdown text={cell.source} notebook resolveImage={resolveImage} rehypeExtra={MD_PLUGINS} />
        ) : (
          <span className="text-[13px] text-fg-3 italic">{readOnly ? 'Empty text cell.' : 'Empty text cell. Double-click to write.'}</span>
        )}
      </div>
    );
  } else {
    body = (
      <div className={box}>
        <StaticCode code={cell.source} lang={code ? lang : 'text'} onPick={(at) => readOnly || actions.startEdit(cell.id, at ?? 'end')} />
      </div>
    );
  }

  return (
    <div
      data-cell={cell.id}
      onMouseDown={(e) => actions.select(cell.id, !!(e.target as HTMLElement).closest('input, textarea, select'))}
      className={cx('group/cell relative flex gap-1 rounded-xl py-1.5 pr-2 sm:gap-1.5', active && 'bg-bg-1', active && mobile && 'mt-9')}
    >
      <span className={cx('absolute top-2 bottom-2 left-0 w-[3px] rounded-full transition-colors', active ? (editing ? 'bg-accent' : 'bg-fg-3/50') : 'bg-transparent')} />
      <div className="flex w-10 shrink-0 flex-col items-end pt-1.5 font-mono text-[11px] leading-5 text-fg-3 select-none sm:w-14">
        {code && (
          <>
            <span className="relative flex h-6 items-center">
              <span className={cx('tnum transition-opacity', busy && 'animate-pulse text-busy', !mobile && 'group-hover/cell:opacity-0', active && !mobile && 'opacity-0')}>
                [{busy ? '*' : (cell.count ?? ' ')}]
              </span>
              {!mobile && !readOnly && (
                <button
                  type="button"
                  title={busy ? 'Interrupt the kernel' : 'Run (Ctrl+Enter)'}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => (busy ? actions.interrupt() : actions.run(cell.id, 'stay'))}
                  className={cx(
                    'absolute right-0 flex h-6 w-6 items-center justify-center rounded-md text-fg-2 transition-opacity hover:bg-bg-3 hover:text-fg',
                    active ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100',
                  )}
                >
                  {busy ? <Square size={11} /> : <Play size={13} />}
                </button>
              )}
            </span>
            <RunTime run={run} />
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {body}
        {code && <Outputs outputs={cell.outputs} run={run} onInput={(v) => actions.input(cell.id, v)} />}
      </div>
      {!readOnly && (
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          'z-10 items-center gap-0.5 rounded-lg border border-line bg-elevated p-0.5 shadow-sm',
          // Phones put the tools in a row above the cell, where they cover no code.
          mobile ? 'absolute -top-8 right-2' : 'absolute -top-2.5 right-2',
          active ? 'flex' : mobile ? 'hidden' : 'hidden group-hover/cell:flex',
        )}
      >
        {mobile && code && (
          <IconButton label={busy ? 'Interrupt' : 'Run'} size="sm" onClick={() => (busy ? actions.interrupt() : actions.run(cell.id, 'stay'))}>
            {busy ? <Square size={11} /> : <Play size={13} />}
          </IconButton>
        )}
        {cell.type === 'markdown' && !editing && (
          <IconButton label="Edit" size="sm" onClick={() => actions.startEdit(cell.id, 'end')}>
            <Pencil size={13} />
          </IconButton>
        )}
        <select
          value={cell.type}
          title="Cell type"
          onChange={(e) => actions.retype(cell.id, e.target.value as CellType)}
          className="h-7 rounded-md bg-transparent px-1 text-[12px] text-fg-2 outline-none hover:bg-bg-2"
        >
          {(['code', 'markdown', 'raw'] as const).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <IconButton label="Move up" size="sm" disabled={index === 0} onClick={() => actions.move(cell.id, -1)}>
          <ChevronUp size={14} />
        </IconButton>
        <IconButton label="Move down" size="sm" disabled={last} onClick={() => actions.move(cell.id, 1)}>
          <ChevronDown size={14} />
        </IconButton>
        <IconButton label="Add a cell below" size="sm" onClick={() => actions.insert(index + 1, 'code', true)}>
          <Plus size={14} />
        </IconButton>
        <IconButton label="Delete the cell" size="sm" onClick={() => actions.remove(cell.id)}>
          <Trash2 size={13} />
        </IconButton>
        {onAsk && (
          <IconButton label="Ask an agent about this cell" size="sm" onClick={() => onAsk(cell.id)}>
            <Sparkles size={13} className="text-accent" />
          </IconButton>
        )}
      </div>
      )}
    </div>
  );
});

/** A thin strip between cells that offers new cells on hover. */
function InsertZone({ at, actions }: { at: number; actions: CellActions }) {
  return (
    <div className="group/add relative flex h-3 items-center justify-center">
      <div className="absolute inset-x-14 top-1/2 h-px transition-colors group-hover/add:bg-line-2" />
      <div className="relative z-10 hidden gap-1 group-hover/add:flex">
        {(['code', 'markdown'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => actions.insert(at, t, true)}
            className="flex h-5.5 items-center gap-1 rounded-md border border-line bg-elevated px-2 text-[11.5px] text-fg-2 shadow-sm hover:text-fg"
          >
            <Plus size={11} />
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<KernelStatus, string> = { starting: 'Starting', idle: 'Idle', busy: 'Running', restarting: 'Restarting', dead: 'Stopped' };

function dotClass(s: KernelStatus | undefined) {
  if (s === 'idle') return 'bg-ok';
  if (s === 'busy') return 'bg-busy animate-pulse';
  if (s === 'starting' || s === 'restarting') return 'bg-warn animate-pulse';
  if (s === 'dead') return 'bg-err';
  return 'bg-fg-3/50';
}

function KernelPicker({
  path,
  kernel,
  starting,
  open,
  setOpen,
  onPick,
  onInterrupt,
  onRestart,
  onShutdown,
}: {
  path: string;
  kernel: KernelInfo | null;
  starting: boolean;
  open: boolean;
  setOpen: (o: boolean) => void;
  onPick: (env: string) => void;
  onInterrupt: () => void;
  onRestart: () => void;
  onShutdown: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<{ envs: KernelEnv[]; suggested?: string } | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();
  useEffect(() => {
    if (open)
      kernelApi
        .envs(path)
        .then(setData)
        .catch((e) => {
          toastError(e);
          setData({ envs: [] });
        });
  }, [open, path]);
  const status = starting ? 'starting' : kernel?.status;
  const close = useCallback(() => setOpen(false), [setOpen]);

  const install = async (e: KernelEnv) => {
    const ok = await confirm({
      title: `Install ipykernel in ${e.name}?`,
      body: (
        <>
          Runs <span className="font-mono text-[13px]">pip install ipykernel</span> in <span className="font-mono text-[13px]">{e.detail}</span> so notebooks can run there. Nothing else in it changes.
        </>
      ),
      confirm: 'Install',
    });
    if (!ok) return;
    setInstalling(e.id);
    try {
      const r = await kernelApi.install(e.id, path);
      if (!r.ok) throw new Error(r.output.split('\n').filter(Boolean).pop() || 'The install failed');
      toast(`Installed ipykernel in ${e.name}`, 'ok');
      setData(await kernelApi.envs(path));
      onPick(e.id);
    } catch (err) {
      toastError(err);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(!open)}
        title="Kernel: where this notebook's code runs"
        className={cx(
          'inline-flex h-7.5 max-w-[8rem] min-w-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg sm:max-w-[15rem]',
          open && 'bg-bg-2 text-fg',
        )}
      >
        <span className={cx('h-2 w-2 shrink-0 rounded-full', dotClass(status))} />
        <span className="truncate">{starting ? 'Starting…' : kernel ? kernel.envName : 'No kernel'}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={360}>
        {kernel && (
          <>
            <div className="px-2.5 pt-2 pb-1.5">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', dotClass(kernel.status))} />
                <span className="truncate">{kernel.envName}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-fg-3">
                {STATUS_TEXT[kernel.status]} · started {ago(kernel.startedAt)} · pid {kernel.pid}
              </div>
              {kernel.error && <div className="mt-1 text-[11.5px] break-words text-err">{kernel.error}</div>}
            </div>
            <MenuItem icon={<Square size={12} />} disabled={kernel.status !== 'busy'} onClick={() => (close(), onInterrupt())}>
              Interrupt
            </MenuItem>
            <MenuItem icon={<RotateCw size={14} />} onClick={() => (close(), onRestart())}>
              Restart
            </MenuItem>
            <MenuItem icon={<Power size={14} />} danger onClick={() => (close(), onShutdown())}>
              Shut down
            </MenuItem>
            <MenuSep />
          </>
        )}
        <MenuLabel>Run this notebook with</MenuLabel>
        {!data ? (
          <div className="flex justify-center py-4 text-fg-3">
            <Throbber />
          </div>
        ) : !data.envs.length ? (
          <div className="px-2.5 py-2 text-[12.5px] text-fg-3">No Python environments were found.</div>
        ) : (
          data.envs.map((e) => {
            const current = kernel?.env === e.id;
            return (
              <div
                key={e.id}
                onClick={() => e.ready && !current && (close(), onPick(e.id))}
                title={e.detail}
                className={cx('flex items-center gap-2 rounded-lg px-2.5 py-1.5', e.ready && !current && 'cursor-pointer hover:bg-bg-2', current && 'bg-bg-2')}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className={cx('truncate text-[13px]', e.ready ? 'text-fg' : 'text-fg-2')}>{e.name}</span>
                    {e.version && <span className="shrink-0 text-[11px] text-fg-3">{e.version}</span>}
                    {data.suggested === e.id && !kernel && <span className="shrink-0 text-[11px] text-accent">suggested</span>}
                  </div>
                  <div className="truncate text-[11.5px] text-fg-3">
                    {e.detail}
                    {!e.ready && (e.kind === 'spec' ? ' · cannot start' : ' · needs ipykernel')}
                  </div>
                </div>
                {current ? (
                  <Check size={14} className="shrink-0" strokeWidth={2.5} />
                ) : (
                  !e.ready &&
                  e.kind !== 'spec' &&
                  (installing === e.id ? (
                    <Throbber className="px-2 text-fg-3" />
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!installing}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        install(e);
                      }}
                    >
                      Install
                    </Button>
                  ))
                )}
              </div>
            );
          })
        )}
        <div className="px-2.5 pt-1.5 pb-2 text-[11px] leading-snug text-fg-3">Kernels keep running after the notebook is closed. Shut one down here or under System.</div>
      </Popover>
      {confirmNode}
    </>
  );
}

/**
 * `embedded`: in a dialog over another page, so there is no Back button (the dialog closes instead); `onDirty` tells it of
 * unsaved changes. From Files, `fileActions` end its bar (Ask an agent about the file) and `saveFirst` saves before an
 * agent is asked. `library`: a notebook of the Library rather than a file (`path` is then the file its kernel runs from).
 */
export default function NotebookView({
  path,
  onSource,
  embedded,
  onDirty,
  fileActions,
  saveFirst,
  library,
}: {
  path: string;
  onSource?: () => void;
  embedded?: boolean;
  onDirty?: (dirty: boolean) => void;
  fileActions?: ReactNode;
  saveFirst?: MutableRefObject<(() => Promise<boolean>) | null>;
  library?: LibraryNotebook;
}) {
  const home = useApp((s) => s.boot?.home);
  const mobile = useIsMobile();
  const dark = useDark();
  const [doc, dispatch] = useReducer(reduce, initialDoc);
  const [error, setError] = useState('');
  const [loads, setLoads] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [caret, setCaret] = useState<Caret | null>(null);
  const [saving, setSaving] = useState(false);
  const [changedOnDisk, setChangedOnDisk] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mtime = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  // The latest text of each cell, ahead of the render it causes, so a run right after typing sends it.
  const latest = useRef(new Map<string, string>());
  const lastKey = useRef({ key: '', at: 0 });
  const removed = useRef<{ cell: Cell; at: number } | null>(null);
  const savingRef = useRef(false);
  const [confirm, confirmNode] = useConfirm();
  const readOnly = !!library?.readOnly;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const lib = useRef(library);
  lib.current = library;
  // Runs that ended after the notebook was saved bring their outputs: after the file changed, or after the Library's
  // version was saved (when the page opened) or shown (a newer version since, already with what ran before it).
  const reloadedAt = useRef(0);
  const since = () => (lib.current ? Math.max(lib.current.savedAt, reloadedAt.current) : mtime.current);
  const { kernel, setKernel } = useKernel(path, dispatch, since);
  const dirty = isDirty(doc);
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  const dir = dirname(path);
  const nb = doc.nb;
  const lang = String(nb?.metadata.language_info?.name ?? nb?.metadata.kernelspec?.language ?? kernel?.language ?? 'python');

  const S = useRef({ doc, active, editing, kernel });
  S.current = { doc, active, editing, kernel };

  /** The Library's kept version, as the notebook to show. */
  const loadModel = useCallback((model: unknown) => {
    try {
      const parsed = parseNotebook(JSON.stringify(model ?? {}));
      latest.current.clear();
      dispatch({ type: 'load', nb: parsed });
      setError('');
      setLoads((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const load = useCallback(async () => {
    if (lib.current) {
      if (lib.current.doc) loadModel(lib.current.doc.model);
      return;
    }
    try {
      const f = await api<FileData>(`/api/fs/read?path=${enc(path)}`);
      if (f.tooLarge) throw new Error(`This notebook is too large to open here (${bytes(f.size)})`);
      if (f.binary || f.content == null) throw new Error('This file is not a notebook');
      const parsed = parseNotebook(f.content);
      mtime.current = f.mtime;
      latest.current.clear();
      dispatch({ type: 'load', nb: parsed });
      setError('');
      setChangedOnDisk(false);
      setLoads((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path, loadModel]);

  useEffect(() => {
    setActive(null);
    setEditing(null);
    load();
  }, [load]);

  // Another version of the Library's notebook (an agent's, or this page's own save): shown, unless changes here are unsaved.
  const docKey = library?.doc?.key;
  const firstKey = useRef(docKey);
  useEffect(() => {
    if (!lib.current?.doc || docKey === firstKey.current) return;
    firstKey.current = undefined;
    if (isDirty(S.current.doc)) return;
    reloadedAt.current = Date.now();
    loadModel(lib.current.doc.model);
  }, [docKey, loadModel]);

  // Outputs of runs the page missed (it was closed, or the file was just reloaded).
  useEffect(() => {
    const id = kernel?.id;
    if (!id || !loads) return;
    kernelApi
      .snapshot(id)
      .then((s) => dispatch({ type: 'kernel', op: { op: 'snapshot', ...s }, since: since() }))
      .catch(() => {});
  }, [kernel?.id, loads]);

  const save = useCallback(
    async (force = false): Promise<boolean> => {
      const d = S.current.doc;
      const l = lib.current;
      if (!d.nb || savingRef.current || readOnlyRef.current || (l && !l.onSave)) return false;
      savingRef.current = true;
      setSaving(true);
      try {
        if (l) {
          // The Library keeps it as a new version; its page then shows that version.
          if (!(await l.onSave!(JSON.parse(serializeNotebook(d.nb))))) return false;
          dispatch({ type: 'saved', cells: d.nb.cells });
          return true;
        }
        const r = await put<{ mtime: number }>('/api/fs/write', { path, content: serializeNotebook(d.nb), expectedMtime: force ? undefined : mtime.current });
        mtime.current = r.mtime;
        dispatch({ type: 'saved', cells: d.nb.cells });
        setChangedOnDisk(false);
        toast(`Saved ${basename(path)}`, 'ok');
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setChangedOnDisk(true);
        else toastError(e);
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [path],
  );
  // Saved before an agent is asked about it (Files' Ask, the Library's Ask), so it works on what is shown.
  const saveNow = useCallback(() => (isDirty(S.current.doc) ? save() : Promise.resolve(true)), [save]);
  if (saveFirst) saveFirst.current = saveNow;
  if (library?.saveNowRef) library.saveNowRef.current = saveNow;
  const discard = () => lib.current?.doc && loadModel(lib.current.doc.model);
  const saveRef = useRef(save);
  saveRef.current = save;

  // Edits by agents or terminals: reload when nothing here is unsaved, otherwise ask. (The Library's pages hear of new versions.)
  useEffect(() => {
    if (lib.current) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible' || savingRef.current) return;
      try {
        const st = await api<{ exists: boolean; mtime: number }>(`/api/fs/stat?path=${enc(path)}`);
        if (!st.exists || st.mtime === mtime.current) return;
        if (isDirty(S.current.doc)) setChangedOnDisk(true);
        else load();
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [path, load]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (isDirty(S.current.doc)) e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('beforeunload', before);
    window.addEventListener('keydown', keys, true);
    return () => {
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('keydown', keys, true);
    };
  }, []);

  const focusList = () => list.current?.focus({ preventScroll: true });
  const reveal = (id: string) => requestAnimationFrame(() => document.querySelector(`[data-cell="${id}"]`)?.scrollIntoView({ block: 'nearest' }));

  const startKernel = useCallback(
    async (env?: string): Promise<KernelInfo | null> => {
      setStarting(true);
      try {
        if (lib.current) await lib.current.prepare();
        const k = await kernelApi.start(path, env);
        setKernel(k);
        return k;
      } catch (e) {
        toastError(e);
        setPickerOpen(true);
        return null;
      } finally {
        setStarting(false);
      }
    },
    [path, setKernel],
  );

  const runCells = useCallback(
    async (ids: string[]) => {
      const cells = (S.current.doc.nb?.cells ?? []).filter((c) => ids.includes(c.id) && c.type === 'code').map((c) => ({ id: c.id, code: latest.current.get(c.id) ?? c.source }));
      const empty = cells.filter((c) => !c.code.trim()).map((c) => c.id);
      if (empty.length) dispatch({ type: 'clear', ids: empty });
      const todo = cells.filter((c) => c.code.trim());
      if (!todo.length) return;
      const sent = todo.map((c) => c.id);
      dispatch({ type: 'sent', ids: sent });
      let k = S.current.kernel;
      if (!k || k.status === 'dead') k = await startKernel(k?.env);
      else if (k.status === 'starting' || k.status === 'restarting') k = null;
      if (!k) return dispatch({ type: 'unsent', ids: sent });
      try {
        await kernelApi.execute(
          k.id,
          todo.map((c) => ({ cellId: c.id, code: c.code })),
        );
      } catch (e) {
        toastError(e);
        dispatch({ type: 'unsent', ids: sent });
      }
    },
    [startKernel],
  );

  const interrupt = useCallback(() => {
    const k = S.current.kernel;
    if (k) kernelApi.interrupt(k.id).catch(toastError);
  }, []);

  const restart = useCallback(
    async (thenRunAll = false) => {
      const k = S.current.kernel;
      if (!k) return;
      const ok = await confirm({
        title: thenRunAll ? 'Restart and run all?' : 'Restart the kernel?',
        body: 'Its variables and imports are lost; the outputs stay.',
        confirm: 'Restart',
      });
      if (!ok) return;
      try {
        setKernel(await kernelApi.restart(k.id));
        if (thenRunAll) runCells((S.current.doc.nb?.cells ?? []).map((c) => c.id));
      } catch (e) {
        toastError(e);
      }
    },
    [confirm, runCells, setKernel],
  );

  const shutdown = useCallback(async () => {
    const k = S.current.kernel;
    if (!k) return;
    const ok = await confirm({ title: 'Shut down the kernel?', body: 'Its variables are lost and its memory is freed. Running a cell starts a new one.', confirm: 'Shut down', danger: true });
    if (!ok) return;
    try {
      await kernelApi.shutdown(k.id);
      setKernel(null);
    } catch (e) {
      toastError(e);
    }
  }, [confirm, setKernel]);

  const pickEnv = useCallback(
    async (env: string) => {
      const k = S.current.kernel;
      if (k && k.env === env && k.status !== 'dead') return;
      if (k && k.status !== 'dead' && !(await confirm({ title: 'Switch the kernel?', body: 'The running kernel stops, and its variables are lost.', confirm: 'Switch' }))) return;
      await startKernel(env);
    },
    [confirm, startKernel],
  );

  const actions = useMemo<CellActions>(() => {
    const cells = () => S.current.doc.nb?.cells ?? [];
    const a: CellActions = {
      select(id, keepFocus) {
        if (S.current.editing === id) return;
        if (S.current.editing) setEditing(null);
        setActive(id);
        if (!keepFocus) focusList();
      },
      startEdit(id, at) {
        if (readOnlyRef.current) return;
        setActive(id);
        setCaret(at);
        setEditing(id);
      },
      edit(id, source) {
        if (readOnlyRef.current) return;
        latest.current.set(id, source);
        dispatch({ type: 'edit', id, source });
      },
      run(id, how) {
        if (readOnlyRef.current) return;
        const all = cells();
        const i = all.findIndex((c) => c.id === id);
        const cell = all[i];
        if (!cell) return;
        if (cell.type === 'code') runCells([id]);
        if (how === 'stay') {
          if (cell.type !== 'code') setEditing(null);
          return;
        }
        if (how === 'insert' || i === all.length - 1) return a.insert(i + 1, 'code', true);
        const next = all[i + 1];
        setActive(next.id);
        if (S.current.editing && next.type === 'code') a.startEdit(next.id, 'end');
        else {
          setEditing(null);
          focusList();
        }
        reveal(next.id);
      },
      escape(id) {
        setEditing(null);
        setActive(id);
        focusList();
      },
      edge(id, dir) {
        const all = cells();
        const next = all[all.findIndex((c) => c.id === id) + dir];
        if (!next) return false;
        if (next.type === 'markdown') {
          setEditing(null);
          setActive(next.id);
          focusList();
        } else a.startEdit(next.id, dir < 0 ? 'end' : 'start');
        reveal(next.id);
        return true;
      },
      insert(at, type, edit = false) {
        if (readOnlyRef.current) return;
        const c = newCell(type);
        dispatch({ type: 'insert', at, cell: c });
        setActive(c.id);
        if (edit) a.startEdit(c.id, 'start');
        else {
          setEditing(null);
          focusList();
        }
        reveal(c.id);
      },
      remove(id) {
        if (readOnlyRef.current) return;
        const all = cells();
        const i = all.findIndex((c) => c.id === id);
        if (i < 0) return;
        removed.current = { cell: all[i], at: i };
        dispatch({ type: 'remove', id });
        const next = all[i + 1] ?? all[i - 1];
        setEditing(null);
        setActive(next?.id ?? null);
        focusList();
      },
      move(id, by) {
        if (readOnlyRef.current) return;
        dispatch({ type: 'move', id, by });
        reveal(id);
      },
      retype(id, to) {
        if (readOnlyRef.current) return;
        dispatch({ type: 'retype', id, to });
      },
      input(id, value) {
        const k = S.current.kernel;
        if (k) kernelApi.input(k.id, id, value).catch(toastError);
      },
      interrupt,
      save() {
        saveRef.current();
      },
    };
    return a;
  }, [runCells, interrupt]);

  const complete = useCallback<Complete>(async (code, pos) => {
    const k = S.current.kernel;
    if (!k || k.status !== 'idle') return null;
    const r = await kernelApi.complete(k.id, code, toCodePoints(code, pos));
    if (!r.matches.length) return null;
    return { from: fromCodePoints(code, r.start), to: fromCodePoints(code, r.end), options: r.matches };
  }, []);

  /** Jupyter's command-mode keys, when no editor or field has the keyboard. */
  const onKey = (e: React.KeyboardEvent) => {
    if (S.current.editing || (e.target as HTMLElement).closest('input, textarea, select, .cm-editor')) return;
    const all = nb?.cells ?? [];
    const id = S.current.active ?? all[0]?.id;
    if (!id) return;
    const i = all.findIndex((c) => c.id === id);
    const mod = e.metaKey || e.ctrlKey;
    if (readOnlyRef.current && !['ArrowUp', 'ArrowDown', 'k', 'j'].includes(e.key)) return;
    const twice = (key: string) => {
      const now = Date.now();
      const hit = lastKey.current.key === key && now - lastKey.current.at < 600;
      lastKey.current = { key: hit ? '' : key, at: now };
      return hit;
    };
    const go = (j: number) => {
      const c = all[Math.max(0, Math.min(j, all.length - 1))];
      if (!c) return;
      setActive(c.id);
      reveal(c.id);
    };
    let handled = true;
    if (e.key === 'Enter' && e.shiftKey) actions.run(id, 'next');
    else if (e.key === 'Enter' && mod) actions.run(id, 'stay');
    else if (e.key === 'Enter' && e.altKey) actions.run(id, 'insert');
    else if (e.key === 'Enter') actions.startEdit(id, 'end');
    else if (mod || e.altKey) handled = false;
    else if (e.key === 'ArrowUp' || e.key === 'k') go(i - 1);
    else if (e.key === 'ArrowDown' || e.key === 'j') go(i + 1);
    else if (e.key === 'a') actions.insert(i, 'code');
    else if (e.key === 'b') actions.insert(i + 1, 'code');
    else if (e.key === 'd') twice('d') && actions.remove(id);
    else if (e.key === 'z' && removed.current) {
      const r = removed.current;
      removed.current = null;
      dispatch({ type: 'insert', at: r.at, cell: r.cell });
      setActive(r.cell.id);
    } else if (e.key === 'm') actions.retype(id, 'markdown');
    else if (e.key === 'y') actions.retype(id, 'code');
    else if (e.key === 'r') actions.retype(id, 'raw');
    else if (e.key === 'i') twice('i') && interrupt();
    else if (e.key === '0') twice('0') && restart();
    else handled = false;
    if (handled) e.preventDefault();
  };

  // What an agent asked from the Library now would be about: the whole notebook, or the cell picked.
  const scopeKey = useRef('');
  useEffect(() => {
    const tell = lib.current?.onScopes;
    if (!tell || !nb) return;
    const i = nb.cells.findIndex((c) => c.id === active);
    const out: NotebookScope[] = [{ id: 'notebook', label: tr('The whole notebook'), lead: '' }, ...(i >= 0 ? [cellScope(nb.cells[i], i)] : [])];
    const key = JSON.stringify(out);
    if (key === scopeKey.current) return;
    scopeKey.current = key;
    tell(out);
  }, [active, nb?.cells]);
  const askCell = useCallback((id: string) => {
    const all = S.current.doc.nb?.cells ?? [];
    const i = all.findIndex((c) => c.id === id);
    if (i >= 0) lib.current?.onAsk?.(cellScope(all[i], i).lead);
  }, []);

  const toSource = async () => {
    if (dirty && !(await confirm({ title: 'Leave unsaved changes?', body: 'The file view shows the notebook as saved; changes made here are dropped.', confirm: 'Discard', danger: true }))) return;
    onSource?.();
  };
  const runAll = () => {
    setEditing(null);
    runCells((nb?.cells ?? []).map((c) => c.id));
  };
  const clearAll = () => dispatch({ type: 'clear' });
  const download = () => (location.href = mu(`/api/fs/raw?path=${enc(path)}&download=1`));
  const busy = kernel?.status === 'busy';
  const crumbs = tildify(path, home).split(isWinPath(path) ? /[\\/]/ : '/');
  const kernelControls = (
    <>
      <KernelPicker
        path={path}
        kernel={kernel}
        starting={starting}
        open={pickerOpen}
        setOpen={setPickerOpen}
        onPick={pickEnv}
        onInterrupt={interrupt}
        onRestart={() => restart()}
        onShutdown={shutdown}
      />
      <IconButton label="Run all cells" size="sm" onClick={runAll} disabled={!nb}>
        <FastForward size={14} />
      </IconButton>
      <IconButton label="Interrupt (I, I)" size="sm" onClick={interrupt} disabled={!busy}>
        <Square size={12} />
      </IconButton>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {library ? (
        <>
          <div className="flex min-h-12 shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {library.lead}
              {dirty && !readOnly && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" title="Unsaved changes" />}
            </div>
            {!readOnly && !mobile && (
              <>
                {kernelControls}
                <IconButton label="Restart the kernel (0, 0)" size="sm" onClick={() => restart()} disabled={!kernel}>
                  <RotateCw size={14} />
                </IconButton>
                <IconButton label="Clear all outputs" size="sm" onClick={clearAll} disabled={!nb}>
                  <Eraser size={14} />
                </IconButton>
                <span className="mx-1 h-5 w-px shrink-0 bg-line" />
              </>
            )}
            {library.tail}
          </div>
          {library.band}
          {/* On a phone the kernel's controls have a row of their own, so the bar keeps the notebook's name. */}
          {!readOnly && mobile && (
            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
              {kernelControls}
              <span className="flex-1" />
              <IconButton ref={moreRef} label="More" size="sm" onClick={() => setMoreOpen((o) => !o)}>
                <MoreHorizontal size={15} />
              </IconButton>
              <Popover anchor={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} align="end" width={230}>
                <MenuItem icon={<RotateCw size={14} />} disabled={!kernel} onClick={() => (setMoreOpen(false), restart())}>
                  Restart the kernel
                </MenuItem>
                <MenuItem icon={<FastForward size={14} />} disabled={!kernel} onClick={() => (setMoreOpen(false), restart(true))}>
                  Restart and run all
                </MenuItem>
                <MenuItem icon={<Eraser size={14} />} onClick={() => (setMoreOpen(false), clearAll())}>
                  Clear all outputs
                </MenuItem>
              </Popover>
            </div>
          )}
        </>
      ) : (
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2 sm:px-3">
        {mobile && !embedded && (
          <IconButton label="Back" onClick={() => history.back()}>
            <ArrowLeft size={17} />
          </IconButton>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden font-mono text-[12px] text-fg-3" title={path}>
          {crumbs.map((c, i) => (
            <span key={i} className={cx('truncate', i === crumbs.length - 1 ? 'shrink-0 text-fg' : 'min-w-0 shrink', mobile && i < crumbs.length - 1 && 'hidden')}>
              {i > 0 && !mobile && <span className="px-0.5 opacity-50">/</span>}
              {c}
            </span>
          ))}
          {dirty && <span className="ml-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" title="Unsaved changes" />}
        </div>
        {kernelControls}
        {!mobile ? (
          <>
            <IconButton label="Restart the kernel (0, 0)" size="sm" onClick={() => restart()} disabled={!kernel}>
              <RotateCw size={14} />
            </IconButton>
            <IconButton label="Clear all outputs" size="sm" onClick={clearAll} disabled={!nb}>
              <Eraser size={14} />
            </IconButton>
            {onSource && (
              <IconButton label="View the notebook file (JSON)" size="sm" onClick={toSource}>
                <Braces size={14} />
              </IconButton>
            )}
            <IconButton label="Download" size="sm" onClick={download}>
              <Download size={14} />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton ref={moreRef} label="More" size="sm" onClick={() => setMoreOpen((o) => !o)}>
              <MoreHorizontal size={15} />
            </IconButton>
            <Popover anchor={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} align="end" width={230}>
              <MenuItem icon={<RotateCw size={14} />} disabled={!kernel} onClick={() => (setMoreOpen(false), restart())}>
                Restart the kernel
              </MenuItem>
              <MenuItem icon={<FastForward size={14} />} disabled={!kernel} onClick={() => (setMoreOpen(false), restart(true))}>
                Restart and run all
              </MenuItem>
              <MenuItem icon={<Eraser size={14} />} onClick={() => (setMoreOpen(false), clearAll())}>
                Clear all outputs
              </MenuItem>
              <MenuSep />
              {onSource && (
                <MenuItem icon={<Braces size={14} />} onClick={() => (setMoreOpen(false), toSource())}>
                  View the file (JSON)
                </MenuItem>
              )}
              <MenuItem icon={<Download size={14} />} onClick={() => (setMoreOpen(false), download())}>
                Download
              </MenuItem>
            </Popover>
          </>
        )}
        {fileActions}
        <Button size="sm" variant={dirty ? 'primary' : 'ghost'} icon={<Save size={13} />} disabled={!dirty || saving} onClick={() => save()} className="ml-1">
          <span className="hidden sm:inline">{saving ? 'Saving' : 'Save'}</span>
        </Button>
      </div>
      )}
      {changedOnDisk && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-[12.5px]">
          <span className="flex-1">The notebook changed on disk since it was opened.</span>
          <Button size="sm" variant="ghost" icon={<RotateCw size={13} />} onClick={load}>
            Reload (discard mine)
          </Button>
          <Button size="sm" variant="danger" onClick={() => save(true)}>
            Overwrite with mine
          </Button>
        </div>
      )}
      {kernel?.status === 'dead' && !readOnly && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-err/30 bg-err/5 px-3 py-1.5 text-[12.5px]">
          <span className="min-w-0 flex-1 break-words">{kernel.error || 'The kernel stopped.'}</span>
          <Button size="sm" variant="ghost" icon={<RotateCw size={13} />} onClick={() => startKernel(kernel.env)}>
            Restart
          </Button>
        </div>
      )}
      <div ref={list} tabIndex={-1} onKeyDown={onKey} className="min-h-0 flex-1 overflow-y-auto outline-none">
        {error ? (
          <Empty title="Could not open the notebook">
            {error}
            {onSource && (
              <div className="mt-3">
                <Button size="sm" onClick={onSource}>
                  View the file
                </Button>
              </div>
            )}
          </Empty>
        ) : !nb ? (
          <div className="flex h-full items-center justify-center text-fg-3">
            <Throbber size={34} />
          </div>
        ) : (
          <div className="mx-auto max-w-[1000px] px-1 pt-4 pb-24 sm:px-4">
            {nb.cells.map((c, i) => (
              <div key={c.id}>
                {i > 0 && !mobile && !readOnly && <InsertZone at={i} actions={actions} />}
                <CellView
                  cell={c}
                  index={i}
                  last={i === nb.cells.length - 1}
                  active={active === c.id}
                  editing={editing === c.id}
                  caret={editing === c.id ? caret : null}
                  lang={lang}
                  dark={dark}
                  dir={dir}
                  mobile={mobile}
                  actions={actions}
                  complete={complete}
                  readOnly={readOnly}
                  onAsk={library?.onAsk && !readOnly ? askCell : undefined}
                />
              </div>
            ))}
            <div className={cx('flex justify-center gap-2 pt-4', readOnly && 'hidden')}>
              <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => actions.insert(nb.cells.length, 'code', true)}>
                Code
              </Button>
              <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => actions.insert(nb.cells.length, 'markdown', true)}>
                Text
              </Button>
            </div>
          </div>
        )}
      </div>
      {library && dirty && !readOnly && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(8px,var(--safe-bottom))]">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />
            Not saved yet{library.savedNote ? <span className="text-fg-3"> · {library.savedNote}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={discard} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving || !library.onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      {confirmNode}
    </div>
  );
}
