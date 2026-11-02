// Apps: reusable tasks with a form. What the server and the pages share: the recipe and its runs,
// filling the prompt from the form, the answer fields (their schema for submit_result and the check
// of what the agent hands in), and CSV in and out for runs over many rows.
import type { Agent } from './types.ts';
import { cleanData, cleanFlow, cleanFlows, cleanRequires, cleanScreens, type AppScreen, type DataCollection, type Flow, type NamedFlow, type Requires } from './app-manifest.ts';

export type FieldType = 'text' | 'long' | 'number' | 'date' | 'choice' | 'yesno' | 'file';

/** One question of an app's form; its answer fills {{id}} in the prompt. */
export interface AppField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** A line under the label. */
  help?: string;
  placeholder?: string;
  /** For a choice. */
  options?: string[];
  /** For a choice: more than one may be picked (the value has one per line). Forms MCP servers ask for. */
  multi?: boolean;
  /** What the form starts with (and what an API call without it gets). */
  default?: string;
}

export type AnswerType = 'text' | 'markdown' | 'number' | 'yesno' | 'date' | 'url' | 'list' | 'table';
export type ColumnType = 'text' | 'number' | 'yesno' | 'date' | 'url';

export interface AnswerColumn {
  id: string;
  label: string;
  type: ColumnType;
  description?: string;
}

/** One field of the structured result the agent hands in with submit_result. */
export interface AnswerField {
  id: string;
  label: string;
  type: AnswerType;
  description?: string;
  required?: boolean;
  /** For a table: its columns. */
  columns?: AnswerColumn[];
}

export interface AppLimits {
  /** Most runs a day, from anywhere (the form, the API, MCP, rows); none when unset. */
  runsPerDay?: number;
  /** Most one run may spend, in US dollars: the session's spending cap. */
  capUsd?: number;
}

/** The public page (/a/<slug>): anyone with the link fills the form and sees the answer. */
export interface PublicSettings {
  on: boolean;
  /** One of Custom's models: public runs always use Custom, with no shell and no file tools. */
  model?: string;
  /** Runs one visitor (by address) may start in an hour. */
  perIpPerHour: number;
  /** Public runs a day, all visitors together. */
  runsPerDay: number;
  /** Most all public runs may spend in a day, in US dollars. */
  spendPerDay: number;
  /** Public runs may search and read the web (public addresses only). */
  web: boolean;
}

/** What a public run with the web may use: web search and page reading, which reach public addresses only. */
export const PUBLIC_WEB_TOOLS = ['web_search', 'read_page'];

/** What a run follows: the task, its form and answer, and who does it with what. */
export interface AppRecipe {
  name: string;
  /** A name from APP_ICONS. */
  icon: string;
  /** A name from APP_COLORS. */
  color: string;
  description: string;
  category?: string;
  /** An assistant's id (Researcher, Writer…). */
  assistant?: string;
  agent: Agent;
  /** For agent "acp": which one; Custom's id is "console". */
  acpAgent?: string;
  model?: string;
  effort?: string;
  mode?: string;
  /** The folder runs work in; empty: a new folder for each run. */
  cwd?: string;
  /** The task, with {{field}} placeholders. */
  prompt: string;
  fields: AppField[];
  answer: AnswerField[];
  /** Tools of the session's own MCP server the runs may use (web search, browser…); null: all. */
  tools: string[] | null;
  limits: AppLimits;
  /**
   * What the app does, step by step (shared/app-manifest.ts). Without it, one agent step does the task in
   * `prompt`, with the agent settings above: the simplest app, and every template.
   */
  flow?: Flow;
  /** What it keeps between runs: collections of records its steps, agents and screens share. */
  data?: Record<string, DataCollection>;
  /** Its agents remember what later runs should know, in a memory of the app's own (Settings → Memory lists it as a project). */
  memory?: boolean;
  /** What it needs on this computer: packages installed in an environment of its own (server/apps/env.ts), commands that must be here. */
  requires?: Requires;
  /** More flows beside the main one, by name: what its screens (and programs) start, each with the inputs it takes. */
  flows?: Record<string, NamedFlow>;
  /** Its screens: pages of its own ("main" opens on its page), made with naget.app and the App parts. */
  screens?: Record<string, AppScreen>;
}

/** A built-in template: a recipe to run as it is, or to start an app from. */
export interface AppTemplate extends AppRecipe {
  id: string;
}

export interface AppDef extends AppRecipe {
  id: string;
  /** Its address: /a/<slug>, /api/apps/<slug>/run. */
  slug: string;
  /** Offered as a tool to other agents on the app's MCP server (/mcp). */
  mcp: boolean;
  public: PublicSettings;
  /** The template it started from. */
  template?: string;
  createdAt: number;
  updatedAt: number;
}

export type RunSource = 'web' | 'test' | 'api' | 'mcp' | 'public' | 'batch' | 'step' | 'app' | 'screen' | 'task';
export type RunStatus = 'queued' | 'starting' | 'running' | 'waiting' | 'done' | 'failed' | 'stopped';

export interface AppRun {
  id: string;
  /** The app's id, or "tpl:<id>" for a template run as it is. */
  app: string;
  appName: string;
  /** The session doing the work. */
  key?: string;
  source: RunSource;
  status: RunStatus;
  inputs: Record<string, string>;
  /** What the agent handed in with submit_result. */
  result?: Record<string, unknown> | null;
  /** The agent's last reply. */
  reply?: string;
  error?: string;
  /** Spent, in US dollars (an estimate where the agent does not report it). */
  costUsd?: number;
  agent?: Agent;
  model?: string;
  batch?: string;
  row?: number;
  /** The run this one is a step of (an agent step, or another app a step called). */
  parent?: string;
  /** Where in the parent's flow ("sum", "loop#2/read"). */
  step?: string;
  /** Which of its flows it ran, when not the main one. */
  flow?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export type StepStatus = 'running' | 'waiting' | 'done' | 'failed' | 'skipped' | 'stopped';

/** One step of a run with steps, as its page shows it. */
export interface RunStepView {
  /** Where in the flow: its id, inside a Repeat's round "loop#2/read". */
  path: string;
  id: string;
  /** Its kind of step, or "round" for a round of a Repeat. */
  kind: string;
  title: string;
  status: StepStatus;
  error?: string;
  costUsd?: number;
  /** The run behind an agent step or a call to another app, and its session. */
  run?: string;
  session?: string;
  startedAt?: number;
  endedAt?: number;
  /** What it gave (long values shortened). */
  values?: Record<string, unknown>;
  /** Taken over from the run it ran again from: what it gave then, not run again. */
  reused?: true;
}

/** How a run is getting on, for its page: the latest steps, and what it waits for. */
export interface RunProgress {
  steps: { title: string; status: 'running' | 'ok' | 'error' }[];
  /** The start of the latest thing the agent said. */
  said?: string;
  /** What it waits for (an approval, an answer). */
  waiting?: string;
}

/**
 * A follow-up in a run's session, sent after its task (from the run's page or the session itself):
 * what the person asked, what the agent said back, and whether it handed in a new result.
 */
export interface RunAsk {
  /** The message's timeline item. */
  id: string;
  text: string;
  at?: number;
  reply?: string;
  updated: boolean;
}

export interface AppBatch {
  id: string;
  app: string;
  status: 'running' | 'done' | 'stopped';
  total: number;
  done: number;
  failed: number;
  concurrency: number;
  /** The CSV's name. */
  name?: string;
  createdAt: number;
  endedAt?: number;
}

export const ACTIVE: RunStatus[] = ['queued', 'starting', 'running', 'waiting'];
export const isActive = (s: RunStatus) => ACTIVE.includes(s);

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'long', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Choice' },
  { value: 'yesno', label: 'Yes / no' },
  { value: 'file', label: 'File' },
];

export const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'markdown', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'yesno', label: 'Yes / no' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'Link' },
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
];

export const COLUMN_TYPES = ANSWER_TYPES.filter((t) => t.value !== 'markdown' && t.value !== 'list' && t.value !== 'table') as { value: ColumnType; label: string }[];

/** Icons an app can wear (lucide names; the pages draw them). */
export const APP_ICONS = [
  'sparkles', 'telescope', 'plane', 'scale', 'file-search', 'list-checks', 'mail', 'graduation-cap', 'newspaper', 'scroll-text',
  'app-window', 'pen-line', 'lightbulb', 'calendar', 'chart', 'code', 'globe', 'book-open', 'briefcase', 'heart',
  'shopping-cart', 'utensils', 'dumbbell', 'music', 'camera', 'map', 'message-square', 'languages', 'calculator', 'home', 'wrench', 'bot',
] as const;

/** The colours of an app's tile, readable in light and dark. */
export const APP_COLORS: Record<string, string> = {
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  pink: '#ec4899',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#d99a06',
  green: '#22a55e',
  teal: '#14b8a6',
  cyan: '#0ea5c6',
  slate: '#64748b',
};

/** Addresses the app's own routes use, which no app may take as its name. */
export const RESERVED_SLUGS = new Set(['runs', 'batches', 'tools', 'draft', 'models', 'new', 't', 'templates', 'run', 'test', 'check', 'install', 'export', 'data']);

// ---- names -----------------------------------------------------------------------------------------

/** "Trip planner!" → "trip-planner". */
export function slugify(s: string): string {
  return (
    String(s ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/, '') || 'app'
  );
}

/** A placeholder name for a field's label ("Start date" → start_date), not one of `taken`. */
export function fieldId(label: string, taken: string[] = []): string {
  const base =
    String(label ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field';
  const id = /^[a-z]/.test(base) ? base : `f_${base}`;
  if (!taken.includes(id)) return id;
  for (let n = 2; ; n++) if (!taken.includes(`${id}_${n}`)) return `${id}_${n}`;
}

// ---- the prompt ------------------------------------------------------------------------------------

/** Whether an answer counts as given for {{#id}}…{{/id}}: something other than empty or "No". */
const given = (v: string | undefined) => !!v && !!v.trim() && v.trim().toLowerCase() !== 'no';

/**
 * The prompt with the form's answers. {{id}} is the answer; {{#id}}…{{/id}} keeps its text only when
 * the field was answered (and not with No), {{^id}}…{{/id}} only when it was not; {{today}} is today's
 * date. Placeholders that name no field stay as they are (a web app's own {{braces}}).
 */
export function fillTemplate(tpl: string, values: Record<string, string>, o: { today?: string; known?: string[] } = {}): string {
  const known = new Set(o.known ?? Object.keys(values));
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const value = (id: string) => (id === 'today' && !known.has('today') ? today : (values[id] ?? ''));
  let out = String(tpl ?? '');
  // Sections, innermost first, until none are left.
  const section = /\{\{([#^])\s*([\w-]+)\s*\}\}((?:(?!\{\{[#^]\s*\2\s*\}\})[\s\S])*?)\{\{\/\s*\2\s*\}\}/g;
  for (let i = 0; i < 20; i++) {
    const next = out.replace(section, (all, kind: string, id: string, body: string) => {
      if (!known.has(id) && id !== 'today') return all;
      const yes = given(value(id));
      return (kind === '#') === yes ? body : '';
    });
    if (next === out) break;
    out = next;
  }
  out = out.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (all, id: string) => (known.has(id) || id === 'today' ? value(id) : all));
  return out
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The placeholders a prompt uses. */
export function placeholders(tpl: string): string[] {
  const out = new Set<string>();
  for (const m of String(tpl ?? '').matchAll(/\{\{\s*[#^/]?\s*([\w-]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2026-11-03", or a date written another way, as YYYY-MM-DD; null when it is not a date. */
export function readDate(v: string): string | null {
  const s = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? s : null;
  }
  if (/^\d{4}(-\d{2})?$/.test(s)) return s;
  if (!/\d/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? isoDay(new Date(t)) : null;
}

/** "$1,250.50" → 1250.5; null when it is not a plain number. */
export function readNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^[$€£¥]\s*/, '').replace(/\s*(?:[$€£¥%]|usd|eur|gbp)$/i, '').replace(/(\d)[,_ ](?=\d{3}\b)/g, '$1');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const YES = /^(yes|y|true|1|on|oui|ja|sí|si)$/i;
const NO = /^(no|n|false|0|off|non|nein)$/i;

/**
 * The form's answers, tidied and checked against its fields: every field gets a value (its default or
 * empty), yes/no as Yes or No, numbers and dates in a plain form. `errors` say what to fix, in words.
 */
export function checkInputs(fields: AppField[], raw: Record<string, unknown>, o: { maxText?: number; maxLong?: number } = {}): { values: Record<string, string>; errors: string[] } {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  const maxText = o.maxText ?? 2000;
  const maxLong = o.maxLong ?? 60_000;
  for (const f of fields) {
    let v: unknown = raw?.[f.id];
    if (v === undefined || v === null) v = f.default ?? '';
    let s = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' ? String(v) : typeof v === 'string' ? v : null;
    if (s === null) {
      errors.push(`${f.label}: give it as text`);
      continue;
    }
    s = f.type === 'long' || f.type === 'file' ? s.replace(/\r\n/g, '\n').trim() : s.replace(/\s+/g, ' ').trim();
    if (s) {
      if (f.type === 'number') {
        const n = readNumber(s);
        if (n === null) errors.push(`${f.label}: should be a number`);
        else s = String(n);
      } else if (f.type === 'date') {
        const d = readDate(s);
        if (!d) errors.push(`${f.label}: should be a date like 2026-11-03`);
        else s = d;
      } else if (f.type === 'yesno') {
        if (YES.test(s)) s = 'Yes';
        else if (NO.test(s)) s = 'No';
        else errors.push(`${f.label}: should be yes or no`);
      } else if (f.type === 'choice') {
        const hit = (f.options ?? []).find((x) => x.toLowerCase() === s!.toLowerCase());
        if (!hit) errors.push(`${f.label}: should be one of ${(f.options ?? []).join(', ')}`);
        else s = hit;
      }
      const max = f.type === 'long' || f.type === 'file' ? maxLong : maxText;
      if (s.length > max) errors.push(`${f.label}: too long (at most ${max.toLocaleString('en-US')} characters)`);
    } else if (f.required) errors.push(`${f.label}: needed`);
    values[f.id] = s;
  }
  return { values, errors };
}

// ---- the answer ------------------------------------------------------------------------------------

function columnSchema(t: ColumnType, description?: string): Record<string, unknown> {
  const d = description ? { description } : {};
  if (t === 'number') return { type: 'number', ...d };
  if (t === 'yesno') return { type: 'boolean', ...d };
  if (t === 'date') return { type: 'string', ...d, description: `${description ? `${description}. ` : ''}A date, YYYY-MM-DD.` };
  if (t === 'url') return { type: 'string', ...d, description: `${description ? `${description}. ` : ''}A full https:// address.` };
  return { type: 'string', ...d };
}

/** The JSON schema of submit_result's input: one property per answer field. */
export function answerSchema(answer: AnswerField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const f of answer) {
    const description = [f.label, f.description].filter(Boolean).join(': ');
    if (f.type === 'list') properties[f.id] = { type: 'array', items: { type: 'string' }, description };
    else if (f.type === 'table') {
      const cols = f.columns ?? [];
      properties[f.id] = {
        type: 'array',
        description: `${description}. One object per row.`,
        items: { type: 'object', properties: Object.fromEntries(cols.map((c) => [c.id, columnSchema(c.type, [c.label, c.description].filter(Boolean).join(': '))])), required: cols.map((c) => c.id) },
      };
    } else if (f.type === 'markdown') properties[f.id] = { type: 'string', description: `${description}. Markdown.` };
    else properties[f.id] = columnSchema(f.type, description);
  }
  return { type: 'object', properties, required: answer.filter((f) => f.required).map((f) => f.id) };
}

const empty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

/** One value as a column of `t` wants it, or an error in words. */
function cell(t: ColumnType | 'markdown', v: unknown): { v: unknown } | { e: string } {
  switch (t) {
    case 'number': {
      const n = readNumber(v);
      return n === null ? { e: 'should be a number' } : { v: n };
    }
    case 'yesno': {
      if (typeof v === 'boolean') return { v };
      const s = String(v).trim();
      return YES.test(s) ? { v: true } : NO.test(s) ? { v: false } : { e: 'should be true or false' };
    }
    case 'date': {
      if (typeof v !== 'string' && typeof v !== 'number') return { e: 'should be a date like 2026-11-03' };
      const d = readDate(String(v));
      return d ? { v: d } : { e: 'should be a date like 2026-11-03' };
    }
    case 'url': {
      if (typeof v !== 'string') return { e: 'should be a web address' };
      try {
        const u = new URL(v.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return { e: 'should start with https://' };
        return { v: u.href };
      } catch {
        return { e: 'should be a full web address (https://…)' };
      }
    }
    default:
      if (typeof v === 'string') return { v: v.trim() };
      if (typeof v === 'number' || typeof v === 'boolean') return { v: String(v) };
      return { e: 'should be text' };
  }
}

/** Some models send an object or list as JSON text. */
function unwrap(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!/^[[{]/.test(s)) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

/**
 * What the agent handed in, checked against the answer fields: values in their plain form (numbers as
 * numbers, dates as YYYY-MM-DD), unknown keys dropped. Errors say what to fix, field by field.
 */
export function checkAnswer(answer: AnswerField[], raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] } {
  const obj = unwrap(raw);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: [`Send one object with the fields ${answer.map((f) => f.id).join(', ')}.`] };
  const src = obj as Record<string, unknown>;
  const value: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of answer) {
    let v = unwrap(src[f.id]);
    if (empty(v) || (Array.isArray(v) && !v.length)) {
      if (f.required) errors.push(`${f.id}: missing (${ANSWER_TYPES.find((t) => t.value === f.type)?.label.toLowerCase() ?? f.type})`);
      else value[f.id] = f.type === 'list' || f.type === 'table' ? [] : null;
      continue;
    }
    if (f.type === 'list') {
      if (typeof v === 'string') v = v.split('\n').map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      if (!Array.isArray(v)) {
        errors.push(`${f.id}: should be a list of short texts`);
        continue;
      }
      const items = v.map((x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' || typeof x === 'boolean' ? String(x) : null));
      if (items.some((x) => x === null)) errors.push(`${f.id}: each item should be text`);
      else value[f.id] = (items as string[]).filter(Boolean);
    } else if (f.type === 'table') {
      if (!Array.isArray(v)) {
        errors.push(`${f.id}: should be a list of rows, one object per row`);
        continue;
      }
      const cols = f.columns ?? [];
      const rows: Record<string, unknown>[] = [];
      v.forEach((r, i) => {
        const row = unwrap(r);
        if (!row || typeof row !== 'object' || Array.isArray(row)) return void errors.push(`${f.id} row ${i + 1}: should be an object with ${cols.map((c) => c.id).join(', ')}`);
        const out: Record<string, unknown> = {};
        for (const c of cols) {
          const x = (row as Record<string, unknown>)[c.id];
          if (empty(x)) {
            out[c.id] = null;
            continue;
          }
          const r2 = cell(c.type, x);
          if ('e' in r2) errors.push(`${f.id} row ${i + 1}, ${c.id}: ${r2.e}`);
          else out[c.id] = r2.v;
        }
        rows.push(out);
      });
      value[f.id] = rows;
    } else {
      const r = cell(f.type === 'markdown' ? 'markdown' : f.type, v);
      if ('e' in r) errors.push(`${f.id}: ${r.e}`);
      else value[f.id] = r.v;
    }
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 15) };
  if (JSON.stringify(value).length > 400_000) return { ok: false, errors: ['The result is too long: keep it under 400,000 characters in all.'] };
  return { ok: true, value };
}

/** A result value as one line of text (CSV cells, MCP answers). */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? Object.values(x).map(cellText).join(' · ') : cellText(x))).join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ---- CSV --------------------------------------------------------------------------------------------

/** The rows of a CSV file (commas, semicolons or tabs; quoted fields may hold any of them and new lines). */
export function parseCsv(text: string): string[][] {
  const s = String(text ?? '').replace(/^﻿/, '');
  // The separator: whichever of , ; tab appears most in the first line, outside quotes.
  const first = s.slice(0, s.search(/\r?\n/) >= 0 ? s.search(/\r?\n/) : s.length);
  const count = (c: string) => first.replace(/"[^"]*"/g, '').split(c).length - 1;
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"' && f === '') q = true;
    else if (c === sep) {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  if (f !== '' || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** A CSV file from rows. Cells a spreadsheet would run as a formula start with an apostrophe. */
export function toCsv(rows: unknown[][]): string {
  const esc = (v: unknown) => {
    let s = cellText(v);
    if (/^[=+@\t\r]/.test(s) || /^-[^\d.]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/** The columns a result fills in a table of runs: each answer field, tables and lists as one cell. */
export function resultHeader(answer: AnswerField[]): { id: string; label: string }[] {
  return answer.map((f) => ({ id: f.id, label: f.label }));
}

// ---- tidying a recipe ---------------------------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const opt = (v: unknown, max: number) => str(v, max) || undefined;
const posNum = (v: unknown, max: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined;
};

/** Answer fields (or a step's outputs) from anything: known kinds, ids from labels, tables with columns. */
export function cleanAnswer(raw: unknown): AnswerField[] {
  const atTaken: string[] = [];
  return (Array.isArray(raw) ? raw : []).slice(0, 30).flatMap((x: any): AnswerField[] => {
    if (!x || typeof x !== 'object') return [];
    const label = str(x.label, 80) || str(x.id, 80);
    if (!label) return [];
    const type: AnswerType = ANSWER_TYPES.some((t) => t.value === x.type) ? x.type : 'text';
    const id = fieldId(str(x.id, 40) || label, atTaken);
    atTaken.push(id);
    const cTaken: string[] = [];
    const columns =
      type === 'table'
        ? (Array.isArray(x.columns) ? x.columns : []).slice(0, 12).flatMap((c: any): AnswerColumn[] => {
            const cl = str(c?.label, 60) || str(c?.id, 60);
            if (!cl) return [];
            const cid = fieldId(str(c.id, 40) || cl, cTaken);
            cTaken.push(cid);
            return [{ id: cid, label: cl, type: COLUMN_TYPES.some((t) => t.value === c.type) ? c.type : 'text', description: opt(c.description, 200) }];
          })
        : undefined;
    return [{ id, label, type, description: opt(x.description, 400), required: !!x.required || undefined, columns: type === 'table' ? (columns?.length ? columns : [{ id: 'item', label: 'Item', type: 'text' }]) : undefined }];
  });
}

/** A form's questions from anything: known kinds, ids from labels, choices with their options. */
export function cleanFields(raw: unknown): AppField[] {
  const taken: string[] = [];
  return (Array.isArray(raw) ? raw : []).slice(0, 30).flatMap((x: any): AppField[] => {
    if (!x || typeof x !== 'object') return [];
    const label = str(x.label, 80) || str(x.id, 80);
    if (!label) return [];
    const type: FieldType = FIELD_TYPES.some((t) => t.value === x.type) ? x.type : 'text';
    const id = fieldId(str(x.id, 40) || label, taken);
    taken.push(id);
    const options = type === 'choice' ? [...new Set<string>((Array.isArray(x.options) ? x.options : []).map((o: unknown) => str(o, 80)).filter(Boolean))].slice(0, 30) : undefined;
    return [{ id, label, type, required: !!x.required || undefined, help: opt(x.help, 240), placeholder: opt(x.placeholder, 160), options: options?.length ? options : type === 'choice' ? ['Yes', 'No'] : undefined, default: opt(x.default, 4000) }];
  });
}

/** A recipe from anything (a form, the helper model, an API call): known fields only, within bounds. */
export function cleanRecipe(raw: any): AppRecipe {
  const r = raw && typeof raw === 'object' ? raw : {};
  const fields = cleanFields(r.fields);
  const answer = cleanAnswer(r.answer);
  const agent: Agent = r.agent === 'codex' || r.agent === 'acp' ? r.agent : 'claude';
  const flow = cleanFlow(r.flow).flow;
  const data = cleanData(r.data).data;
  const requires = cleanRequires(r.requires).requires;
  const flows = cleanFlows(r.flows).flows;
  const screens = cleanScreens(r.screens);
  return {
    name: str(r.name, 60) || 'Untitled template',
    icon: (APP_ICONS as readonly string[]).includes(r.icon) ? r.icon : 'sparkles',
    color: r.color in APP_COLORS ? r.color : 'blue',
    description: str(r.description, 300),
    category: opt(r.category, 30),
    assistant: opt(r.assistant, 80),
    agent,
    acpAgent: agent === 'acp' ? str(r.acpAgent, 80) || 'console' : undefined,
    model: opt(r.model, 160),
    effort: opt(r.effort, 40),
    mode: opt(r.mode, 40),
    cwd: opt(r.cwd, 1000),
    prompt: typeof r.prompt === 'string' ? r.prompt.replace(/\r\n/g, '\n').trim().slice(0, 30_000) : '',
    fields,
    answer,
    tools: Array.isArray(r.tools) ? [...new Set<string>(r.tools.map((t: unknown) => str(t, 80)).filter(Boolean))].slice(0, 80) : null,
    limits: { runsPerDay: posNum(r.limits?.runsPerDay, 100_000) && Math.round(posNum(r.limits?.runsPerDay, 100_000)!), capUsd: posNum(r.limits?.capUsd, 10_000) },
    ...(flow ? { flow } : {}),
    ...(data ? { data } : {}),
    ...(r.memory === true ? { memory: true } : {}),
    ...(requires ? { requires } : {}),
    ...(flows ? { flows } : {}),
    ...(screens ? { screens } : {}),
  };
}

export const DEFAULT_PUBLIC: PublicSettings = { on: false, perIpPerHour: 5, runsPerDay: 50, spendPerDay: 2, web: true };

export function cleanPublic(raw: any, prev: PublicSettings = DEFAULT_PUBLIC): PublicSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  const int = (v: unknown, d: number, max: number) => {
    const n = posNum(v, max);
    return n === undefined ? d : Math.max(1, Math.round(n));
  };
  return {
    on: typeof r.on === 'boolean' ? r.on : prev.on,
    model: r.model === undefined ? prev.model : opt(r.model, 160),
    perIpPerHour: r.perIpPerHour === undefined ? prev.perIpPerHour : int(r.perIpPerHour, prev.perIpPerHour, 1000),
    runsPerDay: r.runsPerDay === undefined ? prev.runsPerDay : int(r.runsPerDay, prev.runsPerDay, 100_000),
    spendPerDay: r.spendPerDay === undefined ? prev.spendPerDay : (posNum(r.spendPerDay, 10_000) ?? prev.spendPerDay),
    web: typeof r.web === 'boolean' ? r.web : prev.web,
  };
}

/** A short line naming a run by its inputs ("Lisbon · 4 days"). */
export function inputsLine(fields: AppField[], inputs: Record<string, string>, max = 60): string {
  const parts = fields
    .filter((f) => f.type !== 'file' && f.type !== 'yesno')
    .map((f) => (inputs[f.id] ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const s = parts.slice(0, 3).join(' · ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
