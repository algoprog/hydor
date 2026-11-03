// http_request: an agent calls an API with a key from the vault and never sees the key. Public addresses
// only, checked as each connection is made (so a name cannot point somewhere else in between); the key
// goes only to the hosts it is allowed for and their subdomains, never along a redirect to another
// host; the answer comes back with known secrets masked by the caller. Keys the caller wrote into the
// request itself ({{NAME}} in the address, headers or body) follow the same rule, each its own hosts.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { domainAllowed } from '../../shared/connections.ts';
import { BlockedAddress, privateIp } from '../web/fetch.ts';

export interface HttpAuth {
  name: string;
  value: string;
  domains: string[];
  header?: string;
  prefix?: string;
  query?: string;
}

export interface HttpCall {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  auth?: HttpAuth;
  /** Keys already written into the address, headers or body: where each may go. */
  bound?: { name: string; domains: string[] }[];
}

export interface HttpResult {
  status: number;
  statusText: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  truncated: boolean;
  binary: boolean;
  /** Set when a redirect was not followed (it led where the key may not go). */
  stopped?: string;
}

export class RefusedRequest extends Error {}

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
/** Headers the request itself decides. */
const SKIP = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'expect']);
/** Headers worth showing an agent from an answer. */
const SHOW = /^(content-type|content-length|location|retry-after|link|etag|last-modified|www-authenticate|x-request-id|x-ratelimit-.*|ratelimit-.*)$/;

export const hostAllowed = (url: URL, key: Pick<HttpAuth, 'domains'>) => domainAllowed(url.hostname.replace(/^\[|\]$/g, ''), key.domains);

/**
 * privateIp, and the IPv6 spellings of IPv4 it misses: mapped addresses written in hex (::ffff:7f00:1,
 * as a parsed address writes them), IPv4-compatible ones (::7f00:1) and NAT64 (64:ff9b::/96).
 */
export function blockedIp(ip: string): boolean {
  const v = ip.toLowerCase();
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return privateIp(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
  }
  if (net.isIPv6(v) && !v.startsWith('::ffff:') && (/^::[0-9a-f.]/.test(v) || v.startsWith('64:ff9b:'))) return true;
  return privateIp(v);
}

/** A lookup that refuses names resolving to this machine or its network. */
function guardedLookup(allowPrivate: boolean, base: typeof dns.lookup = dns.lookup) {
  return ((hostname: string, options: any, cb: any) => {
    if (typeof options === 'function') (cb = options), (options = {});
    (base as any)(hostname, { ...options, all: true }, (err: Error | null, list: dns.LookupAddress[]) => {
      if (err) return cb(err);
      if (!list?.length) return cb(new BlockedAddress(`${hostname} does not resolve`));
      if (!allowPrivate && list.some((a) => blockedIp(a.address))) return cb(new BlockedAddress(`${hostname} is on this machine or its network`));
      if (options.all) cb(null, list);
      else cb(null, list[0].address, list[0].family);
    });
  }) as typeof dns.lookup;
}

function once(url: URL, o: { method: string; headers: Record<string, string>; body?: string; allowPrivate: boolean; lookup?: typeof dns.lookup; maxBytes: number; signal: AbortSignal }): Promise<{ status: number; statusText: string; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean; bytes: number }> {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !o.allowPrivate && blockedIp(host)) return reject(new BlockedAddress(`${host} is on this machine or its network`));
    if (!o.allowPrivate && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))) return reject(new BlockedAddress(`${host} is on this machine or its network`));
    const mod = url.protocol === 'https:' ? https : http;
    // A fresh connection each time (no pooled socket), so the address check always runs.
    const req = mod.request(url, { method: o.method, headers: o.headers, lookup: guardedLookup(o.allowPrivate, o.lookup), signal: o.signal, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (truncated) return;
        const have = size - c.length;
        if (size > o.maxBytes) {
          chunks.push(c.subarray(0, o.maxBytes - have));
          truncated = true;
          res.destroy();
          resolve({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? '', headers: res.headers, body: Buffer.concat(chunks), truncated, bytes: size });
        } else chunks.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? '', headers: res.headers, body: Buffer.concat(chunks), truncated, bytes: size }));
      res.on('error', (e) => (truncated ? undefined : reject(e)));
    });
    req.on('error', reject);
    if (o.body !== undefined && o.method !== 'GET' && o.method !== 'HEAD') req.write(o.body);
    req.end();
  });
}

/** Makes the request, following up to five redirects, the key only where it may go. */
export async function httpCall(c: HttpCall, o: { allowPrivate?: boolean; lookup?: typeof dns.lookup; maxBytes?: number; timeoutMs?: number } = {}): Promise<HttpResult> {
  let method = String(c.method || 'GET').toUpperCase();
  if (!METHODS.has(method)) throw new RefusedRequest(`method: one of ${[...METHODS].join(', ')}`);
  let url: URL;
  try {
    url = new URL(c.url);
  } catch {
    throw new RefusedRequest('url: a full http(s) address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new RefusedRequest('Only http and https addresses');
  if (url.username || url.password) throw new RefusedRequest('Put credentials in auth or basic_auth, not in the address');
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.headers ?? {})) {
    const name = String(k).trim();
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(name)) throw new RefusedRequest(`Bad header name: ${name.slice(0, 40)}`);
    if (SKIP.has(name.toLowerCase())) continue;
    const value = String(v ?? '');
    if (/[\r\n\0]/.test(value)) throw new RefusedRequest(`The ${name} header has a line break`);
    base[name] = value;
  }
  if (!Object.keys(base).some((k) => k.toLowerCase() === 'user-agent')) base['User-Agent'] = 'Hydor';
  const a = c.auth;
  // Every key the request carries, the signing one and those written into it.
  const keys = [...(a ? [a] : []), ...(c.bound ?? [])];
  for (const k of keys) {
    if (!k.domains.length) throw new RefusedRequest(`${k.name} has no hosts it may be sent to yet: the user can add them in Apps → Connected apps → Keys`);
    if (!hostAllowed(url, k)) throw new RefusedRequest(`${k.name} may only be sent to ${k.domains.join(', ')} (and their subdomains), not ${url.hostname}`);
    if (url.protocol !== 'https:' && !o.allowPrivate) throw new RefusedRequest(`${k.name} is only sent over https`);
  }
  const signal = AbortSignal.timeout(o.timeoutMs ?? 60_000);
  let body = c.body;
  for (let hop = 0; ; hop++) {
    const headers = { ...base };
    let target = url;
    const signed = !!a && hostAllowed(url, a);
    if (a && signed) {
      if (a.query) {
        target = new URL(url);
        target.searchParams.set(a.query, a.value);
      } else {
        const h = a.header || 'Authorization';
        for (const k of Object.keys(headers)) if (k.toLowerCase() === h.toLowerCase()) delete headers[k];
        headers[h] = `${a.prefix ?? (h.toLowerCase() === 'authorization' ? 'Bearer ' : '')}${a.value}`;
      }
    }
    if (body !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = /^\s*[[{]/.test(body) ? 'application/json' : 'text/plain; charset=utf-8';
    const r = await once(target, { method, headers, body, allowPrivate: !!o.allowPrivate, lookup: o.lookup, maxBytes: o.maxBytes ?? 2_000_000, signal });
    const loc = r.headers.location;
    if (r.status >= 300 && r.status < 400 && loc && hop < 5) {
      const next = new URL(String(loc), url);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return result(r, url, `it leads to a ${next.protocol} address`);
      // The key goes no further than the hosts it may go to; a key written into the request goes with it
      // (a 307 or 308 sends the body again), so it must be allowed there too.
      if (a && !hostAllowed(next, a)) return result(r, url, `it leads to ${next.hostname}, where ${a.name} may not go`);
      const out = c.bound?.find((k) => !hostAllowed(next, k));
      if (out) return result(r, url, `it leads to ${next.hostname}, where ${out.name} may not go`);
      if (keys.length && next.protocol !== 'https:' && !o.allowPrivate) return result(r, url, 'it leads to a plain http address');
      if (r.status === 303 || ((r.status === 301 || r.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      // Headers the person set for one host do not follow to another.
      if (next.host !== url.host) for (const k of Object.keys(base)) if (/^(authorization|cookie)$/i.test(k)) delete base[k];
      url = next;
      continue;
    }
    return result(r, url);
  }
}

function result(r: { status: number; statusText: string; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean; bytes: number }, url: URL, stopped?: string): HttpResult {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) if (SHOW.test(k) && v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
  const type = String(r.headers['content-type'] ?? '');
  const textual = !type || /^text\/|json|xml|javascript|x-www-form-urlencoded|graphql|yaml|csv/i.test(type);
  const out: HttpResult = { status: r.status, statusText: r.statusText, url: url.toString(), headers, body: textual ? r.body.toString('utf8') : '', bytes: r.bytes, truncated: r.truncated, binary: !textual };
  if (stopped) out.stopped = stopped;
  return out;
}
