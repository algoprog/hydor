// Script tests for Custom's models of your Claude and ChatGPT plans (server/models/subscription.ts): the conversation as
// Claude Code is given it (one message, each step in its own block, so the cache of the last step holds) and as the
// ChatGPT plan's Responses API takes it (messages, calls, what they returned, sealed reasoning); the tag a reply may
// open or close with; and asking with each account in turn, a fake Claude Code and a fake Responses API answering:
// one at its limit or signed out hands the step on, a token that ended is refreshed once. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/models/subscription-test.ts
//   DATA_DIR=/tmp/hydor-test-plans node dist/dev/subscription-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { ChatMessage } from '../agent/llm.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

// A fake Claude Code: reads the turn's message, and answers by FAKE_CLAUDE (the account's environment says how).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-plans-test-'));
const fake = path.join(dir, 'claude');
fs.writeFileSync(
  fake,
  `#!/usr/bin/env node
let b = '';
process.stdin.on('data', (x) => (b += x));
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  const sys = require('fs').readFileSync(args[args.indexOf('--system-prompt-file') + 1], 'utf8');
  const msg = JSON.parse(b.trim().split('\\n')[0]);
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  const mode = process.env.FAKE_CLAUDE;
  out({ type: 'system', subtype: 'init' });
  if (mode === 'limit') return out({ type: 'result', subtype: 'success', is_error: true, result: "You've hit your weekly limit · resets 5am (UTC)" });
  if (mode === 'out') return out({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' });
  if (mode === 'long') return out({ type: 'result', subtype: 'success', is_error: true, result: 'Prompt is too long' });
  const said = JSON.stringify({ model: args[args.indexOf('--model') + 1], tools: args[args.indexOf('--tools') + 1], sys, blocks: msg.message.content.map((x) => x.type) });
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } } });
  for (const piece of ['<assi', 'stant>', said.slice(0, 10), said.slice(10), '</assistant>'])
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: piece } } });
  out({ type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'end_turn' } } });
  out({ type: 'result', subtype: 'success', is_error: false, result: '<assistant>' + said + '</assistant>', usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 100, output_tokens: 7 } });
});
`,
  { mode: 0o755 },
);
process.env.CLAUDE_BIN = fake;

// A fake Responses API: by the token it is sent (each account's), a reply with a call, a limit, or a refusal.
const seen: { auth: string; account: string; body: any }[] = [];
/** Tokens (their last part) it refuses as ended, and those whose plan is at its limit. */
const ended = new Set<string>();
const limited = new Set<string>();
const sse = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const api = http.createServer((req, res) => {
  let b = '';
  req.on('data', (x) => (b += x));
  req.on('end', () => {
    const auth = String(req.headers.authorization ?? '');
    seen.push({ auth, account: String(req.headers['chatgpt-account-id'] ?? ''), body: JSON.parse(b) });
    const name = auth.split('.').pop() ?? '';
    if (limited.has(name)) return res.writeHead(429, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { type: 'usage_limit_reached', message: 'The usage limit has been reached' } }));
    if (ended.has(name)) return res.writeHead(401).end('{"error":{"message":"token expired"}}');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(
      sse([
        { type: 'response.reasoning_summary_text.delta', summary_index: 0, delta: 'Look it up.' },
        { type: 'response.output_item.done', item: { type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: 'Look it up.' }], encrypted_content: 'SEALED' } },
        { type: 'response.output_text.delta', delta: 'Checking.' },
        { type: 'response.output_item.done', item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' } },
        { type: 'response.completed', response: { id: 'resp_1', usage: { input_tokens: 50, input_tokens_details: { cached_tokens: 40 }, output_tokens: 9 } } },
      ]),
    );
  });
});
await new Promise<void>((r) => api.listen(0, '127.0.0.1', () => r()));
process.env.HYDOR_CODEX_RESPONSES_URL = `http://127.0.0.1:${(api.address() as { port: number }).port}/responses`;

const { claudeBlocks, codexInput, initPlans, planChat, planModels, TagTrim } = await import('./subscription.ts');
const { isSignedOut } = await import('../signin.ts');
const { ContextOverflow } = await import('../agent/llm.ts');

/** A token as Codex hands it out: a JWT whose claims carry when it ends and the ChatGPT account. */
const jwt = (name: string, expMs = Date.now() + 3600_000) => `h.${Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000), 'https://api.openai.com/auth': { chatgpt_account_id: `acct-${name}` } })).toString('base64url')}.${name}`;
const refreshed: string[] = [];
let codexMethod = 'chatgpt';
initPlans({
  accounts: (p) => (p === 'claude' ? [{ env: { FAKE_CLAUDE: process.env.FIRST_CLAUDE ?? 'ok' } }, { account: 'work', env: { FAKE_CLAUDE: 'ok' } }] : [{ env: {} }, { account: 'work', env: {} }]),
  codexToken: async (account, refresh) => {
    if (refresh) refreshed.push(account ?? 'main');
    const name = account ?? 'main';
    return { token: jwt(`${name}${refresh ? '-fresh' : ''}`), method: codexMethod };
  },
  claudeModels: async () => [
    { value: 'default', label: 'Default (recommended)', efforts: ['low', 'high'] },
    { value: 'opus', label: 'Opus 5.5', efforts: ['low', 'high'] },
    { value: 'sonnet', label: 'Sonnet 5.5', efforts: ['low', 'high'] },
    { value: 'claude-opus-4-6', label: 'Opus 4.6', efforts: [] },
  ],
  codexModels: async () => [{ value: 'gpt-6-luna', label: 'GPT-6-Luna', efforts: ['low', 'medium'] }],
});

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const quiet = { onText: () => {}, onReasoning: () => {} };

test('the models each program lends: Claude Code’s newest of each kind, Codex’s list', async () => {
  const { models, state } = await planModels();
  assert.deepEqual(
    models.map((m) => m.id),
    ['claude/opus', 'claude/sonnet', 'codex/gpt-6-luna'],
  );
  const opus = models[0];
  assert.equal(opus.label, 'Claude Opus 5.5');
  assert.equal(opus.provider, 'claude');
  assert.equal(opus.tools, 'text', 'Claude Code takes no tools of Custom’s: they are described in the prompt');
  assert.equal(models[2].tools, 'native');
  assert.ok(!models.some((m) => m.local), 'a plan’s model is never local');
  assert.deepEqual(
    state.map((s) => [s.provider, s.installed, s.signedIn, s.models.length]),
    [
      ['claude', true, true, 2],
      ['codex', true, true, 1],
    ],
  );
});

test('Claude is given the first request as it is, and later steps as a transcript that only grows', () => {
  const first: ChatMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'Look at this' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }];
  assert.deepEqual(claudeBlocks(first), [
    { type: 'text', text: 'Look at this' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
  ]);
  const two: ChatMessage[] = [
    { role: 'user', content: 'Weather in Paris?' },
    { role: 'assistant', content: '<tool_call>\n{"name": "get_weather", "arguments": {"city": "Paris"}}\n</tool_call>' },
    { role: 'user', content: '<tool_response name="get_weather">\nsunny\n</tool_response>' },
  ];
  const b2 = claudeBlocks(two) as { type: string; text: string }[];
  assert.match(b2[0].text, /conversation so far/);
  assert.equal(b2[1].text, '<user>\nWeather in Paris?\n</user>');
  assert.match(b2[2].text, /^<assistant>\n<tool_call>/);
  assert.equal(b2[3].text, '<tool_response name="get_weather">\nsunny\n</tool_response>', 'what a tool returned keeps its own tags');
  const three = [...two, { role: 'assistant' as const, content: 'It is sunny.' }, { role: 'user' as const, content: 'And Rome?' }];
  const b3 = claudeBlocks(three);
  assert.deepEqual(b3.slice(0, b2.length), b2, 'each step’s message starts with the last one’s, so its cache holds');
});

test('the ChatGPT plan is sent messages, calls, what they returned and the sealed reasoning (without its id)', () => {
  const items = codexInput([
    { role: 'user', content: [{ type: 'text', text: 'Weather?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
    { role: 'assistant', content: 'Checking.', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }], reasoning_details: [{ type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'SEALED' }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'sunny' },
    { role: 'user', note: true, content: 'A note' },
  ]);
  assert.deepEqual(items, [
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Weather?' }, { type: 'input_image', image_url: 'data:image/png;base64,AAAA' }] },
    { type: 'reasoning', summary: [], encrypted_content: 'SEALED' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Checking.' }] },
    { type: 'function_call', call_id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' },
    { type: 'function_call_output', call_id: 'call_1', output: 'sunny' },
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'A note' }] },
  ]);
});

test('a reply that opens or closes with the transcript’s tag is shown without it, however it is cut', () => {
  for (const pieces of [['<assistant>', 'Hi', ' there', '</assistant>'], ['<ass', 'istant>\nHi there</assi', 'stant>'], ['Hi there'], ['Hi', ' there'], ['  <assistant>Hi there']]) {
    let shown = '';
    const t = new TagTrim((x) => (shown += x));
    for (const p of pieces) t.push(p);
    t.end();
    assert.equal(shown, 'Hi there', JSON.stringify(pieces));
  }
  let shown = '';
  const t = new TagTrim((x) => (shown += x));
  for (const p of ['A long answer that mentions <assistant> tags', ' in the middle, and goes on.']) t.push(p);
  t.end();
  assert.equal(shown, 'A long answer that mentions <assistant> tags in the middle, and goes on.');
});

test('Claude answers through Claude Code: no tools of its own, the instructions in a file, the reply streamed and trimmed', async () => {
  const { models } = await planModels();
  let text = '';
  let thought = '';
  const r = await planChat(models[1], { messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }], signal: new AbortController().signal, onText: (t) => (text += t), onReasoning: (t) => (thought += t) });
  const said = JSON.parse(r.text);
  assert.deepEqual(said, { model: 'sonnet', tools: '', sys: 'Be brief.', blocks: ['text'] });
  assert.equal(text, r.text, 'what was shown is the reply, without the tags');
  assert.equal(thought, 'hmm');
  assert.deepEqual(r.usage, { prompt: 115, completion: 7, cached: 100 });
  assert.equal(r.calls.length, 0);
  assert.ok(!fs.readdirSync(os.tmpdir()).some((f) => f.startsWith('hydor-plan-')), 'the instructions’ file is removed');
});

test('an account at its limit hands the step to the next; one signed out is passed over afterwards', async () => {
  const { models } = await planModels();
  const ask = () => planChat(models[1], { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'Hi' }], signal: new AbortController().signal, ...quiet });
  process.env.FIRST_CLAUDE = 'limit';
  assert.equal(JSON.parse((await ask()).text).model, 'sonnet');
  process.env.FIRST_CLAUDE = 'out';
  assert.equal(JSON.parse((await ask()).text).model, 'sonnet');
  assert.ok(isSignedOut('claude', undefined), 'the main account is marked signed out');
  assert.ok(!isSignedOut('claude', 'work'));
  process.env.FIRST_CLAUDE = 'long';
  // Passed over while marked: the next account answers without the main one being asked.
  assert.equal(JSON.parse((await ask()).text).model, 'sonnet');
  delete process.env.FIRST_CLAUDE;
});

test('a conversation too long for Claude says so as such (Custom condenses it and asks again)', async () => {
  const { planChat: ask } = await import('./subscription.ts');
  initPlans({
    accounts: () => [{ account: 'long', env: { FAKE_CLAUDE: 'long' } }],
    codexToken: async () => ({ token: null, method: null }),
    claudeModels: async () => [{ value: 'sonnet', label: 'Sonnet 5.5', efforts: [] }],
    codexModels: async () => [],
  });
  const m = { id: 'claude/sonnet', label: 'Claude Sonnet 5.5', provider: 'claude' as const, baseUrl: '', model: 'sonnet', tools: 'text' as const };
  await assert.rejects(ask(m, { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'Hi' }], signal: new AbortController().signal, ...quiet }), (e) => e instanceof ContextOverflow);
});

test('Codex’s model gets Custom’s tools as tools, with the token and ChatGPT account, and returns calls and sealed reasoning', async () => {
  initPlans({
    accounts: (p) => (p === 'claude' ? [] : [{ env: {} }, { account: 'work', env: {} }]),
    codexToken: async (account, refresh) => {
      if (refresh) refreshed.push(account ?? 'main');
      const name = account ?? 'main';
      return { token: jwt(`${name}${refresh ? '-fresh' : ''}`), method: codexMethod };
    },
    claudeModels: async () => [],
    codexModels: async () => [{ value: 'gpt-6-luna', label: 'GPT-6-Luna', efforts: ['low', 'medium'] }],
  });
  const m = { id: 'codex/gpt-6-luna', label: 'GPT-6-Luna', provider: 'codex' as const, baseUrl: '', model: 'gpt-6-luna', tools: 'native' as const, efforts: ['low', 'medium'] };
  const tools = [{ type: 'function' as const, function: { name: 'get_weather', description: 'Weather', parameters: { type: 'object', properties: {} } } }];
  let text = '';
  let thought = '';
  seen.length = 0;
  const r = await planChat(m, { messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Weather?' }], tools, cacheKey: 'sess-1', signal: new AbortController().signal, onText: (t) => (text += t), onReasoning: (t) => (thought += t) });
  assert.deepEqual(r.calls, [{ id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' }]);
  assert.equal(text, 'Checking.');
  assert.equal(thought, 'Look it up.');
  assert.deepEqual(r.details, [{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'Look it up.' }], encrypted_content: 'SEALED' }]);
  assert.deepEqual(r.usage, { prompt: 50, completion: 9, cached: 40 });
  assert.equal(r.finish, 'tool_calls');
  const sent = seen[0];
  assert.equal(sent.account, 'acct-main');
  assert.match(sent.auth, /^Bearer h\./);
  assert.equal(sent.body.instructions, 'Be brief.');
  assert.equal(sent.body.model, 'gpt-6-luna');
  assert.equal(sent.body.store, false);
  assert.equal(sent.body.prompt_cache_key, 'sess-1');
  assert.deepEqual(sent.body.tools, [{ type: 'function', name: 'get_weather', description: 'Weather', parameters: { type: 'object', properties: {} }, strict: false }]);
});

test('Codex: a token that ended is refreshed once; an account at its limit hands the step to the next', async () => {
  const m = { id: 'codex/gpt-6-luna', label: 'GPT-6-Luna', provider: 'codex' as const, baseUrl: '', model: 'gpt-6-luna', tools: 'native' as const };
  const ask = () => planChat(m, { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'Hi' }], signal: new AbortController().signal, ...quiet });
  // Refused once: Codex is asked to refresh, and the fresh token is used (and kept for the next step).
  ended.add('main');
  seen.length = 0;
  refreshed.length = 0;
  await ask();
  assert.deepEqual(refreshed, ['main']);
  assert.deepEqual(
    seen.map((x) => x.auth.split('.').pop()),
    ['main', 'main-fresh'],
  );
  // At its limit: the next account answers.
  limited.add('main-fresh');
  seen.length = 0;
  const r = await ask();
  assert.equal(r.calls.length, 1);
  assert.deepEqual(
    seen.map((x) => x.auth.split('.').pop()),
    ['main-fresh', 'work'],
  );
});

test('Codex signed in with an API key, not ChatGPT, lends no plan: it says so', async () => {
  codexMethod = 'apikey';
  const m = { id: 'codex/gpt-6-luna', label: 'GPT-6-Luna', provider: 'codex' as const, baseUrl: '', model: 'gpt-6-luna', tools: 'native' as const };
  initPlans({ accounts: () => [{ account: 'keyed', env: {} }], codexToken: async () => ({ token: jwt('keyed'), method: 'apikey' }), claudeModels: async () => [], codexModels: async () => [] });
  await assert.rejects(planChat(m, { messages: [{ role: 'user', content: 'Hi' }], signal: new AbortController().signal, ...quiet }), /signed out/);
  assert.ok(isSignedOut('codex', 'keyed'));
  codexMethod = 'chatgpt';
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}\n`, e);
    process.exitCode = 1;
  }
}
api.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
