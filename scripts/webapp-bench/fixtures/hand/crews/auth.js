// Accounts and sessions for the hand-written reference apps of the larger briefs: a password kept as a salted scrypt hash, a session kept in a signed cookie, and the first person
// to make an account is the owner. `open` says whether anyone else may make one.
'use strict';
const crypto = require('node:crypto');

module.exports = function auth(db, secret, open) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member');
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
  `);
  const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');
  const sign = (token) => crypto.createHmac('sha256', secret).update(token).digest('hex');
  const emailOf = (v) => (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.trim().length <= 200 ? v.trim().toLowerCase() : null);
  const nameOf = (v) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 200 ? v.trim() : null);

  function personOf(req) {
    const raw = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie || '');
    if (!raw) return null;
    const [token, mac] = decodeURIComponent(raw[1]).split('.');
    if (!token || !mac || mac !== sign(token)) return null;
    return db.prepare('SELECT users.id, users.email, users.name, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?').get(token) || null;
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

  function routes(app) {
    app.post('/api/sign-up', (req, res) => {
      const email = emailOf(req.body.email);
      const name = nameOf(req.body.name);
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      if (!email || !name || password.length < 8) return res.status(400).json({ error: 'Give a name, an email address and a password of at least 8 characters.' });
      const first = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
      if (!first && !open) return res.status(403).json({ error: 'Sign-up is closed: only the owner has an account.' });
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(400).json({ error: 'There is already an account with that email address.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const info = db.prepare('INSERT INTO users (email, name, salt, hash, role) VALUES (?, ?, ?, ?, ?)').run(email, name, salt, hashPassword(password, salt), first ? 'owner' : 'member');
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
  }

  return { personOf, needPerson, routes, emailOf, nameOf };
};
