// Script tests for Discord and Slack (Settings → Chat apps): Markdown as Discord's and Slack's own, a chat linking with
// its code, a message starting a session or going on with one, the reply when the turn ends, buttons answering what an
// agent asks, commands, notices, the routes, and the connections themselves: Discord's Gateway (hello, identify,
// heartbeats that must be answered, resume, reconnect, invalid session, fatal closes) and Slack's Socket Mode (hello,
// every envelope acknowledged, disconnect, events sent twice); against stand-ins for Discord's Gateway and REST API
// and for Slack's Socket Mode and Web API, and for the session manager, all in this script.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/chatapps/chatapps-test.ts && DATA_DIR=/tmp/hydor-test-chatapps node dist/dev/chatapps-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import Fastify from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import { SLACK_MANIFEST, discordInvite } from '../../shared/chat-apps.ts';
import type { NotifyEvent, SessionSummary, TimelineItem } from '../../shared/types.ts';
import { readSecret } from '../connections/vault.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { MAX_PARTS, tuning } from './core.ts';
import { discord, INTENTS, linkedChats as discordChats, notice as discordNotice, stopDiscord, TOKEN_NAME as DISCORD_TOKEN } from './discord.ts';
import { chunks, discordMarkdown, slackMrkdwn } from './format.ts';
import { APP_TOKEN, BOT_TOKEN, linkedChats as slackChats, notice as slackNotice, slack, stopSlack } from './slack.ts';

const tmp = fs.mkdtempSync(path.join(process.env.DATA_DIR ?? '/tmp', 'chatapps-'));
const db = openDb(path.join(tmp, 'test.db'));
kvSet(db, 'assistants.taskRoot', path.join(tmp, 'tasks'));
tuning.retryMs = 30;
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, ok: () => boolean, ms = 4000) {
  for (let t = 0; t < ms && !ok(); t += 20) await sleep(20);
  assert.ok(ok(), `waited for ${what}`);
}
const readBody = (req: http.IncomingMessage) =>
  new Promise<any>((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
const json = (res: http.ServerResponse, status: number, o: unknown, headers: Record<string, string> = {}) => (res.writeHead(status, { 'content-type': 'application/json', ...headers }), res.end(JSON.stringify(o)));

// ---- a stand-in for the sessions ------------------------------------------------------------------
const did: { what: string; key?: string; text?: string; a?: unknown }[] = [];
const summaries = new Map<string, SessionSummary>();
const items = new Map<string, TimelineItem[]>();
let made = 0;
const sessions = {
  async create(o: { prompt?: string; cwd: string }) {
    const key = `claude:made-${++made}`;
    did.push({ what: 'create', key, text: o.prompt });
    assert.ok(o.cwd.startsWith(path.join(tmp, 'tasks')), 'a task folder of its own');
    summaries.set(key, { key, agent: 'claude', title: o.prompt ?? '', live: { status: 'working' } } as unknown as SessionSummary);
    return key;
  },
  summary: (key: string) => summaries.get(key) ?? null,
  async send(key: string, text: string) {
    did.push({ what: 'send', key, text });
  },
  enqueue(key: string, text: string) {
    did.push({ what: 'enqueue', key, text });
  },
  async interrupt(key: string) {
    did.push({ what: 'interrupt', key });
  },
  async answer(key: string, id: string, a: unknown) {
    did.push({ what: 'answer', key, text: id, a });
  },
  list: () => ({ sessions: [...summaries.values()], total: summaries.size }),
  timeline: async (key: string) => ({ parser: { items: items.get(key) ?? [] } }),
};
const app = Fastify();
const d = { app, db, sessions, scheduler: {}, models: {}, broadcast() {}, toSubscribers() {}, publicBase: () => 'https://hydor.example.com' } as unknown as Deps;
discord.routes!(d);
slack.routes!(d);
await app.ready();
const get = async (url: string) => (await app.inject({ method: 'GET', url })).json();
const put = (url: string, payload: unknown) => app.inject({ method: 'PUT', url, payload: payload as object });
const turn = (key: string) => ({ key, agent: 'claude' as const, status: 'idle' as const, startedAt: 0, endedAt: 1, external: false });

// ---- formats --------------------------------------------------------------------------------------

test('Markdown for Discord: tables in a code block, deep headings, rules; the rest as written', () => {
  const m = discordMarkdown('# Plan\n\n#### Deep\n\nSome **bold** and `code` with a [link](https://example.com).\n\n+ one\n- two\n\n---\n\n```ts\nconst x = 1 < 2;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.ok(m.startsWith('# Plan\n\n### Deep'), m);
  assert.ok(m.includes('**bold**') && m.includes('[link](https://example.com)') && m.includes('- one\n- two'), m);
  assert.ok(m.includes('──────') && m.includes('```ts\nconst x = 1 < 2;\n```'), m);
  assert.ok(m.includes('```\n| a | b |\n| 1 | 2 |\n```'), 'a table in a code block, without its line of dashes');
});

test('Markdown for Slack: one asterisk for bold, links as <url|text>, & < > escaped, code kept', () => {
  const m = slackMrkdwn('# Plan\n\nSome **bold**, *italic*, ~~gone~~ and `a < b` with a [link](https://example.com) & <!channel>.\n\n- one\n\n> quoted\n\n```ts\nif (a && b) {}\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.ok(m.startsWith('*Plan*'), m);
  assert.ok(m.includes('*bold*') && m.includes('_italic_') && m.includes('~gone~') && m.includes('`a &lt; b`'), m);
  assert.ok(m.includes('<https://example.com|link>') && m.includes('&amp; &lt;!channel&gt;'), 'a broadcast is only text');
  assert.ok(m.includes('• one') && m.includes('> quoted'), m);
  assert.ok(m.includes('```\nif (a &amp;&amp; b) {}\n```'), m);
  assert.ok(m.includes('```\n| a | b |\n| 1 | 2 |\n```'), m);
});

test('a long reply in parts that fit each platform, a code block never cut open', () => {
  const code = '```py\n' + Array.from({ length: 800 }, (_, i) => `print(${i})`).join('\n') + '\n```';
  for (const [max, fmt] of [
    [1900, discordMarkdown],
    [2500, slackMrkdwn],
  ] as const) {
    const parts = chunks(`${'word '.repeat(900)}\n\n${code}`, max).map(fmt);
    assert.ok(parts.length > 3);
    for (const p of parts) {
      assert.ok(p.length <= max + 20, `part of ${p.length}`);
      assert.equal((p.match(/^```/gm) ?? []).length % 2, 0, 'each part’s code fenced whole');
    }
  }
});

// ---- a stand-in for Discord -----------------------------------------------------------------------
const DTOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.GabCdE.fakeTokenFakeTokenFakeTokenFake12';
const dcSent: { channel: string; body: any }[] = [];
const dcTyping: string[] = [];
const dcCalls: { id: string; body: any }[] = [];
const dcCommands: any[] = [];
const gwLog: { conn: number; op: number; d: any }[] = [];
const gw = { conns: [] as WebSocket[], seq: 0, ack: true, beatMs: 100, count: 0, gatewayCalls: 0 };
let dcSlow = 0;
const dc = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const url = req.url ?? '';
  if (url.startsWith('/interactions/')) {
    dcCalls.push({ id: url.split('/')[2], body });
    return (res.writeHead(204), res.end());
  }
  if (req.headers.authorization !== `Bot ${DTOKEN}`) return json(res, 401, { message: '401: Unauthorized', code: 0 });
  if (req.method === 'GET' && url === '/gateway/bot') return (gw.gatewayCalls++, json(res, 200, { url: `ws://127.0.0.1:${(dc.address() as { port: number }).port}` }));
  if (req.method === 'GET' && url === '/users/@me') return json(res, 200, { id: '900', username: 'hydor-bot' });
  if (req.method === 'GET' && url === '/oauth2/applications/@me') return json(res, 200, { id: '901', flags: dcFlags });
  if (req.method === 'PUT' && url.startsWith('/applications/')) return (dcCommands.push(...body), json(res, 200, body));
  const typing = /^\/channels\/([^/]+)\/typing$/.exec(url);
  if (typing) return (dcTyping.push(typing[1]), (res.writeHead(204), res.end()));
  const msg = /^\/channels\/([^/]+)\/messages$/.exec(url);
  if (msg) {
    if (String(body.content).includes('REFUSE') && String(body.content).includes('**')) return json(res, 400, { message: 'Invalid Form Body', code: 50035 });
    if (String(body.content).includes('SLOWDOWN') && !dcSlow++) return json(res, 429, { message: 'You are being rate limited.', retry_after: 0.4 });
    dcSent.push({ channel: msg[1], body });
    return json(res, 200, { id: `msg${dcSent.length}` });
  }
  json(res, 404, { message: 'Unknown' });
});
let dcFlags = 1 << 18;
const dcWss = new WebSocketServer({ server: dc });
const gwPush = (t: string, data: unknown) => gw.conns.at(-1)!.send(JSON.stringify({ op: 0, t, s: ++gw.seq, d: data }));
dcWss.on('connection', (ws) => {
  gw.conns.push(ws);
  const conn = ++gw.count;
  ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: gw.beatMs } }));
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    gwLog.push({ conn, op: m.op, d: m.d });
    if (m.op === 2) ws.send(JSON.stringify({ op: 0, t: 'READY', s: ++gw.seq, d: { session_id: 'sess1', resume_gateway_url: `ws://127.0.0.1:${(dc.address() as { port: number }).port}`, user: { id: '900', username: 'hydor-bot' }, application: { id: '901' } } }));
    if (m.op === 6) ws.send(m.d.session_id === 'sess1' ? JSON.stringify({ op: 0, t: 'RESUMED', s: ++gw.seq, d: {} }) : JSON.stringify({ op: 9, d: false }));
    if (m.op === 1 && gw.ack) ws.send(JSON.stringify({ op: 11 }));
  });
});
await new Promise<void>((r) => dc.listen(0, '127.0.0.1', r));
process.env.DISCORD_API = `http://127.0.0.1:${(dc.address() as { port: number }).port}`;

const DCHAT = 'D100';
const dcUser: { id: string; username: string; global_name?: string; bot?: boolean } = { id: 'U1', username: 'ada', global_name: 'Ada L' };
const dcMsg = (content: string, o: Partial<{ channel: string; guild: string; author: any; mentions: any[]; type: number }> = {}) =>
  gwPush('MESSAGE_CREATE', { id: `m${++gw.seq}`, channel_id: o.channel ?? DCHAT, guild_id: o.guild, author: o.author ?? dcUser, content, mentions: o.mentions ?? [], type: o.type ?? 0 });
const lastDc = () => dcSent[dcSent.length - 1];
const dcTexts = () => dcSent.map((s) => String(s.body.content));
const dcPress = (customId: string, user = dcUser, channel = DCHAT) => gwPush('INTERACTION_CREATE', { id: `i${++gw.seq}`, token: 'itok', type: 3, channel_id: channel, user, data: { custom_id: customId } });
const dcSlash = (name: string, prompt?: string, user = dcUser, channel = DCHAT) =>
  gwPush('INTERACTION_CREATE', { id: `i${++gw.seq}`, token: 'itok', type: 2, channel_id: channel, user, data: { name, options: prompt ? [{ name: 'prompt', value: prompt }] : [] } });

test('Discord: a token is checked with Discord, kept in the vault, and the invitation names the permissions', async () => {
  assert.equal((await put('/api/discord', { token: 'nope' })).statusCode, 400, 'not a token');
  const wrong = await put('/api/discord', { token: DTOKEN.replace('GabCdE', 'XXXXXX') });
  assert.equal(wrong.statusCode, 400);
  assert.match(wrong.json().message, /Discord did not take that token/);
  assert.equal((await app.inject({ method: 'POST', url: '/api/discord/pair' })).statusCode, 400, 'no bot yet');
  dcFlags = 0;
  const off = await put('/api/discord', { token: DTOKEN });
  assert.equal(off.statusCode, 200, off.body);
  assert.match(off.json().warning, /Message Content Intent is off/);
  dcFlags = 1 << 18;
  const ok = (await put('/api/discord', { token: DTOKEN })).json();
  assert.equal(ok.connected, true);
  assert.equal(ok.warning, undefined);
  assert.equal(readSecret(db, DISCORD_TOKEN)?.value, DTOKEN);
  assert.equal(ok.invite, discordInvite('901'));
  assert.ok(ok.invite.includes('permissions=68608'), 'View Channels, Send Messages, Read Message History');
});

test('Discord Gateway: hello, then identify with the intents for servers, direct messages and message content; slash commands made known', async () => {
  discord.start!(d);
  await until('the bot to be ready', () => gwLog.some((l) => l.op === 2));
  const id = gwLog.find((l) => l.op === 2)!.d;
  assert.equal(id.token, DTOKEN);
  assert.equal(id.intents, INTENTS);
  assert.equal(INTENTS, (1 << 9) | (1 << 12) | (1 << 15), 'guild messages, direct messages, message content');
  await until('commands', () => dcCommands.length === 5);
  assert.deepEqual(
    dcCommands.map((c) => c.name),
    ['new', 'sessions', 'stop', 'status', 'help'],
  );
  await sleep(100);
  const v = await get('/api/discord');
  assert.equal(v.state, 'running');
  assert.equal(v.bot.username, 'hydor-bot');
});

test('Discord Gateway: heartbeats carry the last sequence number; a heartbeat nobody answered ends in a resume with it', async () => {
  await until('heartbeats', () => gwLog.some((l) => l.op === 1));
  const seqNow = gw.seq;
  assert.ok(gwLog.filter((l) => l.op === 1).every((l) => l.d === null || typeof l.d === 'number'));
  gw.ack = false;
  await until('a resume', () => gwLog.some((l) => l.op === 6));
  const r = gwLog.find((l) => l.op === 6)!;
  assert.equal(r.d.session_id, 'sess1');
  assert.equal(r.d.token, DTOKEN);
  assert.ok(r.d.seq >= seqNow, 'from where it stopped');
  gw.ack = true;
  await until('running again', () => gwLog.some((l) => l.op === 6 && l.conn > 1));
});

test('Discord Gateway: Reconnect (7) resumes; Invalid Session (9, not resumable) identifies again', async () => {
  const resumes = () => gwLog.filter((l) => l.op === 6).length;
  const identifies = () => gwLog.filter((l) => l.op === 2).length;
  await sleep(100);
  const r0 = resumes();
  gw.conns.at(-1)!.send(JSON.stringify({ op: 7, d: null }));
  await until('a resume after Reconnect', () => resumes() > r0);
  await sleep(100);
  const i0 = identifies();
  gw.conns.at(-1)!.send(JSON.stringify({ op: 9, d: false }));
  await until('a new identify after Invalid Session', () => identifies() > i0);
  await sleep(100);
  // The session is new: a break now resumes it with the new one.
  const r1 = resumes();
  gw.conns.at(-1)!.terminate();
  await until('a resume after a break', () => resumes() > r1);
});

test('Discord: only a chat linked with its code is heard; the bot says once whose it is', async () => {
  await sleep(150);
  dcMsg('hello');
  await until('a word', () => dcSent.length === 1);
  assert.match(lastDc().body.content, /someone’s own Hydor.*Settings → Chat apps → Discord → Link a chat/);
  assert.deepEqual(lastDc().body.allowed_mentions, { parse: [] }, 'nobody is pinged');
  dcMsg('hello again');
  await sleep(150);
  assert.equal(dcSent.length, 1, 'told once');
  const pair = (await app.inject({ method: 'POST', url: '/api/discord/pair' })).json();
  assert.match(pair.pairing.code, /^[A-Z2-9]{8}$/);
  dcMsg('WRONG123');
  await sleep(100);
  assert.equal(discordChats(d).length, 0);
  dcMsg(pair.pairing.code.toLowerCase());
  await until('linked', () => discordChats(d).length === 1);
  assert.deepEqual(
    discordChats(d).map((c) => [c.id, c.user, c.name, c.kind]),
    [[DCHAT, 'U1', 'Ada L', 'dm']],
  );
  await until('a welcome', () => /^Linked to Hydor/.test(String(lastDc().body.content)));
  assert.equal((await get('/api/discord')).pairing, undefined, 'a code links once');
});

test('Discord: a message starts a session in a task folder, with typing while it works; the reply comes when the turn ends', async () => {
  dcMsg('Plan a weekend in Rome');
  await until('the session', () => did.some((x) => x.what === 'create'));
  assert.deepEqual(did.at(-1), { what: 'create', key: 'claude:made-1', text: 'Plan a weekend in Rome' });
  await until('typing', () => dcTyping.includes(DCHAT));
  await until('On it', () => dcTexts().some((t) => t.startsWith('On it')));
  const onIt = dcSent.find((s) => String(s.body.content).startsWith('On it'))!.body;
  assert.deepEqual(onIt.components[0].components[0], { type: 2, style: 5, label: 'Open in Hydor', url: 'https://hydor.example.com/s/claude%3Amade-1' });
  items.set('claude:made-1', [
    { kind: 'user', id: 'u1', text: 'Plan a weekend in Rome' } as TimelineItem,
    { kind: 'assistant', id: 'a1', text: '## Saturday\n\n- **Colosseum** at 9\n\n#### Detail\n\n| a | b |\n|---|---|\n| 1 | 2 |' } as TimelineItem,
  ]);
  await discord.turnEnd!(turn('claude:made-1'), d);
  const r = lastDc().body;
  assert.equal(r.content, '## Saturday\n\n- **Colosseum** at 9\n\n### Detail\n\n```\n| a | b |\n| 1 | 2 |\n```');
  assert.equal(r.flags, 4, 'links stay lines of text');
  assert.equal(r.components[0].components[0].label, 'Open in Hydor');
  // Typing stops with the turn.
  const n = dcTyping.length;
  await sleep(300);
  assert.equal(dcTyping.length, n);
});

test('Discord: the next message goes on with the session, or waits in its queue while it works', async () => {
  dcMsg('Add a museum');
  await until('queued', () => did.at(-1)?.what === 'enqueue');
  assert.deepEqual(did.at(-1), { what: 'enqueue', key: 'claude:made-1', text: 'Add a museum' });
  summaries.get('claude:made-1')!.live = { status: 'idle' } as never;
  dcMsg('And a restaurant');
  await until('sent', () => did.at(-1)?.what === 'send');
  assert.deepEqual(did.at(-1), { what: 'send', key: 'claude:made-1', text: 'And a restaurant' });
});

test('Discord: in a server only the person who linked it is heard, and only when the bot is mentioned', async () => {
  const guild = { guild: 'G1', channel: 'C500' };
  const me = [{ id: '900' }];
  const before = dcSent.length;
  dcMsg('chatter nobody asked about', guild);
  dcMsg('<@900> hi', { ...guild, mentions: me });
  await until('told whose bot it is', () => dcSent.length > before);
  assert.match(lastDc().body.content, /someone’s own Hydor/);
  assert.equal(lastDc().channel, 'C500');
  assert.equal(dcSent.length, before + 1, 'the chatter got no answer');
  const code = (await app.inject({ method: 'POST', url: '/api/discord/pair' })).json().pairing.code;
  dcMsg(`<@900> ${code}`, { ...guild, mentions: me });
  await until('linked in the channel', () => discordChats(d).some((c) => c.id === 'C500'));
  assert.equal(discordChats(d).find((c) => c.id === 'C500')!.kind, 'channel');
  // Another person in that channel is a stranger.
  const n = dcSent.length;
  dcMsg('<@900> let me in', { ...guild, mentions: me, author: { id: 'U2', username: 'eve' } });
  await until('told', () => dcSent.length > n);
  assert.match(lastDc().body.content, /someone’s own Hydor/);
  assert.equal(did.filter((x) => x.what === 'create').length, 1, 'no session for a stranger');
  // The linked person, mentioning the bot: a session, without the mention in what it is told.
  dcMsg('<@900> Fix the login page', { ...guild, mentions: me });
  await until('a session', () => did.filter((x) => x.what === 'create').length === 2);
  assert.deepEqual(did.at(-1), { what: 'create', key: 'claude:made-2', text: 'Fix the login page' });
  // The bot's own words, and other bots', are not heard.
  const c = did.length;
  dcMsg('<@900> noise', { ...guild, mentions: me, author: { id: 'B1', username: 'bot', bot: true } });
  await sleep(100);
  assert.equal(did.length, c);
});

test('Discord: what an agent asks comes with buttons; a press answers it once and shows what was pressed', async () => {
  const n: NotifyEvent = {
    key: 'claude:made-1',
    kind: 'waiting',
    title: 'Plan a weekend in Rome',
    body: 'Needs your approval',
    agent: 'claude',
    at: Date.now(),
    approval: { id: 'ap1', title: 'Run a command', detail: 'rm -rf build', approve: { id: 'allow', label: 'Allow' }, deny: { id: 'deny', label: 'Deny' } },
  };
  await discordNotice(d, n);
  const m = lastDc();
  assert.equal(m.channel, DCHAT);
  assert.equal(m.body.content, '**Plan a weekend in Rome**\nNeeds your approval\nrm -rf build');
  const [allow, deny] = m.body.components[0].components;
  assert.deepEqual([allow.label, deny.label, allow.style, deny.style], ['Allow', 'Deny', 1, 2]);
  assert.ok(allow.custom_id.length <= 100);
  dcPress(allow.custom_id);
  await until('answered', () => did.at(-1)?.what === 'answer');
  assert.deepEqual(did.at(-1), { what: 'answer', key: 'claude:made-1', text: 'ap1', a: { decision: 'allow' } });
  await until('the press answered', () => dcCalls.length > 0);
  const c = dcCalls.at(-1)!.body;
  assert.equal(c.type, 7, 'the message is updated');
  assert.deepEqual([c.data.components[0].components[0].label, c.data.components[0].components[0].disabled], ['✓ Allow', true]);
  const answers = did.length;
  dcPress(allow.custom_id);
  await until('told', () => dcCalls.length > 1);
  assert.equal(did.length, answers, 'once');
  assert.deepEqual([dcCalls.at(-1)!.body.type, dcCalls.at(-1)!.body.data.flags], [4, 64], 'only the person who pressed sees it');
  // Not a linked person: no answer.
  dcPress(deny.custom_id, { id: 'U2', username: 'eve' });
  await until('refused', () => dcCalls.length > 2);
  assert.match(dcCalls.at(-1)!.body.data.content, /not linked/);
  assert.equal(did.length, answers);
  // Another session's notices come only with Notify on.
  await put('/api/discord', { notify: false });
  const before = dcSent.length;
  await discordNotice(d, { ...n, key: 'codex:other', kind: 'done', body: 'All set', approval: undefined });
  assert.equal(dcSent.length, before);
  await put('/api/discord', { notify: true });
  await discordNotice(d, { ...n, key: 'codex:other', kind: 'done', body: 'All set', approval: undefined });
  assert.match(lastDc().body.content, /Finished\nAll set/);
  const own = dcSent.length;
  await discordNotice(d, { ...n, kind: 'done', body: 'Done', approval: undefined });
  assert.equal(dcSent.length, own, 'its own session’s “Finished” is the reply the turn sends');
});

test('Discord: slash commands answer in the channel: /sessions to go on with another, /status, /stop, /new', async () => {
  summaries.set('codex:other', { key: 'codex:other', agent: 'codex', title: 'Review the pull request', live: { status: 'working' } } as unknown as SessionSummary);
  const calls = dcCalls.length;
  dcSlash('sessions');
  await until('the list', () => dcCalls.length > calls);
  const list = dcCalls.at(-1)!.body;
  assert.equal(list.type, 4);
  assert.equal(list.data.content, 'Go on with:');
  const rows = list.data.components as { components: { label: string; custom_id: string }[] }[];
  assert.ok(rows.length <= 5, 'Discord takes five rows');
  const other = rows.find((r) => r.components[0].label.includes('Review the pull request'))!.components[0];
  dcPress(other.custom_id);
  await until('moved', () => dcTexts().some((t) => /“Review the pull request” now/.test(t)));
  assert.equal(dcCalls.at(-1)!.body.type, 6, 'the press is acknowledged without a change');
  const c1 = dcCalls.length;
  dcSlash('status');
  await until('status', () => dcCalls.length > c1);
  assert.match(dcCalls.at(-1)!.body.data.content, /^Review the pull request: working\./);
  dcSlash('stop');
  await until('stopped', () => did.at(-1)?.what === 'interrupt');
  assert.deepEqual(did.at(-1), { what: 'interrupt', key: 'codex:other' });
  dcSlash('new', 'Write a haiku');
  await until('a new session', () => did.at(-1)?.what === 'create' && did.at(-1)?.text === 'Write a haiku');
  assert.equal(did.at(-1)!.key, 'claude:made-3');
  // A person not linked in this channel is told so, for themselves.
  const c2 = dcCalls.length;
  dcSlash('new', 'nope', { id: 'U9', username: 'eve' });
  await until('told', () => dcCalls.length > c2);
  assert.deepEqual([dcCalls.at(-1)!.body.type, dcCalls.at(-1)!.body.data.flags], [4, 64]);
  assert.equal(did.filter((x) => x.what === 'create').length, 3);
  // The same commands, typed in the chat.
  dcMsg('!status');
  await until('status as a message', () => dcTexts().some((t) => /^Write a haiku: working\./.test(t)));
});

test('Discord: what Discord refuses goes as plain text; “too many at once” is waited out; ten messages at most', async () => {
  const end = () => discord.turnEnd!(turn('claude:made-3'), d);
  items.set('claude:made-3', [{ kind: 'user', id: 'u2', text: 'x' } as TimelineItem, { kind: 'assistant', id: 'a2', text: 'REFUSE **this** please' } as TimelineItem]);
  await end();
  assert.equal(lastDc().body.content, 'REFUSE this please');
  items.set('claude:made-3', [{ kind: 'user', id: 'u3', text: 'x' } as TimelineItem, { kind: 'assistant', id: 'a3', text: 'SLOWDOWN then fine' } as TimelineItem]);
  const t0 = Date.now();
  await end();
  assert.ok(Date.now() - t0 >= 380, 'waited as Discord said');
  assert.equal(lastDc().body.content, 'SLOWDOWN then fine');
  const long = Array.from({ length: 15 }, (_, i) => `${i} ${'word '.repeat(500).trim()}`).join('\n\n');
  items.set('claude:made-3', [{ kind: 'user', id: 'u4', text: 'x' } as TimelineItem, { kind: 'assistant', id: 'a4', text: long } as TimelineItem]);
  const n = dcSent.length;
  await end();
  const parts = dcSent.slice(n);
  assert.equal(parts.length, MAX_PARTS);
  for (const p of parts) assert.ok(String(p.body.content).length <= 2000, `a message of ${p.body.content.length}`);
  assert.match(String(parts.at(-1)!.body.content), /The rest of this reply is in the session in Hydor/);
  dcMsg('', {});
  await until('words asked for', () => /^Send words/.test(String(lastDc().body.content)));
});

test('Discord Gateway: a fatal close (disallowed intents) is said in Settings and not tried again; a new token starts it again', async () => {
  const conns = gw.count;
  gw.conns.at(-1)!.close(4014);
  await sleep(300);
  const v = await get('/api/discord');
  assert.equal(v.state, 'error');
  assert.match(v.error, /Message Content Intent/);
  await sleep(300);
  assert.equal(gw.count, conns, 'not tried again');
  assert.equal((await put('/api/discord', { token: DTOKEN })).statusCode, 200);
  await until('connected again', () => gw.count > conns);
  await until('running', () => gwLog.filter((l) => l.op === 2).length >= 2);
  await sleep(150);
  assert.equal((await get('/api/discord')).state, 'running');
});

test('Discord: unlinking a chat, and removing the bot', async () => {
  await app.inject({ method: 'DELETE', url: '/api/discord/chats/C500' });
  assert.deepEqual(
    discordChats(d).map((c) => c.id),
    [DCHAT],
  );
  const off = await put('/api/discord', { token: null });
  assert.equal(off.json().connected, false);
  assert.equal(discordChats(d).length, 0, 'every chat unlinked');
  assert.equal(readSecret(db, DISCORD_TOKEN), null);
});

// ---- a stand-in for Slack -------------------------------------------------------------------------
const BOT = 'xoxb-1111111111-2222222222-fakefakefakefake';
const APP = 'xapp-1-A111-3333333333-fakefakefakefake';
const slSent: { method: string; body: any }[] = [];
const slResponses: any[] = [];
const sl = { count: 0, opens: 0, scopes: 'app_mentions:read,chat:write,commands,im:history,reactions:write,users:read', slow: 0 };
let sockets: WebSocket[] = [];
const acks: any[] = [];
const slServer = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const method = (req.url ?? '').replace(/^\//, '');
  if (method === 'response') return (slResponses.push(body), json(res, 200, {}));
  const auth = req.headers.authorization;
  if (method === 'apps.connections.open') {
    if (auth !== `Bearer ${APP}`) return json(res, 200, { ok: false, error: 'invalid_auth' });
    sl.opens++;
    return json(res, 200, { ok: true, url: `ws://127.0.0.1:${(slServer.address() as { port: number }).port}/link` });
  }
  if (auth !== `Bearer ${BOT}`) return json(res, 200, { ok: false, error: 'invalid_auth' });
  if (method === 'auth.test') return json(res, 200, { ok: true, user_id: 'UBOT', user: 'hydor', team: 'Test Team' }, { 'x-oauth-scopes': sl.scopes });
  if (method === 'users.info') return json(res, 200, { ok: true, user: { id: body.user, name: 'ada', real_name: 'Ada Lovelace', profile: { display_name: '' } } });
  if (method === 'chat.postMessage') {
    if (body.blocks && String(body.text).includes('REFUSE')) return json(res, 200, { ok: false, error: 'invalid_blocks' });
    if (String(body.text).includes('SLOWDOWN') && !sl.slow++) return json(res, 429, { ok: false, error: 'ratelimited' }, { 'retry-after': '1' });
  }
  slSent.push({ method, body });
  json(res, 200, { ok: true, ts: `${slSent.length}.0001` });
});
const slWss = new WebSocketServer({ server: slServer });
slWss.on('connection', (ws) => {
  sockets.push(ws);
  sl.count++;
  ws.send(JSON.stringify({ type: 'hello', num_connections: 1, connection_info: { app_id: 'A111' } }));
  ws.on('message', (raw) => acks.push(JSON.parse(String(raw))));
});
await new Promise<void>((r) => slServer.listen(0, '127.0.0.1', r));
const slPort = (slServer.address() as { port: number }).port;
process.env.SLACK_API = `http://127.0.0.1:${slPort}`;

let env = 0;
const send = (type: string, payload: unknown) => {
  const envelope_id = `env${++env}`;
  sockets.at(-1)!.send(JSON.stringify({ envelope_id, type, payload, accepts_response_payload: false }));
  return envelope_id;
};
const slEvent = (event: object, id = `Ev${++env}`) => send('events_api', { type: 'event_callback', event_id: id, event });
const SDM = 'D200';
const slDm = (text: string, o: object = {}) => slEvent({ type: 'message', channel_type: 'im', channel: SDM, user: 'U1', text, ts: `17000.${++env}`, ...o });
const slMention = (text: string, channel = 'C900', user = 'U1') => slEvent({ type: 'app_mention', channel, user, text: `<@UBOT> ${text}`, ts: `17001.${++env}` });
const posts = () => slSent.filter((s) => s.method === 'chat.postMessage').map((s) => s.body);
const lastPost = () => posts().at(-1)!;
const slAction = (id: string, o: object = {}) =>
  send('interactive', { type: 'block_actions', user: { id: 'U1' }, container: { channel_id: SDM, message_ts: '9.1' }, message: { ts: '9.1', blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'x' } }, { type: 'actions', elements: [] }] }, actions: [{ action_id: id, value: id }], ...o });
const slSlash = (text: string, o: object = {}) => send('slash_commands', { command: '/hydor', text, channel_id: SDM, user_id: 'U1', response_url: `http://127.0.0.1:${slPort}/response`, ...o });

test('(the sessions start over for Slack)', () => {
  did.length = 0;
  made = 0;
  summaries.clear();
  items.clear();
});

test('Slack: both tokens are checked with Slack and kept in the vault; the manifest asks for Socket Mode and the scopes', async () => {
  assert.equal((await put('/api/slack', { botToken: BOT })).statusCode, 400, 'both tokens are needed');
  assert.equal((await put('/api/slack', { botToken: 'nope', appToken: 'nope' })).statusCode, 400, 'not tokens');
  const wrong = await put('/api/slack', { botToken: BOT.replace('fake', 'oops'), appToken: APP });
  assert.equal(wrong.statusCode, 400);
  assert.match(wrong.json().message, /Slack did not take the bot token/);
  const wrongApp = await put('/api/slack', { botToken: BOT, appToken: APP.replace('fake', 'oops') });
  assert.match(wrongApp.json().message, /app-level token/);
  assert.equal((await app.inject({ method: 'POST', url: '/api/slack/pair' })).statusCode, 400, 'no app yet');
  sl.scopes = 'chat:write,im:history';
  const some = (await put('/api/slack', { botToken: BOT, appToken: APP })).json();
  assert.match(some.warning, /lacks scopes it needs \(app_mentions:read, commands, reactions:write, users:read\)/);
  sl.scopes = 'app_mentions:read,chat:write,commands,im:history,reactions:write,users:read';
  const ok = (await put('/api/slack', { botToken: BOT, appToken: APP })).json();
  assert.equal(ok.connected, true);
  assert.equal(ok.warning, undefined);
  assert.equal(readSecret(db, BOT_TOKEN)?.value, BOT);
  assert.equal(readSecret(db, APP_TOKEN)?.value, APP);
  assert.equal(SLACK_MANIFEST.settings.socket_mode_enabled, true);
  assert.deepEqual(SLACK_MANIFEST.settings.event_subscriptions.bot_events, ['app_mention', 'message.im']);
  assert.ok(SLACK_MANIFEST.oauth_config.scopes.bot.includes('chat:write') && SLACK_MANIFEST.oauth_config.scopes.bot.includes('im:history'));
});

test('Slack Socket Mode: the app-level token opens a connection; hello makes it ready; every envelope is acknowledged, an event sent twice handled once', async () => {
  slack.start!(d);
  await until('a connection', () => sl.count >= 1);
  await sleep(100);
  const v = await get('/api/slack');
  assert.equal(v.state, 'running');
  assert.deepEqual(v.bot, { username: 'hydor', name: 'Test Team' });
  const id = slDm('hello');
  await until('the ack', () => acks.some((a) => a.envelope_id === id));
  await until('a word', () => posts().length === 1);
  assert.match(lastPost().text, /someone’s own Hydor.*Settings → Chat apps → Slack → Link a chat/);
  assert.equal(lastPost().mrkdwn, false, 'what the app says is not read as Markup');
  slEvent({ type: 'message', channel_type: 'im', channel: SDM, user: 'U1', text: 'hello', ts: '1.1' }, 'EvSame');
  slEvent({ type: 'message', channel_type: 'im', channel: SDM, user: 'U1', text: 'hello', ts: '1.1' }, 'EvSame');
  await sleep(200);
  assert.equal(
    acks.filter((a) => Object.keys(a).join() === 'envelope_id').length,
    acks.length,
    'an ack is the envelope’s id',
  );
  assert.equal(posts().length, 1, 'told once (and the twin of an event is not handled again)');
});

test('Slack: only a chat linked with its code is heard', async () => {
  const pair = (await app.inject({ method: 'POST', url: '/api/slack/pair' })).json();
  assert.match(pair.pairing.code, /^[A-Z2-9]{8}$/);
  slDm('WRONG123');
  await sleep(100);
  assert.equal(slackChats(d).length, 0);
  slDm(`/start ${pair.pairing.code}`);
  await until('linked', () => slackChats(d).length === 1);
  assert.deepEqual(
    slackChats(d).map((c) => [c.id, c.user, c.name, c.kind]),
    [[SDM, 'U1', 'Ada Lovelace', 'dm']],
  );
  await until('a welcome', () => /^Linked to Hydor/.test(lastPost().text));
  assert.equal((await get('/api/slack')).pairing, undefined, 'a code links once');
});

test('Slack: a message starts a session in a task folder, marked while it works; the reply comes in mrkdwn blocks when the turn ends', async () => {
  slDm('Plan a weekend in Rome', { ts: '100.1' });
  await until('the session', () => did.some((x) => x.what === 'create'));
  assert.deepEqual(did.at(-1), { what: 'create', key: 'claude:made-1', text: 'Plan a weekend in Rome' });
  await until('the mark', () => slSent.some((s) => s.method === 'reactions.add'));
  assert.deepEqual(slSent.find((s) => s.method === 'reactions.add')!.body, { channel: SDM, timestamp: '100.1', name: 'hourglass_flowing_sand' });
  await until('On it', () => /^On it/.test(lastPost()?.text ?? ''));
  const button = lastPost().blocks[1].elements[0];
  assert.equal(button.url, 'https://hydor.example.com/s/claude%3Amade-1');
  assert.equal(button.text.text, 'Open in Hydor');
  items.set('claude:made-1', [
    { kind: 'user', id: 'u1', text: 'Plan a weekend in Rome' } as TimelineItem,
    { kind: 'assistant', id: 'a1', text: '## Saturday\n\n- **Colosseum** at 9 & [map](https://example.com)' } as TimelineItem,
  ]);
  await slack.turnEnd!(turn('claude:made-1'), d);
  const r = lastPost();
  assert.equal(r.blocks[0].text.type, 'mrkdwn');
  assert.equal(r.blocks[0].text.text, '*Saturday*\n\n• *Colosseum* at 9 &amp; <https://example.com|map>');
  assert.match(r.text, /^Saturday/, 'the words of a notification');
  assert.equal(r.blocks[1].elements[0].text.text, 'Open in Hydor');
  await until('the mark taken off', () => slSent.some((s) => s.method === 'reactions.remove'));
  assert.equal(slSent.find((s) => s.method === 'reactions.remove')!.body.timestamp, '100.1');
});

test('Slack: the next message goes on with the session, or waits in its queue while it works', async () => {
  slDm('Add a museum');
  await until('queued', () => did.at(-1)?.what === 'enqueue');
  assert.deepEqual(did.at(-1), { what: 'enqueue', key: 'claude:made-1', text: 'Add a museum' });
  summaries.get('claude:made-1')!.live = { status: 'idle' } as never;
  slDm('And a restaurant');
  await until('sent', () => did.at(-1)?.what === 'send');
  assert.deepEqual(did.at(-1), { what: 'send', key: 'claude:made-1', text: 'And a restaurant' });
  const n = did.length;
  slDm('bot talking', { bot_id: 'B1' });
  slDm('an edit', { subtype: 'message_changed' });
  slEvent({ type: 'message', channel_type: 'channel', channel: 'C900', user: 'U1', text: 'chatter', ts: '5.5' });
  await sleep(150);
  assert.equal(did.length, n, 'bots, edits and chatter in channels are not heard');
});

test('Slack: in a channel only the person who linked it is heard, and only when the app is mentioned', async () => {
  const before = posts().length;
  slMention('hi');
  await until('told whose app it is', () => posts().length > before);
  assert.equal(lastPost().channel, 'C900');
  assert.match(lastPost().text, /someone’s own Hydor/);
  const code = (await app.inject({ method: 'POST', url: '/api/slack/pair' })).json().pairing.code;
  slMention(code);
  await until('linked in the channel', () => slackChats(d).some((c) => c.id === 'C900'));
  assert.equal(slackChats(d).find((c) => c.id === 'C900')!.kind, 'channel');
  const n = posts().length;
  slMention('let me in', 'C900', 'U2');
  await until('told', () => posts().length > n);
  assert.equal(did.filter((x) => x.what === 'create').length, 1, 'no session for a stranger');
  slMention('Fix the login page');
  await until('a session', () => did.filter((x) => x.what === 'create').length === 2);
  assert.deepEqual(did.at(-1), { what: 'create', key: 'claude:made-2', text: 'Fix the login page' }, 'without the mention');
});

test('Slack: what an agent asks comes with buttons; a press answers it once and shows what was pressed', async () => {
  const n: NotifyEvent = {
    key: 'claude:made-1',
    kind: 'waiting',
    title: 'Plan a weekend in Rome',
    body: 'Needs your approval',
    agent: 'claude',
    at: Date.now(),
    approval: { id: 'ap1', title: 'Run a command', detail: 'rm -rf build', approve: { id: 'allow', label: 'Allow' }, deny: { id: 'deny', label: 'Deny' } },
  };
  await slackNotice(d, n);
  const m = lastPost();
  assert.equal(m.channel, SDM);
  assert.equal(m.blocks[0].text.text, '*Plan a weekend in Rome*\nNeeds your approval\nrm -rf build');
  const [allow, deny] = m.blocks[1].elements;
  assert.deepEqual([allow.text.text, deny.text.text, allow.style, deny.style], ['Allow', 'Deny', 'primary', undefined]);
  const id = slAction(allow.action_id);
  await until('answered', () => did.at(-1)?.what === 'answer');
  assert.deepEqual(did.at(-1), { what: 'answer', key: 'claude:made-1', text: 'ap1', a: { decision: 'allow' } });
  assert.ok(acks.some((a) => a.envelope_id === id), 'the press is acknowledged');
  await until('the message updated', () => slSent.some((s) => s.method === 'chat.update'));
  const u = slSent.find((s) => s.method === 'chat.update')!.body;
  assert.deepEqual([u.channel, u.ts], [SDM, '9.1']);
  assert.ok(!u.blocks.some((b: any) => b.type === 'actions'), 'the buttons are gone');
  assert.equal(u.blocks.at(-1).elements[0].text, '✓ Allow');
  const answers = did.length;
  slAction(allow.action_id);
  await until('told', () => slSent.some((s) => s.method === 'chat.postEphemeral'));
  assert.equal(did.length, answers, 'once');
  slAction(deny.action_id, { user: { id: 'U2' } });
  await sleep(100);
  assert.equal(did.length, answers, 'a stranger’s press does nothing');
  // Another session's notices come only with Notify on.
  await put('/api/slack', { notify: false });
  const before = posts().length;
  await slackNotice(d, { ...n, key: 'codex:other', kind: 'done', body: 'All set', approval: undefined });
  assert.equal(posts().length, before);
  await put('/api/slack', { notify: true });
  await slackNotice(d, { ...n, key: 'codex:other', kind: 'done', body: 'All set', approval: undefined });
  assert.match(lastPost().blocks[0].text.text, /Finished\nAll set/);
  const own = posts().length;
  await slackNotice(d, { ...n, kind: 'done', body: 'Done', approval: undefined });
  assert.equal(posts().length, own, 'its own session’s “Finished” is the reply the turn sends');
});

test('Slack: /hydor and its commands: sessions to go on with another, status, stop, new, and a message as typed', async () => {
  summaries.set('codex:other', { key: 'codex:other', agent: 'codex', title: 'Review the pull request', live: { status: 'working' } } as unknown as SessionSummary);
  const n = posts().length;
  slSlash('sessions');
  await until('the list', () => posts().length > n);
  assert.equal(lastPost().blocks[0].text.text, 'Go on with:');
  const row = lastPost().blocks.find((b: any) => b.type === 'actions' && b.elements[0].text.text.includes('Review the pull request'));
  slAction(row.elements[0].action_id);
  await until('moved', () => posts().some((p) => /“Review the pull request” now/.test(p.text)));
  slSlash('status');
  await until('status', () => posts().some((p) => /^Review the pull request: working\./.test(p.text)));
  slSlash('stop');
  await until('stopped', () => did.at(-1)?.what === 'interrupt');
  assert.deepEqual(did.at(-1), { what: 'interrupt', key: 'codex:other' });
  slSlash('new Write a haiku');
  await until('a new session', () => did.at(-1)?.what === 'create' && did.at(-1)?.text === 'Write a haiku');
  slSlash('');
  await until('help', () => posts().some((p) => /^Send what you want done/.test(p.text)));
  slSlash('Plan a picnic');
  await until('as typed', () => did.at(-1)?.text === 'Plan a picnic');
  // Not linked here: told privately, through the command's own address.
  slSlash('new nope', { user_id: 'U9' });
  await until('told privately', () => slResponses.length > 0);
  assert.equal(slResponses[0].response_type, 'ephemeral');
  assert.match(slResponses[0].text, /someone’s own Hydor/);
  assert.notEqual(did.at(-1)?.text, 'nope');
  // Commands typed in the chat.
  slDm('!status');
  await until('status as a message', () => posts().some((p) => /^Write a haiku: working\./.test(p.text)));
});

test('Slack: what Slack refuses as blocks goes as plain text; “too many calls” is waited out; ten messages at most', async () => {
  const end = () => slack.turnEnd!(turn('claude:made-2'), d);
  summaries.set('claude:made-2', { key: 'claude:made-2', agent: 'claude', title: 'Fix', live: { status: 'idle' } } as unknown as SessionSummary);
  const say = (text: string) => items.set('claude:made-2', [{ kind: 'user', id: `u${++env}`, text: 'x' } as TimelineItem, { kind: 'assistant', id: `a${env}`, text } as TimelineItem]);
  say('REFUSE **this** please');
  await end();
  assert.equal(lastPost().text, 'REFUSE this please');
  assert.equal(lastPost().blocks, undefined);
  say('SLOWDOWN then fine');
  const t0 = Date.now();
  await end();
  assert.ok(Date.now() - t0 >= 900, 'waited as Slack said');
  assert.equal(lastPost().text, 'SLOWDOWN then fine');
  say(Array.from({ length: 15 }, (_, i) => `${i} ${'word '.repeat(450).trim()}`).join('\n\n'));
  const n = posts().length;
  await end();
  const parts = posts().slice(n);
  assert.equal(parts.length, MAX_PARTS);
  for (const p of parts) assert.ok(p.blocks[0].text.text.length <= 3000, `a block of ${p.blocks[0].text.text.length}`);
  assert.match(parts.at(-1)!.blocks[0].text.text, /The rest of this reply is in the session in Hydor/);
  slDm('');
  await until('words asked for', () => /^Send words/.test(lastPost().text));
});

test('Slack Socket Mode: when Slack asks for a new connection (disconnect) one is opened at once, and events go on; a break is mended too', async () => {
  const opens = sl.opens;
  const was = sockets.at(-1)!;
  was.send(JSON.stringify({ type: 'disconnect', reason: 'refresh_requested' }));
  await until('a new connection', () => sockets.at(-1) !== was && sl.opens > opens);
  await sleep(100);
  const n = did.length;
  slDm('after the refresh');
  await until('heard on the new connection', () => did.length > n);
  const opens2 = sl.opens;
  sockets.at(-1)!.terminate();
  await until('a new connection after a break', () => sl.opens > opens2);
  await sleep(100);
  assert.equal((await get('/api/slack')).state, 'running');
});

test('Slack: a token Slack no longer takes is said in Settings and not tried again; unlinking a chat and removing the app', async () => {
  const opens = sl.opens;
  const bad = (await app.inject({ method: 'DELETE', url: '/api/slack/chats/C900' })).json();
  assert.deepEqual(
    bad.chats.map((c: { id: string }) => c.id),
    [SDM],
  );
  const off = await put('/api/slack', { token: null });
  assert.equal(off.json().connected, false);
  assert.equal(slackChats(d).length, 0, 'every chat unlinked');
  assert.equal(readSecret(db, BOT_TOKEN), null);
  assert.equal(readSecret(db, APP_TOKEN), null);
  await sleep(300);
  assert.equal(sl.opens, opens, 'no connection without tokens');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
stopDiscord();
stopSlack();
for (const ws of [...gw.conns, ...sockets]) ws.terminate();
dc.close();
slServer.close();
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
