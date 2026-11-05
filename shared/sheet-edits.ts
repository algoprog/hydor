// Changes to some cells of a saved spreadsheet, made without sending the whole workbook (save_sheet's update): each
// names a sheet (by its name or id; the first when left out) and gives what goes on top of it, in the same words as a
// whole sheet (rows from A1 or from start, cells by name, formats, styles, widths, merges, charts…); what it does not
// give stays as it is, and a cell given null is emptied. A sheet named that is not there is added. They make the whole
// workbook's sheets, which the server then saves as it saves a whole workbook sent back; a draft makes them as the call
// comes in (page-drafts.ts), the cells being written shown as far as they have come. A value written over a cell keeps
// the cell's look and note: only its words change.
import { cleanCell, mergeStyle, normalizeBook, parseRef, refName, type Sheet, type Workbook } from './sheets.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether a call changes some sheets rather than sending the whole workbook. */
export const updatesSheets = (v: Obj) => Array.isArray(v.update);

/** The sheet an update names: by id, else by name in any case, else the first when it names none. */
export function sheetNamed(base: Workbook, ref: unknown): Sheet | null {
  if (ref === undefined || ref === null || ref === '') return base.sheets[0] ?? null;
  const s = String(ref).trim();
  return base.sheets.find((x) => x.id === s) ?? base.sheets.find((x) => x.name.toLowerCase() === s.toLowerCase()) ?? null;
}

export interface BookEditsOut {
  /** The workbook's sheets as they then are: kept ones as they were, updated ones on top of what they had. */
  sheets: unknown[];
  /** Where each update's sheet is, by the update's place in the list. */
  at: Map<number, number>;
}

/**
 * An update's cells over its sheet's own (`under`), in its rows (from A1 or start) and by name: a value written over a
 * cell keeps the cell's look and note (only its words change), a cell given as an object keeps what it leaves out, and
 * null empties it. Cells where the sheet has none are left as given.
 */
export function cellsOver(under: Sheet, patch: Obj): Obj {
  const over = (ref: string, x: unknown): unknown => {
    const old = under.cells[ref];
    if (!old || x === null || x === undefined) return x;
    const n = cleanCell(x, !isObj(x));
    const words = n && (n.v !== undefined || n.f !== undefined) ? n : isObj(x) ? old : null;
    const out: Obj = {};
    if (words?.f !== undefined) out.f = words.f;
    else if (words?.v !== undefined) out.v = words.v;
    const s = n?.s ? mergeStyle(old.s, n.s) : old.s;
    if (s) out.s = s;
    const note = isObj(x) && ('note' in x || 'comment' in x) ? n?.note : old.note;
    if (note) out.note = note;
    return out;
  };
  const out: Obj = { ...patch };
  const at = typeof patch.start === 'string' ? parseRef(patch.start) : null;
  const [r0, c0] = at ? [at.r, at.c] : [0, 0];
  const field = (['rows', 'data', 'values'] as const).find((k) => Array.isArray(patch[k]));
  if (field)
    out[field] = (patch[field] as unknown[]).map((row, ri) => {
      if (Array.isArray(row)) return row.map((x, ci) => over(refName(r0 + ri, c0 + ci), x));
      // A row given as one value: its first cell (kept a row, as a cell given as an object would not be).
      if (row !== null && row !== undefined && !isObj(row)) {
        const x = over(refName(r0 + ri, c0), row);
        return isObj(x) ? [x] : x;
      }
      return row;
    });
  if (isObj(patch.cells))
    out.cells = Object.fromEntries(
      Object.entries(patch.cells).map(([k, x]) => {
        const p = parseRef(k);
        return [k, p ? over(refName(p.r, p.c), x) : x];
      }),
    );
  return out;
}

/** One sheet as the workbook keeps it (null when it cannot be). */
function made(raw: unknown): Sheet | null {
  try {
    return normalizeBook({ sheets: [raw] }).sheets[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The sheets of `base` with a call's updates on top, in order (two updates of one sheet go on top of each other, a sheet
 * one of them added too). `open`: the update a draft is still writing, left as it came (the draft puts it on top itself).
 */
export function applyBookEdits(base: Workbook, updates: unknown[], o: { open?: number } = {}): BookEditsOut {
  const sheets: unknown[] = base.sheets.slice();
  const at = new Map<number, number>();
  // Sheets an update added, by name in any case: where they are.
  const added = new Map<string, number>();
  updates.forEach((u, i) => {
    if (!isObj(u)) return;
    const { sheet: ref, ...patch } = u;
    const was = sheetNamed(base, ref);
    const name = typeof ref === 'string' && ref.trim() ? ref.trim() : undefined;
    const k = was ? base.sheets.indexOf(was) : name !== undefined ? added.get(name.toLowerCase()) : undefined;
    if (k === undefined) {
      // A sheet it names that is not there: a new one, at the end.
      at.set(i, sheets.length);
      if (name !== undefined) added.set(name.toLowerCase(), sheets.length);
      sheets.push({ name, ...patch });
      return;
    }
    const cur = sheets[k];
    // On top of what it had: the sheet as kept, or as an earlier update left it (made whole first: a base is a kept sheet).
    const under = cur === was ? was : (made(cur) ?? was);
    if (!under) return;
    const own = typeof patch.name === 'string' && patch.name.trim() ? patch.name : under.name;
    sheets[k] = { ...(i === o.open ? patch : cellsOver(under, patch)), id: under.id, name: own, base: under };
    at.set(i, k);
  });
  return { sheets, at };
}

/** For the agent: what save_sheet's update is and how to write it. */
export const SHEET_EDITS_HELP =
  'To change some cells of a saved spreadsheet without sending all of it, give its id and update instead of sheets: [{"sheet": "Budget" (its name or id; the first sheet when left out), "cells": {"B7": 1250, "C7": "=B7*12"}, or "rows" from "start": "A20" (a value null empties a cell), and any of a sheet’s other fields: formats, styles, widths, merges, charts…}]; what you leave out stays as it is (a value written over a cell keeps its format and note), and a sheet named that is not there is added. The user watches each save come in: fill a big sheet in steps, some rows at a time, rather than in one long call.';
