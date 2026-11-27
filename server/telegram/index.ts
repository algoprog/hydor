// Telegram (Settings → Chat apps → Telegram): your agents in a chat. A bot you make with @BotFather, its token kept in the vault
// (TELEGRAM_BOT_TOKEN), which only the Telegram accounts you linked with a one-time code may use. A message goes on
// with the session the chat is in, or starts one (in a task folder of its own, as the start page does); the agent's
// reply comes back when its turn ends; what it asks comes with buttons that answer it; and the other sessions'
// notices can come too. The app asks Telegram for what was sent (long polling), so it needs no address on the internet.
// Photos, files and voice messages (an album's together) reach the session's folder, fetched from Telegram (up to 20
// MB, its limit for bots), and /as starts a session as one of the person's own agents (server/chatapps/start.ts).
import crypto from 'node:crypto';
import { NOTICE_VERB, shortTitle } from '../../shared/notice.ts';
import type { Agent, NotifyEvent } from '../../shared/types.ts';
import { findAssistant } from '../assistants/store.ts';
import { HttpError } from '../auth.ts';
import { download, TooBig, type ChatFile } from '../chatapps/files.ts';
import { agentChoices, asCommand, chatAgent, chatProgram, defaultAgent, deliver, isChatProgram, pressedAs, type ChatSide } from '../chatapps/start.ts';
import { deleteSecret, readSecret, saveSecret, vaultTables } from '../connections/vault.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
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
interface TgFile {
  file_id: string;
  file_size?: number;
  file_name?: string;
  mime_type?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  /** A photo in its sizes, the largest last. */
  photo?: TgFile[];
  document?: TgFile;
  voice?: TgFile;
  audio?: TgFile;
  video?: TgFile;
  video_note?: TgFile;
  /** The parts of an album share it. */
  media_group_id?: string;
  /** Forwarded from someone else. */
  forward_origin?: unknown;
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

/** Telegram saying no to a token: a wrong one, or one revoked (or its bot deleted) in @BotFather. Not an answer slow to
 *  come, a busy moment (429) or a fault of Telegram's own (5xx): those pass, and asking again gets through. */
const refused = (e: unknown) => e instanceof TelegramError && (e.code === 401 || e.code === 404);
const passing = (e: unknown) => e instanceof TelegramError && (e.code === 0 || e.code === 429 || e.code >= 500);

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
const programFor = (db: DB) => chatProgram(kvGet(db, 'telegram.agent'));
/** The agent (an assistant's id) new sessions start as (Settings → Chat apps → Telegram): none for the program alone. */
const ownAgent = (db: DB) => defaultAgent(db, kvGet(db, 'telegram.as'));
/** The agent /as picked for a chat's next new session, until one starts. */
const nextAs = (db: DB, chat: number): string | undefined => readJson<Record<string, string>>(db, 'telegram.asNext', {})[chat];
const setNextAs = (db: DB, chat: number, id: string | null) => {
  const all = readJson<Record<string, string>>(db, 'telegram.asNext', {});
  if (id) all[chat] = id;
  else delete all[chat];
  kvSet(db, 'telegram.asNext', JSON.stringify(all));
};
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
type Action = { kind: 'answer'; key: string; id: string; decision: string; label: string } | { kind: 'switch'; key: string } | { kind: 'as'; id: string };
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
  await say(token, m.chat.id, 'This bot is someone’s own Hydor. To use it, link this chat in Hydor: Settings → Chat apps → Telegram → Link a chat.');
}

// ---- a chat speaking ------------------------------------------------------------------------------

const HELP = [
  'Send what you want done: it goes to the session this chat is in, or starts one, and the reply comes back here. Photos, files and voice messages go with it (a caption too).',
  '/new: a new session (/new and what it should do starts it at once)',
  '/as and an agent’s name: a new session as one of your agents (/as Bookkeeper and what it should do starts it at once)',
  '/agents: your agents, to pick one',
  '/sessions: the latest sessions, to go on with one',
  '/stop: stop the agent of this chat’s session',
  '/status: which session this chat is in, and what it is doing',
].join('\n');

const COMMANDS = [
  { command: 'new', description: 'A new session' },
  { command: 'as', description: 'A new session as one of your agents: /as and its name' },
  { command: 'agents', description: 'Your agents, to pick one' },
  { command: 'sessions', description: 'The latest sessions, to go on with one' },
  { command: 'stop', description: 'Stop the agent' },
  { command: 'status', description: 'This chat’s session and what it is doing' },
  { command: 'help', description: 'What this bot does' },
];

const busy = (status?: string) => status === 'working' || status === 'waiting' || status === 'starting';

/** Telegram lets bots fetch files of up to 20 MB. */
export const TELEGRAM_MAX = 20 * 1024 * 1024;

/** The chat as server/chatapps/start.ts sees it: where its messages go, and how it is answered. */
const side = (d: Deps, token: string, chat: number): ChatSide => ({
  app: 'Telegram',
  program: chatAgent(programFor(d.db)),
  as: nextAs(d.db, chat) ?? ownAgent(d.db),
  tookAs: () => setNextAs(d.db, chat, null),
  current: () => currentOf(d.db, chat),
  setCurrent: (k) => setCurrent(d.db, chat, k),
  own: (k) => setChatOfSession(d.db, k, chat),
  say: (text, open) => say(token, chat, text, open ? [openButton(d, `/s/${encodeURIComponent(open)}`)] : []),
  busy: (on) => (on ? startTyping(token, chat) : stopTyping(chat)),
  maxBytes: TELEGRAM_MAX,
  limitSays: 'Telegram lets bots fetch files of up to 20 MB',
});

/** What a message sent beside words, to fetch from Telegram: a photo at its largest, a document, a voice message… */
function filesOf(token: string, m: TgMessage): ChatFile[] {
  const fetchOf = (id: string) => async (max: number) => {
    const f = await call<{ file_path?: string; file_size?: number }>(token, 'getFile', { file_id: id }).catch((e: Error) => {
      if (/too big/i.test(e.message)) throw new TooBig();
      throw e;
    });
    if (f.file_size && f.file_size > max) throw new TooBig();
    if (!f.file_path) throw new Error('Telegram gave no address for it');
    return (await download(`${api()}/file/bot${token}/${f.file_path}`, { max, what: 'Telegram' })).data;
  };
  const forwarded = m.forward_origin ? { forwarded: true } : {};
  const out: ChatFile[] = [];
  const photo = m.photo?.[m.photo.length - 1];
  if (photo) out.push({ kind: 'photo', size: photo.file_size, mime: 'image/jpeg', fetch: fetchOf(photo.file_id), ...forwarded });
  if (m.voice) out.push({ kind: 'voice', size: m.voice.file_size, mime: m.voice.mime_type ?? 'audio/ogg', fetch: fetchOf(m.voice.file_id), ...forwarded });
  for (const f of [m.document, m.audio, m.video, m.video_note]) {
    if (!f) continue;
    out.push({ kind: /^image\//.test(f.mime_type ?? '') ? 'photo' : 'file', name: f.file_name, size: f.file_size, mime: f.mime_type ?? (f === m.video_note ? 'video/mp4' : undefined), fetch: fetchOf(f.file_id), ...forwarded });
  }
  return out;
}

/** The person's agents as buttons, two a row: pressing one starts the chat's next session as it. */
function agentsList(d: Deps, token: string, chat: number) {
  const list = agentChoices(d.db, 24);
  const rows: Button[][] = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2).map((a) => button(a.name, { kind: 'as', id: a.id })));
  return say(token, chat, 'Start a new session as one of your agents (or send /as and its name):', rows);
}

async function command(d: Deps, token: string, chat: number, name: string, rest: string, files: ChatFile[] = []) {
  const key = currentOf(d.db, chat);
  const s = key ? d.sessions.summary(key) : null;
  if (name === 'new') {
    setCurrent(d.db, chat, null);
    if (rest || files.length) return deliver(d, side(d, token, chat), { text: rest, files });
    return say(token, chat, 'Send what the new session should do.');
  }
  if (name === 'agents') return agentsList(d, token, chat);
  if (name === 'as') {
    if ((await asCommand(d, side(d, token, chat), (id) => setNextAs(d.db, chat, id), rest, files)) === 'list') return agentsList(d, token, chat);
    return;
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
  if (a.kind === 'as') {
    const r = await pressedAs(d, side(d, token, q.from.id), (id) => setNextAs(d.db, q.from.id, id), a.id);
    await call(token, 'answerCallbackQuery', { callback_query_id: q.id, text: r.toast });
    await say(token, q.from.id, r.text);
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

/** For tests: how long the parts of an album are waited for. */
export const telegramTuning = { albumMs: 1500 };
/** Albums coming in, by chat and album: their parts so far, and the wait for the next. */
const albums = new Map<string, { parts: TgMessage[]; timer: NodeJS.Timeout }>();

/** One message (or an album's parts, as one): a command, or words and files for the chat's session. */
async function onMessage(d: Deps, token: string, parts: TgMessage[]) {
  const chat = parts[0].chat.id;
  const text = parts.map((m) => String(m.text ?? m.caption ?? '').trim()).find(Boolean) ?? '';
  const files = parts.flatMap((m) => filesOf(token, m));
  const forwarded = !!parts[0].forward_origin;
  if (!text && !files.length) return say(token, chat, 'Send words, photos, files or voice messages: stickers, polls and the like do not reach the agents.');
  const cmd = forwarded ? null : /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text);
  if (cmd) return command(d, token, chat, cmd[1].toLowerCase(), (cmd[2] ?? '').trim(), files);
  return deliver(d, side(d, token, chat), { text, files, forwarded });
}

/** One update from Telegram: a message, or a press of one of the bot's buttons. An album's parts wait for each other. */
export async function handleUpdate(d: Deps, token: string, u: TgUpdate) {
  if (u.callback_query) return onCallback(d, token, u.callback_query);
  const m = u.message;
  if (!m || m.chat.type !== 'private' || !m.from || m.from.is_bot) return;
  const text = String(m.text ?? m.caption ?? '').trim();
  if (!linkedChats(d.db).some((c) => c.id === m.chat.id)) return link(d, token, m, text);
  if (m.media_group_id) {
    const id = `${m.chat.id}:${m.media_group_id}`;
    const album = albums.get(id) ?? { parts: [], timer: undefined as unknown as NodeJS.Timeout };
    album.parts.push(m);
    clearTimeout(album.timer);
    album.timer = setTimeout(() => {
      albums.delete(id);
      onMessage(d, token, album.parts).catch((e) => console.warn(`[telegram] ${(e as Error).message}`));
    }, telegramTuning.albumMs);
    albums.set(id, album);
    return;
  }
  return onMessage(d, token, [m]);
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

// While connecting, error is why the last try did not get through (Settings shows it as a note, not as an error).
let state: { state: 'off' | 'connecting' | 'running' | 'error'; error?: string; bot?: Bot } = { state: 'off' };
let stopped = false;
let polling: AbortController | null = null;
let wakeUp: (() => void) | null = null;
/** The bot whose menu of commands is set; and whether a webhook was taken off the bot connected last. */
let commandsFor = 0;
let webhookOff = false;

const botOf = (me: TgUser): Bot => ({ id: me.id, username: me.username ?? '', name: me.first_name ?? '' });

/** How a round that failed shows in Settings: what needs the user is an error; what passes leaves it connecting. */
function trouble(e: unknown): { state: 'connecting' | 'error'; error: string } {
  const why = (e as Error).message;
  if (passing(e)) return { state: 'connecting', error: why };
  if (refused(e)) return { state: 'error', error: new Error(`Telegram does not take this bot’s token (${why}): copy the current one from @BotFather and paste it under More → Change token.`).message };
  if (e instanceof TelegramError && e.code === 409) return { state: 'error', error: new Error(`Another program is getting this bot’s messages (${why}). A bot gets them in one place only: disconnect it there, or make another bot for this Hydor.`).message };
  return { state: 'error', error: why };
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(() => ((wakeUp = null), resolve()), ms);
    t.unref?.();
    wakeUp = () => (clearTimeout(t), (wakeUp = null), resolve());
  });

/** The token changed (or went): what is being asked of Telegram stops, and asking starts again with the new one. */
function restart() {
  state = { state: 'off' };
  webhookOff = false;
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
      // The bot, unless Connect already asked Telegram for it.
      let bot = state.bot;
      if (!bot) {
        bot = botOf(await call<TgUser>(token, 'getMe', {}, { signal: round.signal }));
        state = { state: 'running', bot };
      }
      // Its menu of commands, once a bot, without holding up its messages (tried again next round if it fails).
      const id = bot.id;
      if (commandsFor !== id) call(token, 'setMyCommands', { commands: COMMANDS }).then(() => (commandsFor = id), () => {});
      const offset = Number(kvGet(d.db, 'telegram.offset')) || 0;
      const updates = await call<TgUpdate[]>(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, { signal: round.signal, ms: 65_000 });
      state = { state: 'running', bot };
      wait = 2000;
      for (const u of updates) {
        kvSet(d.db, 'telegram.offset', String(u.update_id + 1));
        await handleUpdate(d, token, u).catch((e) => console.warn(`[telegram] ${(e as Error).message}`));
      }
    } catch (e) {
      if (stopped) break;
      if (round.signal.aborted) continue;
      // A webhook (an address another program gave the bot for its messages) stops Hydor asking for them: taken off
      // once for each bot connected here, since the user connected it to have its messages here.
      if (e instanceof TelegramError && e.code === 409 && /webhook/i.test(e.message) && !webhookOff) {
        webhookOff = true;
        if (await call(token, 'deleteWebhook', {}, { signal: round.signal }).then(() => true, () => false)) continue;
      }
      // Telegram slow or busy: still connecting, tried again soon. A token it no longer takes, or another program
      // asking with the same bot: said in Settings, and tried again later all the same.
      state = { ...state, ...trouble(e) };
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
  for (const a of albums.values()) clearTimeout(a.timer);
  albums.clear();
}

// ---- the capability -------------------------------------------------------------------------------

function view(d: Deps) {
  const bot = state.bot;
  return {
    connected: !!readSecret(d.db, TOKEN_NAME),
    state: state.state,
    error: state.state === 'error' ? state.error : undefined,
    // Why it is still connecting (Telegram slow to answer, or not reached): Hydor keeps trying.
    note: state.state === 'connecting' ? state.error : undefined,
    bot: bot ? { username: bot.username, name: bot.name } : undefined,
    chats: linkedChats(d.db),
    notify: notifyOn(d.db),
    agent: programFor(d.db),
    as: ownAgent(d.db) ?? null,
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
      const b = (req.body ?? {}) as { token?: unknown; notify?: unknown; agent?: unknown; as?: unknown };
      if (typeof b.token === 'string') {
        const token = b.token.trim();
        if (!/^\d{5,16}:[A-Za-z0-9_-]{30,64}$/.test(token)) throw new HttpError(400, 'That does not look like a bot’s token: @BotFather gives one like 123456789:AA…');
        // Only Telegram saying no turns a token down. When it is slow to answer (a new bot's first minutes), busy or
        // not reached, the token is kept all the same: the bot connects by itself as soon as Telegram answers, and
        // Settings says it is connecting meanwhile, and why.
        let me: TgUser | undefined;
        let failed: unknown;
        try {
          me = await call<TgUser>(token, 'getMe', {}, { ms: 10_000 });
        } catch (e) {
          if (refused(e)) throw new HttpError(400, `Telegram did not take that token: ${(e as Error).message}`);
          failed = e;
        }
        const before = readSecret(db, TOKEN_NAME)?.value;
        saveSecret(db, { name: TOKEN_NAME, value: token, domains: ['api.telegram.org'], note: `The Telegram bot${me?.username ? ` @${me.username}` : ''} (Settings → Chat apps → Telegram)` });
        // Another bot: the chats linked to the old one link again, and its place in Telegram's queue starts over.
        if (before && before !== token) setChats(db, []);
        if (before !== token) kvSet(db, 'telegram.offset', '0');
        restart();
        state = me ? { state: 'running', bot: botOf(me) } : { state: 'connecting', error: (failed as Error).message };
      } else if (b.token === null) {
        deleteSecret(db, TOKEN_NAME);
        setChats(db, []);
        kvSet(db, 'telegram.offset', '0');
        pairing = null;
        restart();
      }
      if (typeof b.notify === 'boolean') kvSet(db, 'telegram.notify', b.notify ? '1' : '0');
      if (isChatProgram(b.agent)) kvSet(db, 'telegram.agent', b.agent);
      if (b.as === null || b.as === '') kvSet(db, 'telegram.as', '');
      else if (typeof b.as === 'string') {
        if (!findAssistant(db, b.as)) throw new HttpError(404, 'No such agent: the Agents page lists yours');
        kvSet(db, 'telegram.as', b.as);
      }
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
      setNextAs(db, id, null);
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
