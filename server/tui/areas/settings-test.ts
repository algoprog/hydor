// Checks for `hydor settings` (areas/settings.ts) against a fake connection (test-kit.ts): list groups the options as the
// page does and --json gives { id: value }; get prints a value (or says where an option lives); set changes an option
// with the right call, refuses what only a page, a browser or another command can change, takes keys hidden or from a
// file and never prints them; run presses buttons after their question; open prints the address; the browser (no verb,
// on a terminal) picks a section, then an option, and changes it; and Tab completion lists option ids and values. Build
// and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/settings-test.ts && DATA_DIR=/tmp/hydor-test-settings-area node dist/dev/settings-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgv } from '../args.ts';
import { UsageError, runVerb, usageLine } from './kit.ts';
import { AREAS, areaByName, defaultVerb } from './index.ts';
import { LOADERS, type Candidate, type LoadCtx } from './loaders.ts';
import { fakeConn, run, testCtx } from './test-kit.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const routes = {
  'GET /api/app-settings': { autoResume: true, autoSwitch: false, apiCredit: false },
  'GET /api/memory': { enabled: true, meaning: { on: false }, topK: 10, tidyOn: true, learnOn: true, profileWords: 1000 },
  'GET /api/models': { openrouter: { keyHint: 'sk-or-…cret' }, hfTokenHint: undefined, ollama: { url: 'http://127.0.0.1:11434' }, local: [] },
  'GET /api/guidelines': { global: 'Be brief.' },
  'GET /api/browser/settings': {
    settings: { enabled: true, headless: true, blockPrivate: true, screenshots: true, chrome: '', allow: [], block: [] },
    profiles: [
      { id: 'p1', name: 'Work' },
      { id: 'p2', name: 'Old' },
    ],
  },
};
const ok = { ok: true };

// ---- list ----------------------------------------------------------------------------------------------------------------------
test('the area is registered, and with no verb it browses', () => {
  assert.equal(areaByName('settings')?.name, 'settings');
  assert.ok(AREAS.some((a) => a.name === 'settings'));
  assert.equal(defaultVerb(areaByName('settings')!).name, 'browse');
});

test('list shows the options as the page groups them, with their values and ids', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['settings', 'list']);
  const lines = t.out.split('\n');
  const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
  assert.ok(at(/^App › General$/) >= 0 && at(/^App › General$/) < at(/^Agents › Accounts$/) && at(/^Agents › Accounts$/) < at(/^Capabilities › Search$/), 'App, then Agents, then Capabilities');
  assert.match(t.out, /Resume after usage limits\s+on\s+general\.resume-after-usage-limits/);
  assert.match(t.out, /Switch accounts at a limit\s+off\s+accounts\.switch-accounts-at-a-limit/);
  assert.match(t.out, /Notes each agent starts with\s+10\s+memory\.notes-each-agent-starts-with/);
  assert.match(t.out, /Appearance\s+in each browser/);
  assert.match(t.out, /New theme\s+page/);
  assert.match(t.out, /Add server\s+hydor mcp add/);
  assert.match(t.out, /Send a test\s+button/);
  assert.match(t.out, /OpenRouter\s+set\s+models\.openrouter/);
  assert.match(t.out, /Hugging Face token\s+not set/);
  assert.match(t.out, /Sending while an agent works\s+Join the turn/, 'the terminal’s own setting');
  assert.match(t.out, /Delete inactive sessions\s+unavailable/, 'a route that fails is that option’s “unavailable”');
  assert.ok(!t.out.includes('sk-or-'), 'no key hint at all');
  const one = await run(conn, ['settings', 'list', 'memory']);
  assert.match(one.out, /^Capabilities › Memory\n/);
  assert.ok(!one.out.includes('General'));
  await assert.rejects(run(conn, ['settings', 'list', 'nowhere']), (e) => e instanceof UsageError && /No section “nowhere”/.test(e.message));
});

test('list --json gives { id: value } for the options that have a value, a secret only as set or not', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['settings', 'list', '--json']);
  const v = t.json[0] as Record<string, unknown>;
  assert.equal(v['general.resume-after-usage-limits'], true);
  assert.equal(v['memory.notes-each-agent-starts-with'], 10);
  assert.equal(v['models.openrouter'], true);
  assert.equal(v['models.hugging-face-token'], false);
  assert.equal(v['guidelines.for-every-session'], 'Be brief.');
  assert.equal(v['general.sending-while-an-agent-works'], 'join');
  assert.ok(!('general.appearance' in v) && !('general.new-theme' in v) && !('general.delete-inactive-sessions' in v));
  assert.ok(!JSON.stringify(v).includes('sk-or'));
});

// ---- get -----------------------------------------------------------------------------------------------------------------------
test('get prints a value alone when piped, and what it takes on a terminal', async () => {
  const { conn } = fakeConn(routes);
  assert.equal((await run(conn, ['settings', 'get', 'general.resume-after-usage-limits'])).out, 'on\n');
  assert.equal((await run(conn, ['settings', 'get', 'general.resume'])).out, 'on\n', 'a start of the words');
  assert.equal((await run(conn, ['settings', 'get', 'Resume after usage limits'])).out, 'on\n', 'the words alone');
  assert.equal((await run(conn, ['settings', 'get', 'models.openrouter'])).out, 'set\n');
  assert.equal((await run(conn, ['settings', 'get', 'memory.notes-each'])).out, '10\n');
  assert.deepEqual((await run(conn, ['settings', 'get', 'memory.notes-each', '--json'])).json, [10]);
  assert.deepEqual((await run(conn, ['settings', 'get', 'models.openrouter', '--json'])).json, [true]);
  const t = await run(conn, ['settings', 'get', 'memory.notes-each'], { interactive: true });
  assert.match(t.out, /Notes each agent starts with\s+10/);
  assert.match(t.out, /id\s+memory\.notes-each-agent-starts-with/);
  assert.match(t.out, /takes\s+a whole number from 1 to 50/);
  const s = await run(conn, ['settings', 'get', 'models.openrouter'], { interactive: true });
  assert.match(s.out, /takes\s+a key or token, typed hidden/);
  assert.ok(!s.out.includes('sk-or'));
});

test('get on an option kept in each browser, or only on the page, says where', async () => {
  const { conn, calls } = fakeConn({});
  let t = await run(conn, ['settings', 'get', 'general.language']);
  assert.match(t.out, /kept in each browser/);
  assert.match(t.out, /http:\/\/fake\/settings\?s=general&find=Language/);
  t = await run(conn, ['settings', 'get', 'general.new-theme']);
  assert.match(t.out, /only on the page/);
  t = await run(conn, ['settings', 'get', 'mcp.add-server']);
  assert.match(t.out, /hydor mcp add/);
  assert.equal(calls.length, 0);
  await assert.rejects(run(conn, ['settings', 'get', 'general.tips']), /No fake route GET \/api\/tips/, 'a failing read is the server’s error');
  await assert.rejects(run(conn, ['settings', 'get', 'general.zzz']), (e) => e instanceof UsageError);
  await assert.rejects(run(conn, ['settings', 'get']), (e) => e instanceof UsageError && /Say which option/.test((e as Error).message));
});

// ---- set -----------------------------------------------------------------------------------------------------------------------
test('set changes an option with the right call, by a loose name', async () => {
  const { conn, calls } = fakeConn({ 'PUT /api/app-settings': ok, 'PUT /api/memory': ok, 'PUT /api/models/tiers': ok, 'PUT /api/search/settings': ok });
  let t = await run(conn, ['settings', 'set', 'general.resume-after-usage-limits', 'off']);
  assert.equal(t.out, 'Resume after usage limits: off\n');
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/app-settings', body: { autoResume: false } });
  await run(conn, ['settings', 'set', 'memory.notes-each', '20']);
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/memory', body: { topK: 20 } });
  await run(conn, ['settings', 'set', 'models.max', 'on']);
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/models/tiers', body: { team: { hard: true } } });
  await run(conn, ['settings', 'set', 'search.results', '30']);
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/search/settings', body: { defaultK: 30 } });
  t = await run(conn, ['settings', 'set', 'memory.notes-each', '5', '--json']);
  assert.deepEqual(t.json, [{ id: 'memory.notes-each-agent-starts-with', changed: true, value: 5 }]);
  await assert.rejects(run(conn, ['settings', 'set', 'memory.notes-each', '500']), (e) => e instanceof UsageError && /from 1 to 50/.test((e as Error).message));
  await assert.rejects(run(conn, ['settings', 'set', 'general.resume', 'maybe']), (e) => e instanceof UsageError && /on or off/.test((e as Error).message));
  await assert.rejects(run(conn, ['settings', 'set', 'general.resume']), (e) => e instanceof UsageError && /Say the value \(on or off\)/.test((e as Error).message));
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 5, 'the refused ones made no call');
});

test('set joins the words of a list and takes a text from a file', async () => {
  const { conn, calls } = fakeConn({
    'PUT /api/search/settings': ok,
    'GET /api/search/settings': {
      providers: [
        { id: 'naget', enabled: true },
        { id: 'duckduckgo', enabled: false },
      ],
    },
    'PUT /api/guidelines': ok,
  });
  await run(conn, ['settings', 'set', 'search.providers', 'duckduckgo,', 'naget']);
  assert.deepEqual(calls.filter((c) => c.method === 'PUT')[0].body, { order: ['duckduckgo', 'naget'] });
  await run(conn, ['settings', 'set', 'guidelines.for-every-session', '--file', 'rules.md'], { files: { 'rules.md': 'Be brief.\nNo emoji.' } });
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/guidelines', body: { global: 'Be brief.\nNo emoji.' } });
  await run(conn, ['settings', 'set', 'guidelines.for-every-session', '--clear']);
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/guidelines', body: { global: '' } });
  await run(conn, ['settings', 'set', 'search.providers', '--clear']);
  assert.deepEqual(calls.filter((c) => c.method === 'PUT').at(-1)?.body, { provider: { id: 'naget', enabled: false } });
});

test('what only a page, a browser or a command can change is refused with where to go', async () => {
  const { conn, calls } = fakeConn({});
  await assert.rejects(
    run(conn, ['settings', 'set', 'general.new-theme', 'x']),
    (e) => e instanceof UsageError && /only on the page/.test((e as Error).message) && /http:\/\/fake\/settings\?s=general&find=New%20theme/.test((e as Error).message),
  );
  await assert.rejects(run(conn, ['settings', 'set', 'general.language', 'el']), (e) => e instanceof UsageError && /kept in each browser/.test((e as Error).message));
  await assert.rejects(run(conn, ['settings', 'set', 'mcp.add-server', 'x']), (e) => e instanceof UsageError && /hydor mcp add/.test((e as Error).message));
  await assert.rejects(run(conn, ['settings', 'set', 'chat.add-the-bot-to-a-server', 'x']), (e) => e instanceof UsageError && /only shows a value/.test((e as Error).message));
  assert.equal(calls.length, 0);
});

test('the terminal chat’s own settings are kept in terminal.json', async () => {
  const { conn, calls } = fakeConn({});
  const t = await run(conn, ['settings', 'set', 'general.sending', 'queue']);
  assert.match(t.out, /Wait for it \(kept for the terminal chat on this computer\)/);
  await run(conn, ['settings', 'set', 'general.terminal-suggestions', 'off']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DATA, 'terminal.json'), 'utf8')), { enter: 'queue', suggestions: false });
  assert.equal(calls.length, 0);
  fs.rmSync(path.join(DATA, 'terminal.json'));
});

test('a key comes from a file or stdin, is sent, and is never printed back', async () => {
  const KEY = 'sk-or-REALLY-SECRET-1';
  const { conn, calls } = fakeConn({ 'PUT /api/models': ok, 'PUT /api/slack': ok });
  const t = await run(conn, ['settings', 'set', 'models.openrouter', '--file', '-'], { files: { '-': KEY } });
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/models', body: { openrouterKey: KEY } });
  assert.equal(t.out, 'OpenRouter: set\n');
  const j = await run(conn, ['settings', 'set', 'models.openrouter', '--file', '-', '--json'], { files: { '-': KEY } });
  assert.ok(!JSON.stringify(j.json).includes('REALLY'), 'not in --json either');
  const c = await run(conn, ['settings', 'set', 'models.openrouter', '--clear']);
  assert.equal(c.out, 'OpenRouter: removed\n');
  assert.deepEqual(calls.at(-1)?.body, { openrouterKey: null });
  await assert.rejects(run(conn, ['settings', 'set', 'models.openrouter']), (e) => e instanceof UsageError && /--file -/.test((e as Error).message), 'piped with no key: it says how');
  await run(conn, ['settings', 'set', 'chat.slack', '--file', '-'], { files: { '-': 'xoxb-1\nxapp-2' } });
  assert.deepEqual(calls.at(-1)?.body, { botToken: 'xoxb-1', appToken: 'xapp-2' });
});

test('a change that deletes something asks first; -y says yes', async () => {
  const { conn, calls } = fakeConn(routes);
  const t = await run(conn, ['settings', 'set', 'browser.profiles', 'Work'], { confirm: false, interactive: true });
  assert.deepEqual(t.asked, ['Delete the browser profile “Old” with its sign-ins?']);
  assert.equal(t.out, 'Left as it was.\n');
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0);
  await assert.rejects(run(conn, ['settings', 'set', 'browser.profiles', 'Work']), (e) => e instanceof UsageError && /add -y/.test((e as Error).message));
  const y = fakeConn({ ...routes, 'DELETE /api/browser/profiles/p2': ok });
  await run(y.conn, ['settings', 'set', 'browser.profiles', 'Work', '-y']);
  assert.deepEqual(
    y.calls.filter((c) => c.method === 'DELETE').map((c) => c.path),
    ['/api/browser/profiles/p2'],
  );
});

// ---- run -----------------------------------------------------------------------------------------------------------------------
test('run presses a button, after its question when it has one', async () => {
  const { conn, calls } = fakeConn({
    'POST /api/push/test': { sent: 1 },
    'DELETE /api/memory': { cleared: 4 },
    'POST /api/memory/tidy': { started: true },
    'POST /api/mcp/tokens': { token: 'tok-1' },
  });
  assert.equal((await run(conn, ['settings', 'run', 'notifications.send-a-test'])).out, 'Sent to 1 device. It shows when the app is not in view.\n');
  assert.equal((await run(conn, ['settings', 'run', 'memory.tidy-up-now'])).out, 'Tidying memory up in the background.\n');
  await assert.rejects(run(conn, ['settings', 'run', 'memory.clear-all']), (e) => e instanceof UsageError && /add -y/.test((e as Error).message));
  const t = await run(conn, ['settings', 'run', 'memory.clear-all'], { confirm: false, interactive: true });
  assert.match(t.asked[0], /cannot be undone/);
  assert.equal(t.out, 'Not done.\n');
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  assert.equal((await run(conn, ['settings', 'run', 'memory.clear-all', '-y'])).out, 'Deleted 4 notes.\n');
  assert.equal((await run(conn, ['settings', 'set', 'notifications.send-a-test'])).out, 'Sent to 1 device. It shows when the app is not in view.\n', 'set presses a button too');
  assert.deepEqual((await run(conn, ['settings', 'run', 'connect.new-token', 'laptop', '--json'])).json, [{ id: 'connect.new-token', say: ['The token (shown once): tok-1'] }]);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/mcp/tokens', body: { name: 'laptop' } });
  await assert.rejects(run(conn, ['settings', 'run', 'general.tips']), (e) => e instanceof UsageError && /not a button/.test((e as Error).message));
});

// ---- open ----------------------------------------------------------------------------------------------------------------------
test('open prints the address of the page, a section or an option', async () => {
  const { conn } = fakeConn({});
  assert.equal((await run(conn, ['settings', 'open'])).out, 'http://fake/settings\n');
  assert.equal((await run(conn, ['settings', 'open', 'memory'])).out, 'http://fake/settings?s=memory\n');
  assert.equal((await run(conn, ['settings', 'open', 'Chat apps'])).out, 'http://fake/settings?s=chat\n');
  assert.equal((await run(conn, ['settings', 'open', 'general.new-theme'])).out, 'http://fake/settings?s=general&find=New%20theme\n');
  assert.deepEqual((await run(conn, ['settings', 'open', 'memory', '--json'])).json, [{ url: 'http://fake/settings?s=memory' }]);
});

// ---- the browser -----------------------------------------------------------------------------------------------------------------
/** Runs the area's default verb on a terminal whose picker follows a script: each step is the value to pick, or null (Esc). */
async function browse(routesIn: Record<string, unknown>, script: (string | null)[]) {
  const { conn, calls } = fakeConn(routesIn as never);
  const o = parseArgv(['settings']);
  const area = areaByName('settings')!;
  const verb = defaultVerb(area);
  const { ctx, ran } = testCtx(conn, usageLine(area, verb), o, { interactive: true });
  const asked: { title: string; labels: string[]; hints: (string | undefined)[] }[] = [];
  ctx.pick = async (title, items) => {
    asked.push({ title, labels: items.map((i) => i.label), hints: items.map((i) => i.hint) });
    if (!script.length) throw new Error(`the picker was asked more than the script has: ${title}`);
    const v = script.shift()!;
    return v;
  };
  const code = await runVerb(ctx, area, verb, [], {});
  return { ran, calls, asked, code };
}

test('with no verb on a terminal: a section, then an option, and Enter flips a switch', async () => {
  const b = await browse({ ...routes, 'PUT /api/app-settings': ok }, ['general', 'general.resume-after-usage-limits', null, null]);
  assert.equal(b.asked[0].title, 'Settings: which section?');
  assert.ok(b.asked[0].labels.includes('Chat apps') && b.asked[0].labels.includes('Images, video and audio'));
  assert.equal(b.asked[1].title, 'App › General');
  const i = b.asked[1].labels.indexOf('Resume after usage limits');
  assert.equal(b.asked[1].hints[i], 'on', 'an option shows its value');
  assert.equal(b.asked[1].hints[b.asked[1].labels.indexOf('Appearance')], 'in each browser');
  assert.deepEqual(
    b.calls.filter((c) => c.method === 'PUT'),
    [{ method: 'PUT', path: '/api/app-settings', body: { autoResume: false } }],
  );
  assert.match(b.ran.out, /Resume after usage limits: off/);
  assert.equal(b.asked[2].title, 'App › General', 'back at the section after a change, with the values read again');
  assert.equal(b.asked.length, 4);
  assert.equal(b.code, 0);
});

test('in the browser a choice offers its values, a page-only option prints its address, a button asks first', async () => {
  const b = await browse({ ...routes, 'PUT /api/videos/gpu': ok, 'GET /api/videos/gpu': { mode: 'auto' }, 'DELETE /api/memory': { cleared: 1 } }, [
    'images',
    'images.use-the-graphics-card-for-videos',
    'off',
    null,
    'general',
    'general.new-theme',
    null,
    'memory',
    'memory.clear-all',
    null,
    null,
  ]);
  assert.equal(b.asked[2].title, 'Use the graphics card for videos');
  assert.deepEqual(b.asked[2].labels, ['The graphics card when there is one', 'The processor']);
  assert.equal(b.asked[2].hints[0], 'now');
  assert.deepEqual(
    b.calls.filter((c) => c.method === 'PUT'),
    [{ method: 'PUT', path: '/api/videos/gpu', body: { mode: 'off' } }],
  );
  assert.match(b.ran.out, /http:\/\/fake\/settings\?s=general&find=New%20theme/);
  assert.match(b.ran.out, /Deleted 1 note/);
  assert.match(b.asked.map((a) => a.title).join('|'), /Capabilities › Memory/);
});

test('piped, the browser is the list; Esc at the sections ends it', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['settings']);
  assert.match(t.out, /^App › General\n/);
  const b = await browse(routes, [null]);
  assert.equal(b.asked.length, 1);
  assert.equal(b.ran.out, '');
});

// ---- Tab completion ------------------------------------------------------------------------------------------------------------------
test('Tab completion lists option ids with their labels, sections, and a choice’s values after the option', async () => {
  const load = (cur: string, args: string[], answers: Record<string, unknown> = {}): LoadCtx => ({ cur, args, opts: new Map(), get: async (p: string) => (answers[p] as never) ?? null });
  const ids = (await LOADERS.setting(load('', []))) as Candidate[];
  assert.ok(ids.length >= 144);
  assert.deepEqual(
    ids.find(([v]) => v === 'general.resume-after-usage-limits'),
    ['general.resume-after-usage-limits', 'Resume after usage limits'],
  );
  const secs = (await LOADERS.section(load('', []))) as Candidate[];
  assert.deepEqual(
    secs.find(([v]) => v === 'chat'),
    ['chat', 'Chat apps'],
  );
  assert.equal(secs.length, 25);
  assert.deepEqual(await LOADERS.value(load('', ['general.resume'])), [['on'], ['off']]);
  assert.deepEqual((await LOADERS.value(load('', ['voice.speech-recognition-on-the-server']))) as Candidate[], [
    ['off', 'Off'],
    ['local', 'On this machine'],
    ['endpoint', 'A service'],
  ]);
  assert.deepEqual((await LOADERS.value(load('', ['general.sending']))) as Candidate[], [
    ['join', 'Join the turn'],
    ['queue', 'Wait for it'],
  ]);
  assert.deepEqual(await LOADERS.value(load('', ['general.terminal-suggestions'])), [['on'], ['off']]);
  assert.deepEqual(
    await LOADERS.value(
      load('', ['models.helper-model'], {
        '/api/helper': {
          options: [
            { value: 'auto', label: 'Automatic' },
            { value: 'x/y', label: 'X' },
          ],
        },
      }),
    ),
    [
      ['auto', 'Automatic'],
      ['x/y', 'X'],
    ],
  );
  assert.deepEqual(await LOADERS.value(load('', ['memory.notes-each'])), [], 'a number has none to list');
  assert.deepEqual(await LOADERS.value(load('', ['models.openrouter'])), [], 'a key is never offered');
  assert.deepEqual(await LOADERS.value(load('', ['nonsense'])), []);
  assert.deepEqual(await LOADERS.value(load('', [])), []);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
