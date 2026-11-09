// Telegram (Settings → Telegram): your agents in a chat. A bot you make with @BotFather, its token kept in the vault
// (TELEGRAM_BOT_TOKEN), which only the Telegram accounts you linked with a one-time code may use. A message goes on
// with the session the chat is in, or starts one (in a task folder of its own, as the start page does); the agent's
// reply comes back when its turn ends; what it asks comes with buttons that answer it; and the other sessions'
// notices can come too. The app asks Telegram for what was sent (long polling), so it needs no address on the internet.
import crypto from 'node:crypto';
import { NOTICE_VERB, shortTitle } from '../../shared/notice.ts';
import type { Agent, NotifyEvent } from '../../shared/types.ts';
import { taskRoot } from '../assistants/store.ts';
import { dayIn, makeTaskFolder } from '../assistants/taskFolder.ts';
import { HttpError } from '../auth.ts';
import { deleteSecret, readSecret, saveSecret, vaultTables } from '../connections/vault.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { userTimezone } from '../userPrefs.ts';
import { chunks, plainText, telegramHtml } from './format.ts';

export const TOKEN_NAME = 'TELEGRAM_BOT_TOKEN';
const api = () => (process.env.TELEGRAM_API ?? 'https://api.telegram.org').replace(/\/+$/, '');

export interface TelegramChat {
  id: number;
  name: string;
  at: number;
}
interface Bot {
  id: number;
  username: string;
  name: string;
}
interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
}
interface TgCallback {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}
type Button = { text: string; callback_data: string } | { text: string; url: string };

class TelegramError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

// ---- what is kept ---------------------------------------------------------------------------------

const readJson = <T>(db: DB, k: string, fallback: T): T => {
  try {
    const v = kvGet(db, k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
export const linkedChats = (db: DB) => readJson<TelegramChat[]>(db, 'telegram.chats', []);
const setChats = (db: DB, list: TelegramChat[]) => kvSet(db, 'telegram.chats', JSON.stringify(list));
const tokenOf = (db: DB) => readSecret(db, TOKEN_NAME)?.value ?? null;
const notifyOn = (db: DB) => kvGet(db, 'telegram.notify') !== '0';
const agentFor = (db: DB): Agent => (kvGet(db, 'telegram.agent') === 'codex' ? 'codex' : 'claude');
/** The session each chat is in. */
const currentOf = (db: DB, chat: number): string | undefined => readJson<Record<string, string>>(db, 'telegram.current', {})[chat];
const setCurrent = (db: DB, chat: number, key: string | null) => {
  const all = readJson<Record<string, string>>(db, 'telegram.current', {});
  if (key) all[chat] = key;
  else delete all[chat];
  kvSet(db, 'telegram.current', JSON.stringify(all));
};
/** Sessions a chat spoke to, and which chat: their replies go there (the latest 300). */
const chatOfSession = (db: DB, key: string): number | undefined => readJson<Record<string, number>>(db, 'telegram.sessions', {})[key];
function setChatOfSession(db: DB, key: string, chat: number) {
  const all = readJson<Record<string, number>>(db, 'telegram.sessions', {});
  delete all[key];
  all[key] = chat;
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete all[k];
  kvSet(db, 'telegram.sessions', JSON.stringify(all));
}

// ---- Telegram's API -------------------------------------------------------------------------------

async function call<T>(token: string, method: string, body: Record<string, unknown> = {}, o: { signal?: AbortSignal; ms?: number; again?: boolean } = {}): Promise<T> {
  const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(o.ms ?? 30_000)]) : AbortSignal.timeout(o.ms ?? 30_000);
  let r: Response;
  try {
    r = await fetch(`${api()}/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    // Never the address: it holds the token.
    throw new TelegramError(signal.aborted ? 'Telegram did not answer in time' : `Telegram could not be reached (${(e as Error).message})`, 0);
  }
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };
  // Too many messages at once (a long reply in many parts): Telegram says when to send again.
  const after = j.parameters?.retry_after;
  if (!j.ok && j.error_code === 429 && after && after <= 30 && !o.again && !o.signal?.aborted) {
    await new Promise((resolve) => setTimeout(resolve, after * 1000));
    return call<T>(token, method, body, { ...o, again: true });
  }
  if (!j.ok) throw new TelegramError(j.description ?? `Telegram answered ${r.status}`, j.error_code ?? r.status);
  return j.result as T;
}

/** Buttons' data: Telegram keeps 64 bytes a button, so each stands for what it does, kept here (the latest 500). */
type Action = { kind: 'answer'; key: string; id: string; decision: string; label: string } | { kind: 'switch'; key: string };
const actions = new Map<string, Action>();
function button(text: string, a: Action): Button {
  const id = crypto.randomBytes(9).toString('base64url');
  actions.set(id, a);
  if (actions.size > 500) actions.delete(actions.keys().next().value!);
  return { text: text.slice(0, 60), callback_data: id };
}

/** A link to the session in the app, for a button: Telegram takes only addresses on the internet. */
function openButton(d: Deps, path: string): Button[] {
  const url = `${d.publicBase()}${path}`;
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || /^(127\.|10\.|192\.168\.|::1|\[::1\])/.test(host) || !host.includes('.')) return [];
  } catch {
    return [];
  }
  return [{ text: 'Open in Hydor', url }];
}

const keyboard = (rows: Button[][]) => (rows.some((r) => r.length) ? { reply_markup: { inline_keyboard: rows.filter((r) => r.length) } } : {});

/** Words to a chat, as written (no Markdown): the app's own messages. */
async function say(token: string, chat: number, text: string, rows: Button[][] = []) {
  await call(token, 'sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true }, ...keyboard(rows) });
}

/** A reply longer than this many messages ends with a word that the rest is in the app. */
export const MAX_PARTS = 10;

/** An agent's reply to a chat: its Markdown in Telegram's HTML, in parts that fit; as plain text when Telegram refuses that. */
async function sendReply(token: string, chat: number, md: string, rows: Button[][] = []) {
  let parts = chunks(md);
  if (parts.length > MAX_PARTS) parts = [...parts.slice(0, MAX_PARTS - 1), `${parts[MAX_PARTS - 1]}\n\n_The rest of this reply is in the session in Hydor._`];
  for (let i = 0; i < parts.length; i++) {
    const extra = i === parts.length - 1 ? keyboard(rows) : {};
    try {
      await call(token, 'sendMessage', { chat_id: chat, text: telegramHtml(parts[i]), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
    } catch (e) {
      if (!(e instanceof TelegramError) || e.code !== 400) throw e;
      await call(token, 'sendMessage', { chat_id: chat, text: plainText(parts[i]).slice(0, 4000), link_preview_options: { is_disabled: true }, ...extra });
    }
  }
}

// ---- typing, while the agent works ----------------------------------------------------------------

const typing = new Map<number, NodeJS.Timeout>();
function startTyping(token: string, chat: number) {
  stopTyping(chat);
  const began = Date.now();
  const tick = () => {
    if (Date.now() - began > 20 * 60_000) return stopTyping(chat);
    call(token, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
  };
  tick();
  const t = setInterval(tick, 4500);
  t.unref?.();
  typing.set(chat, t);
}
function stopTyping(chat: number) {
  clearInterval(typing.get(chat));
  typing.delete(chat);
}

// ---- linking a chat -------------------------------------------------------------------------------

/** A code to link a chat with, for ten minutes; ten wrong tries end it. */
let pairing: { code: string; until: number; misses: number } | null = null;
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode(): string {
  const b = crypto.randomBytes(8);
  return Array.from(b, (x) => CODE_LETTERS[x % CODE_LETTERS.length]).join('');
}
/** Chats told once that this bot is someone else's. */
const toldAway = new Set<number>();

async function link(d: Deps, token: string, m: TgMessage, text: string) {
  const code = (/^\/start\s+(\S+)/.exec(text)?.[1] ?? text).trim().toUpperCase();
  if (pairing && Date.now() < pairing.until && code === pairing.code && m.from) {
    pairing = null;
    const name = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || (m.from.username ? `@${m.from.username}` : String(m.chat.id));
    setChats(d.db, [...linkedChats(d.db).filter((c) => c.id !== m.chat.id), { id: m.chat.id, name, at: Date.now() }]);
    d.broadcast({ t: 'feature', id: 'telegram', data: { changed: true } });
    await say(token, m.chat.id, 'Linked to Hydor. Send what you want done and an agent starts on it; its reply comes back here. /help says more.');
    return;
  }
  if (pairing && code.length === 8 && ++pairing.misses >= 10) pairing = null;
  if (toldAway.has(m.chat.id)) return;
  toldAway.add(m.chat.id);
  await say(token, m.chat.id, 'This bot is someone’s own Hydor. To use it, link this chat in Hydor: Settings → Telegram → Link a chat.');
}

// ---- a chat speaking ------------------------------------------------------------------------------

const HELP = [
  'Send what you want done: it goes to the session this chat is in, or starts one, and the reply comes back here.',
  '/new: a new session (/new and what it should do starts it at once)',
  '/sessions: the latest sessions, to go on with one',
  '/stop: stop the agent of this chat’s session',
  '/status: which session this chat is in, and what it is doing',
].join('\n');

const COMMANDS = [
  { command: 'new', description: 'A new session' },
  { command: 'sessions', description: 'The latest sessions, to go on with one' },
  { command: 'stop', description: 'Stop the agent' },
  { command: 'status', description: 'This chat’s session and what it is doing' },
  { command: 'help', description: 'What this bot does' },
];

const busy = (status?: string) => status === 'working' || status === 'waiting' || status === 'starting';

/** A message from a linked chat to its session: a new one when it is in none. */
async function toSession(d: Deps, token: string, chat: number, text: string) {
  const key = currentOf(d.db, chat);
  const s = key ? d.sessions.summary(key) : null;
  if (!key || !s) {
    const cwd = makeTaskFolder(taskRoot(d.db), text, dayIn(userTimezone(d.db)));
    const made = await d.sessions.create({ agent: agentFor(d.db), cwd, prompt: text, remember: false });
    setCurrent(d.db, chat, made);
    setChatOfSession(d.db, made, chat);
    startTyping(token, chat);
    await say(token, chat, 'On it: the reply comes here when it is done.', [openButton(d, `/s/${encodeURIComponent(made)}`)]);
    return;
  }
  setChatOfSession(d.db, key, chat);
  if (busy(s.live?.status)) {
    d.sessions.enqueue(key, text);
    await say(token, chat, 'It is still working: this goes to it when its turn ends.');
    return;
  }
  await d.sessions.send(key, text);
  startTyping(token, chat);
}

async function command(d: Deps, token: string, chat: number, name: string, rest: string) {
  const key = currentOf(d.db, chat);
  const s = key ? d.sessions.summary(key) : null;
  if (name === 'new') {
    setCurrent(d.db, chat, null);
    if (rest) return toSession(d, token, chat, rest);
    return say(token, chat, 'Send what the new session should do.');
  }
  if (name === 'sessions') {
    const list = d.sessions.list({ limit: 8 }).sessions.filter((x) => !x.external);
    if (!list.length) return say(token, chat, 'No sessions yet: send what you want done.');
    return say(
      token,
      chat,
      'Go on with:',
      list.map((x) => [button(`${x.key === key ? '• ' : ''}${shortTitle(x.title || 'Untitled', 50)}`, { kind: 'switch', key: x.key })]),
    );
  }
  if (name === 'stop') {
    if (!key || !s || !busy(s.live?.status)) return say(token, chat, 'Nothing is working here.');
    await d.sessions.interrupt(key);
    stopTyping(chat);
    return say(token, chat, 'Stopped.');
  }
  if (name === 'status') {
    if (!key || !s) return say(token, chat, 'This chat is in no session: send what you want done to start one.');
    const what = busy(s.live?.status) ? 'working' : s.live?.status === 'error' ? 'stopped with an error' : 'ready';
    return say(token, chat, `${shortTitle(s.title || 'Untitled')}: ${what}.`, [openButton(d, `/s/${encodeURIComponent(key)}`)]);
  }
  return say(token, chat, HELP);
}

/** The text the agent wrote after the user's last message: the reply of the turn that just ended. */
async function replyOf(d: Deps, key: string): Promise<string> {
  const items = (await d.sessions.timeline(key)).parser.items;
  const out: string[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'user' && !it.meta) break;
    if (it.kind === 'assistant' && it.text.trim()) out.unshift(it.text.trim());
  }
  return out.join('\n\n');
}

async function onCallback(d: Deps, token: string, q: TgCallback) {
  const linked = linkedChats(d.db).some((c) => c.id === q.from.id);
  const a = q.data ? actions.get(q.data) : undefined;
  if (!linked || !a) {
    const why = !linked ? 'This chat is not linked to Hydor.' : q.data === 'done' ? 'Already answered.' : 'This button is from before Hydor restarted: open the session there.';
    await call(token, 'answerCallbackQuery', { callback_query_id: q.id, text: why });
    return;
  }
  if (a.kind === 'switch') {
    setCurrent(d.db, q.from.id, a.key);
    const title = d.sessions.summary(a.key)?.title || 'Untitled';
    await call(token, 'answerCallbackQuery', { callback_query_id: q.id, text: `Now in: ${shortTitle(title, 40)}` });
    await say(token, q.from.id, `This chat is in “${shortTitle(title)}” now: what you send goes there.`);
    return;
  }
  try {
    await d.sessions.answer(a.key, a.id, { decision: a.decision });
  } catch {
    await call(token, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Already answered, or the session moved on.' });
    return;
  }
  actions.delete(q.data!);
  await call(token, 'answerCallbackQuery', { callback_query_id: q.id, text: a.label });
  if (q.message) {
    setChatOfSession(d.db, a.key, q.from.id);
    startTyping(token, q.from.id);
    await call(token, 'editMessageReplyMarkup', {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: `✓ ${a.label}`, callback_data: 'done' }]] },
    }).catch(() => {});
  }
}

/** One update from Telegram: a message, or a press of one of the bot's buttons. */
export async function handleUpdate(d: Deps, token: string, u: TgUpdate) {
  if (u.callback_query) return onCallback(d, token, u.callback_query);
  const m = u.message;
  if (!m || m.chat.type !== 'private' || !m.from || m.from.is_bot) return;
  const text = String(m.text ?? m.caption ?? '').trim();
  if (!linkedChats(d.db).some((c) => c.id === m.chat.id)) return link(d, token, m, text);
  if (!text) return say(token, m.chat.id, 'Send words: pictures, files and voice messages do not reach the agents from Telegram yet.');
  const cmd = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text);
  if (cmd) return command(d, token, m.chat.id, cmd[1].toLowerCase(), (cmd[2] ?? '').trim());
  return toSession(d, token, m.chat.id, text);
}

// ---- notices --------------------------------------------------------------------------------------

/**
 * A session's notice to the linked chats: what it asks (with buttons when Yes or No answers it) to the chat that spoke
 * to it, and with Notify on, every session's notices to every linked chat. A chat's own sessions send their replies
 * when their turns end (turnEnd), so their "Finished" is left out.
 */
export async function notice(d: Deps, n: NotifyEvent) {
  const token = tokenOf(d.db);
  const linked = linkedChats(d.db);
  if (!token || !linked.length) return;
  const own = n.machine ? undefined : chatOfSession(d.db, n.key);
  if (own !== undefined && n.kind !== 'waiting') return;
  if (own === undefined && !notifyOn(d.db)) return;
  const to = own !== undefined ? linked.filter((c) => c.id === own) : linked;
  const path = n.url ?? `${n.machine ? `/m/${n.machine.id}` : ''}/s/${encodeURIComponent(n.key)}`;
  const status = n.kind === 'waiting' ? n.body || NOTICE_VERB.waiting : NOTICE_VERB[n.kind];
  const detail = n.kind !== 'waiting' && n.body && n.body !== status ? `\n${n.body}` : n.approval?.detail ? `\n${n.approval.detail}` : '';
  for (const c of to) {
    // Waiting for an answer, the agent is not typing.
    if (c.id === own) stopTyping(c.id);
    const rows: Button[][] = [];
    if (n.approval && !n.machine) {
      const a = n.approval;
      rows.push([
        button(a.approve.label, { kind: 'answer', key: n.key, id: a.id, decision: a.approve.id, label: a.approve.label }),
        button(a.deny.label, { kind: 'answer', key: n.key, id: a.id, decision: a.deny.id, label: a.deny.label }),
      ]);
    }
    rows.push(openButton(d, path));
    await call(token, 'sendMessage', {
      chat_id: c.id,
      text: `<b>${esc(shortTitle(n.title || 'Hydor'))}</b>\n${esc(status)}${esc(detail).slice(0, 1500)}`,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...keyboard(rows),
    });
  }
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- asking Telegram for what was sent ------------------------------------------------------------

let state: { state: 'off' | 'running' | 'error'; error?: string; bot?: Bot } = { state: 'off' };
let stopped = false;
let polling: AbortController | null = null;
let wakeUp: (() => void) | null = null;

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(() => ((wakeUp = null), resolve()), ms);
    t.unref?.();
    wakeUp = () => (clearTimeout(t), (wakeUp = null), resolve());
  });

/** The token changed (or went): what is being asked of Telegram stops, and asking starts again with the new one. */
function restart() {
  state = { state: 'off' };
  polling?.abort();
  wakeUp?.();
}

async function poll(d: Deps) {
  let wait = 2000;
  while (!stopped) {
    const token = tokenOf(d.db);
    if (!token) {
      state = { state: 'off' };
      await pause(10 * 60_000);
      continue;
    }
    // Each round its own: a restart stops this one only, and the next round's failures still wait before trying again.
    const round = (polling = new AbortController());
    try {
      if (!state.bot) {
        const me = await call<TgUser>(token, 'getMe', {}, { signal: round.signal });
        state = { state: 'running', bot: { id: me.id, username: me.username ?? '', name: me.first_name ?? '' } };
        await call(token, 'setMyCommands', { commands: COMMANDS }, { signal: round.signal }).catch(() => {});
      }
      const offset = Number(kvGet(d.db, 'telegram.offset')) || 0;
      const updates = await call<TgUpdate[]>(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, { signal: round.signal, ms: 65_000 });
      state = { ...state, state: 'running', error: undefined };
      wait = 2000;
      for (const u of updates) {
        kvSet(d.db, 'telegram.offset', String(u.update_id + 1));
        await handleUpdate(d, token, u).catch((e) => console.warn(`[telegram] ${(e as Error).message}`));
      }
    } catch (e) {
      if (stopped) break;
      if (round.signal.aborted) continue;
      state = { ...state, state: 'error', error: (e as Error).message };
      // Another copy asking with the same bot, or a token Telegram no longer takes: said in Settings, tried again later.
      await pause(wait);
      wait = Math.min(wait * 2, 60_000);
    }
  }
}

/** For a clean exit (tests). */
export function stopTelegram() {
  stopped = true;
  restart();
  for (const chat of typing.keys()) stopTyping(chat);
}

// ---- the capability -------------------------------------------------------------------------------

function view(d: Deps) {
  const bot = state.bot;
  return {
    connected: !!readSecret(d.db, TOKEN_NAME),
    state: state.state,
    error: state.error,
    bot: bot ? { username: bot.username, name: bot.name } : undefined,
    chats: linkedChats(d.db),
    notify: notifyOn(d.db),
    agent: agentFor(d.db),
    pairing: pairing && Date.now() < pairing.until ? { code: pairing.code, link: bot?.username ? `https://t.me/${bot.username}?start=${pairing.code}` : undefined, until: pairing.until } : undefined,
  };
}

export const telegram: Feature = {
  id: 'telegram',
  routes(d) {
    const { app, db } = d;
    // The vault's tables, whichever capability starts first.
    vaultTables(db);
    app.get('/api/telegram', async () => view(d));
    app.put('/api/telegram', async (req) => {
      const b = (req.body ?? {}) as { token?: unknown; notify?: unknown; agent?: unknown };
      if (typeof b.token === 'string') {
        const token = b.token.trim();
        if (!/^\d{5,16}:[A-Za-z0-9_-]{30,64}$/.test(token)) throw new HttpError(400, 'That does not look like a bot’s token: @BotFather gives one like 123456789:AA…');
        let me: TgUser;
        try {
          me = await call<TgUser>(token, 'getMe', {}, { ms: 15_000 });
        } catch (e) {
          throw new HttpError(400, `Telegram did not take that token: ${(e as Error).message}`);
        }
        const before = readSecret(db, TOKEN_NAME)?.value;
        saveSecret(db, { name: TOKEN_NAME, value: token, domains: ['api.telegram.org'], note: `The Telegram bot @${me.username ?? ''} (Settings → Telegram)` });
        // Another bot: the chats linked to the old one link again, and its place in Telegram's queue starts over.
        if (before && before !== token) setChats(db, []);
        if (before !== token) kvSet(db, 'telegram.offset', '0');
        restart();
      } else if (b.token === null) {
        deleteSecret(db, TOKEN_NAME);
        setChats(db, []);
        kvSet(db, 'telegram.offset', '0');
        pairing = null;
        restart();
      }
      if (typeof b.notify === 'boolean') kvSet(db, 'telegram.notify', b.notify ? '1' : '0');
      if (b.agent === 'claude' || b.agent === 'codex') kvSet(db, 'telegram.agent', b.agent);
      // Asked again a moment later, the bot's name is there.
      if (typeof b.token === 'string') await new Promise((r) => setTimeout(r, 300));
      return view(d);
    });
    app.post('/api/telegram/pair', async () => {
      if (!readSecret(db, TOKEN_NAME)) throw new HttpError(400, 'Connect a bot first');
      pairing = { code: newCode(), until: Date.now() + 10 * 60_000, misses: 0 };
      toldAway.clear();
      return view(d);
    });
    app.delete('/api/telegram/chats/:id', async (req) => {
      const id = Number((req.params as { id: string }).id);
      setChats(
        db,
        linkedChats(db).filter((c) => c.id !== id),
      );
      setCurrent(db, id, null);
      return view(d);
    });
  },
  start(d) {
    stopped = false;
    void poll(d);
  },
  async turnEnd(t, d) {
    if (t.external) return;
    const chat = chatOfSession(d.db, t.key);
    const token = tokenOf(d.db);
    if (chat === undefined || !token || !linkedChats(d.db).some((c) => c.id === chat)) return;
    stopTyping(chat);
    const open = [openButton(d, `/s/${encodeURIComponent(t.key)}`)];
    if (t.status === 'error') {
      const why = d.sessions.summary(t.key)?.live?.error;
      await say(token, chat, `Stopped with an error${why ? `: ${why.slice(0, 500)}` : '.'}`, open);
      return;
    }
    const reply = await replyOf(d, t.key).catch(() => '');
    await sendReply(token, chat, reply || 'Done.', open);
  },
  event(e, d) {
    if (e.t === 'notify') notice(d, e.n).catch((err) => console.warn(`[telegram] notice: ${(err as Error).message}`));
  },
};
