// AI on a page, as Notion AI: what the page editor asks of the helper model (Settings → Models) for the words or blocks
// picked, or the page itself. Each is one call to a model outside any session; nothing is kept but what the editor does
// with the answer (its Keep, one step to undo there):
//   POST /api/write/page-ai  {action, text?, before?, page?, title?, topic?, tone?, lang?, ask?, answer?, pageId?}
//     → {markdown, model, cost?}: Continue writing, Write about…, Summarize, Make shorter or longer, Improve the writing,
//     Fix spelling and grammar, Simplify, Change the tone, Translate, Explain, Make a table or a list of…, Brainstorm,
//     Action items, or the person's own request; with `answer`, the answer before changed as `ask` says.
//   POST /api/write/db-ai    {how, prompt?, lang?, options?, column, row, pageId?} → {value, model, cost?}: a database's AI
//     column, one cell from the row's other cells (summarize, extract, classify, translate, or the person's prompt).
// A page a confidential session saved is written on only by a helper model that runs on this computer.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { DB_AI_HOWS, PAGE_AI_ACTIONS, PAGE_AI_MAX, PAGE_AI_TONES, type DbAiAnswer, type DbAiAsk, type DbAiHow, type PageAiAction, type PageAiAnswer, type PageAiAsk, type PageAiTone } from '../../shared/page-ai.ts';
import { cleanLang } from '../../shared/write.ts';
import { HttpError } from '../auth.ts';
import { confidentialKey } from '../confidential/index.ts';
import type { DB } from '../db.ts';
import { helper, helperModelId, helperOptions, localHelper } from '../helper.ts';
import { pageInfo } from '../pages/store.ts';

// ---- a stand-in, for the tests -------------------------------------------------------------------------------------

type Ask = { system: string; prompt: string; model?: string };
let helperForTests: ((q: Ask) => Promise<string>) | null = null;
/** A stand-in for the helper model; null: the real one. */
export const setPageAiForTests = (f: typeof helperForTests) => (helperForTests = f);

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, n) : '');
const line = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** The helper model's name, as the answer says it. */
function modelName(db: DB, id: string): string {
  return id === 'auto' ? 'Claude' : (helperOptions(db).options.find((x) => x.value === id)?.label ?? id);
}

/** Which model writes for a page: the helper; for a confidential session's page, the helper on this computer, or none. */
function modelFor(db: DB, pageId: unknown): string {
  const p = typeof pageId === 'string' && /^[\w-]{1,40}$/.test(pageId) ? pageInfo(db, pageId) : null;
  if (p?.sessionKey && confidentialKey(db, p.sessionKey)) {
    const local = localHelper(db);
    if (!local) throw new HttpError(400, 'This page belongs to a confidential session: its words go only to a helper model on this computer. Pick one in Settings → Models.');
    return local;
  }
  return helperModelId(db);
}

/** One call to the helper model: its words, who wrote them, and what it cost. */
async function ask(db: DB, q: { system: string; prompt: string; model: string; maxTokens: number; signal: AbortSignal }): Promise<{ text: string; model: string; cost?: number }> {
  if (helperForTests) return { text: await helperForTests({ system: q.system, prompt: q.prompt, model: q.model }), model: 'the test helper' };
  let cost = 0;
  try {
    const text = await helper(db, { system: q.system, prompt: q.prompt, model: q.model === helperModelId(db) ? undefined : q.model, timeoutMs: 120_000, maxTokens: q.maxTokens, signal: q.signal, onCost: (usd) => (cost += usd) });
    return { text, model: modelName(db, q.model), ...(cost > 0 ? { cost } : {}) };
  } catch (e) {
    if (q.signal.aborted) throw new HttpError(409, 'It was stopped');
    throw e instanceof HttpError ? e : new HttpError(502, `The helper model did not answer: ${(e as Error).message}`);
  }
}

// ---- on a page ---------------------------------------------------------------------------------------------------------

export const PAGE_AI_SYSTEM = [
  'You write in a person’s page, in their editor, as Notion AI does. Answer with the content to put in the page, in Markdown: paragraphs, # headings, - bulleted lists, 1. numbered lists, - [ ] to-dos, > quotes, ``` code blocks, | tables | with a header row, **bold**, *italic*, `code` and [links](https://…).',
  'Answer with the content alone: no preamble (“Here is…”), no notes on what you did, no closing offer, no fence around the whole answer.',
  'Keep the language of the page’s words unless you are asked to translate. Keep names, numbers and facts as they are; never make up facts, figures, quotes or sources. When you are asked to write something new, write what is generally true and useful, and leave placeholders like [date] for what only the person knows.',
].join(' ');

const TONE: Record<PageAiTone, string> = {
  professional: 'professional: precise and polished, without slang',
  casual: 'casual: relaxed and conversational',
  straightforward: 'straightforward: direct and plain, no frills',
  confident: 'confident: assured and decisive, without hedging',
  friendly: 'friendly: warm and personal, as if talking to the reader',
};

/** What each action asks for (`what`: the words picked, else the page). */
function instruction(a: ReturnType<typeof readPageAi>, what: string): string {
  const topic = a.topic || (a.text ? 'the words given' : a.title ? `“${a.title}”` : 'the page');
  switch (a.action) {
    case 'continue':
      return 'Continue writing from where the page stops, in its voice, language and style: one to three paragraphs (or more items, when it stops in a list) that follow on naturally. Do not repeat what is there; begin with what comes next.';
    case 'write':
      return `Write about ${topic}, for the place in the page shown. Use headings, lists or a table where they help.`;
    case 'summarize':
      return `Summarize ${what}: a few sentences, or a short list of its key points when it is long.`;
    case 'shorter':
      return `Make ${what} shorter: about half as long, keeping what matters most and its structure (its headings, lists and tables).`;
    case 'longer':
      return `Make ${what} longer: about half as long again, saying more of what it says (an example, a reason, a consequence that follows from it), never new facts, figures or names. Keep its structure.`;
    case 'improve':
      return `Improve the writing of ${what}: clearer, more concise and better flowing, with the same meaning, facts, language and structure.`;
    case 'fix':
      return `Fix the spelling, grammar and punctuation of ${what}, and change nothing else (not the words chosen, not the style, not the structure). If nothing needs fixing, give it back as it is.`;
    case 'simplify':
      return `Simplify the language of ${what}: plain everyday words and short sentences, easy for anyone to read, the same meaning and structure.`;
    case 'tone':
      return `Rewrite ${what} in a tone that is ${TONE[a.tone ?? 'professional']}, keeping its meaning, facts and structure.`;
    case 'translate':
      return `Translate ${what} into ${a.lang}, as a native speaker would write it, keeping its structure and formatting (headings, lists, tables, bold and links).`;
    case 'explain':
      return `Explain ${what} simply, as to a curious newcomer: what it means and why it matters, in a few short paragraphs (and a short list where it helps).`;
    case 'table':
      return `Make a table of ${topic}: a Markdown table with a header row and the columns that suit it, filled in from what is given (or with what is generally true when it is a new topic).`;
    case 'list':
      return `Make a list of ${topic}: a bulleted list, one item a line, each short and specific.`;
    case 'brainstorm':
      return `Brainstorm ideas on ${topic}: a bulleted list of 8 to 12 varied, specific ideas, each a short line (a few words in bold, then what it is).`;
    case 'actions':
      return `Find the action items in ${what}: a to-do list (- [ ] …), one task a line, each starting with a verb, with who does it and by when where it says so. If there are none, say so in one short line.`;
    case 'ask':
      return `Do as the person asks, with ${a.text ? 'the words given' : 'the page'}: ${a.ask}`;
  }
}

/** What the helper model is asked. */
export function pageAiPrompt(a: ReturnType<typeof readPageAi>): string {
  const picked = !!a.text.trim();
  const what = picked ? 'the words given' : 'the page';
  if (a.answer) {
    return [
      `You answered before (asked to: ${instruction(a, what)}) with:`,
      a.answer,
      `Now change your answer as the person asks: ${a.ask}. Answer with the whole new answer.`,
      picked ? `The words it was about:\n${a.text}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  const parts = [instruction(a, what)];
  if (a.title) parts.push(`The page is titled “${a.title}”.`);
  if (a.action === 'continue') parts.push(`The page so far:\n${a.before || a.text || '(empty)'}`);
  else {
    if (a.before && (picked || a.action === 'write' || a.action === 'table' || a.action === 'list' || a.action === 'brainstorm')) parts.push(`For the sense only (do not repeat or rewrite it), the page before that place:\n${a.before}`);
    if (picked) parts.push(`The words given:\n${a.text}`);
    else if (a.page && a.action !== 'write' && a.action !== 'brainstorm') parts.push(`The page:\n${a.page}`);
  }
  return parts.join('\n\n');
}

/** The Markdown in the model's answer: no fence around all of it, no line said before it, no quotes it was wrapped in. */
export function cleanMarkdown(raw: string): string {
  let s = raw.replace(/\r\n?/g, '\n').trim();
  const fence = /^```(?:markdown|md)?\n([\s\S]*?)\n?```$/i.exec(s);
  if (fence) s = fence[1].trim();
  s = s.replace(/^(?:here(?:'s| is| are)\b[^\n]*|sure\b[^\n]*|certainly\b[^\n]*|of course\b[^\n]*)[:：]\s*\n+/i, '');
  if (/^["“][^"”\n]+["”]$/.test(s)) s = s.slice(1, -1).trim();
  return s.slice(0, 40_000).trim();
}

function readPageAi(b: unknown) {
  const o = (b ?? {}) as Record<string, unknown>;
  const action = PAGE_AI_ACTIONS.includes(o.action as PageAiAction) ? (o.action as PageAiAction) : null;
  if (!action) throw new HttpError(400, `action: one of ${PAGE_AI_ACTIONS.join(', ')}`);
  const text = clip(o.text, PAGE_AI_MAX + 1);
  if (text.length > PAGE_AI_MAX) throw new HttpError(413, `That is over ${PAGE_AI_MAX} characters: pick fewer blocks at once`);
  // What comes before, and the page: their ends near the place matter most for Continue; the page's start for the rest.
  const before = clip(o.before, 200_000).slice(-8000);
  const page = clip(o.page, PAGE_AI_MAX);
  const title = line(o.title, 200);
  const topic = line(o.topic, 400);
  const tone = PAGE_AI_TONES.includes(o.tone as PageAiTone) ? (o.tone as PageAiTone) : undefined;
  const lang = action === 'translate' ? cleanLang(o.lang) : null;
  const askWords = line(o.ask, 600);
  const answer = clip(o.answer, PAGE_AI_MAX);
  if (action === 'translate' && !lang) throw new HttpError(400, 'Say which language to translate into (lang)');
  if (action === 'tone' && !tone) throw new HttpError(400, `tone: one of ${PAGE_AI_TONES.join(', ')}`);
  if ((action === 'ask' || answer) && !askWords) throw new HttpError(400, 'Say what the AI should do (ask)');
  if ((action === 'write' || action === 'brainstorm') && !topic && !text.trim()) throw new HttpError(400, 'Say what to write about (topic)');
  const about = text.trim() || page.trim() || before.trim();
  if (['summarize', 'shorter', 'longer', 'improve', 'fix', 'simplify', 'tone', 'translate', 'explain', 'actions'].includes(action) && !about) throw new HttpError(400, 'There are no words to work on: write some first, or pick them');
  return { action, text, before, page, title, topic, ...(tone ? { tone } : {}), ...(lang ? { lang } : {}), ask: askWords, answer, pageId: o.pageId };
}

export async function pageAi(db: DB, body: unknown, signal: AbortSignal): Promise<PageAiAnswer> {
  const a = readPageAi(body);
  const model = modelFor(db, a.pageId);
  const r = await ask(db, { system: PAGE_AI_SYSTEM, prompt: pageAiPrompt(a), model, maxTokens: 6000, signal });
  const markdown = cleanMarkdown(r.text);
  if (!markdown) throw new HttpError(502, 'The helper model gave no words back: try again');
  return { markdown, model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
}

// ---- a database's AI column ----------------------------------------------------------------------------------------------

export const DB_AI_SYSTEM = [
  'You fill one cell of a table (a database in a person’s page) from the row’s other cells, as Notion’s AI columns do.',
  'Answer with the cell’s value alone: plain words, no quotes, no label, no preamble, no Markdown. Keep to one line unless asked for more; at most three short sentences.',
  'Use only what the row says; when what is asked is not there, answer with nothing at all.',
].join(' ');

function readDbAi(b: unknown) {
  const o = (b ?? {}) as Record<string, unknown>;
  const how = DB_AI_HOWS.includes(o.how as DbAiHow) ? (o.how as DbAiHow) : null;
  if (!how) throw new HttpError(400, `how: one of ${DB_AI_HOWS.join(', ')}`);
  const prompt = line(o.prompt, 600);
  const lang = how === 'translate' ? cleanLang(o.lang) : null;
  const options = Array.isArray(o.options) ? o.options.map((x) => line(x, 60)).filter(Boolean).slice(0, 60) : [];
  const column = line(o.column, 60) || 'AI';
  const raw = o.row && typeof o.row === 'object' && !Array.isArray(o.row) ? (o.row as Record<string, unknown>) : {};
  const row = Object.fromEntries(
    Object.entries(raw)
      .slice(0, 40)
      .map(([k, v]) => [line(k, 60), clip(typeof v === 'number' || typeof v === 'boolean' ? String(v) : v, 4000)])
      .filter(([k, v]) => k && String(v).trim()),
  ) as Record<string, string>;
  if (how === 'translate' && !lang) throw new HttpError(400, 'Say which language to translate into (lang)');
  if (how === 'classify' && options.length < 2) throw new HttpError(400, 'Give at least two options to sort the rows into (options)');
  if ((how === 'extract' || how === 'custom') && !prompt) throw new HttpError(400, how === 'extract' ? 'Say what to take out of each row (prompt)' : 'Write what the column should hold (prompt)');
  return { how, prompt, ...(lang ? { lang } : {}), options, column, row, pageId: o.pageId };
}

/** What the helper model is asked for one cell. */
export function cellPrompt(a: ReturnType<typeof readDbAi>): string {
  const what =
    a.how === 'summarize'
      ? 'Summarize the row in one or two short sentences.'
      : a.how === 'extract'
        ? `Take out of the row: ${a.prompt}. Answer with it alone (nothing when the row does not say it).`
        : a.how === 'classify'
          ? `Sort the row into one of these options: ${a.options.join(' | ')}. Answer with the option alone, exactly as it is written.`
          : a.how === 'translate'
            ? `Translate ${a.prompt ? `the row’s “${a.prompt}”` : 'the row’s main words'} into ${a.lang}.`
            : a.prompt;
  const cells = Object.entries(a.row).map(([k, v]) => `${k}: ${v}`);
  return `${what}\n\nThe column being filled: “${a.column}”.\n\nThe row:\n${cells.length ? cells.join('\n') : '(empty)'}`;
}

/** The cell's value from the model's answer: one value, its options' spelling for a classification. */
export function cleanCell(raw: string, a: Pick<ReturnType<typeof readDbAi>, 'how' | 'options'>): string {
  let s = raw
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/^```\w*\n?|\n?```$/g, '')
    .trim();
  s = s.replace(/^(?:here(?:'s| is)\b[^\n]*|answer|value)[:：]\s*/i, '').trim();
  if (/^["“'‘][^\n]*["”'’]$/.test(s)) s = s.slice(1, -1).trim();
  if (a.how === 'classify') {
    const first = s.split('\n')[0].replace(/[.!]$/, '').trim().toLowerCase();
    return a.options.find((o) => o.toLowerCase() === first) ?? a.options.find((o) => first.includes(o.toLowerCase())) ?? '';
  }
  return s.split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 2000);
}

export async function dbAi(db: DB, body: unknown, signal: AbortSignal): Promise<DbAiAnswer> {
  const a = readDbAi(body);
  const model = modelFor(db, a.pageId);
  const r = await ask(db, { system: DB_AI_SYSTEM, prompt: cellPrompt(a), model, maxTokens: 600, signal });
  return { value: cleanCell(r.text, a), model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
}

// ---- the routes ----------------------------------------------------------------------------------------------------------

/** Aborted when the editor stops waiting (Stop, the page left). */
function goneSignal(reply: FastifyReply): AbortSignal {
  const gone = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || gone.abort());
  return gone.signal;
}

export function pageAiRoutes(app: FastifyInstance, db: DB) {
  app.post('/api/write/page-ai', { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => pageAi(db, req.body, goneSignal(reply)));
  app.post('/api/write/db-ai', async (req, reply) => dbAi(db, req.body, goneSignal(reply)));
}

export type { DbAiAsk, PageAiAsk };
