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
// While a session works, what newly bears on a message comes with it, and what is about the files its agent touches
// comes as it touches them (Claude Code's hook, Custom's tools) or with the next message (deliver.ts); nothing twice
// (given.ts). When a turn ends, what the agent used of what it was given counts as used.
import { isAppNotice } from '../../shared/app-notice.ts';
import type { Agent, TimelineItem } from '../../shared/types.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import type { Deps, Feature, SpawnAdditions } from '../features/types.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { wikiDeliverySpace, wikiLines } from '../wiki/deliver.ts';
import { ADD_BUDGET, memClass, messageAdditions } from './deliver.ts';
import { kick, requestVector, warmMeaning, watchNotes } from './embed.ts';
import { noteChanges } from './extract.ts';
import { addTouched, askRef, blockIds, blocksOf, clearGiven, dropGiven, givenRefs, idsOf, moveGiven, noteBlock, noteEpoch, noteRef, recordGiven, runRef, seeCompactions, seeUses, takeTouched, touchedFiles } from './given.ts';
import { memoryBlock, memoryParts } from './inject.ts';
import { memoryRoutes } from './routes.ts';
import { cursorOf, expireDue, keepBlock, keptBlock, learnOn, markGiven, memoryOn, sessionMemoryOn, setCursor, sweep, tidyOn, words } from './store.ts';
import { helperAsk, tidy, tidyDue, titlesFor, untitled } from './tidy.ts';
import { memoryTools } from './tools.ts';
import { startTranscriptVectors } from './transcripts.ts';
import { startAnchors } from './upkeep.ts';

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

/**
 * A session's memory block: the one it was given while that holds (store.ts keptBlock), else made now and kept. Its
 * entries count as given to the session (given.ts noteBlock), in place of those of a block it no longer has.
 */
async function blockFor(d: Pick<Deps, 'db'>, key: string | undefined, flavor: string, epoch: number, make: () => Promise<string>): Promise<{ text: string; made: boolean }> {
  if (!key) return { text: await make(), made: true };
  const before = blocksOf(d.db, key);
  const kept = keptBlock(d.db, key, flavor, epoch);
  const text = kept ?? (await make());
  if (kept == null) keepBlock(d.db, key, flavor, epoch, text);
  noteBlock(
    d.db,
    key,
    text,
    before.filter((b) => kept == null || b.flavor !== flavor),
  );
  return { text, made: kept == null };
}

/** Custom, Hydor's own agent, which hears memory with its turns (turnNotes) rather than with each message. */
const isCustom = (s: { agent?: Agent; acpAgent?: string } | null | undefined) => s?.agent === 'acp' && s.acpAgent === CONSOLE_ID;

/** What a new Codex thread was given before it had a key (by its run), moved to its key. */
function attachRun(d: Deps, key: string) {
  const run = d.sessions.runOf?.(key);
  if (run) moveGiven(d.db, runRef(run), key);
}

/** Where to read a session's turns from: after the item read last, else from its latest message. */
function startOf(items: TimelineItem[], after?: string): number {
  const i = after ? items.findIndex((x) => x.id === after) + 1 : 0;
  if (i > 0) return i;
  for (let j = items.length - 1; j >= 0; j--) if (items[j].kind === 'user') return j;
  return 0;
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
      // A notice from the app asks nothing: what the session is about is in what was asked before it.
      if (it.kind === 'user' && !it.meta && it.text.trim() && !isAppNotice(it.text)) return it.text.slice(0, 2000);
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
  // What the agent used of what it was given, before the cursor moves on; then a compaction since lets it all go
  // (save its instructions' block); and the files it worked on wait for the next message (Custom hears of them at once).
  try {
    const from = startOf(items, cursorOf(db, key)?.item);
    attachRun(d, key);
    seeUses(db, key, items, from);
    seeCompactions(db, key, items, from);
    const s = d.sessions.summary(key);
    if (s && !isCustom(s) && s.cwd) addTouched(key, touchedFiles(items, s.cwd, from));
  } catch (e) {
    console.warn(`[memory] ${key}: what was used: ${(e as Error)?.message ?? e}`);
  }
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
    if (isCustom(s)) return own;
    // A session that began before memory came in two parts goes on with the block it began with.
    const before = s.resume && s.key ? keptBlock(d.db, s.key, 'full', 0) : null;
    if (before != null) return { ...own, instructions: [before] };
    // What it is given is kept by its key, or by its run until a new Codex thread has one.
    const holder = s.key ?? runRef(s.runId);
    // A session that goes on still has in its conversation what it was given, unless that was condensed since.
    if (s.resume && s.key)
      try {
        seeCompactions(d.db, s.key, (await d.sessions.timeline(s.key)).parser.items);
      } catch {}
    const refs = s.resume ? givenRefs(d.db, holder) : new Set<string>();
    // In the instructions, what is the same for every session of the place (and again for this one when it goes on
    // within the hour), so the provider's cache of them holds from one session to the next; what bears on the request,
    // this session's own notes when it goes on, and the wiki's articles that stand out for it come with the first
    // message, once.
    const query = s.prompt?.trim() || (s.resume ? await lastAsk(d, s.key) : undefined);
    const space = wikiDeliverySpace(d.db, { key: s.key, cwd: s.cwd, extra: s.extra });
    const wiki =
      space && query && words(query).length >= 2
        ? await wikiLines(d.db, { space, query, limit: ADD_BUDGET.full.wiki, exclude: new Set([...refs].filter((r) => r.startsWith('w:'))), vector: await requestVector(d.db, query) })
        : [];
    // A session that goes on within the hour keeps the instructions it had: what they give stays out of the message too.
    const kept = s.key ? keptBlock(d.db, s.key, 'stable', 0) : null;
    const parts = await memoryParts(d.db, { cwd: s.cwd, key: s.key, session: s.resume, query, exclude: [...idsOf(refs), ...(kept ? blockIds(kept) : [])], wiki });
    const stable = await blockFor(d, s.key, 'stable', 0, async () => parts.stable);
    if (!s.key) recordGiven(d.db, holder, parts.stableIds.map(noteRef));
    // The message it starts with had its notes now: the message's own search is not made again for it (aboutMessage).
    recordGiven(d.db, holder, [...parts.requestIds.map(noteRef), ...parts.wikiRefs, ...(s.prompt?.trim() ? [askRef(s.prompt)] : [])]);
    markGiven(d.db, [...(stable.made ? parts.stableIds : []), ...parts.requestIds]);
    // Claude Code hears of the notes about the files it touches as it touches them (claude.ts adds the hook).
    const hook: Record<string, string> = s.agent === 'claude' && s.extra.confidential !== true ? { HYDOR_MEMORY_HOOKS: '1' } : {};
    return { ...own, env: { ...own.env, ...hook }, instructions: [stable.text], ...(parts.request ? { notes: [parts.request] } : {}) };
  },
  async context(s, d) {
    // A confidential session reads memory and keeps nothing in it (server/confidential).
    const reads = s.extra.confidential === true;
    if (!memoryOn(d.db) || (s.extra.memory === false && !reads)) return null;
    // A block that fits the model: a model switched to one of another size gets one of its own (its flavor says).
    const cls = memClass({ window: s.window, lean: s.lean });
    const flavor = `${reads ? 'read' : 'full'}${cls === 'full' ? '' : `:${cls}`}`;
    const epoch = s.epoch ?? 0;
    // Condensed: what came with its messages is gone from the conversation.
    noteEpoch(d.db, s.key, epoch);
    // The same block until the conversation is condensed (`epoch`), so the instructions stay as the provider cached them.
    // Made for the message that starts the turn (Custom sends it), else the latest one the user wrote.
    const block = await blockFor(d, s.key, flavor, epoch, async () =>
      (await memoryBlock(d.db, { cwd: s.cwd, key: s.key, session: true, query: (s.query && !isAppNotice(s.query) && s.query.trim()) || (await lastAsk(d, s.key)), readOnly: reads, cls, window: s.window })).text,
    );
    return block.text;
  },
  async turnNotes(s, d) {
    const reads = s.extra.confidential === true;
    if (!memoryOn(d.db) || (s.extra.memory === false && !reads)) return null;
    const cls = memClass({ window: s.window, lean: s.lean });
    if (cls === 'tiny') return null;
    // The wiki's articles for the request once a conversation (again once it was condensed), then one now and then.
    const start = !givenRefs(d.db, s.key).has('s:wiki');
    const space = reads ? null : wikiDeliverySpace(d.db, { key: s.key, cwd: s.cwd, extra: s.extra });
    const text = await messageAdditions(d.db, { key: s.key, cwd: s.cwd, query: s.query, cls, wiki: space ? { space } : null, wikiStart: start, mark: !reads });
    if (space && start && words(s.query).length >= 3) recordGiven(d.db, s.key, ['s:wiki']);
    return text;
  },
  async aboutMessage(text, key, d) {
    // Claude Code, Codex and ACP agents: what newly bears on the message (Custom hears it with its turn: turnNotes).
    if (!sessionMemoryOn(d.db, key) || text.trimStart().startsWith('/') || words(text).length < 3) return null;
    const extra = sessionExtra(d.db, key);
    const s = d.sessions.summary(key);
    if (extra.confidential === true || !s || isCustom(s)) return null;
    attachRun(d, key);
    // The message the session started with: what bears on it came with the start.
    const started = givenRefs(d.db, key).has(askRef(text));
    if (started) dropGiven(d.db, key, [askRef(text)]);
    const space = wikiDeliverySpace(d.db, { key, cwd: s.cwd, extra });
    return messageAdditions(d.db, { key, cwd: s.cwd, query: text, cls: 'full', wiki: space ? { space } : null, touched: takeTouched(key), search: !started });
  },
  event(e, d) {
    // A session removed: what it was given goes with it.
    if (e.t === 'sessions' && e.remove?.length)
      for (const key of e.remove)
        if (!d.sessions.summary(key)) {
          clearGiven(d.db, key);
          takeTouched(key);
        }
  },
  turnEnd(t, d) {
    // Only sessions this app runs, and turns that ended with a reply. With memory off they are still
    // marked as read, so turning it back on does not reach back into them.
    if (t.external || t.status !== 'idle') return;
    schedule(d, t.key);
  },
  start(d) {
    watchNotes(d.db);
    startAnchors(d.db);
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
