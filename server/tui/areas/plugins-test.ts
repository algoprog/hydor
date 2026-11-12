// Checks for `hydor plugins`: Hydor's plugins listed, shown, turned on and off, added (built in, Git, folder, .zip: a job followed to its end) and removed; Claude Code's and Codex's own.
// Against a fake connection (test-kit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/plugins-test.ts && DATA_DIR=/tmp/hydor-test-plugins node dist/dev/plugins-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from '../client.ts';
import { UsageError } from './kit.ts';
import { atWidths, fakeConn, run, type Answer } from './test-kit.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const plug = (name: string, extra: object = {}) => ({
  name,
  title: name.replace(/^./, (c) => c.toUpperCase()),
  version: '1.0.0',
  description: `The ${name} plugin`,
  source: { kind: 'builtin' },
  installed: true,
  enabled: true,
  setup: { state: 'ready' },
  skills: [{ name: 'a-skill', description: 'd' }],
  servers: [{ name: 'srv', type: 'stdio', command: 'x' }],
  instructions: false,
  ...extra,
});
const papers = plug('papers', {
  dependents: ['reviewer'],
  skills: [
    { name: 'cite', description: '' },
    { name: 'summarize', description: '' },
  ],
  readme: '# Papers\n\nReads **papers**.',
  root: '/data/plugins/papers',
  author: { name: 'Hydor' },
});
const reviewer = plug('reviewer', { enabled: false, source: { kind: 'git', url: 'https://github.com/o/reviewer', ref: 'v1' } });
const broken = plug('broken', { setup: { state: 'failed', error: 'pip failed' } });
const web = plug('web-tools', { title: 'Web tools', installed: false, enabled: false, setup: { state: 'none' } });

const job = (state: string, steps: { label: string; state: string }[] = [], extra: object = {}) => ({ id: 'j1', plugin: 'web-tools', action: 'install', state, steps, ...extra });
const claude = {
  installed: [
    { id: 'github@official', name: 'github', description: 'GitHub tools', marketplace: 'official', version: '2', enabled: true, installed: true },
    { id: 'lint@official', name: 'lint', marketplace: 'official', enabled: false, installed: true },
  ],
  available: [{ id: 'jira@official', name: 'jira', description: 'Jira', marketplace: 'official', installed: false }],
  marketplaces: [],
  total: 9,
};
const codex = { installed: [{ id: 'notion@openai', name: 'notion', marketplace: 'openai', installed: true }], available: [], marketplaces: [], total: 0 };

const routes = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({
  'GET /api/plugins': { installed: [papers, reviewer, broken], available: [web], jobs: [], folders: {} },
  'GET /api/plugins/papers': papers,
  'GET /api/setup/plugins': claude,
  'GET /api/setup/codex-plugins': codex,
  ...extra,
});
const refused = (p: Promise<unknown>, re: RegExp, kind: typeof UsageError | typeof ApiError = UsageError) => assert.rejects(p, (e: Error) => e instanceof kind && re.test(e.message), String(re));

test('list: Hydor’s with their state and the built-in ones to add; Claude Code’s and Codex’s own with --agent', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['plugins']);
  assert.deepEqual(calls, [{ method: 'GET', path: '/api/plugins' }]);
  assert.match(r.out, /^ *PLUGIN +ID +VERSION +STATE/m, 'the name and the id are columns of their own');
  assert.match(r.out, /^● +Papers +papers +1\.0\.0 +on +The papers plugin$/m);
  assert.match(r.out, /^· +Reviewer +reviewer +1\.0\.0 +off/m);
  assert.match(r.out, /^✗ +Broken +broken +1\.0\.0 +setup failed/m);
  assert.match(r.out, /^\+ +Web tools +web-tools +1\.0\.0 +not added/m);
  assert.deepEqual((await run(fakeConn(routes()).conn, ['plugins', '--json'])).json, [routes()['GET /api/plugins']]);
  const c = fakeConn(routes());
  const cl = await run(c.conn, ['plugins', '--agent', 'claude']);
  assert.deepEqual(c.calls, [{ method: 'GET', path: '/api/setup/plugins' }]);
  assert.match(cl.out, /^● +github +official +2 +GitHub tools$/m);
  assert.match(cl.out, /^· +lint +official/m);
  assert.doesNotMatch(cl.out, /jira/);
  const s = fakeConn(routes({ 'GET /api/setup/plugins?q=ji&limit=5': claude }));
  const found = await run(s.conn, ['plugins', '--agent', 'claude', '--search', 'ji', '-n', '5']);
  assert.match(found.out, /^\+ +jira +official +Jira$/m);
  assert.match(found.out, /… 8 more that fit/);
  assert.match((await run(fakeConn(routes()).conn, ['plugins', '--agent', 'codex'])).out, /^● +notion +openai/m);
  await refused(run(conn, ['plugins', '--agent', 'x']), /--agent takes hydor, claude, codex/);
});

test('show: Hydor’s (from its own route, README with --readme) and an agent’s own', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['plugins', 'show', 'papers']);
  assert.equal(calls.at(-1)?.path, '/api/plugins/papers');
  assert.match(r.out, /^Papers 1\.0\.0$/m);
  assert.match(r.out, /^State +on$/m);
  assert.match(r.out, /^From +built in$/m);
  assert.match(r.out, /^By +Hydor$/m);
  assert.match(r.out, /^Skills +cite, summarize$/m);
  assert.match(r.out, /^Needed by +reviewer$/m);
  assert.doesNotMatch(r.out, /Reads papers/);
  assert.match((await run(conn, ['plugins', 'show', 'Papers', '--readme'])).out, /Reads papers\./);
  assert.match((await run(conn, ['plugins', 'show', 'github', '--agent', 'claude'])).out, /^Id +github@official$/m);
  assert.deepEqual((await run(conn, ['plugins', 'show', 'papers', '--json'])).json, [papers]);
  await refused(run(conn, ['plugins', 'show', 'zzz']), /^No plugin “zzz”: hydor plugins lists them$/);
  const none = await run(fakeConn(routes({ 'GET /api/plugins/web-tools': web })).conn, ['plugins', 'show', 'web']);
  assert.match(none.out, /^State +not added$/m);
});

test('on and off: Hydor’s with what goes with it; Claude Code’s own; Codex’s have none', async () => {
  const { conn, calls } = fakeConn(
    routes({
      'POST /api/plugins/reviewer/enable': { on: ['papers', 'reviewer'] },
      'POST /api/plugins/papers/disable': { off: ['reviewer', 'papers'] },
      'POST /api/setup/plugins/enable': { ok: true },
      'POST /api/setup/plugins/disable': { ok: false, output: 'not installed' },
    }),
  );
  let r = await run(conn, ['plugins', 'on', 'reviewer']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/plugins/reviewer/enable' });
  assert.match(r.out, /^“Reviewer” is on, with papers\.$/m);
  r = await run(conn, ['plugins', 'off', 'papers']);
  assert.match(r.out, /^“Papers” is off, with reviewer\.$/m);
  r = await run(conn, ['plugins', 'on', 'lint', '--agent', 'claude']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/setup/plugins/enable', body: { id: 'lint@official' } });
  assert.match(r.out, /^“lint” is on for Claude Code\.$/m);
  await refused(run(conn, ['plugins', 'off', 'lint', '--agent', 'claude']), /not installed/, ApiError);
  await refused(run(conn, ['plugins', 'on', 'notion', '--agent', 'codex']), /Codex’s plugins have no on and off here/);
});

test('add: a built-in one by name, followed as a job', async () => {
  let polls = 0;
  const { conn, calls } = fakeConn(
    routes({
      'POST /api/plugins/install': { job: job('running', [{ label: 'Download', state: 'running' }]) },
      'GET /api/plugins/jobs/j1': () =>
        ++polls < 2
          ? {
              job: job('running', [
                { label: 'Download', state: 'done' },
                { label: 'Packages', state: 'running' },
              ]),
            }
          : {
              job: job('done', [
                { label: 'Download', state: 'done' },
                { label: 'Packages', state: 'done' },
              ]),
            },
    }),
  );
  await refused(run(conn, ['plugins', 'add', 'web-tools']), /nobody to ask here, so add -y/);
  const r = await run(conn, ['plugins', 'add', 'web-tools', '-y']);
  assert.deepEqual(
    calls.find((c) => c.path === '/api/plugins/install'),
    { method: 'POST', path: '/api/plugins/install', body: { name: 'web-tools' } },
  );
  assert.match(r.out, /^✓ Download$/m);
  assert.match(r.out, /^✓ Packages$/m);
  assert.match(r.out, /^Added “Web tools”\.$/m);
  assert.equal((r.out.match(/✓ Download/g) ?? []).length, 1, 'each step once');
  const no = await run(conn, ['plugins', 'add', 'web-tools'], { interactive: true, confirm: false });
  assert.deepEqual(no.asked, ['Add “Web tools”?']);
  assert.match(no.out, /^Not added\.$/m);
});

test('add: a Git repository, a folder, a .zip are looked at first; what it brings is shown; a failed job is an error', async () => {
  const dir = path.join(DATA, 'plugins-add');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'mine'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'pack.zip'), 'zipdata');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  const looked = { token: 'tok1', view: reviewer, brings: ['papers'], unavailable: [] as string[], replaces: undefined as string | undefined };
  const t = fakeConn(routes({ 'POST /api/plugins/inspect': looked, 'POST /api/plugins/install': { job: job('done', [{ label: 'Set up', state: 'done' }]) } }));
  const r = await run(t.conn, ['plugins', 'add', 'o/reviewer', '--ref', 'v1', '--subdir', 'plugin', '-y']);
  assert.deepEqual(t.calls.find((c) => c.path === '/api/plugins/inspect')?.body, { url: 'o/reviewer', ref: 'v1', subdir: 'plugin' });
  assert.deepEqual(t.calls.find((c) => c.path === '/api/plugins/install')?.body, { token: 'tok1' });
  assert.match(r.out, /^Reviewer 1\.0\.0 — The reviewer plugin$/m);
  assert.match(r.out, /^Needs added first +papers$/m);
  assert.match(r.out, /^Added “Reviewer” and turned it on\.$/m);
  await run(t.conn, ['plugins', 'add', path.join(dir, 'mine'), '-y']);
  assert.deepEqual(t.calls.filter((c) => c.path === '/api/plugins/inspect').at(-1)?.body, { path: path.join(dir, 'mine') });
  await run(t.conn, ['plugins', 'add', path.join(dir, 'pack.zip'), '-y']);
  assert.deepEqual(t.calls.filter((c) => c.path === '/api/plugins/inspect').at(-1)?.body, { file: { name: 'pack.zip', data: Buffer.from('zipdata').toString('base64') } });
  await refused(run(t.conn, ['plugins', 'add', path.join(dir, 'notes.txt'), '-y']), /is no \.zip: give a \.zip, a folder, a Git repository or a built-in plugin’s name/);
  await refused(run(t.conn, ['plugins', 'add', './nowhere', '-y']), /^Cannot find \.\/nowhere$/);
  const need = fakeConn(routes({ 'POST /api/plugins/inspect': { ...looked, unavailable: ['ghost'] } }));
  await refused(run(need.conn, ['plugins', 'add', 'o/r', '-y']), /needs plugins nobody has \(ghost\), so it cannot be added/);
  const bad = fakeConn(routes({ 'POST /api/plugins/inspect': new ApiError(400, 'Not a plugin: no plugin.json') }));
  await refused(run(bad.conn, ['plugins', 'add', 'o/r', '-y']), /^Not a plugin: no plugin\.json$/, ApiError);
  const failed = fakeConn(
    routes({ 'POST /api/plugins/inspect': looked, 'POST /api/plugins/install': { job: job('failed', [{ label: 'Packages', state: 'failed' }], { error: 'pip failed', log: 'line1\nline2' }) } }),
  );
  await refused(run(failed.conn, ['plugins', 'add', 'o/r', '-y']), /^Adding “Reviewer” failed: pip failed\nline1\nline2$/, ApiError);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('add: Claude Code’s and Codex’s own by id', async () => {
  const { conn, calls } = fakeConn(
    routes({
      'POST /api/setup/plugins/install': { ok: true },
      'POST /api/setup/codex-plugins/add': { ok: true },
      'POST /api/setup/codex-plugins/remove': { ok: true },
      'POST /api/setup/plugins/uninstall': { ok: false, output: 'in use' },
    }),
  );
  const r = await run(conn, ['plugins', 'add', 'jira@official', '--agent', 'claude', '--scope', 'project']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/setup/plugins/install', body: { id: 'jira@official', scope: 'project' } });
  assert.match(r.out, /^Added “jira@official” to Claude Code\.$/m);
  await run(conn, ['plugins', 'add', 'notion@openai', '--agent', 'codex']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/setup/codex-plugins/add', body: { id: 'notion@openai' } });
  await refused(run(conn, ['plugins', 'add', 'jira', '--agent', 'claude']), /Give its id as the marketplaces list it, name@marketplace/);
  await run(conn, ['plugins', 'remove', 'notion', '--agent', 'codex', '-y']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/setup/codex-plugins/remove', body: { id: 'notion@openai' } });
  await refused(run(conn, ['plugins', 'remove', 'github', '--agent', 'claude', '-y']), /in use/, ApiError);
});

test('remove: says what goes with it, asks, --keep-data', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/plugins/papers/remove': { removed: ['reviewer', 'papers'] } }));
  await refused(run(conn, ['plugins', 'remove', 'papers']), /nobody to ask here, so add -y/);
  let r = await run(conn, ['plugins', 'remove', 'papers'], { interactive: true, confirm: false });
  assert.deepEqual(r.asked, ['Remove “Papers” and reviewer, which need it?']);
  assert.match(r.out, /^Not removed\.$/m);
  assert.ok(!calls.some((c) => c.path.endsWith('/remove')));
  r = await run(conn, ['plugins', 'rm', 'papers', '-y']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/plugins/papers/remove', body: {} });
  assert.match(r.out, /^Removed reviewer, papers\.$/m);
  await run(conn, ['plugins', 'remove', 'papers', '-y', '--keep-data']);
  assert.deepEqual(calls.at(-1)?.body, { keepData: true });
  assert.deepEqual((await run(conn, ['plugins', 'remove', 'papers', '-y', '--json'])).json, [{ removed: ['reviewer', 'papers'] }]);
});

test('list on a narrow terminal: the description goes whole, then the id, before the name is cut', async () => {
  const w = await atWidths(fakeConn(routes()).conn, ['plugins']);
  for (const [n, lines] of Object.entries(w)) assert.ok(lines.every((l) => [...l].length <= Number(n) - 1), `${n} columns`);
  assert.match(w[100][1], /^● +Papers +papers +1\.0\.0 +on +The papers plugin$/);
  assert.match(w[60][0], /^ +PLUGIN +ID +VERSION +STATE$/, 'the description went whole');
  assert.match(w[40][4], /^\+ +Web tools +1\.0\.0 +not added$/, 'the id went too, not the name');
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
