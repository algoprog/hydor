// The spreadsheet editor's AI helpers, each a call to the helper model (Settings → Models) outside any session, so
// nothing is kept but what the editor does with the answer:
//   GET  /api/write/sheet-ai-cost               → {model, note, free}: what they cost with the helper model picked now.
//   POST /api/write/sheet-ai      {asks}        → {answers, failed?, model}: the AI function's cells (=AI(prompt,
//     cells…)), many asked in one call (those with the same prompt together), each answer by the key it is kept by.
//   POST /api/write/sheet-formula {ask, …ctx}   → {formula, explain, model}: a formula written from words, checked to
//     read and to use only functions the sheet has (asked again once, saying why, when not).
//   POST /api/write/sheet-explain {formula, …ctx} → {text, model}: a formula in plain words.
//   POST /api/write/sheet-fill    {headers, examples, rows} → {outputs, model}: Fill with AI, when no pattern of the
//     editor's own fits (shared/sheet-flash.ts tries those first, for nothing).
//   POST /api/write/sheet-analyze {question?, table, columns…} → {answer, ideas, model}: a table's question answered,
//     with charts, pivot tables and formulas to put in.
//   POST /api/write/sheet-table   {ask}         → {title, columns, rows, model}: a table made from words.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { AI_BATCH, cellAnswer, jsonIn, TABLE_COL_TYPES, type AnalyzeAnswer, type AnalyzeIdea, type ExplainAnswer, type FillAnswer, type FormulaAnswer, type SheetAiAnswer, type SheetAiCost, type TableAnswer, type TableColType } from '../../shared/sheet-ai.ts';
import { FUNCTION_NAMES, formulaProblem, formulaRefs, type CellValue } from '../../shared/sheets.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { helper, helperModelId, helperOptions, localHelper } from '../helper.ts';
import { rateFor } from '../prices.ts';

type Ask = { system: string; prompt: string; signal?: AbortSignal };
let helperForTests: ((q: Ask) => Promise<string>) | null = null;
/** A stand-in for the helper model, for the tests; null: the real one. */
export const setSheetAiForTests = (f: typeof helperForTests) => (helperForTests = f);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '');

/** Aborted when the editor stops waiting (the panel closed, the page left). */
function goneSignal(reply: FastifyReply): AbortSignal {
  const gone = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || gone.abort());
  return gone.signal;
}

/** The helper model's name, as the answers say it. */
function helperName(db: DB): string {
  if (helperForTests) return 'the test helper';
  const id = helperModelId(db);
  return id === 'auto' ? 'Claude' : (helperOptions(db).options.find((x) => x.value === id)?.label ?? id);
}

/** What the AI helpers cost with the helper model picked now, in a line. */
export function sheetAiCost(db: DB): SheetAiCost {
  const id = helperModelId(db);
  const model = helperName(db);
  if (id === 'auto') return { model, note: `Answered by ${model} through Claude Code, as part of your plan: no charge of its own.`, free: true };
  if (localHelper(db)) return { model, note: `Answered by ${model} on this computer: free.`, free: true };
  const m = helperOptions(db).options.find((x) => x.value === id);
  const rate = rateFor(db, id) ?? rateFor(db, m?.label ?? null);
  if (rate && Number.isFinite(rate.input) && Number.isFinite(rate.output)) {
    // About 120 words in and 30 out a cell, the prompt shared by the cells asked together.
    const usd = (12_400 * rate.input + 3_000 * rate.output) / 1e6;
    const money = usd < 0.01 ? 'under a cent' : `about $${usd < 1 ? usd.toFixed(2) : usd.toFixed(1)}`;
    return { model, note: `Answered by ${model}: ${money} for 100 cells.`, free: false };
  }
  return { model, note: `Answered by ${model}, which your provider charges for as for any question.`, free: false };
}

async function ask(db: DB, system: string, prompt: string, signal: AbortSignal, maxTokens = 4000): Promise<string> {
  try {
    return helperForTests ? await helperForTests({ system, prompt, signal }) : await helper(db, { system, prompt, signal, timeoutMs: 120_000, maxTokens });
  } catch (e) {
    if (signal.aborted) throw new HttpError(409, 'It was stopped');
    throw e instanceof HttpError ? e : new HttpError(502, `The helper model did not answer: ${(e as Error).message}`);
  }
}

/** The cells around the active one, from what the editor sent (checked, cut to size). */
function contextOf(b: Obj): string {
  const lines = [`Sheet: ${str(b.sheet, 100) || 'Sheet 1'}`, `The active cell: ${str(b.at, 12) || 'A1'}`];
  const sheets = Array.isArray(b.sheets) ? b.sheets.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
  if (sheets.length) lines.push(`Other sheets: ${sheets.map((s) => s.slice(0, 40)).join(', ')}`);
  const names = Array.isArray(b.names) ? b.names.filter((x): x is string => typeof x === 'string').slice(0, 80) : [];
  if (names.length) lines.push(`Named ranges: ${names.map((s) => s.slice(0, 120)).join('; ')}`);
  lines.push('Its cells (row numbers on the left, column letters on top):', str(b.table, 24_000));
  return lines.join('\n');
}

// ---- the AI function's cells ----------------------------------------------------------------------------------------

const CELLS_SYSTEM = [
  'You fill the cells of a spreadsheet, as Google Sheets’ AI function does: each item is a prompt with the values of the cells it was given.',
  'Answer each with what its cell should show: the answer alone, short (one line unless the prompt asks for more), no explanations, no quotes, no markdown.',
  'A number as a JSON number, yes or no as true or false only when the prompt asks a yes-or-no question. Answer in the language of the prompt.',
  'Answer with JSON only: {"answers": {"1": …, "2": …}}, every item by its number; null for one you cannot answer.',
].join(' ');

export function cellsPrompt(asks: { prompt: string; context: string[] }[]): string {
  // Asks with the same prompt (a column filled down) share it.
  const groups = new Map<string, number[]>();
  asks.forEach((a, i) => groups.set(a.prompt, [...(groups.get(a.prompt) ?? []), i]));
  const out: string[] = [];
  for (const [prompt, items] of groups) {
    out.push(`Prompt: ${prompt}`);
    for (const i of items) {
      const vals = asks[i].context.map((c) => (c.includes('\n') ? `\n${c.replace(/^/gm, '      ')}` : c));
      out.push(`  ${i + 1}.${vals.length ? ` Values: ${vals.join(' | ')}` : ' (no values)'}`);
    }
  }
  return out.join('\n');
}

export async function aiCells(db: DB, body: unknown, signal: AbortSignal): Promise<SheetAiAnswer> {
  const b = isObj(body) ? body : {};
  const asks = (Array.isArray(b.asks) ? b.asks : [])
    .filter(isObj)
    .slice(0, AI_BATCH)
    .map((a) => ({ key: str(a.key, 40), prompt: str(a.prompt, 4000).trim(), context: (Array.isArray(a.context) ? a.context : []).slice(0, 30).map((c) => str(c, 20_000)) }))
    .filter((a) => /^[a-z0-9]{4,24}$/.test(a.key) && a.prompt);
  if (!asks.length) throw new HttpError(400, 'asks: the AI cells to answer, each {key, prompt, context}');
  const raw = await ask(db, CELLS_SYSTEM, cellsPrompt(asks), signal, Math.min(8000, 600 + asks.length * 300));
  const got = jsonIn(raw);
  const list = isObj(got?.answers) ? got.answers : got;
  const answers: Record<string, CellValue> = {};
  const failed: Record<string, string> = {};
  asks.forEach((a, i) => {
    const v = isObj(list) ? cellAnswer(list[String(i + 1)]) : null;
    if (v === null || v === '') failed[a.key] = got ? 'The model gave no answer for it' : 'The model did not answer as asked';
    else answers[a.key] = v;
  });
  return { answers, ...(Object.keys(failed).length ? { failed } : {}), model: helperName(db) };
}

// ---- a formula written, or explained ---------------------------------------------------------------------------------

const FORMULA_SYSTEM = [
  'You write spreadsheet formulas as Excel writes them, for the sheet shown, from what the person asks for.',
  'Use the sheet’s real cells: columns by their letters, rows by their numbers, ranges that reach the table’s last row (or whole columns such as C:C), $ only where a formula copied down must keep it.',
  'The sheet works out Excel’s functions and a few of Google Sheets’ (SPLIT, JOIN, REGEXMATCH, ARRAYFORMULA); formulas such as FILTER, SORT and UNIQUE spill into the cells below.',
  'Answer with JSON only: {"formula": "=…", "explain": "one short plain sentence on what it gives"}.',
].join(' ');

/** A formula's functions this sheet does not have (names of its named ranges and LAMBDAs aside). */
function unknownFunctions(f: string, names: string[]): string[] {
  const known = new Set([...FUNCTION_NAMES, ...names.map((n) => n.split(/\s|=/)[0].toUpperCase())]);
  const out = new Set<string>();
  // Words before a ( outside quotes.
  const bare = f.replace(/"(?:[^"]|"")*"/g, '""');
  for (const m of bare.matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)) {
    const n = m[1].toUpperCase().replace(/^(_XLFN\.|_XLWS\.)+/, '');
    if (!known.has(n) && !/^(LAMBDA|LET)$/.test(n)) out.add(n);
  }
  // LET's and LAMBDA's own names called are fine.
  const own = new Set([...bare.matchAll(/(?:LET|LAMBDA)\s*\(([^)]*)/gi)].flatMap((m) => m[1].split(',').map((x) => x.trim().toUpperCase())));
  return [...out].filter((n) => !own.has(n));
}

export async function writeFormula(db: DB, body: unknown, signal: AbortSignal): Promise<FormulaAnswer> {
  const b = isObj(body) ? body : {};
  const want = str(b.ask, 600).trim();
  if (!want) throw new HttpError(400, 'ask: what the formula is to work out, in your words');
  const names = Array.isArray(b.names) ? b.names.filter((x): x is string => typeof x === 'string') : [];
  let problem = '';
  for (let tries = 0; tries < 2; tries++) {
    const prompt = [contextOf(b), '', `What the person wants in ${str(b.at, 12) || 'the active cell'}: ${want}`, problem ? `\nYour last answer could not be used: ${problem} Write it again.` : ''].join('\n');
    const got = jsonIn(await ask(db, FORMULA_SYSTEM, prompt, signal, 1500));
    const formula = typeof got?.formula === 'string' ? got.formula.trim().replace(/^=?/, '=') : '';
    const explain = typeof got?.explain === 'string' ? got.explain.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
    if (formula.length < 2) {
      problem = 'it was not JSON with a formula.';
      continue;
    }
    const why = formulaProblem(formula.slice(1));
    const unknown = why ? [] : unknownFunctions(formula, names);
    if (why) problem = `${formula} cannot be read: ${why}`;
    else if (unknown.length) problem = `${formula} uses ${unknown.join(', ')}, which this spreadsheet does not have.`;
    else if (!formulaRefs(formula.slice(1)).length && !/\(/.test(formula)) problem = 'it is no formula of the sheet’s cells.';
    else return { formula, explain, model: helperName(db) };
  }
  throw new HttpError(502, `The helper model did not write a formula that works (${problem.replace(/\.$/, '')}): say it another way and ask again.`);
}

const EXPLAIN_SYSTEM = [
  'You explain a spreadsheet formula to someone who is not a programmer: what it gives, and how, in two to four short plain sentences.',
  'Name the cells and columns by what they hold where the sheet shows it (their headers), as well as by their letters. No headings, lists or code blocks; you may quote a short part of the formula.',
].join(' ');

export async function explainFormula(db: DB, body: unknown, signal: AbortSignal): Promise<ExplainAnswer> {
  const b = isObj(body) ? body : {};
  const formula = str(b.formula, 8200).trim();
  if (!formula) throw new HttpError(400, 'formula: the formula to explain');
  const raw = await ask(db, EXPLAIN_SYSTEM, `${contextOf(b)}\n\nThe formula in ${str(b.at, 12) || 'the active cell'}: ${formula.startsWith('=') ? formula : `=${formula}`}`, signal, 1200);
  const text = raw.replace(/```[\s\S]*?```/g, '').replace(/^#+\s*/gm, '').trim().slice(0, 2000);
  if (!text) throw new HttpError(502, 'The helper model gave no explanation: try again');
  return { text, model: helperName(db) };
}

// ---- Fill with AI --------------------------------------------------------------------------------------------------

const FILL_SYSTEM = [
  'You fill a spreadsheet column from examples, as Excel’s Flash Fill does: each example row has values and what the person typed beside them.',
  'Work out what they did, and do the same for each row to fill: the same format, the same kind of words.',
  'Answer with JSON only: {"outputs": ["…", …]}, one for each row to fill in their order; "" where it cannot be told.',
].join(' ');

export async function fillColumn(db: DB, body: unknown, signal: AbortSignal): Promise<FillAnswer> {
  const b = isObj(body) ? body : {};
  const headers = (Array.isArray(b.headers) ? b.headers : []).slice(0, 30).map((h) => str(h, 80));
  const examples = (Array.isArray(b.examples) ? b.examples : []).filter(isObj).slice(0, 20).map((e) => ({ inputs: (Array.isArray(e.inputs) ? e.inputs : []).slice(0, 30).map((x) => str(x, 500)), output: str(e.output, 1000) }));
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 200).map((r) => (Array.isArray(r) ? r.slice(0, 30).map((x) => str(x, 500)) : []));
  if (!examples.length) throw new HttpError(400, 'examples: a few rows with the column filled in');
  if (!rows.length) throw new HttpError(400, 'rows: the rows to fill');
  const head = headers.length ? `Columns: ${headers.join(' | ')}${typeof b.target === 'string' && b.target ? ` → ${str(b.target, 80)}` : ''}\n` : '';
  const prompt = `${head}Examples:\n${examples.map((e) => `${e.inputs.join(' | ')} → ${e.output}`).join('\n')}\n\nRows to fill:\n${rows.map((r, i) => `${i + 1}. ${r.join(' | ')}`).join('\n')}`;
  const got = jsonIn(await ask(db, FILL_SYSTEM, prompt, signal, Math.min(8000, 400 + rows.length * 60)));
  const list = Array.isArray(got?.outputs) ? got.outputs : null;
  if (!list) throw new HttpError(502, 'The helper model did not answer as asked: try again');
  const outputs = rows.map((_, i) => {
    const v = cellAnswer(list[i]);
    return v === null || v === '' ? null : String(v);
  });
  return { outputs, model: helperName(db) };
}

// ---- Analyze the data ------------------------------------------------------------------------------------------------

const ANALYZE_SYSTEM = [
  'You are a data analyst looking at a table in a spreadsheet, for someone who is not one.',
  'Answer their question (or, without one, say what stands out in the table) in a few plain sentences with the numbers that matter, worked out from the statistics given for every column (the rows shown may be only the first ones).',
  'Then suggest up to four things to put in that would help: charts, pivot tables (a summary by one column, and maybe another across) or formulas.',
  'Answer with JSON only: {"answer": "…", "ideas": [',
  '{"kind": "chart", "title": "…", "why": "…", "chart": "column|bar|line|area|pie|scatter", "x": "A", "ys": ["C"]},',
  '{"kind": "pivot", "title": "…", "why": "…", "by": "B", "across": "D" (or left out), "values": [{"col": "C", "fn": "sum|count|average|min|max"}]},',
  '{"kind": "formula", "title": "…", "why": "…", "formula": "=…"}]}; columns by their letters, formulas with the table’s real ranges.',
].join(' ');

const CHARTS = ['column', 'bar', 'line', 'area', 'pie', 'scatter'];
const FNS = ['sum', 'count', 'average', 'min', 'max'];
const colOk = (v: unknown) => (typeof v === 'string' && /^[A-Z]{1,3}$/.test(v.trim().toUpperCase()) ? v.trim().toUpperCase() : null);

/** The ideas an answer suggested, each checked (columns by letter, a formula that can be read). */
export function ideasOf(v: unknown): AnalyzeIdea[] {
  const out: AnalyzeIdea[] = [];
  for (const x of Array.isArray(v) ? v.slice(0, 6) : []) {
    if (!isObj(x)) continue;
    const title = str(x.title, 120).trim() || 'An idea';
    const why = str(x.why, 300).trim() || undefined;
    if (x.kind === 'chart') {
      const xc = colOk(x.x);
      const ys = (Array.isArray(x.ys) ? x.ys : [x.y]).map(colOk).filter((c): c is string => !!c);
      const chart = CHARTS.includes(String(x.chart)) ? (x.chart as 'column') : 'column';
      if (xc && ys.length) out.push({ kind: 'chart', title, why, chart, x: xc, ys: ys.slice(0, 6) });
    } else if (x.kind === 'pivot') {
      const by = colOk(x.by);
      const across = colOk(x.across) ?? undefined;
      const values = (Array.isArray(x.values) ? x.values : []).filter(isObj).flatMap((y) => {
        const col = colOk(y.col);
        const fn = FNS.includes(String(y.fn)) ? (y.fn as 'sum') : 'sum';
        return col ? [{ col, fn }] : [];
      });
      if (by && values.length) out.push({ kind: 'pivot', title, why, by, ...(across && across !== by ? { across } : {}), values: values.slice(0, 4) });
    } else if (x.kind === 'formula') {
      const f = typeof x.formula === 'string' ? x.formula.trim().replace(/^=?/, '=') : '';
      if (f.length > 1 && !formulaProblem(f.slice(1))) out.push({ kind: 'formula', title, why, formula: f });
    }
  }
  return out;
}

export async function analyze(db: DB, body: unknown, signal: AbortSignal): Promise<AnalyzeAnswer> {
  const b = isObj(body) ? body : {};
  const cols = (Array.isArray(b.columns) ? b.columns : []).filter(isObj).slice(0, 60);
  if (!cols.length) throw new HttpError(400, 'columns: the table’s columns, each {letter, name, about}');
  const question = str(b.question, 600).trim();
  const prompt = [
    `Sheet: ${str(b.sheet, 100)}; the table: ${str(b.range, 30)}`,
    'Its columns, over all its rows:',
    ...cols.map((c) => `${str(c.letter, 3)} “${str(c.name, 80)}”: ${str(c.about, 400)}`),
    '',
    'Its rows (row numbers on the left):',
    str(b.table, 20_000),
    '',
    question ? `Their question: ${question}` : 'They asked no question: say what stands out.',
  ].join('\n');
  const got = jsonIn(await ask(db, ANALYZE_SYSTEM, prompt, signal, 2500));
  const answer = typeof got?.answer === 'string' ? got.answer.trim().slice(0, 3000) : '';
  if (!answer) throw new HttpError(502, 'The helper model did not answer as asked: try again');
  return { answer, ideas: ideasOf(got?.ideas), model: helperName(db) };
}

// ---- a table made from words ------------------------------------------------------------------------------------------

const TABLE_SYSTEM = [
  'You make a table for a spreadsheet from what the person asks for: useful, realistic content, in their language.',
  'Answer with JSON only: {"title": "a short name for the sheet", "columns": [{"name": "…", "type": "text|number|currency|percent|date|checkbox|list|rating", "options": ["…"] (a list’s choices)}], "rows": [[…], …]}.',
  'Dates as YYYY-MM-DD, checkboxes true or false, ratings 0 to 5, amounts and percents as plain numbers (12.5 for 12.5%), a list’s cells one of its options; at most 60 rows and 12 columns.',
].join(' ');

export async function makeTable(db: DB, body: unknown, signal: AbortSignal): Promise<TableAnswer> {
  const b = isObj(body) ? body : {};
  const want = str(b.ask, 800).trim();
  if (!want) throw new HttpError(400, 'ask: the table you want, in your words');
  const got = jsonIn(await ask(db, TABLE_SYSTEM, `The table: ${want}`, signal, 6000));
  const columns = (Array.isArray(got?.columns) ? got.columns : []).filter(isObj).slice(0, 12).map((c) => {
    const type = (TABLE_COL_TYPES as string[]).includes(String(c.type)) ? (c.type as TableColType) : 'text';
    const options = type === 'list' && Array.isArray(c.options) ? [...new Set(c.options.map((o) => str(o, 80).trim()).filter(Boolean))].slice(0, 30) : undefined;
    return { name: str(c.name, 80).trim() || 'Column', type, ...(options?.length ? { options } : {}) };
  });
  if (!columns.length) throw new HttpError(502, 'The helper model did not make a table: say it another way and ask again.');
  const rows = (Array.isArray(got?.rows) ? got.rows : []).slice(0, 60).map((r) =>
    columns.map((col, j) => {
      const v = Array.isArray(r) ? r[j] : null;
      if (v === null || v === undefined || v === '') return null;
      if (col.type === 'checkbox') return v === true || /^(true|yes|x|✓)$/i.test(String(v));
      if (col.type === 'number' || col.type === 'currency' || col.type === 'percent' || col.type === 'rating') {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : str(v, 200);
      }
      return typeof v === 'number' || typeof v === 'boolean' ? v : str(v, 500);
    }),
  );
  return { title: str(got?.title, 31).trim() || undefined, columns, rows, model: helperName(db) };
}

// ---- the routes ------------------------------------------------------------------------------------------------------

/** The spreadsheet's AI helpers' routes, beside the other writing helpers' (index.ts). */
export function sheetAiRoutes(app: FastifyInstance, db: DB) {
  app.get('/api/write/sheet-ai-cost', async () => sheetAiCost(db));
  app.post('/api/write/sheet-ai', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => aiCells(db, req.body, goneSignal(reply)));
  app.post('/api/write/sheet-formula', { bodyLimit: 1024 * 1024 }, async (req, reply) => writeFormula(db, req.body, goneSignal(reply)));
  app.post('/api/write/sheet-explain', { bodyLimit: 1024 * 1024 }, async (req, reply) => explainFormula(db, req.body, goneSignal(reply)));
  app.post('/api/write/sheet-fill', { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => fillColumn(db, req.body, goneSignal(reply)));
  app.post('/api/write/sheet-analyze', { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => analyze(db, req.body, goneSignal(reply)));
  app.post('/api/write/sheet-table', async (req, reply) => makeTable(db, req.body, goneSignal(reply)));
}
