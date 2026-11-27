// Checks for accounts found signed out: how a program's refusal is told from a limit, the marks and the prompts to
// sign in again (signin.ts), the helper's calls to Claude Code and Codex passing over a signed-out account (with
// small made-up programs in their place), and the helper on Automatic turning to one of Custom's models (a small
// OpenAI-compatible server here) before it asks you to sign in. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/signin-test.ts
//   DATA_DIR=/tmp/hydor-test-signin node dist/dev/signin-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { ServerEvent } from '../shared/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

// The programs are read from the environment when the app's config loads, so everything of the app loads after this.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-signin-test-'));
const log = path.join(tmp, 'calls.log');
const claudeBin = path.join(tmp, 'claude');
const codexBin = path.join(tmp, 'codex');
// Each program answers as FAKE_MODE says (the account's environment) and notes who was asked in the log.
fs.writeFileSync(
  claudeBin,
  `#!/bin/sh
echo "claude:$FAKE_NAME" >> "$FAKE_LOG"
case "$FAKE_MODE" in
  out) echo '{"type":"result","is_error":true,"result":"Not logged in · Please run /login"}'; exit 1;;
  rejected) echo '{"type":"result","is_error":true,"api_error_status":401,"result":"Failed to authenticate. API Error: 401 OAuth access token is invalid."}'; exit 1;;
  limit) echo '{"type":"result","is_error":true,"result":"You'"'"'ve hit your weekly limit · resets Nov 19, 5am (UTC)"}'; exit 1;;
  *) echo '{"type":"result","is_error":false,"result":"ok from claude"}'; exit 0;;
esac
`,
  { mode: 0o755 },
);
fs.writeFileSync(
  codexBin,
  `#!/bin/sh
echo "codex:$FAKE_NAME" >> "$FAKE_LOG"
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then out="$2"; fi
  shift
done
case "$FAKE_MODE" in
  out) echo 'ERROR: unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.example.com/responses' >&2; exit 1;;
  outstdout) echo 'ERROR: unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.example.com/responses'; exit 1;;
  limit) echo "ERROR: You've hit your usage limit." >&2; exit 1;;
  *) echo "ok from codex" > "$out"; exit 0;;
esac
`,
  { mode: 0o755 },
);
process.env.CLAUDE_BIN = claudeBin;
process.env.CODEX_BIN = codexBin;
// No price table is fetched: a price is what the test sets.
process.env.PRICES_URL = '';
process.env.CUDA_VISIBLE_DEVICES = '';

const { openDb } = await import('./db.ts');
const signin = await import('./signin.ts');
const { oneShot, setOneShotAccounts, signedOutOf } = await import('./oneshot.ts');
const { helper } = await import('./helper.ts');
const { HttpError } = await import('./auth.ts');
const { AGENT_FILE, MODELS_DIR } = await import('./models/config.ts');
const { setPriceOverrides } = await import('./prices.ts');
const { setTiers } = await import('./assistants/tiers.ts');

const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const events: ServerEvent[] = [];
const names: Record<string, string> = { 'claude:a1': 'Work', 'claude:a2': 'Home', 'claude:': 'me@example.com', 'codex:': 'me@example.com' };
signin.initSignIn({ broadcast: (e) => events.push(e), nameOf: (agent, account) => names[`${agent}:${account ?? ''}`] ?? 'unknown' });

/** The time as the test sets it: marks and prompts read it through Date.now. */
const realNow = Date.now;
const later = (ms: number) => (Date.now = () => realNow() + ms);
const back = () => (Date.now = realNow);

const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
const env = (name: string, mode: string) => ({ FAKE_NAME: name, FAKE_MODE: mode, FAKE_LOG: log });
const pools = (claude: { account?: string; env: Record<string, string> }[], codex: { account?: string; env: Record<string, string> }[]) => setOneShotAccounts((agent) => (agent === 'claude' ? claude : codex));
const ask = { system: 'You answer.', prompt: 'Say ok.' };

// ---- the words ---------------------------------------------------------------------------------------

test('a refusal for a sign-in is told from a limit and from a timeout', () => {
  const { signedOutText: t } = signin;
  assert.equal(t('claude', 'Not logged in · Please run /login'), true);
  assert.equal(t('claude', 'Failed to authenticate. API Error: 401 OAuth access token is invalid.'), true);
  assert.equal(t('codex', 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.example.com/responses'), true);
  assert.equal(t('codex', 'ERROR: unexpected status 401 Unauthorized: Missing bearer or basic authentication in header'), true);
  for (const agent of ['claude', 'codex'] as const) {
    assert.equal(t(agent, "You've hit your weekly limit · resets Nov 19, 5am (UTC)"), false, agent);
    assert.equal(t(agent, 'it did not answer within 180 s'), false, agent);
    assert.equal(t(agent, ''), false, agent);
  }
  // Antigravity CLI and Grok Build: the ways they say they are signed out, and not a limit or a timeout.
  for (const said of [
    'Error: Please sign in to view available models. Launch the CLI without arguments to sign in.',
    'Authentication required',
    'You are not logged into Antigravity',
    'stored credentials are expired or revoked',
    'Authentication expired. Please log back in.',
    'request failed: 401',
    '401 Unauthorized',
  ])
    assert.equal(t('antigravity', said), true, said);
  assert.equal(t('grok', 'You are not authenticated.'), true);
  for (const agent of ['antigravity', 'grok'] as const) {
    assert.equal(t(agent, 'Resource exhausted: you have reached your usage limit, resets in 3 hours'), false, agent);
    assert.equal(t(agent, 'it did not answer within 180 s'), false, agent);
    assert.equal(t(agent, ''), false, agent);
  }
});

// ---- marks and prompts -------------------------------------------------------------------------------

test('a signed-out mark lasts a while, then the account is tried again', () => {
  signin.resetSignIn();
  signin.markSignedOut('claude', 'a1', 'Not logged in');
  assert.equal(signin.isSignedOut('claude', 'a1'), true);
  assert.equal(signin.isSignedOut('claude', undefined), false, 'another account of the program is not');
  assert.equal(signin.isSignedOut('codex', 'a1'), false, 'nor the same id of another program');
  assert.deepEqual(signin.signedOutAccounts(), [{ agent: 'claude', account: 'a1' }]);
  later(signin.SIGNED_OUT_MS - 1000);
  assert.equal(signin.isSignedOut('claude', 'a1'), true, 'not yet');
  later(signin.SIGNED_OUT_MS + 1000);
  assert.equal(signin.isSignedOut('claude', 'a1'), false);
  assert.deepEqual(signin.signedOutAccounts(), []);
  back();
});

test('prompts: raised, joined by sessions, hidden by Not now, dropped with their sessions, cleared by a sign-in', () => {
  signin.resetSignIn();
  events.length = 0;
  const heard: [string, string | undefined, string[]][] = [];
  const off = signin.onSignedIn((agent, account, sessions) => heard.push([agent, account, sessions]));
  signin.needSignIn({ agent: 'claude', account: 'a1', task: 'shortening your profile' });
  let [need] = signin.signInNeeds();
  assert.equal(need.name, 'Work', 'named as people know it');
  assert.equal(need.background, true);
  assert.equal(need.task, 'shortening your profile');
  assert.deepEqual(need.sessions, []);
  assert.equal(signin.isSignedOut('claude', 'a1'), true, 'a prompt is a mark too');
  const last = () => events[events.length - 1] as Extract<ServerEvent, { t: 'signin' }>;
  assert.equal(last().t, 'signin');
  assert.equal(last().needs.length, 1, 'every page is told');

  // A session it stopped joins the prompt; the background work stays what it was.
  signin.needSignIn({ agent: 'claude', account: 'a1', session: 'claude:s1' });
  [need] = signin.signInNeeds();
  assert.deepEqual(need.sessions, ['claude:s1']);
  assert.equal(need.background, true);
  assert.equal(need.task, 'shortening your profile');

  // Not now hides it on every page; a session it stops shows it again.
  signin.dismissSignIn('claude', 'a1');
  assert.ok((signin.signInNeeds()[0].hiddenUntil ?? 0) > Date.now());
  signin.needSignIn({ agent: 'claude', account: 'a1', session: 'claude:s2' });
  assert.equal(signin.signInNeeds()[0].hiddenUntil, undefined);
  assert.deepEqual(signin.signInNeeds()[0].sessions, ['claude:s1', 'claude:s2']);
  signin.dismissSignIn('codex', undefined);
  assert.equal(signin.signInNeeds().length, 1, 'nothing to hide for an account nobody needs');

  // A session that moved on is dropped; a prompt only a session had goes with it.
  signin.dropSignInSession('claude:s1');
  assert.deepEqual(signin.signInNeeds()[0].sessions, ['claude:s2']);
  signin.needSignIn({ agent: 'codex', session: 'codex:s3' });
  assert.equal(signin.signInNeeds().length, 2);
  assert.equal(signin.signInNeeds().find((n) => n.agent === 'codex')?.background, false, 'a session alone raised it');
  signin.dropSignInSession('codex:s3');
  assert.deepEqual(
    signin.signInNeeds().map((n) => n.agent),
    ['claude'],
  );

  // Signed in again: the mark and the prompt go, and the sessions it stopped are heard.
  events.length = 0;
  signin.markSignedIn('claude', 'a1');
  assert.deepEqual(signin.signInNeeds(), []);
  assert.equal(signin.isSignedOut('claude', 'a1'), false);
  assert.deepEqual(heard, [['claude', 'a1', ['claude:s2']]]);
  assert.equal(last().needs.length, 0, 'the pages hear it goes');
  signin.markSignedIn('claude', 'a1');
  signin.markSignedIn('grok', undefined);
  assert.equal(heard.length, 1, 'an account nothing was known of is not announced');
  // Codex's prompt went with its only session, but its mark stayed: signed in again, it is heard with no sessions.
  signin.markSignedIn('codex', undefined);
  assert.deepEqual(heard[1], ['codex', undefined, []]);
  off();
});

// ---- helper calls through the programs ---------------------------------------------------------------

test('background work done another way: its prompts go, a session\'s stays', () => {
  signin.resetSignIn();
  signin.needSignIn({ agent: 'codex', task: 'titles' });
  signin.needSignIn({ agent: 'claude', account: 'a1', task: 'shortening your profile' });
  signin.needSignIn({ agent: 'claude', account: 'a1', session: 's1' });
  signin.backgroundDone();
  const needs = signin.signInNeeds();
  assert.equal(needs.length, 1, 'the background-only prompt went');
  assert.deepEqual([needs[0].agent, needs[0].account, needs[0].background, needs[0].task, needs[0].sessions], ['claude', 'a1', false, undefined, ['s1']]);
  signin.resetSignIn();
});

test('a signed-out account is marked and passed over, and the next one answers', async () => {
  signin.resetSignIn();
  fs.rmSync(log, { force: true });
  pools([{ account: 'a1', env: env('a1', 'out') }, { env: env('main', 'ok') }], [{ env: env('main', 'ok') }]);
  assert.equal(await oneShot(ask), 'ok from claude');
  assert.deepEqual(calls(), ['claude:a1', 'claude:main'], 'asked in turn');
  assert.equal(signin.isSignedOut('claude', 'a1'), true, 'marked');
  assert.equal(signin.isSignedOut('claude', undefined), false);
  assert.deepEqual(signin.signInNeeds(), [], 'another account answered: nobody is asked to sign in');

  // The next call does not ask it again.
  fs.rmSync(log);
  assert.equal(await oneShot(ask), 'ok from claude');
  assert.deepEqual(calls(), ['claude:main']);

  // Once its mark expires it is asked again: signed in meanwhile (in a terminal), it answers and the mark is gone.
  fs.rmSync(log);
  pools([{ account: 'a1', env: env('a1', 'ok') }, { env: env('main', 'ok') }], [{ env: env('main', 'ok') }]);
  assert.equal(await oneShot(ask), 'ok from claude');
  assert.deepEqual(calls(), ['claude:main'], 'still passed over');
  later(signin.SIGNED_OUT_MS + 1000);
  fs.rmSync(log);
  assert.equal(await oneShot(ask), 'ok from claude');
  assert.deepEqual(calls(), ['claude:a1']);
  assert.equal(signin.isSignedOut('claude', 'a1'), false, 'it answered: signed in');
  back();
});

test('a rejected token is signed out too; a limit is not', async () => {
  signin.resetSignIn();
  fs.rmSync(log, { force: true });
  pools([{ account: 'a1', env: env('a1', 'rejected') }, { account: 'a2', env: env('a2', 'limit') }, { env: env('main', 'ok') }], [{ env: env('main', 'ok') }]);
  assert.equal(await oneShot(ask), 'ok from claude');
  assert.deepEqual(calls(), ['claude:a1', 'claude:a2', 'claude:main']);
  assert.equal(signin.isSignedOut('claude', 'a1'), true, 'a 401 is a sign-in');
  assert.equal(signin.isSignedOut('claude', 'a2'), false, 'a limit is not');
});

test('Claude Code signed out: Codex answers; its 401 is read from stderr or stdout', async () => {
  for (const mode of ['out', 'outstdout']) {
    signin.resetSignIn();
    fs.rmSync(log, { force: true });
    pools([{ env: env('main', 'out') }], [{ account: undefined, env: env('main', mode) }]);
    await assert.rejects(oneShot(ask), (e: Error) => {
      assert.ok(e instanceof HttpError && e.status === 502);
      assert.match(e.message, /^Could not reach a model\. Claude Code: signed out\. Codex: signed out\.$/, mode);
      assert.deepEqual(signedOutOf(e), [{ agent: 'claude', account: undefined }, { agent: 'codex', account: undefined }], mode);
      return true;
    });
    assert.equal(signin.isSignedOut('codex', undefined), true, mode);
    // Both are passed over now, without a program being started.
    fs.rmSync(log);
    await assert.rejects(oneShot(ask), /Claude Code: signed out\. Codex: signed out\./);
    assert.deepEqual(calls(), [], mode);
  }
  signin.resetSignIn();
  pools([{ env: env('main', 'out') }], [{ env: env('main', 'ok') }]);
  assert.equal((await oneShot(ask)).trim(), 'ok from codex');
  assert.equal(signin.isSignedOut('claude', undefined), true);
  assert.equal(signin.isSignedOut('codex', undefined), false);
  assert.deepEqual(signedOutOf(new Error('x')), []);
});

// ---- the helper on Automatic -------------------------------------------------------------------------

/** A small OpenAI-compatible server: answers by the model it was asked for, noting each. */
const asked: string[] = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const q = JSON.parse(body || '{}') as { model?: string };
    asked.push(String(q.model));
    if (/^broken/.test(String(q.model))) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'no thanks' } }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ delta: { content: `custom says ok (${q.model})` } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 500 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
const model = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id.toUpperCase(), provider: 'endpoint', baseUrl, model: `${id}-name`, tools: 'native', ...extra });
const customModels = (...models: Record<string, unknown>[]) => {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.writeFileSync(AGENT_FILE, JSON.stringify({ models }));
};

test('Automatic: neither program answers, so a Custom model does, and nobody is asked to sign in', async () => {
  signin.resetSignIn();
  pools([{ account: 'a1', env: env('a1', 'out') }], [{ env: env('main', 'out') }]);
  // Free ones first (on this computer), then by price; the one with no price last.
  setPriceOverrides(db, { 'dear-name': { input: 10, output: 30 }, 'cheap-name': { input: 1, output: 2 } });
  customModels(model('unknown'), model('dear'), model('cheap'), model('local', { provider: 'ollama' }));
  const costs: number[] = [];
  asked.length = 0;
  assert.equal(await helper(db, { ...ask, onCost: (usd) => costs.push(usd) }), 'custom says ok (local-name)');
  assert.deepEqual(asked, ['local-name']);
  assert.deepEqual(costs, [0], 'a model on this computer costs nothing');
  assert.deepEqual(signin.signInNeeds(), [], 'a model answered: no prompt');

  // The Quick tier's pick comes before any other, even a dearer one.
  setTiers(db, { console: { quick: { model: 'dear' } } });
  asked.length = 0;
  costs.length = 0;
  assert.equal(await helper(db, { ...ask, onCost: (usd) => costs.push(usd) }), 'custom says ok (dear-name)');
  assert.deepEqual(asked, ['dear-name']);
  assert.ok(Math.abs(costs[0] - (1000 * 10 + 500 * 30) / 1e6) < 1e-12, 'priced by the table');

  // A strong call starts at Best, then Max, then Standard.
  setTiers(db, { console: { quick: { model: 'dear' }, standard: { model: 'cheap' }, best: { model: 'unknown' } } });
  asked.length = 0;
  await helper(db, { ...ask, strong: true });
  assert.deepEqual(asked, ['unknown-name']);

  // Without the tiers: the cheapest. With one that fails: the next; never more than two.
  setTiers(db, { console: {} });
  customModels(model('broken1', { provider: 'ollama' }), model('broken2', { provider: 'ollama' }), model('fine'));
  asked.length = 0;
  await assert.rejects(helper(db, { ...ask, task: 'titles' }), (e: Error) => {
    // Claude Code and Codex both signed out: only Claude Code, which answers first, is named (one sign-in is enough).
    assert.equal(e.message, 'Your Claude Code account “Work” is signed out, and no other account or Custom model could do this: sign in again (Settings → Agents → Accounts).');
    return true;
  });
  assert.deepEqual(asked, ['broken1-name', 'broken2-name'], 'two tried, the third not');
  customModels(model('broken1', { provider: 'ollama' }), model('fine', { provider: 'ollama' }));
  asked.length = 0;
  assert.equal(await helper(db, ask), 'custom says ok (fine-name)');
  assert.deepEqual(asked, ['broken1-name', 'fine-name']);
  setPriceOverrides(db, {});
  setTiers(db, { console: {} });
});

test('Automatic: nothing could do it, so the user is asked to sign in, and the error says which account', async () => {
  signin.resetSignIn();
  customModels();
  fs.rmSync(log, { force: true });
  // Codex is at its limit (not signed out): only Claude Code's account is named.
  pools([{ account: 'a1', env: env('a1', 'out') }], [{ env: env('main', 'limit') }]);
  events.length = 0;
  await assert.rejects(helper(db, { ...ask, task: 'shortening your profile' }), (e: Error) => {
    assert.ok(e instanceof HttpError && e.status === 502);
    assert.equal(e.message, 'Your Claude Code account “Work” is signed out, and no other account or Custom model could do this: sign in again (Settings → Agents → Accounts).');
    return true;
  });
  const needs = signin.signInNeeds();
  assert.equal(needs.length, 1);
  assert.deepEqual([needs[0].agent, needs[0].account, needs[0].name, needs[0].background, needs[0].task], ['claude', 'a1', 'Work', true, 'shortening your profile']);
  assert.equal(events.at(-1)?.t, 'signin');

  // Signing in again (the next call that gets through) clears the prompt.
  later(signin.SIGNED_OUT_MS + 1000);
  pools([{ account: 'a1', env: env('a1', 'ok') }], [{ env: env('main', 'limit') }]);
  assert.equal(await helper(db, ask), 'ok from claude');
  back();
  assert.deepEqual(signin.signInNeeds(), []);

  // Two Claude Code accounts signed out: both named, both asked about; Codex, signed out too, is not.
  signin.resetSignIn();
  pools([{ account: 'a1', env: env('a1', 'out') }, { account: 'a2', env: env('a2', 'out') }], [{ env: env('main', 'out') }]);
  await assert.rejects(helper(db, ask), (e: Error) => {
    assert.equal(e.message, '2 accounts are signed out (Claude Code “Work”, Claude Code “Home”), and no other account or Custom model could do this: sign in again (Settings → Agents → Accounts).');
    return true;
  });
  assert.deepEqual(signin.signInNeeds().map((n) => `${n.agent}:${n.account}`).sort(), ['claude:a1', 'claude:a2']);
  // Background work gets done again (another account answers): its prompts go, as nothing waits on them now.
  pools([{ account: 'a3', env: env('a3', 'ok') }], [{ env: env('main', 'limit') }]);
  assert.equal(await helper(db, ask), 'ok from claude');
  assert.deepEqual(signin.signInNeeds(), [], 'background prompts go once background work gets done');

  // No account signed out, only limits: the error is today's, with no prompt.
  signin.resetSignIn();
  pools([{ env: env('main', 'limit') }], [{ env: env('main', 'limit') }]);
  await assert.rejects(helper(db, ask), /Could not reach a model\. Claude Code: You've hit your weekly limit.*Codex: .*Settings → Models → Helper model can use another model\.$/s);
  assert.deepEqual(signin.signInNeeds(), []);
});

test('a program never signed in here is asked for as a first sign-in, one that was as signing in again', () => {
  signin.resetSignIn();
  signin.initSignIn({ broadcast: () => {}, nameOf: () => 'an account', signedInBefore: (agent) => agent === 'codex' });
  signin.needSignIn({ agent: 'claude', task: 'titles' });
  signin.needSignIn({ agent: 'codex', task: 'titles' });
  assert.deepEqual(Object.fromEntries(signin.signInNeeds().map((n) => [n.agent, n.first])), { claude: true, codex: undefined });
  signin.resetSignIn();
});

// ---- run ---------------------------------------------------------------------------------------------

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    back();
    console.log(`FAIL ${name}\n     ${(e as Error).stack?.split('\n').slice(0, 5).join('\n     ')}`);
  }
}
server.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
