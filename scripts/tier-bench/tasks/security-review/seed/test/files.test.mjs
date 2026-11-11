import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { start } from './helpers.mjs';

let app;
before(async () => {
  app = await start();
});
after(() => app.close());

const upload = (token, name, text) => app.api('POST', `/files?name=${encodeURIComponent(name)}`, { token, body: text });

test('upload, list, download and delete', async () => {
  const token = await app.account('alice');
  const made = await upload(token, 'notes.txt', 'hello there');
  assert.equal(made.status, 201);
  assert.equal(made.json.size, 11);
  await upload(token, 'a first file.txt', 'x');
  const list = await app.api('GET', '/files', { token });
  assert.deepEqual(list.json.map((f) => f.name), ['a first file.txt', 'notes.txt']);
  const got = await app.api('GET', '/files/notes.txt', { token });
  assert.equal(got.status, 200);
  assert.equal(got.text, 'hello there');
  assert.equal((await app.api('GET', `/files/by-id/${made.json.id}`, { token })).text, 'hello there');
  assert.equal((await app.api('DELETE', '/files/notes.txt', { token })).status, 204);
  assert.equal((await app.api('GET', '/files/notes.txt', { token })).status, 404);
  assert.equal((await app.api('DELETE', '/files/notes.txt', { token })).status, 404);
});

test('names with spaces and non-English letters', async () => {
  const token = await app.account('bob');
  assert.equal((await upload(token, 'Årsrapport 2024 (final).txt', 'tal')).status, 201);
  assert.equal((await app.api('GET', `/files/${encodeURIComponent('Årsrapport 2024 (final).txt')}`, { token })).text, 'tal');
});

test('an upload with the same name replaces the file and keeps its id', async () => {
  const token = await app.account('carol');
  const first = await upload(token, 'a.txt', 'one');
  const second = await upload(token, 'a.txt', 'three');
  assert.equal(second.json.id, first.json.id);
  assert.equal((await app.api('GET', '/files/a.txt', { token })).text, 'three');
  assert.equal((await app.api('GET', '/files', { token })).json.length, 1);
});

test("one person cannot see another's files", async () => {
  const dave = await app.account('dave');
  const erin = await app.account('erin');
  await upload(dave, 'private.txt', 'dave only');
  assert.equal((await app.api('GET', '/files/private.txt', { token: erin })).status, 404);
  assert.deepEqual((await app.api('GET', '/files', { token: erin })).json, []);
  assert.equal((await app.api('GET', '/files')).status, 401);
});

test('a share link works without logging in and goes with the file', async () => {
  const token = await app.account('frank');
  await upload(token, 'Tom & Jerry.txt', 'cartoon');
  const link = await app.api('POST', `/files/${encodeURIComponent('Tom & Jerry.txt')}/share`, { token });
  assert.equal(link.status, 201);
  assert.equal(link.json.url, `/s/${link.json.token}`);
  const page = await app.api('GET', link.json.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.ok(page.text.includes('Jerry.txt'));
  const file = await app.api('GET', `${link.json.url}/download`);
  assert.equal(file.text, 'cartoon');
  await app.api('DELETE', `/files/${encodeURIComponent('Tom & Jerry.txt')}`, { token });
  assert.equal((await app.api('GET', link.json.url)).status, 404);
});
