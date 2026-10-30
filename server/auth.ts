import crypto from 'node:crypto';
import fs from 'node:fs';
import { paths } from './config.ts';
import type { DB } from './db.ts';

interface AuthFile {
  v: 1;
  salt: string;
  hash: string;
  N: number;
  r: number;
  p: number;
  keylen: number;
  createdAt: number;
}

const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64 };
const SESSION_TTL_MS = 30 * 24 * 3600_000;
export const SESSION_COOKIE = 'wa_session';
export const MIN_PASSWORD_LENGTH = 10;

function scrypt(password: string, salt: Buffer, p: { N: number; r: number; p: number; keylen: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, p.keylen, { N: p.N, r: p.r, p: p.p, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

interface Attempt {
  fails: number;
  first: number;
  lockedUntil: number;
}

export class AuthManager {
  private attempts = new Map<string, Attempt>();
  private globalFails: number[] = [];
  private lastSeenWrite = new Map<string, number>();

  constructor(private db: DB) {}

  isSetup(): boolean {
    return fs.existsSync(paths.auth);
  }

  /** Returns the one-time token needed to set the first password, creating it when missing. */
  setupToken(): string | null {
    if (this.isSetup()) return null;
    if (fs.existsSync(paths.setupToken)) return fs.readFileSync(paths.setupToken, 'utf8').trim();
    const token = crypto.randomBytes(18).toString('base64url');
    fs.writeFileSync(paths.setupToken, token + '\n', { mode: 0o600 });
    return token;
  }

  async setup(token: string, password: string): Promise<void> {
    if (this.isSetup()) throw new HttpError(409, 'Password is already set');
    const expected = this.setupToken();
    if (!expected || !safeEqual(String(token ?? '').trim(), expected)) throw new HttpError(403, 'Invalid setup token');
    await this.writePassword(password);
    fs.rmSync(paths.setupToken, { force: true });
  }

  private async writePassword(password: string) {
    validatePassword(password);
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, SCRYPT);
    const file: AuthFile = { v: 1, salt: salt.toString('base64'), hash: hash.toString('base64'), ...SCRYPT, createdAt: Date.now() };
    const tmp = paths.auth + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(file, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, paths.auth);
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (!this.isSetup()) return false;
    const file = JSON.parse(fs.readFileSync(paths.auth, 'utf8')) as AuthFile;
    const key = await scrypt(String(password ?? ''), Buffer.from(file.salt, 'base64'), file);
    const want = Buffer.from(file.hash, 'base64');
    return key.length === want.length && crypto.timingSafeEqual(key, want);
  }

  async changePassword(current: string, next: string, keepToken?: string) {
    if (!(await this.verifyPassword(current))) throw new HttpError(403, 'Current password is wrong');
    await this.writePassword(next);
    // Sign out every other browser.
    const keep = keepToken ? sha256(keepToken) : '';
    this.db.prepare('delete from auth_sessions where token_hash != ?').run(keep);
  }

  /** Throws when this client must wait before trying again. */
  checkRateLimit(ip: string) {
    const now = Date.now();
    this.globalFails = this.globalFails.filter((t) => now - t < 3600_000);
    if (this.globalFails.length >= 60) throw new HttpError(429, 'Too many failed logins. Try again later.');
    const a = this.attempts.get(ip);
    if (a && a.lockedUntil > now) {
      throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil((a.lockedUntil - now) / 1000)} s.`);
    }
  }

  recordFailure(ip: string) {
    const now = Date.now();
    this.globalFails.push(now);
    let a = this.attempts.get(ip);
    if (!a || now - a.first > 3600_000) a = { fails: 0, first: now, lockedUntil: 0 };
    a.fails += 1;
    // 3 free tries, then 30 s, 60 s, 2 min ... capped at 1 h.
    if (a.fails >= 3) a.lockedUntil = now + Math.min(3600_000, 15_000 * 2 ** (a.fails - 2));
    this.attempts.set(ip, a);
  }

  recordSuccess(ip: string) {
    this.attempts.delete(ip);
  }

  createSession(ip: string, ua: string): string {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db
      .prepare('insert into auth_sessions(token_hash, created_at, last_seen, expires_at, ip, ua) values (?, ?, ?, ?, ?, ?)')
      .run(sha256(token), now, now, now + SESSION_TTL_MS, ip, ua.slice(0, 300));
    this.db.prepare('delete from auth_sessions where expires_at < ?').run(now);
    return token;
  }

  validateSession(token: string | undefined): boolean {
    if (!token || token.length > 200 || !this.isSetup()) return false;
    const h = sha256(token);
    const row = this.db.prepare('select expires_at from auth_sessions where token_hash = ?').get(h) as
      | { expires_at: number }
      | undefined;
    const now = Date.now();
    if (!row || row.expires_at < now) return false;
    // Sliding expiry, written at most once a minute per session.
    if ((this.lastSeenWrite.get(h) ?? 0) < now - 60_000) {
      this.lastSeenWrite.set(h, now);
      this.db.prepare('update auth_sessions set last_seen = ?, expires_at = ? where token_hash = ?').run(now, now + SESSION_TTL_MS, h);
    }
    return true;
  }

  revokeSession(token: string | undefined) {
    if (token) this.db.prepare('delete from auth_sessions where token_hash = ?').run(sha256(token));
  }
}

export function validatePassword(password: string) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Use at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > 512) throw new HttpError(400, 'Password is too long');
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
