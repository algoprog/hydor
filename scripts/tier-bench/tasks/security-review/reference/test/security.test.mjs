// One test for each problem found in the security review (see SECURITY-REVIEW.md).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { isEmail } from '../src/util.mjs';
import { start } from './helpers.mjs';

let app;
before(async () => {
  app = await start();
});
after(() => app.close());

const upload = (token, name, body) => app.api('POST', `/files?name=${encodeURIComponent(name)}`, { token, body });
const forged = (payload, sig = '') => `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;

test('1 a file outside the account folder cannot be downloaded with ../ in the name', async () => {
  const token = await app.account('trav1');
  fs.writeFileSync(path.join(app.dataDir, 'outside.txt'), 'outside');
  const r = await app.api('GET', '/files/..%2f..%2foutside.txt', { token });
  assert.notEqual(r.text, 'outside');
  assert.equal(r.status, 404);
  const key = await app.api('GET', '/files/..%2f..%2fsecret.key', { token });
  assert.equal(key.status, 404);
});

test("1 nor another account's folder whose name begins with this account's name", async () => {
  const short = await app.account('trav2');
  const long = await app.account('trav2x');
  await upload(long, 'private.txt', 'private');
  const r = await app.api('GET', '/files/..%2ftrav2x%2fprivate.txt', { token: short });
  assert.equal(r.status, 404);
});

test('2 an upload cannot be named to land outside the account folder', async () => {
  const token = await app.account('upl1');
  for (const name of ['../../planted.txt', '../upl1x/planted.txt', '/tmp/planted.txt', '..', 'a\\b']) {
    const r = await upload(token, name, 'planted');
    assert.equal(r.status, 400, name);
  }
  assert.ok(!fs.existsSync(path.join(app.dataDir, 'planted.txt')));
  assert.deepEqual((await app.api('GET', '/files', { token })).json, []);
  assert.equal((await upload(token, 'fine name.txt', 'ok')).status, 201);
});

test('3 a file cannot be downloaded by id by someone else', async () => {
  const a = await app.account('idor1');
  const b = await app.account('idor2');
  const made = await upload(a, 'mine.txt', 'mine');
  assert.equal((await app.api('GET', `/files/by-id/${made.json.id}`, { token: b })).status, 404);
  assert.equal((await app.api('GET', `/files/by-id/${made.json.id}`)).status, 401);
  assert.equal((await app.api('GET', `/files/by-id/${made.json.id}`, { token: a })).text, 'mine');
});

test('4 PATCH /me changes only the display name and the address', async () => {
  const token = await app.account('mass1');
  const before = (await app.api('GET', '/me', { token })).json;
  await app.api('PATCH', '/me', { token, json: { role: 'admin', name: 'admin', id: 'x', displayName: 'Mass' } });
  await app.api('PATCH', '/me', { token, body: '{"__proto__":{"role":"admin"}}', headers: { 'content-type': 'application/json' } });
  const after = (await app.api('GET', '/me', { token })).json;
  assert.deepEqual({ ...after, displayName: before.displayName }, before);
  assert.equal((await app.api('GET', '/admin/stats', { token })).status, 403);
});

test('5 settings cannot reach the prototype of objects', async () => {
  const a = await app.account('pollute1');
  const b = await app.account('pollute2');
  for (const body of ['{"__proto__":{"role":"admin"}}', '{"constructor":{"prototype":{"role":"admin"}}}', '{"x":{"__proto__":{"role":"admin"}}}']) {
    await app.api('PUT', '/me/settings', { token: a, body, headers: { 'content-type': 'application/json' } });
    assert.equal(({}).role, undefined, body);
    assert.equal((await app.api('GET', '/admin/stats', { token: b })).status, 403, body);
  }
  const r = await app.api('PUT', '/me/settings', { token: a, json: { theme: { dark: true } } });
  assert.deepEqual(r.json.theme, { dark: true });
});

test('6 a token without a valid signature is refused', async () => {
  for (const token of [forged({ user: 'admin' }), forged({ user: 'admin' }, 'A'), Buffer.from('{"user":"admin"}').toString('base64url')]) {
    assert.equal((await app.api('GET', '/admin/stats', { token })).status, 401, token);
  }
  const real = await app.account('tok1');
  const sig = real.slice(real.lastIndexOf('.') + 1);
  assert.equal((await app.api('GET', '/me', { token: forged({ user: 'admin', sid: 'x' }, sig) })).status, 401);
  assert.equal((await app.api('GET', '/me', { token: real })).status, 200);
});

test('7 a reset code is random, and not in the answer', async () => {
  await app.account('reset1');
  const r = await app.api('POST', '/reset', { json: { name: 'reset1' } });
  assert.equal(r.text, '');
  const lines = fs.readFileSync(`${app.dataDir}/outbox.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const { code } = lines.filter((m) => m.name === 'reset1').at(-1);
  assert.ok(code.length >= 30);
  const second = Math.floor(Date.now() / 1000);
  for (let s = second - 3; s <= second + 1; s++) {
    const guess = crypto.createHash('sha256').update(`reset1:${s}`).digest('hex').slice(0, 32);
    assert.notEqual(guess, code);
  }
  const stored = JSON.parse(fs.readFileSync(`${app.dataDir}/db.json`, 'utf8')).users.find((u) => u.name === 'reset1');
  assert.ok(!JSON.stringify(stored.reset).includes(code), 'the code is kept as it is');
});

test('8 the address check does not backtrack, and still accepts what README.md says', async () => {
  const started = process.hrtime.bigint();
  for (const bad of ['a'.repeat(40) + '!', 'a-'.repeat(5000) + '!', `${'a.'.repeat(30000)}!`, `x@${'a'.repeat(30000)}!`]) assert.equal(isEmail(bad), false);
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 500);
  for (const good of ['alice@example.com', 'bob.smith@mail.example.co.uk', 'carol_d-1@example.org']) assert.equal(isEmail(good), true, good);
  for (const bad of ['plain', 'a@b', '@example.com', 'two@@example.com', 'sp ace@example.com', 'a@example.c', 'a@.com', 'a@example..com']) assert.equal(isEmail(bad), false, bad);
});

test('9 a file name is escaped on the share page', async () => {
  const token = await app.account('xss1');
  const name = '<img src=x onerror=alert(1)>.txt';
  await upload(token, name, 'x');
  const link = await app.api('POST', `/files/${encodeURIComponent(name)}/share`, { token });
  const page = await app.api('GET', link.json.url);
  assert.ok(!page.text.includes('<img'));
  assert.ok(page.text.includes('&lt;img src=x onerror=alert(1)&gt;.txt'));
});

test('10 a share link stops working after seven days', async (t) => {
  const token = await app.account('exp1');
  await upload(token, 'e.txt', 'expires');
  const link = (await app.api('POST', '/files/e.txt/share', { token })).json;
  assert.equal((await app.api('GET', `${link.url}/download`)).status, 200);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 8 * 24 * 60 * 60 * 1000 });
  assert.equal((await app.api('GET', link.url)).status, 404);
  assert.equal((await app.api('GET', `${link.url}/download`)).status, 404);
});

test('11 a plain account cannot list the accounts', async () => {
  const token = await app.account('adm1');
  assert.equal((await app.api('GET', '/admin/users', { token })).status, 403);
  assert.equal((await app.api('GET', '/admin/users')).status, 401);
  assert.equal((await app.api('GET', '/admin/users', { token: await app.adminToken() })).status, 200);
});

test('12 a session ends at log-out, and every session at a password change or reset', async () => {
  const name = 'sess1';
  const first = await app.account(name, 'first password');
  const second = (await app.login(name, 'first password')).json.token;
  const third = (await app.login(name, 'first password')).json.token;
  assert.equal((await app.api('POST', '/logout', { token: first })).status, 204);
  assert.equal((await app.api('GET', '/me', { token: first })).status, 401);
  assert.equal((await app.api('GET', '/me', { token: second })).status, 200);
  const changed = await app.api('POST', '/me/password', { token: second, json: { current: 'first password', password: 'second password' } });
  assert.equal((await app.api('GET', '/me', { token: second })).status, 401);
  assert.equal((await app.api('GET', '/me', { token: third })).status, 401);
  assert.equal((await app.api('GET', '/me', { token: changed.json.token })).status, 200);
  await app.api('POST', '/reset', { json: { name } });
  const lines = fs.readFileSync(`${app.dataDir}/outbox.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const { code } = lines.filter((m) => m.name === name).at(-1);
  await app.api('POST', '/reset/confirm', { json: { name, code, password: 'third password' } });
  assert.equal((await app.api('GET', '/me', { token: changed.json.token })).status, 401);
});

test('13 a file over 10 MB is refused, one of exactly 10 MB is kept', async () => {
  const token = await app.account('limit1');
  const r = await upload(token, 'big.bin', Buffer.alloc(10 * 1024 * 1024 + 1));
  assert.equal(r.status, 413);
  assert.equal((await app.api('GET', '/files/big.bin', { token })).status, 404);
  assert.equal((await upload(token, 'edge.bin', Buffer.alloc(10 * 1024 * 1024))).status, 201);
});
