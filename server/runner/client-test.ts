// A runner's last output: when its agent last printed anything, read from its logs, so a restarted server still knows
// how long a reattached agent has been idle (sessions.ts restore, and the idle reaper that stops agents idle longer
// than IDLE_STOP_HOURS).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/runner/client-test.ts && DATA_DIR=/tmp/hydor-test-runner node dist/dev/client-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Runner } from './client.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-runner-test-'));
try {
  const runner = new Runner(dir, { runId: 'r', agent: 'claude', createdAt: Date.now() } as any);
  assert.equal(runner.lastOutputAt(), null, 'no logs yet: nothing printed');

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
  fs.writeFileSync(path.join(dir, 'out.log'), 'hello\n');
  fs.utimesSync(path.join(dir, 'out.log'), hoursAgo(5), hoursAgo(5));
  const out = runner.lastOutputAt();
  assert.ok(out !== null && Math.abs(out - hoursAgo(5).getTime()) < 2000, 'the output log tells when it last printed');

  // Whichever log changed last.
  fs.writeFileSync(path.join(dir, 'err.log'), 'warning\n');
  fs.utimesSync(path.join(dir, 'err.log'), hoursAgo(1), hoursAgo(1));
  const either = runner.lastOutputAt();
  assert.ok(either !== null && Math.abs(either - hoursAgo(1).getTime()) < 2000, 'the error log counts too');

  // What restore() does: an adapter made now keeps the older time, so an agent idle for hours is not made fresh.
  const madeNow = Date.now();
  assert.equal(Math.min(madeNow, either!), either);
  console.log('runner client: ok');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
