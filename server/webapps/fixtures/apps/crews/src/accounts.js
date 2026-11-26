// Accounts and signing in. Passwords are kept only as scrypt hashes, sessions only as hashes of the cookie.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import * as input from './input.js';
import { refuse } from './input.js';

const derive = promisify(scrypt);
export const SESSION_DAYS = 30;
const MAX_FAILURES = 10;
const WINDOW = 15 * 60 * 1000;

async function hashPassword(password, salt = randomBytes(16)) {
  const key = await derive(password, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function passwordMatches(password, stored) {
  const [salt, key] = stored.split(':');
  const given = await derive(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(given, Buffer.from(key, 'hex'));
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function accounts(db) {
  const failures = new Map();
  const noSuchUser = hashPassword(randomBytes(16).toString('hex'));

  function startSession(userId) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
      hashToken(token), userId, Date.now() + SESSION_DAYS * 86400000);
    return token;
  }

  return {
    async signUp(body) {
      const name = input.text(body.name, 'Your name', { required: true, max: 100 });
      const email = input.email(body.email);
      const password = body.password;
      if (typeof password !== 'string' || password.length < 8) refuse(400, 'The password must be at least 8 characters.');
      if (password.length > 200) refuse(400, 'The password is too long.');
      const hash = await hashPassword(password);
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
        refuse(409, 'There is already an account with that email. Sign in instead.');
      }
      const added = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email, hash);
      const user = { id: Number(added.lastInsertRowid), name, email };
      return { user, token: startSession(user.id) };
    },

    // Wrong guesses are counted for each pair of visitor address and email.
    async signIn(body, address) {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
      if (!email || !password) refuse(400, 'Give your email and password.');
      const key = `${address} ${email}`;
      const now = Date.now();
      for (const [k, v] of failures) if (now - v.since > WINDOW) failures.delete(k);
      const seen = failures.get(key) ?? { count: 0, since: now };
      if (seen.count >= MAX_FAILURES) refuse(429, 'Too many wrong tries. Wait 15 minutes and try again.');
      // Counted before the slow check, so that many tries at once cannot slip past the limit.
      seen.count += 1;
      failures.set(key, seen);
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      const good = await passwordMatches(password, row ? row.password : await noSuchUser);
      if (!row || !good) refuse(401, 'That email and password do not match.');
      failures.delete(key);
      return { user: { id: row.id, name: row.name, email: row.email }, token: startSession(row.id) };
    },

    userFor(token) {
      if (!token) return null;
      const row = db.prepare(`SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`).get(hashToken(token), Date.now());
      return row ? { ...row } : null;
    },

    signOut(token) {
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    },
  };
}
