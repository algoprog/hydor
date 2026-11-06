// What the spreadsheet editor's AI helpers send and get back (server/write/sheets.ts), each a call to the helper model
// (Settings → Models) outside any session: the AI function's answers (=AI(prompt, cells…): many cells asked together,
// each kept by the key of what it asked), a formula written from words, a formula explained, a column filled from a few
// examples (Fill with AI, when no pattern of its own fits: see sheet-flash.ts), a table's questions answered with
// charts, pivot tables and formulas to put in, and a table made from words. And the line that says what they cost.
import type { CellValue } from './sheets.ts';

/** The most cells one call to /api/write/sheet-ai asks. */
export const AI_BATCH = 25;

export interface SheetAiAsk {
  key: string;
  prompt: string;
  /** The values of the cells given after the prompt, as words (a range as rows of tab-separated values). */
  context: string[];
}

export interface SheetAiAnswer {
  answers: Record<string, CellValue>;
  /** Asks the model gave no answer to, by key, with why. */
  failed?: Record<string, string>;
  model?: string;
}

/** What the AI helpers cost with the helper model picked now: its name, and a line that says so. */
export interface SheetAiCost {
  model: string;
  /** "Answered by Claude through Claude Code, part of your plan", "about $0.01 for 100 cells"… */
  note: string;
  /** Nothing to pay for it (a plan, or a model on this computer). */
  free: boolean;
}

/** The cells around the active one, as the editor sends them: rows of tab-separated values, each with its row number, under the columns' letters. */
export interface SheetContext {
  sheet: string;
  /** The active cell ("D2"). */
  at: string;
  /** "   | A | B | C\n1 | Item | Cost | Paid\n2 | …" */
  table: string;
  /** The workbook's other sheets and named ranges, to refer to. */
  sheets?: string[];
  names?: string[];
}

export interface FormulaAsk extends SheetContext {
  /** What the person wants, in their words: "total of column C where B is Paid". */
  ask: string;
}

export interface FormulaAnswer {
  /** With its "=". */
  formula: string;
  /** A line on what it does. */
  explain: string;
  model?: string;
}

export interface ExplainAsk extends SheetContext {
  formula: string;
}

export interface ExplainAnswer {
  text: string;
  model?: string;
}

/** Fill with AI: rows with what was typed in the column (examples), and rows to fill, each with the values beside it. */
export interface FillAsk {
  headers: string[];
  /** The column being filled's header, when it has one. */
  target?: string;
  examples: { inputs: string[]; output: string }[];
  rows: string[][];
}

export interface FillAnswer {
  outputs: (string | null)[];
  model?: string;
}

/** Something to put in from Analyze the data: a chart, a pivot table (a summary by a column), or a formula. */
export type AnalyzeIdea =
  | { kind: 'chart'; title: string; why?: string; chart: 'column' | 'bar' | 'line' | 'area' | 'pie' | 'scatter'; x: string; ys: string[] }
  | { kind: 'pivot'; title: string; why?: string; by: string; across?: string; values: { col: string; fn: 'sum' | 'count' | 'average' | 'min' | 'max' }[] }
  | { kind: 'formula'; title: string; why?: string; formula: string };

export interface AnalyzeAsk {
  question?: string;
  sheet: string;
  /** The table's range ("A1:F120"). */
  range: string;
  /** Its rows as the editor sends them (the first ones, when it is long), under the columns' letters. */
  table: string;
  /** Each column's letter, header and what it holds over all the rows: "number: 118 values, sum 10,420, from 3 to 940, mean 88.3". */
  columns: { letter: string; name: string; about: string }[];
}

export interface AnalyzeAnswer {
  answer: string;
  ideas: AnalyzeIdea[];
  model?: string;
}

export type TableColType = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'checkbox' | 'list' | 'rating';
export const TABLE_COL_TYPES: TableColType[] = ['text', 'number', 'currency', 'percent', 'date', 'checkbox', 'list', 'rating'];

export interface TableAnswer {
  title?: string;
  columns: { name: string; type: TableColType; options?: string[] }[];
  rows: (string | number | boolean | null)[][];
  model?: string;
}

/** The first JSON object in a model's answer (fences and words around it left out), or null. */
export function jsonIn(raw: string): Record<string, unknown> | null {
  const s = raw.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(s.slice(a, b + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** An answer as a cell keeps it: a number or TRUE/FALSE as they are, words tidied (quotes the model put round them left off). */
export function cellAnswer(v: unknown): CellValue | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ').slice(0, 5000);
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 5000);
  let s = String(v).replace(/\r\n?/g, '\n').trim();
  if (/^"[^"]*"$|^“[^”]*”$/.test(s)) s = s.slice(1, -1).trim();
  return s.slice(0, 5000);
}
