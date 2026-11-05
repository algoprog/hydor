// What the fill handle puts in the cells it is dragged over, as Excel and Google Sheets fill them: cells that make a
// series go on with it (1, 2, 3…; 5, 10, 15; dates by day, or by month or year when the cells step so; Monday,
// Tuesday…; Jan, Feb…; "Item 1", "Item 2"…), one number is copied (Ctrl makes it a series, and Ctrl copies a series
// instead), formulas move along as copied ones do, and every cell's look comes along. Dragged up or left, a series
// runs backwards.
import { dateSerial, isDateFmt, refName, serialParts, shiftFormula, type Calc, type Cell, type Rect, type Sheet } from '@shared/sheets';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** A word of a named cycle (a weekday or a month, whole or in three letters) and its place in it, keeping how it was written. */
function cycleOf(v: unknown): { list: string[]; i: number; short: boolean; caps: 'upper' | 'title' | 'lower' } | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const low = t.toLowerCase();
  for (const list of [DAYS, MONTHS]) {
    let i = list.indexOf(low);
    let short = false;
    if (i < 0 && low.length === 3) {
      i = list.findIndex((x) => x.slice(0, 3) === low);
      short = i >= 0;
    }
    if (i >= 0) return { list, i, short, caps: t === t.toUpperCase() ? 'upper' : t[0] === t[0].toUpperCase() ? 'title' : 'lower' };
  }
  return null;
}

const written = (list: string[], i: number, short: boolean, caps: 'upper' | 'title' | 'lower') => {
  const w = list[((i % list.length) + list.length) % list.length];
  const s = short ? w.slice(0, 3) : w;
  return caps === 'upper' ? s.toUpperCase() : caps === 'title' ? s[0].toUpperCase() + s.slice(1) : s;
};

/** Words ending in a number ("Item 7", "Q3"): the words and the number. */
const numbered = (v: unknown) => (typeof v === 'string' ? /^(.*?)(\d{1,12})$/.exec(v) : null);

/** A step that fits evenly spaced numbers, or null when they are not. */
function evenStep(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const step = xs[1] - xs[0];
  for (let i = 2; i < xs.length; i++) if (Math.abs(xs[i] - xs[i - 1] - step) > 1e-9 * Math.max(1, Math.abs(step))) return null;
  return step;
}

/** A date `n` months on (the day kept, or the month's last when it has fewer). */
function addMonths(serial: number, n: number): number {
  const p = serialParts(serial);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return dateSerial(y, m, Math.min(p.d, last)) + (serial - Math.floor(serial));
}

/**
 * The values a line of source cells goes on with, `n` further along (negative: before the first). Each source is
 * what the cell holds; formulas are left to the caller (they are copied, moved along).
 */
function continued(src: Cell[], k: number, ctrl: boolean): Cell | null {
  const n = src.length;
  const base = src[((k % n) + n) % n];
  const plainNums = src.every((c) => c.f === undefined && typeof c.v === 'number');
  if (plainNums) {
    const xs = src.map((c) => c.v as number);
    const dates = src.every((c) => isDateFmt(c.s?.fmt) || !!c.s?.code?.match(/[dy]/i));
    // One number is copied (Ctrl: a series by 1); several make a series (Ctrl: copied), dates by day, month or year.
    const asSeries = n === 1 ? ctrl || dates : !ctrl;
    if (asSeries) {
      const last = xs[n - 1];
      const ahead = k - (n - 1);
      if (dates && n >= 2) {
        const ps = xs.map((x) => serialParts(x));
        const sameDay = ps.every((p) => p.d === ps[0].d);
        const months = ps.map((p) => p.y * 12 + p.m - 1);
        const mStep = evenStep(months);
        // The same day of the month each time: a step of months (or years, twelve at a time).
        if (sameDay && mStep) return { ...base, v: addMonths(last, mStep * ahead) };
      }
      const step = n === 1 ? 1 : (evenStep(xs) ?? (xs[n - 1] - xs[0]) / (n - 1));
      return { ...base, v: Math.round((last + step * ahead) * 1e10) / 1e10 };
    }
    return { ...base };
  }
  // Weekdays and months go round.
  const cyc = src.map((c) => (c.f === undefined ? cycleOf(c.v) : null));
  if (cyc.every((x) => x && x.list === cyc[0]!.list)) {
    const idx = cyc.map((x) => x!.i);
    const step = n === 1 ? 1 : (evenStep(idx) ?? 1);
    const first = cyc[0]!;
    return { ...base, v: written(first.list, idx[n - 1] + step * (k - (n - 1)), first.short, first.caps) };
  }
  // Words ending in a number: the number goes on, the words stay ("Item 1", "Item 2").
  const nums = src.map((c) => (c.f === undefined ? numbered(c.v) : null));
  if (nums.every((m) => m && m[1] === nums[0]![1])) {
    const xs = nums.map((m) => Number(m![2]));
    const step = n === 1 ? 1 : (evenStep(xs) ?? 1);
    const at = xs[n - 1] + step * (k - (n - 1));
    if (at >= 0) {
      const width = nums[0]![2].startsWith('0') ? nums[0]![2].length : 0;
      return { ...base, v: `${nums[0]![1]}${String(at).padStart(width, '0')}` };
    }
  }
  return { ...base };
}

/**
 * The cells a fill over `target` puts in, from the source block `src` it was dragged from (target holds src and
 * grows from it in one direction). `ctrl`: the other way round for numbers (a series of one, a copy of several).
 */
export function fillSeries(sh: Sheet, src: Rect, target: Rect, ctrl: boolean): Record<string, Cell | null> {
  const out: Record<string, Cell | null> = {};
  const down = target.r2 > src.r2;
  const up = target.r1 < src.r1;
  const right = target.c2 > src.c2;
  const left = target.c1 < src.c1;
  const vertical = down || up;
  if (!down && !up && !right && !left) return out;
  const lines = vertical ? [src.c1, src.c2] : [src.r1, src.r2];
  for (let line = lines[0]; line <= lines[1]; line++) {
    const cellsOf: { cell: Cell; r: number; c: number }[] = [];
    const len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
    for (let i = 0; i < len; i++) {
      const r = vertical ? src.r1 + i : line;
      const c = vertical ? line : src.c1 + i;
      cellsOf.push({ cell: sh.cells[refName(r, c)] ?? {}, r, c });
    }
    const src1 = cellsOf.map((x) => x.cell);
    const from = vertical ? (down ? src.r2 + 1 : target.r1) : right ? src.c2 + 1 : target.c1;
    const to = vertical ? (down ? target.r2 : src.r1 - 1) : right ? target.c2 : src.c1 - 1;
    for (let p = from; p <= to; p++) {
      // k: how far along the series the cell is, from the first source cell (negative before it).
      const k = vertical ? p - src.r1 : p - src.c1;
      const r = vertical ? p : line;
      const c = vertical ? line : p;
      const n = src1.length;
      const j = ((k % n) + n) % n;
      const model = src1[j];
      let next: Cell | null;
      if (model.f !== undefined) {
        // A formula moves along as a copy of the source cell it repeats.
        const sr = vertical ? src.r1 + j : line;
        const sc = vertical ? line : src.c1 + j;
        next = { ...model, f: shiftFormula(model.f, r - sr, c - sc) };
      } else if (src1.every((x) => x.v === undefined && x.f === undefined)) next = model.s || model.note ? { ...(model.s ? { s: model.s } : {}) } : null;
      else next = continued(src1, k, ctrl);
      if (next) delete next.note;
      out[refName(r, c)] = next && (next.v !== undefined || next.f !== undefined || next.s) ? next : null;
    }
  }
  return out;
}

/** How far down a double click on the fill handle fills: as far as the column beside the selection holds data. */
export function fillDownTo(sh: Sheet, calc: Calc, si: number, x: Rect): number {
  const e = calc.extent(si);
  const filled = (r: number, c: number) => {
    const cell = sh.cells[refName(r, c)];
    return !!cell && (cell.v !== undefined || cell.f !== undefined);
  };
  for (const c of [x.c1 - 1, x.c2 + 1]) {
    if (c < 0 || !filled(x.r2 + 1, c)) continue;
    let r = x.r2 + 1;
    while (r + 1 < e.rows && filled(r + 1, c)) r++;
    return r;
  }
  return x.r2;
}
