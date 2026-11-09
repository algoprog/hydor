// Memory across sessions: what agents know about the user (global), a project (repo) and a session, and the
// user's profile (profile.ts, a capability of its own so its block follows the user's guidelines). Agents save
// notes with their tools, when the user asks or they learn something lasting, and the user in Settings; a note
// under a reply shows what the agent changed there. Agents start with the notes that bear on the request, found
// by words and, when that is on, by meaning (search.ts, embed.ts), and an index of the rest (inject.ts): once, in
// the instructions they start with. Custom gets its block before its first turn and keeps it until its
// conversation is condensed, so its provider's cache of the conversation holds; a session's block is kept, and
// one that goes on within the hour gets it again unchanged. About once a day, whenever the app is on and there is
// something new, the helper model tidies memory up and, unless that is turned off, learns from the conversations
// since (tidy.ts); notes past their end date go within minutes. Settings → Memory turns it off for all sessions, a session's menu for one. Claude Code's and Codex's
// own memories stay off in the sessions the app runs: these notes are the one memory every agent shares.
import type { Agent } from '../../shared/types.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import type { Deps, Feature, SpawnAdditions } from '../features/types.ts';
import { kick, warmMeaning, watchNotes } from './embed.ts';
import { noteChanges } from './extract.ts';
import { memoryInstructions } from './inject.ts';
import { memoryRoutes } from './routes.ts';
import { expireDue, keepBlock, keptBlock, learnOn, memoryOn, sessionMemoryOn, setCursor, sweep, tidyOn } from './store.ts';
import { helperAsk, tidy, tidyDue, titlesFor, untitled } from './tidy.ts';
import { memoryTools } from './tools.ts';
import { startTranscriptVectors } from './transcripts.ts';

/**
 * Each agent's own memory stays off in the sessions the app runs: Claude Code's auto memory (a folder of files only
 * it reads) and Codex's memories. Hydor's notes are the one memory every agent shares and the user can see and
 * undo, and a session with memory off keeps nothing anywhere.
 */
export function ownMemoryOff(agent: Agent): SpawnAdditions {
  if (agent === 'claude') return { env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } };
  if (agent === 'codex') return { codexConfig: { features: { memories: false } } };
  return {};
}

/** A session's memory block: the one it was given while that holds (store.ts keptBlock), else made now and kept. */
async function blockFor(d: Pick<Deps, 'db'>, key: string | undefined, flavor: string, epoch: number, make: () => Promise<string>): Promise<string> {
  if (!key) return make();
  const kept = keptBlock(d.db, key, flavor, epoch);
  if (kept != null) return kept;
  const text = await make();
  keepBlock(d.db, key, flavor, epoch, text);
  return text;
}

/** Wait after a turn ends, so turns in quick succession are read together. */
const SETTLE_MS = 1500;
const timers = new Map<string, NodeJS.Timeout>();

/** The latest thing the user asked in a session, to put the notes that bear on it first. */
async function lastAsk(d: Deps, key?: string): Promise<string | undefined> {
  if (!key) return undefined;
  try {
    const items = (await d.sessions.timeline(key)).parser.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === 'user' && !it.meta && it.text.trim()) return it.text.slice(0, 2000);
    }
  } catch {}
  return undefined;
}

const changed = (d: Deps) => d.broadcast({ t: 'feature', id: 'memory', data: { changed: true } });
/** When a try at titles last came back with none, and when one last ran. */
let titlesFailed = 0;
let titlesAt = 0;
/** How often the upkeep looks at what is due: often enough that a computer on for a short while still gets it. */
const UPKEEP_MS = 10 * 60_000;

function schedule(d: Deps, key: string) {
  clearTimeout(timers.get(key));
  const t = setTimeout(() => {
    timers.delete(key);
    readTurns(d, key).catch((e) => console.warn(`[memory] ${key}: ${(e as Error)?.message ?? e}`));
  }, SETTLE_MS);
  t.unref?.();
  timers.set(key, t);
}

async function readTurns(d: Deps, key: string) {
  const { db } = d;
  // A new turn already started: it is read with this one once it ends.
  if (['working', 'waiting', 'starting'].includes(d.sessions.summary(key)?.live?.status ?? '')) return;
  const tl = await d.sessions.timeline(key);
  await tl.readMore();
  const items = tl.parser.items;
  // Memory off (for all, or this session): those turns are passed over for good.
  if (!sessionMemoryOn(db, key)) return setCursor(db, key, items[items.length - 1]?.id);
  if (noteChanges(db, { key, items }).changes.length) changed(d);
}

export const memory: Feature = {
  id: 'memory',
  routes: memoryRoutes,
  tools: memoryTools,
  async spawn(s, d) {
    const own = ownMemoryOff(s.agent);
    if (!memoryOn(d.db) || s.extra.memory === false) return own;
    // Custom reads its memory with its first turn, and again once its conversation is condensed (context below).
    if (s.agent === 'acp' && s.acpAgent === CONSOLE_ID) return own;
    const text = await blockFor(d, s.key, 'full', 0, async () => {
      const query = s.prompt?.trim() || (s.resume ? await lastAsk(d, s.key) : undefined);
      return memoryInstructions(d.db, { cwd: s.cwd, key: s.key, session: s.resume, query });
    });
    return { ...own, instructions: [text] };
  },
  async context(s, d) {
    // A confidential session reads memory and keeps nothing in it (server/confidential).
    const reads = s.extra.confidential === true;
    if (!memoryOn(d.db) || (s.extra.memory === false && !reads)) return null;
    // The same block until the conversation is condensed (`epoch`), so the instructions stay as the provider cached them.
    return blockFor(d, s.key, reads ? 'read' : 'full', s.epoch ?? 0, async () =>
      memoryInstructions(d.db, { cwd: s.cwd, key: s.key, session: true, query: await lastAsk(d, s.key), readOnly: reads }),
    );
  },
  turnEnd(t, d) {
    // Only sessions this app runs, and turns that ended with a reply. With memory off they are still
    // marked as read, so turning it back on does not reach back into them.
    if (t.external || t.status !== 'idle') return;
    schedule(d, t.key);
  },
  start(d) {
    watchNotes(d.db);
    startTranscriptVectors(d.db);
    void kick(d.db).catch((e) => console.warn(`[memory] search by meaning: ${(e as Error).message}`));
    // A scheduled task due within the minute (not a watcher's look): search by meaning's model starts now, so the notes
    // and skills its first message gets are found by meaning too (a start waits only for a model about to be up: embed.ts).
    const dueSoon = setInterval(() => {
      try {
        if (!memoryOn(d.db)) return;
        const now = Date.now();
        const rows = d.db.prepare('select schedule from tasks where enabled = 1 and next_at between ? and ?').all(now - 30_000, now + 45_000) as { schedule: string }[];
        if (rows.some((r) => (JSON.parse(r.schedule) as { kind?: string }).kind !== 'watch')) warmMeaning(d.db);
      } catch {
        // No tasks table yet, or a schedule that does not read: nothing to start for.
      }
    }, 20_000);
    dueSoon.unref?.();
    const daily = () => {
      try {
        sweep(d.db);
      } catch (e) {
        console.warn(`[memory] sweep: ${(e as Error).message}`);
      }
    };
    const upkeep = () => {
      try {
        if (expireDue(d.db)) changed(d);
      } catch (e) {
        console.warn(`[memory] expiry: ${(e as Error).message}`);
      }
      const now = Date.now();
      if (memoryOn(d.db) && tidyOn(d.db) && tidyDue(d.db, now))
        void tidy(d.db, helperAsk(d.db), { learn: learnOn(d.db) }).then((r) => {
          if (r.error) console.warn(`[memory] tidy-up: ${r.error}`);
          changed(d);
        });
      // New notes get their titles for the index within the hour, not only with the tidy-up (after a try that titled
      // nothing, not again for half a day).
      else if (memoryOn(d.db) && tidyOn(d.db) && now - titlesAt > 3600_000 && now - titlesFailed > 12 * 3600_000 && untitled(d.db) > 0) {
        titlesAt = now;
        void titlesFor(d.db, helperAsk(d.db), now)
          .then((n) => void (n || (titlesFailed = Date.now())))
          .catch((e) => {
            titlesFailed = Date.now();
            console.warn(`[memory] titles: ${(e as Error).message}`);
          });
      }
    };
    setTimeout(daily, 60_000).unref();
    setInterval(daily, 24 * 3600_000).unref();
    setTimeout(upkeep, 2 * 60_000).unref();
    setInterval(upkeep, UPKEEP_MS).unref();
  },
};
