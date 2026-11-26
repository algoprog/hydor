// npm test: starts the real app on a spare port with an empty data folder and uses it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.TEST_PORT || 4990);
const base = `http://127.0.0.1:${port}`;
const folder = mkdtempSync(join(tmpdir(), 'kestrel-test-'));
let server;

async function start() {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: String(port), DATA_DIR: folder, APP_URL: base, NODE_ENV: 'production', TZ: 'Europe/London' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try { await fetch(base); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('The app did not start.');
}

async function stop() {
  const gone = new Promise((r) => server.once('exit', r));
  server.kill('SIGTERM');
  assert.equal(await gone, 0);
}

before(start);
after(async () => {
  await stop();
  rmSync(folder, { recursive: true, force: true });
});

function person() {
  let cookie = '';
  const call = async (method, path, body, { form = false, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: { cookie, ...(body && { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' }), ...headers },
      body: body && (form ? new URLSearchParams(body).toString() : JSON.stringify(body)),
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await response.text();
    const json = response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null;
    return { status: response.status, json, text, location: response.headers.get('location') };
  };
  return call;
}

async function member(name) {
  const call = person();
  const made = await call('POST', '/api/sign-up', { name, email: `${name}@example.com`, password: 'secret12345' });
  assert.equal(made.status, 201);
  return call;
}

const tokenOf = (link) => link.split('/').pop();
async function join_(lead, crew, who, name, role) {
  const invited = await lead('POST', '/api/invitations', { crew, email: `${name}@example.com`, role });
  assert.equal(invited.status, 201);
  assert.ok(invited.json.link.startsWith(`${base}/invite/`));
  const accepted = await who('POST', `/api/invitations/${tokenOf(invited.json.link)}/accept`);
  assert.equal(accepted.status, 200);
  return tokenOf(invited.json.link);
}

let ann, bob, cat, north, south, customer;

test('crews see only their own rows', async () => {
  [ann, bob] = [await member('ann'), await member('bob')];
  north = (await ann('POST', '/api/crews', { name: 'North' })).json.id;
  south = (await bob('POST', '/api/crews', { name: 'South' })).json.id;
  customer = (await ann('POST', '/api/customers', { crew: north, name: 'Mrs <Reid>', address: '1 Tay Street\nPerth' })).json;
  const job = (await ann('POST', '/api/jobs', { crew: north, title: 'Hedge', day: '2027-03-01' })).json;
  const note = (await ann('POST', '/api/notes', { crew: north, title: 'Gate code', note: '4411' })).json;
  assert.equal(job.done, false);

  const visitor = person();
  for (const [kind, id] of [['customers', customer.id], ['jobs', job.id], ['notes', note.id]]) {
    for (const [who, expected] of [[bob, 404], [visitor, 401]]) {
      assert.equal((await who('GET', `/api/${kind}/${id}`)).status, expected);
      assert.equal((await who('PATCH', `/api/${kind}/${id}`, { title: 'x', name: 'x' })).status, expected);
      assert.equal((await who('DELETE', `/api/${kind}/${id}`)).status, expected);
    }
    assert.deepEqual((await bob('GET', `/api/${kind}`)).json.rows, []);
    assert.equal((await bob('GET', `/api/${kind}?crew=${north}`)).status, 404);
    assert.equal((await visitor('GET', `/api/${kind}`)).status, 401);
    assert.equal((await bob('GET', `/${kind}/${id}`)).status, 404);
    assert.equal((await bob('POST', `/${kind}/${id}`, { title: 'x', name: 'x' }, { form: true })).status, 404);
    assert.equal((await visitor('GET', `/${kind}/${id}`)).location, '/sign-in');
  }
  assert.equal((await bob('POST', '/api/customers', { crew: north, name: 'Sneaky' })).status, 403);
  assert.equal((await bob('PATCH', `/api/customers/${customer.id + 999}`, { name: 'x' })).status, 404);
  assert.equal((await bob('GET', `/crews/${north}`)).status, 404);
  assert.equal((await bob('GET', `/api/crews/${north}/members`)).status, 404);
  const page = (await ann('GET', '/customers')).text;
  assert.ok(page.includes('Mrs &lt;Reid&gt;') && !page.includes('<Reid>'));
  assert.ok(!(await bob('GET', '/customers')).text.includes('Reid'));
});

test('what is needed cannot be left out, and nonsense is refused', async () => {
  for (const [kind, body] of [
    ['customers', {}], ['customers', { name: '   ' }], ['customers', { name: 5 }],
    ['jobs', { title: 'x' }], ['jobs', { day: '2027-01-01' }], ['jobs', { title: 'x', day: '2027-02-30' }],
    ['jobs', { title: 'x', day: '2027-01-01', done: 'maybe' }], ['notes', { note: 'no title' }],
  ]) {
    const answer = await ann('POST', `/api/${kind}`, { crew: north, ...body });
    assert.equal(answer.status, 400, JSON.stringify([kind, body]));
    assert.ok(answer.json.error);
  }
  assert.equal((await ann('POST', '/api/customers', { name: 'No crew' })).status, 400);
  assert.equal((await ann('POST', '/api/crews', { name: '' })).status, 400);
  assert.equal((await ann('PATCH', `/api/customers/${customer.id}`, { crew: south })).status, 400);
  assert.equal((await ann('PATCH', `/api/customers/${customer.id}`, { name: '' })).status, 400);
  assert.equal((await person()('POST', '/api/sign-in', { email: 'ann@example.com', password: 'wrong-password1' })).status, 401);
});

test('invitations: one use, only for the invited email, and members cannot manage people', async () => {
  cat = await member('cat');
  const invited = await ann('POST', '/api/invitations', { crew: north, email: 'CAT@example.com', role: 'member' });
  const token = tokenOf(invited.json.link);
  assert.equal((await bob('POST', `/api/invitations/${token}/accept`)).status, 403);
  assert.equal((await person()('POST', `/api/invitations/${token}/accept`)).status, 401);
  const seen = (await person()('GET', `/invite/${token}`)).text;
  assert.ok(!seen.includes('North') && !seen.includes('cat@'));
  assert.ok((await cat('GET', `/invite/${token}`)).text.includes('Join North'));
  assert.equal((await cat('POST', `/invite/${token}`, {}, { form: true })).status, 303);
  assert.equal((await cat('POST', `/api/invitations/${token}/accept`)).status, 410);

  assert.equal((await cat('GET', `/api/customers/${customer.id}`)).status, 200);
  assert.equal((await cat('PATCH', `/api/customers/${customer.id}`, { name: 'Mrs Reid' })).status, 200);
  assert.equal((await cat('DELETE', `/api/customers/${customer.id}`)).status, 403);
  assert.equal((await cat('POST', '/api/invitations', { crew: north, email: 'x@example.com', role: 'lead' })).status, 403);
  assert.equal((await cat('POST', '/api/crews/remove', { crew: north, email: 'ann@example.com' })).status, 403);
  assert.equal((await cat('PATCH', `/api/crews/${north}`, { name: 'Mine' })).status, 403);
  assert.deepEqual((await cat('GET', '/api/invitations')).json.rows, []);
});

test('two crews, then removal takes effect on the next request', async () => {
  await join_(bob, south, cat, 'cat', 'lead');
  await cat('POST', '/api/customers', { crew: south, name: 'South customer' });
  assert.equal((await cat('GET', '/api/customers')).json.rows.length, 2);

  // A link a person made, or one waiting for them, dies with their removal.
  const planted = (await cat('POST', '/api/invitations', { crew: south, email: 'dan@example.com', role: 'lead' })).json;
  assert.equal((await bob('POST', '/api/crews/remove', { crew: south, email: 'cat@example.com' })).status, 200);
  assert.equal((await cat('GET', '/api/customers')).json.rows.length, 1);
  assert.equal((await cat('POST', '/api/customers', { crew: south, name: 'After' })).status, 403);
  assert.equal((await cat('GET', `/crews/${south}`)).status, 404);
  const dan = await member('dan');
  assert.equal((await dan('POST', `/api/invitations/${tokenOf(planted.link)}/accept`)).status, 404);

  assert.equal((await ann('POST', '/api/crews/remove', { crew: north, email: 'ann@example.com' })).status, 409);
  assert.equal((await ann('POST', '/api/crews/remove', { crew: north, email: 'cat@example.com' })).status, 200);
  assert.deepEqual((await cat('GET', '/api/customers')).json.rows, []);
});

test('requests from another website are refused', async () => {
  const answer = await ann('POST', '/api/crews', { name: 'Evil' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(answer.status, 403);
});

test('what was kept is still there after a restart, and the sign-in too', async () => {
  await stop();
  await start();
  assert.equal((await ann('GET', '/api/customers')).json.rows[0].name, 'Mrs Reid');
  const home = (await ann('GET', '/home')).text;
  assert.match(home, /<strong>1<\/strong> <span>Customers<\/span>/);
  assert.match(home, /<strong>1<\/strong> <span>Jobs to do<\/span>/);
});
