// Ash Physiotherapy: half-hour appointments. The owner gives the hours of each weekday and the days off; visitors book a free slot without an account; a slot is booked once, whatever the timing.
// Times are written as the clock on the wall in the UK, in summer and in winter. Written by hand with Express's calls (lite.js has them) and SQLite.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('./lite.js');
const Database = require('better-sqlite3');

const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error('SESSION_SECRET is not set');
fs.mkdirSync(dataDir, { recursive: true });

const SLOT_MINUTES = 30;
const db = new Database(path.join(dataDir, 'booking.db'));
db.pragma('journal_mode = WAL');
const { personOf, needPerson, routes, emailOf } = require('./auth.js')(db, secret, false);
db.exec(`
  CREATE TABLE IF NOT EXISTS hours (id INTEGER PRIMARY KEY, weekday TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS daysoff (id INTEGER PRIMARY KEY, date TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, UNIQUE (date, time));
`);

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const text = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const bad = (res, message) => res.status(400).json({ error: message });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Every slot of a day from the hours of its weekday, none on a day off, and without the ones booked. */
function freeSlots(date) {
  if (db.prepare('SELECT 1 FROM daysoff WHERE date = ?').get(date)) return [];
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const all = [];
  for (const h of db.prepare('SELECT * FROM hours WHERE weekday = ?').all(weekday)) for (let m = minutes(h.start); m + SLOT_MINUTES <= minutes(h.end); m += SLOT_MINUTES) all.push(clock(m));
  const taken = new Set(db.prepare('SELECT time FROM bookings WHERE date = ?').all(date).map((r) => r.time));
  return [...new Set(all)].filter((t) => !taken.has(t)).sort();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use((err, _req, res, next) => (err ? bad(res, 'That could not be read.') : next()));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
routes(app);
const owner = (req, res, next) => needPerson(req, res, () => (req.person.role === 'owner' ? next() : res.status(403).json({ error: 'Only the owner does this.' })));

// ---- the owner's hours and days off (anyone may read them: the page says them)
app.get('/api/hours', (_req, res) => res.json({ rows: db.prepare('SELECT * FROM hours ORDER BY id').all().map((r) => ({ id: String(r.id), weekday: r.weekday, start: r.start, end: r.end })) }));
app.post('/api/hours', owner, (req, res) => {
  const { weekday, start, end } = req.body;
  if (!WEEKDAYS.includes(weekday)) return bad(res, 'The weekday is monday, tuesday, and so on.');
  if (!isTime(start) || !isTime(end) || minutes(end) <= minutes(start)) return bad(res, 'The hours need a start and a later end, written like 09:00.');
  const info = db.prepare('INSERT INTO hours (weekday, start, end) VALUES (?, ?, ?)').run(weekday, start, end);
  res.status(201).json({ id: String(info.lastInsertRowid) });
});
app.get('/api/daysoff', (_req, res) => res.json({ rows: db.prepare('SELECT * FROM daysoff ORDER BY id').all().map((r) => ({ id: String(r.id), date: r.date })) }));
app.post('/api/daysoff', owner, (req, res) => {
  if (!isDay(req.body.date)) return bad(res, 'A day off is a real day, written like 2031-07-21.');
  const info = db.prepare('INSERT INTO daysoff (date) VALUES (?)').run(req.body.date);
  res.status(201).json({ id: String(info.lastInsertRowid) });
});

// ---- the free slots, and booking one
app.get('/api/slots', (req, res) => {
  if (!isDay(req.query.date)) return bad(res, 'Give a day, written like 2031-07-14.');
  res.json({ slots: freeSlots(req.query.date).map((time) => ({ time })) });
});

app.post('/api/book', (req, res) => {
  const { date, time } = req.body;
  const name = text(req.body.name, 200);
  const email = emailOf(req.body.email);
  if (!isDay(date)) return bad(res, 'Pick a day, written like 2031-07-14.');
  if (!name) return bad(res, 'Please give your name.');
  if (!email) return bad(res, 'Please give an email address we can write to.');
  if (!isTime(time) || !freeSlots(date).includes(time)) return res.status(409).json({ error: 'That time is not a free appointment.' });
  try {
    const info = db.prepare('INSERT INTO bookings (date, time, name, email) VALUES (?, ?, ?, ?)').run(date, time, name, email);
    res.status(201).json({ id: String(info.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'That appointment has just been taken.' });
  }
});

app.get('/api/bookings', owner, (_req, res) => res.json({ rows: db.prepare('SELECT * FROM bookings ORDER BY date, time').all().map((r) => ({ id: String(r.id), name: r.name, email: r.email, date: r.date, time: r.time })) }));
app.delete('/api/bookings/:id', owner, (req, res) => {
  const info = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  return info.changes ? res.json({ removed: true }) : res.status(404).json({ error: 'There is no such booking.' });
});

// ---- the pages
const layout = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ash Physiotherapy</title><link rel="stylesheet" href="/style.css"></head><body><main>${body}</main></body></html>`;
app.get('/', (_req, res) => res.send(layout('<h1>Ash Physiotherapy</h1><p>Physiotherapy appointments in Harrogate. Appointments are half an hour. <a href="/book">Book one</a>: no account needed.</p>')));
app.get('/book', (req, res) => {
  const date = isDay(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
  const slots = freeSlots(date);
  res.send(layout(`<h1>Book an appointment</h1><form method="get"><label>Day <input name="date" type="date" value="${esc(date)}"></label> <button>Show</button></form>
<h2>${esc(date)}</h2>${slots.length === 0 ? '<p>Nothing is free that day.</p>' : `<ul>${slots.map((t) => `<li>${t}</li>`).join('')}</ul>`}`));
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
void personOf;
