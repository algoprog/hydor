// The design editor's writing helpers (web/src/features/pages/design): new words for a text element, and a palette
// from a mood. Each is one call to the helper model the user picked (Settings → Models), outside any session; nothing is
// kept but what the editor does with the answer (one step to undo there).
//   POST /api/write/design-words {about, role?: heading|subheading|body, now?, design?, lang?} → {text, model}
//   POST /api/write/palette      {mood} → {colours: ["#rrggbb", …5], model}
import type { FastifyInstance, FastifyReply } from 'fastify';
import { LANGS } from '../../shared/i18n.ts';
import { cleanLang } from '../../shared/write.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { helper, helperModelId, helperOptions } from '../helper.ts';
import { userLang } from '../language/index.ts';

type Ask = { system: string; prompt: string; signal?: AbortSignal };
let helperForTests: ((q: Ask) => Promise<string>) | null = null;
/** A stand-in for the helper model; null: the real one. */
export const setDesignHelperForTests = (f: typeof helperForTests) => void (helperForTests = f);

const ROLES = ['heading', 'subheading', 'body', 'button'] as const;
type Role = (typeof ROLES)[number];

export const WORDS_SYSTEM = [
  'You write the words of one text element of a design (a poster, a flyer, a social media post, a card), as Canva’s Magic Write does. Answer with the words alone: no quotes, no notes, nothing before or after them.',
  'A heading: two to six punchy words. A subheading: one short line. Body text: one or two short sentences. A button: two or three words that ask for an action.',
  'Invent no facts: no prices, dates, names or numbers the person did not give; leave them out instead.',
].join(' ');

export const PALETTE_SYSTEM = [
  'You choose a colour palette for a design from a mood. Answer with JSON only: {"colours": ["#rrggbb", …]} with five colours: a light background, a dark colour for words, a main accent, a second accent and a quiet tint.',
  'The words must read well on the background (strong contrast); the accents should go together and suit the mood.',
].join(' ');

const name = (db: DB) => {
  const id = helperModelId(db);
  return id === 'auto' ? 'Claude' : (helperOptions(db).options.find((x) => x.value === id)?.label ?? id);
};

async function ask(db: DB, q: Ask, maxTokens: number): Promise<{ text: string; model: string }> {
  try {
    if (helperForTests) return { text: await helperForTests(q), model: 'the test helper' };
    return { text: await helper(db, { ...q, timeoutMs: 60_000, maxTokens }), model: name(db) };
  } catch (e) {
    if (q.signal?.aborted) throw new HttpError(409, 'It was stopped');
    throw e instanceof HttpError ? e : new HttpError(502, `The helper model did not answer: ${(e as Error).message}`);
  }
}

/** The words the model gave: no quotes or line it put before them. */
export function cleanWords(raw: string, role: Role): string {
  let s = raw.replace(/\r\n?/g, '\n').trim();
  s = s.replace(/^```[\w-]*\n?|\n?```$/g, '').trim();
  s = s.replace(/^(?:here(?:'s| is| are)\b[^\n]*|sure\b[^\n]*)[:：]\s*\n+/i, '');
  if (/^["“«„'‘][\s\S]*["”»“'’]$/.test(s)) s = s.slice(1, -1).trim();
  if (role !== 'body') s = s.split('\n')[0].trim();
  return s.slice(0, role === 'body' ? 600 : 160);
}

/** Colours from the model's answer: #rrggbb, five at most, none twice. */
export function readColours(raw: string): string[] {
  const j = /\{[\s\S]*\}/.exec(raw)?.[0];
  let list: unknown[] = [];
  try {
    list = j ? ((JSON.parse(j) as { colours?: unknown[] }).colours ?? []) : [];
  } catch {}
  if (!list.length) list = raw.match(/#[0-9a-f]{6}\b/gi) ?? [];
  return [...new Set(list.filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim())).map((c) => c.trim().toLowerCase()))].slice(0, 5);
}

export function designWriteRoutes(app: FastifyInstance, db: DB, gone: (reply: FastifyReply) => AbortSignal) {
  app.post('/api/write/design-words', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const about = typeof b.about === 'string' ? b.about.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
    const now = typeof b.now === 'string' ? b.now.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
    if (!about && !now) throw new HttpError(400, 'Say what the words are about (about)');
    const role: Role = ROLES.includes(b.role as Role) ? (b.role as Role) : 'heading';
    const design = typeof b.design === 'string' ? b.design.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    const lang = cleanLang(b.lang) ?? LANGS.find((l) => l.id === userLang(db))?.english ?? 'English';
    const prompt = [`Write the ${role} of a design${design ? ` called “${design}”` : ''}, in ${lang}.`, about ? `It is about: ${about}` : '', now ? `Its words now (write new ones in their place): ${now}` : ''].filter(Boolean).join('\n');
    const r = await ask(db, { system: WORDS_SYSTEM, prompt, signal: gone(reply) }, 400);
    const text = cleanWords(r.text, role);
    if (!text) throw new HttpError(502, 'The helper model gave no words back: try again');
    return { text, model: r.model };
  });
  app.post('/api/write/palette', async (req, reply) => {
    const mood = typeof (req.body as Record<string, unknown> | null)?.mood === 'string' ? String((req.body as Record<string, unknown>).mood).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!mood) throw new HttpError(400, 'Say the mood (mood): warm and earthy, calm and fresh…');
    const r = await ask(db, { system: PALETTE_SYSTEM, prompt: `The mood: ${mood}`, signal: gone(reply) }, 300);
    const colours = readColours(r.text);
    if (colours.length < 3) throw new HttpError(502, 'The helper model gave no colours back: try again');
    return { colours, model: r.model };
  });
}
