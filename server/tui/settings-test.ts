// Checks for the table of Settings options `hydor settings` is built on (settings-table.ts): that every option of the
// search box's catalog has exactly one row and every row names an option, that each kind has what it needs, and, with a
// fake connection, that reading and changing an option calls the right endpoint with the right body (a sweep over every
// option that can be changed, and exact bodies for one or more of each section and kind), that devices and pages say
// where to go instead, that secrets are never printed, and that the terminal's own settings are kept in terminal.json.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/settings-test.ts && DATA_DIR=/tmp/hydor-test-settings node dist/dev/settings-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OPTIONS, SECTIONS } from '../../shared/find-catalog.ts';
import { UsageError } from './args.ts';
import {
  choicesOf,
  explain,
  findRow,
  findSection,
  jsonValue,
  parseValue,
  readAll,
  readRow,
  ROWS,
  rowsOf,
  runAction,
  setRow,
  settingsAddress,
  showValue,
  terminalPrefs,
  type Ctl,
  type Kind,
  type Row,
} from './settings-table.ts';

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

/** A fake connection: what it answers to each GET, and every call it was given. */
function fake(answers: Record<string, unknown> = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const ctl: Ctl = {
    async api(method: string, p: string, body?: unknown): Promise<any> {
      calls.push({ method, path: p, body });
      if (method === 'GET') {
        if (!(p in answers)) return {};
        const a = answers[p];
        if (a instanceof Error) throw a;
        return a;
      }
      return { ok: true, sent: 2, cleared: 3, token: 'tok-new', pairing: { code: 'ABC123' }, servers: [{ name: 'x', state: 'connected', tools: 2 }], update: null, clients: [] };
    },
  } as Ctl;
  return { ctl, calls, writes: () => calls.filter((c) => c.method !== 'GET') };
}

// ---- the table covers the catalog --------------------------------------------------------------------------------------------
test('every catalog option has exactly one row, and every row names an option', () => {
  assert.equal(ROWS.length, OPTIONS.length, 'as many rows as options');
  const keys = new Set(OPTIONS.map(([s, l]) => `${s}\n${l}`));
  assert.equal(keys.size, OPTIONS.length, 'the catalog has no option twice in a section');
  const seen = new Map<string, number>();
  for (const r of ROWS) {
    assert.ok(keys.has(`${r.section}\n${r.label}`), `row ${r.id} names no catalog option (section ${r.section}, words “${r.label}”)`);
    const k = `${r.section}\n${r.label}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [s, l] of OPTIONS) assert.equal(seen.get(`${s}\n${l}`), 1, `the catalog option “${l}” (${s}) has ${seen.get(`${s}\n${l}`) ?? 0} rows`);
  const sections = new Set(SECTIONS.map(([id]) => id));
  for (const r of ROWS) assert.ok(sections.has(r.section), `${r.id}: no such section`);
  for (const [id] of SECTIONS) assert.ok(rowsOf(id).length > 0, `section ${id} has no rows`);
});

test('ids are unique, in the form <section>.<words>, and come in the page’s order', () => {
  const ids = ROWS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of ROWS) assert.match(r.id, /^[a-z]+\.[a-z0-9]+(-[a-z0-9]+)*$/, r.id);
  assert.ok(ids.includes('general.resume-after-usage-limits'));
  assert.ok(ids.includes('plugins.from-a-zip-file') && ids.includes('plugins.pack-into-a-zip') && ids.includes('memory.bring-in'));
  assert.deepEqual(
    ROWS.map((r) => `${r.section}\n${r.label}`),
    OPTIONS.map(([s, l]) => `${s}\n${l}`),
  );
});

test('each kind has what it needs', () => {
  const need = (r: Row, ok: unknown, what: string) => assert.ok(ok, `${r.id} (${r.kind}) needs ${what}`);
  const count: Record<string, number> = {};
  for (const r of ROWS) {
    count[r.kind] = (count[r.kind] ?? 0) + 1;
    switch (r.kind) {
      case 'switch':
        need(r, r.read && r.write, 'a read and a write');
        break;
      case 'choice':
        need(r, (r.choices?.length || r.load) && (r.read || r.device) && (r.write || r.device), 'its values, a read and a write');
        break;
      case 'number':
        need(r, r.range && r.range.min < r.range.max && r.read && r.write, 'a range, a read and a write');
        break;
      case 'text':
        need(r, r.read && (r.write || r.readonly), 'a read and a write (or to be read only)');
        break;
      case 'list':
        need(r, r.items && r.read && r.write && r.check, 'its items, a read, a write and a check');
        break;
      case 'secret':
        need(r, r.read && r.write, 'a read (set or not) and a write');
        break;
      case 'action':
        need(r, r.act?.run, 'a call');
        break;
      case 'page':
        need(r, r.note && !r.write && !r.act, 'a note and nothing to call');
        break;
      case 'device':
        need(r, r.device && r.note, 'its key and a note');
        break;
      case 'command':
        need(r, r.command?.startsWith('hydor ') && !r.write, 'the command that has it');
        break;
      default:
        assert.fail(`${r.id}: unknown kind ${r.kind}`);
    }
    if (r.kind !== 'device') need(r, !r.device, 'no device key');
    for (const c of r.choices ?? []) assert.ok(c.value && c.label, `${r.id}: a choice with no value or label`);
    if (r.write) need(r, r.write.apply || (r.write.endpoint?.startsWith('/api/') && r.write.body), 'an endpoint and a body, or apply');
  }
  const kinds: Kind[] = ['switch', 'choice', 'number', 'text', 'list', 'secret', 'action', 'page', 'device', 'command'];
  for (const k of kinds) assert.ok(count[k] > 0, `no option of kind ${k}`);
  console.log(`     ${ROWS.length} options: ${kinds.map((k) => `${count[k]} ${k}`).join(', ')}`);
});

test('the two chat settings of the terminal are devices of their own, the rest of the devices are not', () => {
  const dev = ROWS.filter((r) => r.kind === 'device');
  assert.deepEqual(
    dev
      .filter((r) => r.device!.terminal)
      .map((r) => r.id)
      .sort(),
    ['general.sending-while-an-agent-works', 'general.terminal-suggestions'],
  );
  for (const id of [
    'general.appearance',
    'general.language',
    'notifications.sound',
    'notifications.notify-this-device',
    'voice.dictation',
    'voice.language-you-speak',
    'voice.read-aloud',
    'security.sign-out-of-this-browser',
  ]) {
    assert.equal(ROWS.find((r) => r.id === id)?.kind, 'device', id);
  }
});

// ---- finding an option by what is typed --------------------------------------------------------------------------------------
test('options are found by id, by section and a start of the words, and by the words alone', () => {
  assert.equal(findRow('general.resume-after-usage-limits').id, 'general.resume-after-usage-limits');
  assert.equal(findRow('general.resume').id, 'general.resume-after-usage-limits');
  assert.equal(findRow('Resume after usage limits').id, 'general.resume-after-usage-limits');
  assert.equal(findRow('resume').id, 'general.resume-after-usage-limits');
  assert.equal(findRow('memory.tidy-up-a').id, 'memory.tidy-up-automatically');
  assert.equal(findRow('mem.profile-l').id, 'memory.profile-length');
  assert.equal(findRow('guidelines.for-every').id, 'guidelines.for-every-session');
  assert.throws(
    () => findRow('memory.tidy'),
    (e) => e instanceof UsageError && /matches 2 options: memory\.tidy-up-automatically, memory\.tidy-up-now/.test(e.message),
  );
  assert.throws(
    () => findRow('update-automatically'),
    (e) => e instanceof UsageError && /accounts\.update-automatically/.test(e.message) && /general\.update-automatically/.test(e.message),
  );
  assert.throws(
    () => findRow('nonsense.x'),
    (e) => e instanceof UsageError && /No section/.test(e.message),
  );
  assert.throws(
    () => findRow('general.zzz'),
    (e) => e instanceof UsageError && /No option/.test(e.message),
  );
  assert.equal(findSection('Chat apps')?.id, 'chat');
  assert.equal(findSection('sec')?.id, 'security');
  assert.equal(findSection('s'), null, 'two sections start with s');
  assert.equal(findSection('Images, video and audio')?.id, 'images');
});

// ---- reading -------------------------------------------------------------------------------------------------------------------
test('reading gives each option’s value from the endpoint the page reads', async () => {
  const { ctl, calls } = fake({
    '/api/app-settings': { autoResume: true, autoSwitch: false, apiCredit: true },
    '/api/retention': { on: true, days: 365 },
    '/api/sessions/resources': { limits: { memoryMb: 8192, cpus: 2 } },
    '/api/memory': { enabled: true, meaning: { on: false }, topK: 20, tidyOn: true, learnOn: false, profileWords: 1000 },
    '/api/memory/profile': { profile: { text: 'Hello' } },
    '/api/models/tiers': { team: { on: true, hard: false } },
    '/api/browser/settings': {
      settings: { enabled: true, headless: true, blockPrivate: true, screenshots: false, chrome: '', allow: ['a.com'], block: ['b.com'] },
      profiles: [{ id: 'p1', name: 'Work' }],
    },
    '/api/search/settings': {
      providers: [
        { id: 'naget', enabled: true, keyHint: 'sk…12' },
        { id: 'brave', enabled: false },
        { id: 'duckduckgo', enabled: true },
        { id: 'searxng', enabled: false, url: { value: 'https://s.example' } },
      ],
      defaultK: 20,
    },
    '/api/images/settings': { enabled: true, model: '', quick: 'x/y' },
    '/api/telegram': { connected: true, notify: true, agent: 'codex' },
    '/api/discord': { connected: false, notify: false, agent: 'claude' },
    '/api/slack': { connected: false, notify: false, agent: 'claude' },
  });
  const v = async (id: string) => readRow(ctl, findRow(id), new Map());
  assert.equal(await v('general.resume-after-usage-limits'), true);
  assert.equal(await v('accounts.switch-accounts-at-a-limit'), false);
  assert.equal(await v('general.delete-inactive-sessions'), '365');
  assert.deepEqual(await v('general.limit-each-session'), ['memory=8', 'cpus=2']);
  assert.equal(await v('memory.notes-each-agent-starts-with'), 20);
  assert.equal(await v('memory.your-profile'), 'Hello');
  assert.equal(await v('models.lead-with-helpers'), true);
  assert.equal(await v('browser.show-a-window'), false, 'Show a window is the opposite of headless');
  assert.deepEqual(await v('browser.sites'), ['allow:a.com', 'block:b.com']);
  assert.deepEqual(await v('browser.profiles'), ['Work']);
  assert.deepEqual(await v('search.providers'), ['naget', 'duckduckgo']);
  assert.equal(await v('search.searxng'), 'https://s.example');
  assert.equal(await v('search.results-per-search'), 20);
  assert.equal(await v('images.for-most-pictures-best'), 'auto');
  assert.equal(await v('images.for-simple-pictures-quick'), 'x/y');
  assert.equal(await v('chat.telegram'), true);
  assert.equal(await v('chat.new-sessions-use'), 'codex', 'the first connected chat app’s');
  assert.equal(await v('general.sending-while-an-agent-works'), 'join', 'a terminal setting reads from terminal.json');
  assert.equal(await v('general.appearance'), undefined, 'a browser’s own setting is not known here');
  assert.ok(
    calls.every((c) => c.method === 'GET'),
    'reading only reads',
  );
});

test('reading everything asks each endpoint once, and a failing one is that option’s error only', async () => {
  const { ctl, calls } = fake({ '/api/memory': new Error('Memory is broken') });
  const all = await readAll(ctl);
  assert.equal(all.size, ROWS.length);
  assert.equal(calls.filter((c) => c.path === '/api/memory').length, 1, 'a shared endpoint is read once');
  assert.equal(calls.filter((c) => c.path === '/api/browser/settings').length, 1);
  assert.equal(all.get('memory.memory')?.error, 'Memory is broken');
  assert.equal(all.get('memory.profile-length')?.error, 'Memory is broken');
  assert.equal(all.get('general.resume-after-usage-limits')?.error, undefined);
  assert.ok(calls.every((c) => c.method === 'GET'));
});

// ---- changing -----------------------------------------------------------------------------------------------------------------
test('changing a switch, a number, a choice, a text and a list calls the right endpoint with the right body', async () => {
  const set = async (id: string, v: string, answers: Record<string, unknown> = {}, o: Parameters<typeof setRow>[3] = {}) => {
    const f = fake(answers);
    const r = await setRow(f.ctl, findRow(id), v, o);
    return { ...r, writes: f.writes() };
  };
  let r = await set('general.resume-after-usage-limits', 'on');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/app-settings', body: { autoResume: true } }]);
  assert.equal(r.changed, true);
  r = await set('accounts.use-api-credit-at-a-limit', 'no');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/app-settings', body: { apiCredit: false } }]);
  r = await set('models.max-for-hard-problems', 'off');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/models/tiers', body: { team: { hard: false } } }]);
  r = await set('browser.show-a-window', 'on');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/browser/settings', body: { headless: false } }]);
  r = await set('memory.notes-each-agent-starts-with', '40');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/memory', body: { topK: 40 } }]);
  r = await set('children.swarm-size', '8');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/children/settings', body: { swarmSize: 8 } }]);
  r = await set('general.delete-inactive-sessions', 'never');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/retention', body: { on: false } }]);
  await assert.rejects(set('general.delete-inactive-sessions', '2 years'), UsageError, '“2 years” is not a value: the labels start with “After”');
  r = await set('general.delete-inactive-sessions', '730');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/retention', body: { on: true, days: 730 } }]);
  r = await set('general.limit-each-session', 'memory=8,cpus=4');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/sessions/limits', body: { memoryMb: 8192, cpus: 4 } }]);
  r = await set('general.limit-each-session', 'none');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/sessions/limits', body: { memoryMb: null, cpus: null } }]);
  r = await set('voice.speech-recognition-on-the-server', 'on this machine');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/voice', body: { engine: 'local' } }]);
  r = await set('images.use-the-graphics-card-for-videos', 'off');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/videos/gpu', body: { mode: 'off' } }]);
  r = await set('guidelines.for-every-session', 'Be brief.\nNo emoji.');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/guidelines', body: { global: 'Be brief.\nNo emoji.' } }]);
  r = await set('memory.your-profile', '');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/memory/profile', body: { text: '' } }]);
  r = await set('assistants.task-folders', '~/Work');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/assistants/settings', body: { taskRoot: '~/Work' } }]);
  r = await set('models.runtimes-and-endpoints', 'http://127.0.0.1:11434');
  assert.deepEqual(
    r.writes,
    [{ method: 'PUT', path: '/api/models/', body: { ollamaUrl: 'http://127.0.0.1:11434' } }].map((x) => ({ ...x, path: '/api/models' })),
  );
  r = await set('images.for-most-pictures-best', 'auto');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/images/settings', body: { model: '' } }]);
  r = await set('images.video-model', 'bytedance/seedance-2');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/videos/settings', body: { model: 'bytedance/seedance-2' } }]);
  r = await set('images.captions-in-the-library', 'claude');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/media/settings', body: { captions: { provider: 'claude' } } }]);
  r = await set('search.results-per-search', '30');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/search/settings', body: { defaultK: 30 } }]);
  r = await set('browser.sites', 'allow:example.com, block:ads.example');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/browser/settings', body: { allow: ['example.com'], block: ['ads.example'] } }]);
  r = await set('computer.computer-use', 'on');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/computer/settings', body: { enabled: true } }]);
  r = await set('custom.rounds-before-a-goal-pauses', '100');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/custom/settings', body: { goalRounds: 100 } }]);
  r = await set('skills.suggest-skills-that-fit', 'off');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/skillpack/settings', body: { suggest: false } }]);
  r = await set('general.update-automatically', 'on');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/update/auto', body: { on: true } }]);
  r = await set('general.start-when-this-computer-starts', 'off');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/startup', body: { on: false } }]);
  r = await set('general.tips', 'off');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/tips', body: { on: false } }]);
  r = await set('accounts.update-automatically', 'on');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/clients/auto', body: { on: true } }]);
  r = await set('assistants.clean-up-after-a-task', 'on');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/assistants/settings', body: { cleanUp: true } }]);
  r = await set('custom.sandbox-for-commands', 'on');
  assert.deepEqual(r.writes, [{ method: 'PUT', path: '/api/custom/settings', body: { sandbox: true } }]);
});

test('bad values are usage errors that say what the option takes, and write nothing', async () => {
  const bad = async (id: string, v: string, re: RegExp) => {
    const f = fake();
    await assert.rejects(setRow(f.ctl, findRow(id), v), (e) => e instanceof UsageError && re.test(e.message), `${id} ${v}`);
    assert.equal(f.writes().length, 0);
  };
  await bad('general.resume-after-usage-limits', 'maybe', /on or off/);
  await bad('memory.notes-each-agent-starts-with', '99', /from 1 to 50/);
  await bad('memory.notes-each-agent-starts-with', 'ten', /whole number/);
  await bad('general.limit-each-session', 'memory=3', /memory=3/);
  await bad('browser.sites', 'example.com', /allow: or block:/);
  await bad('search.providers', 'google', /not a search provider/);
  await bad('voice.speech-recognition-on-the-server', 'sometimes', /takes one of/);
  await bad('general.delete-inactive-sessions', '5', /30 to 3650/);
  await bad('chat.slack', 'xoxb-1', /both tokens/);
});

test('changes that take several calls, or need the state they replace, make them in order', async () => {
  // The search providers: the order first, then each provider whose on/off changed.
  let f = fake({
    '/api/search/settings': {
      providers: [
        { id: 'naget', enabled: true },
        { id: 'searxng', enabled: false },
        { id: 'brave', enabled: true },
        { id: 'duckduckgo', enabled: false },
      ],
    },
  });
  await setRow(f.ctl, findRow('search.providers'), 'duckduckgo,naget');
  assert.deepEqual(f.writes(), [
    { method: 'PUT', path: '/api/search/settings', body: { order: ['duckduckgo', 'naget'] } },
    { method: 'PUT', path: '/api/search/settings', body: { provider: { id: 'brave', enabled: false } } },
    { method: 'PUT', path: '/api/search/settings', body: { provider: { id: 'duckduckgo', enabled: true } } },
  ]);
  // Browser profiles: a profile left out is deleted, after a yes; a new one is made.
  const state = {
    '/api/browser/settings': {
      profiles: [
        { id: 'p1', name: 'Work' },
        { id: 'p2', name: 'Old' },
      ],
    },
  };
  f = fake(state);
  const asked: string[] = [];
  let r = await setRow(f.ctl, findRow('browser.profiles'), 'Work, New', { confirm: async (q) => (asked.push(q), true) });
  assert.deepEqual(asked, ['Delete the browser profile “Old” with its sign-ins?']);
  assert.deepEqual(f.writes(), [
    { method: 'DELETE', path: '/api/browser/profiles/p2', body: undefined },
    { method: 'POST', path: '/api/browser/profiles', body: { name: 'New' } },
  ]);
  assert.equal(r.changed, true);
  f = fake(state);
  r = await setRow(f.ctl, findRow('browser.profiles'), 'Work', { confirm: async () => false });
  assert.deepEqual([r.changed, r.say, f.writes()], [false, ['Left as it was.'], []]);
  f = fake(state);
  await setRow(f.ctl, findRow('browser.profiles'), 'Work, Old, More', { confirm: async () => assert.fail('adding profiles asks nothing') });
  assert.deepEqual(f.writes(), [{ method: 'POST', path: '/api/browser/profiles', body: { name: 'More' } }]);
  // A chat app option goes to the apps that are connected.
  f = fake({ '/api/telegram': { connected: true }, '/api/discord': { connected: false }, '/api/slack': { connected: true } });
  await setRow(f.ctl, findRow('chat.notices-from-every-session'), 'on');
  assert.deepEqual(f.writes(), [
    { method: 'PUT', path: '/api/telegram', body: { notify: true } },
    { method: 'PUT', path: '/api/slack', body: { notify: true } },
  ]);
  f = fake({});
  await setRow(f.ctl, findRow('chat.new-sessions-use'), 'codex');
  assert.deepEqual(
    f.writes().map((w) => w.path),
    ['/api/telegram', '/api/discord', '/api/slack'],
    'with none connected, all three',
  );
  assert.deepEqual(f.writes()[0].body, { agent: 'codex' });
});

test('a choice of models offers what the server lists, and takes any id besides', async () => {
  const f = fake({
    '/api/helper': {
      model: 'auto',
      options: [
        { value: 'auto', label: 'Automatic' },
        { value: 'openrouter/x', label: 'X' },
      ],
    },
    '/api/images/models?sort=picks': { models: [{ id: 'flux/2', label: 'Flux 2' }] },
  });
  assert.deepEqual(
    (await choicesOf(f.ctl, findRow('models.helper-model'))).map((c) => c.value),
    ['auto', 'openrouter/x'],
  );
  assert.equal(await parseValue(f.ctl, findRow('models.helper-model'), 'openrouter/x'), 'openrouter/x');
  await assert.rejects(parseValue(f.ctl, findRow('models.helper-model'), 'nope'), UsageError);
  assert.deepEqual(
    (await choicesOf(f.ctl, findRow('images.for-most-pictures-best'))).map((c) => c.value),
    ['auto', 'flux/2'],
  );
  assert.equal(await parseValue(f.ctl, findRow('images.for-most-pictures-best'), 'vendor/other-model'), 'vendor/other-model');
  assert.equal(await parseValue(f.ctl, findRow('images.for-most-pictures-best'), 'flux'), 'flux/2', 'a unique start');
});

// ---- secrets ---------------------------------------------------------------------------------------------------------------------
test('secrets are read as set or not, and a value typed is sent but never printed back', async () => {
  const KEY = 'sk-or-SECRET-VALUE-123';
  const f = fake({
    '/api/models': { openrouter: { keyHint: 'sk-or-…123', key: KEY }, hfTokenHint: 'hf_…abc', ollama: { url: 'http://x' } },
    '/api/search/settings': {
      providers: [
        { id: 'brave', enabled: true, keyHint: 'BSA…xy', key: KEY },
        { id: 'naget', enabled: false },
      ],
    },
    '/api/telegram': { connected: true, token: KEY },
  });
  for (const id of ['models.openrouter', 'models.hugging-face-token', 'search.brave-search', 'search.naget-search', 'chat.telegram']) {
    const row = findRow(id);
    assert.equal(row.kind, 'secret');
    const v = await readRow(f.ctl, row);
    assert.equal(typeof v, 'boolean', `${id} reads as set or not`);
    assert.ok(!JSON.stringify(jsonValue(row, v)).includes('SECRET') && !showValue(row, v).includes('SECRET'));
  }
  assert.equal(await readRow(f.ctl, findRow('models.openrouter')), true);
  assert.equal(await readRow(f.ctl, findRow('search.naget-search')), false);
  assert.equal(showValue(findRow('models.openrouter'), true), 'set');
  assert.equal(showValue(findRow('models.openrouter'), false), 'not set');
  assert.equal(showValue(findRow('models.openrouter'), undefined), 'not set');
  const all = await readAll(
    f.ctl,
    ROWS.filter((r) => r.kind === 'secret'),
  );
  assert.ok(!JSON.stringify([...all]).includes('SECRET'), 'the whole listing holds no secret');
  // Setting one: the key goes to the server and is not in what is said.
  const g = fake();
  const r = await setRow(g.ctl, findRow('models.openrouter'), KEY);
  assert.deepEqual(g.writes(), [{ method: 'PUT', path: '/api/models', body: { openrouterKey: KEY } }]);
  assert.ok(!JSON.stringify(r).includes('SECRET'), 'the answer does not repeat the key');
  assert.deepEqual(r.say, ['OpenRouter: set']);
  const h = fake();
  assert.deepEqual((await setRow(h.ctl, findRow('models.openrouter'), '')).say, ['OpenRouter: removed']);
  assert.deepEqual(h.writes()[0].body, { openrouterKey: null });
  const s = fake();
  await setRow(s.ctl, findRow('chat.slack'), 'xoxb-111 xapp-222');
  assert.deepEqual(s.writes(), [{ method: 'PUT', path: '/api/slack', body: { botToken: 'xoxb-111', appToken: 'xapp-222' } }]);
  const q = fake();
  await setRow(q.ctl, findRow('search.brave-search'), 'BSAkey');
  assert.deepEqual(q.writes(), [{ method: 'PUT', path: '/api/search/settings', body: { provider: { id: 'brave', key: 'BSAkey' } } }]);
});

// ---- actions, pages, commands and devices ----------------------------------------------------------------------------------------
test('buttons call their endpoint and say what happened', async () => {
  let f = fake();
  assert.deepEqual(await runAction(f.ctl, findRow('notifications.send-a-test')), ['Sent to 2 devices. It shows when the app is not in view.']);
  assert.deepEqual(f.writes(), [{ method: 'POST', path: '/api/push/test', body: undefined }]);
  f = fake();
  assert.deepEqual(await runAction(f.ctl, findRow('general.check-now')), ['This copy was not installed from git with an upstream, so it cannot check.']);
  assert.deepEqual(f.writes(), [{ method: 'POST', path: '/api/update-check', body: undefined }]);
  f = fake();
  await runAction(f.ctl, findRow('memory.tidy-up-now'));
  assert.deepEqual(f.writes(), [{ method: 'POST', path: '/api/memory/tidy', body: undefined }]);
  f = fake();
  const clear = findRow('memory.clear-all');
  assert.match(clear.act!.question!, /cannot be undone/);
  assert.deepEqual(await runAction(f.ctl, clear), ['Deleted 3 notes.']);
  assert.deepEqual(f.writes(), [{ method: 'DELETE', path: '/api/memory', body: { confirm: 'all' } }]);
  f = fake({ '/api/telegram': { connected: true }, '/api/discord': { connected: false }, '/api/slack': { connected: false } });
  assert.match((await runAction(f.ctl, findRow('chat.link-a-chat')))[0], /Telegram: .*ABC123/);
  assert.deepEqual(
    f.writes().map((w) => w.path),
    ['/api/telegram/pair'],
  );
  f = fake();
  assert.match((await runAction(f.ctl, findRow('chat.copy-manifest')))[0], /socket_mode_enabled/);
  f = fake();
  assert.deepEqual(await runAction(f.ctl, findRow('connect.new-token'), 'laptop'), ['The token (shown once): tok-new']);
  assert.deepEqual(f.writes(), [{ method: 'POST', path: '/api/mcp/tokens', body: { name: 'laptop' } }]);
  f = fake();
  await runAction(f.ctl, findRow('computer.accessibility'));
  assert.deepEqual(f.writes(), [{ method: 'POST', path: '/api/computer/permissions/accessibility', body: undefined }]);
  f = fake();
  await runAction(f.ctl, findRow('images.picture-tools-on-this-computer'));
  assert.deepEqual(f.writes(), [{ method: 'POST', path: '/api/images/local/setup', body: undefined }]);
  f = fake();
  assert.deepEqual((await runAction(f.ctl, findRow('mcp.check-connections'))).length, 2);
  assert.deepEqual(
    f.writes().map((w) => [w.path, w.body]),
    [
      ['/api/setup/mcp/status', { agent: 'claude' }],
      ['/api/setup/mcp/status', { agent: 'codex' }],
    ],
  );
  await assert.rejects(runAction(f.ctl, findRow('general.tips')), (e) => e instanceof UsageError && /hydor settings set general\.tips/.test(e.message));
  // Every button that asks a question asks one about what it does.
  for (const r of ROWS.filter((x) => x.kind === 'action' && x.act!.question)) assert.match(r.act!.question!, /\?$/, r.id);
});

test('page-only, command and browser-kept options say where to go, and change nothing', async () => {
  const f = fake();
  let r = await setRow(f.ctl, findRow('general.new-theme'), 'x', { base: 'http://127.0.0.1:8790' });
  assert.equal(r.changed, false);
  assert.match(r.say.join('\n'), /only on the page/);
  assert.match(r.say.join('\n'), /http:\/\/127\.0\.0\.1:8790\/settings\?s=general&find=New%20theme/);
  r = await setRow(f.ctl, findRow('signatures.new-signature'), 'x');
  assert.equal(r.changed, false);
  r = await setRow(f.ctl, findRow('mcp.add-server'), 'x');
  assert.match(r.say[0], /hydor mcp add/);
  r = await setRow(f.ctl, findRow('machines.add-a-machine'), 'x');
  assert.match(r.say[0], /hydor machines add/);
  r = await setRow(f.ctl, findRow('general.language'), 'el', { base: 'https://h.example' });
  assert.equal(r.changed, false);
  assert.match(r.say.join('\n'), /kept in each browser/);
  assert.match(r.say.join('\n'), /app on that device: https:\/\/h\.example\/settings\?s=general&find=Language/);
  r = await setRow(f.ctl, findRow('notifications.sound'), 'on');
  assert.match(r.say[0], /kept in each browser/);
  assert.equal(f.calls.length, 0, 'nothing was called');
  assert.equal(settingsAddress(findRow('memory.bring-in')), '/settings?s=memory&find=Bring%20in%E2%80%A6');
  assert.deepEqual(explain(findRow('general.tips')), []);
});

test('a sweep: every option that can be changed makes calls to its own endpoint', async () => {
  const sample = async (f: ReturnType<typeof fake>, r: Row): Promise<string> => {
    switch (r.kind) {
      case 'switch':
        return 'on';
      case 'number':
        return String(r.range!.min);
      case 'choice':
        return (await choicesOf(f.ctl, r))[0]?.value ?? 'auto';
      case 'list':
        return r.id === 'browser.sites' ? 'allow:a.com' : r.id === 'general.limit-each-session' ? 'cpus=2' : r.id === 'search.providers' ? 'duckduckgo' : 'Sample';
      case 'secret':
        return r.id === 'chat.slack' ? 'xoxb-1 xapp-2' : 'key-value';
      default:
        return 'sample text';
    }
  };
  const sections = new Set<string>();
  const kinds = new Set<string>();
  for (const r of ROWS.filter((x) => x.write && !x.device)) {
    const f = fake({
      '/api/search/settings': { providers: [{ id: 'naget', enabled: true }] },
      '/api/browser/settings': { profiles: [] },
      '/api/helper': { options: [{ value: 'auto', label: 'Automatic' }] },
    });
    const d = await setRow(f.ctl, r, await sample(f, r), { confirm: async () => true });
    assert.equal(d.changed, true, r.id);
    const w = f.writes();
    assert.ok(w.length >= 1, `${r.id} made no call`);
    for (const c of w) assert.match(c.path, /^\/api\/[a-z]/, `${r.id}: ${c.path}`);
    if (!r.write!.apply) {
      assert.equal(w.length, 1, r.id);
      assert.equal(w[0].path, r.write!.endpoint, r.id);
      assert.equal(w[0].method, r.write!.method ?? 'PUT', r.id);
    }
    sections.add(r.section);
    kinds.add(r.kind);
  }
  // Every section either has an option the terminal changes, or only pages, commands, devices and buttons.
  for (const [id] of SECTIONS) {
    const rs = rowsOf(id);
    assert.ok(sections.has(id) || rs.every((r) => r.kind === 'page' || r.kind === 'command' || r.kind === 'device' || r.kind === 'action' || !r.write), `section ${id}`);
  }
  for (const k of ['switch', 'choice', 'number', 'text', 'list', 'secret']) assert.ok(kinds.has(k), `no ${k} swept`);
});

// ---- the terminal's own settings --------------------------------------------------------------------------------------------------
test('the terminal chat’s own settings live in terminal.json, with defaults', async () => {
  const file = path.join(DATA, 'terminal.json');
  assert.deepEqual(terminalPrefs(), { enter: 'join', suggestions: true });
  assert.ok(!fs.existsSync(file));
  const f = fake();
  let r = await setRow(f.ctl, findRow('general.sending-while-an-agent-works'), 'wait for it');
  assert.equal(r.changed, true);
  assert.deepEqual(r.say, ['Sending while an agent works: Wait for it (kept for the terminal chat on this computer)']);
  assert.deepEqual(terminalPrefs(), { enter: 'queue', suggestions: true });
  r = await setRow(f.ctl, findRow('general.terminal-suggestions'), 'off');
  assert.deepEqual(terminalPrefs(), { enter: 'queue', suggestions: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { enter: 'queue', suggestions: false });
  assert.equal(f.calls.length, 0, 'no call to the server');
  assert.equal(await readRow(f.ctl, findRow('general.sending-while-an-agent-works')), 'queue');
  assert.equal(await readRow(f.ctl, findRow('general.terminal-suggestions')), false);
  await assert.rejects(setRow(f.ctl, findRow('general.sending-while-an-agent-works'), 'sometimes'), UsageError);
  await setRow(f.ctl, findRow('general.sending-while-an-agent-works'), 'join');
  assert.deepEqual(terminalPrefs(), { enter: 'join', suggestions: false });
  fs.writeFileSync(file, 'not json');
  assert.deepEqual(terminalPrefs(), { enter: 'join', suggestions: true }, 'a broken file gives the defaults');
  fs.rmSync(file);
});

// ---- run -------------------------------------------------------------------------------------------------------------------------

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
