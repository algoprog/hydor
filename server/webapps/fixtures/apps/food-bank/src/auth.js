// Accounts and sessions. The first account is the coordinator; volunteers join with the team code.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { one, all, run } from './db.js';
import { Refusal } from './rules.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const OPEN_SIGN_UP = process.env.ALLOW_SIGN_UP === '1';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function matches(password, stored) {
  const [salt, key] = stored.split(':');
  const given = await scrypt(password, Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(given, Buffer.from(key, 'hex'));
}

// No letters or digits that look like each other (0/O, 1/l/I).
const readable = (length) => {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => letters[crypto.randomInt(letters.length)]).join('');
};

export const hasUsers = () => Boolean(one('SELECT 1 FROM users LIMIT 1'));
export const needsTeamCode = () => !OPEN_SIGN_UP && hasUsers();

export function teamCode() {
  let row = one("SELECT value FROM settings WHERE key = 'team_code'");
  if (!row) {
    row = { value: readable(8) };
    run("INSERT INTO settings (key, value) VALUES ('team_code', ?)", row.value);
  }
  return row.value;
}

export function newTeamCode() {
  run("DELETE FROM settings WHERE key = 'team_code'");
  return teamCode();
}

// Slow down password and code guessing: 10 wrong tries from one address, then wait.
const WINDOW = 15 * 60 * 1000;
const tries = new Map();

function guard(key) {
  const t = tries.get(key);
  if (t && Date.now() > t.until) tries.delete(key);
  else if (t && t.count >= 10) throw new Refusal('Too many wrong tries. Please wait 15 minutes and try again.', 429);
}

function wrong(key) {
  if (tries.size > 10000) tries.clear();
  const t = tries.get(key) || { count: 0, until: Date.now() + WINDOW };
  t.count += 1;
  tries.set(key, t);
}

const cleanEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Refusal('Choose a password of at least 8 characters.');
  if (password.length > 200) throw new Refusal('That password is too long.');
  return password;
}

export async function signUp(input, address) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = cleanEmail(input.email);
  if (!name || name.length > 80) throw new Refusal('Please give your name (at most 80 characters).');
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Refusal('Please give a real email address.');
  const password = checkPassword(input.password);
  const checkCode = () => {
    if (!needsTeamCode()) return;
    const key = `code ${address}`;
    guard(key);
    const code = typeof input.code === 'string' ? input.code.replace(/[\s-]/g, '').toUpperCase() : '';
    if (code !== teamCode()) {
      wrong(key);
      throw new Refusal('You need the team code to join. Ask your coordinator for it.', 403);
    }
  };
  checkCode();
  const hash = await hashPassword(password);
  checkCode(); // again: someone else may have become the first account while we were busy
  if (one('SELECT 1 FROM users WHERE email = ?', email)) {
    throw new Refusal('There is already an account with that email. Sign in instead.', 409);
  }
  const role = hasUsers() ? 'volunteer' : 'coordinator';
  const { lastInsertRowid } = run(
    'INSERT INTO users (name, email, password, role, created_at) VALUES (?,?,?,?,?)',
    name, email, hash, role, new Date().toISOString(),
  );
  teamCode();
  return { id: Number(lastInsertRowid), name, email, role };
}

const DUMMY = await hashPassword(readable(20));

export async function signIn(input, address) {
  const email = cleanEmail(input.email);
  const password = typeof input.password === 'string' ? input.password.slice(0, 200) : '';
  if (!email || !password) throw new Refusal('Please give your email and password.');
  const key = `sign-in ${address} ${email}`;
  guard(key);
  const user = one('SELECT * FROM users WHERE email = ?', email);
  const ok = await matches(password, user ? user.password : DUMMY);
  if (!user || !ok) {
    wrong(key);
    throw new Refusal('That email and password do not match.', 401);
  }
  tries.delete(key);
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function startSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', sha(token), userId, Date.now() + SESSION_DAYS * 86400000);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export const userFor = (token) =>
  token
    ? one(
        `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
        sha(token), Date.now(),
      )
    : undefined;

export const endSession = (token) => token && run('DELETE FROM sessions WHERE token_hash = ?', sha(token));

export const team = () => all('SELECT id, name, email, role FROM users ORDER BY name COLLATE NOCASE');

function volunteer(actor, id) {
  if (actor.role !== 'coordinator') throw new Refusal('Only the coordinator can do that.', 403);
  const user = one("SELECT id, name FROM users WHERE id = ? AND role <> 'coordinator'", Number(id) || 0);
  if (!user) throw new Refusal('There is no volunteer like that.', 404);
  return user;
}

export function removeVolunteer(actor, id) {
  const user = volunteer(actor, id);
  run('DELETE FROM users WHERE id = ?', user.id);
  // They knew the code, so change it or they could simply join again.
  newTeamCode();
  return user;
}

export async function resetPassword(actor, id) {
  const user = volunteer(actor, id);
  const password = readable(10);
  run('UPDATE users SET password = ? WHERE id = ?', await hashPassword(password), user.id);
  run('DELETE FROM sessions WHERE user_id = ?', user.id);
  return { name: user.name, password };
}

export async function changePassword(user, current, next) {
  const row = one('SELECT password FROM users WHERE id = ?', user.id);
  if (!(await matches(String(current ?? '').slice(0, 200), row.password))) throw new Refusal('Your current password is not right.');
  run('UPDATE users SET password = ? WHERE id = ?', await hashPassword(checkPassword(next)), user.id);
  run('DELETE FROM sessions WHERE user_id = ?', user.id);
}
