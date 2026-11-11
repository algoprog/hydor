// Session tokens: <base64url payload>.<base64url HMAC-SHA256 of the payload>, signed with a secret kept in the data folder.
// The payload names a session kept in the data (sid), so a session can be ended before its time runs out.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_MS = 24 * 60 * 60 * 1000;

export function loadSecret(dir) {
  const file = path.join(dir, 'secret.key');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  return secret;
}

function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

// Starts a session for the user and answers its token.
export function issue(store, secret, user) {
  const now = Date.now();
  store.data.sessions = store.data.sessions.filter((s) => s.exp > now);
  const session = { id: crypto.randomBytes(16).toString('hex'), userId: user.id, exp: now + SESSION_MS };
  store.data.sessions.push(session);
  store.save();
  const body = Buffer.from(JSON.stringify({ sid: session.id, user: user.name, exp: session.exp })).toString('base64url');
  return { token: `${body}.${sign(secret, body)}`, expiresAt: new Date(session.exp).toISOString() };
}

// Returns the session of a token that is genuine, has not run out and has not been ended, or null.
export function verify(store, secret, token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== 'object' || typeof payload.sid !== 'string') return null;
  const session = store.data.sessions.find((s) => s.id === payload.sid);
  if (!session || !(session.exp > Date.now())) return null;
  return session;
}

export function revoke(store, sessionId) {
  store.data.sessions = store.data.sessions.filter((s) => s.id !== sessionId);
  store.save();
}

export function revokeAll(store, userId) {
  store.data.sessions = store.data.sessions.filter((s) => s.userId !== userId);
  store.save();
}
