// Hatch End Kiln Share: a waiting list page, written by hand with Express's calls (lite.js has them) and SQLite, as the maker's words say it: a name (needed) and what they would fire (not needed), no email. The first person to make an account is the owner, and nobody else can.
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

const db = new Database(path.join(dataDir, 'kiln.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS signups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, what_for TEXT, created_at TEXT NOT NULL);
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
const text = (value, max) => (typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null);
const emailOf = (value) => (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 200 ? value.trim() : null);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/sign-up', (req, res) => {
  const email = emailOf(req.body.email);
  const name = text(req.body.name, 200);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !name || password.length < 8) return res.status(400).json({ error: 'Give a name, an email address and a password of at least 8 characters.' });
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return res.status(403).json({ error: 'Sign-up is closed: only the owner has an account.' });
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

// ---- the waiting list: anyone adds, only the owner reads
const shape = (r) => ({ id: String(r.id), name: r.name, whatFor: r.what_for, createdAt: r.created_at });

app.post('/api/signups', (req, res) => {
  const name = text(req.body.name, 200);
  const whatFor = req.body.whatFor === undefined || req.body.whatFor === null || req.body.whatFor === '' ? null : text(req.body.whatFor, 2000);
  if (!name) return res.status(400).json({ error: 'Please give your name.' });
  if (req.body.whatFor && !whatFor) return res.status(400).json({ error: 'What you would like to fire is too long or not text.' });
  const info = db.prepare('INSERT INTO signups (name, what_for, created_at) VALUES (?, ?, ?)').run(name, whatFor, new Date().toISOString());
  if (/text\/html/.test(req.headers.accept || '') && !/json/.test(req.headers['content-type'] || '')) return res.status(201).send(page('Thank you', '<p>You are on the list. We will write to you the day the kiln opens.</p>'));
  res.status(201).json({ id: String(info.lastInsertRowid) });
});

app.get('/api/signups', needPerson, (_req, res) => res.json({ rows: db.prepare('SELECT * FROM signups ORDER BY id DESC').all().map(shape) }));

app.get('/api/signups/:id', needPerson, (req, res) => {
  const row = db.prepare('SELECT * FROM signups WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'There is no such entry.' });
  res.json(shape(row));
});

app.delete('/api/signups/:id', needPerson, (req, res) => {
  const info = db.prepare('DELETE FROM signups WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'There is no such entry.' });
  res.json({ removed: true });
});

// ---- the page
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/style.css"></head><body><main>${body}</main></body></html>`;
}

app.get('/', (_req, res) => {
  res.send(
    page(
      'Hatch End Kiln Share',
      `<h1>Hatch End Kiln Share</h1>
<p>Our big electric kiln sits empty half the week. We would like to open it to potters who make pots at home and have nowhere to fire them: book a shelf in one of our firings.</p>
<ul>
  <li>We fire about every second Thursday.</li>
  <li>A shelf costs £18.</li>
  <li>There is room for twelve shelves each time.</li>
</ul>
<p>It is not open yet, because the insurance is still being sorted. Put your name down and you are on the list for the day it opens.</p>
<form method="post" action="/api/signups">
  <label>Your name <input name="name" required maxlength="200"></label>
  <label>What would you like to fire? (if you know) <textarea name="whatFor" rows="3" maxlength="2000"></textarea></label>
  <button>Put your name down</button>
</form>`,
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
