// Quayside Rowing Club: members' own details, notices for members who have paid this month, and the card payment service's word that someone has paid. Written by hand with Express's calls (lite.js has them) and SQLite.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('./lite.js');
const Database = require('better-sqlite3');

const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const secret = process.env.SESSION_SECRET;
const paymentSecret = process.env.PAYMENT_SECRET;
if (!secret) throw new Error('SESSION_SECRET is not set');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'club.db'));
db.pragma('journal_mode = WAL');
const { personOf, needPerson, routes, emailOf } = require('./auth.js')(db, secret, true);
db.exec(`
  CREATE TABLE IF NOT EXISTS details (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, full_name TEXT NOT NULL, phone TEXT, emergency TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, author_id INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS payments (user_id INTEGER NOT NULL, month TEXT NOT NULL, PRIMARY KEY (user_id, month));
`);

const month = () => new Date().toISOString().slice(0, 7);
const hasPaid = (userId) => !!db.prepare('SELECT 1 FROM payments WHERE user_id = ? AND month = ?').get(userId, month());
const text = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const absent = (v) => v === undefined || v === null || v === '';
const bad = (res, message) => res.status(400).json({ error: message });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use((err, _req, res, next) => (err ? bad(res, 'That could not be read.') : next()));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
routes(app);

// ---- the owner gives the helpers their roles, and nobody else gives any
app.post('/api/grant', needPerson, (req, res) => {
  if (req.person.role !== 'owner') return res.status(403).json({ error: 'Only the chair gives people their roles.' });
  const role = req.body.role;
  const email = emailOf(req.body.email);
  if (!['treasurer', 'coach'].includes(role)) return bad(res, 'A role is treasurer or coach.');
  const user = email && db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'There is no member with that email address.' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  res.json({ ok: true });
});

// ---- a member's own details: the chair and the treasurer see everybody's, the chair changes anybody's
const shape = (r) => ({ id: String(r.id), fullName: r.full_name, phone: r.phone, emergency: r.emergency, paid: hasPaid(r.owner_id) });
const seesAll = (p) => p.role === 'owner' || p.role === 'treasurer';

function readDetails(body) {
  const fullName = text(body.fullName, 200);
  const emergency = text(body.emergency, 300);
  if (!fullName) return { error: 'Please give your full name.' };
  if (!emergency) return { error: 'Please say who to ring in an emergency.' };
  if (!absent(body.phone) && !text(body.phone, 60)) return { error: 'The phone number is too long or not text.' };
  return { value: [fullName, absent(body.phone) ? null : text(body.phone, 60), emergency] };
}

app.get('/api/details', needPerson, (req, res) => {
  const rows = seesAll(req.person) ? db.prepare('SELECT * FROM details ORDER BY id DESC').all() : db.prepare('SELECT * FROM details WHERE owner_id = ? ORDER BY id DESC').all(req.person.id);
  res.json({ rows: rows.map(shape) });
});
app.post('/api/details', needPerson, (req, res) => {
  const read = readDetails(req.body);
  if (read.error) return bad(res, read.error);
  const info = db.prepare('INSERT INTO details (owner_id, full_name, phone, emergency) VALUES (?, ?, ?, ?)').run(req.person.id, ...read.value);
  res.status(201).json({ id: String(info.lastInsertRowid) });
});
const visible = (req) => {
  const row = db.prepare('SELECT * FROM details WHERE id = ?').get(req.params.id);
  return row && (seesAll(req.person) || row.owner_id === req.person.id) ? row : null;
};
app.get('/api/details/:id', needPerson, (req, res) => {
  const row = visible(req);
  return row ? res.json(shape(row)) : res.status(404).json({ error: 'There are no such details.' });
});
app.patch('/api/details/:id', needPerson, (req, res) => {
  const row = visible(req);
  if (!row) return res.status(404).json({ error: 'There are no such details.' });
  if (row.owner_id !== req.person.id && req.person.role !== 'owner') return res.status(403).json({ error: 'Only the member and the chair change these details.' });
  const read = readDetails({ fullName: row.full_name, phone: row.phone, emergency: row.emergency, ...req.body });
  if (read.error) return bad(res, read.error);
  db.prepare('UPDATE details SET full_name = ?, phone = ?, emergency = ? WHERE id = ?').run(...read.value, row.id);
  res.json(shape(db.prepare('SELECT * FROM details WHERE id = ?').get(row.id)));
});

// ---- the page the chair and the treasurer see: every member, and whether they have paid this month
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
app.get('/members', (req, res) => {
  const person = personOf(req);
  if (!person) return res.status(401).send(page('Members', '<p>Please sign in first.</p>'));
  if (!seesAll(person)) return res.status(403).send(page('Members', '<p>Only the chair and the treasurer see this page.</p>'));
  const rows = db.prepare('SELECT * FROM details ORDER BY id').all();
  res.send(page('Members', `<h1>Members</h1><table>${rows.map((r) => `<tr><td>${escape(r.full_name)}</td><td>${escape(r.phone || '')}</td><td>${escape(r.emergency)}</td><td>Paid this month: ${hasPaid(r.owner_id) ? 'yes' : 'no'}</td></tr>`).join('')}</table>`));
});

// ---- notices: the coach and the chair post; helpers and members who have paid this month read
const notice = (r) => ({ id: String(r.id), title: r.title, message: r.message });
const mayRead = (p) => p.role !== 'member' || hasPaid(p.id);
app.get('/api/notices', needPerson, (req, res) => {
  if (!mayRead(req.person)) return res.status(403).json({ error: 'Notices are for members who have paid this month.' });
  res.json({ rows: db.prepare('SELECT * FROM notices ORDER BY id DESC').all().map(notice) });
});
app.post('/api/notices', needPerson, (req, res) => {
  if (!['owner', 'coach'].includes(req.person.role)) return res.status(403).json({ error: 'Only the coach and the chair post notices.' });
  const title = text(req.body.title, 200);
  const message = text(req.body.message, 10_000);
  if (!title) return bad(res, 'A notice needs a title.');
  if (!message) return bad(res, 'A notice needs a message.');
  const info = db.prepare('INSERT INTO notices (title, message, author_id) VALUES (?, ?, ?)').run(title, message, req.person.id);
  res.status(201).json({ id: String(info.lastInsertRowid) });
});
app.get('/api/notices/:id', needPerson, (req, res) => {
  const row = mayRead(req.person) ? db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id) : null;
  return row ? res.json(notice(row)) : res.status(404).json({ error: 'There is no such notice.' });
});

// ---- the card payment service tells the app that a person has paid for a month; it is believed only with the shared secret
app.post('/api/payments/webhook', (req, res) => {
  const given = Buffer.from(String(req.headers['x-webhook-secret'] || ''));
  const want = Buffer.from(paymentSecret || '');
  if (!paymentSecret || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'The payment service did not give the right secret.' });
  const email = emailOf(req.body.email);
  if (!email || typeof req.body.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(req.body.month)) return bad(res, 'The call needs the member\'s email address and the month, written like 2027-05.');
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'There is no member with that email address.' });
  db.prepare('INSERT OR IGNORE INTO payments (user_id, month) VALUES (?, ?)').run(user.id, req.body.month);
  res.json({ ok: true });
});

// ---- the public page
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/style.css"></head><body><main>${body}</main></body></html>`;
app.get('/', (_req, res) =>
  res.send(
    page(
      'Quayside Rowing Club',
      `<h1>Quayside Rowing Club</h1>
<p>We are a friendly rowing club in Bristol. We row on Bristol harbour from Hotwells, in boats for every level, and new members are welcome.</p>
<p>The subscription is £15 a month, paid by card. Make an account to join, put in your details, and pay for the month to read the club's notices about outings and training.</p>
<p><a href="/members">Members</a> (for the chair and the treasurer)</p>`,
    ),
  ),
);

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
