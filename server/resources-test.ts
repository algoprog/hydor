// Script tests for each session's share of the computer and its limits (resources.ts): a tree of programs measured from
// its root, the CPU it spent since the last look, programs that came and went; the limits a session starts under, and
// the scope that holds them; a real tree measured on this computer; and, where the user's systemd takes scopes, a
// program over its session's memory stopped while the session goes on.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/resources-test.ts && DATA_DIR=/tmp/hydor-test-resources node dist/dev/resources-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.ts';
import { limitsOf, limitSupport, oomKills, SessionMeter, setLimits, setLimitSupportForTests, treeUsage, wrapRunner, type Proc } from './resources.ts';

const tmp = fs.mkdtempSync(path.join(process.env.DATA_DIR ?? '/tmp', 'resources-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const MB = 1024 * 1024;

test('a tree from its root: every program under it, the CPU spent since the last look, new ones from their start', () => {
  const table = new Map<number, Proc>([
    [100, { ppid: 1, cpu: 10, rss: 50 * MB }],
    [101, { ppid: 100, cpu: 30, rss: 300 * MB }],
    [102, { ppid: 101, cpu: 5, rss: 20 * MB }],
    [200, { ppid: 1, cpu: 2, rss: 10 * MB }],
    [300, { ppid: 1, cpu: 99, rss: 999 * MB }],
  ]);
  const prev = new Map([
    [100, 9],
    [101, 28],
    [200, 2],
  ]);
  const u = treeUsage(table, [100, 200, 999], prev, 2);
  assert.deepEqual(u.get(100), { cpu: 400, memory: 370 * MB, procs: 3 }, '(1 + 2 + 5 s, the last new) over 2 s: 4 cores; 102 counts from its start');
  assert.deepEqual(u.get(200), { cpu: 0, memory: 10 * MB, procs: 1 });
  assert.equal(u.has(999), false, 'a root no longer running');
  assert.equal(treeUsage(table, [100], null, 0).get(100)!.cpu, null, 'no CPU on the first look');
});

test('the limits sessions start under, from the choices only', () => {
  assert.deepEqual(limitsOf(db), {});
  assert.deepEqual(setLimits(db, { memoryMb: 4096 }), { memoryMb: 4096 });
  assert.deepEqual(setLimits(db, { cpus: 2 }), { memoryMb: 4096, cpus: 2 });
  assert.throws(() => setLimits(db, { memoryMb: 3000 }), /memoryMb is one of/);
  assert.deepEqual(setLimits(db, { memoryMb: null }), { cpus: 2 });
  assert.deepEqual(limitsOf(db), { cpus: 2 });
});

test('a session’s runner in a scope of its own holding the limits, or as it is', () => {
  setLimitSupportForTests({ ok: true });
  assert.deepEqual(wrapRunner({}, 'r1', '/usr/bin/node', ['runner.js', '/runs/r1']), { cmd: '/usr/bin/node', args: ['runner.js', '/runs/r1'] }, 'no limits: as it is');
  const w = wrapRunner({ memoryMb: 4096, cpus: 2 }, 'r1', '/usr/bin/node', ['runner.js', '/runs/r1']);
  assert.equal(w.cmd, 'systemd-run');
  assert.deepEqual(w.args, [
    '--user',
    '--scope',
    '-q',
    '--collect',
    '--unit=hydor-run-r1',
    '-p',
    'MemoryMax=4096M',
    '-p',
    'MemorySwapMax=0',
    '-p',
    'OOMPolicy=continue',
    '-p',
    'CPUQuota=200%',
    '--',
    '/usr/bin/node',
    'runner.js',
    '/runs/r1',
  ]);
  assert.equal(w.scope, 'hydor-run-r1');
  assert.ok(w.env?.XDG_RUNTIME_DIR, 'the user’s systemd found even from a service');
  setLimitSupportForTests({ ok: false, why: 'Limits need Linux.' });
  assert.equal(wrapRunner({ memoryMb: 4096 }, 'r1', '/usr/bin/node', []).cmd, '/usr/bin/node', 'no limits where they cannot be held');
  setLimitSupportForTests(null);
});

test('a real tree on this computer: its programs, their memory, and a busy one’s CPU', async () => {
  if (process.platform !== 'linux' && process.platform !== 'darwin') return;
  // A parent that starts a child spinning for a few seconds.
  const p = spawn(
    process.execPath,
    ['-e', "const c = require('child_process').spawn(process.execPath, ['-e', 'const t = Date.now(); while (Date.now() - t < 4000);'], { stdio: 'inherit' }); c.on('exit', () => process.exit(0));"],
    { stdio: 'ignore' },
  );
  try {
    await new Promise((r) => setTimeout(r, 500));
    const meter = new SessionMeter();
    const u = (await meter.measure([p.pid!])).get(p.pid!);
    assert.ok(u, 'measured');
    assert.ok(u.procs >= 2, `the parent and its child: ${u.procs}`);
    assert.ok(u.memory > 20 * MB, `their memory: ${Math.round(u.memory / MB)} MB`);
    assert.ok(u.cpu != null && u.cpu > 50, `the spinning child keeps about one core busy: ${u.cpu}%`);
  } finally {
    p.kill();
  }
});

test('over its memory, what a session ran is stopped, not the session (where the user’s systemd takes scopes)', async () => {
  if (!limitSupport().ok) return console.log('     (skipped: no systemd --user here)');
  const script = path.join(tmp, 'hog.js');
  // The session's stand-in starts a program that asks for far more than the limit, and lives on after it is stopped.
  fs.writeFileSync(
    script,
    "const c = require('child_process').spawn(process.execPath, ['-e', 'const a = []; for (;;) a.push(Buffer.alloc(16 * 1024 * 1024, 1));'], { stdio: 'ignore' }); c.on('exit', (code, sig) => { require('fs').writeFileSync(process.argv[2], String(sig)); setTimeout(() => {}, 30000); });",
  );
  const done = path.join(tmp, 'hog.done');
  const w = wrapRunner({ memoryMb: 2048 }, `test-${Date.now().toString(36)}`, process.execPath, [script, done]);
  // The test's own limit: 2 GB is the smallest choice; the stand-in is held under 128 MB to stop it fast.
  w.args = w.args.map((a) => (a === 'MemoryMax=2048M' ? 'MemoryMax=128M' : a));
  const p = spawn(w.cmd, w.args, { env: w.env, stdio: 'ignore', detached: true });
  try {
    for (let i = 0; i < 100 && !fs.existsSync(done); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(fs.readFileSync(done, 'utf8'), 'SIGKILL', 'the program over the limit was stopped');
    assert.ok(p.exitCode === null, 'the session’s own program goes on');
    assert.ok((oomKills(p.pid!) ?? 0) >= 1, 'the scope counts it');
  } finally {
    try {
      process.kill(-p.pid!, 'SIGKILL');
    } catch {}
    try {
      execFileSync('systemctl', ['--user', 'stop', w.scope!], { env: w.env, stdio: 'ignore' });
    } catch {}
  }
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
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
