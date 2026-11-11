import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { start } from './helpers.mjs';

let app;
before(async () => {
  app = await start();
});
after(() => app.close());

test('an admin sees the accounts and the totals, a user does not', async () => {
  const admin = await app.adminToken();
  const gina = await app.account('gina');
  await app.api('POST', '/files?name=a.txt', { token: gina, body: '12345' });
  const users = await app.api('GET', '/admin/users', { token: admin });
  assert.deepEqual(users.json.map((u) => u.name).sort(), ['admin', 'gina']);
  assert.deepEqual((await app.api('GET', '/admin/stats', { token: admin })).json, { users: 2, files: 1, bytes: 5 });
  assert.equal((await app.api('GET', '/admin/stats', { token: gina })).status, 403);
  assert.equal((await app.api('GET', '/admin/stats')).status, 401);
});

test('an admin can make another account an admin and remove accounts', async () => {
  const admin = await app.adminToken();
  const hugo = await app.account('hugo');
  const ida = await app.account('ida');
  const hugoId = (await app.api('GET', '/me', { token: hugo })).json.id;
  const idaId = (await app.api('GET', '/me', { token: ida })).json.id;
  assert.equal((await app.api('POST', `/admin/users/${hugoId}/role`, { token: admin, json: { role: 'admin' } })).status, 200);
  assert.equal((await app.api('GET', '/admin/stats', { token: hugo })).status, 200);
  assert.equal((await app.api('DELETE', `/admin/users/${idaId}`, { token: hugo })).status, 204);
  assert.equal((await app.login('ida', 'a-long-password')).status, 401);
  assert.equal((await app.api('DELETE', `/admin/users/${hugoId}`, { token: hugo })).status, 400);
  assert.equal((await app.api('DELETE', `/admin/users/${hugoId}`, { token: ida })).status, 401);
});
