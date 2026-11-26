// Script tests for the card that asks for several credentials at once (cards.ts, request_secret with items or how): one
// item as before, several with tabs and groups, a sign-in in several fields, an optional one skipped, a key already in
// the vault, a card closed half-way, what a paste that is plainly wrong says, a live payments key refused for an app
// inside Hydor, what agents may not do, and, at the end, that no value typed on a card is anywhere in the data folder, in
// the session's transcript, in what the pages are sent or in the server's log. Fake values only.
// Build it, then run it with HOME and DATA_DIR set to scratch folders under the system's temporary folder (npm test does):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/connections/cards-test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { SecretRequestView } from '../../shared/connections.ts';
import { cardDone, keysCardMarker, keysCardOf, pasteWarning, requestName, type KeysCardView } from '../../shared/keys.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx, RunTool } from '../features/types.ts';
import { ruleFor } from '../guide/api.ts';
import { createCard, LIVE_REFUSAL } from './cards.ts';
import { connections } from './index.ts';
import { appKey, getRequest, listSecrets, readAppKey, readSecret, redact, rotateVaultKey, saveAppKey, saveSecret } from './vault.ts';

const scratched = (p?: string) => !!p && [p, fs.existsSync(p) ? fs.realpathSync(p) : p].some((x) => x.startsWith(os.tmpdir() + path.sep) || x.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
if (!scratched(process.env.DATA_DIR) || !scratched(process.env.HOME)) {
  console.error('Run with HOME and DATA_DIR in scratch folders under the temporary folder, so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(config.dataDir, { recursive: true, force: true });
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });

// ---- the values typed on the cards: plainly fake, each looked for everywhere at the end ------------------------

// Each in two parts, so no file holds the shape of a real key.
const VALUES = {
  stripe: 'sk_test_' + 'fakeQ7mVbX2pLd9Rt4Ns6Wz8Hc1Kj3Fy5Ga0',
  webhook: 'whsec_' + 'fakeT8nWcY3qMe0Su5Ot7Xa9Id2Lk4Gz6Hb1',
  model: 'sk-ant-' + 'fakeR9oXdZ4rNf1Tv6Pu8Yb0Je3Ml5Ha7Ic2',
  google: 'GOCSPX-' + 'fakeS0pYeA5sOg2Uw7Qv9Zc1Kf4Nm6Ib8Jd3',
  replaced: 'sk_test_' + 'fakeU1qZfB6tPh3Vx8Rw0Ad2Lg5On7Jc9Ke4',
  live: 'sk_live_' + 'fakeV2raGc7uQi4Wy9Sx1Be3Mh6Po8Kd0Lf5',
  legacy: 'ghp_' + 'fakeW3sbHd8vRj5Xz0Ty2Cf4Ni7Qp9Le1Mg6',
  smtp: 'fake smtp password X4tcIe9wSk6Y',
};

const transcript = path.join(config.dataDir, 'transcript.jsonl');
const pages = path.join(config.dataDir, 'pages.jsonl');
const note = (file: string, v: unknown) => fs.appendFileSync(file, `${JSON.stringify(v)}\n`);
const told: { key: string; text: string }[] = [];

const db = openDb(path.join(config.dataDir, 'hydor.db'));
const app = Fastify({ logger: { level: 'trace', file: path.join(config.dataDir, 'server.log') } });
app.setErrorHandler((err: Error, _req, reply) => reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
const deps = {
  app,
  db,
  broadcast: (e: unknown) => note(pages, e),
  toSubscribers: (_k: string, e: unknown) => note(pages, e),
  publicBase: () => 'http://test.local',
  models: {},
  sessions: {
    summary: (key: string) => ({ title: key, agent: 'claude' }),
    queueSummary: () => {},
    deliverOrQueue: async (key: string, text: string) => {
      told.push({ key, text });
      note(transcript, { role: 'user', key, text });
    },
  },
} as unknown as Deps;
connections.routes!(deps);
await app.ready();

const ctx = (key: string) => ({ runId: `run-${key}`, key, agent: 'claude', cwd: config.dataDir, deps }) as unknown as RunCtx;
const tool = async (key: string, args: Record<string, unknown>, name = 'request_secret') => {
  const t = (connections.tools!(ctx(key)) as RunTool[]).find((x) => x.name === name)!;
  note(transcript, { role: 'assistant', key, tool: name, input: args });
  let out: string;
  try {
    const r = await t.run(args, ctx(key));
    out = redact(typeof r === 'string' ? r : r.text);
  } catch (e) {
    out = `error: ${(e as Error).message}`;
  }
  note(transcript, { role: 'tool', key, output: out });
  return out;
};
const call = async <T = any>(method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown): Promise<{ status: number; json: T }> => {
  const r = await app.inject({ method, url, ...(body !== undefined ? { payload: body as object } : {}) });
  note(pages, { url, status: r.statusCode, body: r.body });
  return { status: r.statusCode, json: r.json() as T };
};
const cardOf = async (key: string, name: string): Promise<KeysCardView> => {
  const look = await call<{ request: SecretRequestView }>('GET', `/api/connections/requests?key=${key}&name=${name}`);
  assert.equal(look.json.request?.card, true, `a card for ${name}`);
  return (await call<{ card: KeysCardView }>('GET', `/api/connections/requests/${look.json.request.id}`)).json.card;
};
const answer = (c: KeysCardView, item: string, body: unknown, sub = '') => call<{ card: KeysCardView; error?: string }>('POST', `/api/connections/requests/${c.id}/items/${item}${sub}`, body);
const states = (c: KeysCardView) => c.items.map((i) => `${i.id}:${i.state}`).join(' ');

let passed = 0;
const step = async (name: string, f: () => unknown) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};

// ---- one item, as before -----------------------------------------------------------------------------------------

await step('a call with a name and a why is the card it always was', async () => {
  const out = await tool('s-old', { name: 'github token', why: 'To open the pull request.', domains: ['api.github.com'] });
  assert.equal(
    out,
    'A card in the conversation asks the user for GITHUB_TOKEN. You will get a message when it is saved (or if they decline); meanwhile carry on with anything that does not need it. You never see the value: use it by name (http_request with auth: "GITHUB_TOKEN").',
  );
  const r = (await call<{ request: SecretRequestView }>('GET', '/api/connections/requests?key=s-old&name=GITHUB_TOKEN')).json.request;
  assert.equal(r.card, undefined);
  assert.equal(r.state, 'pending');
  const saved = await call('POST', `/api/connections/requests/${r.id}`, { value: VALUES.legacy });
  assert.equal(saved.status, 200);
  assert.equal(told.at(-1)!.text, 'GITHUB_TOKEN is saved in the vault now, for api.github.com. You never see its value: use it by name, in http_request (auth: "GITHUB_TOKEN", or {{GITHUB_TOKEN}} in the address, headers or body) or in the browser (a browser_act type step with "secret": "GITHUB_TOKEN").');
  assert.match(await tool('s-old', { name: 'GITHUB_TOKEN', why: 'Again.' }), /already in the vault/);
});

await step('one item with how to get it is a card of one tab, kept under its name', async () => {
  const out = await tool('s-one', { name: 'WEATHER_API_KEY', why: 'To read the forecast.', from: 'Open Weather', how: ['1. Open the keys page', '2. Press Generate', 'Copy the key'], url: 'https://home.example-weather.org/api_keys', looks: { prefix: 'ow_', say: 'It starts ow_.' }, domains: ['api.example-weather.org'] });
  assert.match(out, /^A card in the conversation asks the user for Weather api key\./);
  assert.match(out, /saved, skipped or left/);
  const c = await cardOf('s-one', 'WEATHER_API_KEY');
  assert.equal(c.items.length, 1);
  assert.deepEqual(c.items[0].how, ['Open the keys page', 'Press Generate', 'Copy the key']);
  assert.equal(c.items[0].url, 'https://home.example-weather.org/api_keys');
  assert.deepEqual(c.items[0].fields[0].looks, { prefix: ['ow_'], say: 'It starts ow_.' });
  assert.equal(c.items[0].skippable, undefined, 'needed: no Skip');
  assert.equal((await answer(c, 'WEATHER_API_KEY', {}, '/skip')).status, 400);
  assert.equal((await answer(c, 'WEATHER_API_KEY', { values: {} })).status, 400);
  assert.equal((await call('POST', `/api/connections/requests/${c.id}`, { value: 'x' })).status, 400, 'answered item by item');
  assert.match(await tool('s-one', { name: 'WEATHER_API_KEY', why: 'Again.', how: ['Same'] }), /already in the conversation/);
  const mark = told.length;
  assert.equal((await call('POST', `/api/connections/requests/${c.id}/dismiss`)).status, 200);
  assert.match(told[mark].text, /^I closed the keys card\. Saved: none\. Skipped: none\. Left: Weather api key \(WEATHER_API_KEY\)\. Still missing: Weather api key/);
});

await step('OpenRouter’s key keeps its own card, whatever a call adds to it', async () => {
  await tool('s-or', { name: 'OPENROUTER_API_KEY', why: 'For pictures.', how: ['Open the keys page'] });
  await tool('s-or2', { items: [{ name: 'OPENROUTER_API_KEY', why: 'For pictures.' }] });
  for (const k of ['s-or', 's-or2']) {
    const r = (await call<{ request: SecretRequestView }>('GET', `/api/connections/requests?key=${k}&name=OPENROUTER_API_KEY`)).json.request;
    assert.equal(r.state, 'pending');
    assert.equal(r.card, undefined);
  }
});

// ---- several, with a sign-in of two fields and an optional one -------------------------------------------------------

const THREE = {
  why: 'To take payments and answer questions.',
  items: [
    { name: 'STRIPE', title: 'Stripe', from: 'Stripe', why: 'To create checkouts.', how: ['Open the keys page', 'Copy both'], url: 'https://dashboard.stripe.com/test/apikeys', fields: [{ name: 'secret_key', label: 'Secret key', looks: { prefix: 'sk_' } }, { name: 'webhook_secret', label: 'Webhook secret' }], domains: ['api.stripe.com'] },
    { name: 'ANTHROPIC_API_KEY', title: 'Model key', why: 'To answer questions.', domains: ['api.anthropic.com'] },
    { name: 'GOOGLE', title: 'Google sign-in', why: 'So people can sign in with Google.', optional: true, fields: [{ name: 'client_id', label: 'Client ID' }, { name: 'client_secret', label: 'Client secret' }] },
  ],
};

await step('several items make one card with a tab each; the agent hears once, when every needed one is saved', async () => {
  const out = await tool('s-three', THREE);
  assert.match(out, /asks the user for Stripe, Model key and Google sign-in \(optional\), a tab each\./);
  const name = requestName(THREE);
  assert.equal(name, 'STRIPE_ANTHROPIC_API_KEY_GOOGLE');
  let c = await cardOf('s-three', name);
  assert.deepEqual(c.items.map((i) => i.id), ['STRIPE', 'ANTHROPIC_API_KEY', 'GOOGLE']);
  assert.deepEqual(c.items[0].fields.map((f) => f.key), ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
  assert.equal(c.items[2].skippable, true);
  const mark = told.length;
  assert.equal((await answer(c, 'STRIPE', { values: { STRIPE_SECRET_KEY: VALUES.stripe } })).json.error, 'Fill in Webhook secret');
  assert.equal(readSecret(db, 'STRIPE_SECRET_KEY'), null, 'nothing is saved unless all of it can be');
  c = (await answer(c, 'STRIPE', { values: { STRIPE_SECRET_KEY: VALUES.stripe, STRIPE_WEBHOOK_SECRET: VALUES.webhook } })).json.card;
  assert.equal(states(c), 'STRIPE:saved ANTHROPIC_API_KEY:todo GOOGLE:todo');
  assert.equal(c.state, 'pending');
  assert.equal(told.length, mark, 'not yet');
  assert.deepEqual(readSecret(db, 'STRIPE_SECRET_KEY')?.view.domains, ['api.stripe.com']);
  c = (await answer(c, 'ANTHROPIC_API_KEY', { values: { ANTHROPIC_API_KEY: VALUES.model } })).json.card;
  assert.equal(c.state, 'saved', 'every needed one is in');
  assert.equal(told.length, mark + 1);
  assert.match(told[mark].text, /^The keys card is answered\. Saved: Stripe \(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET\); Model key \(ANTHROPIC_API_KEY\)\. Skipped: none\. Left: Google sign-in \(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET\)\. You never see their values: use them by name/);
  // The optional one added afterwards is news of its own.
  c = (await answer(c, 'GOOGLE', { values: { GOOGLE_CLIENT_ID: 'fake-client-id.apps.example', GOOGLE_CLIENT_SECRET: VALUES.google } })).json.card;
  assert.equal(told.length, mark + 2);
  assert.match(told[mark + 1].text, /^More was saved on the keys card\. Saved: Stripe .*Google sign-in/);
  // The card the pages get holds no value and no part of one.
  const text = JSON.stringify(c);
  assert.doesNotMatch(text, /sk_test_|whsec_|GOCSPX|sk-ant/);
  assert.equal(c.items[0].fields[0].savedAt! > 0, true);
});

await step('an optional one skipped: the card is answered once every item is, and says which were skipped', async () => {
  await tool('s-skip', { items: [{ name: 'MAPS_API_KEY', why: 'For maps.', optional: true }, { name: 'SMS_API_KEY', why: 'For texts.', optional: true }] });
  let c = await cardOf('s-skip', 'MAPS_API_KEY_SMS_API_KEY');
  const mark = told.length;
  c = (await answer(c, 'MAPS_API_KEY', {}, '/skip')).json.card;
  assert.equal(c.state, 'pending', 'nothing is needed: it waits for each to be answered');
  c = (await answer(c, 'SMS_API_KEY', {}, '/skip')).json.card;
  assert.equal(c.state, 'saved');
  assert.match(told[mark].text, /Saved: none\. Skipped: Maps api key \(MAPS_API_KEY\); Sms api key \(SMS_API_KEY\)\. Left: none\./);
});

await step('a sign-in in several fields: details that are not secret reach the agent as typed, secrets never', async () => {
  await tool('s-smtp', { name: 'SMTP', title: 'Mail server', why: 'To send mail.', how: ['Ask your mail service'], fields: [{ name: 'host', secret: false }, { name: 'port', secret: false }, { name: 'user', secret: false }, { name: 'password' }] });
  const c = await cardOf('s-smtp', 'SMTP');
  const mark = told.length;
  assert.equal((await answer(c, 'SMTP', { values: { SMTP_HOST: 'smtp.example.org', SMTP_PORT: '587', SMTP_USER: 'dana', SMTP_PASSWORD: VALUES.smtp } })).status, 200);
  assert.match(told[mark].text, /Saved: Mail server \(SMTP_PASSWORD\)\..*The details that are not secret: Host: smtp\.example\.org; Port: 587; User: dana\./);
  assert.deepEqual(listSecrets(db).filter((s) => s.name.startsWith('SMTP')).map((s) => s.name), ['SMTP_PASSWORD']);
});

await step('a key already in the vault is offered as it is or replaced, never shown', async () => {
  saveSecret(db, { name: 'MODEL_KEY', value: VALUES.model, domains: ['api.example.ai'] });
  assert.match(await tool('s-have', { items: [{ name: 'MODEL_KEY', why: 'Again.' }] }), /^MODEL_KEY is already in the vault\..*replace: true/);
  await tool('s-have', { items: [{ name: 'MODEL_KEY', why: 'The model.', domains: ['evil.example'] }, { name: 'OTHER_KEY', why: 'Another.' }] });
  let c = await cardOf('s-have', 'MODEL_KEY_OTHER_KEY');
  assert.equal(c.items[0].state, 'todo', 'an agent’s card asks: use it, or replace it');
  assert.equal(typeof c.items[0].fields[0].savedAt, 'number');
  assert.deepEqual(c.items[0].domains, ['api.example.ai'], 'a saved key keeps its hosts');
  c = (await answer(c, 'MODEL_KEY', { use: true })).json.card;
  assert.equal(c.items[0].state, 'used');
  assert.equal(readSecret(db, 'MODEL_KEY')!.value, VALUES.model);
  c = (await answer(c, 'MODEL_KEY', { values: { MODEL_KEY: VALUES.replaced } })).json.card;
  assert.equal(c.items[0].state, 'saved');
  assert.equal(readSecret(db, 'MODEL_KEY')!.value, VALUES.replaced);
});

await step('closed half-way: the agent is told what was saved and what is missing', async () => {
  await tool('s-half', { items: [{ name: 'FIRST_KEY', why: 'One.' }, { name: 'SECOND_KEY', why: 'Two.' }, { name: 'THIRD_KEY', why: 'Three.', optional: true }] });
  const c = await cardOf('s-half', 'FIRST_KEY_SECOND_KEY_THIRD_KEY');
  const mark = told.length;
  await answer(c, 'FIRST_KEY', { values: { FIRST_KEY: VALUES.stripe } });
  await answer(c, 'THIRD_KEY', {}, '/skip');
  assert.equal(told.length, mark);
  const closed = await call<{ card: KeysCardView }>('POST', `/api/connections/requests/${c.id}/dismiss`);
  assert.equal(closed.json.card.state, 'dismissed');
  assert.match(told[mark].text, /^I closed the keys card\. Saved: First key \(FIRST_KEY\)\. Skipped: Third key \(THIRD_KEY\)\. Left: Second key \(SECOND_KEY\)\. Still missing: Second key \(SECOND_KEY\)\. Carry on with what does not need it/);
  await call('POST', `/api/connections/requests/${c.id}/dismiss`);
  assert.equal(told.length, mark + 1, 'closing twice says nothing twice');
  assert.equal(getRequest(db, c.id)!.state, 'dismissed');
});

await step('commands are allowed only where the card asks and the person says', async () => {
  await tool('s-cmd', { items: [{ name: 'DEPLOY_TOKEN', why: 'To deploy.', commands: true }, { name: 'NOTE_KEY', why: 'For notes.' }] });
  const c = await cardOf('s-cmd', 'DEPLOY_TOKEN_NOTE_KEY');
  await answer(c, 'DEPLOY_TOKEN', { values: { DEPLOY_TOKEN: VALUES.legacy }, commands: true });
  await answer(c, 'NOTE_KEY', { values: { NOTE_KEY: VALUES.google }, commands: true });
  assert.equal(readSecret(db, 'DEPLOY_TOKEN')!.view.commands, true);
  assert.equal(readSecret(db, 'NOTE_KEY')!.view.commands, undefined);
});

await step('a paste that is plainly not it is warned about, never refused', async () => {
  const f = { key: 'STRIPE_SECRET_KEY', looks: { prefix: ['sk_test_', 'sk_live_'] } };
  assert.equal(pasteWarning('', f), null);
  assert.equal(pasteWarning(` ${VALUES.stripe} `, f), null);
  assert.equal(pasteWarning('pk_test_fake', f), 'looks');
  assert.equal(pasteWarning(`STRIPE_SECRET_KEY=${VALUES.stripe}`, f), 'line');
  assert.equal(pasteWarning(`export STRIPE_SECRET_KEY=${VALUES.stripe}`, f), 'line');
  assert.equal(pasteWarning(`"${VALUES.stripe}"`, f), 'quotes');
  assert.equal(pasteWarning('abc123', { key: 'X_KEY', looks: { pattern: '^\\d+$' } }), 'looks');
  assert.equal(pasteWarning('abc123', { key: 'X_KEY' }), null);
  await tool('s-warn', { name: 'WARN_KEY', why: 'A key.', looks: { prefix: 'wk_' }, how: ['Get it'] });
  const c = await cardOf('s-warn', 'WARN_KEY');
  assert.equal((await answer(c, 'WARN_KEY', { values: { WARN_KEY: 'not-like-it-at-all' } })).status, 200, 'the person may know better');
  assert.equal(cardDone([{ state: 'saved' }, { optional: true, state: 'todo' }]), true);
  assert.equal(cardDone([{ state: 'todo' }, { optional: true, state: 'saved' }]), false);
  assert.equal(keysCardOf(`words\n${keysCardMarker('sr_abc-_9')}\n[web app 1]`), 'sr_abc-_9');
});

await step('a web app’s card keeps its values as that app’s own, for that place; a test key only inside Hydor', async () => {
  const items = [{ id: 'STRIPE_SECRET_KEY', title: 'Stripe', from: 'Stripe', why: 'Payments.', fields: [{ key: 'STRIPE_SECRET_KEY', label: 'Secret key', secret: true, type: 'password' as const }], domains: [] }];
  const scope = { app: { id: 'a1', name: 'Shop', env: 'hydor' }, inside: true, byName: true };
  const c = createCard(db, { key: 's-live', name: 'APPKEYS_HYDOR_A1', items, scope });
  const plain = readSecret(db, 'STRIPE_SECRET_KEY')!.value;
  const refused = await answer(c, 'STRIPE_SECRET_KEY', { values: { STRIPE_SECRET_KEY: VALUES.live } });
  assert.equal(refused.status, 400);
  assert.equal(refused.json.error, LIVE_REFUSAL);
  assert.equal(readAppKey(db, 'a1', 'hydor', 'STRIPE_SECRET_KEY'), null);
  await answer(c, 'STRIPE_SECRET_KEY', { values: { STRIPE_SECRET_KEY: VALUES.replaced }, domains: 'evil.example', commands: true });
  assert.equal(readAppKey(db, 'a1', 'hydor', 'STRIPE_SECRET_KEY'), VALUES.replaced);
  assert.equal(readSecret(db, 'STRIPE_SECRET_KEY')!.value, plain, 'the vault’s own key of that name is not touched');
  // The server's place has its own value, a live one.
  const server = createCard(db, { key: 'webapp:a1', name: 'APPKEYS_PRODUCTION_A1', items, scope: { ...scope, app: { ...scope.app, env: 'production' }, inside: false } });
  assert.equal(server.items[0].state, 'todo', 'nothing of another place counts as there');
  assert.equal((await answer(server, 'STRIPE_SECRET_KEY', { values: { STRIPE_SECRET_KEY: VALUES.live } })).status, 200);
  assert.deepEqual([readAppKey(db, 'a1', 'hydor', 'STRIPE_SECRET_KEY'), readAppKey(db, 'a1', 'production', 'STRIPE_SECRET_KEY')], [VALUES.replaced, VALUES.live]);
  // A live value that got there some other way is refused inside Hydor.
  saveAppKey(db, 'a1', 'hydor', 'STRIPE_SECRET_KEY', VALUES.live);
  const again = createCard(db, { key: 's-live2', name: 'APPKEYS_HYDOR_A1', items, scope, there: ['STRIPE_SECRET_KEY'] });
  assert.equal(again.items[0].state, 'todo');
  assert.equal(again.items[0].fields[0].refused, 'live');
  assert.equal((await answer(again, 'STRIPE_SECRET_KEY', { use: true })).json.error, LIVE_REFUSAL);
  const marked = createCard(db, { key: 'webapp:a1', name: 'APPKEYS_PRODUCTION_A1B', items, scope: { ...scope, app: { ...scope.app, env: 'production' }, inside: false }, there: ['STRIPE_SECRET_KEY'] });
  assert.equal(marked.items[0].state, 'used', 'marked as there');
  // Masked like every value, and sealed again with the rest when the vault's key is replaced.
  assert.equal(redact(`it is ${VALUES.live}`), 'it is [secret STRIPE_SECRET_KEY]');
  rotateVaultKey(db);
  assert.equal(readAppKey(db, 'a1', 'production', 'STRIPE_SECRET_KEY'), VALUES.live);
  assert.ok(appKey(db, 'a1', 'hydor', 'STRIPE_SECRET_KEY'));
});

await step('what a call may not ask', async () => {
  assert.match(await tool('s-bad', { items: [] }), /^error: items:/);
  assert.match(await tool('s-bad', { items: [{ name: 'A_KEY' }] }), /^error: items\[0\]\.why/);
  assert.match(await tool('s-bad', { items: [{ name: 'A_KEY', why: 'x', url: 'javascript:alert(1)' }] }), /^error: items\[0\]\.url/);
  assert.match(await tool('s-bad', { items: [{ name: 'A_KEY', why: 'x', url: 'http://plain.example.com' }] }), /url/);
  assert.match(await tool('s-bad', { items: [{ name: 'A_KEY', why: 'x' }, { name: 'a key', why: 'y' }] }), /there twice/);
  assert.match(await tool('s-bad', { items: Array.from({ length: 9 }, (_, i) => ({ name: `K_${i}`, why: 'x' })) }), /at most 8/);
  assert.match(await tool('s-bad', { why: 'no name', how: ['x'] }), /^error: name/);
  assert.match(await tool('s-bad', { name: 'A_KEY' }), /^error: why/);
});

await step('agents cannot answer a card, skip, try or close it, nor write a key', async () => {
  for (const url of ['/api/connections/requests/sr_x', '/api/connections/requests/sr_x/items/A_KEY', '/api/connections/requests/sr_x/items/A_KEY/skip', '/api/connections/requests/sr_x/items/A_KEY/test', '/api/connections/requests/sr_x/dismiss'])
    assert.equal(ruleFor('POST', url).level, 'refuse', url);
  assert.equal(ruleFor('POST', '/api/connections/secrets').level, 'refuse');
  assert.equal(ruleFor('POST', '/api/webapps/a1/keys/card').level, 'refuse');
});

await step('the inbox names what a card still waits for', async () => {
  const items = connections.inbox!(deps) as { title: string; detail?: string }[];
  const card = items.find((i) => i.title.startsWith('Asks for a key: Second') || i.title.includes('Other key'));
  assert.ok(card, JSON.stringify(items.map((i) => i.title)));
});

// ---- nowhere it should not be --------------------------------------------------------------------------------------

await step('no value typed on a card is in the data folder, the transcript, the pages or the log', async () => {
  const messages = fs.readFileSync(transcript, 'utf8');
  assert.match(messages, /The keys card is answered/, 'the transcript holds what the agent heard');
  await app.close();
  db.pragma('wal_checkpoint(TRUNCATE)');
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(p);
    }
  };
  walk(config.dataDir);
  walk(process.env.HOME!);
  assert.ok(files.some((f) => f.endsWith('hydor.db')) && files.includes(transcript) && files.includes(pages) && files.some((f) => f.endsWith('server.log')), files.join(' '));
  const found: string[] = [];
  for (const file of files) {
    const bytes = fs.readFileSync(file);
    for (const [name, v] of Object.entries(VALUES)) {
      for (const form of [v, Buffer.from(v).toString('base64').replace(/=+$/, ''), encodeURIComponent(v), v.slice(4)])
        if (bytes.includes(form)) found.push(`${name} in ${path.relative(config.dataDir, file)}`);
    }
  }
  assert.deepEqual(found, []);
  // The test looks: a value written plainly would be found.
  const probe = path.join(config.dataDir, 'probe.txt');
  fs.writeFileSync(probe, `x ${VALUES.stripe} y`);
  assert.ok(fs.readFileSync(probe).includes(VALUES.stripe));
  fs.rmSync(probe);
  console.log(`    (${files.length} files searched for ${Object.keys(VALUES).length} values)`);
});

db.close();
console.log(`\n${passed} passed`);
process.exit(0);
