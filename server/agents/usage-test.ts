// A live usage reply has the internal plan id, not its display name from initialize.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keychainService, resetReads } from './claudeResets.ts';
import { ClaudeControl, claudeUsage, CodexControl } from './control.ts';

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

// On a Mac, Claude Code keeps its sign-in in the login Keychain, under a name it makes from the config folder.
{
  const env = { dir: process.env.CLAUDE_CONFIG_DIR, store: process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR };
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  try {
    assert.equal(keychainService(), 'Claude Code-credentials', 'the default folder: no suffix');
    assert.equal(keychainService('/Users/me/.hydor/accounts/claude-ab12cd34'), 'Claude Code-credentials-bc8fbd49', 'an added account: its folder’s hash');
    process.env.CLAUDE_CONFIG_DIR = '/Users/me/.hydor/accounts/claude-ab12cd34';
    assert.equal(keychainService(), 'Claude Code-credentials-bc8fbd49', 'CLAUDE_CONFIG_DIR for the default account too');
  } finally {
    if (env.dir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = env.dir;
    if (env.store !== undefined) process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = env.store;
  }
}

// Limit resets: read seldom (Anthropic refuses reads that come too often), kept through a refused read, a sign-in that
// did not renew in time and a restart; a Codex limits read that failed keeps the last ones too.
{
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-usage-resets-'));
  const creds = (expiresAt?: number) => fs.writeFileSync(path.join(dir2, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'test-only', expiresAt } }));
  creds();
  fs.writeFileSync(path.join(dir2, '.claude.json'), JSON.stringify({ oauthAccount: { organizationUuid: '0b5c4f4e-8a3c-4c1e-9d7e-3f2a1b0c9d8e' } }));
  const grants = [
    { id: 'full-reset-2611', label: 'One full limit reset', resets_left: 1, usable_now: true },
    { id: 'launch-fable', label: 'One Fable reset', resets_left: 2, usable_now: true },
  ];
  let reads = 0;
  let refuse = false;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return new Response(JSON.stringify({ result: 'reset' }), { status: 200 });
    reads++;
    if (refuse) return new Response(JSON.stringify({ error: { type: 'rate_limit_error' } }), { status: 429 });
    return new Response(JSON.stringify({ cedar_ember: { grants } }), { status: 200 });
  }) as typeof fetch;
  const ids = (u: { resetCredits?: { items: { id: string }[] } | null }) => u.resetCredits?.items.map((r) => r.id);
  try {
    const control = new ClaudeControl({ CLAUDE_CONFIG_DIR: dir2 });
    (control as any).probe = async () => ({ init, usage: raw });
    let report = await control.usage();
    assert.deepEqual(ids(report), ['full-reset-2611', 'launch-fable'], 'the resets are read');
    report = await control.usage();
    assert.equal(reads, 1, 'not again within ten minutes');
    assert.deepEqual(ids(report), ['full-reset-2611', 'launch-fable']);

    // Due again, and refused: the last ones stand, and the next read waits (longer each time).
    (control as any).resetsNext = 0;
    refuse = true;
    report = await control.usage();
    assert.equal(reads, 2);
    assert.deepEqual(ids(report), ['full-reset-2611', 'launch-fable'], 'a refused read (HTTP 429) keeps the resets from the last one');
    await control.usage();
    assert.equal(reads, 2, 'and the next read waits');
    assert.equal((control as any).resetsWait, 2 * resetReads.every, 'longer after each refusal');

    // A sign-in that did not renew in time: the same.
    refuse = false;
    (control as any).resetsNext = 0;
    creds(Date.now() - 1000);
    report = await control.usage();
    assert.deepEqual(ids(report), ['full-reset-2611', 'launch-fable'], 'a sign-in that did not renew keeps them too');
    creds();

    // After a restart, refused at once: the ones kept on disk show.
    const again = new ClaudeControl({ CLAUDE_CONFIG_DIR: dir2 });
    (again as any).probe = async () => ({ init, usage: raw });
    refuse = true;
    report = await again.usage();
    assert.deepEqual(ids(report), ['full-reset-2611', 'launch-fable'], 'a restart shows the resets kept from before');

    // Using one takes it off the list at once, and the next usage read asks again.
    refuse = false;
    const used = await again.useReset('launch-fable');
    assert.equal(used.outcome, 'reset');
    assert.equal(again.lastUsage?.resetCredits?.items.find((r) => r.id === 'launch-fable')?.left, 1, 'one use of it left');
    assert.equal(again.lastUsage?.resetCredits?.available, 2);
    await again.useReset('full-reset-2611');
    assert.deepEqual(ids(again.lastUsage!), ['launch-fable'], 'a reset used up leaves the list');
    const before = reads;
    await again.usage();
    assert.equal(reads, before + 1, 'read again after a reset is used');

    const codex = new CodexControl();
    let fail = false;
    const limits = {
      rateLimits: { limitId: 'codex', primary: { usedPercent: 40, windowDurationMins: 300, resetsAt: 1_900_000_000 } },
      rateLimitResetCredits: { availableCount: 1, credits: [{ id: 'c1', title: 'Limit reset', status: 'available' }] },
    };
    (codex as any).call = async (method: string) => {
      if (method === 'account/read') return { account: { email: 'me@example.com', planType: 'plus', type: 'chatgpt' } };
      if (method === 'account/rateLimits/read') {
        if (fail) throw new Error('network');
        return limits;
      }
      return null;
    };
    let cx = await codex.usage();
    assert.equal(cx.resetCredits?.available, 1);
    assert.equal(cx.windows.length, 1);
    fail = true;
    cx = await codex.usage();
    assert.equal(cx.resetCredits?.available, 1, 'a failed limits read keeps the last resets');
    assert.equal(cx.windows[0]?.usedPercent, 40, 'and the last limits, rather than none');
    console.log('Limit resets: read seldom, kept through refusals and restarts passed');
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dir2, { recursive: true, force: true });
  }
}

// A limit the last read of the resets found is held only while it can be true: until its window resets, or until the next read is due, never past a refused read.
{
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-usage-hold-'));
  fs.writeFileSync(path.join(dir3, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'test-only' } }));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let atLimit = true;
  let refuse = false;
  let reads = 0;
  globalThis.fetch = (async () => {
    reads++;
    if (refuse) return new Response('{}', { status: 429 });
    return new Response(JSON.stringify({ cedar_ember: { at_limit: atLimit, grants: [] } }), { status: 200 });
  }) as typeof fetch;
  const savedEvery = resetReads.every;
  try {
    const control = new ClaudeControl({ CLAUDE_CONFIG_DIR: dir3 });
    let five: { utilization: number; resets_at: string } = { utilization: 100, resets_at: new Date(Date.now() + 300).toISOString() };
    (control as any).probe = async () => ({ init, usage: { rate_limits: { five_hour: five } } });

    // 1. The window is full and the resets say at limit: the report shows that limit.
    let report = await control.usage();
    assert.equal(report.limited?.label, report.windows[0].label, 'a full window is the limit shown');

    // 2. Its reset time has passed and the window is back to 3%: the hold ends, and it does not come back on the next report.
    await sleep(350);
    five = { utilization: 3, resets_at: new Date(Date.now() + 5 * 3600_000).toISOString() };
    report = await control.usage();
    assert.equal(report.limited, null, 'a hold ends when its window has reset');
    report = await control.usage();
    assert.equal(report.limited, null, 'and no bare "Usage limit" comes back from the next report');
    assert.equal(reads, 1, 'the resets were not read again');

    // 3. A read that is due again still says at limit, with no known window: the hold lasts until the next read.
    resetReads.every = 300;
    (control as any).resetsNext = 0;
    report = await control.usage();
    assert.deepEqual(report.limited, { label: 'Usage limit', resetsAt: null }, 'at limit with no window known: held until the next read');
    report = await control.usage();
    assert.deepEqual(report.limited, { label: 'Usage limit', resetsAt: null }, 'still held on a report at once');

    // 4. The next read is due after the hold, and is refused: the hold does not last beyond its time.
    await sleep(350);
    refuse = true;
    report = await control.usage();
    assert.equal(report.limited, null, 'a refused read does not keep the hold longer');

    // 5. A live refusal for a weekly limit (one hour) holds through a read that is at limit with no window shown.
    refuse = false;
    const at = Math.floor(Date.now() / 1000) + 3600;
    const live = control.applyRateLimit({ status: 'rejected', rateLimitType: 'seven_day', resetsAt: at });
    (control as any).resetsNext = 0;
    report = await control.usage();
    assert.deepEqual(report.limited, live!.limited, 'the live refusal is what is held');
    assert.equal(report.limited?.resetsAt, at * 1000, 'until its reset time');
    report = await control.usage();
    assert.deepEqual(report.limited, live!.limited, 'and still held on the next report');

    // 6. The resets no longer say at limit: the hold is gone.
    atLimit = false;
    (control as any).resetsNext = 0;
    report = await control.usage();
    assert.equal(report.limited, null, 'not at limit any more, so nothing is held');
    console.log('Limit held from the resets read only while it can be true passed');
  } finally {
    resetReads.every = savedEvery;
    globalThis.fetch = originalFetch;
    fs.rmSync(dir3, { recursive: true, force: true });
  }
}
