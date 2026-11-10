// A live usage reply has the internal plan id, not its display name from initialize.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeControl, claudeUsage } from './control.ts';

const raw = { subscription_type: 'max', rate_limits: { five_hour: { utilization: 21 } } };
const init = { account: { email: 'work@example.com', subscriptionType: 'Claude Ultra' } };
assert.equal(claudeUsage(raw, init).account?.plan, 'Claude Ultra');
assert.equal(claudeUsage(raw, null).account?.plan, 'max');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-usage-metadata-'));
const originalFetch = globalThis.fetch;
// A stand-in sign-in keeps reset reads from renewing through the metadata probe.
fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'test-only' } }));
globalThis.fetch = async () => new Response('{}', { status: 200 });
try {
  const control = new ClaudeControl({ CLAUDE_CONFIG_DIR: dir });
  // Stub only the CLI boundary; no account, network or model turn is needed.
  const internals = control as any;
  let probes = 0;
  let providerInit = { account: { ...init.account } };
  const probe = async () => {
    probes++;
    return { init: providerInit, usage: { ...raw, rate_limits: { five_hour: { utilization: 99 } } } };
  };
  internals.probe = probe;
  const live = async () => raw;
  let report = await control.usage(live);
  assert.equal(report.account?.plan, 'Claude Ultra', 'live usage loads the display name even before models are read');
  assert.equal(report.account?.email, 'work@example.com');
  assert.equal(report.windows[0].usedPercent, 21, 'keep the fresh live numbers');
  assert.equal(probes, 1);
  await control.usage(live);
  assert.equal(probes, 1, 'reuse account metadata rather than probing on each live update');
  providerInit = { account: { ...init.account, subscriptionType: 'Claude Pro' } };
  internals.initCache.at = Date.now() - 61 * 60_000;
  report = await control.usage(live);
  assert.equal(probes, 2, 'refresh old metadata even while live usage is available');
  assert.equal(report.account?.plan, 'Claude Pro', 'a provider plan change replaces the cached display name');
  assert.equal(report.windows[0].usedPercent, 21, 'metadata refresh keeps current live usage');
  control.restart();
  await control.usage(live);
  assert.equal(probes, 3, 'reload metadata after a CLI restart');
  internals.initCache.at = Date.now() - 61 * 60_000;
  internals.probe = async () => ({ init: null, usage: null });
  report = await control.usage(live);
  assert.equal(report.account?.plan, 'Claude Pro', 'a temporary probe failure keeps the last known display name');
  providerInit = { account: { ...init.account, subscriptionType: 'Claude Ultra' } };
  internals.probe = probe;
  report = await control.usage(live);
  assert.equal(report.account?.plan, 'Claude Ultra', 'retry expired metadata on the next read after a failure');
  assert.equal(probes, 4);
  internals.initCache = null;
  internals.probe = async () => ({ init: null, usage: null });
  report = await control.usage(live);
  assert.equal(report.ok, true, 'a failed metadata probe does not discard live usage');
  assert.equal(report.windows[0].usedPercent, 21);
  console.log('Claude live usage account metadata passed');
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(dir, { recursive: true, force: true });
}
