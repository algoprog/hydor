// A spreadsheet while an agent's save_sheet call streams in (page-drafts.ts says what drafts are for). Each sheet
// finished shows as it will be (one that holds what the version's sheet of its id or name held is that sheet itself);
// the one being written shows its rows and cells as far as they have come, over the version's sheet: its cells the
// call has not reached yet stay as they were (those it has passed are what it wrote), and its widths, merges, rules
// and charts stay until the call says otherwise. The version's other sheets follow. A call that changes some cells
// (update) shows them made on the version's sheets as they come.
import { applyBookEdits, sheetNamed, updatesSheets } from './sheet-edits.ts';
import type { JsonPath, PartialJson } from './partial-json.ts';
import { writingIn, type DraftMemo, type Drafted } from './page-drafts.ts';
import { normalizeBook, parseRef, refName, type Sheet, type Workbook } from './sheets.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** One sheet as the workbook keeps it, checked as a workbook's are. */
function one(raw: unknown): Sheet | null {
  try {
    return normalizeBook({ sheets: [raw] }).sheets[0] ?? null;
  } catch {
    return null;
  }
}

/** A finished sheet: the version's own when it holds the same, else the one made last time for the same words. */
function finished(raw: unknown, was: Sheet | undefined, memo: DraftMemo): Sheet | null {
  if (was && raw === was) return was;
  return memo.make(`sheet:${JSON.stringify(raw)}`, () => {
    const s = one(raw);
    return s && was && JSON.stringify({ ...s, id: was.id }) === JSON.stringify(was) ? was : s;
  });
}

/**
 * Where the words being written have come to in a sheet (`rest`: where the text stopped inside it): the cell, and
 * which of the version's cells it has passed (in rows, those above it and before it on its row; by name, none).
 */
function reached(raw: Obj, rest: JsonPath): { cell: string; passed: (r: number, c: number) => boolean } | null {
  const at = typeof raw.start === 'string' ? parseRef(raw.start) : null;
  const r0 = at?.r ?? 0;
  const c0 = at?.c ?? 0;
  const field = rest[0];
  if (field === 'rows' || field === 'data' || field === 'values') {
    const list = Array.isArray(raw[field]) ? (raw[field] as unknown[]) : [];
    const ri = typeof rest[1] === 'number' ? rest[1] : list.length;
    const ci = typeof rest[2] === 'number' ? rest[2] : -1;
    const R = r0 + ri;
    const C = ci >= 0 ? c0 + ci : c0 - 1;
    return { cell: refName(R, Math.max(C, c0)), passed: (r, c) => r < R || (r === R && c <= C) };
  }
  if (field === 'cells' && typeof rest[1] === 'string' && parseRef(rest[1])) return { cell: rest[1].trim().toUpperCase().replace(/\$/g, ''), passed: () => false };
  return null;
}

/**
 * The sheet being written (`raw`, as far as it has come; `rest`: where its text stopped) over the version's sheet it
 * writes again (`was`, none for a new one); and the cell its words are arriving in.
 */
function writing(raw0: Obj, rest: JsonPath, was: Sheet | undefined, patch: boolean, inString = false): { sheet: Sheet; cell?: string } | null {
  let raw = raw0;
  // A formula still being typed shows as its words, as a cell being typed in does (not as the error it is so far).
  const f = rest[0];
  if (inString && (f === 'rows' || f === 'data' || f === 'values') && typeof rest[1] === 'number' && typeof rest[2] === 'number' && Array.isArray(raw[f])) {
    const rows = (raw[f] as unknown[]).slice();
    const row = Array.isArray(rows[rest[1]]) ? (rows[rest[1]] as unknown[]).slice() : null;
    if (row && typeof row[rest[2]] === 'string' && (row[rest[2]] as string).startsWith('=')) {
      row[rest[2]] = `'${row[rest[2]]}`;
      rows[rest[1]] = row;
      raw = { ...raw, [f]: rows };
    }
  } else if (inString && f === 'cells' && typeof rest[1] === 'string' && isObj(raw.cells) && typeof raw.cells[rest[1]] === 'string' && (raw.cells[rest[1]] as string).startsWith('='))
    raw = { ...raw, cells: { ...raw.cells, [rest[1]]: `'${raw.cells[rest[1]]}` } };
  const r = reached(raw, rest);
  if (!was) {
    const s = one(raw);
    return s ? { sheet: s, cell: r?.cell } : null;
  }
  // A whole sheet written again: the version's cells it has not reached yet stay; a change on top of a sheet keeps them all.
  let base: Sheet = was;
  if (!patch) {
    const inRows = !!r && rest[0] !== 'cells';
    const cells: Sheet['cells'] = {};
    if (r || rest[0] === 'cells')
      for (const [k, cell] of Object.entries(was.cells)) {
        const p = parseRef(k);
        if (p && !(inRows && r!.passed(p.r, p.c))) cells[k] = cell;
      }
    base = { ...was, cells };
  }
  const s = one({ ...raw, id: was.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : was.name, base });
  if (!s) return { sheet: was };
  // Until the call says how its cells look (its formats and styles come after its rows), what it writes over a cell
  // keeps that cell's look: only the words change.
  if (!('formats' in raw) && !('format' in raw) && !('styles' in raw))
    for (const [k, cell] of Object.entries(s.cells)) {
      const old = was.cells[k];
      if (old?.s && !cell.s) s.cells[k] = { ...cell, s: old.s };
    }
  return { sheet: s, cell: r?.cell };
}

/**
 * The workbook a save_sheet call (as far as it has come, `p`) is writing, over the version open now (`base`; none for
 * a new spreadsheet): null while it says nothing of its sheets yet.
 */
export function draftBook(base: Workbook | null, p: PartialJson, memo: DraftMemo): Drafted<Workbook> | null {
  const v = isObj(p.value) ? p.value : {};
  const done = (sheets: Sheet[], mark: Drafted<Workbook>['mark']): Drafted<Workbook> | null => {
    memo.turn();
    if (!sheets.length) return base ? { model: base, mark: null } : null;
    return { model: { v: 1, sheets }, mark };
  };
  // Some cells changed: on the version's sheets as they come.
  if (base && updatesSheets(v)) {
    const { sheets: raws, at } = applyBookEdits(base, v.update as unknown[]);
    const o = p.open;
    const openUpdate = o && o[0] === 'update' && typeof o[1] === 'number' ? (o[1] as number) : -1;
    const openAt = openUpdate >= 0 ? at.get(openUpdate) : undefined;
    const sheets: Sheet[] = [];
    let mark: Drafted<Workbook>['mark'] = null;
    raws.forEach((raw, i) => {
      const was = base.sheets[i];
      if (i === openAt && isObj(raw)) {
        const { base: under, ...patch } = raw;
        const w = writing(patch, o!.slice(2), isObj(under) ? (under as unknown as Sheet) : was, true, p.inString);
        if (w) {
          sheets.push(w.sheet);
          if (w.cell) mark = { kind: 'sheet', sheet: w.sheet.id, cell: w.cell };
        }
        return;
      }
      const s = finished(raw, raw === was ? was : undefined, memo);
      if (s) sheets.push(s);
    });
    return done(sheets, mark);
  }
  if (!Array.isArray(v.sheets)) return base ? { model: base, mark: null } : null;
  const list = v.sheets as unknown[];
  const inSheets = writingIn(p.open, 'sheets');
  const openIdx = inSheets && typeof p.open![1] === 'number' ? (p.open![1] as number) : -1;
  const sheets: Sheet[] = [];
  const used = new Set<string>();
  let k = 0;
  let matched = false;
  let mark: Drafted<Workbook>['mark'] = null;
  list.forEach((raw, i) => {
    const r = isObj(raw) ? raw : {};
    const was = base ? (typeof r.id === 'string' && base.sheets.find((x) => x.id === r.id)) || (typeof r.name === 'string' ? (sheetNamed(base, r.name) ?? undefined) : undefined) || undefined : undefined;
    if (was && !used.has(was.id)) {
      used.add(was.id);
      matched = true;
      k = Math.max(k, base!.sheets.indexOf(was) + 1);
    }
    if (i === openIdx) {
      const w = writing(r, p.open!.slice(2), was, false, p.inString);
      if (w) {
        sheets.push(w.sheet);
        if (w.cell) mark = { kind: 'sheet', sheet: w.sheet.id, cell: w.cell };
      }
      return;
    }
    const s = finished(was ? { ...r, id: was.id } : raw, was, memo);
    if (s) sheets.push(s);
  });
  if (base && inSheets) for (const s of base.sheets.slice(matched ? k : list.length)) if (!used.has(s.id)) sheets.push(s);
  return done(sheets, mark);
}
