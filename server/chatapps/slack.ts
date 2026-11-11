// Slack (Settings → Chat apps → Slack): your agents in Slack, the way Telegram has them. An app of your own (made from
// the manifest Settings gives), its two tokens kept in the vault (SLACK_BOT_TOKEN, SLACK_APP_TOKEN); only the people you
// link with a one-time code may use it, in a direct message to the app or where it is mentioned in a channel. The app
// opens Socket Mode (a WebSocket Slack hands it the address of, for messages and button presses, each acknowledged) and
// uses Slack's Web API to send, so it needs no address on the internet.
import WebSocket from 'ws';
import { HttpError } from '../auth.ts';
import { deleteSecret, readSecret, saveSecret, vaultTables } from '../connections/vault.ts';
import { kvGet, kvSet } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { chatApp, MAX_PARTS, tuning, type Rows, type Wire } from './core.ts';
import { chunks, plainText, SLACK_CHARS, slackMrkdwn } from './format.ts';

export const BOT_TOKEN = 'SLACK_BOT_TOKEN';
export const APP_TOKEN = 'SLACK_APP_TOKEN';
const api = () => (process.env.SLACK_API ?? 'https://slack.com/api').replace(/\/+$/, '');
/** What the app's scopes must hold for all it does (the manifest in shared/chat-apps.ts asks for them). */
const SCOPES = ['app_mentions:read', 'chat:write', 'commands', 'im:history', 'reactions:write', 'users:read'];
/** Answers that no waiting will mend: the person must give other tokens. */
const FATAL = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive', 'not_allowed_token_type', 'missing_scope', 'no_permission']);

class SlackError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

// ---- Slack's Web API ------------------------------------------------------------------------------

async function web<T = any>(token: string, method: string, body: Record<string, unknown> = {}, o: { ms?: number; again?: boolean; onResponse?: (r: Response) => void } = {}): Promise<T> {
  const signal = AbortSignal.timeout(o.ms ?? 20_000);
  let r: Response;
  try {
    r = await fetch(`${api()}/${method}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body), signal });
  } catch (e) {
    throw new SlackError(signal.aborted ? 'Slack did not answer in time' : `Slack could not be reached (${(e as Error).message})`, 'unreachable');
  }
  o.onResponse?.(r);
  // Too many calls at once: Slack says how long to wait.
  const after = Number(r.headers.get('retry-after'));
  if (r.status === 429 && after && after <= 30 && !o.again) {
    await new Promise((resolve) => setTimeout(resolve, after * 1000));
    return web<T>(token, method, body, { ...o, again: true });
  }
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!j.ok) throw new SlackError(j.error ?? `Slack answered ${r.status}`, j.error ?? String(r.status));
  return j as T;
}

const botToken = (d: Deps) => readSecret(d.db, BOT_TOKEN)?.value ?? null;
const appToken = (d: Deps) => readSecret(d.db, APP_TOKEN)?.value ?? null;

// ---- how Slack shows what the app says ------------------------------------------------------------

/** Buttons as Slack's blocks: an actions block for each row. */
function actionBlocks(rows: Rows) {
  let n = 0;
  return rows
    .filter((r) => r.length)
    .slice(0, 20)
    .map((r) => ({
      type: 'actions',
      elements: r.slice(0, 25).map((b) => ({
        type: 'button',
        text: { type: 'plain_text', text: b.text.slice(0, 75), emoji: true },
        action_id: b.url ? `open-${n++}` : b.id,
        ...(b.url ? { url: b.url } : { value: b.id }),
        ...(b.style ? { style: b.style } : {}),
      })),
    }));
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function post(token: string, chat: string, o: { text: string; blocks?: unknown[]; plain?: boolean }) {
  await web(token, 'chat.postMessage', { channel: chat, text: o.text.slice(0, 3000), ...(o.blocks?.length ? { blocks: o.blocks } : {}), ...(o.plain ? { mrkdwn: false } : {}), unfurl_links: false, unfurl_media: false });
}

/** The message each chat last sent: the "working…" reaction goes on it. */
const lastTs = new Map<string, string>();
const reacting = new Map<string, { ts: string; token: string }>();
const WORKING = 'hourglass_flowing_sand';

function wireOf(d: Deps): Wire {
  const token = () => botToken(d) ?? '';
  return {
    async say(chat, text, rows = []) {
      const blocks = rows.some((r) => r.length) ? [{ type: 'section', text: { type: 'mrkdwn', text: esc(text).slice(0, 3000) } }, ...actionBlocks(rows)] : undefined;
      await post(token(), chat, { text, blocks, plain: !blocks });
    },
    async reply(chat, md, rows = []) {
      let parts = chunks(md, SLACK_CHARS);
      if (parts.length > MAX_PARTS) parts = [...parts.slice(0, MAX_PARTS - 1), `${parts[MAX_PARTS - 1]}\n\n_The rest of this reply is in the session in Hydor._`];
      for (let i = 0; i < parts.length; i++) {
        const last = i === parts.length - 1;
        const text = plainText(parts[i]);
        try {
          await post(token(), chat, { text: text.slice(0, 300), blocks: [{ type: 'section', text: { type: 'mrkdwn', text: slackMrkdwn(parts[i]).slice(0, 3000) } }, ...(last ? actionBlocks(rows) : [])] });
        } catch (e) {
          // What Slack will not take as blocks goes as plain text.
          if (!(e instanceof SlackError) || !/invalid_blocks|invalid_arguments/.test(e.code)) throw e;
          await post(token(), chat, { text, plain: true });
        }
      }
    },
    async notice(chat, n, rows) {
      const text = `*${esc(n.title)}*\n${esc(n.status)}${esc(n.detail)}`.slice(0, 3000);
      await post(token(), chat, { text: plainText(`${n.title}\n${n.status}`), blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }, ...actionBlocks(rows)] });
    },
    busy(chat, on) {
      const was = reacting.get(chat);
      if (!on) {
        if (was) {
          reacting.delete(chat);
          web(was.token, 'reactions.remove', { channel: chat, timestamp: was.ts, name: WORKING }).catch(() => {});
        }
        return;
      }
      const ts = lastTs.get(chat);
      if (!ts || was?.ts === ts) return;
      if (was) web(was.token, 'reactions.remove', { channel: chat, timestamp: was.ts, name: WORKING }).catch(() => {});
      reacting.set(chat, { ts, token: token() });
      web(token(), 'reactions.add', { channel: chat, timestamp: ts, name: WORKING }).catch(() => {});
    },
  };
}

// ---- Socket Mode ----------------------------------------------------------------------------------

interface SocketState {
  state: 'connecting' | 'running' | 'error';
  error?: string;
}

/**
 * One app's Socket Mode connection: Slack hands out the WebSocket's address (apps.connections.open), says hello, sends
 * each event, press and command in an envelope that must be acknowledged at once, and asks for a new connection now and
 * then (disconnect): which is made before anything else, and after any close that is not fatal.
 */
export class SocketMode {
  private ws: WebSocket | null = null;
  private done = false;
  private sleeping: (() => void) | null = null;
  private ready = false;
  private seen = new Set<string>();

  constructor(
    private o: {
      appToken: string;
      onState(s: SocketState): void;
      onEnvelope(type: string, payload: any): void;
    },
  ) {}

  stop() {
    this.done = true;
    try {
      this.ws?.close(1000);
    } catch {}
    this.sleeping?.();
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => ((this.sleeping = null), resolve()), ms);
      t.unref?.();
      this.sleeping = () => (clearTimeout(t), (this.sleeping = null), resolve());
    });
  }

  async run() {
    let wait = tuning.retryMs;
    // Why the last try failed, said in Settings while it goes on trying.
    let why: string | undefined;
    while (!this.done) {
      try {
        this.o.onState({ state: 'connecting', error: why });
        const { url } = await web<{ url: string }>(this.o.appToken, 'apps.connections.open');
        await this.connect(url);
      } catch (e) {
        if (this.done) break;
        if (e instanceof SlackError && FATAL.has(e.code)) {
          this.o.onState({ state: 'error', error: `Slack did not take the app-level token (${e.code}): make a new one with the connections:write scope.` });
          return;
        }
        // Not answering, rate limits and Slack's own faults pass: stay connecting and try again.
        why = (e as Error).message;
        this.o.onState({ state: 'connecting', error: why });
        await this.sleep(wait);
        wait = Math.min(wait * 2, tuning.maxRetryMs);
        continue;
      }
      if (this.done) break;
      why = this.ready ? undefined : 'Disconnected before hello';
      // A connection that got as far as hello starts the waits over; Slack asking for a new one needs no wait at all.
      wait = this.ready ? tuning.retryMs : Math.min(wait * 2, tuning.maxRetryMs);
      await this.sleep(this.ready ? Math.min(wait, 250) : wait);
    }
  }

  private connect(url: string): Promise<void> {
    this.ready = false;
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(url, { perMessageDeflate: false, handshakeTimeout: 15_000 }));
      ws.on('message', (raw) => {
        let m: { type?: string; envelope_id?: string; payload?: any; retry_attempt?: number };
        try {
          m = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (m.type === 'hello') {
          this.ready = true;
          this.o.onState({ state: 'running' });
        } else if (m.type === 'disconnect') {
          // Slack wants a new connection (it refreshes them now and then): leave this one.
          ws.close(1000);
        } else if (m.envelope_id) {
          // Acknowledged first, whatever is done with it: Slack sends it again when it is not.
          ws.send(JSON.stringify({ envelope_id: m.envelope_id }));
          const id = m.payload?.event_id ?? m.envelope_id;
          if (this.seen.has(id)) return;
          this.seen.add(id);
          if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
          this.o.onEnvelope(String(m.type), m.payload);
        }
      });
      ws.on('error', (e) => {
        if (ws.readyState !== WebSocket.OPEN) reject(e);
      });
      ws.on('close', () => resolve());
    });
  }
}

// ---- the app --------------------------------------------------------------------------------------

const slackApp = chatApp({
  id: 'slack',
  label: 'Slack',
  where: 'Settings → Chat apps → Slack',
  wire: wireOf,
  connected: (d) => !!botToken(d) && !!appToken(d),
});

let state: { state: 'off' | 'connecting' | 'running' | 'error'; error?: string; bot?: { id: string; username: string; team: string } } = { state: 'off' };
let botUser = '';
let stopped = false;
let current: SocketMode | null = null;
let wakeUp: (() => void) | null = null;
let events: Promise<unknown> = Promise.resolve();
let scopesMissing: string[] = [];

const names = new Map<string, string>();
/** A person's name, for the chat list. */
async function nameOf(d: Deps, user: string): Promise<string> {
  const known = names.get(user);
  if (known) return known;
  try {
    const u = await web<{ user: { real_name?: string; name?: string; profile?: { display_name?: string } } }>(botToken(d) ?? '', 'users.info', { user });
    const name = u.user.profile?.display_name || u.user.real_name || u.user.name || user;
    names.set(user, name);
    return name;
  } catch {
    return user;
  }
}

interface SlackEvent {
  type: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts?: string;
  subtype?: string;
  bot_id?: string;
}

/** A message the app was sent: in a direct message always, in a channel when it is mentioned. */
export async function handleEvent(d: Deps, e: SlackEvent) {
  if (!e.channel || !e.user || e.bot_id || e.subtype || e.user === botUser) return;
  const direct = e.type === 'message';
  if (direct && e.channel_type !== 'im') return;
  if (!direct && e.type !== 'app_mention') return;
  let text = String(e.text ?? '');
  if (!direct && botUser) text = text.replace(new RegExp(`<@${botUser}(\\|[^>]*)?>`, 'g'), '');
  // Slack escapes & < > in what people write.
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (e.ts) lastTs.set(e.channel, e.ts);
  const name = slackApp.isLinked(d.db, e.channel, e.user) ? '' : await nameOf(d, e.user);
  await slackApp.incoming(d, wireOf(d), { chat: e.channel, user: e.user, name, text, direct });
}

interface BlockActions {
  type?: string;
  user?: { id: string };
  channel?: { id: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts?: string; blocks?: any[] };
  actions?: { action_id: string; value?: string }[];
}

/** A press of one of the app's buttons. */
export async function handleAction(d: Deps, p: BlockActions) {
  const act = p.actions?.[0];
  const chat = p.container?.channel_id ?? p.channel?.id;
  const user = p.user?.id;
  if (p.type !== 'block_actions' || !act || !chat || !user || act.action_id.startsWith('open-')) return;
  const w = wireOf(d);
  const r = await slackApp.pressed(d, w, { chat, user, id: act.value ?? act.action_id });
  const token = botToken(d) ?? '';
  if (!r.ok) {
    await web(token, 'chat.postEphemeral', { channel: chat, user, text: r.text });
    return;
  }
  if (r.kind === 'switch') return w.say(chat, r.text);
  // The buttons give way to the one that was pressed.
  const ts = p.message?.ts ?? p.container?.message_ts;
  if (ts) {
    const blocks = [...(p.message?.blocks ?? []).filter((b) => b.type !== 'actions'), { type: 'context', elements: [{ type: 'mrkdwn', text: `✓ ${esc(r.label)}` }] }];
    await web(token, 'chat.update', { channel: chat, ts, text: `✓ ${r.label}`, blocks }).catch(() => {});
  }
}

interface SlashCommand {
  command?: string;
  text?: string;
  channel_id?: string;
  user_id?: string;
  response_url?: string;
}

/** /hydor and what comes after it: a command, or a message as if typed in the chat. */
export async function handleSlash(d: Deps, c: SlashCommand) {
  if (!c.channel_id || !c.user_id) return;
  const privately = (text: string) => c.response_url && fetch(c.response_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ response_type: 'ephemeral', text }), signal: AbortSignal.timeout(10_000) }).catch(() => {});
  if (!slackApp.isLinked(d.db, c.channel_id, c.user_id)) {
    await privately('This app is someone’s own Hydor. To use it, link this chat in Hydor: Settings → Chat apps → Slack → Link a chat.');
    return;
  }
  const words = String(c.text ?? '').trim();
  const sub = /^(new|sessions|stop|status|help)\b/i.exec(words);
  const text = words ? (sub ? `/${words}` : words) : '/help';
  try {
    await slackApp.incoming(d, wireOf(d), { chat: c.channel_id, user: c.user_id, name: '', text, direct: true });
  } catch (e) {
    if (e instanceof SlackError && /not_in_channel|channel_not_found/.test(e.code)) await privately('I cannot post here until I am in this channel: invite me with /invite.');
    else throw e;
  }
}

/** One envelope from Socket Mode. */
export async function envelope(d: Deps, type: string, payload: any) {
  if (type === 'events_api') return handleEvent(d, payload?.event ?? {});
  if (type === 'interactive') return handleAction(d, payload ?? {});
  if (type === 'slash_commands') return handleSlash(d, payload ?? {});
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

/** Who the bot token belongs to, and which scopes it lacks. */
async function whoAmI(token: string) {
  let scopes: string | null = null;
  const me = await web<{ user_id: string; user?: string; team?: string }>(token, 'auth.test', {}, { onResponse: (r) => (scopes = r.headers.get('x-oauth-scopes')) });
  const have = new Set(String(scopes ?? '').split(',').map((s) => s.trim()));
  return { me, missing: scopes === null ? [] : SCOPES.filter((s) => !have.has(s)) };
}

async function supervise(d: Deps) {
  let wait = tuning.retryMs;
  while (!stopped) {
    const bot = botToken(d);
    const app = appToken(d);
    if (!bot || !app) {
      state = { state: 'off' };
      await pause(10 * 60_000);
      continue;
    }
    try {
      const { me, missing } = await whoAmI(bot);
      botUser = me.user_id;
      scopesMissing = missing;
      state = { state: 'connecting', bot: { id: me.user_id, username: me.user ?? '', team: me.team ?? '' } };
      // Tokens saved without a check are known now.
      if (kvGet(d.db, 'slack.unchecked')) known(d, bot, app, me);
      wait = tuning.retryMs;
    } catch (e) {
      if (e instanceof SlackError && FATAL.has(e.code)) {
        state = { state: 'error', error: `Slack did not take the bot token: ${e.message}` };
        await pause(10 * 60_000);
      } else {
        // Not answering, rate limits and Slack's own faults pass: stay connecting and try again.
        state = { state: 'connecting', error: (e as Error).message };
        await pause(wait);
        wait = Math.min(wait * 2, tuning.maxRetryMs);
      }
      continue;
    }
    const sm = (current = new SocketMode({
      appToken: app,
      onState: (s) => {
        if (current === sm) state = { ...state, ...s, error: s.error };
      },
      // One at a time, in the order they came.
      onEnvelope: (type, payload) => {
        events = events.then(() => envelope(d, type, payload)).catch((e) => console.warn(`[slack] ${(e as Error).message}`));
      },
    }));
    await sm.run();
    if (stopped) break;
    if (current === sm && state.state === 'error') await pause(10 * 60_000);
  }
}

/** For a clean exit (tests). */
export function stopSlack() {
  stopped = true;
  restart();
  for (const chat of [...reacting.keys()]) reacting.delete(chat);
}

/** What the tokens tell once Slack has answered: whose app it is, kept with them. */
function known(d: Deps, bot: string, app: string, me: { user_id: string; user?: string; team?: string }) {
  kvSet(d.db, 'slack.unchecked', '');
  saveSecret(d.db, { name: BOT_TOKEN, value: bot, domains: ['slack.com'], note: `The Slack app ${me.user ?? ''} in ${me.team ?? 'a workspace'} (Settings → Chat apps → Slack)` });
  saveSecret(d.db, { name: APP_TOKEN, value: app, domains: ['slack.com'], note: 'The Slack app’s app-level token for Socket Mode (Settings → Chat apps → Slack)' });
  // Another app: the chats linked to the old one link again (new tokens for the same app change nothing).
  const before = kvGet(d.db, 'slack.bot');
  if (before && before !== me.user_id) slackApp.unlinkAll(d);
  kvSet(d.db, 'slack.bot', me.user_id);
}

function view(d: Deps) {
  return {
    ...slackApp.view(d),
    state: state.state,
    error: state.state === 'error' ? state.error : undefined,
    // Why the last try to connect failed, while it keeps trying.
    note: state.state === 'connecting' ? state.error : undefined,
    warning: scopesMissing.length ? `The app lacks scopes it needs (${scopesMissing.join(', ')}): add them under OAuth & Permissions, then reinstall the app.` : undefined,
    bot: state.bot ? { username: state.bot.username, name: state.bot.team } : undefined,
  };
}

export const slack: Feature = {
  id: 'slack',
  routes(d) {
    vaultTables(d.db);
    slackApp.routes(d, {
      view: () => view(d),
      async connect(b) {
        if (b.token === null) {
          deleteSecret(d.db, BOT_TOKEN);
          deleteSecret(d.db, APP_TOKEN);
          kvSet(d.db, 'slack.bot', '');
          slackApp.unlinkAll(d);
          restart();
          return;
        }
        if (typeof b.botToken !== 'string' && typeof b.appToken !== 'string') return;
        const bot = typeof b.botToken === 'string' ? b.botToken.trim() : botToken(d);
        const app = typeof b.appToken === 'string' ? b.appToken.trim() : appToken(d);
        if (!bot || !app) throw new HttpError(400, 'Slack needs both tokens: the Bot User OAuth Token (xoxb-…) and the App-Level Token (xapp-…).');
        if (!/^xoxb-[\w-]{10,}$/.test(bot)) throw new HttpError(400, 'That does not look like a Bot User OAuth Token: Install App in Slack’s settings gives one that starts with xoxb-.');
        if (!/^xapp-[\w-]{10,}$/.test(app)) throw new HttpError(400, 'That does not look like an App-Level Token: Basic Information → App-Level Tokens gives one that starts with xapp-.');
        // Only tokens Slack answered no to are turned down; with no answer (or a busy Slack) the connection takes over.
        let who: Awaited<ReturnType<typeof whoAmI>> | null = null;
        try {
          who = await whoAmI(bot);
        } catch (e) {
          if (e instanceof SlackError && FATAL.has(e.code)) throw new HttpError(400, `Slack did not take the bot token: ${e.message}`);
        }
        try {
          // Opening a connection is the way to see that the app-level token works (the address it gives is not used).
          await web(app, 'apps.connections.open', {}, { ms: 15_000 });
        } catch (e) {
          if (e instanceof SlackError && FATAL.has(e.code)) throw new HttpError(400, `Slack did not take the app-level token (it needs the connections:write scope): ${e.message}`);
          who = null;
        }
        if (who) {
          known(d, bot, app, who.me);
          botUser = who.me.user_id;
          scopesMissing = who.missing;
        } else {
          // Whose app it is comes when the connection gets through.
          saveSecret(d.db, { name: BOT_TOKEN, value: bot, domains: ['slack.com'], note: 'A Slack app (Settings → Chat apps → Slack)' });
          saveSecret(d.db, { name: APP_TOKEN, value: app, domains: ['slack.com'], note: 'The Slack app’s app-level token for Socket Mode (Settings → Chat apps → Slack)' });
          kvSet(d.db, 'slack.unchecked', '1');
        }
        restart();
        return 'connected';
      },
    });
  },
  start(d) {
    stopped = false;
    void supervise(d);
  },
  turnEnd: (t, d) => slackApp.turnEnd(t, d),
  event(e, d) {
    if (e.t === 'notify') slackApp.notice(d, e.n).catch((err) => console.warn(`[slack] notice: ${(err as Error).message}`));
  },
};

export const linkedChats = (d: Deps) => slackApp.linked(d.db);
export const notice = slackApp.notice;
