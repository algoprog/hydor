// Cookies and addresses, shared by the pages and the /api routes.
import { SESSION_DAYS } from './accounts.js';

const COOKIE = 'kestrel_session';
const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');

export function sessionToken(req) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

const isHttps = (req) => appUrl.startsWith('https:') || req.headers['x-forwarded-proto'] === 'https';
const cookieOptions = (req) => ({ httpOnly: true, sameSite: 'lax', path: '/', secure: isHttps(req) });

export function setSession(req, res, token) {
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_DAYS * 86400000 });
}

export function clearSession(req, res) {
  res.clearCookie(COOKIE, cookieOptions(req));
}

export const origin = (req) => appUrl || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
export const inviteLink = (req, token) => `${origin(req)}/invite/${token}`;

// A change sent by another website's page is turned away.
export function fromElsewhere(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return false;
  const sent = req.headers.origin;
  if (!sent) return req.headers['sec-fetch-site'] === 'cross-site';
  try {
    const url = new URL(sent);
    return url.host !== req.headers.host && !(appUrl && url.origin === new URL(appUrl).origin);
  } catch {
    return true;
  }
}
