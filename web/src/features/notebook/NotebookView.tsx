// A Jupyter notebook: its cells and outputs, edited here and run in a kernel on this machine.
// Code shows highlighted until clicked, then a cell editor takes over; keys follow Jupyter's
// (Shift+Enter runs and moves on; outside an editor, A/B add cells, DD deletes and Z brings them back one by one, M/Y switch
// type, C/X/V copy, cut and paste cells, Shift+M merges them, Shift+↑/↓ picks several). A right click on a cell, or its ⋯,
// has its menu: run it, the cells above or below it, copy, cut, paste, duplicate, split, merge, move, change its type,
// clear or fold its output, delete. Outline lists the Markdown headings. A run asked while the kernel starts waits for it.
// A file of this computer opens here from Files; a notebook of the Library opens here too (`library`), kept as
// versions by the Library and run in a folder of its own.
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { ArrowLeft, Braces, Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, ChevronUp, ClipboardPaste, Combine, Copy, CopyPlus, Download, Eraser, FastForward, Keyboard, ListEnd, ListStart, ListTree, MoreHorizontal, Pencil, Play, Plus, Power, RotateCw, Save, Scissors, Sparkles, Square, SquareSplitVertical, Trash2, X } from 'lucide-react';
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
import { cellsToRun, copyCells, initialDoc, isDirty, newCell, newCellId, outlineOf, outputsFolded, parseNotebook, pasteCells, reduce, serializeNotebook, splitCell, type Cell, type CellRunView, type CellType, type ClipCell } from './model';
import { Outputs } from './Outputs';
import { mu } from '../../lib/machine';
import { tr } from '../../i18n/runtime';
import { ContextMenu, type ContextMenuAt, type MenuEntry } from '../pages/common/menus';
import { ShortcutsDialog, type ShortcutGroup } from '../pages/common/Shortcuts';
import { keyLabel } from '../pages/common/keys';

// Markdown cells may carry HTML (centred titles, sized images); it is kept, minus anything that runs.
const MD_PLUGINS = MD_HTML;

type Caret = number | 'start' | 'end';

/** The cells copied or cut (kept while the app is open, so they can go into another notebook), and whether the outline shows. */
let clipboard: ClipCell[] = [];
const OUTLINE_KEY = 'wa.nb.outline';

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

/** The notebook's keys, for the shortcuts list. */
const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Running',
    items: [
      ['Shift+Enter', 'Run the cell and go to the next one'],
      ['Ctrl+Enter', 'Run the cell and stay in it'],
      ['Alt+Enter', 'Run the cell and add one below'],
      ['Ctrl+Shift+Enter', 'Run the cell and all the cells below it'],
      ['I, I', 'Interrupt the kernel'],
      ['0, 0', 'Restart the kernel'],
    ],
  },
  {
    title: 'Moving about',
    items: [
      ['↑ / K', 'The cell above'],
      ['↓ / J', 'The cell below'],
      ['Enter', 'Edit the cell'],
      ['Esc', 'Stop editing, go back to the cells'],
      ['Shift+↑ / Shift+↓', 'Pick the cells above or below as well'],
    ],
  },
  {
    title: 'Cells',
    items: [
      ['A / B', 'Add a cell above / below'],
      ['D, D', 'Delete the cell (or the cells picked)'],
      ['Z', 'Bring back the last cells deleted'],
      ['C / X', 'Copy / cut the cell (or the cells picked)'],
      ['V / Shift+V', 'Paste below / above'],
      ['Shift+M', 'Merge the cell with the next (or the cells picked)'],
      ['Ctrl+Shift+-', 'Split the cell at the cursor (while editing it)'],
      ['M / Y / R', 'Make it a text / code / raw cell'],
    ],
  },
  { title: 'Notebook', items: [['Ctrl+S', 'Save']] },
];

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
  select: (id: string, keepFocus?: boolean, extend?: boolean) => void;
  startEdit: (id: string, at: Caret) => void;
  edit: (id: string, source: string) => void;
  run: (id: string, how: 'stay' | 'next' | 'insert' | 'below') => void;
  /** Opens the cell's menu at a point. */
  menu: (id: string, at: ContextMenuAt) => void;
  /** Its output folded away, or shown. */
  fold: (id: string, folded: boolean) => void;
  /** An open cell editor tells where it is, so Split can cut at its cursor (null when it goes). */
  register: (id: string, handle: CellEditorHandle | null) => void;
  split: (id: string) => void;
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
        onSplit: () => actions.split(cell.id),
        onEscape: () => actions.escape(cell.id),
        onSave: () => actions.save(),
        onEdge: (dir) => actions.edge(cell.id, dir),
        complete,
      });
      if (!alive) return h.destroy();
      handle.current = h;
      actions.register(cell.id, h);
      setReady(true);
      h.focus(caret ?? 'end');
    });
    return () => {
      alive = false;
      actions.register(cell.id, null);
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
  /** One of several cells picked (Shift+↑ ↓, Shift+click). */
  picked?: boolean;
}

const CellView = memo(function CellView({ cell, index, last, active, editing, caret, lang, dark, dir, mobile, actions, complete, readOnly, onAsk, picked }: CellProps) {
  const code = cell.type === 'code';
  const run = cell.run;
  const busy = run?.state === 'queued' || run?.state === 'running';
  const folded = code && outputsFolded(cell);
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
      onMouseDown={(e) => !(e.button === 2 && picked) && actions.select(cell.id, !!(e.target as HTMLElement).closest('input, textarea, select'), e.shiftKey)}
      onContextMenu={(e) => {
        // Words picked, a link, a field or the code being edited keep the browser's own menu (to copy them).
        if (readOnly || mobile || (e.target as HTMLElement).closest('a, input, textarea, select, .cm-editor') || window.getSelection()?.toString()) return;
        e.preventDefault();
        actions.menu(cell.id, { x: e.clientX, y: e.clientY });
      }}
      className={cx('group/cell relative flex gap-1 rounded-xl py-1.5 pr-2 sm:gap-1.5', (active || picked) && 'bg-bg-1', picked && 'bg-accent/10', active && mobile && 'mt-9')}
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
                  title={busy ? 'Interrupt the kernel' : 'Run (Shift+Enter)'}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => (busy ? actions.interrupt() : actions.run(cell.id, 'next'))}
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
            {!readOnly && !mobile && !!cell.outputs.length && (
              <button
                type="button"
                title={folded ? 'Show the output' : 'Fold the output'}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => actions.fold(cell.id, !folded)}
                className="mt-0.5 flex h-5 w-5 items-center justify-center rounded text-fg-3 opacity-0 transition-opacity group-hover/cell:opacity-100 hover:bg-bg-3 hover:text-fg"
              >
                {folded ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
              </button>
            )}
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {body}
        {code &&
          (folded && !!cell.outputs.length ? (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => actions.fold(cell.id, false)}
              className="mt-1 flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] text-fg-3 hover:bg-bg-2 hover:text-fg"
            >
              <ChevronsUpDown size={12} />
              {tr('Output hidden')} ({cell.outputs.length})
            </button>
          ) : (
            <Outputs outputs={cell.outputs} run={run} onInput={(v) => actions.input(cell.id, v)} />
          ))}
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
          <IconButton label={busy ? 'Interrupt' : 'Run'} size="sm" onClick={() => (busy ? actions.interrupt() : actions.run(cell.id, 'next'))}>
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
        <IconButton
          label="More for this cell"
          size="sm"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            actions.menu(cell.id, { x: Math.max(8, r.right - 8), y: r.bottom + 4 });
          }}
        >
          <MoreHorizontal size={14} />
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
  // Cells taken out (deleted or cut), the latest last, with where they were: Z brings them back one group at a time.
  const deleted = useRef<{ at: number; cells: Cell[] }[]>([]);
  // The editors of the cells open for editing (so Split cuts at the cursor), and a kernel being started (a second run waits for it).
  const editors = useRef(new Map<string, CellEditorHandle>());
  const starter = useRef<Promise<KernelInfo | null> | null>(null);
  // Several cells picked: from the one picked first (the anchor) to the one active.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [cellMenu, setCellMenu] = useState<(ContextMenuAt & { id: string }) | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(() => localStorage.getItem(OUTLINE_KEY) === '1');
  const [outlineSheet, setOutlineSheet] = useState(false);
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

  const S = useRef({ doc, active, editing, kernel, anchor });
  S.current = { doc, active, editing, kernel, anchor };
  useEffect(() => localStorage.setItem(OUTLINE_KEY, outlineOpen ? '1' : '0'), [outlineOpen]);

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
    (env?: string): Promise<KernelInfo | null> => {
      // A second run while the kernel is being started waits for that one rather than starting another.
      if (starter.current) return starter.current;
      setStarting(true);
      const p = (async () => {
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
          starter.current = null;
          setStarting(false);
        }
      })();
      starter.current = p;
      return p;
    },
    [path, setKernel],
  );

  /** A kernel to run in: the one there, started if there is none, or (while it is starting or restarting) waited for. Null when it did not come. */
  const kernelReady = useCallback(
    async (): Promise<KernelInfo | null> => {
      let k = S.current.kernel;
      if (starter.current) await starter.current;
      k = S.current.kernel ?? k;
      if (!k || k.status === 'dead') return startKernel(k?.env);
      if (k.status !== 'starting' && k.status !== 'restarting') return k;
      toast('The kernel is starting: the cells run when it is ready');
      for (const end = Date.now() + 120_000; Date.now() < end; ) {
        await new Promise((r) => setTimeout(r, 250));
        k = S.current.kernel;
        if (!k || k.status === 'dead') break;
        if (k.status === 'idle' || k.status === 'busy') return k;
      }
      toast('The kernel did not start, so the cells did not run', 'error');
      return null;
    },
    [startKernel],
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
      const k = await kernelReady();
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
    [kernelReady],
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

  /** The cells picked: those from the anchor to the active one, else the active one alone. */
  const pickedIds = (): string[] => {
    const all = S.current.doc.nb?.cells ?? [];
    const { active: a, anchor: b } = S.current;
    if (!a) return [];
    const i = all.findIndex((c) => c.id === a);
    const j = b ? all.findIndex((c) => c.id === b) : -1;
    if (i < 0 || j < 0) return [a];
    return all.slice(Math.min(i, j), Math.max(i, j) + 1).map((c) => c.id);
  };

  /** What can be done with cells as a group (each one change): copy, cut, paste, duplicate, split, merge, run above and below, fold. */
  const ops = useMemo(() => {
    const cells = () => S.current.doc.nb?.cells ?? [];
    const of = (ids: string[]) => cells().filter((c) => ids.includes(c.id));
    const showAfter = (list: Cell[]) => {
      setAnchor(null);
      setEditing(null);
      if (list[0]) {
        setActive(list[0].id);
        reveal(list[0].id);
      }
      focusList();
    };
    const o = {
      copy(ids: string[]) {
        const picked = of(ids);
        if (!picked.length) return;
        clipboard = copyCells(picked);
        toast(picked.length === 1 ? 'Cell copied' : `${picked.length} cells copied`);
      },
      /** Cells taken out, to bring back with Z. */
      takeOut(ids: string[]) {
        if (readOnlyRef.current) return;
        const all = cells();
        const taken = of(ids);
        if (!taken.length) return;
        const at = all.findIndex((c) => c.id === taken[0].id);
        deleted.current = [...deleted.current.slice(-49), { at, cells: taken }];
        dispatch({ type: 'removeMany', ids: taken.map((c) => c.id) });
        const rest = all.filter((c) => !ids.includes(c.id));
        const next = rest[Math.min(at, rest.length - 1)];
        setAnchor(null);
        setEditing(null);
        setActive(next?.id ?? null);
        focusList();
      },
      cut(ids: string[]) {
        if (readOnlyRef.current) return;
        o.copy(ids);
        o.takeOut(ids);
      },
      paste(at: number) {
        if (readOnlyRef.current) return;
        if (!clipboard.length) return toast('Nothing copied yet');
        const made = pasteCells(clipboard);
        dispatch({ type: 'insertMany', at, cells: made });
        showAfter(made);
      },
      duplicate(ids: string[]) {
        if (readOnlyRef.current) return;
        const picked = of(ids);
        if (!picked.length) return;
        const made = pasteCells(copyCells(picked));
        dispatch({ type: 'insertMany', at: cells().findIndex((c) => c.id === picked[picked.length - 1].id) + 1, cells: made });
        showAfter(made);
      },
      split(id: string) {
        if (readOnlyRef.current) return;
        const h = editors.current.get(id);
        const cell = cells().find((c) => c.id === id);
        if (!h || !cell) return toast('Click in the cell where it should split');
        const newId = newCellId();
        if (!splitCell(cell, h.cursor(), newId)) return toast('Put the cursor inside the text, between two parts, to split the cell');
        dispatch({ type: 'split', id, at: h.cursor(), newId });
        setAnchor(null);
        setActive(newId);
        setCaret('start');
        setEditing(newId);
        reveal(newId);
      },
      /** The cells picked made one, or the cell with the next one when only it is picked. */
      merge(ids: string[]) {
        if (readOnlyRef.current) return;
        const all = cells();
        let list = ids;
        if (list.length < 2) {
          const i = all.findIndex((c) => c.id === list[0]);
          if (i < 0 || i === all.length - 1) return toast('There is no cell after it to merge with');
          list = [list[0], all[i + 1].id];
        }
        dispatch({ type: 'merge', ids: list });
        setAnchor(null);
        setEditing(null);
        setActive(list[0]);
        focusList();
      },
      runRange(id: string, how: 'above' | 'below' | 'from') {
        if (readOnlyRef.current) return;
        const ids = cellsToRun(cells(), id, how);
        if (!ids.length) return toast(how === 'above' ? 'No code cell above it' : 'No code cell to run');
        setEditing(null);
        runCells(ids);
      },
      fold(id: string, folded: boolean) {
        if (!readOnlyRef.current) dispatch({ type: 'fold', id, folded });
      },
      clearOutput(id: string) {
        if (!readOnlyRef.current) dispatch({ type: 'clear', ids: [id] });
      },
      /** The last cells taken out, back where they were. */
      bringBack() {
        const g = deleted.current.pop();
        if (!g || readOnlyRef.current) return false;
        dispatch({ type: 'insertMany', at: g.at, cells: g.cells });
        setAnchor(null);
        setActive(g.cells[0].id);
        reveal(g.cells[0].id);
        return true;
      },
    };
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runCells]);

  const actions = useMemo<CellActions>(() => {
    const cells = () => S.current.doc.nb?.cells ?? [];
    const a: CellActions = {
      select(id, keepFocus, extend) {
        if (S.current.editing === id) return;
        if (S.current.editing) setEditing(null);
        if (extend && S.current.active) setAnchor(S.current.anchor ?? S.current.active);
        else if (S.current.anchor) setAnchor(null);
        setActive(id);
        if (!keepFocus) focusList();
      },
      menu(id, at) {
        if (readOnlyRef.current) return;
        // Over cells picked together it is about them all; elsewhere about the one it is on.
        if (!pickedIds().includes(id) || !S.current.anchor) {
          setAnchor(null);
          setActive(id);
        }
        setCellMenu({ ...at, id });
      },
      fold: (id, folded) => ops.fold(id, folded),
      register(id, handle) {
        if (handle) editors.current.set(id, handle);
        else editors.current.delete(id);
      },
      split: (id) => ops.split(id),
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
        // This cell and the code cells after it: it stays where it is.
        if (how === 'below') return ops.runRange(id, 'from');
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
        // The cells picked together go together; else this one.
        ops.takeOut(S.current.anchor && pickedIds().includes(id) ? pickedIds() : [id]);
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
  }, [runCells, interrupt, ops]);

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
    const go = (j: number, extend = false) => {
      const c = all[Math.max(0, Math.min(j, all.length - 1))];
      if (!c) return;
      // Shift with the arrow picks the cells it passes over, from where it began.
      setAnchor(extend ? (S.current.anchor ?? id) : null);
      setActive(c.id);
      reveal(c.id);
    };
    const ids = S.current.anchor ? pickedIds() : [id];
    let handled = true;
    if (e.key === 'Enter' && e.shiftKey && mod) actions.run(id, 'below');
    else if (e.key === 'Enter' && e.shiftKey) actions.run(id, 'next');
    else if (e.key === 'Enter' && mod) actions.run(id, 'stay');
    else if (e.key === 'Enter' && e.altKey) actions.run(id, 'insert');
    else if (e.key === 'Enter') actions.startEdit(id, 'end');
    else if (mod && e.shiftKey && (e.key === '_' || e.key === '-')) toast('Click in the cell, where it should split, first');
    else if (mod || e.altKey) handled = false;
    else if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'K')) go(i - 1, true);
    else if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'J')) go(i + 1, true);
    else if (e.key === 'Escape' && S.current.anchor) setAnchor(null);
    else if (e.key === 'ArrowUp' || e.key === 'k') go(i - 1);
    else if (e.key === 'ArrowDown' || e.key === 'j') go(i + 1);
    else if (e.key === 'c') ops.copy(ids);
    else if (e.key === 'x') ops.cut(ids);
    else if (e.key === 'v') ops.paste(i + 1);
    else if (e.key === 'V') ops.paste(i);
    else if (e.key === 'M') ops.merge(ids);
    else if (e.key === 'a') actions.insert(i, 'code');
    else if (e.key === 'b') actions.insert(i + 1, 'code');
    else if (e.key === 'd') twice('d') && actions.remove(id);
    else if (e.key === 'z') handled = ops.bringBack();
    else if (e.key === 'm') actions.retype(id, 'markdown');
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

  /** The right-click menu of a cell (or of the cells picked together): the same actions as its tools, with their keys. */
  const cellItems = (id: string): MenuEntry[] => {
    const all = nb?.cells ?? [];
    const i = all.findIndex((c) => c.id === id);
    const cell = all[i];
    if (!cell) return [];
    const picked = S.current.anchor && pickedIds().includes(id) ? pickedIds() : [id];
    const many = picked.length > 1;
    const code = cell.type === 'code';
    return [
      code && { label: many ? 'Run the first cell' : 'Run this cell', icon: <Play size={14} />, keys: 'Ctrl+Enter', run: () => actions.run(id, 'stay') },
      { label: 'Run all above', icon: <ListStart size={14} />, also: 'cells before', run: () => ops.runRange(id, 'above') },
      { label: 'Run this and below', icon: <FastForward size={14} />, keys: 'Ctrl+Shift+Enter', also: 'cells after', run: () => ops.runRange(id, 'from') },
      { label: 'Run all below', icon: <ListEnd size={14} />, also: 'cells after', run: () => ops.runRange(id, 'below') },
      '-',
      { label: many ? `Cut ${picked.length} cells` : 'Cut', icon: <Scissors size={14} />, keys: 'X', run: () => ops.cut(picked) },
      { label: many ? `Copy ${picked.length} cells` : 'Copy', icon: <Copy size={14} />, keys: 'C', run: () => ops.copy(picked) },
      { label: 'Paste below', icon: <ClipboardPaste size={14} />, keys: 'V', disabled: !clipboard.length, run: () => ops.paste(all.findIndex((c) => c.id === picked[picked.length - 1]) + 1) },
      { label: 'Paste above', keys: 'Shift+V', disabled: !clipboard.length, run: () => ops.paste(all.findIndex((c) => c.id === picked[0])) },
      { label: many ? `Duplicate ${picked.length} cells` : 'Duplicate', icon: <CopyPlus size={14} />, run: () => ops.duplicate(picked) },
      '-',
      { label: 'Split at the cursor', icon: <SquareSplitVertical size={14} />, keys: 'Ctrl+Shift+-', also: 'cut in two', disabled: many || !editors.current.has(id), run: () => ops.split(id) },
      { label: many ? 'Merge the cells picked' : 'Merge with the next cell', icon: <Combine size={14} />, keys: 'Shift+M', also: 'join', disabled: !many && i === all.length - 1, run: () => ops.merge(picked) },
      '-',
      { label: 'Add a cell above', keys: 'A', run: () => actions.insert(i, 'code', true) },
      { label: 'Add a cell below', keys: 'B', run: () => actions.insert(i + 1, 'code', true) },
      { label: 'Move up', icon: <ChevronUp size={14} />, disabled: i === 0, run: () => actions.move(id, -1) },
      { label: 'Move down', icon: <ChevronDown size={14} />, disabled: i === all.length - 1, run: () => actions.move(id, 1) },
      {
        label: 'Cell type',
        items: [
          { label: 'Code', keys: 'Y', checked: cell.type === 'code', run: () => actions.retype(id, 'code') },
          { label: 'Text', keys: 'M', checked: cell.type === 'markdown', run: () => actions.retype(id, 'markdown') },
          { label: 'Raw', keys: 'R', checked: cell.type === 'raw', run: () => actions.retype(id, 'raw') },
        ],
      },
      code && '-',
      code && { label: 'Clear the output', icon: <Eraser size={14} />, disabled: !cell.outputs.length && cell.count == null, run: () => ops.clearOutput(id) },
      code && { label: outputsFolded(cell) ? 'Show the output' : 'Fold the output', icon: outputsFolded(cell) ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />, disabled: !cell.outputs.length, run: () => ops.fold(id, !outputsFolded(cell)) },
      '-',
      !!library?.onAsk && { label: 'Ask an agent about this cell', icon: <Sparkles size={14} />, run: () => askCell(id) },
      { label: many ? `Delete ${picked.length} cells` : 'Delete the cell', icon: <Trash2 size={14} />, keys: 'D, D', danger: true, run: () => actions.remove(id) },
    ];
  };
  const pickedSet = new Set(anchor ? pickedIds() : []);
  const headings = useMemo(() => outlineOf(nb?.cells ?? []), [nb?.cells]);
  const goHeading = (id: string) => {
    setOutlineSheet(false);
    setAnchor(null);
    setEditing(null);
    setActive(id);
    reveal(id);
  };
  const outlineList = (
    <div className="py-1">
      {headings.length === 0 && <div className="px-3 py-3 text-[12.5px] text-fg-3">{tr('Headings of the text cells show here: start a line with # for one.')}</div>}
      {headings.map((h, k) => (
        <button
          key={`${h.id}:${h.line}:${k}`}
          type="button"
          onClick={() => goHeading(h.id)}
          style={{ paddingLeft: 10 + (h.level - 1) * 12 }}
          className={cx('flex w-full items-center truncate py-1 pr-2 text-left text-[12.5px] hover:bg-bg-2', h.level === 1 ? 'font-medium text-fg' : 'text-fg-2', active === h.id && 'bg-bg-1')}
        >
          <span translate="no" className="truncate">
            {h.text}
          </span>
        </button>
      ))}
    </div>
  );
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

  // More: running a range of cells, the kernel, the outline and the keys; on a phone the file's own too.
  const target = active ?? nb?.cells[0]?.id ?? null;
  const shut = (f: () => void) => () => (setMoreOpen(false), f());
  const moreButton = (
    <IconButton ref={moreRef} label="More" size="sm" active={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
      <MoreHorizontal size={15} />
    </IconButton>
  );
  const morePopover = (
    <Popover anchor={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} align="end" width={260}>
      {!readOnly && (
        <>
          <MenuItem icon={<FastForward size={14} />} disabled={!nb} onClick={shut(runAll)}>
            Run all cells
          </MenuItem>
          <MenuItem icon={<ListStart size={14} />} disabled={!target} onClick={shut(() => target && ops.runRange(target, 'above'))}>
            Run all above
          </MenuItem>
          <MenuItem icon={<FastForward size={14} />} hint={keyLabel('Ctrl+Shift+Enter')} disabled={!target} onClick={shut(() => target && ops.runRange(target, 'from'))}>
            Run this and below
          </MenuItem>
          <MenuItem icon={<ListEnd size={14} />} disabled={!target} onClick={shut(() => target && ops.runRange(target, 'below'))}>
            Run all below
          </MenuItem>
          <MenuSep />
          <MenuItem icon={<RotateCw size={14} />} disabled={!kernel} onClick={shut(() => restart())}>
            Restart the kernel
          </MenuItem>
          <MenuItem icon={<FastForward size={14} />} disabled={!kernel} onClick={shut(() => restart(true))}>
            Restart and run all
          </MenuItem>
          <MenuItem icon={<Eraser size={14} />} onClick={shut(clearAll)}>
            Clear all outputs
          </MenuItem>
          <MenuSep />
        </>
      )}
      <MenuItem icon={<ListTree size={14} />} checked={mobile ? undefined : outlineOpen} onClick={shut(() => (mobile ? setOutlineSheet(true) : setOutlineOpen((o) => !o)))}>
        Outline
      </MenuItem>
      <MenuItem icon={<Keyboard size={14} />} onClick={shut(() => setKeysOpen(true))}>
        Keyboard shortcuts
      </MenuItem>
      {mobile && !library && (
        <>
          <MenuSep />
          {onSource && (
            <MenuItem icon={<Braces size={14} />} onClick={shut(toSource)}>
              View the file (JSON)
            </MenuItem>
          )}
          <MenuItem icon={<Download size={14} />} onClick={shut(download)}>
            Download
          </MenuItem>
        </>
      )}
    </Popover>
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
                {moreButton}
                {morePopover}
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
              {moreButton}
              {morePopover}
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
            {moreButton}
            {morePopover}
          </>
        ) : (
          <>
            {moreButton}
            {morePopover}
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
      <div className="flex min-h-0 flex-1">
      {outlineOpen && !mobile && (
        <aside aria-label="Outline" className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pr-1 pl-3 text-[12.5px] font-medium text-fg-2">
            <span className="min-w-0 flex-1 truncate">Outline</span>
            <IconButton label="Close" size="sm" onClick={() => setOutlineOpen(false)}>
              <X size={13} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{outlineList}</div>
        </aside>
      )}
      <div ref={list} tabIndex={-1} onKeyDown={onKey} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none">
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
                  picked={!!anchor && pickedSet.has(c.id)}
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
      <ContextMenu at={cellMenu} items={cellMenu ? cellItems(cellMenu.id) : []} onClose={() => setCellMenu(null)} width={300} />
      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} groups={SHORTCUTS} part="notebook" />
      <Popover anchor={moreRef} open={outlineSheet} onClose={() => setOutlineSheet(false)} align="end" width={300} title="Outline">
        {outlineList}
      </Popover>
    </div>
  );
}
