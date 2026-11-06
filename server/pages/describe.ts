// Descriptions of what comes into the Library without one: a file added (dropped on the Library, opened in New, saved
// to it from Files or a conversation), a page kept from a conversation, or an agent's save that left it out. The helper
// model (Settings → Models) reads the start of it and says what it is in a few sentences, as the agent that saves
// something does (at most DESCRIPTION_WORDS words); the Library's search, the search box and agents then find it by
// it. One at a time, in the background, so adding a folder of files never waits for it. A description written
// meanwhile (by the user, or an agent) stays. What a confidential session saved is read only by a helper model that
// runs on this computer, when there is one. Without a helper that answers, it stays without one, found by its title.
import { cleanDescription, DESCRIPTION_WORDS } from '../../shared/pages.ts';
import { confidentialKey } from '../confidential/index.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { helper, localHelper } from '../helper.ts';
import { htmlText } from '../web/fetch.ts';
import { kindOf } from './kinds.ts';
import { describePage, pageInfo, pageSource } from './store.ts';

/** How much of it the helper reads, in characters: its start says what it is. */
const READ = 6000;

const SYSTEM = [
  `You write the description of something kept in a person's library (a page, a slide deck, a document, a spreadsheet, a LaTeX document or a notebook), so that they and their agents find it again by searching.`,
  `In at most ${DESCRIPTION_WORDS} words, and best in two or three sentences: what it is, what it holds or covers, and what it is for, with the names, topics, places and dates someone would search for.`,
  'Write in the language the item is written in. Answer with the description alone: no title, no quotes, no lead-in such as "This document".',
].join(' ');

type D = Pick<Deps, 'db' | 'broadcast'>;

const waiting: string[] = [];
let running = false;
/** Descriptions are written once the app has started (pages' start), so a test's saves never reach a model; `ask`, a test's stand-in for the helper. */
let enabled = false;
let asker: typeof helper = helper;
export function enableDescriptions(ask: typeof helper = helper) {
  enabled = true;
  asker = ask;
}

/** Has a description written for the page when it has none: soon, after the ones before it (a folder brought in is described one file after another). */
export function describeLater(d: D, id: string) {
  if (!enabled || waiting.includes(id)) return;
  waiting.push(id);
  void pump(d);
}

async function pump(d: D) {
  if (running) return;
  running = true;
  try {
    while (waiting.length) {
      const id = waiting.shift()!;
      await describeNow(d, id).catch((e) => console.warn(`[pages] description of ${id}: ${(e as Error)?.message ?? e}`));
    }
  } finally {
    running = false;
  }
}

/** What the helper reads of a page: its title, its kind and the start of its text. */
function readOf(db: DB, id: string): string {
  const src = pageSource(db, id);
  if (!src) return '';
  const k = src.kind === 'page' ? null : kindOf(src.kind);
  const text = (k ? k.forAgent(src.text) : htmlText(src.text)).replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, READ);
}

/**
 * Writes the page's description now (the helper's answer, cut to DESCRIPTION_WORDS words), unless it has one or there
 * is nothing in it to describe; tells the pages. The description written, or null.
 */
export async function describeNow(d: D, id: string, ask: typeof helper = asker): Promise<string | null> {
  const p = pageInfo(d.db, id);
  if (!p || p.description || p.app) return null;
  const text = readOf(d.db, id);
  if (!text) return null;
  // A confidential session's: only a model on this computer reads it.
  const local = p.sessionKey && confidentialKey(d.db, p.sessionKey) ? localHelper(d.db) : undefined;
  if (local === null) return null;
  const noun = kindOf(p.kind)?.noun ?? 'page';
  const raw = await ask(d.db, { system: SYSTEM, prompt: `Its title: ${p.title}\nWhat it is: a ${noun}\n\nIts start:\n${text}`, maxTokens: 400, timeoutMs: 120_000, ...(local ? { model: local } : {}) });
  const description = cleanDescription(raw.replace(/^\s*(?:description:\s*)?["“]?|["”]?\s*$/gi, ''));
  // Written meanwhile (by the user, or an agent): theirs stays.
  if (!description || pageInfo(d.db, id)?.description) return null;
  describePage(d.db, id, description);
  d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
  return description;
}
