// Changes to some cells of a saved spreadsheet, made without sending the whole workbook (save_sheet's update): each
// names a sheet (by its name or id; the first when left out) and gives what goes on top of it, in the same words as a
// whole sheet (rows from A1 or from start, cells by name, formats, styles, widths, merges, charts…); what it does not
// give stays as it is, and a cell given null is emptied. A sheet named that is not there is added. They make the whole
// workbook's sheets, which the server then saves as it saves a whole workbook sent back; a draft makes them as the call
// comes in (page-drafts.ts), the cells being written shown as far as they have come.
import { normalizeBook, type Sheet, type Workbook } from './sheets.ts';

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

/** The sheets of `base` with a call's updates on top, in order (two updates of one sheet go on top of each other). */
export function applyBookEdits(base: Workbook, updates: unknown[]): BookEditsOut {
  const sheets: unknown[] = base.sheets.slice();
  const at = new Map<number, number>();
  updates.forEach((u, i) => {
    if (!isObj(u)) return;
    const { sheet: ref, ...patch } = u;
    const was = sheetNamed(base, ref);
    if (!was) {
      // A sheet it names that is not there: a new one, at the end.
      at.set(i, sheets.length);
      sheets.push({ name: typeof ref === 'string' && ref.trim() ? ref.trim() : undefined, ...patch });
      return;
    }
    const k = base.sheets.indexOf(was);
    const cur = sheets[k];
    // On top of what it had: the sheet as kept, or as an earlier update left it (made whole first: a base is a kept sheet).
    let under: unknown = was;
    if (cur !== was)
      try {
        under = normalizeBook({ sheets: [cur] }).sheets[0];
      } catch {}
    sheets[k] = { ...patch, id: was.id, name: typeof patch.name === 'string' && patch.name.trim() ? patch.name : was.name, base: under };
    at.set(i, k);
  });
  return { sheets, at };
}

/** For the agent: what save_sheet's update is and how to write it. */
export const SHEET_EDITS_HELP =
  'To change some cells of a saved spreadsheet without sending all of it, give its id and update instead of sheets: [{"sheet": "Budget" (its name or id; the first sheet when left out), "cells": {"B7": 1250, "C7": "=B7*12"}, or "rows" from "start": "A20" (a value null empties a cell), and any of a sheet’s other fields: formats, styles, widths, merges, charts…}]; what you leave out stays as it is, and a sheet named that is not there is added. The user watches each save come in: fill a big sheet in steps, some rows at a time, rather than in one long call.';
