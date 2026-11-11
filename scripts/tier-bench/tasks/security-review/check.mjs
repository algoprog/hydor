// Hidden checker for security-review. Run: node check.mjs <workdir>
// It starts the agent's service (`node src/server.mjs`, on a port from 18900 up and a data folder of its own) for each
// group of cases, drives it over HTTP and stops it. An attack case passes when the attack does not work: no secret
// content comes back, no privilege is gained, no forged or old session is accepted, no script gets into a page, the
// server still answers after a crafted input, an expired link is refused. What must not happen is judged by its
// effect, never by the status code of the refusal. The regression cases check what README.md promises, so that
// removing a feature does not count as a fix. The service's clock can be moved forward (clock-preload.mjs) to test
// that share links expire.
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const WORK = path.resolve(process.argv[2]);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = path.join(HERE, 'clock-preload.mjs');
const VERBOSE = Boolean(process.env.CHECK_VERBOSE);
const ADMIN_PASSWORD = 'admin-pass-1234';
const PASSWORD = 'correct-horse-1';
const DAY = 24 * 60 * 60 * 1000;
const MB10 = 10 * 1024 * 1024;

// A small seeded PRNG (mulberry32), for the secrets and names.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const next = prng(20261111);
const hex = (n) => Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join('');
const marker = (what) => `SECRET-${what}-${hex(12)}`;
let counter = 0;
const uniq = (prefix) => `${prefix}${++counter}`;

function ok(cond, why) {
  if (!cond) throw new Error(why);
}

// ---------- starting and stopping the service ----------

let nextPort = 18900;

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startApp() {
  let lastLog = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    const port = nextPort++;
    if (!(await portFree(port))) continue;
    const arena = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-secrev-'));
    const dataDir = path.join(arena, 'data');
    fs.mkdirSync(dataDir);
    const clockFile = path.join(arena, 'clock');
    fs.writeFileSync(clockFile, '0');
    const child = spawn(process.execPath, ['--max-old-space-size=2048', '--import', PRELOAD, 'src/server.mjs'], {
      cwd: WORK,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_PASSWORD, CHECK_CLOCK_FILE: clockFile, CUDA_VISIBLE_DEVICES: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    let exited = false;
    child.stdout.on('data', (d) => (log = (log + d).slice(-1500)));
    child.stderr.on('data', (d) => (log = (log + d).slice(-1500)));
    child.on('error', (e) => {
      exited = true;
      log += String(e);
    });
    child.on('exit', () => (exited = true));
    const app = {
      port,
      dataDir,
      arena,
      child,
      setClock: (ms) => fs.writeFileSync(clockFile, String(ms)),
      async stop() {
        if (!exited) {
          child.kill('SIGKILL');
          await new Promise((r) => child.once('exit', r));
        }
        fs.rmSync(arena, { recursive: true, force: true });
      },
    };
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline && !exited) {
      const r = await request(app, 'GET', '/health', { timeout: 1000 });
      if (r.status === 200 && !exited) return app;
      await sleep(60);
    }
    lastLog = log.trim().split('\n').slice(-3).join(' | ');
    await app.stop();
    // A server that stopped by itself on a taken port is tried on the next one; any other stop ends the attempts.
    if (!/EADDRINUSE/.test(log)) break;
  }
  throw new Error(`the service did not start with \`node src/server.mjs\`: ${lastLog.slice(0, 300)}`);
}

// ---------- HTTP ----------

// Sends one request. status 0 means no answer (error says why). json: an object sent as JSON; raw: JSON text sent as
// it is; body: bytes or text; chunked: send body without a length. path must already be encoded.
function request(app, method, urlPath, { token, json, raw, body, headers = {}, timeout = 20000, chunked = false } = {}) {
  return new Promise((resolve) => {
    const h = { ...headers, connection: 'close' };
    if (token) h.authorization = `Bearer ${token}`;
    let payload = body;
    if (raw !== undefined) {
      payload = raw;
      h['content-type'] = 'application/json';
    } else if (json !== undefined) {
      payload = JSON.stringify(json);
      h['content-type'] = 'application/json';
    }
    if (payload !== undefined && !chunked) h['content-length'] = Buffer.byteLength(payload);
    if (chunked) h['transfer-encoding'] = 'chunked';
    let done = false;
    let status = 0;
    let resHeaders = {};
    let error;
    const chunks = [];
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const bytes = Buffer.concat(chunks);
      const text = bytes.toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      resolve({ status, headers: resHeaders, bytes, text, json: parsed, error });
    };
    const req = http.request({ host: '127.0.0.1', port: app.port, method, path: urlPath, headers: h, agent: false }, (res) => {
      status = res.statusCode;
      resHeaders = res.headers;
      res.on('data', (c) => chunks.push(c));
      res.on('end', finish);
      res.on('close', finish);
      res.on('error', (e) => {
        error = e.code ?? e.message;
        finish();
      });
    });
    const timer = setTimeout(() => {
      error = 'timeout';
      req.destroy();
      finish();
    }, timeout);
    req.on('error', (e) => {
      error = e.code ?? e.message;
      finish();
    });
    if (chunked && payload !== undefined) {
      // The body in pieces of 64 KB, waiting when the socket is full, so a server that answers early is not flooded.
      (async () => {
        const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
        for (let i = 0; i < buf.length && !done; i += 65536) {
          if (!req.write(buf.subarray(i, i + 65536))) await new Promise((r) => req.once('drain', r).once('close', r));
        }
        if (!done) req.end();
      })().catch(() => {});
    } else {
      req.end(payload);
    }
  });
}

const enc = encodeURIComponent;
const healthy = async (app) => (await request(app, 'GET', '/health', { timeout: 2000 })).status === 200;

// An account made and logged in: { name, token, id }.
async function mk(app, prefix = 'user') {
  const name = uniq(prefix);
  const made = await request(app, 'POST', '/signup', { json: { name, password: PASSWORD, email: `${name}@example.com` } });
  ok(made.status === 201, `sign-up of a plain account answered ${made.status}`);
  const token = await logIn(app, name);
  const me = await request(app, 'GET', '/me', { token });
  ok(me.status === 200 && me.json?.id, `GET /me for a new account answered ${me.status}`);
  return { name, token, id: me.json.id };
}

async function logIn(app, name, password = PASSWORD) {
  const r = await request(app, 'POST', '/login', { json: { name, password } });
  ok(r.status === 200 && typeof r.json?.token === 'string', `log-in of ${name} answered ${r.status}`);
  return r.json.token;
}

const adminToken = (app) => logIn(app, 'admin', ADMIN_PASSWORD);

async function upload(app, token, name, content) {
  const r = await request(app, 'POST', `/files?name=${enc(name)}`, { token, body: content });
  ok(r.status === 201, `upload of ${JSON.stringify(name).slice(0, 40)} answered ${r.status}`);
  return r.json;
}

const getFile = (app, token, name) => request(app, 'GET', `/files/${enc(name)}`, { token });
const denied = (r) => r.status >= 400 && r.status < 500;

// The codes e-mailed to a user so far, read from the outbox.
async function mailCodes(app, name) {
  const file = path.join(app.dataDir, 'outbox.jsonl');
  for (let i = 0; i < 30; i++) {
    if (fs.existsSync(file)) {
      const codes = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .filter((m) => m.name === name)
        .map((m) => m.code);
      if (codes.length) return codes;
    }
    await sleep(100);
  }
  return [];
}

// Every file under dir, as paths relative to it.
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...walk(dir, p));
    else out.push(p);
  }
  return out;
}

function unescapeHtml(s) {
  const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return named[e.toLowerCase()] ?? m;
  });
}

const b64 = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64url');

// ---------- the cases ----------

const groups = [];
const group = (name, cases) => groups.push({ name, cases });

// ===== what README.md promises =====

group('regression: accounts', [
  ['GET /health answers { ok: true }', async (app) => {
    const r = await request(app, 'GET', '/health');
    ok(r.status === 200 && r.json?.ok === true, `answered ${r.status} ${r.text.slice(0, 80)}`);
  }],
  ['sign-up answers 201 with the id and the name', async (app) => {
    const name = uniq('reg');
    const r = await request(app, 'POST', '/signup', { json: { name, password: PASSWORD, email: `${name}@example.com` } });
    ok(r.status === 201 && r.json?.name === name && typeof r.json.id === 'string', `answered ${r.status} ${r.text.slice(0, 100)}`);
  }],
  ['sign-up refuses a short password, a bad name and a name that is taken', async (app) => {
    const u = await mk(app);
    const email = 'someone@example.com';
    const short = await request(app, 'POST', '/signup', { json: { name: uniq('reg'), password: 'short', email } });
    ok(short.status === 400, `a 5-character password answered ${short.status}`);
    const upper = await request(app, 'POST', '/signup', { json: { name: 'Upper-Case', password: PASSWORD, email } });
    ok(upper.status === 400, `an upper-case name answered ${upper.status}`);
    const tiny = await request(app, 'POST', '/signup', { json: { name: 'ab', password: PASSWORD, email } });
    ok(tiny.status === 400, `a 2-character name answered ${tiny.status}`);
    const taken = await request(app, 'POST', '/signup', { json: { name: u.name, password: PASSWORD, email } });
    ok(taken.status === 409, `a name that is taken answered ${taken.status}`);
  }],
  ['sign-up accepts ordinary e-mail addresses', async (app) => {
    for (const email of ['alice@example.com', 'bob.smith@mail.example.co.uk', 'carol_d-1@example.org', 'x@a-b.io']) {
      const r = await request(app, 'POST', '/signup', { json: { name: uniq('mail'), password: PASSWORD, email } });
      ok(r.status === 201, `${email} answered ${r.status}`);
    }
  }],
  ['sign-up refuses things that are not e-mail addresses', async (app) => {
    for (const email of ['plain', 'a@b', '@example.com', 'two@@example.com', 'sp ace@example.com', 'a@example', '', 42]) {
      const r = await request(app, 'POST', '/signup', { json: { name: uniq('mail'), password: PASSWORD, email } });
      ok(r.status === 400, `${JSON.stringify(email)} answered ${r.status}`);
    }
  }],
  ['log-in answers a token and when it ends; a wrong or unknown login is 401', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'POST', '/login', { json: { name: u.name, password: PASSWORD } });
    ok(r.status === 200 && typeof r.json.token === 'string' && !Number.isNaN(Date.parse(r.json.expiresAt)), `answered ${r.status} ${r.text.slice(0, 100)}`);
    const span = Date.parse(r.json.expiresAt) - Date.now();
    ok(Math.abs(span - DAY) < 10 * 60 * 1000, `a session should last 24 hours, expiresAt is ${Math.round(span / 3600000)} hours away`);
    ok((await request(app, 'POST', '/login', { json: { name: u.name, password: 'not the password' } })).status === 401, 'a wrong password was not 401');
    ok((await request(app, 'POST', '/login', { json: { name: 'nobody-by-this-name', password: PASSWORD } })).status === 401, 'an unknown name was not 401');
  }],
  ['GET /me answers the profile', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'GET', '/me', { token: u.token });
    ok(r.status === 200, `answered ${r.status}`);
    const p = r.json;
    ok(p.name === u.name && p.displayName === u.name && p.email === `${u.name}@example.com` && p.role === 'user' && p.id === u.id && !Number.isNaN(Date.parse(p.createdAt)), `profile is ${r.text.slice(0, 200)}`);
    ok(!('hash' in p) && !('salt' in p), 'the profile shows the password hash');
  }],
  ['no token, a made-up token and a token for a name that does not exist are 401', async (app) => {
    ok((await request(app, 'GET', '/me')).status === 401, 'no token');
    ok((await request(app, 'GET', '/me', { token: 'abc.def' })).status === 401, 'made-up token');
    ok((await request(app, 'GET', '/me', { token: 'garbage' })).status === 401, 'garbage token');
    ok((await request(app, 'GET', '/files')).status === 401, 'GET /files without a token');
  }],
  ['PATCH /me changes the display name and the address', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'PATCH', '/me', { token: u.token, json: { displayName: 'Carol D.', email: 'carol.d@example.org' } });
    ok(r.status === 200 && r.json.displayName === 'Carol D.' && r.json.email === 'carol.d@example.org', `answered ${r.status} ${r.text.slice(0, 120)}`);
    const me = await request(app, 'GET', '/me', { token: u.token });
    ok(me.json.displayName === 'Carol D.' && me.json.email === 'carol.d@example.org', 'the change was not kept');
    const alone = await request(app, 'PATCH', '/me', { token: u.token, json: { displayName: 'Only Name' } });
    ok(alone.status === 200 && alone.json.displayName === 'Only Name' && alone.json.email === 'carol.d@example.org', 'changing one field alone failed');
  }],
  ['PATCH /me refuses a bad address and an empty or very long display name', async (app) => {
    const u = await mk(app);
    ok((await request(app, 'PATCH', '/me', { token: u.token, json: { email: 'nope' } })).status === 400, 'bad address');
    ok((await request(app, 'PATCH', '/me', { token: u.token, json: { displayName: '' } })).status === 400, 'empty display name');
    ok((await request(app, 'PATCH', '/me', { token: u.token, json: { displayName: 'x'.repeat(101) } })).status === 400, '101-character display name');
  }],
  ['log-out answers 204; a second session of the same account keeps working', async (app) => {
    const u = await mk(app);
    const second = await logIn(app, u.name);
    const out = await request(app, 'POST', '/logout', { token: u.token });
    ok(out.status === 204, `log-out answered ${out.status}`);
    ok((await request(app, 'GET', '/me', { token: second })).status === 200, 'the other session stopped working');
    ok((await request(app, 'POST', '/logout')).status === 401, 'log-out without a token was not 401');
  }],
  ['two sessions of an account work at the same time, and a new log-in works after log-out', async (app) => {
    const u = await mk(app);
    const a = await logIn(app, u.name);
    const b = await logIn(app, u.name);
    ok((await request(app, 'GET', '/me', { token: a })).status === 200 && (await request(app, 'GET', '/me', { token: b })).status === 200, 'two sessions do not both work');
    await request(app, 'POST', '/logout', { token: a });
    const c = await logIn(app, u.name);
    ok((await request(app, 'GET', '/me', { token: c })).status === 200, 'a log-in after a log-out does not work');
  }],
  ['changing the password: a new session, the new password logs in, a wrong current is 401', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'POST', '/me/password', { token: u.token, json: { current: PASSWORD, password: 'second-password' } });
    ok(r.status === 200 && typeof r.json.token === 'string' && r.json.expiresAt, `answered ${r.status} ${r.text.slice(0, 100)}`);
    ok((await request(app, 'GET', '/me', { token: r.json.token })).status === 200, 'the new token does not work');
    ok((await request(app, 'POST', '/login', { json: { name: u.name, password: 'second-password' } })).status === 200, 'the new password does not log in');
    ok((await request(app, 'POST', '/login', { json: { name: u.name, password: PASSWORD } })).status === 401, 'the old password still logs in');
    const bad = await request(app, 'POST', '/me/password', { token: r.json.token, json: { current: 'wrong-current', password: 'third-password' } });
    ok(bad.status === 401, `a wrong current password answered ${bad.status}`);
    const short = await request(app, 'POST', '/me/password', { token: r.json.token, json: { current: 'second-password', password: 'short' } });
    ok(short.status === 400, `a short new password answered ${short.status}`);
  }],
  ['settings are merged key by key, as README.md shows', async (app) => {
    const u = await mk(app);
    ok(JSON.stringify((await request(app, 'GET', '/me/settings', { token: u.token })).json) === '{}', 'new settings are not {}');
    await request(app, 'PUT', '/me/settings', { token: u.token, json: { theme: { dark: true } } });
    const r = await request(app, 'PUT', '/me/settings', { token: u.token, json: { theme: { size: 2 }, lang: 'en' } });
    const want = { theme: { dark: true, size: 2 }, lang: 'en' };
    ok(r.status === 200 && JSON.stringify(r.json) === JSON.stringify(want), `answered ${r.status} ${r.text.slice(0, 120)}`);
    const got = await request(app, 'GET', '/me/settings', { token: u.token });
    ok(JSON.stringify(got.json) === JSON.stringify(want), `settings are ${got.text.slice(0, 120)}`);
  }],
  ['settings: other values replace the old ones, and each account has its own', async (app) => {
    const a = await mk(app);
    const b = await mk(app);
    await request(app, 'PUT', '/me/settings', { token: a.token, json: { list: [1, 2, 3], n: 1, o: { x: 1 } } });
    const r = await request(app, 'PUT', '/me/settings', { token: a.token, json: { list: [9], n: { deep: true }, o: 'flat' } });
    ok(JSON.stringify(r.json) === JSON.stringify({ list: [9], n: { deep: true }, o: 'flat' }), `settings are ${r.text.slice(0, 150)}`);
    ok(JSON.stringify((await request(app, 'GET', '/me/settings', { token: b.token })).json) === '{}', "another account's settings changed");
    ok((await request(app, 'PUT', '/me/settings', { token: a.token, raw: '[1,2]' })).status === 400, 'a JSON array was accepted as settings');
    ok((await request(app, 'PUT', '/me/settings', { token: a.token, raw: '{not json' })).status === 400, 'broken JSON was accepted');
  }],
  ['password reset: the e-mailed code sets a new password, once; a wrong code is 400', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'POST', '/reset', { json: { name: u.name } });
    ok(r.status === 202, `/reset answered ${r.status}`);
    const [code] = await mailCodes(app, u.name);
    ok(typeof code === 'string' && code.length > 0, 'no code in outbox.jsonl');
    const wrong = await request(app, 'POST', '/reset/confirm', { json: { name: u.name, code: 'not-the-code', password: 'brand-new-pass' } });
    ok(wrong.status === 400, `a wrong code answered ${wrong.status}`);
    const good = await request(app, 'POST', '/reset/confirm', { json: { name: u.name, code, password: 'brand-new-pass' } });
    ok(good.status === 204, `the right code answered ${good.status}`);
    ok((await request(app, 'POST', '/login', { json: { name: u.name, password: 'brand-new-pass' } })).status === 200, 'the new password does not log in');
    const again = await request(app, 'POST', '/reset/confirm', { json: { name: u.name, code, password: 'one-more-pass' } });
    ok(again.status === 400, `the same code a second time answered ${again.status}`);
  }],
  ['password reset: an unknown name answers 202 and sends nothing; the last code sent is the one that works', async (app) => {
    const before = fs.existsSync(path.join(app.dataDir, 'outbox.jsonl')) ? fs.readFileSync(path.join(app.dataDir, 'outbox.jsonl'), 'utf8') : '';
    const none = await request(app, 'POST', '/reset', { json: { name: 'nobody-by-this-name' } });
    ok(none.status === 202, `an unknown name answered ${none.status}`);
    await sleep(200);
    const after = fs.existsSync(path.join(app.dataDir, 'outbox.jsonl')) ? fs.readFileSync(path.join(app.dataDir, 'outbox.jsonl'), 'utf8') : '';
    ok(!after.includes('nobody-by-this-name') && after === before, 'a message was written for an unknown name');
    const u = await mk(app);
    await request(app, 'POST', '/reset', { json: { name: u.name } });
    const first = (await mailCodes(app, u.name)).at(-1);
    await sleep(1100);
    await request(app, 'POST', '/reset', { json: { name: u.name } });
    await sleep(200);
    const last = (await mailCodes(app, u.name)).at(-1);
    if (last !== first) {
      const old = await request(app, 'POST', '/reset/confirm', { json: { name: u.name, code: first, password: 'brand-new-pass' } });
      ok(old.status === 400, `an earlier code answered ${old.status} after a newer one was sent`);
    }
    const good = await request(app, 'POST', '/reset/confirm', { json: { name: u.name, code: last, password: 'brand-new-pass' } });
    ok(good.status === 204, `the last code answered ${good.status}`);
  }],
  ['unknown routes are 404 and broken JSON is 400', async (app) => {
    ok((await request(app, 'GET', '/nothing-here')).status === 404, 'unknown route');
    ok((await request(app, 'POST', '/login', { raw: '{broken' })).status === 400, 'broken JSON');
  }],
]);

group('regression: files and share links', [
  ['upload, list, download and delete a file', async (app) => {
    const u = await mk(app);
    const made = await request(app, 'POST', '/files?name=notes.txt', { token: u.token, body: 'hello there' });
    ok(made.status === 201 && made.json.name === 'notes.txt' && made.json.size === 11 && typeof made.json.id === 'string' && !Number.isNaN(Date.parse(made.json.createdAt)), `upload answered ${made.status} ${made.text.slice(0, 120)}`);
    await upload(app, u.token, 'a first.txt', 'x');
    const list = await request(app, 'GET', '/files', { token: u.token });
    ok(list.status === 200 && JSON.stringify(list.json.map((f) => f.name)) === '["a first.txt","notes.txt"]', `list is ${list.text.slice(0, 200)}`);
    const got = await getFile(app, u.token, 'notes.txt');
    ok(got.status === 200 && got.text === 'hello there', `download answered ${got.status} ${got.text.slice(0, 40)}`);
    ok((await request(app, 'DELETE', '/files/notes.txt', { token: u.token })).status === 204, 'delete was not 204');
    ok((await getFile(app, u.token, 'notes.txt')).status === 404, 'a deleted file can still be downloaded');
    ok((await request(app, 'DELETE', '/files/notes.txt', { token: u.token })).status === 404, 'deleting a deleted file was not 404');
    ok((await getFile(app, u.token, 'never-there.txt')).status === 404, 'a missing file was not 404');
  }],
  ['downloads are octet-stream attachments and bytes come back unchanged', async (app) => {
    const u = await mk(app);
    const bytes = Buffer.from(Array.from({ length: 1024 }, (_, i) => (i * 7) % 256));
    await upload(app, u.token, 'binary.bin', bytes);
    const r = await getFile(app, u.token, 'binary.bin');
    ok(r.status === 200 && r.bytes.equals(bytes), 'the bytes differ');
    ok(/octet-stream/.test(r.headers['content-type'] ?? ''), `content-type is ${r.headers['content-type']}`);
    ok(/^attachment/.test(r.headers['content-disposition'] ?? ''), `content-disposition is ${r.headers['content-disposition']}`);
  }],
  ['names with spaces, accents and non-Latin letters work for upload, download, list and by id', async (app) => {
    const u = await mk(app);
    for (const name of ['Årsrapport 2024 (final).txt', '報告書 v2.txt', 'a+b&c=d.txt', '.hidden', 'no-extension']) {
      const made = await upload(app, u.token, name, `content of ${name}`);
      const got = await getFile(app, u.token, name);
      ok(got.status === 200 && got.text === `content of ${name}`, `${name}: download answered ${got.status}`);
      const byId = await request(app, 'GET', `/files/by-id/${made.id}`, { token: u.token });
      ok(byId.status === 200 && byId.text === `content of ${name}`, `${name}: by id answered ${byId.status}`);
    }
    const list = await request(app, 'GET', '/files', { token: u.token });
    ok(list.json.length === 5 && list.json.some((f) => f.name === '報告書 v2.txt'), 'the list lacks a name');
  }],
  ['an upload with a name that exists replaces the file and keeps its id', async (app) => {
    const u = await mk(app);
    const first = await upload(app, u.token, 'a.txt', 'one');
    const second = await upload(app, u.token, 'a.txt', 'three');
    ok(second.id === first.id && second.size === 5, `second upload is ${JSON.stringify(second)}`);
    ok((await getFile(app, u.token, 'a.txt')).text === 'three', 'the old content was kept');
    ok((await request(app, 'GET', '/files', { token: u.token })).json.length === 1, 'the list has two entries');
  }],
  ['an upload needs a name and a log-in', async (app) => {
    const u = await mk(app);
    ok((await request(app, 'POST', '/files', { token: u.token, body: 'x' })).status === 400, 'no name was not 400');
    ok((await request(app, 'POST', '/files?name=a.txt', { body: 'x' })).status === 401, 'no log-in was not 401');
  }],
  ["files are private: another account's names are 404 and its list is empty", async (app) => {
    const a = await mk(app);
    const b = await mk(app);
    const made = await upload(app, a.token, 'private.txt', 'only for a');
    ok((await getFile(app, b.token, 'private.txt')).status === 404, 'b downloaded a name of a');
    ok((await request(app, 'GET', '/files', { token: b.token })).json.length === 0, 'the list of b shows files of a');
    ok((await request(app, 'DELETE', '/files/private.txt', { token: b.token })).status === 404, 'b deleted a name of a');
    ok((await getFile(app, a.token, 'private.txt')).text === 'only for a', 'the file of a is gone');
    ok((await request(app, 'GET', '/files/by-id/0000000000000000', { token: a.token })).status === 404, 'an unknown id was not 404');
  }],
  ['a file of exactly 10 MB is accepted and comes back whole', async (app) => {
    const u = await mk(app);
    const big = Buffer.alloc(MB10);
    for (let i = 0; i < big.length; i += 4096) big[i] = i % 251;
    const made = await request(app, 'POST', '/files?name=big.bin', { token: u.token, body: big });
    ok(made.status === 201 && made.json.size === MB10, `answered ${made.status} ${made.text.slice(0, 100)}`);
    const got = await getFile(app, u.token, 'big.bin');
    ok(got.status === 200 && got.bytes.equals(big), 'the download differs');
  }],
  ['JSON bodies up to 1 MB are accepted, larger ones refused', async (app) => {
    const u = await mk(app);
    const fits = await request(app, 'PUT', '/me/settings', { token: u.token, json: { blob: 'x'.repeat(600 * 1024) } });
    ok(fits.status === 200, `600 KB answered ${fits.status}`);
    const big = await request(app, 'PUT', '/me/settings', { token: u.token, json: { blob2: 'x'.repeat(1200 * 1024) } });
    ok(denied(big), `1.2 MB answered ${big.status}`);
  }],
  ['share link: made with 201, valid for seven days, the page and the download need no log-in', async (app) => {
    const u = await mk(app);
    await request(app, 'PATCH', '/me', { token: u.token, json: { displayName: 'Ann Example' } });
    await upload(app, u.token, 'Quarterly report.pdf', 'pdf bytes');
    const link = await request(app, 'POST', `/files/${enc('Quarterly report.pdf')}/share`, { token: u.token });
    ok(link.status === 201 && typeof link.json?.token === 'string' && link.json.token.length >= 8, `answered ${link.status} ${link.text.slice(0, 150)}`);
    ok(link.json.url === `/s/${link.json.token}`, `url is ${link.json.url}`);
    const span = Date.parse(link.json.expiresAt) - Date.now();
    ok(Math.abs(span - 7 * DAY) < 10 * 60 * 1000, `expiresAt is ${(span / DAY).toFixed(2)} days away`);
    const page = await request(app, 'GET', link.json.url);
    ok(page.status === 200 && /text\/html/.test(page.headers['content-type'] ?? ''), `page answered ${page.status} ${page.headers['content-type']}`);
    ok(page.text.includes('Quarterly report.pdf') && page.text.includes('Ann Example') && page.text.includes('9 bytes'), 'the page lacks the name, the sharer or the size');
    const file = await request(app, 'GET', `${link.json.url}/download`);
    ok(file.status === 200 && file.text === 'pdf bytes', `download answered ${file.status}`);
    ok(new Set([link.json.token, (await request(app, 'POST', `/files/${enc('Quarterly report.pdf')}/share`, { token: u.token })).json.token]).size === 2, 'two links have the same token');
  }],
  ['share link: sharing needs a log-in and a file of yours; unknown links and deleted files are 404', async (app) => {
    const a = await mk(app);
    const b = await mk(app);
    await upload(app, a.token, 'doc.txt', 'doc');
    ok((await request(app, 'POST', '/files/doc.txt/share')).status === 401, 'sharing without a log-in was not 401');
    ok((await request(app, 'POST', '/files/doc.txt/share', { token: b.token })).status === 404, 'sharing a file of someone else was not 404');
    ok((await request(app, 'POST', '/files/none.txt/share', { token: a.token })).status === 404, 'sharing a missing file was not 404');
    ok((await request(app, 'GET', '/s/0123456789abcdef')).status === 404, 'an unknown link page was not 404');
    ok((await request(app, 'GET', '/s/0123456789abcdef/download')).status === 404, 'an unknown link download was not 404');
    const link = (await request(app, 'POST', '/files/doc.txt/share', { token: a.token })).json;
    await request(app, 'DELETE', '/files/doc.txt', { token: a.token });
    ok((await request(app, 'GET', link.url)).status === 404, 'the page of a deleted file was not 404');
    ok((await request(app, 'GET', `${link.url}/download`)).status === 404, 'the download of a deleted file was not 404');
  }],
  ['share page: names with markup characters are shown as text, escaped', async (app) => {
    const u = await mk(app);
    const name = `R&D <plan> 'q' "x".txt`;
    await upload(app, u.token, name, 'plan');
    const link = (await request(app, 'POST', `/files/${enc(name)}/share`, { token: u.token })).json;
    const page = await request(app, 'GET', link.url);
    ok(page.status === 200, `answered ${page.status}`);
    ok(unescapeHtml(page.text).includes(name), 'the name does not show as text on the page');
  }],
]);

group('regression: admins', [
  ['an admin sees every account and the totals', async (app) => {
    const admin = await adminToken(app);
    const a = await mk(app);
    await upload(app, a.token, 'one.txt', '12345');
    await upload(app, a.token, 'two.txt', '123');
    const users = await request(app, 'GET', '/admin/users', { token: admin });
    ok(users.status === 200 && Array.isArray(users.json), `answered ${users.status}`);
    const row = users.json.find((x) => x.name === a.name);
    ok(row && row.id === a.id && row.email === `${a.name}@example.com` && row.role === 'user' && row.createdAt, `row is ${JSON.stringify(row)}`);
    ok(users.json.find((x) => x.name === 'admin')?.role === 'admin', 'the admin account is not listed as admin');
    const st = await request(app, 'GET', '/admin/stats', { token: admin });
    ok(st.status === 200 && st.json.files === 2 && st.json.bytes === 8 && st.json.users === users.json.length, `stats are ${st.text.slice(0, 100)}`);
    ok(!('hash' in row) && !('salt' in row), 'the list shows password hashes');
  }],
  ['a plain account and a visitor get 403 and 401 on the admin routes', async (app) => {
    const u = await mk(app);
    const other = await mk(app);
    ok((await request(app, 'GET', '/admin/stats', { token: u.token })).status === 403, 'stats for a plain account was not 403');
    ok((await request(app, 'GET', '/admin/stats')).status === 401, 'stats without a log-in was not 401');
    ok((await request(app, 'POST', `/admin/users/${other.id}/role`, { token: u.token, json: { role: 'admin' } })).status === 403, 'a role change by a plain account was not 403');
    ok((await request(app, 'DELETE', `/admin/users/${other.id}`, { token: u.token })).status === 403, 'a removal by a plain account was not 403');
    ok((await request(app, 'GET', '/me', { token: other.token })).status === 200, 'the account was removed all the same');
  }],
  ['an admin can make an account an admin, take it back, and remove an account with its files and links', async (app) => {
    const admin = await adminToken(app);
    const a = await mk(app);
    const b = await mk(app);
    const role = await request(app, 'POST', `/admin/users/${a.id}/role`, { token: admin, json: { role: 'admin' } });
    ok(role.status === 200 && role.json.id === a.id && role.json.role === 'admin', `role answered ${role.status} ${role.text.slice(0, 80)}`);
    ok((await request(app, 'GET', '/admin/stats', { token: a.token })).status === 200, 'the new admin cannot use admin routes');
    ok((await request(app, 'GET', '/me', { token: a.token })).json.role === 'admin', 'the profile does not show the role admin');
    ok((await request(app, 'POST', `/admin/users/${a.id}/role`, { token: admin, json: { role: 'user' } })).status === 200, 'taking the role back failed');
    ok((await request(app, 'GET', '/admin/stats', { token: a.token })).status === 403, 'the account is still an admin');
    ok((await request(app, 'POST', `/admin/users/${a.id}/role`, { token: admin, json: { role: 'owner' } })).status === 400, 'an unknown role was not 400');
    await upload(app, b.token, 'gone.txt', 'bye');
    const link = (await request(app, 'POST', '/files/gone.txt/share', { token: b.token })).json;
    ok((await request(app, 'DELETE', `/admin/users/${b.id}`, { token: admin })).status === 204, 'removal was not 204');
    ok((await request(app, 'POST', '/login', { json: { name: b.name, password: PASSWORD } })).status === 401, 'a removed account can log in');
    ok((await request(app, 'GET', link.url)).status === 404, 'the link of a removed account still works');
    ok(!fs.existsSync(path.join(app.dataDir, 'files', b.name, 'gone.txt')), 'the file of a removed account is still on disk');
    ok((await request(app, 'DELETE', `/admin/users/${b.id}`, { token: admin })).status === 404, 'removing a removed account was not 404');
    const me = (await request(app, 'GET', '/me', { token: admin })).json;
    ok((await request(app, 'DELETE', `/admin/users/${me.id}`, { token: admin })).status === 400, 'an admin could remove their own account');
  }],
]);

// Routine checks of one feature are run together as one case, so that the cases are weighed by what they protect:
// each of the problems above has several of its own, while a feature that is only kept working has one or two.
function fuse(groupName, newName, names) {
  const g = groups.find((x) => x.name === groupName);
  const parts = names.map((n) => g.cases.find((c) => c[0] === n));
  parts.forEach((p, i) => ok(p, `no case ${names[i]}`));
  const at = g.cases.indexOf(parts[0]);
  g.cases = g.cases.filter((c) => !parts.includes(c));
  g.cases.splice(at, 0, [newName, async (app) => {
    for (const [name, fn] of parts) {
      try {
        await fn(app);
      } catch (e) {
        throw new Error(`${name}: ${e.message}`);
      }
    }
  }]);
}

const A = 'regression: accounts';
fuse(A, 'GET /health, unknown routes and broken JSON', ['GET /health answers { ok: true }', 'unknown routes are 404 and broken JSON is 400']);
fuse(A, 'sign-up answers 201 and refuses a short password, a bad name and a name that is taken', ['sign-up answers 201 with the id and the name', 'sign-up refuses a short password, a bad name and a name that is taken']);
fuse(A, 'sign-up accepts ordinary e-mail addresses and refuses what is not one', ['sign-up accepts ordinary e-mail addresses', 'sign-up refuses things that are not e-mail addresses']);
fuse(A, 'log-in, the profile and the 401s', ['log-in answers a token and when it ends; a wrong or unknown login is 401', 'GET /me answers the profile', 'no token, a made-up token and a token for a name that does not exist are 401']);
fuse(A, 'PATCH /me changes the display name and the address and refuses bad ones', ['PATCH /me changes the display name and the address', 'PATCH /me refuses a bad address and an empty or very long display name']);
fuse(A, 'log-out ends only its own session; sessions work side by side', ['log-out answers 204; a second session of the same account keeps working', 'two sessions of an account work at the same time, and a new log-in works after log-out']);
fuse(A, 'settings are merged key by key, other values replace, each account has its own', ['settings are merged key by key, as README.md shows', 'settings: other values replace the old ones, and each account has its own']);
const F = 'regression: files and share links';
fuse(F, 'upload, list, download and delete a file; downloads are attachments and bytes come back unchanged', ['upload, list, download and delete a file', 'downloads are octet-stream attachments and bytes come back unchanged']);
fuse(F, 'an upload with a name that exists replaces the file; an upload needs a name and a log-in', ['an upload with a name that exists replaces the file and keeps its id', 'an upload needs a name and a log-in']);

// ===== 1 and 2: path traversal =====

group('1: download path traversal', [
  ['1 a file outside the folder cannot be downloaded with ../ in the name (several spellings)', async (app) => {
    const u = await mk(app);
    const secret = marker('secret');
    fs.writeFileSync(path.join(app.dataDir, 'secret.txt'), secret);
    for (const name of ['..%2f..%2fsecret.txt', '%2e%2e%2f%2e%2e%2fsecret.txt', '..%2F..%2Fsecret.txt', '....%2f%2f....%2f%2fsecret.txt', '..%2f..%2f..%2fdata%2fsecret.txt']) {
      const r = await request(app, 'GET', `/files/${name}`, { token: u.token });
      ok(!r.text.includes(secret), `GET /files/${name} returned the secret file`);
    }
  }],
  ['1 the data file with the password hashes cannot be downloaded', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'GET', '/files/..%2f..%2fdb.json', { token: u.token });
    ok(!r.text.includes('"salt"') && !r.text.includes('"hash"'), 'db.json came back');
  }],
  ['1 the key that signs sessions cannot be downloaded', async (app) => {
    const u = await mk(app);
    const key = fs.readFileSync(path.join(app.dataDir, 'secret.key'), 'utf8').trim();
    const r = await request(app, 'GET', '/files/..%2f..%2fsecret.key', { token: u.token });
    ok(!r.text.includes(key), 'secret.key came back');
  }],
  ["1 another account's file cannot be downloaded through ../<name>/", async (app) => {
    const a = await mk(app, 'alice');
    const b = await mk(app, 'bobby');
    const text = marker('bobs-notes');
    await upload(app, b.token, 'notes.txt', text);
    const r = await request(app, 'GET', `/files/..%2f${b.name}%2fnotes.txt`, { token: a.token });
    ok(!r.text.includes(text), "a file of another account came back");
  }],
  ['1 an account whose name begins another name cannot reach that folder (bob and bobby)', async (app) => {
    const short = await mk(app, 'bob');
    const longName = `${short.name}by`;
    const made = await request(app, 'POST', '/signup', { json: { name: longName, password: PASSWORD, email: 'by@example.com' } });
    ok(made.status === 201, `sign-up of ${longName} answered ${made.status}`);
    const longToken = await logIn(app, longName);
    const text = marker('bobby');
    await upload(app, longToken, 'private.txt', text);
    const r = await request(app, 'GET', `/files/..%2f${longName}%2fprivate.txt`, { token: short.token });
    ok(!r.text.includes(text), `${short.name} read a file of ${longName}`);
  }],
  ['1 an absolute path in the name is not followed', async (app) => {
    const u = await mk(app);
    const secret = marker('absolute');
    const file = path.join(app.dataDir, 'secret.txt');
    fs.writeFileSync(file, secret);
    const r = await request(app, 'GET', `/files/${enc(file)}`, { token: u.token });
    ok(!r.text.includes(secret), 'a file named by its absolute path came back');
  }],
]);

group('2: upload path traversal', [
  ['2 an upload named ../../x does not land outside the account folder', async (app) => {
    const u = await mk(app);
    const text = marker('planted');
    await request(app, 'POST', `/files?name=${enc('../../planted.txt')}`, { token: u.token, body: text });
    await request(app, 'POST', `/files?name=${enc('../../../planted2.txt')}`, { token: u.token, body: text });
    const inside = path.join('data', 'files', u.name) + path.sep;
    const outside = walk(app.arena).filter((f) => !f.startsWith(inside) && fs.readFileSync(path.join(app.arena, f)).includes(text));
    ok(outside.length === 0, `the content was written to ${outside.join(', ')}`);
  }],
  ["2 an upload cannot write into another account's folder (bob and bobby)", async (app) => {
    const short = await mk(app, 'bob');
    const longName = `${short.name}by`;
    ok((await request(app, 'POST', '/signup', { json: { name: longName, password: PASSWORD, email: 'by@example.com' } })).status === 201, 'sign-up failed');
    const text = marker('planted-in-other');
    await request(app, 'POST', `/files?name=${enc(`../${longName}/planted.txt`)}`, { token: short.token, body: text });
    const inside = path.join('data', 'files', short.name) + path.sep;
    const outside = walk(app.arena).filter((f) => !f.startsWith(inside) && fs.readFileSync(path.join(app.arena, f)).includes(text));
    ok(outside.length === 0, `the content was written to ${outside.join(', ')}`);
  }],
  ['2 an upload cannot replace the key that signs sessions', async (app) => {
    const u = await mk(app);
    const before = fs.readFileSync(path.join(app.dataDir, 'secret.key'), 'utf8');
    await request(app, 'POST', `/files?name=${enc('../../secret.key')}`, { token: u.token, body: 'attacker-chosen-key' });
    ok(fs.readFileSync(path.join(app.dataDir, 'secret.key'), 'utf8') === before, 'secret.key was overwritten');
  }],
  ['2 an upload cannot replace a file outside the folder that already exists', async (app) => {
    const u = await mk(app);
    const target = path.join(app.dataDir, 'existing.txt');
    fs.writeFileSync(target, 'original');
    await request(app, 'POST', `/files?name=${enc('../../existing.txt')}`, { token: u.token, body: 'replaced' });
    await request(app, 'POST', `/files?name=${enc(target)}`, { token: u.token, body: 'replaced' });
    ok(fs.readFileSync(target, 'utf8') === 'original', 'a file outside the folder was overwritten');
  }],
]);

// ===== 3, 4: access =====

group('3: file ids', [
  ["3 another account's file cannot be downloaded by its id", async (app) => {
    const a = await mk(app);
    const b = await mk(app);
    const text = marker('by-id');
    const made = await upload(app, a.token, 'mine.txt', text);
    const r = await request(app, 'GET', `/files/by-id/${made.id}`, { token: b.token });
    ok(!r.text.includes(text), 'b got the file of a by its id');
  }],
  ['3 a file cannot be downloaded by its id without a log-in', async (app) => {
    const a = await mk(app);
    const text = marker('by-id-anon');
    const made = await upload(app, a.token, 'mine.txt', text);
    const r = await request(app, 'GET', `/files/by-id/${made.id}`);
    ok(!r.text.includes(text), 'a visitor got the file by its id');
  }],
]);

group('4: what PATCH /me can change', [
  ['4 { role: "admin" } does not make the account an admin', async (app) => {
    const u = await mk(app);
    await request(app, 'PATCH', '/me', { token: u.token, json: { role: 'admin' } });
    const st = await request(app, 'GET', '/admin/stats', { token: u.token });
    ok(denied(st), `the admin route answered ${st.status}`);
    ok((await request(app, 'GET', '/me', { token: u.token })).json.role === 'user', 'the profile shows another role');
  }],
  ['4 { "__proto__": { role: "admin" } } does not make the account an admin', async (app) => {
    const u = await mk(app);
    await request(app, 'PATCH', '/me', { token: u.token, raw: '{"__proto__":{"role":"admin"},"displayName":"x"}' });
    const st = await request(app, 'GET', '/admin/stats', { token: u.token });
    ok(denied(st), `the admin route answered ${st.status}`);
  }],
  ['4 name, id and creation time cannot be changed', async (app) => {
    const u = await mk(app);
    const other = await mk(app);
    const before = (await request(app, 'GET', '/me', { token: u.token })).json;
    await request(app, 'PATCH', '/me', { token: u.token, json: { name: other.name, id: other.id, createdAt: '2001-01-01T00:00:00.000Z', role: 'admin' } });
    const me = await request(app, 'GET', '/me', { token: u.token });
    ok(me.status === 200, `GET /me answered ${me.status}`);
    ok(me.json.name === before.name && me.json.id === before.id && me.json.createdAt === before.createdAt && me.json.role === 'user', `the profile became ${me.text.slice(0, 160)}`);
    const otherMe = (await request(app, 'GET', '/me', { token: other.token })).json;
    ok(otherMe.name === other.name && otherMe.id === other.id, 'the other account changed');
  }],
  ['4 a stored password hash or reset code cannot be set through PATCH /me', async (app) => {
    const u = await mk(app);
    const salt = 'aa'.repeat(16);
    const hash = crypto.scryptSync('attacker-pass', salt, 64).toString('hex');
    await request(app, 'PATCH', '/me', { token: u.token, json: { salt, hash } });
    ok((await request(app, 'POST', '/login', { json: { name: u.name, password: 'attacker-pass' } })).status === 401, 'a password hash was set through PATCH /me');
    await request(app, 'PATCH', '/me', { token: u.token, json: { reset: { code: 'abc', expires: 9e15 } } });
    const victimCheck = await request(app, 'POST', '/reset/confirm', { json: { name: u.name, code: 'abc', password: 'hacked-pass-12' } });
    ok(victimCheck.status === 400, 'a reset code was set through PATCH /me');
  }],
]);

// ===== 5: prototype pollution =====

// Sends the settings, then looks at what the accounts around can do. Returns the cases for one way of sending them.
function pollution(vector, raw, first) {
  const attack = async (app) => {
    const attacker = await mk(app);
    const early = await mk(app);
    if (first) await request(app, 'PUT', '/me/settings', { token: attacker.token, raw: first });
    await request(app, 'PUT', '/me/settings', { token: attacker.token, raw });
    const late = await mk(app);
    return { attacker, early, late };
  };
  return [
    [`5 ${vector}: nobody, the sender included, can use the admin routes afterwards`, async (app) => {
      const { attacker, early, late } = await attack(app);
      for (const [who, label] of [[attacker, 'the sender'], [early, 'an earlier account'], [late, 'a later account']]) {
        const st = await request(app, 'GET', '/admin/stats', { token: who.token });
        ok(denied(st), `after the settings were sent, ${label} got ${st.status} from /admin/stats`);
      }
      const admin = await adminToken(app);
      ok((await request(app, 'GET', '/admin/stats', { token: admin })).status === 200, 'the admin lost the admin routes');
    }],
    [`5 ${vector}: every profile still shows the role user, and no account can be removed by a plain one`, async (app) => {
      const { attacker, early, late } = await attack(app);
      for (const who of [attacker, early, late]) {
        ok((await request(app, 'GET', '/me', { token: who.token })).json?.role === 'user', 'a profile shows another role');
      }
      const victim = await mk(app);
      const del = await request(app, 'DELETE', `/admin/users/${victim.id}`, { token: attacker.token });
      ok(denied(del), `removing an account as the sender answered ${del.status}`);
      ok((await request(app, 'GET', '/me', { token: victim.token })).status === 200, 'an account was removed');
    }],
  ];
}

group('5: prototype pollution through settings (__proto__)', pollution('{ "__proto__": { role: "admin" } } in the settings', '{"__proto__":{"role":"admin"}}'));
group('5: prototype pollution through settings (constructor.prototype)', pollution('{ constructor: { prototype: { role: "admin" } } } in the settings', '{"constructor":{"prototype":{"role":"admin"}}}'));
group('5: prototype pollution through settings (nested)', pollution('a nested "__proto__" inside settings that exist', '{"theme":{"__proto__":{"role":"admin"}}}', '{"theme":{"dark":true}}'));

// ===== 6: forged tokens =====

group('6: session tokens', [
  ['6 a payload with an empty signature is not accepted', async (app) => {
    for (const payload of [{ user: 'admin' }, { user: 'admin', exp: 99999999999999 }]) {
      const token = `${b64(payload)}.`;
      for (const route of ['/admin/stats', '/me']) {
        const r = await request(app, 'GET', route, { token });
        ok(!(r.status >= 200 && r.status < 300), `${route} answered ${r.status} for the token ${token.slice(0, 40)}`);
      }
    }
  }],
  ['6 a payload with no signature part at all is not accepted', async (app) => {
    for (const payload of [{ user: 'admin' }, { user: 'admin', exp: 99999999999999 }]) {
      const r = await request(app, 'GET', '/admin/stats', { token: b64(payload) });
      ok(!(r.status >= 200 && r.status < 300), `the admin route answered ${r.status}`);
    }
  }],
  ['6 a signature of one character is not accepted, whichever character it is', async (app) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const body = b64({ user: 'admin' });
    for (const c of chars) {
      const r = await request(app, 'GET', '/admin/stats', { token: `${body}.${c}` });
      ok(!(r.status >= 200 && r.status < 300), `a signature of "${c}" was accepted (${r.status})`);
    }
  }],
  ['6 the signature of another account\'s token does not carry over to a changed payload', async (app) => {
    const u = await mk(app);
    const sig = u.token.slice(u.token.lastIndexOf('.') + 1);
    const forged = `${b64({ user: 'admin', exp: 99999999999999 })}.${sig}`;
    const r = await request(app, 'GET', '/admin/stats', { token: forged });
    ok(!(r.status >= 200 && r.status < 300), `the admin route answered ${r.status}`);
    const own = await request(app, 'GET', '/me', { token: u.token });
    ok(own.status === 200, 'the real token stopped working');
  }],
]);

// ===== 7: reset codes =====

group('7: password reset codes', [
  ['7 the code made from the user name and the second cannot be guessed', async (app) => {
    const u = await mk(app);
    const t0 = Date.now();
    ok((await request(app, 'POST', '/reset', { json: { name: u.name } })).status === 202, 'the reset request failed');
    const t1 = Date.now();
    const guesses = [];
    for (let s = Math.floor(t0 / 1000) - 3; s <= Math.floor(t1 / 1000) + 3; s++) {
      for (const form of [`${u.name}:${s}`, `${u.name}${s}`, `${s}:${u.name}`, `${s}${u.name}`]) {
        for (const algo of ['sha256', 'sha1', 'md5']) {
          const h = crypto.createHash(algo).update(form).digest('hex');
          for (const len of [h.length, 32, 24, 16, 12, 8]) guesses.push(h.slice(0, len));
        }
      }
    }
    await tryCodes(app, u, [...new Set(guesses)]);
  }],
  ['7 the code made from the user name and the millisecond cannot be guessed', async (app) => {
    const u = await mk(app);
    const t0 = Date.now();
    ok((await request(app, 'POST', '/reset', { json: { name: u.name } })).status === 202, 'the reset request failed');
    const t1 = Date.now();
    const guesses = [];
    for (let ms = t0 - 30; ms <= t1 + 30; ms++) {
      for (const form of [`${u.name}:${ms}`, `${u.name}${ms}`]) {
        for (const algo of ['sha256', 'sha1', 'md5']) {
          const h = crypto.createHash(algo).update(form).digest('hex');
          guesses.push(h, h.slice(0, 32));
        }
      }
      guesses.push(String(ms), ms.toString(36), ms.toString(16));
    }
    await tryCodes(app, u, [...new Set(guesses)]);
  }],
  ['7 the answer to the reset request does not contain the code', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'POST', '/reset', { json: { name: u.name } });
    const [code] = await mailCodes(app, u.name);
    ok(typeof code === 'string' && code.length > 0, 'no code in the outbox');
    ok(!r.text.includes(code) && !JSON.stringify(r.headers).includes(code), 'the code is in the answer to the request');
  }],
  ['7 the codes of two accounts are not the same, nor made one from the other', async (app) => {
    const a = await mk(app);
    const b = await mk(app);
    await request(app, 'POST', '/reset', { json: { name: a.name } });
    await request(app, 'POST', '/reset', { json: { name: b.name } });
    const [ca] = await mailCodes(app, a.name);
    const [cb] = await mailCodes(app, b.name);
    ok(typeof ca === 'string' && typeof cb === 'string' && ca !== cb, 'the codes are the same');
    const wrong = await request(app, 'POST', '/reset/confirm', { json: { name: a.name, code: cb, password: 'hacked-pass-12' } });
    ok(wrong.status === 400, "the code of b worked for a (status " + wrong.status + ')');
  }],
]);

// Tries each code to reset the password of u; passes when none works.
async function tryCodes(app, u, codes) {
  const password = 'hacked-pass-12';
  let hit;
  for (let i = 0; i < codes.length && !hit; i += 8) {
    const batch = codes.slice(i, i + 8);
    const answers = await Promise.all(batch.map((code) => request(app, 'POST', '/reset/confirm', { json: { name: u.name, code, password } })));
    answers.forEach((a, k) => {
      if (a.status >= 200 && a.status < 300) hit = batch[k];
    });
  }
  ok(!hit, `the password was reset with the guessed code ${hit}`);
  const login = await request(app, 'POST', '/login', { json: { name: u.name, password } });
  ok(login.status !== 200, 'the account can be logged in with the attacker\'s password');
}

// ===== 8: ReDoS =====

async function stillAnswers(app, what) {
  const t = Date.now();
  const h = await request(app, 'GET', '/health', { timeout: 2000 });
  ok(h.status === 200, `the server did not answer within 2 s after ${what}`);
  return Date.now() - t;
}

const crafted = `${'a'.repeat(40)}!`;
group('8: regular expression backtracking (sign-up)', [
  ['8 a crafted 40-character address at sign-up does not hang the server', async (app) => {
    await request(app, 'POST', '/signup', { json: { name: uniq('redos'), password: PASSWORD, email: crafted }, timeout: 300 });
    await stillAnswers(app, 'a crafted address at sign-up');
  }],
]);
group('8: regular expression backtracking (profile)', [
  ['8 a crafted address in PATCH /me does not hang the server', async (app) => {
    const u = await mk(app);
    await request(app, 'PATCH', '/me', { token: u.token, json: { email: crafted }, timeout: 300 });
    await stillAnswers(app, 'a crafted address in PATCH /me');
  }],
]);
for (const [what, make] of [
  ['an address that ends with a second @ after 30,000 labels', () => `x@${'a.'.repeat(30000)}@`],
  ['an address of 60,000 letters and a dot-less ending', () => `${'a'.repeat(60000)}@x.com!`],
  ['an address of 30,000 short labels', () => `${'a.'.repeat(30000)}!`],
]) {
  group(`8: regular expression backtracking (${what})`, [
    [`8 ${what} does not hang the server`, async (app) => {
      const email = make();
      await request(app, 'POST', '/signup', { json: { name: uniq('redos'), password: PASSWORD, email }, timeout: 500 });
      await stillAnswers(app, `an address of ${email.length} characters`);
    }],
  ]);
}

// ===== 9: stored XSS =====

group('9: markup in file names on the share page', [
  ...['<script>alert(1)<script>.txt', '<img src=x onerror=alert(1)>.txt', '<svg onload=alert(1)>.txt', '"><script>alert(1)<.txt'].map((name) => [
    `9 the file name ${name} is not put into the page as markup`,
    async (app) => {
      const u = await mk(app);
      await upload(app, u.token, name, 'x');
      const link = (await request(app, 'POST', `/files/${enc(name)}/share`, { token: u.token })).json;
      const page = await request(app, 'GET', link.url);
      ok(page.status === 200, `the page answered ${page.status}`);
      ok(!/<(script|img|svg)\b/i.test(page.text), `the page has the name as markup: ${page.text.match(/<(script|img|svg)\b.{0,40}/i)?.[0]}`);
      ok(unescapeHtml(page.text).includes(name), 'the name does not show as text on the page');
    },
  ]),
  ['9 the sharer\'s display name is shown escaped', async (app) => {
    const u = await mk(app);
    await request(app, 'PATCH', '/me', { token: u.token, json: { displayName: '<i>Zed</i> & co' } });
    await upload(app, u.token, 'a.txt', 'x');
    const link = (await request(app, 'POST', '/files/a.txt/share', { token: u.token })).json;
    const page = await request(app, 'GET', link.url);
    ok(!page.text.includes('<i>Zed'), 'the display name is in the page as markup');
    ok(unescapeHtml(page.text).includes('<i>Zed</i> & co'), 'the display name does not show');
  }],
]);

// ===== 10: share links expire =====

function sharedFile(app, prefix) {
  return (async () => {
    const u = await mk(app, prefix);
    const text = marker('shared');
    const name = `${marker('name')}.txt`;
    await upload(app, u.token, name, text);
    const link = (await request(app, 'POST', `/files/${enc(name)}/share`, { token: u.token })).json;
    ok(link?.url, 'could not make a share link');
    return { u, text, name, link };
  })();
}

group('10: share links expire after seven days', [
  ['10 a link still works after six days', async (app) => {
    const s = await sharedFile(app, 'six');
    app.setClock(6 * DAY);
    const page = await request(app, 'GET', s.link.url);
    ok(page.status === 200 && page.text.includes(s.name), `the page answered ${page.status}`);
    const file = await request(app, 'GET', `${s.link.url}/download`);
    ok(file.status === 200 && file.text === s.text, `the download answered ${file.status}`);
  }],
  ['10 the page of a link is refused after eight days', async (app) => {
    const s = await sharedFile(app, 'eight');
    app.setClock(8 * DAY);
    const page = await request(app, 'GET', s.link.url);
    ok(!page.text.includes(s.name) && !(page.status >= 200 && page.status < 300 && page.text.includes('/download')), `the page of an expired link answered ${page.status} with the file name`);
  }],
  ['10 the download of a link is refused after eight days', async (app) => {
    const s = await sharedFile(app, 'eightd');
    app.setClock(8 * DAY);
    const file = await request(app, 'GET', `${s.link.url}/download`);
    ok(!file.text.includes(s.text), `the download of an expired link answered ${file.status} with the file`);
  }],
  ['10 a link made late lasts seven days from when it was made', async (app) => {
    const u = await mk(app, 'late');
    const text = marker('late');
    await upload(app, u.token, 'late.txt', text);
    app.setClock(20 * DAY);
    const token = await logIn(app, u.name);
    const link = (await request(app, 'POST', '/files/late.txt/share', { token })).json;
    ok(link?.url, 'could not make a link after twenty days');
    ok(Math.abs(Date.parse(link.expiresAt) - (Date.now() + 20 * DAY) - 7 * DAY) < 10 * 60 * 1000, `expiresAt is ${link.expiresAt}`);
    const file = await request(app, 'GET', `${link.url}/download`);
    ok(file.status === 200 && file.text === text, `a new link answered ${file.status}`);
    app.setClock(28 * DAY);
    ok(!(await request(app, 'GET', `${link.url}/download`)).text.includes(text), 'the link did not expire eight days after it was made');
  }],
]);

// ===== 11: the admin check =====

group('11: admin routes', [
  ['11 a plain account cannot list the accounts', async (app) => {
    const u = await mk(app);
    const other = await mk(app);
    const r = await request(app, 'GET', '/admin/users', { token: u.token });
    ok(!r.text.includes(`${other.name}@example.com`) && !r.text.includes('admin@localhost'), `the list came back (${r.status})`);
    ok(denied(r), `the answer was ${r.status}`);
  }],
  ['11 a visitor cannot list the accounts', async (app) => {
    await mk(app);
    const r = await request(app, 'GET', '/admin/users');
    ok(denied(r) && !r.text.includes('@example.com'), `the answer was ${r.status}`);
  }],
  ['11 a plain account cannot make itself an admin through the role route', async (app) => {
    const u = await mk(app);
    await request(app, 'POST', `/admin/users/${u.id}/role`, { token: u.token, json: { role: 'admin' } });
    ok(denied(await request(app, 'GET', '/admin/stats', { token: u.token })), 'the account became an admin');
  }],
]);

// ===== 12: sessions end =====

group('12: sessions end', [
  ['12 after log-out the token is refused', async (app) => {
    const u = await mk(app);
    ok((await request(app, 'GET', '/me', { token: u.token })).status === 200, 'the token did not work before log-out');
    ok((await request(app, 'POST', '/logout', { token: u.token })).status === 204, 'log-out was not 204');
    const r = await request(app, 'GET', '/me', { token: u.token });
    ok(denied(r), `the token answered ${r.status} after log-out`);
    const w = await request(app, 'POST', '/files?name=late.txt', { token: u.token, body: 'x' });
    ok(denied(w), `an upload with the token answered ${w.status} after log-out`);
  }],
  ['12 after a password change every old token is refused, and the new one works', async (app) => {
    const u = await mk(app);
    const second = await logIn(app, u.name);
    const r = await request(app, 'POST', '/me/password', { token: u.token, json: { current: PASSWORD, password: 'changed-pass-1' } });
    ok(r.status === 200, `the change answered ${r.status}`);
    ok(denied(await request(app, 'GET', '/me', { token: u.token })), 'the token used for the change still works');
    ok(denied(await request(app, 'GET', '/me', { token: second })), 'another session still works');
    ok((await request(app, 'GET', '/me', { token: r.json.token })).status === 200, 'the new token does not work');
  }],
  ['12 after a reset every old token is refused', async (app) => {
    const u = await mk(app);
    await request(app, 'POST', '/reset', { json: { name: u.name } });
    const [code] = await mailCodes(app, u.name);
    ok((await request(app, 'POST', '/reset/confirm', { json: { name: u.name, code, password: 'reset-pass-12' } })).status === 204, 'the reset failed');
    ok(denied(await request(app, 'GET', '/me', { token: u.token })), 'a token from before the reset still works');
    const fresh = await logIn(app, u.name, 'reset-pass-12');
    ok((await request(app, 'GET', '/me', { token: fresh })).status === 200, 'a new token does not work');
  }],
  ['12 a token that ended does not come back when the account logs in again', async (app) => {
    const u = await mk(app);
    await request(app, 'POST', '/logout', { token: u.token });
    const again = await logIn(app, u.name);
    ok((await request(app, 'GET', '/me', { token: again })).status === 200, 'the new session does not work');
    ok(denied(await request(app, 'GET', '/me', { token: u.token })), 'the old token works again');
  }],
]);

// ===== 13: the upload limit =====

group('13: the 10 MB upload limit', [
  ['13 a file of 10 MB and one byte is refused and not kept', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'POST', '/files?name=toobig.bin', { token: u.token, body: Buffer.alloc(MB10 + 1, 1) });
    ok(!(r.status >= 200 && r.status < 300), `the upload answered ${r.status}`);
    await notKept(app, u, 'toobig.bin');
  }],
  ['13 a file of 11 MB sent in chunks without a length is refused and not kept', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'POST', '/files?name=chunked.bin', { token: u.token, body: Buffer.alloc(11 * 1024 * 1024, 2), chunked: true });
    ok(!(r.status >= 200 && r.status < 300), `the upload answered ${r.status}`);
    await notKept(app, u, 'chunked.bin');
  }],
  ['13 a file of 50 MB is refused and the server stays up', async (app) => {
    const u = await mk(app);
    const r = await request(app, 'POST', '/files?name=huge.bin', { token: u.token, body: Buffer.alloc(50 * 1024 * 1024, 3) });
    ok(!(r.status >= 200 && r.status < 300), `the upload answered ${r.status}`);
    await notKept(app, u, 'huge.bin');
    await stillAnswers(app, 'a 50 MB upload');
  }],
]);

async function notKept(app, u, name) {
  const list = await request(app, 'GET', '/files', { token: u.token });
  ok(list.status === 200 && !list.json.some((f) => f.name === name), 'the file is in the list');
  ok((await getFile(app, u.token, name)).status === 404, 'the file can be downloaded');
  const big = fs.existsSync(path.join(app.dataDir, 'files')) ? walk(path.join(app.dataDir, 'files')).filter((f) => fs.statSync(path.join(app.dataDir, 'files', f)).size > MB10) : [];
  ok(big.length === 0, `a file over 10 MB is on disk: ${big.join(', ')}`);
}

// ===== the tests and the write-up =====

const single = (name, fn) => groups.push({ name, cases: [[name, fn]], noServer: true });

single('the tests in the folder still pass (node --test)', async () => {
  const r = await new Promise((resolve) => {
    execFile(process.execPath, ['--test'], { cwd: WORK, timeout: 240000, maxBuffer: 16 << 20, env: { ...process.env, CUDA_VISIBLE_DEVICES: '', NODE_OPTIONS: '' } }, (err, stdout, stderr) => {
      resolve({ status: err ? (err.code ?? err.signal ?? 1) : 0, stdout, stderr });
    });
  });
  const tail = `${r.stdout}${r.stderr}`.split('\n').filter((l) => /^# (tests|pass|fail)/.test(l)).join(' ');
  ok(r.status === 0, `node --test ended with ${r.status}: ${tail}`);
  const m = /# tests (\d+)/.exec(r.stdout);
  ok(m && Number(m[1]) >= 5, `only ${m?.[1] ?? 0} tests ran`);
});

single('SECURITY-REVIEW.md exists and says something', async () => {
  const file = path.join(WORK, 'SECURITY-REVIEW.md');
  ok(fs.existsSync(file), 'SECURITY-REVIEW.md is missing');
  const text = fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').trim();
  ok(text.length >= 300, `SECURITY-REVIEW.md has only ${text.length} characters`);
});

// ---------- running ----------

// Each group runs with a service of its own; three groups run at a time.
async function runGroup(g) {
  const out = [];
  let app = null;
  let startError = null;
  for (const [name, fn] of g.cases) {
    const started = Date.now();
    try {
      if (!g.noServer) {
        if (startError) throw startError;
        if (!app || !(await healthy(app))) {
          if (app) await app.stop();
          app = null;
          try {
            app = await startApp();
          } catch (e) {
            startError = e;
            throw e;
          }
        }
      }
      app?.setClock(0);
      await fn(app);
      out.push({ name, ok: true, ms: Date.now() - started });
    } catch (e) {
      out.push({ name, ok: false, ms: Date.now() - started, why: String(e.message ?? e).slice(0, 400) });
    }
  }
  if (app) await app.stop();
  return out;
}

const done = groups.map(() => null);
let cursor = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (cursor < groups.length) {
      const i = cursor++;
      done[i] = await runGroup(groups[i]);
    }
  }),
);
const results = done.flat();

if (VERBOSE) for (const r of results) console.error(`${r.ok ? 'pass' : 'FAIL'} ${String(r.ms).padStart(6)} ms  ${r.name}${r.ok ? '' : `\n      ${r.why}`}`);
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, total: results.length, failed: results.filter((r) => !r.ok).map((r) => r.name) }));
