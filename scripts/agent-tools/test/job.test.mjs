// Tests for bin/job, against a small stand-in for the app's /agent/jobs routes (shared/jobs.ts).
// Run: node --test scripts/agent-tools/test/job.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const BIN = path.resolve(import.meta.dirname, '../bin/job');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'job-test-'));
const servers = [];
after(() => {
  for (const s of servers) { s.closeAllConnections(); s.close(); }
  fs.rmSync(TMP, { recursive: true, force: true });
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const tmp = (name) => path.join(TMP, `${++seq}-${name}`);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(what, ok, ms = 5000) {
  const end = Date.now() + ms;
  while (!ok()) {
    assert.ok(Date.now() < end, `timed out waiting for ${what}`);
    await delay(20);
  }
}

/**
 * The stand-in. Each route's answer can be set; one given as a function gets the request and how often it was asked.
 * An answer is [status, body], or 'drop' to close the connection without one.
 */
async function app(routes = {}) {
  const seen = [];
  const counts = {};
  const log = tmp('logs/deep/j-1.log');
  const answers = {
    register: [200, { id: 'j-1', log, start: true }],
    go: [200, { start: true }],
    report: [200, { ok: true }],
    list: [200, { running: [], queued: [], ended: [], at: Date.now() }],
    job: [404, { error: 'No such job' }],
    stop: [200, { ok: true }],
    ...routes,
  };
  const server = http.createServer((req, res) => {
    let text = '';
    req.on('data', (d) => { text += d; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const parts = url.pathname.replace(/^\/agent\/jobs\/?/, '').split('/').filter(Boolean);
      const route = !parts.length ? (req.method === 'POST' ? 'register' : 'list')
        : parts[1] === 'go' ? 'go' : parts[1] === 'stop' ? 'stop' : req.method === 'POST' ? 'report' : 'job';
      const r = { route, method: req.method, id: parts[0] && decodeURIComponent(parts[0]), query: url.search, auth: req.headers.authorization, body: text ? JSON.parse(text) : undefined };
      seen.push(r);
      counts[route] = (counts[route] ?? 0) + 1;
      const a = typeof answers[route] === 'function' ? answers[route](r, counts[route]) : answers[route];
      if (a === 'drop') return void req.socket.destroy();
      res.writeHead(a[0], { 'content-type': 'application/json' });
      res.end(typeof a[1] === 'string' ? a[1] : JSON.stringify(a[1]));
    });
  });
  servers.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    log,
    seen,
    reports: () => seen.filter((r) => r.route === 'report').map((r) => r.body),
    env: { HYDOR_JOBS_URL: `http://127.0.0.1:${server.address().port}/agent/jobs`, HYDOR_JOBS_TOKEN: 'r1.sig' },
  };
}

// Start job; returns { child, done } where done resolves {code, signal, stdout, stderr}.
function start(args, { env = {}, cwd = TMP, input } = {}) {
  const base = { ...process.env, JOB_TEST_SPEEDUP: '50' };
  delete base.HYDOR_JOBS_URL;
  delete base.HYDOR_JOBS_TOKEN;
  delete base.PYTHONUNBUFFERED;
  const child = spawn(process.execPath, [BIN, ...args], { env: { ...base, ...env }, cwd, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  if (input !== undefined) child.stdin.end(input);
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const done = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr })));
  return { child, done, err: () => stderr, out: () => stdout };
}
const run = (args, opts) => start(args, opts).done;

// ---------------------------------------------------------------- run
test('run: registers, passes the output through, writes the log, reports running and done', async () => {
  const a = await app();
  const p = start(['run', '--name', 'Count to two', '--eta', '45', '--after', 'j-0', '--after', 'Build the index', '--queue', 'gpu', '--progress', '(\\d+)/(\\d+)',
    '--', 'sh', '-c', 'echo "step 1/2"; echo oops >&2; echo "step 2/2"'], { env: a.env });
  const r = await p.done;
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'step 1/2\nstep 2/2\n');
  assert.match(r.stderr, /^job j-1 started: Count to two$/m);
  assert.match(r.stderr, /^oops$/m);
  const reg = a.seen[0];
  assert.equal(reg.auth, 'Bearer r1.sig');
  assert.deepEqual(reg.body, {
    name: 'Count to two',
    command: `sh -c 'echo "step 1/2"; echo oops >&2; echo "step 2/2"'`,
    cwd: fs.realpathSync(TMP),
    pid: p.child.pid,
    etaMs: 45 * 60_000,
    after: ['j-0', 'Build the index'],
    queue: 'gpu',
    progress: '(\\d+)/(\\d+)',
  });
  const [running, ended] = a.reports();
  assert.equal(a.reports().length, 2);
  assert.equal(running.state, 'running');
  assert.ok(running.pid > 0 && running.pid !== p.child.pid);
  assert.deepEqual(ended, { state: 'done', exitCode: 0 });
  assert.ok(a.seen.every((x) => x.auth === 'Bearer r1.sig'));
  const log = fs.readFileSync(a.log, 'utf8');
  for (const line of ['step 1/2', 'oops', 'step 2/2']) assert.match(log, new RegExp(`^${line}$`, 'm'));
});

test('run: a failing command keeps its exit code, which is reported', async () => {
  const a = await app();
  const r = await run(['run', '--', 'sh', '-c', 'exit 7'], { env: a.env });
  assert.equal(r.code, 7);
  assert.deepEqual(a.reports().at(-1), { state: 'failed', exitCode: 7 });
});

test('run: one argument of shell syntax runs with sh -c and is the command as written; a long one gives a short name', async () => {
  const a = await app();
  const line = `echo one && echo "two words" | tr a-z A-Z # ${'x'.repeat(80)}`;
  const r = await run(['run', '--', line], { env: a.env });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'one\nTWO WORDS\n');
  assert.equal(a.seen[0].body.command, line);
  assert.equal(a.seen[0].body.name.length, 60);
  assert.ok(a.seen[0].body.name.startsWith('echo one && echo') && a.seen[0].body.name.endsWith('…'));
  assert.deepEqual(Object.keys(a.seen[0].body).sort(), ['command', 'cwd', 'name', 'pid'], 'nothing that was not asked for');
});

test('run: a program whose path has a space runs as it is', async () => {
  if (process.platform === 'win32') return;
  const dir = tmp('a dir');
  fs.mkdirSync(dir);
  const prog = path.join(dir, 'my prog');
  fs.writeFileSync(prog, '#!/bin/sh\necho "ran $#"\n', { mode: 0o755 });
  const r = await run(['run', '--', prog]);
  assert.equal(r.stdout, 'ran 0\n', r.stderr);
});

test('run: --eta takes minutes as a plain number, or a duration', async () => {
  for (const [v, ms] of [['90s', 90_000], ['45m', 2_700_000], ['2h', 7_200_000], ['1h30m', 5_400_000], ['1.5', 90_000]]) {
    const a = await app();
    await run(['run', '--eta', v, '--', 'true'], { env: a.env });
    assert.equal(a.seen[0].body.etaMs, ms, v);
  }
});

test('run: what the command reads comes through, and Python is told not to hold its output back', async () => {
  const a = await app();
  const r = await run(['run', '--', 'sh', '-c', 'cat; echo "u=$PYTHONUNBUFFERED"'], { env: a.env, input: 'from stdin\n' });
  assert.equal(r.stdout, 'from stdin\nu=1\n', r.stderr);
  const kept = await run(['run', '--', 'sh', '-c', 'echo "u=$PYTHONUNBUFFERED"'], { env: { ...a.env, PYTHONUNBUFFERED: 'x' } });
  assert.equal(kept.stdout, 'u=x\n');
});

test('run: much output is passed through and logged whole', async () => {
  const a = await app();
  const r = await run(['run', '--', process.execPath, '-e', 'process.stdout.write("y".repeat(3e6) + "\\nend\\n")'], { env: a.env });
  assert.equal(r.code, 0);
  assert.equal(r.stdout.length, 3_000_005);
  assert.equal(fs.statSync(a.log).size, 3_000_005);
});

test('run: a command that does not exist ends 127 and is reported failed', async () => {
  const a = await app();
  const r = await run(['run', '--', 'definitely-not-a-command-xyz'], { env: a.env });
  assert.equal(r.code, 127);
  assert.match(r.stderr, /^job: cannot run 'definitely-not-a-command-xyz': ENOENT$/m);
  assert.deepEqual(a.reports(), [{ state: 'failed', exitCode: 127 }]);
});

test('run: ended by SIGTERM (a stop from the app) is "stopped"; by SIGKILL it is "failed"', async () => {
  for (const [sig, state, code] of [['TERM', 'stopped', 143], ['KILL', 'failed', 137]]) {
    const a = await app();
    const r = await run(['run', '--', 'sh', '-c', `kill -${sig} $$`], { env: a.env });
    assert.equal(r.code, code, sig);
    assert.deepEqual(a.reports().at(-1), { state, exitCode: code, signal: `SIG${sig}` });
  }
});

// ---------------------------------------------------------------- waiting its turn
test('queued: waits until the app says start, says what it waits for when that changes, and gets over errors', async () => {
  const marker = tmp('ran');
  let ranBeforeStart = null;
  const a = await app({
    register: [200, { id: 'j-2', log: tmp('q.log'), start: false, waitingFor: 'Build the index' }],
    go: (r, n) => {
      if (n === 1) return [200, { wait: 'Build the index' }];
      if (n === 2) return 'drop';
      if (n === 3) return [503, { error: 'starting' }];
      if (n === 4) return [401, { error: 'not yet' }];
      if (n === 5 || n === 6) return [200, { wait: 'its turn in queue gpu' }];
      ranBeforeStart = fs.existsSync(marker);
      return [200, { start: true }];
    },
  });
  const r = await run(['run', '--', 'touch', marker], { env: a.env });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(ranBeforeStart, false, 'not run before its turn');
  assert.ok(fs.existsSync(marker));
  assert.deepEqual(r.stderr.split('\n').filter((l) => l.startsWith('job j-2')), [
    'job j-2 waits: Build the index',
    'job j-2 waits: its turn in queue gpu',
    `job j-2 started: ${a.seen[0].body.name}`,
  ]);
  assert.equal(a.seen.filter((x) => x.route === 'go').length, 7);
  assert.deepEqual(a.reports().map((x) => x.state), ['running', 'done']);
});

test('queued: one that never starts exits 3 and its command is not run', async () => {
  const marker = tmp('never-ran');
  const a = await app({
    register: [200, { id: 'j-3', log: tmp('c.log'), start: false, waitingFor: 'Index' }],
    go: (r, n) => [200, n === 1 ? { wait: 'Index' } : { cancel: 'Waited for Index, which failed' }],
  });
  const r = await run(['run', '--', 'touch', marker], { env: a.env });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /^job j-3 never started: Waited for Index, which failed$/m);
  assert.ok(!fs.existsSync(marker));
  assert.deepEqual(a.reports(), []);
});

test('queued: a job the app keeps refusing does not start', async () => {
  const marker = tmp('refused-ran');
  const a = await app({ register: [200, { id: 'j-4', log: tmp('r.log'), start: false }], go: [404, { error: 'No such job' }] });
  const r = await run(['run', '--', 'touch', marker], { env: a.env });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /^job j-4 never started: No such job$/m);
  assert.ok(!fs.existsSync(marker));
});

test('queued: SIGTERM while it waits reports stopped and runs nothing', async () => {
  const marker = tmp('sig-ran');
  const a = await app({ register: [200, { id: 'j-5', log: tmp('s.log'), start: false, waitingFor: 'x' }], go: [200, { wait: 'x' }] });
  const p = start(['run', '--', 'touch', marker], { env: a.env });
  await until('a look', () => a.seen.some((x) => x.route === 'go'));
  p.child.kill('SIGTERM');
  const r = await p.done;
  assert.equal(r.code, 143);
  assert.ok(!fs.existsSync(marker));
  assert.deepEqual(a.reports(), [{ state: 'stopped', signal: 'SIGTERM' }]);
});

// ---------------------------------------------------------------- the app refusing, or away
test('registration refused (400): the words are printed, exit 2, nothing runs', async () => {
  const marker = tmp('no-run');
  const a = await app({ register: [400, { error: 'No job called Biuld to wait for' }] });
  const r = await run(['run', '--after', 'Biuld', '--', 'touch', marker], { env: a.env });
  assert.equal(r.code, 2);
  assert.equal(r.stderr, 'job: No job called Biuld to wait for\n');
  assert.ok(!fs.existsSync(marker));
});

const UNREACHABLE = 'job: Hydor is not reachable; running without registering\n';

test('a sign-in not accepted (401, 403) does not block: said, and the command runs', async () => {
  for (const status of [401, 403]) {
    const a = await app({ register: [status, { error: 'Not a running session of Hydor, and not signed in' }] });
    const r = await run(['run', '--', 'sh', '-c', 'echo hi; exit 6'], { env: a.env });
    assert.equal(r.code, 6);
    assert.equal(r.stdout, 'hi\n');
    assert.equal(r.stderr, "job: Hydor did not accept this session's sign-in; running without registering\n");
    assert.equal(a.seen.length, 1, 'nothing is reported');
  }
});

test('no env: the command runs anyway, with its exit code', async () => {
  const r = await run(['run', '--after', 'x', '--', 'sh', '-c', 'echo hi; exit 4']);
  assert.equal(r.code, 4);
  assert.equal(r.stdout, 'hi\n');
  assert.equal(r.stderr, UNREACHABLE);
});

test('a network error, a 5xx, another 4xx or an answer that is none at registration: runs anyway', async () => {
  const closed = { HYDOR_JOBS_URL: 'http://127.0.0.1:1/agent/jobs', HYDOR_JOBS_TOKEN: 't' };
  const apps = [closed, (await app({ register: [502, 'Bad gateway'] })).env, (await app({ register: 'drop' })).env, (await app({ register: [200, '<html>'] })).env, (await app({ register: [404, { error: 'No such route' }] })).env];
  for (const env of apps) {
    const r = await run(['run', '--', 'echo', 'hi'], { env });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, 'hi\n');
    assert.equal(r.stderr, UNREACHABLE);
  }
});

test('a report that fails is tried again; when it never gets through, a note, and the exit code stands', async () => {
  const flaky = await app({ report: (r, n) => (n < 3 ? [500, { error: 'busy' }] : [200, { ok: true }]) });
  const r = await run(['run', '--', 'sh', '-c', 'sleep 0.3'], { env: flaky.env });
  assert.equal(r.code, 0);
  assert.deepEqual(flaky.reports().map((x) => x.state), ['running', 'running', 'running', 'done'], 'in order');
  assert.doesNotMatch(r.stderr, /could not tell/);
  const down = await app({ report: 'drop' });
  const r2 = await run(['run', '--', 'sh', '-c', 'exit 5'], { env: down.env });
  assert.equal(r2.code, 5);
  assert.equal(down.reports().length, 8, 'four tries each');
  assert.match(r2.stderr, /^job: could not tell Hydor that job j-1 is failed: /m);
});

// ---------------------------------------------------------------- stopping job
for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]]) {
  test(`${sig} to job stops the command's whole group and reports stopped`, async () => {
    if (process.platform === 'win32') return;
    const a = await app();
    const pids = tmp('pids');
    const p = start(['run', '--', 'sh', '-c', `sleep 30 & echo "$$ $!" > ${pids}; echo up; wait`], { env: a.env });
    await until('the command', () => p.out().includes('up'));
    const [sh, sleeper] = fs.readFileSync(pids, 'utf8').trim().split(' ').map(Number);
    p.child.kill(sig);
    const r = await p.done;
    assert.equal(r.code, code);
    await until('the group to be gone', () => !alive(sh) && !alive(sleeper), 2000);
    assert.deepEqual(a.reports().at(-1), { state: 'stopped', exitCode: code, signal: 'SIGTERM' });
  });
}

test('what ignores SIGTERM is killed after the grace, a command or one it left in its group', async () => {
  if (process.platform === 'win32') return;
  for (const script of [
    (f) => `trap '' TERM; echo $$ > ${f}; echo up; while :; do sleep 0.05; done`,
    (f) => `(trap '' TERM; exec sleep 30 >/dev/null 2>&1) & echo $! > ${f}; echo up; wait`,
  ]) {
    const a = await app();
    const f = tmp('stubborn');
    const p = start(['run', '--', 'sh', '-c', script(f)], { env: a.env });
    await until('the command', () => p.out().includes('up'));
    const pid = Number(fs.readFileSync(f, 'utf8'));
    await delay(100);
    p.child.kill('SIGTERM');
    const r = await p.done;
    assert.equal(r.code, 143);
    await until('it to be gone', () => !alive(pid), 2000);
    assert.equal(a.reports().at(-1).state, 'stopped');
  }
});

// ---------------------------------------------------------------- adopt
test('adopt: registers a process that already runs, says so and returns while it runs', async () => {
  if (process.platform === 'win32') return;
  const dir = tmp('work');
  fs.mkdirSync(dir);
  const sl = spawn('sleep', ['7.25'], { stdio: 'ignore', cwd: dir });
  const ended = spawn('true', { stdio: 'ignore' });
  await new Promise((r) => ended.on('close', r));
  try {
    // The Linux way (/proc) and the one by ps (macOS).
    for (const platform of ['', 'darwin']) {
      const a = await app({ register: [200, { id: 'j-8', log: tmp('a.log'), start: true }] });
      fs.writeFileSync(path.join(TMP, 'crawl.log'), 'step 1/2\n');
      const r = await run(['adopt', '--pid', String(sl.pid), '--name', 'Crawl', '--log', 'crawl.log', '--eta', '2h', '--progress', '(\\d+)%'], { env: { ...a.env, JOB_FAKE_PLATFORM: platform } });
      assert.equal(r.code, 0, r.stderr);
      assert.equal(r.stdout, 'job j-8 adopted: Crawl\n');
      assert.equal(r.stderr, '');
      assert.ok(alive(sl.pid));
      assert.equal(a.seen.length, 1, 'nothing is followed or reported');
      assert.deepEqual(a.seen[0].body, {
        name: 'Crawl',
        command: 'sleep 7.25',
        // Only /proc says which folder it runs in; else the folder `job` was asked from.
        cwd: fs.realpathSync(!platform && process.platform === 'linux' ? dir : TMP),
        pid: sl.pid,
        adoptPid: sl.pid,
        logFile: path.join(fs.realpathSync(TMP), 'crawl.log'),
        etaMs: 7_200_000,
        progress: '(\\d+)%',
      }, platform || 'native');
    }
    const a = await app({ register: [400, { error: 'It cannot be adopted' }] });
    const refused = await run(['adopt', '--pid', String(sl.pid)], { env: a.env });
    assert.equal(refused.code, 2);
    assert.equal(refused.stderr, 'job: It cannot be adopted\n');
    assert.equal(a.seen[0].body.name, 'sleep 7.25');
    const gone = await run(['adopt', '--pid', String(ended.pid)], { env: a.env });
    assert.equal(gone.code, 2);
    assert.equal(gone.stderr, `job: there is no running process with pid ${ended.pid}\n`);
    assert.equal(a.seen.length, 1);
    // Hydor not reachable: said, exit 1, and the process is left as it is.
    for (const env of [{}, { HYDOR_JOBS_URL: 'http://127.0.0.1:1/agent/jobs', HYDOR_JOBS_TOKEN: 't' }, (await app({ register: [500, { error: 'busy' }] })).env]) {
      const away = await run(['adopt', '--pid', String(sl.pid)], { env });
      assert.equal(away.code, 1);
      assert.equal(away.stdout, '');
      assert.equal(away.stderr, `job: Hydor is not reachable; pid ${sl.pid} is not adopted\n`);
    }
    assert.ok(alive(sl.pid));
    const denied = await run(['adopt', '--pid', String(sl.pid)], { env: (await app({ register: [401, { error: 'no' }] })).env });
    assert.equal(denied.code, 1);
    assert.equal(denied.stderr, `job: Hydor did not accept this session's sign-in; pid ${sl.pid} is not adopted\n`);
    for (const args of [['adopt'], ['adopt', '--pid', 'x'], ['adopt', '--pid', '1'], ['adopt', '--pid', '5', '--after', 'a'], ['adopt', '--pid', '5', '--queue', 'q']]) {
      assert.equal((await run(args, { env: a.env })).code, 64, args.join(' '));
    }
  } finally {
    sl.kill();
  }
});

test('an adopted process that is gone: "ended", its exit code not known, and fine for wait', async () => {
  const j = entry('j-8', 'done', { exitUnknown: true, startedAt: 1000, endedAt: 4000 });
  const a = await app({ job: [200, { job: j }], list: [200, { at: 5000, running: [], queued: [], ended: [j] }] });
  const waited = await run(['wait', 'j-8'], { env: a.env });
  assert.equal(waited.code, 0);
  assert.equal(waited.stdout, 'j-8 ended after 3s: Job j-8 (exit code not known)\n');
  assert.match((await run(['status', 'j-8'], { env: a.env })).stdout, /^j-8 {2}ended {2}Job j-8\n[^]*exit code: +not known$/m);
  assert.match((await run(['list', '--all'], { env: a.env })).stdout, /^j-8 +ended +Job j-8/m);
});

// ---------------------------------------------------------------- list, status, wait, stop
const now = Date.now();
const entry = (id, state, more = {}) => ({ id, kind: 'job', state, name: `Job ${id}`, ...more });

test('list: a table of what runs and waits; --all adds the ended', async () => {
  const a = await app({
    list: [200, {
      at: now,
      running: [entry('job:j-1', 'running', { session: { key: 'k', title: 'Index work' }, startedAt: now - 90_000, estimate: { endsAt: now + 3_600_000, source: 'agent', confidence: 'low' }, progress: { fraction: 0.4, text: '4/10', at: now } })],
      queued: [entry('job:j-2', 'queued', { queuedAt: now - 5000, waitingFor: 'Job j-1', startsAt: now + 3_600_000 })],
      ended: [entry('job:j-0', 'failed', { startedAt: now - 200_000, endedAt: now - 100_000, reason: 'Exit code 1' })],
      allDoneAt: now + 7_200_000,
    }],
  });
  const r = await run(['list'], { env: a.env });
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.match(lines[0], /^ID +STATE +NAME +SESSION +TIME +LEFT$/);
  assert.match(lines[1], /^job:j-1 +running +Job job:j-1 +Index work +1m30s +1h00m left +4\/10$/);
  assert.match(lines[2], /^job:j-2 +queued +Job job:j-2 +- +queued 5s +starts in 1h00m +waits for Job j-1$/);
  assert.equal(lines[3], 'all done in about 2h00m');
  assert.equal(lines.length, 4);
  assert.equal(a.seen[0].query, '');
  const all = await run(['list', '--all'], { env: a.env });
  assert.match(all.stdout, /^job:j-0 +failed +.*took 1m40s +1m40s ago +Exit code 1$/m);
  assert.equal(a.seen[1].query, '?ended=20');
  const none = await run(['list'], { env: (await app()).env });
  assert.equal(none.stdout, 'no jobs running or queued\n');
});

test('status: readable lines, or the entry with --json; an unknown job is said', async () => {
  const j = entry('j-1', 'running', { command: 'make all', cwd: '/work', startedAt: Date.now() - 60_000, queue: 'gpu', progress: { fraction: 0.5, text: 'step 5/10', at: now }, lastLine: 'compiling' });
  const a = await app({ job: (r) => (r.id === 'j-1' ? [200, { job: j }] : [404, { error: 'No such job' }]) });
  const r = await run(['status', 'j-1'], { env: a.env });
  assert.equal(r.code, 0, r.stderr);
  for (const line of [/^j-1 {2}running {2}Job j-1$/m, /^ {2}command: +make all$/m, /^ {2}folder: +\/work$/m, /^ {2}queue: +gpu$/m, /^ {2}progress: +50% {2}step 5\/10$/m, /^ {2}last line: +compiling$/m]) assert.match(r.stdout, line);
  const json = await run(['status', 'j-1', '--json'], { env: a.env });
  assert.deepEqual(JSON.parse(json.stdout), j);
  const unknown = await run(['status', 'j-9'], { env: a.env });
  assert.equal(unknown.code, 2);
  assert.equal(unknown.stderr, 'job: No such job\n');
});

test('wait: a line for each as it ends; 0 when all are done, 1 when any is not', async () => {
  const states = { a: ['running', 'done'], b: ['queued', 'running', 'done'], c: ['running', 'cancelled'] };
  const looks = {};
  const a = await app({
    job: (r) => {
      const n = (looks[r.id] = (looks[r.id] ?? 0) + 1);
      const state = states[r.id][Math.min(n, states[r.id].length) - 1];
      return [200, { job: entry(r.id, state, { startedAt: now - 3000, endedAt: now, ...(state === 'cancelled' ? { startedAt: undefined, reason: 'Waited for X, which failed' } : {}) }) }];
    },
  });
  const good = await run(['wait', 'a', 'b'], { env: a.env });
  assert.equal(good.code, 0, good.stderr);
  assert.equal(good.stdout, 'a done after 3s: Job a\nb done after 3s: Job b\n');
  for (const k of Object.keys(looks)) delete looks[k];
  const bad = await run(['wait', 'a', 'c'], { env: a.env });
  assert.equal(bad.code, 1);
  assert.equal(bad.stdout, 'a done after 3s: Job a\nc cancelled: Job c: Waited for X, which failed\n');
});

test('wait: 124 on timeout, naming what still runs; an unknown id and no app are said at once', async () => {
  const a = await app({ job: (r) => [200, { job: entry(r.id, 'running') }] });
  const t0 = Date.now();
  const r = await run(['wait', 'a', '--timeout', '1s'], { env: a.env });
  assert.equal(r.code, 124);
  assert.equal(r.stdout, 'timeout after 1s: still waiting for a (running: Job a)\n');
  assert.ok(Date.now() - t0 >= 1000);
  const unknown = await run(['wait', 'zz'], { env: (await app()).env });
  assert.equal(unknown.code, 2);
  assert.equal(unknown.stderr, 'job: No such job\n');
  const away = await run(['wait', 'a']);
  assert.equal(away.code, 3);
  assert.match(away.stderr, /^job: HYDOR_JOBS_URL and HYDOR_JOBS_TOKEN are not set/);
});

test('stop: asks the app; its refusal is said', async () => {
  const a = await app({ stop: (r) => (r.id === 'job:j-1' ? [200, { ok: true }] : [409, { error: 'It has ended' }]) });
  const r = await run(['stop', 'job:j-1'], { env: a.env });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'asked to stop job:j-1\n');
  assert.equal(a.seen[0].method, 'POST');
  assert.equal(a.seen[0].id, 'job:j-1');
});

// ---------------------------------------------------------------- usage
test('--help, no arguments and run --help print the usage, which names the Jobs section', async () => {
  for (const args of [['--help'], [], ['run', '--help']]) {
    const r = await run(args);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /^job - run long work that Hydor shows in its Jobs section with its progress and time left\.\n/);
    assert.match(r.stdout, /job run \[options\] -- COMMAND/);
  }
});

test('usage errors exit 64 and run nothing', async () => {
  const marker = tmp('usage-ran');
  for (const args of [['run', 'touch', marker], ['run'], ['run', '--'], ['run', '--eta', 'soon', '--', 'touch', marker], ['run', '--nope', '--', 'touch', marker],
    ['run', '--name', '--', 'touch', marker], ['run', '--progress', '(', '--', 'touch', marker], ['wait'], ['status'], ['stop', 'a', 'b'], ['list', 'x'], ['frob']]) {
    const r = await run(args);
    assert.equal(r.code, 64, args.join(' '));
    assert.match(r.stderr, /^error: .*\nhint: run 'job --help'/, args.join(' '));
  }
  assert.ok(!fs.existsSync(marker));
});
