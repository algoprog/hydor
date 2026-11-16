// Script test for Settings → App → Use on your phone (server/phone): every state Tailscale can be in, Serve published,
// refused or waiting on the tailnet, the address accepted by the server and taken out again, Stop serving undoing exactly
// what was done (and nothing it did not do), the older Serve command line, the API's answers, and agents refused Serve
// without a card. It never runs the real `tailscale`: a fake one (fake-tailscale.mjs) plays it from a state file.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/phone/phone-test.ts && DATA_DIR=/tmp/hydor-test-phone node dist/dev/phone-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { APP_ROOT } from '../config.ts';
import { openDb, type DB } from '../db.ts';
import { HttpError } from '../auth.ts';
import { addOrigin, linkBase, loadOrigins, originListed, storedOrigins } from '../origins.ts';
import { ruleFor } from '../guide/api.ts';
import { Phone, phoneRoutes, type PhoneProblem } from './index.ts';
import { findTailscale, parseServe, parseVersion, pointsAt, serveProblem, serveSyntax } from './tailscale.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

// The fake, from the source tree (the test runs from dist/dev).
const FAKE = [path.join(APP_ROOT, 'server/phone/fake-tailscale.mjs')].find((f) => fs.existsSync(f));
assert.ok(FAKE, 'server/phone/fake-tailscale.mjs is missing');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-phone-test-'));
const PORT = 8803;
const HOST = 'laptop.tail1234.ts.net';
const TARGET = `http://127.0.0.1:${PORT}`;

let n = 0;
/** A folder with the fake `tailscale` in it, playing `state`; its calls are read back with calls(). */
function fake(state: object) {
  const dir = path.join(tmp, `ts-${++n}`);
  fs.mkdirSync(dir);
  const bin = path.join(dir, 'tailscale');
  fs.writeFileSync(bin, `#!${process.execPath}\n${fs.readFileSync(FAKE!, 'utf8')}`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state));
  return {
    dir,
    bin,
    calls: () => (fs.existsSync(path.join(dir, 'calls.log')) ? fs.readFileSync(path.join(dir, 'calls.log'), 'utf8').trim().split('\n') : []),
    serveConfig: () => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).serve ?? {},
    set: (more: object) => fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')), ...more })),
  };
}

const fresh = (): DB => {
  const db = openDb(path.join(tmp, `test-${++n}.db`));
  loadOrigins(db);
  return db;
};
const phoneWith = (bin: string | null, platform: NodeJS.Platform = 'linux') => {
  const db = fresh();
  return { db, phone: new Phone(db, PORT, { bin: () => bin, platform }) };
};

/** The problem a refused call carries. */
async function refused(p: Promise<unknown>): Promise<{ status: number; message: string; problem: PhoneProblem }> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof HttpError, `not an HttpError: ${(e as Error).stack}`);
    return { status: e.status, message: e.message, problem: e.extra?.problem as PhoneProblem };
  }
  assert.fail('it was not refused');
}

const neverPublic = (calls: string[]) => {
  for (const c of calls) assert.ok(!/funnel|^up\b|^down\b|^set\b/.test(c), `asked the fake: ${c}`);
};

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('the command is found on PATH, in the usual places, or only where TAILSCALE_BIN says', () => {
  const f = fake({});
  assert.equal(findTailscale({ env: { PATH: `/nowhere${path.delimiter}${f.dir}` }, places: [] }), f.bin);
  assert.equal(findTailscale({ env: { PATH: '/nowhere' }, places: ['/nope/tailscale', f.bin] }), f.bin);
  assert.equal(findTailscale({ env: { PATH: '/nowhere' }, places: [] }), null);
  assert.equal(findTailscale({ env: { PATH: f.dir, TAILSCALE_BIN: path.join(tmp, 'missing') }, places: [f.bin] }), null, 'TAILSCALE_BIN alone, when set');
  assert.equal(findTailscale({ env: { PATH: '/nowhere', TAILSCALE_BIN: f.bin }, places: [] }), f.bin);
});

test('versions pick the command line: --bg from 1.52, https:443 / before, none before 1.38', () => {
  assert.deepEqual(parseVersion('1.76.6\n  tailscale commit: x'), { version: '1.76.6', major: 1, minor: 76 });
  assert.equal(serveSyntax(parseVersion('1.52.0')), 'new');
  assert.equal(serveSyntax(parseVersion('1.50.1')), 'old');
  assert.equal(serveSyntax(parseVersion('1.38.0')), 'old');
  assert.equal(serveSyntax(parseVersion('1.36.2')), 'none');
  assert.equal(serveSyntax(parseVersion('2.0.0')), 'new');
  assert.ok(pointsAt('http://127.0.0.1:8803', 8803) && pointsAt('http://localhost:8803/', 8803) && pointsAt('8803', 8803));
  assert.ok(!pointsAt('http://127.0.0.1:3000', 8803) && !pointsAt('http://127.0.0.1:18803', 8803));
});

test('what serve prints says what stands in the way', () => {
  assert.deepEqual(serveProblem('\nServe is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=n1\n'), { kind: 'enable', link: 'https://login.tailscale.com/f/serve?node=n1' });
  assert.equal(serveProblem("Access denied: serve config denied\n\nTo not require root, use 'sudo tailscale set --operator=$USER' once.", 'linux')?.kind, 'operator');
  assert.equal(serveProblem('foreground listener already exists for port 443')?.kind, 'port-taken');
  assert.notEqual(serveProblem('https://laptop.tail1234.ts.net/')?.kind, 'enable', 'its own address is no link to turn things on');
});

test('Tailscale missing: said, with the download page, and nothing to serve', async () => {
  const { phone } = phoneWith(null);
  const s = await phone.state();
  assert.equal(s.tailscale.state, 'missing');
  assert.equal(s.serving, null);
  assert.equal(s.download, 'https://tailscale.com/download');
  const r = await refused(phone.serve());
  assert.equal(r.status, 409);
  assert.equal(r.problem.kind, 'not-ready');
  assert.equal(r.problem.link, 'https://tailscale.com/download');
  assert.match(r.message, /isn’t installed/);
});

test('installed but not running, signed out, turned off, waiting for approval, too old', async () => {
  const cases: [object, string, RegExp][] = [
    [{ daemon: false }, 'not-running', /not running.*systemctl start tailscaled/],
    [{ backend: 'NeedsLogin' }, 'signed-out', /isn’t signed in.*tailscale up/],
    [{ backend: 'Stopped' }, 'stopped', /turned off.*tailscale up/],
    [{ backend: 'NeedsMachineAuth' }, 'needs-approval', /approve/],
    [{ version: '1.34.2' }, 'too-old', /too old for Serve/],
  ];
  for (const [state, want, words] of cases) {
    const f = fake(state);
    const { phone } = phoneWith(f.bin);
    const s = await phone.state();
    assert.equal(s.tailscale.state, want, JSON.stringify(state));
    assert.equal(s.tailscale.path, f.bin);
    const r = await refused(phone.serve());
    assert.equal(r.problem.kind, 'not-ready');
    assert.match(r.message, words);
    assert.ok(!f.calls().some((c) => c.startsWith('serve --bg') || c.startsWith('serve https:')), 'nothing was served');
    neverPublic(f.calls());
  }
  // On a Mac the words point at the app, not a command.
  const { phone } = phoneWith(fake({ backend: 'NeedsLogin' }).bin, 'darwin');
  assert.doesNotMatch((await refused(phone.serve())).message, /tailscale up/);
  // The sign-in under way, when Tailscale has one.
  assert.equal((await phoneWith(fake({ backend: 'NeedsLogin' }).bin).phone.state()).tailscale.loginUrl, 'https://login.tailscale.com/a/abc123');
});

test('signed in: this machine’s name, the tailnet, HTTPS certificates on or off', async () => {
  const s = await phoneWith(fake({}).bin).phone.state();
  assert.equal(s.tailscale.state, 'ready');
  assert.equal(s.tailscale.dnsName, HOST);
  assert.equal(s.tailscale.machine, 'laptop');
  assert.equal(s.tailscale.tailnet, 'you@example.com');
  assert.equal(s.tailscale.https, true);
  assert.equal(s.tailscale.version, '1.76.6');
  assert.equal(s.serving, null);
  assert.equal(s.taken, null);
  assert.equal(s.port, PORT);
  assert.match(s.operatorCommand, /^sudo tailscale set --operator=\S+$/);
  assert.equal((await phoneWith(fake({ certs: false }).bin).phone.state()).tailscale.https, false);
});

test('Serve it publishes over HTTPS on the tailnet only, accepts the address, and Stop serving undoes exactly that', async () => {
  const f = fake({});
  const { db, phone } = phoneWith(f.bin);
  const s = await phone.serve();
  assert.deepEqual(s.serving, { url: `https://${HOST}`, port: 443, servedHere: true, funnel: false, at: s.serving?.at });
  assert.ok(s.accepted);
  assert.ok(originListed(`https://${HOST}`));
  assert.deepEqual(storedOrigins(), [`https://${HOST}`]);
  assert.ok(f.calls().includes(`serve --bg --https=443 ${TARGET}`), f.calls().join('\n'));
  assert.deepEqual(f.serveConfig().Web[`${HOST}:443`].Handlers, { '/': { Proxy: TARGET } });
  assert.equal(phone.record()?.originAdded, true);
  // The address stays accepted after a restart (it is kept in the database).
  loadOrigins(db);
  assert.ok(originListed(`https://${HOST}`));
  // Serving again changes nothing.
  const again = await phone.serve();
  assert.equal(again.serving?.url, `https://${HOST}`);
  assert.equal(f.calls().filter((c) => c.startsWith('serve --bg')).length, 1);
  const off = await phone.stop();
  assert.equal(off.serving, null);
  assert.ok(f.calls().includes('serve --https=443 --set-path=/ off'), f.calls().join('\n'));
  assert.deepEqual(f.serveConfig(), {});
  assert.ok(!originListed(`https://${HOST}`));
  assert.deepEqual(storedOrigins(), []);
  assert.equal(phone.record(), null);
  neverPublic(f.calls());
});

test('Stop serving leaves what it did not do: other ports, other paths, an address accepted before', async () => {
  const f = fake({ serve: { TCP: { '8443': { HTTPS: true } }, Web: { [`${HOST}:8443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } } } });
  const { phone } = phoneWith(f.bin);
  addOrigin(`https://${HOST}`);
  await phone.serve();
  assert.equal(phone.record()?.originAdded, false, 'accepted already: not added');
  // Someone adds a path of their own beside it on the same port.
  const sc = f.serveConfig();
  sc.Web[`${HOST}:443`].Handlers['/docs'] = { Path: '/srv/docs' };
  f.set({ serve: sc });
  await phone.stop();
  const left = f.serveConfig();
  assert.deepEqual(left.Web[`${HOST}:8443`], { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } }, 'the other port stays');
  assert.deepEqual(left.Web[`${HOST}:443`], { Handlers: { '/docs': { Path: '/srv/docs' } } }, 'the other path stays');
  assert.ok(originListed(`https://${HOST}`), 'an address accepted before stays accepted');
});

test('Serve not turned on in the tailnet: its link, whether the command stops or waits', async () => {
  for (const wait of [false, true]) {
    const f = fake({ serveEnabled: false, wait });
    const { phone } = phoneWith(f.bin);
    const t0 = Date.now();
    const r = await refused(phone.serve());
    assert.ok(Date.now() - t0 < 10_000, 'a waiting command is stopped once its link shows');
    assert.equal(r.problem.kind, 'enable');
    assert.equal(r.problem.link, 'https://login.tailscale.com/f/serve?node=nFAKE123');
    assert.match(r.message, /aren’t turned on in your tailnet yet\. Turn them on at https:\/\/login\.tailscale\.com\/f\/serve\?node=nFAKE123/);
    assert.ok(!originListed(`https://${HOST}`));
    assert.equal(phone.record(), null);
    // Turned on in the browser, it works the next time.
    f.set({ serveEnabled: true });
    assert.equal((await phone.serve()).serving?.url, `https://${HOST}`);
    await phone.stop();
  }
});

test('Linux without being Tailscale’s operator: the one command to run, once, with sudo', async () => {
  const f = fake({ operator: false });
  const { phone } = phoneWith(f.bin);
  const r = await refused(phone.serve());
  assert.equal(r.problem.kind, 'operator');
  assert.match(r.problem.command ?? '', /^sudo tailscale set --operator=\S+$/);
  assert.match(r.message, /Run this once in a terminal, then try again: sudo tailscale set --operator=/);
  assert.ok(!originListed(`https://${HOST}`));
  assert.ok(!f.calls().some((c) => c.startsWith('set')), 'the command is the person’s to run');
});

test('another service on port 443: kept, and the app offered port 8443, then served and stopped there alone', async () => {
  const other = { TCP: { '443': { HTTPS: true } }, Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } } };
  const f = fake({ serve: other });
  const { phone } = phoneWith(f.bin);
  const s = await phone.state();
  assert.deepEqual(s.taken, { port: 443, target: 'http://127.0.0.1:3000', free: 8443 });
  const r = await refused(phone.serve());
  assert.equal(r.problem.kind, 'port-taken');
  assert.equal(r.problem.port, 8443);
  assert.match(r.message, /already published at https:\/\/laptop\.tail1234\.ts\.net \(http:\/\/127\.0\.0\.1:3000\).*port 8443/);
  assert.deepEqual(f.serveConfig(), other, 'untouched');
  const on = await phone.serve(8443);
  assert.equal(on.serving?.url, `https://${HOST}:8443`);
  assert.ok(originListed(`https://${HOST}:8443`));
  await phone.stop();
  assert.ok(f.calls().includes('serve --https=8443 --set-path=/ off'));
  assert.deepEqual(f.serveConfig(), other, 'the other service is as it was');
  assert.ok(!originListed(`https://${HOST}:8443`));
  await assert.rejects(phone.serve(8080), (e) => e instanceof HttpError && e.status === 400);
});

test('Tailscale before 1.52: the older command line, both ways', async () => {
  const f = fake({ version: '1.48.2' });
  const { phone } = phoneWith(f.bin);
  assert.equal((await phone.state()).tailscale.syntax, 'old');
  assert.equal((await phone.serve()).serving?.url, `https://${HOST}`);
  assert.ok(f.calls().includes(`serve https:443 / ${TARGET}`), f.calls().join('\n'));
  await phone.stop();
  assert.ok(f.calls().includes('serve https:443 / off'));
  assert.deepEqual(f.serveConfig(), {});
});

test('published by hand already: shown, taken on by Serve it, stopped by Stop serving', async () => {
  const f = fake({ serve: { TCP: { '443': { HTTPS: true } }, Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: TARGET } } } } } });
  const { phone } = phoneWith(f.bin);
  const s = await phone.state();
  assert.deepEqual(s.serving, { url: `https://${HOST}`, port: 443, servedHere: false, funnel: false, at: undefined });
  assert.equal(s.accepted, false);
  const t = await phone.serve();
  assert.equal(t.accepted, true);
  assert.equal(t.serving?.servedHere, false);
  assert.ok(!f.calls().some((c) => c.startsWith('serve --bg')), 'nothing published again');
  await phone.stop();
  assert.deepEqual(f.serveConfig(), {});
  assert.ok(!originListed(`https://${HOST}`));
});

test('Funnel turned on by hand for the address is flagged', async () => {
  const f = fake({ serve: { TCP: { '443': { HTTPS: true } }, Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: TARGET } } } }, AllowFunnel: { [`${HOST}:443`]: true } } });
  assert.equal((await phoneWith(f.bin).phone.state()).serving?.funnel, true);
  assert.deepEqual(parseServe(JSON.stringify({ Foreground: { s1: { Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: TARGET } } } } } } }), HOST)[0].foreground, true);
});

test('Stop serving with Tailscale gone or signed out', async () => {
  const f = fake({});
  const { db, phone } = phoneWith(f.bin);
  await phone.serve();
  f.set({ backend: 'NeedsLogin' });
  const r = await refused(phone.stop());
  assert.match(r.message, /Tailscale has to be running to turn Serve off/);
  assert.ok(originListed(`https://${HOST}`), 'kept until it can be undone');
  // Uninstalled: nothing is served any more, so the address goes.
  await new Phone(db, PORT, { bin: () => null, platform: 'linux' }).stop();
  assert.ok(!originListed(`https://${HOST}`));
});

test('the API: status, serve with its problem, stop', async () => {
  const f = fake({ serveEnabled: false });
  const { phone } = phoneWith(f.bin);
  const app = Fastify();
  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err instanceof HttpError ? err.status : (err.statusCode ?? 500);
    reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
  });
  phoneRoutes(app, phone);
  const get = await app.inject({ method: 'GET', url: '/api/phone' });
  assert.equal(get.statusCode, 200);
  assert.equal(get.json().tailscale.dnsName, HOST);
  const bad = await app.inject({ method: 'POST', url: '/api/phone/serve', payload: {} });
  assert.equal(bad.statusCode, 409);
  assert.equal(bad.json().problem.kind, 'enable');
  assert.equal(bad.json().problem.link, 'https://login.tailscale.com/f/serve?node=nFAKE123');
  f.set({ serveEnabled: true });
  const ok = await app.inject({ method: 'POST', url: '/api/phone/serve', payload: { port: 443 } });
  assert.equal(ok.json().serving.url, `https://${HOST}`);
  const off = await app.inject({ method: 'POST', url: '/api/phone/stop' });
  assert.equal(off.json().serving, null);
  await app.close();
});

test('links the app hands out: the served address while it is served, unless ALLOWED_ORIGINS names one, which stays', async () => {
  const other = { TCP: { '443': { HTTPS: true } }, Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } } };
  const f = fake({});
  const { db, phone } = phoneWith(f.bin);
  // As server/index.ts makes them: ALLOWED_ORIGINS's first, else the served address, else this computer's.
  const base = (allowed: string[]) => linkBase(allowed, phone.servedUrl(), PORT);
  const LIVE = ['https://hydor.example.com', 'https://other.example.com'];
  assert.equal(base([]), `http://127.0.0.1:${PORT}`, 'not served: this computer');
  assert.equal(base(LIVE), 'https://hydor.example.com');
  await phone.serve();
  assert.equal(base([]), `https://${HOST}`, 'served, nothing set: the tailnet address');
  assert.equal(base(LIVE), 'https://hydor.example.com', 'an address set stays the one links use');
  // Kept over a restart (the record is in the database), without asking Tailscale.
  assert.equal(new Phone(db, PORT, { bin: () => null }).servedUrl(), `https://${HOST}`);
  await phone.stop();
  assert.equal(base([]), `http://127.0.0.1:${PORT}`, 'stopped: back to this computer');
  assert.equal(base(LIVE), 'https://hydor.example.com');
  // Served on another port, links say it.
  f.set({ serve: other });
  await phone.serve(8443);
  assert.equal(base([]), `https://${HOST}:8443`);
  await phone.stop();
  // Published by hand and taken on (Accept it): links use it too.
  f.set({ serve: { TCP: { '443': { HTTPS: true } }, Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: TARGET } } } } } });
  assert.equal(base([]), `http://127.0.0.1:${PORT}`, 'not taken on yet');
  await phone.serve();
  assert.equal(base([]), `https://${HOST}`);
});

test('agents: Serve only on a card each time (Full access too), Stop serving on a card', () => {
  assert.equal(ruleFor('POST', '/api/phone/serve').level, 'ask');
  assert.match(ruleFor('POST', '/api/phone/serve').why ?? '', /never the public internet/);
  assert.equal(ruleFor('POST', '/api/phone/stop').level, 'always');
  assert.equal(ruleFor('GET', '/api/phone').level, 'free');
});

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
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
