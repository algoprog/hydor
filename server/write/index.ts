// The editors' writing helpers: design ideas for a slide (ideas.ts), the words picked rewritten, and a picture described
// for people who can't see it. Each is a call to a model outside any session, so nothing is kept but what the editor
// does with the answer (one step to undo there):
//   POST /api/write/design-ideas  {deck, slide, count?, avoid?} → {ideas, names, ways, model}: by the writer (the helper
//     model the user picked in Settings → Models, else Claude's Sonnet through Claude Code), a way each, at the same time.
//   POST /api/write/rewrite       {text, how, lang?, ask?, context?} → {text, model}: by the helper model (quick: Claude's
//     Haiku through Claude Code on Automatic), shorter, longer, simpler, more formal, friendlier, spelling and grammar
//     fixed, translated, or as the user says; facts, names and numbers kept, a paragraph a line as it came.
//   POST /api/write/describe      {src, context?} → {alt, by}: by the model that writes the Library's titles and
//     descriptions (Settings → Images, video and audio), in the language of the slide's words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyReply } from 'fastify';
import { LANGS } from '../../shared/i18n.ts';
import { readDeck } from '../pages/slides.ts';
import { ASSET, type Deck, type Slide } from '../../shared/slides.ts';
import { cleanLang, IDEA_WAYS, REWRITE_HOWS, REWRITE_MAX, type DescribeAnswer, type IdeasAnswer, type RewriteAnswer, type RewriteHow } from '../../shared/write.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { helper, helperModelId, helperOptions } from '../helper.ts';
import { writeWith, type WriteAsk } from '../images/writer.ts';
import { userLang } from '../language/index.ts';
import { captionWriter } from '../media/caption.ts';
import { still } from '../media/frames.ts';
import { getAsset } from '../pages/assets.ts';
import { pageSource } from '../pages/store.ts';
import { deckOf, holdIdea, IDEAS_SYSTEM, ideaPrompt, jsonOf, waysFor, type Way } from './ideas.ts';
import { sheetAiRoutes } from './sheets.ts';

// ---- stand-ins, for the tests --------------------------------------------------------------------------------------

type Ask = { system: string; prompt: string; signal?: AbortSignal };
let writerForTests: ((q: WriteAsk) => Promise<string>) | null = null;
let helperForTests: ((q: Ask) => Promise<string>) | null = null;
let seerForTests: ((q: Ask & { file: string }) => Promise<string>) | null = null;
/** Stand-ins for the writer, the helper model and the model that sees pictures; null: the real ones. */
export function setWriteForTests(o: { writer?: typeof writerForTests; helper?: typeof helperForTests; seer?: typeof seerForTests }) {
  if ('writer' in o) writerForTests = o.writer ?? null;
  if ('helper' in o) helperForTests = o.helper ?? null;
  if ('seer' in o) seerForTests = o.seer ?? null;
}

const stopped = () => new HttpError(409, 'It was stopped');

/** Aborted when the editor stops waiting (the panel closed, the page left). */
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

// ---- design ideas -------------------------------------------------------------------------------------------------

/** One idea drawn up in one way: asked again once, saying why, when it does not hold to the slide. */
async function oneIdea(db: DB, d: Deck, i: number, way: Way, signal: AbortSignal): Promise<{ slide: Slide; name: string; model: string } | { problem: string }> {
  let problem: string | undefined;
  for (let tries = 0; tries < 2; tries++) {
    if (signal.aborted) throw stopped();
    const q: WriteAsk = { system: IDEAS_SYSTEM, prompt: ideaPrompt(d, i, way, problem), timeoutMs: 150_000, signal };
    let text: string;
    let model = 'the test writer';
    try {
      if (writerForTests) text = await writerForTests(q);
      else ({ text, model } = await writeWith(db, q));
    } catch (e) {
      if (signal.aborted) throw stopped();
      return { problem: e instanceof HttpError ? e.message : `The model did not answer: ${(e as Error).message}` };
    }
    const raw = jsonOf(text);
    if (!raw) {
      problem = 'it was not JSON of the shape asked for: answer with the JSON alone.';
      continue;
    }
    const got = holdIdea(d, i, raw);
    if ('slide' in got) return { slide: got.slide, name: IDEA_WAYS[way.id] ?? way.id, model };
    problem = got.problem;
  }
  return { problem: problem ?? 'it did not hold.' };
}

/** A few ideas for a slide, a way each, drawn up at the same time; those that hold, in the ways' order. */
export async function designIdeas(db: DB, d: Deck, i: number, count: number, avoid: string[], signal: AbortSignal): Promise<IdeasAnswer> {
  const s = d.slides[i];
  if (!s) throw new HttpError(400, `slide: from 0 to ${d.slides.length - 1}`);
  if (!s.els.length) throw new HttpError(400, 'This slide is empty: put its words or pictures on it first, and its design ideas lay them out.');
  const ways = waysFor(s, count, avoid);
  const got = await Promise.all(ways.map((w) => oneIdea(db, d, i, w, signal)));
  const out: IdeasAnswer = { ideas: [], names: [], ways: [] };
  got.forEach((g, k) => {
    if (!('slide' in g)) return;
    out.ideas.push(g.slide);
    out.names.push(g.name);
    out.ways.push(ways[k].id);
    out.model ??= g.model;
  });
  if (!out.ideas.length) {
    const first = got.find((g): g is { problem: string } => 'problem' in g)?.problem ?? '';
    // The model could not be reached at all: its own words; else its designs did not hold.
    if (/^(Could not reach|The model did not answer|The helper model|It was stopped)/.test(first)) throw new HttpError(502, first);
    throw new HttpError(502, 'The designs the model drew up did not keep to the slide’s own words and pictures: ask for more ideas.');
  }
  return out;
}

// ---- rewriting the words picked -----------------------------------------------------------------------------------

const HOW: Record<Exclude<RewriteHow, 'translate' | 'ask'>, string> = {
  shorter: 'Make it shorter: about half as long, keeping what matters most.',
  longer: 'Make it longer: about half as long again, saying more of what it says (an example, a reason, a consequence that follows from it), never new facts, figures or names.',
  simpler: 'Make it simpler: plain everyday words and short sentences, easy for anyone to read.',
  formal: 'Make it more formal: professional and precise, without slang.',
  friendly: 'Make it friendlier: warm and personal, as if talking to the reader.',
  fix: 'Fix its spelling, grammar and punctuation, and change nothing else (not the words chosen, not the style). If nothing needs fixing, give it back as it is.',
};

export const REWRITE_SYSTEM = [
  'You rewrite words a person picked in their slides or document, as Canva’s Magic Write does. Answer with the new words alone: no quotes around them, no notes, nothing before or after them.',
  'Keep their meaning, their names, numbers and facts; add no facts. Keep their language unless you are asked to translate them.',
  'They come a paragraph or bullet a line: answer a paragraph or bullet a line too, as many lines as they had where you can, with no blank lines between them.',
  'Where some words are marked **bold** or *italic*, keep those marks around the same words (or the words that take their place); add none of your own.',
].join(' ');

/** What the helper model is asked. */
export function rewritePrompt(a: { text: string; how: RewriteHow; lang?: string; ask?: string; context?: string }): string {
  const what = a.how === 'translate' ? `Translate it into ${a.lang}, as a native speaker would write it.` : a.how === 'ask' ? `Rewrite it as the person asks: ${a.ask}` : HOW[a.how];
  return [what, a.context ? `For the sense only (do not rewrite it): it is in ${a.context}` : '', `The words:\n${a.text}`].filter(Boolean).join('\n\n');
}

/** The new words from the model's answer: no fence, preamble or quotes it added, its lines as the words had them. */
export function cleanRewrite(raw: string, before: string): string {
  let s = raw.replace(/\r\n?/g, '\n').trim();
  const fence = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(s);
  if (fence) s = fence[1].trim();
  // A line said before the words ("Here is a shorter version:").
  s = s.replace(/^(?:here(?:'s| is| are)\b[^\n]*|sure\b[^\n]*|certainly\b[^\n]*|of course\b[^\n]*)[:：]\s*\n+/i, '');
  const quoted = (t: string) => /^["“«„'‘][\s\S]*["”»“'’]$/.test(t);
  if (quoted(s) && !quoted(before.trim())) s = s.slice(1, -1).trim();
  // Blank lines the words did not have.
  if (!/\n\s*\n/.test(before)) s = s.replace(/\n\s*\n+/g, '\n');
  // Marks the words did not have.
  if (!before.includes('**')) s = s.replace(/\*\*(.+?)\*\*/g, '$1');
  if (!/(^|[^*])\*[^*\s]/.test(before)) s = s.replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1$2');
  return s.slice(0, REWRITE_MAX * 2).trim();
}

function readRewrite(b: unknown) {
  const o = (b ?? {}) as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text.replace(/\r\n?/g, '\n') : '';
  if (!text.trim()) throw new HttpError(400, 'Pick some words to rewrite (text)');
  if (text.length > REWRITE_MAX) throw new HttpError(413, `That is over ${REWRITE_MAX} characters: pick fewer words to rewrite at once`);
  const how = REWRITE_HOWS.includes(o.how as RewriteHow) ? (o.how as RewriteHow) : null;
  if (!how) throw new HttpError(400, `how: one of ${REWRITE_HOWS.join(', ')}`);
  const lang = how === 'translate' ? cleanLang(o.lang) : null;
  if (how === 'translate' && !lang) throw new HttpError(400, 'Say which language to translate the words into (lang)');
  const ask = how === 'ask' && typeof o.ask === 'string' ? o.ask.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  if (how === 'ask' && !ask) throw new HttpError(400, 'Say how to rewrite the words (ask)');
  const context = typeof o.context === 'string' ? o.context.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
  return { text, how, ...(lang ? { lang } : {}), ...(ask ? { ask } : {}), ...(context ? { context } : {}) };
}

export async function rewrite(db: DB, a: ReturnType<typeof readRewrite>, signal: AbortSignal): Promise<RewriteAnswer> {
  const q = { system: REWRITE_SYSTEM, prompt: rewritePrompt(a), signal };
  let raw: string;
  try {
    raw = helperForTests ? await helperForTests(q) : await helper(db, { ...q, timeoutMs: 60_000, maxTokens: 4000 });
  } catch (e) {
    if (signal.aborted) throw stopped();
    throw e instanceof HttpError ? e : new HttpError(502, `The helper model did not answer: ${(e as Error).message}`);
  }
  const text = cleanRewrite(raw, a.text);
  if (!text) throw new HttpError(502, 'The helper model gave no words back: try again');
  return { text, model: helperForTests ? 'the test helper' : helperName(db) };
}

// ---- a picture described ---------------------------------------------------------------------------------------------

const DESCRIBE_SYSTEM = [
  'You write the description of a picture on a slide or in a document for people who can’t see it (its alt text), as a screen reader will read it.',
  'Say what it shows that matters to someone following the slide: the subject, what is happening, any words or numbers in it that carry meaning; for a chart or a diagram, what it shows.',
  'One or two plain sentences, at most 35 words, without “Image of”, “Picture of” or “This image”. Answer with JSON only: {"alt": "…"}.',
].join(' ');

/** An answer that says the model could not see the picture, rather than describing it. */
const CANNOT_SEE = /\b(could not|couldn['’]t|cannot|can['’]t|unable to|am not able to)\b.{0,30}\b(see|seen|view|process|read|load|access|open|make out)\w*|\bno (image|picture) (was |is )?(provided|attached|given|shown)\b/i;

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** The description in a model's answer: its JSON's, else its first line, tidied. */
export function readAlt(raw: string): string {
  const j = jsonOf(raw);
  const s =
    typeof j?.alt === 'string'
      ? j.alt
      : (raw
          .replace(/```(?:json)?/gi, '')
          .trim()
          .split('\n')[0] ?? '');
  return s
    .replace(/^["'“‘«]+|["'”’»]+$/g, '')
    .replace(/^(an? )?(image|picture|photo(graph)?) (of|showing) /i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
    .slice(0, 300);
}

export async function describe(db: DB, d: Pick<Deps, 'models'>, b: unknown, signal: AbortSignal): Promise<DescribeAnswer> {
  const o = (b ?? {}) as Record<string, unknown>;
  const src = typeof o.src === 'string' ? o.src.trim() : '';
  const sha = src.startsWith(ASSET) ? src.slice(ASSET.length) : '';
  if (!/^[a-f0-9]{16,64}$/.test(sha)) throw new HttpError(400, 'src: a picture the app keeps (naget-asset:…)');
  const a = getAsset(db, sha);
  if (!a) throw new HttpError(404, 'That picture is no longer kept here');
  if (!EXT[a.mime]) throw new HttpError(415, a.mime === 'image/svg+xml' ? 'A drawing (SVG) can’t be shown to the model that describes pictures: describe it in its box yourself' : 'That is not a picture the model can look at');
  const context = typeof o.context === 'string' ? o.context.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  const lang = LANGS.find((l) => l.id === userLang(db))?.english ?? 'English';
  const prompt = ['Write the description of this picture.', context ? `It is on a slide that says: “${context}”. Write it in the language those words are in.` : `Write it in ${lang}.`].join('\n');
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-describe-'));
  try {
    const file = path.join(tmp, `picture.${EXT[a.mime]}`);
    await fs.promises.writeFile(file, a.data);
    // A smaller copy where ffmpeg is here (the model needs no more); else the picture itself, when it is not too large to send.
    const small = path.join(tmp, 'small.jpg');
    const pic = (await still(file, small, { width: 1024 })) ? small : a.data.length <= 5 * 1024 * 1024 ? file : null;
    if (!pic) throw new HttpError(413, 'That picture is too large to describe here');
    let raw: string;
    let by = 'the test model';
    if (seerForTests) raw = await seerForTests({ system: DESCRIBE_SYSTEM, prompt, file: pic, signal });
    else {
      const w = await captionWriter(db, d);
      if ('why' in w) throw new HttpError(400, w.why);
      by = w.label;
      try {
        raw = await w.ask(DESCRIBE_SYSTEM, prompt, pic, AbortSignal.any([signal, AbortSignal.timeout(120_000)]));
      } catch (e) {
        if (signal.aborted) throw stopped();
        throw new HttpError(502, `${w.label} did not answer: ${(e as Error).message}`);
      }
    }
    const alt = readAlt(raw);
    if (!alt) throw new HttpError(502, 'The model gave no description: try again');
    if (CANNOT_SEE.test(alt)) throw new HttpError(502, `${by === 'the test model' ? 'The model' : by} could not see the picture: describe it in its box yourself, or try again`);
    return { alt, by };
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}

// ---- the routes ----------------------------------------------------------------------------------------------------

/** A saved deck by its id (null when there is none, or the page is not a deck). */
function savedDeck(db: DB, id: string): Deck | null {
  const src = pageSource(db, id);
  if (!src || src.kind !== 'slides') return null;
  return readDeck(src.text);
}

export const write: Feature = {
  id: 'write',
  routes({ app, db, models }) {
    app.post('/api/write/design-ideas', { bodyLimit: 16 * 1024 * 1024 }, async (req, reply) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const d = deckOf(b.deck, (id) => savedDeck(db, id));
      const slide = typeof b.slide === 'number' && Number.isInteger(b.slide) ? b.slide : -1;
      if (slide < 0 || slide >= d.slides.length) throw new HttpError(400, `slide: the slide's place, from 0 to ${d.slides.length - 1}`);
      const count = typeof b.count === 'number' && Number.isFinite(b.count) ? Math.max(1, Math.min(4, Math.round(b.count))) : 3;
      const avoid = Array.isArray(b.avoid) ? b.avoid.filter((x): x is string => typeof x === 'string').slice(0, 40) : [];
      return designIdeas(db, d, slide, count, avoid, goneSignal(reply));
    });
    app.post('/api/write/rewrite', async (req, reply) => rewrite(db, readRewrite(req.body), goneSignal(reply)));
    app.post('/api/write/describe', async (req, reply) => describe(db, { models }, req.body, goneSignal(reply)));
    // The spreadsheet editor's AI helpers (sheets.ts).
    sheetAiRoutes(app, db);
  },
};
