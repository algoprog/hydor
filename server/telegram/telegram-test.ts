// Script tests for Telegram (Settings → Telegram): Markdown as Telegram's HTML and cut to fit, linking a chat with its
// code, a message starting a session or going on with one, the reply when the turn ends, an approval's buttons
// answering it, notices, commands, HTML Telegram refuses sent as plain text, the routes, and asking Telegram for
// updates; against a stand-in for Telegram's API and for the session manager.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/telegram/telegram-test.ts && DATA_DIR=/tmp/hydor-test-telegram node dist/dev/telegram-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import Fastify from 'fastify';
import type { NotifyEvent, SessionSummary, TimelineItem } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { readSecret } from '../connections/vault.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { chunks, plainText, telegramHtml } from './format.ts';
import { handleUpdate, linkedChats, MAX_PARTS, notice, stopTelegram, telegram, TOKEN_NAME, type TgUpdate } from './index.ts';

const tmp = fs.mkdtempSync(path.join(process.env.DATA_DIR ?? '/tmp', 'telegram-'));
const db = openDb(path.join(tmp, 'test.db'));
kvSet(db, 'assistants.taskRoot', path.join(tmp, 'tasks'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- a stand-in for Telegram ----------------------------------------------------------------------
const TOKEN = '123456789:AAFakeTokenFakeTokenFakeTokenFakeToken12';
const sent: { method: string; body: any }[] = [];
const queue: TgUpdate[] = [];
let meCalls = 0;
let meFailFrom = Infinity;
let throttled = 0;
/** While set, getUpdates answers 409 with this description; conflictOnce clears it after one answer. */
let updatesConflict: string | null = null;
let conflictOnce = false;
const tg = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? '');
    const body = raw ? JSON.parse(raw) : {};
    const answer = (o: unknown) => (res.writeHead(200, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)));
    if (!m || m[1] !== TOKEN) return answer({ ok: false, error_code: 401, description: 'Unauthorized' });
    const method = m[2];
    if (method === 'getMe') {
      if (++meCalls >= meFailFrom) return answer({ ok: false, error_code: 502, description: 'Bad Gateway' });
      return answer({ ok: true, result: { id: 42, is_bot: true, first_name: 'Test', username: 'test_hydor_bot' } });
    }
    if (method === 'getUpdates') {
      if (updatesConflict !== null) {
        const description = updatesConflict;
        if (conflictOnce) {
          conflictOnce = false;
          updatesConflict = null;
        }
        return answer({ ok: false, error_code: 409, description });
      }
      for (let i = 0; i < 20 && !queue.length; i++) await new Promise((r) => setTimeout(r, 50));
      return answer({ ok: true, result: queue.splice(0) });
    }
    sent.push({ method, body });
    if (method === 'sendMessage' && body.parse_mode === 'HTML' && String(body.text).includes('REFUSE')) return answer({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" });
    if (method === 'sendMessage' && String(body.text).includes('SLOWDOWN') && !throttled++)
      return answer({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 1', parameters: { retry_after: 1 } });
    return answer({ ok: true, result: method === 'sendMessage' ? { message_id: sent.length } : true });
  });
});
await new Promise<void>((r) => tg.listen(0, '127.0.0.1', r));
process.env.TELEGRAM_API = `http://127.0.0.1:${(tg.address() as { port: number }).port}`;

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
// As the app's server answers errors: their status, and the message in words.
app.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const d = { app, db, sessions, scheduler: {}, models: {}, broadcast() {}, toSubscribers() {}, publicBase: () => 'https://hydor.example.com' } as unknown as Deps;
telegram.routes!(d);
await app.ready();

const CHAT = 5550001;
const from = { id: CHAT, first_name: 'Ada', last_name: 'L' };
let uid = 1;
const msg = (text: string, chat = CHAT): TgUpdate => ({ update_id: uid++, message: { message_id: uid, from: { ...from, id: chat }, chat: { id: chat, type: 'private' }, text } });
const lastSent = () => sent[sent.length - 1];
const texts = () => sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.text));
const settle = () => new Promise((r) => setTimeout(r, 30));

test('Markdown as Telegram’s HTML: bold, code, links, headings, lists, code blocks and tables', () => {
  const h = telegramHtml('# Plan\n\nSome **bold** and `a < b` with a [link](https://example.com).\n\n- one\n- two\n\n```ts\nconst x = 1 < 2;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(h, /^<b>Plan<\/b>/);
  assert.ok(h.includes('<b>bold</b>') && h.includes('<code>a &lt; b</code>') && h.includes('<a href="https://example.com">link</a>'), h);
  assert.ok(h.includes('• one\n• two'), h);
  assert.ok(h.includes('<pre><code class="language-ts">const x = 1 &lt; 2;</code></pre>'), h);
  assert.ok(h.includes('<pre>| a | b |\n| 1 | 2 |</pre>'), 'a table in a fixed-width font, without its line of dashes');
  assert.equal(plainText('**Done** with `x`, see [docs](https://d.example).'), 'Done with x, see docs (https://d.example).');
});

test('a long reply in parts that fit, a code block never cut open', () => {
  const para = 'word '.repeat(300).trim();
  const code = '```py\n' + Array.from({ length: 400 }, (_, i) => `print(${i})`).join('\n') + '\n```';
  const parts = chunks(`${para}\n\n${code}\n\n${para}`, 1000);
  assert.ok(parts.length > 4);
  for (const p of parts) {
    assert.ok(p.length <= 1000, `part of ${p.length}`);
    const fences = (p.match(/^```/gm) ?? []).length;
    assert.equal(fences % 2, 0, 'each part’s code fenced whole');
  }
});

test('a chat links only with its code, which goes after ten wrong tries; others are told once whose bot it is', async () => {
  await handleUpdate(d, TOKEN, msg('hello'));
  assert.match(lastSent().body.text, /someone’s own Hydor/);
  const n = sent.length;
  await handleUpdate(d, TOKEN, msg('hello again'));
  assert.equal(sent.length, n, 'told once');
  assert.equal((await app.inject({ method: 'POST', url: '/api/telegram/pair' })).statusCode, 400, 'no bot yet');
  // A bot, then a code to link with.
  const put = await app.inject({ method: 'PUT', url: '/api/telegram', payload: { token: TOKEN } });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(readSecret(db, TOKEN_NAME)?.value, TOKEN, 'the token is in the vault');
  const pair = (await app.inject({ method: 'POST', url: '/api/telegram/pair' })).json();
  assert.match(pair.pairing.code, /^[A-Z2-9]{8}$/);
  await handleUpdate(d, TOKEN, msg('WRONG123'));
  assert.equal(linkedChats(db).length, 0);
  await handleUpdate(d, TOKEN, msg(`/start ${pair.pairing.code}`));
  assert.deepEqual(
    linkedChats(db).map((c) => [c.id, c.name]),
    [[CHAT, 'Ada L']],
  );
  assert.match(lastSent().body.text, /^Linked to Hydor/);
  assert.equal((await app.inject({ method: 'GET', url: '/api/telegram' })).json().pairing, undefined, 'a code links once');
});

test('a message starts a session in a task folder; the reply comes when the turn ends, in Telegram’s HTML', async () => {
  await handleUpdate(d, TOKEN, msg('Plan a weekend in Rome'));
  assert.deepEqual(did.at(-1), { what: 'create', key: 'claude:made-1', text: 'Plan a weekend in Rome' });
  assert.match(lastSent().body.text, /^On it/);
  assert.equal(lastSent().body.reply_markup.inline_keyboard[0][0].url, 'https://hydor.example.com/s/claude%3Amade-1');
  items.set('claude:made-1', [
    { kind: 'user', id: 'u1', text: 'Plan a weekend in Rome' } as TimelineItem,
    { kind: 'assistant', id: 'a1', text: '## Saturday\n\n- **Colosseum** at 9' } as TimelineItem,
  ]);
  await telegram.turnEnd!({ key: 'claude:made-1', agent: 'claude', status: 'idle', startedAt: 0, endedAt: 1, external: false }, d);
  const r = lastSent().body;
  assert.equal(r.parse_mode, 'HTML');
  assert.equal(r.text, '<b>Saturday</b>\n\n• <b>Colosseum</b> at 9');
});

test('the next message goes on with the session, or waits in its queue while it works', async () => {
  await handleUpdate(d, TOKEN, msg('Add a museum'));
  assert.deepEqual(did.at(-1), { what: 'enqueue', key: 'claude:made-1', text: 'Add a museum' }, 'it is working');
  summaries.get('claude:made-1')!.live = { status: 'idle' } as never;
  await handleUpdate(d, TOKEN, msg('And a restaurant'));
  assert.deepEqual(did.at(-1), { what: 'send', key: 'claude:made-1', text: 'And a restaurant' });
});

test('what an agent asks comes with buttons; a press answers it once', async () => {
  const n: NotifyEvent = {
    key: 'claude:made-1',
    kind: 'waiting',
    title: 'Plan a weekend in Rome',
    body: 'Needs your approval',
    agent: 'claude',
    at: Date.now(),
    approval: { id: 'ap1', title: 'Run a command', detail: 'rm -rf build', approve: { id: 'allow', label: 'Allow' }, deny: { id: 'deny', label: 'Deny' } },
  };
  await notice(d, n);
  const m = lastSent().body;
  assert.match(m.text, /<b>Plan a weekend in Rome<\/b>\nNeeds your approval\nrm -rf build/);
  const [allow, deny] = m.reply_markup.inline_keyboard[0];
  assert.deepEqual([allow.text, deny.text], ['Allow', 'Deny']);
  assert.ok(allow.callback_data.length <= 64);
  const press = (data: string): TgUpdate => ({ update_id: uid++, callback_query: { id: `q${uid}`, from, data, message: { message_id: 7, chat: { id: CHAT, type: 'private' } } } });
  await handleUpdate(d, TOKEN, press(allow.callback_data));
  assert.deepEqual(did.at(-1), { what: 'answer', key: 'claude:made-1', text: 'ap1', a: { decision: 'allow' } });
  const answers = did.length;
  await handleUpdate(d, TOKEN, press(allow.callback_data));
  assert.equal(did.length, answers, 'once');
  // Another session's notices come only with Notify on.
  await app.inject({ method: 'PUT', url: '/api/telegram', payload: { notify: false } });
  const before = sent.length;
  await notice(d, { ...n, key: 'codex:other', kind: 'done', body: 'All set', approval: undefined });
  assert.equal(sent.length, before);
  await app.inject({ method: 'PUT', url: '/api/telegram', payload: { notify: true } });
  await notice(d, { ...n, key: 'codex:other', kind: 'done', body: 'All set', approval: undefined });
  assert.match(lastSent().body.text, /Finished\nAll set/);
  // Its own session's "Finished" is the reply turnEnd sends.
  const own = sent.length;
  await notice(d, { ...n, kind: 'done', body: 'Done', approval: undefined });
  assert.equal(sent.length, own);
});

test('commands: /sessions to go on with another, /status, /stop, /new', async () => {
  summaries.set('codex:other', { key: 'codex:other', agent: 'codex', title: 'Fix the login page', live: { status: 'working' } } as unknown as SessionSummary);
  await handleUpdate(d, TOKEN, msg('/sessions'));
  const rows = lastSent().body.reply_markup.inline_keyboard as { text: string; callback_data: string }[][];
  const other = rows.find((r) => r[0].text.includes('Fix the login page'))![0];
  await handleUpdate(d, TOKEN, { update_id: uid++, callback_query: { id: 'qs', from, data: other.callback_data } });
  assert.match(lastSent().body.text, /“Fix the login page” now/);
  await handleUpdate(d, TOKEN, msg('/status'));
  assert.match(lastSent().body.text, /^Fix the login page: working\./);
  await handleUpdate(d, TOKEN, msg('/stop'));
  assert.deepEqual(did.at(-1), { what: 'interrupt', key: 'codex:other' });
  await handleUpdate(d, TOKEN, msg('/new Write a haiku'));
  assert.deepEqual(did.at(-1), { what: 'create', key: 'claude:made-2', text: 'Write a haiku' });
});

test('HTML Telegram refuses goes as plain text; pictures are asked for in words', async () => {
  items.set('claude:made-2', [{ kind: 'user', id: 'u2', text: 'x' } as TimelineItem, { kind: 'assistant', id: 'a2', text: 'REFUSE **this** please' } as TimelineItem]);
  await telegram.turnEnd!({ key: 'claude:made-2', agent: 'claude', status: 'idle', startedAt: 0, endedAt: 1, external: false }, d);
  assert.equal(lastSent().body.parse_mode, undefined);
  assert.equal(lastSent().body.text, 'REFUSE this please');
  await handleUpdate(d, TOKEN, { update_id: uid++, message: { message_id: 99, from, chat: { id: CHAT, type: 'private' } } });
  assert.match(lastSent().body.text, /^Send words/);
});

test('Telegram’s “too many at once” is waited out; a reply longer than ten messages ends with where the rest is', async () => {
  const end = () => telegram.turnEnd!({ key: 'claude:made-2', agent: 'claude', status: 'idle', startedAt: 0, endedAt: 1, external: false }, d);
  items.set('claude:made-2', [{ kind: 'user', id: 'u3', text: 'x' } as TimelineItem, { kind: 'assistant', id: 'a3', text: 'SLOWDOWN then fine' } as TimelineItem]);
  const t0 = Date.now();
  await end();
  assert.ok(Date.now() - t0 >= 900, 'waited as Telegram said');
  assert.equal(texts().filter((t) => t.includes('SLOWDOWN')).length, 2, 'sent again once');
  const long = Array.from({ length: 15 }, (_, i) => `${i} ${'word '.repeat(700).trim()}`).join('\n\n');
  items.set('claude:made-2', [{ kind: 'user', id: 'u4', text: 'x' } as TimelineItem, { kind: 'assistant', id: 'a4', text: long } as TimelineItem]);
  const n = sent.length;
  await end();
  const parts = sent.slice(n).filter((s) => s.method === 'sendMessage');
  assert.equal(parts.length, MAX_PARTS);
  assert.match(String(parts.at(-1)!.body.text), /The rest of this reply is in the session in Hydor/);
});

test('a token Telegram turns down is refused; one it gives no answer for is kept', async () => {
  // The asking loop runs from here on, once, for the tests after this one.
  telegram.start!(d);
  const wrong = await app.inject({ method: 'PUT', url: '/api/telegram', payload: { token: '987654321:AAWrongTokenWrongTokenWrongTokenWrong1' } });
  assert.equal(wrong.statusCode, 400);
  assert.match(wrong.json().error, /Telegram did not take that token: Unauthorized/);
  assert.equal(readSecret(db, TOKEN_NAME)?.value, TOKEN, 'the vault keeps what it had');
  // Telegram not answering at all: the token is kept, and the asking waits for it.
  const real = process.env.TELEGRAM_API;
  let kept;
  process.env.TELEGRAM_API = 'http://127.0.0.1:9';
  try {
    kept = await app.inject({ method: 'PUT', url: '/api/telegram', payload: { token: TOKEN } });
  } finally {
    process.env.TELEGRAM_API = real;
  }
  assert.equal(kept.statusCode, 200, kept.body);
  assert.equal(kept.json().state, 'connecting');
  assert.match(kept.json().note, /could not be reached/);
  assert.equal(readSecret(db, TOKEN_NAME)?.value, TOKEN, 'the token is saved');
  let v;
  for (let i = 0; i < 100; i++) {
    v = (await app.inject({ method: 'GET', url: '/api/telegram' })).json();
    if (v.state === 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(v.state, 'running');
  assert.equal(v.bot.username, 'test_hydor_bot');
});

test('a webhook is taken off once and asking goes on; another program asking with the same bot is said in Settings, then cleared', async () => {
  const before = sent.filter((s) => s.method === 'deleteWebhook').length;
  // A webhook: Telegram says to take it off, which Hydor does once, and carries on.
  updatesConflict = "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first";
  conflictOnce = true;
  for (let i = 0; i < 50 && sent.filter((s) => s.method === 'deleteWebhook').length === before; i++) await settle();
  assert.equal(sent.filter((s) => s.method === 'deleteWebhook').length, before + 1, 'deleteWebhook called once');
  let v;
  for (let i = 0; i < 50; i++) {
    v = (await app.inject({ method: 'GET', url: '/api/telegram' })).json();
    if (v.state === 'running') break;
    await settle();
  }
  assert.equal(v.state, 'running', 'running after the webhook is off');
  // Another copy of the bot asking: said in Settings, and asked again later until the other one stops.
  updatesConflict = 'Conflict: terminated by other getUpdates request; make sure that only one bot instance is running';
  for (let i = 0; i < 50; i++) {
    v = (await app.inject({ method: 'GET', url: '/api/telegram' })).json();
    if (v.state === 'error') break;
    await settle();
  }
  assert.equal(v.state, 'error');
  assert.match(v.error, /Another program is getting this bot’s messages/);
  updatesConflict = null;
  for (let i = 0; i < 200; i++) {
    v = (await app.inject({ method: 'GET', url: '/api/telegram' })).json();
    if (v.state === 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(v.state, 'running', 'running again once the other copy stops');
  assert.equal(v.error, undefined);
});

test('updates are asked for by the app itself, from where it stopped; a chat removed is no longer heard', async () => {
  queue.push(msg('/help'));
  for (let i = 0; i < 100 && !texts().some((t) => t.startsWith('Send what you want done')); i++) await settle();
  assert.ok(
    texts().some((t) => t.startsWith('Send what you want done')),
    'the update was handled',
  );
  const v = (await app.inject({ method: 'GET', url: '/api/telegram' })).json();
  assert.equal(v.state, 'running');
  assert.equal(v.bot.username, 'test_hydor_bot');
  // The token given again restarts the asking; Telegram answering 502 then is kept, and tried again after a pause, not at once.
  const k = meCalls;
  meFailFrom = k + 1;
  const put = await app.inject({ method: 'PUT', url: '/api/telegram', payload: { token: TOKEN } });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(put.json().state, 'connecting');
  assert.equal(put.json().note, 'Bad Gateway');
  assert.equal(put.json().connected, true);
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(meCalls - k <= 3, `asked Telegram ${meCalls - k} times in half a second`);
  const waiting = (await app.inject({ method: 'GET', url: '/api/telegram' })).json();
  assert.equal(waiting.state, 'connecting');
  assert.equal(waiting.note, 'Bad Gateway');
  assert.equal(waiting.error, undefined);
  meFailFrom = Infinity;
  let back;
  for (let i = 0; i < 100; i++) {
    back = (await app.inject({ method: 'GET', url: '/api/telegram' })).json();
    if (back.state === 'running' && back.bot?.username === 'test_hydor_bot') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(back.state, 'running');
  assert.equal(back.bot.username, 'test_hydor_bot');
  await app.inject({ method: 'DELETE', url: `/api/telegram/chats/${CHAT}` });
  assert.equal(linkedChats(db).length, 0);
  const off = await app.inject({ method: 'PUT', url: '/api/telegram', payload: { token: null } });
  assert.equal(off.json().connected, false);
  assert.equal(readSecret(db, TOKEN_NAME), null);
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
stopTelegram();
tg.close();
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
