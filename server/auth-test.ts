// Script tests for signing in after wrong passwords (server/auth.ts, server/captcha.ts): whose address a request is,
// IPv6 counted by its /64, the picture from the third wrong password from an address, reading it (a misread costs no
// try, each picture is good for one), an hour without sign-ins from the address after the tenth, tries sent all at
// once, the picture for everyone and the full stop after many wrong passwords from anywhere, the pause kept over a
// restart and lifted by set-password, the cap on pictures, and the PNG itself. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/auth-test.ts
//   DATA_DIR=/tmp/naget-test-auth node dist/dev/auth-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { addressKey, AuthManager, clientAddress, HttpError, SIGN_IN_LIMITS } from './auth.ts';
import { CAPTCHA_CHARS, CAPTCHA_SIZE, captchaText, drawCaptcha, sameCaptcha } from './captcha.ts';
import { config, ensureDirs, paths } from './config.ts';
import { openDb } from './db.ts';

if (!config.dataDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

ensureDirs();
fs.rmSync(paths.auth, { force: true });
fs.rmSync(paths.setupToken, { force: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-auth-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let auth = new AuthManager(db);
const PW = 'the right password';
await auth.setup(auth.setupToken()!, PW);

// A clock the test moves.
let now = Date.now();
Date.now = () => now;

/** A sign-in as /api/auth/login makes it: its status, message and the reply's other fields. */
async function signIn(ip: string, password: string, picture?: { id?: string; answer?: string } | null) {
  try {
    const at = auth.beginTry(ip, picture);
    if (!(await auth.verifyPassword(password))) auth.wrongTry(ip);
    auth.rightTry(ip, at);
    return { status: 200, error: '', extra: {} as Record<string, unknown> };
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    return { status: e.status, error: e.message, extra: e.extra ?? {} };
  }
}
type Pic = { needed: true; id: string; image: string; left: number };
const newPicture = (ip: string): Pic => {
  const p = auth.picture(ip);
  assert.equal(p.needed, true, 'a picture is owed');
  return p as Pic;
};
/** What a picture shows, as the server keeps it. */
const answerOf = (ip: string, id: string): string => (auth as any).pictures.get(addressKey(ip)).open.find((o: any) => o.id === id).text;
const refused = (status: number, message: RegExp) => (e: unknown) => e instanceof HttpError && e.status === status && message.test(e.message);

// ---- addresses ---------------------------------------------------------------------------------------------------
assert.equal(addressKey('203.0.113.7'), '203.0.113.7');
assert.equal(addressKey('::ffff:203.0.113.7'), '203.0.113.7', 'IPv4 seen through an IPv6 socket');
assert.equal(addressKey('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64', 'IPv6 by its /64');
assert.equal(addressKey('2001:DB8:1:2::9'), '2001:db8:1:2::/64', 'however it is written');
assert.equal(addressKey('2001:0db8:0001:0002:aaaa::1%eth0'), '2001:db8:1:2::/64');
assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0::/64');
assert.equal(addressKey('1:2::3:4:5:6:7'), '1:2:0:3::/64');
assert.notEqual(addressKey('2001:db8:1:3::1'), addressKey('2001:db8:1:2::1'));

// Whose address a request is: X-Forwarded-For only through a proxy here or on a private network, read from its end.
assert.equal(clientAddress('203.0.113.9', '198.51.100.1'), '203.0.113.9', 'straight from the internet: the header counts for nothing');
assert.equal(clientAddress('127.0.0.1', '198.51.100.1'), '198.51.100.1', 'Cloudflare Tunnel or Caddy on this computer');
assert.equal(clientAddress('::ffff:127.0.0.1', '198.51.100.1'), '198.51.100.1');
assert.equal(clientAddress('172.17.0.1', '198.51.100.1'), '198.51.100.1', "Docker's network");
assert.equal(clientAddress('127.0.0.1', '6.6.6.6, 198.51.100.1'), '198.51.100.1', 'what the visitor wrote comes before what the proxy added');
assert.equal(clientAddress('127.0.0.1', '6.6.6.6, 198.51.100.1, 172.18.0.3'), '198.51.100.1', 'past proxies on a private network');
assert.equal(clientAddress('127.0.0.1', '192.168.1.20'), '192.168.1.20', 'someone on the home network, through the proxy');
assert.equal(clientAddress('127.0.0.1', '[2001:db8::7]:443, 198.51.100.1:5050'), '198.51.100.1', 'ports and brackets');
assert.equal(clientAddress('127.0.0.1', '2001:db8::7'), '2001:db8::7');
assert.equal(clientAddress('127.0.0.1', 'unknown, <script>'), '127.0.0.1', 'nothing usable: the proxy itself');
assert.equal(clientAddress('127.0.0.1', undefined), '127.0.0.1', 'opened on this computer');
assert.equal(clientAddress('100.101.102.103', '198.51.100.1'), '198.51.100.1', 'a Tailscale address');
assert.equal(clientAddress('fd12:3456::1', '198.51.100.1'), '198.51.100.1', 'a private IPv6 network');
assert.equal(clientAddress('2001:db8::1', '198.51.100.1'), '2001:db8::1', 'a public IPv6 address: not believed');
assert.equal(clientAddress('', undefined), 'unknown');

// ---- the first wrong passwords, then the picture -------------------------------------------------------------------
const A = '203.0.113.7';
assert.deepEqual(auth.picture(A), { needed: false }, 'no picture before any wrong password');
let r = await signIn(A, 'wrong 1');
assert.deepEqual([r.status, r.error, r.extra.captcha], [401, 'Wrong password', undefined]);
r = await signIn(A, 'wrong 2');
assert.equal(r.extra.captcha, undefined, 'two wrong passwords: still no picture');
r = await signIn(A, 'wrong 3');
assert.deepEqual([r.status, r.error, r.extra.captcha, r.extra.left], [401, 'Wrong password', true, 7], 'the third brings the picture');

r = await signIn(A, PW);
assert.deepEqual([r.status, r.extra.captcha], [401, true]);
assert.match(r.error, /^Type the characters in the picture/, 'even the right password needs the picture now');
let p = newPicture(A);
assert.equal(p.left, 7, 'leaving the picture out cost no try');
assert.match(p.image, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
let answer = answerOf(A, p.id);
r = await signIn(A, PW, { id: p.id, answer: 'nope' });
assert.match(r.error, /^The characters did not match the picture/);
r = await signIn(A, PW, { id: p.id, answer });
assert.match(r.error, /^That picture has expired/, 'a picture is good for one try');
r = await signIn(A, PW, { id: 'made-up', answer });
assert.match(r.error, /^That picture has expired/);
p = newPicture(A);
assert.equal(p.left, 7, 'misreading cost no try');

r = await signIn(A, 'wrong 4', { id: p.id, answer: answerOf(A, p.id).toLowerCase() });
assert.deepEqual([r.status, r.error, r.extra.captcha, r.extra.left], [401, 'Wrong password', true, 6], 'read right in lower case; the password counted');

p = newPicture(A);
answer = answerOf(A, p.id);
now += SIGN_IN_LIMITS.pictureMs + 1000;
r = await signIn(A, PW, { id: p.id, answer });
assert.match(r.error, /^That picture has expired/, 'a picture lasts ten minutes');

p = newPicture(A);
r = await signIn(A, PW, { id: p.id, answer: ` ${[...answerOf(A, p.id)].join(' ')} ` });
assert.equal(r.status, 200, 'the right password with the picture read right (spaces ignored)');
assert.deepEqual(auth.picture(A), { needed: false }, 'a right password starts its address afresh');

// ---- an hour without sign-ins after ten ------------------------------------------------------------------------------
const B = '198.51.100.20';
for (let i = 1; i <= 3; i++) await signIn(B, `wrong ${i}`);
for (let i = 4; i <= 9; i++) {
  p = newPicture(B);
  r = await signIn(B, `wrong ${i}`, { id: p.id, answer: answerOf(B, p.id) });
  assert.deepEqual([r.status, r.extra.left], [401, 10 - i]);
}
p = newPicture(B);
assert.equal(p.left, 1);
r = await signIn(B, 'wrong 10', { id: p.id, answer: answerOf(B, p.id) });
assert.deepEqual([r.status, r.error], [429, 'Too many failed sign-ins from this address. Try again in 60 minutes.'], 'the tenth stops it');
r = await signIn(B, PW);
assert.deepEqual([r.status, r.error], [429, 'Too many failed sign-ins from this address. Try again in 60 minutes.'], 'not even the right password, meanwhile');
assert.throws(() => auth.picture(B), refused(429, /Try again in 60 minutes/), 'the page says so before anyone types');
assert.equal(auth.picture('198.51.100.21').needed, true, 'many wrong passwords from anywhere: everyone gets the picture');
assert.equal((auth.picture('198.51.100.22') as Pic).left, 10, 'with its own ten tries');

auth = new AuthManager(db);
assert.throws(() => auth.picture(B), refused(429, /in 60 minutes/), 'a restart lifts no pause');
now += 30 * 60_000;
r = await signIn(B, PW);
assert.equal(r.error, 'Too many failed sign-ins from this address. Try again in 30 minutes.');
now += 29 * 60_000 + 30_000;
assert.throws(() => auth.picture(B), refused(429, /in 1 minute\.$/));
now += 30_000;
assert.deepEqual(auth.picture(B), { needed: false }, 'after the hour, a fresh start');
r = await signIn(B, PW);
assert.equal(r.status, 200);

// ---- set-password lifts every pause ------------------------------------------------------------------------------
for (let i = 0; i < 10; i++) auth.beginTry(B, null, false);
assert.throws(() => auth.picture(B), refused(429, /in 60 minutes/), 'the first-password setup counts its tries too');
auth.clearTries();
assert.deepEqual(auth.picture(B), { needed: false }, 'cleared by set-password');

// ---- tries sent all at once ----------------------------------------------------------------------------------------
const D = '192.0.2.50';
const at: number[] = [];
for (let i = 0; i < 10; i++) at.push(auth.beginTry(D, null, false));
assert.throws(() => auth.beginTry(D, null, false), refused(429, /from this address/), 'the eleventh, before any password is checked');
auth.rightTry(D, at[9]);
assert.deepEqual(auth.picture(D), { needed: false }, 'the tenth was right: no pause');
auth.clearTries();
const E = '192.0.2.60';
for (let i = 0; i < 3; i++) auth.beginTry(E, null);
assert.throws(() => auth.beginTry(E, null), refused(401, /^Type the characters/), 'the fourth at once owes the picture');

// ---- everyone's stop -------------------------------------------------------------------------------------------------
auth.clearTries();
for (let i = 0; i < SIGN_IN_LIMITS.allStop; i++) auth.beginTry(`10.0.${Math.floor(i / 9)}.1`, null, false);
assert.throws(() => auth.picture('10.9.9.9'), refused(429, /^Too many failed sign-ins\. Try again later\.$/), 'sixty in an hour stop every sign-in');
r = await signIn('10.9.9.9', PW);
assert.equal(r.status, 429);
now += SIGN_IN_LIMITS.hour;
assert.deepEqual(auth.picture('10.9.9.9'), { needed: false });

// ---- at most thirty pictures an hour -----------------------------------------------------------------------------
const F = '192.0.2.70';
for (let i = 0; i < 3; i++) auth.beginTry(F, null, false);
for (let i = 0; i < SIGN_IN_LIMITS.pictures; i++) newPicture(F);
assert.throws(() => auth.picture(F), refused(429, /^Too many new pictures from this address\. Try again in 60 minutes\.$/));
assert.equal((auth as any).pictures.get(F).open.length, 3, 'only the last three stay open');

// ---- reading what was typed ----------------------------------------------------------------------------------------
assert.equal(captchaText(' ab-c d '), 'ABCD');
assert.equal(captchaText('gzu'), '62V', 'look-alikes typed for the characters used');
assert.ok(sameCaptcha('k6m2v', 'K6M2V'));
assert.ok(sameCaptcha('KGMZU', 'K6M2V'));
assert.ok(!sameCaptcha('K6M2', 'K6M2V'));
assert.ok(!sameCaptcha(undefined, 'K6M2V'));
assert.ok(!/[0158BDGILOQSUZ]/.test(CAPTCHA_CHARS), 'no look-alikes in the pictures');

// ---- the PNG ---------------------------------------------------------------------------------------------------------
const { text, png } = drawCaptcha();
assert.match(text, new RegExp(`^[${CAPTCHA_CHARS}]{5}$`));
assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const chunks: { type: string; data: Buffer }[] = [];
for (let i = 8; i < png.length; ) {
  const len = png.readUInt32BE(i);
  const type = png.toString('latin1', i + 4, i + 8);
  assert.equal(zlib.crc32(png.subarray(i + 4, i + 8 + len)) >>> 0, png.readUInt32BE(i + 8 + len), `${type}'s checksum`);
  chunks.push({ type, data: png.subarray(i + 8, i + 8 + len) });
  i += 12 + len;
}
assert.deepEqual(chunks.map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
const { width: W, height: H } = CAPTCHA_SIZE;
assert.deepEqual([chunks[0].data.readUInt32BE(0), chunks[0].data.readUInt32BE(4), chunks[0].data[8], chunks[0].data[9]], [W, H, 8, 4], 'grey and alpha, 8 bits');
const raw = zlib.inflateSync(chunks[1].data);
assert.equal(raw.length, H * (1 + W * 2));
let inked = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (raw[y * (1 + W * 2) + 2 + x * 2] > 128) inked++;
assert.ok(inked > W * H * 0.04 && inked < W * H * 0.3, `ink on ${((100 * inked) / (W * H)).toFixed(1)}% of the picture`);
assert.notEqual(drawCaptcha(text).png.toString('base64'), png.toString('base64'), 'the same characters never draw the same twice');

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('auth tests passed');
