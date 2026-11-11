// Accounts: sign-up, log-in, profile, password, password reset and settings.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { sendMail } from './mail.mjs';
import { issue } from './tokens.mjs';
import { HttpError, deepMerge, isEmail } from './util.mjs';

const scrypt = promisify(crypto.scrypt);
const NAME = /^[a-z0-9_-]{3,32}$/;
const RESET_MS = 60 * 60 * 1000;

async function hashPassword(password, salt) {
  return (await scrypt(password, salt, 64)).toString('hex');
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'the password needs at least 8 characters');
}

async function newUser(store, { name, password, email, role }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await hashPassword(password, salt);
  if (store.userByName(name)) throw new HttpError(409, 'that name is taken');
  const user = {
    id: crypto.randomBytes(8).toString('hex'),
    name,
    displayName: name,
    email,
    salt,
    hash,
    createdAt: new Date().toISOString(),
    settings: {},
  };
  if (role) user.role = role;
  store.data.users.push(user);
  fs.mkdirSync(path.join(store.dir, 'files', name), { recursive: true });
  store.save();
  return user;
}

export async function signUp(store, body) {
  const { name, password, email } = body;
  if (typeof name !== 'string' || !NAME.test(name)) throw new HttpError(400, 'the name needs 3 to 32 lower-case letters, digits, _ or -');
  checkPassword(password);
  if (!isEmail(email)) throw new HttpError(400, 'that is not an e-mail address');
  return newUser(store, { name, password, email });
}

// Makes the admin account on the first start, when ADMIN_PASSWORD is set.
export async function ensureAdmin(store, password) {
  if (!password || store.userByName('admin')) return;
  await newUser(store, { name: 'admin', password, email: 'admin@localhost.local', role: 'admin' });
}

export async function logIn(store, secret, body) {
  const user = typeof body.name === 'string' ? store.userByName(body.name) : undefined;
  const given = typeof body.password === 'string' ? await hashPassword(body.password, user?.salt ?? 'none') : '';
  const ok = user && given.length === user.hash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(user.hash));
  if (!ok) throw new HttpError(401, 'wrong name or password');
  return issue(secret, user);
}

export function profile(user) {
  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    email: user.email,
    role: user.role ?? 'user',
    createdAt: user.createdAt,
  };
}

export function updateProfile(store, user, body) {
  if ('displayName' in body && (typeof body.displayName !== 'string' || body.displayName.length < 1 || body.displayName.length > 100)) {
    throw new HttpError(400, 'the display name needs 1 to 100 characters');
  }
  if ('email' in body && !isEmail(body.email)) throw new HttpError(400, 'that is not an e-mail address');
  Object.assign(user, body);
  store.save();
  return profile(user);
}

async function setPassword(store, user, password) {
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = await hashPassword(password, user.salt);
  store.save();
}

export async function changePassword(store, secret, user, body) {
  const current = typeof body.current === 'string' ? await hashPassword(body.current, user.salt) : '';
  if (current !== user.hash) throw new HttpError(401, 'the current password is wrong');
  checkPassword(body.password);
  await setPassword(store, user, body.password);
  return issue(secret, user);
}

// Sends the user a code to choose a new password. It answers the same whether or not the name exists.
export function requestReset(store, body) {
  const user = typeof body.name === 'string' ? store.userByName(body.name) : undefined;
  if (!user) return;
  const second = Math.floor(Date.now() / 1000);
  const code = crypto.createHash('sha256').update(`${user.name}:${second}`).digest('hex').slice(0, 32);
  user.reset = { code, expires: Date.now() + RESET_MS };
  store.save();
  sendMail(store, { to: user.email, name: user.name, code });
}

export async function confirmReset(store, body) {
  const user = typeof body.name === 'string' ? store.userByName(body.name) : undefined;
  if (!user || !user.reset || typeof body.code !== 'string' || user.reset.code !== body.code || user.reset.expires < Date.now()) {
    throw new HttpError(400, 'that code is wrong or has run out');
  }
  checkPassword(body.password);
  await setPassword(store, user, body.password);
  delete user.reset;
  store.save();
}

export function updateSettings(store, user, body) {
  deepMerge(user.settings, body);
  store.save();
  return user.settings;
}
