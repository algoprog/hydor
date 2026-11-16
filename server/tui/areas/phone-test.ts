// Checks for `hydor phone` against a fake connection (test-kit.ts): where things stand in each state, the address with a QR
// code that reads back as the phone's page, serve (on another port too) with the server's problem passed on, and stop.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/phone-test.ts && DATA_DIR=/tmp/hydor-test-tui-phone node dist/dev/phone-test.js
import assert from 'node:assert/strict';
import { qrCode } from '../../../shared/qr.ts';
import type { PhoneState } from '../../../shared/phone.ts';
import { ApiError } from '../client.ts';
import { fakeConn, run } from './test-kit.ts';
import { qrLines } from './phone.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const base: PhoneState = {
  tailscale: { state: 'ready', version: '1.76.6', syntax: 'new', dnsName: 'laptop.tail1234.ts.net', machine: 'laptop', tailnet: 'you@example.com', https: true, path: '/usr/bin/tailscale' },
  serving: null,
  taken: null,
  accepted: false,
  port: 8790,
  platform: 'linux',
  operatorCommand: 'sudo tailscale set --operator=you',
  download: 'https://tailscale.com/download',
};
const served: PhoneState = { ...base, serving: { url: 'https://laptop.tail1234.ts.net', port: 443, servedHere: true, funnel: false, at: 1 }, accepted: true };

test('status: missing, signed out, ready, served with its address', async () => {
  const missing = await run(fakeConn({ 'GET /api/phone': { ...base, tailscale: { state: 'missing' } } }).conn, ['phone']);
  assert.match(missing.out, /Tailscale\s+○?.*missing/);
  assert.match(missing.out, /isn’t installed on this computer\. Install it from https:\/\/tailscale\.com\/download/);
  const out = await run(fakeConn({ 'GET /api/phone': { ...base, tailscale: { state: 'signed-out' } } }).conn, ['phone']);
  assert.match(out.out, /run tailscale up and sign in/);
  const ready = await run(fakeConn({ 'GET /api/phone': base }).conn, ['phone', 'status']);
  assert.match(ready.out, /This computer\s+laptop on you@example\.com/);
  assert.match(ready.out, /hydor phone serve publishes it over HTTPS to the devices signed in to your Tailscale account only/);
  const on = await run(fakeConn({ 'GET /api/phone': served }).conn, ['phone']);
  assert.match(on.out, /Address\s+https:\/\/laptop\.tail1234\.ts\.net/);
  assert.match(on.out, /hydor phone stop takes it off your tailnet/);
  assert.ok(!on.out.includes('█'), 'no QR code when not at a terminal');
  assert.deepEqual((await run(fakeConn({ 'GET /api/phone': served }).conn, ['phone', '--json'])).json, [served]);
});

test('the QR code: drawn on asking, black on white, and it says the phone’s page', async () => {
  const t = await run(fakeConn({ 'GET /api/phone': served }).conn, ['phone', '--qr']);
  assert.match(t.out, /Scan it with your phone’s camera/);
  assert.ok(t.out.includes('██'));
  const code = qrCode('https://laptop.tail1234.ts.net/settings?s=phone', { level: 'M' });
  const lines = qrLines(code, { on: false });
  assert.equal(lines.length, code.size + 4);
  assert.ok(lines.every((l) => [...l].length === (code.size + 4) * 2), 'two columns a square');
  // Inside the quiet margin, the top-left finder's corner is dark.
  assert.equal(lines[2].slice(4, 6), '██');
  assert.equal(lines[1], ' '.repeat((code.size + 4) * 2));
  assert.ok(qrLines(code, { on: true })[0].startsWith('\x1b[30;47m'));
  assert.ok(t.out.includes(lines[5]), 'the code drawn is the phone page’s');
});

test('another service at 443, Funnel on, the address not accepted', async () => {
  const taken = await run(fakeConn({ 'GET /api/phone': { ...base, taken: { port: 443, target: 'http://127.0.0.1:3000', free: 8443 } } }).conn, ['phone']);
  assert.match(taken.out, /already published at https:\/\/laptop\.tail1234\.ts\.net \(http:\/\/127\.0\.0\.1:3000\).*hydor phone serve --port 8443/);
  const funnel = await run(fakeConn({ 'GET /api/phone': { ...served, serving: { ...served.serving!, funnel: true }, accepted: false } }).conn, ['phone', '--no-qr']);
  assert.match(funnel.out, /Funnel is on for this address: anyone on the internet can reach it\. Turn it off: tailscale funnel --https=443 off/);
  assert.match(funnel.out, /doesn’t accept this address yet: hydor phone serve adds it/);
});

test('serve, on another port too, passes the server’s problem on; stop', async () => {
  const { conn, calls } = fakeConn({ 'POST /api/phone/serve': served, 'POST /api/phone/stop': base });
  const t = await run(conn, ['phone', 'serve']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/phone/serve', body: {} });
  assert.match(t.out, /Address\s+https:\/\/laptop\.tail1234\.ts\.net/);
  await run(conn, ['phone', 'serve', '--port', '8443']);
  assert.deepEqual(calls.at(-1)?.body, { port: 8443 });
  assert.equal((await run(conn, ['phone', 'stop'])).out, 'Stopped: the app is no longer served on your tailnet.\n');
  const enable = 'Serve and HTTPS certificates aren’t turned on in your tailnet yet. Turn them on at https://login.tailscale.com/f/serve?node=n1 (one click, signed in to Tailscale), then press Serve it on my devices again.';
  await assert.rejects(run(fakeConn({ 'POST /api/phone/serve': new ApiError(409, enable) }).conn, ['phone', 'serve']), (e) => e instanceof ApiError && e.message.includes('https://login.tailscale.com/f/serve?node=n1'));
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
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
