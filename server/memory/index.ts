// Memory across sessions: what agents know about the user (global), a project (repo) and a session. Agents
// save notes with their tools, when the user asks or they learn something lasting, and the user in
// Settings; a note under a reply shows what the agent changed there. Agents get the notes that fit when they
// start (Custom before each turn), those bearing on the request first: found by words, and by meaning when
// that is on (embed.ts). Each night the helper model tidies memory up (tidy.ts), and every hour notes past
// their end date go. Settings → Memory turns it off for all sessions, a session's menu for one.
import { CONSOLE_ID } from '../agents/acp.ts';
import type { Deps, Feature } from '../features/types.ts';
import { kick, watchNotes } from './embed.ts';
import { noteChanges } from './extract.ts';
import { memoryInstructions } from './inject.ts';
import { memoryRoutes } from './routes.ts';
import { expireDue, memoryOn, sessionMemoryOn, setCursor, sweep, tidyOn } from './store.ts';
import { helperAsk, tidy, tidyDue } from './tidy.ts';
import { memoryTools } from './tools.ts';

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
    if (!memoryOn(d.db) || s.extra.memory === false) return;
    // Custom reads its memory before each turn (context below).
    if (s.agent === 'acp' && s.acpAgent === CONSOLE_ID) return;
    const query = s.prompt?.trim() || (s.resume ? await lastAsk(d, s.key) : undefined);
    return { instructions: [await memoryInstructions(d.db, { cwd: s.cwd, key: s.key, session: s.resume, query })] };
  },
  async context(s, d) {
    if (!memoryOn(d.db) || s.extra.memory === false) return null;
    return memoryInstructions(d.db, { cwd: s.cwd, key: s.key, session: true, query: await lastAsk(d, s.key) });
  },
  turnEnd(t, d) {
    // Only sessions this app runs, and turns that ended with a reply. With memory off they are still
    // marked as read, so turning it back on does not reach back into them.
    if (t.external || t.status !== 'idle') return;
    schedule(d, t.key);
  },
  start(d) {
    watchNotes(d.db);
    void kick(d.db).catch((e) => console.warn(`[memory] search by meaning: ${(e as Error).message}`));
    const daily = () => {
      try {
        sweep(d.db);
      } catch (e) {
        console.warn(`[memory] sweep: ${(e as Error).message}`);
      }
    };
    const hourly = () => {
      try {
        if (expireDue(d.db)) changed(d);
      } catch (e) {
        console.warn(`[memory] expiry: ${(e as Error).message}`);
      }
      if (memoryOn(d.db) && tidyOn(d.db) && tidyDue(d.db))
        void tidy(d.db, helperAsk(d.db)).then((r) => {
          if (r.error) console.warn(`[memory] tidy-up: ${r.error}`);
          changed(d);
        });
    };
    setTimeout(daily, 60_000).unref();
    setInterval(daily, 24 * 3600_000).unref();
    setTimeout(hourly, 5 * 60_000).unref();
    setInterval(hourly, 3600_000).unref();
  },
};
