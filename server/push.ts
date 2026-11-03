// Web Push to the devices that asked for it, so a phone or a closed tab still hears when a session
// finishes or needs you. Each message is encrypted for its browser (RFC 8291, aes128gcm) and signed
// with this server's VAPID key (RFC 8292); the push services that carry it cannot read it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.ts';

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

interface Sub {
  endpoint: string;
  p256dh: string;
  auth: string;
  origin: string;
}

/** The aes128gcm body for one browser: its public key `ua` and auth secret, a fresh key pair and salt per message. */
export function encryptPayload(payload: Buffer, ua: Buffer, authSecret: Buffer): Buffer {
  const ecdh = crypto.createECDH('prime256v1');
  const as = ecdh.generateKeys();
  const shared = ecdh.computeSecret(ua);
  const hmac = (key: Buffer, data: Buffer) => crypto.createHmac('sha256', key).update(data).digest();
  const one = Buffer.from([1]);
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ua, as, one]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), one])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), one])).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // One record: the payload, then the last-record delimiter.
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([as.length]), as, body]);
}

export class Push {
  private key: crypto.KeyObject;
  readonly publicKey: string;

  constructor(
    private readonly db: DB,
    dataDir: string,
  ) {
    db.exec(`create table if not exists push_subs (endpoint text primary key, p256dh text not null, auth text not null, origin text not null, ua text, created_at integer)`);
    const file = path.join(dataDir, 'vapid.pem');
    if (!fs.existsSync(file)) {
      const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    }
    this.key = crypto.createPrivateKey(fs.readFileSync(file));
    const jwk = crypto.createPublicKey(this.key).export({ format: 'jwk' });
    this.publicKey = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, 'base64url'), Buffer.from(jwk.y!, 'base64url')]));
  }

  subscribe(sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }, origin: string, ua: string) {
    const endpoint = String(sub?.endpoint ?? '');
    const p256dh = String(sub?.keys?.p256dh ?? '');
    const auth = String(sub?.keys?.auth ?? '');
    if (!/^https:\/\//.test(endpoint) || Buffer.from(p256dh, 'base64url').length !== 65 || Buffer.from(auth, 'base64url').length < 16) throw new Error('Not a push subscription');
    this.db
      .prepare(`insert into push_subs (endpoint, p256dh, auth, origin, ua, created_at) values (?, ?, ?, ?, ?, ?) on conflict(endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, origin = excluded.origin, ua = excluded.ua`)
      .run(endpoint, p256dh, auth, origin, ua.slice(0, 300), Date.now());
  }

  unsubscribe(endpoint: string) {
    this.db.prepare('delete from push_subs where endpoint = ?').run(endpoint);
  }

  has(endpoint: string): boolean {
    return !!this.db.prepare('select 1 from push_subs where endpoint = ?').get(endpoint);
  }

  /** A VAPID token for one push service; `sub` is the site the subscription came from. */
  private vapid(endpoint: string, sub: string): string {
    const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const claims = b64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub }));
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: this.key, dsaEncoding: 'ieee-p1363' });
    return `vapid t=${head}.${claims}.${b64url(sig)}, k=${this.publicKey}`;
  }

  /** Sends to every subscribed device; subscriptions the push service says are gone are forgotten. */
  async send(message: object): Promise<number> {
    const subs = this.db.prepare('select endpoint, p256dh, auth, origin from push_subs').all() as Sub[];
    const payload = Buffer.from(JSON.stringify(message));
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          const body = encryptPayload(payload, Buffer.from(s.p256dh, 'base64url'), Buffer.from(s.auth, 'base64url'));
          const sub = /^https:\/\//.test(s.origin) ? s.origin : 'mailto:hydor@localhost';
          const r = await fetch(s.endpoint, {
            method: 'POST',
            headers: { Authorization: this.vapid(s.endpoint, sub), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
            body: new Uint8Array(body),
            signal: AbortSignal.timeout(15_000),
          });
          if (r.status === 404 || r.status === 410) this.unsubscribe(s.endpoint);
          else if (r.ok) sent++;
          else console.error(`[push] ${new URL(s.endpoint).host} answered ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
        } catch (e) {
          console.error(`[push] ${(e as Error).message}`);
        }
      }),
    );
    return sent;
  }
}
