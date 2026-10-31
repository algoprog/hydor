// Memory across sessions: what the agents learn about the user (global), a project (repo) and a session.
// After every reply in a session the app runs, the helper model reads the turn and keeps the notes
// current (extract.ts); a note under the reply shows each change. Agents get the notes when they start
// (Custom before each turn), and tools to remember, forget, recall and look through past conversations.
// Settings → Memory turns it off for all sessions, a session's menu for one.
import { CONSOLE_ID } from '../agents/acp.ts';
import type { Deps, Feature } from '../features/types.ts';
import { helperJson } from '../helper.ts';
import { extract } from './extract.ts';
import { memoryInstructions } from './inject.ts';
import { memoryRoutes } from './routes.ts';
import { autoOn, memoryOn, noteError, sessionMemoryOn, setCursor, sweep } from './store.ts';
import { memoryTools } from './tools.ts';

/** Wait after a turn ends, so turns in quick succession are read together. */
const SETTLE_MS = 4000;
/** Most sessions read at once. */
const PARALLEL = 2;

interface Job {
  timer?: NodeJS.Timeout;
  running?: boolean;
  again?: boolean;
  cwd?: string;
}
const jobs = new Map<string, Job>();
let active = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

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

function schedule(d: Deps, key: string, cwd?: string) {
  const j = jobs.get(key) ?? {};
  jobs.set(key, j);
  if (cwd) j.cwd = cwd;
  // One reading at a time per session: a turn that ends meanwhile is read after it.
  if (j.running) {
    j.again = true;
    return;
  }
  clearTimeout(j.timer);
  j.timer = setTimeout(() => void run(d, key), SETTLE_MS);
  j.timer.unref?.();
}

async function run(d: Deps, key: string) {
  const j = jobs.get(key);
  if (!j || j.running) return;
  j.timer = undefined;
  j.running = true;
  try {
    await slot(() => readTurns(d, key, j.cwd));
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.warn(`[memory] ${key}: ${msg}`);
    noteError(d.db, msg);
  } finally {
    j.running = false;
    if (j.again) {
      j.again = false;
      schedule(d, key);
    } else if (!j.timer) jobs.delete(key);
  }
}

async function readTurns(d: Deps, key: string, cwd?: string) {
  const { db } = d;
  const s = d.sessions.summary(key);
  const tl = await d.sessions.timeline(key);
  await tl.readMore();
  const items = tl.parser.items;
  // Memory off (for all, or this session): those turns are passed over for good.
  if (!sessionMemoryOn(db, key)) return setCursor(db, key, items[items.length - 1]?.id);
  // A new turn already started: it is read with this one once it ends.
  if (['working', 'waiting', 'starting'].includes(s?.live?.status ?? '')) return;
  const auto = autoOn(db);
  const r = await extract(db, {
    key,
    cwd: cwd ?? s?.cwd,
    items,
    auto,
    ask: (q) => helperJson(db, { ...q, maxTokens: 1500, timeoutMs: 120_000 }, 'memory changes'),
  });
  if (auto) noteError(db, null);
  if (r.dropped.length) console.log(`[memory] ${key}: left out ${r.dropped.join('; ')}`);
  if (r.changes.length) d.broadcast({ t: 'feature', id: 'memory', data: { changed: true } });
}

export const memory: Feature = {
  id: 'memory',
  routes: memoryRoutes,
  tools: memoryTools,
  async spawn(s, d) {
    if (!memoryOn(d.db) || s.extra.memory === false) return;
    // Custom reads its memory before each turn (context below).
    if (s.agent === 'acp' && s.acpAgent === CONSOLE_ID) return;
    const query = s.resume ? await lastAsk(d, s.key) : undefined;
    return { instructions: [memoryInstructions(d.db, { cwd: s.cwd, key: s.key, session: s.resume, query })] };
  },
  async context(s, d) {
    if (!memoryOn(d.db) || s.extra.memory === false) return null;
    return memoryInstructions(d.db, { cwd: s.cwd, key: s.key, session: true, query: await lastAsk(d, s.key) });
  },
  turnEnd(t, d) {
    // Only sessions this app runs, and turns that ended with a reply. With memory off they are still
    // marked as read, so turning it back on does not reach back into them.
    if (t.external || t.status !== 'idle') return;
    schedule(d, t.key, t.cwd);
  },
  start(d) {
    const tidy = () => {
      try {
        sweep(d.db);
      } catch (e) {
        console.warn(`[memory] sweep: ${(e as Error).message}`);
      }
    };
    setTimeout(tidy, 60_000).unref();
    setInterval(tidy, 24 * 3600_000).unref();
  },
};
