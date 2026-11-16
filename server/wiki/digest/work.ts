// Wiki memory from a project's work: about once a day, with memory on and Learn from conversations on (Settings →
// Memory), the helper reads the project's recent conversations (what the user wrote and the agents' last reply of each
// turn, never tool output) and adds what is worth keeping to the project's wiki, as it does for documents
// (digestText): each conversation is kept as a source, its articles are updated or added, the update is listed
// with the session it came from. No memory notes: memory's own learning from conversations does those. Sessions
// with memory off, confidential ones, child sessions and scheduled runs are never read (conversationsSince, turnsOf).
// All its state is in the database (the server restarts often): when it last ran, and where it read up to.
import { kvGet, kvSet, type DB } from '../../db.ts';
import { conversationsSince, turnsOf } from '../../memory/learn.ts';
import { learnOn, memoryOn } from '../../memory/store.ts';
import { redactSecrets } from '../../memory/secrets.ts';
import { allSpaces } from '../../spaces/index.ts';
import { wikiHash } from '../core.ts';
import { wikiMemoryOn, wikiSpaceOfSession } from '../roots.ts';
import { digestText } from './digest.ts';
import { helperDigestAsk, type DigestAsk } from './plan.ts';
import { digested } from './store.ts';

/** Conversations read at most for a project, and in one pass. */
export const PER_PROJECT = 4;
export const PER_PASS = 12;
/** The most of a conversation the helper reads, and the least that is worth reading. */
export const MAX_CONVO_CHARS = 12_000;
export const MIN_CONVO_CHARS = 600;
/** What one message of the user, and one reply, may take. */
const USER_CHARS = 1500;
const REPLY_CHARS = 1000;
/** The first time (and never further back than this), a pass looks back this far. */
export const LOOK_BACK_MS = 14 * 86400_000;
/** A pass runs when the last was this long ago, and nobody has been working for this long. */
export const EVERY_MS = 20 * 3600_000;
export const QUIET_MS = 10 * 60_000;
/** How often (and how soon after the start, when it never ran) the server looks whether a pass is due. */
export const CHECK_MS = 10 * 60_000;
export const FIRST_CHECK_MS = 2 * 60_000;

const KV_SINCE = 'wiki.work.since';
const KV_AT = 'wiki.work.at';

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const clip = (t: string, n: number) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/** A conversation as the helper reads it: its first request, then its latest turns, within `max` characters. */
export function conversationText(turns: { user: string; reply: string }[], max = MAX_CONVO_CHARS): { text: string; cut: boolean } {
  const lines = turns.map((t) => [`User: ${clip(t.user, USER_CHARS)}`, ...(t.reply ? [`Agent: ${clip(t.reply, REPLY_CHARS)}`] : [])].join('\n'));
  if (!lines.length) return { text: '', cut: false };
  let room = max - lines[0].length;
  const tail: string[] = [];
  let used = 1;
  for (let j = lines.length - 1; j >= 1 && room > 0; j--) {
    if (lines[j].length + 2 > room) break;
    tail.unshift(lines[j]);
    room -= lines[j].length + 2;
    used++;
  }
  const cut = used < lines.length;
  return { text: [lines[0].slice(0, max), ...(cut ? ['(turns in between are left out)'] : []), ...tail].join('\n\n'), cut };
}

/** Whether a pass is due: the last was long enough ago, and no conversation turn was written in the last few minutes. */
export function wikiWorkDue(db: DB, now = Date.now()): boolean {
  const last = Number(kvGet(db, KV_AT)) || 0;
  if (now - last < EVERY_MS) return false;
  const newest = (db.prepare('select max(ts) as ts from chunk_text').get() as { ts: number | null } | undefined)?.ts ?? 0;
  return now - newest >= QUIET_MS;
}

let running = false;

/**
 * One pass over the projects' recent work. Returns how many conversations it read (0 when memory or learning is off,
 * or another pass is running). Errors are logged, never thrown.
 */
export async function learnWikiFromWork(db: DB, ask: DigestAsk | undefined, now = Date.now(), onUpdate?: (space: string | null) => void): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    if (!memoryOn(db) || !learnOn(db)) return 0;
    const since = Math.max(Number(kvGet(db, KV_SINCE)) || 0, now - LOOK_BACK_MS);
    const projects = new Map(allSpaces(db).filter((s) => wikiMemoryOn(db, s.id)).map((s) => [s.id, s]));
    let read = 0;
    if (projects.size) {
      // The latest conversations first, at most PER_PROJECT of a project and PER_PASS in all.
      const perProject = new Map<string, number>();
      const chosen: { key: string; title: string; last: number; space: string; text: string; cut: boolean; hash: string }[] = [];
      for (const c of conversationsSince(db, since, 400)) {
        if (chosen.length >= PER_PASS) break;
        const space = wikiSpaceOfSession(db, c.key, c.cwd);
        if (!space || !projects.has(space) || (perProject.get(space) ?? 0) >= PER_PROJECT) continue;
        const turns = turnsOf(db, c.key, { since });
        if (!turns.length) continue;
        const { text, cut } = conversationText(turns);
        const clean = redactSecrets(text);
        if (clean.length < MIN_CONVO_CHARS) continue;
        const hash = wikiHash(clean);
        if (digested(db, space, hash)) continue;
        perProject.set(space, (perProject.get(space) ?? 0) + 1);
        chosen.push({ key: c.key, title: clip(c.title || 'untitled', 100), last: c.last, space, text: clean, cut, hash });
      }
      const helper = ask ?? helperDigestAsk(db);
      for (const c of chosen) {
        try {
          read++;
          await digestText(db, helper, {
            space: c.space,
            base: 'sessions',
            title: c.title,
            path: `session:${c.key}`,
            origin: `session:${c.title} · ${day(c.last)}`,
            text: c.text,
            cut: c.cut,
            kind: 'conversation',
            notes: false,
            hash: c.hash,
            now: () => now,
            onUpdate,
          });
        } catch (e) {
          console.warn(`[wiki] learning from session ${c.key}: ${(e as Error).message}`);
        }
      }
    }
    kvSet(db, KV_SINCE, String(now));
    kvSet(db, KV_AT, String(now));
    return read;
  } catch (e) {
    console.warn(`[wiki] learning from the projects' work: ${(e as Error).message}`);
    return 0;
  } finally {
    running = false;
  }
}
