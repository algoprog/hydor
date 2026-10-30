// Signed, short-lived links. A sandboxed page (an HTML file shown as a page, a dev server preview) runs
// in an opaque origin, so the app's cookie never reaches the server from it; the link it was opened
// with is its permission instead: what it may read, and until when.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

let key: Buffer | null = null;

function secret(): Buffer {
  if (key) return key;
  const file = path.join(config.dataDir, 'links.key');
  try {
    key = fs.readFileSync(file);
  } catch {}
  if (!key || key.length < 32) {
    key = crypto.randomBytes(32);
    fs.writeFileSync(file, key, { mode: 0o600 });
  }
  return key;
}

/** HMAC of `body` with the app's link key, for other signed addresses (the MCP page server). */
export function signWithKey(body: string): string {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}

const mac = (body: string) => crypto.createHmac('sha256', secret()).update(body).digest('base64url').slice(0, 32);

/** A token carrying `payload` that stops working after `ttlMs`. */
export function signLink(payload: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, e: Date.now() + ttlMs })).toString('base64url');
  return `${body}.${mac(body)}`;
}

/** The payload of a token this server signed, if it is genuine and has not expired. */
export function readLink<T extends Record<string, unknown>>(token: string): T | null {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const want = mac(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof p.e === 'number' && p.e > Date.now() ? (p as T) : null;
  } catch {
    return null;
  }
}

/** The file `rest` names inside `dir`, or null when it would leave the folder. */
export function inside(dir: string, rest: string): string | null {
  const file = path.resolve(dir, rest);
  return file === dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep) ? file : null;
}
