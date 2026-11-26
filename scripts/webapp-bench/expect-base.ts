// The kinds of thing, fields, rows and numbers a brief's plan (expect.json) is made of, as types, and the small calculations on them: days written as "$thisMonth:12"
// turned into real days, and the number a home page has to show worked out from the rows the judge adds. `checkPlan` reads a plan for mistakes (a number that does not
// move when rows are added, a reference to a row that does not exist), so a new brief is held to the same rules as the fourteen.
import { slug } from './lib.ts';

export type FieldKind = 'text' | 'long' | 'integer' | 'number' | 'money' | 'yesno' | 'day' | 'choice' | 'file' | 'ref';

export interface FieldSpec {
  /** The maker's name for it, which is how the judge talks about it. */
  id: string;
  /** Every spelling a builder may reasonably choose for the field's name. */
  names: string[];
  kind: FieldKind;
  /** Whether the maker said it has to be filled in. A yes/no is never required: it starts as no. */
  required: boolean;
  choices?: string[];
  /** For a reference: the id of the kind of thing it points to. */
  to?: string;
  /** For money: the currency the maker names. */
  currency?: string;
  /** For a file: the only kind the maker accepts ("image", "pdf") or "any". */
  file?: 'image' | 'pdf' | 'any';
}

export interface KindSpec {
  id: string;
  names: string[];
  fields: FieldSpec[];
}

export type Row = Record<string, unknown>;

export interface Where {
  field: string;
  eq?: string | number | boolean;
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
  empty?: boolean;
  thisMonth?: boolean;
}

export interface NumberSpec {
  id: string;
  of: string;
  agg: 'count' | 'sum' | 'avg';
  field?: string;
  where?: Where[];
  /** What the number means, in a few words, for the judge's sentences. */
  say: string;
  /** "money" for a sum written as an amount of money. */
  show?: 'money';
}

interface Common {
  id: string;
  /** The name the maker gave, as it must be read on the pages. */
  product: string;
  /** Things a visitor must be able to read, each a list of ways to say it (any one will do). */
  phrases: string[][];
}

export interface ToolExpect extends Common {
  kind: 'tool';
  /** "shared": everyone signed in sees all of it. "own": each person sees only their own. */
  access: 'shared' | 'own';
  kinds: KindSpec[];
  /** The first rows the judge adds, by kind, in the order of `kinds` (what a kind points to comes first). A reference is "@kind.index". */
  rows: Record<string, Row[]>;
  /** The rows added after the numbers were read once, so each number has to move. */
  later: Record<string, Row[]>;
  /** What a second person adds when each person sees only their own: it must never reach the first person's numbers. */
  theirs?: Record<string, Row[]>;
  numbers: NumberSpec[];
}

// ------------------------------------------------------------------------------------------------ days

const two = (n: number) => String(n).padStart(2, '0');
export const dayOf = (d: Date): string => `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
export const monthPrefix = (now: Date): string => dayOf(now).slice(0, 7);

/** "$today", "$today+9", "$thisMonth:12", "$lastMonth:20", "$nextMonth:3" as a day "YYYY-MM-DD" (in UTC); anything else as it is. */
export function resolveDay(value: unknown, now: Date): unknown {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  const today = /^\$today(?:\+(\d+))?$/.exec(value);
  if (today) return dayOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + Number(today[1] ?? 0))));
  const month = /^\$(thisMonth|lastMonth|nextMonth):(\d{1,2})$/.exec(value);
  if (month) {
    const shift = month[1] === 'thisMonth' ? 0 : month[1] === 'lastMonth' ? -1 : 1;
    return dayOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + shift, Number(month[2]))));
  }
  throw new Error(`a day written "${value}" is not one the judge knows`);
}

export const resolveRow = (row: Row, now: Date): Row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, resolveDay(v, now)]));

// ------------------------------------------------------------------------------------------------ the numbers

export function fieldOf(kind: KindSpec, id: string): FieldSpec | undefined {
  return kind.fields.find((f) => f.id === id);
}

function matches(row: Row, where: Where, kind: KindSpec, now: Date): boolean {
  const field = fieldOf(kind, where.field);
  let value = row[where.field];
  if (value === undefined && field?.kind === 'yesno') value = false;
  if (where.empty !== undefined) return (value === undefined || value === null || value === '') === where.empty;
  if (where.thisMonth !== undefined) return (typeof value === 'string' && value.startsWith(monthPrefix(now))) === where.thisMonth;
  if (where.eq !== undefined) return typeof where.eq === 'string' && typeof value === 'string' ? slug(value) === slug(where.eq) : value === where.eq;
  const n = typeof value === 'number' ? value : Number.NaN;
  if (where.lt !== undefined) return n < where.lt;
  if (where.lte !== undefined) return n <= where.lte;
  if (where.gt !== undefined) return n > where.gt;
  if (where.gte !== undefined) return n >= where.gte;
  return true;
}

/** The number a home page has to show for these rows (days already resolved): in the units the maker uses (money in pounds or euros, not cents). */
export function expectedNumber(spec: NumberSpec, kind: KindSpec, rows: Row[], now: Date): number {
  const chosen = rows.filter((row) => (spec.where ?? []).every((w) => matches(row, w, kind, now)));
  if (spec.agg === 'count') return chosen.length;
  const values = chosen.map((row) => row[spec.field!]).filter((v): v is number => typeof v === 'number');
  const sum = values.reduce((a, b) => a + b, 0);
  if (spec.agg === 'sum') return Math.round(sum * 100) / 100;
  return values.length === 0 ? 0 : sum / values.length;
}

// ------------------------------------------------------------------------------------------------ a plan read for mistakes

/** What is wrong with a tool brief's plan, in sentences; empty when it holds. The numbers must differ before and after the later rows, and from each other. */
export function checkPlan(expect: ToolExpect, now = new Date()): string[] {
  const problems: string[] = [];
  const kinds = new Map(expect.kinds.map((k) => [k.id, k]));
  const order = expect.kinds.map((k) => k.id);
  const seen: string[] = [];
  // rows are made kind by kind, in the order of `kinds`: a reference may point to any row of its kind that is already made
  const addRows = (rows: Record<string, Row[]>, label: string, made: Record<string, number>) => {
    for (const id of Object.keys(rows)) if (!kinds.has(id)) problems.push(`${label}: there are rows of "${id}", which is not a kind of this plan`);
    for (const id of order) {
      const kind = kinds.get(id)!;
      for (const [i, row] of (rows[id] ?? []).entries()) {
        for (const [field, value] of Object.entries(row)) {
          const spec = fieldOf(kind, field);
          if (!spec) {
            problems.push(`${label}: ${id} row ${i} has "${field}", which ${id} does not have`);
            continue;
          }
          if (spec.kind === 'ref') {
            const m = typeof value === 'string' ? /^@([\w-]+)\.(\d+)$/.exec(value) : null;
            if (!m || m[1] !== spec.to || Number(m[2]) >= (made[m[1]!] ?? 0)) problems.push(`${label}: ${id} row ${i}: ${JSON.stringify(value)} does not point to a ${spec.to} row that is made before it`);
          }
          if (spec.kind === 'choice' && !(spec.choices ?? []).some((c) => slug(c) === slug(String(value)))) problems.push(`${label}: ${id} row ${i}: "${value}" is not one of the choices of ${field}`);
        }
        for (const spec of kind.fields) if (spec.required && spec.kind !== 'yesno' && spec.kind !== 'file' && row[spec.id] === undefined) problems.push(`${label}: ${id} row ${i} leaves out ${spec.id}, which is required`);
        made[id] = (made[id] ?? 0) + 1;
      }
    }
  };
  const made: Record<string, number> = {};
  addRows(expect.rows, 'rows', made);
  addRows(expect.later, 'later', made);
  if (expect.access === 'own') {
    if (!expect.theirs) problems.push('access is "own", so the plan needs `theirs`: what a second person adds');
    else addRows(expect.theirs, 'theirs', {});
  }
  for (const spec of expect.numbers) {
    const kind = kinds.get(spec.of);
    if (!kind) {
      problems.push(`number ${spec.id}: the kind ${spec.of} is not in the plan`);
      continue;
    }
    for (const w of spec.where ?? []) if (!fieldOf(kind, w.field)) problems.push(`number ${spec.id}: ${spec.of} has no field ${w.field}`);
    if (spec.agg !== 'count' && !(spec.field && fieldOf(kind, spec.field))) problems.push(`number ${spec.id}: needs a field to ${spec.agg}`);
    const first = (expect.rows[spec.of] ?? []).map((r) => resolveRow(r, now));
    const both = [...first, ...(expect.later[spec.of] ?? []).map((r) => resolveRow(r, now))];
    const v0 = expectedNumber(spec, kind, first, now);
    const v1 = expectedNumber(spec, kind, both, now);
    if (Math.abs(v0 - v1) < 0.01) problems.push(`number ${spec.id} is ${v0} before and after the later rows: it would not show whether the page works it out`);
    seen.push(`${spec.id}:before:${v0}`, `${spec.id}:after:${v1}`);
  }
  const values = seen.map((s) => Number(s.split(':')[2]));
  const near = values.some((a, i) => values.some((b, j) => i !== j && Math.abs(a - b) < 0.5));
  if (near) problems.push(`two of the numbers (before or after) are the same or within a half of each other (${values.join(', ')}): one could be mistaken for the other on the page`);
  return problems;
}
