// The LaTeX editor's AI helpers, each a call to a model outside any session (nothing is kept but what the editor does
// with the answer, one step to undo there):
//   POST /api/write/latex/rewrite    {text, how, lang?, ask?, context?} → {text, problems, model, cost?}: the words picked
//     rewritten by the helper model (shorter, clearer, more academic, grammar fixed, translated, or as the user says),
//     commands, maths, keys and comments kept; checked (shared/latex-ai.ts texGuard), asked again once when something was
//     dropped or made up, and `problems` say what when it still was (the editor then puts nothing in).
//   POST /api/write/latex/write      {ask, before?, after?, preamble?, math?} → {latex, packages, model, cost?}: LaTeX for the
//     cursor's place as described (an equation, a table, an algorithm, a TikZ figure, a paragraph), with the \usepackage
//     lines it needs that the preamble lacks.
//   GET  /api/write/latex/picture    → who reads pictures here and about what one costs; POST {data, kind?} → {latex,
//     packages, kind, model, cost?}: a picture of an equation, a table or text (a screenshot, a photo of handwriting) as
//     LaTeX, read by the helper model when it sees pictures, else a vision model through OpenRouter (priced), else
//     Claude through Claude Code.
//   POST /api/write/latex/error      {how: explain|fix, message, hint?, file, line, lines, log?} → {text, fix?, model}: an
//     error of the typesetting explained in plain words, or the lines around it changed to fix it.
//   POST /api/write/latex/cite       {claim, context?} → {queries, papers, model}: papers that back a claim, found in
//     OpenAlex and arXiv by searches the helper model writes, and judged by it against their abstracts.
//   POST /api/write/latex/proofread  {paragraphs: [{id, text}], lang?} → {corrections}: spelling, grammar and wrong words
//     in the paragraphs' words, each found in its paragraph and checked to touch no command, maths, key or comment.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  smallestChange,
  TEX_AI_MAX,
  TEX_REWRITE_HOWS,
  texGuard,
  texKept,
  texSpans,
  touchesProtected,
  type TexCiteAnswer,
  type TexCitePaper,
  type TexCorrection,
  type TexErrorAnswer,
  type TexPictureReader,
  type TexProofreadAnswer,
  type TexRewriteAnswer,
  type TexRewriteHow,
  type TexWritten,
} from '../../shared/latex-ai.ts';
import { bibKeyFor, bibText, cleanBibEntry, type BibEntry } from '../../shared/latex-bib.ts';
import { cleanLang } from '../../shared/write.ts';
import type { AgentModel } from '../../shared/types.ts';
import { chat, type Part } from '../agent/llm.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { helper, helperModelId, helperOptions, helperSees } from '../helper.ts';
import { HEADERS } from '../images/openrouter.ts';
import { loadConfig } from '../models/config.ts';
import { catalog, OPENROUTER_URL } from '../models/openrouter.ts';
import { askClaudeAbout } from '../oneshot.ts';
import { invertedAbstract } from '../papers/resolve.ts';
import { config } from '../config.ts';

// ---- stand-ins, for the tests ----------------------------------------------------------------------------------------

type Ask = { system: string; prompt: string; images?: { data: string; mimeType: string }[] };
let helperForTests: ((q: Ask) => Promise<string>) | null = null;
let fetchForTests: typeof fetch | null = null;
/** Stand-ins for the helper model (and the model that reads pictures) and for the web; null: the real ones. */
export function setLatexWriteForTests(o: { helper?: typeof helperForTests; fetch?: typeof fetchForTests }) {
  if ('helper' in o) helperForTests = o.helper ?? null;
  if ('fetch' in o) fetchForTests = o.fetch ?? null;
}

const stopped = () => new HttpError(409, 'It was stopped');

function goneSignal(reply: FastifyReply): AbortSignal {
  const gone = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || gone.abort());
  return gone.signal;
}

function helperName(db: DB): string {
  const id = helperModelId(db);
  return id === 'auto' ? 'Claude' : (helperOptions(db).options.find((x) => x.value === id)?.label ?? id);
}

/** The helper model's answer, its name, and what it cost when that is known and not nothing. */
async function ask(db: DB, q: Ask & { signal: AbortSignal; maxTokens?: number; timeoutMs?: number }): Promise<{ text: string; model: string; cost?: number }> {
  if (helperForTests) return { text: await helperForTests(q), model: 'the test helper' };
  let cost: number | undefined;
  try {
    const text = await helper(db, { system: q.system, prompt: q.prompt, images: q.images, signal: q.signal, maxTokens: q.maxTokens ?? 4000, timeoutMs: q.timeoutMs ?? 90_000, onCost: (usd) => (cost = usd) });
    return { text, model: helperName(db), ...(cost ? { cost } : {}) };
  } catch (e) {
    if (q.signal.aborted) throw stopped();
    throw e instanceof HttpError ? e : new HttpError(502, `The helper model did not answer: ${(e as Error).message}`);
  }
}

/** The first JSON object of an answer, or null. */
function jsonIn(raw: string): Record<string, unknown> | null {
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

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');

/** LaTeX from an answer: no code fence or line said before it, its line ends as the source's. */
export function cleanLatex(raw: string): string {
  let s = raw.replace(/\r\n?/g, '\n').trim();
  const fence = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(s);
  if (fence) s = fence[1];
  else s = s.replace(/^(?:here(?:'s| is| are)\b[^\n]*|sure\b[^\n]*|certainly\b[^\n]*)[:：]\s*\n+/i, '');
  return s.replace(/^\n+|\s+$/g, '');
}

const PACKAGE = /^\\usepackage\s*(?:\[[^\]\n]{0,200}\])?\s*\{[A-Za-z0-9_,\- ]{1,120}\}$/;

/** The \usepackage lines an answer names that the preamble does not load yet. */
export function neededPackages(v: unknown, preamble: string): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    let line = raw.trim();
    if (/^[A-Za-z0-9_-]+$/.test(line)) line = `\\usepackage{${line}}`;
    if (!PACKAGE.test(line)) continue;
    const names = /\{([^}]*)\}$/.exec(line)![1].split(',').map((x) => x.trim());
    const loaded = names.every((n) => new RegExp(`\\\\(?:usepackage|RequirePackage)\\s*(?:\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${n.replace(/[-]/g, '\\-')}\\b`).test(preamble) || (n === 'graphicx' && /\{graphics\}/.test(preamble)));
    if (!loaded && !out.includes(line)) out.push(line);
  }
  return out.slice(0, 8);
}

// ---- rewriting the words picked -----------------------------------------------------------------------------------

const HOW: Record<Exclude<TexRewriteHow, 'translate' | 'ask'>, string> = {
  shorter: 'Make it shorter: about two thirds as long or less, keeping its claims and what matters most.',
  clearer: 'Make it clearer: plain, direct sentences, one idea each, the same meaning, nothing added.',
  academic: 'Make it more academic: formal and precise, in the register of a research paper in its field, without filler or hype.',
  fix: 'Fix its spelling, grammar and punctuation only, and change nothing else (not the words chosen, not the style). If nothing needs fixing, give it back as it is.',
};

export const TEX_REWRITE_SYSTEM = [
  'You rewrite a passage of a LaTeX document’s source that its author picked. Answer with the new LaTeX source alone: no code fence, no notes, nothing before or after it.',
  'Change only the words of the text. Keep exactly as they are: every command and environment (\\textbf{…} keeps its command; the words in it may change), all maths ($…$, \\(…\\), \\[…\\], equation and align environments) character for character, the keys in \\cite{…}, \\ref{…}, \\eqref{…} and \\label{…}, \\url and \\href addresses, and each % comment.',
  'Put in no citation, reference, label, maths or command of your own, and no facts, numbers or names. Keep its language unless asked to translate it, and its paragraphs: a blank line between them where it had one.',
].join(' ');

export function texRewritePrompt(a: { text: string; how: TexRewriteHow; lang?: string; ask?: string; context?: string }, problems?: string[]): string {
  const what = a.how === 'translate' ? `Translate its words into ${a.lang}, as a native speaker writing a paper would; commands, maths, keys and comments stay as they are.` : a.how === 'ask' ? `Rewrite it as the author asks: ${a.ask}` : HOW[a.how];
  return [
    what,
    a.context ? `For the sense only (do not rewrite it): it is in ${a.context}` : '',
    problems?.length ? `Your last answer did not keep what must stay: ${problems.join(' ')} Answer again, keeping all of it.` : '',
    `The source:\n${a.text}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function readRewrite(b: unknown) {
  const o = (b ?? {}) as Record<string, unknown>;
  const text = str(o.text, TEX_AI_MAX + 1);
  if (!text.trim()) throw new HttpError(400, 'Pick some words to rewrite (text)');
  if (text.length > TEX_AI_MAX) throw new HttpError(413, `That is over ${TEX_AI_MAX} characters: pick less to rewrite at once`);
  const how = TEX_REWRITE_HOWS.includes(o.how as TexRewriteHow) ? (o.how as TexRewriteHow) : null;
  if (!how) throw new HttpError(400, `how: one of ${TEX_REWRITE_HOWS.join(', ')}`);
  const lang = how === 'translate' ? cleanLang(o.lang) : null;
  if (how === 'translate' && !lang) throw new HttpError(400, 'Say which language to translate the words into (lang)');
  const said = how === 'ask' ? str(o.ask, 300).replace(/\s+/g, ' ').trim() : '';
  if (how === 'ask' && !said) throw new HttpError(400, 'Say how to rewrite the words (ask)');
  const context = str(o.context, 800).replace(/\s+/g, ' ').trim();
  return { text, how, ...(lang ? { lang } : {}), ...(said ? { ask: said } : {}), ...(context ? { context } : {}) };
}

/** The words rewritten; asked again once when the answer dropped or made up what must stay. */
export async function texRewrite(db: DB, a: ReturnType<typeof readRewrite>, signal: AbortSignal): Promise<TexRewriteAnswer> {
  let problems: string[] = [];
  let out = '';
  let model = '';
  let cost = 0;
  for (let tries = 0; tries < 2; tries++) {
    const r = await ask(db, { system: TEX_REWRITE_SYSTEM, prompt: texRewritePrompt(a, tries ? problems : undefined), signal });
    model = r.model;
    cost += r.cost ?? 0;
    out = cleanLatex(r.text);
    // Its line ends as the words picked had them.
    if (a.text.endsWith('\n') && !out.endsWith('\n')) out += '\n';
    if (!out.trim()) throw new HttpError(502, 'The helper model gave nothing back: try again');
    problems = texGuard(a.text, out);
    if (!problems.length) break;
  }
  return { text: out, problems, model, ...(cost ? { cost } : {}) };
}

// ---- LaTeX written for the cursor's place -------------------------------------------------------------------------

export const TEX_WRITE_SYSTEM = [
  'You write LaTeX for a document, to go where its author’s cursor is, as they describe it. Answer with JSON only: {"latex": "…", "packages": ["\\\\usepackage[…]{…}"], "note": "…"}.',
  'latex: the source to put in, nothing else (no \\documentclass, no preamble, no \\begin{document}). packages: the \\usepackage lines it needs that the preamble does not load yet, exactly as they go in the preamble (none: []). note: a line on what to check, or "".',
  'Use the document’s own commands and packages where they fit, and only packages of a standard TeX Live: amsmath, amssymb, booktabs, graphicx, algorithm with algpseudocode (or algorithm2e when the document loads it), tikz, pgfplots, siunitx.',
  'A table: tabular with booktabs rules, in a table environment with \\caption and \\label. A figure or a TikZ drawing: in a figure environment with \\caption and \\label. An algorithm: an algorithm environment with \\caption and \\label. A displayed equation: an equation environment (align for several lines) with a \\label; when the cursor is in maths already, the maths alone. A paragraph: prose in the document’s language and style, with its maths in $…$.',
  'Labels are short and lowercase with a prefix (eq:, tab:, fig:, alg:, sec:), none the document has. Never cite: put no \\cite in it. Put no placeholder text where a number or a fact you do not know would go: leave a % TODO comment there.',
].join(' ');

export async function texWrite(db: DB, b: unknown, signal: AbortSignal): Promise<TexWritten> {
  const o = (b ?? {}) as Record<string, unknown>;
  const want = str(o.ask, 1000).trim();
  if (!want) throw new HttpError(400, 'Say what to write (ask)');
  const preamble = str(o.preamble, 8000);
  const before = str(o.before, 2500);
  const after = str(o.after, 800);
  const prompt = [
    `What to write: ${want}`,
    o.math === true ? 'The cursor is inside maths: write the maths alone.' : '',
    preamble ? `The document’s preamble:\n${preamble}` : '',
    before ? `The source just before the cursor:\n${before}` : '',
    after ? `The source just after it:\n${after}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const r = await ask(db, { system: TEX_WRITE_SYSTEM, prompt, signal, maxTokens: 6000, timeoutMs: 120_000 });
  const j = jsonIn(r.text);
  const latex = cleanLatex(j ? str(j.latex, 40_000) : r.text);
  if (!latex.trim()) throw new HttpError(502, 'The helper model wrote nothing: say it another way, or try again');
  return { latex, packages: neededPackages(j?.packages, preamble), note: j ? str(j.note, 300).trim() || undefined : undefined, model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
}

// ---- LaTeX read from a picture --------------------------------------------------------------------------------------

/** OpenRouter's models that read pictures well and cheaply, the first it lists. */
const PICTURE_MODELS = ['google/gemini-3.5-flash', 'google/gemini-3.5-flash-lite', 'google/gemini-3.1-flash', 'google/gemini-3.1-flash-lite', 'google/gemini-2.5-flash', 'anthropic/claude-haiku-5.5', 'openai/gpt-6-luna'];
/** About what a picture takes: its tokens in, and the LaTeX out. */
const PICTURE_TOKENS = { input: 1800, output: 900 };

type Reader = TexPictureReader & { read?: (system: string, prompt: string, data: Buffer, mime: string, signal: AbortSignal) => Promise<{ text: string; cost?: number }> };

const claudeHere = () => {
  try {
    return path.isAbsolute(config.claudeBin) ? fs.existsSync(config.claudeBin) : true;
  } catch {
    return false;
  }
};

/** Who reads a picture here: the helper model when it sees pictures, else one through OpenRouter, else Claude through Claude Code. */
export async function pictureReader(db: DB): Promise<Reader> {
  if (helperForTests) return { label: 'the test helper', where: 'helper', read: async (system, prompt, data, mime) => ({ text: await helperForTests!({ system, prompt, images: [{ data: data.toString('base64'), mimeType: mime }] }) }) };
  if (helperSees(db))
    return {
      label: helperName(db),
      where: 'helper',
      read: async (system, prompt, data, mime, signal) => {
        let cost: number | undefined;
        const text = await helper(db, { system, prompt, images: [{ data: data.toString('base64'), mimeType: mime }], signal, maxTokens: 4000, timeoutMs: 120_000, onCost: (usd) => (cost = usd) });
        return { text, cost };
      },
    };
  const key = loadConfig().openrouter.apiKey;
  if (key) {
    const list = await catalog().catch(() => []);
    const id = PICTURE_MODELS.find((p) => list.some((m) => m.id === `openrouter/${p}` && m.vision)) ?? (list.length ? null : PICTURE_MODELS[0]);
    const info = list.find((m) => m.id === `openrouter/${id}`);
    if (id) {
      const label = info?.label ?? id;
      const model: AgentModel = { id: `openrouter/${id}`, label, provider: 'openrouter', baseUrl: OPENROUTER_URL, apiKey: key, model: id, tools: 'text', vision: true, headers: HEADERS };
      return {
        label,
        where: 'openrouter',
        ...(info?.price ? { cost: (PICTURE_TOKENS.input * info.price.input + PICTURE_TOKENS.output * info.price.output) / 1e6 } : {}),
        read: async (system, prompt, data, mime, signal) => {
          const content: Part[] = [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${data.toString('base64')}` } },
          ];
          const r = await chat(model, {
            messages: [
              { role: 'system', content: system },
              { role: 'user', content },
            ],
            signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
            onText: () => {},
            onReasoning: () => {},
            maxTokens: 4000,
          });
          return { text: r.text, cost: r.usage?.cost };
        },
      };
    }
  }
  if (claudeHere())
    return {
      label: 'Claude Sonnet, through Claude Code',
      where: 'claude',
      read: async (system, prompt, data, mime, signal) => {
        const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-tex-picture-'));
        try {
          const file = path.join(tmp, `picture.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg'}`);
          await fs.promises.writeFile(file, data);
          return { text: await askClaudeAbout({ system, prompt: `${prompt}\n\nThe picture: ${file}`, model: 'sonnet', files: [file], signal, timeoutMs: 150_000 }) };
        } finally {
          await fs.promises.rm(tmp, { recursive: true, force: true });
        }
      },
    };
  return { why: 'No model here reads pictures: pick a helper model that sees pictures in Settings → Models, or add an OpenRouter key there.' };
}

export const TEX_PICTURE_SYSTEM = [
  'You read a picture of part of a document (a screenshot, a scan, or a photo of handwriting or a whiteboard) and write it as LaTeX, exactly as it is: every symbol, sub- and superscript, number and word.',
  'Answer with JSON only: {"kind": "equation"|"table"|"text", "latex": "…", "packages": ["\\\\usepackage{…}"], "note": "…"}.',
  'An equation: in an equation environment, or align for several lines lined up, with no \\label. A table: tabular with booktabs rules, its header row as it is, no table environment or caption. Text: its paragraphs as LaTeX, its maths in $…$.',
  'packages: the \\usepackage lines it needs (amsmath, amssymb, booktabs…), none: []. note: what you could not read for sure, or "". If the picture shows nothing to write, leave latex empty and say why in note.',
].join(' ');

const MIME = (b: Buffer) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp' : b.subarray(0, 3).toString('latin1') === 'GIF' ? 'image/gif' : null);

export async function texFromPicture(db: DB, b: unknown, signal: AbortSignal): Promise<TexWritten> {
  const o = (b ?? {}) as Record<string, unknown>;
  if (typeof o.data !== 'string' || !o.data) throw new HttpError(400, 'Send the picture as data (base64, or a data: address)');
  const data = Buffer.from(o.data.replace(/^data:[^;,]*;base64,/, ''), 'base64');
  if (data.length > 8 * 1024 * 1024) throw new HttpError(413, 'That picture is over 8 MB: crop it to the part to read');
  const mime = MIME(data);
  if (!mime) throw new HttpError(415, 'That is not a picture to read (PNG, JPEG, WebP or GIF)');
  const reader = await pictureReader(db);
  if (!reader.read) throw new HttpError(400, reader.why ?? 'No model here reads pictures');
  const kind = o.kind === 'equation' || o.kind === 'table' || o.kind === 'text' ? o.kind : '';
  const preamble = str(o.preamble, 4000);
  const prompt = [kind ? `It is ${kind === 'text' ? 'text' : `an ${kind === 'equation' ? 'equation' : 'table'}`}.` : 'Say what it is.', preamble ? `The document’s preamble (for the packages it loads):\n${preamble}` : ''].filter(Boolean).join('\n\n');
  let got: { text: string; cost?: number };
  try {
    got = await reader.read(TEX_PICTURE_SYSTEM, prompt, data, mime, signal);
  } catch (e) {
    if (signal.aborted) throw stopped();
    throw e instanceof HttpError ? e : new HttpError(502, `${reader.label} did not answer: ${(e as Error).message}`);
  }
  const j = jsonIn(got.text);
  const latex = cleanLatex(j ? str(j.latex, 40_000) : got.text);
  const note = j ? str(j.note, 300).trim() : '';
  if (!latex.trim()) throw new HttpError(422, note ? `${reader.label} could not read it: ${note}` : `${reader.label} found nothing to write in that picture`);
  return {
    latex,
    packages: neededPackages(j?.packages, preamble),
    kind: typeof j?.kind === 'string' ? j.kind : kind || undefined,
    ...(note ? { note } : {}),
    model: reader.label,
    ...(got.cost ? { cost: got.cost } : {}),
  };
}

// ---- an error explained or fixed ------------------------------------------------------------------------------------

export const TEX_EXPLAIN_SYSTEM = [
  'You explain an error or a warning LaTeX gave on a document to its author, in plain words for someone who is not a TeX expert: what it means and why it happened on these lines, then what to change.',
  'At most five short sentences, no headings, no lists, no code fences; name commands as they are written (\\begin{…}).',
].join(' ');

export const TEX_FIX_SYSTEM = [
  'You fix an error LaTeX gave on a document by changing the lines it comes from, as little as you can: change only what causes it, keep everything else exactly as it is.',
  'Answer with JSON only: {"why": "a sentence on what was wrong", "from": first line number to change, "to": last line number to change, "text": "those lines as they should be (all of them, a line a line)"}.',
  'The lines are numbered as the file has them; change only lines shown. When the fix is not on these lines, or there is none, give from 0 and say why.',
].join(' ');

export async function texError(db: DB, b: unknown, signal: AbortSignal): Promise<TexErrorAnswer> {
  const o = (b ?? {}) as Record<string, unknown>;
  const how = o.how === 'fix' ? 'fix' : 'explain';
  const message = str(o.message, 1500).trim();
  if (!message) throw new HttpError(400, 'Send the error’s message');
  const lines = (Array.isArray(o.lines) ? o.lines : [])
    .filter((x): x is { n: number; text: string } => !!x && typeof (x as { n?: unknown }).n === 'number' && typeof (x as { text?: unknown }).text === 'string')
    .slice(0, 80)
    .map((x) => ({ n: Math.round(x.n), text: x.text.slice(0, 1000) }));
  const file = str(o.file, 200);
  const line = typeof o.line === 'number' ? Math.round(o.line) : 0;
  const prompt = [
    `The ${o.warning === true ? 'warning' : 'error'}: ${message}`,
    o.hint ? `What it most likely means: ${str(o.hint, 500)}` : '',
    file ? `In ${file}${line ? `, line ${line}` : ''}.` : '',
    lines.length ? `The lines around it:\n${lines.map((x) => `${String(x.n).padStart(4)}| ${x.text}`).join('\n')}` : '',
    o.log ? `What TeX’s log says about it:\n${str(o.log, 3000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  if (how === 'explain') {
    const r = await ask(db, { system: TEX_EXPLAIN_SYSTEM, prompt, signal, maxTokens: 800, timeoutMs: 60_000 });
    const text = r.text.replace(/```[\s\S]*?```/g, '').trim();
    if (!text) throw new HttpError(502, 'The helper model gave nothing back: try again');
    return { text, model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
  }
  if (!lines.length) throw new HttpError(400, 'Send the lines around the error (lines) to fix it');
  const r = await ask(db, { system: TEX_FIX_SYSTEM, prompt, signal, maxTokens: 3000, timeoutMs: 90_000 });
  const j = jsonIn(r.text);
  const why = str(j?.why, 400).trim();
  const from = Number(j?.from);
  const to = Number(j?.to);
  const first = lines[0].n;
  const last = lines[lines.length - 1].n;
  const by = { model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
  if (!j || !(from >= first && to >= from && to <= last) || typeof j.text !== 'string') return { text: why || 'It found no change on these lines that fixes it.', ...by };
  const text = str(j.text, 40_000).replace(/\n$/, '');
  const was = lines.filter((x) => x.n >= from && x.n <= to).map((x) => x.text).join('\n');
  if (text === was) return { text: why || 'It found no change on these lines that fixes it.', ...by };
  return { text: why || 'This change fixes it.', fix: { from, to, text }, ...by };
}

// ---- papers that back a claim ---------------------------------------------------------------------------------------

const UA = 'Hydor/1 (LaTeX citations; https://hydor.app)';

async function getJson<T>(url: string, signal: AbortSignal, accept = 'application/json'): Promise<{ status: number; data: T | null; text: string }> {
  const f = fetchForTests ?? fetch;
  const r = await f(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), headers: { 'user-agent': UA, accept } });
  const text = (await r.text()).slice(0, 3_000_000);
  let data: T | null = null;
  if (accept.includes('json'))
    try {
      data = JSON.parse(text) as T;
    } catch {}
  return { status: r.status, data, text };
}

interface OpenAlexWork {
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } | null } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  cited_by_count?: number;
  type?: string;
  ids?: { arxiv?: string };
}

type Found = Omit<TexCitePaper, 'backs' | 'why' | 'bibtex'> & { type?: string };

async function openAlex(q: string, signal: AbortSignal): Promise<Found[]> {
  const select = 'doi,display_name,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count,type,ids';
  const r = await getJson<{ results?: OpenAlexWork[] }>(`https://api.openalex.org/works?per-page=10&select=${select}&search=${encodeURIComponent(q)}`, signal);
  if (r.status >= 400) throw new Error(`OpenAlex answered ${r.status}`);
  return (r.data?.results ?? [])
    .map((w): Found | null => {
      const title = (w.display_name ?? w.title ?? '').replace(/<[^>]+>/g, '').trim();
      if (!title) return null;
      const doi = (w.doi ?? '').replace(/^https?:\/\/doi\.org\//i, '');
      const arxiv = /arxiv\.org\/abs\/([^\s/?#]+)/i.exec(w.ids?.arxiv ?? '')?.[1] ?? (/^10\.48550\/arxiv\.(.+)$/i.exec(doi)?.[1] ?? '');
      return {
        title,
        authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean).slice(0, 12),
        year: w.publication_year ?? undefined,
        venue: w.primary_location?.source?.display_name ?? undefined,
        ...(doi ? { doi } : {}),
        ...(arxiv ? { arxiv } : {}),
        abstract: invertedAbstract(w.abstract_inverted_index).slice(0, 2000),
        cited: w.cited_by_count,
        type: w.type,
      };
    })
    .filter((x): x is Found => !!x);
}

const xml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

async function arxivSearch(q: string, signal: AbortSignal): Promise<Found[]> {
  const terms = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
  if (!terms.length) return [];
  const r = await getJson<never>(`https://export.arxiv.org/api/query?max_results=6&search_query=${encodeURIComponent(terms.map((w) => `all:${w}`).join(' AND '))}`, signal, 'application/atom+xml');
  if (r.status >= 400) throw new Error(`arXiv answered ${r.status}`);
  const out: Found[] = [];
  for (const m of r.text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1];
    const tag = (name: string) => xml(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(body)?.[1] ?? '');
    const id = /arxiv\.org\/abs\/(.+?)(v\d+)?$/.exec(tag('id'))?.[1];
    if (!id) continue;
    out.push({
      title: tag('title'),
      authors: [...body.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => xml(a[1])).slice(0, 12),
      year: Number(/^(\d{4})/.exec(tag('published'))?.[1]) || undefined,
      venue: 'arXiv',
      arxiv: id,
      ...(tag('arxiv:doi') ? { doi: tag('arxiv:doi') } : {}),
      abstract: tag('summary').slice(0, 2000),
    });
  }
  return out;
}

const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** A paper's BibTeX, made from its record. */
export function bibOf(p: Found): string {
  const type = p.venue === 'arXiv' || (!p.doi && p.arxiv) ? 'misc' : p.type === 'article' || p.type === 'journal-article' ? 'article' : p.type === 'proceedings-article' ? 'inproceedings' : p.venue ? 'article' : 'misc';
  const fields: [string, string][] = [
    ['author', p.authors.join(' and ')],
    ['title', p.title],
    ['year', p.year ? String(p.year) : ''],
    [type === 'article' ? 'journal' : type === 'inproceedings' ? 'booktitle' : 'howpublished', p.venue === 'arXiv' && p.arxiv ? `arXiv:${p.arxiv}` : (p.venue ?? '')],
    ['doi', p.doi ?? ''],
    ...(p.arxiv ? ([['eprint', p.arxiv], ['archiveprefix', 'arXiv']] as [string, string][]) : []),
  ];
  const e: BibEntry = cleanBibEntry({ type, key: '', fields });
  return bibText({ ...e, key: bibKeyFor(e) });
}

export const TEX_CITE_QUERIES_SYSTEM =
  'You find the scholarly papers that back a claim from a paper being written. Answer with JSON only: {"queries": ["…", "…"]}: two or three short search queries (3 to 8 words each, the claim’s key terms and the names of methods, datasets or effects it states), the most telling first.';

export const TEX_CITE_JUDGE_SYSTEM = [
  'You judge which papers back a claim made in a paper being written, from their titles and abstracts. A paper backs it when its findings or its method support what the claim states, or it is the paper that introduced what the claim names.',
  'Answer with JSON only: {"papers": [{"n": its number, "backs": "strong"|"some"|"no", "why": "one short sentence: what in it backs the claim"}]}, every paper listed once.',
].join(' ');

export async function texCite(db: DB, b: unknown, signal: AbortSignal): Promise<TexCiteAnswer> {
  const o = (b ?? {}) as Record<string, unknown>;
  const claim = str(o.claim, 1500).replace(/\s+/g, ' ').trim();
  if (claim.length < 8) throw new HttpError(400, 'Pick the claim to find papers for (claim)');
  const context = str(o.context, 1500).replace(/\s+/g, ' ').trim();
  let model = '';
  let cost = 0;
  // The searches, as the helper model writes them (the claim's own words when it cannot).
  let queries: string[] = [];
  try {
    const r = await ask(db, { system: TEX_CITE_QUERIES_SYSTEM, prompt: [`The claim: ${claim}`, context ? `Around it: ${context}` : ''].filter(Boolean).join('\n\n'), signal, maxTokens: 400, timeoutMs: 60_000 });
    model = r.model;
    cost += r.cost ?? 0;
    const j = jsonIn(r.text);
    queries = (Array.isArray(j?.queries) ? j.queries : [])
      .filter((q): q is string => typeof q === 'string')
      .map((q) => q.replace(/\s+/g, ' ').trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 3);
  } catch (e) {
    if (signal.aborted) throw stopped();
  }
  if (!queries.length)
    queries = [
      claim
        .replace(/\\[A-Za-z]+\*?(\{[^{}]*\})?/g, ' ')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 10)
        .join(' '),
    ];
  const notes: string[] = [];
  const found: Found[] = [];
  const settled = await Promise.allSettled([...queries.map((q) => openAlex(q, signal)), arxivSearch(queries[0], signal)]);
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') found.push(...s.value);
    else if (!signal.aborted) {
      const where = i < queries.length ? 'OpenAlex' : 'arXiv';
      if (!notes.some((n) => n.startsWith(where))) notes.push(`${where} could not be searched (${(s.reason as Error).message}).`);
    }
  });
  if (signal.aborted) throw stopped();
  // One a title: the published one before its preprint; those with abstracts first.
  const byTitle = new Map<string, Found>();
  for (const f of found) {
    const k = titleKey(f.title);
    const had = byTitle.get(k);
    if (!had) byTitle.set(k, f);
    else byTitle.set(k, { ...f, ...had, abstract: had.abstract || f.abstract, doi: had.doi ?? f.doi, arxiv: had.arxiv ?? f.arxiv, cited: Math.max(had.cited ?? 0, f.cited ?? 0) || undefined });
  }
  const pool = [...byTitle.values()].sort((a, b) => Number(!!b.abstract) - Number(!!a.abstract) || (b.cited ?? 0) - (a.cited ?? 0)).slice(0, 14);
  if (!pool.length) {
    if (notes.length === settled.length || notes.length >= 2) throw new HttpError(502, `The papers could not be searched: ${notes.join(' ')}`);
    return { queries, papers: [], ...(notes.length ? { notes } : {}), ...(model ? { model } : {}), ...(cost ? { cost } : {}) };
  }
  const r = await ask(db, {
    system: TEX_CITE_JUDGE_SYSTEM,
    prompt: [`The claim: ${claim}`, context ? `Around it: ${context}` : '', 'The papers:', ...pool.map((p, i) => `${i + 1}. ${p.title} (${[p.authors.slice(0, 3).join(', '), p.year, p.venue].filter(Boolean).join(', ')})\n${p.abstract ? p.abstract.slice(0, 900) : '(no abstract)'}`)].filter(Boolean).join('\n\n'),
    signal,
    maxTokens: 2500,
    timeoutMs: 90_000,
  });
  model = r.model;
  cost += r.cost ?? 0;
  const j = jsonIn(r.text);
  const judged = new Map<number, { backs: string; why: string }>();
  for (const x of Array.isArray(j?.papers) ? j.papers : []) {
    const n = Number((x as { n?: unknown }).n);
    if (Number.isInteger(n) && n >= 1 && n <= pool.length) judged.set(n - 1, { backs: String((x as { backs?: unknown }).backs ?? ''), why: str((x as { why?: unknown }).why, 300).trim() });
  }
  const papers: TexCitePaper[] = [];
  pool.forEach((p, i) => {
    const v = judged.get(i);
    if (!v || (v.backs !== 'strong' && v.backs !== 'some')) return;
    const { type: _t, ...rest } = p;
    papers.push({ ...rest, backs: v.backs, why: v.why, bibtex: bibOf(p) });
  });
  papers.sort((a, b) => (a.backs === b.backs ? (b.cited ?? 0) - (a.cited ?? 0) : a.backs === 'strong' ? -1 : 1));
  return { queries, papers: papers.slice(0, 8), ...(notes.length ? { notes } : {}), model, ...(cost ? { cost } : {}) };
}

// ---- proofreading -----------------------------------------------------------------------------------------------------

export const TEX_PROOFREAD_SYSTEM = [
  'You proofread the text of a LaTeX document: spelling, grammar, punctuation, missing or doubled words, agreement, and words plainly wrong for what is meant. Not its style, and not what is right already: when in doubt, leave it.',
  'Change only words: never a command, maths, a key in \\cite, \\ref or \\label, or a % comment. Keep the author’s spelling (British or American) and their terms.',
  'Answer with JSON only: {"corrections": [{"p": the paragraph’s number, "find": "the words as they are in that paragraph, exactly, with a few around them so they are found once", "replace": "the same words corrected", "why": "what was wrong, in a few words"}]}; nothing to correct: {"corrections": []}.',
].join(' ');

/** A model's corrections checked: each found once in its paragraph, touching only words; as the smallest change. */
export function checkCorrections(paragraphs: { id: number; text: string }[], raw: unknown): TexCorrection[] {
  const out: TexCorrection[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const x = (c ?? {}) as Record<string, unknown>;
    const p = paragraphs.find((q) => q.id === Number(x.p));
    const find = typeof x.find === 'string' ? x.find : '';
    const replace = typeof x.replace === 'string' ? x.replace : '';
    if (!p || !find || find === replace || find.length > 600) continue;
    const at = p.text.indexOf(find);
    if (at < 0 || p.text.indexOf(find, at + 1) >= 0) continue;
    // Only words change: what must stay is the same before and after, and the change touches none of it.
    const a = texKept(find);
    const b = texKept(replace);
    if (JSON.stringify(a) !== JSON.stringify(b)) continue;
    const ch = smallestChange(find, replace);
    const from = at + ch.from;
    const to = at + ch.to;
    if (touchesProtected(texSpans(p.text), from, to)) continue;
    if (out.some((y) => y.id === p.id && y.from < Math.max(to, from + 1) && from < Math.max(y.to, y.from + 1))) continue;
    out.push({ id: p.id, from, to, was: p.text.slice(from, to), now: ch.insert, why: str(x.why, 200).trim() });
  }
  return out;
}

export async function texProofread(db: DB, b: unknown, signal: AbortSignal): Promise<TexProofreadAnswer> {
  const o = (b ?? {}) as Record<string, unknown>;
  const paragraphs = (Array.isArray(o.paragraphs) ? o.paragraphs : [])
    .filter((x): x is { id: number; text: string } => !!x && typeof (x as { id?: unknown }).id === 'number' && typeof (x as { text?: unknown }).text === 'string')
    .slice(0, 200);
  if (!paragraphs.length) throw new HttpError(400, 'Send the paragraphs to proofread');
  const total = paragraphs.reduce((n, p) => n + p.text.length, 0);
  if (total > TEX_AI_MAX) throw new HttpError(413, `That is over ${TEX_AI_MAX} characters at once: send fewer paragraphs`);
  const r = await ask(db, { system: TEX_PROOFREAD_SYSTEM, prompt: paragraphs.map((p) => `[${p.id}]\n${p.text}`).join('\n\n'), signal, maxTokens: 4000, timeoutMs: 120_000 });
  const j = jsonIn(r.text);
  return { corrections: checkCorrections(paragraphs, j?.corrections), model: r.model, ...(r.cost ? { cost: r.cost } : {}) };
}

// ---- the routes -------------------------------------------------------------------------------------------------------

export function latexWriteRoutes(app: FastifyInstance, db: DB) {
  app.post('/api/write/latex/rewrite', async (req, reply) => texRewrite(db, readRewrite(req.body), goneSignal(reply)));
  app.post('/api/write/latex/write', { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => texWrite(db, req.body, goneSignal(reply)));
  app.get('/api/write/latex/picture', async (): Promise<TexPictureReader> => {
    const { read: _r, ...r } = await pictureReader(db);
    return r;
  });
  app.post('/api/write/latex/picture', { bodyLimit: 12 * 1024 * 1024 }, async (req, reply) => texFromPicture(db, req.body, goneSignal(reply)));
  app.post('/api/write/latex/error', async (req, reply) => texError(db, req.body, goneSignal(reply)));
  app.post('/api/write/latex/cite', async (req, reply) => texCite(db, req.body, goneSignal(reply)));
  app.post('/api/write/latex/proofread', { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => texProofread(db, req.body, goneSignal(reply)));
}
