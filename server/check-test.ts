// `npm run check` (scripts/check.mjs): its own checks of what tests a change brings, of how tsc's and the test runner's
// output is cut down, and of the memory-cap rules. They build nothing and need no data folder.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/check-test.ts && DATA_DIR=/tmp/hydor-test-check node dist/dev/check-test.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { APP_ROOT } from './config.ts';

const r = spawnSync(process.execPath, [path.join(APP_ROOT, 'scripts', 'check.mjs'), '--selftest'], { encoding: 'utf8' });
if (r.status !== 0) console.log(r.stdout, r.stderr);
assert.equal(r.status, 0, 'node scripts/check.mjs --selftest passes');
assert.match(r.stdout, /\d+ of \d+ passed/);
console.log('check selftest ok');
