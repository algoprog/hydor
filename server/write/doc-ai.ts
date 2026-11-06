// The document editor's AI that writes with you, each a call to the helper model (Settings → Models) outside any
// session, so nothing is kept but what the editor does with the answer (one step to undo there):
//   POST /api/write/compose    {ask?, kind, before, after?, title?, outline?, words?} → {markdown, model, cost?}: Write with
//     AI at the cursor (a paragraph about…, continue writing, a summary of what is above, a conclusion, a list or a
//     table of…), and for words picked: explain them, sum them up, make a table of them.
//   POST /api/write/proofread  {items: [{id, text}]} → {items: [{id, text, why}], model, cost?}: spelling, grammar,
//     clarity and style fixed paragraph by paragraph (only those that change come back), for the editor's suggestions.
//   POST /api/write/paragraphs {how: tone|translate, tone?, lang?, items} → {items, model, cost?}: every paragraph in
//     another tone, or translated.
//   POST /api/write/complete   {before, after?} → {text, model}: the next few words of the sentence being typed.
//   POST /api/write/ask-doc    {question, paragraphs: [{id, text}], title?, history?} → {answer, model, cost?}: a question
//     answered from the document, each statement citing its paragraphs as [P3].
// Things of their own among the words (maths, footnotes' marks, citations) come as ⟦1⟧, ⟦2⟧… and must come back so.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { cleanLang } from '../../shared/write.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { helper, helperModelId, helperOptions } from '../helper.ts';

type Ask = { system: string; prompt: string; signal?: AbortSignal; maxTokens?: number };
let helperForTests: ((q: Ask) => Promise<string>) | null = null;
/** A stand-in for the helper model (null: the real one). */
export const setDocAiForTests = (f: typeof helperForTests) => (helperForTests = f);

const LIMIT = { before: 12_000, after: 3_000, words: 6_000, items: 60, item: 4_000, chars: 12_000, question: 1_000, paragraphs: 400, docChars: 60_000 };

/** Aborted when the editor stops waiting. */
function goneSignal(reply: FastifyReply): AbortSignal {
  const gone = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || gone.abort());
  return gone.signal;
}

/** The helper model's name, as the answer says it. */
function helperName(db: DB): string {
  const id = helperModelId(db);
  return id === 'auto' ? 'Claude' : (helperOptions(db).options.find((x) => x.value === id)?.label ?? id);
}

/** The helper model's answer, its name, and what it cost when that is known (a model paid by the word). */
async function ask(db: DB, q: Ask, timeoutMs = 120_000): Promise<{ text: string; model: string; cost?: number }> {
  if (helperForTests) return { text: await helperForTests(q), model: 'the test helper' };
  let cost = 0;
  let priced = false;
  try {
    const text = await helper(db, {
      ...q,
      timeoutMs,
      maxTokens: q.maxTokens ?? 4000,
      onCost: (usd) => {
        cost += usd;
        priced = true;
      },
    });
    return { text, model: helperName(db), ...(priced && cost > 0 ? { cost } : {}) };
  } catch (e) {
    if (q.signal?.aborted) throw new HttpError(409, 'It was stopped');
    throw e instanceof HttpError ? e : new HttpError(502, `The helper model did not answer: ${(e as Error).message}`);
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');
const line = (v: unknown, max: number) => str(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);

/** An answer without what models put around it: a fence, a line before it ("Here is…"), quotes. */
export function cleanAnswer(raw: string): string {
  let s = raw.replace(/\r\n?/g, '\n').trim();
  s = s.replace(/^(?:here(?:'s| is| are)\b[^\n]*|sure\b[^\n]*|certainly\b[^\n]*|of course\b[^\n]*)[:：]\s*\n+/i, '');
  const fence = /^```(?:markdown|md|text)?\n([\s\S]*?)\n?```$/i.exec(s);
  if (fence) s = fence[1].trim();
  return s.trim();
}

// ---- Write with AI ------------------------------------------------------------------------------------------------

export type ComposeKind = 'write' | 'continue' | 'summary' | 'conclusion' | 'list' | 'table' | 'explain' | 'summarize' | 'tablify';
const KINDS: ComposeKind[] = ['write', 'continue', 'summary', 'conclusion', 'list', 'table', 'explain', 'summarize', 'tablify'];

export const COMPOSE_SYSTEM = [
  'You write part of a document a person is writing in their editor, as Google Docs’ Help me write and Notion AI do.',
  'Answer with the new text alone, in Markdown (paragraphs, ## headings, - lists, | tables |, **bold**, *italic*): nothing before or after it, no notes, no code fence around it.',
  'Write in the language the document is written in (or the request’s, when the document has no words yet), in its tone and its way of writing.',
  'Make up no facts, names, numbers, dates or quotes that neither the document nor the request gives; where one is needed, leave a short placeholder in square brackets, such as [date].',
  'Things of their own in the text (maths, footnotes, citations) show as ⟦1⟧, ⟦2⟧: leave them out of what you write.',
].join(' ');

const WHAT: Record<Exclude<ComposeKind, 'write' | 'list' | 'table'>, string> = {
  continue: 'Continue writing from where the text before the cursor ends: one or two paragraphs that follow on from it naturally, in the same voice. Do not repeat what it says, and do not start with a heading.',
  summary: 'Write a short summary of the document above the cursor: a paragraph, or a few bullets if it is long. Do not add a heading unless the document uses headings for its sections.',
  conclusion: 'Draft a conclusion for the document: a short section that sums up what it says and what follows from it, with a heading (of the level the document’s sections have) if the document uses headings.',
  explain: 'Explain the words picked below in plain language, for someone reading this document: what they mean and what a reader needs to know to follow them. A short paragraph or two; no heading.',
  summarize: 'Sum up the words picked below in a few sentences (or a few bullets if they are long). No heading.',
  tablify: 'Turn the words picked below into a table that holds what they say, with a header row. Answer with the table alone.',
};

export function composePrompt(a: { kind: ComposeKind; ask?: string; before?: string; after?: string; title?: string; outline?: string; words?: string }): string {
  const what =
    a.kind === 'write'
      ? `Write this, where the cursor is: ${a.ask}`
      : a.kind === 'list'
        ? `Make a list (Markdown bullets, or numbers if the order matters) of: ${a.ask}`
        : a.kind === 'table'
          ? `Make a table (Markdown, with a header row) of: ${a.ask}`
          : `${WHAT[a.kind]}${a.ask ? ` ${a.ask}` : ''}`;
  return [
    a.title ? `The document is called “${a.title}”.` : '',
    a.outline && a.outline !== '(no headings)' ? `Its outline:\n${a.outline}` : '',
    a.before?.trim() ? `The document before the cursor${a.before.length >= LIMIT.before ? ' (its end)' : ''}:\n<<<\n${a.before}\n>>>` : 'The document has no words before the cursor.',
    a.after?.trim() ? `The document after the cursor${a.after.length >= LIMIT.after ? ' (its start)' : ''}:\n<<<\n${a.after}\n>>>` : '',
    a.words?.trim() ? `The words picked:\n<<<\n${a.words}\n>>>` : '',
    what,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function readCompose(b: unknown) {
  const o = (b ?? {}) as Record<string, unknown>;
  const kind = KINDS.includes(o.kind as ComposeKind) ? (o.kind as ComposeKind) : 'write';
  const askText = line(o.ask, 600);
  if ((kind === 'write' || kind === 'list' || kind === 'table') && !askText) throw new HttpError(400, 'Say what to write (ask)');
  const words = str(o.words, LIMIT.words);
  if ((kind === 'explain' || kind === 'summarize' || kind === 'tablify') && !words.trim()) throw new HttpError(400, 'Pick some words first (words)');
  const before = str(o.before, 1_000_000);
  return {
    kind,
    ask: askText,
    // The end of what is before the cursor, the start of what is after it.
    before: before.length > LIMIT.before ? before.slice(-LIMIT.before) : before,
    after: str(o.after, LIMIT.after),
    title: line(o.title, 300),
    outline: str(o.outline, 3000),
    words,
  };
}

// ---- paragraph by paragraph ----------------------------------------------------------------------------------------

interface Item {
  id: string;
  text: string;
}

function readItems(v: unknown): Item[] {
  if (!Array.isArray(v) || !v.length) throw new HttpError(400, 'Send the paragraphs (items: [{id, text}])');
  const out: Item[] = [];
  let chars = 0;
  for (const x of v.slice(0, LIMIT.items)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = typeof o.id === 'string' && /^[A-Za-z0-9_:,-]{1,80}$/.test(o.id) ? o.id : '';
    const text = str(o.text, LIMIT.item);
    if (!id || !text.trim()) continue;
    chars += text.length;
    if (chars > LIMIT.chars) break;
    out.push({ id, text });
  }
  if (!out.length) throw new HttpError(400, 'The paragraphs have no words');
  return out;
}

/** Paragraphs as the model gets them: [1] its words (a line break in one as ↵). */
const numbered = (items: Item[]) => items.map((x, k) => `[${k + 1}] ${x.text.replace(/\n/g, ' ↵ ')}`).join('\n');

/**
 * The paragraphs in a model's answer ([n] words, and for a proofreading the line after it, Why: …), by their ids; what
 * is not one of those it was sent is left out, and so is one that lost or gained a thing of its own (⟦1⟧).
 */
export function readNumbered(raw: string, items: Item[]): { id: string; text: string; why?: string }[] {
  const out: { id: string; text: string; why?: string }[] = [];
  const atoms = (t: string) => (t.match(/⟦\d+⟧/g) ?? []).sort().join('');
  let cur: { id: string; text: string; why?: string } | null = null;
  for (const l of cleanAnswer(raw).split('\n')) {
    const m = /^\s*\[(\d{1,3})\]\s?(.*)$/.exec(l);
    if (m) {
      const it = items[Number(m[1]) - 1];
      cur = it && !out.some((x) => x.id === it.id) ? { id: it.id, text: m[2].replace(/\s*↵\s*/g, '\n').trim() } : null;
      if (cur) out.push(cur);
      continue;
    }
    const why = /^\s*why\s*:\s*(.+)$/i.exec(l);
    if (why && cur) cur.why = why[1].trim().slice(0, 200);
    else if (cur && l.trim() && !cur.why) cur.text += ` ${l.trim()}`;
  }
  return out.filter((x) => {
    const it = items.find((y) => y.id === x.id)!;
    return x.text && atoms(x.text) === atoms(it.text);
  });
}

export const PROOFREAD_SYSTEM = [
  'You proofread paragraphs of a document, as a careful editor would: fix spelling, grammar and punctuation, and make wording that is unclear or clumsy clear, changing as little as you can.',
  'Keep the meaning, the voice, the language and the facts. Do not rewrite what is fine, and do not change names, numbers, quotes, code, addresses or the marks ⟦1⟧, ⟦2⟧ (things of their own in the text).',
  'Each paragraph comes as [n] and its words (↵ is a line break in it). Answer only for the paragraphs you change, each as [n] and the whole corrected paragraph on one line, then on the next line: Why: a few words on what you fixed (Spelling, Grammar, Punctuation, Clarity or Style, and what). If no paragraph needs fixing, answer: None.',
].join(' ');

export const TONES = ['formal', 'friendly', 'confident', 'simple', 'persuasive', 'academic', 'concise'] as const;

function paragraphsSystem(how: 'tone' | 'translate', tone: string, lang: string): string {
  const what =
    how === 'translate'
      ? `Translate every paragraph into ${lang}, as a native speaker would write it, keeping its meaning, its looks marked **bold** or *italic*, and its names, numbers and code.`
      : `Rewrite every paragraph in a ${tone} tone, keeping its meaning, its facts, names and numbers, and about its length.`;
  return [
    `You rewrite the paragraphs of a document. ${what}`,
    'Keep the marks ⟦1⟧, ⟦2⟧ (things of their own in the text) where they belong.',
    'Each paragraph comes as [n] and its words (↵ is a line break in it). Answer with every paragraph, in the same order, each as [n] and its new words on one line: nothing before or after them.',
  ].join(' ');
}

// ---- suggestions as you type ------------------------------------------------------------------------------------

export const COMPLETE_SYSTEM = [
  'You suggest how the sentence a person is typing goes on, as Gmail’s Smart Compose does.',
  'Answer with the next few words alone (at most ten), going on exactly from the last character of the text: begin with a space if a new word starts there. Finish the sentence if you can.',
  'Nothing else: no quotes, no notes. If you cannot guess well, answer with nothing at all.',
].join(' ');

/** A suggestion as the editor shows it: one line, no more than a sentence's end, a space before a new word kept. */
export function cleanCompletion(raw: string, before: string): string {
  let s = raw.replace(/\r\n?/g, '\n').split('\n')[0] ?? '';
  s = s.replace(/^["“'‘]|["”'’]$/g, '');
  // What the text says already, said again at the start of the answer.
  const tail = before.slice(-40);
  for (let k = Math.min(tail.length, s.length); k > 3; k--)
    if (s.startsWith(tail.slice(-k))) {
      s = s.slice(k);
      break;
    }
  if (/\s$/.test(before)) s = s.replace(/^\s+/, '');
  const end = /^(.*?[.!?…])(\s|$)/.exec(s);
  if (end) s = end[1];
  return s.slice(0, 120).replace(/\s+$/, '');
}

// ---- ask about this document ------------------------------------------------------------------------------------

export const ASK_DOC_SYSTEM = [
  'You answer a person’s questions about a document from what it says. Its paragraphs come numbered [P1], [P2]…',
  'Answer in the language of the question, briefly and in plain words (Markdown lists are fine). After each statement, say which paragraphs it rests on, as [P3] or [P3, P7].',
  'If the document does not say, answer that it does not, and give what it says that comes closest. Make nothing up.',
].join(' ');

export function askDocPrompt(a: { question: string; title?: string; paragraphs: Item[]; history: { q: string; a: string }[] }): string {
  return [
    a.title ? `The document: “${a.title}”.` : '',
    a.paragraphs.map((p, k) => `[P${k + 1}] ${p.text.replace(/\n/g, ' ')}`).join('\n'),
    ...a.history.map((h) => `Earlier question: ${h.q}\nYour answer: ${h.a}`),
    `The question: ${a.question}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The paragraphs an answer cites ([P3], [P3, P7]), as their ids, in the order they come. */
export function citedParagraphs(answer: string, paragraphs: Item[]): string[] {
  const out: string[] = [];
  for (const m of answer.matchAll(/\[P\s*(\d+(?:\s*[,–-]\s*P?\s*\d+)*)\]/gi))
    for (const part of m[1].split(/\s*,\s*/)) {
      const range = /^P?\s*(\d+)\s*[–-]\s*P?\s*(\d+)$/i.exec(part);
      const [a, z] = range ? [Number(range[1]), Number(range[2])] : [Number(part.replace(/\D/g, '')), Number(part.replace(/\D/g, ''))];
      for (let n = a; n <= Math.min(z, a + 20); n++) {
        const id = paragraphs[n - 1]?.id;
        if (id && !out.includes(id)) out.push(id);
      }
    }
  return out;
}

// ---- the routes -----------------------------------------------------------------------------------------------------

export function docAiRoutes(app: FastifyInstance, db: DB) {
  app.post('/api/write/compose', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const a = readCompose(req.body);
    const r = await ask(db, { system: COMPOSE_SYSTEM, prompt: composePrompt(a), signal: goneSignal(reply), maxTokens: 6000 }, 180_000);
    const markdown = cleanAnswer(r.text);
    if (!markdown) throw new HttpError(502, 'The helper model gave no words back: try again');
    return { markdown: markdown.slice(0, 60_000), model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
  });
  app.post('/api/write/proofread', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const items = readItems(((req.body ?? {}) as Record<string, unknown>).items);
    const r = await ask(db, { system: PROOFREAD_SYSTEM, prompt: numbered(items), signal: goneSignal(reply), maxTokens: 8000 }, 180_000);
    const fixed = /^\s*none\.?\s*$/i.test(r.text) ? [] : readNumbered(r.text, items).filter((x) => x.text !== items.find((y) => y.id === x.id)!.text.trim());
    return { items: fixed, model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
  });
  app.post('/api/write/paragraphs', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const o = (req.body ?? {}) as Record<string, unknown>;
    const how = o.how === 'translate' ? 'translate' : o.how === 'tone' ? 'tone' : null;
    if (!how) throw new HttpError(400, 'how: tone or translate');
    const lang = how === 'translate' ? cleanLang(o.lang) : '';
    if (how === 'translate' && !lang) throw new HttpError(400, 'Say which language to translate into (lang)');
    const tone = how === 'tone' ? line(o.tone, 60) : '';
    if (how === 'tone' && !tone) throw new HttpError(400, 'Say which tone (tone)');
    const items = readItems(o.items);
    const r = await ask(db, { system: paragraphsSystem(how, tone, lang ?? ''), prompt: numbered(items), signal: goneSignal(reply), maxTokens: 10_000 }, 240_000);
    return { items: readNumbered(r.text, items), model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
  });
  app.post('/api/write/complete', async (req, reply) => {
    const o = (req.body ?? {}) as Record<string, unknown>;
    const before = str(o.before, 1_000_000).slice(-3000);
    if (!before.trim()) return { text: '' };
    const after = str(o.after, 500);
    const prompt = `The text so far:\n<<<\n${before}\n>>>${after.trim() ? `\n\nWhat follows it:\n<<<\n${after}\n>>>` : ''}`;
    const r = await ask(db, { system: COMPLETE_SYSTEM, prompt, signal: goneSignal(reply), maxTokens: 60 }, 30_000);
    return { text: cleanCompletion(r.text, before), model: r.model };
  });
  app.post('/api/write/ask-doc', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const o = (req.body ?? {}) as Record<string, unknown>;
    const question = line(o.question, LIMIT.question);
    if (!question) throw new HttpError(400, 'Ask a question (question)');
    const all = Array.isArray(o.paragraphs) ? o.paragraphs : [];
    const paragraphs: Item[] = [];
    let chars = 0;
    for (const x of all.slice(0, LIMIT.paragraphs * 4)) {
      const p = (x ?? {}) as Record<string, unknown>;
      const id = typeof p.id === 'string' && /^[A-Za-z0-9_:,-]{1,80}$/.test(p.id) ? p.id : '';
      const text = line(p.text, 3000);
      if (!id || !text) continue;
      chars += text.length;
      if (chars > LIMIT.docChars) break;
      paragraphs.push({ id, text });
    }
    if (!paragraphs.length) throw new HttpError(400, 'The document has no words to answer from');
    const history = (Array.isArray(o.history) ? o.history : []).slice(-4).flatMap((h) => {
      const x = (h ?? {}) as Record<string, unknown>;
      const q = line(x.q, 500);
      const a = line(x.a, 1500);
      return q && a ? [{ q, a }] : [];
    });
    const r = await ask(db, { system: ASK_DOC_SYSTEM, prompt: askDocPrompt({ question, title: line(o.title, 300), paragraphs, history }), signal: goneSignal(reply), maxTokens: 3000 }, 180_000);
    const answer = cleanAnswer(r.text);
    if (!answer) throw new HttpError(502, 'The helper model gave no answer: try again');
    return { answer: answer.slice(0, 20_000), cites: citedParagraphs(answer, paragraphs), short: chars > LIMIT.docChars, model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
  });
}
