// Kestrel Crews: each crew sees only its own customers, jobs and notes; people join a crew by an invitation link and may be in two; a lead can take a person out, and it takes effect on the next request.
// Written by hand with Express's calls (lite.js has them) and SQLite.
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

const db = new Database(path.join(dataDir, 'crews.db'));
db.pragma('journal_mode = WAL');
const { personOf, needPerson, routes, emailOf } = require('./auth.js')(db, secret, true);
db.exec(`
  CREATE TABLE IF NOT EXISTS crews (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS members (crew_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, PRIMARY KEY (crew_id, user_id));
  CREATE TABLE IF NOT EXISTS invitations (token TEXT PRIMARY KEY, crew_id INTEGER NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, crew_id INTEGER NOT NULL, name TEXT NOT NULL, address TEXT);
  CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, crew_id INTEGER NOT NULL, title TEXT NOT NULL, day TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, crew_id INTEGER NOT NULL, title TEXT NOT NULL, text TEXT);
`);

const text = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const absent = (v) => v === undefined || v === null || v === '';
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const bad = (res, message) => res.status(400).json({ error: message });
const roleIn = (userId, crewId) => db.prepare('SELECT role FROM members WHERE crew_id = ? AND user_id = ?').get(crewId, userId)?.role ?? null;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use((err, _req, res, next) => (err ? bad(res, 'That could not be read.') : next()));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
routes(app);

// ---- crews: whoever makes one is its lead
app.post('/api/crews', needPerson, (req, res) => {
  const name = text(req.body.name, 200);
  if (!name) return bad(res, 'A crew needs a name.');
  const info = db.prepare('INSERT INTO crews (name) VALUES (?)').run(name);
  db.prepare('INSERT INTO members (crew_id, user_id, role) VALUES (?, ?, ?)').run(info.lastInsertRowid, req.person.id, 'lead');
  res.status(201).json({ id: String(info.lastInsertRowid) });
});

// ---- invitations: only a lead invites; the link works once and gives the role chosen
app.post('/api/invitations', needPerson, (req, res) => {
  const crew = Number(req.body.crew);
  const email = emailOf(req.body.email);
  const role = req.body.role;
  if (!Number.isInteger(crew) || roleIn(req.person.id, crew) === null) return res.status(404).json({ error: 'There is no such crew.' });
  if (roleIn(req.person.id, crew) !== 'lead') return res.status(403).json({ error: 'Only a lead invites people into the crew.' });
  if (!email) return bad(res, 'Give the email address of the person to invite.');
  if (!['lead', 'member'].includes(role)) return bad(res, 'A role is lead or member.');
  const token = crypto.randomBytes(18).toString('hex');
  db.prepare('INSERT INTO invitations (token, crew_id, email, role) VALUES (?, ?, ?, ?)').run(token, crew, email, role);
  res.status(201).json({ link: `/invitations/${token}` });
});

app.get('/invitations/:token', (req, res) => {
  const person = personOf(req);
  if (!person) return res.status(401).send(page('Sign in', '<p>Sign in (or make an account) and open the link again.</p>'));
  const inv = db.prepare('SELECT * FROM invitations WHERE token = ?').get(req.params.token);
  if (!inv || inv.used) return res.status(410).send(page('Used', '<p>This invitation has been used or does not exist.</p>'));
  db.prepare('UPDATE invitations SET used = 1 WHERE token = ?').run(inv.token);
  db.prepare('INSERT OR REPLACE INTO members (crew_id, user_id, role) VALUES (?, ?, ?)').run(inv.crew_id, person.id, inv.role);
  res.send(page('Welcome', '<p>You are in the crew.</p>'));
});

app.post('/api/crews/remove', needPerson, (req, res) => {
  const crew = Number(req.body.crew);
  if (!Number.isInteger(crew) || roleIn(req.person.id, crew) === null) return res.status(404).json({ error: 'There is no such crew.' });
  if (roleIn(req.person.id, crew) !== 'lead') return res.status(403).json({ error: 'Only a lead takes people out of the crew.' });
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(String(req.body.email || '').trim().toLowerCase());
  if (!user || roleIn(user.id, crew) === null) return res.status(404).json({ error: 'That person is not in the crew.' });
  db.prepare('DELETE FROM members WHERE crew_id = ? AND user_id = ?').run(crew, user.id);
  res.json({ removed: true });
});

// ---- the three kinds: a row belongs to one crew, which is the crew it was added to; people see the rows of every crew they are in
const KINDS = {
  customers: { columns: ['name', 'address'], read: (b) => (text(b.name, 200) ? { ok: [text(b.name, 200), absent(b.address) ? null : text(b.address, 5000)] } : { error: 'A customer needs a name.' }), shape: (r) => ({ name: r.name, address: r.address }) },
  jobs: {
    columns: ['title', 'day', 'done'],
    read: (b) => {
      if (!text(b.title, 200)) return { error: 'A job needs a title.' };
      if (!isDay(b.day)) return { error: 'A job needs its day, written like 2027-05-10.' };
      if (!absent(b.done) && typeof b.done !== 'boolean') return { error: 'Done is yes or no.' };
      return { ok: [text(b.title, 200), b.day, b.done ? 1 : 0] };
    },
    shape: (r) => ({ title: r.title, day: r.day, done: !!r.done }),
  },
  notes: { columns: ['title', 'text'], read: (b) => (text(b.title, 200) ? { ok: [text(b.title, 200), absent(b.text) ? null : text(b.text, 10_000)] } : { error: 'A note needs a title.' }), shape: (r) => ({ title: r.title, text: r.text }) },
};

for (const [name, kind] of Object.entries(KINDS)) {
  const mine = (userId) => db.prepare(`SELECT * FROM ${name} WHERE crew_id IN (SELECT crew_id FROM members WHERE user_id = ?) ORDER BY id DESC`).all(userId);
  const one = (req) => db.prepare(`SELECT * FROM ${name} WHERE id = ? AND crew_id IN (SELECT crew_id FROM members WHERE user_id = ?)`).get(req.params.id, req.person.id);
  const out = (r) => ({ id: String(r.id), crew: String(r.crew_id), ...kind.shape(r) });
  app.get(`/api/${name}`, needPerson, (req, res) => res.json({ rows: mine(req.person.id).map(out) }));
  app.post(`/api/${name}`, needPerson, (req, res) => {
    const crew = Number(req.body.crew);
    if (!Number.isInteger(crew) || roleIn(req.person.id, crew) === null) return res.status(403).json({ error: 'You are not in that crew.' });
    const read = kind.read(req.body);
    if (read.error) return bad(res, read.error);
    const info = db.prepare(`INSERT INTO ${name} (crew_id, ${kind.columns.join(', ')}) VALUES (?, ${kind.columns.map(() => '?').join(', ')})`).run(crew, ...read.ok);
    res.status(201).json({ id: String(info.lastInsertRowid) });
  });
  app.get(`/api/${name}/:id`, needPerson, (req, res) => {
    const row = one(req);
    return row ? res.json(out(row)) : res.status(404).json({ error: 'There is no such row.' });
  });
  app.patch(`/api/${name}/:id`, needPerson, (req, res) => {
    const row = one(req);
    if (!row) return res.status(404).json({ error: 'There is no such row.' });
    const read = kind.read({ ...kind.shape(row), ...req.body });
    if (read.error) return bad(res, read.error);
    db.prepare(`UPDATE ${name} SET ${kind.columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...read.ok, row.id);
    res.json(out(db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(row.id)));
  });
  app.delete(`/api/${name}/:id`, needPerson, (req, res) => {
    const row = one(req);
    if (!row) return res.status(404).json({ error: 'There is no such row.' });
    db.prepare(`DELETE FROM ${name} WHERE id = ?`).run(row.id);
    res.json({ removed: true });
  });
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/style.css"></head><body><main>${body}</main></body></html>`;
app.get('/', (_req, res) => res.send(page('Kestrel Crews', '<h1>Kestrel Crews</h1><p>Each crew keeps its own <a href="/customers">Customers</a>, <a href="/jobs">Jobs</a> and <a href="/notes">Notes</a>. Make an account and start a crew, or use the link a crew lead sent you.</p>')));

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
