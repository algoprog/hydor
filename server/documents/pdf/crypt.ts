// PDF encryption (the standard security handler) for files that open without a password: their user password is
// empty, as government forms often are, while an owner password limits what may be done. Revisions 2–4 (RC4 with 40
// to 128-bit keys, and AES-128) and 5–6 (AES-256) are worked out here from the file's /Encrypt dictionary and its
// first ID; strings and streams are decrypted as they are read, and what is added is encrypted the same way. A file
// that needs a password to open says so. Node's crypto does MD5, SHA-2 and AES; RC4 is written out here (OpenSSL 3
// keeps it out of the default provider).
import crypto from 'node:crypto';
import { Dict, isDict, isStr, type Obj, Ref, Str, Stream } from './objects.ts';

export class NeedsPassword extends Error {
  constructor() {
    super('This PDF is locked with a password: it cannot be opened without it. Ask whoever sent it for an unlocked copy, or for the password.');
  }
}

const PAD = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

const md5 = (...parts: Buffer[]) => crypto.createHash('md5').update(Buffer.concat(parts)).digest();

function aesDecrypt(key: Buffer, data: Buffer): Buffer {
  if (data.length < 32 || data.length % 16) {
    // Too short to hold an IV and a block: empty, as Acrobat reads it.
    return Buffer.alloc(0);
  }
  const d = crypto.createDecipheriv(key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc', key, data.subarray(0, 16));
  try {
    return Buffer.concat([d.update(data.subarray(16)), d.final()]);
  } catch {
    // Bad padding: keep the bytes without it.
    const raw = crypto.createDecipheriv(key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc', key, data.subarray(0, 16));
    raw.setAutoPadding(false);
    return Buffer.concat([raw.update(data.subarray(16)), raw.final()]);
  }
}

function aesEncrypt(key: Buffer, data: Buffer): Buffer {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv(key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc', key, iv);
  return Buffer.concat([iv, c.update(data), c.final()]);
}

type Method = 'none' | 'rc4' | 'aes';

/** What the file allows (its /P), for someone who opened it with the user password. */
export interface Permissions {
  print: boolean;
  modify: boolean;
  copy: boolean;
  annotate: boolean;
  fillForms: boolean;
  assemble: boolean;
}

export class Crypt {
  private constructor(
    private key: Buffer,
    private stm: Method,
    private str: Method,
    private embedded: Method,
    readonly v: number,
    readonly encryptMetadata: boolean,
    readonly p: number,
    readonly r: number,
  ) {}

  /** The handler for a file's /Encrypt dictionary, its user password taken as empty; throws NeedsPassword otherwise. */
  static open(enc: Dict, id0: Buffer, resolve: (o: Obj) => Obj): Crypt {
    const filter = resolve(enc.get('Filter') ?? null);
    if (filter !== 'Standard') throw new Error(`This PDF is encrypted with a security handler this app cannot open (${String(filter ?? 'none')}), such as a certificate's.`);
    const v = Number(resolve(enc.get('V') ?? 0));
    const r = Number(resolve(enc.get('R') ?? 2));
    const bytes = (k: string) => {
      const x = resolve(enc.get(k) ?? null);
      return isStr(x) ? x.bytes : Buffer.alloc(0);
    };
    const O = bytes('O');
    const U = bytes('U');
    const p = Number(resolve(enc.get('P') ?? -1)) | 0;
    const em = resolve(enc.get('EncryptMetadata') ?? true) !== false;

    // Which method strings and streams use: V 4 and 5 name crypt filters; earlier versions are RC4 throughout.
    let stm: Method = 'rc4';
    let str: Method = 'rc4';
    let length = v === 1 ? 40 : Number(resolve(enc.get('Length') ?? 40));
    if (v >= 4) {
      const cf = resolve(enc.get('CF') ?? null);
      const method = (name: Obj): Method => {
        if (name === 'Identity' || name === null) return 'none';
        const f = isDict(cf) ? resolve(cf.get(name as string) ?? null) : null;
        const cfm = isDict(f) ? resolve(f.get('CFM') ?? null) : null;
        if (isDict(f)) {
          const l = Number(resolve(f.get('Length') ?? 0));
          // Lengths come in bytes here, sometimes in bits.
          if (l) length = l <= 32 ? l * 8 : l;
        }
        return cfm === 'V2' ? 'rc4' : cfm === 'AESV2' || cfm === 'AESV3' ? 'aes' : 'none';
      };
      stm = method(resolve(enc.get('StmF') ?? 'Identity'));
      str = method(resolve(enc.get('StrF') ?? 'Identity'));
    }
    const eff = resolve(enc.get('EFF') ?? null);
    const embedded = v >= 4 && typeof eff === 'string' ? (eff === 'Identity' ? 'none' : stm) : stm;

    let key: Buffer;
    if (r >= 5) {
      key = Crypt.key256(r, U, bytes('UE'));
      length = 256;
    } else {
      const n = r === 2 ? 5 : Math.max(5, Math.min(16, Math.floor(length / 8)));
      const pb = Buffer.alloc(4);
      pb.writeInt32LE(p);
      let k = md5(PAD, O.subarray(0, 32), pb, id0, r >= 4 && !em ? Buffer.from([0xff, 0xff, 0xff, 0xff]) : Buffer.alloc(0)).subarray(0, n);
      if (r >= 3) for (let i = 0; i < 50; i++) k = md5(k.subarray(0, n)).subarray(0, n);
      key = Buffer.from(k);
      // The empty user password is right when it makes the file's /U.
      let ok: boolean;
      if (r === 2) ok = rc4(key, PAD).equals(U.subarray(0, 32));
      else {
        let x = rc4(key, md5(PAD, id0));
        for (let i = 1; i <= 19; i++) x = rc4(Buffer.from(key.map((b) => b ^ i)), x);
        ok = x.subarray(0, 16).equals(U.subarray(0, 16));
      }
      if (!ok) throw new NeedsPassword();
    }
    return new Crypt(key, stm, str, embedded, v, em, p, r);
  }

  /** AES-256's file key from the empty user password (revision 6 hashes in rounds; 5 once). */
  private static key256(r: number, U: Buffer, UE: Buffer): Buffer {
    const pw = Buffer.alloc(0);
    const hash = (salt: Buffer) =>
      r >= 6
        ? hash2B(pw, salt, Buffer.alloc(0))
        : crypto
            .createHash('sha256')
            .update(Buffer.concat([pw, salt]))
            .digest();
    if (!hash(U.subarray(32, 40)).equals(U.subarray(0, 32))) throw new NeedsPassword();
    const ik = hash(U.subarray(40, 48));
    const d = crypto.createDecipheriv('aes-256-cbc', ik, Buffer.alloc(16));
    d.setAutoPadding(false);
    return Buffer.concat([d.update(UE.subarray(0, 32)), d.final()]);
  }

  permissions(): Permissions {
    const bit = (n: number) => (this.p & (1 << (n - 1))) !== 0;
    return { print: bit(3), modify: bit(4), copy: bit(5), annotate: bit(6), fillForms: bit(9) || bit(6), assemble: this.r >= 3 ? bit(11) || bit(4) : bit(4) };
  }

  private objKey(num: number, gen: number, aes: boolean): Buffer {
    if (this.r >= 5) return this.key;
    const b = Buffer.alloc(5);
    b.writeUIntLE(num & 0xffffff, 0, 3);
    b.writeUInt16LE(gen & 0xffff, 3);
    const k = md5(this.key, b, aes ? Buffer.from('sAlT') : Buffer.alloc(0));
    return k.subarray(0, Math.min(this.key.length + 5, 16));
  }

  private run(m: Method, num: number, gen: number, data: Buffer, enc: boolean): Buffer {
    if (m === 'none') return data;
    const k = this.objKey(num, gen, m === 'aes');
    if (m === 'rc4') return rc4(k, data);
    return enc ? aesEncrypt(k, data) : aesDecrypt(k, data);
  }

  decryptString(b: Buffer, num: number, gen: number): Buffer {
    return this.run(this.str, num, gen, b, false);
  }
  decryptStream(s: Stream, num: number, gen: number): Buffer {
    return this.run(this.methodFor(s), num, gen, s.raw, false);
  }

  /** Streams that stay as they are: cross-reference streams, metadata when the file says so, Identity crypt filters. */
  private methodFor(s: Stream): Method {
    const type = s.dict.get('Type');
    if (type === 'XRef') return 'none';
    if (type === 'Metadata' && !this.encryptMetadata) return 'none';
    if (type === 'EmbeddedFile') return this.embedded;
    const f = s.dict.get('Filter');
    if (f === 'Crypt' || (Array.isArray(f) && f[0] === 'Crypt')) return 'none';
    return this.stm;
  }

  /** Decrypts an object read from the file in place (its strings, and its data if it is a stream). */
  decryptObject(o: Obj, num: number, gen: number): Obj {
    return this.walk(o, num, gen, false);
  }

  /** A copy of an object, encrypted for writing as object `num`. */
  encryptObject(o: Obj, num: number, gen: number): Obj {
    return this.walk(o, num, gen, true);
  }

  private walk(o: Obj, num: number, gen: number, enc: boolean): Obj {
    // A signature's /Contents is never encrypted (the signed bytes' digest is computed with it left out).
    const sig = (d: Dict) => d.get('Type') === 'Sig' || d.get('Type') === 'DocTimeStamp' || (d.has('ByteRange') && d.has('Contents') && d.has('Filter'));
    const go = (x: Obj): Obj => {
      if (x instanceof Str) return new Str(this.run(this.str, num, gen, x.bytes, enc), x.hex);
      if (Array.isArray(x)) return x.map(go);
      if (x instanceof Stream) {
        const d = go(x.dict) as Dict;
        return new Stream(d, this.run(this.methodFor(x), num, gen, x.raw, enc));
      }
      if (x instanceof Dict) {
        const keep = sig(x);
        const d = new Dict();
        for (const [k, v] of x) d.set(k, keep && k === 'Contents' ? v : go(v));
        return d;
      }
      return x;
    };
    return go(o);
  }
}

/** Algorithm 2.B (PDF 2.0): SHA-256, -384 and -512 in rounds, keyed by AES-128 of what came before. */
function hash2B(pw: Buffer, salt: Buffer, udata: Buffer): Buffer {
  let k = crypto
    .createHash('sha256')
    .update(Buffer.concat([pw, salt, udata]))
    .digest();
  for (let i = 0; ; i++) {
    const k1 = Buffer.concat(Array.from({ length: 64 }, () => Buffer.concat([pw, k, udata])));
    const c = crypto.createCipheriv('aes-128-cbc', k.subarray(0, 16), k.subarray(16, 32));
    c.setAutoPadding(false);
    const e = Buffer.concat([c.update(k1), c.final()]);
    let sum = 0;
    for (let j = 0; j < 16; j++) sum += e[j];
    const alg = ['sha256', 'sha384', 'sha512'][sum % 3];
    k = crypto.createHash(alg).update(e).digest();
    // Rounds go on past 64 until the last byte of E is at most the round's number less 32.
    if (i >= 63 && e[e.length - 1] <= i - 31) break;
  }
  return k.subarray(0, 32);
}

/** Whether a dictionary is an encryption dictionary's reference target: used to leave it unencrypted. */
export const isEncryptRef = (enc: Obj, r: Ref) => enc instanceof Ref && enc.num === r.num && enc.gen === r.gen;
