// Checks for running a goal's checks (checks.ts) with real bash commands in a scratch folder: a command that passes and
// one that fails, a number read with a regular expression and as the last number printed, no number, a command that is
// not there, a timeout that kills what the command started too, the output's end as the detail, a measured check that
// meets its target, a person's check, the reviewer given the evidence named (a stub) and only files inside the
// session's folder, the order checks run in, which paths are protected, and what changed between two commits of a real
// git folder. And what keeps a check from harming the app: a pattern (read, or a protected path) that would take seconds
// is stopped or cannot backtrack; a check runs in the environment agents get, never the server's; what it leaves running
// is killed when it ends, and what a restart left running is found by its mark; in a confidential session's sandbox it
// has no network; a change that git cannot show is an error, not "no change"; paths are the session's folder's.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/checks-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-checks PRICES_URL= node dist/dev/checks-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GoalCheck } from '../../shared/goals.ts';
import { netCutAvailable, sandboxShell } from '../agent/sandbox.ts';
import { changedPaths, clipMiddle, diffText, evidenceFile, globMatch, headOf, isProtected, killLeftover, protectedHits, readNumber, runCheck, runChecks, runCommand, sameFiles, SLOW_READ, type CheckEnv } from './checks.ts';
import { cleanProtect, MAX_WILDCARDS } from './validate.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || process.env.PRICES_URL !== '') {
  console.error('Run with DATA_DIR=/tmp/… and PRICES_URL= (empty) so nothing touches real data or the network.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-goalsrv-checks-'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const reviewed: { claim: string; evidence: string }[] = [];
const env = (o: Partial<CheckEnv> = {}): CheckEnv => ({
  cwd: tmp,
  diff: async () => 'diff --git a/x b/x\n+changed line',
  confirmed: {},
  review: async (claim, evidence) => {
    reviewed.push({ claim, evidence });
    return { holds: evidence.includes('changed line'), score: 0.7, reason: 'It quotes “changed line”.' };
  },
  ...o,
});
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a command: holds when it exits 0, not when it fails; the end of its output (both streams, in order) is the detail', async () => {
  const ok = await runCheck({ id: 'c1', kind: 'command', label: 'Pass', run: 'echo one; echo two >&2; true' }, env());
  assert.equal(ok.holds, true);
  assert.equal(ok.closeness, 1);
  // Two pipes: in the order they come, which under load may not be the order written.
  assert.deepEqual(ok.detail!.split('\n').sort(), ['one', 'two']);
  assert.ok(ok.ms >= 0);
  const bad = await runCheck({ id: 'c2', kind: 'command', label: 'Fail', run: 'echo nope; exit 3' }, env());
  assert.equal(bad.holds, false);
  assert.equal(bad.error, undefined, 'a failure is not an error');
  assert.equal(bad.detail, 'nope');
  const long = await runCheck({ id: 'c3', kind: 'command', label: 'Long', run: 'for i in $(seq 1 2000); do echo "line $i"; done; exit 1' }, env());
  assert.ok(long.detail!.length <= 1500);
  assert.ok(long.detail!.endsWith('line 2000'));
});

test('it runs in the session’s folder, in an environment that asks nothing', async () => {
  fs.writeFileSync(path.join(tmp, 'here.txt'), 'x');
  const r = await runCommand('ls here.txt && echo "CI=$CI TERM=$TERM GIT_TERMINAL_PROMPT=$GIT_TERMINAL_PROMPT" && read -t 1 x; echo "read:$?"', tmp, 10);
  assert.equal(r.code, 0);
  assert.match(r.output, /here\.txt/);
  assert.match(r.output, /CI=1 TERM=dumb GIT_TERMINAL_PROMPT=0/);
  assert.match(r.output, /read:1/, 'stdin is closed: nothing can wait for typing');
});

test('a command that is not there, or cannot run: an error, not holding', async () => {
  const r = await runCheck({ id: 'c1', kind: 'command', label: 'Missing', run: 'no-such-command-for-goals --flag' }, env());
  assert.equal(r.holds, false);
  assert.equal(r.error, 'The command was not found');
  const empty = await runCheck({ id: 'c2', kind: 'command', label: 'Empty', run: ' ' }, env());
  assert.equal(empty.error, 'It has no command to run');
});

test('a timeout stops the command and what it started, and is an error', async () => {
  const pidFile = path.join(tmp, 'child.pid');
  const t0 = Date.now();
  const r = await runCheck({ id: 'c1', kind: 'command', label: 'Slow', run: `sleep 60 & echo $! > ${pidFile}; echo started; wait`, timeoutS: 1 }, env());
  assert.ok(Date.now() - t0 < 10_000, 'it does not wait for the sleep');
  assert.equal(r.holds, false);
  assert.equal(r.error, 'It took longer than its 1 s and was stopped');
  assert.match(r.detail ?? '', /started/);
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  for (let i = 0; i < 20 && alive(pid); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(alive(pid), false, 'the background sleep was killed with its group');
});

test('a measured number: read with a regular expression (its last match, first group), or the last number printed', async () => {
  assert.equal(readNumber('warmup p95=900ms\nrun p95=365ms\n', 'p95=(\\d+)ms'), 365);
  assert.equal(readNumber('score: 0.61\nscore: 0.68\n', '^score: ([\\d.]+)$'), 0.68);
  assert.equal(readNumber('took 1,234.5 ms', 'took ([\\d,.]+)'), 1234.5);
  assert.equal(readNumber('value 42', 'value \\d+'), 42, 'without a group, the whole match');
  assert.equal(readNumber('nothing here', 'p95=(\\d+)'), undefined);
  assert.equal(readNumber('bad', '(['), undefined, 'a regular expression that does not compile reads nothing');
  assert.equal(readNumber('epoch 3: loss 0.25\nepoch 4: loss 0.125'), 0.125);
  assert.equal(readNumber('-3.5e-2 done'), -0.035);
  assert.equal(readNumber('total 12,345'), 12345);
  assert.equal(readNumber('no digits'), undefined);
});

test('a measured check holds when it meets its target; no number is an error; a failing exit still reads its number', async () => {
  const m: GoalCheck = { id: 'c1', kind: 'measure', label: 'Speed', run: 'echo "p95=280ms"', read: 'p95=(\\d+)ms', target: { op: '<=', value: 300 }, unit: 'ms' };
  const ok = await runCheck(m, env());
  assert.deepEqual([ok.holds, ok.value, ok.closeness], [true, 280, 1]);
  const slow = await runCheck({ ...m, run: 'echo "p95=910ms"' }, env());
  assert.deepEqual([slow.holds, slow.value], [false, 910]);
  const last = await runCheck({ id: 'c2', kind: 'measure', label: 'Relevance', run: 'echo "fold 1: 0.5"; echo "mean 0.82"', target: { op: '>=', value: 0.8 } }, env());
  assert.deepEqual([last.holds, last.value], [true, 0.82]);
  const none = await runCheck({ ...m, run: 'echo done' }, env());
  assert.equal(none.holds, false);
  assert.equal(none.error, 'It printed no number');
  const crashed = await runCheck({ ...m, run: 'echo "p95=250ms"; exit 2' }, env());
  assert.equal(crashed.value, 250);
  assert.match(crashed.detail ?? '', /exit code 2/);
});

test('a person’s check holds only once they confirmed it, and nothing runs', async () => {
  const c: GoalCheck = { id: 'c9', kind: 'you', label: 'It reads well' };
  assert.equal((await runCheck(c, env())).holds, false);
  assert.equal((await runCheck(c, env({ confirmed: { c9: true } }))).holds, true);
});

test('a review: the reviewer gets the claim and the evidence named (the change, files, a command’s output); a failed review is an error', async () => {
  fs.writeFileSync(path.join(tmp, 'notes.md'), `# Notes\n${'n'.repeat(9000)}`);
  reviewed.length = 0;
  const r = await runCheck({ id: 'c1', kind: 'review', label: 'Errors are explained', claim: 'Every error says what to do', evidence: { diff: true, files: ['notes.md', 'gone.md'], run: 'echo from-the-command' } }, env());
  assert.equal(r.holds, true);
  assert.equal(r.detail, 'It quotes “changed line”.');
  const ev = reviewed[0].evidence;
  assert.equal(reviewed[0].claim, 'Every error says what to do');
  assert.match(ev, /<change since the goal started>\ndiff --git/);
  assert.match(ev, /<file path="notes.md">\n# Notes/);
  assert.match(ev, /the rest left out/, 'a file is cut at 8000 characters');
  assert.match(ev, /<file path="gone.md">\n\(Left out: it does not exist\.\)/);
  assert.match(ev, /<output of="echo from-the-command" exit="0">\nfrom-the-command/);
  // No evidence named: the change since the start.
  reviewed.length = 0;
  await runCheck({ id: 'c2', kind: 'review', label: 'X', claim: 'Y' }, env());
  assert.match(reviewed[0].evidence, /change since the goal started/);
  const err = await runCheck({ id: 'c3', kind: 'review', label: 'X', claim: 'Y' }, env({ review: async () => ({ error: 'The reviewer gave no answer that could be read' }) }));
  assert.deepEqual([err.holds, err.error], [false, 'The reviewer gave no answer that could be read']);
});

test('a review’s files stay inside the session’s folder: no way out, no links out, only files, at most 200 kB', async () => {
  const root = path.join(tmp, 'folder');
  const other = path.join(tmp, 'elsewhere');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'inside\n');
  fs.writeFileSync(path.join(other, 'secret.txt'), 'secret\n');
  fs.writeFileSync(path.join(root, 'big.log'), 'x'.repeat(200 * 1024 + 1));
  fs.writeFileSync(path.join(root, 'just.log'), 'y'.repeat(200 * 1024));
  fs.symlinkSync(path.join(other, 'secret.txt'), path.join(root, 'out-link.txt'));
  fs.symlinkSync(other, path.join(root, 'out-dir'));
  fs.symlinkSync(path.join(root, 'src', 'a.ts'), path.join(root, 'in-link.ts'));
  assert.deepEqual(evidenceFile(root, 'src/a.ts'), { text: 'inside\n' });
  assert.deepEqual(evidenceFile(root, './src/../src/a.ts'), { text: 'inside\n' });
  assert.deepEqual(evidenceFile(root, path.join(root, 'src', 'a.ts')), { text: 'inside\n' }, 'an absolute path inside the folder');
  assert.deepEqual(evidenceFile(root, 'in-link.ts'), { text: 'inside\n' }, 'a link that stays inside');
  assert.deepEqual(evidenceFile(root, '../elsewhere/secret.txt'), { skip: 'it is outside the session’s folder' });
  assert.deepEqual(evidenceFile(root, path.join(other, 'secret.txt')), { skip: 'it is outside the session’s folder' });
  assert.deepEqual(evidenceFile(root, '/etc/passwd'), { skip: 'it is outside the session’s folder' });
  assert.deepEqual(evidenceFile(root, 'out-link.txt'), { skip: 'it leads outside the session’s folder' });
  assert.deepEqual(evidenceFile(root, 'out-dir/secret.txt'), { skip: 'it leads outside the session’s folder' });
  assert.deepEqual(evidenceFile(root, 'src'), { skip: 'it is not a file' });
  assert.deepEqual(evidenceFile(root, 'big.log'), { skip: 'it is larger than 200 kB' });
  assert.equal('text' in evidenceFile(root, 'just.log'), true, '200 kB itself is read');
  assert.deepEqual(evidenceFile(root, 'nope.txt'), { skip: 'it does not exist' });
  // In a review, each left-out file is a note in the evidence, and nothing of it is shown.
  reviewed.length = 0;
  await runCheck({ id: 'c1', kind: 'review', label: 'X', claim: 'Y', evidence: { files: ['src/a.ts', '../elsewhere/secret.txt', 'out-link.txt'] } }, env({ cwd: root }));
  const ev = reviewed[0].evidence;
  assert.match(ev, /<file path="src\/a.ts">\ninside/);
  assert.match(ev, /<file path="..\/elsewhere\/secret.txt">\n\(Left out: it is outside the session’s folder\.\)/);
  assert.match(ev, /<file path="out-link.txt">\n\(Left out: it leads outside the session’s folder\.\)/);
  assert.ok(!ev.includes('secret\n'));
});

test('evidence is clipped in the middle', () => {
  const s = `${'a'.repeat(50_000)}MIDDLE${'z'.repeat(50_000)}`;
  const c = clipMiddle(s, 60_000);
  assert.ok(c.length < 60_200);
  assert.ok(c.startsWith('aaa') && c.endsWith('zzz'));
  assert.ok(!c.includes('MIDDLE'));
  assert.equal(clipMiddle('short', 10), 'short');
});

test('checks run one after another, commands and numbers first, reviews last; results in the checks’ own order', async () => {
  const log = path.join(tmp, 'order.log');
  fs.rmSync(log, { force: true });
  const order: string[] = [];
  const checks: GoalCheck[] = [
    { id: 'c1', kind: 'review', label: 'R', claim: 'r' },
    { id: 'c2', kind: 'command', label: 'A', run: `echo a >> ${log}` },
    { id: 'c3', kind: 'you', label: 'Y' },
    { id: 'c4', kind: 'measure', label: 'M', run: `echo m >> ${log}; echo 5`, target: { op: '>=', value: 1 } },
  ];
  const results = await runChecks(
    checks,
    env({
      review: async () => {
        order.push(...fs.readFileSync(log, 'utf8').trim().split('\n'), 'review');
        return { holds: false, score: 0, reason: 'no' };
      },
    }),
  );
  assert.deepEqual(order, ['a', 'm', 'review']);
  assert.deepEqual(
    results.map((r) => r.id),
    ['c1', 'c2', 'c3', 'c4'],
  );
});

test('protected paths: an entry itself, a folder (with or without its slash), * within a part and ** across parts', () => {
  const p = ['tests/', 'bench/data.json', 'fixtures', 'src/*.snap', '**/golden/**', 'scripts/check-*.sh'];
  assert.equal(isProtected('tests/order.test.ts', p), true);
  assert.equal(isProtected('tests/deep/a.ts', p), true);
  assert.equal(isProtected('testsuite/a.ts', p), false);
  assert.equal(isProtected('bench/data.json', p), true);
  assert.equal(isProtected('bench/data.json.bak', p), false);
  assert.equal(isProtected('bench/run.ts', p), false);
  assert.equal(isProtected('fixtures', p), true);
  assert.equal(isProtected('fixtures/a.json', p), true, 'a folder named without its slash');
  assert.equal(isProtected('fixtures2/a.json', p), false);
  assert.equal(isProtected('src/a.snap', p), true);
  assert.equal(isProtected('src/deep/a.snap', p), false, '* stays within one part');
  assert.equal(isProtected('golden/x.txt', p), true);
  assert.equal(isProtected('a/b/golden/c/d.txt', p), true, '** crosses parts');
  assert.equal(isProtected('scripts/check-types.sh', p), true);
  assert.equal(isProtected('./tests/x.ts', p), true, 'a leading ./ is the same path');
  assert.equal(isProtected('src/main.ts', p), false);
  assert.deepEqual(protectedHits(['src/main.ts', 'tests/a.ts', 'src/b.snap'], p), ['tests/a.ts', 'src/b.snap']);
  assert.deepEqual(protectedHits(['tests/a.ts'], []), []);
  assert.equal(isProtected('docs/a.md', ['docs/**']), true);
  assert.equal(isProtected('docs', ['docs/**']), false);
});

test('what changed between two commits of a git folder, and the change to the files as they are', async () => {
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  const g = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: repo, stdio: 'pipe' }).toString().trim();
  g('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(repo, 'tests'));
  fs.writeFileSync(path.join(repo, 'tests', 'a.test.ts'), 'old\n');
  fs.writeFileSync(path.join(repo, 'main.ts'), 'one\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'one');
  const a = g('rev-parse', 'HEAD');
  assert.equal(await headOf(repo), a);
  fs.writeFileSync(path.join(repo, 'main.ts'), 'two\n');
  g('mv', 'tests/a.test.ts', 'tests/b.test.ts');
  g('add', '-A');
  g('commit', '-q', '-m', 'two');
  const b = g('rev-parse', 'HEAD');
  const changed = await changedPaths(repo, a, b);
  assert.deepEqual(changed.sort(), ['main.ts', 'tests/a.test.ts', 'tests/b.test.ts'], 'a rename counts as the path gone and the path added');
  assert.deepEqual(protectedHits(changed, ['tests/']).sort(), ['tests/a.test.ts', 'tests/b.test.ts']);
  fs.writeFileSync(path.join(repo, 'new.ts'), 'brand new\n');
  const d = await diffText(repo, a);
  assert.match(d, /-one\n\+two/);
  assert.match(d, /New files not tracked by git: new\.ts/);
  assert.match(await diffText(repo, a, b), /-one\n\+two/);
  assert.equal(await headOf(tmp), undefined, 'outside a git folder there is no commit');
});

test('a regular expression that would take seconds is stopped after a moment, as the check’s error; it reads all the output kept (64 KB)', async () => {
  // (\d+)+x on 29 digits took 7.6 s on the server's own thread, doubling with each digit.
  const t0 = Date.now();
  assert.throws(() => readNumber('1'.repeat(40), '(\\d+)+x'), (e: Error) => e.message === SLOW_READ);
  assert.ok(Date.now() - t0 < 2000, `stopped after ${Date.now() - t0} ms`);
  const r = await runCheck({ id: 'c1', kind: 'measure', label: 'Count', run: `printf '1%.0s' $(seq 1 40)`, read: '(\\d+)+x', target: { op: '>=', value: 1 } }, env());
  assert.equal(r.holds, false);
  assert.equal(r.error, 'Its pattern took too long');
  assert.ok(r.ms < 5000);
  // A number printed 20 KB before the end (a summary line, then a long log) is read: the time limit protects, not the length.
  const long = `value: 5\n${'x'.repeat(20_000)}\n`;
  assert.equal(readNumber(long, 'value: (\\d+)'), 5);
  assert.equal(readNumber(`${'x'.repeat(20_000)}\nvalue: 7\n`, 'value: (\\d+)'), 7);
  // In a real run too: 40 KB of log after the number.
  const run = await runCheck({ id: 'c2', kind: 'measure', label: 'Recall', run: `echo "recall: 0.82"; head -c 40000 /dev/zero | tr '\\0' x; echo`, read: 'recall: ([\\d.]+)', target: { op: '>=', value: 0.8 } }, env());
  assert.deepEqual([run.holds, run.value, run.error], [true, 0.82, undefined]);
});

test('protected paths that would backtrack for seconds as a regular expression match at once; more than 4 wildcards are refused', () => {
  const evil = '**a**a**a**a**a**a**a**b';
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) assert.equal(isProtected('a'.repeat(59) + 'c', [evil]), false);
  assert.equal(isProtected(`${'a/'.repeat(30)}c`, ['**/a/**/a/**/a/**/b']), false);
  assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0} ms`);
  assert.equal(globMatch('src/**/*.snap', 'src/a/b/c.snap'), true);
  assert.equal(globMatch('src/**/*.snap', 'src/c.snap'), true, '** in the middle may be no part at all');
  assert.equal(globMatch('**/golden/**', 'golden/x'), true);
  assert.equal(globMatch('docs/**', 'docs'), false, 'at the end, at least one part');
  assert.equal(globMatch('a*b*c', 'axxbyyc'), true);
  assert.equal(globMatch('a*b*c', 'axxbyy/c'), false, '* stays within a part');
  const errors: string[] = [];
  assert.equal(cleanProtect([evil], errors), undefined);
  assert.match(errors[0], new RegExp(`more than ${MAX_WILDCARDS} wildcards`));
  const ok: string[] = [];
  assert.deepEqual(cleanProtect(['**/fixtures/**/*.json', 'tests/'], ok), ['**/fixtures/**/*.json', 'tests/']);
  assert.deepEqual(ok, []);
});

test('a check runs in the environment agents get, never the server’s: no NODE_ENV, PORT, HOST, data folder or the server’s secrets; the user’s PATH', async () => {
  const keep = { NODE_ENV: process.env.NODE_ENV, PORT: process.env.PORT, HOST: process.env.HOST, S: process.env.HYDOR_GOALFIX_SERVER_SECRET };
  Object.assign(process.env, { NODE_ENV: 'production', PORT: '8790', HOST: '127.0.0.1', HYDOR_GOALFIX_SERVER_SECRET: 'not-for-checks' });
  try {
    const r = await runCommand('echo "NODE_ENV=[$NODE_ENV] PORT=[$PORT] HOST=[$HOST] DATA_DIR=[$DATA_DIR] SECRET=[$HYDOR_GOALFIX_SERVER_SECRET]"; echo "PATH=$PATH"', tmp, 20);
    assert.match(r.output, /NODE_ENV=\[\] PORT=\[\] HOST=\[\] DATA_DIR=\[\] SECRET=\[\]/);
    assert.ok(r.output.includes(path.join(os.homedir(), '.local/bin')), 'the user’s own programs are found');
  } finally {
    for (const [k, v] of Object.entries({ NODE_ENV: keep.NODE_ENV, PORT: keep.PORT, HOST: keep.HOST, HYDOR_GOALFIX_SERVER_SECRET: keep.S })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('what a command leaves running when it ends is killed with it; what a restart left running is found by its mark and killed', async () => {
  const pidFile = path.join(tmp, 'left.pid');
  let run: { pgid: number; mark: string } | undefined;
  const r = await runCommand(`sleep 60 & echo $! > ${pidFile}; echo up`, tmp, 20, { started: (x) => (run = x) });
  assert.equal(r.code, 0);
  assert.ok(run && run.pgid > 1 && /^[0-9a-f]{16}$/.test(run.mark));
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  for (let i = 0; i < 30 && alive(pid); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(alive(pid), false, 'the dev server it left would hold its port for the next run');
  // A check cut short by a restart: its group still runs, carrying its mark.
  const left = spawn('bash', ['-c', 'sleep 60'], { detached: true, stdio: 'ignore', env: { ...process.env, HYDOR_GOAL_CHECK: 'feedfacefeedface' } });
  left.unref();
  await new Promise((res) => setTimeout(res, 200));
  assert.equal(killLeftover({ pgid: left.pid!, mark: 'another-mark' }), false, 'a group without its mark is someone else’s now');
  assert.equal(alive(left.pid!), true);
  assert.equal(killLeftover({ pgid: left.pid!, mark: 'feedfacefeedface' }), true);
  for (let i = 0; i < 30 && alive(left.pid!); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(alive(left.pid!), false);
  assert.equal(killLeftover({ pgid: left.pid!, mark: 'feedfacefeedface' }), false, 'gone: nothing to kill');
});

test('a confidential session’s check runs in the sandbox without network; one that cannot run here is an error before anything runs', async () => {
  const server = net.createServer((c) => c.end('hello\n'));
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  const port = (server.address() as net.AddressInfo).port;
  const reach = `exec 3<>/dev/tcp/127.0.0.1/${port} && echo reached || echo cut`;
  try {
    assert.match((await runCommand(reach, tmp, 20)).output, /reached/, 'without the sandbox it reaches this computer’s servers');
    if (netCutAvailable()) {
      const shell = await sandboxShell(tmp, 'confidential', true);
      assert.ok(shell);
      assert.match((await runCommand(reach, tmp, 20, { shell })).output, /cut/, 'in it, not even this computer’s servers');
    } else console.log('     (no sandbox that cuts the network here: that half is not tried)');
  } finally {
    server.close();
  }
  const marker = path.join(tmp, 'ran-without-sandbox');
  const r = await runCheck({ id: 'c1', kind: 'command', label: 'Tests', run: `touch ${marker}` }, env({ noRun: 'No sandbox on this computer to run it in' }));
  assert.equal(r.error, 'No sandbox on this computer to run it in');
  const rv = await runCheck({ id: 'c2', kind: 'review', label: 'Fine', claim: 'x', evidence: { run: `touch ${marker}` } }, env({ noRun: 'No sandbox on this computer to run it in' }));
  assert.equal(rv.error, 'No sandbox on this computer to run it in');
  assert.equal(fs.existsSync(marker), false, 'nothing ran');
});

test('in a subfolder of a repository: changed paths are the folder’s own, and the change is kept to it; a change git cannot show is an error, not none', async () => {
  const repo = path.join(tmp, 'mono');
  fs.mkdirSync(path.join(repo, 'app', 'tests'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'other'));
  const g = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: repo, stdio: 'pipe' }).toString().trim();
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'app', 'tests', 'a.test.ts'), 'old\n');
  fs.writeFileSync(path.join(repo, 'other', 'x.ts'), 'old\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'one');
  const a = g('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(repo, 'app', 'tests', 'a.test.ts'), 'new\n');
  fs.writeFileSync(path.join(repo, 'other', 'x.ts'), 'secret elsewhere\n');
  g('commit', '-q', '-am', 'two');
  const b = g('rev-parse', 'HEAD');
  const app = path.join(repo, 'app');
  assert.deepEqual(await changedPaths(app, a, b), ['tests/a.test.ts'], 'relative to the session’s folder, and only its own');
  assert.deepEqual(protectedHits(await changedPaths(app, a, b), ['tests/']), ['tests/a.test.ts']);
  const here = await diffText(app, a, undefined, { here: true });
  assert.match(here, /\+new/);
  assert.doesNotMatch(here, /secret elsewhere/, 'the reviewer sees the session’s folder only');
  await assert.rejects(diffText(app, 'f'.repeat(40)), 'a diff git cannot give throws');
  await assert.rejects(changedPaths(app, 'f'.repeat(40), b), 'and so do changed paths git cannot list (never “nothing changed”)');
  assert.equal(await sameFiles(repo, a, a), true);
  assert.equal(await sameFiles(repo, a, b), false);
});

// ---- run ---------------------------------------------------------------------------------------------

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
fs.rmSync(tmp, { recursive: true, force: true });
process.exit();
