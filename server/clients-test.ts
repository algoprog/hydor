// Script tests for keeping the agents' programs current (server/clients.ts): comparing versions, the checks a
// new version must pass (Claude Code's and Codex's handshakes, the others' --version), and what happens when your
// own Claude Code's update does not work: the sessions keep the version before until a newer one works. Stand-in
// programs play the agents; nothing real is updated (Check now only looks, at a lookup the test answers). Build and
// run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/clients-test.ts
//   DATA_DIR=/tmp/hydor-test-clients node dist/dev/clients-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acpEnvFor, clients, clientUpdates, clientUpdatesRunning, CLIENTS_BIN, lookup, newer, PACKAGES, pickTag, setClientAutoUpdate, startClientUpdates, updateOwn, versionOf, watchClients, works } from './clients.ts';
import { config } from './config.ts';
import { kvGet, openDb } from './db.ts';

if (!config.dataDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-clients-test-'));
const db = openDb(path.join(tmp, 'test.db'));
const updated: string[][] = [];
watchClients(db, (ids) => updated.push(ids));

// Versions.
assert.ok(newer('2.1.316', '2.1.308'));
assert.ok(!newer('2.1.308', '2.1.316'));
assert.ok(newer('0.166.0', '0.161.0') && newer('1.0.0', '0.99.99') && newer('0.10.0', '0.9.0'));
assert.ok(!newer('1.2.3', '1.2.3'));
assert.ok(newer('0.159.0', '0.159.0-alpha.12'), 'a release is newer than its own pre-releases');
assert.ok(!newer('0.159.0-alpha.12', '0.159.0'));
assert.ok(newer('0.159.0-alpha.12', '0.159.0-alpha.9'), 'pre-releases by their numbers');
assert.equal(pickTag('claude', { stable: '2.1.309', latest: '2.1.316' }, 'stable'), '2.1.309', 'Claude Code on its stable line');
assert.equal(pickTag('claude', { stable: '2.1.309', latest: '2.1.316' }, 'latest'), '2.1.316');
assert.equal(pickTag('gemini', { latest: '0.66.0', nightly: '0.67.0-nightly' }), '0.66.0');
assert.equal(pickTag('gemini', { latest: 'garbage' }), null);

// Stand-ins: a Claude Code whose versions live side by side as its native installer keeps them, its command a link.
const dir = path.join(tmp, 'claude');
fs.mkdirSync(path.join(dir, 'versions'), { recursive: true });
fs.mkdirSync(path.join(dir, 'bin'));
const link = path.join(dir, 'bin', 'claude');
const script = (file: string, body: string) => fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
const claude = (v: string, broken = false) =>
  script(
    path.join(dir, 'versions', v),
    [
      `V=${v}`,
      'case "$1" in',
      '  --version) echo "$V (Claude Code)"; exit 0 ;;',
      `  update) N=$(cat ${dir}/next); [ "$N" = "$V" ] && { echo "Claude Code is up to date"; exit 0; }; ln -sfn ${dir}/versions/$N ${link}; echo "Successfully updated from $V to version $N"; exit 0 ;;`,
      'esac',
      broken
        ? 'echo "boom: cannot start" >&2; exit 3'
        : `IFS= read -r line; echo '{"type":"control_response","response":{"request_id":"check","subtype":"success","response":{"models":[{"value":"default"}]}}}'; IFS= read -r rest`,
    ].join('\n'),
  );
const next = (v: string) => fs.writeFileSync(path.join(dir, 'next'), v);
claude('1.0.0');
claude('1.1.0', true);
claude('1.1.1', true);
claude('1.2.0');
fs.symlinkSync(path.join(dir, 'versions', '1.0.0'), link);

const codex = path.join(tmp, 'codex');
script(codex, ['case "$1" in --version) echo "codex-cli 9.9.9"; exit 0 ;; esac', `IFS= read -r a; echo '{"id":1,"result":{}}'`, 'IFS= read -r b', `IFS= read -r c; echo '{"id":2,"result":{"data":[]}}'`, 'IFS= read -r d'].join('\n'));
const codexNoModels = path.join(tmp, 'codex-no-models');
script(codexNoModels, [`IFS= read -r a; echo '{"id":1,"result":{}}'`, 'IFS= read -r b', `IFS= read -r c; echo '{"id":2,"error":{"code":-32601,"message":"no such method"}}'`, 'IFS= read -r d'].join('\n'));
const gemini = path.join(tmp, 'gemini');
script(gemini, 'echo 0.66.0');
// The Pi adapter has no --version: it answers ACP's initialize.
const piAcp = path.join(tmp, 'pi-acp');
script(piAcp, `IFS= read -r line; echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentInfo":{"name":"pi-acp"}}}'; IFS= read -r rest`);
const piAcpBroken = path.join(tmp, 'pi-acp-broken');
script(piAcpBroken, `IFS= read -r line; echo '{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"cannot start pi"}}'; IFS= read -r rest`);

const main = async () => {
  // The checks.
  assert.equal(await works('claude', link), null, 'Claude Code answers initialize with its models');
  const broken = await works('claude', path.join(dir, 'versions', '1.1.0'));
  assert.match(broken ?? '', /exit code 3.*boom/, 'one that stops says how, with what it wrote');
  assert.equal(await works('codex', codex), null, 'Codex initializes and lists its models');
  assert.match((await works('codex', codexNoModels)) ?? '', /could not list its models: no such method/);
  assert.equal(await works('gemini', gemini), null, 'the others say their version');
  assert.match((await works('gemini', '/bin/false')) ?? '', /did not start/);
  assert.match((await works('claude', path.join(tmp, 'nowhere'))) ?? '', /did not start/);
  assert.equal(await versionOf(link), '1.0.0');
  assert.equal(await works('pi-acp', piAcp), null, 'the Pi adapter answers the ACP handshake');
  assert.match((await works('pi-acp', piAcpBroken)) ?? '', /cannot start pi/);
  assert.match((await works('pi-acp', '/bin/false')) ?? '', /stopped before answering|did not start/);

  // Pi: the adapter and the agent itself, both installed without running their install scripts; the agent stays current as an entry of its own, out of Settings' list.
  assert.deepEqual(PACKAGES['pi-acp'], { pkg: 'pi-acp', name: 'Pi', with: ['pi'], ignoreScripts: true });
  assert.equal(PACKAGES.pi.pkg, '@earendil-works/pi-coding-agent');
  assert.ok(PACKAGES.pi.ignoreScripts && PACKAGES.pi.hidden);
  const listed = (await clients()).map((c) => c.id);
  assert.ok(listed.includes('pi-acp') && !listed.includes('pi'), 'Pi is one row in Settings');
  assert.deepEqual(acpEnvFor('gemini', {}), {}, 'only the Pi adapter is given a pi to run');
  assert.deepEqual(acpEnvFor('pi-acp', { PI_ACP_PI_COMMAND: '/mine/pi' }), {}, 'one you named stays');
  // With the app’s own pi and none on the PATH, the adapter is pointed at it.
  fs.mkdirSync(CLIENTS_BIN, { recursive: true });
  fs.writeFileSync(path.join(CLIENTS_BIN, 'pi'), '#!/bin/sh\n', { mode: 0o755 });
  const own = acpEnvFor('pi-acp', {});
  assert.ok(Object.keys(own).length === 0 || own.PI_ACP_PI_COMMAND === path.join(CLIENTS_BIN, 'pi'), 'the app’s copy (or yours, when you have one on the PATH)');

  // Your own Claude Code updates to a version that does not start: the sessions keep the one before.
  const bad: Record<string, string> = {};
  const before = fs.realpathSync(link);
  next('1.1.0');
  let it = await updateOwn('claude', link, '1.0.0', '1.1.0', bad, false);
  assert.equal(it?.ok, false);
  assert.equal(it?.to, '1.1.0');
  assert.equal(it?.kept, '1.0.0', 'kept the version that worked');
  assert.match(it?.error ?? '', /boom/);
  assert.equal(fs.realpathSync(link), path.join(dir, 'versions', '1.1.0'), 'your own command is as its updater left it');
  assert.equal(config.claudeBin, before, 'the sessions run the version before');
  assert.equal(bad['claude:yours'], '1.1.0', 'and that version is not tried again by itself');
  assert.equal(await versionOf(link), '1.1.0', 'a version is read again once the file changes');

  // Another that does not work: still the one that last worked, not the one in between.
  next('1.1.1');
  it = await updateOwn('claude', link, '1.1.0', '1.1.1', bad, true);
  assert.equal(it?.kept, '1.0.0');
  assert.equal(config.claudeBin, before);
  assert.equal(bad['claude:yours'], '1.1.1');

  // An updater that leaves it where it was says so.
  next('1.1.1');
  it = await updateOwn('claude', link, '1.1.1', '1.2.0', bad, false);
  assert.equal(it?.ok, false);
  assert.match(it?.error ?? '', /still 1\.1\.1 after its updater ran: Claude Code is up to date/);

  // One that works: done, and the sessions run your own command again.
  next('1.2.0');
  it = await updateOwn('claude', link, '1.1.1', '1.2.0', bad, true);
  assert.deepEqual(it, { id: 'claude', name: 'Claude Code', yours: undefined, from: '1.1.1', to: '1.2.0', ok: true });
  assert.equal(bad['claude:yours'], undefined);
  assert.equal(JSON.parse(kvGet(db, 'clients.pin') ?? 'null'), null, 'no version kept any more');
  assert.notEqual(config.claudeBin, before);

  // One so broken it no longer says its version: undone too.
  script(path.join(dir, 'versions', '1.3.0'), 'echo "Segmentation fault" >&2; exit 139');
  next('1.3.0');
  it = await updateOwn('claude', link, '1.2.0', '1.3.0', bad, true);
  assert.equal(it?.ok, false);
  assert.match(it?.error ?? '', /no longer says its version/);
  assert.equal(it?.kept, '1.2.0');
  assert.equal(config.claudeBin, path.join(dir, 'versions', '1.2.0'));
  assert.equal(bad['claude:yours'], '1.3.0');

  // A program with no updater of its own and not from npm: Update now says so, a run by itself passes it by.
  assert.equal(await updateOwn('gemini', gemini, '0.66.0', '0.67.0', bad, true), null);
  assert.match((await updateOwn('gemini', gemini, '0.66.0', '0.67.0', bad, false))?.error ?? '', /update it the way you installed it/);

  // Check now (and a run by itself with Update automatically off) only looks: nothing is installed.
  const asked: string[] = [];
  lookup.newest = async (cmd) => (asked.push(cmd), cmd === 'codex' ? '999.0.0' : null);
  const wait = async () => {
    while (clientUpdatesRunning()) await new Promise((r) => setTimeout(r, 20));
  };
  assert.equal(startClientUpdates('check').running, 'check');
  assert.throws(() => startClientUpdates('now'), /already being checked or updated/);
  await wait();
  assert.ok(asked.includes('codex'), 'Codex comes with the app, so it is always looked up');
  let u = clientUpdates();
  assert.ok(u.checkedAt && Date.now() - u.checkedAt < 60_000);
  assert.equal(u.running, undefined);
  assert.equal(u.last, undefined, 'nothing was updated');
  assert.deepEqual(JSON.parse(kvGet(db, 'clients.latest')!).latest.codex, '999.0.0');
  assert.equal(u.auto, true, 'on by default');
  u = setClientAutoUpdate(false);
  assert.equal(u.auto, false);
  assert.equal(startClientUpdates('auto').running, 'check', 'off: a run by itself only looks');
  await wait();
  assert.equal(clientUpdates().last, undefined);
  lookup.newest = async () => {
    throw new Error('npm ERR! network unreachable');
  };
  startClientUpdates('check');
  await wait();
  assert.equal(clientUpdates().error, 'npm ERR! network unreachable', 'a lookup that fails says why, once when it is the same for all');
  lookup.newest = async (cmd) => {
    if (cmd === 'codex') throw new Error('E404');
    throw new Error('ETIMEDOUT');
  };
  startClientUpdates('check');
  await wait();
  assert.match(clientUpdates().error ?? '', /Codex: E404/, 'else each program’s');
  assert.deepEqual(updated, [], 'nothing changed, so nothing restarted');

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('clients tests passed');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
