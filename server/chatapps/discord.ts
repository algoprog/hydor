// Discord (Settings → Chat apps → Discord): your agents in a Discord chat, the way Telegram has them. A bot of your own
// (made in Discord's Developer Portal), its token kept in the vault (DISCORD_BOT_TOKEN); only the people you link with a
// one-time code may use it, in a direct message to the bot or where it is mentioned in a server's channel. The app
// connects to Discord's Gateway (a WebSocket the bot opens itself) for messages and button presses, and uses Discord's
// REST API to send, so it needs no address on the internet.
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { discordInvite } from '../../shared/chat-apps.ts';
import { HttpError } from '../auth.ts';
import { deleteSecret, readSecret, saveSecret, vaultTables } from '../connections/vault.ts';
import { kvGet, kvSet } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { chatApp, MAX_PARTS, tuning, type Btn, type Incoming, type Rows, type Wire } from './core.ts';
import { chunks, DISCORD_CHARS, discordMarkdown, plainText } from './format.ts';

export const TOKEN_NAME = 'DISCORD_BOT_TOKEN';
const api = () => (process.env.DISCORD_API ?? 'https://discord.com/api/v10').replace(/\/+$/, '');
const USER_AGENT = 'DiscordBot (https://github.com/algoprog/hydor, 1)';

/** Guild messages, direct messages and message content: what the bot must hear. */
export const INTENTS = (1 << 9) | (1 << 12) | (1 << 15);
/** The application's flags that say the Message Content intent is on (for the bot's own use, or still limited). */
const MESSAGE_CONTENT_FLAGS = (1 << 18) | (1 << 19);

class DiscordError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

// ---- Discord's REST API ---------------------------------------------------------------------------

async function rest<T = any>(token: string, method: string, path: string, body?: unknown, o: { ms?: number; again?: boolean } = {}): Promise<T> {
  const signal = AbortSignal.timeout(o.ms ?? 20_000);
  let r: Response;
  try {
    r = await fetch(`${api()}${path}`, {
      method,
      headers: { authorization: `Bot ${token}`, 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new DiscordError(signal.aborted ? 'Discord did not answer in time' : `Discord could not be reached (${(e as Error).message})`, 0);
  }
  if (r.status === 204) return undefined as T;
  const j = (await r.json().catch(() => ({}))) as { message?: string; code?: number; retry_after?: number };
  // Too many messages at once: Discord says when to send again.
  if (r.status === 429 && !o.again && (j.retry_after ?? 99) <= 30) {
    await new Promise((resolve) => setTimeout(resolve, Math.ceil((j.retry_after ?? 1) * 1000)));
    return rest<T>(token, method, path, body, { ...o, again: true });
  }
  if (!r.ok) throw new DiscordError(j.message ?? `Discord answered ${r.status}`, r.status);
  return j as T;
}

/** Interactions are answered with the interaction's own token, not the bot's. */
async function answerInteraction(i: { id: string; token: string }, type: number, data?: Record<string, unknown>) {
  const r = await fetch(`${api()}/interactions/${i.id}/${i.token}/callback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ type, data }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new DiscordError(`Discord answered ${r.status}`, r.status);
}

const tokenOf = (d: Deps) => readSecret(d.db, TOKEN_NAME)?.value ?? null;

// ---- how Discord shows what the app says ----------------------------------------------------------

const STYLE = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
/** Buttons as Discord's rows of components: five rows of five at most. */
function components(rows: Rows) {
  const out = rows
    .filter((r) => r.length)
    .slice(0, 5)
    .map((r) => ({
      type: 1,
      components: r.slice(0, 5).map((b: Btn) =>
        b.url
          ? { type: 2, style: STYLE.link, label: b.text.slice(0, 80), url: b.url }
          : { type: 2, style: b.style === 'primary' ? STYLE.primary : b.style === 'danger' ? STYLE.danger : STYLE.secondary, label: b.text.slice(0, 80), custom_id: b.id },
      ),
    }));
  return out.length ? { components: out } : {};
}
const NO_PINGS = { parse: [] as string[] };
/** Embeds are left out of every message: a link in a reply stays a line of text. */
const SUPPRESS_EMBEDS = 4;

async function post(token: string, chat: string, content: string, rows: Rows = []) {
  await rest(token, 'POST', `/channels/${chat}/messages`, { content, allowed_mentions: NO_PINGS, flags: SUPPRESS_EMBEDS, ...components(rows) });
}

const typing = new Map<string, NodeJS.Timeout>();
function stopTyping(chat: string) {
  clearInterval(typing.get(chat));
  typing.delete(chat);
}

function wireOf(d: Deps): Wire {
  const token = () => tokenOf(d) ?? '';
  return {
    async say(chat, text, rows = []) {
      await post(token(), chat, text.slice(0, 2000), rows);
    },
    async reply(chat, md, rows = []) {
      let parts = chunks(md, DISCORD_CHARS);
      if (parts.length > MAX_PARTS) parts = [...parts.slice(0, MAX_PARTS - 1), `${parts[MAX_PARTS - 1]}\n\n_The rest of this reply is in the session in Hydor._`];
      for (let i = 0; i < parts.length; i++) {
        const last = i === parts.length - 1;
        try {
          await post(token(), chat, discordMarkdown(parts[i]).slice(0, 2000), last ? rows : []);
        } catch (e) {
          // What Discord will not take as it is goes as plain text.
          if (!(e instanceof DiscordError) || e.code !== 400) throw e;
          await post(token(), chat, plainText(parts[i]).slice(0, 2000), last ? rows : []);
        }
      }
    },
    async notice(chat, n, rows) {
      await post(token(), chat, `**${n.title}**\n${n.status}${n.detail}`.slice(0, 2000), rows);
    },
    busy(chat, on) {
      stopTyping(chat);
      if (!on) return;
      const began = Date.now();
      const tick = () => {
        if (Date.now() - began > 20 * 60_000) return stopTyping(chat);
        rest(token(), 'POST', `/channels/${chat}/typing`).catch(() => {});
      };
      tick();
      const t = setInterval(tick, 8000);
      t.unref?.();
      typing.set(chat, t);
    },
  };
}

// ---- the Gateway ----------------------------------------------------------------------------------

/** Close codes after which trying again is no use until the person changes something. */
const FATAL: Record<number, string> = {
  4004: 'Discord did not take the bot’s token (was it reset?): paste the current one.',
  4010: 'Discord refused the connection (invalid shard).',
  4011: 'Discord says this bot is in too many servers for one connection.',
  4012: 'Discord does not speak the version of its Gateway this app asks for: update Hydor.',
  4013: 'Discord refused the intents this bot asks for.',
  4014: 'Discord refused the connection: turn on Message Content Intent for the bot (Developer Portal → Bot → Privileged Gateway Intents) and Connect again.',
};
/** After these the session is over, and a new one starts (the others are resumed). */
const NEW_SESSION = new Set([1000, 1001, 4007, 4009]);

interface GatewayState {
  state: 'connecting' | 'running' | 'error';
  error?: string;
}

/**
 * One bot's connection to Discord's Gateway: Hello, then Identify (or Resume after a break), heartbeats that must be
 * answered, Reconnect and Invalid Session asked for, and a new connection after any close that is not fatal.
 */
export class Gateway {
  private ws: WebSocket | null = null;
  private seq: number | null = null;
  private session: string | null = null;
  private resumeUrl: string | null = null;
  private beat: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;
  private acked = true;
  private done = false;
  private sleeping: (() => void) | null = null;

  constructor(
    private o: {
      token: string;
      onState(s: GatewayState): void;
      onReady(d: any): void;
      onDispatch(t: string, d: any): void;
    },
  ) {}

  stop() {
    this.done = true;
    this.close(1000);
    this.sleeping?.();
  }

  private close(code: number) {
    clearTimeout(this.first ?? undefined);
    clearInterval(this.beat ?? undefined);
    this.first = this.beat = null;
    try {
      this.ws?.close(code);
    } catch {}
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => ((this.sleeping = null), resolve()), ms);
      t.unref?.();
      this.sleeping = () => (clearTimeout(t), (this.sleeping = null), resolve());
    });
  }

  /** Connects, and again after each close, until stopped or told it is no use. */
  async run() {
    let wait = tuning.retryMs;
    // Why the last try failed, said in Settings while it goes on trying.
    let why: string | undefined;
    while (!this.done) {
      let code = 0;
      try {
        this.o.onState({ state: 'connecting', error: why });
        const url = this.session && this.resumeUrl ? this.resumeUrl : (await rest<{ url: string }>(this.o.token, 'GET', '/gateway/bot')).url;
        code = await this.connect(url);
      } catch (e) {
        if (this.done) break;
        if (e instanceof DiscordError && e.code === 401) {
          this.o.onState({ state: 'error', error: FATAL[4004] });
          return;
        }
        // Not answering, rate limits and Discord's own faults pass: stay connecting and try again.
        why = (e as Error).message;
        this.o.onState({ state: 'connecting', error: why });
        await this.sleep(wait);
        wait = Math.min(wait * 2, tuning.maxRetryMs);
        continue;
      }
      if (this.done) break;
      if (FATAL[code]) {
        this.o.onState({ state: 'error', error: FATAL[code] });
        return;
      }
      if (NEW_SESSION.has(code)) this.session = this.resumeUrl = this.seq = null;
      // A connection that got as far as being ready starts the waits over.
      wait = this.ready ? tuning.retryMs : Math.min(wait * 2, tuning.maxRetryMs);
      why = `Disconnected (${code})`;
      this.o.onState({ state: 'connecting', error: why });
      await this.sleep(wait);
    }
  }

  private ready = false;

  /** One connection: resolves with the code it closed with. */
  private connect(url: string): Promise<number> {
    this.ready = false;
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(`${url.replace(/\/+$/, '')}/?v=10&encoding=json`, { perMessageDeflate: false, handshakeTimeout: 15_000 }));
      const send = (op: number, d: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ op, d }));
      const heartbeat = () => {
        // The last one was never answered: the connection is dead; resume on a new one.
        if (!this.acked) return ws.terminate();
        this.acked = false;
        send(1, this.seq);
      };
      ws.on('message', (raw) => {
        let m: { op: number; d: any; s?: number | null; t?: string };
        try {
          m = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (typeof m.s === 'number') this.seq = m.s;
        switch (m.op) {
          case 10: {
            const every = Math.max(50, Number(m.d?.heartbeat_interval) || 41_250);
            this.acked = true;
            // The first heartbeat comes after a random part of the interval, as Discord asks.
            this.first = setTimeout(() => {
              heartbeat();
              this.beat = setInterval(heartbeat, every);
            }, every * Math.random());
            if (this.session && this.seq !== null) send(6, { token: this.o.token, session_id: this.session, seq: this.seq });
            else send(2, { token: this.o.token, intents: INTENTS, properties: { os: process.platform, browser: 'hydor', device: 'hydor' } });
            break;
          }
          case 11:
            this.acked = true;
            break;
          case 1:
            heartbeat();
            break;
          case 7:
            // Discord asks for a new connection: the session can be resumed on it.
            ws.close(4000);
            break;
          case 9:
            if (m.d !== true) this.session = this.resumeUrl = this.seq = null;
            ws.close(4000);
            break;
          case 0:
            if (m.t === 'READY') {
              this.session = m.d.session_id;
              this.resumeUrl = m.d.resume_gateway_url ?? null;
              this.ready = true;
              this.o.onState({ state: 'running' });
              this.o.onReady(m.d);
            } else if (m.t === 'RESUMED') {
              this.ready = true;
              this.o.onState({ state: 'running' });
            } else if (m.t) this.o.onDispatch(m.t, m.d);
            break;
        }
      });
      ws.on('error', (e) => {
        // A connection that never opened has no close code to give: say why.
        if (ws.readyState !== WebSocket.OPEN) reject(e);
      });
      ws.on('close', (code) => {
        clearTimeout(this.first ?? undefined);
        clearInterval(this.beat ?? undefined);
        this.first = this.beat = null;
        resolve(code);
      });
    });
  }
}

// ---- the bot --------------------------------------------------------------------------------------

const discordApp = chatApp({
  id: 'discord',
  label: 'Discord',
  where: 'Settings → Chat apps → Discord',
  wire: wireOf,
  connected: (d) => !!readSecret(d.db, TOKEN_NAME),
});

const COMMANDS = [
  { name: 'new', description: 'A new session', type: 1, options: [{ type: 3, name: 'prompt', description: 'What it should do', required: false }] },
  { name: 'sessions', description: 'The latest sessions, to go on with one', type: 1 },
  { name: 'stop', description: 'Stop the agent', type: 1 },
  { name: 'status', description: 'This chat’s session and what it is doing', type: 1 },
  { name: 'help', description: 'What this bot does', type: 1 },
];

interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
}
export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  type?: number;
  content?: string;
  author: DiscordUser;
  mentions?: DiscordUser[];
}
export interface DiscordInteraction {
  id: string;
  token: string;
  type: number;
  channel_id?: string;
  user?: DiscordUser;
  member?: { user: DiscordUser };
  data?: { custom_id?: string; name?: string; options?: { name: string; value?: unknown }[] };
}

let state: { state: 'off' | 'connecting' | 'running' | 'error'; error?: string; bot?: { id: string; username: string } } = { state: 'off' };
let botId = '';
let stopped = false;
let current: Gateway | null = null;
let wakeUp: (() => void) | null = null;
let events: Promise<unknown> = Promise.resolve();

const nameOf = (u: DiscordUser) => u.global_name || u.username || u.id;

/** A message the bot was sent: in a direct message always, in a server's channel when it is mentioned. */
export async function handleMessage(d: Deps, m: DiscordMessage) {
  if (m.author.bot || (m.type !== undefined && m.type !== 0 && m.type !== 19)) return;
  const direct = !m.guild_id;
  let text = String(m.content ?? '');
  if (!direct) {
    const me = botId || state.bot?.id || '';
    if (!me || !(m.mentions ?? []).some((u) => u.id === me)) return;
    text = text.replace(new RegExp(`<@!?${me}>`, 'g'), '');
  }
  const i: Incoming = { chat: m.channel_id, user: m.author.id, name: nameOf(m.author), text, direct };
  await discordApp.incoming(d, wireOf(d), i);
}

/** A press of a button, or a slash command. */
export async function handleInteraction(d: Deps, i: DiscordInteraction) {
  const user = i.user ?? i.member?.user;
  const chat = i.channel_id;
  if (!user || !chat) return;
  const w = wireOf(d);
  const ephemeral = (content: string) => answerInteraction(i, 4, { content, flags: 64 });
  if (i.type === 3) {
    const r = await discordApp.pressed(d, w, { chat, user: user.id, id: i.data?.custom_id ?? '' });
    if (!r.ok) return ephemeral(r.text);
    if (r.kind === 'switch') {
      await answerInteraction(i, 6);
      return w.say(chat, r.text);
    }
    // The buttons give way to the one that was pressed.
    return answerInteraction(i, 7, { components: [{ type: 1, components: [{ type: 2, style: STYLE.success, label: `✓ ${r.label}`.slice(0, 80), custom_id: 'done', disabled: true }] }] });
  }
  if (i.type === 2) {
    const name = i.data?.name ?? '';
    if (!discordApp.isLinked(d.db, chat, user.id)) return ephemeral('This bot is someone’s own Hydor. To use it, link this chat in Hydor: Settings → Chat apps → Discord → Link a chat.');
    // The first thing said is the command's answer; the rest are messages in the channel.
    let answered = false;
    const first = w.say;
    w.say = async (c, text, rows = []) => {
      if (answered || c !== chat) return first(c, text, rows);
      answered = true;
      await answerInteraction(i, 4, { content: text.slice(0, 2000), allowed_mentions: NO_PINGS, flags: SUPPRESS_EMBEDS, ...components(rows) });
    };
    const prompt = String(i.data?.options?.find((o) => o.name === 'prompt')?.value ?? '');
    await discordApp.incoming(d, w, { chat, user: user.id, name: nameOf(user), text: `/${name} ${prompt}`.trim(), direct: true });
    if (!answered) await ephemeral('Done.');
  }
}

/** One event from the Gateway. */
export async function dispatch(d: Deps, t: string, data: any) {
  if (t === 'MESSAGE_CREATE') return handleMessage(d, data);
  if (t === 'INTERACTION_CREATE') return handleInteraction(d, data);
}

/** The slash commands, made known to Discord once for each change of them. */
async function registerCommands(d: Deps, token: string, application: string) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(COMMANDS)).digest('hex').slice(0, 12);
  if (kvGet(d.db, 'discord.commands') === `${application}:${hash}`) return;
  await rest(token, 'PUT', `/applications/${application}/commands`, COMMANDS);
  kvSet(d.db, 'discord.commands', `${application}:${hash}`);
}

function restart() {
  state = { state: 'off' };
  current?.stop();
  wakeUp?.();
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(() => ((wakeUp = null), resolve()), ms);
    t.unref?.();
    wakeUp = () => (clearTimeout(t), (wakeUp = null), resolve());
  });

async function supervise(d: Deps) {
  while (!stopped) {
    const token = tokenOf(d);
    if (!token) {
      state = { state: 'off' };
      await pause(10 * 60_000);
      continue;
    }
    const gw = (current = new Gateway({
      token,
      onState: (s) => {
        if (current === gw) state = { ...state, ...s, error: s.error };
      },
      onReady: (ready) => {
        botId = ready.user?.id ?? botId;
        state = { ...state, bot: { id: ready.user?.id ?? '', username: ready.user?.username ?? '' } };
        const app = ready.application?.id ?? ready.user?.id;
        // A token saved without a check is known now.
        if (kvGet(d.db, 'discord.unchecked') && ready.user?.id) {
          known(d, token, { id: ready.user.id, username: ready.user.username }, { id: app && String(app), flags: ready.application?.flags });
        }
        if (app) {
          kvSet(d.db, 'discord.app', String(app));
          registerCommands(d, token, String(app)).catch((e) => console.warn(`[discord] commands: ${(e as Error).message}`));
        }
      },
      // One at a time, in the order they came.
      onDispatch: (t, data) => {
        events = events.then(() => dispatch(d, t, data)).catch((e) => console.warn(`[discord] ${(e as Error).message}`));
      },
    }));
    await gw.run();
    if (stopped) break;
    // Not fatal ones are tried again inside; here the person must change something (a new token): wait for it.
    if (current === gw && state.state === 'error') await pause(10 * 60_000);
  }
}

/** For a clean exit (tests). */
export function stopDiscord() {
  stopped = true;
  restart();
  for (const chat of [...typing.keys()]) stopTyping(chat);
}

/** What a bot's token tells once Discord has answered: whose it is, its application, and what its settings lack. */
function known(d: Deps, token: string, me: DiscordUser, application: { id?: string; flags?: number } | null) {
  kvSet(d.db, 'discord.unchecked', '');
  saveSecret(d.db, { name: TOKEN_NAME, value: token, domains: ['discord.com'], note: `The Discord bot ${me.username ?? ''} (Settings → Chat apps → Discord)` });
  // Another bot: the chats linked to the old one link again (a new token for the same bot changes nothing).
  const before = kvGet(d.db, 'discord.bot');
  if (before && before !== me.id) discordApp.unlinkAll(d);
  kvSet(d.db, 'discord.bot', me.id);
  kvSet(d.db, 'discord.app', String(application?.id ?? me.id));
  // Said in Settings while the connection has nothing else to say.
  const off = application?.flags !== undefined && !(application.flags & MESSAGE_CONTENT_FLAGS);
  kvSet(d.db, 'discord.warn', off ? 'Message Content Intent is off for this bot: turn it on in the Developer Portal (Bot → Privileged Gateway Intents), or it cannot read what you send.' : '');
  botId = me.id;
}

function view(d: Deps) {
  const app = kvGet(d.db, 'discord.app');
  return {
    ...discordApp.view(d),
    state: state.state,
    error: state.state === 'error' ? state.error : undefined,
    // Why the last try to connect failed, while it keeps trying.
    note: state.state === 'connecting' ? state.error : undefined,
    warning: kvGet(d.db, 'discord.warn') || undefined,
    bot: state.bot ? { username: state.bot.username } : undefined,
    invite: app ? discordInvite(app) : undefined,
  };
}

export const discord: Feature = {
  id: 'discord',
  routes(d) {
    vaultTables(d.db);
    discordApp.routes(d, {
      view: () => view(d),
      async connect(b) {
        if (typeof b.token === 'string') {
          const token = b.token.trim();
          if (!/^[\w-]{18,}\.[\w-]{5,}\.[\w-]{20,}$/.test(token)) throw new HttpError(400, 'That does not look like a bot’s token: the Developer Portal’s Bot page gives one in three parts joined by dots.');
          let me: DiscordUser | null = null;
          let application: { id?: string; flags?: number } | null = null;
          try {
            me = await rest<DiscordUser>(token, 'GET', '/users/@me', undefined, { ms: 15_000 });
            application = await rest(token, 'GET', '/oauth2/applications/@me', undefined, { ms: 15_000 }).catch(() => null);
          } catch (e) {
            // Only a token Discord answered no to (401) is turned down; with no answer, a busy Discord or a block in front of
            // it (a 403 can be one) the token is kept and the connection takes over.
            if (e instanceof DiscordError && e.code === 401) throw new HttpError(400, `Discord did not take that token: ${e.message}`);
          }
          if (me) known(d, token, me, application);
          else {
            // Whose it is, and the rest, come when the connection gets through.
            saveSecret(d.db, { name: TOKEN_NAME, value: token, domains: ['discord.com'], note: 'A Discord bot (Settings → Chat apps → Discord)' });
            kvSet(d.db, 'discord.unchecked', '1');
            kvSet(d.db, 'discord.app', '');
            kvSet(d.db, 'discord.warn', '');
            botId = '';
          }
          restart();
          return 'connected';
        }
        if (b.token === null) {
          deleteSecret(d.db, TOKEN_NAME);
          kvSet(d.db, 'discord.bot', '');
          discordApp.unlinkAll(d);
          kvSet(d.db, 'discord.warn', '');
          botId = '';
          restart();
        }
      },
    });
  },
  start(d) {
    stopped = false;
    void supervise(d);
  },
  turnEnd: (t, d) => discordApp.turnEnd(t, d),
  event(e, d) {
    if (e.t === 'notify') discordApp.notice(d, e.n).catch((err) => console.warn(`[discord] notice: ${(err as Error).message}`));
  },
};

export const linkedChats = (d: Deps) => discordApp.linked(d.db);
export const notice = discordApp.notice;
