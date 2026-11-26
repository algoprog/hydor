// Starts the real app on an empty folder and uses it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TEST_PORT) || 4950;
const BASE = `http://127.0.0.1:${PORT}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'foodbank-test-'));
let server;

async function start() {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: data, ALLOW_SIGN_UP: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('exit', () => reject(new Error('the app did not start')));
  });
}
const stop = () => new Promise((resolve) => (server.once('exit', resolve), server.kill('SIGTERM')));

before(start);
after(async () => {
  await stop();
  fs.rmSync(data, { recursive: true, force: true });
});

function person() {
  let cookie = '';
  const call = async (method, url, { json, form, body, headers = {} } = {}) => {
    const res = await fetch(BASE + url, {
      method,
      redirect: 'manual',
      headers: { cookie, ...(json ? { 'content-type': 'application/json' } : {}), ...headers },
      body: json ? JSON.stringify(json) : form ? new URLSearchParams(form) : body,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    const isJson = res.headers.get('content-type')?.includes('json');
    return { status: res.status, location: res.headers.get('location'), text, json: isJson ? JSON.parse(text) : null };
  };
  return call;
}

const boss = person();
const volunteer = person();
const visitor = person();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const beans = { name: 'Baked beans', category: 'tinned', quantity: 4, bestBefore: '2027-05-01', notes: 'Top shelf\nleft side' };
let beansId;

test('only people with the team code can join', async () => {
  const first = await boss('POST', '/api/sign-up', { json: { name: 'Cora', email: 'cora@example.org', password: 'longpassword1' } });
  assert.equal(first.status, 201);
  assert.equal(first.json.role, 'coordinator');
  const sam = { name: 'Sam', email: 'sam@example.org', password: 'longpassword2' };
  assert.equal((await volunteer('POST', '/api/sign-up', { json: sam })).status, 403);
  const code = (await boss('GET', '/team')).text.match(/class="code">([A-Z0-9]{8})</)[1];
  assert.equal((await volunteer('POST', '/sign-up', { form: { ...sam, code } })).status, 303);
  assert.ok(!(await volunteer('GET', '/team')).text.includes(code));
  assert.equal((await visitor('POST', '/api/sign-in', { json: { email: sam.email, password: 'wrongpassword' } })).status, 401);
});

test('a visitor sees nothing', async () => {
  for (const url of ['/', '/stock', '/deliveries', '/team', '/photos/x.jpg']) {
    assert.equal((await visitor('GET', url)).location, '/sign-in', url);
  }
  for (const url of ['/api/stock', '/api/deliveries', '/api/stock/1', '/api/summary', '/api/team']) {
    assert.equal((await visitor('GET', url)).status, 401, url);
  }
  assert.equal((await visitor('POST', '/api/stock', { json: beans })).status, 401);
});

test('stock is kept, shared and checked', async () => {
  const made = await boss('POST', '/api/stock', { json: beans });
  assert.equal(made.status, 201);
  beansId = made.json.id;
  const seen = (await volunteer('GET', `/api/stock/${beansId}`)).json;
  for (const [key, value] of Object.entries(beans)) assert.equal(seen[key], value, key);
  for (const bad of [{ name: ' ' }, { category: 'frozen' }, { quantity: 2.5 }, { quantity: -1 }, { quantity: null }, { bestBefore: '2027-02-30' }]) {
    const res = await boss('POST', '/api/stock', { json: { ...beans, ...bad } });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.ok(res.json.error);
  }
  const changed = await volunteer('PATCH', `/api/stock/${beansId}`, { json: { quantity: 9, bestBefore: null } });
  assert.equal(changed.json.quantity, 9);
  assert.equal(changed.json.bestBefore, null);
  assert.equal(changed.json.name, beans.name);
  await volunteer('POST', `/stock/${beansId}/adjust`, { form: { by: '1', back: '/stock' } });
  assert.equal((await boss('GET', `/api/stock/${beansId}`)).json.quantity, 10);
});

test('deliveries and the three numbers', async () => {
  const delivery = { stockId: beansId, from: 'Corner Shop', arrived: today, kilos: 30, putAway: false };
  const a = await boss('POST', '/api/deliveries', { json: delivery });
  assert.equal(a.status, 201);
  await boss('POST', '/api/deliveries', { json: { ...delivery, kilos: 12, arrived: '2020-01-15', putAway: true } });
  for (const bad of [{ stockId: 999 }, { from: '' }, { arrived: '' }, { kilos: 1.5 }, { kilos: -3 }, { putAway: 'perhaps' }]) {
    assert.equal((await boss('POST', '/api/deliveries', { json: { ...delivery, ...bad } })).status, 400, JSON.stringify(bad));
  }
  await boss('POST', '/api/stock', { json: { name: 'Nappies', category: 'baby & household', quantity: 0 } });
  assert.deepEqual((await boss('GET', '/api/summary')).json, { month: today.slice(0, 7), runningLow: 1, kilosThisMonth: 30, notPutAway: 1 });
  const home = (await volunteer('GET', '/')).text;
  assert.match(home, /<strong>1<\/strong> <span>thing running low/);
  assert.match(home, /<strong>30<\/strong> <span>kilos taken in this month/);
  assert.match(home, /<strong>1<\/strong> <span>delivery not put away/);
  await volunteer('POST', `/deliveries/${a.json.id}/put-away`, { form: { back: '/' } });
  assert.equal((await boss('GET', '/api/summary')).json.notPutAway, 0);
});

test('forms: photo, escaping, clashes and removing', async () => {
  const send = (fields, file) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.append(k, v);
    if (file) body.append('photo', new Blob([file]), 'a.png');
    return { body };
  };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const rice = { name: '<b>Rice</b>', category: 'dry goods', quantity: '20', bestBefore: '', notes: '' };
  assert.equal((await boss('POST', '/stock', send(rice, 'not a picture'))).status, 400);
  assert.equal((await boss('POST', '/stock', send(rice, png))).status, 303);
  const row = (await boss('GET', '/api/stock')).json.rows.find((r) => r.name === rice.name);
  assert.ok(row.photo);
  assert.equal((await boss('GET', row.photo)).status, 200);
  const list = (await boss('GET', '/stock')).text;
  assert.ok(list.includes('&lt;b&gt;Rice') && !list.includes('<b>Rice'));

  const edit = { ...rice, quantity: '15', version: String(row.version) };
  assert.equal((await volunteer('POST', `/stock/${row.id}`, send(edit))).status, 303);
  assert.equal((await boss('POST', `/stock/${row.id}`, send({ ...edit, quantity: '1' }))).status, 409);
  assert.equal((await boss('GET', `/api/stock/${row.id}`)).json.photo, row.photo);

  // Removing an item keeps what has come in.
  assert.equal((await boss('DELETE', `/api/stock/${beansId}`)).status, 200);
  assert.equal((await boss('GET', `/api/stock/${beansId}`)).status, 404);
  const old = (await boss('GET', '/api/deliveries')).json.rows[0];
  assert.equal(old.item, 'Baked beans');
  assert.equal((await boss('PATCH', `/api/deliveries/${old.id}`, { json: { ...old, kilos: 31 } })).status, 200);
});

test('other websites are refused, and removed volunteers are locked out', async () => {
  const res = await boss('POST', '/team/new-code', { headers: { origin: 'https://elsewhere.example' } });
  assert.equal(res.status, 403);
  assert.equal((await volunteer('DELETE', '/api/team/1')).status, 403);
  const sam = (await boss('GET', '/api/team')).json.rows.find((p) => p.name === 'Sam');
  assert.equal((await boss('DELETE', `/api/team/${sam.id}`)).status, 200);
  assert.equal((await volunteer('GET', '/api/stock')).status, 401);
});

test('passwords: the coordinator gives a new one, and people change their own', async () => {
  const code = (await boss('GET', '/team')).text.match(/class="code">([A-Z0-9]{8})</)[1];
  const kim = person();
  const made = await kim('POST', '/api/sign-up', { json: { name: 'Kim', email: 'kim@example.org', password: 'longpassword3', code } });
  const reset = await boss('POST', `/team/${made.json.id}/reset`);
  const given = reset.text.match(/class="code">([A-Z0-9]{10})</)[1];
  assert.equal((await kim('GET', '/api/stock')).status, 401);
  assert.equal((await kim('POST', '/api/sign-in', { json: { email: 'kim@example.org', password: given } })).status, 200);
  const changed = await kim('POST', '/password', { form: { current: given, next: 'mynewpassword' } });
  assert.equal(changed.location, '/sign-in?done=password');
  assert.match((await kim('GET', changed.location)).text, /Password changed/);
  assert.equal((await kim('POST', '/sign-in', { form: { email: 'kim@example.org', password: 'mynewpassword' } })).status, 303);
  assert.equal((await kim('POST', '/sign-out')).status, 303);
  assert.equal((await kim('GET', '/api/stock')).status, 401);
});

test('everything is still there after a restart', async () => {
  const before = (await boss('GET', '/api/deliveries')).json;
  await stop();
  await start();
  assert.deepEqual((await boss('GET', '/api/deliveries')).json, before);
});
