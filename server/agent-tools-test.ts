// The developer tools in scripts/agent-tools/ (waitfor, edits, sym, leancheck): their own node:test suites, run from here so
// `npm test` and `npm run check` fail when one fails. They need no installed packages and no data folder; each leaves
// the temporary folder as it found it, which this checks with a folder of its own as TMPDIR. waitfor's suite waits on
// real timers (about a minute alone), and a heavily loaded machine can stretch its short waits.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agent-tools-test.ts && DATA_DIR=/tmp/hydor-test-agent-tools node dist/dev/agent-tools-test.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_ROOT } from './config.ts';

const dir = path.join(APP_ROOT, 'scripts', 'agent-tools');
const suites = ['waitfor', 'edits', 'sym', 'leancheck'].map((n) => path.join(dir, 'test', `${n}.test.mjs`));
for (const s of suites) assert.ok(fs.existsSync(s), `${s} exists`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-agent-tools-'));
try {
  // From a folder that is not the checkout, with the app's environment, as `npm test` runs it.
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...suites], {
    cwd: tmp,
    env: { ...process.env, TMPDIR: tmp, CUDA_VISIBLE_DEVICES: '' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 10 * 60_000,
  });
  const count = (what: string) => Number(new RegExp(`^# ${what} (\\d+)$`, 'm').exec(r.stdout)?.[1] ?? NaN);
  if (r.status !== 0) console.log(r.stdout.split('\n').filter((l) => /^\s*not ok|^\s+error:|^\s+(expected|actual):/.test(l)).slice(0, 60).join('\n'), r.stderr);
  assert.equal(r.status, 0, 'the tools\' tests pass');
  assert.equal(count('fail'), 0);
  assert.ok(count('pass') > 0, `${count('pass')} tests passed`);
  // (npm, which one of edits' tests runs, keeps a cache of its own there: not the tests' doing)
  assert.deepEqual(fs.readdirSync(tmp).filter((f) => f !== 'node-compile-cache'), [], 'the tests leave nothing in the temporary folder');
  console.log(`agent-tools ok (${count('pass')} tests)`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
