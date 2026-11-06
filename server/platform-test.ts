// The server on the system it runs on (Linux, macOS, Windows): what differs there works. An agent runs through a runner
// and answers over its socket (on Windows a named pipe that hears nobody without its key), an npm launcher starts
// through Node.js (Windows), commands run in bash (Git's on Windows), a program stops with everything it started, the
// agents' environment has one PATH (and Claude Code a temporary folder it can use), a terminal runs a shell and keeps
// what it printed (tmux, or on Windows the server's own), links to folders and files, and paths in either form. The
// desktop apps' CI runs it on each system.
// Build and run (after npm run build, which makes the runner):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/platform-test.ts && DATA_DIR=/tmp/hydor-test-platform node dist/dev/platform-test.js
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { config, ensureDirs } from './config.ts';
import { agentBaseEnv, claudeTemp, claudeTempFallback } from './env.ts';
import { bashCommand, bashPath, isAbsPath, launch, linkPath, killTree, pathDirs, trimSep, which, WIN, windowsPathOf, within } from './platform.ts';
import { Runner } from './runner/client.ts';
import { encodeFrame, FRAME_CONTROL, readAddress } from './runner/frames.ts';
import { attachTerminal, createTerminal, killTerminal, listTerminals, paneContext, terminalHistory } from './terminals.ts';

if (!path.resolve(config.dataDir).startsWith(path.resolve(os.tmpdir())) && !config.dataDir.includes('hydor-test')) {
  console.error('Run with DATA_DIR in a scratch folder (…/hydor-test-platform), so the test touches no real data.');
  process.exit(2);
}
fs.rmSync(config.dataDir, { recursive: true, force: true });
ensureDirs();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-platform-'));
let passed = 0;
const ok = (what: string) => {
  passed++;
  console.log(`  ok  ${what}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean | Promise<boolean>, what: string, ms = 20_000) => {
  for (const t = Date.now(); !(await check()); await sleep(100)) if (Date.now() - t > ms) throw new Error(`waited too long for ${what}`);
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// ---- paths -------------------------------------------------------------------------------------------------------
const home = os.homedir();
assert.ok(isAbsPath(home), 'the home folder is a full path');
assert.ok(!isAbsPath('code/app'));
assert.ok(within(path.join(home, 'code', 'app'), home));
assert.ok(within(home, home + path.sep), 'a folder is within itself, with or without its separator');
assert.ok(!within(home + 'x', home), 'a folder beside it is not within it');
assert.equal(trimSep(path.join(home, 'code') + path.sep), path.join(home, 'code'));
assert.equal(trimSep('/'), '/');
if (WIN) {
  assert.equal(trimSep('C:\\'), 'C:\\');
  assert.equal(windowsPathOf('/c/Users/me/app'), 'C:\\Users\\me\\app', "Git's bash paths read as Windows writes them");
  assert.equal(windowsPathOf('C:/Users/me'), 'C:\\Users\\me');
  assert.ok(within('c:/users/ME/app', 'C:\\Users\\me'), 'either separator, any case');
}
ok('full paths, folders within folders, and (on Windows) both ways of writing them');

// ---- the agents' environment ------------------------------------------------------------------------------------
const env = agentBaseEnv();
const pathKeys = Object.keys(env).filter((k) => k.toUpperCase() === 'PATH');
assert.deepEqual(pathKeys, ['PATH'], `one PATH, spelt PATH (${pathKeys.join(', ')})`);
assert.ok(pathDirs(env).includes(path.join(config.dataDir, 'clients', 'node_modules', '.bin')), "the app's own agent programs are on it");
assert.ok(!pathDirs(env).some((d) => d === '/usr/bin:/bin' || (WIN && d.startsWith('/'))), 'no POSIX folders glued onto a Windows PATH');
const node = which('node', env);
assert.ok(node, `node is found on it (${env.PATH})`);
if (WIN) assert.match(node!, /\.exe$/i, 'with its ending');
ok(`the agents' environment has one PATH, with node at ${node}`);

// Claude Code stops as it starts when it can't make claude-<uid> in its temporary folder (EACCES where /tmp is closed
// to you): then its files go in the app's data folder. A folder that works, or a CLAUDE_CODE_TMPDIR of yours, stays.
if (!WIN) {
  const uid = process.getuid!();
  const usable: Record<string, string> = { TMPDIR: scratch };
  claudeTemp(usable);
  assert.equal(usable.CLAUDE_CODE_TMPDIR, undefined, 'a temporary folder that works is left alone');
  assert.ok(fs.lstatSync(path.join(scratch, `claude-${uid}`)).isDirectory(), 'with its claude-<uid> made as Claude Code makes it');
  const planted = path.join(scratch, 'planted');
  fs.mkdirSync(planted);
  fs.symlinkSync(scratch, path.join(planted, `claude-${uid}`));
  const linked: Record<string, string> = { TMPDIR: planted };
  claudeTemp(linked);
  assert.equal(linked.CLAUDE_CODE_TMPDIR, claudeTempFallback(), 'a link in its place (Claude Code refuses one) moves them to the data folder');
  assert.equal(fs.statSync(claudeTempFallback()).mode & 0o777, 0o700, 'which only you can open');
  const closed = path.join(scratch, 'closed');
  fs.mkdirSync(closed, { mode: 0o555 });
  if (uid !== 0) {
    const shut: Record<string, string> = { TMPDIR: closed };
    claudeTemp(shut);
    assert.equal(shut.CLAUDE_CODE_TMPDIR, claudeTempFallback(), 'so does a temporary folder closed to you');
  }
  const yours: Record<string, string> = { TMPDIR: closed, CLAUDE_CODE_TMPDIR: path.join(scratch, 'yours') };
  claudeTemp(yours);
  assert.equal(yours.CLAUDE_CODE_TMPDIR, path.join(scratch, 'yours'), 'a CLAUDE_CODE_TMPDIR of yours is kept');
  if (process.env.CLAUDE_CODE_TMPDIR) assert.ok(env.CLAUDE_CODE_TMPDIR, "and reaches the agents from the app's own settings");
  ok('Claude Code gets a temporary folder it can use');
}

// ---- bash -------------------------------------------------------------------------------------------------------
const bash = bashPath();
assert.ok(bash, 'bash is here (on Windows Git’s)');
if (WIN) assert.ok(!/\\system32\\/i.test(bash!), "not Windows' own bash.exe, which runs in WSL");
const run = (cmd: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    const p = spawn(cmd, args, { cwd: o.cwd ?? scratch, env: o.env ?? env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', (e) => resolve({ code: -1, out: e.message }));
    p.on('close', (code) => resolve({ code, out }));
  });
const sh = bashCommand('echo "sum=$((6*7))"; ls >/dev/null && pwd');
const r1 = await run(sh.cmd, sh.args);
assert.equal(r1.code, 0, r1.out);
assert.match(r1.out, /sum=42/);
ok(`a command runs in ${bash}`);

// ---- stopping a program with what it started --------------------------------------------------------------------
const tree = bashCommand('sleep 60 & echo $!; sleep 60');
const parent = spawn(tree.cmd, tree.args, { cwd: scratch, env, detached: true, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
let childOut = '';
parent.stdout.on('data', (d) => (childOut += d));
await until(() => /\d+/.test(childOut), 'the background sleep');
await sleep(300);
assert.ok(alive(parent.pid!));
killTree(parent.pid!, 'SIGKILL');
await until(() => !alive(parent.pid!), 'the command to stop', 10_000);
if (!WIN) {
  // (On Windows the number bash prints is its own, not Windows'; taskkill /T took the tree.)
  const bg = Number(childOut.trim().split(/\s+/)[0]);
  await until(() => !alive(bg), 'what it started to stop', 10_000);
}
ok('a command stops with what it started');

// ---- an npm launcher (Windows) --------------------------------------------------------------------------------------
const pkg = path.join(scratch, 'node_modules', 'fake-agent');
fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
fs.writeFileSync(path.join(pkg, 'bin', 'fake.js'), "process.stdout.write('fake-agent ' + process.argv.slice(2).join(' ') + '\\n');\n");
const binDir = path.join(scratch, 'node_modules', '.bin');
fs.mkdirSync(binDir, { recursive: true });
if (WIN) {
  // As npm's cmd-shim writes it.
  fs.writeFileSync(
    path.join(binDir, 'fake.cmd'),
    '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\..\\fake-agent\\bin\\fake.js" %*\r\n',
  );
} else {
  fs.writeFileSync(path.join(pkg, 'bin', 'fake.js'), "#!/usr/bin/env node\nprocess.stdout.write('fake-agent ' + process.argv.slice(2).join(' ') + '\\n');\n");
  fs.chmodSync(path.join(pkg, 'bin', 'fake.js'), 0o755);
  fs.symlinkSync('../fake-agent/bin/fake.js', path.join(binDir, 'fake'));
}
const withBin = { ...env, PATH: [binDir, env.PATH].join(path.delimiter) };
const found = which('fake', withBin);
assert.ok(found, 'the launcher is found by its name');
const l = launch(found!, ['--version'], withBin);
if (WIN) assert.ok(l.cmd.toLowerCase().endsWith('node.exe') && l.args[0].endsWith('fake.js'), `npm's .cmd starts through Node.js (${l.cmd} ${l.args.join(' ')})`);
const r2 = await run(l.cmd, l.args, { env: withBin });
assert.equal(r2.code, 0, r2.out);
assert.match(r2.out, /fake-agent --version/);
ok(`an npm launcher starts${WIN ? ', through Node.js' : ''}`);

// ---- an agent through a runner ----------------------------------------------------------------------------------
// The runner (dist/server/runner.js, from npm run build) keeps the agent going across server restarts.
const echo = "const rl=require('readline').createInterface({input:process.stdin});rl.on('line',(l)=>{const m=JSON.parse(l);process.stdout.write(JSON.stringify({echo:m.say,pid:process.pid})+'\\n')});";
const runner = await Runner.start({ runId: `test${Date.now().toString(36)}`, agent: 'claude', createdAt: Date.now(), cwd: scratch, opts: {} }, { cmd: process.execPath, args: ['-e', echo], cwd: scratch, env: env as Record<string, string> });
const lines: string[] = [];
runner.on('line', (line: string) => lines.push(line));
await runner.connect(20_000);
runner.writeLine({ say: 'hello over the socket' });
await until(() => lines.some((x) => x.includes('hello over the socket')), "the agent's answer");
ok(`an agent answers through its runner (${WIN ? 'a named pipe' : 'a Unix socket'})`);

if (WIN) {
  // Someone without the key hears nothing, and is let go.
  const address = readAddress(runner.dir, fs, path)!;
  assert.match(address.path, /^\\\\\.\\pipe\\/, 'a named pipe');
  const heard = await new Promise<string>((resolve) => {
    let got = '';
    const s = net.connect(address.path);
    s.on('data', (d) => (got += d.toString('latin1')));
    s.on('connect', () => s.write(encodeFrame(FRAME_CONTROL, JSON.stringify({ op: 'auth', key: 'x'.repeat(address.key!.length) }))));
    s.on('close', () => resolve(got));
    s.on('error', () => resolve(got));
    setTimeout(() => {
      s.destroy();
      resolve(got);
    }, 3000);
  });
  assert.ok(!heard.includes('hello'), `nothing for a client without the key (${JSON.stringify(heard.slice(0, 80))})`);
  ok('the pipe tells nothing to a client without its key');
}

// A second connection (the server restarted) replays what the agent said, then hears what follows.
const again = new Runner(runner.dir, runner.meta);
const replayed: string[] = [];
again.on('line', (line: string, replay: boolean) => replayed.push(`${replay ? 'old' : 'new'}:${line}`));
await again.connect(20_000);
assert.ok(replayed.some((x) => x.startsWith('old:') && x.includes('hello over the socket')), 'what it said before is replayed');
again.writeLine({ say: 'after the restart' });
await until(() => replayed.some((x) => x.startsWith('new:') && x.includes('after the restart')), 'the answer after reconnecting');
ok('after a restart the server connects again, hears what it missed and what follows');
const exited = new Promise((r) => again.once('exit', r));
again.stop(500);
await Promise.race([exited, sleep(15_000)]);
assert.ok(again.exit, 'the agent ended when asked to stop');
again.cleanup();
ok('the agent stops when asked');

// ---- links ------------------------------------------------------------------------------------------------------
const real = path.join(scratch, 'real-folder');
fs.mkdirSync(real);
fs.writeFileSync(path.join(real, 'note.txt'), 'linked');
linkPath(real, path.join(scratch, 'linked-folder'), 'dir');
assert.equal(fs.readFileSync(path.join(scratch, 'linked-folder', 'note.txt'), 'utf8'), 'linked');
linkPath(path.join(real, 'note.txt'), path.join(scratch, 'linked-note.txt'));
assert.equal(fs.readFileSync(path.join(scratch, 'linked-note.txt'), 'utf8'), 'linked');
ok(`links to a folder and a file${WIN ? ' (a junction, a hard link)' : ''}`);

// ---- a terminal -------------------------------------------------------------------------------------------------
if (!WIN && !which('tmux', env)) console.log('  --  no tmux here: the terminal is not tried');
else {
  const t = await createTerminal({ cwd: scratch, name: 'test' });
  const view = attachTerminal(t.id, 100, 30);
  let screen = '';
  view.onData((d) => (screen += d));
  await sleep(1500);
  view.write('echo "term-$((40+2))"\r');
  await until(() => screen.includes('term-42'), 'the terminal to run the command', 20_000);
  // What a view that attaches later is sent first: on Windows all it printed (tmux sends what is above the screen).
  if (WIN) await until(async () => (await terminalHistory(t.id)).includes('term-42'), 'its history to keep it', 10_000);
  assert.ok((await listTerminals()).some((x) => x.id === t.id), 'it is listed');
  view.write(`cd ..\r`);
  await sleep(1500);
  const ctx = await paneContext(t.id);
  // (Windows may give the same folder by its short name, RUNNER~1, and its long one.)
  const realOf = (p: string) => fs.realpathSync.native(p).toLowerCase();
  assert.equal(realOf(ctx.cwd), realOf(path.dirname(scratch)), `it knows where its shell is (${ctx.cwd})`);
  assert.ok(ctx.shell, 'and that the shell waits for a command');
  view.kill();
  await killTerminal(t.id);
  await until(async () => !(await listTerminals()).some((x) => x.id === t.id), 'the terminal to close', 10_000);
  ok(`a terminal runs a shell, keeps what it printed and follows its folder (${WIN ? "the server's own" : 'tmux'})`);
}

fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
console.log(`${passed} passed`);
process.exit(0);
