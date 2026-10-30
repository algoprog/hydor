// Notebook documents: reading and writing .ipynb (nbformat 4), and every change a notebook page
// makes, including outputs arriving from the kernel. Writing follows nbformat's own layout (sorted
// keys, one-space indent, multi-line strings as line lists) and carries over the fields this page
// does not edit, so a save changes only what changed.
import type { CellRun, KernelOp, NbOutput, RunState } from '@shared/types';
import { appendOutput } from '@shared/notebook';

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

const CELL_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function newCellId(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const newCell = (type: CellType): Cell => ({ id: newCellId(), type, source: '', outputs: [], count: null, raw: { metadata: {} } });

const joinLines = (v: unknown): string => (Array.isArray(v) ? v.map(String).join('') : typeof v === 'string' ? v : '');

/** Python's str.splitlines(keepends=True), which nbformat uses for multi-line strings. */
export function splitLines(s: string): string[] {
  const out: string[] = [];
  const re = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/g;
  let at = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(s)); ) {
    out.push(s.slice(at, re.lastIndex));
    at = re.lastIndex;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}

const splitMime = (mime: string) => mime.startsWith('text/') || mime === 'application/javascript' || mime === 'image/svg+xml';

function readOutput(o: Json): NbOutput {
  const out = { ...o } as NbOutput;
  if (o.output_type === 'stream') out.text = joinLines(o.text);
  if (o.data && typeof o.data === 'object') out.data = Object.fromEntries(Object.entries(o.data).map(([k, v]) => [k, Array.isArray(v) && !k.includes('json') ? joinLines(v) : v]));
  return out;
}

function writeOutput(o: NbOutput): Json {
  const { transient: _transient, ...out } = o as Json;
  if (out.output_type === 'stream') out.text = splitLines(out.text ?? '');
  if (out.data) out.data = Object.fromEntries(Object.entries(out.data as Json).map(([k, v]) => [k, typeof v === 'string' && splitMime(k) ? splitLines(v) : v]));
  if (out.output_type === 'display_data' || out.output_type === 'execute_result') out.metadata ??= {};
  return out;
}

export function parseNotebook(text: string): Notebook {
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

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Json)[k])]));
  return v;
}

/** The notebook as nbformat writes it. Cell ids need format 4.5, so older notebooks are upgraded. */
export function serializeNotebook(nb: Notebook): string {
  const cells = nb.cells.map((c) => {
    const out: Json = { ...c.raw, id: c.id, cell_type: c.type, metadata: c.raw.metadata ?? {}, source: splitLines(c.source) };
    if (c.type === 'code') {
      out.outputs = c.outputs.map(writeOutput);
      out.execution_count = c.count ?? null;
      delete out.attachments;
    } else {
      delete out.outputs;
      delete out.execution_count;
    }
    return out;
  });
  return JSON.stringify(sortKeys({ ...nb.rest, cells, metadata: nb.metadata, nbformat: 4, nbformat_minor: Math.max(nb.minor, 5) }), null, 1) + '\n';
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
  | { type: 'remove'; id: string }
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
    case 'remove':
      return bump(nb.cells.filter((c) => c.id !== a.id));
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
