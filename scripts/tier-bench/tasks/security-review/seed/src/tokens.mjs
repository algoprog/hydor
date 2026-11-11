// Session tokens: <base64url payload>.<base64url HMAC-SHA256 of the payload>, signed with a secret kept in the data folder.
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

export function issue(secret, user) {
  const payload = { user: user.name, exp: Date.now() + SESSION_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(secret, body)}`, expiresAt: new Date(payload.exp).toISOString() };
}

// Returns the payload of a token that is genuine and has not run out, or null.
export function verify(secret, token) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sign(secret, body).startsWith(sig)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== 'object') return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}
