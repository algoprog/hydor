// Where a chat's message goes (Telegram, Discord and Slack share it): to the session the chat is in, or to a new one in
// a task folder of its own, as the start page does; on the program picked in Settings → Chat apps, or as one of the
// person's own agents (the Agents page) when /as picked one for the chat's next session or the chat app starts new
// sessions as one. What the message sent beside words is saved in that session's folder first (files.ts), and goes to
// the agent as the message box's attachments do.
import fs from 'node:fs';
import path from 'node:path';
import { agentMode, assistantExtra, type Assistant } from '../../shared/assistants.ts';
import { defaultProgramNow } from '../agents/programs.ts';
import type { Agent } from '../../shared/types.ts';
import { ensureStanding } from '../assistants/inbox.ts';
import { allAssistants, findAssistant, taskRoot } from '../assistants/store.ts';
import { dayIn, makeTaskFolder } from '../assistants/taskFolder.ts';
import { BUILTINS } from '../assistants/builtins.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { spaceById } from '../spaces/index.ts';
import { userTimezone } from '../userPrefs.ts';
import { compose, filesOf, folderWords, forSend, gather, type ChatFile, type Gathered } from './files.ts';

/** One chat, as the platform holding it lets this module see and answer it. */
export interface ChatSide {
  /** As people read it: "Telegram". */
  app: string;
  /** The program new sessions run on (Settings → Chat apps → New sessions use). */
  program: Agent;
  /** The agent (an assistant's id) the chat's next new session starts as: /as's pick, else the chat app's own. */
  as?: string;
  /** A new session started: /as's pick for this chat is used up. */
  tookAs(): void;
  /** The session the chat is in. */
  current(): string | undefined;
  setCurrent(key: string | null): void;
  /** The session's replies come back to this chat. */
  own(key: string): void;
  /** Words to the chat, with a button that opens session `open` in the app where it has an address others can reach. */
  say(text: string, open?: string): Promise<void>;
  /** "Working…" on or off. */
  busy(on: boolean): void;
  /** The biggest file the platform lets a bot fetch, and why that is the limit in a few words. */
  maxBytes: number;
  limitSays: string;
}

/** What a chat sent: its words (a caption, for a photo), and what came with them. */
export interface ChatMessage {
  text: string;
  files?: ChatFile[];
  /** Forwarded from someone else: outside data. */
  forwarded?: boolean;
}

const busy = (status?: string) => status === 'working' || status === 'waiting' || status === 'starting';

/** What Settings → Chat apps → New sessions use may be; 'custom' is Hydor's own agent. */
export type ChatProgram = 'claude' | 'codex' | 'custom';
export const isChatProgram = (v: unknown): v is ChatProgram => v === 'claude' || v === 'codex' || v === 'custom';

/** The program picked for a chat app (`kept`), else the first signed in of Claude Code and Codex, else Custom. */
export function chatProgram(kept: string | null | undefined): ChatProgram {
  if (isChatProgram(kept)) return kept;
  const { agent } = defaultProgramNow();
  return agent === 'acp' ? 'custom' : agent;
}

/** The agent a chat app's program is: Custom is the ACP agent 'console'. */
export const chatAgent = (p: ChatProgram): Agent => (p === 'custom' ? 'acp' : p);

/** How a new session starts as agent `a` (none: the chat's program alone), as the scheduler and a standing agent's start do. */
function startOf(a: Assistant | null, program: Agent) {
  if (!a) return { agent: program, ...(program === 'acp' ? { acpAgent: 'console' } : {}) };
  const agent = a.agent ?? program;
  const acpAgent = agent === 'acp' ? (a.agent ? a.acpAgent : 'console') : undefined;
  return {
    agent,
    ...(acpAgent ? { acpAgent } : {}),
    // Its own model on its own program, unless it thinks with a tier (whose model the start picks).
    ...(a.agent && a.model && !a.tier ? { model: a.model } : {}),
    ...(agentMode(a.mode, agent, acpAgent) ? { mode: agentMode(a.mode, agent, acpAgent) } : {}),
    extra: assistantExtra(a),
  };
}

/** Where a new session works: an agent's one project's folder, else a new task folder named from the message. */
function folderFor(db: DB, a: Assistant | null, words: string): { cwd: string; fresh: boolean } {
  const only = a?.projects?.length === 1 ? spaceById(db, a.projects[0]) : null;
  if (only?.folder && fs.existsSync(only.folder)) return { cwd: only.folder, fresh: false };
  return { cwd: makeTaskFolder(taskRoot(db), words, dayIn(userTimezone(db))), fresh: true };
}

/** A new task folder moved to a name made from `words`; where it was when that cannot be done. */
function renamed(db: DB, dir: string, words: string): string {
  try {
    const to = makeTaskFolder(taskRoot(db), words, dayIn(userTimezone(db)));
    fs.rmdirSync(to);
    fs.renameSync(dir, to);
    return to;
  } catch {
    return dir;
  }
}

const fromOf = (d: Deps, c: ChatSide) => ({ app: c.app, maxBytes: c.maxBytes, limitSays: c.limitSays, timeZone: userTimezone(d.db) });

/** A standing agent's own conversation: the chat goes into it. Null (and said why) when it could not be made. */
async function intoStanding(d: Deps, c: ChatSide, a: Assistant): Promise<string | null> {
  try {
    const key = await ensureStanding(d, a);
    c.setCurrent(key);
    c.tookAs();
    await c.say(`This chat is in ${a.name}’s own conversation now: what you send goes there.`, key);
    return key;
  } catch (e) {
    await c.say(`Could not open ${a.name}’s conversation: ${(e as Error).message}`);
    return null;
  }
}

/**
 * A message from a linked chat: to its session, or to a new one when it is in none (as the agent picked for it, if
 * any). Files go in that session's folder first; what did not come through is said; a message left with nothing goes
 * nowhere.
 */
export async function deliver(d: Deps, c: ChatSide, m: ChatMessage): Promise<void> {
  const files = m.files ?? [];
  const words = m.text.trim();
  const k = c.current();
  const s = k ? d.sessions.summary(k) : null;
  const empty: Gathered = { saved: [], notes: [] };

  if (!k || !s) {
    const a = c.as ? findAssistant(d.db, c.as) : null;
    if (a?.standing) {
      const key = await intoStanding(d, c, a);
      if (key && d.sessions.summary(key)) return deliver(d, { ...c, as: undefined }, m);
      return;
    }
    let { cwd, fresh } = folderFor(d.db, a, words || folderWords(files, c.app));
    const g = files.length ? await gather(cwd, files, fromOf(d, c)) : empty;
    // A voice message alone: its folder is named from what it said, now that that is known.
    const heard = g.saved.find((x) => x.heard)?.heard;
    if (fresh && !words && heard) {
      const named = renamed(d.db, cwd, heard);
      for (const x of g.saved) x.path = path.join(named, path.basename(x.path));
      cwd = named;
    }
    for (const n of g.notes) await c.say(n);
    const prompt = compose(words, g, { app: c.app, forwarded: m.forwarded });
    const paths = filesOf(g);
    if (!prompt.trim() && !paths.length) {
      if (fresh) fs.rmSync(cwd, { recursive: true, force: true });
      return;
    }
    let made: string;
    try {
      // A person's message from a chat app starts it, and they drive it from there.
      made = await d.sessions.create({ ...startOf(a, c.program), cwd, prompt, ...(paths.length ? { paths } : {}), remember: false, person: true });
    } catch (e) {
      await c.say(`Could not start a session: ${(e as Error).message}`);
      return;
    }
    c.tookAs();
    c.setCurrent(made);
    c.own(made);
    c.busy(true);
    await c.say(a ? `On it, as ${a.name}: the reply comes here when it is done.` : 'On it: the reply comes here when it is done.', made);
    return;
  }

  let g = empty;
  if (files.length) {
    if (!s.cwd || !fs.existsSync(s.cwd)) {
      await c.say('This session has no folder to put files in: /new starts one that has.');
      return;
    }
    g = await gather(s.cwd, files, fromOf(d, c));
    for (const n of g.notes) await c.say(n);
  }
  const out = forSend(compose(words, g, { app: c.app, forwarded: m.forwarded }), filesOf(g));
  if (!out.text.trim()) return;
  c.own(k);
  if (busy(s.live?.status)) {
    d.sessions.enqueue(k, out.text, out.images);
    await c.say('It is still working: this goes to it when its turn ends.');
    return;
  }
  try {
    await d.sessions.send(k, out.text, out.images);
  } catch (e) {
    await c.say(`Could not send it: ${(e as Error).message}`);
    return;
  }
  c.busy(true);
}

// ---- the person's agents ----------------------------------------------------------------------------

/** The person's agents for a chat's list: their own first, then those that come with the app; at most `max`. */
export function agentChoices(db: DB, max = 24): Assistant[] {
  const all = allAssistants(db);
  const builtin = new Set(BUILTINS.map((a) => a.id));
  return [...all.filter((a) => !builtin.has(a.id)), ...all.filter((a) => builtin.has(a.id))].slice(0, max);
}

/**
 * The agent named at the start of `words` (what follows /as): by its whole name (the longest that fits, so
 * "Bookkeeper pay this" finds Bookkeeper), by its id, or by the start of its name when only one begins so;
 * with the words after it. Null when none is.
 */
export function pickAgent(db: DB, words: string): { agent: Assistant; rest: string } | null {
  const w = words.trim();
  if (!w) return null;
  const list = allAssistants(db);
  const first = w.split(/\s+/)[0];
  const f = first.toLowerCase().replace(/[,:;.!?]+$/, '');
  // Its id (as Discord's completion gives it) first: "bookkeeper-3f9a" is not Bookkeeper and some words.
  const byId = list.find((a) => a.id.toLowerCase() === f);
  if (byId) return { agent: byId, rest: w.slice(first.length).trim() };
  const low = w.toLowerCase();
  const whole = [...list]
    .sort((a, b) => b.name.length - a.name.length)
    .find((a) => {
      const n = a.name.toLowerCase();
      return low === n || (low.startsWith(n) && /[\s,:;.!?—–]/.test(low[n.length]));
    });
  if (whole) return { agent: whole, rest: w.slice(whole.name.length).replace(/^[\s,:;.!?—–-]+/, '') };
  const starts = list.filter((a) => a.name.toLowerCase().startsWith(f));
  return starts.length === 1 ? { agent: starts[0], rest: w.slice(first.length).trim() } : null;
}

/** What a chat says to "/as" naming no agent of the person's. */
export function noSuchAgent(db: DB, words: string): string {
  const names = agentChoices(db, 12).map((a) => a.name);
  return `No agent of yours is called “${words.trim().split(/\s+/).slice(0, 4).join(' ')}”. Yours: ${names.join(', ')}. /agents lists them to pick from.`;
}

/**
 * /as: the chat's next new session starts as the agent named, at once when words or files come with it. A standing
 * agent's own conversation is where the chat goes instead. `pick` keeps the choice for the chat.
 */
export async function asCommand(d: Deps, c: ChatSide, pick: (id: string | null) => void, rest: string, files: ChatFile[] = []): Promise<'list' | void> {
  if (!rest && !files.length) return 'list';
  const p = pickAgent(d.db, rest);
  if (!p) {
    await c.say(noSuchAgent(d.db, rest));
    return;
  }
  const a = p.agent;
  c.setCurrent(null);
  if (a.standing) {
    const key = await intoStanding(d, c, a);
    if (key && (p.rest || files.length)) await deliver(d, { ...c, as: undefined }, { text: p.rest, files });
    return;
  }
  pick(a.id);
  if (p.rest || files.length) return deliver(d, { ...c, as: a.id }, { text: p.rest, files });
  await c.say(`The next session here starts as ${a.name}: send what it should do.`);
}

/** A press of an agent's button in the list /agents gives: the chat's next new session starts as it. What to say back. */
export async function pressedAs(d: Deps, c: ChatSide, pick: (id: string | null) => void, id: string): Promise<{ text: string; toast: string }> {
  const a = findAssistant(d.db, id);
  if (!a) return { text: 'That agent is gone: /agents lists those there are.', toast: 'No such agent' };
  c.setCurrent(null);
  if (a.standing) {
    const key = await ensureStanding(d, a).catch(() => null);
    if (!key) return { text: `Could not open ${a.name}’s conversation.`, toast: a.name };
    c.setCurrent(key);
    return { text: `This chat is in ${a.name}’s own conversation now: what you send goes there.`, toast: a.name };
  }
  pick(a.id);
  return { text: `The next session here starts as ${a.name}: send what it should do.`, toast: `As ${a.name}` };
}

/** The chat app's own agent for new sessions, as Settings shows it: only one that is there. */
export const defaultAgent = (db: DB, id: string | null | undefined): string | undefined => (findAssistant(db, id) ? (id as string) : undefined);
