// A runner whose folder is deleted while its agent runs (its app's data folder removed, as a copy of the app tried out
// under /tmp is once done with) stops the agent and ends, instead of running on where no app can reach it again.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/runner/orphan-test.ts && DATA_DIR=/tmp/hydor-test-orphan node dist/dev/orphan-test.js
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

if (process.platform === 'win32') {
  // Windows does not let a folder go while the runner holds its logs open.
  console.log('runner without its folder: skipped on Windows');
  process.exit(0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-orphan-'));
let runner: ChildProcess | null = null;
try {
  await build({ entryPoints: ['server/runner/runner.ts'], outfile: path.join(root, 'runner.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', logLevel: 'silent' });
  const runDir = path.join(root, 'data', 'runs', 'r1');
  fs.mkdirSync(runDir, { recursive: true });
  // The agent reads its input and ends with it, as Claude Code in stream-json mode does.
  const agent = "process.stdin.resume(); process.stdin.on('end', () => process.exit(0));";
  fs.writeFileSync(path.join(runDir, 'spec.json'), JSON.stringify({ cmd: process.execPath, args: ['-e', agent], cwd: root, env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } }));
  runner = spawn(process.execPath, [path.join(root, 'runner.mjs'), runDir], { cwd: runDir, env: { ...process.env, HYDOR_RUNNER_CHECK_MS: '100' }, stdio: 'ignore' });
  const ended = new Promise<boolean>((r) => runner!.once('exit', () => r(true)));
  for (let i = 0; i < 100 && !fs.existsSync(path.join(runDir, 'state.json')); i++) await sleep(50);
  const { childPid } = JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8')) as { childPid: number };
  assert.ok(childPid && alive(childPid), 'the agent runs');

  // Its folder there, it runs on, check after check.
  await sleep(700);
  assert.equal(runner.exitCode, null, 'the runner runs on while its folder is there');
  assert.ok(alive(childPid), 'and so does its agent');

  // Its app's data folder deleted: the agent is stopped and the runner ends.
  fs.rmSync(path.join(root, 'data'), { recursive: true, force: true });
  assert.ok(await Promise.race([ended, sleep(10_000).then(() => false)]), 'the runner ends once its folder is gone');
  for (let i = 0; i < 40 && alive(childPid); i++) await sleep(50);
  assert.ok(!alive(childPid), 'and its agent with it');
  console.log('runner without its folder: ok');
} finally {
  if (runner && runner.exitCode === null && runner.signalCode === null) runner.kill('SIGKILL');
  fs.rmSync(root, { recursive: true, force: true });
}
