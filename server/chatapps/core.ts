// What Discord and Slack share (Settings → Chat apps), the way Telegram does it (server/telegram): only the chats
// linked with a one-time code may use the bot; a message goes on with the session the chat is in, or starts one (in a
// task folder of its own, as the start page does); the agent's reply comes back when its turn ends; what it asks comes
// with buttons; /new, /sessions, /stop and /status steer it; and the other sessions' notices can come too.
// A platform (discord.ts, slack.ts) brings its connection and a `Wire`: how words, replies, notices and "working…"
// look there. Everything it keeps is under its own id in the key-value store ("discord.chats", "slack.notify"…).
import crypto from 'node:crypto';
import { NOTICE_VERB, shortTitle } from '../../shared/notice.ts';
import type { Agent, NotifyEvent } from '../../shared/types.ts';
import { taskRoot } from '../assistants/store.ts';
import { dayIn, makeTaskFolder } from '../assistants/taskFolder.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, TurnInfo } from '../features/types.ts';
import { userTimezone } from '../userPrefs.ts';

/** A button: `id` is what pressing it does (made by `button`), `url` opens a page instead. */
export interface Btn {
  text: string;
  id?: string;
  url?: string;
  style?: 'primary' | 'danger';
}
export type Rows = Btn[][];

/** How a platform shows what the app says. Chats are the platform's own ids (a channel). */
export interface Wire {
  /** Words as written (no Markdown): the app's own messages. */
  say(chat: string, text: string, rows?: Rows): Promise<void>;
  /** An agent's reply: its Markdown formatted for the platform, in parts that fit. */
  reply(chat: string, md: string, rows?: Rows): Promise<void>;
  /** A session's notice: a title, what happened, and a line more. */
  notice(chat: string, n: { title: string; status: string; detail: string }, rows: Rows): Promise<void>;
  /** "Working…" in the chat (typing, a reaction) while the agent works; off when it does not. */
  busy(chat: string, on: boolean): void;
}

export interface LinkedChat {
  id: string;
  /** The person who linked it: in a server's channel, only they are heard. */
  user: string;
  name: string;
  at: number;
  kind: 'dm' | 'channel';
}

/** A message to the bot, from a chat. */
export interface Incoming {
  chat: string;
  user: string;
  name: string;
  text: string;
  /** A direct message to the bot (a channel's messages count when they address it). */
  direct: boolean;
}

/** A reply longer than this many messages ends with a word that the rest is in the app. */
export const MAX_PARTS = 10;

/** The commands, typed after "/" or "!" . */
const COMMAND_NAMES = ['new', 'sessions', 'stop', 'status', 'help'];

const busyStatus = (status?: string) => status === 'working' || status === 'waiting' || status === 'starting';

export type Action = { kind: 'answer'; key: string; id: string; decision: string; label: string } | { kind: 'switch'; key: string };

export type Pressed = { ok: false; text: string } | { ok: true; kind: 'switch'; text: string; toast: string } | { ok: true; kind: 'answer'; label: string };

const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode(): string {
  const b = crypto.randomBytes(8);
  return Array.from(b, (x) => CODE_LETTERS[x % CODE_LETTERS.length]).join('');
}

const readJson = <T>(db: DB, k: string, fallback: T): T => {
  try {
    const v = kvGet(db, k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

export interface ChatAppSpec {
  id: 'discord' | 'slack';
  /** As people read it. */
  label: string;
  /** How the app words where to link, in a chat: "Settings → Chat apps → Discord". */
  where: string;
  wire(d: Deps): Wire;
  /** Whether the bot is connected (its tokens are saved). */
  connected(d: Deps): boolean;
}

export function chatApp(spec: ChatAppSpec) {
  const { id, label } = spec;
  const key = (k: string) => `${id}.${k}`;

  // ---- what is kept -----------------------------------------------------------------------------
  const linked = (db: DB) => readJson<LinkedChat[]>(db, key('chats'), []);
  const setLinked = (db: DB, list: LinkedChat[]) => kvSet(db, key('chats'), JSON.stringify(list));
  const isLinked = (db: DB, chat: string, user: string) => linked(db).some((c) => c.id === chat && c.user === user);
  const notifyOn = (db: DB) => kvGet(db, key('notify')) !== '0';
  const agentFor = (db: DB): Agent => (kvGet(db, key('agent')) === 'codex' ? 'codex' : 'claude');
  const currentOf = (db: DB, chat: string): string | undefined => readJson<Record<string, string>>(db, key('current'), {})[chat];
  const setCurrent = (db: DB, chat: string, k: string | null) => {
    const all = readJson<Record<string, string>>(db, key('current'), {});
    if (k) all[chat] = k;
    else delete all[chat];
    kvSet(db, key('current'), JSON.stringify(all));
  };
  /** Sessions a chat spoke to, and which chat: their replies go there (the latest 300). */
  const chatOfSession = (db: DB, k: string): string | undefined => readJson<Record<string, string>>(db, key('sessions'), {})[k];
  function setChatOfSession(db: DB, k: string, chat: string) {
    const all = readJson<Record<string, string>>(db, key('sessions'), {});
    delete all[k];
    all[k] = chat;
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - 300))) delete all[old];
    kvSet(db, key('sessions'), JSON.stringify(all));
  }

  // ---- buttons ----------------------------------------------------------------------------------
  // A button's id stands for what it does, kept here (the latest 500): platforms keep little in one.
  const actions = new Map<string, Action>();
  function button(text: string, a: Action, style?: Btn['style']): Btn {
    const aid = crypto.randomBytes(9).toString('base64url');
    actions.set(aid, a);
    if (actions.size > 500) actions.delete(actions.keys().next().value!);
    return { text: text.slice(0, 60), id: aid, style };
  }

  /** A link to the session in the app, for a button: only where the app has an address others can open. */
  function openButton(d: Deps, path: string): Btn[] {
    const url = `${d.publicBase()}${path}`;
    try {
      const host = new URL(url).hostname;
      if (host === 'localhost' || /^(127\.|10\.|192\.168\.|::1|\[::1\])/.test(host) || !host.includes('.')) return [];
    } catch {
      return [];
    }
    return [{ text: 'Open in Hydor', url }];
  }

  // ---- linking a chat ---------------------------------------------------------------------------
  /** A code to link a chat with, for ten minutes; ten wrong tries end it. */
  let pairing: { code: string; until: number; misses: number } | null = null;
  /** People told once that this bot is someone else's. */
  const toldAway = new Set<string>();

  async function tryLink(d: Deps, w: Wire, m: Incoming) {
    const code = m.text
      .replace(/^[/!]?(start|link)\s+/i, '')
      .trim()
      .toUpperCase();
    if (pairing && Date.now() < pairing.until && code === pairing.code) {
      pairing = null;
      setLinked(d.db, [...linked(d.db).filter((c) => c.id !== m.chat), { id: m.chat, user: m.user, name: m.name, at: Date.now(), kind: m.direct ? 'dm' : 'channel' }]);
      d.broadcast({ t: 'feature', id, data: { changed: true } });
      await w.say(m.chat, 'Linked to Hydor. Send what you want done and an agent starts on it; its reply comes back here. /help says more.');
      return;
    }
    if (pairing && code.length === 8 && ++pairing.misses >= 10) pairing = null;
    const who = `${m.chat}:${m.user}`;
    if (toldAway.has(who)) return;
    toldAway.add(who);
    await w.say(m.chat, `This bot is someone’s own Hydor. To use it, link this chat in Hydor: ${spec.where} → Link a chat.`);
  }

  // ---- a chat speaking --------------------------------------------------------------------------
  const HELP = [
    'Send what you want done: it goes to the session this chat is in, or starts one, and the reply comes back here.',
    '/new: a new session (/new and what it should do starts it at once)',
    '/sessions: the latest sessions, to go on with one',
    '/stop: stop the agent of this chat’s session',
    '/status: which session this chat is in, and what it is doing',
  ].join('\n');

  /** A message from a linked chat to its session: a new one when it is in none. */
  async function toSession(d: Deps, w: Wire, chat: string, text: string) {
    const k = currentOf(d.db, chat);
    const s = k ? d.sessions.summary(k) : null;
    if (!k || !s) {
      const cwd = makeTaskFolder(taskRoot(d.db), text, dayIn(userTimezone(d.db)));
      const made = await d.sessions.create({ agent: agentFor(d.db), cwd, prompt: text, remember: false });
      setCurrent(d.db, chat, made);
      setChatOfSession(d.db, made, chat);
      w.busy(chat, true);
      await w.say(chat, 'On it: the reply comes here when it is done.', [openButton(d, `/s/${encodeURIComponent(made)}`)]);
      return;
    }
    setChatOfSession(d.db, k, chat);
    if (busyStatus(s.live?.status)) {
      d.sessions.enqueue(k, text);
      await w.say(chat, 'It is still working: this goes to it when its turn ends.');
      return;
    }
    await d.sessions.send(k, text);
    w.busy(chat, true);
  }

  async function command(d: Deps, w: Wire, chat: string, name: string, rest: string) {
    const k = currentOf(d.db, chat);
    const s = k ? d.sessions.summary(k) : null;
    if (name === 'new') {
      setCurrent(d.db, chat, null);
      if (rest) return toSession(d, w, chat, rest);
      return w.say(chat, 'Send what the new session should do.');
    }
    if (name === 'sessions') {
      const list = d.sessions.list({ limit: 8 }).sessions.filter((x) => !x.external);
      if (!list.length) return w.say(chat, 'No sessions yet: send what you want done.');
      return w.say(
        chat,
        'Go on with:',
        list.map((x) => [button(`${x.key === k ? '• ' : ''}${shortTitle(x.title || 'Untitled', 50)}`, { kind: 'switch', key: x.key })]),
      );
    }
    if (name === 'stop') {
      if (!k || !s || !busyStatus(s.live?.status)) return w.say(chat, 'Nothing is working here.');
      await d.sessions.interrupt(k);
      w.busy(chat, false);
      return w.say(chat, 'Stopped.');
    }
    if (name === 'status') {
      if (!k || !s) return w.say(chat, 'This chat is in no session: send what you want done to start one.');
      const what = busyStatus(s.live?.status) ? 'working' : s.live?.status === 'error' ? 'stopped with an error' : 'ready';
      return w.say(chat, `${shortTitle(s.title || 'Untitled')}: ${what}.`, [openButton(d, `/s/${encodeURIComponent(k)}`)]);
    }
    return w.say(chat, HELP);
  }

  /** One message to the bot: linked chats' words go to the agents, anyone else's is a try at linking (or is told whose bot this is). */
  async function incoming(d: Deps, w: Wire, m: Incoming) {
    const text = m.text.trim();
    if (!isLinked(d.db, m.chat, m.user)) return tryLink(d, w, { ...m, text });
    if (!text) return w.say(m.chat, `Send words: pictures, files and voice messages do not reach the agents from ${label} yet.`);
    const cmd = /^[/!](\w+)(?:\s+([\s\S]*))?$/.exec(text);
    if (cmd && COMMAND_NAMES.includes(cmd[1].toLowerCase())) return command(d, w, m.chat, cmd[1].toLowerCase(), (cmd[2] ?? '').trim());
    return toSession(d, w, m.chat, text);
  }

  /** A press of one of the bot's buttons: what it did, for the platform to show (it edits its message, answers the press). */
  async function pressed(d: Deps, w: Wire, p: { chat: string; user: string; id: string }): Promise<Pressed> {
    const a = actions.get(p.id);
    if (!isLinked(d.db, p.chat, p.user)) return { ok: false, text: 'This chat is not linked to Hydor.' };
    if (!a) return { ok: false, text: 'This button is from before Hydor restarted, or already answered: open the session there.' };
    if (a.kind === 'switch') {
      setCurrent(d.db, p.chat, a.key);
      const title = d.sessions.summary(a.key)?.title || 'Untitled';
      return { ok: true, kind: 'switch', toast: `Now in: ${shortTitle(title, 40)}`, text: `This chat is in “${shortTitle(title)}” now: what you send goes there.` };
    }
    try {
      await d.sessions.answer(a.key, a.id, { decision: a.decision });
    } catch {
      return { ok: false, text: 'Already answered, or the session moved on.' };
    }
    actions.delete(p.id);
    setChatOfSession(d.db, a.key, p.chat);
    w.busy(p.chat, true);
    return { ok: true, kind: 'answer', label: a.label };
  }

  // ---- what a session sends ---------------------------------------------------------------------
  /** The text the agent wrote after the user's last message: the reply of the turn that just ended. */
  async function replyOf(d: Deps, k: string): Promise<string> {
    const items = (await d.sessions.timeline(k)).parser.items;
    const out: string[] = [];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === 'user' && !it.meta) break;
      if (it.kind === 'assistant' && it.text.trim()) out.unshift(it.text.trim());
    }
    return out.join('\n\n');
  }

  /**
   * A session's notice to the linked chats: what it asks (with buttons when Yes or No answers it) to the chat that spoke
   * to it, and with Notify on, every session's notices to every linked chat. A chat's own sessions send their replies
   * when their turns end (turnEnd), so their "Finished" is left out.
   */
  async function notice(d: Deps, n: NotifyEvent) {
    const chats = linked(d.db);
    if (!spec.connected(d) || !chats.length) return;
    const own = n.machine ? undefined : chatOfSession(d.db, n.key);
    if (own !== undefined && n.kind !== 'waiting') return;
    if (own === undefined && !notifyOn(d.db)) return;
    const to = own !== undefined ? chats.filter((c) => c.id === own) : chats;
    const w = spec.wire(d);
    const path = n.url ?? `${n.machine ? `/m/${n.machine.id}` : ''}/s/${encodeURIComponent(n.key)}`;
    const status = n.kind === 'waiting' ? n.body || NOTICE_VERB.waiting : NOTICE_VERB[n.kind];
    const detail = n.kind !== 'waiting' && n.body && n.body !== status ? `\n${n.body}` : n.approval?.detail ? `\n${n.approval.detail}` : '';
    for (const c of to) {
      // Waiting for an answer, the agent is not working.
      if (c.id === own) w.busy(c.id, false);
      const rows: Rows = [];
      if (n.approval && !n.machine) {
        const a = n.approval;
        rows.push([
          button(a.approve.label, { kind: 'answer', key: n.key, id: a.id, decision: a.approve.id, label: a.approve.label }, 'primary'),
          button(a.deny.label, { kind: 'answer', key: n.key, id: a.id, decision: a.deny.id, label: a.deny.label }),
        ]);
      }
      rows.push(openButton(d, path));
      await w.notice(c.id, { title: shortTitle(n.title || 'Hydor'), status, detail: detail.slice(0, 1500) }, rows);
    }
  }

  /** A turn ended: the reply of a chat's own session goes back to it. */
  async function turnEnd(t: TurnInfo, d: Deps) {
    if (t.external) return;
    const chat = chatOfSession(d.db, t.key);
    if (chat === undefined || !spec.connected(d) || !linked(d.db).some((c) => c.id === chat)) return;
    const w = spec.wire(d);
    w.busy(chat, false);
    const open = [openButton(d, `/s/${encodeURIComponent(t.key)}`)];
    if (t.status === 'error') {
      const why = d.sessions.summary(t.key)?.live?.error;
      await w.say(chat, `Stopped with an error${why ? `: ${why.slice(0, 500)}` : '.'}`, open);
      return;
    }
    const reply = await replyOf(d, t.key).catch(() => '');
    await w.reply(chat, reply || 'Done.', open);
  }

  // ---- Settings ---------------------------------------------------------------------------------
  const startPairing = () => {
    pairing = { code: newCode(), until: Date.now() + 10 * 60_000, misses: 0 };
    toldAway.clear();
  };
  const stopPairing = () => (pairing = null);
  /** What every platform's view holds. */
  const view = (d: Deps) => ({
    connected: spec.connected(d),
    chats: linked(d.db),
    notify: notifyOn(d.db),
    agent: agentFor(d.db),
    pairing: pairing && Date.now() < pairing.until ? { code: pairing.code, until: pairing.until } : undefined,
  });
  const unlinkAll = (d: Deps) => {
    setLinked(d.db, []);
    kvSet(d.db, key('current'), '{}');
    stopPairing();
  };

  /**
   * The routes of one platform, under /api/<id>: its view, options and token, a code to link with, and unlinking a chat.
   * `connect` takes the body of a PUT and saves what it holds of the tokens (answering "connected" when it made a
   * connection); a bot taken out or changed unlinks every chat (unlinkAll).
   */
  function routes(d: Deps, o: { view(): object; connect(body: Record<string, unknown>): Promise<'connected' | undefined> }) {
    const { app, db } = d;
    // The routes are /api/discord and /api/slack (docs/guide/90-api.md lists each): built from the id, so written once.
    const base = '/api/' + id;
    app.get(base, async () => o.view());
    app.put(base, async (req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const did = await o.connect(b);
      if (typeof b.notify === 'boolean') kvSet(db, key('notify'), b.notify ? '1' : '0');
      if (b.agent === 'claude' || b.agent === 'codex') kvSet(db, key('agent'), b.agent);
      // Asked again a moment later, the bot's name is there.
      if (did === 'connected') await new Promise((r) => setTimeout(r, 300));
      return o.view();
    });
    app.post(`${base}/pair`, async () => {
      if (!spec.connected(d)) throw new HttpError(400, `Connect ${label} first`);
      startPairing();
      return o.view();
    });
    app.delete(`${base}/chats/:id`, async (req) => {
      const chat = String((req.params as { id: string }).id);
      setLinked(
        db,
        linked(db).filter((c) => c.id !== chat),
      );
      setCurrent(db, chat, null);
      return o.view();
    });
  }

  return { linked, isLinked, incoming, pressed, notice, turnEnd, view, routes, stopPairing, unlinkAll, notifyOn, button, openButton };
}

export type ChatApp = ReturnType<typeof chatApp>;

/** For both platforms' waits between tries to connect again: short in tests. */
export const tuning = { retryMs: 2000, maxRetryMs: 60_000 };
