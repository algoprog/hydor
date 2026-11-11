import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { start } from './helpers.mjs';

let app;
before(async () => {
  app = await start();
});
after(() => app.close());

test('sign up, log in and read the profile', async () => {
  const made = await app.api('POST', '/signup', { json: { name: 'alice', password: 'correct horse', email: 'alice@example.com' } });
  assert.equal(made.status, 201);
  assert.equal(made.json.name, 'alice');
  const login = await app.login('alice', 'correct horse');
  assert.equal(login.status, 200);
  const me = await app.api('GET', '/me', { token: login.json.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.name, 'alice');
  assert.equal(me.json.role, 'user');
  assert.equal(me.json.email, 'alice@example.com');
});

test('a wrong password, a taken name and a bad address are refused', async () => {
  assert.equal((await app.login('alice', 'wrong password')).status, 401);
  const again = await app.api('POST', '/signup', { json: { name: 'alice', password: 'another one', email: 'a2@example.com' } });
  assert.equal(again.status, 409);
  const bad = await app.api('POST', '/signup', { json: { name: 'bob', password: 'another one', email: 'not an address' } });
  assert.equal(bad.status, 400);
});

test('no token, or a made-up one, is a 401', async () => {
  assert.equal((await app.api('GET', '/me')).status, 401);
  assert.equal((await app.api('GET', '/me', { token: 'abc.def' })).status, 401);
});

test('the display name and the address can be changed', async () => {
  const token = await app.account('carol');
  const r = await app.api('PATCH', '/me', { token, json: { displayName: 'Carol D.', email: 'carol.d@example.org' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.displayName, 'Carol D.');
  assert.equal((await app.api('GET', '/me', { token })).json.email, 'carol.d@example.org');
  assert.equal((await app.api('PATCH', '/me', { token, json: { email: 'nope' } })).status, 400);
});

test('changing the password gives a new session and the new password works', async () => {
  const token = await app.account('dave', 'first password');
  const r = await app.api('POST', '/me/password', { token, json: { current: 'first password', password: 'second password' } });
  assert.equal(r.status, 200);
  assert.equal((await app.api('GET', '/me', { token: r.json.token })).status, 200);
  assert.equal((await app.login('dave', 'second password')).status, 200);
  assert.equal((await app.login('dave', 'first password')).status, 401);
  assert.equal((await app.api('POST', '/me/password', { token: r.json.token, json: { current: 'oops', password: 'third password' } })).status, 401);
});

test('settings are merged key by key', async () => {
  const token = await app.account('erin');
  await app.api('PUT', '/me/settings', { token, json: { theme: { dark: true } } });
  const r = await app.api('PUT', '/me/settings', { token, json: { theme: { size: 2 }, lang: 'en' } });
  assert.deepEqual(r.json, { theme: { dark: true, size: 2 }, lang: 'en' });
  assert.deepEqual((await app.api('GET', '/me/settings', { token })).json, r.json);
});

test('a reset code in the outbox lets the owner choose a new password, once', async () => {
  await app.account('frank', 'old password');
  assert.equal((await app.api('POST', '/reset', { json: { name: 'frank' } })).status, 202);
  assert.equal((await app.api('POST', '/reset', { json: { name: 'nobody-here' } })).status, 202);
  const mails = (await import('node:fs')).readFileSync(`${app.dataDir}/outbox.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const { code } = mails.filter((m) => m.name === 'frank').at(-1);
  assert.equal((await app.api('POST', '/reset/confirm', { json: { name: 'frank', code: 'wrong', password: 'new password 1' } })).status, 400);
  assert.equal((await app.api('POST', '/reset/confirm', { json: { name: 'frank', code, password: 'new password 1' } })).status, 204);
  assert.equal((await app.login('frank', 'new password 1')).status, 200);
  assert.equal((await app.api('POST', '/reset/confirm', { json: { name: 'frank', code, password: 'new password 2' } })).status, 400);
});
