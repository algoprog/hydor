// Checks for `hydor tasks` against a fake connection (test-kit.ts): list prints what it always did, show prints a
// task, new builds the right body from --every/--at/--cron/--once/--webhook/--watch-… and the agent options, edit sends
// the whole task with only the named fields changed, pause/resume/run/remove call the right routes (remove asks), runs
// lists the latest runs, and the words typed for times and days are read as they should be. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/tasks-test.ts && DATA_DIR=/tmp/hydor-test-tasks node dist/dev/tasks-test.js
import assert from 'node:assert/strict';
import { fakeConn, run } from './test-kit.ts';
import { UsageError } from './kit.ts';
import { parseDays, parseMinutes, parseWhen } from './tasks.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const brief = {
  id: 't1abc',
  name: 'Daily brief',
  prompt: 'Summarise **my** email.',
  schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] },
  agent: 'claude',
  cwd: '/home/u',
  model: 'opus',
  enabled: true,
  nextAt: Date.now() + 3600_000,
  lastAt: Date.now() - 60_000,
  lastStatus: 'ok',
  createdAt: 1,
  failLimit: 3,
};
const paused = {
  id: 't2def',
  name: 'Disk check',
  prompt: 'Check disks',
  schedule: { kind: 'every', minutes: 360 },
  agent: 'codex',
  cwd: '/home/u',
  enabled: false,
  pausedReason: '3 failures in a row',
  lastStatus: 'No such folder',
  createdAt: 2,
  extra: { capUsd: 2 },
};
const hook = {
  id: 't3ghi',
  name: 'PR review',
  prompt: 'Review {{body}}',
  schedule: { kind: 'webhook' },
  agent: 'acp',
  acpAgent: 'console',
  cwd: '/home/u',
  enabled: true,
  hookPath: '/hooks/abc123',
  createdAt: 3,
};
const routes = { 'GET /api/tasks': { tasks: [brief, paused, hook] }, 'GET /api/bootstrap': { defaultCwd: '/home/u/Hydor', home: '/home/u' } };
const saved = (b: any) => ({ task: { ...brief, ...b, id: b.id ?? 'tnew', nextAt: 5 } });

test('list prints a task a line, and --json what the API returned', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['tasks']);
  assert.match(t.out, /t1abc\s+Daily brief\s+Weekdays at 09:00\s+next /);
  assert.match(t.out, /last ok/);
  assert.match(t.out, /t2def\s+Disk check\s+Every 6 hours\s+paused: 3 failures in a row\s+last: No such folder/);
  assert.match(t.out, /When its webhook is called/);
  assert.deepEqual((await run(conn, ['tasks', 'list', '--json'])).json, [{ tasks: [brief, paused, hook] }]);
  assert.match((await run(fakeConn({ 'GET /api/tasks': { tasks: [] } }).conn, ['tasks'])).out, /No scheduled tasks yet/);
});

test('show prints the task, its prompt as Markdown, and the webhook address', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['tasks', 'show', 'daily']);
  assert.match(t.out, /Daily brief/);
  assert.match(t.out, /When\s+Weekdays at 09:00/);
  assert.match(t.out, /Runs\s+claude · opus/);
  assert.match(t.out, /Prompt\n/);
  assert.match(t.out, /Summarise/);
  const h = await run(conn, ['tasks', 'show', 'PR review']);
  assert.match(h.out, /Webhook\s+http:\/\/fake\/hooks\/abc123/);
  assert.match(h.out, /Runs\s+custom/);
  assert.match((await run(conn, ['tasks', 'show', 'disk'])).out, /Spending cap\s+\$2 a run/);
  assert.deepEqual((await run(conn, ['tasks', 'show', 't1', '--json'])).json, [brief]);
  await assert.rejects(run(conn, ['tasks', 'show', 'nope']), (e) => e instanceof UsageError && /No task “nope”/.test(e.message));
  await assert.rejects(run(conn, ['tasks', 'show']), (e) => e instanceof UsageError && /Say which task/.test(e.message));
});

test('new builds the body from the schedule and the options', async () => {
  const { conn, calls } = fakeConn({
    ...routes,
    'POST /api/tasks': (b: any) => saved(b),
    'GET /api/projects': { spaces: [{ id: 'sp1', name: 'Thesis', folder: '/home/u/thesis' }] },
    'GET /api/assistants': { assistants: [{ id: 'researcher', name: 'Researcher' }] },
  });
  const post = () => JSON.parse(JSON.stringify(calls.filter((c) => c.method === 'POST').at(-1)!.body)) as any;
  let t = await run(conn, ['tasks', 'new', '--at', '9:00', '--days', 'weekdays', 'Summarise', 'my', 'email']);
  assert.deepEqual(post(), { name: 'Summarise my email', prompt: 'Summarise my email', agent: 'claude', cwd: '/home/u/Hydor', schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] } });
  assert.match(t.out, /^Made “Summarise my email” \(tnew\): .*, next /);
  await run(conn, ['tasks', 'new', '--every', '90m', '--name', 'Disk', '--agent', 'codex', '--model', 'gpt-x', '--cwd', '/srv', '--budget', '1.5', '--no-memory', 'Check disks']);
  assert.deepEqual(post(), { name: 'Disk', prompt: 'Check disks', agent: 'codex', cwd: '/srv', model: 'gpt-x', schedule: { kind: 'every', minutes: 90 }, extra: { capUsd: 1.5, memory: false } });
  await run(conn, ['tasks', 'new', '--cron', '0 9 * * 1-5', '--agent', 'custom', '--project', 'thesis', '--as', 'research', 'Read papers']);
  assert.deepEqual(post(), {
    name: 'Read papers',
    prompt: 'Read papers',
    agent: 'acp',
    acpAgent: 'console',
    cwd: '/home/u/thesis',
    schedule: { kind: 'cron', expr: '0 9 * * 1-5' },
    extra: { space: 'sp1', assistant: 'researcher' },
  });
  await run(conn, ['tasks', 'new', '--agent', 'gemini', '--every', '2h', '--prompt', 'Hello']);
  assert.equal(post().agent, 'acp');
  assert.equal(post().acpAgent, 'gemini');
  const once = (await run(conn, ['tasks', 'new', '--once', 'in 2h', 'Remind me'])).code;
  assert.equal(once, 0);
  const at = post().schedule.at as number;
  assert.ok(Math.abs(at - (Date.now() + 2 * 3600_000)) < 5000);
  assert.deepEqual((await run(conn, ['tasks', 'new', '--every', '1d', '--json', 'x'])).json.length, 1);
  assert.equal(post().schedule.minutes, 1440);
  await run(conn, ['tasks', 'new', '--file', 'p.md', '--every', '1h'], { files: { 'p.md': 'From a file' } });
  assert.equal(post().prompt, 'From a file');
});

test('new takes webhooks and watchers, and says the webhook’s address', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'POST /api/tasks': (b: any) => ({ task: { ...hook, ...b, id: 'tw', hookPath: '/hooks/zzz' } }) });
  const post = () => JSON.parse(JSON.stringify(calls.filter((c) => c.method === 'POST').at(-1)!.body)) as any;
  const t = await run(conn, ['tasks', 'new', '--webhook', '--filter', 'body.action=opened', '--secret', 's3', '--header', 'x-sig', 'Review {{body}}']);
  assert.deepEqual(post().schedule, { kind: 'webhook', secret: 's3', header: 'x-sig', filter: { path: 'body.action', value: 'opened' } });
  assert.match(t.out, /Its webhook address: http:\/\/fake\/hooks\/zzz/);
  await run(conn, ['tasks', 'new', '--webhook', '--skip', 'headers.x-github-event=ping', 'x']);
  assert.deepEqual(post().schedule.filter, { path: 'headers.x-github-event', value: 'ping', skip: true });
  await run(conn, ['tasks', 'new', '--watch-folder', '/data/in', '--pattern', '*.pdf', '--check-every', '15m', 'New {{change}}']);
  assert.deepEqual(post().schedule, { kind: 'watch', minutes: 15, watch: { kind: 'folder', path: '/data/in', pattern: '*.pdf' } });
  await run(conn, ['tasks', 'new', '--watch-page', 'https://x.example', '--match', 'price', 'Changed']);
  assert.deepEqual(post().schedule, { kind: 'watch', minutes: 60, watch: { kind: 'page', url: 'https://x.example', match: 'price' } });
  await run(conn, ['tasks', 'new', '--watch-feed', 'https://x.example/feed', 'News']);
  assert.equal(post().schedule.watch.kind, 'feed');
});

test('new refuses what does not make sense, and calls nothing', async () => {
  const { conn, calls } = fakeConn(routes);
  const bad = async (words: string[], re: RegExp) => assert.rejects(run(conn, ['tasks', 'new', ...words]), (e) => e instanceof UsageError && re.test((e as Error).message), words.join(' '));
  await bad(['Do it'], /Say when it runs/);
  await bad(['--every', '1h', '--at', '09:00', 'x'], /cannot go together/);
  await bad(['--every', '2 minutes', 'x'], /5 minutes or more/);
  await bad(['--every', 'soon', 'x'], /minutes, hours or days/);
  await bad(['--at', '25:00', 'x'], /time of day/);
  await bad(['--every', '1h', '--days', 'mon', 'x'], /--days goes with --at/);
  await bad(['--once', 'yesterday', 'x'], /--once takes a moment/);
  await bad(['--once', '2020-01-01 09:00', 'x'], /has passed/);
  await bad(['--every', '1h'], /Say what the agent is asked/);
  await bad(['--webhook', '--filter', 'nothing', 'x'], /path=value/);
  await bad(['--every', '1h', '--budget', 'lots', 'x'], /--budget takes a number/);
  await bad(['--every', '1h', '--fail-limit', '99', 'x'], /0 to 50/);
  await bad(['--every', '1h', '--input', '{}', 'x'], /goes with --app/);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('edit sends the whole task with only what was named changed; pause and resume flip enabled', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'POST /api/tasks': (b: any) => saved(b) });
  const post = () => JSON.parse(JSON.stringify(calls.filter((c) => c.method === 'POST').at(-1)!.body)) as any;
  const t = await run(conn, ['tasks', 'edit', 'daily', '--at', '08:30']);
  assert.deepEqual(post(), {
    id: 't1abc',
    enabled: true,
    name: 'Daily brief',
    prompt: 'Summarise **my** email.',
    schedule: { kind: 'daily', time: '08:30' },
    agent: 'claude',
    cwd: '/home/u',
    model: 'opus',
    failLimit: 3,
  });
  assert.match(t.out, /^Changed “Daily brief”/);
  await run(conn, ['tasks', 'edit', 'daily', '--model', 'sonnet', '--budget', '2']);
  assert.equal(post().model, 'sonnet');
  assert.deepEqual(post().extra, { capUsd: 2 });
  assert.equal(post().schedule.time, '09:00', 'the schedule stays');
  await run(conn, ['tasks', 'edit', 'daily', 'A', 'new', 'prompt']);
  assert.equal(post().prompt, 'A new prompt');
  await run(conn, ['tasks', 'edit', 'disk', '--agent', 'claude']);
  assert.equal(post().agent, 'claude');
  assert.equal(post().acpAgent, undefined);
  await run(conn, ['tasks', 'edit', 'daily', '--file', 'p.md'], { files: { 'p.md': 'File prompt' } });
  assert.equal(post().prompt, 'File prompt');
  await assert.rejects(run(conn, ['tasks', 'edit', 'daily']), (e) => e instanceof UsageError && /Say what to change/.test((e as Error).message));
  const ed = await run(conn, ['tasks', 'edit', 'daily'], { interactive: true, edit: 'Edited in the editor' });
  assert.deepEqual(ed.edited, ['Summarise **my** email.']);
  assert.equal(post().prompt, 'Edited in the editor');
  const same = await run(conn, ['tasks', 'edit', 'daily'], { interactive: true });
  assert.equal(same.out, 'Left as it was.\n');
  const p = await run(conn, ['tasks', 'pause', 'daily']);
  assert.equal(post().enabled, false);
  assert.equal(p.out, 'Paused “Daily brief”.\n');
  const r = await run(conn, ['tasks', 'resume', 'disk']);
  assert.equal(post().enabled, true);
  assert.equal(post().name, 'Disk check');
  assert.match(r.out, /“Disk check” is on/);
});

test('run, runs and remove call their routes; remove asks first', async () => {
  const runs = [
    { id: 'r1', taskId: 't1abc', trigger: 'schedule', startedAt: Date.now() - 3600_000, status: 'done', summary: 'Sent the digest', costUsd: 0.12, reply: 'All **done**.', hasInput: false },
    { id: 'r2', taskId: 't1abc', trigger: 'manual', startedAt: Date.now() - 86400_000, status: 'error', error: 'No such folder', hasInput: false },
  ];
  const { conn, calls } = fakeConn({ ...routes, 'POST /api/tasks/t1abc/run': { key: 'claude:abcd1234' }, 'GET /api/automations/tasks/t1abc/runs': { runs }, 'DELETE /api/tasks/t1abc': { ok: true } });
  assert.equal((await run(conn, ['tasks', 'run', 'daily'])).out, 'Started “Daily brief”: http://fake/s/claude:abcd1234\n');
  const t = await run(conn, ['tasks', 'runs', 'daily']);
  assert.match(t.out, /done\s+schedule\s+\$0\.12\s+Sent the digest/);
  assert.match(t.out, /error\s+manual\s+No such folder/);
  assert.match((await run(conn, ['tasks', 'runs', 'daily', '--reply'])).out, /Latest reply\n.*All done/s);
  assert.match((await run(conn, ['tasks', 'runs', 'daily', '-n', '1'])).out, /… 1 more/);
  assert.deepEqual((await run(conn, ['tasks', 'runs', 'daily', '--json'])).json, [{ runs }]);
  await assert.rejects(run(conn, ['tasks', 'remove', 'daily']), (e) => e instanceof UsageError && /add -y/.test((e as Error).message));
  const no = await run(conn, ['tasks', 'remove', 'daily'], { interactive: true, confirm: false });
  assert.deepEqual(no.asked, ['Remove “Daily brief”?']);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  assert.match((await run(conn, ['tasks', 'rm', 'daily', '-y'])).out, /^Removed “Daily brief”/);
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 1);
  assert.match((await run(fakeConn({ ...routes, 'GET /api/automations/tasks/t2def/runs': { runs: [] } }).conn, ['tasks', 'runs', 'disk'])).out, /has not run yet/);
});

test('times, days and intervals are read as people write them', () => {
  assert.equal(parseMinutes('30'), 30);
  assert.equal(parseMinutes('30m'), 30);
  assert.equal(parseMinutes('2h'), 120);
  assert.equal(parseMinutes('1d'), 1440);
  assert.equal(parseMinutes('1h30m'), 90);
  assert.equal(parseMinutes('45 min'), 45);
  assert.throws(() => parseMinutes('soon'), UsageError);
  assert.throws(() => parseMinutes(''), UsageError);
  assert.deepEqual(parseDays('weekdays'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseDays('weekends'), [0, 6]);
  assert.deepEqual(parseDays('mon,wed,fri'), [1, 3, 5]);
  assert.deepEqual(parseDays('Sun Sat'), [0, 6]);
  assert.deepEqual(parseDays('0,6'), [0, 6]);
  assert.equal(parseDays('every'), undefined);
  assert.throws(() => parseDays('someday'), UsageError);
  const now = new Date(2026, 10, 12, 10, 0).getTime();
  assert.equal(parseWhen('2026-11-20 09:00', now), new Date(2026, 10, 20, 9, 0).getTime());
  assert.equal(parseWhen('2026-11-20', now), new Date(2026, 10, 20, 9, 0).getTime(), 'a date alone is 9:00');
  assert.equal(parseWhen('tomorrow 9:00', now), new Date(2026, 10, 13, 9, 0).getTime());
  assert.equal(parseWhen('today 17:30', now), new Date(2026, 10, 12, 17, 30).getTime());
  assert.equal(parseWhen('09:00', now), new Date(2026, 10, 13, 9, 0).getTime(), 'the next 09:00');
  assert.equal(parseWhen('11:00', now), new Date(2026, 10, 12, 11, 0).getTime());
  assert.equal(parseWhen('in 90m', now), now + 90 * 60_000);
  assert.throws(() => parseWhen('today 8:00', now), /has passed/);
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
