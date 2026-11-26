// Tests for bin/waitfor.  Run: node --test scripts/agent-tools/test/waitfor.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const BIN = path.resolve(import.meta.dirname, '../bin/waitfor');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'waitfor-test-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const tmp = (name) => path.join(TMP, `${++seq}-${name}`);

// Start waitfor; returns { child, done } where done resolves {code, stdout, stderr}.
function start(args, { env = {}, cwd } = {}) {
  const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const done = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr })));
  return { child, done };
}
const run = (args, opts) => start(args, opts).done;
const first = (r) => r.stdout.split('\n')[0];
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// ---------------------------------------------------------------- pid / proc
test('pid: exits when a spawned `sleep 1` exits', async () => {
  const sl = spawn('sleep', ['1'], { stdio: 'ignore' });
  const r = await run(['--pid', String(sl.pid), '--every', '100ms', '--timeout', '8s']);
  assert.equal(r.code, 0);
  assert.match(first(r), new RegExp(`^done: pid ${sl.pid} exited after [01]s$`));
  assert.equal(r.stderr, '');
});

test('pid: several pids all have to exit; unknown pid counts as exited', async () => {
  const a = spawn('sleep', ['0.3'], { stdio: 'ignore' });
  const b = spawn('sleep', ['1'], { stdio: 'ignore' });
  const t0 = Date.now();
  const r = await run(['--pid', `${a.pid},${b.pid},999999`, '--every', '100ms', '--timeout', '8s']);
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: pid \d+,\d+,999999 exited after/);
  assert.ok(Date.now() - t0 >= 900, 'waited for the slower pid');
});

test('proc: waits for process matching regex to vanish (own cmdline is not matched)', async () => {
  const sl = spawn('sleep', ['1.37'], { stdio: 'ignore' });
  const t0 = Date.now();
  const r = await run(['--proc', 'sleep 1\\.37', '--every', '100ms', '--timeout', '8s']);
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: no process matching \/sleep 1\\\.37\/ after/);
  assert.ok(Date.now() - t0 >= 1000);
  sl.kill();
});

test('proc: times out while a matching process runs, naming its pid', async () => {
  const sl = spawn('sleep', ['5.71'], { stdio: 'ignore' });
  const r = await run(['--proc', 'sleep 5\\.71', '--every', '100ms', '--timeout', '1s']);
  sl.kill();
  assert.equal(r.code, 124);
  assert.match(first(r), /^timeout after 1s: still waiting for proc \/sleep 5\\\.71\/ still running \(pid \d+\)/);
});

// ---------------------------------------------------------------- files
test('file: appears later', async () => {
  const f = tmp('appear');
  const p = start(['--file', f, '--every', '100ms', '--timeout', '8s']);
  await delay(400);
  fs.writeFileSync(f, '');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: file .*appear exists after \ds$/);
});

test('file-nonempty: an empty file is not enough', async () => {
  const f = tmp('nonempty');
  fs.writeFileSync(f, '');
  const p = start(['--file-nonempty', f, '--every', '100ms', '--timeout', '8s']);
  await delay(500);
  fs.writeFileSync(f, 'x');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /non-empty after/);
});

test('file-nonempty: times out on empty file and says so', async () => {
  const f = tmp('stillempty');
  fs.writeFileSync(f, '');
  const r = await run(['--file-nonempty', f, '--every', '100ms', '--timeout', '1s']);
  assert.equal(r.code, 124);
  assert.match(first(r), /still waiting for file .*stillempty non-empty \(empty\)/);
});

test('gone: file removed later', async () => {
  const f = tmp('gone');
  fs.writeFileSync(f, 'x');
  const p = start(['--gone', f, '--every', '100ms', '--timeout', '8s']);
  await delay(400);
  fs.unlinkSync(f);
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: .*gone is gone after/);
});

// ---------------------------------------------------------------- logs
test('log: only content appended after start counts', async () => {
  const f = tmp('log');
  fs.writeFileSync(f, 'old DONE line\n');
  const p = start(['--log', f, '--match', 'DONE', '--every', '100ms', '--timeout', '8s']);
  await delay(600);
  fs.appendFileSync(f, 'working\nnew DONE line\n');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: .*log matched \/DONE\/ after \ds: new DONE line$/);
});

test('log: --from-start counts existing content', async () => {
  const f = tmp('logfs');
  fs.writeFileSync(f, 'old DONE line\n');
  const r = await run(['--log', f, '--match', 'DONE', '--from-start', '--timeout', '8s']);
  assert.equal(r.code, 0);
  assert.match(first(r), /: old DONE line$/);
});

test('log: file created after start (all content counts)', async () => {
  const f = tmp('late');
  const p = start(['--log', f, '--match', 'READY', '--every', '100ms', '--timeout', '8s']);
  await delay(500);
  fs.writeFileSync(f, 'booting\nREADY now\n');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /: READY now$/);
});

test('log: truncation restarts from offset 0', async () => {
  const f = tmp('trunc');
  fs.writeFileSync(f, 'a long line that is long enough to be truncated later\n');
  const p = start(['--log', f, '--match', 'DONE', '--every', '100ms', '--timeout', '8s']);
  await delay(500);
  fs.writeFileSync(f, 'DONE\n'); // shorter than the old size
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /: DONE$/);
});

test('log: partial last line and multi-byte UTF-8 split across reads', async () => {
  const f = tmp('utf8');
  fs.writeFileSync(f, '');
  const p = start(['--log', f, '--match', '^héllo wörld$', '--every', '100ms', '--timeout', '8s']);
  await delay(400);
  const bytes = Buffer.from('héllo wörld\n');
  const cutAt = bytes.indexOf(0xc3) + 1; // inside the two-byte é
  fs.appendFileSync(f, bytes.subarray(0, cutAt));
  await delay(400);
  fs.appendFileSync(f, bytes.subarray(cutAt, 9));
  await delay(400);
  fs.appendFileSync(f, bytes.subarray(9));
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /: héllo wörld$/);
});

test('log: an unterminated line is not matched until its newline arrives', async () => {
  const f = tmp('partial');
  fs.writeFileSync(f, '');
  const p = start(['--log', f, '--match', '^FINISHED$', '--every', '100ms', '--timeout', '3s']);
  await delay(300);
  fs.appendFileSync(f, 'FINISHED'); // would match, but the line is still being written
  await delay(700);
  fs.appendFileSync(f, ' WITH ERRORS\n');
  const r = await p.done;
  assert.equal(r.code, 124);
});

test('log: several --log/--match pairs, each match belongs to the log before it', async () => {
  const a = tmp('a.log'), b = tmp('b.log');
  fs.writeFileSync(a, ''); fs.writeFileSync(b, '');
  const p = start(['--log', a, '--match', 'ALPHA', '--log', b, '--match', 'BETA', '--every', '100ms', '--timeout', '8s']);
  await delay(400);
  fs.appendFileSync(a, 'BETA is not for this log\n'); // must not match: BETA belongs to b
  await delay(400);
  fs.appendFileSync(b, 'ALPHA is not for this log\nBETA ok\n');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /b\.log matched \/BETA\/ .*: BETA ok$/);
});

test('--fail on a log: exit 2 and the line is printed', async () => {
  const f = tmp('fail.log');
  fs.writeFileSync(f, '');
  const p = start(['--log', f, '--match', 'DONE', '--fail', 'Traceback|FATAL', '--every', '100ms', '--timeout', '8s', '--tail', `${f}:2`]);
  await delay(400);
  fs.appendFileSync(f, 'step 1\nTraceback (most recent call last):\nstep 3\n');
  const r = await p.done;
  assert.equal(r.code, 2);
  assert.match(first(r), /^failed: .*fail\.log matched \/Traceback\|FATAL\/ after \ds: Traceback \(most recent call last\):$/);
  assert.match(r.stdout, /--- .*fail\.log \(last 2 lines\)/);
});

test('--fail also watches a --log that has no --match', async () => {
  const w = tmp('watched.log'), g = tmp('flag');
  fs.writeFileSync(w, '');
  const p = start(['--log', w, '--file', g, '--fail', 'ERROR', '--every', '100ms', '--timeout', '8s']);
  await delay(400);
  fs.appendFileSync(w, 'ERROR disk full\n');
  const r = await p.done;
  assert.equal(r.code, 2);
  assert.match(first(r), /: ERROR disk full$/);
});

test('timeout: exit 124, unmet conditions and last progress are listed', async () => {
  const f = tmp('to.log'), nope = tmp('nope');
  fs.writeFileSync(f, '');
  const p = start(['--log', f, '--match', 'NEVER', '--file', nope, '--progress', 'epoch \\d+', '--every', '100ms',
    '--timeout', '1500ms', '--tail', f]);
  await delay(400);
  fs.appendFileSync(f, 'epoch 1 loss 3\nnoise\nepoch 2 loss 2\nnoise\n');
  const r = await p.done;
  assert.equal(r.code, 124);
  const lines = r.stdout.split('\n');
  assert.match(lines[0], /^timeout after \ds: still waiting for log .*to\.log \/NEVER\/, file .*nope/);
  assert.equal(lines[1], 'last progress: epoch 2 loss 2');
  assert.match(r.stdout, /--- .*to\.log \(last 4 lines\)\nepoch 1 loss 3\nnoise\nepoch 2 loss 2\nnoise/);
});

test('--all: needs both conditions, lists when each was met', async () => {
  const a = tmp('all-a'), b = tmp('all-b');
  const p = start(['--all', '--file', a, '--file', b, '--every', '100ms', '--timeout', '8s']);
  await delay(300);
  fs.writeFileSync(a, '');
  await delay(1200);
  fs.writeFileSync(b, '');
  const r = await p.done;
  assert.equal(r.code, 0);
  const lines = r.stdout.split('\n');
  assert.match(lines[0], /^done: all 2 conditions met after \ds$/);
  assert.match(lines[1], /^ {2}met at 0s: file .*all-a exists$/);
  assert.match(lines[2], /^ {2}met at [12]s: file .*all-b exists$/);
});

test('--all: timeout lists the unmet one', async () => {
  const a = tmp('allt-a'), b = tmp('allt-b');
  fs.writeFileSync(a, '');
  const r = await run(['--all', '--file', a, '--file', b, '--every', '100ms', '--timeout', '700ms']);
  assert.equal(r.code, 124);
  assert.match(r.stdout, /met at 0s: file .*allt-a exists\n {2}unmet: file .*allt-b \(missing\)/);
});

// ---------------------------------------------------------------- http
function makeServer() {
  let hits = 0;
  const srv = http.createServer((req, res) => {
    const u = req.url;
    if (u === '/ok') { res.end('hello'); return; }
    if (u === '/missing') { res.statusCode = 404; res.end('nope'); return; }
    if (u === '/flaky') { hits++; res.statusCode = hits < 4 ? 503 : 200; res.end(hits < 4 ? 'starting' : 'ready: yes'); return; }
    if (u === '/body') { res.end('warming up... model loaded in 3s'); return; }
    if (u === '/json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ state: 'done', n: 3, items: [{ id: 7 }, { id: 8 }] })); return; }
    res.statusCode = 500; res.end();
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, hits: () => hits })));
}

test('http: 2xx, exact --status, retry on 503, --body, --json (nested/array path, string compare)', async () => {
  const { srv, port } = await makeServer();
  try {
    const base = `http://127.0.0.1:${port}`;
    const common = ['--every', '100ms', '--timeout', '6s'];
    let r = await run(['--http', `${base}/ok`, ...common]);
    assert.equal(r.code, 0);
    assert.match(first(r), new RegExp(`^done: http ${base}/ok 200 after \\ds$`));

    r = await run(['--http', `${base}/missing`, '--status', '404', ...common]);
    assert.equal(r.code, 0);
    assert.match(first(r), /\/missing 404 after/);

    r = await run(['--http', `${base}/flaky`, ...common]);
    assert.equal(r.code, 0);
    assert.match(first(r), /\/flaky 200 after/);

    r = await run(['--http', `${base}/body`, '--body', 'loaded in \\d+s', ...common]);
    assert.equal(r.code, 0);
    assert.match(first(r), /\/body 200 body \/loaded in \\d\+s\/ after/);

    r = await run(['--http', `${base}/json`, '--json', 'state=done', '--json', 'items.1.id=8', '--json', 'n=3', ...common]);
    assert.equal(r.code, 0);
    assert.match(first(r), /\/json 200 json state=done items\.1\.id=8 n=3 after/);

    r = await run(['--http', `${base}/json`, '--json', 'state=running', '--every', '100ms', '--timeout', '700ms']);
    assert.equal(r.code, 124);
    assert.match(first(r), /still waiting for http .*\/json \(last: HTTP 200, state=done\)/);

    r = await run(['--http', `${base}/missing`, '--every', '100ms', '--timeout', '600ms']);
    assert.equal(r.code, 124);
    assert.match(first(r), /\(last: HTTP 404\)/);
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

test('http: server that starts late (connection refused means not yet)', async () => {
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const p = start(['--http', `http://127.0.0.1:${port}/ok`, '--every', '100ms', '--timeout', '8s']);
  await delay(900);
  const srv = http.createServer((q, s) => s.end('up'));
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  try {
    const r = await p.done;
    assert.equal(r.code, 0);
    assert.match(first(r), /^done: http .* 200 after/);
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

// ---------------------------------------------------------------- until
test('--until: succeeds once the command exits 0; times out otherwise', async () => {
  const f = tmp('until-flag');
  const p = start(['--until', `test -f ${f}`, '--every', '100ms', '--timeout', '8s']);
  await delay(500);
  fs.writeFileSync(f, '');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: until 'test -f .*' succeeded after/);
  const r2 = await run(['--until', 'exit 3', '--every', '100ms', '--timeout', '600ms']);
  assert.equal(r2.code, 124);
  assert.match(first(r2), /still waiting for until 'exit 3' \(exit 3\)/);
});

// ---------------------------------------------------------------- fake systemctl / squeue / sacct
const FAKE = path.join(TMP, 'fakebin');
fs.mkdirSync(FAKE);
function fakeScript(name, body) {
  const p = path.join(FAKE, name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return p;
}
// systemctl: logs its args; prints $FAKE_SYSTEMCTL_OUT_<n> where n is the call count (falls back to the last file).
fakeScript('systemctl', `
printf '%s\\n' "$*" >> "$FAKE_DIR/systemctl.args"
n=$(cat "$FAKE_DIR/systemctl.count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "$FAKE_DIR/systemctl.count"
f="$FAKE_DIR/systemctl.out.$n"; [ -f "$f" ] || f="$FAKE_DIR/systemctl.out"
[ -f "$FAKE_DIR/systemctl.fail" ] && { echo "Failed to connect to bus" >&2; exit 1; }
cat "$f"
`);
// squeue: logs args; first $FAKE_SQUEUE_BUSY calls print RUNNING; $FAKE_SQUEUE_FAIL makes it fail; INVALID prints the slurm error
fakeScript('squeue', `
printf '%s\\n' "$*" >> "$FAKE_DIR/squeue.args"
n=$(cat "$FAKE_DIR/squeue.count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "$FAKE_DIR/squeue.count"
if [ -n "$FAKE_SQUEUE_FAIL" ] && [ "$n" -le "$FAKE_SQUEUE_FAIL" ]; then echo "squeue: error: Unable to contact slurm controller" >&2; exit 1; fi
if [ -n "$FAKE_SQUEUE_INVALID" ]; then echo "slurm_load_jobs error: Invalid job id specified" >&2; exit 1; fi
if [ "$n" -le "\${FAKE_SQUEUE_BUSY:-0}" ]; then echo RUNNING; fi
exit 0
`);
fakeScript('sacct', `
printf '%s\\n' "$*" >> "$FAKE_DIR/sacct.args"
[ -n "$FAKE_SACCT_FAIL" ] && exit 1
[ -n "$FAKE_SACCT_OUT" ] && { printf '%s\\n' "$FAKE_SACCT_OUT"; exit 0; }
echo "  COMPLETED      0:0   00:58:12 "
`);
// fake ssh: "fakessh HOST CMD" runs CMD locally, and logs the host
fakeScript('fakessh', `
echo "$1" >> "$FAKE_DIR/ssh.hosts"; shift
[ -n "$FAKE_SSH_FAIL" ] && { echo "ssh: connect to host failed" >&2; exit 255; }
exec sh -c "$*"
`);

function fakeEnv(extra = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, 'fake-'));
  return { dir, env: { PATH: `${FAKE}:${process.env.PATH}`, FAKE_DIR: dir, ...extra } };
}
const sysOut = (dir, text, n = '') => fs.writeFileSync(path.join(dir, n ? `systemctl.out.${n}` : 'systemctl.out'), text);

test('unit: waits for inactive, reports Result (real systemd value order), uses --user by default', async () => {
  const { dir, env } = fakeEnv();
  sysOut(dir, 'success\nactivating\nstart\n', 1);
  sysOut(dir, 'success\nactive\nrunning\n', 2);
  sysOut(dir, 'success\ninactive\ndead\n');
  const r = await run(['--unit', 'train.service', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: unit train\.service inactive \(Result=success\) after \ds$/);
  const args = fs.readFileSync(path.join(dir, 'systemctl.args'), 'utf8').split('\n')[0];
  assert.equal(args, '--user show train.service -p ActiveState,SubState,Result,LoadState --value');
  assert.ok(Number(fs.readFileSync(path.join(dir, 'systemctl.count'), 'utf8')) >= 3);
});

test('unit: failed unit while waiting for inactive is a failure (exit 2); --system drops --user; spec value order works', async () => {
  const { dir, env } = fakeEnv();
  sysOut(dir, 'failed\nfailed\nexit-code\n'); // ActiveState, SubState, Result
  const r = await run(['--unit', 'x.service', '--system', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 2);
  assert.match(first(r), /^failed: unit x\.service failed \(Result=exit-code\) after \ds$/);
  assert.equal(fs.readFileSync(path.join(dir, 'systemctl.args'), 'utf8').split('\n')[0], 'show x.service -p ActiveState,SubState,Result,LoadState --value');
});

test('unit: --state active and --state failed', async () => {
  let { dir, env } = fakeEnv();
  sysOut(dir, 'success\nactive\nrunning\n');
  let r = await run(['--unit', 'web.service', '--state', 'active', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: unit web\.service active \(running\) after/);
  ({ dir, env } = fakeEnv());
  sysOut(dir, 'exit-code\nfailed\nfailed\n');
  r = await run(['--unit', 'web.service', '--state', 'failed', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: unit web\.service failed \(Result=exit-code\) after/);
});

test('unit: timeout shows the current state; 5 consecutive systemctl failures stop with exit 3', async () => {
  let { dir, env } = fakeEnv();
  sysOut(dir, 'success\nactive\nrunning\n');
  let r = await run(['--unit', 'web.service', '--every', '100ms', '--timeout', '700ms'], { env });
  assert.equal(r.code, 124);
  assert.match(first(r), /still waiting for unit web\.service \(active\/running, want inactive\)/);
  ({ dir, env } = fakeEnv());
  fs.writeFileSync(path.join(dir, 'systemctl.fail'), '');
  r = await run(['--unit', 'web.service', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 3);
  assert.match(first(r), /^error: unit web\.service: systemctl failed 5 times in a row: Failed to connect to bus$/);
  assert.equal(Number(fs.readFileSync(path.join(dir, 'systemctl.count'), 'utf8')), 5);
});

test('slurm: waits while squeue lists the job, then adds sacct info', async () => {
  const { dir, env } = fakeEnv({ FAKE_SQUEUE_BUSY: '3' });
  const r = await run(['--slurm', '123456', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: slurm 123456 left the queue after \ds \(COMPLETED 0:0 00:58:12\)$/);
  assert.equal(fs.readFileSync(path.join(dir, 'squeue.args'), 'utf8').split('\n')[0], '-h -j 123456 -o %T');
  assert.equal(fs.readFileSync(path.join(dir, 'sacct.args'), 'utf8').split('\n')[0], '-n -X -j 123456 -o State,ExitCode,Elapsed');
});

test('slurm: still queued -> timeout lists the job state; sacct failing is fine', async () => {
  let { env } = fakeEnv({ FAKE_SQUEUE_BUSY: '1000' });
  let r = await run(['--slurm', '7', '--every', '100ms', '--timeout', '700ms'], { env });
  assert.equal(r.code, 124);
  assert.match(first(r), /still waiting for slurm 7 \(RUNNING\)/);
  ({ env } = fakeEnv({ FAKE_SACCT_FAIL: '1' }));
  r = await run(['--slurm', '7', '--every', '100ms', '--timeout', '5s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: slurm 7 left the queue after \ds \(final state unknown: sacct failed\)$/);
});

test('slurm: a failing squeue is NOT "job finished"; 5 consecutive failures stop with exit 3', async () => {
  const { dir, env } = fakeEnv({ FAKE_SQUEUE_FAIL: '1000' });
  const r = await run(['--slurm', '42', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 3);
  assert.match(first(r), /^error: slurm 42: squeue failed 5 times in a row: squeue: error: Unable to contact slurm controller$/);
  assert.equal(Number(fs.readFileSync(path.join(dir, 'squeue.count'), 'utf8')), 5);
});

test('slurm: transient failures (<5 in a row) are tolerated', async () => {
  const { env } = fakeEnv({ FAKE_SQUEUE_FAIL: '4' });
  const r = await run(['--slurm', '42', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: slurm 42 left the queue/);
});

test('slurm: "Invalid job id" from squeue counts as finished', async () => {
  const { env } = fakeEnv({ FAKE_SQUEUE_INVALID: '1' });
  const r = await run(['--slurm', '42', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: slurm 42 left the queue/);
});

test('slurm --via: command is run as PREFIX \'squeue ...\' through sh -c, also for sacct', async () => {
  const { dir, env } = fakeEnv({ FAKE_SQUEUE_BUSY: '2' });
  const r = await run(['--slurm', '99', '--via', 'fakessh login.example.org', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /left the queue after \ds \(COMPLETED 0:0 00:58:12\)$/);
  const hosts = fs.readFileSync(path.join(dir, 'ssh.hosts'), 'utf8').trim().split('\n');
  assert.ok(hosts.length >= 4 && hosts.every((h) => h === 'login.example.org'), hosts.join());
  assert.equal(fs.readFileSync(path.join(dir, 'squeue.args'), 'utf8').split('\n')[0], '-h -j 99 -o %T');
});

test('slurm --via: ssh failing (exit 255) is not "finished"', async () => {
  const { env } = fakeEnv({ FAKE_SSH_FAIL: '1' });
  const r = await run(['--slurm', '99', '--via', 'fakessh login', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 3);
  assert.match(first(r), /squeue failed 5 times in a row: ssh: connect to host failed/);
});

// ---------------------------------------------------------------- the `--` form
test('--: exit code passthrough, output file, default tail, header', async () => {
  const out = tmp('cmd.out');
  let r = await run(['--out', out, '--', 'sh', '-c', 'echo hello; echo oops >&2; exit 7']);
  assert.equal(r.code, 7);
  const lines = r.stdout.split('\n');
  assert.match(lines[0], /^failed: exit 7 after \ds: sh -c 'echo hello; echo oops >&2; exit 7'$/);
  assert.equal(lines[1], `output: ${out}`);
  assert.match(r.stdout, new RegExp(`--- ${out} \\(last 2 lines\\)\\n(hello\\noops|oops\\nhello)\\n$`));
  assert.match(fs.readFileSync(out, 'utf8'), /hello/);
  assert.equal(r.stderr, '');

  r = await run(['--out', out, '--', 'sh', '-c', 'echo fine']);
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: exit 0 after \ds: sh -c 'echo fine'$/);
});

test('--: default output file lives in the tmpdir, its path is printed; --quiet prints only the header', async () => {
  let r = await run(['--', 'sh', '-c', 'echo x'], { env: { TMPDIR: TMP } });
  assert.equal(r.code, 0);
  const m = /^output: (\S+)$/m.exec(r.stdout);
  assert.ok(m, r.stdout);
  assert.match(m[1], new RegExp(`^${TMP}/waitfor-\\d+\\.log$`));
  assert.equal(fs.readFileSync(m[1], 'utf8'), 'x\n');
  r = await run(['--quiet', '--', 'sh', '-c', 'echo x; exit 3'], { env: { TMPDIR: TMP } });
  assert.equal(r.code, 3);
  assert.equal(r.stdout.split('\n').filter(Boolean).length, 1);
});

test('--: --tail replaces the default tail, --grep filters before taking the last N', async () => {
  const other = tmp('other.log');
  fs.writeFileSync(other, 'alpha 1\nbeta 2\nalpha 3\nbeta 4\nalpha 5\n');
  const out = tmp('cmd2.out');
  const r = await run(['--out', out, '--tail', `${other}:2`, '--grep', 'alpha', '--', 'true']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--- .*other\.log \(last 2 lines\)\nalpha 3\nalpha 5\n$/);
  assert.ok(!r.stdout.includes(`--- ${out}`));
});

test('--: signal death gives 128+signal', async () => {
  const r = await run(['--out', tmp('sig.out'), '--', 'sh', '-c', 'kill -9 $$']);
  assert.equal(r.code, 137);
  assert.match(first(r), /^failed: killed by SIGKILL \(exit 137\) after/);
});

test('--: --fail kills the command (whole process group), exit 2, line printed', async () => {
  const pidf = tmp('child.pid'), out = tmp('failkill.out');
  const t0 = Date.now();
  const r = await run(['--out', out, '--fail', 'Traceback', '--timeout', '20s', '--',
    'sh', '-c', `echo $$ > ${pidf}; echo step 1; echo 'Traceback: boom'; sleep 30`]);
  assert.equal(r.code, 2);
  assert.match(first(r), /^failed: output matched \/Traceback\/ after \ds: Traceback: boom$/);
  assert.match(r.stdout, /Traceback: boom\n$/);
  assert.ok(Date.now() - t0 < 6000, 'killed promptly');
  await delay(100);
  assert.ok(!alive(Number(fs.readFileSync(pidf, 'utf8'))), 'child is gone');
});

test('--: timeout kills the command, exit 124, last progress shown', async () => {
  const pidf = tmp('to.pid');
  const t0 = Date.now();
  const r = await run(['--out', tmp('to.out'), '--timeout', '1s', '--progress', 'epoch \\d+', '--',
    'sh', '-c', `echo $$ > ${pidf}; echo epoch 1; echo epoch 2; echo done-ish; sleep 30`]);
  assert.equal(r.code, 124);
  const lines = r.stdout.split('\n');
  assert.match(lines[0], /^timeout after 1s: still waiting for command to exit: sh -c /);
  assert.equal(lines[1], 'last progress: epoch 2');
  assert.ok(Date.now() - t0 < 5000);
  await delay(100);
  assert.ok(!alive(Number(fs.readFileSync(pidf, 'utf8'))));
});

test('--: a command ignoring SIGTERM is SIGKILLed after 5 s', async () => {
  const t0 = Date.now();
  const r = await run(['--out', tmp('stubborn.out'), '--timeout', '1s', '--',
    'sh', '-c', `trap '' TERM; while :; do sleep 0.1; done`]);
  assert.equal(r.code, 124);
  const dt = Date.now() - t0;
  assert.ok(dt >= 5500 && dt < 9500, `took ${dt}`);
});

test('--: SIGTERM to waitfor is forwarded to the child, exit 130, "interrupted"', async () => {
  const pidf = tmp('int.pid');
  const p = start(['--out', tmp('int.out'), '--timeout', '30s', '--', 'sh', '-c', `echo $$ > ${pidf}; echo started; sleep 30`]);
  await delay(600);
  const childPid = Number(fs.readFileSync(pidf, 'utf8'));
  assert.ok(alive(childPid));
  p.child.kill('SIGTERM');
  const r = await p.done;
  assert.equal(r.code, 130);
  assert.match(first(r), /^interrupted after \ds$/);
  assert.match(r.stdout, /started\n$/);
  await delay(100);
  assert.ok(!alive(childPid));
});

test('SIGINT in the condition form: exit 130', async () => {
  const p = start(['--file', tmp('never'), '--every', '100ms', '--timeout', '30s']);
  await delay(400);
  p.child.kill('SIGINT');
  const r = await p.done;
  assert.equal(r.code, 130);
  assert.match(first(r), /^interrupted after \ds$/);
});

test('--: command that cannot be started is a runtime error (exit 3)', async () => {
  const r = await run(['--out', tmp('enoent.out'), '--', 'definitely-not-a-command-xyz']);
  assert.equal(r.code, 3);
  assert.match(first(r), /^error: cannot run 'definitely-not-a-command-xyz': ENOENT$/);
});

// ---------------------------------------------------------------- output shaping
test('output cap: keeps header and the END of the tail, says how many lines were dropped', async () => {
  const f = tmp('big.log');
  fs.writeFileSync(f, Array.from({ length: 100 }, (_, i) => `line ${String(i).padStart(3, '0')} ${'x'.repeat(40)}`).join('\n') + '\n');
  const r = await run(['--file', f, '--tail', `${f}:100`, '--max-chars', '400']);
  assert.equal(r.code, 0);
  assert.ok(r.stdout.length <= 400, `len ${r.stdout.length}`);
  assert.match(first(r), /^done: file .* exists/);
  assert.match(r.stdout, /last \d+ of 100 lines; \d+ dropped/);
  assert.match(r.stdout, /line 099 x+\n$/);
  assert.ok(!r.stdout.includes('line 000'));
});

test('output cap: budget is shared between several tails; long lines are cut to 300 chars', async () => {
  const a = tmp('a.log'), b = tmp('b.log'), f = tmp('flag-file');
  fs.writeFileSync(f, '');
  fs.writeFileSync(a, 'y'.repeat(1000) + '\n');
  fs.writeFileSync(b, Array.from({ length: 50 }, (_, i) => `b${i}`).join('\n') + '\n');
  let r = await run(['--file', f, '--tail', a, '--tail', `${b}:50`, '--max-chars', '450']);
  assert.ok(r.stdout.length <= 450, `len ${r.stdout.length}`);
  assert.ok(r.stdout.split('\n').every((l) => l.length <= 300));
  assert.match(r.stdout, /--- .*a\.log \(last 0 of 1 lines; 1 dropped for --max-chars\)\n/);
  assert.match(r.stdout, /--- .*b\.log \(last \d+ of 50 lines; \d+ dropped for --max-chars\)\nb\d+\n/);
  assert.match(r.stdout, /b49\n$/);
  r = await run(['--file', f, '--tail', a, '--tail', `${b}:50`, '--max-chars', '800']);
  assert.ok(r.stdout.length <= 800, `len ${r.stdout.length}`);
  assert.match(r.stdout, /--- .*a\.log \(last 1 lines\)\ny{299}…\n/);
  r = await run(['--file', f, '--tail', a, '--max-chars', '5000']);
  assert.match(r.stdout, /y{299}…\n$/);
});

test('--tail: missing file and --grep with no matches are reported, not fatal', async () => {
  const f = tmp('t1'), g = tmp('t2');
  fs.writeFileSync(f, 'one\ntwo\n');
  const r = await run(['--file', f, '--tail', g, '--tail', f, '--grep', 'zzz']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--- .*t2 \(missing\)\n--- .*t1 \(no lines match --grep\)\n$/);
});

test('tails strip ANSI colours and keep the last carriage-return segment (progress bars)', async () => {
  const f = tmp('ansi'), flag = tmp('ansi-flag');
  fs.writeFileSync(flag, '');
  fs.writeFileSync(f, '\x1b[31mred\x1b[0m\n 10%\r 50%\r100%\n');
  const r = await run(['--file', flag, '--tail', f]);
  assert.match(r.stdout, /\(last 2 lines\)\nred\n100%\n$/);
});

test('--quiet: only the header line', async () => {
  const f = tmp('q');
  fs.writeFileSync(f, 'x\n');
  const r = await run(['--file', f, '--tail', f, '--quiet']);
  assert.equal(r.stdout.trim().split('\n').length, 1);
});

// ---------------------------------------------------------------- durations, usage, help
test('duration parsing and formatting', async () => {
  const d = await run(['--_dur', '90', '90s', '15m', '2h', '1h30m', '500ms', '0.5', '1h30', '', 'abc', '0', '-5']);
  const l = d.stdout.trim().split('\n');
  assert.deepEqual(l.slice(0, 7), ['90000', '90000', '900000', '7200000', '5400000', '500', '500']);
  assert.ok(l.slice(7).every((x) => x.startsWith('ERR bad duration')), l.join('|'));
  const f = await run(['--_fmt', '41000', '751000', '182000', '3722000', '120000', '1800000', '0', '5400000']);
  assert.deepEqual(f.stdout.trim().split('\n'), ['41s', '12m31s', '3m02s', '1h02m', '2m', '30m', '0s', '1h30m']);
});

test('duration values are applied: --timeout 1s and --timeout 0.5', async () => {
  const f = tmp('dur-nope');
  let t0 = Date.now();
  let r = await run(['--file', f, '--timeout', '1s', '--every', '100ms']);
  assert.equal(r.code, 124);
  assert.ok(Date.now() - t0 < 2500);
  assert.match(first(r), /^timeout after 1s:/);
  t0 = Date.now();
  r = await run(['--file', f, '--timeout', '0.5', '--every', '0.1']);
  assert.equal(r.code, 124);
  assert.ok(Date.now() - t0 < 1500);
});

test('usage errors: exit 64, message + hint on stderr, nothing on stdout', async () => {
  const cases = [
    [['--bogus'], /unknown option '--bogus'/],
    [[], /no condition given/],
    [['--match', 'x', '--log', 'f'], /--match needs a preceding --log/],
    [['--json', 'a=b', '--file', 'x'], /--json needs a preceding --http/],
    [['--status', '200'], /--status needs a preceding --http/],
    [['--body', 'x'], /--body needs a preceding --http/],
    [['--state', 'active'], /--state needs a preceding --unit/],
    [['--via', 'ssh x'], /--via needs a preceding --slurm/],
    [['--system', '--file', 'x'], /--system needs a --unit/],
    [['--log', 'f'], /--log needs a --match/],
    [['--file', 'x', '--timeout', '5x'], /bad duration for --timeout: '5x'/],
    [['--file', 'x', '--every', '0'], /bad duration for --every/],
    [['--proc', '(unclosed'], /invalid regex for --proc: \(unclosed/],
    [['--log', 'f', '--match', '[a-'], /invalid regex for --match/],
    [['--file', 'x', '--log', 'f', '--match', 'a', '--fail', '*'], /invalid regex for --fail/],
    [['--file', 'x', '--grep', '('], /invalid regex for --grep/],
    [['--file', 'x', '--progress', '('], /invalid regex for --progress/],
    [['--pid', 'abc'], /bad pid list/],
    [['--http', 'not a url'], /bad URL/],
    [['--unit', 'a', '--state', 'sleeping'], /--state must be/],
    [['--file'], /--file needs a value/],
    [['stray'], /unexpected argument 'stray'/],
    [['--file', 'x', '--fail', 'E'], /--fail needs a --log/],
    [['--file', 'x', '--out', 'o'], /--out only applies/],
    [['--max-chars', '0', '--file', 'x'], /bad number for --max-chars/],
    [['--tail', 'f:0', '--file', 'x'], /bad --tail/],
    [['--'], /no command given/],
    [['--file', 'x', '--', 'true'], /cannot be combined/],
    [['--slurm', '1; rm -rf /'], /bad job id/],
  ];
  for (const [args, re] of cases) {
    const r = await run(args);
    assert.equal(r.code, 64, `${args.join(' ')} -> ${r.code} ${r.stdout}`);
    assert.equal(r.stdout, '', args.join(' '));
    assert.match(r.stderr, re, args.join(' '));
    assert.match(r.stderr, /^error: .*\nhint: .*\n$/, args.join(' '));
  }
});

test('--help: under 60 lines, five examples, exit 0', async () => {
  const r = await run(['--help']);
  assert.equal(r.code, 0);
  const lines = r.stdout.trimEnd().split('\n');
  assert.ok(lines.length < 60, `${lines.length} lines`);
  const ex = lines.slice(lines.indexOf('Examples:') + 1).filter((l) => l.trim().startsWith('waitfor '));
  assert.equal(ex.length, 5);
});

test('CPU use while waiting is negligible', async () => {
  const f = tmp('cpu.log');
  fs.writeFileSync(f, '');
  const sl = spawn('sleep', ['9.123'], { stdio: 'ignore' });
  const p = start(['--log', f, '--match', 'NEVER', '--proc', 'sleep 9\\.123', '--file', tmp('cpu-never'), '--timeout', '30s']);
  await delay(300);
  const stat = () => {
    const s = fs.readFileSync(`/proc/${p.child.pid}/stat`, 'utf8');
    const fld = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return Number(fld[11]) + Number(fld[12]); // utime + stime in clock ticks (100/s)
  };
  const before = stat();
  await delay(3000);
  const used = stat() - before;
  p.child.kill('SIGTERM');
  await p.done;
  sl.kill();
  assert.ok(used <= 15, `used ${used} ticks of CPU in 3 s`);
});

// ---------------------------------------------------------------- round 2: proc ancestry, partial lines, unit not-found,
// slurm final states, default timeout, regex flags
test('proc: a real target whose path contains "waitfor" is seen', async () => {
  const dir = path.join(TMP, 'waitfor-project');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'run.sh'), 'sleep 2\n');
  const t = spawn('sh', [path.join(dir, 'run.sh')], { stdio: 'ignore' });
  const t0 = Date.now();
  const r = await run(['--proc', 'waitfor-project/run\\.sh', '--every', '100ms', '--timeout', '8s']);
  assert.equal(r.code, 0);
  assert.ok(Date.now() - t0 >= 1500, 'kept waiting for the real target');
  t.kill();
});

test('proc: the calling shell (ancestor) whose cmdline contains the regex is skipped', async () => {
  const r = await new Promise((resolve) => {
    const c = spawn('sh', ['-c', `${process.execPath} ${BIN} --proc ancestor-marker-xyz --every 100ms --timeout 5s; echo rc=$?`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => resolve(out));
  });
  assert.match(r, /^done: no process matching \/ancestor-marker-xyz\/ after/);
  assert.match(r, /rc=0\n$/);
});

test('log: an unterminated last line is matched once it has not grown for 2 s', async () => {
  const f = tmp('idle-partial');
  fs.writeFileSync(f, '');
  const p = start(['--log', f, '--match', '^DONE$', '--every', '100ms', '--timeout', '8s']);
  await delay(300);
  const t0 = Date.now();
  fs.appendFileSync(f, 'DONE');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /: DONE$/);
  const dt = Date.now() - t0;
  assert.ok(dt >= 1800 && dt < 4500, `took ${dt}`);
});

test('log: a pending partial line counts at once when the wait is about to time out', async () => {
  const f = tmp('timeout-partial');
  fs.writeFileSync(f, '');
  const p = start(['--log', f, '--match', '^DONE$', '--every', '100ms', '--timeout', '1s']);
  await delay(300);
  fs.appendFileSync(f, 'DONE');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: .* after 1s: DONE$/);
});

test('--: unterminated last output line is checked against --fail when the command exits', async () => {
  const r = await run(['--out', tmp('partial.out'), '--fail', 'ERROR', '--', 'sh', '-c', 'echo fine; printf "ERROR no newline"']);
  assert.equal(r.code, 2);
  assert.match(first(r), /^failed: output matched \/ERROR\/ after \ds: ERROR no newline$/);
});

test('unit: LoadState not-found is an error (exit 3), real and Key=Value output', async () => {
  let { dir, env } = fakeEnv();
  sysOut(dir, 'success\nnot-found\ninactive\ndead\n'); // Result, LoadState, ActiveState, SubState (real systemd order)
  let r = await run(['--unit', 'typo.service', '--every', '100ms', '--timeout', '5s'], { env });
  assert.equal(r.code, 3);
  assert.equal(first(r), 'error: unit typo.service not found');
  ({ dir, env } = fakeEnv());
  sysOut(dir, 'LoadState=not-found\nActiveState=inactive\nSubState=dead\nResult=success\n');
  r = await run(['--unit', 'typo.service', '--state', 'active', '--every', '100ms', '--timeout', '5s'], { env });
  assert.equal(r.code, 3);
  assert.equal(first(r), 'error: unit typo.service not found');
  ({ dir, env } = fakeEnv());
  sysOut(dir, 'success\nloaded\nactive\nrunning\n', 1);
  sysOut(dir, 'success\nnot-found\ninactive\ndead\n');
  r = await run(['--unit', 'transient.service', '--every', '100ms', '--timeout', '5s'], { env });
  assert.equal(r.code, 0, 'a unit that was loaded and then garbage-collected has finished');
  assert.match(first(r), /^done: unit transient\.service inactive \(no longer loaded\)/);
});

test('slurm: sacct state other than COMPLETED is a failure (exit 2) with state, exit code and elapsed', async () => {
  const cases = [
    ['FAILED      1:0   00:12:01', /^failed: slurm 5 ended FAILED \(1:0, 00:12:01\) after \ds$/],
    ['CANCELLED by 1000  0:0 00:00:30', /^failed: slurm 5 ended CANCELLED \(0:0, 00:00:30\)/],
    ['CANCELLED+   0:0 00:00:30', /ended CANCELLED \(0:0, 00:00:30\)/],
    ['TIMEOUT     0:0   01:00:00', /ended TIMEOUT \(0:0, 01:00:00\)/],
    ['OUT_OF_MEMORY 0:125 00:03:00', /ended OUT_OF_MEMORY \(0:125, 00:03:00\)/],
    ['NODE_FAIL   0:0 00:01:00', /ended NODE_FAIL/],
    ['PREEMPTED   0:0 00:01:00', /ended PREEMPTED/],
    ['COMPLETED 0:0 00:00:05\nFAILED 1:0 00:00:06', /ended FAILED \(1:0, 00:00:06\)/], // job array
  ];
  for (const [out, re] of cases) {
    const { env } = fakeEnv({ FAKE_SACCT_OUT: out });
    const r = await run(['--slurm', '5', '--every', '100ms', '--timeout', '5s'], { env });
    assert.equal(r.code, 2, out);
    assert.match(first(r), re, out);
  }
});

test('slurm: sacct still saying RUNNING after the job left squeue keeps waiting; empty sacct output is "unknown"', async () => {
  let { env } = fakeEnv({ FAKE_SACCT_OUT: 'RUNNING 0:0 00:00:05' });
  let r = await run(['--slurm', '5', '--every', '100ms', '--timeout', '600ms'], { env });
  assert.equal(r.code, 124);
  assert.match(first(r), /slurm 5 \(left squeue, sacct says RUNNING\)/);
  ({ env } = fakeEnv({ FAKE_SACCT_OUT: ' ' }));
  r = await run(['--slurm', '5', '--every', '100ms', '--timeout', '5s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), /\(final state unknown: sacct returned nothing\)$/);
});

test('default timeout: 10m in the condition form (hinted in the message), none in the -- form', async () => {
  const env = { WAITFOR_DEFAULT_TIMEOUT: '700ms' }; // test hook standing in for the 10m default
  let r = await run(['--file', tmp('dt-never'), '--every', '100ms'], { env });
  assert.equal(r.code, 124);
  assert.match(first(r), /^timeout after 1s: still waiting for file .*dt-never \(missing\) \(--timeout to wait longer\)$/);
  r = await run(['--file', tmp('dt-never2'), '--every', '100ms', '--timeout', '700ms'], { env });
  assert.equal(r.code, 124);
  assert.ok(!first(r).includes('--timeout to wait longer'));
  r = await run(['--out', tmp('dt.out'), '--', 'sh', '-c', 'sleep 1.5; echo finished'], { env });
  assert.equal(r.code, 0, r.stdout);
  assert.match(first(r), /^done: exit 0 after 2s/);
});

test('regex flags: /pattern/flags is accepted everywhere, plain patterns stay as given', async () => {
  const f = tmp('flags.log');
  fs.writeFileSync(f, '');
  const p = start(['--log', f, '--match', '/^build ok$/i', '--fail', '/^FATAL/m', '--every', '100ms', '--timeout', '8s']);
  await delay(300);
  fs.appendFileSync(f, 'noise\nBuild OK\n');
  let r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /matched \/\^build ok\$\/i after \ds: Build OK$/);

  const g = tmp('flags2.log');
  fs.writeFileSync(g, '');
  const p2 = start(['--log', g, '--match', 'x', '--fail', '/fatal error/i', '--every', '100ms', '--timeout', '8s']);
  await delay(300);
  fs.appendFileSync(g, 'FATAL ERROR: oom\n');
  r = await p2.done;
  assert.equal(r.code, 2);
  assert.match(first(r), /^failed: .* matched \/fatal error\/i after/);

  // a path-like pattern is not mistaken for /pattern/flags
  const sl = spawn('sleep', ['1.9'], { stdio: 'ignore' });
  r = await run(['--proc', '/usr/bin/sleep 1\\.9|^sleep 1\\.9', '--every', '100ms', '--timeout', '8s']);
  assert.equal(r.code, 0);
  sl.kill();
  r = await run(['--proc', '/(/i']);
  assert.equal(r.code, 64);
  assert.match(r.stderr, /invalid regex for --proc: \/\(\/i/);
  r = await run(['--help']);
  assert.match(r.stdout, /\/pattern\/flags \(flags i, m, s, u\)/);
  assert.match(r.stdout, /truncated and regrown/);
});

// ---------------------------------------------------------------- macOS / Windows code paths, run on Linux
// WAITFOR_FAKE_PLATFORM (hidden seam) makes waitfor take the darwin / win32 branches; fake ps / powershell / taskkill
// scripts first on PATH stand in for the real tools, the way systemctl and squeue are faked above.
// ps and powershell print their table from $FAKE_DIR/<tool>.out.<call number> (else <tool>.out), after the rows a
// real process listing would always contain: waitfor itself, its caller and grandparent, and the listing tool.
const MARK = 'zzmark';
fakeScript('ps', `
printf '%s|%s\\n' "$*" "$COLUMNS" >> "$FAKE_DIR/ps.args"
n=$(cat "$FAKE_DIR/ps.count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "$FAKE_DIR/ps.count"
[ -f "$FAKE_DIR/ps.fail" ] && { echo "ps: Operation not permitted" >&2; exit 1; }
f="$FAKE_DIR/ps.out.$n"; [ -f "$f" ] || f="$FAKE_DIR/ps.out"
printf '%7s %5s %-4s %s\\n' 1 0 Ss /sbin/launchd
printf '%7s %5s %-4s %s\\n' 888 1 Ss "/bin/zsh -l -c ${MARK} grandparent"
printf '%7s %5s %-4s %s\\n' "$FAKE_PARENT" 888 S "sh -c waitfor --proc ${MARK} caller"
printf '%7s %5s %-4s %s\\n' "$PPID" "$FAKE_PARENT" S "node /opt/agent tools/bin/waitfor --proc ${MARK}"
printf '%7s %5s %-4s %s\\n' "$$" "$PPID" R "ps -axo pid=,ppid=,stat=,command= ${MARK}"
cat "$f" 2>/dev/null
exit 0
`);
fakeScript('powershell', `
printf '%s\\n' "$*" >> "$FAKE_DIR/powershell.args"
n=$(cat "$FAKE_DIR/powershell.count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "$FAKE_DIR/powershell.count"
[ -f "$FAKE_DIR/powershell.fail" ] && { echo "powershell: access denied" >&2; exit 1; }
f="$FAKE_DIR/cim.out.$n"; [ -f "$f" ] || f="$FAKE_DIR/cim.out"
sed -e "s/@SELF@/$PPID/g" -e "s/@PARENT@/$FAKE_PARENT/g" -e "s/@PS@/$$/g" "$f"
`);
// taskkill /PID n /T /F: logs its arguments and kills the tree below n
fakeScript('taskkill', `
printf '%s\\n' "$*" >> "$FAKE_DIR/taskkill.args"
pkill -9 -P "$2" 2>/dev/null
kill -9 "$2" 2>/dev/null
exit 0
`);
const EMPTY_BIN = path.join(TMP, 'emptybin');
fs.mkdirSync(EMPTY_BIN);
function platEnv(platform, extra = {}) {
  return fakeEnv({ WAITFOR_FAKE_PLATFORM: platform, FAKE_PARENT: String(process.pid), ...extra });
}
const writeOut = (dir, name, text) => fs.writeFileSync(path.join(dir, name), text);
const lines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);

test('ps parser: pid, ppid, state and the whole command line (macOS sample, spaces, zombies, no command)', async () => {
  const sample = [
    '    1     0 Ss   /sbin/launchd',
    '  412     1 S    /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --type=renderer --lang=en-US',
    '  913   412 Z+   (sh)',
    '  914     1 R<s+ node /Users/dev/my project/bin/waitfor --proc "a b"',
    ' 5000     1 U',
    'not a process line',
    '',
  ].join('\n');
  const r = spawnSync(process.execPath, [BIN, '--_parse', 'ps'], { input: sample, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(r.stdout), [
    { pid: 1, ppid: 0, state: 'Ss', cmd: '/sbin/launchd' },
    { pid: 412, ppid: 1, state: 'S', cmd: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --type=renderer --lang=en-US' },
    { pid: 913, ppid: 412, state: 'Z+', cmd: '(sh)' },
    { pid: 914, ppid: 1, state: 'R<s+', cmd: 'node /Users/dev/my project/bin/waitfor --proc "a b"' },
    { pid: 5000, ppid: 1, state: 'U', cmd: '' },
  ]);
  // CRLF line ends do not leak into the command
  const crlf = spawnSync(process.execPath, [BIN, '--_parse', 'ps'], { input: '  7  1 S  sleep 5\r\n', encoding: 'utf8' });
  assert.deepEqual(JSON.parse(crlf.stdout), [{ pid: 7, ppid: 1, state: 'S', cmd: 'sleep 5' }]);
});

test('CIM parser: array, single object, null CommandLine, empty output, BOM, bad JSON', async () => {
  const parse = (text) => JSON.parse(spawnSync(process.execPath, [BIN, '--_parse', 'cim'], { input: text, encoding: 'utf8' }).stdout);
  const many = '[{"ProcessId":0,"ParentProcessId":0,"CommandLine":null},{"ProcessId":4,"ParentProcessId":0,"CommandLine":null},'
    + '{"ProcessId":5120,"ParentProcessId":4400,"CommandLine":"\\"C:\\\\Program Files\\\\nodejs\\\\node.exe\\" C:\\\\work\\\\train.js --epochs 5"}]';
  assert.deepEqual(parse(many), [
    { pid: 0, ppid: 0, state: '', cmd: '' },
    { pid: 4, ppid: 0, state: '', cmd: '' },
    { pid: 5120, ppid: 4400, state: '', cmd: '"C:\\Program Files\\nodejs\\node.exe" C:\\work\\train.js --epochs 5' },
  ]);
  assert.deepEqual(parse('{"ProcessId":77,"ParentProcessId":5,"CommandLine":"x.exe a"}\r\n'), [{ pid: 77, ppid: 5, state: '', cmd: 'x.exe a' }]);
  assert.deepEqual(parse('\uFEFF[{"ProcessId":8,"ParentProcessId":1,"CommandLine":"a"}]'), [{ pid: 8, ppid: 1, state: '', cmd: 'a' }]);
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('null'), []);
  assert.match(parse('not json'), /^ERR /);
});

test('darwin --pid: listed pid keeps waiting, a zombie or an unlisted pid counts as exited; ps gets the documented arguments', async () => {
  const { dir, env } = platEnv('darwin');
  writeOut(dir, 'ps.out.1', '4242     1 S    /usr/bin/python3 train.py\n');
  writeOut(dir, 'ps.out.2', '4242     1 S    /usr/bin/python3 train.py\n');
  writeOut(dir, 'ps.out.3', '4242     1 Z+   (python3)\n');
  const r = await run(['--pid', '4242', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0, r.stdout);
  assert.match(first(r), /^done: pid 4242 exited after [01]s$/);
  assert.equal(Number(fs.readFileSync(path.join(dir, 'ps.count'), 'utf8')), 3);
  assert.equal(lines(path.join(dir, 'ps.args'))[0], '-axo pid=,ppid=,stat=,command=|100000');
  const { env: env2 } = platEnv('darwin');
  const r2 = await run(['--pid', '4242,999999', '--every', '100ms', '--timeout', '8s'], { env: env2 });
  assert.equal(r2.code, 0);
  assert.match(first(r2), /^done: pid 4242,999999 exited/);
});

test('darwin --pid: all pids must be gone; a pid that stays listed times out', async () => {
  const { dir, env } = platEnv('darwin');
  writeOut(dir, 'ps.out', '4242     1 S    sleep 1000\n');
  const r = await run(['--pid', '4242', '--every', '100ms', '--timeout', '700ms'], { env });
  assert.equal(r.code, 124);
  assert.match(first(r), /^timeout after \ds: still waiting for pid 4242 running/);
});

test('darwin --pid: a ps that fails is not "gone"; 5 failures in a row stop with exit 3', async () => {
  const { dir, env } = platEnv('darwin');
  writeOut(dir, 'ps.fail', '');
  const r = await run(['--pid', '4242', '--every', '50ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 3);
  assert.match(first(r), /^error: --pid: listing processes failed 5 times in a row: ps: Operation not permitted$/);
  assert.equal(Number(fs.readFileSync(path.join(dir, 'ps.count'), 'utf8')), 5);
});

test('darwin: no ps on PATH is a runtime error (exit 3)', async () => {
  const r = await run(['--proc', 'x', '--every', '50ms', '--timeout', '8s'], { env: { PATH: EMPTY_BIN, WAITFOR_FAKE_PLATFORM: 'darwin' } });
  assert.equal(r.code, 3);
  assert.match(first(r), /^error: ps not found/);
});

test('darwin --proc: matches full command lines; skips waitfor, its callers, its own ps and zombies; names the pid', async () => {
  const { dir, env } = platEnv('darwin');
  writeOut(dir, 'ps.out', [
    '  300     1 S    /usr/bin/python3 /Users/dev/my project/train.py --epochs 5',
    `  301     1 Z    ${MARK}-zombie`,
    `  302     1 S    /opt/tool/bin/worker --name ${MARK} --verbose`,
  ].join('\n') + '\n');
  const r = await run(['--proc', MARK, '--every', '100ms', '--timeout', '600ms'], { env });
  assert.equal(r.code, 124);
  assert.match(first(r), new RegExp(`^timeout after \\ds: still waiting for proc /${MARK}/ still running \\(pid 302\\)$`));
  // the command line has spaces: a regex over the whole line finds the first process
  const r2 = await run(['--proc', 'my project/train\\.py --epochs', '--every', '100ms', '--timeout', '600ms'], { env });
  assert.match(first(r2), /\(pid 300\)$/);
});

test('darwin --proc: done once only the excluded rows (self, callers, ps itself, a zombie) match', async () => {
  const { dir, env } = platEnv('darwin');
  writeOut(dir, 'ps.out.1', `  302     1 S    /opt/tool/bin/worker --name ${MARK}\n`);
  writeOut(dir, 'ps.out.2', `  302     1 S    /opt/tool/bin/worker --name ${MARK}\n`);
  writeOut(dir, 'ps.out.3', `  302     1 Z    (worker)\n  303 1 Z+ ${MARK}-defunct\n`);
  const r = await run(['--proc', MARK, '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0, r.stdout);
  assert.match(first(r), new RegExp(`^done: no process matching /${MARK}/ after`));
  assert.ok(Number(fs.readFileSync(path.join(dir, 'ps.count'), 'utf8')) >= 3);
});

test('darwin: --unit is refused before waiting, exit 3, even with other conditions', async () => {
  for (const plat of ['darwin', 'win32']) {
    const t0 = Date.now();
    const r = await run(['--unit', 'x.service', '--timeout', '30s'], { env: { WAITFOR_FAKE_PLATFORM: plat } });
    assert.equal(r.code, 3, plat);
    assert.equal(r.stdout, 'error: --unit needs systemd (Linux only)\n');
    assert.ok(Date.now() - t0 < 3000, 'no waiting');
    const r2 = await run(['--file', tmp('x'), '--unit', 'a.service', '--state', 'active', '--system'], { env: { WAITFOR_FAKE_PLATFORM: plat } });
    assert.equal(r2.code, 3);
    assert.match(first(r2), /^error: --unit needs systemd/);
  }
  // other usage mistakes keep exit 64, and --help still works
  assert.equal((await run(['--unit', 'x', '--system', '--state', 'bad'], { env: { WAITFOR_FAKE_PLATFORM: 'darwin' } })).code, 64);
  assert.equal((await run(['--unit', 'x', '--help'], { env: { WAITFOR_FAKE_PLATFORM: 'darwin' } })).code, 0);
});

test('darwin: --until and --slurm run through sh exactly as on Linux', async () => {
  const { dir, env } = platEnv('darwin', { FAKE_SQUEUE_BUSY: '1' });
  const f = tmp('mac-until');
  const p = start(['--until', `test -f ${f}`, '--every', '100ms', '--timeout', '8s'], { env });
  await delay(400);
  fs.writeFileSync(f, '');
  const r = await p.done;
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: until 'test -f .*' succeeded/);
  const r2 = await run(['--slurm', '77', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r2.code, 0);
  assert.match(first(r2), /^done: slurm 77 left the queue/);
  assert.equal(lines(path.join(dir, 'squeue.args'))[0], '-h -j 77 -o %T');
});

test('win32 --pid: process.kill(pid, 0) decides; a live process keeps waiting, a gone one counts as exited', async () => {
  const { env } = platEnv('win32');
  const sl = spawn('sleep', ['1'], { stdio: 'ignore' });
  const t0 = Date.now();
  const r = await run(['--pid', `${sl.pid},999999`, '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0);
  assert.match(first(r), new RegExp(`^done: pid ${sl.pid},999999 exited after`));
  assert.ok(Date.now() - t0 >= 900, 'waited for the live pid');
});

const CIM_ROWS = (...extra) => '[' + [
  '{"ProcessId":0,"ParentProcessId":0,"CommandLine":null}',
  '{"ProcessId":4,"ParentProcessId":0,"CommandLine":null}',
  `{"ProcessId":@PARENT@,"ParentProcessId":6000,"CommandLine":"bash -c \\"waitfor --proc ${MARK}\\""}`,
  `{"ProcessId":6000,"ParentProcessId":1,"CommandLine":"C:\\\\Git\\\\usr\\\\bin\\\\bash.exe ${MARK}"}`,
  `{"ProcessId":@SELF@,"ParentProcessId":@PARENT@,"CommandLine":"node waitfor --proc ${MARK}"}`,
  `{"ProcessId":@PS@,"ParentProcessId":@SELF@,"CommandLine":"powershell -NoProfile ... Get-CimInstance ${MARK}"}`,
  ...extra,
].join(',') + ']';

test('win32 --proc: PowerShell/CIM JSON, null command lines, callers and its own powershell excluded, exact arguments', async () => {
  const { dir, env } = platEnv('win32');
  writeOut(dir, 'cim.out', CIM_ROWS(`{"ProcessId":7100,"ParentProcessId":1,"CommandLine":"\\"C:\\\\Python\\\\python.exe\\" train.py --tag ${MARK} run"}`));
  const r = await run(['--proc', `train\\.py --tag ${MARK}`, '--every', '100ms', '--timeout', '800ms'], { env });
  assert.equal(r.code, 124);
  assert.match(first(r), /still running \(pid 7100\)$/);
  assert.equal(lines(path.join(dir, 'powershell.args'))[0],
    '-NoProfile -NonInteractive -Command Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress');
  // only the excluded rows match the marker: nothing is running
  writeOut(dir, 'cim.out', CIM_ROWS());
  const r2 = await run(['--proc', MARK, '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r2.code, 0, r2.stdout);
  assert.match(first(r2), new RegExp(`^done: no process matching /${MARK}/`));
});

test('win32 --proc: a single process is a bare JSON object, an empty list is null', async () => {
  const { dir, env } = platEnv('win32');
  writeOut(dir, 'cim.out.1', '{"ProcessId":7100,"ParentProcessId":1,"CommandLine":"node build.js"}\n');
  writeOut(dir, 'cim.out.2', 'null\n');
  const r = await run(['--proc', 'node build\\.js', '--every', '100ms', '--timeout', '8s'], { env });
  assert.equal(r.code, 0, r.stdout);
  assert.match(first(r), /^done: no process matching/);
  assert.equal(Number(fs.readFileSync(path.join(dir, 'powershell.count'), 'utf8')), 2);
});

test('win32 --proc: no PowerShell is a clear error (exit 3); a failing one is retried, 5 failures stop', async () => {
  const r = await run(['--proc', 'x', '--every', '50ms', '--timeout', '8s'], { env: { PATH: EMPTY_BIN, WAITFOR_FAKE_PLATFORM: 'win32' } });
  assert.equal(r.code, 3);
  assert.equal(first(r), 'error: --proc needs PowerShell on Windows');
  const { dir, env } = platEnv('win32');
  writeOut(dir, 'powershell.fail', '');
  const r2 = await run(['--proc', 'x', '--every', '50ms', '--timeout', '30s'], { env });
  assert.equal(r2.code, 3);
  assert.match(first(r2), /^error: --proc: listing processes failed 5 times in a row: powershell: access denied$/);
  const { dir: d3, env: env3 } = platEnv('win32');
  writeOut(d3, 'cim.out', 'Get-CimInstance : something went wrong\n');
  const r3 = await run(['--proc', 'x', '--every', '50ms', '--timeout', '30s'], { env: env3 });
  assert.match(first(r3), /^error: --proc: listing processes failed 5 times in a row: powershell output is not JSON$/);
});

test('win32: --until and --slurm need sh; without one the error names Git for Windows (exit 3, before waiting)', async () => {
  const env = { PATH: EMPTY_BIN, WAITFOR_FAKE_PLATFORM: 'win32' };
  for (const [args, flag] of [[['--until', 'true'], '--until'], [['--slurm', '5', '--via', 'ssh x'], '--slurm'], [['--until', 'true', '--slurm', '5'], '--until and --slurm']]) {
    const t0 = Date.now();
    const r = await run([...args, '--timeout', '30s'], { env });
    assert.equal(r.code, 3, args.join(' '));
    assert.match(first(r), new RegExp(`^error: ${flag} needs sh on PATH \\(install Git for Windows`));
    assert.ok(Date.now() - t0 < 3000);
  }
  // with sh on PATH they work
  const { env: ok } = platEnv('win32');
  const r = await run(['--until', 'exit 0', '--timeout', '8s'], { env: ok });
  assert.equal(r.code, 0);
  assert.match(first(r), /^done: until 'exit 0' succeeded/);
});

test('win32 `--` form: command runs, exit code passes through, output is captured', async () => {
  const { env } = platEnv('win32');
  const out = tmp('win-cmd.out');
  const r = await run(['--out', out, '--', 'sh', '-c', 'echo hello from win; exit 7'], { env });
  assert.equal(r.code, 7);
  assert.match(first(r), /^failed: exit 7 after \ds: sh -c /);
  assert.match(r.stdout, /hello from win\n$/);
  assert.match(fs.readFileSync(out, 'utf8'), /hello from win/);
});

test('win32 `--` form: a script without .exe (.cmd / extensionless) is started through sh', async () => {
  const { dir, env } = platEnv('win32');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const n of ['mytool', 'other.cmd']) fs.writeFileSync(path.join(bin, n), '#!/bin/sh\necho "ran $0-$1"\n', { mode: 0o755 });
  const e = { ...env, PATH: `${bin}:${env.PATH}` };
  const r = await run(['--out', tmp('win-script.out'), '--', 'mytool', 'a'], { env: e });
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /ran .*mytool-a\n$/);
  const r2 = await run(['--out', tmp('win-script2.out'), '--', 'other.cmd', 'b'], { env: e });
  assert.equal(r2.code, 0, r2.stdout);
  assert.match(r2.stdout, /ran .*other\.cmd-b\n$/);
  // a program that does not exist at all is still "cannot run ... ENOENT"
  const r3 = await run(['--out', tmp('win-enoent.out'), '--', 'definitely-not-a-command-xyz'], { env: e });
  assert.equal(r3.code, 3);
  assert.match(first(r3), /^error: cannot run 'definitely-not-a-command-xyz': ENOENT$/);
});

test('win32 `--` form: timeout stops the command with `taskkill /PID <pid> /T /F`; no process group is used', async () => {
  const { dir, env } = platEnv('win32');
  const pidf = tmp('win-to.pid');
  const t0 = Date.now();
  const r = await run(['--out', tmp('win-to.out'), '--timeout', '1s', '--', 'sh', '-c', `echo $$ > ${pidf}; sleep 30 & wait`], { env });
  assert.equal(r.code, 124);
  assert.ok(Date.now() - t0 < 5000, 'stopped promptly');
  const pid = Number(fs.readFileSync(pidf, 'utf8'));
  assert.deepEqual(lines(path.join(dir, 'taskkill.args')), [`/PID ${pid} /T /F`]);
  await delay(200);
  assert.ok(!alive(pid), 'child is gone');
});

test('win32 `--` form: --fail and SIGTERM to waitfor also use taskkill', async () => {
  const { dir, env } = platEnv('win32');
  const pidf = tmp('win-fail.pid');
  const r = await run(['--out', tmp('win-fail.out'), '--fail', 'Traceback', '--timeout', '20s', '--',
    'sh', '-c', `echo $$ > ${pidf}; echo 'Traceback: boom'; sleep 30`], { env });
  assert.equal(r.code, 2);
  assert.match(first(r), /^failed: output matched \/Traceback\/ after \ds: Traceback: boom$/);
  const pid = Number(fs.readFileSync(pidf, 'utf8'));
  assert.deepEqual(lines(path.join(dir, 'taskkill.args')), [`/PID ${pid} /T /F`]);
  await delay(200);
  assert.ok(!alive(pid));

  const { dir: d2, env: env2 } = platEnv('win32');
  const pidf2 = tmp('win-int.pid');
  const p = start(['--out', tmp('win-int.out'), '--timeout', '30s', '--', 'sh', '-c', `echo $$ > ${pidf2}; echo started; sleep 30`], { env: env2 });
  await delay(600);
  const pid2 = Number(fs.readFileSync(pidf2, 'utf8'));
  p.child.kill('SIGTERM');
  const r2 = await p.done;
  assert.equal(r2.code, 130);
  assert.deepEqual(lines(path.join(d2, 'taskkill.args')), [`/PID ${pid2} /T /F`]);
  await delay(200);
  assert.ok(!alive(pid2));
});

test('win32 `--` form: without taskkill the child itself is killed instead', async () => {
  const { env } = platEnv('win32');
  // a PATH with the basic tools but no taskkill
  const bin = path.join(TMP, 'notaskkill');
  fs.mkdirSync(bin, { recursive: true });
  for (const n of ['sh', 'sleep', 'echo']) {
    const real = ['/bin', '/usr/bin'].map((d) => path.join(d, n)).find((f) => fs.existsSync(f));
    if (real) fs.symlinkSync(real, path.join(bin, n));
  }
  const pidf = tmp('win-notk.pid');
  const r = await run(['--out', tmp('win-notk.out'), '--timeout', '1s', '--', 'sh', '-c', `echo $$ > ${pidf}; exec sleep 30`], { env: { ...env, PATH: bin } });
  assert.equal(r.code, 124);
  await delay(200);
  assert.ok(!alive(Number(fs.readFileSync(pidf, 'utf8'))), 'child was killed through child.kill()');
});

test('--help names the platform limits and stays under 45 lines', async () => {
  const r = await run(['--help']);
  const ls = r.stdout.trimEnd().split('\n');
  assert.ok(ls.length < 45, `${ls.length} lines`);
  const l = ls.find((x) => x.startsWith('Platforms:'));
  assert.match(l, /--unit is Linux only/);
  assert.match(l, /Git for Windows/);
  assert.match(l, /PowerShell/);
});

test('pid (Linux /proc): a zombie that nobody has reaped counts as exited', async () => {
  // `sleep 0.2` becomes a zombie of the `sleep 4` that sh turns into with exec (it never calls wait)
  const holder = spawn('sh', ['-c', 'sleep 0.2 & echo $!; exec sleep 4'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const zpid = await new Promise((resolve) => holder.stdout.once('data', (d) => resolve(Number(String(d).trim()))));
  await delay(600);
  assert.match(fs.readFileSync(`/proc/${zpid}/stat`, 'utf8'), /^\d+ \(sleep\) Z /, 'is a zombie');
  const t0 = Date.now();
  const r = await run(['--pid', String(zpid), '--every', '100ms', '--timeout', '8s']);
  holder.kill();
  assert.equal(r.code, 0);
  assert.match(first(r), new RegExp(`^done: pid ${zpid} exited after`));
  assert.ok(Date.now() - t0 < 2500, 'did not wait for the holder to exit');
});
