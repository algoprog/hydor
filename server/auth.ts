import crypto from 'node:crypto';
import fs from 'node:fs';
import { drawCaptcha, sameCaptcha } from './captcha.ts';
import { paths } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';

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

/**
 * Wrong passwords are counted by the address they come from, over the last hour. From the third on, the sign-in page
 * asks for the characters in a picture as well (server/captcha.ts); the tenth stops sign-ins from that address for an
 * hour. Counted over every address, ten wrong passwords in an hour bring the picture to everyone, and sixty stop all
 * sign-ins until the hour is up. Reading a picture wrong costs no try; each picture is good for one, and an address
 * gets at most thirty pictures an hour.
 */
export const SIGN_IN_LIMITS = {
  hour: 3600_000,
  picture: 3,
  block: 10,
  allPicture: 10,
  allStop: 60,
  pictures: 30,
  pictureMs: 10 * 60_000,
};
const L = SIGN_IN_LIMITS;

/** Wrong passwords of the last hour (when each came), from anywhere and by address, with an address's pause. */
interface Tries {
  all: number[];
  by: Record<string, { fails: number[]; until: number }>;
}
const TRIES = 'auth:tries';

/** An open picture: its characters, and when it was made. */
interface Picture {
  id: string;
  text: string;
  at: number;
}

/**
 * The key wrong passwords are counted under: the address itself, or for IPv6 its first half (the /64 a home or a
 * phone is given), so a bot can't take a fresh address for every try.
 */
export function addressKey(ip: string): string {
  const s = String(ip ?? '').trim().toLowerCase().replace(/%.*$/, '');
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) return v4[1];
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(':')) return s || 'unknown';
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`;
}

/** Whether an address is this computer's or a private network's (Docker's, a home network, Tailscale's): where a proxy in front of the app connects from. */
function nearby(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '');
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(s);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  return s === '::1' || /^f[cd][0-9a-f]{2}:/.test(s) || /^fe[89ab][0-9a-f]:/.test(s);
}

/** An address as a forwarding header writes it, without brackets or a port; '' for anything else. */
function bareAddress(s: string): string {
  let t = s.trim();
  const v6 = /^\[([0-9a-fA-F:.]+)\](?::\d+)?$/.exec(t);
  if (v6) t = v6[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(t)) t = t.replace(/:\d+$/, '');
  return t.length <= 45 && /^[0-9a-fA-F:.]+$/.test(t) && /[.:]/.test(t) ? t : '';
}

/**
 * The address a request comes from, which wrong passwords are counted by. Through a proxy on this computer or a
 * private network (Cloudflare Tunnel, Tailscale, Caddy, Docker's own network) it is the visitor's, as the proxy added
 * it to X-Forwarded-For: the last address there that is not a private one of the proxies. Cloudflare's own
 * CF-Connecting-IP is that same address, and other proxies would let a visitor write it, so it is not read. From
 * anywhere else the header counts for nothing, so no one can name a new address for each try.
 */
export function clientAddress(peer: string, forwardedFor?: unknown): string {
  const p = String(peer ?? '').trim();
  if (!nearby(p)) return p || 'unknown';
  const chain = String(forwardedFor ?? '').split(',').map(bareAddress).filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) if (i === 0 || !nearby(chain[i])) return chain[i];
  return p;
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

/** The wrong passwords of the last hour. They live in the database, so a restart lifts no pause and the command line can clear them. */
function readTries(db: DB, now: number): Tries {
  let saved: any = {};
  try {
    saved = JSON.parse(kvGet(db, TRIES) ?? '{}');
  } catch {}
  const recent = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x): x is number => typeof x === 'number' && now - x < L.hour) : []);
  const by: Tries['by'] = {};
  for (const [key, a] of Object.entries<any>(saved?.by ?? {})) {
    const fails = recent(a?.fails);
    const until = typeof a?.until === 'number' && a.until > now ? a.until : 0;
    if (fails.length || until) by[key] = { fails, until };
  }
  return { all: recent(saved?.all), by };
}

/** An address paused for wrong links: what it is told. */
function linksPaused(ms: number) {
  const m = minutes(ms);
  return new HttpError(429, `Too many wrong links from this address. Try again in ${m} minute${m === 1 ? '' : 's'}.`);
}

/**
 * Links that stand in for the sign-in to one thing (a project shared with someone, server/spaces/share.ts) count a
 * token that opens nothing as a wrong password of the address it came from: the tenth in an hour pauses the address
 * for an hour, for links and sign-ins alike, as wrong passwords do. They are not counted over every address (a bot's
 * guesses could otherwise stop the owner's own sign-ins), and there is no picture to read on a link. A link that was
 * turned off, ran out or was made again is no guess: it is not counted.
 *
 * linkPause: the address's pause, if it has one (every link is refused while it lasts, right or wrong).
 * wrongLink: counts one; returns the pause it now has, if it has one.
 */
export function linkPause(db: DB, ip: string): HttpError | null {
  const now = Date.now();
  const a = readTries(db, now).by[addressKey(ip)];
  return a && a.until > now ? linksPaused(a.until - now) : null;
}

export function wrongLink(db: DB, ip: string): HttpError | null {
  const now = Date.now();
  const key = addressKey(ip);
  const t = readTries(db, now);
  const a = t.by[key] ?? { fails: [], until: 0 };
  if (a.until <= now) {
    a.fails.push(now);
    if (a.fails.length >= L.block) a.until = now + L.hour;
    t.by[key] = a;
    kvSet(db, TRIES, JSON.stringify(t));
  }
  return a.until > now ? linksPaused(a.until - now) : null;
}

/** An address's pause, as the sign-in page says it. */
function paused(ms: number) {
  const m = minutes(ms);
  return new HttpError(429, `Too many failed sign-ins from this address. Try again in ${m} minute${m === 1 ? '' : 's'}.`);
}
const stopped = () => new HttpError(429, 'Too many failed sign-ins. Try again later.');

export class AuthManager {
  /** The pictures given out, by address: those still open, and when each was made (for the hourly cap). In memory: after a restart the page just asks for a new one. */
  private pictures = new Map<string, { open: Picture[]; made: number[] }>();
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

  /** The wrong passwords of the last hour (readTries). */
  private tries(now: number): Tries {
    return readTries(this.db, now);
  }

  private owesPicture(t: Tries, key: string): boolean {
    return (t.by[key]?.fails.length ?? 0) >= L.picture || t.all.length >= L.allPicture;
  }

  /**
   * Before a password is checked: refuses while sign-ins are stopped, from everywhere or from this address, and when
   * the address owes the picture and has not read it right (that costs no try). Then counts the try as wrong until it
   * turns out right, so tries sent all at once can't slip past the limits while their passwords are checked. Returns
   * the try's time, for rightTry. The first-password setup passes no picture: its token can't be guessed.
   */
  beginTry(ip: string, picture: { id?: unknown; answer?: unknown } | null | undefined, needPicture = true): number {
    const now = Date.now();
    const key = addressKey(ip);
    const t = this.tries(now);
    if (t.all.length >= L.allStop) throw stopped();
    const a = t.by[key] ?? { fails: [], until: 0 };
    if (a.until > now) throw paused(a.until - now);
    if (needPicture && this.owesPicture(t, key)) this.readPicture(key, picture, now);
    a.fails.push(now);
    if (a.fails.length >= L.block) a.until = now + L.hour;
    t.by[key] = a;
    t.all.push(now);
    kvSet(this.db, TRIES, JSON.stringify(t));
    return now;
  }

  /** A right password: its address starts afresh. */
  rightTry(ip: string, at: number) {
    const key = addressKey(ip);
    const t = this.tries(Date.now());
    delete t.by[key];
    const i = t.all.indexOf(at);
    if (i >= 0) t.all.splice(i, 1);
    kvSet(this.db, TRIES, JSON.stringify(t));
    this.pictures.delete(key);
  }

  /** A wrong password (already counted by beginTry): throws what the sign-in page is told. */
  wrongTry(ip: string): never {
    const now = Date.now();
    const key = addressKey(ip);
    const t = this.tries(now);
    const a = t.by[key];
    if (a && a.until > now) throw paused(a.until - now);
    if (this.owesPicture(t, key)) throw new HttpError(401, 'Wrong password', { captcha: true, left: L.block - (a?.fails.length ?? 0) });
    throw new HttpError(401, 'Wrong password');
  }

  /** Lifts every pause and forgets the wrong passwords (the command line's set-password). */
  clearTries() {
    this.db.prepare('delete from kv where k = ?').run(TRIES);
  }

  /** Checks the characters read from a picture; each picture is good for one try. */
  private readPicture(key: string, given: { id?: unknown; answer?: unknown } | null | undefined, now: number) {
    const id = typeof given?.id === 'string' ? given.id : '';
    const answer = typeof given?.answer === 'string' ? given.answer : '';
    if (!id || !answer.trim()) throw new HttpError(401, 'Type the characters in the picture as well', { captcha: true });
    const p = this.pictures.get(key);
    const i = p ? p.open.findIndex((o) => o.id === id) : -1;
    const pic = i >= 0 ? p!.open.splice(i, 1)[0] : null;
    if (!pic || now - pic.at > L.pictureMs) throw new HttpError(401, 'That picture has expired. Here is a new one.', { captcha: true });
    if (!sameCaptcha(answer, pic.text)) throw new HttpError(401, 'The characters did not match the picture. Here is a new one.', { captcha: true });
  }

  /**
   * What the sign-in page shows besides the password: nothing, or a new picture when this address owes one. Refuses,
   * as a sign-in would, while sign-ins are stopped, so the page can say so before anyone types.
   */
  picture(ip: string): { needed: false } | { needed: true; id: string; image: string; left: number } {
    const now = Date.now();
    const key = addressKey(ip);
    const t = this.tries(now);
    if (t.all.length >= L.allStop) throw stopped();
    const a = t.by[key];
    if (a && a.until > now) throw paused(a.until - now);
    if (!this.owesPicture(t, key)) return { needed: false };
    for (const [k, q] of this.pictures) {
      q.made = q.made.filter((x) => now - x < L.hour);
      q.open = q.open.filter((o) => now - o.at < L.pictureMs);
      if (!q.made.length && !q.open.length) this.pictures.delete(k);
    }
    const p = this.pictures.get(key) ?? { open: [], made: [] };
    if (p.made.length >= L.pictures) {
      const m = minutes(p.made[0] + L.hour - now);
      throw new HttpError(429, `Too many new pictures from this address. Try again in ${m} minute${m === 1 ? '' : 's'}.`);
    }
    const { text, png } = drawCaptcha();
    const id = crypto.randomBytes(12).toString('base64url');
    p.open.push({ id, text, at: now });
    if (p.open.length > 3) p.open.shift();
    p.made.push(now);
    this.pictures.set(key, p);
    return { needed: true, id, image: `data:image/png;base64,${png.toString('base64')}`, left: L.block - (a?.fails.length ?? 0) };
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
    /** More fields for the reply, beside `error`. */
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
