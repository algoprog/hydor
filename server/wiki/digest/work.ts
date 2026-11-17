// Wiki memory from a project's work: about once a day, and when a session has gone quiet, with memory on and Learn from
// conversations on (Settings → Memory), the helper reads the project's recent conversations (what the user wrote and the
// agents' last reply of each turn, never tool output) and adds what is worth keeping to the project's wiki, as it does for documents
// (digestText): each conversation is kept as a source, its articles are updated or added, the update is listed
// with the session it came from. No memory notes: memory's own learning from conversations does those. Sessions
// with memory off, confidential ones, child sessions and scheduled runs are never read (conversationsSince, turnsOf).
// A busy project has more conversations than a pass reads: those with the most signal go first (signal.ts), and a
// project has at most DAY_MAX of them read a day, by the daily pass and the quiet one together (reads.ts).
// All its state is in the database (the server restarts often): when it last ran, and where it stopped in each session
// (a session read is never read again; when it goes on, only its new turns are).
import { kvGet, kvSet, type DB } from '../../db.ts';
import { conversationsSince, turnsOf } from '../../memory/learn.ts';
import { learnOn, memoryOn } from '../../memory/store.ts';
import { redactSecrets } from '../../memory/secrets.ts';
import { allSpaces } from '../../spaces/index.ts';
import { wikiHash } from '../core.ts';
import { wikiMemoryOn, wikiSpaceOfSession } from '../roots.ts';
import { digestText } from './digest.ts';
import { helperDigestAsk, type DigestAsk } from './plan.ts';
import { dropReads, logRead, readsInDay } from './reads.ts';
import { conversationSignal, lastActivity } from './signal.ts';
import { digested, dropWorkMarks, setWorkMark, workMark } from './store.ts';

/** Conversations read at most for a project, and in one pass. */
export const PER_PROJECT = 4;
export const PER_PASS = 12;
/** The most of a conversation the helper reads, and the least that is worth reading. */
export const MAX_CONVO_CHARS = 12_000;
export const MIN_CONVO_CHARS = 600;
/** What one message of the user, and one reply, may take. */
const USER_CHARS = 1500;
const REPLY_CHARS = 1000;
/** A pass never looks further back than this. */
export const LOOK_BACK_MS = 14 * 86400_000;
/** A pass runs when the last was this long ago, and nobody has been working for this long. */
export const EVERY_MS = 20 * 3600_000;
export const QUIET_MS = 10 * 60_000;
/** A session is read when it has had no new turn for this long (besides the daily pass), at most DAY_MAX of a project's a day in all. */
export const QUIET_READ_MS = 30 * 60_000;
export const DAY_MAX = 8;
/** The most sessions one pass for quiet sessions reads. */
export const QUIET_PER_PASS = 4;
/** How often (and how soon after the start, when it never ran) the server looks whether a pass is due. */
export const CHECK_MS = 10 * 60_000;
export const FIRST_CHECK_MS = 2 * 60_000;

/** A session's read mark is kept this long (a session untouched for so long is not looked at again). */
const MARK_KEEP_MS = 60 * 86400_000;
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

/** Whether nobody has written to an agent (no conversation turn) for QUIET_MS. */
export function nobodyWriting(db: DB, now = Date.now()): boolean {
  const newest = (db.prepare('select max(ts) as ts from chunk_text').get() as { ts: number | null } | undefined)?.ts ?? 0;
  return now - newest >= QUIET_MS;
}

/** Whether a pass is due: the last was long enough ago, and no conversation turn was written in the last few minutes. */
export function wikiWorkDue(db: DB, now = Date.now()): boolean {
  const last = Number(kvGet(db, KV_AT)) || 0;
  if (now - last < EVERY_MS) return false;
  return nobodyWriting(db, now);
}

let running = false;

export interface WorkOptions {
  /** Whether an agent is working in the session or waits on the user: it is read in a later pass. */
  busy?: (key: string) => boolean;
  /** One project alone, now (Update now): its caps and exclusions kept, the daily pass's time left as it is. */
  only?: string;
}

interface Chosen {
  key: string;
  title: string;
  last: number;
  space: string;
  text: string;
  cut: boolean;
  hash: string;
  upto: number;
  continued: boolean;
}

/**
 * The conversations to read in a pass, best first: the sessions of the projects with wiki memory on (never a busy one,
 * and for `quiet` only one that has had no turn for QUIET_READ_MS), those with the most signal first, the latest first
 * among equals, at most `perProject` of a project (and what its day still has room for) and `total` in all. A session
 * whose text was read before (the same hash) is marked read, and a session with too little new text waits.
 */
function choose(db: DB, o: { now: number; floor: number; projects: Set<string>; busy?: (key: string) => boolean; quiet: boolean; perProject: number; total: number }): Chosen[] {
  const room = new Map<string, number>();
  const roomOf = (space: string) => {
    if (!room.has(space)) room.set(space, Math.min(o.perProject, Math.max(0, DAY_MAX - readsInDay(db, space, o.now))));
    return room.get(space)!;
  };
  // Cheap first: SQL and the indexed text only, for every conversation of a project that has room.
  const candidates: { key: string; title: string; last: number; space: string; since: number; mark?: ReturnType<typeof workMark>; score: number }[] = [];
  for (const c of conversationsSince(db, o.floor, 400)) {
    const space = wikiSpaceOfSession(db, c.key, c.cwd);
    if (!space || !o.projects.has(space) || roomOf(space) <= 0) continue;
    if (o.busy?.(c.key)) continue;
    const mark = workMark(db, c.key);
    if (mark && mark.upto >= c.last) continue;
    if (o.quiet && (c.last > o.now - QUIET_READ_MS || lastActivity(db, c.key) > o.now - QUIET_READ_MS)) continue;
    const since = Math.max(mark?.upto ?? 0, o.floor);
    candidates.push({ key: c.key, title: c.title, last: c.last, space, since, mark, score: conversationSignal(db, c.key, since).score });
  }
  candidates.sort((a, b) => b.score - a.score || b.last - a.last);
  const taken = new Map<string, number>();
  const chosen: Chosen[] = [];
  for (const c of candidates) {
    if (chosen.length >= o.total) break;
    if ((taken.get(c.space) ?? 0) >= roomOf(c.space)) continue;
    const turns = turnsOf(db, c.key, { since: c.since });
    // A turn the agent has not answered yet is read with its reply.
    while (turns.length && !turns[turns.length - 1].reply) turns.pop();
    if (!turns.length) continue;
    const upto = turns[turns.length - 1].at;
    const { text, cut } = conversationText(turns);
    const clean = redactSecrets(text);
    if (clean.length < MIN_CONVO_CHARS) continue;
    const hash = wikiHash(clean);
    if (digested(db, c.space, hash)) {
      setWorkMark(db, c.key, { space: c.space, upto, at: o.now });
      continue;
    }
    taken.set(c.space, (taken.get(c.space) ?? 0) + 1);
    chosen.push({ key: c.key, title: clip(c.title || 'untitled', 100), last: c.last, space: c.space, text: clean, cut, hash, upto, continued: !!c.mark });
  }
  return chosen;
}

/** Gives the chosen conversations to the helper, one at a time: each is marked read once the helper has answered. */
async function readChosen(db: DB, ask: DigestAsk | undefined, chosen: Chosen[], now: number, onUpdate?: (space: string | null) => void): Promise<number> {
  const helper = ask ?? helperDigestAsk(db);
  let read = 0;
  for (const c of chosen) {
    try {
      read++;
      logRead(db, c.space, c.key, now);
      const done = await digestText(db, helper, {
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
        continued: c.continued,
        now: () => now,
        onUpdate,
      });
      if (done) setWorkMark(db, c.key, { space: c.space, upto: c.upto, at: now });
    } catch (e) {
      console.warn(`[wiki] learning from session ${c.key}: ${(e as Error).message}`);
    }
  }
  return read;
}

const projectsWithWiki = (db: DB) => new Set(allSpaces(db).filter((s) => wikiMemoryOn(db, s.id)).map((s) => s.id));

/**
 * One pass over the projects' recent work. Returns how many conversations it read (0 when memory or learning is off,
 * or another pass is running). Errors are logged, never thrown. A session is read once: where each stopped is kept
 * (wiki_work_sessions), and when it goes on only its new turns are read. A session is marked once the helper has
 * answered; one that was busy, had no room, had too little new or failed is read in a later pass. Of a project's
 * sessions the ones with the most signal (commits, corrections, failures fixed, length) go first, the latest first among
 * equals, at most PER_PROJECT of a project and PER_PASS in all, and never more than DAY_MAX of a project in a day.
 */
export async function learnWikiFromWork(db: DB, ask: DigestAsk | undefined, now = Date.now(), onUpdate?: (space: string | null) => void, options: WorkOptions = {}): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    if (!memoryOn(db) || !learnOn(db)) return 0;
    const projects = projectsWithWiki(db);
    if (options.only) for (const p of [...projects]) if (p !== options.only) projects.delete(p);
    let read = 0;
    if (projects.size) read = await readChosen(db, ask, choose(db, { now, floor: now - LOOK_BACK_MS, projects, busy: options.busy, quiet: false, perProject: PER_PROJECT, total: PER_PASS }), now, onUpdate);
    if (options.only) return read;
    kvSet(db, KV_AT, String(now));
    dropWorkMarks(db, now - MARK_KEEP_MS);
    dropReads(db, now - 2 * 86400_000);
    return read;
  } catch (e) {
    console.warn(`[wiki] learning from the projects' work: ${(e as Error).message}`);
    return 0;
  } finally {
    running = false;
  }
}

/**
 * The sessions that went quiet: besides the daily pass, a session is read once it has had no new turn for QUIET_READ_MS
 * and holds at least MIN_CONVO_CHARS of new text, so a day's work reaches the wiki that day. Never a session an agent
 * is still working in (`busy`, and its last turn is old enough), the same exclusions as the daily pass, the most signal
 * first, at most QUIET_PER_PASS at a time and DAY_MAX a project a day (the daily pass counts). Returns how many it read.
 */
export async function learnWikiFromQuiet(db: DB, ask: DigestAsk | undefined, now = Date.now(), onUpdate?: (space: string | null) => void, options: WorkOptions = {}): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    if (!memoryOn(db) || !learnOn(db)) return 0;
    const projects = projectsWithWiki(db);
    if (!projects.size) return 0;
    return await readChosen(db, ask, choose(db, { now, floor: now - LOOK_BACK_MS, projects, busy: options.busy, quiet: true, perProject: DAY_MAX, total: QUIET_PER_PASS }), now, onUpdate);
  } catch (e) {
    console.warn(`[wiki] learning from quiet sessions: ${(e as Error).message}`);
    return 0;
  } finally {
    running = false;
  }
}
