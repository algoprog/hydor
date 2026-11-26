// Kovač Translations: a freelance translator's clients and jobs, written by hand with Express's calls (lite.js has them) and SQLite. Anyone can make an account; each person sees only their own clients and jobs.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('./lite.js');
const Database = require('better-sqlite3');

const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error('SESSION_SECRET is not set');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'desk.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, name TEXT NOT NULL, country TEXT, notes TEXT);
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id),
    title TEXT NOT NULL, words INTEGER NOT NULL, fee_cents INTEGER NOT NULL, due TEXT NOT NULL, delivered_on TEXT, source_file TEXT
  );
`);

// ---- who is asking
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');
const sign = (token) => crypto.createHmac('sha256', secret).update(token).digest('hex');

function personOf(req) {
  const raw = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie || '');
  if (!raw) return null;
  const [token, mac] = decodeURIComponent(raw[1]).split('.');
  if (!token || !mac || mac !== sign(token)) return null;
  return db.prepare('SELECT users.id, users.email, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?').get(token) || null;
}

function startSession(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  res.cookie('sid', `${token}.${sign(token)}`, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000, path: '/' });
}

const needPerson = (req, res, next) => {
  req.person = personOf(req);
  if (!req.person) return res.status(401).json({ error: 'Please sign in first.' });
  next();
};

// ---- checking what people send
const text = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const emailOf = (v) => (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.trim().length <= 200 ? v.trim() : null);
const absent = (v) => v === undefined || v === null || v === '';
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const isWhole = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000_000;
const isMoney = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1_000_000 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const bad = (res, message) => res.status(400).json({ error: message });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use((err, _req, res, next) => (err ? bad(res, 'That could not be read.') : next()));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/sign-up', (req, res) => {
  const email = emailOf(req.body.email);
  const name = text(req.body.name, 200);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !name || password.length < 8) return bad(res, 'Give a name, an email address and a password of at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase())) return bad(res, 'There is already an account with that email address.');
  const salt = crypto.randomBytes(16).toString('hex');
  const info = db.prepare('INSERT INTO users (email, name, salt, hash) VALUES (?, ?, ?, ?)').run(email.toLowerCase(), name, salt, hashPassword(password, salt));
  startSession(res, info.lastInsertRowid);
  res.json({ ok: true });
});

app.post('/api/sign-in', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(req.body.email || '').trim().toLowerCase());
  const given = typeof req.body.password === 'string' ? req.body.password : '';
  const ok = user && crypto.timingSafeEqual(Buffer.from(hashPassword(given, user.salt), 'hex'), Buffer.from(user.hash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'That email and password do not match.' });
  startSession(res, user.id);
  res.json({ ok: true });
});

// ---- clients
const client = (r) => ({ id: String(r.id), name: r.name, country: r.country, notes: r.notes });

function readClient(body) {
  const name = text(body.name, 200);
  if (!name) return { error: 'A client needs a name.' };
  if (!absent(body.country) && !text(body.country, 200)) return { error: 'The country is too long or not text.' };
  if (!absent(body.notes) && !text(body.notes, 10_000)) return { error: 'The notes are too long or not text.' };
  return { value: [name, absent(body.country) ? null : text(body.country, 200), absent(body.notes) ? null : text(body.notes, 10_000)] };
}

app.get('/api/clients', needPerson, (req, res) => res.json({ rows: db.prepare('SELECT * FROM clients WHERE owner_id = ? ORDER BY id DESC').all(req.person.id).map(client) }));
app.post('/api/clients', needPerson, (req, res) => {
  const read = readClient(req.body);
  if (read.error) return bad(res, read.error);
  const info = db.prepare('INSERT INTO clients (owner_id, name, country, notes) VALUES (?, ?, ?, ?)').run(req.person.id, ...read.value);
  res.status(201).json({ id: String(info.lastInsertRowid) });
});
const ownClient = (req) => db.prepare('SELECT * FROM clients WHERE id = ? AND owner_id = ?').get(req.params.id, req.person.id);
app.get('/api/clients/:id', needPerson, (req, res) => {
  const row = ownClient(req);
  return row ? res.json(client(row)) : res.status(404).json({ error: 'There is no such client.' });
});
app.put('/api/clients/:id', needPerson, (req, res) => {
  if (!ownClient(req)) return res.status(404).json({ error: 'There is no such client.' });
  const read = readClient(req.body);
  if (read.error) return bad(res, read.error);
  db.prepare('UPDATE clients SET name = ?, country = ?, notes = ? WHERE id = ? AND owner_id = ?').run(...read.value, req.params.id, req.person.id);
  res.json(client(ownClient(req)));
});
app.delete('/api/clients/:id', needPerson, (req, res) => {
  if (!ownClient(req)) return res.status(404).json({ error: 'There is no such client.' });
  if (db.prepare('SELECT 1 FROM jobs WHERE client_id = ?').get(req.params.id)) return bad(res, 'This client still has jobs: remove those first.');
  db.prepare('DELETE FROM clients WHERE id = ? AND owner_id = ?').run(req.params.id, req.person.id);
  res.json({ removed: true });
});

// ---- jobs: the fee is in euros in what people send and is kept in cents
const job = (r) => ({ id: String(r.id), clientId: String(r.client_id), title: r.title, words: r.words, fee: r.fee_cents / 100, due: r.due, deliveredOn: r.delivered_on, sourceFile: r.source_file });

function readJob(req) {
  const b = req.body;
  const clientRow = typeof b.clientId === 'string' || typeof b.clientId === 'number' ? db.prepare('SELECT id FROM clients WHERE id = ? AND owner_id = ?').get(String(b.clientId), req.person.id) : null;
  if (!clientRow) return { error: 'Pick one of your own clients for the job.' };
  const title = text(b.title, 200);
  if (!title) return { error: 'A job needs a title.' };
  if (!isWhole(b.words)) return { error: 'The number of words must be a whole number.' };
  if (!isMoney(b.fee)) return { error: 'The fee must be an amount in euros, like 120 or 72.50.' };
  if (!isDay(b.due)) return { error: 'The due day must be a real day written like 2027-03-31.' };
  if (!absent(b.deliveredOn) && !isDay(b.deliveredOn)) return { error: 'The day it was delivered must be a real day written like 2027-03-31.' };
  if (!absent(b.sourceFile) && !text(b.sourceFile, 500)) return { error: 'The source file is not a name.' };
  return { value: [clientRow.id, title, b.words, Math.round(b.fee * 100), b.due, absent(b.deliveredOn) ? null : b.deliveredOn, absent(b.sourceFile) ? null : b.sourceFile] };
}

app.get('/api/jobs', needPerson, (req, res) => res.json({ rows: db.prepare('SELECT * FROM jobs WHERE owner_id = ? ORDER BY id DESC').all(req.person.id).map(job) }));
app.post('/api/jobs', needPerson, (req, res) => {
  const read = readJob(req);
  if (read.error) return bad(res, read.error);
  const info = db.prepare('INSERT INTO jobs (owner_id, client_id, title, words, fee_cents, due, delivered_on, source_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(req.person.id, ...read.value);
  res.status(201).json({ id: String(info.lastInsertRowid) });
});
const ownJob = (req) => db.prepare('SELECT * FROM jobs WHERE id = ? AND owner_id = ?').get(req.params.id, req.person.id);
app.get('/api/jobs/:id', needPerson, (req, res) => {
  const row = ownJob(req);
  return row ? res.json(job(row)) : res.status(404).json({ error: 'There is no such job.' });
});
app.put('/api/jobs/:id', needPerson, (req, res) => {
  if (!ownJob(req)) return res.status(404).json({ error: 'There is no such job.' });
  const read = readJob(req);
  if (read.error) return bad(res, read.error);
  db.prepare('UPDATE jobs SET client_id = ?, title = ?, words = ?, fee_cents = ?, due = ?, delivered_on = ?, source_file = ? WHERE id = ? AND owner_id = ?').run(...read.value, req.params.id, req.person.id);
  res.json(job(ownJob(req)));
});
app.delete('/api/jobs/:id', needPerson, (req, res) => {
  if (!ownJob(req)) return res.status(404).json({ error: 'There is no such job.' });
  db.prepare('DELETE FROM jobs WHERE id = ? AND owner_id = ?').run(req.params.id, req.person.id);
  res.json({ removed: true });
});

// ---- pages
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/style.css"></head><body><main>${body}</main></body></html>`;

app.get('/', (_req, res) => res.send(page('Kovač Translations', '<h1>Kovač Translations</h1><p>My clients and my jobs, German and Croatian into English. Sign in to see yours.</p>')));

app.get('/home', (req, res) => {
  const person = personOf(req);
  if (!person) return res.redirect('/');
  const day = new Date().toISOString().slice(0, 10);
  const first = `${day.slice(0, 7)}-01`;
  const next = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const invoiced = db.prepare('SELECT COALESCE(SUM(fee_cents), 0) AS cents FROM jobs WHERE owner_id = ? AND delivered_on >= ? AND delivered_on < ?').get(person.id, first, next).cents;
  const open = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE owner_id = ? AND delivered_on IS NULL').get(person.id).n;
  const average = db.prepare('SELECT AVG(words) AS avg FROM jobs WHERE owner_id = ?').get(person.id).avg || 0;
  res.send(
    page(
      'Kovač Translations',
      `<h1>Your desk</h1>
<nav><a href="/clients">Clients</a> · <a href="/jobs">Jobs</a></nav>
<dl>
  <dt>Invoiced this month</dt><dd>€${(invoiced / 100).toFixed(2)}</dd>
  <dt>Jobs still open</dt><dd>${open}</dd>
  <dt>Average words per job</dt><dd>${Math.round(average)}</dd>
</dl>`,
    ),
  );
});

const server = app.listen(port, () => console.log(`listening on ${port}`));
const stop = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
