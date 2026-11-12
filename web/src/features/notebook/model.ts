// Notebook documents: reading and writing .ipynb (nbformat 4), and every change a notebook page
// makes, including outputs arriving from the kernel. Writing follows nbformat's own layout (sorted
// keys, one-space indent, multi-line strings as line lists) and carries over the fields this page
// does not edit, so a save changes only what changed.
import type { CellRun, KernelOp, NbOutput, RunState } from '@shared/types';
import { appendOutput, CELL_ID, joinLines, newCellId, notebookText, PYTHON_NOTEBOOK } from '@shared/notebook';

type Json = Record<string, any>;

export type CellType = 'code' | 'markdown' | 'raw';

export interface CellRunView {
  seq: number;
  state: RunState;
  startedAt?: number;
  endedAt?: number;
  input?: CellRun['input'];
  /** Sent from this page and not yet acknowledged by the kernel; `prev` is the cell to put back if sending fails. */
  sent?: boolean;
  prev?: Cell;
}

export interface Cell {
  /** The nbformat cell id (made up for notebooks older than 4.5); the kernel keys runs by it. */
  id: string;
  type: CellType;
  source: string;
  outputs: NbOutput[];
  count: number | null;
  /** The cell as read, so metadata and attachments round-trip. */
  raw: Json;
  run?: CellRunView;
}

export interface Notebook {
  cells: Cell[];
  metadata: Json;
  minor: number;
  rest: Json;
}

export { newCellId };

export const newCell = (type: CellType): Cell => ({ id: newCellId(), type, source: '', outputs: [], count: null, raw: { metadata: {} } });

function readOutput(o: Json): NbOutput {
  const out = { ...o } as NbOutput;
  if (o.output_type === 'stream') out.text = joinLines(o.text);
  if (o.data && typeof o.data === 'object') out.data = Object.fromEntries(Object.entries(o.data).map(([k, v]) => [k, Array.isArray(v) && !k.includes('json') ? joinLines(v) : v]));
  return out;
}

/** A new notebook: one empty code cell, in Python until a kernel says otherwise. */
export function emptyNotebook(): Notebook {
  return {
    cells: [newCell('code')],
    metadata: structuredClone(PYTHON_NOTEBOOK),
    minor: 5,
    rest: {},
  };
}

/** A new notebook file's text, as nbformat writes it. */
export const newNotebookText = () => serializeNotebook(emptyNotebook());

export function parseNotebook(text: string): Notebook {
  // An empty file (made as "x.ipynb" by hand or by a program) opens as a new notebook, written out when saved.
  if (!text.trim()) return emptyNotebook();
  const j = JSON.parse(text);
  if (!j || typeof j !== 'object' || !Array.isArray(j.cells)) throw new Error('This file has no notebook cells');
  if (j.nbformat !== 4) throw new Error(`Notebook format ${j.nbformat} is not supported here (only format 4)`);
  const { cells, metadata, nbformat: _nbformat, nbformat_minor, ...rest } = j;
  const seen = new Set<string>();
  return {
    metadata: metadata ?? {},
    minor: Number(nbformat_minor) || 0,
    rest,
    cells: (cells as Json[]).map((c, i) => {
      let id = typeof c.id === 'string' && CELL_ID.test(c.id) ? c.id : `cell-${i}`;
      while (seen.has(id)) id = `${id.slice(0, 56)}-${i}`;
      seen.add(id);
      const type: CellType = c.cell_type === 'markdown' || c.cell_type === 'raw' ? c.cell_type : 'code';
      return {
        id,
        type,
        source: joinLines(c.source),
        outputs: type === 'code' && Array.isArray(c.outputs) ? c.outputs.map(readOutput) : [],
        count: type === 'code' ? (c.execution_count ?? null) : null,
        raw: c,
      };
    }),
  };
}

/** The notebook as nbformat writes it (shared/notebook.ts). Cell ids need format 4.5, so older notebooks are upgraded. */
export function serializeNotebook(nb: Notebook): string {
  const cells = nb.cells.map((c) => {
    const out: Json = { ...c.raw, id: c.id, cell_type: c.type, metadata: c.raw.metadata ?? {}, source: c.source };
    if (c.type === 'code') {
      out.outputs = c.outputs;
      out.execution_count = c.count ?? null;
      delete out.attachments;
    } else {
      delete out.outputs;
      delete out.execution_count;
    }
    return out;
  });
  return notebookText({ ...nb.rest, cells, metadata: nb.metadata, nbformat: 4, nbformat_minor: Math.max(nb.minor, 5) });
}

// ---- edits -------------------------------------------------------------------------------------

export interface DocState {
  nb: Notebook | null;
  /** The cells as last loaded or saved. Every change makes new cell objects, so a cell that is not one of these is unsaved. */
  saved: Cell[];
}

export const isDirty = (d: DocState) => !!d.nb && (d.nb.cells.length !== d.saved.length || d.nb.cells.some((c, i) => c !== d.saved[i]));

export type Action =
  | { type: 'load'; nb: Notebook }
  | { type: 'saved'; cells: Cell[] }
  | { type: 'edit'; id: string; source: string }
  | { type: 'retype'; id: string; to: CellType }
  | { type: 'insert'; at: number; cell: Cell }
  /** Several cells at once (a paste, a duplicate, Z after cutting some): one change. */
  | { type: 'insertMany'; at: number; cells: Cell[] }
  | { type: 'remove'; id: string }
  /** Several cells taken out at once (a cut, a delete of the cells picked): one change. */
  | { type: 'removeMany'; ids: string[] }
  /** One cell made two, at a place in its text (`newId` is the second's id). */
  | { type: 'split'; id: string; at: number; newId: string }
  /** The cells (next to each other, in the order they are in) made one, in the first. */
  | { type: 'merge'; ids: string[] }
  /** A code cell's output folded away (kept in its metadata), or shown. */
  | { type: 'fold'; id: string; folded: boolean }
  | { type: 'move'; id: string; by: -1 | 1 }
  | { type: 'clear'; ids?: string[] }
  | { type: 'sent'; ids: string[] }
  | { type: 'unsent'; ids: string[] }
  /** `since` is the file's modification time: a page that just opened takes only runs newer than the file. */
  | { type: 'kernel'; op: KernelOp; since: number };

export const initialDoc: DocState = { nb: null, saved: [] };

const active = (s?: RunState) => s === 'queued' || s === 'running';

function mapCell(st: DocState, id: string, f: (c: Cell) => Cell | null): DocState {
  if (!st.nb) return st;
  const i = st.nb.cells.findIndex((c) => c.id === id);
  if (i < 0) return st;
  const next = f(st.nb.cells[i]);
  if (!next) return st;
  const cells = st.nb.cells.slice();
  cells[i] = next;
  return { ...st, nb: { ...st.nb, cells } };
}

const runView = (r: Omit<CellRun, 'outputs'>): CellRunView => ({ seq: r.seq, state: r.state, startedAt: r.startedAt, endedAt: r.endedAt, input: r.input });

function applyOp(st: DocState, op: KernelOp, since: number): DocState {
  switch (op.op) {
    case 'snapshot': {
      let s = st;
      for (const r of op.runs) {
        s = mapCell(s, r.cellId, (c) => {
          const known = c.run?.seq ?? 0;
          if (r.seq < known || (c.run?.sent && r.seq === known)) return null;
          if (!c.run && !active(r.state) && (r.endedAt ?? 0) <= since) return null;
          if (c.run && r.seq === known && c.run.state === r.state && !active(r.state) && c.outputs.length === r.outputs.length) return null;
          return { ...c, outputs: r.outputs, count: r.count, run: runView(r) };
        });
      }
      return s;
    }
    case 'run': {
      const r = op.run;
      return mapCell(st, r.cellId, (c) => {
        const known = c.run?.seq ?? 0;
        if (r.seq > known) return { ...c, outputs: [], count: r.count, run: runView(r) };
        if (r.seq === known && c.run && !c.run.sent) return { ...c, count: r.count ?? c.count, run: runView(r) };
        return null;
      });
    }
    case 'out':
    case 'clear':
    case 'replace':
      return mapCell(st, op.cellId, (c) => {
        if (!c.run || c.run.sent || c.run.seq !== op.seq) return null;
        if (op.op === 'clear') return { ...c, outputs: [] };
        if (op.op === 'replace') {
          const outputs = c.outputs.slice();
          if (op.index >= outputs.length) return null;
          outputs[op.index] = op.output;
          return { ...c, outputs };
        }
        const count = op.output.output_type === 'execute_result' ? (op.output.execution_count ?? c.count) : c.count;
        return { ...c, outputs: appendOutput(c.outputs, op.output), count };
      });
    default:
      return st;
  }
}

export function reduce(st: DocState, a: Action): DocState {
  if (a.type === 'load') return { nb: a.nb, saved: a.nb.cells };
  if (a.type === 'saved') return { ...st, saved: a.cells };
  const nb = st.nb;
  if (!nb) return st;
  const bump = (cells: Cell[]): DocState => ({ ...st, nb: { ...nb, cells } });
  switch (a.type) {
    case 'edit':
      return mapCell(st, a.id, (c) => (c.source === a.source ? null : { ...c, source: a.source }));
    case 'retype':
      return mapCell(st, a.id, (c) => (c.type === a.to ? null : { ...c, type: a.to, outputs: [], count: null, run: undefined }));
    case 'insert': {
      const cells = nb.cells.slice();
      cells.splice(Math.max(0, Math.min(a.at, cells.length)), 0, a.cell);
      return bump(cells);
    }
    case 'insertMany': {
      if (!a.cells.length) return st;
      const cells = nb.cells.slice();
      cells.splice(Math.max(0, Math.min(a.at, cells.length)), 0, ...a.cells);
      return bump(cells);
    }
    case 'remove':
      return bump(nb.cells.filter((c) => c.id !== a.id));
    case 'removeMany': {
      const ids = new Set(a.ids);
      return ids.size ? bump(nb.cells.filter((c) => !ids.has(c.id))) : st;
    }
    case 'split': {
      const i = nb.cells.findIndex((c) => c.id === a.id);
      const parts = i < 0 ? null : splitCell(nb.cells[i], a.at, a.newId);
      if (!parts) return st;
      const cells = nb.cells.slice();
      cells.splice(i, 1, ...parts);
      return bump(cells);
    }
    case 'merge': {
      const picked = nb.cells.filter((c) => a.ids.includes(c.id));
      const first = nb.cells.findIndex((c) => c.id === picked[0]?.id);
      if (picked.length < 2 || first < 0) return st;
      const cells = nb.cells.filter((c) => !a.ids.includes(c.id) || c.id === picked[0].id);
      cells[cells.findIndex((c) => c.id === picked[0].id)] = mergeCells(picked);
      return bump(cells);
    }
    case 'fold':
      return mapCell(st, a.id, (c) => (c.type !== 'code' || outputsFolded(c) === a.folded ? null : { ...c, raw: withFolded(c.raw, a.folded) }));
    case 'move': {
      const i = nb.cells.findIndex((c) => c.id === a.id);
      const j = i + a.by;
      if (i < 0 || j < 0 || j >= nb.cells.length) return st;
      const cells = nb.cells.slice();
      [cells[i], cells[j]] = [cells[j], cells[i]];
      return bump(cells);
    }
    case 'clear': {
      const ids = a.ids && new Set(a.ids);
      const cells = nb.cells.map((c) => (c.type !== 'code' || (ids && !ids.has(c.id)) || (!c.outputs.length && c.count == null) ? c : { ...c, outputs: [], count: null }));
      return cells.some((c, i) => c !== nb.cells[i]) ? bump(cells) : st;
    }
    case 'sent': {
      const ids = new Set(a.ids);
      return bump(
        nb.cells.map((c) => (ids.has(c.id) ? { ...c, outputs: [], count: null, run: { seq: c.run?.seq ?? 0, state: 'queued', sent: true, prev: c.run?.prev ?? c } } : c)),
      );
    }
    case 'unsent': {
      const ids = new Set(a.ids);
      return bump(nb.cells.map((c) => (ids.has(c.id) && c.run?.sent && c.run.prev ? c.run.prev : c)));
    }
    case 'kernel':
      return applyOp(st, a.op, a.since);
  }
}

// ---- cells as a group: what Copy, Cut, Paste, Duplicate, Split, Merge and Run above / below do ------------------

/** A cell as the clipboard keeps it: its type, text, outputs and the rest as read (no id: a paste makes its own). */
export interface ClipCell {
  type: CellType;
  source: string;
  outputs: NbOutput[];
  count: number | null;
  raw: Json;
}

/** The cells as copied: copies, so changing the originals changes nothing in them. */
export const copyCells = (cells: Cell[]): ClipCell[] => cells.map((c) => structuredClone({ type: c.type, source: c.source, outputs: c.outputs, count: c.count, raw: c.raw }));

/** The copied cells as new cells, each with an id of its own (what they ran is not carried over). */
export const pasteCells = (clip: ClipCell[]): Cell[] =>
  clip.map((c) => {
    const copy = structuredClone(c);
    return { id: newCellId(), type: copy.type, source: copy.source, outputs: copy.outputs, count: copy.count, raw: { ...copy.raw, metadata: copy.raw.metadata ?? {} } };
  });

/**
 * Where a run starts and ends among the cells: 'above' the one given (every cell before it), 'below' (every cell after
 * it), or 'from' it (it and every cell after it). The ids of the code cells in that range, in order; none when the cell is not there.
 */
export function cellsToRun(cells: Cell[], id: string, how: 'above' | 'below' | 'from'): string[] {
  const i = cells.findIndex((c) => c.id === id);
  if (i < 0) return [];
  const range = how === 'above' ? cells.slice(0, i) : how === 'below' ? cells.slice(i + 1) : cells.slice(i);
  return range.filter((c) => c.type === 'code').map((c) => c.id);
}

/**
 * A cell made two at `at` characters into its text: the first keeps its id, type and what it was, with the words before
 * the cut; the second is a new cell of the same type with the rest (a line break at the cut goes). Both lose their outputs,
 * which belonged to the whole. Null when the cut is at the very start or end, or leaves one side with only blanks.
 */
export function splitCell(c: Cell, at: number, newId: string): [Cell, Cell] | null {
  const head = c.source.slice(0, at).replace(/\s+$/, '');
  const tail = c.source.slice(at).replace(/^\s*\n/, '');
  if (at <= 0 || at >= c.source.length || !head.trim() || !tail.trim()) return null;
  const first: Cell = { ...c, source: head, outputs: [], count: null, run: undefined };
  const second: Cell = { id: newId, type: c.type, source: tail, outputs: [], count: null, raw: { metadata: structuredClone(c.raw.metadata ?? {}) } };
  return [first, second];
}

/** Cells made one: the first's id, type and metadata, the texts one after another with a blank line between; no outputs. */
export function mergeCells(cells: Cell[]): Cell {
  const [first] = cells;
  return { ...first, source: cells.map((c) => c.source).join('\n\n'), outputs: [], count: null, run: undefined };
}

/** Whether a code cell's output is folded away (Jupyter keeps it as `jupyter.outputs_hidden`). */
export const outputsFolded = (c: Cell): boolean => c.raw.metadata?.jupyter?.outputs_hidden === true;

/** A cell's raw fields with its output folded or shown, the rest of its metadata as it was. */
export function withFolded(raw: Json, folded: boolean): Json {
  const metadata: Json = { ...(raw.metadata ?? {}) };
  const jupyter: Json = { ...(metadata.jupyter ?? {}) };
  if (folded) jupyter.outputs_hidden = true;
  else delete jupyter.outputs_hidden;
  if (Object.keys(jupyter).length) metadata.jupyter = jupyter;
  else delete metadata.jupyter;
  return { ...raw, metadata };
}

/** A heading in a text cell: its cell, its level (1 to 6), its words, and its line in the cell. */
export interface Heading {
  id: string;
  level: number;
  text: string;
  line: number;
}

/** The Markdown headings of the text cells (# and ##, not those in code fences), in the order they come. */
export function outlineOf(cells: Cell[]): Heading[] {
  const out: Heading[] = [];
  for (const c of cells) {
    if (c.type !== 'markdown') continue;
    let fence = '';
    c.source.split('\n').forEach((line, i) => {
      const f = /^\s*(```+|~~~+)/.exec(line);
      if (f) fence = fence ? (line.trim().startsWith(fence[0]) ? '' : fence) : f[1][0].repeat(3);
      if (fence) return;
      const m = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
      if (m) out.push({ id: c.id, level: m[1].length, text: m[2].replace(/[*_`]/g, '').trim(), line: i + 1 });
    });
  }
  return out;
}
